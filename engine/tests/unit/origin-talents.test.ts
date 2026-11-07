/**
 * 出身与天赋：新的人生选一个出身、一到两个天赋（或按种子随缘）。
 * 起始物品真实生成并归玩家；认得你的村民记在自己的人情账上；天赋温和地改变
 * 时间、饥饿、制作与取用。旧存档迁移为「无」。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, socialOf, residentId, rollOrigin, originOf,
  dailyActivity, recipeById, recipeActivity, hungerAt, ORIGINS, TALENTS,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

function life(originId?: string, talents: string[] = [], seed = 21) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } }).ok, true);
  if (originId) {
    const r = sim.dispatch({ type: SettlementCommands.chooseOrigin, actorId: me, source: "player", payload: { originId, talents } });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  }
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}
const carried = (sim: Simulation, me: string, r: string) => homestead(sim.worldView(), me).carried.find((c) => c.resourceId === r)?.count ?? 0;

test("the pack offers several origins and talents", () => {
  assert.ok(ORIGINS.length >= 4 && TALENTS.length >= 6);
  for (const name of ["巧手", "好人缘", "能吃苦", "识草木", "好胃口", "夜猫子"]) assert.ok(TALENTS.some((t) => t.name === name), name);
});

test("an origin brings real owned things and people who already know you; it is chosen only once", () => {
  const { sim, me, act } = life("potter-kin", ["likable"]);
  assert.equal(carried(sim, me, "resource:clay"), 2, "two clay brought from home");
  const elder = socialOf(sim.worldView(), residentId("elder")).bonds[me]!;
  assert.ok(elder.familiarity >= 4 && elder.trust >= 7, "the potter's family knows you");
  const cook = socialOf(sim.worldView(), residentId("cook")).bonds[me]!;
  assert.ok(cook.familiarity >= 1 && cook.trust > 5, "好人缘 warms everyone a little");
  const view = homestead(sim.worldView(), me);
  assert.equal(view.origin.name, "陶家远亲");
  assert.equal(view.origin.daysHere, 1);
  assert.equal(view.neighbours.find((n) => n.name === "陶婶")?.contact, "相识");
  assert.equal(act(SettlementCommands.chooseOrigin, { originId: "wanderer", talents: [] }).ok, false);
  const { act: act2 } = life();
  assert.equal(act2(SettlementCommands.chooseOrigin, { originId: "wanderer", talents: ["deft", "hardy", "fleet"] }).ok, false, "at most two talents");
  assert.equal(act2(SettlementCommands.chooseOrigin, { originId: "nowhere", talents: [] }).ok, false);
});

test("talents change time, hunger, crafting, gathering and walking", () => {
  const owl = life("wanderer", ["night-owl"]);
  assert.equal(dailyActivity(owl.sim.worldView(), owl.me).capacity, 9);
  const plain = life("wanderer", []);
  assert.equal(dailyActivity(plain.sim.worldView(), plain.me).capacity, 8);

  const deft = life("ferry-child", ["deft"]);
  const rope = recipeById("recipe:grain-basket")!;
  assert.equal(recipeActivity(deft.sim.worldView(), deft.me, rope), rope.activity - 1);
  assert.equal(recipeActivity(plain.sim.worldView(), plain.me, recipeById("recipe:twist-rope")!), 1, "never below one unit");

  assert.equal(hungerAt(0, 0, 6, 3), 2);
  const hardy = life("wanderer", ["hardy"]);
  hardy.sim.advanceBy(6); plain.sim.advanceBy(6);
  assert.equal(homestead(hardy.sim.worldView(), hardy.me).hunger, 2, "能吃苦 gets hungry more slowly");
  assert.equal(homestead(plain.sim.worldView(), plain.me).hunger, 3);

  const herb = life("wanderer", ["herbalist"]);
  assert.equal(herb.act(SettlementCommands.arrive, { placeId: "place:reedbed" }).ok, true);
  assert.equal(herb.act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed", amount: 1 }).ok, true);
  assert.equal(carried(herb.sim, herb.me, "resource:reed"), 2, "识草木 brings back one more reed");

  const hearty = life("field-hand", ["hearty"]);
  assert.equal(carried(hearty.sim, hearty.me, "resource:cooked"), 2);
  hearty.sim.advanceBy(14);
  const before = homestead(hearty.sim.worldView(), hearty.me).hunger;
  const food = homestead(hearty.sim.worldView(), hearty.me).objects.find((o) => o.prototypeId === "prototype:cooked-food")!;
  assert.equal(hearty.act(SettlementCommands.eat, { objectId: food.id, resourceId: "resource:cooked" }).ok, true);
  assert.equal(homestead(hearty.sim.worldView(), hearty.me).hunger, Math.max(0, before - 6), "好胃口 eases two more");

  const fleet = life("wanderer", ["fleet"]);
  for (const placeId of ["place:river", "place:field"])
    assert.equal(fleet.act(SettlementCommands.arrive, { placeId, travelMode: "local" }).ok, true);
  assert.equal(dailyActivity(fleet.sim.worldView(), fleet.me).used, 0, "first two walks are free");
  assert.equal(fleet.act(SettlementCommands.arrive, { placeId: "place:kiln", travelMode: "local" }).ok, true);
  assert.equal(dailyActivity(fleet.sim.worldView(), fleet.me).used, 1);
});

test("随缘 is a pure function of the seed", () => {
  assert.deepEqual(rollOrigin(7), rollOrigin(7));
  const r = rollOrigin(104);
  assert.ok(ORIGINS.some((o) => o.id === r.originId));
  assert.equal(new Set(r.talents).size, 2);
  const seeds = new Set(Array.from({ length: 40 }, (_, i) => rollOrigin(i).originId));
  assert.ok(seeds.size >= 3, "different seeds give different starts");
});

test("an old save (module 0.1.0, no origin) loads with origin none and no bonuses", () => {
  const { sim, me, act } = life();
  assert.equal(act(SettlementCommands.arrive, { placeId: "place:river", travelMode: "local" }).ok, true, "the life has a holding record");
  const pkg = JSON.parse(JSON.stringify(sim.save()));
  for (const m of pkg.manifest.modules) if (m.id === "settlement-locations") m.version = "0.1.0";
  const loaded = Simulation.load(pkg, modules);
  assert.equal(loaded.result.ok, true, JSON.stringify(loaded.result.errors));
  assert.ok(loaded.result.migrationsApplied.some((m) => m.module === "settlement-locations" && m.to === "0.2.0"));
  const world = loaded.simulation!.worldView();
  assert.equal(originOf(world, me).id, "none");
  assert.deepEqual(world.getComponent(me, "settlement-locations.holding")?.origin, { id: "none", talents: [], chosenAt: -1 });
  assert.equal(dailyActivity(world, me).capacity, 8);
  assert.equal(homestead(world, me).origin.id, "none");
});
