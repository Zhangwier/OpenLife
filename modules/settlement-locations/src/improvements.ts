/** Player-led improvements: physical work here, knowledge certified by tech. */
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { ObjectComponents, ObjectKinds, ObjectRelations, ownerOf, prototypeOf } from "@openlife/module-world-objects";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { SettlementCommands as C, SettlementComponents as S, SettlementId } from "./vocabulary.ts";
import { dailyActivity } from "./village-reads.ts";
import { refuse, type Registration } from "./rules.ts";

export const IMPROVEMENT_ID = "improvement:shadoof";
export const IMPROVEMENT_OBJECT = "settlement-locations:shadoof";
export const IMPROVEMENT_PROTOTYPE = "prototype:shadoof";
const MATERIALS: Record<string, number> = { "resource:wood": 2, "resource:rope": 1, "resource:stone": 1 };
const LABELS: Record<string, string> = { "resource:wood": "木料", "resource:rope": "草绳", "resource:stone": "石料" };
interface Project {
  stage: "idea" | "prepared" | "ready" | "installed" | "cancelled";
  maker: string; startedAt: number; lastTrialAt: number; failures: number;
  installedAt?: number; placeId?: string; materials: string[];
  taught: Array<{ teacher: string; learner: string; at: number }>;
}
export function improvementOf(world: WorldView): Project | undefined {
  return world.getComponent(SettlementId, S.improvement) as unknown as Project | undefined;
}
export function shadoofWorks(world: WorldView, placeId: string): boolean {
  const p = improvementOf(world);
  const object = world.getEntity(IMPROVEMENT_OBJECT);
  return p?.stage === "installed" && p.placeId === placeId && Boolean(object && object.archivedAt === undefined);
}
function held(world: WorldView, me: string, resource: string): string[] {
  return world.listRelations({ type: ObjectRelations.heldBy, to: me }).map(r => r.from).sort()
    .filter(id => world.getEntity(id)?.archivedAt === undefined && ownerOf(world, id) === me
      && prototypeOf(world, id).resourceId === resource);
}
function shortage(world: WorldView, me: string): string {
  return Object.entries(MATERIALS).filter(([r, n]) => held(world, me, r).length < n)
    .map(([r, n]) => `${LABELS[r]} ${held(world, me, r).length}/${n}`).join("、");
}
const COSTS: Record<string, number> = { [C.improvementStart]: 1, [C.improvementPrepare]: 2,
  [C.improvementTrial]: 2, [C.improvementInstall]: 2, [C.improvementTeach]: 2, [C.improvementCancel]: 0 };
