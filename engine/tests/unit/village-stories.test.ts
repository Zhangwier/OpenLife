/**
 * 故事层（village-stories）：主线/支线任务链、对话树、节日仪式、限时活动、突发事件、成就。
 * 每一项都通过真实命令玩一遍：任务步骤由村里真实发生的事推进，奖励是真实生成、归你所有的物品，
 * 对话与选择会改变村民对你的交情。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule, ownerOf, holderOf, prototypeOf } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, residentId, socialOf, bondOf } from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, storyPackProblems, incidentOn, readJournal, ownedInHand, STORY_PACK, DAYS_PER_YEAR,
  type StoryView,
} from "@openlife/module-village-stories";

const YEAR0 = 18 * 360;

function life() {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(YEAR0);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  /** A player action; a day ends when today's strength runs out, then it is tried again. */
  const act = (type: string, payload: Record<string, unknown> = {}) => {
    let r = sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
    if (!r.ok && /E_SETTLEMENT_EXHAUSTED/.test(r.errors[0]?.code ?? "")) {
      sim.advanceBy(1);
      r = sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
    }
    return r;
  };
  const go = (placeId: string) => {
    if (occupiedPlaceId(sim.worldView(), me) !== placeId) assert.equal(act(SettlementCommands.arrive, { placeId }).ok, true, `walk to ${placeId}`);
  };
  const meet = (key: string) => go(occupiedPlaceId(sim.worldView(), residentId(key)));
  const view = () => sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  const quest = (id: string) => view().quests.find((q) => q.id === id)!;
  const ok = (r: ReturnType<typeof act>, what: string) => assert.equal(r.ok, true, `${what}: ${r.errors?.[0]?.message}`);
  const lines = (r: ReturnType<typeof act>) => sim.kernel.internals.eventLog.all()
    .filter((e) => r.eventIds.includes(e.id)).map((e) => String(e.data?.line ?? "")).filter(Boolean);
  const jumpTo = (month: number, day: number) => {
    const year = Math.floor(sim.tick / DAYS_PER_YEAR);
    let target = year * DAYS_PER_YEAR + (month - 1) * 30 + (day - 1);
    if (target <= sim.tick) target += DAYS_PER_YEAR;
    sim.advanceBy(target - sim.tick);
  };
  return { sim, me, act, go, meet, view, quest, ok, lines, jumpTo };
}

test("the story pack is consistent with the settlement it is written for", () => {
  assert.deepEqual(storyPackProblems(), []);
  assert.ok(STORY_PACK.quests.filter((q) => q.kind === "main").length >= 3, "a main line of at least three chapters");
  assert.ok(STORY_PACK.quests.filter((q) => q.kind === "side").length >= 4, "several side stories");
  assert.ok(Object.keys(STORY_PACK.dialogues).length >= 5, "dialogue trees for several villagers");
  assert.ok(STORY_PACK.incidents.list.length >= 5 && STORY_PACK.limitedEvents.length >= 3 && STORY_PACK.achievements.length >= 12);
});

test("main chapter one: real talks and real work move the steps, a hand-over finishes it with a real reward", () => {
  const { sim, me, act, go, meet, quest, ok, lines, view } = life();
  assert.equal(quest("main-1-arrival").accept?.enabled, true, "埴公's first errand is offered from anywhere");
  assert.equal(quest("main-2-kiln").accept?.enabled, false, "chapter two waits for chapter one");
  const accepted = act(StoryCommands.acceptQuest, { questId: "main-1-arrival" });
  ok(accepted, "accept");
  assert.match(lines(accepted).join(""), /来了就是缘分/);

  for (const key of ["elder", "yu", "lan"]) {
    meet(key);
    ok(act(SettlementCommands.talk, { targetId: residentId(key) }), `talk to ${key}`);
  }
  assert.equal(quest("main-1-arrival").step?.id, "fuel-gather", "three different people met");
  assert.ok(view().achievements.find((a) => a.id === "first-words")?.unlocked);

  go("place:reedbed");
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }), "fuel 1");
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }), "fuel 2");
  const step = quest("main-1-arrival").step!;
  assert.equal(step.id, "fuel");
  assert.equal(step.turnIn?.enabled, false, "阿灶 is not here yet");

  meet("cook");
  const cookBefore = bondOf(socialOf(sim.worldView(), residentId("cook")), me).familiarity;
  const done = act(StoryCommands.turnIn, { questId: "main-1-arrival" });
  ok(done, "turn in");
  assert.match(lines(done).join(""), /正好断火/);
  assert.match(lines(done).join(""), /河岸的人/);

  const q = quest("main-1-arrival");
  assert.equal(q.status, "done");
  const bowl = ownedInHand(sim.worldView(), me, "resource:bowl").find((id) => id.startsWith("village-stories:item:"));
  assert.ok(bowl, "埴公's bowl is a real item");
  assert.equal(ownerOf(sim.worldView(), bowl!), me);
  assert.equal(holderOf(sim.worldView(), bowl!), me);
  assert.equal(prototypeOf(sim.worldView(), bowl!).resourceId, "resource:bowl");
  assert.ok(bondOf(socialOf(sim.worldView(), residentId("cook")), me).familiarity > cookBefore, "阿灶 remembers the favour");
  assert.ok(readJournal(sim.worldView(), me).flags.includes("settled-in"));
  assert.ok(view().achievements.find((a) => a.id === "chapter-1")?.unlocked);
  assert.equal(quest("main-2-kiln").status, "available");
});

