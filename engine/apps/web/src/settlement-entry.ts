/** Opt-in expansion of a day-scale pottery save; never resets or re-times a life. */
import type { Simulation } from "@openlife/simulation";
import { currentPractice } from "@openlife/module-settlement-life";
import { reading } from "@openlife/module-world-clock";
import { SettlementCommands, SettlementId } from "@openlife/module-settlement-locations";
import { startHistory } from "./history-bridge.ts";
import { installGeography } from "./geography.ts";

export function expandSettlement(sim: Simulation, me: string, packsDir: string) {
  const reject = (message: string) => ({ ok: false, errors: [{ code: "E_SETTLEMENT_ENTRY", message }] });
  const world = sim.worldView(), person = world.getEntity(me);
  if (!person || person.archivedAt !== undefined || person.components["modern.vitals"]?.alive === false) return reject("这一生已经结束。");
  if (world.hasEntity(SettlementId)) return reject("你已经在完整的聚落生活里。");
  if (reading(world).legacyScale) return reject("这份旧人生保留原玩法；新人生可体验完整聚落。");
  if (currentPractice(world, me)) return reject("先完成手中的陶器，再去体验聚落的其他生活。");
  const founded = sim.dispatch({ type: SettlementCommands.found, source: "player", actorId: me });
  if (!founded.ok) return founded;
  installGeography(sim, packsDir); startHistory(sim);
  return sim.dispatch({ type: SettlementCommands.arrive, actorId: me, source: "player", payload: { placeId: "place:yard" } });
}
