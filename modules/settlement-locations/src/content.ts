/**
 * Settlement content pack (M5-A): the village as data, the rules as code.
 *
 * Residents, places and their spaces, renewing yields, object prototypes,
 * resource labels and the starting objects live in `data/<pack>.json`. This
 * file loads a pack and validates every cross reference before the module
 * uses it, so a broken pack fails loudly at load instead of mid-game.
 */
import { existsSync, readFileSync } from "node:fs";
import type { OriginSpec, TalentSpec } from "./origin.ts";

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
  /** A thing that would answer their wish if someone gave it to them. */
  wishItem?: string;
  /** Or a deed: lending a hand where they work, or simply listening, a few times after you know the wish. */
  wishDeed?: { helps?: number; talks?: number; learns?: number };
  /** A craft this person can teach you, a lesson at a time, once they know you well enough. */
  teaches?: TeachSpec;
  /** Personality, each 0..100: drives what a villager's brain values (optional; derived from the key when absent). */
  personality?: Personality;
  /** Bodily and mental capacities, each 1..10 (optional; derived from age and key when absent). */
  attributes?: Attributes;
}

export interface TeachSpec {
  skill: string; name: string; blurb: string;
  /** Lessons needed (one per day). */
  lessons: number;
  /** Recipes that take one unit less once learned. */
  recipes?: string[];
  /** Extra things gathered at these places once learned (place|resource keys). */
  drawBonus?: string[];
  /** What the teacher says at each lesson ({name}), and when you have it. */
  lines: string[];
  learned: string;
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
  /** Where a new life comes from: story, first wish, starting things, who already knows you. */
  origins?: OriginSpec[];
  /** Gentle strengths a new life may start with (one or two). */
  talents?: TalentSpec[];
  /** What working at a worksite really does: gather from the place, dry greenware, help whoever is there, or hear news. */
  worksites?: Record<string, WorksiteSpec>;
  /** Thank-you lines when you lend a hand ({name} is the villager). */
  thanks?: string[];
  /** What villagers say when you talk to them, by how well they know you, plus topical lines. */
  dialogue?: {
    stranger: string[]; met: string[]; acquainted: string[]; trusted: string[]; grudge: string[];
    weather: Record<string, string>;
    wishReveal: string; owes: string; remembersHelp: string; hungry: string; wishDone?: string;
    wishThanks?: string; giftThanks?: string[]; giftPlain?: string[];
  };
  /** Feasts on the calendar and short spells of illness (see happenings.ts). */
  happenings?: import("./happenings.ts").HappeningsSpec;
  /** A few lines in each villager's own voice (by resident key). */
  residentLines?: Record<string, string[]>;
  /** Who each villager is as a person: tastes, birthday, moods, story scenes, ties (from `<pack>.people.json`). */
  people?: Record<string, PersonSpec>;
  /** 「这一季就这么过」：日子一季一季地过，按你把心思放在哪儿结算。 */
  seasonLife?: SeasonLifeSpec;
  /** 成家以后：添丁、孩子的名字、一年年长大。 */
  family?: { names: string[]; expecting: string; born: string; grows: string; stages: Array<[number, string]> };
  /** 村里一季一季的大事：年景、天灾、来客；村民之间结亲、添丁；渡口来的新人。 */
  storyteller?: {
    chance: number;
    events: StoryEventSpec[];
    couple: string; npcBirth: string; newcomer: string; newcomerNames: string[]; newcomerFrom: string[];
  };
}

/**
 * One village event. Beyond its season, an event may declare **preconditions**
 * (`requires`) and a **cooldown**, so it can only happen where it makes sense:
 * a bad harvest means nothing in a village with no field, and a wildfire should
 * not come twice in a row. When several qualify, the pick is deterministic.
 *
 * `yields` is the observable consequence: it scales real gathering points, so
 * the player can see and feel the event rather than only read about it.
 */
export interface StoryEventSpec {
  id: string;
  seasons: string[];
  text: string;
  yields?: Record<string, number>;
  /** Only eligible when the village really is in this state. */
  requires?: {
    /** Living villagers, inclusive bounds. */
    population?: { min?: number; max?: number };
    /** Sum of a resource across every place is below this. */
    stockBelow?: Array<{ resourceId: string; amount: number }>;
    /** Sum of a resource across every place is at least this. */
    stockAtLeast?: Array<{ resourceId: string; amount: number }>;
    /** Some home's roof is leaking (or none is). */
    roofLeaking?: boolean;
  };
  /** How many world years must pass before this same event may repeat. */
  cooldownYears?: number;
  /**
   * Tie the story to a tracked hazard (world-hazard state on `at`): when the
   * place is tracked, the story is told exactly when that hazard struck this
   * season, and never otherwise. Untracked worlds keep the old random draw.
   */
  hazard?: "flood" | "drought";
  at?: string;
  /** Never told in a season when this tracked hazard struck (a bumper year after a drought). */
  excludes?: "flood" | "drought";
}

