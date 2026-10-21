/**
 * The player's story journal and the rules that move it: counters fed by
 * real settlement events, quest steps that complete themselves when their
 * objective is met, rewards, achievements. Everything here is a pure
 * function of (world, journal); module.ts turns the result into effects.
 */
import type { ComponentData, Effect, JsonValue, WorldView } from "@openlife/contracts";
import { DAYS_PER_MONTH } from "@openlife/life-contracts";
import {
  SettlementComponents, bondOf, heartsOf, residentId, socialOf, toJson, withBond, calendarDate, seasonOf, isWet, RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";
import { ObjectComponents, ObjectKinds, ObjectRelations, holderOf, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import {
  BONDS_PACK, LOG_LIMIT, isFeud, readBonds, rippleOf, tierIndex, tierOfHearts, npcLabel, type BondsState,
} from "./bonds.ts";
import type { Bond } from "@openlife/module-settlement-locations";
import {
  STORY_PACK, type AchievementCondition, type BondChange, type IncidentSpec, type ItemGrant, type Objective, type QuestSpec, type Requirements, type Reward,
} from "./spec.ts";
import { allIncidents } from "./pack-incidents.ts";

export const STORY_OWNER = "village-stories";
export const StoryComponents = { journal: "village-stories.journal" } as const;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * 12;

export interface QuestState { status: "active" | "done" | "failed"; step: number; base: number; startedAt: number; doneAt?: number; failedAt?: number }
export interface Journal {
  counters: Record<string, number>;
  talked: string[];
  flags: string[];
  quests: Record<string, QuestState>;
  achievements: Record<string, number>;
  rites: Record<string, number>;
  events: Record<string, number>;
  incidents: Record<string, string>;
  dialogue: Record<string, string>;
  itemSeq: number;
  bonds: BondsState;
  /** Delayed consequences: tick -> the incident that comes that day. */
  scheduled: Record<string, string>;
  /** Years each feast was kept (for streaks). */
  riteYears: Record<string, number[]>;
  /** Timed-event uses: `<event>@<year>` and `<event>@<year>:<offer>` -> times. */
  eventUses: Record<string, number>;
  /** Achievements whose reward was claimed. */
  claimed: string[];
  /** The title the player goes by ("" = none). */
  title: string;
}

/** Reads a villager's bond with the player; an Outcome answers with its pending changes applied. */
export type BondFn = (key: string) => Bond;
export const worldBonds = (world: WorldView, me: string): BondFn => (key) => bondOf(socialOf(world, residentId(key)), me);

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const nums = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(v)).map(([k, n]) => [k, Number(n)]));
const strs = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(obj(v)).map(([k, n]) => [k, String(n)]));

export function readJournal(world: WorldView, me: string): Journal {
  const raw = obj(world.getComponent(me, StoryComponents.journal));
  return {
    counters: nums(raw.counters),
    talked: Array.isArray(raw.talked) ? raw.talked.map(String) : [],
    flags: Array.isArray(raw.flags) ? raw.flags.map(String) : [],
    quests: Object.fromEntries(Object.entries(obj(raw.quests)).map(([id, q]) => {
      const s = obj(q);
      return [id, { status: s.status === "done" || s.status === "failed" ? s.status : "active", step: Number(s.step ?? 0), base: Number(s.base ?? 0),
        startedAt: Number(s.startedAt ?? 0), ...(s.doneAt !== undefined ? { doneAt: Number(s.doneAt) } : {}),
        ...(s.failedAt !== undefined ? { failedAt: Number(s.failedAt) } : {}) } as QuestState];
    })),
    achievements: nums(raw.achievements),
    rites: nums(raw.rites),
    events: nums(raw.events),
    incidents: strs(raw.incidents),
    dialogue: strs(raw.dialogue),
    itemSeq: Number(raw.itemSeq ?? 0),
    bonds: readBonds(raw.bonds),
    scheduled: strs(raw.scheduled),
    riteYears: Object.fromEntries(Object.entries(obj(raw.riteYears)).map(([k, v]) => [k, Array.isArray(v) ? v.map(Number) : []])),
    eventUses: nums(raw.eventUses),
    claimed: Array.isArray(raw.claimed) ? raw.claimed.map(String) : [],
    title: typeof raw.title === "string" ? raw.title : "",
  };
}

