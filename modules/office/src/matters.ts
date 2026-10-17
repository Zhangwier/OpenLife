/**
 * 要管的事：坐上位子之后，村里等着你断的事。
 *
 * 这是"职位好不好玩"的全部。求票只是手段，**断第一桩争执**才是玩家第一次
 * 真正使用权力。所以每件事都要：
 *  - 有真实的两种以上做法，各自都有道理
 *  - 有明确后果（谁服谁不服、粮怎么动、民心涨落）
 *  - 需要相应的设施才开得出某些选项（界石、记数木板、鼓、集场）
 *
 * 事情按季度来，不按年——玩家等不了一年才管一件事。
 */
import type { WorldView } from "@openlife/contracts";

/** 一桩事的种类。 */
export interface MatterSpec {
  id: string;
  /** What the holder is asked to settle. */
  title: string;
  /** Only this office may handle it. */
  office?: string;
  /** Which facility unlocks which option. */
  options: MatterOption[];
}

export interface MatterOption {
  id: string;
  label: string;
  /** Needs this facility tag in the village, or the option is greyed out. */
  needsFacility?: string;
  /** Needs this institution. */
  needsInstitution?: string;
  /** What it does, in rules terms. */
  effects: {
    /** How much the two sides end up accepting the outcome, -2..+2. */
    settle?: number;
    /** Village standing change for the holder, -2..+2. */
    standing?: number;
    /** Shared grain moved, positive = taken from the granary. */
    grain?: number;
    /** Which side is favoured, for the text layer. */
    favours?: "a" | "b" | "both" | "neither";
    /** A rule gets written down. */
    setsFlag?: string;
  };
}

export const MATTERS: readonly MatterSpec[] = [
  {
    id: "matter:dispute",
    title: "两家的地界",
    office: "office:headman",
    options: [
      {
        id: "favor-a",
        label: "按先占的那块算",
        effects: { settle: 1, standing: 0, favours: "a" },
      },
      {
        id: "favor-b",
        label: "按今年谁种得多算",
        effects: { settle: 0, standing: 1, favours: "b" },
      },
      {
        id: "split",
        label: "从中间划开，各让一步",
        effects: { settle: 1, standing: -1, favours: "both" },
      },
      {
        // 界石：双方都服，因为不是人说了算，是石头说了算。
        id: "boundary",
        label: "立一块界石，按界石说话",
        needsFacility: "facility:boundary-stone",
        effects: { settle: 2, standing: 2, favours: "both", setsFlag: "flag:boundary-marked" },
      },
    ],
  },
  {
    id: "matter:granary",
    title: "公仓开不开",
    office: "office:headman",
    options: [
      {
        id: "open",
        label: "开仓，先让各家吃上",
        effects: { settle: 2, standing: 1, grain: -6 },
      },
      {
        // 记数木板：按人头分，最公平，但要有板子才数得清。
        id: "ration",
        label: "按人头定量发",
        needsFacility: "facility:tally-board",
        effects: { settle: 2, standing: 2, grain: -4, setsFlag: "flag:rationed" },
      },
      {
        id: "keep",
        label: "留着，撑到明年",
        effects: { settle: -1, standing: -1, grain: 0 },
      },
    ],
  },
  {
    id: "matter:labor",
    title: "修堤派工",
    office: "office:headman",
    options: [
      {
        // 鼓：敲起来全村都听得见，才能"家家出人"。
        id: "call-all",
        label: "敲鼓，家家出人上堤",
        needsFacility: "facility:drum",
        effects: { settle: 1, standing: 1, setsFlag: "flag:levee-crewed" },
      },
      {
        // 只叫愿意来的：不强迫，但堤修得慢，村里人心里有数。
        id: "volunteers",
        label: "只叫愿意来的",
        effects: { settle: 0, standing: 1, setsFlag: "flag:levee-thin" },
      },
      {
        id: "ignore",
        label: "今年先不修",
        effects: { settle: -1, standing: -2 },
      },
    ],
  },
  {
    id: "matter:rule",
    title: "要不要立条规矩",
    office: "office:headman",
    options: [
      {
        // 告示木牌：立下的规矩全村都知道，才不至于"没人当回事"。
        id: "enact",
        label: "立下来，全村照办",
        needsFacility: "facility:notice-board",
        effects: { settle: 2, standing: 2, setsFlag: "flag:rule-written" },
      },
      {
        // 没有牌子也能立，但只靠嘴说，记得的人少。
        id: "enact-by-voice",
        label: "当众说一遍，不立字据",
        effects: { settle: 1, standing: 1, setsFlag: "flag:rule-spoken" },
      },
      {
        id: "drop",
        label: "算了，各家自己看着办",
        effects: { settle: 0, standing: -1 },
      },
    ],
  },
  {
    id: "matter:feast",
    title: "办不办这一席",
    office: "office:headman",
    options: [
      {
        // 议事场：办席要有个能坐下全村的地方。
        id: "feast",
        label: "办，热闹一场",
        needsFacility: "facility:assembly-place",
        effects: { settle: 2, standing: 2, grain: -4 },
      },
      {
        id: "small-feast",
        label: "不办大席，各家分一点",
        effects: { settle: 1, standing: 0, grain: -2 },
      },
      {
        id: "save",
        label: "不办，粮留着",
        effects: { settle: -1, standing: -1 },
      },
    ],
  },
  {
    id: "matter:market",
    title: "定日子开集",
    office: "office:town-head",
    options: [
      {
        id: "open-market",
        label: "定在每月初一",
        needsFacility: "facility:market-ground",
        effects: { settle: 2, standing: 2, setsFlag: "flag:market-open" },
      },
      {
        id: "no-market",
        label: "再等等，人还不够",
        effects: { settle: 0, standing: -1 },
      },
    ],
  },
];

