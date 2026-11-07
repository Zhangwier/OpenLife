import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const catalog = JSON.parse(fs.readFileSync(new URL("../docs/integration/legacy-capabilities.json", import.meta.url), "utf8"));
test("legacy module inventory retains all referenced system families, without false runtime claims", () => {
  const ids = new Set(catalog.modules.map(m => m.id));
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(catalog.packages.length >= 10);
  assert.ok(ids.size >= 60, "all archived module IDs should be accounted for");
  for (const id of ["world-ecology","world-hydrology","world-species","world-vegetation","world-weather",
    "epistemic-state","tech","knowledge-transmission","settlement-locations","village-secrets",
    "social-conflict","economy","polity","civilization","family","life-stages","heredity",
    "historical-memory","story-director","travel","world-space","narrative-voice"]) assert.ok(ids.has(id), id);
  assert.equal(ids.size, catalog.modules.length);
  assert.ok(catalog.modules.every(m => m.runtime === "source-migrated" && m.playerCoverage === "tracked-separately"));
  assert.ok(catalog.modules.every(m => m.id && m.kind && m.source && Array.isArray(m.provides) && Array.isArray(m.requires)));
});
