/**
 * River-terrace nature: floods derived from the settlement sky close the
 * river-side paths; the village dog can be fed and adopted through the Web
 * action layer. Kept deliberately small.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { settlementNatureModule, riverWater, RIVER_PLACE } from "@openlife/module-settlement-nature";
import { worldHazardModule, floodPressure, HazardThresholds } from "@openlife/module-world-hazard";
import { faunaBondsModule } from "@openlife/module-fauna-bonds";
import { ensureNature, natureView, runNatureAction } from "../../apps/web/src/nature.ts";
import { withoutAgents } from "../helpers/agents.ts";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule), settlementNatureModule, worldHazardModule, faunaBondsModule];

function world() {
  const sim = new Simulation({ worldSeed: 4242, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok, true);
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found, payload: { hungerToll: true } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId, payload: { placeId: "place:yard" }, source: "system" }).ok, true);
  ensureNature(sim);
  return { sim, actorId };
}

/** First day at or after `from` whose derived river water is in flood. */
function firstFloodDay(from: number): number {
  for (let d = from; d < from + 2000; d += 1) if (floodPressure(riverWater(d)).pressure >= HazardThresholds.strike) return d;
  throw new Error("no flood day found");
}

test("a flood derived from the sky closes the river bank until it subsides", () => {
  const { sim, actorId } = world();
  sim.advanceTo(firstFloodDay(sim.tick + 1));
  const state = sim.worldView().getComponent(RIVER_PLACE, "world-hazard.state") as any;
  assert.equal(state.flood.stage, "active");
  const blocked = sim.dispatch({ type: SettlementCommands.arrive, actorId, payload: { placeId: "place:river" }, source: "player" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0]?.code, "E_NATURE_FLOODED");
  assert.ok((natureView(sim, actorId, "place:yard")!.lines as string[]).some((l) => l.includes("大水")));
});

test("the village dog can be fed day by day and adopted", () => {
  const { sim, actorId } = world();
  const dog = () => (natureView(sim, actorId, "place:yard")!.animals as any[]).find((a) => a.kind === "狗");
  assert.ok(dog(), "the dog lives in the yard");
  for (let i = 0; i < 25 && dog().stage !== "tame"; i += 1) {
    assert.equal(runNatureAction(sim, actorId, "nature.feed", { animalId: dog().id }).ok, true);
    const tame = (natureView(sim, actorId, "place:yard")!.actions as any[]).find((a) => a.id === "nature.tame" && a.enabled);
    if (tame) runNatureAction(sim, actorId, "nature.tame", tame.payload);
    sim.advanceBy(1);
  }
  assert.equal(dog().stage, "tame");
  assert.ok(dog().line.includes("跟在你身边"));
});

test("the season story tells the flood that really happened, and no flood otherwise", async () => {
  const { seasonTurnEffects } = await import("@openlife/module-settlement-locations");
  const { sim } = world();
  sim.advanceBy(1);
  // The first turn only marks the settlement's first season; stories start after it.
  assert.equal(sim.dispatch({ type: SettlementCommands.seasonTurn, payload: {} }).ok, true);
  const quiet = seasonTurnEffects(sim.worldView()).lines.join("");
  assert.ok(!quiet.includes("河水漫上来") && !quiet.includes("没怎么下雨"), quiet);
  sim.advanceTo(firstFloodDay(sim.tick + 1));
  const told = seasonTurnEffects(sim.worldView()).lines.join("");
  assert.ok(told.includes("河水漫上来"), told);
});

test("hunger costs the player activity but always leaves a way to the hearth", async () => {
  const { dailyActivity, hungerToll, HUNGER_MIN_CAPACITY } = await import("@openlife/module-settlement-locations");
  const { sim, actorId } = world();
  const full = dailyActivity(sim.worldView(), actorId).capacity;
  sim.advanceBy(14);
  assert.equal(dailyActivity(sim.worldView(), actorId).capacity, full - 1, JSON.stringify(hungerToll(sim.worldView(), actorId)));
  sim.advanceBy(60);
  const toll = hungerToll(sim.worldView(), actorId);
  assert.equal(toll.sick, true);
  assert.equal(dailyActivity(sim.worldView(), actorId).capacity, Math.max(HUNGER_MIN_CAPACITY, full - 5));
});

test("a world founded without the hunger rule keeps the old, toll-free days", async () => {
  const { dailyActivity } = await import("@openlife/module-settlement-locations");
  const sim = new Simulation({ worldSeed: 7, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found, payload: {} }).ok, true);
  const full = dailyActivity(sim.worldView(), actorId).capacity;
  sim.advanceBy(60);
  assert.equal(dailyActivity(sim.worldView(), actorId).capacity, full);
});
