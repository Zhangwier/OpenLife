/**
 * Data-driven crafting for the River Terrace village.
 *
 * One command, `settlement-locations.craft`, runs any recipe from
 * data/river-terrace-recipes.json. Content authors add a recipe by writing
 * data; the rule below enforces it the same way for every recipe:
 *
 *   - the maker stands in the recipe's place and space;
 *   - each input is a live single object the maker owns AND holds (consumed);
 *   - each tool is an object the maker owns and holds (kept);
 *   - the maker has hands / bag room for the outputs once inputs are gone.
 *
 * Outputs are new objects owned and held by the maker, spawned inside the same
 * kernel transaction (INV-001); object ids derive from the command tick and
 * recipe, never from randomness (INV-004).
 */
import type { Effect, WorldView } from "@openlife/contracts";
import {
  ObjectComponents,
  ObjectKinds,
  ObjectRelations,
  canCarryPrototype,
  ownerOf,
  prototypeOf,
  readObject,
} from "@openlife/module-world-objects";
import { occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, type RecipeSpec } from "./content.ts";
import type { Registration } from "./rules.ts";

export const CRAFT_COMMAND = "settlement-locations.craft";
export const CRAFTED_EVENT = "settlement-locations.crafted";

const Rejection = {
  NoSuchRecipe: "E_SETTLEMENT_NO_RECIPE",
  WrongPlace: "E_SETTLEMENT_WRONG_PLACE",
  Missing: "E_SETTLEMENT_EMPTY",
  NoTool: "E_SETTLEMENT_NO_TOOL",
  NoRoom: "E_SETTLEMENT_NO_ROOM",
} as const;

const refuse = (code: string, message: string) => ({ ok: false as const, code, message });

const RECIPES = new Map(RIVER_TERRACE_RECIPES.recipes.map((recipe) => [recipe.id, recipe]));
const PROTOTYPE_NAMES = new Map(RIVER_TERRACE_PACK.prototypes.map((p) => [p.id, p.name]));
const PROTOTYPE_DURABILITY = new Map(RIVER_TERRACE_PACK.prototypes.map((p) => [p.id, p.durability]));
const PLACE_NAMES = new Map(RIVER_TERRACE_PACK.places.map((p) => [p.id, p.name]));
const SPACE_NAMES = new Map(RIVER_TERRACE_PACK.places.flatMap((p) => p.spaces.map((s) => [s.id, s.name] as const)));

export function recipeById(id: string): RecipeSpec | undefined {
  return RECIPES.get(id);
}

/** Live objects of one prototype the actor both owns and holds, stable order. */
function heldOwned(world: WorldView, actorId: string, prototypeId: string): string[] {
  return world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from)
    .filter((id) => {
      const entity = world.getEntity(id);
      if (!entity || entity.archivedAt !== undefined) return false;
      if (ownerOf(world, id) !== actorId || prototypeOf(world, id).prototypeId !== prototypeId) return false;
      return readObject(entity.components[ObjectComponents.object]).quantity <= 1;
    })
    .sort((a, b) => a.localeCompare(b));
}

/** The exact objects a craft would consume, or why it cannot happen now. */
export function planCraft(world: WorldView, actorId: string, recipeId: string):
  { ok: true; recipe: RecipeSpec; consumed: string[] } | { ok: false; code: string; message: string } {
  const recipe = RECIPES.get(recipeId);
  if (!recipe) return refuse(Rejection.NoSuchRecipe, "没有这样的做法。");
  if (occupiedPlaceId(world, actorId) !== recipe.placeId || occupiedSpaceId(world, actorId) !== recipe.spaceId) {
    return refuse(Rejection.WrongPlace,
      `要到${PLACE_NAMES.get(recipe.placeId) ?? recipe.placeId}的${SPACE_NAMES.get(recipe.spaceId) ?? recipe.spaceId}才能${recipe.name}。`);
  }
  const consumed: string[] = [];
  for (const input of recipe.inputs) {
    const held = heldOwned(world, actorId, input.prototypeId);
    if (held.length < input.count) {
      return refuse(Rejection.Missing,
        `${recipe.name}需要亲手拿着自己的${PROTOTYPE_NAMES.get(input.prototypeId)} ${input.count} 份，现在只有 ${held.length} 份。`);
    }
    consumed.push(...held.slice(0, input.count));
  }
  for (const tool of recipe.tools) {
    if (heldOwned(world, actorId, tool).length === 0) {
      return refuse(Rejection.NoTool, `${recipe.name}要用到自己的${PROTOTYPE_NAMES.get(tool)}，先把它拿在手上。`);
    }
  }
  // Inputs leave the hands in the same transaction, so room is checked with
  // them excluded one by one (the largest freed object counts first).
  for (const output of recipe.outputs) {
    const exclude = consumed[0] ?? "";
    const freed = Math.max(0, consumed.length - 1);
    if (!canCarryPrototype(world, actorId, output.prototypeId, exclude, Math.max(1, output.count - freed))) {
      return refuse(Rejection.NoRoom, `做好的${PROTOTYPE_NAMES.get(output.prototypeId)}没地方拿，先腾出双手或行囊。`);
    }
  }
  return { ok: true, recipe, consumed };
}

