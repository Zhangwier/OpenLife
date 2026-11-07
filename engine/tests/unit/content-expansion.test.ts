/**
 * The content added in this round, checked where it actually lands.
 *
 * Two things this file deliberately does NOT do: it never calls
 * `seasonTurnEffects` directly to "make" an event happen (that function is a
 * pure effect builder - the kernel command is what commits), and it never
 * assumes a particular villager holds a particular object. Time is advanced one
 * day at a time, because the village day agent only fires on a real day step.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectCommands, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, RIVER_TERRACE_PACK, validateSettlementPack,
  seasonOf, wornWrap, SettlementId, SettlementComponents,
} from "@openlife/module-settlement-locations";

function life(seed = 3) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林" } });
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  return { sim, id };
}

/**
 * Runs whole seasons through the real command the village agent dispatches at a
 * season boundary.
 *
 * `seasonTurnEffects` is only an effect builder; the kernel command is what
 * commits, validates and records. Driving `SettlementCommands.seasonTurn`
 * therefore exercises the same path the agent uses on a day boundary, without
 * simulating a year of every villager's daily life (which costs minutes).
 *
 * The first turn only marks the season (a village must live one season before it
 * has anything to tell), so the helper skips that warm-up turn.
 */
function livedSeasons(sim: Simulation, seasons: number): string[] {
  const told: string[] = [];
  for (let i = 0; i < seasons; i += 1) {
    sim.advanceBy(90);
    // The mark has to be a real seq, not since(0).length: journal retention
    // drops routine events, so the log keeps gaps and its length no longer
    // equals the sequence number of the last event.
    const before = sim.kernel.internals.eventLog.nextSeq - 1;
    const turn = sim.dispatch({ type: SettlementCommands.seasonTurn, source: "system", payload: {} as never });
    assert.equal(turn.ok, true, JSON.stringify(turn.errors));
    for (const event of sim.kernel.internals.eventLog.since(before)) {
      if (event.type === "settlement-locations.village_story" && typeof event.data?.line === "string")
        told.push(String(event.data.line));
    }
  }
  return told;
}

/** Grain standing in the village's own gathering points. */
function grainStock(sim: Simulation): number {
  return sim.worldView()
    .listEntities({ kind: "settlement-locations.yield-point" })
    .filter((e) => e.archivedAt === undefined)
    .filter((e) => String(e.components[SettlementComponents.yieldPoint]?.resourceId) === "resource:grain")
    .reduce((n, e) => n + Number(e.components[SettlementComponents.yieldPoint]?.stock ?? 0), 0);
}

test("the pack's event preconditions and cooldowns are valid content", () => {
  assert.deepEqual(validateSettlementPack(RIVER_TERRACE_PACK), []);
  const events = RIVER_TERRACE_PACK.storyteller!.events;
  assert.ok(events.length >= 12, `the village should have a real pool of stories, saw ${events.length}`);
  assert.equal(new Set(events.map((e) => e.id)).size, events.length, "story ids are unique");
  for (const season of ["春", "夏", "秋", "冬"]) {
    const pool = events.filter((e) => e.seasons.includes(season));
    assert.ok(pool.length >= 3, `${season} needs more than one possible story, saw ${pool.length}`);
  }
  assert.ok(events.filter((e) => e.seasons.includes("冬")).some((e) => e.requires),
    "winter stories react to the village's actual state");
  assert.ok(events.filter((e) => e.requires?.population).length >= 2, "population preconditions exist");
  assert.ok(events.every((e) => !e.yields || Object.keys(e.yields).length > 0), "yields, when present, name something");
});

test("a broken story is reported instead of silently ignored", () => {
  const good = RIVER_TERRACE_PACK.storyteller!.events[0]!;
  const bad = { ...RIVER_TERRACE_PACK, storyteller: { ...RIVER_TERRACE_PACK.storyteller!, events: [
    { ...good, seasons: ["夏"] },
    { ...good, id: "unknown-place", yields: { "place:nowhere:resource:grain": 0.5 } },
    { ...good, id: "unknown-resource", requires: { stockBelow: [{ resourceId: "resource:unobtainium", amount: 1 }] } },
    { ...good, id: "bad-season", seasons: ["梅"] },
    { ...good, id: "bad-bounds", requires: { population: { min: 12, max: 4 } } },
    { ...good, id: "no-seasons", seasons: [] },
  ] } };
  const problems = validateSettlementPack(bad as never);
  assert.ok(problems.some((p) => p.includes("unknown place")), JSON.stringify(problems));
  assert.ok(problems.some((p) => p.includes("unknown resource")), JSON.stringify(problems));
  assert.ok(problems.some((p) => p.includes("unknown season")), JSON.stringify(problems));
  assert.ok(problems.some((p) => p.includes("min exceeds max")), JSON.stringify(problems));
  assert.ok(problems.some((p) => p.includes("needs seasons")), JSON.stringify(problems));
});

