/**
 * Generates docs/CONTENT_COVERAGE.md: which kinds of authored content every
 * villager has, against the floor each must reach.
 *
 *   npm run coverage            # rewrite docs/CONTENT_COVERAGE.md
 *   npm run coverage -- --check # exit 1 if the document is stale or anyone is below the floor
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentCoverage, coverageGaps, coverageMarkdown } from "@openlife/module-village-stories";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COVERAGE_PATH = path.join(ROOT, "docs", "CONTENT_COVERAGE.md");
export const PORTRAITS = path.join(ROOT, "apps", "web", "public", "art", "portraits");
export const hasPortrait = (key: string) => fs.existsSync(path.join(PORTRAITS, `${key}.jpg`));

export function renderCoverage(): { markdown: string; gaps: string[] } {
  const rows = contentCoverage(hasPortrait);
  return { markdown: coverageMarkdown(rows), gaps: coverageGaps(rows) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { markdown, gaps } = renderCoverage();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(COVERAGE_PATH) ? fs.readFileSync(COVERAGE_PATH, "utf8") : "";
    if (current !== markdown) { console.error("docs/CONTENT_COVERAGE.md is stale: run npm run coverage"); process.exit(1); }
    if (gaps.length) { console.error(`below the floor:\n${gaps.join("\n")}`); process.exit(1); }
    console.log("docs/CONTENT_COVERAGE.md is up to date; no villager below the floor.");
  } else {
    fs.writeFileSync(COVERAGE_PATH, markdown);
    console.log(`wrote ${path.relative(ROOT, COVERAGE_PATH)} (${gaps.length} gaps)`);
  }
}
