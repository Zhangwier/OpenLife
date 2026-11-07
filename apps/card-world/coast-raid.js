import { CELL, findPath, walkable } from "./mapgen.js";

// The cutters sail around the southern shore, then follow an actual land route.
export function coastRaidRoute(map, granary) {
  const island = map.tiles.blackReef, coast = map.tiles.lake;
  const sea = coast.y + coast.h + 140;
  const start = { x: island.x - CELL, y: island.y + island.h / 2 };
  const corner = { x: start.x, y: sea };
  for (let x = coast.x + coast.w - CELL * 3.5; x > coast.x + coast.w / 2; x -= CELL) {
    const beach = { x, y: coast.y + coast.h - CELL / 2 };
    if (map.water[map.idx(beach.x, beach.y)] || !walkable(map, beach.x, beach.y)) continue;
    const land = findPath(map, beach, granary);
    if (land) return { points: [start, corner, { x, y: sea }, beach, ...land], landing: 3 };
  }
  return null;
}

export function raidLoot(stock, seedReserve) {
  return Math.min(3, Math.max(0, stock - seedReserve));
}
