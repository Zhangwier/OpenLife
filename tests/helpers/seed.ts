import type { Kernel } from "@openlife/kernel";

/**
 * Test fixtures enter the world the same way everything else does: through a
 * Command whose resolution spawns the entities (Kernel.internals is read-only).
 */
export function seedEntities(kernel: Kernel, records: { id: string; kind: string; components: Record<string, Record<string, unknown>> }[]): void {
  const defs = kernel.definitions;
  if (!defs.commands.has("test-seed.spawn")) {
    defs.commands.register("test-seed.spawn", { type: "test-seed.spawn" }, "test-seed");
    defs.resolutions.register("test-seed.spawn.resolve", {
      id: "test-seed.spawn.resolve", kind: "resolution", commandType: "test-seed.spawn",
      resolve: (ctx) => (ctx.command.payload?.records as typeof records).map((record, index) => ({
        kind: "spawnEntity" as const, localId: `seed-${index}`, id: record.id,
        entityKind: record.kind, components: record.components as never, announce: false,
      })),
    }, "test-seed");
  }
  const result = kernel.dispatch({ type: "test-seed.spawn", source: "system", payload: { records } as never });
  if (!result.ok) throw new Error(`seed failed: ${JSON.stringify(result.errors)}`);
}

/** Schedules a task through a Command, as a module rule would. */
export function scheduleThroughCommand(kernel: Kernel, taskType: string, at: number, payload: Record<string, unknown>, owner: string): void {
  const defs = kernel.definitions;
  const type = `${owner}.test_schedule`;
  if (!defs.commands.has(type)) {
    defs.commands.register(type, { type }, owner);
    defs.resolutions.register(`${type}.resolve`, {
      id: `${type}.resolve`, kind: "resolution", commandType: type,
      resolve: (ctx) => [{ kind: "scheduleTask" as const, taskType: String(ctx.command.payload?.taskType),
        at: Number(ctx.command.payload?.at), payload: ctx.command.payload?.payload as never }],
    }, owner);
  }
  const result = kernel.dispatch({ type, source: "system", payload: { taskType, at, payload } as never });
  if (!result.ok) throw new Error(`schedule failed: ${JSON.stringify(result.errors)}`);
}
