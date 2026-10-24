# OpenLife 2D 视觉模板调研（2026-10-24）

**性质：调研与选型建议，不含代码改动。** 所有仓库数据取自 GitHub API / npm registry，时间 2026-10-24；星数会变，结论看"能不能长在 OpenLife 上"，不看星数排名。

---

## 0. 一句话结论

**OpenLife 不该换引擎，该加一层"只读渲染层"。** 现有 `packages/kernel` 是确定性 TS 内核、`query/` 已经产出面向观察者的 Projection，这套东西天然就是一个"服务端模拟 + 客户端渲染"的结构。所以首选 **PixiJS 8（世界画面）+ 现有 DOM（UI）**，目录结构照抄 `a16z-infra/ai-town`；**Godot 4 留作"氛围实验/宣传片"的第二通道**，接口用同一份 SceneVM JSON 保住后路。

理由：你截图那种画风的成本 80% 在美术和后期（雾、光、软边地形），不在引擎。换引擎等于把 60 个模块、612 个测试和确定性重写一遍，收益只有"雾更好写"。

---

## 1. 先把目标画风拆成技术要件

参考物：截图（草地/土路/野花/树冠俯视）+ 视频①（decemberSola《小镇游戏开发日志》第 7 集，像素沙盒、加暴风雨/雾/暴风雪）+ 视频②（NicoDocci《A Kingdom of Soil》，Godot 4，`WorldEnvironment` 薄雾 + 室外反光，明确说"不再追求真实阴影，反而更有氛围"）。

A Kingdom of Soil 在 Steam 的定位是 **"pixel-art medieval RPG and management adventure"**：种地、捕鱼、狩猎、锻造、烹饪、开酒馆、和镇民建立关系、成家、派系斗争、选择塑造遗产。**这和 OpenLife 的"人生 / 关系 / 传承 / 地区文化"几乎是同一个命题**，所以它的画面语言可以直接当参照，不只是画风参照。

拆成可实现的 7 条：

| # | 画面特征 | 技术要件 | Web 实现难度 | Godot 实现难度 |
|---|---|---|---|---|
| 1 | 俯视 3/4，无透视、无旋转 | 正交相机 + Y 排序 | 低 | 低（`y_sort_enabled`） |
| 2 | 土路/草地**软边过渡**，看不出格子 | autotile（3×3 minimal）+ 角贴片 + 边缘 decal | 中（要自己写 terrain 混合） | 低（TileMapLayer terrain 现成） |
| 3 | 草丛、野花、灌木**随机散布**且密 | decal 层，按噪声/规则撒点，非手工摆 | 低 | 低 |
| 4 | 树冠半透明盖住角色，制造纵深 | 独立 canopy 层 + alpha | 低 | 低 |
| 5 | 低饱和橄榄绿 / 土黄，整体压暗 | 调色板约束 + 全局 tint | 低 | 低 |
| 6 | **薄雾 / 体积感 / 柔和投影** | 全屏后处理 + 光照 | **高**（要写 WebGL filter/shader） | **低**（`WorldEnvironment` fog + `Light2D`） |
| 7 | 像素整数倍放大、无插值 | `scaleMode: nearest` | 低 | 低 |

**结论：1–5、7 在 Web 是常规活；第 6 条是唯一真正偏向 Godot 的地方。** 而第 6 条恰好是视频②的全部主题，也是你觉得"氛围好"的来源——所以它值得单独处理，但不值得为它换掉整个技术栈。

---

## 2. 候选模板清单

### A 组：同栈（TypeScript / Web），能直接长在 OpenLife 上

