import assert from "node:assert/strict";
import test from "node:test";
import { comfort, harm, pickEvent } from "../apps/card-world/storyteller.js";

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const base = { day: 20, lastEvent: 10, difficulty: "寻常", season: "夏", grain: 10, people: 3, mood: 6, dry: false, flammable: 0 };

test("nothing happens for a few quiet days after an event, and less often on the easy setting", () => {
  assert.equal(pickEvent({ ...base, lastEvent: 19 }, () => 0), null);
  assert.equal(pickEvent({ ...base, lastEvent: 18, difficulty: "安稳" }, () => 0), null);
  assert.ok(pickEvent({ ...base, lastEvent: 17 }, () => 0));
});

test("a comfortable village draws trouble, a struggling one a break", () => {
  const count = (ctx) => {
    const tally = { good: 0, bad: 0, social: 0 };
    for (let i = 1; i < 400; i++) { let x = i * 9301 % 233280; const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280); const e = pickEvent(ctx, seq(0, r(), r())); if (e) tally[e.kind]++; }
    return tally;
  };
  const rich = count({ ...base, grain: 40, mood: 8 }), poor = count({ ...base, grain: 0, mood: 3 });
  assert.ok(rich.bad > rich.good, JSON.stringify(rich));
  assert.ok(poor.good > poor.bad, JSON.stringify(poor));
  assert.equal(comfort({ grain: 0, people: 3, mood: 2 }), -1);
});

test("events keep to their seasons and needs; harder settings hurt more", () => {
  for (let i = 0; i < 50; i++) {
    const e = pickEvent({ ...base, season: "春", grain: 0 }, seq(0, i / 50));
    assert.ok(!e || (e.id !== "cold-snap" && e.id !== "rats" && e.id !== "fire" && e.id !== "bumper"), e?.id);
  }
  assert.ok(harm("艰难", 0.25) > harm("寻常", 0.25));
  assert.ok(harm("安稳", 0.25) < harm("寻常", 0.25));
});
