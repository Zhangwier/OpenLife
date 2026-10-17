/**
 * The settlement actions the Web UI may send, and how many days each one takes
 * (split out of server.ts). The server still dispatches every one as an
 * ordinary validated command.
 */
import { SettlementCommands } from "@openlife/module-settlement-locations";

/** Settlement actions the UI is allowed to send, and how long each takes. */
export const SETTLEMENT_ACTIONS: Record<string, number> = {
  [SettlementCommands.arrive]: 1,
  [SettlementCommands.draw]: 1,
  [SettlementCommands.talk]: 1,
  [SettlementCommands.exchange]: 1,
  [SettlementCommands.drink]: 1,
  [SettlementCommands.eat]: 1,
  [SettlementCommands.cook]: 1,
  [SettlementCommands.craft]: 1,
  [SettlementCommands.weaveBag]: 1,
  [SettlementCommands.weaveMat]: 1,
  [SettlementCommands.prepareFiber]: 1,
  [SettlementCommands.weaveWrap]: 1,
  [SettlementCommands.sow]: 1,
  [SettlementCommands.harvest]: 1,
  [SettlementCommands.tend]: 1,
  [SettlementCommands.rest]: 1,
  [SettlementCommands.step]: 1,
  [SettlementCommands.configurePlan]: 0,
  [SettlementCommands.playerBarterRequest]: 0,
  [SettlementCommands.playerBarterAccept]: 0,
  [SettlementCommands.playerBarterDecline]: 0,
  [SettlementCommands.helpHearth]: 0,
  [SettlementCommands.requestAnswer]: 0,
  [SettlementCommands.gift]: 0,
  [SettlementCommands.learn]: 0,
  [SettlementCommands.beginSeason]: 0,
  [SettlementCommands.court]: 0,
  [SettlementCommands.wed]: 0,
  [SettlementCommands.handoff]: 0,
};

export function isSettlementAction(action: string): boolean {
  return action in SETTLEMENT_ACTIONS
    || action === "world-space.enter"
    || action === "world-space.move_within"
    || action === "world-objects.take"
    || action === "world-objects.store"
    || action === "world-objects.retrieve"
    || action === "world-objects.wear"
    || action === "world-objects.unwear"
    || action === "world-objects.place"
    || action === "world-objects.return";
}
