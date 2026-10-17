import { createServer } from "node:http";
import type { SavePackage } from "@openlife/contracts";
import { mkdir, readFile, rename } from "node:fs/promises";
import { describeSaveFailure, renameIntoPlace, type SaveHealth } from "./src/save-health.ts";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "@openlife/simulation";
import { runAutoSim, untilActorArchived, untilTick, type AutoSimContext } from "@openlife/autonomy-runtime";
import { formatYear } from "@openlife/life-contracts";
import {
  reading as clockReading,
  readingAtTick as clockReadingAt,
  ageAt,
} from "@openlife/module-world-clock";
import { Life } from "@openlife/module-settlement-life";
import { SettlementCommands } from "@openlife/module-settlement-locations";
import { StoryCommands, StoryProjections } from "@openlife/module-village-stories";
import { isSettlementAction } from "./src/actions.ts";
import { residentId, rollOrigin, originCatalog } from "@openlife/module-settlement-locations";
import {
  playerView,
  playerActions,
  runPlayerAction,
  settlementView,
  runSettlementAction,
  loansHeldBy,
  rejected,
} from "./src/player.ts";
import { worldCatalog } from "./src/catalog.ts";
import { codex } from "./src/codex.ts";
import { humanizeEvent } from "./src/humanize.ts";
import { ensureNature, runNatureAction, withNature } from "./src/nature.ts";
import { startHistory, historyDay, historySeason } from "./src/history-bridge.ts";import { webModules } from "./src/modules.ts";
const PORT = Number(process.env.PORT ?? 4173);
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
/** Which opening a brand-new life uses: the M1 settlement, or the older slice. */
/** 饿肚子会少活动格（新开的人生默认打开；OPENLIFE_HUNGER_TOLL=0 关掉，供只测走动/器物的验收用）。 */
const HUNGER_TOLL = process.env.OPENLIFE_HUNGER_TOLL !== "0";
const START_MODE = process.env.OPENLIFE_START === "pottery" ? "pottery" : "settlement";
const modulePlan = webModules();
const modules = modulePlan.modules;
if (modulePlan.disabled.length + modulePlan.cascaded.length > 0) {
  console.log(`modules off: ${[...modulePlan.disabled, ...modulePlan.cascaded].join(", ")}`);
}
let simulation = createGame();

// ---------------------------------------------------------------------------
// Server-side persistence: the world is autosaved to disk on an interval and
// restored on startup, so a process restart no longer wipes everyone's game.
// The browser-side /api/save + /api/load flow is unchanged.
//
//   OPENLIFE_SAVE_PATH        where the autosave lives
//                             (default: ./data/openlife-save.json next to server.ts)
//   OPENLIFE_SAVE_INTERVAL_MS autosave period, 0 disables the timer
//                             (default: 300000 = 5 minutes)
// ---------------------------------------------------------------------------
const SAVE_PATH =
  process.env.OPENLIFE_SAVE_PATH ??
  fileURLToPath(new URL("./data/openlife-save.json", import.meta.url));
const SAVE_INTERVAL_MS = Number(process.env.OPENLIFE_SAVE_INTERVAL_MS ?? 5 * 60 * 1000);

interface DiskSaveFile {
  version: 1;
  savedAt: string;
  save: SavePackage;
}

let saveHealth: SaveHealth = { state: "off", reason: "", playerReason: "", at: "", path: SAVE_PATH };

/** Write the current world to disk atomically (temp file + rename). Never throws. */
let saveQueue = Promise.resolve();
let persistenceBlocked = false;
function persistNow(reason: string): Promise<void> {
  if (process.env.OPENLIFE_PERSISTENCE === "0" || persistenceBlocked) return Promise.resolve();
  // Serialised: the queue must survive a failed write, or one bad snapshot would
  // stop every later autosave for the rest of the process's life.
  saveQueue = saveQueue.then(() => writeSnapshot(reason), () => writeSnapshot(reason));
  return saveQueue;
}

async function writeSnapshot(reason: string): Promise<void> {
  try {
    const save: SavePackage = simulation.save({ label: `autosave:${reason}` });
    const payload: DiskSaveFile = {
      version: 1,
      savedAt: new Date().toISOString(),
      save,
    };
    await mkdir(dirname(SAVE_PATH), { recursive: true });
    await renameIntoPlace(`${SAVE_PATH}.${process.pid}.tmp`, SAVE_PATH, JSON.stringify(payload));
    saveHealth = { state: "ok", reason, playerReason: "", at: payload.savedAt, path: SAVE_PATH };
  } catch (error) {
    const message = (error as Error).message;
    saveHealth = {
      state: "failed",
      // Keep the first failure reason: later retries repeat it and would hide the cause.
      reason: saveHealth.state === "failed" ? saveHealth.reason : message,
      playerReason: saveHealth.state === "failed" ? saveHealth.playerReason : describeSaveFailure(error),
      at: new Date().toISOString(), path: SAVE_PATH,
    };
    console.error(`[openlife] autosave failed (${reason}):`, message);
  }
}

/** Load the world from the last autosave, if one exists and is valid. */
async function restoreFromDisk(): Promise<boolean> {
  if (process.env.OPENLIFE_PERSISTENCE === "0") return false;
  let raw: string;
  try {
    raw = await readFile(SAVE_PATH, "utf8");
  } catch (error) {
    // ENOTDIR (a parent is a file) is "no save here" too; the first write reports it.
    if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      persistenceBlocked = true;
      saveHealth = { state: "failed", reason: (error as Error).message,
        playerReason: "磁盘上的存档读不出来，这个世界暂时不会写盘。",
        at: new Date().toISOString(), path: SAVE_PATH };
      console.error("[openlife] could not read autosave file:", (error as Error).message);
    }
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DiskSaveFile>;
    if (!parsed || parsed.version !== 1 || typeof parsed.save !== "object" || parsed.save === null) {
      await preserveRejectedSave();
      console.error("[openlife] autosave file is malformed, starting a fresh world");
      return false;
    }
    const loaded = Simulation.load(parsed.save as SavePackage, modules);
    if (!loaded.result.ok || !loaded.simulation) {
      await preserveRejectedSave();
      console.error(
        "[openlife] autosave is incompatible, starting a fresh world:",
        loaded.result.errors?.[0]?.message ?? "unknown error",
      );
      return false;
    }
    simulation = loaded.simulation;
    // A world restored from a good snapshot already has one safe copy on disk.
    saveHealth = { state: "ok", reason: "restore", playerReason: "", at: String(parsed.savedAt ?? ""), path: SAVE_PATH };
    ensureNature(simulation);
    console.log(
      `[openlife] restored world from ${SAVE_PATH} (saved at ${parsed.savedAt ?? "unknown"})`,
    );
    return true;
  } catch (error) {
    await preserveRejectedSave();
    console.error(
      "[openlife] autosave restore failed, starting a fresh world:",
      (error as Error).message,
    );
    return false;
  }
}

