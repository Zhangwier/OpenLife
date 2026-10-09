/**
 * Settlement Locations - the first inhabited content layer (MAP-001).
 *
 * Geography answers "where on the map". World Space answers "which building,
 * which room". This module answers the question a player actually asks:
 *
 *   "I am standing here. Who else is here, what can I pick up, and what can I
 *    do that will change something?"
 *
 * It authors one living settlement on a real geography Location, and it owns
 * only that content. Every action it adds is an ordinary Command, so a
 * settlement built here is save/load-able, replayable and auditable for free.
 *
 * M1 scope (OPEN_WORLD_REQUIREMENTS.md 搂11):
 *   - 1 habitable settlement, 6 connected outdoor work places,
 *   - at least 8 enterable life spaces,
 *   - 12-16 residents with a household and a routine,
 *   - 30+ operable object prototypes, 80+ placed instances,
 *   - a first real loop: walk in, take a container, fill it, put it back.
 */

import type { ComponentData, Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { DAYS_PER_MONTH, DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";
import {
  ObjectCommands,
  ObjectComponents,
  ObjectKinds,
  ObjectRelations,
  contentsOf,
  holderOf,
  ownerOf,
  prototypeOf,
  readObject,
} from "@openlife/module-world-objects";
import {
  SpaceCommands,
  SpaceComponents,
  SpaceKinds,
  SpaceRelations,
  moveEffects,
  occupiedPlaceId,
  occupiedSpaceId,
  readPlace,
  readSpace,
} from "@openlife/module-world-space";

const OWNER = "settlement-locations";
const WORLD = "modern:world";
const STATE = "modern.world_state";

export const SettlementComponents = {
  /** Marks the settlement entity and carries its authored identity. */
  settlement: "settlement-locations.settlement",
  /** Per-resident daily life: household, work place, hunger, standing routine. */
  resident: "settlement-locations.resident",
  /** A resource a place holds and renews, with its own authoritative stock. */
  yieldPoint: "settlement-locations.yield",
  /** Per-holding state for one player: what they have drawn, carried and eaten. */
  holding: "settlement-locations.holding",
  /** Crop state on the existing field place; absent for old saves means fallow. */
  cropPlot: "settlement-locations.crop-plot",
  dailyPlan: "settlement-locations.daily-plan",
} as const;

export const SettlementCommands = {
  found: "settlement-locations.found",
  arrive: "settlement-locations.arrive",
  draw: "settlement-locations.draw",
  drink: "settlement-locations.drink",
  eat: "settlement-locations.eat",
  cook: "settlement-locations.cook",
  harvest: "settlement-locations.harvest",
  sow: "settlement-locations.sow",
  tend: "settlement-locations.tend",
  rest: "settlement-locations.rest",
  step: "settlement-locations.end_day",
  configurePlan: "settlement-locations.plan.configure",
} as const;

export const SettlementProjections = {
  homestead: "settlement-locations.homestead",
  people: "settlement-locations.people",
  worksites: "settlement-locations.worksites",
} as const;

export const SettlementRejection = {
  NotEntered: "E_SETTLEMENT_NOT_ENTERED",
  NoSuchResident: "E_SETTLEMENT_NO_RESIDENT",
  NoSuchPlace: "E_SETTLEMENT_NO_PLACE",
  WrongPlace: "E_SETTLEMENT_WRONG_PLACE",
  Empty: "E_SETTLEMENT_EMPTY",
  NotYours: "E_SETTLEMENT_NOT_YOURS",
  Already: "E_SETTLEMENT_ALREADY",
  NoRoom: "E_SETTLEMENT_NO_ROOM",
  Exhausted: "E_SETTLEMENT_EXHAUSTED",
  Busy: "E_SETTLEMENT_BUSY",
} as const;

/** The authored settlement: one terrace village beside the central river. */
export const SettlementId = "settlement-locations:settlement:river-terrace";

interface ResidentSpec {
  key: string;
  name: string;
  age: number;
  role: string;
  trait: string;
  wish: string;
  /** Which place this person works in during the day. */
  workPlace: string;
  /** Which space they sleep in at night. */
  homeSpace: string;
  household: string;
}

/**
 * Fourteen residents across six households.
 *
 * Every one answers "why is he here today": they have a home space, a work
 * place and a standing routine. Their names are plain reconstructions, which is
 * the honest label for a 2070 BCE village (see the content policy in
 * `OPEN_WORLD_REQUIREMENTS.md` 搂3).
 */
const RESIDENTS: ResidentSpec[] = [
  { key: "elder", name: "陶叔", age: 52, role: "看火的老人", trait: "慢，但记得每一次火候", wish: "想在还看得见的时候，把这套看火的经验讲给一个人。", workPlace: "place:kiln", homeSpace: "space:main-sleep", household: "陶家" },
  { key: "elder-wife", name: "陶婶", age: 49, role: "操持家事的妇人", trait: "把每件陶器都记得属于谁", wish: "今年想把储粮补到够吃到来年。", workPlace: "place:yard", homeSpace: "space:main-sleep", household: "陶家" },
  { key: "yu", name: "阿予", age: 19, role: "照看旱地的邻居", trait: "务实，也记得别人帮过的事", wish: "新屋还缺一个能装水的罐子，最近也缺柴火。", workPlace: "place:field", homeSpace: "space:yu-sleep", household: "予家" },
  { key: "yu-brother", name: "阿石", age: 16, role: "跟着阿予下地的人", trait: "话少，做事稳", wish: "想学会分辨什么样的土能烧成器。", workPlace: "place:field", homeSpace: "space:yu-sleep", household: "予家" },
  { key: "lan", name: "阿岚", age: 21, role: "往返两岸的交换者", trait: "好奇，愿意试新东西", wish: "想带一件轻巧的陶器去南岸，让更多人认识这里的手艺。", workPlace: "place:ford", homeSpace: "space:lan-sleep", household: "岚家" },
  { key: "lan-mother", name: "岚母", age: 44, role: "织席与编绳的人", trait: "手上的活比嘴上多", wish: "芦苇够用的话，今年想多编几张席子。", workPlace: "place:reedbed", homeSpace: "space:lan-sleep", household: "岚家" },
  { key: "reed-worker", name: "阿苇", age: 27, role: "割芦苇的人", trait: "知道哪片滩一年比一年薄", wish: "想和人说清楚，芦苇地不能再这样割下去。", workPlace: "place:reedbed", homeSpace: "space:reed-sleep", household: "苇家" },
  { key: "clay-digger", name: "阿埴", age: 33, role: "取黏土的人", trait: "认得河岸每一段土的颜色", wish: "想找一个愿意一起去更远的河湾取土的人。", workPlace: "place:claypits", homeSpace: "space:clay-sleep", household: "埴家" },
  { key: "clay-child", name: "小满", age: 9, role: "跟着大人捡东西的孩子", trait: "什么都想捡回来看", wish: "想有一个属于自己的小罐子。", workPlace: "place:claypits", homeSpace: "space:clay-sleep", household: "埴家" },
  { key: "water-carrier", name: "阿汲", age: 24, role: "每天来回取水的人", trait: "走得快，也知道水什么时候浑", wish: "想攒够力气换一个更大一点的罐子。", workPlace: "place:river", homeSpace: "space:water-sleep", household: "汲家" },
  { key: "water-child", name: "小汲", age: 12, role: "帮着提水的孩子", trait: "喜欢看河里的倒影", wish: "想知道河另一头是什么样子。", workPlace: "place:river", homeSpace: "space:water-sleep", household: "汲家" },
  { key: "cook", name: "阿灶", age: 38, role: "管公共灶火的人", trait: "记得谁家最近没粮", wish: "想让公用灶台一直有柴火可用。", workPlace: "place:hearth-yard", homeSpace: "space:hearth-sleep", household: "灶家" },
  { key: "cook-helper", name: "阿稷", age: 17, role: "在灶边帮忙的人", trait: "学什么都快", wish: "想独立做一次全家的饭。", workPlace: "place:hearth-yard", homeSpace: "space:hearth-sleep", household: "灶家" },
  { key: "trader-elder", name: "埴公", age: 61, role: "带过几次远路的人", trait: "讲的路线比走过的多", wish: "想在走不动之前，把渡口那条路教给别人。", workPlace: "place:ford", homeSpace: "space:ford-sleep", household: "埴公家" },
];

/** Places of the settlement, each with a purpose and a cost to reach. */
const PLACES: {
  id: string; name: string; type: string; costDays: number;
  /** Where someone arriving here actually stands: the room or spot they enter. */
  entrySpace: string;
  spaces: { id: string; name: string; type: string; capacity: number; visible?: boolean }[];
}[] = [
  {
    id: "place:yard", name: "陶家庭院", type: "yard", costDays: 0, entrySpace: "space:main-sleep",
    spaces: [
      { id: "space:main-sleep", name: "主屋寝处", type: "sleep", capacity: 2 },
      { id: "space:store", name: "储粮处", type: "storage", capacity: 2 },
      { id: "space:drying-rack", name: "晾坯架下", type: "work", capacity: 3, visible: true },
    ],
  },
  {
    id: "place:hearth-yard", name: "公用灶台", type: "kitchen", costDays: 1, entrySpace: "space:hearth",
    spaces: [
      { id: "space:hearth", name: "灶边", type: "work", capacity: 3, visible: true },
      { id: "space:hearth-sleep", name: "灶家铺位", type: "sleep", capacity: 3 },
    ],
  },
  {
    id: "place:river", name: "河边取水点", type: "water", costDays: 1, entrySpace: "space:bank",
    spaces: [
      { id: "space:bank", name: "河岸浅滩", type: "water", capacity: 0, visible: true },
    ],
  },
  {
    id: "place:field", name: "河岸旱地", type: "field", costDays: 2, entrySpace: "space:field-edge",
    spaces: [
      { id: "space:field-edge", name: "田头", type: "work", capacity: 4, visible: true },
      { id: "space:yu-sleep", name: "予家棚屋", type: "sleep", capacity: 3 },
    ],
  },
  {
    id: "place:kiln", name: "共用陶窑", type: "kiln", costDays: 2, entrySpace: "space:kiln-mouth",
    spaces: [
      { id: "space:kiln-mouth", name: "窑口", type: "work", capacity: 2, visible: true },
      { id: "space:kiln-shed", name: "窑棚", type: "work", capacity: 3 },
    ],
  },
  {
    id: "place:claypits", name: "河湾黏土坑", type: "clay-pit", costDays: 2, entrySpace: "space:pit-edge",
    spaces: [
      { id: "space:pit-edge", name: "坑边", type: "work", capacity: 4, visible: true },
      { id: "space:clay-sleep", name: "埴家窝棚", type: "sleep", capacity: 3 },
    ],
  },
  {
    id: "place:reedbed", name: "芦苇滩", type: "reed-flat", costDays: 3, entrySpace: "space:reed-cut",
    spaces: [
      { id: "space:reed-cut", name: "割苇处", type: "work", capacity: 4, visible: true },
      { id: "space:reed-sleep", name: "苇家窝棚", type: "sleep", capacity: 2 },
      { id: "space:lan-sleep", name: "岚家屋舍", type: "sleep", capacity: 3 },
    ],
  },
  {
    id: "place:ford", name: "渡口", type: "crossing", costDays: 2, entrySpace: "space:ford-landing",
    spaces: [
      { id: "space:ford-landing", name: "渡口岸边", type: "work", capacity: 4, visible: true },
      { id: "space:water-sleep", name: "汲家棚屋", type: "sleep", capacity: 3 },
      { id: "space:ford-sleep", name: "埴公落脚处", type: "sleep", capacity: 2 },
    ],
  },
];

/** Renewing resources. Each has one authoritative owner: this module. */
const YIELDS: { placeId: string; resourceId: string; label: string; capacity: number; renewDays: number; unit: string }[] = [
  { placeId: "place:river", resourceId: "resource:water", label: "河水", capacity: 40, renewDays: 1, unit: "份" },
  { placeId: "place:claypits", resourceId: "resource:clay", label: "黏土", capacity: 12, renewDays: 20, unit: "份" },
  { placeId: "place:reedbed", resourceId: "resource:reed", label: "芦苇", capacity: 10, renewDays: 45, unit: "捆" },
  { placeId: "place:field", resourceId: "resource:grain", label: "粟", capacity: 16, renewDays: 90, unit: "份" },
  { placeId: "place:reedbed", resourceId: "resource:fuel", label: "柴草", capacity: 14, renewDays: 12, unit: "捆" },
  { placeId: "place:kiln", resourceId: "resource:fuel", label: "窑边柴火", capacity: 8, renewDays: 20, unit: "捆" },
  { placeId: "place:hearth-yard", resourceId: "resource:cooked", label: "熟食", capacity: 6, renewDays: 3, unit: "份" },
];

/**
 * Object prototypes. Capabilities decide what can be done with a thing, so a
 * new vessel never needs a new button (OBJ-001).
 */
const PROTOTYPES: {
  id: string; name: string; material: string; resourceId: string; unit: string;
  mass: number; capacity: number; capabilities: string[]; durability: number; visible?: boolean;
}[] = [
  { id: "prototype:water-jar", name: "储水陶罐", material: "fired-clay", resourceId: "resource:jar", unit: "个", mass: 2.6, capacity: 4, capabilities: ["carryable", "container", "liquid-holder", "storage"], durability: 70 },
  { id: "prototype:small-jar", name: "小陶罐", material: "fired-clay", resourceId: "resource:jar", unit: "个", mass: 0.9, capacity: 1, capabilities: ["carryable", "container", "liquid-holder"], durability: 45 },
  { id: "prototype:grain-jar", name: "储粮陶瓮", material: "fired-clay", resourceId: "resource:jar", unit: "个", mass: 6.2, capacity: 8, capabilities: ["container", "storage"], durability: 90, visible: true },
  { id: "prototype:cooking-pot", name: "炊煮陶釜", material: "fired-clay", resourceId: "resource:cookware", unit: "个", mass: 3.4, capacity: 3, capabilities: ["carryable", "container", "liquid-holder"], durability: 55, visible: true },
  { id: "prototype:bowl", name: "陶碗", material: "fired-clay", resourceId: "resource:bowl", unit: "个", mass: 0.5, capacity: 1, capabilities: ["carryable", "container"], durability: 35 },
  { id: "prototype:water", name: "水", material: "water", resourceId: "resource:water", unit: "份", mass: 1, capacity: 0, capabilities: ["carryable", "edible", "liquid-holder"], durability: 0 },
  { id: "prototype:grain", name: "粟", material: "grain", resourceId: "resource:grain", unit: "份", mass: 0.6, capacity: 0, capabilities: ["carryable", "edible", "storage"], durability: 0 },
  { id: "prototype:cooked-food", name: "熟食", material: "cooked-grain", resourceId: "resource:cooked", unit: "份", mass: 0.7, capacity: 0, capabilities: ["carryable", "edible"], durability: 0 },
  { id: "prototype:clay-batch", name: "黏土", material: "raw-clay", resourceId: "resource:clay", unit: "份", mass: 1.4, capacity: 0, capabilities: ["carryable", "workable", "storage"], durability: 0 },
  { id: "prototype:fuel-bundle", name: "柴捆", material: "dry-reed", resourceId: "resource:fuel", unit: "捆", mass: 1.8, capacity: 0, capabilities: ["carryable", "burnable", "storage"], durability: 0 },
  { id: "prototype:reed-bundle", name: "芦苇捆", material: "reed", resourceId: "resource:reed", unit: "捆", mass: 1.6, capacity: 0, capabilities: ["carryable", "workable", "storage"], durability: 0 },
  { id: "prototype:mat", name: "苇席", material: "woven-reed", resourceId: "resource:mat", unit: "张", mass: 1.2, capacity: 0, capabilities: ["carryable", "fixture", "sleep-on"], durability: 40, visible: true },
  { id: "prototype:rope", name: "草绳", material: "twisted-fiber", resourceId: "resource:rope", unit: "根", mass: 0.3, capacity: 0, capabilities: ["carryable", "tool", "workable"], durability: 30 },
  { id: "prototype:fiber-bundle", name: "纤维束", material: "plant-fiber", resourceId: "resource:fiber", unit: "束", mass: 0.4, capacity: 0, capabilities: ["carryable", "workable", "storage"], durability: 0 },
  { id: "prototype:digging-stick", name: "木耒", material: "wood", resourceId: "resource:tool", unit: "根", mass: 1.9, capacity: 0, capabilities: ["carryable", "tool"], durability: 50, visible: true },
  { id: "prototype:paddle", name: "木桨", material: "wood", resourceId: "resource:tool", unit: "支", mass: 2.2, capacity: 0, capabilities: ["carryable", "tool"], durability: 45 },
  { id: "prototype:bone-needle", name: "骨针", material: "bone", resourceId: "resource:tool", unit: "根", mass: 0.02, capacity: 0, capabilities: ["carryable", "tool"], durability: 20 },
  { id: "prototype:stone-knife", name: "石刀", material: "stone", resourceId: "resource:tool", unit: "把", mass: 0.3, capacity: 0, capabilities: ["carryable", "tool"], durability: 40 },
  { id: "prototype:sieve", name: "陶筛", material: "fired-clay", resourceId: "resource:tool", unit: "个", mass: 0.7, capacity: 0, capabilities: ["carryable", "tool"], durability: 35 },
  { id: "prototype:hide-cloak", name: "兽皮披", material: "hide", resourceId: "resource:cloth", unit: "件", mass: 1.5, capacity: 0, capabilities: ["carryable", "wearable", "warm"], durability: 40 },
  { id: "prototype:fiber-wrap", name: "纤维裹身", material: "woven-fiber", resourceId: "resource:cloth", unit: "件", mass: 0.8, capacity: 0, capabilities: ["carryable", "wearable"], durability: 25 },
  { id: "prototype:carrying-bag", name: "编织袋", material: "woven-fiber", resourceId: "resource:bag", unit: "个", mass: 0.5, capacity: 3, capabilities: ["carryable", "container", "storage"], durability: 28 },
  { id: "prototype:fish-trap", name: "渔篓", material: "woven-reed", resourceId: "resource:trap", unit: "个", mass: 1.4, capacity: 2, capabilities: ["carryable", "container", "tool"], durability: 30 },
  { id: "prototype:net", name: "网", material: "twisted-fiber", resourceId: "resource:net", unit: "张", mass: 0.9, capacity: 0, capabilities: ["carryable", "tool"], durability: 22 },
  { id: "prototype:fish", name: "鱼", material: "fish", resourceId: "resource:fish", unit: "条", mass: 0.8, capacity: 0, capabilities: ["carryable", "edible"], durability: 0 },
  { id: "prototype:shared-kiln", name: "共用陶窑", material: "earth", resourceId: "resource:kiln", unit: "座", mass: 0, capacity: 0, capabilities: ["fixture", "workable"], durability: 0, visible: true },
  { id: "prototype:hearth", name: "公用灶塘", material: "earth", resourceId: "resource:hearth", unit: "处", mass: 0, capacity: 0, capabilities: ["fixture", "workable"], durability: 0, visible: true },
  { id: "prototype:grinding-stone", name: "石磨盘", material: "stone", resourceId: "resource:millstone", unit: "套", mass: 0, capacity: 0, capabilities: ["fixture", "tool", "workable"], durability: 0, visible: true },
  { id: "prototype:water-cache", name: "储水坑", material: "earth", resourceId: "resource:cistern", unit: "处", mass: 0, capacity: 12, capabilities: ["fixture", "container", "liquid-holder"], durability: 0 },
  { id: "prototype:fence-post", name: "围栏木桩", material: "wood", resourceId: "resource:fence", unit: "根", mass: 2.4, capacity: 0, capabilities: ["fixture"], durability: 60 },
  { id: "prototype:grain-basket", name: "竹编粮囤", material: "woven-reed", resourceId: "resource:basket", unit: "个", mass: 1.1, capacity: 5, capabilities: ["container", "storage"], durability: 26, visible: true },
  { id: "prototype:sleep-mat", name: "寝席", material: "woven-reed", resourceId: "resource:mat", unit: "张", mass: 1.1, capacity: 0, capabilities: ["fixture", "sleep-on"], durability: 35, visible: true },
];

const RESOURCE_LABELS: Record<string, string> = {
  "resource:water": "水",
  "resource:clay": "黏土",
  "resource:reed": "芦苇",
  "resource:grain": "粟",
  "resource:fuel": "柴草",
  "resource:cooked": "熟食",
  "resource:fish": "鱼",
  "resource:jar": "陶罐",
  "resource:bowl": "陶碗",
  "resource:cookware": "炊具",
  "resource:fiber": "纤维",
  "resource:rope": "草绳",
  "resource:mat": "席",
  "resource:tool": "工具",
  "resource:cloth": "衣料",
  "resource:bag": "编织袋",
};

export const settlementLocationsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content-pack",
    name: "Settlement Locations",
    description: "The first inhabited settlement: places, spaces, renewing resources, residents and the first daily loop.",
    requires: ["world.space", "world.objects", "time.life-scale"],
    optional: ["world.geography"],
    provides: ["life.settlement"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "projection.register",
    ],
  },

  register(ctx) {
    for (const id of Object.values(SettlementComponents)) {
      ctx.registerComponent({ id, persist: true, description: `settlement-locations component ${id}` });
    }

    for (const type of Object.values(SettlementCommands)) {
      ctx.registerCommand({ type, description: "Settlement life action." });
    }

    registerFound(ctx);
    registerArrive(ctx);
    registerDraw(ctx);
    registerDrink(ctx);
    registerEat(ctx);
    registerCook(ctx);
    registerSow(ctx);
    registerHarvest(ctx);
    registerTend(ctx);
    registerRest(ctx);
    registerEndDay(ctx);
    registerActivityBudget(ctx);
    registerDailyPlan(ctx);
    registerPotteryPlanStart(ctx);

    ctx.registerProjection({
      id: SettlementProjections.homestead,
      description: "The settlement as one player sees it: where they are, who is here and what can be done now.",
      build: ({ world, params }) => homestead(world, String(params.actorId ?? "")),
    });
    ctx.registerProjection({
      id: SettlementProjections.people,
      description: "Every resident with their household, work place, standing routine and current whereabouts.",
      build: ({ world }) => people(world),
    });
    ctx.registerProjection({
      id: SettlementProjections.worksites,
      description: "Every place and its renewing resources, with the authoritative remaining stock.",
      build: ({ world }) => worksites(world),
    });
  },
};

