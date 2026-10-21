/**
 * 人走了：一个人去世时全村怎么记住他、家里人怎么难过；玩家去世时由长大的
 * 孩子接过这一生（继承人）。
 *
 * 从 module.ts 原样搬出。本文件不得 import module.ts 或 autonomy/*。
 */
import type { Effect, WorldView } from "@openlife/contracts";
import { activeId, personName, saveSocial, socialOf } from "./world-reads.ts";
import { AGE_OF, childrenOf, skillsOf } from "./village-reads.ts";
import { refuse, type Registration } from "./rules.ts";
import { SettlementCommands, SettlementComponents, SettlementId, SettlementRejection } from "./vocabulary.ts";
import { bondOf, withNews } from "./social.ts";
import { spouseOf } from "./marriage.ts";
import { heartsOf } from "./people.ts";
import { world_kin } from "./storyteller.ts";

// ---------------------------------------------------------------------------
// 人走了：全村都知道，家里人难过一阵；你走了，长大的孩子接过这一生。
// ---------------------------------------------------------------------------
export const HEIR_AGE = 16;

export const ALIVE = (world: WorldView, id: string) => world.getEntity(id) !== undefined && world.getEntity(id)!.archivedAt === undefined && world.getComponent(id, "modern.vitals")?.alive !== false;

/** 能接过这一生的孩子：在世、满十六。 */
export function heirsOf(world: WorldView, me: string): Array<{ id: string; name: string; age: number }> {
  return world.listRelations({ type: "family.parent_of", from: me }).map((r) => r.to).filter((id) => ALIVE(world, id))
    .map((id) => ({ id, name: personName(world, id), age: AGE_OF(world, id) })).filter((h) => h.age >= HEIR_AGE);
}

export function registerPassing(ctx: Registration): void {
  ctx.registerReactionRule({
    id: "settlement-locations.passing.remembered", eventType: "modern.character_died",
    react: (c): Effect[] => {
      const dead = c.event.actorId ?? "";
      const player = activeId(c.world);
      if (!dead || !c.world.getComponent(SettlementId, SettlementComponents.settlement)) return [];
      const isVillager = Boolean(c.world.getComponent(dead, SettlementComponents.resident));
      if (!isVillager && dead !== player) return [];
      const name = personName(c.world, dead), age = AGE_OF(c.world, dead), tick = c.world.tick;
      const effects: Effect[] = [];
      const kin = new Set([...world_kin(c.world, dead)]);
      for (const r of c.world.listEntities({ kind: "modern.character" })) {
        if (r.id === dead || r.archivedAt !== undefined || !c.world.getComponent(r.id, SettlementComponents.resident)) continue;
        effects.push(saveSocial(r.id, withNews(socialOf(c.world, r.id), `died:${dead}`, { about: dead, text: `${name}走了，${age}岁`, at: tick }), "news of a death"));
        if (kin.has(r.id)) effects.push({ kind: "modifyComponent", entityId: r.id, component: SettlementComponents.resident, patch: { mournAt: tick }, reason: "mourning" });
      }
      if (dead !== player && player) {
        const close = spouseOf(c.world, player) === dead ? "你的另一半" : childrenOf(c.world, player).includes(dead) ? "你的孩子" : "";
        const hearts = heartsOf(bondOf(socialOf(c.world, dead), player));
        const line = close
          ? `${close}${name}走了，才${age}岁。家里一下子空了许多。`
          : `${name}走了，${age}岁。${hearts >= 5 ? "你想起和${name}一起的那些日子，心里空落落的。".replace("${name}", name) : "全村人送了最后一程。"}`;
        effects.push({ kind: "emitEvent", eventType: "settlement-locations.passed_away", actorId: dead, targetId: player, data: { line, age }, historicalSignificance: 0.3 });
      }
      return effects;
    },
  });
  ctx.registerConstraintRule({
    id: `${SettlementCommands.handoff}.allowed`, commandType: SettlementCommands.handoff,
    evaluate: (c) => {
      const me = c.command.actorId ?? "", to = String(c.command.payload.targetId ?? "");
      if (!me || me !== activeId(c.world)) return refuse(SettlementRejection.NotYours, "只能交给你自己的孩子。");
      if (ALIVE(c.world, me)) return refuse(SettlementRejection.Busy, "这一生还没有走完。");
      if (!heirsOf(c.world, me).some((h) => h.id === to)) return refuse(SettlementRejection.NoSuchResident, `要在世、满${HEIR_AGE}岁的孩子才能接过来。`);
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.handoff}.resolve`, commandType: SettlementCommands.handoff,
    resolve: (c): Effect[] => {
      const me = c.command.actorId as string, child = String(c.command.payload.targetId), tick = c.world.tick;
      const parent = personName(c.world, me), name = personName(c.world, child), age = AGE_OF(c.world, child);
      const parentHolding = c.world.getComponent(me, SettlementComponents.holding);
      const childHolding = c.world.getComponent(child, SettlementComponents.holding) ?? {};
      // 家传：手艺、出身（村里人当你是这家的孩子），家里人记着的情分照旧。
      const skills = [...new Set([...(Array.isArray(childHolding.skills) ? childHolding.skills.map(String) : []), ...skillsOf(c.world, me)])];
      const effects: Effect[] = [
        { kind: "modifyComponent", entityId: "modern:world", component: "modern.world_state",
          patch: { activeCharacterId: child, generation: Number(c.world.getComponent(child, "modern.identity")?.generation ?? 2) }, reason: "the next generation" },
        { kind: "setComponent", entityId: child, component: SettlementComponents.holding,
          value: { ...childHolding, hunger: 0, hungerAt: tick, skills, inheritedFrom: me,
            origin: (parentHolding?.origin ?? { id: "none", talents: [], chosenAt: -1 }) } as unknown as Record<string, never>, reason: "a life handed down" },
      ];
      effects.push({ kind: "emitEvent", eventType: "modern.generation_switched", actorId: child,
        data: { previousCharacterId: me, line: `${parent}走了。你是${name}，${age}岁，从今天起，这个家由你撑起来。${skills.length ? "家里传下来的手艺，你也都会。" : ""}` }, historicalSignificance: 0.6 });
      return effects;
    },
  });
}
