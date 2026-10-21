/**
 * Historical Era prototype.
 *
 * Era is intentionally NOT a Core primitive yet (需求书 §96.5). This system
 * pack tests whether a data-driven era context is useful enough to deserve
 * promotion later. It owns presentation/content context only; it does not
 * magically unlock technology or rewrite civilization knowledge.
 */

import type { ComponentData, Effect, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  WORLD_ENTITY_ID,
  formatYear,
  yearOfTick,
} from "@openlife/life-contracts/modern";

const OWNER = "historical-era";

export const HistoricalEraComponents = {
  state: "historical-era.state",
} as const;

export interface DevelopmentSignal {
  id: string;
  label: string;
  /** 0..1: how strongly this era supports the condition; never an unlock flag. */
  strength: number;
}

export interface EraDefinition {
  id: string;
  label: string;
  startYear: number;
  summary: string;
  dailyLife: string[];
  materials: string[];
  tools: string[];
  techniques: string[];
  media: string[];
  institutions: string[];
  thoughtClimate: string[];
  changeSignals: string[];
  notableContext: string[];
  developmentSignals: DevelopmentSignal[];
}

/**
 * Astronomical years: 1 BCE is year 0, 2 BCE is -1, etc.
 *
 * Boundaries are conventional content anchors rather than a claim that social
 * change happened everywhere on one exact day.
 */
