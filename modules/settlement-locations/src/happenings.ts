/**
 * 日子里的事：节令共餐、村民病倒几天。全部来自数据包，按日子确定地算出来
 * （同一天总是同一件事），不安排任何人去找玩家：病了的人自己待在家里，
 * 过节时村民自己愿意去热闹的地方，玩家去不去、帮不帮都由玩家决定。
 */
import { DAYS_PER_MONTH } from "@openlife/life-contracts";
import { RIVER_TERRACE_PACK } from "./content.ts";

export interface FeastSpec {
  id: string; name: string;
  /** Month 1–12 and day 1–30 on the village calendar. */
  month: number; day: number;
  placeId: string;
  /** Shown on the day itself. */
  text: string;
  /** Shown in the days before. */
  soon: string;
  /** Told when you join in (talk to someone there on the day). */
  joinLine: string;
}

export interface IllnessSpec {
  /** One spell of illness somewhere in each window of this many days. */
  everyDays: number;
  lastsDays: number;
  /** What helps (cooked food, water…). */
  helps: string[];
  text: string;
  careLine: string;
}

export interface HappeningsSpec { feasts: FeastSpec[]; illness?: IllnessSpec }

const SPEC: HappeningsSpec = RIVER_TERRACE_PACK.happenings ?? { feasts: [] };
const residentIdOf = (key: string) => `settlement-locations:resident:${key}`;

function mix(a: number, b: number): number {
  let h = (Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 13, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

export function calendarDate(tick: number): { month: number; day: number } {
  return { month: (Math.floor(tick / DAYS_PER_MONTH) % 12) + 1, day: (tick % DAYS_PER_MONTH) + 1 };
}

/** The feast held on this day, if any. */
export function feastOn(tick: number): FeastSpec | undefined {
  const d = calendarDate(tick);
  return SPEC.feasts.find((f) => f.month === d.month && f.day === d.day);
}

/** A feast within the next few days (not today), with how many days away. */
export function feastSoon(tick: number, within = 3): { feast: FeastSpec; inDays: number } | undefined {
  for (let n = 1; n <= within; n += 1) {
    const f = feastOn(tick + n);
    if (f) return { feast: f, inDays: n };
  }
  return undefined;
}

/** Who is ill on this day (a brain-driven villager, never the three bespoke roles), and since when. */
export function illnessOn(tick: number): { residentId: string; key: string; from: number; until: number } | undefined {
  const ill = SPEC.illness;
  if (!ill || ill.everyDays <= ill.lastsDays) return undefined;
  const window = Math.floor(tick / ill.everyDays);
  const from = window * ill.everyDays + (mix(window, 1) % (ill.everyDays - ill.lastsDays));
  if (tick < from || tick >= from + ill.lastsDays) return undefined;
  const roles = new Set(Object.values(RIVER_TERRACE_PACK.autonomy));
  const pool = RIVER_TERRACE_PACK.residents.filter((r) => !roles.has(r.key));
  if (!pool.length) return undefined;
  const r = pool[mix(window, 2) % pool.length]!;
  if (feastOn(tick)) return undefined; // 过节那天谁也不躺着。
  return { residentId: residentIdOf(r.key), key: r.key, from, until: from + ill.lastsDays };
}

export function isIll(tick: number, residentId: string): boolean {
  return illnessOn(tick)?.residentId === residentId;
}

export function illnessSpec(): IllnessSpec | undefined { return SPEC.illness; }
