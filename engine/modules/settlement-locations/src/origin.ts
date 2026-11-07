/**
 * 出身与天赋（纯数据，不碰世界）。
 *
 * 新的人生开始时，玩家选一个出身、一到两个天赋（或交给「随缘」按种子抽取）。
 * 出身决定你从哪里来、带着什么、村里谁一开始就认得你；天赋是几处温和的长处。
 * 内容写在数据包里（origins / talents），这里只负责读取与合并效果。
 * 旧存档没有这项记录，读出来就是「无」：没有任何加成，也不会出错。
 */
import type { JsonValue } from "@openlife/contracts";
import { RIVER_TERRACE_PACK } from "./content.ts";

export interface StartItem { prototypeId: string; count: number }
export interface OriginSpec {
  id: string; name: string;
  /** 一段第二人称的来由，开局写进人生纪事。 */
  story: string;
  /** 这个人心里的第一个念想（方向，而不是任务）。 */
  aspiration: string;
  /** The line told the moment the aspiration comes true. */
  fulfilled?: string;
  /** How the world can tell the aspiration came true. */
  goal?: { kind: "crafted"; recipes: string[] } | { kind: "metAll" } | { kind: "harvested" } | { kind: "trusted"; trust: number };
  items: StartItem[];
  /** 村里一开始就认得你的人（按居民 key）：熟悉 0..10、信任 0..10。 */
  bonds: Record<string, { familiarity?: number; trust?: number }>;
}
export interface TalentEffects {
  /** 每次制作少花的格数（至少仍要 1 格）。 */
  craftActivity?: number;
  /** 全村人一开始多出的熟悉/信任。 */
  startFamiliarity?: number;
  startTrust?: number;
  /** 每次搭话额外的熟悉。 */
  talkFamiliarity?: number;
  /** 雨雪天户外劳作不额外费时。 */
  ignoreWet?: boolean;
  /** 几天涨 1 点饥饿（默认 2）。 */
  hungerDaysPerPoint?: number;
  /** 在芦苇滩、田里取用时多得几份（地里还有、手上拿得下才算）。 */
  plantDrawBonus?: number;
  /** 每顿多解几点饥饿。 */
  mealBonus?: number;
  /** 每天多几格时间。 */
  dailyActivity?: number;
  /** 每天前几趟村内走动不花时间。 */
  freeWalks?: number;
}
export interface TalentSpec { id: string; name: string; blurb: string; effects: TalentEffects; items?: StartItem[] }

export interface PlayerOrigin { id: string; talents: string[]; chosenAt: number }

export const ORIGINS: OriginSpec[] = (RIVER_TERRACE_PACK as unknown as { origins?: OriginSpec[] }).origins ?? [];
export const TALENTS: TalentSpec[] = (RIVER_TERRACE_PACK as unknown as { talents?: TalentSpec[] }).talents ?? [];
export const MAX_TALENTS = 2;
export const NO_ORIGIN: PlayerOrigin = { id: "none", talents: [], chosenAt: -1 };

export const originById = (id: string) => ORIGINS.find((o) => o.id === id);
export const talentById = (id: string) => TALENTS.find((t) => t.id === id);

/** 读存档里的出身记录；缺失或不认识的内容一律当作「无」。 */
export function readOrigin(raw: unknown): PlayerOrigin {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NO_ORIGIN;
  const r = raw as Record<string, JsonValue>;
  const id = typeof r.id === "string" && (r.id === "none" || originById(r.id)) ? r.id : "none";
  const talents = Array.isArray(r.talents) ? r.talents.map(String).filter((t) => talentById(t)).slice(0, MAX_TALENTS) : [];
  return { id, talents, chosenAt: Number.isFinite(Number(r.chosenAt)) ? Number(r.chosenAt) : -1 };
}

/** 把几个天赋的效果合在一起：数值相加，开关取或；饥饿取最慢的。 */
export function mergedEffects(origin: PlayerOrigin): Required<Omit<TalentEffects, "hungerDaysPerPoint">> & { hungerDaysPerPoint: number } {
  const out = { craftActivity: 0, startFamiliarity: 0, startTrust: 0, talkFamiliarity: 0, ignoreWet: false,
    hungerDaysPerPoint: 0, plantDrawBonus: 0, mealBonus: 0, dailyActivity: 0, freeWalks: 0 };
  for (const id of origin.talents) {
    const e = talentById(id)?.effects ?? {};
    out.craftActivity += e.craftActivity ?? 0;
    out.startFamiliarity += e.startFamiliarity ?? 0;
    out.startTrust += e.startTrust ?? 0;
    out.talkFamiliarity += e.talkFamiliarity ?? 0;
    out.ignoreWet = out.ignoreWet || Boolean(e.ignoreWet);
    out.hungerDaysPerPoint = Math.max(out.hungerDaysPerPoint, e.hungerDaysPerPoint ?? 0);
    out.plantDrawBonus += e.plantDrawBonus ?? 0;
    out.mealBonus += e.mealBonus ?? 0;
    out.dailyActivity += e.dailyActivity ?? 0;
    out.freeWalks += e.freeWalks ?? 0;
  }
  return out;
}

/** 校验一个选择；返回问题描述，没有问题返回空串。 */
export function originProblem(originId: string, talents: string[]): string {
  if (!originById(originId)) return "没有这样的出身。";
  if (!Array.isArray(talents) || talents.length > MAX_TALENTS) return `天赋最多选 ${MAX_TALENTS} 个。`;
  if (new Set(talents).size !== talents.length) return "同一个天赋不能选两次。";
  if (talents.some((t) => !talentById(t))) return "没有这样的天赋。";
  return "";
}

/** 「随缘」：同一个种子永远抽到同一个出身和两个天赋（与世界种子一起可复现）。 */
export function rollOrigin(seed: number): { originId: string; talents: string[] } {
  let state = (Number(seed) >>> 0) ^ 0x9e3779b9;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const originId = ORIGINS[Math.floor(next() * ORIGINS.length)]?.id ?? "none";
  const pool = TALENTS.map((t) => t.id);
  const talents: string[] = [];
  while (talents.length < Math.min(MAX_TALENTS, pool.length)) {
    const pick = pool.splice(Math.floor(next() * pool.length), 1)[0]!;
    talents.push(pick);
  }
  return { originId, talents };
}

/** 给界面看的目录。 */
export function originCatalog() {
  return {
    origins: ORIGINS.map((o) => ({ id: o.id, name: o.name, story: o.story, aspiration: o.aspiration })),
    talents: TALENTS.map((t) => ({ id: t.id, name: t.name, blurb: t.blurb })),
    maxTalents: MAX_TALENTS,
  };
}