test("dialogue trees: options gated by quest steps and hearts, choices change the story and the bond", () => {
  const { sim, me, act, meet, view, quest, ok, lines } = life();
  meet("elder");
  let elder = view().dialogues.find((d) => d.npc === "elder")!;
  assert.equal(elder.node, "root");
  const master = elder.options.find((o) => o.id === "master")!;
  assert.equal(master.enabled, false, "his master's story waits for the right moment");
  assert.equal(act(StoryCommands.choose, { npc: "elder", option: "master" }).ok, false);

  const trustBefore = bondOf(socialOf(sim.worldView(), residentId("elder")), me).trust;
  ok(act(StoryCommands.choose, { npc: "elder", option: "fire", node: "root" }), "ask about fire");
  elder = view().dialogues.find((d) => d.npc === "elder")!;
  assert.equal(elder.node, "fire");
  const answer = act(StoryCommands.choose, { npc: "elder", option: "yes" });
  ok(answer, "listen");
  assert.match(lines(answer).join(""), /记性还行/);
  assert.ok(bondOf(socialOf(sim.worldView(), residentId("elder")), me).trust > trustBefore);
  assert.equal(view().dialogues.find((d) => d.npc === "elder")!.node, "root", "a finished branch returns to the start");
  assert.equal(act(StoryCommands.choose, { npc: "elder", option: "yes", node: "fire" }).ok, false, "a stale node is refused");

  // 阿岚's private question needs three hearts.
  meet("lan");
  const lan = view().dialogues.find((d) => d.npc === "lan")!;
  assert.equal(lan.options.find((o) => o.id === "secret")!.enabled, false);
  assert.match(lan.options.find((o) => o.id === "secret")!.reason, /3 颗心/);
  ok(act(StoryCommands.choose, { npc: "lan", option: "south" }), "south");
  ok(act(StoryCommands.choose, { npc: "lan", option: "ask-road" }), "road");
  assert.ok(readJournal(sim.worldView(), me).flags.includes("lan-told-south"));
  assert.equal(quest("main-3-ford").status, "available");
});

test("side story: 小满's stones finish through work plus a dialogue choice", () => {
  const { sim, me, act, go, meet, quest, ok, view } = life();
  meet("clay-child");
  ok(act(StoryCommands.acceptQuest, { questId: "side-man-stone" }), "accept from 小满");
  go("place:claypits");
  ok(act(SettlementCommands.draw, { placeId: "place:claypits", resourceId: "resource:clay" }), "clay 1");
  ok(act(SettlementCommands.draw, { placeId: "place:claypits", resourceId: "resource:clay" }), "clay 2");
  assert.equal(quest("side-man-stone").step?.id, "tell");
  meet("clay-child");
  const d = view().dialogues.find((x) => x.npc === "clay-child")!;
  assert.equal(d.options.find((o) => o.id === "stone")!.enabled, true);
  ok(act(StoryCommands.choose, { npc: "clay-child", option: "stone" }), "show the stone");
  ok(act(StoryCommands.choose, { npc: "clay-child", option: "give" }), "give it");
  assert.equal(quest("side-man-stone").status, "done");
  assert.ok(readJournal(sim.worldView(), me).flags.includes("man-friend"));
});

test("festival rites happen once a year, on the day, at the place", () => {
  const { sim, me, act, go, ok, view, jumpTo } = life();
  assert.equal(act(StoryCommands.rite, {}).ok, false, "no feast today");
  jumpTo(3, 5);
  assert.equal(view().festival?.feast, "spring-rite");
  go("place:yard");
  assert.equal(view().festival?.enabled, false, "must be at the hearth yard");
  go("place:hearth-yard");
  const before = ownedInHand(sim.worldView(), me, "resource:grain").length;
  ok(act(StoryCommands.rite, {}), "spring rite");
  assert.equal(ownedInHand(sim.worldView(), me, "resource:grain").length, before + 1);
  assert.equal(act(StoryCommands.rite, {}).ok, false, "once a year");
  assert.equal(readJournal(sim.worldView(), me).counters.rite, 1);

  // A new feast in the pack, 祭河, asks for a bowl given to the river.
  jumpTo(6, 6);
  go("place:river");
  assert.match(view().festival?.reason ?? "", /陶碗/);
});

