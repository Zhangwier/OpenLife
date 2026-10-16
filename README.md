# OpenLife · 开放人生

模块化人生模拟平台（Kernel Prototype v0.1）。

OpenLife 是一个具有持续世界历史、人物认知、家族传承、可学习决策行为、模块化规则和多时间线能力的人生模拟平台。核心问题不是“这一局拿了多少分”，而是“我这一生留下了什么”。

完整设计见 [`需求书.txt`](./需求书.txt)。

## 快速开始

需要 Node.js ≥ 24（原生运行 TypeScript，无需编译）。

```bash
npm install        # 必须先装：链接 workspace 内的 @openlife/* 包
npm test           # 运行全部单元测试
npm run demo       # 现代世界脚本演示
npm run demo:magic # 魔法测试世界演示（验证 Core 不绑定世界观）
npm run cli        # 交互式调试控制台
npm run web        # Web 客户端 http://127.0.0.1:4173 （PORT 可改端口；默认只监听本机，HOST=0.0.0.0 可让局域网设备访问）
```

> 不先 `npm install` 直接跑测试，会报 `Cannot find package '@openlife/kernel'`。

调试控制台还支持：

```bash
node apps/debug-console/main.ts demo modern-world --seed 42
node apps/debug-console/main.ts script <file>   # 逐行执行命令文件
```

命令语法：`<command.type> [key=value ...]`，例如 `education.enroll_school`。

## 目录结构

```text
packages/            引擎核心（不含任何具体世界观）
  contracts/         Entity / Command / Effect / Event / Knowledge 等通用契约
  kernel/            事务、事件日志、调度器、确定性 RNG
  rule-engine/       规则求值与 Modifier 管线
  world-model/       实体-组件-关系存储与只读视图
  query/             面向观察者的 Projection
  history-runtime/   历史记录与血脉
  save-system/       存档 / 读档
  module-runtime/    模块加载、依赖（semver）、Capability 注册
  autonomy-runtime/  AutoSim 与决策提供者
  simulation/        把以上组装成可运行的模拟
  life-contracts/    人生类模块共享的契约（教育、经济、现代世界）
modules/             World / System / Content Pack
  modern-world/      现代世界（含夏纪年历）
  modern-science/    现代科学知识包
  education/ career/ family/ economy/ basic-autonomy/
  magic-test-world/  魔法世界，用于验证 Core 的世界观中立
apps/
  debug-console/     CLI 与脚本化演示
  web/               简易 Web 客户端
tests/unit/          单元测试（node --test）
```

## 架构不变量

所有改动必须遵守以下不变量（详见需求书 §4）：

| 编号 | 不变量 |
| --- | --- |
| INV-001 | 世界状态只能通过事务修改：Command → Validation → Rule → Effects → Transaction → Events |
| INV-002 | 玩家、UI、AI、AutoSim、网络、Module 等一切外部输入都转换为 Command |
| INV-003 | AI 不拥有世界状态，只能提出 Command |
| INV-004 | 相同 State + Command + Seed + Rules + 模块版本 → 相同结果；随机数只来自统一 RNG |
| INV-005 | Fact ≠ Observation ≠ Knowledge ≠ Memory ≠ Belief |
| INV-006 | 实体可以消失，重要历史记录不能消失 |
| INV-007 | Module 不能绕过事务、修改他人私有数据或自带第二套真相 / RNG |
| INV-008 | 个人 Life Clock 与公共 World Clock 逻辑分离 |

## 编写模块

每个模块是 `modules/<name>/` 下的一个 workspace 包，导出一个 `OpenLifeModule`（见 `packages/contracts/src/module.ts`）。约定：

- 所有 id 必须带命名空间（如 `education.enroll_school`）；
- 只能通过规则产出 Effect 来改变世界，不能直接写 store；
- 随机数只能使用规则上下文提供的 RNG；
- 可参考 `modules/education` 作为最小完整示例。

## 测试与 CI

`npm test` 运行 `tests/unit/` 下全部测试，其中 `determinism.test.ts` 保证可复现性。每次 push 到 `main` 和每个 Pull Request 都会在 GitHub Actions 上运行测试和两个演示。
