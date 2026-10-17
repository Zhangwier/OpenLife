/**
 * Small world readers shared by module.ts and the rule files split out of it
 * (marriage.ts, ...). Depends only on vocabulary, content and social data, so
 * importing it never pulls a file into module.ts's import cycle.
 */
import type { Effect, WorldView } from "@openlife/contracts";
import { RIVER_TERRACE_PACK, type ResidentSpec } from "./content.ts";
import { readSocial, toJson, type SocialMemory } from "./social.ts";
import { SettlementComponents, residentId } from "./vocabulary.ts";

/**
 * Fourteen residents across six households.
 *
 * Every one answers "why is he here today": they have a home space, a work
 * place and a standing routine. Their names are plain reconstructions, which is
 * the honest label for a 2070 BCE village (see the content policy in
 * `OPEN_WORLD_REQUIREMENTS.md` 搂3).
 */
export const RESIDENTS: ResidentSpec[] = RIVER_TERRACE_PACK.residents;

/** The player character currently being lived. */
export const activeId = (world: WorldView) =>
  String(world.getComponent("modern:world", "modern.world_state")?.activeCharacterId ?? "");

/** A resident's authored name, else the entity's own name. */
export function personName(world: WorldView, personId: string): string {
  const key = RESIDENTS.find((r) => residentId(r.key) === personId);
  return key?.name ?? (world.getEntity(personId)?.name || String(world.getComponent(personId, "modern.identity")?.givenName ?? "") || "对方");
}

export function socialOf(world: WorldView, personId: string): SocialMemory {
  return readSocial(world.getComponent(personId, SettlementComponents.resident)?.social);
}

export function saveSocial(residentIdValue: string, memory: SocialMemory, reason: string): Effect {
  return { kind: "modifyComponent", entityId: residentIdValue, component: SettlementComponents.resident,
    patch: { social: toJson(memory) }, reason };
}
