# OpenLife 插件（Mod）规范 v1

> 目标：除了引擎核心，游戏里的每个系统、每批物品、每张地图都是可以单独加、单独关、单独删的包。
> 新增功能、拆分现有内容，都按这份规范来。违反规范的改动不应合并。

## 0. 三种包，一张表看懂

| 包 | 放哪里 | 写什么 | 能不能带代码 | 怎么启用 |
| --- | --- | --- | --- | --- |
| **系统模块**（System / World / Content Module） | `modules/<id>/` | TypeScript 模块：命令、规则、投影、组件 | 能 | 注册到 `apps/web/src/modules.ts`，用 `apps/web/openlife.modules.json` 开关 |
| **内容包**（Content Pack） | `content-packs/<packId>/` | 只有 JSON 数据：物品、资源名、初始物品、配方 | 不能 | 放进目录即生效，`OPENLIFE_DISABLE_PACKS` 关闭 |
| **地图包**（Map Pack） | `packs/<packId>/` | YAML：区域、地点、连接、事件点 | 不能 | 放进目录即生效（已有，见 `modules/map-pack`） |

判断规则：**要新规则/新行为 → 系统模块；只是新东西/新数值 → 内容包；新地方 → 地图包。** 能用数据表达的，一律不写代码。

---

## 1. 系统模块规范

### 1.1 目录与命名
```
modules/<id>/
  package.json        name: @openlife/module-<id>，依赖必须全部声明
  src/index.ts        对外只从这里导出
  src/module.ts       导出 <camelId>Module: OpenLifeModule
  data/               该模块自带的默认数据（可选）
```
- 模块 id：小写短横线，如 `fauna-bonds`。命令、组件、关系、投影、事件全部以 `<id>.` 开头（如 `fauna-bonds.feed`、`fauna-bonds.animal`）。**不得写别人命名空间下的东西。**
- 单个源文件不超过 1200 行（`tests/unit/source-size-budget.test.ts`）。

### 1.2 manifest 必填项
```ts
manifest: {
  id: "fauna-bonds",
  version: "0.1.0",
  engineRange: "^0.1.0",
  type: "system",              // world | system | content
  name: "与动物相处",
  provides: ["fauna.individuals"],   // 我能提供的能力
  requires: ["world.species"],       // 没有就不能装（硬依赖）
  optional: ["life.settlement"],     // 有就用，没有就降级（软依赖）
  incompatible: [],                  // 不能同装的模块 id
}
```
- **能力 id**（`<领域>.<名字>`）是模块之间唯一的“接口”。依赖能力，不依赖具体模块。
- 新增能力前先查 `docs/MODULES.md`，已有就复用，不要造同义词。

### 1.3 模块之间怎么通信（最重要的一条）
1. **读别人的状态**：按名字读组件/关系（`world.getComponent(id, "world-hazard.state")`），读不到就当它不存在并降级。参考 `settlement-locations/src/story-pick.ts` 读水旱状态的写法。
2. **改别人的状态**：只能 `dispatch` 对方公开的命令，绝不直接写对方的组件。
3. **软依赖不得出现在运行时 import 里**：只允许 `import type`，或从对方包导入常量。真正调用前先确认对方已装：`sim.modules.get("<id>")?.state === "active"` 或 `sim.modules.hasCapability("<cap>")`。
4. 依赖图必须无环（`tests/unit/import-cycles.test.ts`），卫星文件不得反向 import 本模块的 `module.ts`。

### 1.4 UI 与服务端
- `apps/web` 里给某个模块做的界面/动作，放进单独文件（如 `apps/web/src/nature.ts`），每个入口先检查模块是否启用，没装就返回 `null` / 不出按钮。
- 不准再往 `apps/web/server.ts` 里加模块专属逻辑（它已冻结在行数上限）。

### 1.5 存档
- 模块自己的数据只放在自己命名空间的组件里，引擎会随存档保存。
- 存档里有、但当前没装的模块，数据会被标为 ORPHANED 保留，重新装回来还能用。因此**删掉一个模块不会坏档**，模块也不能假设“存档里一定有我的数据”。
- 改数据结构必须写 `migrations`。

### 1.6 每个模块必须带的测试
- 自己的单元测试 `tests/unit/<id>*.test.ts`。
- 如果它在 web 里是可选的：`tests/unit/web-module-plan.test.ts` 会自动验证“关掉它游戏照样能开局、过日子、存读档”，不需要额外写，但必须通过。

---

## 2. 模块开关（已实现）

