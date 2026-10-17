/**
 * Settlement content extensions: data-only packs that add items, resource names,
 * starting objects, recipes, incidents, residents, dialogue and places to a
 * settlement pack without touching code (docs/PLUGINS.md §3, format v2).
 *
 *   content-packs/<packId>/manifest.json   what the pack is and which files it ships
 *   content-packs/<packId>/items.json      { prototypes, resourceLabels, instances }
 *   content-packs/<packId>/recipes.json    { recipes }   (recipe-book format)
 *   content-packs/<packId>/incidents.json  { incidents } (choice events, format v2)
 *   content-packs/<packId>/residents.json  { residents } (new villagers)
 *   content-packs/<packId>/dialogue.json   { dialogue }  (lines hung off existing villagers)
 *   content-packs/<packId>/places.json     { places }    (new place + spaces + yields)
 *
 * Formats 1 and 2 are additive only: a pack may add, never replace or delete.
 * Every id it adds carries its own namespace (`prototype:<packId>.knife`), so
 * two packs can never collide with each other or with the base village.
 *
 * This file only reads, checks and merges; content.ts validates the merged
 * result with the same checks the base pack passes.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  BookRecipeSpec, InstanceSeed, PlaceSpec, PrototypeSpec, RecipeBook, ResidentSpec, SettlementPack,
  StoryEventSpec, YieldSpec,
} from "./content.ts";

/** The space shape a place carries (declared inline in content.ts). */
export type ExtensionSpace = SettlementPack["places"][number]["spaces"][number];

export const EXTENSION_FORMAT = 2;
/** Format 1 packs (items + recipes only) stay valid; nothing about them changed. */
export const EXTENSION_FORMATS = [1, 2] as const;
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
  /** Module ids that must be installed for this content to make sense (informational). */
  requiresModules?: string[];
  files?: {
    items?: string;
    recipes?: string;
    incidents?: string;
    residents?: string;
    dialogue?: string;
    places?: string;
  };
}

export interface ExtensionItems {
  prototypes?: PrototypeSpec[];
  resourceLabels?: Record<string, string>;
  instances?: InstanceSeed[];
  places?: PlaceSpec[];
  /** Extra spaces, attached to the place named by `placeId`. */
  spaces?: Array<ExtensionSpace & { placeId?: string }>;
  yields?: YieldSpec[];
}

/**
 * One dialogue fragment a pack hangs off an existing villager.
 *
 * Kept deliberately small: a pack may give someone new things to say at a given
 * relationship level, but it may not rewrite who they are.
 */
export interface ExtensionDialogue {
  /** Resident key ("cook") or full entity id. */
  resident: string;
  lines: Array<{ id: string; text: string; minHearts?: number; maxHearts?: number; topic?: string }>;
}

export interface SettlementExtension {
  manifest: ExtensionManifest;
  items: ExtensionItems;
  recipes: BookRecipeSpec[];
  /** Choice events. Same shape as the storyteller's events plus optional choices. */
  incidents: StoryEventSpec[];
  /** New villagers, in the pack's own namespace. */
  residents: ResidentSpec[];
  dialogue: ExtensionDialogue[];
  directory?: string;
}

