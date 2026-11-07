import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import {
  craftPotteryModule,
  PotteryComponents,
  PotteryKinds,
  PotteryPracticeDefinitions,
  PotteryProcesses,
  PotteryResources,
} from "@openlife/module-craft-pottery";
import {
  practiceRuntimeModule,
  PracticeComponents,
  PracticeKinds,
} from "@openlife/module-practice-runtime";
import { Simulation } from "@openlife/simulation";

const actorFixture: OpenLifeModule = {
  manifest: {
    id: "pottery-fixture",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
  },
  register(ctx) {
    ctx.registerComponent({ id: "pottery-fixture.actor", persist: true });
    ctx.registerCommand({ type: "pottery-fixture.spawn_actor" });
    ctx.registerResolutionRule({
      id: "pottery-fixture.spawn_actor.resolve",
      commandType: "pottery-fixture.spawn_actor",
      resolve: () => [{
        kind: "spawnEntity",
        localId: "actor",
        entityKind: "pottery-fixture.actor",
        components: { "pottery-fixture.actor": { name: "Potter" } },
        announce: false,
      }],
    });
  },
};

function must(simulation: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = simulation.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => `${error.code}: ${error.message}`).join("; "));
}

function createSimulation(seed = 15001) {
  const simulation = new Simulation({
    worldSeed: seed,
    modules: [practiceRuntimeModule, craftPotteryModule, actorFixture],
  });
  must(simulation, { type: "pottery-fixture.spawn_actor" });
  const actorId = simulation.worldView().listEntities({ kind: "pottery-fixture.actor" })[0]!.id;
  return { simulation, actorId };
}

function setupClayOnly(seed = 15001, clay: Record<string, unknown> = {}) {
  const { simulation, actorId } = createSimulation(seed);
  must(simulation, {
    type: "practice-runtime.start",
    actorId,
    payload: {
      definitionId: PotteryPracticeDefinitions.prepareClay,
      goal: "prepare clay for a vessel",
      context: { clay: clay as never },
      decisionMode: "manual",
    },
  });
  simulation.advanceBy(1);
  const practice = simulation.worldView().listEntities({ kind: PracticeKinds.practice })[0]!;
  const state = simulation.worldView().getComponent(practice.id, PracticeComponents.practice) ?? {};
  return { simulation, actorId, practiceId: practice.id, checkpointId: String(state.activeCheckpointId ?? "") };
}

function setupVessel(
  seed: number,
  fuel = 4,
  clay: Record<string, unknown> = {
    moisture: 0.76,
    impurities: 0.55,
    uniformity: 0.45,
    plasticity: 0.72,
    materialMass: 1,
    hasSieve: true,
    hasDryClay: false,
  },
) {
  const { simulation, actorId } = createSimulation(seed);
  must(simulation, {
    type: "craft-pottery.prepare_materials",
    actorId,
    payload: { clay: 1, fuel },
  });
  must(simulation, {
    type: "practice-runtime.start",
    actorId,
    payload: {
      definitionId: PotteryPracticeDefinitions.makeVessel,
      goal: "make one useful ceramic vessel",
      context: { clay: clay as never },
      role: "potter",
      decisionMode: "manual",
    },
  });
  const practice = simulation.worldView().listEntities({ kind: PracticeKinds.practice }).find((entity) =>
    entity.components[PracticeComponents.practice]?.definitionId === PotteryPracticeDefinitions.makeVessel
  )!;
  return { simulation, actorId, practiceId: practice.id };
}

function nextInteraction(simulation: Simulation, actorId: string, practiceId: string) {
  simulation.advanceBy(1);
  const view = simulation.project({
    id: "practice-runtime.interaction",
    params: { practiceId, participantId: actorId },
  });
  const interaction = view.data?.interaction as Record<string, any> | null;
  assert.ok(interaction, "expected an active player interaction");
  assert.equal(interaction.canResolve, true);
  return interaction;
}

function choose(simulation: Simulation, actorId: string, interaction: Record<string, any>, actionId: string) {
  must(simulation, {
    type: "practice-runtime.resolve_checkpoint",
    actorId,
    targetId: String(interaction.checkpointId),
    payload: { checkpointId: String(interaction.checkpointId), actionId },
  });
}

function completeVessel(seed: number, path: [string, string, string, string], fuel = 4) {
  const { simulation, actorId, practiceId } = setupVessel(seed, fuel);
  for (const actionId of path) {
    const interaction = nextInteraction(simulation, actorId, practiceId);
    choose(simulation, actorId, interaction, actionId);
  }
  simulation.advanceBy(1);
  const vessel = simulation.worldView().listEntities({ kind: PotteryKinds.vessel })[0]!;
  assert.ok(vessel);
  return { simulation, actorId, practiceId, vessel };
}

