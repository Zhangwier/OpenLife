/**
 * Village weather: one sky per day, deterministic from the day and the
 * settlement, with seasonal odds and short wet spells (a rainy day makes the
 * next one more likely to be wet).
 *
 * This is a local stand-in until the settlement sits inside a world-weather
 * region; the Web world does not install geography/climate yet. Anything that
 * reads the sky goes through skyOn(), so swapping the source later is one place.
 */
import { DAYS_PER_MONTH } from "@openlife/life-contracts";

export type Sky = "晴" | "阴" | "雨" | "雪";

const WET_ODDS: Record<string, number> = { "春": 0.25, "夏": 0.3, "秋": 0.15, "冬": 0.15 };

function season(day: number): string {
  const month = (Math.floor(day / DAYS_PER_MONTH) % 12) + 1;
  return month >= 3 && month <= 5 ? "春" : month >= 6 && month <= 8 ? "夏" : month >= 9 && month <= 11 ? "秋" : "冬";
}

/** A stable uniform number in [0, 1) for a day and a purpose. */
function unit(day: number, salt: number): number {
  let h = (Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function wetDraw(day: number): boolean { return unit(day, 1) < (WET_ODDS[season(day)] ?? 0.25); }

export function skyOn(day: number): Sky {
  const wet = wetDraw(day) || (day > 0 && wetDraw(day - 1) && unit(day, 2) < 0.4);
  if (wet) return season(day) === "冬" ? "雪" : "雨";
  return unit(day, 3) < 0.3 ? "阴" : "晴";
}

export function isWet(day: number): boolean {
  const sky = skyOn(day);
  return sky === "雨" || sky === "雪";
}

/** Outdoor places where rain and snow make work heavier. */
export const OUTDOOR_PLACES = new Set(["place:field", "place:reedbed", "place:claypits", "place:river", "place:ford"]);

export const SKY_NOTE: Record<Sky, string> = {
  "晴": "天晴，适合下地和烧窑。",
  "阴": "阴天，干活不受影响。",
  "雨": "下雨：户外劳动多费力气，窑火点不起来，田里不用浇水。",
  "雪": "下雪：户外劳动多费力气，窑火点不起来。冬夜在家烧一捆柴能睡得更暖。",
};
