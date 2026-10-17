/** Player-facing words for a recorded event (split out of server.ts). */
import { qualityLabel } from "@openlife/module-settlement-life";

export function humanizeEvent(type: string, data: Record<string, unknown> = {}): string {
  if (typeof data.summary === "string") return data.summary;
  if (type === "craft-pottery.vessel_fired") return `完成一窑陶器：${qualityLabel(data.quality)}`;
  if (type === "historical-anchors.person_entered") {
    const precision = data.datePrecision === "approximate" ? "约" : "";
    return `${String(data.displayName ?? "一位历史人物")}在${String(data.regionLabel ?? "这个世界")}${precision ? "大约" : ""}来到世间`;
  }
  if (type === "historical-era.entered") {
    return `世界进入“${String(data.label ?? "一个时代")}”的历史阶段`;
  }
  if (type === "historical-era.changed") {
    const signals = Array.isArray(data.changeSignals)
      ? data.changeSignals.slice(0, 2).join("、")
      : "";
    return `时代从“${String(data.fromLabel ?? "过去")}”走向“${String(data.toLabel ?? "新的时代")}”${signals ? `：${signals}` : ""}`;
  }
  if (type === "modern-science.discovery_made") {
    return `文明建立了新的理解：${String(data.label ?? data.id ?? "未知知识")}`;
  }
  if (type === "early-civilization.role_assumed") {
    return `开始承担“${String(data.title ?? "聚落役事")}”`;
  }
  if (type === "early-civilization.legacy_left") {
    return `留下了关于“${String(data.title ?? "一门手艺")}”的经验`;
  }
  if (type === "historical-memory.work_created") {
    return `一段经验被物化保存下来：“${String(data.title ?? "无名作品")}”`;
  }
  if (type === "historical-memory.artifact_copied") {
    return "一份承载经验的副本被制作出来";
  }
  if (type === "historical-memory.artifact_fragmented") {
    return "一件承载记忆的证据变得残缺";
  }
  if (type === "historical-memory.artifact_rediscovered") {
    return "一件失去踪迹的旧证据重新被发现";
  }
  if (type === "historical-memory.claim_formed") {
    return "后人形成了一种关于作品归属的说法";
  }
  if (type === "historical-memory.claim_supported") {
    return "新的证据让一种历史说法更加可信";
  }
  if (type === "historical-memory.artifact_lost") {
    return "一件承载记忆的证据失去了踪迹";
  }
  if (type === "historical-memory.claim_revised") {
    return "新的证据改变了后人对一段往事的理解";
  }
  if (type === "intellectual-history.idea_proposed") {
    return `提出了一种新的看法：“${String(data.title ?? "无名思想")}”`;
  }
  if (type === "intellectual-history.idea_transmitted") {
    return `“${String(data.title ?? "一种想法")}”被讲给了另一个人`;
  }
  if (type === "intellectual-history.school_founded") {
    return `围绕一种共同看法形成了“${String(data.name ?? "一个学派")}”`;
  }
  if (type === "intellectual-history.idea_branched") {
    return `旧思想出现了新的解释：“${String(data.title ?? "一个新分支")}”`;
  }
  if (type === "intellectual-history.idea_institutionalized") {
    return `“${String(data.title ?? "一种思想")}”开始影响共同体的做法`;
  }
  const labels: Record<string, string> = {
    "modern.character_created": "一个新生命来到世界",
    "modern.world_initialized": "世界开始运转",
    "settlement-locations.founded": "河岸聚落在这里扎下了根",
    "early-civilization.era_begun": "夏初的聚落开始延续",
    "early-civilization.learning_begun": "开始跟随生活学习",
    "family.married": "两个人决定共同生活",
    "family.child_born": "家族迎来了新的成员",
    "modern.character_died": "这一生走到了终点",
    "modern.generation_switched": "故事交到了下一代手中",
  };
  return labels[type] ?? type.replaceAll(".", " · ").replaceAll("_", " ");
}
