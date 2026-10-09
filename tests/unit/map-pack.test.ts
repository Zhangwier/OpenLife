/**
 * Map Pack loader tests (Step 1).
 *
 * The happy path runs against the real `packs/xia_starter_v0_1` so the shipped
 * pack can never drift out of schema without a test going red. The failure
 * cases build throwaway packs in a temp directory, mutate exactly one thing,
 * and assert both the machine-readable issue code and that the failure is
 * located at a file and an object id.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Simulation } from "@openlife/simulation";
import {
  GeographyComponents,
  GeographyKinds,
  GeographyRelations,
  worldGeographyModule,
  type GeographyApi,
} from "@openlife/module-world-geography";
import {
  MapPackIssueCode,
  mapPackModule,
  loadMapPack,
  registerMapPack,
  inspectMapPack,
  type MapPackContents,
} from "@openlife/module-map-pack";

const REAL_PACK = resolve(import.meta.dirname, "../../packs/xia_starter_v0_1");

function tempPack(prefix = "openlife-pack-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function cleanup(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

/** Copies the real pack so a case can break exactly one thing in it. */
function cloneRealPack(): string {
  const directory = tempPack();
  cpSync(REAL_PACK, directory, { recursive: true });
  return directory;
}

function readPackText(directory: string, relative: string): string {
  return readFileSync(join(directory, relative), "utf8");
}

test("the shipped pack on disk matches what the loader reports for it", () => {
  const pack = mustLoad(REAL_PACK);
  assert.equal(readPackText(REAL_PACK, "manifest.yaml").includes("xia_starter_v0_1"), true);
  assert.equal(pack.regions.length, 10);
  assert.equal(pack.locations.length, 40);
});

function mustLoad(directory: string, dryRun = true): MapPackContents {
  const result = loadMapPack(directory, { dryRun });
  assert.equal(
    result.ok,
    true,
    result.validation.issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "),
  );
  assert.ok(result.pack, "expected a parsed pack");
  return result.pack;
}

function codes(directory: string): string[] {
  const result = loadMapPack(directory, { dryRun: true });
  return result.validation.issues.map((issue) => issue.code);
}

function buildSimulation(): Simulation {
  return new Simulation({
    worldSeed: 20261007,
    modules: [worldGeographyModule, mapPackModule],
  });
}

// --- 1. the shipped pack is valid -----------------------------------------

test("the shipped xia_starter_v0_1 pack validates and reports exactly its authored contents", () => {
  const result = loadMapPack(REAL_PACK, { dryRun: true });

  assert.equal(result.ok, true, JSON.stringify(result.validation.issues, null, 2));
  assert.equal(result.manifest?.id, "xia_starter_v0_1");
  assert.equal(result.manifest?.name, "Xia Starter World");
  assert.equal(result.manifest?.version, "0.1.0");
  assert.equal(result.manifest?.schemaVersion, "0.1");
  assert.equal(result.manifest?.type, "map_pack");

  assert.deepEqual(result.validation.counts, { regions: 10, locations: 40, edges: 53, boundaryAnchors: 6 });
  assert.equal(result.validation.checks.every((check) => check.ok), true);
});

test("every authored location belongs to a declared region and every referenced location exists", () => {
  const pack = mustLoad(REAL_PACK);
  const regionIds = new Set(pack.regions.map((region) => region.id));
  const locationIds = new Set(pack.locations.map((location) => location.id));

  for (const location of pack.locations) {
    assert.ok(regionIds.has(location.regionId), `${location.id} -> missing region ${location.regionId}`);
  }
  for (const edge of pack.edges) {
    assert.ok(locationIds.has(edge.from), `edge.from missing: ${edge.from}`);
    assert.ok(locationIds.has(edge.to), `edge.to missing: ${edge.to}`);
    assert.notEqual(edge.from, edge.to, "no self edges are allowed");
    assert.ok(edge.distance > 0, `edge ${edge.from}->${edge.to} distance must be > 0`);
    assert.ok(edge.terrainCost > 0, `edge ${edge.from}->${edge.to} terrain_cost must be > 0`);
  }
  for (const anchor of pack.boundaryAnchors) {
    assert.ok(locationIds.has(anchor.locationId), `anchor ${anchor.id} -> missing location ${anchor.locationId}`);
    assert.ok(anchor.type.length > 0, `anchor ${anchor.id} needs a type`);
    assert.ok(anchor.compatibilityTags.length > 0, `anchor ${anchor.id} needs compatibility tags`);
  }
});

