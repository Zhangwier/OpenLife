/** Four ways of living, assembled from authoritative actions and optional projections. */
import type { Simulation } from "@openlife/simulation";
import { homestead, RIVER_TERRACE_PACK, dailyActivity, SettlementCommands } from "@openlife/module-settlement-locations";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { BuildCommands, blueprintById, currentSite } from "@openlife/module-settlement-build";
import { improvementView } from "@openlife/module-settlement-locations";
type Action = { id: string; label: string; hint?: string; payload: Record<string, any>; enabled: boolean; reason: string; days: number; activityCost?: number };

function project(sim: Simulation, id: string, actorId: string): Record<string, any> | null {
  const p = sim.project({ id, params: { actorId } });
  return p.ok ? p.data as Record<string, any> : null;
}
export function buildingActions(sim: Simulation, actorId: string): Action[] {
  const board = project(sim, "settlement-build.board", actorId);
  if (!board || !sim.worldView().hasEntity(actorId)) return [];
  const world = sim.worldView(), alive = world.getEntity(actorId)?.components["modern.vitals"]?.alive !== false;
  const here = occupiedPlaceId(world, actorId) === "place:yard", cost = dailyActivity(world, actorId).remaining;
  const actions: Action[] = [];
  const add = (id: string, label: string, payload: Record<string, any>, reason = "", activityCost = 0, hint = "") => {
    const why = !alive ? "这一生已经结束" : !here ? "先回庭院，再安排建房" : reason || (cost < activityCost ? "今天的活动时间不够" : "");
    actions.push({ id, label, hint, payload, enabled: !why, reason: why, days: 0, activityCost });
  };
  if (!board.site) for (const b of board.blueprints) add(BuildCommands.plan, `动工：${b.name}`, { blueprintId: b.id }, "", 1, b.hint);
  else {
    for (const [resourceId, n] of Object.entries(board.site.missing)) {
      const stocks = world.listEntities({ kind: "settlement-locations.yield-point" }).filter(e => e.archivedAt === undefined
        && e.components["settlement-locations.yield"]?.resourceId === resourceId)
        .reduce((s, e) => s + Number(e.components["settlement-locations.yield"]?.stock ?? 0), 0);
      add(BuildCommands.deliver, `给工地送${RIVER_TERRACE_PACK.resourceLabels[resourceId]}（还差 ${n}）`, { resourceId, amount: 1 }, stocks > 0 ? "" : "公共库存没有这份材料，先去采集", 0);
    }
    add(BuildCommands.work, `搭建${board.site.name}（人工 ${board.site.labour}/${board.site.labourDays}）`, {},
      board.site.labour >= board.site.labourDays - 1 && Object.keys(board.site.missing).length ? "先备齐剩余材料" :
      currentSite(world)?.lastWorkedAt === world.tick ? "今天已经在这处干过，明天再来" : "", 2);
    add(BuildCommands.abandon, "暂时停工，退回材料", {}, "", 0);
  }
  return actions;
}
export function lifeRoutesOf(sim: Simulation, actorId: string) {
  const world = sim.worldView(), s = homestead(world, actorId);
  if (!s.exists) return null;
  const at = occupiedPlaceId(world, actorId);
  const move = (placeId: string, label: string): Action => {
    const source = s.actions.find(a => a.id === SettlementCommands.arrive && a.payload.placeId === placeId);
    return source ? { ...source, label } : { id: SettlementCommands.arrive, label, payload: { placeId }, enabled: false, reason: "现在到不了这个地方", days: 0 };
  };
  const matching = (re: RegExp) => s.actions.filter(a => re.test(`${a.label} ${a.hint}`)).slice(0, 3);
  const routes = [
    { id: "food", title: "农事与饮食", text: "留种、备粮、加工食物；照顾自家，也决定有多少能分给邻居。",
      actions: /field|hearth/.test(at) ? matching(/播种|照料|收割|煮|磨|烤/) : [move("place:field", "去田边看看农事"), move("place:hearth-yard", "去公灶做些吃的")] },
    { id: "textile", title: "纺织与衣物", text: "从芦苇和麻纤维到绳、布与衣；做给自己，或拿去交换、帮助别人。",
      actions: /weaving|reedbed/.test(at) ? matching(/织|编|纺|绳|纤维/) : [move("place:weaving-shed", "去织棚学做衣物"), move("place:reedbed", "去芦苇滩备纤维")] },
    { id: "housing", title: "建造与家庭", text: "修屋顶、备材料、搭一间土屋。住处真的增加，家人接着过日子。",
      actions: at === "place:yard" ? buildingActions(sim, actorId).slice(0, 4) : [move("place:yard", "回庭院安排修屋与建房")] },
    { id: "travel", title: "远行与交换", text: "带着口粮去渡口和集市；物资、见闻与同行的人，都可能带来下一次合作。",
      actions: [move("place:ford", "去渡口寻找交换与出行机会"), move("place:market", "去集市看看各家需要什么")] },
  ];
  const travel = project(sim, "travel.destinations", actorId);
  for (const d of travel?.destinations ?? []) if (d.enabled !== false) routes[3]!.actions.push({
    id: "travel.depart", label: `远行去${d.name ?? d.label}`, payload: { to: d.id },
    enabled: true, reason: "", days: d.days ?? 1,
  });
  const improvement = improvementView(world, actorId);
  if (improvement.stage === "idea") {
    improvement.text += " 木料去栗林取，草绳去芦苇滩搓，石料去石滩取。";
    for (const [id, label] of [["place:chestnut-wood", "去栗林取桔槔木料"], ["place:reedbed", "去芦苇滩搓桔槔草绳"], ["place:stone-beach", "去石滩取桔槔配重"]]) {
      if (at !== id) improvement.actions.push(move(id!, label!) as never);
    }
  }
  if (!["available", "cancelled", "installed"].includes(improvement.stage) && at !== "place:river") improvement.actions.push(move("place:river", "去河边试做与安装桔槔") as never);
  return { routes, improvement, buildings: buildingActions(sim, actorId),
    development: "本村的进步来自真实的工具、住处与师承；朝代是更大世界的历史背景。" };
}
export function isBuildingAction(type: string): boolean { return Object.values(BuildCommands).includes(type as never); }
export function lifeDecision(sim: Simulation, me: string): string {
  const stories = project(sim, "village-stories.journal", me);
  return stories?.incident && !stories.incident.resolved ? "有一件生活里的事需要你拿主意。" : "";
}
export function runBuildingAction(sim: Simulation, me: string, type: string, payload: Record<string, any>) {
  const offered = buildingActions(sim, me).find(a => a.id === type && (type !== BuildCommands.plan || a.payload.blueprintId === payload.blueprintId)
    && (type !== BuildCommands.deliver || a.payload.resourceId === payload.resourceId));
  if (!offered?.enabled) return { ok: false, errors: [{ code: "E_BUILD_BLOCKED", message: offered?.reason ?? "现在不能进行这项建造" }] };
  // Build's own command settles its activity and stock costs in one transaction.
  return sim.dispatch({ type, actorId: me, source: "player", payload: type === BuildCommands.work ? {} : offered.payload });
}
