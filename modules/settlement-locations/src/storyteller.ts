/**
 * 讲故事的人：长跳时间里「一季过去」时，村里人统一结算这一季的生老病死、
 * 婚嫁和新闻（seasonTurnEffects），以及对应的 seasonTurn 命令。
 *
 * 从 module.ts 原样搬出。本文件不得 import module.ts 或 autonomy/*。
 */
import type { Effect, WorldView } from "@openlife/contracts";
import { activeId, personName, RESIDENTS } from "./world-reads.ts";
import { residentId, SettlementCommands, SettlementComponents, SettlementId, SettlementRejection } from "./vocabulary.ts";
import { keyOfResident, personOf, tieWarmth } from "./people.ts";
import { AGE_OF, draftOf, FAMILY, fill, flushDraft, pickIndex, readResident, seasonKey, seasonOf, seasonTurnDue, type SocialDraft, STORY, yieldPoints } from "./village-reads.ts";
import { bondOf, withBond, withNews } from "./social.ts";
import { engagedTo, PEOPLE_TIES_SPOUSE, spouseOf } from "./marriage.ts";
import { SpaceComponents, SpaceRelations } from "@openlife/module-world-space";
import { DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";
import { refuse, type Registration } from "./rules.ts";

export function world_kin(world: WorldView, id: string): string[] {
  const out = new Set<string>();
  for (const r of world.listRelations({ type: "family.married_to", from: id })) out.add(r.to);
  for (const r of world.listRelations({ type: "family.parent_of", from: id })) out.add(r.to);
  for (const r of world.listRelations({ type: "family.parent_of", to: id })) out.add(r.from);
  const home = RESIDENTS.find((r) => residentId(r.key) === id)?.homeSpace;
  if (home) for (const r of RESIDENTS) if (r.homeSpace === home) out.add(residentId(r.key));
  return [...out];
}

export function sexOf(world: WorldView, id: string): string {
  const sex = String(world.getComponent(id, "modern.identity")?.sex ?? "other");
  return sex !== "other" ? sex : personOf(id)?.sex ?? "other";
}

export const villagersAlive = (world: WorldView) => world.listEntities({ kind: "modern.character" })
  .filter((e) => e.archivedAt === undefined && e.components["modern.vitals"]?.alive !== false && Boolean(e.components[SettlementComponents.resident]))
  .map((e) => e.id);

export function seasonTurnEffects(world: WorldView, inSeason = false, shared?: SocialDraft): { effects: Effect[]; lines: string[] } {
  const draft: SocialDraft = shared ?? new Map();
  const tick = world.tick, key = seasonKey(tick), season = seasonOf(tick);
  const effects: Effect[] = [{ kind: "modifyComponent", entityId: SettlementId, component: SettlementComponents.settlement, patch: { lastSeasonTurn: key }, reason: "a new season" }];
  const lines: string[] = [];
  // 刚落脚的那一季不算「换季」：只记下来，不讲事。
  if (!STORY || !world.getComponent(SettlementId, SettlementComponents.settlement)?.lastSeasonTurn) return { effects, lines };
  const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
  const living = villagersAlive(world);
  const player = activeId(world);
  const news = (text: string, id: string) => {
    for (const rid of living) draft.set(rid, withNews(draftOf(draft, world, rid), id, { about: rid, text, at: tick }));
  };
  const tell = (line: string) => {
    lines.push(line);
    if (!inSeason && player) effects.push({ kind: "emitEvent", eventType: "settlement-locations.village_story", targetId: player, data: { line }, historicalSignificance: 0.05 });
  };

  // 1. 年景：不是每季都有事。
  const pool = STORY.events.filter((e) => e.seasons.includes(season));
  if (pool.length && pickIndex(`story:${key}`, 100) < Math.round(STORY.chance * 100)) {
    const ev = pool[pickIndex(`story:${key}:which`, pool.length)]!;
    for (const [where, factor] of Object.entries(ev.yields ?? {})) {
      const [, placeId, resourceId] = where.match(/^(place:[^:]+):(.+)$/) ?? [];
      const point = yieldPoints(world).find((y) => y.placeId === placeId && y.resourceId === resourceId);
      if (!point) continue;
      effects.push({ kind: "setComponent", entityId: `yield:${placeId}:${resourceId}`, component: SettlementComponents.yieldPoint,
        value: { placeId, resourceId, label: point.label, unit: point.unit, capacity: point.capacity,
          stock: Math.min(point.capacity, Math.round(point.stock * factor)), renewDays: point.renewDays, lastRenewedAt: tick } as unknown as Record<string, never>,
        reason: `season story: ${ev.id}` });
    }
    news(ev.text, `story:${key}`);
    tell(ev.text);
  }

  // 1b. 一季下来，一起干活的、本来要好的村民彼此更熟一些（一天天过时，碰面本身就会让人更熟）。
  if (inSeason) for (const a of living) for (const b of living) {
    if (a === b || b === player) continue;
    const ra = readResident(world, a), rb = readResident(world, b);
    const near = (ra?.workPlace && ra.workPlace === rb?.workPlace) || tieWarmth(a, b) > 0 || ra?.homeSpace === rb?.homeSpace;
    if (near) draft.set(a, withBond(draftOf(draft, world, a), b, { familiarity: 0.5 }, tick));
  }

  // 2. 结亲：两个都没成家的大人，彼此都熟、都有好感，就有可能。一季最多一对。
  const age = (id: string) => AGE_OF(world, id);
  const single = living.filter((id) => !spouseOf(world, id) && !PEOPLE_TIES_SPOUSE.has(keyOfResident(id)) && age(id) >= 18 && age(id) <= 45 && id !== player
    && engagedTo(world, player) !== id);
  const kinOfId = (id: string) => new Set(world_kin(world, id));
  let wed = false;
  for (let i = 0; i < single.length && !wed; i++) for (let j = i + 1; j < single.length && !wed; j++) {
    const a = single[i]!, b = single[j]!;
    if (kinOfId(a).has(b) || Math.abs(age(a) - age(b)) > 16) continue;
    const ab = bondOf(draftOf(draft, world, a), b), ba = bondOf(draftOf(draft, world, b), a);
    const warmth = ab.familiarity + ba.familiarity + (tieWarmth(a, b) + tieWarmth(b, a)) * 2;
    if (warmth < 8 || ab.grudge + ba.grudge > 1) continue;
    if (pickIndex(`wed:${key}:${a}:${b}`, 100) >= 35) continue;
    wed = true;
    effects.push(
      { kind: "addRelation", type: "family.married_to", from: a, to: b, components: { "family.marriage": { since: tick, trust: 0.8 } }, announce: false },
      { kind: "addRelation", type: "family.married_to", from: b, to: a, components: { "family.marriage": { since: tick, trust: 0.8 } }, announce: false });
    const text = fill(STORY.couple, { a: personName(world, a), b: personName(world, b) });
    news(text, `wed:${a}:${b}`);
    tell(text);
  }

  // 3. 添丁：村里成了亲的人家（不算你家，你家自己算）。一季最多一个。
  const couples = living.filter((id) => spouseOf(world, id) && id < spouseOf(world, id) && spouseOf(world, id) !== player && id !== player);
  for (const a of couples) {
    const b = spouseOf(world, a);
    if (!living.includes(b) || age(a) > 45 || age(b) > 45) continue;
    if (new Set([sexOf(world, a), sexOf(world, b)]).size !== 2) continue;
    const kids = world.listRelations({ type: "family.parent_of", from: a }).length;
    const last = Number(world.getComponent(a, SettlementComponents.resident)?.lastBornAt ?? -9999);
    if (kids >= 3 || tick - last < 720 || pickIndex(`npcborn:${key}:${a}`, 100) >= 22) continue;
    const used = new Set(world.listEntities({ kind: "modern.character" }).map((e) => String(e.components["modern.identity"]?.givenName ?? "")));
    const names = (FAMILY?.names ?? []).filter((x) => !used.has(x));
    const name = names.length ? names[pickIndex(`npcname:${key}:${a}`, names.length)]! : `${personName(world, a).slice(-1)}娃`;
    const id = `settlement-locations:child:${tick}:${a}`;
    const home = readResident(world, a);
    effects.push(
      { kind: "spawnEntity", localId: `npc-child:${a}`, id, entityKind: "modern.character", components: {
        "modern.identity": { givenName: name, familyName: "", sex: pickIndex(`${id}:sex`, 2) ? "male" : "female", generation: 1, lineageId: `npc:${home?.household ?? ""}`, bornAt: tick },
        "modern.vitals": { alive: true, health: 1, ageYears: 0, lifespan: 78 },
        "modern.residence": { cityId: "modern:city:north" }, "modern.wealth": { cash: 0, debt: 0 } }, announce: false },
      { kind: "addRelation", type: "family.parent_of", from: a, to: id, components: { "family.parent": { since: tick } }, announce: false },
      { kind: "addRelation", type: "family.parent_of", from: b, to: id, components: { "family.parent": { since: tick } }, announce: false },
      { kind: "modifyComponent", entityId: a, component: SettlementComponents.resident, patch: { lastBornAt: tick }, reason: "a child born" });
    const text = fill(STORY.npcBirth, { parent: `${personName(world, a)}和${personName(world, b)}`, name });
    news(text, `born:${id}`);
    tell(text);
    break;
  }

  // 4. 村里的孩子长到六岁，就是村里的一个人了。
  for (const e of world.listEntities({ kind: "modern.character" })) {
    if (e.archivedAt !== undefined || e.components[SettlementComponents.resident] || e.id === player) continue;
    const parents = world.listRelations({ type: "family.parent_of", to: e.id }).map((r) => r.from);
    if (!parents.length || parents.includes(player) || AGE_OF(world, e.id) < 6) continue;
    const home = parents.map((p) => readResident(world, p)).find(Boolean);
    if (!home) continue;
    effects.push(
      { kind: "setComponent", entityId: e.id, component: SettlementComponents.resident, value: { household: home.household, role: "孩子", trait: "", wish: "",
        workPlace: home.workPlace, homeSpace: home.homeSpace, hunger: 0, rested: 1, standingRoutine: "" } as unknown as Record<string, never>, reason: "old enough to help" },
      { kind: "setComponent", entityId: e.id, component: SettlementComponents.holding, value: { hunger: 0, hungerAt: tick }, reason: "a child's own day" },
      { kind: "addRelation", type: SpaceRelations.occupancy, from: e.id, to: home.workPlace || "place:yard",
        components: { [SpaceComponents.occupancy]: { placeId: home.workPlace || "place:yard", spaceId: "", since: tick } }, announce: false });
  }

  // 5. 人少了：渡口来一个外乡人，住进空出来的屋子。
  if (living.length < RESIDENTS.length - 2 && pickIndex(`newcomer:${key}`, 100) < 40) {
    const used = new Set(world.listEntities({ kind: "modern.character" }).map((e) => String(e.components["modern.identity"]?.givenName ?? "")));
    const names = STORY.newcomerNames.filter((x) => !used.has(x));
    if (names.length) {
      const name = names[pickIndex(`newcomer:${key}:name`, names.length)]!;
      const occupied = new Set(living.map((id) => readResident(world, id)?.homeSpace));
      const empty = RESIDENTS.find((r) => !occupied.has(r.homeSpace));
      const homeSpace = empty?.homeSpace ?? "space:ford-sleep";
      const workPlace = empty?.workPlace ?? "place:ford";
      const id = `settlement-locations:newcomer:${tick}`;
      const ageYears = 20 + pickIndex(`${id}:age`, 16);
      effects.push(
        { kind: "spawnEntity", localId: "newcomer", id, entityKind: "modern.character", components: {
          "modern.identity": { givenName: name, familyName: "", sex: pickIndex(`${id}:sex`, 2) ? "male" : "female", generation: 0, lineageId: `npc:${name}`, bornAt: tick - ageYears * DAY_TICKS_PER_YEAR },
          "modern.vitals": { alive: true, health: 1, ageYears, lifespan: 78 },
          "modern.residence": { cityId: "modern:city:north" }, "modern.wealth": { cash: 0, debt: 0 },
          [SettlementComponents.resident]: { household: `${name}家`, role: "新来的外乡人", trait: "", wish: "", workPlace, homeSpace, hunger: 0, rested: 1, standingRoutine: "" } as unknown as Record<string, never>,
          [SettlementComponents.holding]: { hunger: 0, hungerAt: tick } as unknown as Record<string, never> }, announce: false },
        { kind: "addRelation", type: SpaceRelations.occupancy, from: id, to: "place:ford",
          components: { [SpaceComponents.occupancy]: { placeId: "place:ford", spaceId: "", since: tick } }, announce: false });
      const text = fill(STORY.newcomer, { name, from: STORY.newcomerFrom[pickIndex(`${id}:from`, STORY.newcomerFrom.length)]!,
        home: String(world.getComponent(homeSpace, SpaceComponents.space)?.name ?? "一间空屋") });
      news(text, `newcomer:${id}`);
      tell(text);
    }
  }
  if (!shared) effects.push(...flushDraft(draft, "village news"));
  return { effects, lines };
}

export function registerStoryteller(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.seasonTurn}.allowed`, commandType: SettlementCommands.seasonTurn,
    evaluate: (c) => seasonTurnDue(c.world) ? { ok: true } : refuse(SettlementRejection.Busy, "这一季的事已经过去了。"),
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.seasonTurn}.resolve`, commandType: SettlementCommands.seasonTurn,
    resolve: (c): Effect[] => seasonTurnEffects(c.world).effects,
  });
}
