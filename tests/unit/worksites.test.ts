/**
 * Working at a worksite is never an empty promise: cutting reed brings reed
 * (taken from the place's own stock), turning greenware dries it, lending a
 * hand is remembered by whoever is there, and sitting at the ford brings news
 * of what a neighbour longs for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, homestead, socialOf, residentId, currentYields } from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function life(seed = 31) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const lastLine = () => sim.kernel.internals.eventLog.list({ type: "settlement-locations.worked", actorId: me }).at(-1)?.data.line as string | undefined;
  return { sim, me, act, lastLine };
}
const stock = (sim: Simulation, placeId: string, r: string) => currentYields(sim.worldView()).find((y) => y.placeId === placeId && y.resourceId === r)!.stock;
const carried = (sim: Simulation, me: string, r: string) => homestead(sim.worldView(), me).carried.find((c) => c.resourceId === r)?.count ?? 0;

test("cutting reed and digging clay bring two real portions out of the place's stock", () => {
  const { sim, me, act, lastLine } = life();
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:reedbed" }).ok, true);
  const before = stock(sim, "place:reedbed", "resource:reed");
  const work = homestead(sim.worldView(), me).actions.find((a) => a.id === SettlementCommands.tend)!;
  assert.equal(work.label, "割一片芦苇");
  assert.equal(act(SettlementCommands.tend, { spaceId: "space:reed-cut" }).ok, true);
  assert.equal(carried(sim, me, "resource:reed"), 2);
  assert.equal(stock(sim, "place:reedbed", "resource:reed"), before - 2, "conserved: the place lost what you gained");
  assert.match(lastLine() ?? "", /2 捆芦苇/);
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:claypits" }).ok, true);
  sim.advanceBy(1);
  assert.equal(act(SettlementCommands.tend, { spaceId: "space:pit-edge" }).ok, true);
  assert.equal(carried(sim, me, "resource:clay"), 2);
});

test("turning greenware dries it today; with nothing wet the work is not offered", () => {
  const { sim, me, act } = life();
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:yard" }).ok, true);
  assert.equal(sim.dispatch({ type: "world-space.move_within", actorId: me, source: "player", payload: { spaceId: "space:drying-rack" } }).ok, true);
  const offered = homestead(sim.worldView(), me).actions.find((a) => a.id === SettlementCommands.tend)!;
  assert.equal(offered.enabled, false);
  assert.match(offered.reason, /湿着的陶坯/);
  assert.equal(act(SettlementCommands.tend, { spaceId: "space:drying-rack" }).ok, false);
});

test("lending a hand is remembered by whoever is there, once a day per place", () => {
  const { sim, me, act, lastLine } = life();
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:hearth-yard" }).ok, true);
  const cook = residentId("cook");
  sim.dispatch({ type: SettlementCommands.arrive, actorId: cook, source: "ai", payload: { placeId: "place:hearth-yard" } });
  const before = socialOf(sim.worldView(), cook).bonds[me]?.trust ?? 5;
  assert.equal(act(SettlementCommands.tend, { spaceId: "space:hearth" }).ok, true);
  const after = socialOf(sim.worldView(), cook).bonds[me]!.trust;
  assert.equal(after, before + 0.5);
  assert.ok((lastLine() ?? "").length > 4, "a thank-you line is written");
  assert.equal(act(SettlementCommands.tend, { spaceId: "space:hearth" }).ok, true);
  assert.equal(socialOf(sim.worldView(), cook).bonds[me]!.trust, after, "no farming the same day");
});

test("sitting at the ford brings news of a neighbour's wish", () => {
  const { sim, me, act, lastLine } = life();
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:ford" }).ok, true);
  assert.equal(act(SettlementCommands.tend, { spaceId: "space:ford-landing" }).ok, true);
  const known = sim.worldView().getComponent(me, "settlement-locations.holding")?.knownWishes as string[];
  assert.equal(known.length, 1);
  assert.match(lastLine() ?? "", /渡口边有人闲聊/);
});
