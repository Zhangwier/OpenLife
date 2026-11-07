import test from "node:test";
import assert from "node:assert/strict";
import {
  makeNpcSocial, relationOf, stableUnit, npcTemperament, recordNpcChat,
  recordNpcCooperation, willNpcChat, restoreNpcSocial
} from "../apps/card-world/npc-social.js";

test("mind generation is stable, bounded and role-sensitive", () => {
  assert.deepEqual(npcTemperament("aunt"), npcTemperament("aunt"));
  assert.ok(npcTemperament("aunt").caution >= 0.7);
  assert.notDeepEqual(npcTemperament("aunt"), npcTemperament("san"));
  assert.equal(stableUnit(5, "a"), stableUnit(5, "a"));
});
test("NPC-NPC social interactions are directed, recorded once per day, and not player-only", () => {
  const g = makeNpcSocial();
  assert.equal(recordNpcChat(g, "aunt", "san", 1), true);
  assert.equal(recordNpcChat(g, "aunt", "san", 1), false);
  assert.ok(relationOf(g, "aunt", "san").familiarity > 0);
  assert.ok(relationOf(g, "san", "aunt").familiarity > 0);
  assert.equal(relationOf(g, "aunt", "li").familiarity, 0);
  assert.equal(relationOf(g, "aunt", "san").memories.length, 1);
  assert.equal(recordNpcChat(g, "aunt", "san", 2), true);
  assert.equal(relationOf(g, "aunt", "san").memories.length, 2);
});
test("real cooperation updates trust and is idempotent per task/day", () => {
  const g = makeNpcSocial();
  recordNpcCooperation(g, "san", "aunt", 4, "harvest");
  const before = relationOf(g, "san", "aunt").trust;
  recordNpcCooperation(g, "san", "aunt", 4, "harvest");
  assert.equal(relationOf(g, "san", "aunt").trust, before);
  assert.ok(before > 0);
});
test("chat decision is replayable and sensitive to social history", () => {
  const g = makeNpcSocial();
  const before = Array.from({length: 120}, (_, i) => willNpcChat(g,"san","aunt",{seed: 123, day:3, slot:i}));
  assert.deepEqual(before, Array.from({length: 120}, (_, i) => willNpcChat(g,"san","aunt",{seed: 123, day:3, slot:i})));
  for (let i=1; i<=9; i++) recordNpcCooperation(g,"san","aunt", i, "field");
  const after = Array.from({length: 120}, (_, i) => willNpcChat(g,"san","aunt",{seed: 123, day:3, slot:i}));
  assert.ok(after.filter(Boolean).length >= before.filter(Boolean).length);
});
test("save restore keeps network without poisoning a new life", () => {
  const g = makeNpcSocial();
  recordNpcChat(g,"aunt","san",2);
  const restored = makeNpcSocial();
  restoreNpcSocial(restored, JSON.parse(JSON.stringify(g)));
  assert.deepEqual(restored, g);
  restoreNpcSocial(restored, null);
  assert.deepEqual(restored, makeNpcSocial());
  restoreNpcSocial(restored, {version:1,edges:{"bad|id":{familiarity:Infinity,trust:NaN,memories:[{evil:1}]}}});
  assert.equal(relationOf(restored,"bad","id").familiarity, 0);
});
