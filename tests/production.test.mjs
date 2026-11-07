import test from "node:test";
import assert from "node:assert/strict";

test("one autumn harvest consumes the standing crop and a second worker cannot harvest it", async () => {
  const { planProduction } = await import("../apps/card-world/production.js");
  const source = { key: "field", stock: 2, sown: true };
  const request = { kind: "harvest", source, season: "秋" };
  const planned = planProduction(request);
  assert.equal(source.stock, 2);
  assert.deepEqual(planned.stock, { stock: 0, sown: false, soil: 2, cropped: true, lastCrop: "grain", crop: undefined });
  assert.deepEqual(planned.output, ["grain", "grain", "grain", "grain"]);
  assert.equal(planProduction({ ...request, season: "冬" }), null);
  assert.equal(planProduction({ ...request, source: { ...source, ...planned.stock } }), null);
});

test("fishing with a net still requires a fish in the shared lake", async () => {
  const { planProduction } = await import("../apps/card-world/production.js");
  const request = { kind: "gather", source: { key: "lake", stock: 1 }, cost: 1, output: ["fish", "fish"] };
  const planned = planProduction(request);
  assert.deepEqual(planned.stock, { stock: 0 });
  assert.deepEqual(planned.output, ["fish", "fish"]);
  assert.equal(planProduction({ ...request, source: { key: "lake", stock: 0 } }), null);
});

test("production consumes distinct inputs and refuses to spend missing inputs or stock", async () => {
  const { planProduction } = await import("../apps/card-world/production.js");
  const cards = [{ key: "fiber" }, { key: "you" }, { key: "fiber" }, { key: "rope" }];
  const request = { kind: "craft", source: { stock: 2 }, cost: 2, cards: cards.slice(2), use: ["fiber", "fiber", "rope"], output: ["net"] };
  assert.equal(planProduction(request), null);
  const planned = planProduction({ ...request, cards });
  assert.deepEqual(planned.inputs, [cards[0], cards[2], cards[3]]);
  assert.deepEqual(planned.stock, { stock: 0 });
  assert.equal(planProduction({ ...request, cards, source: { stock: 1 } }), null);
  assert.equal(cards.length, 4);
});

test("production history survives reload and retains only the most recent outcomes", async () => {
  const { productionHistory, recordProduction } = await import("../apps/card-world/production.js");
  const history = productionHistory();
  for (let i = 0; i < 260; i++) recordProduction(history, { kind: "harvest", minute: i });
  assert.equal(history.events.length, 256);
  assert.equal(history.events[0].seq, 5);
  const loaded = productionHistory(JSON.parse(JSON.stringify(history)));
  recordProduction(loaded, { kind: "fish", minute: 261 });
  assert.equal(loaded.events.at(-1).seq, 261);
  assert.equal(history.events.at(-1).seq, 260);
});
