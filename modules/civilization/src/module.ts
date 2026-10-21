/**
 * 文明层模块：把邻村从「人口数字」变成「会自己发明的政体」。
 *
 * 这是开发文档 A3 的核心。在此之前，邻村只是 village-chronicle 里的一个
 * 计数，不会自己发明，工业时代靠一个「社群规模」门槛凑出来。这个模块让
 * 那张「聚落网络」真的演出来：
 *
 *  - 政体实体 `polity:<id>`：位置、人口、聚合科技、聚合制度、对外关系
 *  - 每年：各政体按聚合模式自己长，再沿联系网络把发明从 A 传到 B
 *  - 工业门槛由「网络里掌握它的人数」决定，而不是本村人口
 *  - 玩家村子是网络中的一个节点：精细层用个人模式，粗略层用聚合模式
 *
 * 关掉这个模块，村史退回现在的样子（邻村只是数字）。
 */
import type {
  ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import {
  civilizationYear, contactNetwork,
  type Diffusion, type Polity,
} from "./network.ts";
import { aggregateNeed, meetsIndustrialGate, networkHolders, polityFromSettlement, seedPolities } from "./aggregate.ts";

export const CIVILIZATION_OWNER = "civilization";
export const CivilizationComponents = {
  network: "civilization.network",
} as const;

export const CivilizationCommands = {
  found: "civilization.found",
  year: "civilization.year",
} as const;

export const CivilizationProjections = {
  network: "civilization.network",
  status: "civilization.status",
} as const;

export const CivilizationRejection = {
  AlreadyFound: "E_CIVILIZATION_ALREADY_FOUND",
  NoNetwork: "E_CIVILIZATION_NO_NETWORK",
} as const;

export const CIVILIZATION_ENTITY = "civilization:network";

interface NetworkState {
  year: number;
  polities: Polity[];
  diffusions: Diffusion[];
  log: Array<{ year: number; text: string }>;
}

function emptyNetwork(): NetworkState {
  return { year: 0, polities: [], diffusions: [], log: [] };
}

function readNetwork(world: WorldView): NetworkState | undefined {
  return world.getComponent(CIVILIZATION_ENTITY, CivilizationComponents.network) as unknown as NetworkState | undefined;
}

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

/** The inventions the tech module uses, in its own data format. */
interface InventionLike {
  id: string;
  name?: string;
  answers?: string[];
  difficulty?: number;
  era?: string;
}

/** The institutions the polity module uses. */
interface InstitutionLike {
  id: string;
  label?: string;
}

export const civilizationModule: OpenLifeModule = {
  manifest: {
    id: CIVILIZATION_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system",
    name: "文明层",
    provides: ["world.polities"],
    requires: [],
    optional: ["tech.invention", "polity.institutions"],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: CivilizationComponents.network, persist: true, description: "the polity network: who is where, who knows what, and how inventions travel" });
    for (const type of Object.values(CivilizationCommands)) ctx.registerCommand({ type, description: "Civilization action." });

    const save = (world: WorldView, state: NetworkState, why: string): Effect =>
      world.getEntity(CIVILIZATION_ENTITY)
        ? {
            kind: "setComponent", entityId: CIVILIZATION_ENTITY, component: CivilizationComponents.network,
            value: state as unknown as Record<string, never>, reason: why,
          }
        : {
            kind: "spawnEntity", localId: "network", id: CIVILIZATION_ENTITY, entityKind: "civilization.network",
            components: { [CivilizationComponents.network]: state as unknown as Record<string, never> },
          };

    // ---- found: lay out the network from the village and its neighbours ----
    ctx.registerConstraintRule({
      id: `${CivilizationCommands.found}.allowed`, commandType: CivilizationCommands.found,
      evaluate: (c): ConstraintOutcome =>
        readNetwork(c.world) ? refuse(CivilizationRejection.AlreadyFound, "这张网已经铺开了。") : { ok: true },
    });
    ctx.registerResolutionRule({
      id: `${CivilizationCommands.found}.resolve`, commandType: CivilizationCommands.found,
      resolve: (c): Effect[] => {
        // The home village sits at 0,0; its neighbours are scattered nearby.
        // Positions are read from the payload when given, else scattered
        // deterministically so the same seed always lays the same map.
        const homePop = Number(c.command.payload.homePopulation ?? 12);
        const neighbours = ((c.command.payload.neighbours ?? []) as Array<Record<string, unknown>>)
          .map((n, i) => ({
            name: String(n.name ?? `邻村${i + 1}`),
            x: Number(n.x ?? (i % 3 - 1) * 4 + 2),
            y: Number(n.y ?? Math.floor(i / 3) * 4 + 2),
            population: Number(n.population ?? 8 + i * 3),
          }));
        const polities = seedPolities(
          { name: String(c.command.payload.homeName ?? "河岸台地"), x: 0, y: 0, population: homePop },
          neighbours,
          (purpose, ...parts) => c.rng.keyed("civilization", purpose, ...parts),
        );
        // An optional head start: inventions the home village already knows,
        // keyed by invention id -> fraction. Lets a test (or a later migration)
        // seed the network without faking a command.
        const headStart = (c.command.payload.homeKnown ?? {}) as Record<string, number>;
        const home = polities.find((p) => p.id === "polity:home");
        if (home) home.known = { ...home.known, ...headStart };
        const state: NetworkState = { ...emptyNetwork(), polities };
        return [
          save(c.world, state, "laid out the polity network"),
          {
            kind: "emitEvent", eventType: "civilization.network_laid", actorId: undefined,
            data: { polities: polities.length },
            historicalSignificance: 0.1,
          },
        ];
      },
    });

    // ---- year: every polity grows, then inventions travel the network -----
    ctx.registerConstraintRule({
      id: `${CivilizationCommands.year}.allowed`, commandType: CivilizationCommands.year,
      evaluate: (c): ConstraintOutcome =>
        readNetwork(c.world) ? { ok: true } : refuse(CivilizationRejection.NoNetwork, "先铺这张网。"),
    });
    ctx.registerResolutionRule({
      id: `${CivilizationCommands.year}.resolve`, commandType: CivilizationCommands.year,
      resolve: (c): Effect[] => {
        const state = readNetwork(c.world)!;
        const year = state.year + 1;
        const inventions = ((c.command.payload.inventions ?? []) as InventionLike[])
          .map((i) => ({ id: i.id, answers: i.answers ?? [], difficulty: Number(i.difficulty ?? 25) }));

        // A4: read the deposit map if world-deposits is installed. A polity
        // without a required deposit (and no trade route) cannot invent it.
        const deposits = c.world.getComponent("world-deposits:map", "world-deposits.map") as
          { deposits?: Array<{ tag: string; x: number; y: number }> } | undefined;
        const hasDeposit = (tag: string, x: number, y: number, radius = 3): boolean =>
          (deposits?.deposits ?? []).some((d) =>
            d.tag === tag && Math.abs(d.x - x) + Math.abs(d.y - y) <= radius,
          );

        const needFor = (polityId: string, inventionId: string): number => {
          const polity = state.polities.find((p) => p.id === polityId)!;
          const base = aggregateNeed(polity, inventionId, (id) => inventions.find((i) => i.id === id)?.answers ?? []);
          // A4: a deposit-gated invention needs the deposit nearby, or a trade route.
          if (!materialOk(polityId, inventionId)) return 0;
          return base;
        };

        // A4 的门槛同时要用在「自己发明」和「从邻村传来」两条路上：只挡前者，
        // 炼铜会顺着联系网络走进一个没有铜的村子。
        // 贸易路线还没有在这层建模（`world-deposits` 的 route 来自投影参数，
        // 不是持久状态），所以这里只认「附近有矿」——等路线进了状态，再把
        // 路线判断加在这一处，两条路径同时生效。
        const materialOk = (polityId: string, inventionId: string): boolean => {
          const polity = state.polities.find((p) => p.id === polityId);
          if (!polity) return true;
          const material = inventions.find((i) => i.id === inventionId)
            ?.answers?.find((a) => a.startsWith("deposit:"));
          if (!material) return true;
          return hasDeposit(material, polity.x, polity.y);
        };

        const result = civilizationYear(
          state.polities,
          year,
          inventions,
          needFor,
          (id) => inventions.find((i) => i.id === id)?.answers ?? [],
          c.rng,
          (purpose, ...parts) => c.rng.keyed("civilization", purpose, ...parts),
          materialOk,
        );

        const next: NetworkState = {
          year,
          polities: result.polities,
          diffusions: [...state.diffusions, ...result.diffusions].slice(-200),
          log: [
            ...state.log,
            { year, text: describeYear(result) },
          ].slice(-50),
        };

        const effects: Effect[] = [save(c.world, next, `civilization year ${year}`)];
        for (const event of result.events) {
          effects.push({
            kind: "emitEvent",
            eventType: event.type,
            // A polity is not an entity: passing its id as actorId made the kernel
            // reject the event with E_UNKNOWN_ENTITY. The id stays in the data.
            data: event.data,
            historicalSignificance: event.type === "civilization.invented" ? 0.2 : 0.05,
          });
        }
        return effects;
      },
    });

    // ---- projections ------------------------------------------------------
    ctx.registerProjection({
      id: CivilizationProjections.network,
      description: "The polity network: who is where, who knows what, and how inventions travel.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = readNetwork(world);
        if (!state) return { year: 0, polities: [], contacts: [] };
        return {
          year: state.year,
          polities: state.polities.map((p) => ({
            id: p.id, name: p.name, x: p.x, y: p.y,
            population: p.population,
            knownCount: Object.keys(p.known).filter((k) => (p.known[k] ?? 0) > 0).length,
            institutions: p.institutions,
            tributaryOf: p.tributaryOf ?? null,
          })) as unknown as JsonValue,
          contacts: contactNetwork(state.polities).map((c) => ({
            a: c.a, b: c.b, strength: c.strength, via: c.via,
          })) as unknown as JsonValue,
          recentDiffusions: state.diffusions.slice(-10).map((d) => ({
            inventionId: d.inventionId, from: d.from, to: d.to, year: d.year,
          })) as unknown as JsonValue,
        };
      },
    });

    ctx.registerProjection({
      id: CivilizationProjections.status,
      description: "One readable line about the world's technology level.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = readNetwork(world);
        if (!state) return { era: "尚未铺开", holders: 0, line: "这张网还没铺开。" };
        // The era is decided by the network, not by one village's headcount.
        const bronzeHolders = networkHolders(state.polities, "invention:bronze");
        const ironHolders = networkHolders(state.polities, "invention:iron-smelting");
        const era = meetsIndustrialGate(state.polities, "invention:iron-smelting", 2000)
          ? "铁器"
          : bronzeHolders > 500 ? "青铜" : "新石器";
        return {
          era,
          holders: ironHolders,
          line: `这张网里有 ${state.polities.length} 个聚落，共 ${state.polities.reduce((n, p) => n + p.population, 0)} 口人。`,
        };
      },
    });
  },
};

/** One readable line about what happened this year. */
function describeYear(result: ReturnType<typeof civilizationYear>): string {
  const invented = result.events.filter((e) => e.type === "civilization.invented").length;
  const diffused = result.diffusions.length;
  const lost = result.events.filter((e) => e.type === "civilization.lost").length;
  const parts: string[] = [];
  if (invented) parts.push(`新会了 ${invented} 样`);
  if (diffused) parts.push(`传开 ${diffused} 样`);
  if (lost) parts.push(`失传 ${lost} 样`);
  return parts.length ? parts.join("，") : "这一年平静过去";
}

export { polityFromSettlement, contactNetwork, aggregateNeed, networkHolders, meetsIndustrialGate };
export type { Polity, Contact, Diffusion };
