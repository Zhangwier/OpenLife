# 人物互动深挖 — 2026-10-17

**基线**：分支 `openlife-hark-experience-20261017`（`54ee146`，上一轮故事层），它建在 main `f95084ef86a2f9ac42711c92ecc4e740db00a146` 之上；开工前已 `git pull` 确认 main 无新提交。

## 数据
- `modules/village-stories/data/river-terrace.bonds.json`：关系等级、行为权重、关系网（亲属/朋友/对头 + 争执与调解文本）、作息（晨/午/暮/雨）、偶遇台词、等级场景、特殊人物服务。
- `settlement-locations/data/river-terrace.json`（+`.people.json`）：新居民 **蓍婆（巫医）**、**阿砺（石匠）**，含喜好、生日、心事场景、ties。
- `river-terrace.stories.json`：3 条新支线（蓍婆的药圃 / 阿砺的燧石 / 长老的托付）、2 棵新对话树、按等级/芥蒂解锁的新选项、5 个新成就。

## 代码
- `src/bonds.ts`：等级换算、关系网与涟漪、时辰（由当天已用体力得出）、作息地点、争执（按日期确定）、数据校验 `bondsProblems()`。
- `src/people-rules.ts`：一起干活、作息移动 + 偶遇（不挤满地点，给玩家留位）、争执站队/调解、特殊人物服务、`peopleView`。
- `src/journal.ts`：`Outcome` 记下每笔交情变化（来源 + 数值）、涟漪、等级场景；对话的交情一天只算一次。
- 新命令：`village-stories.quarrel.settle {side}`、`village-stories.service.use {serviceId, targetNpc?}`。
- Web「故事」页新增「村里的人」：等级、心数、距下一级、此刻位置与作息、亲友仇关系、能人相助按钮、最近来往（带数值）、争执卡片。

## 验证
- `tests/unit/village-people.test.ts`（10 项）+ 既有故事层/网页测试。
- 改了 5 个既有测试里写死的居民数量（14 → 16）。