export interface SeasonLifeSpec {
  focuses: Array<{
    id: string; label: string; hint: string;
    /** Who you spend the season with: resident keys, "*" for everyone, "family" for the people you live with. */
    with: string[] | "*" | "family";
    gains: Partial<Record<"春" | "夏" | "秋" | "冬", Array<[string, number]>>>;
    line: Record<"春" | "夏" | "秋" | "冬", string>;
  }>;
  missed: string; closer: string; learned: string;
}

/** 一个村民的为人：喜好、生日、心情话、季节话、交情到了才讲的往事、与别人的亲疏。 */
export interface PersonSpec {
  sex?: "female" | "male";
  loves: string[]; likes: string[]; dislikes: string[];
  birthday: { month: number; day: number };
  giftLines?: { love?: string; dislike?: string };
  seasons?: Partial<Record<"春" | "夏" | "秋" | "冬", string[]>>;
  happy?: string[]; low?: string[];
  /** Told once, at the first talk after the bond reaches this many hearts. */
  heartEvents?: Array<{ hearts: number; text: string }>;
  /** How this villager feels about another (−5..5) and what they say about them. */
  ties?: Record<string, { relation: string; warmth: number; line?: string }>;
  /** 可以结亲的人：你表明心意时，答应或「再等等」怎么说。 */
  court?: { accept: string; notYet: string };
}

export interface WorksiteSpec {
  label: string; hint: string;
  gain?: { resourceId: string; count: number };
  dries?: boolean;
  helps?: boolean;
  rumor?: boolean;
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
    if (r.wishItem && !pack.resourceLabels[r.wishItem]) problems.push(`resident ${r.key}: unknown wish item ${r.wishItem}`);
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
  for (const [spaceId, w] of Object.entries(pack.worksites ?? {})) {
    if (!spaceIds.has(spaceId)) problems.push(`worksite ${spaceId}: unknown space`);
    if (w.gain) {
      const place = pack.places.find((pl) => pl.spaces.some((sp) => sp.id === spaceId));
      if (!pack.yields.some((y) => y.placeId === place?.id && y.resourceId === w.gain!.resourceId))
        problems.push(`worksite ${spaceId}: ${w.gain.resourceId} is not yielded there`);
      if (!(w.gain.count >= 1 && w.gain.count <= 3)) problems.push(`worksite ${spaceId}: gain count must be 1-3`);
    }
  }
  for (const key of Object.keys(pack.residentLines ?? {})) if (!residents.has(key)) problems.push(`residentLines: unknown resident ${key}`);
  dup("origin", (pack.origins ?? []).map((o) => o.id));
  dup("talent", (pack.talents ?? []).map((t) => t.id));
  const startItems = [...(pack.origins ?? []).flatMap((o) => o.items.map((i) => [`origin ${o.id}`, i] as const)),
    ...(pack.talents ?? []).flatMap((t) => (t.items ?? []).map((i) => [`talent ${t.id}`, i] as const))];
  for (const [who, item] of startItems) {
    if (!protoIds.has(item.prototypeId)) problems.push(`${who}: unknown start item ${item.prototypeId}`);
    if (!(item.count >= 1 && item.count <= 3)) problems.push(`${who}: start item count must be 1-3`);
  }
  for (const o of pack.origins ?? []) {
    for (const key of Object.keys(o.bonds ?? {})) if (!residents.has(key)) problems.push(`origin ${o.id}: unknown resident ${key}`);
  }
  for (const f of pack.happenings?.feasts ?? []) {
    if (!places.has(f.placeId)) problems.push(`feast ${f.id}: unknown place ${f.placeId}`);
    if (!(f.month >= 1 && f.month <= 12 && f.day >= 1 && f.day <= 30)) problems.push(`feast ${f.id}: bad date`);
  }
  for (const r of pack.happenings?.illness?.helps ?? []) if (!pack.resourceLabels[r]) problems.push(`illness helps: unknown resource ${r}`);
  const keys = new Set(pack.residents.map((r) => r.key));
  for (const [key, person] of Object.entries(pack.people ?? {})) {
    if (!keys.has(key)) problems.push(`people: unknown resident ${key}`);
    for (const r of [...person.loves, ...person.likes, ...person.dislikes]) if (!pack.resourceLabels[r]) problems.push(`people ${key}: unknown resource ${r}`);
    if (!(person.birthday.month >= 1 && person.birthday.month <= 12 && person.birthday.day >= 1 && person.birthday.day <= 30)) problems.push(`people ${key}: bad birthday`);
    for (const other of Object.keys(person.ties ?? {})) if (!keys.has(other)) problems.push(`people ${key}: tie to unknown ${other}`);
  }
  for (const [r, v] of Object.entries(pack.exchange?.values ?? {})) {
    if (!pack.resourceLabels[r]) problems.push(`exchange value: unknown resource ${r}`);
    if (!(v > 0)) problems.push(`exchange value ${r}: must be positive`);
  }
  const storyIds = dup("story event", (pack.storyteller?.events ?? []).map((e) => e.id));
  void storyIds;
  for (const e of pack.storyteller?.events ?? []) {
    if (!e.text) problems.push(`story ${e.id}: needs text`);
    if (!Array.isArray(e.seasons) || !e.seasons.length) problems.push(`story ${e.id}: needs seasons`);
    for (const s of e.seasons) if (!["春", "夏", "秋", "冬"].includes(s)) problems.push(`story ${e.id}: unknown season ${s}`);
    for (const where of Object.keys(e.yields ?? {})) {
      const parts = where.split(":");
      // "place:<name>:<resource>:<sub>" - the place and resource must exist.
      const placeId = parts.slice(0, 2).join(":");
      const resourceId = parts.slice(2).join(":");
      if (!places.has(placeId)) problems.push(`story ${e.id}: unknown place ${placeId}`);
      if (!pack.yields.some((y) => y.placeId === placeId && y.resourceId === resourceId))
        problems.push(`story ${e.id}: ${resourceId} is not yielded at ${placeId}`);
    }
    for (const key of ["stockBelow", "stockAtLeast"] as const) {
      for (const cond of e.requires?.[key] ?? []) {
        if (!pack.resourceLabels[cond.resourceId]) problems.push(`story ${e.id}: unknown resource ${cond.resourceId}`);
        if (!(cond.amount >= 0)) problems.push(`story ${e.id}: ${key} amount must not be negative`);
      }
    }
    const pop = e.requires?.population;
    if (pop && (pop.min ?? 0) > (pop.max ?? Infinity)) problems.push(`story ${e.id}: population min exceeds max`);
    if (e.cooldownYears !== undefined && !(e.cooldownYears >= 0)) problems.push(`story ${e.id}: cooldownYears must not be negative`);
    // A hazard-tied story needs the place whose tracked state it reads.
    for (const kind of [e.hazard, e.excludes]) {
      if (kind === undefined) continue;
      if (!["flood", "drought"].includes(kind)) problems.push(`story ${e.id}: unknown hazard ${kind}`);
      if (!e.at || !places.has(e.at)) problems.push(`story ${e.id}: hazard ${kind} needs a known place in "at"`);
    }
  }
  return problems;
}

