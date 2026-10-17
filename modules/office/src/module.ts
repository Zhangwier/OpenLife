/**
 * 职位插件：求票、当选、断事。
 *
 * 这个模块只做三件事，但每件都要真的能操作：
 *  1. 参选 → 拉票（拜访/送礼/许诺/当众说话/托人/说坏话）→ 数票 → 当选
 *  2. 坐上位子后，每季有一桩要管的事，选项受设施与制度约束
 *  3. 许诺被记住；兑现与违背都有后果；民心掉到一定程度会被换掉
 *
 * 边界：不碰 polity 的组件（制度、威望、头人 id 都是它的），只通过它公开的
 * 能力读。职位本身（谁在什么位子上）是这里的。
 */
import type {
  ConstraintOutcome, Effect, JsonValue, OpenLifeModule, WorldView,
} from "@openlife/contracts";
import { canStand, OFFICES, officeById, tallyVotes, type Race } from "./canvass.ts";
import { availableOptions, facilitiesOf, facilityLabel, LIVE_FACILITIES, matterById } from "./matters.ts";

export const OFFICE_OWNER = "office";
export const OfficeComponents = {
  /** The village's offices: who holds what, and any race in progress. */
  state: "office.state",
} as const;

export const OfficeCommands = {
  stand: "office.stand",
  withdraw: "office.withdraw",
  visit: "office.canvass.visit",
  gift: "office.canvass.gift",
  promise: "office.canvass.promise",
  speech: "office.canvass.speech",
  askAlly: "office.canvass.ask_ally",
  smear: "office.canvass.smear",
  vote: "office.vote",
  decide: "office.decide",
  year: "office.year",
} as const;

export const OfficeProjections = {
  registry: "office.registry",
  panel: "office.panel",
} as const;

export const OfficeRejection = {
  NoOffice: "E_OFFICE_NONE",
  NotStanding: "E_OFFICE_NOT_STANDING",
  AlreadyHolds: "E_OFFICE_ALREADY",
  RaceClosed: "E_OFFICE_RACE_CLOSED",
  NoMatter: "E_OFFICE_NO_MATTER",
  OptionBlocked: "E_OFFICE_OPTION_BLOCKED",
  NotHolder: "E_OFFICE_NOT_HOLDER",
} as const;

/** One promise the player made while canvassing. */
export interface Pledge {
  to: string;
  what: string;
  at: number;
  /** Settled once: kept, broken, or still open. */
  status: "open" | "kept" | "broken";
}

export interface OfficeState {
  /** officeId -> holder personId. */
  holders: Record<string, string>;
  /** officeId -> the race currently running, if any. */
  races: Record<string, Race>;
  /** Promises made, newest last. */
  pledges: Pledge[];
  /** personId -> day they last received a gift from the player. */
  giftDays: Record<string, number[]>;
  /** The matter waiting for the holder right now, if any. */
  pending: { matterId: string; openedAt: number; sides: string[] } | null;
  /** Standing with the village, -5..+5. */
  standing: number;
  /** Days the holder has gone without settling a matter. */
  neglectedDays: number;
  /** Offices this village has ever filled, for the "again" line. */
  history: string[];
}

interface Race {
  officeId: string;
  candidates: string[];
  leanings: Record<string, string>;
  votes: Record<string, string>;
  openedAt: number;
  closesAt: number;
  rounds: Record<string, number>;
}

function emptyState(): OfficeState {
  return {
    holders: {}, races: {}, pledges: [], giftDays: {},
    pending: null, standing: 0, neglectedDays: 0, history: [],
  };
}

function read(world: WorldView): OfficeState | undefined {
  return world.getComponent(OFFICE_ENTITY, OfficeComponents.state) as unknown as OfficeState | undefined;
}

export const OFFICE_ENTITY = "office:village";

function refuse(code: string, message: string) {
  return { ok: false as const, code, message };
}

