/**
 * Which modules the web game installs, decided by configuration instead of a
 * hard-coded array (see docs/PLUGINS.md §2).
 *
 *   apps/web/openlife.modules.json   { "disabled": ["social-conflict", ...] }
 *   OPENLIFE_DISABLE_MODULES         comma list, added to the file's list
 *   OPENLIFE_MODULES_CONFIG          path of the config file (overrides the default)
 *
 * Rules:
 *   - an entry marked `core` can never be disabled (the game's opening needs it);
 *   - an unknown id in the disabled list is an error, so typos never pass silently;
 *   - when a module's hard `requires` loses its provider, that module is switched
 *     off too ("cascaded"), unless it is core, which is an error naming both.
 */
import { existsSync, readFileSync } from "node:fs";
import type { OpenLifeModule } from "@openlife/contracts";

export interface ModuleEntry {
  module: OpenLifeModule;
  /** The web opening cannot run without it. */
  core?: boolean;
}

export interface ModulePlan {
  modules: OpenLifeModule[];
  /** Ids switched off because the config asked for it. */
  disabled: string[];
  /** Ids switched off because something they hard-require was switched off. */
  cascaded: string[];
  problems: string[];
}

export function planModules(entries: ModuleEntry[], disabledIds: readonly string[]): ModulePlan {
  const known = new Map(entries.map((e) => [e.module.manifest.id as string, e]));
  const problems: string[] = [];
  const off = new Set<string>();
  for (const raw of disabledIds) {
    const id = raw.trim();
    if (!id) continue;
    const entry = known.get(id);
    if (!entry) problems.push(`unknown module in disabled list: ${id}`);
    else if (entry.core) problems.push(`module ${id} is core and cannot be disabled`);
    else off.add(id);
  }
  const disabled = [...off];
  const cascaded: string[] = [];
  for (let changed = true; changed;) {
    changed = false;
    const on = entries.filter((e) => !off.has(e.module.manifest.id));
    const provided = new Set(on.flatMap((e) => e.module.manifest.provides ?? []));
    for (const entry of on) {
      const missing = (entry.module.manifest.requires ?? []).filter((cap) => !provided.has(cap));
      if (missing.length === 0) continue;
      const id = entry.module.manifest.id;
      if (entry.core) {
        const problem = `core module ${id} needs ${missing.join(", ")}, which a disabled module provided`;
        if (!problems.includes(problem)) problems.push(problem);
        continue;
      }
      off.add(id);
      cascaded.push(id);
      changed = true;
    }
  }
  return {
    modules: entries.filter((e) => !off.has(e.module.manifest.id)).map((e) => e.module),
    disabled,
    cascaded,
    problems,
  };
}

/** The disabled list from the config file plus OPENLIFE_DISABLE_MODULES. */
export function readDisabledModules(configPath: string, env: Record<string, string | undefined>): string[] {
  const ids: string[] = [];
  const file = env.OPENLIFE_MODULES_CONFIG ?? configPath;
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { disabled?: unknown };
    if (parsed.disabled !== undefined && !Array.isArray(parsed.disabled)) {
      throw new Error(`${file}: "disabled" must be a list of module ids`);
    }
    for (const id of (parsed.disabled as unknown[] | undefined) ?? []) ids.push(String(id));
  }
  for (const id of (env.OPENLIFE_DISABLE_MODULES ?? "").split(",")) if (id.trim()) ids.push(id.trim());
  return [...new Set(ids)];
}

/** planModules + readDisabledModules; throws with every problem listed. */
export function resolveModules(entries: ModuleEntry[], configPath: string, env: Record<string, string | undefined>): ModulePlan {
  const plan = planModules(entries, readDisabledModules(configPath, env));
  if (plan.problems.length > 0) throw new Error(`module configuration is invalid:\n  ${plan.problems.join("\n  ")}`);
  return plan;
}
