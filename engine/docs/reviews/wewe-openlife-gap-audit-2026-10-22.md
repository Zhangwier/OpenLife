# WEWE → OpenLife 差异审计（A0）

- 审计日期：2026-10-22
- 审计对象：`Zhangwier/WEWE`（私有仓库，最后一次推送 2023-06-12）与当前 OpenLife `main@315013a`
- 依据文档：`docs/plans/wewe-openlife-design-reuse-2026-10-22.md`（以下简称「提案」）、`docs/plans/long-term-game-design-2026-10-22.md`、`需求书.txt`、`docs/POSITIONING.md`、`docs/AI_COLLABORATION.md`、`AGENTS.md`
- 审计边界：**只读**。本文件是本轮唯一产出，未改动任何生产代码、未搬运任何素材、未实现 R-01～R-05。
- 当天基线：`npm test` → 978 tests / 978 pass / 0 fail（`duration_ms` 255185）。`typecheck` 0 errors、`design:check` 通过、`catalog:check` up to date。

## 0. 结论摘要

1. WEWE 不是一个可以「移植」的系统：`module/Chat.py` 342 行里 **15 个 `pass`**、9 个只有注释的空函数，能跑通的只有「说话把请求塞进对方池子」和「按记忆度删记忆」两件。它的价值在**注释里写下的设计意图**，不在代码。
2. 提案 §2 列的五条线索，OpenLife **已有三条落在生产代码里且有测试**（请求—回话闭环、亲见/听说的社会记忆、性格与属性驱动的自主决策）。真正缺的是**两处半**：
   - **缺**：关系后果（怨气、欠人情）不进 NPC 的决策输入，也不随时间变化；
   - **缺**：NPC 之间互相许诺/答应的事没有「兑现 / 违背」的出口（玩家侧有，NPC 侧没有）；
   - **半**：重要经历（`deeds`、`quest-failed`、`passed_away`）有存有读，但**没有跨季度的「仍然记得并因此改变行为」的通道**。
3. 三问的答案见 §6。一句话：**(c) 如果只做一个改进，就做「关系有记忆、记忆有后果」——把 `grudge`／`owesMe`／失约历史接进 `autonomy/brain.ts` 的候选排序，并给 `grudge` 一条极慢的衰减。** 这是 R-01 与 R-02 的公共前提，成本最小、可测性最好，且不需要新模块。
4. 明确建议不做：R-05（2D 视觉资源，提案已定暂缓）、WEWE 的 `GameBuild.py`（Pygame 渲染，与手机优先完全冲突）、`GetHumanData.py` 的姓名/年龄随机生成（与确定性内核冲突）、`osmTOjson.py`（一次性数据脚本，且用了 Python 3.11 已删除的 `'rU'`）、WEWE 的 `talent` 四维（从无任何读取点）。

---

## 1. WEWE 三份源码的实测结论

### 1.1 `module/Chat.py` — 342 行，15 个 `pass`

| 类 | 有实现 | 只有注释 / `pass` |
| --- | --- | --- |
| `world` | `add_area()`（`np.zeros` 建 400×400 格）、`add_entity`、`update()` | 第 64–79 行两段「更新顺序」的思路注释 |
| `sects` | 无 | `def __init__():`（**缺 self，本身就是语法错误**），第 83 行 |
| `area` / `shop` | `buy_list`、`sell_list`、`shelf_d`（`n` 参数没用，永远减 1）、`find_storehouse` | `sheld_ad`（减到 0 就 return，正事没写）、`buy`（第 153 行 `pass`） |
| `creature` / `man` | `talk → request_g`（真把请求塞进对方池）、`cl_memort`（按记忆度删）、`request_re` 的 `talk` 分支骨架、`attack` 分支扣心情 | `add_memort`（189）、`give`（202）、`talk_re`（210）、`request_re` 三个分支（222/224/226）、`intention_re`（247）、`intention_do`（250） |
| `protagonist` | 无 | `show_data`、`show_request`、`requt`（271/274/304） |
| `item` / `gold` / `boat` | 构造函数 | `destruction`、`eat`；`gold.value` 是字符串 `'100'`；`boat.contr()` 只有一句 `self.xy` |

**真正有设计价值、且注释写得比代码远的四件事**：

