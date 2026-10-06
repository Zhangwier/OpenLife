/**
 * Modern World - component and relation definitions.
 *
 * Everything in this file is *content*, not core. None of it exists in the
 * kernel, which is exactly what lets `magic-test-world` define a completely
 * different ontology without touching core code.
 */

export const C = {
  identity: "modern.identity",
  vitals: "modern.vitals",
  wealth: "modern.wealth",
  residence: "modern.residence",
  worldState: "modern.world_state",
  organization: "modern.organization",
} as const;

export const R = {
  livesIn: "modern.lives_in",
  owns: "modern.owns",
} as const;

export const K = {
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
