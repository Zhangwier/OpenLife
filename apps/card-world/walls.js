// Walls on an 80px grid, a segment at a time; whatever they close in is a room. Pure rules: app.js does the rest.

export const GRID = 80, WALL_T = 14, MAX_ROOM = 80;
/** A length of wall or a door: what it takes and how long (game minutes). */
export const SEG_COST = { wall: { needs: { wattle: 1, clay: 1 }, work: 60 }, door: { needs: { doorPanel: 1 }, work: 40 } };
/** Thatch for a room: one mat for every four cells. */
export const roofCost = (cells) => ({ needs: { thatch: Math.ceil(cells / 4) }, work: cells * 20 });

// "h:i:j" is the edge (i*G, j*G)→((i+1)*G, j*G); "v:i:j" is (i*G, j*G)→(i*G, (j+1)*G).
export const segKey = (dir, i, j) => `${dir}:${i}:${j}`;
export function parseSeg(k) {
  const [dir, i, j] = k.split(":");
  return { dir, i: Number(i), j: Number(j) };
}
/** The wall itself, centred on its grid line. */
export function segRect(k, t = WALL_T) {
  const { dir, i, j } = parseSeg(k), x = i * GRID, y = j * GRID, half = Math.floor(t / 2);
  return dir === "h" ? { x, y: y - half, w: GRID, h: t } : { x: x - half, y, w: t, h: GRID };
}
export function segMid(k) {
  const { dir, i, j } = parseSeg(k);
  return dir === "h" ? { x: (i + 0.5) * GRID, y: j * GRID } : { x: i * GRID, y: (j + 0.5) * GRID };
}
export const cellOf = (p) => [Math.floor(p.x / GRID), Math.floor(p.y / GRID)];
const vertex = (p) => [Math.round(p.x / GRID), Math.round(p.y / GRID)];

/** A drag, straightened: from the grid corner nearest where it began, along whichever way it went further. */
export function snapLine(a, b) {
  const [i0, j0] = vertex(a), dx = b.x - a.x, dy = b.y - a.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < GRID / 2) return [];
  const out = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const i1 = Math.round(b.x / GRID);
    for (let i = Math.min(i0, i1); i < Math.max(i0, i1); i++) out.push(segKey("h", i, j0));
  } else {
    const j1 = Math.round(b.y / GRID);
    for (let j = Math.min(j0, j1); j < Math.max(j0, j1); j++) out.push(segKey("v", i0, j));
  }
  return out;
}
/** Where wall boards let go of at p stand: along the grid line nearest p, n lengths from p's cell on. */
export function edgeRun(p, n = 1) {
  const fx = p.x / GRID, fy = p.y / GRID, out = [];
  if (Math.abs(fy - Math.round(fy)) <= Math.abs(fx - Math.round(fx))) {
    const j = Math.round(fy), i0 = Math.floor(fx);
    for (let k = 0; k < n; k++) out.push(segKey("h", i0 + k, j));
  } else {
    const i = Math.round(fx), j0 = Math.floor(fy);
    for (let k = 0; k < n; k++) out.push(segKey("v", i, j0 + k));
  }
  return out;
}
/** The four sides of the box between the grid corners nearest the two points; never less than one cell. */
export function boxSegs(a, b) {
  let [i0, j0] = vertex(a), [i1, j1] = vertex(b);
  if (i1 < i0) [i0, i1] = [i1, i0];
  if (j1 < j0) [j0, j1] = [j1, j0];
  if (i1 === i0) i1 = i0 + 1;
  if (j1 === j0) j1 = j0 + 1;
  const out = [];
  for (let i = i0; i < i1; i++) out.push(segKey("h", i, j0), segKey("h", i, j1));
  for (let j = j0; j < j1; j++) out.push(segKey("v", i0, j), segKey("v", i1, j));
  return out;
}

/** A segment newly planned: it wants its materials, then its work. */
export const newSeg = (k, { kind = "wall", look = "mud", plan, by } = {}) =>
  ({ k, kind, look, state: "plan", need: { ...SEG_COST[kind].needs }, work: 0, plan, ...(by ? { by } : {}) });

/** What stands in the way: built walls (not doors), runs along one line merged into one rectangle. */
export function blockRects(segs) {
  const lines = new Map();
  for (const s of segs) {
    if (s.state !== "built" || s.kind === "door") continue;
    const { dir, i, j } = parseSeg(s.k), line = dir === "h" ? `h:${j}` : `v:${i}`;
    if (!lines.has(line)) lines.set(line, []);
    lines.get(line).push(dir === "h" ? i : j);
  }
  const out = [];
  for (const [line, at] of lines) {
    const [dir, n] = line.split(":"), fixed = Number(n);
    at.sort((a, b) => a - b);
    for (let k = 0; k < at.length;) {
      let end = k;
      while (end + 1 < at.length && at[end + 1] <= at[end] + 1) end++;
      const first = segRect(segKey(dir, dir === "h" ? at[k] : fixed, dir === "h" ? fixed : at[k]));
      const len = (at[end] - at[k] + 1) * GRID;
      out.push(dir === "h" ? { ...first, w: len } : { ...first, h: len });
      k = end + 1;
    }
  }
  return out;
}

