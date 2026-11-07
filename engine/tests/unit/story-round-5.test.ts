/**
 * Story round 5 (2026-10-18 下午二): people in depth. Heart-to-heart talks that
 * go deeper as the bond does (once-only words, words that reach others),
 * favours by tier, "how to warm / what it unlocks" on the people page, two
 * rivalries whose quests turn on how you took their quarrel, every way to keep
 * a feast in the guide, chapter 4-6 told step by step, the incident chains
 * continued. Played through commands where it can be.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, residentId, socialOf, bondOf, heartsOf, liveSeason } from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, STORY_PACK, BONDS_PACK, storyPackProblems, bondsProblems, readJournal, ownedInHand,
  incidentOn, incidentGate, quarrelOn, dailyGuide, tomorrowOf, type StoryView,
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
  const act = (type: string, payload: Record<string, unknown> = {}) => {
    let r = sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
    if (!r.ok && /E_SETTLEMENT_EXHAUSTED/.test(r.errors[0]?.code ?? "")) { sim.advanceBy(1); r = sim.dispatch({ type, actorId: me, source: "player", payload: payload as never }); }
    return r;
  };
  const ok = (r: ReturnType<typeof act>, what: string) => { assert.equal(r.ok, true, `${what}: ${r.errors?.[0]?.message}`); return r; };
  const go = (placeId: string) => { if (occupiedPlaceId(sim.worldView(), me) !== placeId) ok(act(SettlementCommands.arrive, { placeId }), `walk to ${placeId}`); };
  const meet = (key: string) => {
    for (let i = 0; i < 4 && occupiedPlaceId(sim.worldView(), residentId(key)) !== occupiedPlaceId(sim.worldView(), me); i += 1) go(occupiedPlaceId(sim.worldView(), residentId(key)));
    assert.equal(occupiedPlaceId(sim.worldView(), residentId(key)), occupiedPlaceId(sim.worldView(), me), `met ${key}`);
  };
  const view = () => sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  const bond = (key: string) => bondOf(socialOf(sim.worldView(), residentId(key)), me);
  const j = () => readJournal(sim.worldView(), me);
  const lines = (r: ReturnType<typeof act>) => {
    const all = sim.kernel.internals.eventLog.all();
    const tx = new Set(all.filter((e) => r.eventIds.includes(e.id)).map((e) => e.transactionId));
    return all.filter((e) => r.eventIds.includes(e.id) || (e.transactionId !== undefined && (e.transactionId === r.transactionId || tx.has(e.transactionId))))
      .map((e) => String(e.data?.line ?? "")).filter(Boolean);
  };
  /** Say each option in turn to someone (walking to them first). */
  const say = (key: string, ...options: string[]) => {
    let r!: ReturnType<typeof act>;
    for (const option of options) { meet(key); r = ok(act(StoryCommands.choose, { npc: key, option }), `${key}: ${option}`); }
    return r;
  };
  const friendly = () => { for (let i = 0; i < 4; i += 1) assert.equal(liveSeason(sim as never, me, "visit").ok, true); };
  return { sim, me, act, ok, go, meet, view, bond, j, lines, say, friendly };
}

test("the packs stay sound, and chapters 4-6 tell every step: how it begins and how it ends", () => {
  assert.deepEqual(storyPackProblems(), []);
  assert.deepEqual(bondsProblems(), []);
  for (const id of ["main-4-longhouse", "main-5-fog", "main-6-south"]) {
    const q = STORY_PACK.quests.find((x) => x.id === id)!;
    assert.ok(q.summary.length > 40, `${q.title} has a real summary`);
    for (const s of q.steps) { assert.ok(s.intro, `${q.title}/${s.id} intro`); assert.ok(s.doneLine, `${q.title}/${s.id} doneLine`); }
  }
});

