// Seeded map generation for the card world (see DESIGN.md · 地图生成).
// One land = one landform template + one seed + one content pack of sites.
// Pipeline: elevation → water (lake basin, river by least cost to the sea) → ground classes → sites by rules → roads → checks (else reroll).

export const CELL = 40;
export const why = {};   // why layouts were rejected (for tuning)
const fail = (k) => { why[k] = (why[k] ?? 0) + 1; return null; };
// CAVE: the floor of a tunnel cut into the mountain — walkable rock, under a cover until you are inside.
export const G = { DEEP: 0, SHALLOW: 1, FORD: 2, SAND: 3, MEADOW: 4, FOREST: 5, SLOPE: 6, SCREE: 7, ROCK: 8, SNOW: 9, VOID: 10, CAVE: 11 };
const WALK = [false, false, true, true, true, true, true, true, false, false, false, true];
const COST = [Infinity, Infinity, 4, 1.3, 1, 2, 2.6, 3, Infinity, Infinity, Infinity, 1.4];
const isRock = (c) => c === G.ROCK || c === G.SNOW;

export function rng(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Smooth value noise, 0..1, four octaves. */
function fbm(seed) {
  const R = rng(seed), S = 256, V = new Float32Array(S * S);
  for (let i = 0; i < V.length; i++) V[i] = R();
  const at = (x, y) => V[(y & (S - 1)) * S + (x & (S - 1))];
  const one = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx, b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
  return (x, y) => { let s = 0, a = 0.5, f = 1, t = 0; for (let o = 0; o < 4; o++) { s += a * one(x * f + o * 17.3, y * f - o * 9.1); t += a; a *= 0.5; f *= 2; } return s / t; };
}
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Minimal binary heap for path searches. */
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

/** Cheapest route over the grid (8 directions, no corner cutting). cost(i) = Infinity blocks. goal(i) or a target index. */
function search(cols, rows, start, goal, cost, h = () => 0) {
  const N = cols * rows, dist = new Float64Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), heap = new Heap();
  const isGoal = typeof goal === "function" ? goal : (i) => i === goal;
  dist[start] = 0; heap.push(h(start), start);
  while (heap.size) {
    const i = heap.pop();
    if (isGoal(i)) { const out = []; for (let j = i; j >= 0; j = from[j]) out.push(j); return out.reverse(); }
    const c = i % cols, r = (i - c) / cols;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const j = nr * cols + nc, w = cost(j);
      if (w === Infinity) continue;
      if (dx && dy && (cost(r * cols + nc) === Infinity || cost(nr * cols + c) === Infinity)) continue;
      const nd = dist[i] + w * (dx && dy ? 1.414 : 1);
      if (nd < dist[j]) { dist[j] = nd; from[j] = i; heap.push(nd + h(j), j); }
    }
  }
  return null;
}
/** Breadth-first distance (in cells) from every source cell. */
function spread(cols, rows, isSource) {
  const N = cols * rows, d = new Float32Array(N).fill(1e9), q = new Int32Array(N); let a = 0, b = 0;
  for (let i = 0; i < N; i++) if (isSource(i)) { d[i] = 0; q[b++] = i; }
  while (a < b) {
    const i = q[a++], c = i % cols;
    for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) if (j >= 0 && j < N && d[j] > d[i] + 1) { d[j] = d[i] + 1; q[b++] = j; }
  }
  return d;
}
function chaikin(pts, n = 2) {
  for (let k = 0; k < n; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}

/**
 * A valley: mountains on three sides (north, west, east), a lake in the middle, one river from the lake south to the sea.
 * specs: the content pack — which places this land has and where each likes to be (see app.js · SITES).
 */
/** opts.plain: open rolling ground with no mountain rim, lake or river — a tile that sits among other tiles. */
export function generateValley(seed, W, H, specs, opts = {}) {
  for (let tries = 0; tries < 40; tries++) {
    const m = tryValley(seed + tries * 7919, W, H, specs, opts);
    if (m) { m.seed = seed; m.tries = tries + 1; return m; }
  }
  throw new Error("valley: no layout passed the checks");
}

function tryValley(seed, W, H, specs, opts = {}) {
  const plain = Boolean(opts.plain), margin = opts.margin ?? 400;
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const R = rng(seed ^ 0x5bd1);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const idx = (x, y) => Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x / CELL)));

  // 1 · elevation: a bowl open to the south, plus noise; a basin for the lake; the sea along the south edge
  const lake = { x: W * (0.5 + (R() - 0.5) * 0.16), y: H * (0.4 + (R() - 0.5) * 0.08), rx: W * (0.1 + R() * 0.03), ry: H * (0.1 + R() * 0.03) };
  const seaY = (x) => H * (0.93 + 0.05 * (nA(x / 900, 3.3) - 0.5));
  const elev = new Float32Array(N), water = new Uint8Array(N); // 1 lake, 2 river, 3 sea
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i), v = y / H;
    if (plain) { elev[i] = 0.36 + 0.1 * (nA(x / 900, y / 900) - 0.5) + 0.04 * (nC(x / 300, y / 300) - 0.5); continue; }
    const band = H * 0.3 * (0.65 + 0.7 * nB(x / 1300, y / 1300)) * (1 - 0.3 * smooth(0.75, 1, v));
    const m = smooth(band, 0, Math.min(y, x, W - x));
    const ridge = 1 - Math.abs(2 * nC(x / 380, y / 380) - 1);
    let e = 0.3 + 0.08 * (1 - v) + 0.72 * m + 0.34 * m * (ridge - 0.5) + 0.14 * (nA(x / 650, y / 650) - 0.5);
    const lr = Math.hypot((x - lake.x) / lake.rx, (y - lake.y) / lake.ry) / (1 + 0.4 * (nB(x / 520 + 9, y / 520) - 0.5));
    if (lr < 1.6) e = 0.2 + (e - 0.2) * smooth(0.85, 1.6, lr);
    if (lr < 1) water[i] = 1;
    if (y > seaY(x)) { water[i] = 3; e = Math.min(e, 0.12); }
    elev[i] = e;
  }

  // 2 · the river: from the lake's southern shore to the sea, the cheapest way downhill
  const ang = Math.PI / 2 + (R() - 0.5) * 0.9;
  let river;
  if (plain) river = [[W / 2, H + 400], [W / 2 + 1, H + 400]];          // off the tile: nothing flows here
  else {
    let out = idx(lake.x, lake.y);
    for (let s = 0; s < 4000 && water[out] === 1; s += CELL / 2) out = idx(lake.x + Math.cos(ang) * s, lake.y + Math.sin(ang) * s);
    const path = search(cols, rows, out, (i) => water[i] === 3, (j) => (water[j] === 1 ? Infinity : 1 + 60 * Math.max(0, elev[j] - 0.4) + 3 * nC(X(j) / 500, Y(j) / 500)));
    if (!path || path.length < 12) return fail("river");
    river = chaikin(path.map((i) => [X(i), Y(i)]), 3);
    river.unshift([lake.x + Math.cos(ang) * lake.rx * 0.8, lake.y + Math.sin(ang) * lake.ry * 0.8]);
  }
  const fordAt = 0.35 + R() * 0.2, fi = Math.floor(river.length * fordAt), fordPt = river[fi];
  const fa = river[Math.max(0, fi - 4)], fb = river[Math.min(river.length - 1, fi + 4)], fl = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]) || 1;
  const fordDir = [(fb[0] - fa[0]) / fl, (fb[1] - fa[1]) / fl];          // along the river; the bridge runs across it
  const riverW = (t) => CELL * (1.5 + 1.4 * t);
  const ford = new Uint8Array(N), rd = new Float32Array(N).fill(1e9), rt = new Float32Array(N);
  for (let k = 0; k < river.length - 1; k++) {                       // distance to the river, only near it
    const [ax, ay] = river[k], [bx, by] = river[k + 1], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t0 = k / river.length;
    const reach = riverW(t0) + CELL * 4, c0 = Math.floor((Math.min(ax, bx) - reach) / CELL), c1 = Math.floor((Math.max(ax, bx) + reach) / CELL);
    const r0 = Math.floor((Math.min(ay, by) - reach) / CELL), r1 = Math.floor((Math.max(ay, by) + reach) / CELL);
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
      const i = r * cols + c, x = X(i), y = Y(i), t = clamp01(((x - ax) * dx + (y - ay) * dy) / L), d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
      if (d < rd[i]) { rd[i] = d; rt[i] = t0; }
    }
  }
  for (let i = 0; i < N; i++) {
    if (rd[i] > 1e8) continue;
    const best = rd[i], bt = rt[i], x = X(i), y = Y(i);
    if (best < riverW(bt) && water[i] !== 3) {
      if (water[i] !== 1) water[i] = 2;
      elev[i] = Math.min(elev[i], 0.2);
      const along = (x - fordPt[0]) * fordDir[0] + (y - fordPt[1]) * fordDir[1], across = (x - fordPt[0]) * fordDir[1] - (y - fordPt[1]) * fordDir[0];
      if (Math.abs(along) < 62 && Math.abs(across) < riverW(fordAt) + CELL * 1.5) ford[i] = 1;
    } else if (best < riverW(bt) + CELL * 3) elev[i] = Math.min(elev[i], 0.22 + best / 9000);
  }

  // 3 · ground classes
  const isWater = (i) => water[i] > 0 && !ford[i];
  const dw = spread(cols, rows, isWater), dl = spread(cols, rows, (i) => water[i] === 1), dr = spread(cols, rows, (i) => water[i] === 2), ds = spread(cols, rows, (i) => water[i] === 3);
  const cls = new Uint8Array(N), mo = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i), e = elev[i];
    // The valley's back (north) carries a broad wood that climbs the lower slopes; it thins out towards
    // the lake and the fields, so the village keeps its open ground.
    const back = 1 - smooth(H * 0.15, H * 0.62, y);
    mo[i] = 0.65 * nB(x / 1000 + 4, y / 1000) + 0.35 * (1 - Math.min(1, dw[i] / 8));
    if (ford[i]) cls[i] = G.FORD;
    else if (water[i]) cls[i] = dw[i] === 0 && [i - 1, i + 1, i - cols, i + cols].some((j) => j >= 0 && j < N && !isWater(j)) ? G.SHALLOW : G.DEEP;
    else if (e > 1.0) cls[i] = G.SNOW;
    else if (e > 0.76) cls[i] = G.ROCK;
    else if (e > 0.64) cls[i] = nA(x / 260, y / 260) > 0.6 ? G.SCREE : mo[i] > 0.44 - 0.12 * back ? G.FOREST : G.SLOPE;
    else if (dw[i] <= 1 || (ds[i] <= 3)) cls[i] = G.SAND;
    else cls[i] = nC(x / 800 + 7, y / 800 + 3) > 0.6 - 0.3 * back && mo[i] > 0.42 - 0.2 * back ? G.FOREST : G.MEADOW;
  }
  // Let the woods settle: a meadow with five wooded neighbours fills in, a lone tree out in the open dies back.
  // Two passes turn the noisy scatter into solid stands with a ragged edge — a wood you can be deep inside of.
  for (let pass = 0; pass < 2; pass++) {
    const next = cls.slice();
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, k = cls[i];
      if (k !== G.MEADOW && k !== G.FOREST) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const rr = r + dy, cc = c + dx;
        if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && cls[rr * cols + cc] === G.FOREST) n++;
      }
      if (k === G.MEADOW && n >= 5) next[i] = G.FOREST;
      else if (k === G.FOREST && n <= 1) next[i] = G.MEADOW;
    }
    cls.set(next);
  }
  const dm = spread(cols, rows, (i) => isRock(cls[i]));

  // 4 · sites, by rules (content pack): terrain, distance from another site, near which water, near the mountains…
  const sites = {}, taken = [], jungle = new Uint8Array(N), orchard = new Uint8Array(N);
  const roomy = (i) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * cols + dx; if (j >= 0 && j < N && WALK[cls[j]]) n++; } return n; };
  const extent = new Map();                       // taken cell → patch size, for places that spread over a patch (the field)
  const free = (i, gap) => taken.every((t) => {
    if (Math.hypot(X(t) - X(i), Y(t) - Y(i)) <= gap) return false;
    const e = extent.get(t);
    return !e || Math.hypot(Math.max(0, Math.abs(X(t) - X(i)) - e.w / 2), Math.max(0, Math.abs(Y(t) - Y(i)) - e.h / 2)) > 260;     // clear of the patch and the granary row above it
  });
  for (const s of specs) {
    let best = -1, bs = -Infinity;
    const ref = s.from ? sites[s.from] : null;
    for (let i = 0; i < N; i++) {
      if (!s.ground.includes(cls[i]) || !free(i, s.gap ?? 560) || roomy(i) < (s.room ?? 15)) continue;
      const x = X(i), y = Y(i);
      if (x < margin || x > W - margin || y < Math.min(300, margin)) continue;
      const near = { lake: dl[i], river: dr[i], sea: ds[i], water: dw[i], mountain: dm[i] };
      if (s.water && !(near[s.water[0]] * CELL >= s.water[1] && near[s.water[0]] * CELL <= s.water[2])) continue;
      if (s.mountain && !(dm[i] * CELL >= s.mountain[0] && dm[i] * CELL <= s.mountain[1])) continue;
      if (s.north && y > H * s.north) continue;
      if (s.west && x < s.west) continue;                // e.g. keep clear of a tile laid over this one's west edge
      if (s.east && x > s.east) continue;
      if (s.south && y < H * s.south) continue;
      const hw = 140 + (s.w ?? 0) / 2, hh = 140 + (s.h ?? 0) / 2;            // a patch (the field) keeps its whole width off
      if (Object.values(sites).some((o) => o.yard && x > o.x + o.yard.x - hw && x < o.x + o.yard.x + o.yard.w + hw
        && y > o.y + o.yard.y - hh && y < o.y + o.yard.y + o.yard.h + hh)) continue;   // nothing stands against a yard wall
      let score = R() * 0.4;
      if (ref) {
        const d = Math.hypot(x - ref.x, y - ref.y);
        if (d < s.dist[0] || d > s.dist[1]) continue;
        score -= Math.abs(d - (s.dist[0] + s.dist[1]) / 2) / 1000;
        if (s.dir !== undefined) {                       // keep the places spread round the yard, not piled on one side
          const a = Math.atan2(y - ref.y, x - ref.x);
          const da = Math.abs(((a - s.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          score -= da * (s.dirW ?? 1.15);
        }
      }
      if (s.prefer) score += s.prefer({ x, y, W, H, lake, mouth: river[river.length - 1], e: elev[i], ...near });
      if (score > bs) { bs = score; best = i; }
    }
    if (best < 0) return fail(`site:${s.key}`);
    sites[s.key] = { key: s.key, name: s.name, patch: s.patch, w: s.w, h: s.h, yard: s.yard, x: X(best), y: Y(best) };
    taken.push(best); if (s.w) extent.set(best, { w: s.w, h: s.h });
    // What a place is made of shows on the ground: a rubble field round the stones, a big wood round the trees,
    // and a jungle — the thickest wood, marked so that people who know better keep out of it.
    const ground = s.rubble ? [s.rubble, G.SCREE] : s.grove ? [s.grove, G.FOREST] : s.jungle ? [s.jungle, G.FOREST] : s.orchard ? [s.orchard, G.MEADOW] : null;
    if (ground) {
      const [r, as] = ground, cx = X(best), cy = Y(best), clear = s.clear ?? 160;
      for (let i = 0; i < N; i++) {
        if (cls[i] !== G.MEADOW && cls[i] !== G.SLOPE && cls[i] !== G.FOREST && cls[i] !== G.SCREE) continue;
        if ((s.jungle || s.orchard) && taken.slice(0, -1).some((t) => Math.hypot(X(t) - X(i), Y(t) - Y(i)) < (s.orchard ? 300 : 380))) continue;   // never swallow another place
        const d = Math.hypot(X(i) - cx, (Y(i) - cy) * 1.15);
        if (s.orchard) { if (d < r) { cls[i] = G.MEADOW; orchard[i] = 1; } continue; }            // a tended, roughly round orchard
        if (d > clear && d < r * (0.7 + 0.6 * nB(X(i) / 300 + 3, Y(i) / 300))) { cls[i] = as; if (s.jungle) jungle[i] = 1; }
        else if (s.jungle && d <= clear) jungle[i] = 1;
      }
    }
  }

  // 5 · everything must be reachable on foot from home
  const walkReach = new Uint8Array(N);
  { const q = [idx(sites.home.x, sites.home.y)]; walkReach[q[0]] = 1;
    while (q.length) { const i = q.pop(), c = i % cols; for (const j of [c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1, i - cols, i + cols]) if (j >= 0 && j < N && !walkReach[j] && WALK[cls[j]]) { walkReach[j] = 1; q.push(j); } } }
  for (const s of Object.values(sites)) if (!walkReach[idx(s.x, s.y)]) return fail(`reach:${s.key}`);

  // 6 · roads from home to each place; later roads reuse earlier ones
  const road = new Uint8Array(N), roads = [];
  const order = Object.values(sites).filter((s) => s.key !== "home").sort((a, b) => Math.hypot(a.x - sites.home.x, a.y - sites.home.y) - Math.hypot(b.x - sites.home.x, b.y - sites.home.y));
  for (const s of order) {
    const p = search(cols, rows, idx(sites.home.x, sites.home.y), idx(s.x, s.y), (j) => COST[cls[j]] * (road[j] ? 0.35 : 1));
    if (!p) return fail("road");
    let k = 0; while (k < p.length - 1 && road[p[k + 1]]) k++;           // draw only the new stretch
    const fresh = p.slice(Math.max(0, k));
    for (const j of p) road[j] = 1;
    if (fresh.length > 1) roads.push(chaikin(fresh.map((i) => [X(i), Y(i)]), 2));
  }

  // How far inside the wood each cell sits (0 at the tree line, 1 six cells in). Animals read this as
  // "how much cover is here", so they keep to the thick of the wood without a fence drawn round them.
  // Measured after the places have grown their woods (the jungle, the chestnut grove), so those count too.
  const dEdge = spread(cols, rows, (i) => cls[i] !== G.FOREST);
  const cover = new Float32Array(N);
  for (let i = 0; i < N; i++) cover[i] = Math.min(1, dEdge[i] / 6);

  return { W, H, cols, rows, elev, water, ford, cls, mo, cover, road, river, riverW, fordPt, fordDir, lake, sites, roads, seaY, dm, dw, X, Y, idx, jungle, orchard };
}

// ---------------------------------------------------------------------------
/** How much cover a point has: 0 in the open, 1 in the thick of the wood (six cells in or more). */
export function woodDepth(m, x, y) {
  return m.cover[m.idx(x, y)] ?? 0;
}

// ---------------------------------------------------------------------------
// Tiles: one world made of overlapping rectangles. Each tile has its own generator and coordinates; the
// wood is laid over the valley where the rectangles overlap, and that overlap is the open ground people
// walk through. Everything outside the tiles is mist — not ground, not water, just the edge of the world.
// ---------------------------------------------------------------------------
/** An old wood: rolling forest with glades, boulder patches and a clearing in the middle. No water of its own.
 *  deep: the wood behind the wood — no glades, the canopy closed overhead, all of it jungle (the tiger's ground). */
export function makeWood(seed, W, H, deep = false) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N), elev = new Float32Array(N), mo = new Float32Array(N), dense = new Float32Array(N), jungle = new Uint8Array(N);
  const cx = W * 0.54, cy = H * 0.44, cr = Math.min(W, H) * 0.09;          // a clearing in the middle
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    const e = 0.58 + 0.2 * (nB(x / 760, y / 760) - 0.5) + 0.06 * (nC(x / 260, y / 260) - 0.5);
    elev[i] = e;
    mo[i] = 0.55 + 0.3 * (nA(x / 600, y / 600) - 0.5);
    dense[i] = deep ? 0.9 : Math.max(0.3, Math.min(0.95, 0.55 + 0.7 * (nB(x / 340 + 11, y / 340 + 4) - 0.15)));
    const glade = !deep && (nC(x / 560 + 3, y / 560 + 7) > 0.58 || Math.hypot(x - cx, y - cy) < cr);
    const rocky = e > 0.62 && nA(x / 240 + 5, y / 240 + 9) > (deep ? 0.7 : 0.56);
    cls[i] = rocky ? (nC(x / 320, y / 320) > 0.5 ? G.SCREE : G.SLOPE) : glade ? G.MEADOW : G.FOREST;
    if (deep && cls[i] === G.FOREST) jungle[i] = 1;
  }
  return { W, H, cols, rows, cls, elev, mo, dense, jungle, water: new Uint8Array(N), ford: new Uint8Array(N), road: new Uint8Array(N), orchard: new Uint8Array(N) };
}

