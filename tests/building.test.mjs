import assert from "node:assert/strict";
import test from "node:test";
import { BUILD_STAGES, LEAD, addWork, buildSession, delivered, stageOf, totalNeeds, totalWork } from "../apps/card-world/building.js";

test("a house goes up footings, walls, roof — each step wanting its own materials", () => {
  const plot = { build: "hut", stage: 0, work: 0, need: { ...BUILD_STAGES.hut[0].needs } };
  assert.equal(stageOf(plot).name, "打地基");
  assert.equal(addWork(plot, 120), "stage");
  assert.deepEqual(plot.need, { log: 4 });
  plot.need.log = 1;                                    // three logs handed in on the walls so far
  assert.deepEqual(delivered(plot), { stone: 2, log: 3 });
  plot.need.log = 0;
  assert.equal(addWork(plot, 200), "working");
  assert.equal(addWork(plot, 40), "stage");
  assert.equal(stageOf(plot).name, "苫顶");
  assert.equal(addWork(plot, 120), "done");
});

test("the old totals still hold for the old buildings", () => {
  assert.deepEqual(totalNeeds(BUILD_STAGES.bighouse), { stone: 6, clay: 4, log: 10, reed: 8, rope: 3 });
  assert.equal(totalWork(BUILD_STAGES.bighouse), 1440);
  assert.equal(totalWork(BUILD_STAGES.farm), 360);
  assert.ok(BUILD_STAGES.farm[1].thaw && BUILD_STAGES.farm[1].tool === "hoe");
});

test("only someone who knows how can lead; a new hand sometimes has to start a step over", () => {
  assert.equal(buildSession(0.1, () => 0).unable, true);
  assert.equal(buildSession(1, () => 0.99).failed, false);
  const fresh = buildSession(LEAD + 0.1, () => 0.9);
  assert.equal(fresh.failed, true);
  assert.ok(fresh.minutes < 240);
});
