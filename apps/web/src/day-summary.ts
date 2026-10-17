/**
 * 今天发生了什么：一条给玩家看的小结。
 *
 * 为什么需要它：季节大结算有味道，但玩家在中间几十天里不知道自己在干什么。
 * 星露谷的教训是「每天都要看到自己变强了一点」。这里把当天真实发生的
 * 世界事件翻成三句话，不新增任何状态。
 *
 * 认知规则（硬约束）：小结只说玩家**看得见或听得到**的事。
 *  - 陌生人的名字不能出现，用「有人」「村东那家」代替。
 *  - 没打听过的生日、病情，不能在这里泄露。
 *  这条由 tests/unit/day-summary.test.ts 守着。
 *
 * 放在投影层（apps/web/src/），不进 server.ts —— 后者已冻结在行数上限。
 */
import type { WorldView } from "@openlife/world-model";
import {
  acquaintanceOf, homestead, RESOURCE_LABELS, residentId, yieldPoints,
} from "@openlife/module-settlement-locations";

export interface DaySummary {
  /** 你做了什么，最多三条。 */
  yours: string[];
  /** 村里发生了什么，只说看得见或听说的。 */
  village: string[];
  /** 谁对你的看法变了；不认识的人用描述代替名字。 */
  opinions: string[];
  /** 离这一季的目标还差多少，没有目标时为空。 */
  towardGoal: string;
  /** 一句话版本，供窄屏或 toast 用。 */
  line: string;
}

/** 把世界事件翻成一句人话；认不出来的类型直接跳过。 */
function describe(type: string, data: Record<string, unknown>, world: WorldView, me: string): string {
  const who = String(data.targetId ?? data.actorId ?? "");
  const name = who ? personName(world, me, who) : "";
  switch (type) {
    case "settlement-locations.gathered": {
      const label = RESOURCE_LABELS[String(data.resourceId ?? "")] ?? "东西";
      return `你收了${label}`;
    }
    case "settlement-locations.crafted": {
      const label = String(data.name ?? RESOURCE_LABELS[String(data.resourceId ?? "")] ?? "一件东西");
      return `你做出了${label}`;
    }
    case "settlement-locations.cooked": return "你在公灶做了一顿饭";
    case "settlement-locations.ate": return "你吃了东西";
    case "settlement-locations.drank": return "你喝了水";
    case "settlement-locations.rested": return "你歇下了";
    case "settlement-locations.conversation": return name ? `你和${name}说了话` : "你和人说了话";
    case "settlement-locations.gift_received": return name ? `你送了${name}一样东西` : "你送出了一样东西";
    case "settlement-locations.arrived": {
      const place = String(data.placeName ?? data.placeId ?? "");
      return place ? `你到了${place}` : "你换了地方";
    }
    case "village-stories.incident_resolved": return "你应对了一件事";
    case "world-hazard.state": {
      const stage = String(data.stage ?? "");
      if (stage === "omen") return "天色不太对";
      if (stage === "active") return "灾情逼近了";
      return "";
    }
    default: return "";
  }
}

/** 名字：认识就叫，不认识就说「有人」。 */
function personName(world: WorldView, me: string, id: string): string {
  if (!id || acquaintanceOf(world, me, id) === "stranger") return "";
  const identity = world.getComponent(id, "modern.identity");
  return String(identity?.givenName ?? "");
}

/** 从今天的事件里挑出三句该说的。 */
export function daySummary(
  world: WorldView,
  me: string,
  events: ReadonlyArray<{ type: string; data?: Record<string, unknown> }> = [],
): DaySummary {
  const yours: string[] = [];
  const village: string[] = [];
  for (const event of events) {
    const line = describe(event.type, event.data ?? {}, world, me);
    if (!line) continue;
    // 玩家自己的动作进「你做了什么」，其余进「村里发生了什么」。
    const mine = event.type.startsWith("settlement-locations.") || event.type.startsWith("village-stories.");
    const bucket = mine ? yours : village;
    if (!bucket.includes(line)) bucket.push(line);
  }

  // 村里的消息只补充「看得见」的部分：公共库存、有没有人病着（不点名）。
  const view = homestead(world, me);
  const grain = yieldPoints(world).find((y) => y.resourceId === "resource:grain");
  if (grain && grain.stock <= 3 && !village.some((l) => l.includes("粮"))) {
    village.push("粮缸快见底了");
  }
  for (const note of view.happenings) {
    // happenings 已经过认知过滤：陌生人的生日不会出现在这里。
    if (!village.includes(note)) village.push(note);
  }

  const opinions: string[] = [];
  for (const person of view.neighbours) {
    if (person.acquaintance === "stranger") continue;
    if (person.regard && person.regard !== "平常") {
      opinions.push(`${person.name}${person.regard}`);
    }
  }

  const remaining = view.dailyActivity.remaining;
  const towardGoal = remaining <= 2
    ? `今天还剩 ${remaining} 格活动时间`
    : "";

  const parts = [
    yours.length ? `今天：${yours.slice(0, 3).join("，")}` : "",
    village.length ? `村里：${village.slice(0, 2).join("，")}` : "",
  ].filter(Boolean);

  return {
    yours: yours.slice(0, 3),
    village: village.slice(0, 4),
    opinions: opinions.slice(0, 3),
    towardGoal,
    line: parts.join("。") || "这一天平静地过去了",
  };
}

/** 只用于测试：确认某个居民 key 存在。 */
export const __test = { residentId };
