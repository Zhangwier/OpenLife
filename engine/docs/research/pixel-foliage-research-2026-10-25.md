# 开源像素游戏的「树冠/植被渲染」与「像素颗粒/逻辑像素」调研

- 日期：2026-10-25
- 范围：只做调研，未修改任何 OpenLife 代码，未改动 git
- 对象：`apps/web/public/pixel-scene.js` 的树冠渲染（`buildTrees()` / `treeCanopyLobes()`），以及像素颗粒与缩放策略
- 视觉基线：`tools/art-lab/baseline/accepted-v6-native.png`（用户 2026-10-25 认可的 v6）、`tools/art-lab/baseline/user-reference.png`（NicoDocci 式参考）
- 姊妹文档：同目录的 [像素氛围 / 配色 / 纵深调研](./pixel-atmosphere-research-2026-10-25.md)（配色与大气透视）。那份文档末尾列为"待整理"的**像素完美缩放工程做法**、以及标为"待验证"的 **Saint11 植被教程**，本报告 §3.3 与 §6 建议 6 已补齐并给出一手核实。

---

## 0. 一句话结论

OpenLife 现在的问题**不是"噪点不够碎"，而是碎得过于均匀、被锁在 2px 晶格上、且整体偏亮**。参考图那种"自然松弛"来自一个我们目前缺的双尺度结构 + 正确的明暗配额：

> **大块安静的单一色面（占面积 53%）+ 边缘带的中等孔洞（4–24px）+ 少量 1px 碎叶点 + 亮面只占约一半**

而当前实测是四项都对不上：

| 维度 | 参考图 / v6 基线 | OpenLife 当前 | 病灶 |
|---|---|---|---|
| 大色面（>120px 同色块面积） | 53.0% / 52.3% | **41.6%**（最大块 430px vs 5836px） | 大块被中块吃掉 → 不松弛 |
| 孔洞尺寸分布 | 1px:34% / 4–8px:33 / 9–24px:26 | 1px **57%** / 4–8px 17 / 9–24px **2** | 孔径单一 → **筛网感** |
| 内部游程偶:奇（2px 晶格锁死度） | 0.42 / 0.38 | **0.99** | 网格痕迹可见 → 不发"手画" |
| 亮半区占比 | 43.6% / 53.5% | **61.5% / 87.3%** | 偏亮、暗中段几乎缺失 |

对应的修法不是调参，是**换结构**：把"逐格均匀打孔"换成"叶簇单元（bundle）盖章 + 三级孔洞 + 大块留白"，并把明暗配额压回来。所有修法都能用 §9 的脚本复测，不靠"感觉更像"。

---

## 1. 证据分级与工具限制（先说清楚，便于判断可信度）

本会话的 `web_fetch` 对多数域名返回 `URL hostname resolves to a non-public IP address`（本机 DNS 把域名解析到 198.18.x.x 代理段），`web_search` 报 `DEEPSEEK_API_KEY` 缺失。**所有外部资料改用 `Invoke-WebRequest` 直连 `raw.githubusercontent.com` / `api.github.com` / 各站点，拿到 HTTP 200 后逐行读取正文**。

本报告标注：

| 标记 | 含义 |
|---|---|
| ✅ **亲眼看** | 我本人用 shell 抓到正文／图片，并读到具体内容；代码类逐行 `Select-String` 核对过 |
| ✅ **亲测** | 我在本机对图像做了像素级统计，脚本可复现（见 §9） |
| ⚠️ **二手** | 由并行子代理抓取并转述，我未逐字复核原文（但抓取方式相同、给了 URL） |

被剔除、**不引用**的来源：`love2d.org/wiki/*`（Cloudflare 403）、`solarus-quest-editor` 的 autotiler 判定逻辑（已迁 GitLab，404）、`saint11.tumblr.com`（403）、Reddit 长文（403／超时，**0 条采信**）、`lofibucket`（未找到）、`sunflower-land` 的 `tree/Basic/` 目录列举（404）。

---

## 2. 当前实现的实测画像（✅ 亲测）

### 2.1 现在的树冠是怎么画的（读码确认）

`pixel-scene.js:1052 buildTrees()` 的管线是：

1. `treeCanopyLobes()`（L1002）—— 每棵树 1 个中心团 + 7 个环绕团，相邻树之间再补过渡团，叠成 metaball 场；
2. 场强超过 `TREE_ISO = 0.36`（L996）算实心；
3. **`const PIX = 2`（L1096）** —— 只按 2×2 网格采样一次场与光照，整格填同一色（5 档色阶）；
4. 边缘用 `TREE_BAYER4` 4×4 有序抖动，从 `TREE_FADE = 0.52` 起抖到实心；
5. **逐 1px 打孔**（L1192–1223）：`hollow = vnoise(...)*0.62 + vnoise(...)*0.38`，
   `holeAmt = 0.62 * edgeFactor² + (0.10 - v*0.015)` —— 核心≈0、边缘≈0.62。

结构上的问题点很明确：**第 3 步把一切都压到 2px 网格，第 5 步再用 1px 噪声在网格内部制造破碎**。两个尺度打架，所以既没有 2px 方叶的"读感"，也没有 1px 叶点的"松弛"。

### 2.2 量化证据（表格都是我自己跑的）

**A. 内部 2×2 晶格锁死程度**（只统计距轮廓 ≥6px 的深内部，排除抖动带与抗锯齿污染）

| 样本 | 完全均匀的 2×2 格占比 | 游程 偶:奇 | 主游程分布 |
|---|---|---|---|
| **OpenLife 树冠（左上）** | **45.0%** | **0.99** | 1px:43% **2px:32%** 4px:10% 6px:5% |
| OpenLife 树冠（前左） | 41.9% | 0.28 | 1px:54% 3px:7% 6px:7% |
| **v6 基线树冠（中上）** | **37.6%** | **0.42** | **1px:58%** 2px:21% 3px:8% |
| **v6 基线树冠（前左）** | **22.1%** | **0.38** | **1px:61%** 2px:22% 3px:8% |

> **0.99 意味着偶数长度的同色游程与奇数几乎等量**，而只有 2px 晶格才会让 2/4/6px 游程系统性偏多。v6 基线稳定在 0.38–0.42，且 1px 占 58–61% —— **"以 1px 为绝对主体、2px 只是成对出现"** 才是被认可的那种颗粒度。
>
> 对照：参考图（视频帧，含重采样）同样落在 0.42。三张原生图（OL×2、v6×2、REF）里只有 OpenLife 左上那棵是 0.99，说明这是**局部**而非全局现象 —— 但正是最显眼的那棵树。

**B. 同色连通块的多尺度分布**（按面积加权，不按个数 —— 按个数会被碎点淹没）

