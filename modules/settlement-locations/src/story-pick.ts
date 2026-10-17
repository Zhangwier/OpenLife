/**
 * Which season story the storyteller tells (split out of module.ts).
 *
 * An event must be *possible* here, not merely in season: a bad harvest says
 * nothing in a village with no field, and a wildfire should not strike twice
 * in a row. Preconditions and a cooldown are checked before the deterministic
 * pick, so the chosen story always describes something the village can see.
 *
 * 天灾不掷骰子：地点有 world-hazard 在跟踪时，只在这一季真的发过水/旱过时讲，
 * 而且一定讲；没有跟踪（旧世界、测试）时保持原来的随机年景。
 */
import type { JsonValue, WorldView } from "@openlife/contracts";
import { DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";
import { RIVER_TERRACE_PACK } from "./content.ts";
import { pickIndex } from "./happenings.ts";
import { SettlementComponents, SettlementId } from "./vocabulary.ts";

const STORY = RIVER_TERRACE_PACK.storyteller;
type StoryEvent = NonNullable<typeof STORY>["events"][number];

/** When each story event last happened, so a cooldown is measured in real time. */
export function storyHistory(world: WorldView): Record<string, number> {
  const raw = world.getComponent(SettlementId, SettlementComponents.settlement)?.storyLastAt;
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw))
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = Number(v ?? -1);
  return out;
}

export interface StoryContext {
  season: string;
  /** The season key the deterministic pick is salted with. */
  key: string;
  population: number;
  stockTotal: (resourceId: string) => number;
  roofLeaking: boolean;
}

/** Did this hazard strike `at` this season? undefined when no hazard is tracked there. */
function struck(world: WorldView, kind: "flood" | "drought", at = ""): boolean | undefined {
  const state = world.getComponent(at, "world-hazard.state") as Record<string, JsonValue> | undefined;
  if (!state) return undefined;
  const track = (state[kind] ?? {}) as Record<string, JsonValue>;
  const last = track.lastStrikeAt === null || track.lastStrikeAt === undefined ? -Infinity : Number(track.lastStrikeAt);
  return track.stage === "active" || track.stage === "aftermath" || last > world.tick - DAY_TICKS_PER_YEAR / 4;
}

export function chooseSeasonStory(world: WorldView, ctx: StoryContext): StoryEvent | undefined {
  if (!STORY) return undefined;
  const tick = world.tick;
  const history = storyHistory(world);
  const eligible = (e: StoryEvent) => {
    const req = e.requires;
    if (req) {
      if (req.population?.min !== undefined && ctx.population < req.population.min) return false;
      if (req.population?.max !== undefined && ctx.population > req.population.max) return false;
      for (const c of req.stockBelow ?? []) if (ctx.stockTotal(c.resourceId) >= c.amount) return false;
      for (const c of req.stockAtLeast ?? []) if (ctx.stockTotal(c.resourceId) < c.amount) return false;
      if (req.roofLeaking !== undefined && req.roofLeaking !== ctx.roofLeaking) return false;
    }
    const cool = e.cooldownYears ?? 0;
    const last = history[e.id] ?? -1;
    return !(cool > 0 && last >= 0 && tick - last < cool * DAY_TICKS_PER_YEAR);
  };
  const inSeasonPool = STORY.events.filter((e) => e.seasons.includes(ctx.season) && eligible(e));
  // 夏末发的水，到秋天换季时也照样要讲：先找当季的说法，没有就用别季的。
  const forced = inSeasonPool.find((e) => e.hazard && struck(world, e.hazard, e.at) === true)
    ?? STORY.events.filter(eligible).find((e) => e.hazard && struck(world, e.hazard, e.at) === true);
  if (forced) return forced;
  // Hazard-tied stories are never drawn at random: they are either forced by a
  // real strike, or withheld. Stories excluding a hazard stand down when it hit.
  const pool = inSeasonPool.filter((e) => {
    if (e.hazard && struck(world, e.hazard, e.at) !== undefined) return false;
    if (e.excludes && struck(world, e.excludes, e.at) === true) return false;
    return true;
  });
  if (!pool.length || pickIndex(`story:${ctx.key}`, 100) >= Math.round(STORY.chance * 100)) return undefined;
  return pool[pickIndex(`story:${ctx.key}:which`, pool.length)]!;
}