/** Reads one pack directory. Throws only on unreadable JSON; content problems come from checkExtension. */
export function readExtension(directory: string): SettlementExtension {
  const read = <T>(file: string): T => JSON.parse(readFileSync(join(directory, file), "utf8")) as T;
  const manifest = read<ExtensionManifest>("manifest.json");
  const pick = (declared: string | undefined, fallback: string) => declared ?? fallback;
  const readIf = <T>(file: string, key: string, fallback: T): T =>
    existsSync(join(directory, file)) ? (read<Record<string, T>>(file)[key] ?? fallback) : fallback;

  const itemsFile = pick(manifest.files?.items, "items.json");
  const recipesFile = pick(manifest.files?.recipes, "recipes.json");
  const incidentsFile = pick(manifest.files?.incidents, "incidents.json");
  const residentsFile = pick(manifest.files?.residents, "residents.json");
  const dialogueFile = pick(manifest.files?.dialogue, "dialogue.json");
  const placesFile = pick(manifest.files?.places, "places.json");

  return {
    manifest,
    items: existsSync(join(directory, itemsFile)) ? read<ExtensionItems>(itemsFile) : {},
    recipes: readIf<BookRecipeSpec[]>(recipesFile, "recipes", []),
    incidents: readIf<StoryEventSpec[]>(incidentsFile, "incidents", []),
    residents: readIf<ResidentSpec[]>(residentsFile, "residents", []),
    dialogue: readIf<ExtensionDialogue[]>(dialogueFile, "dialogue", []),
    directory,
  };
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
  if (!EXTENSION_FORMATS.includes(m.formatVersion as 1 | 2)) {
    problems.push(`${where}: formatVersion ${m.formatVersion} is not one of ${EXTENSION_FORMATS.join(", ")}`);
  }
  if (!m.name || !m.version) problems.push(`${where}: name and version are required`);
  if (m.target !== pack.id) problems.push(`${where}: targets ${m.target}, not ${pack.id}`);
  const own = (kind: string, id: string) => {
    if (!id?.startsWith(`${kind}:${m.id}.`)) problems.push(`${where}: ${id} must be namespaced as ${kind}:${m.id}.<name>`);
  };
  for (const p of ext.items.prototypes ?? []) own("prototype", p.id);
  for (const r of Object.keys(ext.items.resourceLabels ?? {})) own("resource", r);
  for (const i of ext.items.instances ?? []) own("instance", i.id);
  for (const r of ext.recipes) own("recipe", r.id);
  // Format 2 additions carry namespaces too, so two packs cannot collide.
  for (const i of ext.incidents) own("incident", i.id);
  for (const r of ext.residents) own("resident", r.key ?? "");
  for (const p of ext.items.places ?? []) own("place", p.id);
  for (const s of ext.items.spaces ?? []) own("space", s.id);

  // A resident needs a home space that will exist after merging.
  const spaceIds = new Set([
    ...pack.places.flatMap((p) => p.spaces.map((s) => s.id)),
    ...(ext.items.spaces ?? []).map((s) => s.id),
    ...(ext.items.places ?? []).flatMap((p) => (p.spaces ?? []).map((s) => s.id)),
  ]);
  for (const r of ext.residents) {
    if (r.homeSpace && !spaceIds.has(r.homeSpace)) {
      problems.push(`${where}: resident ${r.key} lives in ${r.homeSpace}, which no pack defines`);
    }
  }
  // A place must be reachable from somewhere that already exists.
  const placeIds = new Set([...pack.places.map((p) => p.id), ...(ext.items.places ?? []).map((p) => p.id)]);
  for (const p of ext.items.places ?? []) {
    for (const link of p.connections ?? []) {
      if (!placeIds.has(link.to) && !link.to.startsWith("place:")) {
        problems.push(`${where}: place ${p.id} connects to ${link.to}, which looks like neither a place id nor a namespace`);
      }
    }
  }
  // Dialogue must hang off a resident that exists (base or pack).
  const residentKeys = new Set([
    ...pack.residents.map((r) => r.key),
    ...ext.residents.map((r) => r.key),
  ]);
  for (const d of ext.dialogue) {
    const bare = d.resident.includes(":") ? d.resident.split(":").pop()! : d.resident;
    if (!residentKeys.has(bare) && !d.resident.startsWith("settlement-locations:resident:")) {
      problems.push(`${where}: dialogue for unknown resident ${d.resident}`);
    }
    if (!d.lines?.length) problems.push(`${where}: dialogue for ${d.resident} has no lines`);
  }
  // Every incident needs a real choice: at least two options, each changing
  // something. One option, or an option with no consequence, is not a decision.
  for (const i of ext.incidents) {
    const choices = i.choices ?? [];
    if (!choices.length) problems.push(`${where}: incident ${i.id} has no choices`);
    else if (choices.length < 2) problems.push(`${where}: incident ${i.id} needs at least two choices`);
    const seen = new Set<string>();
    for (const c of choices) {
      if (!c.id) problems.push(`${where}: incident ${i.id} has a choice with no id`);
      else if (seen.has(c.id)) problems.push(`${where}: incident ${i.id} has duplicate choice id ${c.id}`);
      seen.add(c.id);
      if (!c.label) problems.push(`${where}: incident ${i.id} choice ${c.id} has no label`);
      const hasEffect = Boolean(
        (c.cost && Object.keys(c.cost).length) ||
        (c.bond && Object.values(c.bond).some((n) => Number(n ?? 0) !== 0)) ||
        (c.yields && Object.keys(c.yields).length) ||
        c.flags?.length || c.reputation || c.followUp,
      );
      if (!hasEffect) problems.push(`${where}: incident ${i.id} choice ${c.id} changes nothing`);
    }
  }
  return problems;
}

