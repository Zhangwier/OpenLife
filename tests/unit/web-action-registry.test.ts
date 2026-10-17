/**
 * Every action the settlement projection offers the player must be accepted by
 * the web server. A missing entry once made every pack recipe (rope, net, kiln,
 * roof mending) answer "unknown action" in the browser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, homestead } from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
// The action whitelist lives in apps/web/src/actions.ts (split out of server.ts); read both.
const server = readFileSync(new URL("../../apps/web/server.ts", import.meta.url), "utf8")
  + readFileSync(new URL("../../apps/web/src/actions.ts", import.meta.url), "utf8");
const player = readFileSync(new URL("../../apps/web/src/player.ts", import.meta.url), "utf8");
const keyOf = (id: string) => Object.entries(SettlementCommands).find(([, v]) => v === id)?.[0];

test("web server accepts every action the settlement offers at every place", () => {
  const sim = new Simulation({ worldSeed: 5, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  const seen = new Set<string>();
  for (const placeId of ["place:yard", "place:hearth-yard", "place:river", "place:field", "place:kiln", "place:claypits", "place:reedbed", "place:ford"]) {
    sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId } });
    for (const a of homestead(sim.worldView(), me).actions) seen.add(a.id);
  }
  assert.ok(seen.has(SettlementCommands.craft), "pack recipes are offered");
  for (const id of seen) {
    const key = keyOf(id);
    if (key) {
      assert.ok(server.includes(`[SettlementCommands.${key}]`), `server.ts SETTLEMENT_ACTIONS lists ${id}`);
      assert.ok(player.includes(`case SettlementCommands.${key}:`), `player.ts dispatches ${id}`);
    } else {
      assert.ok(server.includes(`"${id}"`), `server.ts accepts ${id}`);
    }
  }
});
