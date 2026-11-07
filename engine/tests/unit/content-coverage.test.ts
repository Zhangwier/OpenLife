/**
 * 内容覆盖矩阵：每位村民都达到内容底线（喜好、心事、四季、关系、对话树、关系网、等级场景、立绘…），
 * docs/CONTENT_COVERAGE.md 与数据一致；本轮补的对话树真的能在游戏里聊下去。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, residentId, RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";
import {
  villageStoriesModule, StoryCommands, StoryProjections, contentCoverage, coverageGaps, COVERAGE_FLOOR, type StoryView,
} from "@openlife/module-village-stories";
import { COVERAGE_PATH, PORTRAITS, hasPortrait, renderCoverage } from "../../scripts/content-coverage.ts";

test("every villager reaches the content floor", () => {
  const rows = contentCoverage(hasPortrait);
  assert.equal(rows.length, RIVER_TERRACE_PACK.residents.length);
  assert.deepEqual(coverageGaps(rows), []);
  assert.ok(COVERAGE_FLOOR.portrait && COVERAGE_FLOOR.dialogueNodes >= 2);
});

test("a villager below the floor is reported by name and by what is missing", () => {
  const rows = contentCoverage((key) => key !== "healer");
  assert.ok(coverageGaps(rows).some((g) => g.startsWith("蓍婆(healer): portrait")));
});

test("docs/CONTENT_COVERAGE.md is generated from the data, not hand-edited", () => {
  assert.equal(fs.readFileSync(COVERAGE_PATH, "utf8"), renderCoverage().markdown, "run npm run coverage");
});

test("every portrait is a real JPEG named for a villager", () => {
  const keys = new Set(RIVER_TERRACE_PACK.residents.map((r) => r.key));
  for (const file of fs.readdirSync(PORTRAITS).filter((f) => f.endsWith(".jpg"))) {
    assert.ok(keys.has(path.basename(file, ".jpg")), `${file} names a villager`);
    const head = fs.readFileSync(path.join(PORTRAITS, file)).subarray(0, 3);
    assert.deepEqual([...head], [0xff, 0xd8, 0xff], `${file} is a JPEG`);
  }
});

test("the conversation trees added for coverage can be talked through in the game", () => {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(18 * 360);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const act = (type: string, payload: Record<string, unknown>) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const view = () => sim.project({ id: StoryProjections.journal, params: { actorId: me } }).data as unknown as StoryView;
  for (const key of ["yu", "yu-brother", "lan-mother", "reed-worker", "clay-digger", "water-child", "cook-helper"]) {
    for (let i = 0; i < 4 && occupiedPlaceId(sim.worldView(), residentId(key)) !== occupiedPlaceId(sim.worldView(), me); i += 1) {
      act(SettlementCommands.arrive, { placeId: occupiedPlaceId(sim.worldView(), residentId(key)) });
    }
    const tree = view().dialogues.find((d) => d.npc === key);
    assert.ok(tree, `${key} has a conversation where they stand`);
    const open = tree!.options.find((o) => o.enabled)!;
    assert.ok(open, `${key} has something to say to a stranger`);
    assert.equal(act(StoryCommands.choose, { npc: key, option: open.id }).ok, true, `${key}: ${open.label}`);
    assert.ok(tree!.options.some((o) => !o.enabled && /相识|朋友/.test(o.reason)), `${key} keeps something for when you know each other`);
    if (sim.tick % 2 === 0) sim.advanceBy(1);
  }
});

test("the recipe book is playable: 苇帘 can be made from reed and a rope you twisted yourself", async () => {
  const { RIVER_TERRACE_RECIPES, homestead } = await import("@openlife/module-settlement-locations");
  const ids = new Set((RIVER_TERRACE_PACK.recipes ?? []).map((r) => r.id));
  for (const r of RIVER_TERRACE_RECIPES.recipes) assert.ok(ids.has(r.id), `${r.id} (${r.name}) is a recipe the craft command can run`);
  const kiln = (RIVER_TERRACE_PACK.recipes ?? []).find((r) => r.id === "recipe:clay-xun")!;
  assert.equal(kiln.dryOnly, true, "a kiln recipe needs a dry day");
  assert.equal(kiln.tool, "prototype:bone-needle");

  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(18 * 360 + 90); // spring: the reedbed is open
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:reedbed" } });
  const act = (type: string, payload: Record<string, unknown>) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  const screen = () => homestead(sim.worldView(), me).actions.find((a) => a.payload.recipeId === "recipe:reed-screen");
  assert.ok(screen(), "苇帘 shows up among the things to make");
  assert.equal(screen()!.enabled, false);
  for (let n = 0; n < 3; n += 1) {
    let r = act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" });
    if (!r.ok) { sim.advanceBy(1); r = act(SettlementCommands.draw, { placeId: "place:reedbed", resourceId: "resource:reed" }); }
    assert.equal(r.ok, true, r.errors?.[0]?.message);
  }
  sim.advanceBy(1);
  act("world-space.move_within", { spaceId: "space:reed-cut" });
  const rope = act(SettlementCommands.craft, { recipeId: "recipe:twist-rope" });
  assert.equal(rope.ok, true, rope.errors?.[0]?.message);
  assert.equal(screen()!.enabled, true, screen()!.reason);
  const made = act(SettlementCommands.craft, { recipeId: "recipe:reed-screen" });
  assert.equal(made.ok, true, made.errors?.[0]?.message);
  const held = sim.worldView().listRelations({ type: "world-objects.held_by", to: me }).map((r) => sim.worldView().getComponent(r.from, "world-objects.object")?.prototypeId);
  assert.ok(held.includes("prototype:reed-screen"), `holding ${held}`);
});
