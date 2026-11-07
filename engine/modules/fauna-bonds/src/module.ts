/**
 * Human-animal bonds.
 *
 * Wild animals normally live only as aggregate populations in world-species
 * (LOD L3). When a person actually deals with one, it is materialized into an
 * individual entity (§19) with its own memory of people: trust, fear and
 * grudges are per-person, so an animal can love its keeper and hate the
 * hunter who hurt it.
 *
 * Domestication is gated by content, not by the engine: only species tagged
 * `domesticable` can be tamed, so each era pack decides which animals exist
 * as domestic animals (dogs and pigs early, horses much later, ...).
 *
 *   wild --feed--> habituated --tame--> tame
 *   harm: grudge up, trust to 0, a tame animal leaves its keeper
 */

import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import type { SpeciesApi } from "@openlife/module-world-species";

const OWNER = "fauna-bonds";
const CAPABILITY = "fauna.individuals";

export const FaunaKinds = { animal: "fauna-bonds.animal" } as const;
export const FaunaComponents = { animal: "fauna-bonds.animal" } as const;
export const FaunaRelations = { companionOf: "fauna-bonds.companion_of" } as const;

export type FaunaStage = "wild" | "habituated" | "tame";
export type FaunaAttitude = "friendly" | "wary" | "fearful" | "hostile";

export interface FaunaBond {
  trust: number;
  grudge: number;
  /** Tick this person last fed the animal; one feeding per person per tick. */
  lastFedAt?: number;
}

export interface FaunaAnimal {
  speciesId: string;
  name: string;
  locationId: string;
  stage: FaunaStage;
  fear: number;
  bonds: Record<string, FaunaBond>;
  keeperId: string | null;
  materializedAt: number;
}

export interface FaunaApi {
  animal(world: WorldView, animalId: string): FaunaAnimal | undefined;
  attitude(world: WorldView, animalId: string, personId: string): FaunaAttitude | undefined;
}

export const FaunaTuning = {
  feedTrust: 0.15,
  predatorFeedFactor: 0.5,
  habituateAt: 0.4,
  tameAt: 0.6,
  harmGrudge: 0.5,
  harmFear: 0.3,
} as const;

