/**
 * Story round 7 (2026-10-19): timed quests that can fail and what failing opens,
 * turning points the player decides (quest.decide) with branches that start by
 * themselves, delayed consequences (an incident's follow-up comes N days later,
 * with an omen the day before), feasts kept year after year, timed events with
 * several visits / per-offer limits / a keepsake for doing everything, and
 * achievements with rewards to claim and titles villagers notice.
 * Played through commands wherever the game can get there in a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, residentId } from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, STORY_PACK, storyPackProblems, readJournal, incidentOn, incidentGate,
  ownedInHand, riteStreak, Outcome, type StoryView, type StoryPack,
} from "@openlife/module-village-stories";

const YEAR0 = 18 * 360;
const day = (month: number, d: number, year = 0) => YEAR0 + year * 360 + (month - 1) * 30 + (d - 1);

function life() {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(YEAR0);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const must = (type: string, payload: Record<string, unknown> = {}) => {
    const r = act(type, payload); assert.equal(r.ok, true, `${type} ${JSON.stringify(payload)}: ${r.errors?.[0]?.message}`); return r;
  };
  const go = (placeId: string) => { if (placeId && occupiedPlaceId(sim.worldView(), me) !== placeId) must(SettlementCommands.arrive, { placeId }); };
  // Walking takes time and people move with the hours: follow them until you stand together.
  const meet = (key: string) => {
    for (let n = 0; n < 6; n += 1) {
      const there = occupiedPlaceId(sim.worldView(), residentId(key));
      if (there && there === occupiedPlaceId(sim.worldView(), me)) return;
      if (there) go(there); else sim.advanceBy(1);
    }
    assert.fail(`could not find ${key}`);
  };
  const to = (tick: number) => { assert.ok(tick >= sim.tick, `can't go back to ${tick}`); sim.advanceBy(tick - sim.tick); };
  const view = () => sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  const guide = () => sim.project({ id: StoryProjections.guide, params: { actorId: me } }).data as unknown as { suggestions: { id: string; kind: string; title: string }[] };
  const j = () => readJournal(sim.worldView(), me);
  return { sim, me, act, must, go, meet, to, view, guide, j };
}

test("the pack is sound: a seventh chapter that branches, timed quests, decisions, follow-ups, streaks, multi-visit events, titles", () => {
  assert.deepEqual(storyPackProblems(), []);
  const ch7 = STORY_PACK.quests.find((q) => q.id === "main-7-flood")!;
  assert.equal(ch7.chapter, 7);
  assert.ok(ch7.steps.some((s) => s.objective.type === "decide"), "the chapter turns on the player's choice");
  const timed = STORY_PACK.quests.filter((q) => q.deadlineDays);
  assert.ok(timed.length >= 4 && timed.every((q) => q.failLine));
  assert.ok(STORY_PACK.incidents.list.filter((i) => i.followUpOnly).length >= 5);
  assert.ok(STORY_PACK.festivalRites.filter((r) => r.streak?.length).length >= 4);
  assert.ok(STORY_PACK.limitedEvents.filter((e) => (e.visits ?? 1) > 1).length >= 3);
  assert.ok(STORY_PACK.achievements.filter((a) => a.title).length >= 6 && STORY_PACK.achievements.filter((a) => a.reward).length >= 6);
  // The checker catches the new mistakes.
  const broken: StoryPack = structuredClone(STORY_PACK);
  broken.incidents.list.find((i) => i.id === "sick-fox")!.choices[0]!.followUp = { incident: "nope", afterDays: 7 };
  broken.quests.find((q) => q.id === "side-healer-fever")!.failLine = undefined;
  broken.dialogues["elder"]!.nodes["root"]!.options.push({ id: "x", label: "x", requires: { title: "没有的名号" } });
  const problems = storyPackProblems(broken).join("\n");
  assert.match(problems, /follow-up nope missing/);
  assert.match(problems, /timed quest needs a failLine/);
  assert.match(problems, /no achievement gives the title 没有的名号/);
});

test("a timed errand fails when the days run out: told once, it opens a different road, and the miss has its own reward", () => {
  const { sim, act, must, meet, view, j } = life();
  meet("healer");
  must(StoryCommands.acceptQuest, { questId: "side-healer-fever" });
  let q = view().quests.find((x) => x.id === "side-healer-fever")!;
  assert.equal(q.status, "active");
  assert.equal(q.daysLeft, 3);
  sim.advanceBy(3);
  assert.equal(view().quests.find((x) => x.id === "side-healer-fever")!.daysLeft, 0, "today is the last day");
  assert.equal(j().quests["side-healer-fever"]!.status, "active");
  must(SettlementCommands.step); // 「结束这一天」
  sim.advanceBy(1);
  q = view().quests.find((x) => x.id === "side-healer-fever")!;
  assert.equal(q.status, "failed", "ending the day failed it even though the player did nothing");
  assert.ok(j().flags.includes("fever-late"));
  assert.equal(j().counters["quest-failed"], 1);
  meet("healer");
  const again = act(StoryCommands.acceptQuest, { questId: "side-healer-fever" });
  assert.equal(again.ok, false);
  assert.match(again.errors?.[0]?.message ?? "", /误了期限/);
  // Failing opened a road: 蓍婆's words for it, and 小满's slow recovery in the incident pool.
  const healer = view().dialogues.find((d) => d.npc === "healer")!;
  assert.equal(healer.options.find((o) => o.id === "fever-guilt")?.enabled, true);
  assert.equal(incidentGate(sim.worldView(), sim.worldView().getComponent("modern:world", "modern.world_state")!.activeCharacterId as string, j())(STORY_PACK.incidents.list.find((i) => i.id === "fever-after")!), true);
  // The hidden 「误了一回」 is earned, and its reward is claimed once.
  assert.notEqual(j().achievements["late-once"], undefined);
  const badge = view().achievements.find((a) => a.id === "late-once")!;
  assert.equal(badge.reward?.enabled, true);
  must(StoryCommands.claimAchievement, { achievementId: "late-once" });
  assert.equal(ownedInHand(sim.worldView(), String(sim.worldView().getComponent("modern:world", "modern.world_state")!.activeCharacterId), "resource:herb").length, 1);
  assert.equal(act(StoryCommands.claimAchievement, { achievementId: "late-once" }).ok, false, "a reward is claimed once");
  assert.equal(act(StoryCommands.claimAchievement, { achievementId: "chapter-7" }).ok, false, "not before it is earned");
});

test("a decision played for real: feed 小汲's dog, choose to keep it, and the choice sets off a chain with a follow-up three days later", () => {
  const { sim, me, act, must, go, meet, to, view, guide, j } = life();
  to(day(4, 12));
  go("place:ford");
  must(StoryCommands.rite, { riteId: "net" });
  assert.ok(ownedInHand(sim.worldView(), me, "resource:fish").length >= 1);
  meet("water-child");
  must(StoryCommands.acceptQuest, { questId: "side-stray-dog" });
  assert.equal(act(StoryCommands.decide, { questId: "side-stray-dog", optionId: "keep" }).ok, false, "no decision before its step");
  must(StoryCommands.turnIn, { questId: "side-stray-dog" });
  const q = view().quests.find((x) => x.id === "side-stray-dog")!;
  assert.deepEqual(q.decide?.map((d) => d.id), ["keep", "return"]);
  const g = guide().suggestions.find((s) => s.kind === "quest-decide");
  assert.ok(g, "the guide names the turning point instead of choosing for you");
  must(StoryCommands.decide, { questId: "side-stray-dog", optionId: "keep" });
  assert.equal(j().quests["side-stray-dog"]!.status, "done");
  assert.ok(j().flags.includes("dog-kept") && !j().flags.includes("dog-returned"));
  assert.equal(j().counters["decision"], 1);
  assert.equal(act(StoryCommands.decide, { questId: "side-stray-dog", optionId: "return" }).ok, false, "no going back");

  // The kept dog barks one night; asking 阿犴 to look sets a follow-up for three days later.
  const days = Array.from({ length: 360 }, (_, n) => sim.tick + 1 + n);
  const bark = days.find((t) => incidentOn(t, incidentGate(sim.worldView(), me, j()))?.id === "dog-at-night")!;
  assert.ok(bark, "the dog's night comes once it is kept");
  to(bark);
  must(StoryCommands.resolveIncident, { incidentId: "dog-at-night", choiceId: "hunter" });
  assert.equal(j().scheduled[String(bark + 3)], "hunter-dog-lesson");
  // 「阿黄」 is earned: its title can be worn, and 小汲 notices it.
  assert.ok(view().title.earned.includes("阿黄的朋友"));
  must(StoryCommands.setTitle, { title: "阿黄的朋友" });
  assert.equal(j().title, "阿黄的朋友");
  assert.equal(act(StoryCommands.setTitle, { title: "守信的人" }).ok, false, "a title not earned");
  to(bark + 2);
  assert.match(view().omens[0]?.text ?? "", /阿犴/, "an omen the day before");
  assert.ok(guide().suggestions.some((s) => s.kind === "omen"));
  to(bark + 3);
  assert.equal(view().incident?.id, "hunter-dog-lesson", "the follow-up comes on its day, whatever the draw");
  must(StoryCommands.resolveIncident, { incidentId: "hunter-dog-lesson", choiceId: "learn" });
  assert.ok(j().flags.includes("dog-trained"));
  meet("water-child");
  const child = view().dialogues.find((d) => d.npc === "water-child");
  if (child) assert.equal(child.options.find((o) => o.id === "title-dog")?.enabled, true, "小汲 answers to the title");
  // Follow-up-only incidents never come by chance.
  const lessonByChance = Array.from({ length: 720 }, (_, n) => YEAR0 + n).some((t) => incidentOn(t)?.followUpOnly);
  assert.equal(lessonByChance, false);
});

test("chapter 7's branches: the choice starts its own timed errand, missing it opens the aftermath, and keeping it closes the chapter's step", () => {
  const { sim, me, j } = life();
  const w = sim.worldView();
  const at = (journal: ReturnType<typeof j>, tick: number) => { const out = new Outcome(w, me, journal, tick); out.finish("test"); return out; };
  const levee = at({ ...j(), flags: ["flood:levee"] }, sim.tick);
  assert.equal(levee.j.quests["side-flood-levee"]?.status, "active", "the levee errand began by itself");
  assert.equal(levee.j.quests["side-flood-move"], undefined, "the road not taken does not start");
  assert.match(levee.lines.join(""), /8 天内/);
  const late = at(levee.j, sim.tick + 9);
  assert.equal(late.j.quests["side-flood-levee"]?.status, "failed");
  assert.ok(late.j.flags.includes("flood-plan-failed"));
  assert.equal(late.j.quests["side-flood-aftermath"]?.status, "active", "the aftermath starts the moment the levee fails");
  assert.match(late.lines.join(""), /冲开一个口子/);
  // Chapter 7's third step waits on whichever road ends.
  const ch7 = { ...late.j, quests: { ...late.j.quests, "main-7-flood": { status: "active" as const, step: 2, base: 0, startedAt: sim.tick } } };
  const after = at({ ...ch7, flags: [...ch7.flags, "flood-plan-done"] }, sim.tick + 10);
  assert.equal(after.j.quests["main-7-flood"]?.step, 3, "the flag from either road moves the chapter on");
});

test("feasts kept year after year, events with several visits and limited offers", () => {
  assert.equal(riteStreak([18, 19, 20], 20), 3);
  assert.equal(riteStreak([18, 20], 20), 1, "a skipped year breaks the streak");
  assert.equal(riteStreak([], 20), 0);
  const { must, act, go, to, view, j } = life();
  to(day(4, 12));
  go("place:ford");
  must(StoryCommands.rite, { riteId: "net" });
  assert.deepEqual(j().riteYears["fish-run"], [18]);
  assert.equal(j().counters["rite-streak"], 1);
  to(day(8, 14));
  go("place:river");
  const lantern = view().events.find((e) => e.id === "lantern-night")!;
  assert.equal(lantern.active, true);
  assert.equal(lantern.visits, 3);
  must(StoryCommands.joinEvent, { eventId: "lantern-night", offerId: "sing" });
  const again = act(StoryCommands.joinEvent, { eventId: "lantern-night", offerId: "sing" });
  assert.equal(again.ok, false);
  assert.match(again.errors?.[0]?.message ?? "", /只能换 1 回/);
  const after = view().events.find((e) => e.id === "lantern-night")!;
  assert.equal(after.used, 1, "one of three visits used; the event is still open to the others");
  assert.equal(after.offers.find((o) => o.id === "sing")!.taken, 1);
  assert.equal(after.complete?.done, false);
});
