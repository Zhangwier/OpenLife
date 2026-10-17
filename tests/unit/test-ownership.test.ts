/**
 * Every workspace package has at least one test that imports it directly
 * (by package name, or by path for apps). Being reached only through other
 * packages is how a package's own contract goes unpinned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT, readWorkspace } from "../../scripts/workspace-graph.ts";

function testFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? testFiles(full) : entry.name.endsWith(".ts") ? [full] : [];
  });
}

test("every package, module and app is imported by at least one test", () => {
  const sources = testFiles(path.join(REPO_ROOT, "tests")).map((file) => fs.readFileSync(file, "utf8"));
  const untested = readWorkspace().filter((p) => !sources.some((text) =>
    text.includes(`"${p.name}"`) || text.includes(`/${p.dir}/`) || text.includes(`"${p.dir}`)));
  assert.deepEqual(untested.map((p) => `${p.dir} (${p.name})`), []);
});