| 样本 | 1–3px | 4–24px | 25–120px | **>120px** | 前 10 大块占总面积 | 最大块 |
|---|---|---|---|---|---|---|
| **参考图树冠** | 13.5% | 18.4% | 15.0% | **53.0%** | 41.1% | **5836px**（109×127） |
| **v6 基线树冠** | 17.7% | 19.9% | 10.1% | **52.3%** | 52.3% | 2943px（54×116） |
| **OpenLife 树冠** | 15.0% | **25.4%** | 18.0% | **41.6%** | **20.7%** | **430px**（41×22） |

> 这张表是最关键的证据。参考图和 v6 都是"**一半以上的面积属于 >120px 的大色块**"，而 OpenLife 的大色块只占 41.6%，**最大块小了一个数量级（430 vs 5836）**，同时 4–24px 的中块偏多（25.4% vs 18.4%）。
>
> 翻译成视觉语言：**参考图的树冠是"几大块安静的色面 + 边缘碎掉"，OpenLife 是"中不溜的色块糊满整棵"**。这就是"松弛感"缺失的量化根源 —— 松弛 = 大块不被打扰。

**C. 孔洞（被树冠包住的透空腔）尺寸分布**

| 样本 | 孔洞数 | 孔洞占区域 | 占轮廓 | p50 / p75 / p90 | 最大 | 1px 孔占比 | 分档计数 1 / 2-3 / 4-8 / 9-24 / >24 |
|---|---|---|---|---|---|---|---|
| **参考图** | 215 | 3.5% | 8.2% | 2 / 6 / 17 | 98 | 34% | 73 / 72 / **33** / **26** / **11** |
| **v6 基线** | 107 | 3.4% | 6.5% | 2 / 5 / 10 | 38 | 28% | 30 / 32 / **30** / **13** / 2 |
| **OpenLife** | 76 | 1.6% | 6.6% | **1** / 4 / 4 | 70 | **57%** | 43 / 12 / 17 / 2 / 2 |

> OpenLife 的孔洞**总量只有参考图的三分之一，且 57% 是孤立 1px**，中档（4–8px）与高档（9–24px）严重缺失。这直接解释了"筛网感"：**孔径分布单一，人眼立刻读成规则纹理**。

**D. 其他**

- 主色阶数（>2% 份额）：OpenLife 12 档，v6 12 档，v6 前左树 18 档 —— 色阶数量不是问题。
- 细于 3px 的结构占面积：OpenLife 34%，v6 30%，v6 前左 14% —— **前左那棵树（14%）明显更"整"，是应该向它靠的方向**。
- 逻辑像素与缩放：`dev-art-shot.mjs` 默认 `dsf=2`、视口 700 宽 → 截图 1302×732，**1302/640 = 2.034，非整数倍**。实测放大图里 3.3% 的颜色在 640 原生图里不存在（插值产物），且 640 列里约 22 列被渲染成 3 设备像素、其余 2 像素。

**E. 明暗分配：树冠整体偏亮（这一项我原本没预期，测出来才发现）**

做法：取饱和度 >0.12 的像素当"植被"，按该区域自身的明度范围（5%–95% 分位）切成四等份，看各段面积占比。

| 样本 | 明度范围 | 最暗 ¼ | 暗中 | 亮中 | 最亮 ¼ | **"亮半区"占比** |
|---|---|---|---|---|---|---|
| **参考图** | 43–125 | **28.3%** | **28.1%** | 17.5% | 26.1% | **43.6%** |
| **v6 基线（前左）** | 28–93 | 25.2% | 21.3% | 23.8% | 29.8% | **53.5%** |
| **v6 基线（中上）** | 39–104 | 17.9% | 7.6% | 21.2% | 53.2% | 74.4% |
| **OpenLife（左上）** | 62–137 | 15.8% | 22.7% | 33.0% | 28.5% | **61.5%** |
| **OpenLife（前左）** | 78–154 | **10.7%** | **2.0%** | 17.2% | **70.2%** | **87.3%** |

> 两个信息叠在一起：
> 1. **绝对明度整体偏亮**：OpenLife 的范围是 62–137 / 78–154，参考图是 43–125、v6 是 28–93。**我们的树冠最暗处也不够暗**（v6 前左树最暗到 28，我们最低 62）。
> 2. **相对分配也偏亮**：参考图"亮半区"43.6%，恰好对上 saint11 Part 1 的 `ALMOST HALF OF THE GRADIENT IS LIGHT GREEN`（§3.3，✅ 亲眼看）。OpenLife 两个样本分别是 61.5% 和 **87.3%** —— 后者几乎是"整棵树都在亮部"，暗中段只剩 2.0%。
>
> ⚠️ 方法学提醒：这条用饱和度筛"植被"，会把树冠覆盖的草地一并算进来，**绝对区间只能横比不能当阈值**；但同一方法下三张图的可比性成立。

### 2.3 参考图 / 基线本身是什么

- **v6 基线是预制 sprite 流程**：`asset-manifest.json` 里 `tree` 原生尺寸 **144×197**、`treeFront` **206×281**，逻辑画布 **768×432**、`displayScale: 2`、来源标注 `AI-generated asset; source PNG retained`。
- 我放大看过 `accepted-v6-native.png` 的树（`v6-canopy-mid.png`）：树干 + 分叉枝条**完全暴露**，叶是**沿枝条散布的单像素点簇**，树冠整体**不封闭**，下方有大片透空直到底下的灌木。这和 metaball 实心团是两种完全不同的造型逻辑。
- 参考图是 1238×553 的**视频帧**（含重采样），所以它的像素统计只能当**趋势**用（孔洞形状、面积分布），不能当像素级阈值。

---

## 3. 发现一：树冠的做法分两派，被认可的那一版是"预制 sprite + 叶簇单元"，不是程序化场

### 3.1 Slynyrd《Pixelblog 44 — Top Down Trees》 ✅ 亲眼看（全文）

URL: <https://www.slynyrd.com/blog/2023/5/22/pixelblog-44-top-down-trees>

这篇是**俯视角树**专题，和 OpenLife 的机位完全对口。核心不是"怎么画一棵树"，而是"**先设计一个叶簇单元，再重复它**"：

| 要点 | 原文 |
|---|---|
| 一切从"一捆叶子"（bundle）开始 | "It all starts with a bundle o' leaves. The goal here is to create a single textural unit that comprises all the foliage." |
| 用基础几何形约束形状一致性 | "The best way for me to stay consistent is to base the leaves around a basic geometric shape." |
| **小叶基础单元就是 2×2 px 方块** | "The first example above utilizes a small 2×2px square as its base geometric unit." |
| 方块**可以相接、但不许重叠** | "I allow the squares to touch in places but avoid overlapping, so that the square unit prevails even when new clusters are formed." |
| 形状／尺寸／间距三者一致，重复才不露馅 | "Clusters consistent in shape, size and spacial distribution are key to achieving a pleasing overall foliage texture when the bundles are combined." |
| 三档变体：把整条色带上下移动 | "I make one darker variant and one lighter variant by shifting all hues up or down a notch on a shared color ramp." |
| 上色 = 把 bundle 当球体 | "crescent shaped selection along the bottom left ... one shade darker" + "smaller circle ... on the upper right ... lighter colors" |
| 每 bundle **4–5 色**足够 | "4 or 5 colors per bundle is plenty." |
| 摆不好是单元的问题，不靠后期补 | "If you're unable to find a pleasing arrangement, it's likely an issue with the design of the bundle." |

