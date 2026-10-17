/**
 * 叙事者 `story-director`（docs/plans/EXPANSION_PLAN_2026-10.md §5.1）。
 *
 * 为什么需要它：现在的村子靠固定概率抽年景，玩家不知道"为什么今天没事"，
 * 也不知道"什么时候该有事"。叙事者把这件事变成一个能看见、能讲清楚的曲线：
 * 平静会积累张力，张力决定今天可能出哪一档，出过事之后松一口气。
 *
 * 边界（PLUGINS.md §1.3）：
 *  - 只写自己命名空间下的 `story-director.state`；
 *  - 别人的状态一律按名字读组件，读不到就当没有，绝不直接写；
 *  - 灾情/怨气只是**输入**，不是它产生的东西；
 *  - 所有随机走调用方给的 rng，同种子同指令 = 同结果。
 *
 * 关掉它：`story-director.*` 的定义全部失活，世界回到原来的固定概率抽取，
 * 已有的存档数据标为 ORPHANED 保留，重新装回来还能接着算。
 */
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  DIRECTOR_TUNING, MODES, STORY_MODES, bandFor, clampTension, dailyTension,
  likeliestTier, reliefAfter, rollLanding, statusLine, tensionGain, tierSignificance,
  type Landing, type Rng, type StoryMode, type StoryTier, type TensionInputs,
} from "./director.ts";
import { BEATS, beatById, beatsOf } from "./beats.ts";

export const DIRECTOR_OWNER = "story-director";
export const DIRECTOR_CAPABILITY = "story.director";

/** 状态放在一个固定实体上：它是"这个村子的节拍"，不属于任何一个人。 */
export const DIRECTOR_ENTITY = "story-director:state";

export const DirectorComponents = {
  state: "story-director.state",
} as const;

export const DirectorCommands = {
  setMode: "story-director.set_mode",
  tick: "story-director.tick",
} as const;

export const DirectorProjections = {
  status: "story-director.status",
} as const;

export const DirectorEvents = {
  beat: "story-director.event",
  modeSet: "story-director.mode_set",
} as const;

export const DirectorRejection = {
  NoMode: "E_DIRECTOR_NO_MODE",
  NotSet: "E_DIRECTOR_NOT_SET",
} as const;

/** recent 里的一项：只说"出了哪一档、哪一件事"，不含任何人。 */
export interface RecentBeat {
  tier: StoryTier;
  beatId: string;
  at: number;
}

/** 待办：内容层的 followUp 落在这里，到日子优先于新事件。 */
export interface PendingBeat {
  beatId: string;
  tier: StoryTier;
  dueAt: number;
}

export interface DirectorState {
  tension: number;
  /** 连续没有 conflict/crisis 的天数。ambient 不算"有事"，它只是背景音。 */
  calmDays: number;
  recent: RecentBeat[];
  pending: PendingBeat[];
  mode: StoryMode;
  /** 上一个投放事件的时刻；没有过就是 -1。 */
  lastEventAt: number;
  /** 上一个 crisis 的时刻；没有过就是 -1。 */
  lastCrisisAt: number;
  updatedAt: number;
  /** 今天投放的那一件（投影要用；过了今天就清空）。 */
  today: RecentBeat | null;
  /** 今天为什么是这个张力，给"讲得清楚"用（§16）。 */
  causes: string[];
}

export const DEFAULT_DIRECTOR_STATE: DirectorState = {
  tension: DIRECTOR_TUNING.start,
  calmDays: 0,
  recent: [],
  pending: [],
  mode: "rhythmic",
  lastEventAt: -1,
  lastCrisisAt: -1,
  updatedAt: -1,
  today: null,
  causes: [],
};

/** 叙事者对外能回答的两个问题（能力 `story.director`）。 */
export interface DirectorApi {
  state(world: WorldView): DirectorState;
  /** 此刻如果掷一次，最可能出哪一档；不消耗随机数，不改状态。 */
  nextTier(world: WorldView): StoryTier;
}

