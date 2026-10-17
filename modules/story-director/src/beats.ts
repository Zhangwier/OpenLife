/**
 * 叙事者手里有哪些"事"可以投放。
 *
 * 为什么只有 id 和档位：事件正文属于内容层（village-stories、内容包的
 * incidents.json），叙事者只决定**今天该出哪一档、轮到哪一件**。这样内容作者
 * 换掉整套事件，节拍逻辑一行都不用改。
 *
 * 名字用 `beat:` 前缀而不是 `incident:`，是为了不冒充别人的内容 id：这些只是
 * 节拍位，谁接住由上层决定。
 */
import { readFileSync } from "node:fs";
import type { StoryTier } from "./director.ts";
import { STORY_TIERS } from "./director.ts";

export interface BeatSpec {
  id: string;
  tier: StoryTier;
  /** 给界面用的一句话，不含任何人的名字。 */
  line: string;
}

interface BeatData {
  id: string;
  formatVersion: number;
  beats: BeatSpec[];
}

export const BEAT_DATA: BeatData = JSON.parse(
  readFileSync(new URL("../data/beats.json", import.meta.url), "utf8"),
) as BeatData;

export const BEATS: readonly BeatSpec[] = BEAT_DATA.beats;

export function beatById(id: string): BeatSpec | undefined {
  return BEATS.find((b) => b.id === id);
}

export function beatsOf(tier: StoryTier): BeatSpec[] {
  return BEATS.filter((b) => b.tier === tier);
}

/**
 * 数据自检：档位拼错、id 重复、某一档空着，都会让叙事者在那一天无话可说。
 * 返回问题清单，空数组表示没问题。
 */
export function beatProblems(beats: readonly BeatSpec[] = BEATS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const beat of beats) {
    if (!beat.id.startsWith("beat:")) problems.push(`beat ${beat.id}: id must start with "beat:"`);
    if (seen.has(beat.id)) problems.push(`beat ${beat.id}: duplicate id`);
    seen.add(beat.id);
    if (!STORY_TIERS.includes(beat.tier)) problems.push(`beat ${beat.id}: unknown tier ${beat.tier}`);
    if (!beat.line.trim()) problems.push(`beat ${beat.id}: no line`);
  }
  for (const tier of STORY_TIERS) {
    if (!beats.some((b) => b.tier === tier)) problems.push(`no beat for tier ${tier}`);
  }
  return problems;
}
