/**
 * 村落成长目标 `settlement-goals`（docs/plans/EXPANSION_PLAN_2026-10.md §5.2）。
 *
 * 定位文档说"没有剧情主线，有一条成长线（村子活下去并长大）"，还说玩家可能
 * 不知道自己该追求什么，**这是必须靠成长线与三档目标补上的**。这个模块就是
 * 那条线：六级阶梯 + 一个失败结局 + 今天/这一季/这一生三档目标。
 *
 * 为什么大部分数字是"算出来的"而不是"记下来的"：人口、房屋、屋顶、存粮、
 * 三代同堂都可以从世界现状推出来。记一份副本就会有两份真相，读档后对不上。
 * 只有世界现状里确实不存在的东西（过了几个冬天、集市来过几次人）才进本模块
 * 自己的状态。
 *
 * 依赖边界（PLUGINS.md §1.3）：
 *  - 只写自己命名空间下的 `settlement-goals.state`；
 *  - 房屋数优先读 `settlement-build` 的组件，没装就用村民的住处兜底（降级）；
 *  - 灾情只是输入，读不到就当没有。
 */
import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { DAYS_PER_MONTH } from "@openlife/life-contracts";
// 屋顶的"漏不漏"由 settlement-locations 折算（它握着天气与修缮的那套规则）。
// 这里读它的公开函数，而不是自己再算一遍：两份算法迟早会给出两个答案。
import { ROOF_LEAKS_AT, roofState } from "@openlife/module-settlement-locations";
import {
  EMPTY_SNAPSHOT, GOALS, GOAL_FAILURE, LADDERS, evaluateGoals, goalProblems,
  type GoalEvaluation, type LadderProgress, type VillageSnapshot,
} from "./goals.ts";

export const GOALS_OWNER = "settlement-goals";
export const GOALS_CAPABILITY = "settlement.goals";
export const GOALS_ENTITY = "settlement-goals:state";

export const GoalComponents = { state: "settlement-goals.state" } as const;

export const GoalCommands = { tick: "settlement-goals.tick" } as const;
export const GoalProjections = { progress: "settlement-goals.progress" } as const;
export const GoalEvents = {
  reached: "settlement-goals.stage_reached",
  failed: "settlement-goals.village_dispersed",
} as const;

/** 只放世界现状里推不出来的东西。 */
export interface GoalsState {
  /** 当前阶梯序号（1..N；N+1 = 走完）。 */
  stage: number;
  /** 已经上报过的阶梯 id，避免同一级反复播报。 */
  reached: string[];
  /** 已经熬过的冬天数（按村子的成立时刻推算，存下来只为了对比增量）。 */
  wintersLived: number;
  /** 连着几个冬天饿死人。 */
  badWinterStreak: number;
  /** 渡口集市主动来过几次人（由调用方上报，绝不凭空产生）。 */
  marketArrivals: number;
  /** 村子散了之后仍然记着，用来显示结局而不重复播报。 */
  dispersed: boolean;
  updatedAt: number;
}

export const DEFAULT_GOALS_STATE: GoalsState = {
  stage: 1,
  reached: [],
  wintersLived: 0,
  badWinterStreak: 0,
  marketArrivals: 0,
  dispersed: false,
  updatedAt: -1,
};

export interface GoalsApi {
  state(world: WorldView): GoalsState;
  snapshot(world: WorldView, state?: GoalsState): VillageSnapshot;
  evaluate(world: WorldView): GoalEvaluation;
}

const SETTLEMENT_ID = "settlement-locations:settlement:river-terrace";
const WINTER_START_MONTH_INDEX = 11; // 12 月
const WINTER_LENGTH_DAYS = DAYS_PER_MONTH * 3; // 12、1、2 三个月

