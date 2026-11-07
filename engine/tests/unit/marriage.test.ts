/**
 * 结亲：交情处到 8 颗心才开得了口；对方信得过你才点头；定亲几天后当着全村成亲。
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
  settlementLocationsModule, SettlementCommands, homestead, residentId, liveSeason, romanceOf, spouseOf, socialOf, bondOf, heartsOf, kinOf,
} from "@openlife/module-settlement-locations";

/**
 * `seed` 是参数的第二个位置：这个文件多数用例只推进几个季节，任一世界种子都行；
 * 但「人走了一整村都知道」那条要用阿汲做那个「出意外的人」，它得活到那时候。
 * 意外死亡按 (角色, 年龄) 键控，所以换种子等于换一副骰子——选一个阿汲活着的世界，
 * 而不是把断言放宽到「谁死了都行」。
 */
function life(years = 18, seed = 7) {
  const sim = new Simulation({ worldSeed: seed, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(360 * years);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const meet = (id: string) => {
    const at = occupiedPlaceId(sim.worldView(), id);
    if (at !== occupiedPlaceId(sim.worldView(), me)) act(SettlementCommands.arrive, { placeId: at });
  };
  return { sim, me, act, meet };
}

test("you can't court someone you barely know", () => {
  const { sim, me, act, meet } = life();
  const yu = residentId("yu");
  meet(yu);
  const r = act(SettlementCommands.court, { targetId: yu });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /交情还不够/);
  assert.equal(romanceOf(sim.worldView(), me, yu), "");
  assert.equal(romanceOf(sim.worldView(), me, residentId("elder")), "taken", "陶叔 has 陶婶");
});

test("seasons side by side, then a word from the heart, a betrothal and a wedding the whole village remembers", () => {
  const { sim, me, act, meet } = life();
  const yu = residentId("yu");
  for (let i = 0; i < 5; i++) assert.equal(liveSeason(sim as never, me, "farm").ok, true);
  assert.ok(heartsOf(bondOf(socialOf(sim.worldView(), yu), me)) >= 8, JSON.stringify(bondOf(socialOf(sim.worldView(), yu), me)));
  meet(yu);
  const offered = homestead(sim.worldView(), me).actions.find((a) => a.id === SettlementCommands.court && a.payload.targetId === yu);
  assert.ok(offered?.enabled, offered?.reason);
  assert.equal(act(SettlementCommands.court, { targetId: yu }).ok, true);
  assert.equal(romanceOf(sim.worldView(), me, yu), "engaged");
  const early = act(SettlementCommands.wed, { targetId: yu });
  assert.equal(early.ok, false);
  sim.advanceBy(3);
  meet(yu);
  const wed = act(SettlementCommands.wed, { targetId: yu });
  assert.equal(wed.ok, true, wed.errors?.[0]?.message);
  assert.equal(spouseOf(sim.worldView(), me), yu);
  assert.equal(spouseOf(sim.worldView(), yu), me);
  assert.ok(kinOf(sim.worldView(), yu).includes(me), "your spouse counts you as family");
  const card = homestead(sim.worldView(), me).neighbours.find((p) => p.id === yu)!;
  assert.equal(card.romance, "成了亲");
  const lan = socialOf(sim.worldView(), residentId("lan"));
  assert.ok(Object.values(lan.news ?? {}).some((n) => /成了亲/.test(n.text)));
});

test("married life: a child is on the way, born months later, and at six lives in the village on its own", async () => {
  const { familyView, people } = await import("@openlife/module-settlement-locations");
  const { sim, me, act, meet } = life();
  const yu = residentId("yu");
  for (let i = 0; i < 5; i++) liveSeason(sim as never, me, "farm");
  meet(yu); act(SettlementCommands.court, { targetId: yu });
  sim.advanceBy(3); meet(yu);
  assert.equal(act(SettlementCommands.wed, { targetId: yu }).ok, true);
  const story: string[] = [];
  let seasons = 0;
  while (familyView(sim.worldView(), me).children.length === 0 && seasons < 24) {
    const seq = sim.kernel.internals.eventLog.nextSeq;
    liveSeason(sim as never, me, "family");
    seasons++;
    for (const e of sim.kernel.internals.eventLog.since(seq - 1)) if (e.type === "settlement-locations.season_lived") story.push(String(e.data.line));
  }
  const fam = familyView(sim.worldView(), me);
  assert.equal(fam.children.length, 1, story.join("\n"));
  assert.ok(story.some((l) => /添丁/.test(l)) && story.some((l) => /孩子出生了/.test(l)), story.join("\n"));
  const kid = fam.children[0]!;
  assert.equal(sim.worldView().listRelations({ type: "family.parent_of", from: yu }).some((r) => r.to === kid.id), true);
  for (let i = 0; i < 26 && familyView(sim.worldView(), me).children[0]!.age < 6; i++) liveSeason(sim as never, me, "family");
  liveSeason(sim as never, me, "family");
  assert.ok(sim.worldView().getComponent(kid.id, "settlement-locations.resident"), "the child now lives in the village");
  assert.ok((people(sim.worldView()).residents as Array<{ id: string }>).some((p) => p.id === kid.id));
  sim.advanceBy(1);
  assert.ok(familyView(sim.worldView(), me).children[0]!.stage.length > 0);
});

test("when a villager dies the whole village hears of it; when you die, a grown child takes up your life", async () => {
  const { familyView, heirsOf } = await import("@openlife/module-settlement-locations");
  // 这条用例要拿阿汲当「出事的那个人」，所以挑一个阿汲能活到这时候的世界（见 life() 注释）。
  const { sim, me, act, meet } = life(18, 1);
  const yu = residentId("yu");
  for (let i = 0; i < 5; i++) liveSeason(sim as never, me, "farm");
  meet(yu); act(SettlementCommands.court, { targetId: yu }); sim.advanceBy(3); meet(yu); act(SettlementCommands.wed, { targetId: yu });
  for (let i = 0; i < 120 && !familyView(sim.worldView(), me).children.some((c) => c.age >= 16); i++) liveSeason(sim as never, me, "family");
  const heir = heirsOf(sim.worldView(), me)[0];
  assert.ok(heir, "a child grew up");
  // 埴公年纪最大，这些年里已经走了（享年到了就走）。再让阿汲出个意外。
  assert.equal(sim.worldView().getComponent(residentId("trader-elder"), "modern.vitals")?.alive, false, "埴公 reached his years");
  const seq = sim.kernel.internals.eventLog.nextSeq;
  sim.dispatch({ type: "modern.die", actorId: residentId("water-carrier"), source: "system", payload: { cause: "accident" } });
  const said = sim.kernel.internals.eventLog.since(seq - 1).find((e) => e.type === "settlement-locations.passed_away");
  assert.match(String(said?.data.line ?? ""), /阿汲走了/);
  assert.ok(Object.values(socialOf(sim.worldView(), yu).news ?? {}).some((n) => /阿汲走了/.test(n.text)), "the village heard");
  assert.equal(homestead(sim.worldView(), me).actions.some((a) => a.id === SettlementCommands.talk && a.payload.targetId === residentId("water-carrier")), false);
  // 你走了。
  sim.dispatch({ type: "modern.die", actorId: me, source: "system", payload: { cause: "old age" } });
  const r = sim.dispatch({ type: SettlementCommands.handoff, actorId: me, source: "player", payload: { targetId: heir!.id } });
  assert.equal(r.ok, true, r.errors?.[0]?.message);
  assert.equal(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId, heir!.id);
  const h = homestead(sim.worldView(), heir!.id);
  assert.equal(h.neighbours.some((n) => n.id === heir!.id), false, "you are not your own neighbour");
  assert.ok(h.actions.length > 0);
  assert.ok(sim.worldView().listRelations({ type: "family.parent_of", to: heir!.id }).some((x) => x.from === yu), "the other parent is still there");
});
