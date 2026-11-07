/**
 * 愿望与恐惧的数据规范。
 *
 * 恐惧（fear）回答的是「这个人怕什么」，短期愿望（wish）回答的是「这一季他想要
 * 什么」。两者都是**数据**：加一类恐惧、换一批愿望，不该动一行规则代码。
 *
 * 这里同时定义「愿望怎么算满足」——因为这决定了哪些事值得记下来。满足的判断
 * 只认聚落**自己**的事件（送礼、学艺、搭把手、说话），不另造一套记账：
 * 那些事件本来就会让对方对你的交情上升，我们只是把它记成「这件事有了着落」。
 * 这样既不用写别人的组件（INV-007），也不会出现「我们说他高兴了、他的交情
 * 却没动」的假账。
 */
import { readFileSync } from "node:fs";

export interface FearTriggerPlace { kind: "place"; placeId: string }
export interface FearTriggerEvent { kind: "event"; eventType: string }
export interface FearTriggerAlone { kind: "alone" }
export interface FearTriggerHunger { kind: "hunger"; atLeast: number }
export interface FearTriggerStock { kind: "stockBelow"; resourceId: string; amount: number }
export type FearTrigger = FearTriggerPlace | FearTriggerEvent | FearTriggerAlone | FearTriggerHunger | FearTriggerStock;

export interface FearSpec {
  id: string;
  name: string;
  text: string;
  /** 触发时心情掉几格（0..10 的心情刻度）。 */
  moodDrop: number;
  triggers: FearTrigger[];
  /** 回避：有这些地方在，NPC 不主动往那儿去。 */
  avoidPlaces: string[];
  /** 心情低于这个数就拒绝干活。 */
  refuseWorkBelow: number;
  /** 心情低于这个数就动了离村的念头。 */
  leaveVillageBelow: number;
}

export interface WishSpec {
  id: string;
  text: string;
  /** item：得有人送这样东西；deed：得有人陪着做这件事。 */
  kind: "item" | "deed";
  resourceId?: string;
  label?: string;
  /** deed 类：哪个聚落事件算「做到了」。 */
  event?: string;
}

export interface WantsPack {
  formatVersion: number;
  note?: string;
  fears: FearSpec[];
  /** 出身决定玩家开局的那个恐惧。 */
  originFears: Record<string, string>;
  wishes: WishSpec[];
}

export const WANTS_PACK: WantsPack = JSON.parse(
  readFileSync(new URL("../data/fears.json", import.meta.url), "utf8"),
) as WantsPack;

export const FEARS: readonly FearSpec[] = WANTS_PACK.fears;
export const WISHES: readonly WishSpec[] = WANTS_PACK.wishes;

export const fearById = (id: string): FearSpec | undefined => FEARS.find((f) => f.id === id);
export const wishById = (id: string): WishSpec | undefined => WISHES.find((w) => w.id === id);

/** 心情刻度：10 最好，0 最差。 */
export const MOOD_MAX = 10;

/**
 * 校验。`places` / `resources` / `origins` 由调用方从聚落包传进来，避免这里
 * 复制一份聚落知识（复制品迟早跟原件对不上）。
 */
export function wantsProblems(
  pack: WantsPack = WANTS_PACK,
  refs: { places?: readonly string[]; resources?: readonly string[]; origins?: readonly string[]; eventTypes?: readonly string[] } = {},
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const places = refs.places ? new Set(refs.places) : undefined;
  const resources = refs.resources ? new Set(refs.resources) : undefined;
  const origins = refs.origins ? new Set(refs.origins) : undefined;

  if (!Number.isInteger(pack.formatVersion) || pack.formatVersion < 1) problems.push("formatVersion must be a positive integer");
  if (pack.fears.length < 4) problems.push(`expected at least four fears, saw ${pack.fears.length}`);

  for (const fear of pack.fears) {
    const where = `fear ${fear.id}`;
    if (!fear.id?.startsWith("fear:")) problems.push(`${where}: id must start with "fear:"`);
    if (ids.has(fear.id)) problems.push(`${where}: duplicate id`);
    ids.add(fear.id);
    if (!fear.name?.trim()) problems.push(`${where}: name is required`);
    if (!fear.text?.trim()) problems.push(`${where}: text is required`);
    if (!Number.isFinite(fear.moodDrop) || fear.moodDrop <= 0) problems.push(`${where}: moodDrop must be positive`);
    if (!fear.triggers?.length) problems.push(`${where}: needs at least one trigger`);
    for (const trigger of fear.triggers ?? []) {
      if (trigger.kind === "place") {
        if (!trigger.placeId) problems.push(`${where}: place trigger needs placeId`);
        else if (places && !places.has(trigger.placeId)) problems.push(`${where}: unknown place ${trigger.placeId}`);
      } else if (trigger.kind === "event") {
        if (!trigger.eventType) problems.push(`${where}: event trigger needs eventType`);
      } else if (trigger.kind === "hunger") {
        if (!(trigger.atLeast > 0)) problems.push(`${where}: hunger trigger needs atLeast > 0`);
      } else if (trigger.kind === "stockBelow") {
        if (!trigger.resourceId) problems.push(`${where}: stockBelow trigger needs resourceId`);
        else if (resources && !resources.has(trigger.resourceId)) problems.push(`${where}: unknown resource ${trigger.resourceId}`);
        if (!(trigger.amount >= 0)) problems.push(`${where}: stockBelow trigger needs amount >= 0`);
      } else if (trigger.kind !== "alone") {
        problems.push(`${where}: unknown trigger kind ${String((trigger as { kind?: string }).kind)}`);
      }
    }
    for (const placeId of fear.avoidPlaces ?? []) {
      if (places && !places.has(placeId)) problems.push(`${where}: unknown avoid place ${placeId}`);
    }
    // 拒绝干活应当比「动离村念头」更早发生：心情还撑得住活、但已经撑不住日子了。
    if (fear.leaveVillageBelow > fear.refuseWorkBelow) problems.push(`${where}: leaveVillageBelow must not be above refuseWorkBelow`);
  }

  for (const [origin, fearId] of Object.entries(pack.originFears ?? {})) {
    if (origins && !origins.has(origin)) problems.push(`originFears: unknown origin ${origin}`);
    if (!ids.has(fearId)) problems.push(`originFears: ${origin} points at unknown fear ${fearId}`);
  }
  for (const origin of origins ?? []) {
    if (!pack.originFears?.[origin]) problems.push(`originFears: origin ${origin} has no fear`);
  }

  const wishIds = new Set<string>();
  for (const wish of pack.wishes) {
    const where = `wish ${wish.id}`;
    if (!wish.id?.startsWith("wish:")) problems.push(`${where}: id must start with "wish:"`);
    if (wishIds.has(wish.id)) problems.push(`${where}: duplicate id`);
    wishIds.add(wish.id);
    if (!wish.text?.trim()) problems.push(`${where}: text is required`);
    if (wish.kind === "item") {
      if (!wish.resourceId) problems.push(`${where}: item wish needs resourceId`);
      else if (resources && !resources.has(wish.resourceId)) problems.push(`${where}: unknown resource ${wish.resourceId}`);
    } else if (wish.kind === "deed") {
      if (!wish.event) problems.push(`${where}: deed wish needs event`);
    } else {
      problems.push(`${where}: kind must be item or deed`);
    }
  }
  if (pack.wishes.length < 3) problems.push(`expected at least three wishes, saw ${pack.wishes.length}`);
  return problems;
}
