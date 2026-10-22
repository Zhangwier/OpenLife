# OpenLife 文档索引

- AI 协作者入口：[模型分工、首轮任务与协作交接](AI_COLLABORATION.md)。

根目录只保留长期有效的需求与计划文档；带日期的工作记录统一放在 `docs/notes/`
（`tests/unit/workspace-structure.test.ts` 会拒绝根目录出现 `*_YYYY-MM-DD.md`）。

## 需求与计划（根目录）

| 文档 | 内容 |
| --- | --- |
| [`需求书.txt`](../需求书.txt) | 完整设计与架构不变量（INV-001 ~ INV-008） |
| [`OPEN_WORLD_REQUIREMENTS.md`](../OPEN_WORLD_REQUIREMENTS.md) | 自由生活详细需求书 v0.2 |
| [`PLAYABLE_PLAN.md`](../PLAYABLE_PLAN.md) | 首个可玩版本任务书 |

## 结构参考

| 文档 | 内容 |
| --- | --- |
| [`MODULES.md`](./MODULES.md) | 全部 workspace 包的分层目录（由 `npm run catalog` 生成） |
| [`PLUGINS.md`](./PLUGINS.md) | 插件 / Mod 规范：系统模块、内容包、地图包怎么写、怎么开关、怎么拆 |
| [`HISTORY_LAB.md`](./HISTORY_LAB.md) | 历史实验室：禀赋、科技、政治、天命、时代识别，`npm run chronicle` 推演村史 |

## RFC（`docs/rfc/`）

- [`TIME-RFC-001-life-time-scale.md`](./rfc/TIME-RFC-001-life-time-scale.md) · 生活时间尺度兼容设计

## 审查与交付报告（`docs/reviews/`）

- [`M1.1-architecture-closeout.md`](./reviews/M1.1-architecture-closeout.md) · M1.1 架构收口审查
- [`M1.2-B-time-semantics.md`](./reviews/M1.2-B-time-semantics.md) · M1.2-B 时间语义统一

## 工作记录（`docs/notes/`，按日期）

| 日期 | 文档 |
| --- | --- |
| 2026-10-09 | [新版开发任务计划 v1.5](./notes/OPENLIFE_NEXT_TASK_PLAN_2026-10-09.md) |
| 2026-10-09 | [试玩问题：交互与基础生活规则重构方案](./notes/OPENLIFE_PLAYTEST_UX_AUDIT_2026-10-09.md) |
| 2026-10-09 | [UI 竞品与现状调研报告](./notes/OPENLIFE_UI_RESEARCH_2026-10-09.md) |
| 2026-10-10 | [游戏场景 UI 第一轮改造](./notes/OPENLIFE_2D_UI_2026-10-10.md) |
| 2026-10-10 | [组合人物与场景实物交互](./notes/OPENLIFE_CHARACTER_SCENES_2026-10-10.md) |
| 2026-10-10 | [NPC 自治与涌现式生活：首轮实现记录](./notes/OPENLIFE_NPC_AUTONOMY_2026-10-10.md) |
| 2026-10-10 | [河岸与场景即时交互整改](./notes/OPENLIFE_RIVER_INTERACTION_FIX_2026-10-10.md) |

## 当前实施规划

- [长期游戏设计与完善计划（2026-10-22）](plans/long-term-game-design-2026-10-22.md) · 当前玩法完善顺序：季节、一年、一生与传承、地区文化；含 GD-01–GD-17 任务与试玩放行条件。阶段指标是目标，不是完成声明。
- [产品定位](POSITIONING.md) 与 [河岸的第一个季节](plans/FIRST_SEASON.md) · 产品取舍与代表经历。
- [手机优先路线与任务表（2026-10-16）](plans/mobile-life-roadmap-2026-10-16.md)
- [分支整合与验证记录（2026-10-16）](reviews/integration-2026-10-16.md)

## 状态核验

- [需求状态矩阵（BASE-01）](status/requirement-status-matrix.md) · 逐条需求映射到源码证据、自动化验收与真人验收三列，并记录文档声称与代码事实的冲突。
