/**
 * 多条件加权选句、人工台词优先调度与跨存档防重复纯函数
 */

import {
  expand,
  interpolateFacts,
  nextDeterministicFloat,
  pickWithRng,
  sanitizeNeolithicText
} from "./grammar.ts";
import type {
  DayPhaseTag,
  GrammarData,
  HeredityKey,
  NarrativeFacts,
  RngInput,
  SpeakingStyleKey,
  VoiceCandidate,
  WeatherAnomalyTag
} from "./grammar.ts";

export interface WorldViewLike {
  getEntity?: (entityId: string) => unknown;
  getComponent?: <T = unknown>(entityId: string, componentId: string) => T | undefined;
  listRelations?: (entityId?: string, relationType?: string) => ReadonlyArray<unknown>;
  seasonAt?: (tick?: number) => "春" | "夏" | "秋" | "冬";
}

export interface ResidentSpecLike {
  key: string;
  name: string;
  age?: number;
  role?: string;
  trait?: string;
  wish?: string;
  workPlace?: string;
  homeSpace?: string;
  household?: string;
}

export interface AuthoredPersonEntry {
  loves?: string[];
  likes?: string[];
  dislikes?: string[];
  birthday?: string;
  giftLines?: Partial<Record<"love" | "like" | "dislike" | "default" | string, string | string[]>>;
  seasons?: Partial<Record<"春" | "夏" | "秋" | "冬", string[]>>;
  happy?: string[];
  low?: string[];
  heartEvents?: Array<{ hearts: number; text: string }>;
  ties?: Record<string, { relation: string; hearts?: number }>;
}

export interface SelectVoiceInput {
  world?: WorldViewLike;
  residentId?: string;
  resident?: ResidentSpecLike;
  targetId?: string;
  targetName?: string;
  item?: string;
  tick?: number;
  era?: string;
  authoredPerson?: AuthoredPersonEntry;
  authoredStories?: string[];
  authoredOfficeLines?: string[];
  recentLines?: readonly string[];
  maxRecentLines?: number;
  overrideFacts?: Partial<NarrativeFacts>;
}

export interface SelectVoiceResult {
  text: string;
  source: "authored" | "procedural";
  candidateId: string;
  facts: NarrativeFacts;
  nextRecentLines: string[];
}

const HEREDITY_KEYS: readonly HeredityKey[] = [
  "strength",
  "endurance",
  "constitution",
  "cold-tolerance",
  "dexterity",
  "perception",
  "insight",
  "memory"
];

/**
 * 根据温度偏差与湿度偏差映射新石器时代自然体感天气标签（不含任何数字）
 */
export function classifyWeatherAnomaly(
  season: "春" | "夏" | "秋" | "冬",
  temperatureAnomalyC = 0,
  humidityAnomaly = 0
): WeatherAnomalyTag {
  if ((season === "冬" && temperatureAnomalyC <= -1.5) || temperatureAnomalyC <= -4) {
    return "freezing";
  }
  if ((season === "夏" && temperatureAnomalyC >= 2) || temperatureAnomalyC >= 4) {
    return "scorching";
  }
  if (temperatureAnomalyC <= -1.2) {
    return humidityAnomaly >= 0.15 ? "cold_wet" : "cold_dry";
  }
  if (temperatureAnomalyC >= 1.2) {
    return humidityAnomaly >= 0.15 ? "warm_wet" : "warm_dry";
  }
  if (humidityAnomaly >= 0.25) {
    return season === "冬" || season === "秋" ? "cold_wet" : "warm_wet";
  }
  if (humidityAnomaly <= -0.25) {
    return season === "冬" || season === "秋" ? "cold_dry" : "warm_dry";
  }
  return "mild";
}

/**
 * 从角色 trait 描述、role 职责、年龄和先天禀赋推导贴近聚落生活的说话风格
 */
