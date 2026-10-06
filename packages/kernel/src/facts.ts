/**
 * Kernel - Fact store.
 *
 * A Fact is a statement about what is true in the world (§22, §INV-005). It is
 * deliberately separate from events: an event is "something happened", a fact
 * is "something is the case". Facts carry a visibility so that character
 * knowledge can stay narrower than world truth.
 */

import type { Fact, FactId } from "@openlife/contracts";

export interface FactInput {
  factType: string;
  subject: string;
  object?: string;
  data?: Record<string, unknown>;
  at: number;
  visibility?: "public" | "private" | "secret";
  historicalSignificance?: number;
  owner?: string;
}

export interface FactRecord extends Fact {
  owner?: string;
}

export class FactStore {
  #facts: FactRecord[] = [];
  #seq = 0;

  get size(): number {
    return this.#facts.length;
  }

  add(input: FactInput): FactRecord {
    this.#seq += 1;
    const fact: FactRecord = {
      id: `fact:${this.#seq}` as FactId,
      factType: input.factType,
      subject: input.subject,
      ...(input.object !== undefined ? { object: input.object } : {}),
      data: input.data ?? {},
      at: input.at,
      visibility: input.visibility ?? "private",
      historicalSignificance: input.historicalSignificance ?? 0.1,
      ...(input.owner ? { owner: input.owner } : {}),
    };
    this.#facts.push(fact);
    return fact;
  }

  all(): readonly FactRecord[] {
    return this.#facts;
  }

  list(filter: { subject?: string; factType?: string; minSignificance?: number } = {}): FactRecord[] {
    return this.#facts.filter((fact) => {
      if (filter.subject && fact.subject !== filter.subject && fact.object !== filter.subject) return false;
      if (filter.factType && fact.factType !== filter.factType) return false;
      if (filter.minSignificance !== undefined && fact.historicalSignificance < filter.minSignificance) {
        return false;
      }
      return true;
    });
  }

  serialize(): { facts: FactRecord[]; seq: number } {
    return { facts: this.#facts.map((fact) => ({ ...fact, data: { ...fact.data } })), seq: this.#seq };
  }

  static deserialize(state: { facts: FactRecord[]; seq: number }): FactStore {
    const store = new FactStore();
    store.#facts = state.facts.map((fact) => ({ ...fact, data: { ...fact.data } }));
    store.#seq = state.seq;
    return store;
  }
}
