import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import {
  GeographyComponents,
  GeographyKinds,
  GeographyRelations,
  worldGeographyModule,
} from "@openlife/module-world-geography";
import { Simulation } from "@openlife/simulation";

const fixtureModule: OpenLifeModule = {
  manifest: {
    id: "geography-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
  },
  register(ctx) {
    ctx.registerComponent({ id: "geography-fixture.actor", persist: true });
    ctx.registerComponent({ id: "geography-fixture.object", persist: true });
    ctx.registerCommand({ type: "geography-fixture.spawn" });
    ctx.registerResolutionRule({
      id: "geography-fixture.spawn.resolve",
      commandType: "geography-fixture.spawn",
      resolve: (c) => [{
        kind: "spawnEntity",
        localId: "entity",
        entityKind: String(c.command.payload.kind ?? "geography-fixture.actor"),
        components: {},
        announce: false,
      }],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function createRegion(simulation: Simulation, name: string): string {
  const before = new Set(simulation.worldView().listEntities({ kind: GeographyKinds.region }).map((entity) => entity.id));
  must(simulation, { type: "world-geography.create_region", payload: { name } });
  return simulation.worldView().listEntities({ kind: GeographyKinds.region }).find((entity) => !before.has(entity.id))!.id;
}

function createLocation(simulation: Simulation, regionId: string, name: string): string {
  const before = new Set(simulation.worldView().listEntities({ kind: GeographyKinds.location }).map((entity) => entity.id));
  must(simulation, { type: "world-geography.create_location", payload: { regionId, name } });
  return simulation.worldView().listEntities({ kind: GeographyKinds.location }).find((entity) => !before.has(entity.id))!.id;
}

function spawnFixture(simulation: Simulation, kind: string): string {
  const before = new Set(simulation.worldView().listEntities({ kind }).map((entity) => entity.id));
  must(simulation, { type: "geography-fixture.spawn", payload: { kind } });
  return simulation.worldView().listEntities({ kind }).find((entity) => !before.has(entity.id))!.id;
}

test("regions contain locations and adjacency stores the same physical distance in both directions", () => {
  const simulation = new Simulation({ worldSeed: 16001, modules: [worldGeographyModule, fixtureModule] });
  const regionId = createRegion(simulation, "River Valley");
  const villageId = createLocation(simulation, regionId, "Riverside Village");
  const clayBankId = createLocation(simulation, regionId, "Clay Bank");

  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: villageId, toLocationId: clayBankId, distanceKm: 4.7 },
  });

  const contained = simulation.worldView().listRelations({ type: GeographyRelations.contains, from: regionId });
  assert.deepEqual(new Set(contained.map((relation) => relation.to)), new Set([villageId, clayBankId]));

  const forward = simulation.worldView().listRelations({ type: GeographyRelations.adjacentTo, from: villageId, to: clayBankId })[0]!;
  const reverse = simulation.worldView().listRelations({ type: GeographyRelations.adjacentTo, from: clayBankId, to: villageId })[0]!;
  assert.equal(forward.components[GeographyComponents.connection]?.distanceKm, 4.7);
  assert.equal(reverse.components[GeographyComponents.connection]?.distanceKm, 4.7);
});

test("a late-added Region becomes a neighbor automatically when a new map pack stitches one border Location to the existing map", () => {
  const simulation = new Simulation({ worldSeed: 16004, modules: [worldGeographyModule, fixtureModule] });
  const originalRegionId = createRegion(simulation, "Original Country");
  const originalBorderId = createLocation(simulation, originalRegionId, "Original Border");

  let projection = simulation.project({ id: "world-geography.region-neighbors", params: { regionId: originalRegionId } });
  assert.deepEqual(projection.data?.neighbors, []);

  const expansionRegionId = createRegion(simulation, "Expansion Country");
  const expansionBorderA = createLocation(simulation, expansionRegionId, "Expansion Border A");
  const expansionBorderB = createLocation(simulation, expansionRegionId, "Expansion Border B");
  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: originalBorderId, toLocationId: expansionBorderA, distanceKm: 12 },
  });
  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: originalBorderId, toLocationId: expansionBorderB, distanceKm: 18 },
  });

  projection = simulation.project({ id: "world-geography.region-neighbors", params: { regionId: originalRegionId } });
  const neighbors = projection.data?.neighbors as Array<Record<string, any>>;
  assert.equal(neighbors.length, 1);
  assert.equal(neighbors[0]?.regionId, expansionRegionId);
  assert.equal(neighbors[0]?.borderConnectionCount, 2);
  assert.equal(neighbors[0]?.minDistanceKm, 12);

  const reverse = simulation.project({ id: "world-geography.region-neighbors", params: { regionId: expansionRegionId } });
  const reverseNeighbors = reverse.data?.neighbors as Array<Record<string, any>>;
  assert.equal(reverseNeighbors.length, 1);
  assert.equal(reverseNeighbors[0]?.regionId, originalRegionId);
  assert.equal(reverseNeighbors[0]?.borderConnectionCount, 2);
});

