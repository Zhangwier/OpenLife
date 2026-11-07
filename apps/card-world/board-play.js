export const playerStride = (range, fullRange) => 32 * Math.max(0.5, range / fullRange);
export const walkEffort = (distance, uphill = false) => distance * (uphill ? 0.0006 : 0.0003);

export function bundleLayout(cards, canBundle) {
  const groups = [];
  for (const [i, card] of cards.entries()) {
    const last = groups.at(-1);
    if (last?.card.key === card.key && canBundle(last.card) && canBundle(card)) last.end = i + 1;
    else groups.push({ card, start: i, end: i + 1 });
  }
  return groups;
}
