/**
 * 内容填充第四轮（2026-10-19）：西来河与大泽。
 * 渔寮与药庐两座多房间建筑、17 个新物品原型与 12 个做法、两位新村民（阿罟、阿芷）、
 * 西泽地图包与 16 个事件点、7 个新物种与 5 个泽地村中事件。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Simulation } from "@openlife/simulation";
import {
  boundaryHandshakeModule, buildGeometryIndex, boundaryPlacement, placementKey, worldGeographyModule, type HandshakeApi,
} from "@openlife/module-world-geography";
import { loadMapPack, mapPackModule, registerMapPack } from "@openlife/module-map-pack";
import { XIA_FAUNA } from "@openlife/module-world-species";

const ROOT = resolve(import.meta.dirname, "../..");
const json = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const PACK = json("modules/settlement-locations/data/river-terrace.json");
const RECIPES = json("modules/settlement-locations/data/river-terrace-recipes.json").recipes as { id: string; placeId: string; spaceId: string; outputs: { prototypeId: string }[] }[];
const STORIES = json("modules/village-stories/data/river-terrace.stories.json");
const WEST = resolve(ROOT, "packs/xia_west_marsh_v0_1");
const XIA = resolve(ROOT, "packs/xia_starter_v0_1");

test("渔寮与药庐是多房间建筑，每间屋都有用处", () => {
  for (const [id, rooms] of [["place:fishing-lodge", 6], ["place:herb-hut", 5]] as const) {
    const place = PACK.places.find((p: { id: string }) => p.id === id);
    assert.ok(place, id);
    assert.equal(place.spaces.length, rooms);
    assert.ok(place.spaces.some((s: { type: string }) => s.type === "sleep"), `${id} 有住处`);
    assert.ok(place.spaces.some((s: { type: string }) => s.type === "storage"), `${id} 有储物间`);
    const spaceIds = new Set(place.spaces.map((s: { id: string }) => s.id));
    const used = new Set<string>([
      ...Object.keys(PACK.worksites).filter((k) => spaceIds.has(k)),
      ...RECIPES.filter((r) => r.placeId === id).map((r) => r.spaceId),
      ...PACK.recipes.filter((r: { spaceId: string }) => spaceIds.has(r.spaceId)).map((r: { spaceId: string }) => r.spaceId),
      ...PACK.instances.filter((i: { inId: string }) => spaceIds.has(i.inId)).map((i: { inId: string }) => i.inId),
    ]);
    for (const s of place.spaces) assert.ok(used.has(s.id) || s.type === "sleep", `${s.id} 有事可做或有家什`);
  }
});

test("新物品都有属性，大件都能做出来", () => {
  const protos = new Map(PACK.prototypes.map((p: { id: string }) => [p.id, p]));
  const large = ["fish-weir", "great-net", "glue-cauldron", "herb-grinder", "drying-trellis", "sick-cot"].map((k) => `prototype:${k}`);
  for (const id of large) {
    const p = protos.get(id) as { mass: number; durability: number } | undefined;
    assert.ok(p, id);
    assert.ok(p.mass >= 16 && p.durability > 0, `${id} 是有分量的大件`);
    assert.ok(RECIPES.some((r) => r.outputs.some((o) => o.prototypeId === id)), `${id} 有做法`);
  }
  for (const r of RECIPES.filter((r) => /fish-weir|great-net|glue|herb-|drying|sick-cot|cattail-mat|plume|scute/.test(r.id))) {
    for (const o of r.outputs) assert.ok(protos.has(o.prototypeId), `${r.id} 产出已定义`);
  }
  assert.equal(PACK.food["resource:water-chestnut"], 2);
});

test("阿罟与阿芷住在新建筑里，有对话、心事、关系网和立绘", () => {
  for (const key of ["fisher", "herbalist"]) {
    const r = PACK.residents.find((x: { key: string }) => x.key === key);
    assert.ok(r && r.teaches, key);
    assert.ok(STORIES.dialogues[key].nodes.root.options.length >= 3);
    assert.ok(readFileSync(resolve(ROOT, `apps/web/public/art/portraits/${key}.jpg`)).length > 10_000);
  }
});

test("泽地的动物与怪物：物种包可吃可猎，村里有对应的事件与掉落", () => {
  const ids = new Set(XIA_FAUNA.species.map((s) => s.id));
  for (const id of ["milu", "crucian-carp", "mallard", "egret", "otter", "yangtze-gator", "water-snake"]) assert.ok(ids.has(`xia-fauna.${id}`), id);
  const incidents = new Map(STORIES.incidents.list.map((i: { id: string }) => [i.id, i]));
  for (const id of ["gator-lodge", "snake-bite", "milu-field", "egret-rack", "marsh-lights"]) assert.ok(incidents.has(id), id);
  const drops = STORIES.incidents.list.flatMap((i: { choices: { items?: { prototype: string }[] }[] }) => i.choices.flatMap((c) => c.items ?? []).map((x) => x.prototype));
  for (const p of ["prototype:gator-scute", "prototype:snake-slough", "prototype:egret-plume"]) assert.ok(drops.includes(p), p);
});

test("西来河与大泽地图包：3 区 12 地点，事件点齐全，接上夏境的入河口", () => {
  const loaded = loadMapPack(WEST);
  assert.equal(loaded.ok, true, loaded.validation.issues.map((i) => i.message).join("; "));
  assert.deepEqual(loaded.validation.counts, { regions: 3, locations: 12, edges: 15, boundaryAnchors: 2 });
  const points = loaded.pack!.eventPoints!;
  assert.ok(points.length >= 16); // 第五轮在 event_points.deep.yaml 追加了事件点
  for (const kind of ["landmark", "gathering", "encounter", "hazard", "omen", "festival"]) assert.ok(points.some((p) => p.kind === kind), kind);
  const shell = readFileSync(resolve(ROOT, "apps/web/public/shell.js"), "utf8");
  for (const type of new Set([...loaded.pack!.regions.map((r) => r.type), ...loaded.pack!.locations.map((l) => l.type)])) {
    assert.match(shell, new RegExp(`\\b${type}: "`), type);
  }
  const simulation = new Simulation({ worldSeed: 20261019, modules: [worldGeographyModule, mapPackModule, boundaryHandshakeModule] });
  for (const path of [XIA, WEST]) assert.equal(registerMapPack(simulation, loadMapPack(path).pack!).ok, true);
  const handshake = simulation.modules.capabilityImplementation<HandshakeApi>("world.boundary-handshake")!;
  const report = handshake.findBoundarySeams(buildGeometryIndex(simulation.worldView()), "xia_starter_v0_1", "xia_west_marsh_v0_1");
  const seam = report.candidates.find((c) =>
    placementKey(c.placement) === placementKey(boundaryPlacement("xia_starter_v0_1", "west", "xia_west_marsh_v0_1", "east")));
  assert.ok(seam, "west/east placement is discovered");
  assert.equal(seam.status, "ready");
});
