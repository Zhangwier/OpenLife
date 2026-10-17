/**
 * Heredity (禀赋): genes set the ceilings of body and mind, never the result.
 *
 * Founders and migrants get a genome drawn from a population; children get one
 * copy of every locus from each parent, rare mutations, and the inbreeding
 * coefficient of their parents' kinship (which lowers constitution). Childhood
 * hunger permanently trims part of the reachable ceiling.
 *
 * Nothing here is shown to the player as numbers: `heredity.impression` turns
 * a genome into what someone who knows the person could plausibly notice.
 * Other modules read ceilings through the `life.heredity` capability and fall
 * back to 100 when this plugin is switched off.
 */
import type { JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  GENETICS, appearance, childGenome, founderGenome, inbornCeilings, kinship, reachableCeilings, type Genome,
} from "./genetics.ts";
import { impressionLines, type Familiarity } from "./impression.ts";

const OWNER = "heredity";
export const HEREDITY_CAPABILITY = "life.heredity";

export const HeredityComponents = {
  genome: "heredity.genome",
  development: "heredity.development",
} as const;

export interface Development { childhoodHungerDays: number }

/** What a fate plugin may offer: a pending blessing for the next child of these parents. */
export interface BirthBlessingSource {
  pendingBirth(world: WorldView, motherId: string, fatherId: string): { blessingId: string; traits: string[] } | undefined;
}

export interface HeredityApi {
  genome(world: WorldView, personId: string): Genome | undefined;
  /** Reachable ceiling 0..100 for a trait; 100 when the person has no genome. */
  ceiling(world: WorldView, personId: string, traitId: string): number;
  ceilings(world: WorldView, personId: string): Record<string, number>;
  kinship(world: WorldView, a: string, b: string): number;
  traitIds(): string[];
}

const ADULT_AGE_TICKS = 7 * 360;

function readGenome(world: WorldView, id: string): Genome | undefined {
  return world.getComponent(id, HeredityComponents.genome) as unknown as Genome | undefined;
}
function readDevelopment(world: WorldView, id: string): Development {
  return (world.getComponent(id, HeredityComponents.development) as unknown as Development | undefined) ?? { childhoodHungerDays: 0 };
}
function kin(world: WorldView, a: string, b: string): number {
  return kinship(a, b, (id) => readGenome(world, id)?.parents, (id) => readGenome(world, id)?.bornAt ?? 0, 6,
    (id) => readGenome(world, id)?.inbreeding ?? 0);
}

