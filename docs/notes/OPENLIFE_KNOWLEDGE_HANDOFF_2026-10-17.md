# OpenLife 交接：认知系统与待办（2026-10-17）

本轮起点 `f95084e`（= `origin/main`）。工作区未提交，共 24 个已跟踪文件改动 + 11 个新增路径。

---

## 一、本轮做完的事

### 1. 合并 Hark 三补丁系列（已完整落地，557/557 通过）
引入 4 个新模块，模块数 36 → 40：

| 模块 | 内容 |
| --- | --- |
| `world-hazard` | 洪水/干旱四阶段（omen→active→aftermath→calm）、土堤（每处上限 3 段） |
| `settlement-nature` | 河岸天时与本地动物（狗「阿黄」可驯化、狼「灰脊」记仇） |
| `fauna-bonds` | 喂养、驯化、记仇、trust/grudge |
| `social-conflict` | 争执→世仇、调解、和解、恩怨继承 |

同时合入补丁的 `hungerToll`（饥饿 6/8/10 减 1/2/3 格，饿病再减 2，**保底 2 格**确保走得到公灶）与「年景跟随真实灾情」（`hazard`/`excludes` 字段）。

已端到端验证：真实服务器加载 4 模块、自然视图送达页面、饥饿代价真实生效（8→5 格）、洪水封锁河边/渡口/芦苇滩/黏土坑（`E_NATURE_FLOODED`）、土堤上限、动物可喂养。

### 2. 内容扩充（上一轮，与补丁共存）
配方 14 → 23，可制作原型 12 → 19，死物件 10 → 1，事件 8 → 14（带 `requires` 前提与 `cooldownYears` 冷却），冬季新增芦苇/干草/凿冰下篓，NPC 会穿衣。

### 3. 认知系统（本轮新做，**未完成**）

**设计意图**（用户原话）：「我不可能一开始就知道所有人的姓名性格职业什么的，不合理，应该是在交谈或者观察获得的」；「正常生日病中播报也不应该有的，应该是我询问什么的才知道」。

**已实现**：
- `Acquaintance` 三档：`stranger`（只知道有人）/ `met`（知姓名）/ `acquainted`（知营生、脾气）
- `acquaintanceOf()` / `knowsName()` / `knownName()` 判定层（`module.ts`，约 1763 行起）
- `neighbours` 投影按认知遮蔽：陌生时 `name="陌生人"`、`role=""`、`temperament=[]`、`birthday=""`
- 保留 `realName` 字段：身份本身不变，投影/存档/测试用它认人
- 动作标签：陌生时是「叫住这个人，问一句」，认识后才是「与X搭话」
- `happeningsView(world, actorId)` 改为带认知：陌生人的生日**不播报**；陌生人生病只报「村里有人病倒了…至于是谁，得去问问别人才知道」
- `contacts` 列表按认知给名字与营生
- 新命令 `SettlementCommands.askAbout = "settlement-locations.ask_about"`（打听）：
  - 约束：同一地点、必须已认识（否则「先跟他搭句话」）、一天一次
  - 一次教一件事，优先级：① 谁病着 ② 近 12 天内谁过生日 ③ 谁饿着 ④ 当季年景
  - 写入 `holding.askedAt` 与 `holding.heardAbout`（听谁说起过）
- `acquaintanceOf` 已接 `heardAbout`：听人提起过 → 至少 `met`

**边界原则（重要，别改错）**：
- **遮蔽的是「要谈过才知道」的**：姓名、营生、脾气、生日
- **不遮蔽「眼前看得见的」**：`dailyNote`（他此刻在做什么）、`regard`（他此刻怎么待你）、`contact`（交情）、`tradeCount`、`hearts`、`likes`/`dislikes`（送礼送出来的）
- 我曾过度遮蔽后三项，导致 10 个测试失败，已修正

---

## 二、当前状态：**10 个测试失败，必须先修**

`npm test` 结果：多数通过，以下 10 项失败。**根因已定位**：集成测试与部分单测按 `name === "阿灶"` / `"阿予"` 查找村民，而陌生人现在显示为「陌生人」。

| 失败测试 | 根因 | 修法 |
| --- | --- | --- |
| `web-playable`: UX-P0 认知 | `r.name === "阿予"` 查不到 | 改用 `r.realName === "阿予"` |
| `web-playable`: M3-D | 同上（阿灶） | 同上 |
| `web-playable`: M3-C | `cook()` 用 name 查找 → undefined | 同上 |
| `web-playable`: M3-B | 同上 | 同上 |
| `web-playable`: M3-A | 同上 | 同上 |
| `brain` 相关 | 待查（未跑通，测试文件名待确认） | 待查 |
| `npc-social`: 怨气 | **已修**（`regard` 恢复） | 已完成 |
| `origin-talents`: 陶婶 contact | **已修**（`contact` 恢复） | 已完成 |

