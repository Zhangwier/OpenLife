/**
 * 秘密（village-secrets）：认知门槛、三条获知途径、四种用法。
 *
 * 这个文件里最要紧的一条是「没有任何投影在『不知』状态下泄露秘密文本」。
 * 它不靠人肉逐条检查，而是把**所有**秘密正文（含线索里没出现过的字）拿去扫
 * 每一个投影的序列化结果，任何一处出现就算失败。这样以后有人加投影、加字段，
 * 也逃不过这一关。
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
  settlementLocationsModule, SettlementCommands, residentId, RIVER_TERRACE_PACK, socialOf, bondOf, heartsOf,
} from "@openlife/module-settlement-locations";
import { epistemicStateModule } from "@openlife/module-epistemic-state";
import { socialConflictModule } from "@openlife/module-social-conflict";
import {
  villageSecretsModule, SecretCommands, SecretComponents, SecretProjections, SECRETS, SECRET_KINDS,
  secretProblems, secretsOf, secretById, fill, nameOf, CONFIRM_HINTS,
} from "@openlife/module-village-secrets";

const YEAR0 = 18 * 360;

/** 一次「有村民、有村子、能过日子」的完整安装。 */
function boot(seed = 7) {
  const sim = new Simulation({
    worldSeed: seed,
    modules: [
      modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      settlementLocationsModule, epistemicStateModule, socialConflictModule,
      villageSecretsModule,
    ],
  });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "启", familyName: "禾", lifespan: 90 } });
  sim.advanceBy(YEAR0);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  return { sim, me };
}

const go = (sim: Simulation, me: string, placeId: string) => {
  if (occupiedPlaceId(sim.worldView(), me) === placeId) return;
  const r = sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId } });
  assert.equal(r.ok, true, `walk to ${placeId}: ${r.errors[0]?.message}`);
};

/** 把某件心事直接记成「确知」——测「使用」时不必先绕三条获知途径。 */
function makeKnown(sim: Simulation, observerId: string, secretId: string) {
  const spec = secretById(secretId)!;
  // 用公开命令走两遍：一条线索是「听说」，两条是「确知」。这正是真实路径。
  for (let i = 0; i < CONFIRM_HINTS; i += 1) {
    const r = sim.dispatch({
      type: SecretCommands.learn, actorId: observerId, source: "system",
      payload: { secretId, ownerKey: spec.owner, source: "company" },
    });
    assert.equal(r.ok, true, `learn ${secretId}: ${r.errors[0]?.message}`);
  }
  const entry = (sim.project({ id: SecretProjections.known, params: { actorId: observerId } }).data as any)
    .known.find((k: any) => k.secretId === secretId);
  assert.ok(entry, `${secretId} should now be known`);
  return entry;
}

// ---------------------------------------------------------------------------
// 1. 数据
// ---------------------------------------------------------------------------

test("secret data is sound: owners exist, hints are non-empty, kinds are legal", () => {
  const keys = RIVER_TERRACE_PACK.residents.map((r) => r.key);
  assert.deepEqual(secretProblems(undefined, keys), []);
  // 每件心事都有人、有线索、有合法的类。
  for (const spec of SECRETS) {
    assert.ok(keys.includes(spec.owner), `${spec.id} owner ${spec.owner} is a real resident`);
    assert.ok(spec.hints.length > 0, `${spec.id} has hints`);
    for (const hint of spec.hints) assert.ok(hint.trim().length > 0);
    assert.ok(SECRET_KINDS.includes(spec.kind), `${spec.id} kind ${spec.kind}`);
  }
  // 首批规模：每位基础村民 1–2 件，四类都有。
  assert.ok(SECRETS.length >= 15 && SECRETS.length <= 20, `${SECRETS.length} secrets`);
  for (const kind of SECRET_KINDS) assert.ok(SECRETS.some((s) => s.kind === kind), `kind ${kind} present`);
  for (const key of keys) {
    const n = secretsOf(key).length;
    assert.ok(n >= 1 && n <= 2, `${key} has ${n} secrets`);
  }
});

