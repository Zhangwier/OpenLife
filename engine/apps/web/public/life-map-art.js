/**
 * Hand-placed pixel art for the life map: the small things the art-lab
 * sprites do not cover (work spots, objects, material piles, interiors).
 * Everything is drawn at native pixels (16 px per cell) with whole-pixel
 * rectangles, so it shares one grid with the downsampled v6 sprites.
 */

export const CELL = 16;

/** Stable hash → [0,1). Decoration and animation phase never use Math.random. */
export function h2(x, y, seed = 1) {
  let n = Math.imul(x + seed * 97, 374761393) ^ Math.imul(y + seed * 41, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function hashStr(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const P = {
  ink: "#2b241d", wood: "#6b4a2f", woodL: "#8c6643", woodD: "#4a3322", straw: "#c9a86a", strawD: "#9c7f4c", strawL: "#e0c58a",
  clay: "#b0764a", clayL: "#cf9566", clayD: "#7e5133", pale: "#d6c3a0", paleD: "#b19d7c", stone: "#8d897c", stoneL: "#b3ae9f", stoneD: "#5f5b52",
  fire: "#f0a24a", fireL: "#ffd27a", fireD: "#c4542c", leaf: "#5c6c40", leafL: "#7c8a52", leafD: "#3a4426", water: "#4f7a78", waterL: "#8fb7ac",
  cloth: "#c8b48a", clothD: "#9c8a66", red: "#9b4a34", grain: "#d8c04a", grainD: "#a8903a", fish: "#9fb0ac", fishD: "#5f706c", ash: "#4a443c",
};

function r(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
/** Filled ellipse from whole-pixel rows. */
function ell(g, cx, cy, rx, ry, c) {
  g.fillStyle = c;
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.0001))));
    g.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1);
  }
}
function shadow(g, cx, cy, rx, ry = 2) { g.globalAlpha = 0.28; ell(g, cx, cy, rx, ry, "#1d2414"); g.globalAlpha = 1; }

function flame(g, x, y, t, s = 1) {
  const f = Math.floor(t / 120) % 3;
  r(g, x - 2 * s, y - 3 * s - f, 4 * s, 3 * s + f, P.fireD);
  r(g, x - 1 * s, y - 5 * s - (f === 1 ? 1 : 0), 3 * s, 4 * s, P.fire);
  r(g, x, y - 4 * s + (f === 2 ? 1 : 0), s + 0, 2 * s, P.fireL);
}
function smoke(g, x, y, t) {
  g.globalAlpha = 0.35;
  for (let i = 0; i < 4; i++) {
    const k = ((t / 900 + i / 4) % 1);
    r(g, x + Math.round(Math.sin(k * 6 + i) * 3), y - Math.round(k * 26), 3, 3, "#d8d2c4");
  }
  g.globalAlpha = 1;
}
function pot(g, x, y, c = P.clay, w = 5, h = 6) {
  ell(g, x, y - h / 2, w, h / 2, c);
  r(g, x - w + 1, y - h / 2 - 1, 2, 2, P.clayL);
  r(g, x - w + 2, y - h - 1, w * 2 - 3, 2, P.clayD);
}

