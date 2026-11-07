/**
 * Geography Graph tests (Step 2).
 *
 * The graph layer is pure read logic over World relations, so these tests do
 * two things: exercise it against the real Xia pack, and construct small
 * synthetic worlds that isolate one property at a time.
 *
 * The load-bearing test here is `F - derived-only proof`: it removes the single
 * cross-region connection and asserts the region adjacency disappears. If
 * region adjacency were ever cached or stored, that test goes red.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { OpenLifeModule } from "@openlife/contracts";
import {
  GeographyKinds,
  WORLD_EDGES,
  worldGeographyModule,
  type GeographyApi,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack } from "@openlife/module-map-pack";
import { Simulation } from "@openlife/simulation";
import { checkGeographyInvariants } from "../../apps/debug-console/src/invariants.ts";

const REAL_PACK = resolve(import.meta.dirname, "../../packs/xia_starter_v0_1");
const PACK = "xia_starter_v0_1";

const region = (local: string): string => `${PACK}:region:${local}`;
const location = (local: string): string => `${PACK}:location:${local}`;
const boundaryAnchor = (local: string): string => `${PACK}:boundary_anchor:${local}`;

interface Loaded {
  simulation: Simulation;
  geography: GeographyApi;
}

function loadXia(seed = 20261007): Loaded {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [worldGeographyModule, mapPackModule],
  });
  const loaded = loadMapPack(REAL_PACK);
  assert.equal(loaded.ok, true);
  registerMapPack(simulation, loaded.pack as NonNullable<typeof loaded.pack>);
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  assert.ok(geography, "world.geography must be provided");
  return { simulation, geography };
}

/**
 * A tiny hand-built geography fixture.
 *
 * `edges` decides which locations connect, so a test can author a split graph
 * without touching any pack file.
 */
function buildFixture(options: {
  regions: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; regionId: string; name: string }>;
  edges: Array<{ from: string; to: string; distance: number; terrainCost?: number }>;
  anchors?: Array<{ id: string; type: string; edge: string; locationId: string; tags: string[] }>;
}): Simulation {
  const fixture: OpenLifeModule = {
    manifest: {
      id: "graph-fixture",
      version: "0.1.0",
      engineRange: "^0.1.0",
      type: "system-pack",
    },
    register(ctx) {
      // Command types are namespaced ids and cannot contain ":", so the
      // fixture addresses its records by array index rather than by entity id.
      options.regions.forEach((entry, index) => {
        const type = `graph-fixture.region.${index}`;
        ctx.registerCommand({ type });
        ctx.registerResolutionRule({
          id: `${type}.resolve`,
          commandType: type,
          resolve: () => [{
            kind: "spawnEntity",
            localId: "region",
            id: entry.id,
            entityKind: GeographyKinds.region,
            components: { "world-geography.region": { name: entry.name, type: "test" } },
            announce: false,
          }],
        });
      });
      options.locations.forEach((entry, index) => {
        const type = `graph-fixture.location.${index}`;
        ctx.registerCommand({ type });
        ctx.registerResolutionRule({
          id: `${type}.resolve`,
          commandType: type,
          resolve: () => [{
            kind: "spawnEntity",
            localId: "location",
            id: entry.id,
            entityKind: GeographyKinds.location,
            components: { "world-geography.location": { name: entry.name, type: "test" } },
            announce: false,
          }, {
            kind: "addRelation",
            type: "world-geography.contains",
            from: entry.regionId,
            to: "@location",
            announce: false,
          }],
        });
      });
      options.edges.forEach((edge, index) => {
        const type = `graph-fixture.edge.${index}`;
        ctx.registerCommand({ type });
        ctx.registerResolutionRule({
          id: `${type}.resolve`,
          commandType: type,
          resolve: () => [{
            kind: "addRelation",
            type: "world-geography.adjacent_to",
            from: edge.from,
            to: edge.to,
            components: {
              "world-geography.connection": {
                distanceKm: edge.distance,
                ...(edge.terrainCost !== undefined ? { terrainCost: edge.terrainCost } : {}),
              },
            },
            announce: false,
          }, {
            kind: "addRelation",
            type: "world-geography.adjacent_to",
            from: edge.to,
            to: edge.from,
            components: {
              "world-geography.connection": {
                distanceKm: edge.distance,
                ...(edge.terrainCost !== undefined ? { terrainCost: edge.terrainCost } : {}),
              },
            },
            announce: false,
          }],
        });
      });
      (options.anchors ?? []).forEach((anchor, index) => {
        const type = `graph-fixture.anchor.${index}`;
        ctx.registerCommand({ type });
        ctx.registerResolutionRule({
          id: `${type}.resolve`,
          commandType: type,
          resolve: () => [{
            kind: "spawnEntity",
            localId: "boundaryAnchor",
            id: anchor.id,
            entityKind: GeographyKinds.boundaryAnchor,
            components: {
              "world-geography.boundary_anchor": {
                type: anchor.type,
                edge: anchor.edge,
                locationId: anchor.locationId,
                compatibilityTags: anchor.tags,
              },
            },
            announce: false,
          }, {
            kind: "addRelation",
            type: "world-geography.boundary_anchored_at",
            from: "@boundaryAnchor",
            to: anchor.locationId,
            announce: false,
          }],
        });
      });
    },
  };

  const simulation = new Simulation({
    worldSeed: 7,
    modules: [worldGeographyModule, mapPackModule, fixture],
  });
  const dispatchAll = (types: string[]): void => {
    for (const type of types) {
      const result = simulation.dispatch({ type, source: "module" });
      assert.equal(result.ok, true, `${type}: ${result.errors.map((e) => e.message).join("; ")}`);
    }
  };
  dispatchAll(options.regions.map((_, index) => `graph-fixture.region.${index}`));
  dispatchAll(options.locations.map((_, index) => `graph-fixture.location.${index}`));
  dispatchAll(options.edges.map((_, index) => `graph-fixture.edge.${index}`));
  dispatchAll((options.anchors ?? []).map((_, index) => `graph-fixture.anchor.${index}`));
  return simulation;
}