export function inferSpeakingStyle(
  resident: Partial<ResidentSpecLike>,
  highTrait?: HeredityKey
): SpeakingStyleKey {
  const text = `${resident.trait ?? ""} ${resident.role ?? ""} ${resident.wish ?? ""}`;

  if (/(急|快|风风火火|坐不住|麻利)/u.test(text)) {
    return "jixingzi";
  }
  if (/(唠叨|念叨|操心|婆妈|絮叨|看窖)/u.test(text)) {
    return "nagging";
  }
  if (/(细|巧|泥坯|陶|编|苇|针|纹)/u.test(text) || highTrait === "dexterity") {
    return "ximei";
  }
  if (/(话少|闷|默|少言|静|守火|看火)/u.test(text)) {
    return "huashao";
  }
  if (
    (typeof resident.age === "number" && resident.age >= 42) ||
    /(头人|巫医|长老|老成|稳重|记旧)/u.test(text) ||
    highTrait === "memory" ||
    highTrait === "insight"
  ) {
    return "laocheng";
  }
  if (/(痛快|爽利|直|敞亮|猎|渡)/u.test(text) || highTrait === "strength") {
    return "tongkuai";
  }
  return "huashao";
}

/**
 * 识别最突出的先天禀赋并转为纯口语短语（绝不暴露数值）
 */
export function resolveHereditySpoken(
  heredityComp: Record<string, unknown> | undefined,
  grammar: GrammarData,
  rng: RngInput
): { highTrait?: HeredityKey; heredityPhrase: string } {
  const phrasesMap = grammar.heredityPhrases ?? {};
  if (!heredityComp) {
    return { heredityPhrase: "手脚麻利" };
  }

  let bestKey: HeredityKey | undefined;
  let bestVal = -Infinity;

  for (const key of HEREDITY_KEYS) {
    const raw = heredityComp[key] ?? heredityComp[key.replace("-", "_")];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      if (raw > bestVal) {
        bestVal = raw;
        bestKey = key;
      }
    }
  }

  if (!bestKey) {
    return { heredityPhrase: "手脚麻利" };
  }

  const pool = phrasesMap[bestKey];
  const phrase = pool && pool.length > 0 ? pickWithRng(pool, rng) : "手脚麻利";
  return { highTrait: bestKey, heredityPhrase: phrase };
}

/**
 * 从 WorldView 与输入上下文提取叙事事实 (纯函数)
 */
