import { Simulation } from "@openlife/simulation";
import { Life, currentPractice, lifeAge } from "@openlife/module-settlement-life";
import { PracticeComponents } from "@openlife/module-practice-runtime";
import { PotteryPracticeDefinitions } from "@openlife/module-craft-pottery";
import {
  SettlementCommands,
  SettlementProjections,
  carrying,
  homestead,
  prototypeForResource,
} from "@openlife/module-settlement-locations";
import { SpaceCommands } from "@openlife/module-world-space";
import { ObjectCommands, contentsOf, holderOf, prototypeOf, readObject, ObjectComponents } from "@openlife/module-world-objects";

/**
 * The M1 settlement lives beside the older settlement-life track rather than
 * replacing it, so a save from either era keeps working. The UI asks this view
 * first and falls back to the pottery flow when the world has no settlement.
 */
export function settlementView(sim: Simulation, actorId: string): Record<string, any> | null {
  const projected = sim.project({ id: SettlementProjections.homestead, params: { actorId } });
  const view = projected.ok ? (projected.data as Record<string, any>) : null;
  if (!view?.exists) return null;
  return {
    ...view,
    carrying: carrying(sim.worldView(), actorId),
    /** Objects the player could pick up right here, with what each is for. */
    pickables: pickables(sim, actorId),
    /** A jar in hand, so the water action can name the real object. */
    jarId: jarInHand(sim, actorId),
    /** Anything the player is currently borrowing, so it can be given back. */
    loans: loansHeldBy(sim, actorId),
  };
}

export function loansHeldBy(sim: Simulation, actorId: string): Record<string, any>[] {
  const world = sim.worldView();
  return world
    .listRelations({ type: "world-objects.held_by", to: actorId })
    .map((relation) => relation.from)
    .map((objectId) => {
      const loan = world.getComponent(objectId, "world-objects.loan");
      if (!loan || Number(loan.active ?? 0) !== 1) return null;
      return {
        objectId,
        name: prototypeOf(world, objectId).name,
        dueAt: Number(loan.dueAt ?? 0),
        daysLeft: Math.max(0, Number(loan.dueAt ?? 0) - sim.tick),
        overdue: sim.tick > Number(loan.dueAt ?? 0),
      };
    })
    .filter(Boolean) as Record<string, any>[];
}

function pickables(sim: Simulation, actorId: string): Record<string, any>[] {
  const world = sim.worldView();
  const placeId = String(
    sim.project({ id: SettlementProjections.homestead, params: { actorId } }).data?.placeId ?? "",
  );
  if (!placeId) return [];
  return world
    .listEntities({ kind: "world-objects.item" })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const prototype = prototypeOf(world, entity.id);
      const instance = readObject(entity.components[ObjectComponents.object]);
      const holder = holderOf(world, entity.id);
      const container = world
        .listRelations({ type: "world-objects.contained_in", from: entity.id })
        .map((relation) => relation.to)[0] ?? "";
      const owner = world
        .listRelations({ type: "world-objects.owned_by", from: entity.id })
        .map((relation) => relation.to)[0] ?? "";
      return {
        id: entity.id,
        name: instance.name || prototype.name,
        prototypeId: prototype.prototypeId,
        material: prototype.material,
        carrier: holder === actorId ? "你" : holder ? "别人" : "",
        container,
        owner,
        inside: contentsOf(world, entity.id).length,
        held: holder === actorId,
        carryable: prototype.capabilities.includes("carryable"),
        liquidHolder: prototype.capabilities.includes("liquid-holder"),
      };
    })
    .filter((object) => object.container === placeId || object.carrier === "你");
}

function jarInHand(sim: Simulation, actorId: string): string {
  const world = sim.worldView();
  return world
    .listRelations({ type: "world-objects.held_by", to: actorId })
    .map((relation) => relation.from)
    .find((id) => prototypeOf(world, id).capabilities.includes("liquid-holder")) ?? "";
}