function must(simulation: Simulation, type: string): void {
  const result = simulation.dispatch({ type, source: "module" });
  assert.equal(result.ok, true, result.errors.map((e) => e.message).join("; "));
}

// ===========================================================================
// A. Xia normal graph
// ===========================================================================

test("A: Xia loads as 10 regions, 40 locations, 53 logical connections, 106 adjacency rows, 6 boundary anchors", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  assert.equal(geography.listRegions(world).length, 10);
  assert.equal(geography.listLocations(world).length, 40);
  assert.equal(world.listRelations({ type: "world-geography.adjacent_to" }).length, 106);
  assert.equal(geography.listBoundaryAnchors(world).length, 6);

  const index = geography.buildIndex(world);
  assert.equal(index.logicalConnections.length, 53, "directed rows must collapse to 53 logical connections");
  assert.equal(index.crossRegionConnections.length, 14, "Xia authors 14 inter-region seams");
});

test("A: every Xia location is reachable from every other, so there is exactly one connected component", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  const components = geography.listConnectedComponents(world);
  assert.equal(components.length, 1, "the Xia map is authored as one connected world");
  assert.equal(components[0]?.length, 40);
  assert.equal(components[0]?.includes(location("L1004")), true);
  assert.equal(components[0]?.includes(location("L0201")), true);
});

// ===========================================================================
// B. Neighbour query
// ===========================================================================

