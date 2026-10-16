/**
 * 送礼与心愿：玩家主动把自己的东西当面送给村民（物品真实换手），
 * 正中心愿时心愿了结、对方记下人情；有的心愿靠常去帮手、常来说话来圆。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, socialOf, residentId, wishFulfilled, favourOwed, tradeableGoods,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function life(seed = 51) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const bring = (id: string, placeId: string) => sim.dispatch({ type: SettlementCommands.arrive, actorId: id, source: "ai", payload: { placeId } });
  return { sim, me, act, bring };
}
const holder = (sim: Simulation, id: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, from: id })[0]?.to;

test("a gift of a wished-for thing changes hands, fulfils the wish and is remembered", () => {
  const { sim, me, act, bring } = life();
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:reedbed" }).ok, true);
  assert.equal(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 }).ok, true);
  const mother = residentId("lan-mother");
  bring(mother, "place:reedbed");
  const reed = tradeableGoods(sim.worldView(), me)["resource:reed"]![0]!;
  const offered = homestead(sim.worldView(), me).actions.find((a) => a.id === SettlementCommands.gift && a.payload.targetId === mother);
  assert.ok(offered?.enabled, "a gift for what she needs is offered");
  const trustBefore = socialOf(sim.worldView(), mother).bonds[me]?.trust ?? 5;
  assert.equal(act(SettlementCommands.gift, { targetId: mother, itemId: reed }).ok, true);
  assert.equal(holder(sim, reed), mother, "the reed is now hers");
  assert.equal(wishFulfilled(sim.worldView(), mother), me);
  assert.ok(socialOf(sim.worldView(), mother).bonds[me]!.trust >= trustBefore + 3);
  assert.ok(favourOwed(sim.worldView(), me, mother) >= 1, "she owes you a favour now");
  const wishes = homestead(sim.worldView(), me).wishes;
  assert.ok(wishes.some((w) => w.residentId === mother && w.fulfilled && w.byYou));
  const lines = sim.kernel.internals.eventLog.list({ actorId: me }).filter((e) => e.targetId === mother).map((e) => String(e.data.line ?? ""));
  assert.ok(lines.some((l) => l.includes("谢谢你")), lines.join("|"));
});

test("only your own things, face to face, and only by your choice", () => {
  const { sim, me, act, bring } = life();
  const cook = residentId("cook");
  const theirs = tradeableGoods(sim.worldView(), cook);
  const notMine = Object.values(theirs)[0]?.[0] ?? "instance:hearth-grain";
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:hearth-yard" }).ok, true);
  bring(cook, "place:hearth-yard");
  assert.equal(act(SettlementCommands.gift, { targetId: cook, itemId: notMine }).ok, false);
  assert.equal(sim.dispatch({ type: SettlementCommands.gift, actorId: me, source: "ai", payload: { targetId: cook, itemId: notMine } as never }).ok, false);
  assert.equal(act(SettlementCommands.draw, { placeId: "place:hearth-yard", resourceId: "resource:cooked", amount: 1 }).ok, true);
  const food = tradeableGoods(sim.worldView(), me)["resource:cooked"]![0]!;
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:river", travelMode: "local" }).ok, true);
  assert.equal(act(SettlementCommands.gift, { targetId: cook, itemId: food }).ok, false, "not across the village");
});

test("a deed wish comes true by listening, counted only after you know it", () => {
  const { sim, me, act, bring } = life();
  const reed = residentId("reed-worker");
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:reedbed" }).ok, true);
  for (let day = 0; day < 6 && !wishFulfilled(sim.worldView(), reed); day += 1) {
    bring(reed, "place:reedbed");
    assert.equal(act(SettlementCommands.talk, { targetId: reed }).ok, true);
    sim.advanceBy(1);
    bring(me, "place:reedbed");
  }
  assert.equal(wishFulfilled(sim.worldView(), reed), me, "talked through what weighs on him");
});
