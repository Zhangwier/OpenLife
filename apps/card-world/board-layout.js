// Keep the north–south aisle through the courtyard gate free of fixtures.
const YARD_FIXTURES = {
  bed: [44, 130], fire: [404, 205], grain: [404, 34], store: [44, 340], chest: [404, 420],
};

export function yardFurnishing(key, yard) {
  const [x, y] = YARD_FIXTURES[key];
  return { x: yard.x + x, y: yard.y + y };
}

export function oldYardFurnishing(stack, yard) {
  const key = stack.store ? "store" : stack.cards[0].key;
  const oldX = { bed: 110, fire: 280, grain: 440, store: 30 }[key];
  const oldY = key === "store" ? 60 : yard.h - 200;
  return stack.x === yard.x + oldX && stack.y === yard.y + oldY ? key : null;
}

export const ROOM_FURNITURE = [["door", 474, 522], ["bed", 144, 162], ["fire", 764, 210]];
export const ROOM_ENTRY = { x: 474, y: 315 };

export function oldRoomFurnishing({ x, y, cards }) {
  const key = cards[0].key;
  const old = { door: [470, 520], bed: [180, 140], fire: [470, 250] }[key];
  if (!old || x !== old[0] || y !== old[1]) return null;
  const [, nextX, nextY] = ROOM_FURNITURE.find(([kind]) => kind === key);
  return { x: nextX, y: nextY };
}

export function pickDropTarget(point, candidates, scale) {
  // A six-screen-pixel cushion for touch, capped when zoomed far out.
  const padding = Math.min(12, 6 / scale);
  let target = null, nearest = Infinity;
  for (const card of candidates) {
    const dx = Math.max(card.x - point.x, 0, point.x - card.x - card.w);
    const dy = Math.max(card.y - point.y, 0, point.y - card.y - card.h);
    const distance = Math.hypot(dx, dy);
    if (distance <= padding && (distance < nearest || (distance === nearest && card.z > target?.z))) {
      target = card;
      nearest = distance;
    }
  }
  return target;
}
