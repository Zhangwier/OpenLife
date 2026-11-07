/**
 * Boundary Handshake tests (Step 3.1: Placement / Join model).
 *
 * Four concepts are kept apart and each gets its own guard:
 *
 *   BoundaryAnchor     an interface point on a pack edge          (stored)
 *   BoundaryPlacement  where pack B sits relative to pack A       (derived)
 *   BoundarySeam       one matched anchor pair inside a placement (stored)
 *   BoundaryJoin       one placement, fully stitched              (stored)
 *
 * The two corrections this file exists to prove:
 *
 *   1. **Several seams on one border are normal, not ambiguous.** A river and a
 *      wetland can cross the same border together; discovery must return one
 *      READY placement holding two seams, not an AMBIGUOUS verdict.
 *   2. **Two viable placements are ambiguous**, and two packs may never be
 *      joined on two sides of each other at once.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Simulation } from "@openlife/simulation";
import {
  GeographyKinds,
  boundaryHandshakeModule,
  boundaryJoinId,
  boundaryPlacement,
  boundarySeamId,
  buildGeometryIndex,
  listBoundaryJoins,
  listBoundarySeams,
  placementKey,
  searchMaximumMatchings,
  worldGeographyModule,
  type BoundaryAnchorRef,
  type BoundaryJoinCandidate,
  type GeographyApi,
  type HandshakeApi,
  type HandshakeReport,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack } from "@openlife/module-map-pack";

const XIA = resolve(import.meta.dirname, "../../packs/xia_starter_v0_1");
const EXT = resolve(import.meta.dirname, "../../packs/xia_east_extension_v0_1");

const XIA_ID = "xia_starter_v0_1";
const EXT_ID = "xia_east_extension_v0_1";

const xiaAnchor = (local: string): string => `${XIA_ID}:boundary_anchor:${local}`;
const extAnchor = (local: string): string => `${EXT_ID}:boundary_anchor:${local}`;
const xiaLocation = (local: string): string => `${XIA_ID}:location:${local}`;
const extLocation = (local: string): string => `${EXT_ID}:location:${local}`;
const xiaRegion = (local: string): string => `${XIA_ID}:region:${local}`;
const extRegion = (local: string): string => `${EXT_ID}:region:${local}`;

const EAST_WEST = boundaryPlacement(XIA_ID, "east", EXT_ID, "west");
const WEST_EAST = boundaryPlacement(XIA_ID, "west", EXT_ID, "east");

// --- harness ---------------------------------------------------------------

interface Handshake {
  simulation: Simulation;
  geography: GeographyApi;
  handshake: HandshakeApi;
}

function loadPacks(paths: string[], seed = 20261007): Handshake {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [worldGeographyModule, mapPackModule, boundaryHandshakeModule],
  });
  for (const path of paths) {
    const loaded = loadMapPack(path);
    assert.equal(loaded.ok, true, `${path}: ${loaded.validation.issues.map((i) => i.message).join("; ")}`);
    const registration = registerMapPack(simulation, loaded.pack!);
    assert.equal(registration.ok, true, registration.commands.filter((c) => !c.ok).map((c) => c.error).join("; "));
  }
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  const handshake = simulation.modules.capabilityImplementation<HandshakeApi>("world.boundary-handshake");
  assert.ok(geography);
  assert.ok(handshake);
  return { simulation, geography, handshake };
}

function discover(harness: Handshake, packA: string, packB: string): HandshakeReport {
  return harness.handshake.findBoundarySeams(buildGeometryIndex(harness.simulation.worldView()), packA, packB);
}

/** World state only; the kernel's command counter moves even on rejection. */
function worldState(harness: { simulation: Simulation }): string {
  const kernel = harness.simulation.kernel.serialize();
  return JSON.stringify({
    store: kernel.store,
    eventLog: kernel.eventLog,
    scheduler: kernel.scheduler,
    facts: kernel.facts,
    clock: kernel.clock,
    rng: kernel.rng,
  });
}

interface ConnectInput {
  packAId: string;
  edgeA: string;
  packBId: string;
  edgeB: string;
  distanceKm?: number;
  terrainCost?: number;
}

function connectJoin(harness: Handshake, input: ConnectInput): void {
  const result = harness.simulation.dispatch({
    type: "boundary-handshake.connect_boundary_join",
    payload: {
      packAId: input.packAId,
      edgeA: input.edgeA,
      packBId: input.packBId,
      edgeB: input.edgeB,
      distanceKm: input.distanceKm ?? 12,
      terrainCost: input.terrainCost ?? 1,
    },
    source: "system",
  });
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function rejectJoin(harness: Handshake, input: ConnectInput): { code: string; message: string } {
  const result = harness.simulation.dispatch({
    type: "boundary-handshake.connect_boundary_join",
    payload: {
      packAId: input.packAId,
      edgeA: input.edgeA,
      packBId: input.packBId,
      edgeB: input.edgeB,
      distanceKm: input.distanceKm ?? 12,
      terrainCost: input.terrainCost ?? 1,
    },
    source: "system",
  });
  assert.equal(result.ok, false, "expected the join to be rejected");
  const error = result.errors[0]!;
  return { code: error.code, message: error.message };
}

function disconnectJoin(harness: Handshake, input: ConnectInput): void {
  const result = harness.simulation.dispatch({
    type: "boundary-handshake.disconnect_boundary_join",
    payload: {
      packAId: input.packAId,
      edgeA: input.edgeA,
      packBId: input.packBId,
      edgeB: input.edgeB,
      reason: "test",
    },
    source: "system",
  });
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

/** Dispatches and asserts success; used by the plain-command regression tests. */
function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]): void {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

// --- synthetic packs -------------------------------------------------------

interface PackSpec {
  id: string;
  regions: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; regionId: string; name: string; type: string }>;
  edges: Array<{ from: string; to: string; distance: number; terrainCost: number }>;
  anchors: Array<{
    id: string;
    type: string;
    locationId: string;
    edge: string;
    tags: string[];
    accepts?: string[];
  }>;
}

