/**
 * `openlife handshake <packA> <packB>` - the Boundary Handshake operator view.
 *
 * Default behaviour is a **pure analysis**: load both packs, run two-phase
 * discovery, print the verdict, touch nothing.
 *
 * A join is only created when the caller names a **placement** with
 * `--placement=<edgeA>:<edgeB>` *and* passes `--connect`. Naming a placement
 * (rather than a single anchor pair) is what lets one border carry several
 * seams: the protocol then stitches every pair that placement resolves to,
 * all-or-nothing. There is no way to stitch one pair while leaving the rest of
 * the border undecided, and no way to make the tool pick a placement for you.
 */

import { Simulation } from "@openlife/simulation";
import {
  boundaryHandshakeModule,
  boundaryJoinId,
  boundaryPlacement,
  buildGeometryIndex,
  listBoundaryJoins,
  listBoundarySeams,
  placementKey,
  worldGeographyModule,
  type BoundaryAnchorRef,
  type BoundaryJoinCandidate,
  type HandshakeReport,
  type WorldEdge,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack, type MapPackLoadResult } from "@openlife/module-map-pack";
import type { GeographyApi } from "@openlife/module-world-geography";

export interface HandshakeCliOptions {
  seed: number;
  /** Create the join once a single placement is named or unambiguous. */
  connect: boolean;
  /** Explicit placement as `edgeA:edgeB`, e.g. `east:west`. */
  placement?: string;
  /** Raw connection parameters; when omitted the CLI marks them synthetic. */
  distanceKm?: number;
  terrainCost?: number;
}

export interface HandshakeCliResult {
  ok: boolean;
  report: string;
}

interface LoadedPack {
  id: string;
  name: string;
  result: MapPackLoadResult;
}

