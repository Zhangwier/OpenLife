/**
 * 愿望与恐惧（village-wants）：恐惧会真的改变行为，短期愿望每季换一个。
 *
 * 这里要证明的不是「数据结构长得对」，而是三件在游戏里能看见的事：
 *   1. 恐惧被情境撞上时，心情**确实**往下掉（投影与事件里都读得到）；
 *   2. 心情掉到一定程度，怕水的人取水受限、村民干不动活——行为真的变了；
 *   3. 每季会换一个愿望；满足了心情往上走（交情上升来自聚落自己的规则）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, residentId, RIVER_TERRACE_PACK, tradeableGoods, socialOf,
} from "@openlife/module-settlement-locations";
import {
  villageWantsModule, WantCommands, WantComponents, WantProjections, WantRejection, FEARS, WISHES,
  MOOD_BASELINE, MOOD_RECOVERY, SEASON_DAYS, TIMID_DRAW_BELOW, fearById, fearOf, moodOf,
  wantsProblems, seasonKey, fearFor, wishFor,
} from "@openlife/module-village-wants";

const YEAR0 = 18 * 360;

function boot(seed = 7) {
  const sim = new Simulation({
    worldSeed: seed,
    modules: [
      modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, villageWantsModule,
    ],
  });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  sim.advanceBy(YEAR0);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return { sim, me };
}

const person = (sim: Simulation, id: string) =>
  sim.project({ id: WantProjections.person, params: { actorId: id } }).data as any;

// ---------------------------------------------------------------------------
// 0. 模块形状（命名空间与常量）
// ---------------------------------------------------------------------------

test("常量是合理的：基线心情高于恢复量，一季 90 天", () => {
  assert.ok(MOOD_BASELINE > 0 && MOOD_BASELINE <= 10, `基线心情 ${MOOD_BASELINE} 在 0..10`);
  assert.ok(MOOD_RECOVERY > 0, "心情会恢复");
  assert.ok(MOOD_RECOVERY < MOOD_BASELINE, "恢复量小于基线，否则一跌就回满");
  assert.equal(SEASON_DAYS, 90, "一季 90 天，与世界的四季一致");
});

test("模块声明了自己的能力与命令", () => {
  assert.ok(villageWantsModule.manifest.provides?.length, "有 provides");
  assert.ok(Object.keys(WantCommands).length > 0);
  assert.ok(Object.keys(WantComponents).length > 0);
  assert.ok(Object.keys(WantProjections).length > 0);
  assert.ok(WantRejection.startsWith("E_"));
});

test("命令与组件都带自己的命名空间", () => {
  for (const type of Object.values(WantCommands)) {
    assert.ok(type.startsWith("village-wants."), `${type} 应带 village-wants. 前缀`);
  }
  for (const id of Object.values(WantComponents)) {
    assert.ok(id.startsWith("village-wants."), `${id} 应带 village-wants. 前缀`);
  }
  for (const id of Object.values(WantProjections)) {
    assert.ok(id.startsWith("village-wants."), `${id} 应带 village-wants. 前缀`);
  }
});

// ---------------------------------------------------------------------------
// 1. 数据
// ---------------------------------------------------------------------------

test("fear data is sound: four kinds, real places, real resources", () => {
  assert.deepEqual(wantsProblems(undefined, {
    places: RIVER_TERRACE_PACK.places.map((p) => p.id),
    resources: Object.keys(RIVER_TERRACE_PACK.resourceLabels),
    origins: (RIVER_TERRACE_PACK.origins ?? []).map((o) => o.id),
  }), []);
  const names = FEARS.map((f) => f.name);
  for (const wanted of ["怕水", "怕孤老", "怕被人看不起", "怕挨饿"]) {
    assert.ok(names.includes(wanted), `fear ${wanted} exists`);
  }
  for (const fear of FEARS) {
    assert.ok(fear.moodDrop > 0, `${fear.id} drops the mood`);
    assert.ok(fear.triggers.length > 0, `${fear.id} has triggers`);
    assert.ok(fear.avoidPlaces.every((p) => RIVER_TERRACE_PACK.places.some((place) => place.id === p)),
      `${fear.id} avoids real places`);
  }
  assert.ok(WISHES.length >= 3, `${WISHES.length} wish candidates`);
});

test("a broken fear is rejected with a reason", () => {
  const broken = {
    formatVersion: 1,
    fears: [{ id: "fear:test.bad", name: "", text: "", moodDrop: 0, triggers: [], avoidPlaces: ["place:nowhere"], refuseWorkBelow: 5, leaveVillageBelow: 1 }],
    originFears: { "no-such-origin": "fear:test.bad" },
    wishes: [],
  } as never;
  const problems = wantsProblems(broken, { places: ["place:river"], resources: [], origins: ["potter-kin"] });
  assert.ok(problems.some((p) => /unknown avoid place/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /needs at least one trigger/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /no fear/.test(p)), problems.join("\n"));
});

// ---------------------------------------------------------------------------
// 2. 恐惧触发 → 心情下降（可观测）
// ---------------------------------------------------------------------------

test("a fear trigger is observable: the mood drops and says why", () => {
  const { sim, me } = boot();
  const fear = fearById("fear:village-wants.water")!;
  assert.equal(sim.dispatch({ type: WantCommands.assignFear, actorId: me, source: "system", payload: { fearId: fear.id } }).ok, true);
  const before = person(sim, me).mood.level;

  const r = sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:river" } });
  assert.equal(r.ok, true, r.errors[0]?.message);
  const after = person(sim, me);
  assert.ok(after.mood.level < before, `mood should drop at the river (${before} -> ${after.mood.level})`);
  assert.equal(after.mood.level, Math.max(0, before - fear.moodDrop));
  assert.ok(after.mood.cause.length > 0, "the mood knows why it fell");
  assert.equal(after.fear.triggeredNow, true, "and the fear is currently triggered");

  const fell = sim.kernel.internals.eventLog.all().filter((e) => e.type === "village-wants.mood_fell" && e.actorId === me);
  assert.ok(fell.length >= 1);
  assert.ok(String(fell[0]!.data?.cause ?? "").length > 0);
});

test("a fear that is not triggered leaves the mood alone", () => {
  const { sim, me } = boot();
  const fear = fearById("fear:village-wants.water")!;
  sim.dispatch({ type: WantCommands.assignFear, actorId: me, source: "system", payload: { fearId: fear.id } });
  const before = person(sim, me).mood.level;
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:kiln" } }).ok, true);
  assert.equal(person(sim, me).mood.level, before, "the kiln is not a place this fear cares about");
});

test("the mood recovers on quiet days, but not while the fear is still triggered", () => {
  const { sim, me } = boot();
  const fear = fearById("fear:village-wants.water")!;
  sim.dispatch({ type: WantCommands.assignFear, actorId: me, source: "system", payload: { fearId: fear.id } });
  sim.dispatch({ type: WantCommands.feel, actorId: me, source: "system", payload: { delta: -5, cause: "test" } });
  const low = person(sim, me).mood.level;
  assert.ok(low < MOOD_BASELINE);

  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:river" } });
  sim.advanceBy(1);
  assert.ok(person(sim, me).mood.level <= low + 1, "being at the feared place does not let the mood heal");

  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:kiln" } });
  const before = person(sim, me).mood.level;
  sim.advanceBy(2);
  assert.ok(person(sim, me).mood.level >= before, "quiet days bring it back up");
});

// ---------------------------------------------------------------------------
// 3. 恐惧真的改变行为
// ---------------------------------------------------------------------------

test("a low mood makes a water-fearing player draw only a little at a time", () => {
  const { sim, me } = boot();
  const fear = fearById("fear:village-wants.water")!;
  sim.dispatch({ type: WantCommands.assignFear, actorId: me, source: "system", payload: { fearId: fear.id } });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:river" } });

  sim.dispatch({ type: WantCommands.feel, actorId: me, source: "system", payload: { delta: MOOD_BASELINE, cause: "" } });
  assert.ok(person(sim, me).mood.level >= TIMID_DRAW_BELOW);
  const plenty = sim.dispatch({
    type: SettlementCommands.draw, actorId: me, source: "player",
    payload: { placeId: "place:river", resourceId: "resource:water", amount: 2 },
  });
  assert.equal(plenty.ok, true, plenty.errors[0]?.message);

  sim.dispatch({ type: WantCommands.feel, actorId: me, source: "system", payload: { delta: -MOOD_BASELINE, cause: "test" } });
  assert.ok(person(sim, me).mood.level < TIMID_DRAW_BELOW);
  const timid = sim.dispatch({
    type: SettlementCommands.draw, actorId: me, source: "player",
    payload: { placeId: "place:river", resourceId: "resource:water", amount: 2 },
  });
  assert.equal(timid.ok, false, "a frightened hand does not fill a big jar");
  assert.equal(timid.errors[0]?.code, "E_WANT_NOT_NOW");
  const one = sim.dispatch({
    type: SettlementCommands.draw, actorId: me, source: "player",
    payload: { placeId: "place:river", resourceId: "resource:water", amount: 1 },
  });
  assert.equal(one.ok, true, one.errors[0]?.message);
});

test("a villager whose fear has bottomed out cannot work that day", () => {
  const { sim } = boot();
  const cook = residentId("cook");
  const fear = fearOf(sim.worldView(), cook);
  assert.ok(fear, "the cook has a fear");
  const spec = fearById(fear!.fearId)!;
  sim.dispatch({ type: WantCommands.feel, actorId: cook, source: "system", payload: { delta: -10, cause: "test" } });
  assert.ok(moodOf(sim.worldView(), cook).level <= spec.refuseWorkBelow);
  assert.equal(person(sim, cook).fear.refusesWork, true);

  const r = sim.dispatch({ type: SettlementCommands.tend, actorId: cook, source: "ai", payload: {} });
  assert.equal(r.ok, false, "the work is refused");
  assert.equal(r.errors[0]?.code, "E_WANT_NOT_NOW");
});

// ---------------------------------------------------------------------------
// 4. 短期愿望
// ---------------------------------------------------------------------------

test("every villager gets a wish at founding, and it is one of the candidates", () => {
  const { sim } = boot();
  const wishIds = new Set(WISHES.map((w) => w.id));
  for (const resident of RIVER_TERRACE_PACK.residents) {
    const id = residentId(resident.key);
    const view = person(sim, id);
    assert.ok(view.wish, `${resident.key} has a wish this season`);
    assert.ok(wishIds.has(view.wish.id), `${resident.key}'s wish is a real candidate`);
    assert.equal(view.wish.fulfilled, false);
  }
});

test("the wish changes next season, and the same season always gives the same wish", () => {
  const { sim } = boot();
  const cook = residentId("cook");
  const first = person(sim, cook).wish;
  const firstKey = seasonKey(sim.tick);

  sim.dispatch({ type: WantCommands.rollWish, actorId: cook, source: "system", payload: {} });
  assert.equal(person(sim, cook).wish.id, first.id, "a season keeps its wish");

  sim.advanceBy(SEASON_DAYS);
  sim.dispatch({ type: WantCommands.rollWish, actorId: cook, source: "system", payload: {} });
  const second = person(sim, cook).wish;
  assert.notEqual(second.season, firstKey, "a new season is a new wish");
  assert.equal(second.fulfilled, false);
  assert.equal(second.id, wishFor(cook, second.season).id, "the draw is deterministic");
});

test("a gift of the wished-for thing marks the wish fulfilled and lifts the mood", () => {
  const { sim, me } = boot(51);
  const pick = RIVER_TERRACE_PACK.residents
    .map((r) => ({ key: r.key, id: residentId(r.key), view: person(sim, residentId(r.key)) }))
    .find((x) => x.view.wish?.kind === "item");
  assert.ok(pick, "somebody wants a thing this season");
  const wish = WISHES.find((w) => w.id === pick!.view.wish.id)!;
  const resourceId = wish.resourceId!;

  const yieldPlace = RIVER_TERRACE_PACK.yields.find((y) => y.resourceId === resourceId)!.placeId;
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: yieldPlace } }).ok, true);
  const draw = sim.dispatch({
    type: SettlementCommands.draw, actorId: me, source: "player",
    payload: { placeId: yieldPlace, resourceId, amount: 1 },
  });
  assert.equal(draw.ok, true, `draw ${resourceId} at ${yieldPlace}: ${draw.errors[0]?.message}`);
  const itemId = tradeableGoods(sim.worldView(), me)[resourceId]?.[0];
  assert.ok(itemId, `the drawn ${resourceId} is in hand`);

  const place = occupiedPlaceId(sim.worldView(), pick!.id);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: place } }).ok, true);

  const moodBefore = person(sim, pick!.id).mood.level;
  const gift = sim.dispatch({
    type: SettlementCommands.gift, actorId: me, source: "player",
    payload: { targetId: pick!.id, itemId },
  });
  assert.equal(gift.ok, true, gift.errors[0]?.message);

  const after = person(sim, pick!.id);
  assert.equal(after.wish.fulfilled, true, "the wish is answered");
  assert.ok(after.mood.level > moodBefore, `a wish answered lifts the mood (${moodBefore} -> ${after.mood.level})`);
  assert.ok(socialOf(sim.worldView(), pick!.id).bonds[me], "the settlement recorded how they feel about you now");
});

test("a deed wish comes true by simply being there (deed branch)", () => {
  const { sim, me } = boot(51);
  const pick = RIVER_TERRACE_PACK.residents
    .map((r) => ({ key: r.key, id: residentId(r.key), view: person(sim, residentId(r.key)) }))
    .find((x) => x.view.wish?.kind === "deed" && x.view.wish.id === "wish:village-wants.a-talk");
  if (!pick) return;
  const place = occupiedPlaceId(sim.worldView(), pick.id);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: place } });
  const talk = sim.dispatch({
    type: SettlementCommands.talk, actorId: me, source: "player", payload: { targetId: pick.id },
  });
  assert.equal(talk.ok, true, talk.errors[0]?.message);
  assert.equal(person(sim, pick.id).wish.fulfilled, true, "being talked to answered it");
});

// ---------------------------------------------------------------------------
// 5. 玩家：出身决定恐惧
// ---------------------------------------------------------------------------

test("a new life's origin decides what it is afraid of", () => {
  const { sim, me } = boot();
  assert.equal(fearOf(sim.worldView(), me), undefined, "founding only assigns fears to villagers");

  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:yard" } }).ok, true);
  const origin = (RIVER_TERRACE_PACK.origins ?? [])[0]!;
  const r = sim.dispatch({
    type: SettlementCommands.chooseOrigin, actorId: me, source: "player",
    payload: { originId: origin.id, talents: [] },
  });
  assert.equal(r.ok, true, r.errors[0]?.message);

  const fear = fearOf(sim.worldView(), me);
  assert.ok(fear, "the origin left a fear behind");
  const view = sim.project({ id: WantProjections.player, params: { actorId: me } }).data as any;
  assert.equal(view.fear.id, fear!.fearId);
  assert.ok(view.fear.text.length > 0, "the fear has words the player can read");
  for (const place of view.places) {
    assert.ok(place.note.length > 0, `${place.placeId} has a line about the fear`);
  }
});

test("the fear assignment is deterministic", () => {
  assert.equal(fearFor("settlement-locations:resident:yu").id, fearFor("settlement-locations:resident:yu").id);
  const kinds = new Set(RIVER_TERRACE_PACK.residents.map((r) => fearFor(residentId(r.key)).id));
  assert.ok(kinds.size >= 2, `fears should not all be the same, saw ${[...kinds].join(",")}`);
});
