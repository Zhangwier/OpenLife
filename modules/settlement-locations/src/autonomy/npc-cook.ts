/**
 * Self-directed hearth keeper: chooses actions from actual fuel, finite
 * gathered resources and unresolved requests. No scripted incident/day number.
 */
import type { AgentHost as NpcHost } from "@openlife/contracts";
import { SettlementCommands, SettlementComponents, residentId, dailyActivity } from "../module.ts";
import { SpaceCommands, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectRelations, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import { chooseNpcIntent, shortagePressure } from "./npc-goals.ts";

export const SECOND_AUTONOMOUS_RESIDENT = residentId("cook");
export function runSecondNpcDay(sim: NpcHost) {
  const actorId = SECOND_AUTONOMOUS_RESIDENT, tick = sim.tick;
  const resident = sim.worldView().getComponent(actorId, SettlementComponents.resident);
  const entity = sim.worldView().getEntity(actorId);
  const active = sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId;
  if (!resident || !entity || entity.archivedAt !== undefined ||
      entity.components["modern.vitals"]?.alive === false || active === actorId ||
      Number(resident.lastRoutineAt ?? -1) === tick)
    return { actorId, tick, skipped: true, actions: [] as string[], note: "已完成或不可自治" };

  const actions: string[] = [];
  let obstacle = "";
  const at = () => occupiedPlaceId(sim.worldView(), actorId);
  const room = () => occupiedSpaceId(sim.worldView(), actorId);
  const fuel = () => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map(r => r.from).sort().find(id => ownerOf(sim.worldView(), id) === actorId &&
      prototypeOf(sim.worldView(), id).resourceId === "resource:fuel") ?? "";
  const stock = () => Number(sim.worldView().getComponent("yield:place:reedbed:resource:fuel",
    SettlementComponents.yieldPoint)?.stock ?? 0);
  const act = (type: string, payload: Record<string, string> = {}, label: string) => {
    const result = sim.dispatch({ type, actorId, source: "ai", payload });
    if (result.ok) { actions.push(label); return true; }
    obstacle = result.errors?.[0]?.message ?? `${label}受阻`; return false;
  };
  // He must go to the reedbed to inspect the actual available stock;
  // there is no omniscient lookup of a distant place's resources.
  if (!fuel() && at() !== "place:reedbed" &&
      !act(SettlementCommands.arrive, { placeId: "place:reedbed", travelMode: "local" }, "走到芦苇滩查看柴草")) return finish();
  const pending = sim.worldView().getComponent(actorId, SettlementComponents.resident)?.helpRequest as Record<string, unknown> | undefined;
  const supply = at() === "place:reedbed" ? stock() : 0;
  const hasFuel = Boolean(fuel());
  const intent = chooseNpcIntent([
    { id: "light-fire", utility: 100, possible: hasFuel,
      because: "手里有柴，先维持公灶" },
    { id: "seek-fuel", utility: 70 + shortagePressure(supply, 14) / 5,
      possible: !hasFuel && supply > 2, because: "能在附近采到实物柴草" },
    { id: "ask-neighbour", utility: 90 + shortagePressure(supply, 14) / 10,
      possible: !hasFuel && supply <= 2 && pending?.status !== "pending" &&
        tick - Number(pending?.at ?? -100) >= 3,
      because: "柴草见底，先向可能有余量的邻居求助" },
    { id: "wait-answer", utility: 80, possible: !hasFuel && pending?.status === "pending",
      because: "已提出请求，等对方决定" },
    { id: "conserve", utility: 30, possible: !hasFuel,
      because: "没有柴草且刚请求过，暂时不要反复打扰" },
  ]);
  if (intent) actions.push(`今日打算：${intent.because}`);
  if (intent?.id === "seek-fuel" || intent?.id === "ask-neighbour" ||
      intent?.id === "wait-answer" || intent?.id === "conserve") {
    if (intent.id === "seek-fuel") {
      if (room() !== "space:reed-cut" &&
          !act(SpaceCommands.moveWithin, { spaceId: "space:reed-cut" }, "走到割苇处")) return finish();
      act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }, "采回真正的一捆柴草");
    } else if (intent.id === "ask-neighbour") {
      act(SettlementCommands.npcAskHelp, { targetId: residentId("reed-worker") }, "柴草不足，向阿苇求助");
    } else {
      actions.push(intent.id === "wait-answer" ? "留在芦苇滩等待阿苇回应" : "资源紧张，暂时不催促阿苇");
    }
  }
  if (fuel()) {
    if (at() !== "place:hearth-yard" &&
        !act(SettlementCommands.arrive, { placeId: "place:hearth-yard", travelMode: "local" }, "带柴草回公灶")) return finish();
    act(SettlementCommands.npcFire, { itemId: fuel() }, "消耗一捆柴草，维持公灶火");
  } else if (at() === "place:hearth-yard") {
    actions.push("没有柴草，今天点不起灶火");
  }
  if (at() === "place:hearth-yard" && room() !== "space:hearth-sleep" &&
      !act(SpaceCommands.moveWithin, { spaceId: "space:hearth-sleep" }, "回铺位")) return finish();
  if (room() === "space:hearth-sleep" && dailyActivity(sim.worldView(), actorId).remaining >= 2)
    act(SettlementCommands.rest, { spaceId: "space:hearth-sleep" }, "休息");
  return finish();
  function finish() {
    const note = `阿灶：${actions.join("、") || "没有成功行动"}${obstacle ? "；" + obstacle : ""}`;
    const marker = sim.dispatch({ type: SettlementCommands.npcMarkDay, actorId, source: "ai",
      payload: { actions, summary: note } });
    return { actorId, tick, skipped: false, actions,
      note: marker.ok ? note : note + "；日程记录失败" };
  }
}
