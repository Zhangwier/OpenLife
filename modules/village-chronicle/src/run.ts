/**
 * The chronicle driver: builds a world with whichever plugins are wanted and
 * turns each year's plan into commands for them. Only commands go into the
 * world, so a run is fully determined by (seed, plugins, nudges) and can be
 * replayed or forked — the "history lab" of docs/plans/HEREDITY_INVENTION_PLAN.md §9.6.3.
 */
import type { CommandIntent, CommandResult, OpenLifeModule, WorldView } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import { heredityModule } from "@openlife/module-heredity";
import { techModule } from "@openlife/module-tech";
import { polityModule } from "@openlife/module-polity";
import { polityBondageModule } from "@openlife/module-polity-bondage";
import { fateModule } from "@openlife/module-fate";
import { eraLadderModule } from "@openlife/module-era-ladder";
import { villageChronicleModule, CHRONICLE_VILLAGE, ChronicleComponents, type ChronicleVillage } from "./module.ts";
import { YEAR } from "./demography.ts";

export type ChroniclePlugin = "heredity" | "tech" | "polity" | "polity-bondage" | "fate" | "era-ladder";
export const ALL_PLUGINS: ChroniclePlugin[] = ["heredity", "tech", "polity", "polity-bondage", "fate", "era-ladder"];
const MODULES: Record<ChroniclePlugin, OpenLifeModule> = {
  heredity: heredityModule, tech: techModule, polity: polityModule, "polity-bondage": polityBondageModule, fate: fateModule, "era-ladder": eraLadderModule,
};

/** A nudge applied at the start of a given year. */
export interface FateNudge { year: number; type: "fate.bless_birth" | "fate.inspire" | "fate.encounter" | "fate.stir"; payload: Record<string, string | number | string[]> }

export interface ChronicleOptions {
  seed: number;
  founders?: number;
  plugins?: ChroniclePlugin[];
  fateMode?: "observer" | "nudge" | "lab";
  nudges?: FateNudge[];
}

const BASE_CAPABILITIES = ["cap:fire", "cap:pottery", "cap:farming"];

export function buildChronicle(options: ChronicleOptions): Simulation {
  const plugins = options.plugins ?? ALL_PLUGINS;
  const modules = ALL_PLUGINS.filter((p) => plugins.includes(p)).map((p) => MODULES[p]);
  const sim = new Simulation({ worldSeed: options.seed, modules: [villageChronicleModule, ...modules], maxEventsPerTransaction: 5000 });
  sim.advanceTo(YEAR * 40);
  must(sim, { type: "village-chronicle.found", payload: { count: options.founders ?? 14 }, source: "system" });
  const founders = living(sim);
  const has = (p: ChroniclePlugin) => plugins.includes(p);
  if (has("heredity")) for (const id of founders) must(sim, { type: "heredity.found", targetId: id, payload: { bornAt: bornAt(sim, id) }, source: "system" });
  if (has("tech")) must(sim, { type: "tech.found", payload: { capabilities: BASE_CAPABILITIES, members: founders }, source: "system" });
  if (has("polity")) must(sim, { type: "polity.found", source: "system" });
  if (has("fate")) must(sim, { type: "fate.configure", payload: { mode: options.fateMode ?? "observer" }, source: "system" });
  return sim;
}

/** Runs `years` more years; nudges whose year comes up are applied first. */
export function runChronicle(sim: Simulation, years: number, nudges: FateNudge[] = []): Simulation {
  for (let i = 0; i < years; i++) runYear(sim, nudges);
  return sim;
}

