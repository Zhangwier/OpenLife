import { createServer } from "node:http";
import type { SavePackage } from "@openlife/contracts";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "@openlife/simulation";
import { runAutoSim, untilActorArchived, untilTick, type AutoSimContext } from "@openlife/autonomy-runtime";
import { modernWorldModule, TICKS_PER_YEAR } from "@openlife/module-modern-world";
import { formatYear, yearOfTick } from "@openlife/life-contracts";
import { familyModule } from "@openlife/module-family";
import { modernScienceModule } from "@openlife/module-modern-science";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";
import { historicalMemoryModule } from "@openlife/module-historical-memory";
import { intellectualHistoryModule } from "@openlife/module-intellectual-history";
import { historicalEraModule } from "@openlife/module-historical-era";
import { historicalAnchorsModule } from "@openlife/module-historical-anchors";
const PORT = Number(process.env.PORT ?? 4173);
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const modules = [
  modernWorldModule,
  familyModule,
  modernScienceModule,
  earlyCivilizationModule,
  historicalMemoryModule,
  intellectualHistoryModule,
  historicalEraModule,
  historicalAnchorsModule,
];
let simulation = createGame();

interface NewLifeOptions {
  seed?: number;
  givenName?: string;
  familyName?: string;
  cityId?: string;
}

function createGame(options: NewLifeOptions = {}): Simulation {
  const seed = Number.isFinite(options.seed) ? Number(options.seed) >>> 0 : 104;
  const givenName = cleanName(options.givenName, "启");
  const familyName = cleanName(options.familyName, "禾");
  const cityId = options.cityId === "modern:city:south"
    ? "modern:city:south"
    : "modern:city:north";

  const sim = new Simulation({ worldSeed: seed, modules });
  requireOk(sim.dispatch({ type: "modern.initialize_world", source: "system" }));
  requireOk(sim.dispatch({
    type: "modern.create_character",
    payload: {
      givenName,
      familyName,
      cityId,
      startingCash: 0,
      lifespan: 84,
      lineageId: "family:lineage:1",
    },
    source: "system",
  }));
  return sim;
}

function cleanName(value: string | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24);
  return cleaned || fallback;
}
function requireOk(result: { ok: boolean; errors: { message: string }[] }): void {
  if (!result.ok) throw new Error(result.errors[0]?.message ?? "command failed");
}

function activeCharacterId(): string {
  return String(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "",
  );
}

function activeCharacter() {
  const id = activeCharacterId();
  return id ? simulation.worldView().getEntity(id) : undefined;
}

function ageOf(entity: ReturnType<typeof activeCharacter>): number {
  if (!entity) return 0;
  const bornAt = Number(entity.components["modern.identity"]?.bornAt ?? entity.createdAt);
  return Math.max(0, Math.floor((simulation.tick - bornAt) / TICKS_PER_YEAR));
}

function entityName(entityId: string): string {
  const entity = simulation.worldView().getEntity(entityId);
  if (!entity) return "Unknown";
  const identity = entity.components["modern.identity"] ?? {};
  const givenName = String(identity.givenName ?? "");
  const familyName = String(identity.familyName ?? "");
  const visibleFamilyName = ["Partner", "Acquaintance"].includes(familyName) ? "" : familyName;
  return [givenName, visibleFamilyName].filter(Boolean).join(" ")
    || String(identity.name ?? entityId);
}

