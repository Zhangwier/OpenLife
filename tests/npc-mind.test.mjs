import assert from "node:assert/strict";
import test from "node:test";
import { farmerProject, fieldsWanted, gathererProject, pickGrove } from "../apps/card-world/npc-mind.js";

const field = (id, extra = {}) => ({ id, soil: 3, sown: false, stock: 0, ...extra });

test("a farmer with more mouths than fields breaks new ground in the off season", () => {
  assert.equal(fieldsWanted(6), 3);
  const base = { people: 6, fields: [field(1, { sown: true, stock: 3 }), field(2, { sown: true, stock: 3 })], grain: 2, hoe: true };
  assert.equal(farmerProject({ ...base, season: "冬" }).id, "open-land");
  assert.notEqual(farmerProject({ ...base, season: "夏" }).id, "open-land");
  assert.equal(farmerProject({ ...base, season: "冬", hoe: false }).id, "open-land");          // clearing needs no hoe
  assert.equal(farmerProject({ ...base, season: "冬", farmPlot: "clear" }).id, "work-plot");
  assert.notEqual(farmerProject({ ...base, season: "冬", farmPlot: "till" }).id, "work-plot");  // frozen: no tilling till spring
  assert.equal(farmerProject({ ...base, season: "春", farmPlot: "till" }).id, "work-plot");
  assert.equal(farmerProject({ ...base, season: "春", fields: [field(1), field(2)], grain: 0, seed: 1 }).id, "sow");   // sow first, then break ground
});

test("tired ground gets beans if there are any, rest if food allows, and ash after harvest", () => {
  const tired = [field(1, { soil: 1 }), field(2)];
  const spring = { season: "春", people: 3, fields: tired, grain: 10, cooked: 6 };
  assert.deepEqual([farmerProject({ ...spring, beans: 2 }).id, farmerProject({ ...spring, beans: 2 }).field], ["sow-bean", 1]);
  assert.deepEqual([farmerProject(spring).id, farmerProject(spring).field], ["fallow", 1]);
  assert.equal(farmerProject({ ...spring, grain: 0, cooked: 0, seed: 1 }).id, "sow");      // hungry: no resting the land
  const autumn = farmerProject({ season: "秋", people: 2, fields: [field(1, { soil: 1 }), field(2)], ash: 1, year: 0 });
  assert.deepEqual([autumn.id, autumn.field], ["manure", 1]);
  assert.notEqual(farmerProject({ season: "秋", people: 2, fields: [field(1, { soil: 1, manured: 0 }), field(2)], ash: 1, year: 0 }).id, "manure");
  assert.equal(farmerProject({ season: "秋", people: 2, fields: [field(1, { sown: true, stock: 2 })], ash: 1 }).id, "harvest");
});

test("gatherers feed foundations and the fire before the pile, and stop piling when there's enough", () => {
  const base = { material: "stone", season: "夏", pile: 2, people: 2, grain: 10, cooked: 6 };
  assert.equal(gathererProject({ ...base, plotNeed: 3 }).id, "supply-plot");
  assert.equal(gathererProject(base).id, "stockpile");
  assert.equal(gathererProject({ ...base, pile: 8 }).id, "rest");
  assert.equal(gathererProject({ ...base, pile: 8, fireFuel: 0, wood: 2 }).id, "feed-fire");
  assert.equal(gathererProject({ ...base, pile: 8, fireFuel: 0, wood: 2, tending: false }).id, "rest");
  assert.equal(gathererProject({ material: "log", season: "秋", pile: 8, grain: 10 }).id, "stockpile");   // winter is coming: more wood
  assert.equal(gathererProject({ material: "log", season: "夏", pile: 8, felled: 4, stumps: 1, grain: 10 }).id, "replant");
});

test("a woodcutter takes from the fullest grove and leaves the last tree standing", () => {
  const groves = [{ stock: 1 }, { stock: 3 }, { stock: 2 }];
  assert.equal(pickGrove(groves).stock, 3);
  assert.equal(pickGrove([{ stock: 1 }]), null);
  assert.equal(pickGrove([{ stock: 1 }, { stock: 0 }]), null);                // not even in a hurry
});

test("the cook keeps the stove lit and the pot full, and smokes fish for winter once she knows how", async () => {
  const { cookProject } = await import("../apps/card-world/npc-mind.js");
  const base = { season: "秋", stove: 5, stoveFuel: 4, grain: 12, reserve: 2, lake: 6, people: 3 };
  assert.equal(cookProject({ ...base, stoveFuel: 0 }).id, "fuel-stove");
  assert.equal(cookProject({ ...base, stove: 1 }).id, "cook");
  assert.equal(cookProject({ ...base, smoking: true }).id, "smoke");
  assert.equal(cookProject({ ...base, stove: 6 }).id, "rest");
});

test("the fisher lets a thin lake rest unless the village is hungry, and helps bring in a big harvest", async () => {
  const { fisherProject } = await import("../apps/card-world/npc-mind.js");
  const fed = { season: "夏", stove: 6, grain: 12, people: 3 };
  assert.equal(fisherProject({ ...fed, lake: 6 }).id, "fish");
  assert.equal(fisherProject({ ...fed, lake: 2 }).id, "rest-lake");
  assert.equal(fisherProject({ season: "夏", lake: 2, stove: 0, grain: 0, people: 3 }).id, "fish");
  assert.equal(fisherProject({ ...fed, season: "秋", lake: 2, ripe: 2 }).id, "help-harvest");
});

test("anyone with time on their hands keeps the fires in; the cook won't cook on a cold stove; wood is laid in before winter", async () => {
  const { cookProject, farmerProject } = await import("../apps/card-world/npc-mind.js");
  const winter = { season: "冬", people: 2, fields: [{ id: 1, soil: 3, sown: false }, { id: 2, soil: 3, sown: false }], grain: 10, cooked: 6 };
  assert.equal(farmerProject({ ...winter, fireFuel: 0 }).id, "firewood");
  assert.equal(farmerProject({ ...winter, season: "秋", build: true }).id, "rest");                 // autumn: the harvest first, building waits
  assert.equal(farmerProject({ ...winter, season: "秋", build: true, crowded: true }).id, "build");  // unless someone has nowhere to sleep
  assert.notEqual(farmerProject({ ...winter, fireFuel: 0, tending: false }).id, "firewood");   // someone else is on it
  assert.equal(farmerProject({ ...winter, fireFuel: 0, stoveFuel: 0, tending: false }).id, "rest");     // the stove is the cook's
  assert.equal(farmerProject(winter).id, "rest");
  assert.equal(farmerProject({ ...winter, season: "秋", logs: 1 }).id, "winter-wood");
  assert.equal(cookProject({ season: "夏", stove: 1, stoveFuel: 0, grain: 10, reserve: 2 }).id, "fuel-stove");
});
