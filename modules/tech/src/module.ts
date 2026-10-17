/**
 * Tech (科技): the need ledger, inventions and village learning.
 *
 * - Needs pile up when people are repeatedly held back (`tech.report_need`).
 *   They raise the odds that someone thinks of an invention that answers them,
 *   and `tech.needs_report` lists the needs nothing in the graph answers yet:
 *   that list is what the next content update should write.
 * - Phenomena seen often enough make people propose theories. Theories can be
 *   wrong; predictions turn into evidence, beliefs spread, and a theory most
 *   people hold becomes accepted (or, if wrong, merely customary).
 * - Inventions belong to people. They spread by imitation and teaching and are
 *   lost when the last person who knew them is gone.
 *
 * Reads, when installed: life.heredity (aptitude ceilings), fate.perturbation
 * (inspiration, encounters), polity.institutions, polity.labor (coerced
 * people's hardship does not press their holders to invent).
 */
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { loadBaseTechContent, validateTechContent, type TechContent } from "./content.ts";
import {
  emptyMind, emptyVillage, believersShare, goneStep, livingHolders, observeStep, seasonStep,
  type Mind, type TechEvent, type VillageTech,
} from "./engine.ts";

const OWNER = "tech";
export const TECH_CAPABILITY = "tech.invention";
export const TECH_VILLAGE = "tech:village";
export const TechComponents = { village: "tech.village", mind: "tech.mind" } as const;

interface VillageRecord extends VillageTech { members: string[] }

export interface TechApi {
  content(): TechContent;
  capabilities(world: WorldView): string[];
  /** Product of every known invention's and accepted theory's effect on `key` (1 when none). */
  productivity(world: WorldView, key: string): number;
  /** Customs implied by theories most living people believe, right or wrong. */
  customs(world: WorldView): string[];
  /** True when an accepted theory forewarns this phenomenon. */
  forewarned(world: WorldView, phenomenonId: string): boolean;
  known(world: WorldView): string[];
  lost(world: WorldView): string[];
  accepted(world: WorldView): string[];
  /** Who first made each invention that has been made, and when. */
  invented(world: WorldView): Record<string, { by: string; at: number; times: number }>;
  mind(world: WorldView, personId: string): Mind | undefined;
}

interface HeredityLike { ceiling(world: WorldView, id: string, trait: string): number }
interface FateLike { inspiration(world: WorldView, targetId: string): number; encounters(world: WorldView): string[] }
interface InstitutionsLike { has(world: WorldView, id: string): boolean }
interface LaborLike { isCoerced(world: WorldView, id: string): boolean }

const CONTENT = loadBaseTechContent();
{
  const problems = validateTechContent(CONTENT);
  if (problems.length) throw new Error(`base tech content is invalid:\n  ${problems.join("\n  ")}`);
}

function village(world: WorldView): VillageRecord | undefined {
  return world.getComponent(TECH_VILLAGE, TechComponents.village) as unknown as VillageRecord | undefined;
}
/** Living members' minds; cloned when the caller will change them. */
function mindsOf(world: WorldView, v: VillageRecord, clone = true): Map<string, Mind> {
  const out = new Map<string, Mind>();
  for (const id of v.members) {
    const m = world.getComponent(id, TechComponents.mind) as unknown as Mind | undefined;
    if (m && !m.gone) out.set(id, clone ? structuredClone(m) as Mind : m);
  }
  return out;
}
const json = (x: unknown) => structuredClone(x) as Record<string, JsonValue>;

function writeBack(world: WorldView, v: VillageRecord, minds: Map<string, Mind>, events: TechEvent[], reason: string): Effect[] {
  const effects: Effect[] = [{ kind: "setComponent", entityId: TECH_VILLAGE, component: TechComponents.village, value: json(v), reason }];
  for (const [id, m] of minds) {
    const before = world.getComponent(id, TechComponents.mind);
    if (JSON.stringify(before) !== JSON.stringify(m)) effects.push({ kind: "setComponent", entityId: id, component: TechComponents.mind, value: json(m), reason });
  }
  for (const e of events) {
    const significance = e.type === "tech.invented" || e.type === "tech.lost" || e.type === "tech.theory_accepted" ? 0.3 : 0.02;
    effects.push({ kind: "emitEvent", eventType: e.type, ...(e.actorId ? { actorId: e.actorId } : {}), data: e.data, historicalSignificance: significance });
  }
  return effects;
}

