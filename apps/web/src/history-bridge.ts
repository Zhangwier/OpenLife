/**
 * 把历史实验室接进逐日的河岸台地。
 *
 * 之前是两个平行的世界：
 *  - 网页版里你按天过日子（settlement-locations 一天一步）
 *  - `npm run chronicle` 里村子按年演化（village-chronicle 一年一步）
 * 它们互不认识，所以网页版永远到不了「铁器与王国」。
 *
 * 原则是**不复制一套模拟**：网页版真实的每日/每季事件就是历史实验室的输入。
 *
 *   建村时        → heredity.found（每人一副基因组）、tech.found（村子开始记事）
 *   每天          → 新居民补登记（tech.enroll）
 *   每季          → tech.season（一季的思考与试做）+ 需要簿 + 观察
 *   老死/离村     → tech.person_gone（只有他知道的东西失传）
 *
 * 放在独立文件而不是 server.ts：后者被 source-size 棘轮冻结在 1376 行。
 * 全部是**可选**的：模块没装就跳过那一步。
 */

/**
 * 河岸台地能采到的东西，对应科技树认的材料名。
 *
 * 这是一个真实的系统断层：`modules/tech` 的发明表假设村子有木料、石头、绳、
 * 盐、铜矿……而河岸台地只有黏土、芦苇、柴、谷、水。11 项发明卡在
 * `resource:timber` 上，永远不可能出现——不是概率低，是材料永远凑不齐。
 *
 * 映射的原则是**按用途等价**，不是按名字硬凑：
 *  - 芦苇在河岸就是木料与绳的替代品（编绳、搭架、铺顶都用它）
 *  - 河边卵石与黏土烧成的陶，替代石料
 *  - 柴就是燃料
 * 这张表写在桥接层而不是改科技表，因为科技表是给整个游戏用的（以后别的地图
 * 会有真的木料），而"河岸台地有什么"是这个世界的属性。
 */
const MATERIAL_ALIASES: Record<string, string[]> = {
  "resource:timber": ["resource:reed", "resource:fuel"],
  "resource:rope": ["resource:reed"],
  "resource:stone": ["resource:clay"],
  "resource:fuel": ["resource:fuel"],
  "resource:clay": ["resource:clay"],
};

/** Map the village's real yields onto the material names the tech tree uses. */
export function materialsForTech(world: ReturnType<Simulation["worldView"]>): string[] {
  const have = new Set(
    world.listEntities({ kind: "settlement-locations.yield-point" })
      .filter((e) => e.archivedAt === undefined && Number(e.components[SettlementComponents.yieldPoint]?.stock ?? 0) > 0)
      .map((e) => String(e.components[SettlementComponents.yieldPoint]?.resourceId ?? ""))
      .filter(Boolean),
  );
  const out = new Set(have);
  for (const [needed, substitutes] of Object.entries(MATERIAL_ALIASES)) {
    if (out.has(needed)) continue;
    if (substitutes.some((s) => have.has(s))) out.add(needed);
  }
  return [...out];
}

