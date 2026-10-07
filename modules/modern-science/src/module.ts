/**
 * Modern science content/system pack.
 *
 * Reality and civilization knowledge are deliberately separate. The module
 * fixes modern-world scientific truths when the world begins, while a distinct
 * knowledge state records what civilization currently knows. The UI projection
 * exposes only civilization knowledge, never hidden world-law state.
 */

import type { KnowledgeDefinition, OpenLifeModule } from "@openlife/contracts";
import { WORLD_ENTITY_ID } from "@openlife/life-contracts/modern";

const OWNER = "modern-science";

export const ScienceComponents = {
  worldLaws: "modern-science.world_laws",
  civilizationKnowledge: "modern-science.civilization_knowledge",
} as const;

const KNOWLEDGE: Omit<KnowledgeDefinition, "owner">[] = [
  {
    id: "modern-science.electromagnetic_phenomena",
    kind: "observation",
    description: "Lightning, static charge and magnetism are observed without a unified theory.",
    tags: ["physics", "electricity"],
  },
  {
    id: "modern-science.material_change_observation",
    kind: "observation",
    description: "Civilization observes repeatable transformations of matter.",
    tags: ["physics", "matter"],
  },
  {
    id: "modern-science.living_bodies_have_structure",
    kind: "observation",
    description: "Living bodies have stable observable anatomical structures.",
    tags: ["biology", "medicine"],
  },
  {
    id: "modern-science.human_anatomy",
    kind: "knowledge",
    description: "Civilization develops systematic knowledge of human anatomy.",
    dependsOn: ["modern-science.living_bodies_have_structure"],
    tags: ["biology", "medicine"],
  },
  {
    id: "modern-science.atomic_theory",
    kind: "theory",
    description: "A theoretical model explains matter in terms of discrete microscopic constituents.",
    dependsOn: ["modern-science.material_change_observation"],
    tags: ["physics", "matter"],
  },
  {
    id: "modern-science.atomic_evidence",
    kind: "evidence",
    description: "Experiments accumulate evidence for atomic models of matter.",
    dependsOn: ["modern-science.atomic_theory"],
    tags: ["physics", "matter"],
  },
  {
    id: "modern-science.atomic_structure",
    kind: "knowledge",
    description: "Civilization understands matter in terms of atoms and subatomic structure.",
    dependsOn: ["modern-science.atomic_theory", "modern-science.atomic_evidence"],
    tags: ["physics", "matter"],
  },
  {
    id: "modern-science.electromagnetic_theory",
    kind: "theory",
    description: "Electric and magnetic observations are unified into a predictive theory.",
    dependsOn: ["modern-science.electromagnetic_phenomena"],
    tags: ["physics", "electricity"],
  },
  {
    id: "modern-science.electromagnetic_evidence",
    kind: "evidence",
    description: "Repeatable experiments support a unified electromagnetic model.",
    dependsOn: ["modern-science.electromagnetic_theory"],
    tags: ["physics", "electricity"],
  },
  {
    id: "modern-science.electromagnetism",
    kind: "knowledge",
    description: "Civilization has established predictive knowledge of electromagnetism.",
    dependsOn: ["modern-science.electromagnetic_theory", "modern-science.electromagnetic_evidence"],
    tags: ["physics", "electricity"],
  },
  {
    id: "modern-science.electric_power_engineering",
    kind: "capability",
    description: "Civilization can generate, transmit and use electric power.",
    dependsOn: ["modern-science.electromagnetism"],
    tags: ["engineering", "electricity"],
  },
  {
    id: "modern-science.optical_instruments",
    kind: "capability",
    description: "Precision craft enables instruments that extend human vision.",
    dependsOn: ["modern-science.material_change_observation"],
    tags: ["engineering", "biology"],
  },
  {
    id: "modern-science.microscopic_evidence",
    kind: "evidence",
    description: "Microscopic observation reveals repeating structures in living tissue.",
    dependsOn: ["modern-science.optical_instruments", "modern-science.living_bodies_have_structure"],
    tags: ["biology"],
  },
  {
    id: "modern-science.cell_theory",
    kind: "knowledge",
    description: "Civilization understands living organisms as cellular systems.",
    dependsOn: ["modern-science.microscopic_evidence"],
    tags: ["biology"],
  },
];

const INITIAL_KNOWN = [
  "modern-science.electromagnetic_phenomena",
  "modern-science.material_change_observation",
  "modern-science.living_bodies_have_structure",
];

const DISCOVERY_DIFFICULTY: Record<string, number> = {
  "modern-science.human_anatomy": 500,
  "modern-science.atomic_theory": 5000,
  "modern-science.atomic_evidence": 650,
  "modern-science.atomic_structure": 240,
  "modern-science.electromagnetic_theory": 5200,
  "modern-science.electromagnetic_evidence": 520,
  "modern-science.electromagnetism": 200,
  "modern-science.electric_power_engineering": 280,
  "modern-science.optical_instruments": 4600,
  "modern-science.microscopic_evidence": 700,
  "modern-science.cell_theory": 320,
};

