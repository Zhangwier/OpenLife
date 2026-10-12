import { test } from "node:test";
import assert from "node:assert/strict";
import { appearanceFor, renderFigure } from "../../apps/web/public/character-appearance.js";
import { objectKind, propSvg, resourceKind, fillRatio, slotFor } from "../../apps/web/public/scene-props.js";

test("visual appearance remains stable across scene renders and differs by resident", () => {
 const residents = ["elder","elder-wife","cook","cook-helper","yu","yu-brother","reed-worker","lan","water-carrier","water-child","trader-elder","clay-digger","potter","weaver"]
   .map(id=>"settlement-locations:resident:"+id);
 for (const id of residents) {
  assert.deepEqual(appearanceFor(id), appearanceFor(id));
  assert.equal(renderFigure(id),renderFigure(id));
  assert.match(renderFigure(id), /data-head="\d" data-eyes="\d" data-mouth="\d"/);
 }
 const faces = new Set(residents.map(id=>{
  const a=appearanceFor(id); return [a.head,a.eyes,a.mouth,a.hair,a.body,a.arms,a.skin].join("-");
 }));
 assert.ok(faces.size>=12,"modular gene kit should not produce identical villagers");
});
test("physical state controls object illustrations, never grants imaginary items",()=>{
 assert.equal(objectKind({prototypeId:"prototype:water-cache"}),"cistern");
 assert.equal(objectKind({prototypeId:"prototype:water-jar"}),"jar");
 assert.equal(objectKind({prototypeId:"prototype:hearth"}),"hearth");
 assert.equal(resourceKind("resource:water"),"river");
 assert.equal(resourceKind("resource:reed"),"reed");
 assert.equal(fillRatio({capacity:12,quantity:6,contentsCount:0}),0.5);
 assert.equal(fillRatio({capacity:4,quantity:0,contentsCount:4}),1);
 assert.equal(fillRatio({capacity:4,quantity:0,contentsCount:0}),0);
 assert.notEqual(propSvg("cistern",0),propSvg("cistern",0.5),"empty and filled reservoirs must look different");
 assert.ok(slotFor("place:river","object",0)[0]>0);
});
