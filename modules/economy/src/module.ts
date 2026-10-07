/**
 * Economy system pack.
 *
 * Adds a small, world-level economic cycle to the modern world without teaching
 * Core what "economy" means. It reacts to the public passage-of-time event and
 * changes only module-owned components through Effects.
 */

import type { Effect, OpenLifeModule } from "@openlife/contracts";
import {
  EconomyComponents as EC,
  type EconomyCityStateComponent,
  type EconomyPhase,
  type EconomyWorldCycleComponent,
} from "@openlife/life-contracts/economy";
import {
  CITY_NORTH,
  CITY_SOUTH,
  WORLD_ENTITY_ID,
} from "@openlife/life-contracts/modern";

const OWNER = "economy";
const PHASES: EconomyPhase[] = ["steady", "expansion", "slowdown", "recovery"];

export const economyModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Economy",
    description: "A restrained city economy cycle that continues beyond the player.",
    requires: ["time.calendar", "life.population", "economy.currency"],
    provides: ["economy.cycle"],
    expects: ["life.population"],
    capabilities: [
      "component.register",
      "rule.reaction.register",
      "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({
      id: EC.worldCycle,
      persist: true,
      description: "Current world economic phase.",
    });
    ctx.registerComponent({
      id: EC.cityState,
      persist: true,
      description: "Visible economic condition of a city.",
    });

    ctx.registerReactionRule({
      id: "economy.world_initialized.seed",
      eventType: "modern.world_initialized",
      react: () => [
        {
          kind: "setComponent",
          entityId: WORLD_ENTITY_ID,
          component: EC.worldCycle,
          value: { phase: "steady", yearsInPhase: 0, cycle: 0 },
          reason: "economy begins with the world",
        },
        ...cityEffects("steady"),
      ],
    });

    ctx.registerReactionRule({
      id: "economy.year_passed.cycle",
      eventType: "modern.year_passed",
      react: (c) => {
        const current = (c.world.getComponent(
          WORLD_ENTITY_ID,
          EC.worldCycle,
        ) ?? {
          phase: "steady",
          yearsInPhase: 0,
          cycle: 0,
        }) as unknown as EconomyWorldCycleComponent;

        const yearsInPhase = Number(current.yearsInPhase ?? 0) + 1;
        const mustChange = yearsInPhase >= 4;
        const mayChange = yearsInPhase >= 2 && c.rng.chance(0.45);
        const change = mustChange || mayChange;

        if (!change) {
          return [
            {
              kind: "modifyComponent",
              entityId: WORLD_ENTITY_ID,
              component: EC.worldCycle,
              patch: { yearsInPhase },
              reason: "economic phase continues",
            },
          ];
        }

        const currentIndex = Math.max(0, PHASES.indexOf(current.phase));
        const nextPhase = PHASES[(currentIndex + 1) % PHASES.length] as EconomyPhase;
        const cycle = Number(current.cycle ?? 0) + (nextPhase === "steady" ? 1 : 0);

        const effects: Effect[] = [
          {
            kind: "setComponent",
            entityId: WORLD_ENTITY_ID,
            component: EC.worldCycle,
            value: { phase: nextPhase, yearsInPhase: 0, cycle },
            reason: "economic cycle moved to its next phase",
          },
          ...cityEffects(nextPhase),
          {
            kind: "emitEvent",
            eventType: "economy.phase_changed",
            actorId: WORLD_ENTITY_ID,
            data: {
              from: current.phase,
              to: nextPhase,
              cycle,
            },
            historicalSignificance: 0.55,
            visibility: "public",
          },
        ];
        return effects;
      },
    });

    ctx.registerProjection({
      id: "economy.overview",
      description: "A natural-language-friendly view of the current economic climate.",
      build: ({ world }) => {
        const cycle = (world.getComponent(WORLD_ENTITY_ID, EC.worldCycle)
          ?? { phase: "steady", yearsInPhase: 0, cycle: 0 }) as unknown as EconomyWorldCycleComponent;
        return {
          phase: cycle.phase,
          label: phaseLabel(cycle.phase),
          note: phaseNote(cycle.phase),
          cities: [CITY_NORTH, CITY_SOUTH].map((cityId) => {
            const city = (world.getComponent(cityId, EC.cityState)
              ?? cityState(cycle.phase, cityId)) as unknown as EconomyCityStateComponent;
            return {
              id: cityId,
              activity: city.activity,
              housing: city.housing,
            };
          }),
        };
      },
    });
  },
};

function cityEffects(phase: EconomyPhase): Effect[] {
  return [CITY_NORTH, CITY_SOUTH].map((cityId) => ({
    kind: "setComponent",
    entityId: cityId,
    component: EC.cityState,
    value: cityState(phase, cityId),
    reason: "city follows the wider economic climate",
  }));
}

function cityState(phase: EconomyPhase, cityId: string): EconomyCityStateComponent {
  const north = cityId === CITY_NORTH;
  switch (phase) {
    case "expansion":
      return { activity: phase, housing: north ? "tight" : "warm" };
    case "slowdown":
      return { activity: phase, housing: "cool" };
    case "recovery":
      return { activity: phase, housing: north ? "warm" : "balanced" };
    default:
      return { activity: phase, housing: "balanced" };
  }
}

function phaseLabel(phase: EconomyPhase): string {
  return {
    steady: "市场平稳",
    expansion: "城市正在扩张",
    slowdown: "经济进入放缓期",
    recovery: "生活重新回暖",
  }[phase];
}

function phaseNote(phase: EconomyPhase): string {
  return {
    steady: "工作与生活保持着相对稳定的节奏。",
    expansion: "组织更活跃，城市里的机会和压力一起增加。",
    slowdown: "人们开始更谨慎地工作、消费和做长期决定。",
    recovery: "经历低潮后，新的机会正在一点点重新出现。",
  }[phase];
}