function gameState() {
  simulation.syncHistory();
  const world = simulation.worldView();
  const character = activeCharacter();
  const characterId = character?.id ?? "";
  const identity = character?.components["modern.identity"] ?? {};
  const vitals = character?.components["modern.vitals"] ?? {};
  const learning = character?.components["early-civilization.learning"] ?? {};
  const role = character?.components["early-civilization.role"] ?? {};
  const legacy = character?.components["early-civilization.legacy"] ?? {};
  const age = ageOf(character);
  const lineageId = String(identity.lineageId ?? "family:lineage:1");
  const lineageProjection = simulation.project({ id: "family.lineage", params: { lineageId } });
  const eraProjection = simulation.project({ id: "early-civilization.overview", params: {} });
  const scienceProjection = simulation.project({ id: "modern-science.civilization", params: {} });
  const footprintProjection = characterId
    ? simulation.project({ id: "historical-memory.subject_footprint", params: { subjectId: characterId } })
    : { ok: false, data: undefined };
  const memoryOverviewProjection = simulation.project({
    id: "historical-memory.public_overview",
    params: {},
  });
  const notableSubjectsProjection = simulation.project({
    id: "historical-memory.notable_subjects",
    params: {},
  });
  const intellectualOverviewProjection = simulation.project({
    id: "intellectual-history.overview",
    params: {},
  });
  const historicalEraProjection = simulation.project({
    id: "historical-era.current",
    params: {},
  });
  const historicalAnchorsProjection = simulation.project({
    id: "historical-anchors.public",
    params: {},
  });
  const proposedIdeaId = characterId
    ? world.listRelations({ type: "intellectual-history.proposed_by", to: characterId })[0]?.from ?? ""
    : "";
  const activeIdeaProjection = proposedIdeaId
    ? simulation.project({ id: "intellectual-history.idea", params: { ideaId: proposedIdeaId } })
    : { ok: false, data: undefined };
  const eventById = new Map(simulation.history.view().listEvents().map((event) => [event.id, event]));
  const history = simulation.history.listRecords().slice(-18).reverse();

  const relations = world
    .listRelations({ from: characterId })
    .filter((relation) =>
      ["family.friend_of", "family.married_to", "family.parent_of"].includes(relation.type),
    )
    .map((relation) => ({
      id: relation.id,
      type: relation.type,
      targetId: relation.to,
      targetName: entityName(relation.to),
    }));

  const spouse = relations.find((relation) => relation.type === "family.married_to");
  const children = relations.filter((relation) => relation.type === "family.parent_of");
  const friends = relations.filter((relation) => relation.type === "family.friend_of");
  const uninitiatedFriend = proposedIdeaId
    ? friends.find((friend) =>
        world.listRelations({
          type: "intellectual-history.embraces",
          from: friend.targetId,
          to: proposedIdeaId,
        }).length === 0
      )
    : undefined;
  const schoolId = proposedIdeaId
    ? world.listRelations({ type: "intellectual-history.centers_on", to: proposedIdeaId })[0]?.from ?? ""
    : "";
  const residenceId = String(character?.components["modern.residence"]?.cityId ?? "modern:city:north");
  const ideaInfluencesResidence = proposedIdeaId
    ? world.listRelations({
        type: "intellectual-history.influences",
        from: proposedIdeaId,
        to: residenceId,
      }).length > 0
    : false;
  const adherentCount = Number(activeIdeaProjection.data?.adherentCount ?? 0);
  const thoughtStage = !proposedIdeaId
    ? "form"
    : uninitiatedFriend
      ? "share"
      : adherentCount >= 2 && !schoolId
        ? "school"
        : schoolId && !ideaInfluencesResidence
          ? "influence"
          : adherentCount < 2
            ? "need-friend"
            : "established";
  const alive = character?.archivedAt === undefined && vitals.alive !== false;

  return {
    tick: simulation.tick,
    year: yearOfTick(simulation.tick),
    month: (simulation.tick % TICKS_PER_YEAR) + 1,
    era: formatYear(yearOfTick(simulation.tick)),
    generation: Number(world.getComponent("modern:world", "modern.world_state")?.generation ?? 1),
    character: character ? {
      id: character.id,
      name: [identity.givenName, identity.familyName].filter(Boolean).join(" ") || character.id,
      age,
      alive,
      healthWord: vitals.health === 0 ? "生命已结束" : age < 18 ? "正在成长" : age < 60 ? "身体尚稳" : "步入晚年",
      city: entityName(String(character.components["modern.residence"]?.cityId ?? "modern:city:north")),
      learning: learning.path ? String(learning.path) : "尚未开始系统学习",
      role: role.title ? String(role.title) : "尚未承担聚落角色",
      family: spouse ? `与 ${spouse.targetName} 相伴` : "尚未建立家庭",
      children: children.map((child) => ({ id: child.targetId, name: child.targetName })),
      legacy: legacy.title ? String(legacy.title) : null,
      historicalFootprint: footprintProjection.ok
        ? String(footprintProjection.data?.state ?? "forgotten")
        : "forgotten",
      thought: activeIdeaProjection.ok
        ? {
            id: proposedIdeaId,
            title: String(activeIdeaProjection.data?.title ?? "无名思想"),
            thesis: String(activeIdeaProjection.data?.thesis ?? ""),
            adherentCount,
            schoolCount: Number(activeIdeaProjection.data?.schoolCount ?? 0),
            influenceCount: Number(activeIdeaProjection.data?.influenceCount ?? 0),
            stage: thoughtStage,
          }
        : null,
    } : null,
    relations,
    lineage: lineageProjection.ok ? lineageProjection.data : { lineageId, members: [], chronicle: [] },
    history: history.map((record) => ({
      id: record.id,
      type: record.type,
      at: record.at,
      year: yearOfTick(record.at),
      era: formatYear(yearOfTick(record.at)),
      summary: humanizeEvent(record.type, eventById.get(record.eventId)?.data),
      significance: record.significance,
      archived: Boolean(record.subjectArchived),
    })),
    world: {
      people: world.countEntities("modern.character"),
      communities: world.listEntities({ kind: "modern.city" }).length,
      records: simulation.history.records.length,
      pulse: historicalEraProjection.ok
        ? {
            label: `${String(historicalEraProjection.data?.label ?? "夏")} · 世界仍在变化`,
            note: String(
              historicalEraProjection.data?.summary
              ?? eraProjection.data?.pulseNote
              ?? "亲族与技艺维系着共同体。",
            ),
            eraLabel: String(historicalEraProjection.data?.label ?? "夏"),
          }
        : eraProjection.ok
          ? {
              label: String(eraProjection.data?.pulseLabel ?? "聚落缓慢生长"),
              note: String(eraProjection.data?.pulseNote ?? "亲族与技艺维系着共同体。"),
              eraLabel: String(eraProjection.data?.eraLabel ?? "夏初"),
            }
          : { label: "聚落缓慢生长", note: "亲族与技艺维系着共同体。", eraLabel: "夏初" },
      eraContext: historicalEraProjection.ok
        ? historicalEraProjection.data
        : null,
      historicalAnchors: historicalAnchorsProjection.ok
        ? historicalAnchorsProjection.data
        : { people: [] },
      science: scienceProjection.ok
        ? scienceProjection.data
        : { knownCount: 0, established: [], frontierCount: 0 },
      historicalMemory: memoryOverviewProjection.ok
        ? memoryOverviewProjection.data
        : {
            visibleWorkCount: 0,
            fragmentaryWorkCount: 0,
            contestedWorkCount: 0,
            anonymousWorkCount: 0,
            works: [],
          },
      notablePeople: notableSubjectsProjection.ok && Array.isArray(notableSubjectsProjection.data?.subjects)
        ? notableSubjectsProjection.data.subjects.slice(0, 3).map((subject: Record<string, unknown>) => ({
            id: String(subject.subjectId ?? ""),
            name: entityName(String(subject.subjectId ?? "")),
            state: String(subject.state ?? "remembered"),
            score: Number(subject.score ?? 0),
          }))
        : [],
      intellectual: intellectualOverviewProjection.ok
        ? intellectualOverviewProjection.data
        : { traditions: [], schoolCount: 0 },
    },
    actions: buildActions({ age, alive, learning, role, legacy, spouse, thoughtStage }),
  };
}

