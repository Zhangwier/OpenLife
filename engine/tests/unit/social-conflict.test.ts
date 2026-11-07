import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { socialConflictModule } from "@openlife/module-social-conflict";
import { Simulation } from "@openlife/simulation";

const people: OpenLifeModule = {
  manifest: { id: "conflict-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "content-pack" },
  register(ctx) {
    ctx.registerCommand({ type: "conflict-fixture.spawn" });
    ctx.registerResolutionRule({
      id: "conflict-fixture.spawn.resolve",
      commandType: "conflict-fixture.spawn",
      resolve: (c) => [{ kind: "spawnEntity", localId: "p", id: String(c.command.payload.id), entityKind: "conflict-fixture.person", components: {} }],
    });
  },
};

function ok(result: { ok: boolean; errors: Array<{ code: string; message: string }> }) {
  assert.equal(result.ok, true, result.errors.map((e) => `${e.code}: ${e.message}`).join("; "));
}

function setup() {
  const sim = new Simulation({ worldSeed: 3, modules: [people, socialConflictModule] });
  for (const id of ["a", "b", "heir"]) ok(sim.dispatch({ type: "conflict-fixture.spawn", payload: { id } }));
  const grievance = (holderId: string, target: string) =>
    (sim.project({ id: "social-conflict.grievances", params: { holderId } }).data as any).byTarget[target];
  const wrong = (cause: string, severity: number) =>
    ok(sim.dispatch({ type: "social-conflict.record_grievance", actorId: "a", targetId: "b", payload: { cause, severity } }));
  return { sim, grievance, wrong };
}

test("grievances escalate quarrel -> feud -> vendetta and keep their causes", () => {
  const s = setup();
  s.wrong("stole_grain", 0.2);
  assert.equal(s.grievance("a", "b").stage, "quarrel");
  s.wrong("diverted_water", 0.3);
  assert.equal(s.grievance("a", "b").stage, "feud");
  s.wrong("burned_hut", 0.4);
  assert.equal(s.grievance("a", "b").stage, "vendetta");
  assert.deepEqual(s.grievance("a", "b").causes.map((c: any) => c.cause), ["stole_grain", "diverted_water", "burned_hut"]);
});

test("a vendetta needs mediation; amends can fully reconcile", () => {
  const s = setup();
  s.wrong("burned_hut", 0.8);
  const apology = s.sim.dispatch({ type: "social-conflict.make_amends", actorId: "b", targetId: "a", payload: { gesture: "apology" } });
  assert.equal(apology.errors[0]?.code, "E_CONFLICT_TOO_DEEP");
  ok(s.sim.dispatch({ type: "social-conflict.make_amends", actorId: "b", targetId: "a", payload: { gesture: "mediation" } }));
  assert.equal(s.grievance("a", "b").stage, "feud");
  ok(s.sim.dispatch({ type: "social-conflict.make_amends", actorId: "b", targetId: "a", payload: { gesture: "gift" } }));
  ok(s.sim.dispatch({ type: "social-conflict.make_amends", actorId: "b", targetId: "a", payload: { gesture: "apology" } }));
  assert.equal(s.grievance("a", "b"), undefined);
});

test("serious grievances are inherited at reduced intensity; small quarrels are not", () => {
  const s = setup();
  s.wrong("burned_hut", 0.8);
  ok(s.sim.dispatch({ type: "social-conflict.inherit_grievances", actorId: "heir", targetId: "a" }));
  const inherited = s.grievance("heir", "b");
  assert.equal(inherited.stage, "feud");
  assert.equal(inherited.causes[0].inheritedFrom, "a");
});
