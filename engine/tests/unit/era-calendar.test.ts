/**
 * World era model (需求书 §96).
 *
 * tick 0 anchors the founding of the Xia dynasty at 2070 BCE. The kernel only
 * knows a monotonic tick counter; the era anchor is a life-contracts decision,
 * so these tests pin the mapping and its display form.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ERA_START_YEAR,
  TICKS_PER_YEAR,
  formatTick,
  formatYear,
  tickOfYear,
  yearOfTick,
} from "@openlife/life-contracts";

test("tick 0 is 2070 BCE, not a modern year", () => {
  assert.equal(formatYear(ERA_START_YEAR), "公元前 2070 年");
  assert.equal(yearOfTick(0), ERA_START_YEAR);
  assert.notEqual(yearOfTick(0), 2000);
  assert.ok(yearOfTick(0) < 0);
});

test("BCE years are rendered with the era prefix", () => {
  assert.equal(formatYear(-2069), "公元前 2070 年");
  assert.equal(formatYear(-840), "公元前 841 年");
});

test("CE years are rendered with the era prefix", () => {
  assert.equal(formatYear(2026), "公元 2026 年");
  assert.equal(formatYear(1), "公元 1 年");
});

test("astronomical year 0 is 1 BCE", () => {
  assert.equal(formatYear(0), "公元前 1 年");
  assert.equal(formatYear(-1), "公元前 2 年");
});

test("tick advances one year per TICKS_PER_YEAR ticks", () => {
  assert.equal(yearOfTick(TICKS_PER_YEAR), ERA_START_YEAR + 1);
  assert.equal(yearOfTick(TICKS_PER_YEAR * 10), ERA_START_YEAR + 10);
});

test("the world can still reach a modern year by running forward", () => {
  // 2070 BCE -> 2026 CE is 4096 years, so the anchor is not a one-way door.
  assert.equal(yearOfTick(tickOfYear(2026)), 2026);
  assert.ok(tickOfYear(2026) > 0);
});

test("tickOfYear inverts yearOfTick at year boundaries", () => {
  for (const year of [-2069, -840, -220, 1, 618, 1912, 2026]) {
    assert.equal(yearOfTick(tickOfYear(year)), year);
  }
});

test("formatTick renders a readable era date", () => {
  assert.equal(formatTick(0), "公元前 2070 年 01月");
  // Crossing the BCE/CE boundary: 2070 BCE + 2070 years lands on 1 CE.
  assert.equal(formatTick(TICKS_PER_YEAR * 2070), "公元 1 年 01月");
  assert.equal(formatTick(TICKS_PER_YEAR * 2070 - TICKS_PER_YEAR), "公元前 1 年 01月");
});

test("a custom era anchor is honoured rather than ignored", () => {
  // Guards against the previous bug where startYear was declared but never used.
  assert.equal(formatYear(yearOfTick(0, -840)), "公元前 841 年");
  assert.equal(formatTick(0, -840), "公元前 841 年 01月");
  assert.equal(yearOfTick(0, 0), 0);
  assert.notEqual(yearOfTick(0, -840), yearOfTick(0));
});
