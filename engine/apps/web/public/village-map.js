/** village-map.js — 河岸聚落 overview map for the travel picker.
 * All art is whole-pixel fillRect at 320x200 (no paths, arcs or text), blitted at an
 * integer scale. Terrain is baked once per season; each frame only redraws water
 * sparkles, chimney smoke, the current marker and the hover bracket. Place names are
 * HTML labels placed from anchorOf(), so every icon keeps its foot point clear. */

const W = 320, H = 200, INK = "#2b241d", SPARK = "#cfe3d8";

/** Foot points of every place icon, in native map pixels. */
export const VILLAGE_LAYOUT = {
  "place:yard": { x: 112, y: 108, icon: "house" },
  "place:longhouse": { x: 158, y: 104, icon: "longhouse" },
  "place:hearth-yard": { x: 190, y: 120, icon: "hearth" },
  "place:weaving-shed": { x: 126, y: 132, icon: "shed" },
  "place:herb-hut": { x: 208, y: 66, icon: "hut" },
  "place:market": { x: 236, y: 100, icon: "stalls" },
  "place:shrine": { x: 276, y: 124, icon: "stone" },
  "place:kiln": { x: 68, y: 176, icon: "kiln" },
  "place:claypits": { x: 28, y: 182, icon: "pits" },
  "place:field": { x: 58, y: 96, icon: "field" },
  "place:river": { x: 148, y: 160, icon: "steps" },
  "place:ford": { x: 232, y: 148, icon: "landing" },
  "place:fishing-lodge": { x: 34, y: 126, icon: "stilt-hut" },
  "place:reedbed": { x: 204, y: 164, icon: "reeds" },
  "place:chestnut-wood": { x: 150, y: 46, icon: "trees" },
  "place:stone-beach": { x: 296, y: 76, icon: "pebbles" },
};

const P = {
  grass: ["#3a4426", "#45512e", "#506038", "#5c6c40", "#6a7a48", "#7c8a52"],
  dirt: ["#6a5136", "#7a5f42", "#8a6f4e", "#9a7f5c"],
  water: ["#3f6466", "#4f7a78", "#6f9a92", "#8fb7ac"],
  thatch: ["#9c7f4c", "#c9a86a", "#e0c58a"],
  wood: ["#4a3322", "#6b4a2f", "#8c6643"],
  clay: ["#7e5133", "#b0764a", "#cf9566"],
  stone: ["#5f5b52", "#8d897c", "#b3ae9f"],
  leaf: ["#3a4426", "#4d5e33", "#5c6c40"],
  autumn: "#c8862e", flower: "#d8c04a", plaster: ["#d6c3a0", "#b19d7c"],
  snow: ["#e3e8ec", "#cfd7dc", "#b9c3c9"],
};

