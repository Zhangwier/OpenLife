/**
 * Local maps: the walkable grid under one semantic space (map-life M1).
 *
 * A scene is one (place, space) pair. Its layout is derived only from stable
 * ids and types, so the same world always draws the same room, a save never
 * stores tiles, and the server and the browser agree on every wall. Nothing
 * here touches the world: it is pure geometry used by the local-grid rules,
 * the web projection and the tests.
 *
 * Tile alphabet (one character per cell):
 *   blocked  # wall/building  ~ water  T tree/scrub  o rock  F fence  W work feature  p clay pit
 *   open     . floor  , grass  = path  _ bank  f furrow  r reeds  D door  G gate
 *
 * `props` are the standing things that own blocked cells (houses, trees,
 * fences, rocks). They are listed so a renderer can draw one sprite per thing
 * at its foot cell instead of guessing from the tiles.
 */

export const LOCAL_MAP_VERSION = 1;

const BLOCKED = new Set(["#", "~", "T", "o", "F", "W", "p"]);

export interface Cell { x: number; y: number }

export interface SceneInput {
  placeId: string;
  placeType: string;
  spaceId: string;
  spaceType: string;
  /** The other spaces of the same place, each gets a door. */
  siblings: { id: string; name: string; spaceType: string }[];
}

export interface DoorAnchor extends Cell { spaceId: string; name: string; /** a building front, a side path, or an inner doorway */ style: "house" | "path" | "inner" }
export interface Prop extends Cell { kind: string; /** footprint width in cells, for buildings */ w?: number; h?: number }

export interface LocalLayout {
  sceneId: string;
  kind: "interior" | "outdoor";
  /** visual theme picked from the place and space type */
  theme: string;
  width: number;
  height: number;
  tiles: string[];
  props: Prop[];
  gate: Cell;
  spawn: Cell;
  work: Cell;
  doors: DoorAnchor[];
  /** cells where objects stand */
  objectSlots: Cell[];
  /** open cells where people stand */
  peopleSlots: Cell[];
  /** cells near the work feature where gatherable materials lie */
  yieldSlots: Cell[];
}

export function sceneIdOf(placeId: string, spaceId: string): string {
  return `local-v${LOCAL_MAP_VERSION}|${placeId}|${spaceId}`;
}

/** Stable 32-bit hash; layout noise must not use the world RNG (it is not an event). */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const noise = (seed: string, x: number, y: number) => (hashText(`${seed}:${x}:${y}`) % 1000) / 1000;

const INTERIOR_SPACES = new Set(["sleep", "storage", "room"]);
const WATER_THEMES = new Set(["riverbank", "ford", "lodge", "reedbed", "stonebeach"]);

export function themeOf(placeType: string, spaceType: string): string {
  if (INTERIOR_SPACES.has(spaceType)) return spaceType === "storage" ? "store-room" : "home-room";
  if (spaceType === "water") return "riverbank";
  return {
    yard: "yard", kitchen: "hearth", water: "riverbank", field: "field", kiln: "kiln", "clay-pit": "claypit",
    "reed-flat": "reedbed", crossing: "ford", longhouse: "longhouse", workshop: "workshop", shrine: "shrine",
    market: "market", forest: "forest", "stone-flat": "stonebeach", "fishing-lodge": "lodge", "herb-hut": "herbs",
  }[placeType] ?? "yard";
}

export function isWalkable(layout: Pick<LocalLayout, "tiles" | "width" | "height">, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= layout.width || y >= layout.height) return false;
  return !BLOCKED.has(layout.tiles[y]![x]!);
}

export function buildLayout(input: SceneInput): LocalLayout {
  const sceneId = sceneIdOf(input.placeId, input.spaceId);
  const theme = themeOf(input.placeType, input.spaceType);
  return INTERIOR_SPACES.has(input.spaceType) ? interiorLayout(sceneId, theme, input) : outdoorLayout(sceneId, theme, input);
}

type Grid = string[][];
const gridOf = (w: number, h: number, fill: string): Grid => Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
const put = (g: Grid, x: number, y: number, ch: string) => { if (g[y] && g[y]![x] !== undefined) g[y]![x] = ch; };
const at = (g: Grid, x: number, y: number) => g[y]?.[x] ?? "#";

