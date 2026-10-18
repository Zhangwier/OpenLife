/**
 * The settlement's vocabulary: entity ids, command types, component and
 * projection names, rejection codes.
 *
 * Pure constants with no imports, so any file in this package (rules,
 * barter, autonomy) can depend on them without depending on module.ts.
 * module.ts re-exports everything here, so the public API is unchanged.
 */

export const SettlementComponents = {
  /** Marks the settlement entity and carries its authored identity. */
  settlement: "settlement-locations.settlement",
  /** Per-resident daily life: household, work place, hunger, standing routine. */
  resident: "settlement-locations.resident",
  /** A resource a place holds and renews, with its own authoritative stock. */
  yieldPoint: "settlement-locations.yield",
  /** Per-holding state for one player: what they have drawn, carried and eaten. */
  holding: "settlement-locations.holding",
  /** Crop state on the existing field place; absent for old saves means fallow. */
  cropPlot: "settlement-locations.crop-plot",
  dailyPlan: "settlement-locations.daily-plan",
  /** A home's roof, on the home space: level after the last mending and the day it was mended. */
  roof: "settlement-locations.roof",
} as const;

export const SettlementCommands = {
  found: "settlement-locations.found",
  arrive: "settlement-locations.arrive",
  draw: "settlement-locations.draw",
  talk: "settlement-locations.talk",
  drink: "settlement-locations.drink",
  eat: "settlement-locations.eat",
  cook: "settlement-locations.cook",
  weaveBag: "settlement-locations.weave_bag",
  weaveMat: "settlement-locations.weave_mat",
  prepareFiber: "settlement-locations.prepare_fiber",
  weaveWrap: "settlement-locations.weave_wrap",
  harvest: "settlement-locations.harvest",
  sow: "settlement-locations.sow",
  tend: "settlement-locations.tend",
  rest: "settlement-locations.rest",
  step: "settlement-locations.end_day",
  configurePlan: "settlement-locations.plan.configure",
  npcMarkDay: "settlement-locations.npc.mark_day",
  npcOffer: "settlement-locations.npc.barter_offer",
  npcAccept: "settlement-locations.npc.barter_accept",
  playerBarterRequest: "settlement-locations.barter.request",
  cookBarterQuote: "settlement-locations.barter.cook_quote",
  playerBarterAccept: "settlement-locations.barter.accept",
  playerBarterDecline: "settlement-locations.barter.decline",
  /** General exchange between any two people in the same place. */
  exchange: "settlement-locations.exchange",
  craft: "settlement-locations.craft",
  helpHearth: "settlement-locations.hearth.help",
  npcAskHelp: "settlement-locations.npc.ask_help",
  npcAnswerHelp: "settlement-locations.npc.answer_help",
  npcFire: "settlement-locations.npc.fire",
  /** A resident looks around: who is here, what they carry; old requests are settled. */
  npcNotice: "settlement-locations.npc.notice",
  /** A resident, face to face, asks the player for something (borrow, trade or collect a favour). */
  npcRequest: "settlement-locations.npc.request",
  /** The player answers a resident's request. */
  requestAnswer: "settlement-locations.request.answer",
  /** A resident hands someone one of their own things (repaying a favour, thanks). */
  npcGive: "settlement-locations.npc.give",
  /** A new life picks where it comes from and one or two talents (once). */
  chooseOrigin: "settlement-locations.choose_origin",
  /** The player gives one of their own things to a villager standing with them. */
  gift: "settlement-locations.gift",
  learn: "settlement-locations.learn",
  /** 把这一季交给日子：记下心思放在哪儿（时间由调用方一口气推过去）。 */
  beginSeason: "settlement-locations.season.begin",
  /** 一季过完，结算这段日子：口粮、交情、手艺、收获。 */
  settleSeason: "settlement-locations.season.settle",
  /** 向一个人表明心意（交情满 8 颗心才开得了口）。 */
  court: "settlement-locations.court",
  /** 定亲几天后，当着全村成亲。 */
  wed: "settlement-locations.wed",
  /** 一家人的日子往前走：添丁、出生、孩子长到能帮家里干活（村里每天看一眼）。 */
  familyTick: "settlement-locations.family.tick",
  /** 人走了以后，由一个长大成人的孩子接过这一生。 */
  handoff: "settlement-locations.handoff",
  useFixture: "settlement-locations.use_fixture",
  /** 换季那天，村里这一季的大事（村里每天看一眼，一季只发生一次）。 */
  seasonTurn: "settlement-locations.village.season_turn",
} as const;

export const SettlementProjections = {
  homestead: "settlement-locations.homestead",
  people: "settlement-locations.people",
  worksites: "settlement-locations.worksites",
} as const;

export const SettlementRejection = {
  NotEntered: "E_SETTLEMENT_NOT_ENTERED",
  NoSuchResident: "E_SETTLEMENT_NO_RESIDENT",
  NoSuchPlace: "E_SETTLEMENT_NO_PLACE",
  WrongPlace: "E_SETTLEMENT_WRONG_PLACE",
  Empty: "E_SETTLEMENT_EMPTY",
  NotYours: "E_SETTLEMENT_NOT_YOURS",
  Already: "E_SETTLEMENT_ALREADY",
  NoRoom: "E_SETTLEMENT_NO_ROOM",
  Exhausted: "E_SETTLEMENT_EXHAUSTED",
  Busy: "E_SETTLEMENT_BUSY",
} as const;

/** The authored settlement: one terrace village beside the central river. */
export const SettlementId = "settlement-locations:settlement:river-terrace";

/** Entity id of an authored resident, from its pack key. */
export function residentId(key: string): string {
  return `settlement-locations:resident:${key}`;
}
