/** A daily agent connects lived settlement time to tech, polity and era history. */
import type { AgentHost, ModuleRegistrationContext, WorldView } from "@openlife/contracts";

const VILLAGE = "tech:village", CLOCK = "tech.settlement-clock";
const SETTLEMENT = "settlement-locations:settlement:river-terrace";
const RESIDENT = "settlement-locations.resident";
export const HISTORY_AGENT = "tech.settlement-history";
export const HISTORY_MARK = "tech.settlement-clock.mark";
type HistoryHost = Pick<AgentHost, "tick" | "worldView" | "dispatch">;
function periods(world: WorldView) {
  const day = Boolean(world.getComponent("modern:world", "world-clock.clock"));
  const months = Math.floor(world.tick / (day ? 30 : 1));
  return { season: Math.floor((months + 1) / 3), year: Math.floor(months / 12), day };
}
function residents(world: WorldView) {
  const player = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  const family = new Set(world.listRelations().filter(r => ["family.parent_of", "family.married_to"].includes(r.type))
    .flatMap(r => r.from === player ? [r.to] : r.to === player ? [r.from] : []));
  return world.listEntities({ kind: "modern.character" }).filter(e => e.archivedAt === undefined
    && (e.components[RESIDENT] || e.id === player || family.has(e.id)) && e.components["modern.vitals"]?.alive !== false).map(e => e.id);
}
export function settlementMaterials(world: WorldView): string[] {
  const have = new Set(world.listEntities({ kind: "settlement-locations.yield-point" })
    .filter(e => e.archivedAt === undefined && Number(e.components["settlement-locations.yield"]?.stock ?? 0) > 0)
    .map(e => String(e.components["settlement-locations.yield"]?.resourceId ?? "")));
  // Real wood and rope have precedence; reed remains the river village's usable substitute.
  for (const [needed, choices] of Object.entries({ "resource:timber": ["resource:wood", "resource:reed"],
    "resource:rope": ["resource:reed"], "resource:stone": ["resource:clay"] })) {
    if (choices.some(id => have.has(id))) have.add(needed);
  }
  return [...have].filter(Boolean).sort();
}
export function runSettlementHistory(host: HistoryHost, has: (command: string) => boolean): void {
  let world = host.worldView();
  if (!world.hasEntity(SETTLEMENT) || !world.hasEntity(VILLAGE)) return;
  const current = periods(world), old = world.getComponent(VILLAGE, CLOCK);
  if (old?.tick === world.tick) return;
  const fire = (type: string, payload: Record<string, any> = {}, targetId?: string) => {
    if (!has(type)) return true;
    const result = host.dispatch({ type, payload, ...(targetId ? { targetId } : {}) });
    if (!result.ok) throw new Error(`历史接线 ${type}: ${result.errors?.[0]?.message ?? "rejected"}`);
    return true;
  };
  let record = world.getComponent(VILLAGE, "tech.village")!;
  const alive = residents(world), members = (record.members ?? []) as string[];
  for (const id of alive) if (!members.includes(id)) {
    if (!world.getComponent(id, "heredity.genome")) fire("heredity.found", { origin: "migrant" }, id);
    fire("tech.enroll", {}, id);
  }
  for (const id of members) if (world.getComponent(id, "modern.vitals")?.alive === false) fire("tech.person_gone", {}, id);
  // Missing markers on legacy saves begin here; elapsed history is never replayed or invented.
  if (old && current.season > Number(old.season)) {
    const needs: Array<[string, number]> = [["need:lift-water", 3], ["need:carry-loads", 2], ["need:more-grain", 1], ["need:keep-records", 1]];
    for (const [needId, amount] of needs) fire("tech.report_need", { needId, amount });
    for (const phenomenonId of ["river-flood", "season-change", "clay-deposit"]) fire("tech.observe", { phenomenonId, observers: alive });
    fire("tech.season", { people: alive, busy: [], materials: settlementMaterials(host.worldView()), community: alive.length });
  }
  if (old && current.year > Number(old.year)) {
    world = host.worldView();
    const home = String(world.getComponent(SETTLEMENT, "settlement-locations.settlement")?.placeId ?? "");
    const nearby = new Set(world.listRelations({ type: "world-geography.adjacent_to" })
      .flatMap(r => r.from === home ? [r.to] : r.to === home ? [r.from] : []).filter(id => world.hasEntity(id)));
    const grain = world.listEntities({ kind: "settlement-locations.yield-point" })
      .filter(e => e.archivedAt === undefined && e.components["settlement-locations.yield"]?.resourceId === "resource:grain")
      .reduce((n, e) => n + Number(e.components["settlement-locations.yield"]?.stock ?? 0), 0);
    if (!world.getComponent("polity:village", "polity.state")) fire("polity.found");
    const adults = alive.map(id => {
      const e = world.getEntity(id)!;
      return { id, age: Math.floor((world.tick - Number(e.components["modern.identity"]?.bornAt ?? e.createdAt)) / (current.day ? 360 : 12)) };
    }).filter(a => a.age >= 16);
    fire("polity.year", { population: alive.length, surplus: grain, contacts: nearby.size, adults, gone: [] });
    fire("era-ladder.check", { population: alive.length, contacts: nearby.size, largestSettlement: alive.length });
  }
  fire(HISTORY_MARK, { tick: host.tick, season: current.season, year: current.year });
}
export function registerSettlementHistory(ctx: ModuleRegistrationContext): void {
  ctx.registerComponent({ id: CLOCK, persist: true, description: "Last lived history day, season and year; survives loading." });
  ctx.registerCommand({ type: HISTORY_MARK });
  ctx.registerResolutionRule({ id: `${HISTORY_MARK}.resolve`, commandType: HISTORY_MARK, resolve: c =>
    c.world.hasEntity(VILLAGE) ? [{ kind: "setComponent", entityId: VILLAGE, component: CLOCK,
      value: { tick: c.world.tick, ...periods(c.world) } }] : [] });
  ctx.registerAgent({ id: HISTORY_AGENT, description: "Runs history once at real settlement calendar boundaries.",
    run: host => runSettlementHistory(host, type => ctx.registry.hasCommand(type)) });
}