const cellKey = (i, j) => `${i},${j}`;
/** The edge crossed stepping from (i, j) by (di, dj). */
const edgeBetween = (i, j, di, dj) => (di ? segKey("v", i + Math.max(0, di), j) : segKey("h", i, j + Math.max(0, dj)));
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Cells either side of a segment. */
function sides(k) {
  const { dir, i, j } = parseSeg(k);
  return dir === "h" ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]];
}
function rowRects(cells) {
  const rows = new Map();
  for (const [i, j] of cells) { if (!rows.has(j)) rows.set(j, []); rows.get(j).push(i); }
  const out = [];
  for (const [j, is] of [...rows].sort((a, b) => a[0] - b[0])) {
    is.sort((a, b) => a - b);
    for (let k = 0; k < is.length;) {
      let end = k;
      while (end + 1 < is.length && is[end + 1] === is[end] + 1) end++;
      out.push({ x: is[k] * GRID, y: j * GRID, w: (is[end] - is[k] + 1) * GRID, h: GRID });
      k = end + 1;
    }
  }
  return out;
}
/** Closed-in places. `closed` is the set of edges that stop a step; `doors` the door keys among them. */
function enclosures(closed, doors, maxCells) {
  const outside = new Set(), done = new Set(), rooms = [];
  const starts = [...closed].flatMap(sides);
  for (const [si, sj] of starts) {
    const s0 = cellKey(si, sj);
    if (done.has(s0) || outside.has(s0)) continue;
    const seen = new Set([s0]), queue = [[si, sj]];
    let leaked = false;
    while (queue.length && !leaked) {
      const [i, j] = queue.pop();
      for (const [di, dj] of STEPS) {
        if (closed.has(edgeBetween(i, j, di, dj))) continue;
        const n = cellKey(i + di, j + dj);
        if (seen.has(n)) continue;
        if (outside.has(n)) { leaked = true; break; }
        seen.add(n); queue.push([i + di, j + dj]);
        if (seen.size > maxCells) { leaked = true; break; }
      }
    }
    if (leaked) { for (const c of seen) outside.add(c); continue; }
    for (const c of seen) done.add(c);
    const cells = [...seen].map((c) => c.split(",").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const own = new Set(seen);
    const border = [...doors].filter((d) => sides(d).some(([i, j]) => own.has(cellKey(i, j))));
    const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
    const box = { x: Math.min(...xs) * GRID, y: Math.min(...ys) * GRID, w: (Math.max(...xs) - Math.min(...xs) + 1) * GRID, h: (Math.max(...ys) - Math.min(...ys) + 1) * GRID };
    rooms.push({ id: cellKey(...cells[0]), cells, rects: rowRects(cells), box, doors: border });
  }
  return rooms;
}
/** Rooms: places shut in by built walls and doors, no bigger than maxCells (bigger is just the outdoors fenced off). */
export function findRooms(segs, maxCells = MAX_ROOM) {
  const built = segs.filter((s) => s.state === "built");
  return enclosures(new Set(built.map((s) => s.k)), new Set(built.filter((s) => s.kind === "door").map((s) => s.k)), maxCells);
}
/** Rooms there will be once the plans are built that nobody could get into or out of. */
export function doorlessRooms(segs) {
  return enclosures(new Set(segs.map((s) => s.k)), new Set(segs.filter((s) => s.kind === "door").map((s) => s.k)), MAX_ROOM)
    .filter((r) => !r.doors.length);
}
export const roomAt = (rooms, p) => {
  const [i, j] = cellOf(p);
  return rooms.find((r) => r.cells.some(([a, b]) => a === i && b === j)) ?? null;
};
/** The rooms joined to this one through doors, itself included. */
export function buildingOf(rooms, room) {
  const out = [room], seen = new Set([room.id]);
  for (let k = 0; k < out.length; k++) {
    for (const d of out[k].doors) for (const r of rooms) {
      if (!seen.has(r.id) && r.doors.includes(d)) { seen.add(r.id); out.push(r); }
    }
  }
  return out;
}
/** What a room is, from what's in it. */
export function roomName(keys, { sleeper } = {}) {
  if (keys.includes("stove")) return "灶房";
  const beds = keys.filter((k) => k === "bed").length;
  if (beds) return beds === 1 && sleeper ? `${sleeper}的屋` : "卧房";
  if (keys.includes("granary") || keys.includes("store")) return "仓房";
  if (keys.includes("table")) return "堂屋";
  return "空屋";
}
/** An old walled compound put on the grid: snapped, walled all round, the bottom segment nearest its gate a door. */
export function fromCompound(c, look) {
  const x = Math.round(c.x / GRID) * GRID, y = Math.round(c.y / GRID) * GRID;
  const w = Math.max(1, Math.round(c.w / GRID)) * GRID, h = Math.max(1, Math.round(c.h / GRID)) * GRID;
  const gx = c.gate ? c.gate.x + c.gate.w / 2 : x + w / 2, bottom = (y + h) / GRID;
  const keys = boxSegs({ x, y }, { x: x + w, y: y + h });
  const doorAt = keys.filter((k) => k.startsWith("h:") && parseSeg(k).j === bottom)
    .sort((a, b) => Math.abs(segMid(a).x - gx) - Math.abs(segMid(b).x - gx))[0];
  const segs = keys.map((k) => {
    const kind = k === doorAt ? "door" : "wall";
    return { ...newSeg(k, { kind, look }), state: "built", need: {}, work: SEG_COST[kind].work };
  });
  return { rect: { x, y, w, h }, dx: x - c.x, dy: y - c.y, segs };
}
/** What the planned segments still want, all together. */
export function needsOf(segs) {
  const out = {};
  for (const s of segs) if (s.state === "plan") for (const [k, n] of Object.entries(s.need)) if (n > 0) out[k] = (out[k] ?? 0) + n;
  return out;
}
/** Work on a segment, once its materials are all in. */
export function addSegWork(seg, minutes) {
  if (Object.values(seg.need).some((n) => n > 0)) return "working";
  seg.work += minutes;
  if (seg.work < SEG_COST[seg.kind].work) return "working";
  seg.state = "built"; seg.work = SEG_COST[seg.kind].work;
  return "built";
}
