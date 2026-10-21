/**
 * Xia fauna: the animals of the northern slopes and the river banks, and the
 * plants they eat, as a content pack for world-vegetation and world-species.
 *
 * The data lives in `data/xia-fauna.json`; this file loads it, checks every
 * diet against something that can actually be eaten (a plant food tag for
 * herbivores, a prey id or tag for predators) and registers it. Hunting,
 * beasts at the village edge and the shan-sao legend are village content
 * (river-terrace), not ecology.
 */
import { readFileSync } from "node:fs";
import type { OpenLifeModule } from "@openlife/contracts";
import type { VegetationApi, VegetationDefinition } from "@openlife/module-world-vegetation";
import type { SpeciesApi, SpeciesDefinition } from "./module.ts";

export interface FaunaPack {
  id: string;
  formatVersion: number;
  vegetation: VegetationDefinition[];
  species: SpeciesDefinition[];
}

/** Every reason the pack could not be eaten through; empty means sound. */
export function validateFaunaPack(pack: FaunaPack): string[] {
  const problems: string[] = [];
  if (pack.formatVersion !== 1) problems.push(`fauna format ${pack.formatVersion} is not 1`);
  const ids = new Set<string>();
  for (const x of [...pack.vegetation, ...pack.species]) {
    if (ids.has(x.id)) problems.push(`duplicate id ${x.id}`);
    ids.add(x.id);
    if (!x.id.startsWith(`${pack.id}.`)) problems.push(`${x.id}: must be namespaced ${pack.id}.`);
  }
  const plantFood = new Set(pack.vegetation.flatMap((v) => v.foodTags));
  const preyTags = new Set(pack.species.filter((s) => s.trophicRole === "herbivore").flatMap((s) => [s.id, ...(s.tags ?? [])]));
  for (const s of pack.species) {
    const edible = s.trophicRole === "herbivore" ? plantFood : preyTags;
    if (!s.diet.some((d) => edible.has(d))) problems.push(`${s.id}: nothing in this pack matches its diet ${s.diet.join(", ")}`);
  }
  return problems;
}

export function loadFaunaPack(url: URL): FaunaPack {
  const pack = JSON.parse(readFileSync(url, "utf8")) as FaunaPack;
  const problems = validateFaunaPack(pack);
  if (problems.length) throw new Error(`fauna pack ${url.pathname} is invalid:\n  ${problems.join("\n  ")}`);
  return pack;
}

export const XIA_FAUNA: FaunaPack = loadFaunaPack(new URL("../data/xia-fauna.json", import.meta.url));

/** Registers the Xia plants and animals (install after world-vegetation and world-species). */
export const xiaFaunaModule: OpenLifeModule = {
  manifest: {
    id: "xia-fauna",
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "Xia Fauna",
    description: "Deer, boar, water deer, hare, wolf, dhole, fox and leopard cat of the Xia northern slopes, with the understory they feed on.",
    requires: ["world.vegetation", "world.species"],
  },
  register(ctx) {
    const vegetation = ctx.registry.capabilityImplementation("world.vegetation") as VegetationApi | undefined;
    const species = ctx.registry.capabilityImplementation("world.species") as SpeciesApi | undefined;
    if (!vegetation || !species) throw new Error("xia fauna requires world.vegetation and world.species");
    for (const v of XIA_FAUNA.vegetation) vegetation.registerDefinition(v);
    for (const s of XIA_FAUNA.species) species.registerDefinition(s);
  },
};