test("a heart-to-heart: deeper only as the bond grows, each thing said once, and what you say reaches the other side", () => {
  const { act, ok, say, view, bond, j, friendly, meet, lines } = life();
  meet("cook");
  const opener = view().dialogues.find((d) => d.npc === "cook")!.options.find((o) => o.id === "deep-cook")!;
  assert.equal(opener.enabled, false, "strangers don't get the long talk");
  friendly();
  assert.ok(heartsOf(bond("cook")) >= 3 && heartsOf(bond("lan-mother")) >= 3, "a season among them makes friends");
  say("cook", "deep-cook", "fuel");
  assert.ok(j().flags.includes("said:cook.ck-1.fuel"));
  meet("cook");
  const d = view().dialogues.find((x) => x.npc === "cook")!;
  assert.ok(!d.options.some((o) => o.id === "fuel"), "said once, it is gone");
  assert.equal(act(StoryCommands.choose, { npc: "cook", option: "fuel" }).ok, false);
  ok(act(StoryCommands.choose, { npc: "cook", option: "more-ck-2" }), "go deeper");
  const before = bond("lan-mother").grudge;
  ok(act(StoryCommands.choose, { npc: "cook", option: "confess" }), "urge him to own up");
  assert.ok(j().flags.includes("cook-confessed"));
  assert.ok(bond("lan-mother").grudge <= before, "word travels to 岚母");
  meet("cook");
  const blame = view().dialogues.find((x) => x.npc === "cook")!.options.find((o) => o.id === "blame")!;
  assert.equal(blame.enabled, false, "having urged him to apologise, you can't now blame her");
  // 岚母's side of it: 阿灶 hears she softened.
  const fam = bond("cook").familiarity;
  say("lan-mother", "deep-lan-mother", "why", "more-lm-2", "soften");
  assert.ok(bond("cook").familiarity > fam);
  assert.ok(j().counters["heart-to-heart"]! >= 4);
  // Both sides moved: 陶婶 now has a way to bring them to one table.
  meet("elder-wife");
  const q = view().quests.find((x) => x.id === "side-hearth-fire")!;
  assert.equal(q.accept?.enabled, true, q.accept?.reason);
  const r = ok(act(StoryCommands.acceptQuest, { questId: "side-hearth-fire" }), "accept");
  assert.ok(lines(r).some((l) => l.includes("柴得是岚母家的")), "the first step's intro is told");
});

test("a rivalry settled by talking to both sides: the quest tells each step as it closes", () => {
  const { act, ok, say, view, j, friendly, meet, lines } = life();
  friendly();
  say("reed-worker", "deep-reed-worker", "bend", "more-rw-2", "idea");
  say("stonesmith", "deep-stonesmith", "bend", "more-sm-2", "bridge");
  assert.ok(j().flags.includes("reed-worker-willing") && j().flags.includes("stonesmith-willing"));
  meet("trader-elder");
  assert.equal(view().quests.find((q) => q.id === "side-river-bend-split")!.accept?.enabled, false, "the split ending is only for those who took a side");
  ok(act(StoryCommands.acceptQuest, { questId: "side-river-bend" }), "accept");
  meet("reed-worker");
  const r = ok(act(SettlementCommands.talk, { targetId: residentId("reed-worker") }), "talk to 阿苇");
  const said = lines(r);
  assert.ok(said.some((l) => l.includes("阿苇把镰刀往腰里一别")), "the step's closing line");
  assert.ok(said.some((l) => l.includes("去找阿砺")), "and the next step");
  meet("stonesmith");
  ok(act(SettlementCommands.talk, { targetId: residentId("stonesmith") }), "talk to 阿砺");
  assert.equal(j().quests["side-river-bend"]?.status, "done", "both are already friends: it closes");
  assert.ok(j().flags.includes("river-bend-settled"));
  say("reed-worker", "back");
  assert.ok(view().dialogues.find((x) => x.npc === "reed-worker")!.options.some((o) => o.id === "after-bend"), "阿苇 now talks of 阿砺 differently");
});

test("taking a side in a quarrel is remembered by the story", () => {
  const { sim, act, ok, go, view, j } = life();
  const day = Array.from({ length: 400 }, (_, n) => sim.tick + 1 + n).find((t) => { const q = quarrelOn(t, []); return q?.a === "reed-worker" && q.b === "stonesmith"; })!;
  assert.ok(day, "阿苇 and 阿砺 fall out some day");
  sim.advanceBy(day - sim.tick);
  go(view().people.quarrel!.placeId);
  ok(act(StoryCommands.settleQuarrel, { side: "a" }), "side with 阿苇");
  assert.ok(j().flags.includes("quarrel:reed-worker~stonesmith:a"));
  assert.ok(j().flags.includes("quarrel:reed-worker~stonesmith:sided"));
  const split = STORY_PACK.quests.find((q) => q.id === "side-river-bend-split")!;
  const whole = STORY_PACK.quests.find((q) => q.id === "side-river-bend")!;
  assert.ok(split.requires?.flags?.includes("quarrel:reed-worker~stonesmith:sided"));
  assert.ok(whole.requires?.notFlags?.includes("quarrel:reed-worker~stonesmith:sided"), "the whole settlement is closed to someone who took a side");
  assert.equal(view().quests.find((q) => q.id === "side-river-bend")!.accept!.enabled, false);
});

