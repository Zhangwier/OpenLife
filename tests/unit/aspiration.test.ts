/**
 * 念想：出身带来的一个心愿，进度从世界里读出来（不是任务清单）；
 * 没有出身的人生没有念想，也不报错。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, residentId, aspirationView, RIVER_TERRACE_PACK,
} from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];

function life(originId?: string, seed = 33) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  assert.equal(sim.dispatch({ type: SettlementCommands.found }).ok, true);
  assert.equal(sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } }).ok, true);
  if (originId) {
    const r = sim.dispatch({ type: SettlementCommands.chooseOrigin, actorId: me, source: "player", payload: { originId, talents: [] } });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
  }
  const act = (type: string, payload: Record<string, unknown> = {}) => sim.dispatch({ type, actorId: me, source: "player", payload: payload as never });
  return { sim, me, act };
}

test("no origin, no aspiration", () => {
  const { sim, me } = life();
  assert.equal(aspirationView(sim.worldView(), me), null);
  assert.equal(homestead(sim.worldView(), me).aspiration, null);
});

test("every origin in the pack has a goal and a line for when it comes true", () => {
  for (const o of RIVER_TERRACE_PACK.origins ?? []) {
    assert.ok(o.goal, `${o.id} has a goal`);
    assert.ok(o.fulfilled && o.fulfilled.length > 4, `${o.id} has a fulfilment line`);
  }
});

test("meeting everyone: progress is read from real conversations and comes true", () => {
  const { sim, me, act } = life("ferry-child");
  const start = aspirationView(sim.worldView(), me)!;
  assert.equal(start.done, false);
  assert.match(start.progress, /^认识了 \d+\/\d+ 人$/);
  const keys = RIVER_TERRACE_PACK.residents.map((r) => r.key);
  for (const key of keys) {
    const id = residentId(key);
    for (let tries = 0; tries < 3; tries += 1) {
      sim.dispatch({ type: SettlementCommands.arrive, actorId: id, source: "ai", payload: { placeId: "place:yard" } });
      if (act(SettlementCommands.talk, { targetId: id }).ok) break;
      sim.advanceBy(1);
      sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
    }
  }
  const end = aspirationView(sim.worldView(), me)!;
  assert.equal(end.progress, `认识了 ${keys.length}/${keys.length} 人`);
  assert.equal(end.done, true);
  assert.ok(end.line.length > 4);
  assert.equal(homestead(sim.worldView(), me).aspiration?.done, true);
});

test("the aspiration reads the same on the same world", () => {
  const a = life("wanderer", 9); const b = life("wanderer", 9);
  assert.deepEqual(aspirationView(a.sim.worldView(), a.me), aspirationView(b.sim.worldView(), b.me));
});
