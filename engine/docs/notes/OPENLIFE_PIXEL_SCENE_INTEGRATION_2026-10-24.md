# OpenLife 像素视图接入方案（2026-10-24）

**性质：可运行原型 + 接入契约。** 已产出 `apps/web/public/pixel-scene.html` / `pixel-scene.js` / `pixel-scene.css`，`npm run web` 后打开 `/pixel-scene.html` 即可看到真实世界。

---

## 一、结论先说

**接法不是"把游戏搬进引擎"，而是"给已有的只读视图加一个渲染器"。**

原因很硬：`/api/state` 里的 `settlement` 已经是一份完整的场景描述——地名、在场的邻居、摆着的物件、能去的方向、天气、季节。这些东西本来就是"当前地点该被看见什么"的投影。渲染层要做的只是把它画出来，一行世界规则都不用碰。

所以分成四层，边界清楚：

| 层 | 归谁 | 职责 | 不许做 |
|---|---|---|---|
| 内核 `packages/*` | 已有 | 状态、规则、确定性 | — |
| 视图契约 `settlementView` | 已有（`apps/web`） | 把世界收成"当前地点看到什么" | 不下判断、不写状态 |
| **SceneVM**（本次新增） | 新增，纯函数 | 把 state 收敛成渲染层唯一认识的形状 | 不读内核、不读私有组件 |
| **渲染器**（本次新增） | 新增 | 把 SceneVM 画成像素 | **不回调、不发命令、不写状态** |

`toSceneVM()` 是整个接入点，只有 60 行。以后换 PixiJS、换 Godot、换 3D，改的是渲染器，不是它。

---

## 二、数据从哪来（已核实字段）

`GET /api/state` → `settlement`：

| 字段 | 例子 | 画面里变成什么 |
|---|---|---|
| `placeId` / `placeName` | `place:yard` / 陶家庭院 | 决定用哪套布局 |
| `season` | `冬` | 草色、落叶、积雪 |
| `weather.sky` | `雪` | 雪/雨/雾粒子 + 雾浓度 |
| `neighbours[]` | 陶婶、岚母（`atWork`、`acquaintance`） | 院子里站着的人；**陌生人只显示"陌生的老人"** |
| `objects[]` | 陶罐、编织袋、竹编粮囤 | 沿屋墙摆的物件 |
| `exits[]` | 渔寮、公用灶台、药庐…（`costDays`） | 右下角的路牌 + 左侧列表 |
| `nature.animals[]` | 阿黄（狗） | 院子边的一只狗 |
| `dailyActivity.used/capacity` | 2/8 | **推断**光照（越晚越暖），不是真实钟点 |

`clock` 提供 `day` / `dayOfMonth` / `monthOfYear` / `season` / `eraYear`。

---

## 三、SceneVM（渲染层唯一输入）

```ts
type SceneVM = {
  place:  { id: string; name: string; space: string; note: string };
  clock:  { day: number; dayOfMonth: number; monthOfYear: number; season: string; year: number };
  weather:{ sky: string; note: string };
  player: { id: string; name: string; age: number; alive: boolean };
  people: { id: string; name: string; known: boolean; atWork: boolean; contact: string }[];
  props:  { id: string; name: string; proto: string; qty: number }[];
  exits:  { id: string; name: string; days: number; purpose: string }[];
  animals:{ id: string; name: string; kind: string }[];
  light:  number; // 0..1，仅供渲染层调光
};
```

规矩：**SceneVM 里只放"该被看见什么"，不放规则、不放 RNG、不放实体私有数据**（守住 INV-005 / INV-007）。渲染层拿到它就能画完一帧，不需要回头问任何东西。

---

## 四、渲染层必须自己"发明"的东西

这是本次最重要的发现：**模拟里没有空间**。`place` 之间只有 `adjacent_to` 和 `costDays`，没有坐标、没有朝向、没有院内布局。

所以有一张 **`placeId → 布局` 的表**（`LAYOUTS`），它属于**内容层**，不属于内核：

```js
'place:yard':          { build:'house', water:false, garden:true,  trees:7 }
'place:river':         { build:'none',  water:true,  garden:false, trees:5 }
'place:fishing-lodge': { build:'hut',   water:true,  garden:false, trees:4 }
```

