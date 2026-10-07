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

export function yearsToTicks(years: number): number {
  return Math.round(years * TICKS_PER_YEAR);
}

export function ticksToYears(ticks: number): number {
  return Math.floor(ticks / TICKS_PER_YEAR);
}

export function ageInYears(bornAt: number, now: number): number {
  return Math.max(0, Math.floor((now - bornAt) / TICKS_PER_YEAR));
}

export function formatTick(tick: number, startYear = 1): string {
  const year = startYear + Math.floor(tick / TICKS_PER_YEAR);
  const month = (tick % TICKS_PER_YEAR) + 1;
  return `Y${year}/M${String(month).padStart(2, "0")}`;
}
