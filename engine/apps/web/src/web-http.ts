import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

/** Largest request body accepted (a long life's save is a few MB). */
const MAX_BODY_BYTES = Number(process.env.OPENLIFE_MAX_BODY_BYTES ?? 32 * 1024 * 1024);

export async function servePage(req: IncomingMessage, res: ServerResponse, url: URL, cardDir: string, publicDir: string, cardWorldEntry = false) {
  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "静态文件只接受 GET");
  const pathname = url.pathname;
  if (cardWorldEntry && ["/life", "/life/", "/index.html", "/card-world/engine-life.html"].includes(pathname)) {
    res.writeHead(302, { location: "/", "cache-control": "no-store" });
    res.end();
    return;
  }
  const card = pathname === "/" || pathname === "/card-world" || pathname.startsWith("/card-world/");
  let requested: string;
  try {
    const route = card && pathname.startsWith("/card-world") ? pathname.slice("/card-world".length) : pathname;
    requested = ["", "/", "/life", "/life/"].includes(route) ? "/index.html" : decodeURIComponent(route);
  } catch { throw new HttpError(400, "无效的路径"); }
  const root = resolve(card ? cardDir : publicDir);
  const file = resolve(root, "." + requested);
  if (requested.includes("\u0000") || (file !== root && !file.startsWith(root + sep))) throw new HttpError(404, "not found");
  let data: Buffer;
  try { data = await readFile(file); }
  catch { throw new HttpError(404, "not found"); }
  res.setHeader("content-type", contentType(extname(file)));
  res.setHeader("cache-control", "no-cache");
  res.end(req.method === "HEAD" ? undefined : data);
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "请求体过大");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "请求体过大");
    chunks.push(Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "请求体不是有效的 JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HttpError(400, "请求体必须是 JSON 对象");
  return parsed as Record<string, unknown>;
}

function contentType(ext: string): string {
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".json" || ext === ".webmanifest") return "application/json; charset=utf-8";
  return "application/octet-stream";
}