export const ANCIENT_CHINA_ERAS: readonly EraDefinition[] = [
  {
    id: "xia",
    label: "夏",
    startYear: -2069,
    summary: "早期国家与聚落网络逐渐成形，生活仍紧密依赖亲族、农事和地方经验。",
    dailyLife: ["聚落农耕", "亲族协作", "季节性劳作"],
    materials: ["木", "石", "骨", "陶", "早期铜合金"],
    tools: ["石木农具", "陶器", "骨器"],
    techniques: ["农耕与储藏", "陶器烧制", "简单水利经验"],
    media: ["口传", "器物标记"],
    institutions: ["亲族共同体", "聚落首领与役事网络"],
    thoughtClimate: ["祖先与自然经验", "共同体秩序"],
    changeSignals: ["聚落规模扩大", "手工业分工增加"],
    notableContext: ["早期王权传统与治水叙事"],
    developmentSignals: [
      { id: "systematic-observation", label: "系统观察", strength: 0.18 },
      { id: "durable-records", label: "持久记录", strength: 0.05 },
      { id: "precision-craft", label: "精细工艺", strength: 0.16 },
      { id: "knowledge-networks", label: "知识传播网络", strength: 0.08 },
      { id: "institutional-coordination", label: "组织协作", strength: 0.12 },
    ],
  },
  {
    id: "shang",
    label: "商",
    startYear: -1599,
    summary: "青铜礼制、占卜记录和更复杂的中心聚落，让权力、工艺与记忆更集中。",
    dailyLife: ["农耕", "专业手工业", "祭祀与征役"],
    materials: ["青铜", "陶", "骨", "玉", "木"],
    tools: ["青铜工具与兵器", "车马器", "精细陶器"],
    techniques: ["复杂青铜铸造", "车马运用", "大型建筑营造"],
    media: ["口传", "甲骨刻辞", "青铜器铭记"],
    institutions: ["王权中心", "宗族网络", "祭祀与占卜体系"],
    thoughtClimate: ["祖先祭祀", "占卜解释", "礼制秩序"],
    changeSignals: ["文字记录显著增加", "青铜工艺高度专业化"],
    notableContext: ["甲骨记录者", "青铜工匠与王室占卜体系"],
    developmentSignals: [
      { id: "systematic-observation", label: "系统观察", strength: 0.28 },
      { id: "durable-records", label: "持久记录", strength: 0.30 },
      { id: "precision-craft", label: "精细工艺", strength: 0.38 },
      { id: "knowledge-networks", label: "知识传播网络", strength: 0.18 },
      { id: "institutional-coordination", label: "组织协作", strength: 0.32 },
    ],
  },
  {
    id: "western-zhou",
    label: "西周",
    startYear: -1045,
    summary: "宗法、分封网络与礼乐秩序成为解释政治和社会关系的重要框架。",
    dailyLife: ["农业聚落", "宗族生活", "区域贡赋与役事"],
    materials: ["青铜", "陶", "木", "竹", "玉"],
    tools: ["青铜农具与兵器", "车马装备", "礼器"],
    techniques: ["青铜铭刻", "道路与城邑营造", "农业组织"],
    media: ["口传", "青铜铭文", "早期简册传统"],
    institutions: ["宗法网络", "分封政治", "礼乐秩序"],
    thoughtClimate: ["天命观", "礼", "宗族责任"],
    changeSignals: ["政治记忆更多进入铭文", "区域治理网络扩大"],
    notableContext: ["礼制传统", "青铜铭文与政治记述"],
    developmentSignals: [
      { id: "systematic-observation", label: "系统观察", strength: 0.34 },
      { id: "durable-records", label: "持久记录", strength: 0.42 },
      { id: "precision-craft", label: "精细工艺", strength: 0.42 },
      { id: "knowledge-networks", label: "知识传播网络", strength: 0.28 },
      { id: "institutional-coordination", label: "组织协作", strength: 0.45 },
    ],
  },
  {
    id: "spring-autumn",
    label: "春秋",
    startYear: -769,
    summary: "诸侯竞争、城邑网络与社会流动增强，新的政治与伦理问题不断被提出。",
    dailyLife: ["农业与手工业", "区域贸易", "城邑生活"],
    materials: ["青铜", "铁", "木", "竹", "漆"],
    tools: ["铁制工具逐渐增多", "车兵与步兵装备", "衡量与交换工具"],
    techniques: ["铁器加工扩大", "农业效率提升", "区域交通与城邑建设"],
    media: ["口传", "竹木简", "青铜铭文"],
    institutions: ["诸侯国", "卿大夫政治", "私人讲学萌芽"],
    thoughtClimate: ["礼的重新解释", "政治伦理讨论", "私人讲学"],
    changeSignals: ["铁器使用扩大", "思想传播脱离单一宗族场域"],
    notableContext: ["孔丘等思想人物所处的历史环境"],
    developmentSignals: [
      { id: "systematic-observation", label: "系统观察", strength: 0.46 },
      { id: "durable-records", label: "持久记录", strength: 0.54 },
      { id: "precision-craft", label: "精细工艺", strength: 0.50 },
      { id: "knowledge-networks", label: "知识传播网络", strength: 0.58 },
      { id: "institutional-coordination", label: "组织协作", strength: 0.50 },
    ],
  },
  {
    id: "warring-states",
    label: "战国",
    startYear: -474,
    summary: "大规模国家竞争、官僚治理与思想争鸣并行，技术和制度变化显著加快。",
    dailyLife: ["强化农业生产", "城市与市场", "军役与行政"],
    materials: ["铁", "青铜", "木", "竹", "漆"],
    tools: ["铁农具", "弩与多样兵器", "度量衡工具"],
    techniques: ["水利工程", "冶铁扩张", "大规模工程与军事组织"],
    media: ["竹木简", "帛书", "口传与私人著述"],
    institutions: ["官僚国家", "变法制度", "学派与游说网络"],
    thoughtClimate: ["百家争鸣", "政治制度论辩", "伦理与人性讨论"],
    changeSignals: ["学派分化与竞争", "制度改革密集", "知识跨地域传播"],
    notableContext: ["墨翟、孟轲、庄周等思想人物所处的历史环境"],
    developmentSignals: [
      { id: "systematic-observation", label: "系统观察", strength: 0.60 },
      { id: "durable-records", label: "持久记录", strength: 0.68 },
      { id: "precision-craft", label: "精细工艺", strength: 0.64 },
      { id: "knowledge-networks", label: "知识传播网络", strength: 0.74 },
      { id: "institutional-coordination", label: "组织协作", strength: 0.68 },
    ],
  },
] as const;

