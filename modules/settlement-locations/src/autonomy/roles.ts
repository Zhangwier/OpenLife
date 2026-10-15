/**
 * Who does what in the village day, read from the settlement pack (M5-B).
 *
 * The routines keep their rules in code, but every person, place and room
 * they name comes from data: a role's workplace and home are that resident's
 * own `workPlace`/`homeSpace`; a place's work spot and job resource are
 * authored on the place.
 */
import { RIVER_TERRACE_PACK, type SettlementPack } from "../content.ts";
import { residentId, worksites, hungerAt, SettlementCommands, SettlementComponents, SettlementId } from "../module.ts";
import { occupiedPlaceId } from "@openlife/module-world-space";
import type { AgentHost } from "@openlife/contracts";
import type { WorldView } from "@openlife/contracts";

export interface VillageRole {
  key: string;
  id: string;
  name: string;
  /** Place the role works at during the day. */
  workPlace: string;
  /** Where one stands to work there (the place's work spot, else its entry). */
  workSpot: string;
  /** Room the role sleeps in. */
  home: string;
}

function roleFor(pack: SettlementPack, key: string): VillageRole {
  const resident = pack.residents.find((r) => r.key === key);
  if (!resident) throw new Error(`settlement pack: autonomy role names unknown resident ${key}`);
  return {
    key, id: residentId(key), name: resident.name, workPlace: resident.workPlace,
    workSpot: workSpotOf(pack, resident.workPlace), home: resident.homeSpace,
  };
}

function workSpotOf(pack: SettlementPack, placeId: string): string {
  const place = pack.places.find((p) => p.id === placeId);
  return place?.workSpot ?? place?.entrySpace ?? "";
}

export function villageRoles(pack: SettlementPack = RIVER_TERRACE_PACK) {
  return {
    farmer: roleFor(pack, pack.autonomy.farmer),
    cook: roleFor(pack, pack.autonomy.cook),
    fuelGatherer: roleFor(pack, pack.autonomy.fuelGatherer),
  };
}

export const ROLES = villageRoles();

/** Job resource per workplace, as the pack authors it. */
export const RESOURCE_AT_WORK: Record<string, string> = Object.fromEntries(
  RIVER_TERRACE_PACK.places.filter((p) => p.jobResource).map((p) => [p.id, p.jobResource!]),
);

/** Work spot per place, as the pack authors it. */
export const WORK_SPACES: Record<string, string> = Object.fromEntries(
  RIVER_TERRACE_PACK.places.filter((p) => p.workSpot).map((p) => [p.id, p.workSpot!]),
);

export const yieldId = (placeId: string, resourceId: string) => `yield:${placeId}:${resourceId}`;

/** Current stock at a yield point as anyone standing there sees it (renewal applied). */
export function stockAt(world: WorldView, placeId: string, resourceId: string): number {
  return worksites(world).places.find((p) => p.placeId === placeId)
    ?.resources.find((r) => r.resourceId === resourceId)?.stock ?? 0;
}

/** A resident's current hunger, read the same way the player's is. */
export function residentHunger(world: WorldView, actorId: string): number {
  const holding = world.getComponent(actorId, SettlementComponents.holding);
  const founded = world.getComponent(SettlementId, SettlementComponents.settlement)?.foundedAt;
  return hungerAt(Number(holding?.hunger ?? 0), Number(holding?.hungerAt ?? founded ?? world.tick), world.tick);
}

/**
 * Specialist routines (cook, fuel gatherer) eat like everyone else: when hungry
 * and the shared kitchen really has a portion, walk there and eat one.
 */
export function mealIfHungry(sim: AgentHost, actorId: string,
    act: (type: string, payload: Record<string, string>, label: string) => boolean): boolean {
  const world = sim.worldView();
  if (residentHunger(world, actorId) < 4 || stockAt(world, ROLES.cook.workPlace, "resource:cooked") <= 0) return false;
  if (occupiedPlaceId(world, actorId) !== ROLES.cook.workPlace &&
      !act(SettlementCommands.arrive, { placeId: ROLES.cook.workPlace, travelMode: "local" }, "饿了，去公灶")) return false;
  return act(SettlementCommands.eat, { placeId: ROLES.cook.workPlace, resourceId: "resource:cooked" }, "吃一份熟食");
}
