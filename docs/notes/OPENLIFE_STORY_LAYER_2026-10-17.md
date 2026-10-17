# 故事层（village-stories）— 2026-10-17

基线：main `f95084ef86a2f9ac42711c92ecc4e740db00a146`（开工前 `git pull`，已是最新）。

## 新增模块 `modules/village-stories`

| 文件 | 作用 |
| --- | --- |
| `data/river-terrace.stories.json` | 全部故事内容（任务、对话树、节日仪式、限时活动、突发事件、成就），纯数据 |
| `src/spec.ts` | 数据类型 + `storyPackProblems()`：校验所有引用（居民、原型、资源、地点、节日、flag、对话节点）都真实存在；模块注册时校验不过直接报错 |
| `src/journal.ts` | 玩家日志组件 `village-stories.journal`、计数器、任务目标进度、奖励（真实生成物品、按居民合并的交情变化）、成就判定、限时窗口、每日突发事件（按日期确定，不消耗 RNG） |
| `src/module.ts` | 6 条命令（约束 + 结算规则）、14 条反应规则（把村里真实事件记成计数）、投影 `village-stories.journal` |

### 命令
- `village-stories.quest.accept {questId}` 接任务（需满足前置；非 autoOffer 的要和发布人在一起）
- `village-stories.quest.turn_in {questId}` 交付：物品真实转给 NPC（所有权+持有）
- `village-stories.dialogue.choose {npc, option, node?}` 对话树选项；`node` 防止界面过期
- `village-stories.festival.rite {}` 节日当天、在节日地点、一年一次
- `village-stories.event.join {eventId, offerId}` 限时活动窗口内、在地点、一年一次
- `village-stories.incident.resolve {incidentId, choiceId}` 当天突发事件，只能应对一次

### 计数来源（只计当前玩家自己的行为）
conversation（含节日加入）、gathered、water_carried、crafted、cooked、gift_given、exchanged、player_barter_accepted、hearth_helped、lesson、harvested、sown、wish_fulfilled、roof_mended。

## 对既有代码的改动（最小）
- `settlement-locations` 居民组件加 `writableBy: ["village-stories"]`（让故事选择能改真实交情，INV-007 授权）。
- `river-terrace.json` 新增两个节日：祭河（6/6，河边）、望月（8/15，公灶）。
- Web：`server.ts` 装载模块、`/api/state` 带 `stories`、`/api/action` 放行故事命令；新增「故事」页（`stories.js` / `stories.css`，导航「故事」）。

## 验证
- `tests/unit/village-stories.test.ts`（9 项）+ `tests/integration/stories-web.test.ts`（HTTP 端到端）。
- 全量 539/539；demo、demo:magic、catalog --check 通过；typecheck 251 个既有错误，0 个新增。
