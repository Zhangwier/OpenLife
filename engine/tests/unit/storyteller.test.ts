/**
 * 村里的年景与人事：换季总有点事（年景、天灾、来客），村民结亲添丁，人少了渡口来新人。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, SettlementId, liveSeason, seasonOf, daysLeftInSeason, people } from "@openlife/module-settlement-locations";

function life() {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(360 * 18);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  return { sim, me };
}

test("over the years the village has good and bad seasons and weddings", () => {
  const { sim, me } = life();
  const lines: string[] = [];
  for (let i = 0; i < 24; i++) {
    const seq = sim.kernel.internals.eventLog.nextSeq;
    liveSeason(sim as never, me, ["farm", "craft", "weave", "visit"][i % 4]!);
    for (const e of sim.kernel.internals.eventLog.since(seq - 1)) if (e.type === "settlement-locations.season_lived") lines.push(String(e.data.line));
  }
  const all = lines.join("\n");
  assert.ok(/粟|大水|野火|冬天格外冷|南岸|开春暖得早|没怎么下雨/.test(all), all);
  assert.match(all, /成了亲，全村人都去道了喜/);
});

test("living day by day, the change of season brings its news once", () => {
  const { sim } = life();
  sim.advanceBy(1);
  const left = daysLeftInSeason(sim.tick);
  const before = seasonOf(sim.tick);
  for (let d = 0; d < left; d += 10) sim.advanceBy(Math.min(10, left - d));
  assert.notEqual(seasonOf(sim.tick), before);
  sim.advanceBy(1);
  const turn = String(sim.worldView().getComponent(SettlementId, "settlement-locations.settlement")?.lastSeasonTurn ?? "");
  assert.ok(turn.endsWith(seasonOf(sim.tick)), turn);
  assert.ok((people(sim.worldView()).residents as unknown[]).length >= 13);
});
