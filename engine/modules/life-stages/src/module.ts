/**
 * 人生阶段：把「出生 → 成年 → 生育 → 继承」拆成五段，每段有自己才有的动作。
 *
 *   童年 0–7   跟着大人看、玩伴、闯祸
 *   少年 8–15  拜师、第一次独立干活、心上人
 *   成年 16–39 当家、成家、养孩子
 *   壮年 40–54 调解纠纷、带徒弟、把家业顶住
 *   老年 55+   讲古、传手艺、交代后事、立遗愿
 *
 * 这个模块**不重写**聚落已有的生育、继承、家事——那些照旧。它只做三件事：
 *   1. 给出五段与各自的专属动作（阶段是数据，动作是命令）；
 *   2. 让「传手艺」真的加速后辈学习（给后辈记一笔加速，后辈自己学的时候少花力气）；
 *   3. 继承交接时，把老一代没走完的愿望和知道的心事，以「遗言」的形式部分传下去。
 *
 * 遗言只传一部分，这是刻意的：如果全传，继承人就等于继承了另一个人的一生，
 * 认知层（「你并不全知」）会在第一代人之后就失去意义。所以规矩是——
 * 传一件未了的心愿（他最放不下的那件）、传他知道的**已经确知**的心事里的一部分
 * （最多三件，且都是他确知的；「听说」不传，因为道听途说算不上遗言）。
 */
