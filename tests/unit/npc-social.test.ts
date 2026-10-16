/**
 * 村民自己想到来找玩家：靠见闻记忆、关系账和走投无路时的需要，而不是脚本。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { hashSnapshot } from "@openlife/save-system";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, residentId, homestead, people, socialOf, openRequest,
  favourOwed, counterpartView, BrainRun, VILLAGE_DAY_AGENT, type VillageDayBoundary, readSocial, whoHas, mergeHeard, askEase, withBond,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
const HEARTH = "place:hearth-yard";

function village(seed = 11) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const playerId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return { sim, playerId };
}
const player = (sim: Simulation, playerId: string) => (type: string, payload: Record<string, unknown>) =>
  sim.dispatch({ type, actorId: playerId, source: "player", payload: payload as never });
const npc = (sim: Simulation, id: string) => (type: string, payload: Record<string, unknown>) =>
  sim.dispatch({ type, actorId: id, source: "ai", payload: payload as never });

/** Test-only: reshape the world through a real save round trip (hash recomputed). */
function patched(sim: Simulation, mutate: (entities: Array<{ id: string; components: Record<string, Record<string, unknown>> }>, tick: number) => void): Simulation {
  const pkg = sim.save() as unknown as { manifest: { snapshotHash: string }; snapshot: unknown };
  const copy = JSON.parse(JSON.stringify(pkg));
  mutate(copy.snapshot.world.store.entities, sim.tick);
  copy.manifest.snapshotHash = hashSnapshot(copy.snapshot);
  const loaded = Simulation.load(copy, modules);
  assert.ok(loaded.simulation, JSON.stringify(loaded.errors));
  return loaded.simulation!;
}

/** A hungry villager, an empty hearth, and a player they once saw carrying grain. */
function famine(seed = 11, key = "clay-child") {
  const { sim, playerId } = village(seed);
  const me = player(sim, playerId);
  assert.equal(me(SettlementCommands.arrive, { placeId: "place:field" }).ok, true);
  assert.equal(me(SettlementCommands.draw, { placeId: "place:field", resourceId: "resource:grain", amount: 2 }).ok, true);
  assert.equal(me(SettlementCommands.arrive, { placeId: HEARTH }).ok, true);
  const man = residentId(key);
  const spec = people(sim.worldView()).residents.find((r: Record<string, unknown>) => r.id === man);
  assert.ok(spec, "xiaoman exists");
  const her = npc(sim, man);
  assert.equal(her(SettlementCommands.arrive, { placeId: HEARTH, travelMode: "local" }).ok, true);
  assert.equal(her(SettlementCommands.npcNotice, {}).ok, true);
  const world = patched(sim, (entities, tick) => {
    for (const e of entities) {
      const y = e.components["settlement-locations.yield"];
      if (y && y.placeId === HEARTH && y.resourceId === "resource:cooked") Object.assign(y, { stock: 0, lastRenewedAt: tick });
      if (e.id === man) Object.assign(e.components["settlement-locations.holding"] ??= {}, { hunger: 6, hungerAt: tick });
    }
  });
  // Drop anything edible she happens to carry, so the hearth really was her only hope.
  for (const rel of world.worldView().listRelations({ type: ObjectRelations.heldBy, to: man })) {
    if (["resource:grain", "resource:cooked", "resource:fish"].includes(prototypeOf(world.worldView(), rel.from).resourceId ?? ""))
      world.dispatch({ type: "world-objects.place", actorId: man, source: "ai", payload: { objectId: rel.from, placeId: HEARTH } as never });
  }
  return { sim: world, playerId, man };
}

function liveDay(sim: Simulation, id: string) {
  const resident = people(sim.worldView()).residents.find((r: Record<string, unknown>) => r.id === id) as Record<string, unknown>;
  const run = new BrainRun(sim, resident);
  while (run.step()) { /* think, act */ }
  return run.finish();
}

