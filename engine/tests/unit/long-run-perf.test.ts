/**
 * Long-run performance and save size (round 6): a village day must not cost
 * more as history piles up, and a save must not grow with every step anyone
 * ever took. Covers the pieces that make that true and the guarantees they
 * must keep: lazy copies stay owned by the caller, live relation indexes
 * agree with the full ones through archive and rollback, the journal keeps
 * everything with weight (and its causes) and drops old traces, and a run that
 * was saved and loaded keeps exactly the same world as one that never stopped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WorldStore, StoreBackedWorldView } from "@openlife/world-model";
import { EventLog } from "@openlife/kernel";
import { readField, type WorldEvent, type WorldView } from "@openlife/contracts";
import { Simulation, journalKeeper } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { villageStoriesModule } from "@openlife/module-village-stories";
import { bench, overBudget, BUDGET_PATH, type Budget } from "../../scripts/bench-days.ts";
import fs from "node:fs";

const MODULES = [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule];

test("a view's components are copied lazily but still belong to the caller", () => {
  const store = new WorldStore({});
  const id = store.createEntity({ id: "t:1", kind: "thing", createdAt: 0, components: { "m.c": { n: 1, deep: { list: [1, 2] } } } }).id;
  const view = new StoreBackedWorldView(store, () => 0);
  const read = view.getComponent(id, "m.c")! as { n: number; deep: { list: number[] } };
  read.deep.list.push(3);
  read.n = 9;
  assert.deepEqual(store.getComponent(id, "m.c"), { n: 1, deep: { list: [1, 2] } }, "mutating what you read changes nothing");
  // What an entity view shows is fixed when it is made, even if read later.
  const entity = view.getEntity(id)!;
  store.setComponent(id, "m.c", { n: 2, deep: { list: [] } });
  assert.equal((entity.components["m.c"] as { n: number }).n, 1);
  assert.equal(JSON.stringify(view.getEntity(id)!.components), JSON.stringify({ "m.c": { deep: { list: [] }, n: 2 } }), "serialises like before (keys sorted, as deepClone always did)");
  // One field without the rest, still a copy.
  const deep = view.getField(id, "m.c", "deep") as { list: number[] };
  deep.list.push(7);
  assert.deepEqual(store.getComponent(id, "m.c"), { n: 2, deep: { list: [] } });
  assert.equal(view.getField(id, "m.c", "missing"), undefined);
  // readField falls back for a world view without the cheap path.
  const plain = { getComponent: () => ({ a: 5 }) } as unknown as WorldView;
  assert.equal(readField(plain, id, "x", "a"), 5);
});

test("live relation indexes agree with the full ones through archive and rollback", () => {
  const store = new WorldStore({});
  const [a, b, c] = ["p:a", "p:b", "p:c"].map((id) => store.createEntity({ id, kind: "p", createdAt: 0, components: {} }).id) as [string, string, string];
  const rel = (id: string, from: string, to: string) => store.addRelation({ id, type: "near", from, to, createdAt: 0, components: {} }).id;
  const r1 = rel("r:1", a, b);
  rel("r:2", a, c);
  rel("r:3", b, c);
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  const before = ids(store.listRelations({ from: a }));
  const mark = store.checkpoint();
  store.archiveRelation(r1, 5, "moved");
  assert.equal(store.listRelations({ from: a }).length, 1, "archived drops out of the live read");
  assert.equal(store.listRelations({ from: a, includeArchived: true }).length, 2, "but stays in history");
  store.rollback(mark);
  assert.deepEqual(ids(store.listRelations({ from: a })), before, "rollback restores it in its original order");
  assert.deepEqual(ids(store.listRelations({ type: "near" })), ids(store.listRelations({ type: "near", includeArchived: true })));
  assert.deepEqual(ids(store.listRelations({ from: a, to: c })), [ids(store.listRelations({ from: a }))[1]!]);
});

test("the event log indexes by id, compacts in order, and reads `since` across gaps", () => {
  const log = new EventLog();
  const mk = (n: number) => log.append({ type: n % 2 ? "trace" : "keep", at: n, data: {}, causedBy: [], historicalSignificance: 0, visibility: "public", owner: "t" } as never);
  const events = Array.from({ length: 10 }, (_, n) => mk(n));
  assert.equal(log.get(events[3]!.id)?.at, 3);
  const dropped = log.compact((e) => e.type === "keep");
  assert.equal(dropped, 5);
  assert.equal(log.get(events[3]!.id), undefined, "dropped events leave the index");
  assert.equal(log.get(events[4]!.id)?.at, 4);
  assert.deepEqual(log.since(events[4]!.seq).map((e) => e.at), [6, 8], "since() skips the gaps");
  const mark = log.mark();
  const late = mk(20);
  log.rollback(mark);
  assert.equal(log.get(late.id), undefined, "rolled-back events leave the index");
});

test("the journal keeps weight, recent routine and causes; traces go sooner", () => {
  const ev = (id: string, at: number, extra: Partial<WorldEvent> = {}) => ({ id, at, type: "routine", historicalSignificance: 0, causedBy: [], ...extra }) as unknown as WorldEvent;
  const events = [
    ev("old", 0), ev("cause", 1), ev("weighty", 2, { historicalSignificance: 0.5, causedBy: ["cause"] }),
    ev("step", 95, { type: "trace" }), ev("step-new", 99, { type: "trace" }), ev("recent", 80),
    ev("year", 5, { type: "milestone" }),
  ];
  const keep = journalKeeper(events, 70, new Map([["trace", 3], ["milestone", Number.POSITIVE_INFINITY]]), 100);
  assert.deepEqual(events.filter(keep).map((e) => e.id), ["cause", "weighty", "step-new", "recent", "year"]);
});

function settle() {
  const sim = new Simulation({ worldSeed: 7, modules: MODULES });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(18 * 360);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  return { sim, me };
}
const days = (sim: Simulation, me: string, n: number) => {
  for (let d = 0; d < n; d += 1) {
    assert.equal(sim.dispatch({ type: SettlementCommands.step, actorId: me, source: "player", payload: {} as never }).ok, true);
    sim.advanceBy(1);
  }
};

test("a run saved and loaded midway ends exactly like one that never stopped", () => {
  const a = settle();
  days(a.sim, a.me, 26);
  const b = settle();
  days(b.sim, b.me, 13);
  const loaded = Simulation.load(JSON.parse(JSON.stringify(b.sim.save())), MODULES);
  assert.equal(loaded.result.ok, true, loaded.result.errors[0]?.message);
  days(loaded.simulation!, b.me, 13);
  const strip = (s: Simulation) => { const p = s.save() as unknown as Record<string, unknown>; return JSON.stringify({ world: p.snapshot, journal: p.eventJournal }); };
  assert.equal(strip(loaded.simulation!), strip(a.sim));
});

test("over months, the journal and the save stay within budget (traces dropped, weight kept)", () => {
  const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, "utf8")) as Budget;
  const r = bench(60);
  assert.ok(r.journalEvents < budget.journalEvents, `journal ${r.journalEvents}`);
  assert.ok(r.saveKB < budget.saveKB, `save ${r.saveKB}KB`);
  assert.ok(r.relationsLive < r.relationsAll, "history is kept (archived relations), only the live index skips it");
  assert.deepEqual(overBudget({ ...r, p95: 0, first30: 1, last30: 1 }, budget), [], "size budgets hold");
  assert.match(overBudget({ ...r, p95: budget.p95Ms + 1, first30: 10, last30: 40 }, budget).join("\n"), /p95[\s\S]*slow down/, "the timing checks bite");
});
