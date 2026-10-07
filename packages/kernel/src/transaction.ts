/**
 * Kernel - Transaction / Effect application (§INV-001, §88).
 *
 * This is the only place in the entire system that mutates world state.
 * It consumes declarative Effects and produces Events. Reaction rules are then
 * evaluated on those events, which can produce more Effects - bounded by
 * maxDepth, maxEventsPerTransaction and per-signature repetition limits so an
 * A -> B -> C -> A cycle cannot run forever.
 */

import type {
  ComponentData,
  Effect,
  EntityId,
  EventId,
  JsonValue,
  WorldEvent,
} from "@openlife/contracts";
import { ErrorCode, OpenLifeErrorException, fail } from "@openlife/contracts";
import type { DecisionTrace, TaggedEffect } from "@openlife/rule-engine";
import { reactionSetFor, runReactions } from "@openlife/rule-engine";
import type { WorldStore } from "@openlife/world-model";
import { StoreBackedWorldView } from "@openlife/world-model";
import type { EventLog } from "./event-log.ts";
import type { FactStore } from "./facts.ts";
import type { Scheduler } from "./scheduler.ts";
import type { DeterministicRng } from "./rng.ts";
import type { DefinitionSet } from "@openlife/rule-engine";

export interface TransactionConfig {
  maxDepth: number;
  maxEventsPerTransaction: number;
  /** How often the same event signature may repeat inside one transaction. */
  maxRepeatsPerSignature: number;
}

export const DEFAULT_TRANSACTION_CONFIG: TransactionConfig = {
  maxDepth: 8,
  maxEventsPerTransaction: 512,
  maxRepeatsPerSignature: 3,
};

export interface TransactionContext {
  tick: number;
  commandId?: string;
  transactionId?: string;
  /** Default actor for emitted events when the effect does not set one. */
  actorId?: EntityId;
  /** Events that caused the current effect batch (causal graph edges). */
  causeEventIds?: EventId[];
  trace: DecisionTrace;
}

export interface TransactionDeps {
  store: WorldStore;
  eventLog: EventLog;
  scheduler: Scheduler;
  facts: FactStore;
  definitions: DefinitionSet;
  rng: DeterministicRng;
  config?: Partial<TransactionConfig>;
}

interface TxnState {
  localIds: Map<string, EntityId>;
  signatures: Map<string, number>;
  eventBudget: number;
}

export class TransactionEngine {
  readonly #deps: TransactionDeps;
  readonly #config: TransactionConfig;

  constructor(deps: TransactionDeps) {
    this.#deps = deps;
    this.#config = { ...DEFAULT_TRANSACTION_CONFIG, ...deps.config };
  }

  /**
   * Applies a batch of effects and runs the reaction cascade.
   * Returns every event emitted, in commit order.
   */
  applyEffects(effects: TaggedEffect[], ctx: TransactionContext): WorldEvent[] {
    const checkpoint = {
      store: this.#deps.store.serialize(),
      eventLog: this.#deps.eventLog.serialize(),
      scheduler: this.#deps.scheduler.serialize(),
      facts: this.#deps.facts.serialize(),
    };
    const state: TxnState = {
      localIds: new Map(),
      signatures: new Map(),
      eventBudget: this.#config.maxEventsPerTransaction,
    };
    try {
      const emitted = this.#applyBatch(effects, ctx, state);
      this.#cascade(emitted, ctx, state);
      return emitted;
    } catch (error) {
      // A transaction is all-or-nothing. Reactions may fail after earlier
      // effects have already touched the store, journal, scheduler or facts.
      this.#deps.store.restore(checkpoint.store);
      this.#deps.eventLog.restore(checkpoint.eventLog);
      this.#deps.scheduler.restore(checkpoint.scheduler);
      this.#deps.facts.restore(checkpoint.facts);
      throw error;
    }
  }

  /** Applies effects without running reactions (used by the cascade). */
  #applyBatch(effects: TaggedEffect[], ctx: TransactionContext, state: TxnState): WorldEvent[] {
    const emitted: WorldEvent[] = [];
    for (const tagged of effects) {
      emitted.push(...this.#applyOne(tagged, ctx, state));
    }
    return emitted;
  }

