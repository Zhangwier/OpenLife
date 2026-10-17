/**
 * The rules behind people made alive (see bonds.ts for the data and reads):
 * work alongside someone, routines and chance encounters, quarrels, and the
 * special villagers' services. Each returns refusals for constraint rules
 * and writes into an Outcome for resolution and reaction rules.
 */
import type { WorldView } from "@openlife/contracts";
import { SpaceComponents, SpaceRelations, moveEffects, occupiedPlaceId, readSpace } from "@openlife/module-world-space";
import {
  RIVER_TERRACE_PACK, SettlementComponents, bondOf, heartsOf, illnessOn, isWet, residentId, skyOn, socialOf,
} from "@openlife/module-settlement-locations";
import {
  BONDS_PACK, canKeepRoutine, edgesOf, encounterLine, entrySpaceOf, isFeud, pairId, quarrelOn, remarkFor, routinePlace, slotOf,
  tierIndex, tierOfHearts, npcLabel, type ServiceSpec,
} from "./bonds.ts";
import { Outcome, consume, incidentOn, ownedInHand, resourceLabel, type Journal } from "./journal.ts";

/** What the settlement's own events mean for a bond, in the words the log shows. */
export const BOND_LABELS: Record<string, string> = {
  "settlement-locations.conversation": "交谈",
  "settlement-locations.gift_received": "送礼",
  "settlement-locations.hearth_helped": "在公灶搭手",
  "settlement-locations.exchanged": "交换",
  "settlement-locations.player_barter_accepted": "交换",
  "settlement-locations.lesson": "跟着学手艺",
  "settlement-locations.wish_fulfilled": "了却心愿",
};

/** Events that are work at a place: whoever works there too notices you pulling your weight. */
export const WORK_EVENTS = new Set([
  "settlement-locations.gathered", "settlement-locations.water_carried", "settlement-locations.worked",
  "settlement-locations.harvested", "settlement-locations.sown", "settlement-locations.crafted", "settlement-locations.cooked",
]);

const here = (world: WorldView, id: string) => occupiedPlaceId(world, id);

/** Villagers whose own work is at this place, standing here, not yet thanked today. */
export function workAlongside(out: Outcome, placeId: string): string[] {
  if (!placeId) return [];
  const spec = BONDS_PACK.behaviour.workAlongside;
  const met: string[] = [];
  for (const r of RIVER_TERRACE_PACK.residents) {
    const rid = residentId(r.key);
    if (r.workPlace !== placeId || here(out.world, rid) !== placeId) continue;
    if (out.j.bonds.alongside[r.key] === out.tick) continue;
    out.bond(r.key, spec.bond, spec.label);
    out.j = { ...out.j, bonds: { ...out.j.bonds, alongside: { ...out.j.bonds.alongside, [r.key]: out.tick } } };
    met.push(r.key);
  }
  if (met.length) out.count("alongside", met.length);
  return met;
}

/**
 * The player arrived somewhere: villagers with a routine go where their hour
 * and the weather take them, and anyone keeping their routine right here is
 * met by chance (once a day each).
 */
export function keepRoutines(out: Outcome, arrived: boolean): void {
  const slot = slotOf(out.world, out.me);
  const at = here(out.world, out.me);
  const slotKey = `${out.tick}:${slot}`;
  const turned = out.j.bonds.slotKey !== slotKey;
  if (turned) out.j = { ...out.j, bonds: { ...out.j.bonds, slotKey } };
  const arriving = new Map<string, number>();
  /** Never fill a place: a routine leaves at least one spot for the player to walk in. */
  const roomAt = (placeId: string) => {
    const space = entrySpaceOf(placeId);
    const capacity = readSpace(out.world.getComponent(space, SpaceComponents.space)).capacity;
    if (!(capacity > 0)) return true;
    const standing = out.world.listRelations({ type: SpaceRelations.standingIn, to: space }).filter((r) => r.from !== out.me).length;
    return standing + (arriving.get(placeId) ?? 0) + 1 < capacity;
  };
  for (const key of Object.keys(BONDS_PACK.routines)) {
    if (!canKeepRoutine(out.world, key)) continue;
    const rid = residentId(key);
    const target = routinePlace(key, slot, out.tick);
    if (!target) continue;
    let moved = false;
    if (turned && here(out.world, rid) !== target && roomAt(target)) {
      out.effects.push(...moveEffects(out.world, rid, target, entrySpaceOf(target), out.tick));
      arriving.set(target, (arriving.get(target) ?? 0) + 1);
      moved = true;
    }
    const willBe = moved ? target : here(out.world, rid);
    if (!arrived || target !== at || willBe !== at || out.j.bonds.encounters[key] === out.tick) continue;
    const line = encounterLine(key, slot, out.tick);
    if (!line) continue;
    const spec = BONDS_PACK.behaviour.encounter;
    out.bond(key, spec.bond, spec.label);
    out.j = { ...out.j, bonds: { ...out.j.bonds, encounters: { ...out.j.bonds.encounters, [key]: out.tick } } };
    out.count("encounter");
    out.say("village-stories.encounter", line, { npc: key, slot }, rid);
  }
}