1. **`man.update()` 的调用顺序**：`request_re() → intention_re() → intention_do() → 更新自身属性 → cl_memort()`。也就是「先把收到的请求处理成意图，再挑一个意图去做，最后才更新属性、才遗忘」。OpenLife 的 `runBrainDay` 是「一次一步」，顺序是「看 → 选 → 做」，遗忘则在读的时候按 `memoryDays` 过滤——语义等价但 OpenLife 更严格（内存里不留过期数据）。
2. **`request_re` 的 `get` 分支注释**：把「接受/拒绝」该看哪些因素写全了——**熟悉、价值、好感、性格、心情**；「索取/攻击」——熟悉、心情、正义、攻击性、钱财；「逃跑」——熟悉、财产、正义、对财产的兴趣、善良。**这是 WEWE 全文最具体的设计资产**，见 §4 的 R-02 对照。
3. **`man.character` 五维（正义度/善良度/宽容度/探索度/友善度）与 `attribute` 七维（移动/操作/感知/反应/耐心/情商/心情）**，以及**记忆三元 `[记忆度, 好感/兴趣, 重要度, 事件]`**。
4. **语言格式 `[] 主体，动作，对象，备注1，备注2`** —— 请求、意图、语言用同一个元组骨架。

**必须指出的缺陷**：`cl_memort` 在遍历 `self.memory` 的同时 `pop`，会抛 `RuntimeError: dictionary changed size during iteration`；而且全仓**没有任何地方让「记忆度」变小**，这条遗忘机制实际上永远不会触发。

### 1.2 `module/GetHumanData.py` — 219 行

docstring 是唯一的角色数据清单：`name / sex / age / character / education / relative / friends / memory`。

- 姓名：`NameDat` 硬编码 18 个中文姓、10 个中文名、7 个英文名；`RandomAge() = random.randint(1, 120)`（注释里留着没用上的 `numpy.random.normal`）。
- `people.DataLoad(**data)` 用 `exec(f'self.{i} = data[i]')` 动态赋值——任意键都能写进对象，不可校验。
- `people2` 有运动学（`PositionChange/SpeedChange/AcrChange`，公式也用 `exec` 迭代）、`SimpleAi1`（随机反向）、`SimpleAi10`、`SimpleAi2`（`pass`）。
- `peopel3.Think/Speak/Action` 全 `pass`；`people800.NervousCell/NervousSystem` 全 `pass`（注释「全模拟」）。

结论：这份文件的价值是**字段清单**，而 OpenLife 的 `PersonSpec`（`modules/settlement-locations/src/content.ts`）与 `Mind`（`modules/settlement-locations/src/autonomy/mind.ts`）已经覆盖了其中「性格 / 属性 / 关系 / 记忆」四项，粒度不同但都在决策里被真正读取。

### 1.3 `module/GameBuild.py` — 383 行（技术参考，明确不移植）

`MySprite.load/update/action/update_way` 是精灵表帧动画 + 矩形碰撞；`World.process` 是「blit 背景 → `group.update` → `group.draw`」；`action()` 用 `random.sample([0,-offset,offset],1)` 做随机游走。

两处与 OpenLife 根本冲突：

- **随机游走**：`rate = random.randint(150,400)`、`moverate = random.randint(0,50)`，不吃种子、不可重放。OpenLife 的确定性内核要求「同种子 + 同指令 ⇒ 同一指纹」（`packages/kernel`）。
- **硬编码 Windows 路径**：`rescouse\cell\sheet1.png` 之类的反斜杠字面量，Linux CI 直接失败。

唯一值得记下的工程细节是 `load(filename,width,height,columns,row)` 的「按宽高列数切精灵表、`last_frame = (w//width)*(h//height)-1`」这一行——它说明 WEWE 的 2D 资源是**整张精灵表 + 帧索引**，不是逐帧 PNG。这与提案 §R-05「暂缓」的判断一致，不需要现在决定。

### 1.4 其余模块（不进入结论）

| 文件 | 大小 | 结论 |
| --- | --- | --- |
| `module/osmTOjson.py` | 2026B | `lxml.etree.iterparse` + `xmltodict` 流式把 OSM 转 JSONL，还带「读完即 `clear()` 并删兄弟节点」的内存技巧。**一次性数据脚本**，且 `open(f,'rU')` 在 Python 3.11 已删除、`os.chdir('rescouse')` 硬编码。不搬。 |
| `module/Timesum.py` | 920B | `timer` / `omit_exception` 装饰器（吞异常返回默认值）。OpenLife 用显式 `Result`，不搬。 |
| `module/Pip.py` | 323B | `os.chdir` 到硬编码本机路径再 `os.system('pip install '+Name)`——**命令注入面**。不搬。 |
| `module/MathTool.py` | 134B | 无可搬内容。 |
| `module/3D.py` | 45B | 只剩 `Spead = 10` 与一句坏掉的 `exec(f'+\ for ')`。 |
| `module/CarSimulation.py` | 0B | 空文件。 |

---

## 2. OpenLife 侧：本次实际核对到的位置

以下每一项都**打开过源码确认**，不是看文件名推断的。

