# content-packs/

把内容包目录放在这里就会被河岸聚落自动加载（按 id 排序）。规范见 `docs/PLUGINS.md` 第 3 节，
示例见 `docs/examples/content-packs/reed_baskets/`。

- 临时关掉某个包：`OPENLIFE_DISABLE_PACKS=reed_baskets`
- 换一个包目录：`OPENLIFE_CONTENT_PACKS=/path/to/packs`
- 加载失败会在启动时列出所有问题，不会悄悄跳过。
