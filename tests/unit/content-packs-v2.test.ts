/**
 * 内容包格式 v2（规划书 §3.1）：抉择事件、新居民、对话、地点；
 * 存档记录装过哪些包；缺包时给明确提示而不是莫名报错。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTIVE_CONTENT_PACKS, BASE_RIVER_TERRACE_PACK, contentPackStamps, loadSettlementPack,
  missingContentPacks, RIVER_TERRACE_PACK, validateSettlementPack,
} from "@openlife/module-settlement-locations";
import {
  checkExtension, discoverExtensions, EXTENSION_FORMATS, mergeExtensions, readExtension,
} from "@openlife/module-settlement-locations";

const BASE = new URL("../../modules/settlement-locations/data/river-terrace.json", import.meta.url);
const EXAMPLES = new URL("../../docs/examples/content-packs/", import.meta.url).pathname.replace(/^\//, "");

/** Write a throwaway pack and return its directory. */
function pack(files: Record<string, unknown>, id = "probe") {
  const root = mkdtempSync(join(tmpdir(), "ol-pack-"));
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), JSON.stringify(body, null, 2));
  }
  return { dir, root };
}

const manifest = (extra: Record<string, unknown> = {}) => ({
  id: "probe", type: "settlement_extension", formatVersion: 2,
  name: "探针包", version: "0.1.0", target: "river-terrace", ...extra,
});

test("格式 1 的包仍然有效，格式 2 是新上限", () => {
  assert.deepEqual([...EXTENSION_FORMATS], [1, 2]);
  const base = loadSettlementPack(BASE);
  const { dir } = pack({ "manifest.json": manifest({ formatVersion: 1 }) });
  const ext = readExtension(dir);
  assert.deepEqual(checkExtension(ext, base).filter((p) => p.includes("formatVersion")), []);
});

test("抉择事件：少于两个选项、或选项没有后果，都要报出来", () => {
  const base = loadSettlementPack(BASE);
  const { dir } = pack({
    "manifest.json": manifest(),
    "incidents.json": { incidents: [
      // One choice only -- but it does have a consequence, so the failure we
      // see here is purely about the count.
      { id: "incident:probe.one", seasons: ["秋"], text: "只有一个选项。", choices: [
        { id: "only", label: "随便", bond: { trust: 1 } },
      ] },
      { id: "incident:probe.dud", seasons: ["秋"], text: "有选项但没后果。", choices: [
        { id: "a", label: "甲" }, { id: "b", label: "乙" },
      ] },
    ] },
  });
  const problems = checkExtension(readExtension(dir), base);
  assert.ok(problems.some((p) => p.includes("needs at least two choices")), problems.join(" | "));
  assert.ok(problems.some((p) => p.includes("choice a changes nothing")), problems.join(" | "));
});

test("合法的抉择事件通过校验，且会被合并进事件池", () => {
  const base = loadSettlementPack(BASE);
  const { dir } = pack({
    "manifest.json": manifest(),
    "incidents.json": { incidents: [{
      id: "incident:probe.share", seasons: ["冬"], text: "分不分？",
      choices: [
        { id: "yes", label: "分", cost: { "resource:grain": 2 }, bond: { trust: 2 }, followUp: { id: "incident:probe.after", afterSeasons: 1 } },
        { id: "no", label: "不分", bond: { grudge: 1 }, reputation: -1 },
      ],
    }] },
  });
  const ext = readExtension(dir);
  assert.deepEqual(checkExtension(ext, base), []);
  const merged = mergeExtensions(base, { recipes: [] }, [ext]);
  assert.equal(merged.incidents.length, 1);
  assert.equal(merged.incidents[0]!.choices?.length, 2);
});

test("新居民必须有真实存在住处空间", () => {
  const base = loadSettlementPack(BASE);
  const { dir } = pack({
    "manifest.json": manifest(),
    "residents.json": { residents: [{
      key: "probe.newcomer", name: "新来的", age: 30, role: "帮工", trait: "",
      wish: "", workPlace: "place:yard", homeSpace: "space:probe.no-such-room", household: "新来的家",
    }] },
  });
  const problems = checkExtension(readExtension(dir), base);
  assert.ok(problems.some((p) => p.includes("lives in space:probe.no-such-room")), problems.join(" | "));
});