export function matterById(id: string): MatterSpec | undefined {
  return MATTERS.find((m) => m.id === id);
}

/**
 * 这桩事现在能开哪几个选项。
 *
 * 设施和制度是硬门槛：没有界石就不能"按界石说话"，选项仍然显示但灰着，
 * 并说明差什么——玩家要能看到"盖了那个就能这么断"。
 */
export function availableOptions(
  matter: MatterSpec,
  facilities: ReadonlySet<string>,
  institutions: ReadonlySet<string>,
): Array<{ option: MatterOption; available: boolean; why: string }> {
  return matter.options.map((option) => {
    if (option.needsFacility && !facilities.has(option.needsFacility)) {
      return { option, available: false, why: `要有${facilityLabel(option.needsFacility)}` };
    }
    if (option.needsInstitution && !institutions.has(option.needsInstitution)) {
      return { option, available: false, why: "还没有这个规矩" };
    }
    return { option, available: true, why: "" };
  });
}

const FACILITY_LABEL: Record<string, string> = {
  "facility:assembly-place": "议事场",
  "facility:drum": "鼓",
  "facility:tally-board": "记数木板",
  "facility:boundary-stone": "界石",
  "facility:market-ground": "集场",
  "facility:granary": "公仓",
  "facility:notice-board": "告示木牌",
  "facility:council-hall": "公所",
};

export function facilityLabel(tag: string): string {
  return FACILITY_LABEL[tag] ?? tag;
}

/** 需求书第 1 节列出的五个「已接线」设施。 */
export const LIVE_FACILITIES: ReadonlyArray<{ tag: string; name: string; why: string }> = [
  { tag: "facility:assembly-place", name: "议事场", why: "当众说话最多能让六十人听到；没有它只有五个人" },
  { tag: "facility:drum", name: "鼓", why: "敲起来全村都听得见，修堤才能叫家家出人" },
  { tag: "facility:tally-board", name: "记数木板", why: "荒年能按人头定量发粮，最公平" },
  { tag: "facility:boundary-stone", name: "界石", why: "断地界时按界石说话，双方都服" },
  { tag: "facility:market-ground", name: "集场", why: "镇长可以定日子开集" },
];

/**
 * 村里现在有哪些设施。
 *
 * 设施就是带标签的物品原型 / 建筑实例。这里只认标签，不认具体是什么——
 * 议事场可以是树下的一块空地，也可以是一座棚子，内容作者随便定。
 */
export function facilitiesOf(world: WorldView): Set<string> {
  const out = new Set<string>();
  for (const entity of world.listEntities({ kind: "world-objects.item" })) {
    if (entity.archivedAt !== undefined) continue;
    const tags = entity.components["world-objects.object"]?.tags;
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) if (String(tag).startsWith("facility:")) out.add(String(tag));
  }
  return out;
}
