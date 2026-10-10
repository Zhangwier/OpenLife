import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, prototypeOf, ownerOf, holderOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, SettlementComponents,
  residentId, dailyActivity, worksites, homestead, people,
} from "@openlife/module-settlement-locations";
import { FIRST_AUTONOMOUS_RESIDENT, runFirstNpcDay } from "../../apps/web/src/npc.ts";
import { runSecondNpcDay } from "../../apps/web/src/npc-cook.ts";
import { runVillageDayBoundary } from "../../apps/web/src/village-day.ts";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

function village(seed: number) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character",
    payload: { givenName: "禾", familyName: "林", lifespan: 90 } }).ok, true);
  const playerId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return { sim, playerId };
}
const prepared = (sim: Simulation) => {
  sim.advanceBy(1);
  return runFirstNpcDay(sim);
};
const cooked = (sim: Simulation) => worksites(sim.worldView()).places
  .find((p) => p.placeId === "place:hearth-yard")!.resources
  .find((row) => row.resourceId === "resource:cooked")!.stock;

test("M3-C: one authoritative day-boundary advances both NPCs once; replay after load is idempotent", () => {
  const play = () => {
    const { sim, playerId } = village(7301);
    const start = sim.tick;
    const previousGrain = worksites(sim.worldView()).places
      .find((p) => p.placeId === "place:field")!.resources
      .find((r) => r.resourceId === "resource:grain")!.stock;
    const firstNoop = runVillageDayBoundary(sim, start);
    assert.equal(firstNoop.ran, false, "a command that does not change the date must never run villagers");
    assert.equal(sim.worldView().getComponent(residentId("yu"), SettlementComponents.resident)?.lastRoutineAt ?? -1, -1);
    sim.advanceBy(1);
    const first = runVillageDayBoundary(sim, start);
    assert.equal(first.ran, true);
    assert.equal(first.tick, start + 1);
    assert.equal(first.notes.length, 2);
    const cook = residentId("cook"), farmer = residentId("yu");
    assert.equal(sim.worldView().getComponent(cook, SettlementComponents.resident)?.lastRoutineAt, sim.tick);
    assert.equal(sim.worldView().getComponent(farmer, SettlementComponents.resident)?.lastRoutineAt, sim.tick);
    assert.equal(Number(sim.worldView().getComponent(cook, SettlementComponents.resident)?.npcDailyCount), 1);
    assert.equal(Number(sim.worldView().getComponent(farmer, SettlementComponents.resident)?.npcDailyCount), 1);
    const snapshot = sim.fingerprint();
    const food = cooked(sim);
    assert.equal(runVillageDayBoundary(sim, start).ran, false,
      "a retry for the same day is no new labor, movement or food");
    assert.equal(sim.fingerprint(), snapshot);
    const loaded = Simulation.load(sim.save(), modules);
    assert.equal(loaded.result.ok, true);
    const resumed = loaded.simulation!;
    assert.equal(runVillageDayBoundary(resumed, start).ran, false);
    assert.equal(resumed.fingerprint(), snapshot);
    const afterManual = resumed.tick;
    resumed.advanceBy(1);
    assert.equal(runVillageDayBoundary(resumed, afterManual).ran, true);
    assert.equal(cooked(resumed), food - 1, "next day NPC meal consumes one real portion");
    assert.equal(dailyActivity(resumed.worldView(), playerId).used, 0,
      "NPC actions never deduct player's daily slots");
    assert.equal(Number(resumed.worldView().getComponent(cook, SettlementComponents.resident)?.npcDailyCount), 2);
    assert.equal(Number(resumed.worldView().getComponent(farmer, SettlementComponents.resident)?.npcDailyCount), 2);

    const beforeSkipTick = resumed.tick;
    const beforeSkipFingerprint = resumed.fingerprint();
    const reference = Simulation.load(resumed.save(), modules);
    assert.equal(reference.result.ok, true);
    reference.simulation!.advanceBy(360);
    const beforeSkipCookDays = Number(resumed.worldView().getComponent(cook, SettlementComponents.resident)?.npcDailyCount);
    resumed.advanceBy(360);
    const clockOnlyFingerprint = resumed.fingerprint();
    const skipped = runVillageDayBoundary(resumed, beforeSkipTick);
    assert.equal(skipped.ran, false, "year-length old fast-forward never replays 360 NPC routines");
    assert.deepEqual(skipped.notes, []);
    assert.equal(cooked(resumed), cooked(reference.simulation!),
      "legitimate seasonal renewals match an identical clock-only control world");
    assert.equal(resumed.fingerprint(), clockOnlyFingerprint,
      "the NPC boundary does not modify the world after a multi-day jump");
    assert.equal(Number(resumed.worldView().getComponent(cook, SettlementComponents.resident)?.npcDailyCount),
      beforeSkipCookDays);
    assert.notEqual(resumed.fingerprint(), beforeSkipFingerprint, "only original world time advanced");

    // Later short daily steps run from their actual day, not missing history.
    const afterSkip = resumed.tick;
    resumed.advanceBy(1);
    assert.equal(runVillageDayBoundary(resumed, afterSkip).ran, true);
    assert.equal(Number(resumed.worldView().getComponent(cook, SettlementComponents.resident)?.npcDailyCount),
      beforeSkipCookDays + 1);
    assert.equal(worksites(resumed.worldView()).places.find((p) => p.placeId === "place:field")!.resources
      .find((r) => r.resourceId === "resource:grain")!.stock, previousGrain,
      "a skipped year does not fabricate grain-for-fuel barter");
    return resumed.fingerprint();
  };
  assert.equal(play(), play(), "same seed and command sequence yields the same complete world");
});