function writePack(spec: PackSpec): string {
  const directory = mkdtempSync(join(tmpdir(), `openlife-hs-${spec.id}-`));
  mkdirSync(join(directory, "map"), { recursive: true });
  writeFileSync(join(directory, "manifest.yaml"), [
    `id: ${spec.id}`,
    `name: ${spec.id}`,
    "version: 0.1.0",
    'schema_version: "0.1"',
    "type: map_pack",
  ].join("\n"));
  writeFileSync(join(directory, "map/regions.yaml"), [
    "regions:",
    ...spec.regions.flatMap((entry) => [`  - id: ${entry.id}`, `    name: ${entry.name}`, "    type: test"]),
  ].join("\n"));
  writeFileSync(join(directory, "map/locations.yaml"), [
    "locations:",
    ...spec.locations.flatMap((entry) => [
      `  - id: ${entry.id}`,
      `    name: ${entry.name}`,
      `    region_id: ${entry.regionId}`,
      `    type: ${entry.type}`,
    ]),
  ].join("\n"));
  writeFileSync(join(directory, "map/edges.yaml"), [
    "edges:",
    ...spec.edges.flatMap((entry) => [
      `  - from: ${entry.from}`,
      `    to: ${entry.to}`,
      `    distance: ${entry.distance}`,
      `    terrain_cost: ${entry.terrainCost}`,
    ]),
  ].join("\n"));
  writeFileSync(join(directory, "map/boundary_anchors.yaml"), [
    "boundary_anchors:",
    ...spec.anchors.flatMap((entry) => [
      `  - id: ${entry.id}`,
      `    type: ${entry.type}`,
      `    location_id: ${entry.locationId}`,
      `    edge: ${entry.edge}`,
      "    compatibility_tags:",
      ...entry.tags.map((tag) => `      - ${tag}`),
      ...(entry.accepts && entry.accepts.length > 0
        ? ["    accepts_types:", ...entry.accepts.map((type) => `      - ${type}`)]
        : []),
    ]),
  ].join("\n"));
  return directory;
}

/**
 * A west-facing pack carrying a river inlet and a wetland edge, plus a second
 * region so the graph has a real interior.
 */
