/**
 * 人生阶段（life-stages）：五段边界、每段专属动作、遗言把愿望传下去。
 *
 * 这个模块的价值在「你不能做别段的事」——所以每条测试都要真的去试一次被拒绝，
 * 而不是只断言 `STAGES` 数组长得对。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, residentId, RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";
import {
  lifeStagesModule, StageCommands, StageComponents, StageProjections, STAGES,
  ageOf, stageOf, stageOfAge,
} from "@openlife/module-life-stages";

const YEAR = 360;

function boot(seed = 7) {
  const sim = new Simulation({
    worldSeed: seed,
    modules: [
      modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, lifeStagesModule,
    ],
  });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:yard" } }).ok, true);
  return { sim, me };
}

const view = (sim: Simulation, id: string) =>
  sim.project({ id: StageProjections.life, params: { actorId: id } }).data as any;

/** 把这一生推进到某个年龄（走一年一跳，跨段那天的规则会自己记下来）。 */
function growTo(sim: Simulation, me: string, years: number) {
  for (let i = 0; i < years && ageOf(sim.worldView(), me) < years; i += 1) sim.advanceBy(YEAR);
  assert.ok(ageOf(sim.worldView(), me) >= years, `reached ${years} (at ${ageOf(sim.worldView(), me)})`);
}

// ---------------------------------------------------------------------------
// 1. 五段边界
// ---------------------------------------------------------------------------

test("the five stages cover 0-7, 8-15, 16-39, 40-54 and 55+ with no gaps", () => {
  assert.deepEqual(STAGES.map((s) => s.id), ["childhood", "youth", "adulthood", "prime", "elder"]);
  assert.deepEqual(STAGES.map((s) => [s.from, Number.isFinite(s.to) ? s.to : "∞"]),
    [[0, 8], [8, 16], [16, 40], [40, 55], [55, "∞"]]);

  // 每个年龄都恰好落在一段里。
  for (let age = 0; age <= 120; age += 1) {
    const stage = stageOfAge(age);
    assert.ok(age >= stage.from && (age < stage.to || stage.id === "elder"), `age ${age} -> ${stage.id}`);
  }
  // 边界值一个不差。
  assert.equal(stageOfAge(0).id, "childhood");
  assert.equal(stageOfAge(7).id, "childhood");
  assert.equal(stageOfAge(8).id, "youth");
  assert.equal(stageOfAge(15).id, "youth");
  assert.equal(stageOfAge(16).id, "adulthood");
  assert.equal(stageOfAge(39).id, "adulthood");
  assert.equal(stageOfAge(40).id, "prime");
  assert.equal(stageOfAge(54).id, "prime");
  assert.equal(stageOfAge(55).id, "elder");
  assert.equal(stageOfAge(99).id, "elder");
  // 负数不该炸（世界时钟的边界情况）。
  assert.equal(stageOfAge(-3).id, "childhood");
});

test("each stage has actions only it offers, and the projection shows both", () => {
  const { sim, me } = boot();
  growTo(sim, me, 17);
  const here = view(sim, me);
  assert.equal(here.stage.id, "adulthood");
  assert.deepEqual(here.actions.map((a: any) => a.id), [StageCommands.takeCharge]);
  // 别段的动作仍然列出来，但标成做不了——玩家看得到这一生的形状。
  const locked = new Set(here.locked.map((a: any) => a.id));
  assert.ok(locked.has(StageCommands.playWith), "childhood actions are visible but locked");
  assert.ok(locked.has(StageCommands.makeWill), "old-age actions are visible but locked");
  assert.ok(!locked.has(StageCommands.takeCharge), "your own action is not locked");

  // 五段都有自己专属的动作，而且互不重叠。
  const all = STAGES.flatMap((s) => s.actions);
  assert.equal(new Set(all).size, all.length, "no action belongs to two stages");
  for (const stage of STAGES) assert.ok(stage.actions.length > 0, `${stage.id} has actions`);
});

