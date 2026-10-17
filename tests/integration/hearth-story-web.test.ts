import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("playable village: player meets cook, sources real fuel, helps, saves and resumes", { timeout: 45000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", data => { stderr += String(data); });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Web failed to start: " + stderr)), 12000);
      child.stdout.on("data", chunk => {
        const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("error", reject);
      child.on("exit", code => reject(new Error("server exited " + code + ": " + stderr)));
    });
    const api = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body ? {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      } : undefined);
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let state = (await api("state")).data;
    assert.equal(state.settlement.communitySituation.visible, false);
    const skipped = await api("action", { action: "advance-year", payload: {},
      expectedTick: state.tick, expectedActorId: state.character.id });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.result.ok, false, "player cannot silently skip a whole year of NPC life");
    assert.equal(skipped.data.state.tick, state.tick);
    const action = async (name: string, payload: Record<string, unknown> = {}, expected = true) => {
      const res = await api("action", { action: name, payload,
        expectedTick: state.tick, expectedActorId: state.character.id,
        expectedActivityUsed: state.settlement.dailyActivity.used });
      assert.equal(res.status, 200, name + ": " + JSON.stringify(res.data));
      assert.equal(res.data.result.ok, expected, name + ": " + JSON.stringify(res.data.result.errors));
      state = res.data.state;
    };
    await action("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    // 陌生人显示为「陌生人」；身份本身在 realName 里，测试用它认人。
    const cook = state.settlement.neighbours.find((p: { realName: string }) => p.realName === "阿灶");
    assert.ok(cook);
    await action("settlement-locations.talk", { targetId: cook.id });
    assert.equal(state.settlement.communitySituation.visible, true);
    await action("settlement-locations.arrive", { placeId: "place:reedbed", travelMode: "local" });
    await action("settlement-locations.draw", { placeId: "place:reedbed", resourceId: "resource:fuel" });
    const supplied = state.settlement.objects.find((o: { placement: string; prototypeId: string }) =>
      o.placement === "在手中" && o.prototypeId === "prototype:fuel-bundle");
    assert.ok(supplied, "real fuel carried back");
    await action("settlement-locations.hearth.help", { objectId: supplied.id }, false);
    await action("settlement-locations.arrive", { placeId: "place:hearth-yard", travelMode: "local" });
    await action("settlement-locations.hearth.help", { objectId: supplied.id });
    assert.match(state.settlement.communitySituation.recentHelp, /柴草/);
    assert.ok(!state.settlement.objects.some((o: { id: string; placement: string }) =>
      o.id === supplied.id && o.placement === "在手中"));
    await action("settlement-locations.hearth.help", { objectId: supplied.id }, false);
    const save = (await api("save", { label: "first-hearth-story" })).data.save;
    const restored = await api("load", { save });
    assert.equal(restored.data.result.ok, true);
    state = restored.data.state;
    assert.match(state.settlement.communitySituation.recentHelp, /柴草/);
    assert.equal(stderr, "");
  } finally {
    child.kill();
  }
});
