/**
 * 一季一季地过：长跳时间里村里不逐日模拟，由这里按「这一季你多半在干什么、
 * 跟谁在一起」结算口粮、交情、手艺与收获（registerSeasonLife）；以及成家、
 * 生养这一条人生线（registerFamilyLife、familyView）。
 *
 * 从 module.ts 原样搬出。本文件不得 import module.ts 或 autonomy/*。
 */
import { RIVER_TERRACE_PACK } from "./content.ts";
import { AGE_OF, childrenOf, draftOf, expectingAt, FAMILY, familyEffects, flushDraft, originOf, prototypeForResource, RESOURCE_LABELS, seasonOf, seasonTurnDue, skillsOf, type SocialDraft, TEACHERS } from "./village-reads.ts";
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { isIll } from "./happenings.ts";
import { residentId, SettlementCommands, SettlementComponents, SettlementRejection } from "./vocabulary.ts";
import { refuse, type Registration } from "./rules.ts";
import { activeId, personName, RESIDENTS, socialOf } from "./world-reads.ts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { bondOf, withBond } from "./social.ts";
import { canCarryPrototype, ObjectComponents, ObjectKinds, ObjectRelations } from "@openlife/module-world-objects";
import { seasonTurnEffects } from "./storyteller.ts";
import { spouseOf } from "./marriage.ts";

// ---------------------------------------------------------------------------
// 一季一季地过：人生不能一天天抠，把心思放在一处，一季过去再结算。
// 时间一口气推过去时村里不逐日模拟（内核把长跳当作略过），所以由这里按
// 「这一季你多半在干什么、跟谁在一起」结算口粮、交情、手艺与收获。
// ---------------------------------------------------------------------------
export const SEASON_LIFE = RIVER_TERRACE_PACK.seasonLife;

export type Season = "春" | "夏" | "秋" | "冬";

/** 从今天到这一季结束还剩几天（含今天之后的日子，至少 1 天）。 */
export function daysLeftInSeason(tick: number): number {
  const season = seasonOf(tick);
  let d = 1;
  while (seasonOf(tick + d) === season && d < 120) d += 1;
  return d;
}

export function seasonRefusal(world: WorldView, me: string): string {
  if (isIll(world.tick, me)) return "病着，先把身子养好";
  if (world.getComponent(me, "practice-runtime.active")) return "手上的手艺还没做完";
  return "";
}

export function pendingSeason(world: WorldView, me: string): { from: number; focus: string; season: Season; age: number } | null {
  const raw = world.getComponent(me, SettlementComponents.holding)?.seasonPending;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, JsonValue>;
  return { from: Number(r.from), focus: String(r.focus), season: String(r.season) as Season, age: Number(r.age ?? 0) };
}

/** 一起过日子的人：配偶、孩子，以及出身里就一起住的人（如陶家）。 */
export function familyOf(world: WorldView, me: string): string[] {
  const out = new Set<string>();
  for (const r of world.listRelations({ type: "family.married_to", from: me })) out.add(r.to);
  for (const r of world.listRelations({ type: "family.parent_of", from: me })) out.add(r.to);
  for (const r of world.listRelations({ type: "family.parent_of", to: me })) out.add(r.from);
  const origin = originOf(world, me);
  const spec = (RIVER_TERRACE_PACK.origins ?? []).find((o) => o.id === origin.id);
  for (const [key, b] of Object.entries(spec?.bonds ?? {})) if (Number(b.familiarity ?? 0) >= 4) out.add(residentId(key));
  return [...out].filter((id) => world.getEntity(id) && world.getEntity(id)!.archivedAt === undefined &&
    world.getComponent(id, "modern.vitals")?.alive !== false);
}

