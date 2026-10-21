/**
 * 确定性 Tracery 式文法展开引擎 (INV-007 严格合规：禁止 Math.random 与 Date)
 */

export type SpeakingStyleKey =
  | "ximei"
  | "tongkuai"
  | "huashao"
  | "nagging"
  | "laocheng"
  | "jixingzi";

export type WeatherAnomalyTag =
  | "mild"
  | "warm_dry"
  | "warm_wet"
  | "cold_dry"
  | "cold_wet"
  | "freezing"
  | "scorching";

export type DayPhaseTag =
  | "dawn"
  | "morning"
  | "noon"
  | "afternoon"
  | "dusk"
  | "night";

export type HeredityKey =
  | "strength"
  | "endurance"
  | "constitution"
  | "cold-tolerance"
  | "dexterity"
  | "perception"
  | "insight"
  | "memory";

export interface DeterministicRngLike {
  next?: () => number;
  nextFloat?: () => number;
  random?: () => number;
  float?: () => number;
  nextInt?: (min: number, max: number) => number;
}

export type RngInput = DeterministicRngLike | (() => number);

export interface NarrativeFacts {
  era?: string;
  residentKey?: string;
  name?: string;
  age?: number;
  role?: string;
  trait?: string;
  wish?: string;
  workPlace?: string;
  homeSpace?: string;
  household?: string;
  style?: SpeakingStyleKey;
  season?: "春" | "夏" | "秋" | "冬";
  weatherTag?: WeatherAnomalyTag;
  dayPhase?: DayPhaseTag;
  moodPolar?: "happy" | "low";
  hungry?: boolean;
  highTrait?: HeredityKey;
  heredityPhrase?: string;
  targetKey?: string;
  targetName?: string;
  relation?: string;
  relationTag?: "partner" | "mentor" | "close" | "grudge" | "neutral";
  hearts?: number;
  item?: string;
  [key: string]: unknown;
}

export interface WeightedGrammarRule {
  text: string;
  weight?: number;
  when?: Partial<Record<string, string | boolean>>;
}

export type GrammarSymbolEntry = string | WeightedGrammarRule;

export interface VoiceCandidate {
  id: string;
  kind: "say" | "narrate";
  weight: number;
  conditions: Partial<Record<string, string | boolean>>;
  template: string;
}

export interface GrammarData {
  meta?: {
    id?: string;
    era?: string;
    name?: string;
    maxRecentLines?: number;
    maxCharLength?: number;
  };
  forbiddenWords?: string[];
  forbiddenReplacements?: Record<string, string>;
  styles?: Record<string, { label: string; description: string }>;
  heredityPhrases?: Record<string, string[]>;
  symbols: Record<string, GrammarSymbolEntry[]>;
  candidates?: VoiceCandidate[];
}

/**
 * 从 DeterministicRngLike 提取 [0, 1) 区间的确定性浮点数。
 * 若未提供合法 rng，直接抛出错误以守护 INV-007 规则。
 */
export function nextDeterministicFloat(rng: RngInput): number {
  if (typeof rng === "function") {
    return clampUnit(rng());
  }
  if (!rng || typeof rng !== "object") {
    throw new Error("INV-007 violation: DeterministicRngLike instance is required.");
  }
  if (typeof rng.nextFloat === "function") {
    return clampUnit(rng.nextFloat());
  }
  if (typeof rng.next === "function") {
    return clampUnit(rng.next());
  }
  if (typeof rng.float === "function") {
    return clampUnit(rng.float());
  }
  if (typeof rng.random === "function") {
    return clampUnit(rng.random());
  }
  if (typeof rng.nextInt === "function") {
    const span = 1000000;
    return clampUnit(rng.nextInt(0, span - 1) / span);
  }
  throw new Error("INV-007 violation: rng does not expose next/nextFloat/random/nextInt.");
}

function clampUnit(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const normalized = val < 0 ? Math.abs(val) : val;
  return normalized >= 1 ? normalized % 1 : normalized;
}

/**
 * 使用确定性 RNG 从非空数组中按权重或均匀分布挑选一项
 */
