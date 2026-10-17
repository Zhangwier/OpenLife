/**
 * A6 经济接入：荒年粮价上涨，交换要用更多东西换粮。
 *
 * 这是开发文档 A6.2 的验收标准：
 *  - 荒年粮价上涨，交换时要用更多东西换粮
 *  - 债役的发生率随粮价波动而变化
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  economyModule, EconomyCommands, EconomyProjections,
  BASE_PRICES, costOf, debtAfterYear, defaultChanceOf, interestOf,
  marketReach, productivityFromSpecialization, updatePrices,
} from "@openlife/module-economy";

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      economyModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  return sim;
}

test("初始价格表是数据", () => {
  assert.ok(Object.keys(BASE_PRICES).length >= 4);
  assert.equal(BASE_PRICES["resource:grain"].ratio, 1, "粮是基准");
});

test("荒年粮价上涨", () => {
  const supply = { "resource:grain": 10, "resource:fuel": 20 };
  const demand = { "resource:grain": 10, "resource:fuel": 20 };
  const normal = updatePrices(BASE_PRICES, supply, demand, false, () => ({ chance: () => false }));
  const lean = updatePrices(BASE_PRICES, supply, demand, true, () => ({ chance: () => false }));
  assert.ok(lean["resource:grain"].ratio > normal["resource:grain"].ratio,
    `荒年粮价该涨（正常 ${normal["resource:grain"].ratio} → 荒年 ${lean["resource:grain"].ratio}）`);
});

test("荒年交换要用更多东西换粮", () => {
  const normal = updatePrices(BASE_PRICES, { "resource:grain": 10 }, { "resource:grain": 10 }, false, () => ({ chance: () => false }));
  const lean = updatePrices(BASE_PRICES, { "resource:grain": 10 }, { "resource:grain": 10 }, true, () => ({ chance: () => false }));
  const normalCost = costOf(normal, "resource:grain", 1, "resource:fuel");
  const leanCost = costOf(lean, "resource:grain", 1, "resource:fuel");
  assert.ok(leanCost > normalCost, `荒年换粮更贵（正常 ${normalCost} → 荒年 ${leanCost}）`);
});

test("借贷的利息和违约概率随粮价波动", () => {
  const volatile = updatePrices(BASE_PRICES, { "resource:grain": 5 }, { "resource:grain": 20 }, true, () => ({ chance: () => false }));
  const calm = updatePrices(BASE_PRICES, { "resource:grain": 10 }, { "resource:grain": 10 }, false, () => ({ chance: () => false }));
  assert.ok(interestOf(volatile, "resource:grain", true) > interestOf(calm, "resource:grain", false),
    "波动大利息高");
  assert.ok(defaultChanceOf(volatile, "resource:grain", true) > defaultChanceOf(calm, "resource:grain", false),
    "波动大违约率高");
});

test("专业分工提高生产率", () => {
  assert.ok(productivityFromSpecialization(4, 20) > productivityFromSpecialization(0, 20));
  assert.ok(productivityFromSpecialization(8, 20) > productivityFromSpecialization(4, 20));
});

test("开集以后交换范围扩大", () => {
  assert.equal(marketReach(1, 1), 2, "开集翻倍");
  assert.equal(marketReach(0, 1), 1, "没开集不变");
});

test("铺下价格表后，投影说得出今年的粮价", () => {
  const sim = world();
  const r = sim.dispatch({ type: EconomyCommands.found, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const view = sim.project({ id: EconomyProjections.prices, params: {} });
  assert.equal(view.ok, true);
  const data = view.data as Record<string, unknown>;
  assert.ok(typeof data.line === "string");
  assert.ok(!/\d/.test(String(data.line)), "不出现数字");
});

test("荒年推进一年后，粮价真的涨了", () => {
  const sim = world();
  sim.dispatch({ type: EconomyCommands.found, source: "system" });
  const before = sim.worldView().getComponent("economy:village", "economy.state") as
    { prices: Record<string, { ratio: number }> } | undefined;
  const r = sim.dispatch({ type: EconomyCommands.year, payload: {
    supply: { "resource:grain": 10 }, demand: { "resource:grain": 10 }, lean: true,
  }, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const after = sim.worldView().getComponent("economy:village", "economy.state") as
    { prices: Record<string, { ratio: number }> } | undefined;
  assert.ok(after!.prices["resource:grain"].ratio > before!.prices["resource:grain"].ratio,
    "荒年粮价该涨");
});

test("没有账本就推进不了一年", () => {
  const sim = world();
  const r = sim.dispatch({ type: EconomyCommands.year, payload: { supply: {}, demand: {} }, source: "system" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /账/);
});

test("经济状态随存档持久化", () => {
  const sim = world();
  sim.dispatch({ type: EconomyCommands.found, source: "system" });
  sim.dispatch({ type: EconomyCommands.year, payload: {
    supply: { "resource:grain": 10 }, demand: { "resource:grain": 10 }, lean: true,
  }, source: "system" });
  const before = sim.worldView().getComponent("economy:village", "economy.state") as
    { prices: Record<string, { ratio: number }> } | undefined;

  const saved = sim.save();
  const loaded = Simulation.load(saved, [modernWorldModule, worldClockModule, worldSpaceModule,
    worldObjectsModule, economyModule]);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation.worldView().getComponent("economy:village", "economy.state") as
    { prices: Record<string, { ratio: number }> } | undefined;
  assert.equal(after?.prices["resource:grain"]?.ratio, before?.prices["resource:grain"]?.ratio,
    "读档后粮价还在");
});