/** Work features, drawn with their foot at (x, y) = bottom-centre of a two-cell spot. */
const WORK = {
  bed(g, x, y) {
    r(g, x - 24, y - 26, 48, 24, P.woodD); r(g, x - 23, y - 25, 46, 20, P.straw);
    for (let i = 0; i < 46; i += 3) r(g, x - 23 + i, y - 25, 1, 20, P.strawD);
    r(g, x - 4, y - 24, 26, 17, P.cloth); r(g, x - 4, y - 24, 26, 2, P.clothD); r(g, x + 16, y - 22, 5, 12, P.red);
    r(g, x - 21, y - 23, 9, 6, P.pale); r(g, x - 24, y - 3, 48, 3, P.woodD);
  },
  rack(g, x, y) {
    r(g, x - 22, y - 34, 3, 34, P.woodD); r(g, x + 19, y - 34, 3, 34, P.woodD);
    for (const yy of [y - 30, y - 18, y - 6]) r(g, x - 22, yy, 44, 3, P.wood);
    [[-14, -31], [-4, -31], [8, -19], [-12, -19], [14, -7], [-2, -7]].forEach(([dx, dy], i) => pot(g, x + dx, y + dy, i % 2 ? P.clay : P.pale, 4, 6));
  },
  firepit(g, x, y, t) {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; r(g, x + Math.round(Math.cos(a) * 7) - 2, y - 6 + Math.round(Math.sin(a) * 4), 4, 3, i % 2 ? P.stone : P.stoneD); }
    r(g, x - 4, y - 7, 9, 3, P.ash); flame(g, x, y - 5, t); smoke(g, x, y - 12, t);
  },
  "work-yard"(g, x, y) { // drying rack with greenware
    r(g, x - 20, y - 26, 3, 26, P.woodD); r(g, x + 17, y - 26, 3, 26, P.woodD); r(g, x - 22, y - 28, 44, 3, P.wood);
    r(g, x - 20, y - 14, 40, 2, P.wood);
    for (const dx of [-14, -4, 6]) pot(g, x + dx, y - 15, P.pale, 4, 7);
    for (const dx of [-10, 2, 12]) pot(g, x + dx, y - 1, P.paleD, 4, 6);
  },
  "work-hearth"(g, x, y, t) {
    ell(g, x, y - 6, 18, 7, P.stoneD); ell(g, x, y - 7, 15, 5, P.stone); ell(g, x, y - 8, 10, 3, P.ash);
    flame(g, x - 2, y - 7, t, 1); pot(g, x + 3, y - 12, P.clayD, 7, 9); smoke(g, x + 3, y - 24, t);
  },
  "work-riverbank"(g, x, y) {
    ell(g, x - 8, y - 4, 9, 4, P.stoneD); ell(g, x - 8, y - 5, 8, 3, P.stoneL); ell(g, x + 9, y - 3, 7, 3, P.stoneD); ell(g, x + 9, y - 4, 6, 2, P.stone);
    pot(g, x + 1, y - 8, P.clay, 4, 7);
  },
  "work-field"(g, x, y) { // a stake with a straw figure and a basket
    r(g, x - 1, y - 30, 3, 30, P.woodD); r(g, x - 10, y - 24, 21, 2, P.wood);
    ell(g, x, y - 20, 6, 7, P.straw); r(g, x - 3, y - 33, 7, 6, P.strawL); r(g, x - 5, y - 34, 11, 2, P.strawD);
    ell(g, x + 14, y - 4, 6, 4, P.strawD); r(g, x + 9, y - 8, 11, 2, P.straw);
  },
  "work-kiln"(g, x, y, t) {
    ell(g, x, y - 13, 18, 13, P.clayD); ell(g, x, y - 14, 16, 12, P.clay); ell(g, x - 5, y - 19, 6, 5, P.clayL);
    r(g, x - 5, y - 10, 10, 10, P.ink); flame(g, x, y - 1, t); r(g, x - 2, y - 30, 4, 4, P.clayD); smoke(g, x, y - 32, t);
  },
  "work-claypit"(g, x, y) { ell(g, x, y - 5, 15, 6, P.clayD); ell(g, x - 2, y - 7, 11, 5, P.clay); ell(g, x - 4, y - 9, 5, 2, P.clayL); r(g, x + 9, y - 22, 2, 18, P.woodL); r(g, x + 7, y - 6, 6, 3, P.wood); },
  "work-reedbed"(g, x, y) { for (let i = -3; i <= 3; i++) { r(g, x + i * 5 - 1, y - 22 - (i % 2) * 2, 3, 22, i % 2 ? P.strawL : P.straw); } r(g, x - 17, y - 12, 34, 2, P.woodD); },
  "work-ford"(g, x, y) { r(g, x - 22, y - 10, 44, 7, P.wood); for (let i = 0; i < 44; i += 6) r(g, x - 22 + i, y - 10, 1, 7, P.woodD); r(g, x - 22, y - 16, 3, 13, P.woodD); r(g, x + 19, y - 16, 3, 13, P.woodD); ell(g, x + 4, y - 2, 14, 2, P.woodD); },
  "work-longhouse"(g, x, y, t) { WORK.firepit(g, x, y, t); r(g, x - 20, y - 4, 8, 3, P.woodL); r(g, x + 13, y - 4, 8, 3, P.woodL); },
  "work-workshop"(g, x, y) { // a back-strap loom frame
    r(g, x - 18, y - 30, 3, 30, P.woodD); r(g, x + 15, y - 30, 3, 30, P.woodD); r(g, x - 18, y - 30, 36, 3, P.wood);
    for (let i = 0; i < 30; i += 2) r(g, x - 15 + i, y - 27, 1, 16, i % 4 ? P.cloth : P.pale);
    r(g, x - 15, y - 11, 30, 8, P.cloth); r(g, x - 15, y - 11, 30, 1, P.clothD);
  },
  "work-shrine"(g, x, y) { r(g, x - 6, y - 34, 12, 32, P.stoneD); r(g, x - 5, y - 33, 9, 30, P.stone); r(g, x - 4, y - 32, 3, 22, P.stoneL); r(g, x - 16, y - 6, 32, 5, P.stoneD); pot(g, x - 11, y - 6, P.clay, 3, 4); pot(g, x + 11, y - 6, P.pale, 3, 4); },
  "work-market"(g, x, y) {
    r(g, x - 22, y - 32, 2, 32, P.woodD); r(g, x + 20, y - 32, 2, 32, P.woodD); r(g, x - 24, y - 34, 48, 6, P.red); for (let i = 0; i < 48; i += 6) r(g, x - 24 + i, y - 34, 3, 6, P.pale);
    r(g, x - 20, y - 14, 40, 4, P.wood); pot(g, x - 12, y - 14, P.clay, 4, 6); r(g, x - 2, y - 19, 8, 5, P.cloth); ell(g, x + 13, y - 16, 4, 2, P.grain);
  },
  "work-forest"(g, x, y) { ell(g, x - 4, y - 6, 9, 5, P.woodD); ell(g, x - 4, y - 8, 8, 3, P.woodL); r(g, x - 2, y - 18, 2, 10, P.wood); r(g, x - 4, y - 19, 6, 3, P.stone); for (let i = 0; i < 3; i++) r(g, x + 7, y - 4 - i * 3, 14, 3, i % 2 ? P.woodL : P.wood); },
  "work-stonebeach"(g, x, y) { ell(g, x, y - 6, 12, 6, P.stoneD); ell(g, x, y - 7, 11, 4, P.stoneL); for (let i = 0; i < 6; i++) r(g, x - 16 + i * 6, y - 1 - (i % 2), 2, 1, P.ink); },
  "work-lodge"(g, x, y) { r(g, x - 20, y - 28, 3, 28, P.woodD); r(g, x + 17, y - 28, 3, 28, P.woodD); r(g, x - 20, y - 28, 40, 2, P.wood); for (let i = 0; i < 36; i += 3) r(g, x - 17 + i, y - 26, 1, 18 - (i % 6), P.paleD); for (let i = 0; i < 4; i++) r(g, x - 16 + i * 9, y - 16, 5, 2, P.fish); },
  "work-herbs"(g, x, y) { r(g, x - 18, y - 26, 2, 26, P.woodD); r(g, x + 16, y - 26, 2, 26, P.woodD); r(g, x - 18, y - 26, 36, 2, P.wood); for (let i = 0; i < 6; i++) r(g, x - 14 + i * 6, y - 24, 3, 8 + (i % 3) * 2, i % 2 ? P.leafL : P.leaf); pot(g, x, y - 1, P.clayD, 5, 6); },
  signpost(g, x, y) { r(g, x - 1, y - 22, 3, 22, P.woodD); r(g, x - 8, y - 22, 16, 6, P.wood); r(g, x - 7, y - 21, 14, 1, P.woodL); },
  rock(g, x, y) { ell(g, x, y - 5, 7, 5, P.stoneD); ell(g, x - 1, y - 6, 5, 3, P.stone); r(g, x - 3, y - 8, 3, 1, P.stoneL); },
  pit(g, x, y) { ell(g, x, y - 7, 8, 5, P.clayD); ell(g, x, y - 7, 6, 3, "#3d2a1c"); },
};
// Themed props (one cell each, placed by the layout as obstacles).
Object.assign(WORK, {
  woodpile(g, x, y) { for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { const yy = y - 4 - (2 - i) * 4; ell(g, x - 8 + j * 6 + (2 - i) * 3, yy, 3, 2, P.wood); r(g, x - 9 + j * 6 + (2 - i) * 3, yy - 1, 2, 2, P.strawD); } },
  potstack(g, x, y) { pot(g, x - 5, y, P.clay, 4, 7); pot(g, x + 5, y, P.clayD, 4, 7); pot(g, x, y - 7, P.pale, 4, 6); },
  mound(g, x, y) { ell(g, x, y - 4, 10, 5, P.clayD); ell(g, x - 2, y - 6, 7, 3, P.clay); r(g, x - 4, y - 8, 3, 1, P.clayL); },
  stall(g, x, y) { r(g, x - 11, y - 22, 2, 22, P.woodD); r(g, x + 9, y - 22, 2, 22, P.woodD); r(g, x - 13, y - 24, 26, 5, P.cloth); for (let i = 0; i < 26; i += 4) r(g, x - 13 + i, y - 24, 2, 5, P.red); r(g, x - 10, y - 9, 20, 3, P.wood); pot(g, x - 5, y - 9, P.clay, 3, 4); ell(g, x + 4, y - 10, 3, 1, P.grain); },
  basketpile(g, x, y) { THING.basket(g, x - 5, y); THING.basket(g, x + 5, y - 1); THING.bag(g, x, y - 6); },
  bench(g, x, y) { r(g, x - 10, y - 7, 20, 3, P.woodL); r(g, x - 10, y - 4, 20, 1, P.woodD); r(g, x - 8, y - 4, 2, 4, P.woodD); r(g, x + 6, y - 4, 2, 4, P.woodD); },
  canoe(g, x, y) { ell(g, x, y - 4, 12, 3, P.woodD); ell(g, x, y - 5, 10, 2, P.wood); r(g, x - 6, y - 5, 12, 1, P.woodL); r(g, x + 2, y - 12, 1, 8, P.woodL); },
  post(g, x, y) { r(g, x - 2, y - 16, 4, 16, P.woodD); r(g, x - 2, y - 16, 1, 16, P.woodL); r(g, x - 3, y - 10, 6, 2, P.strawD); },
  reeds(g, x, y) { for (let i = -4; i <= 4; i++) { const h = 12 + ((i * 7 + 13) % 6); r(g, x + i * 2, y - h, 1, h, i % 2 ? P.strawL : P.leafL); r(g, x + i * 2, y - h - 2, 1, 3, P.wood); } },
  reedstack(g, x, y) { for (let i = -3; i <= 3; i++) r(g, x + i * 2, y - 16, 2, 16, i % 2 ? P.strawL : P.straw); r(g, x - 7, y - 9, 15, 2, P.woodD); },
  netrack(g, x, y) { WORK["work-lodge"](g, x, y); },
  fishrack(g, x, y) { r(g, x - 10, y - 18, 2, 18, P.woodD); r(g, x + 8, y - 18, 2, 18, P.woodD); r(g, x - 10, y - 18, 20, 2, P.wood); for (let i = 0; i < 4; i++) r(g, x - 7 + i * 4, y - 16, 2, 7, P.fish); },
  stonepile(g, x, y) { ell(g, x - 4, y - 3, 5, 3, P.stoneD); ell(g, x + 4, y - 3, 5, 3, P.stone); ell(g, x, y - 7, 4, 3, P.stoneL); },
  standing(g, x, y) { r(g, x - 4, y - 24, 8, 23, P.stoneD); r(g, x - 3, y - 24, 6, 22, P.stone); r(g, x - 3, y - 23, 2, 16, P.stoneL); r(g, x - 3, y - 14, 6, 1, P.leaf); },
  offering(g, x, y) { r(g, x - 8, y - 5, 16, 4, P.stoneD); pot(g, x - 3, y - 4, P.clay, 3, 4); ell(g, x + 4, y - 6, 2, 1, P.grain); r(g, x + 2, y - 9, 1, 3, P.fireL); },
  haystack(g, x, y) { ell(g, x, y - 8, 10, 8, P.strawD); ell(g, x - 1, y - 10, 8, 7, P.straw); r(g, x - 4, y - 15, 4, 2, P.strawL); r(g, x - 1, y - 20, 2, 4, P.woodD); },
  log(g, x, y) { r(g, x - 12, y - 7, 24, 6, P.wood); r(g, x - 12, y - 7, 24, 1, P.woodL); ell(g, x - 12, y - 4, 2, 3, P.strawD); ell(g, x - 12, y - 4, 1, 2, P.woodL); },
  stump(g, x, y) { ell(g, x, y - 4, 7, 4, P.woodD); ell(g, x, y - 6, 6, 3, P.strawD); ell(g, x, y - 6, 3, 1, P.woodL); },
  herbbed(g, x, y) { r(g, x - 11, y - 7, 22, 7, P.clayD); for (let i = 0; i < 5; i++) { r(g, x - 9 + i * 4, y - 10 - (i % 2), 2, 5, i % 2 ? P.leafL : P.leaf); r(g, x - 9 + i * 4, y - 11 - (i % 2), 2, 1, i % 3 ? P.grain : P.leafL); } },
});
WORK["work-home-room"] = WORK.bed; WORK["work-store-room"] = WORK.rack;

