/**
 * Villagers trade among themselves. When two people meet at the hearth or at
 * work, a resident looks for a plain deal: something the other person needs
 * that they carry, for something they need (food first when hungry). The deal
 * goes through the same validated exchange command the player uses, so the
 * counterpart's own appraisal decides, and the outcome is a real handover.
 * The active player is never a target: nobody takes the player's goods
 * without the player choosing to trade.
 */
import type { AgentHost as NpcHost } from "@openlife/contracts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import { SettlementCommands, residentId } from "../vocabulary.ts";
import { tradeableGoods, counterpartView } from "../module.ts";
import { RIVER_TERRACE_PACK } from "../content.ts";
import { EDIBLE } from "../exchange.ts";

const VALUES = RIVER_TERRACE_PACK.exchange?.values ?? {};
const WANTS = RIVER_TERRACE_PACK.exchange?.wants ?? {};
const LABELS = RIVER_TERRACE_PACK.resourceLabels;

export interface NpcTrade { partnerId: string; gave: string; got: string; accepted: boolean; label: string }

export function tryNpcExchange(sim: NpcHost, actorId: string, hunger: number): NpcTrade | null {
  const world = sim.worldView();
  const here = occupiedPlaceId(world, actorId);
  if (!here) return null;
  const active = String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");
  const me = RIVER_TERRACE_PACK.residents.find((r) => residentId(r.key) === actorId);
  if (!me) return null;
  const mine = tradeableGoods(world, actorId);
  if (!Object.keys(mine).length) return null;
  const myWants = new Set(WANTS[me.key] ?? []);
  if (hunger >= 3) { myWants.add("resource:grain"); myWants.add("resource:cooked"); }
  for (const r of RIVER_TERRACE_PACK.residents) {
    const partnerId = residentId(r.key);
    if (partnerId === actorId || partnerId === active || occupiedPlaceId(world, partnerId) !== here) continue;
    const partner = counterpartView(world, actorId, partnerId);
    const offer = Object.keys(mine).find((res) => partner.wants.includes(res) && !myWants.has(res));
    const ask = Object.keys(partner.holds).find((res) => myWants.has(res) && res !== offer &&
      // food the partner is short of is not worth asking a hungry neighbour for
      !(EDIBLE.has(res) && partner.hunger >= 4));
    if (!offer || !ask) continue;
    const count = Math.min(mine[offer]!.length, 4,
      Math.max(1, Math.ceil((VALUES[ask] ?? 1) / (VALUES[offer] ?? 1))));
    const give = mine[offer]!.slice(0, count);
    const result = sim.dispatch({ type: SettlementCommands.exchange, actorId, source: "ai",
      payload: { targetId: partnerId, give, askResource: ask, askAmount: 1 } as never });
    if (!result.ok) continue;
    const accepted = tradeableGoods(sim.worldView(), partnerId)[offer]?.includes(give[0]!) ?? false;
    const label = accepted
      ? `用${count}份${LABELS[offer]}向${partner.name}换了一份${LABELS[ask]}`
      : `想用${LABELS[offer]}向${partner.name}换${LABELS[ask]}，没谈成`;
    return { partnerId, gave: offer, got: ask, accepted, label };
  }
  return null;
}
