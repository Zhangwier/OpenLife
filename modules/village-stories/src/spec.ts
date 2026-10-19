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
  | { type: "questDone"; quest: string }
  /** A turning point: the player picks one way (command quest.decide); each way sets its own flags, so later quests branch. */
  | { type: "decide"; npc?: string; options: DecideOption[] };

export interface DecideOption { id: string; label: string; line: string; flags?: string[]; bond?: Record<string, BondChange>; requires?: Requirements }

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
  /** Only while the player goes by this title (earned from an achievement). */
  title?: string;
  /** These quests ran out of time and failed. */
  questsFailed?: string[];
}

export interface Reward {
  items?: ItemGrant[];
  bond?: Record<string, BondChange>;
  bondAll?: BondChange;
  flags?: string[];
}

/** `intro` is told when the step begins; `doneLine` when it is done (a hand-over tells its own). */
export interface QuestStep { id: string; text: string; objective: Objective; doneLine?: string; intro?: string }
export interface QuestSpec {
  id: string; kind: "main" | "side"; chapter?: number; title: string;
  giver?: string; autoOffer?: boolean; requires?: Requirements;
  /** Begins by itself the moment its requirements hold (a branch the player's choice just opened). */
  autoStart?: boolean;
  summary: string; acceptLine: string; steps: QuestStep[]; reward?: Reward; completeLine: string;
  /** A timed errand: it fails when not done within this many days of accepting it. */
  deadlineDays?: number;
  /** Told when it fails; `failReward` (usually flags) opens what a failure leads to. */
  failLine?: string; failReward?: Reward;
}

/**
 * `once`: a thing said only once in a life (it then disappears, and sets the
 * flag `said:<npc>.<node>.<option>`). `bondOthers`: what you say reaches other
 * villagers too (praise travels to a friend, a slight to a rival).
 */
export interface DialogueOption {
  id: string; label: string; next?: string; requires?: Requirements; once?: boolean;
  effects?: { bond?: BondChange; bondOthers?: Record<string, BondChange>; setFlags?: string[]; line?: string };
}
export const saidFlag = (npc: string, node: string, option: string) => `said:${npc}.${node}.${option}`;
export interface DialogueTree { start: string; nodes: Record<string, { text: string; options: DialogueOption[] }> }

/** A way to keep a feast. A feast may have several; the player keeps it once a year, in one of them. */
export interface FestivalRite { feast: string; id?: string; label: string; line: string; requires?: Requirements; reward?: Reward; streak?: StreakStep[] }
/** Keeping the same feast `years` years running (any way of keeping it) adds this line and reward that year. */
export interface StreakStep { years: number; line: string; reward?: Reward }

/** `limit`: how many times a year this offer can be taken (default: as often as visits allow). */
export interface EventOffer { id: string; label?: string; give?: string; get?: ItemGrant; bond?: Record<string, BondChange>; line: string; requires?: Requirements; limit?: number }
/**
 * `visits`: how many times a year the player can join (default 1). `complete`:
 * told and given once a year when every offer has been taken that year.
 */
export interface LimitedEvent {
  id: string; name: string; window: { month: number; from: number; to: number };
  placeId: string; intro: string; offers: EventOffer[]; visits?: number; complete?: { line: string; reward?: Reward };
}