export function drawWork(g, kind, x, y, t = 0) {
  const fn = WORK[kind] ?? WORK[`work-${kind}`] ?? WORK["work-yard"];
  shadow(g, x, y - 1, 16, 3);
  fn(g, x, y, t);
}
export const hasWork = (kind) => Boolean(WORK[kind]);

/** What kind of small thing an object prototype is (same buckets as scene-props.js). */
export function objectLook(prototypeId = "", name = "") {
  const p = String(prototypeId);
  if (p.includes("water-cache")) return "cistern";
  if (p === "prototype:greenware") return "greenware";
  if (p.includes("jar") || p.includes("urn")) return "jar";
  if (p.includes("cooking-pot") || p.includes("bowl") || p.includes("sieve")) return "pot";
  if (p.includes("shared-kiln")) return "kiln";
  if (p.includes("hearth")) return "hearth";
  if (p.includes("fuel-bundle")) return "fuel";
  if (p.includes("reed-bundle")) return "reed";
  if (p.includes("carrying-bag")) return "bag";
  if (p.includes("basket") || p.includes("fish-trap")) return "basket";
  if (p === "prototype:fish") return "fish";
  if (p === "prototype:cooked-food") return "pot";
  if (p === "prototype:net") return "net";
  if (p === "prototype:rope") return "rope";
  if (p.includes("fiber-bundle")) return "fiber";
  if (p.includes("fiber-wrap") || p.includes("cloak") || p.includes("cloth")) return "cloth";
  if (p.includes("grain")) return "grain";
  if (p.includes("clay")) return "clay";
  if (p.includes("mat")) return "mat";
  if (p.includes("knife") || p.includes("needle") || p.includes("digging") || p.includes("paddle") || p.includes("stick") || p.includes("axe")) return "tool";
  if (p.includes("grinding") || p.includes("stone")) return "stone";
  if (String(name).includes("罐")) return "jar";
  return "crate";
}
const RESOURCE_LOOK = {
  "resource:water": "water", "resource:grain": "grain", "resource:cooked": "pot", "resource:reed": "reed", "resource:fuel": "fuel",
  "resource:wood": "fuel", "resource:clay": "clay", "resource:fish": "fish", "resource:rope": "rope", "resource:fiber": "fiber",
  "resource:stone": "stone", "resource:chestnut": "nuts", "resource:herb": "herbs", "resource:mat": "mat",
};
export const resourceLook = (id) => RESOURCE_LOOK[id] ?? "crate";

