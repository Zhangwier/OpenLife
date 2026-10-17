/**
 * What the player knows about the people around them (split out of module.ts):
 * whether they can name someone, and asking a villager what is going on.
 */
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { RIVER_TERRACE_PACK } from "./content.ts";
import { calendarDate, feastOn, feastSoon, illnessOn, illnessSpec, pickIndex, seasonOf } from "./happenings.ts";
import { hungerLevel } from "./hunger-toll.ts";
import { readOrigin } from "./origin.ts";
import { isBirthday } from "./people.ts";
import { refuse, type Registration } from "./rules.ts";
import { withBond } from "./social.ts";
import { SettlementCommands, SettlementComponents, SettlementRejection, residentId } from "./vocabulary.ts";
import { RESIDENTS, personName, saveSocial, socialOf } from "./world-reads.ts";

const PLACES = RIVER_TERRACE_PACK.places;
const STORY = RIVER_TERRACE_PACK.storyteller;

export function contactConversations(world: WorldView, actorId: string, targetId: string): number {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.contacts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const person = (raw as Record<string, JsonValue>)[targetId];
  if (!person || typeof person !== "object" || Array.isArray(person)) return 0;
  return Math.max(0, Number((person as Record<string, JsonValue>).conversations ?? 0));
}

/**
 * 一个陌生人的可区分称呼。
 *
 * 用户报的缺陷：两个陌生人都叫「陌生人」，分不清谁是谁。
 *
 * 名字是私事，但长相不是。你能看见的是一个中年妇人还是个孩子，这不违反
 * 认知规则——性别与年龄段是睁眼就能看见的，营生和生日才是要谈的。
 *
 * 返回形如「陌生的妇人」「一个少年」的描述，让两个陌生人能被区分开。
 */
export function describeStranger(world: WorldView, personId: string): string {
  const entity = world.getEntity(personId);
  if (!entity) return "陌生人";
  const identity = entity.components["modern.identity"] as Record<string, JsonValue> | undefined;
  const vitals = entity.components["modern.vitals"] as Record<string, JsonValue> | undefined;
  const sex = String(identity?.sex ?? "");
  const age = Number(vitals?.ageYears ?? 0);

  const byAge = age < 6 ? "小孩" : age < 16 ? (sex === "female" ? "少女" : "少年")
    : age < 40 ? (sex === "female" ? "妇人" : "男人")
    : (sex === "female" ? "老妇人" : "老人");
  return `陌生的${byAge}`;
}

/** 能不能叫出这个人的名字。 */
export function knowsName(world: WorldView, actorId: string, targetId: string): boolean {
  return acquaintanceOf(world, actorId, targetId) !== "stranger";
}

/**
 * 你知不知道这个人是谁。
 *
 * 一个人站在你面前，你能看见的是「那里有个人」，不是他的名字、职业和脾气。
 * 这些要谈过话、共过事，或者有人跟你讲起过，才算知道。出身里本来就认识的
 * 人（如陶家的长辈）一开始就跨过这道门槛。
 *
 * 三档：
 *  - stranger：只是看见有人在；连名字都不知道。
 *  - met：说过话，记得住脸和名字，但还不清楚他靠什么过活、什么性子。
 *  - acquainted：聊过几回，知道他的营生与脾气。
 */
export type Acquaintance = "stranger" | "met" | "acquainted";
export function acquaintanceOf(world: WorldView, actorId: string, targetId: string): Acquaintance {
  const count = contactConversations(world, actorId, targetId);
  if (count >= 3) return "acquainted";
  if (count > 0) return "met";
  // 有人跟你提起过这个人：你至少知道他是谁、叫什么。
  const heard = world.getComponent(actorId, SettlementComponents.holding)?.heardAbout;
  if (Array.isArray(heard) && heard.map(String).includes(targetId)) return "met";
  // 交情也是认识：任务指派、交付、送礼都算一次正式来往——你不可能和一个
  // 完全陌生的人做这些事而不认识他。
  const key = RESIDENTS.find((r) => residentId(r.key) === targetId)?.key;
  if (key) {
    const bond = socialOf(world, actorId, targetId);
    if (bond && Number(bond.familiarity ?? 0) >= 0.5) return "acquainted";
    if (bond && Number(bond.familiarity ?? 0) > 0) return "met";
  }
  // 出身里就有交情的人（陶叔陶婶、教你搓绳的阿岚…）：一开始就认识。
  const origin = readOrigin(world.getComponent(actorId, SettlementComponents.holding)?.origin);
  if (origin.id === "none") return "stranger";
  const spec = (RIVER_TERRACE_PACK.origins ?? []).find((o) => o.id === origin.id);
  const originBond = key ? spec?.bonds?.[key] : undefined;
  const familiarity = Number(originBond?.familiarity ?? 0);
  if (familiarity >= 4) return "acquainted";
  if (familiarity > 0) return "met";
  // 同屋住着的人，抬头不见低头见：知道是谁，但还没深交。
  const home = (id: string) => String(world.getComponent(id, SettlementComponents.resident)?.homeSpace ?? "");
  if (home(actorId) && home(actorId) === home(targetId)) return "met";
  return "stranger";
}

