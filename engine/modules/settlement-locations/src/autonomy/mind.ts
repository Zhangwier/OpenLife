/**
 * 村民的性格（0..100）与属性（1..10）。只依赖数据包，界面和大脑共用。
 */
import { RIVER_TERRACE_PACK, type Personality, type Attributes, type ResidentSpec } from "../content.ts";

const residentIdOf = (key: string) => `settlement-locations:resident:${key}`;

// ---------------------------------------------------------------- 性格与属性
export interface Mind { personality: Personality; attributes: Attributes }

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** 数据包里写了就用写的；没写就按名字稳定推一个，并按年龄修正体力。 */
export function mindOf(spec: Pick<ResidentSpec, "key" | "age"> & Partial<Mind>): Mind {
  const pick = (salt: string, lo: number, hi: number) => lo + (hash(spec.key + ":" + salt) % (hi - lo + 1));
  const ageStrength = spec.age < 12 ? -4 : spec.age < 16 ? -2 : spec.age > 55 ? -3 : 0;
  return {
    personality: spec.personality ?? {
      diligence: pick("dil", 30, 90), sociability: pick("soc", 20, 90), generosity: pick("gen", 25, 85),
      caution: pick("cau", 20, 85), curiosity: pick("cur", 20, 90),
    },
    attributes: spec.attributes ?? {
      strength: clamp(pick("str", 4, 9) + ageStrength, 1, 10), dexterity: pick("dex", 3, 9), wits: pick("wit", 3, 9),
    },
  };
}

/** 给界面看的性格词：只挑最突出的两三个。 */
export function temperamentWords(mind: Mind): string[] {
  const p = mind.personality;
  const words: Array<[number, string]> = [
    [p.diligence - 50, p.diligence >= 50 ? "勤快" : "散漫"],
    [p.sociability - 50, p.sociability >= 50 ? "合群" : "孤僻"],
    [p.generosity - 50, p.generosity >= 50 ? "慷慨" : "吝啬"],
    [p.caution - 50, p.caution >= 50 ? "谨慎" : "随性"],
    [p.curiosity - 50, p.curiosity >= 50 ? "好奇" : "守旧"],
  ];
  return words.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]) || a[1].localeCompare(b[1]))
    .filter(([d]) => Math.abs(d) >= 15).slice(0, 3).map(([, w]) => w);
}

export function residentMind(actorId: string): Mind | undefined {
  const spec = RIVER_TERRACE_PACK.residents.find((r) => residentIdOf(r.key) === actorId);
  return spec ? mindOf(spec) : undefined;
}

