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
    // Events are appended in seq order, so the index is simply seq - 1 offset.
    const firstIndex = Math.max(0, afterSeq);
    return this.#events.slice(firstIndex);
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
    return this.#events.find((event) => event.id === id);
  }

  /** A cheap rollback point: the journal is append-only, so its length is enough. */
  mark(): { length: number; seq: number } {
    return { length: this.#events.length, seq: this.#seq };
  }

  /** Drops everything appended after `mark` (transaction rollback). */
  rollback(mark: { length: number; seq: number }): void {
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
  }

  static deserialize(state: EventLogState): EventLog {
    const log = new EventLog();
    log.#events = state.events.map((event) => ({ ...event, data: { ...event.data } }));
    log.#seq = state.seq;
    return log;
  }
}