function interiorLayout(sceneId: string, theme: string, input: SceneInput): LocalLayout {
  const width = 15, height = 11;
  const g = gridOf(width, height, ".");
  // The back wall is drawn three cells tall; side walls one cell; the front wall carries the way out.
  for (let x = 0; x < width; x++) { for (let y = 0; y < 3; y++) put(g, x, y, "#"); put(g, x, height - 1, "#"); }
  for (let y = 0; y < height; y++) { put(g, 0, y, "#"); put(g, width - 1, y, "#"); }
  const gate = { x: 7, y: height - 1 };
  put(g, gate.x, gate.y, "G");
  // The work feature: a sleeping platform or a storage rack along the back wall.
  const work = { x: 2, y: 3 };
  for (const [x, y] of [[2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4]] as const) put(g, x, y, "W");
  const props: Prop[] = [{ kind: theme === "store-room" ? "rack" : "bed", x: 2, y: 4, w: 3, h: 2 }, { kind: "firepit", x: 7, y: 5 }];
  put(g, 7, 5, "o");
  const doors: DoorAnchor[] = [];
  const doorXs = [11, 9, 13, 6, 5];
  input.siblings.forEach((s, i) => {
    const x = doorXs[i % doorXs.length]!;
    put(g, x, 2, "D");
    doors.push({ x, y: 2, spaceId: s.id, name: s.name, style: "inner" });
  });
  const objectSlots: Cell[] = [];
  for (let y = 4; y <= height - 3; y += 2) { objectSlots.push({ x: 1, y }); objectSlots.push({ x: width - 2, y }); }
  for (const x of [5, 8, 12]) objectSlots.push({ x, y: 3 });
  objectSlots.push({ x: 1, y: height - 2 }, { x: width - 2, y: height - 2 }, { x: 4, y: height - 2 }, { x: 10, y: height - 2 });
  const peopleSlots: Cell[] = [];
  for (let y = 5; y <= 8; y += 3) for (const x of [4, 6, 9, 11]) peopleSlots.push({ x, y });
  const yieldSlots = [{ x: 5, y: 4 }, { x: 1, y: 3 }, { x: 13, y: 3 }];
  return finish({ sceneId, kind: "interior", theme, width, height, tiles: [], props, gate, spawn: { x: gate.x, y: gate.y - 1 }, work, doors,
    objectSlots, peopleSlots, yieldSlots }, g);
}

const OUT_W = 36, OUT_H = 22;

