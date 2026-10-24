/**
 * Pixel-scene art baseline: render the pixel view in headless Edge and screenshot it.
 * Isolated server (no persistence), fresh throwaway profile. Writes PNGs to artifacts/art/.
 *
 *   node apps/web/dev-art-shot.mjs                 # current season/weather from live state
 *   node apps/web/dev-art-shot.mjs --season=秋 --sky=晴 --place=place:yard
 *   node apps/web/dev-art-shot.mjs --sweep          # one PNG per season x sky cell
 */
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const profile = mkdtempSync(path.join(tmpdir(), "openlife-art-"));
const output = path.join(root, "artifacts", "art");
mkdirSync(output, { recursive: true });
let server, browser, socket, debuggingPort, sequence = 0;
const waiting = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(f, message, deadline = 14000) {
  const started = Date.now();
  while (Date.now() - started < deadline) {
    try { const r = await f(); if (r) return r; } catch {}
    await sleep(140);
  }
  throw new Error(message);
}
async function startServer() {
  server = spawn(process.execPath, [path.join(root, "apps/web/server.ts")], {
    cwd: root, env: { ...process.env, OPENLIFE_PERSISTENCE: "0", PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let started = "", error = "";
  server.stdout.on("data", (d) => (started += String(d)));
  server.stderr.on("data", (d) => (error += String(d)));
  return until(() => started.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], "server not started: " + error);
}
async function openBrowser(url) {
  browser = spawn(edge, ["--headless=new", "--disable-gpu", "--disable-extensions", "--no-first-run",
    "--no-default-browser-check", "--disable-features=Translate", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, url], { stdio: "ignore" });
  debuggingPort = await until(() => Number(readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]), "no debug port");
  const page = await until(async () => {
    const list = await (await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)).json();
    return list.find((p) => p.type === "page" && p.url === url && p.webSocketDebuggerUrl);
  }, "no debug page");
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.onopen = res; socket.onerror = rej; setTimeout(() => rej(new Error("cdp timeout")), 8000); });
  socket.onmessage = (e) => {
    const d = JSON.parse(String(e.data));
    if (d.id && waiting.has(d.id)) { const { res, rej } = waiting.get(d.id); waiting.delete(d.id); d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result ?? {}); }
  };
  await cdp("Page.enable"); await cdp("Runtime.enable");
}
async function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((res, rej) => { waiting.set(id, { res, rej }); socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); rej(new Error(method + " timeout")); } }, 8500); });
}
async function evaluate(expression) {
  const r = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}
