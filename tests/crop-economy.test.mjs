import test from "node:test";
import assert from "node:assert/strict";

test("spring planting consumes a seed and can only happen once on a bare field", async () => {
  const { planProduction } = await import("../apps/card-world/production.js");
  const source = { key: "field2", stock: 0, sown: false }, grain = { key: "grain" };
  const request = { kind: "sow", source, season: "春", cards: [grain] };
  assert.deepEqual(planProduction(request), { inputs: [grain], stock: { stock: 0, sown: true, crop: "grain" }, output: [] });
  assert.equal(planProduction({ ...request, source: { ...source, sown: true } }), null);
  assert.equal(planProduction({ ...request, season: "夏" }), null);
  assert.equal(planProduction({ ...request, cards: [] }), null);
});

test("a fourth dry day costs two grain at harvest unless the plot was tended yesterday", async () => {
  const { cropWeather, planProduction } = await import("../apps/card-world/production.js");
  const field = { key: "field", stock: 3, sown: true, tendDay: 6 };
  const weather = { day: 8, season: "夏", rain: false, dryDays: 4 };
  const dry = cropWeather(field, weather);
  assert.deepEqual(dry, { stock: 2, cause: "drought" });
  assert.equal(cropWeather({ ...field, tendDay: 7 }, weather), null);
  assert.equal(cropWeather(field, { ...weather, dryDays: 3 }), null);
  assert.equal(cropWeather({ ...field, sown: false }, weather), null);
  assert.deepEqual(cropWeather({ ...field, stock: 1 }, { ...weather, rain: true, rainGrowth: true, dryDays: 0 }), { stock: 2, cause: "rain" });
  const harvest = (source) => planProduction({ kind: "harvest", source, season: "秋" }).output.length;
  assert.equal(harvest(field) - harvest({ ...field, stock: dry.stock }), 2);
});
