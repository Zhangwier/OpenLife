import assert from "node:assert/strict";
import test from "node:test";
import { droughtDays, fellingNext, floodAfter, harvestYield, rabbitCap, rabbitRaid, soilAfterHarvest, soilAtWinter } from "../apps/card-world/ecology-chain.js";
import { cropWeather, planProduction } from "../apps/card-world/production.js";

test("millet tires the ground year on year; beans and a fallow year bring it back", () => {
  let field = { key: "field", stock: 3, sown: true, crop: "grain" };
  const yields = [];
  for (let year = 0; year < 3; year++) {
    const plan = planProduction({ kind: "harvest", source: field, season: "秋" });
    yields.push(plan.output.length);
    field = { ...field, ...plan.stock, stock: 3, sown: true, crop: "grain" };
  }
  assert.deepEqual(yields, [6, 6, 3]);                 // soil 3 → 2 → 1
  assert.equal(field.soil, 0);
  const beans = planProduction({ kind: "harvest", source: { ...field, crop: "bean" }, season: "秋" });
  assert.deepEqual(beans.output, ["bean", "bean"]);    // poor ground, half a crop
  assert.equal(beans.stock.soil, 2);
  assert.equal(soilAtWinter({ soil: 2, cropped: false }), 3);
  assert.equal(soilAtWinter({ soil: 2, cropped: true }), 2);
  assert.equal(soilAfterHarvest({ soil: 4, crop: "bean" }), 4);
  assert.equal(harvestYield({ stock: 3, soil: 4 }), 9);
});

test("beans are sown from a bean, and stand a longer dry spell than millet", () => {
  const bean = { key: "bean" };
  const plan = planProduction({ kind: "sow", source: { key: "field2", stock: 0, sown: false }, season: "春", cards: [bean], use: ["bean"] });
  assert.deepEqual(plan.stock, { stock: 0, sown: true, crop: "bean" });
  assert.deepEqual(plan.inputs, [bean]);
  assert.equal(droughtDays({ crop: "bean" }), 6);
  const dry = { day: 8, season: "夏", rain: false, dryDays: 5 };
  assert.equal(cropWeather({ stock: 3, sown: true, crop: "bean" }, dry), null);
  assert.deepEqual(cropWeather({ stock: 3, sown: true, crop: "grain" }, dry), { stock: 2, cause: "drought" });
});

test("rabbits multiply with the food and a dog keeps them off the crop", () => {
  assert.equal(rabbitCap(0), 2);
  assert.equal(rabbitCap(14), 4);
  assert.equal(rabbitCap(100), 6);
  const fields = [{ stock: 2 }, { stock: 0 }, { stock: 1, sown: false }];
  const at = (v) => () => v;
  assert.equal(rabbitRaid({ rabbits: 4, guarded: false, season: "夏" }, fields, at(0.2)).length, 1);
  assert.equal(rabbitRaid({ rabbits: 4, guarded: true, season: "夏" }, fields, at(0.2)).length, 0);
  assert.equal(rabbitRaid({ rabbits: 6, guarded: false, season: "冬" }, fields, at(0)).length, 0);
});

test("stumps left standing bring the spring flood a day sooner, and regrowth wears it off", () => {
  let felled = 0;
  for (let d = 0; d < 6; d++) felled = fellingNext(felled, 1);
  assert.equal(floodAfter(felled), 2);
  for (let d = 0; d < 6; d++) felled = fellingNext(felled, 2);
  assert.equal(floodAfter(felled), 1);
  for (let d = 0; d < 10; d++) felled = fellingNext(felled, 0);
  assert.equal(floodAfter(felled), 2);
});
