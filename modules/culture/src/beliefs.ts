/**
 * 文化与信仰：为什么这样做不只靠对错道理。
 *
 * 在此之前，科技接不接受只看「对不对」——蒸汽机就是比水车好，没人问为什么。
 * 开发文档 A5 要修的就是这个：
 *  - 信仰对象：祖先、地方神灵、天、后来的教门。每个人对每个有一个虔诚度。
 *  - 仪式与禁忌：仪式由内容包定义；禁忌会让某些发明的接受度下降。
 *  - 跟科技里的道理竞争：同一个现象可以用道理解释，也可以用神灵解释；
 *    信仰解释流行时，正确的道理更难被大家接受。
 *  - 跟职位的关系：世袭和任命的职位可以从「天命」「祖先」那里得到正当性；
 *    有祭祀设施时，民心下滑变慢。
 *  - 方言漂移：聚落之间的方言距离随联系强度变化；距离越大，传播越难。
 */
import type { JsonValue } from "@openlife/contracts";

/** 一个信仰对象：祖先、地方神灵、天、教门。 */
export interface BeliefObject {
  id: string;
  name: string;
  /** 虔诚度 0..1：越高越信。 */
  devotion: number;
  /** 这个信仰解释了什么现象（病、丰收、战争）。 */
  explains: string[];
}

/** 一个仪式：什么时候做、需要什么、有什么用。 */
export interface Ritual {
  id: string;
  name: string;
  /** 什么时候做：spring / harvest / full-moon。 */
  when: string;
  /** 需要什么设施。 */
  needsFacility?: string;
  /** 需要什么物品。 */
  needsItem?: string;
  /** 效果：devotion +0.1，或 standing +0.5。 */
  effect: Record<string, number>;
}

/** 一个禁忌：做什么会触怒信仰对象。 */
export interface Taboo {
  id: string;
  /** 触怒的对象。 */
  target: string;
  /** 做什么会触怒：mine / dig / build。 */
  action: string;
  /** 后果：对应发明的接受度下降多少 0..1。 */
  penalty: number;
  /** 为什么：「动土惊扰祖先」。 */
  why: string;
}

/** 一个聚落的信仰状态。 */
export interface CultureState {
  /** 信仰对象 → 虔诚度。 */
  beliefs: Record<string, number>;
  /** 方言：与中心的距离 0..1，越大越听不懂。 */
  dialect: number;
  /** 最近一次仪式是什么时候。 */
  lastRitual: Record<string, number>;
}

/** 一个禁忌让对应发明的接受度下降多少。 */
export function tabooPenalty(
  taboos: readonly Taboo[],
  inventionId: string,
  action: string,
): number {
  let penalty = 0;
  for (const taboo of taboos) {
    if (taboo.action === action) penalty = Math.max(penalty, taboo.penalty);
  }
  return Math.min(1, penalty);
}

/**
 * 一个发明的接受度：有没有禁忌压着它。
 *
 * 接受度 = 1 - 禁忌惩罚。强禁忌能让采用平均推迟（A5.2 验收）。
 */
export function acceptanceOf(
  taboos: readonly Taboo[],
  inventionId: string,
  action: string,
): number {
  return 1 - tabooPenalty(taboos, inventionId, action);
}

/**
 * 方言距离怎么影响传播。
 *
 * 距离越大，传播越难。方言距离随联系强度变化：联系越密，方言越近。
 */
export function dialectBarrier(
  dialectA: number,
  dialectB: number,
  contactStrength: number,
): number {
  const distance = Math.abs(dialectA - dialectB);
  return distance * (1 - contactStrength);
}

/** 一次仪式后的虔诚度变化。 */
export function devotionAfterRitual(
  before: number,
  ritual: Ritual,
  keyed: (purpose: string, ...parts: Array<string | number>) => { chance(p: number): boolean },
): number {
  const gain = ritual.effect.devotion ?? 0.05;
  return Math.min(1, before + gain);
}

/** 世袭和任命的职位从「天命」「祖先」那里得到正当性。 */
export function legitimacyFromBelief(
  beliefs: Record<string, number>,
  officeId: string,
  how: "acclaim" | "vote" | "hereditary" | "appointed",
): number {
  const ancestors = beliefs["belief:ancestors"] ?? 0;
  const heaven = beliefs["belief:heaven"] ?? 0;
  if (how === "hereditary") return ancestors * 0.5;
  if (how === "appointed") return heaven * 0.4;
  return 0;
}

/** 有祭祀设施时，民心下滑变慢。 */
export function standingDecayWithTemple(
  beliefs: Record<string, number>,
  hasTemple: boolean,
  baseDecay: number,
): number {
  if (!hasTemple) return baseDecay;
  const devotion = Object.values(beliefs).reduce((n, d) => n + d, 0) / Math.max(1, Object.keys(beliefs).length);
  return baseDecay * (1 - devotion * 0.5);
}

/** 内置的信仰对象：祖先、地方神灵、天。 */
export const BASE_BELIEFS: readonly BeliefObject[] = [
  { id: "belief:ancestors", name: "祖先", devotion: 0.6, explains: ["病", "丰收", "战争"] },
  { id: "belief:local-gods", name: "地方神灵", devotion: 0.4, explains: ["丰收", "水灾", "猎物"] },
  { id: "belief:heaven", name: "天", devotion: 0.3, explains: ["年成", "寿命", "祸福"] },
];

/** 内置的禁忌：动土惊扰祖先。 */
export const BASE_TABOOS: readonly Taboo[] = [
  { id: "taboo:disturb-ancestors", target: "belief:ancestors", action: "mine", penalty: 0.6, why: "动土惊扰祖先" },
  { id: "taboo:cut-sacred-grove", target: "belief:local-gods", action: "build", penalty: 0.4, why: "砍了社树" },
];

/** 内置的仪式：春祭、秋尝。 */
export const BASE_RITUALS: readonly Ritual[] = [
  { id: "ritual:spring-sacrifice", name: "春祭", when: "spring", effect: { devotion: 0.1, standing: 0.5 } },
  { id: "ritual:harvest-thanks", name: "秋尝", when: "harvest", effect: { devotion: 0.1, standing: 0.3 } },
];