| 能力 | 文件 | 关键符号 |
| --- | --- | --- |
| 性格与属性 | `modules/settlement-locations/src/autonomy/mind.ts` | `Mind { personality, attributes }`、`mindOf(spec)`（数据包优先，缺失时按 `hash(spec.key + ":" + salt)` **稳定派生**，并按年龄修正体力）、`temperamentWords(mind)` |
| 自主决策 | `modules/settlement-locations/src/autonomy/brain.ts`（857 行） | `Situation`、`look()`、`desireFor()`、`obtain()`、`askPlan()`、`options()`（每个候选带 `motive` 字符串）、`runBrainDay` |
| 社会记忆 | `modules/settlement-locations/src/social.ts`（147 行） | `Sighting`、`Bond { familiarity, trust, grudge, lastAt }`、`SocialMemory { seen, bonds, asked, news }`、`whoHas()`、`mergeHeard()`、`askEase()`、`memoryDays()` |
| 观察 | `modules/settlement-locations/src/module.ts:3413` | `registerSocial` / `npcNotice`（只收 `source === "ai"` 的居民，重记在场者 `goods`，同处一天 `familiarity += 0.25`） |
| 请求—回话 | `modules/settlement-locations/src/module.ts:3497` | `npcRequest` / `requestAnswer`（当面、真物品、`handover` 结算人情、拒绝分 `collect` 与其它两套台词） |
| 请求过期 | `modules/settlement-locations/src/module.ts:3459` | `REQUEST_DAYS = 3` 后 `trust -1 / grudge +0.5`、`status: "lapsed"` |
| 目标受挫 | `modules/settlement-locations/src/module.ts:866` | `nextFrustration()`（同目标连败计数，5 天淡出） |
| 日程可读 | `modules/settlement-locations/src/module.ts:915`、`village-reads.ts:134`、`module.ts:1369` | `lastRoutineActions` / `standingRoutine` / `dailyNote`（当天可见「为什么」） |
| 秘密与知情 | `modules/village-secrets/src/module.ts` | 三档 `heard/known`、四条用法 `keep/advise/expose/extort`、`carryGrievance` |
| 信念层 | `modules/epistemic-state/src/module.ts`（347 行） | `awareness: heard\|examined`、`stance: undecided\|accepts\|rejects`、`acquire/revise` |
| 公共记忆 | `modules/historical-memory/src/module.ts`（1292 行） | `work/artifact/claim` + `create_work/copy_artifact/form_claim/lose_artifact/damage_artifact/rediscover_artifact/weather_artifact` |
| 怨气 | `modules/social-conflict/src/module.ts`（234 行） | `Grievance { intensity, stage: quarrel\|feud\|vendetta, causes }`、`record_grievance/make_amends/inherit_grievances`、`feudAt 0.35 / vendettaAt 0.7`、vendetta 只能靠调解 |
| 一生标记 | `modules/life-stages/src/module.ts:162`、`:218` | `deeds(world,id)`、`record()`（`.slice(-40)` + `life-stages.<deed>` 事件） |
| 失约后果 | `modules/village-stories/src/journal.ts:370` | `expireQuests()` → `status: "failed"` + `reward(q.failReward)` + `quest-failed` |
| 愿望与恐惧 | `modules/village-wants/src/module.ts` | `fear.*` 反应 → `mood` 下降；`draw.timid`、`tend.refused` 两条约束规则 |

---

## 3. R-01～R-05 逐项表态

### R-01 重要经历跨时间记忆 —— **建议做，但要重定义范围**

- **WEWE 原始设想**：记忆三元 `[记忆度, 好感, 重要度, 事件]`，`add_memort` 写入、`fand_memort` 模糊识人、`cl_memort` 按记忆度删除（三者中两个 `pass`、一个会 `RuntimeError`）。
- **OpenLife 已有**：`SocialMemory.news`（6 天 / 最多 8 件，`trimNews`）、`Bond` 四项（`familiarity/trust/grudge/lastAt`，clamp 0..10）、`life-stages.deeds`（40 条）、`village-stories.journal.incidents`（`tick → "<incidentId>:<choiceId>"`）、`village-secrets.ledger`（每件事的 `kept/advised/exposed/extorted` 计数与时间）、`historical-memory` 的 `claim/artifact`。测试证据：`tests/unit/npc-social.test.ts`（7 个）、`tests/unit/emergent-npc.test.ts`（3 个）、`tests/unit/npc-brain.test.ts`（3 个）、`tests/unit/historical-memory.test.ts`（495 行）。
- **确切缺口**（这是本节唯一建议动手的地方）：**「关系」不随时间变化，也不进决策输入。**
  - `modules/settlement-locations/src/social.ts` 里 `grudge` 与 `familiarity` **只有 `withBond` 的 clamp，没有任何衰减**（全仓 grep 无衰减规则）。
  - `modules/settlement-locations/src/autonomy/brain.ts` 对 `grudge` **零引用**。怨气只经 `askEase()` 内部的 `- bond.grudge * 5` 间接生效，也就是说「怨气」只影响「要不要开口求人」，不影响「愿不愿意帮忙 / 要不要躲着走 / 说话用什么语气」。
  - 后果：`settlement-locations.request_answer` 的拒绝（`trust -0.5 / grudge +1~2`）、请求过期（`trust -1 / grudge +0.5`）、`village-secrets` 揭发（`carryGrievance` → `social-conflict` 的 `record_grievance`）**都写进去了，但写得再重也不会改变此人的下一步计划**。
