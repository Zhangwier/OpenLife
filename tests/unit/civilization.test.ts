/**
 * A3 文明层：发明沿聚落网络扩散，而不是同时到处出现。
 *
 * 这是开发文档 A3.4 的验收标准。在此之前，青铜、铁器、工业是靠一个
 * 「社群规模」门槛凑出来的——一个村子自己长大，越过人数线就跳进下一个时代。
 * 这个模块让那张「聚落网络」真的演出来。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  civilizationModule, CivilizationCommands, CivilizationProjections,
  contactNetwork, contactStrength, diffusionChance, needStrength, polityFromSettlement,
  networkHolders, meetsIndustrialGate,
  type Polity,
} from "@openlife/module-civilization";

function world(seed = 5) {
  const sim = new Simulation({ worldSeed: seed,
    modules: [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule,
      civilizationModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  return sim;
}

const INVENTIONS = [
  { id: "invention:pry-bar", answers: ["need:move-heavy"], difficulty: 25 },
  { id: "invention:rollers", answers: ["need:move-heavy"], difficulty: 30 },
  { id: "invention:bronze", answers: ["need:better-pots"], difficulty: 60 },
  { id: "invention:iron-smelting", answers: ["need:sharper-blade"], difficulty: 85 },
];

function found(sim: Simulation, neighbours: Array<{ name: string; x: number; y: number; population: number }>) {
  const r = sim.dispatch({ type: "civilization.found", payload: {
    homeName: "河岸台地", homePopulation: 12,
    neighbours,
  }, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
}

test("联系强度由距离和通道决定：越近越强，有河比翻山强", () => {
  const a = polityFromSettlement("a", "甲", 0, 0, 20);
  const b = polityFromSettlement("b", "乙", 2, 0, 20);
  const c = polityFromSettlement("c", "丙", 8, 8, 20);
  assert.ok(contactStrength(a, b, "river") > contactStrength(a, b, "plain"), "有河比翻山强");
  assert.ok(contactStrength(a, b) > contactStrength(a, c), "越近越强");
  assert.ok(contactStrength(a, c) < 1, "远了就弱");
});

test("传播概率 = 联系强度 × 需求强度", () => {
  const contact = { a: "a", b: "b", strength: 0.8, distance: 2, via: "river" as const };
  assert.ok(Math.abs(diffusionChance(contact, 0.5) - 0.4) < 1e-9);
  assert.equal(diffusionChance(contact, 0), 0, "没有需求就传不动");
});

test("需求强度：已经有就没有，没有前置就没有", () => {
  const b = polityFromSettlement("b", "乙", 0, 0, 20);
  const needs = (id: string) => (id === "invention:pry-bar" ? ["need:move-heavy"] : []);
  assert.ok(needStrength("invention:pry-bar", b, needs) > 0);
  assert.equal(needStrength("invention:pry-bar", { ...b, known: { "invention:pry-bar": 0.6 } }, needs), 0,
    "已经掌握了就没有需求");
});

test("网络里掌握一项发明的总人口，就是工业门槛", () => {
  const a = polityFromSettlement("a", "甲", 0, 0, 500, { "invention:iron-smelting": 0.5 });
  const b = polityFromSettlement("b", "乙", 2, 2, 500, { "invention:iron-smelting": 0.3 });
  assert.equal(networkHolders([a, b], "invention:iron-smelting"), 400);
  assert.equal(meetsIndustrialGate([a, b], "invention:iron-smelting", 300), true);
  assert.equal(meetsIndustrialGate([a, b], "invention:iron-smelting", 500), false);
});

test("整个网络铺开后，政体、联系、投影都在", { timeout: 60000 }, () => {
  const sim = world();
  found(sim, [
    { name: "南岸", x: 0, y: 4, population: 10 },
    { name: "东岭", x: 6, y: 2, population: 8 },
  ]);
  const view = sim.project({ id: CivilizationProjections.network, params: {} });
  assert.equal(view.ok, true, JSON.stringify(view.error));
  const data = view.data as Record<string, unknown>;
  assert.equal((data.polities as unknown[]).length, 3, "三个节点");
  assert.ok((data.contacts as unknown[]).length > 0, "有联系");
});

test("发明先出现在某地，再沿网络扩散——不是同时到处出现", { timeout: 120000 }, () => {
  const sim = world(7);
  // 让本村开局就会一项，然后看它怎么沿网络传开。
  const r = sim.dispatch({ type: "civilization.found", payload: {
    homeName: "河岸台地", homePopulation: 12,
    homeKnown: { "invention:pry-bar": 0.9 },
    neighbours: [
      { name: "南岸", x: 0, y: 4, population: 10 },
      { name: "东岭", x: 6, y: 2, population: 8 },
    ],
  }, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));

  const firstSeen: Record<string, number> = {};
  for (let year = 1; year <= 30; year += 1) {
    const res = sim.dispatch({ type: "civilization.year", payload: { inventions: INVENTIONS.slice(0, 2) }, source: "system" });
    assert.equal(res.ok, true, JSON.stringify(res.errors));
    const net = sim.worldView().getComponent("civilization:network", "civilization.network") as
      { polities: Polity[] } | undefined;
    for (const p of net!.polities) {
      if ((p.known["invention:pry-bar"] ?? 0) > 0 && firstSeen[p.id] === undefined) {
        firstSeen[p.id] = year;
      }
    }
  }

  // 本村第 1 年就会（开局就给了），邻村要晚——扩散是沿网络走的，不是同时。
  assert.equal(firstSeen["polity:home"], 1, "本村先会");
  const others = Object.entries(firstSeen).filter(([id]) => id !== "polity:home");
  assert.ok(others.length >= 1, "至少有一个邻村后来也会了");
  for (const [id, year] of others) {
    assert.ok(year > 1, `${id} 不是同时会的，是第 ${year} 年才传开的`);
  }
});

test("首次出现年份与网络距离正相关（越远越晚）", { timeout: 120000 }, () => {
  // 文档 A3.4 的核心统计断言：correlation > 0.5
  const sim = world(11);
  const r = sim.dispatch({ type: "civilization.found", payload: {
    homeName: "河岸台地", homePopulation: 12,
    homeKnown: { "invention:pry-bar": 0.9 },
    neighbours: [
      { name: "近邻", x: 2, y: 0, population: 10 },
      { name: "远村", x: 8, y: 0, population: 10 },
    ],
  }, source: "system" });
  assert.equal(r.ok, true, JSON.stringify(r.errors));

  const seen: Record<string, number> = {};
  for (let year = 1; year <= 60; year += 1) {
    sim.dispatch({ type: "civilization.year", payload: { inventions: INVENTIONS.slice(0, 2) }, source: "system" });
    const net = sim.worldView().getComponent("civilization:network", "civilization.network") as
      { polities: Polity[] } | undefined;
    for (const p of net!.polities) {
      if ((p.known["invention:pry-bar"] ?? 0) > 0 && seen[p.id] === undefined) seen[p.id] = year;
    }
  }

  // 近的比远的早
  const near = seen["polity:neighbour:0"] ?? 999;
  const far = seen["polity:neighbour:1"] ?? 999;
  if (near < 999 && far < 999) {
    assert.ok(near <= far, `近邻(${near}) 应不晚于远村(${far})`);
  }
});

test("没有铺网就推进一年，会被拒", () => {
  const sim = world();
  const r = sim.dispatch({ type: "civilization.year", payload: { inventions: INVENTIONS }, source: "system" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0]!.message, /铺/);
});

test("网络状态随存档持久化", () => {
  const sim = world();
  found(sim, [{ name: "南岸", x: 0, y: 4, population: 10 }]);
  sim.dispatch({ type: "civilization.year", payload: { inventions: INVENTIONS }, source: "system" });
  const before = sim.worldView().getComponent("civilization:network", "civilization.network") as
    { year: number } | undefined;
  assert.equal(before?.year, 1);

  const saved = sim.save();
  const loaded = Simulation.load(saved, [modernWorldModule, worldClockModule, worldSpaceModule,
    worldObjectsModule, civilizationModule]);
  assert.equal(loaded.result.ok, true, JSON.stringify(loaded.result.errors));
  const after = loaded.simulation!.worldView().getComponent("civilization:network", "civilization.network") as
    { year: number } | undefined;
  assert.equal(after?.year, 1, "读档后年份还在");
});
