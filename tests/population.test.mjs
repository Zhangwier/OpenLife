import assert from "node:assert/strict";
import test from "node:test";
import { HUNGER, LIFE, births, diesOfAge, isYoung, starveDay, winterSurplus } from "../apps/card-world/population.js";

const always = () => 0, never = () => 0.999;
const herd = (...a) => a.map(([sex, age]) => ({ sex, age }));

test("deer have fawns once a year in spring, one each, and only with a grown stag about", () => {
  const h = herd(["female", 40], ["female", 30], ["male", 50]);
  assert.equal(births("deer", h, { season: "春", dayOfSeason: 2 }, always), 2);
  assert.equal(births("deer", h, { season: "春", dayOfSeason: 3 }, always), 0, "once a year");
  assert.equal(births("deer", h, { season: "夏", dayOfSeason: 2 }, always), 0);
  assert.equal(births("deer", herd(["female", 40], ["female", 30]), { season: "春", dayOfSeason: 2 }, always), 0, "no stag");
  assert.equal(births("deer", herd(["female", 5], ["male", 50]), { season: "春", dayOfSeason: 2 }, always), 0, "too young");
});

test("a boar sow has a litter; hares breed through the warm days; none past what the land holds", () => {
  assert.ok(births("boar", herd(["female", 30], ["male", 40]), { season: "春", dayOfSeason: 2 }, always) >= 2);
  assert.ok(births("rabbit", herd(["female", 10], ["male", 10]), { season: "夏", dayOfSeason: 3 }, always) >= 1);
  assert.equal(births("rabbit", herd(["female", 10], ["male", 10]), { season: "夏", dayOfSeason: 3 }, never), 0);
  const full = Array.from({ length: LIFE.deer.K }, (_, i) => ({ sex: i % 2 ? "male" : "female", age: 40 }));
  assert.equal(births("deer", full, { season: "春", dayOfSeason: 2 }, always), 0);
  assert.equal(births("deer", herd(["female", 40], ["male", 40]), { season: "春", dayOfSeason: 2, cap: 2 }, always), 0);
});

test("old age comes over a span; the young are young for their first year", () => {
  assert.equal(diesOfAge("deer", 50, always), false);
  assert.equal(diesOfAge("deer", LIFE.deer.life[1], never), true);
  assert.equal(diesOfAge("deer", LIFE.deer.life[0] + 10, never), false);
  assert.equal(isYoung("deer", 10), true);
  assert.equal(isYoung("deer", 20), false);
  assert.equal(winterSurplus("deer", LIFE.deer.K), LIFE.deer.K - Math.ceil(LIFE.deer.K * 0.75));
});

test("a hungry mother has no young; starving day after day, an animal dies", () => {
  assert.equal(births("deer", [{ sex: "female", age: 40, fed: false }, { sex: "male", age: 40 }], { season: "春", dayOfSeason: 2 }, always), 0);
  assert.equal(births("deer", [{ sex: "female", age: 40, fed: true }, { sex: "male", age: 40 }], { season: "春", dayOfSeason: 2 }, always), 1);
  assert.deepEqual(starveDay("deer", HUNGER.starving, 1), { days: 2, dies: false });
  assert.deepEqual(starveDay("deer", 10, 2), { days: 3, dies: true });
  assert.deepEqual(starveDay("fox", 10, 2), { days: 3, dies: false });   // a fox goes longer between meals
  assert.deepEqual(starveDay("deer", 5, 2), { days: 0, dies: false });
});
