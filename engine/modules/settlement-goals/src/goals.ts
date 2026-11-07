/**
 * 村落成长目标的"尺子"（纯逻辑，不碰世界）。
 *
 * 为什么单独一层：阶梯是数据（data/goals.json），判定是纯函数。这样
 *   - 内容作者换整套阶梯不用改代码；
 *   - 测试能直接喂一个假快照，把六级阶梯一级一级走完，而不用真的过三年；
 *   - 投影与命令共用同一个判定，界面上显示的进度不可能和实际达成不一致。
 *
 * 定位（docs/POSITIONING.md）：没有剧情主线，只有"村子活下去并长大"这一条
 * 成长线。所以这里只有阶梯，没有任务。
 */
import { readFileSync } from "node:fs";

export type GoalConditionKind =
  | "wintersLivedAtLeast"
  | "noStarvationDeaths"
  | "homesAtLeast"
  | "roofsSound"
  | "foodDaysAtLeast"
  | "populationAtLeast"
  | "birthsAtLeast"
  | "marketArrivalsAtLeast"
  | "threeGenHomesAtLeast"
  | "lineageGenerationsAtLeast";

export interface GoalCondition {
  id: string;
  kind: GoalConditionKind;
  /** 门槛值；`noStarvationDeaths` 与 `roofsSound` 不用。 */
  value?: number;
  /** 玩家看到的一句话，不含任何人名。 */
  text: string;
  /** 进度的单位词，如"人""天""间"。 */
  unit?: string;
}

export interface GoalLadder {
  index: number;
  id: string;
  name: string;
  /** 达成后打开的东西，给"这一生"用。 */
  unlock: string;
  conditions: GoalCondition[];
}

export interface GoalFailure {
  populationBelow: number;
  consecutiveBadWinters: number;
  line: string;
  /** 失败之后还能接着玩：由后代在别处重新开始（继承保留）。 */
  aftermath: string;
}

interface GoalData {
  id: string;
  formatVersion: number;
  ladders: GoalLadder[];
  failure: GoalFailure;
  /** "今天"这一档最多给几条建议。 */
  maxToday: number;
}

export const GOALS: GoalData = JSON.parse(
  readFileSync(new URL("../data/goals.json", import.meta.url), "utf8"),
) as GoalData;

export const LADDERS: readonly GoalLadder[] = GOALS.ladders;
export const GOAL_FAILURE: GoalFailure = GOALS.failure;

/**
 * 判定要用的世界快照。
 *
 * `null` 表示"看不出来"（对应模块没装 / 这个存档没有这项数据），
 * 判定时按未达成处理，而不是当成 0 或当成达标——两者都会骗玩家。
 */
export interface VillageSnapshot {
  population: number;
  homes: number | null;
  /** 屋顶还挡得住雨的屋子数。 */
  roofsSound: number | null;
  /** 存粮够全村吃几天。 */
  foodDays: number | null;
  /** 在村里出生并且还活着的人数。 */
  births: number;
  /** 渡口集市主动来人的次数（由调用方上报，不凭空产生）。 */
  marketArrivals: number;
  /** 三代同堂的人家数。 */
  threeGenHomes: number;
  /** 家族传到的代数。 */
  lineageGenerations: number;
  /** 村子过过几个冬天。 */
  wintersLived: number;
  /** 连续几个冬天饿死人。 */
  consecutiveBadWinters: number;
  /** 眼下饿着的人数。 */
  starving: number;
  hazard: "none" | "omen" | "active";
}

export const EMPTY_SNAPSHOT: VillageSnapshot = {
  population: 0,
  homes: null,
  roofsSound: null,
  foodDays: null,
  births: 0,
  marketArrivals: 0,
  threeGenHomes: 0,
  lineageGenerations: 0,
  wintersLived: 0,
  consecutiveBadWinters: 0,
  starving: 0,
  hazard: "none",
};

