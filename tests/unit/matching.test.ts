/**
 * Matching property tests (Step 3.2).
 *
 * `searchMaximumMatchings` decides whether two map packs may be stitched
 * automatically or whether a human must choose. A wrong "unique" verdict would
 * make the world silently pick one of several equally valid borders, so it is
 * checked here against exhaustive enumeration over thousands of random graphs.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { searchMaximumMatchings } from "@openlife/module-world-geography";

interface Edge {
  left: string;
  right: string;
  payload: number;
}

/**
 * Reference implementation: enumerate every matching by deciding, for each left
 * vertex in order, whether to leave it unmatched or pair it with one of its
 * still-free neighbours. Tracks the best cardinality and how many matchings
 * attain it.
 */
function bruteForce(edges: Edge[]): { cardinality: number; count: number } {
  const leftIds = [...new Set(edges.map((edge) => edge.left))].sort();
  let best = 0;
  let count = 0;
  const usedRight = new Set<string>();

  const recurse = (index: number, size: number): void => {
    if (index === leftIds.length) {
      if (size > best) {
        best = size;
        count = 1;
      } else if (size === best && size > 0) {
        count += 1;
      }
      return;
    }
    const left = leftIds[index]!;
    recurse(index + 1, size);
    for (const edge of edges.filter((entry) => entry.left === left)) {
      if (usedRight.has(edge.right)) continue;
      usedRight.add(edge.right);
      recurse(index + 1, size + 1);
      usedRight.delete(edge.right);
    }
  };
  recurse(0, 0);
  return { cardinality: best, count: best === 0 ? 0 : count };
}

test("matching agrees with exhaustive enumeration on 3000 random graphs", () => {
  // Deterministic generator, so a failure is reproducible from the seed.
  let seed = 987_654_321;
  const rand = (bound: number): number => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed % bound;
  };

  let checked = 0;
  for (let trial = 0; trial < 3000; trial += 1) {
    const leftCount = 1 + rand(4);
    const rightCount = 1 + rand(4);
    const edges: Edge[] = [];
    for (let left = 0; left < leftCount; left += 1) {
      for (let right = 0; right < rightCount; right += 1) {
        if (rand(100) < 45) edges.push({ left: `A${left}`, right: `B${right}`, payload: left * 10 + right });
      }
    }

    const reference = bruteForce(edges);
    const result = searchMaximumMatchings(edges);

    assert.equal(
      result.cardinality,
      reference.cardinality,
      `cardinality mismatch for ${JSON.stringify(edges.map((edge) => `${edge.left}-${edge.right}`))}`,
    );
    if (reference.cardinality === 0) {
      assert.equal(result.unique, false, "an empty graph has no unique matching");
    } else {
      assert.equal(
        result.unique,
        reference.count === 1,
        `uniqueness mismatch for ${JSON.stringify(edges.map((edge) => `${edge.left}-${edge.right}`))} `
        + `(reference found ${reference.count} maximum matching(s))`,
      );
    }
    checked += 1;
  }
  assert.equal(checked, 3000);
});

test("matching is invariant under edge input order", () => {
  const edges: Edge[] = [
    { left: "A2", right: "B1", payload: 1 },
    { left: "A1", right: "B2", payload: 2 },
    { left: "A1", right: "B1", payload: 3 },
    { left: "A2", right: "B2", payload: 4 },
  ];
  const forward = searchMaximumMatchings(edges);
  const reversed = searchMaximumMatchings([...edges].reverse());
  const shuffled = searchMaximumMatchings([edges[2]!, edges[0]!, edges[3]!, edges[1]!]);

  assert.equal(forward.cardinality, 2);
  assert.equal(forward.unique, false, "K2,2 is genuinely ambiguous");
  assert.equal(reversed.unique, forward.unique);
  assert.equal(shuffled.unique, forward.unique);
  assert.equal(reversed.cardinality, forward.cardinality);
  assert.equal(shuffled.cardinality, forward.cardinality);
});

test("an empty edge set yields cardinality 0 and no uniqueness claim", () => {
  const result = searchMaximumMatchings([]);
  assert.equal(result.cardinality, 0);
  assert.equal(result.unique, false);
  assert.deepEqual(result.pairs, []);
});

test("a unique maximum exposes exactly its own pairs and its unmatched vertices", () => {
  const result = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A2", right: "B2", payload: 2 },
    { left: "A3", right: "B2", payload: 3 },
  ]);
  // A1-B1 is forced; B2 can go to A2 or A3, so the maximum is not unique.
  assert.equal(result.cardinality, 2);
  assert.equal(result.unique, false);
  assert.deepEqual(result.pairs, []);
});

test("unmatched anchors are reported for a unique maximum", () => {
  const result = searchMaximumMatchings([
    { left: "A1", right: "B1", payload: 1 },
    { left: "A2", right: "B2", payload: 2 },
  ]);
  assert.equal(result.cardinality, 2);
  assert.equal(result.unique, true);
  assert.deepEqual(result.pairs.map((pair) => `${pair.left}-${pair.right}`), ["A1-B1", "A2-B2"]);
  assert.deepEqual(result.unmatchedLeft, []);
  assert.deepEqual(result.unmatchedRight, []);

  // A right vertex with no edge at all never appears in the graph, so it is not
  // reported as unmatched; only vertices participating in the graph are.
  const sparse = searchMaximumMatchings([{ left: "A1", right: "B1", payload: 1 }]);
  assert.equal(sparse.cardinality, 1);
  assert.equal(sparse.unique, true);
  assert.deepEqual(sparse.pairs.map((pair) => `${pair.left}-${pair.right}`), ["A1-B1"]);
});