> **对我们的直接含义**：我们现在的 metaball 场是"连续体积 + 逐像素噪声"，天然画不出"2×2 方块可相接不可重叠"这种**离散单元**的读感。要松弛，得先有一个 5×5~9×7 的叶簇模板。

### 3.2 Slynyrd《Pixelblog 2 — Texture》 ✅ 亲眼看

URL: <https://www.slynyrd.com/blog/2018/2/15/pixelblog-2-texture>

这篇给出了**两种树冠流程**，正好对应我们现在纠结的"程序化还是预制"：

**Free-Form Foliage（自由形）** —— 原文步骤，可直接照做：
> "First, create a basic shape of the tree canopy by **slapping down circles of various diameters** with the pencil tool. Then **go around the edges of the shape adding a few pixels here and there to give it a natural rough outline**. Next, **block out general areas of shadow and highlight**. Finally, **texture over the tree with repetitive leaf shape clusters**."

**Modular Foliage（模块法）** —— 原文：
> "This method only requires **a few textural sprites**, which you can then duplicate and layer into larger textured shapes... This layered approach creates a consistent look often desirable for game assets. Better still, **the sprite layers can be individually moved around to animate a wind effect**."

> 我们的现状是"circles 那一步用 metaball 做了 + 纹理那一步用均匀噪声做了"，**跳过了"block out shadow/highlight"与"repetitive clusters"两个关键中间步**。而 Slynyrd 明确说 cluster 那步才是质感来源。

两条最贴合我们症状的原则原文：

- 镂空要**成片**："This can be achieved by **placing texture details in select areas and leaving empty areas where the texture is implied**. ... **A perfectly homogenous texture can appear unnatural and too busy.**" → **这就是"筛网感"的教科书式定义**。
- 关于孤立像素，原文比二手转述更精确（**不是绝对禁止**）："Orphan pixels are single pixel units not connected to a cluster of the same color... **However, I permit them when they're not obviously floating alone and relate to a greater texture**, in which case I don't consider them true orphans." → 我们对"碎叶点"不必一刀切，但**散点必须能读成属于某个簇**。

### 3.3 Pedro Medeiros / Saint11《Vegetation》系列 ✅ 亲眼看（我下载 GIF 并逐块读了图内文字）

URL: <https://github.com/saint11/Saint11Tutorials>（`Vegetation.gif` / `Vegetation2.gif` / `Vegetation3.gif`，CC-BY 4.0）

我亲自看了 `Vegetation.gif`（Part 1）与 `Vegetation2.gif`（Part 2），确认以下图内原文：

**Part 1**（三步标题就是 `SHAPE → LIGHT → DETAIL`）：
- `I TRY TO MAKE A SILHOUETTE THAT IS RECOGNIZABLE AS A TREE, EVEN WITHOUT THE COLORS` → 先纯剪影可读
- `THE LIGHT MUST SHOW THAT THE TREE HAS VOLUME`
- **`ALMOST HALF OF THE GRADIENT IS LIGHT GREEN`** → **亮面份额接近一半，暗面窄**
- `CREATE RESTING AREAS FOR THE EYES` + **`DETAILED BORDERS, CLEAR INTERNAL AREAS`** → **细节堆边缘、内部干净**（这是"镂空留在哪"的直接答案）
- `COLD SHADOW` → 暗部走冷色
- `KEEP THE COLOR COUNT AS LOW AS POSSIBLE` / `KEEP A LEAF PATTERN FOR CONSISTENCY` / `REPEATING PATTERNS IS A GOOD WAY TO AVOID NOISE`
- `I TRY TO DETAIL WITHOUT ADDING TOO MUCH NOISE` / `I AVOID ORPHAN PIXELS` / `THINK IN LAYERS OF FOLIAGE`
- `AVOID` 旁边画了一个**只有明度横条、没有簇形变化**的球 → **反例：只按明度分层而无簇结构 = 错**

**Part 2**：
- 图层序（自下而上）：**`DIRT → SHADOW → BASE → HIGHLIGHTS`**，标题 `THINK IN LAYERS`
- **`BORDERS HAVE MORE DETAIL AND CONTRAST`**
- **`BIG EMPTY AREAS GIVE FOCUS TO OTHER AREAS`** → **大块空区给焦点**（对应 §建议 4）
- `EACH DETAIL MUST BE CONSCIOUS, DON'T THROW RANDOM DOTS AROUND`
- `DIFFERENT DEPTHS AND PATTERNS BREAK MONOTONY`
- `AVOID TOO MANY COLORS / AVOID ORPHAN PIXELS / AVOID NOISE`
- `DETAIL IN FRONT OF PLAYER` + `COLLISION LIMIT`

> ⚠️ Part 3 的两条（`ADD SPECULAR POINTS ON EDGES`、`FADE FAR VEGETATION TOWARDS SKY COLOR`）是子代理转述，我没有单独下载 `Vegetation3.gif` 复核。

> **这三条（边界细节多、内部干净、大块空区）与我 §2.2 表 B/表 C 的实测完全一致**：参考图 53% 面积是大块、且孔洞集中在中大尺寸。理论与测量在这里对上了。而 Part 1 那个"只有明度横条没有簇形"的 `AVOID` 反例，**正是我们当前树冠的写照** —— 有 5 档明度、没有叶簇结构。

### 3.4 反例：Derek Yu 的两条硬规则 ✅ 亲眼看（经 Wayback；原站对脚本请求返回 403）

原站：<https://www.derekyu.com/makegames/pixelart2.html>（403）
存档：<https://web.archive.org/web/2020id_/http://www.derekyu.com/makegames/pixelart2.html>

我亲自从存档正文读到：

- **树冠 = 几个绿球**："For example, **a treetop could be thought of as a few green spheres glued together instead of as thousands of tiny leaves**. Or a bird's nest could be thought of as a brown bowl instead of a bunch of small twigs." → **我们 metaball 的大方向没错，错在球内部被均匀打碎**。
- **Pillow shading 禁令**（与"球内均匀渐变"直接相关）："shading from the outline inward, creating a 'pillowy' effect. This type of shading **almost never occurs naturally**... and tends to make the object look blurry and indistinct." → **不能沿轮廓向内做等距渐变**。
- **Chunky Pixels Rule**（直接点名树枝，⚠️ 二手转述）："avoid rendering anything with only a single pixel of thickness ... (and tree branches) very thin." → **枝和叶簇最小厚度 ≥2px**。

---

## 4. 发现二：程序化派的做法——"枝端成簇 + 空间哈希最小间距"，不是"场 + 噪声"

### 4.1 Desarrh《Procedural-Tree-Godot》 ✅ 亲眼看（逐行 grep 核对）

