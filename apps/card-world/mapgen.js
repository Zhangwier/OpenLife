// Seeded map generation for the card world (see DESIGN.md · 地图生成).
// One land = one landform template + one seed + one content pack of sites.
// Pipeline: elevation → water (lake basin, river by least cost to the sea) → ground classes → sites by rules → roads → checks (else reroll).

export const CELL = 40;
export const why = {};   // why layouts were rejected (for tuning)
const fail = (k) => { why[k] = (why[k] ?? 0) + 1; return null; };
export const G = { DEEP: 0, SHALLOW: 1, FORD: 2, SAND: 3, MEADOW: 4, FOREST: 5, SLOPE: 6, SCREE: 7, ROCK: 8, SNOW: 9, VOID: 10 };
const WALK = [false, false, true, true, true, true, true, true, false, false, false];
const COST = [Infinity, Infinity, 4, 1.3, 1, 2, 2.6, 3, Infinity, Infinity, Infinity];

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
export function generateValley(seed, W, H, specs) {
  for (let tries = 0; tries < 40; tries++) {
    const m = tryValley(seed + tries * 7919, W, H, specs);
    if (m) { m.seed = seed; m.tries = tries + 1; return m; }
  }
  throw new Error("valley: no layout passed the checks");
}

function tryValley(seed, W, H, specs) {
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
  let out = idx(lake.x, lake.y);
  for (let s = 0; s < 4000 && water[out] === 1; s += CELL / 2) out = idx(lake.x + Math.cos(ang) * s, lake.y + Math.sin(ang) * s);
  const path = search(cols, rows, out, (i) => water[i] === 3, (j) => (water[j] === 1 ? Infinity : 1 + 60 * Math.max(0, elev[j] - 0.4) + 3 * nC(X(j) / 500, Y(j) / 500)));
  if (!path || path.length < 12) return fail("river");
  const river = chaikin(path.map((i) => [X(i), Y(i)]), 3);
  const lakeEdge = [lake.x + Math.cos(ang) * lake.rx * 0.8, lake.y + Math.sin(ang) * lake.ry * 0.8];
  river.unshift(lakeEdge);
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
  const dm = spread(cols, rows, (i) => cls[i] >= G.ROCK);

  // 4 · sites, by rules (content pack): terrain, distance from another site, near which water, near the mountains…
  const sites = {}, taken = [], jungle = new Uint8Array(N), orchard = new Uint8Array(N);
  const roomy = (i) => { let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * cols + dx; if (j >= 0 && j < N && WALK[cls[j]]) n++; } return n; };
  const free = (i, gap) => taken.every((t) => Math.hypot(X(t) - X(i), Y(t) - Y(i)) > gap);
  for (const s of specs) {
    let best = -1, bs = -Infinity;
    const ref = s.from ? sites[s.from] : null;
    for (let i = 0; i < N; i++) {
      if (!s.ground.includes(cls[i]) || !free(i, s.gap ?? 560) || roomy(i) < (s.room ?? 15)) continue;
      const x = X(i), y = Y(i);
      if (x < 400 || x > W - 400 || y < 300) continue;
      const near = { lake: dl[i], river: dr[i], sea: ds[i], water: dw[i], mountain: dm[i] };
      if (s.water && !(near[s.water[0]] * CELL >= s.water[1] && near[s.water[0]] * CELL <= s.water[2])) continue;
      if (s.mountain && !(dm[i] * CELL >= s.mountain[0] && dm[i] * CELL <= s.mountain[1])) continue;
      if (s.north && y > H * s.north) continue;
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
    sites[s.key] = { key: s.key, name: s.name, patch: s.patch, x: X(best), y: Y(best) };
    taken.push(best);
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
/** An old wood: rolling forest with glades, boulder patches and a clearing in the middle. No water of its own. */
export function makeWood(seed, W, H) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N), elev = new Float32Array(N), mo = new Float32Array(N), dense = new Float32Array(N);
  const cx = W * 0.54, cy = H * 0.44, cr = Math.min(W, H) * 0.09;          // a clearing in the middle
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    const e = 0.58 + 0.2 * (nB(x / 760, y / 760) - 0.5) + 0.06 * (nC(x / 260, y / 260) - 0.5);
    elev[i] = e;
    mo[i] = 0.55 + 0.3 * (nA(x / 600, y / 600) - 0.5);
    dense[i] = Math.max(0.3, Math.min(0.95, 0.55 + 0.7 * (nB(x / 340 + 11, y / 340 + 4) - 0.15)));
    const glade = nC(x / 560 + 3, y / 560 + 7) > 0.58 || Math.hypot(x - cx, y - cy) < cr;
    const rocky = e > 0.62 && nA(x / 240 + 5, y / 240 + 9) > 0.56;
    cls[i] = rocky ? (nC(x / 320, y / 320) > 0.5 ? G.SCREE : G.SLOPE) : glade ? G.MEADOW : G.FOREST;
  }
  return { W, H, cols, rows, cls, elev, mo, dense, water: new Uint8Array(N), ford: new Uint8Array(N), road: new Uint8Array(N), jungle: new Uint8Array(N), orchard: new Uint8Array(N) };
}

