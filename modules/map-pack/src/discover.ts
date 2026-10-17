/**
 * Map pack discovery: which packs a content root ships.
 *
 * A directory under the root is a pack when it contains `manifest.yaml`.
 * Callers (the web catalog, tools, tests) list packs through this function
 * instead of hard-coding pack ids, so dropping a new pack directory into
 * `packs/` is the only step needed to ship it.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { MAP_PACK_FILES } from "./schema.ts";

export interface DiscoveredMapPack {
  /** Directory name; by convention equal to the manifest id. */
  dirName: string;
  /** Absolute path of the pack directory. */
  directory: string;
}

/** Every pack directory under `packsRoot`, sorted by directory name. */
export function discoverMapPacks(packsRoot: string): DiscoveredMapPack[] {
  const root = resolve(packsRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .filter((entry) => existsSync(join(root, entry.name, MAP_PACK_FILES.manifest)))
    .map((entry) => ({ dirName: entry.name, directory: join(root, entry.name) }))
    .sort((a, b) => a.dirName.localeCompare(b.dirName));
}