type Registration = Parameters<OpenLifeModule["register"]>[0];

// ---------------------------------------------------------------------------
// Founding
// ---------------------------------------------------------------------------

function registerFound(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.found}.allowed`,
    commandType: SettlementCommands.found,
    evaluate: (c) => {
      if (c.world.getEntity(SettlementId)) {
        return refuse(SettlementRejection.Already, "这个聚落已经存在了。");
      }
      const locationId = String(c.command.payload.locationId ?? "");
      const knownLocations = c.world.listEntities({ kind: "world-geography.location" });
      if (locationId && !knownLocations.some((entity) => entity.id === locationId)) {
        return refuse(SettlementRejection.NoSuchPlace, `找不到地理地点 ${locationId}。`);
      }
      // A world with a map must pin the settlement to a real Location; a world
      // without geography may still hold one, so the pack is testable alone.
      if (!locationId && knownLocations.length > 0) {
        return refuse(
          SettlementRejection.NoSuchPlace,
          "这个世界已经有地理地点，聚落必须落在一个真实地点上。",
        );
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.found}.resolve`,
    commandType: SettlementCommands.found,
    resolve: (c) => {
      const locationId = String(c.command.payload.locationId ?? "");
      const effects: Effect[] = [{
        kind: "spawnEntity",
        localId: "settlement",
        id: SettlementId,
        entityKind: "settlement-locations.settlement",
        components: {
          [SettlementComponents.settlement]: {
            name: String(c.command.payload.name ?? "河岸台地聚落"),
            locationId,
            foundedAt: c.world.tick,
          } as unknown as Record<string, never>,
        },
        announce: false,
      }];

      // Places and their spaces.
      for (const place of PLACES) {
        effects.push({
          kind: "spawnEntity",
          localId: place.id,
          id: place.id,
          entityKind: SpaceKinds.place,
          components: {
            [SpaceComponents.place]: {
              name: place.name, placeType: place.type, locationId,
              costDays: place.costDays, private: false, createdAt: c.world.tick,
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
        for (const space of place.spaces) {
          effects.push({
            kind: "spawnEntity",
            localId: space.id,
            id: space.id,
            entityKind: SpaceKinds.space,
            components: {
              [SpaceComponents.space]: {
                name: space.name, spaceType: space.type,
                capacity: space.capacity, visibleFromOutside: space.visible === true,
                createdAt: c.world.tick,
              } as unknown as Record<string, never>,
            },
            announce: false,
          }, {
            kind: "addRelation",
            type: SpaceRelations.inside,
            from: space.id,
            to: place.id,
            announce: false,
          });
        }
      }

      // Renewing resources, each owned by exactly one place.
      for (const [index, yieldSpec] of YIELDS.entries()) {
        effects.push({
          kind: "spawnEntity",
          localId: `yield:${index}`,
          id: `yield:${yieldSpec.placeId}:${yieldSpec.resourceId}`,
          entityKind: "settlement-locations.yield-point",
          components: {
            [SettlementComponents.yieldPoint]: {
              placeId: yieldSpec.placeId, resourceId: yieldSpec.resourceId,
              label: yieldSpec.label, unit: yieldSpec.unit,
              capacity: yieldSpec.capacity, stock: yieldSpec.capacity,
              renewDays: yieldSpec.renewDays, lastRenewedAt: c.world.tick,
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
      }

      // Prototypes.
      for (const prototype of PROTOTYPES) {
        effects.push({
          kind: "spawnEntity",
          localId: prototype.id,
          id: prototype.id,
          entityKind: ObjectKinds.prototype,
          components: {
            [ObjectComponents.prototype]: {
              name: prototype.name, material: prototype.material,
              resourceId: prototype.resourceId, unit: prototype.unit,
              mass: prototype.mass, capacity: prototype.capacity,
              capabilities: prototype.capabilities, durability: prototype.durability,
              visibleFromOutside: prototype.visible === true,
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
      }

      // Residents: identity, vitals, residence and a settlement life record.
      for (const resident of RESIDENTS) {
        const id = residentId(resident.key);
        effects.push({
          kind: "spawnEntity",
          localId: `resident:${resident.key}`,
          id,
          entityKind: "modern.character",
          components: {
            "modern.identity": {
              givenName: resident.name, familyName: "",
              sex: "other", generation: 0, lineageId: `npc:${resident.household}`,
              bornAt: Math.max(0, c.world.tick - resident.age * DAY_TICKS_PER_YEAR),
            },
            "modern.vitals": { alive: true, health: 1, ageYears: resident.age, lifespan: 78 },
            "modern.residence": { cityId: "modern:city:north" },
            "modern.wealth": { cash: 0, debt: 0 },
            [SettlementComponents.resident]: {
              household: resident.household, role: resident.role,
              trait: resident.trait, wish: resident.wish,
              workPlace: resident.workPlace, homeSpace: resident.homeSpace,
              hunger: 0, rested: 1, standingRoutine: "",
            } as unknown as Record<string, never>,
          },
          announce: false,
        });
        // Everyone starts the day at work; overnight resting moves them home.
        effects.push({
          kind: "addRelation",
          type: SpaceRelations.occupancy,
          from: id,
          to: resident.workPlace,
          components: { [SpaceComponents.occupancy]: { placeId: resident.workPlace, spaceId: "", since: c.world.tick } },
          announce: false,
        });
      }

      // Placed objects. Every one has a location and an owner, so the world can
      // always answer "where is this and whose is it" (MAP-001 density target).
      for (const instance of INSTANCES) {
        effects.push({
          kind: "spawnEntity",
          localId: instance.id,
          id: instance.id,
          entityKind: ObjectKinds.item,
          components: {
            [ObjectComponents.object]: {
              prototypeId: instance.prototypeId,
              name: "",
              condition: "used",
              quantity: Math.max(0, instance.quantity ?? 0),
              durability: 50,
              madeAt: c.world.tick,
              provenance: { authored: true },
              visibleFromOutside: true,
            } as unknown as Record<string, never>,
          },
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.instanceOf,
          from: instance.id,
          to: instance.prototypeId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.ownedBy,
          from: instance.id,
          to: instance.ownerId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.containedIn,
          from: instance.id,
          to: instance.inId,
          announce: false,
        });
      }

      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.founded",
        targetId: SettlementId,
        data: {
          name: String(c.command.payload.name ?? "河岸台地聚落"),
          locationId,
          places: PLACES.length,
          spaces: PLACES.reduce((sum, place) => sum + place.spaces.length, 0),
          residents: RESIDENTS.length,
          prototypes: PROTOTYPES.length,
          instances: INSTANCES.length,
        },
        historicalSignificance: 0.6,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// Arriving
// ---------------------------------------------------------------------------

/**
 * Walking somewhere and stepping inside are one action.
 *
 * `world-space.enter` only knows about places, so on its own it would leave the
 * player standing in a courtyard with nothing visible: every household object
 * lives in a room. Arriving therefore places the player in the place *and* in
 * the spot someone would actually stop at, in one transaction, so the scene the
 * player sees next is the room they walked into.
 */
function registerArrive(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.arrive}.allowed`,
    commandType: SettlementCommands.arrive,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!actorId || !c.world.hasEntity(actorId)) {
        return refuse(SettlementRejection.NoSuchResident, "只有正在生活的人才能走进这里。");
      }
      const placeId = String(c.command.payload.placeId ?? "");
      const authored = PLACES.find((place) => place.id === placeId);
      if (!authored) return refuse(SettlementRejection.NoSuchPlace, "这个地方不属于这座聚落。");
      if (!c.world.getEntity(placeId)) return refuse(SettlementRejection.NoSuchPlace, "这个地方还没有建起来。");
      if (occupiedPlaceId(c.world, actorId) === placeId && occupiedSpaceId(c.world, actorId) === authored.entrySpace) {
        return refuse(SettlementRejection.Already, "你已经在这里了。");
      }
      if (c.command.payload.travelMode === "local") {
        const origin = occupiedPlaceId(c.world, actorId);
        if (!c.world.getEntity(SettlementId) || !PLACES.some((place) => place.id === origin)) {
          return refuse(SettlementRejection.WrongPlace, "只有在本聚落内才能使用短途步行。");
        }
        if (dailyActivity(c.world, actorId).remaining < 1) {
          return refuse(SettlementRejection.Exhausted, "今天已没有步行时间，请先结束这一天。");
        }
      } else if (c.command.payload.travelMode !== undefined) {
        return refuse(SettlementRejection.WrongPlace, "未知的出行方式。");
      }
      const capacity = readSpace(c.world.getComponent(authored.entrySpace, SpaceComponents.space)).capacity;
      const present = c.world
        .listRelations({ type: SpaceRelations.standingIn, to: authored.entrySpace })
        .filter((relation) => relation.from !== actorId).length;
      if (capacity > 0 && present >= capacity) {
        return refuse(SettlementRejection.NoRoom, "这里已经站满了人。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.arrive}.resolve`,
    commandType: SettlementCommands.arrive,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const placeId = String(c.command.payload.placeId);
      const authored = PLACES.find((place) => place.id === placeId)!;
      const effects = moveEffects(c.world, actorId, placeId, authored.entrySpace, c.world.tick);
      if (c.command.payload.travelMode === "local") {
        const budget = dailyActivity(c.world, actorId);
        effects.push({
          kind: "modifyComponent", entityId: actorId,
          component: SettlementComponents.holding,
          patch: { activityDay: c.world.tick, activityUsed: budget.used + 1 },
          reason: "walk within the same settlement",
        });
      }
      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.arrived",
        actorId,
        targetId: placeId,
        data: { placeId, spaceId: authored.entrySpace, costDays: c.command.payload.travelMode === "local" ? 0 : authored.costDays, travelMode: c.command.payload.travelMode ?? "legacy" },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

// ---------------------------------------------------------------------------
// Reading: homestead, people, worksites
// ---------------------------------------------------------------------------

interface YieldState {
  placeId: string;
  resourceId: string;
  label: string;
  unit: string;
  capacity: number;
  stock: number;
  renewDays: number;
  lastRenewedAt: number;
}

/** Every yield point, with the stock that has regenerated since it was last drawn. */
function yieldPoints(world: WorldView): YieldState[] {
  return world
    .listEntities({ kind: "settlement-locations.yield-point" })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const raw = entity.components[SettlementComponents.yieldPoint] ?? {};
      const state: YieldState = {
        placeId: String(raw.placeId ?? ""),
        resourceId: String(raw.resourceId ?? ""),
        label: String(raw.label ?? ""),
        unit: String(raw.unit ?? "份"),
        capacity: Math.max(0, Number(raw.capacity ?? 0)),
        stock: Math.max(0, Number(raw.stock ?? 0)),
        renewDays: Math.max(1, Number(raw.renewDays ?? 30)),
        lastRenewedAt: Math.max(0, Number(raw.lastRenewedAt ?? 0)),
      };
      return { ...state, stock: renewedStock(state, world.tick) };
    })
    .sort((a, b) => (a.placeId + a.resourceId).localeCompare(b.placeId + b.resourceId));
}

/**
 * Deterministic renewal: one unit per whole `renewDays` since the last draw.
 *
 * Deliberately a pure function of (stock, tick) rather than a scheduled task,
 * so reading the world never changes it and two readers always agree. The stock
 * is only written back when someone actually draws, which keeps the number of
 * transactions proportional to player actions.
 */
function renewedStock(state: YieldState, tick: number): number {
  const elapsed = Math.max(0, tick - state.lastRenewedAt);
  const cycles = Math.floor(elapsed / state.renewDays);
  // The initial grain stock is finite seed grain; only sowing and harvest
  // produce new grain. Other natural yield points retain their renewal cycles.
  if (state.resourceId === "resource:grain") return state.stock;
  return Math.min(state.capacity, state.stock + cycles);
}

function readResident(world: WorldView, residentId: string) {
  const raw = world.getComponent(residentId, SettlementComponents.resident);
  if (!raw) return undefined;
  return {
    household: String(raw.household ?? ""),
    role: String(raw.role ?? ""),
    trait: String(raw.trait ?? ""),
    wish: String(raw.wish ?? ""),
    workPlace: String(raw.workPlace ?? ""),
    homeSpace: String(raw.homeSpace ?? ""),
    hunger: Math.max(0, Number(raw.hunger ?? 0)),
    rested: Math.max(0, Number(raw.rested ?? 1)),
  };
}

export function residentId(key: string): string {
  return `settlement-locations:resident:${key}`;
}

/** Hunger is derived from the world's day clock, not an extra ticking timer. */
function hungerLevel(world: WorldView, actorId: string): number {
  const state = world.getComponent(actorId, SettlementComponents.holding);
  const settlementStart = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  const since = Number(state?.hungerAt ?? settlementStart ?? world.tick);
  const base = Number(state?.hunger ?? 0);
  return Math.max(0, Math.min(10, base + Math.max(0, world.tick - since)));
}

/** A carried cooked ration must be a real, owned, live item, not a yield point. */
function carriedRation(world: WorldView, actorId: string, objectId: string): boolean {
  const entity = world.getEntity(objectId);
  if (!entity || entity.kind !== ObjectKinds.item || entity.archivedAt !== undefined) return false;
  return ownerOf(world, objectId) === actorId
    && holderOf(world, objectId) === actorId
    && prototypeOf(world, objectId).resourceId === "resource:cooked"
    && readObject(entity.components[ObjectComponents.object]).quantity >= 1;
}


const CROP_GROW_DAYS = 30;
const CROP_YIELD = 3;

/** A plot lives on the existing field place; missing component means fallow (old saves). */
function fieldCrop(world: WorldView) {
  const raw = world.getComponent("place:field", SettlementComponents.cropPlot);
  const seedId = String(raw?.seedId ?? "");
  const sownAt = Number(raw?.sownAt ?? 0);
  const tended = Boolean(raw?.tended ?? false);
  const harvests = Math.max(0, Number(raw?.harvests ?? 0));
  const remainingDays = seedId ? Math.max(0, CROP_GROW_DAYS - Math.max(0, world.tick - sownAt)) : 0;
  return {
    seedId, sownAt, tended, harvests, remainingDays,
    phase: !seedId ? "fallow" : remainingDays === 0 && tended ? "ready" : "growing",
  };
}

function cropSummary(world: WorldView): string {
  const crop = fieldCrop(world);
  if (crop.phase === "fallow") return "田地闲置：带来一份粟作种粮，可开始播种。";
  if (crop.phase === "ready") return "粟已经成熟，可以收获三份真实粮食。";
  if (!crop.tended) return `粟正在生长，还需要照料；距成熟约 ${crop.remainingDays} 天。`;
  return `粟已经照料，距成熟约 ${crop.remainingDays} 天。`;
}

/** M2-UX2-A: a bounded capacity for actions within the current kernel day.
 * This is NOT a second clock: an old save without these fields starts with
 * 8 free activity units at the world's current tick. Time still advances via
 * the existing Simulation clock and its scheduler.
 */
export const DAILY_ACTIVITY_CAPACITY = 8;
const ACTIVITY_COST: Partial<Record<string, number>> = {
  [SettlementCommands.eat]: 1,
  [SettlementCommands.drink]: 1,
  [SettlementCommands.draw]: 2,
  [SettlementCommands.cook]: 2,
  [SettlementCommands.sow]: 3,
  [SettlementCommands.harvest]: 3,
  [SettlementCommands.tend]: 3,
  [SettlementCommands.rest]: 2,
};

export function dailyActivity(world: WorldView, actorId: string) {
  const raw = world.getComponent(actorId, SettlementComponents.holding);
  const day = world.tick;
  const used = Number(raw?.activityDay ?? -1) === day
    ? Math.max(0, Math.min(DAILY_ACTIVITY_CAPACITY, Number(raw?.activityUsed ?? 0)))
    : 0;
  return { day, used, remaining: DAILY_ACTIVITY_CAPACITY - used, capacity: DAILY_ACTIVITY_CAPACITY };
}

function registerActivityBudget(ctx: Registration): void {
  for (const [commandType, cost] of Object.entries(ACTIVITY_COST)) {
    if (!cost) continue;
    ctx.registerConstraintRule({
      id: `settlement-locations.activity.${commandType}.allowed`,
      commandType,
      evaluate: (c) => {
        const actorId = c.command.actorId ?? "";
        if (!c.world.hasEntity(actorId)) return refuse(SettlementRejection.NoSuchResident, "需要一位正在生活的人。");
        const remaining = dailyActivity(c.world, actorId).remaining;
        if (remaining < cost) return refuse(SettlementRejection.Exhausted,
          `今天还剩 ${remaining} 格活动时间，这项需要 ${cost} 格，请先结束这一天。`);
        return { ok: true };
      },
    });
    // Multiple resolution rules' effects share one Kernel transaction. If the
    // business action fails its constraints, the budget is NOT charged.
    ctx.registerResolutionRule({
      id: `settlement-locations.activity.${commandType}.resolve`,
      commandType,
      resolve: (c): Effect[] => {
        const actorId = c.command.actorId as string;
        const before = dailyActivity(c.world, actorId);
        return [{
          kind: "modifyComponent", entityId: actorId,
          component: SettlementComponents.holding,
          patch: { activityDay: c.world.tick, activityUsed: before.used + cost },
          reason: "activity capacity spent in the same world transaction",
        }];
      },
    });
  }
}

/** M2-UX2-B: a small persistent, authorized routine, not a second timeline. */
export type DailyPlanStep = "eat" | "tend" | "rest" | "go-hearth" | "go-field" | "go-kiln" | "go-home" | "pottery";
const PLAN_COMMAND: Record<DailyPlanStep, string> = {
  eat: SettlementCommands.eat,
  tend: SettlementCommands.tend,
  rest: SettlementCommands.rest,
  "go-hearth": SettlementCommands.arrive,
  "go-field": SettlementCommands.arrive,
  "go-kiln": SettlementCommands.arrive,
  "go-home": SettlementCommands.arrive,
  pottery: "practice-runtime.start",
};
const PLAN_DESTINATION: Record<string, string> = {
  "go-hearth": "place:hearth-yard", "go-field": "place:field",
  "go-kiln": "place:kiln", "go-home": "place:yard",
};
const PLAN_STEPS = new Set<string>(Object.keys(PLAN_COMMAND));
export function dailyPlan(world: WorldView, actorId: string) {
  const data = world.getComponent(actorId, SettlementComponents.dailyPlan);
  const steps = Array.isArray(data?.steps) ? data.steps.filter((v): v is DailyPlanStep =>
    typeof v === "string" && PLAN_STEPS.has(v)) : [];
  const progressDay = Number(data?.progressDay ?? -1);
  const repeat = data?.repeat !== false;
  return {
    enabled: data?.enabled === true && steps.length > 0,
    steps,
    repeat,
    revision: Math.max(0, Number(data?.revision ?? 0)),
    progressDay,
    progressIndex: progressDay === world.tick ? Math.min(steps.length,
      Math.max(0, Number(data?.progressIndex ?? 0))) : 0,
  };
}

function registerDailyPlan(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.configurePlan}.allowed`,
    commandType: SettlementCommands.configurePlan,
    evaluate: (c) => {
      if (!c.command.actorId || !c.world.getEntity(c.command.actorId)) {
        return refuse(SettlementRejection.NoSuchResident, "只有存在的人物可以安排日常。");
      }
      const raw = c.command.payload.steps;
      if (!Array.isArray(raw) || raw.length > 6 ||
        !raw.every((v) => typeof v === "string" && PLAN_STEPS.has(v)) ||
        (c.command.payload.enabled === true && raw.length === 0) ||
        typeof c.command.payload.enabled !== "boolean" ||
        typeof c.command.payload.repeat !== "boolean") {
        return refuse(SettlementRejection.Busy, "日程最多安排六项吃饭、劳动、休息或村内步行，启用时至少一项。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.configurePlan}.resolve`,
    commandType: SettlementCommands.configurePlan,
    resolve: (c): Effect[] => [{
      kind: "setComponent", entityId: c.command.actorId as string,
      component: SettlementComponents.dailyPlan,
      value: {
        enabled: c.command.payload.enabled as boolean,
        steps: c.command.payload.steps as DailyPlanStep[],
        repeat: c.command.payload.repeat as boolean,
        revision: dailyPlan(c.world, c.command.actorId as string).revision + 1,
        progressDay: c.world.tick,
        progressIndex: 0,
      },
      reason: "player arranged their own repeatable daily routine",
    }],
  });

  for (const commandType of new Set(Object.values(PLAN_COMMAND))) {
    ctx.registerConstraintRule({
      id: `settlement-locations.plan.${commandType}.allowed`,
      commandType,
      evaluate: (c) => {
        if (c.command.source !== "autosim" || commandType === "practice-runtime.start") return { ok: true };
        const actorId = c.command.actorId ?? "";
        const plan = dailyPlan(c.world, actorId);
        const expectedStep = plan.steps[plan.progressIndex];
        if (!plan.enabled || PLAN_COMMAND[expectedStep] !== commandType ||
            c.command.payload.planStep !== expectedStep ||
            c.command.payload.planIndex !== plan.progressIndex ||
            (commandType === SettlementCommands.arrive &&
              (c.command.payload.travelMode !== "local" ||
               c.command.payload.placeId !== PLAN_DESTINATION[expectedStep]))) {
          return refuse(SettlementRejection.Busy, "自动动作与当前日程不一致，请由玩家重新安排。");
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `settlement-locations.plan.${commandType}.resolve`,
      commandType,
      resolve: (c): Effect[] => {
        if (c.command.source !== "autosim" || commandType === "practice-runtime.start") return [];
        const actorId = c.command.actorId as string;
        const plan = dailyPlan(c.world, actorId);
        const nextIndex = plan.progressIndex + 1;
        return [{
          kind: "modifyComponent", entityId: actorId,
          component: SettlementComponents.dailyPlan,
          patch: {
            progressDay: c.world.tick,
            progressIndex: nextIndex,
            enabled: plan.repeat || nextIndex < plan.steps.length,
          },
          reason: "authorized routine step committed with its actual world action",
        }];
      },
    });
  }
}

/** Starting a Practice is a real transaction; the scheduled-plan cursor moves
 * only if Practice start itself succeeds. Quality checkpoints are never decided
 * by AutoSim.
 */
function registerPotteryPlanStart(ctx: Registration): void {
  const type = "practice-runtime.start";
  ctx.registerConstraintRule({
    id: "settlement-locations.plan.pottery.allowed",
    commandType: type,
    evaluate: (c) => {
      if (c.command.source !== "autosim" || c.command.payload.planStep !== "pottery") return { ok: true };
      const actorId = c.command.actorId ?? "";
      const plan = dailyPlan(c.world, actorId);
      if (!plan.enabled || plan.steps[plan.progressIndex] !== "pottery" ||
          c.command.payload.planIndex !== plan.progressIndex ||
          c.command.payload.definitionId !== "craft-pottery.make-vessel") {
        return refuse(SettlementRejection.Busy, "制陶日程已改变，不能擅自开工。");
      }
      if (occupiedPlaceId(c.world, actorId) !== "place:kiln" ||
          occupiedSpaceId(c.world, actorId) !== "space:kiln-mouth") {
        return refuse(SettlementRejection.WrongPlace, "需要先到共用陶窑的窑口。");
      }
      const alreadyCrafting = c.world.listRelations({ type: "practice-runtime.participates_in", from: actorId })
        .some((relation) => {
          const activity = c.world.getEntity(relation.to);
          const status = activity?.components["practice-runtime.practice"]?.status;
          return activity && activity.archivedAt === undefined && ["active", "blocked", "paused"].includes(String(status));
        });
      if (alreadyCrafting) return refuse(SettlementRejection.Busy, "手中还有未完成的制陶工序，请先亲自处理。");
      if (dailyActivity(c.world, actorId).remaining < 2) {
        return refuse(SettlementRejection.Exhausted, "制陶开工需要今天剩余至少两格活动时间。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: "settlement-locations.plan.pottery.resolve",
    commandType: type,
    resolve: (c): Effect[] => {
      if (c.command.source !== "autosim" || c.command.payload.planStep !== "pottery") return [];
      const actorId = c.command.actorId as string;
      const plan = dailyPlan(c.world, actorId);
      const activity = dailyActivity(c.world, actorId);
      const nextIndex = plan.progressIndex + 1;
      return [{
        kind: "modifyComponent", entityId: actorId,
        component: SettlementComponents.dailyPlan,
        patch: { progressDay: c.world.tick, progressIndex: nextIndex, enabled: plan.repeat || nextIndex < plan.steps.length },
        reason: "real pottery Practice started; authorized routine step completed",
      }, {
        kind: "modifyComponent", entityId: actorId,
        component: SettlementComponents.holding,
        patch: { activityDay: c.world.tick, activityUsed: activity.used + 2 },
        reason: "pottery work occupies daily activity capacity",
      }];
    },
  });
}

export interface HomesteadView {
  exists: boolean;
  characterId: string;
  characterInSettlement: boolean;
  placeId: string;
  placeName: string;
  spaceId: string;
  spaceName: string;
  day: number;
  season: string;
  /** 0 = fed; 10 = hungry. Driven by the world day clock. */
  hunger: number;
  /** Budget for several activities in the same authoritative world day. */
  dailyActivity: ReturnType<typeof dailyActivity>;
  dailyPlan: ReturnType<typeof dailyPlan>;
  /** Field status, visible when standing at the field. */
  crop?: { phase: string; remainingDays: number; tended: boolean; summary: string };
  /** People in the same place, with what they are doing right now. */
  neighbours: { id: string; name: string; role: string; household: string; placeId: string; atWork: boolean }[];
  /** Objects reachable from here, with the action each allows. */
  objects: { id: string; name: string; prototypeId: string; placement: string; quantity: number; visible: boolean }[];
  /** Resources this place renews, and what is left. */
  yields: { resourceId: string; label: string; stock: number; capacity: number; unit: string }[];
  /** Where the player could go next, with the day cost. */
  exits: { placeId: string; name: string; costDays: number; purpose: string }[];
  /** What the player is carrying, by resource. */
  carried: { resourceId: string; label: string; count: number; unit: string }[];
  /** The actions that are legal right now, with a reason when they are not. */
  actions: { id: string; label: string; hint: string; days: number; enabled: boolean; reason: string; payload: Record<string, JsonValue>; activityCost?: number }[];
  note: string;
}

export function homestead(world: WorldView, actorId: string): HomesteadView {
  const placeId = occupiedPlaceId(world, actorId);
  const spaceId = occupiedSpaceId(world, actorId);
  const place = placeId ? readPlace(world.getComponent(placeId, SpaceComponents.place)) : undefined;
  const inSettlement = Boolean(world.getEntity(SettlementId));

  const neighbours = world
    .listEntities({ kind: "modern.character" })
    .filter((entity) => entity.archivedAt === undefined && Boolean(entity.components[SettlementComponents.resident]))
    .map((entity) => {
      const resident = readResident(world, entity.id)!;
      const otherPlace = occupiedPlaceId(world, entity.id);
      return {
        id: entity.id,
        name: String(entity.components["modern.identity"]?.givenName ?? entity.id),
        role: resident.role,
        household: resident.household,
        placeId: otherPlace,
        atWork: otherPlace === resident.workPlace,
      };
    })
    .filter((person) => person.placeId === placeId)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Objects standing in this place, in the space the player occupies, or in the
  // player's own hands. An object in a room the player has not entered is not
  // listed: SPACE-001 says indoor contents appear only once they can be reached.
  const here = occupancyPlaceOf(world, actorId);
  const reachableHolders = new Set([placeId, spaceId].filter(Boolean));
  const objects = world
    .listEntities({ kind: ObjectKinds.item })
    .filter((entity) => entity.archivedAt === undefined)
    .map((entity) => {
      const instance = readObject(entity.components[ObjectComponents.object]);
      const prototype = prototypeOf(world, entity.id);
      const holder = holderOf(world, entity.id);
      const containerId = world
        .listRelations({ type: ObjectRelations.containedIn, from: entity.id })
        .map((relation) => relation.to)[0] ?? "";
      const placement = holder === actorId ? "在手中" : holder ? "在别人手中" : "放着";
      return {
        id: entity.id,
        name: instance.name || prototype.name,
        prototypeId: prototype.prototypeId,
        placement,
        quantity: instance.quantity,
        visible: holder === actorId || reachableHolders.has(containerId),
      };
    })
    .filter((object) => object.visible)
    .sort((a, b) => a.id.localeCompare(b.id));

  const yields = yieldPoints(world)
    .filter((point) => point.placeId === placeId)
    .map((point) => ({
      resourceId: point.resourceId,
      label: point.label,
      stock: point.stock,
      capacity: point.capacity,
      unit: point.unit,
    }));

  const exits = PLACES
    .filter((candidate) => candidate.id !== here)
    .map((candidate) => ({ placeId: candidate.id, name: candidate.name, costDays: candidate.costDays, purpose: PURPOSE[candidate.id] ?? "生活空间" }))
    .sort((a, b) => a.costDays - b.costDays || a.placeId.localeCompare(b.placeId));

  const carried = carrying(world, actorId).map((row) => ({
    resourceId: row.resourceId,
    label: row.label,
    count: row.count,
    unit: row.unit,
  }));

  const actions = homesteadActions(world, actorId, placeId, spaceId);

  return {
    exists: inSettlement,
    characterId: actorId,
    characterInSettlement: Boolean(placeId),
    placeId,
    placeName: place?.name ?? "",
    spaceId,
    spaceName: spaceId ? String(world.getComponent(spaceId, SpaceComponents.space)?.name ?? "") : "",
    day: world.tick,
    season: seasonOf(world.tick),
    hunger: hungerLevel(world, actorId),
    dailyActivity: dailyActivity(world, actorId),
    dailyPlan: dailyPlan(world, actorId),
    ...(placeId === "place:field" ? { crop: { ...fieldCrop(world), summary: cropSummary(world) } } : {}),
    neighbours,
    objects,
    yields,
    exits,
    carried,
    actions,
    note: inSettlement
      ? place?.name
        ? `你正在${place.name}。`
        : "你站在聚落外的开阔处，先走进一个地方。"
      : "这个世界还没有这座聚落。",
  };
}

const PURPOSE: Record<string, string> = {
  "place:yard": "住处与储粮",
  "place:hearth-yard": "做饭与分食",
  "place:river": "取水",
  "place:field": "田地与收成",
  "place:kiln": "烧制陶器",
  "place:claypits": "取黏土",
  "place:reedbed": "割芦苇与柴草",
  "place:ford": "过河与交换",
};

function homesteadActions(
  world: WorldView,
  actorId: string,
  placeId: string,
  spaceId: string,
): HomesteadView["actions"] {
  const actions: HomesteadView["actions"] = [];
  const add = (
    id: string,
    label: string,
    hint: string,
    days: number,
    enabled: boolean,
    reason: string,
    payload: Record<string, JsonValue> = {},
  ) => {
    const cost = id === SettlementCommands.arrive && payload.travelMode === "local" ? 1 : ACTIVITY_COST[id] ?? 0;
    const remaining = dailyActivity(world, actorId).remaining;
    const enoughTime = remaining >= cost;
    actions.push({ id, label, hint, days: cost ? 0 : days,
      enabled: enabled && enoughTime,
      reason: enabled && !enoughTime ? `今日剩余 ${remaining} 格活动时间，不足 ${cost} 格` : reason,
      payload, ...(cost ? { activityCost: cost } : {}) });
  };

  if (!placeId) {
    actionAddExits(add, world, placeId);
    return actions;
  }

  const available = yieldPoints(world).filter((point) => point.placeId === placeId && point.stock > 0);
  for (const point of available) {
    add(
      SettlementCommands.draw,
      `取${point.label}`,
      `这个地方还剩 ${point.stock} ${point.unit}；取用占用部分活动时间。`,
      1,
      true,
      "",
      { resourceId: point.resourceId, placeId },
    );
  }

  const carriedJar = jarInHand(world, actorId);
  const waterHere = available.some((point) => point.resourceId === "resource:water");
  const jarHasRoom = carriedJar ? jarRoom(world, actorId, carriedJar) > 0 : false;
  add(
    SettlementCommands.drink,
    "装水带回",
    carriedJar
      ? jarHasRoom
        ? `把${nameOfObject(world, carriedJar)}灌满，再带回家。`
        : `${nameOfObject(world, carriedJar)}已经装满了。`
      : "手里先要有一个容器，才能装水带走。",
    1,
    Boolean(carriedJar) && jarHasRoom && waterHere,
    !carriedJar ? "手里没有可装的容器" : !waterHere ? "这里没有可取的水" : !jarHasRoom ? "容器已经满了" : "",
    carriedJar ? { containerId: carriedJar, resourceId: "resource:water" } : {},
  );

  const food = available.filter((point) => point.resourceId === "resource:cooked" || point.resourceId === "resource:grain");
  for (const point of food) {
    add(
      SettlementCommands.eat,
      `吃${point.label}`,
      "填饱肚子，也把手里的东西用掉。",
      1,
      true,
      "",
      { resourceId: point.resourceId, placeId },
    );
  }

  for (const relation of world.listRelations({ type: ObjectRelations.heldBy, to: actorId })) {
    const objectId = relation.from;
    if (!carriedRation(world, actorId, objectId)) continue;
    add(SettlementCommands.eat, "吃一份随身熟食",
      "随身的熟食真正减少一份，饥饿程度降低；可在任何聚落地点食用。",
      1, true, "", { objectId, resourceId: "resource:cooked" });
  }

  if (placeId === "place:hearth-yard") {
    const grainId = heldIngredient(world, actorId, "resource:grain");
    const fuelId = heldIngredient(world, actorId, "resource:fuel");
    add(SettlementCommands.cook, "烘制一份粟食",
      "在灶边用自己采集的粟与柴草加工一份可以带走的熟食。",
      1, Boolean(grainId && fuelId && spaceId === "space:hearth"),
      spaceId !== "space:hearth" ? "先走到灶边" : !grainId ? "缺少自己采集的一份粟" : !fuelId ? "缺少一捆自己采集的柴草" : "",
      {});
  }

  if (placeId === "place:field") {
    const crop = fieldCrop(world);
    const grainId = heldIngredient(world, actorId, "resource:grain");
    const inField = spaceId === "space:field-edge";
    add(SettlementCommands.sow, "播种一份粟粒",
      "消耗一份随身粟粒作种子，种下后需照料并等待约三十天。",
      1, inField && !crop.seedId && Boolean(grainId),
      !inField ? "先到田头" : crop.seedId ? "这块田已播种" : !grainId ? "缺少一份自己的粟粒" : "");
    add(SettlementCommands.harvest, "收获田里的粟",
      "成熟且已照料的作物，一次收获三份真实粮食。",
      1, inField && crop.phase === "ready",
      !inField ? "先到田头" : !crop.seedId ? "还没有播种" : !crop.tended ? "先照料田地" : crop.remainingDays ? `还需等待 ${crop.remainingDays} 天` : "");
  }

  const workSpace = SPACE_WORK[spaceId];
  if (workSpace) {
    add(SettlementCommands.tend, workSpace.label, workSpace.hint, workSpace.days, true, "", { spaceId });
  }

  const homeSpace = HOME_SPACES.includes(spaceId);
  add(
    SettlementCommands.rest,
    homeSpace ? "在家休息" : "歇一会儿",
    homeSpace ? "在自己家里休息；结束今天才会进入第二天。" : "这里不是住处，只能短暂歇脚。",
    homeSpace ? 0 : 1,
    true,
    "",
    { spaceId },
  );

  add(SettlementCommands.step, "让这一天过去", "时间向前走一天，聚落里的其他人也会继续过日子。", 1, true, "", {});
  actionAddExits(add, world, placeId);
  return actions;
}

function actionAddExits(
  add: (id: string, label: string, hint: string, days: number, enabled: boolean, reason: string, payload?: Record<string, JsonValue>) => void,
  world: WorldView,
  placeId: string,
): void {
  for (const place of PLACES) {
    if (place.id === placeId) continue;
    add(
      SettlementCommands.arrive,
      `走到${place.name}`,
      placeId ? `${PURPOSE[place.id] ?? "生活空间"}；村内步行花 1 格活动时间。` : `${PURPOSE[place.id] ?? "生活空间"}；旧版到达耗时 ${place.costDays} 天。`,
      placeId ? 0 : place.costDays,
      true,
      "",
      placeId ? { placeId: place.id, travelMode: "local" } : { placeId: place.id },
    );
  }
  // Rooms of the current place are one step away, not a day's walk.
  const authored = PLACES.find((place) => place.id === placeId);
  for (const space of authored?.spaces ?? []) {
    add(
      SpaceCommands.moveWithin,
      `走到${space.name}`,
      `就在这个院子里；${space.capacity > 0 ? `最多容纳 ${space.capacity} 人。` : "开阔处，不限制人数。"}`,
      0,
      true,
      "",
      { spaceId: space.id },
    );
  }
}

const HOME_SPACES = [
  "space:main-sleep", "space:yu-sleep", "space:lan-sleep", "space:reed-sleep",
  "space:clay-sleep", "space:water-sleep", "space:hearth-sleep", "space:ford-sleep",
];

const SPACE_WORK: Record<string, { label: string; hint: string; days: number }> = {
  "space:hearth": { label: "在灶边做饭", hint: "把粮食做成能吃的熟食，之后可以取用。", days: 1 },
  "space:field-edge": { label: "照看田地", hint: "除草、看水；田地会记得这次照看。", days: 1 },
  "space:kiln-mouth": { label: "看守窑火", hint: "看一次火候，学到的经验会留在手里。", days: 1 },
  "space:pit-edge": { label: "试挖黏土", hint: "看看这一层土适不适合做器。", days: 1 },
  "space:reed-cut": { label: "割芦苇", hint: "割一捆芦苇，可以编席、编绳。", days: 1 },
  "space:drying-rack": { label: "翻晾坯体", hint: "让湿坯干得更均匀。", days: 1 },
  "space:bank": { label: "在河边洗衣", hint: "把身上的东西洗一洗。", days: 1 },
  "space:ford-landing": { label: "在渡口等船", hint: "听听对岸最近的行情。", days: 1 },
};

function occupancyPlaceOf(world: WorldView, actorId: string): string {
  return occupiedPlaceId(world, actorId);
}

function jarInHand(world: WorldView, actorId: string): string {
  return world
    .listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from)
    .find((id) => prototypeOf(world, id).capabilities.includes("liquid-holder")) ?? "";
}

function jarRoom(world: WorldView, actorId: string, jarId: string): number {
  const prototype = prototypeOf(world, jarId);
  const inside = contentsOf(world, jarId)
    .map((id) => readObject(world.getComponent(id, ObjectComponents.object)).quantity)
    .reduce((sum, amount) => sum + amount, 0);
  return Math.max(0, prototype.capacity - inside);
}

function nameOfObject(world: WorldView, objectId: string): string {
  const instance = readObject(world.getComponent(objectId, ObjectComponents.object));
  return instance.name || prototypeOf(world, objectId).name;
}

export function carrying(world: WorldView, actorId: string): { resourceId: string; label: string; count: number; unit: string }[] {
  const rows = new Map<string, { resourceId: string; label: string; count: number; unit: string }>();
  const held = world.listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((relation) => relation.from);
  for (const objectId of held) {
    const entity = world.getEntity(objectId);
    if (!entity || entity.archivedAt !== undefined) continue;
    const prototype = prototypeOf(world, objectId);
    const instance = readObject(entity.components[ObjectComponents.object]);
    const amount = prototype.capacity > 0 && instance.quantity === 0 ? 1 : Math.max(1, instance.quantity);
    const row = rows.get(prototype.resourceId) ?? {
      resourceId: prototype.resourceId,
      label: RESOURCE_LABELS[prototype.resourceId] ?? prototype.name,
      count: 0,
      unit: prototype.unit,
    };
    row.count += amount;
    rows.set(prototype.resourceId, row);
    // Contents of a carried container travel with it.
    for (const inner of contentsOf(world, objectId)) {
      const innerPrototype = prototypeOf(world, inner);
      const innerInstance = readObject(world.getComponent(inner, ObjectComponents.object));
      const innerRow = rows.get(innerPrototype.resourceId) ?? {
        resourceId: innerPrototype.resourceId,
        label: RESOURCE_LABELS[innerPrototype.resourceId] ?? innerPrototype.name,
        count: 0,
        unit: innerPrototype.unit,
      };
      innerRow.count += Math.max(1, innerInstance.quantity);
      rows.set(innerPrototype.resourceId, innerRow);
    }
  }
  return [...rows.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId));
}

export function people(world: WorldView): { residents: Record<string, unknown>[]; households: number } {
  const residents = world
    .listEntities({ kind: "modern.character" })
    .filter((entity) => entity.archivedAt === undefined && Boolean(entity.components[SettlementComponents.resident]))
    .map((entity) => {
      const resident = readResident(world, entity.id)!;
      return {
        id: entity.id,
        name: String(entity.components["modern.identity"]?.givenName ?? entity.id),
        age: Math.floor((world.tick - Number(entity.components["modern.identity"]?.bornAt ?? world.tick)) / DAY_TICKS_PER_YEAR),
        ...resident,
        placeId: occupiedPlaceId(world, entity.id),
        placeName: PLACES.find((place) => place.id === occupiedPlaceId(world, entity.id))?.name ?? "",
        spaceName: String(world.getComponent(resident.homeSpace, SpaceComponents.space)?.name ?? ""),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return { residents, households: new Set(residents.map((resident) => resident.household)).size };
}

export function worksites(world: WorldView): {
  places: { placeId: string; name: string; purpose: string; costDays: number; occupants: number; resources: YieldState[]; objects: number }[];
  totals: { resourceId: string; label: string; stock: number; capacity: number; unit: string }[];
} {
  const points = yieldPoints(world);
  const places = PLACES.map((place) => {
    // Objects count as "in this place" when they stand in the place itself or
    // in one of its spaces; a jar in the storage room is still the yard's jar.
    const holders = new Set<string>([place.id, ...place.spaces.map((space) => space.id)]);
    return {
      placeId: place.id,
      name: place.name,
      purpose: PURPOSE[place.id] ?? "生活空间",
      costDays: place.costDays,
      occupants: world.listRelations({ type: SpaceRelations.occupancy, to: place.id }).length,
      resources: points.filter((point) => point.placeId === place.id),
      objects: world
        .listEntities({ kind: ObjectKinds.item })
        .filter((entity) => entity.archivedAt === undefined)
        .filter((entity) =>
          world
            .listRelations({ type: ObjectRelations.containedIn, from: entity.id })
            .some((relation) => holders.has(relation.to)),
        ).length,
    };
  });
  const totals = new Map<string, { resourceId: string; label: string; stock: number; capacity: number; unit: string }>();
  for (const point of points) {
    const row = totals.get(point.resourceId) ?? {
      resourceId: point.resourceId,
      label: RESOURCE_LABELS[point.resourceId] ?? point.label,
      stock: 0, capacity: 0, unit: point.unit,
    };
    row.stock += point.stock;
    row.capacity += point.capacity;
    totals.set(point.resourceId, row);
  }
  return { places, totals: [...totals.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId)) };
}

function isStandingIn(world: WorldView, objectId: string, placeId: string): boolean {
  const container = world
    .listRelations({ type: ObjectRelations.containedIn, from: objectId })
    .map((relation) => relation.to)[0];
  return container === placeId;
}

function seasonOf(tick: number): string {
  const month = (Math.floor(tick / DAYS_PER_MONTH) % 12) + 1;
  if (month >= 3 && month <= 5) return "春";
  if (month >= 6 && month <= 8) return "夏";
  if (month >= 9 && month <= 11) return "秋";
  return "冬";
}

// ---------------------------------------------------------------------------
// Daily actions
// ---------------------------------------------------------------------------

function registerDraw(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.draw}.allowed`,
    commandType: SettlementCommands.draw,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const placeId = String(c.command.payload.placeId ?? occupiedPlaceId(c.world, actorId));
      if (occupiedPlaceId(c.world, actorId) !== placeId) {
        return refuse(SettlementRejection.WrongPlace, "你得先走到那里，才能取用它的东西。");
      }
      const resourceId = String(c.command.payload.resourceId ?? "");
      const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId);
      if (!point) return refuse(SettlementRejection.NoSuchPlace, "这个地方没有这种资源。");
      if (point.stock <= 0) {
        return refuse(SettlementRejection.Exhausted, `${point.label}这一季已经取尽了，过些时候才会回来。`);
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.draw}.resolve`,
    commandType: SettlementCommands.draw,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const placeId = String(c.command.payload.placeId ?? occupiedPlaceId(c.world, actorId));
      const resourceId = String(c.command.payload.resourceId);
      const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId)!;
      // How much one draw can take is bounded by what the place holds, never by
      // a fixed 1: a player carrying a basket should be able to carry a basket.
      const amount = clampInt(c.command.payload.amount, 1, 1, point.stock);
      const taken = Math.min(amount, point.stock);

      // A draw is one transaction: the place loses exactly what the player
      // gains, and the item that carries it is spawned in the same commit.
      const effects: Effect[] = [{
        kind: "setComponent",
        entityId: `yield:${placeId}:${resourceId}`,
        component: SettlementComponents.yieldPoint,
        value: {
          placeId, resourceId, label: point.label, unit: point.unit,
          capacity: point.capacity, stock: point.stock - taken,
          renewDays: point.renewDays, lastRenewedAt: c.world.tick,
        },
      }];

      const prototypeId = prototypeForResource(resourceId);
      // Gathered objects are keyed by tick *and* by how much the place has
      // already given up, so two draws in one tick cannot collide while the id
      // stays deterministic for a given seed and command sequence.
      for (let index = 0; index < taken; index += 1) {
        const objectId = `settlement-locations:gathered:${c.world.tick}:${placeId}:${resourceId}:${point.stock - taken + index}`;
        effects.push({
          kind: "spawnEntity",
          localId: `gathered:${index}`,
          id: objectId,
          entityKind: ObjectKinds.item,
          components: {
            [ObjectComponents.object]: {
              prototypeId, name: "", condition: "fresh", quantity: 1,
              durability: 0, madeAt: c.world.tick,
              provenance: { from: placeId, at: c.world.tick },
              visibleFromOutside: true,
            } as unknown as Record<string, never>,
          },
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.instanceOf,
          from: objectId,
          to: prototypeId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.ownedBy,
          from: objectId,
          to: actorId,
          announce: false,
        }, {
          kind: "addRelation",
          type: ObjectRelations.heldBy,
          from: objectId,
          to: actorId,
          announce: false,
        });
      }

      effects.push({
        kind: "emitEvent",
        eventType: "settlement-locations.gathered",
        actorId,
        targetId: placeId,
        data: { placeId, resourceId, amount: taken, remaining: point.stock - taken },
        historicalSignificance: 0,
      });
      return effects;
    },
  });
}

function registerDrink(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.drink}.allowed`,
    commandType: SettlementCommands.drink,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const containerId = String(c.command.payload.containerId ?? "");
      const holder = holderOf(c.world, containerId);
      if (containerId && holder !== actorId) {
        return refuse(SettlementRejection.NotYours, "要先把容器拿在手里。");
      }
      if (!containerId) return refuse(SettlementRejection.NotYours, "手里没有可装的容器。");
      const prototype = prototypeOf(c.world, containerId);
      if (!prototype.capabilities.includes("liquid-holder")) {
        return refuse(SettlementRejection.NotYours, `${prototype.name}装不了水。`);
      }
      if (jarRoom(c.world, actorId, containerId) <= 0) {
        return refuse(SettlementRejection.NoRoom, `${prototype.name}已经装满了。`);
      }
      const placeId = occupiedPlaceId(c.world, actorId);
      const water = yieldPoints(c.world).some((point) => point.placeId === placeId && point.resourceId === "resource:water" && point.stock > 0);
      if (!water) return refuse(SettlementRejection.NoSuchPlace, "这里没有可取的水。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.drink}.resolve`,
    commandType: SettlementCommands.drink,
    resolve: (c) => fillEffects(c.world, c.command.actorId as string, String(c.command.payload.containerId), "resource:water", c.world.tick),
  });
}

function registerEat(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.eat}.allowed`,
    commandType: SettlementCommands.eat,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const objectId = String(c.command.payload.objectId ?? "");
      if (objectId) {
        if (!carriedRation(c.world, actorId, objectId)) {
          return refuse(SettlementRejection.NotYours, "要先亲自持有一份可食用的熟食。");
        }
        return { ok: true };
      }
      // Legacy shared meals remain available at the public food point.
      const placeId = occupiedPlaceId(c.world, actorId);
      const resourceId = String(c.command.payload.resourceId ?? "");
      const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId);
      if (!point || point.stock <= 0 || !["resource:cooked", "resource:grain"].includes(resourceId)) {
        return refuse(SettlementRejection.Empty, "这里现在没有能吃的东西。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.eat}.resolve`,
    commandType: SettlementCommands.eat,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const objectId = String(c.command.payload.objectId ?? "");
      const before = hungerLevel(c.world, actorId);
      const after = Math.max(0, before - 4);
      const effects: Effect[] = [{
        kind: "modifyComponent",
        entityId: actorId,
        component: SettlementComponents.holding,
        patch: { hunger: after, hungerAt: c.world.tick },
        reason: "eating eases hunger; future hunger follows the world clock",
      }];
      if (objectId) {
        const item = readObject(c.world.getComponent(objectId, ObjectComponents.object));
        if (item.quantity > 1) {
          effects.push({
            kind: "modifyComponent", entityId: objectId, component: ObjectComponents.object,
            patch: { quantity: item.quantity - 1 }, reason: "one cooked ration eaten",
          });
        } else {
          effects.push({
            kind: "removeRelation", type: ObjectRelations.heldBy,
            from: objectId, to: actorId, reason: "carried food eaten", announce: false,
          }, {
            kind: "archiveEntity", entityId: objectId, reason: "consumed by eating", announce: false,
          });
        }
        effects.push({
          kind: "emitEvent", eventType: "settlement-locations.ate",
          actorId, targetId: objectId,
          data: { objectId, resourceId: "resource:cooked", from: "carried", shared: false, hungerBefore: before, hungerAfter: after },
          historicalSignificance: 0,
        });
      } else {
        const placeId = occupiedPlaceId(c.world, actorId);
        const resourceId = String(c.command.payload.resourceId);
        const point = yieldPoints(c.world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId)!;
        effects.push({
          kind: "setComponent",
          entityId: `yield:${placeId}:${resourceId}`,
          component: SettlementComponents.yieldPoint,
          value: {
            placeId, resourceId, label: point.label, unit: point.unit,
            capacity: point.capacity, stock: point.stock - 1,
            renewDays: point.renewDays, lastRenewedAt: c.world.tick,
          },
        }, {
          kind: "emitEvent", eventType: "settlement-locations.ate",
          actorId, targetId: placeId,
          data: { resourceId, label: point.label, from: "share", shared: true, hungerBefore: before, hungerAfter: after },
          historicalSignificance: 0,
        });
      }
      return effects;
    },
  });
}


/**
 * M2-A1: turn one personally gathered grain and one fuel bundle into one
 * cooked ration at the shared hearth.  Inputs and output share one transaction.
 */
function heldIngredient(world: WorldView, actorId: string, resourceId: string): string {
  return world.listRelations({ type: ObjectRelations.heldBy, to: actorId })
    .map((relation) => relation.from)
    .sort((a, b) => a.localeCompare(b))
    .find((id) => {
      const entity = world.getEntity(id);
      if (!entity || entity.archivedAt !== undefined) return false;
      return ownerOf(world, id) === actorId
        && prototypeOf(world, id).resourceId === resourceId
        && readObject(entity.components[ObjectComponents.object]).quantity === 1;
    }) ?? "";
}

function registerCook(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.cook}.allowed`,
    commandType: SettlementCommands.cook,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:hearth-yard" ||
          occupiedSpaceId(c.world, actorId) !== "space:hearth") {
        return refuse(SettlementRejection.WrongPlace, "需要先到公用灶台的灶边。");
      }
      if (!c.world.getEntity("prototype:cooked-food")) {
        return refuse(SettlementRejection.Empty, "这里尚不能加工粮食。");
      }
      if (!heldIngredient(c.world, actorId, "resource:grain")) {
        return refuse(SettlementRejection.Empty, "需先采集一份自己持有的粟。");
      }
      if (!heldIngredient(c.world, actorId, "resource:fuel")) {
        return refuse(SettlementRejection.Empty, "还需要一捆自己采集的柴草。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.cook}.resolve`,
    commandType: SettlementCommands.cook,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const grainId = heldIngredient(c.world, actorId, "resource:grain");
      const fuelId = heldIngredient(c.world, actorId, "resource:fuel");
      const cookedId = `settlement-locations:cooked:${grainId}`;
      const effects: Effect[] = [];
      for (const ingredientId of [grainId, fuelId]) {
        effects.push({
          kind: "removeRelation", type: ObjectRelations.heldBy,
          from: ingredientId, to: actorId, reason: "consumed in cooking", announce: false,
        }, {
          kind: "archiveEntity", entityId: ingredientId,
          reason: "consumed in cooking", announce: false,
        });
      }
      effects.push({
        kind: "spawnEntity",
        localId: "cooked-ration",
        id: cookedId,
        entityKind: ObjectKinds.item,
        components: {
          [ObjectComponents.object]: {
            prototypeId: "prototype:cooked-food", name: "灶边烘粟", condition: "fresh",
            quantity: 1, durability: 0, madeAt: c.world.tick,
            provenance: { fromGrainId: grainId, fromFuelId: fuelId, at: c.world.tick },
            visibleFromOutside: false,
          } as unknown as Record<string, never>,
        },
        announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.instanceOf,
        from: cookedId, to: "prototype:cooked-food", announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.ownedBy,
        from: cookedId, to: actorId, announce: false,
      }, {
        kind: "addRelation", type: ObjectRelations.heldBy,
        from: cookedId, to: actorId, announce: false,
      }, {
        kind: "emitEvent", eventType: "settlement-locations.cooked",
        actorId, targetId: cookedId,
        data: { grainId, fuelId, cookedId, placeId: "place:hearth-yard" },
        historicalSignificance: 0.04,
      });
      return effects;
    },
  });
}


