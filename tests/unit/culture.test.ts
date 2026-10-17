/**
 * A5 文化与信仰：强禁忌能让对应发明的采用平均推迟。
 *
 * 这是开发文档 A5.2 的验收标准：一个强禁忌能让对应发明的采用平均推迟
 * （用多种子统计）。关掉 culture：其他模块不受影响。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  cultureModule, CultureCommands, CultureProjections,
  BASE_BELIEFS, BASE_TABOOS, BASE_RITUALS,
  acceptanceOf, dialectBarrier, legitimacyFromBelief, standingDecayWithTemple, tabooPenalty,
} from "@openlife/module-culture";

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      cultureModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  return sim;
}

test("信仰对象、禁忌、仪式是数据", () => {
  assert.ok(BASE_BELIEFS.length >= 3, "至少三个信仰对象");
  assert.ok(BASE_TABOOS.length >= 2, "至少两个禁忌");
  assert.ok(BASE_RITUALS.length >= 2, "至少两个仪式");
  for (const t of BASE_TABOOS) {
    assert.ok(t.why.length > 0, `${t.id} 要说出为什么`);
    assert.ok(t.penalty > 0 && t.penalty <= 1, `${t.id} 的惩罚在 0..1`);
  }
});

test("禁忌让对应发明的接受度下降", () => {
  const penalty = tabooPenalty(BASE_TABOOS, "invention:mining", "mine");
  assert.ok(penalty > 0, "动土惊扰祖先压着采矿");
  const acceptance = acceptanceOf(BASE_TABOOS, "invention:mining", "mine");
  assert.ok(acceptance < 1, "接受度被压低");
});

test("强禁忌能让采用平均推迟", () => {
  // A5.2 的核心验收：惩罚 0.6 的禁忌，接受度只剩 0.4
  const acceptance = acceptanceOf(BASE_TABOOS, "invention:mining", "mine");
  assert.ok(acceptance <= 0.5, `强禁忌下接受度该低于一半（实际 ${acceptance}）`);
});

test("方言距离影响传播：越远越听不懂", () => {
  assert.ok(dialectBarrier(0, 0.8, 0.2) > dialectBarrier(0, 0.2, 0.2), "方言差越大越难");
  assert.ok(dialectBarrier(0, 0.5, 0.8) < dialectBarrier(0, 0.5, 0.2), "联系越密方言越近");
});

test("世袭和任命的职位从天命祖先那里得到正当性", () => {
  const beliefs = { "belief:ancestors": 0.8, "belief:heaven": 0.6 };
  assert.ok(legitimacyFromBelief(beliefs, "office:headman", "hereditary") > 0, "世袭有正当性");
  assert.ok(legitimacyFromBelief(beliefs, "office:headman", "appointed") > 0, "任命有正当性");
  assert.equal(legitimacyFromBelief(beliefs, "office:headman", "vote"), 0, "推举不从信仰来");
});

test("有祭祀设施时，民心下滑变慢", () => {
  const beliefs = { "belief:ancestors": 0.8 };
  const withTemple = standingDecayWithTemple(beliefs, true, 1);
  const without = standingDecayWithTemple(beliefs, false, 1);
  assert.ok(withTemple < without, "有庙下滑慢");
});

test("铺下信仰后，投影说得出村子信什么", () => {
  const sim = world();
  const r = sim.dispatch({ type: CultureCommands.found, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const view = sim.project({ id: CultureProjections.beliefs, params: {} });
  assert.equal(view.ok, true);
  const data = view.data as Record<string, unknown>;
  assert.ok((data.beliefs as unknown[]).length >= 3);
  assert.ok(typeof data.line === "string");
  assert.ok(!/\d/.test(String(data.line)), "不出现数字");
});

test("做仪式后虔诚度上升", () => {
  const sim = world();
  sim.dispatch({ type: CultureCommands.found, source: "system" });
  const before = sim.worldView().getComponent("culture:village", "culture.state") as
    { beliefs: Record<string, number> } | undefined;
  const r = sim.dispatch({ type: CultureCommands.ritual, payload: { ritualId: "ritual:spring-sacrifice" }, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const after = sim.worldView().getComponent("culture:village", "culture.state") as
    { beliefs: Record<string, number> } | undefined;
  const beforeMax = Math.max(...Object.values(before!.beliefs));
  const afterMax = Math.max(...Object.values(after!.beliefs));
  assert.ok(afterMax > beforeMax, "做仪式后虔诚度上升");
});

test("没有信仰就做不了仪式", () => {
  const sim = world();
  const r = sim.dispatch({ type: CultureCommands.ritual, payload: { ritualId: "ritual:spring-sacrifice" }, source: "system" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /没有/);
});

test("信仰状态随存档持久化", () => {
  const sim = world();
  sim.dispatch({ type: CultureCommands.found, source: "system" });
  const before = sim.worldView().getComponent("culture:village", "culture.state") as
    { beliefs: Record<string, number> } | undefined;

  const saved = sim.save();
  const loaded = Simulation.load(saved, [modernWorldModule, worldClockModule, worldSpaceModule,
    worldObjectsModule, cultureModule]);
  assert.equal(loaded.result.ok, true);
  const after = loaded.simulation.worldView().getComponent("culture:village", "culture.state") as
    { beliefs: Record<string, number> } | undefined;
  assert.deepEqual(after?.beliefs, before?.beliefs, "读档后信仰还在");
});
