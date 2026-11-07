/**
 * Data-only content packs for the settlement (docs/PLUGINS.md §3).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  RIVER_TERRACE_PACK,
  RIVER_TERRACE_RECIPES,
  applyExtensions,
  discoverExtensions,
  readExtension,
  playableBookRecipes,
  type SettlementExtension,
} from "@openlife/module-settlement-locations";

const EXAMPLES = fileURLToPath(new URL("../../docs/examples/content-packs/", import.meta.url));
const example = () => readExtension(`${EXAMPLES}reed_baskets`);

test("the example pack merges cleanly and its recipe becomes playable", () => {
  const { pack, book } = applyExtensions(RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, [example()]);
  assert.ok(pack.prototypes.some((p) => p.id === "prototype:reed_baskets.fish-creel"));
  assert.equal(pack.resourceLabels["resource:reed_baskets.creel"], "鱼篓");
  assert.ok(pack.instances.some((i) => i.id === "instance:reed_baskets.creel-yu"));
  assert.ok(playableBookRecipes(book, pack).some((r) => r.id === "recipe:reed_baskets.fish-creel"));
  // The base village is untouched.
  assert.ok(!RIVER_TERRACE_PACK.prototypes.some((p) => p.id === "prototype:reed_baskets.fish-creel"));
});

test("discovery finds packs by manifest.json and honours the disabled list", () => {
  const found = discoverExtensions(EXAMPLES).map((x) => x.manifest.id);
  // Lists every example pack that ships, sorted by id. Asserting membership
  // rather than an exact list keeps this honest when a new example is added.
  assert.ok(found.includes("reed_baskets"), found.join(", "));
  assert.deepEqual(found, [...found].sort(), "packs come back sorted by id");
  assert.deepEqual(discoverExtensions(EXAMPLES, ["reed_baskets"]).map((x) => x.manifest.id).includes("reed_baskets"), false);
  assert.deepEqual(discoverExtensions("/nonexistent"), []);
});

test("un-namespaced ids, wrong targets and dangling references are rejected", () => {
  const bad: SettlementExtension = structuredClone(example());
  bad.manifest.target = "other-village";
  bad.items.prototypes![0]!.id = "prototype:fish-creel";
  assert.throws(() => applyExtensions(RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, [bad]), /targets other-village[\s\S]*must be namespaced/);

  const dangling: SettlementExtension = structuredClone(example());
  dangling.recipes[0]!.inputs[0]!.prototypeId = "prototype:reed_baskets.missing";
  assert.throws(() => applyExtensions(RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, [dangling]), /unknown prototype prototype:reed_baskets.missing/);

  assert.throws(() => applyExtensions(RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, [example(), example()]), /installed twice/);
});