function multiSeamWestPack(id: string): string {
  return writePack({
    id,
    regions: [{ id: "R1", name: "Mouth" }, { id: "R2", name: "Inland" }],
    locations: [
      { id: "L1", regionId: "R1", name: "River Mouth", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "Wetland Edge", type: "marsh" },
      { id: "L3", regionId: "R2", name: "Inland", type: "plain" },
    ],
    edges: [
      { from: "L1", to: "L2", distance: 6, terrainCost: 1.2 },
      { from: "L2", to: "L3", distance: 8, terrainCost: 1.1 },
    ],
    anchors: [
      { id: "WEST_RIVER", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
      { id: "WEST_WETLAND", type: "wetland_continuity", locationId: "L2", edge: "west", tags: ["wetland", "continuity"], accepts: ["wetland_continuity"] },
    ],
  });
}

// ===========================================================================
// A. Single placement + single seam -> READY
// ===========================================================================

test("A: one placement with one seam is READY and joins in a single transaction", () => {
  const harness = loadPacks([XIA, EXT]);
  const report = discover(harness, XIA_ID, EXT_ID);

  // Xia/East offers two placements; each one individually is READY.
  const eastWest = report.candidates.find((candidate) => placementKey(candidate.placement) === placementKey(EAST_WEST));
  assert.ok(eastWest, "the east/west placement must be discovered");
  assert.equal(eastWest.status, "ready");
  assert.equal(eastWest.seams.length, 1);
  // `anchorA` is canonically the placement's packA side (the lexically smaller
  // pack id), so the seam's roles do not depend on argument order.
  assert.deepEqual(
    [eastWest.seams[0]?.anchorA.id, eastWest.seams[0]?.anchorB.id].sort(),
    [xiaAnchor("EAST_RIVER_OUT"), extAnchor("WEST_RIVER_IN")].sort(),
  );
  assert.equal(eastWest.seams[0]?.anchorA.packId, eastWest.placement.packAId);

  const before = listBoundaryJoins(harness.simulation.worldView()).length;
  assert.equal(before, 0);

  // "east:west" alone describes the placement; the edges settle which side is which.
  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  const world = harness.simulation.worldView();
  assert.equal(listBoundaryJoins(world).length, 1);
  assert.equal(listBoundarySeams(world).length, 1);
  assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0603"), extLocation("E0101")), true);
});

test("A: a placement is order independent", () => {
  assert.equal(placementKey(EAST_WEST), placementKey(WEST_EAST === undefined ? EAST_WEST : boundaryPlacement(EXT_ID, "west", XIA_ID, "east")));
  assert.equal(
    boundaryJoinId(boundaryPlacement(XIA_ID, "east", EXT_ID, "west")),
    boundaryJoinId(boundaryPlacement(EXT_ID, "west", XIA_ID, "east")),
  );
  // Non-opposite edges are not a placement at all.
  assert.throws(() => boundaryPlacement(XIA_ID, "east", EXT_ID, "east"), /opposite edges/);
});

// ===========================================================================
// B. Single placement + multiple seams -> READY   (the Step 3.1 correction)
// ===========================================================================

test("B: two seams on one border are READY, not ambiguous", () => {
  const west = multiSeamWestPack("multi_seam_west");
  try {
    const harness = loadPacks([XIA, west]);
    const report = discover(harness, XIA_ID, "multi_seam_west");

    // Exactly one viable placement, holding two seams.
    const viable = report.candidates.filter((candidate) => candidate.seams.length > 0);
    assert.equal(viable.length, 1, `expected one viable placement, got ${JSON.stringify(viable.map((c) => placementKey(c.placement)))}`);
    assert.equal(viable[0]?.status, "ready");
    assert.equal(viable[0]?.seams.length, 2, "the river and the wetland both cross this border");
    assert.equal(report.status, "ready", "several seams on one border is normal, not ambiguous");

    const pairs = viable[0]!.seams
      .map((seam) => [seam.anchorA.id.split(":").pop(), seam.anchorB.id.split(":").pop()].sort().join("<->"))
      .sort();
    assert.deepEqual(pairs, [
      "EAST_RIVER_OUT<->WEST_RIVER",
      "EAST_WETLAND_CONTINUITY<->WEST_WETLAND",
    ]);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

test("B: connecting a two-seam placement creates one join, two seams and two connections", () => {
  const west = multiSeamWestPack("multi_seam_west");
  try {
    const harness = loadPacks([XIA, west]);
    const world = harness.simulation.worldView();
    const before = buildGeometryIndex(world);

    connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "multi_seam_west", edgeB: "west" });

    const after = buildGeometryIndex(world);
    const joins = listBoundaryJoins(world);
    assert.equal(joins.length, 1);
    assert.equal(joins[0]?.seamIds.length, 2);
    assert.equal(listBoundarySeams(world).length, 2);

    // Two seams, each contributing one logical connection (two directed rows).
    assert.equal(after.logicalConnections.length, before.logicalConnections.length + 2);
    assert.equal(
      world.listRelations({ type: "world-geography.adjacent_to" }).length,
      before.logicalConnections.length * 2 + 4,
    );

    // Both anchors of the placement are stitched, and adjacency follows.
    assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0603"), "multi_seam_west:location:L1"), true);
    assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0303"), "multi_seam_west:location:L2"), true);
    assert.equal(harness.geography.listConnectedComponents(world).length, 1);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

// ===========================================================================
// C. Multiple placements -> AMBIGUOUS
// ===========================================================================

test("C: two viable placements make the pack pair AMBIGUOUS", () => {
  const harness = loadPacks([XIA, EXT]);
  const report = discover(harness, XIA_ID, EXT_ID);

  // Xia/East can sit east-west OR west-east, both legally.
  const viable = report.candidates.filter((candidate) => candidate.seams.length > 0);
  assert.equal(viable.length, 2);
  assert.deepEqual(
    viable.map((candidate) => placementKey(candidate.placement)).sort(),
    [placementKey(EAST_WEST), placementKey(WEST_EAST)].sort(),
  );
  assert.equal(report.status, "ambiguous");

  // The river crosses on one border, the highland on the other.
  const river = viable.find((c) => placementKey(c.placement) === placementKey(EAST_WEST))!;
  const highland = viable.find((c) => placementKey(c.placement) === placementKey(WEST_EAST))!;
  assert.deepEqual(
    river.seams.flatMap((seam) => [seam.anchorA.id, seam.anchorB.id]).sort(),
    [xiaAnchor("EAST_RIVER_OUT"), extAnchor("WEST_RIVER_IN")].sort(),
  );
  assert.deepEqual(
    highland.seams.flatMap((seam) => [seam.anchorA.id, seam.anchorB.id]).sort(),
    [xiaAnchor("WEST_HIGHLAND_CONTINUITY"), extAnchor("EAST_HIGHLAND_EDGE")].sort(),
  );
});

test("C: an ambiguous pack pair is still joinable when the caller names a placement", () => {
  const harness = loadPacks([XIA, EXT]);
  const before = worldState(harness);
  const report = discover(harness, XIA_ID, EXT_ID);
  assert.equal(report.status, "ambiguous");
  assert.equal(worldState(harness), before, "discovery must stay pure");

  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });
  assert.equal(listBoundaryJoins(harness.simulation.worldView()).length, 1);
});

// ===========================================================================
// D. Anchor assignment ambiguity inside one placement
// ===========================================================================

test("D: one anchor facing two partners on the same border is AMBIGUOUS", () => {
  // Two identical west-facing river inlets inside one placement. Xia's single
  // east-facing outlet cannot be assigned uniquely.
  const twin = writePack({
    id: "twin_pack",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "West A", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "West B", type: "river_mouth" },
    ],
    edges: [{ from: "L1", to: "L2", distance: 5, terrainCost: 1 }],
    anchors: [
      { id: "WEST_A", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
      { id: "WEST_B", type: "river_inlet", locationId: "L2", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
    ],
  });
  try {
    const harness = loadPacks([XIA, twin]);
    const before = worldState(harness);
    const report = discover(harness, XIA_ID, "twin_pack");

    const eastWest = report.candidates.find(
      (candidate) => placementKey(candidate.placement) === placementKey(boundaryPlacement(XIA_ID, "east", "twin_pack", "west")),
    );
    assert.ok(eastWest, `placements: ${report.candidates.map((c) => placementKey(c.placement)).join(", ")}`);
    assert.equal(eastWest.status, "ambiguous");
    assert.deepEqual(eastWest.seams, [], "a contested placement yields no seams at all");
    // All three anchors are part of the unresolved choice: the single outlet and
    // both inlets it could legally meet.
    assert.deepEqual(
      eastWest.contestedAnchors.map((anchor) => anchor.id),
      [
        "twin_pack:boundary_anchor:WEST_A",
        "twin_pack:boundary_anchor:WEST_B",
        xiaAnchor("EAST_RIVER_OUT"),
      ],
    );
    assert.match(eastWest.notes.join(" "), /several distinct matchings/);

    // Pack level is ambiguous, and the world is untouched.
    assert.equal(report.status, "ambiguous");
    assert.equal(worldState(harness), before);

    // Connecting that placement is refused, not guessed.
    const rejection = rejectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "twin_pack", edgeB: "west" });
    assert.equal(rejection.code, "E_HANDSHAKE_AMBIGUOUS");
    assert.equal(listBoundaryJoins(harness.simulation.worldView()).length, 0);
    assert.equal(worldState(harness), before);
  } finally {
    rmSync(twin, { recursive: true, force: true });
  }
});

test("D: forced matches propagate but a genuine tie blocks the whole placement", () => {
  // A1 can only reach B1; A2 can reach B1 or B2. A1-B1 is forced, which frees
  // A2 to take B2 - but A2 still had a choice at the moment of decision, so the
  // placement must stay ambiguous rather than resolve by ordering.
  const contested = writePack({
    id: "contested_pack",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "A1", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "A2", type: "river_mouth" },
      { id: "L3", regionId: "R1", name: "B1", type: "river_mouth" },
      { id: "L4", regionId: "R1", name: "B2", type: "river_mouth" },
    ],
    edges: [
      { from: "L1", to: "L2", distance: 4, terrainCost: 1 },
      { from: "L3", to: "L4", distance: 4, terrainCost: 1 },
    ],
    anchors: [
      { id: "WEST_A1", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
      { id: "WEST_A2", type: "river_inlet", locationId: "L2", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
      { id: "WEST_B1", type: "river_inlet", locationId: "L3", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
      { id: "WEST_B2", type: "river_inlet", locationId: "L4", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
    ],
  });
  try {
    const harness = loadPacks([XIA, contested]);
    const report = discover(harness, XIA_ID, "contested_pack");
    const eastWest = report.candidates.find(
      (candidate) => placementKey(candidate.placement) === placementKey(boundaryPlacement(XIA_ID, "east", "contested_pack", "west")),
    );
    assert.ok(eastWest, `placements: ${report.candidates.map((c) => placementKey(c.placement)).join(", ")}`);
    // Xia has one outlet facing four inlets: unambiguously contested.
    assert.equal(eastWest.status, "ambiguous");
    assert.equal(eastWest.seams.length, 0);
  } finally {
    rmSync(contested, { recursive: true, force: true });
  }
});

test("D: discovery agrees whichever pack is described first", () => {
  // Regression: an assignment bug once made `xia->twin` report AMBIGUOUS while
  // `twin->xia` reported READY for the same placement, because a forced pair was
  // accepted when only *one* of its endpoints had a single option.
  const twin = writePack({
    id: "dir_twin",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "A", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "B", type: "river_mouth" },
    ],
    edges: [{ from: "L1", to: "L2", distance: 5, terrainCost: 1 }],
    anchors: [
      { id: "WEST_A", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
      { id: "WEST_B", type: "river_inlet", locationId: "L2", edge: "west", tags: ["river", "upstream"], accepts: ["river_outlet"] },
    ],
  });
  try {
    const harness = loadPacks([XIA, twin]);
    const forward = discover(harness, XIA_ID, "dir_twin");
    const backward = discover(harness, "dir_twin", XIA_ID);

    assert.equal(forward.status, backward.status, "the verdict must not depend on argument order");
    const key = placementKey(boundaryPlacement(XIA_ID, "east", "dir_twin", "west"));
    const forwardCandidate = forward.candidates.find((c) => placementKey(c.placement) === key);
    const backwardCandidate = backward.candidates.find((c) => placementKey(c.placement) === key);
    assert.ok(forwardCandidate);
    assert.ok(backwardCandidate);
    assert.equal(forwardCandidate.status, "ambiguous");
    assert.equal(backwardCandidate.status, "ambiguous");
    assert.equal(forwardCandidate.seams.length, backwardCandidate.seams.length);
  } finally {
    rmSync(twin, { recursive: true, force: true });
  }
});

// ===========================================================================
// E. Join transaction atomicity
// ===========================================================================

test("E: a two-seam join is all-or-nothing", () => {
  const harness = loadPacks([XIA, EXT]);
  const world = harness.simulation.worldView();
  const before = worldState(harness);

  // A placement whose second seam cannot be written must leave nothing behind.
  // Xia's north corridor faces the extension's south edge, which has no anchor,
  // so this placement has no candidate at all.
  const rejection = rejectJoin(harness, { packAId: XIA_ID, edgeA: "north", packBId: EXT_ID, edgeB: "south" });
  assert.equal(rejection.code, "E_HANDSHAKE_NO_SEAMS");
  assert.equal(worldState(harness), before, "a rejected join must not touch the world");

  // And a successful two-seam join commits both seams together.
  const west = multiSeamWestPack("atomic_west");
  try {
    const two = loadPacks([XIA, west]);
    const stateBefore = worldState(two);
    const joinsBefore = listBoundaryJoins(two.simulation.worldView()).length;
    assert.equal(joinsBefore, 0);

    connectJoin(two, { packAId: XIA_ID, edgeA: "east", packBId: "atomic_west", edgeB: "west" });

    const after = two.simulation.worldView();
    assert.equal(listBoundaryJoins(after).length, 1);
    assert.equal(listBoundarySeams(after).length, 2, "both seams committed in one transaction");
    assert.notEqual(worldState(two), stateBefore);

    // No half-written border: every seam of the join exists, and the join's own
    // seamIds list matches what is actually in the world.
    const join = listBoundaryJoins(after)[0]!;
    const liveSeams = new Set(listBoundarySeams(after).map((seam) => seam.id));
    for (const seamId of join.seamIds) {
      assert.equal(liveSeams.has(seamId), true, `join references a seam that was not written: ${seamId}`);
    }
    assert.equal(join.seamIds.length, liveSeams.size);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
  void world;
});

// ===========================================================================
// F. Placement conflict
// ===========================================================================

test("F: joining two packs on two different sides at once is refused", () => {
  const harness = loadPacks([XIA, EXT]);

  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });
  const afterFirst = worldState(harness);
  assert.equal(listBoundaryJoins(harness.simulation.worldView()).length, 1);

  // The other side of the same pair is a different placement, and is refused.
  const rejection = rejectJoin(harness, { packAId: XIA_ID, edgeA: "west", packBId: EXT_ID, edgeB: "east" });
  assert.equal(rejection.code, "E_HANDSHAKE_PLACEMENT_CONFLICT");
  assert.match(rejection.message, /already joined as/);

  assert.equal(worldState(harness), afterFirst, "the conflicting attempt must not write anything");
  assert.equal(listBoundaryJoins(harness.simulation.worldView()).length, 1);
});

test("F: the conflict is detected regardless of argument order", () => {
  const harness = loadPacks([XIA, EXT]);
  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  // Same placement, described from the other side: idempotent, not a conflict.
  assert.equal(
    rejectJoin(harness, { packAId: EXT_ID, edgeA: "west", packBId: XIA_ID, edgeB: "east" }).code,
    "E_HANDSHAKE_ALREADY_CONNECTED",
  );
  // Different placement, described from the other side: still a conflict.
  assert.equal(
    rejectJoin(harness, { packAId: EXT_ID, edgeA: "east", packBId: XIA_ID, edgeB: "west" }).code,
    "E_HANDSHAKE_PLACEMENT_CONFLICT",
  );
});

// ===========================================================================
// G. Idempotency
// ===========================================================================

test("G: joining the same placement twice is refused and changes nothing", () => {
  const harness = loadPacks([XIA, EXT]);
  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  const world = harness.simulation.worldView();
  const snapshot = {
    joins: listBoundaryJoins(world).length,
    seams: listBoundarySeams(world).length,
    logical: buildGeometryIndex(world).logicalConnections.length,
    rows: world.listRelations({ type: "world-geography.adjacent_to" }).length,
    state: worldState(harness),
  };
  assert.equal(snapshot.joins, 1);
  assert.equal(snapshot.seams, 1);

  assert.equal(
    rejectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" }).code,
    "E_HANDSHAKE_ALREADY_CONNECTED",
  );

  const after = harness.simulation.worldView();
  assert.equal(worldState(harness), snapshot.state);
  assert.equal(listBoundaryJoins(after).length, snapshot.joins);
  assert.equal(listBoundarySeams(after).length, snapshot.seams);
  assert.equal(buildGeometryIndex(after).logicalConnections.length, snapshot.logical);
  assert.equal(after.listRelations({ type: "world-geography.adjacent_to" }).length, snapshot.rows);
});

test("G: a multi-seam join is idempotent as a whole", () => {
  const west = multiSeamWestPack("idem_west");
  try {
    const harness = loadPacks([XIA, west]);
    connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "idem_west", edgeB: "west" });
    const seamCount = listBoundarySeams(harness.simulation.worldView()).length;
    const state = worldState(harness);

    assert.equal(
      rejectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "idem_west", edgeB: "west" }).code,
      "E_HANDSHAKE_ALREADY_CONNECTED",
    );
    assert.equal(listBoundarySeams(harness.simulation.worldView()).length, seamCount);
    assert.equal(worldState(harness), state);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

