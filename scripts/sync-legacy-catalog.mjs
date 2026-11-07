// Extract the *full* legacy module/package inventory from the archived source.
// This is a traceability artifact, NOT an assertion that the modules run in CardWorld.
// Run from this repository: node scripts/sync-legacy-catalog.mjs [--check]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "engine", "docs", "MODULES.md");
const destPath = path.join(root, "docs", "integration", "legacy-capabilities.json");
if (!fs.existsSync(sourcePath)) {
  console.error("Missing migrated engine catalog: " + sourcePath);
  process.exitCode = 2;
} else {
  const lines = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/);
  const tags = (text) => [...text.matchAll(/`([^`]+)`/g)].map(m => m[1]);
  const rows = (line) => line.split("|").map(x => x.trim()).filter(Boolean);
  const modules = new Map(), packages = [];
  let kind = "";
  for (const line of lines) {
    if (/^## packages\//.test(line)) kind = "kernel";
    if (/^### World Pack/.test(line)) kind = "world";
    if (/^### System Pack/.test(line)) kind = "system";
    if (/^### Content Pack/.test(line)) kind = "content";
    if (line.startsWith("| `packages/") && kind === "kernel") {
      const col = rows(line);
      const dir = tags(col[0])[0];
      if (!dir) continue;
      packages.push({ directory: dir, package: tags(col[1])[0] ?? "", dependencies: col[2] === "—" ? [] : col[2].split(",").map(x => x.trim()) });
    }
    if (line.startsWith("| `modules/") && ["world", "system", "content"].includes(kind)) {
      const col = rows(line), source = tags(col[0])[0], id = tags(col[2])[0];
      if (!id || !source) continue;
      // Some modules have multiple exports, so keep all origins without pretending
      // each export is an independently runnable engine module.
      const prev = modules.get(id);
      if (prev) { if (!prev.exports.includes(col[2])) prev.exports.push(col[2]); continue; }
      modules.set(id, {
        id, kind, source, title: col[1], provides: tags(col[3]),
        requires: col[4] === "—" ? [] : tags(col[4]),
        exports: [col[2]], runtime: "source-migrated", playerCoverage: "tracked-separately",
      });
    }
  }
  const output = {
    schemaVersion: 1,
    provenance: "engine/docs/MODULES.md (from archives/openlife-engine-20261102)",
    meaning: "Inventory of migrated engine sources. Runtime activation is checked independently by npm run engine:profiles.",
    checkoutRoot: "engine",
    integrationContract: "docs/integration/README.md",
    packages, modules: [...modules.values()],
  };
  const json = JSON.stringify(output, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(destPath) || fs.readFileSync(destPath, "utf8") !== json) {
      console.error("Legacy catalog is missing or stale; run npm run legacy:catalog");
      process.exitCode = 1;
    } else console.log("Legacy catalog verified: " + packages.length + " packages, " + modules.size + " module IDs");
  } else {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, json, "utf8");
    console.log("Captured " + packages.length + " engine packages and " + modules.size + " distinct module IDs from archive.");
  }
}
