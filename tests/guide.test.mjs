import assert from "node:assert/strict";
import test from "node:test";
import { FIRST_STEPS, guideStep, ladderGoal } from "../apps/card-world/guide.js";
import { LADDER, rungDone } from "../apps/card-world/village.js";

test("the first steps pass as they're done, in order, and can be skipped", () => {
  assert.equal(guideStep({ flags: {} }).id, "walk");
  assert.equal(guideStep({ flags: { walked: true } }).id, "talk");
  assert.equal(guideStep({ flags: { walked: true, talked: true, carrying: true, ate: true } }).id, "book");
  const all = Object.fromEntries(["walked", "talked", "carrying", "ate", "openedBook", "openedVillage"].map((k) => [k, true]));
  assert.equal(guideStep({ flags: all }), null);
  assert.equal(guideStep({ done: true, flags: {} }), null);
  assert.equal(guideStep(undefined), null);
  assert.equal(FIRST_STEPS.length, 6);
});

test("after the first steps, the bar shows the village's nearest goal with progress", () => {
  const v = { firstHarvest: true, allKnown: true, starved: 0, winters: 1, beds: 5, granary: 20, people: 3, fields: 2, traded: 0, threeGen: false, generations: 1 };
  assert.deepEqual(ladderGoal(1, v), { rung: 1, name: "安顿", text: "能住的地方", progress: "快够了" });
  assert.equal(ladderGoal(0, { ...v, firstHarvest: false }).text, "收下第一季的粟");
  assert.equal(ladderGoal(6, v).name, "远行");
});

test("the far shore is the rung after the family has taken root", () => {
  assert.equal(LADDER.at(-1).name, "远行");
  assert.equal(rungDone(LADDER.at(-1), { piratesDone: false, salt: 0 }), false);
  assert.equal(rungDone(LADDER.at(-1), { piratesDone: true, salt: 1 }), true);
});
