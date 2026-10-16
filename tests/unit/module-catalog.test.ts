/**
 * docs/MODULES.md is generated from the workspace and module manifests.
 * Adding, renaming or re-wiring a module without `npm run catalog` fails here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CATALOG_PATH, renderCatalog } from "../../scripts/gen-module-catalog.ts";
import { readWorkspace } from "../../scripts/workspace-graph.ts";

test("docs/MODULES.md matches the generated catalog", async () => {
  assert.ok(fs.existsSync(CATALOG_PATH), "docs/MODULES.md missing; run `npm run catalog`");
  assert.equal(fs.readFileSync(CATALOG_PATH, "utf8").replace(/\r\n/g, "\n"), await renderCatalog(),
    "docs/MODULES.md is stale; run `npm run catalog`");
});

test("every module package exports at least one OpenLifeModule manifest", async () => {
  const missing: string[] = [];
  for (const p of readWorkspace().filter((w) => w.layer === "modules")) {
    const exports = await import(p.name) as Record<string, unknown>;
    const hasManifest = Object.values(exports).some((v) =>
      v && typeof v === "object" && typeof (v as { manifest?: { id?: unknown } }).manifest?.id === "string");
    if (!hasManifest) missing.push(p.dir);
  }
  assert.deepEqual(missing, []);
});
