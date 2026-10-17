/**
 * 盖房子：抽象建造。
 *
 * 定位文档（docs/POSITIONING.md）决定：**要建造，但不做沙盒摆放**。
 * 所以这里没有网格、没有朝向、没有装饰物位置。一间房子是：
 *
 *   备料（木料/芦苇/黏土/石料） → 动工（人天） → 落成（多一间住处）
 *
 * 三个动作都是真实的世界事务：材料从公共库存扣，人天由玩家的活动格与
 * 村民的帮忙累加，落成后村子真的多出一间能住人的屋子。这样"给一家人
 * 盖起一间屋"是村落成长的核心玩法，而不是装饰性的编辑器。
 *
 * 模块边界：本模块只读写自己命名空间下的组件，通过 settlement-locations
 * 公开的命令与投影读世界状态，不改别人的组件。
 */
import type {
  CommandIntent, ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import {
  SettlementComponents, SettlementId, yieldPoints, type SettlementPack, RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";
import { StockCommands } from "@openlife/module-settlement-locations";

export const BUILD_OWNER = "settlement-build";
export const BuildComponents = {
  /** One record per build site on the settlement. */
  site: "settlement-build.site",
  /** Finished homes, in build order. */
  homes: "settlement-build.homes",
} as const;

export const BuildCommands = {
  /** Pick a blueprint and stake out a site (no materials spent yet). */
  plan: "settlement-build.plan",
  /** Carry one load of a material to the site. */
  deliver: "settlement-build.deliver",
  /** Spend a day's labour on the site. */
  work: "settlement-build.work",
  /** Tear down an unfinished site and recover what was delivered. */
  abandon: "settlement-build.abandon",
} as const;

export const BuildProjections = {
  build: "settlement-build.board",
} as const;

export const BuildRejection = {
  NoSuchBlueprint: "E_BUILD_NO_BLUEPRINT",
  NoSite: "E_BUILD_NO_SITE",
  AlreadyBuilt: "E_BUILD_ALREADY_BUILT",
  MissingMaterial: "E_BUILD_MISSING_MATERIAL",
  NoLabour: "E_BUILD_NO_LABOUR",
  Busy: "E_BUILD_BUSY",
} as const;

/**
 * What can be built.
 *
 * A blueprint is materials + labour in, one home out. Kept as data so a content
 * pack or a future config can add kinds without touching this file.
 *
 * The materials are deliberately limited to what the village can actually
 * gather today -- clay, reed, fuel -- because a blueprint that needs straw or
 * timber would be undeliverable: those have no yield point in the pack, so no
 * amount of play could ever satisfy it. Adding a new material means adding a
 * place that produces it first.
 */
export interface BlueprintSpec {
  id: string;
  name: string;
  /** What it takes, by resource id. */
  materials: Record<string, number>;
  /** Days of labour needed in total (player + helpers). */
  labourDays: number;
  /** Homes added on completion (0 for non-housing projects). */
  homes: number;
  /** Flavour shown when it is done. */
  doneLine: string;
  /** Why a village would want it. */
  hint: string;
  /** Only offered while this is true of the village. */
  requires?: { homesBelow?: number; populationAtLeast?: number };
}

export const BLUEPRINTS: BlueprintSpec[] = [
  {
    id: "blueprint:shed",
    name: "一间土屋",
    materials: { "resource:clay": 6, "resource:reed": 4 },
    labourDays: 3,
    homes: 1,
    doneLine: "墙夯起来了，屋顶压上了芦苇。晚上能住人了。",
    hint: "最省的一间屋：黏土夯墙，芦苇铺顶。",
    requires: { homesBelow: 8 },
  },
  {
    id: "blueprint:strong-house",
    name: "一间加固土屋",
    materials: { "resource:clay": 10, "resource:reed": 8, "resource:fuel": 2 },
    labourDays: 5,
    homes: 1,
    doneLine: "墙夯了两遍，屋顶压得厚。这屋子能撑几十年，冬天也暖。",
    hint: "费料但结实，住得久",
    requires: { homesBelow: 14 },
  },
  {
    id: "blueprint:kiln-shed",
    name: "一座陶窑棚",
    materials: { "resource:clay": 8, "resource:reed": 3 },
    labourDays: 4,
    homes: 0,
    doneLine: "棚子搭好了，雨天也能开窑。",
    hint: "给陶窑搭个棚，落雨天也能开窑。",
    requires: { populationAtLeast: 8 },
  },
];

export interface BuildSite {
  blueprintId: string;
  /** Materials already carried in, by resource id. */
  delivered: Record<string, number>;
  /** Labour days already spent. */
  labour: number;
  /** World day the site was staked out. */
  startedAt: number;
  /** Who staked it out. */
  by: string;
  /** Pending helper contributions this transaction (kept for the event log). */
  lastWorkedAt: number;
}

export interface HomesState {
  count: number;
  /** Blueprint ids in completion order. */
  built: string[];
}

function blueprintOf(id: string): BlueprintSpec | undefined {
  return BLUEPRINTS.find((b) => b.id === id);
}

function homesOf(world: WorldView): HomesState {
  const raw = world.getComponent(SettlementId, BuildComponents.homes) as unknown as HomesState | undefined;
  return raw && typeof raw === "object"
    ? { count: Number(raw.count ?? 0), built: Array.isArray(raw.built) ? raw.built.map(String) : [] }
    : { count: 0, built: [] };
}

function siteOf(world: WorldView): BuildSite | undefined {
  const raw = world.getComponent(SettlementId, BuildComponents.site) as unknown as BuildSite | undefined;
  return raw && typeof raw === "object" && raw.blueprintId ? raw : undefined;
}

/** The village's population: everyone alive with a resident component. */
function populationOf(world: WorldView): number {
  return world.listEntities({ kind: "modern.character" }).filter((e) =>
    e.archivedAt === undefined &&
    Boolean(e.components[SettlementComponents.resident]) &&
    e.components["modern.vitals"]?.alive !== false,
  ).length;
}

function stockOf(world: WorldView, resourceId: string): number {
  return yieldPoints(world).filter((y) => y.resourceId === resourceId).reduce((n, y) => n + y.stock, 0);
}

/**
 * The kernel reads a constraint rejection as `{ ok: false, code, message }`.
 * Returning `{ errors: [...] }` (the shape a dispatch result has) silently lost
 * the message and the player saw "command rejected".
 */
function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

/** Everything still missing for a site, by resource. */
function shortfall(world: WorldView, site: BuildSite, blueprint: BlueprintSpec): Record<string, number> {
  const missing: Record<string, number> = {};
  for (const [resourceId, need] of Object.entries(blueprint.materials)) {
    const have = site.delivered[resourceId] ?? 0;
    if (have < need) missing[resourceId] = need - have;
  }
  return missing;
}

/** Which blueprints this village can currently offer. */
function offeredBlueprints(world: WorldView): BlueprintSpec[] {
  const homes = homesOf(world).count;
  const population = populationOf(world);
  return BLUEPRINTS.filter((b) => {
    const req = b.requires;
    if (req?.homesBelow !== undefined && homes >= req.homesBelow) return false;
    if (req?.populationAtLeast !== undefined && population < req.populationAtLeast) return false;
    return true;
  });
}

const LABEL: Record<string, string> = RIVER_TERRACE_PACK.resourceLabels;

export const settlementBuildModule: OpenLifeModule = {
  manifest: {
    id: BUILD_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system",
    name: "盖房子",
    provides: ["settlement.housing"],
    requires: ["life.settlement"],
    optional: [],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: BuildComponents.site, persist: true, description: "the village's current build site" });
    ctx.registerComponent({ id: BuildComponents.homes, persist: true, description: "finished homes and what was built" });
    for (const type of Object.values(BuildCommands)) {
      ctx.registerCommand({ type, description: "Village building action." });
    }

    // ---- plan -------------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${BuildCommands.plan}.allowed`, commandType: BuildCommands.plan,
      evaluate: (c): ConstraintOutcome => {
        const world = c.world;
        if (!world.getEntity(SettlementId)) return refuse(BuildRejection.NoSite, "还没有村子，谈不上盖房。");
        const blueprint = blueprintOf(String(c.command.payload.blueprintId ?? ""));
        if (!blueprint) return refuse(BuildRejection.NoSuchBlueprint, "没有这种盖法。");
        if (!offeredBlueprints(world).some((b) => b.id === blueprint.id)) {
          return refuse(BuildRejection.AlreadyBuilt, `${blueprint.name}现在用不上了。`);
        }
        if (siteOf(world)) return refuse(BuildRejection.Busy, "已经有一处地在动工了，先把它盖完。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${BuildCommands.plan}.resolve`, commandType: BuildCommands.plan,
      resolve: (c): Effect[] => {
        const blueprint = blueprintOf(String(c.command.payload.blueprintId))!;
        const site: BuildSite = {
          blueprintId: blueprint.id,
          delivered: {},
          labour: 0,
          startedAt: c.world.tick,
          by: String(c.command.actorId ?? ""),
          lastWorkedAt: c.world.tick,
        };
        return [
          {
            kind: "setComponent", entityId: SettlementId, component: BuildComponents.site,
            value: site as unknown as Record<string, never>,
            reason: `staked out ${blueprint.name}`,
          },
          {
            kind: "emitEvent", eventType: "settlement-build.planned",
            actorId: c.command.actorId,
            data: { blueprintId: blueprint.id, name: blueprint.name, labourDays: blueprint.labourDays },
            historicalSignificance: 0.02,
          },
        ];
      },
    });

    // ---- deliver ----------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${BuildCommands.deliver}.allowed`, commandType: BuildCommands.deliver,
      evaluate: (c): ConstraintOutcome => {
        const world = c.world;
        const site = siteOf(world);
        if (!site) return refuse(BuildRejection.NoSite, "还没有动工的地。");
        const blueprint = blueprintOf(site.blueprintId)!;
        const resourceId = String(c.command.payload.resourceId ?? "");
        if (!(blueprint.materials[resourceId] > 0)) return refuse(BuildRejection.MissingMaterial, "这种料用不上。");
        const missing = shortfall(world, site, blueprint);
        if (!(missing[resourceId] > 0)) return refuse(BuildRejection.AlreadyBuilt, `这一项已经备够了。`);
        if (stockOf(world, resourceId) <= 0) return refuse(BuildRejection.MissingMaterial, `村里没有${LABEL[resourceId] ?? "这种料"}了。`);
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${BuildCommands.deliver}.resolve`, commandType: BuildCommands.deliver,
      resolve: (c): Effect[] => {
        const site = siteOf(c.world)!;
        const blueprint = blueprintOf(site.blueprintId)!;
        const resourceId = String(c.command.payload.resourceId);
        const amount = Math.max(1, Math.min(
          Number(c.command.payload.amount ?? 1),
          (blueprint.materials[resourceId] ?? 0) - (site.delivered[resourceId] ?? 0),
          stockOf(c.world, resourceId),
        ));
        // Materials are taken by settlement-locations' own stock command before
        // this one runs (see deliverMaterial() below). Here we only record what
        // arrived, so INV-007 holds and the ledger has one writer.
        const effects: Effect[] = [{
          kind: "setComponent", entityId: SettlementId, component: BuildComponents.site,
          value: {
            ...site,
            delivered: { ...site.delivered, [resourceId]: (site.delivered[resourceId] ?? 0) + amount },
          } as unknown as Record<string, never>,
          reason: `delivered ${amount} ${resourceId}`,
        }, {
          kind: "emitEvent", eventType: "settlement-build.delivered",
          actorId: c.command.actorId,
          data: { blueprintId: blueprint.id, resourceId, amount },
          historicalSignificance: 0,
        }];
        return effects;
      },
    });

    // ---- work -------------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${BuildCommands.work}.allowed`, commandType: BuildCommands.work,
      evaluate: (c): ConstraintOutcome => {
        const world = c.world;
        const site = siteOf(world);
        if (!site) return refuse(BuildRejection.NoSite, "还没有动工的地。");
        const blueprint = blueprintOf(site.blueprintId)!;
        const missing = shortfall(world, site, blueprint);
        // You can lay the first courses with what you have, but not finish
        // without the rest -- so work is allowed, completion is not.
        if (Object.keys(missing).length > 0 && site.labour >= blueprint.labourDays - 1) {
          const need = Object.entries(missing).map(([r, n]) => `${LABEL[r] ?? r} ${n}`).join("、");
          return refuse(BuildRejection.MissingMaterial, `料还不够：${need}。`);
        }
        if (site.labour >= blueprint.labourDays) return refuse(BuildRejection.AlreadyBuilt, "这处已经盖好了。");
        if (site.lastWorkedAt === world.tick) return refuse(BuildRejection.Busy, "今天已经在这处干过了。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${BuildCommands.work}.resolve`, commandType: BuildCommands.work,
      resolve: (c): Effect[] => {
        const site = siteOf(c.world)!;
        const blueprint = blueprintOf(site.blueprintId)!;
        // A helper with hands shortens the work; the settlement's own labour
        // pool decides how many are free, which keeps this honest.
        const helpers = Math.max(0, Math.min(2, Number(c.command.payload.helpers ?? 0)));
        const labour = site.labour + 1 + helpers;
        const done = labour >= blueprint.labourDays;
        const homes = homesOf(c.world);
        const effects: Effect[] = [{
          kind: "setComponent", entityId: SettlementId, component: BuildComponents.site,
          value: { ...site, labour, lastWorkedAt: c.world.tick } as unknown as Record<string, never>,
          reason: `worked on ${blueprint.id} (+${1 + helpers} day)`,
        }];
        if (done) {
          effects.push(
            {
              kind: "setComponent", entityId: SettlementId, component: BuildComponents.homes,
              value: { count: homes.count + blueprint.homes, built: [...homes.built, blueprint.id] } as unknown as Record<string, never>,
              reason: `${blueprint.id} finished`,
            },
            {
              kind: "setComponent", entityId: SettlementId, component: BuildComponents.site,
              value: null as unknown as Record<string, never>,
              reason: "site cleared after completion",
            },
            {
              kind: "emitEvent", eventType: "settlement-build.finished",
              actorId: c.command.actorId,
              data: {
                blueprintId: blueprint.id, name: blueprint.name, homes: homes.count + blueprint.homes,
                line: blueprint.doneLine,
              },
              historicalSignificance: 0.12,
            },
          );
        }
        return effects;
      },
    });

    // ---- abandon ----------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${BuildCommands.abandon}.allowed`, commandType: BuildCommands.abandon,
      evaluate: (c): ConstraintOutcome =>
        siteOf(c.world) ? { ok: true } : refuse(BuildRejection.NoSite, "还没有动工的地。"),
    });
    ctx.registerResolutionRule({
      id: `${BuildCommands.abandon}.resolve`, commandType: BuildCommands.abandon,
      resolve: (c): Effect[] => {
        const site = siteOf(c.world)!;
        const effects: Effect[] = [{
          kind: "setComponent", entityId: SettlementId, component: BuildComponents.site,
          value: null as unknown as Record<string, never>,
          reason: "site abandoned",
        }];
        // Delivered materials go back through settlement-locations' stock
        // command, for the same ownership reason as delivery.
        for (const [resourceId, amount] of Object.entries(site.delivered)) {
          if (!(amount > 0)) continue;
          effects.push({
            kind: "emitEvent", eventType: "settlement-build.refund_pending",
            actorId: c.command.actorId,
            data: { resourceId, amount },
            historicalSignificance: 0,
          });
        }
        effects.push({
          kind: "emitEvent", eventType: "settlement-build.abandoned",
          actorId: c.command.actorId,
          data: { blueprintId: site.blueprintId, labour: site.labour },
          historicalSignificance: 0,
        });
        return effects;
      },
    });

    // ---- projection -------------------------------------------------------
    ctx.registerProjection({
      id: BuildProjections.build,
      description: "What is standing, what is being built, and what could be built next.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const site = siteOf(world);
        const homes = homesOf(world);
        const offered = offeredBlueprints(world).map((b) => ({
          id: b.id, name: b.name, hint: b.hint,
          materials: b.materials, labourDays: b.labourDays, homes: b.homes,
        }));
        if (!site) {
          return {
            homes: homes.count, built: homes.built,
            site: null, blueprints: offered,
            line: homes.count ? `村里有 ${homes.count} 间能住人的屋子。` : "还没有一间正式盖起来的屋子。",
          };
        }
        const blueprint = blueprintOf(site.blueprintId)!;
        const missing = shortfall(world, site, blueprint);
        const missingText = Object.entries(missing)
          .map(([r, n]) => `${LABEL[r] ?? r} ${site.delivered[r] ?? 0}/${blueprint.materials[r]}`)
          .join("、");
        return {
          homes: homes.count,
          built: homes.built,
          site: {
            blueprintId: blueprint.id,
            name: blueprint.name,
            labour: site.labour,
            labourDays: blueprint.labourDays,
            delivered: site.delivered,
            missing,
            done: site.labour >= blueprint.labourDays,
          },
          blueprints: offered,
          line: Object.keys(missing).length
            ? `${blueprint.name}：还差 ${missingText}；人工 ${site.labour}/${blueprint.labourDays} 天。`
            : `${blueprint.name}：料齐了，人工 ${site.labour}/${blueprint.labourDays} 天。`,
        };
      },
    });
  },
};