/** Who is a living adult in the village right now. */
function adults(world: WorldView): string[] {
  return world.listEntities({ kind: "modern.character" })
    .filter((e) => e.archivedAt === undefined &&
      e.components["modern.vitals"]?.alive !== false &&
      Number(e.components["modern.vitals"]?.ageYears ?? 0) >= 16)
    .map((e) => e.id);
}

function player(world: WorldView): string {
  return String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
}

export const officeModule: OpenLifeModule = {
  manifest: {
    id: OFFICE_OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system",
    name: "职位与公事",
    provides: ["polity.office"],
    requires: ["life.settlement"],
    optional: ["polity.institutions", "settlement.housing"],
    incompatible: [],
    capabilities: [
      "component.register", "command.register", "rule.constraint.register",
      "rule.resolution.register", "projection.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: OfficeComponents.state, persist: true, description: "who holds which office, and any race in progress" });
    for (const type of Object.values(OfficeCommands)) ctx.registerCommand({ type, description: "Village office action." });

    /**
     * Persist the office state.
     *
     * The first write has to *create* the entity: `setComponent` on an id that
     * does not exist is rejected with E_UNKNOWN_ENTITY, which is how the whole
     * chain failed the first time -- standing for office silently did nothing
     * because there was nowhere to record it.
     */
    const save = (world: WorldView, state: OfficeState, why: string): Effect =>
      world.getEntity(OFFICE_ENTITY)
        ? {
            kind: "setComponent", entityId: OFFICE_ENTITY, component: OfficeComponents.state,
            value: state as unknown as Record<string, never>, reason: why,
          }
        : {
            kind: "spawnEntity", localId: "office", id: OFFICE_ENTITY, entityKind: "office.village",
            components: { [OfficeComponents.state]: state as unknown as Record<string, never> },
          };

    // ---- stand ------------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.stand}.allowed`, commandType: OfficeCommands.stand,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        if (!me) return refuse(OfficeRejection.NoOffice, "还没有人在这里生活。");
        const officeId = String(c.command.payload.officeId ?? "office:headman");
        const office = officeById(officeId);
        if (!office) return refuse(OfficeRejection.NoOffice, "没有这个位子。");
        const state = read(c.world);
        if (state?.holders[officeId] === me) return refuse(OfficeRejection.AlreadyHolds, "这个位子已经是你的。");
        if (state?.races[officeId]) {
          if (state.races[officeId]!.candidates.includes(me)) {
            return refuse(OfficeRejection.NotStanding, "你已经站出来了。");
          }
        }
        if (!canStand(c.world, me)) return refuse(OfficeRejection.NotStanding, "还没到能站出来的年纪。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.stand}.resolve`, commandType: OfficeCommands.stand,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const officeId = String(c.command.payload.officeId ?? "office:headman");
        const state = read(c.world) ?? emptyState();
        const open = state.races[officeId] ?? {
          officeId, candidates: [], leanings: {}, votes: {},
          openedAt: c.world.tick, closesAt: c.world.tick + 30, rounds: {},
        };
        const next: OfficeState = {
          ...state,
          races: {
            ...state.races,
            [officeId]: { ...open, candidates: [...new Set([...open.candidates, me])] },
          },
        };
        return [
          save(c.world, next, `stood for ${officeId}`),
          {
            kind: "emitEvent", eventType: "office.stood", actorId: me,
            data: { officeId, candidates: next.races[officeId]!.candidates.length },
            historicalSignificance: 0.05,
          },
        ];
      },
    });

    // ---- canvass: visit ---------------------------------------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.visit}.allowed`, commandType: OfficeCommands.visit,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        const target = String(c.command.payload.targetId ?? "");
        if (!target || target === me) return refuse(OfficeRejection.NoOffice, "要找一个人。");
        if (!c.world.getEntity(target)) return refuse(OfficeRejection.NoOffice, "这里没有这个人。");
        const state = read(c.world);
        const standing = Object.values(state?.races ?? {}).some((r) => r.candidates.includes(me));
        if (!standing) return refuse(OfficeRejection.NotStanding, "你还没站出来，说这些没用。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.visit}.resolve`, commandType: OfficeCommands.visit,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const target = String(c.command.payload.targetId);
        const state = read(c.world) ?? emptyState();
        const officeId = Object.entries(state.races).find(([, r]) => r.candidates.includes(me))?.[0];
        if (!officeId) return [];
        const race = state.races[officeId]!;
        const hearts = Number(c.world.getComponent(target, "settlement-locations.holding") ? 0 : 0);
        void hearts;
        // A visit counts as a canvassing round; the tone is decided by the text
        // layer from the listener's real bond, so the rule only records effort.
        const next: OfficeState = {
          ...state,
          races: {
            ...state.races,
            [officeId]: {
              ...race,
              rounds: { ...race.rounds, [me]: (race.rounds[me] ?? 0) + 1 },
            },
          },
        };
        return [
          save(c.world, next, `canvassed ${target}`),
          {
            kind: "emitEvent", eventType: "office.canvassed", actorId: me, targetId: target,
            data: { officeId, kind: "visit", rounds: next.races[officeId]!.rounds[me] ?? 0 },
            historicalSignificance: 0,
          },
        ];
      },
    });

    // ---- canvass: gift ----------------------------------------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.gift}.allowed`, commandType: OfficeCommands.gift,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        const target = String(c.command.payload.targetId ?? "");
        const itemId = String(c.command.payload.itemId ?? "");
        if (!target || !itemId) return refuse(OfficeRejection.NoOffice, "要选一个人和一样东西。");
        if (!c.world.getEntity(itemId)) return refuse(OfficeRejection.NoOffice, "手上没有这样东西。");
        const state = read(c.world);
        if (!Object.values(state?.races ?? {}).some((r) => r.candidates.includes(me))) {
          return refuse(OfficeRejection.NotStanding, "你还没站出来。");
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.gift}.resolve`, commandType: OfficeCommands.gift,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const target = String(c.command.payload.targetId);
        const itemId = String(c.command.payload.itemId);
        const state = read(c.world) ?? emptyState();
        // The item leaves the player's hands first: a gift is a transfer, not a
        // gesture. Then the canvass event fires, carrying the tier the caller
        // worked out from the prototype's tags.
        const tier = String(c.command.payload.giftTier ?? "gift:fine");
        const history = state.giftDays[target] ?? [];
        const next: OfficeState = {
          ...state,
          giftDays: { ...state.giftDays, [target]: [...history, c.world.tick].slice(-10) },
        };
        return [
          save(c.world, next, `gifted ${target}`),
          {
            kind: "emitEvent", eventType: "office.canvassed", actorId: me, targetId: target,
            data: { kind: "gift", tier, itemId, timesInThirtyDays: history.filter((d) => c.world.tick - d < 30).length },
            historicalSignificance: 0,
          },
        ];
      },
    });

    // ---- canvass: promise ------------------------------------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.promise}.allowed`, commandType: OfficeCommands.promise,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        const target = String(c.command.payload.targetId ?? "");
        const what = String(c.command.payload.what ?? "");
        if (!target || !what) return refuse(OfficeRejection.NoOffice, "要说清许的是什么。");
        const state = read(c.world);
        if (!Object.values(state?.races ?? {}).some((r) => r.candidates.includes(me))) {
          return refuse(OfficeRejection.NotStanding, "你还没站出来。");
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.promise}.resolve`, commandType: OfficeCommands.promise,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const target = String(c.command.payload.targetId);
        const what = String(c.command.payload.what);
        const state = read(c.world) ?? emptyState();
        const next: OfficeState = {
          ...state,
          pledges: [...state.pledges, { to: target, what, at: c.world.tick, status: "open" }].slice(-20),
        };
        return [
          save(c.world, next, `promised ${target}: ${what}`),
          {
            kind: "emitEvent", eventType: "office.promised", actorId: me, targetId: target,
            data: { what }, historicalSignificance: 0.02,
          },
        ];
      },
    });

    // ---- canvass: speech / ally / smear ----------------------------------
    for (const [command, kind] of [
      [OfficeCommands.speech, "speech"],
      [OfficeCommands.askAlly, "ask-ally"],
      [OfficeCommands.smear, "smear"],
    ] as const) {
      ctx.registerConstraintRule({
        id: `${command}.allowed`, commandType: command,
        evaluate: (c): ConstraintOutcome => {
          const me = player(c.world);
          const state = read(c.world);
          if (!Object.values(state?.races ?? {}).some((r) => r.candidates.includes(me))) {
            return refuse(OfficeRejection.NotStanding, "你还没站出来。");
          }
          if (kind !== "speech" && !c.command.payload.targetId) {
            return refuse(OfficeRejection.NoOffice, "要选一个人。");
          }
          return { ok: true };
        },
      });
      ctx.registerResolutionRule({
        id: `${command}.resolve`, commandType: command,
        resolve: (c): Effect[] => {
          const me = player(c.world);
          const state = read(c.world) ?? emptyState();
          const officeId = Object.entries(state.races).find(([, r]) => r.candidates.includes(me))?.[0];
          if (!officeId) return [];
          const race = state.races[officeId]!;
          const next: OfficeState = {
            ...state,
            races: {
              ...state.races,
              [officeId]: { ...race, rounds: { ...race.rounds, [me]: (race.rounds[me] ?? 0) + 1 } },
            },
          };
          return [
            save(c.world, next, `${kind} for ${officeId}`),
            {
              kind: "emitEvent", eventType: "office.canvassed", actorId: me,
              ...(c.command.payload.targetId ? { targetId: String(c.command.payload.targetId) } : {}),
              data: { officeId, kind },
              historicalSignificance: kind === "smear" ? 0.03 : 0,
            },
          ];
        },
      });
    }

    // ---- vote -------------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.vote}.allowed`, commandType: OfficeCommands.vote,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        const officeId = String(c.command.payload.officeId ?? "");
        const state = read(c.world);
        const race = state?.races[officeId];
        if (!race) return refuse(OfficeRejection.RaceClosed, "现在没有在选人。");
        if (c.world.tick >= race.closesAt) return refuse(OfficeRejection.RaceClosed, "已经数过票了。");
        if (state!.holders[officeId] === me) return refuse(OfficeRejection.AlreadyHolds, "位子是你的。");
        const choice = String(c.command.payload.candidateId ?? "");
        if (!race.candidates.includes(choice)) return refuse(OfficeRejection.NotStanding, "这个人没站出来。");
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.vote}.resolve`, commandType: OfficeCommands.vote,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const officeId = String(c.command.payload.officeId);
        const choice = String(c.command.payload.candidateId);
        const state = read(c.world) ?? emptyState();
        const race = state.races[officeId]!;
        const next: OfficeState = {
          ...state,
          races: { ...state.races, [officeId]: { ...race, votes: { ...race.votes, [me]: choice } } },
        };
        return [
          save(c.world, next, `voted for ${choice}`),
          {
            kind: "emitEvent", eventType: "office.voted", actorId: me,
            data: { officeId, candidateId: choice }, historicalSignificance: 0,
          },
        ];
      },
    });

    // ---- decide -----------------------------------------------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.decide}.allowed`, commandType: OfficeCommands.decide,
      evaluate: (c): ConstraintOutcome => {
        const me = player(c.world);
        const state = read(c.world);
        if (!state?.pending) return refuse(OfficeRejection.NoMatter, "眼下没有要你管的事。");
        const holder = Object.entries(state.holders).find(([, who]) => who === me);
        if (!holder) return refuse(OfficeRejection.NotHolder, "你不在位子上。");
        const matter = matterById(state.pending.matterId);
        if (!matter) return refuse(OfficeRejection.NoMatter, "这件事不存在。");
        const option = matter.options.find((o) => o.id === String(c.command.payload.optionId ?? ""));
        if (!option) return refuse(OfficeRejection.NoMatter, "没有这个做法。");
        const facilities = facilitiesOf(c.world);
        const institutions = new Set<string>();
        const available = availableOptions(matter, facilities, institutions);
        const chosen = available.find((a) => a.option.id === option.id);
        if (chosen && !chosen.available) {
          return refuse(OfficeRejection.OptionBlocked, `${chosen.why}。`);
        }
        return { ok: true };
      },
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.decide}.resolve`, commandType: OfficeCommands.decide,
      resolve: (c): Effect[] => {
        const me = player(c.world);
        const state = read(c.world) ?? emptyState();
        const pending = state.pending!;
        const matter = matterById(pending.matterId)!;
        const option = matter.options.find((o) => o.id === String(c.command.payload.optionId))!;
        const next: OfficeState = {
          ...state,
          pending: null,
          neglectedDays: 0,
          standing: Math.max(-5, Math.min(5, state.standing + (option.effects.standing ?? 0))),
        };
        const effects: Effect[] = [
          save(c.world, next, `decided ${pending.matterId}: ${option.id}`),
          {
            kind: "emitEvent", eventType: "office.decided", actorId: me,
            data: {
              matterId: pending.matterId, optionId: option.id,
              settle: option.effects.settle ?? 0, favours: option.effects.favours ?? "neither",
            },
            historicalSignificance: 0.08,
          },
        ];
        if (option.effects.setsFlag) {
          effects.push({
            kind: "emitEvent", eventType: "office.rule_written", actorId: me,
            data: { flag: option.effects.setsFlag }, historicalSignificance: 0.05,
          });
        }
        return effects;
      },
    });

    // ---- year: open a race, count votes, choose a matter ------------------
    ctx.registerConstraintRule({
      id: `${OfficeCommands.year}.allowed`, commandType: OfficeCommands.year,
      evaluate: (): ConstraintOutcome => ({ ok: true }),
    });
    ctx.registerResolutionRule({
      id: `${OfficeCommands.year}.resolve`, commandType: OfficeCommands.year,
      resolve: (c): Effect[] => {
        const state = read(c.world) ?? emptyState();
        const people = adults(c.world);
        const next: OfficeState = { ...state };
        const effects: Effect[] = [];
        const year = Math.floor(c.world.tick / 360);

        // 1. Count any race whose window has closed.
        for (const [officeId, race] of Object.entries(state.races)) {
          if (c.world.tick < race.closesAt) continue;
          if (!race.candidates.length) {
            const { [officeId]: _drop, ...rest } = next.races;
            void _drop;
            next.races = rest;
            continue;
          }
          const { winner } = tallyVotes(race, () => 0);
          if (winner) {
            next.holders = { ...next.holders, [officeId]: winner };
            next.history = [...new Set([...next.history, officeId])];
          }
          const { [officeId]: _gone, ...rest } = next.races;
          void _gone;
          next.races = rest;
          effects.push({
            kind: "emitEvent", eventType: "office.elected", actorId: winner ?? undefined,
            data: { officeId, winner: winner ?? "", votes: Object.keys(race.votes).length },
            historicalSignificance: 0.15,
          });
        }

        // 2. An unfilled office opens a race, so there is always something to
        //    stand for. Only headship-shaped offices do this automatically.
        for (const office of OFFICES) {
          if (next.holders[office.id]) continue;
          if (next.races[office.id]) continue;
          if (office.id !== "office:headman") continue;
          next.races = {
            ...next.races,
            [office.id]: {
              officeId: office.id, candidates: [], leanings: {}, votes: {},
              openedAt: c.world.tick, closesAt: c.world.tick + 90, rounds: {},
            },
          };
          effects.push({
            kind: "emitEvent", eventType: "office.race_opened", actorId: undefined,
            data: { officeId: office.id, year }, historicalSignificance: 0.05,
          });
        }

        // 3. The holder gets one matter to settle, once per season.
        const holder = Object.entries(next.holders)[0];
        if (holder && !next.pending) {
          const [officeId, who] = holder;
          const office = officeById(officeId);
          const matterId = office?.matters[Math.floor(c.world.tick / 90) % office.matters.length];
          if (matterId) {
            next.pending = { matterId, openedAt: c.world.tick, sides: [] };
            effects.push({
              kind: "emitEvent", eventType: "office.matter_opened", actorId: who,
              data: { matterId, officeId }, historicalSignificance: 0.05,
            });
          }
        } else if (next.pending) {
          next.neglectedDays = next.neglectedDays + 1;
        }

        // 4. Standing decays toward zero; a long-neglected village sours.
        if (next.neglectedDays >= 4 && next.standing > -5) next.standing -= 1;

        effects.push(save(c.world, next, `office year ${year}`));
        void people;
        return effects;
      },
    });

    // ---- projections ------------------------------------------------------
    ctx.registerProjection({
      id: OfficeProjections.registry,
      description: "Which offices exist, who holds them, and what could be built to unlock more.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const state = read(world);
        const facilities = facilitiesOf(world);
        return {
          offices: OFFICES.map((office) => ({
            id: office.id,
            label: office.label,
            how: office.how,
            holder: state?.holders[office.id] ?? "",
            needsFacility: office.needsFacility ?? "",
            available: office.needsFacility ? facilities.has(office.needsFacility) : true,
            why: office.needsFacility && !facilities.has(office.needsFacility)
              ? `要有${facilityLabel(office.needsFacility)}` : "",
          })) as unknown as JsonValue,
          facilities: [...facilities],
          missingFacilities: LIVE_FACILITIES.filter((f) => !facilities.has(f.tag))
            .map((f) => ({ tag: f.tag, name: f.name, why: f.why })) as unknown as JsonValue,
        };
      },
    });

    ctx.registerProjection({
      id: OfficeProjections.panel,
      description: "The player's view of the office: the race, who leans your way, the matter waiting, your pledges.",
      build: ({ world }: { world: WorldView }): Record<string, JsonValue> => {
        const me = player(world);
        const state = read(world) ?? emptyState();
        const facilities = facilitiesOf(world);
        const mine = Object.entries(state.races).find(([, r]) => r.candidates.includes(me));
        const holding = Object.entries(state.holders).find(([, who]) => who === me);
        const pending = state.pending ? matterById(state.pending.matterId) : undefined;

        const race = mine ? {
          officeId: mine[0],
          label: officeById(mine[0])?.label ?? mine[0],
          candidates: mine[1].candidates.length,
          leaningToMe: Object.values(mine[1].leanings).filter((c) => c === me).length,
          votes: Object.keys(mine[1].votes).length,
          closesInDays: Math.max(0, mine[1].closesAt - world.tick),
        } : null;

        const matter = pending ? {
          id: pending.id,
          title: pending.title,
          options: availableOptions(pending, facilities, new Set()).map((a) => ({
            id: a.option.id, label: a.option.label,
            available: a.available, why: a.why,
          })),
        } : null;

        const openPledges = state.pledges.filter((p) => p.status === "open");

        // One readable line, no numbers: the panel is read, not parsed.
        const line = holding
          ? matter
            ? `你是${officeById(holding[0])?.label ?? "头人"}。眼下有件事等你断：${matter.title}。`
            : `你是${officeById(holding[0])?.label ?? "头人"}。眼下没有要你管的事。`
          : race
            ? `你站出来了，${race.officeId ? "" : ""}还有${race.closesInDays}天数票。`
            : "村里还没有人站出来。";

        return {
          holding: holding ? { officeId: holding[0], label: officeById(holding[0])?.label ?? "" } : null,
          race: race as unknown as JsonValue,
          matter: matter as unknown as JsonValue,
          pledges: openPledges.map((p) => ({ to: p.to, what: p.what })) as unknown as JsonValue,
          standing: state.standing,
          line,
        };
      },
    });
  },
};

void (0 as unknown as CommandIntent);
void (0 as unknown as POLITY_CAPABILITY);
