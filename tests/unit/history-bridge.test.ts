/**
 * 历史实验室接进网页版：村子要真的积累技术。
 *
 * 这条链路跨四个模块（heredity / tech / era-ladder / settlement-locations），
 * 所以测的是**结果**：建村 → 过几季 → 村子有发明。中间任何一步参数写错，
 * 结果都是 0 项，而不会报错——我第一次接的时候就是这样，跑了三年零发明。
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
import {
  startHistory, historyDay, historySeason, historyEra, knownInventions,
  bridgeFailures, resetBridgeFailures,
} from "../../apps/web/src/history-bridge.ts";

function village(seed = 7) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, heredityModule, techModule, eraLadderModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  return sim;
}

test("建村后每个居民都进了科技账本", () => {
  resetBridgeFailures();
  const sim = village();
  startHistory(sim);
  const record = sim.worldView().getComponent("tech:village", "tech.village");
  assert.ok(record, "村子开始记事了");
  assert.ok((record.members ?? []).length >= 10, `账本里有人（${(record.members ?? []).length}）`);
  assert.deepEqual(bridgeFailures(), [], "接线不该有任何失败");
});

test("每季推进后村子会发明东西", { timeout: 120000 }, () => {
  resetBridgeFailures();
  const sim = village();
  startHistory(sim);
  // The engine's own numbers set the pace: baseSpark 0.0035 x curiosity 0.15
  // gives ~0.05% per person-season, so a village of 16 needs on the order of
  // a hundred seasons before the first invention is likely. Reporting real
  // needs (needFactor up to 3x) and watching materials for a few decades is
  // the honest way to assert this -- not tightening the dice.
  for (let season = 0; season < 120; season += 1) {
    historySeason(sim);
    sim.advanceBy(1);
  }
  const invented = knownInventions(sim);
  assert.ok(invented.length > 0, `三十年后村子该有发明，实际 ${invented.length} 项`);
  assert.deepEqual(bridgeFailures(), [], "全程不该有失败");
});

test("河岸台地采不到的材料，按用途等价补上", { timeout: 120000 }, () => {
  // 11 项发明需要 resource:timber，而河岸台地只产黏土/芦苇/柴/谷/水。
  // 没有这层映射，科技树永远停在第一项——不是概率低，是材料永远凑不齐。
  // 用 120 季（30 年）给足时间，因为节奏本来就慢。
  const sim = village();
  startHistory(sim);
  for (let season = 0; season < 120; season += 1) {
    historySeason(sim);
    sim.advanceBy(1);
  }
  const invented = knownInventions(sim);
  assert.ok(invented.length >= 1, "至少一项，说明材料门槛过得去");
});

test("没有历史模块时，接线是空操作", () => {
  const sim = new Simulation({ worldSeed: 3,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林" } });
  sim.dispatch({ type: SettlementCommands.found });
  resetBridgeFailures();
  startHistory(sim);
  historySeason(sim);
  historyDay(sim);
  assert.deepEqual(bridgeFailures(), [], "没装就不该尝试，更不该报错");
  assert.equal(knownInventions(sim).length, 0);
  assert.equal(historyEra(sim), null, "没有 era 模块就返回 null，让界面自己决定不渲染");
});
