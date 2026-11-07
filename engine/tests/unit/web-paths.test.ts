/**
 * `new URL(...).pathname` is not a filesystem path.
 *
 * On Windows it looks like "/D:/MG/program/OpenLife/..." - strip the leading slash
 * and it happens to work. On the Linux runner it is "/home/runner/work/..." and
 * stripping the leading slash leaves "home/runner/work/...", a relative path that
 * does not exist. A test built that way found zero example packs locally and zero
 * on CI, and only CI was red: the local run passed because the stripped string was
 * still a usable absolute path.
 *
 * `fileURLToPath` is the only correct conversion. Printing `.pathname` inside an
 * error message is fine - it is shown to a person, not opened - so that case is
 * left alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SKIP = new Set(["node_modules", ".git", ".tmp", "artifacts", "dist", "build"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** `fs` calls that take a path and would silently look in the wrong place. */
const OPENS = /\b(?:readdirSync|readFileSync|existsSync|statSync|openSync|createReadStream|writeFileSync|mkdtempSync)\s*\(/;

test("nothing turns a file URL into a path by hand", () => {
  const offenders: string[] = [];
  for (const file of walk(ROOT)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (!line.includes(".pathname")) return;
      const where = `${path.relative(ROOT, file)}:${index + 1}`;
      // Rewriting the URL's path is always a bug: the slash that comes off is the
      // one that made it absolute on POSIX.
      if (/\.pathname\s*\.\s*(?:replace|slice|substring|split|trim)/.test(line)) {
        offenders.push(`${where} rewrites .pathname: ${line.trim()}`);
        return;
      }
      // Handing .pathname straight to the filesystem is the same mistake, quieter.
      if (OPENS.test(line) && /\.pathname\b/.test(line)) {
        offenders.push(`${where} opens .pathname: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "use fileURLToPath(new URL(...)) instead of .pathname");
});
