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

export const modernScienceModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Modern Science",
    description: "Scientific reality, observations and civilization knowledge discovery.",
    requires: ["life.population"],
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
          const effort = 0.8 + Math.min(2.2, knownAtStart.size * 0.12) + c.rng.nextFloat() * 0.4;
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
        const frontierCount = KNOWLEDGE
          .filter((node) => !knownSet.has(node.id))
          .filter((node) => (node.dependsOn ?? []).every((dependency) => knownSet.has(dependency)))
          .length;
        return {
          knownCount: known.length,
          established: known
            .filter((id) => PUBLIC_LABELS[id])
            .map((id) => ({ id, label: PUBLIC_LABELS[id] })),
          frontierCount,
        };
      },
    });
  },
};
