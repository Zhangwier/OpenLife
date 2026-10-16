/**
 * 家里人照顾家里人；为一件事连着白忙两天，就先放一放。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule, SettlementCommands, illnessOn, residentId, RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";

const modules = [modernWorldModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule];
function village(seed = 7) {
  const sim = new Simulation({ worldSeed: seed, modules });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.dispatch({ type: SettlementCommands.found });
  return sim;
}

test("when someone is ill, a housemate brings them something to eat or drink", () => {
  const sim = village();
  const roles = new Set(Object.values(RIVER_TERRACE_PACK.autonomy));
  let cared = false, sawIllWithKin = false;
  for (let d = 0; d < 14 && !cared; d++) {
    const seq = sim.kernel.internals.eventLog.nextSeq;
    sim.advanceBy(1);
    const ill = illnessOn(sim.tick);
    if (!ill) continue;
    const home = RIVER_TERRACE_PACK.residents.find((r) => r.key === ill.key)!.homeSpace;
    const kin = RIVER_TERRACE_PACK.residents.filter((r) => r.homeSpace === home && r.key !== ill.key && !roles.has(r.key)).map((r) => residentId(r.key));
    if (!kin.length) continue;
    sawIllWithKin = true;
    cared = sim.kernel.internals.eventLog.since(seq - 1).some((e) => e.type === "settlement-locations.gift_given" && e.targetId === ill.residentId && kin.includes(String(e.actorId)));
  }
  assert.ok(sawIllWithKin, "an illness in a shared home happens within two weeks");
  assert.ok(cared, "and the family looks after them");
});

test("a goal chased two days in vain is set aside for a while", () => {
  const sim = village();
  let gaveUp = "";
  for (let d = 0; d < 10 && !gaveUp; d++) {
    sim.advanceBy(1);
    for (const r of RIVER_TERRACE_PACK.residents) {
      const res = sim.worldView().getComponent(residentId(r.key), "settlement-locations.resident");
      if (/折腾了两天没成，先放一放/.test(String(res?.standingRoutine ?? ""))) {
        gaveUp = r.key;
        const f = res!.frustration as Record<string, { n: number }>;
        assert.ok(Object.values(f).some((v) => v.n >= 2));
      }
    }
  }
  assert.ok(gaveUp);
});

test("villagers seek out people they know instead of all piling into one spot", () => {
  const sim = village();
  let worst = 0;
  for (let d = 0; d < 10; d++) {
    sim.advanceBy(1);
    const count = new Map<string, number>();
    for (const r of RIVER_TERRACE_PACK.residents) {
      const note = String(sim.worldView().getComponent(residentId(r.key), "settlement-locations.resident")?.standingRoutine ?? "");
      const m = /想见见人，到([^和]+)和/.exec(note);
      if (m) count.set(m[1]!, (count.get(m[1]!) ?? 0) + 1);
    }
    worst = Math.max(worst, ...count.values(), 0);
  }
  assert.ok(worst <= 6, `at most a handful go to the same place to chat (${worst})`);
});
