/**
 * pack:preview -- what a content pack contains, and what it actually does in a
 * played year.
 *
 *   npm run pack:preview                     every pack under content-packs/
 *   npm run pack:preview path/to/my-pack     one pack directory
 *   npm run pack:preview -- --words          skip the played year, just list words
 *
 * Two halves, because a pack can be correct and still lifeless:
 *
 *   1. WORDS   every item, recipe, incident, resident, dialogue line and place,
 *              read through the same reader the game uses (`readExtension`), so
 *              a file this prints is a file the game will load.
 *   2. A YEAR  one world, seed 7, 360 days, with only this pack installed, and
 *              the player answering each of the pack's choice events with the
 *              first option they can afford. What comes out is a hit count per
 *              incident, recipe, resident, place and line: the difference
 *              between "declared" and "reached".
 *
 * Why a child process per pack: the settlement modules read their content packs
 * once, at import time (engine `INSTALLED_EXTENSIONS`). To play a year with
 * exactly one pack installed the environment has to be right before the first
 * import, and that is only true at process start. The variables used are the
 * same ones a player uses to run with a pack set (`OPENLIFE_CONTENT_PACKS`,
 * `OPENLIFE_DISABLE_PACKS`), not a test-only back door.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACK_DIR = join(ROOT, "content-packs");
const EXAMPLE_DIR = join(ROOT, "docs", "examples", "content-packs");
const SELF = fileURLToPath(import.meta.url);

/** One world-year: the calendar a settlement actually lives on. */
const DAYS = 360;
/** Same seed as bench-days, so the two scripts' numbers are comparable. */
const SEED = 7;

interface Hit {
  times: number;
  choices: Map<string, number>;
}

const bump = (map: Map<string, Hit>, key: string, choice: string): void => {
  const hit = map.get(key) ?? { times: 0, choices: new Map<string, number>() };
  hit.times += 1;
  hit.choices.set(choice, (hit.choices.get(choice) ?? 0) + 1);
  map.set(key, hit);
};

const packDirsUnder = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith(".") && existsSync(join(root, d.name, "manifest.json")))
      .map((d) => join(root, d.name))
      .sort()
    : [];

const manifestOf = (dir: string): { id?: string; name?: string; version?: string; description?: string; author?: string; formatVersion?: number; target?: string } => {
  try {
    return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Record<string, never>;
  } catch {
    return {};
  }
};

const idOf = (dir: string): string => String(manifestOf(dir).id ?? basename(dir));

/** `incident:my_pack.share` -> `share`; the namespace is the pack's own. */
const shortId = (id: string): string => id.replace(/^[a-z-]+:/, "").replace(/^[a-z0-9_]+\./, "");

const shortText = (text: string, limit = 60): string => (text.length > limit ? `${text.slice(0, limit)}…` : text);

// --- half one: the words -----------------------------------------------------

