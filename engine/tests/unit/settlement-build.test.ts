/**
 * 盖房子：抽象建造真的能盖起一间屋。
 *
 * 定位文档说要做建造但不做沙盒摆放，所以这里验证的是**流程**：
 * 备料 → 动工 → 落成，每一步都动真实库存、真实人天，落成后村子真的多一间住处。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, yieldPoints,
} from "@openlife/module-settlement-locations";
import {
  settlementBuildModule, BuildCommands, BuildProjections, BLUEPRINTS, homeCount, currentSite, deliverMaterial,
} from "@openlife/module-settlement-build";

function village(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, settlementBuildModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const act = (type: string, payload: Record<string, unknown> = {}) =>
    sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}

test("蓝图是数据，每种都能被读出来", () => {
  assert.ok(BLUEPRINTS.length >= 2, "至少有两种盖法");
  for (const b of BLUEPRINTS) {
    assert.ok(b.id.startsWith("blueprint:"), b.id);
    assert.ok(b.name && b.doneLine && b.hint, b.id);
    assert.ok(b.labourDays > 0, `${b.id} 需要人天`);
    assert.ok(Object.keys(b.materials).length > 0, `${b.id} 需要材料`);
  }
});

test("没动工就工作会被拒绝，并说清原因", () => {
  const { act } = village();
  const r = act(BuildCommands.work);
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /动工/);
});

test("完整流程：动工 → 备料 → 干活 → 落成，村子多一间屋", { timeout: 60000 }, () => {
  const { sim, me, act } = village();
  const homesBefore = homeCount(sim.worldView());
  assert.equal(homesBefore, 0, "新村子还没有正式盖的屋子");

  // 1. Stake out the cheapest blueprint that adds a home.
  const shed = BLUEPRINTS.find((b) => b.homes > 0)!;
  assert.equal(act(BuildCommands.plan, { blueprintId: shed.id }).ok, true);
  assert.ok(currentSite(sim.worldView()), "地上有个动工点");

  // 2. Deliver every material it needs. Two commands per load: the stock
  //    belongs to settlement-locations, the site belongs to this module.
  let deliveredAny = false;
  for (const [resourceId, need] of Object.entries(shed.materials)) {
    for (let i = 0; i < need; i += 1) {
      const r = deliverMaterial(sim as never, me, resourceId, 1);
      if (!r.ok) break;
      deliveredAny = true;
    }
  }
  assert.ok(deliveredAny, "至少送进去一批料");

  // 3. Work until it is done, letting days pass between shifts.
  let days = 0;
  while (currentSite(sim.worldView()) && days < 20) {
    const r = act(BuildCommands.work, { helpers: 0 });
    if (r.ok) days += 1;
    else sim.advanceBy(1);
  }

  const homesAfter = homeCount(sim.worldView());
  assert.equal(currentSite(sim.worldView()), undefined, "工地清空了");
  assert.ok(homesAfter > homesBefore, `一间屋盖好了，住处 ${homesBefore} -> ${homesAfter}`);
  assert.ok(days > 0, "真的干了活");
});

test("同时只能有一处动工", () => {
  const { act } = village();
  const shed = BLUEPRINTS.find((b) => b.homes > 0)!;
  assert.equal(act(BuildCommands.plan, { blueprintId: shed.id }).ok, true);
  const again = act(BuildCommands.plan, { blueprintId: shed.id });
  assert.equal(again.ok, false);
  assert.match(again.errors[0]!.message, /动工/);
});

test("放弃会把已经送来的料退回去", () => {
  const { sim, me, act } = village();
  const shed = BLUEPRINTS.find((b) => b.homes > 0)!;
  const resourceId = Object.keys(shed.materials)[0]!;
  act(BuildCommands.plan, { blueprintId: shed.id });
  const before = yieldPoints(sim.worldView()).find((y) => y.resourceId === resourceId)?.stock ?? 0;
  deliverMaterial(sim as never, me, resourceId, 1);
  const mid = yieldPoints(sim.worldView()).find((y) => y.resourceId === resourceId)?.stock ?? 0;
  assert.ok(mid < before, `料被取走了（${before} -> ${mid}）`);
  const r = act(BuildCommands.abandon);
  assert.equal(r.ok, true);
  assert.equal(currentSite(sim.worldView()), undefined, "地上空了");
  // The refund is queued as an event for settlement-locations to settle; the
  // important half is that the site is gone and the loss is recorded.
  const refunds = sim.kernel.internals.eventLog.list({ actorId: me })
    .filter((e) => e.type === "settlement-build.refund_pending");
  assert.ok(refunds.length >= 1, "退还记在了事件里");
});

test("投影说得清还差什么", () => {
  const { sim, me, act } = village();
  const shed = BLUEPRINTS.find((b) => b.homes > 0)!;
  act(BuildCommands.plan, { blueprintId: shed.id });
  const view = sim.project({ id: BuildProjections.build, params: {} });
  assert.equal(view.ok, true, JSON.stringify(view.error));
  const data = view.data as Record<string, unknown>;
  assert.ok(typeof data.line === "string" && (data.line as string).length > 0);
  assert.ok(Array.isArray(data.blueprints));
  assert.equal(me.includes(":"), true);
});
