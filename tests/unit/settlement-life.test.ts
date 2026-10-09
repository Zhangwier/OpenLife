import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";
import { practiceRuntimeModule } from "@openlife/module-practice-runtime";
import { craftPotteryModule } from "@openlife/module-craft-pottery";
import { settlementLifeModule, Life } from "@openlife/module-settlement-life";
import { runPlayerAction, playerView } from "../../apps/web/src/player.ts";

const modules = [modernWorldModule, familyModule, earlyCivilizationModule, practiceRuntimeModule, craftPotteryModule, settlementLifeModule];
function setup(seed = 104) {
  const sim = new Simulation({ worldSeed: seed, modules });
  assert.equal(sim.dispatch({ type: "modern.initialize_world" }).ok, true);
  assert.equal(sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } }).ok, true);
  sim.advanceBy(16 * 12);
  const id = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  act(sim, id, "life-enter");
  return { sim, id };
}
function act(sim: Simulation, id: string, action: string, payload: Record<string, unknown> = {}) {
  const result = runPlayerAction(sim, id, action, payload);
  assert.equal(result.ok, true, result.errors.map(e => e.message).join("; "));
}
function makeVessel(sim: Simulation, id: string, route = ["screen-and-knead", "coil-balanced", "slow-shade", "staged-preheat"]) {
  act(sim, id, "pottery-start");
  for (const actionId of route) {
    const interaction = playerView(sim, id).practice?.interaction as Record<string, any>;
    assert.ok(interaction);
    act(sim, id, "pottery-choice", { checkpointId: interaction.checkpointId, actionId });
  }
  assert.equal(playerView(sim, id).practice, null);
  return playerView(sim, id).vessels.at(-1);
}
function family(sim: Simulation, id: string) {
  sim.advanceBy(2 * 12);
  const peer = playerView(sim, id).people.find((p: { name: string }) => p.name === "阿予").id;
  act(sim, id, "life-help", { targetId: peer });
  act(sim, id, "life-visit", { targetId: peer });
  act(sim, id, "life-marry", { targetId: peer });
  act(sim, id, "life-child");
  return playerView(sim, id).children[0].id;
}

test("settlement actions reserve time; same-tick direct commands cannot repeat rewards", () => {
  const { sim, id } = setup();
  const command = { type: "settlement-life.choose", actorId: id, payload: { choice: "gather-fuel" } };
  assert.equal(sim.dispatch(command).ok, true);
  const stock = playerView(sim, id).inventory.fuel;
  assert.equal(sim.dispatch(command).ok, false);
  assert.equal(playerView(sim, id).inventory.fuel, stock);
  sim.advanceBy(1);
  assert.equal(sim.dispatch(command).ok, true);
});

test("craft needs learning and legacy needs practiced work kept for the family", () => {
  const { sim, id } = setup();
  assert.equal(runPlayerAction(sim, id, "pottery-start").ok, false);
  assert.equal(runPlayerAction(sim, id, "life-legacy").ok, false);
  act(sim, id, "life-study");
  const vessel = makeVessel(sim, id);
  assert.equal(runPlayerAction(sim, id, "life-legacy").ok, false);
  act(sim, id, "life-dispose", { vesselId: vessel.id, mode: "keep" });
  assert.equal(runPlayerAction(sim, id, "life-legacy").ok, false);
  act(sim, id, "life-study");
  act(sim, id, "life-legacy");
  assert.ok(sim.worldView().getComponent(id, "early-civilization.legacy"));
});

test("finished pottery has one destination; another actor cannot claim it", () => {
  const { sim, id } = setup(); act(sim, id, "life-study");
  const vessel = makeVessel(sim, id);
  act(sim, id, "life-dispose", { vesselId: vessel.id, mode: "exchange" });
  const stock = playerView(sim, id).inventory;
  assert.equal(runPlayerAction(sim, id, "life-dispose", { vesselId: vessel.id, mode: "keep" }).ok, false);
  assert.deepEqual(playerView(sim, id).inventory, stock);
  const peer = playerView(sim, id).people[0].id;
  assert.equal(sim.dispatch({ type: "settlement-life.dispose", actorId: peer, payload: { vesselId: vessel.id, mode: "exchange" } }).ok, false);
});

