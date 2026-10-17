/**
 * Era ladder (时代识别): recognizes, never unlocks.
 *
 * It only reads tech capabilities, polity institutions and bondage, plus the
 * numbers the caller reports (population, contacts, largest settlement), and
 * writes nothing but its own record. Switching it off changes nothing else in
 * the world, which tests/unit/era-progression.test.ts checks.
 */
import { readFileSync } from "node:fs";
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "era-ladder";
export const ERA_ENTITY = "era:ladder";
export const EraComponents = { state: "era-ladder.state" } as const;

export interface EraCondition {
  population?: number; contacts?: number; largestSettlement?: number; surplusYears?: number; bonded?: number;
  capabilities?: string[]; institutions?: string[]; customs?: string[];
}
export interface EraSpec { id: string; label: string; rank: number; when: EraCondition }
interface EraData { sustain: number; eras: EraSpec[]; features: Array<{ id: string; label: string; when: EraCondition }> }

export const ERAS: EraData = JSON.parse(readFileSync(new URL("../data/eras.json", import.meta.url), "utf8")) as EraData;

export interface EraState {
  current: string;
  since: number;
  streak: Record<string, number>;
  /** Consecutive checks the current era's conditions have not held. */
  missing: number;
  features: string[];
  chronicle: Array<{ at: number; eraId: string; label: string; direction: "up" | "down" }>;
}

interface TechLike { capabilities(w: WorldView): string[]; customs(w: WorldView): string[] }
interface PolityLike { list(w: WorldView): string[]; state(w: WorldView): { surplusYears: number } | undefined }
interface LaborLike { bonded(w: WorldView): string[] }

export interface EraSnapshot {
  population: number; contacts: number; largestSettlement: number; surplusYears: number; bonded: number;
  capabilities: Set<string>; institutions: Set<string>; customs: Set<string>;
}

export function conditionHolds(w: EraCondition, s: EraSnapshot): boolean {
  return s.population >= (w.population ?? 0) && s.contacts >= (w.contacts ?? 0)
    && s.largestSettlement >= (w.largestSettlement ?? 0) && s.surplusYears >= (w.surplusYears ?? 0) && s.bonded >= (w.bonded ?? 0)
    && (w.capabilities ?? []).every((x) => s.capabilities.has(x)) && (w.institutions ?? []).every((x) => s.institutions.has(x))
    && (w.customs ?? []).every((x) => s.customs.has(x));
}

const read = (w: WorldView) => w.getComponent(ERA_ENTITY, EraComponents.state) as unknown as EraState | undefined;

export const eraLadderModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Era ladder",
    description: "Recognizes which era a world is in from tech, polity and population; can regress; never unlocks anything.",
    provides: ["era.current"],
    optional: ["tech.invention", "polity.institutions", "polity.labor"],
    capabilities: ["component.register", "command.register", "rule.resolution.register", "projection.register"],
  },

  register(ctx) {
    const registry = ctx.registry;
    ctx.provideCapability("era.current", { current: (w: WorldView) => read(w)?.current ?? ERAS.eras[0]!.id });
    ctx.registerComponent({ id: EraComponents.state, persist: true, description: "The recognized era, streaks toward others, and the era chronicle." });
    ctx.registerCommand({ type: "era-ladder.check", description: "Re-evaluate the era (payload population, contacts, largestSettlement).", params: {} });

    ctx.registerResolutionRule({
      id: "era-ladder.check.resolve",
      commandType: "era-ladder.check",
      resolve: (c) => {
        const tech = registry.capabilityImplementation("tech.invention") as TechLike | undefined;
        const polity = registry.capabilityImplementation("polity.institutions") as PolityLike | undefined;
        const labor = registry.capabilityImplementation("polity.labor") as LaborLike | undefined;
        const p = c.command.payload;
        const snap: EraSnapshot = {
          population: Number(p.population ?? 0), contacts: Number(p.contacts ?? 0),
          largestSettlement: Math.max(Number(p.largestSettlement ?? 0), Number(p.population ?? 0)),
          surplusYears: polity?.state(c.world)?.surplusYears ?? 0, bonded: labor?.bonded(c.world).length ?? 0,
          capabilities: new Set(tech?.capabilities(c.world) ?? []), institutions: new Set(polity?.list(c.world) ?? []),
          customs: new Set(tech?.customs(c.world) ?? []),
        };
        const prev = read(c.world);
        const s: EraState = prev ? structuredClone(prev) as EraState
          : { current: ERAS.eras[0]!.id, since: c.world.tick, streak: {}, missing: 0, features: [], chronicle: [] };
        const holding = ERAS.eras.filter((e) => conditionHolds(e.when, snap));
        for (const e of ERAS.eras) s.streak[e.id] = holding.includes(e) ? (s.streak[e.id] ?? 0) + 1 : 0;
        const sustained = holding.filter((e) => s.streak[e.id]! >= ERAS.sustain || e.rank === 0).sort((a, b) => b.rank - a.rank)[0]!;
        const current = ERAS.eras.find((e) => e.id === s.current)!;
        const stillHolds = (s.streak[current.id] ?? 0) > 0 || current.rank === 0;
        s.missing = stillHolds ? 0 : (s.missing ?? 0) + 1;
        const lostLong = s.missing >= ERAS.sustain;
        let next = current;
        if (sustained.rank > current.rank) next = sustained;
        else if (lostLong) next = sustained;
        const effects: Effect[] = [];
        if (next.id !== current.id) {
          const direction = next.rank > current.rank ? "up" : "down";
          s.current = next.id;
          s.since = c.world.tick;
          s.missing = 0;
          s.chronicle.push({ at: c.world.tick, eraId: next.id, label: next.label, direction });
          effects.push({ kind: "emitEvent", eventType: direction === "up" ? "era-ladder.recognized" : "era-ladder.regressed", data: { eraId: next.id, label: next.label, from: current.id }, historicalSignificance: 0.6 });
        }
        s.features = ERAS.features.filter((f) => conditionHolds(f.when, snap)).map((f) => f.id);
        const value = structuredClone(s) as unknown as Record<string, JsonValue>;
        effects.unshift(prev
          ? { kind: "setComponent", entityId: ERA_ENTITY, component: EraComponents.state, value }
          : { kind: "spawnEntity", localId: "era", id: ERA_ENTITY, entityKind: "era-ladder.state", components: { [EraComponents.state]: value } });
        return effects;
      },
    });

    ctx.registerProjection({
      id: "era-ladder.state",
      description: "The recognized era, features, and the chronicle of era changes.",
      build: ({ world }) => {
        const s = read(world);
        const label = (id: string) => ERAS.eras.find((e) => e.id === id)?.label ?? ERAS.features.find((f) => f.id === id)?.label ?? id;
        return s ? { current: s.current, label: label(s.current), since: s.since, features: s.features.map(label), chronicle: s.chronicle }
          : { current: ERAS.eras[0]!.id, label: ERAS.eras[0]!.label, features: [], chronicle: [] };
      },
    });
  },
};