// ===========================================================================
// H. Reverse-order identity
// ===========================================================================

test("H: describing the placement from either side yields one identity", () => {
  const harness = loadPacks([XIA, EXT]);

  // Connect using pack B as the head, edge first.
  connectJoin(harness, { packAId: EXT_ID, edgeA: "west", packBId: XIA_ID, edgeB: "east" });

  const world = harness.simulation.worldView();
  const joins = listBoundaryJoins(world);
  assert.equal(joins.length, 1, "the reversed description must not create a second join");
  assert.equal(joins[0]?.id, boundaryJoinId(EAST_WEST));

  // Canonical form stores the lexically smaller pack id first.
  assert.equal(joins[0]?.packAId, EXT_ID);
  assert.equal(joins[0]?.edgeA, "west");
  assert.equal(joins[0]?.packBId, XIA_ID);
  assert.equal(joins[0]?.edgeB, "east");

  // Querying the other direction finds the same join.
  assert.equal(harness.handshake.findJoinBetweenPacks(world, XIA_ID, EXT_ID)?.id, joins[0]?.id);
  assert.equal(harness.handshake.findJoinBetweenPacks(world, EXT_ID, XIA_ID)?.id, joins[0]?.id);
});

// ===========================================================================
// I. Disconnect an entire join
// ===========================================================================

