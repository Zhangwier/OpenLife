/**
 * 村落成长目标的验收。
 *
 * 分两层测：
 *  1. 纯逻辑（evaluateGoals + 假快照）：阶梯能不能一级一级走上去、失败条件对不对；
 *  2. 真世界（Simulation）：投影能不能从真实组件算出进度，没有 settlement-build
 *     时降级不报错。
 *
 * 为什么必须测降级：房屋数优先读 settlement-build 的组件，但它是可选模块。
 * 没装它的时候如果抛错或者显示 0 间屋，玩家会以为村子退步了。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { settlementBuildModule } from "@openlife/module-settlement-build";
import {
  EMPTY_SNAPSHOT, GOALS, GOAL_FAILURE, GOALS_ENTITY, GOALS_CAPABILITY, GoalCommands, GoalEvents,
  GoalProjections, LADDERS, evaluateGoals, failureOf, goalProblems, lifeProgress,
  seasonProgress, settlementGoalsModule, snapshotOf, todayHints, wintersLivedSince,
  type VillageSnapshot,
} from "@openlife/module-settlement-goals";

/** 一份"什么都刚够上一级"的快照，逐级往上填。 */
function snapshot(overrides: Partial<VillageSnapshot> = {}): VillageSnapshot {
  return { ...EMPTY_SNAPSHOT, population: 8, homes: 4, roofsSound: 4, foodDays: 70, ...overrides };
}

function village(withBuild: boolean) {
  const modules = [
    modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
    settlementLocationsModule, settlementGoalsModule,
    ...(withBuild ? [settlementBuildModule] : []),
  ];
  const sim = new Simulation({ worldSeed: 17, modules });
  sim.dispatch({ type: "modern.initialize_world", source: "system" });
  sim.dispatch({ type: "modern.create_character", source: "system", payload: { givenName: "禾", familyName: "林", lifespan: 90 } as never });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found, source: "system" });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } as never });
  return { sim, me };
}

test("阶梯数据自检通过：六级、序号连续、条件都认识", () => {
  assert.deepEqual(goalProblems(), []);
  assert.equal(LADDERS.length, 6);
  assert.deepEqual(LADDERS.map((l) => l.name), ["落脚", "安顿", "添丁", "有名", "兴旺", "传承"]);
  assert.equal(GOAL_FAILURE.populationBelow, 3);
  assert.equal(GOAL_FAILURE.consecutiveBadWinters, 2);
});

test("阶梯文案里不出现任何人名（认知层底线）", () => {
  const names = ["阿禾", "阿灶", "阿岚", "埴公", "阿予", "陶叔", "陶婶", "阿渡"];
  const text = JSON.stringify(GOALS.ladders);
  for (const name of names) assert.equal(text.includes(name), false, `阶梯文案里出现了人名 ${name}`);
});

test("用假快照能逐级走完六级", () => {
  // 一级一级地满足，每次只多够一级。
  const steps: Partial<VillageSnapshot>[] = [
    { wintersLived: 1, consecutiveBadWinters: 0 },
    { population: 8, homes: 4, roofsSound: 4, foodDays: 70 },
    { population: 15, births: 2 },
    { marketArrivals: 1 },
    { population: 30, threeGenHomes: 2 },
    { lineageGenerations: 5 },
  ];
  let stage = 1;
  const reached: string[] = [];
  for (const step of steps) {
    const evaluation = evaluateGoals({ ...EMPTY_SNAPSHOT, population: 8, ...step }, stage);
    for (const ladder of evaluation.reached) reached.push(ladder.name);
    stage = evaluation.stage;
  }
  assert.deepEqual(reached, ["落脚", "安顿", "添丁", "有名", "兴旺", "传承"]);
  assert.equal(stage, LADDERS.length + 1, "六级都过了");
});

test("一次满足三级就连升三级（读档后不该逼玩家再等）", () => {
  const evaluation = evaluateGoals({
    ...EMPTY_SNAPSHOT, population: 16, homes: 5, roofsSound: 5, foodDays: 80,
    births: 3, wintersLived: 2,
  });
  assert.deepEqual(evaluation.reached.map((l) => l.name), ["落脚", "安顿", "添丁"]);
  assert.equal(evaluation.stage, 4);
  assert.equal(evaluation.nextName, "有名");
  assert.match(evaluation.nextMissing, /集市/);
});

