/**
 * 今日指引：最要紧的一件事 + 至多三条建议 + 做不成的下一步 + 明日预告。
 * 关键保证：指引给出的每一个按钮，在同一时刻的世界里真的能执行（存档复制一份世界去点）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, calendarDate, feastOn, dailyActivity } from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, GUIDE_PACK, guideProblems, sourceOf, ownedInHand, type DailyGuide, type GuideAction,
} from "@openlife/module-village-stories";

const MODULES = [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule];
const YEAR0 = 18 * 360;

function life() {
  const sim = new Simulation({ worldSeed: 7, modules: MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(YEAR0);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const guide = () => {
    const r = sim.project({ id: StoryProjections.guide, params: { actorId: me } });
    assert.equal(r.ok, true);
    return r.data as unknown as DailyGuide;
  };
  /** Click the button in a copy of this very world: it must go through. */
  const works = (a: GuideAction) => {
    const { simulation } = Simulation.load(sim.save(), MODULES);
    assert.ok(simulation, "the world copies");
    const r = simulation!.dispatch({ type: a.type, actorId: me, source: "player", payload: a.payload as never });
    assert.equal(r.ok, true, `${a.type} ${JSON.stringify(a.payload)} → ${r.errors?.[0]?.message}`);
  };
  const allClicks = (g: DailyGuide) => [g.focus?.action, ...g.suggestions.map((s) => s.action), ...g.blocked.map((b) => b.action)].filter(Boolean) as GuideAction[];
  return { sim, me, act, guide, works, allClicks };
}

test("the guide's data is sound", () => {
  assert.deepEqual(guideProblems(), []);
  assert.ok(GUIDE_PACK.maxSuggestions <= 3, "never more than three suggestions at once");
  assert.match(sourceOf("resource:reed").how, /芦苇滩/);
  assert.match(sourceOf("resource:rope").how, /搓一根草绳/, "a made thing points to its recipe");
});

test("first morning: one clear thing to do, at most three more, and every button works", () => {
  const { guide, works, allClicks } = life();
  const g = guide();
  assert.equal(g.focus?.id, "quest-new:main-1-arrival", "the first chapter is what matters first");
  assert.ok(g.suggestions.length <= 3);
  for (const a of allClicks(g)) works(a);
  assert.deepEqual(guide(), g, "the same world gives the same guide");
});

test("things you cannot do yet come with the next step, and the step is a real walk", () => {
  const { guide, works } = life();
  const g = guide();
  const roof = g.blocked.find((b) => b.label === "修补屋顶")!;
  assert.match(roof.reason, /芦苇/);
  assert.match(roof.next, /芦苇滩/);
  assert.equal(roof.action?.payload.placeId, "place:reedbed");
  works(roof.action!);
  const shape = g.blocked.find((b) => b.label === "捏一个陶坯")!;
  assert.equal(shape.action?.payload.spaceId, "space:drying-rack", "walks to the rack, not just the yard");
  const water = g.blocked.find((b) => b.actionId === "settlement-locations.drink")!;
  assert.match(water.next, /陶罐/);
});

test("body first: out of strength means end the day; hunger rises above any errand", () => {
  const { sim, me, act, guide, works } = life();
  act(SettlementCommands.arrive, { placeId: "place:reedbed" });
  while (dailyActivity(sim.worldView(), me).remaining > 0) {
    const r = act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" });
    if (!r.ok) { assert.equal(act(SettlementCommands.arrive, { placeId: occupiedPlaceId(sim.worldView(), me) === "place:river" ? "place:field" : "place:river" }).ok, true); }
  }
  const tired = guide();
  assert.equal(tired.focus?.kind, "exhausted");
  assert.equal(tired.focus?.action?.type, "settlement-locations.end_day");
  works(tired.focus!.action!);

  sim.advanceBy(12); // hunger +1 every two days
  const hungry = guide();
  assert.ok(["hungry", "starving"].includes(hungry.focus?.kind ?? ""), JSON.stringify(hungry.focus));
  assert.match(hungry.focus!.why, /饥饿/);
  if (hungry.focus!.action) works(hungry.focus!.action);
});

