/**
 * Static view of the npm workspace: every package under packages/, modules/
 * and apps/, what it declares in package.json and which @openlife/* packages
 * its source actually imports.
 *
 * Used by tests/unit/workspace-structure.test.ts (architecture guard) and by
 * scripts/gen-module-catalog.ts (docs/MODULES.md). Read-only, no dependencies.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type Layer = "packages" | "modules" | "apps";
export const LAYERS: readonly Layer[] = ["packages", "modules", "apps"];

export interface WorkspacePackage {
  /** npm name, e.g. `@openlife/module-world-space`. */
  name: string;
  layer: Layer;
  /** Directory relative to the repo root, e.g. `modules/world-space`. */
  dir: string;
  description: string;
  /** `@openlife/*` names declared in dependencies / devDependencies / peerDependencies. */
  declared: string[];
  /** `@openlife/*` names imported (statically or via re-export) by source files. */
  imported: string[];
  /** Each imported name with the first file that imports it (for error messages). */
  importSites: Record<string, string>;
  hasIndex: boolean;
  exportsRoot: boolean;
}

const SOURCE = /\.(ts|tsx|mts|js|mjs)$/;
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)["'](@openlife\/[^"'/]+)/g;

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(full));
    else if (SOURCE.test(entry.name)) files.push(full);
  }
  return files;
}

export function readWorkspace(root: string = REPO_ROOT): WorkspacePackage[] {
  const result: WorkspacePackage[] = [];
  for (const layer of LAYERS) {
    const layerDir = path.join(root, layer);
    if (!fs.existsSync(layerDir)) continue;
    for (const name of fs.readdirSync(layerDir).sort()) {
      const dir = path.join(layerDir, name);
      const manifestPath = path.join(dir, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const declared = Object.keys({
        ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies,
      }).filter((dep) => dep.startsWith("@openlife/")).sort();
      const importSites: Record<string, string> = {};
      for (const file of sourceFiles(dir)) {
        for (const match of fs.readFileSync(file, "utf8").matchAll(IMPORT)) {
          const dep = match[1]!;
          if (dep !== manifest.name && !(dep in importSites)) {
            importSites[dep] = path.relative(root, file).split(path.sep).join("/");
          }
        }
      }
      const exportsField = manifest.exports;
      result.push({
        name: manifest.name,
        layer,
        dir: `${layer}/${name}`,
        description: String(manifest.description ?? ""),
        declared,
        imported: Object.keys(importSites).sort(),
        importSites,
        hasIndex: fs.existsSync(path.join(dir, "src", "index.ts")),
        exportsRoot: Boolean(exportsField && typeof exportsField === "object" && "." in exportsField),
      });
    }
  }
  return result;
}

/** Cycles in the declared workspace dependency graph, each as a list of names. */
export function findCycles(packages: readonly WorkspacePackage[]): string[][] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const visit = (name: string) => {
    state.set(name, "visiting");
    stack.push(name);
    for (const dep of byName.get(name)?.declared ?? []) {
      if (!byName.has(dep)) continue;
      if (state.get(dep) === "visiting") cycles.push([...stack.slice(stack.indexOf(dep)), dep]);
      else if (!state.has(dep)) visit(dep);
    }
    stack.pop();
    state.set(name, "done");
  };
  for (const p of packages) if (!state.has(p.name)) visit(p.name);
  return cycles;
}
