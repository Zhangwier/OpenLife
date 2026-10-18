/**
 * pack:preview -- show what a content pack contains, in words not JSON.
 *
 *   npm run pack:preview                    every pack under content-packs/
 *   npm run pack:preview path/to/my-pack    one pack directory
 *
 * Content authors reach for this because reading JSON to remember what you
 * wrote is slow. This prints each item, incident, resident and dialogue line
 * in a readable list, so you can check the words before you check the rules.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACK_DIR = join(ROOT, "content-packs");

interface PackLike {
  manifest?: { id?: string; label?: string; description?: string; format?: number };
  items?: Array<{ id: string; name: string; kind?: string; blurb?: string }>;
  incidents?: Array<{ id: string; kind?: string; title: string; line?: string }>;
  residents?: Array<{ key: string; name: string; role?: string; wish?: string }>;
  dialogue?: Record<string, string[]>;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function previewOne(dir: string): void {
  const name = dir.split(/[\\/]/).pop() ?? dir;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  if (!files.length) {
    console.log(`\n=== ${name} ===\n  (empty)`);
    return;
  }

  console.log(`\n=== ${name} ===`);
  for (const file of files) {
    const path = join(dir, file);
    let data: unknown;
    try {
      data = readJson(path);
    } catch {
      console.log(`  ${file}: (invalid JSON)`);
      continue;
    }

    if (file === "manifest.json") {
      const m = data as PackLike["manifest"];
      console.log(`  ${m?.label ?? name} (${m?.id ?? "?"}@${m?.format ?? "?"})`);
      console.log(`  ${m?.description ?? ""}`);
      continue;
    }

    const arr = Array.isArray(data) ? data : [];
    if (file === "items.json") {
      console.log(`  items: ${arr.length}`);
      for (const it of arr.slice(0, 5) as PackLike["items"]) {
        console.log(`    ${it.id} · ${it.name}${it.kind ? ` (${it.kind})` : ""}`);
        if (it.blurb) console.log(`      ${it.blurb.slice(0, 60)}`);
      }
      if (arr.length > 5) console.log(`    ... and ${arr.length - 5} more`);
    } else if (file === "incidents.json") {
      console.log(`  incidents: ${arr.length}`);
      for (const it of arr.slice(0, 5) as PackLike["incidents"]) {
        console.log(`    ${it.id} · ${it.title}${it.kind ? ` (${it.kind})` : ""}`);
        if (it.line) console.log(`      ${it.line.slice(0, 60)}`);
      }
      if (arr.length > 5) console.log(`    ... and ${arr.length - 5} more`);
    } else if (file === "residents.json") {
      console.log(`  residents: ${arr.length}`);
      for (const it of arr.slice(0, 5) as PackLike["residents"]) {
        console.log(`    ${it.key} · ${it.name}${it.role ? ` (${it.role})` : ""}`);
        if (it.wish) console.log(`      wish: ${it.wish.slice(0, 50)}`);
      }
      if (arr.length > 5) console.log(`    ... and ${arr.length - 5} more`);
    } else if (file === "dialogue.json") {
      const d = data as Record<string, string[]>;
      const total = Object.values(d).reduce((n, list) => n + list.length, 0);
      console.log(`  dialogue: ${total} lines across ${Object.keys(d).length} groups`);
      for (const [group, lines] of Object.entries(d).slice(0, 3)) {
        console.log(`    ${group}: ${lines.length} lines`);
        for (const line of lines.slice(0, 2)) {
          console.log(`      ${line.slice(0, 60)}`);
        }
      }
    } else {
      console.log(`  ${file}: ${Array.isArray(data) ? (data as unknown[]).length : "?"} entries`);
    }
  }
}

function main(): number {
  const one = process.argv[2] ? resolve(process.argv[2]) : null;
  if (one && !existsSync(one)) {
    console.error(`no such directory: ${one}`);
    return 2;
  }

  const dirs = one ? [one] : readdirSync(PACK_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(PACK_DIR, d.name));

  if (!dirs.length) {
    console.log("no packs under content-packs/");
    return 0;
  }

  console.log(`previewing ${dirs.length} pack(s)`);
  for (const dir of dirs) previewOne(dir);
  return 0;
}

process.exitCode = main();
