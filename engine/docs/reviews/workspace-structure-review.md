# Workspace 结构审查与五轮改进

## 审查意见

### 模块划分
- 分层方向整体正确：`packages/`（11 个，世界观中立）→ `modules/`（36 个）→ `apps/`（2 个），依赖图无环，`packages/` 没有反向依赖模块。
- 依赖声明与实际 import 不一致：5 个包 import 了未在 package.json 声明的 `@openlife/*` 包（craft-pottery、world-clock、save-system、debug-console、web）。hoisted node_modules 掩盖了问题，单独发布或换包管理器就会断。
- 另有若干“已声明未使用”的依赖（如 simulation → autonomy-runtime / world-model、world-space → practice-runtime、save-system → kernel / history-runtime），可能是有意预留，本次未删除，留待维护者确认。
- `modules/map-pack` 依赖顶层组装包 `@openlife/simulation`，模块层直接依赖“整机”，耦合偏高，建议将其需要的类型/接口下沉到 contracts。

### 内容组织
- 体量严重不均：`settlement-locations/src/module.ts` 单文件 3284 行，承载创建、日程、交易、烹饪、编织、农耕、视图投影等十余个子领域；`historical-memory`、`world-objects`、`world-geography/boundary-handshake.ts` 也都超过 1200 行。
- 根目录堆放 7 份带日期的工作记录，与长期需求文档混在一起；README 的目录结构只列出 6 个模块，已严重过时。
- 测试全部平铺在 `tests/unit/`（55 个文件），没有与模块对应的分组。

### 扩展性短板
- 缺少结构守卫：新模块是否声明依赖、是否越层、是否成环，都只能靠人工审查。
- 没有可查询的模块目录：要知道某个 capability 由谁提供、谁 requires，只能逐个打开 manifest。
- 每个模块对外只有一个 `src/index.ts`，但大模块内部没有子目录约定，继续往 `module.ts` 里追加是阻力最小的路径。

## 五轮改进

1. **修正 workspace 依赖声明**：为 5 个包补上实际 import 的 `@openlife/*` 依赖（全部为 workspace 内部 `"*"`，未改任何外部依赖版本），同步 package-lock.json 的 workspace 条目。验证：依赖扫描缺失项 0。
2. **新增架构守卫测试** `tests/unit/workspace-structure.test.ts` + `scripts/workspace-graph.ts`：import 必须声明、声明必须存在、分层不可反向、依赖图无环、每个包有 `src/index.ts` 且导出 `.`、模块包命名 `@openlife/module-<dir>`、根目录不放带日期笔记。验证：8 项通过；临时回退 world-clock 的 package.json 后测试准确报错。
3. **拆分 settlement-locations 的交易子域**：以物易物（NPC 互换 + 玩家与阿灶交易）移到 `src/barter.ts`，共享的 `refuse` / `Registration` 放入 `src/rules.ts`（避免经 `index.ts` 的 `export *` 泄露），两段重复的过户 Effect 合并为 `swapItemEffects`。module.ts 3284 → 2958 行，行为不变。
4. **整理文档结构**：7 份带日期工作记录移入 `docs/notes/`（无代码引用），新增 `docs/README.md` 文档索引；守卫测试防止回流根目录。
5. **生成式模块目录**：`scripts/gen-module-catalog.ts` 读取各模块 manifest，生成 `docs/MODULES.md`（按 World / System / Content Pack 分组，含 provides / requires / workspace 依赖）；新增 `npm run catalog` / `catalog:check` 和 `tests/unit/module-catalog.test.ts`（目录过期即失败、每个模块必须导出 manifest）；README 目录结构改为指向它。

全量 `node --test`：439/439 通过（原 429 + 新增 10）。
