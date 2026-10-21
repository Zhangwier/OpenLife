# 长局性能与存档瘦身（2026-10-18）

基线：`main` c2e3efb。测量方法：`npm run bench`，种子 7，开局村落，每天的操作和网页上点一次「过一天」一样（`settlement-locations.end_day` 加一天推进），连续 120 天。

| 指标 | 基线 | 本轮 |
|---|---|---|
| 过一天 p50 | 343 ms | 约 71 ms |
| 过一天 p95 | 435 ms | 约 94 ms |
| 存档（紧凑 JSON，和网页自动存档同一格式） | 8028 KB | 1420 KB |
| 事件日志 | 19354 条 / 7.2 MB | 1628 条 / 0.6 MB |
| 网页 /api/action 过一天（含状态投影） | 374–571 ms | 158–228 ms |
| 网页测试「借罐取水」 | 40 s 超时 | 通过 |

## 题目一：过一天提速

- **读世界时延迟拷贝**（`packages/world-model/src/view.ts`）
  - `getComponent` 和实体/关系视图里的组件，第一次读到时才深拷贝。读出来的东西仍归调用方所有，改了也不影响世界。
  - `listEntities` / `listRelations` 的视图在第一次访问 `components` 时才构建组件表，大多数调用方只看 id 和是否归档。
- **写入时由事务自己拷贝一份**（`packages/kernel/src/transaction.ts`），所以视图可以按引用捕获存储里的值。
- **按字段读**：`WorldView.getField?` 和 `readField()`（`packages/contracts/src/rule.ts`）只拷贝一个字段，用在热路径上：恩情、社交记忆、存活检查。
- **只含在用关系的索引**（`packages/world-model/src/store.ts`）：已归档的历史关系不用再逐条跳过。归档撤销和事务回滚后，顺序和原来一致。`listRelations` 改成普通循环。
- **事件日志的 id 索引和二分查找 `since()`**（`packages/kernel/src/event-log.ts`）。
- **村落层的小修**：`worksites()` 只扫一遍物品；NPC 观察周围时少做一次重复查询。

## 题目二：存档与事件日志瘦身

- **事件日志保留策略**（`packages/simulation/src/simulation.ts`）
  - 有历史分量的事件永久保留，被它们引为起因的事件也一样。
  - 日常事件保留 30 天，每 10 天裁剪一次。裁剪只看当前 tick，所以中途存档再读档的一局，和从没停过的一局得到完全一样的日志。
- **模块在 manifest 里声明事件类型**（`packages/contracts/src/module.ts`）
  - `traceEvents`：只是一时痕迹的事件，只留 `days` 天。world-space 的 moved / repositioned 和 settlement-locations 的 arrived / rested 留 3 天。
  - `lastingEvents`：没有历史分量、但别的代码要数的里程碑，永久保留，例如 modern-world 的 `modern.year_passed`。
- **性能基准和预算**：`scripts/bench-days.ts` 配合 `scripts/bench-budget.json`。`npm run bench -- --check` 在以下情况失败：p95 超标；后 30 天比前 30 天慢太多，说明每天的耗时又在随历史增长；存档或日志超标。

## 怎么验证

- `tests/unit/long-run-perf.test.ts`，共 6 个用例：
  - 延迟拷贝仍归调用方所有
  - 在用关系索引经过归档和回滚后仍然一致
  - 日志裁剪、按 id 查找、`since()` 跨过空洞
  - 保留规则：有分量的、近期的、起因、痕迹、里程碑
  - 中途存档读档和不停的一局结果相同
  - 60 天后存档和日志在预算内
- `npm run bench -- --check`
