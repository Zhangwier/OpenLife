import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { webModules } from "../../apps/web/src/modules.ts";
import { startHistory, historyDay, historySeason, bridgeFailures, resetBridgeFailures } from "../../apps/web/src/history-bridge.ts";
import { SettlementCommands as C, SettlementComponents as S, SettlementId, improvementOf, IMPROVEMENT_OBJECT,
  dailyActivity, homestead, activityCostFor, prototypeForResource } from "@openlife/module-settlement-locations";
import { RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";
import { ObjectCommands, ObjectComponents, ObjectRelations, ownerOf } from "@openlife/module-world-objects";
import { StoryCommands } from "@openlife/module-village-stories";
import { readJournal } from "../../modules/village-stories/src/journal.ts";
import { storyPackProblems } from "../../modules/village-stories/src/spec.ts";
import { lifeRoutesOf, runBuildingAction } from "../../apps/web/src/life-routes.ts";
import { BuildCommands, currentSite, deliverMaterial } from "@openlife/module-settlement-build";
import { choiceGroups, searchIntent } from "../../apps/web/public/life-story-text.js";

const modules = webModules().modules;
function setup(seed = 7) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.ok(sim.dispatch({ type: "modern.initialize_world" }).ok);
  assert.ok(sim.dispatch({ type: "modern.create_character", payload: { lifespan: 90 } }).ok);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.advanceBy(16 * 360);
  assert.ok(sim.dispatch({ type: C.found }).ok);
  assert.ok(sim.dispatch({ type: C.arrive, actorId: me, payload: { placeId: "place:yard" } }).ok);
  startHistory(sim); historyDay(sim);
  const act = (type: string, payload: Record<string, any> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload });
  const ok = (type: string, payload: Record<string, any> = {}) => { const r = act(type, payload); assert.equal(r.ok, true, JSON.stringify(r.errors)); return r; };
  const go = (placeId: string) => ok(C.arrive, { placeId });
  return { sim, me, act, ok, go };
}
function material(sim: Simulation, me: string, resource: string, n = 1) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `sample:${resource}:${sim.tick}:${i}`; ids.push(id);
    const r = sim.dispatch({ type: ObjectCommands.spawn, source: "system", payload: {
      objectId: id, prototypeId: RIVER_TERRACE_PACK.prototypes.find(p => p.resourceId === resource)?.id ?? prototypeForResource(resource), ownerId: me, holderId: me } });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  }
  return ids;
}
function prepare(h: ReturnType<typeof setup>) {
  const { sim, me, ok, go } = h;
  ok(C.improvementStart);
  const ids = [...material(sim, me, "resource:wood", 2), ...material(sim, me, "resource:rope"), ...material(sim, me, "resource:stone")];
  go("place:river"); ok(C.improvementPrepare);
  return ids;
}
test("active improvement: failures recover, install changes real water cost, knowledge and provenance survive load", () => {
  const h = setup(), { sim, me, ok, act } = h;
  const ids = prepare(h);
  const before = dailyActivity(sim.worldView(), me).used;
  assert.equal(act(C.improvementPrepare).ok, false);
  assert.equal(dailyActivity(sim.worldView(), me).used, before);
  ok(C.improvementTrial, { method: "rush" });
  assert.equal(improvementOf(sim.worldView())?.failures, 1);
  assert.equal(act(C.improvementTrial, { method: "balance" }).ok, false);
  sim.advanceBy(1); ok(C.improvementTrial, { method: "balance" });
  const manualCost = activityCostFor(sim.worldView(), me, C.drink);
  ok(C.improvementInstall);
  assert.equal(act(C.improvementInstall).ok, false);
  assert.equal(activityCostFor(sim.worldView(), me, C.drink), manualCost - 1);
  for (const id of ids) assert.notEqual(sim.worldView().getEntity(id)?.archivedAt, undefined);
  assert.equal((sim.worldView().getComponent(IMPROVEMENT_OBJECT, ObjectComponents.object)?.provenance as Record<string, unknown>)?.maker, me);
  const knows = sim.worldView().getComponent(me, "tech.mind")?.knows as Record<string, number>;
  assert.equal(knows["invention:shadoof"], 1);
  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true, JSON.stringify(loaded.result.errors));
  assert.equal(improvementOf(loaded.simulation!.worldView())?.stage, "installed");
  assert.equal(activityCostFor(loaded.simulation!.worldView(), me, C.drink), manualCost - 1);
  const jar = material(loaded.simulation!, me, "resource:jar")[0]!;
  const waterBefore = loaded.simulation!.worldView().getComponent("yield:place:river:resource:water", S.yieldPoint)?.stock;
  const usedBefore = dailyActivity(loaded.simulation!.worldView(), me).used;
  const filled = loaded.simulation!.dispatch({ type: C.drink, actorId: me, payload: { containerId: jar } });
  assert.ok(filled.ok, JSON.stringify(filled.errors));
  assert.equal(dailyActivity(loaded.simulation!.worldView(), me).used - usedBefore, manualCost - 1);
  assert.ok(Number(loaded.simulation!.worldView().getComponent("yield:place:river:resource:water", S.yieldPoint)?.stock) < Number(waterBefore));
});
test("cancel returns the exact objects once; missing or borrowed material cannot be consumed", () => {
  const h = setup(), { sim, me, ok, act, go } = h;
  ok(C.improvementStart); go("place:river");
  const before = dailyActivity(sim.worldView(), me).used;
  assert.equal(act(C.improvementPrepare).ok, false);
  assert.equal(dailyActivity(sim.worldView(), me).used, before);
  const ids = [...material(sim, me, "resource:wood", 2), ...material(sim, me, "resource:rope"), ...material(sim, me, "resource:stone")];
  ok(C.improvementPrepare); ok(C.improvementCancel);
  for (const id of ids) {
    assert.equal(ownerOf(sim.worldView(), id), me);
    assert.equal(sim.worldView().listRelations({ type: ObjectRelations.heldBy, from: id, to: me }).length, 1);
  }
  assert.equal(act(C.improvementCancel).ok, false);
  ok(C.improvementStart); ok(C.improvementPrepare);
});
test("teaching is face to face, changes tech's knowledge and cannot charge twice", () => {
  const h = setup(21), { sim, me, ok, act } = h;
  prepare(h); sim.advanceBy(1); ok(C.improvementTrial, { method: "balance" }); ok(C.improvementInstall);
  const learner = "settlement-locations:resident:water-carrier";
  const moved = sim.dispatch({ type: C.arrive, actorId: learner, source: "system", payload: { placeId: "place:river" } });
  assert.ok(moved.ok, JSON.stringify(moved.errors));
  ok(C.improvementTeach, { learnerId: learner });
  const before = dailyActivity(sim.worldView(), me).used;
  assert.equal(act(C.improvementTeach, { learnerId: learner }).ok, false);
  assert.equal(dailyActivity(sim.worldView(), me).used, before);
  const mind = sim.worldView().getComponent(learner, "tech.mind")?.knows as Record<string, number>;
  assert.equal(mind["invention:shadoof"], 1);
  const v = sim.worldView().getComponent("tech:village", "tech.village")?.invented as Record<string, any>;
  assert.equal(v["invention:shadoof"].by, me);
  assert.equal(improvementOf(sim.worldView())?.taught.length, 1);
});
test("history runs only at calendar boundaries, including automatic time and loading", () => {
  resetBridgeFailures(); const { sim, me } = setup();
  const first = sim.worldView().getComponent("tech:village", "tech.settlement-clock")!;
  historySeason(sim); historyDay(sim);
  assert.deepEqual(sim.worldView().getComponent("tech:village", "tech.settlement-clock"), first);
  for (let i = 0; i < 60; i++) sim.advanceBy(1);
  const clock = sim.worldView().getComponent("tech:village", "tech.settlement-clock")!;
  assert.equal(Number(clock.season), Number(first.season) + 1);
  assert.ok(Object.keys(sim.worldView().getComponent("tech:village", "tech.village")?.needs ?? {}).length > 0);
  const restored = Simulation.load(sim.save(), modules).simulation!;
  const saved = restored.worldView().getComponent("tech:village", "tech.village");
  historyDay(restored); historySeason(restored);
  assert.deepEqual(restored.worldView().getComponent("tech:village", "tech.village"), saved);
  assert.deepEqual(bridgeFailures(), []);
});
test("four route entries use real actions; action-triggered choices recall decisions three days later", () => {
  const { sim, me, ok, go } = setup();
  assert.deepEqual(storyPackProblems(), []);
  const progress = lifeRoutesOf(sim, me)!;
  assert.equal(progress.routes.length, 4);
  const s = { settlement: homestead(sim.worldView(), me), outlook: { progress } };
  assert.ok(searchIntent(s, "我想做衣服").length);
  assert.ok(searchIntent(s, "我想远行").length);
  assert.equal(choiceGroups(s).routes.length, 4);
  go("place:ford");
  const j = readJournal(sim.worldView(), me);
  assert.equal(j.scheduled[String(sim.tick + 1)], "life-route-travel");
  sim.advanceBy(1);
  ok(StoryCommands.resolveIncident, { incidentId: "life-route-travel", choiceId: "keep" });
  const after = readJournal(sim.worldView(), me);
  assert.equal(after.scheduled[String(sim.tick + 3)], "life-route-travel-after");
  sim.advanceBy(3);
  ok(StoryCommands.resolveIncident, { incidentId: "life-route-travel-after", choiceId: "continue" });
  assert.ok(readJournal(sim.worldView(), me).flags.includes("life-route:travel:remembered"));
});
test("building delivery and abandonment conserve stock; rejected deliveries leave stock unchanged", () => {
  const { sim, me } = setup();
  const stock = () => Number(sim.worldView().getComponent("yield:place:claypits:resource:clay", S.yieldPoint)?.stock);
  assert.ok(runBuildingAction(sim, me, BuildCommands.plan, { blueprintId: "blueprint:shed" }).ok);
  const before = stock();
  assert.equal(deliverMaterial(sim as never, me, "resource:fish").ok, false);
  assert.equal(stock(), before);
  assert.ok(deliverMaterial(sim as never, me, "resource:clay", 1).ok);
  assert.equal(stock(), before - 1);
  assert.equal(currentSite(sim.worldView())?.delivered["resource:clay"], 1);
  assert.ok(runBuildingAction(sim, me, BuildCommands.abandon, {}).ok);
  assert.equal(stock(), before);
  assert.equal(runBuildingAction(sim, me, BuildCommands.abandon, {}).ok, false);
  assert.equal(stock(), before);
});