/** Turns one settlement action from the projection into the command it means. */
export function runSettlementAction(sim: Simulation, actorId: string, action: string, payload: Record<string, any>, source: "player" | "autosim" = "player") {
  const dispatch = (type: string, extra: Record<string, any> = {}) =>
    sim.dispatch({ type, actorId, source, ...extra });
  const advance = (result: ReturnType<Simulation["dispatch"]>, days: number) => {
    if (result.ok && days > 0) sim.advanceBy(days);
    return result;
  };

  switch (action) {
    case SettlementCommands.arrive:
      return advance(dispatch(SettlementCommands.arrive, { payload: { placeId: payload.placeId, travelMode: payload.travelMode, planIndex: payload.planIndex, planStep: payload.planStep } }), payload.travelMode === "local" ? 0 : Number(payload.costDays ?? 1));
    case SpaceCommands.moveWithin:
      return advance(dispatch(SpaceCommands.moveWithin, { payload: { spaceId: payload.spaceId } }), 0);
    case SpaceCommands.enter:
      return advance(dispatch(SpaceCommands.enter, { payload: { placeId: payload.placeId } }), Number(payload.costDays ?? 1));
    case ObjectCommands.take: {
      // Picking something up is a real act with a real consequence.
      //
      // If it is yours, you simply hold it. If it belongs to a household, you
      // cannot lend it to yourself: the owner is the one who grants custody, so
      // the request is recorded as a loan *from the owner*, which is also what
      // makes "he lent it to me and I have not given it back" a real debt
      // rather than a line of text (NPC-004, OBJ-001).
      const objectId = String(payload.objectId);
      const world = sim.worldView();
      const owner = world
        .listRelations({ type: "world-objects.owned_by", from: objectId })
        .map((relation) => relation.to)[0] ?? "";
      if (!owner || owner === actorId) {
        return dispatch(ObjectCommands.take, { payload: { objectId } });
      }
      const borrowed = sim.dispatch({
        type: ObjectCommands.lend,
        actorId: owner,
        source: "player",
        targetId: objectId,
        payload: { objectId, borrowerId: actorId, dueAt: sim.tick + 2 * 30 },
      });
      if (borrowed.ok) return borrowed;
      // The owner refuses to lend a worn-out or already-lent thing; in that
      // case the player may still ask and be told no, which is the answer the
      // rule engine already produced.
      return borrowed;
    }
    case ObjectCommands.place:
      return advance(dispatch(ObjectCommands.place, { payload: { objectId: payload.objectId, placeId: payload.placeId } }), 0);
    case ObjectCommands.returnItem:
      return advance(dispatch(ObjectCommands.returnItem, { payload: { objectId: payload.objectId } }), 0);
    case SettlementCommands.draw:
      return advance(dispatch(SettlementCommands.draw, { payload: { resourceId: payload.resourceId, placeId: payload.placeId, amount: payload.amount ?? 1 } }), 0);
    case SettlementCommands.drink:
      return advance(dispatch(SettlementCommands.drink, { payload: { containerId: payload.containerId, resourceId: "resource:water" } }), 0);
    case SettlementCommands.eat:
      return advance(dispatch(SettlementCommands.eat, { payload: { resourceId: payload.resourceId, placeId: payload.placeId, objectId: payload.objectId, planIndex: payload.planIndex, planStep: payload.planStep } }), 0);
    case SettlementCommands.cook:
      return advance(dispatch(SettlementCommands.cook), 0);
    case SettlementCommands.sow:
      return advance(dispatch(SettlementCommands.sow), 0);
    case SettlementCommands.harvest:
      return advance(dispatch(SettlementCommands.harvest), 0);
    case SettlementCommands.tend:
      return advance(dispatch(SettlementCommands.tend, { payload: { spaceId: payload.spaceId, planIndex: payload.planIndex, planStep: payload.planStep } }), 0);
    case SettlementCommands.rest:
      return advance(dispatch(SettlementCommands.rest, { payload: { spaceId: payload.spaceId, planIndex: payload.planIndex, planStep: payload.planStep } }), 0);
    case SettlementCommands.configurePlan:
      return dispatch(SettlementCommands.configurePlan, { payload: { steps: payload.steps, repeat: payload.repeat, enabled: payload.enabled } });
    case SettlementCommands.step:
      // "Let a day pass" is the one action that moves the clock. It runs the
      // command first so the event is recorded, then advances exactly one day.
      return advance(dispatch(SettlementCommands.step), 1);
    default:
      return { ok: false, errors: [{ code: "E_SETTLEMENT_ACTION", message: "这个选择不属于当前的聚落生活。" }] };
  }
}

