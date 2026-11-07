/**
 * 矿藏与资源分布：铜、锡、铁、煤、盐、燧石、好陶土长在哪里。
 *
 * 在此之前，科技不受地理约束——哪里都能炼铜。开发文档 A4 要修的就是这个：
 *  - 每个地理格有矿藏标签和丰度
 *  - 生成时受岩性和水系约束，同一个种子结果固定
 *  - inventions.json 的 requires 新增 materials: ["deposit:copper"]
 *  - 只要聚落周围（半径可配）有这种矿，或者有贸易路线能运来，就满足
 *
 * 矿藏是**规则包**的事：标签名、生成规则、约束逻辑。内容包只管外观与文字。
 */
import type { JsonValue } from "@openlife/contracts";

/** 一处矿藏：地理格里的资源点。 */
export interface Deposit {
  id: string;
  /** 矿藏标签，如 deposit:copper、deposit:coal。 */
  tag: string;
  /** 地理格坐标。 */
  x: number;
  y: number;
  /** 丰度 0..1：越富越容易采。 */
  richness: number;
  /** 生成的理由（岩性、水系），用于解释"为什么这里有"。 */
  why: string;
}

/** 一张矿藏图：一个世界里所有矿藏的集合。 */
export interface DepositMap {
  deposits: Deposit[];
  /** 由什么生成，用于解释。 */
  geology: string;
}

/** 一个政体周围有没有某种矿。 */
export function hasDeposit(
  map: DepositMap,
  tag: string,
  x: number,
  y: number,
  radius = 3,
): boolean {
  return map.deposits.some((d) =>
    d.tag === tag && Math.abs(d.x - x) + Math.abs(d.y - y) <= radius,
  );
}

/** 一个政体周围的矿藏。 */
export function depositsNear(
  map: DepositMap,
  x: number,
  y: number,
  radius = 3,
): Deposit[] {
  return map.deposits.filter((d) =>
    Math.abs(d.x - x) + Math.abs(d.y - y) <= radius,
  );
}

/**
 * 用确定性键控流生成一张矿藏图。
 *
 * 生成规则（受岩性和水系约束）：
 *  - 铜：山岭与河流交汇处（岩性=变质岩，水系=有河）
 *  - 锡：山岭（岩性=花岗岩）
 *  - 铁：山岭与沼泽（岩性=沉积岩，水系=有沼泽）
 *  - 煤：盆地与湖岸（岩性=沉积岩）
 *  - 盐：盐湖与海岸（水系=咸水）
 *  - 燧石：河岸与台地（岩性=石灰岩）
 *  - 好陶土：河岸与台地（岩性=黏土层）
 *
 * 同一个种子结果固定：键是 (deposit, tag, x, y)，与生成顺序无关。
 */
