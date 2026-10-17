import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import { heredityModule, GENETICS, inbornCeilings, kinship, type Genome } from "@openlife/module-heredity";
import { fateModule } from "@openlife/module-fate";

const people: OpenLifeModule = {
  manifest: { id: "heredity-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "content-pack" },
  register(ctx) {
    ctx.registerCommand({ type: "heredity-fixture.spawn" });
    ctx.registerResolutionRule({
      id: "heredity-fixture.spawn.resolve", commandType: "heredity-fixture.spawn",
      resolve: (c) => [{ kind: "spawnEntity", localId: "p", id: String(c.command.payload.id), entityKind: "heredity-fixture.person", components: {} }],
    });
  },
};

function ok(r: { ok: boolean; errors: Array<{ code: string; message: string }> }) {
  assert.equal(r.ok, true, r.errors.map((e) => `${e.code}: ${e.message}`).join("; "));
}

function world(seed = 5, extra: OpenLifeModule[] = []) {
  const sim = new Simulation({ worldSeed: seed, modules: [people, heredityModule, ...extra] });
  sim.advanceTo(360 * 30);
  const spawn = (id: string) => ok(sim.dispatch({ type: "heredity-fixture.spawn", payload: { id } }));
  const genome = (id: string) => sim.worldView().getComponent(id, "heredity.genome") as unknown as Genome;
  const view = (id: string) => sim.project({ id: "heredity.person", params: { personId: id } }).data as any;
  return { sim, spawn, genome, view };
}

test("founders get a full genome; ceilings stay within 5..100 and honour hints", () => {
  const w = world();
  w.spawn("a"); w.spawn("b");
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "a", payload: { hints: { "trait:insight": "high" } } }));
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "b", payload: { hints: { "trait:insight": "low" } } }));
  for (const id of ["a", "b"]) {
    assert.equal(Object.keys(w.genome(id).loci).length, GENETICS.loci.length);
    for (const v of Object.values(w.view(id).reachable as Record<string, number>)) assert.ok(v >= 5 && v <= 100);
  }
  assert.ok(w.view("a").reachable["trait:insight"] > w.view("b").reachable["trait:insight"]);
  assert.equal(w.sim.dispatch({ type: "heredity.found", targetId: "a" }).errors[0]?.code, "E_HEREDITY_EXISTS");
});

test("children take one allele per locus from each parent", () => {
  const w = world(9);
  for (const id of ["m", "f", "c"]) w.spawn(id);
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "m" }));
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "f" }));
  ok(w.sim.dispatch({ type: "heredity.inherit", targetId: "c", payload: { motherId: "m", fatherId: "f" } }));
  const [m, f, c] = [w.genome("m"), w.genome("f"), w.genome("c")];
  assert.deepEqual(c.parents, ["m", "f"]);
  for (const locus of GENETICS.loci) {
    if (c.mutations.includes(locus.id)) continue;
    assert.ok(m.loci[locus.id]!.includes(c.loci[locus.id]![0]), locus.id);
    assert.ok(f.loci[locus.id]!.includes(c.loci[locus.id]![1]), locus.id);
  }
});

test("siblings' child is inbred and pays for it in constitution", () => {
  const parentsOf: Record<string, string[]> = { s1: ["m", "f"], s2: ["m", "f"] };
  const born = (id: string) => ({ m: 0, f: 0, s1: 10, s2: 11 } as Record<string, number>)[id] ?? 0;
  assert.equal(kinship("s1", "s2", (id) => parentsOf[id], born), 0.25);
  assert.equal(kinship("m", "f", (id) => parentsOf[id], born), 0);
  const base: Genome = {
    loci: Object.fromEntries(GENETICS.loci.map((l) => [l.id, [2, 2]])) as Genome["loci"], looks: {}, noise: {}, parents: [], inbreeding: 0,
    origin: "founder", population: "population:river-terrace", bornAt: 0, blessed: [], mutations: [],
  };
  assert.ok(inbornCeilings({ ...base, inbreeding: 0.25 })["trait:constitution"]! < inbornCeilings(base)["trait:constitution"]!);
});

test("childhood hunger trims the reachable ceiling for good; adult hunger does not", () => {
  const w = world(3);
  w.spawn("kid"); w.spawn("adult");
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "kid", payload: { bornAt: w.sim.worldView().tick - 360 } }));
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "adult" }));
  const before = w.view("kid").reachable["trait:strength"];
  ok(w.sim.dispatch({ type: "heredity.record_hunger", targetId: "kid", payload: { days: 200 } }));
  ok(w.sim.dispatch({ type: "heredity.record_hunger", targetId: "adult", payload: { days: 200 } }));
  assert.ok(w.view("kid").reachable["trait:strength"] < before);
  assert.equal(w.view("kid").inborn["trait:strength"], before);
  assert.equal(w.sim.worldView().getComponent("adult", "heredity.development"), undefined);
});

test("impressions never show numbers, and strangers only see looks", () => {
  const w = world(4);
  w.spawn("a");
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "a", payload: { hints: { "trait:dexterity": "high", "trait:insight": "high" } } }));
  const stranger = (w.sim.project({ id: "heredity.impression", params: { personId: "a", familiarity: "stranger" } }).data as any).lines as string[];
  const close = (w.sim.project({ id: "heredity.impression", params: { personId: "a", familiarity: "close" } }).data as any).lines as string[];
  assert.equal(stranger.length, 1);
  assert.ok(close.length > stranger.length);
  for (const line of close) assert.doesNotMatch(line, /\d/);
});

test("a fate blessing puts the next child of those parents at the tail, once, and is logged", () => {
  const w = world(11, [fateModule]);
  for (const id of ["m", "f", "c1", "c2"]) w.spawn(id);
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "m" }));
  ok(w.sim.dispatch({ type: "heredity.found", targetId: "f" }));
  assert.equal(w.sim.dispatch({ type: "fate.bless_birth", payload: { traits: ["trait:insight"] } }).errors[0]?.code, "E_FATE_OFF");
  ok(w.sim.dispatch({ type: "fate.configure", payload: { mode: "nudge", points: 2 } }));
  ok(w.sim.dispatch({ type: "fate.bless_birth", payload: { traits: ["trait:insight"], parentId: "m" } }));
  ok(w.sim.dispatch({ type: "heredity.inherit", targetId: "c1", payload: { motherId: "m", fatherId: "f" } }));
  ok(w.sim.dispatch({ type: "heredity.inherit", targetId: "c2", payload: { motherId: "m", fatherId: "f" } }));
  assert.deepEqual(w.genome("c1").blessed, ["trait:insight"]);
  assert.deepEqual(w.genome("c2").blessed, []);
  assert.ok(w.view("c1").inborn["trait:insight"] >= 95);
  const fate = w.sim.project({ id: "fate.state", params: {} }).data as any;
  assert.equal(fate.points, 0);
  assert.equal(fate.log.length, 1);
  assert.equal(w.sim.dispatch({ type: "fate.bless_birth", payload: { traits: ["trait:memory"] } }).errors[0]?.code, "E_FATE_POINTS");
});
