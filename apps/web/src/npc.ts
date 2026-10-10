/**
 * M3-A: one visible village resident lives by actual world commands.
 *
 * Called only after the single authoritative clock advances during Web
 * continuous simulation. No background scheduler, parallel inventory,
 * fabricated labor, or hidden player command. Each day is idempotent via the
 * settlement resident's persisted lastRoutineAt marker.
 */
import type { Simulation } from "@openlife/simulation";
import { SettlementCommands, SettlementComponents, residentId, dailyActivity } from "@openlife/module-settlement-locations";
import { SpaceCommands, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectRelations, holderOf, ownerOf, prototypeOf } from "@openlife/module-world-objects";

export const FIRST_AUTONOMOUS_RESIDENT = residentId("yu");

export interface NpcDailyResult {
  actorId: string;
  tick: number;
  actions: string[];
  skipped: boolean;
  note: string;
}

export function runFirstNpcDay(sim: Simulation): NpcDailyResult {
  const actorId = FIRST_AUTONOMOUS_RESIDENT;
  const world = sim.worldView();
  const tick = sim.tick;
  const existing = world.getComponent(actorId, SettlementComponents.resident);
  const actor = world.getEntity(actorId);
  if (!existing || !actor || actor.archivedAt !== undefined ||
      actor.components["modern.vitals"]?.alive === false ||
      world.getComponent("modern:world", "modern.world_state")?.activeCharacterId === actorId) {
    return { actorId, tick, actions: [], skipped: true, note: "没有可接管的村民" };
  }
  if (Number(existing.lastRoutineAt ?? -1) === tick) {
    return { actorId, tick, actions: [], skipped: true, note: "今天的生活已经执行" };
  }

  const actions: string[] = [];
  let obstacle = "";
  const act = (type: string, payload: Record<string, string> = {}, label: string): boolean => {
    const result = sim.dispatch({ type, actorId, source: "ai", payload });
    if (result.ok) {
      actions.push(label);
      return true;
    }
    obstacle = result.errors?.[0]?.message || `${label}无法完成`;
    return false;
  };
  // At most 7 real commands plus a daily marker. A refused command causes
  // a visible obstacle; no retry loop, imaginary supplies or instant teleport.
  const at = () => occupiedPlaceId(sim.worldView(), actorId);
  const inSpace = () => occupiedSpaceId(sim.worldView(), actorId);

  if (at() !== "place:field" &&
      !act(SettlementCommands.arrive, { placeId: "place:field", travelMode: "local" }, "走到田地")) {
    return finish();
  }
  if (inSpace() !== "space:field-edge" &&
      !act(SpaceCommands.moveWithin, { spaceId: "space:field-edge" }, "走到田头")) {
    return finish();
  }
  if (!act(SettlementCommands.tend, { spaceId: "space:field-edge" }, "照料田地")) {
    return finish();
  }
  // One authored exchange opportunity after several days of village life.
  // Yu must gather an actual seed-grain item, spending 2 action slots.
  // The cook gathered real fuel on earlier days; absence means no proposal.
  const cookId = residentId("cook");
  const cook = sim.worldView().getComponent(cookId, SettlementComponents.resident);
  const cookFuel = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: cookId })
    .map((r) => r.from).sort()
    .find((id) => ownerOf(sim.worldView(), id) === cookId &&
      prototypeOf(sim.worldView(), id).resourceId === "resource:fuel");
  const fieldGrain = sim.worldView().getComponent("yield:place:field:resource:grain",
    SettlementComponents.yieldPoint);
  // Actual completed NPC days, not absolute world ticks or player age,
  // gate the first small trading opportunity.
  const wantsBarter = Number(cook?.npcDailyCount ?? 0) >= 6 && Number(cook?.tradeCount ?? 0) === 0 &&
    Boolean(cookFuel) && Number(fieldGrain?.stock ?? 0) > 0 &&
    dailyActivity(sim.worldView(), actorId).remaining >= 4;
  if (wantsBarter && !act(SettlementCommands.draw,
      { placeId: "place:field", resourceId: "resource:grain" }, "为交换采集一份粟")) {
    return finish();
  }
  if (!act(SettlementCommands.arrive,
      { placeId: "place:hearth-yard", travelMode: "local" }, "走到灶台")) return finish();
  if (wantsBarter && cookFuel) {
    const grainId = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId })
      .map((r) => r.from).sort()
      .find((id) => ownerOf(sim.worldView(), id) === actorId &&
        prototypeOf(sim.worldView(), id).resourceId === "resource:grain");
    if (grainId) {
      const proposal = sim.dispatch({ type: SettlementCommands.npcOffer, actorId: cookId,
        source: "ai", payload: { fuelId: cookFuel, grainId } });
      if (proposal.ok) {
        actions.push("阿灶提出以柴换粟");
        const acceptance = sim.dispatch({ type: SettlementCommands.npcAccept, actorId,
          source: "ai", payload: { fuelId: cookFuel, grainId } });
        if (acceptance.ok) actions.push("接受交换，得到柴草");
        else obstacle = acceptance.errors?.[0]?.message ?? "未能完成交换";
      } else obstacle = proposal.errors?.[0]?.message ?? "未能提出交换";
    }
  }
  // The shared cooked-food stock is finite and the same stock players use.
  const food = sim.worldView().getComponent("yield:place:hearth-yard:resource:cooked",
    SettlementComponents.yieldPoint);
  if (Number(food?.stock ?? 0) > 0) {
    // Never simulate the meal without the original validated eating command.
    act(SettlementCommands.eat,
      { placeId: "place:hearth-yard", resourceId: "resource:cooked" }, "吃一份熟食");
  } else {
    obstacle = "公用灶台没有熟食，今天没有吃到饭";
  }
  if (at() !== "place:field" &&
      !act(SettlementCommands.arrive, { placeId: "place:field", travelMode: "local" }, "返回住处")) {
    return finish();
  }
  if (inSpace() !== "space:yu-sleep" &&
      !act(SpaceCommands.moveWithin, { spaceId: "space:yu-sleep" }, "进入家中")) {
    return finish();
  }
  if (dailyActivity(sim.worldView(), actorId).remaining >= 2) {
    act(SettlementCommands.rest, { spaceId: "space:yu-sleep" }, "休息");
  } else if (!obstacle) {
    obstacle = "今天活动时间已用尽，没能继续休息";
  }
  return finish();

  function finish(): NpcDailyResult {
    const note = obstacle
      ? `阿予：${actions.join("、") || "未能行动"}；${obstacle}`
      : `阿予今天${actions.join("、")}`;
    const marker = sim.dispatch({
      type: SettlementCommands.npcMarkDay, actorId, source: "ai",
      payload: { actions, summary: note },
    });
    if (!marker.ok) {
      return { actorId, tick, actions, skipped: false,
        note: `村民日程记录失败：${marker.errors?.[0]?.message ?? "未知错误"}` };
    }
    return { actorId, tick, actions, skipped: false, note };
  }
}
