# 今日指引 + 内容覆盖矩阵 — 2026-10-17

基线：main `f3021dc80ea7ad7b36d5d2a8c9e7e6700192a7d8`（开工前 `git pull`）。

## 为什么是这两题
- 手机优先路线图（2026-10-16）把“玩家不能自然理解今天想干什么、为什么失败、明天为什么回来”列为最大风险，要求此刻页只给 2–3 条上下文建议、禁用按钮要有原因和可行下一步；代码里还没有任何建议系统。
- 同一份路线图要求“内容覆盖矩阵、条件组合检查”；而且蓍婆、阿砺没有立绘，8 条配方书里的配方加载并校验了，却没有任何命令能做出来。

## 题一：今日指引
- 数据 `modules/village-stories/data/river-terrace.guide.json`：优先级、文案、饥饿阈值、做不成时的恢复规则（按拒绝理由匹配）。
- 代码 `modules/village-stories/src/guide.ts`：`dailyGuide()` 读真实状态（体力、饥饿、节日、突发事件、限时活动、争执、病人、生日、任务进度、身边的人），排出最要紧的一件和至多 3 条建议；`nextStep()` 把拒绝理由换成下一步（走到哪、去哪取、做什么配方、结束这一天）；`tomorrowOf()` 给出明日预告（节日前夜、活动开始、生日、蓍婆问卜过的天气、没办完的托付）。
- 每个按钮都是此刻本来就能执行的动作（来自 settlement 的可用动作列表或故事层的可用命令），做不了的只给文字。
- 投影 `village-stories.guide`；`/api/state.guide`；Web 生活页顶部「今日指引」卡片（`guide.js` / `guide.css`）。
- 测试 `tests/unit/daily-guide.test.ts`：把指引里的每个按钮放到存档复制出来的同一世界里真的点一次，必须成功。

## 题二：内容覆盖矩阵 + 补缺
- `modules/village-stories/src/coverage.ts` + `scripts/content-coverage.ts`（`npm run coverage [-- --check]`）生成 `docs/CONTENT_COVERAGE.md`；每位村民有底线，低于底线测试失败。
- 补齐缺口：7 棵新对话树（阿予、阿石、岚母、阿苇、阿埴、小汲、阿稷），阿灶的对话树加一层，8 段新的关系等级场景，蓍婆和阿砺的日常台词，蓍婆和阿砺的立绘，阿苇立绘重绘（金属镰改为打制石镰）。
- 配方书可玩：`playableBookRecipes()` 把 `river-terrace-recipes.json` 的 8 条配方（鱼干、粟饼、纺轮、陶埙、骨钩、麻布、苇帘、草药包）转成普通配方，交给现有的 craft 命令执行。
- 顺手修复：main 上的 `npm run typecheck` 原本就有 2 处超出基线（content.ts 里配方书类型写错；server.ts 动作表里 `craft` 重复）；现在 0 处超出基线。
- 另外，main 上全量测试原本有 4 项失败：MODULES.md 过期、xia_south_hills 缺 display_name、village-stories 的 package.json 缺 openlife 说明、两个超大文件超过体积上限。现已全部修复：把饥饿数值拆到 `hunger.ts`，把 Web 动作白名单拆到 `apps/web/src/actions.ts`，两个文件的上限也同步调低。
