# 历史实验室：禀赋、科技、政治、天命、时代

实现了设计书 `docs/plans/HEREDITY_INVENTION_PLAN.md` 的第一版。七个新模块，全部是插件，可任意组合。

| 模块 | 能力 | 做什么 |
| --- | --- | --- |
| `heredity` 禀赋 | `life.heredity` | 12 个能力位点 + 5 个外貌位点；只定上限；孟德尔遗传、突变、近交系数（压低体质）、童年饥饿永久折损；`heredity.impression` 只给文字，不给数字 |
| `tech` 科技 | `tech.invention` `tech.learning` `tech.need-ledger` | 需要簿；28 项发明（从撬棍到汽机），20 条道理（对错各半）；灵光 → 试做 → 模仿/传授 → 失传；观察 → 猜想 → 证据 → 公认；从众；`tech.needs_report` 给开发者 |
| `polity` 政治 | `polity.institutions` `polity.authority` | 15 种制度按条件出现、连续 3 年不成立才可能废弛；威望、头人、专门手艺人、借贷与违约 |
| `polity-bondage` 债役 | `polity.labor` | 单独可关。违约 → 债役；逃亡；反对情绪累积到阈值 → 废除；被迫劳动者的辛苦不进需要簿 |
| `fate` 天命 | `fate.perturbation` | observer（默认）/ nudge（天命点，每进一个新时代补充）/ lab；降生、灵光、见闻、风气四种拨动；每次都是一条指令并记日志 |
| `era-ladder` 时代识别 | `era.current` | 10 个时代 + 社会特征；只读不写；持续 3 年才算进入，同样会倒退 |
| `village-chronicle` 村史 | `chronicle.village` | 百年尺度的人口（生死、婚育、外乡人、分村）、邻村人群层（LOD）、把各插件事件写成村史；驱动器 `runChronicle` |

## 跑一跑

```bash
npm run chronicle -- --seed 7 --years 300
npm run chronicle -- --seed 7 --years 300 --bless 20:trait:insight,trait:memory --compare
npm run chronicle -- --seed 7 --years 200 --without polity-bondage,fate
npm run chronicle -- --seed 7 --years 300 --inspire 40:theory:leverage:8 --encounter 60:invention:copper-smelting --compare
```

`--compare` 用同一个种子再跑一遍不加天命的，列出每项发明提前或推迟了多少年。

## 当前节奏（种子 7，供调参参考，不是承诺）

| 年 | 人口 | 时代 | 会做的东西 |
| --- | --- | --- | --- |
| 100 | 38 | 丰年村落 | 17 项：粮窖、轮作、历法…… |
| 200 | 36 | 联村 | 人多地少开始分村，邻村出现 |
| 300 | 38 | 等级社会 | 冶铜、契刻、牛耕、车轮、世家 |
| 400 | 38 | 城邑 | 青铜 |
| 500 | 38 | 文字与法度 | 刻符记事、冶铁 |
| 600 | 50 | 铁器与王国 | 作坊、水轮 |
| 700 | 45 | 手工工场 | 汽机（靠邻村人群层撑起“社群规模”） |
| 800 | 44 | 工业 | — |

性能：前 100 年约 25 ms/年，到 800 年约 150 ms/年；800 年一共约 75 秒（Node 22 沙箱）。

## 调参的地方

- 发明快慢：`modules/tech/src/engine.ts` 的 `TechTuning`（`baseSpark`、`principleBoost` 等）；各发明的 `difficulty`、`requires.community`（社群规模门槛）在 `modules/tech/data/inventions.json`。
- 道理：`modules/tech/data/theories.json` 的 `truth`、`needsObservations`。
- 人口：`modules/village-chronicle/src/demography.ts`（死亡率、生育率、地力上限、分村、邻村增长）。
- 制度：`modules/polity/data/institutions.json`。时代：`modules/era-ladder/data/eras.json`。

## 已知边界

> 状态截至 `2b7f9c8`。下面几条曾经是真的，现在大多已经不成立——保留在这里是为了
> 说明**当初的边界是什么、后来怎么处理的**，不是当前状态。

- ~~还没有接进网页版的逐日河岸台地~~ **已接**：`apps/web/src/history-bridge.ts`。
  建村时 `heredity.found` + `tech.found`；每天 `historyDay`、每季 `historySeason`；
  村里的真实产出经 `materialsForTech()` 映射成科技树认的材料名。
- ~~邻村只是人口占位，不会自己发明~~ **已改**：`modules/civilization`（A3）。政体是真实
  节点，有位置、人口、聚合科技；发明沿联系网络扩散，工业门槛由网络里掌握它的人数决定。
- ~~随机数按指令序号分流~~ **已改**：A2 键控流 `rng.keyed(...)`，种子只由
  (世界种子, 键) 决定，与命令顺序和抽取次数无关。chronicle / tech / heredity / polity /
  civilization / culture / economy / travel / deposits / modern-world 已迁移，
  office 与 fate 本来就不用 rng。
  - 迁移中查出一个真 bug：规则里拿到的流是 `rng.fork(rule.id)`，而 `fork` 后的
    `label` 只是规则 id、**不含世界种子**，实例 `keyed()` 却用 `label` 当键——
    结果所有世界、所有种子共用同一副骰子（抽样时 40 个种子全在 29 岁「意外」死）。
    现在每条流都携带 origin 世界种子（`#origin`），`keyed = hash(origin, parts)`，
    `fork` 把它传下去，读档时也用 `worldSeed` 复原 origin。

- 数值仍是占位调校，换种子差异很大，这是有意的。

## 当前真实的边界

- **科技节奏很慢**：`baseSpark 0.0035 × curiosity 0.15` ≈ 每季每人 0.05%，
  16 人的村子要几十年才出第一项发明。这是引擎本来的数字，不是 bug——
  但作为玩家体验需要单独校准（见 A7 多种子校准，尚未做）。
- **远行只有骨架**：能出发、走路、到达、回来；目的地读真实地图，但到了之后
  能采什么、见谁还没接到聚落层。
- **时代推进靠 `era-ladder.check`，但桥接层还没在每个年度节点调用它**。

