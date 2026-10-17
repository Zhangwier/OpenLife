# 内容填充清单（2026-10-16）

## 新物品与配方
- `modules/settlement-locations/data/river-terrace.json`：新增 9 个物品原型（鱼干、粟饼、陶纺轮、陶埙、骨鱼钩、麻布、苇帘、盐块、草药束），各带材质、重量、容量、耐久、用途标签；新增 8 个资源名称；新增 10 个初始实例分给 6 位居民。
- `modules/settlement-locations/data/river-terrace-recipes.json`：8 个做法（晾鱼干、烙粟饼、烧陶纺轮、烧陶埙、磨骨鱼钩、纺麻织布、编苇帘、扎药草），写明地点/空间、消耗材料、所需工具、产出。
- `src/content.ts`：`RecipeSpec` / `validateRecipeBook` / `RIVER_TERRACE_RECIPES`，加载时校验所有引用。
- `src/crafting.ts`：通用命令 `settlement-locations.craft`，按配方数据在同一事务里消耗材料、保留工具、生成归属制作者的新物品；消耗 2 格活动。
- `src/module.ts`：粟饼（解饿 4）、鱼干（解饿 3）可以吃。
- 测试：`tests/unit/settlement-crafting.test.ts`。

## 新地图区域
- `packs/xia_south_hills_v0_1/`：南丘与盐泉，3 个区域、12 个地点（坡、脊、洞、竹林、溪滩、谷底、瀑潭、盐泉、盐滩、台地、垭口）、12 条带地形难度的连接、2 个边界锚点（北接夏境南部陆路走廊，南留垭口）。
- `map/event_points.yaml`：10 个事件点（地标 / 采集 / 相遇 / 险情 / 征兆 / 节庆，带季节）。
- `modules/map-pack`：加载器支持可选的 `map/event_points.yaml` 并校验；没有该文件的旧包内容完全不变。
- 测试：`tests/unit/map-pack-south-hills.test.ts`（含与夏境拼接）。

## 世界观设定
- `modules/settlement-locations/data/river-terrace-lore.json`（游戏内读取）与 `docs/lore/world-setting.md`（阅读版）：6 节。

## 背景音乐
- `apps/web/public/audio/*.ogg`：3 首，由 `tools/bgm/synth_bgm.py` 合成，详见该目录 README。

## 角色立绘
- `apps/web/public/art/portraits/*.jpg`：14 位居民全部覆盖，详见该目录 README。

## UI 文案与界面
- 新页面「图鉴」（`public/codex.js`、`codex.css`，服务端 `src/codex.ts` + `GET /api/codex`）：做法（可直接动手做）、物品属性表、人物立绘、世界观、音乐试听。
- 顶栏 ♪ 背景音乐开关（记住上次选曲）。
- 地图页：显示南丘包、事件点列表；地形类型从英文代码改为中文名称（覆盖三个地图包全部 49 种类型）。
- 制作成功提示文案；静态服务补上 jpg/png/ogg 的 MIME 类型。
