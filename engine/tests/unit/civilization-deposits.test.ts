/**
 * A4 集成：矿藏约束文明层的科技。
 *
 * A3 的 civilization 让每个政体自己发明；A4 给它加上材料门槛：
 * 附近没有铜的政体，永远造不出 copper-smelting；有了贸易路线才能运来。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { worldDepositsModule, DepositsCommands } from "@openlife/module-world-deposits";
import { civilizationModule, CivilizationCommands } from "@openlife/module-civilization";

const MODULES = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
  worldDepositsModule, civilizationModule];

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed, modules: MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  return sim;
}

const COPPER = { id: "invention:copper-smelting", answers: ["need:better-pots", "deposit:copper"], difficulty: 60 };

test("附近有铜的政体造得出铜，没有的造不出", { timeout: 120000 }, () => {
  const sim = world();
  // 铺一张矿藏图，本村在 (0,0)，邻村在 (6,6)。
  sim.dispatch({ type: DepositsCommands.generate, payload: { width: 12, height: 12 }, source: "system" });

  // 本村开局就会铜（有矿），邻村不会。
  sim.dispatch({ type: "civilization.found", payload: {
    homeName: "河岸台地", homePopulation: 12,
    homeKnown: { "invention:copper-smelting": 0.8 },
    neighbours: [{ name: "远山", x: 6, y: 6, population: 8 }],
  }, source: "system" });

  // 本村有铜（(0,0) 附近有 deposit:copper），邻村没有（(6,6) 附近没有）。
  // civilization.year 会读矿藏图，本村的铜能保住，邻村的铜传不过去（没矿也没贸易路线）。
  for (let year = 1; year <= 40; year += 1) {
    sim.dispatch({ type: "civilization.year", payload: { inventions: [COPPER] }, source: "system" });
  }

  const net = sim.worldView().getComponent("civilization:network", "civilization.network") as
    { polities: Array<{ id: string; known: Record<string, number> }> } | undefined;
  const homeKnown = net!.polities.find((p) => p.id === "polity:home")!.known["invention:copper-smelting"] ?? 0;
  const neighbourKnown = net!.polities.find((p) => p.id === "polity:neighbour:0")!.known["invention:copper-smelting"] ?? 0;

  assert.ok(homeKnown > 0.5, `本村有铜，该会炼铜（实际 ${homeKnown}）`);
  assert.ok(neighbourKnown < 0.3, `邻村没铜，不该会炼铜（实际 ${neighbourKnown}）`);
});
