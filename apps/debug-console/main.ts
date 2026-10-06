/**
 * OpenLife debug console entry point.
 *
 *   node apps/debug-console/main.ts                        interactive REPL
 *   node apps/debug-console/main.ts demo modern-world      scripted modern life
 *   node apps/debug-console/main.ts demo magic-test-world  scripted magic world
 *   node apps/debug-console/main.ts script <file>          run a command file
 */

import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import type { OpenLifeModule } from "@openlife/contracts";
import { careerModule } from "@openlife/module-career";
import { educationModule } from "@openlife/module-education";
import { familyModule } from "@openlife/module-family";
import { magicTestWorldModule } from "@openlife/module-magic-test-world";
import { modernWorldModule } from "@openlife/module-modern-world";
import { DebugConsole } from "./src/console.ts";
import { runMagicDemo, runModernDemo } from "./src/demos.ts";

export const MODERN_MODULES: OpenLifeModule[] = [
  modernWorldModule,
  educationModule,
  careerModule,
  familyModule,
];

export const MAGIC_MODULES: OpenLifeModule[] = [magicTestWorldModule];

function main(argv: string[]): void {
  const args = argv.slice(2);
  const seed = readNumberFlag(args, "--seed") ?? 20261007;
  const mode = args[0];
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  if (mode === "demo") {
    const world = args[1] ?? "modern-world";
    if (world === "magic-test-world") runMagicDemo(seed, MAGIC_MODULES, out);
    else runModernDemo(seed, MODERN_MODULES, out);
    return;
  }

  if (mode === "script") {
    const file = args[1];
    if (!file) {
      process.stderr.write("usage: script <file>\n");
      process.exit(1);
    }
    const console_ = new DebugConsole({ seed, modules: MODERN_MODULES });
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      out(`> ${trimmed}`);
      console_.run(trimmed);
    }
    return;
  }

  const console_ = new DebugConsole({ seed, modules: MODERN_MODULES });
  out(`OpenLife debug console (seed=${seed}). Type "help" for commands.`);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "openlife> ",
  });
  rl.prompt();
  rl.on("line", (line) => {
    try {
      console_.run(line);
    } catch (error) {
      out(`error: ${(error as Error).message}`);
    }
    rl.prompt();
  });
  rl.on("close", () => out(""));
}

function readNumberFlag(args: string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  return Number.isFinite(value) ? value : undefined;
}

main(process.argv);
