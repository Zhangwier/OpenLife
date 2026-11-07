/**
 * The South Hills map pack: a third authored pack that stitches to Xia's
 * southern land corridor, plus the optional event-point file it introduces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Simulation } from "@openlife/simulation";
import {
  boundaryHandshakeModule,
  buildGeometryIndex,
  boundaryPlacement,
  placementKey,
  worldGeographyModule,
  type HandshakeApi,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack, MapPackIssueCode } from "@openlife/module-map-pack";

const XIA = resolve(import.meta.dirname, "../../packs/xia_starter_v0_1");
const SOUTH = resolve(import.meta.dirname, "../../packs/xia_south_hills_v0_1");

test("South Hills loads cleanly with three regions, twelve locations and ten event points", () => {
  const result = loadMapPack(SOUTH);
  assert.equal(result.ok, true, result.validation.issues.map((i) => i.message).join("; "));
  assert.deepEqual(result.validation.counts, { regions: 3, locations: 12, edges: 12, boundaryAnchors: 2 });
  const points = result.pack!.eventPoints!;
  assert.equal(points.length, 10);
  const kinds = new Set(points.map((p) => p.kind));
  for (const kind of ["landmark", "gathering", "encounter", "hazard", "omen", "festival"]) assert.ok(kinds.has(kind as never), kind);
  const locations = new Set(result.pack!.locations.map((l) => l.id));
  for (const point of points) assert.ok(locations.has(point.locationId));
});

test("packs without event_points.yaml keep exactly their previous contents", () => {
  const result = loadMapPack(XIA);
  assert.equal(result.ok, true);
  assert.equal("eventPoints" in result.pack!, false);
});

test("a broken event point is reported with a located issue", () => {
  const dir = mkdtempSync(join(tmpdir(), "south-hills-"));
  try {
    cpSync(SOUTH, dir, { recursive: true });
    writeFileSync(join(dir, "map/event_points.yaml"), [
      "event_points:",
      "  - id: EP_BAD",
      "    name: 无处之处",
      "    location_id: S9999",
      "    kind: gathering",
      "    text: 不存在的地点。",
      "  - id: EP_WORSE",
      "    name: 未知类型",
      "    location_id: S0101",
      "    kind: picnic",
      "    text: 不认识的事件类型。",
      "",
    ].join("\n"));
    const result = loadMapPack(dir);
    assert.equal(result.ok, false);
    const codes = result.validation.issues.map((i) => i.code);
    assert.ok(codes.includes(MapPackIssueCode.UnknownLocation));
    assert.ok(codes.includes(MapPackIssueCode.InvalidField));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("South Hills stitches onto Xia's southern land corridor", () => {
  const simulation = new Simulation({ worldSeed: 20261016, modules: [worldGeographyModule, mapPackModule, boundaryHandshakeModule] });
  for (const path of [XIA, SOUTH]) {
    const loaded = loadMapPack(path);
    assert.equal(loaded.ok, true);
    assert.equal(registerMapPack(simulation, loaded.pack!).ok, true);
  }
  const handshake = simulation.modules.capabilityImplementation<HandshakeApi>("world.boundary-handshake")!;
  const report = handshake.findBoundarySeams(buildGeometryIndex(simulation.worldView()), "xia_starter_v0_1", "xia_south_hills_v0_1");
  const southNorth = report.candidates.find((c) =>
    placementKey(c.placement) === placementKey(boundaryPlacement("xia_starter_v0_1", "south", "xia_south_hills_v0_1", "north")));
  assert.ok(southNorth, "a south/north placement is discovered");
  assert.equal(southNorth.status, "ready");
  const joined = simulation.dispatch({
    type: "boundary-handshake.connect_boundary_join",
    payload: { packAId: "xia_starter_v0_1", edgeA: "south", packBId: "xia_south_hills_v0_1", edgeB: "north", distanceKm: 9, terrainCost: 1.3 },
    source: "system",
  });
  assert.equal(joined.ok, true, joined.errors.map((e) => e.message).join("; "));
});