test("any world entity can be placed at a location and relocation leaves only one current located_at relation", () => {
  const simulation = new Simulation({ worldSeed: 16002, modules: [worldGeographyModule, fixtureModule] });
  const regionId = createRegion(simulation, "Lowland");
  const villageId = createLocation(simulation, regionId, "Village");
  const riversideId = createLocation(simulation, regionId, "Riverside");
  const actorId = spawnFixture(simulation, "geography-fixture.actor");
  const kilnId = spawnFixture(simulation, "geography-fixture.object");

  must(simulation, { type: "world-geography.place_entity", actorId, targetId: villageId });
  must(simulation, { type: "world-geography.place_entity", actorId: kilnId, targetId: villageId });
  must(simulation, { type: "world-geography.place_entity", actorId, targetId: riversideId });

  const actorPlacement = simulation.worldView().listRelations({ type: GeographyRelations.locatedAt, from: actorId });
  const kilnPlacement = simulation.worldView().listRelations({ type: GeographyRelations.locatedAt, from: kilnId });
  assert.equal(actorPlacement.length, 1);
  assert.equal(actorPlacement[0]?.to, riversideId);
  assert.equal(kilnPlacement.length, 1);
  assert.equal(kilnPlacement[0]?.to, villageId);
});

test("location projection exposes region, neighbors, distance and current occupants without weather or ecology vocabulary", () => {
  const simulation = new Simulation({ worldSeed: 16003, modules: [worldGeographyModule, fixtureModule] });
  const regionId = createRegion(simulation, "Basin");
  const settlementId = createLocation(simulation, regionId, "Settlement");
  const forestEdgeId = createLocation(simulation, regionId, "Forest Edge");
  const actorId = spawnFixture(simulation, "geography-fixture.actor");

  must(simulation, {
    type: "world-geography.connect_locations",
    payload: { fromLocationId: settlementId, toLocationId: forestEdgeId, distanceKm: 2.3 },
  });
  must(simulation, { type: "world-geography.place_entity", actorId, targetId: settlementId });

  const projection = simulation.project({ id: "world-geography.location", params: { locationId: settlementId } });
  assert.equal(projection.data?.exists, true);
  assert.equal(projection.data?.regionId, regionId);
  // Step 2 exposes the raw connection facts (distance + terrainCost) and the
  // size of the location's connected component.
  //
  // Step 3.2 unified this with the boundary handshake through one connection
  // primitive, which always materialises the terrain multiplier: a connection
  // that omits it would force every downstream reader to invent a default.
  assert.deepEqual(projection.data?.neighbors, [{ locationId: forestEdgeId, distance: 2.3, terrainCost: 1 }]);
  assert.deepEqual(projection.data?.occupants, [actorId]);
  assert.equal(projection.data?.componentSize, 2);

  const source = JSON.stringify(projection.data);
  assert.equal(source.includes("weather"), false);
  assert.equal(source.includes("species"), false);
  assert.equal(source.includes("climate"), false);
});