async function preserveRejectedSave(): Promise<void> {
  try { await rename(SAVE_PATH, `${SAVE_PATH}.rejected-${Date.now()}`); }
  catch { persistenceBlocked = true; }
  // A refused save means this world is running without a recoverable copy.
  saveHealth = { state: "failed", reason: "the previous disk save could not be read and was renamed aside",
    playerReason: "上一份磁盘存档读不出来，已改名保留；这个世界暂时没有可恢复的快照。",
    at: new Date().toISOString(), path: SAVE_PATH };
}

/** Start the periodic autosave timer and flush-on-shutdown hooks. */
function startAutosave(): void {
  if (process.env.OPENLIFE_PERSISTENCE === "0") return;
  if (Number.isFinite(SAVE_INTERVAL_MS) && SAVE_INTERVAL_MS > 0 && SAVE_INTERVAL_MS <= 2147483647) {
    const timer = setInterval(() => {
      void persistNow("interval");
    }, SAVE_INTERVAL_MS);
    timer.unref?.();
    console.log(
      `[openlife] autosave every ${Math.round(SAVE_INTERVAL_MS / 1000)}s -> ${SAVE_PATH}`,
    );
  } else {
    console.log("[openlife] periodic autosave disabled (OPENLIFE_SAVE_INTERVAL_MS<=0)");
  }
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void persistNow("shutdown").finally(() => process.exit(0)); });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

interface NewLifeOptions {
  seed?: number;
  givenName?: string;
  familyName?: string;
  cityId?: string;
  /** 出身 id, or "random" to let the seed decide; omitted = no origin (older behaviour). */
  originId?: string;
  talents?: string[];
}

export function createGame(options: NewLifeOptions = {}): Simulation {
  const seed = Number.isFinite(options.seed) ? Number(options.seed) >>> 0 : 104;
  const givenName = cleanName(options.givenName, "启");
  const familyName = cleanName(options.familyName, "禾");
  const cityId = options.cityId === "modern:city:south"
    ? "modern:city:south"
    : "modern:city:north";

  const sim = new Simulation({ worldSeed: seed, modules });
  requireOk(sim.dispatch({ type: "modern.initialize_world", source: "system" }));
  requireOk(sim.dispatch({
    type: "modern.create_character",
    payload: {
      givenName,
      familyName,
      cityId,
      startingCash: 0,
      lifespan: 84,
      lineageId: "family:lineage:1",
    },
    source: "system",
  }));
  // The character starts at 16 years old, measured in the world's own scale:
  // sixteen day-scale years, not sixteen month-scale ticks.
  sim.advanceBy(ageInWorldYears(sim, 16));
  const actorId = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);

  // Two openings share one world definition. The settlement is the M1 default;
  // the earlier pottery slice stays available so its saves keep working.
  if (START_MODE === "pottery") {
    requireOk(runPlayerAction(sim, actorId, "life-enter"));
    return sim;
  }
  requireOk(sim.dispatch({ type: "settlement-locations.found", payload: { hungerToll: HUNGER_TOLL }, source: "system" }));
  ensureNature(sim); startHistory(sim);
  requireOk(sim.dispatch({
    type: "settlement-locations.arrive",
    actorId,
    payload: { placeId: "place:yard" },
    source: "system",
  }));
  if (options.originId) {
    const choice = options.originId === "random" ? rollOrigin(seed)
      : { originId: options.originId, talents: (options.talents ?? []).slice(0, 2) };
    const chosen = sim.dispatch({ type: SettlementCommands.chooseOrigin, actorId, source: "player", payload: choice });
    if (!chosen.ok) throw new HttpError(400, chosen.errors[0]?.message ?? "出身选择无效");
  }
  return sim;
}

function cleanName(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24);
  return cleaned || fallback;
}
function requireOk(result: { ok: boolean; errors: { message: string }[] }): void {
  if (!result.ok) throw new Error(result.errors[0]?.message ?? "command failed");
}

function activeCharacterId(): string {
  return String(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "",
  );
}

function activeCharacter() {
  const id = activeCharacterId();
  return id ? simulation.worldView().getEntity(id) : undefined;
}

function ageOf(entity: ReturnType<typeof activeCharacter>): number {
  if (!entity) return 0;
  const bornAt = Number(entity.components["modern.identity"]?.bornAt ?? entity.createdAt);
  // M1.2-B: age comes from the world clock's declared scale, not from a local
  // division. At the day scale a 360-tick-old character is one year old.
  return ageAt(simulation.worldView(), bornAt, simulation.tick);
}

/**
 * How many kernel ticks `years` is worth in this world.
 *
 * Every scheduling decision in this file uses it, so "one year" means the same
 * thing to the opening, the fast-forward and the settlement alike. The answer
 * comes from the world's own reading, so a legacy month-scale world still gets
 * twelve ticks per year while a day-scale world gets 360.
 */
function ticksPerWorldYear(sim: Simulation): number {
  const read = clockReading(sim.worldView());
  return read.legacyScale ? read.monthsPerYear : read.dayTicksPerYear;
}

function ageInWorldYears(sim: Simulation, years: number): number {
  return Math.round(years * ticksPerWorldYear(sim));
}

function entityName(entityId: string): string {
  const entity = simulation.worldView().getEntity(entityId);
  if (!entity) return "Unknown";
  const identity = entity.components["modern.identity"] ?? {};
  const givenName = String(identity.givenName ?? "");
  const familyName = String(identity.familyName ?? "");
  const visibleFamilyName = ["Partner", "Acquaintance"].includes(familyName) ? "" : familyName;
  return [givenName, visibleFamilyName].filter(Boolean).join(" ")
    || String(identity.name ?? entityId);
}

