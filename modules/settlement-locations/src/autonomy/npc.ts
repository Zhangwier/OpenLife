/**
 * M3-A: one visible village resident lives by actual world commands.
 *
 * Run by the settlement module's village agent once per stepped world day,
 * whoever advanced the clock (M4-B). No parallel inventory, fabricated labor
 * or hidden player command. Each day is idempotent via the settlement
 * resident's persisted lastRoutineAt marker.
 */
import type { AgentHost as NpcHost } from "@openlife/contracts";
import { SettlementCommands, SettlementComponents, residentId, dailyActivity, worksites } from "../module.ts";
import { SpaceCommands, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectRelations, holderOf, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import { ROLES, yieldId, stockAt } from "./roles.ts";

export const FIRST_AUTONOMOUS_RESIDENT = ROLES.farmer.id;

export interface NpcDailyResult {
  actorId: string;
  tick: number;
  actions: string[];
  skipped: boolean;
  note: string;
}

export function runFirstNpcDay(sim: NpcHost): NpcDailyResult {
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

  if (at() !== ROLES.farmer.workPlace &&
      !act(SettlementCommands.arrive, { placeId: ROLES.farmer.workPlace, travelMode: "local" }, "走到田地")) {
    return finish();
  }
  if (inSpace() !== ROLES.farmer.workSpot &&
      !act(SpaceCommands.moveWithin, { spaceId: ROLES.farmer.workSpot }, "走到田头")) {
    return finish();
  }
  if (!act(SettlementCommands.tend, { spaceId: ROLES.farmer.workSpot }, "照料田地")) {
    return finish();
  }
  // One authored exchange opportunity after several days of village life.
  // Yu must gather an actual seed-grain item, spending 2 action slots.
  // The cook gathered real fuel on earlier days; absence means no proposal.
  const cookId = ROLES.cook.id;
  const cook = sim.worldView().getComponent(cookId, SettlementComponents.resident);
  const cookFuel = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: cookId })
    .map((r) => r.from).sort()
    .find((id) => ownerOf(sim.worldView(), id) === cookId &&
      prototypeOf(sim.worldView(), id).resourceId === "resource:fuel");
  const fieldGrain = stockAt(sim.worldView(), ROLES.farmer.workPlace, "resource:grain");
  // Trade is now an opportunity derived from concrete supplies and available
  // activity, not a scripted event on a chosen day.
  const wantsBarter = Number(cook?.tradeCount ?? 0) === 0 &&
    Boolean(cookFuel) && fieldGrain > 0 &&
    dailyActivity(sim.worldView(), actorId).remaining >= 4;
  if (wantsBarter && !act(SettlementCommands.draw,
      { placeId: ROLES.farmer.workPlace, resourceId: "resource:grain" }, "为交换采集一份粟")) {
    return finish();
  }
  if (!act(SettlementCommands.arrive,
      { placeId: ROLES.cook.workPlace, travelMode: "local" }, "走到灶台")) return finish();
  if (wantsBarter && cookFuel) {
    const grainId = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId })
      .map((r) => r.from).sort()
      .find((id) => ownerOf(sim.worldView(), id) === actorId &&
        prototypeOf(sim.worldView(), id).resourceId === "resource:grain");
    if (grainId) {
      const proposal = sim.dispatch({ type: SettlementCommands.npcOffer, actorId: cookId,
        source: "ai", payload: { fuelId: cookFuel, grainId } });
      if (proposal.ok) {
        actions.push(`${ROLES.cook.name}提出以柴换粟`);
        const acceptance = sim.dispatch({ type: SettlementCommands.npcAccept, actorId,
          source: "ai", payload: { fuelId: cookFuel, grainId } });
        if (acceptance.ok) actions.push("接受交换，得到柴草");
        else obstacle = acceptance.errors?.[0]?.message ?? "未能完成交换";
      } else obstacle = proposal.errors?.[0]?.message ?? "未能提出交换";
    }
  }
  // The shared cooked-food stock is finite and the same stock players use.
  // Read the renewed stock (what anyone standing there would see), not the stored cache.
  const food = worksites(sim.worldView()).places.find(p => p.placeId === ROLES.cook.workPlace)
    ?.resources.find(p => p.resourceId === "resource:cooked")?.stock ?? 0;
  if (food > 0) {
    // Never simulate the meal without the original validated eating command.
    act(SettlementCommands.eat,
      { placeId: ROLES.cook.workPlace, resourceId: "resource:cooked" }, "吃一份熟食");
  } else {
    obstacle = "公用灶台没有熟食，今天没有吃到饭";
  }
  if (at() !== ROLES.farmer.workPlace &&
      !act(SettlementCommands.arrive, { placeId: ROLES.farmer.workPlace, travelMode: "local" }, "返回住处")) {
    return finish();
  }
  if (inSpace() !== ROLES.farmer.home &&
      !act(SpaceCommands.moveWithin, { spaceId: ROLES.farmer.home }, "进入家中")) {
    return finish();
  }
  if (dailyActivity(sim.worldView(), actorId).remaining >= 2) {
    act(SettlementCommands.rest, { spaceId: ROLES.farmer.home }, "休息");
  } else if (!obstacle) {
    obstacle = "今天活动时间已用尽，没能继续休息";
  }
  return finish();

  function finish(): NpcDailyResult {
    const note = obstacle
      ? `${ROLES.farmer.name}：${actions.join("、") || "未能行动"}；${obstacle}`
      : `${ROLES.farmer.name}今天${actions.join("、")}`;
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