// --- quarrels ----------------------------------------------------------------

export type QuarrelSide = "a" | "b" | "mediate";
export function quarrelProblem(world: WorldView, me: string, j: Journal, side: string): string {
  const q = quarrelOn(world.tick, j.bonds.reconciled);
  if (!q?.quarrel) return "今天没人吵架";
  if (j.bonds.quarrels[String(world.tick)]) return "这场争执你已经掺和过了";
  if (here(world, me) !== q.quarrel.placeId) return "要到吵架的地方去";
  if (!["a", "b", "mediate"].includes(side)) return "没有这个选择";
  if (side === "mediate") {
    for (const k of [q.a, q.b]) {
      if (tierIndex(tierOfHearts(heartsOf(bondOf(socialOf(world, residentId(k)), me))).id) < tierIndex("friend")) {
        return `劝架得两边都给你面子：先和${npcLabel(k)}成为朋友`;
      }
    }
  }
  return "";
}

export function settleQuarrel(out: Outcome, side: QuarrelSide): void {
  const q = quarrelOn(out.tick, out.j.bonds.reconciled)!;
  const quarrel = q.quarrel!;
  if (side === "mediate") {
    for (const k of [q.a, q.b]) out.bond(k, { trust: 1, grudge: -0.5 }, "劝和了一场争执");
    out.j = { ...out.j, bonds: { ...out.j.bonds, reconciled: [...out.j.bonds.reconciled, pairId(q)] } };
    out.count("mediate");
  } else {
    const [win, lose] = side === "a" ? [q.a, q.b] : [q.b, q.a];
    out.bond(win, { trust: 1 }, "吵架时帮着说话");
    out.bond(lose, { grudge: 1.5 }, "吵架时站在对头那边");
    out.count("sided");
  }
  out.j = { ...out.j, bonds: { ...out.j.bonds, quarrels: { ...out.j.bonds.quarrels, [String(out.tick)]: `${pairId(q)}:${side}` } } };
  out.say("village-stories.quarrel_settled", side === "mediate" ? quarrel.mediate : side === "a" ? quarrel.sideA : quarrel.sideB, { pair: pairId(q), side });
}

// --- special villagers' services --------------------------------------------

export const serviceById = (id: string) => BONDS_PACK.services.find((s) => s.id === id);

export function serviceProblem(world: WorldView, me: string, j: Journal, s: ServiceSpec | undefined, targetKey: string): string {
  if (!s) return "没有这项帮忙";
  const rid = residentId(s.npc);
  if (!world.getComponent(rid, SettlementComponents.resident)) return "人不在村里";
  if (here(world, rid) !== here(world, me)) return `${npcLabel(s.npc)}不在这儿`;
  const tier = tierOfHearts(heartsOf(bondOf(socialOf(world, rid), me)));
  if (tierIndex(tier.id) < tierIndex(s.minTier)) return `要先和${npcLabel(s.npc)}成为「${BONDS_PACK.tiers[tierIndex(s.minTier)]!.name}」`;
  const last = j.bonds.served[s.id];
  if (last !== undefined && world.tick - last < s.cooldownDays) return `${npcLabel(s.npc)}前几天刚帮过你，过 ${s.cooldownDays - (world.tick - last)} 天再来`;
  if (s.cost?.length && ownedInHand(world, me, s.cost).length === 0) return `要带上${s.cost.map(resourceLabel).join("或")}`;
  if (s.kind === "counsel") {
    if (!targetKey || targetKey === s.npc) return "要说清楚和谁有疙瘩";
    if (!world.getComponent(residentId(targetKey), SettlementComponents.resident)) return "没有这个人";
    if (bondOf(socialOf(world, residentId(targetKey)), me).grudge <= 0) return `你和${npcLabel(targetKey)}之间没有疙瘩`;
  }
  if (s.kind === "remedy" && !illnessOn(world.tick)) return "村里眼下没人病着";
  return "";
}