function buildActions(input: {
  age: number;
  alive: boolean;
  learning: Record<string, unknown>;
  role: Record<string, unknown>;
  legacy: Record<string, unknown>;
  spouse: { targetName: string } | undefined;
  thoughtStage: string;
}) {
  const actions = [
    { id: "advance-year", label: "让一年流逝", tone: "quiet", enabled: input.alive },
    {
      id: "learn",
      label: input.learning.path ? "继续从生活中学习" : "跟着长辈与生活学习",
      tone: "warm",
      enabled: input.alive && input.age >= 6 && !input.learning.path,
    },
    { id: "friend", label: "认识一个人", tone: "soft", enabled: input.alive && input.age >= 5 },
    {
      id: "role",
      label: input.role.title ? "承担今天的役事" : "承担聚落里的角色",
      tone: "blue",
      enabled: input.alive && input.age >= 14 && !input.role.title,
    },
    {
      id: "marry",
      label: input.spouse ? "陪伴家人" : "建立伴侣关系",
      tone: "rose",
      enabled: input.alive && input.age >= 18 && !input.spouse,
    },
    {
      id: "child",
      label: "迎接一个孩子",
      tone: "gold",
      enabled: input.alive && input.age >= 18 && Boolean(input.spouse),
    },
    {
      id: "legacy",
      label: "留下一门手艺与经验",
      tone: "ink",
      enabled: input.alive && Boolean(input.role.title) && !input.legacy.title,
    },
    { id: "next-generation", label: "继续下一代的人生", tone: "gold", enabled: !input.alive },
  ];

  if (input.alive && input.age >= 16 && Boolean(input.role.title)) {
    const thoughtCopy = {
      form: ["整理一种对生活的看法", true],
      share: ["把这套想法讲给朋友", true],
      school: ["让追随者形成一个学派", true],
      influence: ["让这套思想影响聚落", true],
      "need-friend": ["先认识愿意听你说话的人", false],
      established: ["这套思想正在继续流传", false],
    }[input.thoughtStage] ?? ["整理一种对生活的看法", true];
    actions.splice(actions.length - 2, 0, {
      id: "thought",
      label: String(thoughtCopy[0]),
      tone: "soft",
      enabled: Boolean(thoughtCopy[1]),
    });
  }

  return actions;
}
function humanizeEvent(type: string, data: Record<string, unknown> = {}): string {
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
    "early-civilization.era_begun": "夏初的聚落开始延续",
    "early-civilization.learning_begun": "开始跟随生活学习",
    "family.married": "两个人决定共同生活",
    "family.child_born": "家族迎来了新的成员",
    "modern.character_died": "这一生走到了终点",
    "modern.generation_switched": "故事交到了下一代手中",
  };
  return labels[type] ?? type.replaceAll(".", " · ").replaceAll("_", " ");
}