export interface ConditionProgress {
  id: string;
  text: string;
  done: boolean;
  /** 当前值；`null` 表示看不出来。 */
  current: number | null;
  target: number | null;
  /** "人口 12/15" 这样的人话；无法计量时就是 text 本身。 */
  label: string;
}

function measurable(
  condition: GoalCondition,
  current: number | null,
  target: number,
  unit: string,
): ConditionProgress {
  const done = current !== null && current >= target;
  return {
    id: condition.id,
    text: condition.text,
    done,
    current,
    target,
    label: current === null ? `${condition.text}（还看不出来）` : `${condition.text}：${current}/${target}${unit}`,
  };
}

function booleanish(condition: GoalCondition, done: boolean, label: string): ConditionProgress {
  return { id: condition.id, text: condition.text, done, current: done ? 1 : 0, target: 1, label };
}

/** 一条条件现在到哪儿了。 */
export function conditionProgress(condition: GoalCondition, snapshot: VillageSnapshot): ConditionProgress {
  switch (condition.kind) {
    case "wintersLivedAtLeast":
      return measurable(condition, snapshot.wintersLived, condition.value ?? 1, " 个冬天");
    case "noStarvationDeaths":
      return booleanish(condition, snapshot.consecutiveBadWinters === 0,
        snapshot.consecutiveBadWinters === 0 ? "还没饿死过人" : `已经连着 ${snapshot.consecutiveBadWinters} 个冬天饿死人`);
    case "homesAtLeast":
      return measurable(condition, snapshot.homes, condition.value ?? 1, " 间");
    case "roofsSound": {
      const total = snapshot.homes;
      const sound = snapshot.roofsSound;
      const done = total !== null && sound !== null && total > 0 && sound >= total;
      return booleanish(condition, done,
        total === null || sound === null ? `${condition.text}（还看不出来）` : `${condition.text}：${sound}/${total} 间`);
    }
    case "foodDaysAtLeast":
      return measurable(condition, snapshot.foodDays === null ? null : Math.floor(snapshot.foodDays),
        condition.value ?? 60, " 天");
    case "populationAtLeast":
      return measurable(condition, snapshot.population, condition.value ?? 15, " 人");
    case "birthsAtLeast":
      return measurable(condition, snapshot.births, condition.value ?? 1, " 个");
    case "marketArrivalsAtLeast":
      return measurable(condition, snapshot.marketArrivals, condition.value ?? 1, " 次");
    case "threeGenHomesAtLeast":
      return measurable(condition, snapshot.threeGenHomes, condition.value ?? 2, " 家");
    case "lineageGenerationsAtLeast":
      return measurable(condition, snapshot.lineageGenerations, condition.value ?? 5, " 代");
  }
}

export interface LadderProgress {
  index: number;
  id: string;
  name: string;
  /** 达成后打开的东西（"这一生"要显示）。 */
  unlock: string;
  achieved: boolean;
  conditions: ConditionProgress[];
  /** 这一级还差什么，一句话。 */
  missing: string;
}

export function ladderProgress(ladder: GoalLadder, snapshot: VillageSnapshot): LadderProgress {
  const conditions = ladder.conditions.map((c) => conditionProgress(c, snapshot));
  const missing = conditions.filter((c) => !c.done);
  return {
    index: ladder.index,
    id: ladder.id,
    name: ladder.name,
    unlock: ladder.unlock,
    achieved: missing.length === 0,
    conditions,
    missing: missing.length === 0 ? "" : missing.map((c) => c.label).join("；"),
  };
}

/** 村子还在不在。失败之后阶梯停止推进，但历史保留（INV-006）。 */
export function failureOf(snapshot: VillageSnapshot): { failed: boolean; reason: string } {
  if (snapshot.population > 0 && snapshot.population < GOAL_FAILURE.populationBelow) {
    return { failed: true, reason: `人只剩 ${snapshot.population} 个` };
  }
  if (snapshot.consecutiveBadWinters >= GOAL_FAILURE.consecutiveBadWinters) {
    return { failed: true, reason: `连着 ${snapshot.consecutiveBadWinters} 个冬天饿死人` };
  }
  return { failed: false, reason: "" };
}