function gameState() {
  simulation.syncHistory();
  const world = simulation.worldView();
  const character = activeCharacter();
  const characterId = character?.id ?? "";
  const identity = character?.components["modern.identity"] ?? {};
  const vitals = character?.components["modern.vitals"] ?? {};
  const learning = character?.components["early-civilization.learning"] ?? {};
  const role = character?.components["early-civilization.role"] ?? {};
  const legacy = character?.components["early-civilization.legacy"] ?? {};
  const age = ageOf(character);
  const lineageId = String(identity.lineageId ?? "family:lineage:1");
  const lineageProjection = simulation.project({ id: "family.lineage", params: { lineageId } });
  const eraProjection = simulation.project({ id: "early-civilization.overview", params: {} });
  const scienceProjection = simulation.project({ id: "modern-science.civilization", params: {} });
  const footprintProjection = characterId
    ? simulation.project({ id: "historical-memory.subject_footprint", params: { subjectId: characterId } })
    : { ok: false, data: undefined };
  const memoryOverviewProjection = simulation.project({
    id: "historical-memory.public_overview",
    params: {},
  });
  const notableSubjectsProjection = simulation.project({
    id: "historical-memory.notable_subjects",
    params: {},
  });
  const intellectualOverviewProjection = simulation.project({
    id: "intellectual-history.overview",
    params: {},
  });
  const historicalEraProjection = simulation.project({
    id: "historical-era.current",
    params: {},
  });
  const historicalAnchorsProjection = simulation.project({
    id: "historical-anchors.public",
    params: {},
  });
  const proposedIdeaId = characterId
    ? world.listRelations({ type: "intellectual-history.proposed_by", to: characterId })[0]?.from ?? ""
    : "";
  const activeIdeaProjection = proposedIdeaId
    ? simulation.project({ id: "intellectual-history.idea", params: { ideaId: proposedIdeaId } })
    : { ok: false, data: undefined };
  const eventById = new Map(simulation.history.view().listEvents().map((event) => [event.id, event]));
  const history = simulation.history.listRecords().slice(-18).reverse();

  const relations = world
    .listRelations({ from: characterId })
    .filter((relation) =>
      ["family.friend_of", "family.married_to", "family.parent_of"].includes(relation.type),
    )
    .map((relation) => ({
      id: relation.id,
      type: relation.type,
      targetId: relation.to,
      targetName: entityName(relation.to),
    }));

  const spouse = relations.find((relation) => relation.type === "family.married_to");
  const children = relations.filter((relation) => relation.type === "family.parent_of");
  const friends = relations.filter((relation) => relation.type === "family.friend_of");
  const uninitiatedFriend = proposedIdeaId
    ? friends.find((friend) =>
        world.listRelations({
          type: "intellectual-history.embraces",
          from: friend.targetId,
          to: proposedIdeaId,
        }).length === 0
      )
    : undefined;
  const schoolId = proposedIdeaId
    ? world.listRelations({ type: "intellectual-history.centers_on", to: proposedIdeaId })[0]?.from ?? ""
    : "";
  const residenceId = String(character?.components["modern.residence"]?.cityId ?? "modern:city:north");
  const ideaInfluencesResidence = proposedIdeaId
    ? world.listRelations({
        type: "intellectual-history.influences",
        from: proposedIdeaId,
        to: residenceId,
      }).length > 0
    : false;
  const adherentCount = Number(activeIdeaProjection.data?.adherentCount ?? 0);
  const thoughtStage = !proposedIdeaId
    ? "form"
    : uninitiatedFriend
      ? "share"
      : adherentCount >= 2 && !schoolId
        ? "school"
        : schoolId && !ideaInfluencesResidence
          ? "influence"
          : adherentCount < 2
            ? "need-friend"
            : "established";
  const alive = character?.archivedAt === undefined && vitals.alive !== false;

  // M1.2-B: every time reading comes from the world clock, which owns the
  // world's declared scale. The server no longer divides the tick by 12 itself,
  // which is what made the era advance 30 years per year.
  const clock = clockReading(world);

  return {
    tick: simulation.tick,
    year: clock.eraYear,
    month: clock.monthOfYear,
    era: formatYear(clock.eraYear),
    day: clock.dayOfMonth,
    scale: clock.scale,
    generation: Number(world.getComponent("modern:world", "modern.world_state")?.generation ?? 1),
    character: character ? {
      id: character.id,
      name: [identity.givenName, identity.familyName].filter(Boolean).join(" ") || character.id,
      age,
      alive,
      healthWord: vitals.health === 0 ? "生命已结束" : age < 18 ? "正在成长" : age < 60 ? "身体尚稳" : "步入晚年",
      city: entityName(String(character.components["modern.residence"]?.cityId ?? "modern:city:north")),
      learning: learning.path ? String(learning.path) : "尚未开始系统学习",
      role: role.title ? String(role.title) : "尚未承担聚落角色",
      family: spouse ? `与 ${spouse.targetName} 相伴` : "尚未建立家庭",
      children: children.map((child) => ({ id: child.targetId, name: child.targetName })),
      legacy: legacy.title ? String(legacy.title) : null,
      historicalFootprint: footprintProjection.ok
        ? String(footprintProjection.data?.state ?? "forgotten")
        : "forgotten",
      thought: activeIdeaProjection.ok
        ? {
            id: proposedIdeaId,
            title: String(activeIdeaProjection.data?.title ?? "无名思想"),
            thesis: String(activeIdeaProjection.data?.thesis ?? ""),
            adherentCount,
            schoolCount: Number(activeIdeaProjection.data?.schoolCount ?? 0),
            influenceCount: Number(activeIdeaProjection.data?.influenceCount ?? 0),
            stage: thoughtStage,
          }
        : null,
    } : null,
    relations,
    lineage: lineageProjection.ok ? lineageProjection.data : { lineageId, members: [], chronicle: [] },
    history: history.map((record) => {
      // A record's tick is read at the world's declared scale, so a record
      // written before the scale changed keeps reading as it did then.
      const recordReading = clockReadingAt(world, record.at);
      return {
        id: record.id,
        type: record.type,
        at: record.at,
        year: recordReading.eraYear,
        era: formatYear(recordReading.eraYear),
        summary: humanizeEvent(record.type, eventById.get(record.eventId)?.data),
        significance: record.significance,
        archived: Boolean(record.subjectArchived),
      };
    }),
    world: {
      people: world.countEntities("modern.character"),
      communities: world.listEntities({ kind: "modern.city" }).length,
      records: simulation.history.records.length,
      pulse: historicalEraProjection.ok
        ? {
            label: `${String(historicalEraProjection.data?.label ?? "夏")} · 世界仍在变化`,
            note: String(
              historicalEraProjection.data?.summary
              ?? eraProjection.data?.pulseNote
              ?? "亲族与技艺维系着共同体。",
            ),
            eraLabel: String(historicalEraProjection.data?.label ?? "夏"),
          }
        : eraProjection.ok
          ? {
              label: String(eraProjection.data?.pulseLabel ?? "聚落缓慢生长"),
              note: String(eraProjection.data?.pulseNote ?? "亲族与技艺维系着共同体。"),
              eraLabel: String(eraProjection.data?.eraLabel ?? "夏初"),
            }
          : { label: "聚落缓慢生长", note: "亲族与技艺维系着共同体。", eraLabel: "夏初" },
      eraContext: historicalEraProjection.ok
        ? historicalEraProjection.data
        : null,
      historicalAnchors: historicalAnchorsProjection.ok
        ? historicalAnchorsProjection.data
        : { people: [] },
      science: scienceProjection.ok
        ? scienceProjection.data
        : { knownCount: 0, established: [], frontierCount: 0 },
      historicalMemory: memoryOverviewProjection.ok
        ? memoryOverviewProjection.data
        : {
            visibleWorkCount: 0,
            fragmentaryWorkCount: 0,
            contestedWorkCount: 0,
            anonymousWorkCount: 0,
            works: [],
          },
      notablePeople: notableSubjectsProjection.ok && Array.isArray(notableSubjectsProjection.data?.subjects)
        ? notableSubjectsProjection.data.subjects.slice(0, 3).map((subject: Record<string, unknown>) => ({
            id: String(subject.subjectId ?? ""),
            name: entityName(String(subject.subjectId ?? "")),
            state: String(subject.state ?? "remembered"),
            score: Number(subject.score ?? 0),
          }))
        : [],
      intellectual: intellectualOverviewProjection.ok
        ? intellectualOverviewProjection.data
        : { traditions: [], schoolCount: 0 },
    },
    player: {
      ...playerView(simulation, characterId),
      /** Borrowed objects and their due dates, so the UI can offer a return. */
      settlementLoans: characterId ? loansHeldBy(simulation, characterId) : [],
    },
    settlement: withNature(simulation, settlementView(simulation, characterId), characterId),
    stories: storiesView(characterId),
    guide: guideView(characterId),
    originCatalog: originCatalog(),
    clock: clockReading(world),
    /** SAVE-01: whether this world's last disk write actually succeeded. */
    saveHealth,
    actions: world.getComponent(characterId, Life.state)
      ? playerActions(simulation, characterId)
      : [...playerActions(simulation, characterId), ...buildActions({ age, alive, learning, role, legacy, spouse, thoughtStage })],
  };
}

