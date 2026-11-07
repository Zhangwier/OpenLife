/**
 * 村史推演 / history lab.
 *
 *   npm run chronicle -- --seed 7 --years 300
 *   npm run chronicle -- --seed 7 --years 400 --bless 30:trait:insight,trait:memory --compare
 *   npm run chronicle -- --seed 7 --years 300 --without polity-bondage,fate
 *
 * Nudges (need fate in lab mode, which --bless/--inspire/--encounter/--stir switch on):
 *   --bless YEAR:TRAIT[,TRAIT]        a child born from that year on gets those traits at the tail
 *   --inspire YEAR:ID[:FACTOR]        an invention or theory becomes FACTOR times likelier for 10 years
 *   --encounter YEAR:INVENTION        villagers get to see it made elsewhere
 *   --stir YEAR:INSTITUTION[:FACTOR]  an institution (or institution:abolition) takes hold more easily
 * --compare runs the same seed without the nudges and prints both histories side by side.
 * --log eras|all  what to print from the chronicle (default eras: era changes and inventions).
 */
import { parseArgs } from "node:util";
import {
  ALL_PLUGINS, buildChronicle, runYear, summarize, type ChroniclePlugin, type FateNudge,
} from "@openlife/module-village-chronicle";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "7" }, years: { type: "string", default: "200" }, founders: { type: "string", default: "14" },
    without: { type: "string", default: "" }, bless: { type: "string", multiple: true }, inspire: { type: "string", multiple: true },
    encounter: { type: "string", multiple: true }, stir: { type: "string", multiple: true }, compare: { type: "boolean", default: false },
    log: { type: "string", default: "eras" }, json: { type: "boolean", default: false },
  },
});

const nudges: FateNudge[] = [];
for (const b of values.bless ?? []) { const [y, rest] = split(b); nudges.push({ year: y, type: "fate.bless_birth", payload: { traits: rest.split(",") } }); }
for (const b of values.inspire ?? []) { const [y, rest] = split(b); const [id, f] = splitLast(rest); nudges.push({ year: y, type: "fate.inspire", payload: { targetId: id, factor: f ?? 5 } }); }
for (const b of values.encounter ?? []) { const [y, rest] = split(b); nudges.push({ year: y, type: "fate.encounter", payload: { inventionId: rest } }); }
for (const b of values.stir ?? []) { const [y, rest] = split(b); const [id, f] = splitLast(rest); nudges.push({ year: y, type: "fate.stir", payload: { institutionId: id, factor: f ?? 5 } }); }

const without = values.without.split(",").filter(Boolean) as ChroniclePlugin[];
const plugins = ALL_PLUGINS.filter((p) => !without.includes(p));
const seed = Number(values.seed);
const years = Number(values.years);

function run(withNudges: FateNudge[]) {
  const sim = buildChronicle({ seed, founders: Number(values.founders), plugins, fateMode: withNudges.length ? "lab" : "observer" });
  const timeline: Array<{ year: number; known: string[]; era: unknown }> = [];
  for (let y = 0; y < years; y++) {
    runYear(sim, withNudges);
    const s = summarize(sim);
    timeline.push({ year: s.year as number, known: s.known as string[], era: s.era });
  }
  const log = (sim.project({ id: "village-chronicle.log", params: {} }).data as { lines: Array<{ year: number; text: string }> }).lines;
  return { summary: summarize(sim), timeline, log };
}

const main = run(nudges);
if (values.json) {
  console.log(JSON.stringify(main.summary, null, 2));
} else {
  print(nudges.length ? "有天命的这一边" : "村史", main);
}
if (values.compare && nudges.length) {
  const base = run([]);
  print("同一个种子，没有天命", base);
  console.log("\n== 对比 ==");
  const diverge = main.timeline.find((t, i) => JSON.stringify(t.known) !== JSON.stringify(base.timeline[i]?.known));
  console.log(diverge ? `第一次在会做的东西上分岔：第 ${diverge.year} 年` : "会做的东西始终一样");
  const firstYear = (tl: typeof main.timeline, name: string) => tl.find((t) => t.known.includes(name))?.year;
  const names = [...new Set([...(main.summary.known as string[]), ...(base.summary.known as string[])])];
  for (const n of names) {
    const a = firstYear(main.timeline, n); const b = firstYear(base.timeline, n);
    if (a !== b) console.log(`  ${n}: 有天命 ${a ?? "—"} 年 / 没有 ${b ?? "—"} 年`);
  }
  console.log(`  最后的时代：有天命「${String(main.summary.era)}」 / 没有「${String(base.summary.era)}」`);
}

function print(title: string, r: ReturnType<typeof run>) {
  console.log(`\n== ${title}（种子 ${seed}，${years} 年）==`);
  const keep = values.log === "all" ? () => true : (t: string) => /琢磨出|失传|再没人会|进了|倒退|天命|不一般|说：|多数人都信|有了|债役|另立/.test(t);
  for (const l of r.log.filter((x) => keep(x.text))) console.log(`${String(l.year).padStart(4)}  ${l.text}`);
  const s = r.summary;
  console.log(`\n现在：第 ${String(s.year)} 年，${String(s.population)} 口人，时代「${String(s.era)}」${(s.features as string[]).length ? `（${(s.features as string[]).join("、")}）` : ""}`);
  console.log(`会做：${(s.known as string[]).join("、") || "—"}`);
  if ((s.lost as string[]).length) console.log(`失传：${(s.lost as string[]).join("、")}`);
  console.log(`公认的道理：${(s.accepted as string[]).join("、") || "—"}`);
  console.log(`制度：${(s.institutions as string[]).join("、") || "—"}`);
}

function split(s: string): [number, string] { const i = s.indexOf(":"); return [Number(s.slice(0, i)), s.slice(i + 1)]; }
function splitLast(s: string): [string, number | undefined] {
  const i = s.lastIndexOf(":");
  const tail = Number(s.slice(i + 1));
  return i > 0 && Number.isFinite(tail) ? [s.slice(0, i), tail] : [s, undefined];
}
