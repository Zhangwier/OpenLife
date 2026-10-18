import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverMapPacks, loadMapPack } from "@openlife/module-map-pack";
import type { Simulation } from "@openlife/simulation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export async function worldCatalog(simulation: Simulation) {
  const loaded = new Map(simulation.modules.list().map(module => [module.id, module]));
  const dirs = await readdir(join(ROOT, "modules"), { withFileTypes: true });
  const modules = await Promise.all(dirs.filter(dir => dir.isDirectory()).map(async dir => {
    const pkg = JSON.parse(await readFile(join(ROOT, "modules", dir.name, "package.json"), "utf8"));
    const entry = loaded.get(dir.name);
    // Display text lives with the module, in package.json "openlife": { label, summary }.
    return { id: dir.name, label: pkg.openlife?.label ?? dir.name, description: pkg.openlife?.summary ?? "本地内容模块。", version: entry?.version ?? pkg.version, loaded: entry?.state === "active", state: entry?.state ?? "available", requires: entry?.requires ?? [] };
  }));
  modules.sort((a, b) => Number(b.loaded) - Number(a.loaded) || a.id.localeCompare(b.id));
  // Every pack under packs/ is listed; its title comes from its own manifest.
  const maps = discoverMapPacks(join(ROOT, "packs")).map(({ dirName, directory }) => {
    const result = loadMapPack(directory, { dryRun: true });
    const id = result.manifest?.id ?? dirName;
    return { id, label: result.manifest?.displayName ?? result.manifest?.name ?? dirName, ok: result.ok, regions: result.pack?.regions ?? [], locations: result.pack?.locations ?? [], edges: result.pack?.edges.length ?? 0, boundaryAnchors: result.pack?.boundaryAnchors.length ?? 0, eventPoints: result.pack?.eventPoints ?? [] };
  });
  return { modules, maps };
}