/**
 * Soft research-environment profiles. Dependencies still decide eligibility;
 * these weights only change how quickly eligible work accumulates.
 */
const RESEARCH_SUPPORT: Record<string, Record<string, number>> = {
  "modern-science.human_anatomy": { "systematic-observation": 0.65, "durable-records": 0.35 },
  "modern-science.atomic_theory": { "durable-records": 0.35, "knowledge-networks": 0.45, "systematic-observation": 0.20 },
  "modern-science.atomic_evidence": { "precision-craft": 0.55, "institutional-coordination": 0.45 },
  "modern-science.atomic_structure": { "durable-records": 0.35, "knowledge-networks": 0.40, "precision-craft": 0.25 },
  "modern-science.electromagnetic_theory": { "systematic-observation": 0.25, "durable-records": 0.30, "knowledge-networks": 0.45 },
  "modern-science.electromagnetic_evidence": { "precision-craft": 0.60, "institutional-coordination": 0.40 },
  "modern-science.electromagnetism": { "durable-records": 0.25, "knowledge-networks": 0.45, "institutional-coordination": 0.30 },
  "modern-science.electric_power_engineering": { "precision-craft": 0.50, "knowledge-networks": 0.20, "institutional-coordination": 0.30 },
  "modern-science.optical_instruments": { "precision-craft": 0.70, "durable-records": 0.15, "knowledge-networks": 0.15 },
  "modern-science.microscopic_evidence": { "precision-craft": 0.55, "systematic-observation": 0.30, "durable-records": 0.15 },
  "modern-science.cell_theory": { "durable-records": 0.30, "knowledge-networks": 0.45, "institutional-coordination": 0.25 },
};

interface DevelopmentSignal {
  id: string;
  label: string;
  strength: number;
}

const PUBLIC_LABELS: Record<string, string> = {
  "modern-science.electromagnetic_phenomena": "雷电与磁石现象",
  "modern-science.material_change_observation": "物质变化经验",
  "modern-science.living_bodies_have_structure": "人体结构经验",
  "modern-science.human_anatomy": "人体解剖",
  "modern-science.atomic_theory": "原子理论",
  "modern-science.atomic_evidence": "原子证据",
  "modern-science.atomic_structure": "原子结构",
  "modern-science.electromagnetic_theory": "电磁理论",
  "modern-science.electromagnetic_evidence": "电磁实验",
  "modern-science.electromagnetism": "电磁规律",
  "modern-science.electric_power_engineering": "电力工程",
  "modern-science.optical_instruments": "光学仪器",
  "modern-science.microscopic_evidence": "显微证据",
  "modern-science.cell_theory": "细胞理论",
};

function readDevelopmentSignals(world: import("@openlife/contracts").WorldView): DevelopmentSignal[] {
  const era = world.getComponent(WORLD_ENTITY_ID, "historical-era.state") ?? {};
  if (!Array.isArray(era.developmentSignals)) return [];
  return era.developmentSignals.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const signal = value as Record<string, unknown>;
    const id = typeof signal.id === "string" ? signal.id : "";
    if (!id) return [];
    return [{
      id,
      label: typeof signal.label === "string" ? signal.label : id,
      strength: Math.max(0, Math.min(1, Number(signal.strength) || 0)),
    }];
  });
}

function researchEnvironment(
  world: import("@openlife/contracts").WorldView,
  knowledgeId: string,
): { multiplier: number; matched: string[] } {
  const profile = RESEARCH_SUPPORT[knowledgeId];
  if (!profile) return { multiplier: 1, matched: [] };
  const signals = readDevelopmentSignals(world);
  if (signals.length === 0) return { multiplier: 1, matched: [] };
  const byId = new Map(signals.map((signal) => [signal.id, signal]));
  const entries = Object.entries(profile);
  const weightTotal = entries.reduce((sum, [, weight]) => sum + weight, 0) || 1;
  let support = 0;
  const matched: string[] = [];
  for (const [signalId, weight] of entries) {
    const signal = byId.get(signalId);
    if (!signal) continue;
    support += signal.strength * weight;
    if (signal.strength >= 0.25) matched.push(signal.label);
  }
  const normalized = support / weightTotal;
  return {
    // Era context is a soft accelerator/brake, never an unlock. 0.55..2.0.
    multiplier: 0.55 + normalized * 1.45,
    matched,
  };
}

