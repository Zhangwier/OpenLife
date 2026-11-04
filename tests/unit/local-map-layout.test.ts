/**
 * Local map layout invariants over every real scene of the river-terrace pack.
 *
 * Each (place, space) pair is a scene the player can walk into, so every one of
 * them must satisfy the same promises: closed corners, a spawn just inside the
 * gate, doors to all siblings, reachable people, standable work and gatherable
 * spots. Failures are collected per scene so one run lists every broken anchor.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import {
  buildLayout,
  findPath,
  isWalkable,
  approachCell,
  reachDistance,
  type Cell,
  type SceneInput,
} from "../../modules/world-space/src/local-map.ts";

interface SpaceJson { id: string; name: string; type: string }
interface PlaceJson { id: string; type: string; spaces: SpaceJson[] }

const pack = JSON.parse(
  readFileSync(new URL("../../modules/settlement-locations/data/river-terrace.json", import.meta.url), "utf8"),
) as { places: PlaceJson[] };

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const scenes = pack.places.flatMap((place) =>
  place.spaces.map((space) => {
    const input: SceneInput = {
      placeId: place.id,
      placeType: place.type,
      spaceId: space.id,
      spaceType: space.type,
      siblings: place.spaces
        .filter((s) => s.id !== space.id)
        .sort(byId)
        .map((s) => ({ id: s.id, name: s.name, spaceType: s.type })),
    };
    return { key: `${place.id}/${space.id}`, input, layout: buildLayout(input) };
  }),
);

const at = (c: Cell) => `(${c.x},${c.y})`;

test("grid shape matches width/height and the corners are sealed", () => {
  const failures: string[] = [];
  for (const { key, layout } of scenes) {
    const { tiles, width, height } = layout;
    if (tiles.length !== height) failures.push(`${key}: tiles.length ${tiles.length} !== height ${height}`);
    tiles.forEach((row, y) => {
      if (row.length !== width) failures.push(`${key}: row ${y} length ${row.length} !== width ${width}`);
    });
    for (const [x, y] of [[0, 0], [width - 1, height - 1]] as const) {
      if (isWalkable(layout, x, y)) failures.push(`${key}: corner (${x},${y}) is walkable`);
    }
  }
  assert.deepEqual(failures, []);
});

test("spawn and the cell to its right are walkable", () => {
  const failures: string[] = [];
  for (const { key, layout } of scenes) {
    const { spawn } = layout;
    if (!isWalkable(layout, spawn.x, spawn.y)) failures.push(`${key}: spawn ${at(spawn)} is blocked`);
    if (!isWalkable(layout, spawn.x + 1, spawn.y)) failures.push(`${key}: cell right of spawn ${at({ x: spawn.x + 1, y: spawn.y })} is blocked`);
  }
  assert.deepEqual(failures, []);
});

test("gate is walkable and reachable from spawn", () => {
  const failures: string[] = [];
  for (const { key, layout } of scenes) {
    if (!isWalkable(layout, layout.gate.x, layout.gate.y)) failures.push(`${key}: gate ${at(layout.gate)} is blocked`);
    else if (!findPath(layout, layout.spawn, layout.gate)) failures.push(`${key}: gate ${at(layout.gate)} unreachable from spawn ${at(layout.spawn)}`);
  }
  assert.deepEqual(failures, []);
});

test("every door is walkable, reachable and matches the sibling count", () => {
  const failures: string[] = [];
  for (const { key, input, layout } of scenes) {
    if (layout.doors.length !== input.siblings.length) {
      failures.push(`${key}: ${layout.doors.length} doors for ${input.siblings.length} siblings`);
    }
    for (const door of layout.doors) {
      if (!isWalkable(layout, door.x, door.y)) failures.push(`${key}: door to ${door.spaceId} ${at(door)} is blocked`);
      else if (!findPath(layout, layout.spawn, door)) failures.push(`${key}: door to ${door.spaceId} ${at(door)} unreachable from spawn ${at(layout.spawn)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("every people slot is walkable and reachable from spawn", () => {
  const failures: string[] = [];
  for (const { key, layout } of scenes) {
    for (const slot of layout.peopleSlots) {
      if (!isWalkable(layout, slot.x, slot.y)) failures.push(`${key}: people slot ${at(slot)} is blocked`);
      else if (!findPath(layout, layout.spawn, slot)) failures.push(`${key}: people slot ${at(slot)} unreachable from spawn ${at(layout.spawn)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("work, object and yield anchors have a standable cell next to them", () => {
  const failures: string[] = [];
  for (const { key, layout } of scenes) {
    for (const [name, cell] of [["work", layout.work], ...layout.objectSlots.map((c) => ["object", c] as const), ...layout.yieldSlots.map((c) => ["yield", c] as const)] as [string, Cell][]) {
      const spot = approachCell(layout, layout.spawn, cell);
      if (!spot) failures.push(`${key}: no approach to ${name} ${at(cell)}`);
      else if (reachDistance(spot.cell, cell) > 1) failures.push(`${key}: approach ${at(spot.cell)} is ${reachDistance(spot.cell, cell)} from ${name} ${at(cell)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("buildLayout is deterministic for the same input", () => {
  const failures: string[] = [];
  for (const { key, input, layout } of scenes) {
    if (!isDeepStrictEqual(buildLayout(input), layout)) failures.push(`${key}: second build differs from the first`);
  }
  assert.deepEqual(failures, []);
});

test("scene ids are unique per place and space", () => {
  const failures: string[] = [];
  const owner = new Map<string, string>();
  for (const { key, layout } of scenes) {
    const seen = owner.get(layout.sceneId);
    if (seen) failures.push(`${key}: sceneId ${layout.sceneId} already used by ${seen}`);
    else owner.set(layout.sceneId, key);
  }
  assert.deepEqual(failures, []);
});