export function pickWithRng<T>(items: readonly T[], rng: RngInput): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from an empty array.");
  }
  if (items.length === 1) {
    nextDeterministicFloat(rng);
    return items[0] as T;
  }
  const u = nextDeterministicFloat(rng);
  const idx = Math.min(items.length - 1, Math.floor(u * items.length));
  return items[idx] as T;
}

/**
 * 解析动态上下文伪符号（如 #opener# -> opener_ximei, #weather_scene# -> weather_cold_wet）
 */
function resolveDynamicSymbolKey(
  rawKey: string,
  symbols: Record<string, GrammarSymbolEntry[]>,
  facts: NarrativeFacts
): string {
  const style = facts.style ?? "huashao";
  const weather = facts.weatherTag ?? "mild";
  const dayPhase = facts.dayPhase ?? "morning";
  const mood = facts.moodPolar ?? "happy";

  if (rawKey === "opener") {
    const k = `opener_${style}`;
    if (symbols[k]) return k;
  }
  if (rawKey === "tail") {
    const k = `tail_${style}`;
    if (symbols[k]) return k;
  }
  if (rawKey === "gesture") {
    const k = `gesture_${style}`;
    if (symbols[k]) return k;
  }
  if (rawKey === "weather_scene") {
    const k = `weather_${weather}`;
    if (symbols[k]) return k;
  }
  if (rawKey === "time_scene") {
    const k = `time_${dayPhase}`;
    if (symbols[k]) return k;
  }
  if (rawKey === "thought_clause") {
    if (facts.hungry && symbols.thought_hungry) {
      return "thought_hungry";
    }
    const k = `thought_${mood}`;
    if (symbols[k]) return k;
  }
  return rawKey;
}

function selectSymbolRule(
  entries: readonly GrammarSymbolEntry[],
  facts: NarrativeFacts,
  rng: RngInput
): string {
  const weighted: Array<{ text: string; weight: number }> = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      weighted.push({ text: entry, weight: 1 });
      continue;
    }
    let matched = true;
    if (entry.when) {
      for (const [k, expected] of Object.entries(entry.when)) {
        if (facts[k] !== expected) {
          matched = false;
          break;
        }
      }
    }
    if (matched) {
      weighted.push({ text: entry.text, weight: entry.weight ?? 1 });
    }
  }

  if (weighted.length === 0) {
    const fallback = entries[0];
    if (fallback === undefined) return "";
    return typeof fallback === "string" ? fallback : fallback.text;
  }

  const total = weighted.reduce((acc, item) => acc + Math.max(0.01, item.weight), 0);
  let roll = nextDeterministicFloat(rng) * total;
  for (const item of weighted) {
    roll -= Math.max(0.01, item.weight);
    if (roll <= 0) {
      return item.text;
    }
  }
  return weighted[weighted.length - 1]?.text ?? "";
}

/**
 * 插值替换 {name}、{target}、{item}、{role}、{workPlace}、{homeSpace}、{heredityPhrase}
 */
export function interpolateFacts(text: string, facts: NarrativeFacts): string {
  const lookup: Record<string, string> = {
    name: String(facts.name ?? "族人"),
    target: String(facts.targetName ?? facts.target ?? "同伴"),
    item: String(facts.item ?? "粟米"),
    role: String(facts.role ?? "聚落忙活"),
    workPlace: String(facts.workPlace ?? "晒泥场"),
    homeSpace: String(facts.homeSpace ?? "半地穴居所"),
    heredityPhrase: String(facts.heredityPhrase ?? "手脚麻利"),
    season: String(facts.season ?? "春")
  };

  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (full: string, key: string) => {
    if (key in lookup) {
      return lookup[key] ?? full;
    }
    const rawVal = (facts as Record<string, unknown>)[key];
    return typeof rawVal === "string" && rawVal.length > 0 ? rawVal : full;
  });
}

/**
 * 清洗文本：剔除一切阿拉伯数字、百分号、现代违禁词，并控制句数(2~4句)与总字数(<=100字)
 */
