/**
 * Settlement content extensions: data-only packs that add items, resource
 * names, starting objects and recipes to a settlement pack without touching
 * code (docs/PLUGINS.md §3).
 *
 *   content-packs/<packId>/manifest.json   what the pack is and which files it ships
 *   content-packs/<packId>/items.json      { prototypes, resourceLabels, instances }
 *   content-packs/<packId>/recipes.json    { recipes }   (recipe-book format)
 *
 * Format 1 is additive only: a pack may add, never replace or delete. Every id
 * it adds carries its own namespace (`prototype:<packId>.knife`), so two packs
 * can never collide with each other or with the base village.
 *
 * This file only reads and merges; content.ts validates the merged result with
 * the same checks the base pack passes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BookRecipeSpec, InstanceSeed, PrototypeSpec, RecipeBook, SettlementPack } from "./content.ts";

export const EXTENSION_FORMAT = 1;
export const EXTENSION_TYPE = "settlement_extension";
const PACK_ID = /^[a-z][a-z0-9_]{1,47}$/;

export interface ExtensionManifest {
  id: string;
  type: typeof EXTENSION_TYPE;
  formatVersion: number;
  name: string;
  version: string;
  /** The settlement pack id this extends (river-terrace for the shipped village). */
  target: string;
  description?: string;
  author?: string;
  /** Module ids that must be installed for this content to make sense (informational in format 1). */
  requiresModules?: string[];
  files?: { items?: string; recipes?: string };
}

export interface ExtensionItems {
  prototypes?: PrototypeSpec[];
  resourceLabels?: Record<string, string>;
  instances?: InstanceSeed[];
}

export interface SettlementExtension {
  manifest: ExtensionManifest;
  items: ExtensionItems;
  recipes: BookRecipeSpec[];
  directory?: string;
}

/** Reads one pack directory. Throws only on unreadable JSON; content problems come from checkExtension. */
export function readExtension(directory: string): SettlementExtension {
  const read = <T>(file: string): T => JSON.parse(readFileSync(join(directory, file), "utf8")) as T;
  const manifest = read<ExtensionManifest>("manifest.json");
  const itemsFile = manifest.files?.items ?? "items.json";
  const recipesFile = manifest.files?.recipes ?? "recipes.json";
  const items = existsSync(join(directory, itemsFile)) ? read<ExtensionItems>(itemsFile) : {};
  const recipes = existsSync(join(directory, recipesFile)) ? read<{ recipes?: BookRecipeSpec[] }>(recipesFile).recipes ?? [] : [];
  return { manifest, items, recipes, directory };
}

/** Every extension under `root` (a directory with manifest.json), sorted by id, minus the disabled ones. */
export function discoverExtensions(root: string, disabled: readonly string[] = []): SettlementExtension[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith(".") && existsSync(join(root, e.name, "manifest.json")))
    .map((e) => readExtension(join(root, e.name)))
    .filter((x) => !disabled.includes(x.manifest.id))
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

/** Manifest and namespace problems of one extension against the pack it targets. */
export function checkExtension(ext: SettlementExtension, pack: SettlementPack): string[] {
  const m = ext.manifest;
  const where = `content pack ${m.id ?? "?"}`;
  const problems: string[] = [];
  if (!PACK_ID.test(m.id ?? "")) problems.push(`${where}: id must match ${PACK_ID}`);
  if (m.type !== EXTENSION_TYPE) problems.push(`${where}: type must be ${EXTENSION_TYPE}`);
  if (m.formatVersion !== EXTENSION_FORMAT) problems.push(`${where}: formatVersion ${m.formatVersion} is not ${EXTENSION_FORMAT}`);
  if (!m.name || !m.version) problems.push(`${where}: name and version are required`);
  if (m.target !== pack.id) problems.push(`${where}: targets ${m.target}, not ${pack.id}`);
  const own = (kind: string, id: string) => {
    if (!id?.startsWith(`${kind}:${m.id}.`)) problems.push(`${where}: ${id} must be namespaced as ${kind}:${m.id}.<name>`);
  };
  for (const p of ext.items.prototypes ?? []) own("prototype", p.id);
  for (const r of Object.keys(ext.items.resourceLabels ?? {})) own("resource", r);
  for (const i of ext.items.instances ?? []) own("instance", i.id);
  for (const r of ext.recipes) own("recipe", r.id);
  return problems;
}

/** Copies of pack and book with the extensions' additions merged in. Never mutates its inputs. */
export function mergeExtensions(pack: SettlementPack, book: RecipeBook, exts: SettlementExtension[]): { pack: SettlementPack; book: RecipeBook } {
  const merged: SettlementPack = {
    ...pack,
    prototypes: [...pack.prototypes],
    resourceLabels: { ...pack.resourceLabels },
    instances: [...pack.instances],
  };
  const recipes = [...book.recipes];
  for (const ext of exts) {
    merged.prototypes.push(...(ext.items.prototypes ?? []));
    Object.assign(merged.resourceLabels, ext.items.resourceLabels ?? {});
    merged.instances.push(...(ext.items.instances ?? []));
    recipes.push(...ext.recipes);
  }
  return { pack: merged, book: { ...book, recipes } };
}
