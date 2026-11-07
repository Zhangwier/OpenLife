/**
 * OpenLife Core Contract - Scheduler view.
 *
 * Modules and the debug console can inspect scheduled work, but only the kernel
 * drains the queue (§17, §57).
 */

import type { JsonValue } from "./entity.ts";
import type { TaskId, TaskTypeId } from "./ids.ts";

export interface ScheduledTaskView {
  id: TaskId;
  type: TaskTypeId;
  dueAt: number;
  owner?: string;
  runs: number;
  payload: Record<string, JsonValue>;
}