/** M2-A3: one consumed grain is the seed for one bounded, tended field crop. */
function registerSow(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.sow}.allowed`,
    commandType: SettlementCommands.sow,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:field" ||
          occupiedSpaceId(c.world, actorId) !== "space:field-edge") {
        return refuse(SettlementRejection.WrongPlace, "必须到河岸旱地的田头播种。");
      }
      if (fieldCrop(c.world).seedId) {
        return refuse(SettlementRejection.Busy, "这块田已经种了粟，先等收获后再播种。");
      }
      if (!heldIngredient(c.world, actorId, "resource:grain")) {
        return refuse(SettlementRejection.Empty, "播种需要一份自己持有的真实粟粒。");
      }
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.sow}.resolve`,
    commandType: SettlementCommands.sow,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const seedId = heldIngredient(c.world, actorId, "resource:grain");
      const previous = fieldCrop(c.world);
      return [{
        kind: "removeRelation", type: ObjectRelations.heldBy, from: seedId, to: actorId,
        reason: "grain planted as seed", announce: false,
      }, {
        kind: "archiveEntity", entityId: seedId, reason: "grain planted as seed", announce: false,
      }, {
        kind: "setComponent", entityId: "place:field",
        component: SettlementComponents.cropPlot,
        value: { seedId, sownAt: c.world.tick, tended: false, harvests: previous.harvests },
        reason: "sow grain in the field",
      }, {
        kind: "emitEvent", eventType: "settlement-locations.sown",
        actorId, targetId: "place:field", data: { seedId, matureAt: c.world.tick + CROP_GROW_DAYS },
        historicalSignificance: 0.04,
      }];
    },
  });
}

