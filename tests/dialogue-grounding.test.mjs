import test from "node:test";
import assert from "node:assert/strict";
import { chat } from "../apps/card-world/voice.js";
test("conversations do not invent grain, seedlings or prepared meals", () => {
  const ctx = { weather:"晴", season:"春", grain:0, cooked:0, sownFields:0, bareFields:2 };
  for (let i = 0; i < 300; i++) {
    const lines = chat("aunt","san",ctx).map(([,text]) => text).join("");
    assert.ok(!lines.includes("锅里有"), lines);
    assert.ok(!lines.includes("苗长出来了"), lines);
    assert.ok(!lines.includes("够下种的份数"), lines);
  }
});
test("winter dialogue doesn't call a nearly empty granary plentiful", () => {
  const ctx = { weather:"雪", season:"冬", grain:0, cooked:0, sownFields:0, bareFields:2 };
  for (let i = 0; i < 300; i++) {
    const lines = chat("aunt","san",ctx).map(([,text]) => text).join("");
    assert.ok(!lines.includes("眼下还有粮"), lines);
  }
});
