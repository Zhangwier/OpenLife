/**
 * Boundary Handshake - the spatial stitching protocol.
 *
 * Four concepts, deliberately kept apart:
 *
 *   **BoundaryAnchor**    an interface point on a pack's edge. Stored fact.
 *   **BoundaryPlacement** *where* one pack sits relative to another:
 *                         `A.east <-> B.west` is a placement; `A.west <-> B.east`
 *                         is a different one. Derived, never stored alone.
 *   **BoundarySeam**      one matched anchor pair inside a placement.
 *   **BoundaryJoin**      the world fact that two packs are stitched under one
 *                         placement; it owns N seams.
 *
 * Discovery is two-phase:
 *
 *   anchor pairs -> compatibility -> group by placement -> one-to-one matching
 *                                -> BoundaryJoinCandidate[]
 *
 * The distinction that matters: **several legal seams on the same border are
 * not an ambiguity** - a river and a road cross the same border together. What
 * genuinely cannot be guessed is *which side of A pack B belongs on*. So the
 * pack-level verdict keys on the number of viable placements, not the number of
 * seams, and a placement is `ready` as long as its anchors can be assigned
 * one-to-one without a tie.
 *
 * What this file deliberately does NOT do:
 *
 *   - It never picks a "best" match, and never scores or ranks candidates.
 *   - It never invents a second connection model. Seams produce the same
 *     `world-geography.adjacent_to` rows a hand-authored edge produces.
 *   - It never touches climate, hydrology, ecology, population or travel. The
 *     `river` tag on a boundary anchor is a spatial label, not a flow model.
 */

import type { Effect, ModuleRegistrationContext, OpenLifeModule, WorldView } from "@openlife/contracts";
import type { GeographyGraphIndex, WorldEdge } from "./geography-graph.ts";
import { buildGeometryIndex } from "./geography-graph.ts";
import {
  buildConnectionEffects,
  buildDisconnectConnectionEffects,
  isConnected,
  validateLocationConnection,
} from "./connection.ts";
import { searchMaximumMatchings } from "./matching.ts";
import {
  GeographyComponents,
  GeographyKinds,
  GeographyRelations,
  isWorldEdge,
  OPPOSITE_EDGE,
  WORLD_EDGES,
} from "./ids.ts";

const OWNER = "boundary-handshake";

export const HandshakeKinds = {
  boundarySeam: "boundary-handshake.boundary_seam",
  boundaryJoin: "boundary-handshake.boundary_join",
} as const;

export const HandshakeComponents = {
  boundarySeam: "boundary-handshake.boundary_seam",
  boundaryJoin: "boundary-handshake.boundary_join",
} as const;

export const HandshakeRelations = {
  /** Seam -> the anchors it joins. */
  stitches: "boundary-handshake.stitches",
  /** Join -> each seam it owns. */
  ownsSeam: "boundary-handshake.owns_seam",
} as const;

export const HandshakeCommands = {
  connectBoundaryJoin: "boundary-handshake.connect_boundary_join",
  disconnectBoundaryJoin: "boundary-handshake.disconnect_boundary_join",
} as const;

export const HandshakeProjections = {
  seams: "boundary-handshake.seams",
  joins: "boundary-handshake.joins",
  handshake: "boundary-handshake.report",
} as const;

/**
 * The asymmetric type pairs a boundary may join.
 *
 * Declared as data, not inferred from names: `river_outlet` meets `river_inlet`
 * because this table says so, never because the strings look related. Symmetric
 * pairs are listed once per direction for lookup simplicity.
 */
export const TYPE_COMPATIBILITY: ReadonlyArray<readonly [string, string]> = [
  ["river_outlet", "river_inlet"],
  ["river_inlet", "river_outlet"],
  ["land_corridor", "land_corridor"],
  ["highland_continuity", "highland_continuity"],
  ["wetland_continuity", "wetland_continuity"],
];

/** Tag families that must agree when both sides declare one. */
const TAG_FAMILIES: ReadonlyArray<readonly string[]> = [
  ["river", "river"],
  ["land", "land"],
  ["highland", "highland"],
  ["mountain", "mountain"],
  ["wetland", "wetland"],
  ["marsh", "marsh"],
];

export type HandshakeVerdict = "compatible" | "incompatible" | "ambiguous";

/** Outcome of evaluating one unordered anchor pair. */
export interface BoundarySeamCandidate {
  anchorA: BoundaryAnchorRef;
  anchorB: BoundaryAnchorRef;
  verdict: HandshakeVerdict;
  /** Short machine-stable slugs, e.g. `opposite-edges`, `type-pair`. */
  reasons: string[];
  /** Human-readable explanation, same order as `reasons`. */
  details: string[];
}

export interface BoundaryAnchorRef {
  id: string;
  packId: string;
  type: string;
  edge: WorldEdge;
  locationId: string;
  compatibilityTags: string[];
  acceptsTypes: string[];
}

/**
 * Verdict for one placement, and for the pack pair overall.
 *
 *   `ready`      exactly one placement, and its anchors assign one-to-one
 *                without a tie. Any number of seams is fine.
 *   `no_match`   no placement has a single viable seam.
 *   `ambiguous`  either several placements are viable (the world does not know
 *                which side of A pack B belongs on), or a placement's anchors
 *                cannot be assigned uniquely.
 */
export type HandshakeStatus = "ready" | "no_match" | "ambiguous";

/**
 * Where one pack sits relative to another.
 *
 * `A.east <-> B.west` and `B.west <-> A.east` are the *same* placement; the
 * canonical form always stores the lexically smaller pack id in `packAId`, so
 * two callers describing the same border produce one identity.
 */
export interface BoundaryPlacement {
  packAId: string;
  edgeA: WorldEdge;
  packBId: string;
  edgeB: WorldEdge;
}

/** One anchor matched to one partner inside a placement. */
export interface SeamCandidate {
  anchorA: BoundaryAnchorRef;
  anchorB: BoundaryAnchorRef;
  /** Compatibility slugs and details from `evaluatePair`. */
  reasons: string[];
  details: string[];
}