function readState(world: WorldView): GoalsState {
  const raw = world.getComponent(GOALS_ENTITY, GoalComponents.state);
  if (!raw) return { ...DEFAULT_GOALS_STATE, reached: [] };
  return {
    stage: Math.max(1, Number(raw.stage ?? 1)),
    reached: Array.isArray(raw.reached) ? raw.reached.map(String) : [],
    wintersLived: Math.max(0, Number(raw.wintersLived ?? 0)),
    badWinterStreak: Math.max(0, Number(raw.badWinterStreak ?? 0)),
    marketArrivals: Math.max(0, Number(raw.marketArrivals ?? 0)),
    dispersed: raw.dispersed === true,
    updatedAt: Number(raw.updatedAt ?? -1),
  };
}

/**
 * 从建村到今天，冬天过完了几个。
 *
 * 冬天从 12 月 1 日算到次年 2 月底；"熬过一个冬天"= 走过了 3 月 1 日。
 * 只数建村**之后开始**的冬天：建村时已经入冬的那一年不算熬过，否则第一年
 * 冬天刚过一半就算"熬过第一个冬天"，阶梯会白送。
 */
export function wintersLivedSince(foundedAt: number, tick: number): number {
  if (tick <= foundedAt) return 0;
  const yearLength = DAYS_PER_MONTH * 12;
  const startYear = Math.floor(foundedAt / yearLength) - 1;
  const endYear = Math.floor(tick / yearLength) + 1;
  let count = 0;
  for (let year = startYear; year <= endYear; year += 1) {
    const winterStart = year * yearLength + WINTER_START_MONTH_INDEX * DAYS_PER_MONTH;
    const winterEnd = winterStart + WINTER_LENGTH_DAYS;
    // 整个冬天都必须落在建村之后，且已经走完。
    if (winterStart >= foundedAt && winterEnd <= tick) count += 1;
  }
  return count;
}

/** 村里活着的人：有 resident 组件、没被归档、vitals 没写死。 */
function livingResidents(world: WorldView) {
  return world.listEntities({ kind: "modern.character" }).filter((e) =>
    e.archivedAt === undefined
    && Boolean(e.components["settlement-locations.resident"])
    && e.components["modern.vitals"]?.alive !== false);
}

/** 屋顶还挡得住雨的屋子数；没有 roof 组件的住处按"新盖的"算完好。 */
function roofsSound(world: WorldView, homeSpaces: readonly string[]): number | null {
  if (!homeSpaces.length) return null;
  let sound = 0;
  for (const spaceId of homeSpaces) {
    // 磨损是天气的函数，settlement-locations 已经会算；这里只问结论。
    if (!world.getComponent(spaceId, "settlement-locations.roof")) { sound += 1; continue; }
    if (roofState(world, spaceId).condition > ROOF_LEAKS_AT) sound += 1;
  }
  return sound;
}

/** 三代同堂：同一户里活着的人占了三个不同的代。 */
function threeGenHomes(world: WorldView): number {
  const byHousehold = new Map<string, Set<number>>();
  for (const entity of livingResidents(world)) {
    const household = String(entity.components["settlement-locations.resident"]?.household ?? "");
    if (!household) continue;
    const generation = Number(entity.components["modern.identity"]?.generation ?? 1);
    const set = byHousehold.get(household) ?? new Set<number>();
    set.add(generation);
    byHousehold.set(household, set);
  }
  let count = 0;
  for (const generations of byHousehold.values()) if (generations.size >= 3) count += 1;
  return count;
}

/**
 * 世界现状 → 判定用的快照。
 *
 * `null` 一律表示"看不出来"（例如村子还没建），判定按未达成处理。
 */
