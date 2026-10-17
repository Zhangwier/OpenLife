/**
 * 聚合模式：tech 和 polity 的「按人群算」版本。
 *
 * 玩家村子按「个人」算——每个人的灵光、试做、传授都是一条命令。一个有几
 * 百人的邻村不能这么算，否则一年就是几百条命令，慢到不可用。
 *
 * 所以邻村按「人群」算：
 *  - 灵感次数 = 人口 × 平均洞察 × 需求强度
 *  - 掌握的发明是一个比例（0..1），不是一张清单
 *  - 失传 = 掌握人数降到 0
 *
 * 与玩家村子用**同一份数据**（inventions.json / institutions.json），
 * 只是算法粒度不同。这是开发文档 A3.1 的明确要求。
 */
import type { JsonValue } from "@openlife/contracts";
import type { Polity } from "./network.ts";

/** 一个政体的聚合状态。 */
export interface AggregateState {
  population: number;
  /** 掌握的发明 → 掌握人数比例 0..1。 */
  known: Record<string, number>;
  /** 采用的制度。 */
  institutions: string[];
  /** 平均洞察（0..1），由人口结构决定，一般 0.4-0.8。 */
  averageInsight: number;
}

/** 由聚落生成一个政体节点。 */
export function polityFromSettlement(
  id: string,
  name: string,
  x: number,
  y: number,
  population: number,
  known: Record<string, number> = {},
): Polity {
  return {
    id, name, x, y, population,
    known, institutions: [], relations: {}, grudges: {}, foundedAt: 0,
  };
}

/**
 * 用一张小地图生成一批政体。
 *
 * 邻居聚落是真实存在的（village-chronicle 的 neighbours），这里是把它们
 * 变成网络节点：给位置、给人口、给初始掌握的发明。
 */
export function seedPolities(
  centre: { name: string; x: number; y: number; population: number },
  neighbours: ReadonlyArray<{ name: string; x: number; y: number; population: number }>,
  keyed: (purpose: string, ...parts: Array<string | number>) => { nextInt(a: number, b: number): number },
): Polity[] {
  const out: Polity[] = [
    polityFromSettlement("polity:home", centre.name, centre.x, centre.y, centre.population),
  ];
  for (let i = 0; i < neighbours.length; i += 1) {
    const n = neighbours[i]!;
    out.push(polityFromSettlement(
      `polity:neighbour:${i}`,
      n.name,
      n.x,
      n.y,
      n.population,
    ));
  }
  void keyed;
  return out;
}

/**
 * 一个政体对一项发明的需求强度。
 *
 * 这是聚合版的「需要簿」：不是「谁被卡住了」，而是「这个政体有多需要它」。
 * 取决于它有没有前置、有没有对应的现实压力。
 */
export function aggregateNeed(
  polity: Polity,
  inventionId: string,
  inventionNeeds: (inventionId: string) => string[],
): number {
  if ((polity.known[inventionId] ?? 0) >= 0.5) return 0;
  const needs = inventionNeeds(inventionId);
  if (!needs.length) return 0.2;
  // 前置没有就没有需求——先得有铜才能想炼铜。
  return Math.min(1, 0.2 + needs.length * 0.3);
}

/** 一个政体的总人口里，会某项发明的人数。 */
export function holdersOf(polity: Polity, inventionId: string): number {
  return Math.round(polity.population * (polity.known[inventionId] ?? 0));
}

/**
 * 网络里掌握某项发明的总人口。
 *
 * 工业时代的「社群规模门槛」：不是本村有多少人，而是整个网络里有多少人会。
 * 例如蒸汽机需要网络里 2,000 个会冶铁的人加上煤（A4）。
 */
export function networkHolders(polities: readonly Polity[], inventionId: string): number {
  return polities.reduce((sum, p) => sum + holdersOf(p, inventionId), 0);
}

/**
 * 一项发明是否达到了工业门槛。
 *
 * 由「网络里掌握它的人数」决定，而不是本村人口。这样青铜、铁器、工业是
 * 网络演出来的结果，而不是一个村子自己跳过门槛。
 */
export function meetsIndustrialGate(
  polities: readonly Polity[],
  requiredInventionId: string,
  requiredHolders: number,
): boolean {
  return networkHolders(polities, requiredInventionId) >= requiredHolders;
}

/** 政体之间的人口流动：压力大的地方人往地广的地方迁。 */
export function migrate(
  polities: Polity[],
  keyed: (purpose: string, ...parts: Array<string | number>) => { chance(p: number): boolean },
): Array<{ type: string; data: Record<string, JsonValue> }> {
  const events: Array<{ type: string; data: Record<string, JsonValue> }> = [];
  const sorted = [...polities].sort((a, b) => a.id.localeCompare(b.id));
  const totalLand = sorted.reduce((n, p) => n + Math.max(1, 100 - p.population / 10), 0);

  for (const from of sorted) {
    const pressure = from.population / Math.max(1, from.population + 20);
    if (pressure < 0.7) continue;
    for (const to of sorted) {
      if (to.id === from.id) continue;
      const room = Math.max(0, 100 - to.population / 10) / Math.max(1, totalLand);
      if (room <= 0) continue;
      const chance = pressure * room * 0.3;
      if (keyed("migrate", from.id, to.id, from.population).chance(chance)) {
        const moved = Math.max(1, Math.round(from.population * 0.05));
        from.population = Math.max(2, from.population - moved);
        to.population += moved;
        events.push({
          type: "civilization.migrated",
          data: { from: from.id, to: to.id, count: moved },
        });
      }
    }
  }
  return events;
}