test("M3-C: no village means no NPC day, and long gaps cannot mint NPC activity", () => {
  const sim = new Simulation({ worldSeed: 7302, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character",
    payload: { givenName: "石", familyName: "禾", lifespan: 80 } }).ok, true);
  const first = sim.tick;
  sim.advanceBy(1);
  assert.equal(runVillageDayBoundary(sim, first).ran, false);
  assert.equal(sim.worldView().getEntity("settlement-locations:resident:cook"), undefined);
});
test("M3-B: both autonomous residents execute and persist independent daily records", () => {
  const { sim, playerId } = village(7111);
  sim.advanceBy(1);
  const cook = runSecondNpcDay(sim);
  const farmer = runFirstNpcDay(sim);
  const cookState = sim.worldView().getComponent(residentId("cook"), SettlementComponents.resident);
  const farmerState = sim.worldView().getComponent(residentId("yu"), SettlementComponents.resident);
  assert.equal(cookState?.lastRoutineAt, sim.tick, JSON.stringify({ cook, cookState }));
  assert.equal(farmerState?.lastRoutineAt, sim.tick, JSON.stringify({ farmer, farmerState }));
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: playerId, payload: { placeId: "place:field" } }).ok, true);
  assert.equal(homestead(sim.worldView(), playerId).neighbours.find((p) => p.id === residentId("yu"))?.dailyNote, farmer.note);
  assert.equal(people(sim.worldView()).residents.find((p) => p.id === residentId("yu"))?.standingRoutine,
    farmer.note, JSON.stringify({ cook, farmer }));
});

