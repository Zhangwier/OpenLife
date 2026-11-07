/**
 * How ideas are born, tested, spread and lost. Pure functions over plain
 * state so the module file stays a thin command layer and the numbers can
 * be tuned and tested in isolation.
 *
 * The "natural selection" that moves technology is cultural: a useful
 * invention spreads by imitation and teaching, a theory that predicts well
 * gains believers, and anything nobody alive still knows is lost.
 */
import type { DeterministicRngLike } from "@openlife/contracts";
import type { InventionSpec, TechContent, TheorySpec } from "./content.ts";

export interface Mind {
  /** Invention id -> fidelity 0..1 of what this person knows how to do. */
  knows: Record<string, number>;
  /** Inventions this person is trying to make work. */
  ideas: Record<string, { since: number; failures: number }>;
  /** Theory id -> belief 0..1. */
  beliefs: Record<string, number>;
  /** Phenomenon id -> how many times this person noticed it. */
  observed: Record<string, number>;
  /** Theories this person once held and gave up on; they do not take them up again. */
  rejected: string[];
  gone: boolean;
}

export interface VillageTech {
  needs: Record<string, number>;
  observations: Record<string, number>;
  invented: Record<string, { by: string; at: number; times: number }>;
  lost: Record<string, { at: number }>;
  accepted: Record<string, { at: number }>;
  evidence: Record<string, { hits: number; misses: number }>;
  exposures: Record<string, number>;
  /** Theory id -> tick it was first voiced in this village. */
  proposed: Record<string, number>;
  baseCapabilities: string[];
}

export const emptyMind = (): Mind => ({ knows: {}, ideas: {}, beliefs: {}, observed: {}, rejected: [], gone: false });
export const emptyVillage = (): VillageTech => ({
  needs: {}, observations: {}, invented: {}, lost: {}, accepted: {}, evidence: {}, exposures: {}, proposed: {}, baseCapabilities: [],
});

export const TechTuning = {
  baseSpark: 0.0035,
  curiosity: 0.15,
  needScale: 4,
  maxNeedFactor: 3,
  principleBoost: 4,
  wrongPrincipleFactor: 0.6,
  contactBoost: 4,
  relearnBoost: 2,
  busyFactor: 0.3,
  theorizeChance: 0.1,
  giveUpAfter: 6,
  imitateChance: 0.05,
  adoptBeliefChance: 0.06,
  needDecay: 0.8,
  acceptShare: 0.5,
  acceptHits: 3,
  dropBelief: 0.15,
} as const;

/** What a season step needs to know about the world outside this module. */
export interface SeasonContext {
  tick: number;
  people: string[];
  busy: Set<string>;
  materials: Set<string>;
  capabilities: Set<string>;
  hasInstitution: (id: string) => boolean | undefined;
  aptitude: (personId: string, traitId: string) => number;
  inspire: (targetId: string) => number;
  /** How many minds can take part: the village plus the share of neighbours it trades with (LOD). */
  community: number;
}

export interface TechEvent { type: string; actorId?: string; data: Record<string, string | number | boolean> }

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function livingHolders(minds: Map<string, Mind>, inventionId: string): string[] {
  return [...minds].filter(([, m]) => !m.gone && (m.knows[inventionId] ?? 0) > 0).map(([id]) => id);
}

export function believersShare(minds: Map<string, Mind>, theoryId: string): number {
  const living = [...minds.values()].filter((m) => !m.gone);
  if (!living.length) return 0;
  return living.filter((m) => (m.beliefs[theoryId] ?? 0) >= 0.5).length / living.length;
}

function requirementsMet(inv: InventionSpec, mind: Mind, holders: Holders, ctx: SeasonContext): boolean {
  if (ctx.community < (inv.requires.community ?? 0)) return false;
  if (inv.requires.materials.some((m) => !ctx.materials.has(m))) return false;
  if (inv.requires.capabilities.some((c) => !ctx.capabilities.has(c))) return false;
  if (inv.requires.institutions.some((i) => ctx.hasInstitution(i) !== true)) return false;
  return inv.requires.inventions.every((r) => (mind.knows[r] ?? 0) > 0 || (holders.get(r)?.size ?? 0) > 0);
}