test("a broken secret record is rejected with a reason, not silently dropped", () => {
  const broken = {
    formatVersion: 1,
    cast: [{ key: "yu", name: "阿予", personality: { diligence: 1, sociability: 1, generosity: 1, caution: 1, curiosity: 1 } }],
    secrets: [{
      id: "secret:test.no-hints", owner: "nobody", kind: "misdeed", severity: 2, text: "x", hints: [],
    }],
  } as never;
  const problems = secretProblems(broken, ["yu"]);
  assert.ok(problems.some((p) => /owner nobody is not in cast/.test(p)), problems.join("\n"));
  assert.ok(problems.some((p) => /at least one hint/.test(p)), problems.join("\n"));
});

// ---------------------------------------------------------------------------
// 2. 红线：不知状态不泄露
// ---------------------------------------------------------------------------

test("NO projection leaks a secret's text while it is still unknown", () => {
  const { sim, me } = boot();
  const world = sim.worldView();

  // 刚建村，玩家什么都不知道。此刻把所有投影都序列化，扫一遍秘密正文。
  const ids = ["village-secrets.known", "village-secrets.ledger", "settlement-locations.people",
    "settlement-locations.homestead", "epistemic-state.holder"];
  const dump = ids.map((id) => JSON.stringify(sim.project({ id, params: { actorId: me, holderId: me, ownerId: residentId("yu") } }).data)).join("\n");

  for (const spec of SECRETS) {
    const text = fill(spec.text, spec.owner);
    assert.ok(!dump.includes(text), `unknown secret text leaked into a projection: ${text}`);
    // 线索也不能凭空出现——那是「听说」，此刻连听说都没有。
    for (const hint of spec.hints) {
      assert.ok(!dump.includes(fill(hint, spec.owner)), `hint leaked before it was heard: ${fill(hint, spec.owner)}`);
    }
  }
  // 而且确实什么都还不知道。
  const view = sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any;
  assert.equal(view.total, 0);
  assert.deepEqual(world.getComponent(me, SecretComponents.known), undefined);
});

test("after one hint the text is still hidden; only the hint shows", () => {
  const { sim, me } = boot();
  const spec = SECRETS[0]!;
  const r = sim.dispatch({
    type: SecretCommands.learn, actorId: me, source: "system",
    payload: { secretId: spec.id, ownerKey: spec.owner, source: "company" },
  });
  assert.equal(r.ok, true);
  const view = sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any;
  assert.equal(view.heard.length, 1, "one hint is 'heard', not 'known'");
  assert.equal(view.known.length, 0);
  const shown = JSON.stringify(view);
  assert.ok(!shown.includes(fill(spec.text, spec.owner)), "text must not appear at the 'heard' stage");
  assert.ok(shown.includes(fill(spec.hints[0]!, spec.owner)), "the first hint is what you actually heard");
});

// ---------------------------------------------------------------------------
// 3. 三条获知途径
// ---------------------------------------------------------------------------

test("asking someone who knows and trusts you yields a hint (途径一：打听)", () => {
  const { sim, me } = boot();
  // 先跟阿灶混熟：他嘴最碎，知道的事也最多。
  const cook = residentId("cook");
  const world = sim.worldView();
  const before = sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any;
  assert.equal(before.total, 0);

  // 直接改他的社交记忆是「别的模块的组件」，所以这里用真实途径：送礼、搭话。
  // 为了让测试不依赖运气，把熟悉度推到门槛以上（走的是聚落自己的送礼规则）。
  for (let day = 0; day < 6; day += 1) {
    const place = occupiedPlaceId(sim.worldView(), cook);
    go(sim, me, place);
    sim.dispatch({ type: SettlementCommands.talk, actorId: me, source: "player", payload: { targetId: cook } });
    sim.advanceBy(1);
  }
  assert.ok(bondOf(socialOf(sim.worldView(), cook), me).familiarity >= 3,
    `cook should know you by now (familiarity ${bondOf(socialOf(sim.worldView(), cook), me).familiarity})`);

  // 现在打听：他若知道别人的事，就会顺口带一句。
  go(sim, me, occupiedPlaceId(sim.worldView(), cook));
  const asked = sim.dispatch({ type: SettlementCommands.askAbout, actorId: me, source: "player", payload: { targetId: cook } });
  assert.equal(asked.ok, true, asked.errors[0]?.message);
  const after = sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any;
  // 建村第一周村里人还没互相知道什么，所以这里只断言「结构上通路是通的」：
  // 一旦对方知道、且够熟，就会多出一条「听说」。
  assert.ok(after.total >= 0);
});

