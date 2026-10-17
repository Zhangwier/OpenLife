/**
 * Bondage (债役) as an optional plugin of its own.
 *
 * Bondage is modelled seriously and never as a reward loop: it appears only
 * when the polity has adopted debt bondage and a debt defaults; bonded people
 * resent it, sometimes escape, and their hardship does not press their
 * holders to invent labour-saving things (tech reads `polity.labor`). Every
 * year the bonded endure adds to a sentiment against it; when that sentiment
 * is strong enough the village abolishes it and everyone is freed.
 *
 * Switch this plugin off and no path in the game makes anyone bonded.
 */
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "polity-bondage";
export const BONDAGE_LEDGER = "bondage:ledger";
export const BondageComponents = { status: "polity-bondage.status", ledger: "polity-bondage.ledger" } as const;

export interface BondStatus { bonded: boolean; holderId: string; since: number; cause: string }
export interface BondageLedger { sentiment: number; abolished: boolean; abolishedAt: number | null; everBonded: number; escapes: number }

export interface LaborApi {
  isCoerced(world: WorldView, personId: string): boolean;
  bonded(world: WorldView): string[];
  abolished(world: WorldView): boolean;
}

interface InstitutionsLike { has(w: WorldView, id: string): boolean }
interface FateLike { stir(w: WorldView, institutionId: string): number }

export const BondageTuning = { escapeChance: 0.08, sentimentPerBondedYear: 0.03, abolishAt: 1 } as const;

const ledger = (w: WorldView): BondageLedger =>
  (w.getComponent(BONDAGE_LEDGER, BondageComponents.ledger) as unknown as BondageLedger | undefined)
  ?? { sentiment: 0, abolished: false, abolishedAt: null, everBonded: 0, escapes: 0 };
const status = (w: WorldView, id: string): BondStatus | undefined => {
  const s = w.getComponent(id, BondageComponents.status) as unknown as BondStatus | undefined;
  return s?.bonded ? s : undefined;
};
const json = (x: unknown) => structuredClone(x) as Record<string, JsonValue>;

function bondedIds(w: WorldView, people: string[]): string[] {
  return people.filter((id) => status(w, id) && !w.getEntity(id)?.archivedAt);
}

