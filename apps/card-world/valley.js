// The land — basic rectangular tiles stitched into one world (see mapgen.generateWorld), and what stands on each.
// Tiles are multiples of 40 (the map cell). Priority is layering, not height: where two overlap, the higher
// one is the ground you see. door: where the path from home comes into the tile (fractions of the tile).
//
//   森林深处 ┐
//        └ 森林 ─ 高原 ─┐
//               │ 家 │ 大山（矿道）
//          农田 ┘ 湖泊 ┘
import { G } from "./mapgen.js";

export const LAND = { key: "grass", name: "家", seed: 20261101,
  tiles: [
    { key: "farm", kind: "plain", x: 2000, y: 3200, w: 2000, h: 1500, priority: 1, door: [0.5, 0.42] },
    { key: "grass", kind: "valley", fill: "grass", x: 3800, y: 2800, w: 2400, h: 1500, priority: 2 },
    { key: "lake", kind: "lake", x: 3800, y: 4200, w: 2200, h: 1300, priority: 3, door: [0.46, 0.1] },
    { key: "forest", kind: "wood", x: 1200, y: 1000, w: 2800, h: 2200, priority: 4, door: [0.86, 0.9] },
    { key: "deep", kind: "deep", x: 0, y: 0, w: 1800, h: 1600, priority: 5 },
    { key: "plateau", kind: "plateau", x: 4000, y: 1000, w: 2000, h: 1900, priority: 6, door: [0.3, 1.06] },
    { key: "mountain", kind: "mountain", x: 6000, y: 1000, w: 1800, h: 3400, priority: 7, tunnelY: 3500 },
  ] };

// Places on the home plain (coordinates local to its tile, 2400×1500). The forest covers its west 200px down to
// y 400, the plateau's cliff its top 100px, the mountain its east 200px, the lake its bottom 100px.
export const SITES = [
  // yard: the walled compound round the house, relative to the site; later places keep off its walls.
  { key: "home", name: "陶家庭院", ground: [G.MEADOW], west: 600, east: 1800, north: 0.48, south: 0.25, yard: { x: -280, y: -170, w: 560, h: 640 },
    prefer: ({ x, y, W, H }) => 1 - Math.hypot(x - W * 0.45, y - H * 0.33) / 700 },
  { key: "stove", name: "公灶", from: "home", dist: [480, 660], dir: 0.5, ground: [G.MEADOW], gap: 300 },
  { key: "hemp", name: "葛麻坡", from: "home", dist: [650, 950], dir: 2.4, ground: [G.MEADOW], gap: 300 },
];

/** Cards at each home-plain place: [key, dx, dy, stock?]. */
export const LAYOUT = {
  home: [["taoHouse", 0, -10]],
  stove: [["stove", -90, 0, 4], ["granary", 90, 0, 10]],
  hemp: [["hemp", 0, 0]],
};

// Cards standing in other tiles: [key, fx, fy] as fractions of the tile.
// The farm tile: two fields already broken; the rest is meadow to break with a hoe.
export const FARM_FIELDS = [["field", 0.32, 0.42], ["field2", 0.68, 0.42]];
export const FIELD_SIZE = { w: 560, h: 320 };
// The forest: chestnuts to cut, and a berry thicket at its edge towards home.
export const WOOD_LAYOUT = [["chestnut", 0.3, 0.42], ["chestnut", 0.55, 0.62], ["chestnut", 0.78, 0.38], ["berries", 0.88, 0.86]];
// The lake fills most of its tile: fish and clay on the north shore, the marsh on the west, clams to the east.
export const LAKE_LAYOUT = [["lake", 0.5, 0.09], ["pit", 0.28, 0.11], ["shallows", 0.76, 0.12], ["reeds", 0.06, 0.48], ["nest", 0.07, 0.6]];
// At the foot of the plateau's cliff.
export const PLATEAU_LAYOUT = [["cliffFoot", 0.3, 1.06]];

// Two people for now: 陶婶 keeps the stove, 阿三 the fields. Both sleep in 陶家主屋.
export const PEOPLE = {
  aunt: { home: "taoHouse", job: "cook", at: ["stove", -60, 160], style: "nagging" },
  san: { home: "taoHouse", job: "farm", at: ["home", 150, 560], style: "huashao" },
};
export const START = { you: ["home", -40, 560], dog: ["home", 180, 600] };
