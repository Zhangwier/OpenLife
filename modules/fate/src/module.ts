/**
 * Fate (天命): small, logged nudges to the odds of history.
 *
 * A perturbation only changes probabilities or initial conditions, never an
 * outcome: a blessed birth is still a birth of these two parents (its alleles
 * are pushed to the tail of what was possible), an inspiration multiplies the
 * chance that someone thinks of something, an encounter lets villagers see a
 * thing made elsewhere, a stir makes an institution or a sentiment more
 * likely to take hold. Fate cannot hand out inventions, change minds or kill.
 *
 * Every nudge is a command, so it sits in the command log: the same seed and
 * the same commands, nudges included, give the same history, and removing the
 * nudges gives back the unperturbed one.
 *
 * Modes: observer (no nudges), nudge (a small budget of points, refilled each
 * time a new era is recognized), lab (unlimited; for design and content work).
 */
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "fate";
export const FATE_ENTITY = "fate:hand";
export const FateComponents = { state: "fate.state" } as const;

export type FateMode = "observer" | "nudge" | "lab";
interface Timed { until: number }
export interface FateState {
  mode: FateMode;
  points: number;
  perEra: number;
  births: Array<Timed & { id: string; traits: string[]; parentId: string }>;
  inspirations: Array<Timed & { targetId: string; factor: number }>;
  encounters: Array<Timed & { inventionId: string }>;
  stirs: Array<Timed & { institutionId: string; factor: number }>;
  log: Array<{ at: number; kind: string; detail: string; cost: number }>;
  seq: number;
}

export const FateCosts = { birthPerTrait: 2, inspire: 3, encounter: 2, stir: 2 } as const;

export interface FateApi {
  pendingBirth(world: WorldView, motherId: string, fatherId: string): { blessingId: string; traits: string[] } | undefined;
  inspiration(world: WorldView, targetId: string): number;
  encounters(world: WorldView): string[];
  stir(world: WorldView, institutionId: string): number;
  state(world: WorldView): FateState | undefined;
}

const read = (w: WorldView) => w.getComponent(FATE_ENTITY, FateComponents.state) as unknown as FateState | undefined;
const json = (x: unknown) => structuredClone(x) as Record<string, JsonValue>;
const YEAR = 360;

