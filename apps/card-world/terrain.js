// Paints a generated land onto the ground canvas: shaded terrain from the grid, then roads, water, places and growth.
// Repainted when the season turns: snow and ice in winter, blossom in spring, deep green in summer, red and gold in autumn.
import { CELL, G, rng } from "./mapgen.js";

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c, d, t) => [lerp(c[0], d[0], t), lerp(c[1], d[1], t), lerp(c[2], d[2], t)];
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const COMMON = { slope: [158, 150, 108], scree: [166, 158, 144], rock: [138, 126, 112], snow: [238, 240, 236], wetSand: [178, 162, 122], ford: [170, 182, 150] };
export const SEASON_LOOK = {
  春: { dry: [176, 188, 112], lush: [138, 170, 92], forest: [104, 140, 76], sand: [216, 200, 156], shallow: [124, 170, 160], deep: [70, 118, 124], sea: [58, 102, 122], snowLine: 0.98,
    yard: "#c8a876", road: "#c4a676", field: ["#a47c4c", "#86623a", "#8fbf5a"], canopy: [["#5f8a3e", "#78a24c", "#9cc266", "#476a2e"], ["#6b9440", "#86ad52", "#a8cc70", "#4f7232"]],
    blossom: ["#e6a8b8", "#f0c4d0", "#f8e0e8", "#b07080"], bush: ["#6a9244", "#7fa652", "#a0c46a", "#4e6e32"], pine: ["#3f5e34", "#4d6e3c", "#5f8048"], tuft: "rgba(96,140,60,.6)", flowers: ["#f0e6c8", "#e8a0b0", "#f2d04a", "#b9a6d8"], reed: "#7d9050" },
  夏: { dry: [150, 170, 92], lush: [108, 146, 72], forest: [80, 118, 58], sand: [218, 202, 156], shallow: [118, 168, 158], deep: [62, 112, 122], sea: [50, 98, 122], snowLine: 1.02,
    yard: "#c4a272", road: "#c2a272", field: ["#7e8e44", "#6a7838", "#9cbc4a"], canopy: [["#3f6a2c", "#4f7e36", "#6a9a46", "#2f5222"], ["#4a7430", "#5c8a3a", "#78a64c", "#365a24"]],
    bush: ["#4c7a34", "#5e8e40", "#7aa852", "#3a5e28"], pine: ["#2f5028", "#3d6232", "#4e763e"], tuft: "rgba(70,110,46,.6)", flowers: ["#f2d04a", "#e8e0f0", "#e07a5a"], reed: "#6e8a44" },
  秋: { dry: [196, 176, 104], lush: [174, 158, 90], forest: [150, 122, 72], sand: [214, 196, 150], shallow: [124, 160, 150], deep: [68, 108, 116], sea: [56, 96, 116], snowLine: 0.96,
    yard: "#c8a470", road: "#c0a070", field: ["#d0a848", "#a8822e", "#e8c45a"], canopy: [["#b8602a", "#d07a34", "#eba454", "#7e3e1c"], ["#c49a32", "#d8b244", "#f0d068", "#86661c"], ["#a2402c", "#bc5634", "#d87a50", "#6e2a1c"]],
    bush: ["#a2702e", "#b8863a", "#d4a656", "#6e4a1e"], pine: ["#3a5a32", "#486a3a", "#5a7c46"], tuft: "rgba(176,150,80,.65)", leaves: ["#c86a2e", "#d8a03a", "#a8442e"], reed: "#b89a5a" },
  冬: { dry: [226, 228, 226], lush: [214, 220, 218], forest: [200, 206, 204], sand: [222, 218, 208], shallow: [196, 218, 224], deep: [92, 124, 136], sea: [74, 104, 124], snowLine: 0.84, winter: true,
    yard: "#d6cdbc", road: "#cfc2aa", field: ["#e2e2dc", "#bdb6a6", "#e2e2dc"], canopy: [["#7a6048", "#8e7458", "#e8eae6", "#5a4634"]],
    bush: ["#8a7458", "#9c866a", "#eef0ec", "#5e4c38"], pine: ["#355030", "#42603a", "#eef0ec"], tuft: "rgba(140,130,110,.4)", reed: "#bfae86" },
};

