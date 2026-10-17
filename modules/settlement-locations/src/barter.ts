/**
 * Settlement barter (M3-B / M3-D), split out of module.ts.
 *
 * Two explicit, consent-based item-for-item exchanges at the hearth yard:
 *   - NPC <-> NPC: the cook offers fuel for the farmer's grain.
 *   - player <-> cook: the player asks, the cook quotes, the player decides.
 * Every step is an ordinary validated Command; nothing here keeps a parallel stock.
 */

import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import {
  ObjectComponents,
  ObjectKinds,
  ObjectRelations,
  contentsOf,
  holderOf,
  ownerOf,
  prototypeOf,
  readObject,
  canCarryObject,
} from "@openlife/module-world-objects";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { SettlementCommands, SettlementComponents, SettlementRejection, residentId } from "./vocabulary.ts";
import { refuse, type Registration } from "./rules.ts";

/**
 * Move one concrete item from one party to another: custody (heldBy) and
 * ownership (ownedBy) change together, in the same transaction.
 */
function swapItemEffects(itemId: string, from: string, to: string, handoverReason: string, ownershipReason: string): Effect[] {
  return [{
    kind: "removeRelation", type: ObjectRelations.heldBy, from: itemId, to: from,
    reason: handoverReason, announce: false,
  }, {
    kind: "removeRelation", type: ObjectRelations.ownedBy, from: itemId, to: from,
    reason: ownershipReason, announce: false,
  }, {
    kind: "addRelation", type: ObjectRelations.heldBy, from: itemId, to: to, announce: false,
  }, {
    kind: "addRelation", type: ObjectRelations.ownedBy, from: itemId, to: to, announce: false,
  }];
}

/**
 * M3-B: narrow, explicit two-party barter between the cook and the farmer.
 * Proposal records the cook's consent; acceptance is a second command by Yu.
 * The single acceptance transaction swaps existing ownership AND custody of
 * two concrete, individually held resource bundles. No parallel stock.
 */
export function tradeReady(world: WorldView, itemId: string, actorId: string, resourceId: string): boolean {
  const item = world.getEntity(itemId);
  return Boolean(item && item.kind === ObjectKinds.item && item.archivedAt === undefined &&
    ownerOf(world, itemId) === actorId && holderOf(world, itemId) === actorId &&
    prototypeOf(world, itemId).resourceId === resourceId &&
    readObject(item.components[ObjectComponents.object]).quantity === 1 &&
    contentsOf(world, itemId).length === 0 &&
    world.listRelations({ type: ObjectRelations.wornBy, from: itemId }).length === 0 &&
    Number(world.getComponent(itemId, ObjectComponents.loan)?.active ?? 0) !== 1);
}

