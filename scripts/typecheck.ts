/**
 * Type-check ratchet.
 *
 * The tree had ~250 TypeScript errors when type checking was first wired in
 * (none of them break the tests: Node strips types). Fixing them all at once
 * is a separate job; letting them grow is not acceptable. This script runs
 * `tsc --noEmit` over the whole workspace and compares the error count per
 * file with scripts/typecheck-baseline.json:
 *
 *   npm run typecheck          fail if any file has more errors than its baseline
 *                              (or a file without a baseline has any)
 *   npm run typecheck:update   rewrite the baseline after fixing errors
 *
 * The baseline may only go down; review a baseline diff like code.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { REPO_ROOT } from "./workspace-graph.ts";

export const BASELINE_PATH = path.join(REPO_ROOT, "scripts", "typecheck-baseline.json");

export type ErrorCounts = Record<string, number>;

/** Parses `file(line,col): error TSxxxx: ...` lines into per-file counts. */
export function countErrors(output: string): ErrorCounts {
  const counts: ErrorCounts = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^(.+?)\(\d+,\d+\): error TS\d+:/.exec(line);
    if (!match) continue;
    const file = match[1]!.split(path.sep).join("/");
    counts[file] = (counts[file] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export interface RatchetReport {
  /** Files with more errors than allowed: [file, now, allowed]. */
  regressions: [string, number, number][];
  /** Files with fewer errors than the baseline: [file, now, baseline]. */
  improvements: [string, number, number][];
}

export function compare(now: ErrorCounts, baseline: ErrorCounts): RatchetReport {
  const regressions: RatchetReport["regressions"] = [];
  const improvements: RatchetReport["improvements"] = [];
  for (const [file, count] of Object.entries(now)) {
    const allowed = baseline[file] ?? 0;
    if (count > allowed) regressions.push([file, count, allowed]);
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const count = now[file] ?? 0;
    if (count < allowed) improvements.push([file, count, allowed]);
  }
  return { regressions, improvements };
}

function runTsc(): string {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--noEmit", "--pretty", "false"], {
    cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function main(): void {
  const now = countErrors(runTsc());
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  if (process.argv.includes("--update")) {
    fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(now, null, 2)}\n`);
    console.log(`typecheck baseline written: ${total} errors in ${Object.keys(now).length} files`);
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as ErrorCounts;
  const report = compare(now, baseline);
  for (const [file, count, allowed] of report.regressions) console.error(`REGRESSION ${file}: ${count} errors (baseline ${allowed})`);
  for (const [file, count, was] of report.improvements) console.log(`improved   ${file}: ${count} errors (baseline ${was}) - run npm run typecheck:update`);
  console.log(`typecheck: ${total} errors in ${Object.keys(now).length} files; ${report.regressions.length} regressions`);
  if (report.regressions.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
