/**
 * 经济模块：把「一物换一物」变成「有比价的交换」。
 *
 * 这个模块只做三件事：
 *  1. 每个聚落有一份价格表（供给 ÷ 需求，每年更新）
 *  2. 荒年粮价上涨，交换要用更多东西换粮
 *  3. 债的利息和违约概率由价格波动决定
 *
 * 货币制度由 polity 的 institution:currency 开启；集市由 office 的 matter:market 开启。
 */
import type {
  ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import {
  BASE_PRICES, costOf, debtAfterYear, defaultChanceOf, interestOf,
  marketReach, productivityFromSpecialization, updatePrices,
  type Debt, type EconomyState, type Price,
} from "./prices.ts";

export const ECONOMY_OWNER = "economy";
export const EconomyComponents = {
  state: "economy.state",
} as const;

export const EconomyCommands = {
  found: "economy.found",
  year: "economy.year",
} as const;

export const EconomyProjections = {
  prices: "economy.prices",
  debts: "economy.debts",
} as const;

export const ECONOMY_ENTITY = "economy:village";

function readEconomy(world: WorldView): EconomyState | undefined {
  return world.getComponent(ECONOMY_ENTITY, EconomyComponents.state) as unknown as EconomyState | undefined;
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

export const economyModule: OpenLifeModule = {
  manifest: {
    id: ECONOMY_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system",
    name: "经济与交换",
    provides: ["economy.cycle"],
    requires: [],
    optional: ["polity.institutions", "tech.invention", "polity.office"],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: EconomyComponents.state, persist: true, description: "the village's prices, debts, currency and market day" });
    for (const type of Object.values(EconomyCommands)) ctx.registerCommand({ type, description: "Economy action." });

    const save = (world: WorldView, state: EconomyState, why: string): Effect =>
      world.getEntity(ECONOMY_ENTITY)
        ? {
            kind: "setComponent", entityId: ECONOMY_ENTITY, component: EconomyComponents.state,
            value: state as unknown as Record<string, never>, reason: why,
          }
        : {
            kind: "spawnEntity", localId: "economy", id: ECONOMY_ENTITY, entityKind: "economy.village",
            components: { [EconomyComponents.state]: state as unknown as Record<string, never> },
          };

    // ---- found: lay down the village's prices -----------------------------
    ctx.registerConstraintRule({
      id: `${EconomyCommands.found}.allowed`, commandType: EconomyCommands.found,
      evaluate: (c): ConstraintOutcome =>
        readEconomy(c.world) ? refuse("E_ECONOMY_ALREADY", "这村子已经有自己的账了。") : { ok: true },
    });
    ctx.registerResolutionRule({
      id: `${EconomyCommands.found}.resolve`, commandType: EconomyCommands.found,
      resolve: (c): Effect[] => {
        const state: EconomyState = {
          prices: BASE_PRICES,
          debts: [],
          currency: false,
          marketDay: 0,
        };
        return [
          save(c.world, state, "laid down the village's prices"),
          {
            kind: "emitEvent", eventType: "economy.founded", actorId: undefined,
            data: { prices: Object.keys(state.prices) },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // ---- year: update prices, roll debts ----------------------------------
    ctx.registerConstraintRule({
      id: `${EconomyCommands.year}.allowed`, commandType: EconomyCommands.year,
      evaluate: (c): ConstraintOutcome =>
        readEconomy(c.world) ? { ok: true } : refuse("E_ECONOMY_NONE", "先铺这村子的账。"),
    });
    ctx.registerResolutionRule({
      id: `${EconomyCommands.year}.resolve`, commandType: EconomyCommands.year,
      resolve: (c): Effect[] => {
        const state = readEconomy(c.world)!;
        const supply = (c.command.payload.supply ?? {}) as Record<string, number>;
        const demand = (c.command.payload.demand ?? {}) as Record<string, number>;
        const lean = c.command.payload.lean === true;

        const next: EconomyState = {
          ...state,
          prices: updatePrices(state.prices, supply, demand, lean,
            (purpose, ...parts) => c.rng.keyed("economy", purpose, ...parts)),
          debts: state.debts.map((d) => debtAfterYear(d, state.prices)),
        };

        return [
          save(c.world, next, "updated the year's prices"),
          {
            kind: "emitEvent", eventType: "economy.year_updated", actorId: undefined,
            data: { lean, grainRatio: next.prices["resource:grain"]?.ratio ?? 1 },
            historicalSignificance: lean ? 0.1 : 0.02,
          },
        ];
      },
    });

    // ---- projections ------------------------------------------------------
    ctx.registerProjection({
      id: EconomyProjections.prices,
      description: "The village's prices, in words not numbers.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = readEconomy(world);
        if (!state) return { prices: [], line: "这村子还没有自己的账。" };
        const words = (r: number) => r >= 1.5 ? "贵" : r >= 0.8 ? "平" : r >= 0.4 ? "便宜" : "贱";
        return {
          prices: Object.values(state.prices).map((p) => ({
            resourceId: p.resourceId, word: words(p.ratio), trend: p.trend > 0.1 ? "涨" : p.trend < -0.1 ? "跌" : "平",
          })) as unknown as JsonValue,
          line: `今年的粮${words(state.prices["resource:grain"]?.ratio ?? 1)}，柴${words(state.prices["resource:fuel"]?.ratio ?? 1)}。`,
        };
      },
    });

    ctx.registerProjection({
      id: EconomyProjections.debts,
      description: "Who owes whom, and how much.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = readEconomy(world);
        if (!state) return { debts: [], line: "这村子还没有自己的账。" };
        return {
          debts: state.debts.map((d) => ({
            creditor: d.creditor, debtor: d.debtor, amount: d.amount,
          })) as unknown as JsonValue,
          line: state.debts.length ? `村里有 ${state.debts.length} 笔债。` : "村里没有债。",
        };
      },
    });
  },
};

export { BASE_PRICES, costOf, debtAfterYear, defaultChanceOf, interestOf,
  marketReach, productivityFromSpecialization, updatePrices };
export type { Debt, EconomyState, Price };