const fidelity = (world: WorldView, person: string) => Number((world.getComponent(person, "tech.mind")?.knows as Record<string, number> | undefined)?.["invention:shadoof"] ?? 0);
function problem(world: WorldView, me: string, type: string, payload: Record<string, unknown>): string {
  const actor = world.getEntity(me);
  if (!actor || actor.archivedAt !== undefined || actor.components["modern.vitals"]?.alive === false) return "这一生已经结束";
  if (!world.getEntity(SettlementId) || !occupiedPlaceId(world, me)) return "先进入聚落生活";
  const p = improvementOf(world);
  if (type === C.improvementStart) {
    if (p && p.stage !== "cancelled") return "村里已经有人在改进汲水了";
  } else {
    if (!p || p.stage === "cancelled") return "先记下改进汲水的打算";
    if (type !== C.improvementTeach && p.maker !== me) return "这是别人的项目，可以使用成品或向制作者学习";
    if (type === C.improvementCancel) {
      if (p.stage === "installed") return "设施已经供大家使用，不能撤回";
    } else {
      if (occupiedPlaceId(world, me) !== "place:river") return "先去河边，才能备料、试做或传授桔槔";
      if (type === C.improvementPrepare) {
        if (p.stage !== "idea") return "材料已经备过了";
        const missing = shortage(world, me); if (missing) return `还差 ${missing}；木料去栗林，石料去石滩，草绳用芦苇搓成`;
      } else if (type === C.improvementTrial) {
        if (p.stage !== "prepared") return "先备好材料；试做成功后就可以安装";
        if (p.lastTrialAt === world.tick) return "今天已经试过，明天再调整";
        if (!["balance", "rush"].includes(String(payload.method))) return "请选择调平配重或直接猛拉";
      } else if (type === C.improvementInstall && p.stage !== "ready") return "先把配重和支点调整到能稳定汲水";
      else if (type === C.improvementTeach) {
        if (p.stage !== "installed") return "先安装并验证成品";
        const learner = String(payload.learnerId ?? "");
        const person = world.getEntity(learner);
        if (!person || person.archivedAt !== undefined || person.components["modern.vitals"]?.alive === false
          || person.kind !== "modern.character" || learner === me) return "请选择在场的另一位居民或家人";
        if (occupiedPlaceId(world, learner) !== "place:river") return "对方要在河边才能跟着试学";
        if (fidelity(world, me) <= 0) return "你还没有学会桔槔，需要先向懂的人请教";
        if (fidelity(world, learner) > 0) return "对方已经学会了";
      }
    }
  }
  return dailyActivity(world, me).remaining < COSTS[type]! ? "今天的活动时间不够，明天再来" : "";
}
export function improvementActions(world: WorldView, me: string) {
  const p = improvementOf(world);
  const specs: Array<[string, string, string, Record<string, JsonValue>]> = !p || p.stage === "cancelled"
    ? [[C.improvementStart, "想办法让打水省力", "观察打水的难处，开始桔槔改进；几次实做就能见到成果。", {}]]
    : p.stage === "installed" ? []
    : [[C.improvementPrepare, "给桔槔备料", "木料 2、草绳 1、石料 1；材料要是自己手里可用的实物。", {}],
      [C.improvementTrial, "调平配重，试做桔槔", "调整支点与配重；稳定的方法能做成，失败经验保留。", { method: "balance" }],
      [C.improvementTrial, "不调配重，直接猛拉试试", "省去调整可能让桶倾翻；失败后明天可以改用调平配重。", { method: "rush" }],
      [C.improvementInstall, "在河边安装桔槔", "安装后同样一次打水少花 1 格活动时间，水源与容器数量照实扣算。", {}],
      [C.improvementCancel, "暂时放下汲水改进", "未安装的材料退回手里；可以日后重新开始。", {}]];
  if (p?.stage === "installed") for (const person of world.listEntities({ kind: "modern.character" })) {
    if (person.id === me || person.archivedAt !== undefined
      || occupiedPlaceId(world, person.id) !== "place:river") continue;
    // Stable visible descriptions; names are supplied by the observer's acquaintance projection elsewhere.
    specs.push([C.improvementTeach, "教在河边的居民使用桔槔", "花 2 格活动时间；对方实学以后，方法能传给后来的人。", { learnerId: person.id }]);
  }
  return specs.map(([id, label, hint, payload]) => {
    const reason = problem(world, me, id, payload);
    return { id, label, hint, payload, days: 0, activityCost: COSTS[id], enabled: !reason, reason };
  });
}
export function improvementView(world: WorldView, me: string) {
  const p = improvementOf(world);
  const text = !p || p.stage === "cancelled" ? "打水费力。你可以动手改进，也可以先过自己的日子。"
    : p.stage === "idea" ? "桔槔还在备料：木料 2、草绳 1、石料 1。"
    : p.stage === "prepared" ? (p.failures ? "桶翻了，材料还在。明天调平配重再试。" : "料齐了，去河边调整支点与配重。")
    : p.stage === "ready" ? "试做成功，安装以后全村都能省力打水。"
    : "河边有了桔槔：每次打水少花 1 格活动时间，下一代也能继续使用。";
  return { id: IMPROVEMENT_ID, title: "让打水省力", stage: p?.stage ?? "available", text,
    failures: p?.failures ?? 0, installedAt: p?.installedAt ?? null,
    maker: p?.maker === me ? "你" : p ? "村里的制作者" : "", transmissions: p?.taught.length ?? 0,
    actions: improvementActions(world, me) };
}
export function registerImprovements(ctx: Registration): void {
  ctx.registerProjection({ id: "settlement-locations.improvements", build: ({ world, params }) => improvementView(world, String(params.actorId ?? "")) });
  for (const type of Object.keys(COSTS)) {
    ctx.registerConstraintRule({ id: `${type}.allowed`, commandType: type, evaluate: c => {
      const why = problem(c.world, c.command.actorId ?? "", type, c.command.payload);
      return why ? refuse("E_IMPROVEMENT_BLOCKED", why) : { ok: true };
    } });
    ctx.registerResolutionRule({ id: `${type}.resolve`, commandType: type, resolve: c => {
      const me = c.command.actorId!, tick = c.world.tick;
      let p = structuredClone(improvementOf(c.world)) as Project;
      const effects: Effect[] = [];
      let line = "";
      if (type === C.improvementStart) {
        p = { stage: "idea", maker: me, startedAt: tick, lastTrialAt: -1, failures: 0, materials: [], taught: [] };
        line = "你记下打水的难处：长杆的一头挂桶，另一头绑石，或许能让大家省些力。";
      } else if (type === C.improvementPrepare) {
        p.materials = Object.entries(MATERIALS).flatMap(([r, n]) => held(c.world, me, r).slice(0, n));
        for (const id of p.materials) effects.push({ kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: me, reason: "桔槔备料", announce: false });
        p.stage = "prepared"; line = "你把自己的两份木料、一根草绳和一块石料备在河边，开始搭支点。";
      } else if (type === C.improvementTrial) {
        p.lastTrialAt = tick;
        if (c.command.payload.method === "balance") { p.stage = "ready"; line = "你移动配重，把长杆调平。桶稳稳升了起来，桔槔试做成功了。"; }
        else { p.failures += 1; line = "你猛拉长杆，桶倾翻了。支点和配重没有调平；材料与经验保留，明天换个办法再试。"; }
      } else if (type === C.improvementCancel) {
        for (const id of p.materials) effects.push({ kind: "addRelation", type: ObjectRelations.heldBy, from: id, to: me, announce: false });
        p.stage = "cancelled"; p.materials = []; line = "你暂时放下改进，备好的材料退回手里。以后可以重新开始。";
      } else if (type === C.improvementInstall) {
        p.stage = "installed"; p.installedAt = tick; p.placeId = "place:river";
        // Older saves predate this prototype. Add only the missing prototype during the real installation.
        if (!c.world.hasEntity(IMPROVEMENT_PROTOTYPE)) effects.push({ kind: "spawnEntity", id: IMPROVEMENT_PROTOTYPE,
          localId: "shadoof-prototype", entityKind: ObjectKinds.prototype,
          components: { [ObjectComponents.prototype]: { name: "桔槔", material: "wood-and-stone", resourceId: "resource:tool",
            unit: "架", mass: 0, capacity: 0, capabilities: ["fixture", "tool", "workable"], durability: 100, visibleFromOutside: true } } });
        for (const id of p.materials) effects.push({ kind: "archiveEntity", entityId: id, reason: "成为桔槔的材料", announce: false });
        effects.push({ kind: "spawnEntity", id: IMPROVEMENT_OBJECT, localId: "shadoof", entityKind: ObjectKinds.item,
          components: { [ObjectComponents.object]: { prototypeId: IMPROVEMENT_PROTOTYPE, name: "河边的桔槔", quantity: 1,
            durability: 100, madeAt: tick, condition: "sound", visibleFromOutside: true,
            provenance: { maker: me, inputs: p.materials, project: IMPROVEMENT_ID } } } },
          { kind: "addRelation", type: ObjectRelations.instanceOf, from: IMPROVEMENT_OBJECT, to: IMPROVEMENT_PROTOTYPE },
          { kind: "addRelation", type: ObjectRelations.containedIn, from: IMPROVEMENT_OBJECT, to: "space:bank" });
        line = "你在河边安好了桔槔。大家试着汲水，长杆替手臂分担了重量；以后打水少花一格工夫。";
      } else {
        const learner = String(c.command.payload.learnerId);
        p.taught.push({ teacher: me, learner, at: tick });
        line = "你让在场的居民扶杆、调石、亲手汲水。对方学会了，方法开始从你的手里传出去。";
      }
      const budget = dailyActivity(c.world, me);
      effects.push({ kind: "setComponent", entityId: SettlementId, component: S.improvement, value: p as unknown as Record<string, JsonValue> },
        { kind: "setComponent", entityId: me, component: S.holding, value: { ...c.world.getComponent(me, S.holding), activityDay: tick, activityUsed: budget.used + COSTS[type]! } },
        { kind: "emitEvent", eventType: type === C.improvementInstall ? "settlement-locations.improvement_installed"
          : type === C.improvementTeach ? "settlement-locations.improvement_taught" : "settlement-locations.improvement_worked",
          actorId: me, ...(type === C.improvementTeach ? { targetId: String(c.command.payload.learnerId) } : {}),
          data: { line, inventionId: "invention:shadoof", stage: p.stage, placeId: "place:river" },
          historicalSignificance: type === C.improvementInstall ? 0.7 : type === C.improvementTeach ? 0.3 : 0.05 });
      return effects;
    } });
  }
}