test("the six authored anchors exist with their required edge directions", () => {
  const pack = mustLoad(REAL_PACK);
  assert.deepEqual(
    pack.boundaryAnchors.map((anchor) => anchor.id).sort(),
    [
      "EAST_RIVER_OUT",
      "EAST_WETLAND_CONTINUITY",
      "NORTH_LAND_CORRIDOR",
      "SOUTH_LAND_CORRIDOR",
      "WEST_HIGHLAND_CONTINUITY",
      "WEST_RIVER_IN",
    ],
  );
  const byId = new Map(pack.boundaryAnchors.map((anchor) => [anchor.id, anchor]));
  assert.equal(byId.get("WEST_RIVER_IN")?.edge, "west");
  assert.equal(byId.get("EAST_RIVER_OUT")?.edge, "east");
  assert.equal(byId.get("NORTH_LAND_CORRIDOR")?.edge, "north");
  assert.equal(byId.get("SOUTH_LAND_CORRIDOR")?.edge, "south");
  assert.equal(byId.get("WEST_HIGHLAND_CONTINUITY")?.edge, "west");
  assert.equal(byId.get("EAST_WETLAND_CONTINUITY")?.edge, "east");
});

// --- 2. registration into the world ---------------------------------------

test("registering the pack materializes regions, locations, symmetric adjacency and anchors", () => {
  const simulation = buildSimulation();
  const pack = mustLoad(REAL_PACK);
  const registration = registerMapPack(simulation, pack);

  assert.equal(registration.ok, true, JSON.stringify(registration.commands.filter((c) => !c.ok)));
  assert.equal(registration.commands.length, 109);

  const world = simulation.worldView();
  assert.equal(world.listEntities({ kind: GeographyKinds.region }).length, 10);
  assert.equal(world.listEntities({ kind: GeographyKinds.location }).length, 40);
  assert.equal(world.listEntities({ kind: GeographyKinds.boundaryAnchor }).length, 6);

  // One authored edge becomes two directed rows, matching connect_locations.
  assert.equal(world.listRelations({ type: GeographyRelations.adjacentTo }).length, 106);
  assert.equal(world.listRelations({ type: GeographyRelations.contains }).length, 40);
  assert.equal(world.listRelations({ type: GeographyRelations.boundaryAnchoredAt }).length, 6);

  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  assert.ok(geography);
  assert.equal(geography.regionOf(world, "xia_starter_v0_1:location:L0101"), "xia_starter_v0_1:region:R01");
  assert.deepEqual(
    geography.boundaryAnchorsAt(world, "xia_starter_v0_1:location:L0603").map((anchor) => anchor.id),
    ["xia_starter_v0_1:boundary_anchor:EAST_RIVER_OUT"],
  );
  assert.deepEqual(
    geography.boundaryAnchorsByTag(world, "river").map((anchor) => anchor.id),
    ["xia_starter_v0_1:boundary_anchor:EAST_RIVER_OUT", "xia_starter_v0_1:boundary_anchor:WEST_RIVER_IN"],
  );
});

test("a registered pack round-trips through save/load without losing geography", () => {
  const simulation = buildSimulation();
  registerMapPack(simulation, mustLoad(REAL_PACK));
  const before = simulation.fingerprint();

  const loaded = Simulation.loadFromJson(simulation.saveToJson({ label: "pack" }), [
    worldGeographyModule,
    mapPackModule,
  ]);
  assert.equal(loaded.result.ok, true, loaded.result.errors.map((e) => e.message).join("; "));
  assert.ok(loaded.simulation);
  assert.equal(loaded.simulation.fingerprint(), before);
  assert.equal(loaded.simulation.worldView().listEntities({ kind: GeographyKinds.location }).length, 40);
});