- **用户体验收益**：玩家能感觉到「这个人记得上次的事」——这是提案 §1「把一个季节做得值得牵挂」的最小可见形态，也是「人物差异可被感知」（R-03）的前提。
- **最小改动建议**：不动 schema（`Bond` 已经有 `grudge`）：
  1. 在 `brain.ts` 的 `look()` 里把 `bondOf(s.social, id).grudge` 与 `s.owesMe/iOwe` 一起放进 `Situation`（现在已经算了 `owesMe`/`iOwe`，只差一个字段）；
  2. 在 `options()` 里给三类候选加显式惩罚/加成：`help`（有人来求）按 `grudge` 递减、`visit` 按 `grudge` 递减、`ask` 按 `grudge` 递减（后者已由 `askEase` 覆盖，要避免双减）；
  3. 给 `grudge` 一条极慢衰减（例如每 30 天 -0.5，取整保持确定性），并且**只在「同处一地且没再出事」时才衰减**——否则「记仇」变成了计时器。
- **冲突与风险**：`askEase` 已经吃 `grudge`，两处叠加会让「被拒绝过一次」的惩罚变成平方级；必须在一处收口。另外 `grudge` 参与 `people.ts:15` 的心数、`marriage.ts:90` 的说亲门槛、`storyteller.ts:104` 的年景筛选——加衰减会改变既有测试的期望值，需要先跑基线。
- **优先级**：高（P1，首个季节就见效）。
- **是否建议不做**：**做**，但只做上面三步，不引入「记忆度」这种新量纲。

### R-02 请求—目标—决策闭环 —— **大部分已有，缺「NPC 之间的许诺」**

- **WEWE 原始设想**：`request_re` 处理 `talk/get/attack`，`get` 分支按「熟悉、价值、好感、性格、心情」决定接受或拒绝；`intention_re` 按优先度排队；`intention_do` 执行。**三者中两个 `pass`、一个只实现了扣心情。**
- **OpenLife 已有**：`modules/settlement-locations/src/module.ts:3497` 起的 `npcRequest` / `requestAnswer` 是完整闭环——只允许本人当面回话、必须手上真有那个东西、必须对方拿得下，成功后走真实 `handover` 并按 `worth()` 结算人情，拒绝时 `trust -0.5 / grudge +1~2` 且台词分 `collect`（欠债）与其它两套。`brain.ts:753` 的 `ask()` 对玩家发 `npcRequest`、对村民直接 `exchange(credit: true)`；被拒后当天 `blocked.add("ask:<id>")`，**可以换人再问**。过期有后果（`trust -1 / grudge +0.5`）。测试证据：`tests/unit/npc-social.test.ts:131`「helping builds trust and a favour she later repays; refusing leaves a grudge」、`tests/unit/emergent-npc.test.ts:97`「NPC help rejects impersonation, remote agreement and fabricated item transfer」。
- **确切缺口**：
  1. **NPC 许诺没有兑现/违背的出口**：`modules/office/src/module.ts:59` 已经声明 `status: "open" | "kept" | "broken"`，但全仓唯一写入点是 `:317` 的 `status: "open" as const`；`:610` 的 `const openPledges = state.pledges.filter((p) => p.status === "open")` 也只是过滤。`modules/office/src/lines.ts:34` 定义了 `consequence: { "pledge-kept": string[]; "pledge-broken": string[]; neglected; unrest; recalled; ousted }`，`:189` 与 `:193` 各写了两句台词，**但全仓 grep `consequence.` 只命中 `modules/settlement-locations/src/content.ts:200` 的一行注释，没有任何代码取用这套台词**。也就是说「答应过的事」会被记录、会被面板显示（`apps/web/public/office-panel.js:115`），**但永远不会被兑现、被算账、被说出口**。这直接违背提案 R-02 验收里的「帮忙未果」。
  2. **没有「改约」这个动作**：村民被拒后能换人，但玩家与 NPC 之间没有「今天不行，明天行不行」的显式表达；`brain.ts:720` 只做 `blocked`，`module.ts:3459` 只做过期惩罚。
  3. **第三方介入**：`social-conflict` 有 `make_amends(mediation)` 与 `inherit_grievances`，但**没有任何自主逻辑会让 NPC 去调解**——它只等玩家或别的模块调命令。