function readState(world: WorldView): DirectorState {
  const raw = world.getComponent(DIRECTOR_ENTITY, DirectorComponents.state);
  if (!raw) return { ...DEFAULT_DIRECTOR_STATE, recent: [], pending: [] };
  return {
    tension: clampTension(Number(raw.tension ?? DEFAULT_DIRECTOR_STATE.tension)),
    calmDays: Math.max(0, Number(raw.calmDays ?? 0)),
    recent: Array.isArray(raw.recent) ? (raw.recent as unknown as RecentBeat[]).slice(-DIRECTOR_TUNING.recentLimit) : [],
    pending: Array.isArray(raw.pending) ? (raw.pending as unknown as PendingBeat[]).slice(0, DIRECTOR_TUNING.pendingLimit) : [],
    mode: STORY_MODES.includes(raw.mode as StoryMode) ? (raw.mode as StoryMode) : DEFAULT_DIRECTOR_STATE.mode,
    lastEventAt: Number(raw.lastEventAt ?? -1),
    lastCrisisAt: Number(raw.lastCrisisAt ?? -1),
    updatedAt: Number(raw.updatedAt ?? -1),
    today: raw.today && typeof raw.today === "object" ? (raw.today as unknown as RecentBeat) : null,
    causes: Array.isArray(raw.causes) ? raw.causes.map(String) : [],
  };
}

/**
 * 从世界读出张力输入。
 *
 * 全部按组件名读、读不到就降级：world-hazard 没装就没有灾情，
 * social-conflict 没装就没有怨气，聚落没装就不知道存粮——叙事者照样能转，
 * 只是它的曲线更平。这是软依赖该有的样子。
 */
export function readInputs(world: WorldView): TensionInputs & { population: number; grainStock: number | null } {
  let hazard: TensionInputs["hazard"] = "none";
  let grievanceTotal = 0;
  let feuds = 0;
  let grainStock: number | null = null;
  let residents = 0;

  for (const entity of world.listEntities()) {
    if (entity.archivedAt !== undefined) continue;
    const hazardState = entity.components["world-hazard.state"];
    if (hazardState) {
      for (const kind of ["flood", "drought"] as const) {
        const track = hazardState[kind];
        if (!track || typeof track !== "object") continue;
        const stage = (track as Record<string, JsonValue>).stage;
        if (stage === "active") hazard = "active";
        else if (stage === "omen" && hazard === "none") hazard = "omen";
      }
    }
    const grievances = entity.components["social-conflict.grievances"];
    const book = grievances?.byTarget;
    if (book && typeof book === "object") {
      for (const one of Object.values(book as Record<string, JsonValue>)) {
        if (!one || typeof one !== "object") continue;
        const record = one as Record<string, JsonValue>;
        grievanceTotal += Math.max(0, Number(record.intensity ?? 0));
        if (record.stage === "feud" || record.stage === "vendetta") feuds += 1;
      }
    }
    const yieldState = entity.components["settlement-locations.yield"];
    if (yieldState && yieldState.resourceId === "resource:grain") {
      grainStock = (grainStock ?? 0) + Math.max(0, Number(yieldState.stock ?? 0));
    }
    if (entity.kind === "modern.character"
      && entity.components["settlement-locations.resident"]
      && entity.components["modern.vitals"]?.alive !== false) residents += 1;
  }

  // 存粮按"每人每天一份"折算天数；没有聚落数据时留 null，表示看不出来。
  const population = Math.max(1, residents);
  const foodDays = grainStock === null ? null : grainStock / population;
  return { hazard, foodDays, grievanceTotal, feuds, population: residents, grainStock };
}

/** 挑一件该档位的节拍；最近 10 天用过的先跳过，避免同一件事反复上门。 */
export function chooseBeat(
  tier: StoryTier,
  recent: readonly RecentBeat[],
  tick: number,
  rng: Rng,
): { beatId: string; line: string } {
  const pool = beatsOf(tier);
  const fresh = pool.filter((b) => !recent.some((r) => r.beatId === b.id && tick - r.at < 10));
  const list = fresh.length ? fresh : pool;
  const beat = list[rng.nextInt(0, list.length)] ?? BEATS[0]!;
  return { beatId: beat.id, line: beat.line };
}

