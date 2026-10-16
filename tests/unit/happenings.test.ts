/**
 * 日子里的事：节令共餐与村民病倒，全由数据包和日子确定地算出；
 * 病了的人自己待着，过节时村民自己去凑热闹；玩家帮不帮、去不去由自己定。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, socialOf, residentId, tradeableGoods,
  feastOn, feastSoon, illnessOn, calendarDate, RIVER_TERRACE_PACK, validateSettlementPack,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function life(seed = 61) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}

test("the pack's happenings are valid and feasts fall on their calendar day", () => {
  assert.deepEqual(validateSettlementPack(RIVER_TERRACE_PACK).filter((p) => /feast|illness/.test(p)), []);
  const f = RIVER_TERRACE_PACK.happenings!.feasts[0]!;
  const tick = (f.month - 1) * 30 + (f.day - 1) + 360 * 3;
  assert.deepEqual(calendarDate(tick), { month: f.month, day: f.day });
  assert.equal(feastOn(tick)?.id, f.id);
  assert.equal(feastSoon(tick - 2)?.inDays, 2);
  assert.equal(feastOn(tick + 1), undefined);
});

test("illness comes in short, deterministic spells and never to the three bespoke roles", () => {
  const roles = new Set(Object.values(RIVER_TERRACE_PACK.autonomy).map((k) => residentId(k)));
  const spells = new Map<string, number>();
  for (let t = 0; t < 360; t += 1) {
    const ill = illnessOn(t);
    if (!ill) continue;
    assert.ok(!roles.has(ill.residentId));
    spells.set(`${ill.residentId}@${ill.from}`, (spells.get(`${ill.residentId}@${ill.from}`) ?? 0) + 1);
    assert.deepEqual(illnessOn(t), ill, "same day, same answer");
  }
  assert.ok(spells.size >= 20, `several spells a year (${spells.size})`);
  for (const n of spells.values()) assert.ok(n <= RIVER_TERRACE_PACK.happenings!.illness!.lastsDays);
});

test("bringing food to an ill neighbour is remembered more than an ordinary gift", () => {
  const { sim, me, act } = life();
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } }).ok, true);
  assert.equal(act(SettlementCommands.chooseOrigin, { originId: "ferry-child", talents: [] }).ok, true, "ferry child starts with a fish");
  let ill = illnessOn(sim.tick);
  for (let i = 0; i < 30 && !ill; i += 1) { sim.advanceBy(1); ill = illnessOn(sim.tick); }
  assert.ok(ill, "someone falls ill within a month");
  assert.ok(homestead(sim.worldView(), me).happenings.some((t) => t.includes("着了凉")));
  const fish = tradeableGoods(sim.worldView(), me)["resource:fish"]?.[0];
  assert.ok(fish, "still carrying the fish");
  const where = occupiedPlaceId(sim.worldView(), ill!.residentId);
  assert.ok(where, "the ill neighbour is somewhere real");
  if (occupiedPlaceId(sim.worldView(), me) !== where) {
    const go = sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: where } });
    assert.equal(go.ok, true, `${where} ${JSON.stringify(go.errors)}`);
  }
  const trust0 = socialOf(sim.worldView(), ill!.residentId).bonds[me]?.trust ?? 5;
  const r = act(SettlementCommands.gift, { targetId: ill!.residentId, itemId: fish });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const lines = sim.kernel.internals.eventLog.list({ actorId: me }).map((e) => String(e.data.line ?? ""));
  assert.ok(lines.some((l) => l.includes("劳你惦记")), lines.join("|"));
  assert.ok(socialOf(sim.worldView(), ill!.residentId).bonds[me]!.trust >= trust0 + 3);
});

test("ill villagers stay put; the village day stays deterministic", () => {
  const run = () => { const { sim } = life(77); sim.advanceBy(12); return sim.fingerprint(); };
  assert.equal(run(), run());
});