/** 别人嘴里提到的称呼：认识就叫名字，不认识就是「那个人」。 */
export function knownName(world: WorldView, actorId: string, targetId: string, fallback = "那个人"): string {
  return knowsName(world, actorId, targetId) ? personName(world, targetId) : fallback;
}

/**
 * 打听：问一个你认识的人「村里最近怎么了」。
 *
 * 这是认识别人的主要途径，也是唯一能知道「谁过生日、谁病倒了」的办法——
 * 这些事不会凭空出现在你的消息里，得有人告诉你。一次只问一件事，
 * 问到的人也得是他愿意说的（交情太浅的人只会跟你打太极）。
 */
export function registerAskAbout(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.askAbout}.allowed`,
    commandType: SettlementCommands.askAbout,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const targetId = String(c.command.payload.targetId ?? "");
      if (!actorId || actorId === targetId) return refuse(SettlementRejection.NotYours, "只能自己去打听。");
      if (!c.world.getComponent(targetId, SettlementComponents.resident))
        return refuse(SettlementRejection.NoSuchResident, "这里没有可以问的人。");
      if (occupiedPlaceId(c.world, actorId) !== occupiedPlaceId(c.world, targetId))
        return refuse(SettlementRejection.WrongPlace, "得走到对方面前才问得上话。");
      // 不认识的人不会跟你讲村里的事：先搭话。
      if (!knowsName(c.world, actorId, targetId))
        return refuse(SettlementRejection.NoSuchResident, "你还不认识这个人，先跟他搭句话。");
      if (askedToday(c.world, actorId, targetId))
        return refuse(SettlementRejection.Already, "今天已经跟他打听过了，明天再说。");
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.askAbout}.resolve`,
    commandType: SettlementCommands.askAbout,
    resolve: (c): Effect[] => {
      const actorId = c.command.actorId as string;
      const targetId = String(c.command.payload.targetId);
      const tick = c.world.tick;
      const said = askAboutLine(c.world, actorId, targetId);
      const raw = c.world.getComponent(actorId, SettlementComponents.holding)?.askedAt;
      const asked = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw as Record<string, JsonValue> } : {};
      asked[targetId] = tick;
      return [
        { kind: "modifyComponent", entityId: actorId, component: SettlementComponents.holding,
          patch: { askedAt: asked, ...(said.learnedId ? { heardAbout: [...new Set([...heardAbout(c.world, actorId), said.learnedId])].slice(-60) } : {}) },
          reason: "the player asked about the village" },
        saveSocial(targetId, withBond(socialOf(c.world, targetId), actorId, { familiarity: 0.5 }, tick),
          "being asked about the village is a small kindness"),
        { kind: "emitEvent", eventType: "settlement-locations.asked_about", actorId, targetId,
          data: { topic: said.topic, ...(said.learnedId ? { learned: said.learnedId } : {}) }, historicalSignificance: 0.01 },
      ];
    },
  });
}

/** 今天是否已经向这个人打听过。 */
export function askedToday(world: WorldView, actorId: string, targetId: string): boolean {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.askedAt;
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw)) && Number((raw as Record<string, JsonValue>)[targetId] ?? -1) === world.tick;
}

/** 已经听人说起过的人：他们的名字从此叫得出来。 */
export function heardAbout(world: WorldView, actorId: string): string[] {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.heardAbout;
  return Array.isArray(raw) ? raw.map(String) : [];
}

