/**
 * Kernel - Event journal.
 *
 * Events are append-only and totally ordered by `seq`. The journal is the
 * source of truth for history, causal graphs and replay verification.
 */

import type { EventId, WorldEvent } from "@openlife/contracts";

export interface EventLogState {
  events: WorldEvent[];
  seq: number;
}

export class EventLog {
  #events: WorldEvent[] = [];
  #seq = 0;
  /** id → event, so causal lookups stay O(1) however long the journal grows. */
  #byId = new Map<EventId, WorldEvent>();

  get length(): number {
    return this.#events.length;
  }

  get nextSeq(): number {
    return this.#seq + 1;
  }

  append(event: Omit<WorldEvent, "seq" | "id"> & { id?: EventId }): WorldEvent {
    this.#seq += 1;
    const record: WorldEvent = {
      ...event,
      id: event.id ?? `evt:${this.#seq}`,
      seq: this.#seq,
    };
    this.#events.push(record);
    this.#byId.set(record.id, record);
    return record;
  }

  all(): readonly WorldEvent[] {
    return this.#events;
  }

  /**
   * Events with `seq > afterSeq`. Used by incremental consumers (history) so
   * they do not rescan the whole journal on every commit.
   */
  since(afterSeq: number): WorldEvent[] {
    if (afterSeq >= this.#seq) return [];
    // Seq order is append order; a compacted journal has gaps, so search.
    let lo = 0, hi = this.#events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.#events[mid]!.seq <= afterSeq) lo = mid + 1; else hi = mid;
    }
    return this.#events.slice(lo);
  }

  list(filter: {
    type?: string;
    actorId?: string;
    sinceTick?: number;
    minSignificance?: number;
  } = {}): WorldEvent[] {
    return this.#events.filter((event) => {
      if (filter.type && event.type !== filter.type) return false;
      if (filter.actorId && event.actorId !== filter.actorId) return false;
      if (filter.sinceTick !== undefined && event.at < filter.sinceTick) return false;
      if (filter.minSignificance !== undefined && event.historicalSignificance < filter.minSignificance) {
        return false;
      }
      return true;
    });
  }

  get(id: EventId): WorldEvent | undefined {
    return this.#byId.get(id);
  }

  /** A cheap rollback point: the journal is append-only, so its length is enough. */
  mark(): { length: number; seq: number } {
    return { length: this.#events.length, seq: this.#seq };
  }

  /** Drops everything appended after `mark` (transaction rollback). */
  rollback(mark: { length: number; seq: number }): void {
    for (let i = mark.length; i < this.#events.length; i += 1) this.#byId.delete(this.#events[i]!.id);
    this.#events.length = Math.min(this.#events.length, mark.length);
    this.#seq = mark.seq;
  }

  serialize(): EventLogState {
    return { events: this.#events.map((event) => ({ ...event, data: { ...event.data } })), seq: this.#seq };
  }

  /** Restores journal state in place for transaction rollback. */
  restore(state: EventLogState): void {
    this.#events = state.events.map((event) => ({ ...event, data: { ...event.data } }));
    this.#seq = state.seq;
    this.#reindex();
  }

  /**
   * Keeps only the events `keep` accepts, in order; seq numbering continues
   * where it was. Returns how many were dropped. Never call inside a
   * transaction (a rollback mark counts positions).
   */
  compact(keep: (event: WorldEvent) => boolean): number {
    const before = this.#events.length;
    this.#events = this.#events.filter(keep);
    if (this.#events.length !== before) this.#reindex();
    return before - this.#events.length;
  }

  #reindex(): void {
    this.#byId = new Map(this.#events.map((event) => [event.id, event]));
  }

  static deserialize(state: EventLogState): EventLog {
    const log = new EventLog();
    log.#events = state.events.map((event) => ({ ...event, data: { ...event.data } }));
    log.#seq = state.seq;
    log.#reindex();
    return log;
  }
}