import type { Simulation } from "@openlife/simulation";
import { SettlementComponents, SettlementId } from "@openlife/module-settlement-locations";
import { AGE_OF } from "@openlife/module-settlement-locations";
import { DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";

/** The tech module's singleton village entity. */
const TECH_VILLAGE = "tech:village";
/** The era ladder's singleton state entity. */
const ERA_ENTITY = "era:ladder";
/** The polity module's singleton village entity. */
const POLITY_ENTITY = "polity:village";

interface VillageRecord {
  members?: string[];
  invented?: Record<string, unknown>;
  accepted?: Record<string, unknown>;
}

/**
 * The year each world was last told about.
 *
 * `era-ladder.check` and `polity.year` are yearly facts, but the bridge's hook
 * is the season. Keeping the mark on the world (not in this file) means a
 * second world in the same process, or a reload, does not inherit the first
 * one's calendar.
 */
const TOLD_YEAR = new WeakMap<Simulation, number>();

/** Which optional modules this world actually has. */
function installedOf(sim: Simulation): { heredity: boolean; tech: boolean; era: boolean; polity: boolean } {
  // `sim.modules.get(id)` is the kernel's own registry lookup; it returns
  // undefined for a module that was never installed, which is exactly the
  // question being asked. No throwing, no string parsing.
  const registry = (sim as unknown as { modules?: { get?: (id: string) => unknown } }).modules;
  const has = (id: string) => {
    try { return Boolean(registry?.get?.(id)); } catch { return false; }
  };
  return { heredity: has("heredity"), tech: has("tech"), era: has("era-ladder"), polity: has("polity") };
}

/**
 * Fire a command and report whether it landed.
 *
 * Returns the failure reason instead of swallowing it: the first version of
 * this file caught everything silently, which hid a real type error inside
 * `tech.season` for three simulated years. A bridge that fails quietly is worse
 * than no bridge.
 */
/** Dispatch and record the failure, if any. */
function fire(
  sim: Simulation, type: string, payload: Record<string, unknown>, actorId?: string, targetId?: string,
): boolean {
  try {
    const result = sim.dispatch({
      type,
      ...(actorId ? { actorId } : {}),
      ...(targetId ? { targetId } : {}),
      payload,
      source: "system",
    } as never);
    if (result?.ok) return true;
    note(type, result?.errors?.[0]?.message ?? "rejected", sim.tick);
    return false;
  } catch (error) {
    note(type, (error as Error).message, sim.tick);
    return false;
  }
}

/**
 * Every failure this bridge has seen, newest last.
 *
 * Exposed so a test (and a health panel) can assert the bridge is actually
 * working, rather than inferring it from "no exception was thrown". The first
 * version of this file caught everything silently and hid a real type error
 * inside `tech.season` for three simulated years.
 */
const FAILURES: Array<{ type: string; why: string; at: number }> = [];

export function bridgeFailures(): ReadonlyArray<{ type: string; why: string; at: number }> {
  return FAILURES;
}

/** Clears the log; used by tests so each case starts clean. */
export function resetBridgeFailures(): void {
  FAILURES.length = 0;
}

function note(type: string, why: string, at: number): void {
  FAILURES.push({ type, why, at });
  if (FAILURES.length > 50) FAILURES.shift();
}

function residents(sim: Simulation): string[] {
  return sim.worldView()
    .listEntities({ kind: "modern.character" })
    .filter((e) => e.archivedAt === undefined &&
      Boolean(e.components[SettlementComponents.resident]) &&
      e.components["modern.vitals"]?.alive !== false)
    .map((e) => e.id);
}

function villageRecord(sim: Simulation): VillageRecord | undefined {
  return sim.worldView().getComponent(TECH_VILLAGE, "tech.village") as unknown as VillageRecord | undefined;
}

/**
 * Called once, right after the settlement is founded.
 *
 * Gives every existing villager a genome and hands the village to the tech
 * module, so the first day of play already feeds the long history.
 */
export function startHistory(sim: Simulation): void {
  const have = installedOf(sim);
  if (!have.heredity && !have.tech) return;      // a plain settlement world
  const people = residents(sim);

  if (have.heredity) {
    // heredity.found takes `target` (a person id) and an origin.
    for (const id of people) fire(sim, "heredity.found", { origin: "founder" }, undefined, id);
  }
  if (have.tech) {
    // tech.found takes `members` (ids) and `capabilities`; both are read by the
    // resolver, so passing the wrong name silently produces an empty village.
    fire(sim, "tech.found", {
      members: people,
      capabilities: ["fire", "clay", "reed", "water", "stone"],
    });
  }
}

/**
 * Called at the start of every world day.
 *
 * Cheap by design: it only looks for people who are not in the ledger yet
 * (a newborn, a migrant, an old save). Anything expensive belongs in the
 * season hook.
 */
export function historyDay(sim: Simulation): void {
  const have = installedOf(sim);
  if (!have.tech) return;
  const record = villageRecord(sim);
  if (!record) return;
  const known = new Set(record.members ?? []);
  for (const id of residents(sim)) {
    if (known.has(id)) continue;
    // A person the ledger has never seen: give them a genome too, so heredity
    // and tech agree about who exists.
    if (have.heredity) fire(sim, "heredity.found", { origin: "migrant" }, undefined, id);
    fire(sim, "tech.enroll", {}, undefined, id);
  }
  // The dead leave the ledger the day they die, not the day someone remembers
  // to tell the bridge. Reading it off the ledger means a death that happens
  // inside a batch, a load, or an NPC's own day still costs the village what
  // only that person knew.
  for (const id of [...known]) {
    if (sim.worldView().getComponent(id, "modern.vitals")?.alive !== false) continue;
    historyPersonGone(sim, id);
  }
}

/**
 * Called when a season turns over.
 *
 * This is where a real village's year becomes the history lab's year: one
 * season of thinking, trying, copying and believing, driven by the state the
 * player actually lived through.
 */
export function historySeason(sim: Simulation): void {
  const have = installedOf(sim);
  if (!have.tech) return;
  const world = sim.worldView();
  // `busy` is the set of people who had NO leisure this season -- the engine
  // multiplies the spark chance by `busyFactor` for anyone in it. Passing every
  // villager (the obvious reading of "who was busy") suppressed all invention,
  // which is exactly what happened the first time this bridge ran.
  //
  // In a village this size most hands are free most seasons, so the honest
  // answer is the people the settlement marked as working right now.
  const people = residents(sim);
  const working = new Set(
    world.listEntities({ kind: "modern.character" })
      .filter((e) => e.archivedAt === undefined &&
        Number(e.components[SettlementComponents.resident]?.lastRoutineAt ?? -1) === world.tick)
      .map((e) => e.id),
  );
  const busy = [...working];
  const materials = materialsForTech(world);
  fire(sim, "tech.season", { people, busy, materials, community: people.length });

  // Needs raise the spark chance (needFactor up to 3x). The ids must be the ones
  // inventions actually answer -- `need:move-heavy`, `need:lift-water` and so on.
  // Inventing our own names ("need:food") left the factor at `curiosity` 0.15,
  // and the village invented nothing for years while looking perfectly healthy.
  //
  // Each entry is a real pressure the terrace feels: water to lift, loads to
  // carry, grain to keep, floods to hold back.
  const settlement = world.getComponent(SettlementId, SettlementComponents.settlement) as
    Record<string, unknown> | undefined;
  const tolled = settlement?.hungerToll === true;
  const needs: Array<[string, number]> = [
    ["need:lift-water", 3],          // every day starts with carrying water
    ["need:carry-loads", 2],         // reeds, clay and fuel all travel by hand
    ["need:more-grain", tolled ? 3 : 1],
    ["need:keep-records", 1],
  ];
  const roof = world.getComponent(SettlementId, SettlementComponents.roof) as Record<string, unknown> | undefined;
  if (roof && Number(roof.condition ?? 1) < 0.6) needs.push(["need:protect-from-flood", 2]);
  for (const [needId, amount] of needs) fire(sim, "tech.report_need", { needId, amount });

  // Phenomena the village can genuinely see from the terrace.
  for (const phenomenonId of ["river-flood", "season-change", "clay-deposit"]) {
    fire(sim, "tech.observe", { phenomenonId });
  }
  historyYear(sim);
}

/**
 * Once a year: the numbers the era ladder and the polity need.
 *
 * These are yearly commands with no other caller in the web app — the
 * chronicle runner (`modules/village-chronicle/src/run.ts`) drives them in the
 * offline simulation, so until this existed the browser world never left
 * `era:settled-village` and `polity.year` never ran: no prestige, no
 * institutions, no debts, and `historyEra()` read "尚未定名" forever.
 *
 * The two commands take different payloads, and both are taken from what the
 * village actually has this moment rather than from a year-end plan, because in
 * the browser the year ends when the player's seasons do.
 */
function historyYear(sim: Simulation): void {
  const have = installedOf(sim);
  const world = sim.worldView();
  const year = Math.floor(world.tick / DAY_TICKS_PER_YEAR);
  if (TOLD_YEAR.get(sim) === year) return;
  TOLD_YEAR.set(sim, year);

  const alive = residents(sim);
  if (!alive.length) return;
  // Adults are what the polity counts for prestige; the ladder only needs a
  // headcount. Ages come from the same reader the settlement uses, so a person
  // whose `modern.vitals` lacks `ageYears` still counts correctly.
  const adults = alive
    .map((id) => ({ id, age: Math.floor(AGE_OF(world, id)) }))
    .filter((a) => a.age >= 16);

  if (have.polity) {
    if (world.getComponent(POLITY_ENTITY, "polity.state")) {
      const grain = storedFood(world);
      fire(sim, "polity.year", {
        population: alive.length,
        // `polity.year` only asks whether the year was a surplus one
        // (`surplus > 0 ? surplusYears + 1 : 0`), and its institution table
        // reads `surplusYears`. Days of grain is the same answer the granary
        // panel gives, so a village that looks fed in the UI also looks fed
        // to its institutions.
        surplus: grain,
        contacts: reachablePlaces(world),
        adults,
        gone: [],
      });
    } else {
      // `polity.year` refuses with E_POLITY_NO_VILLAGE until the village has a
      // polity record; founding it is one command and changes nothing else.
      fire(sim, "polity.found", {});
    }
  }

  if (have.era) {
    fire(sim, "era-ladder.check", {
      population: alive.length,
      contacts: reachablePlaces(world),
      // The browser world has one settlement; the map packs give it places, not
      // other villages with headcounts. Reporting our own size is the honest
      // answer, and the ladder takes `max(reported, population)` anyway.
      largestSettlement: alive.length,
    });
  }
}

/**
 * How many places outside the village you can actually walk to.
 *
 * This is what "contacts" means for the era ladder in the browser: the offline
 * chronicle has neighbour villages with populations, the browser has a map of
 * places wired by `world-geography.adjacent_to`. A place you cannot reach is not
 * a contact — same rule the travel module uses to build its destination list.
 */
function reachablePlaces(world: ReturnType<Simulation["worldView"]>): number {
  const home = String(world.getComponent(SettlementId, SettlementComponents.settlement)?.placeId ?? "");
  if (!home) return 0;
  const seen = new Set<string>([home]);
  const adjacency = world.listRelations({ type: "world-geography.adjacent_to" });
  // One hop: neighbours of the village, not everywhere on the map. The ladder
  // asks about the village's contacts, not about the size of the world.
  for (const r of adjacency) {
    if (r.from === home && r.to) seen.add(r.to);
    else if (r.to === home && r.from) seen.add(r.from);
  }
  seen.delete(home);
  return [...seen].filter((id) => world.getEntity(id)?.archivedAt === undefined).length;
}

/**
 * Grain on hand, as days the village could eat.
 *
 * Same measure `settlement-goals` uses for `foodDays` (grain stock ÷ heads,
 * one unit per person per day), so the two panels cannot disagree about whether
 * the granary is full. Returns 0 when nothing grows grain — a village with no
 * fields is not in surplus.
 */
function storedFood(world: ReturnType<Simulation["worldView"]>): number {
  let grain = 0;
  for (const entity of world.listEntities()) {
    if (entity.archivedAt !== undefined) continue;
    const point = entity.components[SettlementComponents.yieldPoint];
    if (point?.resourceId !== "resource:grain") continue;
    grain += Math.max(0, Number(point.stock ?? 0));
  }
  return Math.round(grain * 100) / 100;
}

/** Someone died or left: what only they knew is lost. */
export function historyPersonGone(sim: Simulation, personId: string): void {
  if (!installedOf(sim).tech) return;
  fire(sim, "tech.person_gone", {}, undefined, personId);
}

/**
 * The era the village is in, as one readable line.
 *
 * Returns null when era-ladder is absent so the shell can simply not render it.
 */
export function historyEra(sim: Simulation): { era: string; since: number } | null {
  if (!installedOf(sim).era) return null;
  const state = sim.worldView().getComponent(ERA_ENTITY, "era-ladder.state") as
    Record<string, unknown> | undefined;
  if (!state) return { era: "尚未定名", since: 0 };
  return { era: String(state.current ?? "尚未定名"), since: Number(state.since ?? 0) };
}

/** What the village can make, for the codex and the build menu. */
export function knownInventions(sim: Simulation): string[] {
  if (!installedOf(sim).tech) return [];
  return Object.keys(villageRecord(sim)?.invented ?? {}).sort();
}

/** How many accepted theories the village holds. */
export function acceptedTheories(sim: Simulation): string[] {
  if (!installedOf(sim).tech) return [];
  return Object.keys(villageRecord(sim)?.accepted ?? {}).sort();
}

/**
 * The office panel and registry, ready for the browser.
 *
 * Kept here rather than in server.ts (frozen at 1310 lines) and rather than in
 * a new file (one more thing to wire): both are one projection call each, and
 * they belong to the same "what is the village doing" question the bridge
 * already answers. Returns nulls when the office module is absent, so the shell
 * can simply not render the panel.
 */
export function officeViews(sim: Simulation): {
  panel: Record<string, unknown> | null;
  registry: Record<string, unknown> | null;
} {
  const has = (() => {
    const registry = (sim as unknown as { modules?: { get?: (id: string) => unknown } }).modules;
    try { return Boolean(registry?.get?.("office")); } catch { return false; }
  })();
  if (!has) return { panel: null, registry: null };
  const panel = sim.project({ id: "office.panel", params: {} });
  const registry = sim.project({ id: "office.registry", params: {} });
  return {
    panel: panel.ok ? (panel.data as Record<string, unknown>) : null,
    registry: registry.ok ? (registry.data as Record<string, unknown>) : null,
  };
}