const THING = {
  jar(g, x, y) { pot(g, x, y, P.clay, 5, 10); },
  greenware(g, x, y) { pot(g, x, y, P.pale, 4, 8); },
  pot(g, x, y) { ell(g, x, y - 3, 6, 3, P.clayD); ell(g, x, y - 4, 5, 2, P.clay); r(g, x - 3, y - 6, 6, 1, P.ink); },
  cistern(g, x, y) { ell(g, x, y - 4, 9, 4, P.stoneD); ell(g, x, y - 5, 7, 2, P.water); r(g, x - 3, y - 6, 3, 1, P.waterL); },
  kiln(g, x, y, t) { WORK["work-kiln"](g, x, y, t); },
  hearth(g, x, y, t) { WORK.firepit(g, x, y, t); },
  fuel(g, x, y) { for (let i = 0; i < 3; i++) { r(g, x - 7, y - 3 - i * 3, 14, 3, i % 2 ? P.woodL : P.wood); r(g, x - 7, y - 3 - i * 3, 2, 3, P.strawD); } },
  reed(g, x, y) { for (let i = -2; i <= 2; i++) r(g, x + i * 2, y - 14 + Math.abs(i), 1, 14 - Math.abs(i), i % 2 ? P.strawL : P.straw); r(g, x - 4, y - 6, 9, 2, P.woodD); },
  bag(g, x, y) { ell(g, x, y - 5, 6, 5, P.strawD); r(g, x - 2, y - 11, 4, 2, P.wood); r(g, x - 4, y - 7, 8, 1, P.straw); },
  basket(g, x, y) { r(g, x - 6, y - 8, 12, 8, P.straw); for (let i = 0; i < 12; i += 2) r(g, x - 6 + i, y - 8, 1, 8, P.strawD); r(g, x - 7, y - 9, 14, 2, P.strawD); r(g, x - 5, y - 10, 10, 1, P.grain); },
  fish(g, x, y) { ell(g, x - 1, y - 3, 6, 2, P.fish); r(g, x + 5, y - 5, 2, 5, P.fishD); r(g, x - 5, y - 4, 1, 1, P.ink); },
  net(g, x, y) { ell(g, x, y - 3, 7, 3, P.paleD); for (let i = -6; i <= 6; i += 3) r(g, x + i, y - 5, 1, 4, P.woodD); },
  rope(g, x, y) { ell(g, x, y - 3, 6, 3, P.strawD); ell(g, x, y - 3, 3, 1, P.straw); },
  fiber(g, x, y) { for (let i = -4; i <= 4; i++) r(g, x + i, y - 10 + Math.abs(i % 3), 1, 10, i % 2 ? P.pale : P.paleD); r(g, x - 5, y - 5, 11, 2, P.wood); },
  cloth(g, x, y) { r(g, x - 7, y - 6, 14, 6, P.cloth); r(g, x - 7, y - 6, 14, 1, P.pale); r(g, x - 7, y - 3, 14, 1, P.clothD); },
  grain(g, x, y) { for (let i = -3; i <= 3; i++) { r(g, x + i * 2, y - 12, 1, 12, P.grainD); r(g, x + i * 2 - 1, y - 14, 2, 4, P.grain); } r(g, x - 5, y - 6, 11, 2, P.strawD); },
  clay(g, x, y) { ell(g, x, y - 3, 7, 3, P.clayD); ell(g, x - 1, y - 4, 5, 2, P.clay); },
  mat(g, x, y) { r(g, x - 8, y - 5, 16, 5, P.straw); for (let i = 0; i < 16; i += 2) r(g, x - 8 + i, y - 5, 1, 5, P.strawD); },
  tool(g, x, y) { r(g, x - 7, y - 3, 12, 2, P.woodL); r(g, x + 4, y - 5, 4, 5, P.stone); },
  stone(g, x, y) { ell(g, x, y - 3, 7, 3, P.stoneD); ell(g, x, y - 4, 5, 2, P.stone); },
  nuts(g, x, y) { for (let i = 0; i < 5; i++) ell(g, x - 5 + i * 3, y - 2 - (i % 2) * 2, 1, 1, P.wood); },
  herbs(g, x, y) { for (let i = -2; i <= 2; i++) r(g, x + i * 2, y - 8 + Math.abs(i), 1, 8, i % 2 ? P.leafL : P.leaf); },
  water(g, x, y, t) { const k = Math.floor(t / 300) % 3; g.globalAlpha = 0.7; ell(g, x, y - 3, 6 + k, 2, P.waterL); g.globalAlpha = 1; },
  crate(g, x, y) { r(g, x - 5, y - 9, 10, 9, P.wood); r(g, x - 5, y - 9, 10, 1, P.woodL); r(g, x - 5, y - 5, 10, 1, P.woodD); },
};
export function drawThing(g, look, x, y, t = 0) {
  if (look !== "water" && look !== "kiln" && look !== "hearth") shadow(g, x, y - 1, 7, 2);
  (THING[look] ?? THING.crate)(g, x, y, t);
}