export const fateModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Fate: logged perturbations",
    description: "Nudge the odds of births, ideas, encounters and institutions; every nudge is a command, so history stays replayable.",
    provides: ["fate.perturbation"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "rule.reaction.register", "projection.register"],
  },

  register(ctx) {
    const api: FateApi = {
      pendingBirth(w, m, f) {
        const b = read(w)?.births.find((x) => x.until >= w.tick && (!x.parentId || x.parentId === m || x.parentId === f));
        return b ? { blessingId: b.id, traits: b.traits } : undefined;
      },
      inspiration: (w, id) => (read(w)?.inspirations ?? []).filter((x) => x.until >= w.tick && x.targetId === id).reduce((p, x) => p * x.factor, 1),
      encounters: (w) => (read(w)?.encounters ?? []).filter((x) => x.until >= w.tick).map((x) => x.inventionId),
      stir: (w, id) => (read(w)?.stirs ?? []).filter((x) => x.until >= w.tick && x.institutionId === id).reduce((p, x) => p * x.factor, 1),
      state: read,
    };
    ctx.provideCapability("fate.perturbation", api);
    ctx.registerComponent({ id: FateComponents.state, persist: true, description: "Fate mode, points, pending nudges and the log of every nudge." });

    ctx.registerCommand({ type: "fate.configure", description: "Choose observer | nudge | lab and the starting points.", params: { mode: "observer | nudge | lab", points: "number", perEra: "points per new era" } });
    ctx.registerCommand({ type: "fate.bless_birth", description: "The next child (of parentId, or anyone) gets these traits at the tail.", params: { traits: "trait ids", parentId: "optional", years: "window" } });
    ctx.registerCommand({ type: "fate.inspire", description: "Multiply the chance of an invention or theory for a while.", params: { targetId: "invention or theory id", factor: "1..10", years: "window" } });
    ctx.registerCommand({ type: "fate.encounter", description: "Villagers get to see an invention made elsewhere.", params: { inventionId: "id", years: "window" } });
    ctx.registerCommand({ type: "fate.stir", description: "Make an institution or sentiment more likely to take hold.", params: { institutionId: "id", factor: "1..10", years: "window" } });

    const cost = (type: string, p: Record<string, unknown>): number => {
      if (type === "fate.bless_birth") return FateCosts.birthPerTrait * ((p.traits as unknown[] | undefined)?.length ?? 0);
      if (type === "fate.inspire") return FateCosts.inspire;
      if (type === "fate.encounter") return FateCosts.encounter;
      return FateCosts.stir;
    };
    for (const type of ["fate.bless_birth", "fate.inspire", "fate.encounter", "fate.stir"]) {
      ctx.registerConstraintRule({
        id: `${type}.allowed`,
        commandType: type,
        evaluate: (c) => {
          const s = read(c.world);
          if (!s || s.mode === "observer") return { ok: false, code: "E_FATE_OFF", message: "fate is in observer mode" };
          const factor = Number(c.command.payload.factor ?? 2);
          if (!(factor >= 1 && factor <= 10)) return { ok: false, code: "E_FATE_FACTOR", message: "factor must be in [1, 10]" };
          if (type === "fate.bless_birth" && !((c.command.payload.traits as unknown[] | undefined)?.length)) return { ok: false, code: "E_FATE_TRAITS", message: "name at least one trait" };
          if (s.mode === "nudge" && cost(type, c.command.payload) > s.points) return { ok: false, code: "E_FATE_POINTS", message: `not enough fate points (${s.points})` };
          return { ok: true };
        },
      });
    }

    ctx.registerResolutionRule({
      id: "fate.configure.resolve",
      commandType: "fate.configure",
      resolve: (c) => {
        const mode = (["observer", "nudge", "lab"].includes(String(c.command.payload.mode)) ? c.command.payload.mode : "observer") as FateMode;
        const prev = read(c.world);
        const s: FateState = {
          ...(prev ?? { births: [], inspirations: [], encounters: [], stirs: [], log: [], seq: 0 }),
          mode, points: Number(c.command.payload.points ?? (mode === "nudge" ? 6 : 0)), perEra: Number(c.command.payload.perEra ?? 3),
        } as FateState;
        return prev
          ? [{ kind: "setComponent", entityId: FATE_ENTITY, component: FateComponents.state, value: json(s) }]
          : [{ kind: "spawnEntity", localId: "fate", id: FATE_ENTITY, entityKind: "fate.hand", components: { [FateComponents.state]: json(s) } }];
      },
    });

    ctx.registerResolutionRule({
      id: "fate.bless_birth.resolve",
      commandType: "fate.bless_birth",
      resolve: (c) => nudge(c.world, "fate.bless_birth", c.command.payload, cost),
    });
    for (const type of ["fate.inspire", "fate.encounter", "fate.stir"]) {
      ctx.registerResolutionRule({ id: `${type}.resolve`, commandType: type, resolve: (c) => nudge(c.world, type, c.command.payload, cost) });
    }

    ctx.registerReactionRule({
      id: "fate.consume_birth",
      eventType: "heredity.born",
      react: (c) => {
        const id = String(c.event.data.blessingId ?? "");
        const s = read(c.world);
        if (!id || !s) return [];
        return [{ kind: "setComponent", entityId: FATE_ENTITY, component: FateComponents.state, value: json({ ...s, births: s.births.filter((b) => b.id !== id) }), reason: "blessing used" }];
      },
    });
    ctx.registerReactionRule({
      id: "fate.refill_on_era",
      eventType: "era-ladder.recognized",
      react: (c) => {
        const s = read(c.world);
        if (!s || s.mode !== "nudge") return [];
        return [{ kind: "setComponent", entityId: FATE_ENTITY, component: FateComponents.state, value: json({ ...s, points: s.points + s.perEra }), reason: "a new era" }];
      },
    });

    ctx.registerProjection({ id: "fate.state", description: "Mode, points and the log of every nudge.", build: ({ world }) => ({ ...(read(world) ?? { mode: "observer" }) }) });
  },
};

function nudge(world: WorldView, type: string, p: Record<string, JsonValue>, cost: (t: string, p: Record<string, unknown>) => number): Effect[] {
  const s = structuredClone(read(world)!) as FateState;
  const until = world.tick + Math.max(1, Number(p.years ?? (type === "fate.bless_birth" ? 30 : 10))) * YEAR;
  const factor = Number(p.factor ?? 2);
  const price = s.mode === "lab" ? 0 : cost(type, p);
  s.seq += 1;
  let detail = "";
  if (type === "fate.bless_birth") {
    const traits = (p.traits as string[]).map(String);
    s.births.push({ id: `blessing-${s.seq}`, traits, parentId: String(p.parentId ?? ""), until });
    detail = `${traits.join(",")}${p.parentId ? ` @${String(p.parentId)}` : ""}`;
  } else if (type === "fate.inspire") {
    s.inspirations.push({ targetId: String(p.targetId), factor, until });
    detail = `${String(p.targetId)} x${factor}`;
  } else if (type === "fate.encounter") {
    s.encounters.push({ inventionId: String(p.inventionId), until });
    detail = String(p.inventionId);
  } else {
    s.stirs.push({ institutionId: String(p.institutionId), factor, until });
    detail = `${String(p.institutionId)} x${factor}`;
  }
  s.points -= price;
  s.log.push({ at: world.tick, kind: type, detail, cost: price });
  return [
    { kind: "setComponent", entityId: FATE_ENTITY, component: FateComponents.state, value: json(s), reason: type },
    { kind: "emitEvent", eventType: "fate.nudged", data: { kind: type, detail, cost: price }, historicalSignificance: 0.2 },
  ];
}
