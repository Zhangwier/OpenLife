/**
 * Pixel people for the life map: four facings, an idle pose and a four-frame
 * walk, drawn at native pixels (16×38 canvas, feet on the bottom row).
 *
 * Every look comes from the same stable appearance the portraits use
 * (character-appearance.js), so a villager on the map wears the same colours
 * as in their portrait. Age band and build come from what anyone can see
 * (child, youth, adult, elder); nothing private is encoded in a sprite.
 */
import { appearanceFor } from "/character-appearance.js";

export const SPRITE_W = 16, SPRITE_H = 38;
const OUTLINE = [43, 30, 22];

const hex = (h) => { const n = parseInt(String(h).slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const dark = (c, t) => mix(c, [20, 14, 10], t);
const light = (c, t) => mix(c, [255, 246, 226], t);
/** v6 palette is muted: pull every cloth colour a little toward earth grey. */
const mute = (c) => mix(c, [120, 104, 86], 0.28);

const BANDS = {
  child: { head: 8, torso: 7, skirt: 3, legs: 5, top: 15 },
  youth: { head: 8, torso: 9, skirt: 3, legs: 7, top: 8 },
  adult: { head: 9, torso: 10, skirt: 4, legs: 8, top: 4 },
  elder: { head: 9, torso: 10, skirt: 4, legs: 7, top: 6 },
};

/** look = "band:sex:key" from the server (band/sex visible at a glance), or any id. */
export function specFor(look, id = look) {
  const [bandRaw, sexRaw] = String(look).split(":");
  const band = BANDS[bandRaw] ? bandRaw : "adult";
  const a = appearanceFor(id, band === "elder" ? "老" : "");
  const sex = sexRaw === "f" || sexRaw === "m" ? sexRaw : (a.seed >>> 5) % 2 ? "f" : "m";
  const hairColor = band === "elder" ? [196, 190, 178] : hex(a.hairColor);
  const styles = sex === "f" ? ["bun", "long", "braid", "tied"] : ["short", "topknot", "band", "short"];
  return {
    band, sex, seed: a.seed,
    skin: hex(a.skin), hair: hairColor, cloth: mute(hex(a.fabric)), sash: mute(hex(a.sash)),
    pants: mute(dark(hex(a.fabric), 0.45)),
    style: band === "child" ? (sex === "f" ? "twin" : "short") : styles[(a.seed >>> 11) % styles.length],
    dress: sex === "f" && band !== "child",
  };
}

class Px {
  constructor() { this.d = new Array(SPRITE_W * SPRITE_H).fill(null); }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < SPRITE_W && y < SPRITE_H) this.d[y * SPRITE_W + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= SPRITE_W || y >= SPRITE_H ? null : this.d[y * SPRITE_W + x]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  /** A soft dark rim on every outside edge, so figures read on any ground. */
  outline() {
    const add = [];
    for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, OUTLINE);
  }
  toCanvas(mirror = false) {
    const c = document.createElement("canvas");
    c.width = SPRITE_W; c.height = SPRITE_H;
    const g = c.getContext("2d"), img = g.createImageData(SPRITE_W, SPRITE_H);
    for (let y = 0; y < SPRITE_H; y++) for (let x = 0; x < SPRITE_W; x++) {
      const v = this.d[y * SPRITE_W + (mirror ? SPRITE_W - 1 - x : x)];
      if (!v) continue;
      const i = (y * SPRITE_W + x) * 4;
      img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

/**
 * One pose. dir: "down" | "up" | "left"; step: 0 idle, 1..4 walk frames.
 * Walk frames: 1 and 3 are the passing poses (legs apart), 2 and 4 contact.
 */
function pose(s, dir, step) {
  const p = new Px(), b = BANDS[s.band];
  const stride = step === 1 ? 1 : step === 3 ? -1 : 0;
  const bob = step === 1 || step === 3 ? 1 : 0;
  const stoop = s.band === "elder" ? 1 : 0;
  const bottom = SPRITE_H - 1;
  const legTop = bottom - b.legs;
  const skirtTop = legTop - b.skirt + 1;
  const torsoTop = skirtTop - b.torso + 1 + bob;
  const headTop = torsoTop - b.head - 1;
  const cx = 8;
  const skin = s.skin, skinD = dark(s.skin, 0.22), cloth = s.cloth, clothD = dark(cloth, 0.28), clothL = light(cloth, 0.18);
  const hair = s.hair, hairD = dark(hair, 0.3), hairL = light(hair, 0.15), pants = s.pants, shoe = [74, 52, 36];

  // ---- legs and feet ----
  if (dir === "left") {
    const front = cx - 1 - stride * 2, back = cx + stride * 2;
    for (const [x, near] of [[back, false], [front, true]]) {
      const c = near ? pants : dark(pants, 0.2);
      p.rect(x - 1, legTop, 2, b.legs, c);
      p.rect(x - 2, bottom, 3, 1, near ? shoe : dark(shoe, 0.2));
    }
  } else {
    const lLen = b.legs - (stride < 0 ? 1 : 0), rLen = b.legs - (stride > 0 ? 1 : 0);
    p.rect(cx - 3, legTop, 2, lLen, pants); p.rect(cx - 3, legTop + lLen - 1, 2, 1, shoe);
    p.rect(cx + 1, legTop, 2, rLen, dark(pants, 0.15)); p.rect(cx + 1, legTop + rLen - 1, 2, 1, dark(shoe, 0.15));
  }

  // ---- skirt / tunic hem ----
  const hemExtra = s.dress ? 2 : 0;
  const hemW = dir === "left" ? 7 : 10;
  const hx = cx - Math.ceil(hemW / 2) + (dir === "left" ? 1 : 0);
  p.rect(hx, skirtTop, hemW, b.skirt + hemExtra, cloth);
  p.rect(hx, skirtTop + b.skirt + hemExtra - 1, hemW, 1, clothD);
  p.rect(hx + hemW - 2, skirtTop, 2, b.skirt + hemExtra, clothD);

  // ---- torso ----
  const tw = dir === "left" ? 6 : 8;
  const tx = cx - tw / 2 + (dir === "left" ? 1 : 0) - (dir === "left" ? stoop : 0);
  p.rect(tx, torsoTop, tw, b.torso, cloth);
  p.set(tx, torsoTop, null); p.set(tx + tw - 1, torsoTop, null); // rounded shoulders
  p.rect(tx, torsoTop, 1, b.torso, clothL);
  p.rect(tx + tw - 1, torsoTop, 1, b.torso, clothD);
  if (dir === "down") { p.set(cx - 1, torsoTop, skinD); p.set(cx, torsoTop, skinD); p.set(cx - 1, torsoTop + 1, dark(cloth, 0.4)); p.set(cx, torsoTop + 1, dark(cloth, 0.4)); }
  p.rect(tx, skirtTop - 1, tw, 1, s.sash); // belt / sash

  // ---- arms ----
  const armLen = Math.max(5, b.torso - 2);
  if (dir === "left") {
    const swing = stride * 2;
    const ax = cx + swing;
    for (let i = 0; i < armLen; i++) p.set(ax + Math.round((i / armLen) * -swing * 0.5), torsoTop + 1 + i, i < armLen - 2 ? clothD : skin);
    p.set(ax, torsoTop + armLen + 1, skinD);
  } else {
    const l = armLen - (stride > 0 ? 1 : 0), r = armLen - (stride < 0 ? 1 : 0);
    const lx = tx - 1, rx = tx + tw;
    p.rect(lx, torsoTop + 1, 1, l, dir === "up" ? clothD : cloth); p.set(lx, torsoTop + 1 + l, skin);
    p.rect(rx, torsoTop + 1, 1, r, clothD); p.set(rx, torsoTop + 1 + r, skinD);
  }

  // ---- head ----
  const hw = dir === "left" ? 7 : 8;
  const hx0 = cx - hw / 2 + (dir === "left" ? 0 : 0) - (dir === "left" ? stoop : 0) - (dir === "left" ? 0.5 : 0);
  const hX = Math.round(hx0);
  // Rounded head: the top two rows and the chin row are inset.
  const inset = (j) => j === 0 ? 2 : j === 1 || j === b.head - 1 ? 1 : 0;
  for (let j = 0; j < b.head; j++) for (let i = inset(j); i < hw - inset(j); i++) {
    p.set(hX + i, headTop + j, i === hw - 1 - inset(j) ? skinD : i === inset(j) && dir !== "up" ? light(skin, 0.12) : skin);
  }
  if (dir === "left") p.set(hX - 1, headTop + Math.floor(b.head * 0.55), skin); // nose
  // face
  const eyeY = headTop + Math.floor(b.head * 0.55);
  if (dir === "down") {
    p.set(hX + 2, eyeY, OUTLINE); p.set(hX + hw - 3, eyeY, OUTLINE);
    if (s.band === "child" || s.sex === "f") { p.set(hX + 1, eyeY + 1, mix(skin, [210, 120, 110], 0.4)); p.set(hX + hw - 2, eyeY + 1, mix(skin, [210, 120, 110], 0.4)); }
    if (s.band === "elder") p.rect(hX + 2, eyeY - 1, hw - 4, 1, mix(skin, OUTLINE, 0.25));
  } else if (dir === "left") {
    p.set(hX + 1, eyeY, OUTLINE);
  }

  // ---- hair ----
  const top = headTop, H = b.head;
  const capRows = dir === "up" ? H - 1 : s.band === "elder" ? 3 : 3;
  for (let j = 0; j < capRows; j++) for (let i = inset(j); i < hw - inset(j); i++) {
    p.set(hX + i, top + j, j === 0 ? hairL : i === hw - 1 ? hairD : hair);
  }
  if (dir === "down") { // side locks frame the face
    p.rect(hX, top + 3, 1, 2, hair); p.rect(hX + hw - 1, top + 3, 1, 2, hairD);
  }
  if (dir === "left") { // the back of the head is hair
    p.rect(hX + 3, top + 1, hw - 3, H - 3, hair); p.rect(hX + hw - 1, top + 1, 1, H - 3, hairD);
  }
  const back = dir === "left" ? hX + hw - 1 : cx;
  switch (s.style) {
    case "bun": p.rect(dir === "left" ? hX + hw - 2 : cx - 2, top - 3, 4, 3, hair); p.rect(dir === "left" ? hX + hw - 2 : cx - 2, top - 3, 4, 1, hairL); break;
    case "topknot": p.rect(cx - 1 - (dir === "left" ? 0 : 0), top - 2, 2, 2, hairD); p.set(cx - 2, top - 1, s.sash); break;
    case "band": p.rect(hX, top + 2, hw, 1, s.sash); break;
    case "long":
      if (dir === "up") p.rect(hX + 1, top + H - 1, hw - 2, 4, hair);
      else if (dir === "left") p.rect(back - 1, top + 3, 2, H, hair);
      else { p.rect(hX - 1, top + 2, 1, H - 1, hair); p.rect(hX + hw, top + 2, 1, H - 1, hairD); }
      break;
    case "braid":
      if (dir === "up") { p.rect(cx - 1, top + H - 1, 2, 7, hair); p.set(cx - 1, top + H + 6, s.sash); }
      else if (dir === "left") { p.rect(back, top + 4, 1, H + 2, hairD); }
      else p.rect(hX + hw, top + 3, 1, H, hairD);
      break;
    case "tied": p.rect(dir === "left" ? back : cx - 1, top - 1, 2, 2, hairD); p.set(dir === "left" ? back + 1 : cx + 1, top - 1, s.sash); break;
    case "twin":
      if (dir !== "left") { p.rect(hX - 2, top + 1, 2, 3, hair); p.rect(hX + hw, top + 1, 2, 3, hairD); }
      else p.rect(back, top, 2, 3, hair);
      break;
    default: break;
  }
  if (dir === "up") { p.rect(tx, torsoTop, tw, 1, dark(cloth, 0.1)); }
  p.outline();
  return p;
}

const cache = new Map();
/**
 * All frames of one person: { down, up, left, right } → [idle, walk1..4] canvases.
 * Cached by look and id; building one person is ~20 small loops.
 */
export function framesFor(look, id = look) {
  const key = `${look}|${id}`;
  if (cache.has(key)) return cache.get(key);
  const s = specFor(look, id);
  const out = { down: [], up: [], left: [], right: [] };
  for (let step = 0; step <= 4; step++) {
    out.down.push(pose(s, "down", step).toCanvas());
    out.up.push(pose(s, "up", step).toCanvas());
    const side = pose(s, "left", step);
    out.left.push(side.toCanvas());
    out.right.push(side.toCanvas(true));
  }
  cache.set(key, out);
  return out;
}

/** The frame to draw for a facing and travelled distance (native pixels). */
export function frameOf(frames, facing, walking, travelled) {
  const set = frames[facing] ?? frames.down;
  return walking ? set[1 + (Math.floor(travelled / 6) % 4)] : set[0];
}