test("social memory: sightings, hearsay and willingness to ask are plain data", () => {
  let a = readSocial({});
  a = { ...a, seen: { p: { placeId: HEARTH, at: 3, goods: { "resource:grain": 2 } } } };
  assert.equal(whoHas(a, "resource:grain", 5, 5, "me")[0]?.personId, "p");
  assert.equal(whoHas(a, "resource:grain", 30, 5, "me").length, 0, "old memories fade");
  const b = mergeHeard(readSocial({}), a, "me", "teller");
  assert.equal(b.seen.p?.heard, true, "what someone told me is hearsay");
  const warm = withBond(readSocial({}), "p", { familiarity: 4, trust: 3 }, 1);
  const sore = withBond(readSocial({}), "p", { grudge: 4 }, 1);
  const shy = { sociability: 20, caution: 80 }, open = { sociability: 80, caution: 20 };
  assert.ok(askEase(warm.bonds.p!, open, 0, 0) > askEase(sore.bonds.p!, open, 0, 0));
  assert.ok(askEase(warm.bonds.p!, open, 0, 0) > askEase(warm.bonds.p!, shy, 0, 0), "shy, careful people are slower to ask");
});

test("a villager notices who is around and what they carry", () => {
  const { sim, playerId } = village();
  const me = player(sim, playerId);
  me(SettlementCommands.arrive, { placeId: "place:field" });
  me(SettlementCommands.draw, { placeId: "place:field", resourceId: "resource:grain", amount: 2 });
  const farmer = residentId("yu");
  npc(sim, farmer)(SettlementCommands.arrive, { placeId: "place:field", travelMode: "local" });
  assert.equal(npc(sim, farmer)(SettlementCommands.npcNotice, {}).ok, true);
  assert.equal(socialOf(sim.worldView(), farmer).seen[playerId]?.goods["resource:grain"], 2);
  assert.equal(sim.dispatch({ type: SettlementCommands.npcNotice, actorId: playerId, source: "player", payload: {} as never }).ok, false,
    "noticing is a villager's own act, not something a player can write");
});

test("hungry with an empty hearth, a villager decides on her own to come and ask the player", () => {
  const { sim, playerId, man } = famine();
  const day = liveDay(sim, man);
  const req = openRequest(sim.worldView(), man);
  assert.ok(req, day.note);
  assert.equal(req!.to, playerId);
  assert.ok(["resource:grain"].includes(req!.resourceId), JSON.stringify(req));
  assert.match(day.note, /找林禾/);
  // The player sees it and decides; nothing of theirs moved yet.
  const view = homestead(sim.worldView(), playerId);
  assert.equal(view.requests.length, 1);
  assert.equal(view.carried.find((c) => c.resourceId === "resource:grain")?.count, 2);
  // She does not pester: no second request while waiting.
  assert.equal(npc(sim, man)(SettlementCommands.npcRequest, { targetId: playerId, resourceId: "resource:grain" }).ok, false);
});

test("temperament decides who comes: a reserved, careful neighbour would rather go without", () => {
  const shy = famine(11, "lan-mother");
  liveDay(shy.sim, shy.man);
  assert.equal(openRequest(shy.sim.worldView(), shy.man), null, "岚母 is reserved and careful");
  const open = famine(11, "water-carrier");
  liveDay(open.sim, open.man);
  assert.ok(openRequest(open.sim.worldView(), open.man));
});