/**
 * One viable placement and everything it would stitch.
 *
 * A candidate is only produced when its anchors can be assigned one-to-one
 * deterministically. An unresolvable assignment yields a candidate with
 * `status: "ambiguous"` and an empty `seams` array, so a caller can see *why*
 * the placement exists but cannot be acted on.
 */
export interface BoundaryJoinCandidate {
  placement: BoundaryPlacement;
  status: HandshakeStatus;
  /** The matched pairs, sorted by anchor A id. Empty unless `status === "ready"`. */
  seams: SeamCandidate[];
  /** Every anchor of A on this edge that had at least one compatible partner. */
  contestedAnchors: BoundaryAnchorRef[];
  /** Anchors on either side of this placement that matched nothing. */
  unmatchedAnchors: BoundaryAnchorRef[];
  /** Human-readable explanation of the verdict. */
  notes: string[];
}

export interface HandshakeReport {
  packA: string;
  packB: string;
  status: HandshakeStatus;
  /** Every viable placement, sorted by edge pair then pack ids. */
  candidates: BoundaryJoinCandidate[];
  /** Placements that exist geometrically but produce no legal seam. */
  emptyPlacements: BoundaryPlacement[];
  /**
   * Pairs that were evaluated and rejected. `reasons[reasons.length - 1]` is
   * the rule that actually rejected the pair.
   */
  rejected: BoundarySeamCandidate[];
  /** Anchors with no counterpart anywhere in the other pack. */
  unmatched: BoundaryAnchorRef[];
  anchorsA: BoundaryAnchorRef[];
  anchorsB: BoundaryAnchorRef[];
}

/** Raw per-pair verdict, retained for the rejection histogram and tests. */
export interface BoundarySeamCandidate {
  anchorA: BoundaryAnchorRef;
  anchorB: BoundaryAnchorRef;
  verdict: HandshakeVerdict;
  reasons: string[];
  details: string[];
}

export type HandshakeVerdict = "compatible" | "incompatible" | "ambiguous";

// --- anchor access ---------------------------------------------------------

export function listAnchorsOnEdge(index: GeographyGraphIndex, edge: WorldEdge): BoundaryAnchorRef[] {
  return index.boundaryAnchors
    .filter((anchor) => anchor.edge === edge)
    .map(toRef);
}

export function anchorRef(index: GeographyGraphIndex, anchorId: string): BoundaryAnchorRef | undefined {
  const found = index.boundaryAnchors.find((anchor) => anchor.id === anchorId);
  return found ? toRef(found) : undefined;
}

function toRef(anchor: GeographyGraphIndex["boundaryAnchors"][number]): BoundaryAnchorRef {
  return {
    id: anchor.id,
    packId: anchor.packId,
    type: anchor.type,
    edge: anchor.edge,
    locationId: anchor.locationId,
    compatibilityTags: [...anchor.compatibilityTags],
    acceptsTypes: [...anchor.acceptsTypes],
  };
}

// --- compatibility rules ---------------------------------------------------

/**
 * Evaluates one unordered pair.
 *
 * Rule order matters only for the explanation: every rule is a necessary
 * condition, so a failure anywhere means `incompatible` regardless of order.
 */
export function evaluatePair(a: BoundaryAnchorRef, b: BoundaryAnchorRef): BoundarySeamCandidate {
  const reasons: string[] = [];
  const details: string[] = [];
  const fail = (slug: string, detail: string): BoundarySeamCandidate => {
    reasons.push(slug);
    details.push(detail);
    return { anchorA: a, anchorB: b, verdict: "incompatible", reasons, details };
  };

  if (a.id === b.id) return fail("same-anchor", "an anchor cannot stitch to itself");

  // Rule 1: opposite edges. east meets west, north meets south - never else.
  if (!isWorldEdge(a.edge) || !isWorldEdge(b.edge)) {
    return fail("unknown-edge", `edge must be one of north/east/south/west, got "${a.edge}"/"${b.edge}"`);
  }
  if (OPPOSITE_EDGE[a.edge] !== b.edge) {
    return fail(
      "edge-not-opposite",
      `edges ${a.edge} and ${b.edge} do not face each other (${a.edge} faces ${OPPOSITE_EDGE[a.edge]})`,
    );
  }
  reasons.push("opposite-edges");
  details.push(`opposite edges: ${a.edge}/${b.edge}`);

  // Rule 2: declared type pair, from the table - never guessed from the name.
  if (!TYPE_COMPATIBILITY.some(([x, y]) => x === a.type && y === b.type)) {
    return fail("type-pair-unsupported", `types ${a.type}/${b.type} are not a declared pair`);
  }
  reasons.push("type-pair");
  details.push(`compatible types: ${a.type}/${b.type}`);

  // Rule 3: each side must accept the other's type when it declares a list.
  if (a.acceptsTypes.length > 0 && !a.acceptsTypes.includes(b.type)) {
    return fail("accepts-types", `${a.id} accepts [${a.acceptsTypes.join(", ")}] but not "${b.type}"`);
  }
  if (b.acceptsTypes.length > 0 && !b.acceptsTypes.includes(a.type)) {
    return fail("accepts-types", `${b.id} accepts [${b.acceptsTypes.join(", ")}] but not "${a.type}"`);
  }
  if (a.acceptsTypes.length > 0 || b.acceptsTypes.length > 0) {
    reasons.push("accepts-types-satisfied");
    details.push("declared accepts_types satisfied on both sides");
  }

  // Rule 4: a shared tag family must not contradict. Overlap in at least one
  // declared family is required when *both* sides name a family.
  const familyConflict = findTagFamilyConflict(a.compatibilityTags, b.compatibilityTags);
  if (familyConflict) {
    return fail("tag-family-conflict", familyConflict);
  }
  const shared = sharedTags(a.compatibilityTags, b.compatibilityTags);
  if (shared.length > 0) {
    reasons.push("shared-tag");
    details.push(`compatible tags: ${shared.join(", ")}`);
  } else {
    reasons.push("no-shared-tag");
    details.push("no shared compatibility tag, but no contradiction either");
  }

  return { anchorA: a, anchorB: b, verdict: "compatible", reasons, details };
}

