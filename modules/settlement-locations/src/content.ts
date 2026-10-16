/**
 * Settlement content pack (M5-A): the village as data, the rules as code.
 *
 * Residents, places and their spaces, renewing yields, object prototypes,
 * resource labels and the starting objects live in `data/<pack>.json`. This
 * file loads a pack and validates every cross reference before the module
 * uses it, so a broken pack fails loudly at load instead of mid-game.
 */
import { readFileSync } from "node:fs";

export interface ResidentSpec {
  key: string;
  name: string;
  age: number;
  role: string;
  trait: string;
  wish: string;
  /** Which place this person works in during the day. */
  workPlace: string;
  /** Which space they sleep in at night. */
  homeSpace: string;
  household: string;
}

export interface PlaceSpec {
  id: string; name: string; type: string; costDays: number;
  /** Where someone arriving here actually stands: the room or spot they enter. */
  entrySpace: string;
  spaces: { id: string; name: string; type: string; capacity: number; visible?: boolean }[];
  /** Where villagers who work here stand and tend (omitted: nothing to tend). */
  workSpot?: string;
  /** What a villager working here gathers in a generic day (omitted: nothing). */
  jobResource?: string;
}

export interface YieldSpec { placeId: string; resourceId: string; label: string; capacity: number; renewDays: number; unit: string }

export interface PrototypeSpec {
  id: string; name: string; material: string; resourceId: string; unit: string;
  mass: number; capacity: number; capabilities: string[]; durability: number; visible?: boolean;
}

/** A starting object: owned by a resident (by key), inside a space or another object. */
export interface InstanceSeed { id: string; prototypeId: string; owner: string; inId: string; quantity?: number }

export interface SettlementPack {
  id: string;
  name: string;
  formatVersion: number;
  /**
   * Which residents carry the three bespoke daily routines (farmer, cook,
   * fuel gatherer). Their places and rooms come from each resident's own
   * workPlace/homeSpace; everyone else follows the generic routine.
   */
  autonomy: { farmer: string; cook: string; fuelGatherer: string };
  residents: ResidentSpec[];
  places: PlaceSpec[];
  yields: YieldSpec[];
  prototypes: PrototypeSpec[];
  resourceLabels: Record<string, string>;
  instances: InstanceSeed[];
}

export const SETTLEMENT_PACK_FORMAT = 1;

