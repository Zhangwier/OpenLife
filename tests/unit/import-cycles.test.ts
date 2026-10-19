/**
 * File-level import cycles inside packages.
 *
 * A runtime import cycle makes evaluation order matter: a constant read at a
 * module's top level can be in its temporal dead zone depending on which file
 * was imported first. There are none left (the settlement-locations cluster
 * of module.ts <-> its autonomy agents was broken by moving the shared world
 * reads into village-reads.ts), so any cycle at all now fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileCycles, fileImportGraph } from "../../scripts/workspace-graph.ts";

const SETTLEMENT = "modules/settlement-locations/src";

test("the cycle finder sees a real cycle and ignores type-only imports", () => {
  const graph = new Map([
    ["a.ts", ["b.ts"]], ["b.ts", ["c.ts"]], ["c.ts", ["a.ts"]], ["d.ts", ["a.ts"]],
  ]);
  assert.deepEqual(fileCycles(graph), [["a.ts", "b.ts", "c.ts"]]);
  const real = fileImportGraph();
  // content.ts refers to happenings.ts only through an inline type query.
  assert.ok(!(real.get("modules/settlement-locations/src/content.ts") ?? []).includes("modules/settlement-locations/src/happenings.ts"));
});

test("no file-level import cycle exists anywhere", () => {
  const problems = fileCycles(fileImportGraph()).map((group) => `import cycle: ${group.join(" <-> ")}`);
  assert.deepEqual(problems, []);
});

test("the village agents and the shared reads never import the settlement rules", () => {
  // module.ts runs the village-day agent, so the agents (and the reads they
  // use) importing module.ts back is exactly how the old cycle formed.
  const graph = fileImportGraph();
  const rules = `${SETTLEMENT}/module.ts`;
  const offenders = [...graph].filter(([file, deps]) =>
    (file.startsWith(`${SETTLEMENT}/autonomy/`) || file === `${SETTLEMENT}/village-reads.ts`) && deps.includes(rules)
  ).map(([file]) => file);
  assert.deepEqual(offenders, []);
});

test("module.ts still re-exports the reads it used to own", async () => {
  const rules = await import("../../modules/settlement-locations/src/module.ts");
  const reads = await import("../../modules/settlement-locations/src/village-reads.ts");
  for (const name of ["dailyActivity", "currentYields", "carrying", "roofState", "wornWrap", "seasonOf",
    "activityCostFor", "openRequest", "favourOwed", "tradeableGoods", "counterpartView", "worksites", "people",
    "familyDue", "seasonTurnDue", "villagePopulation", "DAILY_ACTIVITY_CAPACITY", "ROOF_MAX"]) {
    assert.equal((rules as Record<string, unknown>)[name], (reads as Record<string, unknown>)[name], name);
  }
});
