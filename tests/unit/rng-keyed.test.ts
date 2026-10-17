/**
 * A2 随机流隔离：加一个变量，其他结果不变。
 *
 * 文档的核心问题：以前 fork 的键是 `command:${type}:${id}`，命令 id 全局递增。
 * 插一条命令（一次天命拨动、一个插件的年度命令），后面所有随机结果都会变，
 * 所以 `--compare` 测的其实是「另一段历史」，不是「只改了一个变量的同一段历史」。
 *
 * 解法：键控流 `rng.keyed(...)`，种子只由 (世界种子, 键) 决定，与命令顺序
 * 和抽取次数都无关。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DeterministicRng } from "../../packages/kernel/src/rng.ts";

test("keyed 流：同一个键，同一个序列", () => {
  const a = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:1");
  const b = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:1");
  const seqA = Array.from({ length: 8 }, () => a.nextUint32());
  const seqB = Array.from({ length: 8 }, () => b.nextUint32());
  assert.deepEqual(seqA, seqB, "同一个键应该得到同一个序列");
});

test("keyed 流：不同的键，不同的序列", () => {
  const a = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:1");
  const b = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:2");
  assert.notDeepEqual(
    Array.from({ length: 4 }, () => a.nextUint32()),
    Array.from({ length: 4 }, () => b.nextUint32()),
    "不同的键应该得到不同的序列",
  );
});

test("keyed 流与抽取次数无关：先抽了别的，结果不变", () => {
  // 在调用 keyed 之前，从根流抽取很多次——这改变根流的 draws，但不改变 keyed 流。
  const root = DeterministicRng.fromSeed(7);
  const early = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:1");
  for (let i = 0; i < 50; i += 1) root.nextUint32();
  const late = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:1");
  assert.deepEqual(
    Array.from({ length: 8 }, () => early.nextUint32()),
    Array.from({ length: 8 }, () => late.nextUint32()),
    "keyed 流不受中间抽取的影响",
  );
});

test("实例 keyed：从 fork 出来的流上取，也一样稳定", () => {
  const root = DeterministicRng.fromSeed(7);
  const fork = root.fork("command:foo:1");
  const a = fork.keyed("tech", "inspiration", 20, "person:1");
  fork.nextUint32();
  fork.nextUint32();
  const b = fork.keyed("tech", "inspiration", 20, "person:1");
  assert.deepEqual(
    Array.from({ length: 6 }, () => a.nextUint32()),
    Array.from({ length: 6 }, () => b.nextUint32()),
    "fork 上再 keyed，也一样稳定",
  );
});

test("世界种子变了，同一个键的结果才变", () => {
  const a = DeterministicRng.keyed(7, "chronicle", "birth", 20, "house:1");
  const b = DeterministicRng.keyed(8, "chronicle", "birth", 20, "house:1");
  assert.notDeepEqual(
    Array.from({ length: 4 }, () => a.nextUint32()),
    Array.from({ length: 4 }, () => b.nextUint32()),
    "种子不同，序列就该不同",
  );
});

test("旧 fork 行为不变（向后兼容）", () => {
  // fork 仍然按命令 id 派生——这是既有行为，不能因为新增 keyed 而改变。
  const root = DeterministicRng.fromSeed(7);
  const a = root.fork("command:foo:1");
  const b = root.fork("command:foo:1");
  assert.deepEqual(
    Array.from({ length: 4 }, () => a.nextUint32()),
    Array.from({ length: 4 }, () => b.nextUint32()),
    "同一个命令 id，同一个 fork",
  );
  const c = root.fork("command:foo:2");
  assert.notDeepEqual(
    Array.from({ length: 4 }, () => a.nextUint32()),
    Array.from({ length: 4 }, () => c.nextUint32()),
    "不同命令 id，不同 fork",
  );
});
