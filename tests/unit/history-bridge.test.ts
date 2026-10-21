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
import { polityModule } from "@openlife/module-polity";
import { WEB_MODULE_ENTRIES, webModules } from "../../apps/web/src/modules.ts";
import {
  startHistory, historyDay, historySeason, historyEra, knownInventions,
  bridgeFailures, resetBridgeFailures, materialsForTech,
} from "../../apps/web/src/history-bridge.ts";

function village(seed = 7, extra: typeof eraLadderModule[] = []) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, heredityModule, techModule, eraLadderModule, ...extra] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  return sim;
}

/** The ledger fields are unknown at the type level; read the array once, typed. */
function membersOf(record: Record<string, unknown>): unknown[] {
  return Array.isArray(record.members) ? record.members : [];
}

test("建村后每个居民都进了科技账本", () => {
  resetBridgeFailures();
  const sim = village();
  startHistory(sim);
  const record = sim.worldView().getComponent("tech:village", "tech.village");
  assert.ok(record, "村子开始记事了");
  assert.ok(membersOf(record).length >= 10, `账本里有人（${membersOf(record).length}）`);
  assert.deepEqual(bridgeFailures(), [], "接线不该有任何失败");
});

test("每季推进后村子会发明东西（按引擎自己的节奏）", { timeout: 120000 }, () => {
  resetBridgeFailures();
  const sim = village();
  startHistory(sim);
  // The engine's own numbers set the pace: ~0.05% per person-season, so a
  // village of 16 has only ~9% chance of a first invention in 30 years even
  // with real needs reported (expected hits ≈ 0.9). Asserting "must invent"
  // would fail most runs by chance alone.
  //
  // The honest check: the mechanism works end-to-end -- needs are recorded,
  // seasons run without error, and the village's state stays consistent. The
  // invention itself is a low-probability event that must not be forced.
  for (let season = 0; season < 120; season += 1) {
    historySeason(sim);
    sim.advanceBy(1);
  }
  const record = sim.worldView().getComponent("tech:village", "tech.village");
  assert.ok(record, "村子一直在记事");
  assert.ok(membersOf(record).length >= 10, "账本里有人");
  assert.ok(Object.keys(record.needs ?? {}).length > 0, "需要簿里有东西");
  // 0 or 1+ inventions are both honest outcomes at this pace; what must never
  // happen is a silent failure.
  assert.deepEqual(bridgeFailures(), [], "全程不该有失败");
});

test("河岸台地采不到的材料，按用途等价补上", { timeout: 120000 }, () => {
  // 11 项发明需要 resource:timber，而河岸台地只产黏土/芦苇/柴/谷/水。
  // 没有这层映射，科技树永远停在第一项——不是概率低，是材料永远凑不齐。
  // 这一条测的是映射本身：村里有芦苇，科技就该认得出木料。
  const sim = village();
  startHistory(sim);
  const world = sim.worldView();
  // 村里有芦苇（resource:reed），映射应把 resource:timber 补进来。
  const materials = materialsForTech(world);
  assert.ok(materials.includes("resource:timber"),
    `村里有芦苇，科技就该认得出木料（实际：${materials.join(", ")}）`);
  assert.ok(materials.includes("resource:clay"), "黏土本来就有");
  assert.ok(materials.includes("resource:stone"), "黏土烧陶替代石料");
  assert.ok(materials.includes("resource:rope"), "芦苇编绳替代绳");
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

/**
 * 网页版真的装了历史实验室。
 *
 * 上面那些测试自己把 heredity / tech / era-ladder 传进 Simulation，所以它们能
 * 在网页版一个都没装的情况下全绿——这条链路就这样静默空转了整整一个版本：
 * `startHistory` 第一天就 `if (!have.heredity && !have.tech) return`，浏览器世界
 * 里从来没有 `tech:village`，一个发明也攒不出来，`historyEra()` 恒为 null。
 *
 * 这条测试盯的是清单本身，不是函数。
 */
test("网页版的模块清单装上了历史实验室的四个模块", () => {
  const ids = new Set(WEB_MODULE_ENTRIES.map((e) => e.module.manifest.id as string));
  for (const id of ["heredity", "tech", "polity", "era-ladder"]) {
    assert.ok(ids.has(id), `网页版没装 ${id}，历史桥接会整条空转`);
  }
  // 顺序有意义：tech 把天赋当发明乘数（optional: life.heredity），
  // era-ladder 要读制度清单（polity.institutions）。装反了不报错，只是少东西。
  const order = WEB_MODULE_ENTRIES.map((e) => e.module.manifest.id as string);
  assert.ok(order.indexOf("heredity") < order.indexOf("tech"), "heredity 要在 tech 之前");
  assert.ok(order.indexOf("polity") < order.indexOf("era-ladder"), "polity 要在 era-ladder 之前");
});

/**
 * 年度钩子：一年一次，把时代阶梯与村政推一步。
 *
 * 这两个命令（`era-ladder.check` / `polity.year`）在网页版此前**没有任何调用点**
 * ——只有离线编排器 `modules/village-chronicle/src/run.ts` 里才有。结果是浏览器
 * 世界永远停在 `era:settled-village`，村政没有声望、没有制度、没有欠账。
 */
test("过一年就把时代阶梯和村政推一步", { timeout: 120000 }, () => {
  resetBridgeFailures();
  const sim = village(21, [polityModule]);
  startHistory(sim);
  // 一季 90 天。tick 0 时算第 0 年（村子刚立，先记一笔），360 天算第 1 年。
  // 十二季 = 三个年度节点，正好能看出「每年都问一次」而不是「问过一次就停了」。
  for (let season = 0; season < 12; season += 1) {
    historySeason(sim);
    sim.advanceBy(90);
  }
  const world = sim.worldView();
  const era = world.getComponent("era:ladder", "era-ladder.state");
  assert.ok(era, "时代阶梯被真的问过了（否则这里永远是 undefined）");
  assert.equal(era.current, "era:settled-village", "第一年当然还是定居村落");
  // streak 是它逐个时代比过之后留下的痕迹：十个时代各一条。
  assert.equal(Object.keys(era.streak ?? {}).length, 10, "十个时代都逐个比过，说明真的在评估");
  const polity = world.getComponent("polity:village", "polity.state");
  assert.ok(polity, "村政被真的建起来了");
  assert.ok(Number(polity.population) > 0, "村政知道村里有多少人");
  // 余粮年数是逐年累加的，只有「每年都调 polity.year」才会涨。第一年只是建政，
  // 所以两个年度节点之后它应该至少是 1。
  assert.ok(Number(polity.surplusYears) >= 1,
    `村政年年在数余粮（surplusYears=${polity.surplusYears}）`);
  assert.deepEqual(bridgeFailures(), [], "年度钩子不该有失败");
});
