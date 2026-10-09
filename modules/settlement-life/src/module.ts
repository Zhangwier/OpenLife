import type { ComponentData, Effect, OpenLifeModule, WorldView, ConstraintOutcome } from "@openlife/contracts";
import { PracticeComponents, PracticeRelations } from "@openlife/module-practice-runtime";
import { PotteryComponents, PotteryRelations, PotteryPracticeDefinitions } from "@openlife/module-craft-pottery";
import { DAY_TICKS_PER_YEAR, TICKS_PER_YEAR } from "@openlife/life-contracts";

const OWNER = "settlement-life";
export const Life = {
  state: "settlement-life.state",
  person: "settlement-life.person",
  disposition: "settlement-life.disposition",
} as const;
const WORLD = "modern:world";
const IDENTITY = "modern.identity";
const STATE = "modern.world_state";

/**
 * Kernel ticks in one year for this world (M1.2-B).
 *
 * The clock component is the marker that the world declared the day scale.
 * Without it the world keeps the legacy month reading, so a save written
 * before TIME-RFC-001 still ages at twelve ticks per year.
 */
function yearTicks(world: WorldView): number {
  return world.getComponent(WORLD, "world-clock.clock") ? DAY_TICKS_PER_YEAR : TICKS_PER_YEAR;
}
export const qualityLabel = (value: unknown) => ({ fine: "精良", serviceable: "实用", crude: "粗朴", failed: "有缺陷的" }[String(value)] ?? "普通");
export const defectLabel = (value: unknown) => ({ "drying-cracks": "干燥裂纹", deformation: "器形变形", "thermal-shock": "受热暗裂", "steam-cracking": "水汽开裂", warping: "翘曲", "under-fired": "烧制不足", inclusions: "杂质残留" }[String(value)] ?? String(value));

const RESIDENTS = [
  { key: "mentor", name: "陶叔", age: 48, role: "窑边的师傅", trait: "慢工与耐心", wish: "想把筛泥和看火的经验传给愿意学的人。" },
  { key: "yu", name: "阿予", age: 17, role: "照料田地的邻居", trait: "务实，也记得别人的帮助", wish: "新屋缺一个耐用的储水陶罐，最近也缺柴火。" },
  { key: "lan", name: "阿岚", age: 18, role: "往返两岸的交换者", trait: "好奇，愿意尝试新东西", wish: "想带一件轻巧的陶器去南岸，让更多人认识你的手艺。" },
] as const;

/**
 * A person's age in world years.
 *
 * Reads the world's declared scale rather than assuming twelve ticks, so an
 * adult is an adult at the day scale too.
 */
