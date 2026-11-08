import assert from "node:assert/strict";
import test from "node:test";
import { extensionNeed, extensionSite } from "../apps/card-world/expansion.js";
import { findRooms, fromCompound } from "../apps/card-world/walls.js";

const quiet = { adults: 2, beds: 2, freeBedSpots: 1, couplesWithoutRoom: 0, heapKinds: 0, heapCap: 3, season: "春", planning: false };

test("a couple gets a room first, then a spare bed, then a store; a village with room to spare asks for nothing", () => {
  assert.deepEqual(extensionNeed({ ...quiet, couplesWithoutRoom: 1, adults: 9, freeBedSpots: 0, heapKinds: 9 }),
    { kind: "couple", w: 3, h: 3, because: "成了家，该有自己的一间" });
  assert.deepEqual(extensionNeed({ ...quiet, adults: 3, beds: 2, freeBedSpots: 0, heapKinds: 9 }),
    { kind: "bedroom", w: 3, h: 3, because: "屋里摆不下铺位了，接一间屋" });
  assert.deepEqual(extensionNeed({ ...quiet, adults: 2, beds: 2, freeBedSpots: 0, heapKinds: 4, heapCap: 3 }),
    { kind: "store", w: 4, h: 3, because: "材料堆不下了，接一间仓房" });
  assert.equal(extensionNeed(quiet), null);
  assert.equal(extensionNeed({ ...quiet, adults: 3, beds: 2, freeBedSpots: 1 }), null);   // a free bed is enough
});

test("no extensions in autumn or winter, or while a plan is already open", () => {
  const crowded = { ...quiet, adults: 4, beds: 1, freeBedSpots: 0, couplesWithoutRoom: 1, heapKinds: 9 };
  assert.equal(extensionNeed({ ...crowded, season: "秋" }), null);
  assert.equal(extensionNeed({ ...crowded, season: "冬" }), null);
  assert.equal(extensionNeed({ ...crowded, planning: true }), null);
  assert.equal(extensionNeed(crowded).kind, "couple");                                       // otherwise it would build
});

const compound = () => fromCompound({ x: 0, y: 0, w: 240, h: 240, gate: { x: 80, w: 80 } }, "mud");

const perimeter = (cells) => {
  const taken = new Set(cells.map(([i, j]) => `${i},${j}`));
  const keys = new Set();
  for (const [i, j] of cells) {
    if (!taken.has(`${i},${j - 1}`)) keys.add(`h:${i}:${j}`);
    if (!taken.has(`${i},${j + 1}`)) keys.add(`h:${i}:${j + 1}`);
    if (!taken.has(`${i - 1},${j}`)) keys.add(`v:${i}:${j}`);
    if (!taken.has(`${i + 1},${j}`)) keys.add(`v:${i + 1}:${j}`);
  }
  return [...keys];
};

test("an extension hugs a 3×3 room, shares three walls and adds nine", () => {
  const { segs } = compound();
  const rooms = findRooms(segs);
  assert.equal(rooms.length, 1);
  assert.equal(rooms[0].cells.length, 9);

  const site = extensionSite({ segs, rooms, w: 3, h: 3, free: () => true, home: { x: 120, y: 120 } });
  assert.ok(site);
  assert.equal(site.cells.length, 9);

  const built = new Set(segs.map((s) => s.k));
  const shared = perimeter(site.cells).filter((k) => built.has(k));
  assert.equal(shared.length, 3);
  assert.ok(shared.includes(site.door), "the door is one of the shared walls");
  assert.equal(site.segs.length, 9);
  assert.deepEqual(new Set(site.segs), new Set(perimeter(site.cells).filter((k) => !built.has(k))));

  const roomCells = new Set(rooms[0].cells.map(([i, j]) => `${i},${j}`));
  for (const [i, j] of site.cells) assert.ok(!roomCells.has(`${i},${j}`), "the new room stays outside every room");
});

test("a blocked side sends the extension to another wall", () => {
  const { segs } = compound();
  const rooms = findRooms(segs);
  const open = extensionSite({ segs, rooms, w: 3, h: 3, free: () => true, home: { x: 120, y: 120 } });
  const northBlocked = extensionSite({ segs, rooms, w: 3, h: 3, free: (i, j) => j >= 0, home: { x: 120, y: 120 } });
  assert.ok(open);
  assert.ok(northBlocked);
  assert.notDeepEqual(northBlocked.cells, open.cells);
  assert.equal(perimeter(northBlocked.cells).filter((k) => segs.some((s) => s.k === k)).length, 3);
});

test("nowhere free means no extension site", () => {
  const { segs } = compound();
  const rooms = findRooms(segs);
  assert.equal(extensionSite({ segs, rooms, w: 3, h: 3, free: () => false, home: { x: 120, y: 120 } }), null);
});
