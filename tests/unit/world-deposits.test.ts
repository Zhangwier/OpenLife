/**
 * A4 矿藏与资源分布：附近没有铜的村子，永远造不出 copper-smelting。
 *
 * 这是开发文档 A4.2 的验收标准：
 *  - 附近没有铜也没有铜的贸易路线的村子，永远造不出 copper-smelting
 *  - 有了贸易路线以后，造得出，但晚于产地
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  worldDepositsModule, DepositsCommands, DepositsProjections,
  generateDeposits, hasDeposit, meetsDepositRequirement, missingDeposit,
  DEPOSIT_TO_MATERIAL,
} from "@openlife/module-world-deposits";

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      worldDepositsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  return sim;
}

test("矿藏图生成后，同种子结果固定", () => {
  const a = generateDeposits(8, 8, () => ({ chance: () => true, nextFloat: () => 0.5 }));
  const b = generateDeposits(8, 8, () => ({ chance: () => true, nextFloat: () => 0.5 }));
  assert.deepEqual(a.deposits, b.deposits, "同种子同结果");
  assert.ok(a.deposits.length > 0, "有矿藏");
});

test("铜只长在山岭与河流交汇处", () => {
  const map = generateDeposits(8, 8, (p, ...parts) => ({
    chance: (x) => parts[0] === "copper" && x < 0.5,
    nextFloat: () => 0.5,
  }));
  const copper = map.deposits.filter((d) => d.tag === "deposit:copper");
  for (const d of copper) {
    const isHighland = (d.x + d.y) % 3 === 0;
    const hasRiver = d.y % 2 === 0;
    assert.ok(isHighland && hasRiver, `铜(${d.x},${d.y}) 该在山岭与河流交汇处`);
  }
});

test("一个政体周围有没有矿，按半径算", () => {
  // 手工铺一张图，位置已知，半径可测。
  const map = {
    deposits: [
      { id: "deposit:copper:2:2", tag: "deposit:copper", x: 2, y: 2, richness: 0.5, why: "变质岩层遇水析出" },
      { id: "deposit:coal:8:8", tag: "deposit:coal", x: 8, y: 8, richness: 0.5, why: "古湖沼淤积成煤" },
    ],
    geology: "test",
  };
  assert.ok(hasDeposit(map, "deposit:copper", 2, 2, 0), "原地有");
  assert.ok(hasDeposit(map, "deposit:copper", 5, 2, 3), "半径 3 内有");
  assert.ok(!hasDeposit(map, "deposit:copper", 8, 8, 3), "半径 3 外没有");
  assert.ok(hasDeposit(map, "deposit:coal", 8, 8, 0), "另一处有煤");
});

test("附近没有铜也没有贸易路线的村子，永远造不出 copper-smelting", () => {
  // A4.2 的核心验收
  const map = generateDeposits(8, 8, () => ({ chance: () => false, nextFloat: () => 0.5 }));
  // 一张没有铜的图
  const noCopper = { ...map, deposits: map.deposits.filter((d) => d.tag !== "deposit:copper") };
  assert.equal(meetsDepositRequirement(noCopper, "deposit:copper", 4, 4, 3), false,
    "没有铜也没有贸易路线，就造不出");
  assert.equal(missingDeposit(noCopper, "deposit:copper", 4, 4, 3), "deposit:copper",
    "缺的就是铜");
});

test("有了贸易路线，造得出，但晚于产地", () => {
  const map = generateDeposits(8, 8, () => ({ chance: () => false, nextFloat: () => 0.5 }));
  const noCopper = { ...map, deposits: map.deposits.filter((d) => d.tag !== "deposit:copper") };
  const withRoute = new Set(["deposit:copper"]);
  assert.equal(meetsDepositRequirement(noCopper, "deposit:copper", 4, 4, 3, withRoute), true,
    "有贸易路线就能运来");
  assert.equal(missingDeposit(noCopper, "deposit:copper", 4, 4, 3, withRoute), null);
});

test("矿藏标签与发明材料名互相映射", () => {
  assert.equal(DEPOSIT_TO_MATERIAL["deposit:copper"], "resource:copper-ore");
  assert.equal(DEPOSIT_TO_MATERIAL["deposit:coal"], "resource:coal");
});

test("铺开矿藏图后，投影说得出周围有什么", () => {
  const sim = world();
  const r = sim.dispatch({ type: DepositsCommands.generate, payload: { width: 8, height: 8 }, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const view = sim.project({ id: DepositsProjections.near, params: { x: 4, y: 4, radius: 3 } });
  assert.equal(view.ok, true);
  const data = view.data as Record<string, unknown>;
  assert.ok(Array.isArray(data.near));
  assert.ok(Array.isArray(data.missing));
  assert.ok(typeof data.line === "string");
});

test("重复铺图会被拒", () => {
  const sim = world();
  sim.dispatch({ type: DepositsCommands.generate, payload: { width: 8, height: 8 }, source: "system" });
  const again = sim.dispatch({ type: DepositsCommands.generate, payload: { width: 8, height: 8 }, source: "system" });
  assert.equal(again.ok, false);
  assert.match(again.errors[0]!.message, /铺开/);
});

test("矿藏图随存档持久化", () => {
  const sim = world();
  sim.dispatch({ type: DepositsCommands.generate, payload: { width: 8, height: 8 }, source: "system" });
  const before = sim.worldView().getComponent("world-deposits:map", "world-deposits.map") as
    { deposits: unknown[] } | undefined;
  const count = before?.deposits.length ?? 0;

  const saved = sim.save();
  const loaded = Simulation.load(saved, [modernWorldModule, worldClockModule, worldSpaceModule,
    worldObjectsModule, worldDepositsModule]);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation.worldView().getComponent("world-deposits:map", "world-deposits.map") as
    { deposits: unknown[] } | undefined;
  assert.equal(after?.deposits.length, count, "读档后矿藏还在");
});