/** True when both sides declare the same family with different members. */
function findTagFamilyConflict(tagsA: string[], tagsB: string[]): string | undefined {
  for (const family of TAG_FAMILIES) {
    const aSide = tagsA.filter((tag) => family.includes(tag));
    const bSide = tagsB.filter((tag) => family.includes(tag));
    if (aSide.length === 0 || bSide.length === 0) continue;
    const overlap = aSide.some((tag) => bSide.includes(tag));
    if (!overlap) {
      return `tags [${aSide.join(", ")}] and [${bSide.join(", ")}] belong to the same family (${family.join("/")}) but disagree`;
    }
  }
  return undefined;
}

function sharedTags(tagsA: string[], tagsB: string[]): string[] {
  return [...new Set(tagsA.filter((tag) => tagsB.includes(tag)))].sort();
}

// --- placement identity ----------------------------------------------------

/**
 * Canonical placement for two packs facing each other.
 *
 * Stores the lexically smaller pack id first so `A.east <-> B.west` and
 * `B.west <-> A.east` collapse onto one identity. Throws when the edges do not
 * face each other, because such a pair is not a placement at all.
 */
export function boundaryPlacement(
  packAId: string,
  edgeA: WorldEdge,
  packBId: string,
  edgeB: WorldEdge,
): BoundaryPlacement {
  if (!isWorldEdge(edgeA) || !isWorldEdge(edgeB)) {
    throw new Error(`placement edges must be world edges, received "${edgeA}"/"${edgeB}"`);
  }
  if (OPPOSITE_EDGE[edgeA] !== edgeB) {
    throw new Error(
      `placement requires opposite edges: ${edgeA} faces ${OPPOSITE_EDGE[edgeA]}, not ${edgeB}`,
    );
  }
  return packAId <= packBId
    ? { packAId, edgeA, packBId, edgeB }
    : { packAId: packBId, edgeA: edgeB, packBId: packAId, edgeB: edgeA };
}

/** Stable, order-independent placement key, e.g. `xia|east::ext|west`. */
export function placementKey(placement: BoundaryPlacement): string {
  return `${placement.packAId}|${placement.edgeA}::${placement.packBId}|${placement.edgeB}`;
}

/** Join identity is the placement identity: one placement, one join. */
export function boundaryJoinId(placement: BoundaryPlacement): string {
  return `boundary_join:${placementKey(placement)}`;
}

export function samePlacement(a: BoundaryPlacement, b: BoundaryPlacement): boolean {
  return placementKey(a) === placementKey(b);
}

// --- discovery -------------------------------------------------------------

/**
 * Two-phase discovery between two packs. **Pure**: reads the world, writes
 * nothing, schedules nothing, never advances the clock.
 *
 * Phase 1 - compatibility: evaluate every cross-pack anchor pair with the same
 *   deterministic rules used before.
 * Phase 2 - placement grouping: bucket the compatible pairs by the placement
 *   they imply (`A.east<->B.west` vs `A.west<->B.east`), then run a one-to-one
 *   assignment inside each bucket.
 */
export function findBoundarySeams(index: GeographyGraphIndex, packA: string, packB: string): HandshakeReport {
  const anchorsA = index.boundaryAnchors.filter((anchor) => anchor.packId === packA).map(toRef);
  const anchorsB = index.boundaryAnchors.filter((anchor) => anchor.packId === packB).map(toRef);

  // ---- phase 1: compatibility ------------------------------------------
  //
  // Every pair is normalised so `anchorA` belongs to the placement's canonical
  // `packAId`, whichever pack the caller listed first. Without this, discovery
  // would be pure but not *order independent*: the same border would describe
  // its seams with the two sides swapped depending on argument order.
  const rejected: BoundarySeamCandidate[] = [];
  const compatiblePairs: SeamCandidate[] = [];
  for (const a of anchorsA) {
    for (const b of anchorsB) {
      const evaluation = evaluatePair(a, b);
      if (evaluation.verdict !== "compatible") {
        rejected.push(evaluation);
        continue;
      }
      const placement = boundaryPlacement(a.packId, a.edge, b.packId, b.edge);
      const [head, tail] = a.packId === placement.packAId ? [a, b] : [b, a];
      compatiblePairs.push({
        anchorA: head,
        anchorB: tail,
        reasons: evaluation.reasons,
        details: evaluation.details,
      });
    }
  }

  // ---- phase 2: group by placement -------------------------------------
  const buckets = new Map<string, SeamCandidate[]>();
  const emptyPlacements: BoundaryPlacement[] = [];
  for (const pair of compatiblePairs) {
    const placement = boundaryPlacement(pair.anchorA.packId, pair.anchorA.edge, pair.anchorB.packId, pair.anchorB.edge);
    const key = placementKey(placement);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(pair);
    else buckets.set(key, [pair]);
  }

  // Edges that face each other but yielded no compatible pair at all. They are
  // reported so an operator can see "these packs could sit this way, but no
  // anchor would connect" rather than silence.
  for (const edgeA of WORLD_EDGES) {
    const edgeB = OPPOSITE_EDGE[edgeA];
    if (!anchorsA.some((anchor) => anchor.edge === edgeA)) continue;
    if (!anchorsB.some((anchor) => anchor.edge === edgeB)) continue;
    const placement = boundaryPlacement(packA, edgeA, packB, edgeB);
    if (!buckets.has(placementKey(placement))) emptyPlacements.push(placement);
  }

  const candidates = [...buckets.values()]
    .map((pairs) => analysePlacement(pairs))
    .sort((x, y) => placementKey(x.placement).localeCompare(placementKey(y.placement)));

  // ---- overall verdict --------------------------------------------------
  //
  // The pack-level question is *placement* ambiguity, not seam count: several
  // seams on one border are normal (a river and a road cross together), but two
  // viable borders mean the world cannot tell which side of A pack B belongs on.
  //
  // A placement with contested anchors is a real finding even though it yields
  // no seams, so it counts as something that exists and blocks a `ready` verdict
  // rather than being folded into `no_match`.
  const viable = candidates.filter((entry) => entry.seams.length > 0);
  const blocked = candidates.filter((entry) => entry.status === "ambiguous" && entry.contestedAnchors.length > 0);

  const status: HandshakeStatus = viable.length === 0 && blocked.length === 0
    ? "no_match"
    : viable.length === 1 && blocked.length === 0
      ? "ready"
      : "ambiguous";

  // An anchor is "unmatched" when it has no compatible counterparty anywhere in
  // the other pack. Because phase 1 normalises which side is `anchorA`, the two
  // roles are collected together rather than queried per side.
  const matchedAnywhere = new Set<string>();
  for (const pair of compatiblePairs) {
    matchedAnywhere.add(pair.anchorA.id);
    matchedAnywhere.add(pair.anchorB.id);
  }
  const unmatched = [
    ...anchorsA.filter((anchor) => !matchedAnywhere.has(anchor.id)),
    ...anchorsB.filter((anchor) => !matchedAnywhere.has(anchor.id)),
  ].sort((a, b) => a.id.localeCompare(b.id));

  return { packA, packB, status, candidates, emptyPlacements, rejected, unmatched, anchorsA, anchorsB };
}

