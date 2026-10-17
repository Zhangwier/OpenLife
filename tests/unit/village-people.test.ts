/**
 * 人物互动深挖：关系等级与行为数值、关系网涟漪、作息与偶遇、争执与调解、特殊人物（长老/巫医/石匠）。
 * 全部通过真实命令验证：数值写进村民真实的社交记忆，日志记下每一笔是怎么来的。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, residentId, socialOf, bondOf, heartsOf, liveSeason, dailyActivity, isWet, illnessOn,
  RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, BONDS_PACK, bondsProblems, readJournal, ownedInHand, quarrelOn, routinePlace,
  tierOfHearts, rippleOf, type StoryView,
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
    if (!r.ok && /E_SETTLEMENT_EXHAUSTED/.test(r.errors[0]?.code ?? "")) {
      sim.advanceBy(1);
      r = sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
    }
    return r;
  };
  const go = (placeId: string) => {
    if (occupiedPlaceId(sim.worldView(), me) !== placeId) assert.equal(act(SettlementCommands.arrive, { placeId }).ok, true, `walk to ${placeId}`);
  };
  /** Walk to someone; a walk can turn the hour and send them off on their routine, so follow. */
  const meet = (key: string) => {
    for (let i = 0; i < 4 && occupiedPlaceId(sim.worldView(), residentId(key)) !== occupiedPlaceId(sim.worldView(), me); i += 1) {
      go(occupiedPlaceId(sim.worldView(), residentId(key)));
    }
    assert.equal(occupiedPlaceId(sim.worldView(), residentId(key)), occupiedPlaceId(sim.worldView(), me), `met ${key}`);
  };
  const view = () => sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  const bond = (key: string) => bondOf(socialOf(sim.worldView(), residentId(key)), me);
  const ok = (r: ReturnType<typeof act>, what: string) => assert.equal(r.ok, true, `${what}: ${r.errors?.[0]?.message}`);
  /** Lines told by a command and by the reactions it set off (same transaction). */
  const lines = (r: ReturnType<typeof act>) => {
    const all = sim.kernel.internals.eventLog.all();
    const tx = new Set(all.filter((e) => r.eventIds.includes(e.id)).map((e) => e.transactionId));
    return all.filter((e) => r.eventIds.includes(e.id) || (e.transactionId !== undefined && (e.transactionId === r.transactionId || tx.has(e.transactionId))))
      .map((e) => String(e.data?.line ?? "")).filter(Boolean);
  };
  const log = () => readJournal(sim.worldView(), me).bonds.log;
  return { sim, me, act, go, meet, view, bond, ok, lines, log };
}

test("the people data is sound: tiers rise, the web names real villagers, special villagers exist", () => {
  assert.deepEqual(bondsProblems(), []);
  const keys = RIVER_TERRACE_PACK.residents.map((r) => r.key);
  assert.ok(keys.includes("healer") && keys.includes("stonesmith"), "巫医 and 石匠 are real residents");
  assert.ok(RIVER_TERRACE_PACK.people?.healer && RIVER_TERRACE_PACK.people?.stonesmith, "with tastes, birthdays and heart scenes");
  assert.deepEqual(BONDS_PACK.tiers.map((t) => t.name), ["陌生", "相识", "朋友", "知己", "挚友"]);
  assert.equal(tierOfHearts(0).id, "stranger");
  assert.equal(tierOfHearts(3).id, "friend");
  assert.equal(tierOfHearts(10).id, "bosom");
  for (const t of ["kin", "friend", "rival"]) assert.ok(BONDS_PACK.network.some((e) => e.type === t), `has ${t} ties`);
  assert.deepEqual(new Set(BONDS_PACK.services.map((s) => s.title)), new Set(["长老", "巫医", "石匠"]));
});

