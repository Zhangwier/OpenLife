/**
 * Village Stories - the story layer over the river-terrace settlement.
 *
 * Adds what makes a village life feel like a story rather than a loop:
 *   - quest chains (a three-chapter main line and side stories) whose steps
 *     complete from real settlement events (talking, drawing water, digging
 *     clay, crafting, exchanging, joining a feast) or by handing items over;
 *   - dialogue trees per villager, with options gated by hearts, flags and
 *     quest steps, that move the villager's real social memory;
 *   - festival rites on feast days, limited-time events in calendar windows,
 *     a deterministic incident of the day with consequential choices;
 *   - achievements unlocked from the same counters.
 *
 * Every state change goes through validated commands; the journal lives on
 * the player in `village-stories.journal`.
 */
import type { CommandIntent, ConstraintOutcome, Effect, OpenLifeModule, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { SettlementComponents, SettlementId, feastOn, isIll, residentId } from "@openlife/module-settlement-locations";
import { STORY_PACK, storyPackProblems, type QuestSpec } from "./spec.ts";
import {
  Outcome, STORY_OWNER, StoryComponents, activePlayer, baseFor, consume, daysUntil, eventActive, handOver, heartsWith, incidentOn,
  keyOf, meets, npcName, ownedInHand, progressOf, readJournal, resourceLabel, yearOf, type Journal,
} from "./journal.ts";

export const StoryCommands = {
  acceptQuest: "village-stories.quest.accept",
  turnIn: "village-stories.quest.turn_in",
  choose: "village-stories.dialogue.choose",
  rite: "village-stories.festival.rite",
  joinEvent: "village-stories.event.join",
  resolveIncident: "village-stories.incident.resolve",
} as const;
export const StoryProjections = { journal: "village-stories.journal" } as const;
export const StoryRejection = "E_STORY_NOT_NOW";

const refuse = (message: string): ConstraintOutcome => ({ ok: false, code: StoryRejection, message });
type Ctx = { world: WorldView; command: CommandIntent & { payload: Record<string, unknown> } };
const str = (c: Ctx, key: string) => String(c.command.payload?.[key] ?? "");
const here = (world: WorldView, id: string) => occupiedPlaceId(world, id);
const quest = (id: string) => STORY_PACK.quests.find((q) => q.id === id);

/** The player, in the founded settlement, standing somewhere. */
function player(c: Ctx): { me: string; why: string } {
  const me = c.command.actorId ?? "";
  if (!me || me !== activePlayer(c.world)) return { me, why: "只有你自己能做这件事。" };
  if (!c.world.getComponent(SettlementId, SettlementComponents.settlement)) return { me, why: "村子还没建起来。" };
  if (!here(c.world, me)) return { me, why: "先到村里来。" };
  return { me, why: "" };
}

/** A villager standing with the player and able to talk. */
function withMe(world: WorldView, me: string, key: string): string {
  const rid = residentId(key);
  if (!world.getComponent(rid, SettlementComponents.resident)) return "要找一个具体的人。";
  if (here(world, rid) !== here(world, me)) return `${npcName(key)}不在这儿。`;
  if (isIll(world.tick, rid)) return `${npcName(key)}病着，改天吧。`;
  return "";
}

// --- availability, shared by rules and the projection ----------------------

export function acceptProblem(world: WorldView, me: string, j: Journal, q: QuestSpec): string {
  if (j.quests[q.id]) return j.quests[q.id]!.status === "done" ? "已经办完了" : "正在办";
  const why = meets(world, me, j, q.requires);
  if (why) return why;
  if (q.giver && !q.autoOffer) return withMe(world, me, q.giver);
  return "";
}

export function turnInProblem(world: WorldView, me: string, j: Journal, q: QuestSpec): string {
  const state = j.quests[q.id];
  const step = state?.status === "active" ? q.steps[state.step] : undefined;
  if (!step || step.objective.type !== "deliver") return "现在没有要交的东西";
  const o = step.objective;
  const away = withMe(world, me, o.npc);
  if (away) return away;
  const have = ownedInHand(world, me, o.resource).length;
  return have >= o.count ? "" : `手里的${[o.resource].flat().map(resourceLabel).join("或")}不够（${have}/${o.count}）`;
}

function currentNode(j: Journal, key: string) {
  const tree = STORY_PACK.dialogues[key];
  if (!tree) return undefined;
  const id = tree.nodes[j.dialogue[key] ?? ""] ? j.dialogue[key]! : tree.start;
  return { id, node: tree.nodes[id]!, tree };
}

function riteToday(world: WorldView) {
  const feast = feastOn(world.tick);
  const rite = feast ? STORY_PACK.festivalRites.find((r) => r.feast === feast.id) : undefined;
  return feast && rite ? { feast, rite } : undefined;
}

function riteProblem(world: WorldView, me: string, j: Journal): string {
  const today = riteToday(world);
  if (!today) return "今天不是节日";
  if (j.rites[today.feast.id] === yearOf(world.tick)) return "今年已经做过了";
  if (here(world, me) !== today.feast.placeId) return "要到过节的地方去";
  return meets(world, me, j, today.rite.requires);
}

function offerProblem(world: WorldView, me: string, j: Journal, eventId: string, offerId: string): string {
  const e = STORY_PACK.limitedEvents.find((x) => x.id === eventId);
  if (!e) return "没有这个活动";
  if (!eventActive(world.tick, e)) return "活动不在这几天";
  if (j.events[e.id] === yearOf(world.tick)) return "今年已经参加过了";
  if (here(world, me) !== e.placeId) return "要到活动的地方去";
  const offer = e.offers.find((o) => o.id === offerId);
  if (!offer) return "没有这个选项";
  if (offer.give && ownedInHand(world, me, offer.give).length === 0) return `手里要有${resourceLabel(offer.give)}`;
  return "";
}

function incidentProblem(world: WorldView, me: string, j: Journal, incidentId: string, choiceId: string): string {
  const today = incidentOn(world.tick);
  if (!today || today.id !== incidentId) return "这件事没有发生，或者已经过去了";
  if (j.incidents[String(world.tick)]) return "这件事已经应对过了";
  const choice = today.choices.find((c) => c.id === choiceId);
  if (!choice) return "没有这个选择";
  return meets(world, me, j, choice.requires);
}

// --- counters fed by the settlement's own events ----------------------------

const COUNTED: Record<string, (data: Record<string, unknown>, target: string) => string[]> = {
  "settlement-locations.conversation": (d, t) => ["talk", `talk:${keyOf(t)}`, ...(d.feast ? ["feast", `feast:${String(d.feast)}`] : [])],
  "settlement-locations.gathered": (d) => ["gather", `gather:${String(d.resourceId)}`],
  "settlement-locations.water_carried": () => ["water"],
  "settlement-locations.crafted": (d) => ["craft", ...(d.recipeId ? [`craft:${String(d.recipeId)}`] : [])],
  "settlement-locations.cooked": () => ["cook", "craft"],
  "settlement-locations.gift_given": (_d, t) => ["gift", `gift:${keyOf(t)}`],
  "settlement-locations.exchanged": () => ["exchange"],
  "settlement-locations.player_barter_accepted": () => ["exchange"],
  "settlement-locations.hearth_helped": () => ["help"],
  "settlement-locations.lesson": () => ["lesson"],
  "settlement-locations.harvested": () => ["harvest"],
  "settlement-locations.sown": () => ["sow"],
  "settlement-locations.wish_fulfilled": () => ["wish"],
  "settlement-locations.roof_mended": () => ["roof"],
};

export const villageStoriesModule: OpenLifeModule = {
  manifest: {
    id: STORY_OWNER, version: "0.1.0", engineRange: "^0.1.0", type: "content-pack",
    name: "Village Stories",
    requires: ["life.settlement"],
    provides: ["settlement.stories"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "rule.reaction.register", "projection.register"],
  },
  register(ctx) {
    const problems = storyPackProblems();
    if (problems.length) throw new Error(`village-stories pack is invalid:\n${problems.join("\n")}`);
    ctx.registerComponent({ id: StoryComponents.journal, persist: true, description: "the player's quests, flags, achievements and story choices" });
    for (const type of Object.values(StoryCommands)) ctx.registerCommand({ type, description: "Village story action." });

    const rule = (type: string, check: (c: Ctx, me: string, j: Journal) => string, resolve: (c: Ctx, out: Outcome) => void) => {
      ctx.registerConstraintRule({ id: `${type}.allowed`, commandType: type, evaluate: (c) => {
        const { me, why } = player(c as Ctx);
        if (why) return refuse(why);
        const no = check(c as Ctx, me, readJournal(c.world, me));
        return no ? refuse(`${no}。`) : { ok: true };
      } });
      ctx.registerResolutionRule({ id: `${type}.resolve`, commandType: type, resolve: (c): Effect[] => {
        const me = c.command.actorId!;
        const out = new Outcome(c.world, me, readJournal(c.world, me), c.world.tick);
        resolve(c as Ctx, out);
        return out.finish(type);
      } });
    };

    rule(StoryCommands.acceptQuest,
      (c, me, j) => { const q = quest(str(c, "questId")); return q ? acceptProblem(c.world, me, j, q) : "没有这件事"; },
      (c, out) => {
        const q = quest(str(c, "questId"))!;
        const first = q.steps[0]!;
        out.j = { ...out.j, quests: { ...out.j.quests, [q.id]: { status: "active", step: 0, base: baseFor(c.world, out.me, out.j, first.objective), startedAt: out.tick } } };
        out.say("village-stories.quest_accepted", `${q.acceptLine}（「${q.title}」：${first.text}）`, { questId: q.id, kind: q.kind },
          q.giver ? residentId(q.giver) : undefined);
      });

    rule(StoryCommands.turnIn,
      (c, me, j) => { const q = quest(str(c, "questId")); return q ? turnInProblem(c.world, me, j, q) : "没有这件事"; },
      (c, out) => {
        const q = quest(str(c, "questId"))!;
        const step = q.steps[out.j.quests[q.id]!.step]!;
        const o = step.objective as Extract<typeof step.objective, { type: "deliver" }>;
        const ids = ownedInHand(c.world, out.me, o.resource).slice(0, o.count);
        out.effects.push(...handOver(ids, out.me, residentId(o.npc), `story: ${q.id}`));
        out.bond(o.npc, { familiarity: 0.5 });
        out.say("village-stories.delivered", step.doneLine ?? `你把东西交给了${npcName(o.npc)}。`, { questId: q.id, step: step.id }, residentId(o.npc));
        out.advance(q);
      });

    rule(StoryCommands.choose,
      (c, me, j) => {
        const key = str(c, "npc");
        const at = currentNode(j, key);
        if (!at) return `${npcName(key)}没什么要跟你说的`;
        const away = withMe(c.world, me, key);
        if (away) return away;
        if (str(c, "node") && str(c, "node") !== at.id) return "话头已经变了，重新听一遍";
        const option = at.node.options.find((o) => o.id === str(c, "option"));
        if (!option) return "没有这句话";
        return meets(c.world, me, j, option.requires, key);
      },
      (c, out) => {
        const key = str(c, "npc");
        const at = currentNode(out.j, key)!;
        const option = at.node.options.find((o) => o.id === str(c, "option"))!;
        out.bond(key, option.effects?.bond);
        out.flag(...(option.effects?.setFlags ?? []));
        out.count("dialogue");
        const next = option.next ?? at.tree.start;
        out.j = { ...out.j, dialogue: { ...out.j.dialogue, [key]: next } };
        out.say("village-stories.dialogue", option.effects?.line ?? at.tree.nodes[next]!.text,
          { npc: key, node: at.id, option: option.id, next }, residentId(key));
      });

    rule(StoryCommands.rite,
      (c, me, j) => riteProblem(c.world, me, j),
      (c, out) => {
        const { feast, rite } = riteToday(c.world)!;
        if (rite.requires?.resource) out.effects.push(...consume(ownedInHand(c.world, out.me, rite.requires.resource).slice(0, 1), out.me, `rite: ${feast.id}`));
        const got = out.reward(rite.reward);
        out.j = { ...out.j, rites: { ...out.j.rites, [feast.id]: yearOf(out.tick) } };
        out.count("rite");
        out.say("village-stories.rite", `${rite.line}${got.length ? `（得到：${got.join("、")}）` : ""}`, { feast: feast.id });
      });

    rule(StoryCommands.joinEvent,
      (c, me, j) => offerProblem(c.world, me, j, str(c, "eventId"), str(c, "offerId")),
      (c, out) => {
        const e = STORY_PACK.limitedEvents.find((x) => x.id === str(c, "eventId"))!;
        const offer = e.offers.find((o) => o.id === str(c, "offerId"))!;
        if (offer.give) out.effects.push(...consume(ownedInHand(c.world, out.me, offer.give).slice(0, 1), out.me, `event: ${e.id}`));
        const got = offer.get ? [out.grant(offer.get)] : [];
        for (const [k, b] of Object.entries(offer.bond ?? {})) out.bond(k, b);
        out.j = { ...out.j, events: { ...out.j.events, [e.id]: yearOf(out.tick) } };
        out.count("event");
        out.count(`event:${e.id}`);
        out.say("village-stories.event_joined", `${offer.line}${got.length ? `（得到：${got.join("、")}）` : ""}`, { eventId: e.id, offerId: offer.id });
      });

    rule(StoryCommands.resolveIncident,
      (c, me, j) => incidentProblem(c.world, me, j, str(c, "incidentId"), str(c, "choiceId")),
      (c, out) => {
        const incident = incidentOn(out.tick)!;
        const choice = incident.choices.find((x) => x.id === str(c, "choiceId"))!;
        if (choice.consume && choice.requires?.resource) out.effects.push(...consume(ownedInHand(c.world, out.me, choice.requires.resource).slice(0, 1), out.me, `incident: ${incident.id}`));
        const got = out.reward(choice);
        out.flag(...(choice.setFlags ?? []));
        out.j = { ...out.j, incidents: { ...out.j.incidents, [String(out.tick)]: `${incident.id}:${choice.id}` } };
        out.count("incident");
        out.say("village-stories.incident_resolved", `${choice.line}${got.length ? `（得到：${got.join("、")}）` : ""}`, { incidentId: incident.id, choiceId: choice.id });
      });

    // Real settlement events move counters, then quest steps and achievements.
    for (const [eventType, counters] of Object.entries(COUNTED)) {
      ctx.registerReactionRule({
        id: `${STORY_OWNER}.count.${eventType.replace(/^settlement-locations\./, "")}`, eventType,
        react: (c): Effect[] => {
          const me = activePlayer(c.world);
          if (!me || c.event.actorId !== me) return [];
          const out = new Outcome(c.world, me, readJournal(c.world, me), c.world.tick);
          const target = String(c.event.targetId ?? "");
          for (const counter of counters(c.event.data as Record<string, unknown>, target)) out.count(counter);
          if (eventType === "settlement-locations.conversation" && target && !out.j.talked.includes(keyOf(target))) {
            out.j = { ...out.j, talked: [...out.j.talked, keyOf(target)] };
          }
          return out.finish(`counted ${eventType}`);
        },
      });
    }

    ctx.registerProjection({
      id: StoryProjections.journal,
      description: "The player's story: quests, conversations on offer, festival, events, incident, achievements.",
      build: ({ world, params }) => storyView(world, String(params.actorId ?? activePlayer(world))) as unknown as Record<string, unknown>,
    });
  },
};

// --- what the player sees ----------------------------------------------------

export function storyView(world: WorldView, me: string) {
  const j = readJournal(world, me);
  const tick = world.tick;
  const year = yearOf(tick);
  const quests = STORY_PACK.quests.map((q) => {
    const state = j.quests[q.id];
    const p = progressOf(world, me, j, q);
    const step = state?.status === "active" ? q.steps[state.step] : undefined;
    const o = step?.objective;
    return {
      id: q.id, kind: q.kind, chapter: q.chapter ?? null, title: q.title, summary: q.summary,
      giver: q.giver ?? null, giverName: q.giver ? npcName(q.giver) : null,
      status: state?.status ?? "available",
      step: step ? { id: step.id, text: step.text, done: p?.done ?? 0, target: p?.target ?? 1, index: state!.step, of: q.steps.length,
        deliver: o?.type === "deliver" ? { npc: o.npc, npcName: npcName(o.npc), resources: [o.resource].flat() } : null,
        turnIn: o?.type === "deliver" ? { enabled: !turnInProblem(world, me, j, q), reason: turnInProblem(world, me, j, q) } : null } : null,
      accept: state ? null : { enabled: !acceptProblem(world, me, j, q), reason: acceptProblem(world, me, j, q) },
    };
  });
  const place = here(world, me);
  const dialogues = Object.keys(STORY_PACK.dialogues)
    .filter((key) => place && here(world, residentId(key)) === place)
    .map((key) => {
      const at = currentNode(j, key)!;
      return {
        npc: key, name: npcName(key), hearts: heartsWith(world, key, me), node: at.id, text: at.node.text,
        options: at.node.options.map((o) => {
          const why = withMe(world, me, key) || meets(world, me, j, o.requires, key);
          return { id: o.id, label: o.label, enabled: !why, reason: why };
        }),
      };
    });
  const today = riteToday(world);
  const incident = incidentOn(tick);
  return {
    tick,
    quests,
    dialogues,
    festival: today ? { feast: today.feast.id, name: today.feast.name, label: today.rite.label, placeId: today.feast.placeId,
      done: j.rites[today.feast.id] === year, enabled: !riteProblem(world, me, j), reason: riteProblem(world, me, j) } : null,
    events: STORY_PACK.limitedEvents.map((e) => ({
      id: e.id, name: e.name, intro: e.intro, placeId: e.placeId, window: e.window,
      active: eventActive(tick, e), inDays: daysUntil(tick, e), joined: j.events[e.id] === year,
      offers: e.offers.map((o) => ({ id: o.id, label: o.label ?? `用${resourceLabel(o.give ?? "")}换${o.get?.name ?? ""}`,
        enabled: !offerProblem(world, me, j, e.id, o.id), reason: offerProblem(world, me, j, e.id, o.id) })),
    })),
    incident: incident ? {
      id: incident.id, title: incident.title, text: incident.text, resolved: j.incidents[String(tick)] ?? null,
      choices: incident.choices.map((c) => ({ id: c.id, label: c.label,
        enabled: !incidentProblem(world, me, j, incident.id, c.id), reason: incidentProblem(world, me, j, incident.id, c.id) })),
    } : null,
    achievements: STORY_PACK.achievements.map((a) => ({ id: a.id, name: a.name, text: a.text,
      unlocked: j.achievements[a.id] !== undefined, at: j.achievements[a.id] ?? null })),
    counters: j.counters,
    flags: j.flags,
  };
}
export type StoryView = ReturnType<typeof storyView>;
