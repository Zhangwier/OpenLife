import { test } from "node:test";
import assert from "node:assert/strict";
import type { OpenLifeModule } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import { techModule, loadBaseTechContent, validateTechContent, mergeTechContent, sparkChance, emptyMind, emptyVillage, type Mind, type SeasonContext } from "@openlife/module-tech";

const people: OpenLifeModule = {
  manifest: { id: "tech-fixture", version: "0.1.0", engineRange: "^0.1.0", type: "content-pack" },
  register(ctx) {
    ctx.registerCommand({ type: "tech-fixture.spawn" });
    ctx.registerResolutionRule({
      id: "tech-fixture.spawn.resolve", commandType: "tech-fixture.spawn",
      resolve: (c) => [{ kind: "spawnEntity", localId: "p", id: String(c.command.payload.id), entityKind: "tech-fixture.person", components: {} }],
    });
  },
};
function ok(r: { ok: boolean; errors: Array<{ code: string; message: string }> }) {
  assert.equal(r.ok, true, r.errors.map((e) => `${e.code}: ${e.message}`).join("; "));
}
function village(seed: number, ids: string[], knows: Record<string, string[]> = {}) {
  const sim = new Simulation({ worldSeed: seed, modules: [people, techModule] });
  for (const id of ids) ok(sim.dispatch({ type: "tech-fixture.spawn", payload: { id } }));
  ok(sim.dispatch({ type: "tech.found", payload: { capabilities: ["cap:pottery"], members: ids, knows } }));
  const mind = (id: string) => sim.worldView().getComponent(id, "tech.mind") as unknown as Mind;
  const view = () => sim.project({ id: "tech.village", params: {} }).data as any;
  return { sim, mind, view };
}

test("the base tech graph is sound, and content packs may only add namespaced entries", () => {
  const base = loadBaseTechContent();
  assert.deepEqual(validateTechContent(base), []);
  assert.ok(base.theories.some((t) => t.truth < 0.2), "there are wrong theories");
  assert.ok(base.inventions.length >= 20);
  const merged = mergeTechContent(base, { inventions: [{ ...base.inventions[0]!, id: "invention:reed_baskets.creel", name: "鱼篓" }] }, "reed_baskets");
  assert.equal(merged.inventions.length, base.inventions.length + 1);
  assert.throws(() => mergeTechContent(base, { inventions: [{ ...base.inventions[0]! }] }, "reed_baskets"), /must be new/);
});

test("a pressing need, an aptitude and a right principle all raise the odds of an idea", () => {
  const content = loadBaseTechContent();
  const shadoof = content.inventions.find((i) => i.id === "invention:shadoof")!;
  const ctx = (apt: number): SeasonContext => ({
    tick: 0, people: ["a"], busy: new Set(), materials: new Set(), capabilities: new Set(), hasInstitution: () => undefined,
    aptitude: () => apt, inspire: () => 1, community: 10,
  });
  const v = emptyVillage();
  const m: Mind = emptyMind();
  const idle = sparkChance(shadoof, m, "a", v, content, ctx(60));
  v.needs["need:lift-water"] = 12;
  const pressed = sparkChance(shadoof, m, "a", v, content, ctx(60));
  const gifted = sparkChance(shadoof, m, "a", v, content, ctx(95));
  m.beliefs["theory:leverage"] = 0.8;
  const principled = sparkChance(shadoof, m, "a", v, content, ctx(95));
  assert.ok(idle < pressed && pressed < gifted && gifted < principled, `${idle} ${pressed} ${gifted} ${principled}`);
});

test("observations breed theories, evidence sorts right from wrong over time", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
  const w = village(21, ids);
  for (let year = 0; year < 40; year++) {
    ok(w.sim.dispatch({ type: "tech.observe", payload: { phenomenonId: "phen:river-rise", observers: ids } }));
    for (let s = 0; s < 4; s++) ok(w.sim.dispatch({ type: "tech.season", payload: {} }));
  }
  const theories = w.view().theories as Array<{ id: string; share: number; evidence: { hits: number; misses: number } }>;
  const stars = theories.find((t) => t.id === "theory:flood-follows-stars");
  const god = theories.find((t) => t.id === "theory:river-god");
  assert.ok(stars || god, "somebody proposed an explanation for the flood");
  if (stars && god) assert.ok(stars.evidence.hits / Math.max(1, stars.evidence.hits + stars.evidence.misses) > god.evidence.hits / Math.max(1, god.evidence.hits + god.evidence.misses));
});

test("inventions spread by teaching and are lost when the last holder is gone", () => {
  const w = village(3, ["a", "b", "c"], { a: ["invention:pry-bar"] });
  ok(w.sim.dispatch({ type: "tech.teach", actorId: "a", targetId: "b", payload: { inventionId: "invention:pry-bar" } }));
  assert.ok(w.mind("b").knows["invention:pry-bar"]! > 0);
  ok(w.sim.dispatch({ type: "tech.person_gone", targetId: "a" }));
  assert.deepEqual(w.view().lost, []);
  ok(w.sim.dispatch({ type: "tech.person_gone", targetId: "b" }));
  assert.deepEqual((w.view().lost as Array<{ id: string }>).map((l) => l.id), ["invention:pry-bar"]);
  assert.ok(!(w.view().capabilities as string[]).includes("cap:lever-tools"));
});

test("the needs report names pressing needs for the next content update", () => {
  const w = village(5, ["a"]);
  ok(w.sim.dispatch({ type: "tech.report_need", actorId: "a", payload: { needId: "need:more-power", amount: 3 } }));
  const report = w.sim.project({ id: "tech.needs_report", params: {} }).data as any;
  assert.equal(report.pressing[0].id, "need:more-power");
  assert.equal(report.pressing[0].label, "人力不够使");
});

test("a season with nobody able to make anything changes nothing but the decay of needs", () => {
  const w = village(8, ["a"]);
  ok(w.sim.dispatch({ type: "tech.season", payload: { materials: [] } }));
  assert.deepEqual(w.view().known, []);
});