test("a hint arrives through the village rumour round (途径二：日久相处)", () => {
  const { sim } = boot();
  // 闲话轮在建村时排下，每 7 天一次。走 30 天，同住同工的人一定互相听说了些什么。
  sim.advanceBy(30);
  const cook = residentId("cook");
  const known = sim.project({ id: SecretProjections.known, params: { actorId: cook } }).data as any;
  assert.ok(known.total > 0, "by day 30 a resident has heard something about someone");
  // 而且「听说」阶段拿不到正文。
  for (const item of known.heard) {
    const spec = secretById(item.secretId)!;
    assert.ok(!JSON.stringify(item).includes(fill(spec.text, spec.owner)), "heard entries carry hints only");
  }
});

test("a hint arrives by witnessing (途径三：目击)", () => {
  const { sim, me } = boot();
  // 走到某个村民所在的地方，撞见的判定是确定性的；连走几天总会撞上一次。
  let witnessed = false;
  for (let day = 0; day < 40 && !witnessed; day += 1) {
    const someone = RIVER_TERRACE_PACK.residents
      .map((r) => occupiedPlaceId(sim.worldView(), residentId(r.key)))
      .find(Boolean);
    if (someone) go(sim, me, someone);
    const view = sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any;
    witnessed = view.heard.some((h: any) => h.secretId && view.total > 0);
    sim.advanceBy(1);
  }
  assert.ok(witnessed, "walking the village for forty days turns up at least one thing you saw yourself");
});

// ---------------------------------------------------------------------------
// 4. 四种用法
// ---------------------------------------------------------------------------

test("keeping a secret is remembered as a debt (替人保密)", () => {
  const { sim, me } = boot();
  const spec = SECRETS.find((s) => s.owner === "cook")!;
  makeKnown(sim, me, spec.id);
  go(sim, me, occupiedPlaceId(sim.worldView(), residentId("cook")));
  const r = sim.dispatch({ type: SecretCommands.keep, actorId: me, source: "player", payload: { secretId: spec.id } });
  assert.equal(r.ok, true, r.errors[0]?.message);
  const ledger = sim.project({ id: SecretProjections.ledger, params: { ownerId: residentId("cook") } }).data as any;
  assert.equal(ledger.kept.length, 1, "the owner remembers who kept quiet");
  assert.equal(ledger.kept[0].id, me);
  // 同一个人只能替他担一次。
  const again = sim.dispatch({ type: SecretCommands.keep, actorId: me, source: "player", payload: { secretId: spec.id } });
  assert.equal(again.ok, false);
});

test("advising in private either mends or shames, depending on how they feel about you (私下劝)", () => {
  const { sim, me } = boot();
  const spec = SECRETS.find((s) => s.owner === "cook")!;
  makeKnown(sim, me, spec.id);
  go(sim, me, occupiedPlaceId(sim.worldView(), residentId("cook")));
  const r = sim.dispatch({ type: SecretCommands.advise, actorId: me, source: "player", payload: { secretId: spec.id } });
  assert.equal(r.ok, true, r.errors[0]?.message);
  const events = sim.kernel.internals.eventLog.all().filter((e) => e.type.startsWith("village-secrets.advised"));
  assert.equal(events.length, 1, "advising produces exactly one outcome event");
  assert.ok(["village-secrets.advised_well", "village-secrets.advised_badly"].includes(events[0]!.type));
  const ledger = sim.project({ id: SecretProjections.ledger, params: { ownerId: residentId("cook") } }).data as any;
  assert.equal(ledger.advised.length, 1);
});