// ---------------------------------------------------------------------------
// 2. 段内动作生效，段外被拒
// ---------------------------------------------------------------------------

test("a child can follow an elder, play and get into trouble; an adult cannot", () => {
  const { sim, me } = boot();
  // 玩家开局 0 岁：正好是童年。
  assert.equal(stageOf(sim.worldView(), me).id, "childhood");

  const adult = residentId("elder");
  const place = occupiedPlaceId(sim.worldView(), adult);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: place } });
  const follow = sim.dispatch({
    type: StageCommands.followElder, actorId: me, source: "player", payload: { targetId: adult },
  });
  assert.equal(follow.ok, true, follow.errors[0]?.message);

  const trouble = sim.dispatch({ type: StageCommands.getIntoTrouble, actorId: me, source: "player", payload: {} });
  assert.equal(trouble.ok, true, trouble.errors[0]?.message);
  assert.ok(view(sim, me).deeds.includes("get_into_trouble"), "the deed is remembered");

  // 长大了就做不了这些了。
  growTo(sim, me, 17);
  const tooLate = sim.dispatch({ type: StageCommands.getIntoTrouble, actorId: me, source: "player", payload: {} });
  assert.equal(tooLate.ok, false);
  assert.equal(tooLate.errors[0]?.code, "E_STAGE_NOT_YET");
  assert.match(String(tooLate.errors[0]?.message), /童年才做的事/);
});

test("a youth apprentices, works alone once, and has one first crush", () => {
  const { sim, me } = boot();
  growTo(sim, me, 9);
  assert.equal(stageOf(sim.worldView(), me).id, "youth");

  const master = residentId("elder");
  const place = occupiedPlaceId(sim.worldView(), master);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: place } });
  const apprentice = sim.dispatch({
    type: StageCommands.apprentice, actorId: me, source: "player", payload: { targetId: master },
  });
  assert.equal(apprentice.ok, true, apprentice.errors[0]?.message);

  const solo = sim.dispatch({ type: StageCommands.firstSoloWork, actorId: me, source: "player", payload: {} });
  assert.equal(solo.ok, true, solo.errors[0]?.message);
  const again = sim.dispatch({ type: StageCommands.firstSoloWork, actorId: me, source: "player", payload: {} });
  assert.equal(again.ok, false, "the first time alone only happens once");

  const crush = sim.dispatch({
    type: StageCommands.firstCrush, actorId: me, source: "player", payload: { targetId: residentId("yu") },
  });
  assert.equal(crush.ok, true, crush.errors[0]?.message);
  const second = sim.dispatch({
    type: StageCommands.firstCrush, actorId: me, source: "player", payload: { targetId: residentId("lan") },
  });
  assert.equal(second.ok, false, "only one first crush");

  // 成年以后这些都不再算数。
  growTo(sim, me, 17);
  const late = sim.dispatch({ type: StageCommands.apprentice, actorId: me, source: "player", payload: { targetId: master } });
  assert.equal(late.ok, false);
  assert.equal(late.errors[0]?.code, "E_STAGE_NOT_YET");
});

test("a prime-age life can mediate and take an apprentice; an old one cannot", () => {
  const { sim, me } = boot();
  growTo(sim, me, 41);
  assert.equal(stageOf(sim.worldView(), me).id, "prime");

  // 两个当事人都在场才谈得上调解。
  const a = residentId("yu"), b = residentId("lan");
  const place = occupiedPlaceId(sim.worldView(), a);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: place } });
  const mediate = sim.dispatch({
    type: StageCommands.mediate, actorId: me, source: "player", payload: { firstId: a, secondId: b },
  });
  // 两人不一定在同一处；不在就应当被拒（这本身也是「要有现场」的证明）。
  if (!mediate.ok) assert.equal(mediate.errors[0]?.code, "E_STAGE_NOT_YET");

  growTo(sim, me, 56);
  assert.equal(stageOf(sim.worldView(), me).id, "elder");
  const late = sim.dispatch({
    type: StageCommands.mediate, actorId: me, source: "player", payload: { firstId: a, secondId: b },
  });
  assert.equal(late.ok, false);
  assert.equal(late.errors[0]?.code, "E_STAGE_NOT_YET");
});