- 清单：`apps/web/src/modules.ts` 里的 `WEB_MODULE_ENTRIES`，按安装顺序列出 web 认识的全部模块，`core: true` 表示开局必需。
- 开关文件：`apps/web/openlife.modules.json`
  ```json
  { "disabled": ["social-conflict", "fauna-bonds"] }
  ```
- 环境变量：`OPENLIFE_DISABLE_MODULES=social-conflict,fauna-bonds`（叠加在文件之上）；`OPENLIFE_MODULES_CONFIG=<路径>` 换配置文件。
- 规则（`apps/web/src/module-plan.ts`）：
  - 写错 id → 启动报错，不会悄悄忽略；
  - core 模块不能关；
  - 关掉 A 后，硬依赖 A 所提供能力的模块自动跟着关（启动日志打印 `modules off: ...`）；若被连带的是 core 模块则报错。
- 新加一个系统模块：在 `WEB_MODULE_ENTRIES` 加一行，默认不标 core。**只有开局流程直接调用它的命令时才允许标 core。**

---

## 3. 内容包规范（已实现，format 1）

### 3.1 目录
```
content-packs/<packId>/
  manifest.json
  items.json      可选
  recipes.json    可选
```
完整示例：`docs/examples/content-packs/reed_baskets/`（复制到 `content-packs/` 即生效）。

### 3.2 manifest.json
```json
{
  "id": "reed_baskets",
  "type": "settlement_extension",
  "formatVersion": 2,
  "name": "苇编小篓",
  "version": "0.1.0",
  "target": "river-terrace",
  "description": "……",
  "author": "……",
  "requiresModules": ["settlement-locations"],
  "files": { "items": "items.json", "recipes": "recipes.json" }
}
```
- `id`：小写字母开头，只含 `a-z 0-9 _`，2–48 位，全局唯一，等于目录名。
- `target`：要扩展的聚落包 id，目前只有 `river-terrace`。
- `formatVersion`：`1` 或 `2`。**格式 1 的包继续有效**，无需改动；新包用 `2`。

### 3.2.1 格式 v2 新增的文件（全部可选）

| 文件 | 内容 | 校验 |
| --- | --- | --- |
| `incidents.json` | 抉择事件 `{ incidents: [...] }` | 至少两个选项；每个选项至少改变一样东西（消耗/交情/旗标/名声/产出/后续事件）；命名空间 |
| `residents.json` | 新居民 `{ residents: [...] }` | 住处空间必须真实存在（基础包或本包提供） |
| `dialogue.json` | 对话片段 `{ dialogue: [...] }` | 必须挂在存在的居民身上 |
| `places.json`（放在 `items.json` 里亦可） | 新地点 `places`、空间 `spaces`、产出点 `yields` | 空间归属明确；命名空间 |

**抉择事件的最小形态**（`docs/examples/content-packs/share_grace/` 是完整例子）：

```json
{
  "id": "incident:share_grace.share-winter-grain",
  "seasons": ["秋", "冬"],
  "cooldownYears": 2,
  "requires": { "population": { "min": 6 },
    "stockBelow": [{ "resourceId": "resource:grain", "amount": 12 }] },
  "text": "收成不好。灶上的人说，可以把留给冬天的粟分给村东那家，但他们可能撑不到春天。",
  "choices": [
    { "id": "share", "label": "分一半出去",
      "cost": { "resource:grain": 6 },
      "bond": { "trust": 2 },
      "flags": ["shared-winter-grain"],
      "followUp": { "id": "incident:share_grace.hungry-spring", "afterSeasons": 1 },
      "line": "那家人站在门口，半天没说出话。" },
    { "id": "refuse", "label": "先顾自家",
      "bond": { "grudge": 1 }, "reputation": -1, "line": "灶上的人叹了口气。" }
  ]
}
```

**写作标准**（评审会按这几条打回）：
1. 至少两个选项都**有道理**——不存在明显的"正确答案"。
2. 至少一个选项带**延迟后果**（`followUp`）。
3. 正文不超过 80 字。
4. **不出现玩家不认识的人名**——用"灶上的人""村东那家"这类称呼。
5. 每个选项都要真的改变什么；"没有后果的选项"会被 `pack:check` 拦下。

### 3.2.2 自检：`npm run pack:check`

内容作者不必跑全量测试：

```sh
npm run pack:check                       # 检查 content-packs/ 下所有包
npm run pack:check docs/examples/content-packs/share_grace   # 只查一个
```

它应用与游戏加载时**完全相同**的校验规则，逐条列出问题及其文件。

