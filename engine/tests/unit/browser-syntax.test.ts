import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("every browser entry parses before it is shipped", () => {
  const root = new URL("../../apps/web/public/", import.meta.url);
  const failures: string[] = [];
  for (const file of readdirSync(root).filter(name => name.endsWith(".js"))) {
    try { execFileSync(process.execPath, ["--check", fileURLToPath(new URL(file, root))], { stdio: "pipe" }); }
    catch (error) { failures.push(`${file}: ${String((error as { stderr?: unknown }).stderr)}`); }
  }
  assert.deepEqual(failures, [], "a syntax error prevents the complete browser module from starting");
});