test("M3-A: one NPC works, walks, eats a REAL shared ration and rests, once per world day", () => {
  const { sim, playerId } = village(7001);
  const npc = FIRST_AUTONOMOUS_RESIDENT;
  assert.equal(npc, residentId("yu"));
  assert.equal(occupiedPlaceId(sim.worldView(), npc), "place:field");
  const firstFood = cooked(sim);
  const playerBudget = dailyActivity(sim.worldView(), playerId);
  const first = prepared(sim);
  assert.equal(first.skipped, false, first.note);
  assert.ok(first.actions.includes("照料田地"), first.note);
  assert.ok(first.actions.includes("吃一份熟食"), first.note);
  assert.ok(first.actions.includes("休息"), first.note);
  assert.equal(cooked(sim), firstFood - 1, "NPC and player share exactly the same cooked-food yield");
  assert.equal(sim.worldView().getComponent(npc, SettlementComponents.holding)?.workCount, 1);
  assert.equal(sim.worldView().getComponent(npc, SettlementComponents.holding)?.lastRestedAt, sim.tick);
  assert.equal(dailyActivity(sim.worldView(), npc).used, 8);
  assert.equal(occupiedPlaceId(sim.worldView(), npc), "place:field");
  assert.equal(occupiedSpaceId(sim.worldView(), npc), "space:yu-sleep");
  assert.equal(dailyActivity(sim.worldView(), playerId).used, playerBudget.used,
    "NPC activity never spends the player's action budget");
  const resident = sim.worldView().getComponent(npc, SettlementComponents.resident);
  assert.equal(resident?.lastRoutineAt, sim.tick);
  assert.ok(String(resident?.standingRoutine).includes("吃一份熟食"));
  assert.equal(people(sim.worldView()).residents.find((r) => r.id === npc)?.standingRoutine, resident?.standingRoutine);

  const sameDay = runFirstNpcDay(sim);
  assert.equal(sameDay.skipped, true);
  assert.equal(cooked(sim), firstFood - 1);
  assert.equal(sim.worldView().getComponent(npc, SettlementComponents.holding)?.workCount, 1);

  const saved = Simulation.load(sim.save(), modules);
  assert.equal(saved.result.ok, true);
  const restored = saved.simulation!;
  assert.equal(restored.fingerprint(), sim.fingerprint());
  assert.equal(runFirstNpcDay(restored).skipped, true, "load cannot repeat an already completed NPC day");
  const second = prepared(restored);
  assert.equal(second.skipped, false, second.note);
  assert.equal(restored.worldView().getComponent(npc, SettlementComponents.holding)?.workCount, 2, second.note);
  assert.equal(cooked(restored), firstFood - 2);
});

test("M3-A: refused food or blocked room leaves real partial progress, not fake food", () => {
  const { sim } = village(7002);
  const npc = FIRST_AUTONOMOUS_RESIDENT;
  // Run six days of meals without replenishing raw stock. Genuine shortages
  // are permitted and never converted into imaginary successful meals.
  const eaten: string[] = [];
  for (let day = 0; day < 9; day++) {
    sim.advanceBy(1);
    const before = cooked(sim);
    const entry = runFirstNpcDay(sim);
    assert.equal(entry.skipped, false);
    assert.equal(entry.tick, sim.tick);
    if (entry.actions.includes("吃一份熟食")) {
      eaten.push(String(day));
      assert.ok(before > 0);
      assert.equal(cooked(sim), before - 1);
    } else {
      assert.equal(cooked(sim), before, "missing food is not consumed or fabricated");
    }
    const record = sim.worldView().getComponent(npc, SettlementComponents.resident);
    assert.equal(record?.lastRoutineAt, sim.tick);
    assert.equal(runFirstNpcDay(sim).skipped, true);
  }
  assert.ok(eaten.length > 0);
  assert.ok(eaten.length < 9, "finite daily meals eventually create a real shortage");
});