export function runYear(sim: Simulation, nudges: FateNudge[] = []): void {
  const installed = (id: string) => sim.modules.get(id)?.state === "active";
  const before = village(sim);
  for (const n of nudges.filter((x) => x.year === before.year + 1)) sim.dispatch({ type: n.type, payload: n.payload, source: "player" });

  must(sim, { type: "village-chronicle.year", source: "system" });
  const plan = village(sim).lastYear!;
  const out: CommandIntent[] = [];
  if (installed("heredity")) {
    for (const b of plan.births) out.push({ type: "heredity.inherit", targetId: b.id, payload: { motherId: b.motherId, fatherId: b.fatherId } });
    for (const m of plan.migrants) out.push({ type: "heredity.found", targetId: m, payload: { population: "population:outsider", origin: "migrant", bornAt: bornAt(sim, m) } });
    for (const h of plan.hungerChildren) out.push({ type: "heredity.record_hunger", targetId: h.id, payload: { days: h.days } });
  }
  if (installed("tech")) {
    for (const id of [...plan.births.map((b) => b.id), ...plan.migrants]) out.push({ type: "tech.enroll", targetId: id });
    for (const inv of plan.exposures) out.push({ type: "tech.expose", payload: { inventionId: inv, ticks: YEAR } });
    for (const n of plan.needs) out.push({ type: "tech.report_need", actorId: n.reporterId, payload: { needId: n.needId, amount: n.amount } });
    for (const p of plan.phenomena) out.push({ type: "tech.observe", payload: { phenomenonId: p.id, observers: p.observers } });
    for (const l of plan.lessons) out.push({ type: "tech.teach", actorId: l.teacher, targetId: l.learner, payload: pickLesson(sim.worldView(), l.teacher, l.learner, plan.year) });
    const community = Math.round(living(sim).length + 0.5 * village(sim).neighbours.reduce((t, n) => t + n.pop, 0));
    for (let s = 0; s < 4; s++) out.push({ type: "tech.season", payload: { busy: plan.busy, materials: plan.materials, community } });
    for (const d of plan.deaths) out.push({ type: "tech.person_gone", targetId: d.id });
  }
  for (const intent of out) must(sim, { ...intent, source: "system" });
  sim.advanceBy(YEAR);
  const v = village(sim);
  const alive = living(sim);
  if (installed("polity")) {
    for (const l of plan.loans) must(sim, { type: "polity.lend", actorId: l.creditor, targetId: l.debtor, payload: { amount: l.amount }, source: "system" });
    must(sim, { type: "polity.year", payload: { population: alive.length, surplus: plan.surplus, contacts: v.contacts, adults: plan.adults.filter((a) => alive.includes(a.id)), gone: plan.deaths.map((d) => d.id) }, source: "system" });
  }
  if (installed("polity-bondage")) must(sim, { type: "polity-bondage.year", payload: { people: alive }, source: "system" });
  if (installed("era-ladder")) {
    const largest = Math.max(alive.length, ...v.neighbours.map((n) => n.pop));
    must(sim, { type: "era-ladder.check", payload: { population: alive.length, contacts: v.contacts, largestSettlement: largest }, source: "system" });
  }
}

function pickLesson(world: WorldView, teacher: string, learner: string, year: number): Record<string, string> {
  const t = world.getComponent(teacher, "tech.mind") as { knows?: Record<string, number>; beliefs?: Record<string, number> } | undefined;
  const l = world.getComponent(learner, "tech.mind") as { knows?: Record<string, number>; beliefs?: Record<string, number> } | undefined;
  const inv = Object.keys(t?.knows ?? {}).filter((x) => !(l?.knows ?? {})[x]).sort();
  const th = Object.keys(t?.beliefs ?? {}).filter((x) => !(l?.beliefs ?? {})[x]).sort();
  const out: Record<string, string> = {};
  if (inv.length) out.inventionId = inv[year % inv.length]!;
  if (th.length) out.theoryId = th[year % th.length]!;
  return out;
}

export function village(sim: Simulation): ChronicleVillage {
  return sim.worldView().getComponent(CHRONICLE_VILLAGE, ChronicleComponents.village) as unknown as ChronicleVillage;
}
export function living(sim: Simulation): string[] {
  return [...(village(sim)?.alive ?? [])];
}
function bornAt(sim: Simulation, id: string): number {
  return Number((sim.worldView().getComponent(id, ChronicleComponents.person) as { born?: number } | undefined)?.born ?? 0);
}
function must(sim: Simulation, intent: CommandIntent): CommandResult {
  const r = sim.dispatch(intent);
  if (!r.ok) throw new Error(`${intent.type} failed: ${r.errors.map((e) => `${e.code} ${e.message}`).join("; ")}`);
  return r;
}

/** A compact, comparable summary of where a chronicle stands. */
export function summarize(sim: Simulation): Record<string, unknown> {
  const p = (id: string, params: Record<string, unknown> = {}) => sim.modules.get(id.split(".")[0]!)?.state === "active" ? sim.project({ id, params }).data : undefined;
  const tech = p("tech.village") as { known?: Array<{ name: string }>; lost?: Array<{ name: string }>; theories?: Array<{ label: string; share: number; accepted: boolean }>; customs?: string[] } | undefined;
  const polity = p("polity.village") as { institutions?: Array<{ label: string }> } | undefined;
  const era = p("era-ladder.state") as { label?: string; features?: string[]; chronicle?: Array<{ at: number; label: string }> } | undefined;
  const v = village(sim);
  return {
    year: v.year, population: living(sim).length, stores: v.stores, contacts: v.contacts,
    era: era?.label ?? null, features: era?.features ?? [],
    eras: (era?.chronicle ?? []).map((e) => `${Math.round((e.at - YEAR * 40) / YEAR)}年 ${e.label}`),
    known: (tech?.known ?? []).map((k) => k.name), lost: (tech?.lost ?? []).map((k) => k.name),
    accepted: (tech?.theories ?? []).filter((t) => t.accepted).map((t) => t.label),
    institutions: (polity?.institutions ?? []).map((i) => i.label),
  };
}
