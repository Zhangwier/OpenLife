import type { OpenLifeModule } from "@openlife/contracts";

/**
 * The same module with its autonomous agents left out (M4-B).
 *
 * For tests of one mechanic in isolation (a stock, a recipe, a barter rule)
 * where villagers living their own days would change the numbers under test.
 * The manifest is unchanged, so saves load into it and back.
 */
export function withoutAgents(module: OpenLifeModule): OpenLifeModule {
  return {
    ...module,
    register(ctx) {
      module.register({ ...ctx, registry: ctx.registry, registerAgent: () => {} });
    },
  };
}