async function shot(file) {
  const r = await cdp("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  const p = path.join(output, file);
  writeFileSync(p, Buffer.from(r.data, "base64"));
  console.log("WROTE", path.join("artifacts", "art", file).replaceAll("\\", "/"));
}

/**
 * Determinism check: freeze the frame clock at a fixed timestamp so the atmosphere/particle pass
 * is evaluated at the same `t` twice, then compare the 640×360 canvas byte-for-byte across a
 * full page reload + scene rebuild. Any Math.random() left in the render path shows up as a diff.
 */
async function freezeClock() {
  await evaluate(`(() => {
    if (window.__fixedRaf) return true;
    window.__fixedRaf = true;
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(1200), 16);
    return true;
  })()`);
}
async function canvasDataUrl() {
  return String(await evaluate('document.getElementById("view").toDataURL("image/png")'));
}
async function verifyDeterminism(cell) {
  const tag = cell.tag ?? `${cell.season}-${cell.sky}`;
  await freezeClock();
  await sleep(400);
  const first = await canvasDataUrl();
  writeFileSync(path.join(output, `verify-${tag}-a.png`), Buffer.from(first.split(",")[1], "base64"));
  await evaluate("location.reload()");
  await until(async () => evaluate('Boolean(document.getElementById("view") && document.getElementById("hudMeta").textContent.includes("年"))'), "reload paint", 20000);
  await sleep(500);
  await evaluate(overrideScene(cell));
  await evaluate(`(() => {
    const of = window.fetch;
    window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(window.__artOverride) });
    document.getElementById("btnRefresh").click();
    window.fetch = of;
    return true;
  })()`);
  await until(async () => {
    const meta = await evaluate('document.getElementById("hudMeta").textContent');
    return typeof meta === "string" && meta.includes(cell.season) && meta.includes(cell.sky);
  }, "reload scene switch", 20000);
  await freezeClock();
  await sleep(400);
  const second = await canvasDataUrl();
  writeFileSync(path.join(output, `verify-${tag}-b.png`), Buffer.from(second.split(",")[1], "base64"));
  console.log(
    "DETERMINISM", cell.season, cell.sky,
    first === second ? "IDENTICAL" : `DIFFERS (${first.length} vs ${second.length} chars)`,
  );
}

/**
 * Dump the raw 640×360 canvas plus a few deterministic crops, at 1× and 3× nearest-neighbour.
 * Screenshots are HUD-and-CSS blurred; the canvas itself is the artifact under review.
 * `tag` keeps before/after dumps apart.
 */
async function dumpCanvas(file, tag) {
  const dataUrl = await evaluate('document.getElementById("view").toDataURL("image/png")');
  const png = Buffer.from(String(dataUrl).split(",")[1], "base64");
  const raw = path.join(output, `canvas-${tag}.png`);
  writeFileSync(raw, png);
  console.log("WROTE", path.join("artifacts", "art", `canvas-${tag}.png`).replaceAll("\\", "/"));
  const crops = [
    ["house", 210, 90, 190, 150],
    ["path", 60, 250, 240, 100],
    ["fence", 30, 170, 120, 100],
    ["well", 420, 180, 90, 90],
    ["air", 60, 20, 200, 130],
    ["edge", 300, 275, 90, 40],
  ];
  for (const [name, cx, cy, cw, ch] of crops) {
    const scale = name === "edge" ? 8 : 3;
    const cropUrl = await evaluate(`(() => {
      const src = document.getElementById("view");
      const c = document.createElement("canvas");
      c.width = ${cw} * ${scale}; c.height = ${ch} * ${scale};
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(src, ${cx}, ${cy}, ${cw}, ${ch}, 0, 0, ${cw} * ${scale}, ${ch} * ${scale});
      return c.toDataURL("image/png");
    })()`);
    const out = path.join(output, `crop-${name}-${tag}.png`);
    writeFileSync(out, Buffer.from(String(cropUrl).split(",")[1], "base64"));
    console.log("WROTE", path.join("artifacts", "art", `crop-${name}-${tag}.png`).replaceAll("\\", "/"));
  }
}

// Inject a deterministic SceneVM straight into the pixel view, bypassing the live server,
// so art iterations compare like-for-like regardless of world state.
function overrideScene({ place = "place:yard", season = "春", sky = "晴" } = {}) {
  return `(() => {
    const demo = {
      settlement: { placeId: ${JSON.stringify(place)}, placeName: "河岸台地", season: ${JSON.stringify(season)},
        weather: { sky: ${JSON.stringify(sky)} },
        neighbours: [
          { id: "a", name: "陶婶", acquaintance: "known", atWork: true, contact: "相识" },
          { id: "b", name: "猎户", acquaintance: "stranger", atWork: false, contact: "陌生" },
          { id: "c", name: "磨坊主", acquaintance: "known", atWork: false, contact: "相识" }
        ],
        objects: [ { id: "o1", name: "陶罐", prototypeId: "prototype:jar", visible: true, quantity: 1 },
                   { id: "o2", name: "谷物篮", prototypeId: "prototype:grain-basket", visible: true, quantity: 1 } ],
        exits: [ { placeId: "place:river", name: "河边", costDays: 1 }, { placeId: "place:field", name: "田里", costDays: 1 } ],
        dailyActivity: { used: 3, capacity: 8 } },
      clock: { day: 100, dayOfMonth: 8, monthOfYear: 4, season: ${JSON.stringify(season)}, eraYear: -2053 },
      character: { id: "modern:e1", name: "启禾", age: 16 }
    };
    // reach into the IIFE via a fresh fetch shim result
    window.__artOverride = demo;
    return true;
  })()`;
}

const arg = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.replace(/^--/, "").split("="); return [m[0], m[1] ?? true];
}));

try {
  const base = await startServer();
  await openBrowser(base + "/pixel-scene.html");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 700, height: 460, deviceScaleFactor: 2, mobile: false });
  await until(async () => evaluate('Boolean(document.getElementById("view"))'), "pixel view missing");
  // The page runs its own initial /api/state fetch; if we inject the override too early that
  // late response repaints the HUD and rebuilds the scene with the live season. Wait for the
  // first real paint to land before we start overriding cells.
  await until(async () => {
    const meta = await evaluate('document.getElementById("hudMeta").textContent');
    return typeof meta === "string" && meta.includes("年") ? true : false;
  }, "first live paint did not land", 20000);
  await sleep(600);

  const cells = arg.sweep
    ? ["春", "夏", "秋", "冬"].flatMap((s) => ["晴", "雨", "雾", "雪"].map((k) => ({ season: s, sky: k })))
    : [{ place: arg.place, season: arg.season ?? "秋", sky: arg.sky ?? "晴", tag: arg.tag }];

  for (const cell of cells) {
    await evaluate(overrideScene(cell));
    // Force a rebuild with the override: stub fetchState for one pass.
    await evaluate(`(() => {
      const demo = window.__artOverride;
      // rebuild is internal; trigger via the refresh button after monkey-patching fetch once
      const of = window.fetch;
      window.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(demo) });
      document.getElementById("btnRefresh").click();
      window.fetch = of;
      return true;
    })()`);
    // Wait for the HUD to actually report the requested cell (terrain/detail rebuild is heavy),
    // then let a few frames render so atmosphere/particles settle.
    await until(
      async () => {
        const meta = await evaluate('document.getElementById("hudMeta").textContent');
        return typeof meta === "string" && meta.includes(cell.season) && meta.includes(cell.sky) ? true : false;
      },
      `scene did not switch to ${cell.season}/${cell.sky}`,
      20000,
    );
    await sleep(900);
    const name = `art-${cell.place ?? "place:yard"}-${cell.season}-${cell.sky}.png`.replaceAll(":", "");
    await shot(name);
    if (!arg.sweep) await dumpCanvas(name, cell.tag ?? `${cell.season}-${cell.sky}`);
    if (arg.verify) await verifyDeterminism(cell);
  }
} finally {
  if (socket) { try { await cdp("Browser.close"); } catch {} socket.close(); }
  browser?.kill(); server?.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }); } catch {}
}