/** Every recipe with whether the actor could make it right now (for the UI). */
export function craftOptions(world: WorldView, actorId: string) {
  return RIVER_TERRACE_RECIPES.recipes.map((recipe) => {
    const plan = planCraft(world, actorId, recipe.id);
    return { recipeId: recipe.id, name: recipe.name, ready: plan.ok, reason: plan.ok ? "" : plan.message };
  });
}

export function registerCrafting(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${CRAFT_COMMAND}.allowed`,
    commandType: CRAFT_COMMAND,
    evaluate: (c) => {
      const plan = planCraft(c.world, c.command.actorId ?? "", String(c.command.payload.recipeId ?? ""));
      return plan.ok ? { ok: true } : refuse(plan.code, plan.message);
    },
  });
  ctx.registerResolutionRule({
    id: `${CRAFT_COMMAND}.resolve`,
    commandType: CRAFT_COMMAND,
    resolve: (c): Effect[] => {
      const actorId = c.command.actorId as string;
      const plan = planCraft(c.world, actorId, String(c.command.payload.recipeId ?? ""));
      if (!plan.ok) return [];
      const { recipe, consumed } = plan;
      const effects: Effect[] = [];
      for (const objectId of consumed) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy, from: objectId, to: actorId,
          reason: `used up making ${recipe.id}`, announce: false,
        }, {
          kind: "archiveEntity", entityId: objectId, reason: `consumed by ${recipe.id}`, announce: false,
        });
      }
      const made: string[] = [];
      for (const output of recipe.outputs) {
        for (let index = 0; index < output.count; index += 1) {
          const objectId = `settlement-locations:craft:${recipe.id.slice("recipe:".length)}:${actorId}:${c.world.tick}:${consumed[0]}:${output.prototypeId}:${index}`;
          made.push(objectId);
          effects.push({
            kind: "spawnEntity", localId: `craft-${output.prototypeId}-${index}`, id: objectId,
            entityKind: ObjectKinds.item, announce: false,
            components: {
              [ObjectComponents.object]: {
                prototypeId: output.prototypeId, name: PROTOTYPE_NAMES.get(output.prototypeId) ?? output.prototypeId,
                condition: "fresh", quantity: 1, durability: PROTOTYPE_DURABILITY.get(output.prototypeId) ?? 0, madeAt: c.world.tick,
                provenance: { recipeId: recipe.id, maker: actorId, at: c.world.tick, from: consumed },
                visibleFromOutside: false,
              } as unknown as Record<string, never>,
            },
          }, {
            kind: "addRelation", type: ObjectRelations.instanceOf, from: objectId, to: output.prototypeId, announce: false,
          }, {
            kind: "addRelation", type: ObjectRelations.ownedBy, from: objectId, to: actorId, announce: false,
          }, {
            kind: "addRelation", type: ObjectRelations.heldBy, from: objectId, to: actorId, announce: false,
          });
        }
      }
      effects.push({
        kind: "emitEvent", eventType: CRAFTED_EVENT, actorId, targetId: recipe.placeId,
        data: { recipeId: recipe.id, consumed, made },
        historicalSignificance: 0.03,
      });
      return effects;
    },
  });
}
