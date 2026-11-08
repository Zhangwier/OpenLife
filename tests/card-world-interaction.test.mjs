import assert from "node:assert/strict";
import test from "node:test";
import { pickDropTarget, yardFurnishing, oldYardFurnishing } from "../apps/card-world/board-layout.js";
import { planVillageExchange } from "../apps/card-world/village-exchange.js";

test("a wide card catches a drop at its visible edge but a gap stays empty", () => {
  const bed = { x: 0, y: 0, w: 112, h: 148, z: 0 };
  const door = { x: 150, y: 0, w: 112, h: 148, z: 0 };
  assert.equal(pickDropTarget({ x: 131, y: 74 }, [bed, door], 1), null);
  assert.equal(pickDropTarget({ x: 112, y: 144 }, [bed, door], 1), bed);
  assert.equal(pickDropTarget({ x: 122, y: 74 }, [bed, door], 0.5), bed);
  assert.equal(pickDropTarget({ x: 122, y: 74 }, [bed, door], 1), null);
});

test("only furniture still at the old default coordinates moves to the sides of the gate", () => {
  const yard = { x: 1000, y: 500, w: 560, h: 640, gate: { x: 1220, w: 120 } };
  const old = { x: 1280, y: 940, cards: [{ key: "fire" }] };
  assert.equal(oldYardFurnishing(old, yard), "fire");
  assert.equal(oldYardFurnishing({ ...old, x: old.x + 1 }, yard), null);
  for (const key of ["bed", "fire", "stove", "store", "chest"]) {
    const { x } = yardFurnishing(key, yard);
    assert.ok(x + 112 <= yard.gate.x - 20 || x >= yard.gate.x + yard.gate.w + 20, key);
  }
  const table = yardFurnishing("table", yard);                       // the one thing in the middle: where everyone eats
  assert.ok(table.x < yard.gate.x + yard.gate.w && table.x + 112 > yard.gate.x && table.y + 148 < yard.y + yard.h - 100);
  assert.equal(yardFurnishing("grain", yard), null, "grain is kept in the granary now");
});

test("village barter uses the exact cards and refuses a stale or unfair proposal", () => {
  const grain = { id: 10, key: "grain" }, fish = { id: 20, key: "fish" };
  const plan = (extra = {}) => planVillageExchange({
    give: [grain], hold: [fish], giveIds: [10], askId: 20,
    name: "陶婶", hunger: 0, closeness: "陌生", owed: 0, credit: false, wants: ["grain"], ...extra,
  });
  assert.deepEqual(plan().give, [grain]);
  assert.equal(plan().take, fish);
  assert.equal(plan({ hunger: 5, wants: [] }).accept, false);
  assert.equal(plan({ giveIds: [10, 10] }), null);
  assert.equal(plan({ hold: [] }), null);
  assert.equal(plan({ give: [{ id: 10, key: "wood" }], closeness: "见过", credit: true }).onCredit, 2);
});
