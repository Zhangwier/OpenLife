/**
 * Local grid position: where on the walkable map of their current space a
 * person stands (map-life M1).
 *
 * The semantic position (place + space relations) stays the truth about
 * *where* someone is; this component only refines it to a cell. It is bound to
 * a scene id (map version + place + space): once the person is somewhere else
 * the stored cell is stale and the projection places them at a safe anchor
 * instead, so old saves and cross-place moves never land anyone in a wall.
 *
 * Walking inside a scene never moves the clock and costs nothing; every step
 * still goes through one validated command, so a save always holds the last
 * confirmed cell and a replayed request is refused by its revision.
 */
import type { JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { writeComponent } from "@openlife/contracts";
import {
  buildLayout, findPath, isWalkable, sceneIdOf, LOCAL_MAP_VERSION,
  type Cell, type LocalLayout,
} from "./local-map.ts";

type Registration = Parameters<OpenLifeModule["register"]>[0];

export const LocalGrid = {
  component: "world-space.local-position",
  move: "world-space.local_move",
  projection: "world-space.local-map",
} as const;

export const LocalRejection = {
  NoScene: "E_LOCAL_NO_SCENE",
  StaleScene: "E_LOCAL_STALE_SCENE",
  StalePosition: "E_LOCAL_STALE_POSITION",
  BadCell: "E_LOCAL_BAD_CELL",
  Blocked: "E_LOCAL_BLOCKED",
  Unreachable: "E_LOCAL_UNREACHABLE",
} as const;

export interface LocalPosition extends Cell { sceneId: string; facing: string; revision: number }

export interface LocalMapView extends LocalLayout {
  exists: boolean;
  version: number;
  placeId: string;
  spaceId: string;
  placeName: string;
  spaceName: string;
  player: LocalPosition;
}

/** The layout of the scene an actor stands in, or null when they are in no place. */
export function layoutFor(world: WorldView, actorId: string): (LocalLayout & { placeId: string; spaceId: string; placeName: string; spaceName: string }) | null {
  const placeId = world.listRelations({ type: "world-space.occupies", from: actorId })[0]?.to ?? "";
  if (!placeId) return null;
  const place = world.getComponent(placeId, "world-space.place");
  const siblings = world.listRelations({ type: "world-space.inside", to: placeId })
    .map((r) => world.getEntity(r.from))
    .filter((e): e is NonNullable<typeof e> => Boolean(e && e.archivedAt === undefined))
    .map((e) => ({ id: e.id, name: String(e.components["world-space.space"]?.name ?? ""), spaceType: String(e.components["world-space.space"]?.spaceType ?? "room") }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const spaceId = world.listRelations({ type: "world-space.standing_in", from: actorId })[0]?.to ?? "";
  const here = siblings.find((s) => s.id === spaceId);
  const layout = buildLayout({
    placeId, placeType: String(place?.placeType ?? "yard"), spaceId,
    spaceType: here?.spaceType ?? "work",
    siblings: siblings.filter((s) => s.id !== spaceId),
  });
  return { ...layout, placeId, spaceId, placeName: String(place?.name ?? ""), spaceName: here?.name ?? "" };
}

function stored(world: WorldView, actorId: string): LocalPosition | null {
  const raw = world.getComponent(actorId, LocalGrid.component);
  if (!raw || typeof raw.sceneId !== "string") return null;
  return { sceneId: raw.sceneId, x: Number(raw.x), y: Number(raw.y), facing: String(raw.facing ?? "down"), revision: Number(raw.revision ?? 0) };
}

/**
 * The confirmed cell, or the safe arrival cell when the stored one belongs to
 * another scene: beside the door you came through from a sibling space,
 * otherwise just inside the gate.
 */
export function positionOf(world: WorldView, actorId: string, layout: LocalLayout & { placeId: string }): LocalPosition {
  const saved = stored(world, actorId);
  const revision = saved?.revision ?? 0;
  if (saved && saved.sceneId === layout.sceneId && isWalkable(layout, saved.x, saved.y)) return saved;
  let spawn: Cell = layout.spawn, facing = "up";
  const from = saved?.sceneId.split("|") ?? [];
  if (from[1] === layout.placeId) {
    const door = layout.doors.find((d) => d.spaceId === from[2]);
    const step = door && [{ x: door.x, y: door.y + 1 }, { x: door.x + 1, y: door.y }, { x: door.x - 1, y: door.y }, { x: door.x, y: door.y - 1 }]
      .find((c) => isWalkable(layout, c.x, c.y) && findPath(layout, layout.spawn, c));
    if (step) { spawn = step; facing = "down"; }
  }
  return { sceneId: layout.sceneId, x: spawn.x, y: spawn.y, facing, revision };
}

export function localMap(world: WorldView, actorId: string): LocalMapView | { exists: false } {
  const layout = layoutFor(world, actorId);
  if (!layout) return { exists: false };
  return { exists: true, version: LOCAL_MAP_VERSION, ...layout, player: positionOf(world, actorId, layout) };
}

const facingOf = (from: Cell, to: Cell) =>
  Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? (to.x >= from.x ? "right" : "left") : (to.y >= from.y ? "down" : "up");

export function registerLocalGrid(ctx: Registration): void {
  ctx.registerComponent({ id: LocalGrid.component, persist: true, description: "the confirmed cell a person stands on in their current local map" });
  ctx.registerCommand({
    type: LocalGrid.move,
    params: { sceneId: "string", x: "number", y: "number", expectedPosition: "number" },
    description: "Walk to a reachable cell of the local map you stand in. Free, and never moves the clock.",
  });
  ctx.registerConstraintRule({
    id: `${LocalGrid.move}.allowed`,
    commandType: LocalGrid.move,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const layout = actorId && c.world.hasEntity(actorId) ? layoutFor(c.world, actorId) : null;
      if (!layout) return refuse(LocalRejection.NoScene, "你现在不在一处可以走动的地方。");
      const p = c.command.payload;
      if (p.sceneId !== layout.sceneId) return refuse(LocalRejection.StaleScene, "你已经不在那张图上了，请重新看看四周。");
      const here = positionOf(c.world, actorId, layout);
      if (p.expectedPosition !== here.revision) return refuse(LocalRejection.StalePosition, "位置已经变了，这一步没有走。");
      const x = p.x, y = p.y;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isInteger(x) || !Number.isInteger(y)) {
        return refuse(LocalRejection.BadCell, "只能走到一个完整的格子上。");
      }
      if (!isWalkable(layout, x, y)) return refuse(LocalRejection.Blocked, "那里走不过去。");
      if (!findPath(layout, here, { x, y })) return refuse(LocalRejection.Unreachable, "从这里到不了那儿。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${LocalGrid.move}.resolve`,
    commandType: LocalGrid.move,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const layout = layoutFor(c.world, actorId)!;
      const here = positionOf(c.world, actorId, layout);
      const to = { x: Number(c.command.payload.x), y: Number(c.command.payload.y) };
      const path = findPath(layout, here, to) ?? [];
      const last = path.length > 1 ? path[path.length - 2]! : here;
      const value: Record<string, JsonValue> = {
        sceneId: layout.sceneId, x: to.x, y: to.y,
        facing: path.length ? facingOf(last, to) : here.facing, revision: here.revision + 1,
      };
      return [writeComponent(c.world.getComponent(actorId, LocalGrid.component) !== undefined, actorId, LocalGrid.component, value, "walked on the local map")];
    },
  });
  ctx.registerProjection({
    id: LocalGrid.projection,
    description: "The walkable map of the space one actor stands in, with their confirmed cell.",
    build: ({ world, params }) => localMap(world, String(params.actorId ?? "")) as unknown as Record<string, unknown>,
  });
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}