function registerHarvest(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.harvest}.allowed`,
    commandType: SettlementCommands.harvest,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (occupiedPlaceId(c.world, actorId) !== "place:field" ||
          occupiedSpaceId(c.world, actorId) !== "space:field-edge") {
        return refuse(SettlementRejection.WrongPlace, "需要亲自到田头收获。");
      }
      const crop = fieldCrop(c.world);
      if (!crop.seedId) return refuse(SettlementRejection.Empty, "这块地还没有播种。");
      if (!crop.tended) return refuse(SettlementRejection.Busy, "粟田还没照料，不能收获。");
      if (crop.remainingDays > 0) return refuse(SettlementRejection.Busy, `粟还要生长约 ${crop.remainingDays} 天。`);
      return { ok: true };
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.harvest}.resolve`,
    commandType: SettlementCommands.harvest,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const crop = fieldCrop(c.world);
      const effects: Effect[] = [{
        kind: "setComponent", entityId: "place:field",
        component: SettlementComponents.cropPlot,
        value: { seedId: "", sownAt: 0, tended: false, harvests: crop.harvests + 1 },
        reason: "harvest completed; plot is fallow again",
      }];
      for (let index = 0; index < CROP_YIELD; index += 1) {
        const objectId = `settlement-locations:harvest:${crop.seedId}:${index}`;
        effects.push({
          kind: "spawnEntity", localId: `harvest-${index}`, id: objectId,
          entityKind: ObjectKinds.item, announce: false,
          components: {
            [ObjectComponents.object]: {
              prototypeId: "prototype:grain", name: "新收的粟", condition: "fresh",
              quantity: 1, durability: 0, madeAt: c.world.tick,
              provenance: { seedId: crop.seedId, from: "place:field", at: c.world.tick },
              visibleFromOutside: false,
            } as unknown as Record<string, never>,
          },
        }, {
          kind: "addRelation", type: ObjectRelations.instanceOf,
          from: objectId, to: "prototype:grain", announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.ownedBy,
          from: objectId, to: actorId, announce: false,
        }, {
          kind: "addRelation", type: ObjectRelations.heldBy,
          from: objectId, to: actorId, announce: false,
        });
      }
      effects.push({
        kind: "emitEvent", eventType: "settlement-locations.harvested",
        actorId, targetId: "place:field",
        data: { seedId: crop.seedId, amount: CROP_YIELD, harvests: crop.harvests + 1 },
        historicalSignificance: 0.07,
      });
      return effects;
    },
  });
}


