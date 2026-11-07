/**
 * Map-mode smoke runner in real Edge, driven the way a phone is: one finger.
 * node apps/web/map-browser-smoke.mjs [844x390] — screenshots land in artifacts/map-ui/,
 * existing files are preserved. The default is a phone held upright (390x844, answering the
 * rotate prompt with 就这样竖着玩); pass 844x390 to play it the intended way, in landscape.
 *
 * Everything a finger could reach is driven with real touch input
 * (Input.dispatchTouchEvent). Two things are not on top of the screen and are
 * clicked through the DOM instead: #lmNearby (the .sr-only list of targets)
 * and the first-visit coach card, which sits on the 人生 page under the map.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const [VW, VH] = (process.argv[2] ?? "390x844").split("x").map(Number);
const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = mkdtempSync(path.join(tmpdir(), "openlife-edge-"));
const output = path.join(root, "artifacts", "map-ui");
mkdirSync(output, { recursive: true });
let server, browser, socket, debuggingPort, sequence = 0;
const browserErrors = [], waiting = new Map(), shots = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(f, message, deadline = 14000) {
  for (const end = Date.now() + deadline; Date.now() < end;) {
    try { const result = await f(); if (result) return result; } catch {}
    await sleep(140);
  }
  throw new Error(message);
}
async function startServer() {
  server = spawn(process.execPath, [path.join(root, "apps/web/server.ts")], {
    cwd: root, env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let started = "", error = "";
  server.stdout.on("data", (d) => started += String(d));
  server.stderr.on("data", (d) => error += String(d));
  return until(() => started.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], "Web server not started: " + error);
}
async function openBrowser(url) {
  browser = spawn(edge, ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
    "--no-default-browser-check", "--disable-features=Translate",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, url], { stdio: "ignore" });
  debuggingPort = await until(() => Number(readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]), "Edge did not publish its private debugging port");
  const page = await until(async () => (await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json())
    .find((p) => p.type === "page" && p.url === url && p.webSocketDebuggerUrl), "No Edge debugging page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve; socket.onerror = reject;
    setTimeout(() => reject(new Error("CDP websocket timeout")), 8000);
  });
  socket.onmessage = (e) => {
    const data = JSON.parse(String(e.data)), job = data.id && waiting.get(data.id);
    if (data.method === "Runtime.exceptionThrown") browserErrors.push(data.params.exceptionDetails);
    if (!job) return; waiting.delete(data.id);
    if (data.error) job.reject(new Error(JSON.stringify(data.error))); else job.resolve(data.result ?? {});
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
}
async function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); reject(new Error(method + " timeout")); } }, 8500);
  });
}
async function evaluate(js) {
  const result = await cdp("Runtime.evaluate", { expression: js, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function screenshot(file) {
  const result = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  writeFileSync(path.join(output, file), Buffer.from(result.data, "base64"));
  shots.push(path.join("artifacts", "map-ui", file).replaceAll("\\", "/"));
}
/** One real finger: touchStart + touchEnd at a viewport point. */
async function touch(x, y) {
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] });
  await sleep(45);
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(120);
}
async function tap(selector) {
  // Sheets and panels slide in: measure only once the box has held still, so the
  // finger lands where the button ended up rather than where it was mid-animation.
  let point = null;
  for (let i = 0; i < 10; i++) {
    const current = await evaluate(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)}), r = e && e.getBoundingClientRect();
      if (!r) return null;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      return { x, y, box: [r.left, r.top, r.width, r.height].map(Math.round).join(","), reachable: e.contains(document.elementFromPoint(x, y)) };
    })()`);
    assert.ok(current, `touch target is missing: ${selector}`);
    if (point && current.reachable && current.box === point.box) { point = current; break; }
    point = current;
    await sleep(90);
  }
  assert.ok(point?.reachable, `touch target is covered: ${selector} ${JSON.stringify(point)}`);
  await touch(point.x, point.y);
}
const mapState = () => evaluate(`(() => {
  const s = window.OpenLifeGame?.state(), m = s?.settlement?.map, a = s?.settlement?.dailyActivity ?? {};
  return m ? { tick: s.tick, used: a.used, remaining: a.remaining, placeId: m.placeId, sceneId: m.sceneId, player: m.player } : null;
})()`);

try {
  const url = await startServer();
  assert.equal((await fetch(url + "/life")).status, 200);
  assert.equal((await fetch(url + "/api/state")).status, 200);
  await openBrowser(url + "/life");
  await cdp("Emulation.setDeviceMetricsOverride", { width: VW, height: VH, deviceScaleFactor: 3, mobile: true });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp("Page.reload");
  await until(async () => await evaluate('document.body.dataset.screen === "home" && Boolean(document.querySelector("#homeNewLife"))'), "Home screen did not boot");
  // The default way to play is now the text life; this runner checks the map (menu › 显示 › 玩法).
  await evaluate('localStorage.setItem("openlife-play", "map"), location.reload(), true');
  await sleep(600);
  await until(async () => await evaluate('document.body.dataset.screen === "home" && Boolean(document.querySelector("#homeNewLife"))'), "Home screen did not boot in map mode");
  const viewport = await evaluate("({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })");
  assert.deepEqual(viewport, { width: VW, height: VH, dpr: 3 }, "phone emulation must be live");

  // 1. New life → the map is the game screen and has actually been painted.
  await tap("#homeNewLife");
  await until(async () => await evaluate('Boolean(document.querySelector("#newLifeModal:not([hidden])"))'), "New life form did not open");
  await tap('#newLifeForm button[type=submit]');
  await until(async () => await evaluate('document.body.dataset.screen === "activities" && !document.body.classList.contains("is-busy")'), "New life did not open the activities screen");
  // The coach card sits on a page the fixed map covers: touch it only if it is
  // really on top, otherwise click it through the DOM.
  const coach = await evaluate(`(() => {
    const mine = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("知道了"));
    const shown = mine.find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); });
    if (!shown) { document.querySelector("#coachCard button.coach-done")?.click(); return "clicked"; }
    const r = shown.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (typeof coach === "object") await touch(coach.x, coach.y); await sleep(300);
  const cover = await until(async () => await evaluate('(() => { const e = document.querySelector("#lifeMap"); if (!e || e.hidden) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, position: getComputedStyle(e).position }; })()'), "The life map did not show up");
  assert.equal(cover.position, "fixed", "the map root must be a fixed full-screen layer");
  for (const [key, want] of [["left", 0], ["top", 0], ["width", VW], ["height", VH]]) assert.ok(Math.abs(cover[key] - want) <= 1, `the map must cover the viewport: ${key}=${cover[key]}`);
  // A phone in portrait is asked to rotate; "就这样竖着玩" keeps this size.
  const rotate = await evaluate('(() => { const e = document.querySelector("#lmRotate"), b = document.querySelector("#lmRotateSkip"); if (!e || !b || getComputedStyle(e).display === "none") return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()');
  if (rotate) { await touch(rotate.x, rotate.y); await sleep(200); }
  const { canvas, sample, pips } = await until(async () => await evaluate(`(() => {
    const c = document.querySelector("#lmCanvas");
    if (!c || !c.width) return null;
    const w = Math.max(2, Math.floor(c.width / 8)), h = Math.max(2, Math.floor(c.height / 8));
    const d = c.getContext("2d", { willReadFrequently: true }).getImageData(Math.floor(c.width / 2) - w, Math.floor(c.height / 2) - h, w * 2, h * 2).data;
    let opaque = 0, sum = 0; const colors = new Set();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) opaque++;
      sum += d[i] + d[i + 1] + d[i + 2];
      if (colors.size < 64) colors.add((d[i] >> 4) + ":" + (d[i + 1] >> 4) + ":" + (d[i + 2] >> 4));
    }
    const pixels = d.length / 4;
    return { canvas: { width: c.width, height: c.height }, pips: document.querySelectorAll("#lmClock .lm-energy i.on").length,
      sample: { pixels, opaque, mean: Math.round(sum / pixels / 3), colors: colors.size } };
  })()`), "The map canvas has no size");
  assert.equal(sample.opaque, sample.pixels, "the canvas centre must be painted, not transparent");
  assert.ok(sample.mean > 12 && sample.colors > 1, `the canvas centre must show a scene: ${JSON.stringify(sample)}`);
  const afterNewLife = await until(mapState, "The server-side map never reached the client");
  assert.equal(pips, afterNewLife.remaining, "the clock pips must show the remaining activity");
  await screenshot("01-map.png");

  // 2. Tap the ground a few cells away: the player walks there for free.
  //    window.__lifeMap.screenOf(x, y) projects a cell with the camera the map draws with.
  const freeCells = () => evaluate(`(() => {
    const m = window.OpenLifeGame.state().settlement.map, p = m.player, canvas = document.querySelector("#lmCanvas");
    const open = new Set([".", ",", "=", "_", "f", "r", "D", "G"]), out = [];
    const movers = m.targets.filter((t) => t.type === "person" || t.type === "animal");
    for (let d = 2; d <= 4; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      const x = p.x + dx, y = p.y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d || x < 1 || y < 1 || x >= m.width - 1 || y >= m.height - 1) continue;
      if (!open.has(m.tiles[y][x])) continue;
      if (m.targets.some((t) => t.x === x && t.y === y)) continue; // a tap on a thing selects it
      const gap = movers.length ? Math.min(...movers.map((t) => Math.max(Math.abs(t.x - x), Math.abs(t.y - y)))) : 9;
      if (gap < 2) continue; // villagers drift about: keep the finger off them
      const pt = window.__lifeMap.screenOf(x, y);
      if (pt && document.elementFromPoint(pt.x, pt.y) === canvas) out.push({ x, y, d, gap, left: pt.x, top: pt.y });
    }
    return out.sort((a, b) => b.gap - a.gap || a.d - b.d).slice(0, 6);
  })()`);
  // Selecting goes through the .sr-only list (see the header); wait until the map has it.
  const selectTarget = (key) => evaluate(`(async () => {
    const b = [...document.querySelectorAll("#lmNearby button")].find((x) => x.dataset.target === ${JSON.stringify(key)});
    if (!b) return false;
    b.click();
    for (let i = 0; i < 30 && window.__lifeMap.selected !== ${JSON.stringify(key)}; i++) await new Promise((r) => requestAnimationFrame(r));
    return window.__lifeMap.selected === ${JSON.stringify(key)};
  })()`);
  let cell = null, walked = null;
  for (let attempt = 0; attempt < 4 && !cell; attempt++) {
    const [candidate] = await freeCells();
    if (!candidate) break;
    await touch(candidate.left, candidate.top);
    try {
      walked = await until(async () => { const p = await evaluate("window.__lifeMap.player"); return p && p.x === candidate.x && p.y === candidate.y ? p : null; }, "not this one", 4500);
      cell = candidate;
    } catch { await evaluate('document.querySelector("#lmSheet .lm-close")?.click(), true'); /* the tap selected something instead of the ground */ }
  }
  assert.ok(cell && walked, "tap-to-walk never reached a chosen cell");
  assert.ok(walked.revision > afterNewLife.player.revision, "walking must bump the confirmed revision");
  await until(async () => await evaluate("!window.__lifeMap.me.walking"), "The walk was confirmed but never animated", 6000);
  const afterWalk = await mapState();
  assert.equal(afterWalk.tick, afterNewLife.tick, "walking must not move the day");
  await screenshot("02-walk.png");

  // 3. Talk to a person: selecting + choosing the action is the whole flow.
  const talker = await evaluate(`(() => {
    const t = window.OpenLifeGame.state().settlement.map.targets.find((x) => x.type === "person" && x.actions.some((a) => a.id === "settlement-locations.talk" && a.enabled !== false));
    const index = t ? t.actions.findIndex((a) => a.id === "settlement-locations.talk") : -1;
    return t && index >= 0 ? { key: t.key, name: t.name, index, cost: t.actions[index].activityCost ?? 0 } : null;
  })()`);
  assert.ok(talker, "someone must be willing to talk");
  await selectTarget(talker.key);
  await tap(`#lmSheet .lm-act[data-act="${talker.index}"]`);
  await until(async () => await evaluate('!document.querySelector("#lmTalk").hidden'), "The person never answered", 24000);
  const afterTalk = await mapState();
  assert.ok(afterTalk.used - afterWalk.used >= Math.max(1, talker.cost), `talking must spend activity: ${afterWalk.used} → ${afterTalk.used}`);
  assert.equal(afterTalk.tick, afterWalk.tick, "talking must not move the day");
  await screenshot("03-talk.png");
  for (let i = 0; i < 16 && await evaluate('!document.querySelector("#lmTalk").hidden'); i++) await tap("#lmTalk");
  assert.ok(await until(async () => await evaluate('document.querySelector("#lmTalk").hidden'), "The dialogue never closed", 6000), "the dialogue must close");
  // A tap that lands after the last page closes hits the ground: let that walk end.
  await until(async () => await evaluate("!window.__lifeMap.me.walking"), "The map is still animating after the dialogue");

  // 4. Travel: the way out opens the village, a place + 出发 moves the world.
  const beforeTravel = await mapState();
  const exit = await evaluate('(() => { const b = [...document.querySelectorAll("#lmNearby button")].find((x) => x.dataset.target.startsWith("exit:")); if (!b) return null; b.click(); return b.dataset.target; })()');
  assert.ok(exit, "the map must offer a way out");
  await until(async () => await evaluate('!document.querySelector("#lmVillage").hidden'), "The village map did not open", 12000);
  const place = await evaluate(`(() => {
    const list = document.querySelector("#lmVillageList"), where = list && getComputedStyle(list).display !== "none" ? "#lmVillageList" : "#lmVillageLabels";
    const btns = [...document.querySelectorAll(where + " button[data-place]")], pick = btns.find((b) => b.dataset.place === "place:river" && !b.classList.contains("off")) ?? btns.find((b) => !b.classList.contains("off"));
    return pick ? pick.dataset.place : null;
  })()`);
  assert.ok(place, "the village must offer a reachable place");
  // Phones held upright pick from the list under the map; landscape taps the map's own place labels.
  const listShown = await evaluate('getComputedStyle(document.querySelector("#lmVillageList")).display !== "none"');
  await tap(`${listShown ? "#lmVillageList" : "#lmVillageLabels"} button[data-place="${place}"]`);
  await until(async () => await evaluate('Boolean(document.querySelector("#lmVillagePick .lm-go-there:not([disabled])"))'), "Choosing a place did not offer 出发");
  await screenshot("04-village.png");
  await tap("#lmVillagePick .lm-go-there");
  const arrived = await until(async () => { const m = await mapState(); return m && m.placeId === place ? m : null; }, `Travelling to ${place} never arrived`, 15000);
  assert.notEqual(arrived.sceneId, beforeTravel.sceneId, "travelling must switch the scene");
  await sleep(400); await screenshot("05-arrived.png");

  // 5. A side panel opens over the map and closes back onto it.
  await tap('.lm-side [data-lm="works"]');
  await until(async () => await evaluate('document.body.classList.contains("lm-panel")'), "The works panel did not open");
  const layout = await evaluate('(() => { const e = document.getElementById("applicationLayout"), r = e.getBoundingClientRect(); return { hidden: e.hidden, width: r.width, height: r.height, display: getComputedStyle(e).display }; })()');
  assert.ok(!layout.hidden && layout.width > 0 && layout.height > 0 && layout.display !== "none", `the page layout must be visible in the panel: ${JSON.stringify(layout)}`);
  await screenshot("06-panel.png");
  await tap("#lmPanelClose");
  await until(async () => await evaluate('!document.body.classList.contains("lm-panel") && document.body.dataset.screen === "activities"'), "Closing the panel did not return to the map");

  // 6. Reload and continue: the server-confirmed cell survives.
  const beforeReload = await evaluate("window.__lifeMap.player");
  await cdp("Page.reload");
  await until(async () => await evaluate('document.body.dataset.screen === "home" && Boolean(document.querySelector("#continueLife:not([disabled])"))'), "The home screen did not come back with a save", 20000);
  await tap("#continueLife");
  await until(async () => await evaluate('document.body.dataset.screen === "activities" && !document.querySelector("#lifeMap").hidden'), "Continuing did not return to the map", 20000);
  const restored = await until(async () => await evaluate("window.__lifeMap.player"), "The map never restored after continuing");
  assert.deepEqual([restored.sceneId, restored.x, restored.y], [beforeReload.sceneId, beforeReload.x, beforeReload.y], "continuing must restore the same place");
  await sleep(500); await screenshot("07-reload.png");

  // 7. Nothing may have thrown along the way.
  assert.deepEqual(browserErrors, [], "no uncaught browser errors");
  console.log("MAP_ACCEPTANCE", JSON.stringify({ mode: "map", viewport, newLife: true, map: { fixed: cover.position, canvas, pixelSample: sample, energyPips: pips },
    walk: { approach: "canvas-touch", from: [afterNewLife.player.x, afterNewLife.player.y], to: [cell.x, cell.y], distance: cell.d, revision: [afterNewLife.player.revision, walked.revision], tickUnchanged: true },
    talk: { person: talker.name, cost: Math.max(1, talker.cost), activity: [afterWalk.used, afterTalk.used], tickUnchanged: true },
    travel: { from: beforeTravel.placeId, to: arrived.placeId, scene: [beforeTravel.sceneId, arrived.sceneId] }, panel: { opened: true, closed: true },
    reload: { restored: true, sceneId: restored.sceneId, x: restored.x, y: restored.y }, shots, uncaughtErrors: 0 }));
} finally {
  if (browserErrors.length) console.error("BROWSER_ERRORS", JSON.stringify(browserErrors));
  if (socket) { try { await cdp("Browser.close"); } catch {} socket.close(); }
  if (browser) browser.kill(); if (server) server.kill();
  await sleep(400); // let Windows release the profile's file handles before removing it
  const safeProfile = path.resolve(profile);
  if (path.dirname(safeProfile) !== path.resolve(tmpdir()) || !path.basename(safeProfile).startsWith("openlife-edge-")) throw new Error("Unexpected browser profile cleanup target");
  try { rmSync(safeProfile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
}