export function registerNpcBarter(ctx: Registration): void {
  const cook = residentId("cook"), farmer = residentId("yu");
  const coLocated = (world: WorldView) =>
    occupiedPlaceId(world, cook) === "place:hearth-yard" &&
    occupiedPlaceId(world, farmer) === "place:hearth-yard";
  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcOffer}.allowed`,
    commandType: SettlementCommands.npcOffer,
    evaluate: (c) => {
      if (c.command.source !== "ai" || c.command.actorId !== cook) {
        return refuse(SettlementRejection.NotYours, "只有阿灶可以提出自己的柴草交换报价。");
      }
      if (!coLocated(c.world)) {
        return refuse(SettlementRejection.WrongPlace, "阿灶与阿予必须同时到达公用灶台。");
      }
      if (Number(c.world.getComponent(cook, SettlementComponents.resident)?.tradeCount ?? 0) >= 1) {
        return refuse(SettlementRejection.Already, "本次约定的交换已经完成。");
      }
      const fuelId = String(c.command.payload.fuelId ?? "");
      const grainId = String(c.command.payload.grainId ?? "");
      if (!fuelId || !grainId || fuelId === grainId ||
          !tradeReady(c.world, fuelId, cook, "resource:fuel") ||
          !tradeReady(c.world, grainId, farmer, "resource:grain")) {
        return refuse(SettlementRejection.NotYours, "双方必须各自实际持有可交换的一捆柴草和一份粟。");
      }
      const pending = c.world.getComponent(cook, SettlementComponents.resident)?.tradeOffer;
      if (pending && typeof pending === "object" &&
          (pending as Record<string, JsonValue>).status === "offered" &&
          (pending as Record<string, JsonValue>).at === c.world.tick) {
        return refuse(SettlementRejection.Busy, "已经有一份等待确认的交换报价。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcOffer}.resolve`,
    commandType: SettlementCommands.npcOffer,
    resolve: (c) => [{
      kind: "modifyComponent", entityId: cook,
      component: SettlementComponents.resident,
      patch: { tradeOffer: { status: "offered", at: c.world.tick, fuelId: c.command.payload.fuelId,
        grainId: c.command.payload.grainId, recipientId: farmer } },
      reason: "cook's explicit conditional barter offer",
    }, {
      kind: "emitEvent", eventType: "settlement-locations.barter_offered",
      actorId: cook, targetId: farmer,
      data: { fuelId: c.command.payload.fuelId, grainId: c.command.payload.grainId },
      historicalSignificance: 0.01,
    }],
  });

  ctx.registerConstraintRule({
    id: `${SettlementCommands.npcAccept}.allowed`,
    commandType: SettlementCommands.npcAccept,
    evaluate: (c) => {
      if (c.command.source !== "ai" || c.command.actorId !== farmer) {
        return refuse(SettlementRejection.NotYours, "只有阿予本人能接受交易。");
      }
      if (!coLocated(c.world)) {
        return refuse(SettlementRejection.WrongPlace, "双方不在公用灶台，不能远程交换。");
      }
      const raw = c.world.getComponent(cook, SettlementComponents.resident)?.tradeOffer;
      const offer = raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw as Record<string, JsonValue> : {};
      const fuelId = String(offer.fuelId ?? ""), grainId = String(offer.grainId ?? "");
      if (offer.status !== "offered" || offer.at !== c.world.tick ||
          offer.recipientId !== farmer || !fuelId || !grainId ||
          c.command.payload.fuelId !== fuelId || c.command.payload.grainId !== grainId) {
        return refuse(SettlementRejection.Busy, "没有双方认可且当天仍有效的具体物品报价。");
      }
      if (!tradeReady(c.world, fuelId, cook, "resource:fuel") ||
          !tradeReady(c.world, grainId, farmer, "resource:grain")) {
        return refuse(SettlementRejection.NotYours, "接受时任一方的物品已不在手中，交易取消。");
      }
      if (!canCarryObject(c.world, farmer, fuelId, grainId) ||
          !canCarryObject(c.world, cook, grainId, fuelId))
        return refuse(SettlementRejection.NoRoom, "交换后有人会超出随身负重，先整理行囊。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.npcAccept}.resolve`,
    commandType: SettlementCommands.npcAccept,
    resolve: (c) => {
      const offer = c.world.getComponent(cook, SettlementComponents.resident)!.tradeOffer as Record<string, JsonValue>;
      const fuelId = String(offer.fuelId), grainId = String(offer.grainId);
      const effects: Effect[] = [];
      effects.push(
        ...swapItemEffects(fuelId, cook, farmer, "barter accepted, handover", "barter accepted, ownership transfer"),
        ...swapItemEffects(grainId, farmer, cook, "barter accepted, handover", "barter accepted, ownership transfer"),
      );
      const count = Number(c.world.getComponent(cook, SettlementComponents.resident)?.tradeCount ?? 0) + 1;
      effects.push({
        kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
        patch: { tradeCount: count, tradeOffer: { ...offer, status: "accepted", acceptedAt: c.world.tick } },
        reason: "first physical barter completed on both sides",
      }, {
        kind: "modifyComponent", entityId: farmer, component: SettlementComponents.resident,
        patch: { tradeCount: count },
        reason: "farmer accepted the barter for real materials",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.barter_accepted",
        actorId: farmer, targetId: cook,
        data: { fuelId, grainId, cook, farmer, amount: 1 },
        historicalSignificance: 0.08,
      });
      return effects;
    },
  });
}

/** M3-D: the player's requested grain-for-fuel barter with the hearth cook.
 * A player-authored request does NOT imply NPC consent. An independent cook
 * command authorizes a concrete quote, and only the player's own acceptance
 * swaps the two real item IDs in a single world transaction.
 */
export function registerPlayerBarter(ctx: Registration): void {
  const cook = residentId("cook");
  const activePlayer = (world: WorldView) =>
    String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  const nearby = (world: WorldView, playerId: string) =>
    playerId && playerId !== cook && occupiedPlaceId(world, playerId) === "place:hearth-yard" &&
    occupiedPlaceId(world, cook) === "place:hearth-yard";
  const requestOf = (world: WorldView, playerId: string) => {
    const raw = world.getComponent(playerId, SettlementComponents.holding)?.playerBarterRequest;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, JsonValue> : {};
  };
  const quoteOf = (world: WorldView) => {
    const raw = world.getComponent(cook, SettlementComponents.resident)?.playerBarterQuote;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, JsonValue> : {};
  };
  const finished = (world: WorldView, playerId: string) =>
    Number(world.getComponent(playerId, SettlementComponents.holding)?.playerTradeCount ?? 0) >= 1;
  const goodsReady = (world: WorldView, playerId: string, grainId: string, fuelId: string) =>
    grainId !== fuelId &&
    tradeReady(world, grainId, playerId, "resource:grain") &&
    tradeReady(world, fuelId, cook, "resource:fuel");

  ctx.registerConstraintRule({
    id: `${SettlementCommands.playerBarterRequest}.allowed`,
    commandType: SettlementCommands.playerBarterRequest,
    evaluate: (c) => {
      const playerId = c.command.actorId ?? "";
      if (c.command.source !== "player" || playerId !== activePlayer(c.world))
        return refuse(SettlementRejection.NotYours, "只能由当前操控角色亲自询价。");
      if (!nearby(c.world, playerId))
        return refuse(SettlementRejection.WrongPlace, "需要与阿灶同在公用灶台才能询价。");
      if (finished(c.world, playerId))
        return refuse(SettlementRejection.Already, "你已经与阿灶完成这次约定的交换。");
      const grainId = String(c.command.payload.grainId ?? "");
      if (!tradeReady(c.world, grainId, playerId, "resource:grain"))
        return refuse(SettlementRejection.NotYours, "先带一份属于自己的真实粟粮才能提议交换。");
      const quote = quoteOf(c.world);
      if (quote.status === "offered" && quote.at === c.world.tick &&
          quote.customerId === playerId)
        return refuse(SettlementRejection.Busy, "阿灶已经提出报价，请先接受或拒绝。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.playerBarterRequest}.resolve`,
    commandType: SettlementCommands.playerBarterRequest,
    resolve: (c) => [{
      kind: "modifyComponent", entityId: c.command.actorId as string,
      component: SettlementComponents.holding,
      patch: { playerBarterRequest: { grainId: c.command.payload.grainId,
        cookId: cook, at: c.world.tick, status: "requested" } },
      reason: "player explicitly asks the cook to exchange specific goods",
    }, {
      kind: "emitEvent", eventType: "settlement-locations.player_barter_requested",
      actorId: c.command.actorId, targetId: cook,
      data: { grainId: c.command.payload.grainId }, historicalSignificance: 0,
    }],
  });

  ctx.registerConstraintRule({
    id: `${SettlementCommands.cookBarterQuote}.allowed`,
    commandType: SettlementCommands.cookBarterQuote,
    evaluate: (c) => {
      const playerId = String(c.command.payload.customerId ?? "");
      if (c.command.source !== "ai" || c.command.actorId !== cook ||
          playerId !== activePlayer(c.world))
        return refuse(SettlementRejection.NotYours, "报价必须由阿灶根据实际物资单独确认。");
      if (!nearby(c.world, playerId) || finished(c.world, playerId))
        return refuse(SettlementRejection.WrongPlace, "交易双方必须同在灶台且尚未成交。");
      const request = requestOf(c.world, playerId);
      const grainId = String(request.grainId ?? "");
      const fuelId = String(c.command.payload.fuelId ?? "");
      if (request.status !== "requested" || request.at !== c.world.tick ||
          request.cookId !== cook || !grainId ||
          !goodsReady(c.world, playerId, grainId, fuelId))
        return refuse(SettlementRejection.Empty, "阿灶暂时无法接受这笔报价：必须各自实际持有一份粟和一捆柴。");
      const pending = quoteOf(c.world);
      if (pending.status === "offered" && pending.at === c.world.tick)
        return refuse(SettlementRejection.Busy, "阿灶已有一笔等待回复的实物报价。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.cookBarterQuote}.resolve`,
    commandType: SettlementCommands.cookBarterQuote,
    resolve: (c) => {
      const playerId = String(c.command.payload.customerId);
      const grainId = String(requestOf(c.world, playerId).grainId);
      const fuelId = String(c.command.payload.fuelId);
      return [{
        kind: "modifyComponent", entityId: cook,
        component: SettlementComponents.resident,
        patch: { playerBarterQuote: { status: "offered", customerId: playerId,
          grainId, fuelId, at: c.world.tick } },
        reason: "cook independently consents to one real item-for-item quote",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.player_barter_quoted",
        actorId: cook, targetId: playerId,
        data: { grainId, fuelId }, historicalSignificance: 0.01,
      }];
    },
  });
  const playerDecision = (type: string, accept: boolean) => {
    ctx.registerConstraintRule({
      id: `${type}.allowed`, commandType: type,
      evaluate: (c) => {
        const playerId = c.command.actorId ?? "";
        if (c.command.source !== "player" || playerId !== activePlayer(c.world))
          return refuse(SettlementRejection.NotYours, "只有报价指向的玩家本人可以决定。");
        if (!nearby(c.world, playerId))
          return refuse(SettlementRejection.WrongPlace, "必须当面接受或拒绝阿灶的报价。");
        const quote = quoteOf(c.world);
        if (quote.status !== "offered" || quote.at !== c.world.tick ||
            quote.customerId !== playerId || finished(c.world, playerId) ||
            c.command.payload.grainId !== quote.grainId ||
            c.command.payload.fuelId !== quote.fuelId)
          return refuse(SettlementRejection.Busy, "这笔报价已过期、已处理或并非你的报价。");
        if (accept && !goodsReady(c.world, playerId,
          String(quote.grainId), String(quote.fuelId)))
          return refuse(SettlementRejection.NotYours, "物品已不在当事人手中，不能完成交易。");
        if (accept && (!canCarryObject(c.world, playerId, String(quote.fuelId), String(quote.grainId)) ||
          !canCarryObject(c.world, cook, String(quote.grainId), String(quote.fuelId))))
          return refuse(SettlementRejection.NoRoom, "双方需先腾出足够的负重空间才能交换实物。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${type}.resolve`, commandType: type,
      resolve: (c) => {
        const playerId = c.command.actorId as string;
        const quote = quoteOf(c.world);
        const grainId = String(quote.grainId), fuelId = String(quote.fuelId);
        const effects: Effect[] = [];
        if (accept) {
          effects.push(
            ...swapItemEffects(grainId, playerId, cook, "player barter handover", "player barter ownership swap"),
            ...swapItemEffects(fuelId, cook, playerId, "player barter handover", "player barter ownership swap"),
          );
          effects.push({
            kind: "modifyComponent", entityId: playerId, component: SettlementComponents.holding,
            patch: { playerTradeCount: 1 }, reason: "player owns a real completed exchange",
          });
        }
        effects.push({
          kind: "modifyComponent", entityId: cook, component: SettlementComponents.resident,
          patch: { playerBarterQuote: { ...quote, status: accept ? "accepted" : "declined",
            resolvedAt: c.world.tick } },
          reason: accept ? "cook's quote accepted by the player" : "player declined the cook's quote",
        }, {
          kind: "emitEvent", eventType: accept
            ? "settlement-locations.player_barter_accepted"
            : "settlement-locations.player_barter_declined",
          actorId: playerId, targetId: cook,
          data: { grainId, fuelId, accepted: accept },
          historicalSignificance: accept ? 0.07 : 0,
        });
        return effects;
      },
    });
  };
  playerDecision(SettlementCommands.playerBarterAccept, true);
  playerDecision(SettlementCommands.playerBarterDecline, false);
}
