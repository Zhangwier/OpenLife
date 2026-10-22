/**
 * 「我这一生」：把一局打包成文本，别人导入后重放出同一个世界。
 *
 * 这里测的是**输入能重算出状态**，不是「导出了一份 JSON」。前者才是这件事的
 * 全部难点：少记一次时间推进、多记一条由种子推导的命令、或者把被拒的命令也记
 * 下来，导出文件都还是「成功」的，只是重放出来的是另一个人生。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import {
  recordLife, recordedSteps, hasRecorder, replayFile, replayOf,
  type ReplayFile,
} from "../../apps/web/src/replay.ts";
import { exportLife } from "../../apps/web/src/life-file.ts";

const MODULES = [
  modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule,
];

/** 一局普通的人生：建世界、造角色、建村、走到院子里。 */
function boot(seed: number): Simulation {
  const sim = new Simulation({ worldSeed: seed, modules: MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  return sim;
}

const meOf = (sim: Simulation): string =>
  String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

/** 走三步：做一件事、过几天、再做一件事。 */
function live(sim: Simulation): void {
  const me = meOf(sim);
  sim.dispatch({ type: SettlementCommands.step, actorId: me, payload: {} });
  sim.advanceBy(3);
  sim.dispatch({ type: SettlementCommands.step, actorId: me, payload: {} });
}

function fileOf(sim: Simulation, seed: number, partial = false): ReplayFile {
  return replayOf(sim, {
    opening: { seed },
    modules: MODULES,
    packs: [],
    daysPerYear: 360,
    humanize: () => "",
    partial,
  });
}

test("记下的输入能重算出同一个世界", () => {
  const a = boot(11);
  recordLife(a);
  live(a);
  const file = fileOf(a, 11);

  const replayed = replayFile(file, () => boot(11));

  assert.equal(replayed.same, true, "重放出来的世界指纹必须和导出时一致");
  assert.deepEqual(replayed.failed, [], "每一步都该被接受");
  assert.equal(replayed.applied, file.steps.length, "记下的每一步都重放过");
});

test("时间推进单独记一条，不靠命令夹住", () => {
  const sim = boot(11);
  recordLife(sim);
  // 只有时间在走：没有命令。
  sim.advanceBy(5);

  const steps = recordedSteps(sim);
  assert.equal(steps.length, 0, "还没导出，所以还没补上那段空白");
  const file = fileOf(sim, 11);
  assert.equal(file.steps.length, 1, "导出时把这段空白补成一条");
  assert.deepEqual(file.steps[0], { kind: "advance", ticks: 5 });
});

test("自动推进的日子会被记下来", () => {
  const sim = boot(11);
  recordLife(sim);
  const me = meOf(sim);
  // 自动推进走的是内核而不是 Simulation：包住 sim.advanceBy 看不到这些天，
  // 只有比对 tick 才记得住。
  sim.kernel.advanceBy(7);
  sim.dispatch({ type: SettlementCommands.step, actorId: me, payload: {} });

  const file = fileOf(sim, 11);
  const advance = file.steps.find((s) => s.kind === "advance");
  assert.ok(advance, "内核推进的那 7 天也要记下来");
  assert.equal(advance.ticks, 7);
});

test("由种子推导的命令不记，否则重放会做两遍", () => {
  const sim = boot(11);
  recordLife(sim);
  sim.dispatch({ type: SettlementCommands.step, actorId: meOf(sim), source: "ai", payload: {} });

  assert.deepEqual(recordedSteps(sim), [], "ai 下发的命令由种子推出来，记下来就重复了");
});

test("被拒的命令不记", () => {
  const sim = boot(11);
  recordLife(sim);
  const result = sim.dispatch({ type: "no-such-command", actorId: meOf(sim), payload: {} });

  assert.equal(result.ok, false);
  assert.deepEqual(recordedSteps(sim), [], "被拒的命令改变不了世界，记下来只会制造噪音");
  assert.equal(fileOf(sim, 11).steps.length, 0);
});

test("同一局只装一个记录器，否则每条命令会被记两遍", () => {
  const sim = boot(11);
  const first = recordLife(sim);
  const second = recordLife(sim);
  assert.equal(first, second);

  sim.dispatch({ type: SettlementCommands.step, actorId: meOf(sim), payload: {} });
  assert.equal(recordedSteps(sim).length, 1);
});

test("没有记录器的世界导出时会说自己只有一半", () => {
  const sim = boot(11);
  assert.equal(hasRecorder(sim), false);
  const file = fileOf(sim, 11, true);
  assert.equal(file.partial, true);
  assert.equal(file.steps.length, 0);
});

test("重放的失败停在第一步：后面的错都记在它头上", () => {
  const a = boot(11);
  recordLife(a);
  live(a);
  const file = fileOf(a, 11);
  // 把第一步换成一个不存在的命令：重放应当立刻停手，而不是继续往下做。
  file.steps = [{ kind: "command", type: "no-such-command", source: "player", payload: {} },
    ...file.steps.slice(1)];

  const replayed = replayFile(file, () => boot(11));

  assert.equal(replayed.ok, false);
  assert.equal(replayed.applied, 0, "第一步就被拒，之后的一步都不该执行");
  assert.equal(replayed.failed.length, 1, "只在第一步报一次，不逐个刷屏");
});

test("读档进来的世界，导出必须标自己是半截的", () => {
  // 读档的世界既有开局选项（上一局留下的），也有记录器（从读档那一刻开始记）。
  // 只看这两样会得出「完整」，可前半生的输入谁也没记过——所以由调用方明说。
  const sim = boot(11);
  recordLife(sim);

  const honest = exportLife(sim, { opening: { seed: 11 }, partial: true, modules: MODULES, packs: [] });
  assert.equal(honest.partial, true, "半生在别的进程里过完的，不能报成完整记录");

  const whole = exportLife(sim, { opening: { seed: 11 }, modules: MODULES, packs: [] });
  assert.equal(whole.partial, undefined, "从头玩到现在的这一局不该被写成半截");
});
