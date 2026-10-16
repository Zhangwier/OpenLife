/**
 * Talking to a villager gives a real line from the pack: a greeting that fits
 * how well they know you and, by the second talk, the wish on their mind
 * (which the player then knows). Same state, same words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, residentId, talkLine, RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function life(seed = 41) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}
const lines = (sim: Simulation, me: string) => sim.kernel.internals.eventLog.list({ type: "settlement-locations.conversation", actorId: me }).map((e) => String(e.data.line));

test("talking gives a real line, and the second talk brings out the villager's wish", () => {
  const { sim, me, act } = life();
  const child = residentId("clay-child");
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:claypits" }).ok, true);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: child, source: "ai", payload: { placeId: "place:claypits" } });
  assert.equal(act(SettlementCommands.talk, { targetId: child }).ok, true);
  const first = lines(sim, me)[0]!;
  assert.ok(first.includes("小满") || first.length > 6, first);
  assert.ok(!first.includes("{"), "placeholders are filled");
  sim.advanceBy(1);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: child, source: "ai", payload: { placeId: "place:claypits" } });
  assert.equal(act(SettlementCommands.talk, { targetId: child }).ok, true);
  const second = lines(sim, me)[1]!;
  const wish = RIVER_TERRACE_PACK.residents.find((r) => r.key === "clay-child")!.wish;
  assert.ok(second.includes(wish), second);
  assert.deepEqual(sim.worldView().getComponent(me, "settlement-locations.holding")?.knownWishes, [child]);
});

test("the same world state gives the same words", () => {
  const a = life(), b = life();
  for (const x of [a, b]) x.act(SettlementCommands.arrive, { placeId: "place:hearth-yard" });
  const cook = residentId("cook");
  assert.equal(talkLine(a.sim.worldView(), a.me, cook, 1).line, talkLine(b.sim.worldView(), b.me, cook, 1).line);
});
