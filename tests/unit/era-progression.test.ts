/**
 * The chronicle as a whole: polity, bondage, fate and the era ladder working
 * through commands only, every plugin switchable, history replayable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChronicle, runChronicle, summarize, village, ALL_PLUGINS } from "@openlife/module-village-chronicle";
import { polityModule, INSTITUTIONS } from "@openlife/module-polity";
import { polityBondageModule } from "@openlife/module-polity-bondage";
import { eraLadderModule, conditionHolds, ERAS } from "@openlife/module-era-ladder";
import { fateModule } from "@openlife/module-fate";
import { Simulation } from "@openlife/simulation";

const YEARS = 60;

test("same seed, same plugins, same history", () => {
  const a = runChronicle(buildChronicle({ seed: 13 }), YEARS);
  const b = runChronicle(buildChronicle({ seed: 13 }), YEARS);
  assert.deepEqual(summarize(a), summarize(b));
  assert.ok(JSON.stringify(a.save()).length > 0, "the chronicle world saves");
  assert.deepEqual(village(a).log, village(b).log);
});

test("a chronicle village invents things and writes them down", () => {
  const sim = runChronicle(buildChronicle({ seed: 7 }), YEARS);
  const s = summarize(sim);
  assert.ok((s.known as string[]).length >= 3, `known: ${String(s.known)}`);
  assert.ok(village(sim).log.some((l) => l.text.includes("琢磨出了")));
  assert.ok((s.population as number) > 0);
});

test("every plugin can be switched off and the chronicle still runs", () => {
  for (const off of ALL_PLUGINS) {
    const plugins = ALL_PLUGINS.filter((p) => p !== off && !(off === "polity" && p === "polity-bondage"));
    const sim = runChronicle(buildChronicle({ seed: 2, plugins }), 15);
    assert.equal(village(sim).year, 15, off);
  }
  const bare = runChronicle(buildChronicle({ seed: 2, plugins: [] }), 15);
  assert.equal(village(bare).year, 15);
});

test("the era ladder only reads: a check writes nothing but its own record", () => {
  const sim = runChronicle(buildChronicle({ seed: 4 }), 30);
  const others = () => JSON.stringify(sim.worldView().listEntities().filter((e) => e.id !== "era:ladder").map((e) => [e.id, e.components]));
  const before = others();
  assert.equal(sim.dispatch({ type: "era-ladder.check", payload: { population: 30, contacts: 1 } }).ok, true);
  assert.equal(others(), before);
});

test("fate nudges are logged commands; observer mode refuses them and leaves fate untouched", () => {
  const nudges = [{ year: 3, type: "fate.inspire" as const, payload: { targetId: "invention:pry-bar", factor: 10 } }];
  const plain = runChronicle(buildChronicle({ seed: 6, fateMode: "lab" }), 20);
  const plainAgain = runChronicle(buildChronicle({ seed: 6, fateMode: "lab" }), 20);
  assert.deepEqual(summarize(plain), summarize(plainAgain));
  const nudged = runChronicle(buildChronicle({ seed: 6, fateMode: "lab" }), 20, nudges);
  assert.equal((nudged.project({ id: "fate.state", params: {} }).data as { log: unknown[] }).log.length, 1);
  const observer = buildChronicle({ seed: 6 });
  const refused = observer.dispatch({ type: "fate.inspire", payload: { targetId: "invention:pry-bar", factor: 10 } });
  assert.equal(refused.errors[0]?.code, "E_FATE_OFF");
  assert.equal((observer.project({ id: "fate.state", params: {} }).data as { log: unknown[] }).log.length, 0);
});

test("eras are recognized from state, never set: the ladder's data is consistent", () => {
  const ranks = ERAS.eras.map((e) => e.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  const empty = { population: 0, contacts: 0, largestSettlement: 0, surplusYears: 0, bonded: 0, capabilities: new Set<string>(), institutions: new Set<string>(), customs: new Set<string>() };
  assert.equal(conditionHolds(ERAS.eras[0]!.when, empty), true);
  for (const e of ERAS.eras.slice(1)) assert.equal(conditionHolds(e.when, empty), false, e.id);
  const sim = new Simulation({ worldSeed: 1, modules: [eraLadderModule] });
  assert.equal(sim.dispatch({ type: "era-ladder.check", payload: { population: 5 } }).ok, true);
  assert.equal((sim.project({ id: "era-ladder.state", params: {} }).data as { current: string }).current, "era:settled-village");
});

test("debt bondage needs its own plugin, and abolition frees everyone", () => {
  assert.ok(INSTITUTIONS.institutions.find((i) => i.id === "institution:debt-bondage")?.when.requiresCapability === "polity.labor");
  const sim = new Simulation({ worldSeed: 2, modules: [polityModule, polityBondageModule, fateModule] });
  assert.equal(sim.dispatch({ type: "polity.found" }).ok, true);
  assert.equal(sim.dispatch({ type: "polity-bondage.year", payload: { people: [] } }).ok, true);
  const ledger = sim.project({ id: "polity-bondage.ledger", params: {} }).data as { bonded: string[]; abolished: boolean };
  assert.deepEqual(ledger.bonded, []);
  assert.equal(ledger.abolished, false);
});
