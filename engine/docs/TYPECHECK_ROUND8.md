# 第八轮：类型检查清零（2026-10-19）

基线：main@c2e3efb。

## 题目一：TypeScript 错误 251 → 0，CI 改为零错误门禁
- 目标：`tsc --noEmit` 全仓零错误；CI 不再按文件比对「不准增加」，任何错误都失败。
- 实现：
  - 55 处规则注册多写了 `kind`（运行时会覆盖掉），删除；
  - 规则的 resolve/react 标注返回 `Effect[]`；
  - 新增 `writeComponent()`（contracts），替代「kind 是联合类型的单个对象」这种写法；
  - 几个快照 interface 改为 type alias；
  - contracts 里 `ClockProfile.units`、`RelationDefinition.allowedFrom/To` 改成 readonly；
  - 注册表 `register()` 的参数不再要求带 owner（owner 由注册的模块给定）；
  - world-geography 里合并残留的重复声明删除；
  - `scripts/typecheck.ts` 改为零错误门禁：tsc 没报出错误但异常退出也算失败；删除基线文件和 `typecheck:update`。
- 验证：`npm run typecheck` → `typecheck: 0 errors`；`tests/unit/typecheck-ratchet.test.ts`。

## 题目二：类型错误背后的真问题
| 问题 | 后果 | 修复 |
|---|---|---|
| kernel.ts 只用 `import type` 引入 `DefinitionSet`，却拿它当值来 `new` | 不传 definitions 时 `new Kernel()` 抛 ReferenceError | 改为值导入 |
| world-space `blockingReason` 用了没有导入的 `PracticeComponents` | 只要存在任何手艺实践，进入/离开地点都会抛 ReferenceError，直接冲出 dispatch | 改用组件 id 字符串 |
| map-pack 摘要投影用了没有导入的 `GeographyRelations` | `map-pack.summary` 投影一调用就抛错 | 补上导入 |
| `readObject` 没读 `loanPolicy` | 井边公用的罐子在网页上被显示成「别人的私有物品」，按钮是灰的 | 读出来，并在类型里补上这个字段 |
| `regionSnapshot` 没读 `neighboringRegionInfluenceCount` | 读回来的快照少一个字段 | 补读，默认 0 |
| intellectual-history 的关系数据平铺着写 | 和契约「按组件 id 分组」的约定不一致（目前没有地方读这些数据） | 按关系 id 分组 |
| people / village-news 测试读结果里的 `events`（这个字段不存在） | 送礼台词从来没被检查；对话测试靠兜底分支才过 | 按 `eventIds` 去事件日志里取，并加上真正的断言 |
| npc-social 测试的失败信息读的是 `loaded.errors` | 失败时提示信息永远是 undefined | 改读 `loaded.result.errors` |

- 验证：新增 `tests/unit/latent-crashes.test.ts`（4 个测试）。基线代码下，罐子、地图摘要两个测试已确认失败，不传 definitions 建 Kernel 也确认会抛 ReferenceError；手艺实践那一条在基线上会直接抛 ReferenceError。修复后全部通过。
