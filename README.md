# OpenLife · 卡牌世界

Stacklands 式的卡牌人生样稿：卡牌放在一张自动生成的河谷地图上，时间自己流逝，村民按自己的日子过。

独立的静态网页，**不连游戏引擎**，数据都是示意。原来的引擎版（文字人生、模块、测试）已封存到 `D:\MG\program\archives\openlife-engine-20261102\`，本仓库只保留这一份样稿。

## 运行

需要 Node.js ≥ 18。

```bash
npm start          # http://127.0.0.1:4173
PORT=4181 npm start  # 换端口
```

换一张地图：`http://127.0.0.1:4173/?seed=3`。

## 目录

```text
apps/card-world/   样稿本体（页面、玩法、地图生成、地面绘制）
server.mjs         把它挂在 / 上的静态服务，无依赖
```

玩法、地图与美术约定见 [`apps/card-world/DESIGN.md`](apps/card-world/DESIGN.md) 和 [`apps/card-world/README.md`](apps/card-world/README.md)。