/**
 * Assigns one-to-one matches inside a placement.
 *
 * This is a genuine **maximum-cardinality bipartite matching** over the
 * compatibility graph, not a local forced-edge heuristic. The distinction
 * matters: a chain like `A1->{B1,B2}, A2->B2` has no globally forced edge, yet
 * exactly one maximum matching exists, so a heuristic would wrongly call it
 * ambiguous. Conversely `K2,2` has several equally large maxima and a heuristic
 * could wrongly pick one.
 *
 * Verdicts follow the matching result directly:
 *
 *   cardinality 0   -> `no_match`
 *   unique maximum  -> `ready`, that matching becomes the seam set
 *   several maxima  -> `ambiguous`, and **no** seams are emitted
 *
 * Unmatched anchors are legal: a boundary anchor declares an interface, and not
 * every interface must be consumed by every neighbour.
 */
function analysePlacement(pairs: SeamCandidate[]): BoundaryJoinCandidate {
  const placement = boundaryPlacement(
    pairs[0]!.anchorA.packId,
    pairs[0]!.anchorA.edge,
    pairs[0]!.anchorB.packId,
    pairs[0]!.anchorB.edge,
  );

  const matching = searchMaximumMatchings<SeamCandidate>(
    pairs.map((pair) => ({ left: pair.anchorA.id, right: pair.anchorB.id, payload: pair })),
  );

  const byId = new Map(pairs.map((pair) => [`${pair.anchorA.id}\u0000${pair.anchorB.id}`, pair]));
  const chosenSeams = matching.pairs
    .map((pair) => byId.get(`${pair.left}\u0000${pair.right}`))
    .filter((pair): pair is SeamCandidate => pair !== undefined)
    .sort((x, y) => x.anchorA.id.localeCompare(y.anchorA.id));

  const idToAnchor = new Map<string, BoundaryAnchorRef>();
  for (const pair of pairs) {
    idToAnchor.set(pair.anchorA.id, pair.anchorA);
    idToAnchor.set(pair.anchorB.id, pair.anchorB);
  }

  const notes: string[] = [];
  let status: HandshakeStatus;

  if (matching.cardinality === 0) {
    status = "no_match";
    notes.push("no compatible anchor pair on this border");
  } else if (matching.unique) {
    status = "ready";
    notes.push(
      `${matching.cardinality} seam(s) form the only maximum matching on this border`
      + (matching.unmatchedLeft.length + matching.unmatchedRight.length > 0
        ? `; ${matching.unmatchedLeft.length + matching.unmatchedRight.length} anchor(s) left unstitched`
        : ""),
    );
  } else {
    status = "ambiguous";
    notes.push(
      `several distinct matchings of size ${matching.cardinality} exist on this border; `
      + "the protocol refuses to choose one",
    );
  }

  // When ambiguous, report every anchor that takes part in the open choice, so
  // an operator can see exactly which decision is unresolved. `matching.pairs`
  // is empty for a non-unique result, so the set is derived from the
  // compatibility graph: an anchor is contested when it, or any partner of its,
  // has more than one compatible counterparty.
  const contestedAnchors: BoundaryAnchorRef[] = [];
  if (status === "ambiguous") {
    const partnerCount = new Map<string, number>();
    for (const pair of pairs) {
      partnerCount.set(pair.anchorA.id, (partnerCount.get(pair.anchorA.id) ?? 0) + 1);
      partnerCount.set(pair.anchorB.id, (partnerCount.get(pair.anchorB.id) ?? 0) + 1);
    }
    const contestedIds = new Set<string>();
    for (const pair of pairs) {
      const aCount = partnerCount.get(pair.anchorA.id) ?? 0;
      const bCount = partnerCount.get(pair.anchorB.id) ?? 0;
      if (aCount > 1 || bCount > 1) {
        contestedIds.add(pair.anchorA.id);
        contestedIds.add(pair.anchorB.id);
      }
    }
    for (const id of [...contestedIds].sort()) {
      const anchor = idToAnchor.get(id);
      if (anchor) contestedAnchors.push(anchor);
    }
  }

  const unmatchedAnchors = status === "ready"
    ? [...matching.unmatchedLeft, ...matching.unmatchedRight]
      .map((id) => idToAnchor.get(id))
      .filter((anchor): anchor is BoundaryAnchorRef => anchor !== undefined)
    : [];

  return {
    placement,
    status,
    // A contested placement contributes no seams: a caller must never act on a
    // partial guess. The all-or-nothing rule is what keeps a border coherent.
    seams: status === "ready" ? chosenSeams : [],
    contestedAnchors,
    unmatchedAnchors: unmatchedAnchors.sort((x, y) => x.id.localeCompare(y.id)),
    notes,
  };
}

// --- seam identity ---------------------------------------------------------

/**
 * Seam identity is derived from the two anchor ids, sorted, so that
 * (A, B) and (B, A) produce the same id. This is what makes connecting the
 * same pair twice idempotent rather than duplicative.
 */
