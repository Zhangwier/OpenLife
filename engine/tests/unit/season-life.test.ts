/**
 * 一季一季地过：把心思放在一处，一季过去结算口粮、交情、手艺、收获和年岁。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "@openlife/simulation";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import {
  settlementLocationsModule, SettlementCommands, homestead, residentId, socialOf, bondOf, liveSeason, seasonOf, daysLeftInSeason, skillsOf,
} from "@openlife/module-settlement-locations";

function life() {
  const sim = new Simulation({ worldSeed: 7, modules: [modernWorldModule, familyModule, worldClockModule, worldSpaceModule, worldObjectsModule, settlementLocationsModule] });
  sim.dispatch({ type: "modern.initialize_world" });
  sim.dispatch({ type: "modern.create_character", payload: { givenName: "禾", familyName: "林", lifespan: 90 } });
  sim.advanceBy(360 * 16);
  const me = String(sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId);
  sim.dispatch({ type: SettlementCommands.found });
  sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "system", payload: { placeId: "place:yard" } });
  sim.dispatch({ type: SettlementCommands.chooseOrigin, actorId: me, source: "player", payload: { originId: "potter-kin", talents: ["likable"] } });
  return { sim, me };
}
const lived = (sim: Simulation, seq: number) => sim.kernel.internals.eventLog.since(seq - 1).filter((e) => e.type === "settlement-locations.season_lived");

test("a season at the kiln: to the end of the season, fed, closer to the potters, skill learned, something made", () => {
  const { sim, me } = life();
  const s0 = seasonOf(sim.tick), left = daysLeftInSeason(sim.tick);
  const elder = residentId("elder"), farmer = residentId("yu");
  const before = bondOf(socialOf(sim.worldView(), elder), me).familiarity;
  const farmerBefore = bondOf(socialOf(sim.worldView(), farmer), me).familiarity;
  assert.ok(homestead(sim.worldView(), me).actions.some((a) => a.id === SettlementCommands.beginSeason && a.payload.focus === "craft"));
  const seq = sim.kernel.internals.eventLog.nextSeq;
  const r = liveSeason(sim as never, me, "craft");
  assert.equal(r.ok, true, r.error);
  assert.equal(r.days, left);
  assert.notEqual(seasonOf(sim.tick), s0);
  const h = homestead(sim.worldView(), me);
  assert.equal(h.hunger, 0);
  assert.ok(bondOf(socialOf(sim.worldView(), elder), me).familiarity > before);
  assert.equal(bondOf(socialOf(sim.worldView(), farmer), me).familiarity <= farmerBefore, true);
  assert.ok(skillsOf(sim.worldView(), me).includes("fire-watch"));
  const ev = lived(sim, seq);
  assert.equal(ev.length, 1);
  assert.match(String(ev[0]!.data.line), /陶叔/);
});

test("seasons add up to years; old friends you never see drift a little", () => {
  const { sim, me } = life();
  const yu = residentId("yu");
  liveSeason(sim as never, me, "farm");
  liveSeason(sim as never, me, "farm");
  const close = bondOf(socialOf(sim.worldView(), yu), me).familiarity;
  const age0 = Number(sim.worldView().getComponent(me, "modern.vitals")?.ageYears);
  for (let i = 0; i < 4; i++) assert.equal(liveSeason(sim as never, me, "family").ok, true);
  assert.ok(Number(sim.worldView().getComponent(me, "modern.vitals")?.ageYears) > age0);
  assert.ok(bondOf(socialOf(sim.worldView(), yu), me).familiarity < close);
});
