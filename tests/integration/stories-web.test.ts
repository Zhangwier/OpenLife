import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * 故事层在网页里可玩：/api/state 带出 stories，「故事」页的按钮发出的命令经 /api/action 生效，
 * 叙述行回到界面（和其他生活动作一样）。
 */
test("Web: the 故事 page's quests and dialogue run end to end over HTTP", { timeout: 40000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const base = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timeout: ${stderr}`)), 10000);
      let output = "";
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`early exit ${code}: ${stderr}`)); });
    });
    const call = async (path: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${base}/api/${path}`, body
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
      return { status: response.status, data: await response.json() as Record<string, any> };
    };
    let s = (await call("state")).data;
    assert.ok(s.stories, "state carries the story view");
    assert.equal(s.stories.quests.find((q: any) => q.id === "main-1-arrival").accept.enabled, true);
    const act = async (action: string, payload: Record<string, unknown> = {}) => {
      const response = await call("action", { action, payload, expectedTick: s.tick, expectedActorId: s.character.id, expectedActivityUsed: s.settlement.dailyActivity.used });
      assert.equal(response.status, 200, action);
      s = response.data.state;
      return response.data;
    };
    const accepted = await act("village-stories.quest.accept", { questId: "main-1-arrival" });
    assert.equal(accepted.result.ok, true, JSON.stringify(accepted.result.errors));
    assert.match(accepted.narrative.join(""), /来了就是缘分/);
    assert.equal(s.stories.quests.find((q: any) => q.id === "main-1-arrival").status, "active");

    // Walk to wherever 陶叔 is and use his dialogue tree.
    // Go where someone with a conversation tree is standing, and use it.
    for (const placeId of ["place:yard", "place:hearth-yard", "place:kiln", "place:field", "place:river", "place:claypits", "place:reedbed", "place:ford"]) {
      if (s.stories.dialogues.length) break;
      await act("settlement-locations.arrive", { placeId });
    }
    const tree = s.stories.dialogues[0];
    assert.ok(tree, "some villager with a conversation tree is somewhere in the village");
    const option = tree.options.find((o: any) => o.enabled);
    {
      const said = await act("village-stories.dialogue.choose", { npc: tree.npc, node: tree.node, option: option.id });
      assert.equal(said.result.ok, true, JSON.stringify(said.result.errors));
      assert.ok(said.narrative.length > 0, "the answer is told back");
    }
    const refused = await act("village-stories.quest.accept", { questId: "main-3-ford" });
    assert.equal(refused.result.ok, false, "chapter three is locked");

    const html = readFileSync(new URL("../../apps/web/public/index.html", import.meta.url), "utf8");
    assert.match(html, /data-route="stories"/);
    assert.match(html, /stories\.css/);
    assert.equal((await fetch(`${base}/stories.js`)).status, 200);
  } finally {
    child.kill();
  }
});
