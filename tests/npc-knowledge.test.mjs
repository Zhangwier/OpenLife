import test from "node:test";
import assert from "node:assert/strict";
import {
  makeNpcKnowledge, acquireTheory, knowledgeOf, transmitTheory,
  chooseTheoryToShare, restoreNpcKnowledge
} from "../apps/card-world/npc-knowledge.js";
import { makeNpcSocial, recordNpcChat } from "../apps/card-world/npc-social.js";

test("personal theory is not global knowledge, and hearing is not proof", () => {
  const g = makeNpcKnowledge();
  assert.ok(acquireTheory(g, "aunt", "water-marks", {day:1, source:"observed-rainfall", confidence:.88}));
  assert.equal(knowledgeOf(g,"san","water-marks"), null);
  assert.ok(transmitTheory(g,"aunt","san","water-marks",{day:2}));
  assert.equal(knowledgeOf(g,"san","water-marks").awareness, "heard");
  assert.equal(knowledgeOf(g,"san","water-marks").stance, "undecided");
  assert.equal(knowledgeOf(g,"san","water-marks").source, "person:aunt");
  assert.equal(transmitTheory(g,"aunt","san","water-marks",{day:2}), false);
  assert.equal(knowledgeOf(g,"li","water-marks"), null);
});
test("unknown theory cannot be transmitted, nor can world truth leak into record", () => {
  const g=makeNpcKnowledge();
  assert.equal(transmitTheory(g,"aunt","san","lake-god",{day:1}),false);
  acquireTheory(g,"aunt","lake-god",{day:1,source:"rain",stance:"accepts"});
  assert.equal("true" in knowledgeOf(g,"aunt","lake-god"),false);
});
test("selection is stable, gated by actual talk, and respects save isolation", () => {
  const g = makeNpcKnowledge(), social = makeNpcSocial();
  acquireTheory(g,"aunt","water-marks",{day:1});
  recordNpcChat(social,"aunt","san",1);
  const a = chooseTheoryToShare(g,social,"aunt","san",1,8,3);
  const b = chooseTheoryToShare(g,social,"aunt","san",1,8,3);
  assert.deepEqual(a,b);
  const dst=makeNpcKnowledge();
  restoreNpcKnowledge(dst,JSON.parse(JSON.stringify(g)));
  assert.deepEqual(dst,g);
  restoreNpcKnowledge(dst,null);
  assert.deepEqual(dst,makeNpcKnowledge());
});
