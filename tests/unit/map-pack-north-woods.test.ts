/**
 * The North Woods map pack (2026-10-18 content round): chestnut slopes, the
 * upstream stone bar and the misty ridge, stitched onto Xia's northern land
 * corridor, with event points for game, beasts and the shan-sao legend.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Simulation } from "@openlife/simulation";
import {
  boundaryHandshakeModule,
  buildGeometryIndex,
  boundaryPlacement,
  placementKey,
  worldGeographyModule,
  type HandshakeApi,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack } from "@openlife/module-map-pack";

const XIA = resolve(import.meta.dirname, "../../packs/xia_starter_v0_1");
const NORTH = resolve(import.meta.dirname, "../../packs/xia_north_woods_v0_1");

test("North Woods loads cleanly with three regions, twelve locations and twenty-four event points of every kind", () => {
  const result = loadMapPack(NORTH);
  assert.equal(result.ok, true, result.validation.issues.map((i) => i.message).join("; "));
  assert.deepEqual(result.validation.counts, { regions: 3, locations: 12, edges: 13, boundaryAnchors: 2 });
  const points = result.pack!.eventPoints!;
  assert.equal(points.length, 24);
  const kinds = new Set(points.map((p) => p.kind));
  for (const kind of ["landmark", "gathering", "encounter", "hazard", "omen", "festival"]) assert.ok(kinds.has(kind as never), kind);
  const locations = new Set(result.pack!.locations.map((l) => l.id));
  for (const point of points) assert.ok(locations.has(point.locationId));
  // Every location is reachable from the corridor mouth.
  const adj = new Map<string, string[]>();
  for (const e of result.pack!.edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const seen = new Set(["N0101"]), queue = ["N0101"];
  while (queue.length) for (const next of adj.get(queue.shift()!) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  assert.equal(seen.size, 12);
});

test("every North Woods terrain type has a Chinese label on the map page", async () => {
  const { readFileSync } = await import("node:fs");
  const shell = readFileSync(resolve(import.meta.dirname, "../../apps/web/public/shell.js"), "utf8");
  const pack = loadMapPack(NORTH).pack!;
  for (const type of new Set([...pack.regions.map((r) => r.type), ...pack.locations.map((l) => l.type)])) {
    assert.match(shell, new RegExp(`\\b${type}: "`), type);
  }
});

test("North Woods stitches onto Xia's northern land corridor", () => {
  const simulation = new Simulation({ worldSeed: 20261018, modules: [worldGeographyModule, mapPackModule, boundaryHandshakeModule] });
  for (const path of [XIA, NORTH]) {
    const loaded = loadMapPack(path);
    assert.equal(loaded.ok, true);
    assert.equal(registerMapPack(simulation, loaded.pack!).ok, true);
  }
  const handshake = simulation.modules.capabilityImplementation<HandshakeApi>("world.boundary-handshake")!;
  const report = handshake.findBoundarySeams(buildGeometryIndex(simulation.worldView()), "xia_starter_v0_1", "xia_north_woods_v0_1");
  const seam = report.candidates.find((c) =>
    placementKey(c.placement) === placementKey(boundaryPlacement("xia_starter_v0_1", "north", "xia_north_woods_v0_1", "south")));
  assert.ok(seam, "a north/south placement is discovered");
  assert.equal(seam.status, "ready");
  const joined = simulation.dispatch({
    type: "boundary-handshake.connect_boundary_join",
    payload: { packAId: "xia_starter_v0_1", edgeA: "north", packBId: "xia_north_woods_v0_1", edgeB: "south", distanceKm: 8, terrainCost: 1.4 },
    source: "system",
  });
  assert.equal(joined.ok, true, joined.errors.map((e) => e.message).join("; "));
});