test("a gift is logged with its real numbers, and the warmth ripples to kin and friends", () => {
  const { sim, me, act, go, meet, ok, bond, log } = life();
  go("place:reedbed");
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }), "cut reed");
  meet("healer");
  const before = { healer: bond("healer"), brother: bond("trader-elder"), child: bond("water-child") };
  const reed = ownedInHand(sim.worldView(), me, "resource:reed")[0]!;
  ok(act(SettlementCommands.gift, { targetId: residentId("healer"), itemId: reed }), "gift 蓍婆 the reed she loves");
  const gave = log().find((e) => e.npc === "healer" && e.why === "送礼");
  assert.ok(gave && gave.familiarity > 0 && gave.trust > 0, JSON.stringify(log()));
  assert.ok(Math.abs(gave!.trust - (bond("healer").trust - before.healer.trust)) < 0.01, "the log carries the real change");
  assert.ok(bond("trader-elder").familiarity > before.brother.familiarity, "her brother hears of it (kin)");
  assert.ok(bond("water-child").familiarity > before.child.familiarity, "the child she dotes on hears of it (friend)");
  assert.ok(log().some((e) => e.npc === "trader-elder" && /好话/.test(e.why)));
});

test("a rival cools when you warm to the other side; words warm a bond once a day", () => {
  const { act, meet, ok, bond, log } = life();
  assert.ok(rippleOf("stonesmith", { familiarity: 1 }, []).some((r) => r.other === "reed-worker" && (r.change.grudge ?? 0) > 0));
  meet("stonesmith");
  const rival = bond("reed-worker").grudge;
  const smith = bond("stonesmith").familiarity;
  ok(act(StoryCommands.choose, { npc: "stonesmith", option: "watch" }), "watch him work");
  assert.ok(bond("stonesmith").familiarity > smith);
  assert.ok(bond("reed-worker").grudge > rival, "阿苇 notices you siding with 阿砺");
  assert.ok(log().some((e) => e.npc === "reed-worker" && /不大痛快/.test(e.why)));
  const once = bond("stonesmith").familiarity;
  ok(act(StoryCommands.choose, { npc: "stonesmith", option: "watch" }), "again");
  assert.equal(bond("stonesmith").familiarity, once, "clicking the same line again is not friendship");
});

test("working alongside someone at their workplace counts, once a day", () => {
  const { sim, me, act, go, ok, bond, log } = life();
  let worker = "";
  for (let day = 0; day < 6 && !worker; day += 1) {
    go("place:reedbed");
    worker = RIVER_TERRACE_PACK.residents.find((r) => r.workPlace === "place:reedbed" && occupiedPlaceId(sim.worldView(), residentId(r.key)) === "place:reedbed")?.key ?? "";
    if (!worker) sim.advanceBy(1);
  }
  assert.ok(worker, "someone works the reedbed");
  const before = bond(worker).familiarity;
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }), "cut reed beside them");
  assert.ok(bond(worker).familiarity > before);
  assert.ok(log().some((e) => e.npc === worker && e.why === "一起干活"));
  const after = bond(worker).familiarity;
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }), "keep working");
  assert.ok(bond(worker).familiarity - after < 0.2, "the second bundle the same day earns no second thanks");
  assert.equal(readJournal(sim.worldView(), me).bonds.alongside[worker], sim.tick);
});

test("tiers: crossing into 相识 with 蓍婆 plays her scene and unlocks what was locked", () => {
  const { sim, me, act, go, meet, ok, view, lines } = life();
  meet("healer");
  const locked = view().dialogues.find((d) => d.npc === "healer")!.options.find((o) => o.id === "herbs")!;
  assert.equal(locked.enabled, false);
  assert.match(locked.reason, /相识/);
  assert.equal(view().quests.find((q) => q.id === "side-healer-herbs")!.accept?.enabled, false);
  go("place:reedbed");
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }), "cut reed");
  meet("healer");
  const gift = act(SettlementCommands.gift, { targetId: residentId("healer"), itemId: ownedInHand(sim.worldView(), me, "resource:reed")[0]! });
  ok(gift, "gift");
  let told = lines(gift).join("");
  for (let i = 0; i < 4 && !/相识/.test(told); i += 1) {
    meet("healer");
    const talk = act(SettlementCommands.talk, { targetId: residentId("healer") });
    ok(talk, "talk");
    told += lines(talk).join("");
    if (!/相识/.test(told)) sim.advanceBy(1);
  }
  assert.match(told, /相识/, told);
  assert.match(told, /干艾/, "her scene for the new tier, with its gift");
  assert.ok(ownedInHand(sim.worldView(), me, "resource:fiber").length >= 1);
  const v = view();
  assert.ok(["相识", "朋友"].includes(v.people.villagers.find((p) => p.npc === "healer")!.tierName));
  assert.equal(v.dialogues.find((d) => d.npc === "healer")!.options.find((o) => o.id === "herbs")!.enabled, true);
  ok(act(StoryCommands.acceptQuest, { questId: "side-healer-herbs" }), "her side story opens");
});

