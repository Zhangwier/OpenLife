/**
 * MVP criteria 9 and 10: Save -> Load is identical, and unloading a module
 * does not delete history.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import { verifySave } from "@openlife/save-system";
import {
  MODERN_MODULES,
  TICKS_PER_YEAR,
  bootWorld,
  cashOf,
  mustDispatch,
} from "../helpers/modern.ts";

test("save then load reproduces the world exactly", () => {
  const { simulation, characterId } = bootWorld({ seed: 777 });
  simulation.advanceBy(20 * TICKS_PER_YEAR);
  mustDispatch(simulation, {
    type: "family.marry",
    actorId: characterId,
    payload: { spouseName: "Cy" },
  });
  mustDispatch(simulation, {
    type: "family.have_child",
    actorId: characterId,
    payload: { givenName: "Dan" },
  });
  mustDispatch(simulation, {
    type: "career.get_job",
    actorId: characterId,
    payload: { occupation: "trader" },
  });
  simulation.advanceBy(10 * TICKS_PER_YEAR);
  simulation.syncHistory();

  const json = simulation.saveToJson({ label: "round-trip" });
  const loaded = Simulation.loadFromJson(json, MODERN_MODULES);
  assert.equal(loaded.result.ok, true);
  assert.ok(loaded.simulation);
  assert.equal(loaded.simulation.fingerprint(), simulation.fingerprint());
});

test("the save package carries a verifiable snapshot hash", () => {
  const { simulation } = bootWorld({ seed: 5 });
  const pkg = simulation.save();
  assert.equal(verifySave(pkg).ok, true);

  const tampered = { ...pkg, snapshot: { ...pkg.snapshot, clock: { tick: 999, advances: 0 } } };
  const verification = verifySave(tampered);
  assert.equal(verification.ok, false);
  assert.equal(verification.errors[0]?.code, "E_SAVE_INCOMPATIBLE");
});

test("loading a corrupted save is refused", () => {
  const { simulation } = bootWorld({ seed: 6 });
  const pkg = simulation.save();
  const tampered = { ...pkg, snapshot: { ...pkg.snapshot, clock: { tick: 999, advances: 0 } } };
  const loaded = Simulation.load(tampered, MODERN_MODULES);
  assert.equal(loaded.result.ok, false);
  assert.equal(loaded.simulation, undefined);
});

test("loading an engine-mismatched save is refused unless allowed", () => {
  const { simulation } = bootWorld({ seed: 7 });
  const pkg = simulation.save();
  const future = { ...pkg, manifest: { ...pkg.manifest, engineVersion: "9.9.9" } };
  assert.equal(Simulation.load(future, MODERN_MODULES).result.ok, false);
  assert.equal(
    Simulation.load(future, MODERN_MODULES, { allowVersionMismatch: true }).result.ok,
    true,
  );
});

test("simulation continues identically after load", () => {
  // 种子 8 的主角在第 17 年出意外走了，这条用例要它活过 20 年去换工作。
  // 意外按 (角色, 年龄) 键控，换种子就是换骰子；断言不动。
  const { simulation, characterId } = bootWorld({ seed: 1 });
  simulation.advanceBy(20 * TICKS_PER_YEAR);
  mustDispatch(simulation, {
    type: "career.get_job",
    actorId: characterId,
    payload: { occupation: "teacher" },
  });

  const loaded = Simulation.loadFromJson(simulation.saveToJson(), MODERN_MODULES).simulation;
  assert.ok(loaded);

  simulation.advanceBy(24);
  loaded.advanceBy(24);
  assert.equal(loaded.fingerprint(), simulation.fingerprint());
  assert.equal(cashOf(loaded, characterId), cashOf(simulation, characterId));
});

test("module state survives save and load", () => {
  const { simulation } = bootWorld({ seed: 9 });
  simulation.modules.setState("modern-world", { marker: "kept" });
  const loaded = Simulation.loadFromJson(simulation.saveToJson(), MODERN_MODULES).simulation;
  assert.ok(loaded);
  assert.deepEqual(loaded.modules.getState("modern-world"), { marker: "kept" });
});

test("module migrations transform restored persisted state rather than fresh defaults", () => {
  const v1: OpenLifeModule = {
    manifest: { id: "migrate", version: "1.0.0", engineRange: "*", type: "system-pack" },
    register: () => undefined,
  };
  const original = new Simulation({ worldSeed: 10, modules: [v1] });
  original.modules.setState("migrate", { marker: "old", count: 2 });
  const pkg = original.save();

  const v2: OpenLifeModule = {
    manifest: { id: "migrate", version: "2.0.0", engineRange: "*", type: "system-pack" },
    register: () => undefined,
    migrations: [
      {
        from: "1.0.0",
        to: "2.0.0",
        migrate: (state) => ({ ...state, marker: "migrated", count: Number(state.count ?? 0) + 1 }),
      },
    ],
  };

  const loaded = Simulation.load(pkg, [v2]);
  assert.equal(loaded.result.ok, true);
  assert.deepEqual(loaded.result.migrationsApplied, [
    { module: "migrate", from: "1.0.0", to: "2.0.0" },
  ]);
  assert.ok(loaded.simulation);
  assert.deepEqual(loaded.simulation.modules.getState("migrate"), { marker: "migrated", count: 3 });
});