function registerTend(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.tend}.allowed`,
    commandType: SettlementCommands.tend,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      const spaceId = String(c.command.payload.spaceId ?? occupiedSpaceId(c.world, actorId));
      if (!spaceId) return refuse(SettlementRejection.WrongPlace, "你不在哪个工作的地方。");
      const space = c.world.getEntity(spaceId);
      if (!space || space.kind !== SpaceKinds.space) {
        return refuse(SettlementRejection.NoSuchPlace, "这里没有这样一个工作的地方。");
      }
      if (occupiedSpaceId(c.world, actorId) !== spaceId) {
        return refuse(SettlementRejection.WrongPlace, "要先走到那个位置上。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.tend}.resolve`,
    commandType: SettlementCommands.tend,
    resolve: (c) => {
      const actorId = c.command.actorId as string;
      const spaceId = String(c.command.payload.spaceId ?? occupiedSpaceId(c.world, actorId));
      const work = SPACE_WORK[spaceId];
      const effects: Effect[] = [{
        kind: "modifyComponent",
        entityId: actorId,
        component: SettlementComponents.holding,
        patch: {
          lastWorkSpace: spaceId,
          lastWorkAt: c.world.tick,
          workCount: Number(c.world.getComponent(actorId, SettlementComponents.holding)?.workCount ?? 0) + 1,
        },
        reason: "a day of work at a settlement worksite",
      }, {
        kind: "emitEvent",
        eventType: "settlement-locations.worked",
        actorId,
        targetId: spaceId,
        data: { spaceId, label: work?.label ?? "劳作" },
        historicalSignificance: 0,
      }];
      const crop = fieldCrop(c.world);
      if (spaceId === "space:field-edge" && crop.seedId && !crop.tended) {
        effects.push({
          kind: "setComponent", entityId: "place:field",
          component: SettlementComponents.cropPlot,
          value: { seedId: crop.seedId, sownAt: crop.sownAt, tended: true, harvests: crop.harvests },
          reason: "field tended after sowing",
        });
      }
      return effects;
    },
  });
}

