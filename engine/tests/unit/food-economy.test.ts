/**
 * 2026-10 food rebalance (plan A): hunger rises one point every two days,
 * a harvest yields eight portions (three carried, five to the field heap),
 * and the village kitchen refills by population. The whole village, player
 * included, must be able to live a full year without starving.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, SettlementComponents, homestead, worksites, people,
  hungerAt, villagePopulation, RIVER_TERRACE_PACK, SettlementId, cropGrowDays, cropYield, seasonOf,
} from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";

function life(agents = true, seed = 21) {
  const settlement = agents ? settlementLocationsModule : withoutAgents(settlementLocationsModule);
  const sim = new Simulation({ worldSeed: seed, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlement] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  return { sim, id, view: () => homestead(sim.worldView(), id) };
}
const stock = (sim: Simulation, placeId: string, resourceId: string) =>
  worksites(sim.worldView()).places.find((p) => p.placeId === placeId)!.resources.find((r) => r.resourceId === resourceId)!.stock;

test("hunger rises one point every two days and caps at 10", () => {
  assert.equal(hungerAt(0, 0, 1), 0);
  assert.equal(hungerAt(0, 0, 2), 1);
  assert.equal(hungerAt(3, 10, 17), 6);
  assert.equal(hungerAt(0, 0, 400), 10);
  const { sim, view } = life(false);
  sim.advanceBy(8);
  assert.equal(view().hunger, 4);
});

test("a harvest: three carried home, the rest onto the field heap", () => {
  const { sim, id } = life(false);
  const must = (type: string, payload: Record<string, unknown> = {}) =>
    assert.equal(sim.dispatch({ type, actorId: id, payload: payload as never }).ok, true, type);
  must(SettlementCommands.arrive, { placeId: "place:field" });
  must(SettlementCommands.draw, { placeId: "place:field", resourceId: "resource:grain" });
  const grain = () => sim.worldView().listRelations({ type: "world-objects.held_by", to: id }).map((r) => r.from);
  must(SettlementCommands.sow);
  must(SettlementCommands.tend, { spaceId: "space:field-edge" });
  sim.advanceBy(cropGrowDays(Number(homestead(sim.worldView(), id).crop?.sownAt)));
  const before = stock(sim, "place:field", "resource:grain");
  const amount = cropYield(sim.tick);
  must(SettlementCommands.harvest);
  assert.equal(grain().length, 3, "three new grain in hand");
  const cap = RIVER_TERRACE_PACK.yields.find((y) => y.resourceId === "resource:grain")!.capacity;
  assert.equal(stock(sim, "place:field", "resource:grain"), Math.min(cap, before + amount - 3), "the rest onto the heap, up to its capacity");
});

test("the village kitchen refills by population each day, up to its capacity", () => {
  const { sim, id } = life(false);
  const hearth = RIVER_TERRACE_PACK.yields.find((y) => y.resourceId === "resource:cooked")!;
  const perDay = Math.ceil(villagePopulation(sim.worldView()) / hearth.perResidents!);
  assert.ok(perDay >= 2, `a village of ${villagePopulation(sim.worldView())} gets ${perDay} portions a day`);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: id, payload: { placeId: "place:hearth-yard" } as never }).ok, true);
  sim.advanceBy(10);
  for (let i = 0; i < 4; i++)
    assert.equal(sim.dispatch({ type: SettlementCommands.eat, actorId: id, payload: { placeId: "place:hearth-yard", resourceId: "resource:cooked" } as never }).ok, true);
  const after = stock(sim, "place:hearth-yard", "resource:cooked");
  sim.advanceBy(1);
  assert.equal(stock(sim, "place:hearth-yard", "resource:cooked"), Math.min(hearth.capacity, after + perDay));
});

test("four months: villagers and a player who eats at the hearth never starve", { timeout: 120000 }, () => {
  const { sim, id, view } = life(true, 33);
  // The player lives by the shared hearth; the trip there is the only travel.
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: id, payload: { placeId: "place:hearth-yard" } as never }).ok, true);
  const eatIfHungry = () => {
    if (view().hunger < 4) return;
    sim.dispatch({ type: SettlementCommands.eat, actorId: id, payload: { placeId: "place:hearth-yard", resourceId: "resource:cooked" } as never });
  };
  let worstPlayer = 0, worstVillager = 0, emptyDays = 0;
  for (let day = 0; day < 120; day++) {
    eatIfHungry();
    sim.advanceBy(1);  // the engine runs the village day agent for each day
    worstPlayer = Math.max(worstPlayer, view().hunger);
    if (stock(sim, "place:hearth-yard", "resource:cooked") === 0) emptyDays++;
    if (day >= 30) {
      for (const r of people(sim.worldView()).residents) {
        const holding = sim.worldView().getComponent(String(r.id), SettlementComponents.holding);
        const founded = Number(sim.worldView().getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt ?? 0);
        worstVillager = Math.max(worstVillager, hungerAt(Number(holding?.hunger ?? 0), Number(holding?.hungerAt ?? founded), sim.tick));
      }
    }
  }
  assert.ok(worstPlayer < 8, `player hunger peaked at ${worstPlayer}`);
  assert.ok(worstVillager < 10, `no villager reaches starvation (peak ${worstVillager})`);
  assert.ok(emptyDays < 20, `kitchen empty on ${emptyDays} of 120 days`);
});

test("seasons: winter sowing is slow, autumn harvest is richest, reed and autumn grain wait for their seasons", () => {
  const day = (month: number) => (month - 1) * 30 + 5;   // month 1 = 冬
  assert.equal(seasonOf(day(1)), "冬"); assert.equal(seasonOf(day(4)), "春"); assert.equal(seasonOf(day(10)), "秋");
  assert.equal(cropGrowDays(day(4)), 30);
  assert.equal(cropGrowDays(day(1)), 60);
  assert.ok(cropYield(day(10)) > cropYield(day(7)) && cropYield(day(7)) > cropYield(day(1)));
  const { sim, id } = life(false);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: id, payload: { placeId: "place:field" } as never }).ok, true);
  const before = stock(sim, "place:field", "resource:grain");
  for (let i = 0; i < 2; i++) {
    assert.equal(sim.dispatch({ type: SettlementCommands.draw, actorId: id, payload: { placeId: "place:field", resourceId: "resource:grain" } as never }).ok, true);
    const held = sim.worldView().listRelations({ type: "world-objects.held_by", to: id }).map((r) => r.from);
    for (const objectId of held) sim.dispatch({ type: SettlementCommands.eat, actorId: id, payload: { objectId } as never });
  }
  assert.equal(stock(sim, "place:field", "resource:grain"), before - 2);
  sim.advanceBy(day(8) - sim.tick);       // through spring and summer: no village grain arrives
  assert.equal(stock(sim, "place:field", "resource:grain"), before - 2, "the village heap does not refill outside autumn");
  sim.advanceBy(day(10) - sim.tick);      // into autumn: the village harvest comes in
  assert.ok(stock(sim, "place:field", "resource:grain") > before - 2, "autumn brings the village harvest");
});
