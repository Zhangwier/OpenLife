/**
 * pack:check -- validate one content pack without running the whole test suite.
 *
 *   npm run pack:check                    every pack under content-packs/
 *   npm run pack:check path/to/my-pack    one pack directory
 *
 * Content authors reach for this because `npm test` takes a minute and buries
 * the one error that matters. This checks exactly the same rules the game
 * applies at load time, and prints every problem with the file it came from.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSettlementPack, validateSettlementPack } from "../modules/settlement-locations/src/content.ts";
import {
  checkExtension, discoverExtensions, EXTENSION_FORMATS, readExtension,
} from "../modules/settlement-locations/src/extensions.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACK_DIR = join(ROOT, "content-packs");
const PACK_URL = new URL("../modules/settlement-locations/data/river-terrace.json", import.meta.url);

function target() {
  const arg = process.argv[2];
  if (!arg) return null;
  return resolve(arg);
}

function main(): number {
  const base = loadSettlementPack(PACK_URL);
  const baseProblems = validateSettlementPack(base);
  if (baseProblems.length) {
    console.error("the base settlement pack itself is invalid:");
    for (const p of baseProblems) console.error("  " + p);
    return 2;
  }

  const one = target();
  if (one && !existsSync(one)) {
    console.error(`no such directory: ${one}`);
    return 2;
  }

  // One pack named on the command line, or every pack that would be loaded.
  let dirs: string[];
  if (one) {
    if (!existsSync(join(one, "manifest.json"))) {
      console.error(`${one} has no manifest.json`);
      return 2;
    }
    dirs = [one];
  } else if (!existsSync(PACK_DIR)) {
    console.log("no content-packs/ directory; nothing to check");
    return 0;
  } else {
    dirs = readdirSync(PACK_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => join(PACK_DIR, e.name));
  }

  if (!dirs.length) {
    console.log("no packs to check");
    return 0;
  }

  let failed = 0;
  for (const dir of dirs) {
    const where = dir.startsWith(ROOT) ? dir.slice(ROOT.length) : dir;
    if (!existsSync(join(dir, "manifest.json"))) {
      console.log(`\n${where}\n  skipped: no manifest.json (not a pack)`);
      continue;
    }
    console.log(`\n${where}`);
    let ext;
    try {
      ext = readExtension(dir);
    } catch (error) {
      console.log(`  FAIL  unreadable: ${(error as Error).message}`);
      failed += 1;
      continue;
    }
    const m = ext.manifest;
    const bits = [
      `${m.id}@${m.version}`,
      `format ${m.formatVersion}`,
      `${ext.items.prototypes?.length ?? 0} 物品`,
      `${ext.recipes.length} 配方`,
      `${ext.incidents.length} 抉择`,
      `${ext.residents.length} 居民`,
      `${ext.dialogue.length} 对话`,
      `${ext.items.places?.length ?? 0} 地点`,
    ];
    console.log("  " + bits.join("  ·  "));
    if (!EXTENSION_FORMATS.includes(m.formatVersion as 1 | 2)) {
      console.log(`  hint: formatVersion must be one of ${EXTENSION_FORMATS.join(", ")}`);
    }
    const problems = checkExtension(ext, base);
    for (const p of problems) console.log("  FAIL  " + p);
    if (problems.length) failed += 1;
    else console.log("  ok");
  }

  console.log("");
  if (failed) {
    console.log(`${failed} pack(s) have problems`);
    return 1;
  }
  console.log(`all ${dirs.length} pack(s) valid`);
  return 0;
}

void discoverExtensions;
process.exit(main());