/** Open meadow and nothing else: ground to be broken for fields. */
export function makePlain(seed, W, H) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N).fill(G.MEADOW), elev = new Float32Array(N), mo = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    elev[i] = 0.35 + 0.06 * (nA(x / 900, y / 900) - 0.5);
    mo[i] = 0.62 + 0.3 * (nB(x / 700, y / 700) - 0.5);                       // a little damper than the home plain
  }
  return { W, H, cols, rows, cls, elev, mo, water: new Uint8Array(N), ford: new Uint8Array(N), road: new Uint8Array(N), jungle: new Uint8Array(N), orchard: new Uint8Array(N), dense: new Float32Array(N).fill(0.5) };
}

/** A lake tile: the lake fills most of it, a narrow sand and grass shore round it. */
export function makeLake(seed, W, H) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N), elev = new Float32Array(N), mo = new Float32Array(N), water = new Uint8Array(N);
  const cx = W * 0.5, cy = H * 0.56, rx = W * 0.43, ry = H * 0.38;
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    const wob = 1 + 0.12 * (nA(x / 420 + 5, y / 420 + 2) - 0.5);
    const lr = Math.hypot((x - cx) / (rx * wob), (y - cy) / (ry * wob));
    elev[i] = 0.36 + 0.05 * (nB(x / 800, y / 800) - 0.5);
    mo[i] = 0.6 + 0.2 * (nC(x / 500, y / 500) - 0.5);
    if (lr < 1) { water[i] = 1; cls[i] = G.DEEP; }
    else if (lr < 1.08) cls[i] = G.SAND;
    else cls[i] = G.MEADOW;
  }
  return { W, H, cols, rows, cls, elev, mo, water, lake: { x: cx, y: cy }, ford: new Uint8Array(N), road: new Uint8Array(N), jungle: new Uint8Array(N), orchard: new Uint8Array(N), dense: new Float32Array(N).fill(0.5) };
}

