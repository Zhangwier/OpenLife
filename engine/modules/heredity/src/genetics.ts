/**
 * Pure genetics: founders, inheritance, expression and kinship.
 *
 * Genes set CEILINGS only (docs/plans/HEREDITY_INVENTION_PLAN.md §1). What a
 * person actually reaches is decided by food, practice and teaching in other
 * modules; this file never looks at any of that except childhood hunger,
 * which permanently lowers the reachable ceiling.
 */
import { readFileSync } from "node:fs";
import type { DeterministicRngLike } from "@openlife/contracts";

export interface TraitSpec { label: string; base: number; perAllele: number; expression?: "mean" | "dominant" }
export interface LocusSpec { id: string; trait: string }
export interface LookSpec { id: string; label: string; variants: Record<string, string>; dominant: string }
export interface PopulationSpec { label: string; alleleMean: number; alleleSpread: number; looks: Record<string, number> }
export interface GeneticsTuning {
  noise: number; mutationRate: number; inbreedingPenalty: number;
  maxStunting: number; stuntingDays: number; stuntedTraits: string[];
}
export interface GeneticsSpec {
  traits: Record<string, TraitSpec>;
  loci: LocusSpec[];
  appearance: LookSpec[];
  populations: Record<string, PopulationSpec>;
  tuning: GeneticsTuning;
}

export const GENETICS: GeneticsSpec = JSON.parse(readFileSync(new URL("../data/loci.json", import.meta.url), "utf8")) as GeneticsSpec;

/** A person's genome. Numeric loci hold two alleles 0..4, looks two letters. */
export interface Genome {
  loci: Record<string, [number, number]>;
  looks: Record<string, [string, string]>;
  /** Fixed at conception: a little developmental noise per trait. */
  noise: Record<string, number>;
  parents: string[];
  inbreeding: number;
  origin: "founder" | "born" | "migrant";
  population: string;
  bornAt: number;
  /** Traits a fate blessing pushed to the tail of the distribution. */
  blessed: string[];
  mutations: string[];
}

const clampAllele = (n: number) => Math.max(0, Math.min(4, Math.round(n)));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function bell(rng: DeterministicRngLike): number {
  // Sum of three uniforms: cheap, deterministic, roughly normal in [-1.5, 1.5].
  return rng.nextFloat() + rng.nextFloat() + rng.nextFloat() - 1.5;
}

function noiseFor(rng: DeterministicRngLike, spec: GeneticsSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const trait of Object.keys(spec.traits)) out[trait] = Math.round(bell(rng) * spec.tuning.noise / 1.5);
  return out;
}

export function founderGenome(
  rng: DeterministicRngLike, populationId: string, bornAt: number,
  hints: Record<string, "high" | "low"> = {}, origin: "founder" | "migrant" = "founder", spec: GeneticsSpec = GENETICS,
): Genome {
  const pop = spec.populations[populationId] ?? Object.values(spec.populations)[0]!;
  const loci: Record<string, [number, number]> = {};
  for (const locus of spec.loci) {
    const hint = hints[locus.trait];
    const draw = () => hint === "high" ? clampAllele(3 + rng.nextFloat() * 1.4)
      : hint === "low" ? clampAllele(rng.nextFloat() * 1.6)
      : clampAllele(pop.alleleMean + bell(rng) * pop.alleleSpread);
    loci[locus.id] = [draw(), draw()];
  }
  const looks: Record<string, [string, string]> = {};
  for (const look of spec.appearance) {
    const recessive = Object.keys(look.variants).find((k) => k !== look.dominant)!;
    const p = pop.looks[look.id] ?? 0.5;
    const draw = () => rng.chance(p) ? look.dominant : recessive;
    looks[look.id] = [draw(), draw()];
  }
  return { loci, looks, noise: noiseFor(rng, spec), parents: [], inbreeding: 0, origin, population: populationId, bornAt, blessed: [], mutations: [] };
}