/**
 * The prose lines the world wrote while one action ran (who said what, what the
 * work brought), limited to events that involve the player. The lines are
 * stored in the event data by the rules that produced them, so the same state
 * and command always tell the same story.
 */
function narrativeSince(seq: number, playerId: string): string[] {
  return simulation.kernel.internals.eventLog.since(seq)
    .filter((event) => (event.actorId === playerId || event.targetId === playerId) && typeof event.data?.line === "string")
    .map((event) => String(event.data.line))
    .slice(0, 6);
}

/** Quests, dialogue trees, festival, events, today's incident and achievements (village-stories). */
function storiesView(characterId: string) {
  if (!characterId || !simulation.worldView().getEntity("settlement-locations:settlement:river-terrace")) return null;
  const projected = simulation.project({ id: StoryProjections.journal, params: { actorId: characterId } });
  return projected.ok ? projected.data : null;
}

/** 今日指引: what matters now, what to do next, and what tomorrow holds. */
function guideView(characterId: string) {
  if (!characterId || !simulation.worldView().getEntity("settlement-locations:settlement:river-terrace")) return null;
  const projected = simulation.project({ id: StoryProjections.guide, params: { actorId: characterId } });
  return projected.ok ? projected.data : null;
}

/** Story actions are plain validated commands; none of them moves the clock. */
const STORY_ACTIONS = new Set<string>(Object.values(StoryCommands));

function buildActions(input: {
  age: number;
  alive: boolean;
  learning: Record<string, unknown>;
  role: Record<string, unknown>;
  legacy: Record<string, unknown>;
  spouse: { targetName: string } | undefined;
  thoughtStage: string;
}) {
  const actions = [
    { id: "advance-year", label: "让一年流逝", tone: "quiet", enabled: input.alive },
    {
      id: "learn",
      label: input.learning.path ? "继续从生活中学习" : "跟着长辈与生活学习",
      tone: "warm",
      enabled: input.alive && input.age >= 6 && !input.learning.path,
    },
    { id: "friend", label: "去周围找人搭话", tone: "soft", enabled: false, reason: "需在周围遇见真实村民，然后面对面交流。" },
    {
      id: "role",
      label: input.role.title ? "承担今天的役事" : "承担聚落里的角色",
      tone: "blue",
      enabled: input.alive && input.age >= 14 && !input.role.title,
    },
    {
      id: "marry",
      label: input.spouse ? "陪伴家人" : "建立伴侣关系",
      tone: "rose",
      enabled: input.alive && input.age >= 18 && !input.spouse,
    },
    {
      id: "child",
      label: "迎接一个孩子",
      tone: "gold",
      enabled: input.alive && input.age >= 18 && Boolean(input.spouse),
    },
    {
      id: "legacy",
      label: "留下一门手艺与经验",
      tone: "ink",
      enabled: input.alive && Boolean(input.role.title) && !input.legacy.title,
    },
    { id: "next-generation", label: "继续下一代的人生", tone: "gold", enabled: !input.alive },
  ];

  if (input.alive && input.age >= 16 && Boolean(input.role.title)) {
    const thoughtCopy = {
      form: ["整理一种对生活的看法", true],
      share: ["把这套想法讲给朋友", true],
      school: ["让追随者形成一个学派", true],
      influence: ["让这套思想影响聚落", true],
      "need-friend": ["先认识愿意听你说话的人", false],
      established: ["这套思想正在继续流传", false],
    }[input.thoughtStage] ?? ["整理一种对生活的看法", true];
    actions.splice(actions.length - 2, 0, {
      id: "thought",
      label: String(thoughtCopy[0]),
      tone: "soft",
      enabled: Boolean(thoughtCopy[1]),
    });
  }

  return actions;
}