function playerBarterFixture(seed: number) {
  const { sim, playerId } = village(seed);
  const cookId = residentId("cook");
  const dispatch = (type: string, actorId: string, payload: Record<string, string>, source: "player" | "ai" = "player") => {
    const result = sim.dispatch({ type, actorId, payload, source });
    assert.equal(result.ok, true, `${type}: ${result.errors?.[0]?.message}`);
  };
  dispatch(SettlementCommands.arrive, playerId, { placeId: "place:field" });
  dispatch(SettlementCommands.draw, playerId, { placeId: "place:field", resourceId: "resource:grain" });
  dispatch(SettlementCommands.arrive, cookId, { placeId: "place:reedbed", travelMode: "local" }, "ai");
  dispatch(SettlementCommands.draw, cookId, { placeId: "place:reedbed", resourceId: "resource:fuel" }, "ai");
  dispatch(SettlementCommands.arrive, cookId, { placeId: "place:hearth-yard", travelMode: "local" }, "ai");
  dispatch(SettlementCommands.arrive, playerId, { placeId: "place:hearth-yard", travelMode: "local" });
  const held = (actorId: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((r) => r.from);
  const grainId = held(playerId).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:grain")!;
  const fuelId = held(cookId).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:fuel")!;
  assert.ok(grainId && fuelId);
  const request = () => sim.dispatch({ type: SettlementCommands.playerBarterRequest,
    actorId: playerId, source: "player", payload: { grainId } });
  const quote = () => sim.dispatch({ type: SettlementCommands.cookBarterQuote,
    actorId: cookId, source: "ai", payload: { customerId: playerId, fuelId } });
  const accept = () => sim.dispatch({ type: SettlementCommands.playerBarterAccept,
    actorId: playerId, source: "player", payload: { grainId, fuelId } });
  const decline = () => sim.dispatch({ type: SettlementCommands.playerBarterDecline,
    actorId: playerId, source: "player", payload: { grainId, fuelId } });
  return { sim, playerId, cookId, grainId, fuelId, request, quote, accept, decline };
}

test("M3-D: player requests, cook separately authorizes, player alone accepts real grain-for-fuel barter", () => {
  const { sim, playerId, cookId, grainId, fuelId, request, quote, accept, decline } = playerBarterFixture(7401);
  const count = () => sim.worldView().listEntities({ kind: "world-objects.item" })
    .filter((entity) => entity.archivedAt === undefined).length;
  const before = count();
  assert.equal(accept().ok, false, "no acceptance before a quote exists");
  assert.equal(decline().ok, false);
  assert.equal(homestead(sim.worldView(), playerId).actions.some((a) =>
    a.id === SettlementCommands.playerBarterRequest && a.enabled), true);
  assert.equal(request().ok, true);
  assert.equal(ownerOf(sim.worldView(), fuelId), cookId, "a player's request cannot move the cook's property");
  assert.equal(ownerOf(sim.worldView(), grainId), playerId, "a request cannot give away the player's grain");
  assert.equal(accept().ok, false, "request alone is not cook consent");
  assert.equal(quote().ok, true, "NPC-owned quote independently validates real inventory");
  assert.equal(quote().ok, false, "one live offer cannot be silently overwritten");
  assert.equal(homestead(sim.worldView(), playerId).barter?.status, "offered");
  const options = homestead(sim.worldView(), playerId).actions;
  assert.ok(options.some((a) => a.id === SettlementCommands.playerBarterAccept && a.enabled));
  assert.ok(options.some((a) => a.id === SettlementCommands.playerBarterDecline && a.enabled));
  assert.equal(sim.dispatch({ type: SettlementCommands.playerBarterAccept,
    actorId: cookId, source: "player", payload: { grainId, fuelId } }).ok, false);
  assert.equal(sim.dispatch({ type: SettlementCommands.playerBarterAccept,
    actorId: playerId, source: "ai", payload: { grainId, fuelId } }).ok, false,
    "AI cannot accept on the player's behalf");
  assert.equal(sim.dispatch({ type: SettlementCommands.playerBarterAccept,
    actorId: playerId, source: "player", payload: { grainId, fuelId: "invalid-id" } }).ok, false,
    "cannot substitute arbitrary goods into the approved offer");
  const tick = sim.tick;
  assert.equal(accept().ok, true);
  assert.equal(sim.tick, tick, "barter does not create another clock or skip a day");
  assert.equal(ownerOf(sim.worldView(), grainId), cookId);
  assert.equal(holderOf(sim.worldView(), grainId), cookId);
  assert.equal(ownerOf(sim.worldView(), fuelId), playerId);
  assert.equal(holderOf(sim.worldView(), fuelId), playerId);
  assert.equal(count(), before, "real items change hands; none created or archived");
  assert.equal(homestead(sim.worldView(), playerId).barter?.status, "accepted");
  assert.equal(Number(sim.worldView().getComponent(playerId, SettlementComponents.holding)?.playerTradeCount), 1);
  assert.equal(accept().ok, false);
  assert.equal(request().ok, false);
  const saved = Simulation.load(sim.save(), modules);
  assert.equal(saved.result.ok, true);
  assert.equal(saved.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(saved.simulation!.dispatch({ type: SettlementCommands.playerBarterAccept,
    actorId: playerId, source: "player", payload: { grainId, fuelId } }).ok, false);
});

test("M3-D: player refusal, expired price, disappearing goods and remote impostors transfer nothing", () => {
  {
    const { sim, playerId, cookId, grainId, fuelId, request, quote, accept, decline } = playerBarterFixture(7402);
    assert.equal(request().ok, true);
    assert.equal(quote().ok, true);
    assert.equal(decline().ok, true);
    assert.equal(homestead(sim.worldView(), playerId).barter?.status, "declined");
    assert.equal(ownerOf(sim.worldView(), grainId), playerId);
    assert.equal(ownerOf(sim.worldView(), fuelId), cookId);
    assert.equal(accept().ok, false);
    assert.equal(decline().ok, false);
    assert.equal(sim.dispatch({ type: SettlementCommands.cookBarterQuote,
      actorId: playerId, source: "player",
      payload: { customerId: playerId, fuelId } }).ok, false);
  }
  {
    const { sim, playerId, cookId, grainId, fuelId, request, quote, accept } = playerBarterFixture(7403);
    assert.equal(request().ok, true);
    assert.equal(quote().ok, true);
    sim.advanceBy(1);
    assert.equal(accept().ok, false, "quote expired at the authoritative next day");
    assert.equal(ownerOf(sim.worldView(), grainId), playerId);
    assert.equal(ownerOf(sim.worldView(), fuelId), cookId);
  }
  {
    const { sim, playerId, cookId, grainId, fuelId, request, quote, accept } = playerBarterFixture(7404);
    assert.equal(request().ok, true);
    assert.equal(quote().ok, true);
    assert.equal(sim.dispatch({ type: "world-objects.place", actorId: playerId,
      source: "player", payload: { objectId: grainId, placeId: "place:hearth-yard" } }).ok, true);
    const previousQuote = sim.worldView().getComponent(cookId, SettlementComponents.resident)?.playerBarterQuote;
    assert.equal(accept().ok, false, "cannot swap a grain that is not still held");
    assert.deepEqual(sim.worldView().getComponent(cookId, SettlementComponents.resident)?.playerBarterQuote,
      previousQuote, "rejected exchange does not alter the pending quote");
    assert.equal(ownerOf(sim.worldView(), grainId), playerId);
    assert.equal(ownerOf(sim.worldView(), fuelId), cookId);
  }
  {
    const { sim, playerId, cookId, grainId, fuelId, request, quote, accept } = playerBarterFixture(7405);
    assert.equal(request().ok, true);
    assert.equal(quote().ok, true);
    assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: playerId,
      source: "player", payload: { placeId: "place:field", travelMode: "local" } }).ok, true);
    assert.equal(accept().ok, false, "cannot accept quote from a remote location");
    assert.equal(ownerOf(sim.worldView(), grainId), playerId);
    assert.equal(ownerOf(sim.worldView(), fuelId), cookId);
  }
});

