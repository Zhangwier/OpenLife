/**
 * Shared daily utility planner for the remaining villagers. Their existing
 * household/workplace/needs drive mundane decisions, not authored quest arcs.
 * Every accepted move, draw, meal, store or rest uses validated world commands.
 */
import type { Simulation } from "@openlife/simulation";
import { SettlementCommands, SettlementComponents, SettlementId, people, residentId, dailyActivity, worksites } from "@openlife/module-settlement-locations";
import { SpaceCommands, SpaceRelations, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectCommands, ObjectRelations, ownerOf } from "@openlife/module-world-objects";
import { chooseNpcIntent } from "./npc-goals.ts";

const SPECIAL = new Set([residentId("yu"), residentId("cook"), residentId("reed-worker")]);
const RESOURCE_AT_WORK: Record<string, string> = {
  "place:river": "resource:water",
  "place:field": "resource:grain",
  "place:claypits": "resource:clay",
  "place:reedbed": "resource:reed",
  "place:kiln": "resource:fuel",
};
const WORK_SPACES: Record<string, string> = {
  "place:field": "space:field-edge",
  "place:reedbed": "space:reed-cut",
  "place:kiln": "space:kiln-mouth",
  "place:claypits": "space:pit-edge",
  "place:river": "space:bank",
  "place:ford": "space:ford-landing",
};
export function runOtherNpcDays(sim: Simulation) {
  return (people(sim.worldView()).residents as Array<Record<string, unknown>>)
    .filter(p => !SPECIAL.has(String(p.id)))
    .map(p => runGenericNpcDay(sim, p));
}
function runGenericNpcDay(sim: Simulation, resident: Record<string, unknown>) {
  const actorId = String(resident.id), name = String(resident.name), tick = sim.tick;
  const state = sim.worldView();
  const entity = state.getEntity(actorId);
  const active = String(state.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  if (!entity || entity.archivedAt !== undefined || entity.components["modern.vitals"]?.alive === false ||
      actorId === active || Number(resident.lastRoutineAt) === tick)
    return { actorId, tick, skipped: true, actions: [] as string[], note: "今日不接管" };

  const actions: string[] = [];
  let obstacle = "";
  const workplace = String(resident.workPlace || "");
  const homeSpace = String(resident.homeSpace || "");
  const homePlace = sim.worldView().listRelations({ type: SpaceRelations.inside, from: homeSpace })[0]?.to || workplace;
  const jobResource = RESOURCE_AT_WORK[workplace];
  const stock = () => worksites(sim.worldView()).places.find(p => p.placeId === workplace)?.resources
    .find(p => p.resourceId === jobResource)?.stock ?? 0;
  const carriedOwned = () => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map(r => r.from).filter(id => ownerOf(sim.worldView(), id) === actorId);
  const homeStock = () => sim.worldView().listRelations({ type: ObjectRelations.ownedBy, to: actorId })
    .filter(r => sim.worldView().listRelations({ type: ObjectRelations.containedIn, from: r.from })
      .some(where => where.to === homePlace)).length;
  const hunger = () => {
    const holding = sim.worldView().getComponent(actorId, SettlementComponents.holding);
    const founded = sim.worldView().getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
    const since = Number(holding?.hungerAt ?? founded ?? tick);
    return Math.min(10, Number(holding?.hunger ?? 0) + Math.max(0, tick - since));
  };
  const foodStock = () => worksites(sim.worldView()).places.find(p => p.placeId === "place:hearth-yard")
    ?.resources.find(p => p.resourceId === "resource:cooked")?.stock ?? 0;
  const act = (type: string, payload: Record<string, string> = {}, label: string) => {
    const result = sim.dispatch({ type, actorId, source: "ai", payload });
    if (result.ok) { actions.push(label); return true; }
    obstacle = result.errors?.[0]?.message ?? `${label}失败`; return false;
  };
  const move = (placeId: string, label: string) =>
    occupiedPlaceId(sim.worldView(), actorId) === placeId ||
    act(SettlementCommands.arrive, { placeId, travelMode: "local" }, label);
  const enter = (spaceId: string) =>
    !spaceId || occupiedSpaceId(sim.worldView(), actorId) === spaceId ||
    act(SpaceCommands.moveWithin, { spaceId }, "进入工作位置");

  const goal = chooseNpcIntent([
    { id: "eat", possible: hunger() >= 4,
      utility: 90 + Math.min(10, hunger()), because: "饿了，去公灶寻找真正的食物" },
    { id: "store", possible: carriedOwned().length > 0 && homeStock() < 4,
      utility: 82, because: "带回已采得的实物，不把它遗失在路上" },
    { id: "work", possible: Boolean(jobResource && homeStock() < 4 &&
        carriedOwned().length < 2), utility: 65, because: "照顾所在工作地点的真实物资" },
    { id: "tend", possible: Boolean(WORK_SPACES[workplace]), utility: 35,
      because: "在自己的工作地点做力所能及的事" },
    { id: "rest", possible: true, utility: 10, because: "没有可完成的劳动，先休息和观察" },
  ]);
  if (goal) actions.push(`决定：${goal.because}`);
  if (goal?.id === "eat") {
    if (move("place:hearth-yard", "前往公灶")) {
      if (foodStock() > 0 && act(SettlementCommands.eat,
          { placeId: "place:hearth-yard", resourceId: "resource:cooked" }, "吃一份真熟食"))
        actions.push("饥饿有所缓解");
      else actions.push("到达后发现今天没有可吃的熟食");
    }  } else if (goal?.id === "store") {
    if (move(homePlace, "把自己的采集物带回住处")) {
      for (const itemId of carriedOwned().slice(0, 1))
        act(ObjectCommands.place, { objectId: itemId, placeId: homePlace }, "存放自己的物品");
    }
  } else if (goal?.id === "work" || goal?.id === "tend") {
    if (move(workplace, "前往自己的劳动地点") && enter(WORK_SPACES[workplace] ?? "")) {
      if (goal.id === "work") {
        if (stock() > 2) act(SettlementCommands.draw, { placeId: workplace, resourceId: jobResource }, "采集一份真实物资");
        else actions.push("现场资源不足，没有强行采走");
      }
      else if (WORK_SPACES[workplace])
        act(SettlementCommands.tend, { spaceId: WORK_SPACES[workplace] }, "照料自己工作地点");
    }
  }
  if (occupiedPlaceId(sim.worldView(), actorId) !== homePlace)
    move(homePlace, "回家");
  if (occupiedPlaceId(sim.worldView(), actorId) === homePlace && enter(homeSpace) &&
      dailyActivity(sim.worldView(), actorId).remaining >= 2)
    act(SettlementCommands.rest, { spaceId: homeSpace }, "休息");
  const note = `${name}：${actions.join("、") || "未行动"}${obstacle ? "；" + obstacle : ""}`;
  const marker = sim.dispatch({ type: SettlementCommands.npcMarkDay,
    actorId, source: "ai", payload: { actions, summary: note } });
  return { actorId, tick, skipped: false, actions,
    note: marker.ok ? note : `${note}；未能记录日程` };
}