/** A plateau: high, broken ground behind a ring of cliffs. You can't simply walk up; up there every step is hard. */
export function makePlateau(seed, W, H) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N), elev = new Float32Array(N), mo = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i), edge = Math.min(x, y, W - x, H - y) / CELL;
    const rim = 2.6 + 2.4 * nA(x / 300, y / 300);                          // a ragged cliff, 3–5 cells deep
    mo[i] = 0.4 + 0.3 * (nB(x / 600, y / 600) - 0.5);
    if (edge < rim) { cls[i] = G.ROCK; elev[i] = 0.82 + 0.1 * nB(x / 200, y / 200); continue; }
    elev[i] = 0.66 + 0.08 * (nB(x / 700, y / 700) - 0.5);
    const r = nC(x / 260, y / 260);
    cls[i] = r > 0.78 ? G.SCREE : nA(x / 500 + 3, y / 500 + 1) > 0.56 ? G.SLOPE : G.MEADOW;
  }
  return { W, H, cols, rows, cls, elev, mo, water: new Uint8Array(N), ford: new Uint8Array(N), road: new Uint8Array(N), jungle: new Uint8Array(N), orchard: new Uint8Array(N), dense: new Float32Array(N).fill(0.4) };
}

/** A great mountain, all rock and snow, with one tunnel driven in from its west foot to a chamber where stone is cut. */
export function makeMountain(seed, W, H, ty = H * 0.7) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N), elev = new Float32Array(N), mo = new Float32Array(N), cave = new Uint8Array(N);
  const line = [[0, ty], [W * 0.16, ty + 34], [W * 0.3, ty - 26], [W * 0.42, ty]];
  const ch = { x: W * 0.52, y: ty, rx: 300, ry: 230 };
  const toLine = (x, y) => {
    let best = 1e9;
    for (let k = 0; k < line.length - 1; k++) {
      const [ax, ay] = line[k], [bx, by] = line[k + 1], dx = bx - ax, dy = by - ay, t = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
      best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
    }
    return best;
  };
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    const ridge = 1 - Math.abs(2 * nC(x / 420, y / 420) - 1);
    const e = 0.86 + 0.2 * (nB(x / 640, y / 640) - 0.5) + 0.14 * (ridge - 0.5) + 0.12 * smooth(0, W * 0.6, x);
    elev[i] = e; mo[i] = 0.3;
    cls[i] = e > 1.0 ? G.SNOW : G.ROCK;
    const wob = 1 + 0.16 * (nA(x / 160, y / 160) - 0.5);
    if (toLine(x, y) < 66 * wob || Math.hypot((x - ch.x) / ch.rx, (y - ch.y) / ch.ry) < wob) { cls[i] = G.CAVE; elev[i] = 0.5; cave[i] = 1; }
  }
  const tunnel = { x0: 120, y0: ty - ch.ry - 80, x1: ch.x + ch.rx + 80, y1: ty + ch.ry + 80, mouth: { x: 40, y: ty },
    faces: [["mineFace", ch.x + ch.rx * 0.55, ty - 30], ["flintVein", ch.x - ch.rx * 0.35, ty + ch.ry * 0.45]] };
  return { W, H, cols, rows, cls, elev, mo, cave, tunnel, water: new Uint8Array(N), ford: new Uint8Array(N), road: new Uint8Array(N), jungle: new Uint8Array(N), orchard: new Uint8Array(N), dense: new Float32Array(N).fill(0.3) };
}

