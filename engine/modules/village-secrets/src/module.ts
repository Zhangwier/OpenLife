/**
 * 村里的心事：谁知道谁的什么，以及知道了以后能拿它做什么。
 *
 * 这个模块只做一件事：把「秘密」变成**有门槛的信息**。不是「系统知道、于是
 * 界面显示」——那正是 POSITIONING 里说要守住的底线。所以：
 *
 *   不知  --(一条线索)-->  听说  --(第二条线索)-->  确知
 *
 * 线索只能从三条路来：跟人打听、日久相处、亲眼看见。没有第四条。任何投影在
 * 「不知」时都不含这件心事的正文——这条由 `tests/unit/village-secrets.test.ts`
 * 用全量扫描守着，是本模块最重要的约束。
 *
 * 状态全部存在自己命名空间下：
 *   - `village-secrets.known`  挂在**观察者**身上（玩家或村民），记他听说了什么；
 *   - `village-secrets.ledger` 挂在**秘密主人**身上，记谁替他保过密、谁劝过他、
 *     谁揭发过他、谁在拿这件事要挟他。
 *
 * 跨模块的分量（交情、怨气、名声）不在我们的组件里，也不该由我们直接写
 * （INV-007）。能调对方公开命令的（social-conflict 的怨气、epistemic-state 的
 * 认知记录），就排一个任务去调；对方没有公开命令的，只记在自己的账上，并在
 * 投影里如实说明这是「记在他心里的账」，不假装改动了别人的数值。
 */
