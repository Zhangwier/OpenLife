/**
 * 把地图包真正装进网页世界。
 *
 * 在此之前，网页世界一份 `world-geography.location` 都没有：地图包只在图鉴里被
 * 读出来列成清单（`apps/web/src/catalog.ts`），远行的目的地投影读的是「从聚落
 * 所在 place 沿 adjacent_to 走一跳」，而聚落的 place 是 `place:yard` 这一套 id，
 * 与地图包的 `xia_west_marsh_v0_1:location:W0101` 从来不在同一批关系里——于是
 * 远行永远显示「附近没有可去的地方。」
 *
 * 这里补上缺的那一段，只做三件事：
 *   1. 装一个地图包（默认西来河与大泽：中文地名，河湾，和河岸台地同一副水土）；
 *   2. 给村子自己在地图上开一个地点（`openlife:village:home`），放进河湾那片
 *      区域，所以村子在世界图上有个位置，而不是悬空；
 *   3. 把村子和渡口连起来——一条真实的路，距离取自地图包自己写的边。
 *
 * 全部走命令（`registerMapPack` 内部就是逐条 dispatch），所以 INV-007 不被绕开：
 * 地理事实由 world-geography 自己写。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Simulation } from "@openlife/simulation";
import { loadMapPack, registerMapPack } from "@openlife/module-map-pack";
import { SettlementId } from "@openlife/module-settlement-locations";

/** 村子的地点 id：远行的 `from` / 目的地的对端。 */
export const HOME_LOCATION = "openlife:village:home";

/**
 * 默认装哪个地图包。
 *
 * 选西来河与大泽而不是 40 个地点的初始包，理由是名字：初始包是英文地名
 * （Central River Bank），玩家在河岸台地上看见「Central River Bank」会出戏。
 * 西来河与大泽是中文地名，而且同样是河湾水土——从这里走出去最像同一片地方。
 */
export const HOME_PACK = "xia_west_marsh_v0_1";

/** 村子长在哪个地点旁边：旧渡口。渡口边才长得出村子。 */
const HOME_NEIGHBOUR = "W0104";
/** 村子钉进哪片区域：西来河湾。 */
const HOME_REGION = "W01";

export interface GeographyInstall {
  ok: boolean;
  packId: string;
  locations: number;
  edges: number;
  issues: string[];
}

/**
 * 装地图并把村子接上去。已有地点就跳过——读档、重开、热重载都不该重复建。
 *
 * `packsRoot` 是仓库里的 `packs/`；打包运行时也指到同一处。
 */
export function installGeography(sim: Simulation, packsRoot: string): GeographyInstall {
  const directory = join(packsRoot, HOME_PACK);
  const empty: GeographyInstall = { ok: false, packId: HOME_PACK, locations: 0, edges: 0, issues: [] };
  if (!existsSync(directory)) {
    return { ...empty, issues: [`地图包目录不存在：${directory}`] };
  }
  const loaded = loadMapPack(directory, { dryRun: true });
  if (!loaded.ok || !loaded.pack) {
    return { ...empty, issues: loaded.validation.issues.map((i) => `${i.code}: ${i.message}`) };
  }
  const pack = loaded.pack;
  const issues: string[] = [];
  const world = () => sim.worldView();

  // 1. 地图本身。装过就跳过：包内每个 id 都带包名前缀，查第一个地点即可。
  const packLocation = (localId: string) => `${pack.manifest.id}:location:${localId}`;
  const packRegion = (localId: string) => `${pack.manifest.id}:region:${localId}`;
  if (!world().hasEntity(packLocation(pack.locations[0]?.id ?? "W0101"))) {
    const registered = registerMapPack(sim, pack);
    for (const command of registered.commands) {
      if (!command.ok) issues.push(`${command.type}: ${command.error ?? ""}`);
    }
  }

  // 2. 村子自己的地点。
  if (!world().hasEntity(HOME_LOCATION)) {
    const created = sim.dispatch({
      type: "world-geography.create_location",
      payload: {
        entityId: HOME_LOCATION,
        regionEntityId: packRegion(HOME_REGION),
        name: "河岸台地",
        locationType: "river_terrace",
        packId: pack.manifest.id,
      },
      source: "system",
    });
    if (!created.ok) issues.push(`create_location: ${created.errors.map((e) => e.message).join("; ")}`);
  }

  // 3. 一条把村子连到渡口的路。距离取地图包自己写的那条边，不编一个数字：
  //    村子就长在渡口边上，这一段按「渡口那一头最短的一条边」算。
  const near = pack.edges
    .filter((e) => e.from === HOME_NEIGHBOUR || e.to === HOME_NEIGHBOUR)
    .sort((a, b) => a.distance - b.distance)[0];
  if (!near) {
    issues.push(`地图包里 ${HOME_NEIGHBOUR} 没有任何边，村子暂时孤立`);
    return { ok: false, packId: pack.manifest.id, locations: pack.locations.length, edges: pack.edges.length, issues };
  }
  const connected = sim.dispatch({
    type: "world-geography.connect_locations",
    payload: {
      fromLocationId: HOME_LOCATION,
      toLocationId: packLocation(HOME_NEIGHBOUR),
      distanceKm: near.distance,
      terrainCost: near.terrainCost,
      packId: pack.manifest.id,
    },
    source: "system",
  });
  // 已经连过（第二次进同一个世界）不是错误。
  if (!connected.ok && !connected.errors.some((e) => e.code === "E_GEOGRAPHY_CONNECTED")) {
    issues.push(`connect_locations: ${connected.errors.map((e) => e.message).join("; ")}`);
  }

  // 4. 把聚落自己钉到这个地点上。远行的目的地投影与"从这里走得到哪"都靠这条
  //    `located_at` 关系判断村子站在哪里；不钉的话村子在地图上没有位置。
  const placed = sim.dispatch({
    type: "world-geography.place_entity",
    actorId: SettlementId,
    targetId: HOME_LOCATION,
    source: "system",
  });
  if (!placed.ok) issues.push(`place_entity: ${placed.errors.map((e) => e.message).join("; ")}`);

  return {
    ok: issues.length === 0,
    packId: pack.manifest.id,
    locations: pack.locations.length,
    edges: pack.edges.length,
    issues,
  };
}

/**
 * 村子脚下这条边有多远、多难走。远行模块据此算天数。
 *
 * 返回 null 表示地图没装（或村子孤立）——那时目的地投影本来就是空的，调用方
 * 照「没有路」处理即可，不要伪造一个距离。
 */
export function homeEdge(sim: Simulation, to: string): { distanceKm: number; terrainCost: number } | null {
  const relations = sim.worldView().listRelations({ type: "world-geography.adjacent_to" });
  const found = relations.find((r) =>
    (r.from === HOME_LOCATION && r.to === to) || (r.from === to && r.to === HOME_LOCATION));
  if (!found) return null;
  const connection = found.components?.["world-geography.connection"] ?? {};
  return {
    distanceKm: Number(connection.distanceKm ?? 1),
    terrainCost: Number(connection.terrainCost ?? 1),
  };
}
