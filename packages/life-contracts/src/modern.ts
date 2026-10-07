/**
 * Public domain contract for modules that operate on the modern-life world.
 * This package contains vocabulary only; it owns no world state and performs
 * no simulation work.
 */
export const ModernComponents = {
  identity: "modern.identity",
  vitals: "modern.vitals",
  wealth: "modern.wealth",
  residence: "modern.residence",
  worldState: "modern.world_state",
  organization: "modern.organization",
} as const;

export const ModernRelations = {
  livesIn: "modern.lives_in",
  owns: "modern.owns",
} as const;

export const ModernKinds = {
  character: "modern.character",
  organization: "modern.organization",
  city: "modern.city",
  world: "modern.world",
} as const;

export interface IdentityComponent {
  givenName: string;
  familyName: string;
  sex: "female" | "male" | "other";
  generation: number;
  lineageId: string;
  bornAt: number;
}

export interface VitalsComponent {
  alive: boolean;
  health: number;
  ageYears: number;
  lifespan: number;
}

export interface WealthComponent {
  cash: number;
  debt: number;
}

export interface ResidenceComponent {
  cityId: string;
}

export interface WorldStateComponent {
  activeCharacterId: string;
  generation: number;
  initialized: boolean;
}

export interface OrganizationComponent {
  name: string;
  orgKind: "business" | "school" | "institution";
  foundedAt: number;
  founderId?: string;
  dissolvedAt?: number;
}

export const WORLD_ENTITY_ID = "modern:world";
export const CITY_NORTH = "modern:city:north";
export const CITY_SOUTH = "modern:city:south";

export const TICKS_PER_YEAR = 12;
export const TICKS_PER_MONTH = 1;

/**
 * The world's zero point. `tick 0` is the founding of the Xia dynasty,
 * conventionally dated 2070 BCE.
 *
 * Years are astronomical on the inside (a negative year is BCE, and year 0 is
 * 1 BCE), but the anchor is written in display terms so that `formatYear`
 * round-trips: astronomical -2069 renders as "公元前 2070 年". See 需求书 §96.
 *
 * This is a world-pack level decision, not a kernel one - the kernel only ever
 * sees a monotonic `tick` counter.
 */
export const ERA_START_YEAR = -2069;

/** Converts a signed year to its display form ("公元前 2070 年" / "公元 841 年"). */
export function formatYear(year: number): string {
  // Astronomical year numbering has a year 0 (1 BCE); the display has none,
  // so years at or below zero shift by one.
  if (year <= 0) return `公元前 ${1 - year} 年`;
  return `公元 ${year} 年`;
}

export function yearOfTick(tick: number, eraStartYear = ERA_START_YEAR): number {
  return eraStartYear + Math.floor(tick / TICKS_PER_YEAR);
}

export function tickOfYear(year: number, eraStartYear = ERA_START_YEAR): number {
  return (year - eraStartYear) * TICKS_PER_YEAR;
}

export function yearsToTicks(years: number): number {
  return Math.round(years * TICKS_PER_YEAR);
}

export function ticksToYears(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_YEAR);
}

export function ageInYears(bornAt: number, now: number): number {
  return Math.max(0, Math.floor((now - bornAt) / TICKS_PER_YEAR));
}

export function formatTick(tick: number, eraStartYear = ERA_START_YEAR): string {
  const year = yearOfTick(tick, eraStartYear);
  const month = (tick % TICKS_PER_YEAR) + 1;
  return `${formatYear(year)} ${String(month).padStart(2, "0")}月`;
}
