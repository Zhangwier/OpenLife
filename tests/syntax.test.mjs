import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import test from "node:test";

// The game's own scripts load only in a browser, so the rule tests never touch app.js. This at least makes sure
// every script parses: one syntax slip and the whole game fails to start.
test("every card-world script parses", () => {
  const dir = new URL("../apps/card-world/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const r = spawnSync(process.execPath, ["--check", new URL(f, dir).pathname.replace(/^\/([A-Za-z]:)/, "$1")], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
