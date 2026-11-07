import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("web: gather and weave real materials, recover a failed trial, install and resume from a save", { timeout: 60000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, PORT: "0", OPENLIFE_PERSISTENCE: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let errors = ""; child.stderr.on("data", d => errors += d);
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let out = ""; const timer = setTimeout(() => reject(new Error(errors || "startup timeout")), 15000);
      child.stdout.on("data", d => { out += d; const url = out.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/)?.[0]; if (url) { clearTimeout(timer); resolve(url); } });
      child.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
    });
    const api = async (path: string, body?: unknown) => (await fetch(`${base}/api/${path}`, body ? {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {})).json() as Promise<Record<string, any>>;
    let s = await api("state"); const started = s.tick;
    const act = async (action: string, payload: Record<string, unknown> = {}) => {
      let d = await api("action", { action, payload, expectedTick: s.tick }); s = d.state;
      if (!d.result.ok && /活动时间|今天只剩|今天还剩/.test(d.result.errors?.[0]?.message ?? "")) {
        const day = await api("action", { action: "settlement-locations.end_day", expectedTick: s.tick }); s = day.state;
        d = await api("action", { action, payload, expectedTick: s.tick }); s = d.state;
      }
      assert.equal(d.result.ok, true, `${action}: ${JSON.stringify(d.result.errors)}`); return d;
    };
    const go = (placeId: string) => act("settlement-locations.arrive", { placeId, travelMode: "local" });
    const draw = (resourceId: string) => act("settlement-locations.draw", { resourceId });
    assert.equal(s.outlook.progress.routes.length, 4);
    await act("settlement-locations.improvement.start");
    await go("place:reedbed"); await draw("resource:reed");
    await act("settlement-locations.craft", { recipeId: "recipe:twist-rope" });
    await go("place:chestnut-wood"); await draw("resource:wood"); await draw("resource:wood");
    await go("place:stone-beach"); await draw("resource:stone"); await go("place:river");
    await act("settlement-locations.improvement.prepare");
    await act("settlement-locations.improvement.trial", { method: "rush" });
    assert.equal(s.outlook.progress.improvement.failures, 1);
    await act("settlement-locations.end_day");
    await act("settlement-locations.improvement.trial", { method: "balance" });
    const installed = await act("settlement-locations.improvement.install");
    assert.ok(installed.narrative.some((line: string) => line.includes("安好了桔槔")));
    assert.equal(s.outlook.progress.improvement.stage, "installed");
    assert.ok(s.tick - started < 60, "completed within the initial season");
    const save = (await api("save", {})).save;
    const loaded = await api("load", { save }); s = loaded.state;
    assert.equal(loaded.result?.ok, true, JSON.stringify(loaded));
    assert.equal(s.outlook.progress.improvement.stage, "installed");
    const beforeUsed = s.settlement.dailyActivity.used;
    const repeat = await api("action", { action: "settlement-locations.improvement.install", expectedTick: s.tick }); s = repeat.state;
    assert.equal(repeat.result.ok, false); assert.equal(s.settlement.dailyActivity.used, beforeUsed);
    await go("place:yard"); await act("settlement-build.plan", { blueprintId: "blueprint:shed" });
    assert.ok(s.outlook.progress.buildings.some((a: any) => a.id === "settlement-build.deliver"));
    // Unresolved delayed events survive waiting and interrupt a time batch before it skips them.
    const wait = await api("autosim", { mode: "continuous-batch", days: 5, stopForDecisions: true, expectedTick: s.tick, expectedActorId: s.character.id });
    assert.equal(wait.result.interrupted, true);
    assert.ok(wait.state.tick <= s.tick + 5);
  } finally { child.kill(); }
});
