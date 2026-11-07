/**
 * Courtship and marriage: hearts earned day by day, a betrothal, a village
 * wedding a few days later. Split out of module.ts; depends only on files
 * outside module.ts's import cycle (see tests/unit/import-cycles.test.ts).
 */
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { RIVER_TERRACE_PACK } from "./content.ts";
import { isIll } from "./happenings.ts";
import { heartsOf, keyOfResident, personOf } from "./people.ts";
import { refuse, type Registration } from "./rules.ts";
import { bondOf, withBond, withNews } from "./social.ts";
import { SettlementCommands, SettlementComponents, SettlementRejection, residentId } from "./vocabulary.ts";
import { RESIDENTS, activeId, personName, saveSocial, socialOf } from "./world-reads.ts";

// ---------------------------------------------------------------------------
// 结亲：交情一点点处出来，满 8 颗心才开得了口；对方点了头先定亲，过几天成亲。
// ---------------------------------------------------------------------------
export const COURT_HEARTS = 8;
export const WED_AFTER_DAYS = 3;
const ageOfEntity = (world: WorldView, id: string) => Number(world.getComponent(id, "modern.vitals")?.ageYears ?? 0);
export function spouseOf(world: WorldView, id: string): string {
  return world.listRelations({ type: "family.married_to", from: id })[0]?.to ?? "";
}
export function engagedTo(world: WorldView, me: string): string {
  const raw = world.getComponent(me, SettlementComponents.holding)?.engaged;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? String((raw as Record<string, JsonValue>).to ?? "") : "";
}
function engagedAt(world: WorldView, me: string): number {
  const raw = world.getComponent(me, SettlementComponents.holding)?.engaged;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? Number((raw as Record<string, JsonValue>).at ?? -99) : -99;
}
/** 你和这个人：成了亲、定了亲、对方已有家室、或者都没有。 */
export function romanceOf(world: WorldView, me: string, id: string): "married" | "engaged" | "taken" | "" {
  if (spouseOf(world, me) === id) return "married";
  if (engagedTo(world, me) === id) return "engaged";
  if (spouseOf(world, id) || PEOPLE_TIES_SPOUSE.has(keyOfResident(id))) return "taken";
  return "";
}
/** 写在人物里的老伴（陶叔陶婶）本来就是一家，不另算。 */
export const PEOPLE_TIES_SPOUSE = new Set(Object.entries(RIVER_TERRACE_PACK.people ?? {})
  .filter(([, p]) => Object.values(p.ties ?? {}).some((t) => t.relation === "老伴")).map(([k]) => k));

export function courtRefusal(world: WorldView, me: string, id: string): string {
  const name = personName(world, id);
  if (ageOfEntity(world, me) < 18) return "你还没满十八，这话说早了";
  if (ageOfEntity(world, id) < 18) return `${name}还没成年`;
  if (spouseOf(world, me)) return "你已经成了家";
  if (isIll(world.tick, id)) return `${name}病着，不是说这话的时候`;
  const hearts = heartsOf(bondOf(socialOf(world, id), me));
  if (hearts < COURT_HEARTS) return `交情还不够（${hearts}/${COURT_HEARTS} 颗心）`;
  const holding = world.getComponent(me, SettlementComponents.holding);
  const last = (holding?.courtAt && typeof holding.courtAt === "object" ? holding.courtAt as Record<string, number> : {})[id];
  if (last !== undefined && world.tick - last < 7) return `刚跟${name}说过，给对方一点时间`;
  return "";
}
export function wedRefusal(world: WorldView, me: string, id: string): string {
  const left = WED_AFTER_DAYS - (world.tick - engagedAt(world, me));
  if (left > 0) return `才定亲，再过 ${left} 天成亲`;
  if (isIll(world.tick, id) || isIll(world.tick, me)) return "等身子好了再办";
  return "";
}