/** Every problem in a pack, as readable lines; empty means the pack is sound. */
export function validateSettlementPack(pack: SettlementPack): string[] {
  const problems: string[] = [];
  const dup = (label: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${label}: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  if (pack.formatVersion !== SETTLEMENT_PACK_FORMAT) {
    problems.push(`pack format ${pack.formatVersion} is not ${SETTLEMENT_PACK_FORMAT}`);
  }
  const notLists = (["residents", "places", "yields", "prototypes", "instances"] as const)
    .filter((key) => !Array.isArray(pack[key]));
  if (notLists.length > 0) return [...problems, ...notLists.map((key) => `${key} must be a list`)];
  const residents = dup("resident", pack.residents.map((r) => r.key));
  const places = dup("place", pack.places.map((p) => p.id));
  const spaces = dup("space", pack.places.flatMap((p) => p.spaces.map((s) => s.id)));
  const prototypes = dup("prototype", pack.prototypes.map((p) => p.id));
  const instances = dup("instance", pack.instances.map((i) => i.id));
  for (const place of pack.places) {
    if (!place.spaces.some((s) => s.id === place.entrySpace)) {
      problems.push(`place ${place.id}: entry space ${place.entrySpace} is not one of its spaces`);
    }
    if (place.workSpot && !place.spaces.some((s) => s.id === place.workSpot)) {
      problems.push(`place ${place.id}: work spot ${place.workSpot} is not one of its spaces`);
    }
    if (place.jobResource && !pack.yields.some((y) => y.placeId === place.id && y.resourceId === place.jobResource)) {
      problems.push(`place ${place.id}: job resource ${place.jobResource} is not yielded there`);
    }
    if (!Number.isInteger(place.costDays) || place.costDays < 0) problems.push(`place ${place.id}: bad costDays`);
  }
  for (const r of pack.residents) {
    if (!places.has(r.workPlace)) problems.push(`resident ${r.key}: unknown work place ${r.workPlace}`);
    if (!spaces.has(r.homeSpace)) problems.push(`resident ${r.key}: unknown home space ${r.homeSpace}`);
    if (!(r.age >= 0)) problems.push(`resident ${r.key}: bad age`);
  }
  for (const [role, key] of Object.entries(pack.autonomy ?? {})) {
    if (!residents.has(key)) problems.push(`autonomy role ${role}: unknown resident ${key}`);
  }
  if (!pack.autonomy) problems.push("autonomy roles are missing");
  for (const y of pack.yields) {
    if (!places.has(y.placeId)) problems.push(`yield ${y.resourceId}: unknown place ${y.placeId}`);
    if (!(y.capacity > 0) || !(y.renewDays > 0)) problems.push(`yield ${y.placeId}/${y.resourceId}: capacity and renewDays must be positive`);
    if (!pack.resourceLabels[y.resourceId]) problems.push(`yield ${y.resourceId}: no resource label`);
  }
  for (const p of pack.prototypes) {
    if (!(p.mass >= 0) || !(p.capacity >= 0)) problems.push(`prototype ${p.id}: mass and capacity must not be negative`);
  }
  for (const i of pack.instances) {
    if (!prototypes.has(i.prototypeId)) problems.push(`instance ${i.id}: unknown prototype ${i.prototypeId}`);
    if (!residents.has(i.owner)) problems.push(`instance ${i.id}: unknown owner ${i.owner}`);
    if (!spaces.has(i.inId) && !instances.has(i.inId)) problems.push(`instance ${i.id}: unknown location ${i.inId}`);
  }
  return problems;
}

/** Loads and validates a pack file; throws with every problem listed. */
export function loadSettlementPack(url: URL): SettlementPack {
  const pack = JSON.parse(readFileSync(url, "utf8")) as SettlementPack;
  const problems = validateSettlementPack(pack);
  if (problems.length > 0) {
    throw new Error(`settlement pack ${url.pathname} is invalid:\n  ${problems.join("\n  ")}`);
  }
  return pack;
}

/** The authored River Terrace village shipped with this module. */
export const RIVER_TERRACE_PACK: SettlementPack =
  loadSettlementPack(new URL("../data/river-terrace.json", import.meta.url));

// ---------------------------------------------------------------------------
// Recipes: what a resident can make from what they hold, and where.

export interface RecipeSpec {
  id: string;
  name: string;
  /** The place and the exact space the maker must stand in. */
  placeId: string;
  spaceId: string;
  /** Consumed: owned, held, live single objects of these prototypes. */
  inputs: { prototypeId: string; count: number }[];
  /** Kept: the maker must hold one of each. */
  tools: string[];
  /** Made: new objects owned and held by the maker. */
  outputs: { prototypeId: string; count: number }[];
  skill: string;
  description: string;
}

export interface RecipeBook {
  id: string;
  packId: string;
  formatVersion: number;
  recipes: RecipeSpec[];
}

export const RECIPE_BOOK_FORMAT = 1;

/** Every problem in a recipe book, checked against the pack it cooks for. */
export function validateRecipeBook(book: RecipeBook, pack: SettlementPack): string[] {
  const problems: string[] = [];
  if (book.formatVersion !== RECIPE_BOOK_FORMAT) problems.push(`recipe format ${book.formatVersion} is not ${RECIPE_BOOK_FORMAT}`);
  if (book.packId !== pack.id) problems.push(`recipe book is for pack ${book.packId}, not ${pack.id}`);
  if (!Array.isArray(book.recipes)) return [...problems, "recipes must be a list"];
  const prototypes = new Set(pack.prototypes.map((p) => p.id));
  const seen = new Set<string>();
  for (const r of book.recipes) {
    if (!r.id?.startsWith("recipe:")) problems.push(`recipe ${r.id}: id must start with recipe:`);
    if (seen.has(r.id)) problems.push(`duplicate recipe: ${r.id}`);
    seen.add(r.id);
    const place = pack.places.find((p) => p.id === r.placeId);
    if (!place) problems.push(`recipe ${r.id}: unknown place ${r.placeId}`);
    else if (!place.spaces.some((s) => s.id === r.spaceId)) problems.push(`recipe ${r.id}: space ${r.spaceId} is not in ${r.placeId}`);
    if (!Array.isArray(r.inputs) || r.inputs.length === 0) problems.push(`recipe ${r.id}: needs at least one input`);
    if (!Array.isArray(r.outputs) || r.outputs.length === 0) problems.push(`recipe ${r.id}: needs at least one output`);
    for (const part of [...(r.inputs ?? []), ...(r.outputs ?? [])]) {
      if (!prototypes.has(part.prototypeId)) problems.push(`recipe ${r.id}: unknown prototype ${part.prototypeId}`);
      if (!Number.isInteger(part.count) || part.count < 1 || part.count > 4) problems.push(`recipe ${r.id}: count of ${part.prototypeId} must be 1..4`);
    }
    for (const tool of r.tools ?? []) {
      if (!prototypes.has(tool)) problems.push(`recipe ${r.id}: unknown tool ${tool}`);
    }
    if (!r.name || !r.description) problems.push(`recipe ${r.id}: name and description are required`);
  }
  return problems;
}

export function loadRecipeBook(url: URL, pack: SettlementPack): RecipeBook {
  const book = JSON.parse(readFileSync(url, "utf8")) as RecipeBook;
  const problems = validateRecipeBook(book, pack);
  if (problems.length > 0) {
    throw new Error(`recipe book ${url.pathname} is invalid:\n  ${problems.join("\n  ")}`);
  }
  return book;
}

/** The River Terrace recipes shipped with this module. */
export const RIVER_TERRACE_RECIPES: RecipeBook =
  loadRecipeBook(new URL("../data/river-terrace-recipes.json", import.meta.url), RIVER_TERRACE_PACK);