export const modernScienceModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Modern Science",
    description: "Scientific reality, observations and civilization knowledge discovery.",
    requires: ["life.population"],
    optional: ["history.era-context"],
    provides: ["knowledge.modern-science"],
    capabilities: [
      "component.register",
      "knowledge.register",
      "rule.reaction.register",
      "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({
      id: ScienceComponents.worldLaws,
      persist: true,
      description: "Hidden modern-world scientific truths fixed when the world is created.",
    });
    ctx.registerComponent({
      id: ScienceComponents.civilizationKnowledge,
      persist: true,
      description: "Knowledge currently available to modern civilization.",
    });

    for (const definition of KNOWLEDGE) ctx.registerKnowledge(definition);

    ctx.registerReactionRule({
      id: "modern-science.world_initialized.seed",
      eventType: "modern.world_initialized",
      react: () => [
        {
          kind: "setComponent",
          entityId: WORLD_ENTITY_ID,
          component: ScienceComponents.worldLaws,
          value: {
            matterIsAtomic: true,
            electromagnetismExists: true,
            livingBodiesAreCellular: true,
            knowledgeDoesNotChangeReality: true,
          },
          reason: "modern scientific reality is fixed at world creation",
        },
        {
          kind: "setComponent",
          entityId: WORLD_ENTITY_ID,
          component: ScienceComponents.civilizationKnowledge,
          value: {
            known: INITIAL_KNOWN,
            progress: {},
            discoveries: [],
            establishedAt: 0,
          },
          reason: "seed civilization with era-appropriate initial observations",
        },
      ],
    });

    ctx.registerReactionRule({
      id: "modern-science.year_passed.research",
      eventType: "modern.year_passed",
      react: (c) => {
        const state = c.world.getComponent(
          WORLD_ENTITY_ID,
          ScienceComponents.civilizationKnowledge,
        ) ?? { known: INITIAL_KNOWN, progress: {}, discoveries: [] };

        const known = Array.isArray(state.known)
          ? state.known.filter((id): id is string => typeof id === "string")
          : [...INITIAL_KNOWN];
        const knownAtStart = new Set(known);
        const rawProgress = state.progress && typeof state.progress === "object" && !Array.isArray(state.progress)
          ? state.progress as Record<string, unknown>
          : {};
        const progress: Record<string, number> = Object.fromEntries(
          Object.entries(rawProgress).map(([id, value]) => [id, Number(value) || 0]),
        );
        const discoveries = Array.isArray(state.discoveries)
          ? [...state.discoveries]
          : [];
        const newlyKnown: { id: string; label: string; kind: string }[] = [];

        for (const node of KNOWLEDGE) {
          if (knownAtStart.has(node.id)) continue;
          const dependencies = node.dependsOn ?? [];
          if (!dependencies.every((dependency) => knownAtStart.has(dependency))) continue;

          const difficulty = DISCOVERY_DIFFICULTY[node.id] ?? 1000;
          const environment = researchEnvironment(c.world, node.id);
          const baseEffort = 0.8 + Math.min(2.2, knownAtStart.size * 0.12) + c.rng.nextFloat() * 0.4;
          const effort = baseEffort * environment.multiplier;
          const next = (progress[node.id] ?? 0) + effort;
          progress[node.id] = next;
          if (next < difficulty) continue;

          known.push(node.id);
          progress[node.id] = difficulty;
          discoveries.push({ id: node.id, at: c.world.tick });
          newlyKnown.push({
            id: node.id,
            label: PUBLIC_LABELS[node.id] ?? node.id,
            kind: node.kind,
          });
        }

        const effects: import("@openlife/contracts").Effect[] = [{
          kind: "modifyComponent",
          entityId: WORLD_ENTITY_ID,
          component: ScienceComponents.civilizationKnowledge,
          patch: { known, progress, discoveries },
          reason: "civilization accumulated evidence through eligible knowledge dependencies",
        }];

        for (const discovery of newlyKnown) {
          effects.push({
            kind: "emitEvent",
            eventType: "modern-science.discovery_made",
            data: discovery,
            historicalSignificance:
              discovery.kind === "knowledge" || discovery.kind === "capability" ? 0.65 : 0.35,
            visibility: "public",
          });
        }
        return effects;
      },
    });

    ctx.registerProjection({
      id: "modern-science.civilization",
      description: "What modern civilization publicly knows, without exposing hidden world laws.",
      build: ({ world }) => {
        const state = world.getComponent(
          WORLD_ENTITY_ID,
          ScienceComponents.civilizationKnowledge,
        ) ?? { known: [] };
        const known = Array.isArray(state.known)
          ? state.known.filter((id): id is string => typeof id === "string")
          : [];
        const knownSet = new Set(known);
        const frontier = KNOWLEDGE
          .filter((node) => !knownSet.has(node.id))
          .filter((node) => (node.dependsOn ?? []).every((dependency) => knownSet.has(dependency)));
        const frontierEnvironments = frontier.map((node) => researchEnvironment(world, node.id));
        const averageSupport = frontierEnvironments.length > 0
          ? frontierEnvironments.reduce((sum, item) => sum + item.multiplier, 0) / frontierEnvironments.length
          : 1;
        const signals = readDevelopmentSignals(world);
        return {
          knownCount: known.length,
          established: known
            .filter((id) => PUBLIC_LABELS[id])
            .map((id) => ({ id, label: PUBLIC_LABELS[id] })),
          frontierCount: frontier.length,
          researchEnvironment: {
            supportMultiplier: Number(averageSupport.toFixed(2)),
            signals: signals
              .filter((signal) => signal.strength >= 0.25)
              .sort((a, b) => b.strength - a.strength)
              .map((signal) => ({ id: signal.id, label: signal.label, strength: signal.strength })),
          },
        };
      },
    });
  },
};