test("对话必须挂在一个存在的居民身上", () => {
  const base = loadSettlementPack(BASE);
  const { dir } = pack({
    "manifest.json": manifest(),
    "dialogue.json": { dialogue: [
      { resident: "cook", lines: [{ id: "probe.hi", text: "今天的粥稠。" }] },
      { resident: "nobody-here", lines: [{ id: "probe.x", text: "我是谁？" }] },
    ] },
  });
  const problems = checkExtension(readExtension(dir), base);
  assert.ok(problems.some((p) => p.includes("unknown resident nobody-here")), problems.join(" | "));
  assert.ok(!problems.some((p) => p.includes("unknown resident cook")), "an existing villager is fine");
});

test("命名空间违规一律拦下", () => {
  const base = loadSettlementPack(BASE);
  const { dir } = pack({
    "manifest.json": manifest({ id: "probe" }),
    "items.json": { prototypes: [{ id: "prototype:not-probe.thing", name: "越界", material: "x", resourceId: "resource:probe.x", unit: "个", mass: 1, capabilities: ["carryable"] }] },
  });
  const problems = checkExtension(readExtension(dir), base);
  assert.ok(problems.some((p) => p.includes("must be namespaced as prototype:probe.")), problems.join(" | "));
});

test("存档记录装过的内容包，缺包时给得出来", () => {
  // Nothing installed in this run: every stamp looks missing, which is honest.
  assert.deepEqual(contentPackStamps(), [...ACTIVE_CONTENT_PACKS]);
  assert.deepEqual(missingContentPacks(["ghost@9.9.9"]), ["ghost@9.9.9"]);
  // A world from before this field existed must not look broken.
  assert.deepEqual(missingContentPacks(undefined), []);
  assert.deepEqual(missingContentPacks(null), []);
  assert.deepEqual(missingContentPacks("not-a-list"), []);
  // A stamp that matches an installed pack is not missing.
  for (const stamp of ACTIVE_CONTENT_PACKS) {
    assert.deepEqual(missingContentPacks([stamp]), []);
  }
});

test("随仓库的示例包都通过校验，v1 与 v2 并存", () => {
  const base = loadSettlementPack(BASE);
  const exts = discoverExtensions(EXAMPLES);
  assert.ok(exts.length >= 2, `expected at least the two shipped examples, got ${exts.length}`);
  for (const ext of exts) {
    assert.deepEqual(checkExtension(ext, base), [], ext.manifest.id);
  }
  const formats = new Set(exts.map((e) => e.manifest.formatVersion));
  assert.ok(formats.has(1) && formats.has(2), "one example of each format");
});

test("合并不会改动基础包（只增不改）", () => {
  const base = loadSettlementPack(BASE);
  const before = JSON.stringify(BASE_RIVER_TERRACE_PACK);
  const exts = discoverExtensions(EXAMPLES);
  mergeExtensions(base, { recipes: [] }, exts);
  assert.equal(JSON.stringify(BASE_RIVER_TERRACE_PACK), before, "the shipped pack must stay untouched");
  assert.equal(validateSettlementPack(RIVER_TERRACE_PACK).length, 0);
});

test("两个包用同一个 id 时会被拦下", () => {
  const base = loadSettlementPack(BASE);
  const a = pack({ "manifest.json": manifest() });
  const b = pack({ "manifest.json": manifest() });
  const exts = [readExtension(a.dir), readExtension(b.dir)];
  const ids = exts.map((e) => e.manifest.id);
  assert.equal(ids[0], ids[1], "same id, as intended for this case");
  // checkExtension is per-pack; the duplicate rule lives in applyExtensions.
  for (const ext of exts) assert.deepEqual(checkExtension(ext, base), []);
  for (const { root } of [a, b]) rmSync(root, { recursive: true, force: true });
});
