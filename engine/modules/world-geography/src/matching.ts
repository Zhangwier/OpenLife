/**
 * Maximum-cardinality one-to-one matching, with uniqueness detection.
 *
 * The problem: given a compatibility bipartite graph inside one placement, find
 * the largest set of disjoint anchor pairs, and decide whether that largest set
 * is *unique* or whether several equally large sets exist. A unique maximum
 * means the world may be stitched automatically; several equally large maxima
 * means a human must choose, and the protocol must refuse.
 *
 * Scale is tiny (a handful of anchors per border), so this is deterministic
 * bounded search rather than a matching library. The algorithm is written for
 * *certainty about uniqueness*, which is the whole point:
 *
 *   - it fixes its exploration order, so results never depend on input order;
 *   - it computes the true maximum cardinality first;
 *   - it then asks, for each pair used by that matching, whether an equally
 *     large matching exists that does not use it. One such witness proves
 *     non-uniqueness, and searching stops there.
 *
 * The two mistakes this exists to avoid:
 *
 *   1. Stopping at the first two solutions found *anywhere*. Those could both be
 *      smaller than the true maximum. Counting is tied to the best cardinality.
 *   2. Treating "no locally forced edge" as "ambiguous". A chain like
 *      `A1->{B1,B2}, A2->B2` has no globally forced edge yet exactly one maximum
 *      matching; only real search tells that apart from a genuine tie.
 */

export interface MatchingEdge<T> {
  /** Left vertex id. */
  left: string;
  /** Right vertex id. */
  right: string;
  /** Payload carried through to the result for the chosen pairs. */
  payload: T;
}

export interface MatchingResult<T> {
  /** Size of the largest matching, i.e. how many disjoint pairs it contains. */
  cardinality: number;
  /**
   * True when exactly one matching attains `cardinality`. Only then may a
   * caller act automatically.
   */
  unique: boolean;
  /** How many distinct maximum matchings were proven to exist (capped at 2). */
  solutionCount: number;
  /**
   * The chosen matching. Populated only when `unique` is true, because a caller
   * must never act on one of several equally valid answers.
   */
  pairs: MatchingEdge<T>[];
  /** Left vertices the unique matching does not use. */
  unmatchedLeft: string[];
  /** Right vertices the unique matching does not use. */
  unmatchedRight: string[];
}

/**
 * Finds the maximum matching and reports whether it is unique.
 *
 * Returns `cardinality: 0` with `unique: false` when no pair is compatible; a
 * caller distinguishes "nothing to join" from "several ways to join" by the
 * cardinality, not by `unique`.
 */
export function searchMaximumMatchings<T>(edges: MatchingEdge<T>[]): MatchingResult<T> {
  // Fix the exploration order so the answer cannot depend on edge input order.
  const sorted = [...edges].sort(
    (a, b) => a.left.localeCompare(b.left) || a.right.localeCompare(b.right),
  );

  const leftIds = [...new Set(sorted.map((edge) => edge.left))].sort();
  const rightIds = [...new Set(sorted.map((edge) => edge.right))].sort();
  const leftIndex = new Map(leftIds.map((id, index) => [id, index]));
  const rightIndex = new Map(rightIds.map((id, index) => [id, index]));

  // Adjacency in integer indexes; the payload is looked up when pairs are built.
  const neighbours: number[][] = leftIds.map(() => []);
  const payload = new Map<string, T>();
  for (const edge of sorted) {
    const l = leftIndex.get(edge.left)!;
    neighbours[l]!.push(rightIndex.get(edge.right)!);
    payload.set(`${edge.left}\u0000${edge.right}`, edge.payload);
  }
  for (const list of neighbours) list.sort((a, b) => a - b);

  /**
   * Kuhn's augmenting-path step.
   *
   * A single forbidden edge `(blockedLeft, blockedRight)` may be excluded, which
   * is how alternative optima are probed below. Forbidding the *edge* (rather
   * than either endpoint) matters: removing an endpoint would also remove that
   * vertex's other options and could hide a genuinely different matching.
   */
  const augment = (
    left: number,
    visited: boolean[],
    matchOfRight: number[],
    blockedLeft = -1,
    blockedRight = -1,
  ): boolean => {
    for (const right of neighbours[left]!) {
      if (left === blockedLeft && right === blockedRight) continue;
      if (visited[right]) continue;
      visited[right] = true;
      const occupant = matchOfRight[right]!;
      if (occupant === -1 || augment(occupant, visited, matchOfRight, blockedLeft, blockedRight)) {
        matchOfRight[right] = left;
        return true;
      }
    }
    return false;
  };

  /** One maximum matching, right -> left (-1 when unmatched). */
  const maximumMatching = (blockedLeft = -1, blockedRight = -1): number[] => {
    const matchOfRight = new Array<number>(rightIds.length).fill(-1);
    for (let left = 0; left < leftIds.length; left += 1) {
      augment(left, new Array<boolean>(rightIds.length).fill(false), matchOfRight, blockedLeft, blockedRight);
    }
    return matchOfRight;
  };

  const best = maximumMatching();
  const cardinality = best.filter((left) => left !== -1).length;

  if (cardinality === 0) {
    return {
      cardinality: 0,
      unique: false,
      solutionCount: 0,
      pairs: [],
      unmatchedLeft: [...leftIds],
      unmatchedRight: [...rightIds],
    };
  }

  // Pairs of the reference optimum, as (left, right) integer pairs.
  const bestPairs: Array<[number, number]> = [];
  for (let right = 0; right < rightIds.length; right += 1) {
    const left = best[right]!;
    if (left !== -1) bestPairs.push([left, right]);
  }
  bestPairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  /**
   * Uniqueness test.
   *
   * An alternative maximum matching, if any, must differ from `best` somewhere.
   * We therefore try each pair of `best` in turn: forbid that edge, recompute,
   * and see whether a matching of the same size still exists. Equality here does
   * not by itself prove the new matching is *different* (Kuhn may rebuild the
   * same one), so the recomputed matching is compared against `best` before the
   * verdict is drawn. The first genuinely different full-size matching settles
   * it.
   */
  let unique = true;
  for (const [left, right] of bestPairs) {
    const alternative = maximumMatching(left, right);
    if (alternative.filter((value) => value !== -1).length !== cardinality) continue;
    if (!sameMatching(best, alternative)) {
      unique = false;
      break;
    }
  }

  if (!unique) {
    return {
      cardinality,
      unique: false,
      solutionCount: 2,
      pairs: [],
      unmatchedLeft: [],
      unmatchedRight: [],
    };
  }

  const pairs: MatchingEdge<T>[] = [];
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  for (const [left, right] of bestPairs) {
    usedLeft.add(left);
    usedRight.add(right);
    pairs.push({
      left: leftIds[left]!,
      right: rightIds[right]!,
      payload: payload.get(`${leftIds[left]}\u0000${rightIds[right]}`)!,
    });
  }

  return {
    cardinality,
    unique: true,
    solutionCount: 1,
    pairs: pairs.sort((a, b) => a.left.localeCompare(b.left) || a.right.localeCompare(b.right)),
    unmatchedLeft: leftIds.filter((_, index) => !usedLeft.has(index)),
    unmatchedRight: rightIds.filter((_, index) => !usedRight.has(index)),
  };
}

/** True when two right->left matchings assign the same pairs. */
function sameMatching(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}