export const journalEffect = (me: string, j: Journal, reason: string): Effect =>
  ({ kind: "setComponent", entityId: me, component: StoryComponents.journal, value: j as unknown as ComponentData, reason });

export const activePlayer = (world: WorldView) => String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
export const yearOf = (tick: number) => Math.floor(tick / DAYS_PER_YEAR);
export const keyOf = (id: string) => id.replace(/^settlement-locations:resident:/, "");
export const npcName = (key: string) => RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.name ?? key;
export const resourceLabel = (r: string) => RIVER_TERRACE_PACK.resourceLabels[r] ?? r;
export const heartsWith = (world: WorldView, key: string, me: string) => heartsOf(bondOf(socialOf(world, residentId(key)), me));

// ---------------------------------------------------------------------------
// Items the player owns and holds

export function ownedInHand(world: WorldView, me: string, resources: string | string[]): string[] {
  const wanted = new Set([resources].flat());
  return world.listRelations({ type: ObjectRelations.heldBy, to: me }).map((r) => r.from).sort()
    .filter((id) => world.getEntity(id)?.archivedAt === undefined && ownerOf(world, id) === me && holderOf(world, id) === me)
    .filter((id) => world.listRelations({ type: ObjectRelations.wornBy, from: id }).length === 0)
    .filter((id) => wanted.has(prototypeOf(world, id).resourceId ?? ""));
}

/** Item ids moved to another person's ownership and hands. */
export function handOver(ids: string[], from: string, to: string, reason: string): Effect[] {
  return ids.flatMap((id): Effect[] => [
    { kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: from, reason, announce: false },
    { kind: "removeRelation", type: ObjectRelations.ownedBy, from: id, to: from, reason, announce: false },
    { kind: "addRelation", type: ObjectRelations.heldBy, from: id, to, announce: false },
    { kind: "addRelation", type: ObjectRelations.ownedBy, from: id, to, announce: false },
  ]);
}

/** Item ids used up (offered to the river, burnt as a torch, eaten by a guest). */
export function consume(ids: string[], from: string, reason: string): Effect[] {
  return ids.flatMap((id): Effect[] => [
    { kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: from, reason, announce: false },
    { kind: "archiveEntity", entityId: id, reason, announce: false },
  ]);
}

// ---------------------------------------------------------------------------
// Conditions

export function meets(world: WorldView, me: string, j: Journal, r: Requirements | undefined, speaker?: string, bond: BondFn = worldBonds(world, me)): string {
  if (!r) return "";
  const hearts = (k: string) => heartsOf(bond(k));
  if (r.minTier && speaker && tierIndex(tierOfHearts(hearts(speaker)).id) < tierIndex(r.minTier)) {
    return `要和${npcName(speaker)}成为「${BONDS_PACK.tiers[tierIndex(r.minTier)]!.name}」`;
  }
  for (const [k, t] of Object.entries(r.tierWith ?? {})) {
    if (tierIndex(tierOfHearts(hearts(k)).id) < tierIndex(t)) return `要和${npcName(k)}成为「${BONDS_PACK.tiers[tierIndex(t)]!.name}」`;
  }
  if (r.feud !== undefined && speaker && isFeud(bond(speaker)) !== r.feud) return r.feud ? "你们之间没有疙瘩" : `${npcName(speaker)}心里还有疙瘩`;
  for (const f of r.flags ?? []) if (!j.flags.includes(f)) return "时候未到";
  for (const f of r.notFlags ?? []) if (j.flags.includes(f)) return "已经不合适了";
  for (const [k, n] of Object.entries(r.hearts ?? {})) if (hearts(k) < n) return `和${npcName(k)}的交情还不够（需要 ${n} 颗心）`;
  for (const q of r.questsDone ?? []) if (j.quests[q]?.status !== "done") return "要先把别的事办完";
  if (r.minHearts !== undefined && speaker && hearts(speaker) < r.minHearts) return `交情还不够（需要 ${r.minHearts} 颗心）`;
  for (const [q, step] of Object.entries(r.quest ?? {})) {
    const state = j.quests[q];
    const spec = STORY_PACK.quests.find((s) => s.id === q);
    if (state?.status !== "active" || spec?.steps[state.step]?.id !== step) return "时候未到";
  }
  if (r.season && !r.season.includes(seasonOf(world.tick))) return `要到${r.season.join("、")}天`;
  if (r.weather && isWet(world.tick) !== (r.weather === "wet")) return r.weather === "wet" ? "要等下雨下雪的日子" : "要等天晴";
  if (r.resource && ownedInHand(world, me, r.resource).length === 0) return `手里要有${resourceLabel(r.resource)}`;
  if (r.title !== undefined && j.title !== r.title) return `要以「${r.title}」的名号来`;
  for (const q of r.questsFailed ?? []) if (j.quests[q]?.status !== "failed") return "时候未到";
  return "";
}