URL: <https://github.com/Desarrh/Procedural-Tree-Godot>（MIT，单 `@tool` GDScript 76,459 字节）
源码：<https://raw.githubusercontent.com/Desarrh/Procedural-Tree-Godot/main/ProceduralTree.gd>

这是目前**最贴近我们需求的程序化像素树**（Godot 4，纯代码，输出像素图）。我逐条核对过行号与内容：

**(a) 叶簇长在枝端，不是撒在圆盘里**（L1202 起）
```gdscript
for bd in _branch_data:
    var end_pos: Vector2 = bd["end_pos"]
    var depth: int = bd["depth"]
    var tip_count := maxi(3, leaves_per_branch / depth)
    var cluster_radius := float(crown_radius) * 0.7 / float(depth)
    for _i in tip_count:
        ...
        var dist := sqrt(rng.randf()) * cluster_radius      # L1202
```
两个容易忽略的细节：`sqrt(randf())` 保证**圆盘内面积均匀**（直接用 `randf()` 会中心过密）；`* 0.7` 把圆压成椭圆，符合树冠压扁的透视。

**(b) 空间哈希强制最小间距**（`cluster_min_spacing` 默认 **2px**，L357；检查函数 L1460）
```gdscript
func _check_spacing(pos: Vector2) -> bool:
    var cell := float(cluster_min_spacing)      # L1464
    ... for dx in range(-2, 3): for dy in range(-2, 3): ... distance_squared_to ...
```
> **这正是我们缺的一环**：现在 `holeAmt` 是纯概率阈值，没有任何"叶点之间不许挤在一起"的约束，所以孔洞必然退化成均匀筛网。加一个 2px 最小间距就能立刻改变孔洞的尺寸分布。

**(c) 边缘散点外推**（`scatter_amount` 默认 5，L365；实现 L1481–1494）
```gdscript
var base_dist := 3.0 + float(scatter_amount) * 0.3
var max_dist := 5.0 + float(scatter_amount) * 0.9
var scatter_dist := rng.randf_range(base_dist, max_dist)
var scatter_pos := base_pos + dir_from_center * scatter_dist    # 沿"远离冠心"方向外推
scatter_pos += Vector2(rng.randf_range(-2.0, 2.0), rng.randf_range(-2.0, 2.0))
```
注释给出实测档位：`1 → 3–5px`、`10 → 6–14px`、`30 → 10–24px`。

**(d) 斜向光照 + 色相偏移**（L1512–1529）
```gdscript
var shade_t := 1.0 - gradient_t
shade_t = clampf(shade_t * 0.6 + x_t * 0.4, 0.0, 1.0)   # 纵向 6 : 横向 4 → 斜向光
if shade_t < 0.5: target = foliage_color_light.lerp(foliage_color_mid, shade_t * 2.0)
else:             target = foliage_color_mid.lerp(foliage_color_dark, (shade_t - 0.5) * 2.0)
var hue_rotate := (shade_t - 0.5) * hue_shift_amount * 0.08   # 阴影偏冷、高光偏暖
```

**(e) 默认参数（可直接当初始值）**：`foliage_gradient 0.3` / `hue_shift_amount 0.0`（作者建议开 0.5–1.0）/ `cluster_min_spacing 2` / `scatter_amount 5` / `outline_enabled false`。
性能：树叶烘焙成 **7 张纹理**（1 树干 + 3 背景叶带 + 3 前景叶带）。

### 4.2 OpenTTD 的星形轮廓 ✅ 亲眼看（逐行核对）

URL: <https://github.com/OpenTTD/OpenTTD>（8,422★）
源码：<https://raw.githubusercontent.com/OpenTTD/OpenTTD/master/src/tree_cmd.cpp>

我们现在的轮廓扰动是**按角度取单层 value noise**（`pixel-scene.js:1128-1130` 的 `wob`）。OpenTTD 用的是**低次谐波叠加**，更接近自然树冠：

```cpp
struct BlobHarmonic { int amplitude; float phase; int frequency; };

// 谐波配比（注释说明是实测"不自交、且塞得进 radius² 方格"的值）
std::initializer_list<BlobHarmonic> harmonics = {
    {radius / 2,  Random() / PHASE_DIVISOR, 1},
    {radius / 4,  Random() / PHASE_DIVISOR, 2},
    {radius / 8,  Random() / PHASE_DIVISOR, 3},
    {radius / 16, Random() / PHASE_DIVISOR, 4},
};

float adjusted_radius = (radius / 2.f) + (deviation / 2);   // deviation = Σ sin((θ+φ)*freq)*amp
```

树丛：`GROVE_SEGMENTS = 16`、`GROVE_RADIUS = 16`，16 段星形 + 扇形三角化点内判定。

> 关键差别：**谐波幅度随频率递减（1/2、1/4、1/8、1/16）**，于是"大起伏塑形 + 小起伏加毛边"，而不是把同一强度的噪声加到所有角度上。后者必然产生"气球边缘"。

---

## 5. 发现三：镂空与抖动——有序抖动的网格感是**频谱**问题，不是主观感受

### 5.1 Surma《Ditherpunk》 ✅ 亲眼看（全文）

URL: <https://surma.dev/things/ditherpunk/>

| 结论 | 原文 |
|---|---|
| Bayer 格子感的来源 | "Bayer dithering, for example, is very structured and will look quite repetitive, especially at lower levels." |
| 白噪声也有病（成团/成洞） | "there will inevitably be clusters of bright pixels and voids of darker pixels ... If darker areas of the image fall into one of the clusters, details will get lost" |
| 蓝噪声为什么"有机" | "By removing or dampening the lower frequencies, cluster and voids become less pronounced." |
| 蓝噪声的观感 | "nice, even distribution without showing any obvious patterns, balancing rendering of details and organic look" |
| **Bayer 有偏亮 bias** | 亮度 1/255 的区域在 2×2 矩阵下会有 1/4 像素变白；修法是**反相使用** `brightness > 1 - bayer.valueAt(x,y)` |
| 蓝噪声可无缝平铺 | 高斯模糊在 torus 上计算 ⇒ "blue noise will also tile seamlessly"，64×64 平铺即可 |
| 蓝噪声生成代价 | void-and-cluster，64×64 约 1 分钟（2018 MacBook） |
| **Obra Dinn 的实际选择** | 环境用蓝噪声、**人物用 Bayer** —— "forms a nice visual contrast and makes them stand out" |

> **对 OpenLife 的启示很具体**：我们当前用 `TREE_BAYER4` 做**边缘收形**和**色阶过渡**两件事。前者可以保留（甚至该保留，因为需要"可预期的形"），后者应该换掉 —— 色阶过渡用 4×4 Bayer 会在 5 档色阶上产生规则的对角线纹，正是"机械棋盘感"的直接来源之一。同时注意 Bayer 的偏亮 bias：我们用的是 `(bayer + 0.5) / 16` 与 `bayer > band` 两种用法，**需要在原生尺寸下目检是否有整体偏亮**。

