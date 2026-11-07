/**
 * Village chronicle: a light, century-scale population of a village, plus the
 * written chronicle of what happened in it.
 *
 * `chronicle.year` decides the year's demography and writes a plan; the
 * driver (run.ts) turns the plan into commands for heredity, tech, polity,
 * bondage and the era ladder. Reaction rules listen to their events and write
 * the chronicle lines, so every plugin stays switchable: a missing plugin
 * simply never produces its kind of line.
 */
import type { Effect, JsonValue, OpenLifeModule, ReactionContext, WorldView } from "@openlife/contracts";
import { chronicleYear, YEAR, type ChroniclePerson, type Neighbour, type YearPlan } from "./demography.ts";

const OWNER = "village-chronicle";
export const CHRONICLE_VILLAGE = "chronicle:village";
export const ChronicleComponents = { person: "village-chronicle.person", village: "village-chronicle.village" } as const;
export const ChronicleKinds = { person: "village-chronicle.person" } as const;

export interface ChronicleVillage {
  name: string;
  year: number;
  stores: number;
  contacts: number;
  neighbours: Neighbour[];
  nextId: number;
  nameSeq: number;
  log: Array<{ year: number; text: string }>;
  lastYear: YearPlan | null;
  peak: number;
  /** Living villagers, kept here so a long chronicle never rescans the dead. */
  alive: string[];
}

const SURNAME_FREE = ["予", "石", "汲", "埴", "苇", "禾", "陶", "渔", "棘", "荞", "桑", "麦", "鹿", "鸣", "川", "丘", "柘", "芷", "蘅", "荻", "粟", "葵", "槐", "杞"];
const NEIGHBOURS = ["南丘", "盐泉", "东滩", "柳湾", "石门", "北原", "渡头", "蒲泽", "鹿野", "铜山"];
const MAX_LOG = 600;

interface Apis {
  heredity?: { ceiling(w: WorldView, id: string, t: string): number; kinship(w: WorldView, a: string, b: string): number };
  tech?: {
    productivity(w: WorldView, k: string): number; capabilities(w: WorldView): string[]; forewarned(w: WorldView, p: string): boolean;
    mind(w: WorldView, id: string): { knows: Record<string, number> } | undefined;
    content(): { inventions: Array<{ id: string; name: string; era: string }>; theories: Array<{ id: string; label: string; claim: string }> };
  };
  polity?: { list(w: WorldView): string[]; head(w: WorldView): string | null; specialists(w: WorldView): string[] };
}

const readVillage = (w: WorldView) => w.getComponent(CHRONICLE_VILLAGE, ChronicleComponents.village) as unknown as ChronicleVillage | undefined;
const readPerson = (w: WorldView, id: string) => w.getComponent(id, ChronicleComponents.person) as unknown as ChroniclePerson | undefined;
const json = (x: unknown) => structuredClone(x) as Record<string, JsonValue>;

export interface ChronicleApi {
  village(world: WorldView): ChronicleVillage | undefined;
  person(world: WorldView, id: string): ChroniclePerson | undefined;
  living(world: WorldView): string[];
}

function living(w: WorldView): string[] {
  return [...(readVillage(w)?.alive ?? [])];
}

