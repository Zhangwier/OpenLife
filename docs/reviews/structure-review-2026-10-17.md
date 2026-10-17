# 结构审查与六轮结构改进（2026-10-17）

基线：`f95084ef86a2f9ac42711c92ecc4e740db00a146`（远端 main 最新）。基线全量测试 529/529 通过。

## 一、审查意见

### 模块划分
- 三层（packages → modules → apps）清楚，且已有守卫：依赖声明、分层方向、无环、命名、生成的 `docs/MODULES.md`。
- **settlement-locations 过重**：`src/module.ts` 5209 行，装着建村、日常行动、交换、学艺、结亲、成家、换季等十多块逻辑，占全部模块源码的约七分之一。
- **包内运行时循环依赖**：settlement-locations 里 10 个文件互相 import（module.ts ⇄ barter.ts ⇄ autonomy/*）。原因是命令名、组件名这类常量只放在 module.ts 里，卫星文件只能回头 import 它。按 import 顺序，顶层常量随时可能处在 TDZ（暂时性死区）里，这是一颗定时炸弹；而且现有守卫只看包与包之间，看不到包内的文件环。
- `packages/query`、`packages/history-runtime` 没有任何测试直接 import，契约只是通过 Simulation 间接被跑到。

### 内容组织
- 地图包放在 `packs/`，但 Web 目录里写死了两个包 id 和对应的中文名：新增一个地图包，就得改 App 代码。
- 36 个模块的中文显示名和简介写死在 `apps/web/src/catalog.ts` 里，其中 4 个模块没有收录。模块自己的元数据不在模块里，新增模块很容易漏掉。

### 扩展性短板
- **没有类型检查**：仓库不依赖 typescript，CI 也只跑 `node --test`。实测基线有 **251 个 TS 错误**，分布在 56 个文件里，而且没人知道它在增长。
- 没有文件体量约束，超大文件只会越写越大。

## 二、逐轮改进（每轮一个 commit，均可验证）

| 轮 | 改进 | 实现 | 验证 |
| --- | --- | --- | --- |
| 1 | 地图包自动发现 | `map-pack` 新增 `discoverMapPacks()`；manifest 支持可选 `display_name`；Web 目录改为扫描 `packs/` | `tests/unit/map-pack-discovery.test.ts`：发现、逐包校验、id 等于目录名、目录与发现结果一致 |
| 2 | 模块元数据回归模块 | 36 个 `package.json` 增加 `openlife.label/summary`（补齐 4 个缺失的）；删除 catalog.ts 里的硬编码表；`MODULES.md` 增加「名称」列 | workspace-structure 新守卫；`module-catalog` 检查生成文档 |
| 3 | 打断包内 import 环 | 新建 `settlement-locations/src/vocabulary.ts`，放命令、组件、错误码、id 等纯常量；module.ts 原样再导出，公开 API 不变；barter 与 autonomy 改为引用它 | `scripts/workspace-graph.ts` 新增文件级 import 图与 Tarjan 环检测；`tests/unit/import-cycles.test.ts` 禁止新环，把现存环冻结为只减不增（10→9 文件）；已做变异测试，确认能抓到新环 |
| 4 | 体量预算 + 首次拆分 | `tests/unit/source-size-budget.test.ts`：新文件 ≤1200 行，5 个超大文件设天花板只降不升；把结亲/婚礼拆到 `marriage.ts`，共享读取函数拆到 `world-reads.ts`（都在环外） | module.ts 5209→4975 行；结亲测试、聚落测试全绿；TS 错误集合不变（一条错误随代码移位） |
| 5 | 类型检查棘轮 | 根目录加 devDependency `typescript ~5.6.3`、`@types/node ^24`；`npm run typecheck` 按文件对比 `scripts/typecheck-baseline.json`，有任何文件错误数上升就失败；`typecheck:update` 在修复后下调基线；CI 增加这一步 | `tests/unit/typecheck-ratchet.test.ts`；变异测试（往干净文件塞一个错误）报 REGRESSION 并退出码 1 |
| 6 | 测试归属守卫 | 新增 `package-contracts.test.ts`，直接测 query（投影、viewer、错误码）和 history-runtime（家系、序列化、summarize）；`test-ownership.test.ts` 要求每个包至少被一个测试直接 import | 删掉契约测试后，守卫准确报出这两个包 |

## 三、结果
- 全量测试：529 → **548**，全部通过；`npm run demo` 与 `demo:magic` 均正常；`npm run catalog -- --check` 通过；`npm run typecheck` 为 0 个回归。
- 改动规模：70 个文件，+1121 / −355。
- 未改动：账号、付费服务、游戏行为；全部重构都保持公开 API 不变。

## 四、建议下一步
- 把 `familyDue`、`seasonTurnDue` 和 autonomy 读取的 reader 继续迁出 module.ts，最终让 `runVillageAgent` 通过依赖注入注册，彻底消除剩下的 9 文件环。
- 按 module.ts 现有的分节（换季、成家、身后、手艺）继续拆分，每拆一次就下调天花板。
- 分批修复 TS 错误：约 99 条（四成）是规则对象多写的 `kind` 字段，以及 Effect 联合类型推断失败，都可以批量修。