### 5.2 网格感的频谱解释 ✅ 亲眼看（MDN 原文）

URL: <https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering>

我亲自读到的关键定义（这条对我们**极其重要**，见 §7）：

> **`pixelated`** — "The image is scaled with the 'nearest neighbor' or similar algorithm **to the nearest integer multiple of the original image size, then uses smooth interpolation** to bring the image to the final desired size."

即：`image-rendering: pixelated` **在非整数倍缩放下不是纯最近邻**，它是"先整数倍最近邻、再平滑补差"。所以单靠它挡不住非整数倍模糊。

同一份 MDN 页对 `crisp-edges` 的定义也确认了它"以最近邻之类的算法为意图"。**更硬的是规范原文**（CSS Images 3，✅ 亲眼看 <https://drafts.csswg.org/css-images-3/>）：

- `pixelated`："The image is scaled in a way that preserves the pixelation of the original as much as possible, **but allows minor smoothing as necessary to avoid distorting the image when the target size is not a clean multiple**... Scale it to this integer-multiple-size using nearest neighbor, then scale it the rest of the way to the target size as for smooth."
- `pixelated` 的 Note："At integer multiples of the natural size, this gives the same results as crisp-edges. **At non-integer multiples**, this usually gives better visual results, even for pixel art, **but it does incur a performance penalty** due to the 'two-step' rendering requirement."
- `crisp-edges` 的 Note（**"像素不均匀"的规范级描述**）："If the new size is not an integer multiple of the original size, the nearest neighbor algorithm can introduce significant 'aliasing' bugs; **lines that were the same thickness in the original image might be a pixel thinner or thicker in the scaled image depending on where they appear**"。

> 结论：`pixelated` 与纯 nearest 都**不保证**非整数倍下的均匀像素。唯一可靠解是**不要出现非整数倍**。

### 5.3 抖动该用在哪 ⚠️ 二手（cure / Derek Yu）

- cure（Pixel Joint 长文，<http://pixeljoint.com/forum/forum_posts.asp?TID=11299>）：**random dithering 明确不推荐** —— "isn't generally advised, as it adds a lot of single-pixel noise to the image"；抖动用处是 "taper the ends and edges of an opaque field of pixels"；覆盖率过半就该加颜色而不是抖动；**只留 1px 缝消不掉 banding** —— "Even if there is a negative space between two bands, the mind will fill in the gap and banding will remain."
- Derek Yu：抖动只在"大块单色"或"想要粗糙感（如泥土）"处，且 "I use dithering sparingly"；selout（选择性描边）：受光侧用亮色或直接去掉描边，内部用暗色而非纯黑。

> 我们的代码里，镂空用的是 `vnoise`（值噪声）而不是抖动 —— 方向是对的。但**噪声尺度只有两档（2.6 / 1.3）且权重 0.62/0.38 固定**，所以孔径分布单一。见 §6 建议 3。

---

## 6. 对 OpenLife 树冠渲染的具体建议（7 条，每条给做法 + 来源 + 可验证指标）

> 所有指标都能用 §9 的脚本复测，改完直接对比数字，不靠"感觉更像"。

### 建议 1｜取消 PIX=2 的统一网格，改成"块面 2px / 叶点 1px"的双尺度

**问题**：`const PIX = 2`（L1096）把色阶、场强、透光点全部锁在 2×2 网格上，实测内部 2×2 完全均匀格占 45%，游程偶:奇 = **0.99**。

**做法**：
1. 保留 "按格采样场 + 5 档量化" 的**体积骨架**（这部分是对的，符合 Derek Yu "几个绿球"）；
2. 但把**填色**从"整格填同一色"改成"格内按叶簇模板填"：每个 2×2 格先由场强/色阶决定"该长什么档的叶子"，再由建议 2 的模板决定**格内 4 个像素中哪几个是叶、哪几个是缝**；
3. 透光高光点（`CELL_HILITE`/`CELL_ACCENT`）改为 1px 自由落点，不受网格约束。

**来源**：Slynyrd 44 的 "2×2px square as base unit ... allow to touch but avoid overlapping" ✅ + Derek Yu 的 Chunky Pixels Rule（最小厚度 ≥2px）⚠️ + 我 §2.2 表 A 的实测（v6 = 0.38–0.42）。

**验收**：内部（≥6px 深）游程 **偶:奇落到 0.35–0.45**；主游程 **1px 占 55–62%、2px 占 18–24%**。不要追求 0.5 以下到 0.2，那是另一个极端（现在的"前左树"0.28 就已经偏碎了）。

### 建议 2｜引入"叶簇单元（bundle）"模板，替掉逐像素阈值噪声

**问题**：现在是 `hollow < holeAmt` 逐像素独立判定，缺乏任何"簇"的概念，必然均匀。

**做法**：
1. 手工做 **3–4 个 5×5 ~ 9×7 的 1-bit 叶簇模板**（蒙版），要求：单块最小厚度 ≥2px、块与块之间留 1px 缝、**不允许孤立单像素**（照 Slynyrd 的"方叶可相接不可重叠"）；
2. 每个模板做**三档变体**（暗/中/亮），由同一色带整体平移得到；
3. 盖章位置不用随机：用 **2px 最小间距的空间哈希**（Desarrh `_check_spacing`，`cluster_min_spacing = 2`）过滤，保证簇不挤在一起也不均匀铺满；
4. 每棵树的模板选择与旋转用**坐标哈希**固定（SuperTux 的 `(x*371 + y*49173 + ...) % 256` 思路），保证刷新不变、可回放。

**来源**：Slynyrd 44 ✅（bundle 设计与三档变体）+ Desarrh `_check_spacing` ✅（空间哈希最小间距）+ SuperTux `autotile.cpp` ✅（坐标哈希替随机数，跨平台一致）。

**验收**：孔洞 **1px 占比从 57% 降到 30–35%**；`4–8px` 孔洞数从 17 升到 **30±5**；`9–24px` 从 2 升到 **10–26**。

### 建议 3｜镂空改成"三级孔洞"，明确指定每一级的孔径与位置

**问题**：实测孔径分布几乎全压在 1px（57%），中/大孔洞缺失。参考图是 `1px:73 / 2-3px:72 / 4-8px:33 / 9-24px:26 / >24px:11` 的多尺度。

**做法**（三层噪声叠加，各自负责一种孔径）：

| 层级 | 噪声尺度 | 作用 | 落点 |
|---|---|---|---|
| 大孔（>24px） | `scale ≈ 26–34`，阈值很窄 | 树冠内部"透出枝条/天空"的缺口 | 只在**枝干投影附近**与**树冠下半部** |
| 中孔（4–12px） | `scale ≈ 8–12` | 叶簇之间的缝 | 集中在**距轮廓 2–8px 的边带** |
| 小孔（1px） | 建议 2 的模板决定，**不用噪声** | 叶点间隙 | 全树冠，但被最小间距约束 |