export function lifeAge(world: WorldView, id: string): number {
  const entity = world.getEntity(id);
  const bornAt = Number(entity?.components[IDENTITY]?.bornAt ?? world.tick);
  return Math.max(0, Math.floor((world.tick - bornAt) / yearTicks(world)));
}
export function currentPractice(world: WorldView, actorId: string) {
  return world.listRelations({ type: PracticeRelations.participatesIn, from: actorId })
    .map(r => world.getEntity(r.to))
    .find(e => e && ["active", "blocked", "paused"].includes(String(e.components[PracticeComponents.practice]?.status)));
}
function living(world: WorldView, id: string | undefined) {
  const e = id ? world.getEntity(id) : undefined;
  return Boolean(e && e.kind === "modern.character" && e.archivedAt === undefined && e.components["modern.vitals"]?.alive !== false);
}
function state(world: WorldView, id: string) { return world.getComponent(id, Life.state) ?? {}; }
function patch(id: string, component: string, value: ComponentData): Effect {
  return { kind: "modifyComponent", entityId: id, component, patch: value, reason: "settlement life choice" };
}
function trusts(s: Readonly<Record<string, unknown>>): Record<string, number> {
  return { ...(s.trust as Record<string, number> ?? {}) };
}
function fail(message: string): ConstraintOutcome { return { ok: false, code: "E_SETTLEMENT_CHOICE", message }; }
function available(world: WorldView, id: string | undefined, allowDead = false): ConstraintOutcome {
  if (!id || !world.hasEntity(id)) return fail("没有正在经历人生的人。");
  if (!allowDead && !living(world, id)) return fail("这一生已结束，请选择家族接班人或开始新人生。");
  if (String(world.getComponent(WORLD, STATE)?.activeCharacterId) !== id) return fail("只能为当前人物做生活选择。");
  if (!world.getComponent(id, Life.state)) return fail("先进入聚落手艺生活。");
  if (Number(state(world, id).busyUntil ?? 0) > world.tick) return fail("上一段生活尚未结束，请先让时间推进。");
  return { ok: true };
}
function nearby(world: WorldView, actorId: string, targetId: string) {
  return targetId !== actorId && living(world, targetId)
    && Boolean(world.getComponent(targetId, Life.person))
    && world.getComponent(targetId, "modern.residence")?.cityId === world.getComponent(actorId, "modern.residence")?.cityId;
}
function parentIds(world: WorldView, id: string) { return world.listRelations({ type: "family.parent_of", to: id }).map(r => r.from); }
function closeKin(world: WorldView, a: string, b: string): boolean {
  const pa = parentIds(world, a), pb = parentIds(world, b);
  return pa.includes(b) || pb.includes(a) || pa.some(id => pb.includes(id));
}
function canMarry(world: WorldView, a: string, b: string): ConstraintOutcome {
  if (!nearby(world, a, b) || closeKin(world, a, b)) return fail("需要选择聚落里可以建立伴侣关系的人。");
  if (lifeAge(world, a) < 18 || lifeAge(world, b) < 18) return fail("双方都成年后，才能决定共同生活。");
  if (Number(trusts(state(world, a))[b] ?? 0) < 3) return fail("先相处或帮助对方，让关系达到相互信任。");
  if (world.listRelations({ type: "family.married_to", from: a }).length || world.listRelations({ type: "family.married_to", from: b }).length) return fail("其中一人已有伴侣。");
  return { ok: true };
}
function defaultLife(extra: ComponentData = {}): ComponentData {
  return { lessons: 0, skill: 0, completed: 0, trust: {}, familyWorks: [], busyUntil: 0, expectingAt: 0, lastChildAt: -1000, outcome: "你站在窑场门口。先向师傅学一段手艺，或认识聚落里的人。", ...extra };
}