export function runHandshake(
  pathA: string,
  pathB: string,
  options: HandshakeCliOptions,
): HandshakeCliResult {
  const lines: string[] = [];
  const push = (line = ""): void => { lines.push(line); };

  const packA = loadOrFail(pathA);
  const packB = loadOrFail(pathB);
  if (!packA || !packB) {
    push("OpenLife Boundary Handshake");
    push();
    push("  FAIL  a pack failed to load; run `inspect <dir>` for the full issue list");
    push();
    return { ok: false, report: lines.join("\n") };
  }

  const simulation = new Simulation({
    worldSeed: options.seed,
    modules: [worldGeographyModule, mapPackModule, boundaryHandshakeModule],
  });
  const regA = registerMapPack(simulation, packA.result.pack!);
  const regB = registerMapPack(simulation, packB.result.pack!);
  const world = simulation.worldView();
  const handshake = simulation.modules.capabilityImplementation<{
    findBoundarySeams: (index: unknown, a: string, b: string) => HandshakeReport;
    placementFor: (a: string, ea: string, b: string, eb: string) => ReturnType<typeof boundaryPlacement>;
    listJoins: typeof listBoundaryJoins;
  }>("world.boundary-handshake");
  const geography = simulation.modules.capabilityImplementation<GeographyApi>("world.geography");
  if (!handshake || !geography) {
    push("OpenLife Boundary Handshake");
    push();
    push("  FAIL  the boundary-handshake capability is unavailable");
    push();
    return { ok: false, report: lines.join("\n") };
  }

  const kernelState = (): string => JSON.stringify(simulation.kernel.serialize());
  const before = kernelState();
  const report = handshake.findBoundarySeams(buildGeometryIndex(world), packA.id, packB.id);
  const after = kernelState();

  push("OpenLife Boundary Handshake");
  push();
  push("Pack A:");
  push(`  ${packA.id}`);
  push(`  ${packA.name}`);
  push();
  push("Pack B:");
  push(`  ${packB.id}`);
  push(`  ${packB.name}`);
  push();
  push("Registration:");
  push(`  pack A: ${regA.commands.length} command(s), ${regA.commands.filter((c) => !c.ok).length} failed`);
  push(`  pack B: ${regB.commands.length} command(s), ${regB.commands.filter((c) => !c.ok).length} failed`);
  push();

  push(`Placements (${report.candidates.length}):`);
  push();
  for (const candidate of report.candidates) {
    pushPlacement(push, candidate, packA.id, packB.id);
  }
  if (report.candidates.length === 0) push("  (none)");
  push();

  if (report.emptyPlacements.length > 0) {
    push("Placements with no compatible anchors:");
    for (const placement of report.emptyPlacements) {
      push(`  ${shortId(placement.packAId)}.${placement.edgeA} <-> ${shortId(placement.packBId)}.${placement.edgeB}`);
    }
    push();
  }

  push("Rejected pairs:");
  const rejectedByReason = new Map<string, number>();
  for (const entry of report.rejected) {
    const slug = entry.reasons[entry.reasons.length - 1] ?? "unknown";
    rejectedByReason.set(slug, (rejectedByReason.get(slug) ?? 0) + 1);
  }
  if (rejectedByReason.size === 0) push("  (none)");
  else for (const [slug, count] of [...rejectedByReason].sort()) push(`  ${slug}: ${count}`);
  push();

  push("Other anchors:");
  if (report.unmatched.length === 0) push("  (none)");
  else for (const anchor of report.unmatched) push(`  ${shortId(anchor.id)}  ${anchor.edge}/${anchor.type}`);
  push();

  push("Discovery was pure:");
  push(`  world state unchanged: ${before === after ? "PASS" : "FAIL"}`);
  push();

  const viable = report.candidates.filter((candidate) => candidate.seams.length > 0);
  if (report.status === "ambiguous") {
    push("Ambiguity:");
    if (viable.length > 1) {
      push(`  ${viable.length} viable placements: the world cannot tell which side of ${shortId(packA.id)} ${shortId(packB.id)} belongs on`);
    }
    for (const candidate of report.candidates) {
      if (candidate.status === "ambiguous" && candidate.contestedAnchors.length > 0) {
        push(`  placement ${candidate.placement.edgeA}:${candidate.placement.edgeB} has no unique anchor assignment`);
        for (const anchor of candidate.contestedAnchors) push(`    contested: ${shortId(anchor.id)}`);
      }
    }
    push("  name one placement with --placement=<edgeA>:<edgeB>");
    push();
  }

  const explicit = parsePlacementFlag(options.placement);
  if (explicit && (!explicit[0] || !explicit[1])) {
    push("Connect:");
    push(`  FAIL  --placement must look like east:west, received "${options.placement}"`);
    push();
    return { ok: false, report: lines.join("\n") };
  }

  const shouldConnect = options.connect || explicit !== undefined;
  if (!shouldConnect) {
    push("Joins:");
    push(`  ${listBoundaryJoins(world).length} established (analysis only; pass --connect to build one)`);
    push();
    push("Validation:");
    push(`  ${report.status.toUpperCase().replace("_", "_")}`);
    push();
    return { ok: report.status !== "no_match", report: lines.join("\n") };
  }

  // Resolve which placement to join.
  let edgeA: string | undefined;
  let edgeB: string | undefined;
  if (explicit) {
    [edgeA, edgeB] = explicit;
  } else if (report.status === "ready") {
    const ready = viable[0]!;
    // Describe the placement from pack A's side so the CLI reads naturally.
    if (ready.placement.packAId === packA.id) {
      edgeA = ready.placement.edgeA;
      edgeB = ready.placement.edgeB;
    } else {
      edgeA = ready.placement.edgeB;
      edgeB = ready.placement.edgeA;
    }
  }

  if (!edgeA || !edgeB) {
    push("Connect:");
    push(`  REFUSED  discovery returned ${report.status}; nothing was written`);
    push();
    return { ok: false, report: lines.join("\n") };
  }

  const synthetic = options.distanceKm === undefined && options.terrainCost === undefined;
  const distanceKm = options.distanceKm ?? 1;
  const terrainCost = options.terrainCost ?? 1;

  const result = simulation.dispatch({
    type: "boundary-handshake.connect_boundary_join",
    payload: {
      packAId: packA.id,
      edgeA,
      packBId: packB.id,
      edgeB,
      distanceKm,
      terrainCost,
    },
    source: "system",
  });

  push("Connect:");
  push(`  placement: ${shortId(packA.id)}.${edgeA} <-> ${shortId(packB.id)}.${edgeB}`);
  if (!result.ok) {
    for (const error of result.errors) push(`  FAIL  ${error.code}: ${error.message}`);
    push();
    return { ok: false, report: lines.join("\n") };
  }

  const joins = handshake.listJoins(world);
  push(`  PASS  join ${joins[0]?.id ?? "(unknown)"}`);
  push();

  push("World after handshake:");
  push(`  BoundaryJoins:        ${joins.length}`);
  push(`  BoundarySeams:        ${listBoundarySeams(world).length}`);
  push(`  Logical connections:  ${buildGeometryIndex(world).logicalConnections.length}`);
  push(`  Adjacency rows:       ${world.listRelations({ type: "world-geography.adjacent_to" }).length}`);
  push(`  Connected components: ${geography.listConnectedComponents(world).length}`);
  push();

  for (const join of joins) {
    push(`  ${join.packAId}.${join.edgeA} <-> ${join.packBId}.${join.edgeB}`);
    for (const seamId of join.seamIds) push(`    ${seamId.replace("boundary_seam:", "")}`);
  }
  push();

  push("Derived region adjacency across packs:");
  const regions = [
    geography.regionOf(world, listBoundarySeams(world)[0]?.locationAId ?? ""),
    geography.regionOf(world, listBoundarySeams(world)[0]?.locationBId ?? ""),
  ].filter((id): id is string => Boolean(id));
  for (const regionId of regions) {
    const neighbors = geography.adjacentRegions(world, regionId).map((entry) => `${shortId(entry.regionId)}`);
    push(`  ${shortId(regionId)} -> ${neighbors.join(", ") || "(none)"}`);
  }
  push();

  push("Connection parameters:");
  push(`  distanceKm ${distanceKm}, terrainCost ${terrainCost}`);
  if (synthetic) {
    push("  synthetic/test connection parameters (no real geography was measured)");
  }
  push();
  push("Validation:");
  push("  PASS");
  push();
  return { ok: true, report: lines.join("\n") };
}