test("adjacency distance and terrain cost survive registration on both directions", () => {
  const simulation = buildSimulation();
  registerMapPack(simulation, mustLoad(REAL_PACK));
  const world = simulation.worldView();

  const forward = world.listRelations({
    type: GeographyRelations.adjacentTo,
    from: "xia_starter_v0_1:location:L0101",
    to: "xia_starter_v0_1:location:L0102",
  })[0];
  const backward = world.listRelations({
    type: GeographyRelations.adjacentTo,
    from: "xia_starter_v0_1:location:L0102",
    to: "xia_starter_v0_1:location:L0101",
  })[0];

  assert.ok(forward);
  assert.ok(backward);
  assert.equal(forward.components[GeographyComponents.connection]?.distanceKm, 8.4);
  assert.equal(backward.components[GeographyComponents.connection]?.distanceKm, 8.4);
  assert.equal(forward.components[GeographyComponents.connection]?.terrainCost, 1.0);
});

// --- 3. broken region reference -------------------------------------------

test("a location pointing at a nonexistent region fails with a located error", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/locations.yaml"),
      [
        "locations:",
        "  - id: L0101",
        "    name: Central River Bank",
        "    region_id: R01",
        "    type: river_bank",
        "  - id: L0102",
        "    name: Orphaned Location",
        "    region_id: R99",
        "    type: river_crossing",
      ].join("\n"),
    );
    // Re-author edges so the only failure under test is the region reference.
    writeFileSync(
      join(directory, "map/edges.yaml"),
      ["edges:", "  - from: L0101", "    to: L0102", "    distance: 8.4", "    terrain_cost: 1.0"].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const issue = result.validation.issues.find((entry) => entry.code === MapPackIssueCode.UnknownRegion);
    assert.ok(issue, `expected ${MapPackIssueCode.UnknownRegion}, got ${codes(directory).join(", ")}`);
    assert.equal(issue.objectId, "L0102");
    assert.equal(issue.field, "region_id");
    assert.match(issue.file, /locations\.yaml$/);
  } finally {
    cleanup(directory);
  }
});

// --- 4. broken edge --------------------------------------------------------

test("an edge pointing at a nonexistent location fails with a located error", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/edges.yaml"),
      ["edges:", "  - from: L0101", "    to: L9999", "    distance: 8.4", "    terrain_cost: 1.0"].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const issue = result.validation.issues.find((entry) => entry.code === MapPackIssueCode.UnknownLocation);
    assert.ok(issue, `expected ${MapPackIssueCode.UnknownLocation}, got ${codes(directory).join(", ")}`);
    assert.equal(issue.objectId, "L9999");
    assert.equal(issue.field, "to");
    assert.match(issue.file, /edges\.yaml$/);
  } finally {
    cleanup(directory);
  }
});

test("a self edge is rejected because no contract permits one", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/edges.yaml"),
      ["edges:", "  - from: L0101", "    to: L0101", "    distance: 4.0", "    terrain_cost: 1.0"].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    assert.ok(result.validation.issues.some((issue) => issue.code === MapPackIssueCode.SelfEdge));
  } finally {
    cleanup(directory);
  }
});

test("non-positive distance and terrain_cost are both rejected", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/edges.yaml"),
      [
        "edges:",
        "  - from: L0101",
        "    to: L0102",
        "    distance: 0",
        "    terrain_cost: -1.5",
      ].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const fields = result.validation.issues
      .filter((issue) => issue.code === MapPackIssueCode.InvalidField)
      .map((issue) => issue.field);
    assert.ok(fields.includes("distance"), `expected a distance issue, got ${fields.join(", ")}`);
    assert.ok(fields.includes("terrain_cost"), `expected a terrain_cost issue, got ${fields.join(", ")}`);
  } finally {
    cleanup(directory);
  }
});

// --- 5. duplicate ids ------------------------------------------------------