function runAction(action: string) {
  const id = activeCharacterId();
  switch (action) {
    case "advance-year":
      simulation.advanceBy(TICKS_PER_YEAR);
      return { ok: true, errors: [] };
    case "learn":
      return simulation.dispatch({ type: "early-civilization.begin_learning", actorId: id });
    case "friend":
      return simulation.dispatch({ type: "family.make_friend", actorId: id, payload: { targetName: "禾" } });
    case "role":
      return simulation.dispatch({ type: "early-civilization.take_role", actorId: id });
    case "marry":
      return simulation.dispatch({ type: "family.marry", actorId: id, payload: { spouseName: "予" } });
    case "child":
      return simulation.dispatch({
        type: "family.have_child",
        actorId: id,
        payload: { givenName: ["兰", "禾", "启"][simulation.tick % 3] },
      });
    case "legacy":
      return simulation.dispatch({ type: "early-civilization.leave_legacy", actorId: id });
    case "thought":
      return runThoughtAction(id);
    case "next-generation":
      return simulation.dispatch({ type: "modern.switch_generation" });
    default:
      return { ok: false, errors: [{ code: "E_UNKNOWN_UI_ACTION", message: `unknown action: ${action}` }] };
  }
}
function runThoughtAction(actorId: string) {
  const world = simulation.worldView();
  const proposedIdeaId = world.listRelations({
    type: "intellectual-history.proposed_by",
    to: actorId,
  })[0]?.from ?? "";

  if (!proposedIdeaId) {
    const role = world.getComponent(actorId, "early-civilization.role") ?? {};
    const template = thoughtTemplate(String(role.roleId ?? ""));
    return simulation.dispatch({
      type: "intellectual-history.propose_idea",
      actorId,
      payload: {
        ...template,
        medium: "oral",
        preservationIntervalTicks: 40 * TICKS_PER_YEAR,
      },
    });
  }

  const friends = world
    .listRelations({ type: "family.friend_of", from: actorId })
    .map((relation) => relation.to);
  const uninitiatedFriend = friends.find((friendId) =>
    world.listRelations({
      type: "intellectual-history.embraces",
      from: friendId,
      to: proposedIdeaId,
    }).length === 0
  );
  if (uninitiatedFriend) {
    return simulation.dispatch({
      type: "intellectual-history.teach_idea",
      actorId,
      targetId: uninitiatedFriend,
      payload: {
        ideaId: proposedIdeaId,
        medium: "oral",
        preservationIntervalTicks: 40 * TICKS_PER_YEAR,
      },
    });
  }

  const adherentCount = world.listRelations({
    type: "intellectual-history.embraces",
    to: proposedIdeaId,
  }).length;
  const schoolId = world.listRelations({
    type: "intellectual-history.centers_on",
    to: proposedIdeaId,
  })[0]?.from ?? "";

  if (adherentCount >= 2 && !schoolId) {
    const idea = world.getComponent(proposedIdeaId, "intellectual-history.idea") ?? {};
    return simulation.dispatch({
      type: "intellectual-history.form_school",
      actorId,
      payload: {
        ideaId: proposedIdeaId,
        name: `${String(idea.title ?? "共同之道")}之学`,
      },
    });
  }

  const residenceId = String(
    world.getComponent(actorId, "modern.residence")?.cityId ?? "modern:city:north",
  );
  const alreadyInfluences = world.listRelations({
    type: "intellectual-history.influences",
    from: proposedIdeaId,
    to: residenceId,
  }).length > 0;
  if (schoolId && !alreadyInfluences) {
    return simulation.dispatch({
      type: "intellectual-history.apply_idea",
      actorId,
      targetId: residenceId,
      payload: { ideaId: proposedIdeaId, strength: 0.65 },
    });
  }

  return {
    ok: false,
    errors: [{
      code: "E_THOUGHT_WAITING",
      message: adherentCount < 2
        ? "先认识一个愿意听你讲述的人"
        : "这套思想已经在共同体里继续流传",
    }],
  };
}