/** Living holders of every invention, kept current during a step. */
export type Holders = Map<string, Set<string>>;
export function holderIndex(minds: Map<string, Mind>): Holders {
  const out: Holders = new Map();
  for (const [id, m] of minds) {
    if (m.gone) continue;
    for (const [inv, f] of Object.entries(m.knows)) if (f > 0) (out.get(inv) ?? out.set(inv, new Set()).get(inv)!).add(id);
  }
  return out;
}
const hold = (h: Holders, inv: string, id: string) => (h.get(inv) ?? h.set(inv, new Set()).get(inv)!).add(id);

export function sparkChance(inv: InventionSpec, mind: Mind, personId: string, village: VillageTech, content: TechContent, ctx: SeasonContext): number {
  const need = inv.answers.reduce((s, n) => s + (village.needs[n] ?? 0), 0);
  const needFactor = need > 0 ? Math.min(TechTuning.maxNeedFactor, need / TechTuning.needScale) : TechTuning.curiosity;
  const ins = ctx.aptitude(personId, "trait:insight") / 100;
  const dex = ctx.aptitude(personId, "trait:dexterity") / 100;
  const apt = 0.4 + 1.2 * (ins * 0.6 + dex * 0.4);
  let principle = 1;
  if (inv.principles.some((p) => (mind.beliefs[p] ?? 0) >= 0.5)) principle = TechTuning.principleBoost;
  else if (inv.principles.some((p) => content.theories.find((t) => t.id === p)?.rivals.some((r) => (mind.beliefs[r] ?? 0) >= 0.5))) principle = TechTuning.wrongPrincipleFactor;
  const contact = (village.exposures[inv.id] ?? -1) >= ctx.tick ? TechTuning.contactBoost : 1;
  const relearn = village.lost[inv.id] ? TechTuning.relearnBoost : 1;
  const leisure = ctx.busy.has(personId) ? TechTuning.busyFactor : 1;
  const difficulty = 0.5 ** ((inv.difficulty - 20) / 15);
  return TechTuning.baseSpark * needFactor * apt * principle * contact * relearn * leisure * difficulty * ctx.inspire(inv.id);
}

function trialChance(inv: InventionSpec, mind: Mind, personId: string, ctx: SeasonContext): number {
  const dex = ctx.aptitude(personId, "trait:dexterity") / 100;
  const principle = inv.principles.some((p) => (mind.beliefs[p] ?? 0) >= 0.5) ? 1.4 : 1;
  return clamp01((0.2 + 0.6 * dex) * principle * (1 - inv.difficulty / 130));
}

function pickWeighted<T>(rng: DeterministicRngLike, items: Array<[T, number]>): T | undefined {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return undefined;
  let roll = rng.nextFloat() * total;
  for (const [item, w] of items) { roll -= w; if (roll <= 0) return item; }
  return items[items.length - 1]?.[0];
}

function theorize(rng: DeterministicRngLike, id: string, mind: Mind, village: VillageTech, content: TechContent, ctx: SeasonContext, events: TechEvent[]): void {
  const ins = ctx.aptitude(id, "trait:insight") / 100;
  for (const phen of Object.keys(mind.observed).sort()) {
    const explaining = content.theories.filter((t) => t.explains === phen);
    if (explaining.some((t) => (mind.beliefs[t.id] ?? 0) > 0)) continue;
    const ready = explaining.filter((t) => !mind.rejected.includes(t.id) && (mind.observed[phen] ?? 0) >= t.needsObservations);
    if (!ready.length) continue;
    const boost = Math.max(...ready.map((t) => ctx.inspire(t.id)));
    if (!rng.chance(clamp01(TechTuning.theorizeChance * (0.3 + 1.4 * ins) * boost))) continue;
    const theory = pickWeighted(rng, ready.map((t) => [t, ctx.inspire(t.id) / t.needsObservations] as [TheorySpec, number]));
    if (!theory) continue;
    mind.beliefs[theory.id] = 0.6;
    const first = village.proposed[theory.id] === undefined;
    if (first) village.proposed[theory.id] = ctx.tick;
    events.push({ type: "tech.theory_proposed", actorId: id, data: { theoryId: theory.id, phenomenonId: phen, first } });
    return;
  }
}