export function playerView(sim: Simulation, actorId: string) {
  const life = sim.project({ id: "settlement-life.player", params: { actorId } }).data as Record<string, any>;
  const practice = sim.worldView().getEntity(actorId)?.archivedAt === undefined ? currentPractice(sim.worldView(), actorId) : undefined;
  const interaction = practice ? sim.project({ id: "practice-runtime.interaction", params: { practiceId: practice.id, participantId: actorId } }).data : null;
  return { ...life, practice: interaction ?? null };
}

export function playerActions(sim: Simulation, actorId: string) {
  const p = playerView(sim, actorId), world = sim.worldView();
  const alive = world.getEntity(actorId)?.archivedAt === undefined;
  const actions: Record<string, any>[] = [];
  const add = (id: string, label: string, hint: string, cost: number, enabled = true, reason = "", payload = {}, tone = "warm") => actions.push({ id, label, hint, cost, enabled, reason, payload, tone });
  if (!p.entered && !p.practice) { add("life-enter", "进入聚落手艺生活", "认识窑场的师傅与邻居，开始一条有过程的手艺路线。", 0, alive); return actions; }
  if (!alive) {
    for (const child of p.children) add("life-handoff", `接过${child.name}的人生`, "带着家族留下的作品与经验继续生活。", 0, child.alive && child.age >= 18, child.alive ? "孩子成年后才能接棒" : "这位家人已经离世", { targetId: child.id }, "gold");
    if (!actions.some(a => a.enabled)) add("life-ended", "这一段家族故事暂告一段落", "没有成年且仍在世的孩子可以接棒。可以从右上角开始新人生。", 0, false, "没有可接棒的家人");
    return actions;
  }
  if (p.practice) {
    const interaction = p.practice.interaction;
    if (interaction) for (const a of interaction.actions) add("pottery-choice", a.label, a.hint ?? "决定下一步的制作方法。", potteryCost(a.id), a.enabled !== false && interaction.canResolve, a.disabledReason ?? "", { checkpointId: interaction.checkpointId, actionId: a.id }, "blue");
    else add("pottery-continue", "继续这段手艺", "推进一个月，等待下一步需要你决定的地方。", 1, true, "", {}, "blue");
    return actions;
  }
  const mentor = p.people.some((person: { role: string }) => person.role === "窑边的师傅");
  add("life-study", mentor ? Number(p.lessons) ? "向师傅再学一段手艺" : "向师傅学习辨泥" : "从留下的经验里练习手艺", "手艺 +1，让下一批泥料更均匀、杂质更少；第一段学习后可以制作陶器。", 2, lifeAge(world, actorId) >= 14, "十四岁以后才能开始窑场的手艺学习", {}, "warm");
  const canCraft = Number(p.lessons) >= 1 && Number(p.inventory.clay) >= 1 && Number(p.inventory.fuel) >= 2;
  add("pottery-start", "制作一件陶器", "从选泥、成型到干燥与烧制，每一步都由你决定。开始消耗 1 份黏土。", 1, canCraft, Number(p.lessons) < 1 ? "先向师傅学习一次" : Number(p.inventory.clay) < 1 ? "需要 1 份黏土，去河边采集" : "至少需要 2 捆燃料", {}, "ink");
  add("life-gather-clay", "去河边找黏土", "获得 1 份黏土，给下一件作品准备材料。", 1, true, "", {}, "quiet");
  add("life-gather-fuel", "收集烧窑的柴火", "获得 3 捆燃料；也可以用来帮助邻居。", 1, true, "", {}, "quiet");
  add("life-rest", "让一个月平静过去", "看看家人的成长与世界的变化。", 1, true, "", {}, "quiet");
  const spouse = world.listRelations({ type: "family.married_to", from: actorId })[0]?.to;
  if (spouse) {
    const spouseLiving = world.getEntity(spouse)?.archivedAt === undefined;
    const cooldown = sim.tick - Number(p.lastChildAt ?? -1000) >= 12;
    add("life-child", "与伴侣迎接一个孩子", "用九个月照料家庭；孩子在这段时间结束时出生。此后间隔一年再迎接下一位。", 9, spouseLiving && lifeAge(world, actorId) >= 18 && cooldown && !p.expectingAt, !spouseLiving ? "伴侣已经离世" : !cooldown ? "上一位孩子出生还未满一年" : "家庭正在等待孩子降生", {}, "rose");
  }
  const legacy = world.getComponent(actorId, "early-civilization.legacy");
  if (!legacy) add("life-legacy", "整理手艺，留下传承", "把真实制作与留给家族的作品整理成可以传下去的经验。", 1, p.legacyReady, "需要两段学习经验，并留下一件可用陶器", {}, "gold");
  for (const child of p.children) if (child.alive) add("life-handoff", `把人生交给${child.name}`, `孩子现在 ${child.age} 岁。你可以在仍然在世时交棒，作品与经验继续留下。`, 0, child.age >= 18, "孩子成年后才能接棒", { targetId: child.id }, "gold");
  return actions;
}