**下一步（30 分钟内可完成）**：
```powershell
# 把集成测试里按 name 查村民的地方改成 realName
cd D:\MG\program\OpenLife
# 搜索：r.name === "阿灶" / p.name === "阿灶" / name === "阿予"
# 全部替换为 realName，然后重跑：
npm test
```

---

## 三、用户提的三个问题与进度

| # | 问题 | 状态 |
| --- | --- | --- |
| 1 | 人物信息应靠交谈/观察获得 | **机制已完成**，剩 10 个测试待修（纯测试改动，不动设计） |
| 2 | 加手机版/电脑版切换按钮 | **未做**（`view-mode.js` 已加 `layoutMode`/`setLayoutMode`/`applyLayoutMode` 与 `data-layout` 属性，但按钮与 CSS 规则未接） |
| 3 | 被动突发事件（事件找上玩家，玩家选择应对） | **未做** |

### 问题 2 的剩余工作
- `apps/web/public/view-mode.js` 已写好版式状态层（`auto`/`phone`/`desktop`，存 `localStorage["openlife-layout"]`）
- 待做：① 在 `index.html` 的设置菜单加切换按钮；② 在 `theme.css` 把现有 `@media (max-width: 600px)` 规则同时挂到 `[data-layout="phone"]` 选择器上（用 CSS 自定义媒体查询无法做到，需把规则提取成可复用的选择器组）；③ 按钮状态同步（`aria-pressed`）

### 问题 3 的设计方向（未动手）
现有事件全是玩家主动发起。被动事件需要：
- **触发源**：世界时钟（跨日/换季）、NPC 主动上门、灾情阶段推进、随机遭遇
- **投递方式**：现有 `requests`（村民上门求助）已是一条通道，可扩展成通用「待应对事件」队列
- **玩家选择**：每个事件给 2–4 个应对选项（帮/不帮/讨价/敷衍），各自产生不同后果（交情、物资、声誉、后续事件）
- **不打断**：事件应进队列，玩家随时处理，不强制弹窗

---

## 四、GitHub 远端新分支（未合并，待评估）

`git fetch` 后发现两个新分支：

**`origin/openlife-hark-content-20261016`**（45 文件，+1222/-16）
- `docs/lore/world-setting.md`、`docs/CONTENT.md`
- `packs/xia_south_hills_v0_1/`（南丘地图包：boundary_anchors / edges / event_points / locations / regions）
- `modules/map-pack/src/{loader,schema}.ts` 扩展
- `tools/bgm/synth_bgm.py`（BGM 合成）
- `river-terrace-lore.json`、`river-terrace-recipes.json`
- `apps/web/src/codex.ts`

**`origin/openlife-hark-structure-20261017`**（71 文件，+1161/-355）
- 工程守卫：`scripts/typecheck.ts` + `typecheck-baseline.json`（棘轮）、`scripts/workspace-graph.ts`
- 新测试：`import-cycles`、`map-pack-discovery`、`package-contracts`、`source-size-budget`、`test-ownership`、`typecheck-ratchet`
- 各模块 `package.json` 声明收紧

**冲突评估**：两分支都基于 `f95084e`，与本轮改动重叠区在 `modules/settlement-locations/`（content.ts、river-terrace.json、module.ts）与 `tests/unit/workspace-structure.test.ts`。合并需手工解冲突，建议单独一轮做。

---

## 五、已知未修问题（沿用上一轮清单）

- `spawnEntity` 绕过 INV-007 组件归属检查（Core 级，需 RFC；实测 78/254 实体跨属主写入）
- 兽皮披的 `warm` 能力被读取但无规则消费（厚披不比纤维裹身更暖）
- `prototype:hearth` 是死内容
- MEM-002/004/006 记忆预算、PERF-001 基准未做

---

## 六、环境与约定

- 工作区：`D:\MG\program\OpenLife`，分支 `main`，远端 `https://github.com/Zhangwier/OpenLife.git`
- **不要用 PowerShell 读写含中文的源文件**（会乱码，本会话已踩过一次）；用 `read`/`edit`/`write` 工具
- 行尾：仓库文件多为 CRLF，脚本做字符串匹配时需注意
- `git diff --check` 必须干净
- 提交/推送需用户明确要求（本轮未提交）
- 临时脚本 `tmp-*.cjs`/`tmp-*.ts` 在仓库根，可删

---

## 七、验证记录（本轮最后一次全量）

- `npm test`：544 → 557 通过（补丁合并后），认知改动引入 10 项失败待修
- `npm run catalog:check`：通过
- `npm run demo` / `demo:magic`：exit 0，同种子重放一致
- `dev-browser-smoke.mjs`：MOBILE_ACCEPTANCE 全 true，`uncaughtErrors:0`（360/390/430/1280px）
- `git diff --check`：干净