/** Loads and validates a pack file; throws with every problem listed. */
export function loadSettlementPack(url: URL): SettlementPack {
  const pack = JSON.parse(readFileSync(url, "utf8")) as SettlementPack;
  // 村民的为人写在旁边的 <pack>.people.json 里（没有也行）。
  const peopleUrl = new URL(url.href.replace(/\.json$/, ".people.json"));
  if (!pack.people && existsSync(peopleUrl)) pack.people = JSON.parse(readFileSync(peopleUrl, "utf8")) as Record<string, PersonSpec>;
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


/**
 * A recipe in a standalone recipe book (`<pack>-recipes.json`): prototypes in,
 * prototypes out, at a place's space. Not the pack's own `recipes` list
 * (RecipeSpec), which works in resources and carries its own command.
 */
export interface BookRecipeSpec {
  id: string;
  name: string;
  description: string;
  placeId: string;
  spaceId: string;
  inputs: Array<{ prototypeId: string; count: number }>;
  outputs: Array<{ prototypeId: string; count: number }>;
  tools?: string[];
  skill?: string;
}

export interface RecipeBook {
  id: string;
  packId: string;
  formatVersion: number;
  recipes: BookRecipeSpec[];
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

/**
 * The recipe book's recipes made playable: each becomes an ordinary pack
 * recipe (resources in, a prototype out, at its space), so the existing craft
 * command, its checks, the action list and the codex all pick it up. Before
 * this the book was loaded and validated but nothing could ever cook from it.
 */
export function playableBookRecipes(book: RecipeBook, pack: SettlementPack): RecipeSpec[] {
  const proto = (id: string) => pack.prototypes.find((p) => p.id === id) as { id: string; name?: string; resourceId?: string; durability?: number } | undefined;
  return book.recipes.map((r) => {
    const out = r.outputs[0]!;
    const made = proto(out.prototypeId);
    return {
      id: r.id,
      label: r.name,
      hint: r.description,
      spaceId: r.spaceId,
      inputs: r.inputs.map((i) => ({ resourceId: String(proto(i.prototypeId)?.resourceId ?? ""), count: i.count })),
      ...(r.tools?.[0] ? { tool: r.tools[0] } : {}),
      // Firing needs a dry day, like every other kiln recipe.
      ...(r.spaceId === "space:kiln-mouth" ? { dryOnly: true } : {}),
      activity: r.inputs.reduce((n, i) => n + i.count, 0) >= 3 ? 2 : 1,
      output: {
        prototypeId: out.prototypeId,
        name: String(made?.name ?? r.name),
        durability: Number(made?.durability ?? 20),
        ...(out.count > 1 ? { count: out.count } : {}),
      },
    };
  });
}

for (const recipe of playableBookRecipes(RIVER_TERRACE_RECIPES, RIVER_TERRACE_PACK)) {
  RIVER_TERRACE_PACK.recipes ??= [];
  if (!RIVER_TERRACE_PACK.recipes.some((r) => r.id === recipe.id)) RIVER_TERRACE_PACK.recipes.push(recipe);
}
