/**
 * Save migration (§61, §62): engine compatibility policy, module world
 * migrations limited to the module's own components, and ORPHANED modules
 * whose data survives a load without them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { ENGINE_VERSION, engineSaveCompatibility, type OpenLifeModule, type ModuleMigration } from "@openlife/contracts";
import { buildSavePackage } from "@openlife/save-system";

function farm(version: string, migrations: ModuleMigration[] = []): OpenLifeModule {
  return {
    manifest: { id: "farm", name: "farm", version, type: "system-pack" } as never,
    migrations,
    register(ctx) {
      ctx.registerComponent({ id: "farm.plot", persist: true });
      ctx.registerCommand({ type: "farm.till" });
      ctx.registerResolutionRule({
        id: "farm.till.resolve", commandType: "farm.till",
        resolve: () => [{ kind: "spawnEntity", localId: "p", id: "farm:plot:1", entityKind: "farm.plot",
          components: { "farm.plot": version === "0.1.0" ? { crop: "millet", size: 2 } : { crop: "millet", areaMu: 2 } } }],
      } as never);
    },
    activate(ctx) { ctx.state.tilled = ctx.state.tilled ?? 0; },
  };
}
const otherModule: OpenLifeModule = {
  manifest: { id: "weather", name: "weather", version: "0.1.0", type: "system-pack" } as never,
  register(ctx) { ctx.registerComponent({ id: "weather.sky", persist: true }); },
};

function oldSave() {
  const sim = new Simulation({ worldSeed: 61, modules: [farm("0.1.0"), otherModule] });
  assert.equal(sim.dispatch({ type: "farm.till" }).ok, true);
  sim.modules.setState("farm", { tilled: 1 });
  return sim.save();
}

test("engine policy: older patch/minor of the same line loads; newer or other line does not", () => {
  assert.equal(engineSaveCompatibility("0.1.0", "0.1.0"), "same");
  assert.equal(engineSaveCompatibility("0.1.0", "0.1.3"), "older");
  assert.equal(engineSaveCompatibility("0.1.3", "0.1.0"), "incompatible", "a save from a newer engine");
  assert.equal(engineSaveCompatibility("0.1.0", "0.2.0"), "incompatible", "0.x minor is a breaking line");
  assert.equal(engineSaveCompatibility("1.2.0", "1.4.1"), "older");
  assert.equal(engineSaveCompatibility("1.0.0", "2.0.0"), "incompatible");
  assert.equal(engineSaveCompatibility("garbage", "1.0.0"), "incompatible");
});

test("a save from an older patch engine loads and is re-stamped with this engine", () => {
  const pkg = oldSave();
  const [major, minor] = ENGINE_VERSION.split(".");
  const older = buildSavePackage({ ...pkg.manifest, savedAtTick: pkg.manifest.savedAtTick,
    snapshot: pkg.snapshot, moduleState: pkg.moduleState, eventJournal: pkg.eventJournal,
    history: pkg.history, metadata: pkg.metadata, modules: pkg.manifest.modules,
    engineVersion: `${major}.${minor}.0` });
  const loaded = Simulation.load(older, [farm("0.1.0"), otherModule]);
  assert.equal(loaded.result.ok, true);
  assert.equal(loaded.simulation!.save().manifest.engineVersion, ENGINE_VERSION);
  const newer = { ...older, manifest: { ...older.manifest, engineVersion: "99.0.0" } };
  assert.equal(Simulation.load(newer, [farm("0.1.0"), otherModule]).result.ok, false);
});

test("a module migration rewrites its own components in the saved world", () => {
  const migration: ModuleMigration = {
    from: "0.1.0", to: "0.2.0",
    migrate: (state) => ({ ...state, schema: 2 }),
    migrateWorld: (world) => {
      for (const { id } of world.entities({ kind: "farm.plot" })) {
        const plot = world.getComponent(id, "farm.plot")!;
        world.setComponent(id, "farm.plot", { crop: plot.crop, areaMu: plot.size });
      }
    },
  };
  const pkg = oldSave();
  const loaded = Simulation.load(pkg, [farm("0.2.0", [migration]), otherModule]);
  assert.equal(loaded.result.ok, true, JSON.stringify(loaded.result.errors));
  assert.deepEqual(loaded.result.migrationsApplied, [{ module: "farm", from: "0.1.0", to: "0.2.0" }]);
  const sim = loaded.simulation!;
  assert.deepEqual(sim.worldView().getComponent("farm:plot:1", "farm.plot"), { crop: "millet", areaMu: 2 });
  assert.deepEqual(sim.modules.getState("farm"), { tilled: 1, schema: 2 });
  assert.equal(sim.save().manifest.modules.find((m) => m.id === "farm")?.version, "0.2.0");
  assert.deepEqual((pkg.snapshot.world as { store: { entities: { id: string; components: Record<string, unknown> }[] } })
    .store.entities.find((e) => e.id === "farm:plot:1")?.components["farm.plot"], { crop: "millet", size: 2 },
    "the save package itself is never mutated");
});

test("a migration that writes another module's component fails the load cleanly", () => {
  const rogue: ModuleMigration = {
    from: "0.1.0", to: "0.2.0", migrate: (s) => s,
    migrateWorld: (world) => { world.setComponent("farm:plot:1", "weather.sky", { rain: true }); },
  };
  const loaded = Simulation.load(oldSave(), [farm("0.2.0", [rogue]), otherModule]);
  assert.equal(loaded.result.ok, false);
  assert.equal(loaded.simulation, undefined);
  assert.equal(loaded.result.errors[0]?.code, "E_MIGRATION_FAILED");
});

test("a missing module is ORPHANED: its data survives the load and the next save", () => {
  const pkg = oldSave();
  const loaded = Simulation.load(pkg, [otherModule]);
  assert.equal(loaded.result.ok, true);
  assert.deepEqual(loaded.result.orphanedModules, [{ id: "farm", version: "0.1.0" }]);
  assert.ok(loaded.result.warnings.some((w) => w.includes("ORPHANED")));
  const sim = loaded.simulation!;
  assert.deepEqual(sim.orphanedModules(), [{ id: "farm", version: "0.1.0" }]);
  assert.deepEqual(sim.worldView().getComponent("farm:plot:1", "farm.plot"), { crop: "millet", size: 2 },
    "orphaned world data is kept, not deleted");
  const resaved = sim.save();
  assert.ok(resaved.manifest.modules.some((m) => m.id === "farm" && m.version === "0.1.0"));
  assert.deepEqual(resaved.moduleState.farm, { tilled: 1 });
  const back = Simulation.load(resaved, [farm("0.1.0"), otherModule]);
  assert.equal(back.result.ok, true);
  assert.equal(back.result.orphanedModules, undefined);
  assert.deepEqual(back.simulation!.modules.getState("farm"), { tilled: 1 });
});