/** A lake tile: a broad lake in the middle, sand and grass shores. Lower priority than the grassland. */
export function makeLake(seed, W, H) {
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), N = cols * rows;
  const nA = fbm(seed), nB = fbm(seed + 1), nC = fbm(seed + 2);
  const X = (i) => ((i % cols) + 0.5) * CELL, Y = (i) => (Math.floor(i / cols) + 0.5) * CELL;
  const cls = new Uint8Array(N), elev = new Float32Array(N), mo = new Float32Array(N), water = new Uint8Array(N);
  const cx = W * 0.5, cy = H * 0.63, rx = W * 0.34, ry = H * 0.24;
  for (let i = 0; i < N; i++) {
    const x = X(i), y = Y(i);
    const wob = 1 + 0.18 * (nA(x / 420 + 5, y / 420 + 2) - 0.5);
    const lr = Math.hypot((x - cx) / (rx * wob), (y - cy) / (ry * wob));
    elev[i] = 0.36 + 0.05 * (nB(x / 800, y / 800) - 0.5);
    mo[i] = 0.6 + 0.2 * (nC(x / 500, y / 500) - 0.5);
    if (lr < 1) { water[i] = 1; cls[i] = G.DEEP; }
    else if (lr < 1.1) cls[i] = G.SAND;
    else cls[i] = nC(x / 600 + 9, y / 600 + 3) > 0.76 ? G.SCREE : G.MEADOW;
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {                 // rocky rim against the sea
    if (r >= 2 && c >= 2 && r < rows - 2 && c < cols - 2) continue;
    const i = r * cols + c;
    cls[i] = G.ROCK; water[i] = 0;
  }
  return { W, H, cols, rows, cls, elev, mo, water, ford: new Uint8Array(N), road: new Uint8Array(N), jungle: new Uint8Array(N), orchard: new Uint8Array(N), dense: new Float32Array(N).fill(0.5) };
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

/** Stitch the tiles into one world. Lower priority is laid first; where tiles overlap, the higher one wins. */
export function generateWorld(seed, tiles, specs) {
  const gd = tiles.find((t) => t.kind === "valley");
  const fd = tiles.find((t) => t.kind === "wood");
  const rd = tiles.find((t) => t.kind === "lake");
  const grass = generateValley(seed, gd.w, gd.h, specs);
  if (gd.fill === "grass") grassify(grass);
  const forest = fd ? makeWood(seed ^ 0x5eed, fd.w, fd.h) : null;
  const lake = rd ? makeLake(seed ^ 0x51ee, rd.w, rd.h) : null;
  const maps = { [gd.key]: grass, [fd?.key]: forest, [rd?.key]: lake };
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
  const cls = new Uint8Array(N).fill(G.DEEP), elev = new Float32Array(N), mo = new Float32Array(N);
  const water = new Uint8Array(N).fill(3), ford = new Uint8Array(N), road = new Uint8Array(N);
  const jungle = new Uint8Array(N), orchard = new Uint8Array(N), dense = new Float32Array(N).fill(0.5);
  const land = new Uint8Array(N), fromWood = new Uint8Array(N), valleyRoad = new Uint8Array(N), trees = new Uint8Array(N);

  const blit = (t, d) => {
    for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
      const i = r * t.cols + c, j = idx(d.x + (c + 0.5) * CELL, d.y + (r + 0.5) * CELL);
      cls[j] = t.cls[i]; elev[j] = t.elev[i]; mo[j] = t.mo[i]; water[j] = t.water[i]; ford[j] = t.ford[i];
      jungle[j] = t.jungle[i]; orchard[j] = t.orchard[i]; dense[j] = t.dense?.[i] ?? 0.5;
      land[j] = 1;
      if (d.kind === "wood") { fromWood[j] = 1; trees[j] = 1; }
      if (d.kind === "valley") valleyRoad[j] = t.road[i];
    }
  };
  for (const d of [...tiles].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))) { const t = maps[d.key]; if (t) blit(t, d); }
  road.set(valleyRoad);

  // A ragged apron of rock where the land meets the mist, so the join does not read as a ruler line.
  {
    const grow = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (cls[r * cols + c] !== G.VOID) continue;
      let d = 9;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const rr = r + dy, cc = c + dx;
        if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && land[rr * cols + cc]) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
      }
      if (d <= 4 && nE((c + 0.5) * CELL / 140, (r + 0.5) * CELL / 140) > 0.42 + 0.13 * d) grow.push(r * cols + c);
    }
    for (const j of grow) { cls[j] = G.ROCK; land[j] = 1; }
  }
  // Where the wood's straight tile edge runs into the grassland, let a scree slope straggle in.
  {
    const fringe = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const j = r * cols + c;
      if (fromWood[j] || cls[j] !== G.SNOW && cls[j] !== G.ROCK && cls[j] !== G.SLOPE && cls[j] !== G.SCREE) continue;
      let nearWood = false;
      for (let dy = -2; dy <= 2 && !nearWood; dy++) for (let dx = -2; dx <= 2 && !nearWood; dx++) {
        const rr = r + dy, cc = c + dx;
        if (rr >= 0 && cc >= 0 && rr < rows && cc < cols && fromWood[rr * cols + cc]) nearWood = true;
      }
      if (nearWood && nE((c + 0.5) * CELL / 120, (r + 0.5) * CELL / 120) > 0.42) fringe.push(j);
    }
    for (const j of fringe) cls[j] = G.SCREE;
  }
  // The wood's own coast: a belt of rock along every edge facing the mist.
  const isLand = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && land[r * cols + c] === 1;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const j = r * cols + c;
    if (!fromWood[j]) continue;
    let edge = false;
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) if (!isLand(r + dy, c + dx)) edge = true;
    if (edge) { cls[j] = G.ROCK; water[j] = 0; ford[j] = 0; }
  }

  const isWater = (i) => water[i] > 0 && !ford[i];
  const dw = spread(cols, rows, isWater), dl = spread(cols, rows, (i) => water[i] === 1), dr = spread(cols, rows, (i) => water[i] === 2), ds = spread(cols, rows, (i) => water[i] === 3);
  const dm = spread(cols, rows, (i) => cls[i] >= G.ROCK);
  const dEdge = spread(cols, rows, (i) => cls[i] !== G.FOREST);
  const cover = new Float32Array(N);
  for (let i = 0; i < N; i++) cover[i] = Math.min(1, dEdge[i] / 6);

  const off = ([x, y]) => [x + gd.x, y + gd.y];
  const sites = Object.fromEntries(Object.entries(maps[gd.key].sites).map(([k, s]) => [k, { ...s, x: s.x + gd.x, y: s.y + gd.y }]));
  const roads = maps[gd.key].roads.map((pts) => pts.map(off));
  const lake = { ...maps[gd.key].lake, x: maps[gd.key].lake.x + gd.x, y: maps[gd.key].lake.y + gd.y };
  const fordPt = off(maps[gd.key].fordPt);

  return { W: WW, H: WH, cols, rows, elev, water, ford, cls, mo, cover, dense, trees, road, river: [], riverW: maps[gd.key].riverW, fordPt, fordDir: maps[gd.key].fordDir, lake, sites, roads, seaY: maps[gd.key].seaY, dm, dw, X, Y, idx, jungle, orchard, tiles: { valley: gd, wood: tiles.find((t) => t.kind === "wood"), lake: tiles.find((t) => t.kind === "lake") } };
}

