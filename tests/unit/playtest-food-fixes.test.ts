/**
 * Fixes found by the 2026-10-14 playtest: renewal keeps its partial cycle,
 * carried raw grain is edible, and harvest says why it cannot happen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, SettlementComponents, homestead } from "@openlife/module-settlement-locations";
import { withoutAgents } from "../helpers/agents.ts";

function life() {
  const sim = new Simulation({ worldSeed: 14, modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, withoutAgents(settlementLocationsModule)] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } });
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const act = (label: string) => {
    const a = homestead(sim.worldView(), id).actions.find((x) => x.label.startsWith(label));
    assert.ok(a, `action ${label}`);
    return { action: a!, result: a!.enabled ? sim.dispatch({ type: a!.id, actorId: id, source: "player", payload: a!.payload }) : undefined };
  };
  return { sim, id, act, view: () => homestead(sim.worldView(), id) };
}
const cooked = (sim: Simulation) => sim.worldView().getComponent("yield:place:hearth-yard:resource:cooked", SettlementComponents.yieldPoint) as Record<string, number>;

test("a draw keeps the regrowth already under way", () => {
  const { sim, act } = life();
  act("走到公用灶台");
  for (let i = 0; i < 6; i++) act("吃熟食");      // hearth empty at its start tick
  const emptiedAt = sim.tick;
  assert.equal(cooked(sim).stock, 0);
  sim.advanceBy(3);                                // one 3-day cycle: one portion back
  sim.advanceBy(2);                                // and 2 days into the next cycle
  assert.equal(act("吃熟食").result?.ok, true);
  assert.equal(cooked(sim).lastRenewedAt, emptiedAt + 3, "the 2 days of the next cycle are not thrown away");
  sim.advanceBy(1);
  assert.equal(act("吃熟食").result?.ok, true, "the next portion is ready one day later, not three");
});

test("carried raw grain can be eaten anywhere, easing less hunger than cooked food", () => {
  const { sim, act, view } = life();
  act("走到河岸旱地");
  assert.equal(act("取粟").result?.ok, true);
  act("走到渡口");
  sim.advanceBy(6);
  const before = view().hunger;
  assert.ok(before >= 4);
  const eat = act("生嚼一份随身的粟");
  assert.equal(eat.result?.ok, true);
  assert.equal(view().hunger, before - 2);
  assert.equal(view().carried.find((c) => c.resourceId === "resource:grain"), undefined, "the grain is really gone");
});

test("harvest is shown disabled with a reason when hands are full", () => {
  const { sim, act, view } = life();
  act("走到河岸旱地");
  act("走到田头");
  act("取粟");
  assert.equal(act("播种一份粟粒").result?.ok, true);
  act("照看田地");
  sim.advanceBy(31);
  assert.equal(act("取粟").result?.ok, true);
  assert.equal(act("取粟").result?.ok, true);
  const harvest = view().actions.find((a) => a.label.startsWith("收获"))!;
  assert.equal(harvest.enabled, false);
  assert.match(harvest.reason, /腾出/);
  act("生嚼一份随身的粟");
  const now = view().actions.find((a) => a.label.startsWith("收获"))!;
  assert.equal(now.enabled, true, "with a hand free the harvest is offered");
  assert.equal(sim.dispatch({ type: now.id, actorId: view().characterId, source: "player", payload: now.payload }).ok, true,
    "and an offered harvest succeeds");
});