新增一个地点 = 加一行表 + 可能需要一个新建筑函数，**不需要动内核**。反过来，这张表也提醒我们：以后要做"院子里摆东西"，就得先有真正的空间模型，否则永远是"按序号排队摆"。

同理，人物站位目前是**按索引排在院子中央**——因为 `neighbours[]` 没有坐标。等内核有了 `position` 组件，这里换成读坐标即可，SceneVM 的字段不用改。

---

## 五、尺度基准（比例不对时先看这张表）

像素场景最容易翻车的地方不是画法，是**比例**。本场景统一按"人物身高 29px"当尺子：

| 物件 | 像素 | 相对人物（24px） |
|---|---|---|
| 人物 | 29 | 1.0 |
| 门 | 33 | 1.14 |
| 窗 | 25×23 | 0.85 |
| 房高（含屋顶） | 82 + 26 | **3.7** |
| 树（总高 / 冠径） | 98–132 / 82–110 | 3.4–4.6 / 2.8–3.8 |
| 井 | 直径 32 | 1.1 |
| 路宽 | 30 | 1.0 |
| 陶罐/篮子 | 9–12 | 0.35 |

对照：星露谷约 3 倍（房子更矮胖），A Kingdom of Soil 约 4.6 倍（房子更高）。**超过 6 倍，人就会像蚂蚁，画面立刻失真。**

树单独说明：**树是唯一允许比房子高的东西**。参考图里那棵树冠比屋子还大，正是它撑住了画面。做法是把 `y` 当"树干落地点"而不是树冠中心：树冠中心 = `y - 0.62h`，冠径 = `0.84h`，于是树干自然露出约 20%，不会变成浮在草地上的绿球；树干宽 = `0.09h`。

配套规矩：建筑内部尺寸全部按 `w/h` 的比例算（`roofH = h*0.32`、`doorH = h*0.36`），改 `HOUSE` 的宽高，门窗梁柱会跟着缩放，不用逐行改数字。

---

## 六、现在能跑什么


`npm run web` → `http://127.0.0.1:4173/pixel-scene.html`

- 打开即读真实存档：当前是 **-2053 年 1 月 1 日 · 冬 · 雪 · 第 5760 天**，地点**陶家庭院**
- 院子里站着两个人（显示为"陌生的老人"，因为认知系统里还是 `stranger`——这是内核的规矩，视图不许偷看 `realName`）
- 屋墙下摆着 12 件物件（陶罐、编织袋、粮囤…）
- 右下角四块路牌 = 四个可去方向，左侧列出全部 15 个出口
- 天气是雪，所以下雪 + 地面积雪 + 雾更浓
- 读不到 `/api/state` 时自动退回离线快照并挂横幅提示，不会白屏

---

## 七、三条演进路线

| | A. 旁挂页面（现在） | B. 并入主界面 | C. Godot 客户端 |
|---|---|---|---|
| 做法 | `/pixel-scene.html` 独立页 | 在现有 `index.html` 里加视图切换 | Godot 读同一份 SceneVM |
| 成本 | 已完成 | 中（要接现有 shell/路由/触控） | 高（跨进程 + 重写交互） |
| 适合 | 验证观感、给人看 | 真要做成游戏 | 氛围要求极高时 |

**建议先停在 A**，把 SceneVM 冻下来。等 A 的观感定了，再决定是并进主界面（B）还是换引擎（C）——两条路都以这份契约为界，改哪边都不动另一边。

---

## 八、还没解决的三个问题

1. **空间**：没有坐标，所以人物站位、物件摆放都是"按序号排"。要做得像样，内核需要最小空间模型（place 内坐标 + 朝向）。
2. **时间**：时钟是日粒度（`dayTicksPerYear: 360`，`baseUnit: 'day'`），没有钟点。所以画面不做昼夜，只用"活动进度"推断一个暖冷倾向——这一点是**视图的猜测**，不是世界事实，注释里写清楚了。
3. **交互**：现在纯只读，点不了。要能点，得让渲染层把点击转成 `/api/action` 的命令——这是下一步唯一需要突破"只读"边界的地方，而且必须走 Command，不能直接改状态。

---

## 九、文件

- `apps/web/public/pixel-scene.html` — 页面外壳（HUD 用 DOM，不参与绘制）
- `apps/web/public/pixel-scene.js` — `toSceneVM()` + 布局表 + 渲染器
- `apps/web/public/pixel-scene.css` — 外壳样式