export const heredityModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Heredity",
    description: "Genomes that set the ceilings of body and mind; Mendelian inheritance, mutation, inbreeding and childhood stunting.",
    provides: [HEREDITY_CAPABILITY],
    optional: ["fate.perturbation"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "projection.register"],
  },

  register(ctx) {
    const registry = ctx.registry;
    const api: HeredityApi = {
      genome: readGenome,
      ceiling: (world, id, trait) => {
        const g = readGenome(world, id);
        return g ? reachableCeilings(g, readDevelopment(world, id).childhoodHungerDays)[trait] ?? 100 : 100;
      },
      ceilings: (world, id) => {
        const g = readGenome(world, id);
        return g ? reachableCeilings(g, readDevelopment(world, id).childhoodHungerDays) : {};
      },
      kinship: kin,
      traitIds: () => Object.keys(GENETICS.traits),
    };
    ctx.provideCapability(HEREDITY_CAPABILITY, api);

    ctx.registerComponent({ id: HeredityComponents.genome, persist: true, description: "Inherited loci, appearance, parents and inbreeding coefficient." });
    ctx.registerComponent({ id: HeredityComponents.development, persist: true, description: "Childhood conditions that trimmed the reachable ceilings." });

    ctx.registerCommand({ type: "heredity.found", description: "Give a founder or migrant (target) a genome drawn from a population.", params: { population: "population id", hints: "{traitId: high|low}", origin: "founder | migrant" } });
    ctx.registerCommand({ type: "heredity.inherit", description: "Give a newborn (target) a genome from its two parents.", params: { motherId: "entity id", fatherId: "entity id" } });
    ctx.registerCommand({ type: "heredity.record_hunger", description: "A child (target) went hungry for some days.", params: { days: "number" } });

    const targetExists = (type: string) => ctx.registerConstraintRule({
      id: `${type}.target`,
      commandType: type,
      evaluate: (c) => c.command.targetId && c.world.hasEntity(c.command.targetId)
        ? { ok: true } : { ok: false, code: "E_HEREDITY_TARGET", message: "target must be an existing person" },
    });
    targetExists("heredity.found");
    targetExists("heredity.inherit");
    targetExists("heredity.record_hunger");

    ctx.registerConstraintRule({
      id: "heredity.found.once",
      commandType: "heredity.found",
      evaluate: (c) => readGenome(c.world, c.command.targetId ?? "")
        ? { ok: false, code: "E_HEREDITY_EXISTS", message: "this person already has a genome" } : { ok: true },
    });
    ctx.registerResolutionRule({
      id: "heredity.found.resolve",
      commandType: "heredity.found",
      resolve: (c) => {
        const target = c.command.targetId!;
        const population = String(c.command.payload.population ?? "population:river-terrace");
        const hints = (c.command.payload.hints ?? {}) as Record<string, "high" | "low">;
        const origin = c.command.payload.origin === "migrant" ? "migrant" : "founder";
        const bornAt = Number(c.command.payload.bornAt ?? c.world.tick - 20 * 360);
        // A2: a founder's genome keyed by (module, purpose, person) — stable
        // no matter when or how many founders came before.
        const genome = founderGenome(c.rng.keyed("heredity", "founder", target), population, bornAt, hints, origin);
        return [{ kind: "setComponent", entityId: target, component: HeredityComponents.genome, value: genome as unknown as Record<string, JsonValue>, reason: `${origin} genome` }];
      },
    });

    ctx.registerConstraintRule({
      id: "heredity.inherit.parents",
      commandType: "heredity.inherit",
      evaluate: (c) => {
        const m = String(c.command.payload.motherId ?? "");
        const f = String(c.command.payload.fatherId ?? "");
        if (!readGenome(c.world, m) || !readGenome(c.world, f)) return { ok: false, code: "E_HEREDITY_PARENTS", message: "both parents need a genome" };
        if (readGenome(c.world, c.command.targetId ?? "")) return { ok: false, code: "E_HEREDITY_EXISTS", message: "this person already has a genome" };
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "heredity.inherit.resolve",
      commandType: "heredity.inherit",
      resolve: (c) => {
        const child = c.command.targetId!;
        const motherId = String(c.command.payload.motherId);
        const fatherId = String(c.command.payload.fatherId);
        const fate = registry.capabilityImplementation("fate.perturbation") as BirthBlessingSource | undefined;
        const blessing = fate?.pendingBirth(c.world, motherId, fatherId);
        // A2: a child's genome keyed by (module, purpose, child) — stable no
        // matter how many children came before.
        const genome = childGenome(c.rng.keyed("heredity", "child", child), readGenome(c.world, motherId)!, readGenome(c.world, fatherId)!, motherId, fatherId,
          c.world.tick, kin(c.world, motherId, fatherId), blessing?.traits ?? []);
        const data: Record<string, JsonValue> = { motherId, fatherId, inbreeding: genome.inbreeding, mutations: genome.mutations };
        if (blessing) data.blessingId = blessing.blessingId;
        return [
          { kind: "setComponent", entityId: child, component: HeredityComponents.genome, value: genome as unknown as Record<string, JsonValue>, reason: "inherited" },
          { kind: "emitEvent", eventType: "heredity.born", targetId: child, data, historicalSignificance: blessing ? 0.3 : 0.01 },
        ];
      },
    });

    ctx.registerResolutionRule({
      id: "heredity.record_hunger.resolve",
      commandType: "heredity.record_hunger",
      resolve: (c) => {
        const target = c.command.targetId!;
        const genome = readGenome(c.world, target);
        // Only childhood hunger leaves a lasting mark.
        if (!genome || c.world.tick - genome.bornAt > ADULT_AGE_TICKS) return [];
        const days = Math.max(0, Number(c.command.payload.days ?? 0));
        const prev = readDevelopment(c.world, target);
        return [{ kind: "setComponent", entityId: target, component: HeredityComponents.development, value: { childhoodHungerDays: prev.childhoodHungerDays + days }, reason: "childhood hunger" }];
      },
    });

    ctx.registerProjection({
      id: "heredity.person",
      description: "System/debug view of one genome: inborn and reachable ceilings, appearance, inbreeding.",
      build: ({ world, params }) => {
        const id = String(params.personId ?? "");
        const genome = readGenome(world, id);
        if (!genome) return { personId: id, known: false };
        return {
          personId: id, known: true, origin: genome.origin, parents: genome.parents, inbreeding: genome.inbreeding,
          inborn: inbornCeilings(genome), reachable: api.ceilings(world, id), appearance: appearance(genome), blessed: genome.blessed,
        };
      },
    });
    ctx.registerProjection({
      id: "heredity.impression",
      description: "What an observer at a given familiarity could notice about a person; never numbers.",
      build: ({ world, params }) => {
        const id = String(params.personId ?? "");
        const genome = readGenome(world, id);
        if (!genome) return { personId: id, lines: [] };
        const familiarity = String(params.familiarity ?? "stranger") as Familiarity;
        const parentLooks = genome.parents.map((p) => readGenome(world, p)).filter((g): g is Genome => !!g);
        return { personId: id, lines: impressionLines(genome, api.ceilings(world, id), familiarity, parentLooks) };
      },
    });
  },
};