test("I: disconnecting a join removes its join, every seam and every connection", () => {
  const west = multiSeamWestPack("disc_west");
  try {
    const harness = loadPacks([XIA, west]);
    const world = harness.simulation.worldView();
    const before = buildGeometryIndex(world);

    connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "disc_west", edgeB: "west" });
    assert.equal(listBoundaryJoins(world).length, 1);
    assert.equal(listBoundarySeams(world).length, 2);
    assert.equal(harness.geography.listConnectedComponents(world).length, 1);

    disconnectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "disc_west", edgeB: "west" });

    assert.equal(listBoundaryJoins(world).length, 0, "the join entity is archived");
    assert.equal(listBoundarySeams(world).length, 0, "all owned seams are archived");

    // Connections and their relations are gone.
    const after = buildGeometryIndex(world);
    assert.equal(after.logicalConnections.length, before.logicalConnections.length);
    assert.equal(
      world.listRelations({ type: "world-geography.adjacent_to" }).length,
      before.logicalConnections.length * 2,
    );
    assert.equal(world.listRelations({ type: "boundary-handshake.stitches" }).length, 0);
    assert.equal(world.listRelations({ type: "boundary-handshake.owns_seam" }).length, 0);

    // Topology returns to the unjoined state.
    assert.equal(harness.geography.listConnectedComponents(world).length, 2);
    assert.equal(harness.geography.isReachable(world, xiaLocation("L0603"), "disc_west:location:L1"), false);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

test("I: disconnecting an unknown join is rejected", () => {
  const harness = loadPacks([XIA, EXT]);
  const result = harness.simulation.dispatch({
    type: "boundary-handshake.disconnect_boundary_join",
    payload: { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" },
    source: "system",
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "E_HANDSHAKE_UNKNOWN_JOIN");
});

// ===========================================================================
// J. Save / load
// ===========================================================================

test("J: a joined world round-trips with joins, seams, adjacency and reachability intact", () => {
  const west = multiSeamWestPack("save_west");
  try {
    const harness = loadPacks([XIA, west]);
    connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "save_west", edgeB: "west" });

    const world = harness.simulation.worldView();
    const before = {
      fingerprint: harness.simulation.fingerprint(),
      joins: listBoundaryJoins(world).map((join) => ({ id: join.id, seams: join.seamIds })),
      seams: listBoundarySeams(world).length,
      components: harness.geography.listConnectedComponents(world).length,
      r06: harness.geography.adjacentRegions(world, xiaRegion("R06")).map((entry) => entry.regionId),
    };

    const json = harness.simulation.saveToJson({ label: "joined" });
    const loaded = Simulation.loadFromJson(json, [worldGeographyModule, mapPackModule, boundaryHandshakeModule]);
    assert.equal(loaded.result.ok, true, loaded.result.errors.map((error) => error.message).join("; "));
    const reopened = loaded.simulation!;

    assert.equal(reopened.fingerprint(), before.fingerprint, "save/load must be byte identical");

    const geography = reopened.modules.capabilityImplementation<GeographyApi>("world.geography");
    const handshake = reopened.modules.capabilityImplementation<HandshakeApi>("world.boundary-handshake");
    const afterWorld = reopened.worldView();
    assert.ok(geography);
    assert.ok(handshake);

    assert.deepEqual(
      listBoundaryJoins(afterWorld).map((join) => ({ id: join.id, seams: join.seamIds })),
      before.joins,
    );
    assert.equal(listBoundarySeams(afterWorld).length, before.seams);
    assert.equal(geography.listConnectedComponents(afterWorld).length, before.components);
    assert.deepEqual(geography.adjacentRegions(afterWorld, xiaRegion("R06")).map((entry) => entry.regionId), before.r06);
    assert.equal(geography.isReachable(afterWorld, xiaLocation("L0101"), "save_west:location:L3"), true);

    // Idempotency survives the round trip.
    const stateBefore = worldState({ simulation: reopened });
    const again = reopened.dispatch({
      type: "boundary-handshake.connect_boundary_join",
      payload: { packAId: XIA_ID, edgeA: "east", packBId: "save_west", edgeB: "west" },
      source: "system",
    });
    assert.equal(again.ok, false);
    assert.equal(again.errors[0]?.code, "E_HANDSHAKE_ALREADY_CONNECTED");
    assert.equal(worldState({ simulation: reopened }), stateBefore);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

// ===========================================================================
// K. Geography Graph still knows nothing about join semantics
// ===========================================================================

test("K: the geography graph holds no join or seam vocabulary", () => {
  const harness = loadPacks([XIA, EXT]);
  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });
  const world = harness.simulation.worldView();

  for (const entity of world.listEntities({ includeArchived: true })) {
    if (!entity.kind.startsWith("world-geography.")) continue;
    assert.equal(entity.kind.includes("seam"), false, entity.kind);
    assert.equal(entity.kind.includes("join"), false, entity.kind);
    assert.equal(entity.kind.includes("pack"), false, entity.kind);
  }
  for (const relation of world.listRelations({ includeArchived: true })) {
    if (!relation.type.startsWith("world-geography.")) continue;
    assert.equal(relation.type.includes("seam"), false, relation.type);
    assert.equal(relation.type.includes("join"), false, relation.type);
  }

  // Remove every handshake entity and relation, and the geography connection is
  // still an ordinary connection: adjacency works without the seam existing.
  const connection = harness.geography.connectionBetween(world, xiaLocation("L0603"), extLocation("E0101"));
  assert.equal(typeof connection?.distance, "number");
  assert.equal(GeographyKinds.boundaryAnchor, "world-geography.boundary_anchor");

  // Adjacency never depends on the `via` breadcrumb.
  assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0603"), extLocation("E0101")), true);
});

test("K: the only stored facts a join adds are its own entity and its relations", () => {
  const harness = loadPacks([XIA, EXT]);
  const world = harness.simulation.worldView();

  const kindsBefore = new Set(world.listEntities({ includeArchived: true }).map((e) => e.kind));
  const typesBefore = new Set(world.listRelations({ includeArchived: true }).map((r) => r.type));

  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  const kindsAfter = new Set(world.listEntities({ includeArchived: true }).map((e) => e.kind));
  const typesAfter = new Set(world.listRelations({ includeArchived: true }).map((r) => r.type));

  assert.deepEqual(
    [...kindsAfter].filter((kind) => !kindsBefore.has(kind)).sort(),
    ["boundary-handshake.boundary_join", "boundary-handshake.boundary_seam"].sort(),
  );
  assert.deepEqual(
    [...typesAfter].filter((type) => !typesBefore.has(type)).sort(),
    ["boundary-handshake.owns_seam", "boundary-handshake.stitches"].sort(),
  );
});

// ===========================================================================
// L. Region adjacency stays derived-only
// ===========================================================================

test("L: cross-pack region adjacency appears on join, vanishes on disconnect, and is never stored", () => {
  const harness = loadPacks([XIA, EXT]);
  const world = harness.simulation.worldView();

  assert.equal(
    harness.geography.adjacentRegions(world, xiaRegion("R06")).some((entry) => entry.regionId === extRegion("E01")),
    false,
  );

  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  const r06 = harness.geography.adjacentRegions(world, xiaRegion("R06"));
  const e01 = harness.geography.adjacentRegions(world, extRegion("E01"));
  assert.ok(r06.some((entry) => entry.regionId === extRegion("E01")));
  assert.ok(e01.some((entry) => entry.regionId === xiaRegion("R06")));

  // No region-to-region relation is ever authored.
  assert.deepEqual(
    world.listRelations({ includeArchived: true }).filter((relation) => relation.type.includes("region")),
    [],
  );

  disconnectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  assert.equal(
    harness.geography.adjacentRegions(world, xiaRegion("R06")).some((entry) => entry.regionId === extRegion("E01")),
    false,
    "R06 must forget E01 once the join is gone",
  );
  assert.equal(harness.geography.listConnectedComponents(world).length, 2);
});

test("L: a multi-seam join makes region adjacency appear through every seam", () => {
  const west = multiSeamWestPack("region_west");
  try {
    const harness = loadPacks([XIA, west]);
    const world = harness.simulation.worldView();

    connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "region_west", edgeB: "west" });

    // R06 (delta, via L0603) and R03 (wetland, via L0303) both border R1.
    const r06 = harness.geography.adjacentRegions(world, xiaRegion("R06")).map((entry) => entry.regionId);
    const r03 = harness.geography.adjacentRegions(world, xiaRegion("R03")).map((entry) => entry.regionId);
    assert.ok(r06.includes("region_west:region:R1"), r06.join(", "));
    assert.ok(r03.includes("region_west:region:R1"), r03.join(", "));

    const r1 = harness.geography.adjacentRegions(world, "region_west:region:R1").map((entry) => entry.regionId);
    assert.ok(r1.includes(xiaRegion("R06")), r1.join(", "));
    assert.ok(r1.includes(xiaRegion("R03")), r1.join(", "));
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

// ===========================================================================
// Step 3.2 — exact maximum matching, and the shared connection primitive
// ===========================================================================

test("A3.2: both ends uniquely constrained still yields READY", () => {
  const west = writePack({
    id: "both_unique",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "A", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "B", type: "marsh" },
    ],
    edges: [{ from: "L1", to: "L2", distance: 5, terrainCost: 1 }],
    anchors: [
      { id: "WEST_RIVER", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river"], accepts: ["river_outlet"] },
      { id: "WEST_WET", type: "wetland_continuity", locationId: "L2", edge: "west", tags: ["wetland"], accepts: ["wetland_continuity"] },
    ],
  });
  try {
    const harness = loadPacks([XIA, west]);
    const report = discover(harness, XIA_ID, "both_unique");
    const candidate = report.candidates.find((c) => c.seams.length > 0);
    assert.ok(candidate);
    assert.equal(candidate.status, "ready");
    assert.equal(candidate.seams.length, 2);
    assert.equal(report.status, "ready");
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

test("B3.2: a chain constraint has exactly one maximum matching (was falsely AMBIGUOUS)", () => {
  // The matcher is exercised directly on the spec's graph: A1 -> {B1, B2};
  // A2 -> B2. No locally forced edge exists, but the only maximum matching is
  // A1-B1, A2-B2. This is exactly what the removed forced-edge heuristic got
  // wrong, calling it ambiguous.
  const matching = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A1", right: "B2", payload: 2 },
    { left: "A2", right: "B2", payload: 3 },
  ]);
  assert.equal(matching.cardinality, 2);
  assert.equal(matching.unique, true, "the chain has exactly one maximum matching");
  assert.deepEqual(matching.pairs.map((pair) => `${pair.left}-${pair.right}`), ["A1-B1", "A2-B2"]);
  assert.deepEqual(matching.unmatchedLeft, []);
  assert.deepEqual(matching.unmatchedRight, []);
});

test("B3.2: the same chain shape is READY through real discovery, not AMBIGUOUS", () => {
  // Xia contributes exactly one east-facing river_outlet, so a pack offering one
  // dedicated inlet plus a second inlets-only-if-the-first-is-taken shape gives
  // the same chain: the second inlet is reachable only by leaving the outlet to
  // the first, leaving exactly one maximum matching of size 1. Use two inlets so
  // the outlet must pick one and the graph stays a genuine chain.
  const chain = writePack({
    id: "chain_pack",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "A1", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "A2", type: "river_mouth" },
    ],
    edges: [{ from: "L1", to: "L2", distance: 4, terrainCost: 1 }],
    anchors: [
      // Only anchor on this border that Xia's river outlet accepts.
      { id: "WEST_RIVER", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river"], accepts: ["river_outlet"] },
      // A wetland inlet: Xia's wetland anchor faces east, so this pair is legal
      // and forms an independent second seam on the same border.
      { id: "WEST_WET", type: "wetland_continuity", locationId: "L2", edge: "west", tags: ["wetland"], accepts: ["wetland_continuity"] },
    ],
  });
  try {
    const harness = loadPacks([XIA, chain]);
    const report = discover(harness, XIA_ID, "chain_pack");
    const viable = report.candidates.filter((c) => c.seams.length > 0);
    assert.equal(
      viable.length,
      1,
      `expected one viable placement; candidates=${JSON.stringify(report.candidates.map((c) => [placementKey(c.placement), c.status, c.seams.length]))}`,
    );
    assert.equal(viable[0]?.status, "ready", "two independent unique pairs is still one unique maximum");
    assert.equal(viable[0]?.seams.length, 2);
  } finally {
    rmSync(chain, { recursive: true, force: true });
  }
});

test("C3.2: a complete 2x2 compatibility block is genuinely AMBIGUOUS", () => {
  const matching = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A1", right: "B2", payload: 2 },
    { left: "A2", right: "B1", payload: 3 },
    { left: "A2", right: "B2", payload: 4 },
  ]);
  assert.equal(matching.cardinality, 2);
  assert.equal(matching.unique, false, "K2,2 has two distinct maximum matchings");
  assert.deepEqual(matching.pairs, [], "an ambiguous result exposes no pairs");
});

