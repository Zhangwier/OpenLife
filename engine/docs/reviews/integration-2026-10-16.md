# GitHub 分支整合记录 · 2026-10-16

基线：GitHub `main@035ff3bba03ce824424751fb86a902e270c3c877`（1–58 项补丁已在主分支）。以此为起点整合，保留最新玩法，不回退到旧 PR 的 fa064af 基线。采用一条整合提交，原分支尖端另建归档标签。

## 分支处置

| 来源 | 原始 tip | 处理与依据 |
| --- | --- | --- |
| PR #1 / feat/server-autosave | 5299c32 | 适配到当前已加固 HTTP 服务；加入串行写、防止坏档覆盖、独立测试开关与重启验证 |
| PR #5 / openlife-hark-structure-20261016 | a0902f7 | 合入工作区依赖、目录/层级守卫、文档整理和 barter/rules 拆分；冲突处保留新一般交换与社交规则 |
| PR #4 / openlife-hark-trial-barter | 963289d | 与 #5 的 barter.ts/rules.ts 无差异，是同一拆分的试验版本；以 #5 为准，不重复应用 |
| PR #3 / openlife-combined-35 | 373c894 | 已由 main 的 1–58 项版本接续：35 版与 main 的差异集中在更丰富人物、出身/家庭/季节/消息/生产及回滚修复；不把旧版覆盖回来 |
| openlife-combined | ed7eaa6 | 是既有 archive/openlife-combined-20261014 的祖先；此前已整理进 fa064af，保留归档后清理 |
| openlife-batch2 | 33f28c4 | 是当前 main 的祖先，已经合入 |

本次会给上述六个远端分支各建 `archive/integration-20261016/<branch>` 标签。源码整合采用 squash，旧 PR 关闭为已整合/被替代，不伪造其 GitHub merge 状态。是否已推送与关闭以 GitHub 实际状态为准。

## 整合时发现并修正

1. 新 main 的 `app.js` 出现两个同名 escapeHtml，ES module 解析失败；移除后补全浏览器 JS 语法门禁。
2. 新出身卡被人物卡 grid 放入头像列，手机文本成窄条；出身卡跨列，浏览器检查最小可读宽度。
3. 目录生成器用 URL.pathname 比对 Windows 路径，命令实际未执行；改用 fileURLToPath，并规范 CRLF 比对后重新生成目录。
4. 原 autosave 多次异步写共用临时文件；改成串行队列。损坏/不兼容文件先改名保存；读文件或保留失败时阻止覆盖。
5. 自动化服务器显式关闭持久化，专门的存档测试使用临时目录，避免多个测试或试玩进程读写同一存档。
6. 旧浏览器验收依赖已经删除的 SVG；改成默认文字模式实际触控流程。此脚本不证明 picture 模式完成。

## 验证

- `npm test`：529 tests，529 pass，0 fail，0 cancelled。
- `npm run catalog:check`：通过。
- `npm run demo`、`npm run demo:magic`：通过，两者相同 seed 重放一致。
- `node apps/web/dev-browser-smoke.mjs`：独立端口与 Edge 上下文；页面和 API 200、新建人生、真实触控移动、刷新继续；360/390/430/1280px 四个主页面不横向溢出，手机导航触控尺寸通过，未捕获异常为零。截图和 JSON 写入忽略目录 `artifacts/mobile-ui/`。
- 新增服务端存档集成：reset/load 后硬重启恢复一致、定时写入有效快照、坏 JSON 和未知包装版本保留后可开新世界。
- `git diff --check`：通过。

## 尚存边界

- Edge 手机尺寸模拟不替代 Android/iOS 真机验收；本次未证明真人长期趣味性、移动离线与 picture 资产完整性。
- 当前服务是一份共享世界，不是每用户独立存档。服务器定时保存默认五分钟，强杀只能恢复最近成功写入；Windows 强杀不能指望 SIGTERM 处理。
- 磁盘失败记录日志但不改变 API 游戏操作结果；界面可见失败状态与更完善迁移测试列入后续 SAVE-01。
- 本地通过不等于 GitHub Actions 已通过；远端 CI 状态单独核对。

后续实施依据：[手机优先开发规划](../plans/mobile-life-roadmap-2026-10-16.md)。