export function registerMarriage(ctx: Registration): void {
  const present = (c: { world: WorldView; command: { actorId?: string; payload: Record<string, unknown> } }) => {
    const me = c.command.actorId ?? "", id = String(c.command.payload.targetId ?? "");
    if (!me || me !== activeId(c.world)) return { me, id, why: "只有你自己能说这话。" };
    if (!c.world.getComponent(id, SettlementComponents.resident) || !personOf(id)?.court) return { me, id, why: "要对一个具体的人说。" };
    if (occupiedPlaceId(c.world, me) !== occupiedPlaceId(c.world, id)) return { me, id, why: "这种话要当面说。" };
    return { me, id, why: "" };
  };
  ctx.registerConstraintRule({
    id: `${SettlementCommands.court}.allowed`, commandType: SettlementCommands.court,
    evaluate: (c) => {
      const { me, id, why } = present(c);
      if (why) return refuse(SettlementRejection.NotYours, why);
      if (romanceOf(c.world, me, id)) return refuse(SettlementRejection.Already, romanceOf(c.world, me, id) === "taken" ? `${personName(c.world, id)}已经有家了。` : "你们已经说定了。");
      if (engagedTo(c.world, me)) return refuse(SettlementRejection.Already, "你已经跟别人定了亲。");
      const no = courtRefusal(c.world, me, id);
      return no ? refuse(SettlementRejection.Busy, `${no}。`) : { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.court}.resolve`, commandType: SettlementCommands.court,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string, id = String(c.command.payload.targetId), tick = c.world.tick;
      const bond = bondOf(socialOf(c.world, id), me);
      const court = personOf(id)!.court!;
      // 交情够了还得信得过、心里没疙瘩，对方才点头。
      const yes = bond.trust >= 7 && bond.grudge < 1;
      const holding = c.world.getComponent(me, SettlementComponents.holding);
      const courtAt = { ...((holding?.courtAt ?? {}) as Record<string, JsonValue>), [id]: tick };
      let memory = withBond(socialOf(c.world, id), me, yes ? { familiarity: 1, trust: 1 } : { trust: 0.5 }, tick);
      if (yes) memory = withNews(memory, `engaged:${me}:${id}`, { about: me, text: `${personName(c.world, me)}和${personName(c.world, id)}定了亲`, at: tick });
      return [
        { kind: "modifyComponent", entityId: me, component: SettlementComponents.holding,
          patch: { courtAt, ...(yes ? { engaged: { to: id, at: tick } } : {}) }, reason: yes ? "betrothed" : "asked, not yet" },
        saveSocial(id, memory, "heard your heart"),
        { kind: "emitEvent", eventType: "settlement-locations.courted", actorId: me, targetId: id,
          data: { accepted: yes, line: court.accept && yes ? court.accept : court.notYet }, historicalSignificance: yes ? 0.2 : 0.03 },
      ];
    },
  });
  ctx.registerConstraintRule({
    id: `${SettlementCommands.wed}.allowed`, commandType: SettlementCommands.wed,
    evaluate: (c) => {
      const { me, id, why } = present(c);
      if (why) return refuse(SettlementRejection.NotYours, why);
      if (engagedTo(c.world, me) !== id) return refuse(SettlementRejection.Busy, "你们还没定亲。");
      const no = wedRefusal(c.world, me, id);
      return no ? refuse(SettlementRejection.Busy, `${no}。`) : { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.wed}.resolve`, commandType: SettlementCommands.wed,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string, id = String(c.command.payload.targetId), tick = c.world.tick;
      const mine = personName(c.world, me), theirs = personName(c.world, id);
      const effects: Effect[] = [
        { kind: "addRelation", type: "family.married_to", from: me, to: id, components: { "family.marriage": { since: tick, trust: 0.8 } }, announce: false },
        { kind: "addRelation", type: "family.married_to", from: id, to: me, components: { "family.marriage": { since: tick, trust: 0.8 } }, announce: false },
        { kind: "modifyComponent", entityId: me, component: SettlementComponents.holding, patch: { engaged: null, marriedAt: tick }, reason: "wed" },
      ];
      // 全村都来道喜：人人都记得这一天。
      for (const r of RESIDENTS) {
        const rid = residentId(r.key);
        if (rid === me) continue;
        let memory = withBond(socialOf(c.world, rid), me, rid === id ? { familiarity: 1, trust: 1 } : { familiarity: 0.5 }, tick);
        memory = withNews(memory, `wed:${me}:${id}`, { about: me, text: `${mine}和${theirs}成了亲`, at: tick });
        effects.push(saveSocial(rid, memory, "a wedding in the village"));
      }
      effects.push({ kind: "emitEvent", eventType: "family.married", actorId: me, targetId: id,
        data: { since: tick, line: `这天全村人都来了。陶婶张罗了一锅热粟饭，埴公说了几句吉利话，孩子们围着你们跑。从今往后，你和${theirs}就是一家人了。` },
        historicalSignificance: 0.55 });
      return effects;
    },
  });
}