- **用户体验收益**：承诺要不要算数，是这个游戏「有人与自己共同生活」的核心。现在的状态是「记得但不生效」，玩家学不到「许诺是要还的」。
- **最小改动建议**：只做第 1 条——给 `office` 加一条反应规则，在「投票结果 / 任期结束 / 相关议题被解决」时把 `status: "open"` 结算成 `"kept"` 或 `"broken"`，并把 `lines.ts` 里现成的两句台词接上；同时把结果写进 `SocialMemory`（`trust ±` 与一条 news）。第 2、3 条留到 P2。
- **冲突与风险**：`office` 的 `pledges` 是 `.slice(-20)` 的数组，结算时要小心改的是「同一个对象」还是「新数组」；写入必须走 `office` 自己的组件（INV-007）。
- **优先级**：中（P2，可与 R-01 并行但不要同批）。
- **是否建议不做**：做第 1 条；第 2、3 条**建议本轮不做**（改约需要新的 UI 语义，第三方介入需要 NPC 有「主动发起」的意图类型，都不小）。

### R-03 人物差异可被感知 —— **已有，缺「同一困境下的不同决定」的对照测试**

- **WEWE 原始设想**：`character[5]` + `attribute[7]` + `talent[4]` 决定行为。**`talent` 全仓无读取点。**
- **OpenLife 已有**：`mind.ts` 的五维性格 + 三维属性，**每一项都在 `brain.ts` 里被真正读取**（`desireFor` 的系数、`obtain` 的 `depth` 由 `wits` 决定、`askEase` 的性格项、`options()` 里 `patience`/`dexterity` 的系数、`leaveShare = 0.2 + generosity/500`）。`temperamentWords()` 给玩家三个词。当天日程摘要带 `motive`（`tellGroup`），所以「为什么」是可见的。测试证据：`tests/unit/village-people.test.ts`（287 行）、`tests/unit/people.test.ts`（118 行）、`tests/unit/npc-social.test.ts:122`「temperament decides who comes: a reserved, careful neighbour would rather go without」。
- **确切缺口**（**初稿判断有误，此处为更正**）：我最初写「没有一条测试是同一处境下两人给出不同决定」——**这是错的**。`tests/unit/npc-social.test.ts:122`「temperament decides who comes: a reserved, careful neighbour would rather go without」已经是成对对照：同一个种子（11）、同一场饥荒，`lan-mother`（谨慎、矜持）不开口，`water-carrier` 开口。所以「同一困境两人不同决定」的证据**存在**。
  真正缺的是**更窄的两件事**：
  1. 这条对照只覆盖「要不要开口求人」**一个决策点**，没有覆盖「同一个东西，给还是不给」（R-03 提案原文是「同样的可见困境下的不同决定」，给不给比开不开口更接近玩家真正的体验）；
  2. **没有断言两人的「理由」不同**——`motive` 已经进了 `dailyNote`（`brain.ts` 的 `tellGroup`），但没有任何测试读它，所以「呈现原因」这一半是无保障的。
- **用户体验收益**：这是「有自己的活法」的地基。缺的不是能力，是证据——没有这条测试，任何后续改动都可能悄悄把两个人调成一样而没人发现。
- **最小改动建议**：加一条纯测试（不需要改生产代码）：固定种子、同一困境（例如秋天缺柴），断言阿灶（`cook`，generosity 85 / caution 55）与阿苇（`reed-worker`，generosity 40 / caution 75）在「是否给出自己储备的最后两捆」上给出**相反**决定，并断言两人当日 `dailyNote` 里的理由文案不同。这条是 `npc-social.test.ts:122` 的姊妹测试——那条对照「开不开口」，这条对照「给不给」。
- **优先级**：高（P1，成本最低、防回归价值最高）。
- **是否建议不做**：**做**（只是测试）。

### R-04 记忆容量 / 遗忘 / 可重放 —— **数据已对，缺预算与不变量测试**

- **WEWE 原始设想**：`cl_memort` 按记忆度删（有 bug，永不触发）。
- **OpenLife 已有**：`social.ts` 的 `NEWS_DAYS = 6` / `NEWS_KEEP = 8`（`trimNews` 按 `at` 降序截 8）、`memoryDays(wits) = 3 + Math.round(wits/2)`（`whoHas` 读取时过滤）、`ASK_COOLDOWN = 3`、`REQUEST_DAYS = 3`；`life-stages.deeds` `.slice(-40)`；`office.pledges` `.slice(-20)`；`journal.counters` 是计数器不是列表。可重放性有更强保证：确定性内核 + `tests/unit/npc-social.test.ts:199`「social life stays deterministic across save and load」、`tests/unit/npc-brain.test.ts:85`「same seed, same village life (deterministic, save/load safe)」、`apps/web/src/replay.ts` 的输入记录与 `tests/unit/replay.test.ts`（9 个）。
- **确切缺口**：
  1. `seen` **没有写入上限、也没有过期删除**（唯一写入点是 `modules/settlement-locations/src/module.ts:3438` 与 `social.ts:124`，两处都只加不减），只在读取时按 `memoryDays` 过滤——一个 40 人的村子跑 3 年，`seen` 会持续增长（每人 × 每人）。
  2. `asked` 无界（键是村民，有界但不会清）。
  3. **没有一条测试断言容量上限**（既没有「`news` 永远 ≤ 8」也没有「`seen` 的增长与天数无关」）。
  4. `需求书.txt` 的 MEM-002 记忆预算（`modules/*/src` 与 `packages/*/src` 全仓 grep `16384|budgetBytes|KiB|memoryBudget` 零命中）仍未做。