import type { CommandIntent, ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { RIVER_TERRACE_PACK, SettlementComponents, residentId } from "@openlife/module-settlement-locations";
import {
  SECRETS, secretById, secretProblems, secretsOf, type SecretSpec,
} from "./spec.ts";

const OWNER = "village-secrets";
const CAPABILITY = "settlement.secrets";

export const SecretComponents = {
  /** 观察者身上的知晓状态。 */
  known: "village-secrets.known",
  /** 秘密主人身上的人情账：保密的、劝过的、揭发的、要挟的。 */
  ledger: "village-secrets.ledger",
} as const;

export const SecretCommands = {
  /** 替人保密。 */
  keep: "village-secrets.keep",
  /** 私下劝。 */
  advise: "village-secrets.advise",
  /** 当众揭发。 */
  expose: "village-secrets.expose",
  /** 拿来要挟。 */
  extort: "village-secrets.extort",
  /** 记下一条线索（打听、相处、目击三条路最后都走这里）。 */
  learn: "village-secrets.learn",
  /** 闲话轮：每几天一次，村里人互相听说、嘴碎的往外说。由任务排出来。 */
  rumourRound: "village-secrets.rumour_round",
  /** 把揭发变成一条怨气：转调 social-conflict 自己的命令。 */
  carryGrievance: "village-secrets.carry_grievance",
  /** 确知以后，同时记一条认知层记录：转调 epistemic-state 自己的命令。 */
  recordEpistemic: "village-secrets.record_epistemic",
} as const;

export const SecretProjections = {
  /** 你知道的心事：听说只有线索，确知才有正文。 */
  known: "village-secrets.known",
  /** 某个人身上记着的账。 */
  ledger: "village-secrets.ledger",
} as const;

export const SecretRejection = "E_SECRET_NOT_YET";

const refuse = (message: string): ConstraintOutcome => ({ ok: false, code: SecretRejection, message });

/** 线索到这个数就算「确知」：两条不同的说法对上了，你才敢信。 */
export const CONFIRM_HINTS = 2;
/** 打听时对方愿意开口的门槛：交情（熟悉度）到这个数才肯讲别人家的事。 */
export const TELL_FAMILIARITY = 3;
/** 玩家自己靠相处得到线索的门槛：跟主人熟到这个程度。 */
export const BOND_FAMILIARITY = 6;
/** 闲话轮几天一次。 */
export const RUMOUR_EVERY_DAYS = 7;
/** 目击的冷却：同一个人身上，多少天内最多撞见一次。 */
export const WITNESS_COOLDOWN = 60;

export type KnowStage = "heard" | "known";

export interface KnowEntry {
  ownerKey: string;
  secretId: string;
  kind: SecretSpec["kind"];
  stage: KnowStage;
  /** 已经拿到几条线索。 */
  hints: number;
  firstHeardAt: number;
  knownAt?: number;
  /** 最后一条线索从哪儿来：ask / company / witness / rumour。 */
  source: string;
}

export interface KnownBook { entries: Record<string, KnowEntry> }

export interface LedgerEntry { at: number; count: number }
export interface SecretLedger {
  /** 谁替你保过密：这是「欠你的」。 */
  kept: Record<string, LedgerEntry>;
  /** 谁私下劝过你。 */
  advised: Record<string, LedgerEntry>;
  /** 谁当众揭发过你（可能不止一次）。 */
  exposed: Record<string, LedgerEntry>;
  /** 谁在拿这件事要挟你，以及累计几次。 */
  extorted: Record<string, LedgerEntry>;
  /** 哪几件事已经当众说破了（说了就收不回来，闲话轮不再重复）。 */
  public: Record<string, number>;
}

export interface SecretApi {
  known(world: WorldView, observerId: string): KnowEntry[];
  knows(world: WorldView, observerId: string, secretId: string): boolean;
  secretsOf(key: string): SecretSpec[];
}

// --- 读写 -------------------------------------------------------------------

const obj = (v: unknown): Record<string, JsonValue> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, JsonValue> : {};

const book = (world: WorldView, observerId: string): KnownBook => ({
  entries: { ...(obj(world.getComponent(observerId, SecretComponents.known)?.entries) as unknown as Record<string, KnowEntry>) },
});

const entryKey = (ownerKey: string, secretId: string) => `${ownerKey}|${secretId}`;

const ledger = (world: WorldView, ownerId: string): SecretLedger => {
  const raw = obj(world.getComponent(ownerId, SecretComponents.ledger));
  const pick = (v: unknown): Record<string, LedgerEntry> => ({ ...(obj(v) as unknown as Record<string, LedgerEntry>) });
  const pub: Record<string, number> = {};
  for (const [id, at] of Object.entries(obj(raw.public))) pub[id] = Number(at);
  return { kept: pick(raw.kept), advised: pick(raw.advised), exposed: pick(raw.exposed), extorted: pick(raw.extorted), public: pub };
};

const writeKnown = (observerId: string, entries: Record<string, KnowEntry>, reason: string): Effect => ({
  kind: "setComponent", entityId: observerId, component: SecretComponents.known,
  value: { entries } as unknown as Record<string, JsonValue>, reason,
});

const writeLedger = (ownerId: string, value: SecretLedger, reason: string): Effect => ({
  kind: "setComponent", entityId: ownerId, component: SecretComponents.ledger,
  value: value as unknown as Record<string, JsonValue>, reason,
});

/** 人名的唯一来源：聚落包里的 cast。读不到就叫「那个人」。 */
export function nameOf(key: string): string {
  return RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.name ?? "那个人";
}

export function fill(text: string, key: string): string {
  return text.replace(/\{owner\}/g, nameOf(key));
}

function playerId(world: WorldView): string {
  return String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
}

/** 某人记着的对另一人的交情 / 怨气（读聚落自己的社交记忆，只读，不写）。 */
function bondField(world: WorldView, personId: string, otherId: string, field: "familiarity" | "grudge"): number {
  const bonds = obj(obj(world.getComponent(personId, SettlementComponents.resident)?.social).bonds);
  return Number(obj(bonds[otherId])[field] ?? 0);
}
const familiarity = (world: WorldView, a: string, b: string) => bondField(world, a, b, "familiarity");
const grudge = (world: WorldView, a: string, b: string) => bondField(world, a, b, "grudge");

/** 稳定的确定性散列：同一个世界同一天，总是同一个结果。 */
function mix(a: number, b: number): number {
  let h = (Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 13, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

// --- 线索 -------------------------------------------------------------------

/**
 * 给某人一条线索。已经「确知」就不再给。
 *
 * 「听说」只报线索，「确知」才报正文——事件本身也守这条规矩，否则事件日志就是
 * 一条绕过界面的泄露通道。
 */
function learnEffects(
  world: WorldView, observerId: string, ownerKey: string, spec: SecretSpec, source: string, wantEpistemic: boolean,
): Effect[] {
  const current = book(world, observerId);
  const key = entryKey(ownerKey, spec.id);
  const prev = current.entries[key];
  if (prev?.stage === "known") return [];
  const hints = Math.min(CONFIRM_HINTS, (prev?.hints ?? 0) + 1);
  const stage: KnowStage = hints >= CONFIRM_HINTS ? "known" : "heard";
  const entry: KnowEntry = {
    ownerKey, secretId: spec.id, kind: spec.kind, stage, hints,
    firstHeardAt: prev?.firstHeardAt ?? world.tick,
    ...(stage === "known" ? { knownAt: world.tick } : {}),
    source,
  };
  const hint = spec.hints[Math.min(hints, spec.hints.length) - 1] ?? spec.hints[0]!;
  const effects: Effect[] = [
    writeKnown(observerId, { ...current.entries, [key]: entry }, `learned about ${spec.id} (${source})`),
    {
      kind: "emitEvent",
      eventType: stage === "known" ? "village-secrets.confirmed" : "village-secrets.hint_heard",
      actorId: observerId,
      data: stage === "known"
        ? { secretId: spec.id, ownerKey, kind: spec.kind, text: fill(spec.text, ownerKey), via: source }
        : { secretId: spec.id, ownerKey, kind: spec.kind, hint: fill(hint, ownerKey), via: source },
      visibility: "private",
      historicalSignificance: stage === "known" ? 0.15 : 0.02,
    },
  ];
  // 确知的同时，在认知层也留一条记录：这是 require cognition.epistemic-state 的
  // 真正用处——别的系统（日历、对话、图鉴）问「这个人知道什么」时有统一答案。
  if (stage === "known" && wantEpistemic) {
    effects.push({
      kind: "scheduleTask", taskType: SecretCommands.recordEpistemic, afterTicks: 1,
      payload: { holderId: observerId, secretId: spec.id },
      dedupeKey: `epistemic:${observerId}:${spec.id}`,
    });
  }
  return effects;
}

/** 观察者能不能从这个人嘴里得到一件心事：对方得知道，且这件事还不是人人都知道。 */
function tellableSecret(world: WorldView, speakerId: string, listenerId: string): { ownerKey: string; spec: SecretSpec } | undefined {
  const speakerBook = book(world, speakerId);
  const listenerBook = book(world, listenerId);
  const listenerKey = listenerId.replace(/^settlement-locations:resident:/, "");
  const candidates: { ownerKey: string; spec: SecretSpec }[] = [];
  for (const entry of Object.values(speakerBook.entries)) {
    const spec = secretById(entry.secretId);
    if (!spec) continue;
    // 自己身上的事别人不提；除非对方已经确知。
    if (entry.ownerKey === listenerKey) continue;
    if (listenerBook.entries[entryKey(entry.ownerKey, entry.secretId)]?.stage === "known") continue;
    candidates.push({ ownerKey: entry.ownerKey, spec });
  }
  if (!candidates.length) return undefined;
  return candidates[mix(hashKey(speakerId), world.tick) % candidates.length];
}

// --- 模块 -------------------------------------------------------------------

export const villageSecretsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "村里的事（秘密）",
    description: "Secrets with a knowledge threshold: unknown -> heard -> known, learned only by asking, by time together, or by witnessing.",
    provides: [CAPABILITY],
    requires: ["cognition.epistemic-state"],
    optional: ["social.conflict", "settlement.stories"],
    capabilities: [
      "component.register", "command.register",
      "rule.constraint.register", "rule.resolution.register", "rule.reaction.register",
      "schedule.register", "projection.register",
    ],
  },

  register(ctx) {
    const problems = secretProblems(undefined, RIVER_TERRACE_PACK.residents.map((r) => r.key));
    if (problems.length) throw new Error(`village-secrets data is invalid:\n${problems.join("\n")}`);

    // 软依赖只在注册时问一次，运行时不 import 对方（PLUGINS 1.3 第 3 条）。
    const hasConflict = ctx.registry.hasCapability("social.conflict");
    const hasEpistemic = ctx.registry.hasCapability("cognition.epistemic-state");

    const api: SecretApi = {
      known: (world, observerId) => Object.values(book(world, observerId).entries),
      knows: (world, observerId, secretId) =>
        Object.values(book(world, observerId).entries).some((e) => e.secretId === secretId && e.stage === "known"),
      secretsOf,
    };
    ctx.provideCapability(CAPABILITY, api);

    ctx.registerComponent({ id: SecretComponents.known, persist: true, description: "What one observer has heard or confirmed about other people's secrets." });
    ctx.registerComponent({ id: SecretComponents.ledger, persist: true, description: "The favours, warnings, exposures and threats a secret owner remembers." });
    for (const type of Object.values(SecretCommands)) ctx.registerCommand({ type });

    // --- 使用秘密：四个动作 ---------------------------------------------------

    const usable = (world: WorldView, command: CommandIntent, verb: string): ConstraintOutcome => {
      const me = command.actorId ?? "";
      const spec = secretById(String(command.payload?.secretId ?? ""));
      if (!spec) return refuse("没有这桩事。");
      if (!me || me !== playerId(world)) return refuse("只有你自己能拿主意。");
      if (!world.getComponent(residentId(spec.owner), SettlementComponents.resident)) return refuse("这个人已经不在村里了。");
      const mine = book(world, me).entries[entryKey(spec.owner, spec.id)];
      // 不知道的事，谈不上「拿它做什么」。这一句就是整条认知门槛。
      if (mine?.stage !== "known") return refuse(`你还没弄明白${nameOf(spec.owner)}的这桩事，现在${verb}只会让人莫名其妙。`);
      return { ok: true };
    };

    const atOwner = (world: WorldView, command: CommandIntent, spec: SecretSpec): boolean =>
      Boolean(occupiedPlaceId(world, command.actorId ?? "")) &&
      occupiedPlaceId(world, command.actorId ?? "") === occupiedPlaceId(world, residentId(spec.owner));

    ctx.registerConstraintRule({
      id: `${SecretCommands.keep}.allowed`, commandType: SecretCommands.keep,
      evaluate: (c) => {
        const base = usable(c.world, c.command, "替人遮掩");
        if (!base.ok) return base;
        const spec = secretById(String(c.command.payload.secretId))!;
        if (!atOwner(c.world, c.command, spec)) return refuse("得走到对方面前，才谈得上替他遮掩。");
        if (ledger(c.world, residentId(spec.owner)).kept[c.command.actorId!]) return refuse("这桩事你已经替他担过一次了。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${SecretCommands.keep}.resolve`, commandType: SecretCommands.keep,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const spec = secretById(String(c.command.payload.secretId))!;
        const owner = residentId(spec.owner);
        const l = ledger(c.world, owner);
        return [
          writeLedger(owner, { ...l, kept: { ...l.kept, [me]: { at: c.world.tick, count: (l.kept[me]?.count ?? 0) + 1 } } }, "someone chose to keep this quiet"),
          {
            kind: "emitEvent", eventType: "village-secrets.kept", actorId: me, targetId: owner,
            data: {
              secretId: spec.id, ownerKey: spec.owner, severity: spec.severity,
              // 「欠你的」是主人心里的账；这里如实记在自己的账上，不假装改了交情数值。
              line: `你没有把那件事说出去。${nameOf(spec.owner)}看了你一眼，什么也没问——但他记住了。`,
            },
            historicalSignificance: 0.1,
          },
        ];
      },
    });

    ctx.registerConstraintRule({
      id: `${SecretCommands.advise}.allowed`, commandType: SecretCommands.advise,
      evaluate: (c) => {
        const base = usable(c.world, c.command, "开口劝他");
        if (!base.ok) return base;
        const spec = secretById(String(c.command.payload.secretId))!;
        if (!atOwner(c.world, c.command, spec)) return refuse("劝人得当面说。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${SecretCommands.advise}.resolve`, commandType: SecretCommands.advise,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const spec = secretById(String(c.command.payload.secretId))!;
        const owner = residentId(spec.owner);
        const l = ledger(c.world, owner);
        // 视脾性：心胸宽的人听得进，面子薄的当场翻脸。这里用「他原本就记恨你」
        // 当脾性代理——心里有火的人，你说什么都像在揭他。
        const sore = grudge(c.world, owner, me) >= 2;
        const mended = !sore && spec.severity <= 2;
        return [
          writeLedger(owner, { ...l, advised: { ...l.advised, [me]: { at: c.world.tick, count: (l.advised[me]?.count ?? 0) + 1 } } }, "someone spoke to them privately"),
          {
            kind: "emitEvent", eventType: mended ? "village-secrets.advised_well" : "village-secrets.advised_badly",
            actorId: me, targetId: owner,
            data: {
              secretId: spec.id, ownerKey: spec.owner, severity: spec.severity,
              outcome: mended ? "mended" : "shamed",
              line: mended
                ? `你把话绕到那件事上，说得很轻。${nameOf(spec.owner)}沉默了很久，说：“我知道。”`
                : `你把话绕到那件事上。${nameOf(spec.owner)}脸一下子沉了：“你听谁说的？”`,
            },
            historicalSignificance: 0.12,
          },
        ];
      },
    });

    ctx.registerConstraintRule({
      id: `${SecretCommands.expose}.allowed`, commandType: SecretCommands.expose,
      evaluate: (c) => {
        const base = usable(c.world, c.command, "当众说破");
        if (!base.ok) return base;
        const spec = secretById(String(c.command.payload.secretId))!;
        const place = occupiedPlaceId(c.world, c.command.actorId ?? "");
        // 当众：得有个「众」——同一处至少还有两个村民在听。
        const audience = RIVER_TERRACE_PACK.residents
          .filter((r) => r.key !== spec.owner && occupiedPlaceId(c.world, residentId(r.key)) === place);
        if (!place || audience.length < 2) return refuse("当众说破，得有人在场听着。");
        const l = ledger(c.world, residentId(spec.owner));
        const last = l.exposed[c.command.actorId!];
        if (last && c.world.tick - last.at < 30) return refuse("同一件事翻来覆去说，村里人只会觉得你刻薄。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${SecretCommands.expose}.resolve`, commandType: SecretCommands.expose,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const spec = secretById(String(c.command.payload.secretId))!;
        const owner = residentId(spec.owner);
        const l = ledger(c.world, owner);
        const effects: Effect[] = [
          writeLedger(owner, {
            ...l,
            exposed: { ...l.exposed, [me]: { at: c.world.tick, count: (l.exposed[me]?.count ?? 0) + 1 } },
            // 说破就是说破了：这件事从此是村里公开的事，闲话轮不该再「揭发」一次。
            public: { ...l.public, [spec.id]: c.world.tick },
          }, "named in front of the village"),
          {
            kind: "emitEvent", eventType: "village-secrets.exposed", actorId: me, targetId: owner,
            data: {
              secretId: spec.id, ownerKey: spec.owner, kind: spec.kind, severity: spec.severity,
              text: fill(spec.text, spec.owner),
              line: `你把那件事当着人说了出来。${nameOf(spec.owner)}站在原地没动，周围的人都不说话了。`,
            },
            historicalSignificance: 0.3,
          },
        ];
        // 可能触发争执：这件事交给 social-conflict 自己的命令去记，不直接写它的组件。
        // 内核的任务处理器只能返回命令、不能返回效果，所以这里排一个任务转调。
        if (hasConflict) {
          effects.push({
            kind: "scheduleTask", taskType: SecretCommands.carryGrievance, afterTicks: 1,
            payload: {
              holderId: owner, targetId: me,
              cause: `village-secrets.exposed:${spec.id}`,
              severity: Math.min(1, 0.15 * spec.severity),
            },
            dedupeKey: `grievance:${owner}:${me}:${spec.id}:${c.world.tick}`,
          });
        }
        return effects;
      },
    });

    ctx.registerConstraintRule({
      id: `${SecretCommands.extort}.allowed`, commandType: SecretCommands.extort,
      evaluate: (c) => {
        const base = usable(c.world, c.command, "拿它换东西");
        if (!base.ok) return base;
        const spec = secretById(String(c.command.payload.secretId))!;
        if (!atOwner(c.world, c.command, spec)) return refuse("要挟得当面开口。");
        // 已经揭发过的，再要挟就没人怕了。
        if (ledger(c.world, residentId(spec.owner)).exposed[c.command.actorId!]) return refuse("话已经说出去了，再拿它换东西，只会显得可笑。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${SecretCommands.extort}.resolve`, commandType: SecretCommands.extort,
      resolve: (c) => {
        const me = c.command.actorId as string;
        const spec = secretById(String(c.command.payload.secretId))!;
        const owner = residentId(spec.owner);
        const l = ledger(c.world, owner);
        const count = (l.extorted[me]?.count ?? 0) + 1;
        return [
          writeLedger(owner, { ...l, extorted: { ...l.extorted, [me]: { at: c.world.tick, count } } }, "someone is holding this over them"),
          {
            kind: "emitEvent", eventType: "village-secrets.extorted", actorId: me, targetId: owner,
            data: {
              secretId: spec.id, ownerKey: spec.owner, severity: spec.severity, times: count,
              // 怨气是累积的：每要挟一次叠一层，投影读这个数。
              grudge: Math.min(10, count * spec.severity),
              line: `你没有把话说满。${nameOf(spec.owner)}听懂了，把手里的东西推了过来，没看你。`,
            },
            historicalSignificance: 0.2,
          },
        ];
      },
    });

    // --- 线索：打听 / 相处 / 目击 ---------------------------------------------

    ctx.registerConstraintRule({
      id: `${SecretCommands.learn}.allowed`, commandType: SecretCommands.learn,
      evaluate: (c) => {
        const me = c.command.actorId ?? "";
        const ownerKey = String(c.command.payload.ownerKey ?? "");
        const spec = secretById(String(c.command.payload.secretId ?? ""));
        if (!me || !c.world.hasEntity(me)) return refuse("没有这个人。");
        if (!spec) return refuse("没有这桩事。");
        if (spec.owner !== ownerKey) return refuse("对不上是谁的事。");
        const source = String(c.command.payload.source ?? "ask");
        if (!["ask", "company", "witness", "rumour"].includes(source)) return refuse("线索来路不明。");
        if (source === "witness" && occupiedPlaceId(c.world, me) !== occupiedPlaceId(c.world, residentId(ownerKey)))
          return refuse("你不在场，谈不上看见。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${SecretCommands.learn}.resolve`, commandType: SecretCommands.learn,
      resolve: (c) => {
        const spec = secretById(String(c.command.payload.secretId))!;
        return learnEffects(c.world, c.command.actorId as string, spec.owner, spec,
          String(c.command.payload.source ?? "ask"), hasEpistemic);
      },
    });

    // 途径一：打听。聚落那边的 `ask_about` 话题是写死的（谁病着、谁过生日、谁缺粮、
    // 年景），而它所在的 module.ts 卡在行数上限上，不能再加一个话题。所以这里挂同
    // 一条命令发出的事件：问完村里的事，若对方跟你够熟、又恰好知道别人的什么，就
    // 顺口带一句。这正是文档里「被问者信任你且知情时透露线索」。
    ctx.registerReactionRule({
      id: "village-secrets.ask_about.rumour", eventType: "settlement-locations.asked_about",
      react: (c): Effect[] => {
        const asker = c.event.actorId ?? "";
        const speaker = c.event.targetId ?? "";
        if (!asker || !speaker || asker === speaker) return [];
        if (familiarity(c.world, speaker, asker) < TELL_FAMILIARITY) return [];
        const found = tellableSecret(c.world, speaker, asker);
        if (!found) return [];
        return learnEffects(c.world, asker, found.ownerKey, found.spec, "ask", hasEpistemic);
      },
    });

    // 途径二：日久相处。一季过去，跟主人熟到一定程度，总会露出点什么。
    ctx.registerReactionRule({
      id: "village-secrets.season.company", eventType: "settlement-locations.season_lived",
      react: (c): Effect[] => {
        const me = c.event.actorId ?? "";
        if (!me) return [];
        const effects: Effect[] = [];
        for (const spec of SECRETS) {
          const owner = residentId(spec.owner);
          if (!c.world.getComponent(owner, SettlementComponents.resident)) continue;
          if (familiarity(c.world, owner, me) < BOND_FAMILIARITY) continue;
          effects.push(...learnEffects(c.world, me, spec.owner, spec, "company", hasEpistemic));
        }
        return effects;
      },
    });

    // 途径三：目击。走到某处，正好撞见主人在做那件不该被看见的事。
    // 一天最多一次，同一个人身上 60 天内最多一次——「撞见」不该变成刷线索。
    ctx.registerReactionRule({
      id: "village-secrets.arrived.witness", eventType: "settlement-locations.arrived",
      react: (c): Effect[] => {
        const me = c.event.actorId ?? "";
        if (!me || me !== playerId(c.world)) return [];
        const place = occupiedPlaceId(c.world, me);
        if (!place) return [];
        const candidates = SECRETS.filter((spec) => {
          const owner = residentId(spec.owner);
          return Boolean(c.world.getComponent(owner, SettlementComponents.resident))
            && occupiedPlaceId(c.world, owner) === place
            && book(c.world, me).entries[entryKey(spec.owner, spec.id)]?.stage !== "known";
        });
        if (!candidates.length) return [];
        const day = Math.floor(c.world.tick);
        const spec = candidates[mix(hashKey(`${me}:${place}`), day) % candidates.length]!;
        // 大约每 3 天撞见一次；用同一个散列，重放完全一致。
        if (mix(hashKey(`witness:${me}:${spec.owner}:${spec.id}`), day) % 3 !== 0) return [];
        return learnEffects(c.world, me, spec.owner, spec, "witness", hasEpistemic);
      },
    });

    // --- 闲话轮：村民之间互相听说，嘴碎的往外说 ------------------------------

    /**
     * 内核的任务处理器只能返回**命令**，不能返回效果（contracts/module.ts
     * TaskOutcome），所以这一轮的实际工作放在同名命令的解析规则里，任务只负责
     * 按周排它。
     */
    ctx.registerTask({
      type: SecretCommands.rumourRound,
      handler: () => ({ command: { type: SecretCommands.rumourRound, source: "system" } }),
    });
    ctx.registerResolutionRule({
      id: `${SecretCommands.rumourRound}.resolve`, commandType: SecretCommands.rumourRound,
      resolve: (c): Effect[] => {
        const effects: Effect[] = [];
        const living = RIVER_TERRACE_PACK.residents
          .map((r) => r.key)
          .filter((key) => Boolean(c.world.getComponent(residentId(key), SettlementComponents.resident)));
        const week = Math.floor(c.world.tick / RUMOUR_EVERY_DAYS);

        // 1. 同住、同工的人，日子久了总会知道彼此的事。
        //
        // 一轮只让每个人从**一个**身边人那儿听**一件**事，不是「全村一次全知道」：
        // 心事该一件一件地渗出来，五年下来自然够了；一轮就把所有人的事翻一遍，
        // 既不真实，也让事件量炸掉（一次事务 512 条事件的上限）。
        for (const key of living) {
          const self = residentId(key);
          const mine = RIVER_TERRACE_PACK.residents.find((r) => r.key === key)!;
          const close = living.filter((other) => {
            if (other === key) return false;
            const theirs = RIVER_TERRACE_PACK.residents.find((r) => r.key === other)!;
            return mine.homeSpace === theirs.homeSpace || mine.workPlace === theirs.workPlace;
          });
          if (!close.length) continue;
          // 注意 mix() 返回的是完整 32 位散列，取值前必须自己对长度取模。
          const who = close[mix(hashKey(`${self}:${week}`), close.length) % close.length]!;
          const pool = secretsOf(who).filter((spec) =>
            book(c.world, self).entries[entryKey(who, spec.id)]?.stage !== "known");
          if (!pool.length) continue;
          const spec = pool[mix(hashKey(`${self}:${who}:${week}`), pool.length) % pool.length]!;
          effects.push(...learnEffects(c.world, self, who, spec, "company", hasEpistemic));
        }

        // 2. 嘴不严的人把已经确知的事说出去——这就是「五年里至少有一件心事自然被揭发」。
        for (const key of living) {
          const self = residentId(key);
          const sociability = Number(RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.personality?.sociability ?? 50);
          for (const entry of Object.values(book(c.world, self).entries)) {
            if (entry.stage !== "known") continue;
            const spec = secretById(entry.secretId);
            if (!spec) continue;
            const owner = residentId(entry.ownerKey);
            if (!c.world.getComponent(owner, SettlementComponents.resident)) continue;
            // 记恨的人一定会说；嘴碎的早晚会说漏。
            const hates = grudge(c.world, self, owner) >= 2;
            const loose = sociability >= 60 && mix(hashKey(`${self}:${entry.secretId}`), c.world.tick) % 100 < 12;
            if (!hates && !loose) continue;
            const l = ledger(c.world, owner);
            // 已经当众说破的事，不会再被「揭发」第二次——村里人只会嫌你翻旧账。
            if (l.public[spec.id] !== undefined) continue;
            const last = l.exposed[self];
            if (last && c.world.tick - last.at < 120) continue;
            effects.push(
              writeLedger(owner, {
                ...l,
                exposed: { ...l.exposed, [self]: { at: c.world.tick, count: (last?.count ?? 0) + 1 } },
                public: { ...l.public, [spec.id]: c.world.tick },
              }, "let slip in front of others"),
              {
                kind: "emitEvent", eventType: "village-secrets.exposed", actorId: self, targetId: owner,
                data: {
                  secretId: spec.id, ownerKey: spec.owner, kind: spec.kind, severity: spec.severity,
                  text: fill(spec.text, spec.owner), byRumour: true,
                  line: `${nameOf(key)}在灶边把话说漏了。${nameOf(spec.owner)}那件事，一下子全村都知道了。`,
                },
                historicalSignificance: 0.3,
              },
            );
          }
        }
        return effects;
      },
    });

    // 把揭发变成 social-conflict 的一条怨气：调对方的命令，不写对方的组件。
    ctx.registerTask({
      type: SecretCommands.carryGrievance,
      handler: (c) => ({
        command: {
          type: "social-conflict.record_grievance",
          actorId: String(c.payload.holderId ?? ""),
          targetId: String(c.payload.targetId ?? ""),
          payload: { cause: String(c.payload.cause ?? "village-secrets.exposed"), severity: Number(c.payload.severity ?? 0.3) },
          source: "system",
        },
      }),
    });

    // 确知以后补一条认知层记录：转调 epistemic-state 自己的命令。
    ctx.registerTask({
      type: SecretCommands.recordEpistemic,
      handler: (c) => ({
        command: {
          type: "epistemic-state.acquire",
          actorId: String(c.payload.holderId ?? ""),
          payload: {
            canonicalKnowledgeId: String(c.payload.secretId ?? ""),
            awareness: "heard",
            stance: "accepts",
            confidence: 0.8,
            understanding: 0.5,
            basisRefs: [String(c.payload.secretId ?? "")],
            source: "village-secrets",
          },
          source: "system",
        },
      }),
    });

    // 建村那天起，闲话轮开始走。
    ctx.registerReactionRule({
      id: "village-secrets.founded.start_rumours", eventType: "settlement-locations.founded",
      react: (): Effect[] => [{
        kind: "scheduleTask", taskType: SecretCommands.rumourRound, afterTicks: RUMOUR_EVERY_DAYS,
        everyTicks: RUMOUR_EVERY_DAYS, dedupeKey: "village-secrets.rumours",
      }],
    });

    // --- 投影：这里是「不全知」的落点 -----------------------------------------

    ctx.registerProjection({
      id: SecretProjections.known,
      description: "你听说/确知的心事。不知的一条都不出现；听说的只有线索，没有正文。",
      build: ({ world, params }) => {
        const me = String(params.actorId ?? playerId(world));
        const entries = Object.values(book(world, me).entries);
        const heard = entries.filter((e) => e.stage === "heard").map((e) => {
          const spec = secretById(e.secretId)!;
          const hint = spec.hints[Math.min(e.hints, spec.hints.length) - 1] ?? spec.hints[0]!;
          return {
            secretId: e.secretId, ownerKey: e.ownerKey, ownerName: nameOf(e.ownerKey), kind: e.kind,
            stage: e.stage, hints: e.hints,
            // 只有线索。这一行下面绝不能出现 spec.text——本模块的红线。
            line: fill(hint, e.ownerKey),
            more: e.hints < CONFIRM_HINTS ? "再多听一句就能对上" : "",
          };
        });
        const known = entries.filter((e) => e.stage === "known").map((e) => {
          const spec = secretById(e.secretId)!;
          const l = ledger(world, residentId(e.ownerKey));
          return {
            secretId: e.secretId, ownerKey: e.ownerKey, ownerName: nameOf(e.ownerKey), kind: e.kind,
            stage: e.stage, hints: e.hints,
            text: fill(spec.text, e.ownerKey),
            severity: spec.severity,
            /** 你为这件事做过了什么。 */
            used: {
              kept: Boolean(l.kept[me]), advised: Boolean(l.advised[me]),
              exposed: Boolean(l.exposed[me]), extorted: Boolean(l.extorted[me]),
            },
            /** 他现在恨你到什么程度（要挟累积出来的）。 */
            theirGrudge: l.extorted[me] ? Math.min(10, l.extorted[me]!.count * spec.severity) : 0,
          };
        });
        return { actorId: me, heard, known, total: heard.length + known.length };
      },
    });

    ctx.registerProjection({
      id: SecretProjections.ledger,
      description: "某个人身上记着的账：谁替他保过密、劝过他、揭发过他、要挟过他。",
      build: ({ world, params }) => {
        const ownerId = String(params.ownerId ?? "");
        if (!ownerId || !world.getComponent(ownerId, SettlementComponents.resident)) return { exists: false, ownerId };
        const l = ledger(world, ownerId);
        const name = (id: string) => RIVER_TERRACE_PACK.residents.find((r) => residentId(r.key) === id)?.name
          ?? String(world.getComponent(id, "modern.identity")?.givenName ?? "那个人");
        return {
          exists: true, ownerId,
          kept: Object.entries(l.kept).map(([id, e]) => ({ id, name: name(id), at: e.at })),
          advised: Object.entries(l.advised).map(([id, e]) => ({ id, name: name(id), at: e.at, times: e.count })),
          exposed: Object.entries(l.exposed).map(([id, e]) => ({ id, name: name(id), at: e.at, times: e.count })),
          extorted: Object.entries(l.extorted).map(([id, e]) => ({ id, name: name(id), at: e.at, times: e.count })),
        };
      },
    });
  },
};


