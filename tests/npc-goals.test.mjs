import test from "node:test";
import assert from "node:assert/strict";
import { chooseNpcIntent, chooseVillageAid, shortagePressure } from "../apps/card-world/npc-goals.js";

test("utility arbitration is stable and rejects impossible/NaN actions", () => {
  const x = [
    {id:"walk",possible:false,utility:999},
    {id:"help",possible:true,utility:2},
    {id:"rest",possible:true,utility:2},
    {id:"broken",possible:true,utility:NaN},
  ];
  assert.equal(chooseNpcIntent(x).id,"help");
  assert.equal(chooseNpcIntent(x,"rest").id,"rest");
  assert.equal(chooseNpcIntent([]),null);
});
test("shortage produces aid but a full granary or depleted lake does not", () => {
  assert.equal(shortagePressure(0,8),100);
  assert.equal(shortagePressure(9,8),0);
  assert.equal(chooseVillageAid({grain:0,cooked:0,fish:4,generosity:.75}).id,"help-by-fishing");
  assert.equal(chooseVillageAid({grain:15,cooked:5,fish:4,generosity:.75}).id,"resume-own-life");
  assert.equal(chooseVillageAid({grain:0,cooked:0,fish:0,generosity:.75}).id,"resume-own-life");
  assert.equal(chooseVillageAid({grain:0,cooked:0,fish:4,generosity:.75,canTravel:false}).id,"resume-own-life");
});