function thoughtTemplate(roleId: string) {
  switch (roleId) {
    case "craftsperson":
      return {
        title: "传艺之道",
        thesis: "技艺若只停在一个人手里，便会随生命一起消失。",
        principles: ["手艺应当传给后来者", "经验需要反复验证", "留下方法比留下名声更重要"],
      };
    case "cultivator":
      return {
        title: "共耕之约",
        thesis: "共同承担季节与收获，能让聚落比单独劳作更稳。",
        principles: ["共同承担风险", "收获需要顾及来年", "有余力时帮助同伴"],
      };
    case "forager":
      return {
        title: "取用有度",
        thesis: "今天从自然中取得的东西，也应给明天留下余地。",
        principles: ["不过度索取", "记住季节变化", "把路径与经验告诉后来者"],
      };
    default:
      return {
        title: "共议之道",
        thesis: "共同体的事情，应让承担后果的人有机会说出自己的看法。",
        principles: ["先听不同意见", "共同决定共同承担", "约定可以根据现实修正"],
      };
  }
}

function autoSim(mode: string) {
  const actorId = activeCharacterId();
  const startTick = simulation.tick;
  const maxTick = startTick + 40 * TICKS_PER_YEAR;
  const provider = {
    id: "web.passive-autosim",
    decide: () => [],
  };

  const stopConditions = mode === "year"
    ? [untilTick(startTick + TICKS_PER_YEAR)]
    : [
        untilActorArchived(actorId),
        {
          id: "player-life-milestone",
          description: "reached a player life milestone",
          isSatisfied: (ctx: AutoSimContext) =>
            ctx.steps > 0
            && (hasPlayerMilestone(ctx.kernel.worldView(), actorId) || ctx.kernel.tick >= maxTick),
        },
      ];

  const result = runAutoSim({
    kernel: simulation.kernel,
    actorId,
    provider,
    projection: ({ actorId: projectedActorId }) => {
      const character = simulation.kernel.worldView().getEntity(projectedActorId);
      return {
        tick: simulation.kernel.tick,
        alive: character?.archivedAt === undefined,
      };
    },
    stopConditions,
    advanceTicksPerStep: TICKS_PER_YEAR,
    maxCommands: 40,
  });
  simulation.syncHistory();
  return result;
}

