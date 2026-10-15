/**
 * 村民的通用大脑（needs + personality + goal planning）。
 *
 * 不给任何人写日程。每个村民有：
 *  - 性格（勤快、合群、慷慨、谨慎、好奇，0..100）与属性（体力、手巧、见识，1..10），
 *    来自数据包；数据包没写时按名字和年龄稳定地推出来；
 *  - 当下的需要：饥饿、疲惫、屋顶漏、天冷没衣、家里缺什么、存货多少；
 *  - 世界知识：数据包里的配方（要什么材料、在哪做、要什么工具）和采集点（哪里能取什么）。
 *
 * 每走一步都重新想：把所有可追求的目标（吃饭、做一件东西、补存货、去人多处、歇着）
 * 按「需要 × 性格」打分，减去按体力与勤快折算的路程/劳动成本，再从目标倒推出
 * 眼下这一步（走过去 → 取材料 → 走到做活处 → 动手）。见识高的人能倒推更多层
 * （例如 想要粮筐 → 先搓草绳 → 先割芦苇）。
 *
 * 一切只经由普通、经过校验的世界命令（source: "ai"），失败就记下原因换别的目标；
 * 同一种子同一状态得出同一选择（没有随机数，只有按日期和人名的确定性扰动）。
 * 从不碰玩家的东西，也不替玩家做决定。
 */
