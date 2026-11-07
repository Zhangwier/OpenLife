import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// The text life's words are pure functions over the state the player receives.
import {
  sceneText, dayHeading, choiceGroups, searchIntent, needsPlayer, dayName,
} from "../../apps/web/public/life-story-text.js";

test("text life: every choice is a real action, the scene keeps strangers unnamed, and wishes find a way", { timeout: 60000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = ""; child.stderr.on("data", (d) => errors += d);
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let out = ""; const timer = setTimeout(() => reject(new Error(errors || "startup timeout")), 15000);
      child.stdout.on("data", (d) => { out += d; const url = out.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/)?.[0]; if (url) { clearTimeout(timer); resolve(url); } });
      child.on("exit", () => { clearTimeout(timer); reject(new Error(errors)); });
    });
    const api = async (path: string, body?: unknown) => (await fetch(`${base}/api/${path}`, body ? {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {})).json() as Promise<Record<string, any>>;
    let s = await api("state");

    // The scene names the place, and never the real name of someone the player has not met.
    const scene = sceneText(s);
    assert.ok(scene.includes(s.settlement.placeName), scene);
    for (const n of s.settlement.neighbours) if (n.acquaintance === "stranger" && n.realName) assert.ok(!scene.includes(n.realName), `${n.realName} leaked: ${scene}`);
    assert.match(dayHeading(s), /^.+月.+[，。]/);
    assert.equal(dayName(1), "初一"); assert.equal(dayName(15), "十五"); assert.equal(dayName(21), "廿一");

    // Every enabled settlement action can be chosen somewhere on the page.
    const g = choiceGroups(s);
    const offered = new Set([...g.here, ...g.go, ...g.time, ...g.matters.flatMap((m) => m.options), ...g.talk.flatMap((t) => t.options)]
      .map((c: any) => `${c.id}|${JSON.stringify(c.payload ?? {})}`));
    const missing = s.settlement.actions.filter((a: any) => a.enabled !== false && a.id !== "settlement-locations.configure_plan"
      && !(a.id === "world-space.move_within" && a.payload?.spaceId === s.settlement.spaceId)
      && !offered.has(`${a.id}|${JSON.stringify(a.payload ?? {})}`));
    assert.deepEqual(missing.map((a: any) => a.label), []);

    // A wish finds what exists: the way to make a pot, even when it cannot be done right here.
    const pot = searchIntent(s, "我想做个陶罐");
    assert.ok(pot.some((c: any) => /陶坯|坯/.test(c.label)), JSON.stringify(pot.map((c: any) => c.label)));
    assert.deepEqual(searchIntent(s, ""), []);

    // Choosing a line from a conversation is an ordinary action that the server accepts.
    const talk = g.talk[0]?.options[0];
    assert.ok(talk, "someone at home has something to say");
    const done = await api("action", { action: talk.id, payload: talk.payload, expectedTick: s.tick });
    assert.equal(done.result.ok, true, JSON.stringify(done.result.errors));
    assert.ok(done.narrative.length > 0, "the answer is written");

    // Letting days pass stops when the world needs the player.
    const before = done.state;
    const passed = await api("autosim", { mode: "continuous-batch", days: 5, expectedTick: before.tick, expectedActorId: before.character.id });
    assert.ok(passed.state.tick > before.tick);
    assert.equal(typeof needsPlayer(before, passed.state), "string");
  } finally { child.kill(); }
});
