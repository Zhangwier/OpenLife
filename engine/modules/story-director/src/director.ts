/**
 * 叙事者的节拍（纯逻辑，不碰世界、不读组件）。
 *
 * 为什么要有这一层：张力怎么涨、什么时候该出事，是可以脱离世界单独推演的
 * 规则。把它写成纯函数，验收测试就能用假输入跑十年的节拍分布，而不用真的
 * 建一个村子；模块本体只负责"从世界读出输入、把决定写回去"。
 *
 * 三段式（对应 docs/plans/EXPANSION_PLAN_2026-10.md §5.1）：
 *
 *   每天涨一点张力 → 张力决定今天能投放哪一档 → 投放之后松一口气
 *
 * 关键取舍：张力**只在出事之后回落**。所以平静本身会积累压力，玩家不必
 * 盯着一个看不见的数字，也能感觉到"村里该出点事了"。
 */

export type StoryMode = "gentle" | "rhythmic" | "chaotic";
export type StoryTier = "ambient" | "minor" | "conflict" | "crisis";

export const STORY_TIERS: readonly StoryTier[] = ["ambient", "minor", "conflict", "crisis"];
export const STORY_MODES: readonly StoryMode[] = ["gentle", "rhythmic", "chaotic"];

export interface BandSpec {
  /** 张力低于此值就落在这个段（最后一段用 Infinity）。 */
  below: number;
  /** 这个段落每天投放一件事的基础概率。 */
  chance: number;
  /** 这个段落能投放的档位与权重。 */
  weights: Partial<Record<StoryTier, number>>;
}

export interface ModeSpec {
  label: string;
  /** 平静的一天让弦紧多少（张力越高涨得越快，见 tensionGain）。 */
  calmGain: number;
  /** 两次投放之间至少隔几天：避免一天一件事，把日子过成流水账。 */
  minGapDays: number;
  /** 投放概率的缩放（同一个张力段，不同模式的出手频率不同）。 */
  chanceScale: number;
  /** 天意难测：有几成几率把段落压下一档（高张力也可能只是件小事）。 */
  shiftChance: number;
  /**
   * 一场冲突之后气消多少（区间）。**不是清零**：
   * 吵完架根还在，所以冲突只卸掉一部分压力，村子才可能一路紧到危机。
   */
  conflictRelief: readonly [number, number];
  /** 危机之后的"喘息"：张力整个落回这个区间。 */
  breath: readonly [number, number];
}

/**
 * 三个模式。数值不是随手写的：
 * - 细水长流涨得慢、间隔长，中段一次冲突卸掉的压力就足以压住增长，
 *   所以它几乎走不到 crisis；
 * - 起起落落在中段涨得比松弛快、在高段松弛比增长快，张力在 60–85 之间
 *   来回摆，偶尔越线出一次危机——这就是"起起落落"；
 * - 天意难测涨得最快、段落还会被压下来，于是同一段张力下玩家猜不到会出什么。
 */
export const MODES: Record<StoryMode, ModeSpec> = {
  gentle: {
    label: "细水长流",
    calmGain: 1,
    minGapDays: 4,
    chanceScale: 0.7,
    shiftChance: 0,
    conflictRelief: [12, 20],
    breath: [8, 18],
  },
  rhythmic: {
    label: "起起落落",
    calmGain: 2,
    minGapDays: 3,
    chanceScale: 1,
    shiftChance: 0,
    conflictRelief: [10, 15],
    breath: [10, 30],
  },
  chaotic: {
    label: "天意难测",
    calmGain: 3,
    minGapDays: 1,
    chanceScale: 1.3,
    shiftChance: 0.2,
    conflictRelief: [4, 10],
    breath: [12, 34],
  },
};

/** 张力段落。顺序即优先级：第一个 `tension < below` 的段落生效。 */
export const BANDS: readonly BandSpec[] = [
  { below: 25, chance: 0.08, weights: { ambient: 3, minor: 1 } },
  { below: 60, chance: 0.3, weights: { minor: 2, conflict: 1 } },
  { below: 85, chance: 0.6, weights: { conflict: 1 } },
  { below: Number.POSITIVE_INFINITY, chance: 1, weights: { crisis: 1 } },
];

