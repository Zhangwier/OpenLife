/**
 * The story pack: quests (main and side chains), dialogue trees, festival
 * rites, limited-time events, incidents and achievements. Pure data, loaded
 * from data/river-terrace.stories.json and checked against the settlement
 * pack it refers to (residents, prototypes, feasts, places, resources).
 */
import { readFileSync } from "node:fs";
import { RIVER_TERRACE_PACK, type SettlementPack } from "@openlife/module-settlement-locations";
import { BONDS_PACK } from "./bonds.ts";

export type BondChange = Partial<Record<"familiarity" | "trust" | "grudge", number>>;
export interface ItemGrant { prototype: string; name?: string }

/** What a quest step asks for. Auto objectives complete by themselves; `deliver` needs a hand-over. */
export type Objective =
  | { type: "counter"; counter: string; count: number }
  | { type: "talk"; npc: string; count: number }
  | { type: "distinctTalks"; count: number }
  | { type: "flag"; flag: string }
  | { type: "hearts"; npc: string; atLeast: number }
  | { type: "deliver"; npc: string; resource: string | string[]; count: number }
  /** Reach at least this relationship tier with `count` villagers. */
  | { type: "tiers"; tier: string; count: number }
  /** Another quest is finished (a main chapter that waits on a side story). */
  | { type: "questDone"; quest: string };

export interface Requirements {
  flags?: string[];
  notFlags?: string[];
  hearts?: Record<string, number>;
  questsDone?: string[];
  /** Dialogue only: the speaker's hearts towards the player. */
  minHearts?: number;
  /** Dialogue only: quest id -> the step id it must currently be on. */
  quest?: Record<string, string>;
  /** Needs one owned item of this resource in hand (consumed when `consume`). */
  resource?: string;
  /** Dialogue only: the speaker's relationship tier with the player is at least this. */
  minTier?: string;
  /** Relationship tier with named villagers is at least this. */
  tierWith?: Record<string, string>;
  /** Dialogue only: true = only while the speaker holds a grudge (feud); false = never then. */
  feud?: boolean;
  /** Only in these seasons (春/夏/秋/冬). */
  season?: string[];
  /** Only on a wet (rain/snow) or a dry day. */
  weather?: "wet" | "dry";
}

export interface Reward {
  items?: ItemGrant[];
  bond?: Record<string, BondChange>;
  bondAll?: BondChange;
  flags?: string[];
}

export interface QuestStep { id: string; text: string; objective: Objective; doneLine?: string }
export interface QuestSpec {
  id: string; kind: "main" | "side"; chapter?: number; title: string;
  giver?: string; autoOffer?: boolean; requires?: Requirements;
  summary: string; acceptLine: string; steps: QuestStep[]; reward?: Reward; completeLine: string;
}

export interface DialogueOption {
  id: string; label: string; next?: string; requires?: Requirements;
  effects?: { bond?: BondChange; setFlags?: string[]; line?: string };
}
export interface DialogueTree { start: string; nodes: Record<string, { text: string; options: DialogueOption[] }> }

/** A way to keep a feast. A feast may have several; the player keeps it once a year, in one of them. */
export interface FestivalRite { feast: string; id?: string; label: string; line: string; requires?: Requirements; reward?: Reward }

export interface EventOffer { id: string; label?: string; give?: string; get?: ItemGrant; bond?: Record<string, BondChange>; line: string; requires?: Requirements }
export interface LimitedEvent {
  id: string; name: string; window: { month: number; from: number; to: number };
  placeId: string; intro: string; offers: EventOffer[];
}

export interface IncidentChoice extends Reward {
  id: string; label: string; line: string; requires?: Requirements; consume?: boolean; setFlags?: string[];
}
/**
 * A sudden happening. Which one comes on a day is drawn from the day itself
 * (same day, same draw), among the incidents whose trigger holds: season,
 * weather, story requirements (flags set by an earlier incident make chains),
 * `once` for those that happen a single time, and `weight` for how often.
 */
export interface IncidentSpec {
  id: string; title: string; text: string; seasons?: string[]; choices: IncidentChoice[];
  weather?: "wet" | "dry"; requires?: Requirements; once?: boolean; weight?: number;
}

export type AchievementCondition =
  | { counter: string; atLeast: number }
  | { distinctTalks: number }
  | { questDone: string }
  | { questsDone: { kind: "main" | "side"; atLeast: number } }
  | { anyHearts: number }
  | { flag: string }
  | { flags: string[] }
  | { tierCount: { tier: string; atLeast: number } };
