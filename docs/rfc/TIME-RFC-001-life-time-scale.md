# TIME-RFC-001 生活时间尺度兼容设计

状态：**Accepted（本 RFC 已实施）**
依据：`OPEN_WORLD_REQUIREMENTS.md` §5 TIME-001 完成标准、§10 ARCH-001、原需求书 §12/§66、§INV-004、§INV-008。
适用范围：`packages/contracts`（新增 Clock 扩展点）、`packages/life-contracts`、新模块 `world-clock`、`apps/web` 时间投影与行动耗时。
不改变：Kernel 的 `tick: number` 单调计数器语义（§12「Kernel 尽量小」仍成立）。

---

## 1. Problem — 现有抽象为什么解决不了？

现状：

```text
life-contracts:  TICKS_PER_YEAR = 12;  TICKS_PER_MONTH = 1
world-clock     不存在
行动耗时         settlement-life 直接写死 cost = 1 或 2（月）
```

后果：

1. 一次「取水」、一次「打个招呼」与一次「烧一窑陶」在时间轴上完全等价，都是 1 tick。
   `OPEN_WORLD_REQUIREMENTS.md` §5 明确指出这会失真。
2. 十次短对话会让角色老十个月，直接违反 TIME-001 完成标准第一条。
3. 若要接入日级操作，只能把 `TICKS_PER_YEAR` 改成 365，这会同时改变年龄、婚育冷却、制陶阶段、
   历史年份锚点、`historical-era`/`world-weather` 的季节相位与 `world-time` 的多分辨率节奏 —— 全部失真。
4. `advanceBy(n)` 是原子推进：它不能表达「玩家在事件发生的当刻停下」。
   现有 `settlement-life` 只能用 `busyUntil` 事后判断，玩家等待期间无法被打断。

因此 TIME-001 要求的「先提交时间兼容设计，再写日程」无法在旧尺度上完成。

---

## 2. Affected Worlds — 至少三个不同世界观

| 世界观 | 需要的最小时间单位 | 为什么同一抽象仍然成立 |
| --- | --- | --- |
| 现实早期聚落（本项目当前） | 日（取水、做饭、谈话） | 一切活动都是「占用一段可数时间」 |
| 现代人生（`modern-world`） | 日（上班、约会）与年（入学、退休） | 同上，只是每小时所含活动不同 |
| 魔法学院测试世界（`magic-test-world`） | 日（上课、施法练习） | 同上，冥想同样是占用时间单位 |
| 修仙/机器人（压力测试包） | 可自定义（打坐多年 vs 机器 tick） | 该世界自带 `unit` 定义与聚合比 |

Core 因此**只**需要 `Clock`（单调 tick）与 `ClockScale`（tick 到生活单位的换算声明）；
具体单位（天/月/年/呼吸）由 World Pack 声明（§25、§80 第 4 条：不携带具体世界观假设）。

---

## 3. Alternative — 能否用 Module 或扩展点实现？

### 3.1 被否决的方案 A：直接改大常量

```ts
export const TICKS_PER_YEAR = 365;
```

否决理由：`historical-era`、`world-weather`、`historical-memory`、
`practice-runtime` 的阶段时长、`early-civilization` 的年度事件、`family` 的生育冷却
全部以 12 为隐含月份。一次改动会让既有存档、既有测试与既有历史锚点全部错位，
违反 §11「M1 的 Core 变更不属于默认白名单」与 SAVE-001「不得悄悄丢掉已有资产」。

### 3.2 被否决的方案 B：Module 自建第二套时钟

否决理由：直接违反 §INV-007「Module 不允许自己维护另一套世界真相」与
§INV-004「相同输入必须可复现」。两套时钟必然产生两套随机调用顺序。

### 3.3 被否决的方案 C：把「日」硬编码进 Kernel

否决理由：违反 §3.1「Core 不定义具体世界观」与 §80 Core 升格规则。
Kernel 的 `ClockState { tick, advances }` 保持不动。

### 3.4 采纳的方案 D：ClockProfile 扩展点 + 模块级细时间

Kernel 仍然只认识单调 tick。新增的是一层**可注册的换算声明**（`clock.profile.register`）
与一个**只读的时间投影**。真正的行为变化发生在模块层：

