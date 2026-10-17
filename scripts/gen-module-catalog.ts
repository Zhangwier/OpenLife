/**
 * Generates docs/MODULES.md: the layered catalog of every workspace package,
 * with each module's OpenLifeModule manifest (id, type, requires, provides).
 *
 *   npm run catalog          # rewrite docs/MODULES.md
 *   npm run catalog -- --check  # exit 1 if docs/MODULES.md is stale
 *
 * The catalog is derived, never hand-edited: tests/unit/module-catalog.test.ts
 * fails when a module is added, renamed or re-wired without regenerating it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readWorkspace, type WorkspacePackage } from "./workspace-graph.ts";

/** The web app's own module list, with its core/plug-in split. */
async function webCoreModules(): Promise<Set<string>> {
  try {
    const { WEB_MODULE_ENTRIES } = await import("../apps/web/src/modules.ts") as {
      WEB_MODULE_ENTRIES: Array<{ module: { manifest: { id: string } }; core?: boolean }>;
    };
    return new Set(WEB_MODULE_ENTRIES.filter((e) => e.core).map((e) => e.module.manifest.id));
  } catch {
    return new Set();
  }
}

export const CATALOG_PATH = path.join(REPO_ROOT, "docs", "MODULES.md");

interface ManifestLike {
  id: string;
  type: string;
  name?: string;
  requires?: readonly string[];
  provides?: readonly string[];
  optional?: readonly string[];
}

function isManifest(value: unknown): value is ManifestLike {
  return Boolean(value && typeof value === "object" &&
    typeof (value as ManifestLike).id === "string" && typeof (value as ManifestLike).type === "string");
}

async function manifestsOf(pkg: WorkspacePackage): Promise<{ exportName: string; manifest: ManifestLike }[]> {
  const exports = await import(pkg.name) as Record<string, unknown>;
  return Object.entries(exports)
    .flatMap(([exportName, value]) => {
      const manifest = value && typeof value === "object" ? (value as { manifest?: unknown }).manifest : undefined;
      return isManifest(manifest) ? [{ exportName, manifest }] : [];
    })
    .sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
}

const short = (name: string) => name.replace(/^@openlife\//, "");
const list = (items: readonly string[] | undefined) => (items && items.length ? items.map((i) => `\`${i}\``).join(", ") : "—");
const cell = (text: string) => text.replace(/\|/g, "\\|");

export async function renderCatalog(): Promise<string> {
  const workspace = readWorkspace();
  const lines: string[] = [
    "# Workspace 目录",
    "",
    "<!-- 由 scripts/gen-module-catalog.ts 生成，请勿手改；修改后运行 `npm run catalog`。 -->",
    "",
    "分层规则（由 `tests/unit/workspace-structure.test.ts` 强制）：`packages/` 是不含世界观的引擎核心，",
    "`modules/` 只能依赖 `packages/` 与其他模块，`apps/` 位于最上层；依赖图必须无环，",
    "源码中 import 的每个 `@openlife/*` 包都必须在自己的 package.json 中声明。",
    "",
    "## packages/ · 引擎核心",
    "",
    "| 目录 | 包名 | 依赖（workspace） |",
    "| --- | --- | --- |",
  ];
  for (const p of workspace.filter((w) => w.layer === "packages")) {
    lines.push(`| \`${p.dir}\` | \`${p.name}\` | ${cell(p.declared.map(short).join(", ") || "—")} |`);
  }

  const modules = workspace.filter((w) => w.layer === "modules");
  const core = await webCoreModules();
  const rows: { type: string; line: string }[] = [];
  for (const p of modules) {
    const manifests = await manifestsOf(p);
    for (const { exportName, manifest } of manifests) {
      rows.push({
        type: manifest.type,
        line: `| \`${p.dir}\` | ${cell(p.label || "—")} | \`${manifest.id}\` (\`${exportName}\`) | ${list(manifest.provides)} | ${list(manifest.requires)} | ${cell(p.declared.map(short).join(", ") || "—")} | ${core.has(manifest.id) ? "core" : "可关"} |`,
      });
    }
  }
  const typeTitles: Record<string, string> = {
    "world-pack": "World Pack · 世界观",
    "system-pack": "System Pack · 通用系统",
    "content-pack": "Content Pack · 具体内容",
  };
  const types = [...new Set(rows.map((r) => r.type))].sort((a, b) =>
    Object.keys(typeTitles).indexOf(a) - Object.keys(typeTitles).indexOf(b));
  lines.push("", `## modules/ · ${modules.length} 个模块包`);
  for (const type of types) {
    const group = rows.filter((r) => r.type === type);
    lines.push("", `### ${typeTitles[type] ?? type}（${group.length}）`, "",
      "| 目录 | 名称 | 模块 id（导出） | provides | requires | 依赖（workspace） |",
      "| --- | --- | --- | --- | --- | --- |",
      ...group.map((r) => r.line));
  }

  lines.push("", "## apps/ · 应用", "", "| 目录 | 包名 | 依赖（workspace） |", "| --- | --- | --- |");
  for (const p of workspace.filter((w) => w.layer === "apps")) {
    lines.push(`| \`${p.dir}\` | \`${p.name}\` | ${cell(p.declared.map(short).join(", ") || "—")} |`);
  }
  return `${lines.join("\n")}\n`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const next = await renderCatalog();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(CATALOG_PATH) ? fs.readFileSync(CATALOG_PATH, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== next) {
      console.error("docs/MODULES.md is stale; run `npm run catalog`.");
      process.exit(1);
    }
    console.log("docs/MODULES.md is up to date.");
  } else {
    fs.writeFileSync(CATALOG_PATH, next);
    console.log(`wrote ${path.relative(REPO_ROOT, CATALOG_PATH)}`);
  }
}