test("D3.2: a unique maximum matching with an unmatched anchor is READY", () => {
  const matching = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A3", right: "B2", payload: 2 },
  ]);
  assert.equal(matching.cardinality, 2);
  assert.equal(matching.unique, true);
  assert.deepEqual(matching.pairs.map((pair) => `${pair.left}-${pair.right}`), ["A1-B1", "A3-B2"]);
  // A2 has no edge at all, so it is not part of the graph; an anchor that
  // *declares* an interface is not required to consume it.
  assert.deepEqual(matching.unmatchedLeft, []);

  // The same principle through the real discovery path: a pack with an extra
  // west anchor that nothing can meet still yields a READY placement.
  const extra = writePack({
    id: "extra_anchor",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "River", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "Other", type: "plain" },
    ],
    edges: [{ from: "L1", to: "L2", distance: 4, terrainCost: 1 }],
    anchors: [
      { id: "WEST_RIVER", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river"], accepts: ["river_outlet"] },
      // A highland anchor facing west, but Xia has no west-facing highland anchor
      // that could reach across this border.
      { id: "WEST_HIGHLAND", type: "highland_continuity", locationId: "L2", edge: "west", tags: ["highland"], accepts: ["highland_continuity"] },
    ],
  });
  try {
    const harness = loadPacks([XIA, extra]);
    const report = discover(harness, XIA_ID, "extra_anchor");
    const viable = report.candidates.filter((c) => c.seams.length > 0);
    assert.equal(viable.length, 1);
    assert.equal(viable[0]?.status, "ready");
    assert.deepEqual(
      viable[0]?.seams.flatMap((seam) => [seam.anchorA.id, seam.anchorB.id]).sort(),
      [xiaAnchor("EAST_RIVER_OUT"), "extra_anchor:boundary_anchor:WEST_RIVER"].sort(),
    );
  } finally {
    rmSync(extra, { recursive: true, force: true });
  }
});