async function printWords(dir: string): Promise<number> {
  // The game's own reader: a file that prints here is a file that loads, and a
  // broken one fails with the error the game would raise.
  const mod = await import("@openlife/module-settlement-locations");
  let ext: ReturnType<typeof mod.readExtension>;
  try {
    ext = mod.readExtension(dir);
  } catch (err) {
    console.log(`  （读不出来：${err instanceof Error ? err.message : String(err)}）`);
    return 1;
  }
  const m = ext.manifest;
  console.log(`\n=== ${m.id}@${m.version} · ${m.name} ===`);
  if (m.description) console.log(`  ${m.description}`);
  console.log(`  格式 v${m.formatVersion} · 目标 ${m.target}${m.author ? ` · ${m.author}` : ""}`);

  const problems = mod.checkExtension(ext, mod.RIVER_TERRACE_PACK);
  if (problems.length) {
    console.log(`  ${problems.length} 处不合规：`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log("  校验通过");
  }

  const counted = [
    ["物品", ext.items.prototypes?.length ?? 0],
    ["配方", ext.recipes.length],
    ["抉择", ext.incidents.length],
    ["居民", ext.residents.length],
    ["对话", ext.dialogue.reduce((n, d) => n + d.lines.length, 0)],
    ["地点", ext.items.places?.length ?? 0],
    ["产出点", ext.items.yields?.length ?? 0],
  ] as const;
  console.log(`  ${counted.map(([name, n]) => `${name} ${n}`).join(" · ")}`);

  for (const p of ext.items.prototypes ?? []) console.log(`  物品 · ${p.name}（${p.material}，${p.unit}）`);
  for (const r of ext.recipes) console.log(`  配方 · ${shortId(r.id)}`);
  for (const i of ext.incidents) {
    console.log(`  抉择 · ${shortText(i.text.split(/[。！？!?]/)[0] ?? i.id)}`);
    for (const c of i.choices ?? []) console.log(`      ${c.label}${c.line ? ` —— ${shortText(c.line, 40)}` : ""}`);
  }
  for (const r of ext.residents) console.log(`  居民 · ${r.name}${r.role ? `（${r.role}）` : ""}`);
  for (const d of ext.dialogue) console.log(`  对话 · ${d.resident} 有 ${d.lines.length} 句`);
  for (const p of ext.items.places ?? []) console.log(`  地点 · ${p.name}`);
  return problems.length ? 1 : 0;
}

// --- half two: the played year -----------------------------------------------

async function playYear(dir: string): Promise<number> {
  const parent = dirname(dir);
  const myId = idOf(dir);
  // Disable every sibling, so a hit means "this pack did something", never
  // "some pack did something".
  const others = packDirsUnder(parent).filter((d) => resolve(d) !== resolve(dir)).map(idOf);
  process.env.OPENLIFE_CONTENT_PACKS = parent;
  process.env.OPENLIFE_DISABLE_PACKS = others.join(",");

  const settlement = await import("@openlife/module-settlement-locations");
  const stories = await import("@openlife/module-village-stories");
  const { Simulation } = await import("@openlife/simulation");
  const { modernWorldModule } = await import("@openlife/module-modern-world");
  const { familyModule } = await import("@openlife/module-family");
  const { worldClockModule } = await import("@openlife/module-world-clock");
  const { worldSpaceModule } = await import("@openlife/module-world-space");
  const { worldObjectsModule } = await import("@openlife/module-world-objects");

  const { SettlementCommands, RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, ACTIVE_CONTENT_PACKS, residentId } = settlement;

  const ext = settlement.readExtension(dir);
  if (!ACTIVE_CONTENT_PACKS.some((s) => s.startsWith(`${myId}@`))) {
    console.log(`  装不进来：这个进程里没有它。只有装在 ${parent} 下的包会被读到。`);
    return 1;
  }

  const sim = new Simulation({
    worldSeed: SEED,
    modules: [
      modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlement.settlementLocationsModule, stories.villageStoriesModule,
    ],
  });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(18 * 360);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  const founded = sim.dispatch({ type: SettlementCommands.found });
  if (!founded.ok) {
    console.log(`  建村失败：${founded.errors[0]?.message ?? ""}`);
    return 1;
  }
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });

  const incidentIds = ext.incidents.map((i) => i.id);
  const myPlaces = (ext.items.places ?? []).map((p) => p.id);
  const myResidents = ext.residents.map((r) => r.key);
  const myRecipes = (RIVER_TERRACE_RECIPES.recipes as Array<{ id: string }>).filter((r) => r.id.startsWith(`recipe:${myId}.`));

  const fired = new Map<string, Hit>();
  let stalled = 0;
  for (let day = 0; day < DAYS; day += 1) {
    const world = sim.worldView();
    const journal = stories.readJournal(world, me);
    const today = stories.incidentOn(world.tick, stories.incidentGate(world, me, journal));
    if (today && incidentIds.includes(today.id)) {
      // Take the first option the player can afford, the way a curious player
      // would; when nothing is affordable the event is recorded as stalled
      // rather than silently dropped -- a pack whose every choice needs grain
      // the village never has is a pack that never happens.
      const choice = (today.choices ?? []).find((c) => !stories.meets(world, me, journal, c.requires));
      if (choice) {
        const done = sim.dispatch({
          type: stories.StoryCommands.resolveIncident, actorId: me, source: "player",
          payload: { incidentId: today.id, choiceId: choice.id },
        });
        if (done.ok) bump(fired, today.id, choice.id);
        else stalled += 1;
      } else {
        stalled += 1;
      }
    }
    sim.dispatch({ type: SettlementCommands.step, actorId: me, source: "player", payload: {} });
    sim.advanceBy(1);
  }

  const events = sim.kernel.internals.eventLog.all();
  const crafted = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "settlement-locations.crafted") continue;
    const recipeId = String((e.data as Record<string, unknown> | undefined)?.recipeId ?? "");
    if (!recipeId.startsWith(`recipe:${myId}.`)) continue;
    crafted.set(recipeId, (crafted.get(recipeId) ?? 0) + 1);
  }
  const saidLines = events.filter((e) => e.type === "village-stories.incident_resolved"
    && incidentIds.includes(String((e.data as Record<string, unknown> | undefined)?.incidentId ?? ""))).length;

  const world = sim.worldView();
  const here = myResidents.filter((key) => world.getEntity(residentId(key)));
  const aliveAfter = here.filter((key) => world.getComponent(residentId(key), "modern.vitals")?.alive !== false);
  const built = myPlaces.filter((id) => world.getEntity(id));
  const hits = [...fired.values()].reduce((n, h) => n + h.times, 0);
  const made = [...crafted.values()].reduce((n, v) => n + v, 0);

  console.log(`\n=== ${myId} · 跑了一年（种子 ${SEED}，${DAYS} 天），只装这一个包 ===`);
  console.log(`  抉择 ${incidentIds.length} 件 → 发生 ${hits} 回${stalled ? `，另有 ${stalled} 天来了却没本钱应对` : ""}`);
  for (const id of incidentIds) {
    const hit = fired.get(id);
    const taken = hit ? [...hit.choices].map(([c, n]) => `${c} ×${n}`).join("、") : "一次也没来";
    console.log(`    ${shortId(id)} · ${taken}`);
  }
  console.log(`  配方 ${myRecipes.length} 条 → 做成 ${made} 回`);
  for (const r of myRecipes) console.log(`    ${shortId(r.id)} · ${crafted.get(r.id) ?? 0} 回`);
  console.log(`  居民 ${myResidents.length} 位 → 进来的 ${here.length} 位，一年后还在 ${aliveAfter.length} 位`);
  for (const key of myResidents) {
    const inWorld = here.includes(key);
    const name = RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.name ?? key;
    console.log(`    ${name}（${key}） · ${inWorld ? (aliveAfter.includes(key) ? "在" : "这一年里走了") : "没进这个世界"}`);
  }
  console.log(`  地点 ${myPlaces.length} 处 → 建起来 ${built.length} 处`);
  for (const id of myPlaces) {
    const name = RIVER_TERRACE_PACK.places.find((p) => p.id === id)?.name ?? shortId(id);
    console.log(`    ${name} · ${world.getEntity(id) ? "在" : "没有"}`);
  }
  console.log(`  对话 → 这一年里被说出来 ${saidLines} 句`);

  const lifeless = [
    incidentIds.length && hits === 0 ? "没有一件抉择真的发生（看季节、门槛、村里的存粮）" : "",
    myRecipes.length && made === 0 ? "没有一条配方被做成（看材料与工具）" : "",
    myResidents.length && here.length === 0 ? "没有一位新居民进了世界" : "",
    myPlaces.length && built.length === 0 ? "没有一处新地点建起来" : "",
  ].filter(Boolean);
  for (const line of lifeless) console.log(`  注意：${line}`);
  return 0;
}