function runAction(action: string, payload: Record<string, unknown> = {}) {
  const id = activeCharacterId();
  // Bare object/space verbs from the browser pass isSettlementAction (src/actions.ts); player.ts maps them.
  if (STORY_ACTIONS.has(action)) return simulation.dispatch({ type: action, actorId: id, source: "player", payload: payload as never });
  // Nature/hazard actions (feeding an animal, taming it, raising earthworks)
  // come from the nature view rather than the settlement one, so they are
  // dispatched before the settlement registry is consulted.
  if (action.startsWith("nature.")) return runNatureAction(simulation, id, action, payload);
  if (isSettlementAction(action)) {
    const request = runSettlementAction(simulation, id, action, payload);
    if (request.ok && action === SettlementCommands.playerBarterRequest) {
      // The player's request is NOT the cook's consent: run a separate
      // NPC-owned command, with full validation of both concrete items.
      return simulation.dispatch({
        type: SettlementCommands.cookBarterQuote,
        actorId: residentId("cook"), source: "ai",
        payload: { customerId: id, fuelId: payload.fuelId },
      });
    }
    return request;
  }
  if (action.startsWith("life-") || action.startsWith("pottery-")) return runPlayerAction(simulation, id, action, payload);
  // The settlement guard below reasons about *choices*, so time-advance actions
  // must be handled first: both the pottery slice and the settlement need to let
  // time pass, and neither should depend on which opening is active.
  switch (action) {
    case "advance-year":
      // "A year" is one world year, in whatever scale the world declares.
      if (simulation.worldView().getEntity("settlement-locations:settlement:river-terrace") &&
          !simulation.worldView().getComponent(id, Life.state))
        return rejected("活跃聚落不能直接跳过一整年；请按天推进，让村民的真实生活同步发生。");
      simulation.advanceBy(ageInWorldYears(simulation, 1));
      return { ok: true, errors: [] };
    default:
      break;
  }
  if (simulation.worldView().getComponent(id, Life.state)) return rejected("请使用当前聚落生活里的选择。");
  switch (action) {
    case "learn":
      return simulation.dispatch({ type: "early-civilization.begin_learning", actorId: id });
    case "friend":
      return { ok: false, errors: [{ code: "E_REAL_ENCOUNTER_REQUIRED", message: "不能点一下直接成为朋友，请先与附近村民搭话。" }] };
    case "role":
      return simulation.dispatch({ type: "early-civilization.take_role", actorId: id });
    case "marry":
      return simulation.dispatch({ type: "family.marry", actorId: id, payload: { spouseName: "予" } });
    case "child":
      return simulation.dispatch({
        type: "family.have_child",
        actorId: id,
        payload: { givenName: ["兰", "禾", "启"][simulation.tick % 3] },
      });
    case "legacy":
      return simulation.dispatch({ type: "early-civilization.leave_legacy", actorId: id });
    case "thought":
      return runThoughtAction(id);
    case "next-generation":
      return simulation.dispatch({ type: "modern.switch_generation" });
    default:
      return { ok: false, errors: [{ code: "E_UNKNOWN_UI_ACTION", message: `unknown action: ${action}` }] };
  }
}
function runThoughtAction(actorId: string) {
  const world = simulation.worldView();
  const proposedIdeaId = world.listRelations({
    type: "intellectual-history.proposed_by",
    to: actorId,
  })[0]?.from ?? "";

  if (!proposedIdeaId) {
    const role = world.getComponent(actorId, "early-civilization.role") ?? {};
    const template = thoughtTemplate(String(role.roleId ?? ""));
    return simulation.dispatch({
      type: "intellectual-history.propose_idea",
      actorId,
      payload: {
        ...template,
        medium: "oral",
        preservationIntervalTicks: 40 * ticksPerWorldYear(simulation),
      },
    });
  }

  const friends = world
    .listRelations({ type: "family.friend_of", from: actorId })
    .map((relation) => relation.to);
  const uninitiatedFriend = friends.find((friendId) =>
    world.listRelations({
      type: "intellectual-history.embraces",
      from: friendId,
      to: proposedIdeaId,
    }).length === 0
  );
  if (uninitiatedFriend) {
    return simulation.dispatch({
      type: "intellectual-history.teach_idea",
      actorId,
      targetId: uninitiatedFriend,
      payload: {
        ideaId: proposedIdeaId,
        medium: "oral",
        preservationIntervalTicks: 40 * ticksPerWorldYear(simulation),
      },
    });
  }

  const adherentCount = world.listRelations({
    type: "intellectual-history.embraces",
    to: proposedIdeaId,
  }).length;
  const schoolId = world.listRelations({
    type: "intellectual-history.centers_on",
    to: proposedIdeaId,
  })[0]?.from ?? "";

  if (adherentCount >= 2 && !schoolId) {
    const idea = world.getComponent(proposedIdeaId, "intellectual-history.idea") ?? {};
    return simulation.dispatch({
      type: "intellectual-history.form_school",
      actorId,
      payload: {
        ideaId: proposedIdeaId,
        name: `${String(idea.title ?? "共同之道")}之学`,
      },
    });
  }

  const residenceId = String(
    world.getComponent(actorId, "modern.residence")?.cityId ?? "modern:city:north",
  );
  const alreadyInfluences = world.listRelations({
    type: "intellectual-history.influences",
    from: proposedIdeaId,
    to: residenceId,
  }).length > 0;
  if (schoolId && !alreadyInfluences) {
    return simulation.dispatch({
      type: "intellectual-history.apply_idea",
      actorId,
      targetId: residenceId,
      payload: { ideaId: proposedIdeaId, strength: 0.65 },
    });
  }

  return {
    ok: false,
    errors: [{
      code: "E_THOUGHT_WAITING",
      message: adherentCount < 2
        ? "先认识一个愿意听你讲述的人"
        : "这套思想已经在共同体里继续流传",
    }],
  };
}

function thoughtTemplate(roleId: string) {
  switch (roleId) {
    case "craftsperson":
      return {
        title: "传艺之道",
        thesis: "技艺若只停在一个人手里，便会随生命一起消失。",
        principles: ["手艺应当传给后来者", "经验需要反复验证", "留下方法比留下名声更重要"],
      };
    case "cultivator":
      return {
        title: "共耕之约",
        thesis: "共同承担季节与收获，能让聚落比单独劳作更稳。",
        principles: ["共同承担风险", "收获需要顾及来年", "有余力时帮助同伴"],
      };
    case "forager":
      return {
        title: "取用有度",
        thesis: "今天从自然中取得的东西，也应给明天留下余地。",
        principles: ["不过度索取", "记住季节变化", "把路径与经验告诉后来者"],
      };
    default:
      return {
        title: "共议之道",
        thesis: "共同体的事情，应让承担后果的人有机会说出自己的看法。",
        principles: ["先听不同意见", "共同决定共同承担", "约定可以根据现实修正"],
      };
  }
}

/**
 * M2-UX1: a short, bounded slice of continuous waiting.
 * The browser requests another slice only while its Start control is active.
 * Existing AutoSim drives the authoritative clock; no server background job.
 */
/**
 * An explicit player's routine, committed via existing world commands.
 * At most five days/six actions per day per request, no background worker.
 * A stop on a failed action keeps its cursor so it cannot silently skip work.
 */
