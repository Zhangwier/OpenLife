/**
 * Regression: life modules authored against TICKS_PER_YEAR = 12 must read the
 * world's own year once the world clock declares the day scale (360 ticks).
 * Before the fix early-civilization scheduled its annual life task every 12
 * days (30x per year) and family generated spouses aged 20-35 *months*.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { DAY_TICKS_PER_YEAR, TICKS_PER_YEAR, ticksPerYearIn, ageInYearsIn } from "@openlife/life-contracts";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { familyModule } from "@openlife/module-family";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";

function world(day: boolean) {
  const modules = day
    ? [modernWorldModule, worldClockModule, familyModule, earlyCivilizationModule]
    : [modernWorldModule, familyModule, earlyCivilizationModule];
  const sim = new Simulation({ worldSeed: 9301, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character",
    payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  return { sim, id };
}

test("ticksPerYearIn follows the declared world scale", () => {
  assert.equal(ticksPerYearIn(world(true).sim.worldView()), DAY_TICKS_PER_YEAR);
  assert.equal(ticksPerYearIn(world(false).sim.worldView()), TICKS_PER_YEAR);
  const v = world(true).sim.worldView();
  assert.equal(ageInYearsIn(v, 0, DAY_TICKS_PER_YEAR - 1), 0);
  assert.equal(ageInYearsIn(v, 0, DAY_TICKS_PER_YEAR), 1);
});

test("day-scale world: a child starts learning at six years, not six months", () => {
  const { sim, id } = world(true);
  sim.advanceBy(22 * DAY_TICKS_PER_YEAR);
  assert.equal(sim.dispatch({ type: "family.marry", actorId: id, payload: { spouseName: "予" } }).ok, true);
  const born = sim.dispatch({ type: "family.have_child", actorId: id, payload: { givenName: "兰", lifespan: 90 } });
  assert.equal(born.ok, true, born.errors.map((e: { message: string }) => e.message).join("; "));
  const birthTick = sim.tick;
  const child = () => sim.worldView().listEntities({ kind: "modern.character" })
    .find((e) => e.id !== id && Number(e.components["modern.identity"]?.bornAt) === birthTick);
  assert.ok(child(), "child exists");
  sim.advanceBy(2 * DAY_TICKS_PER_YEAR);
  assert.equal(child()!.components["early-civilization.learning"], undefined, "a two-year-old is not an apprentice");
  sim.advanceBy(5 * DAY_TICKS_PER_YEAR);
  assert.ok(child()!.components["early-civilization.learning"], "a seven-year-old has begun learning");
});

test("day-scale world: a generated spouse is an adult in years", () => {
  const { sim, id } = world(true);
  sim.advanceBy(20 * DAY_TICKS_PER_YEAR);
  const r = sim.dispatch({ type: "family.marry", actorId: id, payload: { spouseName: "予" } });
  assert.equal(r.ok, true, r.errors.map((e: { message: string }) => e.message).join("; "));
  const v = sim.worldView();
  const spouse = v.listEntities({ kind: "modern.character" }).find((e) => e.id !== id);
  assert.ok(spouse, "spouse exists");
  const age = ageInYearsIn(v, Number(spouse!.components["modern.identity"]?.bornAt), v.tick);
  assert.ok(age >= 20 && age <= 35, `spouse age ${age}`);
});
