// CardWorld bindings for the deterministic appraisal in
// engine/modules/settlement-locations/src/exchange.ts and data/river-terrace.json.
export const TRADE_WORTH = Object.freeze({
  grain: 2, cooked: 3, wood: 1, reed: 1, clay: 1, fiber: 2, rope: 2, jar: 6,
  cloth: 5, fish: 2, net: 5, basket: 4, log: 2, stone: 2, chestnut: 2, meat: 3,
  hide: 4, smokedMeat: 4,
});
const FOOD = new Set(["grain", "cooked", "fish"]);
const TOLERANCE = { 陌生: 1, 见过: 0.9, 相识: 0.75 };
const FAVOUR_LIMIT = 3;
const round = (value) => Math.round(value * 10) / 10;

export function planVillageExchange({ give, hold, giveIds, askId, name, hunger, closeness, owed, credit, wants, label = (key) => key }) {
  if (!giveIds.length || new Set(giveIds).size !== giveIds.length) return null;
  const offered = giveIds.map((id) => give.find((card) => card.id === id));
  const take = hold.find((card) => card.id === askId);
  if (!take || !TRADE_WORTH[take.key] || offered.some((card) => !card || !TRADE_WORTH[card.key])) return null;

  const last = hold.filter((card) => card.key === take.key).length === 1;
  const worth = (key) => TRADE_WORTH[key] * (FOOD.has(key) && hunger >= 4 ? 1.5 : 1);
  const received = round(offered.reduce((sum, card) => sum + worth(card.key) * (wants.includes(card.key) ? 1.5 : 1), 0));
  const cost = round(worth(take.key) * (last ? 1.5 : 1));
  const shortfall = round(cost - received);
  if (received >= round(cost * TOLERANCE[closeness])) {
    const repaid = round(Math.min(owed, Math.max(0, received - cost)));
    const reason = repaid > 0 ? "多给的部分抵了之前欠的人情" : shortfall > 0 ?
      `看在熟人份上，${name}不计较这点差价` : `${name}觉得这样换公道`;
    return { accept: true, give: offered, take, onCredit: 0, repaid, reason };
  }
  if (credit && closeness !== "陌生" && round(owed + shortfall) <= FAVOUR_LIMIT) {
    return { accept: true, give: offered, take, onCredit: shortfall, repaid: 0, reason: `${name}答应先换给你，差的部分记作人情` };
  }
  let reason = `${name}觉得不划算`;
  if (FOOD.has(take.key) && hunger >= 4) reason = `${name}自己也饿着，不肯拿${label(take.key)}换`;
  else if (last) reason = `这是${name}手上最后的${label(take.key)}，要多给些才肯换`;
  else if (credit && closeness === "陌生") reason = `${name}和你还不熟，不肯赊账`;
  else if (credit) reason = `你欠${name}的人情已经不少了，先还一些再说`;
  return { accept: false, reason };
}
