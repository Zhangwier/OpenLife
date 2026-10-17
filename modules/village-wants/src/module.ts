/**
 * 愿望与恐惧：一个人怕什么，这一季又想要什么。
 *
 * 聚落里原本已经有一个「心愿」（`resident.wish`，写死在数据包里的长期心愿，
 * 靠送礼或陪着干活来实现）。这个模块补的是两件它没有的事：
 *
 *   1. **恐惧**——怕水、怕孤老、怕被人看不起、怕挨饿。它不是一句性格描写，
 *      而是会真的改变行为：走到怕的地方心情往下掉；心情低到一定程度就干不动
 *      活、动了离村的念头；怕水的人在河边连水都只能一瓢一瓢地取。
 *   2. **短期愿望**——每季换一个（想要一件新披、想学一门手艺）。满足了就高兴，
 *      没满足也不罚：它给的是「这一季有个由头」，不是任务清单。
 *
 * 两条边界，先说清楚：
 *   - 心情是**我们自己**的账（`village-wants.mood`），不去改聚落的交情/怨气。
 *     「满足后交情上升」是真的交情在动：满足愿望的那件事（送礼、搭话、搭把手、
 *     学艺）本来就是聚落自己的规则在加交情，我们只负责认出来「这一季有着落了」，
 *     再让他的心情往上走一格。
 *   - 恐惧对玩家同样生效：出身决定一个恐惧，落在文案与代价上（在怕的地方、心情
 *     又低的时候，一次只能取一点水）。
 */
import type { ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import {
  RIVER_TERRACE_PACK, SettlementComponents, residentId, seasonOf, yieldPoints,
} from "@openlife/module-settlement-locations";
import {
  FEARS, MOOD_MAX, WANTS_PACK, WISHES, fearById, wishById, wantsProblems, type FearSpec, type WishSpec,
} from "./spec.ts";

const OWNER = "village-wants";
const CAPABILITY = "life.wants";

export const WantComponents = {
  /** 这个人怕什么。 */
  fear: "village-wants.fear",
  /** 心情账：0..10，10 最好。 */
  mood: "village-wants.mood",
  /** 这一季的短期愿望。 */
  wish: "village-wants.wish",
} as const;

export const WantCommands = {
  /** 给某人定下一个恐惧（出身定玩家，建村时定村民）。 */
  assignFear: "village-wants.assign_fear",
  /** 心情变化：触发恐惧、愿望有着落、日子顺过来，都走这一条。 */
  feel: "village-wants.feel",
  /** 换季：给每个人换一个新愿望。 */
  rollWish: "village-wants.roll_wish",
} as const;

export const WantProjections = {
  /** 某个人怕什么、心情如何、这一季想要什么。 */
  person: "village-wants.person",
  /** 玩家的恐惧：哪些地方的文案会变、代价是什么。 */
  player: "village-wants.player",
} as const;

export const WantRejection = "E_WANT_NOT_NOW";
const refuse = (message: string): ConstraintOutcome => ({ ok: false, code: WantRejection, message });

/** 心情的平常值：不低于它就不算「低落」。 */
export const MOOD_BASELINE = 7;
/** 平静的一天最多恢复多少。 */
export const MOOD_RECOVERY = 1;
/** 心情低于这个数，怕水的人在河边只能一瓢一瓢取。 */
export const TIMID_DRAW_BELOW = 4;
/** 一季 90 天（与聚落的季节读数一致）。 */
export const SEASON_DAYS = 90;

export interface MoodState { level: number; updatedAt: number; cause: string }
export interface FearState { fearId: string; since: number }
export interface WishState {
  /** 「年:季」这样的季名，换季就换一个愿望。 */
  season: string;
  wishId: string;
  generatedAt: number;
  fulfilledAt?: number;
  fulfilledBy?: string;
}

const obj = (v: unknown): Record<string, JsonValue> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, JsonValue> : {};

const clampMood = (n: number) => Math.max(0, Math.min(MOOD_MAX, Math.round(n)));

export function moodOf(world: WorldView, id: string): MoodState {
  const raw = obj(world.getComponent(id, WantComponents.mood));
  return {
    level: clampMood(Number(raw.level ?? MOOD_BASELINE)),
    updatedAt: Number(raw.updatedAt ?? -1),
    cause: String(raw.cause ?? ""),
  };
}

export function fearOf(world: WorldView, id: string): FearState | undefined {
  const raw = world.getComponent(id, WantComponents.fear);
  return raw ? { fearId: String(raw.fearId ?? ""), since: Number(raw.since ?? -1) } : undefined;
}

export function wishOf(world: WorldView, id: string): WishState | undefined {
  const raw = world.getComponent(id, WantComponents.wish);
  if (!raw) return undefined;
  return {
    season: String(raw.season ?? ""), wishId: String(raw.wishId ?? ""), generatedAt: Number(raw.generatedAt ?? -1),
    ...(raw.fulfilledAt !== undefined ? { fulfilledAt: Number(raw.fulfilledAt) } : {}),
    ...(raw.fulfilledBy !== undefined ? { fulfilledBy: String(raw.fulfilledBy) } : {}),
  };
}

const writeMood = (id: string, mood: MoodState, reason: string): Effect => ({
  kind: "setComponent", entityId: id, component: WantComponents.mood,
  value: mood as unknown as Record<string, JsonValue>, reason,
});
const writeWish = (id: string, wish: WishState, reason: string): Effect => ({
  kind: "setComponent", entityId: id, component: WantComponents.wish,
  value: wish as unknown as Record<string, JsonValue>, reason,
});

export const seasonKey = (tick: number) => `${Math.floor(tick / (SEASON_DAYS * 4))}:${seasonOf(tick)}`;
const isPlayer = (world: WorldView, id: string) =>
  String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "") === id;