/** Interior walls, floor and doorways for a W×H room. */
export function paintInterior(g, map, theme, season) {
  const W = map.width * CELL, H = map.height * CELL;
  const floorA = theme === "store-room" ? [118, 92, 64] : [124, 96, 66];
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, n = h2(x >> 1, y >> 1, 3), k = (n - 0.5) * 14;
    let [cr, cg, cb] = floorA;
    if (h2(x, y, 9) > 0.985) { cr = 200; cg = 172; cb = 110; } // straw scraps
    d[i] = cr + k; d[i + 1] = cg + k * 0.9; d[i + 2] = cb + k * 0.7; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // A woven mat in the middle of the room.
  r(g, 5 * CELL, 6 * CELL + 4, 5 * CELL, 3 * CELL - 4, P.strawD); r(g, 5 * CELL + 2, 6 * CELL + 6, 5 * CELL - 4, 3 * CELL - 8, P.straw);
  for (let x = 5 * CELL + 2; x < 10 * CELL - 2; x += 4) r(g, x, 6 * CELL + 6, 1, 3 * CELL - 8, P.strawD);
  // Back wall: plaster between timber posts, a roof beam on top.
  r(g, 0, 0, W, 3 * CELL, "#cdbb97");
  for (let y = 0; y < 3 * CELL; y++) for (let x = 0; x < W; x++) if (h2(x, y, 5) > 0.93) r(g, x, y, 1, 1, "#b8a47e");
  r(g, 0, 0, W, 9, "#3b2a1c"); r(g, 0, 9, W, 2, P.woodD); r(g, 0, 3 * CELL - 3, W, 3, P.woodD);
  for (let x = 0; x < W; x += 3 * CELL) r(g, x + 6, 9, 5, 3 * CELL - 9, P.wood);
  // Side and front walls, seen from above.
  r(g, 0, 0, CELL, H, "#3b2a1c"); r(g, W - CELL, 0, CELL, H, "#3b2a1c");
  r(g, CELL - 3, 3 * CELL, 3, H - 4 * CELL, P.woodD); r(g, W - CELL, 3 * CELL, 3, H - 4 * CELL, P.woodD);
  r(g, 0, H - CELL, W, CELL, "#3b2a1c"); r(g, 0, H - CELL, W, 3, P.wood);
  // Doorways: the way out in the front wall, inner doors in the back wall.
  r(g, map.gate.x * CELL - 2, H - CELL, CELL + 4, CELL, "#7c5f40"); r(g, map.gate.x * CELL, H - CELL, CELL, CELL, "#a2865c");
  for (const door of map.doors) {
    r(g, door.x * CELL - 2, CELL, CELL + 4, 2 * CELL, P.woodD);
    r(g, door.x * CELL, CELL + 3, CELL, 2 * CELL - 3, "#2a1f16");
    r(g, door.x * CELL + 3, 2 * CELL + 4, CELL - 6, CELL - 4, "#4a3826");
  }
  // Wall life: a small window, a shelf with pots, bundles hung to dry (by stable hash, so rooms differ).
  const seed = hashStr(map.sceneId);
  const free = (x0) => !map.doors.some((d) => Math.abs(d.x * CELL - x0) < 26);
  const win = 3 * CELL + 6 + (seed % 3) * CELL;
  if (free(win)) { r(g, win, 18, 18, 14, P.woodD); r(g, win + 2, 20, 14, 10, "#8fb7c8"); r(g, win + 2, 20, 14, 3, "#cfe3ea"); r(g, win + 8, 20, 2, 10, P.woodD); }
  const shelf = W - 5 * CELL - ((seed >>> 3) % 3) * CELL;
  if (free(shelf)) { r(g, shelf, 26, 30, 3, P.wood); pot(g, shelf + 6, 26, P.clay, 3, 6); pot(g, shelf + 15, 26, P.pale, 3, 5); pot(g, shelf + 24, 26, P.clayD, 3, 6); }
  for (let i = 0; i < 3; i++) {
    const hx = CELL * (5 + ((seed >>> (6 + i * 3)) % 6)) + i * 3;
    if (!free(hx)) continue;
    r(g, hx, 12, 1, 6, P.woodD);
    for (let k = 0; k < 4; k++) r(g, hx - 3 + k * 2, 18, 1, 6 + (k % 2) * 2, i === 1 ? P.grain : i === 2 ? P.clayD : P.leaf);
  }
  if (season === "冬") { g.globalAlpha = 0.08; r(g, 0, 0, W, H, "#a8c0d8"); g.globalAlpha = 1; }
}
