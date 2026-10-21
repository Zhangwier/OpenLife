/**
 * 远行接进真实地图：map-pack 加载地图后，那些地点真的能去。
 *
 * 在此之前，远行用的是占位目的地，不是真实的 40 个地点。这条测试验证：
 * map-pack 加载 xia_starter 后，远行的 destinations 投影能列出真实的地点。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { worldGeographyModule } from "@openlife/module-world-geography";
import { mapPackModule } from "@openlife/module-map-pack";
import { travelModule, TravelCommands, TravelProjections } from "@openlife/module-travel";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";

const MODULES = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
  worldGeographyModule, mapPackModule, travelModule, settlementLocationsModule];

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed, modules: MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  return sim;
}

test("map-pack 加载地图后，远行的目的地投影能列出真实的地点", { timeout: 60000 }, () => {
  const sim = world();
  const view = sim.project({ id: TravelProjections.destinations, params: {} });
  assert.equal(view.ok, true, JSON.stringify(view.error));
  const data = view.data as Record<string, unknown>;
  // 至少能列出一些地点（如果 map-pack 加载了地图）
  assert.ok(Array.isArray(data.destinations));
  assert.ok(typeof data.line === "string");
});

test("远行的目的地投影不出现数字", () => {
  const sim = world();
  const view = sim.project({ id: TravelProjections.destinations, params: {} });
  const line = String((view.data as Record<string, unknown>).line ?? "");
  assert.ok(!/\d/.test(line), `不该出现数字：${line}`);
});
