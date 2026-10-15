/** Weather and winter: the daily sky shapes work, and a winter fire is worth a day's unit. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, skyOn, isWet, seasonOf, dailyActivity,
} from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";

function life() {
  const sim = new Simulation({ worldSeed: 9, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const run = (type: string, payload: Record<string, unknown> = {}) =>
    sim.dispatch({ type, actorId: id, source: "player", payload: payload as never });
  return { sim, id, run, view: () => homestead(sim.worldView(), id) };
}
const firstDay = (from: number, pred: (d: number) => boolean) => { let d = from; while (!pred(d)) d += 1; return d; };

test("the sky is deterministic, seasonal, and snow only falls in winter", () => {
  const year = Array.from({ length: 360 }, (_, d) => skyOn(d));
  assert.deepEqual(year, Array.from({ length: 360 }, (_, d) => skyOn(d)));
  year.forEach((sky, d) => { if (sky === "雪") assert.equal(seasonOf(d), "冬"); if (sky === "雨") assert.notEqual(seasonOf(d), "冬"); });
  const wet = year.filter((s) => s === "雨" || s === "雪").length;
  assert.ok(wet > 30 && wet < 160, `a plausible number of wet days: ${wet}`);
  const { view } = life();
  assert.equal(view().weather.sky, skyOn(0));
});

test("rain makes outdoor work heavier and keeps the kiln cold", () => {
  const { sim, run, view } = life();
  const wetDay = firstDay(1, (d) => isWet(d));
  sim.advanceBy(wetDay - sim.tick);
  assert.equal(run(SettlementCommands.arrive, { placeId: "place:field" }).ok, true);
  const draw = view().actions.find((a: { id: string; payload?: Record<string, unknown> }) =>
    a.id === SettlementCommands.draw && a.payload?.resourceId === "resource:grain");
  assert.equal(draw?.activityCost, 3, "drawing outdoors costs one more unit when wet");
  assert.equal(run(SettlementCommands.arrive, { placeId: "place:kiln" }).ok, true);
  const fire = run(SettlementCommands.tend, { spaceId: "space:kiln-mouth" });
  assert.equal(fire.ok, false);
  assert.match(fire.errors[0]!.message, /窑火点不起来/);
  const dry = firstDay(sim.tick + 1, (d) => !isWet(d));
  sim.advanceBy(dry - sim.tick);
  assert.equal(run(SettlementCommands.tend, { spaceId: "space:kiln-mouth" }).ok, true, "a dry day lights the kiln");
});

test("rain on the growing field waters it", () => {
  const { sim, run, view } = life();
  const sowDay = firstDay(60, (d) => seasonOf(d) === "春" && !isWet(d) && !isWet(d + 1));
  sim.advanceBy(sowDay - sim.tick);
  run(SettlementCommands.arrive, { placeId: "place:field" });
  assert.equal(run(SettlementCommands.draw, { placeId: "place:field", resourceId: "resource:grain" }).ok, true);
  assert.equal(run(SettlementCommands.sow).ok, true);
  assert.equal(view().crop?.tended, false);
  const rain = firstDay(sim.tick + 1, (d) => skyOn(d) === "雨");
  sim.advanceBy(rain - sim.tick);
  assert.equal(view().crop?.tended, true, "the rain did the watering");
});

test("a winter fire at home burns a real bundle and gives an extra unit tomorrow", () => {
  const { sim, id, run, view } = life();
  assert.equal(seasonOf(sim.tick), "冬");
  assert.equal(run(SettlementCommands.arrive, { placeId: "place:reedbed" }).ok, true);
  assert.equal(run(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }).ok, true);
  assert.equal(run(SettlementCommands.arrive, { placeId: "place:yard" }).ok, true);
  const fire = view().actions.find((a: { id: string; label: string }) => a.id === SettlementCommands.rest && a.label.includes("生一盆火"));
  assert.ok(fire, "the winter fire is offered at home");
  assert.equal(fire!.enabled, true, fire!.reason);
  assert.equal(run(SettlementCommands.rest, fire!.payload as Record<string, unknown>).ok, true);
  const fuelId = String((fire!.payload as Record<string, unknown>).fuelId);
  assert.ok(sim.worldView().getEntity(fuelId)?.archivedAt !== undefined, "the bundle is burned");
  sim.advanceBy(1);
  assert.equal(dailyActivity(sim.worldView(), id).capacity, 9);
});
