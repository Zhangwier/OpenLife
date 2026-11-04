import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { webModules } from "../../apps/web/src/modules.ts";
import { settlementView } from "../../apps/web/src/player.ts";
import { settlementMap } from "../../apps/web/src/local-map.ts";

const { modules } = webModules();
/** Life-scale choices stay in the time menu, so the map is not expected to carry them. */
const OFF_MAP = new Set(["settlement-locations.season.begin", "settlement-locations.configure_plan"]);
const arriveId = "settlement-locations.arrive";
const same = (a: Record<string, any>) => JSON.stringify({ id: a.id, payload: a.payload });

function boot() {
  const sim = new Simulation({ worldSeed: 104, modules });
  const step = (r: any, what: string) => {
    if (!r.ok) throw new Error(`${what} failed: ${r.errors?.[0]?.message ?? JSON.stringify(r.errors)}`);
    return r;
  };
  step(sim.dispatch({ type: "modern.initialize_world", source: "system" }), "modern.initialize_world");
  step(sim.dispatch({
    type: "modern.create_character", source: "system",
    payload: { givenName: "启", familyName: "禾", lifespan: 90 },
  }), "modern.create_character");
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  step(sim.dispatch({ type: "settlement-locations.found", source: "system" }), "settlement-locations.found");
  step(sim.dispatch({ type: arriveId, actorId, payload: { placeId: "place:yard" }, source: "system" }), "arrive place:yard");
  return { sim, actorId };
}

function arrive(sim: Simulation, actorId: string, placeId: string): string | null {
  const r = sim.dispatch({ type: arriveId, actorId, payload: { placeId, travelMode: "local" } });
  return r.ok ? null : `arrive ${placeId} failed: ${(r.errors[0] as any)?.message ?? JSON.stringify(r.errors)}`;
}

function inspect(label: string, sim: Simulation, actorId: string): string[] {
  const failures: string[] = [];
  const view = settlementView(sim, actorId);
  if (!view) return [`${label}: settlementView is null`];
  const map = settlementMap(sim, actorId, view);
  if (!map) return [`${label}: settlementMap is null`];
  const targets = map.targets;

  // 1: every map-bound action appears on exactly one target, matched by id+payload.
  const places = new Map<string, Set<string>>();
  for (const t of targets) for (const a of t.actions) places.set(same(a), new Set([...(places.get(same(a)) ?? []), t.key]));
  const wanted = new Map<string, number>();
  // "Walk to the space you already stand in" is not a place on the map.
  const here = (a: any) => a.id === "world-space.move_within" && a.payload?.spaceId === map.spaceId;
  for (const a of view.actions ?? []) if (!OFF_MAP.has(a.id) && !here(a)) wanted.set(same(a), (wanted.get(same(a)) ?? 0) + 1);
  for (const [key, count] of wanted) {
    const on = [...(places.get(key) ?? [])];
    if (on.length !== 1) failures.push(`action x${count} ${key} is on ${on.length} targets [${on.join(", ")}]`);
  }

  // 2: target keys are unique.
  const seen = new Map<string, number>();
  for (const t of targets) seen.set(t.key, (seen.get(t.key) ?? 0) + 1);
  for (const [key, n] of seen) if (n > 1) failures.push(`target key ${key} appears ${n} times`);

  // 3: every person target is a real neighbour.
  const neighbours = new Set((view.neighbours ?? []).map((n: any) => String(n.id)));
  for (const t of targets) if (t.type === "person" && !neighbours.has(String(t.id))) {
    failures.push(`person target ${t.key} is not in view.neighbours`);
  }

  // 4: exactly one work target, one exit target, and every arrive sits on the exit.
  const work = targets.filter((t) => t.type === "work");
  const exits = targets.filter((t) => t.type === "exit");
  if (work.length !== 1) failures.push(`expected 1 work target, found ${work.length} [${work.map((t) => t.key)}]`);
  if (exits.length !== 1) failures.push(`expected 1 exit target, found ${exits.length} [${exits.map((t) => t.key)}]`);
  for (const t of targets) if (t.type !== "exit") {
    for (const a of t.actions) if (a.id === arriveId) failures.push(`arrive ${JSON.stringify(a.payload)} sits on ${t.type} ${t.key}`);
  }

  // 5: every target is inside the map grid.
  for (const t of targets) {
    if (!(Number.isInteger(t.x) && Number.isInteger(t.y) && t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height)) {
      failures.push(`target ${t.key} at (${t.x},${t.y}) is outside ${map.width}x${map.height}`);
    }
  }
  return failures.map((f) => `${label}: ${f}`);
}

test("settlement map carries every action once, on unique targets inside the grid", () => {
  const { sim, actorId } = boot();
  const failures = inspect("yard", sim, actorId);
  for (const placeId of ["place:field", "place:river"]) {
    const error = arrive(sim, actorId, placeId);
    if (error) failures.push(error);
    else failures.push(...inspect(placeId, sim, actorId));
  }
  assert.deepEqual(failures, []);
});