/**
 * Copies of pack and book with the extensions' additions merged in.
 * Never mutates its inputs.
 */
export function mergeExtensions(
  pack: SettlementPack,
  book: RecipeBook,
  exts: SettlementExtension[],
): {
  pack: SettlementPack;
  book: RecipeBook;
  incidents: StoryEventSpec[];
  dialogue: ExtensionDialogue[];
} {
  const merged: SettlementPack = {
    ...pack,
    prototypes: [...pack.prototypes],
    resourceLabels: { ...pack.resourceLabels },
    instances: [...pack.instances],
    // A place carries its own spaces, so places are deep-copied one level and
    // pack-added spaces are spliced into whichever place claims them.
    places: pack.places.map((p) => ({ ...p, spaces: [...p.spaces] })),
    yields: [...pack.yields],
    residents: [...pack.residents],
  };
  const recipes = [...book.recipes];
  const incidents: StoryEventSpec[] = [];
  const dialogue: ExtensionDialogue[] = [];
  for (const ext of exts) {
    merged.prototypes.push(...(ext.items.prototypes ?? []));
    Object.assign(merged.resourceLabels, ext.items.resourceLabels ?? {});
    merged.instances.push(...(ext.items.instances ?? []));
    const addedPlaces = ext.items.places ?? [];
    merged.places.push(...addedPlaces.map((p) => ({ ...p, spaces: [...(p.spaces ?? [])] })));
    for (const extra of ext.items.spaces ?? []) {
      const target = extra.placeId
        ? merged.places.find((p) => p.id === extra.placeId)
        // No placeId: attach to the place that already owns this space id, else
        // to the last place the pack added (the common "new place + its rooms").
        : merged.places.find((p) => p.id === addedPlaces.at(-1)?.id);
      if (!target) continue;
      const { placeId: _omit, ...space } = extra;
      void _omit;
      target.spaces.push(space);
    }
    merged.yields.push(...(ext.items.yields ?? []));
    merged.residents.push(...ext.residents);
    recipes.push(...ext.recipes);
    incidents.push(...ext.incidents);
    dialogue.push(...ext.dialogue);
  }
  return { pack: merged, book: { ...book, recipes }, incidents, dialogue };
}

/**
 * Every content pack that contributed to a running world, as `id@version`.
 *
 * Written into the world state at founding so a later load can say "this save
 * used reed_baskets@0.1.0, which is not installed" instead of failing on a
 * missing item. engine.ACTIVE_CONTENT_PACKS holds it.
 */
export function activePackStamps(exts: SettlementExtension[]): string[] {
  return exts.map((e) => `${e.manifest.id}@${e.manifest.version}`).sort();
}

/** Packs a save expects but the current process does not have. */
export function missingPacks(stamps: readonly string[], installed: readonly string[]): string[] {
  const have = new Set(installed);
  return stamps.filter((s) => !have.has(s));
}
