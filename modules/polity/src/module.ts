/**
 * Polity (政治): who holds the surplus, who leads, who works for whom.
 *
 * Institutions are not unlocked; each is a data entry with conditions over the
 * village (population, years of surplus, capabilities from tech, customs from
 * theories, contacts with other settlements). While its conditions hold an
 * institution may be adopted (a yearly chance), and it may lapse once they
 * stop holding. Prestige comes from age and from inventions credited to a
 * person; the most respected adult leads once there is headship.
 *
 * Debts are recorded here. When a debt defaults, `polity.debt_defaulted` is
 * emitted; the separate polity-bondage plugin decides whether that makes the
 * debtor a bonded worker. Without that plugin nobody is ever bonded.
 */
import { readFileSync } from "node:fs";
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";

const OWNER = "polity";
export const POLITY_ENTITY = "polity:village";
export const PolityComponents = { state: "polity.state" } as const;

export interface InstitutionCondition {
  population?: number; surplusYears?: number; contacts?: number; defaults?: number;
  capabilities?: string[]; customs?: string[]; institutions?: string[];
  requiresCapability?: string; notAbolished?: boolean;
}
export interface InstitutionSpec { id: string; label: string; when: InstitutionCondition }
interface InstitutionData { adoptChance: number; lapseChance: number; institutions: InstitutionSpec[] }

export const INSTITUTIONS: InstitutionData = JSON.parse(readFileSync(new URL("../data/institutions.json", import.meta.url), "utf8")) as InstitutionData;

export interface Debt { creditor: string; debtor: string; amount: number; since: number }
export interface PolityState {
  institutions: Record<string, { since: number }>;
  prestige: Record<string, number>;
  headId: string | null;
  specialists: string[];
  debts: Debt[];
  defaults: number;
  surplusYears: number;
  contacts: number;
  population: number;
  /** Consecutive years an adopted institution's conditions have not held. */
  failing: Record<string, number>;
}

export interface PolityApi {
  has(world: WorldView, institutionId: string): boolean;
  list(world: WorldView): string[];
  head(world: WorldView): string | null;
  specialists(world: WorldView): string[];
  prestige(world: WorldView, personId: string): number;
  state(world: WorldView): PolityState | undefined;
}

interface TechLike { capabilities(w: WorldView): string[]; customs(w: WorldView): string[]; invented(w: WorldView): Record<string, { by: string }> }
interface LaborLike { abolished(w: WorldView): boolean }
interface FateLike { stir(w: WorldView, institutionId: string): number }
interface HeredityLike { ceiling(w: WorldView, id: string, trait: string): number }

const read = (world: WorldView) => world.getComponent(POLITY_ENTITY, PolityComponents.state) as unknown as PolityState | undefined;
const json = (x: unknown) => structuredClone(x) as Record<string, JsonValue>;

