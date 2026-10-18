/**
 * 设计令牌体检（CI 用）。
 *
 * 规则来自 docs/design/ui-research/10-横向提炼与UI设计要素规范.md：
 *  1. 字号只能是 10 档阶梯里的值（12/13/14/16/17/20/24/28/32/44），不许野值；
 *  2. theme.css 与 stage.css 之外不许写死十六进制颜色，一律走令牌；
 *  3. 阴影种类要收敛（theme/stage 之外的新增阴影视为回归）。
 *
 * 跑法：node scripts/design-check.ts
 * 退出码 1 表示违反规范，可直接挂进 CI。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = path.join(root, "apps", "web", "public");
/** 字号阶梯。改这里之前先改规范文档。 */
const FONT_LADDER = new Set([12, 13, 14, 16, 17, 20, 24, 28, 32, 44]);
/** 这两个文件是令牌与场景美术层，允许出现原始色值与阴影。 */
const THEME_FILES = new Set(["theme.css", "stage.css"]);

interface Finding { file: string; line: number; rule: string; detail: string }

const findings: Finding[] = [];
const sizes = new Map<number, number>();
const shadows = new Set<string>();
let tokenUses = 0;

for (const file of readdirSync(publicDir).filter((f) => f.endsWith(".css"))) {
  const text = readFileSync(path.join(publicDir, file), "utf8");
  // 注释里刻意留了改版前的色号做记录，逐行检查前先抹掉块注释。
  const code = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const lines = code.split("\n");

  for (const match of text.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    const value = Number(match[1]);
    sizes.set(value, (sizes.get(value) ?? 0) + 1);
    if (!FONT_LADDER.has(value)) {
      findings.push({ file, line: lineOf(text, match.index ?? 0), rule: "字号不在阶梯内", detail: `${value}px` });
    }
  }
  for (const match of text.matchAll(/box-shadow:\s*([^;}\n]+)/g)) shadows.add(match[1].trim());
  tokenUses += (text.match(/var\(--fs-[a-z-]+\)/g) ?? []).length;

  if (THEME_FILES.has(file)) continue;
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      findings.push({ file, line: index + 1, rule: "硬编码颜色", detail: match[0] });
    }
  });
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

const ladderText = [...sizes.entries()].sort((a, b) => a[0] - b[0]).map(([size, count]) => `${size}px×${count}`).join("  ");
console.log(`字号分布：${ladderText}`);
console.log(`var(--fs-*) 使用：${tokenUses} 处`);
console.log(`唯一 box-shadow：${shadows.size} 种`);

if (findings.length) {
  console.error(`\n违反设计规范 ${findings.length} 处：`);
  for (const item of findings.slice(0, 40)) console.error(`  ${item.file}:${item.line}  ${item.rule}  ${item.detail}`);
  if (findings.length > 40) console.error(`  ……还有 ${findings.length - 40} 处`);
  process.exit(1);
}
console.log("\n设计令牌检查通过");