function outdoorLayout(sceneId: string, theme: string, input: SceneInput): LocalLayout {
  const width = OUT_W, height = OUT_H;
  const water = WATER_THEMES.has(theme);
  const ground = theme === "claypit" || theme === "kiln" || theme === "market" || theme === "hearth" ? "." : ",";
  const g = gridOf(width, height, ground);
  const props: Prop[] = [];
  const seed = sceneId;
  const top = water ? 6 : 2;
  // Water along the top; a wooded or fenced rim elsewhere.
  if (water) {
    for (let y = 0; y < 5; y++) for (let x = 0; x < width; x++) put(g, x, y, "~");
    for (let x = 0; x < width; x++) put(g, x, 5, "_");
  }
  const fenced = ["yard", "herbs", "workshop", "longhouse", "hearth", "shrine"].includes(theme);
  for (let x = 0; x < width; x++) {
    if (!water) { put(g, x, 0, "T"); put(g, x, 1, "T"); }
    put(g, x, height - 1, "T");
  }
  for (let y = water ? 5 : 0; y < height; y++) { put(g, 0, y, "T"); put(g, width - 1, y, "T"); }
  // Rim trees: one sprite every few cells along the back and the sides, front trees along the bottom.
  for (let x = 2; x < width - 1; x += 5) {
    if (!water) props.push({ kind: noise(seed, x, 0) < 0.25 ? "birch" : noise(seed, x, 0) < 0.5 ? "slender" : "tree", x: x + Math.floor(noise(seed, x, 1) * 2), y: 1 });
    props.push({ kind: "treeFront", x: x + 1, y: height - 1 });
  }
  for (let y = water ? 8 : 4; y < height - 2; y += 5) {
    props.push({ kind: "tree", x: 0, y });
    props.push({ kind: "tree", x: width - 1, y: y + 2 });
  }
  if (fenced) {
    for (let x = 3; x < width - 3; x++) if (Math.abs(x - width / 2) > 3) put(g, x, height - 3, "F");
    for (let x = 4; x < width - 4; x += 7) if (Math.abs(x + 3 - width / 2) > 4) props.push({ kind: "fence", x: x + 3, y: height - 3, w: 7 });
  }
  const gate = { x: width / 2, y: height - 1 };
  put(g, gate.x, gate.y, "G");
  put(g, gate.x - 1, gate.y, "G");
  // A worn path from the gate up to a crossing in the middle of the ground.
  const midY = water ? 12 : 13;
  for (let y = midY; y < height; y++) { put(g, gate.x, y, "="); put(g, gate.x - 1, y, "="); }
  for (let x = 5; x < width - 5; x++) put(g, x, midY, "=");
  put(g, gate.x, gate.y, "G"); put(g, gate.x - 1, gate.y, "G");

  // Buildings for the indoor sibling spaces; side paths for the outdoor ones.
  const doors: DoorAnchor[] = [];
  const houseXs = [4, 22, 13];
  const sidePaths = [{ x: 0, y: midY }, { x: width - 1, y: midY }, { x: 0, y: midY + 4 }, { x: width - 1, y: midY + 4 }];
  let houses = 0, paths = 0;
  for (const s of input.siblings) {
    if (INTERIOR_SPACES.has(s.spaceType) && houses < houseXs.length && !water) {
      const hx = houseXs[houses++]!, hy = top, w = 10, h = 6;
      for (let y = hy; y < hy + h; y++) for (let x = hx; x < hx + w; x++) put(g, x, y, "#");
      const door = { x: hx + 4, y: hy + h - 1 };
      put(g, door.x, door.y, "D");
      for (let y = door.y + 1; y < midY; y++) put(g, door.x, y, "=");
      props.push({ kind: s.spaceType === "storage" ? "shed" : "house", x: hx, y: hy + h - 1, w, h });
      doors.push({ ...door, spaceId: s.id, name: s.name, style: "house" });
    } else {
      const c = sidePaths[paths++ % sidePaths.length]!;
      put(g, c.x, c.y, "D");
      const joinX = c.x === 0 ? 5 : width - 6;
      for (let k = 1; k <= 5; k++) put(g, c.x === 0 ? k : width - 1 - k, c.y, "=");
      for (let y = Math.min(midY, c.y); y <= Math.max(midY, c.y); y++) put(g, joinX, y, "=");
      props.push({ kind: "signpost", x: c.x === 0 ? 1 : width - 2, y: c.y - 1 });
      put(g, c.x === 0 ? 1 : width - 2, c.y - 1, "o");
      doors.push({ ...c, spaceId: s.id, name: s.name, style: "path" });
    }
  }

  // The work feature for the theme, north of the crossing.
  const work = water ? { x: gate.x, y: 5 } : { x: gate.x - 1, y: houses ? top + 8 : 7 };
  for (let y = work.y + 1; y < midY; y++) put(g, gate.x - 1, y, "=");
  if (water) { put(g, work.x, work.y, "W"); put(g, work.x - 1, work.y, "W"); for (let y = 6; y < midY; y++) put(g, gate.x - 1, y, "="); }
  else { put(g, work.x, work.y, "W"); put(g, work.x + 1, work.y, "W"); }
  props.push({ kind: `work-${theme}`, x: work.x, y: work.y });

  // Theme ground: never on paths, doors, the gate or right beside the arrival cell.
  const reserved = (x: number, y: number) => {
    const c = at(g, x, y);
    return c !== ground || (y >= height - 4 && Math.abs(x - gate.x) <= 3) || Math.abs(y - midY) <= 1;
  };
  for (let y = top; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    if (reserved(x, y)) continue;
    const n = noise(seed, x, y);
    if (theme === "field" && y >= top + 1 && y <= midY - 2 && (x < gate.x - 4 || x > gate.x + 3) && x > 2 && x < width - 3) put(g, x, y, "f");
    else if (theme === "forest" && n < 0.05 && x > 2 && x < width - 3) { put(g, x, y, "T"); props.push({ kind: n < 0.025 ? "slender" : "tree", x, y }); }
    else if (theme === "claypit" && n < 0.04 && y < midY - 1) { put(g, x, y, "p"); props.push({ kind: "pit", x, y }); }
    else if (theme === "stonebeach" && n < 0.04) { put(g, x, y, "o"); props.push({ kind: "rock", x, y }); }
    else if (theme === "reedbed" && y <= top + 1) put(g, x, y, "r");
    else if (n < 0.012 && y > top + 1) { put(g, x, y, "T"); props.push({ kind: "shrub", x, y }); }
  }
  const objectSlots = objectSlotsOf(midY, height);
  const peopleSlots = peopleSlotsOf(midY);
  const yieldSlots = water
    ? [{ x: work.x - 4, y: 6 }, { x: work.x + 3, y: 6 }, { x: work.x - 8, y: 6 }, { x: work.x + 7, y: 6 }]
    : [{ x: work.x - 3, y: work.y + 1 }, { x: work.x + 4, y: work.y + 1 }, { x: work.x - 5, y: work.y + 2 }, { x: work.x + 6, y: work.y + 2 }];
  // Things that make each kind of place recognisable, on cells whose four
  // neighbours are open ground, so they can never cut a path in two.
  const DECOR: Record<string, string[]> = {
    kiln: ["woodpile", "potstack", "woodpile", "potstack", "mound"], market: ["stall", "basketpile", "stall", "basketpile"],
    claypit: ["mound", "mound", "potstack"], hearth: ["woodpile", "bench", "potstack", "bench"], ford: ["canoe", "post", "rock"],
    riverbank: ["reeds", "rock", "reeds", "rock"], reedbed: ["reeds", "reeds", "reedstack", "reeds"], lodge: ["netrack", "canoe", "fishrack"],
    stonebeach: ["rock", "rock", "stonepile"], shrine: ["standing", "standing", "offering"], field: ["haystack", "basketpile"],
    forest: ["log", "stump", "log"], yard: ["woodpile", "potstack"], workshop: ["rack", "basketpile"], longhouse: ["woodpile", "bench"],
    herbs: ["herbbed", "herbbed", "potstack"],
  };
  const want = DECOR[theme] ?? [];
  const opened = (x: number, y: number) => at(g, x, y) === ground || at(g, x, y) === "f";
  const spots: Cell[] = [];
  for (let y = top + 1; y < height - 3; y++) for (let x = 2; x < width - 2; x++) {
    if (!opened(x, y) || !opened(x - 1, y) || !opened(x + 1, y) || !opened(x, y - 1) || !opened(x, y + 1)) continue;
    if (Math.abs(y - midY) <= 1 || Math.abs(x - work.x) <= 3 && Math.abs(y - work.y) <= 2) continue;
    spots.push({ x, y });
  }
  const taken = new Set([...objectSlots, ...peopleSlots, ...yieldSlots, layout0Spawn(gate)].map((c) => `${c.x},${c.y}`));
  let placed = 0;
  for (let i = 0; i < spots.length && placed < want.length * 2; i++) {
    const c = spots[Math.floor(noise(seed, i, 99) * spots.length)]!;
    if (taken.has(`${c.x},${c.y}`) || !opened(c.x, c.y) || !opened(c.x - 1, c.y) || !opened(c.x + 1, c.y) || !opened(c.x, c.y - 1) || !opened(c.x, c.y + 1)) continue;
    put(g, c.x, c.y, "o");
    props.push({ kind: want[placed % want.length]!, x: c.x, y: c.y });
    for (const n of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) taken.add(`${c.x + n[0]!},${c.y + n[1]!}`);
    placed++;
  }

  // Every anchor must stand on an open cell, whatever the noise drew.
  const clear = (c: Cell) => {
    if (BLOCKED.has(at(g, c.x, c.y)) && at(g, c.x, c.y) !== "W") {
      for (let i = props.length - 1; i >= 0; i--) if (props[i]!.x === c.x && props[i]!.y === c.y && !props[i]!.w) props.splice(i, 1);
      put(g, c.x, c.y, ground);
    }
  };
  [...objectSlots, ...peopleSlots, ...yieldSlots].forEach(clear);
  return finish({ sceneId, kind: "outdoor", theme, width, height, tiles: [], props, gate, spawn: { x: gate.x, y: gate.y - 1 }, work, doors,
    objectSlots, peopleSlots, yieldSlots }, g);
}