export const settlementLifeModule: OpenLifeModule = {
  manifest: {
    id: OWNER, version: "0.1.0", engineRange: "^0.1.0", type: "content-pack",
    name: "Settlement Life", requires: ["life.population", "family.relationship_provider", "practice.runtime", "craft.pottery-practice"],
    provides: ["life.settlement-playable"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "rule.reaction.register", "schedule.register", "projection.register"],
  },
  register(ctx) {
    for (const id of Object.values(Life)) ctx.registerComponent({ id, persist: true });
    for (const type of ["settlement-life.enter", "settlement-life.choose", "settlement-life.dispose", "settlement-life.handoff", "settlement-life.cancel_birth"]) ctx.registerCommand({ type });

    ctx.registerConstraintRule({ id: "settlement-life.enter.allowed", commandType: "settlement-life.enter", evaluate: c => {
      if (!living(c.world, c.command.actorId)) return fail("只有仍在生活的人能进入手艺生活。");
      if (state(c.world, c.command.actorId!).outcome !== undefined) return fail("已经进入手艺生活。");
      return String(c.world.getComponent(WORLD, STATE)?.activeCharacterId) === c.command.actorId ? { ok: true } : fail("需要当前人物。");
    }});
    ctx.registerResolutionRule({ id: "settlement-life.enter.resolve", commandType: "settlement-life.enter", resolve: c => {
      const id = c.command.actorId!;
      const city = String(c.world.getComponent(id, "modern.residence")?.cityId ?? "modern:city:north");
      const trust: Record<string, number> = {};
      const effects: Effect[] = [];
      for (const p of RESIDENTS) {
        const personId = `${OWNER}:${city}:${p.key}`;
        trust[personId] = p.key === "mentor" ? 1 : 0;
        if (c.world.hasEntity(personId)) continue;
        effects.push({ kind: "spawnEntity", localId: p.key, id: personId, entityKind: "modern.character", announce: false, components: {
          [IDENTITY]: { givenName: p.name, familyName: "", bornAt: c.world.tick - p.age * yearTicks(c.world), lineageId: `npc:${personId}`, generation: 0 },
          "modern.vitals": { alive: true, health: 1, ageYears: p.age, lifespan: 90 },
          "modern.residence": { cityId: city },
          "modern.wealth": { cash: 0, debt: 0 },
          [Life.person]: { role: p.role, trait: p.trait, wish: p.wish },
        }}, { kind: "emitEvent", eventType: "modern.character_created", actorId: personId, data: { givenName: p.name, generation: 0, lineageId: `npc:${personId}` }, historicalSignificance: 0 });
      }
      effects.push({ kind: "setComponent", entityId: id, component: Life.state, value: defaultLife({ trust }) },
        patch(id, PotteryComponents.inventory, { clay: 1, fuel: 4 }),
        { kind: "emitEvent", eventType: "settlement-life.entered", actorId: id, data: { summary: "开始在聚落里学习手艺与生活" }, historicalSignificance: 0.3 });
      return effects;
    }});

    ctx.registerConstraintRule({ id: "settlement-life.choose.allowed", commandType: "settlement-life.choose", evaluate: c => {
      const a = available(c.world, c.command.actorId); if (!a.ok) return a;
      const id = c.command.actorId!, choice = String(c.command.payload.choice ?? "");
      if (currentPractice(c.world, id)) return fail("先完成手中的陶器，再安排其他生活。");
      if (choice === "study" && lifeAge(c.world, id) < 14) return fail("十四岁以后才能开始窑场的手艺学习。");
      if (["study", "gather-clay", "gather-fuel", "rest"].includes(choice)) return { ok: true };
      if (["visit", "help"].includes(choice)) {
        if (!nearby(c.world, id, c.command.targetId ?? "")) return fail("对方现在不在你能交往的聚落里。");
        if (choice === "help" && Number(c.world.getComponent(id, PotteryComponents.inventory)?.fuel ?? 0) < 1) return fail("帮忙修屋和备柴需要 1 捆燃料。");
        return { ok: true };
      }
      if (choice === "plan-child") {
        if (lifeAge(c.world, id) < 18) return fail("成年后才能建立家庭。");
        const spouse = c.world.listRelations({ type: "family.married_to", from: id })[0]?.to;
        if (!spouse || !living(c.world, spouse)) return fail("需要仍在世的伴侣共同迎接孩子。");
        if (Number(state(c.world, id).expectingAt ?? 0) > 0) return fail("家庭正在等待孩子降生。");
        if (c.world.tick - Number(state(c.world, id).lastChildAt ?? -1000) < yearTicks(c.world)) return fail("上一位孩子出生未满一年，先照顾已有的家人。");
        return { ok: true };
      }
      return fail("未知的生活选择。");
    }});
    ctx.registerResolutionRule({ id: "settlement-life.choose.resolve", commandType: "settlement-life.choose", resolve: c => {
      const id = c.command.actorId!, s = state(c.world, id), choice = String(c.command.payload.choice);
      const stock = c.world.getComponent(id, PotteryComponents.inventory) ?? {};
      let cost = 1, summary = "这段时间，你让自己慢下来。";
      const change: ComponentData = {};
      const effects: Effect[] = [];
      if (choice === "study") {
        cost = 2; change.lessons = Number(s.lessons ?? 0) + 1; change.skill = Number(s.skill ?? 0) + 1;
        summary = Number(s.lessons ?? 0) === 0 ? "你学会分辨泥里的杂质。现在可以开始制作第一件陶器。" : "你把上一次的经验重新练过，手艺又熟练了一些。";
      }
      if (choice === "gather-clay") {
        effects.push(patch(id, PotteryComponents.inventory, { clay: Number(stock.clay ?? 0) + 1 })); summary = "你沿河找到了 1 份可用黏土，花去了一个月的生活时间。";
      }
      if (choice === "gather-fuel") {
        effects.push(patch(id, PotteryComponents.inventory, { fuel: Number(stock.fuel ?? 0) + 3 })); summary = "你收集并晾好 3 捆燃料，下次烧窑有了准备。";
      }
      if (choice === "visit" || choice === "help") {
        const target = c.command.targetId!, trust = trusts(s);
        trust[target] = Math.min(6, Number(trust[target] ?? 0) + (choice === "help" ? 2 : 1)); change.trust = trust;
        const name = String(c.world.getComponent(target, IDENTITY)?.givenName ?? "邻居");
        if (choice === "help") { cost = 2; effects.push(patch(id, PotteryComponents.inventory, { fuel: Number(stock.fuel ?? 0) - 1 })); }
        summary = choice === "help" ? `你带着柴火帮${name}修整屋舍。对方开始把你当作可以依靠的人。` : `你与${name}坐下来谈了一段生活，彼此熟悉了一些。`;
        if (!c.world.listRelations({ type: "family.friend_of", from: id, to: target }).length) effects.push({ kind: "addRelation", type: "family.friend_of", from: id, to: target, components: { "family.friendship": { closeness: trust[target] / 6, since: c.world.tick } }, announce: false });
      }
      if (choice === "plan-child") {
        cost = 9; change.expectingAt = c.world.tick + cost;
        summary = "你们决定迎接孩子。接下来的九个月交给家庭与日常，孩子会在这段时间结束时出生。";
        effects.push({ kind: "scheduleTask", taskType: "settlement-life.birth", afterTicks: cost, payload: { actorId: id }, dedupeKey: `birth:${id}:${c.world.tick}` });
      }
      effects.push(patch(id, Life.state, { ...change, busyUntil: c.world.tick + cost, outcome: summary }),
        { kind: "emitEvent", eventType: "settlement-life.choice_made", actorId: id, targetId: c.command.targetId, data: { choice, cost, summary }, historicalSignificance: choice === "help" ? 0.3 : 0.12 });
      return effects;
    }});

    // Guards apply only to people who opt into this scenario, leaving other packs' contracts intact.
    ctx.registerConstraintRule({ id: "settlement-life.pottery.allowed", commandType: "practice-runtime.start", evaluate: c => {
      const id = c.command.actorId ?? "";
      if (!c.world.getComponent(id, Life.state)) return { ok: true };
      const a = available(c.world, id); if (!a.ok) return a;
      if (currentPractice(c.world, id)) return fail("手里已经有一项尚未完成的手艺。");
      if (lifeAge(c.world, id) < 14) return fail("十四岁以后才能独立安排窑场手艺。");
      if (c.command.payload.definitionId === PotteryPracticeDefinitions.makeVessel && Number(state(c.world, id).lessons ?? 0) < 1) return fail("先向师傅学习一次，再动手制陶。");
      return { ok: true };
    }});
    ctx.registerConstraintRule({ id: "settlement-life.checkpoint.allowed", commandType: "practice-runtime.resolve_checkpoint", evaluate: c => {
      const id = c.command.actorId ?? "";
      return c.world.getComponent(id, Life.state) ? available(c.world, id) : { ok: true };
    }});
    ctx.registerReactionRule({ id: "settlement-life.practice.experience", eventType: "practice-runtime.started", react: c => {
      const id = c.event.actorId ?? "", practiceId = c.event.targetId ?? "";
      if (!c.world.getComponent(id, Life.state) || c.event.data.definitionId !== PotteryPracticeDefinitions.makeVessel) return [];
      const context = c.world.getComponent(practiceId, PracticeComponents.practice)?.context as Record<string, any> ?? {};
      const clay = context.clay ?? {};
      const skill = Number(state(c.world, id).skill ?? 0);
      // Experience improves handling of this batch; the physical craft pack still owns all outcome math.
      return [patch(practiceId, PracticeComponents.practice, { context: { ...context, clay: { ...clay,
        uniformity: Math.min(1, Number(clay.uniformity ?? 0.45) + Math.min(0.2, skill * 0.02)),
        impurities: Math.max(0, Number(clay.impurities ?? 0.55) - Math.min(0.15, skill * 0.01)),
      }, makerExperience: skill } })];
    }});
    ctx.registerReactionRule({ id: "settlement-life.checkpoint.feedback", eventType: "practice-runtime.checkpoint_resolved", react: c => {
      const id = c.event.actorId ?? "";
      if (!c.world.getComponent(id, Life.state) || c.event.data.definitionId !== PotteryPracticeDefinitions.makeVessel) return [];
      const cp = c.world.getComponent(c.event.targetId ?? "", PracticeComponents.checkpoint) ?? {};
      const actions = cp.candidateActions as Array<Record<string, unknown>> ?? [];
      const selected = actions.find(a => a.id === c.event.data.actionId);
      const context = c.world.getComponent(String(c.event.data.practiceId), PracticeComponents.practice)?.context as Record<string, any> ?? {};
      if (cp.type === "pottery-firing-choice") return []; // The pottery module emits the actual kiln result in this cascade.
      const result = cp.type === "clay-preparation-choice" ? String(context.clayPreparation?.tradeoff ?? "泥料准备好了。")
        : cp.type === "pottery-forming-choice" ? `器形已经定下；${Number(context.forming?.weight ?? 0) >= 0.68 ? "较重的器身需要更均匀的干燥" : "接下来要让器壁与底部一起干透"}。`
        : Number(context.drying?.residualMoisture ?? 0) > 0.2 ? "器坯内部仍有水分。入窑时需要留意预热和受热开裂。" : "坯体的内部水分已经明显减少，现在可以决定怎样烧制。";
      return [patch(id, Life.state, { outcome: `你选择了「${String(selected?.label ?? "继续制作")}」。${result}` })];
    }});
    ctx.registerReactionRule({ id: "settlement-life.pottery.growth", eventType: "craft-pottery.vessel_fired", react: c => {
      const id = c.event.actorId ?? ""; if (!c.world.getComponent(id, Life.state)) return [];
      const s = state(c.world, id), quality = qualityLabel(c.event.data.quality);
      const vessel = c.world.getComponent(c.event.targetId ?? "", PotteryComponents.vessel) ?? {};
      const defects = Array.isArray(vessel.defects) ? vessel.defects.map(defectLabel).join("、") : "";
      const summary = vessel.status === "failed" ? `这一窑没能做成可用陶器。${defects || "泥料和火候还需要调整"}。经验保留下来，可以补充材料再试。` : `你做出了一件${quality}陶器。${defects ? `仍有${defects}；` : ""}接下来可以交换补给、赠给邻居，或留给家族。`;
      return [patch(id, Life.state, { completed: Number(s.completed ?? 0) + 1, skill: Number(s.skill ?? 0) + 1, outcome: summary })];
    }});
    ctx.registerConstraintRule({ id: "settlement-life.legacy.allowed", commandType: "early-civilization.leave_legacy", evaluate: c => {
      const id = c.command.actorId ?? ""; if (!c.world.getComponent(id, Life.state)) return { ok: true };
      const a = available(c.world, id); if (!a.ok) return a;
      if (currentPractice(c.world, id)) return fail("先完成手中的陶器，再整理传承。");
      const s = state(c.world, id);
      return Number(s.lessons ?? 0) >= 2 && Number(s.completed ?? 0) >= 1 && (s.familyWorks as unknown[] ?? []).length >= 1 ? { ok: true } : fail("积累两段学习经验，并为家族留下一件可用陶器，才能把手艺作为传承。");
    }});
    ctx.registerReactionRule({ id: "settlement-life.legacy.feedback", eventType: "early-civilization.legacy_left", react: c => {
      const id = c.event.actorId ?? "";
      if (!c.world.getComponent(id, Life.state)) return [];
      return [patch(id, Life.state, { busyUntil: c.world.tick + 1, outcome: "你把练习、失败和留下的陶器整理成手艺经验。它开始成为后来的人可以接续的传承。" })];
    }});

    ctx.registerConstraintRule({ id: "settlement-life.dispose.allowed", commandType: "settlement-life.dispose", evaluate: c => {
      const a = available(c.world, c.command.actorId); if (!a.ok) return a;
      const id = c.command.actorId!, vesselId = String(c.command.payload.vesselId ?? "");
      if (currentPractice(c.world, id)) return fail("先把当前手艺做完。");
      if (!c.world.listRelations({ type: PotteryRelations.craftedBy, from: vesselId, to: id }).length) return fail("只能决定自己作品的用途。");
      if (c.world.getComponent(vesselId, PotteryComponents.vessel)?.status !== "fired") return fail("这件陶器无法使用，先调整方法再试。");
      if (c.world.getComponent(vesselId, Life.disposition)) return fail("这件作品已经有了去处。");
      const mode = String(c.command.payload.mode ?? "");
      if (!["exchange", "gift", "keep"].includes(mode)) return fail("请选择作品的用途。");
      if (mode === "gift" && !nearby(c.world, id, c.command.targetId ?? "")) return fail("需要选择仍在聚落里的收礼人。");
      return { ok: true };
    }});
    ctx.registerResolutionRule({ id: "settlement-life.dispose.resolve", commandType: "settlement-life.dispose", resolve: c => {
      const id = c.command.actorId!, vesselId = String(c.command.payload.vesselId), mode = String(c.command.payload.mode), s = state(c.world, id);
      const stock = c.world.getComponent(id, PotteryComponents.inventory) ?? {};
      const effects: Effect[] = [];
      let summary = "你把陶器留在家里。以后接手人生的人会知道这件作品从哪里来。";
      const change: ComponentData = {};
      if (mode === "exchange") {
        effects.push(patch(id, PotteryComponents.inventory, { clay: Number(stock.clay ?? 0) + 1, fuel: Number(stock.fuel ?? 0) + 3 }));
        summary = "你用陶器换回 1 份黏土和 3 捆燃料；它开始进入别人的日常。";
      }
      if (mode === "gift") {
        const trust = trusts(s), target = c.command.targetId!; trust[target] = Math.min(6, Number(trust[target] ?? 0) + 2); change.trust = trust;
        summary = `你把陶器送给${String(c.world.getComponent(target, IDENTITY)?.givenName)}。对方记住了你的心意，关系加深了。`;
      }
      if (mode === "keep") change.familyWorks = [...(s.familyWorks as string[] ?? []), vesselId];
      effects.push({ kind: "setComponent", entityId: vesselId, component: Life.disposition, value: { mode, recipientId: c.command.targetId ?? "", ownerId: id, at: c.world.tick } },
        patch(id, Life.state, { ...change, busyUntil: c.world.tick + 1, outcome: summary }),
        { kind: "emitEvent", eventType: "settlement-life.work_shared", actorId: id, targetId: vesselId, data: { mode, summary }, historicalSignificance: 0.4 });
      return effects;
    }});

    ctx.registerConstraintRule({ id: "settlement-life.marriage.allowed", commandType: "family.marry", evaluate: c => {
      const id = c.command.actorId ?? ""; if (!c.world.getComponent(id, Life.state)) return { ok: true };
      const a = available(c.world, id); if (!a.ok) return a;
      if (currentPractice(c.world, id)) return fail("先完成正在制作的陶器。");
      return canMarry(c.world, id, c.command.targetId ?? "");
    }});
    ctx.registerReactionRule({ id: "settlement-life.marriage.remember", eventType: "family.married", react: c => {
      const id = c.event.actorId ?? ""; if (!c.world.getComponent(id, Life.state)) return [];
      return [patch(id, Life.state, { busyUntil: c.world.tick + 1, outcome: `你与${String(c.world.getComponent(c.event.targetId ?? "", IDENTITY)?.givenName ?? "伴侣")}决定共同生活。曾经的相处成为这段关系的开始。` })];
    }});
    ctx.registerTask({ type: "settlement-life.birth", handler: c => {
      const id = String(c.payload.actorId ?? ""), s = state(c.world, id);
      if (!Number(s.expectingAt ?? 0)) return undefined;
      const spouse = c.world.listRelations({ type: "family.married_to", from: id })[0]?.to;
      if (!living(c.world, id) || !spouse || !living(c.world, spouse)) return { command: { type: "settlement-life.cancel_birth", actorId: id, source: "system" } };
      const count = c.world.listRelations({ type: "family.parent_of", from: id }).length;
      return { command: { type: "family.have_child", actorId: id, payload: { givenName: ["小禾", "小川", "小宁", "小安"][count % 4] + (count >= 4 ? String(count + 1) : "") }, source: "system" } };
    }});
    ctx.registerConstraintRule({ id: "settlement-life.birth.allowed", commandType: "family.have_child", evaluate: c => {
      const id = c.command.actorId ?? ""; if (!c.world.getComponent(id, Life.state)) return { ok: true };
      const s = state(c.world, id), due = Number(s.expectingAt ?? 0);
      if (due <= 0 || c.world.tick < due) return fail("孩子会在家庭准备的九个月结束后出生。");
      return c.world.tick - Number(s.lastChildAt ?? -1000) >= yearTicks(c.world) ? { ok: true } : fail("先照顾已有的孩子。");
    }});
    ctx.registerReactionRule({ id: "settlement-life.birth.remember", eventType: "family.child_born", react: c => {
      const id = c.event.actorId ?? ""; if (!c.world.getComponent(id, Life.state)) return [];
      const childId = c.event.targetId!;
      return [patch(id, Life.state, { expectingAt: 0, lastChildAt: c.world.tick, outcome: `${String(c.event.data.givenName)}来到家里。孩子长大后，可以接过这段人生。` }),
        patch(childId, Life.person, { role: "正在成长的家人", trait: "在家人的经验里寻找自己的方向", wish: "成年后，希望自己决定如何生活。" })];
    }});
    ctx.registerResolutionRule({ id: "settlement-life.cancel_birth.resolve", commandType: "settlement-life.cancel_birth", resolve: c => [patch(c.command.actorId!, Life.state, { expectingAt: 0, outcome: "家庭发生了变故，这次迎接孩子的计划中止了。" })] });

    ctx.registerConstraintRule({ id: "settlement-life.handoff.allowed", commandType: "settlement-life.handoff", evaluate: c => {
      const a = available(c.world, c.command.actorId, true); if (!a.ok) return a;
      const id = c.command.actorId!, target = c.command.targetId ?? "";
      if (living(c.world, id) && currentPractice(c.world, id)) return fail("先完成手中的作品，再把人生交给下一代。");
      if (!c.world.listRelations({ type: "family.parent_of", from: id, to: target }).length || !living(c.world, target)) return fail("需要选择仍在世的孩子。");
      return lifeAge(c.world, target) >= 18 ? { ok: true } : fail("孩子成年后才能接过人生。");
    }});
    ctx.registerResolutionRule({ id: "settlement-life.handoff.resolve", commandType: "settlement-life.handoff", resolve: c => {
      const id = c.command.actorId!, child = c.command.targetId!, s = state(c.world, id);
      const works = s.familyWorks as string[] ?? [], inherited = works.length;
      const summary = `你接过了家人的人生，继承了 ${inherited} 件家族作品${inherited ? "与一段入门手艺" : ""}。${living(c.world, id) ? "前人的生活还在继续" : "前人的记忆仍然留下"}，你可以选择新的方向。`;
      return [patch(WORLD, STATE, { activeCharacterId: child, generation: Number(c.world.getComponent(child, IDENTITY)?.generation ?? 2) }),
        { kind: "setComponent", entityId: child, component: Life.state, value: defaultLife({ lessons: inherited ? 1 : 0, skill: inherited ? 1 : 0, familyWorks: [...works], inheritedFrom: id, outcome: summary }) },
        patch(child, PotteryComponents.inventory, { clay: 1, fuel: 4 }),
        { kind: "emitEvent", eventType: "modern.generation_switched", actorId: child, data: { previousCharacterId: id, generation: Number(c.world.getComponent(child, IDENTITY)?.generation ?? 2), summary }, historicalSignificance: 0.6 }];
    }});

    ctx.registerProjection({ id: "settlement-life.player", build: ({ world, params }) => {
      const id = String(params.actorId ?? ""), s = state(world, id), trust = trusts(s);
      const city = world.getComponent(id, "modern.residence")?.cityId;
      const people = world.listEntities({ kind: "modern.character" }).filter(e => e.id !== id && e.components[Life.person] && e.components["modern.residence"]?.cityId === city).map(e => ({
        id: e.id, name: String(e.components[IDENTITY]?.givenName ?? "家人"), age: lifeAge(world, e.id), ...e.components[Life.person],
        trust: Number(trust[e.id] ?? 0), relation: world.listRelations({ type: "family.married_to", from: id, to: e.id }).length ? "伴侣" : world.listRelations({ type: "family.parent_of", from: id, to: e.id }).length ? "孩子" : Number(trust[e.id] ?? 0) >= 3 ? "相互信任" : Number(trust[e.id] ?? 0) > 0 ? "逐渐熟悉" : "尚未熟悉",
        marriage: canMarry(world, id, e.id),
      }));
      const vessels = world.listRelations({ type: PotteryRelations.craftedBy, to: id }).map(r => {
        const vessel = world.getComponent(r.from, PotteryComponents.vessel) ?? {};
        return { id: r.from, ...vessel, quality: qualityLabel(vessel.quality), defects: Array.isArray(vessel.defects) ? vessel.defects.map(defectLabel) : [], disposition: world.getComponent(r.from, Life.disposition) ?? null };
      });
      const children = world.listRelations({ type: "family.parent_of", from: id }).map(r => ({ id: r.to, name: String(world.getComponent(r.to, IDENTITY)?.givenName ?? "孩子"), age: lifeAge(world, r.to), alive: living(world, r.to) }));
      const familyWorkDetails = (s.familyWorks as string[] ?? []).map(workId => ({ id: workId, quality: qualityLabel(world.getComponent(workId, PotteryComponents.vessel)?.quality), maker: String(world.getComponent(world.listRelations({ type: PotteryRelations.craftedBy, from: workId })[0]?.to ?? "", IDENTITY)?.givenName ?? "前人") }));
      return { entered: Boolean(world.getComponent(id, Life.state)), ...s, inventory: world.getComponent(id, PotteryComponents.inventory) ?? { clay: 0, fuel: 0 }, people, vessels, children,
        familyWorkDetails,
        legacyReady: Number(s.lessons ?? 0) >= 2 && Number(s.completed ?? 0) >= 1 && (s.familyWorks as unknown[] ?? []).length > 0,
        practiceId: currentPractice(world, id)?.id ?? "",
      };
    }});
  },
};