function plannedTimeBatch(days: number) {
  const actorId = activeCharacterId();
  const startTick = simulation.tick;
  const actions: string[] = [];
  const fail = (reason: string) => ({
    ok: true, steps: simulation.tick - startTick, days: simulation.tick - startTick,
    interrupted: true, stopReason: reason, actions,
  });
  for (let day = 0; day < days; day += 1) {
    const actor = activeCharacter();
    if (!actor || actor.archivedAt !== undefined ||
        actor.components["modern.vitals"]?.alive === false ||
        activeCharacterId() !== actorId) return fail("人物已离开或控制权发生变化。");
    if (playerView(simulation, actorId).practice) return fail("制陶工序等待你亲自决定。");
    let view = settlementView(simulation, actorId);
    if (!view?.dailyPlan?.steps.length || !view.dailyPlan.enabled) {
      return fail("日程未启用，请先保存并启用日程。");
    }
    const planned = view.dailyPlan;
    for (let index = planned.progressIndex; index < planned.steps.length; index += 1) {
      view = settlementView(simulation, actorId);
      if (!view) return fail("人物不在聚落中。");
      const step = planned.steps[index];
      let command: string;
      let payload: Record<string, unknown> = { planIndex: index, planStep: step };
      if (step === "eat") {
        const ration = view.objects?.find((item: { prototypeId: string; placement: string }) =>
          item.prototypeId === "prototype:cooked-food" && item.placement === "在手中");
        const food = view.yields?.find((point: { resourceId: string; stock: number }) =>
          ["resource:cooked", "resource:grain"].includes(point.resourceId) && point.stock > 0);
        if (ration) payload = { ...payload, objectId: ration.id, resourceId: "resource:cooked" };
        else if (food) payload = { ...payload, resourceId: food.resourceId, placeId: view.placeId };
        else return fail("日程暂停：附近无可食用粮食，也没有随身熟食。");
        command = SettlementCommands.eat;
      } else if (step === "tend") {
        const work = view.actions?.find((action: { id: string; enabled: boolean }) =>
          action.id === SettlementCommands.tend && action.enabled);
        if (!work) return fail("日程暂停：当前位置无法进行安排的劳动，或今天活动额度不足。");
        payload = { ...payload, spaceId: view.spaceId };
        command = SettlementCommands.tend;
      } else if (step === "pottery") {
        if (view.placeId !== "place:kiln" || view.spaceId !== "space:kiln-mouth") {
          return fail("制陶日程暂停：需要先到共用陶窑的窑口。");
        }
        if (view.dailyActivity.remaining < 2) return fail("制陶日程暂停：今天不足两格活动时间。");
        if (playerView(simulation, actorId).practice) return fail("已有制陶工序，需你亲自处理。");
        const carried = view.objects?.filter((item: { placement: string }) => item.placement === "在手中") ?? [];
        const clay = carried.find((item: { prototypeId: string }) => item.prototypeId === "prototype:clay-batch");
        const fuel = carried.filter((item: { prototypeId: string }) => item.prototypeId === "prototype:fuel-bundle").slice(0, 2);
        const stock = simulation.worldView().getComponent(actorId, "craft-pottery.inventory");
        if (!(Number(stock?.clay ?? 0) >= 1 && Number(stock?.fuel ?? 0) >= 2)) {
          if (!clay || fuel.length !== 2) {
            return fail("制陶日程暂停：需要携带自己采集的 1 份黏土和 2 捆柴草，才能备料开工。");
          }
          const staged = simulation.dispatch({
            type: "craft-pottery.load_village_materials", actorId, source: "autosim",
            payload: { clayId: clay.id, fuelIds: fuel.map((item: { id: string }) => item.id) },
          });
          if (!staged.ok) return fail(`制陶备料失败：${staged.errors?.[0]?.message ?? "材料不可用"}`);
        }
        const started = simulation.dispatch({
          type: "practice-runtime.start", actorId, source: "autosim",
          payload: {
            planIndex: index, planStep: "pottery",
            definitionId: "craft-pottery.make-vessel",
            goal: "用聚落中的真实材料制作陶器",
            role: "potter", decisionMode: "manual",
            context: { clay: { moisture: 0.76, impurities: 0.55, uniformity: 0.45,
              plasticity: 0.72, materialMass: 1, hasSieve: false, hasDryClay: false } },
          },
        });
        if (!started.ok) return fail(`制陶开工失败：${started.errors?.[0]?.message ?? "条件不足"}`);
        actions.push("pottery");
        // The village lives through this day inside the engine (M4-B).
        simulation.advanceBy(1);
        return fail("制陶已开工，泥料处理有重要选择需要你亲自决定。请在手艺面板完成当前工序。");
      } else if (step === "rest") {
        const matRest = view.actions?.find((action: { id: string; enabled: boolean; payload: { matId?: string } }) =>
          action.id === SettlementCommands.rest && action.enabled && Boolean(action.payload.matId));
        payload = { ...payload, spaceId: view.spaceId,
          ...(matRest?.payload.matId ? { matId: matRest.payload.matId } : {}) };
        command = SettlementCommands.rest;
      } else if (["go-hearth", "go-field", "go-kiln", "go-home"].includes(step)) {
        const placeByStep: Record<string, string> = {
          "go-hearth": "place:hearth-yard", "go-field": "place:field",
          "go-kiln": "place:kiln", "go-home": "place:yard",
        };
        const destination = placeByStep[step];
        if (view.placeId === destination) return fail("日程暂停：你已在计划的地点，请修改或跳过重复移动。");
        payload = { ...payload, placeId: destination, travelMode: "local" };
        command = SettlementCommands.arrive;
      } else return fail("日程包含不支持的行动，请重新编辑。");
      const outcome = runSettlementAction(simulation, actorId, command, payload, "autosim");
      if (!outcome.ok) return fail(`日程暂停：${outcome.errors?.[0]?.message ?? "该行动无法完成"}`);
      actions.push(step);
    }
    const afterPlan = settlementView(simulation, actorId)?.dailyPlan;
    if (!afterPlan?.enabled) return fail("一次性日程已完成，控制权交还给你。");
    const advanced = continuousTimeBatch(1);
    if (advanced.ok === false) return fail(advanced.errors?.[0]?.message ?? "世界时间无法推进。");
    if (advanced.interrupted) return fail(advanced.stopReason ?? "有重要事件需要你处理。");
  }
  return { ok: true, steps: simulation.tick - startTick, days: simulation.tick - startTick,
    interrupted: false, actions };
}

