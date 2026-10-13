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
    if (!Number.isInteger(place.costDays) || place.costDays < 0) problems.push(`place ${place.id}: bad costDays`);
  }
  for (const r of pack.residents) {
    if (!places.has(r.workPlace)) problems.push(`resident ${r.key}: unknown work place ${r.workPlace}`);
    if (!spaces.has(r.homeSpace)) problems.push(`resident ${r.key}: unknown home space ${r.homeSpace}`);
    if (!(r.age >= 0)) problems.push(`resident ${r.key}: bad age`);
  }
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