export function boundarySeamId(anchorIdA: string, anchorIdB: string): string {
  const [first, second] = [anchorIdA, anchorIdB].sort();
  return `boundary_seam:${first}|${second}`;
}

export interface BoundarySeamSnapshot {
  id: string;
  anchorAId: string;
  anchorBId: string;
  locationAId: string;
  locationBId: string;
}

export function listBoundarySeams(world: WorldView): BoundarySeamSnapshot[] {
  return world
    .listEntities({ kind: HandshakeKinds.boundarySeam })
    .map(seamSnapshot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getBoundarySeam(world: WorldView, anchorIdA: string, anchorIdB: string): BoundarySeamSnapshot | undefined {
  const wanted = boundarySeamId(anchorIdA, anchorIdB);
  return listBoundarySeams(world).find((seam) => seam.id === wanted);
}

function seamSnapshot(entity: {
  id: string;
  components: Record<string, Record<string, unknown>>;
}): BoundarySeamSnapshot {
  const data = entity.components[HandshakeComponents.boundarySeam] ?? {};
  return {
    id: entity.id,
    anchorAId: String(data.anchorAId ?? ""),
    anchorBId: String(data.anchorBId ?? ""),
    locationAId: String(data.locationAId ?? ""),
    locationBId: String(data.locationBId ?? ""),
  };
}

// --- join model ------------------------------------------------------------

export interface BoundaryJoinSnapshot {
  id: string;
  packAId: string;
  edgeA: WorldEdge;
  packBId: string;
  edgeB: WorldEdge;
  /** Seam ids owned by this join, sorted. */
  seamIds: string[];
}

export function listBoundaryJoins(world: WorldView): BoundaryJoinSnapshot[] {
  return world
    .listEntities({ kind: HandshakeKinds.boundaryJoin })
    .map(joinSnapshot)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getBoundaryJoin(world: WorldView, placement: BoundaryPlacement): BoundaryJoinSnapshot | undefined {
  const wanted = boundaryJoinId(placement);
  return listBoundaryJoins(world).find((join) => join.id === wanted);
}

/** The join, if any, that already links these two packs - under any placement. */
export function findJoinBetweenPacks(world: WorldView, packAId: string, packBId: string): BoundaryJoinSnapshot | undefined {
  return listBoundaryJoins(world).find(
    (join) => (join.packAId === packAId && join.packBId === packBId)
      || (join.packAId === packBId && join.packBId === packAId),
  );
}

function joinSnapshot(entity: {
  id: string;
  components: Record<string, Record<string, unknown>>;
}): BoundaryJoinSnapshot {
  const data = entity.components[HandshakeComponents.boundaryJoin] ?? {};
  const seamIds = Array.isArray(data.seamIds) ? data.seamIds.map((id) => String(id)) : [];
  return {
    id: entity.id,
    packAId: String(data.packAId ?? ""),
    edgeA: String(data.edgeA ?? "") as WorldEdge,
    packBId: String(data.packBId ?? ""),
    edgeB: String(data.edgeB ?? "") as WorldEdge,
    seamIds: [...seamIds].sort(),
  };
}

// --- effects ---------------------------------------------------------------

/**
 * Builds the effects that install one seam.
 *
 * Everything is `announce: false` for the geography relation so the transaction
 * stays quiet; the seam entity itself is created without a spawn event, and a
 * single explicit `boundary-handshake.seam_established` event carries the
 * history-worthy fact instead.
 *
 * Each seam writes exactly one ordinary geography connection pair. There is no
 * special cross-pack edge type, which is precisely why `world-geography` needs
 * no knowledge of stitching.
 */
/**
 * Builds the effects that install one seam.
 *
 * The geography connection itself comes from the shared connection primitive in
 * `connection.ts`, so a seam produces byte-identical rows to a hand-authored map
 * edge. The seam entity is created without a spawn event and a single explicit
 * `seam_established` event carries the history-worthy fact instead.
 */
export function seamEffects(input: {
  anchorA: BoundaryAnchorRef;
  anchorB: BoundaryAnchorRef;
  distanceKm: number;
  terrainCost: number;
  tick: number;
}): Effect[] {
  const { anchorA, anchorB } = input;
  const seamId = boundarySeamId(anchorA.id, anchorB.id);
  return [
    {
      kind: "spawnEntity",
      localId: `seam:${seamId}`,
      id: seamId,
      entityKind: HandshakeKinds.boundarySeam,
      components: {
        [HandshakeComponents.boundarySeam]: {
          anchorAId: anchorA.id,
          anchorBId: anchorB.id,
          locationAId: anchorA.locationId,
          locationBId: anchorB.locationId,
          edgeA: anchorA.edge,
          edgeB: anchorB.edge,
          typeA: anchorA.type,
          typeB: anchorB.type,
          distanceKm: input.distanceKm,
          terrainCost: input.terrainCost,
          establishedAt: input.tick,
        },
      },
      announce: false,
    },
    // Ordinary geography connection, from the shared builder.
    ...buildConnectionEffects(anchorA.locationId, anchorB.locationId, {
      distanceKm: input.distanceKm,
      terrainCost: input.terrainCost,
      via: seamId,
    }),
    {
      kind: "emitEvent",
      eventType: "boundary-handshake.seam_established",
      actorId: seamId,
      data: {
        seamId,
        anchorAId: anchorA.id,
        anchorBId: anchorB.id,
        locationAId: anchorA.locationId,
        locationBId: anchorB.locationId,
        distanceKm: input.distanceKm,
        terrainCost: input.terrainCost,
      },
      historicalSignificance: 0.6,
      visibility: "public",
      dedupeKey: `seam:${seamId}`,
    },
  ];
}

/**
 * Effects for one whole join: the join entity, every seam it owns, and the
 * relations binding them together.
 *
 * All of this lands in a single transaction, so a join is either fully present
 * or entirely absent. That is why the seam loop below appends into one effect
 * array rather than issuing a command per seam - a per-seam command would let
 * the second seam fail after the first had already committed, leaving half a
 * border stitched.
 */
export function joinEffects(input: {
  placement: BoundaryPlacement;
  seams: SeamCandidate[];
  distanceKm: number;
  terrainCost: number;
  tick: number;
}): Effect[] {
  const joinId = boundaryJoinId(input.placement);
  const effects: Effect[] = [];

  const seamIds: string[] = [];
  for (const seam of input.seams) {
    const seamId = boundarySeamId(seam.anchorA.id, seam.anchorB.id);
    seamIds.push(seamId);
    effects.push(...seamEffects({
      anchorA: seam.anchorA,
      anchorB: seam.anchorB,
      distanceKm: input.distanceKm,
      terrainCost: input.terrainCost,
      tick: input.tick,
    }));
  }

  effects.push({
    kind: "spawnEntity",
    localId: "join",
    id: joinId,
    entityKind: HandshakeKinds.boundaryJoin,
    components: {
      [HandshakeComponents.boundaryJoin]: {
        packAId: input.placement.packAId,
        edgeA: input.placement.edgeA,
        packBId: input.placement.packBId,
        edgeB: input.placement.edgeB,
        seamIds,
        distanceKm: input.distanceKm,
        terrainCost: input.terrainCost,
        establishedAt: input.tick,
      },
    },
    announce: false,
  });

  for (const seamId of seamIds) {
    effects.push({
      kind: "addRelation",
      type: HandshakeRelations.ownsSeam,
      from: joinId,
      to: seamId,
      announce: false,
    });
  }
  for (const seam of input.seams) {
    const seamId = boundarySeamId(seam.anchorA.id, seam.anchorB.id);
    effects.push({
      kind: "addRelation",
      type: HandshakeRelations.stitches,
      from: seamId,
      to: seam.anchorA.id,
      announce: false,
    }, {
      kind: "addRelation",
      type: HandshakeRelations.stitches,
      from: seamId,
      to: seam.anchorB.id,
      announce: false,
    });
  }

  effects.push({
    kind: "emitEvent",
    eventType: "boundary-handshake.join_established",
    actorId: joinId,
    data: {
      joinId,
      packAId: input.placement.packAId,
      edgeA: input.placement.edgeA,
      packBId: input.placement.packBId,
      edgeB: input.placement.edgeB,
      seamIds,
      seamCount: seamIds.length,
      distanceKm: input.distanceKm,
      terrainCost: input.terrainCost,
    },
    historicalSignificance: 0.7,
    visibility: "public",
    dedupeKey: `join:${joinId}`,
  });

  return effects;
}

// --- module ----------------------------------------------------------------

export interface HandshakeApi {
  /** Deduplicated, symmetric seam id for an anchor pair. */
  seamIdFor(anchorIdA: string, anchorIdB: string): string;
  /** Order-independent placement identity, e.g. `A.east <-> B.west`. */
  placementFor(packAId: string, edgeA: WorldEdge, packBId: string, edgeB: WorldEdge): BoundaryPlacement;
  /** Join identity derived from a placement. */
  joinIdFor(placement: BoundaryPlacement): string;
  /** Two-phase candidate discovery between two packs. Pure. */
  findBoundarySeams(index: GeographyGraphIndex, packA: string, packB: string): HandshakeReport;
  /** Evaluate a single pair without touching the world. */
  evaluatePair(a: BoundaryAnchorRef, b: BoundaryAnchorRef): BoundarySeamCandidate;
  /** Every seam currently established in the world. */
  listSeams(world: WorldView): BoundarySeamSnapshot[];
  /** Every join currently established in the world. */
  listJoins(world: WorldView): BoundaryJoinSnapshot[];
  /** The join linking these two packs, under any placement. */
  findJoinBetweenPacks(world: WorldView, packAId: string, packBId: string): BoundaryJoinSnapshot | undefined;
}

export const boundaryHandshakeModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Boundary Handshake",
    description: "Discovers compatible BoundaryAnchors between map packs and stitches them with an ordinary geography connection.",
    requires: ["world.geography"],
    provides: ["world.boundary-handshake"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const api: HandshakeApi = {
      seamIdFor: boundarySeamId,
      placementFor: boundaryPlacement,
      joinIdFor: boundaryJoinId,
      findBoundarySeams,
      evaluatePair,
      listSeams: listBoundarySeams,
      listJoins: listBoundaryJoins,
      findJoinBetweenPacks,
    };
    ctx.provideCapability("world.boundary-handshake", api);

    ctx.registerComponent({
      id: HandshakeComponents.boundarySeam,
      persist: true,
      description: "One matched boundary anchor pair: a concrete interface between two map packs.",
    });
    ctx.registerComponent({
      id: HandshakeComponents.boundaryJoin,
      persist: true,
      description: "The world fact that two map packs are stitched under one placement; owns every seam on that border.",
    });
    ctx.registerRelation({
      id: HandshakeRelations.stitches,
      allowedFrom: [HandshakeKinds.boundarySeam],
      allowedTo: [GeographyKinds.boundaryAnchor],
      persist: true,
      description: "A seam stitches two boundary anchors; the reverse direction is a free lookup.",
    });
    ctx.registerRelation({
      id: HandshakeRelations.ownsSeam,
      allowedFrom: [HandshakeKinds.boundaryJoin],
      allowedTo: [HandshakeKinds.boundarySeam],
      persist: true,
      description: "A join owns the seams that realize its placement.",
    });

    ctx.registerCommand({
      type: HandshakeCommands.connectBoundaryJoin,
      description: "Stitch two map packs under one placement, creating every seam on that border atomically.",
    });
    ctx.registerCommand({
      type: HandshakeCommands.disconnectBoundaryJoin,
      description: "Remove one boundary join with all its seams and the connections they created.",
    });

    registerConnectRules(ctx);
    registerDisconnectRules(ctx);

    ctx.registerProjection({
      id: HandshakeProjections.seams,
      description: "Every established boundary seam with the anchors and locations it joins.",
      build: ({ world }) => ({ count: listBoundarySeams(world).length, seams: listBoundarySeams(world) }),
    });

    ctx.registerProjection({
      id: HandshakeProjections.joins,
      description: "Every established boundary join, with its placement and the seams it owns.",
      build: ({ world }) => ({ count: listBoundaryJoins(world).length, joins: listBoundaryJoins(world) }),
    });

    ctx.registerProjection({
      id: HandshakeProjections.handshake,
      description: "Two-phase candidate discovery between two map packs. Read-only: it never writes a join.",
      build: ({ world, params }) => {
        const packA = typeof params.packA === "string" ? params.packA : "";
        const packB = typeof params.packB === "string" ? params.packB : "";
        if (!packA || !packB) return { error: "packA and packB are required" };
        const report = findBoundarySeams(buildGeometryIndex(world), packA, packB);
        return {
          packA: report.packA,
          packB: report.packB,
          status: report.status,
          placements: report.candidates.map((candidate) => ({
            placement: candidate.placement,
            status: candidate.status,
            seams: candidate.seams.map((seam) => ({
              anchorA: seam.anchorA.id,
              anchorB: seam.anchorB.id,
              reasons: seam.reasons,
            })),
            contestedAnchors: candidate.contestedAnchors.map((anchor) => anchor.id),
            notes: candidate.notes,
          })),
          emptyPlacements: report.emptyPlacements,
          unmatched: report.unmatched.map((anchor) => anchor.id),
        };
      },
    });
  },
};

import type { ModuleRegistrationContext } from "@openlife/contracts";


import type { ModuleRegistrationContext } from "@openlife/contracts";

/**
 * Builds the placement a connect request is asking for.
 *
 * A join is always made *under an explicit placement*: the caller states where
 * pack B sits relative to pack A, and the command then stitches every seam that
 * placement resolves to. There is no way to stitch one anchor pair while
 * leaving the surrounding border undecided.
 */
function requestedPlacement(payload: Record<string, unknown>): BoundaryPlacement | undefined {
  const packAId = String(payload.packAId ?? "");
  const packBId = String(payload.packBId ?? "");
  const edgeA = String(payload.edgeA ?? "");
  const edgeB = String(payload.edgeB ?? "");
  if (!packAId || !packBId || !edgeA || !edgeB) return undefined;
  if (!isWorldEdge(edgeA) || !isWorldEdge(edgeB)) return undefined;
  if (OPPOSITE_EDGE[edgeA] !== edgeB) return undefined;
  return boundaryPlacement(packAId, edgeA, packBId, edgeB);
}

function registerConnectRules(ctx: ModuleRegistrationContext): void {
  ctx.registerConstraintRule({
    id: `${HandshakeCommands.connectBoundaryJoin}.allowed`,
    commandType: HandshakeCommands.connectBoundaryJoin,
    evaluate: (c) => {
      const payload = c.command.payload as Record<string, unknown>;
      const placement = requestedPlacement(payload);
      if (!placement) {
        const edgeA = String(payload.edgeA ?? "");
        const edgeB = String(payload.edgeB ?? "");
        if (edgeA && edgeB && isWorldEdge(edgeA) && isWorldEdge(edgeB) && OPPOSITE_EDGE[edgeA] !== edgeB) {
          return {
            ok: false,
            code: "E_HANDSHAKE_PLACEMENT_INVALID",
            message: `placement edges must face each other: ${edgeA} faces ${OPPOSITE_EDGE[edgeA]}, not ${edgeB}`,
          };
        }
        return {
          ok: false,
          code: "E_HANDSHAKE_PLACEMENT_INVALID",
          message: "connect_boundary_join requires packAId, packBId, edgeA and edgeB",
        };
      }

      // Idempotency: the same placement, described from either side, is one join.
      if (getBoundaryJoin(c.world, placement)) {
        return {
          ok: false,
          code: "E_HANDSHAKE_ALREADY_CONNECTED",
          message: `these packs are already joined under placement ${placementKey(placement)}`,
        };
      }

      // Conflicting placement: two packs may not appear on two sides of each
      // other. The flat world model has exactly one relative position per pair.
      const conflicting = findJoinBetweenPacks(c.world, placement.packAId, placement.packBId);
      if (conflicting) {
        return {
          ok: false,
          code: "E_HANDSHAKE_PLACEMENT_CONFLICT",
          message:
            `${placement.packAId} and ${placement.packBId} are already joined as `
            + `${conflicting.packAId}.${conflicting.edgeA} <-> ${conflicting.packBId}.${conflicting.edgeB}; `
            + `cannot also join them as ${placementKey(placement)}`,
          details: { existingJoinId: conflicting.id },
        };
      }

      const index = buildGeometryIndex(c.world);
      const candidate = findCandidateForPlacement(index, placement);
      if (!candidate) {
        return {
          ok: false,
          code: "E_HANDSHAKE_NO_SEAMS",
          message: `no compatible boundary anchor pair exists for placement ${placementKey(placement)}`,
        };
      }
      if (candidate.status === "ambiguous") {
        return {
          ok: false,
          code: "E_HANDSHAKE_AMBIGUOUS",
          message: `placement ${placementKey(placement)} has no unique anchor assignment: `
            + candidate.contestedAnchors.map((anchor) => anchor.id).join(", "),
        };
      }
      if (candidate.seams.length === 0) {
        return {
          ok: false,
          code: "E_HANDSHAKE_NO_SEAMS",
          message: `placement ${placementKey(placement)} resolved to zero seams`,
        };
      }

      // One-to-one: an anchor may carry at most one seam inside a join.
      const degreeA = new Map<string, number>();
      const degreeB = new Map<string, number>();
      for (const seam of candidate.seams) {
        degreeA.set(seam.anchorA.id, (degreeA.get(seam.anchorA.id) ?? 0) + 1);
        degreeB.set(seam.anchorB.id, (degreeB.get(seam.anchorB.id) ?? 0) + 1);
      }
      for (const [anchorId, degree] of [...degreeA, ...degreeB]) {
        if (degree > 1) {
          return {
            ok: false,
            code: "E_HANDSHAKE_ANCHOR_REUSED",
            message: `boundary anchor ${anchorId} appears in ${degree} seams; at most one is allowed per join`,
          };
        }
      }

      // A seam must not already exist, and the two locations must not already be
      // connected by an ordinary map edge. Those are different world facts: an
      // existing spatial connection does not mean a boundary seam was ever
      // established, so the join must not quietly adopt it.
      for (const seam of candidate.seams) {
        if (getBoundarySeam(c.world, seam.anchorA.id, seam.anchorB.id)) {
          return {
            ok: false,
            code: "E_HANDSHAKE_ALREADY_CONNECTED",
            message: `${seam.anchorA.id} and ${seam.anchorB.id} are already stitched`,
          };
        }
        if (isConnected(c.world, seam.anchorA.locationId, seam.anchorB.locationId)) {
          return {
            ok: false,
            code: "E_HANDSHAKE_CONNECTION_EXISTS",
            message:
              `${seam.anchorA.locationId} and ${seam.anchorB.locationId} are already connected by an `
              + "ordinary geography edge, so this seam cannot be established without duplicating it",
          };
        }
      }

      // Every seam must pass the shared connection rules before any is written.
      for (const seam of candidate.seams) {
        const check = validateLocationConnection(
          c.world,
          seam.anchorA.locationId,
          seam.anchorB.locationId,
          {
            distanceKm: positiveOr(c.command.payload.distanceKm, 1),
            terrainCost: positiveOr(c.command.payload.terrainCost, 1),
          },
        );
        if (!check.ok) {
          return {
            ok: false,
            code: check.rejection!.code,
            message: `seam ${seam.anchorA.id} <-> ${seam.anchorB.id} rejected: ${check.rejection!.message}`,
          };
        }
      }

      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${HandshakeCommands.connectBoundaryJoin}.resolve`,
    commandType: HandshakeCommands.connectBoundaryJoin,
    resolve: (c) => {
      const placement = requestedPlacement(c.command.payload as Record<string, unknown>)!;
      const index = buildGeometryIndex(c.world);
      const candidate = findCandidateForPlacement(index, placement)!;
      const distanceKm = positiveOr(c.command.payload.distanceKm, 1);
      const terrainCost = positiveOr(c.command.payload.terrainCost, 1);

      // Every seam of the placement goes into one effect batch, so the kernel
      // commits the whole border or none of it.
      return joinEffects({
        placement,
        seams: candidate.seams,
        distanceKm,
        terrainCost,
        tick: c.world.tick,
      });
    },
  });
}

/**
 * Looks up the discovery candidate for an explicit placement, if one exists.
 *
 * Discovery keys its candidates by canonical placement (lexically smaller pack
 * id first), so this searches both pack orders and matches on the canonical key.
 * Without that, a caller describing `A.east <-> B.west` could miss the very
 * candidate discovery produced for `B.west <-> A.east`.
 */
function findCandidateForPlacement(
  index: GeographyGraphIndex,
  placement: BoundaryPlacement,
): BoundaryJoinCandidate | undefined {
  const wanted = placementKey(placement);
  for (const [first, second] of [
    [placement.packAId, placement.packBId],
    [placement.packBId, placement.packAId],
  ] as const) {
    const report = findBoundarySeams(index, first, second);
    const found = report.candidates.find((candidate) => placementKey(candidate.placement) === wanted);
    if (found) return found;
  }
  return undefined;
}

function registerDisconnectRules(ctx: ModuleRegistrationContext): void {
  ctx.registerConstraintRule({
    id: `${HandshakeCommands.disconnectBoundaryJoin}.allowed`,
    commandType: HandshakeCommands.disconnectBoundaryJoin,
    evaluate: (c) => {
      const payload = c.command.payload as Record<string, unknown>;
      let joinId = String(payload.joinId ?? "");
      if (!joinId) {
        const placement = requestedPlacement(payload);
        if (placement) joinId = boundaryJoinId(placement);
      }
      if (!joinId || !c.world.hasEntity(joinId)) {
        return { ok: false, code: "E_HANDSHAKE_UNKNOWN_JOIN", message: `unknown boundary join: ${joinId}` };
      }
      const join = joinSnapshot(
        c.world.getEntity(joinId) as { id: string; components: Record<string, Record<string, unknown>> },
      );
      if (join.seamIds.length === 0) {
        return { ok: false, code: "E_HANDSHAKE_EMPTY_JOIN", message: `boundary join ${joinId} owns no seams` };
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${HandshakeCommands.disconnectBoundaryJoin}.resolve`,
    commandType: HandshakeCommands.disconnectBoundaryJoin,
    resolve: (c) => {
      const payload = c.command.payload as Record<string, unknown>;
      let joinId = String(payload.joinId ?? "");
      if (!joinId) {
        const placement = requestedPlacement(payload);
        if (placement) joinId = boundaryJoinId(placement);
      }
      const join = joinSnapshot(
        c.world.getEntity(joinId) as { id: string; components: Record<string, Record<string, unknown>> },
      );
      const reason = typeof payload.reason === "string" ? payload.reason : "boundary join dissolved";

      const effects: Effect[] = [];
      for (const seamId of join.seamIds) {
        const entity = c.world.getEntity(seamId);
        if (!entity) continue;
        const seam = seamSnapshot(entity as { id: string; components: Record<string, Record<string, unknown>> });

        effects.push(
          // Shared deletion semantics: same symmetric pair the primitive writes.
          ...buildDisconnectConnectionEffects(seam.locationAId, seam.locationBId, reason),
          {
            kind: "removeRelation",
            type: HandshakeRelations.ownsSeam,
            from: joinId,
            to: seamId,
            reason,
            announce: false,
          },
        );
        for (const anchorId of [seam.anchorAId, seam.anchorBId]) {
          if (!anchorId) continue;
          effects.push({
            kind: "removeRelation",
            type: HandshakeRelations.stitches,
            from: seamId,
            to: anchorId,
            reason,
            announce: false,
          });
        }
        effects.push({ kind: "archiveEntity", entityId: seamId, reason, announce: false });
      }

      effects.push({ kind: "archiveEntity", entityId: joinId, reason, announce: false });
      effects.push({
        kind: "emitEvent",
        eventType: "boundary-handshake.join_dissolved",
        actorId: joinId,
        data: { joinId, seamIds: join.seamIds, reason },
        historicalSignificance: 0.5,
        visibility: "public",
      });
      return effects;
    },
  });
}

function positiveOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