test("what friendship is for: favours by tier, and the people page says how to warm someone and what it unlocks", () => {
  const { sim, me, act, ok, meet, view, friendly } = life();
  const hunter0 = view().people.villagers.find((v) => v.npc === "hunter")!.warmth;
  assert.ok(hunter0.ways.some((w) => /送/.test(w)), "gifts they love");
  assert.ok(hunter0.ways.some((w) => /常在/.test(w)), "where to find them");
  assert.ok(hunter0.ways.some((w) => /老祝|阿蘩|阿苇|阿缫/.test(w)), "who their friends are");
  assert.ok(hunter0.unlocks.some((u) => u.kind === "帮忙" && u.tier === "friend" && !u.reached));
  assert.ok(hunter0.unlocks.some((u) => u.kind === "交情事" && u.tier === "bosom" && u.what === "（到了这一步才知道）"), "later scenes stay a surprise");
  assert.equal(hunter0.next?.reached, false);
  friendly();
  meet("hunter");
  const service = view().people.services.find((s) => s.id === "hunter-share")!.targets[0]!;
  assert.equal(service.enabled, true, service.reason);
  ok(act(StoryCommands.useService, { serviceId: "hunter-share" }), "ask 阿犴 for a share");
  assert.equal(ownedInHand(sim.worldView(), me, "resource:game").length, 1);
  assert.match(act(StoryCommands.useService, { serviceId: "hunter-share" }).errors[0]!.message, /过 \d+ 天再来/);
  const teach = view().people.services.find((s) => s.id === "hunter-teach")!.targets[0]!;
  assert.match(teach.reason, /知己/, "the snare is for close friends");
  const now = view().people.villagers.find((v) => v.npc === "hunter")!.warmth;
  assert.ok(now.unlocks.some((u) => u.kind === "帮忙" && u.tier === "friend" && u.reached));
});

test("the guide offers every way to keep a feast, and the day before says what to bring", () => {
  const { sim, me, go } = life();
  const fishRun = YEAR0 + 3 * 30 + 11;
  sim.advanceBy(fishRun - 1 - sim.tick);
  const eve = tomorrowOf(sim.worldView(), me, false).find((l) => l.includes("鱼汛祭"))!;
  assert.match(eve, /先放一条鱼回河（备好鱼）/);
  assert.match(eve, /拉鱼汛第一网/);
  sim.advanceBy(1);
  go("place:ford");
  const story = sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  const s = dailyGuide(sim.worldView(), me, story);
  const f = [s.focus, ...s.suggestions].find((x) => x?.kind === "festival")!;
  assert.ok(f, "the feast is in the guide");
  assert.equal(f.options?.length, 2, "both ways");
  const net = f.options!.find((o) => o.label.includes("第一网"))!;
  const release = f.options!.find((o) => o.label.includes("放一条鱼"))!;
  assert.deepEqual(net.action?.payload, { riteId: "net" });
  assert.equal(release.action, null);
  assert.match(release.reason, /鱼/);
  assert.match(f.why, /2 种过法/);
  assert.deepEqual(f.action?.payload, { riteId: "net" }, "the main button is the one you can do now");
});

test("the incident chains go on, branch, and can come back together", () => {
  const { sim, me, j } = life();
  const days = Array.from({ length: 1080 }, (_, n) => YEAR0 + n);
  const comes = (flags: string[], id: string, seen: Record<string, string> = {}) => {
    const g = incidentGate(sim.worldView(), me, { ...j(), flags, incidents: seen });
    return days.some((t) => incidentOn(t, g)?.id === id);
  };
  // 山臊: neighbour → warns; driven → grudge → (make peace) pact → the crab gift.
  assert.equal(comes([], "shan-sao-warns"), false);
  assert.equal(comes(["shan-sao-neighbour"], "shan-sao-warns"), true);
  assert.equal(comes(["shan-sao-driven"], "shan-sao-grudge"), true);
  const peace = STORY_PACK.incidents.list.find((i) => i.id === "shan-sao-grudge")!.choices.find((c) => c.id === "peace")!;
  assert.deepEqual(peace.setFlags, ["shan-sao-pact"], "the bad road can turn good");
  assert.equal(comes(["shan-sao-driven", "shan-sao-pact"], "shan-sao-gift"), true);
  // 狼: marked den → the pack moves; the grey wolf → guards the village.
  assert.equal(comes(["wolf-den-marked"], "wolf-pack-moves"), true);
  assert.equal(comes(["wolf-friend"], "wolf-howl"), true);
  // 水獭: share the hole → overfished → taboo; keep it → cubs.
  assert.equal(comes(["otter-fishing-hole"], "otter-hole-secret"), true);
  assert.equal(comes(["otter-hole-shared"], "otter-hole-overfished"), true);
  assert.equal(comes(["otter-hole-kept"], "otter-cubs"), true);
  assert.equal(comes(["otter-hole-shared"], "otter-cubs"), false);
  // Each chain ending is a hidden achievement, and the villagers speak of it.
  for (const id of ["shan-sao-warned", "wolf-guardian", "otter-family", "otter-taboo"]) assert.equal(STORY_PACK.achievements.find((a) => a.id === id)?.hidden, true);
  assert.ok(STORY_PACK.dialogues["hunter"]!.nodes.root!.options.some((o) => o.requires?.flags?.includes("wolf-friend")));
  assert.ok(STORY_PACK.dialogues["water-carrier"]!.nodes.root!.options.some((o) => o.requires?.flags?.includes("otter-hole-kept")));
  void BONDS_PACK;
});