- **用户体验收益**：手机端长时间游玩不卡、存档不变大。这属于「可信的起点」，不解决会拖住 P1 之后的每一项。
- **最小改动建议**：给 `withNews`/`observe` 加一条容量裁剪（`seen` 超过 N 条时按 `at` 淘汰最旧且非亲见的），并加一条不变量测试「跑 3 年后 `JSON.stringify(social)` 长度不超过基线 ×1.2」。**先测再加**——提案要求在写预算之前先拿到真实数字。
- **冲突与风险**：任何裁剪都可能改变 `whoHas` 的结果，从而改变 NPC 行为与既有测试的期望；必须先跑基线、再改、再对比。
- **优先级**：中（P1 末尾 / P2 开头）。
- **是否建议不做**：做（裁剪 + 不变量测试），但**不在这一轮**做完整的 MEM-002 预算体系。

### R-05 2D 视觉资源 —— **建议不做（与提案一致）**

- WEWE 的资源是「整张精灵表 + 帧索引」（`MySprite.load` 的切帧逻辑），`rescouse/` 里 123 个 PNG 共 443KB、1 个 541KB 的 PSD。
- OpenLife 现在的画面是 CSS + `apps/web/public/art/portraits/` 的立绘，`design:check` 对字号与颜色有硬约束，`scripts/design-check.ts` 由 `tests/unit/design-tokens.test.ts` 守着。
- 引入精灵表与帧动画需要新的渲染层、新的资产管线、以及和现有 CSS 场景的共存方案——与「手机优先、一屏一个决定」冲突。
- **结论：不做。** 如果将来要 2D 角色行走，应作为独立阶段重新立项，不从 WEWE 搬素材。

---

## 4. A1 场景「秋雨时的借柴与失约」：真实对象与可复用命令

提案要求**不造假 ID**。下表全部来自 `modules/settlement-locations/data/river-terrace.json`（23 位居民）与 `modules/settlement-locations/src/vocabulary.ts`。

### 4.1 人物（真实存在，性格取自数据包）

| key | 名字 | 年龄 | 性格（diligence/sociability/generosity/caution/curiosity） | 属性（strength/dexterity/wits） | 住所 | 与场景的关系 |
| --- | --- | --- | --- | --- | --- | --- |
| `cook` | 阿灶 | 38 | 80 / 65 / 85 / 55 / 30 | 6 / 7 / 6 | `space:hearth-sleep` | 管公共灶火，`wishItem: resource:fuel`；**守约方** |
| `reed-worker` | 阿苇 | 27 | 70 / 40 / 40 / 75 / 30 | 7 / 5 / 7 | `space:reed-sleep` | 割芦苇，家里有柴草；**被求方**（提案的「拒借」路线） |
| `elder` | 陶叔 | 52 | 60 / 45 / 55 / 70 / 30 | 4 / 7 / 8 | `space:main-sleep` | 村里的长辈，可作第三方见证 |
| `lan` | 阿岚 | 21 | 55 / 85 / 50 / 25 / 90 | 6 / 6 / 7 | `space:lan-sleep` | 与阿灶走得近（sociability 最高），可作传话人；`wishItem: resource:bowl` |

> 上表数字全部来自 `river-terrace.json` 的 `personality` / `attributes` / `homeSpace` / `wishItem`，已用脚本抄录核对。

**这四个人正好构成 R-03 需要的对照**：阿灶 generosity 85 / caution 55（肯给、不太防），阿苇 generosity 40 / caution 75（不肯给、很防）；同样的「借两捆柴」在他们身上应当给出**相反**决定。阿岚 sociability 85 / curiosity 90，是天然的传话人与旁观者。陶叔 caution 70 / wits 8 最高，适合做「调解人」（`social-conflict` 的 `mediation` 需要第三方）。

### 4.2 物品与地点

- 物品：`resource:fuel`（柴草，芦苇滩产出）、`resource:reed`（芦苇）、`resource:grain`（粮）、`resource:clay`（黏土）。
- 地点（`place:`，共 16 个，以下四个是本场景用到的）：
  - `place:reedbed`（芦苇滩，柴草产出点，阿苇在此干活）
  - `place:hearth-yard`（公共灶，阿灶在此干活）
  - `place:yard`（院子，玩家初始落点）
  - `place:longhouse`（长屋，可作第三方见证的公开场合）
