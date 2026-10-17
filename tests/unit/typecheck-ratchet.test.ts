/**
 * The type-check ratchet (scripts/typecheck.ts). `npm run typecheck` runs tsc
 * in CI; here we check the comparison logic and that the baseline is honest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BASELINE_PATH, compare, countErrors } from "../../scripts/typecheck.ts";
import { REPO_ROOT } from "../../scripts/workspace-graph.ts";

test("tsc output is counted per file", () => {
  const output = [
    "modules/a/src/x.ts(1,2): error TS2322: Type 'string' is not assignable to type 'number'.",
    "modules/a/src/x.ts(9,1): error TS2339: Property 'y' does not exist.",
    "apps/web/server.ts(3,4): error TS7006: Parameter 'z' implicitly has an 'any' type.",
    "  some continuation line",
  ].join("\n");
  assert.deepEqual(countErrors(output), { "apps/web/server.ts": 1, "modules/a/src/x.ts": 2 });
});

test("more errors than the baseline, or errors in a new file, are regressions", () => {
  const report = compare({ "a.ts": 3, "b.ts": 1, "c.ts": 1 }, { "a.ts": 2, "b.ts": 4 });
  assert.deepEqual(report.regressions, [["a.ts", 3, 2], ["c.ts", 1, 0]]);
  assert.deepEqual(report.improvements, [["b.ts", 1, 4]]);
  assert.deepEqual(compare({}, { "a.ts": 1 }).improvements, [["a.ts", 0, 1]]);
});

test("the baseline only lists files that exist, with positive counts", () => {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as Record<string, number>;
  const problems = Object.entries(baseline)
    .filter(([file, count]) => !fs.existsSync(path.join(REPO_ROOT, file)) || !(Number.isInteger(count) && count > 0))
    .map(([file, count]) => `${file}: ${count}`);
  assert.deepEqual(problems, []);
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts.typecheck, "node scripts/typecheck.ts");
  assert.ok(pkg.devDependencies?.typescript, "typescript must be a root devDependency");
});