export const techModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Tech: needs, inventions and village learning",
    description: "A need ledger, hidden inventions people think of and spread or lose, and theories (right or wrong) tested by evidence.",
    provides: [TECH_CAPABILITY, "tech.learning", "tech.need-ledger"],
    optional: ["life.heredity", "fate.perturbation", "polity.institutions", "polity.labor"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "projection.register"],
  },

  register(ctx) {
    const registry = ctx.registry;
    const heredity = () => registry.capabilityImplementation("life.heredity") as HeredityLike | undefined;
    const fate = () => registry.capabilityImplementation("fate.perturbation") as FateLike | undefined;
    const institutions = () => registry.capabilityImplementation("polity.institutions") as InstitutionsLike | undefined;
    const labor = () => registry.capabilityImplementation("polity.labor") as LaborLike | undefined;
    const aptitude = (world: WorldView) => (id: string, trait: string) => heredity()?.ceiling(world, id, trait) ?? 60;

    const knownIds = (world: WorldView): string[] => {
      const v = village(world);
      if (!v) return [];
      const known = new Set<string>();
      for (const m of mindsOf(world, v, false).values()) for (const [id, f] of Object.entries(m.knows)) if (f > 0) known.add(id);
      return CONTENT.inventions.filter((i) => known.has(i.id)).map((i) => i.id);
    };
    const api: TechApi = {
      content: () => CONTENT,
      capabilities(world) {
        const v = village(world);
        if (!v) return [];
        const caps = new Set(v.baseCapabilities);
        for (const id of knownIds(world)) for (const c of CONTENT.inventions.find((i) => i.id === id)!.grants) caps.add(c);
        return [...caps].sort();
      },
      productivity(world, key) {
        let p = 1;
        for (const id of knownIds(world)) p *= CONTENT.inventions.find((i) => i.id === id)!.effects[key] ?? 1;
        for (const id of Object.keys(village(world)?.accepted ?? {})) p *= (CONTENT.theories.find((t) => t.id === id)?.effects as Record<string, number> | undefined)?.[key] ?? 1;
        return Math.round(p * 1000) / 1000;
      },
      customs(world) {
        const v = village(world);
        if (!v) return [];
        const minds = mindsOf(world, v, false);
        return CONTENT.theories.filter((t) => t.custom && believersShare(minds, t.id) >= 0.5).map((t) => t.custom!).sort();
      },
      forewarned: (world, phen) => Object.keys(village(world)?.accepted ?? {}).some((id) => {
        const t = CONTENT.theories.find((x) => x.id === id);
        return t?.predicts === phen && (t.effects.forewarning ?? 0) > 0;
      }),
      known: knownIds,
      lost: (world) => Object.keys(village(world)?.lost ?? {}).sort(),
      accepted: (world) => Object.keys(village(world)?.accepted ?? {}).sort(),
      invented: (world) => village(world)?.invented ?? {},
      mind: (world, id) => world.getComponent(id, TechComponents.mind) as unknown as Mind | undefined,
    };
    ctx.provideCapability(TECH_CAPABILITY, api);
    ctx.provideCapability("tech.learning", api);
    ctx.provideCapability("tech.need-ledger", api);

    ctx.registerComponent({ id: TechComponents.village, persist: true, description: "The village's needs, observations, evidence, inventions made and lost." });
    ctx.registerComponent({ id: TechComponents.mind, persist: true, description: "What one person knows how to make, is trying to make, and believes." });

    for (const [type, description] of [
      ["tech.found", "Start tracking a village's knowledge: base capabilities and members."],
      ["tech.enroll", "A new member (target: newborn or migrant) joins the village's minds."],
      ["tech.report_need", "Someone was held back by a need (payload needId, amount)."],
      ["tech.observe", "A phenomenon happened in front of observers (payload phenomenonId, observers)."],
      ["tech.season", "One season of thinking, trying, copying and believing (payload busy, materials, community)."],
      ["tech.teach", "The actor teaches the target an invention or a theory."],
      ["tech.person_gone", "The target died or left; what only they knew is lost."],
      ["tech.expose", "Someone saw an invention elsewhere (payload inventionId, ticks)."],
    ] as const) ctx.registerCommand({ type, description });

    const needVillage = (type: string) => ctx.registerConstraintRule({
      id: `${type}.village`,
      commandType: type,
      evaluate: (c) => village(c.world) ? { ok: true } : { ok: false, code: "E_TECH_NO_VILLAGE", message: "run tech.found first" },
    });
    for (const t of ["tech.enroll", "tech.report_need", "tech.observe", "tech.season", "tech.teach", "tech.person_gone", "tech.expose"]) needVillage(t);

    ctx.registerResolutionRule({
      id: "tech.found.resolve",
      commandType: "tech.found",
      resolve: (c) => {
        const members = ((c.command.payload.members ?? []) as string[]).filter((id) => c.world.hasEntity(id));
        const knows = (c.command.payload.knows ?? {}) as Record<string, string[]>;
        const v: VillageRecord = { ...emptyVillage(), baseCapabilities: ((c.command.payload.capabilities ?? []) as string[]).slice().sort(), members };
        const effects: Effect[] = [{ kind: "spawnEntity", localId: "village", id: TECH_VILLAGE, entityKind: "tech.village", components: { [TechComponents.village]: json(v) } }];
        for (const id of members) {
          const m = emptyMind();
          for (const inv of knows[id] ?? []) m.knows[inv] = 1;
          effects.push({ kind: "setComponent", entityId: id, component: TechComponents.mind, value: json(m), reason: "founding member" });
        }
        return effects;
      },
    });

    ctx.registerResolutionRule({
      id: "tech.enroll.resolve",
      commandType: "tech.enroll",
      resolve: (c) => {
        const id = c.command.targetId ?? "";
        const v = village(c.world)!;
        if (!c.world.hasEntity(id) || v.members.includes(id)) return [];
        return [
          { kind: "setComponent", entityId: TECH_VILLAGE, component: TechComponents.village, value: json({ ...v, members: [...v.members, id] }), reason: "new member" },
          { kind: "setComponent", entityId: id, component: TechComponents.mind, value: json(emptyMind()), reason: "new member" },
        ];
      },
    });

    ctx.registerResolutionRule({
      id: "tech.report_need.resolve",
      commandType: "tech.report_need",
      resolve: (c) => {
        const needId = String(c.command.payload.needId ?? "");
        if (!CONTENT.needs[needId]) {
          c.note(`unknown need ${needId}`);
          return [];
        }
        const reporter = c.command.actorId;
        const coerced = reporter ? labor()?.isCoerced(c.world, reporter) === true : false;
        const amount = Math.max(0, Number(c.command.payload.amount ?? 1)) * (coerced ? 0.2 : 1);
        const v = village(c.world)!;
        const needs = { ...v.needs, [needId]: Math.round(((v.needs[needId] ?? 0) + amount) * 1000) / 1000 };
        return [{ kind: "setComponent", entityId: TECH_VILLAGE, component: TechComponents.village, value: json({ ...v, needs }), reason: coerced ? "need of a coerced worker" : "need" }];
      },
    });

    ctx.registerResolutionRule({
      id: "tech.observe.resolve",
      commandType: "tech.observe",
      resolve: (c) => {
        const phen = String(c.command.payload.phenomenonId ?? "");
        if (!CONTENT.phenomena[phen]) return [];
        const v = structuredClone(village(c.world)!) as VillageRecord;
        const minds = mindsOf(c.world, v);
        const observers = ((c.command.payload.observers ?? v.members) as string[]);
        const boost = api.productivity(c.world, "observation");
        const events = observeStep(c.rng, minds, v, CONTENT, phen, observers, (id) => aptitude(c.world)(id, "trait:perception"), boost);
        return writeBack(c.world, v, minds, events, `observed ${phen}`);
      },
    });

    ctx.registerResolutionRule({
      id: "tech.season.resolve",
      commandType: "tech.season",
      resolve: (c) => {
        const v = structuredClone(village(c.world)!) as VillageRecord;
        const minds = mindsOf(c.world, v);
        const f = fate();
        for (const inv of f?.encounters(c.world) ?? []) v.exposures[inv] = Math.max(v.exposures[inv] ?? 0, c.world.tick + 90);
        const inst = institutions();
        const events = seasonStep(c.rng, minds, v, CONTENT, {
          tick: c.world.tick,
          people: ((c.command.payload.people ?? v.members) as string[]),
          busy: new Set((c.command.payload.busy ?? []) as string[]),
          materials: new Set((c.command.payload.materials ?? []) as string[]),
          capabilities: new Set(api.capabilities(c.world)),
          hasInstitution: (id) => inst ? inst.has(c.world, id) : undefined,
          aptitude: aptitude(c.world),
          inspire: (id) => f?.inspiration(c.world, id) ?? 1,
          community: Number(c.command.payload.community ?? v.members.length),
        });
        return writeBack(c.world, v, minds, events, "a season passed");
      },
    });

    ctx.registerResolutionRule({
      id: "tech.teach.resolve",
      commandType: "tech.teach",
      resolve: (c) => {
        const teacher = c.command.actorId ?? "";
        const learner = c.command.targetId ?? "";
        const t = c.world.getComponent(teacher, TechComponents.mind) as unknown as Mind | undefined;
        const l = c.world.getComponent(learner, TechComponents.mind) as unknown as Mind | undefined;
        if (!t || !l || t.gone || l.gone) return [];
        const next = structuredClone(l) as Mind;
        const mem = aptitude(c.world)(learner, "trait:memory") / 100;
        const inv = c.command.payload.inventionId ? String(c.command.payload.inventionId) : "";
        const theory = c.command.payload.theoryId ? String(c.command.payload.theoryId) : "";
        const data: Record<string, JsonValue> = {};
        if (inv && (t.knows[inv] ?? 0) > 0) { next.knows[inv] = Math.round(Math.max(next.knows[inv] ?? 0, t.knows[inv]! * (0.7 + 0.3 * mem)) * 1000) / 1000; data.inventionId = inv; }
        if (theory && (t.beliefs[theory] ?? 0) > 0) { next.beliefs[theory] = Math.round(t.beliefs[theory]! * 0.85 * 1000) / 1000; data.theoryId = theory; }
        if (!Object.keys(data).length) return [];
        return [
          { kind: "setComponent", entityId: learner, component: TechComponents.mind, value: json(next), reason: "taught" },
          { kind: "emitEvent", eventType: "tech.learned", actorId: learner, targetId: teacher, data: { ...data, how: "teaching" }, historicalSignificance: 0.05 },
        ];
      },
    });

    ctx.registerResolutionRule({
      id: "tech.person_gone.resolve",
      commandType: "tech.person_gone",
      resolve: (c) => {
        const v = structuredClone(village(c.world)!) as VillageRecord;
        const minds = mindsOf(c.world, v);
        const id = c.command.targetId ?? "";
        const mind = c.world.getComponent(id, TechComponents.mind) as unknown as Mind | undefined;
        if (mind && !minds.has(id)) return [];
        if (mind) minds.set(id, structuredClone(mind) as Mind);
        const events = goneStep(minds, v, id, c.world.tick);
        v.members = v.members.filter((m) => m !== id);
        return writeBack(c.world, v, minds, events, "a person is gone");
      },
    });

    ctx.registerResolutionRule({
      id: "tech.expose.resolve",
      commandType: "tech.expose",
      resolve: (c) => {
        const inv = String(c.command.payload.inventionId ?? "");
        if (!CONTENT.inventions.some((i) => i.id === inv)) return [];
        const v = village(c.world)!;
        const until = c.world.tick + Math.max(1, Number(c.command.payload.ticks ?? 360));
        return [{ kind: "setComponent", entityId: TECH_VILLAGE, component: TechComponents.village, value: json({ ...v, exposures: { ...v.exposures, [inv]: Math.max(until, v.exposures[inv] ?? 0) } }), reason: "saw it elsewhere" }];
      },
    });

    ctx.registerProjection({
      id: "tech.village",
      description: "System view: what the village knows, lost, accepted, and needs.",
      build: ({ world }) => {
        const v = village(world);
        if (!v) return { founded: false };
        const minds = mindsOf(world, v);
        const name = (id: string) => CONTENT.inventions.find((i) => i.id === id)?.name ?? id;
        return {
          founded: true,
          known: api.known(world).map((id) => ({ id, name: name(id), holders: livingHolders(minds, id).length })),
          lost: Object.keys(v.lost).map((id) => ({ id, name: name(id), at: v.lost[id]!.at })),
          theories: CONTENT.theories.map((t) => ({ id: t.id, label: t.label, share: Math.round(believersShare(minds, t.id) * 100) / 100, accepted: !!v.accepted[t.id], evidence: v.evidence[t.id] ?? { hits: 0, misses: 0 } }))
            .filter((t) => t.share > 0 || t.accepted),
          needs: v.needs,
          capabilities: api.capabilities(world),
          customs: api.customs(world),
        };
      },
    });
    ctx.registerProjection({
      id: "tech.needs_report",
      description: "For developers: pressing needs, and the ones no invention in the graph answers yet.",
      build: ({ world }) => {
        const v = village(world);
        const needs = Object.entries(v?.needs ?? {}).sort((a, b) => b[1] - a[1]);
        const answered = new Set(CONTENT.inventions.flatMap((i) => i.answers));
        return {
          pressing: needs.map(([id, intensity]) => ({ id, label: CONTENT.needs[id]?.label ?? id, intensity, answeredInGraph: answered.has(id) })),
          unanswered: Object.keys(CONTENT.needs).filter((id) => !answered.has(id)),
        };
      },
    });
  },
};
