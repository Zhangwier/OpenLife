/**
 * Life map renderer: one native-pixel world (16 px cells), drawn through an
 * integer-scaled camera. The ground is baked once per scene from the v6
 * lawn/ground textures; standing things (houses, trees, people, objects) are
 * y-sorted every frame so feet decide who stands in front. Nothing here
 * decides rules: tiles, props and targets all come from the server's map.
 */
import { CELL, h2, hashStr, drawWork, drawThing, hasWork, objectLook, resourceLook, paintInterior } from "/life-map-art.js";
import { framesFor, frameOf } from "/life-map-people.js";

const SPRITES = ["tree", "treeSmall", "treeFront", "slender", "birch", "shrub", "shrubLarge", "house", "shed", "fence", "flower", "tallgrass", "person", "walk", "lawn", "ground"];
let artPromise = null;

function make(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function pixels(img) { const c = make(img.width, img.height), g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height); }
function mirror(src) { const c = make(src.width, src.height), g = c.getContext("2d"); g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c; }

export function loadArt() {
  artPromise ??= Promise.all(SPRITES.map((name) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve([name, im]);
    im.onerror = () => reject(new Error(`地图素材 ${name} 没有载入`));
    im.src = `/art/map/${name}.png`;
  }))).then((list) => {
    const img = Object.fromEntries(list);
    const walk = [], walkLeft = [];
    for (let i = 0; i < 4; i++) { const c = make(16, 38); c.getContext("2d").drawImage(img.walk, i * 16, 0, 16, 38, 0, 0, 16, 38); walk.push(c); walkLeft.push(mirror(c)); }
    return { img, lawn: pixels(img.lawn), ground: pixels(img.ground), walk, walkLeft, idle: img.person, idleLeft: mirror(img.person), tinted: new Map() };
  });
  return artPromise;
}