// ---------------------------------------------------------------------------
// Quest objectives

export function friendsAtTier(bond: BondFn, tier: string): number {
  return RIVER_TERRACE_PACK.residents.filter((r) => tierIndex(tierOfHearts(heartsOf(bond(r.key))).id) >= tierIndex(tier)).length;
}

function objectiveValue(world: WorldView, me: string, j: Journal, o: Objective, bond: BondFn = worldBonds(world, me)): number {
  switch (o.type) {
    case "tiers": return friendsAtTier(bond, o.tier);
    case "counter": return j.counters[o.counter] ?? 0;
    case "talk": return j.counters[`talk:${o.npc}`] ?? 0;
    case "distinctTalks": return j.talked.length;
    case "flag": return j.flags.includes(o.flag) ? 1 : 0;
    case "hearts": return heartsOf(bond(o.npc));
    case "deliver": return ownedInHand(world, me, o.resource).length;
    case "questDone": return j.quests[o.quest]?.status === "done" ? 1 : 0;
    case "decide": return 0;
  }
}

/** Value captured when a step begins; counters only count what happens after it. */
export function baseFor(world: WorldView, me: string, j: Journal, o: Objective): number {
  return o.type === "counter" || o.type === "talk" || o.type === "distinctTalks" ? objectiveValue(world, me, j, o) : 0;
}

export function progressOf(world: WorldView, me: string, j: Journal, q: QuestSpec, bond: BondFn = worldBonds(world, me)): { done: number; target: number; auto: boolean } | undefined {
  const state = j.quests[q.id];
  const step = state?.status === "active" ? q.steps[state.step] : undefined;
  if (!step) return undefined;
  const o = step.objective;
  const target = o.type === "flag" || o.type === "questDone" || o.type === "decide" ? 1 : o.type === "hearts" ? o.atLeast : o.count;
  const raw = objectiveValue(world, me, j, o, bond);
  const done = o.type === "counter" || o.type === "talk" || o.type === "distinctTalks" ? raw - state!.base : raw;
  return { done: Math.max(0, Math.min(target, done)), target, auto: o.type !== "deliver" && o.type !== "decide" };
}

// ---------------------------------------------------------------------------
// Outcome builder: journal changes plus effects, bonds merged per resident

export class Outcome {
  readonly effects: Effect[] = [];
  readonly lines: string[] = [];
  readonly #bonds = new Map<string, BondChange>();
  readonly #why = new Map<string, string>();
  /** Bond changes already in the world (made by the settlement this transaction), for ripple. */
  readonly #observed = new Map<string, BondChange>();
  readonly world: WorldView;
  readonly me: string;
  readonly tick: number;
  j: Journal;
  constructor(world: WorldView, me: string, j: Journal, tick: number) {
    this.world = world; this.me = me; this.j = j; this.tick = tick;
  }