test("M3-B: one tangible cook/farmer barter requires distinct offer and acceptance", () => {
  const { sim } = village(7201);
  const cook = residentId("cook"), yu = residentId("yu");
  const failBefore = sim.dispatch({ type: SettlementCommands.npcAccept, actorId: yu,
    source: "ai", payload: { fuelId: "missing", grainId: "missing" } });
  assert.equal(failBefore.ok, false);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: cook,
    source: "ai", payload: { placeId: "place:reedbed", travelMode: "local" } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.draw, actorId: cook,
    source: "ai", payload: { placeId: "place:reedbed", resourceId: "resource:fuel" } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: cook,
    source: "ai", payload: { placeId: "place:hearth-yard", travelMode: "local" } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.draw, actorId: yu,
    source: "ai", payload: { placeId: "place:field", resourceId: "resource:grain" } }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: yu,
    source: "ai", payload: { placeId: "place:hearth-yard", travelMode: "local" } }).ok, true);
  const held = (id: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: id }).map((r) => r.from);
  const fuel = held(cook).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:fuel")!;
  const grain = held(yu).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:grain")!;
  assert.ok(fuel && grain);
  const itemsBefore = sim.worldView().listEntities({ kind: "world-objects.item" }).filter((e) => e.archivedAt === undefined).length;
  const offer = () => sim.dispatch({ type: SettlementCommands.npcOffer,
    actorId: cook, source: "ai", payload: { fuelId: fuel, grainId: grain } });
  const accept = () => sim.dispatch({ type: SettlementCommands.npcAccept,
    actorId: yu, source: "ai", payload: { fuelId: fuel, grainId: grain } });
  assert.equal(sim.dispatch({ type: SettlementCommands.npcOffer, actorId: yu,
    source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, false, "Yu cannot forge the cook's offer");
  assert.equal(offer().ok, true);
  assert.equal(offer().ok, false, "one proposal only");
  assert.equal(sim.dispatch({ type: SettlementCommands.npcAccept, actorId: cook,
    source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, false,
    "cook cannot accept on farmer's behalf");
  assert.equal(accept().ok, true);
  assert.equal(ownerOf(sim.worldView(), fuel), yu);
  assert.equal(holderOf(sim.worldView(), fuel), yu);
  assert.equal(ownerOf(sim.worldView(), grain), cook);
  assert.equal(holderOf(sim.worldView(), grain), cook);
  assert.equal(sim.worldView().listEntities({ kind: "world-objects.item" })
    .filter((e) => e.archivedAt === undefined).length, itemsBefore,
    "barter moves two item IDs, never creates or destroys resources");
  assert.equal(accept().ok, false);
  assert.equal(offer().ok, false);
  const copy = Simulation.load(sim.save(), modules);
  assert.equal(copy.result.ok, true);
  assert.equal(copy.simulation!.fingerprint(), sim.fingerprint());
  assert.equal(copy.simulation!.dispatch({ type: SettlementCommands.npcAccept, actorId: yu,
    source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, false,
    "reloading a completed deal never accepts it again");
});

test("M3-B: expired, displaced, missing or unauthorized goods reject barter without transfers", () => {
  const setup = () => {
    const { sim } = village(7202);
    const cook = residentId("cook"), yu = residentId("yu");
    for (const [actorId, type, payload] of [
      [cook, SettlementCommands.arrive, { placeId: "place:reedbed", travelMode: "local" }],
      [cook, SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:fuel" }],
      [cook, SettlementCommands.arrive, { placeId: "place:hearth-yard", travelMode: "local" }],
      [yu, SettlementCommands.draw, { placeId: "place:field", resourceId: "resource:grain" }],
      [yu, SettlementCommands.arrive, { placeId: "place:hearth-yard", travelMode: "local" }],
    ] as [string, string, Record<string, string>][]) {
      assert.equal(sim.dispatch({ type, actorId, source: "ai", payload }).ok, true);
    }
    const held = (id: string) => sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: id }).map((r) => r.from);
    return { sim, cook, yu, fuel: held(cook).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:fuel")!,
      grain: held(yu).find((id) => prototypeOf(sim.worldView(), id).resourceId === "resource:grain")! };
  };
  {
    const { sim, cook, yu, fuel, grain } = setup();
    assert.equal(sim.dispatch({ type: SettlementCommands.npcOffer, actorId: cook,
      source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, true);
    sim.advanceBy(1);
    assert.equal(sim.dispatch({ type: SettlementCommands.npcAccept, actorId: yu,
      source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, false);
    assert.equal(ownerOf(sim.worldView(), fuel), cook);
    assert.equal(ownerOf(sim.worldView(), grain), yu);
  }
  {
    const { sim, cook, yu, fuel, grain } = setup();
    assert.equal(sim.dispatch({ type: SettlementCommands.npcOffer, actorId: cook,
      source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, true);
    assert.equal(sim.dispatch({ type: "world-objects.place", actorId: yu,
      source: "ai", payload: { objectId: grain, placeId: "place:hearth-yard" } }).ok, true);
    assert.equal(sim.dispatch({ type: SettlementCommands.npcAccept, actorId: yu,
      source: "ai", payload: { fuelId: fuel, grainId: grain } }).ok, false);
    assert.equal(ownerOf(sim.worldView(), fuel), cook);
    assert.equal(ownerOf(sim.worldView(), grain), yu);
    assert.equal(holderOf(sim.worldView(), fuel), cook);
  }
  {
    const { sim, cook, yu, fuel, grain } = setup();
    assert.equal(sim.dispatch({ type: SettlementCommands.npcOffer, actorId: cook,
      source: "player", payload: { fuelId: fuel, grainId: grain } }).ok, false);
    assert.equal(sim.dispatch({ type: SettlementCommands.npcAccept, actorId: yu,
      source: "player", payload: { fuelId: fuel, grainId: grain } }).ok, false);
  }
});

test("M3-B: two NPCs complete limited daily commands, one real exchange and no repeat after load", () => {
  const { sim, playerId } = village(7203);
  const cookId = residentId("cook"), yu = residentId("yu");
  const play = () => {
    sim.advanceBy(1);
    const cook = runSecondNpcDay(sim);
    const farmer = runFirstNpcDay(sim);
    assert.equal(cook.skipped, false);
    assert.equal(farmer.skipped, false);
    assert.equal(runSecondNpcDay(sim).skipped, true);
    const repeatedFarmer = runFirstNpcDay(sim);
    assert.equal(repeatedFarmer.skipped, true, JSON.stringify({ cook, farmer, repeatedFarmer, record: sim.worldView().getComponent(yu, SettlementComponents.resident) }));
    assert.equal(dailyActivity(sim.worldView(), playerId).used, 0);
    return { cook, farmer };
  };
  for (let day = 0; day < 5; day++) {
    const before = Number(sim.worldView().getComponent(cookId, SettlementComponents.resident)?.tradeCount ?? 0);
    const results = play();
    assert.equal(before, 0);
    assert.equal(Number(sim.worldView().getComponent(cookId, SettlementComponents.resident)?.tradeCount ?? 0), 0,
      JSON.stringify(results));
  }
  const beforeGrain = worksites(sim.worldView()).places.find((p) => p.placeId === "place:field")!.resources
    .find((r) => r.resourceId === "resource:grain")!.stock;
  const sixth = play();
  assert.ok(sixth.farmer.actions.includes("接受交换，得到柴草"), sixth.farmer.note);
  assert.equal(Number(sim.worldView().getComponent(cookId, SettlementComponents.resident)?.tradeCount ?? 0), 1);
  assert.equal(Number(sim.worldView().getComponent(yu, SettlementComponents.resident)?.tradeCount ?? 0), 1);
  const grainAfter = worksites(sim.worldView()).places.find((p) => p.placeId === "place:field")!.resources
    .find((r) => r.resourceId === "resource:grain")!.stock;
  assert.equal(grainAfter, beforeGrain - 1, "the barter consumed exactly one real field grain");
  const saved = Simulation.load(sim.save(), modules);
  assert.equal(saved.result.ok, true);
  assert.equal(saved.simulation!.fingerprint(), sim.fingerprint());
  const after = play();
  assert.equal(Number(sim.worldView().getComponent(cookId, SettlementComponents.resident)?.tradeCount ?? 0), 1, after.farmer.note);
});
test("M3-A: identical seed and NPC commands replay, player control never gives orders to NPC", () => {
  const run = () => {
    const { sim, playerId } = village(7003);
    for (let day = 0; day < 3; day++) prepared(sim);
    const before = sim.worldView().getComponent(FIRST_AUTONOMOUS_RESIDENT, SettlementComponents.holding)?.workCount;
    // Manual player commands are still scoped to the player and must not
    // issue the NPC marker or transfer NPC authority.
    const refused = sim.dispatch({
      type: SettlementCommands.npcMarkDay,
      actorId: playerId,
      source: "player",
      payload: { actions: ["照料田地"], summary: "玩家伪造 NPC" },
    });
    assert.equal(refused.ok, false);
    assert.equal(sim.worldView().getComponent(FIRST_AUTONOMOUS_RESIDENT,
      SettlementComponents.holding)?.workCount, before);
    return sim.fingerprint();
  };
  assert.equal(run(), run());
});
