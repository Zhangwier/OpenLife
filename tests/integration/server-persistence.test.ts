import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

async function start(path: string, interval = "0") {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, PORT: "0", HOST: "127.0.0.1", OPENLIFE_PERSISTENCE: "1",
      OPENLIFE_SAVE_PATH: path, OPENLIFE_SAVE_INTERVAL_MS: interval },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", chunk => { output += chunk; });
  const base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(output)); }, 20000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", code => { clearTimeout(timer); reject(new Error(`exit ${code}: ${output}`)); });
    child.stdout.on("data", chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  return { base, async stop() {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGKILL"); // A hard restart must recover the last completed disk write.
    await exited;
  } };
}

async function post(base: string, route: string, body: unknown): Promise<Record<string, any>> {
  const response = await fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  return await response.json() as Record<string, any>;
}

/**
 * `saveHealth` describes this process's last disk write, not the world, so it
 * legitimately differs across a restart. World-identity comparisons use this.
 */
function worldState(state: Record<string, any>): Record<string, any> {
  const { saveHealth, ...rest } = state;
  return rest;
}

/** Waits for the reported disk-write outcome to reach a wanted state. */
async function waitForSaveHealth(
  base: string,
  wanted: (health: { state: string; reason: string; at: string }) => boolean,
  deadlineMs = 10000,
): Promise<{ state: string; reason: string; at: string }> {
  const started = Date.now();
  let last: { state: string; reason: string; at: string } = { state: "", reason: "", at: "" };
  while (Date.now() - started < deadlineMs) {
    last = (await (await fetch(base + "/api/state")).json() as any).saveHealth;
    if (wanted(last)) return last;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return last;
}

test("disk save: reset/load survive hard restart; timer writes valid snapshots", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "openlife-save-test-"));
  const path = join(dir, "save.json");
  let server: Awaited<ReturnType<typeof start>> | undefined;
  try {
    server = await start(path);
    const original = await post(server.base, "/api/reset", { seed: 912, givenName: "存档验证" });
    const saved = await post(server.base, "/api/save", {});
    assert.equal(JSON.parse(await readFile(path, "utf8")).version, 1);
    await server.stop();
    server = await start(path);
    assert.deepEqual(worldState(await (await fetch(server.base + "/api/state")).json() as any), worldState(original.state));
    assert.equal((await (await fetch(server.base + "/api/state")).json() as any).saveHealth.state, "ok",
      "a restored world already has one good snapshot on disk");
    await post(server.base, "/api/reset", { seed: 321 });
    await post(server.base, "/api/load", { save: saved.save });
    await server.stop();
    server = await start(path, "100");
    assert.deepEqual(worldState(await (await fetch(server.base + "/api/state")).json() as any), worldState(original.state));
    const before = JSON.parse(await readFile(path, "utf8")).savedAt;
    await new Promise(resolve => setTimeout(resolve, 400));
    const after = JSON.parse(await readFile(path, "utf8"));
    assert.notEqual(after.savedAt, before);
    assert.ok(after.save.manifest);
    // The timer keeps firing, so read the reported outcome only once it is a
    // settled success: asserting at one instant races with the next write.
    const settled = await waitForSaveHealth(server.base, h => h.state === "ok");
    assert.equal(settled.state, "ok", `timer write never settled ok: ${settled.reason}`);
    assert.ok(settled.at.length > 0);
  } finally { await server?.stop(); await rm(dir, { recursive: true, force: true }); }
});

test("disk save: corrupt and unsupported saves are preserved before a new world writes", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "openlife-save-test-"));
  const path = join(dir, "save.json");
  let server: Awaited<ReturnType<typeof start>> | undefined;
  try {
    for (const bad of ["{broken-json", JSON.stringify({ version: 99, save: {} })]) {
      await writeFile(path, bad);
      server = await start(path);
      assert.equal((await fetch(server.base + "/")).status, 200);
      assert.equal((await fetch(server.base + "/api/state")).status, 200);
      const backups = (await readdir(dir)).filter(name => name.includes(".rejected-"));
      assert.ok((await Promise.all(backups.map(name => readFile(join(dir, name), "utf8")))).includes(bad));
      await post(server.base, "/api/reset", { seed: 44 });
      assert.equal(JSON.parse(await readFile(path, "utf8")).version, 1);
      await server.stop();
    }
  } finally { await server?.stop(); await rm(dir, { recursive: true, force: true }); }
});

/**
 * SAVE-01: a save that never reaches disk must be visible, not only logged.
 *
 * The world stays playable, so without a reported status the player cannot tell
 * a safe world from one that will be lost on the next restart. Here the save
 * path's parent is a regular file, so every write fails for a real reason.
 */
test("disk save: a failed write is reported to the client while the world stays playable", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "openlife-save-unwritable-"));
  const blocker = join(dir, "blocker");
  const path = join(blocker, "save.json");
  let server: Awaited<ReturnType<typeof start>> | undefined;
  try {
    await writeFile(blocker, "this is a file, so it cannot be a save directory");
    server = await start(path);
    const health = async () => (await (await fetch(server!.base + "/api/state")).json() as any).saveHealth;
    assert.equal((await health()).state, "off", "nothing has been written yet in this process");

    await post(server.base, "/api/reset", { seed: 77 });
    const failed = await health();
    assert.equal(failed.state, "failed", "the rejected write must be reported, not silently dropped");
    assert.ok(failed.reason.length > 0, "the report carries a concrete reason for the log");

    // UI-004: the page must not be answered with a raw technical code or a
    // server path, so the player-facing text is a separate, plain field.
    assert.ok(failed.playerReason.length > 0, "a failed save must also explain itself to the player");
    assert.ok(!/E[A-Z]{3,}/.test(failed.playerReason), `playerReason leaks an errno: ${failed.playerReason}`);
    assert.ok(!/[A-Za-z]:[\\/]/.test(failed.playerReason), `playerReason leaks a path: ${failed.playerReason}`);
    assert.ok(!failed.playerReason.includes("save.json"), "playerReason names an internal file");
    const client = await (await fetch(server.base + "/app.js")).text();
    assert.match(client, /playerReason/, "the client reads the player-facing field");
    assert.ok(!/health\.reason\b/.test(client), "the client does not render the raw server error");

    // Failure is a warning, not a crash: the same world keeps answering, and the
    // browser-side manual save still works (it is independent of the disk copy).
    assert.equal((await fetch(server.base + "/api/state")).status, 200);
    const manual = await post(server.base, "/api/save", { label: "unwritable-disk" });
    assert.ok(manual.save?.manifest, "a manual save still returns a real package");
    assert.ok(manual.summary, "and a summary the save dialog can show");
    assert.equal((await health()).state, "failed", "the condition persists until a write succeeds");

    // A failed write must not poison the queue: once the obstruction is gone the
    // very next autosave has to succeed and clear the warning.
    await rm(blocker, { force: true });
    await post(server.base, "/api/reset", { seed: 78 });
    const recovered = await waitForSaveHealth(server.base, h => h.state === "ok");
    assert.equal(recovered.state, "ok", `the queue never recovered: ${recovered.reason}`);
    assert.equal(JSON.parse(await readFile(path, "utf8")).version, 1, "and a usable snapshot is on disk");
  } finally { await server?.stop(); await rm(dir, { recursive: true, force: true }); }
});
