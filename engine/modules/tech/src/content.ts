/**
 * The tech graph as data: needs, phenomena, theories (true and false) and
 * inventions. Base content lives in ../data; content packs may add entries
 * with `mergeTechContent` (add-only, same rules as docs/PLUGINS.md §3).
 */
import { readFileSync } from "node:fs";

export interface NeedSpec { label: string }
export interface PhenomenonSpec { label: string }

/** Multiplicative effects: harvest, water, build, pottery, carry, illness, spoilage, floodDamage, observation. */
export type EffectTable = Record<string, number>;

export interface TheorySpec {
  id: string;
  label: string;
  explains: string;
  claim: string;
  /** Agreement with the world's hidden truth, 0..1. Never shown to the player. */
  truth: number;
  needsObservations: number;
  /** Inventions this theory makes far easier to think of and build. */
  principleFor: string[];
  effects: EffectTable & { forewarning?: number; cohesion?: number };
  rivals: string[];
  /** The phenomenon this theory makes predictions about; each occurrence is evidence. */
  predicts?: string;
  /** A custom the village adopts once most people believe it (polity reads it). */
  custom?: string;
}

export interface InventionSpec {
  id: string;
  name: string;
  kind: "tool" | "technique" | "structure" | "custom";
  era: string;
  blurb: string;
  answers: string[];
  difficulty: number;
  principles: string[];
  requires: { materials: string[]; inventions: string[]; capabilities: string[]; institutions: string[]; community?: number };
  grants: string[];
  effects: EffectTable;
}

export interface TechContent {
  needs: Record<string, NeedSpec>;
  phenomena: Record<string, PhenomenonSpec>;
  theories: TheorySpec[];
  inventions: InventionSpec[];
}

const read = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8")) as T;

export function loadBaseTechContent(): TechContent {
  return {
    needs: read<{ needs: Record<string, NeedSpec> }>("needs.json").needs,
    phenomena: read<{ phenomena: Record<string, PhenomenonSpec> }>("phenomena.json").phenomena,
    theories: read<{ theories: TheorySpec[] }>("theories.json").theories,
    inventions: read<{ inventions: InventionSpec[] }>("inventions.json").inventions,
  };
}

/** Every problem with a tech graph; empty when it is sound. */
export function validateTechContent(content: TechContent): string[] {
  const problems: string[] = [];
  const theoryIds = new Set(content.theories.map((t) => t.id));
  const inventionIds = new Set(content.inventions.map((i) => i.id));
  const dup = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) { if (seen.has(id)) problems.push(`duplicate ${kind} ${id}`); seen.add(id); }
  };
  dup("theory", content.theories.map((t) => t.id));
  dup("invention", content.inventions.map((i) => i.id));
  for (const t of content.theories) {
    if (!content.phenomena[t.explains]) problems.push(`theory ${t.id}: unknown phenomenon ${t.explains}`);
    if (t.predicts && !content.phenomena[t.predicts]) problems.push(`theory ${t.id}: predicts unknown phenomenon ${t.predicts}`);
    if (!(t.truth >= 0 && t.truth <= 1)) problems.push(`theory ${t.id}: truth must be in [0, 1]`);
    if (!(t.needsObservations >= 1)) problems.push(`theory ${t.id}: needsObservations must be >= 1`);
    for (const r of t.rivals) if (!theoryIds.has(r)) problems.push(`theory ${t.id}: unknown rival ${r}`);
    for (const p of t.principleFor) if (!inventionIds.has(p)) problems.push(`theory ${t.id}: principle for unknown invention ${p}`);
  }
  for (const i of content.inventions) {
    if (!(i.difficulty >= 0 && i.difficulty <= 100)) problems.push(`invention ${i.id}: difficulty must be in [0, 100]`);
    for (const n of i.answers) if (!content.needs[n]) problems.push(`invention ${i.id}: answers unknown need ${n}`);
    for (const p of i.principles) if (!theoryIds.has(p)) problems.push(`invention ${i.id}: unknown principle ${p}`);
    for (const r of i.requires.inventions) if (!inventionIds.has(r)) problems.push(`invention ${i.id}: requires unknown invention ${r}`);
    for (const [k, v] of Object.entries(i.effects)) if (!(v > 0)) problems.push(`invention ${i.id}: effect ${k} must be > 0`);
  }
  return problems;
}

/** Add-only merge of a content pack's tech entries into a base graph. */
export function mergeTechContent(base: TechContent, extra: Partial<TechContent>, namespace: string): TechContent {
  const problems: string[] = [];
  const owned = (id: string) => id.includes(`${namespace}.`);
  for (const id of Object.keys(extra.needs ?? {})) if (base.needs[id] || !owned(id)) problems.push(`need ${id}: must be new and namespaced ${namespace}.`);
  for (const id of Object.keys(extra.phenomena ?? {})) if (base.phenomena[id] || !owned(id)) problems.push(`phenomenon ${id}: must be new and namespaced ${namespace}.`);
  for (const t of extra.theories ?? []) if (base.theories.some((x) => x.id === t.id) || !owned(t.id)) problems.push(`theory ${t.id}: must be new and namespaced ${namespace}.`);
  for (const i of extra.inventions ?? []) if (base.inventions.some((x) => x.id === i.id) || !owned(i.id)) problems.push(`invention ${i.id}: must be new and namespaced ${namespace}.`);
  const merged: TechContent = {
    needs: { ...base.needs, ...(extra.needs ?? {}) },
    phenomena: { ...base.phenomena, ...(extra.phenomena ?? {}) },
    theories: [...base.theories, ...(extra.theories ?? [])],
    inventions: [...base.inventions, ...(extra.inventions ?? [])],
  };
  problems.push(...validateTechContent(merged));
  if (problems.length) throw new Error(`tech content is invalid:\n  ${problems.join("\n  ")}`);
  return merged;
}