/** The grassland keeps the valley's rolling ground and its mountain rim, but loses every tree, lake, river and beach. */
function grassify(m) {
  for (let i = 0; i < m.cls.length; i++) {
    const c = m.cls[i];
    if (c === G.FOREST || c === G.SAND || c === G.DEEP || c === G.SHALLOW || c === G.FORD) m.cls[i] = G.MEADOW;
    m.water[i] = 0; m.ford[i] = 0;
  }
  m.river = [];
}

/** Each kind of tile and how its edge meets the sea: woods and rock end in a rocky shore, open ground in a beach. */
const MAKERS = {
  wood: (seed, d) => makeWood(seed ^ 0x5eed, d.w, d.h),
  deep: (seed, d) => makeWood(seed ^ 0x0dee, d.w, d.h, true),
  lake: (seed, d) => makeLake(seed ^ 0x51ee, d.w, d.h),
  plain: (seed, d) => makePlain(seed ^ 0xfa53, d.w, d.h),
  plateau: (seed, d) => makePlateau(seed ^ 0x9a7e, d.w, d.h),
  mountain: (seed, d) => makeMountain(seed ^ 0x3a11, d.w, d.h, d.tunnelY !== undefined ? d.tunnelY - d.y : undefined),
};
const COAST = { wood: "rock", deep: "rock", plateau: "rock", mountain: "rock", valley: "sand", plain: "sand", lake: "sand" };

