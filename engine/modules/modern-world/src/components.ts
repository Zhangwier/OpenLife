/**
 * Modern World public vocabulary is defined in @openlife/life-contracts so
 * system packs can depend on the contract without importing this implementation.
 */
export {
  ModernComponents as C,
  ModernRelations as R,
  ModernKinds as K,
  WORLD_ENTITY_ID,
  CITY_NORTH,
  CITY_SOUTH,
} from "@openlife/life-contracts/modern";

export type {
  IdentityComponent,
  VitalsComponent,
  WealthComponent,
  ResidenceComponent,
  WorldStateComponent,
  OrganizationComponent,
} from "@openlife/life-contracts/modern";
