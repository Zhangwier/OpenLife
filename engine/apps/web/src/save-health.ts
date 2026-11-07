/**
 * Disk-save health and the retrying atomic write (split out of server.ts).
 */
import { rename, rm, writeFile } from "node:fs/promises";

/**
 * The last disk-write outcome, so the page can show it.
 *
 * SAVE-01 asks that a save failure be visible rather than only logged: the
 * server used to write `console.error` and the player saw nothing, so a world
 * that had stopped reaching disk looked identical to one that was safe.
 * `state` is "off" when persistence is disabled for this process.
 *
 * `reason` is developer-facing detail (`EEXIST: ... mkdir 'C:\...'`) and is for
 * the console and diagnostics. `playerReason` is what the page may show:
 * UI-004 forbids answering a player with a raw technical code or a server path.
 */
export interface SaveHealth {
  state: "off" | "ok" | "failed";
  reason: string;
  playerReason: string;
  at: string;
  path: string;
}

/** A failure reason a player can act on: no errno, no file paths. */
export function describeSaveFailure(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code ?? "";
  const status = (error as { status?: number }).status;
  if (code === "ENOSPC" || status === 507) return "这台设备的磁盘空间不够了。";
  if (code === "EROFS" || code === "EACCES" || code === "EPERM") return "服务器没有权限把它写到磁盘上。";
  if (code === "ENOTDIR" || code === "EEXIST") return "服务器上给它准备的存放位置不是一个可用的文件夹。";
  if (code === "ENOENT") return "服务器上给它准备的存放文件夹不见了。";
  if (code === "EBUSY") return "磁盘上的这一份一直被占用，腾不出手来写。";
  return "原因还不清楚，服务器日志里有更详细的记录。";
}

/**
 * Errors that mean "try again", not "this world cannot be saved".
 *
 * On Windows, `rename` over a destination that another handle currently holds
 * open fails with EPERM/EACCES (measured: 20/20 failures while a reader is open,
 * 20/20 successes once it closes). The autosave timer renames over the same path
 * every interval, so a single transient lock must not be reported as a lost
 * save. Only errors that persist across the retries below become failures.
 */
const TRANSIENT_SAVE_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const SAVE_RETRY_DELAYS_MS = [40, 120, 360];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Atomically writes the snapshot, retrying a temporarily locked destination. */
export async function renameIntoPlace(tmpPath: string, savePath: string, body: string): Promise<void> {
  await writeFile(tmpPath, body, "utf8");
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tmpPath, savePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      const last = attempt >= SAVE_RETRY_DELAYS_MS.length;
      if (last || !TRANSIENT_SAVE_CODES.has(code)) {
        await rm(tmpPath, { force: true });
        throw error;
      }
      await sleep(SAVE_RETRY_DELAYS_MS[attempt]!);
    }
  }
}
