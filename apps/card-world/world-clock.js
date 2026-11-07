// The village day rolls over at 06:00. Every speed consumes the same minute boundaries.
export const dayAt = (minute) => Math.floor((minute - 360) / 1440) + 1;

export function advanceClock(clock, target, step) {
  if (!Number.isFinite(target)) return;
  for (let next = Math.floor(clock.min) + 1; next <= target; next++) {
    const previous = clock.min;
    clock.min = next;
    step(next - previous, previous);
  }
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// FNV-1a and Mulberry32 are adapted from the archived packages/kernel/src/rng.ts.
export function createWorldRandom(seed, saved = {}) {
  const streams = new Map(Object.entries(saved ?? {}).filter(([, state]) => Number.isInteger(state) && state >= 0 && state <= 0xffffffff));
  return {
    next(label) {
      const state = ((streams.get(label) ?? hashString(seed + ":" + label)) + 0x6d2b79f5) >>> 0;
      streams.set(label, state);
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    snapshot: () => Object.fromEntries(streams),
  };
}
