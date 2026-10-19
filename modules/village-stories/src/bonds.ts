/**
 * People made alive: relationship tiers, the numeric weight of what the player
 * does, the villagers' own web of kin, friends and rivals (and the ripple a
 * bond with one sends through it), daily routines by hour and weather with
 * chance encounters, quarrels the player can take sides in or settle, and the
 * services of the village's special people (elder, healer, stonesmith).
 *
 * Pure data (data/river-terrace.bonds.json) plus pure reads; module.ts turns
 * them into validated commands and reactions.
 */
import { readFileSync } from "node:fs";
import { withOverlay } from "./overlay.ts";
import type { WorldView } from "@openlife/contracts";
import {
  RIVER_TERRACE_PACK, bondOf, dailyActivity, heartsOf, isIll, isWet, residentId, socialOf, type Bond,
} from "@openlife/module-settlement-locations";
import type { BondChange, ItemGrant, Reward } from "./spec.ts";

export type Slot = "晨" | "午" | "暮";
export interface TierSpec { id: string; name: string; minHearts: number }
export interface Edge {
  a: string; b: string; type: "kin" | "friend" | "rival"; label: string;
  remarkA?: string; remarkB?: string;
  quarrel?: { placeId: string; text: string; sideA: string; sideB: string; mediate: string };
}
export interface Routine { 晨?: string; 午?: string; 暮?: string; 雨?: string; encounters?: Partial<Record<Slot | "雨", string>> }
export interface ServiceSpec {
  id: string; npc: string; title: string; label: string; kind: "counsel" | "divine" | "remedy" | "plain";
  minTier: string; cooldownDays: number; cost?: string[]; grant?: ItemGrant; bond?: BondChange; line: string;
  effect?: BondChange;
}
export interface BondsPack {
  id: string; formatVersion: number;
  tiers: TierSpec[];
  feud: { id: string; name: string; grudgeAtLeast: number };
  behaviour: {
    workAlongside: { label: string; bond: BondChange };
    encounter: { label: string; bond: BondChange };
    ripple: { friend: number; kin: number; rivalGrudge: number; minDelta: number };
  };
  network: Edge[];
  routines: Record<string, Routine>;
  tierEvents: { npc: string; tier: string; text: string; reward?: Reward }[];
  services: ServiceSpec[];
  quarrelChance: number;
}

export const BONDS_PACK: BondsPack = withOverlay(new URL("../data/river-terrace.bonds.json", import.meta.url), JSON.parse(
  readFileSync(new URL("../data/river-terrace.bonds.json", import.meta.url), "utf8"),
) as BondsPack);

// ---------------------------------------------------------------------------
// Tiers

export const tierIndex = (id: string) => BONDS_PACK.tiers.findIndex((t) => t.id === id);
export function tierOfHearts(hearts: number): TierSpec {
  let best = BONDS_PACK.tiers[0]!;
  for (const t of BONDS_PACK.tiers) if (hearts >= t.minHearts) best = t;
  return best;
}
export const isFeud = (bond: Bond) => bond.grudge >= BONDS_PACK.feud.grudgeAtLeast;

// ---------------------------------------------------------------------------
// The web of relations (static edges, rivalries a player has settled turn friendly)

export function edgesOf(key: string, reconciled: string[] = []): { other: string; type: Edge["type"]; label: string; edge: Edge }[] {
  return BONDS_PACK.network.filter((e) => e.a === key || e.b === key).map((e) => ({
    other: e.a === key ? e.b : e.a,
    type: e.type === "rival" && reconciled.includes(pairId(e)) ? "friend" : e.type,
    label: e.type === "rival" && reconciled.includes(pairId(e)) ? `${e.label}（已和解）` : e.label,
    edge: e,
  }));
}
export const pairId = (e: Edge) => `${e.a}~${e.b}`;