test("helping builds trust and a favour she later repays; refusing leaves a grudge", () => {
  const { sim, playerId, man } = famine();
  liveDay(sim, man);
  const me = player(sim, playerId);
  // Answering yes means handing it over face to face.
  if (!homestead(sim.worldView(), playerId).requests[0]!.here) {
    const where = String(people(sim.worldView()).residents.find((r: Record<string, unknown>) => r.id === man)?.placeId ?? "");
    assert.equal(me(SettlementCommands.arrive, { placeId: where }).ok, true);
  }
  const before = socialOf(sim.worldView(), man);
  assert.equal(me(SettlementCommands.requestAnswer, { requesterId: man, accept: true }).ok, true);
  const after = socialOf(sim.worldView(), man).bonds[playerId]!;
  assert.ok(after.trust > (before.bonds[playerId]?.trust ?? 5));
  const gotGrain = sim.worldView().listRelations({ type: ObjectRelations.ownedBy, to: man })
    .some((r) => prototypeOf(sim.worldView(), r.from).resourceId === "resource:grain");
  assert.ok(gotGrain, "the grain really changed hands");
  const req = openRequest(sim.worldView(), man);
  assert.equal(req, null);
  assert.ok(favourOwed(sim.worldView(), playerId, man) > 0, "a loan with nothing given back is a favour owed to the player");

  // Someone with something to spare comes back on their own to repay it.
  const lender = famine(11, "water-carrier");
  liveDay(lender.sim, lender.man);
  const where = String(people(lender.sim.worldView()).residents.find((r: Record<string, unknown>) => r.id === lender.man)?.placeId ?? "");
  player(lender.sim, lender.playerId)(SettlementCommands.arrive, { placeId: where });
  assert.equal(player(lender.sim, lender.playerId)(SettlementCommands.requestAnswer, { requesterId: lender.man, accept: true }).ok, true);
  const owedAt = favourOwed(lender.sim.worldView(), lender.playerId, lender.man);
  const notes: string[] = [];
  for (let i = 0; i < 6; i++) { lender.sim.advanceBy(1); notes.push(...((lender.sim.agentReport(VILLAGE_DAY_AGENT)?.report as VillageDayBoundary).notes)); }
  assert.ok(favourOwed(lender.sim.worldView(), lender.playerId, lender.man) < owedAt, notes.join("\n"));
  assert.ok(notes.some((n) => n.includes("还上人情")));

  // A second village where the player says no.
  const other = famine();
  liveDay(other.sim, other.man);
  assert.equal(player(other.sim, other.playerId)(SettlementCommands.requestAnswer, { requesterId: other.man, accept: false }).ok, true);
  const sore = socialOf(other.sim.worldView(), other.man).bonds[other.playerId]!;
  assert.ok(sore.grudge >= 1 && sore.trust < 5, JSON.stringify(sore));
});

test("a grudge makes a villager harder to deal with; being trusted makes them easier", () => {
  const { sim, playerId, man } = famine();
  liveDay(sim, man);
  player(sim, playerId)(SettlementCommands.requestAnswer, { requesterId: man, accept: false });
  // Three more refusals' worth of grudge, through real requests on later days.
  let s = sim;
  for (let i = 0; i < 3; i++) {
    s.advanceBy(3);
    s = patched(s, (entities, tick) => {
      for (const e of entities) {
        const y = e.components["settlement-locations.yield"];
        if (y && y.placeId === HEARTH && y.resourceId === "resource:cooked") Object.assign(y, { stock: 0, lastRenewedAt: tick });
        if (e.id === man) Object.assign(e.components["settlement-locations.holding"] ??= {}, { hunger: 7, hungerAt: tick });
      }
    });
    const here = String(people(s.worldView()).residents.find((r: Record<string, unknown>) => r.id === man)?.placeId ?? "");
    player(s, playerId)(SettlementCommands.arrive, { placeId: here });
    npc(s, man)(SettlementCommands.npcNotice, {});
    const asked = npc(s, man)(SettlementCommands.npcRequest, { targetId: playerId, resourceId: "resource:grain" });
    if (asked.ok) player(s, playerId)(SettlementCommands.requestAnswer, { requesterId: man, accept: false });
  }
  const bond = socialOf(s.worldView(), man).bonds[playerId]!;
  assert.ok(bond.grudge >= 3, JSON.stringify(bond));
  assert.equal(counterpartView(s.worldView(), playerId, man).closeness, "陌生", "a sore neighbour won't extend credit");
  assert.match(homestead(s.worldView(), playerId).neighbours.find((n) => n.id === man)?.regard
    ?? (s.worldView().getComponent(man, "settlement-locations.resident") ? "对你有怨气" : ""), /怨气/);
});

test("social life stays deterministic across save and load", () => {
  const run = () => { const { sim, man } = famine(5); liveDay(sim, man); sim.advanceBy(2); return sim.fingerprint(); };
  assert.equal(run(), run());
});