```text
Kernel.tick  ──(World Pack 声明 ClockProfile)──►  day tick
                                                └─(每 N 天)─► 月聚合 tick（旧语义不变）
```

旧模块继续读 `TICKS_PER_YEAR = 12` 的月聚合语义；新模块读日语义。
两者由同一个 `Kernel.tick` 派生，因此只有一套真相、一个 RNG 序列。

---

## 4. Compatibility — 影响哪些旧模块？

| 对象 | 影响 | 处理 |
| --- | --- | --- |
| `packages/contracts::ClockState` | 不变 | 只新增 `ClockProfile`/`ClockScale` 类型与扩展点常量 |
| `packages/kernel` | 不修改 | `advanceTo/advanceBy` 语义不变（仍是整数 tick 单调推进） |
| `life-contracts::TICKS_PER_YEAR` | 保留，语义改为「月聚合刻度」 | 仍返回 12；新增 `DAY_TICKS_PER_YEAR` 等日语义常量 |
| `settlement-life` 的 `cost` | 由月改为日 | 同一次行动在旧存档上的 `busyUntil`/`lastChildAt` 由迁移函数换算 |
| `early-civilization` / `family` / `craft-pottery` | 不修改源码 | 其年度/月度行为随月聚合 tick 发生 |
| `world-time` | 不修改 | `WorldTimeCadence.ticks` 显式声明为「月聚合 tick」 |
| `apps/web` | 需要改 | 时间条、行动耗时文案、`advanceBy` 单位 |
| 既有测试 286 项 | 期望值需按新单位重算 | 修改点集中在 `tests/unit/settlement-life.test.ts` 与 `tests/integration/web-playable.test.ts` |

---

## 5. Save — 会不会破坏存档？

会破坏**语义**而不会破坏**结构**。旧存档写入的是「tick = 月」，新世界写入的是「tick = 日」。

处理：

1. `world-clock` 提供 `WorldClockMigration`：
   `day-per-month` 世界在加载时把全部持久时间戳乘以 30（新世界 → 旧单位方向为反乘）。
   具体做法是**给旧世界补一个日尺度时钟**，把历史 tick 解释为月并放大到日尺度。
2. 迁移以模块 migration 形式声明（§61「每个 Module 自己负责自己的版本迁移」），Core 不检查数据。
3. 迁移前 `Simulation.save()` 生成可恢复副本（SAVE-001「迁移前生成可恢复副本」）。
4. 未迁移的旧档必须**能加载但不推进**：加载时弹出明确说明，而不是静默改变年龄。

本 RFC 落地的迁移方向：`world-clock 0.1.0`（无缩放）→ `0.2.0`（`daysPerMonth = 30` 缩放）。
`world-clock` 在旧存档中不存在，因此 `ModuleRuntime.migrateFrom` 不会触发；
补偿做法是在 `world-clock` 的 `activate()` 中检测「世界已有 tick 但没有时钟组件」并**显式**补齐，
不做静默换算（见 §7 定案）。

**定案：不静默换算旧存档。** 旧存档保持月语义，直到玩家显式选择「进入自由生活时间」；
`apps/web` 在该路径上给出明确提示。这满足 TIME-001「存档迁移前后年龄与待办日期保持同一意义」。

---

## 6. Determinism — 是否影响确定性？

不影响，只要满足：

1. 所有时间戳仍来自 `Kernel.tick`，模块不得读系统时间（§INV-004）。
2. 日级调度使用 `Scheduler`，`dueAt` 是整数日 tick，顺序由 `Scheduler` 的
   `(dueAt, seq)` 全序保证（§17、§88）；不得用 `Math.random` 决定「今天发生什么」。
3. 「每 30 天聚合一次」使用取模判定 `tick % 30 === 0`，纯函数，无隐藏状态。
4. 随机数仍走 `c.rng.fork(label)`，label 含 tick，因此同一 seed + 同一命令序列可复现。

---

## 7. Networking — 是否影响世界服？

不影响。World Clock 与 Life Clock 的分离正是 §INV-008 的要求：