test("B: neighborsOf matches the authored connections exactly", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  // L0101 is authored with three connections: L0102, L0103 and the L0203 seam.
  const neighbors = geography.neighborsOf(world, location("L0101"));
  assert.deepEqual(
    neighbors.map((entry) => entry.locationId.split(":").pop()).sort(),
    ["L0102", "L0103", "L0203"],
  );

  const toL0102 = neighbors.find((entry) => entry.locationId === location("L0102"));
  assert.ok(toL0102);
  assert.equal(toL0102.distance, 8.4);
  assert.equal(toL0102.terrainCost, 1.0);

  // terrainCost stays a raw spatial fact: nothing multiplies it here.
  assert.equal("travelCost" in (toL0102 as unknown as Record<string, unknown>), false);

  // An isolated-looking leaf still reports its single neighbor.
  assert.deepEqual(
    geography.neighborsOf(world, location("L1002")).map((entry) => entry.locationId),
    [location("L1001"), location("L1003")],
  );
});

test("B: neighborsOf is empty for an unknown location and never throws", () => {
  const { simulation, geography } = loadXia();
  assert.deepEqual(geography.neighborsOf(simulation.worldView(), "no:such:location"), []);
});

// ===========================================================================
// C. Region query
// ===========================================================================

test("C: locationsInRegion returns locations whose regionOf is that region", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  const inR01 = geography.locationsInRegion(world, region("R01"));
  assert.deepEqual(inR01.map((id) => id.split(":").pop()), ["L0101", "L0102", "L0103", "L0104"]);
  for (const id of inR01) {
    assert.equal(geography.regionOf(world, id), region("R01"));
  }

  // Every location belongs to exactly one region, and the region totals add up.
  let total = 0;
  for (const entry of geography.listRegions(world)) {
    const ids = geography.locationsInRegion(world, entry.id);
    assert.deepEqual(ids, entry.locationIds);
    for (const id of ids) assert.equal(geography.regionOf(world, id), entry.id);
    total += ids.length;
  }
  assert.equal(total, 40);
});

// ===========================================================================
// D. Cross-region adjacency
// ===========================================================================

test("D: a cross-region edge makes both regions report each other", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  // Xia authors L0203 (R02) -- L0101 (R01).
  assert.equal(geography.regionOf(world, location("L0203")), region("R02"));
  assert.equal(geography.regionOf(world, location("L0101")), region("R01"));
  assert.equal(geography.areAdjacent(world, location("L0203"), location("L0101")), true);

  const r01 = geography.adjacentRegions(world, region("R01")).map((entry) => entry.regionId);
  const r02 = geography.adjacentRegions(world, region("R02")).map((entry) => entry.regionId);
  assert.ok(r01.includes(region("R02")), `R01 should neighbour R02, got ${r01.join(", ")}`);
  assert.ok(r02.includes(region("R01")), `R02 should neighbour R01, got ${r02.join(", ")}`);

  // Region adjacency is symmetric across the whole map.
  for (const entry of geography.listRegions(world)) {
    for (const neighbor of geography.adjacentRegions(world, entry.id)) {
      const back = geography.adjacentRegions(world, neighbor.regionId).map((n) => n.regionId);
      assert.ok(back.includes(entry.id), `${entry.id} -> ${neighbor.regionId} must be mirrored`);
    }
  }
});

test("D: derived adjacency carries the border pair and its distance", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  const r10 = geography.adjacentRegions(world, region("R10"));
  assert.deepEqual(r10.map((entry) => entry.regionId), [region("R04")]);
  // R10 is joined to R04 by two authored seams, and both must be reported.
  assert.equal(r10[0]?.borderConnectionCount, 2);
  assert.deepEqual(r10[0]?.borderPairs, [
    { fromLocationId: location("L1001"), toLocationId: location("L0404"), distanceKm: 17.3 },
    { fromLocationId: location("L1003"), toLocationId: location("L0404"), distanceKm: 14.8 },
  ]);
  assert.equal(r10[0]?.minDistanceKm, 14.8);

  // The mirror view lists the same two seams from the other side, with the
  // endpoints swapped and the distances preserved.
  const r04 = geography.adjacentRegions(world, region("R04"));
  const toR10 = r04.find((entry) => entry.regionId === region("R10"));
  assert.ok(toR10);
  assert.equal(toR10.borderConnectionCount, 2);
  assert.deepEqual(toR10.borderPairs, [
    { fromLocationId: location("L0404"), toLocationId: location("L1001"), distanceKm: 17.3 },
    { fromLocationId: location("L0404"), toLocationId: location("L1003"), distanceKm: 14.8 },
  ]);
});

