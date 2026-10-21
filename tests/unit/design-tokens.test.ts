/**
 * 设计令牌守卫：把 `npm run design:check` 的判定接进 `npm test`。
 *
 * 这条规矩原来只挂在 npm script 上，没有任何测试引用，于是六轮界面合并
 * 攒下 33 处字号野值和硬编码色而全量测试一直是绿的。检查和命令现在共用
 * designFindings()，样式再漂移当场变红。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { designFindings, FONT_LADDER } from "../../scripts/design-check.ts";

const PUBLIC = fileURLToPath(new URL("../../apps/web/public", import.meta.url));

test("样式里的字号全部落在设计阶梯内", () => {
  const { findings } = designFindings(PUBLIC);
  const sizes = findings.filter((f) => f.rule === "字号不在阶梯内");
  assert.deepEqual(sizes.map((f) => `${f.file}:${f.line} ${f.detail}`), [],
    "野字号要么换成 var(--fs-*)，要么先改规范里的阶梯");
});

test("theme.css 与 stage.css 之外没有写死的十六进制颜色", () => {
  const { findings } = designFindings(PUBLIC);
  const colors = findings.filter((f) => f.rule === "硬编码颜色");
  assert.deepEqual(colors.map((f) => `${f.file}:${f.line} ${f.detail}`), [],
    "色值属于 theme.css 的令牌层；别的样式表只许引用令牌");
});

test("阶梯本身仍是十档，且都还能在样式里找到用处", () => {
  assert.deepEqual([...FONT_LADDER].sort((a, b) => a - b), [12, 13, 14, 16, 17, 20, 24, 28, 32, 44]);
  const { sizes } = designFindings(PUBLIC);
  // 十档里有几档是给插画标题留的（32/44），所以只要求「大部分档位真的在用」。
  const used = [...FONT_LADDER].filter((size) => sizes.has(size));
  assert.ok(used.length >= 8, `阶梯里有 ${used.length} 档在用，看起来样式已经绕开令牌了`);
});
