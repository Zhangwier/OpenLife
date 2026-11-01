// Land 1 · 河谷 — the content pack the map generator places into a valley (see DESIGN.md).
// Each place: what ground it wants, how far from another place, which water or mountain it must be near.
import { G } from "./mapgen.js";

export const LAND = { key: "valley", name: "河谷", w: 3200, h: 2300, seed: 20261101 };

// Places are spread over the whole valley, not piled around the yard: a screen shows two or three of them,
// and the everyday ones are still a drag or two away.
export const SITES = [
  { key: "home", name: "陶家庭院", ground: [G.MEADOW], water: ["lake", 200, 480], mountain: [520, 1e9],
    prefer: ({ x, y, W, H }) => 0.9 - Math.hypot(x - W / 2, y - H / 2) / 900 },
  { key: "lakeside", room: 8, name: "湖边", from: "home", dist: [360, 560], dir: -0.95, ground: [G.SAND], water: ["lake", 0, 80], gap: 300 },
  { key: "shallows", room: 6, name: "湖西浅滩", from: "home", dist: [300, 1400], ground: [G.SAND, G.MEADOW, G.FOREST], water: ["lake", 0, 160], gap: 280,
    prefer: ({ x, W }) => -x / (W * 0.25) },          // the further west along the lake shore the better
  { key: "field", name: "旱地", patch: "field", from: "home", dist: [520, 700], dir: 2.55, dirW: 2.8, ground: [G.MEADOW, G.FOREST], water: ["water", 330, 1e9], gap: 460 },
  { key: "kiln", name: "共用陶窑", from: "home", dist: [680, 950], dir: 0.25, ground: [G.MEADOW], gap: 400 },
  { key: "reeds", room: 8, name: "芦苇荡", from: "home", dist: [650, 950], dir: -1.35, ground: [G.SAND, G.MEADOW], water: ["lake", 0, 120], gap: 300 },
  { key: "clay", room: 8, name: "河湾黏土", from: "home", dist: [780, 1100], dir: 2.55, ground: [G.SAND, G.MEADOW], water: ["river", 0, 140], gap: 340 },
  { key: "berries", name: "野果丛", from: "home", dist: [650, 950], dir: 2.2, ground: [G.MEADOW, G.FOREST], gap: 320 },
  { key: "hemp", name: "葛麻坡", from: "home", dist: [800, 1100], dir: 3.05, ground: [G.MEADOW, G.SLOPE], gap: 320 },
  // Top right: a big rubble field under the mountain, with deep woods on both sides of it — the stones and the timber are where they look to be.
  { key: "scree", name: "乱石堆", patch: "scree", from: "home", dist: [800, 1500], dir: -0.7, dirW: 2.5, ground: [G.SCREE, G.SLOPE, G.MEADOW, G.FOREST], mountain: [0, 520], gap: 320,
    rubble: 300, clear: 150, prefer: ({ x, y, W, H }) => (x / W - y / H) * 0.8 },
  { key: "wood", name: "栗子林", from: "scree", dist: [480, 700], dir: Math.PI, dirW: 2.2, ground: [G.FOREST, G.MEADOW, G.SLOPE], gap: 340, grove: 460, clear: 190 },
  { key: "orchard", name: "东坡果园", from: "scree", dist: [480, 700], dir: Math.PI / 2, dirW: 2.2, ground: [G.FOREST, G.MEADOW, G.SLOPE], gap: 340, orchard: 420 },
  // Top left: the jungle. Thickest trees, mushrooms — and the tiger's ground. Placed last so it grows round the other places, not over them.
  { key: "jungle", name: "西北丛林", from: "home", dist: [750, 1500], dir: -2.4, dirW: 2.5, ground: [G.FOREST, G.MEADOW, G.SLOPE], gap: 380,
    jungle: 640, clear: 150, prefer: ({ x, y, W, H }) => -(x / W + y / H) * 0.8 },
];

/** Cards at each place: [key, dx, dy, stock?] — offsets from the place centre to the card centre.
 *  The field is big, so it has two plots to work at; the granary and the stove stand just above it, on the way home. */
export const LAYOUT = {
  home: [["taoHouse", 0, -10]],
  lakeside: [["lake", 0, 0, 30]],
  shallows: [["shallows", 0, 0, 16]],
  field: [["field", -150, -30, 1], ["field2", 150, -30, 0], ["granary", -110, -330, 10], ["stove", 110, -330, 4]],
  kiln: [["kiln", 0, 0, 0]],
  reeds: [["reeds", 0, 0], ["nest", 150, 60]],
  clay: [["pit", 0, 0]],
  berries: [["berries", 0, 0]],
  hemp: [["hemp", 0, 0]],
  wood: [["chestnut", -100, -50], ["chestnut", 110, 70]],
  orchard: [["peach", -110, -20, 0], ["peach", 110, 50, 0], ["jujube", 0, -190, 0]],
  scree: [["scree", -95, 0], ["flintVein", 105, 40]],
  jungle: [["jungleFood", 0, 0, 6]],
};

// One house is enough: everyone sleeps in 陶家主屋.
export const PEOPLE = {
  aunt: { home: "taoHouse", job: "fish", at: ["home", -190, 230] },
  yu: { home: "taoHouse", job: "farm", at: ["field", 0, 190] },
  zao: { home: "taoHouse", job: "cook", at: ["field", 300, -330] },
  zhi: { home: "taoHouse", job: "clay", at: ["clay", -160, 140] },
};
export const START = { you: ["home", -40, 210], dog: ["home", 130, 220] };