/** Read-only helpers for other modules (goals, day summary). */
export function homeCount(world: WorldView): number {
  return homesOf(world).count;
}

export function currentSite(world: WorldView): BuildSite | undefined {
  return siteOf(world);
}

export function blueprintById(id: string): BlueprintSpec | undefined {
  return blueprintOf(id);
}

/**
 * Carry one load of material to the site.
 *
 * Two commands, in order, because ownership is split: settlement-locations owns
 * the stock (INV-007), this module owns the site. Doing it in one shot would
 * mean writing another module's component, which the kernel refuses -- correctly.
 *
 * Returns the stock result so the caller can tell the player exactly why a
 * delivery did not happen.
 */
export function deliverMaterial(
  sim: { dispatch: (intent: Record<string, unknown>) => { ok: boolean; errors?: Array<{ message: string }> } },
  actorId: string,
  resourceId: string,
  amount = 1,
): { ok: boolean; message?: string } {
  const take = sim.dispatch({
    type: StockCommands.adjust, actorId, source: "player",
    payload: { resourceId, delta: -amount, reason: "carried to the build site" },
  });
  if (!take.ok) return { ok: false, message: take.errors?.[0]?.message ?? "料没有取出来。" };
  const record = sim.dispatch({
    type: BuildCommands.deliver, actorId, source: "player",
    payload: { resourceId, amount },
  });
  if (!record.ok) return { ok: false, message: record.errors?.[0]?.message ?? "料没有记上。" };
  return { ok: true };
}

void (0 as unknown as SettlementPack);
void (0 as unknown as CommandIntent);