test("craft blocks competing work and a resolved checkpoint cannot be reused", () => {
  const { sim, id } = setup(); act(sim, id, "life-study"); act(sim, id, "pottery-start");
  assert.equal(runPlayerAction(sim, id, "life-study").ok, false);
  assert.equal(runPlayerAction(sim, id, "pottery-start").ok, false);
  const checkpointId = playerView(sim, id).practice?.interaction.checkpointId;
  act(sim, id, "pottery-choice", { checkpointId, actionId: "screen-and-knead" });
  const tick = sim.tick;
  assert.equal(runPlayerAction(sim, id, "pottery-choice", { checkpointId, actionId: "screen-and-knead" }).ok, false);
  assert.equal(sim.tick, tick);
});

test("material choices affect the actual vessel and failure permits another attempt", () => {
  const good = setup(), bad = setup();
  act(good.sim, good.id, "life-study"); act(bad.sim, bad.id, "life-study");
  const a = makeVessel(good.sim, good.id);
  const b = makeVessel(bad.sim, bad.id, ["knead-now", "thick-storage", "sun-fast", "hot-fast"]);
  assert.notEqual(a.score, b.score);
  assert.ok(a.score > b.score);
  assert.equal(b.status, "failed");
  act(bad.sim, bad.id, "life-gather-clay"); act(bad.sim, bad.id, "life-gather-fuel");
  act(bad.sim, bad.id, "pottery-start");
  assert.ok(playerView(bad.sim, bad.id).practice);
});

test("marriage requires an adult known person; birth occurs after nine months and cannot repeat immediately", () => {
  const { sim, id } = setup();
  assert.equal(runPlayerAction(sim, id, "life-marry", { targetId: playerView(sim, id).people[1].id }).ok, false);
  const child = family(sim, id);
  const born = Number(sim.worldView().getComponent(child, "modern.identity")?.bornAt);
  assert.equal(born, sim.tick);
  assert.equal(sim.worldView().getComponent(id, Life.state)?.expectingAt, 0);
  assert.equal(runPlayerAction(sim, id, "life-child").ok, false);
  assert.equal(sim.dispatch({ type: "family.have_child", actorId: id }).ok, false);
  sim.advanceBy(12);
  act(sim, id, "life-child");
  const children = playerView(sim, id).children;
  assert.equal(children.length, 2);
  assert.notEqual(children[0].name, children[1].name);
});

test("a scheduled birth does not occur early and cancels if the partner dies", () => {
  const { sim, id } = setup(); sim.advanceBy(24);
  const peer = playerView(sim, id).people.find((p: { name: string }) => p.name === "阿予").id;
  act(sim, id, "life-help", { targetId: peer }); act(sim, id, "life-visit", { targetId: peer }); act(sim, id, "life-marry", { targetId: peer });
  const startedAt = sim.tick;
  assert.equal(sim.dispatch({ type: "settlement-life.choose", actorId: id, payload: { choice: "plan-child" } }).ok, true);
  sim.advanceBy(8);
  assert.equal(playerView(sim, id).children.length, 0);
  assert.equal(sim.dispatch({ type: "family.have_child", actorId: id }).ok, false);
  assert.equal(sim.dispatch({ type: "modern.die", actorId: peer }).ok, true);
  sim.advanceTo(startedAt + 9);
  assert.equal(playerView(sim, id).children.length, 0);
  assert.equal(sim.worldView().getComponent(id, Life.state)?.expectingAt, 0);
});