/** Stitch the tiles into one world. Lower priority is laid first; where tiles overlap, the higher one wins. */
export function generateWorld(seed, tiles, specs) {
  const gd = tiles.find((t) => t.kind === "valley");
  const maps = {};
  const grass = generateValley(seed, gd.w, gd.h, specs, { plain: gd.fill === "grass", margin: 160 });
  if (gd.fill === "grass") grassify(grass);
  maps[gd.key] = grass;
  for (const d of tiles) if (d !== gd) maps[d.key] = MAKERS[d.kind](seed, d);
  const m = composeWorld(seed, tiles, maps);
  m.seed = seed; m.tries = grass.tries;
  return m;
}

function composeWorld(seed, tiles, maps) {
  const gd = tiles.find((t) => t.kind === "valley");
  const WW = Math.max(...tiles.map((t) => t.x + t.w));
  const WH = Math.max(...tiles.map((t) => t.y + t.h));
  const cols = Math.ceil(WW / CELL), rows = Math.ceil(WH / CELL), N = cols * rows;
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const idx = (x, y) => Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))) * cols + Math.min(cols - 1, Math.max(0, Math.floor(x / CELL)));
  const nE = fbm(seed ^ 0x9e37);
  const cls = new Uint8Array(N).fill(G.DEEP), elev = new Float32Array(N).fill(0.1), mo = new Float32Array(N);
  const water = new Uint8Array(N).fill(3), ford = new Uint8Array(N), road = new Uint8Array(N), cave = new Uint8Array(N);
  const jungle = new Uint8Array(N), orchard = new Uint8Array(N), dense = new Float32Array(N).fill(0.5);
  const land = new Uint8Array(N), trees = new Uint8Array(N), zone = new Uint8Array(N);   // zone: 1 + index of the tile on top

  const blit = (t, d) => {
    const ti = tiles.indexOf(d) + 1;
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
      const i = r * t.cols + c, j = idx(d.x + (c + 0.5) * CELL, d.y + (r + 0.5) * CELL);
      cls[j] = t.cls[i]; elev[j] = t.elev[i]; mo[j] = t.mo[i]; water[j] = t.water[i]; ford[j] = t.ford[i];
      jungle[j] = t.jungle[i]; orchard[j] = t.orchard[i]; dense[j] = t.dense?.[i] ?? 0.5; cave[j] = t.cave?.[i] ?? 0;
      land[j] = 1; zone[j] = ti; trees[j] = d.kind === "wood" || d.kind === "deep" ? 1 : 0;
      road[j] = d.kind === "valley" ? t.road[i] : 0;
    }
  };
  for (const d of [...tiles].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))) blit(maps[d.key], d);

  // Where land meets the sea: woods, cliffs and mountains end in a ragged band of rock, open ground in a beach.
  const coastOf = (j) => COAST[tiles[zone[j] - 1]?.kind] ?? "rock";
  const toSea = new Uint8Array(N).fill(9);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const j = r * cols + c;
    if (!land[j]) continue;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const rr = r + dy, cc = c + dx;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols || !land[rr * cols + cc]) toSea[j] = Math.min(toSea[j], Math.max(Math.abs(dx), Math.abs(dy)));
    }
  }
  for (let j = 0; j < N; j++) {
    const d = toSea[j]; if (d > 3 || cave[j]) continue;
    const n = nE(X(j) / 140, Y(j) / 140);
    if (coastOf(j) === "rock") { if (d <= 1 || (d === 2 && n > 0.45) || (d === 3 && n > 0.7)) { cls[j] = G.ROCK; water[j] = 0; trees[j] = 0; } }
    else if (d <= 1 || (d === 2 && n > 0.5)) { cls[j] = G.SAND; water[j] = 0; }
  }

  const isWater = (i) => water[i] > 0 && !ford[i];
  const dw = spread(cols, rows, isWater);
  const dm = spread(cols, rows, (i) => isRock(cls[i]));
  const dEdge = spread(cols, rows, (i) => cls[i] !== G.FOREST);
  const cover = new Float32Array(N);
  for (let i = 0; i < N; i++) cover[i] = Math.min(1, dEdge[i] / 6);

  const off = ([x, y]) => [x + gd.x, y + gd.y];
  const sites = Object.fromEntries(Object.entries(maps[gd.key].sites).map(([k, s]) => [k, { ...s, x: s.x + gd.x, y: s.y + gd.y }]));
  const roads = maps[gd.key].roads.map((pts) => pts.map(off));
  const byKey = Object.fromEntries(tiles.map((t) => [t.key, t]));
  const lt = tiles.find((t) => t.kind === "lake"), lk = lt && maps[lt.key].lake;
  const lake = lk ? { x: lk.x + lt.x, y: lk.y + lt.y } : { x: WW / 2, y: WH / 2 };

  // The mountain's tunnel, in world coordinates: what the cover hides, and where the cut faces are.
  const mt = tiles.find((t) => t.kind === "mountain"), tn = mt && maps[mt.key].tunnel;
  const tunnel = tn ? { x: mt.x + tn.x0, y: mt.y + tn.y0, w: tn.x1 - tn.x0, h: tn.y1 - tn.y0, mouth: { x: mt.x + tn.mouth.x, y: mt.y + tn.mouth.y }, faces: tn.faces.map(([k, x, y]) => [k, mt.x + x, mt.y + y]) } : null;

  // Paths from home out to each tile's way in (its door), sharing stretches where they can.
  const home = sites.home;
  const doors = tiles.filter((t) => t.door).map((t) => ({ x: t.x + t.w * t.door[0], y: t.y + t.h * t.door[1] }));
  if (tunnel) doors.push({ x: tunnel.mouth.x - 60, y: tunnel.mouth.y });
  const pathCost = (j) => COST[cls[j]] * (road[j] ? 0.35 : 1);
  for (const p of doors.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y))) {
    let g = idx(p.x, p.y);
    if (!WALK[cls[g]]) { const near = search(cols, rows, g, (i) => WALK[cls[i]] && !water[i], () => 1); if (!near) continue; g = near[near.length - 1]; }
    const path = search(cols, rows, idx(home.x, home.y), g, pathCost);
    if (!path) continue;
    let k = 0; while (k < path.length - 1 && road[path[k + 1]]) k++;
    const fresh = path.slice(Math.max(0, k));
    for (const j of path) road[j] = 1;
    if (fresh.length > 1) roads.push(chaikin(fresh.map((i) => [X(i), Y(i)]), 2));
  }

  return { W: WW, H: WH, cols, rows, elev, water, ford, cls, mo, cover, dense, trees, road, cave, zone, river: [], riverW: maps[gd.key].riverW, fordPt: off(maps[gd.key].fordPt), fordDir: maps[gd.key].fordDir,
    lake, sites, roads, tunnel, dm, dw, X, Y, idx, jungle, orchard, tiles: byKey, tileList: tiles,
    zoneAt: (x, y) => tiles[zone[idx(x, y)] - 1]?.key ?? null };
}