test("two locations sharing an id fail on both the duplicate and the dangling reference", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/locations.yaml"),
      [
        "locations:",
        "  - id: L0101",
        "    name: Central River Bank",
        "    region_id: R01",
        "    type: river_bank",
        "  - id: L0101",
        "    name: Duplicate Bank",
        "    region_id: R01",
        "    type: river_bank",
      ].join("\n"),
    );
    writeFileSync(
      join(directory, "map/edges.yaml"),
      ["edges:", "  - from: L0101", "    to: L0102", "    distance: 8.4", "    terrain_cost: 1.0"].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const duplicate = result.validation.issues.find((issue) => issue.code === MapPackIssueCode.DuplicateId);
    assert.ok(duplicate, `expected ${MapPackIssueCode.DuplicateId}, got ${codes(directory).join(", ")}`);
    assert.equal(duplicate.objectId, "L0101");
    assert.equal(duplicate.index, 2);
    assert.match(duplicate.file, /locations\.yaml$/);
    // Nothing is silently dropped: the now-missing L0102 is reported too.
    assert.ok(result.validation.issues.some((issue) => issue.code === MapPackIssueCode.UnknownLocation));
  } finally {
    cleanup(directory);
  }
});

test("duplicate region ids are rejected", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/regions.yaml"),
      [
        "regions:",
        "  - id: R01",
        "    name: Central River Plain",
        "    type: plain",
        "  - id: R01",
        "    name: Duplicate Plain",
        "    type: plain",
      ].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    assert.ok(result.validation.issues.some((issue) => issue.code === MapPackIssueCode.DuplicateId));
    // R02..R10 are gone, so their locations must be reported as dangling.
    assert.ok(result.validation.issues.some((issue) => issue.code === MapPackIssueCode.UnknownRegion));
  } finally {
    cleanup(directory);
  }
});

// --- 6. broken anchor ------------------------------------------------------

test("an anchor pointing at a nonexistent location fails with a located error", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/boundary_anchors.yaml"),
      [
        "boundary_anchors:",
        "  - id: EAST_RIVER_OUT",
        "    type: river_outlet",
        "    location_id: L0000",
        "    edge: east",
        "    compatibility_tags:",
        "      - river",
        "      - downstream",
      ].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const issue = result.validation.issues.find((entry) => entry.code === MapPackIssueCode.UnknownLocation);
    assert.ok(issue, `expected ${MapPackIssueCode.UnknownLocation}, got ${codes(directory).join(", ")}`);
    assert.equal(issue.objectId, "EAST_RIVER_OUT");
    assert.equal(issue.field, "location_id");
    assert.match(issue.file, /boundary_anchors\.yaml$/);
  } finally {
    cleanup(directory);
  }
});

test("an anchor with an empty type or an unknown edge direction is rejected", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/boundary_anchors.yaml"),
      [
        "boundary_anchors:",
        "  - id: EAST_RIVER_OUT",
        "    type: river_outlet",
        "    location_id: L1004",
        "    edge: up",
        "    compatibility_tags:",
        "      - river",
      ].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const issue = result.validation.issues.find((entry) => entry.field === "edge");
    assert.ok(issue, `expected an edge issue, got ${codes(directory).join(", ")}`);
    assert.equal(issue.code, MapPackIssueCode.InvalidField);
  } finally {
    cleanup(directory);
  }
});

// --- 7. missing files ------------------------------------------------------

test("a pack without regions.yaml fails with an explicit missing-file error", () => {
  const directory = cloneRealPack();
  try {
    rmSync(join(directory, "map/regions.yaml"));

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const issue = result.validation.issues.find((entry) => entry.code === MapPackIssueCode.FileMissing);
    assert.ok(issue, `expected ${MapPackIssueCode.FileMissing}, got ${codes(directory).join(", ")}`);
    assert.match(issue.file, /regions\.yaml$/);
    // A missing region file must cascade into dangling region references.
    assert.ok(result.validation.issues.some((entry) => entry.code === MapPackIssueCode.UnknownRegion));
  } finally {
    cleanup(directory);
  }
});

test("a pack without manifest.yaml fails and reports no manifest", () => {
  const directory = cloneRealPack();
  try {
    rmSync(join(directory, "manifest.yaml"));

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    assert.equal(result.manifest, undefined);
    assert.ok(result.validation.issues.some((issue) => issue.code === MapPackIssueCode.FileMissing));
  } finally {
    cleanup(directory);
  }
});