const layout0Spawn = (gate: Cell): Cell => ({ x: gate.x, y: gate.y - 1 });
function objectSlotsOf(midY: number, height: number): Cell[] {
  return ([[3, midY + 2], [6, midY + 3], [29, midY + 2], [32, midY + 3], [4, midY - 2], [31, midY - 2],
    [9, height - 4], [26, height - 4], [12, midY + 2], [23, midY + 2], [3, midY + 5], [32, midY + 5]] as const).map(([x, y]) => ({ x, y }));
}
function peopleSlotsOf(midY: number): Cell[] {
  const out: Cell[] = [];
  for (const y of [midY - 2, midY + 2, midY + 4]) for (const x of [7, 11, 15, 21, 25, 29]) out.push({ x, y });
  return out;
}

function finish(layout: LocalLayout, g: Grid): LocalLayout {
  layout.tiles = g.map((row) => row.join(""));
  // Anything sealed off by the noise is dropped from the anchors so every
  // target stays reachable from the way in.
  const reach = reachable(layout, layout.spawn);
  const near = (c: Cell) => reach.has(key(c)) || ring(c).some((n) => reach.has(key(n)));
  layout.objectSlots = layout.objectSlots.filter(near);
  layout.peopleSlots = layout.peopleSlots.filter((c) => reach.has(key(c)));
  layout.yieldSlots = layout.yieldSlots.filter(near);
  layout.props.sort((a, b) => a.y - b.y || a.x - b.x);
  return layout;
}

