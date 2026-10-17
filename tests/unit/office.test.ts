/**
 * 职位：求票 → 当选 → 断第一桩争执。
 *
 * 这是开发文档 B8 的验收标准，也是"好不好玩"的最小验证。测的是**整条链路**，
 * 因为单看任何一步都发现不了问题：能参选但选不上、能当选但没事情可断，
 * 都会让这一步变成空壳。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands } from "@openlife/module-settlement-locations";
import {
  officeModule, OfficeCommands, OfficeProjections, OFFICES,
  visitTone, giftMultiplier, giftWearsThin, tallyVotes, GIFT_TIERS,
  MATTERS, availableOptions, LIVE_FACILITIES, matterById,
} from "@openlife/module-office";

function village(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, officeModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  const act = (type: string, payload: Record<string, unknown> = {}) =>
    sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}

/**
 * A life old enough to hold office.
 *
 * A character is born at age 0 and ages one year at a time, so standing for
 * headman is something you can only do after living in the village a while.
 * That is the real rule, not a test inconvenience -- so the test grows up
 * rather than loosening `canStand`.
 */
function grownVillage(seed = 5, years = 18) {
  const made = village(seed);
  made.sim.advanceBy(years * 360);
  return made;
}

test("职位是数据，四个位子各有产生方式", () => {
  assert.ok(OFFICES.length >= 4);
  for (const office of OFFICES) {
    assert.ok(office.id.startsWith("office:"), office.id);
    assert.ok(office.label, office.id);
    assert.ok(["acclaim", "vote", "hereditary", "appointed"].includes(office.how), office.id);
    assert.ok(office.matters.length > 0, `${office.id} 有事可管`);
  }
});

test("礼物三档按需求书定倍率，未打标签的按体面算", () => {
  assert.equal(giftMultiplier(["gift:common"]), 0.7);
  assert.equal(giftMultiplier(["gift:fine"]), 1.0);
  assert.equal(giftMultiplier(["gift:precious"]), 1.5);
  assert.equal(giftMultiplier([]), 1.0, "没有标签就是普通礼物");
  assert.equal(Object.keys(GIFT_TIERS).length, 3);
});

test("三十天内反复送同一个人会招人烦", () => {
  const today = 100;
  assert.equal(giftWearsThin([], today), false, "头一回不算");
  assert.equal(giftWearsThin([95], today), false, "第二回还不算");
  assert.equal(giftWearsThin([95, 80], today), true, "第三回就烦了");
  assert.equal(giftWearsThin([10, 20], today), false, "三十天前的不算");
});

test("求票的语气由交情与旧怨决定，不看随机", () => {
  const base = { id: "x", hearts: 0, leaning: null, grudge: false, kin: false };
  assert.equal(visitTone({ ...base, hearts: 8 }, "me"), "warm");
  assert.equal(visitTone({ ...base, hearts: 4 }, "me"), "cool");
  assert.equal(visitTone({ ...base, hearts: 1 }, "me"), "annoyed");
  assert.equal(visitTone({ ...base, hearts: 9, grudge: true }, "me"), "annoyed", "有旧怨，交情再深也没好脸");
  assert.equal(visitTone({ ...base, kin: true }, "me"), "warm", "亲戚不问交情");
  assert.equal(visitTone({ ...base, leaning: "me", hearts: 0 }, "me"), "warm", "已经站你这边了");
});

test("计票：票多者胜，平票按交情，再平按 id", () => {
  const race = {
    officeId: "office:headman", candidates: ["a", "b"], leanings: {}, rounds: {},
    votes: { v1: "a", v2: "b", v3: "a" }, openedAt: 0, closesAt: 30,
  };
  assert.equal(tallyVotes(race, () => 0).winner, "a");
  const tied = { ...race, votes: { v1: "a", v2: "b" } };
  assert.equal(tallyVotes(tied, (id) => (id === "b" ? 8 : 2)).winner, "b", "平票看交情");
  assert.equal(tallyVotes(tied, () => 0).winner, "a", "全平按 id 稳定");
});

test("每桩事都有两个以上做法，且至少一个需要设施", () => {
  assert.ok(MATTERS.length >= 4, `至少四桩事，实际 ${MATTERS.length}`);
  for (const matter of MATTERS) {
    assert.ok(matter.options.length >= 2, `${matter.id} 至少两个做法`);
    const gated = matter.options.filter((o) => o.needsFacility);
    assert.ok(gated.length >= 1, `${matter.id} 至少一个做法要靠设施解锁`);
    for (const option of matter.options) {
      const e = option.effects;
      const changes = (e.settle ?? 0) !== 0 || (e.standing ?? 0) !== 0 || (e.grain ?? 0) !== 0 || e.setsFlag;
      assert.ok(changes, `${matter.id}/${option.id} 要真的改变什么`);
    }
  }
});