  bond(key: string, change: BondChange | undefined, why?: string): void {
    if (!change) return;
    const prev = this.#bonds.get(key) ?? {};
    const next: BondChange = { ...prev };
    for (const [k, v] of Object.entries(change) as [keyof BondChange, number][]) next[k] = (next[k] ?? 0) + v;
    this.#bonds.set(key, next);
    if (why && !this.#why.has(key)) this.#why.set(key, why);
  }
  bondAll(change: BondChange | undefined, why?: string): void {
    if (!change) return;
    for (const r of RIVER_TERRACE_PACK.residents) this.bond(r.key, change, why);
  }
  /** The bond as it will be once this outcome lands. */
  readonly bondNow: BondFn = (key) => {
    const rid = residentId(key);
    const change = this.#bonds.get(key);
    const memory = socialOf(this.world, rid);
    return bondOf(change ? withBond(memory, this.me, change, this.tick) : memory, this.me);
  };

  /**
   * Notices how the settlement's own rules moved bonds (a talk, a gift) since
   * the journal last looked, and logs each change with what caused it.
   */
  observe(label: string, targetKey = ""): void {
    const seen = { ...this.j.bonds.seen };
    const tierSeen = { ...this.j.bonds.tierSeen };
    const log = [...this.j.bonds.log];
    for (const r of RIVER_TERRACE_PACK.residents) {
      const now = bondOf(socialOf(this.world, residentId(r.key)), this.me);
      const before = seen[r.key];
      seen[r.key] = { familiarity: now.familiarity, trust: now.trust, grudge: now.grudge };
      if (!before) {
        // First sight: what the village already felt before you came is a baseline, not news.
        tierSeen[r.key] ??= tierIndex(tierOfHearts(heartsOf(now)).id);
        continue;
      }
      const d = { familiarity: r2(now.familiarity - before.familiarity), trust: r2(now.trust - before.trust), grudge: r2(now.grudge - before.grudge) };
      if (!d.familiarity && !d.trust && !d.grudge) continue;
      log.push({ at: this.tick, npc: r.key, ...d, why: r.key === targetKey ? label : "日子里的来往" });
      if (r.key === targetKey) this.#observed.set(r.key, d);
    }
    this.j = { ...this.j, bonds: { ...this.j.bonds, seen, tierSeen, log: log.slice(-LOG_LIMIT) } };
  }

  grant(item: ItemGrant): string {
    this.j = { ...this.j, itemSeq: this.j.itemSeq + 1 };
    const id = `village-stories:item:${this.me}:${this.j.itemSeq}`;
    const proto = this.world.getComponent(item.prototype, ObjectComponents.prototype);
    const name = item.name ?? String(proto?.name ?? item.prototype);
    this.effects.push(
      { kind: "spawnEntity", localId: `story-item-${this.j.itemSeq}`, id, entityKind: ObjectKinds.item, announce: false,
        components: { [ObjectComponents.object]: {
          prototypeId: item.prototype, name, condition: "new", quantity: 1, durability: Number(proto?.durability ?? 10),
          madeAt: this.tick, provenance: { source: STORY_OWNER, at: this.tick }, visibleFromOutside: false,
        } as unknown as Record<string, never> } },
      { kind: "addRelation", type: ObjectRelations.instanceOf, from: id, to: item.prototype, announce: false },
      { kind: "addRelation", type: ObjectRelations.ownedBy, from: id, to: this.me, announce: false },
      { kind: "addRelation", type: ObjectRelations.heldBy, from: id, to: this.me, announce: false },
    );
    return name;
  }
  reward(r: Reward | undefined, why = "故事里的事"): string[] {
    const got: string[] = [];
    if (!r) return got;
    for (const item of r.items ?? []) got.push(this.grant(item));
    for (const [k, c] of Object.entries(r.bond ?? {})) this.bond(k, c, why);
    this.bondAll(r.bondAll, why);
    this.flag(...(r.flags ?? []));
    return got;
  }
  flag(...flags: string[]): void {
    const add = flags.filter((f) => !this.j.flags.includes(f));
    if (add.length) this.j = { ...this.j, flags: [...this.j.flags, ...add] };
  }
  count(counter: string, by = 1): void {
    this.j = { ...this.j, counters: { ...this.j.counters, [counter]: (this.j.counters[counter] ?? 0) + by } };
  }
  say(eventType: string, line: string, data: Record<string, JsonValue> = {}, targetId?: string): void {
    this.lines.push(line);
    this.effects.push({ kind: "emitEvent", eventType, actorId: this.me, ...(targetId ? { targetId } : {}), data: { ...data, line }, historicalSignificance: 0.05 });
  }

  /** Ripple through the village web, advance quests, fire tier scenes, unlock achievements; then emit. */
  finish(reason: string): Effect[] {
    this.expireQuests();
    this.#ripple();
    for (let guard = 0; guard < 20 && (this.#autoStart() || this.#settleQuests() || this.#tierScenes()); guard += 1) { /* repeat until stable */ }
    this.#unlockAchievements();
    const out: Effect[] = [...this.effects];
    const seen = { ...this.j.bonds.seen };
    const log = [...this.j.bonds.log];
    for (const [key, change] of this.#bonds) {
      const rid = residentId(key);
      if (!this.world.getComponent(rid, SettlementComponents.resident)) continue;
      const before = bondOf(socialOf(this.world, rid), this.me);
      const memory = withBond(socialOf(this.world, rid), this.me, change, this.tick);
      const after = bondOf(memory, this.me);
      out.push({ kind: "modifyComponent", entityId: rid, component: SettlementComponents.resident,
        patch: { social: toJson(memory) }, reason: `story: ${reason}` });
      seen[key] = { familiarity: after.familiarity, trust: after.trust, grudge: after.grudge };
      const d = { familiarity: r2(after.familiarity - before.familiarity), trust: r2(after.trust - before.trust), grudge: r2(after.grudge - before.grudge) };
      if (d.familiarity || d.trust || d.grudge) log.push({ at: this.tick, npc: key, ...d, why: this.#why.get(key) ?? reason });
    }
    this.j = { ...this.j, bonds: { ...this.j.bonds, seen, log: log.slice(-LOG_LIMIT) } };
    out.push(journalEffect(this.me, this.j, reason));
    return out;
  }

  #ripple(): void {
    const sources = new Map<string, BondChange>(this.#observed);
    for (const [k, c] of this.#bonds) {
      const prev = sources.get(k) ?? {};
      sources.set(k, { familiarity: (prev.familiarity ?? 0) + (c.familiarity ?? 0), trust: (prev.trust ?? 0) + (c.trust ?? 0) });
    }
    for (const [key, change] of sources) {
      for (const r of rippleOf(key, change, this.j.bonds.reconciled)) this.bond(r.other, r.change, r.why);
    }
  }

  /** A villager whose tier rose past a written scene tells it now (once per tier). */
  #tierScenes(): boolean {
    let fired = false;
    for (const r of RIVER_TERRACE_PACK.residents) {
      const now = tierIndex(tierOfHearts(heartsOf(this.bondNow(r.key))).id);
      const seen = this.j.bonds.tierSeen[r.key] ?? 0;
      if (now <= seen) continue;
      this.j = { ...this.j, bonds: { ...this.j.bonds, tierSeen: { ...this.j.bonds.tierSeen, [r.key]: now } } };
      for (const ev of BONDS_PACK.tierEvents.filter((e) => e.npc === r.key && tierIndex(e.tier) > seen && tierIndex(e.tier) <= now)) {
        const got = this.reward(ev.reward, `和${npcLabel(r.key)}成了${BONDS_PACK.tiers[tierIndex(ev.tier)]!.name}`);
        this.say("village-stories.tier_scene", `${ev.text}${got.length ? `（得到：${got.join("、")}）` : ""}`, { npc: r.key, tier: ev.tier }, residentId(r.key));
      }
      this.say("village-stories.tier_up", `你和${npcLabel(r.key)}的关系变成了「${BONDS_PACK.tiers[now]!.name}」。`, { npc: r.key, tier: BONDS_PACK.tiers[now]!.id }, residentId(r.key));
      fired = true;
    }
    return fired;
  }

  /** Moves a quest past its current step; completes it when that was the last. */
  advance(q: QuestSpec): void {
    const state = this.j.quests[q.id]!;
    const next = state.step + 1;
    const was = q.steps[state.step];
    if (was?.doneLine && was.objective.type !== "deliver") this.say("village-stories.quest_step_done", was.doneLine, { questId: q.id, step: was.id });
    if (next >= q.steps.length) {
      this.j = { ...this.j, quests: { ...this.j.quests, [q.id]: { ...state, status: "done", step: next, doneAt: this.tick } } };
      const got = this.reward(q.reward, `「${q.title}」办成了`);
      this.count("quest");
      this.count(`quest:${q.kind}`);
      if (q.deadlineDays) this.count("quest-on-time");
      this.say("village-stories.quest_completed", `${q.completeLine}${got.length ? `（得到：${got.join("、")}）` : ""}`, { questId: q.id, kind: q.kind });
      return;
    }
    const step = q.steps[next]!;
    const base = baseFor(this.world, this.me, this.j, step.objective);
    this.j = { ...this.j, quests: { ...this.j.quests, [q.id]: { ...state, step: next, base } } };
    this.say("village-stories.quest_step", `${step.intro ? `${step.intro}` : ""}「${q.title}」下一步：${step.text}。`, { questId: q.id, step: step.id });
  }

  /** Timed quests past their deadline fail now: told once, and their failReward opens what failing leads to. */
  expireQuests(): void {
    for (const q of STORY_PACK.quests) {
      const state = this.j.quests[q.id];
      if (!q.deadlineDays || state?.status !== "active" || !questExpired(q, state, this.tick)) continue;
      this.j = { ...this.j, quests: { ...this.j.quests, [q.id]: { ...state, status: "failed", failedAt: this.tick } } };
      this.reward(q.failReward, `「${q.title}」误了期限`);
      this.count("quest-failed");
      this.say("village-stories.quest_failed", `${q.failLine ?? `「${q.title}」误了期限。`}（「${q.title}」没有办成）`, { questId: q.id, kind: q.kind });
    }
  }

  /** Quests that begin by themselves once their requirements hold (the deadline runs from then). */
  #autoStart(): boolean {
    let started = false;
    for (const q of STORY_PACK.quests) {
      if (!q.autoStart || this.j.quests[q.id] || meets(this.world, this.me, this.j, q.requires, undefined, this.bondNow)) continue;
      const first = q.steps[0]!;
      this.j = { ...this.j, quests: { ...this.j.quests, [q.id]: { status: "active", step: 0, base: baseFor(this.world, this.me, this.j, first.objective), startedAt: this.tick } } };
      this.say("village-stories.quest_accepted", `${q.acceptLine}${first.intro ?? ""}（「${q.title}」：${first.text}${q.deadlineDays ? `，${q.deadlineDays} 天内` : ""}）`,
        { questId: q.id, kind: q.kind, auto: true }, q.giver ? residentId(q.giver) : undefined);
      started = true;
    }
    return started;
  }

  #settleQuests(): boolean {
    let moved = false;
    for (const q of STORY_PACK.quests) {
      const p = progressOf(this.world, this.me, this.j, q, this.bondNow);
      if (p?.auto && p.done >= p.target) { this.advance(q); moved = true; }
    }
    return moved;
  }

  #unlockAchievements(): void {
    for (const a of STORY_PACK.achievements) {
      if (this.j.achievements[a.id] !== undefined || !achieved(this.world, this.me, this.j, a.condition, this.bondNow)) continue;
      this.j = { ...this.j, achievements: { ...this.j.achievements, [a.id]: this.tick } };
      this.say("village-stories.achievement_unlocked", `【成就】${a.name}：${a.text}。`, { achievementId: a.id });
    }
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A timed quest is late once more than `deadlineDays` days have passed since it was accepted. */
export const questExpired = (q: QuestSpec, state: QuestState, tick: number) => Boolean(q.deadlineDays) && state.status === "active" && tick - state.startedAt > q.deadlineDays!;
/** Days left on a timed quest (0 = today is the last day), or null for an untimed one. */
export const questDaysLeft = (q: QuestSpec, state: QuestState | undefined, tick: number) =>
  q.deadlineDays && state?.status === "active" ? Math.max(0, state.startedAt + q.deadlineDays - tick) : null;

/** How many years running, ending this year, a feast has been kept. */
export function riteStreak(years: number[], year: number): number {
  const kept = new Set(years);
  let n = 0;
  while (kept.has(year - n)) n += 1;
  return n;
}

export function achieved(world: WorldView, me: string, j: Journal, c: AchievementCondition, bond: BondFn = worldBonds(world, me)): boolean {
  if ("tierCount" in c) return friendsAtTier(bond, c.tierCount.tier) >= c.tierCount.atLeast;
  if ("flags" in c) return c.flags.every((f) => j.flags.includes(f));
  if ("counter" in c) return (j.counters[c.counter] ?? 0) >= c.atLeast;
  if ("distinctTalks" in c) return j.talked.length >= c.distinctTalks;
  if ("questDone" in c) return j.quests[c.questDone]?.status === "done";
  if ("questsDone" in c) return STORY_PACK.quests.filter((q) => q.kind === c.questsDone.kind && j.quests[q.id]?.status === "done").length >= c.questsDone.atLeast;
  if ("anyHearts" in c) return RIVER_TERRACE_PACK.residents.some((r) => heartsOf(bond(r.key)) >= c.anyHearts);
  return j.flags.includes(c.flag);
}

// ---------------------------------------------------------------------------
// Calendar: limited-time windows and the day's incident

export function eventActive(tick: number, e: { window: { month: number; from: number; to: number } }): boolean {
  const d = calendarDate(tick);
  return d.month === e.window.month && d.day >= e.window.from && d.day <= e.window.to;
}

/** Days until the window opens (0 = open now), looking at most a year ahead. */
export function daysUntil(tick: number, e: { window: { month: number; from: number; to: number } }): number {
  for (let n = 0; n < DAYS_PER_YEAR; n += 1) if (eventActive(tick + n, e)) return n;
  return DAYS_PER_YEAR;
}

function mix(a: number, b: number): number {
  let h = (Math.imul(a + 7, 0x9e3779b1) ^ Math.imul(b + 31, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Whether an incident's trigger holds for this player now (story requirements, and `once`). */
export type IncidentGate = ((incident: IncidentSpec) => boolean) & { scheduled?: (tick: number) => IncidentSpec | undefined };
export function incidentGate(world: WorldView, me: string, j: Journal): IncidentGate {
  const seen = new Set(Object.values(j.incidents).map((v) => v.split(":")[0]!));
  const gate: IncidentGate = (i) => !(i.once && seen.has(i.id)) && !meets(world, me, j, i.requires);
  // A follow-up an earlier choice set in motion comes on its day, whatever the season or the draw.
  gate.scheduled = (tick) => {
    const id = j.scheduled[String(tick)];
    const i = id ? STORY_PACK.incidents.list.find((x) => x.id === id) : undefined;
    return i && gate(i) ? i : undefined;
  };
  return gate;
}
/** Incidents nobody's story can trigger: only season and weather gate them (used for a forecast with no player). */
const untriggered: IncidentGate = (i) => !i.requires && !i.once;

/**
 * The incident that happens on this day, if any: same day, same draw (no RNG
 * state). The pool is every incident whose season, weather and trigger hold;
 * heavier ones come up more often.
 */
export function incidentOn(tick: number, gate: IncidentGate = untriggered): IncidentSpec | undefined {
  const spec = STORY_PACK.incidents;
  const due = gate.scheduled?.(tick);
  if (due) return due;
  if (mix(tick, 1) % 1000 >= Math.round(spec.chance * 1000)) return undefined;
  const season = seasonOf(tick);
  // Content packs (format v2) contribute their own incidents, so the pool is
  // the base list plus whatever the loaded packs add. Packs carry no weight,
  // which is why the weighted pick below defaults each one to 1 -- adding a
  // pack must not change how often the base incidents come up.
  const wet = isWet(tick);
  const pool = allIncidents(spec.list).filter((i) => !i.followUpOnly && (!i.seasons || i.seasons.includes(season)) && (!i.weather || (i.weather === "wet") === wet) && gate(i));
  const total = pool.reduce((n, i) => n + (i.weight ?? 1), 0);
  if (!total) return undefined;
  let roll = mix(tick, 2) % total;
  for (const i of pool) { roll -= i.weight ?? 1; if (roll < 0) return i; }
  return undefined;
}
