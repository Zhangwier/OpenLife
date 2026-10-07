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
    kind: "phenomenon",
    description: "Electric and magnetic phenomena are observable in the world.",
    tags: ["physics", "electricity"],
  },
  {
    id: "modern-science.electromagnetism",
    kind: "knowledge",
    description: "Civilization has a predictive theory of electromagnetism.",
    dependsOn: ["modern-science.electromagnetic_phenomena"],
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
    id: "modern-science.matter_has_atomic_structure",
    kind: "phenomenon",
    description: "Matter exhibits behavior consistent with an atomic structure.",
    tags: ["physics", "matter"],
  },
  {
    id: "modern-science.atomic_structure",
    kind: "knowledge",
    description: "Civilization understands matter in terms of atoms and subatomic structure.",
    dependsOn: ["modern-science.matter_has_atomic_structure"],
    tags: ["physics", "matter"],
  },
  {
    id: "modern-science.living_bodies_have_structure",
    kind: "phenomenon",
    description: "Living bodies have stable observable anatomical structures.",
    tags: ["biology", "medicine"],
  },
  {
    id: "modern-science.human_anatomy",
    kind: "knowledge",
    description: "Civilization has systematic knowledge of human anatomy.",
    dependsOn: ["modern-science.living_bodies_have_structure"],
    tags: ["biology", "medicine"],
  },
  {
    id: "modern-science.cell_theory",
    kind: "knowledge",
    description: "Civilization understands living organisms as cellular systems.",
    dependsOn: ["modern-science.living_bodies_have_structure"],
    tags: ["biology"],
  },
];

const INITIAL_KNOWN = [
  "modern-science.electromagnetic_phenomena",
  "modern-science.electromagnetism",
  "modern-science.electric_power_engineering",
  "modern-science.matter_has_atomic_structure",
  "modern-science.atomic_structure",
  "modern-science.living_bodies_have_structure",
  "modern-science.human_anatomy",
  "modern-science.cell_theory",
];

const PUBLIC_LABELS: Record<string, string> = {
  "modern-science.electromagnetism": "电磁规律",
  "modern-science.electric_power_engineering": "电力工程",
  "modern-science.atomic_structure": "原子结构",
  "modern-science.human_anatomy": "人体解剖",
  "modern-science.cell_theory": "细胞理论",
};

export const modernScienceModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Modern Science",
    description: "Modern-world scientific reality and civilization knowledge graph.",
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
            establishedAt: 0,
          },
          reason: "seed modern civilization's initial scientific knowledge",
        },
      ],
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
        return {
          knownCount: known.length,
          established: known
            .filter((id) => PUBLIC_LABELS[id])
            .map((id) => ({ id, label: PUBLIC_LABELS[id] })),
        };
      },
    });
  },
};