export interface GoalEvaluation {
  /** 当前这一级的序号（1..N）；全部达成后是 N+1，表示"走到头了"。 */
  stage: number;
  /** 这一轮刚刚达成、需要上报的阶梯（按顺序）。 */
  reached: GoalLadder[];
  ladders: LadderProgress[];
  failed: { failed: boolean; reason: string };
  /** 下一级还差什么；没有下一级时为空串。 */
  nextMissing: string;
  nextName: string;
}

/**
 * 从 `fromStage` 开始一级一级往下判。
 *
 * 一次可以连升几级：如果玩家一口气把三级都满足了（例如读了一份攒了很久的
 * 存档），不该逼他再等三天。所以这里循环推进，`reached` 里按顺序列出。
 */
export function evaluateGoals(snapshot: VillageSnapshot, fromStage = 1): GoalEvaluation {
  const ladders = LADDERS.map((ladder) => ladderProgress(ladder, snapshot));
  const failed = failureOf(snapshot);
  const reached: GoalLadder[] = [];
  let stage = Math.max(1, Math.min(LADDERS.length + 1, fromStage));
  if (!failed.failed) {
    while (stage <= LADDERS.length && ladders[stage - 1]?.achieved) {
      reached.push(LADDERS[stage - 1]!);
      stage += 1;
    }
  }
  const next = LADDERS[stage - 1];
  return {
    stage,
    reached,
    ladders,
    failed,
    nextMissing: next ? ladderProgress(next, snapshot).missing : "",
    nextName: next?.name ?? "",
  };
}

/** 数据自检：序号连不连、条件种不认识、门槛正不正。返回问题清单。 */
export function goalProblems(data: GoalData = GOALS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const kinds = new Set<string>([
    "wintersLivedAtLeast", "noStarvationDeaths", "homesAtLeast", "roofsSound", "foodDaysAtLeast",
    "populationAtLeast", "birthsAtLeast", "marketArrivalsAtLeast", "threeGenHomesAtLeast",
    "lineageGenerationsAtLeast",
  ]);
  if (!data.ladders.length) problems.push("goals: no ladders");
  data.ladders.forEach((ladder, index) => {
    if (ladder.index !== index + 1) problems.push(`ladder ${ladder.id}: index ${ladder.index} should be ${index + 1}`);
    if (seen.has(ladder.id)) problems.push(`ladder ${ladder.id}: duplicate id`);
    seen.add(ladder.id);
    if (!ladder.name.trim()) problems.push(`ladder ${ladder.id}: no name`);
    if (!ladder.unlock.trim()) problems.push(`ladder ${ladder.id}: no unlock`);
    if (!ladder.conditions.length) problems.push(`ladder ${ladder.id}: no conditions`);
    for (const c of ladder.conditions) {
      if (!kinds.has(c.kind)) problems.push(`ladder ${ladder.id}/${c.id}: unknown kind ${c.kind}`);
      if (c.kind !== "noStarvationDeaths" && c.kind !== "roofsSound" && !((c.value ?? 0) > 0)) {
        problems.push(`ladder ${ladder.id}/${c.id}: needs a positive value`);
      }
      if (!c.text.trim()) problems.push(`ladder ${ladder.id}/${c.id}: no text`);
    }
  });
  if (!(data.failure.populationBelow > 0)) problems.push("failure: populationBelow must be positive");
  if (!(data.failure.consecutiveBadWinters > 0)) problems.push("failure: consecutiveBadWinters must be positive");
  if (!(data.maxToday > 0)) problems.push("maxToday must be positive");
  return problems;
}
