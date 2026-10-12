import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule, ObjectRelations, ownerOf, holderOf, prototypeOf } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, SettlementComponents, homestead, residentId } from "@openlife/module-settlement-locations";
import { runVillageDayBoundary } from "../../apps/web/src/village-day.ts";
const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

function village() {
  const sim = new Simulation({ worldSeed: 9305, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "启" } }).ok, true);
  const player = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const act = (type: string, payload: Record<string, string> = {}) =>
    sim.dispatch({ type, actorId: player, source: "player", payload });
  const go = (placeId: string) => assert.equal(act(SettlementCommands.arrive, { placeId }).ok, true);
  return { sim, player, act, go };
}
for (const [resourceId, place] of [
  ["resource:fuel", "place:reedbed"], ["resource:grain", "place:field"],
] as const) {
  test(`player support is voluntary, physical and persistent: ${resourceId}`, () => {
    const { sim, player, act, go } = village();
    const cook = residentId("cook");
    assert.equal(homestead(sim.worldView(), player).communitySituation.visible, false,
      "distant private activity is not instantly revealed to player");
    go(place);
    assert.equal(act(SettlementCommands.draw, { placeId: place, resourceId }).ok, true);
    const itemId = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: player })
      .map(r => r.from).find(id => prototypeOf(sim.worldView(), id).resourceId === resourceId)!;
    assert.ok(itemId);
    assert.equal(act(SettlementCommands.helpHearth, { objectId: itemId }).ok, false,
      "a remote player cannot make a material appear at the hearth");
    go("place:hearth-yard");
    assert.equal(act(SettlementCommands.helpHearth, { objectId: itemId }).ok, false,
      "meeting is required before donating");
    assert.equal(act(SettlementCommands.talk, { targetId: cook }).ok, true);
    assert.equal(act(SettlementCommands.helpHearth, { objectId: itemId }).ok, true);
    assert.equal(ownerOf(sim.worldView(), itemId), cook);
    if (resourceId === "resource:fuel") assert.equal(holderOf(sim.worldView(), itemId), cook);
    else assert.equal(sim.worldView().listRelations({ type: ObjectRelations.containedIn, from: itemId })[0]?.to,
      "space:hearth");
    assert.equal(Number(sim.worldView().getComponent(cook, SettlementComponents.resident)?.giftCount), 1);
    assert.ok(homestead(sim.worldView(), player).communitySituation.recentHelp);
    const stored = sim.save();
    const recovered = Simulation.load(stored, modules);
    assert.equal(recovered.result.ok, true);
    assert.equal(recovered.simulation!.fingerprint(), sim.fingerprint());
    assert.equal(act(SettlementCommands.helpHearth, { objectId: itemId }).ok, false,
      "cannot give away another person's now-owned object a second time");
    assert.equal(Number(sim.worldView().getComponent(cook, SettlementComponents.resident)?.giftCount), 1);
    const tick = sim.tick;
    sim.advanceBy(1);
    runVillageDayBoundary(sim, tick);
    if (resourceId === "resource:fuel") {
      assert.equal(sim.worldView().getEntity(itemId)?.archivedAt !== undefined, true,
        "the cook later burns the donated real fuel, not a story-only counter");
    }
  });
}
