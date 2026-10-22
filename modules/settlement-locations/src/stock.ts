/**
 * 公共库存调整：让别的模块（如 settlement-build）能按规矩动村里的库存。
 *
 * 为什么需要它：INV-007 规定一个模块只能写自己命名空间下的组件。盖房子要
 * 消耗木料黏土，但它不能直接改 `settlement-locations.yield`。正确做法是
 * settlement-locations 公开一个命令，别人 dispatch 它——这既不破坏不变量，
 * 又让库存的每一笔变化都经过同一处校验与记账。
 *
 * 放在这个文件里而不是 module.ts：后者被 source-size 棘轮冻结在 4971 行，
 * 一行都加不进去。module.ts 只 import 一个函数名并把 register 接上。
 */
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import type { Registration } from "./rules.ts";
import { SettlementComponents } from "./vocabulary.ts";

/**
 * Yield points, read straight from their components.
 *
 * This deliberately does NOT import `yieldPoints` from module.ts: doing so
 * created a cycle (module.ts -> stock.ts -> module.ts) that the import-cycle
 * guard rejects. Only the raw stock number is needed here, so the read is
 * local and the file stays a leaf.
 */
interface YieldSnapshot {
  placeId: string;
  resourceId: string;
  stock: number;
  capacity: number;
}

function rawYields(world: WorldView): YieldSnapshot[] {
  return world
    .listEntities({ kind: "settlement-locations.yield-point" })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const raw = entity.components[SettlementComponents.yieldPoint] ?? {};
      return {
        placeId: String(raw.placeId ?? ""),
        resourceId: String(raw.resourceId ?? ""),
        stock: Math.max(0, Number(raw.stock ?? 0)),
        capacity: Math.max(0, Number(raw.capacity ?? 0)),
      };
    });
}

export const StockCommands = {
  /**
   * Take (`delta` negative) or add (`delta` positive) stock at the place that
   * gathers a resource. Floors at zero so a ledger can never go negative.
   */
  adjust: "settlement-locations.stock.adjust",
} as const;

/**
 * How another module asks for stock to move without owning the component.
 *
 * INV-007 says a module writes only its own components, so a story event that
 * costs the village a sack of grain cannot set `settlement-locations.yield`
 * itself -- the kernel rolls the whole transaction back. It says what it wants
 * instead, and this module settles the request in the same transaction, through
 * the same clamp as a direct adjustment. Payload:
 *
 *   { stock: [{ resourceId, delta, reason }] }
 *
 * Published here rather than in the caller: the owner of the data declares the
 * shape the rest of the platform may use.
 */
export const StockRequestEvent = "settlement-locations.stock.requested";

export interface StockRequest {
  resourceId: string;
  delta: number;
  /** Why: appears in the effect reason and the event, for a readable audit trail. */
  reason?: string;
}

/** Effects that move a resource by `delta`, clamped to [0, capacity]. */
export function stockEffects(world: WorldView, request: StockRequest): Effect[] {
  const { resourceId, delta } = request;
  if (!resourceId || !Number.isFinite(delta) || delta === 0) return [];
  const effects: Effect[] = [];
  let left = Math.abs(Math.round(delta));
  const taking = delta < 0;

  // Spread across every place that gathers it, so one depleted site does not
  // silently swallow a delivery meant for the village as a whole.
  for (const point of rawYields(world)) {
    if (left <= 0) break;
    if (point.resourceId !== resourceId) continue;
    const current = Number(point.stock ?? 0);
    const room = taking ? current : Math.max(0, Number(point.capacity ?? 0) - current);
    if (room <= 0) continue;
    const move = Math.min(room, left);
    left -= move;
    effects.push({
      kind: "setComponent",
      entityId: `yield:${point.placeId}:${point.resourceId}`,
      component: SettlementComponents.yieldPoint,
      value: { ...point, stock: current + (taking ? -move : move) } as unknown as Record<string, never>,
      reason: request.reason ?? `stock ${taking ? "taken" : "added"}: ${resourceId}`,
    });
  }
  return effects;
}

/** How much of a resource the village could actually move right now. */
export function movableStock(world: WorldView, resourceId: string): number {
  return rawYields(world)
    .filter((p) => p.resourceId === resourceId)
    .reduce((n, p) => n + Number(p.stock ?? 0), 0);
}

/**
 * Registers the command. Called from module.ts's register() with one line.
 */
export function registerStock(ctx: Registration): void {
  ctx.registerCommand({ type: StockCommands.adjust, description: "Move a resource in or out of the village's shared stock." });
  // Someone else's event, our data: settle it here rather than let the caller
  // write a component it does not own.
  ctx.registerReactionRule({
    id: "settlement-locations.stock.requested.settled",
    eventType: StockRequestEvent,
    react: (c): Effect[] => {
      const asked = Array.isArray((c.event.data as { stock?: unknown } | undefined)?.stock)
        ? ((c.event.data as { stock: Array<{ resourceId?: unknown; delta?: unknown; reason?: unknown }> }).stock)
        : [];
      const effects: Effect[] = [];
      for (const item of asked) {
        const resourceId = String(item?.resourceId ?? "");
        const delta = Number(item?.delta ?? 0);
        if (!resourceId || !Number.isFinite(delta) || delta === 0) continue;
        effects.push(...stockEffects(c.world, { resourceId, delta, reason: String(item?.reason ?? "requested") }));
      }
      if (!effects.length) return [];
      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.stock_adjusted",
        actorId: c.event.actorId,
        data: { requested: asked.length, moved: effects.length } as Record<string, JsonValue>,
        historicalSignificance: 0,
      });
      return effects;
    },
  });
  ctx.registerConstraintRule({
    id: `${StockCommands.adjust}.allowed`,
    commandType: StockCommands.adjust,
    evaluate: (c) => {
      const resourceId = String(c.command.payload.resourceId ?? "");
      const delta = Number(c.command.payload.delta ?? 0);
      if (!resourceId) return { ok: false as const, code: "E_STOCK_NO_RESOURCE", message: "要指定一种东西。" };
      if (!Number.isFinite(delta) || delta === 0) {
        return { ok: false as const, code: "E_STOCK_NO_DELTA", message: "数量不能是零。" };
      }
      if (delta < 0 && movableStock(c.world, resourceId) <= 0) {
        return { ok: false as const, code: "E_STOCK_EMPTY", message: "村里没有这种的东西了。" };
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${StockCommands.adjust}.resolve`,
    commandType: StockCommands.adjust,
    resolve: (c): Effect[] => {
      const effects = stockEffects(c.world, {
        resourceId: String(c.command.payload.resourceId),
        delta: Number(c.command.payload.delta),
        reason: String(c.command.payload.reason ?? "stock adjusted"),
      });
      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.stock_adjusted",
        actorId: c.command.actorId,
        data: {
          resourceId: String(c.command.payload.resourceId),
          delta: Number(c.command.payload.delta),
          reason: String(c.command.payload.reason ?? ""),
        } as Record<string, JsonValue>,
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}