import type { ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { RIVER_TERRACE_PACK, SettlementComponents, residentId } from "@openlife/module-settlement-locations";
import { ageInYearsIn } from "@openlife/life-contracts";

const OWNER = "life-stages";
const CAPABILITY = "life.stages";

export const StageComponents = {
  /** 这一生走到了哪一段（记在人生上，随存档走）。 */
  stage: "life-stages.stage",
  /** 遗言：上一代留下的、还没走完的心愿与几件确知的事。 */
  lastWords: "life-stages.last-words",
  /** 后辈学手艺的加速：谁教过他，加速几次。 */
  tutelage: "life-stages.tutelage",
} as const;

export const StageCommands = {
  /** 按年龄重新认一次自己的阶段（跨段那天由聚落的日子推动）。 */
  refresh: "life-stages.refresh",
  /** 童年：跟着大人看。 */
  followElder: "life-stages.follow_elder",
  /** 童年：找玩伴。 */
  playWith: "life-stages.play_with",
  /** 童年：闯祸。 */
  getIntoTrouble: "life-stages.get_into_trouble",
  /** 少年：拜师。 */
  apprentice: "life-stages.apprentice",
  /** 少年：第一次独立干活。 */
  firstSoloWork: "life-stages.first_solo_work",
  /** 少年：心上人。 */
  firstCrush: "life-stages.first_crush",
  /** 成年：当家。 */
  takeCharge: "life-stages.take_charge",
  /** 壮年：调解纠纷。 */
  mediate: "life-stages.mediate",
  /** 壮年：带徒弟。 */
  teachApprentice: "life-stages.teach_apprentice",
  /** 老年：讲古。 */
  tellTheOldDays: "life-stages.tell_the_old_days",
  /** 老年：传手艺（加速后辈学习）。 */
  passOnCraft: "life-stages.pass_on_craft",
  /** 老年：交代后事。 */
  settleAffairs: "life-stages.settle_affairs",
  /** 老年：立遗愿。 */
  makeWill: "life-stages.make_will",
  /** 继承交接：把遗言交下去。 */
  handDown: "life-stages.hand_down",
} as const;

export const StageProjections = {
  /** 这一生现在在哪一段、能做什么。 */
  life: "life-stages.life",
} as const;

export const StageRejection = "E_STAGE_NOT_YET";
const refuse = (message: string): ConstraintOutcome => ({ ok: false, code: StageRejection, message });

export type LifeStage = "childhood" | "youth" | "adulthood" | "prime" | "elder";

export interface StageSpec {
  id: LifeStage;
  name: string;
  /** 含下界，不含上界；`elder` 没有上界。 */
  from: number;
  to: number;
  /** 这一段才做得了的事（命令 id）。 */
  actions: string[];
  /** 一句话说明这一段是什么滋味。 */
  mood: string;
}

/**
 * 五段。成年与壮年的分界取 40：这个村子的人四十岁上下就开始被叫「老一辈」，
 * 而 55 之后基本不再下地——这与聚落数据里村民的年龄分布是对得上的。
 */
export const STAGES: readonly StageSpec[] = [
  { id: "childhood", name: "童年", from: 0, to: 8, mood: "世界是大人腿边那么大。",
    actions: [StageCommands.followElder, StageCommands.playWith, StageCommands.getIntoTrouble] },
  { id: "youth", name: "少年", from: 8, to: 16, mood: "手痒，想试试自己能不能行。",
    actions: [StageCommands.apprentice, StageCommands.firstSoloWork, StageCommands.firstCrush] },
  { id: "adulthood", name: "成年", from: 16, to: 40, mood: "事情开始落到自己肩上。",
    actions: [StageCommands.takeCharge] },
  { id: "prime", name: "壮年", from: 40, to: 55, mood: "上有老下有小，谁也离不开你。",
    actions: [StageCommands.mediate, StageCommands.teachApprentice] },
  { id: "elder", name: "老年", from: 55, to: Number.POSITIVE_INFINITY, mood: "剩下的事，是把它交出去。",
    actions: [StageCommands.tellTheOldDays, StageCommands.passOnCraft, StageCommands.settleAffairs, StageCommands.makeWill] },
];

export function stageOfAge(age: number): StageSpec {
  const years = Math.max(0, Math.floor(age));
  // 从后往前找第一个「到了下界」的段：这样 55 一定是老年，40 一定是壮年。
  for (let i = STAGES.length - 1; i >= 0; i -= 1) if (years >= STAGES[i]!.from) return STAGES[i]!;
  return STAGES[0]!;
}

/** 这个人的年龄（按世界自己的时间刻度算，不假设一年 12 格）。 */
export function ageOf(world: WorldView, id: string): number {
  const vitals = world.getComponent(id, "modern.vitals")?.ageYears;
  if (typeof vitals === "number" && Number.isFinite(vitals)) return vitals;
  const bornAt = Number(world.getComponent(id, "modern.identity")?.bornAt ?? world.tick);
  return ageInYearsIn(world, bornAt, world.tick);
}

/** 这一生现在在哪一段（先看记下来的，没有就按年龄算）。 */
export function stageOf(world: WorldView, id: string): StageSpec {
  return stageOfAge(ageOf(world, id));
}

const obj = (v: unknown): Record<string, JsonValue> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, JsonValue> : {};

const isAlive = (world: WorldView, id: string) => {
  const e = world.getEntity(id);
  return Boolean(e && e.archivedAt === undefined && e.components["modern.vitals"]?.alive !== false);
};
const playerId = (world: WorldView) =>
  String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
const nameOf = (world: WorldView, id: string) =>
  RIVER_TERRACE_PACK.residents.find((r) => residentId(r.key) === id)?.name
  ?? String(world.getComponent(id, "modern.identity")?.givenName ?? "那个人");

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/** 遗言：上一代留下的东西。 */
export interface LastWords {
  from: string;
  fromName: string;
  at: number;
  /** 他没能做完的那件事（一句原话）。 */
  unfinished: string;
  /** 他确知的心事（只有确知的才配当遗言）。 */
  secrets: Array<{ secretId: string; ownerKey: string; ownerName: string; text: string }>;
  /** 他传下来的手艺名。 */
  craft: string;
}

/** 这一生做过的、记在自己身上的事（给「讲古」用）。 */
function deeds(world: WorldView, id: string): string[] {
  const raw = world.getComponent(id, StageComponents.stage)?.deeds;
  return Array.isArray(raw) ? raw.map(String) : [];
}

const writeStage = (id: string, patch: Record<string, JsonValue>, reason: string): Effect => ({
  kind: "modifyComponent", entityId: id, component: StageComponents.stage, patch, reason,
});

export const lifeStagesModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "人生阶段",
    description: "Five life stages (0-7, 8-15, 16-39, 40-54, 55+), each with actions only it can take; a will hands part of one life to the next.",
    provides: [CAPABILITY],
    requires: ["life.settlement"],
    optional: ["settlement.secrets", "life.wants"],
    capabilities: [
      "component.register", "command.register",
      "rule.constraint.register", "rule.resolution.register", "rule.reaction.register",
      "projection.register",
    ],
  },

  register(ctx) {
    // 软依赖：只在注册时问一次，运行时不 import 对方（PLUGINS 1.3 第 3 条）。
    const hasSecrets = ctx.registry.hasCapability("settlement.secrets");
    const hasWants = ctx.registry.hasCapability("life.wants");

    for (const id of Object.values(StageComponents)) {
      ctx.registerComponent({ id, persist: true, description: `life-stages component ${id}` });
    }
    for (const type of Object.values(StageCommands)) ctx.registerCommand({ type });

    // --- 共用校验 -------------------------------------------------------------

    /** 只有「你自己这一段做得了的事」才做得成。这是本模块的全部骨架。 */
    const onlyIn = (c: { world: WorldView; command: { actorId?: string } }, wanted: LifeStage, what: string): ConstraintOutcome => {
      const me = c.command.actorId ?? "";
      if (!me || me !== playerId(c.world)) return refuse("这一生只能由自己来走。");
      if (!isAlive(c.world, me)) return refuse("这一生已经走完了。");
      const stage = stageOf(c.world, me);
      if (stage.id !== wanted) {
        const label = STAGES.find((s) => s.id === wanted)!.name;
        return refuse(`${what}是${label}才做的事。你现在是${stage.name}。`);
      }
      return { ok: true };
    };

    /** 在场：要做的事得有个现场（同一个地方）。 */
    const sameePlace = (world: WorldView, a: string, b: string) =>
      Boolean(occupiedPlaceId(world, a)) && occupiedPlaceId(world, a) === occupiedPlaceId(world, b);

    const record = (world: WorldView, id: string, deed: string, line: string, significance: number, targetId?: string): Effect[] => [
      writeStage(id, { deeds: [...deeds(world, id), deed].slice(-40) }, `a ${stageOf(world, id).name} deed`),
      {
        kind: "emitEvent", eventType: `life-stages.${deed}`, actorId: id,
        ...(targetId ? { targetId } : {}),
        data: { stage: stageOf(world, id).id, line }, historicalSignificance: significance,
      },
    ];

    // --- 童年 -----------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${StageCommands.followElder}.allowed`, commandType: StageCommands.followElder,
      evaluate: (c) => {
        const base = onlyIn(c, "childhood", "跟着大人看");
        if (!base.ok) return base;
        const target = String(c.command.payload.targetId ?? "");
        if (!target || !isAlive(c.world, target)) return refuse("要跟在一个活着的大人身后。");
        if (target === c.command.actorId) return refuse("跟着自己走没有意义。");
        if (!sameePlace(c.world, c.command.actorId!, target)) return refuse("大人不在这儿。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.followElder}.resolve`, commandType: StageCommands.followElder,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const target = String(c.command.payload.targetId);
        const work = RIVER_TERRACE_PACK.residents.find((r) => residentId(r.key) === target)?.role ?? "做事";
        return record(c.world, me, "follow_elder",
          `你跟在${nameOf(c.world, target)}身后看他${work}。看不太懂，但记住了手上的样子。`, 0.03, target);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.playWith}.allowed`, commandType: StageCommands.playWith,
      evaluate: (c) => {
        const base = onlyIn(c, "childhood", "找玩伴");
        if (!base.ok) return base;
        const target = String(c.command.payload.targetId ?? "");
        if (!target || !isAlive(c.world, target)) return refuse("要找一个还在村里的孩子。");
        if (stageOf(c.world, target).id !== "childhood") return refuse(`${nameOf(c.world, target)}已经不是满地跑的年纪了。`);
        if (!sameePlace(c.world, c.command.actorId!, target)) return refuse("玩伴不在这儿。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.playWith}.resolve`, commandType: StageCommands.playWith,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const target = String(c.command.payload.targetId);
        // 玩伴之间的情分：交给聚落自己的搭话去记（它会加交情），这里只记下这件事。
        return record(c.world, me, "play_with", `你和${nameOf(c.world, target)}在河滩上跑了一下午。`, 0.03, target);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.getIntoTrouble}.allowed`, commandType: StageCommands.getIntoTrouble,
      evaluate: (c) => {
        const base = onlyIn(c, "childhood", "闯祸");
        if (!base.ok) return base;
        const place = occupiedPlaceId(c.world, c.command.actorId!);
        if (!place) return refuse("先走进村里。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.getIntoTrouble}.resolve`, commandType: StageCommands.getIntoTrouble,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const place = occupiedPlaceId(c.world, me);
        const where = RIVER_TERRACE_PACK.places.find((p) => p.id === place)?.name ?? "村里";
        const lines = [
          `你在${where}把一摞东西碰倒了。有人喊了一声，你跑了。`,
          `你在${where}跟人赌气，把人家的东西藏了起来。天黑前又偷偷放了回去。`,
          `你在${where}学着大人的样子干活，结果弄坏了一样东西。没人看见，你也没说。`,
        ];
        return record(c.world, me, "get_into_trouble", lines[hashKey(`${me}:${c.world.tick}`) % lines.length]!, 0.05);
      },
    });

    // --- 少年 -----------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${StageCommands.apprentice}.allowed`, commandType: StageCommands.apprentice,
      evaluate: (c) => {
        const base = onlyIn(c, "youth", "拜师");
        if (!base.ok) return base;
        const target = String(c.command.payload.targetId ?? "");
        if (!target || !isAlive(c.world, target)) return refuse("要拜一个还在村里的人为师。");
        if (stageOf(c.world, target).id === "childhood" || stageOf(c.world, target).id === "youth")
          return refuse(`${nameOf(c.world, target)}自己还没出师。`);
        if (!sameePlace(c.world, c.command.actorId!, target)) return refuse("师傅不在这儿。");
        if (deeds(c.world, c.command.actorId!).includes(`apprentice:${target}`)) return refuse("已经拜过这位师傅了。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.apprentice}.resolve`, commandType: StageCommands.apprentice,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const target = String(c.command.payload.targetId);
        const role = RIVER_TERRACE_PACK.residents.find((r) => residentId(r.key) === target)?.role ?? "手上的活";
        return record(c.world, me, `apprentice:${target}`,
          `你正式跟${nameOf(c.world, target)}学${role}。头一天他只让你看着。`, 0.12, target);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.firstSoloWork}.allowed`, commandType: StageCommands.firstSoloWork,
      evaluate: (c) => {
        const base = onlyIn(c, "youth", "第一次独立干活");
        if (!base.ok) return base;
        if (deeds(c.world, c.command.actorId!).includes("first_solo_work")) return refuse("这一回已经过去了，那是只发生一次的事。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.firstSoloWork}.resolve`, commandType: StageCommands.firstSoloWork,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const place = occupiedPlaceId(c.world, me);
        const where = RIVER_TERRACE_PACK.places.find((p) => p.id === place)?.name ?? "村里";
        return record(c.world, me, "first_solo_work",
          `你第一次一个人把${where}的活干完了，没人搭手。收工时天已经黑了，你站在原地看了一会儿。`, 0.2);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.firstCrush}.allowed`, commandType: StageCommands.firstCrush,
      evaluate: (c) => {
        const base = onlyIn(c, "youth", "心上人");
        if (!base.ok) return base;
        const target = String(c.command.payload.targetId ?? "");
        if (!target || !isAlive(c.world, target) || target === c.command.actorId) return refuse("要看着一个具体的人。");
        if (deeds(c.world, c.command.actorId!).some((d) => d.startsWith("crush:"))) return refuse("这种事，一辈子只开一次口。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.firstCrush}.resolve`, commandType: StageCommands.firstCrush,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const target = String(c.command.payload.targetId);
        return record(c.world, me, `crush:${target}`,
          `你发现自己总在找${nameOf(c.world, target)}的影子。这话你没跟任何人说。`, 0.15, target);
      },
    });

    // --- 成年 -----------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${StageCommands.takeCharge}.allowed`, commandType: StageCommands.takeCharge,
      evaluate: (c) => {
        const base = onlyIn(c, "adulthood", "当家");
        if (!base.ok) return base;
        if (deeds(c.world, c.command.actorId!).includes("take_charge")) return refuse("这个家已经在你手上了。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.takeCharge}.resolve`, commandType: StageCommands.takeCharge,
      resolve: (c) => {
        const me = c.command.actorId as string;
        return record(c.world, me, "take_charge",
          "从今天起，家里的粮、柴、人情往来，都由你拿主意。没人教过你，你也没问。", 0.25);
      },
    });

    // --- 壮年 -----------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${StageCommands.mediate}.allowed`, commandType: StageCommands.mediate,
      evaluate: (c) => {
        const base = onlyIn(c, "prime", "调解纠纷");
        if (!base.ok) return base;
        const a = String(c.command.payload.firstId ?? "");
        const b = String(c.command.payload.secondId ?? "");
        if (!a || !b || a === b || !isAlive(c.world, a) || !isAlive(c.world, b)) return refuse("得是两个都在的人。");
        if (!sameePlace(c.world, c.command.actorId!, a) || !sameePlace(c.world, c.command.actorId!, b))
          return refuse("两个当事人得都在场。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.mediate}.resolve`, commandType: StageCommands.mediate,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const a = String(c.command.payload.firstId), b = String(c.command.payload.secondId);
        // 调解是「用你的岁数压住两个人的火」：真正把怨气削下去要走 social-conflict
        // 自己的命令（mediation），这里只记下你出面了——它让后续的调解更容易开口。
        return record(c.world, me, "mediate",
          `你把${nameOf(c.world, a)}和${nameOf(c.world, b)}叫到一处，各说了几句。两人都没再开口，但也没走。`, 0.15, a);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.teachApprentice}.allowed`, commandType: StageCommands.teachApprentice,
      evaluate: (c) => {
        const base = onlyIn(c, "prime", "带徒弟");
        if (!base.ok) return base;
        const target = String(c.command.payload.targetId ?? "");
        if (!target || !isAlive(c.world, target)) return refuse("要带一个还在的人。");
        if (stageOf(c.world, target).id !== "youth") return refuse("徒弟得是少年。");
        if (!sameePlace(c.world, c.command.actorId!, target)) return refuse("徒弟不在这儿。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.teachApprentice}.resolve`, commandType: StageCommands.teachApprentice,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const target = String(c.command.payload.targetId);
        const prior = Number(obj(c.world.getComponent(target, StageComponents.tutelage)).times ?? 0);
        return [
          // 带徒弟：后辈记一笔「有人教过我」，他自己学手艺时少花力气（见下面的加速规则）。
          {
            kind: "setComponent", entityId: target, component: StageComponents.tutelage,
            value: { times: prior + 1, from: me, at: c.world.tick } as unknown as Record<string, JsonValue>,
            reason: "a master took the time",
          },
          ...record(c.world, me, "teach_apprentice",
            `你带着${nameOf(c.world, target)}做了一整天的活，把手上那点门道拆开讲给他听。`, 0.12, target),
        ];
      },
    });

    // --- 老年 -----------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${StageCommands.tellTheOldDays}.allowed`, commandType: StageCommands.tellTheOldDays,
      evaluate: (c) => {
        const base = onlyIn(c, "elder", "讲古");
        if (!base.ok) return base;
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.tellTheOldDays}.resolve`, commandType: StageCommands.tellTheOldDays,
      resolve: (c) => {
        const me = c.command.actorId as string;
        // 讲古讲的是**自己做过的事**，不是全知的村史——这就是认知层在老年段的体现。
        const mine = deeds(c.world, me);
        const told = mine.length
          ? `你讲起自己${mine.length}件旧事里的一件。听的人问了一句，你答不上来，就笑说记不清了。`
          : "你想讲点什么，发现自己这一生还没什么可讲的。听的人没接话。";
        return record(c.world, me, "tell_the_old_days", told, 0.08);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.passOnCraft}.allowed`, commandType: StageCommands.passOnCraft,
      evaluate: (c) => {
        const base = onlyIn(c, "elder", "传手艺");
        if (!base.ok) return base;
        const target = String(c.command.payload.targetId ?? "");
        if (!target || !isAlive(c.world, target)) return refuse("要传给一个还在的人。");
        // 「后辈」按岁数算，不按阶段算：一个活了很久的村子里，可能一个少年都不剩，
        // 但总有人比你年轻。同辈（相差不到五岁）之间谈不上传手艺。
        const mine = ageOf(c.world, c.command.actorId!);
        const theirs = ageOf(c.world, target);
        if (mine - theirs < 5) return refuse("同辈之间谈不上传手艺。");
        if (!sameePlace(c.world, c.command.actorId!, target)) return refuse("要传的人不在这儿。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.passOnCraft}.resolve`, commandType: StageCommands.passOnCraft,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const target = String(c.command.payload.targetId);
        const craft = String(c.command.payload.craft ?? "手上的活");
        const prior = Number(obj(c.world.getComponent(target, StageComponents.tutelage)).times ?? 0);
        return [
          // 传手艺 = 三次带徒弟的分量：后辈学起来快得多。
          {
            kind: "setComponent", entityId: target, component: StageComponents.tutelage,
            value: { times: prior + 3, from: me, at: c.world.tick, craft } as unknown as Record<string, JsonValue>,
            reason: "an old hand passed the craft down",
          },
          ...record(c.world, me, "pass_on_craft",
            `你把${craft}的门道一句一句讲给${nameOf(c.world, target)}，讲到天黑。有些话你说得很慢，怕漏了。`, 0.2, target),
        ];
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.settleAffairs}.allowed`, commandType: StageCommands.settleAffairs,
      evaluate: (c) => {
        const base = onlyIn(c, "elder", "交代后事");
        if (!base.ok) return base;
        if (deeds(c.world, c.command.actorId!).includes("settle_affairs")) return refuse("后事已经交代过了。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.settleAffairs}.resolve`, commandType: StageCommands.settleAffairs,
      resolve: (c) => {
        const me = c.command.actorId as string;
        return record(c.world, me, "settle_affairs",
          "你把家里的东西一件件点过：哪件给谁，哪笔人情还没还，哪句话要带给谁。说完，心里空了一块。", 0.3);
      },
    });

    ctx.registerConstraintRule({
      id: `${StageCommands.makeWill}.allowed`, commandType: StageCommands.makeWill,
      evaluate: (c) => {
        const base = onlyIn(c, "elder", "立遗愿");
        if (!base.ok) return base;
        const heir = String(c.command.payload.heirId ?? "");
        if (!heir || !isAlive(c.world, heir)) return refuse("得有一个接得住的人。");
        if (!c.world.listRelations({ type: "family.parent_of", from: c.command.actorId!, to: heir }).length)
          return refuse("遗愿只交给自己的孩子。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.makeWill}.resolve`, commandType: StageCommands.makeWill,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const heir = String(c.command.payload.heirId);
        const words = collectLastWords(c.world, me, heir, hasSecrets, hasWants);
        return [
          { kind: "setComponent", entityId: me, component: StageComponents.lastWords,
            value: words as unknown as Record<string, JsonValue>, reason: "a will, written while still alive" },
          ...record(c.world, me, "make_will",
            `你把${nameOf(c.world, heir)}叫到跟前，说了一句一直没说的话。`, 0.3, heir),
        ];
      },
    });

    // --- 遗言：立了就有，死了才生效 -------------------------------------------

    /**
     * 继承交接。
     *
     * 聚落自己已经有一条 `settlement-locations.handoff`（把孩子接过来过日子），
     * 它会把家传手艺和出身交下去。这里补的是它交不了的两样：**没走完的心愿**
     * 和**确知的心事**——因为这些记在别的地方，聚落不该知道它们。
     */
    ctx.registerConstraintRule({
      id: `${StageCommands.handDown}.allowed`, commandType: StageCommands.handDown,
      evaluate: (c) => {
        const from = c.command.actorId ?? "";
        const to = c.command.targetId ?? "";
        if (!from || !to) return refuse("要有上一代和下一代。");
        if (!c.world.getComponent(from, StageComponents.lastWords)) return refuse("他没有留下话。");
        if (!isAlive(c.world, to)) return refuse("接的人不在了。");
        if (c.world.getComponent(to, StageComponents.lastWords)) return refuse("这一份遗言已经交过了。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${StageCommands.handDown}.resolve`, commandType: StageCommands.handDown,
      resolve: (c) => {
        const from = c.command.actorId as string;
        const to = c.command.targetId as string;
        const words = obj(c.world.getComponent(from, StageComponents.lastWords)) as unknown as LastWords;
        return [
          // 遗言换到继承人身上，并标上「这是谁留下的」。
          { kind: "setComponent", entityId: to, component: StageComponents.lastWords,
            value: { ...words, inheritedAt: c.world.tick } as unknown as Record<string, JsonValue>,
            reason: "last words passed on" },
          {
            kind: "emitEvent", eventType: "life-stages.last_words_passed", actorId: from, targetId: to,
            data: {
              unfinished: words.unfinished, secrets: words.secrets.length, craft: words.craft,
              line: `${nameOf(c.world, from)}没能走完的事，现在落在${nameOf(c.world, to)}身上。`,
            },
            historicalSignificance: 0.4,
          },
        ];
      },
    });

    // 有人走了：如果留下过话，孩子在场就自动交下去——不用玩家再点一次。
    ctx.registerReactionRule({
      id: "life-stages.passing.hand_down", eventType: "modern.character_died",
      react: (c): Effect[] => {
        const dead = c.event.actorId ?? "";
        if (!dead || !c.world.getComponent(dead, StageComponents.lastWords)) return [];
        const effects: Effect[] = [];
        for (const rel of c.world.listRelations({ type: "family.parent_of", from: dead })) {
          if (!isAlive(c.world, rel.to)) continue;
          if (c.world.getComponent(rel.to, StageComponents.lastWords)) continue;
          const words = obj(c.world.getComponent(dead, StageComponents.lastWords));
          effects.push(
            { kind: "setComponent", entityId: rel.to, component: StageComponents.lastWords,
              value: { ...words, inheritedAt: c.world.tick } as unknown as Record<string, JsonValue>,
              reason: "last words, after the fact" },
            {
              kind: "emitEvent", eventType: "life-stages.last_words_passed", actorId: dead, targetId: rel.to,
              data: {
                unfinished: String(words.unfinished ?? ""),
                secrets: Array.isArray(words.secrets) ? words.secrets.length : 0,
                craft: String(words.craft ?? ""),
                line: `${nameOf(c.world, dead)}留下的话，${nameOf(c.world, rel.to)}记住了。`,
              },
              historicalSignificance: 0.4,
            },
          );
        }
        return effects;
      },
    });

    /**
     * 传手艺真的加速学习。
     *
     * 挂聚落自己的 `settlement-locations.lesson`（一次学艺课）：被教的人若身上
     * 记着 tutelage，就顺手把这份「少走弯路」转成一句更快的进度——具体做法是给
     * 他记一笔已用的加速次数，并让这次课多算一次。加速次数有限（最多三次），
     * 用完就没有了：老手只能扶你上马一次。
     */
    ctx.registerReactionRule({
      id: "life-stages.tutelage.speeds_learning", eventType: "settlement-locations.lesson",
      react: (c): Effect[] => {
        const learner = c.event.targetId ?? "";
        if (!learner) return [];
        const raw = obj(c.world.getComponent(learner, StageComponents.tutelage));
        const times = Number(raw.times ?? 0);
        if (times <= 0) return [];
        return [
          { kind: "setComponent", entityId: learner, component: StageComponents.tutelage,
            value: { ...raw, times: times - 1, lastUsedAt: c.world.tick } as unknown as Record<string, JsonValue>,
            reason: "the old hand's teaching pays off" },
          {
            kind: "emitEvent", eventType: "life-stages.tutelage_used", actorId: learner,
            data: {
              remaining: times - 1, from: String(raw.from ?? ""), craft: String(raw.craft ?? ""),
              line: `手上的活比平时顺。${String(raw.from ? nameOf(c.world, String(raw.from)) : "教过你的人")}说过的哪句话，忽然就懂了。`,
            },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // --- 阶段变化：跨段那天说一句 ---------------------------------------------

    /**
     * 挂 `modern.year_passed`（现代世界每年结算一次时发出的事件），不是
     * `modern.tick_year`（那是命令名，不是事件名）。挂错名字的后果是静默的：
     * 规则永远不会被触发，阶段也就永远记不下来。
     */
    ctx.registerReactionRule({
      id: "life-stages.year_passed.stage", eventType: "modern.year_passed",
      react: (c): Effect[] => {
        const effects: Effect[] = [];
        for (const person of c.world.listEntities({ kind: "modern.character" })) {
          if (person.archivedAt !== undefined) continue;
          const stage = stageOf(c.world, person.id);
          const prev = String(obj(person.components[StageComponents.stage]).stage ?? "");
          if (prev === stage.id) continue;
          effects.push(
            writeStage(person.id, { stage: stage.id, since: c.world.tick }, "a new stage of life"),
            {
              kind: "emitEvent", eventType: "life-stages.entered", actorId: person.id,
              data: { stage: stage.id, name: stage.name, age: ageOf(c.world, person.id), mood: stage.mood },
              historicalSignificance: 0.15,
            },
          );
        }
        return effects;
      },
    });

    // --- 投影 -----------------------------------------------------------------

    ctx.registerProjection({
      id: StageProjections.life,
      description: "这一生现在在哪一段、这一段能做哪些事、还有没有遗言在身上。",
      build: ({ world, params }) => {
        const me = String(params.actorId ?? playerId(world));
        if (!me || !world.hasEntity(me)) return { exists: false, actorId: me };
        const stage = stageOf(world, me);
        const words = world.getComponent(me, StageComponents.lastWords);
        const tutelage = obj(world.getComponent(me, StageComponents.tutelage));
        return {
          exists: true,
          actorId: me,
          age: ageOf(world, me),
          stage: { id: stage.id, name: stage.name, mood: stage.mood },
          stages: STAGES.map((s) => ({
            id: s.id, name: s.name, from: s.from,
            to: Number.isFinite(s.to) ? s.to : null,
            here: s.id === stage.id,
          })),
          actions: stage.actions.map((id) => ({ id, enabled: true })),
          /** 别段的动作也列出来，但标成「现在做不了」——玩家看得到这一生的形状。 */
          locked: STAGES.filter((s) => s.id !== stage.id)
            .flatMap((s) => s.actions.map((id) => ({ id, stage: s.name }))),
          deeds: deeds(world, me),
          lastWords: words ? lastWordsOf(words) : null,
          tutelage: Number(tutelage.times ?? 0) > 0 ? { times: Number(tutelage.times), from: String(tutelage.from ?? "") } : null,
        };
      },
    });
  },
};

/**
 * 收集遗言：他最放不下的那件心愿、他确知的心事里的一部分、他手上的那门活。
 *
 * 只传「确知」的，不传「听说」的——道听途说算不上遗言。最多三件，因为一个人
 * 临终记得住的也就那么几件。
 */
function collectLastWords(world: WorldView, from: string, heir: string, hasSecrets: boolean, hasWants: boolean): LastWords {
  const unfinished = hasWants ? unfinishedWish(world, from) : "";
  const secrets = hasSecrets ? confirmedSecrets(world, from) : [];
  return {
    from,
    fromName: nameOf(world, from),
    at: world.tick,
    unfinished: unfinished || "这一生没什么没做完的事。",
    secrets: secrets.slice(0, 3),
    craft: craftOf(world, from),
  };
}

/** 他这一季/这一生还没着落的那件心愿（读 village-wants 的组件，只读）。 */
function unfinishedWish(world: WorldView, id: string): string {
  const wish = obj(world.getComponent(id, "village-wants.wish"));
  if (!wish.wishId || wish.fulfilledAt !== undefined) return "";
  return String(wish.text ?? wish.wishId ?? "");
}

/** 遗言在投影里只需要这几项；拆出来让 tsc 能把 `words` 收窄成对象。 */
function lastWordsOf(words: unknown): {
  from: string; fromName: string; unfinished: string; craft: string; secrets: number;
} {
  const w = obj(words);
  const secrets = obj(w.secrets);
  const kept = Array.isArray(w.secrets) ? w.secrets.length : Object.keys(secrets).length;
  return {
    from: String(w.from ?? ""),
    fromName: String(w.fromName ?? ""),
    unfinished: String(w.unfinished ?? ""),
    craft: String(w.craft ?? ""),
    secrets: kept,
  };
}

/** 他确知的心事（读 village-secrets 的组件，只读；只听说的不算）。 */
function confirmedSecrets(world: WorldView, id: string): LastWords["secrets"] {
  const entries = obj(world.getComponent(id, "village-secrets.known")?.entries);
  const out: LastWords["secrets"] = [];
  for (const entry of Object.values(entries)) {
    const e = obj(entry);
    if (e.stage !== "known") continue;
    out.push({
      secretId: String(e.secretId ?? ""),
      ownerKey: String(e.ownerKey ?? ""),
      ownerName: nameOf(world, residentId(String(e.ownerKey ?? ""))),
      text: String(e.text ?? ""),
    });
  }
  // 确定性排序：同一份世界状态，永远交出同样三件。
  return out.sort((a, b) => a.secretId.localeCompare(b.secretId));
}

/** 他手上的那门活：从聚落记的技能里取最后一个。 */
function craftOf(world: WorldView, id: string): string {
  const skills = world.getComponent(id, SettlementComponents.holding)?.skills;
  if (Array.isArray(skills) && skills.length) return String(skills[skills.length - 1]);
  return "手上的活";
}