function blurField(m, src, times = 1) {
  let a = src;
  for (let k = 0; k < times; k++) {
    const b = new Float32Array(a.length);
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const rr = r + dy, cc = c + dx; if (rr < 0 || cc < 0 || rr >= m.rows || cc >= m.cols) continue; s += a[rr * m.cols + cc]; n++; }
      b[r * m.cols + c] = s / n;
    }
    a = b;
  }
  return a;
}
/** Smoothed fields depend only on the map; computed once. */
function fieldsOf(m) {
  if (m._fields) return m._fields;
  const ind = (f) => Float32Array.from(m.cls, f);
  const wat = blurField(m, ind((c) => (c <= G.SHALLOW || c === G.FORD ? 1 : 0)));
  const e = blurField(m, m.elev), shade = new Float32Array(m.elev.length);
  for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.cols; c++) {
    const at = (rr, cc) => e[Math.max(0, Math.min(m.rows - 1, rr)) * m.cols + Math.max(0, Math.min(m.cols - 1, cc))];
    shade[r * m.cols + c] = (at(r, c - 1) - at(r, c + 1) + at(r - 1, c) - at(r + 1, c)) * 5.5;
  }
  m._fields = [e, wat, blurField(m, wat, 2), blurField(m, ind((c) => (c === G.FORD ? 1 : 0))), blurField(m, ind((c) => (c === G.FOREST ? 1 : 0))),
    blurField(m, ind((c) => (c === G.SAND ? 1 : 0))), blurField(m, ind((c) => (c === G.SCREE ? 1 : 0))), m.mo, shade, blurField(m, Float32Array.from(m.jungle ?? new Uint8Array(m.cls.length)), 2)];
  return m._fields;
}

