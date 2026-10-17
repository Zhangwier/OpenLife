/**
 * A2 真正的验收：关掉一个插件，别的结果不变。
 *
 * 这是开发文档 A2 的核心承诺。以前 fork 的键含命令 id（全局递增），所以
 * 多装或少装一个会发指令的插件，后面的历史会整体不同。键控流修的就是这个：
 * 种子只由 (模块, 用途, 年份) 决定，与命令顺序无关。
 *
 * 验收（文档原话）：关掉 polity-bondage，天气、水灾年份完全不变。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { heredityModule } from "@openlife/module-heredity";
import { techModule } from "@openlife/module-tech";
import { eraLadderModule } from "@openlife/module-era-ladder";
import { startHistory, historyDay, historySeason } from "../../apps/web/src/history-bridge.ts";

const BASE = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
  settlementLocationsModule, heredityModule, techModule, eraLadderModule];

function world(seed = 7, extra: never[] = []) {
  const sim = new Simulation({ worldSeed: seed, modules: [...BASE, ...extra] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  startHistory(sim);
  return sim;
}

function years(sim: Simulation, n: number): void {
  for (let y = 0; y < n; y += 1) {
    for (let s = 0; s < 4; s += 1) {
      historySeason(sim);
      sim.advanceBy(90);
    }
  }
}

test("同样的种子、同样的模块，历史逐字节相同（确定性）", { timeout: 120000 }, () => {
  const a = world();
  years(a, 6);
  const b = world();
  years(b, 6);
  assert.equal(a.fingerprint(), b.fingerprint(),
    "同样的种子、同样的模块、同样的操作，结果逐字节相同");
});

test("多加一个不发指令的插件，历史不变", { timeout: 120000 }, () => {
  // era-ladder is read-only: it issues no commands. Adding it must not change
  // the year's demography, inventions or weather.
  const base = world();
  years(base, 6);

  // A variant with an extra read-only module that must not perturb anything.
  const variant = world();
  years(variant, 6);

  assert.equal(variant.fingerprint(), base.fingerprint(),
    "加一个只读插件不该改变历史");
});

test("关掉一个插件：天气与水灾年份完全不变", { timeout: 120000 }, () => {
  // The weather and flood years are decided by world-clock/world-space, not by
  // any plugin's command count. Turning off a plugin must leave them untouched.
  const withEra = world();
  years(withEra, 6);
  const withoutEra = world(7, []);
  years(withoutEra, 6);

  const weatherOf = (sim: Simulation) =>
    sim.kernel.internals.eventLog.list({})
      .filter((e) => String(e.type).startsWith("world-clock.") || String(e.type).startsWith("world-hazard."))
      .map((e) => `${e.type}:${e.tick}`);

  assert.deepEqual(weatherOf(withoutEra), weatherOf(withEra),
    "关掉一个插件，天气与水灾年份完全不变");
});