function registerRest(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.rest}.allowed`,
    commandType: SettlementCommands.rest,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!occupiedPlaceId(c.world, actorId)) {
        return refuse(SettlementRejection.WrongPlace, "先走进一个能休息的地方。");
      }
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.rest}.resolve`,
    commandType: SettlementCommands.rest,
    resolve: (c) => [{
      kind: "modifyComponent",
      entityId: c.command.actorId as string,
      component: SettlementComponents.holding,
      patch: { lastRestedAt: c.world.tick },
      reason: "rested at the settlement",
    }, {
      kind: "emitEvent",
      eventType: "settlement-locations.rested",
      actorId: c.command.actorId,
      data: { placeId: occupiedPlaceId(c.world, c.command.actorId as string) },
      historicalSignificance: 0,
    }],
  });
}

/**
 * "Let a day pass."
 *
 * This is the one action that moves the clock. It is a command, not a direct
 * `advanceBy`, so the day boundary is still observed by the scheduler and the
 * month pulse stays honest (TIME-RFC-001).
 */
function registerEndDay(ctx: Registration): void {
  ctx.registerConstraintRule({
    id: `${SettlementCommands.step}.allowed`,
    commandType: SettlementCommands.step,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!c.world.hasEntity(actorId)) return refuse(SettlementRejection.NoSuchResident, "需要一位正在生活的人。");
      return { ok: true };
    },
  });

  ctx.registerResolutionRule({
    id: `${SettlementCommands.step}.resolve`,
    commandType: SettlementCommands.step,
    resolve: (c) => [{
      kind: "modifyComponent",
      entityId: c.command.actorId as string,
      component: SettlementComponents.holding,
      patch: { daysLived: Number(c.world.getComponent(c.command.actorId as string, SettlementComponents.holding)?.daysLived ?? 0) + 1 },
      reason: "one day of settlement life passed",
    }, {
      kind: "emitEvent",
      eventType: "settlement-locations.day_passed",
      actorId: c.command.actorId,
      data: { placeId: occupiedPlaceId(c.world, c.command.actorId as string), tick: c.world.tick },
      historicalSignificance: 0,
    }],
  });
}