export interface IncidentChoice extends Reward {
  id: string; label: string; line: string; requires?: Requirements; consume?: boolean; setFlags?: string[];
  /** A delayed consequence: this incident comes, for sure, `afterDays` days later. */
  followUp?: { incident: string; afterDays: number };
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
  /** Never drawn at random: it only comes as the follow-up of an earlier choice. */
  followUpOnly?: boolean;
  /** A sign shown the day before a scheduled follow-up comes. */
  omen?: string;
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
export interface AchievementSpec {
  id: string; name: string; text: string; condition: AchievementCondition; hidden?: boolean; category?: string;
  /** Claimed once with the command achievement.claim after it is earned. */
  reward?: Reward;
  /** A title the player may go by once it is earned (command title.set); villagers notice it. */
  title?: string;
}

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
  for (const r of story.festivalRites) for (const s of r.streak ?? []) for (const f of s.reward?.flags ?? []) settable.add(f);
  for (const q of story.quests) for (const f of q.failReward?.flags ?? []) settable.add(f);
  for (const q of story.quests) for (const s of q.steps) if (s.objective.type === "decide") for (const o of s.objective.options) for (const f of o.flags ?? []) settable.add(f);
  for (const e of story.limitedEvents) for (const f of e.complete?.reward?.flags ?? []) settable.add(f);
  for (const a of story.achievements) for (const f of a.reward?.flags ?? []) settable.add(f);
  for (const i of story.incidents.list) for (const c of i.choices) for (const f of c.flags ?? []) settable.add(f);
  const titles = new Set(story.achievements.flatMap((a) => (a.title ? [a.title] : [])));
  for (const [k, t] of Object.entries(story.dialogues)) for (const [nid, n] of Object.entries(t.nodes)) for (const o of n.options) if (o.once) settable.add(saidFlag(k, nid, o.id));
  // Taking a side in (or settling) a quarrel between two villagers: quarrel:<a>~<b>:<a|b|mediate>, plus :sided for either side.
  for (const e of BONDS_PACK.network) if (e.quarrel) for (const side of ["a", "b", "mediate", "sided"]) settable.add(`quarrel:${e.a}~${e.b}:${side}`);

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
    if (r?.title && !titles.has(r.title)) problems.push(`${where}: no achievement gives the title ${r.title}`);
    for (const q of r?.questsFailed ?? []) if (!quests.get(q)?.deadlineDays) problems.push(`${where}: quest ${q} has no deadline, it cannot fail`);
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
      if ("npc" in o && o.npc) npc(o.npc, `${where} step ${s.id}`);
      if (o.type === "flag" && !settable.has(o.flag)) problems.push(`${where} step ${s.id}: flag ${o.flag} is never set`);
      if (o.type === "deliver") for (const r of [o.resource].flat()) resource(r, `${where} step ${s.id}`);
      if (o.type === "tiers" && !tiers.has(o.tier)) problems.push(`${where} step ${s.id}: unknown tier ${o.tier}`);
      if (o.type === "questDone" && (!quests.has(o.quest) || o.quest === q.id)) problems.push(`${where} step ${s.id}: unknown quest ${o.quest}`);
      if ("count" in o && !(o.count > 0)) problems.push(`${where} step ${s.id}: count must be positive`);
      if (o.type === "decide") {
        if (o.options.length < 2) problems.push(`${where} step ${s.id}: a decision needs at least two ways`);
        for (const d of o.options) { requires(d.requires, `${where} step ${s.id}.${d.id}`); for (const k of Object.keys(d.bond ?? {})) npc(k, `${where} step ${s.id}.${d.id}`); }
      }
    }
    if (q.deadlineDays !== undefined && !(Number.isInteger(q.deadlineDays) && q.deadlineDays >= 1)) problems.push(`${where}: deadlineDays must be a whole number of days`);
    if (q.deadlineDays && !q.failLine) problems.push(`${where}: a timed quest needs a failLine`);
    reward(q.failReward, `${where} (failed)`);
  }
  for (const [key, tree] of Object.entries(story.dialogues)) {
    npc(key, `dialogue ${key}`);
    if (!tree.nodes[tree.start]) problems.push(`dialogue ${key}: start node ${tree.start} missing`);
    for (const [nodeId, node] of Object.entries(tree.nodes)) {
      if (!node.options.length) problems.push(`dialogue ${key}.${nodeId}: no options (dead end)`);
      if (node.options.length && node.options.every((o) => o.once)) problems.push(`dialogue ${key}.${nodeId}: every option is once-only (would end as a dead end)`);
      for (const o of node.options) {
        if (o.next && !tree.nodes[o.next]) problems.push(`dialogue ${key}.${nodeId}.${o.id}: next ${o.next} missing`);
        requires(o.requires, `dialogue ${key}.${nodeId}.${o.id}`);
        for (const k of Object.keys(o.effects?.bondOthers ?? {})) { npc(k, `dialogue ${key}.${nodeId}.${o.id}`); if (k === key) problems.push(`dialogue ${key}.${nodeId}.${o.id}: bondOthers names the speaker`); }
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
    for (const s of r.streak ?? []) { if (!(Number.isInteger(s.years) && s.years >= 2)) problems.push(`rite ${r.feast}: a streak starts at 2 years`); reward(s.reward, `rite ${r.feast} streak`); }
  }
  for (const e of story.limitedEvents) {
    if (!places.has(e.placeId)) problems.push(`event ${e.id}: unknown place ${e.placeId}`);
    if (e.window.from > e.window.to || e.window.month < 1 || e.window.month > 12) problems.push(`event ${e.id}: bad window`);
    for (const o of e.offers) {
      if (o.give) resource(o.give, `event ${e.id}.${o.id}`);
      if (o.get) item(o.get, `event ${e.id}.${o.id}`);
      for (const k of Object.keys(o.bond ?? {})) npc(k, `event ${e.id}.${o.id}`);
      requires(o.requires, `event ${e.id}.${o.id}`);
      if (o.limit !== undefined && !(Number.isInteger(o.limit) && o.limit >= 1)) problems.push(`event ${e.id}.${o.id}: limit must be at least 1`);
    }
    if (e.visits !== undefined && !(Number.isInteger(e.visits) && e.visits >= 1)) problems.push(`event ${e.id}: visits must be at least 1`);
    if (e.complete && (e.visits ?? 1) < e.offers.length) problems.push(`event ${e.id}: a completion reward needs visits for every offer`);
    reward(e.complete?.reward, `event ${e.id} complete`);
  }
  for (const i of story.incidents.list) {
    if (!i.choices.length) problems.push(`incident ${i.id}: no choices`);
    requires(i.requires, `incident ${i.id}`);
    if (i.requires?.resource || i.requires?.minTier || i.requires?.minHearts !== undefined || i.requires?.quest) problems.push(`incident ${i.id}: a trigger may test flags, quests, hearts, tiers, season and weather only`);
    if (i.weather && !["wet", "dry"].includes(i.weather)) problems.push(`incident ${i.id}: weather must be wet or dry`);
    if (i.weight !== undefined && !(Number.isInteger(i.weight) && i.weight >= 1 && i.weight <= 5)) problems.push(`incident ${i.id}: weight must be 1-5`);
    for (const c of i.choices) {
      requires(c.requires, `incident ${i.id}.${c.id}`); reward(c, `incident ${i.id}.${c.id}`);
      if (c.followUp) {
        const next = story.incidents.list.find((x) => x.id === c.followUp!.incident);
        if (!next) problems.push(`incident ${i.id}.${c.id}: follow-up ${c.followUp.incident} missing`);
        else if (!next.followUpOnly) problems.push(`incident ${i.id}.${c.id}: follow-up ${next.id} should be followUpOnly`);
        if (!(Number.isInteger(c.followUp.afterDays) && c.followUp.afterDays >= 1 && c.followUp.afterDays <= 90)) problems.push(`incident ${i.id}.${c.id}: afterDays must be 1-90`);
      }
    }
    if (i.followUpOnly && !story.incidents.list.some((x) => x.choices.some((c) => c.followUp?.incident === i.id))) problems.push(`incident ${i.id}: followUpOnly but nothing leads to it`);
  }
  for (const a of story.achievements) {
    const c = a.condition;
    if ("questDone" in c && !quests.has(c.questDone)) problems.push(`achievement ${a.id}: unknown quest ${c.questDone}`);
    if ("flag" in c && !settable.has(c.flag)) problems.push(`achievement ${a.id}: flag ${c.flag} is never set`);
    if ("flags" in c) for (const f of c.flags) if (!settable.has(f) && !f.startsWith("served:")) problems.push(`achievement ${a.id}: flag ${f} is never set`);
    if ("tierCount" in c && !tiers.has(c.tierCount.tier)) problems.push(`achievement ${a.id}: unknown tier ${c.tierCount.tier}`);
    reward(a.reward, `achievement ${a.id}`);
  }
  return problems;
}
