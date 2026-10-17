import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { GeographyKinds, worldGeographyModule } from "@openlife/module-world-geography";
import type { HydrologyApi, HydrologySnapshot } from "@openlife/module-world-hydrology";
import { worldHazardModule } from "@openlife/module-world-hazard";
import { Simulation } from "@openlife/simulation";

/** Controllable stand-in for world.hydrology-state (capability-based dependency). */
function hydrologyFixture(water: { current: HydrologySnapshot }): OpenLifeModule {
  return {
    manifest: { id: "hazard-hydrology-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "content-pack", provides: ["world.hydrology-state"] },
    register(ctx) {
      const api: HydrologyApi = { state: () => water.current };
      ctx.provideCapability("world.hydrology-state", api);
    },
  };
}

function snapshot(soilMoisture: number, surfaceWaterMm: number, waterAvailability = 0.6): HydrologySnapshot {
  return {
    soilMoisture, surfaceWaterMm, waterAvailability,
    lastInfiltrationMm: 0, lastRunoffMm: 0, lastEvaporationMm: 0,
    infiltrationCapacity: 0.5, retentionCapacity: 0.5, runoffTendency: 0.5, updatedAt: 0,
  };
}

function setup() {
  const water = { current: snapshot(0.5, 0) };
  const sim = new Simulation({ worldSeed: 7, modules: [worldGeographyModule, hydrologyFixture(water), worldHazardModule] });
  ok(sim.dispatch({ type: "world-geography.create_region", payload: { name: "River" } }));
  const regionId = sim.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  ok(sim.dispatch({ type: "world-geography.create_location", payload: { regionId, name: "River Terrace" } }));
  const locationId = sim.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  const assess = () => ok(sim.dispatch({ type: "world-hazard.assess_location", targetId: locationId, source: "system" }));
  const state = () => sim.project({ id: "world-hazard.location-state", params: { locationId } }).data as any;
  return { sim, water, locationId, assess, state };
}

function ok(result: { ok: boolean; errors: Array<{ code: string; message: string }> }) {
  assert.equal(result.ok, true, result.errors.map((e) => `${e.code}: ${e.message}`).join("; "));
}

test("flood walks omen -> active -> aftermath -> calm and leaves a public fact", () => {
  const s = setup();
  s.water.current = snapshot(0.8, 25);
  s.assess();
  assert.equal(s.state().state.flood.stage, "omen");
  s.water.current = snapshot(0.95, 45);
  s.assess();
  assert.equal(s.state().state.flood.stage, "active");
  assert.ok(s.state().state.flood.causes.includes("surface_water_high"));
  s.water.current = snapshot(0.5, 0);
  s.assess();
  assert.equal(s.state().state.flood.stage, "aftermath");
  s.assess();
  s.assess();
  assert.equal(s.state().state.flood.stage, "calm");
  const types = s.sim.kernel.internals.eventLog.all().map((e) => e.type);
  assert.ok(types.includes("world-hazard.omen_observed"));
  assert.ok(types.includes("world-hazard.struck"));
  assert.ok(types.includes("world-hazard.subsided"));
});

test("drought is derived from dry soil", () => {
  const s = setup();
  s.water.current = snapshot(0.05, 0, 0.1);
  s.assess();
  assert.equal(s.state().state.drought.stage, "active");
  assert.equal(s.state().state.flood.stage, "calm");
});

test("earthworks lower flood pressure and are capped per location", () => {
  const s = setup();
  s.water.current = snapshot(0.95, 45);
  s.assess();
  const unprotected = s.state().state.flood.pressure;
  for (let i = 0; i < 3; i++) ok(s.sim.dispatch({ type: "world-hazard.build_earthwork", targetId: s.locationId, payload: { name: `levee ${i}` } }));
  const fourth = s.sim.dispatch({ type: "world-hazard.build_earthwork", targetId: s.locationId, payload: { name: "too many" } });
  assert.equal(fourth.ok, false);
  assert.equal(fourth.errors[0]!.code, "E_HAZARD_EARTHWORK_LIMIT");
  s.assess();
  assert.ok(s.state().state.flood.pressure < unprotected);
  assert.equal(s.state().earthworks.length, 3);
});
