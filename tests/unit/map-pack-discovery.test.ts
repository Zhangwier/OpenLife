/**
 * Content-pack discovery guard: everything under packs/ is found without a
 * hard-coded list, loads cleanly, and carries its own player-facing title.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { discoverMapPacks, loadMapPack } from "@openlife/module-map-pack";
import { worldCatalog } from "../../apps/web/src/catalog.ts";

const PACKS = resolve(import.meta.dirname, "../../packs");

test("discovery finds every shipped pack, sorted, ignoring non-pack directories", () => {
  const found = discoverMapPacks(PACKS).map((p) => p.dirName);
  assert.ok(found.includes("xia_starter_v0_1"));
  assert.ok(found.includes("xia_east_extension_v0_1"));
  assert.deepEqual(found, [...found].sort((a, b) => a.localeCompare(b)));

  const scratch = mkdtempSync(join(tmpdir(), "packs-"));
  try {
    mkdirSync(join(scratch, "not_a_pack"));
    mkdirSync(join(scratch, "b_pack"));
    writeFileSync(join(scratch, "b_pack", "manifest.yaml"), "id: b_pack\n");
    writeFileSync(join(scratch, "stray.yaml"), "x: 1\n");
    assert.deepEqual(discoverMapPacks(scratch).map((p) => p.dirName), ["b_pack"]);
    assert.deepEqual(discoverMapPacks(join(scratch, "missing")), []);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("every shipped pack validates, is named after its directory and has a display name", () => {
  for (const pack of discoverMapPacks(PACKS)) {
    const result = loadMapPack(pack.directory, { dryRun: true });
    assert.equal(result.ok, true, `${pack.dirName}: ${result.validation.issues.map((i) => i.message).join("; ")}`);
    assert.equal(result.manifest?.id, pack.dirName, "manifest id must equal the directory name");
    assert.ok(result.manifest?.displayName, `${pack.dirName}: manifest needs display_name`);
  }
});

test("the web catalog lists exactly the discovered packs with their manifest titles", async () => {
  const stub = { modules: { list: () => [] } } as unknown as Parameters<typeof worldCatalog>[0];
  const catalog = await worldCatalog(stub);
  const discovered = discoverMapPacks(PACKS);
  assert.deepEqual(catalog.maps.map((m) => m.id), discovered.map((p) => p.dirName));
  const starter = catalog.maps.find((m) => m.id === "xia_starter_v0_1");
  assert.equal(starter?.label, "初始地理包");
  assert.equal(starter?.ok, true);
});