// ===========================================================================
// E. Reachability
// ===========================================================================

test("E: two locations in the same component are reachable in both directions", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  assert.equal(geography.isReachable(world, location("L0101"), location("L1004")), true);
  assert.equal(geography.isReachable(world, location("L1004"), location("L0101")), true);
  assert.equal(geography.isReachable(world, location("L0904"), location("L0303")), true);
  // A location always reaches itself.
  assert.equal(geography.isReachable(world, location("L0101"), location("L0101")), true);
});

test("E: a high terrain cost never breaks reachability, because this is topology not routing", () => {
  const simulation = buildFixture({
    regions: [{ id: "fx:region:A", name: "A" }],
    locations: [
      { id: "fx:location:mountain_pass", regionId: "fx:region:A", name: "Pass" },
      { id: "fx:location:far_side", regionId: "fx:region:A", name: "Far" },
    ],
    edges: [{ from: "fx:location:mountain_pass", to: "fx:location:far_side", distance: 900, terrainCost: 99 }],
  });
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  assert.ok(geography);
  assert.equal(geography.isReachable(simulation.worldView(), "fx:location:mountain_pass", "fx:location:far_side"), true);
});

test("E: two disconnected sub-graphs are not reachable from each other", () => {
  const simulation = buildFixture({
    regions: [
      { id: "fx:region:LEFT", name: "Left" },
      { id: "fx:region:RIGHT", name: "Right" },
    ],
    locations: [
      { id: "fx:location:l1", regionId: "fx:region:LEFT", name: "L1" },
      { id: "fx:location:l2", regionId: "fx:region:LEFT", name: "L2" },
      { id: "fx:location:r1", regionId: "fx:region:RIGHT", name: "R1" },
      { id: "fx:location:r2", regionId: "fx:region:RIGHT", name: "R2" },
    ],
    edges: [
      { from: "fx:location:l1", to: "fx:location:l2", distance: 5 },
      { from: "fx:location:r1", to: "fx:location:r2", distance: 5 },
    ],
  });
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  assert.ok(geography);
  const world = simulation.worldView();

  assert.equal(geography.isReachable(world, "fx:location:l1", "fx:location:r1"), false);
  assert.equal(geography.isReachable(world, "fx:location:r2", "fx:location:l2"), false);
  assert.equal(geography.isReachable(world, "fx:location:l1", "fx:location:l2"), true);

  const components = geography.listConnectedComponents(world);
  assert.equal(components.length, 2);
  assert.deepEqual(components.map((component) => component.length), [2, 2]);

  assert.deepEqual(geography.connectedComponent(world, "fx:location:l1"), ["fx:location:l1", "fx:location:l2"]);
  assert.deepEqual(geography.connectedComponent(world, "fx:location:r1"), ["fx:location:r1", "fx:location:r2"]);

  // The two sub-graphs are in different regions, but there is no border
  // connection, so neither may claim the other as a neighbour.
  assert.deepEqual(geography.adjacentRegions(world, "fx:region:LEFT"), []);
  assert.deepEqual(geography.adjacentRegions(world, "fx:region:RIGHT"), []);
});

test("E: a location with no connection is its own component", () => {
  const simulation = buildFixture({
    regions: [{ id: "fx:region:SOLO", name: "Solo" }],
    locations: [
      { id: "fx:location:alone", regionId: "fx:region:SOLO", name: "Alone" },
      { id: "fx:location:paired_a", regionId: "fx:region:SOLO", name: "A" },
      { id: "fx:location:paired_b", regionId: "fx:region:SOLO", name: "B" },
    ],
    edges: [{ from: "fx:location:paired_a", to: "fx:location:paired_b", distance: 3 }],
  });
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  assert.ok(geography);
  const world = simulation.worldView();

  assert.deepEqual(geography.connectedComponent(world, "fx:location:alone"), ["fx:location:alone"]);
  assert.equal(geography.isReachable(world, "fx:location:alone", "fx:location:paired_a"), false);
  assert.equal(geography.listConnectedComponents(world).length, 2);
});

