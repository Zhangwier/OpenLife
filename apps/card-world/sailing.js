// Boats: where a boat floats, and its way over the water — round headlands, across the lake, out to sea. Pure.

/** Open water a boat can be on: the lake or the sea, not a ford. */
export const afloat = (m, i) => i >= 0 && i < m.water.length && m.water[i] > 0 && !m.ford?.[i];

/** The nearest water cell to cell i within r cells, or -1. */
export function nearestWater(m, i, r = 4) {
  if (afloat(m, i)) return i;
  const c0 = i % m.cols, r0 = Math.floor(i / m.cols);
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const c = c0 + dx, rr = r0 + dy;
    if (c < 0 || rr < 0 || c >= m.cols || rr >= m.rows) continue;
    const j = rr * m.cols + c, d = dx * dx + dy * dy;
    if (d < bd && afloat(m, j)) { bd = d; best = j; }
  }
  return best;
}
/** Land with water close by: where a boat can be built and launched. */
export const shoreAt = (m, p, r = 4) => nearestWater(m, m.idx(p.x, p.y), r) >= 0;
/** Is the open sea (not the lake) anywhere on this route? */
export const touchesSea = (m, pts) => pts.some((p) => m.water[m.idx(p.x, p.y)] === 3);

function clearWater(m, p, q) {
  const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 20);
  for (let k = 1; k < n; k++) if (!afloat(m, m.idx(p.x + ((q.x - p.x) * k) / n, p.y + ((q.y - p.y) * k) / n))) return false;
  return true;
}

/** A boat's way from a (afloat) to b: over water only. If b is ashore, to the water nearest it, then the step onto
 *  land (reach: how far inland, in cells, it may be). Waypoints in world px (string-pulled), or null. */
export function waterRoute(m, a, b, reach = 4) {
  const start = nearestWater(m, m.idx(a.x, a.y), 1);
  if (start < 0) return null;
  const end = m.idx(b.x, b.y), ashore = !afloat(m, end), goal = ashore ? nearestWater(m, end, reach) : end;
  if (goal < 0) return null;
  const { cols, rows } = m, N = cols * rows, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
  const gc = goal % cols, gr = Math.floor(goal / cols), h = (i) => Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr);
  const heap = [[h(start), start]];
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let s = k; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === k) break; [heap[s], heap[k]] = [heap[k], heap[s]]; k = s; } } return top; };
  g[start] = 0;
  while (heap.length) {
    const [, i] = pop();
    if (i === goal) break;
    const c = i % cols, r = Math.floor(i / cols);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const cc = c + dx, rr = r + dy;
      if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
      const j = rr * cols + cc;
      if (!afloat(m, j)) continue;
      const ng = g[i] + (dx && dy ? 1.414 : 1);
      if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + h(j), j); }
    }
  }
  if (g[goal] === Infinity) return null;
  const cells = [];
  for (let i = goal; i !== -1; i = from[i]) cells.unshift(i);
  const pts = cells.map((i) => ({ x: m.X(i), y: m.Y(i) }));
  const out = []; let cur = a, k = 0;
  while (k < pts.length) {
    let far = k;
    while (far + 1 < pts.length && clearWater(m, cur, pts[far + 1]) && far - k < 20) far++;
    out.push(pts[far]); cur = pts[far]; k = far + 1;
  }
  if (ashore) out.push({ x: b.x, y: b.y });
  return out;
}