- `World Clock`：由世界服推进，玩家离线时也在走。
- `Life Clock`：玩家本地的模拟游标，只在自己的时间线上前进。

日尺度让「个人快进」更容易被压缩：玩家可以让 30 天过去而世界服只前进 1 个世界月，
两者不再需要共享一个刻度。本 RFC 不实现世界服，只保证两者可以各自独立推进。

---

## 8. Reason — 为什么必须进入 Core？

进入 Core 的只有**两件事**，且都通过 Extension Point 而非 Kernel 修改：

1. `ExtensionPoints.ClockProfileRegister = "clock.profile.register"` —— 一个纯声明式扩展点，
   满足 §80 第 1 条（三种世界观都需要）、第 2 条（现有 `component.register` 无法表达
   「时间单位换算」这一非实体概念）、第 4 条（不携带世界观假设）。
2. `packages/contracts::time.ts` 中的 `ClockProfile` / `ClockScale` **类型**（无实现）。

Kernel 代码零修改。`apps/debug-console`、`packages/simulation`、`packages/save-system` 零修改。

---

## 9. 实施结果（本 RFC 对应代码）

| 交付 | 位置 |
| --- | --- |
| `ClockProfile` / `ClockScale` 契约 | `packages/contracts/src/time.ts` |
| `clock.profile.register` 扩展点 | `packages/contracts/src/module.ts` |
| 日/月/年换算常量 | `packages/life-contracts/src/calendar.ts` |
| 时钟模块与迁移 | `modules/world-clock/src/module.ts` |
| 时间投影 | `world-clock.calendar`、`world-clock.pending` |

换算关系：

```text
DAYS_PER_MONTH = 30
MONTHS_PER_YEAR = 12
DAY_TICKS_PER_MONTH = 30
DAY_TICKS_PER_YEAR  = 360
TICKS_PER_YEAR (旧月聚合) = 12
1 月聚合 tick = 30 day tick
```

---

## 10. 验收对照（TIME-001 完成标准）

| 完成标准 | 本 RFC 的做法 | 证据 |
| --- | --- | --- |
| 十次短对话不会使角色老十个月 | 谈话 = 1 日；10 日 < 1 月聚合 tick | `tests/unit/world-clock.test.ts` |
| 等待收成仍能发生家庭和季节事件 | 月聚合 tick 仍驱动 `modern.annual_tick` 与季节相位 | `tests/unit/world-clock.test.ts` 年度推进用例 |
| 存档迁移前后年龄与待办日期保持同一意义 | 不静默换算；旧档显式进入 | `tests/unit/world-clock.test.ts` 迁移用例 |
| 在需要玩家选择的节点停止 | `advanceTo` 在下一个待决 `Practice` checkpoint 处停下 | `tests/unit/world-space.test.ts` 与浏览器流程 |

---

## 11. M1.2-B：时间语义统一（2026-10-08）

### 11.1 为什么需要这一节

M1 交付时测试全绿（326/326），但 M1.1 架构收口审查发现：**同一个 tick 被两套刻度同时读取**，且玩家可见。

```text
world-clock      按日刻度读：360 tick = 1 年   → 正确
life-contracts   按月刻度读： 12 tick = 1 年   → 差 30 倍
apps/web         按月刻度读：tick % 12 + 1 当月 → 同一年龄/时代被算错
```

实测后果：

| 实际经过 | 时代显示多走 | 角色年龄 |
| --- | --- | --- |
| 1 年 | 29 年 | 30 岁 |
| 5 年 | 145 年 | — |
| 360 天 | — | 报为 30 岁 |

根因不是 M1 的 bug，而是 M1 之前「12 tick = 1 年」的约定在日刻度下不再成立，而 M1 只改了玩家可见那一层。

### 11.2 定案的修法（与用户裁决一致）

不改 Kernel，不把世界退回月刻度。核心是**让世界声明自己的刻度，其他模块读它而不是自己算**：