export const DIRECTOR_TUNING = {
  start: 20,
  max: 100,
  /**
   * 多久没出事就必须强行给一件。
   *
   * 定位文档要求"每天必须有一条可见反馈"，而叙事者负责的那条是"村里有事情"。
   * 概率再低也不能让玩家连续一个月对着一个没动静的村子，所以这里有一条硬线：
   * 超过这个天数，当天一定投放（档位仍受张力段落约束）。
   */
  forceSilenceDays: 25,
  /** 两次 crisis 之间至少隔这么多天：喘口气，别把灾难排成一串。 */
  crisisGapDays: 10,
  /** 最近保留多少个事件的档位与 id（给投影与调试看）。 */
  recentLimit: 8,
  /** 后续事件队列最多积压多少条。 */
  pendingLimit: 24,
} as const;

/** 张力输入：全部来自世界，读不到就是 0 / null（模块没装）。 */
export interface TensionInputs {
  hazard: "none" | "omen" | "active";
  /** 存粮够全村吃几天；null = 看不出来（没装聚落模块）。 */
  foodDays: number | null;
  /** 村里未解决的怨气总量（各人 intensity 之和）。 */
  grievanceTotal: number;
  /** 世仇/死仇的条数。 */
  feuds: number;
}

export interface Rng {
  nextFloat(): number;
  nextInt(minInclusive: number, maxExclusive: number): number;
  chance(probability: number): boolean;
}

export function clampTension(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(DIRECTOR_TUNING.max, Math.round(value)));
}

/** 张力落在哪一段。 */
export function bandFor(tension: number): BandSpec {
  for (const band of BANDS) if (tension < band.below) return band;
  return BANDS[BANDS.length - 1]!;
}

/** 今天可能投放的档位与权重（天意难测会把段落压下一档）。 */
export function tierWeights(band: BandSpec, mode: StoryMode): Partial<Record<StoryTier, number>> {
  const spec = MODES[mode];
  if (spec.shiftChance <= 0) return band.weights;
  const index = BANDS.indexOf(band);
  if (index <= 0) return band.weights;
  // 只压一档：crisis 的一天也可能只是场冲突。压下来之后权重照旧。
  const lower = BANDS[index - 1]!;
  return { ...lower.weights, ...weightedShare(band.weights, 1 - spec.shiftChance) };
}

function weightedShare(
  weights: Partial<Record<StoryTier, number>>,
  scale: number,
): Partial<Record<StoryTier, number>> {
  const out: Partial<Record<StoryTier, number>> = {};
  for (const tier of STORY_TIERS) {
    const w = weights[tier];
    if (w) out[tier] = w * scale;
  }
  return out;
}

/** 这一段里最可能的那一档（给"下一个预计事件的 tier"用，不消耗随机数）。 */
export function likeliestTier(band: BandSpec, mode: StoryMode): StoryTier {
  const weights = tierWeights(band, mode);
  let best: StoryTier = "ambient";
  let bestWeight = -1;
  for (const tier of STORY_TIERS) {
    const w = weights[tier] ?? 0;
    // 同权重时取更高的档：宁可让玩家有准备，也不要把危机说成小事。
    if (w >= bestWeight && w > 0) { best = tier; bestWeight = w; }
  }
  return best;
}

export function pickTier(band: BandSpec, mode: StoryMode, rng: Rng): StoryTier {
  const weights = tierWeights(band, mode);
  const entries = STORY_TIERS.filter((tier) => (weights[tier] ?? 0) > 0);
  const total = entries.reduce((sum, tier) => sum + (weights[tier] ?? 0), 0);
  if (total <= 0) return likeliestTier(band, mode);
  let roll = rng.nextFloat() * total;
  for (const tier of entries) {
    roll -= weights[tier] ?? 0;
    if (roll < 0) return tier;
  }
  return entries[entries.length - 1] ?? "ambient";
}

export interface LandingInput {
  tension: number;
  mode: StoryMode;
  /** 距离上一个事件多少天。 */
  daysSinceEvent: number;
  /** 距离上一个 crisis 多少天（没有过就是 Infinity）。 */
  daysSinceCrisis: number;
}

export interface Landing {
  tier: StoryTier;
  /** 是不是被"太久没出事"这条硬线逼出来的。 */
  forced: boolean;
}

/**
 * 今天要不要出事、出哪一档。返回 null 表示今天平静。
 *
 * 顺序很重要：先判危机（张力越线必须给），再判硬线（太久没动静），
 * 最后才掷概率。这样"必投"永远压过"随机"，测试也就能断言间隔上界。
 */
