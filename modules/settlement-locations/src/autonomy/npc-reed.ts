/**
 * A second independently deciding agent. He protects his own household's
 * reserve, gathers only if ecology allows, and explicitly responds when met.
 */
import type { AgentHost as NpcHost } from "@openlife/contracts";
import { SettlementCommands, SettlementComponents, residentId, dailyActivity } from "../module.ts";
import { SpaceCommands, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectRelations, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import { chooseNpcIntent, shortagePressure } from "./npc-goals.ts";
import { ROLES, yieldId, stockAt, mealIfHungry } from "./roles.ts";

export const THIRD_AUTONOMOUS_RESIDENT = ROLES.fuelGatherer.id;
export function runThirdNpcDay(sim: NpcHost) {
  const actorId = THIRD_AUTONOMOUS_RESIDENT, tick = sim.tick;
  const world = sim.worldView(), entity = world.getEntity(actorId);
  const resident = world.getComponent(actorId, SettlementComponents.resident);
  if (!entity || !resident || entity.archivedAt !== undefined ||
      entity.components["modern.vitals"]?.alive === false ||
      world.getComponent("modern:world", "modern.world_state")?.activeCharacterId === actorId ||
      Number(resident.lastRoutineAt ?? -1) === tick)
    return { actorId, tick, skipped: true, actions: [] as string[], note: "已完成或不可自治" };
  const actions: string[] = [];
  let obstacle = "";
  const held = () => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map(r => r.from).sort().filter(id => ownerOf(sim.worldView(), id) === actorId &&
      prototypeOf(sim.worldView(), id).resourceId === "resource:fuel");
  const stock = () => stockAt(sim.worldView(), ROLES.fuelGatherer.workPlace, "resource:fuel");
  const act = (type: string, payload: Record<string, string | boolean> = {}, label: string) => {
    const result = sim.dispatch({ type, actorId, source: "ai", payload });
    if (result.ok) { actions.push(label); return true; }
    obstacle = result.errors?.[0]?.message ?? `${label}受阻`; return false;
  };
  mealIfHungry(sim, actorId, act);
  if (occupiedPlaceId(sim.worldView(), actorId) !== ROLES.fuelGatherer.workPlace &&
      !act(SettlementCommands.arrive, { placeId: ROLES.fuelGatherer.workPlace, travelMode: "local" }, "回到芦苇滩")) return finish();
  const cookId = ROLES.cook.id;
  const request = sim.worldView().getComponent(cookId, SettlementComponents.resident)?.helpRequest as Record<string, unknown> | undefined;
  if (request?.status === "pending" && request.to === actorId &&
      occupiedPlaceId(sim.worldView(), cookId) === ROLES.fuelGatherer.workPlace &&
      tick - Number(request.at) <= 2) {
    const possessions = held();
    const trust = Number(sim.worldView().getComponent(actorId, SettlementComponents.resident)?.trustTowardCook ?? 5);
    const willing = fuelHelpReply(possessions.length, trust, stock()) === "share";
    act(SettlementCommands.npcAnswerHelp,
      { requesterId: cookId, accept: willing, ...(willing ? { itemId: possessions[0] } : {}) },
      willing ? `衡量自己的余量后，送${ROLES.cook.name}一捆柴草` : "自家储备优先，拒绝借出");
  }
  const restock = chooseNpcIntent([
    { id: "protect", possible: stock() <= 3, utility: 100,
      because: "资源过低，停止割取以免枯竭" },
    { id: "gather", possible: held().length < 2 && stock() > 3, utility: 60,
      because: "家里还缺柴草且滩地可以恢复" },
    { id: "rest", possible: true, utility: 10,
      because: "自己的物资够用，今天不必多采" },
  ]);
  if (restock?.id === "gather" && dailyActivity(sim.worldView(), actorId).remaining >= 2) {
    if (occupiedSpaceId(sim.worldView(), actorId) !== ROLES.fuelGatherer.workSpot &&
        !act(SpaceCommands.moveWithin, { spaceId: ROLES.fuelGatherer.workSpot }, "来到割苇处")) return finish();
    act(SettlementCommands.draw, { placeId: ROLES.fuelGatherer.workPlace, resourceId: "resource:fuel" }, "为家里准备一捆柴草");
  } else {
    actions.push(restock?.because ?? "照料芦苇滩");
  }
  if (occupiedSpaceId(sim.worldView(), actorId) !== ROLES.fuelGatherer.home &&
      !act(SpaceCommands.moveWithin, { spaceId: ROLES.fuelGatherer.home }, "回家")) return finish();
  if (dailyActivity(sim.worldView(), actorId).remaining >= 2)
    act(SettlementCommands.rest, { spaceId: ROLES.fuelGatherer.home }, "休息");
  return finish();
  function finish() {
    const note = `${ROLES.fuelGatherer.name}：${actions.join("、") || "暂缓行动"}${obstacle ? "；" + obstacle : ""}`;
    const marker = sim.dispatch({ type: SettlementCommands.npcMarkDay,
      actorId, source: "ai", payload: { actions, summary: note } });
    return { actorId, tick, skipped: false, actions,
      note: marker.ok ? note : note + "；日程记录失败" };
  }
}

/**
 * Whether the fuel gatherer shares a bundle with the cook: a pure decision
 * over what he really holds, his trust, and what is left on the reed flat.
 */
export function fuelHelpReply(bundlesHeld: number, trust: number, flatStock: number): "share" | "refuse" {
  const reply = chooseNpcIntent([
    { id: "share", possible: bundlesHeld >= 2,
      utility: 75 + trust * 2 + Math.max(0, bundlesHeld - 1) * 3 - shortagePressure(flatStock, 14) / 6,
      because: "有多余的柴草且愿意合作" },
    { id: "refuse", possible: true,
      utility: 35 + shortagePressure(flatStock, 14) / 3 + (bundlesHeld < 2 ? 40 : 0),
      because: "必须保护自己家里的必需储备" },
  ]);
  return reply?.id === "share" ? "share" : "refuse";
}
