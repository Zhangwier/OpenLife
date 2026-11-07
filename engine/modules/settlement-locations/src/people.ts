/**
 * 村民的为人（纯数据，不碰世界）：喜好、生日、交情几颗心、往事。
 * 交情由每个村民自己记着的熟悉与信任折算（social.ts），这里只负责读法。
 */
import { RIVER_TERRACE_PACK, type PersonSpec } from "./content.ts";
import { calendarDate } from "./happenings.ts";
import type { Bond } from "./social.ts";

export const PEOPLE: Record<string, PersonSpec> = RIVER_TERRACE_PACK.people ?? {};
export const keyOfResident = (residentId: string) => residentId.split(":").pop() ?? "";
export const personOf = (residentId: string): PersonSpec | undefined => PEOPLE[keyOfResident(residentId)];

/** 交情几颗心（0..10）：熟悉为主，信得过再往上加；有怨气就往下掉。 */
export function heartsOf(bond: Bond): number {
  const raw = (bond.familiarity + Math.max(0, bond.trust - 5)) / 1.5 - bond.grudge;
  return Math.max(0, Math.min(10, Math.floor(raw)));
}

export type Taste = "love" | "like" | "neutral" | "dislike";
export function tasteOf(residentId: string, resourceId: string): Taste {
  const p = personOf(residentId);
  if (!p) return "neutral";
  if (p.loves.includes(resourceId)) return "love";
  if (p.dislikes.includes(resourceId)) return "dislike";
  if (p.likes.includes(resourceId)) return "like";
  return "neutral";
}

export function isBirthday(residentId: string, tick: number): boolean {
  const b = personOf(residentId)?.birthday;
  if (!b) return false;
  const d = calendarDate(tick);
  return d.month === b.month && d.day === b.day;
}

const SEASON_OF_MONTH = ["冬", "冬", "春", "春", "春", "夏", "夏", "夏", "秋", "秋", "秋", "冬"] as const;
/** 生日说成村里的说法：「冬月初六」那样太绕，就说「冬天，第一个月的第 6 天」。 */
export function birthdayWords(residentId: string): string {
  const b = personOf(residentId)?.birthday;
  return b ? `${b.month}月${b.day}日（${SEASON_OF_MONTH[b.month - 1]}）` : "";
}

/** 交情到了、还没讲过的那段往事。 */
export function nextHeartEvent(residentId: string, hearts: number, seen: string[]): { id: string; text: string } | undefined {
  const events = personOf(residentId)?.heartEvents ?? [];
  const key = keyOfResident(residentId);
  for (const e of [...events].sort((a, b) => a.hearts - b.hearts)) {
    const id = `${key}:${e.hearts}`;
    if (hearts >= e.hearts && !seen.includes(id)) return { id, text: e.text };
  }
  return undefined;
}

/** 这人怎么看那人（−5..5；没写就是 0）。 */
export function tieWarmth(fromResidentId: string, toResidentId: string): number {
  return personOf(fromResidentId)?.ties?.[keyOfResident(toResidentId)]?.warmth ?? 0;
}
