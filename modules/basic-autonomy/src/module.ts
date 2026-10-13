/**
 * Basic autonomous life system pack.
 *
 * This module gives non-player lineage characters a small deterministic life
 * loop while keeping the architecture boundary intact: it never mutates world
 * state. Scheduled decisions become ordinary Commands and therefore still pass
 * through Rule -> Transaction -> Event.
 *
 * It deliberately does not control the active character. Player-facing major
 * choices remain player choices.
 */

import type { CommandIntent, OpenLifeModule } from "@openlife/contracts";
import {
  ModernComponents as MW,
  ModernKinds as MWK,
  WORLD_ENTITY_ID,
} from "@openlife/life-contracts/modern";
import { ageInYearsIn, ticksPerYearIn } from "@openlife/life-contracts";

const OWNER = "basic-autonomy";
const LIFE_TASK = "basic-autonomy.life_year";

export const basicAutonomyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Basic Autonomy",
    description: "A restrained autonomous life loop for non-player lineage characters.",
    requires: [
      "time.calendar",
      "life.population",
      "education.provider",
      "career.provider",
      "family.relationship_provider",
      "family.heir_provider",
    ],
    provides: ["autonomy.basic"],
    capabilities: ["rule.reaction.register", "schedule.register"],
  },

  register(ctx) {
    ctx.registerTask({
      type: LIFE_TASK,
      description: "Once per year, let an inactive lineage character make at most one life decision.",
      handler: (c) => {
        const characterId = String(c.payload.characterId ?? "");
        if (!characterId) return undefined;

        const character = c.world.getEntity(characterId);
        if (!character || character.kind !== MWK.character || character.archivedAt !== undefined) {
          return undefined;
        }

        const vitals = character.components[MW.vitals] ?? {};
        if (vitals.alive === false) return undefined;

        const worldState = c.world.getComponent(WORLD_ENTITY_ID, MW.worldState) ?? {};
        if (worldState.activeCharacterId === characterId) {
          // Never make major life choices for the player-controlled character.
          return undefined;
        }

        const identity = character.components[MW.identity] ?? {};
        const bornAt = Number(identity.bornAt ?? character.createdAt);
        const age = ageInYearsIn(c.world, bornAt, c.world.tick);
        const generation = Number(identity.generation ?? 1);

        const command = lifeDecision(characterId, age, generation);
        if (!command) return undefined;

        c.note("autonomous life decision", {
          characterId,
          age,
          generation,
          commandType: command.type,
        });
        return { command };
      },
    });

    const scheduleCharacter = (
      characterId: string | undefined,
      tick: number,
      year: number,
    ): import("@openlife/contracts").Effect[] => {
      if (!characterId) return [];
      return [
        {
          kind: "scheduleTask",
          taskType: LIFE_TASK,
          afterTicks: year,
          everyTicks: year,
          untilTick: tick + 110 * year,
          payload: { characterId },
          dedupeKey: `life:${characterId}`,
        },
      ];
    };

    ctx.registerReactionRule({
      id: "basic-autonomy.character_created.schedule",
      eventType: "modern.character_created",
      react: (c) => scheduleCharacter(c.event.actorId, c.world.tick, ticksPerYearIn(c.world)),
    });

    ctx.registerReactionRule({
      id: "basic-autonomy.child_born.schedule",
      eventType: "family.child_born",
      react: (c) => scheduleCharacter(c.event.targetId, c.world.tick, ticksPerYearIn(c.world)),
    });
  },
};

function lifeDecision(characterId: string, age: number, generation: number): CommandIntent | undefined {
  if (age === 6) {
    return {
      type: "education.enroll_school",
      actorId: characterId,
      source: "autosim",
      payload: { autonomyCategory: "education" },
    };
  }

  if (age === 18) {
    const occupations = ["engineer", "teacher", "trader"] as const;
    const occupation = occupations[Math.abs(generation - 1) % occupations.length];
    return {
      type: "career.get_job",
      actorId: characterId,
      source: "autosim",
      payload: {
        occupation,
        companyName: "Northport Works",
        autonomyCategory: "career",
      },
    };
  }

  if (age === 24) {
    const spouseNames = ["Kai", "Mira", "Rowan", "Ari"];
    return {
      type: "family.marry",
      actorId: characterId,
      source: "autosim",
      payload: {
        spouseName: spouseNames[Math.abs(generation - 1) % spouseNames.length],
        autonomyCategory: "relationship",
      },
    };
  }

  if (age === 28) {
    const childNames = ["Iris", "Theo", "Noa", "Mina"];
    return {
      type: "family.have_child",
      actorId: characterId,
      source: "autosim",
      payload: {
        givenName: childNames[Math.abs(generation - 1) % childNames.length],
        autonomyCategory: "family",
      },
    };
  }

  if (age === 35) {
    return {
      type: "career.start_business",
      actorId: characterId,
      source: "autosim",
      payload: {
        name: `Generation ${generation} Studio`,
        capital: 5000,
        autonomyCategory: "career",
      },
    };
  }

  return undefined;
}
