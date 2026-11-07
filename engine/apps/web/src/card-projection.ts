import type { EngineWebState } from "../server.ts";

type Action = {
  id: string; label: string; enabled?: boolean; reason?: string; hint?: string;
  payload?: Record<string, unknown>; activityCost?: number; cost?: number; days?: number;
};

type Settlement = {
  characterInSettlement?: boolean; placeId?: string; placeName?: string; spaceName?: string;
  day?: number; season?: string; hunger?: number;
  dailyActivity?: { used: number; remaining: number; capacity: number };
  dailyPlan?: { revision: number };
  weather?: { sky: string; note?: string };
  neighbours?: { id: string; name: string; placeId: string; acquaintance: string }[];
  carried?: { resourceId: string; label: string; count: number; unit: string }[];
  actions?: Action[];
  nature?: { actions?: Action[] };
};

function isAction(value: unknown): value is Action {
  return Boolean(value && typeof value === "object" && "id" in value && typeof value.id === "string" &&
    "label" in value && typeof value.label === "string");
}

type Travel = {
  travelling?: boolean; away?: boolean; arrived?: boolean; toName?: string; here?: string; hereName?: string; line?: string;
  destinations?: { id: string; name: string; days?: number }[];
};

function travelActions(travel: Travel | null): Action[] {
  if (!travel) return [];
  if (travel.travelling) return [
    travel.arrived ? { id: "travel.arrive", label: "在" + (travel.toName || "这里") + "落脚" }
      : { id: "travel.day", label: "再走一天", days: 1 },
    { id: "travel.return", label: "往回走" },
  ];
  return (travel.destinations ?? []).map(({ id, name, days }) => ({
    id: "travel.depart", label: "出发去" + name, payload: { to: id }, days,
  }));
}

export function cardProjection(state: EngineWebState, revision: number) {
  const settlement = state.settlement as Settlement | null;
  const active = Boolean(settlement?.characterInSettlement && state.character?.alive);
  const { id, name, age, alive } = state.character ?? {};
  const travel = state.outlook.travel as Travel | null;
  const nearby = active && !travel?.travelling && !travel?.away ? (settlement?.neighbours ?? []).filter((person) => person.placeId === settlement?.placeId) : [];
  const unknownPeople = new Set((settlement?.neighbours ?? []).filter((person) => person.acquaintance === "stranger").map((person) => person.id));
  const villageActions = [...(settlement?.actions ?? []), ...(settlement?.nature?.actions ?? [])]
    .filter((action) => !unknownPeople.has(String(action.payload?.targetId)) || action.id === "settlement-locations.talk");
  const actions: readonly unknown[] = !alive ? state.actions : travel?.travelling || travel?.away ? travelActions(travel) :
    active ? [...villageActions, ...travelActions(travel)] : state.actions;
  return {
    tick: state.tick, revision,
    actor: id ? { id, name, age, alive } : null,
    generation: state.generation,
    day: settlement?.day ?? state.day,
    season: settlement?.season ?? "",
    weather: settlement?.weather?.sky ?? "",
    place: travel?.away ? { id: travel.here ?? "", name: travel.hereName ?? "", space: "" } :
      { id: settlement?.placeId ?? "", name: settlement?.placeName ?? "", space: settlement?.spaceName ?? "" },
    hunger: settlement?.hunger ?? null,
    activity: settlement?.dailyActivity ?? null,
    planRevision: settlement?.dailyPlan?.revision,
    people: nearby.map(({ id, name, acquaintance }) => ({ id, name, acquaintance })),
    travel: travel ? { line: travel.line, travelling: travel.travelling, destination: travel.toName } : null,
    carried: (settlement?.carried ?? []).map(({ resourceId, label, count, unit }) => ({ resourceId, label, count, unit })),
    actions: actions.filter(isAction).map(({ id, label, enabled, reason, hint, payload, activityCost, cost, days }: Action) => ({
      id, label, enabled: enabled !== false, reason, hint, payload, activityCost: activityCost ?? cost, days,
    })),
    save: { state: state.saveHealth.state, message: state.saveHealth.playerReason },
  };
}
