/**
 * 文明层：多政体、传播、交流与冲突。
 *
 * 在此之前，青铜、铁器、工业是靠一个「社群规模」门槛凑出来的——一个村子
 * 自己长大，越过人数线就跳进下一个时代。那张「聚落网络」其实一直存在，
 * 只是没被演出来。
 *
 * 这个文件管的是网络本身：
 *  - 政体实体 `polity:<id>`：位置、人口、聚合科技（会的发明 → 掌握人数比例）、
 *    聚合制度、对外关系。
 *  - 联系网络：政体之间按距离、河流、道路算联系强度，每年更新。
 *  - 传播：一项发明从 A 传到 B 的年概率 = 联系强度 × B 对这项发明的需求强度。
 *
 * 设计要点（开发文档 A3.1）：
 *  - 聚合模式：对一个政体按「人群」而不是「个人」计算，灵感次数 = 人口 ×
 *    平均洞察 × 需求强度；失传 = 掌握人数降到 0。与玩家村子用同一份数据
 *    （inventions.json / institutions.json），只是算法粒度不同。
 *  - 玩家村子是网络中的一个节点：精细层时用个人模式，粗略层时用聚合模式。
 *  - 全部用键控随机（A2），键是 (module, purpose, year, polityId)。
 */
import type { JsonValue } from "@openlife/contracts";

/** 一个政体：网络中的一个节点。 */
export interface Polity {
  id: string;
  name: string;
  /** 地理格坐标（粗粒度，用于算距离）。 */
  x: number;
  y: number;
  /** 人口。 */
  population: number;
  /** 掌握的发明 → 掌握人数比例 0..1。 */
  known: Record<string, number>;
  /** 采用的制度 id。 */
  institutions: string[];
  /** 与其他政体的关系：friendly / neutral / hostile。 */
  relations: Record<string, "friendly" | "neutral" | "hostile">;
  /** 政体级的仇恨（旧怨），驱动袭扰。 */
  grudges: Record<string, number>;
  /** 诞生年。 */
  foundedAt: number;
  /** 被征服后向谁纳贡（institution:tribute）。 */
  tributaryOf?: string;
}

/** 两个政体之间的一年的联系记录。 */
export interface Contact {
  a: string;
  b: string;
  /** 0..1，越高越密。 */
  strength: number;
  /** 距离（地理格）。 */
  distance: number;
  /** 是否有河流或道路相连。 */
  via: "river" | "road" | "plain";
}

/** 一次传播：一项发明从一个政体传到另一个。 */
export interface Diffusion {
  inventionId: string;
  from: string;
  to: string;
  year: number;
  /** 这次传播建立的关系是不是新的贸易路线。 */
  becomesRoute: boolean;
}

/**
 * 两个政体之间的地理距离。
 *
 * 用曼哈顿距离而不是欧氏距离：网格世界里，沿河走和翻山是两种不同的难。
 */
export function distanceOf(a: Polity, b: Polity): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * 一条联系有多强。
 *
 * 强度由距离和通道决定：越近越强；有河或有路比翻山强。
 * 关系也影响：友好加一分，敌对减一分。
 */
export function contactStrength(a: Polity, b: Polity, via: "river" | "road" | "plain" = "plain"): number {
  const dist = distanceOf(a, b);
  if (dist === 0) return 1;
  const byDist = 1 / (1 + dist);
  const byVia = via === "river" ? 1.5 : via === "road" ? 1.25 : 1;
  const byRelation = a.relations[b.id] === "friendly" || b.relations[a.id] === "friendly" ? 1.2
    : a.relations[b.id] === "hostile" || b.relations[a.id] === "hostile" ? 0.6
    : 1;
  return Math.min(1, byDist * byVia * byRelation);
}

/**
 * 一项发明从一个政体传到另一个的年概率。
 *
 * = 联系强度 × B 对这项发明的需求强度。
 *
 * 需求强度是一个政体「有多想要它」：取决于它有没有这项发明的前置、有没有
 * 对应的需要（由 tech 的需要簿决定）。没有需求的发明传不动。
 */
export function diffusionChance(
  contact: Contact,
  needStrength: number,
): number {
  return contact.strength * Math.max(0, Math.min(1, needStrength));
}

/**
 * 一年里，整个网络里所有政体两两之间的联系。
 *
 * 按 id 稳定排序，保证同一组政体每年得到同一张网络——这是确定性的一部分。
 */
export function contactNetwork(polities: readonly Polity[]): Contact[] {
  const out: Contact[] = [];
  const sorted = [...polities].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i]!, b = sorted[j]!;
      const via = a.x === b.x || a.y === b.y ? "river" : "plain";
      const strength = contactStrength(a, b, via);
      if (strength > 0.01) {
        out.push({ a: a.id, b: b.id, strength, distance: distanceOf(a, b), via });
      }
    }
  }
  return out;
}

/**
 * 一项发明在政体 B 那边的需求强度。
 *
 * 需求强度 = B 缺它的程度 × B 用得上它的程度。
 * 已经有它就没有需求；没有它的前置就没有需求。
 *
 * `materialAvailable` 是材料门槛：附近没有必需矿藏、又没有贸易路线，需求就是 0。
 * 这个参数必须存在，否则「炼铜」会从有铜的村子沿着联系传进没铜的村子——
 * 扩散路径和自主发明路径用的是同一份材料事实，不能只在其中一条上查。
 */
export function needStrength(
  inventionId: string,
  polity: Polity,
  inventionNeeds: (inventionId: string) => string[],
  materialAvailable = true,
): number {
  if (!materialAvailable) return 0;
  if ((polity.known[inventionId] ?? 0) >= 0.5) return 0;        // already widespread
  const needs = inventionNeeds(inventionId);
  if (!needs.length) return 0.2;                                // a curiosity, weak pull
  return Math.min(1, 0.2 + needs.length * 0.3);
}