export function potteryCost(actionId: string) {
  return ["air-dry-first", "screen-and-knead", "rest-covered", "slow-shade", "extended-rest", "low-slow", "staged-preheat", "gradual-hot"].includes(actionId) ? 2 : 1;
}

export function runPlayerAction(sim: Simulation, actorId: string, action: string, payload: Record<string, any> = {}) {
  const dispatch = (type: string, extra = {}) => sim.dispatch({ type, actorId, source: "player", ...extra });
  const advance = (result: ReturnType<Simulation["dispatch"]>, ticks: number) => { if (result.ok && ticks) sim.advanceBy(ticks); return result; };
  if (action === "life-enter") {
    const entered = dispatch("settlement-life.enter");
    if (entered.ok && lifeAge(sim.worldView(), actorId) >= 14) {
      if (!sim.worldView().getComponent(actorId, "early-civilization.learning")) dispatch("early-civilization.begin_learning");
      if (!sim.worldView().getComponent(actorId, "early-civilization.role")) dispatch("early-civilization.take_role", { payload: { role: "craftsperson" } });
    }
    return entered;
  }
  const choices: Record<string, string> = { "life-study": "study", "life-gather-clay": "gather-clay", "life-gather-fuel": "gather-fuel", "life-rest": "rest", "life-visit": "visit", "life-help": "help", "life-child": "plan-child" };
  if (choices[action]) {
    const result = dispatch("settlement-life.choose", { targetId: payload.targetId, payload: { choice: choices[action] } });
    const busyUntil = Number(sim.worldView().getComponent(actorId, Life.state)?.busyUntil ?? sim.tick);
    return advance(result, Math.max(0, busyUntil - sim.tick));
  }
  if (action === "pottery-start") return advance(dispatch("practice-runtime.start", { payload: {
    definitionId: PotteryPracticeDefinitions.makeVessel, goal: "制作一件属于自己的陶器", role: "potter", decisionMode: "manual",
    context: { clay: { moisture: 0.76, impurities: 0.55, uniformity: 0.45, plasticity: 0.72, materialMass: 1, hasSieve: true, hasDryClay: false } },
  } }), 1);
  if (action === "pottery-choice") return advance(dispatch("practice-runtime.resolve_checkpoint", { targetId: payload.checkpointId, payload: { checkpointId: payload.checkpointId, actionId: payload.actionId } }), potteryCost(String(payload.actionId)));
  if (action === "pottery-continue") {
    if (!currentPractice(sim.worldView(), actorId)) return rejected("当前没有正在制作的陶器。");
    if (currentPractice(sim.worldView(), actorId)?.components[PracticeComponents.practice]?.status === "blocked") return rejected("请先决定当前的制作方法。");
    sim.advanceBy(1); return { ok: true, errors: [] };
  }
  if (action === "life-dispose") return advance(dispatch("settlement-life.dispose", { targetId: payload.targetId, payload: { vesselId: payload.vesselId, mode: payload.mode } }), 1);
  if (action === "life-marry") return advance(dispatch("family.marry", { targetId: payload.targetId }), 1);
  if (action === "life-legacy") return advance(dispatch("early-civilization.leave_legacy"), 1);
  if (action === "life-handoff") return dispatch("settlement-life.handoff", { targetId: payload.targetId });
  return rejected("这个选择不属于当前的聚落生活。");
}

export function rejected(message: string) { return { ok: false, errors: [{ code: "E_PLAYER_ACTION", message }] }; }
