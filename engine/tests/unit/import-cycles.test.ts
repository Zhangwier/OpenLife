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

test("inside settlement-locations only the package entry imports module.ts", () => {
  // module.ts wires everything together (it runs the village-day agent and
  // registers marriage, passing, storyteller and season-life rules), so any
  // file in the package importing it back closes a loop. The old 9-file cycle
  // formed exactly this way, through the autonomy agents.
  const graph = fileImportGraph();
  const rules = `${SETTLEMENT}/module.ts`;
  const offenders = [...graph].filter(([file, deps]) =>
    file.startsWith(`${SETTLEMENT}/`) && file !== `${SETTLEMENT}/index.ts` && deps.includes(rules)
  ).map(([file]) => file);
  assert.deepEqual(offenders, []);
});

test("module.ts still re-exports everything it used to own", async () => {
  const rules = await import("../../modules/settlement-locations/src/module.ts");
  const reads = await import("../../modules/settlement-locations/src/village-reads.ts");
  for (const name of ["dailyActivity", "currentYields", "carrying", "roofState", "wornWrap", "seasonOf",
    "activityCostFor", "openRequest", "favourOwed", "tradeableGoods", "counterpartView", "worksites", "people",
    "familyDue", "seasonTurnDue", "villagePopulation", "DAILY_ACTIVITY_CAPACITY", "ROOF_MAX", "prototypeForResource"]) {
    assert.equal((rules as Record<string, unknown>)[name], (reads as Record<string, unknown>)[name], name);
  }
  const split = {
    "passing.ts": ["HEIR_AGE", "heirsOf"],
    "storyteller.ts": ["seasonTurnEffects"],
    "season-life.ts": ["daysLeftInSeason", "familyOf", "familyView", "liveSeason"],
  };
  for (const [file, names] of Object.entries(split)) {
    const mod = await import(`../../modules/settlement-locations/src/${file}`) as Record<string, unknown>;
    for (const name of names) assert.equal((rules as Record<string, unknown>)[name], mod[name], `${file}: ${name}`);
  }
});