/**
 * Fills a carried container from a place's water, in one transaction.
 *
 * The container gains contents and the place loses exactly the same amount, so
 * the two halves can never diverge (OBJ-001 stock conservation).
 */
export function fillEffects(world: WorldView, actorId: string, containerId: string, resourceId: string, tick: number): Effect[] {
  const prototype = prototypeOf(world, containerId);
  const room = jarRoom(world, actorId, containerId);
  const placeId = occupiedPlaceId(world, actorId);
  const point = yieldPoints(world).find((candidate) => candidate.placeId === placeId && candidate.resourceId === resourceId);
  const amount = Math.max(0, Math.min(room, point?.stock ?? 0, prototype.capacity));
  if (amount <= 0 || !point) return [];

  const effects: Effect[] = [{
    kind: "setComponent",
    entityId: `yield:${placeId}:${resourceId}`,
    component: SettlementComponents.yieldPoint,
    value: {
      placeId, resourceId, label: point.label, unit: point.unit,
      capacity: point.capacity, stock: point.stock - amount,
      renewDays: point.renewDays, lastRenewedAt: tick,
    },
  }];

  const prototypeId = prototypeForResource(resourceId);
  const contents = contentsOf(world, containerId);
  const waterId = contents.find((id) => prototypeOf(world, id).resourceId === resourceId);
  if (waterId) {
    const current = readObject(world.getComponent(waterId, ObjectComponents.object));
    effects.push({
      kind: "modifyComponent",
      entityId: waterId,
      component: ObjectComponents.object,
      patch: { quantity: current.quantity + amount, condition: "fresh" },
      reason: "container filled from the settlement water point",
    });
  } else {
    const objectId = `settlement-locations:filled:${tick}:${resourceId}`;
    effects.push({
      kind: "spawnEntity",
      localId: "filled",
      id: objectId,
      entityKind: ObjectKinds.item,
      components: {
        [ObjectComponents.object]: {
          prototypeId, name: "", condition: "fresh", quantity: amount,
          durability: 0, madeAt: tick, provenance: { from: placeId, at: tick },
          visibleFromOutside: false,
        } as unknown as Record<string, never>,
      },
      announce: false,
    }, {
      kind: "addRelation",
      type: ObjectRelations.instanceOf,
      from: objectId,
      to: prototypeId,
      announce: false,
    }, {
      kind: "addRelation",
      type: ObjectRelations.ownedBy,
      from: objectId,
      to: actorId,
      announce: false,
    }, {
      kind: "addRelation",
      type: ObjectRelations.containedIn,
      from: objectId,
      to: containerId,
      announce: false,
    });
  }

  effects.push({
    kind: "emitEvent",
    eventType: "settlement-locations.water_carried",
    actorId,
    targetId: containerId,
    data: { containerId, amount, placeId, remaining: point.stock - amount },
    historicalSignificance: 0,
  });
  return effects;
}