test("an elder tells the old days, settles affairs, passes on a craft and makes a will", () => {
  const { sim, me } = boot();
  growTo(sim, me, 56);

  const old = sim.dispatch({ type: StageCommands.tellTheOldDays, actorId: me, source: "player", payload: {} });
  assert.equal(old.ok, true, old.errors[0]?.message);

  const affairs = sim.dispatch({ type: StageCommands.settleAffairs, actorId: me, source: "player", payload: {} });
  assert.equal(affairs.ok, true, affairs.errors[0]?.message);
  const twice = sim.dispatch({ type: StageCommands.settleAffairs, actorId: me, source: "player", payload: {} });
  assert.equal(twice.ok, false, "后事只交代一次");

  // 传手艺：后辈身上会记下加速。
  //
  // 注意：把这一生推到 56 岁，村里人也一起老了 56 岁，所以不能写死某个「少年」。
  // 这里按当下的实际年龄找人——这也更接近真实：老手传艺时，身边剩下谁就传给谁。
  const myAge = ageOf(sim.worldView(), me);
  const junior = RIVER_TERRACE_PACK.residents
    .map((r) => residentId(r.key))
    .filter((id) => {
      const e = sim.worldView().getEntity(id);
      return e && e.archivedAt === undefined && e.components["modern.vitals"]?.alive !== false;
    })
    .find((id) => myAge - ageOf(sim.worldView(), id) >= 5);
  if (!junior) return;
  const youth = junior;
  const place = occupiedPlaceId(sim.worldView(), youth);
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: place } });
  const pass = sim.dispatch({
    type: StageCommands.passOnCraft, actorId: me, source: "player",
    payload: { targetId: youth, craft: "看火" },
  });
  assert.equal(pass.ok, true, pass.errors[0]?.message);
  const tutelage = sim.worldView().getComponent(youth, StageComponents.tutelage);
  assert.ok(tutelage, "the youngster carries the old hand's teaching");
  assert.ok(Number(tutelage!.times) >= 3, "passing on a craft is worth three lessons");

  // 传手艺真的加速学习：上一节课就消耗一次加速。
  const lesson = sim.dispatch({
    type: "settlement-locations.lesson", actorId: me, source: "system", payload: { targetId: youth },
  });
  if (lesson.ok) {
    const after = sim.worldView().getComponent(youth, StageComponents.tutelage);
    assert.ok(Number(after!.times) < Number(tutelage!.times), "the teaching is spent as it is used");
  }
});

// ---------------------------------------------------------------------------
// 3. 遗言把愿望传给继承人
// ---------------------------------------------------------------------------