export function registerSeasonLife(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.beginSeason}.allowed`, commandType: SettlementCommands.beginSeason,
    evaluate: (c) => {
      const me = c.command.actorId ?? "";
      if (!me || me !== activeId(c.world) || !occupiedPlaceId(c.world, me)) return refuse(SettlementRejection.NotYours, "只有在村里落了脚，才谈得上怎么过日子。");
      if (!SEASON_LIFE?.focuses.some((f) => f.id === String(c.command.payload.focus))) return refuse(SettlementRejection.Busy, "要先想好这一季把心思放在哪儿。");
      const why = seasonRefusal(c.world, me);
      return why ? refuse(SettlementRejection.Busy, `${why}。`) : { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.beginSeason}.resolve`, commandType: SettlementCommands.beginSeason,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string;
      const seasonPending = { from: c.world.tick, focus: String(c.command.payload.focus), season: seasonOf(c.world.tick),
        age: Number(c.world.getComponent(me, "modern.vitals")?.ageYears ?? 0) };
      const holding = c.world.getComponent(me, SettlementComponents.holding);
      return [holding
        ? { kind: "modifyComponent", entityId: me, component: SettlementComponents.holding, patch: { seasonPending }, reason: "a season to live through" }
        : { kind: "setComponent", entityId: me, component: SettlementComponents.holding, value: { seasonPending }, reason: "a season to live through" }];
    },
  });
  ctx.registerConstraintRule({
    id: `${SettlementCommands.settleSeason}.allowed`, commandType: SettlementCommands.settleSeason,
    evaluate: (c) => pendingSeason(c.world, c.command.actorId ?? "") ? { ok: true } : refuse(SettlementRejection.Busy, "没有正在过的一季。"),
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.settleSeason}.resolve`, commandType: SettlementCommands.settleSeason,
    resolve: (c): Effect[] => settleSeasonEffects(c.world, c.command.actorId as string),
  });
}

export function settleSeasonEffects(world: WorldView, me: string): Effect[] {
  const draft: SocialDraft = new Map();
  const pending = pendingSeason(world, me)!;
  const focus = SEASON_LIFE!.focuses.find((f) => f.id === pending.focus)!;
  const tick = world.tick, season = pending.season;
  const effects: Effect[] = [];
  const lines: string[] = [focus.line[season]];
  const alive = (id: string) => world.getEntity(id) && world.getEntity(id)!.archivedAt === undefined && world.getComponent(id, "modern.vitals")?.alive !== false;
  const villagers = RESIDENTS.map((r) => residentId(r.key)).filter(alive);
  const family = familyOf(world, me);
  const companions = focus.with === "*" ? villagers : focus.with === "family" ? family : focus.with.map(residentId).filter(alive);

  // 这一季家里有口粮、有火：回来时不饿；村里人也一样过来了。
  for (const e of world.listEntities()) {
    const has = Boolean(world.getComponent(e.id, SettlementComponents.holding));
    if (!has && !world.getComponent(e.id, SettlementComponents.resident)) continue;
    const patch = { hunger: 0, hungerAt: tick, ...(e.id === me ? { seasonPending: null, lastSeasonAt: tick } : {}) };
    effects.push(has ? { kind: "modifyComponent", entityId: e.id, component: SettlementComponents.holding, patch, reason: "a season of ordinary meals" }
      : { kind: "setComponent", entityId: e.id, component: SettlementComponents.holding, value: patch, reason: "a season of ordinary meals" });
  }

  // 交情：一起过了一季的人更亲；原本要好、这一季却少见的人，有点生分。
  const closer: string[] = [], missed: string[] = [];
  const holdingNow = world.getComponent(me, SettlementComponents.holding);
  const missedSaid = { ...((holdingNow?.missedSaid ?? {}) as Record<string, number>) };
  for (const id of villagers) {
    const memory = draftOf(draft, world, id);
    const bond = bondOf(memory, me);
    const together = companions.includes(id), kin = family.includes(id);
    const change = together ? { familiarity: focus.with === "*" ? 1 : 2, trust: focus.with === "*" ? 0.5 : 1 }
      : kin ? { familiarity: 0.5, trust: 0 }
      : bond.familiarity >= 4 ? { familiarity: -0.5, trust: 0 } : null;
    if (!change) continue;
    if (together && focus.with !== "*") closer.push(personName(world, id));
    if (change.familiarity < 0 && tick - Number(missedSaid[id] ?? -999) >= 360) { missed.push(personName(world, id)); missedSaid[id] = tick; }
    draft.set(id, withBond(memory, me, change, tick));
  }
  if (focus.with === "*") lines.push("村里人跟你都更熟了。");
  if (closer.length) lines.push(SEASON_LIFE!.closer.replace("{names}", closer.join("、")));
  if (missed.length) effects.push({ kind: "modifyComponent", entityId: me, component: SettlementComponents.holding, patch: { missedSaid: missedSaid as unknown as JsonValue }, reason: "said once a year" });
  if (missed.length) lines.push(SEASON_LIFE!.missed.replace("{names}", missed.slice(0, 3).join("、") + (missed.length > 3 ? "他们" : "")));

  // 手艺：跟着肯教你的人一整季，那门手艺也就摸熟了。
  const skills = skillsOf(world, me);
  for (const t of TEACHERS) {
    if (!companions.includes(t.residentId) || skills.includes(t.teaches.skill) || focus.with === "*" || isIll(tick, t.residentId)) continue;
    if (bondOf(socialOf(world, t.residentId), me).familiarity < 2) continue;
    skills.push(t.teaches.skill);
    lines.push(SEASON_LIFE!.learned.replace("{name}", t.name).replace("{skill}", t.teaches.name));
  }
  if (skills.length !== skillsOf(world, me).length)
    effects.push({ kind: "modifyComponent", entityId: me, component: SettlementComponents.holding, patch: { skills }, reason: "a season of practice" });

  // 收获：这一季攒下的东西（拿得下多少算多少）。
  let n = 0;
  const got: string[] = [], left: string[] = [];
  const keeper = companions.find((id) => id !== me && villagers.includes(id));
  for (const [resourceId, count] of focus.gains[season] ?? []) {
    const prototypeId = prototypeForResource(resourceId);
    for (let k = 0; k < count; k++) {
      // 手上拿不下的，先存在一起干活的人那儿（还是他的，回头可以去换、去讨）。
      const mine = canCarryPrototype(world, me, prototypeId, "", got.length + 1);
      if (!mine && !keeper) break;
      const holder = mine ? me : keeper!;
      const objectId = `settlement-locations:season:${tick}:${me}:${n}`;
      effects.push(
        { kind: "spawnEntity", localId: `season:${n}`, id: objectId, entityKind: ObjectKinds.item,
          components: { [ObjectComponents.object]: { prototypeId, name: "", condition: "fresh", quantity: 1, durability: 0, madeAt: tick,
            provenance: { from: "season", at: tick }, visibleFromOutside: true } as unknown as Record<string, never> }, announce: false },
        { kind: "addRelation", type: ObjectRelations.instanceOf, from: objectId, to: prototypeId, announce: false },
        { kind: "addRelation", type: ObjectRelations.ownedBy, from: objectId, to: holder, announce: false },
        { kind: "addRelation", type: ObjectRelations.heldBy, from: objectId, to: holder, announce: false });
      n += 1;
      (mine ? got : left).push(RESOURCE_LABELS[resourceId] ?? "东西");
    }
  }
  const tally = (xs: string[]) => [...new Set(xs)].map((g) => `${g}${xs.filter((x) => x === g).length > 1 ? `×${xs.filter((x) => x === g).length}` : ""}`).join("、");
  if (got.length) lines.push(`攒下了${tally(got)}，都在手边。`);
  if (left.length) lines.push(`手上拿不下，${tally(left)}留给了${personName(world, keeper!)}。`);
  const age = Number(world.getComponent(me, "modern.vitals")?.ageYears ?? 0);
  if (age > pending.age) lines.push(`不知不觉，你${age}岁了。`);

  const turn = seasonTurnDue(world) ? seasonTurnEffects(world, true, draft) : { effects: [], lines: [] };
  effects.push(...turn.effects);
  lines.push(...turn.lines);
  const fam = familyEffects(world, me, tick - pending.from, true, draft);
  effects.push(...fam.effects);
  lines.push(...fam.lines);
  effects.push(...flushDraft(draft, "a season of village life"));
  effects.push({ kind: "emitEvent", eventType: "settlement-locations.season_lived", actorId: me,
    data: { focus: focus.id, season, from: pending.from, days: tick - pending.from, lines, line: lines.join("") }, historicalSignificance: 0.05 });
  return effects;
}

/** 过完这一季：记下心思，一口气推到季末，再结算。返回这一季的叙述。 */
export function liveSeason(sim: { tick: number; dispatch: (c: never) => { ok: boolean; errors?: Array<{ message: string }> }; advanceBy: (n: number) => void; worldView: () => WorldView },
  actorId: string, focus: string): { ok: boolean; lines: string[]; days: number; error?: string } {
  const begun = sim.dispatch({ type: SettlementCommands.beginSeason, actorId, source: "player", payload: { focus } } as never);
  if (!begun.ok) return { ok: false, lines: [], days: 0, error: begun.errors?.[0]?.message };
  const days = daysLeftInSeason(sim.tick);
  // 剩下的日子不长，村里照常一天天过；长了，内核按「略过」一口气推过去。
  sim.advanceBy(days);
  const settled = sim.dispatch({ type: SettlementCommands.settleSeason, actorId, source: "player", payload: {} } as never);
  if (!settled.ok) return { ok: false, lines: [], days, error: settled.errors?.[0]?.message };
  return { ok: true, lines: [], days };
}

export function stageOf(age: number): string {
  let out = "";
  for (const [from, words] of FAMILY?.stages ?? []) if (age >= from) out = words;
  return out;
}

/** 家里的样子：配偶、孩子几岁在做什么、是不是要添丁了。 */
export function familyView(world: WorldView, me: string) {
  const spouse = spouseOf(world, me);
  return {
    spouse: spouse ? { id: spouse, name: personName(world, spouse) } : null,
    expecting: expectingAt(world, me) >= 0,
    children: childrenOf(world, me).map((id) => {
      const age = AGE_OF(world, id);
      return { id, name: personName(world, id), age, stage: stageOf(age), alive: world.getComponent(id, "modern.vitals")?.alive !== false };
    }),
  };
}

export function registerFamilyLife(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.familyTick}.allowed`, commandType: SettlementCommands.familyTick,
    evaluate: (c) => {
      const me = c.command.actorId ?? "";
      if (!me || me !== activeId(c.world)) return refuse(SettlementRejection.NotYours, "只看你自己家。");
      // 没有要发生的事就不记一笔。
      return familyEffects(c.world, me, 1).effects.length ? { ok: true } : refuse(SettlementRejection.Busy, "家里今天一切照常。");
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.familyTick}.resolve`, commandType: SettlementCommands.familyTick,
    resolve: (c): Effect[] => familyEffects(c.world, c.command.actorId as string, 1).effects,
  });
}