/** One season of thinking, trying, copying and believing for everyone listed. */
export function seasonStep(rng: DeterministicRngLike, minds: Map<string, Mind>, village: VillageTech, content: TechContent, ctx: SeasonContext): TechEvent[] {
  const events: TechEvent[] = [];
  const living = ctx.people.filter((id) => minds.has(id) && !minds.get(id)!.gone);
  const holders = holderIndex(minds);
  for (const id of living) {
    const mind = minds.get(id)!;
    mind.rejected ??= [];
    theorize(rng, id, mind, village, content, ctx, events);

    if (Object.keys(mind.ideas).length === 0) {
      for (const inv of content.inventions) {
        if ((mind.knows[inv.id] ?? 0) > 0 || (holders.get(inv.id)?.size ?? 0) > 0) continue;
        if (!requirementsMet(inv, mind, holders, ctx)) continue;
        if (rng.chance(clamp01(sparkChance(inv, mind, id, village, content, ctx)))) {
          mind.ideas[inv.id] = { since: ctx.tick, failures: 0 };
          events.push({ type: "tech.idea", actorId: id, data: { inventionId: inv.id } });
          break;
        }
      }
    }

    for (const invId of Object.keys(mind.ideas).sort()) {
      const inv = content.inventions.find((i) => i.id === invId);
      const idea = mind.ideas[invId]!;
      if (!inv) { delete mind.ideas[invId]; continue; }
      if ((holders.get(invId)?.size ?? 0) > 0) { delete mind.ideas[invId]; continue; }
      if (rng.chance(trialChance(inv, mind, id, ctx))) {
        delete mind.ideas[invId];
        mind.knows[invId] = 1;
        hold(holders, invId, id);
        const prev = village.invented[invId];
        village.invented[invId] = { by: id, at: ctx.tick, times: (prev?.times ?? 0) + 1 };
        const relearned = !!village.lost[invId];
        delete village.lost[invId];
        events.push({ type: "tech.invented", actorId: id, data: { inventionId: invId, relearned } });
      } else if (++idea.failures >= TechTuning.giveUpAfter) {
        delete mind.ideas[invId];
        events.push({ type: "tech.gave_up", actorId: id, data: { inventionId: invId } });
      }
    }

    const mem = ctx.aptitude(id, "trait:memory") / 100;
    for (const inv of content.inventions) {
      if ((mind.knows[inv.id] ?? 0) > 0) continue;
      const who = [...(holders.get(inv.id) ?? [])];
      if (!who.length) continue;
      if (!rng.chance(TechTuning.imitateChance * (0.5 + mem) * Math.min(3, who.length))) continue;
      const best = Math.max(...who.map((h) => minds.get(h)!.knows[inv.id] ?? 0));
      mind.knows[inv.id] = r3(Math.max(0.3, best * (0.6 + 0.3 * mem)));
      hold(holders, inv.id, id);
      events.push({ type: "tech.learned", actorId: id, data: { inventionId: inv.id, how: "imitation" } });
      break;
    }

    for (const phen of Object.keys(content.phenomena).sort()) {
      const explaining = content.theories.filter((t) => t.explains === phen);
      if (explaining.some((t) => (mind.beliefs[t.id] ?? 0) > 0)) continue;
      const votes = explaining.filter((t) => !mind.rejected.includes(t.id)).map((t) => [t, living.filter((o) => o !== id && (minds.get(o)!.beliefs[t.id] ?? 0) >= 0.5).length] as [TheorySpec, number]);
      const total = votes.reduce((s, [, n]) => s + n, 0);
      if (!total || !rng.chance(clamp01(TechTuning.adoptBeliefChance * Math.min(3, total)))) continue;
      const theory = pickWeighted(rng, votes);
      if (theory) mind.beliefs[theory.id] = 0.5;
    }
  }

  // Conformity: beliefs drift toward what most people around hold.
  for (const theory of content.theories) {
    const share = believersShare(minds, theory.id);
    if (share === 0) continue;
    for (const id of living) {
      const m = minds.get(id)!;
      if (m.beliefs[theory.id] !== undefined) m.beliefs[theory.id] = r3(clamp01(m.beliefs[theory.id]! + 0.04 * (share - 0.5)));
    }
  }
  for (const theory of content.theories) {
    const share = believersShare(minds, theory.id);
    const ev = village.evidence[theory.id] ?? { hits: 0, misses: 0 };
    if (!village.accepted[theory.id] && share >= TechTuning.acceptShare && ev.hits >= TechTuning.acceptHits) {
      village.accepted[theory.id] = { at: ctx.tick };
      events.push({ type: "tech.theory_accepted", data: { theoryId: theory.id, share: r3(share) } });
    } else if (village.accepted[theory.id] && share < TechTuning.acceptShare / 2) {
      delete village.accepted[theory.id];
      events.push({ type: "tech.theory_abandoned", data: { theoryId: theory.id } });
    }
  }
  for (const n of Object.keys(village.needs)) {
    village.needs[n] = r3(village.needs[n]! * TechTuning.needDecay);
    if (village.needs[n]! < 0.05) delete village.needs[n];
  }
  return events;
}