/** Base terrain, one pixel per 4 world px, shaded from the elevation; colours blend where ground changes. */
function paintBase(m, L) {
  const K = 0.25, w = Math.round(m.W * K), h = Math.round(m.H * K);
  const fields = fieldsOf(m), v = new Float32Array(fields.length);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const g = cv.getContext("2d"), img = g.createImageData(w, h), px = img.data;
  const C = { ...COMMON, ...L };
  for (let y = 0; y < h; y++) {
    const gy = Math.max(0, Math.min(m.rows - 1.001, (y / K) / CELL - 0.5)), r0 = Math.floor(gy), fy = gy - r0, wy = y / K;
    for (let x = 0; x < w; x++) {
      const gx = Math.max(0, Math.min(m.cols - 1.001, (x / K) / CELL - 0.5)), c0 = Math.floor(gx), fx = gx - c0;
      const i00 = r0 * m.cols + c0, i10 = i00 + 1, i01 = i00 + m.cols, i11 = i01 + 1;
      for (let k = 0; k < fields.length; k++) { const f = fields[k]; v[k] = lerp(lerp(f[i00], f[i10], fx), lerp(f[i01], f[i11], fx), fy); }
      const [ev, wv, dv, fdv, fov, sav, scv, mov, shv, jv] = v;
      let col = mix(C.dry, C.lush, sm(0.3, 0.7, mov));
      if (L.winter) col = mix(col, [168, 166, 140], sm(0.66, 0.74, mov) * 0.6);    // grass showing through thin snow
      col = mix(col, C.forest, sm(0.3, 0.7, fov));
      col = mix(col, L.winter ? [150, 162, 140] : [58, 84, 48], sm(0.3, 0.75, jv) * 0.85);     // jungle floor: deep shade
      col = mix(col, C.slope, sm(0.6, 0.7, ev) * (1 - sm(0.4, 0.7, fov)));
      col = mix(col, C.scree, sm(0.35, 0.65, scv));
      col = mix(col, C.rock, sm(0.73, 0.8, ev));
      col = mix(col, C.snow, sm(L.snowLine, L.snowLine + 0.08, ev));
      col = mix(col, C.sand, sm(0.35, 0.6, sav) * (1 - sm(0.62, 0.7, ev)));
      col = mix(col, C.wetSand, sm(0.36, 0.46, wv) * (1 - sm(0.48, 0.5, wv)) * (L.winter ? 0.3 : 1));
      const isSea = wy > m.seaY(x / K) - 40;
      col = mix(col, mix(C.shallow, isSea ? C.sea : C.deep, sm(L.winter && !isSea ? 0.75 : 0.55, 0.95, dv)), sm(0.47, 0.52, wv));
      const light = Math.max(0.72, Math.min(1.22, 1 + shv * (0.35 + 0.9 * sm(0.5, 0.85, ev)) * (wv > 0.5 ? 0.1 : 1)));
      const n = (((x * 73856093) ^ (y * 19349663)) & 255) / 255 - 0.5;
      const o = (y * w + x) * 4;
      px[o] = col[0] * light + n * 10; px[o + 1] = col[1] * light + n * 10; px[o + 2] = col[2] * light + n * 8; px[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function curve(g, pts) {
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
  const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
}
function blob(g, x, y, r, R, squash = 0.72) {
  const pts = Array.from({ length: 14 }, (_, i) => { const t = (i / 14) * Math.PI * 2, rr = r * (0.86 + R() * 0.18); return [x + Math.cos(t) * rr, y + Math.sin(t) * rr * squash]; });
  const mid = (i) => { const p = pts[i % 14], q = pts[(i + 1) % 14]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
  g.beginPath(); g.moveTo(...mid(0));
  for (let i = 1; i <= 14; i++) g.quadraticCurveTo(...pts[i % 14], ...mid(i));
  g.closePath();
}

/** Everything on the ground canvas. keepClear: points (card centres) where nothing should grow. */
export function paintTerrain(canvas, m, { DECO = {}, keepClear = [], season = "春", eco = [] } = {}) {
  const L = SEASON_LOOK[season];
  const K = 0.5;
  canvas.width = m.W * K; canvas.height = m.H * K; canvas.style.width = `${m.W}px`; canvas.style.height = `${m.H}px`;
  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(paintBase(m, L), 0, 0, canvas.width, canvas.height);
  g.scale(K, K); g.lineCap = g.lineJoin = "round";
  const R = rng(m.seed ^ 0x2f1);                      // same seed every season: things stay where they were

  // places: trodden yards, tilled fields, banks, stone ground, the pier
  for (const s of [...Object.values(m.sites), ...(m.extraFields ?? [])]) {
    if (!s.patch) continue;
    g.save();
    if (s.patch === "yard") {
      const w = 380, h = 300;
      g.save(); g.beginPath(); g.roundRect(s.x - w / 2, s.y - h / 2 + 20, w, h, 56);
      g.globalAlpha = .55; g.fillStyle = L.yard; g.fill(); g.globalAlpha = 1; g.clip();
      for (let k = 0; k < 70; k++) { g.fillStyle = R() < 0.5 ? "rgba(120,90,55,.12)" : "rgba(250,240,220,.16)"; g.beginPath(); g.arc(s.x + (R() - 0.5) * 360, s.y + (R() - 0.5) * 280, 3 + R() * 5, 0, 7); g.fill(); }
      g.restore();
    }
    if (s.patch === "field") {
      const [soil, furrow, crop] = L.field, w = s.w ?? 440, h = s.h ?? 300;
      g.save(); g.beginPath(); g.roundRect(s.x - w / 2, s.y - h / 2, w, h, 34);
      g.globalAlpha = .92; g.fillStyle = soil; g.fill(); g.globalAlpha = 1; g.clip();
      g.strokeStyle = furrow; g.lineWidth = 9;
      for (let y = s.y - h / 2 + 26; y < s.y + h / 2; y += 44) { g.beginPath(); g.moveTo(s.x - w / 2, y); g.quadraticCurveTo(s.x, y - 10, s.x + w / 2, y + 6); g.stroke(); }
      if (!L.winter) { g.strokeStyle = crop; g.lineWidth = 5; for (let y = s.y - h / 2 + 32; y < s.y + h / 2; y += 44) for (let x = s.x - w / 2 + 22; x < s.x + w / 2 - 10; x += 30) { const yy = y - 10 * (1 - ((x - s.x) / (w / 2)) ** 2) * 0.3; g.beginPath(); g.moveTo(x, yy + 5); g.lineTo(x + 2, yy - (season === "春" ? 5 : 12)); g.stroke(); } }
      g.restore();
    }
    if (s.patch === "bank") { blob(g, s.x, s.y, 150, R); g.fillStyle = `rgba(${L.sand.join(",")},.55)`; g.fill(); }
    if (s.patch === "scree") { blob(g, s.x, s.y, 190, R); g.fillStyle = L.winter ? "rgba(200,198,190,.5)" : "rgba(150,142,128,.5)"; g.fill(); }
    if (s.patch === "dock") { blob(g, s.x, s.y, 140, R); g.fillStyle = `rgba(${L.sand.join(",")},.6)`; g.fill(); }
    g.restore();
  }
  for (const r of m.decks ?? []) if (r.pier) {
    g.fillStyle = "rgba(30,40,40,.25)"; g.fillRect(r.x + 10, r.y + 12, r.w, r.h);
    g.fillStyle = "#8a6a44"; g.strokeStyle = "#5a422a"; g.lineWidth = 5;
    for (let y = r.y; y < r.y + r.h; y += 34) { g.fillRect(r.x, y, r.w, 28); g.strokeRect(r.x, y, r.w, 28); }
    if (L.winter) { g.fillStyle = "rgba(240,242,240,.6)"; for (let y = r.y; y < r.y + r.h; y += 34) g.fillRect(r.x + 8, y + 2, r.w * 0.5, 8); }
  }

  // roads: a soft dirt path, not a highway
  for (const pts of m.roads) {
    g.strokeStyle = "rgba(112, 88, 58, .12)"; g.lineWidth = 42; curve(g, pts); g.stroke();
    g.globalAlpha = .6; g.strokeStyle = L.road; g.lineWidth = 26; curve(g, pts); g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = "rgba(255, 248, 230, .07)"; g.lineWidth = 8; curve(g, pts); g.stroke();
  }

  // water: ripples (or ice cracks), and the bridge
  g.strokeStyle = L.winter ? "rgba(255,255,255,.5)" : "rgba(235,245,240,.35)"; g.lineWidth = L.winter ? 3 : 6;
  for (let i = 0; i < m.cls.length; i++) {
    if (m.cls[i] !== G.DEEP || R() > (m.water[i] === 2 ? 0.25 : 0.05)) continue;
    const x = m.X(i) + (R() - 0.5) * 30, y = m.Y(i);
    g.beginPath();
    if (L.winter && m.water[i] === 1) { g.moveTo(x - 30, y - 6); g.lineTo(x - 6, y + 4); g.lineTo(x + 14, y - 8); g.lineTo(x + 34, y + 2); }
    else { g.moveTo(x - 34, y); g.quadraticCurveTo(x, y - 12, x + 34, y); }
    g.stroke();
  }
  bridge(g, m, L);

  // growth: trees in woods, pines up the slopes, peaks on the mountains, stones on scree, reeds at the shore, tufts and flowers in the meadow
  const clearOf = (x, y, r) => keepClear.every((p) => Math.hypot(p.x - x, p.y - y) > Math.max(r, p.r ?? 0));
  const items = [];
  for (let i = 0; i < m.cls.length; i++) {
    const c = m.cls[i], x = m.X(i), y = m.Y(i), r1 = R(), r2 = R();
    if (m.road[i]) continue;
    const j = () => ({ x: x + (R() - 0.5) * CELL * 1.4, y: y + (R() - 0.5) * CELL * 1.4 });
    if ((c === G.ROCK || c === G.SNOW) && r1 < 0.1) { items.push({ x: x + (r2 - 0.5) * CELL, y: y + (R() - 0.5) * CELL, kind: "peak", s: 0.6 + R() * 0.35 + (m.elev[i] - 0.76), v: R(), snow: m.elev[i] > L.snowLine - 0.06 }); continue; }
    if (m.orchard?.[i]) {                                             // trees set out in rows, grass between
      const cc = i % m.cols, rr = Math.floor(i / m.cols);
      if (cc % 3 === 0 && rr % 3 === 0) { const p = { x: x + (r1 - 0.5) * 10, y: y + (r2 - 0.5) * 10 }; if (clearOf(p.x, p.y, 150)) items.push({ ...p, kind: "otree", s: 1.15 + R() * 0.2, v: R() }); }
      continue;
    }
    if (c === G.FOREST && m.jungle?.[i]) {                          // jungle: two or three trees to a patch, big and dark
      for (let k = 0; k < 2 + (r2 < 0.4 ? 1 : 0); k++) { const p = j(); if (clearOf(p.x, p.y, 150)) items.push({ ...p, kind: "jtree", s: 0.95 + R() * 0.5, v: R() }); }
      continue;
    }
    if (c === G.FOREST && r1 < (m.elev[i] > 0.64 ? 0.4 : 0.55)) { const p = j(); if (clearOf(p.x, p.y, 170)) items.push({ ...p, kind: m.elev[i] > 0.64 ? "pine" : "tree", s: 0.75 + R() * 0.45, v: R() }); }
    else if (c === G.SLOPE && r1 < 0.06) { const p = j(); if (clearOf(p.x, p.y, 170)) items.push({ ...p, kind: "pine", s: 0.7 + R() * 0.4, v: R() }); }
    else if (c === G.MEADOW && r1 < 0.007) { const p = j(); if (clearOf(p.x, p.y, 220)) items.push({ ...p, kind: r2 < 0.6 ? "tree" : "bush", s: 0.8 + R() * 0.4, v: R() }); }
    else if (c === G.MEADOW && r1 < 0.032) { const p = j(); if (clearOf(p.x, p.y, 120)) items.push({ ...p, kind: L.flowers && r2 < 0.45 ? "flowers" : "grass_tuft", s: 1, v: R() }); }
    else if ((c === G.SCREE && r1 < 0.28) || (c === G.ROCK && m.dm[i] === 0 && r1 < 0.05)) { const p = j(); if (clearOf(p.x, p.y, 120)) items.push({ ...p, kind: "rock", s: 0.7 + R() * 0.7, v: R() }); }
    else if (c === G.SAND && m.dw[i] <= 1 && r1 < 0.2) { const p = j(); if (clearOf(p.x, p.y, 120)) items.push({ ...p, kind: "reeds_small", s: 0.7 + R() * 0.4, v: R() }); }
  }
  items.sort((p, q) => p.y - q.y);
  for (const it of items) if (it.kind === "tree" || it.kind === "jtree" || it.kind === "otree" || it.kind === "pine" || it.kind === "bush") shadow(g, it);
  for (const it of items) drawDeco(g, it, DECO, L);
  if (L.leaves) for (let k = 0; k < 900; k++) {                      // fallen leaves under the trees
    const it = items[Math.floor(R() * items.length)];
    if (!it || it.kind !== "tree") continue;
    g.fillStyle = L.leaves[Math.floor(R() * L.leaves.length)]; g.beginPath(); g.ellipse(it.x + (R() - 0.5) * 160, it.y + (R() - 0.5) * 120, 7, 4, R() * 3, 0, 7); g.fill();
  }
  // things that grow: young trees at the wood, berry bushes, reeds. Winter strips the berries and dries the reeds.
  const grows = (eco ?? []).map((e) => ({ x: e.x, y: e.y, s: e.size, v: e.v, kind: e.kind, bare: e.bare, dry: e.dry })).sort((a, b) => a.y - b.y);
  for (const it of grows) if (it.kind === "tree" || it.kind === "berry") shadow(g, it);
  for (const it of grows) drawDeco(g, it, DECO, L);
}

/** A plank bridge across the river where the road crosses it. */
function bridge(g, m, L) {
  const k = m.river.findIndex(([x, y]) => Math.hypot(x - m.fordPt[0], y - m.fordPt[1]) < 1);
  const half = m.riverW(Math.max(0, k) / m.river.length) + CELL * 1.6, wide = 58;
  g.save(); g.translate(m.fordPt[0], m.fordPt[1]); g.rotate(Math.atan2(-m.fordDir[0], m.fordDir[1]));   // x runs across the river
  g.fillStyle = "rgba(20,30,30,.3)"; g.fillRect(-half + 10, -wide + 14, half * 2, wide * 2);
  for (const x of [-half + 30, -half / 3, half / 3, half - 30]) for (const y of [-wide - 4, wide + 4]) { g.fillStyle = "#4e3826"; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
  g.fillStyle = "#9a7448"; g.strokeStyle = "#5a422a"; g.lineWidth = 5; g.fillRect(-half, -wide, half * 2, wide * 2); g.strokeRect(-half, -wide, half * 2, wide * 2);
  g.strokeStyle = "#76563a"; g.lineWidth = 3;
  for (let x = -half + 22; x < half; x += 22) { g.beginPath(); g.moveTo(x, -wide + 3); g.lineTo(x, wide - 3); g.stroke(); }
  g.fillStyle = "#6e4e30"; g.strokeStyle = "#4a3422"; g.lineWidth = 3;
  for (const y of [-wide - 9, wide - 1]) { g.fillRect(-half - 6, y, half * 2 + 12, 10); g.strokeRect(-half - 6, y, half * 2 + 12, 10); }
  if (L.winter) { g.fillStyle = "rgba(242,244,240,.75)"; g.fillRect(-half + 6, -wide + 6, half * 2 - 12, wide * 0.8); }
  g.restore();
}
function shadow(g, it) {
  const r = (it.kind === "bush" || it.kind === "berry" ? 34 : it.kind === "pine" ? 46 : 62) * it.s;
  g.fillStyle = "rgba(38,52,26,.19)"; g.beginPath(); g.ellipse(it.x + r * 0.35, it.y + r * 0.3, r * 1.05, r * 0.8, 0, 0, 7); g.fill();
}
/** Seen from above, like the rest of the ground. Cards stand on top of it. */
function drawDeco(g, it, DECO, L) {
  const { x, y, s, v } = it;
  const img = DECO[it.kind === "tree" ? (v < 0.5 ? "tree1" : "tree2") : it.kind === "pine" ? "tree2" : it.kind];
  if (img && it.kind !== "peak") { const w = { tree: 170, pine: 140, bush: 95, rock: 70, grass_tuft: 55, flowers: 60, reeds_small: 90 }[it.kind] * s; g.drawImage(img, x - w / 2, y - w / 2, w, w); return; }
  g.save(); g.translate(x, y); g.scale(s, s);
  const blobs = (parts, [dark, mid, light, edge]) => {
    g.lineWidth = 4; g.strokeStyle = edge;
    for (const [a, b, r] of parts) { g.fillStyle = dark; g.beginPath(); g.arc(a, b, r, 0, 7); g.fill(); g.stroke(); }
    for (const [a, b, r] of parts) { g.fillStyle = dark; g.beginPath(); g.arc(a, b, r - 2, 0, 7); g.fill(); }
    for (const [a, b, r] of parts) { g.fillStyle = mid; g.beginPath(); g.arc(a - r * 0.18, b - r * 0.2, r * 0.72, 0, 7); g.fill(); }
    for (const [a, b, r] of parts) { g.fillStyle = light; g.beginPath(); g.arc(a - r * 0.35, b - r * 0.38, r * 0.32, 0, 7); g.fill(); }
  };
  if (it.kind === "peak") {
    const w = 100, h = 92 + v * 32, px = (v - 0.5) * 26;
    g.fillStyle = "rgba(50,40,30,.25)"; g.beginPath(); g.ellipse(14, 4, w * 0.62, 22, 0, 0, 7); g.fill();
    g.strokeStyle = "#5a5044"; g.lineWidth = 5;
    g.fillStyle = L.winter ? "#d8d6d0" : "#b8ad98"; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(px, -h); g.lineTo(px * 0.4 + 6, 0); g.closePath(); g.fill();
    g.fillStyle = L.winter ? "#a8a49c" : "#8c8172"; g.beginPath(); g.moveTo(px, -h); g.lineTo(w / 2, 0); g.lineTo(px * 0.4 + 6, 0); g.closePath(); g.fill();
    if (it.snow) { const k = L.winter ? 0.5 : 0.3; g.fillStyle = "#f4f4f0"; g.beginPath(); g.moveTo(px, -h); g.lineTo(px - h * k * 0.7, -h * (1 - k)); g.lineTo(px - 4, -h * (1 - k * 0.8)); g.lineTo(px + 6, -h * (1 - k * 1.2)); g.lineTo(px + h * k * 0.7, -h * (1 - k * 0.9)); g.closePath(); g.fill(); }
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(px, -h); g.lineTo(w / 2, 0); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(px, -h); g.lineTo(px * 0.4 + 6, 0); g.stroke();
  } else if (it.kind === "otree") {
    if (L.winter) { it.kind = "tree"; g.restore(); return drawDeco(g, it, DECO, L); }    // bare in winter, like any tree
    const k = v * 6.28, parts = [[0, 0, 40], ...[0, 1, 2, 3, 4].map((i) => [Math.cos(k + i * 1.26) * 28, Math.sin(k + i * 1.26) * 24, 24])];
    const blossom = L.blossom, look = blossom ? ["#e8b8c4", "#f2d0d8", "#fbe8ec", "#b07a86"] : L.leaves ? ["#9a8a3a", "#b4a24a", "#d0c068", "#6e6224"] : ["#4f7a36", "#628e42", "#7ea856", "#3a5a26"];
    blobs(parts, look);
    if (!blossom) { g.fillStyle = L.leaves ? "#a8442e" : "#e88a6a"; for (let q = 0; q < 9; q++) { g.beginPath(); g.arc(Math.cos(k + q * 0.7) * (14 + (q % 3) * 8), Math.sin(k + q * 0.7) * (12 + (q % 3) * 6), 5.5, 0, 7); g.fill(); } }
  } else if (it.kind === "jtree") {
    const k = v * 6.28, parts = [[0, 0, 46], ...[0, 1, 2, 3, 4, 5].map((i) => [Math.cos(k + i * 1.05) * 34, Math.sin(k + i * 1.05) * 30, 28 + ((i * 5 + v * 9) % 9)])];
    blobs(parts, v < 0.5 ? ["#28411f", "#355428", "#4a6e36", "#1c2e16"] : ["#2e4a22", "#3c5e2c", "#56783c", "#203418"]);
    if (L.winter) { g.fillStyle = "rgba(240,242,238,.55)"; for (let q = 0; q < 4; q++) { g.beginPath(); g.arc(Math.cos(k + q) * 20 - 6, Math.sin(k + q) * 16 - 8, 7, 0, 7); g.fill(); } }
    g.strokeStyle = "rgba(90,120,60,.7)"; g.lineWidth = 3;                // hanging vines
    for (let q = 0; q < 3; q++) { const x = (q - 1) * 22 + v * 10; g.beginPath(); g.moveTo(x, 20); g.quadraticCurveTo(x + 6, 40, x - 2, 58); g.stroke(); }
  } else if (it.kind === "tree") {
    if (L.winter) {                                                     // bare branches with a little snow
      g.strokeStyle = "#5a4634"; g.lineCap = "round";
      for (let k = 0; k < 7; k++) { const a = v * 6 + k * 0.9, r = 36 + (k % 3) * 8; g.lineWidth = 7 - (k % 3); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.4) * r * 0.5, Math.sin(a + 0.4) * r * 0.5, Math.cos(a) * r, Math.sin(a) * r * 0.85); g.stroke(); }
      g.fillStyle = "#f0f2ee"; for (let k = 0; k < 5; k++) { const a = v * 6 + k * 1.3; g.beginPath(); g.arc(Math.cos(a) * 24, Math.sin(a) * 20, 5, 0, 7); g.fill(); }
      g.fillStyle = "#6e5640"; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
    } else {
      const k = v * 6.28, parts = [[0, 0, 44], ...[0, 1, 2, 3, 4].map((i) => [Math.cos(k + i * 1.26) * 30, Math.sin(k + i * 1.26) * 26, 26 + ((i * 7 + v * 10) % 8)])];
      const look = L.blossom && v > 0.78 ? L.blossom : L.canopy[Math.floor(v * L.canopy.length) % L.canopy.length];
      blobs(parts, look);
    }
  } else if (it.kind === "pine") {
    g.lineWidth = 4; g.strokeStyle = "#2f4626";
    L.pine.forEach((col, i) => {
      const r = [46, 32, 18][i];
      g.fillStyle = col; g.beginPath();
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2 + v, rr = k % 2 ? r * 0.62 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill(); if (i === 0) g.stroke();
    });
  } else if (it.kind === "bush") {
    blobs([[-14, 4, 18], [14, 2, 17], [0, -10, 20]], L.bush);
  } else if (it.kind === "berry") {
    if (it.bare) {
      g.strokeStyle = "#6b4a32"; g.lineWidth = 4; g.lineCap = "round";
      for (let k = 0; k < 7; k++) { const a = -1.5 + k * 0.42, r = 20 + (k % 3) * 5; g.beginPath(); g.moveTo(0, 4); g.quadraticCurveTo(Math.cos(a) * r * 0.55, -6, Math.cos(a) * r, -r * 0.9); g.stroke(); }
      g.fillStyle = "#8a6a44"; g.beginPath(); g.arc(0, 4, 6, 0, 7); g.fill();
    } else {
      blobs([[-14, 4, 18], [14, 2, 17], [0, -10, 20]], L.bush);
      g.fillStyle = "#c4473e";
      for (const [a, b] of [[-10, -2], [8, -6], [2, 8], [-4, -12]]) { g.beginPath(); g.arc(a, b, 4, 0, 7); g.fill(); }
    }
  } else if (it.kind === "reeds") {
    g.lineWidth = 3; g.strokeStyle = it.dry ? "#b09a72" : L.reed;
    for (const a of [-12, -4, 4, 12]) { g.beginPath(); g.moveTo(a, 0); g.quadraticCurveTo(a + 3, -16, a + 1, -32); g.stroke(); }
    if (!it.dry) { g.fillStyle = "#8a6a3e"; for (const a of [-10, 6]) { g.beginPath(); g.ellipse(a + 1, -34, 3, 7, 0, 0, 7); g.fill(); } }
  } else if (it.kind === "rock") {
    g.fillStyle = "rgba(40,40,30,.25)"; g.beginPath(); g.ellipse(6, 6, 24, 15, 0, 0, 7); g.fill();
    g.fillStyle = "#9d968a"; g.strokeStyle = "#6e675c"; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 22, 15, v * 3, 0, 7); g.fill(); g.stroke();
    g.fillStyle = L.winter ? "#f2f2ee" : "#bcb5a6"; g.beginPath(); g.ellipse(-6, -4, 12, 7, 0.3, 0, 7); g.fill();
  } else if (it.kind === "grass_tuft") {
    g.lineWidth = 3; g.strokeStyle = L.tuft;
    for (const a of [-10, -4, 2, 8]) { g.beginPath(); g.moveTo(a * 0.5, 0); g.lineTo(a, -12); g.stroke(); }
  } else if (it.kind === "flowers") {
    const col = L.flowers[Math.floor(v * L.flowers.length)];
    for (const [a, b] of [[-12, -4], [0, -10], [11, -2], [4, 7], [-7, 6]]) { g.fillStyle = col; g.beginPath(); g.arc(a, b, 4.5, 0, 7); g.fill(); g.fillStyle = "rgba(90,70,30,.5)"; g.beginPath(); g.arc(a, b, 1.5, 0, 7); g.fill(); }
  } else if (it.kind === "reeds_small") {
    g.lineWidth = 3; g.strokeStyle = L.reed;
    for (const a of [-12, -4, 4, 12]) { g.beginPath(); g.moveTo(a, 0); g.quadraticCurveTo(a + 3, -16, a + 1, -32); g.stroke(); }
    g.fillStyle = "#8a6a3e"; for (const a of [-10, 6]) { g.beginPath(); g.ellipse(a + 1, -34, 3, 7, 0, 0, 7); g.fill(); }
  }
  g.restore();
}

/** The lake breathes with the tide: at high water it creeps over the beach, at low water a band of wet sand shows.
 *  Drawn on its own small canvas round the lake, so only that band is repainted as the level changes. */
export function paintTide(canvas, m, level, season = "春") {
  if (!m._tide) {
    const N = m.cls.length, lake = (i) => m.water[i] === 1;
    const bfs = (src) => {
      const d = new Float32Array(N).fill(1e9), q = []; for (let i = 0; i < N; i++) if (src(i)) { d[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) { const i = q[h], c = i % m.cols; for (const j of [c > 0 ? i - 1 : -1, c < m.cols - 1 ? i + 1 : -1, i - m.cols, i + m.cols]) if (j >= 0 && j < N && d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); } }
      return d;
    };
    // Signed distance to the shore, measured straight (not in grid steps), so the waterline stays round.
    const shore = [], sd = new Float32Array(N).fill(1e4);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < N; i++) {
      if (!lake(i)) continue;
      x0 = Math.min(x0, m.X(i)); y0 = Math.min(y0, m.Y(i)); x1 = Math.max(x1, m.X(i)); y1 = Math.max(y1, m.Y(i));
    }
    // shore points where the painted (smoothed) water crosses one half — the same line the ground shows
    const wat = fieldsOf(m)[1];
    for (let i = 0; i < N; i++) {
      const x = m.X(i), y = m.Y(i), c = i % m.cols;
      if (x < x0 - 200 || x > x1 + 200 || y < y0 - 200 || y > y1 + 200) continue;
      for (const j of [c < m.cols - 1 ? i + 1 : -1, i + m.cols]) {
        if (j < 0 || j >= N || (wat[i] - 0.5) * (wat[j] - 0.5) > 0) continue;
        const t = (0.5 - wat[i]) / (wat[j] - wat[i]);
        shore.push([x + (m.X(j) - x) * t, y + (m.Y(j) - y) * t]);
      }
    }
    void bfs;
    for (let i = 0; i < N; i++) {
      const x = m.X(i), y = m.Y(i);
      if (x < x0 - 400 || x > x1 + 400 || y < y0 - 400 || y > y1 + 400) continue;
      let best = 1e9; for (const [sx, sy] of shore) { const d = (sx - x) ** 2 + (sy - y) ** 2; if (d < best) best = d; }
      sd[i] = (wat[i] >= 0.5 ? -1 : 1) * Math.sqrt(best);
    }
    const pad = 240, box = { x: Math.max(0, x0 - pad), y: Math.max(0, y0 - pad), x1: Math.min(m.W, x1 + pad), y1: Math.min(m.H, y1 + pad) };
    m._tide = { sd, box };
    canvas.style.left = `${box.x}px`; canvas.style.top = `${box.y}px`; canvas.style.width = `${box.x1 - box.x}px`; canvas.style.height = `${box.y1 - box.y}px`;
  }
  const { sd, box } = m._tide, K = 0.25, A = 70, L = SEASON_LOOK[season];
  const w = Math.round((box.x1 - box.x) * K), h = Math.round((box.y1 - box.y) * K);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const g = canvas.getContext("2d"), img = g.createImageData(w, h), px = img.data;
  const edge = level * A, water = [0, 1, 2].map((k) => L.shallow[k] * 0.6 + L.deep[k] * 0.4), sand = [168, 152, 112];
  for (let y = 0; y < h; y++) {
    const gy = Math.max(0, Math.min(m.rows - 1.001, (box.y + y / K) / CELL - 0.5)), r0 = Math.floor(gy), fy = gy - r0;
    for (let x = 0; x < w; x++) {
      const gx = Math.max(0, Math.min(m.cols - 1.001, (box.x + x / K) / CELL - 0.5)), c0 = Math.floor(gx), fx = gx - c0, i = r0 * m.cols + c0;
      const d = lerp(lerp(sd[i], sd[i + 1], fx), lerp(sd[i + m.cols], sd[i + m.cols + 1], fx), fy);
      let col = null, a = 0;
      if (level > 0 && d >= -8 && d < edge) { col = water; a = Math.min(1, (edge - d) / 14) * 0.92; }            // flooded beach
      else if (level < 0 && d < 0 && d > edge) { col = sand; a = Math.min(1, (d - edge) / 14) * 0.95; }          // exposed lake bed
      if (!col) continue;
      const o = (y * w + x) * 4;
      px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = a * 255;
    }
  }
  g.putImageData(img, 0, 0);
}