test("人口降到 3 以下 → 村子散了，阶梯停止推进", () => {
  const evaluation = evaluateGoals({ ...EMPTY_SNAPSHOT, population: 2, wintersLived: 5 });
  assert.equal(evaluation.failed.failed, true);
  assert.match(evaluation.failed.reason, /只剩 2 个/);
  assert.deepEqual(evaluation.reached, [], "散了就不再升级");
  assert.equal(lifeProgress(evaluation).stageName, "村子散了");
  assert.ok(lifeProgress(evaluation).step.includes("重新"));
});

test("连着两个冬天饿死人 → 村子散了；只坏一个冬天不算", () => {
  assert.equal(failureOf({ ...EMPTY_SNAPSHOT, population: 9, consecutiveBadWinters: 1 }).failed, false);
  const bad = failureOf({ ...EMPTY_SNAPSHOT, population: 9, consecutiveBadWinters: 2 });
  assert.equal(bad.failed, true);
  assert.match(bad.reason, /饿死人/);
});

test("这一季给出进度条数据，今天最多三条建议", () => {
  const evaluation = evaluateGoals(snapshot({ population: 12, homes: 4, roofsSound: 2, foodDays: 12 }));
  const season = seasonProgress(evaluation);
  assert.equal(season.name, "落脚", "第一条没达成时停在一级");
  const hints = todayHints(snapshot({ foodDays: 8, roofsSound: 1, starving: 2 }), evaluation);
  assert.ok(hints.length >= 1 && hints.length <= GOALS.maxToday, `${hints.length} 条`);
  assert.match(hints[0]!.text, /饿/, "最急的是饿");
  for (const hint of hints) assert.ok(!/阿|陶/.test(hint.text), hint.text);
});

test("冬天从建村之后开始算：入冬时建村的那一年不算熬过", () => {
  const year = 360;
  // 冬天从 12 月 1 日（第 11 个月的第一天）起算，走到次年 3 月 1 日算熬过。
  const firstWinterStart = 11 * 30;
  // 建在 12 月中：这个冬天在建村前就开始了，不算熬过。
  assert.equal(wintersLivedSince(firstWinterStart + 15, firstWinterStart + 90), 0);
  // 建在春天、只走到第一个冬天结束：算一个。
  assert.equal(wintersLivedSince(60, firstWinterStart + 90), 1);
  // 冬天还没走完也不算。
  assert.equal(wintersLivedSince(60, firstWinterStart + 60), 0);
  // 建在春天、走到第二个冬天结束：算两个。
  assert.equal(wintersLivedSince(60, firstWinterStart + 90 + year), 2);
});

test("真世界里投影能算：没有盖房模块时降级不报错", () => {
  const { sim } = village(false);
  const view = sim.project({ id: GoalProjections.progress, params: {} });
  assert.equal(view.ok, true, JSON.stringify(view.error));
  const data = view.data as Record<string, unknown>;
  assert.equal(data.stage, 1);
  assert.equal(data.stageName, "落脚");
  assert.ok(Array.isArray(data.ladders) && (data.ladders as unknown[]).length === 6);
  const snap = data.snapshot as Record<string, unknown>;
  assert.ok((snap.population as number) >= 10, "村里本来就有居民");
  // 没有 settlement-build 时，房屋数退回"村民实际住着几个住处"，不是 null 也不是 0。
  assert.equal(typeof snap.homes, "number");
  assert.ok((snap.homes as number) > 0, `降级后仍应有住处，实际 ${String(snap.homes)}`);
  assert.ok(typeof data.line === "string" && (data.line as string).length > 0);
});

test("装了盖房模块时，房屋数取住户数与盖成数的较大者", () => {
  const { sim } = village(true);
  const withBuild = snapshotOf(sim.worldView());
  const { sim: without } = village(false);
  const bare = snapshotOf(without.worldView());
  // 同一个种子、同一个村子：装不装盖房模块，房屋数都该是作者写好的那些住处，
  // 不能因为"还没人盖新屋"就报 0 间。
  assert.equal(withBuild.homes, bare.homes);
  assert.ok((withBuild.homes ?? 0) > 0, `房屋数 ${String(withBuild.homes)}`);
});

