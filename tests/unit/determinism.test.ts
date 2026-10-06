/**
 * MVP criterion 8 and INV-004: identical state, commands, seed, rules and
 * module versions must produce an identical result.
 *
 * The scripted life pins lifespans so that the milestones are always reached;
 * every remaining difference between two runs therefore comes from the RNG.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Simulation } from "@openlife/simulation";
import { runStandardLife } from "../helpers/modern.ts";

function life(seed: number): Simulation {
  return runStandardLife(seed).simulation;
}

test("same seed and commands produce byte-identical state", () => {
  assert.equal(life(1).fingerprint(), life(1).fingerprint());
});

test("different seeds produce different worlds", () => {
  assert.notEqual(life(1).fingerprint(), life(7).fingerprint());
});

test("random outcomes are reproducible in detail, not just structurally", () => {
  const detail = (simulation: Simulation): unknown[] =>
    simulation
      .worldView()
      .listEntities({ kind: "modern.character", includeArchived: true })
      .map((entity) => ({
        vitals: entity.components["modern.vitals"],
        wealth: entity.components["modern.wealth"],
        identity: entity.components["modern.identity"],
      }));
  assert.deepEqual(detail(life(555)), detail(life(555)));
});

test("the root RNG draw count matches for identical runs", () => {
  assert.deepEqual(
    life(31337).kernel.internals.rng.snapshot(),
    life(31337).kernel.internals.rng.snapshot(),
  );
});

test("event journals are identical for identical runs", () => {
  const events = (simulation: Simulation): unknown[] =>
    simulation.kernel.internals.eventLog.all().map((event) => ({
      type: event.type,
      at: event.at,
      actorId: event.actorId,
      data: event.data,
    }));
  assert.deepEqual(events(life(8080)), events(life(8080)));
});

test("the same seed with a different command sequence diverges", () => {
  const a = runStandardLife(2024).simulation;
  const b = runStandardLife(2024, { startingCash: 1 }).simulation;
  // Same seed, different starting state -> the business cannot be founded.
  assert.notEqual(a.fingerprint(), b.fingerprint());
});
