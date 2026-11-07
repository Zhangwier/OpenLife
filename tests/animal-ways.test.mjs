import assert from "node:assert/strict";
import test from "node:test";
import { HABITS, catchUp, fileSlot, flockSlot, isActive, leaderOf } from "../apps/card-world/animal-ways.js";

test("each animal keeps its own hours", () => {
  assert.ok(isActive("duck", 10) && !isActive("duck", 23));
  assert.ok(isActive("deer", 6) && isActive("deer", 18) && !isActive("deer", 13));    // dawn and dusk, not midday
  assert.ok(isActive("rabbit", 19) && !isActive("rabbit", 12));
  assert.ok(isActive("boar", 22) && !isActive("boar", 11));
  assert.ok(isActive("tiger", 2) && !isActive("tiger", 12));
  assert.equal(HABITS.deer.group, "flock");
  assert.equal(HABITS.rabbit.group, "alone");
});

test("the oldest leads; followers fan out behind it, and young ones go in a line", () => {
  assert.equal(leaderOf([{ id: 5, born: 3 }, { id: 2, born: 7 }, { id: 9, born: 3 }]).id, 5);
  const lead = { x: 0, y: 0 }, east = 0;
  const a = flockSlot(lead, east, 1, 100), b = flockSlot(lead, east, 2, 100), c = flockSlot(lead, east, 3, 100);
  assert.ok(a.x < 0 && b.x < 0, "behind the leader");
  assert.ok(Math.sign(a.y) === -Math.sign(b.y), "on either side");
  assert.ok(c.x < a.x, "the next row further back");
  const d = fileSlot({ x: 100, y: 100 }, Math.PI / 2, 40);                          // heading south: the one behind is north of it
  assert.deepEqual([Math.round(d.x), Math.round(d.y)], [100, 60]);
  assert.equal(catchUp(10, 60), 1);
  assert.ok(catchUp(400, 60) > catchUp(120, 60));
});

test("a duck flock's day: roosting at night, loafing most at midday, grazing ashore mornings and evenings, dabbling most of all", async () => {
  const { duckPlan, spellLength, alongShore } = await import("../apps/card-world/animal-ways.js");
  let x = 7; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const tally = (h) => { const t = {}; for (let i = 0; i < 2000; i++) { const a = duckPlan(h, rnd); t[a] = (t[a] ?? 0) + 1; } return t; };
  assert.deepEqual(Object.keys(tally(23)), ["roost"]);
  const noon = tally(13), morning = tally(7);
  assert.ok(noon.loaf > noon.dabble, JSON.stringify(noon));
  assert.ok(morning.graze > 500 && !morning.loaf, JSON.stringify(morning));
  assert.ok(morning.dabble > morning.cross);
  const d = spellLength("dabble", rnd); assert.ok(d >= 40 && d <= 90);
  assert.equal(alongShore(23, 1, 24), 0);
  assert.equal(alongShore(0, -1, 24), 23);
});