test("limited-time events open only in their window and only once a year", () => {
  const { sim, me, act, go, ok, view, jumpTo } = life();
  go("place:reedbed");
  assert.equal(act(StoryCommands.joinEvent, { eventId: "birds-return", offerId: "gather" }).ok, false, "not the season");
  assert.ok(view().events.find((e) => e.id === "birds-return")!.inDays > 0);
  jumpTo(2, 21);
  go("place:reedbed");
  assert.equal(view().events.find((e) => e.id === "birds-return")!.active, true);
  ok(act(StoryCommands.joinEvent, { eventId: "birds-return", offerId: "gather" }), "gather feathers");
  assert.equal(ownedInHand(sim.worldView(), me, "resource:fiber").length >= 1, true);
  assert.equal(act(StoryCommands.joinEvent, { eventId: "birds-return", offerId: "gather" }).ok, false, "once a year");
  assert.ok(view().achievements.find((a) => a.id === "market-day")?.unlocked);
  jumpTo(2, 27);
  assert.equal(view().events.find((e) => e.id === "birds-return")!.active, false, "the window closed");
});

test("incidents: deterministic per day, resolved once, choices with requirements and consequences", () => {
  const { sim, me, act, go, view, ok } = life();
  // The same day always has the same incident.
  for (let t = YEAR0; t < YEAR0 + 60; t += 1) assert.equal(incidentOn(t)?.id, incidentOn(t)?.id);
  const days = Array.from({ length: 360 }, (_, n) => YEAR0 + n).filter((t) => incidentOn(t));
  assert.ok(days.length > 40 && days.length < 180, `about three days in ten have an incident (${days.length})`);

  let free: { day: number; choice: string } | undefined;
  for (const day of days) {
    const c = incidentOn(day)!.choices.find((x) => !x.requires);
    if (day > sim.tick && c) { free = { day, choice: c.id }; break; }
  }
  sim.advanceBy(free!.day - sim.tick);
  go("place:yard");
  const incident = view().incident!;
  assert.ok(incident && incident.resolved === null);
  assert.equal(act(StoryCommands.resolveIncident, { incidentId: "not-today", choiceId: free!.choice }).ok, false);
  ok(act(StoryCommands.resolveIncident, { incidentId: incident.id, choiceId: free!.choice }), "resolve");
  assert.equal(act(StoryCommands.resolveIncident, { incidentId: incident.id, choiceId: free!.choice }).ok, false, "only once");
  assert.equal(readJournal(sim.worldView(), me).counters.incident, 1);
  assert.ok(view().incident?.resolved);
});

test("only the player's own deeds count: villagers working on their own move nothing", () => {
  const { sim, me } = life();
  sim.advanceBy(5);
  const j = readJournal(sim.worldView(), me);
  assert.equal(j.counters.gather ?? 0, 0);
  assert.equal(Object.keys(j.achievements).length, 0);
});

test("the journal is saved and loaded with the world; an old save without stories still loads", () => {
  const { sim, me, act, ok } = life();
  ok(act(StoryCommands.acceptQuest, { questId: "main-1-arrival" }), "accept");
  const base = [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
  const loaded = Simulation.load(sim.save(), [...base, villageStoriesModule]);
  assert.equal(loaded.result.ok, true, loaded.result.errors?.[0]?.message);
  assert.equal(readJournal(loaded.simulation!.worldView(), me).quests["main-1-arrival"]?.status, "active");

  // A world saved before the story layer existed opens with an empty journal and offers chapter one.
  const old = new Simulation({ worldSeed: 9, modules: base });
  old.dispatch({ type: "modern.initialize_world" });
  old.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  old.advanceBy(YEAR0);
  old.dispatch({ type: SettlementCommands.found });
  const upgraded = Simulation.load(old.save(), [...base, villageStoriesModule]);
  assert.equal(upgraded.result.ok, true, upgraded.result.errors?.[0]?.message);
  const who = String(upgraded.simulation!.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const v = upgraded.simulation!.project({ id: StoryProjections.journal, params: { actorId: who } }).data as unknown as StoryView;
  assert.equal(v.quests.find((q) => q.id === "main-1-arrival")?.status, "available");
});
