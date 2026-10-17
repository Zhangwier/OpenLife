/**
 * 今日指引 (daily guide): what matters most right now, at most three things
 * worth doing that the player can actually do (or walk to), the next step for
 * whatever they cannot do yet, and what tomorrow holds.
 *
 * Pure reads. Every suggested click is an action the settlement or the story
 * layer already reports as enabled right now; a suggestion that cannot be done
 * here carries a walk to where it can, or only words. Priorities and wording
 * are data (data/river-terrace.guide.json).
 */
import { readFileSync } from "node:fs";
import type { JsonValue, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import {
  RIVER_TERRACE_PACK, calendarDate, feastOn, homestead, illnessOn, isBirthday, isWet, residentId, skyOn,
} from "@openlife/module-settlement-locations";
import { STORY_PACK } from "./spec.ts";
import { readJournal, resourceLabel } from "./journal.ts";
import type { StoryView } from "./module.ts";

export interface GuidePack {
  id: string; formatVersion: number; maxSuggestions: number;
  hunger: { hungry: number; starving: number };
  priorities: Record<string, number>;
  text: Record<string, { title: string; why: string }>;
  recovery: { match: string; kind: string; text: string }[];
  containers: string;
}
export const GUIDE_PACK: GuidePack = JSON.parse(
  readFileSync(new URL("../data/river-terrace.guide.json", import.meta.url), "utf8"),
) as GuidePack;

export interface GuideAction { type: string; payload: Record<string, JsonValue>; label: string }
export interface Suggestion {
  id: string; kind: string; priority: number; title: string; why: string;
  /** A click that is valid right now, or null when only words help. */
  action: GuideAction | null;
}
export interface Blocked { actionId: string; label: string; reason: string; next: string; action: GuideAction | null }

type Homestead = ReturnType<typeof homestead>;
type HAction = Homestead["actions"][number];

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const say = (kind: string, v: Record<string, string | number> = {}) => {
  const t = GUIDE_PACK.text[kind] ?? { title: kind, why: "" };
  return { title: fill(t.title, v), why: fill(t.why, v) };
};
const PLACE_NAME: Record<string, string> = Object.fromEntries(RIVER_TERRACE_PACK.places.map((p) => [p.id, p.name]));
const npcName = (key: string) => RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.name ?? key;
const keyOf = (id: string) => id.split(":").pop() ?? "";
const asAction = (a: HAction): GuideAction => ({ type: a.id, payload: a.payload, label: a.label });

/** A walk to a place, when the settlement offers it as an enabled action from here. */
function walkTo(h: Homestead, placeId: string): GuideAction | null {
  if (!placeId || h.placeId === placeId) return null;
  const a = h.actions.find((x) => x.enabled && x.id === "settlement-locations.arrive" && x.payload.placeId === placeId);
  return a ? asAction(a) : null;
}
const enabled = (h: Homestead, id: string, pick: (a: HAction) => boolean = () => true) => {
  const a = h.actions.find((x) => x.enabled && x.id === id && pick(x));
  return a ? asAction(a) : null;
};

// --- where things come from (for "缺什么 → 去哪儿弄") ---------------------------

const LABEL_TO_RESOURCE: Record<string, string> = Object.fromEntries(
  Object.entries(RIVER_TERRACE_PACK.resourceLabels).map(([id, label]) => [label, id]));
export const CONTAINER_WORDS = /容器|罐/;

/** How to come by a resource: a place that yields it, a recipe that makes it, or a trade. */
export function sourceOf(resourceId: string): { how: string; placeId: string } {
  const label = resourceLabel(resourceId);
  const y = (RIVER_TERRACE_PACK.yields as { placeId: string; resourceId: string }[]).find((x) => x.resourceId === resourceId);
  if (y) return { how: `去${PLACE_NAME[y.placeId] ?? y.placeId}取${label}。`, placeId: y.placeId };
  const protoOf = (id: string) => (RIVER_TERRACE_PACK.prototypes as { id: string; resourceId?: string }[]).find((p) => p.id === id)?.resourceId;
  const recipe = (RIVER_TERRACE_PACK.recipes as { label: string; output?: { prototypeId?: string }; spaceId?: string }[])
    .find((r) => r.output?.prototypeId && protoOf(r.output.prototypeId) === resourceId);
  if (recipe) {
    const place = RIVER_TERRACE_PACK.places.find((p) => (p as { spaces?: { id: string }[] }).spaces?.some((s) => s.id === recipe.spaceId));
    return { how: `可以自己做：${recipe.label}${place ? `（在${place.name}）` : ""}；或拿东西跟村民换。`, placeId: place?.id ?? "" };
  }
  return { how: `可以拿东西跟村民换${label}。`, placeId: "" };
}

/** The next step for an action the settlement refused, read from its reason. */
export function nextStep(h: Homestead, reason: string): { next: string; action: GuideAction | null } {
  for (const rule of GUIDE_PACK.recovery) {
    const m = reason.match(new RegExp(rule.match));
    if (!m) continue;
    switch (rule.kind) {
      case "endDay": return { next: rule.text, action: enabled(h, "settlement-locations.end_day") };
      case "eat": return { next: rule.text, action: enabled(h, "settlement-locations.eat") ?? walkTo(h, "place:hearth-yard") };
      case "goTo": {
        const target = (m[1] ?? "").trim();
        const core = (label: string) => label.replace(/^走到/, "").replace(/[下边旁里]$/, "");
        const walks = h.actions.filter((x) => x.enabled && /arrive|move_within/.test(x.id) && target);
        // The most specific spot named wins: "陶家庭院的晾坯架" walks to the rack, not just the yard.
        const a = walks.filter((x) => target.includes(core(x.label))).sort((x, y) => core(y.label).length - core(x.label).length)[0];
        return { next: fill(rule.text, { target }), action: a ? asAction(a) : null };
      }
      case "source": {
        const word = (m.slice(1).find(Boolean) ?? "").trim();
        if (CONTAINER_WORDS.test(word)) return { next: `缺容器：${GUIDE_PACK.containers}`, action: null };
        const label = Object.keys(LABEL_TO_RESOURCE).sort((a, b) => b.length - a.length).find((l) => word.includes(l));
        if (!label) continue;
        const src = sourceOf(LABEL_TO_RESOURCE[label]!);
        return { next: fill(rule.text, { label, how: src.how }), action: walkTo(h, src.placeId) };
      }
      default: return { next: rule.text, action: null };
    }
  }
  return { next: "", action: null };
}

// --- the guide -----------------------------------------------------------------

export function dailyGuide(world: WorldView, me: string, story: StoryView) {
  const h = homestead(world, me);
  const j = readJournal(world, me);
  const tick = world.tick;
  const P = GUIDE_PACK.priorities;
  const out: Suggestion[] = [];
  const add = (id: string, kind: string, text: { title: string; why: string }, action: GuideAction | null, priority = P[kind] ?? 0) =>
    out.push({ id, kind, priority, ...text, action });

  if (h.exists) {
    // Body and strength.
    if (h.dailyActivity.remaining <= 0) add("exhausted", "exhausted", say("exhausted"), enabled(h, "settlement-locations.end_day"));
    const hunger = Number(h.hunger ?? 0);
    if (hunger >= GUIDE_PACK.hunger.hungry) {
      const kind = hunger >= GUIDE_PACK.hunger.starving ? "starving" : "hungry";
      add("eat", kind, say(kind, { hunger }), enabled(h, "settlement-locations.eat") ?? walkTo(h, "place:hearth-yard"));
    }
  }

  // Today only: festival, incident, a limited event, a quarrel.
  if (story.festival && !story.festival.done) {
    add(`festival:${story.festival.feast}`, "festival", say("festival", { name: story.festival.name, label: story.festival.label }),
      story.festival.enabled ? { type: "village-stories.festival.rite", payload: {}, label: story.festival.label } : walkTo(h, story.festival.placeId));
  }
  if (story.incident && !story.incident.resolved) {
    const c = story.incident.choices.find((x) => x.enabled);
    add(`incident:${story.incident.id}`, "incident", say("incident", { title: story.incident.title, text: story.incident.text }),
      c ? { type: "village-stories.incident.resolve", payload: { incidentId: story.incident.id, choiceId: c.id }, label: c.label } : null);
  }
  for (const e of story.events.filter((x) => x.active && !x.joined)) {
    const o = e.offers.find((x) => x.enabled);
    add(`event:${e.id}`, "event", say("event", { name: e.name, intro: e.intro }),
      o ? { type: "village-stories.event.join", payload: { eventId: e.id, offerId: o.id }, label: o.label } : walkTo(h, e.placeId));
  }
  const quarrel = story.people.quarrel;
  if (quarrel && !quarrel.settled) {
    const side = quarrel.sides.find((s) => s.side === "mediate" && s.enabled);
    add(`quarrel:${quarrel.pair}`, "quarrel", say("quarrel", { a: quarrel.aName, b: quarrel.bName, place: PLACE_NAME[quarrel.placeId] ?? "" }),
      side ? { type: "village-stories.quarrel.settle", payload: { side: "mediate" }, label: side.label } : walkTo(h, quarrel.placeId));
  }

  // People who need you today: the sick, the one whose birthday it is.
  const ill = illnessOn(tick);
  if (ill) {
    const place = occupiedPlaceId(world, ill.residentId);
    const gift = h.actions.find((a) => a.enabled && a.id === "settlement-locations.gift" && a.payload.targetId === ill.residentId);
    add(`ill:${ill.key}`, "ill", say("ill", { name: npcName(ill.key) }), gift ? asAction(gift) : walkTo(h, place));
  }
  for (const r of RIVER_TERRACE_PACK.residents) {
    const rid = residentId(r.key);
    if (!isBirthday(rid, tick) || !world.getEntity(rid)) continue;
    const person = RIVER_TERRACE_PACK.people?.[r.key];
    const likes = [...(person?.loves ?? []), ...(person?.likes ?? [])].map(resourceLabel).join("、");
    const gift = h.actions.find((a) => a.enabled && a.id === "settlement-locations.gift" && a.payload.targetId === rid);
    add(`birthday:${r.key}`, "birthday", say("birthday", { name: r.name, likes }), gift ? asAction(gift) : walkTo(h, occupiedPlaceId(world, rid)));
  }

  // Quests: ready to hand in first, then the next step of each active one, then a new one on offer.
  for (const q of story.quests) {
    if (q.status === "active" && q.step) {
      if (q.step.turnIn?.enabled) {
        add(`quest:${q.id}`, "quest-ready", say("quest-ready", { title: q.title, step: q.step.text }),
          { type: "village-stories.quest.turn_in", payload: { questId: q.id }, label: `交付「${q.title}」` });
        continue;
      }
      const placeId = questPlace(world, me, q.id);
      const res = questResource(world, me, q.id);
      // Already where the work is: offer the work itself, not a walk.
      const work = res && h.placeId === placeId
        ? h.actions.find((a) => a.enabled && a.payload.resourceId === res && /draw|gather|collect/.test(a.id)) : undefined;
      add(`quest:${q.id}`, q.kind === "main" ? "quest-main" : "quest-side",
        say("quest", { title: q.title, step: q.step.text, done: q.step.done, target: q.step.target }), work ? asAction(work) : walkTo(h, placeId));
    }
  }
  const offer = story.quests.find((q) => q.status === "available" && q.accept?.enabled);
  if (offer) add(`quest-new:${offer.id}`, "quest-new", say("quest-new", { giver: offer.giverName ?? "村里人", title: offer.title, summary: offer.summary }),
    { type: "village-stories.quest.accept", payload: { questId: offer.id }, label: `接下「${offer.title}」` });

  // Someone right here you have not spoken to today.
  if (h.exists) {
    const talk = h.actions.find((a) => a.enabled && a.id === "settlement-locations.talk");
    if (talk) add(`talk:${keyOf(String(talk.payload.targetId))}`, "neighbour", say("neighbour", { name: talk.label.replace(/^与|搭话$/g, "") }), asAction(talk));
    const season = enabled(h, "settlement-locations.season.begin");
    if (season) add("season", "season", say("season"), null);
  }

  out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  const picked = out.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  const [focus, ...rest] = picked;

  const blocked: Blocked[] = h.exists ? h.actions.filter((a) => !a.enabled && a.reason).map((a) => {
    const step = nextStep(h, a.reason);
    return { actionId: a.id, label: a.label, reason: a.reason, next: step.next, action: step.action };
  }).filter((b) => b.next) : [];

  return {
    day: calendarDate(tick),
    weather: skyOn(tick),
    focus: focus ?? null,
    suggestions: rest.slice(0, GUIDE_PACK.maxSuggestions),
    more: Math.max(0, rest.length - GUIDE_PACK.maxSuggestions),
    blocked,
    tomorrow: tomorrowOf(world, me, j.flags.includes("foresight") && j.bonds.served.divine === tick),
  };
}
export type DailyGuide = ReturnType<typeof dailyGuide>;

/** Where a quest step is best pursued: where its resource comes from, the person to see, or the giver. */
function questPlace(world: WorldView, me: string, questId: string): string {
  const q = STORY_PACK.quests.find((x) => x.id === questId);
  const state = readJournal(world, me).quests[questId];
  const o = q && state ? q.steps[state.step]?.objective : undefined;
  if (o?.type === "counter") {
    const m = o.counter.match(/^(?:gather|draw):(resource:[\w-]+)$/);
    if (m) return sourceOf(m[1]!).placeId;
  }
  const who = o && "npc" in o ? o.npc : q?.giver ?? "";
  return who ? occupiedPlaceId(world, residentId(who)) : "";
}

function questResource(world: WorldView, me: string, questId: string): string {
  const q = STORY_PACK.quests.find((x) => x.id === questId);
  const state = readJournal(world, me).quests[questId];
  const o = q && state ? q.steps[state.step]?.objective : undefined;
  return o?.type === "counter" ? (o.counter.match(/^(?:gather|draw):(resource:[\w-]+)$/)?.[1] ?? "") : "";
}

/** A reason to come back tomorrow: what the calendar, the village and your quests already hold. */
export function tomorrowOf(world: WorldView, me: string, foresight: boolean): string[] {
  const t = world.tick + 1;
  const lines: string[] = [];
  const feast = feastOn(t);
  if (feast) lines.push(`明天是${feast.name}，记得去${PLACE_NAME[feast.placeId] ?? "过节的地方"}。`);
  for (const e of STORY_PACK.limitedEvents) {
    const d = calendarDate(t);
    if (e.window.month === d.month && e.window.from === d.day) lines.push(`明天起${e.name}开始（${e.window.month}/${e.window.from}–${e.window.to}）。`);
  }
  for (const r of RIVER_TERRACE_PACK.residents) if (isBirthday(residentId(r.key), t)) lines.push(`明天是${r.name}的生日。`);
  const ill = illnessOn(t);
  if (ill && ill.from === t) lines.push(foresight ? `蓍婆说${npcName(ill.key)}明天要着凉。` : "");
  if (foresight) lines.push(`蓍婆看过烟：明天${skyOn(t)}${isWet(t) ? "，户外活计会更费力" : ""}。`);
  const j = readJournal(world, me);
  const waiting = STORY_PACK.quests.filter((q) => j.quests[q.id]?.status === "active").length;
  if (waiting) lines.push(`手上还有 ${waiting} 件托付没办完。`);
  return lines.filter(Boolean);
}

/** The guide's data must name real kinds and readable patterns. */
export function guideProblems(pack: GuidePack = GUIDE_PACK): string[] {
  const out: string[] = [];
  for (const k of Object.keys(pack.priorities)) if (!pack.text[k] && !["quest-main", "quest-side"].includes(k)) out.push(`guide: priority ${k} has no text`);
  for (const r of pack.recovery) {
    try { new RegExp(r.match); } catch { out.push(`guide: bad pattern ${r.match}`); }
    if (!["endDay", "eat", "goTo", "source", "findPerson", "bond", "weather"].includes(r.kind)) out.push(`guide: unknown recovery kind ${r.kind}`);
  }
  if (!(pack.hunger.hungry < pack.hunger.starving)) out.push("guide: hunger thresholds must rise");
  return out;
}
