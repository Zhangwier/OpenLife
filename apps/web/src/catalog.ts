import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMapPack } from "@openlife/module-map-pack";
import type { Simulation } from "@openlife/simulation";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const LABELS: Record<string, [string, string]> = {
  "modern-world": ["人物与人生基础", "人物、时间、出生与死亡；当前聚落复用这部分人生规则。"],
  family: ["家庭与关系", "朋友、伴侣、亲子关系和家族延续。"],
  "early-civilization": ["早期聚落生活", "口传学习、聚落角色与技艺传承。"],
  "settlement-life": ["聚落生活活动", "现有的学习、相处、作品用途与家庭交棒。"],
  "craft-pottery": ["制陶手艺", "辨泥、器形、干燥与烧制，是一项可参与的活动。"],
  "practice-runtime": ["持续活动", "跨时间进行的活动和等待参与者决定的节点。"],
  "practice-autonomy": ["自主参与活动", "让自主行为参与持续活动的决策。"],
  "basic-autonomy": ["人物自主行为", "基于人物状态的基础自动决策。"],
  "epistemic-state": ["人物认知", "人物对知识与说法的接触、立场、置信度与来源。"],
  "historical-memory": ["历史留存", "作品、证据、传播与被后人记住的痕迹。"],
  "historical-era": ["时代环境", "时代阶段与当时生活背景。"],
  "historical-anchors": ["历史人物", "历史人物及其出现的时间范围。"],
  "intellectual-history": ["思想与学派", "想法的传播、分支和共同体影响。"],
  "modern-science": ["文明认知", "文明已经建立的知识及其历史推进。"],
  "science-research": ["研究活动", "以持续活动推进观察与研究。"],
  "knowledge-transmission": ["知识传授", "不同人物之间的知识交流。"],
  "map-pack": ["地图包", "装载和校验已有的地理数据。"],
  "world-geography": ["地理与连通", "区域、地点、路径和地图边界连接。"],
  "world-geosphere": ["地形与地质", "自然地表与地质条件。"],
  "world-climate": ["气候", "区域的长期气候条件。"],
  "world-weather": ["天气", "区域天气随时间变化。"],
  "world-hydrology": ["水文", "水体与水文状态。"],
  "world-vegetation": ["植被", "自然植被与资源环境。"],
  "world-species": ["物种", "物种及环境适应条件。"],
  "world-ecology": ["生态", "生物与环境的变化。"],
  "world-grazing": ["放牧环境", "放牧压力与自然环境反馈。"],
  "world-time": ["世界时间", "自然世界的时间尺度。"],
  "economy": ["经济", "已有经济原型，接入古代生活前需要时代适配。"],
  "career": ["职业原型", "既有职业规则，尚未作为聚落生产体系接入。"],
  "education": ["教育原型", "既有学习规则，尚未作为早期聚落教育体系接入。"],
  "magic-test-world": ["魔法测试世界", "用于验证不同世界观的独立测试内容。"],
  "robot-test-world": ["机器人测试世界", "用于验证不同实体和世界规则的测试内容。"],
};

/** Map packs shown on the map page, in display order. */
const MAP_PACK_LABELS: Record<string, string> = {
  xia_starter_v0_1: "初始地理包",
  xia_east_extension_v0_1: "东部扩展地理包",
  xia_south_hills_v0_1: "南丘与盐泉",
};

export async function worldCatalog(simulation: Simulation) {
  const loaded = new Map(simulation.modules.list().map(module => [module.id, module]));
  const dirs = await readdir(join(ROOT, "modules"), { withFileTypes: true });
  const modules = await Promise.all(dirs.filter(dir => dir.isDirectory()).map(async dir => {
    const pkg = JSON.parse(await readFile(join(ROOT, "modules", dir.name, "package.json"), "utf8"));
    const entry = loaded.get(dir.name);
    return { id: dir.name, label: LABELS[dir.name]?.[0] ?? dir.name, description: LABELS[dir.name]?.[1] ?? "本地内容模块。", version: entry?.version ?? pkg.version, loaded: entry?.state === "active", state: entry?.state ?? "available", requires: entry?.requires ?? [] };
  }));
  modules.sort((a, b) => Number(b.loaded) - Number(a.loaded) || a.id.localeCompare(b.id));
  const maps = Object.entries(MAP_PACK_LABELS).map(([id, label]) => {
    const result = loadMapPack(join(ROOT, "packs", id), { dryRun: true });
    return { id, label, ok: result.ok, regions: result.pack?.regions ?? [], locations: result.pack?.locations ?? [], edges: result.pack?.edges.length ?? 0, boundaryAnchors: result.pack?.boundaryAnchors.length ?? 0, eventPoints: result.pack?.eventPoints ?? [] };
  });
  return { modules, maps };
}