// ===========================================================================
// F. Derived-only proof  (the load-bearing test)
// ===========================================================================

test("F: removing the only cross-region connection removes the region adjacency", () => {
  const simulation = buildFixture({
    regions: [
      { id: "fx:region:WEST", name: "West" },
      { id: "fx:region:EAST", name: "East" },
    ],
    locations: [
      { id: "fx:location:w1", regionId: "fx:region:WEST", name: "W1" },
      { id: "fx:location:w2", regionId: "fx:region:WEST", name: "W2" },
      { id: "fx:location:e1", regionId: "fx:region:EAST", name: "E1" },
      { id: "fx:location:e2", regionId: "fx:region:EAST", name: "E2" },
    ],
    edges: [
      { from: "fx:location:w1", to: "fx:location:w2", distance: 4 },
      { from: "fx:location:e1", to: "fx:location:e2", distance: 4 },
      // The single connection joining the two regions.
      { from: "fx:location:w2", to: "fx:location:e1", distance: 20 },
    ],
  });
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  assert.ok(geography);
  const world = simulation.worldView();

  // Before: the two regions are neighbours and the graph is one component.
  assert.deepEqual(
    geography.adjacentRegions(world, "fx:region:WEST").map((entry) => entry.regionId),
    ["fx:region:EAST"],
  );
  assert.deepEqual(
    geography.adjacentRegions(world, "fx:region:EAST").map((entry) => entry.regionId),
    ["fx:region:WEST"],
  );
  assert.equal(geography.listConnectedComponents(world).length, 1);

  // Delete the seam. Nothing else about the world changes.
  const removal = simulation.dispatch({
    type: "world-geography.disconnect_locations",
    payload: {
      fromLocationId: "fx:location:w2",
      toLocationId: "fx:location:e1",
      reason: "test: prove region adjacency is derived",
    },
    source: "system",
  });
  assert.equal(removal.ok, true, removal.errors.map((error) => error.message).join("; "));

  // After: derived adjacency must vanish with the connection it came from.
  assert.deepEqual(
    geography.adjacentRegions(world, "fx:region:WEST"),
    [],
    "West must not remember East once the border connection is gone",
  );
  assert.deepEqual(geography.adjacentRegions(world, "fx:region:EAST"), []);
  assert.equal(geography.areAdjacent(world, "fx:location:w2", "fx:location:e1"), false);
  assert.equal(geography.isReachable(world, "fx:location:w1", "fx:location:e2"), false);
  assert.equal(geography.listConnectedComponents(world).length, 2);

  // Proof this was a real deletion and not a silently ignored command: the
  // connection rows are archived, so the stored graph lost the seam too.
  const index = geography.buildIndex(world);
  assert.equal(index.logicalConnections.length, 2, "only the two intra-region connections remain");
  assert.equal(index.crossRegionConnections.length, 0);
});

test("F: an intra-region connection never manufactures region adjacency", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  // R01's internal frontier: R01 already borders R02 via L0203-L0101, so we
  // prove the negative instead - a region is never its own neighbour.
  for (const entry of geography.listRegions(world)) {
    const neighbors = geography.adjacentRegions(world, entry.id).map((n) => n.regionId);
    assert.equal(neighbors.includes(entry.id), false, `${entry.id} must not neighbour itself`);
  }
  // And every cited border pair is genuinely cross-region.
  for (const entry of geography.listRegions(world)) {
    for (const neighbor of geography.adjacentRegions(world, entry.id)) {
      for (const pair of neighbor.borderPairs) {
        assert.notEqual(
          geography.regionOf(world, pair.fromLocationId),
          geography.regionOf(world, pair.toLocationId),
          `border pair ${pair.fromLocationId} -> ${pair.toLocationId} must cross a region border`,
        );
      }
    }
  }
});