### 3.2.3 存档与内容包

建村时把用到的包记成 `id@version`。读档时若缺少某个包，`missingContentPacks()`
会给出明确清单（"这份存档用到了 reed_baskets@0.1.0"），而不是在某个物品上莫名报错。
**旧存档没有这个字段，视为只用基础包，不会报错。**

### 3.3 命名空间（强制）
包新增的每个 id 都必须带包 id：

| 类型 | 格式 | 例子 |
| --- | --- | --- |
| 物品原型 | `prototype:<packId>.<名字>` | `prototype:reed_baskets.fish-creel` |
| 资源 | `resource:<packId>.<名字>` | `resource:reed_baskets.creel` |
| 初始物品 | `instance:<packId>.<名字>` | `instance:reed_baskets.creel-yu` |
| 配方 | `recipe:<packId>.<名字>` | `recipe:reed_baskets.fish-creel` |

引用基础村落或其他包的 id（如 `prototype:rope`、`place:reedbed`、居民 `yu`）是允许的。

### 3.4 items.json / recipes.json
- `items.json`：`{ "prototypes": [...], "resourceLabels": {...}, "instances": [...] }`，字段格式与 `modules/settlement-locations/data/river-terrace.json` 中同名字段完全一致。
- `recipes.json`：`{ "recipes": [...] }`，格式与 `river-terrace-recipes.json` 一致（物品进、物品出、在某地点的某空间、可选工具）。配方自动出现在制作动作和图鉴里。

### 3.5 加载规则
- 启动时扫描 `content-packs/`（或 `OPENLIFE_CONTENT_PACKS`），按 id 排序依次合并；`OPENLIFE_DISABLE_PACKS=a,b` 跳过。
- format 1 **只能新增，不能覆盖或删除**基础内容。同 id 重复、引用不存在的东西、没加命名空间、target 不对，启动直接报错并列出全部问题。
- 当前生效的包列表：`ACTIVE_CONTENT_PACKS`（`id@version`）。

### 3.6 format 1 暂不支持（下一版再加，加之前不要绕过）
居民、地点、产出点、对话、故事事件、季节内容；物品的“可食用”等行为（需要系统模块配合）；覆盖基础数值；存档记录装了哪些内容包。需要这些的内容先放在对应系统模块的 `data/` 里，等规范升级。

---

## 4. 地图包
沿用现有规范：`packs/<packId>/manifest.yaml`（`type: map_pack`）+ `map/` 下的 YAML，加载与校验见 `modules/map-pack/src/schema.ts`、`loader.ts`，示例 `packs/xia_south_hills_v0_1/`。

---

## 5. 拆分现有内容的指南（给拆包的同学）

`modules/settlement-locations` 目前把建村、吃饭、婚姻、制作、季节、搭话、送礼等系统放在一个包里。拆的顺序和做法：

1. **先拆数据，后拆代码。** 纯物品/配方先挪成内容包或独立数据文件，跑全量测试。
2. **一次拆一个系统**，拆成 `modules/<新id>/`：
   - 给它起能力名（如 `settlement.marriage`），写进 manifest 的 `provides`；
   - 它需要的聚落状态通过读组件/调命令拿，不准 import `settlement-locations/src/module.ts`；
   - 聚落这边如果要用它，放进 `optional`，用前判断是否已装；
   - 命令改名时（`settlement-locations.marry` → `settlement-marriage.marry`）保留旧命令一个版本做转发，并在 `migrations` 里迁移旧组件。
3. 在 `apps/web/src/modules.ts` 注册新模块，跑 `npm run catalog` 更新 `docs/MODULES.md`。
4. 被拆出代码后，`module.ts` 行数会下降：同步**调低** `source-size-budget.test.ts` 里的上限，不能留着给别人再填回去。
5. 每拆一个系统都必须全绿：`node --test`、`npm run typecheck`（不得新增类型错误）、`npm run catalog:check`。
6. 行为不能变：存量的金色/种子测试失败，说明拆坏了，不是测试该改。

### 合并前自查清单
- [ ] 所有 id 都在自己的命名空间下
- [ ] manifest 的 provides / requires / optional 写全，能力名查过没有重复
- [ ] 没有对软依赖的运行时 import；用之前检查了是否已装
- [ ] web 界面入口在模块没装时不报错、不出按钮
- [ ] 关掉这个模块，`web-module-plan.test.ts` 通过
- [ ] 新文件 < 1200 行，冻结文件没有变长
- [ ] `node --test`、`npm run typecheck`、`npm run catalog:check` 全过
