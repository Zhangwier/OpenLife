/**
 * 经济接入：以物易物到货币。
 *
 * 在此之前，交换是「一物换一物」——一捆柴换一捧粟，没有比价，没有货币。
 * 开发文档 A6 要修的就是这个：
 *  - 以物易物到货币：先是礼物和互惠，然后有了交换比价（由稀缺程度决定），
 *    再出现货币制度（贝、布、铜钱），由 polity 新增 institution:currency 来开启
 *  - 价格：每个聚落给每类物品算一个参考比价（供给 ÷ 需求），每年更新
 *  - 专业分工：有了手艺人制度以后，分工程度影响生产率
 *  - 债：借贷的利息和违约概率由价格波动决定
 *  - 职位：开集以后，集市日的交换范围扩大到相邻聚落
 */
import type { JsonValue } from "@openlife/contracts";

/** 一类物品在聚落里的比价。 */
export interface Price {
  resourceId: string;
  /** 参考比价：多少单位换一单位基准（粮）。 */
  ratio: number;
  /** 今年涨了多少 0..1。 */
  trend: number;
}

/** 一个聚落的价格表。 */
export interface PriceBook {
  prices: Record<string, Price>;
  /** 基准物品（一般是粮）。 */
  base: string;
  /** 今年荒年吗。 */
  lean: boolean;
}

/** 一笔债。 */
export interface Debt {
  id: string;
  creditor: string;
  debtor: string;
  /** 借了多少（基准单位）。 */
  amount: number;
  /** 利率 0..1。 */
  interest: number;
  /** 借于何时。 */
  since: number;
}

/** 一个聚落的经济状态。 */
export interface EconomyState {
  prices: Record<string, Price>;
  debts: Debt[];
  /** 有没有货币制度。 */
  currency: boolean;
  /** 集市日：每月第几天，0 = 没有。 */
  marketDay: number;
}

/**
 * 一年的价格更新。
 *
 * 比价 = 供给 ÷ 需求。荒年粮价上涨（A6.2 验收）。
 */
export function updatePrices(
  before: Record<string, Price>,
  supply: Record<string, number>,
  demand: Record<string, number>,
  lean: boolean,
  keyed: (purpose: string, ...parts: Array<string | number>) => { chance(p: number): boolean },
): Record<string, Price> {
  const out: Record<string, Price> = {};
  for (const [resourceId, prev] of Object.entries(before)) {
    const s = supply[resourceId] ?? 1;
    const d = demand[resourceId] ?? 1;
    // 比价 = 需求 ÷ 供给：要的人多、有的少，就贵。荒年粮价上涨。
    const leanFactor = lean && resourceId === "resource:grain" ? 2 : 1;
    const ratio = Math.max(0.1, (d * leanFactor) / s);
    const trend = prev ? (ratio - prev.ratio) / Math.max(0.1, prev.ratio) : 0;
    out[resourceId] = { resourceId, ratio, trend: Math.max(-0.5, Math.min(0.5, trend)) };
  }
  return out;
}

/** 一次交换要付出多少。 */
export function costOf(
  prices: Record<string, Price>,
  wantId: string,
  wantAmount: number,
  offerId: string,
): number {
  const want = prices[wantId];
  const offer = prices[offerId];
  if (!want || !offer) return wantAmount;
  return Math.ceil(wantAmount * (want.ratio / offer.ratio));
}

/** 借贷的利息：由价格波动决定。 */
export function interestOf(
  prices: Record<string, Price>,
  resourceId: string,
  lean: boolean,
): number {
  const price = prices[resourceId];
  const volatility = price ? Math.abs(price.trend) : 0;
  return Math.min(0.5, 0.1 + volatility + (lean ? 0.1 : 0));
}

/** 违约概率：由价格波动决定。 */
export function defaultChanceOf(
  prices: Record<string, Price>,
  resourceId: string,
  lean: boolean,
): number {
  const price = prices[resourceId];
  const volatility = price ? Math.abs(price.trend) : 0;
  return Math.min(0.8, 0.1 + volatility * 2 + (lean ? 0.2 : 0));
}

/** 一笔债一年后滚成多少。 */
export function debtAfterYear(debt: Debt, prices: Record<string, Price>): Debt {
  const rate = interestOf(prices, "resource:grain", false);
  return { ...debt, amount: Math.round(debt.amount * (1 + rate)) };
}

/** 专业分工对生产率的影响。 */
export function productivityFromSpecialization(
  specialists: number,
  population: number,
): number {
  const ratio = population > 0 ? specialists / population : 0;
  return 1 + Math.min(0.5, ratio);
}

/** 开集以后，交换范围扩大到相邻聚落。 */
export function marketReach(
  marketDay: number,
  baseReach: number,
): number {
  return marketDay > 0 ? baseReach * 2 : baseReach;
}

/** 内置的初始价格表。 */
export const BASE_PRICES: Record<string, Price> = {
  "resource:grain": { resourceId: "resource:grain", ratio: 1, trend: 0 },
  "resource:fuel": { resourceId: "resource:fuel", ratio: 0.5, trend: 0 },
  "resource:clay": { resourceId: "resource:clay", ratio: 0.3, trend: 0 },
  "resource:reed": { resourceId: "resource:reed", ratio: 0.2, trend: 0 },
};