/** `hidden` ones show as「？？？」until earned; `category` groups them on the page. */
export interface AchievementSpec { id: string; name: string; text: string; condition: AchievementCondition; hidden?: boolean; category?: string }

export interface StoryPack {
  id: string; formatVersion: number; note?: string;
  quests: QuestSpec[];
  dialogues: Record<string, DialogueTree>;
  festivalRites: FestivalRite[];
  limitedEvents: LimitedEvent[];
  incidents: { chance: number; list: IncidentSpec[] };
  achievements: AchievementSpec[];
}

export const STORY_PACK: StoryPack = JSON.parse(
  readFileSync(new URL("../data/river-terrace.stories.json", import.meta.url), "utf8"),
) as StoryPack;

/** Every reference the story pack makes must exist in the settlement pack. Returns problems, [] when sound. */
export function storyPackProblems(story: StoryPack = STORY_PACK, pack: SettlementPack = RIVER_TERRACE_PACK): string[] {
  const problems: string[] = [];
  const residents = new Set(pack.residents.map((r) => r.key));
  const prototypes = new Set(pack.prototypes.map((p) => p.id));
  const resources = new Set(Object.keys(pack.resourceLabels));
  const places = new Set(pack.places.map((p) => p.id));
  const feasts = new Set((pack.happenings?.feasts ?? []).map((f) => f.id));
  const quests = new Map(story.quests.map((q) => [q.id, q]));
  const tiers = new Set(BONDS_PACK.tiers.map((t) => t.id));
  const settable = new Set<string>();
  for (const q of story.quests) for (const f of q.reward?.flags ?? []) settable.add(f);
  for (const t of Object.values(story.dialogues)) for (const n of Object.values(t.nodes)) for (const o of n.options) for (const f of o.effects?.setFlags ?? []) settable.add(f);
  for (const i of story.incidents.list) for (const c of i.choices) for (const f of c.setFlags ?? []) settable.add(f);
  for (const t of BONDS_PACK.tierEvents) for (const f of t.reward?.flags ?? []) settable.add(f);
  for (const r of story.festivalRites) for (const f of r.reward?.flags ?? []) settable.add(f);

  const npc = (key: string, where: string) => { if (!residents.has(key)) problems.push(`${where}: unknown resident ${key}`); };
  const item = (g: ItemGrant, where: string) => { if (!prototypes.has(g.prototype)) problems.push(`${where}: unknown prototype ${g.prototype}`); };
  const resource = (r: string, where: string) => { if (!resources.has(r)) problems.push(`${where}: unknown resource ${r}`); };
  const reward = (r: Reward | undefined, where: string) => {
    for (const g of r?.items ?? []) item(g, where);
    for (const k of Object.keys(r?.bond ?? {})) npc(k, where);
  };
  const requires = (r: Requirements | undefined, where: string) => {
    for (const f of [...(r?.flags ?? []), ...(r?.notFlags ?? [])]) if (!settable.has(f)) problems.push(`${where}: flag ${f} is never set`);
    for (const k of Object.keys(r?.hearts ?? {})) npc(k, where);
    for (const q of r?.questsDone ?? []) if (!quests.has(q)) problems.push(`${where}: unknown quest ${q}`);
    for (const [q, step] of Object.entries(r?.quest ?? {})) {
      if (!quests.get(q)?.steps.some((s) => s.id === step)) problems.push(`${where}: quest ${q} has no step ${step}`);
    }
    if (r?.resource) resource(r.resource, where);
    if (r?.minTier && !tiers.has(r.minTier)) problems.push(`${where}: unknown tier ${r.minTier}`);
    for (const [k, t] of Object.entries(r?.tierWith ?? {})) { npc(k, where); if (!tiers.has(t)) problems.push(`${where}: unknown tier ${t}`); }
    for (const s of r?.season ?? []) if (!["春", "夏", "秋", "冬"].includes(s)) problems.push(`${where}: unknown season ${s}`);
    if (r?.weather && !["wet", "dry"].includes(r.weather)) problems.push(`${where}: weather must be wet or dry`);
  };

  const ids = new Set<string>();
  for (const q of story.quests) {
    const where = `quest ${q.id}`;
    if (ids.has(q.id)) problems.push(`${where}: duplicate id`);
    ids.add(q.id);
    if (q.giver) npc(q.giver, where);
    if (!q.steps.length) problems.push(`${where}: has no steps`);
    requires(q.requires, where);
    reward(q.reward, where);
    for (const s of q.steps) {
      const o = s.objective;
      if ("npc" in o) npc(o.npc, `${where} step ${s.id}`);
      if (o.type === "flag" && !settable.has(o.flag)) problems.push(`${where} step ${s.id}: flag ${o.flag} is never set`);
      if (o.type === "deliver") for (const r of [o.resource].flat()) resource(r, `${where} step ${s.id}`);
      if (o.type === "tiers" && !tiers.has(o.tier)) problems.push(`${where} step ${s.id}: unknown tier ${o.tier}`);
      if (o.type === "questDone" && (!quests.has(o.quest) || o.quest === q.id)) problems.push(`${where} step ${s.id}: unknown quest ${o.quest}`);
      if ("count" in o && !(o.count > 0)) problems.push(`${where} step ${s.id}: count must be positive`);
    }
  }
  for (const [key, tree] of Object.entries(story.dialogues)) {
    npc(key, `dialogue ${key}`);
    if (!tree.nodes[tree.start]) problems.push(`dialogue ${key}: start node ${tree.start} missing`);
    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      if (!node.options.length) problems.push(`dialogue ${key}.${nodeId}: no options (dead end)`);
      for (const o of node.options) {
        if (o.next && !tree.nodes[o.next]) problems.push(`dialogue ${key}.${nodeId}.${o.id}: next ${o.next} missing`);
        requires(o.requires, `dialogue ${key}.${nodeId}.${o.id}`);
      }
    }
  }
  const riteIds = new Set<string>();
  for (const r of story.festivalRites) {
    const rid = `${r.feast}:${r.id ?? ""}`;
    if (riteIds.has(rid)) problems.push(`rite ${rid}: two ways to keep a feast need different ids`);
    riteIds.add(rid);
    if (!feasts.has(r.feast)) problems.push(`rite ${r.feast}: unknown feast`);
    requires(r.requires, `rite ${r.feast}`);
    reward(r.reward, `rite ${r.feast}`);
  }
  for (const e of story.limitedEvents) {
    if (!places.has(e.placeId)) problems.push(`event ${e.id}: unknown place ${e.placeId}`);
    if (e.window.from > e.window.to || e.window.month < 1 || e.window.month > 12) problems.push(`event ${e.id}: bad window`);
    for (const o of e.offers) {
      if (o.give) resource(o.give, `event ${e.id}.${o.id}`);
      if (o.get) item(o.get, `event ${e.id}.${o.id}`);
      for (const k of Object.keys(o.bond ?? {})) npc(k, `event ${e.id}.${o.id}`);
      requires(o.requires, `event ${e.id}.${o.id}`);
    }
  }
  for (const i of story.incidents.list) {
    if (!i.choices.length) problems.push(`incident ${i.id}: no choices`);
    requires(i.requires, `incident ${i.id}`);
    if (i.requires?.resource || i.requires?.minTier || i.requires?.minHearts !== undefined || i.requires?.quest) problems.push(`incident ${i.id}: a trigger may test flags, quests, hearts, tiers, season and weather only`);
    if (i.weather && !["wet", "dry"].includes(i.weather)) problems.push(`incident ${i.id}: weather must be wet or dry`);
    if (i.weight !== undefined && !(Number.isInteger(i.weight) && i.weight >= 1 && i.weight <= 5)) problems.push(`incident ${i.id}: weight must be 1-5`);
    for (const c of i.choices) { requires(c.requires, `incident ${i.id}.${c.id}`); reward(c, `incident ${i.id}.${c.id}`); }
  }
  for (const a of story.achievements) {
    const c = a.condition;
    if ("questDone" in c && !quests.has(c.questDone)) problems.push(`achievement ${a.id}: unknown quest ${c.questDone}`);
    if ("flag" in c && !settable.has(c.flag)) problems.push(`achievement ${a.id}: flag ${c.flag} is never set`);
    if ("flags" in c) for (const f of c.flags) if (!settable.has(f) && !f.startsWith("served:")) problems.push(`achievement ${a.id}: flag ${f} is never set`);
    if ("tierCount" in c && !tiers.has(c.tierCount.tier)) problems.push(`achievement ${a.id}: unknown tier ${c.tierCount.tier}`);
  }
  return problems;
}