export function sanitizeNeolithicText(text: string, grammar: GrammarData): string {
  let out = text;

  // 1. 替换或清理违禁词
  const replacements = grammar.forbiddenReplacements ?? {};
  for (const [bad, good] of Object.entries(replacements)) {
    if (out.includes(bad)) {
      out = out.split(bad).join(good);
    }
  }
  for (const forbidden of grammar.forbiddenWords ?? []) {
    if (out.includes(forbidden)) {
      const fallback = replacements[forbidden] ?? "草木";
      out = out.split(forbidden).join(fallback);
    }
  }

  // 2. 严禁出现任何阿拉伯数字与百分号
  out = out.replace(/[0-9]+[%％]?/g, "几");
  out = out.replace(/[%％]/g, "");

  // 3. 合并多余标点与空白
  out = out
    .replace(/，+/g, "，")
    .replace(/。+/g, "。")
    .replace(/，。/g, "。")
    .replace(/\s+/g, "")
    .trim();

  // 4. 控制在 2-4 句且总字数不超过 maxCharLength (默认 100 字)
  const maxChars = grammar.meta?.maxCharLength ?? 100;
  const sentences = out
    .split(/(?<=[。！？])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  let selectedSentences: string[] = sentences.slice(0, 4);
  if (selectedSentences.length === 1 && selectedSentences[0]!.includes("，")) {
    const parts = selectedSentences[0]!.split("，");
    if (parts.length >= 3) {
      const mid = Math.ceil(parts.length / 2);
      const firstHalf = parts.slice(0, mid).join("，") + "。";
      const secondHalf = parts.slice(mid).join("，");
      selectedSentences = [firstHalf, secondHalf];
    }
  }

  let joined = selectedSentences.join("");
  if (joined.length > maxChars) {
    let trimmed = "";
    for (const s of selectedSentences) {
      if ((trimmed + s).length <= maxChars) {
        trimmed += s;
      } else {
        break;
      }
    }
    if (trimmed.length >= 12) {
      joined = trimmed;
    } else {
      joined = joined.slice(0, maxChars - 1).replace(/[，、；：]$/u, "") + "。";
    }
  }

  if (!/[。！？]$/u.test(joined)) {
    joined += "。";
  }
  return joined;
}

/**
 * 确定性 Tracery 式文法展开主函数
 * @param grammar 词库与文法定义对象
 * @param symbol 起始符号名（如 "speech_fallback"）或直接包含 #slot# 的模板字符串
 * @param facts 从 WorldView 提取的上下文事实
 * @param rng 必填的确定性随机数生成器 (INV-007)
 */
export function expand(
  grammar: GrammarData,
  symbol: string,
  facts: NarrativeFacts,
  rng: RngInput
): string {
  // 立即校验 rng 合法性（即使模板无槽位也必须传入合法 rng）
  if (typeof rng !== "function" && (!rng || typeof rng !== "object")) {
    throw new Error("INV-007 violation: expand() requires a valid DeterministicRngLike rng.");
  }

  const symbols = grammar.symbols ?? {};
  const cleanSymbol = symbol.startsWith("#") && symbol.endsWith("#") && !symbol.slice(1, -1).includes("#")
    ? symbol.slice(1, -1)
    : symbol;

  let current: string;
  const resolvedRootKey = resolveDynamicSymbolKey(cleanSymbol, symbols, facts);
  if (symbols[resolvedRootKey]) {
    current = selectSymbolRule(symbols[resolvedRootKey], facts, rng);
  } else {
    current = symbol;
  }

  // 递归展开 #slot#
  const maxDepth = 10;
  for (let depth = 0; depth < maxDepth; depth++) {
    if (!current.includes("#")) break;
    current = current.replace(/#([a-zA-Z0-9_-]+)#/g, (_match, rawSlot: string) => {
      if (rawSlot === "heredity_clause") {
        return facts.heredityPhrase
          ? `仗着自己${facts.heredityPhrase}`
          : "手脚麻利地忙活着";
      }
      const key = resolveDynamicSymbolKey(rawSlot, symbols, facts);
      const pool = symbols[key];
      if (!pool || pool.length === 0) {
        const factVal = facts[rawSlot];
        return typeof factVal === "string" ? factVal : "";
      }
      return selectSymbolRule(pool, facts, rng);
    });
  }

  const interpolated = interpolateFacts(current, facts);
  return sanitizeNeolithicText(interpolated, grammar);
}