test("handoff requires an adult child, keeps the parent alive and inherits real family works", () => {
  const { sim, id } = setup(); act(sim, id, "life-study");
  const vessel = makeVessel(sim, id); act(sim, id, "life-dispose", { vesselId: vessel.id, mode: "keep" });
  act(sim, id, "life-gather-fuel");
  const child = family(sim, id);
  assert.equal(runPlayerAction(sim, id, "life-handoff", { targetId: child }).ok, false);
  sim.advanceBy(18 * 12);
  act(sim, id, "life-handoff", { targetId: child });
  assert.equal(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId, child);
  assert.equal(sim.worldView().getEntity(id)?.archivedAt, undefined);
  assert.deepEqual(playerView(sim, child).familyWorks, [vessel.id]);
  assert.equal(playerView(sim, child).lessons, 1);
  assert.equal(runPlayerAction(sim, id, "life-study").ok, false);
});

test("save/load at a pending choice preserves decisions and resumes deterministically", () => {
  const { sim, id } = setup(); act(sim, id, "life-study"); act(sim, id, "pottery-start");
  const loaded = Simulation.load(sim.save(), modules);
  assert.equal(loaded.result.ok, true);
  const other = loaded.simulation!;
  assert.deepEqual(playerView(other, id), playerView(sim, id));
  const payload = { checkpointId: playerView(sim, id).practice?.interaction.checkpointId, actionId: "screen-and-knead" };
  act(sim, id, "pottery-choice", payload); act(other, id, "pottery-choice", payload);
  assert.equal(sim.fingerprint(), other.fingerprint());
});

test("the same seed and player life choices reproduce the world", () => {
  const play = () => {
    const { sim, id } = setup(785); act(sim, id, "life-study");
    const vessel = makeVessel(sim, id); act(sim, id, "life-dispose", { vesselId: vessel.id, mode: "keep" });
    act(sim, id, "life-gather-fuel"); const child = family(sim, id); sim.advanceBy(18 * 12); act(sim, id, "life-handoff", { targetId: child });
    return sim.fingerprint();
  };
  assert.equal(play(), play());
});

test("an unfinished practice cannot trap a deceased parent or let the dead resolve its choices", () => {
  const { sim, id } = setup();
  const child = family(sim, id); sim.advanceBy(18 * 12);
  act(sim, id, "life-study"); act(sim, id, "pottery-start");
  const checkpointId = playerView(sim, id).practice?.interaction.checkpointId;
  assert.equal(sim.dispatch({ type: "modern.die", actorId: id }).ok, true);
  assert.equal(runPlayerAction(sim, id, "pottery-choice", { checkpointId, actionId: "screen-and-knead" }).ok, false);
  assert.equal(playerView(sim, id).practice, null);
  act(sim, id, "life-handoff", { targetId: child });
  assert.equal(playerView(sim, child).entered, true);
});

test("old world saves load without enrollment and entering keeps their clock and identity", () => {
  const oldModules = [modernWorldModule, familyModule, earlyCivilizationModule];
  const old = new Simulation({ worldSeed: 17, modules: oldModules });
  old.dispatch({ type: "modern.initialize_world" });
  old.dispatch({ type: "modern.create_character", payload: { givenName: "旧", familyName: "禾" } });
  old.advanceBy(20 * 12);
  const id = String(old.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  const restored = Simulation.load(old.save(), modules);
  assert.equal(restored.result.ok, true);
  const sim = restored.simulation!;
  assert.equal(playerView(sim, id).entered, false);
  act(sim, id, "life-enter");
  assert.equal(sim.tick, old.tick);
  assert.deepEqual(sim.worldView().getComponent(id, "modern.identity"), old.worldView().getComponent(id, "modern.identity"));
});

test("accumulated experience changes actual clay state for the next practice", () => {
  const novice = setup(), experienced = setup();
  act(novice.sim, novice.id, "life-study");
  for (let i = 0; i < 3; i++) act(experienced.sim, experienced.id, "life-study");
  act(novice.sim, novice.id, "pottery-start"); act(experienced.sim, experienced.id, "pottery-start");
  const clay = (sim: Simulation, id: string) => (sim.worldView().getComponent(playerView(sim, id).practiceId, "practice-runtime.practice")?.context as Record<string, any>).clay;
  assert.ok(clay(experienced.sim, experienced.id).uniformity > clay(novice.sim, novice.id).uniformity);
  assert.ok(clay(experienced.sim, experienced.id).impurities < clay(novice.sim, novice.id).impurities);
});