/** Mendelian inheritance: one copy from each parent, rare ±1 mutations, optional fate tail. */
export function childGenome(
  rng: DeterministicRngLike, mother: Genome, father: Genome, motherId: string, fatherId: string,
  bornAt: number, inbreeding: number, blessedTraits: string[] = [], spec: GeneticsSpec = GENETICS,
): Genome {
  const loci: Record<string, [number, number]> = {};
  const mutations: string[] = [];
  for (const locus of spec.loci) {
    const m = mother.loci[locus.id] ?? [2, 2];
    const f = father.loci[locus.id] ?? [2, 2];
    let a = m[rng.nextInt(0, 2)]!;
    let b = f[rng.nextInt(0, 2)]!;
    if (rng.chance(spec.tuning.mutationRate)) { a = clampAllele(a + (rng.chance(0.5) ? 1 : -1)); mutations.push(locus.id); }
    if (rng.chance(spec.tuning.mutationRate)) { b = clampAllele(b + (rng.chance(0.5) ? 1 : -1)); mutations.push(locus.id); }
    if (blessedTraits.includes(locus.trait)) { a = 4; b = 4; }
    loci[locus.id] = [a, b];
  }
  const looks: Record<string, [string, string]> = {};
  for (const look of spec.appearance) {
    const m = mother.looks[look.id] ?? [look.dominant, look.dominant];
    const f = father.looks[look.id] ?? [look.dominant, look.dominant];
    looks[look.id] = [m[rng.nextInt(0, 2)]!, f[rng.nextInt(0, 2)]!];
  }
  const noise = noiseFor(rng, spec);
  for (const t of blessedTraits) noise[t] = spec.tuning.noise;
  return {
    loci, looks, noise, parents: [motherId, fatherId], inbreeding: round3(inbreeding),
    origin: "born", population: mother.population, bornAt, blessed: [...blessedTraits], mutations,
  };
}

/** The inborn ceiling for each trait, 5..100, before childhood hunger. */
export function inbornCeilings(genome: Genome, spec: GeneticsSpec = GENETICS): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [traitId, trait] of Object.entries(spec.traits)) {
    const alleles = spec.loci.filter((l) => l.trait === traitId).flatMap((l) => genome.loci[l.id] ?? [2, 2]);
    if (alleles.length === 0) { out[traitId] = 100; continue; }
    const mean = alleles.reduce((s, x) => s + x, 0) / alleles.length;
    const value = trait.expression === "dominant" ? (Math.max(...alleles) + mean) / 2 : mean;
    let ceiling = trait.base + trait.perAllele * value + (genome.noise[traitId] ?? 0);
    if (traitId === "trait:constitution") ceiling -= genome.inbreeding * spec.tuning.inbreedingPenalty;
    out[traitId] = Math.max(5, Math.min(100, Math.round(ceiling)));
  }
  return out;
}

/** Childhood hunger permanently lowers part of the ceiling (at most maxStunting). */
export function stuntingFactor(hungerDays: number, spec: GeneticsSpec = GENETICS): number {
  return round3(Math.min(spec.tuning.maxStunting, Math.max(0, hungerDays) / spec.tuning.stuntingDays));
}

export function reachableCeilings(genome: Genome, childhoodHungerDays: number, spec: GeneticsSpec = GENETICS): Record<string, number> {
  const inborn = inbornCeilings(genome, spec);
  const loss = stuntingFactor(childhoodHungerDays, spec);
  const out: Record<string, number> = {};
  for (const [t, v] of Object.entries(inborn)) out[t] = spec.tuning.stuntedTraits.includes(t) ? Math.round(v * (1 - loss)) : v;
  return out;
}

export function appearance(genome: Genome, spec: GeneticsSpec = GENETICS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const look of spec.appearance) {
    const pair = genome.looks[look.id] ?? [look.dominant, look.dominant];
    const shown = pair.includes(look.dominant) ? look.dominant : pair[0];
    out[look.id] = look.variants[shown] ?? "";
  }
  return out;
}

/**
 * Coefficient of kinship between two people from recorded parents (Wright).
 * Unknown ancestry counts as unrelated; depth is bounded so it stays cheap.
 */
export function kinship(
  a: string, b: string, parentsOf: (id: string) => string[] | undefined, bornAt: (id: string) => number,
  depth = 6, inbreedingOf: (id: string) => number = () => 0,
): number {
  if (!a || !b || depth < 0) return 0;
  if (a === b) return 0.5 * (1 + inbreedingOf(a));
  // Recurse on the younger one so we never walk "down" a line.
  const [older, younger] = bornAt(a) <= bornAt(b) ? [a, b] : [b, a];
  const parents = parentsOf(younger);
  if (!parents || parents.length < 2) return 0;
  return 0.5 * (kinship(older, parents[0]!, parentsOf, bornAt, depth - 1, inbreedingOf)
    + kinship(older, parents[1]!, parentsOf, bornAt, depth - 1, inbreedingOf));
}
