/**
 * 远行：离开聚落去别的地方。
 *
 * 在此之前，地图包只是「世界资料」——40 个地点写在 YAML 里，但你走不过去。
 * 这个模块让它们真的能去：
 *
 *  - 出发：从当前聚落出发，沿 edges 走到另一个地点
 *  - 路上：按距离花时间，可能遇到事（由内容包定义）
 *  - 到达：到另一个地点，能看、能采、能见人
 *  - 回来：沿原路或另一条路回来
 *
 * 远行不是瞬移：路上要花天数，天数由距离和路况决定。
 */
import type { JsonValue } from "@openlife/contracts";

/** 一条路线：从 A 到 B，怎么走，花几天。 */
export interface Route {
  from: string;
  to: string;
  /** 花几天：由距离和路况决定。 */
  days: number;
  /** 路况：river / road / mountain / marsh。 */
  terrain: "river" | "road" | "mountain" | "marsh";
  /** 路上可能遇到的事。 */
  encounters: string[];
}

/** 一次远行：谁在去哪里的路上。 */
export interface Journey {
  id: string;
  who: string;
  from: string;
  to: string;
  /** 出发于何时。 */
  departedAt: number;
  /** 还要几天到。 */
  daysLeft: number;
  /** 走的哪条路线。 */
  route: Route;
  /** 已经遇到的事。 */
  encounters: string[];
}

/** 一个地点：能去、能看、能采、能见人。 */
export interface Destination {
  id: string;
  name: string;
  /** 有什么可采的。 */
  yields: string[];
  /** 有谁在。 */
  people: string[];
  /** 有什么可看的。 */
  sights: string[];
  /** 危险程度 0..1。 */
  danger: number;
}

/** 一条路线花几天。 */
export function routeDays(
  distance: number,
  terrain: "river" | "road" | "mountain" | "marsh",
): number {
  const base = Math.max(1, Math.ceil(distance / 2));
  const byTerrain = terrain === "river" ? 0.4 : terrain === "road" ? 1 : terrain === "mountain" ? 2 : 1.5;
  return Math.max(1, Math.floor(base * byTerrain + 0.5));
}

/** 从 A 到 B 有没有路。 */
export function routeExists(
  edges: ReadonlyArray<{ from: string; to: string; terrain?: string }>,
  from: string,
  to: string,
): boolean {
  return edges.some((e) =>
    (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
}

/**
 * 地图上的难度倍率怎么读成路况。
 *
 * 地图包只写 terrain_cost（1.0 河湾、1.6 进大泽、2.3 沉木林），用来说「这段路
 * 有多难走」；远行要的是「这一路会遇到什么」，所以按同一把尺子折算成路况。
 * 分档写在同一个地方，地图包换数值时段落不会被拆成两处。
 */
export function terrainFor(terrainCost: number): Route["terrain"] {
  if (!(terrainCost > 0)) return "road";
  if (terrainCost <= 1.15) return "river";
  if (terrainCost < 1.8) return "road";
  if (terrainCost < 2.1) return "marsh";
  return "mountain";
}

/**
 * 找一条从 A 到 B 的路线。
 *
 * 距离用地图包写的那条边，不用常数：`edges` 里每一条本来就带着 distance 与
 * terrain_cost，写死 `distance = 1` 会让「去大泽」和「去隔壁渡口」都花一天。
 */
export function findRoute(
  edges: ReadonlyArray<{ from: string; to: string; terrain?: string; distance?: number; terrainCost?: number }>,
  from: string,
  to: string,
): Route | null {
  const edge = edges.find((e) =>
    (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
  if (!edge) return null;
  const terrain = (edge.terrain as Route["terrain"]) ?? terrainFor(Number(edge.terrainCost ?? 1));
  const distance = Number(edge.distance ?? 1);
  return {
    from,
    to,
    days: routeDays(distance, terrain),
    terrain,
    encounters: [],
  };
}

/** 一天过去，远行的状态怎么变。 */
export function journeyDay(
  journey: Journey,
  encounter: string | null,
): Journey {
  const next = { ...journey, daysLeft: Math.max(0, journey.daysLeft - 1) };
  if (encounter) next.encounters = [...next.encounters, encounter];
  return next;
}

/** 到没到。 */
export function journeyArrived(journey: Journey): boolean {
  return journey.daysLeft <= 0;
}

/** 路上可能遇到的事，按地形给。 */
export function encounterFor(
  terrain: Route["terrain"],
  keyed: (purpose: string, ...parts: Array<string | number>) => { chance(p: number): boolean; nextFloat(): number },
): string | null {
  const chance = terrain === "mountain" ? 0.3 : terrain === "marsh" ? 0.25 : 0.1;
  if (!keyed("encounter", terrain).chance(chance)) return null;
  const table: Record<Route["terrain"], string[]> = {
    river: ["遇上一个摆渡的", "水涨了，等了一日"],
    road: ["遇上一队赶集的", "歇脚时听了一段故事"],
    mountain: ["遇上一只野兽", "迷了路，多走了一日"],
    marsh: ["陷进泥里，费了半天劲", "遇上一个采苇的"],
  };
  const pool = table[terrain];
  // chance(1) 永远返回 true（布尔），乘上长度要么 NaN 要么越界，所以这里必须用
  // nextFloat()：路上遇到什么事是抽的，不是判的。
  return pool[Math.floor(keyed("encounter", terrain, "which").nextFloat() * pool.length)] ?? null;
}

/** 远行的可读描述。 */
export function describeJourney(journey: Journey, name?: string): string {
  const to = name ?? journey.to;
  if (journeyArrived(journey)) return `到了${to}。`;
  return `往${to}去，还有${journey.daysLeft}天。`;
}