export function useService(out: Outcome, s: ServiceSpec, targetKey: string): void {
  if (s.cost?.length) out.effects.push(...consume(ownedInHand(out.world, out.me, s.cost).slice(0, 1), out.me, `service: ${s.id}`));
  let line = s.line;
  const got: string[] = [];
  if (s.kind === "counsel") {
    out.bond(targetKey, s.effect, `${npcLabel(s.npc)}出面说和`);
    line = line.replace("{target}", npcLabel(targetKey));
  } else if (s.kind === "divine") {
    const tomorrow = out.tick + 1;
    const incident = incidentOn(tomorrow);
    const ill = illnessOn(tomorrow);
    line += `“明天${skyOn(tomorrow)}${isWet(tomorrow) ? "，出门带蓑衣" : ""}。${incident ? `村里要出事：${incident.title}。` : "村里太平。"}${ill ? `${npcLabel(ill.key)}要着凉，记得去看看。` : ""}”`;
    out.flag("foresight");
  } else if (s.kind === "remedy") {
    const ill = illnessOn(out.tick)!;
    line = line.replace("{target}", npcLabel(ill.key));
  }
  if (s.grant) got.push(out.grant(s.grant));
  out.bond(s.npc, s.bond ?? { familiarity: 0.3 }, `${s.title}${npcLabel(s.npc)}帮了你`);
  out.j = { ...out.j, bonds: { ...out.j.bonds, served: { ...out.j.bonds.served, [s.id]: out.tick } } };
  out.flag(`served:${s.npc}`);
  out.count("service");
  out.say("village-stories.service_used", `${line}${got.length ? `（得到：${got.join("、")}）` : ""}`, { serviceId: s.id, npc: s.npc, ...(targetKey ? { target: targetKey } : {}) }, residentId(s.npc));
}

// --- what the player sees ----------------------------------------------------

export function peopleView(world: WorldView, me: string, j: Journal) {
  const slot = slotOf(world, me);
  const quarrel = quarrelOn(world.tick, j.bonds.reconciled);
  return {
    slot,
    weather: skyOn(world.tick),
    tiers: BONDS_PACK.tiers.map((t) => ({ id: t.id, name: t.name, minHearts: t.minHearts })),
    villagers: RIVER_TERRACE_PACK.residents.map((r) => {
      const rid = residentId(r.key);
      const bond = bondOf(socialOf(world, rid), me);
      const hearts = heartsOf(bond);
      const tier = tierOfHearts(hearts);
      const next = BONDS_PACK.tiers[tierIndex(tier.id) + 1];
      return {
        npc: r.key, name: r.name, role: r.role, placeId: here(world, rid), hearts, tier: tier.id, tierName: tier.name,
        nextTier: next ? { id: next.id, name: next.name, hearts: next.minHearts } : null,
        feud: isFeud(bond), bond: { familiarity: bond.familiarity, trust: bond.trust, grudge: bond.grudge },
        relations: edgesOf(r.key, j.bonds.reconciled).map((e) => ({ npc: e.other, name: npcLabel(e.other), type: e.type, label: e.label })),
        routine: BONDS_PACK.routines[r.key] ? { 晨: BONDS_PACK.routines[r.key]!["晨"] ?? null, 午: BONDS_PACK.routines[r.key]!["午"] ?? null,
          暮: BONDS_PACK.routines[r.key]!["暮"] ?? null, 雨: BONDS_PACK.routines[r.key]!["雨"] ?? null, now: routinePlace(r.key, slot, world.tick) || null } : null,
        special: BONDS_PACK.services.find((s) => s.npc === r.key)?.title ?? null,
      };
    }),
    log: [...j.bonds.log].reverse().slice(0, 12).map((e) => ({ ...e, name: npcLabel(e.npc) })),
    quarrel: quarrel?.quarrel ? {
      pair: pairId(quarrel), a: quarrel.a, b: quarrel.b, aName: npcLabel(quarrel.a), bName: npcLabel(quarrel.b),
      text: quarrel.quarrel.text, placeId: quarrel.quarrel.placeId, settled: j.bonds.quarrels[String(world.tick)] ?? null,
      sides: (["a", "b", "mediate"] as const).map((side) => ({ side, label: side === "mediate" ? "两边劝和" : `帮${npcLabel(side === "a" ? quarrel.a : quarrel.b)}说话`,
        enabled: !quarrelProblem(world, me, j, side), reason: quarrelProblem(world, me, j, side) })),
    } : null,
    services: BONDS_PACK.services.map((s) => {
      const targets = s.kind === "counsel"
        ? RIVER_TERRACE_PACK.residents.filter((r) => r.key !== s.npc && bondOf(socialOf(world, residentId(r.key)), me).grudge > 0).map((r) => r.key) : [""];
      return { id: s.id, npc: s.npc, npcName: npcLabel(s.npc), title: s.title, label: s.label, kind: s.kind,
        targets: targets.map((t) => ({ npc: t, name: t ? npcLabel(t) : "", enabled: !serviceProblem(world, me, j, s, t), reason: serviceProblem(world, me, j, s, t) })) };
    }),
  };
}

export { remarkFor };
