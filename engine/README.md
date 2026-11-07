# OpenLife 引擎版（已封存）

2026-11-02 从 `D:\MG\program\OpenLife` 整体移出。仓库里只保留了卡牌世界 `apps/card-world`，这里是被封存的引擎版：文字人生 Web 客户端（`apps/web`）、调试控制台、`packages`、`modules`、`tests`、`docs`、`packs`、`tools` 等。

## 怎么找回来

原仓库的 git 历史仍在 `OpenLife\.git`：

- `1636502` — 归档前的完整快照（含当时未提交的改动）
- `5644104` — 归档提交（删掉这些目录，加入静态服务）

```
cd D:\MG\program\OpenLife
git show 1636502:apps/web/server.ts        # 看单个文件
git worktree add ..\openlife-old 1636502   # 整份检出到旁边
```

运行方式（归档时的版本）：Node ≥ 24，`npm install` 后 `npm run web`（4173）。
