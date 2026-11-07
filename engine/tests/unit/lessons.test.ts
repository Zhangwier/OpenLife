/**
 * 请教手艺：熟了才肯教，一天一课；学会了做相应的活更省时（或收得更多），
 * 陶叔把看火的经验讲给你，就圆了他的心愿。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, homestead, residentId, recipeActivity, skillsOf, wishFulfilled, RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";
import { occupiedPlaceId } from "@openlife/module-world-space";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

test("a villager teaches a craft over a few days once they know you", () => {
  const sim = new Simulation({ worldSeed: 11, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const elder = residentId("elder");
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const meet = () => {
    const at = occupiedPlaceId(sim.worldView(), elder);
    if (at !== occupiedPlaceId(sim.worldView(), me)) act(SettlementCommands.arrive, { placeId: at });
  };
  meet();
  const first = act(SettlementCommands.learn, { targetId: elder });
  assert.equal(first.ok, false, "a stranger is not taught");
  assert.match(first.errors[0]!.message, /不够熟/);
  const fire = RIVER_TERRACE_PACK.recipes!.find((r) => r.id === "recipe:fire-jar")!;
  const slow = recipeActivity(sim.worldView(), me, fire);
  // Get to know him: a talk a day, and learn his wish.
  let lessons = 0;
  for (let d = 0; d < 12 && !skillsOf(sim.worldView(), me).includes("fire-watch"); d++) {
    meet();
    act(SettlementCommands.talk, { targetId: elder });
    const r = act(SettlementCommands.learn, { targetId: elder });
    if (r.ok) {
      lessons += 1;
      assert.equal(act(SettlementCommands.learn, { targetId: elder }).ok, false, "one lesson a day");
    }
    sim.advanceBy(1);
  }
  assert.equal(lessons, 3);
  assert.ok(skillsOf(sim.worldView(), me).includes("fire-watch"));
  assert.equal(recipeActivity(sim.worldView(), me, fire), slow - 1);
  assert.equal(wishFulfilled(sim.worldView(), elder), me, "passing on his fire-watching was his wish");
  const view = homestead(sim.worldView(), me).skills;
  assert.equal(view[0]!.name, "看火");
  assert.equal(view[0]!.learned, true);
});
