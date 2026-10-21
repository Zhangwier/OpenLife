/**
 * The type-check gate (scripts/typecheck.ts). `npm run typecheck` runs tsc in
 * CI and fails on any error; here we check how a run is judged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { countErrors, verdict } from "../../scripts/typecheck.ts";
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

test("any error fails, and so does a tsc run that fails without reporting one", () => {
  assert.equal(verdict("", 0).ok, true);
  const one = verdict("modules/a/src/x.ts(1,2): error TS2322: nope.", 2);
  assert.equal(one.ok, false);
  assert.equal(one.total, 1);
  const broken = verdict("error TS5058: The specified path does not exist: 'tsconfig.json'.", 1);
  assert.equal(broken.ok, false, "a broken config is not a pass");
  assert.match(broken.reason, /exited with 1/);
});

test("there is no baseline to hide errors behind any more", () => {
  assert.equal(fs.existsSync(path.join(REPO_ROOT, "scripts", "typecheck-baseline.json")), false);
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts.typecheck, "node scripts/typecheck.ts");
  assert.equal(pkg.scripts["typecheck:update"], undefined);
  assert.ok(pkg.devDependencies?.typescript, "typescript must be a root devDependency");
});