| 仓库 | 星 | 栈 | 许可 | 最近提交 | 值得抄什么 | 坑 |
|---|---|---|---|---|---|---|
| **a16z-infra/ai-town** | 10.7k | React + **PixiJS 7** + `@pixi/react` + Convex + Vite + Tailwind | MIT | 2026-08-26 | **本清单里最重要的一个**：2D 小镇 + 一堆自主 AI agent 的完整可部署骨架；`src/editor/` 自带地图编辑器；`ARCHITECTURE.md`；sprite 表、viewport、镜头跟随都齐 | PixiJS 还是 7（要升 8）；后端绑 Convex，OpenLife 已有自己的 server，只借前端结构；agent 用 LLM，和你的确定性内核是两种范式，**只抄渲染和编辑器，别抄 agent** |
| **Leoocast/lofi-valley-engine** | 21 | TS + React + Zustand，Tauri 打包 | MIT | 2025-12-24 | **headless 确定性引擎 + 渲染分离**，可 x1/x2/x4/x10 变速不破机制——和 OpenLife 的 INV-004 是同一个思路；"农场实验室"可视化布局编辑器 | 作者自己标了 Preview、非生产可用；代码要清理 |
| **SeloSlav/2d-multiplayer-survival-mmorpg** | 180 | TS + React + Vite + SpacetimeDB | Apache-2.0 | 2026-09-24 | 2D 开放世界生存（饥荒向）的 TS 落地：区块、资源采集、多人同步 | 仓库 2.5 GB；强依赖 SpacetimeDB |
| **phaserjs/template-vite-ts** | 196 | Phaser 3 + TS + Vite | MIT | 2026-04-21 | 官方起步模板，最省事 | 只是个空壳，系统要自己搭 |
| kaplayjs/kaplay | 1.8k | TS 游戏库（3001.x） | MIT | 2026-10-22 | 上手最快，适合做**一周可玩原型** | 不适合长期做大型生活模拟 |
| excaliburjs/Excalibur | 2.4k | TS 2D 引擎（0.32） | BSD-2 | 2026-10-22 | TS 原生、类型友好 | 生态比 Phaser 小 |

> 引擎当前版本：Phaser **4.2.1**、PixiJS **8.22.0**、Kaplay **3001.0.19**、Excalibur **0.32.0**。选 Phaser 就直接上 4，别从 3 起步。

### B 组：Godot 4（4.7.2 stable，2026-08-18）——最贴你的截图