// --- entry -------------------------------------------------------------------

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const wordsOnly = args.includes("--words");
  const oneShot = args.includes("--one") ? resolve(args[args.indexOf("--one") + 1] ?? ".") : null;
  if (oneShot) return playYear(oneShot);

  const named = args.find((a) => !a.startsWith("--"));
  let root = PACK_DIR;
  let dirs = packDirsUnder(PACK_DIR);
  if (!dirs.length) {
    // Nothing installed yet: the example packs are the best thing to look at,
    // and saying so is friendlier than "no packs".
    dirs = packDirsUnder(EXAMPLE_DIR);
    root = EXAMPLE_DIR;
    if (dirs.length) console.log("content-packs/ 里还没有包，先看 docs/examples/content-packs 里的示例。");
  }
  if (named) {
    const target = resolve(named);
    if (!existsSync(target)) {
      console.error(`没有这个目录：${target}`);
      return 2;
    }
    dirs = [target];
    root = dirname(target);
  }
  if (!dirs.length) {
    console.log("content-packs/ 里没有包。用 npm run pack:new <名字> 起一个，或把示例拷进去。");
    return 0;
  }

  console.log(`previewing ${dirs.length} pack(s) under ${root}`);
  let code = 0;
  for (const dir of dirs) {
    code = Math.max(code, await printWords(dir));
    if (wordsOnly) continue;
    // Each pack plays its year in its own process: module load reads the pack set.
    const child = spawnSync(process.execPath, [SELF, "--one", dir], { stdio: "inherit", env: process.env });
    if (typeof child.status === "number" && child.status !== 0) code = Math.max(code, child.status);
  }
  return code;
}

process.exitCode = await main();
