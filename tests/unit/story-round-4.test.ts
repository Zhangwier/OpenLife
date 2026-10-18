/**
 * Story round 4 (2026-10-18 下午): main chapters 4-6, incident triggers
 * (flag chains, `once`, weather, weight), several ways to keep a feast and two
 * new feasts, timed events with requirements, season/weather small talk,
 * achievement categories, hidden ones and progress. Played through commands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, isWet, feastOn } from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, STORY_PACK, storyPackProblems, readJournal, incidentOn, incidentGate, meets,
  progressOf, ownedInHand, type StoryView,
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
  const go = (placeId: string) => { if (occupiedPlaceId(sim.worldView(), me) !== placeId) must(SettlementCommands.arrive, { placeId }); };
  const to = (tick: number) => { assert.ok(tick >= sim.tick, `can't go back to ${tick}`); sim.advanceBy(tick - sim.tick); };
  const view = () => sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  const j = () => readJournal(sim.worldView(), me);
  return { sim, me, act, must, go, to, view, j };
}

test("the story pack is sound, and the main story now runs six chapters, each waiting on the last", () => {
  assert.deepEqual(storyPackProblems(), []);
  const mains = STORY_PACK.quests.filter((q) => q.kind === "main").sort((a, b) => a.chapter! - b.chapter!);
  assert.deepEqual(mains.map((q) => q.chapter), [1, 2, 3, 4, 5, 6]);
  for (const q of mains.slice(3)) {
    const prev = mains[q.chapter! - 2]!;
    assert.ok(q.requires?.questsDone?.includes(prev.id), `${q.title} waits on ${prev.title}`);
    assert.ok(q.steps.some((s) => s.objective.type === "questDone"), `${q.title} pulls a side story into the main line`);
  }
});

test("a questDone step completes when the side story does", () => {
  const { sim, me, j } = life();
  const q = STORY_PACK.quests.find((x) => x.id === "main-4-longhouse")!;
  const base = j();
  const on = { ...base, quests: { ...base.quests, [q.id]: { status: "active" as const, step: 1, base: 0, startedAt: sim.tick } } };
  assert.equal(progressOf(sim.worldView(), me, on, q)!.done, 0);
  const done = { ...on, quests: { ...on.quests, "side-matron-winter": { status: "done" as const, step: 2, base: 0, startedAt: 0, doneAt: sim.tick } } };
  assert.equal(progressOf(sim.worldView(), me, done, q)!.done, 1);
});

test("incident triggers: chained ones wait on their flag, once-only ones never repeat, weather picks its own days", () => {
  const { sim, me, j } = life();
  const base = j();
  const days = Array.from({ length: 720 }, (_, n) => YEAR0 + n);
  const plain = incidentGate(sim.worldView(), me, base);
  assert.ok(!days.some((t) => incidentOn(t, plain)?.id === "shan-sao-return"), "no flag, no follow-up");
  const flagged = { ...base, flags: [...base.flags, "shan-sao-scared"] };
  const gate = incidentGate(sim.worldView(), me, flagged);
  const when = days.find((t) => incidentOn(t, gate)?.id === "shan-sao-return");
  assert.ok(when !== undefined, "with the flag the follow-up comes");
  const seen = { ...flagged, incidents: { ...flagged.incidents, [String(when)]: "shan-sao-return:drum" } };
  assert.ok(!days.some((t) => incidentOn(t, incidentGate(sim.worldView(), me, seen))?.id === "shan-sao-return"), "once means once");
  for (const t of days) {
    const i = incidentOn(t, plain);
    if (i?.id === "flash-flood") assert.equal(isWet(t), true, "floods come on wet days");
    if (i?.id === "dry-spell") assert.equal(isWet(t), false, "dry spells on dry days");
  }
  assert.ok(days.some((t) => incidentOn(t, plain)?.id === "flash-flood"));
  // Back-compat: with no story flags, existing incidents land on the same days as before (all weight 1).
  assert.equal(incidentOn(YEAR0 + 3), incidentOn(YEAR0 + 3, (i) => !i.requires && !i.once));
});

test("a chain played for real: scare the shan-sao off with bamboo, and it comes back for its sandal", () => {
  const { sim, me, must, go, to, view, j } = life();
  const days = Array.from({ length: 720 }, (_, n) => YEAR0 + 1 + n);
  const first = days.find((t) => incidentOn(t, incidentGate(sim.worldView(), me, j()))?.id === "shan-sao-fire")!;
  assert.ok(first, "the fire-side footprints happen some autumn or winter day");
  to(first - 1);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel", amount: 1 });
  to(first);
  assert.equal(view().incident?.id, "shan-sao-fire");
  must(StoryCommands.resolveIncident, { incidentId: "shan-sao-fire", choiceId: "bamboo" });
  assert.ok(j().flags.includes("shan-sao-scared"));
  assert.equal(j().counters["incident:shan-sao-fire"], 1, "each incident is counted by name");
  assert.equal(ownedInHand(sim.worldView(), me, "resource:curio").length, 1, "it dropped its sandal");
  const next = days.find((t) => t > first && incidentOn(t, incidentGate(sim.worldView(), me, j()))?.id === "shan-sao-return")!;
  assert.ok(next, "the follow-up is now in the draw");
  to(next);
  const v = view();
  assert.equal(v.incident?.id, "shan-sao-return");
  assert.equal(v.incident?.chained, true);
  must(StoryCommands.resolveIncident, { incidentId: "shan-sao-return", choiceId: "return" });
  assert.ok(j().flags.includes("shan-sao-pact"));
  assert.equal(view().incident?.resolved, "shan-sao-return:return", "the page still shows what you did today");
  assert.equal(ownedInHand(sim.worldView(), me, "resource:curio").length, 0, "the sandal went back");
});

test("feasts: the fish run has two ways to keep it, you keep it once a year, and it counts", () => {
  const { sim, must, act, go, to, view, j } = life();
  assert.equal(feastOn(day(4, 12))?.id, "fish-run");
  assert.equal(feastOn(day(11, 22))?.id, "first-hunt");
  to(day(4, 12));
  go("place:ford");
  const f = view().festival!;
  assert.equal(f.name, "鱼汛祭");
  assert.equal(f.rites.length, 2);
  const release = f.rites.find((r) => r.id === "")!;
  assert.equal(release.enabled, false, "releasing a fish needs a fish");
  assert.match(release.reason, /鱼/);
  must(StoryCommands.rite, { riteId: "net" });
  assert.ok(ownedInHand(sim.worldView(), sim.worldView().getComponent("modern:world", "modern.world_state")!.activeCharacterId as string, "resource:fish").length >= 1);
  assert.equal(act(StoryCommands.rite, {}).ok, false, "once a year");
  assert.equal(j().counters["rite:fish-run"], 1);
  assert.ok(j().achievements["fish-run"] !== undefined, "还河一条");
  assert.equal(act(StoryCommands.rite, { riteId: "nope" }).ok, false);
});

test("timed events: the chestnut fair trades chestnuts for salt, and the scale waits on 阿贾's friendship", () => {
  const { sim, me, must, go, to, view, j } = life();
  to(day(9, 21));
  go("place:chestnut-wood");
  must(SettlementCommands.draw, { placeId: "place:chestnut-wood", resourceId: "resource:chestnut", amount: 1 });
  sim.advanceBy(1);
  go("place:market");
  const fair = view().events.find((e) => e.id === "chestnut-fair")!;
  assert.equal(fair.active, true);
  const scale = fair.offers.find((o) => o.id === "scale")!;
  assert.equal(scale.enabled, false);
  assert.match(scale.reason, /阿贾/);
  must(StoryCommands.joinEvent, { eventId: "chestnut-fair", offerId: "chestnut" });
  assert.equal(ownedInHand(sim.worldView(), me, "resource:salt").length >= 1 || ownedInHand(sim.worldView(), me, "resource:salt-cake").length >= 1, true);
  assert.equal(j().counters["event:chestnut-fair"], 1);
});

test("small talk follows the season and the weather", () => {
  const { sim, me, j } = life();
  const w = sim.worldView();
  const summer = { season: ["夏"] }, wet = { weather: "wet" as const };
  void w;
  const at = (t: number) => ({ ...sim.worldView(), tick: t }) as unknown as typeof w;
  assert.equal(meets(at(day(7, 1)), me, j(), summer), "");
  assert.match(meets(at(day(1, 1)), me, j(), summer), /夏/);
  const rainy = Array.from({ length: 200 }, (_, n) => YEAR0 + n).find((t) => isWet(t))!;
  const dry = Array.from({ length: 200 }, (_, n) => YEAR0 + n).find((t) => !isWet(t))!;
  assert.equal(meets(at(rainy), me, j(), wet), "");
  assert.notEqual(meets(at(dry), me, j(), wet), "");
  const weaver = STORY_PACK.dialogues["weaver"]!.nodes.root!.options;
  assert.ok(weaver.some((o) => o.requires?.weather === "wet") && weaver.some((o) => o.requires?.season?.includes("夏")));
});

test("achievements: grouped, hidden until earned, and counting ones show how far you are", () => {
  const { view } = life();
  const a = view().achievements;
  assert.ok(a.every((x) => x.category && x.category !== "其他"), "every achievement has a group");
  const hidden = a.find((x) => x.id === "wolf-friend")!;
  assert.equal(hidden.name, "？？？");
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.progress, null);
  const talk = a.find((x) => x.id === "chatterbox")!;
  assert.deepEqual(talk.progress, { have: 0, need: 30 });
  assert.ok(a.filter((x) => x.category === "主线").length === 6);
});
