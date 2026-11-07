// Local entry for the combined game, with a standalone CardWorld fallback.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("./apps/card-world/", import.meta.url)));
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "127.0.0.1";
const engineReady = Number(process.versions.node.split(".")[0]) >= 24 &&
  existsSync(new URL("./engine/node_modules/@openlife/simulation/package.json", import.meta.url));
if (process.env.OPENLIFE_CARD_ONLY !== "1" && engineReady && ["127.0.0.1", "localhost", "::1"].includes(HOST)) {
  process.env.OPENLIFE_CARD_DIR = ROOT;
  await import("./engine/apps/web/server.ts");
} else {
  if (!engineReady && process.env.OPENLIFE_CARD_ONLY !== "1") console.log("卡牌世界独立运行。使用 Node.js 24 和 npm run engine:setup 启用引擎。");
  startCardWorld();
}

function startCardWorld() {
  const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  const server = createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("只接受 GET");
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("无效的路径");
      return;
    }
    if (pathname === "/" || pathname === "/card-world" || pathname === "/card-world/") pathname = "/index.html";
    else if (pathname.startsWith("/card-world/")) pathname = pathname.slice("/card-world".length);

    const file = resolve(ROOT, "." + pathname);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
    }
  });
  server.listen(PORT, HOST, () => {
    const host = HOST.includes(":") ? `[${HOST}]` : HOST;
    console.log(`OpenLife 卡牌世界：http://${host}:${server.address().port}`);
  });
}