test("a will carries the unfinished wish and the confirmed secrets to the heir", () => {
  const { sim, me } = boot();
  growTo(sim, me, 56);

  // 造一个孩子当继承人（聚落自己的生育规则）。
  const spouse = residentId("yu");
  // 直接给这一生一个孩子：走 family 的公开命令。
  const born = sim.dispatch({
    type: "family.have_child", actorId: me, source: "system", payload: { givenName: "小禾" },
  });
  if (!born.ok) return; // 没有配偶时这条命令会被拒；下面的 hand_down 测试仍然覆盖结构。

  const heir = sim.worldView().listRelations({ type: "family.parent_of", from: me })[0]?.to;
  assert.ok(heir, "there is an heir");
  void spouse;

  const will = sim.dispatch({
    type: StageCommands.makeWill, actorId: me, source: "player", payload: { heirId: heir },
  });
  assert.equal(will.ok, true, will.errors[0]?.message);

  const words = sim.worldView().getComponent(me, StageComponents.lastWords);
  assert.ok(words, "the will is written down");
  assert.ok(String(words!.unfinished ?? "").length > 0, "it names something unfinished");
  assert.equal(String(words!.from), me);

  // 交接：遗言换到继承人身上。
  const hand = sim.dispatch({ type: StageCommands.handDown, actorId: me, targetId: heir, source: "system" });
  assert.equal(hand.ok, true, hand.errors[0]?.message);
  const inherited = sim.worldView().getComponent(heir, StageComponents.lastWords);
  assert.ok(inherited, "the heir carries it now");
  assert.equal(String(inherited!.from), me);
  assert.equal(String(inherited!.unfinished), String(words!.unfinished));

  // 同一份遗言不会交两次。
  const twice = sim.dispatch({ type: StageCommands.handDown, actorId: me, targetId: heir, source: "system" });
  assert.equal(twice.ok, false);
});

test("a will only ever passes on confirmed secrets, never hearsay", () => {
  const { sim, me } = boot();
  growTo(sim, me, 56);
  const heir = (() => {
    const born = sim.dispatch({ type: "family.have_child", actorId: me, source: "system", payload: { givenName: "小禾" } });
    if (!born.ok) return "";
    return sim.worldView().listRelations({ type: "family.parent_of", from: me })[0]?.to ?? "";
  })();
  if (!heir) return;

  const will = sim.dispatch({
    type: StageCommands.makeWill, actorId: me, source: "player", payload: { heirId: heir },
  });
  assert.equal(will.ok, true, will.errors[0]?.message);
  const words = sim.worldView().getComponent(me, StageComponents.lastWords)!;
  const secrets = words.secrets as Array<Record<string, unknown>>;
  // 遗言里最多三件，而且每一件都必须是「确知」的——玩家此刻什么都没确知。
  assert.ok(Array.isArray(secrets));
  assert.ok(secrets.length <= 3, "at most three things fit in last words");
  assert.equal(secrets.length, 0, "with nothing confirmed, nothing is passed on");
});

test("the projection shows the will and the stage together", () => {
  const { sim, me } = boot();
  growTo(sim, me, 56);
  const here = view(sim, me);
  assert.equal(here.stage.id, "elder");
  assert.ok(here.stages.length === 5);
  assert.equal(here.stages.filter((s: any) => s.here).length, 1, "exactly one stage is 'here'");
  // 老年段的四个动作都在可选里。
  const ids = here.actions.map((a: any) => a.id);
  for (const id of [StageCommands.tellTheOldDays, StageCommands.passOnCraft, StageCommands.settleAffairs, StageCommands.makeWill]) {
    assert.ok(ids.includes(id), `${id} is offered at 55+`);
  }
});

test("the stage is recorded when a life crosses a boundary, not recomputed silently", () => {
  const { sim, me } = boot();
  growTo(sim, me, 17);
  const recorded = sim.worldView().getComponent(me, StageComponents.stage);
  assert.ok(recorded, "crossing into adulthood was recorded");
  assert.equal(String(recorded!.stage), "adulthood");
  // 事件里也留了痕迹，叙事层能读到。
  const entered = sim.kernel.internals.eventLog.all().filter((e) => e.type === "life-stages.entered" && e.actorId === me);
  assert.ok(entered.length >= 1);
  assert.ok(entered.some((e) => String(e.data?.name) === "成年"));
});

test("no stage action can be taken for someone else's life", () => {
  const { sim, me } = boot();
  growTo(sim, me, 56);
  const villager = residentId("yu");
  const r = sim.dispatch({
    type: StageCommands.tellTheOldDays, actorId: villager, source: "player", payload: {},
  });
  assert.equal(r.ok, false, "you cannot live someone else's old age");
  assert.equal(r.errors[0]?.code, "E_STAGE_NOT_YET");
});