export const faunaBondsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Fauna Bonds Prototype",
    description: "Materialize individual animals from species populations; feeding, taming, harm and per-person memory.",
    requires: ["world.species"],
    provides: [CAPABILITY],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const species = ctx.registry.capabilityImplementation("world.species") as SpeciesApi | undefined;
    if (!species) throw new Error("fauna bonds requires world.species");

    const api: FaunaApi = {
      animal: (world, id) => readAnimal(world, id),
      attitude(world, id, personId) {
        const animal = readAnimal(world, id);
        if (!animal) return undefined;
        const bond = animal.bonds[personId] ?? { trust: 0, grudge: 0 };
        const predator = species.getDefinition(animal.speciesId)?.trophicRole === "predator";
        if (bond.grudge >= FaunaTuning.harmGrudge) return predator ? "hostile" : "fearful";
        if (animal.keeperId === personId || bond.trust >= FaunaTuning.habituateAt) return "friendly";
        if (animal.fear >= 0.6) return "fearful";
        return "wary";
      },
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({ id: FaunaComponents.animal, persist: true, description: "An individual animal and its memory of people." });
    ctx.registerRelation({ id: FaunaRelations.companionOf, persist: true, allowedFrom: [FaunaKinds.animal] });

    for (const [type, description] of [
      ["fauna-bonds.materialize", "Turn one animal of a local species population into an individual."],
      ["fauna-bonds.feed", "Feed an animal; builds trust with the feeder."],
      ["fauna-bonds.tame", "Try to tame a habituated animal of a domesticable species."],
      ["fauna-bonds.harm", "Hurt an animal; it remembers who did it."],
    ] as const) ctx.registerCommand({ type, description });

    ctx.registerConstraintRule({
      id: "fauna-bonds.materialize.allowed",
      commandType: "fauna-bonds.materialize",
      evaluate: (c) => {
        const locationId = c.command.targetId;
        const speciesId = String(c.command.payload.speciesId ?? "");
        if (!locationId || !c.world.hasEntity(locationId)) return { ok: false, code: "E_FAUNA_LOCATION", message: "target must be an existing location" };
        if (!species.getDefinition(speciesId)) return { ok: false, code: "E_FAUNA_SPECIES", message: `unknown species ${speciesId}` };
        const pop = species.populations(c.world, locationId).find((p) => p.speciesId === speciesId);
        if (!pop || pop.population < 1) return { ok: false, code: "E_FAUNA_NO_POPULATION", message: "no such animals live here" };
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "fauna-bonds.materialize.resolve",
      commandType: "fauna-bonds.materialize",
      resolve: (c) => {
        const speciesId = String(c.command.payload.speciesId);
        const def = species.getDefinition(speciesId)!;
        const animal: FaunaAnimal = {
          speciesId,
          name: String(c.command.payload.name ?? def.name),
          locationId: c.command.targetId as string,
          stage: "wild",
          fear: round3(def.trophicRole === "predator" ? 0.3 : 0.5 + c.rng.nextFloat() * 0.2),
          bonds: {},
          keeperId: null,
          materializedAt: c.world.tick,
        };
        return [{
          kind: "spawnEntity",
          localId: "animal",
          entityKind: FaunaKinds.animal,
          components: { [FaunaComponents.animal]: animal as unknown as Record<string, JsonValue> },
        }];
      },
    });

    const needAnimalAndActor = (commandType: string) =>
      ctx.registerConstraintRule({
        id: `${commandType}.allowed`,
        commandType,
        evaluate: (c) => {
          if (!c.command.actorId || !c.world.hasEntity(c.command.actorId)) return { ok: false, code: "E_FAUNA_ACTOR", message: "an existing actor is required" };
          if (!c.command.targetId || !readAnimal(c.world, c.command.targetId)) return { ok: false, code: "E_FAUNA_ANIMAL", message: "target must be an individual animal" };
          return { ok: true };
        },
      });
    needAnimalAndActor("fauna-bonds.feed");
    needAnimalAndActor("fauna-bonds.tame");
    needAnimalAndActor("fauna-bonds.harm");

    ctx.registerConstraintRule({
      id: "fauna-bonds.feed.once_per_tick",
      commandType: "fauna-bonds.feed",
      evaluate: (c) => {
        const animal = c.command.targetId ? readAnimal(c.world, c.command.targetId) : undefined;
        if (animal?.bonds[c.command.actorId ?? ""]?.lastFedAt === c.world.tick) {
          return { ok: false, code: "E_FAUNA_ALREADY_FED", message: "already fed it today" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "fauna-bonds.feed.resolve",
      commandType: "fauna-bonds.feed",
      resolve: (c) => {
        const id = c.command.targetId as string;
        const actor = c.command.actorId as string;
        const animal = readAnimal(c.world, id)!;
        const def = species.getDefinition(animal.speciesId);
        const bond = { ...(animal.bonds[actor] ?? { trust: 0, grudge: 0 }) };
        let gain = FaunaTuning.feedTrust * (1 - animal.fear * 0.5);
        if (def?.trophicRole === "predator") gain *= FaunaTuning.predatorFeedFactor;
        if (bond.grudge > 0) gain *= 0.5;
        bond.trust = round3(Math.min(1, bond.trust + gain));
        bond.lastFedAt = c.world.tick;
        const patch: Partial<FaunaAnimal> = {
          bonds: { ...animal.bonds, [actor]: bond },
          fear: round3(Math.max(0, animal.fear - 0.05)),
        };
        const effects: Effect[] = [];
        if (animal.stage === "wild" && bond.trust >= FaunaTuning.habituateAt) {
          patch.stage = "habituated";
          effects.push(event("fauna-bonds.habituated", actor, id, { speciesId: animal.speciesId }, 0.05));
        }
        effects.unshift(modify(id, patch, "fed by a person"));
        return effects;
      },
    });

    ctx.registerConstraintRule({
      id: "fauna-bonds.tame.ready",
      commandType: "fauna-bonds.tame",
      evaluate: (c) => {
        const animal = c.command.targetId ? readAnimal(c.world, c.command.targetId) : undefined;
        if (!animal) return { ok: true };
        const tags = species.getDefinition(animal.speciesId)?.tags ?? [];
        if (!tags.includes("domesticable")) return { ok: false, code: "E_FAUNA_NOT_DOMESTICABLE", message: "this kind of animal cannot be tamed (yet)" };
        if (animal.stage === "tame") return { ok: false, code: "E_FAUNA_ALREADY_TAME", message: "already tame" };
        const trust = animal.bonds[c.command.actorId ?? ""]?.trust ?? 0;
        if (animal.stage !== "habituated" || trust < FaunaTuning.tameAt) {
          return { ok: false, code: "E_FAUNA_NOT_TRUSTING", message: "the animal does not trust you enough yet; keep feeding it", details: { trust } };
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: "fauna-bonds.tame.resolve",
      commandType: "fauna-bonds.tame",
      resolve: (c) => {
        const id = c.command.targetId as string;
        const actor = c.command.actorId as string;
        const animal = readAnimal(c.world, id)!;
        const trust = animal.bonds[actor]!.trust;
        const chance = Math.min(0.95, trust * (1 - animal.fear * 0.5));
        if (!c.rng.chance(chance)) {
          c.note("taming failed", { chance });
          return [
            modify(id, { fear: round3(Math.min(1, animal.fear + 0.1)) }, "startled by a taming attempt"),
            event("fauna-bonds.taming_failed", actor, id, { chance: round3(chance) }, 0.01),
          ];
        }
        return [
          modify(id, { stage: "tame", keeperId: actor }, "tamed"),
          { kind: "addRelation", type: FaunaRelations.companionOf, from: id, to: actor },
          event("fauna-bonds.tamed", actor, id, { speciesId: animal.speciesId, name: animal.name }, 0.2),
        ];
      },
    });

    ctx.registerResolutionRule({
      id: "fauna-bonds.harm.resolve",
      commandType: "fauna-bonds.harm",
      resolve: (c) => {
        const id = c.command.targetId as string;
        const actor = c.command.actorId as string;
        const animal = readAnimal(c.world, id)!;
        const prev = animal.bonds[actor] ?? { trust: 0, grudge: 0 };
        const bond: FaunaBond = { trust: 0, grudge: round3(Math.min(1, prev.grudge + FaunaTuning.harmGrudge)), ...(prev.lastFedAt !== undefined ? { lastFedAt: prev.lastFedAt } : {}) };
        const patch: Partial<FaunaAnimal> = {
          bonds: { ...animal.bonds, [actor]: bond },
          fear: round3(Math.min(1, animal.fear + FaunaTuning.harmFear)),
        };
        const effects: Effect[] = [];
        if (animal.keeperId === actor) {
          patch.keeperId = null;
          patch.stage = "wild";
          effects.push({ kind: "removeRelation", type: FaunaRelations.companionOf, from: id, to: actor, reason: "harmed by its keeper" });
        }
        effects.unshift(modify(id, patch, "harmed by a person"));
        effects.push(event("fauna-bonds.harmed", actor, id, { grudge: bond.grudge }, 0.03));
        return effects;
      },
    });

    ctx.registerProjection({
      id: "fauna-bonds.animal",
      description: "One animal as a given person experiences it.",
      build: ({ world, params }) => {
        const animalId = String(params.animalId ?? "");
        const animal = readAnimal(world, animalId);
        if (!animal) return { exists: false, animalId };
        const personId = params.personId ? String(params.personId) : undefined;
        return {
          exists: true,
          animalId,
          name: animal.name,
          speciesId: animal.speciesId,
          stage: animal.stage,
          keeperId: animal.keeperId,
          ...(personId ? { attitude: api.attitude(world, animalId, personId), bond: animal.bonds[personId] ?? null } : {}),
        };
      },
    });
  },
};

function readAnimal(world: WorldView, id: string): FaunaAnimal | undefined {
  const entity = world.getEntity(id);
  if (!entity || entity.kind !== FaunaKinds.animal || entity.archivedAt !== undefined) return undefined;
  return entity.components[FaunaComponents.animal] as unknown as FaunaAnimal | undefined;
}

function modify(entityId: string, patch: Partial<FaunaAnimal>, reason: string): Effect {
  return { kind: "modifyComponent", entityId, component: FaunaComponents.animal, patch: patch as unknown as Record<string, JsonValue>, reason };
}

function event(eventType: string, actorId: string, targetId: string, data: Record<string, JsonValue>, significance: number): Effect {
  return { kind: "emitEvent", eventType, actorId, targetId, data, historicalSignificance: significance };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