const isVillager = (world: WorldView, id: string) => Boolean(world.getComponent(id, SettlementComponents.resident));

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

/**
 * 饿了没有。
 *
 * 聚落的 `hungerLevel()` 是内部函数（`hunger-toll.ts`），没有从包入口导出，
 * 别的模块拿不到。这里只读聚落自己写在组件里的那份底数（`hunger`），够用了：
 * 恐惧要判断的是「他是不是一直空着肚子」，不是精确到第几天。
 */
function hungerish(world: WorldView, id: string): number {
  const resident = obj(world.getComponent(id, SettlementComponents.resident));
  const holding = obj(world.getComponent(id, SettlementComponents.holding));
  return Math.max(Number(resident.hunger ?? 0), Number(holding.hunger ?? 0));
}

/** 恐惧此刻是否被情境触发；触发就返回一句「因为什么」。 */
export function fearTriggered(world: WorldView, id: string, fear: FearSpec, eventType?: string): string {
  for (const trigger of fear.triggers) {
    if (trigger.kind === "place" && occupiedPlaceId(world, id) === trigger.placeId) {
      return `在${RIVER_TERRACE_PACK.places.find((p) => p.id === trigger.placeId)?.name ?? "那里"}`;
    }
    if (trigger.kind === "event" && eventType && eventType === trigger.eventType) return eventType;
    if (trigger.kind === "hunger" && hungerish(world, id) >= trigger.atLeast) return "空着肚子";
    if (trigger.kind === "stockBelow") {
      const total = yieldPoints(world).filter((y) => y.resourceId === trigger.resourceId).reduce((n, y) => n + y.stock, 0);
      if (total < trigger.amount) return "村里的粮见了底";
    }
    if (trigger.kind === "alone") {
      // 「孤老」：一个人待着，也没有家里人。
      const here = occupiedPlaceId(world, id);
      const others = here ? RIVER_TERRACE_PACK.residents.filter((r) => occupiedPlaceId(world, residentId(r.key)) === here).length : 0;
      const kin = world.listRelations({ type: "family.married_to", from: id }).length
        + world.listRelations({ type: "family.parent_of", from: id }).length
        + world.listRelations({ type: "family.parent_of", to: id }).length;
      if (here && others === 0 && kin === 0) return "一个人待着";
    }
  }
  return "";
}

/** 心情掉一格，并说清为什么。已经到 0 就不再掉。 */
function dropEffects(world: WorldView, id: string, drop: number, cause: string): { effects: Effect[]; level: number } {
  const mood = moodOf(world, id);
  const level = clampMood(mood.level - drop);
  if (level === mood.level) return { effects: [], level };
  return {
    level,
    effects: [
      writeMood(id, { level, updatedAt: world.tick, cause }, `fear triggered: ${cause}`),
      {
        kind: "emitEvent", eventType: "village-wants.mood_fell", actorId: id,
        data: { level, from: mood.level, drop, cause },
        historicalSignificance: 0.01,
      },
    ],
  };
}

