/** M3-B: one more resident gathers genuine fuel and goes home each simulated day. */
import type { Simulation } from "@openlife/simulation";
import { SettlementCommands, SettlementComponents, residentId, dailyActivity } from "@openlife/module-settlement-locations";
import { SpaceCommands, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";

export const SECOND_AUTONOMOUS_RESIDENT = residentId("cook");

export function runSecondNpcDay(sim: Simulation) {
  const actorId = SECOND_AUTONOMOUS_RESIDENT, tick = sim.tick;
  const resident = sim.worldView().getComponent(actorId, SettlementComponents.resident);
  const entity = sim.worldView().getEntity(actorId);
  const active = sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId;
  if (!resident || !entity || entity.archivedAt !== undefined ||
      entity.components["modern.vitals"]?.alive === false || active === actorId ||
      Number(resident.lastRoutineAt ?? -1) === tick) {
    return { actorId, tick, skipped: true, actions: [] as string[], note: "已执行或无法接管" };
  }
  const actions: string[] = [];
  let obstacle = "";
  const act = (type: string, payload: Record<string, string>, label: string): boolean => {
    const result = sim.dispatch({ type, actorId, source: "ai", payload });
    if (result.ok) { actions.push(label); return true; }
    obstacle = result.errors?.[0]?.message ?? `${label}失败`;
    return false;
  };
  if (occupiedPlaceId(sim.worldView(), actorId) !== "place:reedbed" &&
      !act(SettlementCommands.arrive, { placeId: "place:reedbed", travelMode: "local" }, "前往芦苇滩")) {
    return finish();
  }
  if (occupiedSpaceId(sim.worldView(), actorId) !== "space:reed-cut" &&
      !act(SpaceCommands.moveWithin, { spaceId: "space:reed-cut" }, "来到割苇处")) return finish();
  // The real renewable fuel yield is finite; a failed draw produces no object.
  act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }, "采集一捆柴草");
  if (occupiedPlaceId(sim.worldView(), actorId) !== "place:hearth-yard" &&
      !act(SettlementCommands.arrive, { placeId: "place:hearth-yard", travelMode: "local" }, "返回公用灶台")) return finish();
  if (occupiedSpaceId(sim.worldView(), actorId) !== "space:hearth-sleep" &&
      !act(SpaceCommands.moveWithin, { spaceId: "space:hearth-sleep" }, "回到灶家铺位")) return finish();
  if (dailyActivity(sim.worldView(), actorId).remaining >= 2)
    act(SettlementCommands.rest, { spaceId: "space:hearth-sleep" }, "休息");

  return finish();
  function finish() {
    const note = obstacle
      ? `阿灶：${actions.join("、") || "未行动"}；${obstacle}`
      : `阿灶今天${actions.join("、")}`;
    const marker = sim.dispatch({ type: SettlementCommands.npcMarkDay,
      actorId, source: "ai", payload: { actions, summary: note } });
    return { actorId, tick, skipped: false, actions,
      note: marker.ok ? note : `${note}；无法记录日程` };
  }
}
