/**
 * 职位面板：界面规则的可测部分。
 *
 * 设计规范有三条硬规则，全是**能用测试守住**的：
 *  1. 不给玩家看数字（§3、§8）
 *  2. 不可选的选项要写明原因，不能只灰掉（§9）
 *  3. 口吻贴合时代，不说「选举」「投票」（§8）
 *
 * 这些不是审美偏好——违反了会让玩家看不懂自己在做什么，所以值得测。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { degree, daysLeft, renderOffice } from "../../apps/web/public/office-panel.js";

/** Strip tags so assertions are about words, not markup. */
const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("程度用文字表示，不出现百分比或分数", () => {
  assert.equal(degree(0), "没有");
  assert.equal(degree(0.1), "几乎没有");
  assert.equal(degree(0.3), "不多");
  assert.equal(degree(0.6), "一半");
  assert.equal(degree(0.9), "多");
  for (const v of [0, 0.1, 0.3, 0.6, 0.9, 1]) {
    assert.ok(!/\d/.test(degree(v)), `degree(${v}) 不该含数字：${degree(v)}`);
  }
});

test("剩余天数说成话，不报数字", () => {
  for (const d of [0, 1, 3, 9, 40]) {
    assert.ok(!/\d/.test(daysLeft(d)), `daysLeft(${d}) 不该含数字：${daysLeft(d)}`);
  }
  assert.equal(daysLeft(0), "就在今天");
  assert.equal(daysLeft(1), "还有一天");
});

test("空状态告诉玩家什么时候能站出来", () => {
  const html = renderOffice({ holding: null, race: null }, { missingFacilities: [] });
  const body = text(html);
  assert.match(body, /没有职位/);
  assert.match(body, /站出来/);
});

test("在位子上显示职位、民心一句话、和等着断的事", () => {
  const panel = {
    holding: { officeId: "office:headman", label: "头人" },
    standing: 2,
    matter: {
      id: "matter:dispute", title: "两家的地界",
      options: [
        { id: "favor-a", label: "按先占的那块算", available: true, why: "" },
        { id: "boundary", label: "立一块界石", available: false, why: "要有界石" },
      ],
    },
    pledges: [],
  };
  const body = text(renderOffice(panel, null));
  assert.match(body, /头人/);
  assert.match(body, /两家的地界/);
  assert.match(body, /按先占的那块算/);
  // 民心是一句话，不是数字
  assert.ok(!/\d/.test(body.replace(/界石/g, "")), `不该出现数字：${body}`);
});

test("不可选的选项仍然显示，并写明差什么", () => {
  const panel = {
    holding: { officeId: "office:headman", label: "头人" }, standing: 0,
    matter: {
      id: "matter:dispute", title: "两家的地界",
      options: [{ id: "boundary", label: "立一块界石", available: false, why: "要有界石" }],
    },
    pledges: [],
  };
  const html = renderOffice(panel, null);
  assert.match(html, /disabled/, "灰掉");
  assert.match(text(html), /要有界石/, "并说明原因——只灰掉玩家会以为是 bug");
});

test("在推举中显示还有几天和谁站你这边，不显示票数", () => {
  const panel = {
    holding: null,
    race: { officeId: "office:headman", label: "头人", candidates: 2, leaningToMe: 1, closesInDays: 5 },
    matter: null, pledges: [],
  };
  const body = text(renderOffice(panel, null));
  assert.match(body, /头人/);
  assert.match(body, /还有些日子/);
  assert.ok(!/\d/.test(body), `推举中不该出现数字：${body}`);
});

test("口吻贴合时代：不说选举、投票、数据", () => {
  const cases = [
    renderOffice({ holding: null, race: null }, null),
    renderOffice({ holding: { officeId: "office:headman", label: "头人" }, standing: 2, matter: null, pledges: [] }, null),
    renderOffice({ holding: null, race: { label: "头人", candidates: 2, leaningToMe: 0, closesInDays: 9 }, matter: null, pledges: [] }, null),
  ];
  for (const html of cases) {
    const body = text(html);
    for (const banned of ["选举", "投票", "数据", "好感度", "百分比"]) {
      assert.ok(!body.includes(banned), `不该出现「${banned}」：${body}`);
    }
  }
});

test("许诺过的话会显示出来，用当时的说法", () => {
  const panel = {
    holding: { officeId: "office:headman", label: "头人" }, standing: 1, matter: null,
    pledges: [{ to: "阿埴", what: "荒年开仓" }],
  };
  const body = text(renderOffice(panel, null));
  assert.match(body, /答应过阿埴/);
  assert.match(body, /荒年开仓/);
});

test("空状态会提示缺什么设施，让玩家知道能盖什么", () => {
  const html = renderOffice({ holding: null, race: null }, {
    missingFacilities: [{ tag: "facility:boundary-stone", name: "界石", why: "断地界时按界石说话，双方都服" }],
  });
  const body = text(html);
  assert.match(body, /界石/);
  assert.match(body, /双方都服/);
});