/** 这一季的愿望（按确定性散列抽：同一个世界、同一个人、同一季，永远同一个）。 */
export function wishFor(id: string, key: string): WishSpec {
  return WISHES[hashKey(`${id}:${key}`) % WISHES.length]!;
}

/** 建村时按确定性散列给每人分配一个恐惧。 */
export function fearFor(id: string): FearSpec {
  return FEARS[hashKey(`fear:${id}`) % FEARS.length]!;
}

export const villageWantsModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "愿望与恐惧",
    description: "Fears that actually change behaviour, and one short-term wish per season that is a reason to live, not a checklist.",
    provides: [CAPABILITY],
    requires: ["life.settlement"],
    optional: ["settlement.secrets", "settlement.stories"],
    capabilities: [
      "component.register", "command.register",
      "rule.constraint.register", "rule.resolution.register", "rule.reaction.register",
      "schedule.register", "projection.register",
    ],
  },

  register(ctx) {
    const problems = wantsProblems(undefined, {
      places: RIVER_TERRACE_PACK.places.map((p) => p.id),
      resources: Object.keys(RIVER_TERRACE_PACK.resourceLabels),
      origins: (RIVER_TERRACE_PACK.origins ?? []).map((o) => o.id),
    });
    if (problems.length) throw new Error(`village-wants data is invalid:\n${problems.join("\n")}`);

    ctx.registerComponent({ id: WantComponents.fear, persist: true, description: "What this person is afraid of." });
    ctx.registerComponent({ id: WantComponents.mood, persist: true, description: "This person's mood, 0..10, with the last cause." });
    ctx.registerComponent({ id: WantComponents.wish, persist: true, description: "This season's short-term wish and whether it came true." });
    for (const type of Object.values(WantCommands)) ctx.registerCommand({ type });

    // --- 定下恐惧 -------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${WantCommands.assignFear}.allowed`, commandType: WantCommands.assignFear,
      evaluate: (c) => {
        const id = c.command.actorId ?? "";
        const fear = fearById(String(c.command.payload.fearId ?? ""));
        if (!id || !c.world.hasEntity(id)) return refuse("没有这个人。");
        if (!fear) return refuse("没有这一类恐惧。");
        if (fearOf(c.world, id)) return refuse("一个人只会带着一个恐惧。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${WantCommands.assignFear}.resolve`, commandType: WantCommands.assignFear,
      resolve: (c) => {
        const id = c.command.actorId as string;
        const fear = fearById(String(c.command.payload.fearId))!;
        return [{
          kind: "setComponent", entityId: id, component: WantComponents.fear,
          value: { fearId: fear.id, since: c.world.tick } as unknown as Record<string, JsonValue>,
          reason: "a fear takes root",
        }, {
          kind: "emitEvent", eventType: "village-wants.fear_assigned", actorId: id,
          data: { fearId: fear.id, name: fear.name, text: fear.text }, historicalSignificance: 0.05,
        }];
      },
    });

    // --- 心情：变化、恢复 -----------------------------------------------------

    ctx.registerResolutionRule({
      id: `${WantCommands.feel}.resolve`, commandType: WantCommands.feel,
      resolve: (c) => {
        const id = c.command.actorId as string;
        const mood = moodOf(c.world, id);
        const level = clampMood(mood.level + Number(c.command.payload.delta ?? 0));
        return [writeMood(id, { level, updatedAt: c.world.tick, cause: String(c.command.payload.cause ?? "") }, "mood moved")];
      },
    });

    /**
     * 恐惧被情境撞上：心情掉一格。
     *
     * 挂真实入口，不挂「每天检查一次」——心情该由发生的事推动，而不是由时钟推动。
     */
    for (const [id, eventType] of [
      ["village-wants.fear.arrived", "settlement-locations.arrived"],
      ["village-wants.fear.passed_away", "modern.character_died"],
      ["village-wants.fear.exposed", "village-secrets.exposed"],
      ["village-wants.fear.refused", "settlement-locations.help_refused"],
    ] as const) {
      ctx.registerReactionRule({
        id, eventType,
        react: (c): Effect[] => {
          const who = c.event.actorId ?? "";
          if (!who) return [];
          const fear = fearOf(c.world, who);
          if (!fear) return [];
          const spec = fearById(fear.fearId);
          if (!spec) return [];
          const cause = fearTriggered(c.world, who, spec, c.event.type);
          if (!cause) return [];
          const { effects, level } = dropEffects(c.world, who, spec.moodDrop, cause);
          // 严重时：动了离村的念头。这是真的后果，不是一句形容词。
          if (level <= spec.leaveVillageBelow && isVillager(c.world, who)) {
            effects.push({
              kind: "emitEvent", eventType: "village-wants.thought_of_leaving", actorId: who,
              data: {
                fearId: spec.id, level,
                line: `${String(c.world.getEntity(who)?.name ?? "他")}这几天话少了，眼睛总往渡口那边看。`,
              },
              historicalSignificance: 0.2,
            });
          }
          return effects;
        },
      });
    }

    /** 平静的一天：心情慢慢回到平常值。触发着、或者饿着的，恢复不了。 */
    ctx.registerReactionRule({
      id: "village-wants.day_passed.recover", eventType: "settlement-locations.day_passed",
      react: (c): Effect[] => {
        const effects: Effect[] = [];
        for (const person of c.world.listEntities()) {
          if (person.archivedAt !== undefined) continue;
          const mood = moodOf(c.world, person.id);
          if (mood.updatedAt < 0) continue;
          const fear = fearOf(c.world, person.id);
          const spec = fear ? fearById(fear.fearId) : undefined;
          if (spec && fearTriggered(c.world, person.id, spec)) continue;
          if (hungerish(c.world, person.id) >= 6) continue;
          if (mood.level >= MOOD_BASELINE) continue;
          effects.push(writeMood(person.id, {
            level: clampMood(mood.level + MOOD_RECOVERY), updatedAt: c.world.tick, cause: "",
          }, "a quiet day"));
        }
        return effects;
      },
    });

    // --- 短期愿望 -------------------------------------------------------------

    ctx.registerConstraintRule({
      id: `${WantCommands.rollWish}.allowed`, commandType: WantCommands.rollWish,
      evaluate: (c) => {
        const id = c.command.actorId ?? "";
        if (!id || !c.world.hasEntity(id)) return refuse("没有这个人。");
        if (isPlayer(c.world, id) && !occupiedPlaceId(c.world, id)) return refuse("先在村里落了脚，才谈得上这一季想要什么。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${WantCommands.rollWish}.resolve`, commandType: WantCommands.rollWish,
      resolve: (c) => {
        const id = c.command.actorId as string;
        const key = seasonKey(c.world.tick);
        if (wishOf(c.world, id)?.season === key) return [];
        const wish = wishFor(id, key);
        return [writeWish(id, { season: key, wishId: wish.id, generatedAt: c.world.tick }, "this season's small wish"), {
          kind: "emitEvent", eventType: "village-wants.wish_formed", actorId: id,
          data: { wishId: wish.id, season: key, text: wish.text }, historicalSignificance: 0.01,
        }];
      },
    });

    /**
     * 愿望怎么算满足：认聚落**自己**的事件，不另造一套记账。
     *
     * 这些事件本来就会让对方对你的交情上升（送礼、搭话、搭把手、学艺），所以
     * 「满足后交情上升」是真的交情在动，不是我们写的假数；我们只补上他自己这
     * 一边的回报（心情 +2）。
     */
    const FULFILS: Array<{ suffix: string; eventType: string; match: (wish: WishSpec, data: Record<string, JsonValue>) => boolean }> = [
      {
        suffix: "gift", eventType: "settlement-locations.gift_received",
        match: (wish, data) => wish.kind === "item" && wish.resourceId === String(data.resourceId ?? ""),
      },
      {
        suffix: "talk", eventType: "settlement-locations.conversation",
        match: (wish) => wish.kind === "deed" && wish.event === "settlement-locations.conversation",
      },
      {
        suffix: "help", eventType: "settlement-locations.hearth_helped",
        match: (wish) => wish.kind === "deed" && wish.event === "settlement-locations.hearth_helped",
      },
      {
        suffix: "lesson", eventType: "settlement-locations.lesson",
        match: (wish) => wish.kind === "deed" && wish.event === "settlement-locations.lesson",
      },
    ];
    for (const { suffix, eventType, match } of FULFILS) {
      ctx.registerReactionRule({
        id: `village-wants.fulfil.${suffix}`,
        eventType,
        react: (c): Effect[] => {
          // 事件里的 targetId 是「受益的人」——愿望是他的。
          const owner = c.event.targetId ?? "";
          if (!owner) return [];
          const wish = wishOf(c.world, owner);
          if (!wish || wish.fulfilledAt !== undefined) return [];
          const spec = wishById(wish.wishId);
          if (!spec || !match(spec, obj(c.event.data))) return [];
          const by = c.event.actorId ?? "";
          return [
            writeWish(owner, { ...wish, fulfilledAt: c.world.tick, ...(by ? { fulfilledBy: by } : {}) }, "the wish came true"),
            writeMood(owner, {
              level: clampMood(moodOf(c.world, owner).level + 2), updatedAt: c.world.tick, cause: "愿望有着落了",
            }, "a wish answered"),
            {
              kind: "emitEvent", eventType: "village-wants.wish_fulfilled", actorId: owner,
              ...(by ? { targetId: by } : {}),
              data: {
                wishId: wish.wishId, text: spec.text,
                line: `${String(c.world.getEntity(owner)?.name ?? "他")}这一季想要的，有着落了。`,
              },
              historicalSignificance: 0.05,
            },
          ];
        },
      });
    }

    // --- 玩家：出身决定恐惧 ---------------------------------------------------

    ctx.registerReactionRule({
      id: "village-wants.origin.chosen", eventType: "settlement-locations.origin_chosen",
      react: (c): Effect[] => {
        const me = c.event.actorId ?? "";
        if (!me) return [];
        const originId = String(c.event.data?.originId ?? "");
        const fear = fearById(String(WANTS_PACK.originFears?.[originId] ?? ""));
        if (!fear) return [];
        return [
          {
            kind: "setComponent", entityId: me, component: WantComponents.fear,
            value: { fearId: fear.id, since: c.world.tick } as unknown as Record<string, JsonValue>,
            reason: "where this life came from left it afraid of something",
          },
          writeMood(me, { level: MOOD_BASELINE, updatedAt: c.world.tick, cause: "" }, "a new life"),
          {
            kind: "emitEvent", eventType: "village-wants.fear_assigned", actorId: me,
            data: { fearId: fear.id, name: fear.name, text: fear.text, fromOrigin: originId },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // --- 恐惧真的改变行为 -----------------------------------------------------

    /**
     * 怕水的人在河边手会抖：心情低的时候，一次只能取一点。
     *
     * 这是「代价」落在实处——不是多一句描写，而是多跑几趟。
     */
    ctx.registerConstraintRule({
      id: "village-wants.draw.timid", commandType: "settlement-locations.draw",
      evaluate: (c) => {
        const id = c.command.actorId ?? "";
        const fear = fearOf(c.world, id);
        if (!fear) return { ok: true };
        const spec = fearById(fear.fearId);
        if (!spec) return { ok: true };
        const place = String(c.command.payload.placeId ?? occupiedPlaceId(c.world, id));
        if (!spec.avoidPlaces.includes(place)) return { ok: true };
        if (moodOf(c.world, id).level >= TIMID_DRAW_BELOW) return { ok: true };
        if (Number(c.command.payload.amount ?? 1) <= 1) return { ok: true };
        return refuse(`${spec.text}今天只敢一瓢一瓢地来。`);
      },
    });

    /**
     * 心情掉到底，活儿就干不动了。
     *
     * 只拦村民、不拦玩家——玩家还有自己的选择；村民是真的「心里过不去」。
     *
     * priority 100：聚落自己那条 tend 的校验会先报「你不在干活的位置上」，
     * 但一个心里过不去的人，站在位置上也是干不动。这条要抢在它前面说话。
     */
    ctx.registerConstraintRule({
      id: "village-wants.tend.refused", commandType: "settlement-locations.tend", priority: 100,
      evaluate: (c) => {
        const id = c.command.actorId ?? "";
        if (!isVillager(c.world, id) || isPlayer(c.world, id)) return { ok: true };
        const fear = fearOf(c.world, id);
        if (!fear) return { ok: true };
        const spec = fearById(fear.fearId);
        if (!spec) return { ok: true };
        if (moodOf(c.world, id).level > spec.refuseWorkBelow) return { ok: true };
        return refuse(`${spec.text}今天这活干不下去。`);
      },
    });

    // 建村那天：给每位村民定恐惧、抽这一季的愿望，并开始换季。
    ctx.registerReactionRule({
      id: "village-wants.founded.seed", eventType: "settlement-locations.founded",
      react: (c): Effect[] => {
        const effects: Effect[] = [];
        const key = seasonKey(c.world.tick);
        for (const resident of RIVER_TERRACE_PACK.residents) {
          const id = residentId(resident.key);
          if (!c.world.getComponent(id, SettlementComponents.resident)) continue;
          if (!fearOf(c.world, id)) {
            const fear = fearFor(id);
            effects.push({
              kind: "setComponent", entityId: id, component: WantComponents.fear,
              value: { fearId: fear.id, since: c.world.tick } as unknown as Record<string, JsonValue>,
              reason: "everyone is afraid of something",
            });
          }
          if (moodOf(c.world, id).updatedAt < 0) {
            effects.push(writeMood(id, { level: MOOD_BASELINE, updatedAt: c.world.tick, cause: "" }, "a village is founded"));
          }
          if (wishOf(c.world, id)?.season !== key) {
            const wish = wishFor(id, key);
            effects.push(writeWish(id, { season: key, wishId: wish.id, generatedAt: c.world.tick }, "this season's small wish"));
          }
        }
        effects.push({
          kind: "scheduleTask", taskType: "village-wants.season", afterTicks: SEASON_DAYS,
          everyTicks: SEASON_DAYS, dedupeKey: "village-wants.seasons",
        });
        return effects;
      },
    });

    /** 换季：每个人换一个新愿望。 */
    ctx.registerTask({
      type: "village-wants.season",
      handler: (c) => ({
        commands: RIVER_TERRACE_PACK.residents
          .map((r) => residentId(r.key))
          .filter((id) => Boolean(c.world.getComponent(id, SettlementComponents.resident)))
          .map((id) => ({ type: WantCommands.rollWish, actorId: id, payload: {}, source: "system" as const })),
      }),
    });

    // --- 投影 -----------------------------------------------------------------

    ctx.registerProjection({
      id: WantProjections.person,
      description: "某个人怕什么、心情如何、这一季想要什么。",
      build: ({ world, params }) => {
        const id = String(params.actorId ?? "");
        if (!id || !world.hasEntity(id)) return { exists: false, id };
        const fear = fearOf(world, id);
        const spec = fear ? fearById(fear.fearId) : undefined;
        const mood = moodOf(world, id);
        const wish = wishOf(world, id);
        const wishSpec = wish ? wishById(wish.wishId) : undefined;
        return {
          exists: true, id,
          fear: spec ? {
            id: spec.id, name: spec.name, text: spec.text,
            triggeredNow: Boolean(fearTriggered(world, id, spec)),
            refusesWork: mood.level <= spec.refuseWorkBelow,
            mayLeave: mood.level <= spec.leaveVillageBelow,
          } : null,
          mood: { level: mood.level, baseline: MOOD_BASELINE, cause: mood.cause },
          wish: wish && wishSpec ? {
            id: wishSpec.id, text: wishSpec.text, kind: wishSpec.kind, season: wish.season,
            label: wishSpec.label ?? "", fulfilled: wish.fulfilledAt !== undefined,
          } : null,
        };
      },
    });

    ctx.registerProjection({
      id: WantProjections.player,
      description: "玩家的恐惧：哪些地方的文案会变、代价是什么。",
      build: ({ world, params }) => {
        const me = String(params.actorId ?? "");
        const fear = fearOf(world, me);
        const spec = fear ? fearById(fear.fearId) : undefined;
        if (!spec) return { actorId: me, fear: null, places: [] };
        const mood = moodOf(world, me);
        return {
          actorId: me,
          fear: { id: spec.id, name: spec.name, text: spec.text, moodDrop: spec.moodDrop },
          mood: mood.level,
          places: spec.avoidPlaces.map((placeId) => ({
            placeId,
            name: RIVER_TERRACE_PACK.places.find((p) => p.id === placeId)?.name ?? placeId,
            note: `${spec.text}到了这里，心里就发紧。`,
            // 代价：心情低的时候只能一点一点取。
            surcharge: mood.level < TIMID_DRAW_BELOW ? "一次只能取一点" : "",
          })),
        };
      },
    });
  },
};
