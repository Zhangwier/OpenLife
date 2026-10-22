/**
 * 这一局里"我大概在干什么、接下来会怎样"的那几块。
 *
 * 阶段 2 与阶段 3 的模块（村子目标、叙事者、秘密、愿望、人生阶段、远行）各自
 * 都注册了投影，但网页端此前一个都没读——玩家看不到它们存在。这里把投影收成
 * 一份，`server.ts` 只挂一行，`apps/web/public` 只认一个 `outlook` 字段。
 *
 * 一条硬规矩：**不下发任何"你本不该知道"的东西**。秘密只给听说/确知两档，
 * 愿望只给自己的恐惧，日历只给打过交道的人的生日。投影本身已经这么做了，
 * 这里不再做二次裁剪——但也不额外加料。
 */
import type { Simulation } from "@openlife/simulation";
import { calendarView, type CalendarView } from "./calendar.ts";

export interface Outlook {
  /** 这两个月有什么事：节庆、集市、农时、认识的谁过生日。 */
  calendar: CalendarView;
  /** 村子走到哪一级、下一级差什么。 */
  goals: Record<string, unknown> | null;
  /** 这一阵村里的气氛，以及下一件事大概是什么档。 */
  director: Record<string, unknown> | null;
  /** 你听说或确知的心事。不知的一条都不在这里。 */
  secrets: Record<string, unknown> | null;
  /** 你自己的恐惧：哪些地方会让你难受。 */
  wants: Record<string, unknown> | null;
  /** 这一生在哪一段，这一段能做什么。 */
  life: Record<string, unknown> | null;
  /** 从这里能去的地方。 */
  travel: Record<string, unknown> | null;
}

const EMPTY_CALENDAR: CalendarView = {
  year: 1, month: 1, day: 1, season: "春", monthName: "一月", nextMonthName: "二月",
  entries: [], lines: [],
};

/**
 * Read the projections once.
 *
 * A projection that is not registered (module switched off, an old save opened
 * before the module existed) answers `ok: false`; that is not an error worth
 * logging — it just means the panel is not there this run.
 */
export function outlookOf(sim: Simulation, actorId: string): Outlook {
  const world = sim.worldView();
  const read = (id: string): Record<string, unknown> | null => {
    const projected = sim.project({ id, params: { actorId } });
    return projected.ok ? (projected.data as Record<string, unknown>) : null;
  };
  return {
    calendar: actorId ? calendarView(world, actorId) : EMPTY_CALENDAR,
    goals: read("settlement-goals.progress"),
    director: read("story-director.status"),
    secrets: read("village-secrets.known"),
    wants: read("village-wants.player"),
    life: read("life-stages.life"),
    travel: read("travel.destinations"),
  };
}