export function extractNarrativeFacts(
  input: SelectVoiceInput,
  grammar: GrammarData,
  rng: RngInput
): NarrativeFacts {
  const world = input.world;
  const entityId = input.residentId ?? input.resident?.key ?? "resident-default";

  const residentComp =
    (world?.getComponent?.(entityId, "settlement-locations.resident") as Record<string, unknown> | undefined) ??
    (world?.getComponent?.(entityId, "resident") as Record<string, unknown> | undefined) ??
    {};

  const spec: ResidentSpecLike = {
    key: input.resident?.key ?? String(residentComp.key ?? entityId),
    name: input.resident?.name ?? String(residentComp.name ?? "阿禾"),
    age: input.resident?.age ?? (typeof residentComp.age === "number" ? residentComp.age : 26),
    role: input.resident?.role ?? String(residentComp.role ?? "看火的"),
    trait: input.resident?.trait ?? String(residentComp.trait ?? "手稳话少"),
    wish: input.resident?.wish ?? String(residentComp.wish ?? "窖穴满仓"),
    workPlace: input.resident?.workPlace ?? String(residentComp.workPlace ?? "火塘边"),
    homeSpace: input.resident?.homeSpace ?? String(residentComp.homeSpace ?? "半地穴居所"),
    household: input.resident?.household ?? String(residentComp.household ?? "河岸南棚")
  };

  // 先天禀赋
  const heredityComp =
    (world?.getComponent?.(entityId, "heredity") as Record<string, unknown> | undefined) ??
    (world?.getComponent?.(entityId, "heredity.profile") as Record<string, unknown> | undefined);
  const { highTrait, heredityPhrase } = resolveHereditySpoken(heredityComp, grammar, rng);

  // 时间与季节
  const clockComp =
    (world?.getComponent?.("world", "world-clock.clock") as Record<string, unknown> | undefined) ??
    (world?.getComponent?.(entityId, "world-clock.clock") as Record<string, unknown> | undefined) ??
    {};
  const routineComp =
    (world?.getComponent?.(entityId, "world-clock.routine") as Record<string, unknown> | undefined) ??
    (world?.getComponent?.("world", "world-clock.routine") as Record<string, unknown> | undefined) ??
    {};

  const rawSeason =
    world?.seasonAt?.(input.tick) ??
    (clockComp.season as "春" | "夏" | "秋" | "冬" | undefined) ??
    "春";
  const season: "春" | "夏" | "秋" | "冬" =
    rawSeason === "夏" || rawSeason === "秋" || rawSeason === "冬" ? rawSeason : "春";

  const rawPhase = String(
    routineComp.dayPhase ??
      routineComp.phase ??
      routineComp.period ??
      clockComp.dayPhase ??
      clockComp.period ??
      "morning"
  );
  const phaseMap: Record<string, DayPhaseTag> = {
    dawn: "dawn", 破晓: "dawn", 清晨: "dawn", 早晨: "dawn",
    morning: "morning", 上午: "morning", 白昼: "morning",
    noon: "noon", 正午: "noon", 中午: "noon",
    afternoon: "afternoon", 午后: "afternoon", 下午: "afternoon",
    dusk: "dusk", 傍晚: "dusk", 黄昏: "dusk", 日暮: "dusk",
    night: "night", 夜晚: "night", 夜深: "night", 深夜: "night"
  };
  const dayPhase: DayPhaseTag = phaseMap[rawPhase] ?? "morning";

  // 天气偏差
  const weatherComp =
    (world?.getComponent?.("world", "world-weather.region-state") as Record<string, unknown> | undefined) ??
    (world?.getComponent?.(entityId, "world-weather.region-state") as Record<string, unknown> | undefined) ??
    {};
  const tempAnomaly =
    typeof weatherComp.temperatureAnomalyC === "number" ? weatherComp.temperatureAnomalyC : 0;
  const humidityAnomaly =
    typeof weatherComp.humidityAnomaly === "number" ? weatherComp.humidityAnomaly : 0;
  const weatherTag = classifyWeatherAnomaly(season, tempAnomaly, humidityAnomaly);

  // 饥饿与心情判定（无独立 mood 字段，依据饥饿、近期事件与结怨推导）
  const hungerVal = typeof residentComp.hunger === "number" ? residentComp.hunger : 0;
  const hungry = Boolean(
    residentComp.hungry === true ||
      residentComp.isHungry === true ||
      residentComp.starving === true ||
      hungerVal >= 65
  );

  // 关系与结怨
  const targetKey = input.targetId;
  const tieEntry = targetKey ? input.authoredPerson?.ties?.[targetKey] : undefined;
  const conflictComp =
    (world?.getComponent?.(entityId, "social-conflict.grudges") as Record<string, unknown> | undefined) ??
    (world?.getComponent?.(entityId, "grudge") as Record<string, unknown> | undefined);

  const hasGrudge = Boolean(
    (targetKey && conflictComp && conflictComp[targetKey]) ||
      (tieEntry && /(怨|仇|嫌|死对头|不睦)/u.test(tieEntry.relation))
  );

  let relationTag: NarrativeFacts["relationTag"] = "neutral";
  if (hasGrudge) {
    relationTag = "grudge";
  } else if (tieEntry) {
    if (/(老伴|夫妻|伴侣|配偶)/u.test(tieEntry.relation)) {
      relationTag = "partner";
    } else if (/(师|徒|传艺)/u.test(tieEntry.relation)) {
      relationTag = "mentor";
    } else if ((tieEntry.hearts ?? 0) >= 6 || /(挚友|同棚|骨肉|至交)/u.test(tieEntry.relation)) {
      relationTag = "close";
    }
  }

  const recentNegativeEvent = Boolean(residentComp.recentNegativeEvent === true);
  const moodPolar: "happy" | "low" =
    hungry || hasGrudge || recentNegativeEvent || weatherTag === "freezing" ? "low" : "happy";

  const style = inferSpeakingStyle(spec, highTrait);

  // 时代标识
  const eraComp = world?.getComponent?.("world", "era-ladder.state") as Record<string, unknown> | undefined;
  const era = String(input.era ?? eraComp?.era ?? grammar.meta?.era ?? "neolithic");

  const baseFacts: NarrativeFacts = {
    era,
    residentKey: spec.key,
    name: spec.name,
    age: spec.age,
    role: spec.role,
    trait: spec.trait,
    wish: spec.wish,
    workPlace: spec.workPlace,
    homeSpace: spec.homeSpace,
    household: spec.household,
    style,
    season,
    weatherTag,
    dayPhase,
    moodPolar,
    hungry,
    highTrait,
    heredityPhrase,
    targetKey,
    targetName: input.targetName ?? targetKey ?? "同伴",
    relation: tieEntry?.relation,
    relationTag,
    hearts: tieEntry?.hearts,
    item: input.item
  };

  return {
    ...baseFacts,
    ...(input.overrideFacts ?? {})
  };
}