| 仓库 | 星 | 许可 | 最近提交 | 是什么 | 判断 |
|---|---|---|---|---|---|
| **RezaTaheri01/godot-valley** | 4 | MIT | 2026-09-08 | 跟着 **Kristian Koch 的 "Godot Valley" 课程**做的完整农场游戏：种植/浇水/收获、钓鱼小游戏、敌人 AI、商店、建造（洒水器/稻草人）、背包、手柄支持。作者自述"Stardew Valley meets Don't Starve" | **系统最全的 Godot 星露谷模板**，课程产物所以结构规整。星少只是因为新 |
| **robintrepte/hollowmere** | 0 | MIT | 2026-10-11 | Godot **4.7.2**，温馨农场 + 106 只"Wildlings"帮工 + 回合制战斗 + 在线合作；**344 个 GUT 测试**、CI、Windows/macOS/**Web 导出**、`docs/agents.md` 专门给 AI 协作者看 | 工程化程度是这批里最高的，**和 OpenLife 的"AI 协作者 + 测试 + 确定性"文化最像**；可惜太新、无人验证 |
| **elliotfontaine/untitled-farming-sim**（Seasons Gone） | 16 | MIT | 2023-11-14 | Godot 4 俯视像素农场，刻意还原**氮循环、轮作**等真实农学 | 代码小（14 MB）干净，适合读"农学怎么建模"；已上 itch，停更 |
| JevonLee/Stardew | 87 | **无 LICENSE** | 2026-08-15 | 中文，Godot 复刻星露谷，含对话/箱子/工具提示/贝塞尔曲线石头/镰刀光效等细节实现 | **只当学习资料**：无许可 + 复刻作品，素材授权不明，不能进 OpenLife |
| godotengine/godot-demo-projects | 9.7k | MIT | 2026-10-08 | 官方示例，`2d/` 下有 `isometric`、`role_playing_game`、`lights_and_shadows`、`dynamic_tilemap_layers`、`sprite_shaders`、`navigation_astar` | **免费且绝对安全**，第 6 条"光/雾"的官方写法就在这里 |
| nathanhoad/godot_dialogue_manager | 3.9k | MIT | 2026-10-17 | 非线性对话系统 | OpenLife 的"认知/传闻/关系"如果要做成对话，这是现成的 |
| hiulit/Godot-3-2D-Day-Night-Cycle | 348 | — | 2021 | `CanvasModulate` + `Light2D` 做昼夜 | 是 **Godot 3**，只借思路 |

### C 组：不是模板，但值得抄架构

| 仓库 | 星 | 用途 |
|---|---|---|
| joonspk-research/generative_agents | 22.3k | Smallville 小镇：LLM agent 的记忆流 / 反思 / 计划。OpenLife 的"认知 ≠ 记忆 ≠ 信念"分层可以对着它的 memory stream 校验 |
| turesnake/tprPix | 726 | C++17 跨平台 **2D 生存沙盒**（饥荒向），是"饥荒类"里唯一像样的开源工程 |
| deepnight/ldtk | 4.3k | 现代 2D 关卡编辑器，JSON 输出，Web 可直接吃 |
| mapeditor/tiled | 13k | 老牌瓦片编辑器，生态最大 |

### 关于"饥荒类模板"的实话

**没有可用的开源饥荒模板。** GitHub 上 `starve` 相关的高星仓库全是**模组工具和 LuaJIT 优化补丁**（`paintdream/DontStarveLuaJIT` 173★、`handsomematt/dont-starve-tools` 131★、`taichunmin/dont-starve-together-game-scripts` 64★），不是游戏骨架；`dont-starve-together-assets` 还明确写了"内容不属于我"。Godot 侧的生存沙盒项目基本都在 1–5 星、3D 或刚起头。

所以饥荒那一半只能"抄设计不抄代码"：昼夜/季节/理智/资源衰减/建造网格，这五件事在 OpenLife 里本来就是模块，不需要引擎层模板。

---

## 3. 三条路线对比

| | **A. PixiJS 8 + 现有 DOM UI**（推荐） | **B. Phaser 4 全家桶** | **C. Godot 4 客户端** |
|---|---|---|---|
| 与现有代码关系 | 新增 `apps/render-web`，只读 Projection | 同 A，但世界层用 Phaser | 重写视图 + 跨进程取数 |
| 内核复用 | 100%，甚至可在浏览器里直接跑 kernel | 100% | 0%（要么 HTTP 要么重写） |
| 出画面速度 | 中（地形混合要自己写） | **快**（tilemap/相机/物理/动画现成） | 快（编辑器所见即所得） |
| 氛围上限（雾/光） | 中（要写 shader） | 中 | **高** |
| 长期维护成本 | 低（一套语言） | 低 | **高（双语言双工程）** |
| 参考项目 | ai-town、lofi-valley | 官方模板 + 各种 Phaser 农场 | godot-valley、hollowmere |
| 适合谁 | 想保住"模拟是核心资产" | 想两周内看到能走能种的画面 | 想先做一支氛围宣传片 |

**我的建议：A 做正式路线，B 只在你发现 PixiJS 地形混合写不动时切换（两者共用同一套 SceneVM，切换成本可控）。C 不要作为主线**，但可以花 3 天用 Godot 把"雾 + 光 + 树冠"调出来拍一条 20 秒片子，作为美术方向锚点——这正是视频②作者做的事。

---

## 4. 落地建议（给下一步的接口设计）

关键不是选哪个库，是**先把渲染层和内核之间那道墙砌死**，否则以后换引擎要拆房子。

```
packages/kernel (确定性, 已有)
      │  Projection (已有, 只读)
      ▼
packages/view-contracts (新增, 纯类型, 零依赖)
      │  SceneVM { camera, terrain[], decals[], entities[], lights[], weather }
      ├──────────────► apps/render-web  (PixiJS 8)
      └──────────────► godot-client    (未来, 同一份 JSON)
```

- `SceneVM` 里**只放"该被看见什么"**，不放规则、不放 RNG、不放实体私有数据（守住 INV-005 / INV-007）。
- 渲染层必须能**只靠 SceneVM + 上一帧 SceneVM 做插值**，不回调内核；这样 replay、时间加速、旁观 AI 世界都用同一套画面。
- 目录直接照 ai-town 分：`assets/` `src/scene/` `src/ui/` `src/editor/`，编辑器先做"刷地形 + 摆物件 + 存 JSON"，比在游戏里手摆省十倍时间。

### 最小可行渲染层（按顺序做，每步都能截图）

1. `TileLayer`：草地/土路 autotile + 软边（对应画风第 2 条，**这一步做完就像了 60%**）
2. `DecalLayer`：草丛/野花按密度撒点（第 3 条）
3. `EntityLayer`：村民/玩家，Y 排序 + 行走动画（第 1 条）
4. `CanopyLayer`：树冠半透明覆盖（第 4 条）
5. `AtmosphereLayer`：全局 tint + 雾/暗角 + 天气（第 5、6 条，留到最后）

---

## 5. 美术资产从哪来（合规）

截图那种"高细节草地 + 野花 + 软边土路"是**手绘级像素**，靠代码生成不了，必须买或画。可选（**每个包商用前都要自己读一遍授权条款**，这里只列方向）：

- **Cainos "Pixel Art Top Down - Basic"**：草地/土路/树的组合最接近你的截图，常被 Godot/Unity 教程当标准素材。
- **Cup Nooble "Sprout Lands"**：免费版流传最广，温馨农场风；免费版条款有边界，商用要确认。
- **LimeZu**（Modern Interiors / Modern Exteriors）：室内外最全，付费，量大管饱。
- **Game Endeavor "Mystic Woods"**、**Pixel Frog "Tiny Swords"**：免费，风格偏奇幻。
- **Kenney**：CC0，但偏卡通矢量，不像你的目标画风。

**红线：不要用 JevonLee/Stardew 或任何星露谷解包素材。** 那是 ConcernedApe 的版权，进 Steam 会直接下架。

---

## 6. 风险清单

| 风险 | 说明 | 应对 |
|---|---|---|
| 地形混合是隐形大头 | autotile 软边比想象中费时间，容易做成"硬格子" | 第一周就做 `TileLayer`，做不出来立刻转 Godot 或换 Phaser |
| Web 的雾/光 | 要写 WebGL filter，PixiJS 8 的 filter API 和 7 差异大，网上教程多是 7 | 参考 ai-town 前先升到 8 并只抄结构；雾放最后做 |
| Godot 诱惑 | 双工程会拖垮单人项目 | 只有"拍片子"时才开 Godot，且只读 SceneVM |
| ai-town 的 agent 范式 | 它用 LLM 驱动行为，OpenLife 是规则驱动 | 只抄渲染/编辑器，绝不抄 agent 逻辑 |
| 素材授权 | 免费包 ≠ 可商用 | 建一个 `assets/LICENSES.md` 逐包登记来源与条款 |

---

## 7. 建议的三个动作

1. **本周**：clone `a16z-infra/ai-town` 和 `Leoocast/lofi-valley-engine` 各跑一遍，只看 `src/` 和 `assets/` 怎么组织，不做集成。
2. **本周**：在 `docs/` 定 `SceneVM` 草案（20 行类型就够），确定渲染层永不回调内核。
3. **下周**：`apps/render-web` 只做 `TileLayer` + `EntityLayer`，用 `artifacts/ux-1280px-settlement.png` 的同一块聚落做对照截图，判断"像不像"。像，就继续；不像，再谈 Godot。

---

## 附：数据来源

GitHub REST API `/repos/{owner}/{repo}` 与 `/search/repositories`（2026-10-24 取数）；npm registry `latest`（Phaser 4.2.1 / PixiJS 8.22.0 / Kaplay 3001.0.19 / Excalibur 0.32.0）；Godot 最新稳定版 4.7.2（2026-08-18）；A Kingdom of Soil Steam 页面（app 3991390）；B 站 BV19E4m197tc 简介与 BV1nQpJ6UEZY 合集信息。