import type { AgentHost as NpcHost, WorldView } from "@openlife/contracts";
import {
  SettlementCommands, SettlementComponents, SettlementId, dailyActivity, currentYields, hungerAt,
  carrying, roofState, wornWrap, seasonOf, residentId, activityCostFor,
  socialOf, openRequest, favourOwed, tradeableGoods, counterpartView,
} from "../module.ts";
import { whoHas, bondOf, askEase, memoryDays, ASK_COOLDOWN, type SocialMemory } from "../social.ts";
import { SpaceCommands, SpaceRelations, occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectCommands, ObjectRelations, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import { RIVER_TERRACE_PACK, type RecipeSpec } from "../content.ts";
import { tryNpcExchange } from "./npc-exchange.ts";
import { mindOf, temperamentWords, type Mind } from "./mind.ts";
export { mindOf, temperamentWords, residentMind, type Mind } from "./mind.ts";

const PACK = RIVER_TERRACE_PACK;
const LABEL = PACK.resourceLabels;
const EDIBLE = ["resource:cooked", "resource:fish", "resource:grain"];
const HEARTH = PACK.places.find((p) => PACK.yields.some((y) => y.placeId === p.id && y.resourceId === "resource:cooked"))?.id ?? "place:hearth-yard";
const PLACE_OF_SPACE = new Map(PACK.places.flatMap((p) => p.spaces.map((s) => [s.id, p.id] as const)));
const PLACE_NAME = new Map(PACK.places.map((p) => [p.id, p.name] as const));
const SPACE_NAME = new Map(PACK.places.flatMap((p) => p.spaces.map((s) => [s.id, s.name] as const)));
/** 随身留着的东西：衣物工具袋子，以及做到一半的料（陶坯要晾、草绳纤维要接着用）。 */
const KEEP = new Set(["resource:cloth", "resource:bag", "resource:tool", "resource:greenware", "resource:rope", "resource:fiber", "resource:net"]);
const HOME_SPACES = new Set(PACK.residents.map((r) => r.homeSpace));
const VALUES: Record<string, number> = PACK.exchange?.values ?? {};
const OUTPUT_RESOURCE = new Map(PACK.prototypes.map((p) => [p.id, p.resourceId] as const));

function nameOf(world: WorldView, id: string): string {
  const spec = PACK.residents.find((r) => residentId(r.key) === id);
  if (spec) return spec.name;
  const identity = world.getComponent(id, "modern.identity");
  return `${String(identity?.familyName ?? "")}${String(identity?.givenName ?? "")}` || "那人";
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- 看清自己的处境
interface Situation {
  actorId: string; tick: number; season: string;
  hunger: number; remaining: number; capacity: number;
  placeId: string; spaceId: string; homeSpace: string; homePlace: string; workPlace: string;
  carried: Map<string, number>; owned: Map<string, number>;
  roofLeaking: boolean; cold: boolean; wearing: boolean;
  stock: (placeId: string, resourceId: string) => number;
  crowd: Map<string, number>;
  /** 昨天有没有和人待过（社交需要会慢慢回来）。 */
  socialisedYesterday: boolean;
  drawCost: number;
  /** 公地上至少留下的比例（随慷慨程度）。 */
  leaveShare: number;
  /** 自己记得的见闻与人情。 */
  social: SocialMemory;
  /** 此刻和自己在同一处的人。 */
  present: Set<string>;
  playerId: string;
  /** 还在等谁回话（等着就不再开口）。 */
  waiting: boolean;
  /** 我欠谁多少人情、谁欠我多少。 */
  iOwe: Map<string, number>; owesMe: Map<string, number>;
  /** 手上能拿去换或送人的东西（resource -> item ids）。 */
  spare: Record<string, string[]>;
  wits: number;
}

function look(world: WorldView, actorId: string, resident: Record<string, unknown>, mind: Mind): Situation {
  const tick = world.tick;
  const holding = world.getComponent(actorId, SettlementComponents.holding);
  const founded = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  const hunger = hungerAt(Number(holding?.hunger ?? 0), Number(holding?.hungerAt ?? founded ?? tick), tick);
  const act = dailyActivity(world, actorId);
  const homeSpace = String(resident.homeSpace || "");
  const homePlace = world.listRelations({ type: SpaceRelations.inside, from: homeSpace })[0]?.to
    || PLACE_OF_SPACE.get(homeSpace) || String(resident.workPlace || "");
  const carried = new Map(carrying(world, actorId).map((r) => [r.resourceId, r.count] as const));
  const owned = new Map<string, number>();
  for (const rel of world.listRelations({ type: ObjectRelations.ownedBy, to: actorId })) {
    const e = world.getEntity(rel.from);
    if (!e || e.archivedAt !== undefined) continue;
    const r = prototypeOf(world, rel.from).resourceId;
    owned.set(r, (owned.get(r) ?? 0) + 1);
  }
  const points = currentYields(world);
  const crowd = new Map<string, number>();
  const playerId = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  const people = [...PACK.residents.map((r) => ({ id: residentId(r.key), home: r.homeSpace })),
    ...(playerId ? [{ id: playerId, home: "" }] : [])];
  const here = occupiedPlaceId(world, actorId);
  const present = new Set<string>();
  for (const person of people) {
    const at = occupiedPlaceId(world, person.id);
    if (!at || person.id === actorId) continue;
    if (at === here) present.add(person.id);
    // 在屋里睡着的人不算「人多热闹」。
    if (occupiedSpaceId(world, person.id) === person.home || HOME_SPACES.has(occupiedSpaceId(world, person.id))) continue;
    crowd.set(at, (crowd.get(at) ?? 0) + 1);
  }
  const iOwe = new Map<string, number>(), owesMe = new Map<string, number>();
  for (const person of people) {
    if (person.id === actorId) continue;
    const a = favourOwed(world, person.id, actorId), b = favourOwed(world, actorId, person.id);
    if (a > 0) iOwe.set(person.id, a);
    if (b > 0) owesMe.set(person.id, b);
  }
  const yesterday = resident.lastRoutineActions;
  const socialisedYesterday = Array.isArray(yesterday) && yesterday.some((a) => /聊|交换|换/.test(String(a)));
  const season = seasonOf(tick);
  const wearing = Boolean(wornWrap(world, actorId));
  return {
    actorId, tick, season, hunger, remaining: act.remaining, capacity: act.capacity,
    placeId: occupiedPlaceId(world, actorId), spaceId: occupiedSpaceId(world, actorId),
    homeSpace, homePlace, workPlace: String(resident.workPlace || ""),
    carried, owned,
    roofLeaking: Boolean(homeSpace && roofState(world, homeSpace).leaking),
    cold: season === "冬" || season === "秋", wearing,
    stock: (placeId, resourceId) => points.find((p) => p.placeId === placeId && p.resourceId === resourceId)?.stock ?? 0,
    crowd, socialisedYesterday,
    drawCost: activityCostFor(world, actorId, SettlementCommands.draw),
    leaveShare: 0.2 + mind.personality.generosity / 500,
    social: socialOf(world, actorId), present, playerId,
    waiting: Boolean(openRequest(world, actorId)), iOwe, owesMe,
    spare: tradeableGoods(world, actorId), wits: mind.attributes.wits,
  };
}

// ---------------------------------------------------------------- 想要什么
/** 做出这件东西对这个人此刻值多少（0 表示不想要）。 */
function desireFor(output: string, s: Situation, m: Mind): { value: number; why: string } {
  const p = m.personality, has = (r: string) => (s.owned.get(r) ?? 0) > 0;
  const novelty = has(output) ? 0 : p.curiosity * 0.15;
  switch (output) {
    case "resource:mat": return has("resource:mat") ? { value: 4, why: "" } : { value: 42 + novelty, why: "家里还没有一张自己的席子" };
    case "resource:cloth": return s.cold && !s.wearing && !has("resource:cloth")
      ? { value: 58, why: `${s.season}天冷，身上没有御寒的衣物` } : { value: 3 + novelty * 0.3, why: "" };
    case "resource:bag": return has("resource:bag") ? { value: 2, why: "" } : { value: 22 + novelty, why: "想要一只能装东西的提袋" };
    case "resource:jar": return has("resource:jar") ? { value: 6 + p.caution * 0.05, why: "多一个罐子好存东西" } : { value: 34 + novelty, why: "想要一个自己的罐子" };
    case "resource:bowl": return has("resource:bowl") ? { value: 3, why: "" } : { value: 18 + novelty, why: "想要一只自己的碗" };
    case "resource:basket": return has("resource:basket") ? { value: 2, why: "" } : { value: 10 + p.caution * 0.3 + novelty, why: "想要一只粮筐好存粮" };
    case "resource:net": return has("resource:net") ? { value: 2, why: "" } : { value: 12 + p.curiosity * 0.2, why: "想自己下河捕鱼" };
    case "resource:tool": return has("resource:tool") ? { value: 2, why: "" } : { value: 12 + novelty * 0.5, why: "想要一件趁手的工具" };
    case "resource:greenware": return !has("resource:jar") && !has("resource:greenware")
      ? { value: 24 + novelty, why: "先捏个陶坯，晾干了好烧罐子" } : { value: 0, why: "" };
    case "resource:fish": return s.hunger >= 3 ? { value: s.hunger * 5, why: "肚子饿，想下网捕鱼" } : { value: 4 + p.caution * 0.05, why: "" };
    case "resource:cooked": return s.hunger >= 3 ? { value: s.hunger * 7, why: "肚子饿，想自己烤点吃的" } : { value: 0, why: "" };
    default: return { value: 2, why: "" };
  }
}

function recipeOutput(r: RecipeSpec): string {
  if (r.repairs === "roof") return "repair:roof";
  return r.output ? OUTPUT_RESOURCE.get(r.output.prototypeId) ?? "" : "";
}
function producers(resourceId: string): RecipeSpec[] {
  return (PACK.recipes ?? []).filter((r) => recipeOutput(r) === resourceId);
}
function sourcesOf(resourceId: string): string[] {
  return PACK.yields.filter((y) => y.resourceId === resourceId && y.resourceId !== "resource:cooked").map((y) => y.placeId);
}

// ---------------------------------------------------------------- 从目标倒推下一步
type Step =
  | { kind: "go"; placeId: string }
  | { kind: "enter"; spaceId: string }
  | { kind: "draw"; placeId: string; resourceId: string; amount: number }
  | { kind: "craft"; recipe: RecipeSpec }
  | { kind: "eat-carried"; resourceId: string }
  | { kind: "eat-hearth" }
  | { kind: "store" }
  | { kind: "visit"; placeId: string }
  | { kind: "ask"; targetId: string; resourceId: string; reason: string }
  | { kind: "give"; targetId: string; itemId: string }
  | { kind: "rest" };

interface Plan { first: Step; cost: number; why: string }

/** 把 need 份 resourceId 弄到手的第一步与估计成本（劳动格）。depth 由见识决定。 */
function obtain(resourceId: string, need: number, s: Situation, depth: number, blocked: Set<string>, extraShare = 0, mind?: Mind): Plan | null {
  let best: Plan | null = null;
  for (const placeId of sourcesOf(resourceId)) {
    if (blocked.has(`draw:${placeId}:${resourceId}`)) continue;
    // 公地规矩：慢慢才长回来的东西要给别人和下一季留一份；越慷慨的人留得越多。
    const spec = PACK.yields.find((y) => y.placeId === placeId && y.resourceId === resourceId);
    const reserve = spec && spec.renewDays > 1 ? Math.ceil(spec.capacity * (s.leaveShare + extraShare + Math.min(0.35, spec.renewDays / 130))) : 0;
    if (s.stock(placeId, resourceId) - need < reserve) continue;
    const travel = s.placeId === placeId ? 0 : 1;
    const plan: Plan = {
      first: travel ? { kind: "go", placeId } : { kind: "draw", placeId, resourceId, amount: need },
      cost: travel + need, why: `去${PLACE_NAME.get(placeId)}取${LABEL[resourceId] ?? resourceId}`,
    };
    if (!best || plan.cost < best.cost) best = plan;
  }
  if (depth > 0) for (const r of producers(resourceId)) {
    const made = r.output?.perInput ? (r.inputs[0]?.count ?? 1) : (r.output?.count ?? 1);
    const runs = Math.ceil(need / Math.max(1, made));
    if (runs > 1) continue;
    const sub = planRecipe(r, s, depth - 1, blocked, mind);
    if (sub && (!best || sub.cost < best.cost)) best = sub;
  }
  // 自己弄不到，才会想到去求记得手上有这东西的人。
  if (!best && mind && need === 1) {
    const ask = askPlan(resourceId, s, mind, blocked, `做东西缺${LABEL[resourceId] ?? "材料"}`);
    if (ask) best = { ...ask.plan, cost: ask.plan.cost + Math.max(0, 6 - ask.ease / 4) };
  }
  return best;
}

/**
 * 去求谁、走到哪一步。只在记得对方手上有这样东西时才会想到；
 * 合不合适开口看熟悉、信任、怨气、性格和人情账。
 */
function askPlan(resourceId: string, s: Situation, m: Mind, blocked: Set<string>, reason: string): { plan: Plan; ease: number } | null {
  let best: { plan: Plan; ease: number } | null = null;
  for (const who of whoHas(s.social, resourceId, s.tick, s.wits, s.actorId)) {
    const target = who.personId;
    if (blocked.has(`ask:${target}`)) continue;
    const isPlayer = target === s.playerId;
    if (isPlayer && (s.waiting || s.tick - (s.social.asked[target] ?? -100) < ASK_COOLDOWN)) continue;
    const ease = askEase(bondOf(s.social, target), m.personality, s.owesMe.get(target) ?? 0, s.iOwe.get(target) ?? 0) - (who.heard ? 4 : 0);
    if (ease < -6) continue;
    let plan: Plan;
    if (s.present.has(target)) plan = { first: { kind: "ask", targetId: target, resourceId, reason }, cost: 1, why: reason };
    else if (!who.placeId || s.placeId === who.placeId) continue; // 不知道人在哪，或记得在这儿可人已经不在了
    else plan = { first: { kind: "go", placeId: who.placeId }, cost: 2, why: `去${PLACE_NAME.get(who.placeId)}找人` };
    if (!best || ease - plan.cost * 3 > best.ease - best.plan.cost * 3) best = { plan, ease };
  }
  return best;
}

/** 最舍得拿出手的一件东西（不是随身要用的，也不是眼下要用的料；饿着时不拿吃的）。 */
function spareItem(s: Situation, m: Mind, notResource = "", maxWorth = Infinity): string {
  const wanted = wantedInputs(s, m);
  const options = Object.entries(s.spare)
    .filter(([r]) => r !== notResource && !KEEP.has(r) && !wanted.has(r) && !(s.hunger >= 3 && EDIBLE.includes(r)) && (VALUES[r] ?? 0) <= maxWorth)
    .sort((a, b) => (VALUES[b[0]] ?? 0) - (VALUES[a[0]] ?? 0) || a[0].localeCompare(b[0]));
  return options[0]?.[1][0] ?? "";
}

function holdsTool(s: Situation, recipe: RecipeSpec): boolean {
  if (!recipe.tool) return true;
  const resource = OUTPUT_RESOURCE.get(recipe.tool) ?? "";
  return (s.carried.get(resource) ?? 0) > 0;
}

function recipeSpace(recipe: RecipeSpec, s: Situation): string {
  return recipe.spaceId === "@home" ? s.homeSpace : recipe.spaceId;
}

function planRecipe(recipe: RecipeSpec, s: Situation, depth: number, blocked: Set<string>, mind?: Mind): Plan | null {
  if (blocked.has(`craft:${recipe.id}`) || !holdsTool(s, recipe)) return null;
  if (recipe.seasons && !recipe.seasons.includes(s.season)) return null;
  let cost = recipe.activity;
  for (const input of recipe.inputs) {
    const missing = input.count - (s.carried.get(input.resourceId) ?? 0);
    if (missing <= 0) continue;
    if (input.minAgeDays) return null; // 要等它晾干的材料不能临时弄到
    const got = obtain(input.resourceId, missing, s, depth, blocked, 0, mind);
    if (!got) return null;
    return { first: got.first, cost: cost + got.cost + 1, why: got.why };
  }
  const spaceId = recipeSpace(recipe, s);
  const placeId = PLACE_OF_SPACE.get(spaceId) ?? s.homePlace;
  if (s.placeId !== placeId) return { first: { kind: "go", placeId }, cost: cost + 1, why: `带着材料去${PLACE_NAME.get(placeId)}` };
  if (spaceId && s.spaceId !== spaceId) return { first: { kind: "enter", spaceId }, cost, why: `走到${SPACE_NAME.get(spaceId)}` };
  return { first: { kind: "craft", recipe }, cost, why: recipe.label };
}

/** 眼下想做的东西要用到的料：这些不往家里收。 */
function wantedInputs(s: Situation, m: Mind): Set<string> {
  const out = new Set<string>();
  for (const recipe of PACK.recipes ?? []) {
    const output = recipeOutput(recipe);
    const value = output === "repair:roof" ? (s.roofLeaking ? 70 : 0) : desireFor(output, s, m).value;
    if (value >= 8) for (const input of recipe.inputs) out.add(input.resourceId);
  }
  return out;
}

interface Option { id: string; utility: number; plan: Plan; motive: string }

function options(s: Situation, m: Mind, blocked: Set<string>, today: Set<string>): Option[] {
  const p = m.personality, a = m.attributes;
  // 劳动成本感：勤快、体力好的人觉得一格活不算什么。
  const effort = 3.2 - p.diligence / 50 - a.strength / 10;
  const depth = a.wits >= 7 ? 3 : a.wits >= 4 ? 2 : 1;
  const out: Option[] = [];
  const push = (id: string, value: number, plan: Plan | null, motive: string) => {
    if (!plan || value <= 0) return;
    if (plan.first.kind === "craft" && plan.first.recipe.activity > s.remaining) return;
    if (plan.first.kind === "go" && s.remaining < 1) return;
    if (plan.first.kind === "draw" && s.drawCost > s.remaining) return;
    out.push({ id, utility: value - plan.cost * effort, plan, motive });
  };

  // 吃
  if (s.hunger >= 3) {
    const value = s.hunger * 11;
    const carriedFood = EDIBLE.find((r) => (s.carried.get(r) ?? 0) > 0);
    if (carriedFood && !blocked.has("eat-carried")) push("eat", value + 4, { first: { kind: "eat-carried", resourceId: carriedFood }, cost: 0, why: `吃随身带的${LABEL[carriedFood]}` }, "饿了");
    else if (!blocked.has("eat-hearth")) push("eat", value, {
      first: s.placeId === HEARTH ? { kind: "eat-hearth" } : { kind: "go", placeId: HEARTH },
      cost: s.placeId === HEARTH ? 0 : 1, why: s.placeId === HEARTH ? "在公灶吃饭" : "去公灶找吃的" }, "饿了");
  }

  // 饿着、身上没吃的、公灶也指望不上：想起谁手上有吃的，就去开口。
  if (s.hunger >= 4 && !EDIBLE.some((r) => (s.carried.get(r) ?? 0) > 0) &&
      (blocked.has("eat-hearth") || s.stock(HEARTH, "resource:cooked") <= 0)) {
    let best: { plan: Plan; ease: number; r: string } | null = null;
    for (const r of EDIBLE) {
      const a = askPlan(r, s, m, blocked, `饿了，公灶没吃的`);
      if (a && (!best || a.ease > best.ease)) best = { ...a, r };
    }
    if (best) push(`ask-food`, s.hunger * 11 - 8 + best.ease * 0.6, best.plan, "饿了，公灶没吃的");
  }

  // 还人情：欠着谁，手上又有拿得出手的东西，就给人送去。慷慨、信得过对方的人更上心。
  for (const [creditor, owed] of [...s.iOwe.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (blocked.has(`give:${creditor}`) || today.has(`gave:${creditor}`)) continue;
    const item = spareItem(s, m, "", owed + 1);
    if (!item) continue;
    const seen = s.social.seen[creditor];
    const value = 10 + owed * 6 + p.generosity * 0.2 + (bondOf(s.social, creditor).trust - 5) * 2;
    if (s.present.has(creditor)) push(`give:${creditor}`, value, { first: { kind: "give", targetId: creditor, itemId: item }, cost: 0, why: "还人情" }, "欠着人情");
    else if (seen && seen.placeId && s.tick - seen.at <= memoryDays(s.wits) && seen.placeId !== s.placeId)
      push(`give:${creditor}`, value, { first: { kind: "go", placeId: seen.placeId }, cost: 1, why: "去还人情" }, "欠着人情");
    break;
  }

  // 做东西：所有配方都是候选，值多少取决于需要和性格，手巧的人更愿意动手。
  const handy = 0.55 + a.dexterity * 0.07;
  for (const recipe of PACK.recipes ?? []) {
    const output = recipeOutput(recipe);
    let desire: { value: number; why: string };
    if (output === "repair:roof") desire = s.roofLeaking ? { value: 70 + p.caution * 0.2, why: "住处屋顶漏了" } : { value: 0, why: "" };
    else desire = desireFor(output, s, m);
    if (today.has(`made:${output}`)) desire = { value: desire.value * 0.3, why: desire.why };
    if (desire.value < 8) continue;
    const plan = planRecipe(recipe, s, depth, blocked, m);
    push(`craft:${recipe.id}`, desire.value * handy, plan, desire.why || `想${recipe.label}`);
    // 自己做不成（缺工具、不当季、料不够），又记得谁手上有现成的，就去商量。
    if (!plan && desire.value >= 15 && output !== "repair:roof" && !blocked.has(`get:${output}`)) {
      const a = askPlan(output, s, m, blocked, desire.why || `想要${LABEL[output] ?? "这样东西"}`);
      if (a) push(`get:${output}`, desire.value * 0.8 + a.ease * 0.4, a.plan, desire.why || "自己做不成");
    }
  }

  // 本行的活：习惯在自己的劳动地点干活，勤快和谨慎（爱囤）的人更想。
  const job = PACK.places.find((pl) => pl.id === s.workPlace)?.jobResource;
  if (job && !today.has("job-done")) {
    const stocked = s.owned.get(job) ?? 0;
    const value = p.diligence * 0.45 + p.caution * 0.15 - Math.min(stocked, 8) * 3;
    // 体力好的人一趟能多背一份。
    push("job", value, obtain(job, a.strength >= 7 ? 2 : 1, s, 0, blocked, 0.3), `照看自己在${PLACE_NAME.get(s.workPlace)}的活`);
  }

  // 收进家里：谨慎的人不爱把东西带在身上过夜。
  const wanted = wantedInputs(s, m);
  const loose = [...s.carried.entries()].filter(([r]) => !KEEP.has(r) && !wanted.has(r))
    .reduce((n, [, c]) => n + c, 0);
  if (loose >= 2 && !blocked.has("store")) push("store", 10 + p.caution * 0.35 + loose * 3,
    s.placeId === s.homePlace ? { first: { kind: "store" }, cost: 0, why: "把东西收进家里" }
      : { first: { kind: "go", placeId: s.homePlace }, cost: 1, why: "把东西带回家" }, "身上东西多了");

  // 去人多的地方：合群的人会想去凑热闹，碰面时自然会互相交换。
  if (!today.has("visited")) {
    const [busiest, count] = [...s.crowd.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0] ?? [HEARTH, 1];
    if (busiest && count >= 1) push("visit", (p.sociability * 0.45 + count * 2) * (s.socialisedYesterday ? 0.45 : 1),
      s.placeId === busiest ? { first: { kind: "visit", placeId: busiest }, cost: 0, why: `在${PLACE_NAME.get(busiest)}和人说说话` }
        : { first: { kind: "go", placeId: busiest }, cost: 1, why: `去${PLACE_NAME.get(busiest)}凑凑热闹` }, "想见见人");
  }

  // 存粮：谨慎的人在冬天来之前想多备点粮。
  const food = EDIBLE.reduce((n, r) => n + (s.owned.get(r) ?? 0), 0);
  if (!today.has("hoard-done")) {
    const winterSoon = s.season === "秋" || s.season === "冬" ? 1.4 : 1;
    push("hoard", (p.caution * 0.4 - food * 6) * winterSoon, obtain("resource:grain", 1, s, 0, blocked, 0.2), "想多存点粮");
  }

  // 好奇：去不常去的地方看看。
  if (!today.has("wandered")) {
    const elsewhere = PACK.places.map((pl) => pl.id).filter((id) => id !== s.placeId && id !== s.workPlace && id !== s.homePlace);
    const target = elsewhere[hash(`${s.actorId}:${s.tick}:wander`) % Math.max(1, elsewhere.length)];
    if (target) push("wander", p.curiosity * 0.4 - 8, { first: { kind: "go", placeId: target }, cost: 1, why: `去${PLACE_NAME.get(target)}转转` }, "好奇");
  }

  // 歇着：累了、或者本来就散漫。
  const tired = 1 - s.remaining / Math.max(1, s.capacity);
  out.push({ id: "rest", utility: 6 + tired * 30 + (100 - p.diligence) * 0.15, plan: { first: { kind: "rest" }, cost: 0, why: "回家歇着" }, motive: "累了" });

  // 确定性的小扰动：同一天同一个人每次想法一致，不同人、不同天会有差别。
  for (const o of out) o.utility += (hash(`${s.actorId}:${s.tick}:${o.id}`) % 9) - 4;
  return out.sort((x, y) => y.utility - x.utility || x.id.localeCompare(y.id));
}

// ---------------------------------------------------------------- 过一天
export interface BrainDay { actorId: string; tick: number; skipped: boolean; actions: string[]; note: string }

/**
 * 一个村民这一天的思考过程。step() 每次只走一步，所以全村可以轮流走：
 * 大家在同一时段真的会在同一个地方碰面，交换才会自然发生。
 */
export class BrainRun {
  readonly actorId: string;
  readonly skipped: boolean;
  private readonly name: string;
  private readonly mind: Mind;
  private readonly actions: string[] = [];
  private readonly blocked = new Set<string>();
  private readonly today = new Set<string>();
  private obstacle = "";
  private done = false;
  private steps = 0;

  private readonly sim: NpcHost;
  private readonly resident: Record<string, unknown>;

  constructor(sim: NpcHost, resident: Record<string, unknown>) {
    this.sim = sim;
    this.resident = resident;
    this.actorId = String(resident.id);
    this.name = String(resident.name);
    const world = sim.worldView();
    const entity = world.getEntity(this.actorId);
    const active = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
    this.skipped = !entity || entity.archivedAt !== undefined || entity.components["modern.vitals"]?.alive === false ||
      this.actorId === active || Number(resident.lastRoutineAt) === sim.tick;
    const spec = PACK.residents.find((r) => residentId(r.key) === this.actorId);
    this.mind = mindOf(spec ?? { key: this.actorId, age: Number(resident.age) || 30 });
    this.done = this.skipped;
  }

  get active(): boolean { return !this.done; }

  private act(type: string, payload: Record<string, unknown>, label: string, quiet = false): boolean {
    const result = this.sim.dispatch({ type, actorId: this.actorId, source: "ai", payload: payload as never });
    if (result.ok) { this.actions.push(label); return true; }
    if (!quiet) this.obstacle = result.errors?.[0]?.message ?? `${label}失败`;
    return false;
  }
  /** 把这一步记进今天的故事：同一个念头下做的几件事归成一句。 */
  private say(motive: string, label: string) {
    const last = this.groups[this.groups.length - 1];
    if (last && last.motive === motive) last.labels.push(label);
    else this.groups.push({ motive, labels: [label] });
  }
  private readonly groups: Array<{ motive: string; labels: string[] }> = [];

  /** 想一想、走一步。返回 false 表示今天不再行动。 */
  step(): boolean {
    if (this.done) return false;
    if (++this.steps > 16) return this.stop();
    const { sim, actorId, blocked, today } = this;
    const s = look(sim.worldView(), actorId, this.resident, this.mind);
    if (s.remaining <= 0) return this.stop();
    const choice = options(s, this.mind, blocked, today)[0];
    if (!choice || choice.plan.first.kind === "rest") return this.stop();
    const first = choice.plan.first;
    const before = this.actions.length;
    let ok = false;
    switch (first.kind) {
      case "go":
        ok = this.act(SettlementCommands.arrive, { placeId: first.placeId, travelMode: "local" }, `去了${PLACE_NAME.get(first.placeId) ?? "别处"}`);
        if (!ok) blocked.add(choice.id === "eat" ? "eat-hearth" : choice.id);
        if (ok) this.notice();
        if (ok && choice.id === "wander") today.add("wandered");
        // 为了见人而来的，到了就和人待一会儿。
        if (ok && choice.id === "visit") this.visit(first.placeId, s.hunger);
        break;
      case "enter":
        ok = this.act(SpaceCommands.moveWithin, { spaceId: first.spaceId }, `走到${SPACE_NAME.get(first.spaceId) ?? "里面"}`);
        if (!ok) blocked.add(choice.id);
        break;
      case "draw": {
        const spot = PACK.places.find((pl) => pl.id === first.placeId)?.workSpot;
        if (spot && s.spaceId !== spot) sim.dispatch({ type: SpaceCommands.moveWithin, actorId, source: "ai", payload: { spaceId: spot } });
        ok = this.act(SettlementCommands.draw, { placeId: first.placeId, resourceId: first.resourceId, amount: first.amount },
          `采了${first.amount > 1 ? first.amount + "份" : "一份"}${LABEL[first.resourceId] ?? "物资"}`);
        if (!ok) blocked.add(`draw:${first.placeId}:${first.resourceId}`);
        if (choice.id === "job" || choice.id === "hoard") today.add(`${choice.id}-done`);
        if (ok && (s.crowd.get(s.placeId) ?? 0) > 0) {
          const trade = tryNpcExchange(sim, actorId, s.hunger);
          if (trade) this.actions.push(trade.label);
        }
        break;
      }
      case "craft": {
        const r = first.recipe;
        ok = this.act(r.command ?? SettlementCommands.craft, r.command ? {} : { recipeId: r.id }, r.repairs ? "修补了自家屋顶" : r.label.replace(/^(编|剥取|搓|结|削|捏|烧|下网捕|烤)/, "$1好"));
        if (ok) today.add(`made:${recipeOutput(r)}`); else blocked.add(`craft:${r.id}`);
        break;
      }
      case "eat-carried": {
        const item = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((x) => x.from)
          .find((id) => prototypeOf(sim.worldView(), id).resourceId === first.resourceId);
        ok = Boolean(item) && this.act(SettlementCommands.eat, { objectId: item }, `吃了随身的${LABEL[first.resourceId]}`);
        if (!ok) blocked.add("eat-carried");
        break;
      }
      case "eat-hearth":
        if (s.stock(HEARTH, "resource:cooked") > 0 &&
            this.act(SettlementCommands.eat, { placeId: HEARTH, resourceId: "resource:cooked" }, "吃一份熟食")) {
          this.actions.push("饥饿有所缓解"); ok = true;
        } else {
          this.actions.push("公灶今天没有熟食");
          const trade = tryNpcExchange(sim, actorId, s.hunger);
          if (trade) this.actions.push(trade.label);
          blocked.add("eat-hearth");
        }
        break;
      case "store": {
        const items = sim.worldView().listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((x) => x.from)
          .filter((id) => ownerOf(sim.worldView(), id) === actorId && !KEEP.has(prototypeOf(sim.worldView(), id).resourceId) &&
            !wantedInputs(s, this.mind).has(prototypeOf(sim.worldView(), id).resourceId));
        for (const id of items) ok = this.act(ObjectCommands.place, { objectId: id, placeId: s.homePlace }, "", true) || ok;
        if (ok) { this.actions.splice(before); this.actions.push(`把${items.length}件东西收进家里`); }
        blocked.add("store");
        break;
      }
      case "visit":
        this.visit(first.placeId, s.hunger); ok = true;
        break;
      case "ask":
        ok = this.ask(first, s);
        blocked.add(`ask:${first.targetId}`);
        break;
      case "give": {
        const r = prototypeOf(sim.worldView(), first.itemId).resourceId ?? "";
        ok = this.act(SettlementCommands.npcGive, { targetId: first.targetId, itemId: first.itemId },
          `把一份${LABEL[r] ?? "东西"}送给${nameOf(sim.worldView(), first.targetId)}，还上人情`);
        today.add(`gave:${first.targetId}`);
        if (!ok) blocked.add(`give:${first.targetId}`);
        break;
      }
    }
    if (ok) this.say(choice.motive, this.actions.slice(before).filter((a) => !a.startsWith("饥饿")).join("、") || choice.plan.why);
    if (!ok && first.kind === "go") return this.stop();
    return true;
  }

  private stop(): boolean { this.done = true; return false; }

  /** 看看身边有谁、带着什么（只记在自己脑子里，不花时间）。 */
  private notice() {
    // 只有身边真有别人时才值得留意（也省得白跑一遍命令）。
    const world = this.sim.worldView(), here = occupiedPlaceId(world, this.actorId);
    if (!here || !world.listEntities({ kind: "modern.character" }).some((e) => e.id !== this.actorId && e.archivedAt === undefined && occupiedPlaceId(world, e.id) === here)) return;
    this.sim.dispatch({ type: SettlementCommands.npcNotice, actorId: this.actorId, source: "ai", payload: {} });
  }

  /** 当面开口。对玩家是留下一个等回话的请求；对村民就是当场商量赊换。 */
  private ask(step: { targetId: string; resourceId: string; reason: string }, s: Situation): boolean {
    const world = this.sim.worldView();
    const who = nameOf(world, step.targetId), what = LABEL[step.resourceId] ?? "东西";
    const offer = spareItem(s, this.mind, step.resourceId, (VALUES[step.resourceId] ?? 1) * 1.5);
    const offerLabel = offer ? LABEL[prototypeOf(world, offer).resourceId ?? ""] ?? "东西" : "";
    if (step.targetId === s.playerId) {
      const collect = (s.owesMe.get(step.targetId) ?? 0) > 0;
      return this.act(SettlementCommands.npcRequest,
        { targetId: step.targetId, resourceId: step.resourceId, give: offer ? [offer] : [], reason: step.reason },
        collect ? `找${who}讨个人情，想要一份${what}` : offer ? `找${who}商量，想用${offerLabel}换一份${what}` : `找${who}开口借一份${what}`);
    }
    const partner = counterpartView(world, this.actorId, step.targetId);
    const result = this.sim.dispatch({ type: SettlementCommands.exchange, actorId: this.actorId, source: "ai",
      payload: { targetId: step.targetId, give: offer ? [offer] : [], askResource: step.resourceId, askAmount: 1, credit: true } as never });
    if (!result.ok) { this.obstacle = result.errors?.[0]?.message ?? "开口没成"; return false; }
    const got = (tradeableGoods(this.sim.worldView(), this.actorId)[step.resourceId]?.length ?? 0) > (s.spare[step.resourceId]?.length ?? 0);
    this.actions.push(got ? `向${partner.name}${offer ? `用${offerLabel}换了` : "赊了"}一份${what}` : `向${partner.name}开口要${what}，对方没答应`);
    return got;
  }

  private visit(placeId: string, hunger: number) {
    this.today.add("visited");
    const trade = tryNpcExchange(this.sim, this.actorId, hunger);
    this.actions.push(trade ? trade.label : `和${PLACE_NAME.get(placeId)}的人聊了几句`);
  }

  /** 天黑回家歇着，写下今天。 */
  finish(): BrainDay {
    const { sim, actorId } = this;
    if (this.skipped) return { actorId, tick: sim.tick, skipped: true, actions: [], note: "今日不接管" };
    const end = look(sim.worldView(), actorId, this.resident, this.mind);
    if (end.placeId !== end.homePlace) this.act(SettlementCommands.arrive, { placeId: end.homePlace, travelMode: "local" }, "回家", true);
    if (end.homeSpace && occupiedSpaceId(sim.worldView(), actorId) !== end.homeSpace)
      this.act(SpaceCommands.moveWithin, { spaceId: end.homeSpace }, "进屋", true);
    if (occupiedPlaceId(sim.worldView(), actorId) === end.homePlace && dailyActivity(sim.worldView(), actorId).remaining >= 2)
      this.act(SettlementCommands.rest, { spaceId: end.homeSpace }, "休息", true);
    const words = temperamentWords(this.mind);
    const told = this.groups.map((g) => `${g.labels.join("、")}${g.motive ? `（${g.motive}）` : ""}`);
    const obstacle = /结束这一天/.test(this.obstacle) ? "" : this.obstacle;
    const note = `${this.name}${words.length ? `（${words.join("、")}）` : ""}：${told.join("；") || "今天没出门，在家歇着"}${obstacle ? "。没办成的：" + obstacle : ""}`;
    const marker = sim.dispatch({ type: SettlementCommands.npcMarkDay, actorId, source: "ai", payload: { actions: this.actions, summary: note } });
    return { actorId, tick: sim.tick, skipped: false, actions: [...this.actions], note: marker.ok ? note : `${note}；未能记录日程` };
  }
}

/** 一群人轮流一步一步过完这一天（同一顺序，结果可复现）。 */
export function runBrainDays(sim: NpcHost, residents: Array<Record<string, unknown>>): BrainDay[] {
  const runs = residents.map((r) => new BrainRun(sim, r));
  for (let round = 0; round < 16 && runs.some((r) => r.active); round++)
    for (const run of runs) run.step();
  return runs.map((r) => r.finish());
}

export function runBrainDay(sim: NpcHost, resident: Record<string, unknown>): BrainDay {
  return runBrainDays(sim, [resident])[0]!;
}
