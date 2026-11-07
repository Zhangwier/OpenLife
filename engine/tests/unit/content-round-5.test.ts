/**
 * 内容填充第五轮（2026-10-19 深挖「西来河与大泽」）：全部新内容在 *.deep.json / event_points.deep.yaml 里，
 * 由加载器叠加到上一轮的数据上。这里校验叠加生效、房间都有家什、配方链闭合、事件点与对话分支到位。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, RIVER_TERRACE_FIXTURES } from "@openlife/module-settlement-locations";
import { STORY_PACK, BONDS_PACK, storyPackProblems, bondsProblems } from "@openlife/module-village-stories";
import { loadMapPack } from "@openlife/module-map-pack";
import { mergeOverlay } from "../../modules/settlement-locations/src/overlay.ts";

const PACK = RIVER_TERRACE_PACK;
const RECIPES = RIVER_TERRACE_RECIPES.recipes;
const protoOf = new Map(PACK.prototypes.map((p) => [p.id, p]));

test("overlay merge only adds: objects merge, arrays append, base scalars win", () => {
  assert.deepEqual(mergeOverlay({ a: 1, l: [1], o: { x: 1 } }, { a: 2, b: 3, l: [2], o: { y: 2 } }), { a: 1, b: 3, l: [1, 2], o: { x: 1, y: 2 } });
});

test("渔寮与药庐的每间房都有一件能用的家什", () => {
  const uses = new Set(RIVER_TERRACE_FIXTURES.uses.map((u) => u.prototypeId));
  for (const placeId of ["place:fishing-lodge", "place:herb-hut"]) {
    const place = PACK.places.find((p) => p.id === placeId)!;
    for (const space of place.spaces) {
      const here = PACK.instances.filter((i) => i.inId === space.id && !protoOf.get(i.prototypeId)!.capabilities.includes("carryable"));
      assert.ok(here.some((i) => uses.has(i.prototypeId)), `${space.name} 有可用家什`);
    }
  }
  // 房间专属事件：只在某人在场时才有的家什用法。
  assert.ok(RIVER_TERRACE_FIXTURES.uses.filter((u) => u.with === "fisher").length >= 2);
  assert.ok(RIVER_TERRACE_FIXTURES.uses.filter((u) => u.with === "herbalist").length >= 3);
});

test("上一轮的新物品都有来路和去处，另有 5 件配套大件能做", () => {
  const made = new Set(RECIPES.flatMap((r) => r.outputs.map((o) => o.prototypeId)));
  const gathered = new Set((PACK.recipes ?? []).flatMap((r) => (r.output ? [r.output.prototypeId] : [])));
  const used = new Set([...RECIPES.flatMap((r) => [...r.inputs.map((i) => i.prototypeId), ...(r.tools ?? [])]), ...(PACK.recipes ?? []).flatMap((r) => (r.tool ? [r.tool] : []))]);
  const incidentDrops = new Set(STORY_PACK.incidents.list.flatMap((i) => i.choices.flatMap((c) => c.items ?? []).map((x) => x.prototype)));
  const raw = new Set(Object.values(PACK.rawPrototypes ?? {}));
  const round4 = ["fish-weir", "great-net", "glue-cauldron", "herb-grinder", "drying-trellis", "sick-cot", "cattail", "cattail-mat", "fish-glue",
    "herb-powder", "water-chestnut", "gator-scute", "egret-plume", "snake-slough"].map((k) => `prototype:${k}`);
  for (const id of round4) {
    assert.ok(made.has(id) || gathered.has(id) || incidentDrops.has(id) || raw.has(id), `${id} 有来路`);
    const fixture = protoOf.get(id)!.capabilities.includes("fixture");
    assert.ok(used.has(id) || fixture, `${id} 有去处`);
  }
  for (const id of ["medicine-cabinet", "herb-stove", "net-frame", "awning-raft", "gator-drum"].map((k) => `prototype:${k}`)) {
    assert.ok(protoOf.get(id)!.mass >= 25, `${id} 是大件`);
    assert.ok(made.has(id), `${id} 有做法`);
  }
});

test("阿罟、阿芷各有至少 3 条带条件的多轮对话分支", () => {
  for (const key of ["fisher", "herbalist"]) {
    const tree = STORY_PACK.dialogues[key]!;
    const gated = tree.nodes.root!.options.filter((o) => o.requires && o.next);
    const deep = gated.filter((o) => tree.nodes[o.next!]!.options.some((x) => x.next));
    assert.ok(deep.length >= 3, `${key}: ${deep.length} 条多轮分支`);
    for (const node of Object.values(tree.nodes)) for (const o of node.options) if (o.next) assert.ok(tree.nodes[o.next], `${key}.${o.next}`);
  }
  assert.deepEqual(storyPackProblems(), []);
  assert.deepEqual(bondsProblems(), []);
  assert.ok(BONDS_PACK.routines.fisher!["晨"] && BONDS_PACK.routines.herbalist!["午"]);
});

test("泽地生态事件与西泽事件点扩展", () => {
  const ids = new Set(STORY_PACK.incidents.list.map((i) => i.id));
  for (const id of ["otter-net", "gator-winter", "milu-antler", "duck-pond", "carp-gasp", "egret-chick"]) assert.ok(ids.has(id), id);
  const loaded = loadMapPack(resolve(import.meta.dirname, "../../packs/xia_west_marsh_v0_1"));
  assert.equal(loaded.ok, true, loaded.validation.issues.map((i) => i.message).join("; "));
  const points = loaded.pack!.eventPoints!;
  assert.equal(points.length, 31);
  const added = points.slice(16);
  assert.ok(added.filter((p) => p.creature && p.behavior && p.drops?.length).length >= 12);
  for (const beast of ["水獭", "麋鹿", "鼍", "绿头鸭", "鲫鱼", "白鹭", "水蛇"]) assert.ok(added.some((p) => p.creature?.includes(beast)), beast);
});