test("routines: villagers go where their hour and the weather take them, and you meet them there", () => {
  const { sim, me, act, go, ok, view, log } = life();
  // Rainy days send people under a roof.
  const wet = Array.from({ length: 120 }, (_, n) => YEAR0 + n).find((t) => isWet(t))!;
  assert.equal(routinePlace("elder-wife", "午", wet), "place:yard");
  const dry = Array.from({ length: 120 }, (_, n) => YEAR0 + n).find((t) => !isWet(t) && t > sim.tick && !illnessOn(t))!;
  sim.advanceBy(dry - sim.tick);
  // Spend the morning: the hour turns to 午.
  go("place:reedbed");
  while (dailyActivity(sim.worldView(), me).used < 3) ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }), "morning work");
  assert.equal(sim.tick, dry, "still the same day");
  const arrive = act(SettlementCommands.arrive, { placeId: "place:hearth-yard" });
  ok(arrive, "walk to the hearth");
  assert.equal(view().people.slot, "午");
  assert.equal(occupiedPlaceId(sim.worldView(), residentId("elder-wife")), "place:hearth-yard", "陶婶 picks greens at the hearth at noon");
  assert.ok(log().some((e) => e.npc === "elder-wife" && e.why === "偶遇闲聊"));
  assert.ok((readJournal(sim.worldView(), me).counters.encounter ?? 0) >= 1);
  const v = view().people.villagers.find((p) => p.npc === "elder-wife")!;
  assert.equal(v.routine?.now, "place:hearth-yard");
});

test("quarrels: take a side and pay for it, or settle it for good once both trust you", () => {
  const { sim, me, act, go, ok, bond, view } = life();
  const day = Array.from({ length: 200 }, (_, n) => YEAR0 + 1 + n).find((t) => quarrelOn(t, []))!;
  sim.advanceBy(day - sim.tick);
  const q = view().people.quarrel!;
  assert.ok(q, "a rivalry flares up today");
  assert.equal(act(StoryCommands.settleQuarrel, { side: "a" }).ok, false, "not where it happens");
  go(q.placeId);
  const mediate = view().people.quarrel!.sides.find((s) => s.side === "mediate")!;
  assert.equal(mediate.enabled, false);
  assert.match(mediate.reason, /朋友/);
  const a0 = bond(q.a).trust, b0 = bond(q.b).grudge;
  ok(act(StoryCommands.settleQuarrel, { side: "a" }), "side with A");
  assert.ok(bond(q.a).trust > a0);
  assert.ok(bond(q.b).grudge > b0, "the other side remembers");
  assert.equal(act(StoryCommands.settleQuarrel, { side: "b" }).ok, false, "once");
  void me;
});

test("special villagers: the healer reads tomorrow, the elder clears a grudge, the stonesmith needs his rope", () => {
  const { sim, me, act, go, meet, ok, bond, view, lines } = life();
  // A season visiting everyone makes the village friendly enough to ask favours.
  for (let i = 0; i < 4; i += 1) assert.equal(liveSeason(sim as never, me, "visit").ok, true);
  assert.ok(heartsOf(bond("trader-elder")) >= 3, `elder hearts ${heartsOf(bond("trader-elder"))}`);

  // 巫医 问卜: costs a bundle of reed, tells tomorrow's sky.
  go("place:reedbed");
  ok(act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }), "reed for the offering");
  meet("healer");
  const divine = act(StoryCommands.useService, { serviceId: "divine" });
  ok(divine, "divine");
  assert.match(lines(divine).join(""), /明天[晴阴雨雪]/);
  assert.equal(act(StoryCommands.useService, { serviceId: "divine" }).ok, false, "she will not read every day");
  assert.ok(readJournal(sim.worldView(), me).flags.includes("served:healer"));

  // 石匠: no rope, no knife.
  meet("stonesmith");
  const knife = view().people.services.find((s) => s.id === "commission-knife")!.targets[0]!;
  assert.equal(knife.enabled, false);
  assert.match(knife.reason, /草绳/);

  // 长老 化解芥蒂: take 阿苇's side in nothing — just make 阿砺 sore first, then ask 埴公.
  meet("stonesmith");
  const sore = bondOf(socialOf(sim.worldView(), residentId("reed-worker")), me).grudge;
  void sore;
  const target = view().people.services.find((s) => s.id === "counsel")!.targets.find((t) => t.npc)?.npc;
  if (target) {
    meet("trader-elder");
    const g0 = bond(target).grudge;
    ok(act(StoryCommands.useService, { serviceId: "counsel", targetNpc: target }), "counsel");
    assert.ok(bond(target).grudge < g0, "the grudge eases");
  } else {
    meet("trader-elder");
    assert.equal(act(StoryCommands.useService, { serviceId: "counsel", targetNpc: "reed-worker" }).ok, false, "no grudge, nothing to clear");
  }
});

