/**
 * 「这一生」人物卡增强（character-ux.js）守卫：空状态词判定、念想拆分、人生线读屏说明、接线与样式令牌。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEmptyWord, splitWish, lifeLineLabel } from "../../apps/web/public/character-ux.js";

const pub = (f: string) => readFileSync(new URL(`../../apps/web/public/${f}`, import.meta.url), "utf8");

test("还空着的状态词被认出来，已有的不算", () => {
  for (const s of ["尚未承担聚落角色", "尚未建立家庭", "还没有", " 暂无 "]) assert.equal(isEmptyWord(s), true, s);
  for (const s of ["正在成长", "陶工学徒", "", null, undefined]) assert.equal(isEmptyWord(s), false, String(s));
});

test("念想拆成标签和句子，不是这个格式就不动", () => {
  assert.deepEqual(splitWish("心里的念想：在自己照看的田里收一季粟"), { label: "念想", body: "在自己照看的田里收一季粟" });
  assert.deepEqual(splitWish("心里的念想:有口饭"), { label: "念想", body: "有口饭" });
  assert.equal(splitWish("别的句子"), null);
  assert.equal(splitWish("心里的念想："), null);
});

test("人生线读屏说明带「此刻」", () => {
  assert.match(lifeLineLabel("此刻 · 16 岁"), /此刻 · 16 岁/);
  assert.equal(lifeLineLabel(""), "人生进度");
});

test("接线：app.js 引入模块；样式只用字号阶梯与令牌色，不加阴影", () => {
  assert.match(pub("app.js"), /import "\/character-ux\.js";/);
  const css = pub("character-ux.css");
  assert.doesNotMatch(css, /box-shadow/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) assert.match(m[1] ?? "", /^var\(--fs-/, m[1]);
});