test("a manifest declaring the wrong type or schema version is rejected", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "manifest.yaml"),
      [
        "id: xia_starter_v0_1",
        "name: Xia Starter World",
        "version: 0.1.0",
        'schema_version: "9.9"',
        "type: world_pack",
      ].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const found = codes(directory);
    assert.ok(found.includes(MapPackIssueCode.ManifestType), found.join(", "));
    assert.ok(found.includes(MapPackIssueCode.SchemaVersion), found.join(", "));
  } finally {
    cleanup(directory);
  }
});

test("a missing pack directory is a programmer error, not a validation result", () => {
  assert.throws(() => loadMapPack(resolve(REAL_PACK, "does-not-exist")), /does not exist/);
});

// --- 8. authoring mistakes the loader must also catch ----------------------

test("a location with no edge is reported as an orphan instead of silently existing", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(
      join(directory, "map/locations.yaml"),
      [
        "locations:",
        "  - id: L0101",
        "    name: Central River Bank",
        "    region_id: R01",
        "    type: river_bank",
        "  - id: L0102",
        "    name: Lonely Ford",
        "    region_id: R01",
        "    type: river_crossing",
      ].join("\n"),
    );
    // No edge touches L0102, and the anchors must not reference it either.
    writeFileSync(
      join(directory, "map/edges.yaml"),
      ["edges:", "  - from: L0101", "    to: L0101", "    distance: 8.4", "    terrain_cost: 1.0"].join("\n"),
    );
    writeFileSync(
      join(directory, "map/boundary_anchors.yaml"),
      [
        "boundary_anchors:",
        "  - id: WEST_RIVER_IN",
        "    type: river_inlet",
        "    location_id: L0101",
        "    edge: west",
        "    compatibility_tags:",
        "      - river",
      ].join("\n"),
    );

    const result = loadMapPack(directory, { dryRun: true });
    assert.equal(result.ok, false);
    const orphan = result.validation.issues.find((issue) => issue.code === MapPackIssueCode.OrphanLocation);
    assert.ok(orphan, `expected ${MapPackIssueCode.OrphanLocation}, got ${codes(directory).join(", ")}`);
    assert.equal(orphan.objectId, "L0102");
    assert.match(orphan.file, /locations\.yaml$/);
  } finally {
    cleanup(directory);
  }
});

test("the YAML subset rejects flow collections and anchors instead of guessing", () => {
  const directory = cloneRealPack();
  try {
    writeFileSync(join(directory, "map/regions.yaml"), "regions: [{id: R01, name: Plain, type: plain}]\n");
    const flow = loadMapPack(directory, { dryRun: true });
    assert.equal(flow.ok, false);
    assert.ok(flow.validation.issues.some((issue) => issue.code === MapPackIssueCode.FileMalformed));

    writeFileSync(
      join(directory, "map/regions.yaml"),
      ["regions:", "  - &r01", "    id: R01", "    name: Plain", "    type: plain"].join("\n"),
    );
    const aliases = loadMapPack(directory, { dryRun: true });
    assert.equal(aliases.ok, false);
    assert.ok(aliases.validation.issues.some((issue) => issue.code === MapPackIssueCode.FileMalformed));
  } finally {
    cleanup(directory);
  }
});

// --- 9. inspector output ---------------------------------------------------

test("the inspector prints a PASS report for the shipped pack", () => {
  const report = inspectMapPack(REAL_PACK);
  assert.match(report, /OpenLife Map Pack Inspector/);
  assert.match(report, /Xia Starter World/);
  assert.match(report, /Regions:\s+10/);
  assert.match(report, /Locations:\s+40/);
  assert.match(report, /Edges:\s+53/);
  assert.match(report, /Boundary Anchors:\s+6/);
  assert.match(report, /Validation:\n\s+PASS/);
});

test("the inspector prints a FAIL report with located issues for a broken pack", () => {
  const directory = cloneRealPack();
  try {
    rmSync(join(directory, "map/boundary_anchors.yaml"));
    const report = inspectMapPack(directory);
    assert.match(report, /Validation:\n\s+FAIL/);
    assert.match(report, /E_PACK_FILE_MISSING/);
    assert.match(report, /boundary_anchors\.yaml/);
  } finally {
    cleanup(directory);
  }
});