export function rollLanding(input: LandingInput, rng: Rng): Landing | null {
  const band = bandFor(input.tension);
  if (input.tension > 85) {
    // 张力越线：今天一定要出大事。除非刚出过——那时张力已被压回喘息区间，
    // 这条分支本身就走不到；这里的判断是为了存档里手工改过张力时也不出错。
    if (input.daysSinceCrisis < DIRECTOR_TUNING.crisisGapDays) return null;
    return { tier: "crisis", forced: false };
  }
  if (input.daysSinceEvent >= DIRECTOR_TUNING.forceSilenceDays) {
    const tier = pickTier(band, input.mode, rng);
    // 硬线逼出来的事件不进 crisis：危机只能由张力越线触发。
    return { tier: tier === "crisis" ? "conflict" : tier, forced: true };
  }
  if (input.daysSinceEvent < MODES[input.mode].minGapDays) return null;
  const chance = Math.min(1, band.chance * MODES[input.mode].chanceScale);
  if (!rng.chance(chance)) return null;
  return { tier: pickTier(band, input.mode, rng), forced: false };
}

/**
 * 一天过去，张力涨多少。
 *
 * 为什么不是每天固定 +N：固定增长下，一场冲突卸掉的压力总是能被几天的平静
 * 追平，张力就永远在中段来回，走不到危机（实测三年零危机）。所以张力越高
 * 涨得越快——弦绷紧了，一点小事都更容易出事。这样"越安静越危险"才真的成立。
 */
export function tensionGain(tension: number, mode: StoryMode): number {
  const base = MODES[mode].calmGain;
  if (tension >= 85) return base + 3;
  if (tension >= 60) return base + 1;
  return base;
}

export function dailyTension(
  previous: number,
  inputs: TensionInputs,
  mode: StoryMode,
): { tension: number; causes: string[] } {
  const causes: string[] = [];
  const gain = tensionGain(previous, mode);
  let tension = previous + gain;
  causes.push(`calm+${gain}`);

  if (inputs.hazard === "active") {
    tension += 20;
    causes.push("hazard_active+20");
  } else if (inputs.hazard === "omen") {
    tension += 10;
    causes.push("hazard_omen+10");
  }

  if (inputs.foodDays !== null) {
    const add = inputs.foodDays < 10 ? 15 : inputs.foodDays < 20 ? 10 : inputs.foodDays < 30 ? 5 : 0;
    if (add > 0) {
      tension += add;
      causes.push(`food_short(${Math.round(inputs.foodDays)}d)+${add}`);
    }
  }

  const grudge = Math.min(10, inputs.grievanceTotal * 4) + Math.min(5, inputs.feuds * 2);
  if (grudge > 0) {
    tension += grudge;
    causes.push(`grudges+${Math.round(grudge)}`);
  }

  return { tension: clampTension(tension), causes };
}

/** 出事之后松多少：危机让整根弦松下来，冲突只卸掉一部分（根还在）。 */
export function reliefAfter(mode: StoryMode, tier: StoryTier, tension: number, rng: Rng): number {
  const spec = MODES[mode];
  if (tier === "crisis") return clampTension(rng.nextInt(spec.breath[0], spec.breath[1] + 1));
  if (tier === "conflict") {
    const relief = rng.nextInt(spec.conflictRelief[0], spec.conflictRelief[1] + 1);
    // 冲突之后也不低于喘息区间的下沿：吵完架总要缓几天。
    return clampTension(Math.max(spec.breath[0], tension - relief));
  }
  // ambient / minor 不卸压力：它们是背景音，不是事件。
  return clampTension(tension);
}

/** 这一档在世界史里有多重（越重越会被记住）。 */
export function tierSignificance(tier: StoryTier): number {
  switch (tier) {
    case "crisis": return 0.5;
    case "conflict": return 0.2;
    case "minor": return 0.05;
    case "ambient": return 0.01;
  }
}

/** 一句话，说清现在村里的气氛。不出现任何人的名字。 */
export function statusLine(tension: number, mode: StoryMode, calmDays: number): string {
  const label = MODES[mode].label;
  if (tension > 85) return `弦快断了：${label}的日子也压不住，接下来多半是件大事。`;
  if (tension > 60) return `村里绷着一股气，一点火星就能吵起来。（${label}）`;
  if (tension > 25) return `日子有点紧，邻里间的话开始不好听。（${label}）`;
  if (calmDays >= 20) return `安静了 ${calmDays} 天，安静本身也开始让人心里发毛。（${label}）`;
  return `村里这几天很安静，至多是些鸡毛蒜皮的小事。（${label}）`;
}
