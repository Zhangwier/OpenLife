/** 村民日志说人话：并掉「去了某处、和那里的人聊了几句」，同样的事只说一次，念头放前头。 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tellGroup } from "@openlife/module-settlement-locations";

test("going somewhere to chat reads as one sentence with names", () => {
  assert.equal(tellGroup("想见见人", ["去了公用灶台", "和阿灶、阿稷聊了几句"]), "想见见人，到公用灶台和阿灶、阿稷聊了几句");
});

test("repeats collapse into a count instead of a ledger", () => {
  assert.equal(tellGroup("照看自己在芦苇滩的活", ["采了一份芦苇", "采了一份芦苇", "采了一份芦苇"]), "照看自己在芦苇滩的活，采了一份芦苇（3回）");
});

test("no motive, no dangling brackets", () => {
  assert.equal(tellGroup("", ["去了河边取水点", "采了一份河水"]), "去了河边取水点，采了一份河水");
});