关键在**位置规则**而非概率：`edgeFactor²` 把孔洞推向边缘的方向是对的（`pixel-scene.js:1214`），**但应该按"距枝干的距离"再补一层**——参考图的 11 个大孔洞基本都在"树冠内部、枝条附近"，而不是均匀分布。

**来源**：我 §2.2 表 C 的实测分布 ✅ + Slynyrd Pixelblog 2 "leaving empty areas where the texture is implied" ⚠️ + saint11「DETAILED BORDERS, CLEAR INTERNAL AREAS」✅ + cure "random dithering adds single-pixel noise" ⚠️。

**验收**：孔洞分档计数逼近参考图比例（允许按 640×360 的尺度折算）；**孔洞总面积占轮廓 6–9%**（现在 6.6%，参考 8.2%）。

### 建议 4｜保住"大块不被打扰"，细节只堆在边带

**问题**：这是最被忽略、但数据最刺眼的一条。参考图 **53% 的面积属于 >120px 大色块、最大 5836px**；OpenLife **41.6%、最大 430px**。大块被中块（4–24px 占 25.4%）吃掉了。

**做法**：
1. 给"核心区"（场强 `solid > 0.85` 且距轮廓 > 8px）**强制关闭 1px 镂空**：现在核心理论值 `holeAmt ≈ 0.10`，但实际仍在打孔（`0.10 - v*0.015` 里 `v` 是色阶，最高档时 ≈0.025，即仍有 2.5% 概率）；
2. 把 `0.62 * edgeFactor²` 的 `edgeFactor` 收窄：只在 **距轮廓 3–6px 的边带**内快速上升，而不是从 `TREE_FADE` 一路线性影响进内部；
3. 大色块之间用**同一色阶**相连（现在 `litRaw` 量化后相邻格在 `bayer > quant-idx` 时跳档，容易把大块切碎 —— 建议把档间抖动**限制在边带内**，内部不抖）。

**来源**：saint11「BIG EMPTY AREAS GIVE FOCUS TO OTHER AREAS」✅ +「BORDERS HAVE MORE DETAIL AND CONTRAST」✅ + Slynyrd Pixelblog 2「A perfectly homogenous texture can appear unnatural」⚠️ + 我 §2.2 表 B 的实测 ✅。

**验收**：**>120px 同色块面积占比从 41.6% 提到 48–55%**；**前 10 大块占比从 20.7% 提到 40%±5%**；最大块从 430px 提到 **2000px 以上**。

### 建议 5｜轮廓从"单层角度噪声"换成"递减幅度谐波 + 边缘散点"

**问题**：`pixel-scene.js:1128-1130` 的 `wob` 是单层 value noise × 0.55，所有角度同等扰动 ⇒ 气球感。且轮廓是闭合的，没有参考图那种"边缘零散叶点探出去"。

**做法**：
1. 改成 **4 阶谐波**：`r(θ) = r0 + Σ A_i · sin((θ + φ_i) · f_i)`，取 `{A: r/2, f:1}, {A: r/4, f:2}, {A: r/8, f:3}, {A: r/16, f:4}`，φ 由树 seed 决定。幅度递减保证"大起伏塑形、小起伏加毛边"，且不自交（OpenTTD 注释明确这是实测值）；
2. 轮廓外**再撒 6–12 个 1px 散点**，从边带叶点沿 `(pos - crownCenter)` 方向外推 3–14px（随强度线性增长），位置加 ±2px 抖动；
3. 散点**不参与**镂空计算，独立一层，画在最上面。

**来源**：OpenTTD `CreateStarShapedPolygon` ✅（谐波配比与不自交性质）+ Desarrh `scatter_amount` ✅（外推距离档位）+ Slynyrd Pixelblog 2 "go around the edges adding a few pixels here and there" ⚠️ + saint11「ADD SPECULAR POINTS ON EDGES」⚠️。

**验收**：轮廓周长/√面积（**不圆度**）从 34.06 提到 **41–44**（参考 43.99、v6 41.19）；树冠外 3–14px 环带内的孤立点数量 ≥6 且 ≤14。

### 建议 6｜逻辑像素：把"非整数倍"从链路里去掉（横切所有场景）

**问题**：`dev-art-shot.mjs` 默认 `dsf=2` + 700 宽视口 ⇒ 1302×732，**2.034 倍**。实测放大图有 3.3% 的颜色是插值产物，且约 22/640 列会被渲染成 3 设备像素、其余 2 像素 —— **同一棵树上的"1 像素"宽度不一**。这会直接毁掉任何颗粒度调优：你在原生图里调好的 1px:2px 比例，到屏幕上就不是那个比例了。

**做法**：
1. 后备缓冲固定 640×360（或 640×360 × 整数），`ctx.imageSmoothingEnabled = false`（已有，L186）；
2. **CSS 尺寸取整数倍**：`scale = max(1, floor(min(cssW/640, cssH/360)))`，剩余空间用背景色填充居中，**永不小数缩放**；
3. 按**设备像素**校验：`canvas.width = 640 * k`（k 整数）且 `canvas.clientWidth * devicePixelRatio === 640 * k`；
4. `image-rendering: pixelated` 保留，但**不要依赖它兜底** —— 已知它在非整数倍时是"整数倍最近邻 + 平滑补差"，不是纯最近邻；
5. 截图/验收脚本改成整倍输出（`dev-art-shot.mjs` 的 `dsf` 与视口宽度要联动成整数比）。

**来源**：MDN `image-rendering` 原文 ✅ + CSS Images 3 规范原文 ✅（`pixelated` 两步算法、`crisp-edges` aliasing Note）+ Tanalin《Integer Scaling》✅（"Nearest Neighbour is only lossless at integer ratios... results in so called **pixel shimmering, or jitter**"；"use the maximum integer scale that the scaled image fits the screen at, and **fill the rest space with black**"）+ 我 §2.2 表 D 的实测 ✅（2.034 倍、3.3% 插值色）。

**验收**：截图宽度 / 640 为整数；放大图调色板中"原生不存在的颜色"占比 **0%**；在 125%/150% 系统缩放下截图复验一次（分数 dpr 是最大陷阱）。

> 注：`docs/design/PIXEL_ART_WORKFLOW.md` §像素网格与渲染 已经写了正确原则（"最终画布使用最近邻整数倍显示"、"画布在屏幕上的起点也按设备像素对齐"）。本轮实测说明**正式像素视图（`pixel-scene.css` 的 `width: 100%`）与截图工具都还没落实这条**，属于规范与实现的偏差，不是规范缺失。

### 建议 7｜把明暗分配压回来：亮半区从 61–87% 降到 ~50%，最暗处再压下去

**问题**（§2.2 表 E，我原本没预期会测出这一条）：OpenLife 树冠的"亮半区"占 **61.5%**（左上）和 **87.3%**（前左），参考图是 **43.6%**。前左那棵树**暗中段只剩 2.0%**，等于几乎没有中间调过渡。同时绝对明度整体偏亮（OpenLife 62–154，v6 28–104）。