export function generateDeposits(
  width: number,
  height: number,
  keyed: (purpose: string, ...parts: Array<string | number>) => { chance(p: number): boolean; nextFloat(): number },
): DepositMap {
  const deposits: Deposit[] = [];
  const geology = "岩性: 变质岩/花岗岩/沉积岩/石灰岩/黏土层；水系: 河/沼泽/盐湖/海岸";

  const add = (tag: string, x: number, y: number, richness: number, why: string) => {
    deposits.push({ id: `deposit:${tag}:${x}:${y}`, tag, x, y, richness, why });
  };

  // 铜：山岭与河流交汇处
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isHighland = (x + y) % 3 === 0;
      const hasRiver = y % 2 === 0;
      if (isHighland && hasRiver && keyed("deposit", "copper", x, y).chance(0.15)) {
        add("deposit:copper", x, y, keyed("richness", "copper", x, y).nextFloat(), "变质岩层遇水析出");
      }
    }
  }

  // 锡：山岭
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isHighland = (x + y) % 4 === 0;
      if (isHighland && keyed("deposit", "tin", x, y).chance(0.1)) {
        add("deposit:tin", x, y, keyed("richness", "tin", x, y).nextFloat(), "花岗岩脉含锡石");
      }
    }
  }

  // 铁：山岭与沼泽
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isHighland = (x + y) % 3 === 1;
      const hasMarsh = y % 3 === 0;
      if (isHighland && hasMarsh && keyed("deposit", "iron", x, y).chance(0.12)) {
        add("deposit:iron-ore", x, y, keyed("richness", "iron", x, y).nextFloat(), "沉积岩层夹褐铁矿");
      }
    }
  }

  // 煤：盆地与湖岸
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isBasin = (x + y) % 4 === 2;
      const hasLake = y % 4 === 1;
      if (isBasin && hasLake && keyed("deposit", "coal", x, y).chance(0.1)) {
        add("deposit:coal", x, y, keyed("richness", "coal", x, y).nextFloat(), "古湖沼淤积成煤");
      }
    }
  }

  // 盐：盐湖与海岸
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isSaltLake = (x + y) % 5 === 0;
      const isCoast = y === height - 1;
      if ((isSaltLake || isCoast) && keyed("deposit", "salt", x, y).chance(0.2)) {
        add("deposit:salt", x, y, keyed("richness", "salt", x, y).nextFloat(), "咸水蒸发结晶");
      }
    }
  }

  // 燧石：河岸与台地
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isRiverBank = y % 2 === 0;
      const isTerrace = (x + y) % 3 === 2;
      if ((isRiverBank || isTerrace) && keyed("deposit", "flint", x, y).chance(0.15)) {
        add("deposit:flint", x, y, keyed("richness", "flint", x, y).nextFloat(), "石灰岩结核燧石");
      }
    }
  }

  // 好陶土：河岸与台地
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const isRiverBank = y % 2 === 0;
      if (isRiverBank && keyed("deposit", "clay", x, y).chance(0.25)) {
        add("deposit:good-clay", x, y, keyed("richness", "clay", x, y).nextFloat(), "河岸冲积黏土");
      }
    }
  }

  return { deposits, geology };
}

/**
 * 一项发明的材料门槛：周围有没有这种矿，或者有贸易路线能运来。
 *
 * 这是 A4.2 的验收标准：附近没有铜也没有铜的贸易路线的村子，永远造不出
 * copper-smelting。有了贸易路线以后，造得出，但晚于产地。
 */
export function meetsDepositRequirement(
  map: DepositMap,
  requiredTag: string,
  x: number,
  y: number,
  radius: number,
  tradeRoutes: ReadonlySet<string> = new Set(),
): boolean {
  if (hasDeposit(map, requiredTag, x, y, radius)) return true;
  // 贸易路线：只要有一条路线连着有矿的地方，就能运来。
  return tradeRoutes.has(requiredTag);
}

/** 一项发明在政体 B 那边，缺什么料。 */
export function missingDeposit(
  map: DepositMap,
  requiredTag: string,
  x: number,
  y: number,
  radius: number,
  tradeRoutes: ReadonlySet<string> = new Set(),
): string | null {
  if (meetsDepositRequirement(map, requiredTag, x, y, radius, tradeRoutes)) return null;
  return requiredTag;
}

/** 矿藏图的可读描述（给村史和玩家看）。 */
export function describeDeposits(map: DepositMap, x: number, y: number, radius = 3): string {
  const near = depositsNear(map, x, y, radius);
  if (!near.length) return "周围没有什么值得挖的。";
  const names: Record<string, string> = {
    "deposit:copper": "铜", "deposit:tin": "锡", "deposit:iron-ore": "铁",
    "deposit:coal": "煤", "deposit:salt": "盐", "deposit:flint": "燧石",
    "deposit:good-clay": "好陶土",
  };
  const list = near.map((d) => names[d.tag] ?? d.tag).join("、");
  return `周围有${list}。`;
}

/** 矿藏标签到发明材料名的映射（A4.1）。 */
export const DEPOSIT_TO_MATERIAL: Record<string, string> = {
  "deposit:copper": "resource:copper-ore",
  "deposit:tin": "resource:tin",
  "deposit:iron-ore": "resource:iron-ore",
  "deposit:coal": "resource:coal",
  "deposit:salt": "resource:salt",
  "deposit:flint": "resource:flint",
  "deposit:good-clay": "resource:clay",
};

/** 发明材料名到矿藏标签的映射。 */
export const MATERIAL_TO_DEPOSIT: Record<string, string> = Object.fromEntries(
  Object.entries(DEPOSIT_TO_MATERIAL).map(([k, v]) => [v, k]),
);