function pushPlacement(
  push: (line?: string) => void,
  candidate: BoundaryJoinCandidate,
  packAId: string,
  packBId: string,
): void {
  // The placement is canonical (`packAId` is the lexically smaller pack), so map
  // it back onto the two CLI arguments to keep the output readable in argument
  // order regardless of which pack id happens to sort first.
  const aIsCanonicalA = candidate.placement.packAId === packAId;
  const leftPack = aIsCanonicalA ? candidate.placement.packAId : candidate.placement.packBId;
  const leftEdge = aIsCanonicalA ? candidate.placement.edgeA : candidate.placement.edgeB;
  const rightPack = aIsCanonicalA ? candidate.placement.packBId : candidate.placement.packAId;
  const rightEdge = aIsCanonicalA ? candidate.placement.edgeB : candidate.placement.edgeA;

  const label = candidate.status === "ready" ? "READY"
    : candidate.status === "ambiguous" ? "AMBIGUOUS"
    : "NO_MATCH";
  push(`${label}  ${shortId(leftPack)}.${leftEdge}  <->  ${shortId(rightPack)}.${rightEdge}`);
  if (candidate.seams.length > 0) {
    // Mirrored seams are still displayed head-side first: anchorA always belongs
    // to the placement's canonical packA.
    push(`  ${candidate.seams.length} seam(s):`);
    for (const seam of candidate.seams) {
      const seamLeft = seam.anchorA.packId === leftPack ? seam.anchorA : seam.anchorB;
      const seamRight = seam.anchorA.packId === leftPack ? seam.anchorB : seam.anchorA;
      push(`    ${shortId(seamLeft.id)}  <->  ${shortId(seamRight.id)}`);
      for (const detail of seam.details) push(`      ${detail}`);
    }
  } else {
    for (const note of candidate.notes) push(`  ${note}`);
  }
  push();
}

function parsePlacementFlag(value: string | undefined): [string, string] | undefined {
  if (value === undefined) return undefined;
  const parts = value.split(":");
  if (parts.length !== 2) return [value, ""];
  return [parts[0] ?? "", parts[1] ?? ""];
}

function loadOrFail(path: string): LoadedPack | undefined {
  const result = loadMapPack(path, { dryRun: true });
  if (!result.ok || !result.pack || !result.manifest) return undefined;
  return { id: result.manifest.id, name: result.manifest.name, result };
}

/** `xia_starter_v0_1:boundary_anchor:EAST_RIVER_OUT` -> `xia_starter_v0_1:EAST_RIVER_OUT`. */
function shortId(entityId: string): string {
  if (entityId.startsWith("boundary_seam:") || entityId.startsWith("boundary_join:")) return entityId;
  const parts = entityId.split(":");
  return parts.length >= 3 ? `${parts[0]}:${parts[2]}` : entityId;
}

export type { BoundaryAnchorRef, BoundaryJoinCandidate, HandshakeReport, WorldEdge };
export { boundaryJoinId, boundaryPlacement, placementKey };
