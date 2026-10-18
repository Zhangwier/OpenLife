/**
 * 插件开关：标记哪些模块下次启动时关掉。
 *
 * 运行时立即 unload 是危险的：其他模块可能正依赖它，世界可能正在用它。
 * 更安全的设计是**标记为「下次启动时关」**——存进一个文件，启动时
 * modulePlan 读它，像现在读环境变量一样。
 *
 * 这样开关是**声明**，不是**动作**：你点了「关」，世界不会立刻变，但下次
 * 启动时它就不在了。这比立即 unload 安全得多。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SWITCH_PATH = fileURLToPath(new URL("../data/module-switches.json", import.meta.url));

interface Switches {
  off: string[];
}

function readSwitches(): Switches {
  if (!existsSync(SWITCH_PATH)) return { off: [] };
  try {
    return JSON.parse(readFileSync(SWITCH_PATH, "utf8")) as Switches;
  } catch {
    return { off: [] };
  }
}

function writeSwitches(switches: Switches): void {
  writeFileSync(SWITCH_PATH, JSON.stringify(switches, null, 2) + "\n");
}

/** 标记一个模块下次启动时关掉。 */
export function markModuleOff(moduleId: string): void {
  const s = readSwitches();
  if (!s.off.includes(moduleId)) {
    writeSwitches({ off: [...s.off, moduleId] });
  }
}

/** 取消标记。 */
export function markModuleOn(moduleId: string): void {
  const s = readSwitches();
  writeSwitches({ off: s.off.filter((id) => id !== moduleId) });
}

/** 读标记：哪些模块下次启动时关掉。 */
export function markedOff(): string[] {
  return readSwitches().off;
}