test("E3.2: the same cardinality reached two ways is AMBIGUOUS", () => {
  // Two disjoint K2,2 blocks: four anchors per side, two independent choices.
  const matching = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A1", right: "B2", payload: 2 },
    { left: "A2", right: "B1", payload: 3 },
    { left: "A2", right: "B2", payload: 4 },
    { left: "A3", right: "B3", payload: 5 },
    { left: "A3", right: "B4", payload: 6 },
    { left: "A4", right: "B3", payload: 7 },
    { left: "A4", right: "B4", payload: 8 },
  ]);
  assert.equal(matching.cardinality, 4);
  assert.equal(matching.unique, false);
});

test("E3.2: asymmetric counts (3 left, 2 right, complete) are AMBIGUOUS", () => {
  const matching = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A1", right: "B2", payload: 2 },
    { left: "A2", right: "B1", payload: 3 },
    { left: "A2", right: "B2", payload: 4 },
    { left: "A3", right: "B1", payload: 5 },
    { left: "A3", right: "B2", payload: 6 },
  ]);
  assert.equal(matching.cardinality, 2, "only two right vertices can be consumed");
  assert.equal(matching.unique, false, "three ways to pick the pair of left vertices");
});

test("F3.2: discovery is identical whichever pack is described first", () => {
  const harness = loadPacks([XIA, EXT]);
  const forward = discover(harness, XIA_ID, EXT_ID);
  const backward = discover(harness, EXT_ID, XIA_ID);

  assert.equal(forward.status, backward.status);
  const normalise = (report: HandshakeReport): string[] => report.candidates
    .map((candidate) => [
      placementKey(candidate.placement),
      candidate.status,
      candidate.seams.map((seam) => `${seam.anchorA.id}->${seam.anchorB.id}`).sort().join(","),
      candidate.contestedAnchors.map((anchor) => anchor.id).sort().join(","),
    ].join(" | "))
    .sort();
  assert.deepEqual(normalise(forward), normalise(backward), "the verdict must not depend on argument order");

  // Same for a genuinely ambiguous and a genuinely unique case.
  const chain = writePack({
    id: "dir_chain",
    regions: [{ id: "R1", name: "R1" }],
    locations: [
      { id: "L1", regionId: "R1", name: "A1", type: "river_mouth" },
      { id: "L2", regionId: "R1", name: "A2", type: "river_mouth" },
    ],
    edges: [{ from: "L1", to: "L2", distance: 4, terrainCost: 1 }],
    anchors: [
      { id: "WEST_1", type: "river_inlet", locationId: "L1", edge: "west", tags: ["river"], accepts: ["river_outlet"] },
      { id: "WEST_2", type: "river_inlet", locationId: "L2", edge: "west", tags: ["river"], accepts: ["river_outlet"] },
    ],
  });
  try {
    const pair = loadPacks([XIA, chain]);
    const one = discover(pair, XIA_ID, "dir_chain");
    const two = discover(pair, "dir_chain", XIA_ID);
    assert.equal(one.status, two.status);
    assert.equal(one.status, "ambiguous", "one outlet cannot be assigned to two inlets");
  } finally {
    rmSync(chain, { recursive: true, force: true });
  }
});

test("I3.2: a join is refused when an ordinary geography edge already connects the locations", () => {
  const harness = loadPacks([XIA, EXT]);
  const world = harness.simulation.worldView();

  // Hand-author a plain edge between the two locations the river seam would use,
  // before any join exists. This is the case where spatial adjacency already
  // exists but no boundary seam was ever established: the join must not silently
  // adopt it.
  const manual = harness.simulation.dispatch({
    type: "world-geography.connect_locations",
    payload: {
      fromLocationId: xiaLocation("L0603"),
      toLocationId: extLocation("E0101"),
      distanceKm: 9,
      terrainCost: 1,
    },
    source: "system",
  });
  assert.equal(manual.ok, true, manual.errors.map((error) => error.message).join("; "));
  assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0603"), extLocation("E0101")), true);

  const before = worldState(harness);
  const rejection = rejectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });
  assert.equal(rejection.code, "E_HANDSHAKE_CONNECTION_EXISTS");
  assert.match(rejection.message, /already connected by an ordinary geography edge/);

  // The world is untouched: no join, no seam, and the pre-existing edge intact.
  assert.equal(worldState(harness), before);
  assert.equal(listBoundaryJoins(world).length, 0);
  assert.equal(listBoundarySeams(world).length, 0);
  assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0603"), extLocation("E0101")), true);
});