export const polityModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Polity: institutions, leadership and debt",
    description: "Data-driven institutions that appear when the village can sustain them, prestige and headship, specialists and debts.",
    provides: ["polity.institutions", "polity.authority"],
    optional: ["tech.invention", "polity.labor", "fate.perturbation", "life.heredity"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "projection.register"],
  },

  register(ctx) {
    const registry = ctx.registry;
    const tech = () => registry.capabilityImplementation("tech.invention") as TechLike | undefined;
    const labor = () => registry.capabilityImplementation("polity.labor") as LaborLike | undefined;
    const fate = () => registry.capabilityImplementation("fate.perturbation") as FateLike | undefined;
    const heredity = () => registry.capabilityImplementation("life.heredity") as HeredityLike | undefined;

    const api: PolityApi = {
      has: (w, id) => !!read(w)?.institutions[id],
      list: (w) => Object.keys(read(w)?.institutions ?? {}).sort(),
      head: (w) => read(w)?.headId ?? null,
      specialists: (w) => read(w)?.specialists ?? [],
      prestige: (w, id) => read(w)?.prestige[id] ?? 0,
      state: read,
    };
    ctx.provideCapability("polity.institutions", api);
    ctx.provideCapability("polity.authority", api);

    ctx.registerComponent({ id: PolityComponents.state, persist: true, description: "Institutions, prestige, headship, specialists and debts of one village." });
    ctx.registerCommand({ type: "polity.found", description: "Start tracking a village's polity." });
    ctx.registerCommand({ type: "polity.lend", description: "The actor lends grain to the target.", params: { amount: "number" } });
    ctx.registerCommand({ type: "polity.year", description: "A year passes (payload population, surplus, contacts, adults, gone).", params: {} });

    for (const t of ["polity.lend", "polity.year"]) {
      ctx.registerConstraintRule({ id: `${t}.founded`, commandType: t, evaluate: (c) => read(c.world) ? { ok: true } : { ok: false, code: "E_POLITY_NO_VILLAGE", message: "run polity.found first" } });
    }

    ctx.registerResolutionRule({
      id: "polity.found.resolve",
      commandType: "polity.found",
      resolve: (c) => {
        if (read(c.world)) return [];
        const s: PolityState = { institutions: {}, prestige: {}, headId: null, specialists: [], debts: [], defaults: 0, surplusYears: 0, contacts: 0, population: 0, failing: {} };
        return [{ kind: "spawnEntity", localId: "polity", id: POLITY_ENTITY, entityKind: "polity.village", components: { [PolityComponents.state]: json(s) } }];
      },
    });

    ctx.registerResolutionRule({
      id: "polity.lend.resolve",
      commandType: "polity.lend",
      resolve: (c) => {
        const s = read(c.world)!;
        const debt: Debt = { creditor: c.command.actorId ?? "", debtor: c.command.targetId ?? "", amount: Math.max(0, Number(c.command.payload.amount ?? 1)), since: c.world.tick };
        if (!debt.creditor || !debt.debtor || debt.creditor === debt.debtor) return [];
        return [{ kind: "setComponent", entityId: POLITY_ENTITY, component: PolityComponents.state, value: json({ ...s, debts: [...s.debts, debt] }), reason: "a loan" }];
      },
    });

    ctx.registerResolutionRule({
      id: "polity.year.resolve",
      commandType: "polity.year",
      resolve: (c) => {
        const s = structuredClone(read(c.world)!) as PolityState;
        const p = c.command.payload;
        const adults = ((p.adults ?? []) as Array<{ id: string; age: number }>);
        const gone = new Set((p.gone ?? []) as string[]);
        const surplus = Number(p.surplus ?? 0);
        s.population = Number(p.population ?? adults.length);
        s.contacts = Number(p.contacts ?? s.contacts);
        s.surplusYears = surplus > 0 ? s.surplusYears + 1 : 0;
        const effects: Effect[] = [];
        const emit = (eventType: string, data: Record<string, JsonValue>, significance = 0.2, actorId?: string, targetId?: string) =>
          effects.push({ kind: "emitEvent", eventType, data, historicalSignificance: significance, ...(actorId ? { actorId } : {}), ...(targetId ? { targetId } : {}) });

        // Prestige: age and inventions credited to a person.
        const credited: Record<string, number> = {};
        for (const rec of Object.values(tech()?.invented(c.world) ?? {})) credited[rec.by] = (credited[rec.by] ?? 0) + 1;
        s.prestige = {};
        for (const a of adults) s.prestige[a.id] = Math.round((Math.min(a.age, 60) / 10 + 3 * (credited[a.id] ?? 0)) * 100) / 100;

        // Debts: repaid in good years, defaulted after two bad ones; the dead take theirs along.
        const kept: Debt[] = [];
        for (const d of s.debts) {
          if (gone.has(d.debtor) || gone.has(d.creditor)) continue;
          const years = (c.world.tick - d.since) / 360;
          if (surplus > 0 && c.rng.chance(0.6)) continue;
          if (years >= 2 && c.rng.chance(0.5)) {
            s.defaults += 1;
            emit("polity.debt_defaulted", { creditor: d.creditor, debtor: d.debtor, amount: d.amount }, 0.15, d.creditor, d.debtor);
            continue;
          }
          kept.push(d);
        }
        s.debts = kept;

        // Institutions come and go with their conditions.
        const caps = new Set(tech()?.capabilities(c.world) ?? []);
        const customs = new Set(tech()?.customs(c.world) ?? []);
        const holds = (w: InstitutionCondition): boolean => {
          if (w.requiresCapability && !registry.capabilityImplementation(w.requiresCapability)) return false;
          if (w.notAbolished && labor()?.abolished(c.world)) return false;
          return s.population >= (w.population ?? 0) && s.surplusYears >= (w.surplusYears ?? 0) && s.contacts >= (w.contacts ?? 0)
            && s.defaults >= (w.defaults ?? 0)
            && (w.capabilities ?? []).every((x) => caps.has(x)) && (w.customs ?? []).every((x) => customs.has(x))
            && (w.institutions ?? []).every((x) => !!s.institutions[x]);
        };
        s.failing ??= {};
        for (const inst of INSTITUTIONS.institutions) {
          const ok = holds(inst.when);
          s.failing[inst.id] = ok || !s.institutions[inst.id] ? 0 : (s.failing[inst.id] ?? 0) + 1;
          if (!s.institutions[inst.id] && ok && c.rng.chance(Math.min(1, INSTITUTIONS.adoptChance * (fate()?.stir(c.world, inst.id) ?? 1)))) {
            s.institutions[inst.id] = { since: c.world.tick };
            emit("polity.institution_adopted", { institutionId: inst.id, label: inst.label }, 0.3);
          } else if (s.institutions[inst.id] && s.failing[inst.id]! >= 3 && c.rng.chance(INSTITUTIONS.lapseChance)) {
            delete s.institutions[inst.id];
            s.failing[inst.id] = 0;
            emit("polity.institution_lapsed", { institutionId: inst.id, label: inst.label }, 0.3);
          }
        }

        // Headship and specialists.
        const ranked = adults.filter((a) => a.age >= 25).sort((x, y) => (s.prestige[y.id] ?? 0) - (s.prestige[x.id] ?? 0) || x.id.localeCompare(y.id));
        const head = s.institutions["institution:headship"] ? ranked[0]?.id ?? null : null;
        if (head !== s.headId) {
          if (head) emit("polity.head_changed", { headId: head, previous: s.headId ?? "" }, 0.25, head);
          s.headId = head;
        }
        if (s.institutions["institution:specialist-crafts"]) {
          const slots = Math.max(0, Math.min(Math.floor(s.population / 6), Math.floor(surplus / 2)));
          const hands = heredity();
          s.specialists = adults.filter((a) => a.age >= 16 && a.age <= 60)
            .sort((x, y) => (hands?.ceiling(c.world, y.id, "trait:dexterity") ?? 0) - (hands?.ceiling(c.world, x.id, "trait:dexterity") ?? 0) || x.id.localeCompare(y.id))
            .slice(0, slots).map((a) => a.id);
        } else s.specialists = [];

        effects.unshift({ kind: "setComponent", entityId: POLITY_ENTITY, component: PolityComponents.state, value: json(s), reason: "a year passed" });
        return effects;
      },
    });

    ctx.registerProjection({
      id: "polity.village",
      description: "Institutions, headship, specialists and open debts.",
      build: ({ world }) => {
        const s = read(world);
        if (!s) return { founded: false };
        const label = (id: string) => INSTITUTIONS.institutions.find((i) => i.id === id)?.label ?? id;
        return { founded: true, institutions: Object.keys(s.institutions).sort().map((id) => ({ id, label: label(id), since: s.institutions[id]!.since })), headId: s.headId, specialists: s.specialists, debts: s.debts.length, defaults: s.defaults, surplusYears: s.surplusYears };
      },
    });
  },
};