function applyLanding(
  previous: DirectorState,
  landing: Landing,
  tick: number,
  rng: Rng,
): { state: DirectorState; effects: Effect[]; chosen: { beatId: string; line: string } } {
  const chosen = chooseBeat(landing.tier, previous.recent, tick, rng);
  const entry: RecentBeat = { tier: landing.tier, beatId: chosen.beatId, at: tick };
  const recent = [...previous.recent, entry].slice(-DIRECTOR_TUNING.recentLimit);
  const isHeavy = landing.tier === "conflict" || landing.tier === "crisis";
  const next: DirectorState = {
    ...previous,
    // 危机让整根弦松下来；冲突只卸掉一部分，根还在（见 reliefAfter）。
    tension: reliefAfter(previous.mode, landing.tier, previous.tension, rng),
    calmDays: isHeavy ? 0 : previous.calmDays,
    recent,
    lastEventAt: tick,
    lastCrisisAt: landing.tier === "crisis" ? tick : previous.lastCrisisAt,
    updatedAt: tick,
    today: entry,
    causes: previous.causes,
  };
  const effects: Effect[] = [{
    kind: "emitEvent",
    eventType: DirectorEvents.beat,
    data: {
      tier: landing.tier,
      beatId: chosen.beatId,
      line: chosen.line,
      tension: next.tension,
      forced: landing.forced,
    },
    historicalSignificance: tierSignificance(landing.tier),
  }];
  return { state: next, effects, chosen };
}

/** 状态写回：第一次写要建实体，之后只改值。 */
function writeState(world: WorldView, state: DirectorState): Effect {
  const value = structuredClone(state) as unknown as Record<string, JsonValue>;
  return world.getComponent(DIRECTOR_ENTITY, DirectorComponents.state)
    ? { kind: "setComponent", entityId: DIRECTOR_ENTITY, component: DirectorComponents.state, value, reason: "story director advanced" }
    : {
      kind: "spawnEntity",
      localId: "director",
      id: DIRECTOR_ENTITY,
      entityKind: "story-director.state",
      components: { [DirectorComponents.state]: value },
      announce: false,
    };
}

