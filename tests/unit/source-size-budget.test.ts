/**
 * Source size budget (a ratchet).
 *
 * Big files are where modules stop having a structure: settlement-locations'
 * module.ts holds founding, daily actions, exchange, learning, marriage,
 * family and seasons in one place. New files must stay under LIMIT lines.
 * Files already over it are frozen at a ceiling: they may shrink, never grow.
 * When one drops under LIMIT, delete its entry; when it shrinks a lot, lower
 * its ceiling so the space cannot be refilled.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LAYERS, REPO_ROOT } from "../../scripts/workspace-graph.ts";

export const LIMIT = 1200;

/** Existing oversized files and the most lines each may have. */
export const CEILINGS: Record<string, number> = {
  "modules/settlement-locations/src/module.ts": 4972,
  "apps/web/server.ts": 1376,
  "modules/historical-memory/src/module.ts": 1292,
  "modules/world-geography/src/boundary-handshake.ts": 1290,
  "modules/world-objects/src/module.ts": 1223,
};

const SOURCE = /\.(ts|js|mjs|css)$/;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (SOURCE.test(entry.name)) out.push(full);
  }
  return out;
}

function lineCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const root of [...LAYERS, "scripts"]) {
    const dir = path.join(REPO_ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const file of sources(dir)) {
      const text = fs.readFileSync(file, "utf8");
      counts.set(path.relative(REPO_ROOT, file).split(path.sep).join("/"), text.split("\n").length - (text.endsWith("\n") ? 1 : 0));
    }
  }
  return counts;
}

const counts = lineCounts();

test(`new source files stay under ${LIMIT} lines`, () => {
  const over = [...counts].filter(([file, lines]) => lines > LIMIT && !(file in CEILINGS))
    .map(([file, lines]) => `${file}: ${lines} lines (split it, or justify a ceiling)`);
  assert.deepEqual(over, []);
});

test("frozen oversized files never grow past their ceiling", () => {
  const grew = Object.entries(CEILINGS).filter(([file, ceiling]) => (counts.get(file) ?? 0) > ceiling)
    .map(([file, ceiling]) => `${file}: ${counts.get(file)} > ceiling ${ceiling}`);
  assert.deepEqual(grew, []);
});

test("every ceiling entry still names a real oversized file", () => {
  const stale = Object.keys(CEILINGS).filter((file) => !counts.has(file) || counts.get(file)! <= LIMIT)
    .map((file) => `${file} is gone or under ${LIMIT} lines: remove it from CEILINGS`);
  assert.deepEqual(stale, []);
});