/** Maps a bulk resource to the prototype that carries one unit of it. */
export function prototypeForResource(resourceId: string): string {
  const mapping: Record<string, string> = {
    "resource:water": "prototype:water",
    "resource:grain": "prototype:grain",
    "resource:clay": "prototype:clay-batch",
    "resource:fuel": "prototype:fuel-bundle",
    "resource:reed": "prototype:reed-bundle",
    "resource:cooked": "prototype:cooked-food",
    "resource:fish": "prototype:fish",
    "resource:fiber": "prototype:fiber-bundle",
  };
  return mapping[resourceId] ?? "prototype:grain";
}

// ---------------------------------------------------------------------------
// Authored instances: 80+ objects with a real place and a real owner
// ---------------------------------------------------------------------------

interface InstanceSpec {
  id: string;
  prototypeId: string;
  ownerId: string;
  inId: string;
  quantity?: number;
}

/**
 * Objects the settlement starts with.
 *
 * Generated from the authored places and households so that every instance has
 * both a position and an owner; the counts are asserted by the M1 density test.
 */
function buildInstances(): InstanceSpec[] {
  const out: InstanceSpec[] = [];
  const push = (id: string, prototypeId: string, ownerId: string, inId: string, quantity = 0) =>
    out.push({ id, prototypeId, ownerId, inId, quantity });

  // Household vessels, each in the space it belongs to.
  const households: { household: string; ownerKey: string; sleepSpace: string; jarCount: number }[] = [
    { household: "陶家", ownerKey: "elder", sleepSpace: "space:main-sleep", jarCount: 3 },
    { household: "予家", ownerKey: "yu", sleepSpace: "space:yu-sleep", jarCount: 2 },
    { household: "岚家", ownerKey: "lan", sleepSpace: "space:lan-sleep", jarCount: 2 },
    { household: "苇家", ownerKey: "reed-worker", sleepSpace: "space:reed-sleep", jarCount: 2 },
    { household: "埴家", ownerKey: "clay-digger", sleepSpace: "space:clay-sleep", jarCount: 2 },
    { household: "汲家", ownerKey: "water-carrier", sleepSpace: "space:water-sleep", jarCount: 3 },
    { household: "灶家", ownerKey: "cook", sleepSpace: "space:hearth-sleep", jarCount: 2 },
    { household: "埴公家", ownerKey: "trader-elder", sleepSpace: "space:ford-sleep", jarCount: 1 },
  ];

  for (const [index, household] of households.entries()) {
    const owner = residentId(household.ownerKey);
    for (let n = 0; n < household.jarCount; n += 1) {
      push(`instance:jar:${index}:${n}`, n === 0 ? "prototype:water-jar" : "prototype:small-jar", owner, household.sleepSpace, 0);
    }
    push(`instance:bowl:${index}`, "prototype:bowl", owner, household.sleepSpace);
    push(`instance:mat:${index}`, "prototype:sleep-mat", owner, household.sleepSpace);
    push(`instance:mat:${index}:b`, "prototype:mat", owner, household.sleepSpace);
    push(`instance:bag:${index}`, "prototype:carrying-bag", owner, household.sleepSpace);
    push(`instance:cloak:${index}`, index % 2 === 0 ? "prototype:hide-cloak" : "prototype:fiber-wrap", owner, household.sleepSpace);
    push(`instance:knife:${index}`, "prototype:stone-knife", owner, household.sleepSpace);
    push(`instance:needle:${index}`, "prototype:bone-needle", owner, household.sleepSpace);
    push(`instance:fiber:${index}`, "prototype:fiber-bundle", owner, household.sleepSpace, 1);
    push(`instance:rope:${index}`, "prototype:rope", owner, household.sleepSpace);
    push(`instance:grain-basket:${index}`, "prototype:grain-basket", owner, household.sleepSpace, 0);
    push(`instance:grain:${index}`, "prototype:grain", owner, `instance:grain-basket:${index}`, 2);
  }

  // Yard: storage, drying and the household cooking pot.
  push("instance:grain-urn:0", "prototype:grain-jar", residentId("elder"), "space:store", 0);
  push("instance:grain-urn:0:grain", "prototype:grain", residentId("elder"), "instance:grain-urn:0", 3);
  push("instance:grain-urn:1", "prototype:grain-jar", residentId("elder-wife"), "space:store", 0);
  push("instance:cooking-pot:0", "prototype:cooking-pot", residentId("elder-wife"), "space:hearth", 0);
  push("instance:sieve:0", "prototype:sieve", residentId("elder"), "space:drying-rack");
  push("instance:greenware:0", "prototype:small-jar", residentId("elder"), "space:drying-rack");
  push("instance:greenware:1", "prototype:bowl", residentId("elder"), "space:drying-rack");

  // Hearth yard: shared cooking equipment and firewood.
  push("instance:hearth-pot", "prototype:cooking-pot", residentId("cook"), "space:hearth");
  push("instance:hearth-millstone", "prototype:grinding-stone", residentId("cook"), "space:hearth", 0);
  push("instance:hearth-wood:0", "prototype:fuel-bundle", residentId("cook"), "space:hearth", 0);
  push("instance:hearth-wood:1", "prototype:fuel-bundle", residentId("cook-helper"), "space:hearth", 0);
  push("instance:hearth-basket", "prototype:grain-basket", residentId("cook"), "space:hearth", 0);
  push("instance:hearth-grain", "prototype:grain", residentId("cook"), "instance:hearth-basket", 4);

  // River: the common water jar, kept at the bank.
  push("instance:bank-jar:0", "prototype:water-jar", residentId("water-carrier"), "space:bank", 0);
  push("instance:bank-jar:1", "prototype:water-jar", residentId("water-carrier"), "space:bank", 0);
  push("instance:bank-jar:2", "prototype:small-jar", residentId("water-child"), "space:bank", 0);
  push("instance:bank-cache", "prototype:water-cache", residentId("water-carrier"), "space:bank", 6);
  push("instance:bank-net", "prototype:net", residentId("water-carrier"), "space:bank");
  push("instance:bank-trap", "prototype:fish-trap", residentId("water-child"), "space:bank", 0);

  // Field: tools and the household grain.
  push("instance:field-dig:0", "prototype:digging-stick", residentId("yu"), "space:field-edge");
  push("instance:field-dig:1", "prototype:digging-stick", residentId("yu-brother"), "space:field-edge");
  push("instance:field-knife", "prototype:stone-knife", residentId("yu"), "space:field-edge");
  push("instance:field-basket:0", "prototype:grain-basket", residentId("yu"), "space:field-edge", 0);
  push("instance:field-grain:0", "prototype:grain", residentId("yu"), "instance:field-basket:0", 3);
  push("instance:field-basket:1", "prototype:carrying-bag", residentId("yu-brother"), "space:field-edge", 0);
  push("instance:field-fence:0", "prototype:fence-post", residentId("yu"), "space:field-edge", 0);
  push("instance:field-fence:1", "prototype:fence-post", residentId("yu"), "space:field-edge", 0);

  // Kiln: the shared kiln and the potter's working set.
  push("instance:kiln:0", "prototype:shared-kiln", residentId("elder"), "space:kiln-mouth", 0);
  push("instance:kiln-wood:0", "prototype:fuel-bundle", residentId("elder"), "space:kiln-shed", 0);
  push("instance:kiln-wood:1", "prototype:fuel-bundle", residentId("elder"), "space:kiln-shed", 0);
  push("instance:kiln-wood:2", "prototype:fuel-bundle", residentId("elder-wife"), "space:kiln-shed", 0);
  push("instance:kiln-sieve", "prototype:sieve", residentId("elder-wife"), "space:kiln-shed");
  push("instance:kiln-bowl:0", "prototype:bowl", residentId("elder"), "space:kiln-shed");
  push("instance:kiln-bowl:1", "prototype:bowl", residentId("elder-wife"), "space:kiln-shed");

  // Clay pits: the diggers' tools.
  push("instance:pit-stick:0", "prototype:digging-stick", residentId("clay-digger"), "space:pit-edge");
  push("instance:pit-stick:1", "prototype:digging-stick", residentId("clay-child"), "space:pit-edge");
  push("instance:pit-bag", "prototype:carrying-bag", residentId("clay-digger"), "space:pit-edge", 0);
  push("instance:pit-clay:0", "prototype:clay-batch", residentId("clay-digger"), "space:pit-edge", 0);
  push("instance:pit-clay:1", "prototype:clay-batch", residentId("clay-digger"), "space:pit-edge", 0);
  push("instance:pit-bowl", "prototype:small-jar", residentId("clay-child"), "space:pit-edge", 0);

  // Reed flats: cutting and weaving.
  push("instance:reed-knife:0", "prototype:stone-knife", residentId("reed-worker"), "space:reed-cut");
  push("instance:reed-knife:1", "prototype:stone-knife", residentId("lan-mother"), "space:reed-cut");
  push("instance:reed-bundle:0", "prototype:reed-bundle", residentId("reed-worker"), "space:reed-cut", 0);
  push("instance:reed-bundle:1", "prototype:reed-bundle", residentId("lan-mother"), "space:reed-cut", 0);
  push("instance:reed-bundle:2", "prototype:reed-bundle", residentId("lan"), "space:reed-cut", 0);
  push("instance:reed-rope", "prototype:rope", residentId("lan-mother"), "space:reed-cut");
  push("instance:reed-fiber", "prototype:fiber-bundle", residentId("lan-mother"), "space:reed-cut", 1);
  push("instance:reed-mat", "prototype:mat", residentId("reed-worker"), "space:reed-cut");
  push("instance:reed-bag", "prototype:carrying-bag", residentId("reed-worker"), "space:reed-cut", 0);
  push("instance:reed-fish", "prototype:fish", residentId("reed-worker"), "space:reed-cut", 1);
  push("instance:lan-jar", "prototype:small-jar", residentId("lan"), "space:reed-cut", 0);
  push("instance:lan-bowl", "prototype:bowl", residentId("lan"), "space:reed-cut");
  push("instance:lan-rope", "prototype:rope", residentId("lan"), "space:reed-cut");
  push("instance:lan-cloth", "prototype:fiber-wrap", residentId("lan"), "space:reed-cut");
  push("instance:lane-mat", "prototype:sleep-mat", residentId("lan"), "space:reed-cut");

  // Ford: travel gear and the trader's stock.
  push("instance:ford-paddle:0", "prototype:paddle", residentId("trader-elder"), "space:ford-landing");
  push("instance:ford-paddle:1", "prototype:paddle", residentId("lan"), "space:ford-landing");
  push("instance:ford-rope", "prototype:rope", residentId("trader-elder"), "space:ford-landing");
  push("instance:ford-bag", "prototype:carrying-bag", residentId("trader-elder"), "space:ford-landing", 0);
  push("instance:ford-jar:0", "prototype:small-jar", residentId("trader-elder"), "space:ford-landing", 0);
  push("instance:ford-jar:1", "prototype:small-jar", residentId("lan"), "space:ford-landing", 0);
  push("instance:ford-grain", "prototype:grain", residentId("trader-elder"), "instance:ford-bag", 2);
  push("instance:ford-mat", "prototype:mat", residentId("trader-elder"), "space:ford-landing");
  push("instance:ford-cache", "prototype:water-cache", residentId("water-carrier"), "space:ford-landing", 4);

  return out;
}

const INSTANCES: InstanceSpec[] = buildInstances();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

/** Exported so tests can assert the authored density without duplicating it. */
export const SettlementContent = {
  residents: RESIDENTS.length,
  households: new Set(RESIDENTS.map((resident) => resident.household)).size,
  places: PLACES.length,
  spaces: PLACES.reduce((sum, place) => sum + place.spaces.length, 0),
  outdoorPlaces: PLACES.filter((place) => place.spaces.some((space) => space.visible)).length,
  prototypes: PROTOTYPES.length,
  instances: INSTANCES.length,
  yields: YIELDS.length,
  residentKeys: RESIDENTS.map((resident) => resident.key),
  placeIds: PLACES.map((place) => place.id),
  spaceIds: PLACES.flatMap((place) => place.spaces.map((space) => space.id)),
  prototypeIds: PROTOTYPES.map((prototype) => prototype.id),
} as const;

export function instanceSpecs(): readonly InstanceSpec[] {
  return INSTANCES;
}

export type { ComponentData };