export const storyDirectorModule: OpenLifeModule = {
  manifest: {
    id: DIRECTOR_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "叙事者",
    description: "Tension-driven pacing: calm days build pressure, pressure decides which tier of event may land, heavy beats force a breath.",
    provides: [DIRECTOR_CAPABILITY],
    requires: [],
    optional: ["world.hazard-state", "social.conflict"],
    incompatible: [],
    capabilities: [
      "component.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const api: DirectorApi = {
      state: (world) => readState(world),
      nextTier: (world) => likeliestTier(bandFor(readState(world).tension), readState(world).mode),
    };
    ctx.provideCapability(DIRECTOR_CAPABILITY, api);

    ctx.registerComponent({
      id: DirectorComponents.state,
      persist: true,
      description: "村里的节拍：张力、平静天数、最近的事、待办、模式。",
    });

    ctx.registerCommand({
      type: DirectorCommands.setMode,
      description: "选叙事节奏：gentle 细水长流 / rhythmic 起起落落 / chaotic 天意难测。",
      params: { mode: "gentle | rhythmic | chaotic" },
    });
    ctx.registerCommand({
      type: DirectorCommands.tick,
      description: "过一天：张力涨一点，必要时投放一件事（由调用方每天 dispatch）。",
      params: { followUp: "可选：排进待办的后续事件" },
    });

    // ---- set_mode ---------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${DirectorCommands.setMode}.allowed`,
      commandType: DirectorCommands.setMode,
      evaluate: (c) => {
        const mode = String(c.command.payload.mode ?? "");
        if (!STORY_MODES.includes(mode as StoryMode)) {
          return { ok: false, code: DirectorRejection.NoMode, message: "模式只有 gentle、rhythmic、chaotic 三种。" };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${DirectorCommands.setMode}.resolve`,
      commandType: DirectorCommands.setMode,
      resolve: (c): Effect[] => {
        const previous = readState(c.world);
        const mode = String(c.command.payload.mode) as StoryMode;
        const next: DirectorState = { ...previous, mode, updatedAt: c.world.tick };
        return [
          writeState(c.world, next),
          {
            kind: "emitEvent",
            eventType: DirectorEvents.modeSet,
            data: { mode, label: MODES[mode].label },
            historicalSignificance: 0,
          },
        ];
      },
    });

    // ---- tick -------------------------------------------------------------
    ctx.registerResolutionRule({
      id: `${DirectorCommands.tick}.resolve`,
      commandType: DirectorCommands.tick,
      resolve: (c): Effect[] => {
        const rng = c.rng as unknown as Rng;
        const tick = c.world.tick;
        let previous = readState(c.world);

        // 调用方可以把内容层的 followUp 排进来（延迟后果）。
        const queued = Array.isArray(c.command.payload.followUp)
          ? (c.command.payload.followUp as unknown as Array<{ beatId?: unknown; tier?: unknown; afterDays?: unknown }>)
          : [];
        if (queued.length) {
          const added: PendingBeat[] = [];
          for (const item of queued) {
            const beatId = String(item.beatId ?? "");
            const tier = String(item.tier ?? "") as StoryTier;
            if (!beatId || !beatById(beatId)) continue;
            added.push({ beatId, tier: beatById(beatId)!.tier, dueAt: tick + Math.max(0, Number(item.afterDays ?? 0)) });
          }
          if (added.length) {
            previous = {
              ...previous,
              pending: [...previous.pending, ...added].slice(-DIRECTOR_TUNING.pendingLimit),
            };
          }
        }

        // 同一 tick 重复 tick 没有意义：状态已经是今天的样子了。
        if (previous.updatedAt === tick && previous.today) return [];

        const inputs = readInputs(c.world);
        const daily = dailyTension(previous.tension, inputs, previous.mode);
        const base: DirectorState = {
          ...previous,
          tension: daily.tension,
          causes: daily.causes,
          updatedAt: tick,
          // 昨天的"今天那件事"到今天就只是历史了。
          today: previous.today && previous.today.at === tick ? previous.today : null,
          calmDays: previous.calmDays + 1,
        };

        // 后续事件优先于新事件：到日子的待办先兑现，今天就不再掷新的。
        const due = base.pending.find((p) => p.dueAt <= tick);
        if (due) {
          const rest = base.pending.filter((p) => p !== due);
          const landing: Landing = { tier: due.tier, forced: false };
          const applied = applyLanding({ ...base, pending: rest }, landing, tick, rng);
          return [...applied.effects, writeState(c.world, applied.state)];
        }

        const daysSinceEvent = base.lastEventAt < 0 ? Number.POSITIVE_INFINITY : tick - base.lastEventAt;
        const daysSinceCrisis = base.lastCrisisAt < 0 ? Number.POSITIVE_INFINITY : tick - base.lastCrisisAt;
        const landing = rollLanding(
          { tension: base.tension, mode: base.mode, daysSinceEvent, daysSinceCrisis },
          rng,
        );
        if (!landing) return [writeState(c.world, base)];

        const applied = applyLanding(base, landing, tick, rng);
        // 平静天数在出事那天归零（重的事才归零，见 applyLanding）。
        return [...applied.effects, writeState(c.world, applied.state)];
      },
    });

    // ---- 投影 -------------------------------------------------------------
    ctx.registerProjection({
      id: DirectorProjections.status,
      description: "村里的气氛、节奏与下一件事大概是什么档。不含任何人的名字。",
      build: ({ world }) => {
        const state = readState(world);
        const band = bandFor(state.tension);
        const next = likeliestTier(band, state.mode);
        return {
          mode: state.mode,
          modeLabel: MODES[state.mode].label,
          tension: state.tension,
          calmDays: state.calmDays,
          nextTier: next,
          /** 下一件大事大概几天内会来：不是承诺，是"按现在的曲线"的估计。 */
          nextWithinDays: estimateGap(state),
          today: state.today,
          recent: state.recent,
          pending: state.pending.length,
          causes: state.causes,
          line: statusLine(state.tension, state.mode, state.calmDays),
        };
      },
    });
  },
};

/**
 * 下一件事大概还有几天。
 *
 * 用"每天涨多少"反推：张力到 25/60/85 各要几天。这比给一个随机数诚实——
 * 玩家看到的是曲线，不是预言。
 */
export function estimateGap(state: DirectorState): number {
  if (state.tension > 85) return 0;
  const thresholds = state.tension < 25 ? [25, 60, 85] : state.tension < 60 ? [60, 85] : [85];
  const target = thresholds[0] ?? 85;
  // 涨速随张力变（tensionGain），所以按天一步一步走，而不是一次除法。
  let tension = state.tension;
  for (let day = 1; day <= 60; day += 1) {
    tension += tensionGain(tension, state.mode);
    if (tension >= target) return day;
  }
  return 60;
}
