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

## 第十轮：module.ts 再拆三块（4400 → 3926 行）

- **做法**：按 module.ts 已有的分节，原样搬出三个文件，每个都按 marriage.ts 的写法提供自己的 `registerX(ctx)`，由 module.ts 注册：
  - `passing.ts`（人走了：全村记住他、家里人难过；继承人 `heirsOf`）
  - `storyteller.ts`（长跳时间里一季过去，村里统一结算生老病死、婚嫁和新闻：`seasonTurnEffects` 和 seasonTurn 命令）
  - `season-life.ts`（一季一季地过 `liveSeason`；成家与生养 `familyView`、`registerFamilyLife`）
  - 另外，三处都用到的 `prototypeForResource` 并入 `village-reads.ts`。
- module.ts 原来公开的名字照样 re-export。这三个文件都不 import module.ts，搬完全仓库仍然零环。
- **守卫**：
  - `import-cycles.test.ts` 收紧为：settlement-locations 包内除了入口 `index.ts`，任何文件都不得 import `module.ts`。
  - 另有一条检查 re-export 出去的是同一个对象。
  - 体量天花板下调到 3926 行。
- **行为不变的证据**：同一个脚本（种子 7，开局后过 40 天，再连过 6 季，期间会触发讲故事的人和一季结算），在基线 c2e3efb、第九轮、第十轮上跑，存档快照的 sha256 前 16 位都是 `44165db0fc69dd6c`，事件数都是 281。