const PATHY = new Set(["=", "G", "D"]);
function field(map, x, y, test) {
  const fx = (x + 0.5) / CELL - 0.5, fy = (y + 0.5) / CELL - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  const at = (cx, cy) => { cx = Math.max(0, Math.min(map.width - 1, cx)); cy = Math.max(0, Math.min(map.height - 1, cy)); return test(map.tiles[cy][cx]) ? 1 : 0; };
  return (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v;
}
function vnoise(x, y, step, seed) {
  const gx = Math.floor(x / step), gy = Math.floor(y / step), u = x / step - gx, v = y / step - gy, fx = u * u * (3 - 2 * u), fy = v * v * (3 - 2 * v);
  return (h2(gx, gy, seed) * (1 - fx) + h2(gx + 1, gy, seed) * fx) * (1 - fy) + (h2(gx, gy + 1, seed) * (1 - fx) + h2(gx + 1, gy + 1, seed) * fx) * fy;
}

/** Bakes the ground of an outdoor map: grass, paths, water, furrows, pits, shade. */
function paintOutdoor(g, map, art, env) {
  const W = map.width * CELL, H = map.height * CELL, img = g.createImageData(W, H), d = img.data;
  const L = art.lawn, G = art.ground, snowy = env.snow, season = env.season;
  const isWater = (c) => c === "~", isPath = (c) => PATHY.has(c);
  // Yards of packed earth: whatever stands on it (houses, props, the work spot) stands on earth too.
  const earthy = map.tiles.join("").split(".").length > map.width * map.height * 0.3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, ti = ((y % L.height) * L.width + (x % L.width)) * 4;
    const raw = map.tiles[y >> 4][x >> 4];
    const c = earthy && "oW#D".includes(raw) ? "." : raw;
    const jitter = (vnoise(x, y, 11, 4) - 0.5) * 0.36 + (vnoise(x, y, 4, 5) - 0.5) * 0.1;
    const wf = field(map, x, y, isWater) + jitter * 0.6;
    const pf = field(map, x, y, isPath) + jitter;
    let R, Gc, B;
    if (wf > 0.5) {
      const depth = Math.min(1, (wf - 0.5) * 2.4), ripple = vnoise(x * 0.6, y * 2, 6, 8);
      R = 74 - depth * 20 + ripple * 10; Gc = 112 - depth * 20 + ripple * 12; B = 108 - depth * 6 + ripple * 10;
      if (wf < 0.62) { R += 40; Gc += 34; B += 22; }
      if (snowy && wf < 0.62) { R += 30; Gc += 30; B += 30; }
    } else if (c === "_" || (wf > 0.32 && c !== "T")) {
      R = G.data[ti] * 1.04 + 18; Gc = G.data[ti + 1] * 1.02 + 14; B = G.data[ti + 2] * 0.98 + 4;
    } else if (pf > 0.5) {
      const worn = vnoise(x, y, 44, 7) - 0.5, k = c === "." || field(map, x, y, (t) => t === ".") > 0.5 ? 0.8 : 0.94;
      R = G.data[ti] * k + worn * 10; Gc = G.data[ti + 1] * k + worn * 8; B = G.data[ti + 2] * (k + 0.01) + worn * 5;
      if (pf < 0.6) { R *= 0.9; Gc *= 0.92; B *= 0.9; }
    } else if (c === ".") {
      // Packed earth with tufts of grass where few feet go.
      const tuft = vnoise(x, y, 6, 21) * 0.7 + vnoise(x, y, 2, 22) * 0.3;
      const lift = 0.98 + (vnoise(x, y, 30, 23) - 0.5) * 0.1;
      R = G.data[ti] * lift + 2; Gc = G.data[ti + 1] * lift; B = G.data[ti + 2] * lift - 2;
      if (tuft > 0.72) { const k = Math.min(1, (tuft - 0.72) * 6); R += (L.data[ti] * 0.8 - R) * k; Gc += (L.data[ti + 1] * 0.84 - Gc) * k; B += (L.data[ti + 2] * 0.84 - B) * k; }
    } else if (c === "f") {
      const row = (y % 6) < 2;
      R = row ? 82 : 104; Gc = row ? 60 : 78; B = row ? 40 : 52;
      const sprout = (x + (y >> 3)) % 5 === 0 && (y % 6) === 3;
      if (sprout && season !== "冬") { const ripe = season === "秋"; R = ripe ? 200 : 110; Gc = ripe ? 170 : 140; B = ripe ? 70 : 64; }
    } else if (c === "p") {
      const rim = field(map, x, y, (t) => t === "p");
      R = rim > 0.6 ? 58 : 120; Gc = rim > 0.6 ? 40 : 84; B = rim > 0.6 ? 28 : 56;
    } else {
      R = L.data[ti] * 0.85; Gc = L.data[ti + 1] * 0.87; B = L.data[ti + 2] * 0.9;
      if (pf > 0.42) { R += 5; Gc += 7; B += 1; }
      const rim = (x >> 4) === 0 || (y >> 4) <= 1 || (x >> 4) === map.width - 1 || (y >> 4) === map.height - 1;
      if (c === "T" && rim) { R *= 0.72; Gc *= 0.76; B *= 0.8; }
      if (c === "r") { const stalk = (x * 7 + (y >> 2)) % 5 === 0; if (stalk) { R = 168; Gc = 160; B = 104; } }
    }
    if (wf <= 0.5) {
      if (season === "秋") {
        R += 15; Gc += 5; B -= 9;
        const leaf = h2(x, y, 71);
        if (leaf > 0.992 && pf <= 0.5) { R = 196; Gc = 120; B = 44; } else if (leaf > 0.986 && pf <= 0.5) { R = 168; Gc = 84; B = 40; }
      } else if (season === "冬") { const m = (R + Gc + B) / 3; R = R * 0.6 + m * 0.4 + 6; Gc = Gc * 0.6 + m * 0.4 + 4; B = B * 0.6 + m * 0.4 + 8; }
      else if (season === "春") { R += 4; Gc += 18; B -= 2; }
      else if (season === "夏") { R -= 8; Gc += 6; B -= 8; }
      if (snowy) {
        // Snow lies clean and white; trodden paths and the furrows show through.
        const drift = vnoise(x, y, 22, 13), fine = h2(x, y, 14);
        const cover = pf > 0.5 ? 0.38 + drift * 0.2 : c === "f" ? 0.6 + drift * 0.2 : 0.8 + drift * 0.16;
        const sR = 222 + drift * 16, sG = 230 + drift * 12, sB = 238 + drift * 8;
        R += (sR - R) * cover; Gc += (sG - Gc) * cover; B += (sB - B) * cover;
        if (fine > 0.985 && pf <= 0.5) { R -= 40; Gc -= 30; B -= 30; } // a grass tip poking through
      }
    }
    d[i] = R; d[i + 1] = Gc; d[i + 2] = B; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/** Small decorations by stable hash: flowers and tall grass on open grass. */
function decor(map, env) {
  const out = [];
  if (env.season === "冬") return out;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    if (map.tiles[y][x] !== ",") continue;
    const n = h2(x, y, 31);
    const flowers = env.season === "春" ? 0.06 : env.season === "夏" ? 0.02 : 0.008;
    const grass = env.season === "夏" ? 0.12 : env.season === "秋" ? 0.07 : 0.04;
    if (n < flowers + grass) out.push({ sprite: n < flowers ? "flower" : "tallgrass", fx: x * CELL + 4 + Math.floor(h2(x, y, 32) * 8), fy: y * CELL + 12 + Math.floor(h2(x, y, 33) * 4) });
  }
  return out;
}

/** Extra rim trees so the woods read as woods (decoration only: the cells are already blocked). */
function rimTrees(map) {
  const out = [], W = map.width * CELL, H = map.height * CELL, water = map.tiles[0].includes("~");
  if (!water) for (let x = -10; x < W + 20; x += 22) out.push({ sprite: h2(x, 1, 40) < 0.3 ? "slender" : "tree", fx: x + Math.floor(h2(x, 2, 40) * 10), fy: 52 + Math.floor(h2(x, 3, 40) * 12) });
  for (let y = water ? 110 : 40; y < H - 20; y += 34) {
    out.push({ sprite: "tree", fx: 2 + Math.floor(h2(1, y, 41) * 8), fy: y + Math.floor(h2(2, y, 41) * 10) });
    out.push({ sprite: "tree", fx: W - 4 - Math.floor(h2(3, y, 41) * 8), fy: y + 17 + Math.floor(h2(4, y, 41) * 10) });
  }
  const gateX = map.gate.x * CELL;
  // Foreground canopies only peek in at the bottom corners.
  for (const x of [-14, 30, W - 30, W + 14]) if (Math.abs(x - gateX) > 80) out.push({ sprite: "treeFront", fx: x, fy: H + 118 + Math.floor(h2(x, 6, 42) * 12), front: true });
  return out;
}

/**
 * Leaves follow the season: fresh and light with blossom in spring, deep in
 * summer, orange and gold in autumn (variant picks how far each tree has
 * turned). Bark, thatch and walls (warm, non-green pixels) are left alone.
 */
function seasonal(img, season, variant) {
  if (season === "冬" || (season === "夏" && variant > 1)) return img;
  const c = make(img.width, img.height), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  const turn = [[204, 140, 52], [184, 96, 44], [214, 176, 70], [150, 120, 50]][variant % 4];
  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const r = p[i], gr = p[i + 1], b = p[i + 2];
    if (gr <= r + 2) continue; // not foliage
    const lum = (r + gr + b) / 3 / 140;
    if (season === "秋") { const k = variant === 3 ? 0.45 : 0.82; p[i] += (turn[0] * lum - r) * k; p[i + 1] += (turn[1] * lum - gr) * k; p[i + 2] += (turn[2] * lum - b) * k; }
    else if (season === "春") {
      p[i] = r + 10; p[i + 1] = gr + 22; p[i + 2] = b + 4;
      const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
      if (variant === 0 && h2(px, py, 81) > 0.93 && lum > 0.6) { p[i] = 236; p[i + 1] = 196; p[i + 2] = 204; }
    } else if (season === "夏") { p[i] = r - 8; p[i + 1] = gr + 4; p[i + 2] = b - 6; }
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** A 32×32 tile of dark thatch, for the house around an indoor scene. */
function thatchTile() {
  const c = make(32, 32), g = c.getContext("2d");
  g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(h2(i, 1, 120) * 32), y = Math.floor(h2(i, 2, 120) * 32), len = 3 + Math.floor(h2(i, 3, 120) * 6);
    g.fillStyle = h2(i, 4, 120) < 0.5 ? "#4d3822" : h2(i, 5, 120) < 0.6 ? "#5c452a" : "#2c1f13";
    for (let k = 0; k < len; k++) g.fillRect((x + k) % 32, (y + Math.floor(k / 2)) % 32, 1, 1);
  }
  return c;
}

/** A sprite with snow settled on every upward-facing edge. */
function snowCapped(img) {
  const c = make(img.width, img.height), g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data, W = c.width;
  for (let x = 0; x < W; x++) {
    let depth = 0;
    for (let y = 0; y < c.height; y++) {
      const i = (y * W + x) * 4;
      if (!p[i + 3]) { depth = 0; continue; }
      depth++;
      const lim = 2 + (h2(x, 0, 61) > 0.6 ? 1 : 0);
      if (depth <= lim) { const k = depth === lim ? 0.45 : 0.85; p[i] += (236 - p[i]) * k; p[i + 1] += (240 - p[i + 1]) * k; p[i + 2] += (246 - p[i + 2]) * k; }
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}

export class MapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.view = make(1, 1);
    this.vctx = this.view.getContext("2d");
    this.scene = null;
  }

  /** Bakes a scene; `env` = { season, snow, rain }. */
  setScene(map, art, env) {
    const W = map.width * CELL, H = map.height * CELL;
    const ground = make(W, H), g = ground.getContext("2d");
    if (map.kind === "interior") paintInterior(g, map, map.theme, env.season);
    else paintOutdoor(g, map, art, env);
    const statics = [];
    this.sprites = {};
    for (const name of ["tree", "treeSmall", "treeFront", "slender", "birch", "shrub", "shrubLarge", "house", "shed", "fence"]) {
      this.sprites[name] = env.snow ? (art.snowy ??= {})[name] ??= snowCapped(art.img[name]) : art.img[name];
      // Leafy things get four seasonal variants, picked per tree by position.
      if (!env.snow && /tree|slender|birch|shrub/i.test(name)) {
        for (let v = 0; v < 4; v++) this.sprites[`${name}#${v}`] = ((art.seasonal ??= {})[`${name}|${env.season}|${v}`] ??= seasonal(art.img[name], env.season, v));
      }
    }
    const sprite = (name, fx, fy, extra = {}) => ({ sprite: name, fx, fy, sortY: fy, ...extra });
    // Shade under trees, baked into the ground.
    const trees = [];
    for (const p of map.props) {
      const fx = p.x * CELL + 8, fy = p.y * CELL + 14;
      if (p.kind === "treeFront") continue; // the bottom rim is drawn as corner canopies below
      if (["tree", "slender", "birch"].includes(p.kind) && p.y <= 1) continue; // the back rim is drawn below as a canopy line
      if (["tree", "slender", "birch"].includes(p.kind)) { const t = sprite(p.kind, fx, fy, { tree: true }); trees.push(t); statics.push(t); }
      else if (p.kind === "shrub") statics.push(sprite(h2(p.x, p.y, 7) < 0.4 ? "shrubLarge" : "shrub", fx, fy));
      else if (p.kind === "house" || p.kind === "shed") statics.push(sprite(p.kind, p.x * CELL + (p.kind === "house" ? 3 + 82 : 15 + 66), (p.y + 1) * CELL + 3, { building: true }));
      else if (p.kind === "fence") continue;
      else {
        const wide = p.kind.startsWith("work-") || p.w;
        const cx = p.w ? (p.x + p.w / 2) * CELL : wide ? p.x * CELL + 16 : fx, cy = (p.y + 1) * CELL - 1;
        statics.push({ work: p.kind, fx: cx, fy: cy, sortY: cy });
      }
    }
    if (map.kind === "outdoor") {
      for (const t of rimTrees(map)) { const s = sprite(t.sprite, t.fx, t.fy, { tree: true, ...(t.front ? { sortY: 1e6 } : {}) }); if (!t.front) trees.push(s); statics.push(s); }
      for (const t of decor(map, env)) statics.push(sprite(t.sprite, t.fx, t.fy));
      // Fence runs along F cells.
      for (let y = 0; y < map.height; y++) {
        let x = 0;
        while (x < map.width) {
          if (map.tiles[y][x] !== "F") { x++; continue; }
          const x0 = x; while (x < map.width && map.tiles[y][x] === "F") x++;
          statics.push({ fence: [x0 * CELL, x * CELL], fx: x0 * CELL, fy: y * CELL + 14, sortY: y * CELL + 14 });
        }
      }
    }
    // Shade: soft dark ellipses under every tree.
    g.save();
    for (const t of trees) {
      const im = art.img[t.sprite], rx = im.width * 0.42, ry = im.width * 0.16;
      g.globalAlpha = t.sprite === "treeFront" ? 0.22 : 0.18;
      g.fillStyle = "#1d2a1c";
      for (let dy = -ry; dy <= ry; dy++) { const w = rx * Math.sqrt(1 - (dy * dy) / (ry * ry)); g.fillRect(Math.round(t.fx - w + 6), Math.round(t.fy + dy - 2), Math.round(w * 2), 1); }
    }
    g.restore();
    statics.sort((a, b) => a.sortY - b.sortY);
    const water = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x] !== "~") continue;
      for (let k = 0; k < 2; k++) if (h2(x, y, 90 + k) < 0.55) water.push({ x: x * CELL + Math.floor(h2(x, y, 92 + k) * 14), y: y * CELL + Math.floor(h2(x, y, 94 + k) * 14), p: h2(x, y, 96 + k) });
    }
    this.scene = { map, art, env, ground, statics, trees, W, H, water };
  }

  /**
   * Draws one frame. `cam` = { x, y, w, h, k } in native pixels / integer
   * scale; `actors` = targets and the player with native foot positions.
   */
  draw(cam, actors, t, overlay) {
    const s = this.scene;
    if (!s) return;
    if (this.view.width !== cam.w || this.view.height !== cam.h) { this.view.width = cam.w; this.view.height = cam.h; }
    const g = this.vctx, ox = -cam.x, oy = -cam.y;
    g.imageSmoothingEnabled = false;
    if (s.map.kind === "interior") {
      // Around a room is the house itself: thatch above and below, seen from inside.
      this.thatch ??= thatchTile();
      g.save(); g.translate(((ox % 32) + 32) % 32 - 32, ((oy % 32) + 32) % 32 - 32);
      g.fillStyle = g.createPattern(this.thatch, "repeat"); g.fillRect(0, 0, cam.w + 64, cam.h + 64); g.restore();
    } else { g.fillStyle = "#26301e"; g.fillRect(0, 0, cam.w, cam.h); }
    g.drawImage(s.ground, ox, oy);
    if (s.water) this.shimmer(g, ox, oy, cam, t);
    if (overlay?.dest) this.marker(g, overlay.dest.x * CELL + ox, overlay.dest.y * CELL + oy, t);
    const player = actors.find((a) => a.player);
    const list = [...s.statics, ...actors.map((a) => ({ actor: a, sortY: a.fy }))].sort((a, b) => a.sortY - b.sortY);
    for (const item of list) {
      if (item.actor) this.drawActor(g, item.actor, ox, oy, t, overlay);
      else if (item.fence) { const im = this.sprites.fence; for (let x = item.fence[0]; x < item.fence[1]; x += im.width) g.drawImage(im, 0, 0, Math.min(im.width, item.fence[1] - x), im.height, x + ox, item.fy - im.height + oy, Math.min(im.width, item.fence[1] - x), im.height); }
      else if (item.work) drawWork(g, hasWork(item.work) ? item.work : `work-${s.map.theme}`, item.fx + ox, item.fy + oy, t);
      else {
        const im = this.sprites[`${item.sprite}#${(Math.floor(item.fx / 7) + Math.floor(item.fy / 5)) % 4}`] ?? this.sprites[item.sprite] ?? s.art.img[item.sprite];
        const x = Math.round(item.fx - im.width / 2) + ox, y = item.fy - im.height + oy;
        if (x > cam.w || y > cam.h || x + im.width < 0 || y + im.height < 0) continue;
        // Canopies and roofs fade when the player walks behind them.
        const behind = player && (item.tree || item.building) && player.fy < item.fy && player.fy > item.fy - im.height + 6
          && Math.abs(player.fx - item.fx) < im.width * (item.building ? 0.5 : 0.36);
        if (behind) g.globalAlpha = 0.45;
        g.drawImage(im, x, y);
        g.globalAlpha = 1;
      }
    }
    if (s.map.kind === "interior") this.firelight(g, ox, oy, t);
    this.weather(g, cam, t);
    const out = this.ctx;
    out.imageSmoothingEnabled = false;
    out.drawImage(this.view, 0, 0, cam.w * cam.k, cam.h * cam.k);
  }

  drawActor(g, a, ox, oy, t, overlay) {
    const s = this.scene, x = Math.round(a.fx) + ox, y = Math.round(a.fy) + oy;
    const selected = overlay?.selected === a.key;
    if (selected) this.ring(g, x, y, t);
    if (a.player || a.type === "person") {
      g.globalAlpha = 0.3; g.fillStyle = "#1d2414"; g.fillRect(x - 5, y - 1, 11, 2); g.globalAlpha = 1;
      const frames = framesFor(a.look || a.key, a.player ? "player" : a.id);
      const im = frameOf(frames, a.facing || "down", a.walking, a.dist || 0);
      const breathe = !a.walking && Math.floor((t / 900 + (hashStr(a.key) % 7) / 7) % 2) ? 1 : 0;
      if (breathe) g.drawImage(im, 0, 0, 16, 20, x - 8, y - im.height + 2, 16, 20), g.drawImage(im, 0, 20, 16, 18, x - 8, y - 17, 16, 18);
      else g.drawImage(im, x - 8, y - im.height + 1);
      return;
    }
    if (a.type === "animal") { this.dog(g, x, y, a.look === "狼", t); return; }
    if (a.type === "object") drawThing(g, objectLook(a.look, a.name), x, y, t);
    else if (a.type === "yield") drawThing(g, resourceLook(a.look), x, y, t);
    else if (a.type === "exit" && s.map.kind === "outdoor") this.chevrons(g, x, y, t);
  }

  dog(g, x, y, wolf, t) {
    const c = wolf ? "#6f6a62" : "#9a7650", d = wolf ? "#4a4640" : "#6b4f33", tail = Math.floor(t / 200) % 2;
    g.globalAlpha = 0.3; g.fillStyle = "#1d2414"; g.fillRect(x - 7, y - 1, 14, 2); g.globalAlpha = 1;
    g.fillStyle = c; g.fillRect(x - 6, y - 8, 11, 5); g.fillRect(x + 3, y - 11, 5, 5);
    g.fillStyle = d; g.fillRect(x - 5, y - 3, 2, 3); g.fillRect(x + 2, y - 3, 2, 3); g.fillRect(x + 6, y - 12, 2, 2); g.fillRect(x - 8, y - 9 - tail, 2, 3);
    g.fillStyle = "#1a1612"; g.fillRect(x + 6, y - 9, 1, 1);
  }

  chevrons(g, x, y, t) {
    const k = Math.floor(t / 260) % 3;
    g.fillStyle = "#f2dfa6";
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = i === k ? 0.95 : 0.35;
      const yy = y - 18 + i * 5;
      g.fillRect(x - 4, yy, 2, 2); g.fillRect(x - 2, yy + 2, 2, 2); g.fillRect(x, yy + 2, 2, 2); g.fillRect(x + 2, yy, 2, 2);
    }
    g.globalAlpha = 1;
  }

  /** Indoors the fire pit lights the room: a warm, slowly breathing glow. */
  firelight(g, ox, oy, t) {
    const pit = this.scene.map.props.find((p) => p.kind === "firepit");
    if (!pit) return;
    const x = pit.x * CELL + 8 + ox, y = pit.y * CELL + 6 + oy;
    const flicker = 0.85 + Math.sin(t / 170) * 0.06 + Math.sin(t / 61) * 0.04;
    const grad = g.createRadialGradient(x, y, 4, x, y, 110 * flicker);
    grad.addColorStop(0, "rgba(255, 176, 90, .26)");
    grad.addColorStop(0.5, "rgba(255, 150, 70, .1)");
    grad.addColorStop(1, "rgba(255, 140, 60, 0)");
    g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = grad; g.fillRect(x - 120, y - 120, 240, 240); g.restore();
  }

  /** Light glints drifting along the water, a few pixels each. */
  shimmer(g, ox, oy, cam, t) {
    const s = this.scene;
    g.fillStyle = "rgba(220, 236, 228, .75)";
    for (const w of s.water) {
      const phase = ((t / 2600 + w.p) % 1);
      const x = Math.round(w.x + phase * 18) + ox, y = w.y + oy;
      if (x < -4 || y < 0 || x > cam.w || y > cam.h) continue;
      const len = phase < 0.5 ? 2 + Math.round(phase * 6) : 2 + Math.round((1 - phase) * 6);
      g.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
      g.fillRect(x, y, len, 1);
    }
    g.globalAlpha = 1;
  }

  ring(g, x, y, t) {
    const p = Math.floor(t / 250) % 2, w = 9 + p;
    g.fillStyle = "#f6e3a0";
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.fillRect(x + sx * w - (sx > 0 ? 3 : 0), y + sy * 3 - 1, 4, 1);
      g.fillRect(x + sx * w - (sx > 0 ? 0 : 0), y + sy * 3 - 1 - (sy > 0 ? 2 : 0), 1, 3);
    }
  }

  marker(g, x, y, t) {
    const p = Math.floor(t / 200) % 3;
    g.globalAlpha = 0.75; g.fillStyle = "#f6e3a0";
    g.fillRect(x + 4 - p, y + 7, 8 + p * 2, 1); g.fillRect(x + 4 - p, y + 10, 8 + p * 2, 1);
    g.fillRect(x + 3 - p, y + 8, 1, 2); g.fillRect(x + 12 + p, y + 8, 1, 2);
    g.globalAlpha = 1;
  }

  weather(g, cam, t) {
    const env = this.scene.env;
    if (env.tint) { g.globalAlpha = env.tint[3]; g.fillStyle = `rgb(${env.tint[0]},${env.tint[1]},${env.tint[2]})`; g.fillRect(0, 0, cam.w, cam.h); g.globalAlpha = 1; }
    if (this.scene.map.kind === "interior") return;
    if (env.snow) {
      g.fillStyle = "#f4f6f8";
      for (let i = 0; i < 40; i++) {
        const sx = h2(i, 1, 51) * cam.w, sp = 10 + h2(i, 2, 51) * 14, y = ((t / 1000) * sp + h2(i, 3, 51) * cam.h) % cam.h;
        const x = (sx + Math.sin(t / 900 + i) * 4 + cam.w) % cam.w;
        g.globalAlpha = 0.55 + h2(i, 4, 51) * 0.4; g.fillRect(Math.round(x), Math.round(y), i % 5 ? 1 : 2, i % 5 ? 1 : 2);
      }
      g.globalAlpha = 1;
    } else if (env.rain) {
      g.fillStyle = "#b8ccd4";
      for (let i = 0; i < 80; i++) {
        const sx = h2(i, 1, 52) * cam.w, y = ((t / 1000) * 140 + h2(i, 3, 52) * cam.h) % cam.h, x = (sx - y * 0.25 + cam.w * 2) % cam.w;
        g.globalAlpha = 0.45; g.fillRect(Math.round(x), Math.round(y), 1, 4);
      }
      g.globalAlpha = 1;
    }
  }
}