- **住处是 `space:` 不是 `place:`**：阿灶 `space:hearth-sleep`、阿苇 `space:reed-sleep`、陶叔 `space:main-sleep`、阿岚 `space:lan-sleep`。写场景时不要混用两种 id 空间。
- 天气：`modules/settlement-nature` 提供 `skyOn`/`isWet`；`village-stories` 的 `IncidentSpec.weather` 有 `"wet" | "dry"`，可以按秋季雨天触发。

### 4.3 可复用命令（全部已存在、有测试）

| 用途 | 命令 | 出处 |
| --- | --- | --- |
| 发起请求 | `settlement-locations.npc.request` | `module.ts:3497` |
| 回答请求 | `settlement-locations.request.answer`（`{ requesterId, accept }`） | 同上；UI 在 `apps/web/public/settlement.js:249` |
| 玩家给物 | `settlement-locations.exchange` | `vocabulary.ts:54` |
| 交谈 | `settlement-locations.talk` | `vocabulary.ts:30` |
| 留痕 | `settlement-locations.npc.daily`（`data.summary` 带 `motive`） | `module.ts:922` |
| 记怨气 | `social-conflict.record_grievance` | `social-conflict/src/module.ts` |
| 记秘密/揭发 | `village-secrets.{keep,advise,expose,extort}` | `village-secrets/src/module.ts` |
| 失约后果（现成） | `expireQuests()` → `quest_failed` + `failReward` | `journal.ts:370` |

### 4.4 三条路线的可测性判定

| 路线 | 现状 | 判定 |
| --- | --- | --- |
| **A：守约但拒借** | `npc.request`（阿灶→玩家或阿苇）+ `request.answer` 拒绝分支 + `trust -0.5 / grudge +1~2` + 拒绝台词（`collect` 与其它两套） | **现成可测** |
| **B：先借后解释 / 改约** | 借：`request.answer` accept + `handover`；解释：`talk`；**改约：没有这个动作** | **部分可测**（借与解释可测，改约需新规则） |
| **C：失约且不解释** | 请求过期（3 天）→ `trust -1 / grudge +0.5` + `status: "lapsed"` | **现成可测**（但「不解释」与「没看见」目前无法区分） |

---

## 5. 已核实 / 推测 / 未检查

### 已核实（打开源码确认，可直接引用）

- WEWE 的 15 个 `pass` 及其行号、`sects.__init__` 缺 `self`、`cl_memort` 迭代中 `pop`、`gold.value` 是字符串、`CarSimulation.py` 为空、`3D.py` 内容坏掉。
- `brain.ts` 对 `grudge` 零引用；`askEase()` 含 `- grudge * 5`。
- `grudge`/`familiarity` 无衰减；`seen` 无写入上限与过期删除。
- `office` 的 `Pledge.status` 只有 `"open"` 一处写入；`lines.ts` 的 `pledge-kept`/`pledge-broken` 从未被取用。
- `village-wants.thought_of_leaving` 只有 emit，无消费者。
- `settlement-locations.npc_daily` 事件无消费者，但同日摘要经 `standingRoutine`/`dailyNote` 到达 UI。
- 请求过期有 `trust -1 / grudge +0.5`。
- `expireQuests()` 会执行 `failReward`；数据里有 4 条带 `deadlineDays`（8/8/3/6 天）+ `failLine` + `failReward` 的任务。
- 23 位居民、四类地点、五条命令的真实 id。
- 978 tests / 978 pass / 0 fail。

### 推测（有依据但未逐条验证）

- 「`grudge` 不衰减会让长期存档里的关系整体偏冷」——机制上成立，但没有跑过长局对比，**不知道实际幅度**。
- 「`seen` 无界会在 3 年后明显影响存档体积」——没有实测数字，只有代码路径。
- 「`office` 的 pledge 结算能复用 `lines.ts` 现有台词」——台词存在，但两条台词的上下文插槽是否够用未验证。
- 「WEWE 的 `man.update()` 顺序与 OpenLife 的 `runBrainDay` 语义等价」——是比较阅读的结论，没有做过逐帧对照。

### 未检查（本轮明确没做）

- `modules/village-chronicle/src/run.ts` 的年度编排在**网页版**的运行表现（`history-bridge.ts` 的 season/year 钩子是否在长局里稳定）。
- `modules/world-geography` 与地图包在网页世界里的完整性能开销（只验证过 12 地点 / 15 条边的西来河泽）。
- `apps/debug-console`。
- WEWE 的 `rescouse/` 里 123 张 PNG 的具体内容（只统计了数量与体积）。
- 手机真机上的实际帧率与内存（无真机）。
- Linux CI 与手机浏览器之外的第二环境（本轮只在 Windows + LF 检出下验证）。

---

## 6. 三问的直接回答

### (a) WEWE 有哪些独有且真正值得带进 OpenLife 的设计？

只有两件事，其余都在 OpenLife 里已有等价物或更严格的实现：