/**
 * 更新防重复记忆池（保留最近 maxRecentLines 条，默认 25 条）
 */
export function pushRecentLine(
  recentLines: readonly string[],
  newLine: string,
  maxRecentLines = 25
): string[] {
  const filtered = recentLines.filter((line) => line !== newLine);
  filtered.push(newLine);
  while (filtered.length > maxRecentLines) {
    filtered.shift();
  }
  return filtered;
}

/**
 * 优先从人写台词库（people.json / village-stories / office.lines.json）中挑选尚未重复的句子
 */
export function selectAuthoredLine(
  input: SelectVoiceInput,
  facts: NarrativeFacts,
  grammar: GrammarData,
  recentLines: readonly string[],
  rng: RngInput
): { text: string; candidateId: string } | null {
  const person = input.authoredPerson;
  const pool: Array<{ id: string; text: string; priority: number }> = [];

  // 1. 赠礼台词最高优先级
  if (facts.item && person?.giftLines) {
    const itemStr = String(facts.item);
    let giftBucket = "default";
    if (person.loves?.includes(itemStr)) giftBucket = "love";
    else if (person.likes?.includes(itemStr)) giftBucket = "like";
    else if (person.dislikes?.includes(itemStr)) giftBucket = "dislike";

    const rawGift = person.giftLines[giftBucket] ?? person.giftLines[itemStr] ?? person.giftLines.default;
    const lines = Array.isArray(rawGift) ? rawGift : typeof rawGift === "string" ? [rawGift] : [];
    for (const line of lines) {
      pool.push({ id: `authored:gift:${giftBucket}`, text: line, priority: 100 });
    }
  }

  // 2. 亲密度事件台词 (heartEvents)
  if (typeof facts.hearts === "number" && person?.heartEvents) {
    for (const ev of person.heartEvents) {
      if (facts.hearts >= ev.hearts && ev.text) {
        pool.push({ id: `authored:heart:${ev.hearts}`, text: ev.text, priority: 90 });
      }
    }
  }

  // 3. 故事与职责专有台词 (village-stories / office.lines.json)
  for (const storyLine of input.authoredStories ?? []) {
    if (storyLine) {
      pool.push({ id: "authored:story", text: storyLine, priority: 85 });
    }
  }
  for (const officeLine of input.authoredOfficeLines ?? []) {
    if (officeLine) {
      pool.push({ id: "authored:office", text: officeLine, priority: 80 });
    }
  }

  // 4. 季节与心情台词 (seasons / happy / low)
  if (person) {
    const seasonLines = facts.season ? person.seasons?.[facts.season] ?? [] : [];
    for (const line of seasonLines) {
      pool.push({ id: `authored:season:${facts.season}`, text: line, priority: 70 });
    }
    const moodLines = facts.moodPolar === "low" ? person.low ?? [] : person.happy ?? [];
    for (const line of moodLines) {
      pool.push({ id: `authored:mood:${facts.moodPolar}`, text: line, priority: 65 });
    }
  }

  if (pool.length === 0) {
    return null;
  }

  // Interpolate & sanitize before checking recentLines
  const prepared = pool.map((entry) => ({
    ...entry,
    rendered: sanitizeNeolithicText(interpolateFacts(entry.text, facts), grammar)
  }));

  const unrepeated = prepared.filter((entry) => !recentLines.includes(entry.rendered));
  if (unrepeated.length === 0) {
    // 若所有人工台词都已在最近 25 条防重复池中用过，交由文法生成器兜底补充
    return null;
  }

  unrepeated.sort((a, b) => b.priority - a.priority);
  const topPriority = unrepeated[0].priority;
  const topGroup = unrepeated.filter((item) => item.priority === topPriority);
  const chosen = pickWithRng(topGroup, rng);

  return {
    text: chosen.rendered,
    candidateId: chosen.id
  };
}