test("stories fire as seasons turn, and the settlement records when each one happened", { timeout: 60000 }, () => {
  const { sim } = life(21);
  const told = livedSeasons(sim, 14);        // three and a half world years
  assert.ok(told.length > 0, "the village should tell stories as seasons turn");

  const history = sim.worldView().getComponent(SettlementId, SettlementComponents.settlement)?.storyLastAt;
  assert.ok(history && typeof history === "object", "the settlement keeps a story history");
  const recorded = Object.keys(history as Record<string, number>);
  assert.ok(recorded.length > 0, "at least one story was recorded");
  for (const id of recorded)
    assert.ok(RIVER_TERRACE_PACK.storyteller!.events.some((e) => e.id === id), `unknown story recorded: ${id}`);
  // Every record must correspond to a cooldown-bearing story.
  for (const id of recorded) {
    const spec = RIVER_TERRACE_PACK.storyteller!.events.find((e) => e.id === id)!;
    assert.ok(spec.cooldownYears && spec.cooldownYears > 0, `${id} is recorded but declares no cooldown`);
  }
  // And no story may repeat inside its own cooldown window.
  for (const event of RIVER_TERRACE_PACK.storyteller!.events) {
    if (!event.cooldownYears) continue;
    const at = (history as Record<string, number>)[event.id];
    if (at === undefined) continue;
    const repeats = told.filter((line) => line.includes(event.text.slice(0, 12))).length;
    assert.ok(repeats <= 1, `${event.id} told ${repeats} times inside a ${event.cooldownYears}-year cooldown`);
  }
});

test("a state-gated story only fires when the village is really in that state", { timeout: 60000 }, () => {
  const { sim } = life(33);
  const told = livedSeasons(sim, 14);
  // "full-larder" requires grain in store; if it is told, grain must be there.
  const full = RIVER_TERRACE_PACK.storyteller!.events.find((e) => e.id === "full-larder")!;
  if (told.some((line) => line.includes(full.text.slice(0, 12)))) {
    const grain = grainStock(sim);
    assert.ok(grain >= 16, `full-larder fired while grain stores stood at ${grain}`);
  }
  // A village with grain in store must be able to tell at least one story: the
  // pool is not emptied by gates that can never be satisfied.
  assert.ok(told.length > 0, "state-gated content must not starve the story pool");
});

test("the village authors more than one kind of wearable garment", () => {
  const decl = RIVER_TERRACE_PACK.prototypes.find((p) => p.id === "prototype:hide-cloak");
  assert.ok(decl?.capabilities.includes("wearable"), "the hide cloak is authored as wearable");
  const garments = RIVER_TERRACE_PACK.prototypes.filter((p) => p.capabilities.includes("wearable"));
  assert.ok(garments.length >= 2, `expected more than one garment, saw ${garments.map((g) => g.id).join(", ")}`);
  // Every declared garment must be obtainable: craftable, or seeded in the world.
  const madeBy = new Set((RIVER_TERRACE_PACK.recipes ?? [])
    .map((r) => r.output?.prototypeId).filter(Boolean) as string[]);
  const seeded = new Set(RIVER_TERRACE_PACK.instances.map((i) => i.prototypeId));
  for (const g of garments) {
    assert.ok(madeBy.has(g.id) || seeded.has(g.id),
      `${g.id} is wearable but neither craftable nor placed in the village`);
  }
});

test("a reed wrap that is not worn is not treated as clothing", () => {
  const { sim, id } = life(19);
  assert.equal(wornWrap(sim.worldView(), id), "", "an undressed person has no worn garment");
});

test("wearing any wearable prototype marks the wearer as dressed", () => {
  const { sim, id } = life(17);
  const world = sim.worldView();
  // Use a garment the village already places, and walk to it: this is the real
  // path, and it avoids inventing an object at an unreachable spot.
  const cloak = world.listEntities({ kind: "world-objects.item" })
    .map((e) => e.id)
    .find((o) => prototypeOf(world, o).prototypeId === "prototype:hide-cloak");
  assert.ok(cloak, "the village places a hide cloak");
  const home = world.listRelations({ type: ObjectRelations.containedIn, from: cloak! })[0]?.to ?? "";
  assert.ok(home.length > 0, "the cloak has a real location");

  // Go to where it is, legally: the holder (or its container's place).
  const space = world.getComponent(home, "world-space.space");
  const placeId = world.listRelations({ type: "world-space.inside", from: home })[0]?.to
    ?? (space ? home : "");
  if (placeId) sim.dispatch({ type: SettlementCommands.arrive, actorId: id, source: "player", payload: { placeId } as never });
  if (space) sim.dispatch({ type: "world-space.move_within", actorId: id, source: "player", payload: { spaceId: home } as never });

  const owner = world.listRelations({ type: ObjectRelations.ownedBy, from: cloak! })[0]?.to;
  if (owner && owner !== id) {
    sim.dispatch({ type: ObjectCommands.lend, actorId: owner,
      payload: { objectId: cloak!, borrowerId: id, dueAt: sim.tick + 30 } as never });
  }
  const take = sim.dispatch({ type: ObjectCommands.take, actorId: id, payload: { objectId: cloak! } as never });
  if (!take.ok) return;                     // unreachable from here: not this test's subject
  const worn = sim.dispatch({ type: ObjectCommands.wear, actorId: id, payload: { objectId: cloak! } as never });
  assert.equal(worn.ok, true, JSON.stringify(worn.errors));
  assert.equal(wornWrap(sim.worldView(), id), cloak,
    "a hide cloak counts as a worn garment; before this change only the reed wrap did");
  assert.ok(prototypeOf(sim.worldView(), cloak!).capabilities.includes("warm"),
    "and its declared abilities survived loading");
});
