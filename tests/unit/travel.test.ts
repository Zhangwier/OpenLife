/**
 * 远行：离开聚落去别的地方，路上要花天数。
 *
 * 远行的核心承诺：不是瞬移。出发 → 路上 N 天 → 到达 → 回来。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  travelModule, TravelCommands, TravelProjections, TravelRejection,
  routeDays, routeExists, findRoute, journeyArrived, journeyDay, encounterFor,
} from "@openlife/module-travel";

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      travelModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  return sim;
}

test("路线花几天由距离和路况决定", () => {
  assert.ok(routeDays(4, "mountain") > routeDays(4, "road"), "翻山比走大路慢");
  assert.ok(routeDays(4, "river") < routeDays(4, "road"), "走水路比走大路快");
  assert.ok(routeDays(1, "road") >= 1, "至少一天");
});

test("有没有路，按 edges 查", () => {
  const edges = [
    { from: "a", to: "b" },
    { from: "b", to: "c", terrain: "mountain" },
  ];
  assert.ok(routeExists(edges, "a", "b"));
  assert.ok(routeExists(edges, "b", "a"), "路是双向的");
  assert.ok(!routeExists(edges, "a", "c"), "隔一段不算直达");
});

test("找一条路线，给出天数和路况", () => {
  const route = findRoute([{ from: "a", to: "b", terrain: "mountain" }], "a", "b");
  assert.ok(route);
  assert.equal(route.terrain, "mountain");
  assert.ok(route.days >= 1);
});

test("一天过去，远行的天数减一", () => {
  const journey = { id: "j:1", who: "me", from: "a", to: "b", departedAt: 0, daysLeft: 3, route: { from: "a", to: "b", days: 3, terrain: "road" as const, encounters: [] }, encounters: [] };
  const next = journeyDay(journey, null);
  assert.equal(next.daysLeft, 2);
  assert.equal(journeyArrived(next), false);
  assert.equal(journeyArrived({ ...next, daysLeft: 0 }), true);
});

test("完整链路：出发 → 路上 → 到达", { timeout: 60000 }, () => {
  const sim = world();
  // 出发
  const depart = sim.dispatch({ type: TravelCommands.depart, payload: { to: "远山", days: 2 }, source: "player" });
  assert.equal(depart.ok, true, JSON.stringify(depart.errors));

  // 路上第一天：还没到
  const view1 = sim.project({ id: TravelProjections.journey, params: {} });
  assert.equal(view1.ok, true);
  assert.equal((view1.data as Record<string, unknown>).arrived, false);

  // 走两天
  sim.dispatch({ type: TravelCommands.day, source: "player" });
  sim.dispatch({ type: TravelCommands.day, source: "player" });

  // 到了
  const view2 = sim.project({ id: TravelProjections.journey, params: {} });
  assert.equal((view2.data as Record<string, unknown>).arrived, true);

  // 落脚
  const arrive = sim.dispatch({ type: TravelCommands.arrive, source: "player" });
  assert.equal(arrive.ok, true, JSON.stringify(arrive.errors));

  // 落脚后就没有正在走的路了
  const view3 = sim.project({ id: TravelProjections.journey, params: {} });
  assert.equal((view3.data as Record<string, unknown>).travelling, false);
});

test("已经在路上就不能再出发", () => {
  const sim = world();
  sim.dispatch({ type: TravelCommands.depart, payload: { to: "远山", days: 2 }, source: "player" });
  const again = sim.dispatch({ type: TravelCommands.depart, payload: { to: "另一处", days: 1 }, source: "player" });
  assert.equal(again.ok, false);
  assert.equal(again.errors[0]!.code, TravelRejection.AlreadyTravelling);
});

test("还没走到不能落脚", () => {
  const sim = world();
  sim.dispatch({ type: TravelCommands.depart, payload: { to: "远山", days: 3 }, source: "player" });
  const arrive = sim.dispatch({ type: TravelCommands.arrive, source: "player" });
  assert.equal(arrive.ok, false);
  assert.equal(arrive.errors[0]!.code, TravelRejection.NotArrived);
});

test("没有正在走的路就不能过一天", () => {
  const sim = world();
  const day = sim.dispatch({ type: TravelCommands.day, source: "player" });
  assert.equal(day.ok, false);
  assert.equal(day.errors[0]!.code, TravelRejection.NoJourney);
});

test("远行状态随存档持久化", () => {
  const sim = world();
  sim.dispatch({ type: TravelCommands.depart, payload: { to: "远山", days: 3 }, source: "player" });
  const before = sim.worldView().getComponent("travel:current", "travel.journey") as
    { to: string; daysLeft: number } | undefined;
  assert.equal(before?.to, "远山");
  assert.equal(before?.daysLeft, 3);

  const saved = sim.save();
  const loaded = Simulation.load(saved, [modernWorldModule, worldClockModule, worldSpaceModule,
    worldObjectsModule, travelModule]);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation.worldView().getComponent("travel:current", "travel.journey") as
    { to: string; daysLeft: number } | undefined;
  assert.equal(after?.to, "远山", "读档后还在路上");
  assert.equal(after?.daysLeft, 3);
});
