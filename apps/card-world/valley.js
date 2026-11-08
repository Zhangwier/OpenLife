// The land — basic rectangular tiles stitched into one world (see mapgen.generateWorld), and what stands on each.
// Tiles are multiples of 40 (the map cell). Priority is layering, not height: where two overlap, the higher
// one is the ground you see. door: where the path from home comes into the tile (fractions of the tile).
//
//   ┌────────── 森林深处 ┐
//   │  （往西一大片）   └ 森林 ─ 高原 ─┐
//   │                         │ 家 │ 大山（矿道）
//   └──────────          农田 ┘ 湖泊 ┘
import { G } from "./mapgen.js";

/** How far east everything moved when the old wood was widened westward (v58). Saves from before are carried over. */
export const WEST = 2400;
export const LAND = { key: "grass", name: "家", seed: 20261101,
  tiles: [
    { key: "farm", kind: "plain", x: 4400, y: 3200, w: 2000, h: 1500, priority: 1, door: [0.5, 0.42] },
    { key: "grass", kind: "valley", fill: "grass", x: 6200, y: 2800, w: 2400, h: 1500, priority: 2 },
    { key: "lake", kind: "lake", x: 6200, y: 4200, w: 2200, h: 1300, priority: 3, door: [0.46, 0.1] },
    { key: "forest", kind: "wood", x: 3600, y: 1000, w: 2800, h: 2200, priority: 4, door: [0.86, 0.9] },
    { key: "deepWest", kind: "deep", x: 0, y: 0, w: 2480, h: 4920, priority: 5 },       // the old wood, broad and far to the west
    { key: "deep", kind: "deep", x: 2400, y: 0, w: 1800, h: 1600, priority: 5 },
    { key: "deepSouth", kind: "deep", x: 2400, y: 1520, w: 1600, h: 3400, priority: 5 },   // and on down behind the forest
    { key: "plateau", kind: "plateau", x: 6400, y: 1000, w: 2000, h: 1900, priority: 6, door: [0.3, 1.06] },
    { key: "mountain", kind: "mountain", x: 8400, y: 1000, w: 3600, h: 3400, priority: 7, tunnelY: 3500 },   // widened (v64.7): room to dig on into
    { key: "blackReef", kind: "plain", x: 11000, y: 7000, w: 1080, h: 760, priority: 8 },
  ] };

// Places on the home plain (coordinates local to its tile, 2400×1500). The forest covers its west 200px down to
// y 400, the plateau's cliff its top 100px, the mountain its east 200px, the lake its bottom 100px.
export const SITES = [
  // yard: the walled compound round the house, relative to the site; later places keep off its walls.
  { key: "home", name: "陶家庭院", ground: [G.MEADOW], west: 600, east: 1800, north: 0.48, south: 0.25, yard: { x: -280, y: -170, w: 560, h: 640 },
    prefer: ({ x, y, W, H }) => 1 - Math.hypot(x - W * 0.45, y - H * 0.33) / 700 },
  { key: "stove", name: "公仓", from: "home", dist: [480, 660], dir: 0.5, ground: [G.MEADOW], gap: 300 },   // (key kept from when the stove stood here)
  { key: "hemp", name: "葛麻坡", from: "home", dist: [650, 950], dir: 2.4, ground: [G.MEADOW], gap: 300 },
];

/** Cards at each home-plain place: [key, dx, dy, stock?]. */
export const LAYOUT = {
  home: [["taoHouse", 0, -10]],
  stove: [["granary", 0, 0, 10]],                       // the stove is in the house now; the granary is a walled store here
  hemp: [["hemp", 0, 0]],
};

// Cards standing in other tiles: [key, fx, fy] as fractions of the tile.
// The farm tile: two fields already broken; the rest is meadow to break with a hoe.
export const FARM_FIELDS = [["field", 0.32, 0.42], ["field2", 0.68, 0.42]];
export const FIELD_SIZE = { w: 560, h: 320 };
// The forest: chestnuts to cut, and a berry thicket at its edge towards home.
export const WOOD_LAYOUT = [["chestnut", 0.3, 0.42], ["chestnut", 0.55, 0.62], ["chestnut", 0.78, 0.38], ["chestnut", 0.27, 0.74], ["chestnut", 0.6, 0.2], ["berries", 0.88, 0.86]];
// Deep in the old wood: pines, mushrooms after rain, a wild bees' nest in a hollow tree.
export const DEEP_LAYOUT = {
  deep: [["hive", 0.5, 0.52], ["mushrooms", 0.2, 0.2]],
  deepSouth: [["pineGrove", 0.3, 0.15], ["pineGrove", 0.7, 0.4], ["pineGrove", 0.35, 0.68], ["pineGrove", 0.6, 0.88],
    ["mushrooms", 0.55, 0.25], ["mushrooms", 0.25, 0.5], ["hive", 0.72, 0.62]],
  deepWest: [["pineGrove", 0.3, 0.12], ["pineGrove", 0.68, 0.22], ["pineGrove", 0.25, 0.42], ["pineGrove", 0.62, 0.55], ["pineGrove", 0.35, 0.78], ["pineGrove", 0.7, 0.9],
    ["mushrooms", 0.5, 0.33], ["mushrooms", 0.18, 0.6], ["mushrooms", 0.5, 0.7], ["hive", 0.42, 0.18], ["hive", 0.75, 0.42], ["hive", 0.2, 0.9]],
};
// The lake fills most of its tile: fish and clay on the north shore, the marsh on the west, clams to the east.
export const LAKE_LAYOUT = [["lake", 0.5, 0.09], ["pit", 0.28, 0.11], ["shallows", 0.76, 0.12], ["reeds", 0.06, 0.48], ["nest", 0.07, 0.6]];
// At the foot of the plateau's cliff, and up on top: where the rope comes up, herbs, a green-stained outcrop, and a
// lookout from which you can see smoke far to the south-east.
export const PLATEAU_LAYOUT = [["cliffFoot", 0.3, 1.06], ["cliffTop", 0.3, 0.86], ["herbs", 0.45, 0.5], ["copperRock", 0.72, 0.3], ["lookout", 0.88, 0.62]];

// Two people for now: 陶婶 keeps the stove, 阿三 the fields. Both sleep in 陶家主屋.
export const PEOPLE = {
  aunt: { home: "taoHouse", job: "cook", at: ["stove", -60, 160], style: "nagging" },
  san: { home: "taoHouse", job: "farm", at: ["home", 150, 560], style: "huashao" },
};
export const START = { you: ["home", -40, 560], dog: ["home", 180, 600] };