function continuousTimeBatch(days: number) {
  const actorId = activeCharacterId();
  const world = simulation.worldView();
  if (clockReading(world).legacyScale) {
    return { ok: false, errors: [{ code: "E_AUTOSIM_LEGACY", message: "旧版月刻度人生请使用原有的年度推进。" }] };
  }
  const actor = world.getEntity(actorId);
  if (!actor || actor.archivedAt !== undefined || actor.components["modern.vitals"]?.alive === false) {
    return { ok: true, steps: 0, days: 0, interrupted: true, stopReason: "这一生已经结束。" };
  }
  if (playerView(simulation, actorId).practice) {
    return { ok: true, steps: 0, days: 0, interrupted: true, stopReason: "制陶工序正在等待你亲自作决定。" };
  }
  const hunger = Number(settlementView(simulation, actorId)?.hunger ?? 0);
  if (hunger >= 10) {
    return { ok: true, steps: 0, days: 0, interrupted: true, stopReason: "饥饿已达到极限，需要你安排食物。" };
  }

  const startTick = simulation.tick;
  const startAge = ageOf(actor);
  const boundedDays = Math.max(1, Math.min(5, Math.trunc(days)));
  let interruption = "";
  const result = runAutoSim({
    kernel: simulation.kernel,
    actorId,
    provider: { id: "web.continuous-passive", decide: () => [] },
    projection: ({ tick }) => ({ tick, actorId }),
    advanceTicksPerStep: 1,
    maxCommands: 10,
    stopConditions: [
      untilActorArchived(actorId),
      {
        id: "continuous-player-attention",
        isSatisfied: (ctx: AutoSimContext) => {
          if (ctx.steps === 0) return false;
          const nextWorld = ctx.kernel.worldView();
          const nextActor = nextWorld.getEntity(actorId);
          if (activeCharacterId() !== actorId) {
            interruption = "当前操控人物已改变，自动推进已停止。";
          } else if (!nextActor || nextActor.archivedAt !== undefined
              || nextActor.components["modern.vitals"]?.alive === false) {
            interruption = "这一生已经结束。";
          } else if (playerView(simulation, actorId).practice) {
            interruption = "有制陶工序需要你的决定。";
          } else if (Number(settlementView(simulation, actorId)?.hunger ?? 0) >= 10) {
            interruption = "饥饿已达到极限，需要你安排食物。";
          } else {
            const nextAge = ageAt(nextWorld,
              Number(nextActor.components["modern.identity"]?.bornAt ?? nextActor.createdAt), nextWorld.tick);
            const milestone = [6, 14, 16, 18].find((year) => startAge < year && nextAge >= year);
            if (milestone !== undefined) interruption = `人物已满 ${milestone} 岁，有新的成长选择值得留意。`;
          }
          return Boolean(interruption);
        },
      },
      untilTick(startTick + boundedDays),
    ],
  });
  simulation.syncHistory();
  const interrupted = Boolean(interruption) ||
    simulation.worldView().getEntity(actorId)?.archivedAt !== undefined;
  return {
    ok: result.ok, steps: result.steps, days: simulation.tick - startTick,
    interrupted,
    ...(interrupted ? { stopReason: interruption || "这一生已经结束。" } : {}),
    errors: [],
  };
}

function autoSim(mode: string) {
  if (simulation.worldView().getComponent(activeCharacterId(), Life.state)) {
    const p = playerView(simulation, activeCharacterId());
    if (p.practice) return rejected("手中的陶器正在等待你的决定，先完成这段手艺。");
    const start = simulation.tick;
    if (mode === "year") simulation.advanceBy(ageInWorldYears(simulation, 1));
    else {
      const children = p.children.filter((child: { alive: boolean; age: number }) => child.alive && child.age < 18);
      const youngestAdultTick = children.length ? Math.min(...children.map((child: { id: string }) => {
        const e = simulation.worldView().getEntity(child.id);
        return Number(e?.components["modern.identity"]?.bornAt ?? start) + ageInWorldYears(simulation, 18);
      })) : start + ageInWorldYears(simulation, 1);
      simulation.advanceTo(Math.min(start + ageInWorldYears(simulation, 20), youngestAdultTick));
    }
    return { ok: true, steps: (simulation.tick - start) / ticksPerWorldYear(simulation), errors: [] };
  }
  const actorId = activeCharacterId();
  const startTick = simulation.tick;
  const maxTick = startTick + ageInWorldYears(simulation, 40);
  const provider = {
    id: "web.passive-autosim",
    decide: () => [],
  };

  const stopConditions = mode === "year"
    ? [untilTick(startTick + ageInWorldYears(simulation, 1))]
    : [
        untilActorArchived(actorId),
        {
          id: "player-life-milestone",
          description: "reached a player life milestone",
          isSatisfied: (ctx: AutoSimContext) =>
            ctx.steps > 0
            && (hasPlayerMilestone(ctx.kernel.worldView(), actorId) || ctx.kernel.tick >= maxTick),
        },
      ];

  const result = runAutoSim({
    kernel: simulation.kernel,
    actorId,
    provider,
    projection: ({ actorId: projectedActorId }) => {
      const character = simulation.kernel.worldView().getEntity(projectedActorId);
      return {
        tick: simulation.kernel.tick,
        alive: character?.archivedAt === undefined,
      };
    },
    stopConditions,
    advanceTicksPerStep: ticksPerWorldYear(simulation),
    maxCommands: 40,
  });
  simulation.syncHistory();
  return result;
}

function hasPlayerMilestone(
  world: ReturnType<Simulation["worldView"]>,
  actorId: string,
): boolean {
  const character = world.getEntity(actorId);
  if (!character || character.archivedAt !== undefined) return true;

  const identity = character.components["modern.identity"] ?? {};
  const bornAt = Number(identity.bornAt ?? character.createdAt);
  // Age in the world's own scale, so an autosim milestone fires at a real
  // milestone age rather than 30x too early.
  const age = ageAt(world, bornAt, world.tick);

  const learning = character.components["early-civilization.learning"] ?? {};
  const role = character.components["early-civilization.role"] ?? {};
  const hasSpouse = world.listRelations({ type: "family.married_to", from: actorId }).length > 0;
  const hasProposedIdea = world.listRelations({
    type: "intellectual-history.proposed_by",
    to: actorId,
  }).length > 0;

  return (
    (age >= 6 && !learning.path)
    || (age >= 14 && !role.title)
    || (age >= 16 && Boolean(role.title) && !hasProposedIdea)
    || (age >= 18 && !hasSpouse)
  );
}

function saveSummary() {
  const state = gameState();
  return {
    year: state.year,
    month: state.month,
    generation: state.generation,
    character: state.character
      ? {
          name: state.character.name,
          age: state.character.age,
          alive: state.character.alive,
        }
      : null,
    records: state.world.records,
  };
}