test("clay preparation exposes several meaningful player choices and keeps unavailable choices visible", () => {
  const { simulation, actorId, checkpointId } = setupClayOnly();
  const checkpoint = simulation.worldView().getComponent(checkpointId, PracticeComponents.checkpoint) ?? {};
  const actions = checkpoint.candidateActions as Array<Record<string, unknown>>;

  assert.equal(checkpoint.type, "clay-preparation-choice");
  assert.equal(actions.length, 5);
  assert.ok(actions.every((action) => typeof action.hint === "string" && String(action.hint).length > 0));
  assert.equal(actions.filter((action) => action.enabled !== false).length, 4);

  const dryClay = actions.find((action) => action.id === "blend-dry-clay");
  assert.equal(dryClay?.enabled, false);
  assert.match(String(dryClay?.disabledReason), /没有额外的较干泥料/);

  const disabled = simulation.dispatch({
    type: "practice-runtime.resolve_checkpoint",
    actorId,
    targetId: checkpointId,
    payload: { checkpointId, actionId: "blend-dry-clay" },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.errors[0]?.code, "E_CHECKPOINT_ACTION_DISABLED");
});

test("different clay-preparation choices persist different tradeoffs for later pottery stages", () => {
  const dryRun = setupClayOnly(15002);
  choose(dryRun.simulation, dryRun.actorId, { checkpointId: dryRun.checkpointId }, "air-dry-first");
  const dryState = dryRun.simulation.worldView().getComponent(dryRun.practiceId, PracticeComponents.practice) ?? {};
  const dryContext = dryState.context as Record<string, any>;

  const screenedRun = setupClayOnly(15003);
  choose(screenedRun.simulation, screenedRun.actorId, { checkpointId: screenedRun.checkpointId }, "screen-and-knead");
  const screenedState = screenedRun.simulation.worldView().getComponent(screenedRun.practiceId, PracticeComponents.practice) ?? {};
  const screenedContext = screenedState.context as Record<string, any>;

  assert.equal(dryState.stage, "prepared");
  assert.equal(screenedState.stage, "prepared");
  assert.ok(dryContext.clay.moisture < screenedContext.clay.moisture);
  assert.ok(screenedContext.clay.impurities < dryContext.clay.impurities);
  assert.ok(screenedContext.clay.materialMass < dryContext.clay.materialMass);
  assert.notDeepEqual(dryContext.clayPreparation.downstreamRisks, screenedContext.clayPreparation.downstreamRisks);
});

test("forming exposes six real routes and material quality can disable ambitious shapes without hiding them", () => {
  const poorClay = {
    moisture: 0.82,
    impurities: 0.5,
    uniformity: 0.1,
    plasticity: 0.4,
    materialMass: 1,
    hasSieve: true,
    hasDryClay: false,
  };
  const poor = setupVessel(15004, 4, poorClay);
  const clayStep = nextInteraction(poor.simulation, poor.actorId, poor.practiceId);
  choose(poor.simulation, poor.actorId, clayStep, "air-dry-first");
  const forming = nextInteraction(poor.simulation, poor.actorId, poor.practiceId);

  assert.equal(forming.type, "pottery-forming-choice");
  assert.equal(forming.actions.length, 6);
  assert.ok(forming.actions.every((action: Record<string, unknown>) => String(action.hint ?? "").length > 0));
  assert.ok(forming.actions.some((action: Record<string, unknown>) => action.id === "reinforced-base"));

  const thin = forming.actions.find((action: Record<string, unknown>) => action.id === "thin-refined");
  const narrow = forming.actions.find((action: Record<string, unknown>) => action.id === "narrow-neck");
  assert.equal(thin.enabled, false);
  assert.match(String(thin.disabledReason), /不够均匀或可塑/);
  assert.equal(narrow.enabled, false);
  assert.match(String(narrow.disabledReason), /含水、均匀性或可塑性不足/);
});

test("forming choices persist different capacity, durability, weight and drying burdens", () => {
  const readyClay = {
    moisture: 0.62,
    impurities: 0.18,
    uniformity: 0.72,
    plasticity: 0.76,
    materialMass: 1,
    hasSieve: true,
    hasDryClay: false,
  };

  const run = (seed: number, actionId: string) => {
    const setup = setupVessel(seed, 4, readyClay);
    const clayStep = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, clayStep, "screen-and-knead");
    const forming = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    assert.equal(forming.actions.length, 6);
    choose(setup.simulation, setup.actorId, forming, actionId);
    const state = setup.simulation.worldView().getComponent(setup.practiceId, PracticeComponents.practice) ?? {};
    assert.equal(state.stage, "drying");
    return (state.context as Record<string, any>).forming;
  };

  const balanced = run(15005, "coil-balanced");
  const reinforced = run(15006, "reinforced-base");
  const storage = run(15007, "thick-storage");

  assert.ok(reinforced.durability > balanced.durability, "reinforcing should improve durability");
  assert.ok(reinforced.weight > balanced.weight, "reinforcing should add weight");
  assert.ok(reinforced.dryingRisk > balanced.dryingRisk, "a thicker base should be harder to dry evenly");
  assert.ok(storage.capacity > balanced.capacity, "the storage route should gain capacity");
  assert.ok(storage.weight > reinforced.weight, "thick storage should be the heaviest route here");
  assert.ok(storage.dryingRisk > reinforced.dryingRisk, "thick storage walls should impose the largest drying burden");
});

