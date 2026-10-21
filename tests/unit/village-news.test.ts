/**
 * 村里的新鲜事：谁病了、谁头一回做成了什么、谁帮了谁，碰面时顺嘴传开，
 * 搭话时村民会说起你还没听过的事，说过的不再重复。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule, occupiedPlaceId } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, socialOf, residentId, readSocial, withNews, freshNews, mergeHeard, illnessOn, NEWS_DAYS,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

test("news is remembered once, spreads as hearsay, and fades after a few days", () => {
  let a = readSocial({});
  a = withNews(a, "made:x:jar", { about: "x", text: "阿稷头一回自己烧成了一个小陶罐", at: 3 });
  a = withNews(a, "made:x:jar", { about: "x", text: "别的说法", at: 4 });
  assert.equal(freshNews(a, 3)[0]!.text, "阿稷头一回自己烧成了一个小陶罐");
  const b = mergeHeard(readSocial({}), a, "me", "x");
  assert.equal(b.news["made:x:jar"]!.heard, true);
  assert.equal(b.news["made:x:jar"]!.by, "x");
  // 不会把关于自己的事当成听来的新闻。
  assert.equal(mergeHeard(readSocial({}), a, "x", "y").news["made:x:jar"], undefined);
  assert.equal(freshNews(b, 3 + NEWS_DAYS + 1).length, 0);
  assert.deepEqual(readSocial(JSON.parse(JSON.stringify(b))).news, b.news);
});

test("villagers pass on what happened, and tell you something you have not heard yet", () => {
  const sim = new Simulation({ worldSeed: 7, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  // Find a day on which someone knows news that is not their own.
  let teller = "", day = 0;
  for (; day < 12 && !teller; day++) {
    sim.advanceBy(1);
    const world = sim.worldView();
    const keys = ["lan", "yu-brother", "elder", "elder-wife", "lan-mother", "clay-digger", "water-carrier"];
    teller = keys.map(residentId).find((id) => freshNews(socialOf(world, id), world.tick).some((n) => n.heard)) ?? "";
  }
  assert.ok(teller, "within twelve days some news has travelled");
  const world = sim.worldView();
  const item = freshNews(socialOf(world, teller), world.tick)[0]!;
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: occupiedPlaceId(world, teller) } });
  const said = sim.dispatch({ type: SettlementCommands.talk, actorId: me, source: "player", payload: { targetId: teller } });
  assert.equal(said.ok, true);
  const event = sim.kernel.internals.eventLog.since(0).find((e) => said.eventIds.includes(e.id) && e.type === "settlement-locations.conversation");
  assert.ok(event, "the talk command committed a conversation event");
  const line = String(event?.data?.line ?? "");
  if (event?.data?.news) {
    assert.equal(event.data.news, item.id);
    assert.ok(!line.includes("{"), line);
    const heard = sim.worldView().getComponent(me, "settlement-locations.holding")?.newsHeard as string[];
    assert.ok(heard.includes(item.id));
  } else assert.ok(line.includes("这是") || line.includes("心里惦记"), `第一次是自我介绍，之后才是心愿或新闻：${line}`);
});

test("someone ill is known to their household", () => {
  const sim = new Simulation({ worldSeed: 7, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.dispatch({ type: SettlementCommands.found });
  let ill = illnessOn(sim.tick);
  for (let i = 0; i < 40 && !ill; i++) { sim.advanceBy(1); ill = illnessOn(sim.tick); }
  assert.ok(ill);
  sim.advanceBy(1);
  if (!illnessOn(sim.tick - 1)) return;
  const homes = new Map([["elder", "elder-wife"], ["elder-wife", "elder"], ["yu", "yu-brother"], ["yu-brother", "yu"], ["lan", "lan-mother"], ["lan-mother", "lan"],
    ["clay-digger", "clay-child"], ["clay-child", "clay-digger"], ["water-carrier", "water-child"], ["water-child", "water-carrier"], ["cook-helper", "cook"]]);
  const kin = homes.get(ill!.key);
  if (!kin || kin === "cook") return;
  const news = freshNews(socialOf(sim.worldView(), residentId(kin)), sim.tick);
  assert.ok(news.some((n) => n.id.startsWith(`ill:${ill!.key}:`)), JSON.stringify(news));
});