/** A client error with an HTTP status; anything else is a 500. */
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Largest request body accepted (a long life's save is a few MB). */
const MAX_BODY_BYTES = Number(process.env.OPENLIFE_MAX_BODY_BYTES ?? 32 * 1024 * 1024);
const API_ROUTES: Record<string, string> = {
  "/api/catalog": "GET", "/api/codex": "GET", "/api/state": "GET", "/api/action": "POST", "/api/autosim": "POST",
  "/api/save": "POST", "/api/load": "POST", "/api/reset": "POST",
};

const server = createServer(async (req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      const method = API_ROUTES[url.pathname];
      if (method && req.method !== method) {
        res.setHeader("allow", method);
        throw new HttpError(405, `${url.pathname} 只接受 ${method}`);
      }
      if (req.method === "POST" && !String(req.headers["content-type"] ?? "application/json").includes("json")) {
        throw new HttpError(415, "请求体必须是 JSON");
      }
      if (req.method === "GET" && url.pathname === "/api/catalog") {
        res.end(JSON.stringify(await worldCatalog(simulation)));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/codex") {
        res.end(JSON.stringify(codex(simulation, activeCharacterId())));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        res.end(JSON.stringify(gameState()));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/action") {
        const body = await readJson(req);
        if ((body.expectedTick !== undefined && body.expectedTick !== simulation.tick)
          || (body.expectedActorId !== undefined && body.expectedActorId !== activeCharacterId())
          || (body.expectedActivityUsed !== undefined
            && body.expectedActivityUsed !== settlementView(simulation, activeCharacterId())?.dailyActivity?.used)
          || (body.expectedPlanRevision !== undefined
            && body.expectedPlanRevision !== settlementView(simulation, activeCharacterId())?.dailyPlan?.revision)) {
          res.statusCode = 409;
          res.end(JSON.stringify({ error: "时间或人物已经改变，已刷新当前生活，请重新选择。" }));
          return;
        }
        const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {};
        const action = String(body.action ?? "");
        const manualActorId = activeCharacterId();
        const activePlan = settlementView(simulation, manualActorId)?.dailyPlan;
        const seqBefore = simulation.kernel.internals.eventLog.nextSeq - 1;
        const hopeBefore = settlementView(simulation, manualActorId)?.aspiration?.done;
        const result = runAction(action, payload);
        // Manual action wins over a previously authorized routine. Suspend it
        // only after a successful action, never as a side effect of a refusal.
        if (result.ok && action !== SettlementCommands.configurePlan && activePlan?.enabled) {
          runSettlementAction(simulation, manualActorId, SettlementCommands.configurePlan, {
            steps: activePlan.steps, repeat: activePlan.repeat, enabled: false,
          });
        }
        simulation.syncHistory();
        historyDay(simulation);   // 喂给历史实验室；装不上就什么也不做
        if (action === SettlementCommands.step) historySeason(simulation);
        const narrative = narrativeSince(seqBefore, manualActorId);
        const hopeAfter = settlementView(simulation, manualActorId)?.aspiration;
        if (hopeBefore === false && hopeAfter?.done) narrative.push(hopeAfter.line);
        res.end(JSON.stringify({ result, narrative, state: gameState() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/autosim") {
        const body = await readJson(req);
        if (body.mode === "continuous-batch") {
          if (body.expectedTick !== simulation.tick || body.expectedActorId !== activeCharacterId()
            || (body.expectedPlanRevision !== undefined
              && body.expectedPlanRevision !== settlementView(simulation, activeCharacterId())?.dailyPlan?.revision)) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: "世界或人物已变化，请刷新后重新开始。" }));
            return;
          }
          const days = Number(body.days);
          if (!Number.isInteger(days) || days < 1 || days > 5) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "每批只能推进 1–5 个游戏日。" }));
            return;
          }
          const planned = settlementView(simulation, activeCharacterId())?.dailyPlan?.enabled === true;
          const result = planned ? plannedTimeBatch(days) : continuousTimeBatch(days);
          res.end(JSON.stringify({ result, state: gameState() }));
          return;
        }
        const result = autoSim(String(body.mode ?? "milestone"));
        simulation.syncHistory();
        res.end(JSON.stringify({ result, state: gameState() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/save") {
        const body = await readJson(req);
        const label = typeof body.label === "string" ? body.label : undefined;
        const save = simulation.save(label ? { label } : {});
        res.end(JSON.stringify({ save, summary: saveSummary() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/load") {
        const body = await readJson(req);
        if (!body.save || typeof body.save !== "object") {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "缺少有效的 OpenLife 存档" }));
          return;
        }
        let loaded: ReturnType<typeof Simulation.load>;
        try { loaded = Simulation.load(body.save as SavePackage, modules); }
        catch { throw new HttpError(400, "存档已损坏或不是 OpenLife 存档"); }
        if (!loaded.result.ok || !loaded.simulation) {
          res.statusCode = 409;
          res.end(JSON.stringify({
            error: loaded.result.errors[0]?.message ?? "这个记忆现在无法恢复",
            result: loaded.result,
          }));
          return;
        }
        simulation = loaded.simulation;
        ensureNature(simulation);
        await persistNow("load");
        res.end(JSON.stringify({ result: loaded.result, state: gameState() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/reset") {
        const body = await readJson(req);
        const seed = Number(body.seed ?? 104);
        if (!Number.isSafeInteger(seed) || seed < 0) throw new HttpError(400, "种子必须是非负整数");
        const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 24) || undefined : undefined;
        simulation = createGame({
          seed,
          givenName: text(body.givenName),
          familyName: text(body.familyName),
          cityId: text(body.cityId),
          originId: text(body.originId),
          talents: Array.isArray(body.talents) ? body.talents.map(String).slice(0, 2) : undefined,
        });
        await persistNow("reset");
        res.end(JSON.stringify({ state: gameState() }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "静态文件只接受 GET");
    let requested: string;
    try { requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); }
    catch { throw new HttpError(400, "无效的路径"); }
    // Resolve inside public/ and refuse anything that escapes it.
    const root = resolve(PUBLIC_DIR);
    const file = resolve(root, "." + requested);
    if (requested.includes("\u0000") || (file !== root && !file.startsWith(root + sep))) throw new HttpError(404, "not found");
    let data: Buffer;
    try { data = await readFile(file); }
    catch { throw new HttpError(404, "not found"); }
    res.setHeader("content-type", contentType(extname(file)));
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) {
      res.statusCode = status;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    // A 500 never echoes internals (file paths, stack text) to the page.
    res.end(JSON.stringify({ error: status === 500 ? "服务器内部错误" : (error as Error).message }));
  }
});

// Local by default; set HOST=0.0.0.0 to play from another device on your LAN.
const HOST = process.env.HOST ?? "127.0.0.1";
await restoreFromDisk();
server.listen(PORT, HOST, () => {
  startAutosave();
  const address = server.address();
  console.log(`OpenLife web running at http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${typeof address === "object" && address ? address.port : PORT}`);
});

async function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "请求体过大");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "请求体过大");
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "请求体不是有效的 JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "请求体必须是 JSON 对象");
  return parsed as Record<string, unknown>;
}

function contentType(ext: string): string {
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}
