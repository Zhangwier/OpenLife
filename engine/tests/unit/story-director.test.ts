/**
 * 叙事者的验收：10 个种子 × 3 年自动对局，看事件间隔分布。
 *
 * 为什么这么测：叙事者唯一真正要保证的不是"有事发生"，而是**节奏**——
 * 起起落落模式下不能出现连续 30 天死气沉沉，也不能 5 天内连出两个 crisis。
 * 这两条是可断言的性质，所以直接跑三年的节拍统计，而不是抽查某一天。
 *
 * 用一个只有叙事者 + 最小世界骨架的模拟：节拍的输入（灾情、怨气、存粮）
 * 都可以没有，没有的时候叙事者应该照样按平静积累张力走。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import type { CommandIntent } from "@openlife/contracts";
import {
  BEATS, DIRECTOR_ENTITY, DirectorCommands, DirectorComponents, DirectorEvents,
  DirectorProjections, MODES, STORY_MODES, bandFor, beatProblems, dailyTension,
  estimateGap, likeliestTier, rollLanding, statusLine, storyDirectorModule,
  type DirectorState, type StoryMode,
} from "@openlife/module-story-director";

const DAYS_PER_YEAR = 360;
const YEARS = 3;
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

function director(seed: number) {
  const sim = new Simulation({ worldSeed: seed, modules: [storyDirectorModule] });
  const tick = () => sim.dispatch({ type: DirectorCommands.tick, source: "system" } as CommandIntent);
  const mode = (m: StoryMode) => sim.dispatch({ type: DirectorCommands.setMode, source: "player", payload: { mode: m } as never });
  return { sim, tick, mode };
}

/** 跑 days 天，返回每一天有没有事件、事件是哪一档。 */
function runDays(sim: Simulation, days: number): { day: number; tier: string }[] {
  const out: { day: number; tier: string }[] = [];
  for (let d = 0; d < days; d += 1) {
    const seq = sim.kernel.internals.eventLog.nextSeq;
    sim.dispatch({ type: DirectorCommands.tick, source: "system" });
    for (const event of sim.kernel.internals.eventLog.since(seq - 1)) {
      if (event.type === DirectorEvents.beat) out.push({ day: sim.tick, tier: String(event.data?.tier ?? "") });
    }
    sim.advanceBy(1);
  }
  return out;
}

test("节拍数据自检通过：每一档都有东西可投放，id 不重复", () => {
  assert.deepEqual(beatProblems(), []);
  assert.ok(BEATS.length >= 12, `只有 ${BEATS.length} 个节拍`);
});

test("三个模式与四档都在，且张力段落是连续的", () => {
  assert.deepEqual([...STORY_MODES], ["gentle", "rhythmic", "chaotic"]);
  for (const mode of STORY_MODES) assert.ok(MODES[mode].label.length > 0, mode);
  // 段落必须从 0 开始、以 Infinity 收尾，中间不空档。
  assert.equal(bandFor(0).below, 25);
  assert.equal(bandFor(85).below, Number.POSITIVE_INFINITY);
  assert.equal(bandFor(100).chance, 1, "> 85 必须 100% 投放");
});

test("10 个种子 × 3 年：起起落落不出现连续 30 天无事件", () => {
  for (const seed of SEEDS) {
    const { sim, mode } = director(seed);
    assert.equal(mode("rhythmic").ok, true);
    const events = runDays(sim, DAYS_PER_YEAR * YEARS);
    assert.ok(events.length > 0, `seed ${seed}：三年一件事都没有`);
    let longest = events[0]!.day;
    for (let i = 1; i < events.length; i += 1) longest = Math.max(longest, events[i]!.day - events[i - 1]!.day);
    longest = Math.max(longest, sim.tick - events[events.length - 1]!.day);
    assert.ok(longest < 30, `seed ${seed}：最长 ${longest} 天没有事件`);
  }
});

test("10 个种子 × 3 年：起起落落不出现 5 天内两个 crisis", () => {
  for (const seed of SEEDS) {
    const { sim, mode } = director(seed);
    mode("rhythmic");
    const crises = runDays(sim, DAYS_PER_YEAR * YEARS).filter((e) => e.tier === "crisis").map((e) => e.day);
    for (let i = 1; i < crises.length; i += 1) {
      assert.ok(crises[i]! - crises[i - 1]! >= 5, `seed ${seed}：${crises[i - 1]} 与 ${crises[i]} 挨得太近`);
    }
  }
});

test("细水长流比天意难测安静：事件更少、危机更少", () => {
  const count = (mode: StoryMode) => {
    let total = 0;
    let crises = 0;
    for (const seed of SEEDS) {
      const { sim, mode: set } = director(seed);
      set(mode);
      const events = runDays(sim, DAYS_PER_YEAR * YEARS);
      total += events.length;
      crises += events.filter((e) => e.tier === "crisis").length;
    }
    return { total, crises };
  };
  const gentle = count("gentle");
  const chaotic = count("chaotic");
  assert.ok(gentle.total < chaotic.total, `细水长流 ${gentle.total} 应少于天意难测 ${chaotic.total}`);
  assert.ok(gentle.crises < chaotic.crises, `细水长流 ${gentle.crises} 危机应少于天意难测 ${chaotic.crises}`);
});

