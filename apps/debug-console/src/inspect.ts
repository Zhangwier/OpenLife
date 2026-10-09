/**
 * `openlife inspect <pack-dir>` - the Map Pack operator entry point.
 *
 * Without `--load` it is a pure dry run: nothing touches a world, which is what
 * makes it safe to run in CI. With `--load` it additionally proves the pack can
 * actually be registered by a real Simulation, then reports per-command results.
 */

import { Simulation } from "@openlife/simulation";
import { worldGeographyModule } from "@openlife/module-world-geography";
import { mapPackModule } from "@openlife/module-map-pack";
import { formatInspection, inspectMapPack } from "@openlife/module-map-pack";
import { loadMapPack, registerMapPack } from "@openlife/module-map-pack";

export interface InspectCliOptions {
  seed: number;
  load: boolean;
}

export function runInspect(
  directory: string,
  options: InspectCliOptions,
  out: (line: string) => void,
): { ok: boolean } {
  if (!options.load) {
    const loaded = loadMapPack(directory, { dryRun: true });
    process.stdout.write(inspectMapPack(directory));
    return { ok: loaded.ok };
  }

  const loaded = loadMapPack(directory, { dryRun: true });
  if (!loaded.ok || !loaded.pack) {
    process.stdout.write(inspectMapPack(directory));
    return { ok: false };
  }

  const simulation = new Simulation({
    worldSeed: options.seed,
    modules: [worldGeographyModule, mapPackModule],
  });
  const registration = registerMapPack(simulation, loaded.pack);

  process.stdout.write(formatInspection(loaded, { registration }));

  const world = simulation.worldView();
  out("");
  out("World:");
  out(`  registered regions:          ${world.listEntities({ kind: "world-geography.region" }).length}`);
  out(`  registered locations:        ${world.listEntities({ kind: "world-geography.location" }).length}`);
  out(`  registered boundary anchors: ${world.listEntities({ kind: "world-geography.boundary_anchor" }).length}`);
  out(`  adjacency rows:              ${world.listRelations({ type: "world-geography.adjacent_to" }).length}`);
  out("");

  return { ok: loaded.ok && registration.ok };
}
