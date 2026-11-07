import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { request } from "node:http";

const root = new URL("../", import.meta.url);
const available = Number(process.versions.node.split(".")[0]) >= 24 &&
  existsSync(new URL("../engine/node_modules/@openlife/simulation/package.json", import.meta.url));

// The OS may assign a port that Fetch reserves, even on loopback.
function send(url, { method = "GET", headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, text: () => text, json: () => JSON.parse(text) });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function start(t, env = {}) {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", OPENLIFE_PERSISTENCE: "0", ...env },
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, "exit");
      child.kill();
      await exit;
    }
  });
  let output = "";
  child.stderr.on("data", (chunk) => { output += chunk; });
  const controller = new AbortController();
  try {
    return await Promise.race([
      (async () => {
        for await (const [chunk] of onceOutput(child, controller.signal)) {
          output += chunk;
          const match = output.match(/(http:\/\/127\.0\.0\.1:[1-9]\d*)\r?\n/);
          if (match) return match[1];
        }
      })(),
      once(child, "exit").then(() => { throw new Error(output); }),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error(output || "startup timeout")), 25000);
        timer.unref();
      }),
    ]);
  } finally { controller.abort(); }
}

async function* onceOutput(child, signal) {
  const { on } = await import("node:events");
  try { yield* on(child.stdout, "data", { signal }); }
  catch (error) { if (error.name !== "AbortError") throw error; }
}

test("the standalone CardWorld entry stays playable without an engine", async (t) => {
  const url = await start(t, { OPENLIFE_CARD_ONLY: "1" });
  assert.match((await send(url)).text(), /卡牌世界/);
  assert.equal((await send(url + "/card-world/app.js")).status, 200);
  assert.equal((await send(url + "/api/card-world/state")).status, 404);
});

test("the card projection executes the actual engine command and reflects the same life", {
  skip: !available && "run npm run engine:setup on Node.js 24",
  timeout: 45000,
}, async (t) => {
  const url = await start(t);
  const get = async (path) => {
    const response = await send(url + path);
    assert.equal(response.status, 200, path);
    return response.json();
  };
  const ready = await get("/api/engine-ready");
  assert.equal(ready.entry, "/");
  assert.ok(ready.activeModules.includes("settlement-locations"));
  assert.match((await send(url)).text(), /卡牌世界/);
  assert.doesNotMatch((await send(url + ready.entry)).text(), /进入引擎人生|完整人生/);
  assert.equal((await send(url + "/life/")).status, 302);
  assert.equal((await send(url + "/card-world/engine-life.html")).status, 302);

  const before = await get("/api/card-world/state");
  assert.ok(before.people.length);
  assert.ok(before.people.every((person) => person.realName === undefined));
  const walk = before.actions.find((action) => action.enabled && action.payload?.placeId === "place:hearth-yard");
  assert.ok(walk);
  const post = (actorId) => send(url + "/api/card-world/action", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: walk.id, payload: walk.payload, expectedTick: before.tick, expectedActorId: actorId, expectedRevision: before.revision }),
  });
  assert.equal((await post("someone-else")).status, 409);
  assert.equal((await get("/api/card-world/state")).place.id, before.place.id);
  const move = await post(before.actor.id);
  assert.equal(move.status, 200);
  const result = await move.json();
  assert.equal(result.ok, true);
  assert.equal((await post(before.actor.id)).status, 409);
  assert.equal(result.state.place.id, "place:hearth-yard");
  const full = await get("/api/state");
  assert.equal(full.settlement.placeId, result.state.place.id);
  assert.equal(full.character.id, result.state.actor.id);

  const act = async (state, choice) => {
    const response = await send(url + "/api/card-world/action", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: choice.id, payload: choice.payload ?? {}, expectedTick: state.tick,
        expectedActorId: state.actor.id, expectedRevision: state.revision,
      }),
    });
    assert.equal(response.status, 200, choice.id);
    const command = await response.json();
    assert.equal(command.ok, true, choice.id);
    return command.state;
  };
  const destination = result.state.actions.find((choice) => choice.id === "travel.depart");
  assert.ok(destination);
  const travelling = await act(result.state, destination);
  assert.equal(travelling.travel.destination, "旧渡口");
  const atFerry = await act(travelling, { id: "travel.day" });
  assert.ok(atFerry.actions.some((choice) => choice.id === "travel.arrive"));
  const away = await act(atFerry, { id: "travel.arrive" });
  assert.equal(away.place.id, destination.payload.to);
  assert.deepEqual(away.people, []);
  const unsafe = await send(url + "/api/action", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: walk.id, payload: walk.payload }),
  });
  assert.equal(unsafe.status, 422);
  const home = await act(away, away.actions.find((choice) => choice.payload?.to === "openlife:village:home"));
  const returned = await act(await act(home, { id: "travel.day" }), { id: "travel.arrive" });
  assert.equal(returned.place.id, "place:hearth-yard");
});

test("all catalogued modules activate and reopen in their engine profiles", {
  skip: !available && "run npm run engine:setup on Node.js 24",
}, async () => {
  const { verifyProfiles } = await import("../engine/scripts/runtime-profiles.ts");
  const result = await verifyProfiles();
  const catalog = JSON.parse(readFileSync(new URL("../docs/integration/legacy-capabilities.json", import.meta.url), "utf8"));
  assert.equal(result.corePackages, 11);
  assert.equal(result.modules, 62);
  assert.deepEqual(new Set(result.profiles.flatMap((profile) => profile.modules)), new Set(catalog.modules.map((entry) => entry.id)));
});
