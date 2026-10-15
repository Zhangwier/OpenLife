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
  /** Personality, each 0..100: drives what a villager's brain values (optional; derived from the key when absent). */
  personality?: Personality;
  /** Bodily and mental capacities, each 1..10 (optional; derived from age and key when absent). */
  attributes?: Attributes;
}

export interface Personality { diligence: number; sociability: number; generosity: number; caution: number; curiosity: number }
export interface Attributes { strength: number; dexterity: number; wits: number }

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

export interface YieldSpec {
  placeId: string; resourceId: string; label: string; capacity: number; renewDays: number; unit: string;
  /** Renewal scales with population: one unit per this many villagers per cycle (rounded up). */
  perResidents?: number;
  /** Seasons (春/夏/秋/冬) in which it grows back; omitted = all year. */
  seasons?: string[];
}

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
  /**
   * General exchange: each resource's base worth, and what each resident needs
   * for their work or wish (worth half again as much to them). Optional: a
   * pack without it only knows the fixed barter offers.
   */
  exchange?: { values: Record<string, number>; wants: Record<string, string[]> };
  /**
   * Generic recipes: inputs + tool + workplace + time → one output object.
   * Inputs are real carried things the maker owns; the tool may be in hand
   * (owned or borrowed) or lying at the workplace. Optional: a pack without
   * recipes only has the built-in crafts.
   */
  recipes?: RecipeSpec[];
}

export interface RecipeSpec {
  id: string;
  label: string;
  hint: string;
  spaceId: string;
  /** minAgeDays: the input must have been made at least that many days ago (greenware must dry). */
  inputs: Array<{ resourceId: string; count: number; minAgeDays?: number }>;
  /** Needs a dry day (no rain or snow), e.g. firing the kiln. */
  dryOnly?: boolean;
  tool?: string;
  activity: number;
  seasons?: string[];
  /** A dedicated older command that runs this recipe too (kept so old clients and saves keep working). */
  command?: string;
  /** Upkeep instead of a new object: e.g. mending the roof of the home the maker stands in. */
  repairs?: "roof";
  output?: {
    prototypeId: string; name: string; durability: number;
    condition?: string;
    /** Several outputs; with perInput, one per consumed input. */
    count?: number; perInput?: boolean;
    /** Stable id: prefix + first input id (or + each input id when perInput). */
    idPrefix?: string;
  };
  /** Provenance written on each output. "$inputs" = all input ids, "$input" = this output's input. */
  provenance?: Record<string, string>;
  /** Event to emit instead of the generic crafted event. "$output", "$outputs", "$inputs", "$count" are filled in. */
  event?: { type: string; data?: Record<string, string | number>; significance?: number };
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
    if (y.seasons && !y.seasons.every((x) => ["春", "夏", "秋", "冬"].includes(x))) problems.push(`yield ${y.placeId}/${y.resourceId}: unknown season`);
    if (y.perResidents !== undefined && !(y.perResidents > 0)) problems.push(`yield ${y.placeId}/${y.resourceId}: perResidents must be positive`);
  }
  for (const p of pack.prototypes) {
    if (!(p.mass >= 0) || !(p.capacity >= 0)) problems.push(`prototype ${p.id}: mass and capacity must not be negative`);
  }
  for (const i of pack.instances) {
    if (!prototypes.has(i.prototypeId)) problems.push(`instance ${i.id}: unknown prototype ${i.prototypeId}`);
    if (!residents.has(i.owner)) problems.push(`instance ${i.id}: unknown owner ${i.owner}`);
    if (!spaces.has(i.inId) && !instances.has(i.inId)) problems.push(`instance ${i.id}: unknown location ${i.inId}`);
  }
  for (const [key, list] of Object.entries(pack.exchange?.wants ?? {})) {
    if (!residents.has(key)) problems.push(`exchange wants: unknown resident ${key}`);
    for (const r of list) if (!pack.resourceLabels[r]) problems.push(`exchange wants ${key}: unknown resource ${r}`);
  }
  const spaceIds = new Set(pack.places.flatMap((p) => p.spaces.map((sp) => sp.id)));
  const protoIds = new Set(pack.prototypes.map((p) => p.id));
  const recipeIds = new Set<string>();
  for (const r of pack.recipes ?? []) {
    if (recipeIds.has(r.id)) problems.push(`recipe ${r.id}: duplicate id`);
    recipeIds.add(r.id);
    if (r.spaceId !== "@home" && !spaceIds.has(r.spaceId)) problems.push(`recipe ${r.id}: unknown space ${r.spaceId}`);
    if (!r.output && !r.repairs) problems.push(`recipe ${r.id}: needs an output or a repair`);
    if (r.output && !protoIds.has(r.output.prototypeId)) problems.push(`recipe ${r.id}: unknown output ${r.output!.prototypeId}`);
    if (r.tool && !protoIds.has(r.tool)) problems.push(`recipe ${r.id}: unknown tool ${r.tool}`);
    if (!(r.activity >= 1 && r.activity <= 8)) problems.push(`recipe ${r.id}: activity must be 1-8`);
    for (const i of r.inputs) {
      if (!pack.resourceLabels[i.resourceId]) problems.push(`recipe ${r.id}: unknown input ${i.resourceId}`);
      if (!(i.count >= 1 && i.count <= 4)) problems.push(`recipe ${r.id}: input count must be 1-4`);
    }
  }
  for (const [r, v] of Object.entries(pack.exchange?.values ?? {})) {
    if (!pack.resourceLabels[r]) problems.push(`exchange value: unknown resource ${r}`);
    if (!(v > 0)) problems.push(`exchange value ${r}: must be positive`);
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