export function snapshotOf(world: WorldView, state: GoalsState = readState(world)): VillageSnapshot {
  const residents = livingResidents(world);
  const population = residents.length;

  const homeSpaces = [...new Set(residents
    .map((e) => String(e.components["settlement-locations.resident"]?.homeSpace ?? ""))
    .filter(Boolean))];

  // 房屋数：settlement-build 记的是"玩家盖成了几间"，但村子里本来就有人家
  // 住着屋子——两者会重叠（给已有的人家加盖）。取较大的那个，既不把作者写好的
  // 住处算丢，也不会因为没装盖房模块就显示 0 间屋（那会让玩家以为村子退步了）。
  const built = world.getComponent(SETTLEMENT_ID, "settlement-build.homes");
  const builtCount = built ? Math.max(0, Number(built.count ?? 0)) : 0;
  const homes = homeSpaces.length || builtCount ? Math.max(homeSpaces.length, builtCount) : null;

  const settlement = world.getComponent(SETTLEMENT_ID, "settlement-locations.settlement");
  const foundedAt = Number(settlement?.foundedAt ?? 0);

  // 存粮：把所有 grain 产点的存量按人头折算成天数。
  let grain: number | null = null;
  for (const entity of world.listEntities()) {
    if (entity.archivedAt !== undefined) continue;
    const point = entity.components["settlement-locations.yield"];
    if (point && point.resourceId === "resource:grain") grain = (grain ?? 0) + Math.max(0, Number(point.stock ?? 0));
  }
  const foodDays = grain === null || population === 0 ? null : grain / population;

  // 在村里出生并且还活着的人：出生时刻不早于建村。
  const births = residents.filter((e) => Number(e.components["modern.identity"]?.bornAt ?? 0) >= foundedAt && foundedAt > 0).length;

  // 传得最远的那一支：代数取最大值（建村那代算第 1 代）。
  const generations = residents.map((e) => Number(e.components["modern.identity"]?.generation ?? 1));

  let hazard: VillageSnapshot["hazard"] = "none";
  for (const entity of world.listEntities()) {
    if (entity.archivedAt !== undefined) continue;
    const hazardState = entity.components["world-hazard.state"];
    if (!hazardState) continue;
    for (const kind of ["flood", "drought"] as const) {
      const track = hazardState[kind];
      if (!track || typeof track !== "object") continue;
      const stage = (track as Record<string, JsonValue>).stage;
      if (stage === "active") hazard = "active";
      else if (stage === "omen" && hazard === "none") hazard = "omen";
    }
  }

  const starving = residents.filter((e) => Number(e.components["settlement-locations.resident"]?.hunger ?? 0) >= 8).length;

  return {
    ...EMPTY_SNAPSHOT,
    population,
    homes,
    roofsSound: roofsSound(world, homeSpaces),
    foodDays,
    births,
    marketArrivals: state.marketArrivals,
    threeGenHomes: threeGenHomes(world),
    lineageGenerations: generations.length ? Math.max(...generations) : 0,
    wintersLived: Math.max(state.wintersLived, wintersLivedSince(foundedAt, world.tick)),
    consecutiveBadWinters: state.badWinterStreak,
    starving,
    hazard,
  };
}

function writeState(world: WorldView, state: GoalsState): Effect {
  const value = structuredClone(state) as unknown as Record<string, JsonValue>;
  return world.getComponent(GOALS_ENTITY, GoalComponents.state)
    ? { kind: "setComponent", entityId: GOALS_ENTITY, component: GoalComponents.state, value, reason: "village goals re-evaluated" }
    : {
      kind: "spawnEntity",
      localId: "goals",
      id: GOALS_ENTITY,
      entityKind: "settlement-goals.state",
      components: { [GoalComponents.state]: value },
      announce: false,
    };
}

// ---------------------------------------------------------------------------
// 三档目标：今天 / 这一季 / 这一生
// ---------------------------------------------------------------------------

export interface TodayHint {
  id: string;
  /** 优先级高的排前面；界面只取前 maxToday 条。 */
  priority: number;
  text: string;
  /** 对应哪个阶梯条件，方便界面标"这一条是为哪一级准备的"。 */
  goalId: string;
}

/**
 * 今天该干什么：1–3 条最紧迫的事。
 *
 * 只从**看得见的现状**里推：饿、病（缺粮）、灾情、屋顶、屋子不够。
 * 不认识的人不会被点名——这些建议里一个人名都没有。
 */
