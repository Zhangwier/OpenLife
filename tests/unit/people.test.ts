/**
 * 每个村民都是具体的人：有最爱、喜欢、不爱的东西，有生日；
 * 送过才知道对方的喜好，一天只送一次，生日那天的礼物格外被记住。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, residentId, socialOf, bondOf, tradeableGoods,
  RIVER_TERRACE_PACK, validateSettlementPack, tasteOf, heartsOf, isBirthday, happeningsView, PEOPLE,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function life(seed = 3) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}

test("every villager has tastes, a birthday and stories, and the pack validates", () => {
  assert.deepEqual(validateSettlementPack(RIVER_TERRACE_PACK).filter((p) => p.startsWith("people")), []);
  assert.equal(Object.keys(PEOPLE).length, RIVER_TERRACE_PACK.residents.length);
  for (const [key, p] of Object.entries(PEOPLE)) {
    assert.ok(p.loves.length && p.dislikes.length, key);
    assert.ok((p.heartEvents ?? []).length >= 3, `${key} has heart stories`);
  }
  assert.equal(tasteOf(residentId("reed-worker"), "resource:reed"), "dislike");
  assert.equal(tasteOf(residentId("cook"), "resource:fuel"), "love");
  assert.equal(heartsOf({ familiarity: 0, trust: 5, grudge: 0, lastAt: 0 }), 0);
  assert.equal(heartsOf({ familiarity: 10, trust: 10, grudge: 0, lastAt: 0 }), 10);
});

test("a disliked gift lands worse than nothing; you learn the taste; one gift a day", () => {
  const { sim, me, act } = life();
  const reedWorker = residentId("reed-worker");
  act(SettlementCommands.arrive, { placeId: "place:reedbed" });
  assert.equal(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 }).ok, true);
  if (occupiedPlaceId(sim.worldView(), reedWorker) !== "place:reedbed")
    sim.dispatch({ type: SettlementCommands.arrive, actorId: reedWorker, source: "system", payload: { placeId: "place:reedbed" } });
  const before = bondOf(socialOf(sim.worldView(), reedWorker), me).trust;
  const reeds = tradeableGoods(sim.worldView(), me)["resource:reed"]!;
  const r = act(SettlementCommands.gift, { targetId: reedWorker, itemId: reeds[0] });
  assert.equal(r.ok, true, r.errors?.[0]?.message);
  assert.ok(bondOf(socialOf(sim.worldView(), reedWorker), me).trust < before, "he did not want reeds cut");
  const line = String(r.events?.find?.((e: { type: string }) => e.type === "settlement-locations.gift_received")?.data?.line ?? "");
  const again = act(SettlementCommands.gift, { targetId: reedWorker, itemId: reeds[1] });
  assert.equal(again.ok, false);
  assert.match(again.errors[0]!.message, /今天已经送过/);
  const card = homestead(sim.worldView(), me).neighbours.find((p) => p.id === reedWorker)!;
  assert.deepEqual(card.dislikes, ["芦苇"]);
  // 生日是私事：只有聊熟了的人才报得出日子（不认识的人这里应当是空的）。
  void line;
});

test("a stranger's birthday is private; a known villager's is announced", () => {
  const { sim, me } = life();
  const child = residentId("clay-child");
  let hitDay = -1;
  for (let d = 0; d < 8; d++) {
    if (isBirthday(child, sim.tick)) { hitDay = sim.tick; break; }
    sim.advanceBy(1);
  }
  assert.ok(hitDay >= 0, "小满's birthday falls in the first week of winter");
  // 不认识小满时，就算是他生日，也不该出现在村里的消息里。
  assert.ok(!happeningsView(sim.worldView(), me).includes("今天是小满的生日。"),
    "a stranger's birthday must not be announced to someone who does not know them");
  // 走过去、聊上一句之后，同一个日子就会报出名字。
  const where = occupiedPlaceId(sim.worldView(), child);
  assert.ok(where, "小满 is somewhere real");
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: where } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.talk, actorId: me, source: "player", payload: { targetId: child } }).ok, true);
  assert.ok(happeningsView(sim.worldView(), me).includes("今天是小满的生日。"),
    "once you have spoken with them, their birthday is worth telling you");
});

test("once you are close enough, a villager tells you a story of their own, one at a time", () => {
  const { sim, me, act } = life(7);
  sim.dispatch({ type: SettlementCommands.chooseOrigin, actorId: me, source: "player", payload: { originId: "potter-kin", talents: ["likable"] } });
  const wife = residentId("elder-wife");
  const heard: string[] = [];
  for (let d = 0; d < 10; d++) {
    const at = occupiedPlaceId(sim.worldView(), wife);
    if (at && at !== occupiedPlaceId(sim.worldView(), me)) act(SettlementCommands.arrive, { placeId: at });
    const seq = sim.kernel.internals.eventLog.nextSeq;
    act(SettlementCommands.talk, { targetId: wife });
    const ev = sim.kernel.internals.eventLog.since(seq - 1).find((e) => e.type === "settlement-locations.conversation");
    if (ev?.data?.heart) heard.push(`${sim.tick}:${ev.data.heart}`);
    sim.advanceBy(1);
  }
  assert.ok(heard.length >= 2, JSON.stringify(heard));
  const ticks = heard.map((h) => Number(h.split(":")[0]));
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i]! - ticks[i - 1]! >= 4, "stories are spaced out");
  assert.equal(new Set(heard.map((h) => h.split(":").slice(1).join(":"))).size, heard.length, "each story told once");
});

test("on a birthday, the people close to them bring something", () => {
  const { sim } = life(7);
  const child = residentId("clay-child");
  let gifts = 0;
  for (let d = 0; d < 8; d++) {
    const seq = sim.kernel.internals.eventLog.nextSeq;
    sim.advanceBy(1);
    if (!isBirthday(child, sim.tick)) continue;
    gifts = sim.kernel.internals.eventLog.since(seq - 1).filter((e) => e.type === "settlement-locations.gift_given" && e.targetId === child).length;
  }
  assert.ok(gifts >= 1, "someone remembered 小满's birthday");
});