test("没有设施时，靠设施的选项灰着并说明差什么", () => {
  const dispute = matterById("matter:dispute")!;
  const bare = availableOptions(dispute, new Set(), new Set());
  const boundary = bare.find((a) => a.option.id === "boundary")!;
  assert.equal(boundary.available, false);
  assert.match(boundary.why, /界石/);

  const withStone = availableOptions(dispute, new Set(["facility:boundary-stone"]), new Set());
  assert.equal(withStone.find((a) => a.option.id === "boundary")!.available, true);
});

test("需求书列的五个设施都在表里", () => {
  assert.equal(LIVE_FACILITIES.length, 5);
  for (const f of LIVE_FACILITIES) {
    assert.ok(f.tag.startsWith("facility:"), f.tag);
    assert.ok(f.name && f.why, f.tag);
  }
});

test("完整链路：参选 → 拉票 → 当选 → 断一桩争执", { timeout: 60000 }, () => {
  const { sim, me, act } = grownVillage();

  // 1. 站出来
  const stand = act(OfficeCommands.stand, { officeId: "office:headman" });
  assert.equal(stand.ok, true, JSON.stringify(stand.errors));

  // 2. 拉票：拜访 + 许诺（用同村的人）
  const others = sim.worldView().listEntities({ kind: "modern.character" })
    .filter((e) => e.archivedAt === undefined && e.id !== me &&
      e.components["settlement-locations.resident"]).map((e) => e.id);
  assert.ok(others.length > 0, "村里有别人");
  assert.equal(act(OfficeCommands.visit, { targetId: others[0] }).ok, true);
  assert.equal(act(OfficeCommands.promise, { targetId: others[0], what: "修好你家屋顶" }).ok, true);

  // 3. 数票：让时间走过选举窗口，再跑一次年度结算
  const before = act(OfficeCommands.year);
  assert.equal(before.ok, true, JSON.stringify(before.errors));
  sim.advanceBy(200);
  const count = act(OfficeCommands.year);
  assert.equal(count.ok, true, JSON.stringify(count.errors));

  const panel = sim.project({ id: OfficeProjections.panel, params: {} });
  assert.equal(panel.ok, true, JSON.stringify(panel.errors));
  const data = panel.data as Record<string, unknown>;
  // 玩家是唯一的候选人，所以应当当选。
  assert.ok(data.holding, `应当当选，实际面板：${JSON.stringify(data)}`);
  assert.equal((data.holding as Record<string, string>).officeId, "office:headman");

  // 4. 断事：年度结算应当开出一桩事
  const again = act(OfficeCommands.year);
  assert.equal(again.ok, true);
  const panel2 = sim.project({ id: OfficeProjections.panel, params: {} });
  const data2 = panel2.data as Record<string, unknown>;
  const matter = data2.matter as Record<string, unknown> | null;
  assert.ok(matter, `当选后应当有要管的事，实际：${JSON.stringify(data2)}`);

  const options = matter.options as Array<{ id: string; available: boolean }>;
  const pick = options.find((o) => o.available)!;
  assert.ok(pick, "至少有一个可选做法");
  const decide = act(OfficeCommands.decide, { optionId: pick.id });
  assert.equal(decide.ok, true, JSON.stringify(decide.errors));

  // 5. 断完就没有待办的了
  const panel3 = sim.project({ id: OfficeProjections.panel, params: {} });
  assert.equal((panel3.data as Record<string, unknown>).matter, null, "断完了");
});

test("不在位子上不能断事", () => {
  const { act } = grownVillage();
  const r = act(OfficeCommands.decide, { optionId: "favor-a" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /没有|位子/);
});

test("没站出来就拉票会被拒", () => {
  const { sim, me, act } = grownVillage();
  const other = sim.worldView().listEntities({ kind: "modern.character" })
    .filter((e) => e.archivedAt === undefined && e.id !== me &&
      e.components["settlement-locations.resident"])[0]!;
  const r = act(OfficeCommands.visit, { targetId: other.id });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /站出来/);
});

test("职位面板不出现数字，只有一句人话", () => {
  const { sim } = village();
  const panel = sim.project({ id: OfficeProjections.panel, params: {} });
  const line = String((panel.data as Record<string, unknown>).line ?? "");
  assert.ok(line.length > 0, "有话说");
  assert.ok(!/\d/.test(line), `面板不该出现数字：${line}`);
});

test("registry 投影说清哪些设施还缺", () => {
  const { sim } = village();
  const reg = sim.project({ id: OfficeProjections.registry, params: {} });
  assert.equal(reg.ok, true);
  const data = reg.data as Record<string, unknown>;
  assert.ok(Array.isArray(data.offices));
  assert.ok(Array.isArray(data.missingFacilities));
  assert.equal((data.missingFacilities as unknown[]).length, 5, "新村子一个设施都没有");
});
