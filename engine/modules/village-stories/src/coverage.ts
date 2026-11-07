/**
 * Content coverage: for every villager, which kinds of authored content exist
 * (tastes, heart scenes, seasonal lines, ties, a conversation tree, a routine,
 * a place in the village web, relationship-tier scenes, quests, a portrait),
 * against the floor every villager must reach. Pure reads of the packs; the
 * portrait check is passed in because art lives in the web app.
 *
 * scripts/content-coverage.ts renders this as docs/CONTENT_COVERAGE.md and a
 * test keeps both the floor and the document honest.
 */
import { RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";
import { STORY_PACK } from "./spec.ts";
import { BONDS_PACK } from "./bonds.ts";

export interface CoverageRow {
  key: string; name: string;
  loves: number; heartEvents: number; seasons: number; giftLines: boolean; moods: boolean; ties: number; lines: number;
  dialogueNodes: number; routine: boolean; network: number; tierEvents: number; questsGiven: number; portrait: boolean;
}

/** What every villager must have. A new resident without these fails the coverage test. */
export const COVERAGE_FLOOR = {
  loves: 1, heartEvents: 3, seasons: 4, giftLines: true, moods: true, ties: 1, lines: 1,
  dialogueNodes: 2, network: 1, tierEvents: 1, portrait: true,
} as const;

export function contentCoverage(hasPortrait: (key: string) => boolean): CoverageRow[] {
  const lines = RIVER_TERRACE_PACK.residentLines ?? {};
  return RIVER_TERRACE_PACK.residents.map((r) => {
    const p = RIVER_TERRACE_PACK.people?.[r.key];
    return {
      key: r.key, name: r.name,
      loves: p?.loves.length ?? 0,
      heartEvents: p?.heartEvents?.length ?? 0,
      seasons: Object.keys(p?.seasons ?? {}).length,
      giftLines: Boolean(p?.giftLines),
      moods: Boolean(p?.happy?.length && p?.low?.length),
      ties: Object.keys(p?.ties ?? {}).length,
      lines: lines[r.key]?.length ?? 0,
      dialogueNodes: Object.keys(STORY_PACK.dialogues[r.key]?.nodes ?? {}).length,
      routine: Boolean(BONDS_PACK.routines[r.key]),
      network: BONDS_PACK.network.filter((e) => e.a === r.key || e.b === r.key).length,
      tierEvents: BONDS_PACK.tierEvents.filter((e) => e.npc === r.key).length,
      questsGiven: STORY_PACK.quests.filter((q) => q.giver === r.key).length,
      portrait: hasPortrait(r.key),
    };
  });
}

/** Every gap below the floor, as "name: what is missing". */
export function coverageGaps(rows: CoverageRow[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    for (const [k, floor] of Object.entries(COVERAGE_FLOOR) as [keyof typeof COVERAGE_FLOOR, number | boolean][]) {
      const v = row[k];
      if (typeof floor === "boolean" ? v !== true : Number(v) < floor) out.push(`${row.name}(${row.key}): ${k} ${String(v)} < ${String(floor)}`);
    }
  }
  return out;
}

const mark = (ok: boolean) => (ok ? "✓" : "✗");
export function coverageMarkdown(rows: CoverageRow[]): string {
  const head = "| 村民 | 喜好 | 心事场景 | 四季台词 | 收礼台词 | 心情 | ties | 日常台词 | 对话节点 | 作息 | 关系网 | 等级场景 | 托付任务 | 立绘 |";
  const sep = "|" + " --- |".repeat(14);
  const body = rows.map((r) =>
    `| ${r.name} \`${r.key}\` | ${r.loves} | ${r.heartEvents} | ${r.seasons} | ${mark(r.giftLines)} | ${mark(r.moods)} | ${r.ties} | ${r.lines} | ${r.dialogueNodes} | ${r.routine ? "✓" : "—"} | ${r.network} | ${r.tierEvents} | ${r.questsGiven} | ${mark(r.portrait)} |`);
  const gaps = coverageGaps(rows);
  const floor = Object.entries(COVERAGE_FLOOR).map(([k, v]) => `\`${k}\` ≥ ${String(v)}`).join("，");
  return [
    "# 内容覆盖矩阵",
    "",
    "由 `npm run coverage` 根据数据包生成，不要手改；`npm run coverage -- --check` 与 `tests/unit/content-coverage.test.ts` 会在数据与本文不一致、或有村民低于底线时失败。",
    "",
    `每位村民的底线：${floor}。作息与托付任务不设底线（有固定日程的角色不排作息，任务按剧情需要分配）。`,
    "",
    head, sep, ...body,
    "",
    `合计：${rows.length} 位村民；对话节点 ${rows.reduce((n, r) => n + r.dialogueNodes, 0)} 个；心事场景 ${rows.reduce((n, r) => n + r.heartEvents, 0)} 段；等级场景 ${rows.reduce((n, r) => n + r.tierEvents, 0)} 段；关系网 ${BONDS_PACK.network.length} 条；任务 ${STORY_PACK.quests.length} 条。`,
    "",
    gaps.length ? `## 缺口\n\n${gaps.map((g) => `- ${g}`).join("\n")}` : "缺口：无。",
    "",
  ].join("\n");
}
