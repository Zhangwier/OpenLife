import assert from "node:assert/strict";
import test from "node:test";
import {
  addSegWork, blockRects, boxSegs, buildingOf, doorlessRooms, edgeRun, findRooms, fromCompound, needsOf, newSeg, parseSeg,
  roofCost, roomAt, roomName, segKey, segRect, snapLine,
} from "../apps/card-world/walls.js";

const built = (keys, doors = []) => keys.map((k) => ({ ...newSeg(k, { kind: doors.includes(k) ? "door" : "wall", plan: "p" }), state: "built", need: {} }));

test("keys and rects sit on the 80px grid", () => {
  assert.deepEqual(segRect("h:2:3"), { x: 160, y: 233, w: 80, h: 14 });
  assert.deepEqual(segRect("v:2:3"), { x: 153, y: 240, w: 14, h: 80 });
  assert.deepEqual(parseSeg(segKey("v", -1, 4)), { dir: "v", i: -1, j: 4 });
});

test("a drag snaps to one straight line", () => {
  assert.deepEqual(snapLine({ x: 85, y: 160 }, { x: 330, y: 190 }), ["h:1:2", "h:2:2", "h:3:2"]);
  assert.deepEqual(snapLine({ x: 85, y: 160 }, { x: 100, y: 170 }), []);
  assert.deepEqual(snapLine({ x: 160, y: 250 }, { x: 170, y: 90 }), ["v:2:1", "v:2:2"]);   // dragged upwards
});

test("boards let go of near a grid line stand along it", () => {
  assert.deepEqual(edgeRun({ x: 170, y: 245 }), ["h:2:3"]);
  assert.deepEqual(edgeRun({ x: 243, y: 170 }, 2), ["v:3:2", "v:3:3"]);
});

test("a box is its four sides", () => {
  assert.equal(boxSegs({ x: 0, y: 0 }, { x: 240, y: 160 }).length, 10);
  assert.equal(boxSegs({ x: 0, y: 0 }, { x: 10, y: 10 }).length, 4);                      // never less than a cell
});

test("walls merge into few blocking rects; doors are gaps", () => {
  const segs = built(boxSegs({ x: 0, y: 0 }, { x: 240, y: 160 }));
  assert.equal(blockRects(segs).length, 4);
  segs.find((s) => s.k === "h:1:2").kind = "door";
  assert.equal(blockRects(segs).length, 5);
  assert.deepEqual(blockRects(built(["h:0:0", "h:1:0"])), [{ x: 0, y: -7, w: 160, h: 14 }]);
  assert.equal(blockRects([newSeg("h:0:0")]).length, 0);                                     // a plan blocks nothing
});

test("four walls make a room; an open side doesn't; a huge ring is outdoors", () => {
  const ring = built(boxSegs({ x: 0, y: 0 }, { x: 240, y: 160 }));
  const [room, ...more] = findRooms(ring);
  assert.equal(more.length, 0);
  assert.equal(room.cells.length, 6); assert.equal(room.id, "0,0");
  assert.deepEqual(room.box, { x: 0, y: 0, w: 240, h: 160 });
  assert.equal(room.rects.length, 2);
  assert.equal(roomAt([room], { x: 200, y: 100 }), room);
  assert.equal(roomAt([room], { x: 260, y: 100 }), null);
  assert.equal(findRooms(ring.slice(1)).length, 0);
  assert.equal(findRooms(built(boxSegs({ x: 0, y: 0 }, { x: 800, y: 720 }))).length, 0);
  assert.equal(findRooms(ring.map((s) => ({ ...s, state: "plan" }))).length, 0);           // plans aren't walls yet
});

test("a door between two rooms joins them into one building", () => {
  const a = boxSegs({ x: 0, y: 0 }, { x: 160, y: 160 }), b = boxSegs({ x: 160, y: 0 }, { x: 320, y: 160 });
  const keys = [...new Set([...a, ...b])];
  const rooms = findRooms(built(keys, ["v:2:0"]));
  assert.equal(rooms.length, 2);
  assert.deepEqual(rooms.map((r) => r.doors), [["v:2:0"], ["v:2:0"]]);
  assert.equal(buildingOf(rooms, rooms[0]).length, 2);
  assert.equal(buildingOf(findRooms(built(keys)), findRooms(built(keys))[0]).length, 1);
});

test("a ring with no door is flagged, planned doors count", () => {
  const keys = boxSegs({ x: 0, y: 0 }, { x: 160, y: 160 });
  assert.equal(doorlessRooms(keys.map((k) => newSeg(k))).length, 1);
  assert.equal(doorlessRooms(keys.map((k) => newSeg(k, { kind: k === "h:0:2" ? "door" : "wall" }))).length, 0);
  assert.equal(doorlessRooms(keys.slice(1).map((k) => newSeg(k))).length, 0);              // not closed: nothing to flag
});

test("rooms are named by what's in them", () => {
  assert.equal(roomName(["bed", "stove"]), "灶房");
  assert.equal(roomName(["bed"], { sleeper: "阿三" }), "阿三的屋");
  assert.equal(roomName(["bed", "bed"]), "卧房");
  assert.equal(roomName(["granary"]), "仓房");
  assert.equal(roomName(["table"]), "堂屋");
  assert.equal(roomName([]), "空屋");
});

test("the old yard snaps onto the grid and keeps its gate as one door", () => {
  const out = fromCompound({ x: 1013, y: 2050, w: 560, h: 640, gate: { x: 1233, w: 120 } }, "fence");
  assert.deepEqual(out.rect, { x: 1040, y: 2080, w: 560, h: 640 });
  assert.equal(out.dx, 27); assert.equal(out.dy, 30);
  const doors = out.segs.filter((s) => s.kind === "door");
  assert.equal(doors.length, 1);
  assert.equal(doors[0].k, "h:16:34");                                                       // the gate's middle, 1293, falls in 1280–1360
  assert.equal(out.segs.length, 2 * (7 + 8));
  assert.ok(out.segs.every((s) => s.state === "built" && s.look === "fence"));
  assert.equal(findRooms(out.segs).length, 1);
});

test("roof cost, what plans want, and work on a segment", () => {
  assert.deepEqual(roofCost(9), { needs: { thatch: 3 }, work: 180 });
  assert.deepEqual(needsOf([newSeg("h:0:0"), newSeg("h:1:0", { kind: "door" }), ...built(["h:2:0"])]), { wattle: 1, clay: 1, doorPanel: 1 });
  const s = newSeg("h:0:0", { plan: "p" });
  assert.equal(addSegWork(s, 60), "working"); assert.equal(s.work, 0);                     // still wants reed and clay
  s.need = { wattle: 0, clay: 0 };
  assert.equal(addSegWork(s, 59), "working");
  assert.equal(addSegWork(s, 1), "built"); assert.equal(s.state, "built");
});
