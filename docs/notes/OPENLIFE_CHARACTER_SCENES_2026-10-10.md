# OpenLife · 组合人物与场景实物交互（2026-10-10）

## 已实现

1. **稳定人物外观生成**：`apps/web/public/character-appearance.js` 将角色 ID 确定性映射到 5 种头型、5 种眼睛、5 种嘴型、6 种发型、4 种身体、4 种手臂姿势与多种肤色/布料配色。职业影响服装色/围裙；同一人物换地点、刷新或读取同一档都维持外观。此为美术呈现层，不新增世界身份字段。
2. **有形物品热点**：`apps/web/public/scene-props.js` 包含储水坑、陶罐、陶釜、柴捆、芦苇、粮食、河水、黏土、粮篮、石制工具、陶窑、灶台等原创 SVG 小插画。人物、物件、资源由 `state.settlement` 真实可见对象生成；资源为 0 不生成采集热点，物件从场景移走后消失。物品的实际数量/容量/容纳数量投影给表现层；悬停、键盘聚焦或选中时才出现标签，图形先于文字。
3. **全部八个地点独立背景**：`apps/web/public/art/` 新增 `scene-river.svg`、`scene-kiln.svg`、`scene-claypits.svg`、`scene-ford.svg`，配合庭院、公灶、芦苇滩、农田共 8 张不同 SVG 背景。
4. **权威操作**：场景上的 `data-object`/`data-yield` 仍绑定旧选择机制，不绕过 Command/Constraint/Transaction。固定设施不能「拾起」；储水坑点击显示位置上的实际水源命令，陶釜点击可查看现有烹饪/饮食操作，资源储量会决定视觉丰度。禁用操作保留原因供玩家理解。
5. **响应式与无障碍**：390px 视口无横向溢出；SVG 装饰图 `aria-hidden`，有真正的 HTML button 可通过键盘聚焦；运动减少偏好被尊重。

## 验证

- `node --test --test-reporter=spec`：399 / 399 PASS。
- `node apps/web/dev-browser-smoke.mjs`：PASS。检查八张场景加载、角色模块化外观 DOM、绘制物件按钮、从庭院→公灶→河岸的真实地点移动、储水坑点击给出水相关真实命令而不显示「拾起储水坑」、390px 无溢出。
- `git diff --check`：仅有 Windows 工作树 CRLF 转换提示，无 diff 空白错误。
- 截图位于 `artifacts/ux-1280px-settlement.png`、`artifacts/ux-1280px-hearth.png`、`artifacts/ux-1280px-river.png`、`artifacts/ux-390px-scene.png`、`artifacts/ux-390px-hearth.png` 等。

## 有意保留的设计边界

- `储水坑` 的可见容量依据真实物件数量；目前「河边取水」取的是河流资源池，并不会扣减储水坑物件的存水量。对象点击是合法的现场水源上下文，但不等于已增加一条从储水坑直接取水的独立 Command。下一阶段需开发新的库存流转动作，而非伪称已联动。
- SVG 是第一阶段原创二维美术，尚未有完整逐帧动画、物件真实物理坐标、自动寻路与碰撞；场景锚点是视觉布局，不作为物件的权威物理位置。
- 旧存档保持不迁移、不重写；尚须实际使用不同存档和 Android 真机做长时间试玩。
- 工程未自行 commit / push。
