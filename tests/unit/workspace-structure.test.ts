/**
 * Architecture guard for the npm workspace (packages/ -> modules/ -> apps/).
 *
 * These checks are static: they read package.json files and import statements,
 * so a structural regression fails `npm test` before it can hide behind the
 * hoisted node_modules (where an undeclared import still happens to resolve).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LAYERS, REPO_ROOT, findCycles, readWorkspace } from "../../scripts/workspace-graph.ts";

const workspace = readWorkspace();
const layerOf = new Map(workspace.map((p) => [p.name, p.layer]));

test("workspace scan finds every layer", () => {
  for (const layer of LAYERS) {
    assert.ok(workspace.some((p) => p.layer === layer), `no packages found under ${layer}/`);
  }
});

test("every imported @openlife package is declared in package.json", () => {
  const problems: string[] = [];
  for (const p of workspace) {
    for (const dep of p.imported) {
      if (!p.declared.includes(dep)) problems.push(`${p.name} imports ${dep} (${p.importSites[dep]}) without declaring it`);
    }
  }
  assert.deepEqual(problems, []);
});

test("every declared @openlife dependency is a real workspace package", () => {
  const problems = workspace.flatMap((p) =>
    p.declared.filter((dep) => !layerOf.has(dep)).map((dep) => `${p.name} declares unknown ${dep}`));
  assert.deepEqual(problems, []);
});

test("layering: packages/ never depend on modules/ or apps/, modules/ never on apps/", () => {
  const rank = { packages: 0, modules: 1, apps: 2 } as const;
  const problems: string[] = [];
  for (const p of workspace) {
    for (const dep of new Set([...p.declared, ...p.imported])) {
      const depLayer = layerOf.get(dep);
      if (depLayer && rank[depLayer] > rank[p.layer]) {
        problems.push(`${p.dir} (${p.layer}) -> ${dep} (${depLayer})`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("workspace dependency graph is acyclic", () => {
  assert.deepEqual(findCycles(workspace).map((cycle) => cycle.join(" -> ")), []);
});

test("every package and module has a single src/index.ts entry exported as '.'", () => {
  const problems = workspace
    .filter((p) => p.layer !== "apps")
    .filter((p) => !p.hasIndex || !p.exportsRoot)
    .map((p) => `${p.dir}: hasIndex=${p.hasIndex} exportsRoot=${p.exportsRoot}`);
  assert.deepEqual(problems, []);
});

test("module packages follow the @openlife/module-<dir> naming convention", () => {
  const problems = workspace
    .filter((p) => p.layer === "modules")
    .filter((p) => p.name !== `@openlife/module-${path.basename(p.dir)}`)
    .map((p) => `${p.dir} is named ${p.name}`);
  assert.deepEqual(problems, []);
});

test("repo root keeps only long-lived docs; dated working notes live in docs/notes/", () => {
  const dated = fs.readdirSync(REPO_ROOT).filter((name) => /_\d{4}-\d{2}-\d{2}\.md$/.test(name));
  assert.deepEqual(dated, [], "move dated notes to docs/notes/");
});