**做法**：
1. `litRaw` 的基线 `0.46`（`pixel-scene.js:1154`）往下调，让分布重心回到中间；5 档色阶的**最暗一档要真的暗**（现在 `treeCanopyShades` 最深只压到 38% 黑）；
2. 色阶改成 **4 档而非 5 档**（Slynyrd："4 or 5 colors per bundle is plenty"），把省下的动态范围给暗部；
3. 暗部**走冷色**而不是单纯压黑（saint11 `COLD SHADOW`；Slynyrd 实测暗部色相在蓝紫区）—— 现在 `mixc(leaf, [0,0,0], t)` 是纯降明度，会让暗部发灰而不是发冷；
4. **不要**沿轮廓向内做等距渐变（Derek Yu 的 pillow shading 禁令），因为那会让暗中段进一步被吃掉。

**来源**：我 §2.2 表 E 的实测 ✅ + saint11 Part 1 `ALMOST HALF OF THE GRADIENT IS LIGHT GREEN` / `COLD SHADOW` ✅ + Slynyrd 44 "4 or 5 colors per bundle is plenty" ✅ + Derek Yu pillow shading 禁令 ✅。

**验收**：亮半区占比落到 **48–56%**；最暗 ¼ 占比提到 **20–28%**；暗中段（第二 ¼）不低于 **15%**（现在是 2.0%，这是最刺眼的一处）。

---

## 7. 可参考的开源项目清单

| 项目 | URL | 它怎么画树/植被 | 能解决我们的什么 | 验证 |
|---|---|---|---|---|
| **Slynyrd Pixelblog 44 — Top Down Trees** | <https://www.slynyrd.com/blog/2023/5/22/pixelblog-44-top-down-trees> | 预制 bundle 单元（2×2 方叶 / 梯形 / 圆），三档色带整体平移，crescent 压暗 + 小圆提亮 | **叶簇单元的设计方法**；俯视机位对口；直接给了 2×2 与"可相接不可重叠"的规则 | ✅ 亲眼看全文 |
| **Desarrh / Procedural-Tree-Godot** | <https://github.com/Desarrh/Procedural-Tree-Godot> | 纯程序化：枝端成簇 + `sqrt(rand)` 圆盘均匀 + 空间哈希 min_spacing=2 + 边缘 scatter 外推 + 斜向 6:4 光照 + hue 偏移 | **最贴近我们场景的程序化参考**：最小间距约束、边缘散点、光照权重都能直接改成 JS | ✅ 亲眼看（grep 核对行号） |
| **Shattered Pixel Dungeon** | <https://github.com/00-Evan/shattered-pixel-dungeon> | 元胞自动机生成成片植被：`Patch.generate(w,h,fill,clustering,forceFillRate)` —— 随机布尔 → N 次 3×3 多数表决 → 回填补足填充率；高草概率 `count/12`（count = 自身 + 8 邻域） | **草地/灌丛成团不成片**；`forceFillRate` 的"回填时只从已有块向外长"能避免孤立点 | ✅ 亲眼看 `Patch.java` 全文 + `RegularPainter.paintGrass` |
| **OpenTTD** | <https://github.com/OpenTTD/OpenTTD> | 预制 sprite 拼装 + 4 阶谐波星形树丛（`GROVE_RADIUS=16`, 16 段）+ palette 换季 | **树冠轮廓的谐波公式**（幅度递减、保证不自交）；树丛成团 | ✅ 亲眼看 `tree_cmd.cpp` L188–330 |
| **Saint11 / Pedro Medeiros《Vegetation》1–3** | <https://github.com/saint11/Saint11Tutorials> | 分层教学：`DIRT→SHADOW→BASE→HIGHLIGHTS`；边界细节与对比更高；大块空区给焦点；禁孤立像素 | **"细节堆边缘、内部干净"这条原则的出处**，也是我们最缺的那条 | ✅ 亲眼看 `Vegetation2.gif` 图内文字 |
| **zfedoran / pixel-sprite-generator** | <https://github.com/zfedoran/pixel-sprite-generator> | 程序化 sprite：`generateEdges()` 对 4 邻域做形态学膨胀标 `-1`，边缘色 `rgb *= edgeBrightness(0.3)`（同色压暗，不是纯黑） | **描边实现**（若最终决定给树冠加收边）；边缘压暗而非纯黑的取色法 | ✅ 亲眼看 `generateEdges` / `renderPixelData` |
| **SuperTux** | <https://github.com/SuperTux/supertux> | 预制 tile + 8 字符邻域 mask autotile；坐标哈希 `(x*371+y*49173+…)%256` 替 `rand()` | **确定性哈希**（拒绝 `Math.random`）+ weight/period 做"周期性错落" | ✅ 亲眼看 `autotile.cpp` |
| **Solarus** | <https://github.com/solarus-games/solarus> | 预制 tileset + `BorderKind` 12 种边框（4 边 + 4 凸角 + 4 凹角）+ `inner` 开关（边框画在轮廓内/外）；3 帧走 `012`、4 帧走 `0121` | **植被边缘 autotile 的完整枚举**；"树冠压地面 vs 地面压树冠"的开关思路；摇曳帧序列（多停一帧更自然） | ✅ `BorderKind.h` 的 12 个枚举值我亲自核对（`NONE/RIGHT/TOP/LEFT/BOTTOM/…CONVEX/…CONCAVE`）；⚠️ 判定算法在 GitLab 的 quest-editor，404 未验证 |
| **sunflower-land** | <https://github.com/sunflower-land/sunflower-land> | 纯 sprite sheet，季节×群系×树种三维查表；摇晃 7 帧 24fps；统一画布 26×34 + 负偏移压底 | **换季零成本**、统一画布对齐网格（和 `asset-manifest.json` 的 `pivot`/`colliders` 思路一致） | ⚠️ 二手（`sunnyside.ts` 未亲自复核） |
| **4b3c / ProceduralTrees** | <https://github.com/4b3c/ProceduralTrees> | 画大图 → 缩到 1/4 → mask 四向描边 → 放大回原尺寸 | **"已有大图转像素"流程**（若将来想把 AI 生成的大图降采样成原生像素） | ⚠️ 二手 |
| **MomentsInGraphics / BlueNoise**（Peters） | <https://github.com/MomentsInGraphics/BlueNoise> · <http://momentsingraphics.de/BlueNoise.html> | 蓝噪声纹理（CC0，预计算成品）+ void-and-cluster 实现 | **若决定把色阶过渡从 Bayer 换成蓝噪声**：可直接下 64×64 成品平铺 | ⚠️ 二手 |
| **pixelmager / bluenoisegen** | <https://github.com/pixelmager/bluenoisegen> | void-and-cluster / FRD 生成器，仓库内含 64/256/512/1024 成品 bmp | 同上，含现成纹理文件（我确认过 `textures/` 目录与文件名） | ⚠️ 二手（我确认了文件名列表，未下载校验内容） |

---

## 8. 关于"像素颗粒与逻辑像素"的横向对照

