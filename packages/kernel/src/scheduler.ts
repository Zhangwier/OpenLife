/**
 * Kernel - Scheduler (§17).
 *
 * Modules never receive a global `onTick()`. Instead they register task types
 * and schedule tasks at explicit ticks. The scheduler is a deterministic
 * priority queue ordered by (due tick, sequence), so the same schedule always
 * drains in the same order.
 */

import type { TaskId, TaskTypeId } from "@openlife/contracts";
import type { JsonValue } from "@openlife/contracts";

export interface ScheduledTask {
  id: TaskId;
  type: TaskTypeId;
  dueAt: number;
  seq: number;
  payload: Record<string, JsonValue>;
  /** Owner module, for lifecycle bookkeeping. */
  owner?: string;
  /** Repeat interval in ticks; absent means one-shot. */
  everyTicks?: number;
  untilTick?: number;
  dedupeKey?: string;
  /** Number of times this task has already run. */
  runs: number;
}

export interface ScheduleRequest {
  type: TaskTypeId;
  dueAt: number;
  payload?: Record<string, JsonValue>;
  owner?: string;
  everyTicks?: number;
  untilTick?: number;
  dedupeKey?: string;
}

export interface SchedulerState {
  tasks: ScheduledTask[];
  seq: number;
}

export class Scheduler {
  #tasks: ScheduledTask[] = [];
  #seq = 0;
  #dedupe = new Set<string>();

  get size(): number {
    return this.#tasks.length;
  }

  /** Returns the created task, or undefined when deduped. */
  schedule(request: ScheduleRequest): ScheduledTask | undefined {
    if (request.dedupeKey) {
      const key = `${request.type}\u0000${request.dedupeKey}`;
      if (this.#dedupe.has(key)) return undefined;
      this.#dedupe.add(key);
    }
    this.#seq += 1;
    const task: ScheduledTask = {
      id: `task:${this.#seq}`,
      type: request.type,
      dueAt: request.dueAt,
      seq: this.#seq,
      payload: request.payload ?? {},
      runs: 0,
      ...(request.owner ? { owner: request.owner } : {}),
      ...(request.everyTicks !== undefined ? { everyTicks: request.everyTicks } : {}),
      ...(request.untilTick !== undefined ? { untilTick: request.untilTick } : {}),
      ...(request.dedupeKey ? { dedupeKey: request.dedupeKey } : {}),
    };
    this.#tasks.push(task);
    return task;
  }

  /** All tasks due at or before `tick`, in deterministic drain order. */
  peekDue(tick: number): ScheduledTask[] {
    return this.#tasks
      .filter((task) => task.dueAt <= tick)
      .sort(compareTasks);
  }

  /** Next due tick across all pending tasks, or undefined when idle. */
  nextDueTick(): number | undefined {
    if (this.#tasks.length === 0) return undefined;
    let min = Number.POSITIVE_INFINITY;
    for (const task of this.#tasks) min = Math.min(min, task.dueAt);
    return min;
  }

  /**
   * Marks a task as run. Repeating tasks are rescheduled in place; one-shots
   * and exhausted repeats are removed. Dedupe keys of removed one-shots are
   * released so the same logical task can be scheduled again later.
   */
  complete(taskId: TaskId, atTick: number): void {
    const index = this.#tasks.findIndex((task) => task.id === taskId);
    if (index === -1) return;
    const task = this.#tasks[index] as ScheduledTask;
    task.runs += 1;
    const nextDue = task.everyTicks !== undefined ? atTick + task.everyTicks : undefined;
    const stillRepeats =
      nextDue !== undefined && (task.untilTick === undefined || nextDue <= task.untilTick);
    if (stillRepeats) {
      task.dueAt = nextDue as number;
      return;
    }
    this.#tasks.splice(index, 1);
    if (task.dedupeKey) this.#dedupe.delete(`${task.type}\u0000${task.dedupeKey}`);
  }

  list(): readonly ScheduledTask[] {
    return [...this.#tasks].sort(compareTasks);
  }

  /** Drops every task owned by a module (used when a module is unloaded). */
  cancelOwner(owner: string): number {
    const before = this.#tasks.length;
    this.#tasks = this.#tasks.filter((task) => {
      if (task.owner !== owner) return true;
      if (task.dedupeKey) this.#dedupe.delete(`${task.type}\u0000${task.dedupeKey}`);
      return false;
    });
    return before - this.#tasks.length;
  }

  serialize(): SchedulerState {
    return { tasks: this.#tasks.map((task) => ({ ...task, payload: { ...task.payload } })), seq: this.#seq };
  }

  static deserialize(state: SchedulerState): Scheduler {
    const scheduler = new Scheduler();
    scheduler.#tasks = state.tasks.map((task) => ({ ...task, payload: { ...task.payload } }));
    scheduler.#seq = state.seq;
    for (const task of scheduler.#tasks) {
      if (task.dedupeKey) scheduler.#dedupe.add(`${task.type}\u0000${task.dedupeKey}`);
    }
    return scheduler;
  }
}

function compareTasks(a: ScheduledTask, b: ScheduledTask): number {
  if (a.dueAt !== b.dueAt) return a.dueAt - b.dueAt;
  return a.seq - b.seq;
}
