/**
 * 这两个月里有什么事。
 *
 * 日历只回答一个问题：接下来会发生什么、我要不要为它腾出时间。它不做提醒，
 * 也不替玩家安排——把事摆出来，去不去仍旧由玩家决定。
 *
 * 认知规则与 `happeningsView` 同一套：节庆、集市、农时是全村都看得见的事，
 * 谁都能知道；生日是私事，只有打过交道的人才会进你的日历。见过一面的人只
 * 让你知道「那天有人过生日」，名字要靠问（`settlement-locations.ask_about`）。
 * 完全没打过交道的，日历上不出现——你不知道的事，日历不该替你记得。
 */
import type { WorldView } from "@openlife/contracts";
import { DAYS_PER_MONTH } from "@openlife/life-contracts";
import {
  PEOPLE,
  SettlementComponents,
  acquaintanceOf,
  calendarDate,
  cropGrowDays,
  feastOn,
  feastsOf,
  isBirthday,
  personName,
  seasonOf,
} from "@openlife/module-settlement-locations";
import { STORY_PACK, daysUntil } from "@openlife/module-village-stories";

/** How many days ahead the calendar looks: this month and the next one. */
export const CALENDAR_DAYS = DAYS_PER_MONTH * 2;

const MONTH_NAMES = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** 1 → 一, 10 → 十, 12 → 十二, 20 → 二十, 25 → 二十五. Village dates read like speech. */
export function spoken(n: number): string {
  if (n <= 0) return "零";
  if (n < 10) return DIGITS[n]!;
  if (n === 10) return "十";
  if (n < 20) return `十${DIGITS[n - 10]!}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? `${DIGITS[tens]!}十` : `${DIGITS[tens]!}十${DIGITS[ones]!}`;
}

export const monthName = (month: number): string => `${MONTH_NAMES[(month - 1 + 12) % 12]!}月`;
/** 五月十二 — the way a person would say the date out loud. */
export const dateName = (month: number, day: number): string => `${monthName(month)}${spoken(day)}`;

export type CalendarKind = "feast" | "event" | "crop" | "birthday";

export interface CalendarEntry {
  kind: CalendarKind;
  /** Days from today; 0 is today. */
  offset: number;
  month: number;
  day: number;
  /** What the calendar says about it, already gated by what the player knows. */
  text: string;
  /** False when the entry deliberately withholds a name. */
  named: boolean;
}

export interface CalendarView {
  year: number;
  month: number;
  day: number;
  season: string;
  monthName: string;
  nextMonthName: string;
  entries: CalendarEntry[];
  /** The near end of the same list in prose, for the text view. */
  lines: string[];
}

const YEAR_DAYS = DAYS_PER_MONTH * 12;

/** Days from today until this month/day, looking at most a year ahead. */
export function daysTo(today: { month: number; day: number }, month: number, day: number): number {
  const from = (today.month - 1) * DAYS_PER_MONTH + (today.day - 1);
  const to = (month - 1) * DAYS_PER_MONTH + (day - 1);
  return (to - from + YEAR_DAYS) % YEAR_DAYS;
}

/** The field's crop, read off the plot so it follows real sowings rather than a table. */
function cropEntry(world: WorldView): CalendarEntry {
  const today = calendarDate(world.tick);
  const raw = world.getComponent("place:field", SettlementComponents.cropPlot);
  const seedId = String(raw?.seedId ?? "");
  const sownAt = Number(raw?.sownAt ?? 0);
  const tended = Boolean(raw?.tended ?? false);
  if (!seedId) {
    return { kind: "crop", offset: 0, month: today.month, day: today.day,
      text: "田里空着，什么时候下种都行。", named: true };
  }
  const left = Math.max(0, cropGrowDays(sownAt) - Math.max(0, world.tick - sownAt));
  if (left === 0) {
    return { kind: "crop", offset: 0, month: today.month, day: today.day,
      text: tended ? "田里的粟可以收了。" : "田里的粟长成了，照看一遍就能收。", named: true };
  }
  const date = calendarDate(world.tick + left);
  return { kind: "crop", offset: left, month: date.month, day: date.day,
    text: `田里的粟再过${spoken(left)}天能收。`, named: true };
}

/**
 * Every birthday the player is entitled to know about, spread over the window.
 *
 * A resident the player has never dealt with is not in here at all: nothing has
 * ever told the player that person exists, so a date attached to them would be
 * the calendar remembering something the player was never told.
 */
function birthdayEntries(world: WorldView, actorId: string): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (let offset = 0; offset < CALENDAR_DAYS; offset += 1) {
    const tick = world.tick + offset;
    const date = calendarDate(tick);
    for (const key of Object.keys(PEOPLE)) {
      const id = `settlement-locations:resident:${key}`;
      // 自己的生日不用日历提醒：你知道自己哪天生的。
      if (id === actorId) continue;
      if (!isBirthday(id, tick)) continue;
      if (world.getComponent(id, "modern.vitals")?.alive === false) continue;
      const how = acquaintanceOf(world, actorId, id);
      if (how === "stranger") continue;
      out.push({
        kind: "birthday", offset, month: date.month, day: date.day,
        // 认识的人报名字；只见过一面的，只说那天有人过生日。
        text: how === "acquainted" ? `今天是${personName(world, id)}的生日。` : "有人过生日——是谁还说不准。",
        named: how === "acquainted",
      });
    }
  }
  return out;
}

export function calendarView(world: WorldView, actorId: string): CalendarView {
  const today = calendarDate(world.tick);
  const entries: CalendarEntry[] = [];

  // 1. 节庆：全村的事，日历上直接说日子。
  for (const feast of feastsOf()) {
    const offset = daysTo(today, feast.month, feast.day);
    if (offset > CALENDAR_DAYS) continue;
    entries.push({ kind: "feast", offset, month: feast.month, day: feast.day, text: feast.name, named: true });
  }

  // 2. 限时活动：有窗口的集市、祭典，只在还没错过的时候出现。
  for (const event of STORY_PACK.limitedEvents ?? []) {
    const inDays = daysUntil(world.tick, event);
    if (inDays > CALENDAR_DAYS) continue;
    const date = calendarDate(world.tick + inDays);
    entries.push({ kind: "event", offset: inDays, month: date.month, day: date.day, text: event.name, named: true });
  }

  // 3. 农时与生日。
  entries.push(cropEntry(world));
  entries.push(...birthdayEntries(world, actorId));

  entries.sort((a, b) => a.offset - b.offset || a.kind.localeCompare(b.kind));

  const next = calendarDate(world.tick + DAYS_PER_MONTH);
  return {
    year: Math.floor(world.tick / YEAR_DAYS) + 1,
    month: today.month,
    day: today.day,
    season: seasonOf(world.tick),
    monthName: monthName(today.month),
    nextMonthName: monthName(next.month),
    entries,
    lines: entries.slice(0, 8).map((e) => {
      const when = e.offset === 0 ? "今天" : `${dateName(e.month, e.day)}（还有${spoken(e.offset)}天）`;
      return `${when} · ${e.text}`;
    }),
  };
}

/** Today, as the calendar would say it. Kept for callers that want the date alone. */
export function todayLine(world: WorldView): string {
  const d = calendarDate(world.tick);
  return `${seasonOf(world.tick)} · ${dateName(d.month, d.day)}`;
}

// `feastOn` is re-exported so a caller holding only a tick (a test, a hint line)
// does not have to import the settlement package as well.
export { feastOn };
