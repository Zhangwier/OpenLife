/**
 * Direct contract tests for the two engine packages that were only ever
 * exercised through Simulation: @openlife/query (projections scoped to a
 * viewer) and @openlife/history-runtime (records, lineages, serialization).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorCode, type ProjectionDefinition, type WorldEvent } from "@openlife/contracts";
import { ProjectionRuntime } from "@openlife/query";
import { HistoryRuntime, summarize } from "@openlife/history-runtime";

const emptyLog = { list: () => [], all: () => [], get: () => undefined, size: 0 } as never;
const emptyStore = { get: () => undefined, list: () => [] } as never;
const history = () => new HistoryRuntime({ eventLog: emptyLog, store: emptyStore });

function projections(defs: Partial<ProjectionDefinition>[]) {
  const active = defs.map((d) => ({ owner: "test", ...d })) as never[];
  return new ProjectionRuntime({
    definitions: { projections: { active: () => active } } as never,
    history: history(),
    worldView: () => ({ tick: 7 }) as never,
    rng: () => ({ fork: () => ({}) }) as never,
  });
}

test("query: a known projection is built with the viewer and params it was asked for", () => {
  const runtime = projections([{
    id: "test.echo", description: "echo",
    build: ({ viewerId, params, world }) => ({ viewer: viewerId ?? "", n: Number(params.n), tick: world.tick }),
  }]);
  assert.deepEqual(runtime.list(), [{ id: "test.echo", owner: "test", description: "echo" }]);
  const result = runtime.project({ id: "test.echo", viewerId: "npc:1", params: { n: 3 } });
  assert.equal(result.ok, true);
  assert.equal(result.viewerId, "npc:1");
  assert.deepEqual(result.data, { viewer: "npc:1", n: 3, tick: 7 });
});

test("query: unknown projections and throwing builders fail with stable error codes", () => {
  const runtime = projections([{ id: "test.boom", build: () => { throw new Error("kaput"); } }]);
  const unknown = runtime.project({ id: "test.missing" });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error?.code, ErrorCode.UnknownProjection);
  const boom = runtime.project({ id: "test.boom" });
  assert.equal(boom.ok, false);
  assert.match(boom.error?.message ?? "", /kaput/);
  assert.throws(() => runtime.require({ id: "test.missing" }));
});

test("history-runtime: lineages track members across generations and survive serialization", () => {
  const runtime = history();
  runtime.createLineage("lineage:he", "char:1", 0);
  runtime.addLineageMember("lineage:he", { characterId: "char:1", generation: 1, bornAt: 0 });
  runtime.addLineageMember("lineage:he", { characterId: "char:2", generation: 2, bornAt: 7000 });
  runtime.markLineageMemberDied("lineage:he", "char:1", 30000);
  assert.throws(() => runtime.createLineage("lineage:he"), /already exists/);
  assert.deepEqual(runtime.lineage("lineage:he")?.members.map((m) => [m.characterId, m.alive]), [["char:1", false], ["char:2", true]]);

  const restored = HistoryRuntime.deserialize(runtime.serialize(), { eventLog: emptyLog, store: emptyStore });
  assert.deepEqual(restored.lineage("lineage:he"), runtime.lineage("lineage:he"));
  assert.equal(restored.lineage("lineage:none"), undefined);
});

test("history-runtime: summarize names the event, its actors and its data keys", () => {
  const event = { type: "family.married", actorId: "a", targetId: "b", data: { since: 1, trust: 0.8 } } as unknown as WorldEvent;
  assert.equal(summarize(event), "family.married actor=a target=b data={since,trust}");
});