| 原则 | 实现 |
| --- | --- |
| Kernel 的 tick 是中性推进单位 | `packages/kernel` 未改语义；仅修一处 `rescheduleAt` 被 `command` 短路的问题 |
| `ClockProfile` 决定 tick 的含义 | `WorldClockProfile`：`day`(1) / `month`(30) / `year`(360) |
| 当前生活场景按日推进 | `LIFE_TIME_SCALE = "day"`；`world-clock` 存在即声明日刻度 |
| 年龄/季节/年度事件统一从世界时钟取得 | 新增 `reading()`、`monthsOfTick()`、`eraYearAt()`、`ageAt()`、`declaredScale()`、`readingAtTick()`；`life-contracts` 新增 `TimeScale`、`TICKS_PER_UNIT`、`unitsElapsed`、`ageInYearsAt`、`yearsToTicksAt` |
| 旧存档保留原时间语义，不静默转换 | 无 `world-clock.clock` 组件的世界即 `legacyScale`，继续按 12 tick/年读取；加载旧档不注入时钟 |

### 11.3 关键发现：年度任务不能信任初始化时的间隔

`modern.initialize_world` 的 resolve 在 `world-clock` 创建组件**之前**运行，因此它拿不到世界刻度，只能读到旧值 12。若把 `everyTicks` 在此冻结，日刻度世界会每年跑 30 次老化。

修法：初始只定**第一次**到期时间；`modern.annual_tick` 的 handler 每次从**实时世界**重新计算并自行 `rescheduleAt`。这要求 Kernel 支持「既派发命令又改期」——原先 `command` 分支直接 `return`，会吞掉改期，已一并修复。

### 11.4 单位失配的全量清单与处理

| 位置 | 原因 | 处理 |
| --- | --- | --- |
| `apps/web/server.ts` `year`/`month`/`era` | 自行 `tick % 12` | 改为读 `clockReading()` / `readingAtTick()` |
| `apps/web/server.ts` 年龄、autosim 年份步长 | `TICKS_PER_YEAR` | 新增 `ticksPerWorldYear()` / `ageInWorldYears()`，全部改走世界刻度 |
| `modules/modern-world` 年度调度、老化 | `TICKS_PER_YEAR` 作间隔；`ageInYears` 算年龄 | 间隔改为自重新排期；年龄改为每次年度事件 +1 |
| `modules/settlement-life` `YEAR = 12` | 自有常量，关系门禁与 NPC 出生年份 | 新增 `yearTicks(world)` 读世界刻度 |
| `tests/helpers/modern.ts`、`tests/unit/economy.test.ts` | 测试自带月刻度假设 | 显式声明 `ONE_YEAR`；economy 用例装 `world-clock` |
| `modules/world-time` 季节相位 `% 12` | 月刻度 | 该模块不在日刻度世界加载；保留月语义 |

### 11.5 验收证据（跨模块一致性优先）

按用户要求，验收以**跨模块一致性**为主，不统计单元测试个数：

`tests/unit/time-consistency.test.ts`（12 项）：

```text
✔ 360 day ticks is exactly one year to the clock, the calendar and ageing alike
✔ the era advances exactly one year per world year, with no drift
✔ a month is thirty days and twelve months is a year, on the same tick
✔ annual ageing fires exactly once per world year, never thirty times
✔ a module that reacts to the yearly event also fires once per year
✔ advancing one tick at a time produces the same calendar as one jump
✔ a world without a clock keeps the legacy reading and is never rescaled
✔ adding the clock to an existing world does not rewrite its history
✔ a world that explicitly adopts the day scale starts timing from then on
✔ the same seed and the same days produce an identical world
✔ a day-scale save round trips with its clock intact
✔ the world publishes its scale so modules need not hard-code one
```

三条 M1.1 的 ISSUE 已转为 FIXED 断言（`tests/unit/m1-closeout-audit.test.ts`）：`FIXED: era, age and season are read at the world's declared scale`、`FIXED: a day-scale world's era advances exactly one year per year`、`FIXED: the server and the clock now report the same year`。

实测（浏览器端点，日刻度世界）：

```text
tick=5760  era=公元前 2054 年  monthsElapsed=192  yearsElapsed=16  age=16
advance-year ×4: 每 +360 tick → 月份 +12、时代 +1、年龄 +1，drift = 0
```

**drift 由 29 年/年 降为 0。**