test("drying shows kiln readiness and keeps immediate kiln entry visible when the body is still too wet", () => {
  const setup = setupVessel(15008, 4);
  const clayStep = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
  choose(setup.simulation, setup.actorId, clayStep, "knead-now");
  const forming = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
  choose(setup.simulation, setup.actorId, forming, "thick-storage");
  const drying = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);

  assert.equal(drying.type, "pottery-drying-choice");
  assert.equal(drying.actions.length, 6);
  assert.ok(Number(drying.context.initialResidualMoisture) > 0.48);
  assert.equal(drying.context.kilnReadiness, "too-wet-or-unstable");

  const kilnNow = drying.actions.find((action: Record<string, unknown>) => action.id === "kiln-now");
  assert.ok(kilnNow, "immediate kiln entry should remain visible as a possibility");
  assert.equal(kilnNow.enabled, false);
  assert.match(String(kilnNow.disabledReason), /偏湿|风险过高/);
});

test("drying strategies persist different residual moisture, gradients, warping risk and time costs", () => {
  const run = (seed: number, dryingAction: string) => {
    const setup = setupVessel(seed, 4);
    const clayStep = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, clayStep, "air-dry-first");
    const forming = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, forming, "coil-balanced");
    const drying = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, drying, dryingAction);
    const state = setup.simulation.worldView().getComponent(setup.practiceId, PracticeComponents.practice) ?? {};
    assert.equal(state.stage, "firing");
    return (state.context as Record<string, any>).drying;
  };

  const slow = run(15009, "slow-shade");
  const sun = run(15012, "sun-fast");
  const hearth = run(15013, "near-hearth");
  const extended = run(15014, "extended-rest");

  assert.ok(extended.residualMoisture < slow.residualMoisture, "extended drying should remove the most remaining moisture");
  assert.ok(slow.residualMoisture < sun.initialResidualMoisture, "slow drying should materially reduce residual moisture");
  assert.ok(sun.moistureGradient > slow.moistureGradient, "sun drying should create a larger moisture gradient");
  assert.ok(hearth.warpingRisk > sun.warpingRisk, "near-hearth drying should carry the highest local warping risk here");
  assert.ok(extended.dryingTime > slow.dryingTime, "extra stability should cost more time");
  assert.ok(sun.dryingTime < slow.dryingTime, "sun drying should be faster than slow shade drying");
});

test("firing exposes five heat-control routes and shows the inherited body condition before the player commits", () => {
  const setup = setupVessel(15015, 3);
  const clay = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
  choose(setup.simulation, setup.actorId, clay, "screen-and-knead");
  const forming = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
  choose(setup.simulation, setup.actorId, forming, "coil-balanced");
  const drying = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
  choose(setup.simulation, setup.actorId, drying, "slow-shade");
  const firing = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);

  assert.equal(firing.type, "pottery-firing-choice");
  assert.equal(firing.actions.length, 5);
  assert.ok(Number.isFinite(Number(firing.context.residualMoisture)));
  assert.ok(Number.isFinite(Number(firing.context.moistureGradient)));
  assert.ok(Number.isFinite(Number(firing.context.warpingRisk)));
  assert.ok(["stable", "caution", "fragile"].includes(String(firing.context.bodyCondition)));
  assert.ok(firing.actions.some((action: Record<string, unknown>) => action.id === "staged-preheat"));

  const hotFast = firing.actions.find((action: Record<string, unknown>) => action.id === "hot-fast");
  assert.equal(hotFast.enabled, false, "high-fire fast route stays visible when fuel is insufficient");
  assert.match(String(hotFast.disabledReason), /4 份燃料/);
});

