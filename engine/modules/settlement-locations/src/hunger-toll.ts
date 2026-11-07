/**
 * What hunger costs a player who keeps their own days (split out of module.ts):
 * the derived hunger level and the activity units it takes away.
 */
import type { WorldView } from "@openlife/contracts";
import { HUNGER_DAYS_PER_POINT, hungerAt } from "./hunger.ts";
import { mergedEffects, readOrigin } from "./origin.ts";
import { SettlementComponents, SettlementId } from "./vocabulary.ts";

const talentFx = (world: WorldView, actorId: string) =>
  mergedEffects(readOrigin(world.getComponent(actorId, SettlementComponents.holding)?.origin));

/** Hunger is derived from the world's day clock, not an extra ticking timer. */
export function hungerLevel(world: WorldView, actorId: string): number {
  const state = world.getComponent(actorId, SettlementComponents.holding);
  const settlementStart = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  const since = Number(state?.hungerAt ?? settlementStart ?? world.tick);
  const base = Number(state?.hunger ?? 0);
  return hungerAt(base, since, world.tick, talentFx(world, actorId).hungerDaysPerPoint || HUNGER_DAYS_PER_POINT);
}

/**
 * 饿着肚子干不动活。只对玩家这一类自己过日子的人生效（村民有自己的脑子和口粮），
 * 全部从饥饿值与世界时钟推算，不另记计时器。
 *  - 饥饿 6–7：少 1 格；8–9：少 2 格；10：少 3 格
 *  - 饿到 10 之后又熬了 HUNGER_SICK_DAYS 天：饿病，再少 2 格
 * 再饿也留 HUNGER_MIN_CAPACITY 格：够走到公灶吃上一口，永远有回头路。
 *
 * 建村时用 `hungerToll: true` 决定这条规矩是否生效：新开的 Web 人生打开它，
 * 旧存档与只测单一机制的世界不带，行为与从前一致。
 */
export const HUNGER_MIN_CAPACITY = 2;
export const HUNGER_SICK_DAYS = 6;
export function hungerToll(world: WorldView, actorId: string): { units: number; starvingDays: number; sick: boolean; line: string } {
  const none = { units: 0, starvingDays: 0, sick: false, line: "" };
  if (world.getComponent(actorId, SettlementComponents.resident)) return none;
  if (world.getComponent(SettlementId, SettlementComponents.settlement)?.hungerToll !== true) return none;
  const holding = world.getComponent(actorId, SettlementComponents.holding);
  const hunger = hungerLevel(world, actorId);
  if (hunger < 6) return none;
  const dpp = talentFx(world, actorId).hungerDaysPerPoint || HUNGER_DAYS_PER_POINT;
  const settlementStart = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  const since = Number(holding?.hungerAt ?? settlementStart ?? world.tick);
  const base = Number(holding?.hunger ?? 0);
  const reachedTen = since + Math.max(0, 10 - base) * dpp;
  const starvingDays = hunger >= 10 ? Math.max(0, world.tick - reachedTen) : 0;
  const sick = starvingDays >= HUNGER_SICK_DAYS;
  const units = (hunger >= 10 ? 3 : hunger >= 8 ? 2 : 1) + (sick ? 2 : 0);
  const line = sick ? "饿病了：头晕腿软，什么活都干不动。先去公灶或找人讨一口吃的。"
    : hunger >= 10 ? "饿得眼前发黑，今天只能勉强做一点事。"
    : hunger >= 8 ? "饿得发慌，干活没力气。"
    : "肚子饿了，手脚慢了些。";
  return { units, starvingDays, sick, line };
}
