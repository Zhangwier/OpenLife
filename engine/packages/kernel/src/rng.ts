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
  /**
   * The seed of the stream this one was derived from, carried down the fork
   * chain. `keyed()` keys on this instead of `label`, because a fork's label is
   * a bare rule id — it holds no world seed at all. Keying on the label alone
   * made every world roll the same dice regardless of `worldSeed`; keying on
   * the origin keeps the stream a pure function of (world seed, parts).
   */
  readonly #origin: number;

  constructor(seed: number, label = "root", draws = 0, origin?: number) {
    this.#state = seed >>> 0;
    this.#draws = draws;
    this.label = label;
    this.#origin = (origin ?? seed) >>> 0;
  }

  static fromSeed(seed: number | string, label = "root"): DeterministicRng {
    const numericSeed = typeof seed === "number" ? seed >>> 0 : hashString(seed);
    return new DeterministicRng(numericSeed, label);
  }

  /**
   * A stream whose seed is a pure function of (world seed, parts) — and nothing
   * else. Not of the command order, not of the draw count.
   *
   * This is the A2 fix: the root fork keys were `command:${type}:${id}`, where
   * the command id is globally increasing. Insert one command (a fate stir, a
   * plugin's yearly command) and every random result after it moved, so
   * `--compare` measured a different history rather than one changed variable.
   *
   * A keyed stream is reproducible by construction: the same parts always give
   * the same stream, no matter what else happened in between.
   */
  static keyed(worldSeed: number, ...parts: Array<string | number>): DeterministicRng {
    const seed = hashString([worldSeed, ...parts].join(":"));
    return new DeterministicRng(seed, `keyed:${parts.join(":")}`, 0, worldSeed);
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
   *
   * The child remembers the same origin seed as its parent, so `keyed()` on a
   * nested stream still resolves to (world seed, parts).
   */
  fork(label: string): DeterministicRng {
    const seed = (hashString(`${this.label}|${label}|${this.#state}|${this.#draws}`) ^ this.#state) >>> 0;
    return new DeterministicRng(seed, label, 0, this.#origin);
  }

  /**
   * A stream keyed by parts alone — not by this stream's draw count.
   *
   * Use for anything that must be reproducible regardless of what else happened:
   * a yearly roll, an inspiration, a gift's reception. The seed is a pure
   * function of (origin seed, parts), so two calls with the same parts give the
   * same stream, no matter how many draws happened in between, and no matter
   * which rule made the call.
   *
   * The origin carries the world seed down the fork chain, which is what makes
   * two different worlds roll different dice while one world replays exactly.
   */
  keyed(...parts: Array<string | number>): DeterministicRng {
    const seed = hashString([this.#origin, ...parts].join(":"));
    return new DeterministicRng(seed, `keyed:${parts.join(":")}`, 0, this.#origin);
  }

  snapshot(): RngState {
    return { seed: this.#state, draws: this.#draws };
  }

  restore(state: RngState): void {
    this.#state = state.seed >>> 0;
    this.#draws = state.draws;
  }
}