test("tick 会推进阶梯并播报，同一级只播一次", () => {
  const { sim } = village(false);
  // 第一个冬天在 12 月到次年 2 月底（第 330–420 天）；把时钟推过它。
  sim.advanceBy(430);
  assert.ok(snapshotOf(sim.worldView()).wintersLived >= 1, "应该已经熬过一个冬天");
  const seq = sim.kernel.internals.eventLog.nextSeq;
  assert.equal(sim.dispatch({ type: GoalCommands.tick, source: "system" }).ok, true);
  const first = sim.kernel.internals.eventLog.since(seq - 1).filter((e) => e.type === GoalEvents.reached);
  assert.ok(first.length >= 1, "应该报了「落脚」");
  assert.equal(String(first[0]!.data?.name), "落脚");

  const again = sim.kernel.internals.eventLog.nextSeq;
  sim.dispatch({ type: GoalCommands.tick, source: "system" });
  const second = sim.kernel.internals.eventLog.since(again - 1).filter((e) => e.type === GoalEvents.reached);
  assert.equal(second.length, 0, "同一级不该反复播报");
});

test("tick 上报集市来人，累加进阶梯进度", () => {
  const { sim } = village(false);
  assert.equal(sim.dispatch({ type: GoalCommands.tick, source: "system", payload: { marketArrived: true } as never }).ok, true);
  const view = sim.project({ id: GoalProjections.progress, params: {} });
  const stage4 = (view.data as { ladders: { id: string; conditions: { label: string }[] }[] }).ladders.find((l) => l.id === "goal:known")!;
  assert.match(stage4.conditions[0]!.label, /1\/1/, stage4.conditions[0]!.label);
});

test("上报连着两个坏冬天 → 播报村子散了，且只播一次", () => {
  const { sim } = village(false);
  sim.dispatch({ type: GoalCommands.tick, source: "system", payload: { winterEnded: true, starvedThisWinter: 2 } as never });
  const seq = sim.kernel.internals.eventLog.nextSeq;
  sim.dispatch({ type: GoalCommands.tick, source: "system", payload: { winterEnded: true, starvedThisWinter: 1 } as never });
  const failures = sim.kernel.internals.eventLog.since(seq - 1).filter((e) => e.type === GoalEvents.failed);
  assert.equal(failures.length, 1, "第二个坏冬天到了就该报");
  assert.ok(String(failures[0]!.data?.line).includes("村子散了"));

  const again = sim.kernel.internals.eventLog.nextSeq;
  sim.dispatch({ type: GoalCommands.tick, source: "system", payload: { winterEnded: true, starvedThisWinter: 1 } as never });
  assert.equal(sim.kernel.internals.eventLog.since(again - 1).filter((e) => e.type === GoalEvents.failed).length, 0);
  const view = sim.project({ id: GoalProjections.progress, params: {} });
  assert.equal((view.data as { dispersed: boolean }).dispersed, true);
});

test("状态只写自己的命名空间，能力名字对得上", () => {
  const { sim } = village(false);
  sim.dispatch({ type: GoalCommands.tick, source: "system" });
  assert.ok(sim.worldView().getComponent(GOALS_ENTITY, "settlement-goals.state"), "状态写在 settlement-goals.state");
  assert.equal(settlementGoalsModule.manifest.provides?.[0], GOALS_CAPABILITY);
  assert.ok(sim.modules.hasCapability(GOALS_CAPABILITY));
  // 本模块写的组件只能挂在它自己的状态实体上。
  for (const entity of sim.worldView().listEntities()) {
    for (const component of Object.keys(entity.components)) {
      assert.ok(
        !component.startsWith("settlement-goals.") || entity.id === GOALS_ENTITY,
        `只在 ${GOALS_ENTITY} 上写自己的组件，不该写 ${entity.id}`,
      );
    }
  }
});

test("同种子同指令 = 同指纹", () => {
  const run = () => {
    const { sim } = village(true);
    sim.advanceBy(30);
    sim.dispatch({ type: GoalCommands.tick, source: "system", payload: { marketArrived: true } as never });
    return sim.fingerprint();
  };
  assert.equal(run(), run());
});