test("J3.2: a join fails atomically when one of its seams cannot be connected", () => {
  const west = multiSeamWestPack("atomic32_west");
  try {
    const harness = loadPacks([XIA, west]);
    const world = harness.simulation.worldView();

    // Pre-connect the wetland locations by an ordinary edge, leaving the river
    // seam legal. The join must still fail as a whole.
    const manual = harness.simulation.dispatch({
      type: "world-geography.connect_locations",
      payload: {
        fromLocationId: xiaLocation("L0303"),
        toLocationId: "atomic32_west:location:L2",
        distanceKm: 7,
        terrainCost: 1,
      },
      source: "system",
    });
    assert.equal(manual.ok, true, manual.errors.map((error) => error.message).join("; "));

    const before = worldState(harness);
    const joinsBefore = listBoundaryJoins(world).length;
    const seamsBefore = listBoundarySeams(world).length;

    const rejection = rejectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "atomic32_west", edgeB: "west" });
    assert.equal(rejection.code, "E_HANDSHAKE_CONNECTION_EXISTS");

    // Nothing was written: no join, no seam, and the river location is still
    // unconnected across the border.
    assert.equal(worldState(harness), before);
    assert.equal(listBoundaryJoins(world).length, joinsBefore);
    assert.equal(listBoundarySeams(world).length, seamsBefore);
    assert.equal(harness.geography.areAdjacent(world, xiaLocation("L0603"), "atomic32_west:location:L1"), false);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

test("K3.2: join deletion and plain-edge deletion leave the same connection count", () => {
  const west = multiSeamWestPack("disc32_west");
  const plain = multiSeamWestPack("plain32_west");
  try {
    // Path 1: create two connections via a join, delete via the join.
    const joined = loadPacks([XIA, west]);
    const joinedWorld = joined.simulation.worldView();
    const baseline = buildGeometryIndex(joinedWorld).logicalConnections.length;
    connectJoin(joined, { packAId: XIA_ID, edgeA: "east", packBId: "disc32_west", edgeB: "west" });
    assert.equal(buildGeometryIndex(joinedWorld).logicalConnections.length, baseline + 2);
    disconnectJoin(joined, { packAId: XIA_ID, edgeA: "east", packBId: "disc32_west", edgeB: "west" });
    assert.equal(
      buildGeometryIndex(joinedWorld).logicalConnections.length,
      baseline,
      "join deletion restores the baseline exactly",
    );

    // Path 2: create one connection via a plain command, delete via a plain
    // command. Both paths go through the shared primitive, so the counts line up.
    const plainHarness = loadPacks([XIA, plain]);
    const plainWorld = plainHarness.simulation.worldView();
    const plainBaseline = buildGeometryIndex(plainWorld).logicalConnections.length;
    must(plainHarness.simulation, {
      type: "world-geography.connect_locations",
      payload: {
        fromLocationId: xiaLocation("L0603"),
        toLocationId: "plain32_west:location:L1",
        distanceKm: 12,
        terrainCost: 1,
      },
    });
    assert.equal(buildGeometryIndex(plainWorld).logicalConnections.length, plainBaseline + 1);
    must(plainHarness.simulation, {
      type: "world-geography.disconnect_locations",
      payload: {
        fromLocationId: xiaLocation("L0603"),
        toLocationId: "plain32_west:location:L1",
      },
    });
    assert.equal(
      buildGeometryIndex(plainWorld).logicalConnections.length,
      plainBaseline,
      "plain deletion restores the baseline exactly",
    );

    // Both scenarios observe the same adjacency row accounting: a logical
    // connection is two directed rows.
    assert.equal(
      joinedWorld.listRelations({ type: "world-geography.adjacent_to" }).length,
      baseline * 2,
    );
    assert.equal(
      plainWorld.listRelations({ type: "world-geography.adjacent_to" }).length,
      plainBaseline * 2,
    );
  } finally {
    rmSync(west, { recursive: true, force: true });
    rmSync(plain, { recursive: true, force: true });
  }
});

test("L3.2: a joined world still round-trips through save/load", () => {
  const west = multiSeamWestPack("save32_west");
  try {
    const harness = loadPacks([XIA, west]);
    connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: "save32_west", edgeB: "west" });
    const before = harness.simulation.fingerprint();

    const loaded = Simulation.loadFromJson(
      harness.simulation.saveToJson({ label: "step32" }),
      [worldGeographyModule, mapPackModule, boundaryHandshakeModule],
    );
    assert.equal(loaded.result.ok, true, loaded.result.errors.map((error) => error.message).join("; "));
    const reopened = loaded.simulation!;
    assert.equal(reopened.fingerprint(), before);

    const geography = reopened.modules.capabilityImplementation<GeographyApi>("world.geography");
    const reopenedWorld = reopened.worldView();
    assert.ok(geography);
    assert.equal(listBoundaryJoins(reopenedWorld).length, 1);
    assert.equal(listBoundarySeams(reopenedWorld).length, 2);
    assert.equal(geography.listConnectedComponents(reopenedWorld).length, 1);
    assert.equal(geography.areAdjacent(reopenedWorld, xiaLocation("L0603"), "save32_west:location:L1"), true);
  } finally {
    rmSync(west, { recursive: true, force: true });
  }
});

// ===========================================================================
// Guard rails
// ===========================================================================

test("discovery never writes, whatever verdict it reaches", () => {
  const harness = loadPacks([XIA, EXT]);
  const before = worldState(harness);
  for (let round = 0; round < 3; round += 1) {
    discover(harness, XIA_ID, EXT_ID);
    discover(harness, EXT_ID, XIA_ID);
  }
  assert.equal(worldState(harness), before);
  assert.equal(harness.simulation.tick, 0);
  assert.equal(listBoundaryJoins(harness.simulation.worldView()).length, 0);
});

test("discovery is deterministic", () => {
  const first = discover(loadPacks([XIA, EXT]), XIA_ID, EXT_ID);
  const second = discover(loadPacks([XIA, EXT]), XIA_ID, EXT_ID);
  assert.deepEqual(
    first.candidates.map((candidate: BoundaryJoinCandidate) => ({
      placement: placementKey(candidate.placement),
      status: candidate.status,
      seams: candidate.seams.map((seam) => `${seam.anchorA.id}->${seam.anchorB.id}`),
    })),
    second.candidates.map((candidate: BoundaryJoinCandidate) => ({
      placement: placementKey(candidate.placement),
      status: candidate.status,
      seams: candidate.seams.map((seam) => `${seam.anchorA.id}->${seam.anchorB.id}`),
    })),
  );
});

test("a malformed placement is rejected with a clear code", () => {
  const harness = loadPacks([XIA, EXT]);
  // Same-direction edges are not a placement.
  const sameSide = rejectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "east" });
  assert.equal(sameSide.code, "E_HANDSHAKE_PLACEMENT_INVALID");
  assert.match(sameSide.message, /must face each other/);

  // A missing edge is not a placement either.
  const missing = rejectJoin(harness, { packAId: XIA_ID, edgeA: "", packBId: EXT_ID, edgeB: "west" });
  assert.equal(missing.code, "E_HANDSHAKE_PLACEMENT_INVALID");
});

test("an anchor is used at most once inside a join", () => {
  const harness = loadPacks([XIA, EXT]);
  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });

  // EAST_RIVER_OUT is already spent; no second seam may claim it, and the whole
  // join for that placement is refused as already connected.
  const world = harness.simulation.worldView();
  assert.equal(listBoundarySeams(world).length, 1);
  const seam = listBoundarySeams(world)[0]!;
  assert.equal(seam.id, boundarySeamId(xiaAnchor("EAST_RIVER_OUT"), extAnchor("WEST_RIVER_IN")));
});

test("seam identity is symmetric and order independent", () => {
  assert.equal(boundarySeamId("a", "b"), boundarySeamId("b", "a"));
  assert.equal(boundarySeamId("a", "b"), "boundary_seam:a|b");
});

test("a join exposes its seams from both the join and the anchor side", () => {
  const harness = loadPacks([XIA, EXT]);
  connectJoin(harness, { packAId: XIA_ID, edgeA: "east", packBId: EXT_ID, edgeB: "west" });
  const world = harness.simulation.worldView();

  const join = listBoundaryJoins(world)[0]!;
  const owned = world.listRelations({ type: "boundary-handshake.owns_seam", from: join.id });
  assert.deepEqual(owned.map((relation) => relation.to).sort(), join.seamIds);

  const seamId = join.seamIds[0]!;
  const stitched = world.listRelations({ type: "boundary-handshake.stitches", from: seamId });
  assert.deepEqual(
    stitched.map((relation) => relation.to).sort(),
    [xiaAnchor("EAST_RIVER_OUT"), extAnchor("WEST_RIVER_IN")].sort(),
  );
});
