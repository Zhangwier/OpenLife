/**
 * History Runtime (§31-§39).
 *
 * History is a derived view over the event journal plus a set of durable
 * records. Nothing here mutates the world: the runtime observes committed
 * events and decides which of them become public history.
 *
 * Two rules matter for the architecture:
 *   - not every event becomes history; significance decides (§32);
 *   - a record survives archival of its subject entity (§INV-006, §39), which
 *     is what lets a later generation learn "my ancestor founded this company"
 *     after the company has been dissolved.
 */

import type {
  CausalExplanation,
  EntityId,
  EventId,
  HistoricalRecord,
  HistoryView,
  LineageId,
  LineageState,
  LineageView,
  WorldEvent,
} from "@openlife/contracts";
import { HistorySemanticEvents } from "@openlife/contracts";
import type { EventLog } from "@openlife/kernel";
import type { WorldStore } from "@openlife/world-model";

export interface HistoryRuntimeOptions {
  eventLog: EventLog;
  store: WorldStore;
  /** Minimum significance for an event to become a historical record. */
  significanceThreshold?: number;
}

export interface HistoryState {
  records: HistoricalRecord[];
  recordSeq: number;
  lineages: LineageState[];
  lineageSeq: number;
  /** Causal edges (cause -> effect), derived from event.causedBy. */
  edges: { cause: EventId; effect: EventId }[];
}

const DEFAULT_THRESHOLD = 0.25;

export class HistoryRuntime {
  #eventLog: EventLog;
  #store: WorldStore;
  #threshold: number;
  #records: HistoricalRecord[] = [];
  #recordSeq = 0;
  #lineages = new Map<LineageId, LineageState>();
  #lineageSeq = 0;
  /** Highest event seq already folded, so sync() stays idempotent. */
  #foldedThroughSeq = 0;

  constructor(options: HistoryRuntimeOptions) {
    this.#eventLog = options.eventLog;
    this.#store = options.store;
    this.#threshold = options.significanceThreshold ?? DEFAULT_THRESHOLD;
  }

