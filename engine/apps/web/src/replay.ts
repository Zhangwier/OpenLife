/**
 * 「我这一生」：把一局输入记成几 KB 的文本，别人导入后能逐字重放。
 *
 * 这套东西靠的是引擎本来就有的确定性（同种子 + 同指令 = 同指纹），所以记的不是
 * 状态而是**输入**：种子、开局选项、之后每一条外部指令、每一次时钟推进。状态是
 * 从这些东西里算出来的。
 *
 * 记哪些、不记哪些，是这里唯一需要判断的事：
 *   - 玩家的选择必须记。它是这一生里真正「有人做了决定」的那部分。
 *   - 时钟推进必须记。它本身不是命令，漏掉它重放出来的世界会在时间线上错位，
 *     所有按 tick 算的东西（年龄、季节、冷却）都会跟着错。
 *   - `source: "ai"` 的命令**不记**。它是由种子推出来的：重放时同样的种子会推出
 *     一模一样的决定，记下来只会在重放时把它们执行两遍。
 *   - 自动推进（autosim）走的是 kernel 而不是 sim，本来就不经过这里；它推进的那
 *     段时间会以 `advance` 步落账，重放时 kernel 会把同一批 agent 再跑一遍。
 *
 * 开局（建村、装地图、接历史实验室）也不记：它由 `createGame(seed, opening)` 一条
 * 路走出来，重放时用同样的参数再走一遍即可。
 */
import type { CommandIntent, CommandResult, OpenLifeModule } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";

/** 一条外部输入：一条命令，或者一次时钟推进/跳到某个时刻。 */
export type ReplayEntry =
  | {
    kind: "command";
    type: string;
    source: string;
    payload: Record<string, unknown>;
    actorId?: string;
    targetId?: string;
  }
  | { kind: "advance"; ticks: number };

/** 这一生里值得再读一遍的事。 */
export interface LifeStoryEntry {
  at: number;
  year: number;
  text: string;
}

export interface ReplayFile {
  format: "openlife.replay.1";
  seed: number;
  /** 与 `createGame(options)` 同一份选项，重放时原样传回去。 */
  opening: Record<string, unknown>;
  modules: string[];
  packs: string[];
  tick: number;
  fingerprint: string;
  steps: ReplayEntry[];
  story: LifeStoryEntry[];
  /**
   * 这一局的一半生在别的进程里（从存档恢复的），记不到输入。
   * 这样的文件只有生平可读，重放出来的是「从存档那一点往后」的人生。
   */
  partial?: boolean;
}

/** 由种子推导的来源。记下来会在重放时把同一个决定执行两遍。 */
const DERIVED = new Set(["ai"]);

/** 记录器：已记的输入，以及「上次记到哪个时刻」。 */
export interface Recorder {
  steps: ReplayEntry[];
  /** 把这一局到现在为止推进过的时间补记成一条；导出前必须调一次。 */
  syncClock(): void;
}

/** 每个 Simulation 上装的那一个记录器（同一局只装一次）。 */
const RECORDERS = new WeakMap<Simulation, Recorder>();

/**
 * 给一局装上记录器。
 *
 * 装两次没有意义（第二次包在第一次外面，会把同一条命令记两遍），所以已经装过
 * 就直接返回原来那份。
 *
 * 时间不是靠包住 `advanceBy` 记的，而是在每条命令之前比对一次当前 tick。原因是
 * 自动推进（`runAutoSim`）走的是 `kernel` 而不是 `sim`，包住 `sim.advanceBy`
 * 根本看不到它推进的那些天。比对 tick 则无论谁推进的都算数。
 */
export function recordLife(sim: Simulation): Recorder {
  const existing = RECORDERS.get(sim);
  if (existing) return existing;

  const steps: ReplayEntry[] = [];
  let marked = sim.tick;
  const syncClock = (): void => {
    const delta = sim.tick - marked;
    if (!Number.isInteger(delta) || delta <= 0) { marked = sim.tick; return; }
    steps.push({ kind: "advance", ticks: delta });
    marked = sim.tick;
  };

  const mutable = sim as unknown as { dispatch(intent: CommandIntent): CommandResult };
  const dispatch = mutable.dispatch.bind(sim);
  mutable.dispatch = (intent: CommandIntent): CommandResult => {
    // 先补时间，再记命令：重放时顺序必须是「把日子过到那一刻」→「做那件事」。
    syncClock();
    const result = dispatch(intent);
    // 只记成功的命令：被拒的命令没有改变世界，重放时它会因为同样的原因再被拒
    // 一次，除了噪音没有别的作用。
    const source = intent.source ?? "player";
    if (!result.ok || DERIVED.has(source)) return result;
    const entry: ReplayEntry = {
      kind: "command",
      type: intent.type,
      source,
      payload: (intent.payload ?? {}) as Record<string, unknown>,
    };
    if (intent.actorId !== undefined) entry.actorId = intent.actorId;
    if (intent.targetId !== undefined) entry.targetId = intent.targetId;
    steps.push(entry);
    return result;
  };

  const recorder: Recorder = { steps, syncClock };
  RECORDERS.set(sim, recorder);
  return recorder;
}

/** 取这一局已经记下的输入；没装过记录器就是空数组。 */
export function recordedSteps(sim: Simulation): ReplayEntry[] {
  return RECORDERS.get(sim)?.steps ?? [];
}