/** 一个政体一年里的科技增量（聚合模式）。 */
export interface AggregateStep {
  polityId: string;
  /** 这一年新掌握的发明 → 掌握人数比例增量。 */
  learned: Record<string, number>;
  /** 这一年发生的事件。 */
  events: Array<{ type: string; data: Record<string, JsonValue> }>;
}

/**
 * 一个政体一年里的聚合计算。
 *
 * 灵感次数 = 人口 × 平均洞察 × 需求强度。
 * 掌握人数涨：灵光 × 试做成功率；跌：掌握人数降到 0 就失传。
 */
export function aggregateYear(
  polity: Polity,
  year: number,
  inventions: ReadonlyArray<{ id: string; answers: string[]; difficulty: number }>,
  needs: Record<string, number>,
  rng: { nextFloat(): number; chance(p: number): boolean },
): AggregateStep {
  const learned: Record<string, number> = {};
  const events: AggregateStep["events"] = [];

  // 聚合模式：按人群算，不按个人算。
  for (const invention of inventions) {
    const have = polity.known[invention.id] ?? 0;
    if (have >= 0.95) continue;                                 // already universal
    const need = needs[invention.id] ?? 0;
    if (need <= 0 && rng.nextFloat() > 0.05) continue;          // no pull, rarely pursued

    // 灵感次数 = 人口 × 平均洞察(0.6) × 需求强度
    const sparks = polity.population * 0.6 * Math.max(need, 0.05);
    const difficultyFactor = 0.5 ** ((invention.difficulty - 20) / 15);
    const chance = Math.min(0.9, sparks * 0.001 * difficultyFactor);

    if (rng.chance(chance)) {
      const gain = have < 0.1 ? 0.15 : 0.05;
      const next = Math.min(1, have + gain);
      learned[invention.id] = next;
      if (have === 0 && next > 0) {
        events.push({
          type: "civilization.invented",
          data: { polityId: polity.id, inventionId: invention.id, year },
        });
      }
    } else if (have > 0 && have < 0.05 && rng.chance(0.1)) {
      // 掌握人数降到接近 0：失传。
      learned[invention.id] = 0;
      events.push({
        type: "civilization.lost",
        data: { polityId: polity.id, inventionId: invention.id, year },
      });
    }
  }

  return { polityId: polity.id, learned, events };
}

/** 政体集合的一年：先各自长，再互相传。 */
export interface CivilizationYear {
  polities: Polity[];
  diffusions: Diffusion[];
  events: Array<{ type: string; data: Record<string, JsonValue> }>;
}

/**
 * 整个网络的一年。
 *
 * 顺序固定，保证确定性：
 *  1. 每个政体按聚合模式自己长
 *  2. 按联系网络把发明从 A 传到 B
 *  3. 更新联系强度
 */
export function civilizationYear(
  polities: readonly Polity[],
  year: number,
  inventions: ReadonlyArray<{ id: string; answers: string[]; difficulty: number }>,
  needFor: (polityId: string, inventionId: string) => number,
  inventionNeeds: (inventionId: string) => string[],
  rng: { nextFloat(): number; chance(p: number): boolean },
  keyed: (purpose: string, ...parts: Array<string | number>) => { nextFloat(): number; chance(p: number): boolean },
  /**
   * A4 材料门槛，与自主发明共用同一条事实：附近没有必需矿藏且没有贸易路线，
   * 这个政体就学不走也传不进这项发明。默认全部可用（不装矿藏模块时行为不变）。
   */
  materialOk: (polityId: string, inventionId: string) => boolean = () => true,
): CivilizationYear {
  const events: CivilizationYear["events"] = [];
  const diffusions: Diffusion[] = [];

  // 1. Each polity grows on its own, in a stable order.
  const grown = polities.map((polity) => {
    const step = aggregateYear(
      polity,
      year,
      inventions,
      Object.fromEntries(inventions.map((i) => [i.id, needFor(polity.id, i.id)])),
      keyed("aggregate", year, polity.id),
    );
    events.push(...step.events);
    return {
      ...polity,
      known: { ...polity.known, ...step.learned },
    };
  });

  // 2. Diffusion across the network, also in a stable order.
  const contacts = contactNetwork(grown);
  for (const contact of contacts) {
    const a = grown.find((p) => p.id === contact.a)!;
    const b = grown.find((p) => p.id === contact.b)!;
    for (const invention of inventions) {
      const haveA = a.known[invention.id] ?? 0;
      const haveB = b.known[invention.id] ?? 0;
      if (haveA >= 0.3 && haveB < haveA - 0.1) {
        // A4: a polity without the deposit (and without a trade route) cannot
        // take the invention in, however close the neighbour is. The gate has
        // to sit on this path too, not just on a polity's own year — otherwise
        // copper smelting walks into a village that has no copper.
        const need = needStrength(invention.id, b, inventionNeeds, materialOk(b.id, invention.id));
        const chance = diffusionChance(contact, need);
        if (keyed("diffusion", year, contact.a, contact.b, invention.id).chance(chance)) {
          b.known[invention.id] = Math.min(haveA, haveB + 0.1);
          diffusions.push({
            inventionId: invention.id,
            from: a.id,
            to: b.id,
            year,
            becomesRoute: false,
          });
          events.push({
            type: "civilization.diffused",
            data: { inventionId: invention.id, from: a.id, to: b.id, year },
          });
        }
      }
    }
  }

  return { polities: grown, diffusions, events };
}
