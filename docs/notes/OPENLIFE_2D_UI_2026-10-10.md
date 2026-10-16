# OpenLife 游戏场景 UI 第一轮改造 · 2026-10-10

**状态**：本地未提交工作区版本；不改 NPC / 物品 / 时间权威状态和旧存档格式。

## 目标

使「周围」从以文字按钮为中心的管理页转向真正可互动的原创 2D 聚落画面，借鉴优质手绘游戏“画面优先、操作克制”的呈现逻辑，但美术素材均为 OpenLife 自行绘制的 SVG，不使用其他游戏受版权保护的具体美术元素或素材。

## 实施

- `apps/web/public/art/scene-hearth.svg`：公灶场景，炉台、灶火、柴草、住屋、山脉、草丛和暖光。
- `apps/web/public/art/scene-yard.svg`：陶家庭院、屋舍、陶罐、晾晒场和河岸。
- `apps/web/public/art/scene-reedbed.svg`：水面、芦苇、岸坡。
- `apps/web/public/art/scene-field.svg`：农田、耕沟、植物与远处棚屋。
- `apps/web/public/scene.css`：游戏 HUD、舞台、前后景光影、角色和交互热点、响应式手机版、低动态模式。首页、存档和其他功能页样式基本不动。
- `apps/web/public/index.html`：加入可变换场景的 `#sceneTheater`、背景层与 `#sceneHotspots`；原完整资料明细保留在可展开面板，而非删除。
- `apps/web/public/settlement.js`：用权威 `state.settlement` 的 `placeId`、`neighbours`、`objects`、`yields` 和 `exits` 渲染原生 DOM 交互热点。人物和物品按钮复用原 `data-person` / `data-object` / `data-yield` 的选择绑定；地点出口只有在现有 `s.actions` 授权时才发送 `onAction`。不虚构 NPC、库存或物品。
- `apps/web/server.ts`：正确以 `image/svg+xml` 返回素材（此前静态服务器只处理 CSS/JS/HTML）。
- `apps/web/dev-browser-smoke.mjs`：验证 4 张图片全部加载、舞台 NPC 热点可打开真实交谈、场景可经真实行走命令从庭院切换至公灶，桌面 1280px / 手机 390px 不溢出。

## 查看

项目根目录执行 `npm run web`，打开 `http://127.0.0.1:4173`（服务实际端口以终端输出为准）。新建或继续人生，然后进入「周围」：初始庭院画面，点人物打开对话，点右下角通路到公灶，再观察灶火、村民和实际 NPC 活动。

## 浏览器截图

- `artifacts/ux-390px-scene.png`：手机未选择任何交互时的实景。
- `artifacts/ux-390px-context.png`：手机选择人物的上下文操作。
- `artifacts/ux-390px-hearth.png`：手机公灶。
- `artifacts/ux-1280px-settlement.png`：桌面庭院。
- `artifacts/ux-1280px-hearth.png`：桌面公灶。

## 尚未实现

- 当前是原创 SVG 画面原型，并非《丝之歌》级的逐帧手绘插画或动画。人物目前以单幅插画加轻量 CSS 微动呈现；并没有真正的可自由移动、碰撞、寻路的精灵系统。
- 未接入完整 Canvas / PixiJS 场景引擎，也未制作每一张完整地图的独立高分辨率美术资源；其他未知地点暂时使用庭院画面兜底。
- 画面物品按“此地可见”的权威投影创建点击入口，不代表实现坐标级物理物品摆放。下一阶段可新增映射表并结合场景物品坐标，而不改变物品所有权与活动规则。
- 自动浏览器测试不是 30–60 分钟真人试玩，手机是真实 Edge 的设备模拟视口而非 Android 真机。

## 后续方向

先根据真人试玩反馈完善新手移动、NPC 选择反馈与资源热点；然后优先完善田地、芦苇滩场景与人物姿态帧。只有当前 DOM 热点方案遇到性能/坐标控制瓶颈后，再考虑 PixiJS 或 Canvas 渲染，并保持游戏状态层独立。
