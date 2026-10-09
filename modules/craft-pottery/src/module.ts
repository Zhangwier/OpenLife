/**
 * Pottery craft vertical slice.
 *
 * A physical craft Practice with several player-facing decisions. Choices alter
 * material state, downstream risk and final artifact quality. Resource/Process
 * definitions describe the material chain while this domain module owns the
 * actual simulation math.
 */

import type { Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  PracticeComponents,
  PracticeRelations,
  type PracticeCheckpointResolutionDecision,
  type PracticeRuntimeApi,
} from "@openlife/module-practice-runtime";
import { ObjectComponents, ObjectKinds, ObjectRelations, ownerOf, holderOf, prototypeOf, readObject } from "@openlife/module-world-objects";
import { occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";

const OWNER = "craft-pottery";

export const PotteryPracticeDefinitions = {
  prepareClay: "craft-pottery.prepare-clay",
  makeVessel: "craft-pottery.make-vessel",
} as const;

export const PotteryResources = {
  clay: "craft-pottery.clay",
  fuel: "craft-pottery.fuel",
  preparedClay: "craft-pottery.prepared-clay",
  greenware: "craft-pottery.greenware",
  dryGreenware: "craft-pottery.dry-greenware",
  pottery: "craft-pottery.pottery",
} as const;

export const PotteryProcesses = {
  prepareClay: "craft-pottery.prepare-clay-process",
  formVessel: "craft-pottery.form-vessel-process",
  dryVessel: "craft-pottery.dry-vessel-process",
  fireVessel: "craft-pottery.fire-vessel-process",
} as const;

export const PotteryKinds = {
  vessel: "craft-pottery.vessel",
} as const;

export const PotteryComponents = {
  inventory: "craft-pottery.inventory",
  vessel: "craft-pottery.vessel",
} as const;

export const PotteryRelations = {
  craftedBy: "craft-pottery.crafted_by",
} as const;

interface ClayState {
  moisture: number;
  impurities: number;
  uniformity: number;
  plasticity: number;
  materialMass: number;
  prepTime: number;
  effort: number;
  hasSieve: boolean;
  hasDryClay: boolean;
}

export const craftPotteryModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "Pottery Craft Prototype",
    description: "Player-facing physical craft choices from clay preparation through firing.",
    requires: ["practice.runtime"],
    provides: ["craft.pottery-practice"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "resource.register",
      "process.register",
      "projection.register",
    ],
  },

  register(ctx) {
    const practice = ctx.registry.capabilityImplementation("practice.runtime") as PracticeRuntimeApi | undefined;
    if (!practice) throw new Error("pottery craft requires the practice.runtime implementation");

    registerMaterialVocabulary(ctx);

    ctx.registerComponent({ id: PotteryComponents.inventory, persist: true, description: "Local clay and kiln fuel currently available to a potter." });
    ctx.registerComponent({ id: PotteryComponents.vessel, persist: true, description: "A fired or failed pottery artifact with its production trace." });
    ctx.registerRelation({
      id: PotteryRelations.craftedBy,
      allowedFrom: [PotteryKinds.vessel],
      persist: true,
      description: "World-truth relation from a pottery artifact to its maker.",
    });

    registerMaterialPreparationCommand(ctx);
    registerVillagePotteryMaterials(ctx);

    practice.registerDefinition({
      id: PotteryPracticeDefinitions.prepareClay,
      category: "craft",
      description: "Assess and prepare one clay batch before shaping. This small Practice stops once the clay is prepared.",
      stages: ["assess-clay", "prepared"],
      advance: ({ practice: state }) => {
        const checkpointCount = Number(state.checkpointCount ?? 0);
        if (checkpointCount > 0) return { work: 0, nextStage: "prepared", complete: true };
        return clayPreparationDecision(clayState(objectValue(state.context)));
      },
      resolveCheckpoint: ({ practice: state, actionId }) => {
        const clay = clayState(objectValue(state.context));
        const resolved = applyClayPreparation(clay, actionId);
        return {
          nextStage: "prepared",
          contextPatch: {
            clay: resolved.clay as unknown as JsonValue,
            clayPreparation: preparationRecord(actionId, resolved),
          },
        } satisfies PracticeCheckpointResolutionDecision;
      },
    });

    practice.registerDefinition({
      id: PotteryPracticeDefinitions.makeVessel,
      category: "craft",
      description: "Make one vessel through clay preparation, forming, drying and firing decisions.",
      stages: ["assess-clay", "forming", "drying", "firing", "inspect"],
      canStart: ({ world, actorId }) => {
        const stock = world.getComponent(actorId, PotteryComponents.inventory) ?? {};
        if (Number(stock.clay ?? 0) < 1) {
          return { ok: false, code: "E_POTTERY_CLAY", message: "至少需要 1 份黏土才能开始制陶。" };
        }
        if (Number(stock.fuel ?? 0) < 2) {
          return { ok: false, code: "E_POTTERY_FUEL", message: "至少需要 2 份燃料才能完成最低强度的烧制。" };
        }
        return { ok: true };
      },
      advance: ({ world, practiceId, practice: state }) => {
        const context = objectValue(state.context);
        const checkpointCount = Number(state.checkpointCount ?? 0);
        if (checkpointCount === 0) return clayPreparationDecision(clayState(context));
        if (checkpointCount === 1) return formingDecision(context);
        if (checkpointCount === 2) return dryingDecision(context);
        if (checkpointCount === 3) return firingDecision(world, practiceId, context);
        return { work: 0.5, nextStage: "inspect", complete: true };
      },
      resolveCheckpoint: ({ practice: state, checkpoint, actionId }) => {
        const context = objectValue(state.context);
        const type = String(checkpoint.type ?? "");
        if (type === "clay-preparation-choice") {
          const resolved = applyClayPreparation(clayState(context), actionId);
          return {
            nextStage: "forming",
            contextPatch: {
              clay: resolved.clay as unknown as JsonValue,
              clayPreparation: preparationRecord(actionId, resolved),
            },
          };
        }
        if (type === "pottery-forming-choice") return resolveForming(context, actionId);
        if (type === "pottery-drying-choice") return resolveDrying(context, actionId);
        if (type === "pottery-firing-choice") return resolveFiring(context, actionId);
        return {};
      },
    });

    ctx.registerReactionRule({
      id: "craft-pottery.practice_started.reserve_clay",
      eventType: "practice-runtime.started",
      react: (c) => {
        if (c.event.data.definitionId !== PotteryPracticeDefinitions.makeVessel) return [];
        const makerId = c.event.actorId;
        if (!makerId) return [];
        const stock = c.world.getComponent(makerId, PotteryComponents.inventory) ?? {};
        return [{
          kind: "modifyComponent",
          entityId: makerId,
          component: PotteryComponents.inventory,
          patch: { clay: Math.max(0, Number(stock.clay ?? 0) - 1) },
          reason: "one clay batch committed to the vessel Practice",
        }];
      },
    });

    ctx.registerReactionRule({
      id: "craft-pottery.firing_resolved.materialize_vessel",
      eventType: "practice-runtime.checkpoint_resolved",
      react: (c) => {
        if (c.event.data.definitionId !== PotteryPracticeDefinitions.makeVessel) return [];
        const checkpoint = c.event.targetId ? c.world.getEntity(c.event.targetId) : undefined;
        if (checkpoint?.components[PracticeComponents.checkpoint]?.type !== "pottery-firing-choice") return [];
        const practiceId = String(c.event.data.practiceId ?? "");
        const practiceEntity = practiceId ? c.world.getEntity(practiceId) : undefined;
        const context = objectValue(practiceEntity?.components[PracticeComponents.practice]?.context);
        const makerId = makerOf(c.world, practiceId) || c.event.actorId || "";
        if (!makerId) return [];
        const stock = c.world.getComponent(makerId, PotteryComponents.inventory) ?? {};
        const fuelUsed = Math.max(0, numberValue(context.fuelUsed, 0));
        if (Number(stock.fuel ?? 0) < fuelUsed) return [];

        const result = potteryQuality(context, c.rng.nextFloat());
        const vesselId = `craft-pottery:vessel:${c.world.tick}:${c.rng.nextInt(1, 1_000_000_000)}`;
        return [
          {
            kind: "modifyComponent",
            entityId: makerId,
            component: PotteryComponents.inventory,
            patch: { fuel: Math.max(0, Number(stock.fuel ?? 0) - fuelUsed) },
            reason: "kiln firing consumed fuel",
          },
          {
            kind: "spawnEntity",
            localId: "vessel",
            id: vesselId,
            entityKind: PotteryKinds.vessel,
            components: {
              [PotteryComponents.vessel]: {
                status: result.score < 0.22 ? "failed" : "fired",
                quality: result.grade,
                score: result.score,
                defects: result.defects,
                madeAt: c.world.tick,
                practiceId,
                processTrace: [
                  PotteryProcesses.prepareClay,
                  PotteryProcesses.formVessel,
                  PotteryProcesses.dryVessel,
                  PotteryProcesses.fireVessel,
                ],
                clayPreparation: objectValue(context.clayPreparation).actionId ?? "unknown",
                formingStrategy: objectValue(context.forming).actionId ?? "unknown",
                dryingStrategy: objectValue(context.drying).actionId ?? "unknown",
                firingStrategy: objectValue(context.firing).actionId ?? "unknown",
                fuelUsed,
              },
            },
            announce: false,
          },
          {
            kind: "addRelation",
            type: PotteryRelations.craftedBy,
            from: vesselId,
            to: makerId,
            announce: false,
          },
          {
            kind: "emitEvent",
            eventType: "craft-pottery.vessel_fired",
            actorId: makerId,
            targetId: vesselId,
            data: { practiceId, quality: result.grade, score: result.score, defects: result.defects },
            historicalSignificance: result.score >= 0.82 ? 0.18 : 0.04,
          },
        ] as Effect[];
      },
    });

    ctx.registerProjection({
      id: "craft-pottery.workshop",
      description: "One potter's material stock and finished vessels.",
      build: ({ world, params }) => {
        const makerId = String(params.makerId ?? "");
        return {
          makerId,
          inventory: makerId
            ? world.getComponent(makerId, PotteryComponents.inventory) ?? { clay: 0, fuel: 0 }
            : { clay: 0, fuel: 0 },
          vessels: world.listRelations({ type: PotteryRelations.craftedBy, to: makerId }).map((relation) => {
            const vessel = world.getEntity(relation.from);
            return vessel ? { id: vessel.id, ...vessel.components[PotteryComponents.vessel] } : null;
          }).filter(Boolean),
        };
      },
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

function registerMaterialVocabulary(ctx: Registration): void {
  ctx.registerResource({ id: PotteryResources.clay, unit: "batch", description: "Workable raw clay.", tags: ["material"] });
  ctx.registerResource({ id: PotteryResources.fuel, unit: "bundle", description: "Combustible kiln fuel.", tags: ["fuel"] });
  ctx.registerResource({ id: PotteryResources.preparedClay, unit: "batch", description: "Conditioned clay ready for forming.", tags: ["intermediate"] });
  ctx.registerResource({ id: PotteryResources.greenware, unit: "piece", description: "Formed but still damp pottery.", tags: ["intermediate"] });
  ctx.registerResource({ id: PotteryResources.dryGreenware, unit: "piece", description: "Dry vessel ready for firing.", tags: ["intermediate"] });
  ctx.registerResource({ id: PotteryResources.pottery, unit: "piece", description: "Fired ceramic artifact.", tags: ["artifact"] });

  ctx.registerProcess({ id: PotteryProcesses.prepareClay, consumes: { [PotteryResources.clay]: 1 }, produces: { [PotteryResources.preparedClay]: 1 }, description: "Prepare raw clay for forming." });
  ctx.registerProcess({ id: PotteryProcesses.formVessel, consumes: { [PotteryResources.preparedClay]: 1 }, produces: { [PotteryResources.greenware]: 1 }, dependsOn: [PotteryProcesses.prepareClay], description: "Form prepared clay into greenware." });
  ctx.registerProcess({ id: PotteryProcesses.dryVessel, consumes: { [PotteryResources.greenware]: 1 }, produces: { [PotteryResources.dryGreenware]: 1 }, dependsOn: [PotteryProcesses.formVessel], description: "Dry greenware before firing." });
  ctx.registerProcess({ id: PotteryProcesses.fireVessel, consumes: { [PotteryResources.dryGreenware]: 1, [PotteryResources.fuel]: 3 }, produces: { [PotteryResources.pottery]: 1 }, dependsOn: [PotteryProcesses.dryVessel], description: "Fire dry greenware; actual fuel use depends on the player's firing strategy." });
}

function registerMaterialPreparationCommand(ctx: Registration): void {
  ctx.registerCommand({
    type: "craft-pottery.prepare_materials",
    description: "Prototype handoff of gathered clay and fuel into the local pottery stock.",
  });
  ctx.registerConstraintRule({
    id: "craft-pottery.prepare_materials.allowed",
    commandType: "craft-pottery.prepare_materials",
    evaluate: (c) => c.command.actorId && c.world.hasEntity(c.command.actorId)
      ? { ok: true }
      : { ok: false, code: "E_POTTERY_ACTOR", message: "existing actor required" },
  });
  ctx.registerResolutionRule({
    id: "craft-pottery.prepare_materials.resolve",
    commandType: "craft-pottery.prepare_materials",
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const current = c.world.getComponent(actorId, PotteryComponents.inventory) ?? {};
      return [{
        kind: "setComponent",
        entityId: actorId,
        component: PotteryComponents.inventory,
        value: {
          clay: Number(current.clay ?? 0) + nonNegative(c.command.payload.clay),
          fuel: Number(current.fuel ?? 0) + nonNegative(c.command.payload.fuel),
        },
        reason: "pottery materials prepared for workshop use",
      }];
    },
  });
}

/** Convert genuinely owned, carried material instances into legacy workshop stock.
 * This bridge conserves resources; old craft saves remain readable.
 */
function registerVillagePotteryMaterials(ctx: Registration): void {
  const type = "craft-pottery.load_village_materials";
  ctx.registerCommand({ type, description: "Stage one real clay and two real fuel bundles for pottery." });
  const inputs = (c: { world: WorldView; command: { actorId?: string; payload: Record<string, JsonValue> } }) => {
    const clayId = String(c.command.payload.clayId ?? "");
    const fuelIds = c.command.payload.fuelIds;
    return { clayId, fuelIds: Array.isArray(fuelIds) ? fuelIds.map(String) : [] };
  };
  ctx.registerConstraintRule({
    id: `${type}.allowed`, commandType: type,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const { clayId, fuelIds } = inputs(c);
      if (occupiedPlaceId(c.world, actorId) !== "place:kiln" ||
          occupiedSpaceId(c.world, actorId) !== "space:kiln-mouth") {
        return { ok: false, code: "E_POTTERY_WRONG_PLACE", message: "要站在陶窑的窑口，才能备好制陶材料。" };
      }
      if (!clayId || fuelIds.length !== 2 || new Set([clayId, ...fuelIds]).size !== 3) {
        return { ok: false, code: "E_POTTERY_MATERIALS", message: "需要 1 份黏土和 2 捆独立的柴草。" };
      }
      for (const [id, resourceId] of [[clayId, "resource:clay"], ...fuelIds.map(id => [id, "resource:fuel"])] as [string, string][]) {
        const entity = c.world.getEntity(id);
        if (!entity || entity.archivedAt !== undefined || entity.kind !== ObjectKinds.item ||
            ownerOf(c.world, id) !== actorId || holderOf(c.world, id) !== actorId ||
            prototypeOf(c.world, id).resourceId !== resourceId ||
            readObject(entity.components[ObjectComponents.object]).quantity !== 1) {
          return { ok: false, code: "E_POTTERY_MATERIALS", message: "制陶必须使用自己确实携带的黏土和柴草。" };
        }
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${type}.resolve`, commandType: type,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const { clayId, fuelIds } = inputs(c);
      const stock = c.world.getComponent(actorId, PotteryComponents.inventory) ?? {};
      const effects: Effect[] = [];
      for (const itemId of [clayId, ...fuelIds]) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: itemId, to: actorId, reason: "transferred into pottery workshop", announce: false,
        }, {
          kind: "archiveEntity", entityId: itemId,
          reason: "material allocated to pottery workshop", announce: false,
        });
      }
      effects.push({
        kind: "setComponent", entityId: actorId, component: PotteryComponents.inventory,
        value: { clay: Number(stock.clay ?? 0) + 1, fuel: Number(stock.fuel ?? 0) + 2 },
        reason: "actual village clay and fuel entered pottery stock",
      }, {
        kind: "emitEvent", eventType: "craft-pottery.village_materials_staged",
        actorId, targetId: actorId, data: { clayId, fuelIds, clay: 1, fuel: 2 },
        historicalSignificance: 0.01,
      });
      return effects;
    },
  });
}

function clayPreparationDecision(clay: ClayState) {
  return {
    work: 0.5,
    nextStage: "assess-clay",
    checkpoint: {
      type: "clay-preparation-choice",
      interactionMode: "choice",
      context: {
        prompt: "这批黏土含水偏高、夹有杂质。你准备怎样处理，再进入成型？",
        clay: clay as unknown as JsonValue,
      },
      candidateActions: [
        { id: "knead-now", label: "直接反复揉泥", hint: "最快进入成型；均匀性会提高，但高含水和杂质问题基本保留。", autonomyWeight: 1 },
        { id: "air-dry-first", label: "先摊开阴干，再揉泥", hint: "耗时更长，但能明显降低含水量；处理过久也可能让表层先变干。", autonomyWeight: 2 },
        { id: "screen-and-knead", label: "筛除杂质后再揉泥", hint: "减少杂质、提高均匀性，但会损失一部分材料并花更多时间。", enabled: clay.hasSieve, disabledReason: clay.hasSieve ? undefined : "当前没有筛具，无法有效筛除杂质。", autonomyWeight: 2 },
        { id: "rest-covered", label: "包覆静置，让水分重新均衡", hint: "几乎不损失材料，能改善内部均匀性，但需要等待，含水量下降有限。", autonomyWeight: 2 },
        { id: "blend-dry-clay", label: "掺入较干泥料重新混合", hint: "能较快降低整体含水量并增加可用泥料，但混合不足会造成局部不均。", enabled: clay.hasDryClay, disabledReason: clay.hasDryClay ? undefined : "当前没有额外的较干泥料。", autonomyWeight: 1 },
      ],
    },
  };
}

function formingDecision(context: Record<string, JsonValue>) {
  const clay = clayState(context);
  const thinReady = clay.uniformity >= 0.58 && clay.plasticity >= 0.62;
  const narrowReady = clay.uniformity >= 0.7 && clay.plasticity >= 0.68 && clay.moisture <= 0.68;
  return {
    work: 0.75,
    nextStage: "forming",
    checkpoint: {
      type: "pottery-forming-choice",
      interactionMode: "choice",
      context: {
        prompt: "泥料已经处理好。你准备怎样成型？",
        moisture: clay.moisture,
        plasticity: clay.plasticity,
        uniformity: clay.uniformity,
        note: "复杂器形不是固定科技锁；当前泥料状态会决定某些路线是否现实可行。",
      },
      candidateActions: [
        { id: "pinch-bowl", label: "捏塑成开口碗", hint: "最容易控制：容量较小、造型普通，但成型稳定、后续风险低。", autonomyWeight: 3 },
        { id: "coil-balanced", label: "盘条法做均衡陶罐", hint: "容量、重量、耐用和风险比较均衡，适合日常实用品。", autonomyWeight: 4 },
        { id: "reinforced-base", label: "重点加固底部和受力位置", hint: "更耐磕碰、放置更稳，但更重，底部较厚也会增加干燥不均风险。", autonomyWeight: 2 },
        { id: "thick-storage", label: "做厚壁大容量储存罐", hint: "容量和耐碰撞更高，但重量大、耗泥多，厚壁会显著增加干燥难度。", autonomyWeight: 2 },
        {
          id: "thin-refined",
          label: "追求薄而均匀的轻巧器壁",
          hint: "更轻、精细潜力更高，但对泥料均匀性和可塑性要求明显更高。",
          enabled: thinReady,
          disabledReason: thinReady ? undefined : "当前泥料还不够均匀或可塑，强行做薄壁很容易局部破裂。",
          autonomyWeight: 2,
        },
        {
          id: "narrow-neck",
          label: "挑战高身窄口复杂器形",
          hint: "容量利用和造型潜力高，但对含水、均匀性和支撑能力要求最高。",
          enabled: narrowReady,
          disabledReason: narrowReady ? undefined : "当前泥料的含水、均匀性或可塑性不足以稳定支撑高身窄口器形。",
          autonomyWeight: 1,
        },
      ],
    },
  };
}

function dryingDecision(context: Record<string, JsonValue>) {
  const forming = objectValue(context.forming);
  const clay = clayState(context);
  const wallThickness = clamp01(numberValue(forming.wallThickness, 0.5));
  const weight = clamp01(numberValue(forming.weight, 0.5));
  const initialResidualMoisture = clamp01(
    0.18
    + clay.moisture * 0.42
    + wallThickness * 0.24
    + weight * 0.08,
  );
  const kilnReady = initialResidualMoisture <= 0.48 && numberValue(forming.dryingRisk, 0) <= 0.5;
  return {
    work: 0.5,
    nextStage: "drying",
    checkpoint: {
      type: "pottery-drying-choice",
      interactionMode: "choice",
      context: {
        prompt: "湿坯已经成型。现在不只是等时间过去：你要判断怎样把它干到适合入窑。",
        wallThickness,
        weight,
        clayMoisture: clay.moisture,
        initialResidualMoisture,
        currentRisk: forming.dryingRisk ?? 0,
        kilnReadiness: kilnReady ? "ready-enough" : "too-wet-or-unstable",
      },
      candidateActions: [
        { id: "slow-shade", label: "阴凉处慢慢干燥", hint: "耗时最长但最均匀，能明显降低内外湿差；尤其适合厚壁、加固底部和复杂器形。", autonomyWeight: 4 },
        { id: "turn-regularly", label: "通风阴干并定期翻转", hint: "速度和稳定性比较均衡，能减少底部长期积湿，但需要持续照看。", autonomyWeight: 4 },
        { id: "sun-fast", label: "直接日晒快速脱水", hint: "最快之一，但表层会先收缩，内外湿差和裂纹风险明显增加。", autonomyWeight: 1 },
        { id: "near-hearth", label: "靠近炉火加速干燥", hint: "能较快降低水分，但局部受热会增加翘曲和暗裂风险。", autonomyWeight: 1 },
        { id: "extended-rest", label: "延长阴干，等内部水分进一步迁移", hint: "比普通阴干更耗时间，残余水分更低；适合你愿意用时间换更稳定入窑条件的情况。", autonomyWeight: 3 },
        {
          id: "kiln-now",
          label: "结束干燥，按当前状态准备入窑",
          hint: "省去额外等待，但会把当前残余水分和结构风险原样带进烧制。",
          enabled: kilnReady,
          disabledReason: kilnReady ? undefined : "当前坯体仍偏湿或干燥风险过高，直接准备入窑很容易在升温时开裂甚至爆裂。",
          autonomyWeight: kilnReady ? 1 : 0,
        },
      ],
    },
  };
}

function firingDecision(world: WorldView, practiceId: string, context: Record<string, JsonValue>) {
  const makerId = makerOf(world, practiceId);
  const stock = makerId ? world.getComponent(makerId, PotteryComponents.inventory) ?? {} : {};
  const fuel = Number(stock.fuel ?? 0);
  const drying = objectValue(context.drying);
  const residualMoisture = clamp01(numberValue(drying.residualMoisture, 0.2));
  const moistureGradient = clamp01(numberValue(drying.moistureGradient, 0.12));
  const warpingRisk = clamp01(numberValue(drying.warpingRisk, 0.1));
  const bodyCondition = residualMoisture <= 0.12 && moistureGradient <= 0.14 && warpingRisk <= 0.16
    ? "stable"
    : residualMoisture <= 0.24 && moistureGradient <= 0.24
      ? "caution"
      : "fragile";
  return {
    work: 0.75,
    nextStage: "firing",
    checkpoint: {
      type: "pottery-firing-choice",
      interactionMode: "choice",
      context: {
        prompt: "陶坯准备入窑。你要根据残余水分、内外湿差和坯体稳定性决定火候路线。",
        availableFuel: fuel,
        residualMoisture,
        moistureGradient,
        warpingRisk,
        bodyCondition,
      },
      candidateActions: [
        {
          id: "low-slow",
          label: "低火慢烧",
          hint: "消耗 2 份燃料。热冲击最小，对偏湿坯体最宽容，但烧结不足、器体偏软的概率较高。",
          enabled: fuel >= 2,
          disabledReason: fuel >= 2 ? undefined : "至少需要 2 份燃料。",
          autonomyWeight: bodyCondition === "fragile" ? 4 : 2,
        },
        {
          id: "staged-preheat",
          label: "先低火预热，再逐步升温",
          hint: "消耗 3 份燃料。先给残余水分排出的时间，再进入较高火候；更慢，但对湿差较大的坯体更安全。",
          enabled: fuel >= 3,
          disabledReason: fuel >= 3 ? undefined : "至少需要 3 份燃料。",
          autonomyWeight: bodyCondition === "stable" ? 3 : 5,
        },
        {
          id: "gradual-hot",
          label: "平稳升温到较高火候",
          hint: "消耗 3 份燃料。烧结、强度和稳定性较均衡；坯体越干燥均匀，收益越明显。",
          enabled: fuel >= 3,
          disabledReason: fuel >= 3 ? undefined : "至少需要 3 份燃料。",
          autonomyWeight: bodyCondition === "stable" ? 5 : 3,
        },
        {
          id: "hot-fast",
          label: "快速推到高火",
          hint: "消耗 4 份燃料。烧成潜力最高，但会显著放大残余水分、湿差和既有翘曲风险；这是高收益高风险路线。",
          enabled: fuel >= 4,
          disabledReason: fuel >= 4 ? undefined : "至少需要 4 份燃料。",
          autonomyWeight: bodyCondition === "stable" ? 2 : 0.25,
        },
        {
          id: "pulse-fire",
          label: "强火与回落交替控制",
          hint: "消耗 3 份燃料。尝试用火候回落缓解局部温差，但控制复杂、过程波动更大。",
          enabled: fuel >= 3,
          disabledReason: fuel >= 3 ? undefined : "至少需要 3 份燃料。",
          autonomyWeight: 1,
        },
      ],
    },
  };
}

function resolveForming(context: Record<string, JsonValue>, actionId: string): PracticeCheckpointResolutionDecision {
  const prep = objectValue(context.clayPreparation);
  const prepRisks = objectValue(prep.downstreamRisks);
  const clay = clayState(context);
  const baseDryingRisk = numberValue(prepRisks.moistureCrackRisk, 0.2)
    + numberValue(prepRisks.nonuniformDryingRisk, 0.1)
    + Math.max(0, clay.moisture - 0.62) * 0.35;
  const values: Record<string, Record<string, JsonValue>> = {
    "pinch-bowl": {
      wallThickness: 0.58, capacity: 0.42, durability: 0.56, weight: 0.48,
      shapingDifficulty: 0.18, formQuality: 0.08, handlingRisk: -0.04, dryingRisk: baseDryingRisk - 0.04,
    },
    "coil-balanced": {
      wallThickness: 0.52, capacity: 0.64, durability: 0.62, weight: 0.54,
      shapingDifficulty: 0.38, formQuality: 0.14, handlingRisk: 0, dryingRisk: baseDryingRisk,
    },
    "reinforced-base": {
      wallThickness: 0.62, capacity: 0.58, durability: 0.8, weight: 0.68,
      shapingDifficulty: 0.42, formQuality: 0.12, handlingRisk: -0.08, dryingRisk: baseDryingRisk + 0.09,
    },
    "thick-storage": {
      wallThickness: 0.82, capacity: 0.84, durability: 0.76, weight: 0.86,
      shapingDifficulty: 0.48, formQuality: 0.06, handlingRisk: -0.06, dryingRisk: baseDryingRisk + 0.2,
    },
    "thin-refined": {
      wallThickness: 0.3, capacity: 0.6, durability: 0.38, weight: 0.3,
      shapingDifficulty: 0.72, formQuality: 0.22 + clay.uniformity * 0.06,
      handlingRisk: 0.16, dryingRisk: baseDryingRisk + 0.04,
    },
    "narrow-neck": {
      wallThickness: 0.45, capacity: 0.72, durability: 0.52, weight: 0.5,
      shapingDifficulty: 0.86, formQuality: 0.24 + clay.plasticity * 0.06,
      handlingRisk: 0.24, dryingRisk: baseDryingRisk + 0.08,
    },
  };
  return { nextStage: "drying", contextPatch: { forming: { actionId, ...(values[actionId] ?? {}) } } };
}

function resolveDrying(context: Record<string, JsonValue>, actionId: string): PracticeCheckpointResolutionDecision {
  const forming = objectValue(context.forming);
  const clay = clayState(context);
  const wallThickness = clamp01(numberValue(forming.wallThickness, 0.5));
  const weight = clamp01(numberValue(forming.weight, 0.5));
  const initialRisk = clamp01(numberValue(forming.dryingRisk, 0.2));
  const initialResidualMoisture = clamp01(
    0.18
    + clay.moisture * 0.42
    + wallThickness * 0.24
    + weight * 0.08,
  );
  const values: Record<string, {
    riskAdjustment: number;
    quality: number;
    moistureReduction: number;
    moistureGradient: number;
    warpingRisk: number;
    dryingTime: number;
  }> = {
    "slow-shade": {
      riskAdjustment: -0.22, quality: 0.2, moistureReduction: 0.4,
      moistureGradient: 0.08, warpingRisk: 0.06, dryingTime: 3,
    },
    "turn-regularly": {
      riskAdjustment: -0.15, quality: 0.16, moistureReduction: 0.35,
      moistureGradient: 0.1, warpingRisk: 0.05, dryingTime: 2.2,
    },
    "sun-fast": {
      riskAdjustment: 0.24, quality: -0.08, moistureReduction: 0.34,
      moistureGradient: 0.38, warpingRisk: 0.2, dryingTime: 0.8,
    },
    "near-hearth": {
      riskAdjustment: 0.16, quality: 0.01, moistureReduction: 0.36,
      moistureGradient: 0.3, warpingRisk: 0.32, dryingTime: 0.7,
    },
    "extended-rest": {
      riskAdjustment: -0.27, quality: 0.18, moistureReduction: 0.48,
      moistureGradient: 0.05, warpingRisk: 0.04, dryingTime: 4.2,
    },
    "kiln-now": {
      riskAdjustment: 0.18, quality: -0.04, moistureReduction: 0,
      moistureGradient: 0.18, warpingRisk: 0.12, dryingTime: 0,
    },
  };
  const selected = values[actionId] ?? values["kiln-now"]!;
  const residualMoisture = clamp01(initialResidualMoisture - selected.moistureReduction);
  return {
    nextStage: "firing",
    contextPatch: {
      drying: {
        actionId,
        initialResidualMoisture,
        residualMoisture,
        moistureGradient: selected.moistureGradient,
        warpingRisk: selected.warpingRisk,
        dryingTime: selected.dryingTime,
        risk: clamp01(initialRisk + selected.riskAdjustment + residualMoisture * 0.18),
        quality: selected.quality,
      },
    },
  };
}

function resolveFiring(context: Record<string, JsonValue>, actionId: string): PracticeCheckpointResolutionDecision {
  const drying = objectValue(context.drying);
  const residualMoisture = clamp01(numberValue(drying.residualMoisture, 0.2));
  const moistureGradient = clamp01(numberValue(drying.moistureGradient, 0.12));
  const warpingRisk = clamp01(numberValue(drying.warpingRisk, 0.1));
  const inheritedInstability = clamp01(
    residualMoisture * 0.5
    + moistureGradient * 0.32
    + warpingRisk * 0.18,
  );
  const values: Record<string, {
    fuelUsed: number;
    quality: number;
    thermalMultiplier: number;
    intrinsicRisk: number;
    underfireRisk: number;
    firingTime: number;
    heatPenetration: number;
  }> = {
    "low-slow": {
      fuelUsed: 2, quality: 0.03, thermalMultiplier: 0.35,
      intrinsicRisk: 0.01, underfireRisk: 0.14, firingTime: 3.2, heatPenetration: 0.55,
    },
    "staged-preheat": {
      fuelUsed: 3, quality: 0.13, thermalMultiplier: 0.25,
      intrinsicRisk: 0.02, underfireRisk: 0.03, firingTime: 3, heatPenetration: 0.78,
    },
    "gradual-hot": {
      fuelUsed: 3, quality: 0.18, thermalMultiplier: 0.55,
      intrinsicRisk: 0.03, underfireRisk: 0, firingTime: 2.3, heatPenetration: 0.86,
    },
    "hot-fast": {
      fuelUsed: 4, quality: 0.27, thermalMultiplier: 1.55,
      intrinsicRisk: 0.08, underfireRisk: 0, firingTime: 1, heatPenetration: 0.9,
    },
    "pulse-fire": {
      fuelUsed: 3, quality: 0.14, thermalMultiplier: 0.82,
      intrinsicRisk: 0.08, underfireRisk: 0.02, firingTime: 1.8, heatPenetration: 0.82,
    },
  };
  const selected = values[actionId] ?? values["low-slow"]!;
  const thermalShockLoad = clamp01(inheritedInstability * selected.thermalMultiplier + selected.intrinsicRisk);
  const firingRisk = clamp01(
    thermalShockLoad
    + Math.max(0, moistureGradient - 0.18) * 0.25
    + Math.max(0, warpingRisk - 0.18) * 0.2,
  );
  return {
    nextStage: "inspect",
    contextPatch: {
      firing: {
        actionId,
        fuelUsed: selected.fuelUsed,
        quality: selected.quality,
        firingRisk,
        thermalShockLoad,
        underfireRisk: selected.underfireRisk,
        firingTime: selected.firingTime,
        heatPenetration: selected.heatPenetration,
        inheritedResidualMoisture: residualMoisture,
        inheritedMoistureGradient: moistureGradient,
        inheritedWarpingRisk: warpingRisk,
      },
      fuelUsed: selected.fuelUsed,
    },
  };
}

function potteryQuality(context: Record<string, JsonValue>, random: number) {
  const prep = objectValue(context.clayPreparation);
  const risks = objectValue(prep.downstreamRisks);
  const forming = objectValue(context.forming);
  const drying = objectValue(context.drying);
  const firing = objectValue(context.firing);
  const preparationBonus = numberValue(objectValue(context.clay).uniformity, 0.5) * 0.16
    - numberValue(objectValue(context.clay).impurities, 0.5) * 0.14;
  const score = clamp01(
    0.43
    + preparationBonus
    + numberValue(forming.formQuality, 0)
    + numberValue(drying.quality, 0)
    + numberValue(firing.quality, 0)
    - numberValue(risks.inclusionDefectRisk, 0) * 0.25
    - numberValue(forming.handlingRisk, 0)
    - numberValue(drying.risk, 0) * 0.38
    - numberValue(drying.residualMoisture, 0) * 0.18
    - numberValue(drying.moistureGradient, 0) * 0.12
    - numberValue(drying.warpingRisk, 0) * 0.1
    - numberValue(firing.firingRisk, 0)
    - numberValue(firing.underfireRisk, 0)
    - random * 0.1,
  );
  const defects: string[] = [];
  if (numberValue(drying.risk, 0) > 0.32) defects.push("drying-cracks");
  if (numberValue(forming.handlingRisk, 0) > 0.18) defects.push("deformation");
  if (numberValue(firing.firingRisk, 0) > 0.16) defects.push("thermal-shock");
  if (numberValue(drying.residualMoisture, 0) > 0.2 && numberValue(firing.thermalShockLoad, 0) > 0.16) {
    defects.push("steam-cracking");
  }
  if (numberValue(drying.warpingRisk, 0) > 0.22) defects.push("warping");
  if (numberValue(firing.underfireRisk, 0) > 0.1) defects.push("under-fired");
  if (numberValue(risks.inclusionDefectRisk, 0) > 0.25) defects.push("inclusions");
  return {
    score: Number(score.toFixed(4)),
    grade: score >= 0.82 ? "fine" : score >= 0.62 ? "serviceable" : score >= 0.36 ? "crude" : "failed",
    defects,
  };
}

function clayState(context: Record<string, JsonValue>): ClayState {
  const raw = objectValue(context.clay);
  return {
    moisture: clamp01(numberValue(raw.moisture, 0.76)),
    impurities: clamp01(numberValue(raw.impurities, 0.55)),
    uniformity: clamp01(numberValue(raw.uniformity, 0.45)),
    plasticity: clamp01(numberValue(raw.plasticity, 0.72)),
    materialMass: Math.max(0.1, numberValue(raw.materialMass, 1)),
    prepTime: Math.max(0, numberValue(raw.prepTime, 0)),
    effort: Math.max(0, numberValue(raw.effort, 0)),
    hasSieve: booleanValue(raw.hasSieve, true),
    hasDryClay: booleanValue(raw.hasDryClay, false),
  };
}

function applyClayPreparation(clay: ClayState, actionId: string): {
  clay: ClayState;
  tradeoff: string;
  downstreamRisks: Record<string, JsonValue>;
} {
  switch (actionId) {
    case "knead-now":
      return outcome({ ...clay, uniformity: clamp01(clay.uniformity + 0.18), plasticity: clamp01(clay.plasticity + 0.05), prepTime: clay.prepTime + 1, effort: clay.effort + 0.18 }, "省时间，但把偏高含水和杂质带进后续成型。", 0.28, 0.34, 0.08);
    case "air-dry-first":
      return outcome({ ...clay, moisture: clamp01(clay.moisture - 0.22), uniformity: clamp01(clay.uniformity + 0.08), plasticity: clamp01(clay.plasticity - 0.04), prepTime: clay.prepTime + 2.5, effort: clay.effort + 0.1 }, "用时间换取更安全的含水状态，但表层先干会略微降低可塑性。", 0.12, 0.28, 0.12);
    case "screen-and-knead":
      return outcome({ ...clay, impurities: clamp01(clay.impurities - 0.42), uniformity: clamp01(clay.uniformity + 0.2), materialMass: Math.max(0.1, clay.materialMass * 0.91), prepTime: clay.prepTime + 2, effort: clay.effort + 0.28 }, "牺牲材料和劳动，换取更少杂质和更稳定的泥料。", 0.2, 0.08, 0.06);
    case "rest-covered":
      return outcome({ ...clay, moisture: clamp01(clay.moisture - 0.05), uniformity: clamp01(clay.uniformity + 0.16), plasticity: clamp01(clay.plasticity + 0.04), prepTime: clay.prepTime + 1.5, effort: clay.effort + 0.04 }, "几乎不耗材料和体力，但主要改善水分均衡，杂质仍在。", 0.2, 0.3, 0.04);
    case "blend-dry-clay":
      return outcome({ ...clay, moisture: clamp01(clay.moisture - 0.18), uniformity: clamp01(clay.uniformity - 0.08), materialMass: clay.materialMass + 0.15, prepTime: clay.prepTime + 1, effort: clay.effort + 0.16 }, "快速修正含水并增加材料量，但重新混合会带来局部不均风险。", 0.17, 0.27, 0.22);
    default:
      return outcome(clay, "未改变泥料处理方式。", 0.3, 0.3, 0.3);
  }
}

function preparationRecord(actionId: string, resolved: ReturnType<typeof applyClayPreparation>): JsonValue {
  return { actionId, tradeoff: resolved.tradeoff, downstreamRisks: resolved.downstreamRisks };
}

function outcome(clay: ClayState, tradeoff: string, moistureRisk: number, inclusionRisk: number, nonuniformRisk: number) {
  return {
    clay,
    tradeoff,
    downstreamRisks: {
      moistureCrackRisk: clamp01(moistureRisk),
      inclusionDefectRisk: clamp01(inclusionRisk),
      nonuniformDryingRisk: clamp01(nonuniformRisk),
    },
  };
}

function makerOf(world: WorldView, practiceId: string): string {
  return world.listRelations({ type: PracticeRelations.participatesIn, to: practiceId })[0]?.from ?? "";
}

function objectValue(value: unknown): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function nonNegative(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