/** 这一局是不是从 `new Simulation` 那一刻就在记。 */
export function hasRecorder(sim: Simulation): boolean {
  return RECORDERS.has(sim);
}

/** 导出前补齐最后一段没被命令夹住的时间。 */
export function syncRecordedClock(sim: Simulation): void {
  RECORDERS.get(sim)?.syncClock();
}

/** 把记下来的输入逐条送回一局新世界。 */
export function replayInto(sim: Simulation, file: ReplayFile): { ok: boolean; applied: number; failed: string[] } {
  const failed: string[] = [];
  let applied = 0;
  for (const [index, step] of file.steps.entries()) {
    if (step.kind === "advance") {
      sim.advanceBy(step.ticks);
      applied += 1;
      continue;
    }
    const intent: CommandIntent = {
      type: step.type,
      payload: step.payload as never,
      source: step.source as CommandIntent["source"],
      ...(step.actorId !== undefined ? { actorId: step.actorId } : {}),
      ...(step.targetId !== undefined ? { targetId: step.targetId } : {}),
    };
    const result = sim.dispatch(intent);
    if (result.ok) { applied += 1; continue; }
    // 第一步就失败通常意味着模块清单对不上；继续跑下去只会把后面的错都记在它头上。
    failed.push(`${index}:${step.type} ${result.errors[0]?.message ?? "failed"}`);
    if (applied === 0) break;
  }
  return { ok: failed.length === 0, applied, failed };
}

/**
 * 按种子与开局选项造一局，然后重放。
 *
 * 造局这一步由调用方注入（网页版的 `createGame` 里除了 Simulation 还有地图包与
 * 历史实验室的接线，那些属于应用层，不属于这个文件）。指纹用来证明「重放真的重
 * 放出了同一个世界」，比逐字比对状态便宜得多。
 */
export function replayFile(
  file: ReplayFile,
  open: (opening: Record<string, unknown>) => Simulation,
): { sim: Simulation; ok: boolean; applied: number; failed: string[]; same: boolean } {
  // 开局用文件里那份选项重走一遍（名字、出身、天赋都在里面），不靠记下来的命令：
  // 那些命令本身就是开局的一部分，重放时再执行一遍会造出第二个角色。
  const sim = open(file.opening);
  const result = replayInto(sim, file);
  const same = sim.kernel.fingerprint() === file.fingerprint;
  return { sim, ...result, same };
}

/** 造一局的函数形状，方便调用方直接传 `createGame`。 */
export type OpenLike = (options: Record<string, unknown>) => Simulation;

/**
 * 从事件记录里挑出「这一生值得再读一遍」的那些，写成一句话一条。
 *
 * 门槛只有一条：历史意义 ≥ 0.4，或者它属于人生本身的转折（出生、成年、成亲、
 * 得子、亡故）。其余事件——今天挖了几个黏土、跟谁说了句话——不进来，否则导出
 * 的文件会长到没人读。`humanize` 由调用方传入，因为把事件翻成人话是界面的职责，
 * 引擎不该知道自己被怎么讲。
 */
export function lifeStory(
  events: readonly { at: number; type: string; data?: Record<string, unknown>; historicalSignificance?: number }[],
  humanize: (type: string, data: Record<string, unknown>) => string,
  daysPerYear: number,
): LifeStoryEntry[] {
  const turning = /(character_died|life-stages\.|passed_away|\.wed$|\.handoff$|born)/;
  const rows: LifeStoryEntry[] = [];
  for (const event of events) {
    const weight = Number(event.historicalSignificance ?? 0);
    if (weight < 0.4 && !turning.test(event.type)) continue;
    const text = humanize(event.type, event.data ?? {});
    if (!text) continue;
    rows.push({ at: event.at, year: Math.floor(event.at / Math.max(1, daysPerYear)) + 1, text });
  }
  // 后面的事件更接近「现在」，保留最近的两百条。
  return rows.slice(-200);
}

/** 模块清单只留 id@version，够用来判断「这份重放需要装什么」。 */
export function moduleStamps(modules: readonly OpenLifeModule[]): string[] {
  return modules.map((module) => `${module.manifest.id}@${module.manifest.version}`).sort();
}

/**
 * 把这一局打包成一份可分享的文本。
 *
 * 只带走「重放需要的」：种子、开局选项、输入、模块与内容包清单，外加一份人读的
 * 生平。世界状态一个字节都不带——它是这些输入算出来的，带上了反而会让两份文件
 * 在同样的输入下互相矛盾。
 */
export function replayOf(
  sim: Simulation,
  options: {
    opening: Record<string, unknown>;
    modules: readonly OpenLifeModule[];
    packs: readonly string[];
    daysPerYear: number;
    humanize: (type: string, data: Record<string, unknown>) => string;
    partial?: boolean;
  },
): ReplayFile {
  syncRecordedClock(sim);
  const events = sim.kernel.internals.eventLog.all();
  return {
    format: "openlife.replay.1",
    seed: sim.kernel.worldSeed,
    opening: options.opening,
    modules: moduleStamps(options.modules),
    packs: [...options.packs],
    tick: sim.tick,
    fingerprint: sim.kernel.fingerprint(),
    steps: recordedSteps(sim),
    story: lifeStory(events, options.humanize, options.daysPerYear),
    ...(options.partial ? { partial: true } : {}),
  };
}