// ===========================================================================
// G. BoundaryAnchor queries
// ===========================================================================

test("G: boundary anchors answer by location, by tag and by edge", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();

  assert.deepEqual(
    geography.boundaryAnchorsAt(world, location("L0101")).map((anchor) => anchor.id),
    [boundaryAnchor("WEST_RIVER_IN")],
  );
  assert.deepEqual(
    geography.boundaryAnchorsAt(world, location("L1004")),
    [],
    "EAST_RIVER_OUT was corrected from L1004 to L0603; L1004 carries no anchor",
  );
  assert.deepEqual(
    geography.boundaryAnchorsAt(world, location("L0603")).map((anchor) => anchor.id),
    [boundaryAnchor("EAST_RIVER_OUT")],
    "the river outlet sits on the delta mouth, not on the northern frontier",
  );
  assert.deepEqual(geography.boundaryAnchorsAt(world, location("L0102")), []);

  assert.deepEqual(
    geography.boundaryAnchorsByTag(world, "river").map((anchor) => anchor.id),
    [boundaryAnchor("EAST_RIVER_OUT"), boundaryAnchor("WEST_RIVER_IN")],
  );
  assert.deepEqual(
    geography.boundaryAnchorsByTag(world, "continuity").map((anchor) => anchor.id),
    [boundaryAnchor("EAST_WETLAND_CONTINUITY"), boundaryAnchor("WEST_HIGHLAND_CONTINUITY")],
  );
  assert.deepEqual(geography.boundaryAnchorsByTag(world, "does-not-exist"), []);

  assert.deepEqual(
    geography.boundaryAnchorsByEdge(world, "west").map((anchor) => anchor.id),
    [boundaryAnchor("WEST_HIGHLAND_CONTINUITY"), boundaryAnchor("WEST_RIVER_IN")],
  );
  assert.deepEqual(
    geography.boundaryAnchorsByEdge(world, "east").map((anchor) => anchor.id),
    [boundaryAnchor("EAST_RIVER_OUT"), boundaryAnchor("EAST_WETLAND_CONTINUITY")],
  );
  assert.deepEqual(
    geography.boundaryAnchorsByEdge(world, "north").map((anchor) => anchor.id),
    [boundaryAnchor("NORTH_LAND_CORRIDOR")],
  );
  assert.deepEqual(
    geography.boundaryAnchorsByEdge(world, "south").map((anchor) => anchor.id),
    [boundaryAnchor("SOUTH_LAND_CORRIDOR")],
  );

  // Every anchor sits on a real location, and every edge value is a world edge.
  for (const anchor of geography.listBoundaryAnchors(world)) {
    assert.ok(geography.getLocation(world, anchor.locationId), `${anchor.id} has no location`);
    assert.ok((WORLD_EDGES as readonly string[]).includes(anchor.edge), `${anchor.id} has edge ${anchor.edge}`);
    assert.ok(anchor.compatibilityTags.length > 0, `${anchor.id} has no tags`);
  }

  const byEdge = WORLD_EDGES.reduce(
    (sum, edge) => sum + geography.boundaryAnchorsByEdge(world, edge).length,
    0,
  );
  assert.equal(byEdge, 6, "every anchor is reachable through exactly one edge bucket");
});

// ===========================================================================
// Invariants
// ===========================================================================

test("invariants: the Xia graph satisfies all five geography invariants", () => {
  const { simulation } = loadXia();
  const report = checkGeographyInvariants(simulation);
  assert.equal(report.ok, true, report.violations.join("\n"));
  assert.equal(report.checks.length, 5);
  assert.deepEqual(report.checks.map((entry) => entry.id), [
    "symmetry",
    "membership",
    "integrity",
    "uniqueness",
    "derived",
  ]);
});