/** How a bond change with `key` spreads: friends and kin warm a little, rivals cool. */
export function rippleOf(key: string, change: BondChange, reconciled: string[]): { other: string; change: BondChange; why: string }[] {
  const r = BONDS_PACK.behaviour.ripple;
  const warmth = (change.familiarity ?? 0) + (change.trust ?? 0);
  if (warmth < r.minDelta) return [];
  return edgesOf(key, reconciled).map(({ other, type }) => {
    if (type === "rival") return { other, change: { grudge: round(warmth * r.rivalGrudge) }, why: `你和${npcLabel(key)}走得近，${npcLabel(other)}心里不大痛快` };
    const k = type === "kin" ? r.kin : r.friend;
    return { other, change: { familiarity: round(warmth * k) }, why: `${npcLabel(key)}在${npcLabel(other)}跟前说了你的好话` };
  }).filter((x) => Object.values(x.change).some((v) => Math.abs(v ?? 0) >= 0.05));
}
const round = (n: number) => Math.round(n * 100) / 100;
export const npcLabel = (key: string) => RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.name ?? key;

/** A line about someone the player is close to, from the speaker's side of their relation. */
export function remarkFor(world: WorldView, me: string, speaker: string, reconciled: string[]): string {
  for (const { other, type, edge } of edgesOf(speaker, reconciled)) {
    if (type !== "rival") continue;
    if (heartsOf(bondOf(socialOf(world, residentId(other)), me)) < 3) continue;
    return (edge.a === speaker ? edge.remarkA : edge.remarkB) ?? "";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Time of day and routines

/** The hour of the player's day, read from how much of today's strength is spent. */
export function slotOf(world: WorldView, me: string): Slot {
  const used = Number(dailyActivity(world, me).used ?? 0);
  return used < 3 ? "晨" : used < 6 ? "午" : "暮";
}

/** A routine names a place, or a room inside one ("space:loom-room"): the place it belongs to. */
export const placeOfRoutineSpot = (spot: string) => spot.startsWith("space:")
  ? RIVER_TERRACE_PACK.places.find((p) => p.spaces.some((s) => s.id === spot))?.id ?? "" : spot;
function routineSpot(key: string, slot: Slot, tick: number): string {
  const r = BONDS_PACK.routines[key];
  if (!r) return "";
  if (isWet(tick) && r["雨"]) return r["雨"];
  return r[slot] ?? "";
}
/** Where a villager habitually is at this hour and weather, if their routine says so. */
export function routinePlace(key: string, slot: Slot, tick: number): string {
  return placeOfRoutineSpot(routineSpot(key, slot, tick));
}
/** The room they keep to then: the one the routine names, or the place's entrance. */
export function routineSpace(key: string, slot: Slot, tick: number): string {
  const spot = routineSpot(key, slot, tick);
  return spot.startsWith("space:") ? spot : entrySpaceOf(spot);
}
export function encounterLine(key: string, slot: Slot, tick: number): string {
  const r = BONDS_PACK.routines[key];
  if (!r?.encounters) return "";
  return (isWet(tick) && r["雨"] ? r.encounters["雨"] : undefined) ?? r.encounters[slot] ?? "";
}
export const canKeepRoutine = (world: WorldView, key: string) => {
  const id = residentId(key);
  const e = world.getEntity(id);
  return Boolean(e && e.archivedAt === undefined && world.getComponent(id, "modern.vitals")?.alive !== false && !isIll(world.tick, id));
};
export const entrySpaceOf = (placeId: string) =>
  String((RIVER_TERRACE_PACK.places.find((p) => p.id === placeId) as { entrySpace?: string } | undefined)?.entrySpace ?? "");

// ---------------------------------------------------------------------------
// Quarrels

function mix(a: number, b: number): number {
  let h = (Math.imul(a + 3, 0x9e3779b1) ^ Math.imul(b + 17, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
/** A rivalry flaring up today (deterministic per day), unless the player already settled it for good. */
export function quarrelOn(tick: number, reconciled: string[]): Edge | undefined {
  if (mix(tick, 5) % 1000 >= Math.round(BONDS_PACK.quarrelChance * 1000)) return undefined;
  const pool = BONDS_PACK.network.filter((e) => e.type === "rival" && e.quarrel && !reconciled.includes(pairId(e)));
  return pool.length ? pool[mix(tick, 6) % pool.length] : undefined;
}

// ---------------------------------------------------------------------------
// Bonds state kept in the journal

export interface LogEntry { at: number; npc: string; familiarity: number; trust: number; grudge: number; why: string }
export interface BondsState {
  seen: Record<string, { familiarity: number; trust: number; grudge: number }>;
  tierSeen: Record<string, number>;
  log: LogEntry[];
  alongside: Record<string, number>;
  encounters: Record<string, number>;
  quarrels: Record<string, string>;
  reconciled: string[];
  served: Record<string, number>;
  /** "<day>:<hour>" the routines were last walked for: villagers move when the hour turns, not at every step. */
  slotKey: string;
  /** Day a villager's words last moved the bond: a conversation tree warms a bond once a day, not per click. */
  chatDay: Record<string, number>;
}
const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
export function readBonds(raw: unknown): BondsState {
  const r = o(raw);
  const n = (v: unknown) => Object.fromEntries(Object.entries(o(v)).map(([k, x]) => [k, Number(x)]));
  return {
    seen: Object.fromEntries(Object.entries(o(r.seen)).map(([k, b]) => {
      const x = o(b);
      return [k, { familiarity: Number(x.familiarity ?? 0), trust: Number(x.trust ?? 0), grudge: Number(x.grudge ?? 0) }];
    })),
    tierSeen: n(r.tierSeen),
    log: Array.isArray(r.log) ? (r.log as unknown[]).map((e) => {
      const x = o(e);
      return { at: Number(x.at ?? 0), npc: String(x.npc ?? ""), familiarity: Number(x.familiarity ?? 0), trust: Number(x.trust ?? 0), grudge: Number(x.grudge ?? 0), why: String(x.why ?? "") };
    }) : [],
    alongside: n(r.alongside),
    encounters: n(r.encounters),
    quarrels: Object.fromEntries(Object.entries(o(r.quarrels)).map(([k, v]) => [k, String(v)])),
    reconciled: Array.isArray(r.reconciled) ? (r.reconciled as unknown[]).map(String) : [],
    served: n(r.served),
    slotKey: String(r.slotKey ?? ""),
    chatDay: n(r.chatDay),
  };
}
export const LOG_LIMIT = 40;

export function bondsProblems(pack: BondsPack = BONDS_PACK): string[] {
  const out: string[] = [];
  const keys = new Set(RIVER_TERRACE_PACK.residents.map((r) => r.key));
  const places = new Set(RIVER_TERRACE_PACK.places.map((p) => p.id));
  const protos = new Set(RIVER_TERRACE_PACK.prototypes.map((p) => p.id));
  const resources = new Set(Object.keys(RIVER_TERRACE_PACK.resourceLabels));
  const tiers = new Set(pack.tiers.map((t) => t.id));
  for (let i = 1; i < pack.tiers.length; i += 1) if (pack.tiers[i]!.minHearts <= pack.tiers[i - 1]!.minHearts) out.push(`tiers must rise: ${pack.tiers[i]!.id}`);
  for (const e of pack.network) {
    for (const k of [e.a, e.b]) if (!keys.has(k)) out.push(`network: unknown resident ${k}`);
    if (e.quarrel && !places.has(e.quarrel.placeId)) out.push(`network ${pairId(e)}: unknown place`);
    if (e.quarrel && e.type !== "rival") out.push(`network ${pairId(e)}: only rivals quarrel`);
  }
  for (const [k, r] of Object.entries(pack.routines)) {
    if (!keys.has(k)) out.push(`routine: unknown resident ${k}`);
    for (const slot of ["晨", "午", "暮", "雨"] as const) if (r[slot] && !places.has(placeOfRoutineSpot(r[slot]!))) out.push(`routine ${k}.${slot}: unknown place or room`);
    if (Object.values(RIVER_TERRACE_PACK.autonomy).includes(k)) out.push(`routine ${k}: bespoke village roles keep their own day`);
  }
  for (const t of pack.tierEvents) {
    if (!keys.has(t.npc)) out.push(`tier event: unknown resident ${t.npc}`);
    if (!tiers.has(t.tier)) out.push(`tier event ${t.npc}: unknown tier ${t.tier}`);
    for (const g of t.reward?.items ?? []) if (!protos.has(g.prototype)) out.push(`tier event ${t.npc}: unknown prototype`);
  }
  for (const s of pack.services) {
    if (!keys.has(s.npc)) out.push(`service ${s.id}: unknown resident`);
    if (!tiers.has(s.minTier)) out.push(`service ${s.id}: unknown tier`);
    for (const c of s.cost ?? []) if (!resources.has(c)) out.push(`service ${s.id}: unknown resource ${c}`);
    if (s.grant && !protos.has(s.grant.prototype)) out.push(`service ${s.id}: unknown prototype`);
  }
  return out;
}