  #cascade(seed: WorldEvent[], ctx: TransactionContext, state: TxnState): void {
    let frontier = seed;
    for (let depth = 0; depth < this.#config.maxDepth; depth += 1) {
      const next: WorldEvent[] = [];
      for (const event of frontier) {
        const rules = reactionSetFor(this.#deps.definitions, event.type);
        if (rules.length === 0) continue;
        const view = new StoreBackedWorldView(this.#deps.store, () => ctx.tick);
        const result = runReactions(rules, event, view, this.#deps.rng, ctx.trace.notes);
        if (result.effects.length === 0) continue;
        const produced = this.#applyBatch(result.effects, { ...ctx, causeEventIds: [event.id] }, state);
        next.push(...produced);
      }
      if (next.length === 0) return;
      frontier = next;
    }
    if (frontier.length > 0) {
      fail(
        ErrorCode.EventStorm,
        `reaction cascade exceeded maxDepth=${this.#config.maxDepth}`,
        { maxDepth: this.#config.maxDepth, pending: frontier.length },
      );
    }
  }

  #applyOne(tagged: TaggedEffect, ctx: TransactionContext, state: TxnState): WorldEvent[] {
    const { effect, owner } = tagged;
    switch (effect.kind) {
      case "setComponent": {
        const id = this.#ref(effect.entityId, state);
        this.#deps.store.setComponent(id, effect.component, effect.value);
        return [];
      }
      case "modifyComponent": {
        const id = this.#ref(effect.entityId, state);
        this.#deps.store.mergeComponent(id, effect.component, effect.patch);
        return [];
      }
      case "spawnEntity": {
        const namespace = effect.entityKind.split(".")[0] ?? "core";
        const id = effect.id ?? this.#deps.store.nextEntityId(namespace);
        if (effect.id && this.#deps.store.hasEntity(effect.id)) {
          fail(ErrorCode.UnknownEntity, `entity id already in use: ${effect.id}`, { id: effect.id });
        }
        state.localIds.set(effect.localId, id);
        this.#deps.store.createEntity({
          id,
          kind: effect.entityKind,
          components: cloneComponents(effect.components),
          createdAt: ctx.tick,
        });
        if (effect.announce === false) return [];
        return asEvents(
          this.#emit(
            {
              type: "core.entity_spawned",
              actorId: id,
              data: { entityKind: effect.entityKind, localId: effect.localId },
              historicalSignificance: 0.15,
            },
            ctx,
            owner,
            state,
          ),
        );
      }
      case "archiveEntity": {
        const id = this.#ref(effect.entityId, state);
        const entity = this.#deps.store.getEntity(id);
        this.#deps.store.archiveEntity(id, ctx.tick, effect.reason);
        if (effect.announce === false) return [];
        return asEvents(
          this.#emit(
            {
              type: "core.entity_archived",
              actorId: id,
              data: { entityKind: entity?.kind ?? "unknown", reason: effect.reason },
              historicalSignificance: 0.3,
            },
            ctx,
            owner,
            state,
          ),
        );
      }
      case "addRelation": {
        const from = this.#ref(effect.from, state);
        const to = this.#ref(effect.to, state);
        const id = this.#deps.store.nextRelationId();
        this.#deps.store.addRelation({
          id,
          type: effect.type,
          from,
          to,
          components: cloneComponents(effect.components ?? {}),
          createdAt: ctx.tick,
        });
        if (effect.announce === false) return [];
        return asEvents(
          this.#emit(
            {
              type: "core.relation_added",
              actorId: from,
              targetId: to,
              data: { relationType: effect.type },
              historicalSignificance: 0.05,
            },
            ctx,
            owner,
            state,
          ),
        );
      }
      case "removeRelation": {
        const from = this.#ref(effect.from, state);
        const to = this.#ref(effect.to, state);
        const relation = this.#deps.store.getRelation(effect.type, from, to);
        if (!relation) {
          fail(ErrorCode.UnknownRelation, `relation not found: ${effect.type}`, {
            type: effect.type,
            from,
            to,
          });
        }
        this.#deps.store.archiveRelation(relation.id, ctx.tick, effect.reason);
        if (effect.announce === false) return [];
        return asEvents(
          this.#emit(
            {
              type: "core.relation_removed",
              actorId: from,
              targetId: to,
              data: { relationType: effect.type, reason: effect.reason },
              historicalSignificance: 0.1,
            },
            ctx,
            owner,
            state,
          ),
        );
      }
      case "addFact": {
        this.#deps.facts.add({
          factType: effect.factType,
          subject: this.#ref(effect.subject, state),
          ...(effect.object !== undefined ? { object: this.#ref(effect.object, state) } : {}),
          ...(effect.data !== undefined ? { data: effect.data } : {}),
          at: ctx.tick,
          visibility: effect.visibility ?? "private",
          historicalSignificance: effect.historicalSignificance ?? 0.1,
          owner,
        });
        return [];
      }
      case "scheduleTask": {
        const dueAt = effect.at ?? ctx.tick + (effect.afterTicks ?? 0);
        this.#deps.scheduler.schedule({
          type: effect.taskType,
          dueAt,
          payload: effect.payload ?? {},
          owner,
          ...(effect.everyTicks !== undefined ? { everyTicks: effect.everyTicks } : {}),
          ...(effect.untilTick !== undefined ? { untilTick: effect.untilTick } : {}),
          ...(effect.dedupeKey ? { dedupeKey: effect.dedupeKey } : {}),
        });
        return [];
      }
      case "emitEvent": {
        return asEvents(
          this.#emit(
            {
              type: effect.eventType,
              ...(effect.actorId !== undefined ? { actorId: this.#ref(effect.actorId, state) } : {}),
              ...(effect.targetId !== undefined ? { targetId: this.#ref(effect.targetId, state) } : {}),
              data: effect.data ?? {},
              historicalSignificance: effect.historicalSignificance ?? 0.1,
              visibility: effect.visibility ?? "public",
              ...(effect.dedupeKey ? { dedupeKey: effect.dedupeKey } : {}),
            },
            ctx,
            owner,
            state,
          ),
        );
      }
      default: {
        const unknown = effect as Effect;
        fail(ErrorCode.Internal, `unsupported effect kind: ${JSON.stringify(unknown)}`);
      }
    }
  }

  #emit(
    input: {
      type: string;
      actorId?: EntityId;
      targetId?: EntityId;
      data: Record<string, JsonValue>;
      historicalSignificance: number;
      visibility?: "public" | "private" | "secret";
      dedupeKey?: string;
    },
    ctx: TransactionContext,
    owner: string,
    state: TxnState,
  ): WorldEvent | undefined {
    const actorId = input.actorId ?? ctx.actorId;
    const signature = `${input.type}|${actorId ?? ""}|${input.targetId ?? ""}|${input.dedupeKey ?? ""}|${JSON.stringify(input.data)}`;
    const seen = (state.signatures.get(signature) ?? 0) + 1;
    state.signatures.set(signature, seen);
    if (seen > this.#config.maxRepeatsPerSignature) {
      ctx.trace.notes.push({
        message: `suppressed repeated event (${input.type}) to prevent a reaction cycle`,
        data: { signature, seen, limit: this.#config.maxRepeatsPerSignature },
      });
      return undefined;
    }
    if (state.eventBudget <= 0) {
      fail(
        ErrorCode.EventStorm,
        `transaction exceeded maxEventsPerTransaction=${this.#config.maxEventsPerTransaction}`,
      );
    }
    state.eventBudget -= 1;
    const event = this.#deps.eventLog.append({
      type: input.type,
      at: ctx.tick,
      ...(actorId !== undefined ? { actorId } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      data: input.data,
      causedBy: [...(ctx.causeEventIds ?? [])],
      ...(ctx.commandId ? { commandId: ctx.commandId } : {}),
      ...(ctx.transactionId ? { transactionId: ctx.transactionId } : {}),
      historicalSignificance: input.historicalSignificance,
      visibility: input.visibility ?? "public",
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      owner,
    });
    return event;
  }

  #ref(id: string, state: TxnState): EntityId {
    // `@alias` refers to an entity spawned earlier in this same transaction.
    if (id.startsWith("@")) {
      const mapped = state.localIds.get(id.slice(1));
      if (mapped) return mapped;
      fail(ErrorCode.UnknownEntity, `unresolved local entity reference: ${id}`, { id });
    }
    const mapped = state.localIds.get(id);
    if (mapped) return mapped;
    if (!this.#deps.store.hasEntity(id)) {
      fail(ErrorCode.UnknownEntity, `unknown entity: ${id}`, { id });
    }
    return id;
  }
}

function asEvents(event: WorldEvent | undefined): WorldEvent[] {
  return event ? [event] : [];
}

function cloneComponents(
  components: Record<string, ComponentData>,
): Record<string, ComponentData> {
  const out: Record<string, ComponentData> = {};
  for (const [key, value] of Object.entries(components)) {
    out[key] = { ...value };
  }
  return out;
}

export function assertTransactionSafe(effect: Effect): void {
  if (typeof effect !== "object" || effect === null || !("kind" in effect)) {
    throw new OpenLifeErrorException(ErrorCode.Internal, "effect must have a kind");
  }
}