function R(g, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
/** Deterministic 0..1 noise — the map is identical on every render. */
function hsh(x, y, s) {
  let n = Math.imul((x | 0) + 7, 374761393) ^ Math.imul((y | 0) + 13, 668265263) ^ Math.imul((s | 0) + 3, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/** Pixel blob: one row per scanline, optional 1 px ink silhouette. */
function blob(g, cx, cy, rx, ry, cols, ink, seed) {
  for (let dy = -ry; dy <= ry; dy++) {
    const k = 1 - (dy * dy) / (ry * ry + 0.001);
    let w = Math.max(0, Math.round(rx * Math.sqrt(Math.max(0, k))));
    if (seed && w) w = Math.max(1, w + (hsh(cx, cy + dy, seed) > 0.7 ? 1 : 0) - (hsh(cx + 1, cy + dy, seed) > 0.82 ? 1 : 0));
    if (!w) continue;
    if (ink) R(g, cx - w - 1, cy + dy, w * 2 + 3, 1, ink);
    R(g, cx - w, cy + dy, w * 2 + 1, 1, dy < -ry * 0.25 ? cols[2] : dy > ry * 0.4 ? cols[0] : cols[1]);
  }
}
/** Smooth value noise 0..1 — grass drifts read as ground, not as static. */
function vn(x, y, step, seed) {
  const gx = Math.floor(x / step), gy = Math.floor(y / step), fx = x / step - gx, fy = y / step - gy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hsh(gx, gy, seed), b = hsh(gx + 1, gy, seed), c = hsh(gx, gy + 1, seed), d = hsh(gx + 1, gy + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function shadow(g, cx, cy, rx) {
  for (let dy = 0; dy < 3; dy++) R(g, cx - Math.round(rx * (1 - dy * 0.22)), cy + dy, Math.round(rx * (1 - dy * 0.22)) * 2, 1, "#2f3a20");
}
const RIVER = [
  [0, 138], [28, 141], [56, 148], [84, 158], [112, 166], [140, 173], [168, 177], [196, 174],
  [222, 167], [246, 157], [266, 145], [282, 131], [294, 114], [303, 95], [309, 74], [314, 52], [317, 28], [319, 0],
];
const RY = new Float32Array(W), RH = new Float32Array(W);
for (let x = 0; x < W; x++) {
  let i = 0;
  while (i < RIVER.length - 2 && RIVER[i + 1][0] <= x) i++;
  const [x0, y0] = RIVER[i], [x1, y1] = RIVER[i + 1];
  const t = Math.max(0, Math.min(1, (x - x0) / Math.max(1, x1 - x0)));
  RY[x] = y0 + (y1 - y0) * t;
  RH[x] = 6.4 + 1.5 * Math.sin(x / 23 + 0.7) + 0.7 * Math.sin(x / 7.3);
}
const inWater = (x, y, pad) => x >= 0 && x < W && y > RY[x] - RH[x] - (pad || 0) && y < RY[x] + RH[x] + (pad || 0);

function palettes(season) {
  const winter = season === "冬", autumn = season === "秋", spring = season === "春";
  const grass = winter ? ["#cfd7dc", "#dae1e6", "#e3e8ec", "#e9edf0", "#eef2f4", "#f5f8fa"]
    : autumn ? ["#45512e", "#4c5732", "#545e36", "#5c6c40", "#6a7444", "#7a7a46"]
      : spring ? ["#3a4426", "#45512e", "#506038", "#5c6c40", "#6a7a48", "#8b9a5c"] : P.grass;
  return { winter, autumn, spring, grass,
    water: winter ? ["#33504f", "#3a5658", "#4c7270", "#8fb7ac"] : P.water,
    leaf: winter ? ["#2b3a22", "#3a4a2a", "#45512e"] : P.leaf,
    hill: winter ? ["#a7b2b9", "#cfd7dc"] : ["#333d22", "#45512e"], hillRim: winter ? "#e3e8ec" : "#5c6c40" };
}
const PATHS = [
  [[26, 124], [52, 120], [78, 116], [96, 115], [118, 114], [140, 112], [162, 112], [186, 112], [210, 107], [232, 104], [256, 112], [272, 120]],
  [[78, 116], [70, 106], [62, 100]],
  [[96, 115], [88, 108], [88, 66], [98, 56], [130, 52]],
  [[210, 107], [208, 88], [208, 70]],
  [[208, 70], [236, 66], [264, 68], [288, 74]],
  [[232, 104], [232, 128], [232, 144]],
  [[162, 112], [156, 138], [150, 152]],
  [[162, 112], [176, 116], [186, 118]],
  [[118, 114], [124, 124], [126, 130]],
  [[70, 120], [64, 134], [62, 142]],
  [[64, 162], [68, 170], [68, 174]],
  [[64, 162], [46, 170], [32, 178]],
];
const mask = new Uint8Array(W * H);

function stampPath(g, x, y) {
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= W || py >= H || mask[py * W + px]) continue;
    const n = hsh(px, py, 21);
    R(g, px, py, 1, 1, n > 0.86 ? P.dirt[3] : n > 0.34 ? P.dirt[2] : P.dirt[1]);
    mask[py * W + px] = 1;
  }
  if (hsh(x, y, 22) > 0.72) R(g, x - 2, y + (hsh(x, y, 23) > 0.5 ? 1 : -1), 1, 1, P.dirt[0]);
}
function paintPaths(g, season) {
  mask.fill(0);
  for (const line of PATHS) for (let s = 0; s < line.length - 1; s++) {
    const [x0, y0] = line[s], [x1, y1] = line[s + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) stampPath(g, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
  }
  if (season === "冬") for (let i = 0; i < 900; i++) {
    const x = i % W, y = (i * 37) % H;
    if (mask[y * W + x] && hsh(x, y, 31) > 0.72) R(g, x, y, 1, 1, "#8d8a80");
  }
}
/* -- terrain: grass, hills, water, paths, field -- */
function paintGrass(g, pal, season) {
  R(g, 0, 0, W, H, pal.grass[2]);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    const n = vn(x, y, 34, 4) * 0.6 + vn(x, y, 12, 5) * 0.4;
    R(g, x, y, 2, 2, pal.grass[Math.max(0, Math.min(5, Math.round(2.5 + (n - 0.5) * 7)))]);
  }
  for (let i = 0; i < 150; i++) {  // sparse blades
    const x = Math.round(hsh(i, 6, 5) * W), y = 20 + Math.round(hsh(i, 7, 5) * 176);
    if (inWater(x, y, 2)) continue;
    R(g, x, y, 1, 1, hsh(i, 8, 5) > 0.55 ? pal.grass[3] : pal.grass[1]);
  }
  const dots = season === "春" ? 46 : season === "秋" ? 40 : season === "冬" ? 24 : 0;
  for (let i = 0; i < dots; i++) {
    const x = Math.round(hsh(i, 7, 9) * W), y = 24 + Math.round(hsh(i, 8, 9) * 160);
    if (inWater(x, y, 2)) continue;
    if (season === "春") { R(g, x, y, 1, 1, P.flower); if (hsh(i, 9, 9) > 0.6) R(g, x + 2, y - 1, 1, 1, P.flower); }
    else if (season === "秋") R(g, x, y, 1, 1, hsh(i, 9, 11) > 0.5 ? P.autumn : P.dirt[1]);
    else R(g, x, y, 2, 1, hsh(i, 9, 13) > 0.5 ? P.snow[0] : P.snow[1]);
  }
}
function paintHills(g, pal, season) {
  for (let x = 0; x < W; x++) {
    const top = Math.max(5, Math.round(10 + Math.sin(x * 0.031 + 0.9) * 5 + Math.sin(x * 0.011 - 2) * 4));
    R(g, x, 0, 1, top, pal.hill[0]);
    R(g, x, 0, 1, Math.round(top * 0.5), season === "冬" ? "#9aa5ac" : "#2c3520");
    R(g, x, top, 1, 1, pal.hill[1]);
    if (hsh(x, 3, 17) > 0.9) R(g, x, top + 1, 1, 1, pal.hillRim);
  }
  for (let i = 0; i < 26; i++) {  // far conifers on the ridge
    const x = 4 + Math.round(hsh(i, 1, 19) * 312), base = 12 + Math.round(hsh(i, 2, 19) * 4), hgt = 4 + Math.round(hsh(i, 3, 19) * 5);
    for (let r = 0; r < hgt; r++) { const w = Math.max(1, Math.round((hgt - r) / 2)); R(g, x - w, base - hgt + r, w * 2 + 1, 1, season === "冬" ? "#8d99a0" : "#2b3520"); }
  }
}
function paintWater(g, pal, season) {
  const winter = season === "冬";
  for (let x = 0; x < W; x++) {
    const c = RY[x], hw = RH[x], top = Math.round(c - hw), bot = Math.round(c + hw);
    R(g, x, top - 2, 1, 2, winter ? "#b3aea1" : P.dirt[3]);
    R(g, x, bot, 1, 2, winter ? "#9a958a" : P.dirt[1]);
    R(g, x, top, 1, bot - top, pal.water[1]);
    R(g, x, top, 1, 2, winter ? P.snow[1] : pal.water[2]);
    R(g, x, bot - 2, 1, 2, pal.water[0]);
    if (hsh(x, 1, 27) > 0.74) R(g, x, Math.round(c) + Math.round(hsh(x, 2, 27) * 3) - 1, 1, 1, pal.water[0]);
    if (winter && hsh(x, 3, 27) > 0.82) { R(g, x, top + 2, 2, 1, P.snow[1]); R(g, x, bot - 4, 1, 1, P.snow[1]); }
  }
}function paintField(g, season) {
  const x0 = 32, x1 = 84, y0 = 56, y1 = 96;
  R(g, x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2, P.dirt[0]);
  R(g, x0, y0, x1 - x0, y1 - y0, P.dirt[2]);
  R(g, x0, y0, x1 - x0, 1, P.dirt[3]);
  for (let y = y0 + 4; y < y1 - 3; y += 5) {
    R(g, x0 + 1, y, x1 - x0 - 2, 3, P.dirt[0]);
    R(g, x0 + 1, y, x1 - x0 - 2, 1, P.dirt[1]);
    for (let x = x0 + 2; x < x1 - 2; x += 2) {
      const n = hsh(x, y, 33);
      if (season === "春") { if (n > 0.42) R(g, x, y, 1, 2, n > 0.8 ? "#7c8a52" : "#5c6c40"); }
      else if (season === "夏") {
        R(g, x + (n > 0.5 ? 0 : 1), y - 2, 1, 4, n > 0.7 ? "#6a7a48" : "#506038");
        if (n > 0.85) R(g, x, y - 3, 1, 1, "#7c8a52");
      } else if (season === "秋") {
        R(g, x, y, 1, 3, n > 0.6 ? "#c9a86a" : "#9c7f4c");
        if (n > 0.86) R(g, x, y - 1, 1, 1, P.autumn);
      } else {
        R(g, x, y, 1, 2, n > 0.55 ? "#8a6f4e" : "#7a5f42");
        if (n > 0.7) R(g, x, y, 1, 1, P.snow[0]);
      }
    }
  }
}
function paintCrossing(g) {
  for (const [x, y] of [[62, 144], [61, 148], [63, 152], [61, 156]]) {
    R(g, x - 2, y, 5, 1, INK); R(g, x - 2, y + 1, 5, 2, P.stone[1]);
    R(g, x - 2, y + 1, 2, 1, P.stone[2]); R(g, x - 2, y + 2, 5, 1, P.stone[0]);
  }
}
/* -- flora -- */
function tree(g, x, by, s, pal, orange) {
  const trunkH = Math.max(3, Math.round(4 * s)), cy = by - trunkH - Math.round(6 * s);
  const cols = orange ? ["#3a4426", "#7d6230", "#b8762c"] : pal.leaf;
  const seed = x * 7 + by, side = seed % 2 ? 1 : -1;
  R(g, x - 1, by - trunkH, 2, trunkH, P.wood[0]); R(g, x, by - trunkH, 1, trunkH, P.wood[1]); R(g, x - 1, by - 1, 3, 1, "#2f3a20");
  blob(g, x, cy, Math.round(5 * s), Math.round(5.5 * s), cols, INK, seed);
  blob(g, x + side * Math.round(2.6 * s), cy - Math.round(3 * s), Math.round(3.2 * s), Math.round(2.6 * s), cols, null, seed + 3);
  R(g, x - Math.round(3 * s) * side, cy - Math.round(4 * s), 2, 1, orange ? "#d9a24a" : "#7c8a52");
  R(g, x + Math.round(1 * s), cy + Math.round(3 * s), 2, 1, INK);
}
function shrub(g, x, y, s, pal, orange) {
  blob(g, x, y - Math.round(2 * s), Math.round(4 * s), Math.round(2.5 * s), orange ? [P.leaf[0], "#7d6230", "#b8762c"] : pal.leaf, INK, x * 5 + y);
  R(g, x - 2, y, 4, 1, "#2f3a20");
}
function rock(g, x, y, s) {
  R(g, x - 2 * s, y - 3 * s, 5 * s, 1, P.stone[1]); R(g, x - 3 * s, y - 2 * s, 6 * s, 2 * s, P.stone[1]);
  R(g, x - 2 * s, y - 3 * s, 3 * s, 1, P.stone[2]); R(g, x - 3 * s, y - 1, 6 * s, 1, P.stone[0]);
  R(g, x - 3 * s, y, 6 * s, 1, "#2f3a20");
}

const WOOD = [104, 18, 206, 58], NO_DECOR = [[30, 54, 86, 98], WOOD];
function freeSpot(x, y) {
  for (const id in VILLAGE_LAYOUT) {
    const a = VILLAGE_LAYOUT[id];
    if (Math.abs(a.x - x) < 25 && Math.abs(a.y - y) < 22) return false;
  }
  for (const [x0, y0, x1, y1] of NO_DECOR) if (x > x0 - 4 && x < x1 + 4 && y > y0 - 4 && y < y1 + 4) return false;
  return y >= 24 && y <= 196 && !inWater(x, y, 4) && !mask[y * W + x];
}
function paintScatter(g, pal, season) {
  for (let gy = 28; gy < 196; gy += 19) for (let gx = 8; gx < W - 8; gx += 20) {
    const x = gx + Math.round(hsh(gx, gy, 41) * 14), y = gy + Math.round(hsh(gx, gy, 42) * 12);
    if (!freeSpot(x, y)) continue;
    const n = hsh(x, y, 43), s = 0.82 + hsh(x, y, 44) * 0.4;
    const orange = season === "秋" && hsh(x, y, 45) > 0.55;
    if (n > 0.9) tree(g, x, y, s, pal, orange);
    else if (n > 0.72) shrub(g, x, y, s, pal, orange);
    else if (n > 0.65) rock(g, x, y, 1);
    else if (season === "春" && n > 0.55) { R(g, x, y - 1, 1, 2, "#5c6c40"); R(g, x, y - 2, 1, 1, P.flower); }
  }
}
/* -- buildings, one per place -- */
function roof(g, cx, top, wTop, wBot, h, season) {
  for (let i = 0; i < h; i++) {
    const w = Math.round(wTop + (wBot - wTop) * (i / Math.max(1, h - 1)));
    const x = Math.round(cx - w / 2), y = top + i;
    R(g, x - 1, y, w + 2, 1, INK);
    R(g, x, y, w, 1, i % 2 ? P.thatch[1] : P.thatch[2]);
    if (i % 3 === 1) for (let k = x + 1; k < x + w - 1; k += 4) R(g, k, y, 1, 1, P.thatch[0]);
    if (i > h - 3) R(g, x, y, w, 1, P.thatch[0]);
  }
  R(g, Math.round(cx - wTop / 2), top - 1, wTop, 1, INK);
  R(g, Math.round(cx - wTop / 2) + 1, top, wTop - 2, 1, P.thatch[2]);
  if (season === "冬") {
    R(g, Math.round(cx - wTop / 2) + 1, top, wTop - 2, 1, P.snow[0]);
    R(g, Math.round(cx - wTop / 2), top + 1, wTop, 1, P.snow[1]);
  }
}
function walls(g, x, y, w, h, season) {
  R(g, x - 1, y - 1, w + 2, h + 2, INK);
  R(g, x, y, w, h, P.plaster[0]);
  for (let i = 0; i < w; i += 6) R(g, x + i, y, 1, h, P.wood[1]);
  R(g, x, y, w, 2, P.plaster[1]); R(g, x, y + h - 2, w, 2, P.plaster[1]);
  R(g, x, y, w, 1, P.wood[0]); R(g, x, y + h - 1, w, 1, P.wood[0]);
  if (season === "冬") R(g, x, y + h - 2, w, 1, P.snow[1]);
}
function pots(g, x, y, n) {
  for (let i = 0; i < n; i++) {
    const cx = x + i * 5;
    R(g, cx, y - 4, 4, 4, P.clay[1]); R(g, cx, y - 4, 1, 4, P.clay[2]); R(g, cx + 3, y - 4, 1, 4, P.clay[0]);
    R(g, cx, y, 4, 1, INK);
    if (i === 0) R(g, cx, y - 5, 4, 1, P.clay[0]);
  }
}
function drawYard(g, season) {
  const cx = 112, by = 108;
  for (let x = 92; x <= 132; x += 4) { R(g, x, 76, 1, 6, P.wood[0]); R(g, x, 76, 1, 1, P.wood[2]); }
  R(g, 92, 78, 41, 1, P.wood[1]); R(g, 92, 81, 41, 1, P.wood[0]);
  for (let y = 82; y < 110; y += 4) { R(g, 92, y, 1, 4, P.wood[0]); R(g, 132, y, 1, 4, P.wood[0]); }
  shadow(g, cx, by - 1, 15);
  roof(g, cx, by - 27, 20, 29, 11, season);
  walls(g, cx - 12, by - 16, 24, 15, season);
  R(g, cx - 4, by - 11, 7, 11, INK); R(g, cx - 3, by - 10, 5, 10, P.wood[1]); R(g, cx, by - 10, 1, 10, P.wood[2]);
  R(g, cx - 10, by - 13, 5, 4, INK); R(g, cx - 9, by - 12, 3, 2, "#e0c58a");  // lit window: home
  R(g, cx + 5, by - 13, 4, 3, INK); R(g, cx + 6, by - 12, 2, 1, P.wood[0]);
  pots(g, cx + 13, by, 2);
  for (let x = 92; x <= 132; x += 4) { if (x > 106 && x < 120) continue; R(g, x, 106, 1, 6, P.wood[0]); R(g, x, 106, 1, 1, P.wood[2]); }
  R(g, 92, 108, 14, 1, P.wood[1]); R(g, 121, 108, 11, 1, P.wood[1]);
  R(g, 92, 111, 14, 1, P.wood[0]); R(g, 121, 111, 11, 1, P.wood[0]);
}
function drawLonghouse(g, season) {
  const cx = 158, by = 104;
  shadow(g, cx, by - 1, 23);
  R(g, 132, by - 8, 2, 9, P.wood[0]); R(g, 182, by - 8, 2, 9, P.wood[0]);
  roof(g, cx, by - 32, 30, 47, 16, season);
  walls(g, cx - 22, by - 16, 44, 15, season);
  R(g, cx - 5, by - 13, 9, 13, INK); R(g, cx - 4, by - 12, 7, 12, P.wood[0]);
  R(g, cx - 2, by - 12, 1, 12, P.wood[2]); R(g, cx + 2, by - 12, 1, 12, P.wood[1]);
  for (const wx of [-16, 10]) { R(g, cx + wx, by - 13, 5, 4, INK); R(g, cx + wx + 1, by - 12, 3, 2, "#3a3324"); }
  R(g, cx - 1, by - 33, 2, 1, P.thatch[2]);
}
function drawHearth(g) {
  const cx = 190, by = 120;
  shadow(g, cx, by - 2, 9);
  R(g, cx - 10, by - 18, 1, 14, P.wood[1]); R(g, cx + 9, by - 18, 1, 14, P.wood[1]); R(g, cx - 10, by - 18, 20, 1, P.wood[2]);
  for (let i = 0; i < 4; i++) R(g, cx - 7 + i * 4, by - 17, 2, 4, i % 2 ? "#9a8a70" : "#b8a888");
  R(g, cx - 9, by - 6, 18, 5, INK);
  for (let i = 0; i < 5; i++) { const x = cx - 8 + i * 4; R(g, x, by - 6, 3, 4, i % 2 ? P.stone[1] : P.stone[2]); R(g, x, by - 6, 2, 1, P.stone[2]); }
  R(g, cx - 6, by - 4, 12, 3, "#3a332a");
  R(g, cx - 3, by - 5, 6, 3, "#c4542c"); R(g, cx - 2, by - 7, 4, 3, "#f0a24a"); R(g, cx - 1, by - 8, 2, 2, "#ffd27a");
  pots(g, cx + 11, by, 2);
}
function drawWeaving(g, season) {
  const cx = 126, by = 132;
  shadow(g, cx, by - 1, 12);
  R(g, cx - 11, by - 12, 1, 12, P.wood[1]); R(g, cx + 11, by - 12, 1, 12, P.wood[0]); R(g, cx - 6, by - 12, 1, 12, P.wood[1]);
  R(g, cx - 4, by - 12, 8, 1, P.wood[2]); R(g, cx - 4, by - 12, 1, 9, P.wood[1]); R(g, cx + 3, by - 12, 1, 9, P.wood[1]);
  for (let i = 0; i < 6; i++) R(g, cx - 3 + i, by - 11, 1, 7, i % 2 ? "#c8b48a" : "#9c8a66");
  R(g, cx - 4, by - 4, 8, 1, P.wood[0]);
  roof(g, cx, by - 21, 22, 26, 5, season);
  pots(g, cx + 13, by, 1);
}
function drawHerb(g, season) {
  const cx = 208, by = 66;
  for (let i = 0; i < 2; i++) {
    const x = 186 + i * 9;
    R(g, x, by - 8, 8, 7, P.dirt[0]); R(g, x + 1, by - 7, 6, 5, P.dirt[1]);
    for (let k = 0; k < 4; k++) R(g, x + 1 + k * 2, by - 7 + (k % 2), 1, 2, season === "冬" ? P.snow[1] : season === "秋" ? "#8a8a4a" : "#5c6c40");
  }
  roof(g, cx, by - 17, 12, 18, 7, season);
  walls(g, cx - 7, by - 10, 14, 9, season);
  R(g, cx - 2, by - 6, 4, 5, INK); R(g, cx - 1, by - 5, 2, 4, P.wood[1]);
}
function drawMarket(g, season) {
  const by = 100;
  R(g, 220, by - 12, 1, 12, P.wood[1]); R(g, 234, by - 12, 1, 12, P.wood[0]);
  for (let i = 0; i < 7; i++) R(g, 218 + i * 3, by - 19, 3, 6, i % 2 ? P.thatch[2] : "#a5613c");
  R(g, 217, by - 20, 21, 1, INK); R(g, 219, by - 13, 15, 1, P.wood[2]); R(g, 222, by - 9, 12, 2, P.wood[1]);
  pots(g, 223, by - 7, 3);
  R(g, 238, by - 10, 1, 10, P.wood[1]); R(g, 252, by - 10, 1, 10, P.wood[0]);
  for (let i = 0; i < 6; i++) R(g, 236 + i * 3, by - 16, 3, 5, i % 2 ? "#c9a86a" : "#9c8a66");
  R(g, 235, by - 17, 19, 1, INK); R(g, 239, by - 8, 10, 2, P.wood[1]);
  R(g, 240, by - 10, 3, 2, P.clay[1]); R(g, 245, by - 10, 4, 2, "#8a7a52");
  if (season === "冬") R(g, 235, by - 17, 19, 1, P.snow[0]);
}
function drawShrine(g, season) {
  const cx = 276, by = 124;
  for (let i = 0; i < 5; i++) { const w = 26 - i * 4; R(g, cx - Math.round(w / 2), by - 5 + i, w, 1, i < 2 ? "#6a7a48" : "#5c6c40"); }
  R(g, cx - 8, by - 6, 16, 2, P.dirt[2]); shadow(g, cx, by - 2, 10);
  R(g, cx - 4, by - 22, 9, 17, INK);
  R(g, cx - 3, by - 21, 7, 16, P.stone[1]); R(g, cx - 3, by - 21, 3, 16, P.stone[2]); R(g, cx + 1, by - 21, 3, 16, P.stone[0]);
  R(g, cx - 3, by - 21, 7, 1, "#c9c4b4");
  R(g, cx - 1, by - 16, 2, 1, P.stone[0]); R(g, cx - 1, by - 11, 3, 1, P.stone[0]);
  R(g, cx - 10, by - 4, 4, 3, P.stone[1]); R(g, cx - 9, by - 5, 2, 2, P.stone[2]);
  R(g, cx + 7, by - 6, 3, 5, P.stone[0]); R(g, cx + 9, by - 14, 1, 8, P.wood[1]); R(g, cx + 8, by - 15, 3, 2, P.flower);
  if (season === "冬") R(g, cx - 3, by - 21, 7, 2, P.snow[0]);
}
function drawKiln(g, season) {
  const cx = 68, by = 176;
  shadow(g, cx, by - 1, 10);
  for (let i = 0; i < 14; i++) {
    const t = i / 13, w = Math.round(8 * Math.sqrt(Math.max(0, 1 - t * t)));
    R(g, cx - w - 1, by - 16 + i, w * 2 + 3, 1, INK);
    R(g, cx - w, by - 16 + i, w * 2 + 1, 1, i < 5 ? P.clay[2] : i < 10 ? P.clay[1] : P.clay[0]);
  }
  for (let i = 0; i < 5; i++) {  // stone footing
    R(g, cx - 10 + i * 4, by - 4, 4, 4, i % 2 ? P.stone[1] : P.stone[2]);
    R(g, cx - 10 + i * 4, by - 4, 3, 1, P.stone[2]);
  }
  R(g, cx - 3, by - 8, 7, 5, INK); R(g, cx - 2, by - 7, 5, 4, "#3a2b20");
  R(g, cx - 1, by - 5, 3, 2, "#c4542c"); R(g, cx - 1, by - 4, 2, 1, "#f0a24a");
  R(g, cx - 1, by - 15, 2, 2, "#4a3322");  // smoke vent
  R(g, cx + 10, by - 4, 4, 4, P.clay[1]); R(g, cx + 10, by - 4, 1, 4, P.clay[2]);
  R(g, cx + 15, by - 3, 3, 3, P.clay[0]);
  R(g, cx - 15, by - 3, 4, 3, P.clay[1]);
  if (season === "冬") R(g, cx - 4, by - 14, 9, 1, P.snow[0]);
}
function drawClay(g, season) {
  const cx = 28, by = 182;
  for (const [w, dy, c] of [[15, -15, P.clay[2]], [19, -14, P.clay[2]], [21, -13, P.clay[1]], [21, -12, P.clay[1]],
    [21, -11, P.clay[1]], [21, -10, P.clay[1]], [21, -9, P.clay[1]], [19, -8, P.clay[0]], [17, -7, P.clay[0]], [13, -6, P.clay[0]]]) {
    R(g, cx - Math.round(w / 2), by + dy, w, 1, c);
  }
  R(g, cx - 9, by - 12, 17, 2, "#6d452c");  // far wall in shadow
  R(g, cx - 8, by - 10, 14, 4, "#5d3a26");  // pit recess
  R(g, cx - 7, by - 9, 8, 2, "#4f6e6a");    // rainwater
  R(g, cx - 10, by - 4, 19, 1, "#2f3a20");
  R(g, cx + 8, by - 8, 10, 1, P.clay[2]); R(g, cx + 7, by - 7, 12, 6, P.clay[1]); R(g, cx + 8, by - 6, 10, 4, "#5d3a26");
  for (let i = 0; i < 3; i++) { R(g, cx - 9 + i * 5, by - 18, 4, 3, P.clay[1]); R(g, cx - 9 + i * 5, by - 18, 2, 1, P.clay[2]); }
  if (season === "冬") R(g, cx - 9, by - 15, 15, 1, P.snow[0]);
}
function drawSteps(g, season) {
  const cx = 148, by = 160;
  R(g, cx - 8, by - 13, 1, 13, P.wood[0]); R(g, cx + 7, by - 13, 1, 13, P.wood[0]);
  for (const [w, y] of [[14, 151], [12, 155], [9, 158], [6, 161]]) {
    R(g, cx - Math.round(w / 2) - 1, y, w + 2, 1, INK);
    R(g, cx - Math.round(w / 2), y, w, 2, P.wood[1]);
    R(g, cx - Math.round(w / 2), y, w, 1, P.wood[2]);
  }
  R(g, cx + 9, by - 5, 4, 4, P.clay[1]); R(g, cx + 9, by - 5, 1, 4, P.clay[2]);
  if (season === "冬") R(g, cx - 7, by - 13, 15, 1, P.snow[0]);
}
function drawFord(g, season) {
  const cx = 232, by = 148;
  R(g, cx - 11, by - 6, 22, 1, INK); R(g, cx - 10, by - 5, 20, 5, P.wood[1]);
  for (let x = cx - 9; x < cx + 10; x += 3) R(g, x, by - 5, 1, 5, P.wood[0]);
  for (let i = 0; i < 5; i++) R(g, cx - 9 + i * 4, by - 4, 3, 1, P.wood[2]);
  R(g, cx - 10, by, 20, 1, "#2f3a20");
  R(g, cx - 12, by - 3, 1, 7, P.wood[0]); R(g, cx + 11, by - 3, 1, 7, P.wood[0]); R(g, cx - 11, by - 3, 22, 1, P.wood[2]);
  // canoe riding the current downstream of the deck
  for (let i = 0; i < 5; i++) {
    const w = [8, 10, 11, 10, 8][i], y = by + 15 + i;
    R(g, cx - w - 1, y, w * 2 + 2, 1, INK);
    R(g, cx - w, y, w * 2 + 1, 1, i === 2 || i === 3 ? "#3a2b20" : P.wood[1]);
    if (i === 1) R(g, cx - w + 2, y, w * 2 - 3, 1, P.wood[2]);
  }
  R(g, cx + 2, by + 14, 3, 1, P.wood[0]);
  if (season === "冬") R(g, cx - 10, by - 5, 20, 1, P.snow[0]);
}
function drawFishing(g, season) {
  const cx = 34, by = 126;
  for (const dx of [-8, -3, 3, 8]) R(g, cx + dx, by - 8, 1, 9, P.wood[0]);
  R(g, cx - 10, by - 9, 21, 1, INK); R(g, cx - 9, by - 8, 19, 2, P.wood[1]); R(g, cx - 9, by - 8, 19, 1, P.wood[2]);
  roof(g, cx, by - 25, 12, 20, 8, season);
  R(g, cx - 8, by - 17, 17, 9, INK); R(g, cx - 7, by - 16, 15, 8, P.wood[1]);
  for (let i = 0; i < 4; i++) R(g, cx - 7 + i * 4, by - 16, 1, 8, P.wood[0]);
  R(g, cx - 3, by - 14, 5, 6, INK);
  R(g, cx - 20, by - 14, 1, 14, P.wood[1]); R(g, cx - 13, by - 14, 1, 14, P.wood[1]); R(g, cx - 20, by - 14, 8, 1, P.wood[2]);
  for (let i = 0; i < 5; i++) R(g, cx - 19 + i, by - 12 + (i % 2), 1, 6, "#8a8272");
  R(g, cx - 20, by - 7, 8, 1, "#8a8272");
}
function drawReeds(g, season) {
  const cx = 204, by = 164;
  R(g, cx - 12, by - 2, 25, 3, "#4f7a78");
  for (let i = 0; i < 11; i++) {
    const x = cx - 11 + i * 2 + Math.round(hsh(i, 1, 55));
    const hgt = 8 + Math.round(hsh(i, 2, 55) * 9);
    const base = by - Math.round(hsh(i, 3, 55) * 3);
    const c = season === "秋" ? (i % 3 ? "#c8a45c" : "#9c7f4c") : season === "冬" ? "#8a8574" : i % 3 ? "#7c8a52" : "#5c6c40";
    R(g, x, base - hgt, 1, hgt, c);
    if (i % 2) R(g, x, base - hgt - 2, 1, 2, season === "冬" ? P.stone[2] : "#9c7f4c");
  }
  R(g, cx - 10, by, 20, 1, "#3a4a3a");
}
function drawChestnut(g, season, pal) {
  const spots = [[114, 42], [128, 34], [142, 42], [156, 32], [170, 40], [184, 34], [122, 52], [150, 50], [178, 50], [194, 46], [108, 30], [196, 26]];
  for (const [x, y] of spots) tree(g, x, y, 0.9 + hsh(x, y, 61) * 0.45, pal, season === "秋" && hsh(x, y, 62) > 0.35);
  for (let i = 0; i < 8; i++) shrub(g, 108 + Math.round(hsh(i, 4, 63) * 84), 28 + Math.round(hsh(i, 5, 63) * 22), 0.7, pal, false);
}
function drawBeach(g, season) {
  const cx = 294, by = 76;
  for (const [w, dy, c] of [[14, -8, "#bdb39a"], [18, -7, "#a99f88"], [22, -6, "#a99f88"], [22, -5, "#a99f88"], [20, -4, "#a99f88"], [14, -3, "#9d9480"]])
    R(g, cx - Math.round(w / 2), by + dy, w, 1, c);
  for (let i = 0; i < 18; i++) {
    const x = cx - 10 + Math.round(hsh(i, 1, 71) * 21), y = by - 7 + Math.round(hsh(i, 2, 71) * 4);
    const w = 2 + Math.round(hsh(i, 3, 71) * 2);
    R(g, x, y, w, 1, i % 3 === 0 ? P.stone[2] : P.stone[1]);
    R(g, x + 1, y + 1, w, 1, P.stone[0]);
  }
  if (season === "冬") R(g, cx - 9, by - 8, 18, 1, P.snow[0]);
}
function paintPlaces(g, season, pal) {
  drawChestnut(g, season, pal); drawHerb(g, season); drawBeach(g, season); drawMarket(g, season);
  drawLonghouse(g, season); drawYard(g, season); drawHearth(g); drawShrine(g, season);
  drawFishing(g, season); drawWeaving(g, season); drawFord(g, season); drawSteps(g, season);
  drawReeds(g, season); drawKiln(g, season); drawClay(g, season);
}
function buildScene(g, season) {
  const pal = palettes(season);
  g.imageSmoothingEnabled = false;
  paintGrass(g, pal, season); paintHills(g, pal, season); paintWater(g, pal, season);
  paintPaths(g, season); paintField(g, season); paintCrossing(g);
  paintScatter(g, pal, season); paintPlaces(g, season, pal);
}

const staticCache = new Map();
function staticLayer(season) {
  let cv = staticCache.get(season);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    buildScene(cv.getContext("2d"), season);
    staticCache.set(season, cv);
  }
  return cv;
}
/* -- per-frame animation -- */
function drawSparkles(g, t) {
  for (let i = 0; i < 18; i++) {
    const x = 3 + Math.floor(hsh(i, 7, 3) * 314), phase = (t / 1200 + i * 0.37) % 1;
    if (phase > 0.6) continue;
    const y = Math.round(RY[x] + (hsh(i, 3, 4) * 2 - 1) * (RH[x] - 2));
    g.globalAlpha = 0.35 + (phase < 0.3 ? 1 - Math.abs(phase - 0.15) / 0.15 : 1) * 0.55;
    R(g, x, y, 1, 1, SPARK); if (hsh(i, 5, 4) > 0.55) R(g, x + 1, y, 1, 1, SPARK);
    g.globalAlpha = 1;
  }
  for (let i = 0; i < 3; i++) {  // slow drifting highlights
    const x = 318 - Math.round((t / 42 + i * 111) % 318);
    if (x < 2 || x > W - 2) continue;
    g.globalAlpha = 0.5; R(g, x, Math.round(RY[x] - 1 + hsh(i, 9, 8) * 2), 3, 1, SPARK); g.globalAlpha = 1;
  }
}
function drawSmoke(g, x, y, t, seed) {
  for (let i = 0; i < 5; i++) {
    const p = ((t / 2800 + i / 5 + seed) % 1 + 1) % 1, s = p < 0.45 ? 2 : 1;
    const xx = Math.round(x + Math.sin(p * 5.2 + i) * (1 + p * 2.4)), yy = Math.round(y - p * 20);
    g.globalAlpha = 0.42 * (1 - p);
    R(g, xx, yy, s, s, "#d8d2c4");
    if (p < 0.3) R(g, xx + 1, yy + 1, 1, 1, "#e3ded2");
    g.globalAlpha = 1;
  }
}
function drawMarker(g, a, t) {
  const x = a.x, y = a.y - 37 - Math.round(Math.abs(Math.sin(t / 420)) * 3);
  const rows = [[9, -2], [9, -1], [7, 0], [5, 1], [3, 2], [1, 3]];
  for (const [w, dy] of rows) R(g, x - (w >> 1) - 1, y + dy, w + 2, 1, INK);
  for (const [w, dy] of rows) R(g, x - (w >> 1), y + dy, w, 1, "#f6d68a");
  R(g, x - 1, y - 2, 2, 1, "#ffeec0");
  g.globalAlpha = 0.3;
  R(g, x - 6, a.y + 1, 13, 1, INK);
  g.globalAlpha = 1;
}
function drawHover(g, a) {
  const x0 = a.x - 12, y0 = a.y - 20, x1 = a.x + 12, y1 = a.y + 4;
  for (const [o, c] of [[1, "rgba(20,16,10,0.5)"], [0, "#f6e3a0"]]) {
    R(g, x0 + o, y0 + o, 6, 1, c); R(g, x0 + o, y0 + o, 1, 5, c);
    R(g, x1 - 5 + o, y0 + o, 6, 1, c); R(g, x1 + o, y0 + o, 1, 5, c);
    R(g, x0 + o, y1 + o, 6, 1, c); R(g, x0 + o, y1 - 4 + o, 1, 5, c);
    R(g, x1 - 5 + o, y1 + o, 6, 1, c); R(g, x1 + o, y1 - 4 + o, 1, 5, c);
  }
}
function drawDisabled(g, a) { g.globalAlpha = 0.42; R(g, a.x - 13, a.y - 21, 27, 26, INK); g.globalAlpha = 1; }
/**
 * Paint the whole village map.
 * @param {CanvasRenderingContext2D} ctx context of a 320*k x 200*k canvas
 * @param {{places?:Array,currentPlaceId?:string,season?:string,t?:number,hover?:string|null,k?:number}} opts
 */
export function drawVillageMap(ctx, opts) {
  const o = opts || {};
  const k = Math.max(1, Math.round(o.k || 1));
  const season = o.season === "春" || o.season === "秋" || o.season === "冬" ? o.season : "夏";
  const t = o.t || 0;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W * k, H * k);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(staticLayer(season), 0, 0, W, H, 0, 0, W * k, H * k);
  ctx.restore();

  ctx.save();
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const enabled = new Map();
  for (const p of o.places || []) if (p && p.placeId) enabled.set(p.placeId, p.enabled !== false);
  for (const id in VILLAGE_LAYOUT) if (enabled.get(id) === false) drawDisabled(ctx, VILLAGE_LAYOUT[id]);
  drawSparkles(ctx, t);
  drawSmoke(ctx, 190, 110, t, 0);
  drawSmoke(ctx, 68, 160, t, 0.5);
  if (o.hover && VILLAGE_LAYOUT[o.hover]) drawHover(ctx, VILLAGE_LAYOUT[o.hover]);
  if (o.currentPlaceId && VILLAGE_LAYOUT[o.currentPlaceId]) drawMarker(ctx, VILLAGE_LAYOUT[o.currentPlaceId], t);
  ctx.restore();
}

/** Native-pixel hit test against the 24x22 icon box. */
export function placeAt(px, py) {
  for (const id in VILLAGE_LAYOUT) {
    const a = VILLAGE_LAYOUT[id];
    if (px >= a.x - 12 && px <= a.x + 12 && py >= a.y - 17 && py <= a.y + 5) return id;
  }
  return null;
}

/** Foot point of a place icon, in native map pixels. */
export function anchorOf(placeId) {
  const a = VILLAGE_LAYOUT[placeId];
  return a ? { x: a.x, y: a.y } : null;
}