export const historicalEraModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Historical Era Prototype",
    description: "Data-driven era context and transition history without making Era a Core primitive.",
    requires: ["time.calendar"],
    provides: ["history.era-context"],
    capabilities: [
      "component.register",
      "rule.reaction.register",
      "projection.register",
    ],
  },

  register(ctx) {
    ctx.provideCapability("history.era-context", (world: WorldView) => {
      const state = world.getComponent(WORLD_ENTITY_ID, HistoricalEraComponents.state) ?? {};
      const definition = ANCIENT_CHINA_ERAS.find((era) => era.id === state.id)
        ?? eraForYear(yearOfTick(world.tick));
      return eraState(definition, Number(state.enteredAt ?? world.tick));
    });

    ctx.registerComponent({
      id: HistoricalEraComponents.state,
      persist: true,
      description: "Current era content context. Not a technology-unlock source of truth.",
    });

    ctx.registerReactionRule({
      id: "historical-era.world_initialized.seed",
      eventType: "modern.world_initialized",
      react: (c): Effect[] => {
        const era = eraForYear(yearOfTick(c.world.tick));
        return [
          {
            kind: "setComponent",
            entityId: WORLD_ENTITY_ID,
            component: HistoricalEraComponents.state,
            value: eraState(era, c.world.tick),
            reason: "seed current historical era context",
          },
          {
            kind: "emitEvent",
            eventType: "historical-era.entered",
            targetId: WORLD_ENTITY_ID,
            data: {
              eraId: era.id,
              label: era.label,
              startYear: era.startYear,
              changeSignals: era.changeSignals,
            },
            historicalSignificance: 0.65,
            visibility: "public",
          },
        ];
      },
    });

    ctx.registerReactionRule({
      id: "historical-era.year_passed.transition",
      eventType: "modern.year_passed",
      react: (c) => {
        const year = yearOfTick(c.world.tick);
        const next = eraForYear(year);
        const current = c.world.getComponent(
          WORLD_ENTITY_ID,
          HistoricalEraComponents.state,
        ) ?? {};
        const previousId = String(current.id ?? "");
        if (previousId === next.id) return [];

        const previous = ANCIENT_CHINA_ERAS.find((era) => era.id === previousId);
        const effects: Effect[] = [
          {
            kind: "setComponent",
            entityId: WORLD_ENTITY_ID,
            component: HistoricalEraComponents.state,
            value: eraState(next, c.world.tick),
            reason: `historical context moved into ${next.label}`,
          },
          {
            kind: "emitEvent",
            eventType: "historical-era.changed",
            targetId: WORLD_ENTITY_ID,
            data: {
              fromId: previous?.id ?? previousId,
              fromLabel: previous?.label ?? previousId,
              toId: next.id,
              toLabel: next.label,
              year,
              displayYear: formatYear(year),
              changeSignals: next.changeSignals,
              newTools: difference(next.tools, previous?.tools ?? []),
              newMedia: difference(next.media, previous?.media ?? []),
              newInstitutions: difference(next.institutions, previous?.institutions ?? []),
            },
            historicalSignificance: 0.85,
            visibility: "public",
          },
        ];
        return effects;
      },
    });

    ctx.registerProjection({
      id: "historical-era.current",
      description: "Current public era context, not a list of forced unlocks.",
      build: ({ world }) => {
        const state = world.getComponent(WORLD_ENTITY_ID, HistoricalEraComponents.state) ?? {};
        const definition = ANCIENT_CHINA_ERAS.find((era) => era.id === state.id)
          ?? eraForYear(yearOfTick(world.tick));
        return {
          ...eraState(definition, Number(state.enteredAt ?? world.tick)),
          displayStart: formatYear(definition.startYear),
          currentYear: formatYear(yearOfTick(world.tick)),
        };
      },
    });

    ctx.registerProjection({
      id: "historical-era.timeline",
      description: "Authored era contexts available in this prototype.",
      build: () => ({
        eras: ANCIENT_CHINA_ERAS.map((era) => ({
          id: era.id,
          label: era.label,
          startYear: era.startYear,
          displayStart: formatYear(era.startYear),
          summary: era.summary,
        })),
      }),
    });
  },
};

export function eraForYear(year: number): EraDefinition {
  let current = ANCIENT_CHINA_ERAS[0]!;
  for (const era of ANCIENT_CHINA_ERAS) {
    if (year >= era.startYear) current = era;
    else break;
  }
  return current;
}

function eraState(era: EraDefinition, enteredAt: number): ComponentData {
  return {
    id: era.id,
    label: era.label,
    startYear: era.startYear,
    enteredAt,
    summary: era.summary,
    dailyLife: era.dailyLife,
    materials: era.materials,
    tools: era.tools,
    techniques: era.techniques,
    media: era.media,
    institutions: era.institutions,
    thoughtClimate: era.thoughtClimate,
    changeSignals: era.changeSignals,
    notableContext: era.notableContext,
    developmentSignals: era.developmentSignals as unknown as ComponentData[],
  };
}

function difference(next: readonly string[], previous: readonly string[]): string[] {
  const existing = new Set(previous);
  return next.filter((item) => !existing.has(item));
}
