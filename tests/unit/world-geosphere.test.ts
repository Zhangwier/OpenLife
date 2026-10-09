import { test } from "node:test";
import assert from "node:assert/strict";
import { worldGeographyModule, GeographyKinds } from "@openlife/module-world-geography";
import { worldGeosphereModule, type GeosphereApi } from "@openlife/module-world-geosphere";
import { Simulation } from "@openlife/simulation";

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function setupLocation(seed: number, name = "Test Location") {
  const simulation = new Simulation({ worldSeed: seed, modules: [worldGeographyModule, worldGeosphereModule] });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Test Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  return { simulation, locationId };
}

test("a geography location can receive a stable geological profile", () => {
  const { simulation, locationId } = setupLocation(17001, "Mountain Pass");
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: {
      elevationM: 1840,
      terrain: "mountain",
      substrate: "granite",
      tectonicSetting: "convergent",
    },
  });

  const projection = simulation.project({ id: "world-geosphere.location-profile", params: { locationId } });
  assert.equal(projection.data?.exists, true);
  assert.equal(projection.data?.elevationM, 1840);
  assert.equal(projection.data?.terrain, "mountain");
  assert.equal(projection.data?.substrate, "granite");
  assert.equal(projection.data?.tectonicSetting, "convergent");
  assert.ok(Number(projection.data?.upliftPotential) > 0.7);
  assert.ok(Number(projection.data?.seismicPotential) > 0.7);
});

test("tectonic settings produce different broad hazard and uplift tendencies without forcing terrain", () => {
  const stable = setupLocation(17002, "Stable Plateau");
  must(stable.simulation, {
    type: "world-geosphere.set_profile",
    targetId: stable.locationId,
    payload: { elevationM: 900, terrain: "plateau", substrate: "sandstone", tectonicSetting: "stable" },
  });
  const hotspot = setupLocation(17003, "Volcanic Plain");
  must(hotspot.simulation, {
    type: "world-geosphere.set_profile",
    targetId: hotspot.locationId,
    payload: { elevationM: 120, terrain: "plain", substrate: "basalt", tectonicSetting: "hotspot" },
  });

  const stableView = stable.simulation.project({ id: "world-geosphere.location-profile", params: { locationId: stable.locationId } });
  const hotspotView = hotspot.simulation.project({ id: "world-geosphere.location-profile", params: { locationId: hotspot.locationId } });

  assert.equal(stableView.data?.terrain, "plateau");
  assert.equal(hotspotView.data?.terrain, "plain", "tectonics should not overwrite authored terrain");
  assert.ok(Number(hotspotView.data?.volcanicPotential) > Number(stableView.data?.volcanicPotential));
  assert.ok(Number(stableView.data?.seismicPotential) < 0.1);
});

test("coarse geological epochs evolve elevation and activity at geological rather than daily timescales", () => {
  const convergent = setupLocation(17005, "Rising Range");
  must(convergent.simulation, {
    type: "world-geosphere.set_profile",
    targetId: convergent.locationId,
    payload: { elevationM: 1200, terrain: "mountain", substrate: "granite", tectonicSetting: "convergent" },
  });
  must(convergent.simulation, {
    type: "world-geosphere.advance_epoch",
    targetId: convergent.locationId,
    payload: { years: 10_000 },
    source: "system",
  });
  const convergentView = convergent.simulation.project({
    id: "world-geosphere.location-profile",
    params: { locationId: convergent.locationId },
  });

  const divergent = setupLocation(17006, "Rift Floor");
  must(divergent.simulation, {
    type: "world-geosphere.set_profile",
    targetId: divergent.locationId,
    payload: { elevationM: 500, terrain: "valley", substrate: "basalt", tectonicSetting: "divergent" },
  });
  must(divergent.simulation, {
    type: "world-geosphere.advance_epoch",
    targetId: divergent.locationId,
    payload: { years: 10_000 },
    source: "system",
  });
  const divergentView = divergent.simulation.project({
    id: "world-geosphere.location-profile",
    params: { locationId: divergent.locationId },
  });

  assert.equal(convergentView.data?.geologicalYears, 10_000);
  assert.equal(divergentView.data?.geologicalYears, 10_000);
  assert.ok(Number(convergentView.data?.elevationM) > 1200, "convergent setting should accumulate uplift");
  assert.ok(Number(divergentView.data?.elevationM) < 500, "the simplified rift setting should accumulate subsidence");
  assert.ok(Number(convergentView.data?.seismicEpisodes) >= 7);
  assert.equal(convergentView.data?.terrain, "mountain", "slow evolution should not silently rewrite terrain categories");
});

