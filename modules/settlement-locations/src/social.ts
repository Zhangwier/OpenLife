/**
 * 村民的见闻与人情账（纯数据，不碰世界）。
 *
 * 每个村民自己记着：
 *  - seen：最近一次见到某人时，那人身上带着什么、在哪里（亲眼见到或听人说起）；
 *  - bonds：对某人的熟悉、信任与怨气；
 *  - asked：上次开口求某人是哪天（不会天天去烦同一个人）。
 *
 * 这些只是村民自己的印象，可能过时、可能是道听途说。真正的交换仍由世界命令
 * 当场校验：记得你有粟，走过来却发现你已经没有了，那就只是白跑一趟。
 */
import type { JsonValue } from "@openlife/contracts";

export interface Sighting { placeId: string; at: number; goods: Record<string, number>; heard?: boolean }
export interface Bond { familiarity: number; trust: number; grudge: number; lastAt: number }
export interface SocialMemory {
  seen: Record<string, Sighting>;
  bonds: Record<string, Bond>;
  asked: Record<string, number>;
}

/** 开口求人后要隔几天才会再求同一个人。 */
export const ASK_COOLDOWN = 3;
/** 一次请求等对方几天，过了就算没回音。 */
export const REQUEST_DAYS = 3;
export const NEUTRAL_TRUST = 5;

const obj = (raw: unknown): Record<string, JsonValue> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, JsonValue> : {};
const num = (v: unknown, d: number) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 10) / 10;

export function readSocial(raw: unknown): SocialMemory {
  const src = obj(raw);
  const seen: Record<string, Sighting> = {};
  for (const [id, v] of Object.entries(obj(src.seen))) {
    const s = obj(v);
    const goods: Record<string, number> = {};
    for (const [r, n] of Object.entries(obj(s.goods))) if (num(n, 0) > 0) goods[r] = num(n, 0);
    seen[id] = { placeId: String(s.placeId ?? ""), at: num(s.at, -1), goods, ...(s.heard ? { heard: true } : {}) };
  }
  const bonds: Record<string, Bond> = {};
  for (const [id, v] of Object.entries(obj(src.bonds))) bonds[id] = bondFrom(obj(v));
  const asked: Record<string, number> = {};
  for (const [id, v] of Object.entries(obj(src.asked))) asked[id] = num(v, -100);
  return { seen, bonds, asked };
}

function bondFrom(b: Record<string, JsonValue>): Bond {
  return {
    familiarity: clamp(num(b.familiarity, 0), 0, 10),
    trust: clamp(num(b.trust, NEUTRAL_TRUST), 0, 10),
    grudge: clamp(num(b.grudge, 0), 0, 10),
    lastAt: num(b.lastAt, -1),
  };
}

export function bondOf(memory: SocialMemory, personId: string): Bond {
  return memory.bonds[personId] ?? { familiarity: 0, trust: NEUTRAL_TRUST, grudge: 0, lastAt: -1 };
}

export function withBond(memory: SocialMemory, personId: string, change: Partial<Record<"familiarity" | "trust" | "grudge", number>>, tick: number): SocialMemory {
  const b = bondOf(memory, personId);
  const next: Bond = {
    familiarity: clamp(round(b.familiarity + (change.familiarity ?? 0)), 0, 10),
    trust: clamp(round(b.trust + (change.trust ?? 0)), 0, 10),
    grudge: clamp(round(b.grudge + (change.grudge ?? 0)), 0, 10),
    lastAt: tick,
  };
  return { ...memory, bonds: { ...memory.bonds, [personId]: next } };
}

/** 见识越高，记得越久。 */
export function memoryDays(wits: number): number { return 3 + Math.round(wits / 2); }

/** 记得谁手上有这样东西（新近的、亲眼见的排前面）。 */
export function whoHas(memory: SocialMemory, resourceId: string, tick: number, wits: number, self: string) {
  const keep = memoryDays(wits);
  return Object.entries(memory.seen)
    .filter(([id, s]) => id !== self && (s.goods[resourceId] ?? 0) > 0 && tick - s.at <= keep)
    .map(([personId, s]) => ({ personId, placeId: s.placeId, count: s.goods[resourceId]!, at: s.at, heard: Boolean(s.heard) }))
    .sort((a, b) => Number(a.heard) - Number(b.heard) || b.at - a.at || a.personId.localeCompare(b.personId));
}

/** 碰面时顺嘴聊起别人：对方比我新近的见闻，我记成「听说」。 */
export function mergeHeard(mine: SocialMemory, theirs: SocialMemory, self: string, speaker: string): SocialMemory {
  const seen = { ...mine.seen };
  for (const [id, s] of Object.entries(theirs.seen)) {
    if (id === self || id === speaker || s.heard) continue;
    if ((seen[id]?.at ?? -1) >= s.at) continue;
    seen[id] = { ...s, heard: true };
  }
  return { ...mine, seen };
}

/**
 * 愿不愿意开口求这个人（越高越愿意；负数表示宁可自己想办法）。
 * 熟、信得过、没怨气、性子合群的人更容易开口；谨慎的人怕欠人情。
 * 对方欠着自己的人情时，开口就是理所当然的事。
 */
export function askEase(bond: Bond, p: { sociability: number; caution: number }, theyOweMe: number, iOweThem: number): number {
  return bond.familiarity * 2.5 + (bond.trust - NEUTRAL_TRUST) * 3 - bond.grudge * 5 +
    p.sociability * 0.15 - p.caution * 0.12 + theyOweMe * 6 - iOweThem * 5;
}

export function toJson(memory: SocialMemory): JsonValue {
  return memory as unknown as JsonValue;
}
