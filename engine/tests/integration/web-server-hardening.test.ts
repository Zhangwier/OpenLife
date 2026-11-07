/** The local Web server refuses bad input with 4xx, never a crash or a leak. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { fileURLToPath } from "node:url";

async function start(env: Record<string, string> = {}) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../../apps/web/server.ts", import.meta.url))], {
    env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0", ...env }, stdio: ["ignore", "pipe", "pipe"],
  });
  const base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server startup timeout")), 15000);
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+(?=\r?\n)/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`early exit ${code}`)); });
  });
  return { base, stop: () => child.kill() };
}

/** Raw request, so paths like /../ are sent exactly as written. */
function raw(base: string, path: string, method = "GET", body?: string, headers: Record<string, string> = {}) {
  const { hostname, port } = new URL(base);
  return new Promise<{ status: number; body: string; headers: Record<string, unknown> }>((resolve, reject) => {
    const req = request({ hostname, port, path, method, headers: { "content-type": "application/json", ...headers } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("web server: bad requests are 4xx with a clean message", { timeout: 60000 }, async () => {
  const { base, stop } = await start({ OPENLIFE_MAX_BODY_BYTES: "4096" });
  try {
    const page = await raw(base, "/");
    assert.equal(page.status, 200);
    assert.equal(page.headers["x-content-type-options"], "nosniff");

    for (const path of ["/../package.json", "/..%2f..%2fpackage.json", "/%2e%2e/%2e%2e/package.json", "/nope.js"]) {
      const res = await raw(base, path);
      assert.equal(res.status, 404, path);
      assert.doesNotMatch(res.body, /ENOENT|\/workspace|node_modules|"name":\s*"openlife/i, path);
    }
    assert.equal((await raw(base, "/%E0%A4%A", "GET")).status, 400);

    const badJson = await raw(base, "/api/action", "POST", "{not json");
    assert.equal(badJson.status, 400);
    assert.match(JSON.parse(badJson.body).error, /JSON/);
    assert.equal((await raw(base, "/api/action", "POST", "[1,2]")).status, 400);
    assert.equal((await raw(base, "/api/state", "POST", "{}")).status, 405);
    assert.equal((await raw(base, "/api/action", "GET")).status, 405);
    assert.equal((await raw(base, "/api/action", "POST", "{}", { "content-type": "text/plain" })).status, 415);
    assert.equal((await raw(base, "/api/load", "POST", JSON.stringify({ save: "x".repeat(8000) }))).status, 413);
    assert.equal((await raw(base, "/api/reset", "POST", JSON.stringify({ seed: -3 }))).status, 400);
    const broken = await raw(base, "/api/load", "POST", JSON.stringify({ save: { manifest: {} } }));
    assert.ok(broken.status === 409 || broken.status === 400, `broken save → ${broken.status}`);

    const state = await raw(base, "/api/state");
    assert.equal(state.status, 200, "the server is still alive after all of that");
    assert.equal(state.headers["cache-control"], "no-store");
  } finally {
    stop();
  }
});