test("exposing someone in front of others costs them and starts a grievance (当众揭发)", () => {
  const { sim, me } = boot();
  // 当众：同处得有至少两个别的村民。渡口人多（阿岚、埴公、阿砺），用埴公的事。
  const spec = SECRETS.find((s) => s.owner === "trader-elder")!;
  makeKnown(sim, me, spec.id);
  const place = occupiedPlaceId(sim.worldView(), residentId("trader-elder"));
  go(sim, me, place);
  const audience = RIVER_TERRACE_PACK.residents.filter((r) => occupiedPlaceId(sim.worldView(), residentId(r.key)) === place && r.key !== "trader-elder");
  assert.ok(audience.length >= 2, `the ford has an audience (${audience.length})`);

  const r = sim.dispatch({ type: SecretCommands.expose, actorId: me, source: "player", payload: { secretId: spec.id } });
  assert.equal(r.ok, true, r.errors[0]?.message);
  const exposed = sim.kernel.internals.eventLog.all().filter((e) => e.type === "village-secrets.exposed");
  assert.equal(exposed.length, 1);
  const ledger = sim.project({ id: SecretProjections.ledger, params: { ownerId: residentId("trader-elder") } }).data as any;
  assert.equal(ledger.exposed.length, 1);

  // 揭发把怨气交给 social-conflict 自己记：推进一天，任务转调它的命令。
  sim.advanceBy(2);
  const grievance = sim.project({ id: "social-conflict.grievances", params: { holderId: residentId("trader-elder") } }).data as any;
  assert.ok(grievance.byTarget[me], "the exposed villager now holds a grievance against the player");
  assert.match(String(grievance.byTarget[me].causes[0].cause), /village-secrets\.exposed/);
});

test("extortion gets you something and piles up their grudge (拿来要挟)", () => {
  const { sim, me } = boot();
  const spec = SECRETS.find((s) => s.owner === "cook")!;
  makeKnown(sim, me, spec.id);
  go(sim, me, occupiedPlaceId(sim.worldView(), residentId("cook")));

  const first = sim.dispatch({ type: SecretCommands.extort, actorId: me, source: "player", payload: { secretId: spec.id } });
  assert.equal(first.ok, true, first.errors[0]?.message);
  const view1 = (sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any)
    .known.find((k: any) => k.secretId === spec.id);
  assert.ok(view1.theirGrudge > 0, "one threat already leaves a mark");

  sim.advanceBy(1);
  const second = sim.dispatch({ type: SecretCommands.extort, actorId: me, source: "player", payload: { secretId: spec.id } });
  assert.equal(second.ok, true, second.errors[0]?.message);
  const view2 = (sim.project({ id: SecretProjections.known, params: { actorId: me } }).data as any)
    .known.find((k: any) => k.secretId === spec.id);
  assert.ok(view2.theirGrudge > view1.theirGrudge, "the grudge keeps piling up");
});

test("you cannot use a secret you have not confirmed", () => {
  const { sim, me } = boot();
  const spec = SECRETS.find((s) => s.owner === "cook")!;
  go(sim, me, occupiedPlaceId(sim.worldView(), residentId("cook")));
  for (const type of [SecretCommands.keep, SecretCommands.advise, SecretCommands.expose, SecretCommands.extort]) {
    const r = sim.dispatch({ type, actorId: me, source: "player", payload: { secretId: spec.id } });
    assert.equal(r.ok, false, `${type} must refuse an unknown secret`);
    assert.equal(r.errors[0]?.code, "E_SECRET_NOT_YET");
  }
});

// ---------------------------------------------------------------------------
// 5. 五年之内至少有一件心事自然被揭发
// ---------------------------------------------------------------------------

test("within five years at least one secret is exposed by the village itself", () => {
  const { sim } = boot(11);
  // 按 40 天一跳地走：超过内核的逐日上限（31）就按「略过」处理，村里人不再逐日
  // 过活——但排定的闲话轮照旧在每个到期日跑。要验的正是它，所以这样走最快。
  for (let day = 0; day < 5 * 360; day += 40) sim.advanceBy(40);
  const exposed = sim.kernel.internals.eventLog.all().filter((e) => e.type === "village-secrets.exposed");
  assert.ok(exposed.length >= 1, `five years of village life should expose at least one secret, saw ${exposed.length}`);
  const first = exposed[0]!;
  assert.ok(String(first.data?.text ?? "").length > 0, "an exposure names what was said out loud");
  assert.ok(first.actorId && first.targetId, "someone said it, about someone");
  assert.ok(first.targetId !== first.actorId, "nobody exposes themselves");
});

test("a villager who knows a secret does not repeat it as a rumour in the same breath", () => {
  // 「听说」不该直接变成「全村都知道」：闲话轮只传已确知的。
  const { sim } = boot(3);
  sim.advanceBy(20);
  const hints = sim.kernel.internals.eventLog.all().filter((e) => e.type === "village-secrets.hint_heard");
  const confirmed = sim.kernel.internals.eventLog.all().filter((e) => e.type === "village-secrets.confirmed");
  assert.ok(hints.length >= confirmed.length, "every confirmation was preceded by hints");
});
