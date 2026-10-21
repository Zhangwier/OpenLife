/**
 * Type-check gate.
 *
 * The tree type-checks with zero errors (2026-10-19; it had 251 when type
 * checking was first wired in and a per-file ratchet held them). Node strips
 * types, so a type error never stops the tests - which is how three latent
 * crashes and two tests that asserted nothing went unnoticed. From here on
 * any error fails:
 *
 *   npm run typecheck     tsc --noEmit over the whole workspace; exit 1 on any error
 *
 * A tsc run that fails without a single parseable error line (a broken
 * tsconfig, a crash) fails too.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./workspace-graph.ts";

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

/** The verdict on one tsc run: ok only with no errors and a clean exit. */
export function verdict(output: string, exitCode: number | null): { ok: boolean; total: number; files: ErrorCounts; reason: string } {
  const files = countErrors(output);
  const total = Object.values(files).reduce((a, b) => a + b, 0);
  if (total > 0) return { ok: false, total, files, reason: `${total} errors in ${Object.keys(files).length} files` };
  if (exitCode !== 0) return { ok: false, total, files, reason: `tsc exited with ${exitCode} without reporting a type error` };
  return { ok: true, total, files, reason: "0 errors" };
}

function runTsc(): { output: string; status: number | null } {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json", "--noEmit", "--pretty", "false"], {
    cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  return { output: `${result.stdout ?? ""}${result.stderr ?? ""}`, status: result.status };
}

function main(): void {
  const { output, status } = runTsc();
  const v = verdict(output, status);
  if (!v.ok) {
    process.stderr.write(output.split(/\r?\n/).filter((l) => / error TS\d+:/.test(l)).join("\n") || output);
    process.stderr.write("\n");
  }
  console.log(`typecheck: ${v.reason}`);
  if (!v.ok) process.exitCode = 1;
}

/**
 * True when this file is the process entry point.
 *
 * `new URL(import.meta.url).pathname` is a POSIX path ("/D:/MG/...") on
 * Windows, so comparing it with `path.resolve(argv[1])` ("D:\\MG\\...") was
 * always false here: the gate printed nothing and exited 0 with 119 type
 * errors in the tree. fileURLToPath gives the native path on every platform.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && path.resolve(entry!) === path.resolve(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) main();