const key = (c: Cell) => `${c.x},${c.y}`;
const neighbours = (c: Cell): Cell[] => [{ x: c.x, y: c.y + 1 }, { x: c.x - 1, y: c.y }, { x: c.x + 1, y: c.y }, { x: c.x, y: c.y - 1 }];
const ring = (c: Cell): Cell[] => [...neighbours(c), { x: c.x - 1, y: c.y + 1 }, { x: c.x + 1, y: c.y + 1 }, { x: c.x - 1, y: c.y - 1 }, { x: c.x + 1, y: c.y - 1 }];

function reachable(layout: Pick<LocalLayout, "tiles" | "width" | "height">, from: Cell): Set<string> {
  const seen = new Set<string>([key(from)]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of neighbours(c)) {
      if (!isWalkable(layout, n.x, n.y) || seen.has(key(n))) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen;
}

/** Shortest 4-way path (excluding `from`, including `to`), or null when there is none. */
export function findPath(layout: Pick<LocalLayout, "tiles" | "width" | "height">, from: Cell, to: Cell): Cell[] | null {
  if (!isWalkable(layout, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const prev = new Map<string, Cell | null>([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const c = queue.shift()!;
    for (const n of neighbours(c)) {
      if (!isWalkable(layout, n.x, n.y) || prev.has(key(n))) continue;
      prev.set(key(n), c);
      if (n.x === to.x && n.y === to.y) {
        const path: Cell[] = [];
        let step: Cell | null = n;
        while (step && !(step.x === from.x && step.y === from.y)) { path.unshift(step); step = prev.get(key(step)) ?? null; }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Chebyshev distance: standing next to something, diagonals included, is "at" it. */
export function reachDistance(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Where to stand to use something at `target`: the reachable cell within one
 * step of it with the shortest walk (the target itself when it is open and
 * nothing around it is). Ties prefer standing below it, facing up.
 */
export function approachCell(layout: Pick<LocalLayout, "tiles" | "width" | "height">, from: Cell, target: Cell): { cell: Cell; path: Cell[] } | null {
  if (reachDistance(from, target) <= 1 && isWalkable(layout, from.x, from.y)) return { cell: from, path: [] };
  let best: { cell: Cell; path: Cell[] } | null = null;
  for (const cell of [...ring(target), target]) {
    const path = findPath(layout, from, cell);
    if (path && (!best || path.length < best.path.length)) best = { cell, path };
  }
  return best;
}