  /** Folds newly committed events into durable historical records. */
  sync(): HistoricalRecord[] {
    const created: HistoricalRecord[] = [];
    for (const event of this.#eventLog.since(this.#foldedThroughSeq)) {
      this.#foldedThroughSeq = event.seq;
      this.#foldLineageEvent(event);
      if (event.historicalSignificance < this.#threshold) continue;
      const record = this.#toRecord(event);
      this.#records.push(record);
      created.push(record);
    }
    return created;
  }

  get records(): readonly HistoricalRecord[] {
    return this.#records;
  }

  listRecords(filter: { entityId?: string; minSignificance?: number } = {}): HistoricalRecord[] {
    return this.#records.filter((record) => {
      if (filter.entityId && record.subjectId !== filter.entityId) return false;
      if (filter.minSignificance !== undefined && record.significance < filter.minSignificance) {
        return false;
      }
      return true;
    });
  }

  /**
   * Marks records whose subject entity is archived. The record itself is kept:
   * disappearance of an entity must not erase history (§INV-006).
   */
  reconcileArchivedSubjects(): number {
    let updated = 0;
    for (const record of this.#records) {
      if (!record.subjectId || record.subjectArchived) continue;
      const entity = this.#store.getEntity(record.subjectId);
      if (entity?.archivedAt !== undefined) {
        record.subjectArchived = true;
        updated += 1;
      }
    }
    return updated;
  }

  explain(eventId: EventId, depth = 6): CausalExplanation | undefined {
    const event = this.#eventLog.get(eventId);
    if (!event) return undefined;
    return this.#explain(event, depth, new Set());
  }

  #explain(event: WorldEvent, depth: number, seen: Set<string>): CausalExplanation {
    const causes: CausalExplanation[] = [];
    if (depth > 0) {
      for (const causeId of event.causedBy) {
        if (seen.has(causeId)) continue;
        seen.add(causeId);
        const cause = this.#eventLog.get(causeId);
        if (cause) causes.push(this.#explain(cause, depth - 1, seen));
      }
      // A root event can be produced directly by a command and therefore have
      // no event-to-event cause edge. Expose the command itself as the causal
      // root so "why did this happen?" never loses the initiating action.
      if (causes.length === 0 && event.commandId) {
        causes.push({
          kind: "command",
          type: "command",
          at: event.at,
          summary: `command ${event.commandId}`,
          commandId: event.commandId,
          causes: [],
          consequences: [{ eventId: event.id, type: event.type, at: event.at, summary: summarize(event) }],
        });
      }
    }
    const consequences = this.#eventLog
      .all()
      .filter((candidate) => candidate.causedBy.includes(event.id))
      .map((candidate) => ({
        eventId: candidate.id,
        type: candidate.type,
        at: candidate.at,
        summary: summarize(candidate),
      }));
    return {
      kind: "event",
      eventId: event.id,
      type: event.type,
      at: event.at,
      summary: summarize(event),
      ...(event.commandId ? { commandId: event.commandId } : {}),
      causes,
      consequences,
    };
  }

  createLineage(id: LineageId, founderId?: EntityId, at = 0): LineageState {
    if (this.#lineages.has(id)) {
      throw new Error(`lineage already exists: ${id}`);
    }
    const lineage: LineageState = {
      id,
      ...(founderId ? { founderId } : {}),
      members: [],
      records: [],
      createdAt: at,
    };
    this.#lineages.set(id, lineage);
    this.#lineageSeq += 1;
    return lineage;
  }

  addLineageMember(
    lineageId: LineageId,
    member: { characterId: EntityId; generation: number; bornAt: number },
  ): void {
    const lineage = this.#requireLineage(lineageId);
    lineage.members.push(member);
  }

  markLineageMemberDied(lineageId: LineageId, characterId: EntityId, diedAt: number): void {
    const lineage = this.#requireLineage(lineageId);
    const member = lineage.members.find((candidate) => candidate.characterId === characterId);
    if (member) member.diedAt = diedAt;
  }

  /**
   * Copies records whose subject is a lineage member into the lineage
   * chronicle. The chronicle is what later generations read, and it outlives
   * the characters themselves.
   */
  syncLineageRecords(lineageId: LineageId): HistoricalRecord[] {
    const lineage = this.#requireLineage(lineageId);
    const memberIds = new Set(lineage.members.map((member) => member.characterId));
    const linked: HistoricalRecord[] = [];
    for (const record of this.#records) {
      if (lineage.records.includes(record.id)) continue;
      if (record.subjectId === undefined || !memberIds.has(record.subjectId)) continue;
      lineage.records.push(record.id);
      linked.push(record);
    }
    return linked;
  }

  /** Records attached to any member of the lineage, newest last. */
  lineageChronicle(lineageId: LineageId): HistoricalRecord[] {
    const lineage = this.#lineages.get(lineageId);
    if (!lineage) return [];
    return lineage.records
      .map((recordId) => this.#records.find((record) => record.id === recordId))
      .filter((record): record is HistoricalRecord => record !== undefined);
  }

  lineage(lineageId: LineageId): LineageView | undefined {
    const lineage = this.#lineages.get(lineageId);
    if (!lineage) return undefined;
    return {
      id: lineage.id,
      ...(lineage.founderId ? { founderId: lineage.founderId } : {}),
      members: lineage.members.map((member) => ({
        characterId: member.characterId,
        generation: member.generation,
        alive: member.diedAt === undefined,
      })),
      records: this.lineageChronicle(lineageId),
    };
  }

  listLineages(): LineageState[] {
    return [...this.#lineages.values()];
  }

  view(): HistoryView {
    return {
      listEvents: (filter) => this.#eventLog.list(filter ?? {}),
      listRecords: (filter) => this.listRecords(filter ?? {}),
      explain: (eventId) => this.explain(eventId),
      lineage: (lineageId) => this.lineage(lineageId),
    };
  }

  serialize(): HistoryState {
    return {
      records: this.#records.map((record) => ({ ...record })),
      recordSeq: this.#recordSeq,
      lineages: [...this.#lineages.values()].map(cloneLineage),
      lineageSeq: this.#lineageSeq,
      edges: this.#eventLog
        .all()
        .flatMap((event) => event.causedBy.map((cause) => ({ cause, effect: event.id }))),
    };
  }

  static deserialize(state: HistoryState, options: HistoryRuntimeOptions): HistoryRuntime {
    const runtime = new HistoryRuntime(options);
    runtime.#records = state.records.map((record) => ({ ...record }));
    runtime.#recordSeq = state.recordSeq;
    runtime.#lineageSeq = state.lineageSeq;
    for (const lineage of state.lineages) {
      runtime.#lineages.set(lineage.id, cloneLineage(lineage));
    }
    // Invariant: `state.records` already covers every journal event up to the
    // highest seq, because the simulation syncs before saving. Marking the
    // journal as folded is therefore safe and keeps load idempotent.
    runtime.#foldedThroughSeq = options.eventLog
      .all()
      .reduce((max, event) => Math.max(max, event.seq), 0);
    return runtime;
  }

  #foldLineageEvent(event: WorldEvent): void {
    if (event.type !== HistorySemanticEvents.LineageMemberAdded) return;
    const lineageId = String(event.data.lineageId ?? "");
    const characterId = String(event.data.characterId ?? event.actorId ?? "");
    if (!lineageId || !characterId) return;
    const generation = Number(event.data.generation ?? 1);
    const bornAt = Number(event.data.bornAt ?? event.at);

    let lineage = this.#lineages.get(lineageId);
    if (!lineage) {
      lineage = {
        id: lineageId,
        founderId: characterId,
        members: [],
        records: [],
        createdAt: event.at,
      };
      this.#lineages.set(lineageId, lineage);
      this.#lineageSeq += 1;
    }
    if (!lineage.members.some((member) => member.characterId === characterId)) {
      lineage.members.push({ characterId, generation, bornAt });
    }
    this.syncLineageRecords(lineageId);
  }

  #toRecord(event: WorldEvent): HistoricalRecord {
    this.#recordSeq += 1;
    return {
      id: `record:${this.#recordSeq}`,
      eventId: event.id,
      type: event.type,
      at: event.at,
      ...(event.actorId !== undefined ? { subjectId: event.actorId } : {}),
      summary: summarize(event),
      significance: event.historicalSignificance,
      ...(event.owner ? { owner: event.owner } : {}),
    };
  }

  #requireLineage(id: LineageId): LineageState {
    const lineage = this.#lineages.get(id);
    if (!lineage) throw new Error(`unknown lineage: ${id}`);
    return lineage;
  }
}

export function summarize(event: WorldEvent): string {
  const parts = [event.type];
  if (event.actorId) parts.push(`actor=${event.actorId}`);
  if (event.targetId) parts.push(`target=${event.targetId}`);
  const dataKeys = Object.keys(event.data);
  if (dataKeys.length > 0) parts.push(`data={${dataKeys.join(",")}}`);
  return parts.join(" ");
}

function cloneLineage(lineage: LineageState): LineageState {
  return {
    ...lineage,
    members: lineage.members.map((member) => ({ ...member })),
    records: [...lineage.records],
  };
}
