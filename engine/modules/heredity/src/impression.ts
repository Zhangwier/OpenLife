/**
 * Turning a genome into words someone could actually notice (认知层).
 * Strangers see looks; acquaintances see what a person is visibly good at;
 * only close people guess at "the makings" of a child. Never a number.
 */
import { GENETICS, appearance, type Genome } from "./genetics.ts";

export type Familiarity = "stranger" | "seen" | "known" | "close";

const HIGH: Record<string, string> = {
  "trait:strength": "力气大", "trait:endurance": "能吃苦、干活不歇", "trait:constitution": "身子骨结实，难得生病",
  "trait:cold-tolerance": "不怕冷", "trait:dexterity": "手巧", "trait:perception": "眼尖，什么都看得见",
  "trait:insight": "学东西快，爱琢磨", "trait:memory": "记性好",
};
const LOW: Record<string, string> = {
  "trait:strength": "身板单薄", "trait:constitution": "身子弱，常闹病", "trait:dexterity": "手有点笨",
};
const MAKINGS: Record<string, string> = {
  "trait:dexterity": "做手艺的料", "trait:insight": "读得懂天时、想得出新法子的料",
  "trait:strength": "下地扛活的好劳力", "trait:memory": "能把老辈人的话都记住的人",
};

export function impressionLines(genome: Genome, ceilings: Record<string, number>, familiarity: Familiarity, parents: Genome[] = []): string[] {
  const looks = appearance(genome);
  const lines = [`${looks["look:skin"] ?? ""}，${looks["look:hair"] ?? ""}，${looks["look:brow"] ?? ""}${looks["look:face"] ?? ""}。`];
  if (familiarity === "stranger") return lines;
  const ranked = Object.entries(ceilings).sort((a, b) => b[1] - a[1]);
  const strong = ranked.filter(([, v]) => v >= 78).map(([t]) => HIGH[t]).filter(Boolean) as string[];
  const weak = ranked.filter(([, v]) => v <= 32).map(([t]) => LOW[t]).filter(Boolean) as string[];
  if (familiarity === "seen") {
    const body = ["trait:strength", "trait:constitution"].filter((t) => (ceilings[t] ?? 0) >= 78).map((t) => HIGH[t]!);
    if (body.length) lines.push(`看上去${body.join("，")}。`);
    return lines;
  }
  if (strong.length) lines.push(`处久了才知道，这人${strong.slice(0, 2).join("，")}。`);
  if (weak.length) lines.push(`就是${weak[0]}。`);
  if (familiarity === "close") {
    const best = ranked.find(([t]) => MAKINGS[t]);
    if (best && best[1] >= 75) lines.push(`老人们说，这是块${MAKINGS[best[0]]}。`);
    for (const p of parents) {
      const pl = appearance(p);
      const shared = GENETICS.appearance.filter((l) => pl[l.id] === looks[l.id]).length;
      if (shared >= 4) { lines.push("眉眼跟爹娘里的一个活脱脱一个模子。"); break; }
    }
    if (genome.inbreeding >= 0.12) lines.push("家里老人私下叹气：亲上加亲，孩子身子弱。");
  }
  return lines;
}