/** 这人听说过村里哪件还没传到你耳朵里的事。 */
function askAboutLine(world: WorldView, actorId: string, targetId: string): { line: string; topic: string; learnedId?: string } {
  const tick = world.tick;
  const pick = (list: string[], salt: string) => list.length ? list[pickIndex(`ask:${tick}:${targetId}:${salt}`, list.length)]! : "";
  const heard = new Set(heardAbout(world, actorId));
  const speaker = personName(world, targetId);

  // 1. 有人病着：这是最该被说出口的事，但只有认识的人才报得出名字。
  const ill = illnessOn(tick);
  if (ill && illnessSpec() && !heard.has(ill.residentId)) {
    const where = PLACES.find((place) => place.id === occupiedPlaceId(world, ill.residentId))?.name;
    const who = personName(world, ill.residentId);
    return { topic: "illness", learnedId: ill.residentId,
      line: `你问起村里最近的事，${speaker}压低声音：“${who}着了凉，这几天在家躺着${where ? `，人在${where}` : ""}。”` };
  }
  // 2. 近几天谁过生日：提前知道才好备礼。
  const soon = nextBirthday(world, 12);
  if (soon && !heard.has(soon.id)) {
    return { topic: "birthday", learnedId: soon.id,
      line: `你问起村里最近的事，${speaker}想了想：“再过${soon.inDays}天是${soon.name}的生日，${soon.month}月${soon.day}日。”` };
  }
  // 3. 谁最近手头紧、想换什么：这直接关系到你能帮上什么忙。
  const needy = RESIDENTS.map((r) => ({ r, id: residentId(r.key) }))
    .filter(({ id }) => !heard.has(id) && hungerLevel(world, id) >= 7);
  if (needy.length) {
    const one = needy[pickIndex(`ask:${tick}:${targetId}:needy`, needy.length)]!;
    return { topic: "hunger", learnedId: one.id,
      line: `${speaker}叹了口气：“${one.r.name}家这几天揭不开锅了，你要是手头宽裕，搭把手吧。”` };
  }
  // 4. 年景：收成、河水、天气，人人都能说两句。
  const story = STORY?.events?.find((e) => e.yields && e.seasons.includes(seasonOf(tick)));
  if (story) {
    return { topic: "season",
      line: `你问起村里最近的事，${speaker}说：“${story.text}”` };
  }
  return { topic: "quiet",
    line: pick([
      `你问起村里最近的事，${speaker}摆摆手：“都挺好，没什么可说的。”`,
      `你问起村里最近的事，${speaker}想了想：“跟往常一样，日子照旧过。”`,
    ], "quiet") };
}

/** 从今天起 days 天内，谁最先过生日。 */
function nextBirthday(world: WorldView, days: number): { id: string; name: string; inDays: number; month: number; day: number } | null {
  let best: { id: string; name: string; inDays: number; month: number; day: number } | null = null;
  for (let d = 0; d < days; d += 1) {
    const t = world.tick + d;
    for (const r of RESIDENTS) {
      const id = residentId(r.key);
      if (!isBirthday(id, t)) continue;
      const date = calendarDate(t);
      const cand = { id, name: r.name, inDays: d, month: date.month, day: date.day };
      if (!best || cand.inDays < best.inDays) best = cand;
    }
    if (best) break;
  }
  return best;
}

/**
 * 今天村里有什么值得知道的。
 *
 * 只有**大家都看得见**的事才自动播报：节日、聚会这种全村的事。至于谁今天过生日、
 * 谁病倒了，那是私事——不认识的人，你凭什么知道他今天生日？所以只有已经打过交道
 * 的人，名字才会出现在这里；陌生人生病只报「村里有人病着」，不带名字。
 * 想知道具体是谁，去问人（`settlement-locations.ask_about`）。
 */
export function happeningsView(world: WorldView, actorId: string): string[] {
  const tick = world.tick, out: string[] = [];
  for (const r of RESIDENTS) {
    const id = residentId(r.key);
    if (!isBirthday(id, tick)) continue;
    // 只有认识的人才报得出名字；不认识的，你根本不知道今天是他生日。
    if (knowsName(world, actorId, id)) out.push(`今天是${personName(world, id)}的生日。`);
  }
  const feast = feastOn(tick);
  if (feast) out.push(feast.text);
  else { const soon = feastSoon(tick); if (soon) out.push(soon.feast.soon.replace("{n}", String(soon.inDays))); }
  const ill = illnessOn(tick);
  if (ill && illnessSpec()) {
    const where = PLACES.find((place) => place.id === occupiedPlaceId(world, ill.residentId))?.name;
    const here = where ? `（人在${where}）` : "";
    // 认识就报名字；不认识只能说「村里有人病着」——想知道是谁，去问人。
    if (knowsName(world, actorId, ill.residentId)) {
      out.push(illnessSpec()!.text.replace("{name}", personName(world, ill.residentId)) + here);
    } else {
      out.push("听说村里有人病倒了，出不了门。" + here + "至于是谁，得去问问别人才知道。");
    }
  }
  return out;
}
