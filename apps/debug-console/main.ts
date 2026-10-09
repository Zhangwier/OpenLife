/**
 * OpenLife debug console entry point.
 *
 *   node apps/debug-console/main.ts                              interactive REPL
 *   node apps/debug-console/main.ts demo modern-world            scripted modern life
 *   node apps/debug-console/main.ts demo magic-test-world        scripted magic world
 *   node apps/debug-console/main.ts script <file>                run a command file
 *   node apps/debug-console/main.ts inspect <pack-dir>           validate a Map Pack
 *   node apps/debug-console/main.ts inspect <pack-dir> --load    validate and register it
 *   node apps/debug-console/main.ts geography <pack-dir>         inspect the geography graph
 *   node apps/debug-console/main.ts handshake <A> <B> [--connect] find/create boundary seams
 */

import { createInterface } from "node:readline";
import { readFileSync, statSync } from "node:fs";
import type { OpenLifeModule } from "@openlife/contracts";
import { careerModule } from "@openlife/module-career";
import { educationModule } from "@openlife/module-education";
import { familyModule } from "@openlife/module-family";
import { magicTestWorldModule } from "@openlife/module-magic-test-world";
import { mapPackModule } from "@openlife/module-map-pack";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldGeographyModule } from "@openlife/module-world-geography";
import { DebugConsole } from "./src/console.ts";
import { runMagicDemo, runModernDemo } from "./src/demos.ts";
import { runInspect } from "./src/inspect.ts";
import { inspectGeography } from "./src/geography.ts";
import { runHandshake } from "./src/handshake.ts";

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

  if (mode === "handshake") {
    const [pathA, pathB] = [args[1], args[2]];
    if (!pathA || !pathB) {
      process.stderr.write(
        "usage: handshake <packA-dir> <packB-dir> [--connect] [--placement=edgeA:edgeB] [--seed=N]\n",
      );
      process.exit(1);
    }
    const placementFlag = args.find((argument) => argument.startsWith("--placement="));
    const distance = readNumberFlag(args, "--distanceKm");
    const terrain = readNumberFlag(args, "--terrainCost");
    const { ok, report } = runHandshake(pathA, pathB, {
      seed,
      connect: args.includes("--connect"),
      ...(placementFlag ? { placement: placementFlag.slice("--placement=".length) } : {}),
      ...(distance !== undefined ? { distanceKm: distance } : {}),
      ...(terrain !== undefined ? { terrainCost: terrain } : {}),
    });
    process.stdout.write(report);
    process.exit(ok ? 0 : 1);
  }

  if (mode === "geography") {
    const target = args[1];
    if (!target) {
      process.stderr.write("usage: geography <pack-directory> [--seed=N]\n");
      process.exit(1);
    }
    let directory: string;
    try {
      if (!statSync(target).isDirectory()) throw new Error("not a directory");
      directory = target;
    } catch {
      process.stderr.write(`geography: not a readable map pack directory: ${target}\n`);
      process.exit(1);
    }
    const { ok, report } = inspectGeography(directory, { seed });
    process.stdout.write(report);
    process.exit(ok ? 0 : 1);
  }

  if (mode === "inspect") {
    const target = args[1];
    if (!target) {
      process.stderr.write("usage: inspect <pack-directory> [--load] [--seed=N]\n");
      process.exit(1);
    }
    let directory: string;
    try {
      if (!statSync(target).isDirectory()) throw new Error("not a directory");
      directory = target;
    } catch {
      process.stderr.write(`inspect: not a readable map pack directory: ${target}\n`);
      process.exit(1);
    }
    const { ok } = runInspect(directory, { seed, load: args.includes("--load") }, out);
    process.exit(ok ? 0 : 1);
  }

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

export { mapPackModule, worldGeographyModule };

main(process.argv);
