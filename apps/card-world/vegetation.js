// The wood creeps and retreats, a year at a time. Seed falls on the grass at the wood's edge; left alone, a sapling
// grows and in about four years the ground under it is woodland. A stand of trees felled hard all year gives way: its
// edge goes back to grass. Pure: works on the map's grid of ground classes; app.js plants, repaints and saves.

export const VEG = {
  sprout: 0.08,      // chance a free patch of grass at the wood's edge gets a sapling, each spring
  grow: 0.18,        // a sapling's size each year (it starts at 0.3)
  mature: 4,         // years until the ground under it is wood
  hardCut: 6,        // days in a year a stand sat felled down to one or none before its edge gives way
  thin: 8,           // wooded cells at most that go back to grass around a hard-cut stand, each spring
  newStand: 8,       // grown-up cells in one patch before a new stand of trees (a card) appears there
};

/** The eight around a cell that are inside the grid. */
export function around(i, cols, rows) {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < rows && cc < cols) out.push(rr * cols + cc);
  }
  return out;
}

/** Grass at the wood's edge where seed can take: a grass cell with two or more wooded neighbours, and free (ok). */
export function edgeGrass(cls, cols, rows, WOOD, GRASS, ok = () => true) {
  const out = [];
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] !== GRASS || !ok(i)) continue;
    if (around(i, cols, rows).filter((j) => cls[j] === WOOD).length >= 2) out.push(i);
  }
  return out;
}

/** A sapling a year on. */
export const ageSapling = (s) => ({ ...s, age: (s.age ?? 0) + 1, size: Math.min(1, (s.size ?? 0.3) + VEG.grow) });
export const isMature = (s) => (s.age ?? 0) >= VEG.mature;

/** Wooded cells to give back to grass around a hard-cut stand: within reach of it, touching grass, nearest first. */
export function cellsToThin(cls, cols, rows, WOOD, GRASS, at, reach, cell, limit = VEG.thin) {
  const out = [], c0 = Math.floor(at.x / cell), r0 = Math.floor(at.y / cell), span = Math.ceil(reach / cell);
  for (let r = r0 - span; r <= r0 + span; r++) for (let c = c0 - span; c <= c0 + span; c++) {
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const i = r * cols + c, d = Math.hypot((c + 0.5) * cell - at.x, (r + 0.5) * cell - at.y);
    if (cls[i] === WOOD && d <= reach && around(i, cols, rows).some((j) => cls[j] === GRASS)) out.push([d, i]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, limit).map(([, i]) => i);
}

/** Groups of cells that touch one another (eight ways). */
export function patches(cells, cols, rows) {
  const set = new Set(cells), seen = new Set(), out = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const group = [], queue = [start];
    seen.add(start);
    while (queue.length) {
      const i = queue.pop(); group.push(i);
      for (const j of around(i, cols, rows)) if (set.has(j) && !seen.has(j)) { seen.add(j); queue.push(j); }
    }
    out.push(group);
  }
  return out;
}
