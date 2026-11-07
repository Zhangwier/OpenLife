# OpenLife · 卡牌世界

Stacklands 式的卡牌人生样稿：卡牌放在一张自动生成的河谷地图上，时间自己流逝，村民按自己的日子过。

游戏直接进入拖牌世界，沿用当前地址下的浏览器 v1 存档。已迁入的玩法在牌桌上操作。

## 运行

卡牌世界支持 Node.js 18 或以上。运行旧引擎的独立开发工具和测试需要 Node.js 24。

```bash
npm start             # http://127.0.0.1:4173
```

换一张地图：`http://127.0.0.1:4173/?seed=3`。

启用引擎开发接口的本机实例也以牌桌为玩家入口。以前的 `/life/` 和 `/card-world/engine-life.html` 会回到牌桌。

## 目录

```text
apps/card-world/   样稿本体（页面、玩法、地图生成、地面绘制）
engine/            迁回的引擎核心、模块、内容与测试
server.mjs         本机启动入口
```

玩法、地图与美术约定见 [`apps/card-world/DESIGN.md`](apps/card-world/DESIGN.md) 和 [`apps/card-world/README.md`](apps/card-world/README.md)。

## 旧项目系统迁移

完整归档系统目录、迁移边界和分阶段验收见 [`docs/integration/README.md`](docs/integration/README.md)。
迁回的源码包含 11 个核心包、62 个不同模块 ID。实际激活和玩家入口覆盖分别记录。

拖牌世界由浏览器维护。NPC 关系、个体知识、需求驱动行动、库存条件对白和村民换物沿用 v1 存档。村民的换物决定使用迁入的饥饿、持有量、需要、熟悉程度及欠情规则，成交转移实际持有的卡牌。
运行 `npm test` 检查 CardWorld 与引擎接口，`npm run legacy:check` 核对迁移目录。引擎可用 `npm run engine:setup` 安装依赖，通过 `npm run engine:test`、`npm run engine:check` 和 `npm run engine:profiles` 验证。