/**
 * 计算单条候选规则在当前事实下的匹配度得分（不匹配返回 0）
 */
export function scoreCandidate(candidate: VoiceCandidate, facts: NarrativeFacts): number {
  const conds = candidate.conditions ?? {};
  let matchedDimensions = 0;

  for (const [key, expected] of Object.entries(conds)) {
    if (expected === undefined) continue;
    if (key === "roleKeyword") {
      const roleStr = String(facts.role ?? "");
      if (!roleStr.includes(String(expected))) {
        return 0;
      }
      matchedDimensions += 1;
      continue;
    }
    if (facts[key] !== expected) {
      return 0;
    }
    matchedDimensions += 1;
  }

  return candidate.weight * Math.pow(2.2, matchedDimensions);
}

/**
 * 多条件加权选句 + Tracery 文法展开主入口（纯函数）
 */
export function selectAndExpandVoice(
  kind: "say" | "narrate",
  input: SelectVoiceInput,
  grammar: GrammarData,
  rng: RngInput
): SelectVoiceResult {
  const maxRecent = input.maxRecentLines ?? grammar.meta?.maxRecentLines ?? 25;
  const recentLines = input.recentLines ?? [];
  const facts = extractNarrativeFacts(input, grammar, rng);

  // 1. 人工台词优先（仅对 say 或显式传入 story/office 台词生效）
  if (kind === "say" || (input.authoredStories && input.authoredStories.length > 0)) {
    const authored = selectAuthoredLine(input, facts, grammar, recentLines, rng);
    if (authored) {
      return {
        text: authored.text,
        source: "authored",
        candidateId: authored.candidateId,
        facts,
        nextRecentLines: pushRecentLine(recentLines, authored.text, maxRecent)
      };
    }
  }

  // 2. 多条件加权候选打分
  const candidates = (grammar.candidates ?? []).filter((c) => c.kind === kind);
  const scored: Array<{ candidate: VoiceCandidate; score: number }> = [];

  for (const candidate of candidates) {
    const score = scoreCandidate(candidate, facts);
    if (score > 0) {
      scored.push({ candidate, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  // 3. 结合防重复池进行加权抽样与展开
  const pool = scored.length > 0 ? scored : [];
  let selectedText = "";
  let selectedId = `${kind}_fallback`;

  if (pool.length > 0) {
    // 对前若干高分候选用确定性 RNG 轮盘赌尝试生成未重复句子
    const orderedPool = [...pool];
    const totalScore = orderedPool.reduce((acc, item) => acc + item.score, 0);
    let roll = nextDeterministicFloat(rng) * totalScore;
    let startIndex = 0;
    for (let i = 0; i < orderedPool.length; i++) {
      roll -= orderedPool[i].score;
      if (roll <= 0) {
        startIndex = i;
        break;
      }
    }

    for (let offset = 0; offset < orderedPool.length; offset++) {
      const idx = (startIndex + offset) % orderedPool.length;
      const cand = orderedPool[idx].candidate;
      // 每个候选最多尝试 3 次展开以避开 recentLines
      for (let attempt = 0; attempt < 3; attempt++) {
        const rendered = expand(grammar, cand.template, facts, rng);
        if (!recentLines.includes(rendered)) {
          selectedText = rendered;
          selectedId = cand.id;
          break;
        }
        if (offset === orderedPool.length - 1 && attempt === 2) {
          selectedText = rendered;
          selectedId = cand.id;
        }
      }
      if (selectedText && !recentLines.includes(selectedText)) {
        break;
      }
    }
  } else {
    const fallbackSym = kind === "say" ? "speech_fallback" : "narrate_fallback";
    selectedText = expand(grammar, fallbackSym, facts, rng);
  }

  return {
    text: selectedText,
    source: "procedural",
    candidateId: selectedId,
    facts,
    nextRecentLines: pushRecentLine(recentLines, selectedText, maxRecent)
  };
}