function hasPlayerMilestone(
  world: ReturnType<Simulation["worldView"]>,
  actorId: string,
): boolean {
  const character = world.getEntity(actorId);
  if (!character || character.archivedAt !== undefined) return true;

  const identity = character.components["modern.identity"] ?? {};
  const bornAt = Number(identity.bornAt ?? character.createdAt);
  const age = Math.max(0, Math.floor((world.tick - bornAt) / TICKS_PER_YEAR));

  const learning = character.components["early-civilization.learning"] ?? {};
  const role = character.components["early-civilization.role"] ?? {};
  const hasSpouse = world.listRelations({ type: "family.married_to", from: actorId }).length > 0;
  const hasProposedIdea = world.listRelations({
    type: "intellectual-history.proposed_by",
    to: actorId,
  }).length > 0;

  return (
    (age >= 6 && !learning.path)
    || (age >= 14 && !role.title)
    || (age >= 16 && Boolean(role.title) && !hasProposedIdea)
    || (age >= 18 && !hasSpouse)
  );
}

function saveSummary() {
  const state = gameState();
  return {
    year: state.year,
    month: state.month,
    generation: state.generation,
    character: state.character
      ? {
          name: state.character.name,
          age: state.character.age,
          alive: state.character.alive,
        }
      : null,
    records: state.world.records,
  };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      res.setHeader("content-type", "application/json; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/api/state") {
        res.end(JSON.stringify(gameState()));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/action") {
        const body = await readJson(req);
        const result = runAction(String(body.action ?? ""));
        simulation.syncHistory();
        res.end(JSON.stringify({ result, state: gameState() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/autosim") {
        const body = await readJson(req);
        const result = autoSim(String(body.mode ?? "milestone"));
        simulation.syncHistory();
        res.end(JSON.stringify({ result, state: gameState() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/save") {
        const body = await readJson(req);
        const label = typeof body.label === "string" ? body.label : undefined;
        const save = simulation.save(label ? { label } : {});
        res.end(JSON.stringify({ save, summary: saveSummary() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/load") {
        const body = await readJson(req);
        if (!body.save || typeof body.save !== "object") {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "缺少有效的 OpenLife 存档" }));
          return;
        }
        const loaded = Simulation.load(body.save as SavePackage, modules);
        if (!loaded.result.ok || !loaded.simulation) {
          res.statusCode = 409;
          res.end(JSON.stringify({
            error: loaded.result.errors[0]?.message ?? "这个记忆现在无法恢复",
            result: loaded.result,
          }));
          return;
        }
        simulation = loaded.simulation;
        res.end(JSON.stringify({ result: loaded.result, state: gameState() }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/reset") {
        const body = await readJson(req);
        simulation = createGame({
          seed: Number(body.seed ?? 104),
          givenName: typeof body.givenName === "string" ? body.givenName : undefined,
          familyName: typeof body.familyName === "string" ? body.familyName : undefined,
          cityId: typeof body.cityId === "string" ? body.cityId : undefined,
        });
        res.end(JSON.stringify({ state: gameState() }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = normalize(requested).replace(/^([.][.][/\\])+/, "");
    const data = await readFile(join(PUBLIC_DIR, safe));
    res.setHeader("content-type", contentType(extname(safe)));
    res.end(data);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
});

server.listen(PORT, () => {
  console.log(`OpenLife web running at http://127.0.0.1:${PORT}`);
});

async function readJson(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function contentType(ext: string): string {
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}
