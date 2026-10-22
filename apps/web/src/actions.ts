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
  [SettlementCommands.useFixture]: 0,
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

/**
 * 远行：离开村子去地图上的另一个地点，路上按天走，走到才落脚。
 *
 * 与聚落动作分开列，因为它们的代价不是「花掉几格今天的活动时间」——出发当天就
 * 算一天路上的日子，之后每过一天推进一步。放进 `SETTLEMENT_ACTIONS` 会让
 * `runSettlementAction` 找不到命令处理器而把玩家的选择拒成「不属于聚落生活」。
 */
export const TRAVEL_ACTIONS: Record<string, number> = {
  "travel.depart": 1,
  "travel.day": 1,
  "travel.arrive": 0,
  "travel.return": 0,
};

export function isTravelAction(action: string): boolean {
  return action in TRAVEL_ACTIONS;
}
