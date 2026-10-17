/**
 * Every action the settlement projection offers the player must be accepted by
 * the web server. A missing entry once made every pack recipe (rope, net, kiln,
 * roof mending) answer "unknown action" in the browser.
 *
 * The projection is not the only source of clickable actions: the scene client
 * also synthesises its own cards (taking and putting down an object, returning a
 * loan). Those never appear in `homestead(...).actions`, so a registry check that
 * only walks the projection cannot see them going stale.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

/**
 * The scene client builds some action cards itself. This test reads the real
 * client sources, collects every action id they hard-code, and requires the web
 * server to accept each one - so a client-only card can never point at an action
 * the server would reject as unknown.
 */
test("web server accepts every action the browser client hard-codes", () => {
  const publicDir = new URL("../../apps/web/public/", import.meta.url);
  const clientFiles = readdirSync(publicDir).filter((name) => name.endsWith(".js"));
  assert.ok(clientFiles.length > 0, "the client sources must be present");

  // Action ids are namespaced `<module>.<command>`; the third segment allows
  // underscores (`plan.configure`, `move_within`, `hearth.help`).
  const idPattern = /"(?:world-objects|world-space|settlement-locations)\.[a-z_]+(?:\.[a-z_]+)?"/g;
  const found = new Set<string>();
  for (const name of clientFiles) {
    const source = readFileSync(new URL(name, publicDir), "utf8");
    for (const match of source.match(idPattern) ?? []) found.add(match.slice(1, -1));
  }
  assert.ok(found.size >= 10, `expected the client to reference real actions, saw ${found.size}`);
  assert.ok(found.has("world-objects.take"), "the client really does synthesise object actions");

  const problems: string[] = [];
  for (const id of [...found].sort()) {
    if (id.startsWith("settlement-locations.")) {
      const key = keyOf(id);
      // ids the client only matches against (never sends) still have to exist.
      if (!key) continue;
      if (!server.includes(`[SettlementCommands.${key}]`) && !server.includes(`"${id}"`)) {
        problems.push(`client sends ${id} but server.ts neither lists nor accepts it`);
      }
      continue;
    }
    // Object and space verbs are accepted by isSettlementAction in src/actions.ts.
    const accepted = server + readFileSync(new URL("../../apps/web/src/actions.ts", import.meta.url), "utf8");
    if (!accepted.includes(`"${id}"`)) problems.push(`client sends ${id} but neither server.ts nor src/actions.ts accepts it`);
  }
  assert.deepEqual(problems, []);
});
