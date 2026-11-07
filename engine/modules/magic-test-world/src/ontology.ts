/**
 * Magic Test World - ontology.
 *
 * Deliberately shares no vocabulary with the modern world: no money, school,
 * company, marriage, city or biology. If the kernel needed changing to support
 * this, the architecture would have failed its own test (§77).
 */

export const MC = {
  soul: "magic.soul",
  essence: "magic.essence",
  realm: "magic.realm",
  leyLine: "magic.ley_line",
  worldState: "magic.world_state",
} as const;

export const MR = {
  dwellsIn: "magic.dwells_in",
  bondedTo: "magic.bonded_to",
  fedBy: "magic.fed_by",
} as const;

export const MK = {
  soul: "magic.soul_being",
  realm: "magic.realm",
  leyLine: "magic.ley_line",
  world: "magic.world",
} as const;

export const WORLD_ID = "magic:world";
export const REALM_UMBRA = "magic:realm:umbra";
export const REALM_AETHER = "magic:realm:aether";
export const LEY_UMBRA = "magic:ley:umbra";
export const LEY_AETHER = "magic:ley:aether";

/** One cycle is one "moon"; the kernel knows nothing about moons. */
export const TICKS_PER_CYCLE = 6;

export interface WorldState {
  activeSoulId: string;
  generation: number;
}

export interface SoulComponent {
  name: string;
  affinity: string;
  generation: number;
  bornAt: number;
  reincarnations: number;
}

export interface EssenceComponent {
  mana: number;
  maxMana: number;
  alive: boolean;
}

export interface LeyLineComponent {
  realmId: string;
  flux: number;
  flowRate: number;
  capacity?: number;
}
