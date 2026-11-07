/**
 * Long-run benchmark: how fast a village day is, and how big a save gets.
 *
 * Plays the opening settlement (seed 7) for N in-game days the way the Web
 * page's 「过一天」 does (settlement-locations.end_day, then one day passes), then reports per-day latency (p50 / p95 / max, first
 * and last 30 days), the save size, the event-journal length and the live vs
 * archived relation counts.
 *
 *   npm run bench                      # 120 days, print the report
 *   npm run bench -- --days 360        # a whole year
 *   npm run bench -- --check           # exit 1 when over scripts/bench-budget.json
 *   npm run bench -- --json            # machine-readable report
 *
 * Budgets are deliberately loose (CI machines vary); they exist to catch a
 * change that makes days O(history) again, not to measure a laptop.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import { villageStoriesModule } from "@openlife/module-village-stories";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BUDGET_PATH = path.join(ROOT, "scripts", "bench-budget.json");

export interface Budget { days: number; p95Ms: number; last30OverFirst30: number; saveKB: number; journalEvents: number }
export interface BenchReport {
  days: number; p50: number; p95: number; max: number; first30: number; last30: number;
  saveKB: number; journalEvents: number; journalKB: number; relationsLive: number; relationsAll: number;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export function bench(days: number): BenchReport {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule, villageStoriesModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(18 * 360);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const ms: number[] = [];
  for (let d = 0; d < days; d += 1) {
    const t = performance.now();
    // What the Web does for 过一天 (apps/web/src/player.ts): the command, then the day passes.
    const r = sim.dispatch({ type: SettlementCommands.step, actorId: me, source: "player", payload: {} as never });
    if (!r.ok) throw new Error(`day ${d}: ${r.errors[0]?.message}`);
    sim.advanceBy(1);
    ms.push(performance.now() - t);
  }
  // Measured the way the Web autosaves: compact JSON of the save package.
  const pkg = sim.save();
  const save = JSON.stringify(pkg);
  const w = sim.worldView();
  const sorted = [...ms].sort((a, b) => a - b);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    days, p50: r1(quantile(sorted, 0.5)), p95: r1(quantile(sorted, 0.95)), max: r1(sorted.at(-1) ?? 0),
    first30: r1(mean(ms.slice(0, 30))), last30: r1(mean(ms.slice(-30))),
    saveKB: Math.round(save.length / 1024), journalEvents: pkg.eventJournal.length, journalKB: Math.round(JSON.stringify(pkg.eventJournal).length / 1024),
    relationsLive: w.listRelations({}).length, relationsAll: w.listRelations({ includeArchived: true }).length,
  };
}

/** Over-budget lines (empty when within budget). */
export function overBudget(r: BenchReport, b: Budget): string[] {
  const out: string[] = [];
  if (r.p95 > b.p95Ms) out.push(`p95 ${r.p95}ms > ${b.p95Ms}ms`);
  if (r.last30 > r.first30 * b.last30OverFirst30 + 5) out.push(`days slow down with history: last30 ${r.last30}ms vs first30 ${r.first30}ms (allowed ×${b.last30OverFirst30})`);
  if (r.saveKB > b.saveKB) out.push(`save ${r.saveKB}KB > ${b.saveKB}KB`);
  if (r.journalEvents > b.journalEvents) out.push(`journal ${r.journalEvents} events > ${b.journalEvents}`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const budget = JSON.parse(fs.readFileSync(BUDGET_PATH, "utf8")) as Budget;
  const i = process.argv.indexOf("--days");
  const days = i > 0 ? Number(process.argv[i + 1]) : budget.days;
  const report = bench(days);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report));
  else {
    console.log(`${report.days} 天：p50 ${report.p50}ms  p95 ${report.p95}ms  max ${report.max}ms  前30天 ${report.first30}ms  后30天 ${report.last30}ms`);
    console.log(`存档 ${report.saveKB}KB  事件日志 ${report.journalEvents} 条 / ${report.journalKB}KB  关系 ${report.relationsLive} 条在用 / ${report.relationsAll} 条（含历史）`);
  }
  if (process.argv.includes("--check")) {
    if (days !== budget.days) { console.error(`--check runs the budget's ${budget.days} days`); process.exit(2); }
    const over = overBudget(report, budget);
    if (over.length) { console.error(`over budget:\n${over.join("\n")}`); process.exit(1); }
    console.log("within budget.");
  }
}
