/**
 * 职位：谁说话算数。
 *
 * 一个村子要有"头人"这件事本身是 polity 的（`institution:headship`）。这个
 * 文件管的是**怎么坐上去**：推举、投票、世袭、任命，以及坐上去之前要做的事。
 *
 * 设计要点（来自开发文档 B8）：
 *  - 石器村落不说"选举""投票"，说"推""举手""站队"。话在 lines.ts 里，这里只管规则。
 *  - 求票有代价：送礼有 20% 被看成收买，好感反降；30 天内反复送同一个人会招人烦。
 *  - 许诺会被记住，兑现与违背都要有后果。玩家说过的话，村民会当面拿出来。
 *  - 全部用键控随机（`keyed`），不用命令序号——这样加一个插件不会让整段历史变样。
 */
import type { WorldView } from "@openlife/contracts";

/** 职位。头人最原始，往上才是管仓的、村长、镇长。 */
export interface OfficeSpec {
  id: string;
  label: string;
  /** Which institution must exist before this office can be filled. */
  needsInstitution?: string;
  /** How the holder is chosen. */
  how: "acclaim" | "vote" | "hereditary" | "appointed";
  /** How many people may hold it at once. */
  seats: number;
  /** What the holder is expected to handle. */
  matters: string[];
  /** Which facility tag makes the office's options available. */
  needsFacility?: string;
}

export const OFFICES: readonly OfficeSpec[] = [
  {
    id: "office:headman",
    label: "头人",
    needsInstitution: "institution:headship",
    how: "acclaim",
    seats: 1,
    matters: ["matter:dispute", "matter:labor", "matter:granary"],
    needsFacility: "facility:assembly-place",
  },
  {
    id: "office:granary-keeper",
    label: "管仓的",
    needsInstitution: "institution:shared-granary",
    how: "appointed",
    seats: 1,
    matters: ["matter:granary"],
    needsFacility: "facility:tally-board",
  },
  {
    id: "office:village-head",
    label: "村长",
    needsInstitution: "institution:chiefdom",
    how: "vote",
    seats: 1,
    matters: ["matter:dispute", "matter:rule", "matter:feast", "matter:labor"],
    needsFacility: "facility:assembly-place",
  },
  {
    id: "office:town-head",
    label: "镇长",
    needsInstitution: "institution:written-law",
    how: "vote",
    seats: 1,
    matters: ["matter:market", "matter:rule", "matter:dispute"],
    needsFacility: "facility:market-ground",
  },
];

export function officeById(id: string): OfficeSpec | undefined {
  return OFFICES.find((o) => o.id === id);
}

/** 一场正在进行的选择。 */
export interface Race {
  officeId: string;
  /** Everyone who stood up. */
  candidates: string[];
  /** Who has said they lean towards whom. personId -> candidateId. */
  leanings: Record<string, string>;
  /** Votes already cast, when the office is filled by vote. */
  votes: Record<string, string>;
  openedAt: number;
  /** When the decision lands. */
  closesAt: number;
  /** Rounds of canvassing done by each candidate, for the "again" line. */
  rounds: Record<string, number>;
}

/** 一次求票的结果，供文字层挑话说。 */
export type CanvassTone =
  | "warm" | "cool" | "annoyed"          // visit
  | "bought" | "gift-warm"               // gift
  | "doubtful"                           // promise
  | "crowd" | "few"                      // speech
  | "helped" | "refused"                 // ask-ally
  | "stuck" | "backfired";               // smear

/** 一个村民此刻对你的态度，决定求票说话的语气。 */
export interface Listener {
  id: string;
  /** 0..10 hearts, read from the settlement's own bond. */
  hearts: number;
  /** Already promised to someone else. */
  leaning: string | null;
  /** Has a grudge about an old promise. */
  grudge: boolean;
  kin: boolean;
}

/**
 * 拜访一个人求他支持你。
 *
 * 不看随机：他给不给你好脸，取决于交情、有没有旧怨、是不是亲戚。
 * 随机只决定他**说不说出口**——这一点交给文字层，规则这里只定语气。
 */
export function visitTone(listener: Listener, candidateId: string): CanvassTone {
  if (listener.leaning === candidateId) return "warm";
  if (listener.grudge) return "annoyed";
  if (listener.kin || listener.hearts >= 6) return "warm";
  if (listener.hearts >= 3) return "cool";
  return "annoyed";
}

/**
 * 送礼求票。
 *
 * 20% 被看成收买（好感反降），这是开发文档明写的行为。用键控随机，键是
 * (candidate, listener, day)，所以同一天同一对人间结果固定，换个日子才变。
 */
export function giftLooksLikeBribe(keyed: (purpose: string, ...parts: Array<string | number>) => number,
  candidateId: string, listenerId: string, day: number): boolean {
  return keyed("office.bribe", candidateId, listenerId, day) < 0.2;
}

/**
 * 礼物档次对好感的影响倍率（需求书第 2 节）。
 *
 * 普通 0.7、体面 1.0、贵重 1.5。档次由物品原型的标签决定，不认具体是什么东西。
 */
export const GIFT_TIERS: Record<string, number> = {
  "gift:common": 0.7,
  "gift:fine": 1.0,
  "gift:precious": 1.5,
};

export function giftMultiplier(tags: readonly string[]): number {
  for (const tag of tags) if (GIFT_TIERS[tag] !== undefined) return GIFT_TIERS[tag]!;
  return 1.0;   // an untagged gift is just a gift
}

/**
 * 同一个人 30 天内反复送，会招人烦。
 *
 * 返回 true 表示这次送礼已经烦人了——好感不升反降，文字层要说难听的话。
 */
export function giftWearsThin(history: readonly number[], today: number): boolean {
  const recent = history.filter((day) => today - day < 30);
  return recent.length >= 2;
}

/** 计票：得票最多的人当选；平票时按交情总和破平，仍平则按 id 稳定排序。 */
export function tallyVotes(
  race: Race,
  heartsOf: (personId: string) => number,
): { winner: string | null; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const candidate of race.candidates) counts[candidate] = 0;
  for (const [voter, choice] of Object.entries(race.votes)) {
    if (counts[choice] === undefined) continue;      // a vote for someone who dropped out
    void voter;
    counts[choice] = (counts[choice] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const ha = heartsOf(a[0]), hb = heartsOf(b[0]);
    if (hb !== ha) return hb - ha;
    return a[0].localeCompare(b[0]);
  });
  return { winner: ranked[0]?.[0] ?? null, counts };
}

/** 设施标签：村里有没有这东西。 */
export function hasFacility(tags: ReadonlySet<string>, facility: string | undefined): boolean {
  return facility === undefined ? true : tags.has(facility);
}

/**
 * 谁能参选：成年人、还活着、在村里。
 *
 * 刻意不看名望——名望是 NPC 决定要不要拉票的事，不是能不能站出来的门槛。
 * 一个没人认识的人也可以参选，只是赢不了。
 */
export function canStand(world: WorldView, personId: string, adultAge = 16): boolean {
  const entity = world.getEntity(personId);
  if (!entity || entity.archivedAt !== undefined) return false;
  if (entity.components["modern.vitals"]?.alive === false) return false;
  const age = Number(entity.components["modern.vitals"]?.ageYears ?? 0);
  return age >= adultAge;
}