test("invariants: an asymmetric connection is detected and located", () => {
  const simulation = buildFixture({
    regions: [{ id: "fx:region:A", name: "A" }],
    locations: [
      { id: "fx:location:a", regionId: "fx:region:A", name: "A" },
      { id: "fx:location:b", regionId: "fx:region:A", name: "B" },
    ],
    edges: [],
  });
  // Author only one half of the adjacency, bypassing the fixture helper.
  const broken: OpenLifeModule = {
    manifest: { id: "asym-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "system-pack" },
    register(ctx) {
      ctx.registerCommand({ type: "asym-fixture.half_edge" });
      ctx.registerResolutionRule({
        id: "asym-fixture.half_edge.resolve",
        commandType: "asym-fixture.half_edge",
        resolve: () => [{
          kind: "addRelation",
          type: "world-geography.adjacent_to",
          from: "fx:location:a",
          to: "fx:location:b",
          components: { "world-geography.connection": { distanceKm: 5, terrainCost: 1 } },
          announce: false,
        }],
      });
    },
  };
  simulation.install(broken);
  must(simulation, "asym-fixture.half_edge");

  const report = checkGeographyInvariants(simulation);
  assert.equal(report.ok, false);
  const symmetry = report.checks.find((entry) => entry.id === "symmetry");
  assert.equal(symmetry?.ok, false);
  assert.ok(report.violations.some((line) => line.includes("asymmetric connection")));
});

test("invariants: a location with no region is detected", () => {
  const simulation = buildFixture({
    regions: [{ id: "fx:region:A", name: "A" }],
    locations: [{ id: "fx:location:anchored", regionId: "fx:region:A", name: "A" }],
    edges: [],
  });
  const orphan: OpenLifeModule = {
    manifest: { id: "orphan-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "system-pack" },
    register(ctx) {
      ctx.registerCommand({ type: "orphan-fixture.spawn" });
      ctx.registerResolutionRule({
        id: "orphan-fixture.spawn.resolve",
        commandType: "orphan-fixture.spawn",
        resolve: () => [{
          kind: "spawnEntity",
          localId: "location",
          id: "fx:location:orphan",
          entityKind: GeographyKinds.location,
          components: { "world-geography.location": { name: "Orphan" } },
          announce: false,
        }],
      });
    },
  };
  simulation.install(orphan);
  must(simulation, "orphan-fixture.spawn");

  const report = checkGeographyInvariants(simulation);
  assert.equal(report.ok, false);
  assert.equal(report.checks.find((entry) => entry.id === "membership")?.ok, false);
  assert.ok(report.violations.some((line) => line.includes("belongs to no region")));
});

// ===========================================================================
// Single source of truth
// ===========================================================================

test("the graph stores no second source of truth: no region-adjacency relation is ever written", () => {
  const { simulation } = loadXia();
  const world = simulation.worldView();

  // After a full load and a full graph traversal, the only relation types in
  // the world are the three authored ones.
  const types = new Set(world.listRelations({ includeArchived: true }).map((relation) => relation.type));
  assert.deepEqual([...types].sort(), [
    "world-geography.adjacent_to",
    "world-geography.boundary_anchored_at",
    "world-geography.contains",
  ]);

  // And no entity kind beyond the three geography kinds exists.
  const kinds = new Set(world.listEntities({ includeArchived: true }).map((entity) => entity.kind));
  assert.deepEqual([...kinds].sort(), [
    "world-geography.boundary_anchor",
    "world-geography.location",
    "world-geography.region",
  ]);
});

test("graph queries are deterministic and repeatable", () => {
  const { simulation, geography } = loadXia();
  const world = simulation.worldView();
  const first = JSON.stringify(geography.adjacentRegions(world, region("R01")));
  const second = JSON.stringify(geography.adjacentRegions(world, region("R01")));
  assert.equal(first, second);
  assert.deepEqual(
    geography.listConnectedComponents(world).map((component) => component.length),
    geography.listConnectedComponents(world).map((component) => component.length),
  );
});
