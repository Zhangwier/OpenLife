/**
 * 「我这一生」的读写端口。
 *
 * `replay.ts` 只管记录与重放本身；这个文件管的是「一局现在是什么、导出时带哪些
 * 上下文、导入时怎么把它变成新的一局」。分开的理由很实际：`server.ts` 有行数上限，
 * 而这里每一步都要解释「为什么这么做」。
 *
 * 导出携带的上下文有三样，缺一样就重放不出来：
 *   - 开局选项。种子只决定世界，名字、城市与出身决定「你是谁」。
 *   - 模块清单。少装一个模块，同样的命令会在半路被拒。
 *   - 内容包清单。内容包改的是数据（事件、居民、配方），它不进模块清单。
 *
 * 记录器不装在建局那一刻：建局本身要下发几十条命令（设世界、造角色、建村、装地图、
 * 接历史实验室），而重放又是靠 `opening` 重走一遍建局的——把那些命令也记下来，
 * 重放时建局会执行两遍，世界里会多出一个村子。所以只记建局之后玩家与界面下发的输入。
 */
import { DAY_TICKS_PER_YEAR } from "@openlife/life-contracts";
import type { OpenLifeModule } from "@openlife/contracts";
import type { Simulation } from "@openlife/simulation";
import { humanizeEvent } from "./humanize.ts";
import { hasRecorder, replayFile, replayOf, type ReplayFile } from "./replay.ts";

/** 导出/导入都要带的那点上下文。 */
export interface LifeContext {
  /** 与 `createGame(options)` 同一份选项；重放时原样传回去。 */
  opening: Record<string, unknown> | null;
  /**
   * 这一局的前半程是不是在别处过的。
   *
   * 读档进来的世界既有开局选项（那是上一局留下的）也有记录器（从读档那一刻开始记），
   * 单看这两样会得出「完整」——但前半生的输入谁也没记下来。所以由调用方明说。
   */
  partial?: boolean;
  modules: readonly OpenLifeModule[];
  packs: readonly string[];
}

/**
 * 导出当前这一局。
 *
 * 三件事会让文件变成 `partial`（生平能读、重放只能从现在往后）：
 *   - 调用方说这半生不在本进程：读档进来的世界。
 *   - 没有记录器：同上，输入没记过。
 *   - 没有开局选项：重放不出「同一个人」。
 * 照实标出来，比给一份重放不出原样、却看不出来的文件好。
 */
export function exportLife(sim: Simulation, context: LifeContext): ReplayFile {
  const partial = context.partial === true || context.opening === null || !hasRecorder(sim);
  return replayOf(sim, {
    opening: context.opening ?? { seed: sim.kernel.worldSeed },
    modules: context.modules,
    packs: context.packs,
    daysPerYear: DAY_TICKS_PER_YEAR,
    humanize: humanizeEvent,
    partial,
  });
}

/** 判断一份外部数据是不是本格式的重放文件。 */
export function isReplayFile(value: unknown): value is ReplayFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<ReplayFile>;
  return file.format === "openlife.replay.1"
    && typeof file.seed === "number"
    && Array.isArray(file.steps)
    && typeof file.fingerprint === "string";
}

/**
 * 重放一份人生。
 *
 * 指纹对不上不算失败——那份文件可能是在别的模块组合下录的，能跑到哪一步就到哪
 * 一步；界面上说清楚「这不是同一条人生」比直接拒绝有用。
 */
export function importLife(
  file: ReplayFile,
  open: (opening: Record<string, unknown>) => Simulation,
): { sim: Simulation; result: { ok: boolean; applied: number; failed: string[]; same: boolean; partial: boolean } } {
  const replayed = replayFile(file, open);
  return {
    sim: replayed.sim,
    result: {
      ok: replayed.ok,
      applied: replayed.applied,
      failed: replayed.failed,
      same: replayed.same,
      partial: file.partial === true,
    },
  };
}