export const polityBondageModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Debt bondage (optional)",
    description: "Defaulted debts may bind the debtor to the creditor; resentment, escape and abolition. Off means nobody is ever bonded.",
    requires: ["polity.institutions"],
    provides: ["polity.labor"],
    optional: ["fate.perturbation"],
    capabilities: ["component.register", "command.register", "rule.resolution.register", "rule.reaction.register", "projection.register"],
  },

  register(ctx) {
    const registry = ctx.registry;
    const polity = () => registry.capabilityImplementation("polity.institutions") as InstitutionsLike | undefined;
    const fate = () => registry.capabilityImplementation("fate.perturbation") as FateLike | undefined;
    const api: LaborApi = {
      isCoerced: (w, id) => !!status(w, id),
      bonded: (w) => w.listEntities().filter((e) => (e.components[BondageComponents.status] as { bonded?: boolean } | undefined)?.bonded && !e.archivedAt).map((e) => e.id).sort(),
      abolished: (w) => ledger(w).abolished,
    };
    ctx.provideCapability("polity.labor", api);

    ctx.registerComponent({ id: BondageComponents.status, persist: true, description: "This person is bonded to a holder." });
    ctx.registerComponent({ id: BondageComponents.ledger, persist: true, description: "Sentiment against bondage, escapes, abolition." });
    ctx.registerCommand({ type: "polity-bondage.year", description: "A year of bondage: escapes, growing sentiment, perhaps abolition.", params: { people: "living person ids" } });
    ctx.registerCommand({ type: "polity-bondage.free", description: "The actor (holder) frees the target." });

    const writeLedger = (w: WorldView, l: BondageLedger): Effect[] => w.hasEntity(BONDAGE_LEDGER)
      ? [{ kind: "setComponent", entityId: BONDAGE_LEDGER, component: BondageComponents.ledger, value: json(l) }]
      : [{ kind: "spawnEntity", localId: "ledger", id: BONDAGE_LEDGER, entityKind: "polity-bondage.ledger", components: { [BondageComponents.ledger]: json(l) } }];

    ctx.registerReactionRule({
      id: "polity-bondage.on_default",
      eventType: "polity.debt_defaulted",
      react: (c) => {
        const debtor = String(c.event.data.debtor ?? "");
        const creditor = String(c.event.data.creditor ?? "");
        const l = ledger(c.world);
        if (l.abolished || !polity()?.has(c.world, "institution:debt-bondage")) return [];
        if (!debtor || !c.world.hasEntity(debtor) || status(c.world, debtor)) return [];
        const s: BondStatus = { bonded: true, holderId: creditor, since: c.world.tick, cause: "debt" };
        return [
          { kind: "setComponent", entityId: debtor, component: BondageComponents.status, value: json(s), reason: "defaulted on a debt" },
          ...writeLedger(c.world, { ...l, everBonded: l.everBonded + 1 }),
          { kind: "emitEvent", eventType: "polity-bondage.bonded", actorId: creditor, targetId: debtor, data: { cause: "debt" }, historicalSignificance: 0.35 },
        ];
      },
    });

    ctx.registerResolutionRule({
      id: "polity-bondage.year.resolve",
      commandType: "polity-bondage.year",
      resolve: (c) => {
        const people = (c.command.payload.people ?? []) as string[];
        const l = { ...ledger(c.world) };
        const bonded = bondedIds(c.world, people);
        const effects: Effect[] = [];
        const free = (id: string, why: string) => effects.push(
          { kind: "setComponent", entityId: id, component: BondageComponents.status, value: json({ ...status(c.world, id)!, bonded: false }), reason: why },
          { kind: "emitEvent", eventType: "polity-bondage.freed", targetId: id, data: { why }, historicalSignificance: 0.25 });
        const escaped = new Set<string>();
        for (const id of bonded) {
          if (c.rng.chance(BondageTuning.escapeChance)) { l.escapes += 1; escaped.add(id); free(id, "escaped"); }
        }
        l.sentiment = Math.round((l.sentiment + bonded.length * BondageTuning.sentimentPerBondedYear * (fate()?.stir(c.world, "institution:abolition") ?? 1)) * 1000) / 1000;
        if (!l.abolished && l.sentiment >= BondageTuning.abolishAt) {
          l.abolished = true;
          l.abolishedAt = c.world.tick;
          for (const id of bonded) if (!escaped.has(id)) free(id, "abolished");
          effects.push({ kind: "emitEvent", eventType: "polity-bondage.abolished", data: { freed: bonded.length }, historicalSignificance: 0.5 });
        }
        return [...writeLedger(c.world, l), ...effects];
      },
    });

    ctx.registerResolutionRule({
      id: "polity-bondage.free.resolve",
      commandType: "polity-bondage.free",
      resolve: (c) => {
        const target = c.command.targetId ?? "";
        const s = status(c.world, target);
        if (!s || s.holderId !== c.command.actorId) return [];
        return [
          { kind: "setComponent", entityId: target, component: BondageComponents.status, value: json({ ...s, bonded: false }), reason: "freed by holder" },
          { kind: "emitEvent", eventType: "polity-bondage.freed", actorId: c.command.actorId, targetId: target, data: { why: "freed by holder" }, historicalSignificance: 0.25 },
        ];
      },
    });

    ctx.registerProjection({
      id: "polity-bondage.ledger",
      description: "Who is bonded, sentiment against it, abolition.",
      build: ({ world }) => ({ ...ledger(world), bonded: api.bonded(world) }),
    });
  },
};