test("firing strategy amplifies or mitigates moisture and gradient inherited from drying", () => {
  const run = (seed: number, dryingAction: string, firingAction: string) => {
    const setup = setupVessel(seed, 4);
    const clay = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, clay, "screen-and-knead");
    const forming = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, forming, "coil-balanced");
    const drying = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, drying, dryingAction);
    const firing = nextInteraction(setup.simulation, setup.actorId, setup.practiceId);
    choose(setup.simulation, setup.actorId, firing, firingAction);
    const state = setup.simulation.worldView().getComponent(setup.practiceId, PracticeComponents.practice) ?? {};
    return (state.context as Record<string, any>).firing;
  };

  const wellDriedFast = run(15016, "slow-shade", "hot-fast");
  const unevenFast = run(15017, "sun-fast", "hot-fast");
  const unevenPreheated = run(15018, "sun-fast", "staged-preheat");

  assert.ok(unevenFast.inheritedMoistureGradient > wellDriedFast.inheritedMoistureGradient);
  assert.ok(unevenFast.firingRisk > wellDriedFast.firingRisk, "the same fast firing should punish uneven drying");
  assert.ok(unevenPreheated.firingRisk < unevenFast.firingRisk, "staged preheating should mitigate inherited moisture instability");
  assert.ok(unevenFast.quality > unevenPreheated.quality, "fast high heat keeps a higher upside while carrying more risk");
  assert.ok(unevenFast.firingTime < unevenPreheated.firingTime, "the risky route should also be faster");
});

test("the full vessel Practice gives the player repeated meaningful choices instead of auto-playing the craft", () => {
  const { simulation, actorId, practiceId } = setupVessel(15010, 3);

  const clay = nextInteraction(simulation, actorId, practiceId);
  assert.equal(clay.type, "clay-preparation-choice");
  assert.equal(clay.actions.length, 5);
  assert.ok(clay.actions.every((action: Record<string, unknown>) => String(action.hint ?? "").length > 0));
  choose(simulation, actorId, clay, "screen-and-knead");

  const forming = nextInteraction(simulation, actorId, practiceId);
  assert.equal(forming.type, "pottery-forming-choice");
  assert.ok(forming.actions.length >= 5, "forming should expose several materially different shapes");
  assert.ok(forming.actions.every((action: Record<string, unknown>) => String(action.hint ?? "").length > 0));
  const narrowNeck = forming.actions.find((action: Record<string, unknown>) => action.id === "narrow-neck");
  assert.ok(narrowNeck, "ambitious shapes should stay visible even when material conditions make them unavailable");
  choose(simulation, actorId, forming, "coil-balanced");

  const drying = nextInteraction(simulation, actorId, practiceId);
  assert.equal(drying.type, "pottery-drying-choice");
  assert.equal(drying.actions.length, 6);
  assert.ok(drying.actions.every((action: Record<string, unknown>) => String(action.hint ?? "").length > 0));
  choose(simulation, actorId, drying, "slow-shade");

  const firing = nextInteraction(simulation, actorId, practiceId);
  assert.equal(firing.type, "pottery-firing-choice");
  assert.equal(firing.actions.length, 5);
  const hotFast = firing.actions.find((action: Record<string, unknown>) => action.id === "hot-fast");
  assert.equal(hotFast.enabled, false, "the expensive option should remain visible when fuel is insufficient");
  assert.match(String(hotFast.disabledReason), /4 份燃料/);
  assert.equal(firing.actions.find((action: Record<string, unknown>) => action.id === "gradual-hot")?.enabled, true);
});

test("Resource and Process definitions describe the material chain while choices determine the actual artifact", () => {
  const simulation = createSimulation(15011).simulation;
  for (const id of Object.values(PotteryResources)) assert.equal(simulation.definitions.resources.has(id), true, id);
  for (const id of Object.values(PotteryProcesses)) assert.equal(simulation.definitions.processes.has(id), true, id);

  const firing = simulation.definitions.processes.get(PotteryProcesses.fireVessel);
  assert.equal(firing?.consumes?.[PotteryResources.fuel], 3);
  assert.equal(firing?.produces?.[PotteryResources.pottery], 1);
});

test("safe and risky four-step player decisions produce materially different vessel outcomes", () => {
  const safe = completeVessel(
    15020,
    ["screen-and-knead", "coil-balanced", "slow-shade", "gradual-hot"],
    4,
  );
  const risky = completeVessel(
    15020,
    ["knead-now", "thick-storage", "sun-fast", "hot-fast"],
    4,
  );

  const safeState = safe.vessel.components[PotteryComponents.vessel] ?? {};
  const riskyState = risky.vessel.components[PotteryComponents.vessel] ?? {};
  assert.ok(Number(safeState.score) > Number(riskyState.score));
  assert.notEqual(safeState.quality, riskyState.quality);
  assert.ok((riskyState.defects as unknown[]).length > (safeState.defects as unknown[]).length);
  assert.deepEqual(safeState.processTrace, [
    PotteryProcesses.prepareClay,
    PotteryProcesses.formVessel,
    PotteryProcesses.dryVessel,
    PotteryProcesses.fireVessel,
  ]);

  const safeStock = safe.simulation.worldView().getComponent(safe.actorId, PotteryComponents.inventory) ?? {};
  assert.equal(safeStock.clay, 0);
  assert.equal(safeStock.fuel, 1, "gradual-hot should consume three of four fuel bundles");
});
