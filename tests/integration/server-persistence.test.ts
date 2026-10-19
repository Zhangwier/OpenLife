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
    assert.deepEqual(await (await fetch(server.base + "/api/state")).json(), original.state);
    await post(server.base, "/api/reset", { seed: 321 });
    await post(server.base, "/api/load", { save: saved.save });
    await server.stop();
    server = await start(path, "100");
    assert.deepEqual(await (await fetch(server.base + "/api/state")).json(), original.state);
    const before = JSON.parse(await readFile(path, "utf8")).savedAt;
    await new Promise(resolve => setTimeout(resolve, 400));
    const after = JSON.parse(await readFile(path, "utf8"));
    assert.notEqual(after.savedAt, before);
    assert.ok(after.save.manifest);
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
