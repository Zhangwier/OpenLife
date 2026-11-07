import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("map life: approach, interact, save, restore, and reject stale or forged targets", { timeout: 45000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, PORT: "0", OPENLIFE_PERSISTENCE: "0", OPENLIFE_HUNGER_TOLL: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = ""; child.stderr.on("data", d => errors += d);
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let out = ""; const timer = setTimeout(() => reject(new Error(errors || "startup timeout")), 15000);
      child.stdout.on("data", d => { out += d; const url = out.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/)?.[0]; if (url) { clearTimeout(timer); resolve(url); } });
      child.on("error", e => { clearTimeout(timer); reject(e); });
      child.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
    });
    const api = async (path: string, body?: any) => (await fetch(base + "/api/" + path, body ? {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    } : {})).json() as Promise<Record<string, any>>;
    let s = await api("state");
    assert.ok(s.settlement.map, "formal player state must include the playable map");
    const tick = s.tick;
    const act = async (action: string, payload: any) => {
      const data = await api("action", { action, payload, expectedTick: s.tick, expectedActorId: s.character.id });
      s = data.state ?? s; return data;
    };
    const work = s.settlement.map.targets.find((t: any) => t.type === "work");
    assert.ok(work);
    const before = s.settlement.map.player;
    const moved = await act("map.walk", { sceneId: s.settlement.map.sceneId, expectedPosition: before.revision, targetKey: work.key });
    assert.ok(moved.result.ok, JSON.stringify(moved.result.errors));
    assert.equal(s.tick, tick);
    assert.ok(moved.result.route.length >= 1);
    const position = s.settlement.map.player;
    assert.equal((await act("map.walk", { sceneId: s.settlement.map.sceneId, expectedPosition: before.revision, x: 12, y: 12 })).result.ok, false);
    assert.equal((await act("map.interact", { targetKey: "person:invented", action: "settlement-locations.step", payload: {} })).result.ok, false);
    assert.equal((await act("map.interact", { targetKey: work.key, action: "modern.create_character", payload: {} })).result.ok, false);
    const saved = await api("save", { label: "map-check" });
    const loaded = await api("load", { save: saved.save });
    s = loaded.state;
    assert.deepEqual(s.settlement.map.player, position);
    const nextDay = s.settlement.actions.find((a: any) => a.id === "settlement-locations.end_day");
    assert.ok(nextDay);
    assert.ok((await act("map.interact", { targetKey: work.key, action: nextDay.id, payload: nextDay.payload })).result.ok);
    assert.equal(s.tick, tick + 1);
    const via = async (actionId: string, matches: (a: any) => boolean = () => true) => {
      const map = s.settlement.map;
      const target = map.targets.find((t: any) => t.actions.some((a: any) => a.id === actionId && matches(a) && a.enabled !== false));
      assert.ok(target, `${actionId} must have a usable map target`);
      const choice = target.actions.find((a: any) => a.id === actionId && matches(a) && a.enabled !== false);
      assert.ok((await act("map.walk", { sceneId: map.sceneId, expectedPosition: map.player.revision, targetKey: target.key })).result.ok);
      const result = await act("map.interact", { targetKey: target.key, expectedPosition: s.settlement.map.player.revision, action: choice.id, payload: choice.payload ?? {} });
      assert.ok(result.result.ok, JSON.stringify(result.result.errors));
    };
    await via("settlement-locations.arrive", a => a.payload?.placeId === "place:field");
    const grainBefore = s.settlement.carrying.find((r: any) => r.resourceId === "resource:grain")?.count ?? 0;
    await via("settlement-locations.draw", a => a.payload?.resourceId === "resource:grain");
    assert.ok((s.settlement.carrying.find((r: any) => r.resourceId === "resource:grain")?.count ?? 0) > grainBefore,
      "map gathering must yield a real carried item");
    const person = s.settlement.map.targets.find((t: any) => t.type === "person" && t.actions.some((a: any) => a.id === "settlement-locations.talk" && a.enabled !== false));
    if (person) await via("settlement-locations.talk", a => a.payload?.targetId === person.id);
    const final = s.settlement.carrying;
    const save2 = await api("save", { label: "after-real-life" });
    assert.deepEqual((await api("load", { save: save2.save })).state.settlement.carrying, final);
  } finally { child.kill(); }
});
