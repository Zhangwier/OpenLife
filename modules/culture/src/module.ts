/**
 * 文化模块：让「为什么这样做」不只靠对错道理。
 *
 * 这个模块只做三件事：
 *  1. 每个聚落有一份信仰状态（祖先、地方神灵、天的虔诚度）
 *  2. 禁忌压着对应发明的接受度（动土惊扰祖先 → 采矿推迟）
 *  3. 方言距离影响传播（越远越听不懂）
 *
 * 信仰对象、仪式、禁忌的数据是**规则包**的事；文字是**内容包**的事。
 */
import type {
  ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import {
  BASE_BELIEFS, BASE_RITUALS, BASE_TABOOS,
  acceptanceOf, dialectBarrier, devotionAfterRitual, legitimacyFromBelief,
  standingDecayWithTemple, tabooPenalty,
  type BeliefObject, type CultureState, type Ritual, type Taboo,
} from "./beliefs.ts";

export const CULTURE_OWNER = "culture";
export const CultureComponents = {
  state: "culture.state",
} as const;

export const CultureCommands = {
  found: "culture.found",
  ritual: "culture.ritual",
} as const;

export const CultureProjections = {
  beliefs: "culture.beliefs",
  taboos: "culture.taboos",
} as const;

export const CULTURE_ENTITY = "culture:village";

function readCulture(world: WorldView): CultureState | undefined {
  return world.getComponent(CULTURE_ENTITY, CultureComponents.state) as unknown as CultureState | undefined;
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

export const cultureModule: OpenLifeModule = {
  manifest: {
    id: CULTURE_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system",
    name: "文化与信仰",
    provides: ["culture.beliefs"],
    requires: [],
    optional: ["tech.invention", "polity.institutions", "polity.office"],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: CultureComponents.state, persist: true, description: "the village's beliefs, dialect and ritual memory" });
    for (const type of Object.values(CultureCommands)) ctx.registerCommand({ type, description: "Culture action." });

    const save = (world: WorldView, state: CultureState, why: string): Effect =>
      world.getEntity(CULTURE_ENTITY)
        ? {
            kind: "setComponent", entityId: CULTURE_ENTITY, component: CultureComponents.state,
            value: state as unknown as Record<string, never>, reason: why,
          }
        : {
            kind: "spawnEntity", localId: "culture", id: CULTURE_ENTITY, entityKind: "culture.village",
            components: { [CultureComponents.state]: state as unknown as Record<string, never> },
          };

    // ---- found: lay down the village's beliefs ----------------------------
    ctx.registerConstraintRule({
      id: `${CultureCommands.found}.allowed`, commandType: CultureCommands.found,
      evaluate: (c): ConstraintOutcome =>
        readCulture(c.world) ? refuse("E_CULTURE_ALREADY", "这村子已经有自己的信了。") : { ok: true },
    });
    ctx.registerResolutionRule({
      id: `${CultureCommands.found}.resolve`, commandType: CultureCommands.found,
      resolve: (c): Effect[] => {
        const state: CultureState = {
          beliefs: Object.fromEntries(BASE_BELIEFS.map((b) => [b.id, b.devotion])),
          dialect: 0,
          lastRitual: {},
        };
        return [
          save(c.world, state, "laid down the village's beliefs"),
          {
            kind: "emitEvent", eventType: "culture.founded", actorId: undefined,
            data: { beliefs: Object.keys(state.beliefs) },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // ---- ritual: do a ritual, raise devotion -------------------------------
    ctx.registerConstraintRule({
      id: `${CultureCommands.ritual}.allowed`, commandType: CultureCommands.ritual,
      evaluate: (c): ConstraintOutcome => {
        if (!readCulture(c.world)) return refuse("E_CULTURE_NONE", "这村子还没有自己的信。");
        const ritual = BASE_RITUALS.find((r) => r.id === String(c.command.payload.ritualId ?? ""));
        if (!ritual) return refuse("E_CULTURE_NO_RITUAL", "没有这样的仪式。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${CultureCommands.ritual}.resolve`, commandType: CultureCommands.ritual,
      resolve: (c): Effect[] => {
        const state = readCulture(c.world)!;
        const ritual = BASE_RITUALS.find((r) => r.id === String(c.command.payload.ritualId))!;
        const next: CultureState = {
          ...state,
          beliefs: Object.fromEntries(
            Object.entries(state.beliefs).map(([id, devotion]) =>
              [id, devotionAfterRitual(devotion, ritual,
                (purpose, ...parts) => c.rng.keyed("culture", purpose, ...parts))],
            ),
          ),
          lastRitual: { ...state.lastRitual, [ritual.id]: c.world.tick },
        };
        return [
          save(c.world, next, `did the ${ritual.name} ritual`),
          {
            kind: "emitEvent", eventType: "culture.ritual_done", actorId: undefined,
            data: { ritualId: ritual.id, name: ritual.name },
            historicalSignificance: 0.08,
          },
        ];
      },
    });

    // ---- projections ------------------------------------------------------
    ctx.registerProjection({
      id: CultureProjections.beliefs,
      description: "The village's beliefs and their devotion, in words not numbers.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = readCulture(world);
        if (!state) return { beliefs: [], line: "这村子还没有自己的信。" };
        const words = (d: number) => d >= 0.8 ? "信得很深" : d >= 0.5 ? "信" : d >= 0.3 ? "有点信" : "不大信";
        return {
          beliefs: BASE_BELIEFS.map((b) => ({
            id: b.id, name: b.name, devotion: words(state.beliefs[b.id] ?? 0),
          })) as unknown as JsonValue,
          line: `这村子信${BASE_BELIEFS.filter((b) => (state.beliefs[b.id] ?? 0) > 0.3).map((b) => b.name).join("、")}。`,
        };
      },
    });

    ctx.registerProjection({
      id: CultureProjections.taboos,
      description: "What the village will not do, and why.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = readCulture(world);
        if (!state) return { taboos: [], line: "这村子还没有自己的信。" };
        return {
          taboos: BASE_TABOOS.map((t) => ({
            id: t.id, why: t.why, penalty: t.penalty,
          })) as unknown as JsonValue,
          line: BASE_TABOOS.map((t) => t.why).join("；") + "。",
        };
      },
    });
  },
};

export { BASE_BELIEFS, BASE_RITUALS, BASE_TABOOS,
  acceptanceOf, dialectBarrier, devotionAfterRitual, legitimacyFromBelief,
  standingDecayWithTemple, tabooPenalty };
export type { BeliefObject, CultureState, Ritual, Taboo };
