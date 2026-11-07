/**
 * 插件开关：标记哪些模块下次启动时关掉。
 *
 * 运行时立即 unload 是危险的：其他模块可能正依赖它，世界可能正在用它。
 * 更安全的设计是**标记为「下次启动时关」**——存进服务器上的一个文件，启动时
 * modulePlan 读它，像现在读环境变量一样。
 *
 * 这样开关是**声明**，不是**动作**：你点了「关」，世界不会立刻变，但下次
 * 启动时它就不在了。这比立即 unload 安全得多。
 */

/** 标记一个模块下次启动时关掉。 */
export async function markModuleOff(moduleId) {
  await fetch("/api/module/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ moduleId, enabled: false }),
  });
}

/** 取消标记。 */
export async function markModuleOn(moduleId) {
  await fetch("/api/module/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ moduleId, enabled: true }),
  });
}

/** 读标记（从服务器）。 */
export async function markedOff() {
  try {
    const r = await fetch("/api/catalog");
    const data = await r.json();
    return (data.modules ?? []).filter((m) => m.markedOff === true).map((m) => m.id);
  } catch { return []; }
}

/** 一个模块现在是不是被标记为「下次关掉」。 */
export async function isMarkedOff(moduleId) {
  return (await markedOff()).includes(moduleId);
}
