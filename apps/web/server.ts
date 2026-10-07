import { createServer } from "node:http";
import type { SavePackage } from "@openlife/contracts";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "@openlife/simulation";
import { runAutoSim, untilActorArchived, untilTick, type AutoSimContext } from "@openlife/autonomy-runtime";
import { modernWorldModule, TICKS_PER_YEAR } from "@openlife/module-modern-world";
import { formatYear, yearOfTick } from "@openlife/life-contracts";
import { educationModule } from "@openlife/module-education";
import { careerModule } from "@openlife/module-career";
import { familyModule } from "@openlife/module-family";
import { economyModule } from "@openlife/module-economy";
import { modernScienceModule } from "@openlife/module-modern-science";
import { basicAutonomyModule } from "@openlife/module-basic-autonomy";

const PORT = Number(process.env.PORT ?? 4173);
const PUBLIC_DIR = fileURLToPath(new URL("./public/", import.meta.url));
const modules = [
  modernWorldModule,
  educationModule,
  careerModule,
  familyModule,
  economyModule,
  modernScienceModule,
  basicAutonomyModule,
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
  const givenName = cleanName(options.givenName, "Avery");
  const familyName = cleanName(options.familyName, "Lin");
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
      startingCash: 18000,
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
  const wealth = character?.components["modern.wealth"] ?? {};
  const education = character?.components["education.level"] ?? {};
  const student = character?.components["education.student_status"] ?? {};
  const employment = character?.components["career.employment"] ?? {};
  const age = ageOf(character);
  const lineageId = String(identity.lineageId ?? "family:lineage:1");
  const lineageProjection = simulation.project({ id: "family.lineage", params: { lineageId } });
  const economyProjection = simulation.project({ id: "economy.overview", params: {} });
  const scienceProjection = simulation.project({ id: "modern-science.civilization", params: {} });
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
      healthWord: vitals.health === 0 ? "生命已结束" : age < 18 ? "正在成长" : age < 60 ? "状态平稳" : "步入晚年",
      city: entityName(String(character.components["modern.residence"]?.cityId ?? "modern:city:north")),
      education: String(education.level ?? (student.enrolled ? "在读" : "尚未入学")),
      occupation: employment.title ? occupationLabel(String(employment.title)) : "尚未选择职业",
      family: spouse ? `与 ${spouse.targetName} 相伴` : "尚未建立家庭",
      children: children.map((child) => ({ id: child.targetId, name: child.targetName })),
      cash: Number(wealth.cash ?? 0),
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
      organizations: world.listEntities({ kind: "modern.organization" }).length,
      records: simulation.history.records.length,
      economy: economyProjection.ok
        ? economyProjection.data
        : { phase: "steady", label: "市场平稳", note: "世界仍在自己的节奏里运行。" },
      science: scienceProjection.ok
        ? scienceProjection.data
        : { knownCount: 0, established: [] },
    },
    actions: buildActions({ age, alive, student, education, employment, wealth, spouse }),
  };
}

function buildActions(input: {
  age: number;
  alive: boolean;
  student: Record<string, unknown>;
  education: Record<string, unknown>;
  employment: Record<string, unknown>;
  wealth: Record<string, unknown>;
  spouse: { targetName: string } | undefined;
}) {
  return [
    { id: "advance-year", label: "让一年流逝", tone: "quiet", enabled: input.alive },
    {
      id: "school",
      label: input.student.enrolled ? "继续学习" : "走进学校",
      tone: "warm",
      enabled: input.alive && input.age >= 6 && !input.student.enrolled && input.education.level !== "higher",
    },
    { id: "friend", label: "认识一个人", tone: "soft", enabled: input.alive && input.age >= 5 },
    {
      id: "job",
      label: input.employment.occupation ? "工作中的一天" : "寻找工作",
      tone: "blue",
      enabled: input.alive && input.age >= 16 && !input.employment.occupation,
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
      id: "business",
      label: "留下自己的事业",
      tone: "ink",
      enabled: input.alive && Number(input.wealth.cash ?? 0) >= 5000,
    },
    { id: "next-generation", label: "继续下一代的人生", tone: "gold", enabled: !input.alive },
  ];
}

function humanizeEvent(type: string, data: Record<string, unknown> = {}): string {
  if (type === "economy.phase_changed") {
    return `时代从“${economyPhaseLabel(String(data.from ?? "steady"))}”走向“${economyPhaseLabel(String(data.to ?? "steady"))}”`;
  }
  const labels: Record<string, string> = {
    "modern.character_created": "一个新生命来到世界",
    "modern.world_initialized": "世界开始运转",
    "education.school_founded": "一所学校在城市里扎根",
    "education.enrolled": "开始了一段求学经历",
    "education.graduated": "完成学业，站在新的路口",
    "career.job_accepted": "第一次拥有自己的职业身份",
    "career.business_founded": "创办了一份能够留下来的事业",
    "career.company_founded": "一家公司在城市里成立",
    "family.married": "两个人决定共同生活",
    "family.child_born": "家族迎来了新的成员",
    "modern.character_died": "这一生走到了终点",
    "modern.generation_switched": "故事交到了下一代手中",
  };
  return labels[type] ?? type.replaceAll(".", " · ").replaceAll("_", " ");
}

function occupationLabel(title: string): string {
  return {
    Engineer: "工程师",
    Teacher: "教师",
    Trader: "商贸从业者",
  }[title] ?? title;
}

function economyPhaseLabel(phase: string): string {
  return {
    steady: "平稳",
    expansion: "扩张",
    slowdown: "放缓",
    recovery: "回暖",
  }[phase] ?? phase;
}

function runAction(action: string) {
  const id = activeCharacterId();
  const character = activeCharacter();
  const age = ageOf(character);
  switch (action) {
    case "advance-year":
      simulation.advanceBy(TICKS_PER_YEAR);
      return { ok: true, errors: [] };
    case "school":
      return simulation.dispatch({ type: "education.enroll_school", actorId: id });
    case "friend":
      return simulation.dispatch({ type: "family.make_friend", actorId: id, payload: { targetName: "Mira" } });
    case "job":
      return simulation.dispatch({
        type: "career.get_job",
        actorId: id,
        payload: { occupation: age >= 22 ? "engineer" : "trader", companyName: "Northport Works" },
      });
    case "marry":
      return simulation.dispatch({ type: "family.marry", actorId: id, payload: { spouseName: "Rowan" } });
    case "child":
      return simulation.dispatch({
        type: "family.have_child",
        actorId: id,
        payload: { givenName: ["Noa", "Iris", "Theo"][simulation.tick % 3] },
      });
    case "business":
      return simulation.dispatch({
        type: "career.start_business",
        actorId: id,
        payload: { name: "Lin & Co.", capital: 5000 },
      });
    case "next-generation":
      return simulation.dispatch({ type: "modern.switch_generation" });
    default:
      return { ok: false, errors: [{ code: "E_UNKNOWN_UI_ACTION", message: `unknown action: ${action}` }] };
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
  const student = character.components["education.student_status"] ?? {};
  const education = character.components["education.level"] ?? {};
  const employment = character.components["career.employment"] ?? {};
  const hasSpouse = world.listRelations({ type: "family.married_to", from: actorId }).length > 0;

  return (
    (age >= 6 && !student.enrolled && education.level !== "higher")
    || (age >= 16 && !employment.occupation)
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
