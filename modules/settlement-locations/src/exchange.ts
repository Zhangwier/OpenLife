/**
 * General exchange between any two people standing in the same place.
 *
 * The proposer names concrete items they hold and asks for an amount of one
 * resource the other side holds. The other side decides with a small, pure,
 * deterministic appraisal, so the same world always gives the same answer:
 *
 *  - every resource has a base worth in the content pack;
 *  - something the counterpart needs for their work or wish is worth more to them;
 *  - food is worth more to someone who is hungry, on both sides of the deal;
 *  - giving away one's last portion of something costs more;
 *  - people who know you well accept a slightly uneven deal;
 *  - an acquaintance may let a shortfall stand as a favour owed (人情),
 *    up to a small limit, and later surplus pays that favour back.
 *
 * Nothing here touches the world; module.ts turns a decision into effects.
 */

export type Closeness = "陌生" | "见过" | "相识";

export interface ExchangeSide {
  /** Resource ids of the items, one entry per item. */
  resources: string[];
}

export interface CounterpartView {
  name: string;
  hunger: number;
  /** How many tradeable portions of each resource the counterpart holds. */
  holds: Record<string, number>;
  /** Resources this person needs for their work or wish. */
  wants: string[];
  closeness: Closeness;
  /** Favour the proposer already owes this person, in worth units. */
  owed: number;
}

export interface ExchangeDecision {
  accept: boolean;
  /** Worth to the counterpart of what they receive / give up. */
  received: number;
  cost: number;
  /** Shortfall recorded as a favour owed (0 when the deal is even). */
  onCredit: number;
  /** Earlier favour paid back by this deal's surplus. */
  repaid: number;
  reason: string;
}

export const EDIBLE = new Set(["resource:grain", "resource:cooked", "resource:fish"]);
/** A favour owed may not grow beyond this many worth units. */
export const FAVOUR_LIMIT = 3;
const TOLERANCE: Record<Closeness, number> = { "陌生": 1, "见过": 0.9, "相识": 0.75 };

const round = (n: number) => Math.round(n * 10) / 10;

export function worthTo(view: CounterpartView, values: Record<string, number>, resourceId: string,
  receiving: boolean, amountGiven = 1): number {
  let worth = values[resourceId] ?? 0;
  if (EDIBLE.has(resourceId) && view.hunger >= 4) worth *= 1.5;
  if (receiving && view.wants.includes(resourceId)) worth *= 1.5;
  if (!receiving && (view.holds[resourceId] ?? 0) - amountGiven <= 0) worth *= 1.5;
  return worth;
}

export function appraise(view: CounterpartView, values: Record<string, number>,
  give: ExchangeSide, ask: { resourceId: string; amount: number }, credit: boolean,
  label: (resourceId: string) => string = (id) => id): ExchangeDecision {
  const received = round(give.resources.reduce((sum, r) => sum + worthTo(view, values, r, true), 0));
  const cost = round(worthTo(view, values, ask.resourceId, false, ask.amount) * ask.amount);
  const need = round(cost * TOLERANCE[view.closeness]);
  if (received >= need) {
    const repaid = round(Math.min(view.owed, Math.max(0, received - cost)));
    const why = repaid > 0 ? `多给的部分抵了之前欠的人情` :
      received < cost ? `看在熟人份上，${view.name}不计较这点差价` : `${view.name}觉得这样换公道`;
    return { accept: true, received, cost, onCredit: 0, repaid, reason: why };
  }
  const shortfall = round(cost - received);
  if (credit && view.closeness !== "陌生" && view.owed + shortfall <= FAVOUR_LIMIT) {
    return { accept: true, received, cost, onCredit: shortfall, repaid: 0,
      reason: `${view.name}答应先换给你，差的部分记作人情，往后再还` };
  }
  let reason = `${view.name}觉得不划算`;
  if (EDIBLE.has(ask.resourceId) && view.hunger >= 4) reason = `${view.name}自己也饿着，不肯拿${label(ask.resourceId)}换`;
  else if ((view.holds[ask.resourceId] ?? 0) - ask.amount <= 0) reason = `这是${view.name}手上最后的${label(ask.resourceId)}，要多给些才肯换`;
  else if (credit && view.closeness === "陌生") reason = `${view.name}和你还不熟，不肯赊账`;
  else if (credit) reason = `你欠${view.name}的人情已经不少了，先还一些再说`;
  return { accept: false, received, cost, onCredit: 0, repaid: 0, reason };
}
