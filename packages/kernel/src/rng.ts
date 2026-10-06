/**
 * Deterministic RNG (§INV-004, §INV-007).
 *
 * One seeded stream for the whole world. Rules never receive the root stream;
 * they receive a *fork* whose label is derived from the rule id (and event
 * sequence for reactions). This makes replays reproducible and keeps one rule's
 * random consumption from perturbing another rule's draws.
 */

import type { DeterministicRngLike } from "@openlife/contracts";

export interface RngState {
  seed: number;
  draws: number;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Stable 32-bit string hash (FNV-1a). */
export function hashString(value: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export class DeterministicRng implements DeterministicRngLike {
  readonly label: string;
  #state: number;
  #draws: number;

  constructor(seed: number, label = "root", draws = 0) {
    this.#state = seed >>> 0;
    this.#draws = draws;
    this.label = label;
  }

  static fromSeed(seed: number | string, label = "root"): DeterministicRng {
    const numericSeed = typeof seed === "number" ? seed >>> 0 : hashString(seed);
    return new DeterministicRng(numericSeed, label);
  }

  get drawCount(): number {
    return this.#draws;
  }

  get seed(): number {
    return this.#state;
  }

  /** Mulberry32 step: small, fast and fully deterministic. */
  nextUint32(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    this.#draws += 1;
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
      throw new Error("nextInt requires integer bounds");
    }
    if (maxExclusive <= minInclusive) {
      throw new Error(`invalid range [${minInclusive}, ${maxExclusive})`);
    }
    const span = maxExclusive - minInclusive;
    return minInclusive + Math.floor(this.nextFloat() * span);
  }

  chance(probability: number): boolean {
    if (probability <= 0) {
      // Still consume nothing, so probability 0 stays cheap and stable.
      return false;
    }
    if (probability >= 1) return true;
    return this.nextFloat() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("cannot pick from an empty array");
    const index = this.nextInt(0, items.length);
    return items[index] as T;
  }

  /**
   * Derive an independent stream. The child seed is a pure function of
   * (parent seed, label, draw count) so the parent is not advanced and forks
   * stay reproducible regardless of call order.
   */
  fork(label: string): DeterministicRng {
    const seed = (hashString(`${this.label}|${label}|${this.#state}|${this.#draws}`) ^ this.#state) >>> 0;
    return new DeterministicRng(seed, label);
  }

  snapshot(): RngState {
    return { seed: this.#state, draws: this.#draws };
  }

  restore(state: RngState): void {
    this.#state = state.seed >>> 0;
    this.#draws = state.draws;
  }
}