// Queries used by the game: where you can stand, how far you get in a straight line, how villagers walk.
// ---------------------------------------------------------------------------
/** Dry ground — or something built over the water that you can stand on (a pier, a ship's deck): m.decks = [{x, y, w, h}]. */
export function terrainBlock(m, x, y) {
  if (m.blocks?.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return "wall";
  if (m.decks?.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return null;
  if (!(x >= 0 && y >= 0 && x < m.W && y < m.H)) return "edge";
  const i = m.idx(x, y);
  if (WALK[m.cls[i]] || (m.frozen && m.water?.[i] === 1)) return null;
  return isRock(m.cls[i]) ? "cliff" : m.cls[i] === G.VOID ? "edge" : "water";
}
export const walkable = (m, x, y) => terrainBlock(m, x, y) === null;
/** Does the segment p→q pass through a wall? (Liang–Barsky against each wall rectangle; walls are thin, so sampling misses them.) */
function crossesWall(m, p, q) {
  if (!m.blocks?.length) return false;
  const dx = q.x - p.x, dy = q.y - p.y;
  return m.blocks.some((r) => {
    let t0 = 0, t1 = 1;
    const e = 6;                                                     // a little room: don't scrape past a corner post
    for (const [pp, qq] of [[-dx, p.x - r.x + e], [dx, r.x + r.w + e - p.x], [-dy, p.y - r.y + e], [dy, r.y + r.h + e - p.y]]) {
      if (pp === 0) { if (qq < 0) return false; continue; }
      const t = qq / pp;
      if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  });
}
/** Walk from a towards b in a straight line; stop at the last step before water, cliff or a wall. */
export function reachAlong(m, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 16);
  let last = { x: a.x, y: a.y }, onLand = walkable(m, a.x, a.y);       // starting on a boat: wade ashore first
  for (let k = 1; k <= n; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
    const reason = crossesWall(m, last, p) ? "wall" : terrainBlock(m, p.x, p.y);
    if (reason === "wall" || (reason && (onLand || k === n))) return { ...last, blocked: true, reason };
    if (!reason) onLand = true;
    last = p;
  }
  return { ...last, blocked: false };
}
const clear = (m, a, b) => !reachAlong(m, a, b).blocked;
/** A villager's way from a to b: along roads where they can, round water and cliffs. Waypoints in world px. */
/** opts.wary: someone who knows the jungle is dangerous — goes a long way round rather than through it. */
export function findPath(m, a, b, opts = {}) {
  if (!walkable(m, b.x, b.y)) return null;
  const inJungle = (p) => m.jungle?.[m.idx(p.x, p.y)] === 1;
  const wary = opts.wary && !inJungle(a) && !inJungle(b);
  const clear = (p, q) => {
    if (reachAlong(m, p, q).blocked) return false;
    if (!wary) return true;
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 30);
    for (let k = 1; k < n; k++) if (inJungle({ x: p.x + ((q.x - p.x) * k) / n, y: p.y + ((q.y - p.y) * k) / n })) return false;
    return true;
  };
  if (clear(a, b) && Math.hypot(b.x - a.x, b.y - a.y) < 500) return [b];
  const h = CELL / 2;
  const walled = (j) => { const x = m.X(j), y = m.Y(j); return Boolean(m.blocks?.some((r) => x + h > r.x && x - h < r.x + r.w && y + h > r.y && y - h < r.y + r.h)); };
  // Start and end on a cell no wall touches, on the same side of the wall as the point itself.
  const snap = (p) => {
    const i = m.idx(p.x, p.y);
    if (!m.blocks?.length || !walled(i)) return i;
    const c0 = i % m.cols, r0 = Math.floor(i / m.cols); let best = i, bd = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const c = c0 + dx, r = r0 + dy; if (c < 0 || r < 0 || c >= m.cols || r >= m.rows) continue;
      const j = r * m.cols + c, q = { x: m.X(j), y: m.Y(j) }, d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd && !walled(j) && WALK[m.cls[j]] && !crossesWall(m, p, q)) { bd = d; best = j; }
    }
    return best;
  };
  const start = snap(a), goal = snap(b);
  const cost = (j) => {
    if (walled(j)) return Infinity;                                                     // any cell a wall touches
    if (m.frozen && m.water?.[j] === 1) return 2.2;                                 // frozen lake: worth crossing, a little slow
    return wary && m.jungle?.[j] ? Infinity : COST[m.cls[j]] * (m.road[j] ? 0.45 : 1);   // the wary never set foot in it
  };
  const gc = goal % m.cols, gr = Math.floor(goal / m.cols);
  const p = search(m.cols, m.rows, start, goal, cost, (i) => Math.hypot((i % m.cols) - gc, Math.floor(i / m.cols) - gr) * 0.45);
  if (!p) return null;
  const pts = p.map((i) => ({ x: m.X(i), y: m.Y(i) }));
  pts[pts.length - 1] = b;
  const out = []; let cur = a, k = 0;                                          // string-pull: skip waypoints you can see past
  while (k < pts.length) {
    let far = k;
    if (!clear(cur, pts[far])) return null;
    while (far + 1 < pts.length && clear(cur, pts[far + 1]) && far - k < 14) far++;
    out.push(pts[far]); cur = pts[far]; k = far + 1;
  }
  return out;
}