test("today only: a festival outranks quests, and the click is the rite or the walk to it", () => {
  const { sim, act, guide, works } = life();
  assert.equal(act(StoryCommands.acceptQuest, { questId: "main-1-arrival" }).ok, true);
  let t = sim.tick + 1;
  while (!feastOn(t)) t += 1;
  sim.advanceBy(t - 1 - sim.tick);
  const eve = guide();
  assert.ok(eve.tomorrow.some((l) => l.includes(feastOn(t)!.name)), `the eve warns of ${feastOn(t)!.name}: ${eve.tomorrow}`);
  sim.advanceBy(1);
  const g = guide();
  const ranked = [g.focus!, ...g.suggestions];
  const fest = ranked.findIndex((s) => s.kind === "festival");
  assert.ok(fest >= 0, JSON.stringify(ranked));
  assert.ok(ranked.slice(0, fest).every((s) => ["exhausted", "starving"].includes(s.kind)), "only an emptied body comes before the festival");
  assert.ok(ranked[fest]!.action, "either the rite or the way there");
  works(ranked[fest]!.action!);
  assert.ok(g.suggestions.some((s) => s.id === "quest:main-1-arrival") || g.more > 0, "the errand waits its turn");
  assert.ok(g.tomorrow.some((l) => /托付/.test(l)));
});

test("a quest step points to where it is done, then turns into a hand-in when it is", () => {
  const { sim, me, act, guide, works } = life();
  const reedWorker = "settlement-locations:resident:reed-worker";
  for (let i = 0; i < 4 && occupiedPlaceId(sim.worldView(), reedWorker) !== occupiedPlaceId(sim.worldView(), me); i += 1) {
    act(SettlementCommands.arrive, { placeId: occupiedPlaceId(sim.worldView(), reedWorker) });
  }
  const offered = guide();
  assert.ok([offered.focus, ...offered.suggestions].some((s) => s?.kind === "quest-new"), "standing by someone with a request, the guide offers it");
  assert.equal(act(StoryCommands.acceptQuest, { questId: "side-reed-thin" }).ok, true);
  const step = () => { const g = guide(); return [g.focus, ...g.suggestions].find((s) => s?.id === "quest:side-reed-thin"); };
  const walk = step();
  assert.ok(walk, "the side story is on the guide");
  if (occupiedPlaceId(sim.worldView(), me) !== "place:reedbed") {
    assert.equal(walk!.action?.payload.placeId, "place:reedbed", "cutting reed happens at the reedbed");
    works(walk!.action!);
    assert.equal(act(SettlementCommands.arrive, { placeId: "place:reedbed" }).ok, true);
  } else {
    assert.equal(walk!.action?.payload.resourceId, "resource:reed", "already where it is done: the button is the work itself");
    works(walk!.action!);
  }
  for (let n = 0; n < 3; n += 1) {
    if (dailyActivity(sim.worldView(), me).remaining < 2) sim.advanceBy(1);
    assert.equal(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }).ok, true);
  }
  assert.match(step()!.why, /阿苇|送/);
  // Find 阿苇 and stand beside him with the reed in hand.
  for (let i = 0; i < 4; i += 1) {
    const at = occupiedPlaceId(sim.worldView(), "settlement-locations:resident:reed-worker");
    if (at === occupiedPlaceId(sim.worldView(), me)) break;
    if (dailyActivity(sim.worldView(), me).remaining < 1) sim.advanceBy(1);
    act(SettlementCommands.arrive, { placeId: at });
  }
  const ready = step()!;
  assert.equal(ready.kind, "quest-ready", JSON.stringify(ready));
  assert.equal(ready.action?.type, StoryCommands.turnIn);
  works(ready.action!);
  void calendarDate;
});