test("geological activity events are traceable world facts, while stable crust stays comparatively quiet", () => {
  const active = setupLocation(17007, "Transform Belt");
  must(active.simulation, {
    type: "world-geosphere.set_profile",
    targetId: active.locationId,
    payload: { elevationM: 300, terrain: "hill", substrate: "granite", tectonicSetting: "transform" },
  });
  must(active.simulation, {
    type: "world-geosphere.advance_epoch",
    targetId: active.locationId,
    payload: { years: 20_000 },
    source: "system",
  });

  const stable = setupLocation(17008, "Old Craton");
  must(stable.simulation, {
    type: "world-geosphere.set_profile",
    targetId: stable.locationId,
    payload: { elevationM: 300, terrain: "plain", substrate: "granite", tectonicSetting: "stable" },
  });
  must(stable.simulation, {
    type: "world-geosphere.advance_epoch",
    targetId: stable.locationId,
    payload: { years: 20_000 },
    source: "system",
  });

  const activeView = active.simulation.project({ id: "world-geosphere.location-profile", params: { locationId: active.locationId } });
  const stableView = stable.simulation.project({ id: "world-geosphere.location-profile", params: { locationId: stable.locationId } });
  assert.ok(Number(activeView.data?.seismicEpisodes) > Number(stableView.data?.seismicEpisodes));

  const activeEvents = active.simulation.kernel.internals.eventLog.all();
  assert.ok(activeEvents.some((event) => event.type === "world-geosphere.epoch_advanced"));
  assert.ok(activeEvents.some((event) => event.type === "world-geosphere.seismic_activity"));
});

test("geosphere capability exposes location facts without climate or ecology vocabulary", () => {
  let capturedApi: GeosphereApi | undefined;
  const probeModule = {
    manifest: {
      id: "geosphere-probe",
      version: "0.1.0",
      engineRange: "^0.1.0",
      type: "system-pack" as const,
      requires: ["world.geosphere-profile"],
    },
    register(ctx: Parameters<typeof worldGeosphereModule.register>[0]) {
      capturedApi = ctx.registry.capabilityImplementation("world.geosphere-profile") as GeosphereApi | undefined;
    },
  };
  const simulation = new Simulation({
    worldSeed: 17004,
    modules: [worldGeographyModule, worldGeosphereModule, probeModule],
  });
  must(simulation, { type: "world-geography.create_region", payload: { name: "Test Region" } });
  const regionId = simulation.worldView().listEntities({ kind: GeographyKinds.region })[0]!.id;
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name: "Clay Valley" } });
  const locationId = simulation.worldView().listEntities({ kind: GeographyKinds.location })[0]!.id;
  must(simulation, {
    type: "world-geosphere.set_profile",
    targetId: locationId,
    payload: {
      elevationM: 85,
      terrain: "valley",
      substrate: "clay-rich-sediment",
      tectonicSetting: "stable",
    },
  });

  assert.ok(capturedApi);
  const profile = capturedApi.profile(simulation.worldView(), locationId);
  assert.equal(profile?.terrain, "valley");
  assert.equal(profile?.substrate, "clay-rich-sediment");

  const text = JSON.stringify(profile);
  assert.equal(text.includes("weather"), false);
  assert.equal(text.includes("climate"), false);
  assert.equal(text.includes("species"), false);
});
