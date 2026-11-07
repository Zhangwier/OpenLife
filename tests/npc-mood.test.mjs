import assert from "node:assert/strict";
import test from "node:test";
import { BREAK_AT, moodPace, moodStep, moodTarget, moodlets, worst } from "../apps/card-world/npc-mood.js";

test("a cold, hungry, overworked day drags someone below breaking point; a good one lifts them", () => {
  const bad = moodlets({ starving: true, cold: true, worked: 700, lowGrain: true });
  assert.ok(moodTarget(bad) < BREAK_AT);
  assert.equal(worst(bad).id, "starving");
  const good = moodlets({ ateHot: true, chatted: true, goodHarvest: true, newBuilding: "一个地窖", festival: true });
  assert.ok(moodTarget(good) > 7.5);
  assert.ok(good.some((m) => m.text.includes("地窖")));
  assert.equal(moodTarget(moodlets({})), 6);
});

test("mood moves towards how they feel over hours, not at once, and changes the pace of work", () => {
  let mood = 6;
  for (let h = 0; h < 3; h++) mood = moodStep(mood, 0, 60);
  assert.ok(mood < 5 && mood > 3);
  assert.equal(moodPace(2), 1.3);
  assert.equal(moodPace(8), 0.9);
  assert.equal(moodPace(6), 1);
});
