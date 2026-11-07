import { pathToFileURL } from "node:url";
import type { OpenLifeModule } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import { WEB_MODULE_ENTRIES } from "../apps/web/src/modules.ts";
import { readWorkspace } from "./workspace-graph.ts";

function isModule(value: unknown): value is OpenLifeModule {
  return Boolean(value && typeof value === "object" && "manifest" in value && "register" in value);
}

async function workspaceModules(): Promise<Map<string, OpenLifeModule>> {
  const result = new Map<string, OpenLifeModule>();
  for (const pkg of readWorkspace().filter((item) => item.layer === "modules")) {
    for (const value of Object.values(await import(pkg.name))) {
      if (!isModule(value)) continue;
      const id = value.manifest.id;
      if (result.has(id) && result.get(id) !== value) throw new Error(`Two implementations claim ${id}`);
      result.set(id, value);
    }
  }
  return result;
}

function dependencyOrder(modules: OpenLifeModule[]): OpenLifeModule[] {
  const ready: OpenLifeModule[] = [];
  const waiting = [...modules];
  const provided = new Set<string>();
  while (waiting.length) {
    const index = waiting.findIndex((item) => (item.manifest.requires ?? []).every((cap) => provided.has(cap)));
    if (index < 0) throw new Error(`Unresolved dependencies: ${waiting.map((item) => item.manifest.id).join(", ")}`);
    const [next] = waiting.splice(index, 1);
    ready.push(next!);
    for (const cap of next!.manifest.provides ?? []) provided.add(cap);
  }
  return ready;
}

export async function verifyProfiles() {
  const inventory = await workspaceModules();
  const otherWorlds = new Set(["magic-test-world", "robot-test-world"]);
  // The full climate/hydrology/species chain owns its own capabilities here.
  // River Terrace uses the archived settlement-specific implementation instead.
  const systems = [...inventory].filter(([id]) => !otherWorlds.has(id) && id !== "settlement-nature").map(([, module]) => module);
  const presets = [
    ["river-terrace", WEB_MODULE_ENTRIES.map((entry) => entry.module)],
    ["world-systems", dependencyOrder(systems)],
    ...[...otherWorlds].map((id) => [id, [inventory.get(id)!]] as const),
  ] as const;
  const covered = new Set<string>();
  const profiles = [];
  for (const [name, modules] of presets) {
    const sim = new Simulation({ worldSeed: 20261106, modules });
    const ids = sim.modules.list().filter((item) => item.state === "active").map((item) => item.id);
    if (ids.length !== modules.length) throw new Error(`${name}: failed activation: ${modules.map((m) => m.manifest.id).filter((id) => !ids.includes(id)).join(", ")}`);
    const reopened = Simulation.load(sim.save({ label: name }), modules);
    if (!reopened.result.ok || !reopened.simulation) throw new Error(`${name}: save did not reopen: ${JSON.stringify(reopened.result.errors)}`);
    const loaded = reopened.simulation.modules.list().filter((item) => item.state === "active").map((item) => item.id);
    if (ids.join() !== loaded.join()) throw new Error(`${name}: active modules changed on reopen`);
    ids.forEach((id) => covered.add(id));
    profiles.push({ name, modules: ids });
  }
  const missing = [...inventory.keys()].filter((id) => !covered.has(id));
  if (missing.length) throw new Error(`Unverified modules: ${missing.join(", ")}`);
  return { corePackages: readWorkspace().filter((item) => item.layer === "packages").length, modules: covered.size, profiles };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await verifyProfiles(), null, 2));
}
