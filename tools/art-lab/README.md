当前候选：v8。直接打开 scene.html，点击道路或草地行走；点击花草采摘。右上角“⋯”展开检查/摆放工具。认可基线仍为 v6。最新变更见 [v8 交接](../../docs/notes/OPENLIFE_ART_V8_HANDOFF_2026-10-25.md)。

# 林缘庭院可复现样例

当前候选：v7。用户已认可的视觉基线：v6（`baseline/accepted-v6.png`）。本轮保留该版的构图、色彩和源素材，增加动作、遮挡与反馈。这个目录是独立工具，不由正式 Web 页面加载。

## 新检出目录怎样运行

从 OpenLife 仓库根目录执行：

```powershell
python tools/art-lab/prepare.py
node --test tools/art-lab/motion.test.mjs
node tools/art-lab/check.mjs
python scripts/art/check_pixel_grid.py --native tools/art-lab/output/scene-native.png --scaled tools/art-lab/output/scene.png --scale 2 --report tools/art-lab/output/pixel-grid-check.json
```

然后打开本目录的 `scene.html`。准备脚本和像素检查脚本仅用 Python 标准库；浏览器检查使用 Node 和已安装的 Chromium 浏览器。自动检测本机 Edge/Chrome/Chromium；其他安装位置可设置 `ART_BROWSER` 为浏览器可执行文件路径。

本目录单独复制到项目外也能运行：在目录内执行 `python prepare.py`、`node --test motion.test.mjs`、`node check.mjs`，再双击 `scene.html`。像素检查脚本位于仓库 `scripts/art/`。

`assets.js` 和 `output/` 是生成文件，已在本目录 `.gitignore` 中排除。源 PNG、清单、代码和认可基线保留，另一位协作者可从它们重建，不依赖个人临时目录或图像 API。

准备脚本也会核对认可基线的哈希。`--refresh-hashes` 只用于源素材，不能用它覆盖旧基线；新的视觉方向作为候选另存，保留用户反馈后再提升版本。

## 画面与操作

- v6 的布局、地面、树形与配色保留，默认全景 768×432、整数倍显示。
- 人物新增四帧行走循环，帧随移动距离切换，停止后回到站姿；向左采用镜像。它是单朝向循环的演示，尚非完整四向动作集。
- 点道路会沿道路网格转弯；连续位置只用于运动计算，绘制仍为整像素。该路径模型不包含正式游戏的权限和物件碰撞。
- 人物进入树冠遮挡区时，树冠约 180ms 内局部淡出，树干下段保留；可用“树冠避让”开关对比。
- 点花草选择，再采摘/割草；仅对应物件消失，出现短提示与少量碎屑，本页计数更新。
- “摆放”默认关闭；开启后可拖动物件。Shift＋点道路可忽略树冠点击，演示走到遮挡处；Escape 取消走动或选中。
- 素材和布局参数集中在 `asset-manifest.json`；修改源图后先审查，再用 `python prepare.py --refresh-hashes` 登记新哈希。

本页的库存、采集、走路与淡出都只是视觉/交互小样。没有访问 OpenLife API、用户存档或正式服务，也没有交付 NPC、权威库存、成长、完整碰撞与保存。

## 文件职责

| 文件/目录 | 用途 |
| --- | --- |
| `baseline/` | 用户认可的 v6 画面、原生图、原始参考及未采用的 v5 对照 |
| `sources/` | 12 张源 PNG，保留未覆盖原件 |
| `asset-manifest.json` | 来源哈希、裁切、原生尺寸、透明阈值、局部调色、布局、动画帧和截图条件 |
| `prepare.py` | 校验源图并生成本地预览所需的数据包，解决 file URL 的 Canvas 跨源问题 |
| `motion.js` | 只用于小样的道路网格路径与帧率独立运动 |
| `renderer.js` | 原生画布、整数绘制、固定 ID 风动、遮挡与采摘反馈 |
| `motion.test.mjs` | 道路转弯、断路、不同帧率到达同一点的行为检查 |
| `check.mjs` | 独立浏览器操作、截图、行走帧与避让检查 |
| `output/` | 当前运行的图片和报告；不是认可基线 |

## 交接边界

v7 已执行的检查见 `output/check.json` 和 `output/pixel-grid-check.json`。四张动作缓存不同且脚底基线一致，采摘邻近植物后树的动画相位保持稳定；浏览器检查覆盖选人/物、采摘、沿路移动、四帧切换、树冠淡出、恢复、近景和小屏宽度。

像素检查对同一静止时刻的原生图和实际截图逐块比较。捕获使用固定视口且不在截图时扩大页面；画布的屏幕位置也按设备像素对齐，以免滚动条触发半像素居中和重采样。通过这些检查只说明对应技术和操作成立，不能替代画风或真机体验验收。

后续优先项：完整四方向动作、原生像素下的脸手与枝叶精修、正式权威地图投影和行动接入。把这些列为待办，不把当前样例写成正式游戏已经完成。
