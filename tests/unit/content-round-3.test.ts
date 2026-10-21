/**
 * Content round 3 (2026-10-18 午): furniture in every room of the four big
 * buildings and what using it does; recipe chains up and down from the first
 * round's things, plus three new big things; North Woods event points with
 * creatures, behaviour and drops; the five newcomers' deeper stories.
 * Everything that can be played is played through real commands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, RIVER_TERRACE_FIXTURES,
  validateFixtureBook, homestead, dailyActivity, residentId, socialOf, bondOf, isWet, illnessOn,
} from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryProjections, STORY_PACK, BONDS_PACK, storyPackProblems, bondsProblems, readJournal,
  routinePlace, routineSpace, type StoryView,
} from "@openlife/module-village-stories";
import { loadMapPack, MapPackIssueCode } from "@openlife/module-map-pack";

const NEWCOMERS = ["weaver", "hunter", "shrine-keeper", "market-keeper", "longhouse-matron"];
const BUILDINGS = ["place:longhouse", "place:weaving-shed", "place:shrine", "place:market"];
const YEAR0 = 18 * 360;

function life(stories = false) {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule,
    ...(stories ? [villageStoriesModule] : [])] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(YEAR0);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const must = (type: string, payload: Record<string, unknown> = {}) => {
    const r = act(type, payload); assert.equal(r.ok, true, `${type} ${JSON.stringify(payload)}: ${r.errors?.[0]?.message}`); return r;
  };
  const go = (placeId: string, spaceId?: string) => {
    if (occupiedPlaceId(sim.worldView(), me) !== placeId) must(SettlementCommands.arrive, { placeId });
    if (spaceId && occupiedSpaceId(sim.worldView(), me) !== spaceId) must("world-space.move_within", { spaceId });
  };
  const held = (proto: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: me })
    .map((r) => r.from).filter((o) => prototypeOf(sim.worldView(), o).prototypeId === proto);
  const furniture = (space: string, proto: string) => sim.worldView().listRelations({ type: ObjectRelations.containedIn, to: space })
    .map((r) => r.from).find((o) => prototypeOf(sim.worldView(), o).prototypeId === proto)!;
  const actions = () => homestead(sim.worldView(), me).actions as Array<{ id: string; label: string; enabled: boolean; reason: string; payload: Record<string, unknown> }>;
  return { sim, me, act, must, go, held, furniture, actions };
}

test("every room of the four big buildings has furniture, and every piece of furniture there can be used", () => {
  assert.deepEqual(validateFixtureBook(RIVER_TERRACE_FIXTURES, RIVER_TERRACE_PACK), []);
  assert.ok(RIVER_TERRACE_FIXTURES.uses.length >= 20);
  const used = new Set(RIVER_TERRACE_FIXTURES.uses.map((u) => u.prototypeId));
  for (const placeId of BUILDINGS) {
    const place = RIVER_TERRACE_PACK.places.find((p) => p.id === placeId)!;
    for (const space of place.spaces) {
      const things = RIVER_TERRACE_PACK.instances.filter((i) => i.inId === space.id).map((i) => i.prototypeId);
      assert.ok(things.length > 0, `${place.name}·${space.name} is furnished`);
      assert.ok(things.some((p) => used.has(p)), `${place.name}·${space.name} has something you can use`);
    }
  }
  const broken = { ...RIVER_TERRACE_FIXTURES, uses: [{ ...RIVER_TERRACE_FIXTURES.uses[0]!, prototypeId: "prototype:bowl", with: "nobody" }] };
  const problems = validateFixtureBook(broken, RIVER_TERRACE_PACK);
  assert.ok(problems.some((p) => p.includes("carried, not furniture")));
  assert.ok(problems.some((p) => p.includes("unknown villager")));
});

test("furniture works only in its own room, costs time, warms whoever is there, and the village remembers", () => {
  const { sim, me, act, must, go, furniture, actions } = life(true);
  go("place:longhouse", "space:longhouse-hall");
  const pit = furniture("space:longhouse-hall", "prototype:fire-pit");
  const sit = actions().find((a) => a.payload.useId === "fixture:longhouse-sit");
  assert.ok(sit && sit.enabled, "the fire pit offers a seat");
  go("place:longhouse", "space:longhouse-west");
  assert.equal(act(SettlementCommands.useFixture, { objectId: pit, useId: "fixture:longhouse-sit" }).ok, false, "not from another room");
  go("place:longhouse", "space:longhouse-hall");
  const matron = residentId("longhouse-matron");
  const present = occupiedPlaceId(sim.worldView(), matron) === "place:longhouse";
  const before = bondOf(socialOf(sim.worldView(), matron), me).familiarity;
  const used = dailyActivity(sim.worldView(), me).used;
  must(SettlementCommands.useFixture, { objectId: pit, useId: "fixture:longhouse-sit" });
  assert.equal(dailyActivity(sim.worldView(), me).used, used + 1, "an hour by the fire");
  if (present) assert.ok(bondOf(socialOf(sim.worldView(), matron), me).familiarity > before, "阿蘩 was there and warmed to you");
  assert.equal(act(SettlementCommands.useFixture, { objectId: pit, useId: "fixture:longhouse-sit" }).ok, false, "once a day");
  assert.equal(readJournal(sim.worldView(), me).counters["fixture:fixture:longhouse-sit"], 1, "the story journal counts it");
  const roast = actions().find((a) => a.payload.useId === "fixture:longhouse-roast")!;
  assert.equal(roast.enabled, false);
  assert.match(roast.reason, /栗子/);
});

test("a use that gives: reed into the retting pit becomes fiber, fiber on the bench becomes thread", () => {
  const { sim, must, go, held, furniture } = life();
  const spring = YEAR0 + 2 * 30 + 5; // reed grows in spring
  sim.advanceBy(spring - sim.tick);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 });
  sim.advanceBy(1);
  go("place:weaving-shed", "space:retting-pool");
  must(SettlementCommands.useFixture, { objectId: furniture("space:retting-pool", "prototype:retting-pit"), useId: "fixture:ret-reed" });
  assert.equal(held("prototype:reed-bundle").length, 0);
  assert.equal(held("prototype:fiber-bundle").length, 1);
  go("place:weaving-shed", "space:spinning-porch");
  must(SettlementCommands.useFixture, { objectId: furniture("space:spinning-porch", "prototype:spinning-bench"), useId: "fixture:spin" });
  assert.equal(held("prototype:thread").length, 1, "your own thread");
});

test("routines keep the newcomers to their rooms, and the people page still names places", () => {
  assert.deepEqual(bondsProblems(), []);
  const wet = Array.from({ length: 200 }, (_, n) => YEAR0 + n).find((t) => isWet(t))!;
  const dry = Array.from({ length: 200 }, (_, n) => YEAR0 + n).find((t) => !isWet(t))!;
  assert.equal(routineSpace("weaver", "午", dry), "space:loom-room");
  assert.equal(routinePlace("weaver", "午", dry), "place:weaving-shed");
  assert.equal(routineSpace("weaver", "午", wet), "space:spinning-porch");
  assert.equal(routineSpace("shrine-keeper", "暮", dry), "space:vigil-hut");
  assert.equal(routineSpace("market-keeper", "晨", dry), "space:goods-shed");
  assert.equal(routineSpace("longhouse-matron", "午", dry), "space:longhouse-loft");
  assert.equal(routineSpace("elder-wife", "午", dry), "space:hearth", "a routine that names a place still means its entrance");
  // Live: spend the morning, and at noon 阿缫 is at her loom.
  const { sim, me, must, go } = life(true);
  const day = Array.from({ length: 200 }, (_, n) => YEAR0 + n).find((t) => !isWet(t) && t > sim.tick && illnessOn(t)?.key !== "weaver")!;
  sim.advanceBy(day - sim.tick);
  go("place:river");
  while (dailyActivity(sim.worldView(), me).used < 3) must(SettlementCommands.draw, { placeId: "place:river", resourceId: "resource:water" });
  go("place:weaving-shed");
  assert.equal(occupiedSpaceId(sim.worldView(), residentId("weaver")), "space:loom-room", "阿缫 works the loom at noon");
  const v = (sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView).people.villagers.find((p) => p.npc === "weaver")!;
  assert.equal(v.routine?.午, "place:weaving-shed", "the people page shows the place, not the room id");
});

test("recipe chains: chestnuts through the mortar into flour, flour into cakes, and a cake feeds you", () => {
  const { sim, me, act, must, go, held } = life();
  const autumn = YEAR0 + 8 * 30 + 2;
  sim.advanceBy(autumn - sim.tick);
  go("place:chestnut-wood", "space:old-chestnut");
  must(SettlementCommands.draw, { placeId: "place:chestnut-wood", resourceId: "resource:chestnut", amount: 2 });
  sim.advanceBy(1);
  go("place:longhouse", "space:longhouse-hall");
  must(SettlementCommands.craft, { recipeId: "recipe:chestnut-flour" });
  assert.equal(held("prototype:chestnut-flour").length, 2, "the mortar standing in the hall is the tool");
  sim.advanceBy(1);
  go("place:reedbed");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel", amount: 1 });
  sim.advanceBy(1);
  go("place:hearth-yard", "space:hearth");
  must(SettlementCommands.craft, { recipeId: "recipe:chestnut-cake" });
  assert.equal(held("prototype:chestnut-cake").length, 2);
  sim.advanceBy(8);
  const ate = act(SettlementCommands.eat, { objectId: held("prototype:chestnut-cake")[0] });
  assert.equal(ate.ok, true, ate.errors?.[0]?.message);
  void me;
});

test("the first round's big things now feed recipes, and three new big things exist", () => {
  const book = (id: string) => RIVER_TERRACE_RECIPES.recipes.find((r) => r.id === id)!;
  const pack = (id: string) => RIVER_TERRACE_PACK.recipes!.find((r) => r.id === id)!;
  assert.deepEqual(book("recipe:broad-cloth").tools, ["prototype:loom"]);
  assert.deepEqual(book("recipe:chestnut-flour").tools, ["prototype:mortar"]);
  assert.deepEqual(book("recipe:smoke-fish").tools, ["prototype:smoking-rack"]);
  assert.equal(pack("recipe:dugout-fishing").tool, "prototype:dugout");
  assert.equal(pack("recipe:raft-fishing").tool, "prototype:raft");
  assert.equal(pack("recipe:fell-oak").tool, "prototype:stone-axe");
  assert.ok(RIVER_TERRACE_FIXTURES.uses.some((u) => u.prototypeId === "prototype:totem-pole"));
  assert.ok(RIVER_TERRACE_FIXTURES.uses.some((u) => u.prototypeId === "prototype:stall-awning"));
  assert.ok(RIVER_TERRACE_FIXTURES.uses.some((u) => u.prototypeId === "prototype:big-urn"));
  for (const id of ["prototype:raft", "prototype:shrine-drum", "prototype:fish-rack"]) {
    const p = RIVER_TERRACE_PACK.prototypes.find((x) => x.id === id)!;
    assert.ok(p.mass >= 20 && !p.capabilities.includes("carryable"), `${p.name} is big and stands where it is made`);
    assert.ok(RIVER_TERRACE_RECIPES.recipes.some((r) => r.outputs[0]!.prototypeId === id), `${p.name} can be made`);
    const fed = RIVER_TERRACE_RECIPES.recipes.some((r) => r.tools?.includes(id)) || RIVER_TERRACE_PACK.recipes!.some((r) => r.tool === id)
      || RIVER_TERRACE_FIXTURES.uses.some((u) => u.prototypeId === id);
    assert.ok(fed, `${p.name} is good for something once made`);
  }
});

test("the old dugout at the ford takes you fishing in the deep water", () => {
  const { sim, must, go, held } = life();
  sim.advanceBy(YEAR0 + 3 * 30 - sim.tick);
  go("place:ford", "space:ford-landing");
  must(SettlementCommands.craft, { recipeId: "recipe:dugout-fishing" });
  assert.equal(held("prototype:fish").length, 2);
});

test("beasts and the shan-sao behave, and leave real things behind", () => {
  assert.deepEqual(storyPackProblems(), []);
  const beasts = ["wolf-stalker", "wolves-kill", "shan-sao-fire", "shan-sao-mimic", "otter-offering", "otter-thief", "boar-wallow", "antler-shed", "turtle-sun", "dhole-raid"];
  const drops = new Set<string>();
  for (const id of beasts) {
    const inc = STORY_PACK.incidents.list.find((i) => i.id === id)!;
    assert.ok(inc && inc.choices.length >= 2, id);
    for (const c of inc.choices) for (const g of c.items ?? []) drops.add(g.prototype);
  }
  for (const p of ["prototype:wolf-pelt", "prototype:wolf-fang", "prototype:straw-sandal", "prototype:otter-pelt", "prototype:boar-tusk", "prototype:antler", "prototype:turtle-scute"]) {
    assert.ok(drops.has(p), `${p} drops from a beast`);
    const res = RIVER_TERRACE_PACK.prototypes.find((x) => x.id === p)!.resourceId;
    assert.ok(RIVER_TERRACE_RECIPES.recipes.some((r) => r.inputs.some((i) => i.prototypeId === p || RIVER_TERRACE_PACK.prototypes.find((x) => x.id === i.prototypeId)?.resourceId === res))
      || RIVER_TERRACE_FIXTURES.uses.some((u) => u.needs === res), `${p} goes into a recipe or onto a fixture`);
  }
});

test("North Woods event points carry creature, behaviour, drops, time and danger, and bad details are caught", () => {
  const pack = loadMapPack(resolve(import.meta.dirname, "../../packs/xia_north_woods_v0_1"));
  assert.equal(pack.ok, true, pack.validation.issues.map((i) => i.message).join("; "));
  const points = pack.pack!.eventPoints!;
  assert.equal(points.length, 24);
  const wolf = points.find((p) => p.id === "EP_WOLF_DEN")!;
  assert.equal(wolf.creature, "狼");
  assert.equal(wolf.time, "night");
  assert.equal(wolf.danger, 3);
  assert.ok(wolf.drops!.includes("狼皮"));
  for (const creature of ["狼", "山臊", "水獭", "野猪", "豺", "老鳖"]) assert.ok(points.some((p) => p.creature?.startsWith(creature) && p.behavior), creature);
  const dir = mkdtempSync(join(tmpdir(), "north-woods-"));
  try {
    cpSync(resolve(import.meta.dirname, "../../packs/xia_north_woods_v0_1"), dir, { recursive: true });
    writeFileSync(join(dir, "map/event_points.yaml"), ["event_points:", "  - id: EP_BAD", "    name: 坏细节", "    location_id: N0101", "    kind: encounter",
      "    text: 时间与危险都不对。", "    time: noon", "    danger: 7", "    behavior: 没有主角的习性", ""].join("\n"));
    const bad = loadMapPack(dir);
    assert.equal(bad.ok, false);
    const fields = bad.validation.issues.filter((i) => i.code === MapPackIssueCode.InvalidField).map((i) => (i as { field?: string }).field);
    for (const f of ["time", "danger", "creature"]) assert.ok(fields.includes(f), f);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the five newcomers: deeper dialogue, five heart scenes, every tier, and quests that tie them together", () => {
  for (const key of NEWCOMERS) {
    assert.ok(Object.keys(STORY_PACK.dialogues[key]!.nodes).length >= 6, `${key} has a deeper tree`);
    assert.ok(RIVER_TERRACE_PACK.people![key]!.heartEvents!.length >= 5, `${key} has five heart scenes`);
    const tiers = new Set(BONDS_PACK.tierEvents.filter((e) => e.npc === key).map((e) => e.tier));
    for (const t of ["acquaint", "friend", "close", "bosom"]) assert.ok(tiers.has(t), `${key} has a ${t} scene`);
    assert.ok(STORY_PACK.quests.some((q) => q.giver === key), `${key} gives a quest`);
  }
  // Linked: each newcomer quest pulls in someone else.
  const linked = (id: string) => {
    const q = STORY_PACK.quests.find((x) => x.id === id)!;
    return new Set([q.giver, ...Object.keys(q.reward?.bond ?? {})]).size >= 2;
  };
  for (const id of ["side-weaver-loom", "side-hunter-fog", "side-matron-winter", "side-market-raft"]) assert.ok(linked(id), id);
  // The fog quest's flags are set by the shrine keeper's and the hunter's dialogue, gated on the quest step.
  const opts = (key: string) => Object.values(STORY_PACK.dialogues[key]!.nodes).flatMap((n) => n.options);
  assert.ok(opts("shrine-keeper").some((o) => o.effects?.setFlags?.includes("keeper-blessed-fog")));
  assert.ok(opts("hunter").some((o) => o.effects?.setFlags?.includes("fog-walked")));
  assert.ok(STORY_PACK.dialogues["hunter"]!.nodes.root!.options.some((o) => o.requires?.quest?.["side-hunter-fog"] === "walk"));
});