| 做法 | 来源 | 要点 |
|---|---|---|
| 统一最小绘制单位 | `docs/design/PIXEL_ART_WORKFLOW.md` §像素网格与渲染 第 1–2 条 | 原生像素缓存 + 整数落点 + 最近邻整数倍显示；镜头靠近用"裁取更小范围"实现 |
| 关内部平滑 | MDN `imageSmoothingEnabled`（✅ 我已读 Phaser/MDN 相关页） | 默认 `true`，像素风必须显式设 `false`；`imageSmoothingQuality` 初值 `"low"` |
| 关 CSS 合成插值 | MDN `image-rendering` ✅ + CSS Images 3 规范 ✅ | `pixelated` = 最近邻到**最近整数倍**再平滑补差；非整数倍时**仍有平滑**且有性能代价；`crisp-edges` 的 aliasing Note 明确"同厚的线会变粗或变细" |
| 引擎侧等价物 | Phaser `pixelArt: true` ✅（官方文档原文：`Sets antialias to false and roundPixels to true. This is the best setting for pixel-art games.`）；`roundPixels` 只对**有纹理**的对象生效，Graphics 无效 | 说明"坐标取整"和"过滤模式"是两件不同的事，都要做 |
| 整数倍 + 黑边 | Tanalin《Integer Scaling》✅ | 原文："Nearest Neighbour is only lossless at integer ratios... **pixel shimmering, or jitter**"；解法："use the maximum integer scale... **fill the rest space with black**" |
| 抖动必须按**逻辑像素**取阈值 | Surma ⚠️（其在文末警告分数 devicePixelRatio 下 `pixelated` 有 artifact）；我 §建议 6 ✅ | 若按设备像素取阈值，抖动图案会随缩放倍率变化并产生摩尔纹 |

---

## 9. 复现方式（只读，全部脚本在 `.tmp`，不在版本库里）

我用到的脚本都在 `D:\MG\program\OpenLife\.tmp\foliage-research\`（临时目录，非交付物）：

```powershell
# 1) 把 PNG 转成裸 RGBA，供 Node 快速统计
pwsh -File .tmp/foliage-research/dump.ps1

# 2) 基础统计：亮度分档、同色连通块、孤立像素、游程
node .tmp/foliage-research/stats.mjs

# 3) 多尺度面积分布（关键：按面积加权，不按个数）
node .tmp/foliage-research/multiscale.mjs

# 4) 轮廓与孔洞：周长/√面积、孔洞尺寸分档
node .tmp/foliage-research/silhouette.mjs

# 5) 2×2 晶格锁死程度（只看距轮廓 ≥6px 的深内部）
node .tmp/foliage-research/interior.mjs

# 6) 色阶数与最细结构占比
node .tmp/foliage-research/ramp.mjs

# 7) 明暗分配（亮半区占比）—— 建议 7 的验收依据
node .tmp/foliage-research/tones.mjs

# 8) 原生 640×360 截图（dsf=1，强制整数倍）
node .tmp/foliage-research/capture-native.mjs
```

**改完树冠后怎么用同一套数据判定"有没有变好"**：

| 指标 | 现在 | 目标 | 脚本 |
|---|---|---|---|
| 内部游程偶:奇 | 0.99 | 0.35–0.45 | `interior.mjs` |
| >120px 同色块面积 | 41.6% | 48–55% | `multiscale.mjs` |
| 前 10 大块占比 | 20.7% | 40%±5% | `multiscale.mjs` |
| 1px 孔洞占比 | 57% | 30–35% | `silhouette.mjs` |
| 4–8px 孔洞数 | 17 | 30±5 | `silhouette.mjs` |
| 9–24px 孔洞数 | 2 | 10–26 | `silhouette.mjs` |
| 亮半区占比 | 61.5% / 87.3% | 48–56% | `tones.mjs` |
| 最暗 ¼ 占比 | 15.8% / 10.7% | 20–28% | `tones.mjs` |
| 放大图插值色 | 3.3% | 0% | `interp.ps1` |

对比样本与裁切区域：

| 样本 | 文件 | 区域 |
|---|---|---|
| OpenLife 当前 | `.tmp/foliage-research/ol-native-640.png`（640×360） | `(0,20,130,130)`、`(160,30,120,110)` |
| v6 基线 | `tools/art-lab/baseline/accepted-v6-native.png`（768×432） | `(340,60,120,120)`、`(0,230,150,120)` |
| 参考图 | `tools/art-lab/baseline/user-reference.png`（1238×553，**视频帧，仅看趋势**） | `(240,140,200,200)` |

---

## 10. 存疑与未验证项（不编造）

1. **参考图是视频帧**（1238×553，实测无固定 upscale 周期），像素级统计受重采样污染。**§2.2 表 A 的晶格结论不采信参考图**，只采信两张原生图（OpenLife 640×360、v6 768×432）。
2. **`love2d.org/wiki/*` 全部 403**（Cloudflare），LÖVE 的 `setDefaultFilter` 正文未读到，本报告不引用其内容。
3. **Solarus 的 autotiler 判定算法**在 `solarus-quest-editor`（已迁 GitLab），raw/API 均 404，**未验证**。仅 `BorderKind` 枚举与 `BorderSet` 数据模型可确认。
4. **Reddit 长文 0 条采信**（403／超时）。
5. `sunflower-land` 的 `tree/Basic/` 目录列举 404，资源存在性仅由 `sunnyside.ts` 字符串确认，**未直接打开 webp**。
6. **Desarrh 项目我没运行其 Godot 工程**，只读了源码；其默认参数在我们的 640×360 尺度下是否合适，需要按 §建议 2/5 的小样实测。
7. 我没有验证"Bayer 偏亮 bias 在 OpenLife 现有实现里是否已经发生" —— 需要按 §建议 6 先修好整数倍缩放，再做原生尺寸目检，否则看不出真实偏色。
8. **§2.2 表 E 的明暗测量用饱和度筛"植被"**，会把树冠覆盖的草地算进来，所以"明度范围 62–137"这类绝对数值只能横比、不能当阈值直接用；"亮半区占比"这个**相对**指标受影响更小，但仍建议改完后用同一脚本复测同区域。
9. 参考图是视频帧这一条**对表 E 同样成立**（重采样会压缩极值），所以表 E 我只用参考图做**趋势参照**（43.6% ≈ saint11 的一半），真正的目标值取自 v6 两个原生样本（53.5% / 74.4%）。
10. **我没有下载 `Vegetation3.gif` 复核** Part 3 的两条（`ADD SPECULAR POINTS ON EDGES`、`FADE FAR VEGETATION TOWARDS SKY COLOR`）。
11. 本报告**没有**给出"树冠具体该用哪几张叶簇模板 PNG" —— 那属于美术产出，需要按 §建议 2 的尺寸与规则（最小厚度 ≥2px、留 1px 缝、无孤立点）单独做小样，再按 `docs/design/PIXEL_ART_WORKFLOW.md` 的同镜头对照流程验收。
