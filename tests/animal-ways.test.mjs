import assert from "node:assert/strict";
import test from "node:test";
import { HABITS, catchUp, fileSlot, flockSlot, isActive, leaderOf } from "../apps/card-world/animal-ways.js";

test("each animal keeps its own hours", () => {
  assert.ok(isActive("duck", 10) && !isActive("duck", 23));
  assert.ok(isActive("deer", 6) && isActive("deer", 18) && isActive("deer", 13));     // one long day, no midday nap
  assert.equal(isActive("deer", 22), false);                                         // one long night
  assert.ok(isActive("rabbit", 19) && !isActive("rabbit", 12));
  assert.ok(isActive("boar", 22) && !isActive("boar", 11));
  assert.ok(isActive("tiger", 2) && !isActive("tiger", 12));
  assert.ok(isActive("wolf", 20) && !isActive("wolf", 12));
  assert.equal(HABITS.wolf.group, "flock");
  assert.equal(HABITS.deer.group, "flock");
  assert.equal(HABITS.rabbit.group, "alone");
});

test("lying up is not the same as being asleep, and every kind stirs now and then", async () => {
  const { ASLEEP, GAIT, STIR, isAsleep, stirAfter } = await import("../apps/card-world/animal-ways.js");
  for (const kind of Object.keys(GAIT)) {
    assert.ok(ASLEEP[kind], `${kind} has its sleeping hours`);
    assert.ok(isAsleep(kind, 2) || isAsleep(kind, 12), `${kind} is asleep either at night or at noon`);
    assert.ok(STIR[kind] && STIR[kind][0] > 0 && STIR[kind][1] >= STIR[kind][0], `${kind} stirs between two times`);
    let x = 7; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 50; i++) { const d = stirAfter(kind, rnd); assert.ok(d >= STIR[kind][0] && d <= STIR[kind][1]); }
  }
  assert.equal(isAsleep("deer", 13), false);      // midday: resting, eyes open
  assert.equal(isAsleep("deer", 2), true);        // the dead of night: asleep
  assert.equal(isAsleep("tiger", 12), true);      // a tiger sleeps by day
  assert.equal(isAsleep("tiger", 2), false);      // and is about at night
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

test("every branch takes its pace from the one table: grazing is slow, a run is the animal's own, and a duck dabbles", async () => {
  const { GAIT, paceOf } = await import("../apps/card-world/animal-ways.js");
  for (const kind of Object.keys(GAIT)) {
    const g = GAIT[kind];
    assert.ok(paceOf(kind, "graze") > 0 && paceOf(kind, "graze") < paceOf(kind, "walk"), `${kind} grazes slower than it walks`);
    assert.ok(paceOf(kind, "walk") <= paceOf(kind, "run"), `${kind} never walks faster than it runs`);
  }
  assert.equal(paceOf("deer", "walk"), GAIT.deer.walk);
  assert.equal(paceOf("deer", "run"), GAIT.deer.run);
  assert.equal(paceOf("tiger", "stalk"), GAIT.tiger.stalk);
  assert.equal(paceOf("tiger", "trot"), GAIT.tiger.trot);
  assert.equal(paceOf("tiger", "run"), GAIT.tiger.run);
  assert.ok(paceOf("duck", "dabble") < paceOf("duck", "swim"));
  assert.ok(paceOf("duck", "drift") < paceOf("duck", "dabble"));
  assert.ok(paceOf("duck", "shore") > paceOf("duck", "walk"));
  assert.equal(paceOf("duck", "swim"), GAIT.duck.swim);
  assert.equal(paceOf("unknown", "walk"), 0.6);                                     // a sensible stranger
});
