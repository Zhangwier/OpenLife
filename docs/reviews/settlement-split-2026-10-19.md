# settlement-locations：拆掉包内 import 环，继续拆 module.ts（2026-10-19）

承接 `structure-review-2026-10-17.md` 的「建议下一步」。基线 `main` c2e3efb。

## 第九轮：包内 import 环 9 个文件 → 0

- **问题**：`module.ts` 要跑村里一天的 agent（`autonomy/village-day.ts`），而 agent 们又回头从 `module.ts` 读世界（`dailyActivity`、`currentYields`、`familyDue`……）。9 个文件互相 import，顶层常量能不能读到要看谁先被加载（TDZ）。
- **做法**：把这些读世界的函数，连同它们在文件里用到的 61 个声明（常量、类型、辅助函数），一起原样搬到新文件 `village-reads.ts`。这个文件只依赖 vocabulary、content、social 这些底层文件，从不 import `module.ts` 或 `autonomy/*`。agent 改为从 `village-reads.ts`、`hunger.ts`、`world-reads.ts` 读。`module.ts` 照样 re-export 原来的公开名字，对外 API 不变。代码只搬、不改。
- **守卫**（`tests/unit/import-cycles.test.ts`）：
  - 全仓库不允许有任何文件级 import 环，原来冻结的名单删掉了。
  - `autonomy/*` 和 `village-reads.ts` 不得 import `module.ts`。
  - `module.ts` re-export 的函数和 `village-reads.ts` 里的是同一个对象。
- **变异测试**：在 `autonomy/roles.ts` 里加回一条 `import … from "../module.ts"`，前两个守卫都失败，并报出环上的 7 个文件。
- module.ts 从 4971 行降到 4400 行，体量天花板同步下调。
