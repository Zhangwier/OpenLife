/**
 * General exchange: any two people in the same place, any valued goods,
 * decided by a deterministic appraisal with favours owed (人情).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, residentId, tradeableGoods, favourOwed, appraise,
  RIVER_TERRACE_PACK, type CounterpartView, tryNpcExchange,
} from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";

const lastType = (sim: Simulation) => { sim.syncHistory(); return sim.history.view().listEvents().filter((e) => String(e.type).includes("exchange")).at(-1)?.type; };
const VALUES = RIVER_TERRACE_PACK.exchange!.values;

function life() {
  const sim = new Simulation({ worldSeed: 5, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const must = (type: string, payload: Record<string, unknown>, actorId = id, source: "player" | "ai" = "player") => {
    const r = sim.dispatch({ type, actorId, source, payload: payload as never });
    assert.equal(r.ok, true, `${type}: ${r.errors[0]?.message}`);
    return r;
  };
  return { sim, id, must };
}

const view = (over: Partial<CounterpartView> = {}): CounterpartView =>
  ({ name: "阿苇", hunger: 0, holds: { "resource:fuel": 5 }, wants: [], closeness: "陌生", owed: 0, ...over });

const ap = (v: CounterpartView, give: string[], resourceId: string, amount: number, credit = false) =>
  appraise(v, VALUES, { resources: give }, { resourceId, amount }, credit);
const W = "resource:water", G = "resource:grain", F = "resource:fuel";

test("appraisal: a fair deal passes, a short one does not", () => {
  assert.equal(ap(view(), [G], F, 2).accept, true, "grain (2) for two fuel (1+1)");
  const no = ap(view(), [W], F, 2);
  assert.equal(no.accept, false);
  assert.match(no.reason, /不划算/);
});

test("appraisal: closeness lets a gap stand, needs raise what a thing is worth", () => {
  const v = view({ holds: { [G]: 5 } });
  assert.equal(ap(v, [W, W, W], G, 2).accept, false, "3 for 4 is too short for a stranger");
  assert.equal(ap({ ...v, closeness: "相识" }, [W, W, W], G, 2).accept, true, "an acquaintance lets it go");
  assert.equal(ap(view({ wants: [W] }), [W, W], F, 3).accept, true, "water is worth more to someone who needs it");
});

test("appraisal: a hungry person guards food, nobody gives the last portion cheap", () => {
  const hungry = ap(view({ hunger: 5, holds: { [G]: 5 } }), [F, F], G, 1);
  assert.equal(hungry.accept, false);
  assert.match(hungry.reason, /饿/);
  assert.equal(ap(view({ hunger: 5, holds: { [G]: 5 } }), [F, F, F], G, 1).accept, true);
  const last = ap(view({ holds: { [F]: 1 } }), [W], F, 1);
  assert.equal(last.accept, false);
  assert.match(last.reason, /最后/);
});

test("appraisal: favours owed, their limit, and paying them back", () => {
  const credit = ap(view({ closeness: "见过", holds: { [G]: 5 } }), [], G, 1, true);
  assert.equal(credit.accept, true);
  assert.equal(credit.onCredit, 2);
  assert.equal(ap(view({ holds: { [G]: 5 } }), [], G, 1, true).accept, false, "strangers give no credit");
  const over = ap(view({ closeness: "见过", owed: 2, holds: { [G]: 5 } }), [], G, 1, true);
  assert.equal(over.accept, false);
  assert.match(over.reason, /人情/);
  const repay = ap(view({ owed: 2 }), [G, G], F, 2);
  assert.equal(repay.accept, true);
  assert.equal(repay.repaid, 2);
});

test("a real exchange swaps ownership and custody of concrete items in one step", () => {
  const { sim, id, must } = life();
  const reed = residentId("reed-worker");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: F, amount: 3 }, reed, "ai");
  const fuelBefore = tradeableGoods(sim.worldView(), reed)[F]!;
  assert.equal(fuelBefore.length, 3);
  must(SettlementCommands.arrive, { placeId: "place:field" });
  must(SettlementCommands.draw, { placeId: "place:field", resourceId: G });
  const grainId = tradeableGoods(sim.worldView(), id)[G]![0]!;

  // Not face to face yet.
  const away = sim.dispatch({ type: SettlementCommands.exchange, actorId: id, source: "player",
    payload: { targetId: reed, give: [grainId], askResource: F, askAmount: 2 } as never });
  assert.equal(away.ok, false);
  assert.match(away.errors[0]!.message, /当面/);

  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  must(SettlementCommands.exchange, { targetId: reed, give: [grainId], askResource: F, askAmount: 2 });
  const world = sim.worldView();
  assert.deepEqual(tradeableGoods(world, reed)[G], [grainId], "the grain now belongs to 阿苇");
  assert.equal(tradeableGoods(world, id)[F]!.length, 2, "two real bundles of fuel came back");
  assert.equal(tradeableGoods(world, reed)[F]!.length, 1);
  assert.equal(lastType(sim), "settlement-locations.exchanged");
});

test("an acquaintance lends on credit and the favour is remembered", () => {
  const { sim, id, must } = life();
  const reed = residentId("reed-worker");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: F, amount: 3 }, reed, "ai");
  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  const ask = { targetId: reed, give: [], askResource: F, askAmount: 1, credit: true };
  must(SettlementCommands.exchange, ask);
  assert.equal(lastType(sim), "settlement-locations.exchange_declined", "a stranger gives no credit");
  assert.equal(favourOwed(sim.worldView(), reed, id), 0);
  must(SettlementCommands.talk, { targetId: reed });
  must(SettlementCommands.exchange, ask);
  assert.equal(lastType(sim), "settlement-locations.exchanged");
  assert.equal(favourOwed(sim.worldView(), reed, id), 1);
  assert.equal(tradeableGoods(sim.worldView(), id)[F]!.length, 1);
});

test("villagers trade among themselves through the same validated exchange", () => {
  const { sim, id, must } = life();
  const reed = residentId("reed-worker"), weaver = residentId("lan-mother");
  must(SettlementCommands.arrive, { placeId: "place:reedbed", travelMode: "local" }, reed, "ai");
  must(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 2 }, reed, "ai");
  must(SettlementCommands.arrive, { placeId: "place:field", travelMode: "local" }, weaver, "ai");
  must(SettlementCommands.draw, { placeId: "place:field", resourceId: G }, weaver, "ai");
  must(SettlementCommands.arrive, { placeId: "place:reedbed", travelMode: "local" }, weaver, "ai");
  const trade = tryNpcExchange(sim as never, reed, 0);
  assert.ok(trade, "a deal is found: she needs reed, he needs grain");
  assert.equal(trade!.accepted, true, trade!.label);
  assert.equal(tradeableGoods(sim.worldView(), reed)[G]?.length, 1);
  assert.equal(tradeableGoods(sim.worldView(), weaver)["resource:reed"]?.length, 2);

  // The player is never a target of someone else's deal.
  must(SettlementCommands.arrive, { placeId: "place:reedbed" });
  const grab = sim.dispatch({ type: SettlementCommands.exchange, actorId: reed, source: "ai",
    payload: { targetId: id, give: [], askResource: G, askAmount: 1, credit: true } as never });
  assert.equal(grab.ok, false);
});