1. **`request_re` 的「接受/拒绝要看熟悉、价值、好感、性格、心情」这份因素清单**——OpenLife 的 `askEase()` 已经覆盖「熟悉 / 好感 / 性格 / 人情」，但**没有 `价值`**（这次要的东西对他值多少）与**没有被拒绝一方的 `心情`**。这两项是 WEWE 唯一比 OpenLife 想得更远的地方。
2. **`man.update()` 的顺序把「遗忘」放在最后一步**——OpenLife 把遗忘放在读取时过滤（更严格），但 WEWE 的「先处理收到的、再挑要做的、最后才更新自己」这条顺序，正好对应 OpenLife 里 `npcNotice → runBrainDay → npcMarkDay` 的三段；值得在审计后确认这三段在**同一 tick 内**是否严格按此顺序发生（`module.ts:3413` 的 observe 与 `module.ts:906` 的 markDay 之间隔着一次 `runBrainDay`，看起来是对的，但没有专门测试）。

其余都是「设想」，且大多在 OpenLife 里已经落地得更完整（见 §3）。

### (b) OpenLife 已实现多少，剩下的最小缺口是什么？

按提案 §2 的五条线索：

| 线索 | 已实现 | 缺口 |
| --- | --- | --- |
| 性格/属性/记忆参与决策 | 全部（`mind.ts` + `brain.ts`，每项都被读取） | 无 |
| 请求—回话闭环 | 全部（含当面、真物品、人情结算、拒绝台词、过期后果） | NPC 许诺的兑现/违背、改约、第三方介入 |
| 关系后果 | 写入全部（拒绝、过期、揭发、调解） | **读取几乎为零**：`grudge` 不进决策、不衰减 |
| 记忆容量与遗忘 | `news` 有上限与过期；`deeds`/`pledges` 有 slice | `seen` 无界、`asked` 不清、无容量不变量测试 |
| 可感知的人物差异 | 能力齐、`motive` 已进日程摘要、`npc-social:122` 已有「开不开口」的成对对照 | 缺「给不给」的成对对照；`motive` 无测试断言 |

**最小缺口一句话**：**关系被记录得很全，被使用的只有「要不要开口」这一处。**

### (c) 如果只做一个改进，应该是什么、怎样测得它真实改善了玩家体验？

**改进**：把「关系有记忆、记忆有后果」接进 `autonomy/brain.ts`——`look()` 带上 `grudge`，`options()` 里让 `visit` / 帮忙 / 还人情三类候选按 `grudge` 显式调整（与 `askEase` 收口，避免双减），并给 `grudge` 一条「同处一地且没再出事才衰减」的极慢曲线。

**为什么是这一个**：它同时是 R-01（跨时间记忆）与 R-02（拒绝有后果）的公共前提，不需要新模块、不需要新命令、不需要新 UI，只改一个文件加两处测试；而且它把已有的四类写入（拒绝 / 过期 / 揭发 / 调解）从「记着」变成「有效」。

**怎样测得真实改善**（提案 §8 的口径，全部可自动跑）：

1. **行为对照**：固定种子跑 90 天，构造一次「阿灶向阿苇求助被拒」；断言此后 30 天内阿苇**主动接近阿灶的候选权重下降**，而同村第三人（阿岚）不受影响。这是「差异存在」的机器证明。
2. **反向对照**：把同一场景改成「求助被答应」，断言权重上升——证明不是「所有关系都变冷」。
3. **跨季留存**：把评估点放到第 120 天（跨一个季节），断言变化仍在；再过 60 天断言已朝基线回落——同时证明「记得」与「不永久」。这一条直接对应 R-01 的验收示例。
4. **真人可观察**：跑 `npm run web` 的默认世界，让一位新玩家在不被口头指路的情况下，从「熟」页的人物台词与「此刻」页的日程摘要里说出「谁最近不太愿意搭理我」。这对应试玩门槛里的「80% 能凭特征区分两人」与「80% 能把后续变化与自己的行为联系起来」。
5. **不回归**：`npm test` 全绿（当前基线 978），且 `npc-social`/`emergent-npc`/`npc-brain` 三组用例的期望值**不需要改**——如果需要改，说明衰减曲线定得太陡，应回调。

---

## 7. 建议的下一步（不在本文件实施）

1. 交用户审阅本审计，确认 R-01 / R-02 / R-04 的取舍（尤其 R-02 是否只做「许诺结算」一条）。
2. 若批准 (c) 的那一个改进：先加测试（红），再改 `brain.ts`（绿），再跑全量对照 978。
3. R-03 的成对测试可以**立刻**做，不依赖任何设计决策，防回归价值最高。
4. R-04 的容量需要先量再裁：跑 3 年，记录 `JSON.stringify(social)` 的实际长度，再决定上限。
5. R-05 与 WEWE 的渲染/数据脚本不作考虑。
