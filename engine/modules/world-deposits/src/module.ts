/**
 * 矿藏模块：把「哪里有什么矿」变成世界里真实存在的东西。
 *
 * 这个模块只做三件事：
 *  1. 生成一张矿藏图（受岩性和水系约束，同一个种子结果固定）
 *  2. 回答「这个政体周围有没有这种矿」
 *  3. 给 tech 一个材料门槛：没有矿也没有贸易路线，就造不出
 *
 * 矿藏是**规则包**的事：标签名、生成规则、约束逻辑。内容包只管外观与文字。
 */
import type {
  ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import {
  DEPOSIT_TO_MATERIAL, MATERIAL_TO_DEPOSIT, depositsNear, describeDeposits,
  generateDeposits, hasDeposit, meetsDepositRequirement, missingDeposit,
  type Deposit, type DepositMap,
} from "./deposits.ts";

export const DEPOSITS_OWNER = "world-deposits";
export const DepositsComponents = {
  map: "world-deposits.map",
} as const;

export const DepositsCommands = {
  generate: "world-deposits.generate",
} as const;

export const DepositsProjections = {
  map: "world-deposits.map",
  near: "world-deposits.near",
} as const;

export const DEPOSITS_ENTITY = "world-deposits:map";

function readMap(world: WorldView): DepositMap | undefined {
  return world.getComponent(DEPOSITS_ENTITY, DepositsComponents.map) as unknown as DepositMap | undefined;
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

export const worldDepositsModule: OpenLifeModule = {
  manifest: {
    id: DEPOSITS_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "矿藏与资源分布",
    provides: ["world.deposits"],
    requires: [],
    optional: ["tech.invention"],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: DepositsComponents.map, persist: true, description: "the deposit map: where copper, tin, iron, coal, salt, flint and good clay lie" });
    for (const type of Object.values(DepositsCommands)) ctx.registerCommand({ type, description: "Deposits action." });

    const save = (world: WorldView, map: DepositMap, why: string): Effect =>
      world.getEntity(DEPOSITS_ENTITY)
        ? {
            kind: "setComponent", entityId: DEPOSITS_ENTITY, component: DepositsComponents.map,
            value: map as unknown as Record<string, never>, reason: why,
          }
        : {
            kind: "spawnEntity", localId: "deposits", id: DEPOSITS_ENTITY, entityKind: "world-deposits.map",
            components: { [DepositsComponents.map]: map as unknown as Record<string, never> },
          };

    // ---- generate: lay out the deposit map --------------------------------
    ctx.registerConstraintRule({
      id: `${DepositsCommands.generate}.allowed`, commandType: DepositsCommands.generate,
      evaluate: (c): ConstraintOutcome =>
        readMap(c.world) ? refuse("E_DEPOSITS_ALREADY", "矿藏图已经铺开了。") : { ok: true },
    });
    ctx.registerResolutionRule({
      id: `${DepositsCommands.generate}.resolve`, commandType: DepositsCommands.generate,
      resolve: (c): Effect[] => {
        const width = Number(c.command.payload.width ?? 12);
        const height = Number(c.command.payload.height ?? 12);
        const map = generateDeposits(width, height,
          (purpose, ...parts) => c.rng.keyed("world-deposits", purpose, ...parts));
        return [
          save(c.world, map, "laid out the deposit map"),
          {
            kind: "emitEvent", eventType: "world-deposits.generated", actorId: undefined,
            data: { deposits: map.deposits.length, geology: map.geology },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // ---- projections ------------------------------------------------------
    ctx.registerProjection({
      id: DepositsProjections.map,
      description: "The whole deposit map.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const map = readMap(world);
        if (!map) return { deposits: [], geology: "" };
        return {
          deposits: map.deposits.map((d) => ({
            tag: d.tag, x: d.x, y: d.y, richness: d.richness, why: d.why,
          })) as unknown as JsonValue,
          geology: map.geology,
        };
      },
    });

    ctx.registerProjection({
      id: DepositsProjections.near,
      description: "What a polity can reach: deposits within radius, plus what is missing.",
      // params 是 Record<string, unknown>（ProjectionContext 的定义），标注成
      // Record<string, JsonValue> 会让整个 build 与契约逆变不兼容（TS2322）。
      build: ({ world, params }: { world: WorldView; params: Record<string, unknown> }): Record<string, unknown> => {
        const map = readMap(world);
        if (!map) return { near: [], missing: [], line: "矿藏图还没铺开。" };
        const x = Number(params.x ?? 0), y = Number(params.y ?? 0);
        const radius = Number(params.radius ?? 3);
        const tradeRoutes = new Set((params.tradeRoutes as string[] | undefined) ?? []);
        const near = depositsNear(map, x, y, radius);
        const missing: string[] = [];
        for (const tag of Object.keys(DEPOSIT_TO_MATERIAL)) {
          if (!meetsDepositRequirement(map, tag, x, y, radius, tradeRoutes)) missing.push(tag);
        }
        return {
          near: near.map((d) => ({ tag: d.tag, richness: d.richness })) as unknown as JsonValue,
          missing,
          line: describeDeposits(map, x, y, radius),
        };
      },
    });
  },
};

export { DEPOSIT_TO_MATERIAL, MATERIAL_TO_DEPOSIT, depositsNear, describeDeposits,
  generateDeposits, hasDeposit, meetsDepositRequirement, missingDeposit };
export type { Deposit, DepositMap };