test("mediating a rivalry when both trust you ends it for good; the elder clears the grudge a side-taking left", () => {
  const { sim, me, act, go, meet, ok, bond, view } = life();
  for (let i = 0; i < 4; i += 1) assert.equal(liveSeason(sim as never, me, "visit").ok, true);
  // First flare-up: take a side, leaving one of them sore.
  const day1 = Array.from({ length: 300 }, (_, n) => sim.tick + 1 + n).find((t) => quarrelOn(t, []))!;
  sim.advanceBy(day1 - sim.tick);
  const first = view().people.quarrel!;
  go(first.placeId);
  ok(act(StoryCommands.settleQuarrel, { side: "a" }), "side with A");
  const sore = first.b;
  assert.ok(bond(sore).grudge > 0);

  // 长老 can be asked to talk to them.
  meet("trader-elder");
  const counsel = view().people.services.find((s) => s.id === "counsel")!.targets.find((t) => t.npc === sore)!;
  assert.equal(counsel.enabled, true, counsel.reason);
  const g0 = bond(sore).grudge;
  ok(act(StoryCommands.useService, { serviceId: "counsel", targetNpc: sore }), "ask 埴公");
  assert.ok(bond(sore).grudge < g0);
  assert.equal(act(StoryCommands.useService, { serviceId: "counsel", targetNpc: sore }).ok, false, "a week before asking again");

  // Next flare-up of a pair you are friends with on both sides: settle it.
  const reconciled = readJournal(sim.worldView(), me).bonds.reconciled;
  const day2 = Array.from({ length: 300 }, (_, n) => sim.tick + 1 + n).find((t) => {
    const q = quarrelOn(t, reconciled);
    return q && [q.a, q.b].every((k) => heartsOf(bond(k)) >= 3);
  });
  assert.ok(day2, "a quarrel between two friends comes up");
  sim.advanceBy(day2! - sim.tick);
  const q = view().people.quarrel!;
  go(q.placeId);
  assert.equal(view().people.quarrel!.sides.find((s) => s.side === "mediate")!.enabled, true);
  ok(act(StoryCommands.settleQuarrel, { side: "mediate" }), "mediate");
  const after = readJournal(sim.worldView(), me);
  assert.ok(after.bonds.reconciled.includes(q.pair));
  assert.ok(view().people.villagers.find((p) => p.npc === q.a)!.relations.some((r) => r.npc === q.b && r.type === "friend" && /和解/.test(r.label)));
  for (let t = sim.tick + 1; t < sim.tick + 200; t += 1) assert.notEqual(quarrelOn(t, after.bonds.reconciled)?.a === q.a && quarrelOn(t, after.bonds.reconciled)?.b === q.b, true);
  assert.ok(view().achievements.find((a) => a.id === "peacemaker")?.unlocked);
});

test("routines never crowd a place: there is always room for the player to walk in", () => {
  const { sim, me, act, go } = life();
  for (let day = 0; day < 3; day += 1) {
    for (const placeId of ["place:hearth-yard", "place:yard", "place:river", "place:ford", "place:field"]) {
      const r = act(SettlementCommands.arrive, { placeId });
      if (occupiedPlaceId(sim.worldView(), me) !== placeId) {
        assert.notEqual(r.errors?.[0]?.code, "E_SETTLEMENT_NO_ROOM", `${placeId} was filled by routines`);
      }
    }
    go("place:yard");
    sim.advanceBy(1);
  }
});