test("同种子同指令 = 同指纹（确定性）", () => {
  const once = (seed: number) => {
    const { sim, mode } = director(seed);
    mode("rhythmic");
    runDays(sim, 200);
    return sim.fingerprint();
  };
  assert.equal(once(42), once(42));
  assert.notEqual(once(42), once(43));
});

test("模式选错会被拒绝，说清有哪三种", () => {
  const { mode } = director(3);
  const bad = mode("epic" as StoryMode);
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0]!.message, /gentle/);
});

test("投影说得清气氛、下一档与一句人话，且不含任何人的名字", () => {
  const { sim, mode } = director(9);
  mode("rhythmic");
  runDays(sim, 40);
  const view = sim.project({ id: DirectorProjections.status, params: {} });
  assert.equal(view.ok, true, JSON.stringify(view.error));
  const data = view.data as Record<string, unknown>;
  assert.ok(typeof data.tension === "number");
  assert.ok(STORY_MODES.includes(data.mode as StoryMode));
  assert.ok(["ambient", "minor", "conflict", "crisis"].includes(data.nextTier as string));
  assert.ok(typeof data.line === "string" && (data.line as string).length > 0);
  assert.ok(typeof data.nextWithinDays === "number");
  // 认知层：节拍与投影里不出现村民的名字。
  const names = ["阿禾", "阿灶", "阿岚", "埴公", "阿予", "陶叔", "陶婶"];
  const text = JSON.stringify(data);
  for (const name of names) assert.equal(text.includes(name), false, `投影里出现了人名 ${name}`);
});

test("状态落在自己的命名空间下，不写别人的组件", () => {
  const { sim, tick } = director(4);
  tick();
  const raw = sim.worldView().getComponent(DIRECTOR_ENTITY, DirectorComponents.state);
  assert.ok(raw, "叙事者状态应该写在 story-director.state 上");
  const state = raw as unknown as DirectorState;
  assert.ok(state.tension >= 0 && state.tension <= 100);
  assert.ok(Array.isArray(state.recent) && state.recent.length <= 8);
  assert.ok(Array.isArray(state.pending));
  // 只写自己命名空间下的组件。
  for (const entity of sim.worldView().listEntities()) {
    for (const component of Object.keys(entity.components)) {
      assert.ok(
        component.startsWith("story-director.") || component.startsWith("core."),
        `叙事者不该写 ${component}`,
      );
    }
  }
});

test("张力：平静会积累，灾情缺粮怨气会加速", () => {
  const flat = { hazard: "none" as const, foodDays: null, grievanceTotal: 0, feuds: 0 };
  let tension = 10;
  for (let i = 0; i < 10; i += 1) tension = dailyTension(tension, flat, "rhythmic").tension;
  assert.ok(tension > 10, "平静十天应该更紧");
  const stressed = dailyTension(10, { hazard: "active", foodDays: 3, grievanceTotal: 2, feuds: 1 }, "rhythmic");
  assert.ok(stressed.tension > 40, `灾情+缺粮+怨气应该涨得很快，实际 ${stressed.tension}`);
  assert.ok(stressed.causes.some((c) => c.startsWith("hazard_active")));
});

test("rollLanding：越线必投 crisis，太久没动静一定给一件", () => {
  const rng = { nextFloat: () => 0.5, nextInt: (a: number) => a, chance: () => false };
  const forced = rollLanding({ tension: 90, mode: "rhythmic", daysSinceEvent: 3, daysSinceCrisis: 30 }, rng);
  assert.equal(forced?.tier, "crisis");
  const silent = rollLanding({ tension: 20, mode: "gentle", daysSinceEvent: 26, daysSinceCrisis: 100 }, rng);
  assert.ok(silent?.forced, "26 天没事件必须强行给一件");
  assert.notEqual(silent?.tier, "crisis", "硬线逼出来的不该是危机");
  const quiet = rollLanding({ tension: 20, mode: "gentle", daysSinceEvent: 1, daysSinceCrisis: 100 }, rng);
  assert.equal(quiet, null, "刚出过事，间隔没到就不该再出");
});

test("人话：不同张力说不同的话，且都不点名", () => {
  const lines = [10, 40, 70, 95].map((t) => statusLine(t, "rhythmic", 3));
  assert.equal(new Set(lines).size, 4, "四段张力应该有四句不同的话");
  for (const line of lines) assert.ok(line.length > 0 && !/阿|陶/.test(line), line);
  assert.equal(likeliestTier(bandFor(95), "rhythmic"), "crisis");
  assert.ok(estimateGap({ tension: 10, mode: "rhythmic" } as DirectorState) > 0);
});
