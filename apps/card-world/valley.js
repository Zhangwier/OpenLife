// Land · 草原 — the content pack for the grassland tile, plus the lake tile below it.
// Tiles are basic rectangles; in an overlap the higher-priority tile wins (see mapgen.generateWorld).
import { G } from "./mapgen.js";

// Tile x/y/w/h are multiples of 40 (the map cell). Priorities: forest 3 > grass 2 > river 1.
export const LAND = { key: "grass", name: "草原", w: 2400, h: 1700, seed: 20261101,
  tiles: [
    { key: "lake", kind: "lake", x: 1200, y: 2100, w: 2400, h: 1500, priority: 1 },
    { key: "grass", kind: "valley", fill: "grass", x: 1200, y: 900, w: 2400, h: 1700, priority: 2 },
    { key: "forest", kind: "wood", x: 0, y: 0, w: 1600, h: 1400, priority: 3 },
  ] };

// A grassland has no water and no woods: home, field, kiln, berries, hemp, stones.
export const SITES = [
  { key: "home", name: "陶家庭院", ground: [G.MEADOW], mountain: [420, 1e9],
    prefer: ({ x, y, W, H }) => 0.9 - Math.hypot(x - W / 2, y - H / 2) / 700 },
  { key: "field", name: "旱地", patch: "field", from: "home", dist: [380, 560], dir: 2.55, dirW: 2.8, ground: [G.MEADOW], gap: 420 },
  { key: "kiln", name: "共用陶窑", from: "home", dist: [460, 700], dir: 0.25, ground: [G.MEADOW], gap: 360 },
  { key: "berries", name: "野果丛", from: "home", dist: [420, 700], dir: 2.2, ground: [G.MEADOW], gap: 300 },
  { key: "hemp", name: "葛麻坡", from: "home", dist: [520, 850], dir: 3.05, ground: [G.MEADOW, G.SLOPE], gap: 300 },
  { key: "scree", name: "乱石堆", patch: "scree", from: "home", dist: [600, 1000], dir: -0.7, dirW: 2.5, ground: [G.SCREE, G.SLOPE, G.MEADOW], mountain: [0, 520], gap: 300,
    rubble: 260, clear: 140, prefer: ({ x, y, W, H }) => (x / W - y / H) * 0.8 },
];

/** Cards at each grassland place: [key, dx, dy, stock?]. */
export const LAYOUT = {
  home: [["taoHouse", 0, -10]],
  field: [["field", -150, -30, 1], ["field2", 150, -30, 0], ["granary", -110, -330, 10], ["stove", 110, -330, 4]],
  kiln: [["kiln", 0, 0, 0]],
  berries: [["berries", 0, 0]],
  hemp: [["hemp", 0, 0]],
  scree: [["scree", -95, 0], ["flintVein", 105, 40]],
};

// Cards standing in the forest tile: chestnuts and mushrooms (fractions of the tile).
export const WOOD_LAYOUT = [["chestnut", 0.32, 0.32], ["chestnut", 0.62, 0.58], ["jungleFood", 0.48, 0.72]];

// Cards round the lake's north shore (fractions; the top strip is under the grassland).
// Fish in the middle, reeds and a duck nest in the west marsh, clams in the east shallows, clay on the bank.
export const LAKE_LAYOUT = [["lake", 0.5, 0.35], ["reeds", 0.3, 0.38], ["nest", 0.33, 0.4], ["pit", 0.6, 0.36], ["shallows", 0.7, 0.38]];

// One house is enough: everyone sleeps in 陶家主屋.
export const PEOPLE = {
  aunt: { home: "taoHouse", job: "fish", at: ["home", -190, 230] },
  yu: { home: "taoHouse", job: "farm", at: ["field", 0, 190] },
  zao: { home: "taoHouse", job: "cook", at: ["field", 300, -330] },
  zhi: { home: "taoHouse", job: "clay", at: ["home", 120, 240] },
};
export const START = { you: ["home", -40, 210], dog: ["home", 130, 220] };