export function todayHints(snapshot: VillageSnapshot, evaluation: GoalEvaluation): TodayHint[] {
  const hints: TodayHint[] = [];
  const stageGoal = LADDERS[evaluation.stage - 1]?.id ?? "";
  const add = (id: string, priority: number, text: string) => hints.push({ id, priority, text, goalId: stageGoal });

  if (snapshot.starving > 0) add("feed", 100, `有人饿得干不动活了（${snapshot.starving} 人），先去公灶或分点粮。`);
  else if (snapshot.foodDays !== null && snapshot.foodDays < 10) add("feed", 95, `存粮只够 ${Math.floor(snapshot.foodDays)} 天，得想办法补上。`);
  if (snapshot.hazard === "active") add("hazard", 90, "灾情正在眼前，先把人和粮挪到高处。");
  else if (snapshot.hazard === "omen") add("hazard", 70, "有灾前的征兆，趁还没来先做点准备。");
  if (snapshot.roofsSound !== null && snapshot.homes !== null && snapshot.roofsSound < snapshot.homes) {
    add("roof", 60, `有 ${snapshot.homes - snapshot.roofsSound} 间屋子的屋顶撑不住雨了，趁天好修一修。`);
  }
  if (snapshot.foodDays !== null && snapshot.foodDays < 20) add("stock", 55, "存粮撑不到开春，多备一点总没错。");
  const next = evaluation.nextMissing;
  if (next) add("goal", 40, `离「${evaluation.nextName}」还差：${next}。`);

  hints.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return hints.filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true))).slice(0, GOALS.maxToday);
}

/** 这一季：当前阶梯的完成度，给界面画进度条。 */
export function seasonProgress(evaluation: GoalEvaluation): {
  name: string;
  done: number;
  total: number;
  ratio: number;
  items: { text: string; label: string; done: boolean }[];
} {
  const current = evaluation.ladders[evaluation.stage - 1];
  if (!current) return { name: "走完了", done: 0, total: 0, ratio: 1, items: [] };
  const done = current.conditions.filter((c) => c.done).length;
  const total = current.conditions.length;
  return {
    name: current.name,
    done,
    total,
    ratio: total ? Math.round((done / total) * 100) / 100 : 0,
    items: current.conditions.map((c) => ({ text: c.text, label: c.label, done: c.done })),
  };
}

/** 这一生：阶段名 + 下一步。 */
export function lifeProgress(evaluation: GoalEvaluation): { stageName: string; step: string } {
  if (evaluation.failed.failed) return { stageName: "村子散了", step: GOAL_FAILURE.aftermath };
  const current = evaluation.ladders[evaluation.stage - 1];
  if (!current) return { stageName: "走完了", step: "村子立住了，接下来的日子归你自己过。" };
  return {
    stageName: current.name,
    step: evaluation.nextMissing
      ? `下一步：${evaluation.nextMissing}。`
      : `「${current.name}」已经做到了，${current.unlock ? `打开了${current.unlock}。` : "接着往下走。"}`,
  };
}

function ladderView(progress: LadderProgress) {
  return {
    index: progress.index,
    id: progress.id,
    name: progress.name,
    achieved: progress.achieved,
    missing: progress.missing,
    conditions: progress.conditions.map((c) => ({
      id: c.id, text: c.text, label: c.label, done: c.done, current: c.current, target: c.target,
    })),
  };
}

