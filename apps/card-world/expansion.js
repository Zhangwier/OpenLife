// When and where the village builds on: another bedroom, a room for a couple, or a store.
// Pure; app.js turns the answer into a plan of wall segments and a door in the shared wall.
import { GRID, parseSeg, segKey } from "./walls.js";

/** Why the village would build on, if it would. Autumn and winter wait, and so does an open plan. */
export function extensionNeed({ adults = 0, beds = 0, freeBedSpots = 0, couplesWithoutRoom = 0, heapKinds = 0, heapCap = 0, season, planning = false } = {}) {
  if (planning || season === "秋" || season === "冬") return null;
  if (couplesWithoutRoom > 0) return { kind: "couple", w: 3, h: 3, because: "成了家，该有自己的一间" };
  if (adults > beds && freeBedSpots === 0) return { kind: "bedroom", w: 3, h: 3, because: "屋里摆不下铺位了，接一间屋" };
  if (heapKinds > heapCap) return { kind: "store", w: 4, h: 3, because: "材料堆不下了，接一间仓房" };
  return null;
}

/** Every edge around a set of cells, once. */
function perimeterOf(cells) {
  const taken = new Set(cells.map(([i, j]) => `${i},${j}`));
  const keys = new Set();
  for (const [i, j] of cells) {
    if (!taken.has(`${i},${j - 1}`)) keys.add(segKey("h", i, j));
    if (!taken.has(`${i},${j + 1}`)) keys.add(segKey("h", i, j + 1));
    if (!taken.has(`${i - 1},${j}`)) keys.add(segKey("v", i, j));
    if (!taken.has(`${i + 1},${j}`)) keys.add(segKey("v", i + 1, j));
  }
  return [...keys];
}

const along = (s) => (s.dir === "h" ? s.i : s.j);

/** The door goes in the middle of the longest shared run, preferring a wall over an existing door. */
function pickDoor(shared, built) {
  const lines = new Map();
  for (const k of shared) {
    const s = parseSeg(k);
    const line = `${s.dir}:${s.dir === "h" ? s.j : s.i}`;
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push({ k, ...s });
  }

  let best = null;
  for (const list of lines.values()) {
    list.sort((a, b) => along(a) - along(b));
    for (let start = 0; start < list.length;) {
      let end = start + 1;
      while (end < list.length && along(list[end]) === along(list[end - 1]) + 1) end++;
      const run = list.slice(start, end);
      if (!best || run.length > best.length || (run.length === best.length && along(run[0]) < along(best[0]))) best = run;
      start = end;
    }
  }

  const mid = (along(best[0]) + along(best[best.length - 1])) / 2;
  const walls = best.filter((s) => built.get(s.k)?.kind !== "door");
  const pool = walls.length ? walls : best;
  pool.sort((a, b) => Math.abs(along(a) - mid) - Math.abs(along(b) - mid) || along(a) - along(b));
  return pool[0].k;
}

/** Lower scores win; equal scores go to the box with the smaller j, then the smaller i. */
function takes(score, i0, j0, bw, bh, best) {
  if (!best) return true;
  if (score < best.score - 1e-9) return true;
  if (score > best.score + 1e-9) return false;
  if (j0 !== best.j0) return j0 < best.j0;
  if (i0 !== best.i0) return i0 < best.i0;
  if (bw !== best.bw) return bw < best.bw;
  return bh < best.bh;
}

/**
 * Where to attach a w×h room: against the outside of a built wall, sharing at least two segments,
 * on free ground outside every room. Cheapest new walls, then closest to home.
 */
export function extensionSite({ segs = [], rooms = [], w, h, free, home }) {
  const built = new Map();
  for (const seg of segs) if (seg.state === "built") built.set(seg.k, seg);

  const roomCells = new Set();
  const border = new Set();
  for (const room of rooms) {
    const inside = new Set(room.cells.map(([i, j]) => `${i},${j}`));
    for (const [i, j] of room.cells) {
      roomCells.add(`${i},${j}`);
      if (!inside.has(`${i},${j - 1}`)) border.add(segKey("h", i, j));
      if (!inside.has(`${i},${j + 1}`)) border.add(segKey("h", i, j + 1));
      if (!inside.has(`${i - 1},${j}`)) border.add(segKey("v", i, j));
      if (!inside.has(`${i + 1},${j}`)) border.add(segKey("v", i + 1, j));
    }
  }

  const anchors = [...built.values()].filter((s) => border.has(s.k));
  const shapes = w === h ? [[w, h]] : [[w, h], [h, w]];
  const seen = new Set();
  let best = null;

  const consider = (i0, j0, bw, bh) => {
    const id = `${i0},${j0},${bw},${bh}`;
    if (seen.has(id)) return;
    seen.add(id);

    const cells = [];
    for (let j = j0; j < j0 + bh; j++) for (let i = i0; i < i0 + bw; i++) cells.push([i, j]);
    for (const [i, j] of cells) if (roomCells.has(`${i},${j}`) || !free(i, j)) return;

    const perimeter = perimeterOf(cells);
    const shared = perimeter.filter((k) => built.has(k));
    if (shared.length < 2) return;
    const fresh = perimeter.filter((k) => !built.has(k));

    const cx = (i0 + bw / 2) * GRID;
    const cy = (j0 + bh / 2) * GRID;
    const score = fresh.length + Math.hypot(cx - home.x, cy - home.y) / GRID / 4;
    if (!takes(score, i0, j0, bw, bh, best)) return;
    best = { score, i0, j0, bw, bh, cells, segs: fresh, door: pickDoor(shared, built) };
  };

  for (const [bw, bh] of shapes) {
    for (const anchor of anchors) {
      const { dir, i, j } = parseSeg(anchor.k);
      if (dir === "h") {
        for (let i0 = i - bw + 1; i0 <= i; i0++) {
          consider(i0, j - bh, bw, bh);        // box above the wall
          consider(i0, j, bw, bh);             // box below it
        }
      } else {
        for (let j0 = j - bh + 1; j0 <= j; j0++) {
          consider(i - bw, j0, bw, bh);        // box left of the wall
          consider(i, j0, bw, bh);             // box right of it
        }
      }
    }
  }

  return best ? { cells: best.cells, segs: best.segs, door: best.door } : null;
}
