import assert from "node:assert/strict";
import test from "node:test";
import { treeStage, treeYield } from "../apps/card-world/resource-ecology.js";

test("a chestnut or pine stand has a growth stage and gives more as it grows", () => {
  assert.equal(treeStage(0, 8), "empty");
  assert.equal(treeStage(2, 8), "sapling");
  assert.equal(treeStage(4, 8), "young");
  assert.equal(treeStage(6, 8), "mature");
  assert.equal(treeStage(8, 8), "old");
  assert.equal(treeYield(2, 8, false), 1);
  assert.equal(treeYield(2, 8, true), 2);
  assert.equal(treeYield(4, 8, false), 2);
  assert.equal(treeYield(6, 8, false), 3);
  assert.equal(treeYield(8, 8, false), 4);
  assert.equal(treeYield(8, 8, true), 4);          // capped: one felling is one armful
  assert.equal(treeYield(0, 8, true), 0);
});