export const settlementGoalsModule: OpenLifeModule = {
  manifest: {
    id: GOALS_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "村落成长目标",
    description: "Six-step growth ladder for the village (footing to legacy), a dispersal ending, and today/season/life goals.",
    provides: [GOALS_CAPABILITY],
    requires: [],
    optional: ["settlement.housing", "world.hazard-state"],
    incompatible: [],
    capabilities: [
      "component.register",
      "command.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const api: GoalsApi = {
      state: (world) => readState(world),
      snapshot: (world, state) => snapshotOf(world, state ?? readState(world)),
      evaluate: (world) => {
        const state = readState(world);
        return evaluateGoals(snapshotOf(world, state), state.stage);
      },
    };
    ctx.provideCapability(GOALS_CAPABILITY, api);

    ctx.registerComponent({
      id: GoalComponents.state,
      persist: true,
      description: "村子走到第几级、过了几个冬天、集市来过几次人、是否已经散了。",
    });

    ctx.registerCommand({
      type: GoalCommands.tick,
      description: "检查是否达成下一级或失败（由调用方每天 dispatch）。",
      params: {
        winterEnded: "可选：今天是一个冬天的最后一天",
        starvedThisWinter: "可选：这个冬天饿死了几个人（配合 winterEnded）",
        marketArrived: "可选：渡口集市今天主动来了人",
      },
    });

    ctx.registerResolutionRule({
      id: `${GoalCommands.tick}.resolve`,
      commandType: GoalCommands.tick,
      resolve: (c): Effect[] => {
        const tick = c.world.tick;
        const previous = readState(c.world);
        const payload = c.command.payload;

        // 世界现状里推不出来的两件事，由调用方如实上报；不报就是没有。
        const next: GoalsState = { ...previous, updatedAt: tick };
        if (payload.marketArrived === true) next.marketArrivals = previous.marketArrivals + 1;

        const snapshot = snapshotOf(c.world, next);
        // 冬天数是从日历推的；连坏冬天只能靠上报，因为它取决于"谁死了"。
        next.wintersLived = Math.max(previous.wintersLived, snapshot.wintersLived);
        if (payload.winterEnded === true) {
          const starved = Math.max(0, Number(payload.starvedThisWinter ?? 0));
          next.badWinterStreak = starved > 0 ? previous.badWinterStreak + 1 : 0;
        }
        const evaluated = evaluateGoals({ ...snapshot, consecutiveBadWinters: next.badWinterStreak }, next.stage);

        const effects: Effect[] = [];
        for (const ladder of evaluated.reached) {
          if (next.reached.includes(ladder.id)) continue;
          next.reached = [...next.reached, ladder.id];
          effects.push({
            kind: "emitEvent",
            eventType: GoalEvents.reached,
            data: { goalId: ladder.id, name: ladder.name, stage: ladder.index, unlock: ladder.unlock },
            historicalSignificance: 0.6,
          });
        }
        next.stage = evaluated.stage;

        if (evaluated.failed.failed && !previous.dispersed) {
          next.dispersed = true;
          effects.push({
            kind: "emitEvent",
            eventType: GoalEvents.failed,
            data: {
              reason: evaluated.failed.reason,
              population: snapshot.population,
              line: GOAL_FAILURE.line,
              aftermath: GOAL_FAILURE.aftermath,
            },
            historicalSignificance: 0.9,
          });
        }

        return [...effects, writeState(c.world, next)];
      },
    });

    ctx.registerProjection({
      id: GoalProjections.progress,
      description: "村子走到哪一级、每级差什么、今天/这一季/这一生三档目标。不含任何人名。",
      build: ({ world }) => {
        const state = readState(world);
        const snapshot = snapshotOf(world, state);
        const evaluation = evaluateGoals(snapshot, state.stage);
        const current = evaluation.ladders[evaluation.stage - 1] ?? null;
        const life = lifeProgress(evaluation);
        return {
          stage: evaluation.stage,
          stageName: current?.name ?? "走完了",
          totalStages: LADDERS.length,
          ladders: evaluation.ladders.map(ladderView),
          missing: evaluation.nextMissing,
          nextName: evaluation.nextName,
          failed: evaluation.failed,
          dispersed: state.dispersed,
          goals: {
            today: todayHints(snapshot, evaluation),
            season: seasonProgress(evaluation),
            life,
          },
          snapshot: {
            population: snapshot.population,
            homes: snapshot.homes,
            roofsSound: snapshot.roofsSound,
            foodDays: snapshot.foodDays === null ? null : Math.floor(snapshot.foodDays),
            births: snapshot.births,
            wintersLived: snapshot.wintersLived,
            threeGenHomes: snapshot.threeGenHomes,
            lineageGenerations: snapshot.lineageGenerations,
            starving: snapshot.starving,
          },
          line: evaluation.failed.failed
            ? GOAL_FAILURE.line
            : current
              ? `村子在「${current.name}」这一级：${current.missing || "已经做到了"}。`
              : "六级阶梯都走完了。",
        };
      },
    });
  },
};

/** 数据自检的对外出口，测试与内容作者共用。 */
export { goalProblems, GOALS };