export const villageChronicleModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Village chronicle",
    description: "Century-scale village demography and the written chronicle of inventions, beliefs, institutions and eras.",
    provides: ["chronicle.village"],
    optional: ["life.heredity", "tech.invention", "polity.institutions"],
    capabilities: ["component.register", "command.register", "rule.constraint.register", "rule.resolution.register", "rule.reaction.register", "projection.register"],
  },

  register(ctx) {
    const registry = ctx.registry;
    const apis = (): Apis => ({
      heredity: registry.capabilityImplementation("life.heredity") as Apis["heredity"],
      tech: registry.capabilityImplementation("tech.invention") as Apis["tech"],
      polity: registry.capabilityImplementation("polity.institutions") as Apis["polity"],
    });
    const api: ChronicleApi = { village: readVillage, person: readPerson, living };
    ctx.provideCapability("chronicle.village", api);

    ctx.registerComponent({ id: ChronicleComponents.person, persist: true, description: "A villager at chronicle resolution: name, sex, birth, parents, spouse, death." });
    ctx.registerComponent({ id: ChronicleComponents.village, persist: true, description: "Stores, contacts, neighbours, last year's plan and the chronicle." });
    ctx.registerCommand({ type: "village-chronicle.found", description: "Found a chronicle village with founders.", params: { count: "founders", name: "village name" } });
    ctx.registerCommand({ type: "village-chronicle.year", description: "One year of demography; writes the plan the driver acts on." });
    ctx.registerCommand({ type: "village-chronicle.note", description: "Write a line into the chronicle.", params: { text: "line" } });

    ctx.registerConstraintRule({
      id: "village-chronicle.year.founded", commandType: "village-chronicle.year",
      evaluate: (c) => readVillage(c.world) ? { ok: true } : { ok: false, code: "E_CHRONICLE_NO_VILLAGE", message: "run chronicle.found first" },
    });

    ctx.registerResolutionRule({
      id: "village-chronicle.found.resolve",
      commandType: "village-chronicle.found",
      resolve: (c) => {
        if (readVillage(c.world)) return [];
        const count = Math.max(2, Math.min(60, Number(c.command.payload.count ?? 12)));
        const effects: Effect[] = [];
        for (let i = 1; i <= count; i++) {
          const sex = i % 2 ? "f" : "m";
          const born = c.world.tick - (16 + c.rng.nextInt(0, 20)) * YEAR;
          const person: ChroniclePerson = { name: `阿${SURNAME_FREE[(i - 1) % SURNAME_FREE.length]}`, sex, born, alive: true, motherId: "", fatherId: "", spouseId: "", diedAt: 0, cause: "" };
          effects.push({ kind: "spawnEntity", localId: `p${i}`, id: `p:${i}`, entityKind: ChronicleKinds.person, components: { [ChronicleComponents.person]: json(person) }, announce: false });
        }
        const v: ChronicleVillage = {
          name: String(c.command.payload.name ?? "河岸"), year: 0, stores: count * 0.5, contacts: 0, neighbours: [],
          nextId: count + 1, nameSeq: count, log: [{ year: 0, text: `${count}个人在河岸台地落了脚。` }], lastYear: null, peak: count,
          alive: Array.from({ length: count }, (_, i) => `p:${i + 1}`).sort(),
        };
        effects.push({ kind: "spawnEntity", localId: "village", id: CHRONICLE_VILLAGE, entityKind: "village-chronicle.village", components: { [ChronicleComponents.village]: json(v) } });
        return effects;
      },
    });

    ctx.registerResolutionRule({
      id: "village-chronicle.year.resolve",
      commandType: "village-chronicle.year",
      resolve: (c) => {
        const v = structuredClone(readVillage(c.world)!) as ChronicleVillage;
        const a = apis();
        const people = new Map<string, ChroniclePerson>();
        for (const id of v.alive) {
          const p = readPerson(c.world, id);
          if (p) people.set(id, p);
          for (const parent of p ? [p.motherId, p.fatherId] : []) {
            const q = parent ? readPerson(c.world, parent) : undefined;
            if (q && !people.has(parent)) people.set(parent, q);
          }
        }
        const knows = (id: string) => Object.keys(a.tech?.mind(c.world, id)?.knows ?? {});
        const caps = new Set(a.tech?.capabilities(c.world) ?? ["cap:pottery"]);
        let nextNeighbour = v.neighbours.length;
        // A2: a yearly roll keyed by (module, purpose, year) — not by the command id.
        // Adding a plugin or a fate stir later must not rewrite this year's history.
        const result = chronicleYear(c.rng.keyed("village-chronicle", "year", v.year + 1), {
          tick: c.world.tick, year: v.year + 1, people, stores: v.stores, contacts: v.contacts, neighbours: v.neighbours,
          ceiling: (id, t) => a.heredity?.ceiling(c.world, id, t) ?? 60,
          kinship: (x, y) => a.heredity?.kinship(c.world, x, y) ?? (sameParents(people, x, y) ? 0.25 : 0),
          productivity: (k) => a.tech?.productivity(c.world, k) ?? 1,
          capabilities: caps,
          forewarned: (p) => a.tech?.forewarned(c.world, p) ?? false,
          institutions: new Set(a.polity?.list(c.world) ?? []),
          specialists: a.polity?.specialists(c.world).length ?? 0,
          head: a.polity?.head(c.world) ?? null,
          knows,
          outsiderKnowledge: (a.tech?.content().inventions ?? []).filter((i) => i.era === "village" || (v.contacts >= 3 && i.era === "chalcolithic")).map((i) => i.id),
          newId: () => `p:${v.nextId++}`,
          newName: () => `阿${SURNAME_FREE[v.nameSeq++ % SURNAME_FREE.length]}${Math.floor(v.nameSeq / SURNAME_FREE.length) ? toGen(Math.floor(v.nameSeq / SURNAME_FREE.length)) : ""}`,
          neighbourName: () => {
            const k = nextNeighbour++;
            return `${NEIGHBOURS[k % NEIGHBOURS.length]!}${k >= NEIGHBOURS.length ? toGen(Math.floor(k / NEIGHBOURS.length)) : ""}`;
          },
        });
        const effects: Effect[] = [];
        for (const [id, p] of result.people) {
          const before = people.get(id);
          if (!before) effects.push({ kind: "spawnEntity", localId: id, id, entityKind: ChronicleKinds.person, components: { [ChronicleComponents.person]: json(p) }, announce: false });
          else if (JSON.stringify(before) !== JSON.stringify(p)) effects.push({ kind: "setComponent", entityId: id, component: ChronicleComponents.person, value: json(p) });
        }
        const plan = result.plan;
        v.year = plan.year;
        v.stores = result.stores;
        v.contacts = result.contacts;
        v.neighbours = result.neighbours;
        v.lastYear = plan;
        v.alive = [...result.people].filter(([, p]) => p.alive).map(([id]) => id).sort();
        const name = (id: string) => result.people.get(id)?.name ?? id;
        const lines: string[] = [];
        if (plan.flood) lines.push(plan.forewarned ? "大水来了，好在早有准备。" : "大水漫过了河滩。");
        if (plan.drought) lines.push("大旱。");
        if (plan.hungerShare > 0.25) lines.push(`闹饥荒，${plan.deaths.filter((d) => d.cause === "hunger").length}人饿死。`);
        if (plan.newContact) lines.push(`头一回和${plan.newContact}的人打上了交道。`);
        if (plan.daughter) lines.push(`地不够种了，${plan.daughter.pop}个年轻人搬去${plan.daughter.name}另立了村子。`);
        const pop = v.alive.length;
        if (pop > v.peak && pop % 10 === 0) lines.push(`村里有${pop}口人了。`);
        v.peak = Math.max(v.peak, pop);
        if (pop <= 3 && pop > 0) lines.push("村里只剩寥寥几个人。");
        if (pop === 0) lines.push("最后一个人也走了，河岸台地空了。");
        for (const t of lines) v.log.push({ year: v.year, text: t });
        for (const d of plan.deaths) if (d.cause === "hunger" && plan.hungerShare <= 0.25) v.log.push({ year: v.year, text: `${name(d.id)}饿死了。` });
        v.log = v.log.slice(-MAX_LOG);
        effects.push({ kind: "setComponent", entityId: CHRONICLE_VILLAGE, component: ChronicleComponents.village, value: json(v) });
        return effects;
      },
    });

    ctx.registerResolutionRule({
      id: "village-chronicle.note.resolve",
      commandType: "village-chronicle.note",
      resolve: (c) => {
        const v = readVillage(c.world);
        if (!v) return [];
        return [{ kind: "setComponent", entityId: CHRONICLE_VILLAGE, component: ChronicleComponents.village, value: json({ ...v, log: [...v.log, { year: v.year, text: String(c.command.payload.text ?? "") }].slice(-MAX_LOG) }) }];
      },
    });

    // The chronicle writes itself from other plugins' events.
    const narrate = (eventType: string, line: (c: ReactionContext, n: (id: string) => string) => string | null) => ctx.registerReactionRule({
      id: `village-chronicle.narrate.${eventType}`,
      eventType,
      react: (c) => {
        const v = readVillage(c.world);
        if (!v) return [];
        const text = line(c, (id) => readPerson(c.world, id)?.name ?? "外乡人");
        if (!text) return [];
        return [{ kind: "setComponent", entityId: CHRONICLE_VILLAGE, component: ChronicleComponents.village, value: json({ ...v, log: [...v.log, { year: v.year, text }].slice(-MAX_LOG) }) }];
      },
    });
    const invName = (id: unknown) => apis().tech?.content().inventions.find((i) => i.id === id)?.name ?? String(id);
    const theory = (id: unknown) => apis().tech?.content().theories.find((t) => t.id === id);
    narrate("tech.invented", (c, n) => `${n(c.event.actorId ?? "")}${c.event.data.relearned ? "重新琢磨出了失传的" : "琢磨出了"}${invName(c.event.data.inventionId)}。`);
    narrate("tech.lost", (c, n) => `${n(c.event.actorId ?? "")}死后，再没人会做${invName(c.event.data.inventionId)}了。`);
    narrate("tech.theory_proposed", (c, n) => {
      const t = theory(c.event.data.theoryId);
      return t && c.event.data.first ? `${n(c.event.actorId ?? "")}说：“${t.claim}”` : null;
    });
    narrate("tech.theory_accepted", (c) => { const t = theory(c.event.data.theoryId); return t ? `“${t.label}”的说法，村里多数人都信了。` : null; });
    narrate("tech.theory_abandoned", (c) => { const t = theory(c.event.data.theoryId); return t ? `信“${t.label}”的人越来越少了。` : null; });
    narrate("polity.institution_adopted", (c) => `村里有了${String(c.event.data.label)}。`);
    narrate("polity.institution_lapsed", (c) => `${String(c.event.data.label)}渐渐没人当回事了。`);
    narrate("polity.head_changed", (c, n) => `大伙推${n(c.event.actorId ?? "")}当头人。`);
    narrate("polity-bondage.bonded", (c, n) => `${n(c.event.targetId ?? "")}还不上${n(c.event.actorId ?? "")}的粮，只好给人家做了债役。`);
    narrate("polity-bondage.abolished", () => "村里议定：从此不许拿人抵债，做债役的都放了。");
    narrate("era-ladder.recognized", (c) => `—— 后人说，从这时起，算是进了「${String(c.event.data.label)}」。`);
    narrate("era-ladder.regressed", (c) => `—— 世道倒退，又回到了「${String(c.event.data.label)}」。`);
    narrate("fate.nudged", (c) => `（天命：${String(c.event.data.kind).replace("fate.", "")} ${String(c.event.data.detail)}）`);
    narrate("heredity.born", (c, n) => c.event.data.blessingId ? `${n(c.event.targetId ?? "")}出生了。老人们后来都说，这孩子打小就不一般。` : null);

    ctx.registerProjection({
      id: "village-chronicle.log",
      description: "The village chronicle, optionally from a year on.",
      build: ({ world, params }) => {
        const v = readVillage(world);
        const from = Number(params.fromYear ?? 0);
        return { name: v?.name ?? "", year: v?.year ?? 0, population: living(world).length, lines: (v?.log ?? []).filter((l) => l.year >= from) };
      },
    });
  },
};

function sameParents(people: Map<string, ChroniclePerson>, a: string, b: string): boolean {
  const x = people.get(a); const y = people.get(b);
  return !!x && !!y && !!x.motherId && (x.motherId === y.motherId || x.fatherId === y.fatherId || x.motherId === b || x.fatherId === b || y.motherId === a || y.fatherId === a);
}

function toGen(n: number): string {
  return ["", "二", "三", "四", "五", "六", "七", "八", "九"][n % 9] ?? String(n);
}