/** A phenomenon happened in front of these people: observations and, for theories that predict it, evidence. */
export function observeStep(
  rng: DeterministicRngLike, minds: Map<string, Mind>, village: VillageTech, content: TechContent,
  phenomenonId: string, observers: string[], perception: (id: string) => number, boost: number,
): TechEvent[] {
  const events: TechEvent[] = [];
  village.observations[phenomenonId] = (village.observations[phenomenonId] ?? 0) + 1;
  for (const id of observers) {
    const mind = minds.get(id);
    if (!mind || mind.gone) continue;
    if (rng.chance(clamp01((0.4 + 0.6 * perception(id) / 100) * boost))) mind.observed[phenomenonId] = (mind.observed[phenomenonId] ?? 0) + 1;
  }
  for (const theory of content.theories.filter((t) => (t.predicts ?? t.explains) === phenomenonId)) {
    const believers = [...minds.values()].filter((m) => !m.gone && (m.beliefs[theory.id] ?? 0) > 0);
    if (!believers.length) continue;
    // A theory that makes no explicit prediction is only put to the test now and then.
    const explicit = theory.predicts === phenomenonId;
    if (!explicit && !rng.chance(0.3)) continue;
    const hit = rng.chance(0.05 + 0.9 * theory.truth);
    const ev = village.evidence[theory.id] ?? { hits: 0, misses: 0 };
    village.evidence[theory.id] = hit ? { ...ev, hits: ev.hits + 1 } : { ...ev, misses: ev.misses + 1 };
    for (const m of believers) {
      const b = clamp01((m.beliefs[theory.id] ?? 0) + (hit ? 0.1 : explicit ? -0.15 : -0.08));
      if (b < TechTuning.dropBelief) { delete m.beliefs[theory.id]; m.rejected = [...(m.rejected ?? []), theory.id]; } else m.beliefs[theory.id] = r3(b);
    }
    events.push({ type: hit ? "tech.prediction_hit" : "tech.prediction_missed", data: { theoryId: theory.id, phenomenonId } });
  }
  return events;
}

/** Someone died or left: whatever only they knew is lost. */
export function goneStep(minds: Map<string, Mind>, village: VillageTech, personId: string, tick: number): TechEvent[] {
  const mind = minds.get(personId);
  if (!mind || mind.gone) return [];
  mind.gone = true;
  mind.ideas = {};
  const events: TechEvent[] = [];
  const holders = holderIndex(minds);
  for (const invId of Object.keys(mind.knows).sort()) {
    if ((holders.get(invId)?.size ?? 0) === 0) {
      village.lost[invId] = { at: tick };
      events.push({ type: "tech.lost", actorId: personId, data: { inventionId: invId } });
    }
  }
  return events;
}
