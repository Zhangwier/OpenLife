/**
 * File-level import cycles inside packages.
 *
 * A runtime import cycle makes evaluation order matter: a constant read at a
 * module's top level can be in its temporal dead zone depending on which file
 * was imported first. New cycles are forbidden. The one cycle that exists
 * today (settlement-locations: module.ts <-> its autonomy agents) is frozen
 * here and may only shrink; remove files from KNOWN as they are decoupled.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileCycles, fileImportGraph } from "../../scripts/workspace-graph.ts";

const KNOWN = new Set([
  "modules/settlement-locations/src/autonomy/brain.ts",
  "modules/settlement-locations/src/autonomy/npc-cook.ts",
  "modules/settlement-locations/src/autonomy/npc-exchange.ts",
  "modules/settlement-locations/src/autonomy/npc-general.ts",
  "modules/settlement-locations/src/autonomy/npc-reed.ts",
  "modules/settlement-locations/src/autonomy/npc.ts",
  "modules/settlement-locations/src/autonomy/roles.ts",
  "modules/settlement-locations/src/autonomy/village-day.ts",
  "modules/settlement-locations/src/module.ts",
]);

test("the cycle finder sees a real cycle and ignores type-only imports", () => {
  const graph = new Map([
    ["a.ts", ["b.ts"]], ["b.ts", ["c.ts"]], ["c.ts", ["a.ts"]], ["d.ts", ["a.ts"]],
  ]);
  assert.deepEqual(fileCycles(graph), [["a.ts", "b.ts", "c.ts"]]);
  const real = fileImportGraph();
  // content.ts refers to happenings.ts only through an inline type query.
  assert.ok(!(real.get("modules/settlement-locations/src/content.ts") ?? []).includes("modules/settlement-locations/src/happenings.ts"));
});

test("no import cycle exists outside the frozen settlement-locations cluster", () => {
  const problems: string[] = [];
  for (const group of fileCycles(fileImportGraph())) {
    const extra = group.filter((file) => !KNOWN.has(file));
    if (extra.length > 0) problems.push(`new import cycle: ${group.join(" <-> ")}`);
  }
  assert.deepEqual(problems, []);
});

test("vocabulary, barter and the files split out of module.ts are outside the cycle", () => {
  const cyclic = new Set(fileCycles(fileImportGraph()).flat());
  for (const file of ["vocabulary.ts", "barter.ts", "world-reads.ts", "marriage.ts"].map((f) => `modules/settlement-locations/src/${f}`)) {
    assert.equal(cyclic.has(file), false, `${file} must not be part of an import cycle`);
  }
});

test("the frozen list is still accurate (shrink it when a file is decoupled)", () => {
  const cyclic = new Set(fileCycles(fileImportGraph()).flat());
  const decoupled = [...KNOWN].filter((file) => !cyclic.has(file));
  assert.deepEqual(decoupled, [], "these files left the cycle; remove them from KNOWN");
});