// Queries used by the game: where you can stand, how far you get in a straight line, how villagers walk.
// ---------------------------------------------------------------------------
/** Dry ground — or something built over the water that you can stand on (a pier, a ship's deck): m.decks = [{x, y, w, h}]. */
export function walkable(m, x, y) {
  if (m.blocks?.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return false;   // house walls
  if (m.decks?.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return true;
  return x >= 0 && y >= 0 && x < m.W && y < m.H && WALK[m.cls[m.idx(x, y)]];
}
/** Walk from a towards b in a straight line; stop at the last step before water or cliff. */
export function reachAlong(m, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(d / 16);
  let last = { x: a.x, y: a.y }, onLand = walkable(m, a.x, a.y);       // starting on a boat: wade ashore first
  for (let k = 1; k <= n; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, ok = walkable(m, p.x, p.y);
    if (!ok && onLand) return { ...last, blocked: true };
    if (ok) onLand = true;
    last = p;
  }
  return { ...last, blocked: false };
}
const clear = (m, a, b) => !reachAlong(m, a, b).blocked;
/** A villager's way from a to b: along roads where they can, round water and cliffs. Waypoints in world px. */
/** opts.wary: someone who knows the jungle is dangerous — goes a long way round rather than through it. */
export function findPath(m, a, b, opts = {}) {
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
  const cost = (j) => {
    const x = m.X(j), y = m.Y(j);
    if (m.blocks?.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) return Infinity;
    return wary && m.jungle?.[j] ? Infinity : COST[m.cls[j]] * (m.road[j] ? 0.45 : 1);   // the wary never set foot in it
  };
  const start = m.idx(a.x, a.y), goal = m.idx(b.x, b.y);
  const gc = goal % m.cols, gr = Math.floor(goal / m.cols);
  const p = search(m.cols, m.rows, start, goal, cost, (i) => Math.hypot((i % m.cols) - gc, Math.floor(i / m.cols) - gr) * 0.45);
  if (!p) return null;
  const pts = p.map((i) => ({ x: m.X(i), y: m.Y(i) }));
  pts[pts.length - 1] = b;
  const out = []; let cur = a, k = 0;                                          // string-pull: skip waypoints you can see past
  while (k < pts.length) { let far = k; while (far + 1 < pts.length && clear(cur, pts[far + 1]) && far - k < 14) far++; out.push(pts[far]); cur = pts[far]; k = far + 1; }
  return out;
}
