/**
 * Debug console - output formatting.
 */

import type { WorldEvent, WorldView } from "@openlife/contracts";
import type { DecisionTrace } from "@openlife/rule-engine";

export function formatEntities(
  world: WorldView,
  options: { includeArchived?: boolean } = {},
): string {
  const entities = world.listEntities({ includeArchived: options.includeArchived ?? false });
  if (entities.length === 0) return "  (no entities)";
  return entities
    .map((entity) => {
      const componentNames = Object.keys(entity.components).sort();
      const archived = entity.archivedAt !== undefined ? ` [archived@${entity.archivedAt}]` : "";
      return `  ${entity.id}  kind=${entity.kind}${archived}\n    components: ${componentNames.join(", ") || "(none)"}`;
    })
    .join("\n");
}

export function formatRelations(
  world: WorldView,
  options: { includeArchived?: boolean } = {},
): string {
  const relations = world.listRelations({ includeArchived: options.includeArchived ?? false });
  if (relations.length === 0) return "  (no relations)";
  return relations
    .map((relation) => {
      const archived = relation.archivedAt !== undefined ? ` [archived@${relation.archivedAt}]` : "";
      return `  ${relation.from} --${relation.type}--> ${relation.to}${archived}`;
    })
    .join("\n");
}

export function formatEvent(event: WorldEvent): string {
  const actor = event.actorId ? ` actor=${event.actorId}` : "";
  const target = event.targetId ? ` target=${event.targetId}` : "";
  const causes = event.causedBy.length > 0 ? ` causedBy=[${event.causedBy.join(",")}]` : "";
  const significance = event.historicalSignificance.toFixed(2);
  return `  #${event.seq} t=${event.at} ${event.type}${actor}${target} sig=${significance}${causes}`;
}

export function formatTrace(trace: DecisionTrace): string {
  const lines: string[] = [];
  lines.push(`  command: ${trace.commandType} (${trace.commandId})`);
  if (trace.constraints.length > 0) {
    lines.push("  constraints:");
    for (const constraint of trace.constraints) {
      const verdict = constraint.ok ? "ok" : `REJECTED ${constraint.code ?? ""}`;
      lines.push(`    - ${constraint.ruleId} [${constraint.owner}] -> ${verdict}`);
    }
  }
  if (trace.resolutions.length > 0) {
    lines.push("  resolutions:");
    for (const resolution of trace.resolutions) {
      lines.push(
        `    - ${resolution.ruleId} [${resolution.owner}] -> ${resolution.effectCount} effect(s)`,
      );
    }
  }
  if (trace.quantities.length > 0) {
    lines.push("  modifier pipeline:");
    for (const quantity of trace.quantities) {
      lines.push(`    ${quantity.target}: ${quantity.base} -> ${quantity.result}`);
      for (const entry of quantity.entries) {
        lines.push(
          `      ${entry.op} ${JSON.stringify(entry.value)} (${entry.reason}) => ${entry.after}`,
        );
      }
    }
  }
  if (trace.notes.length > 0) {
    lines.push("  notes:");
    for (const note of trace.notes) {
      lines.push(`    - ${note.message}${note.data ? ` ${JSON.stringify(note.data)}` : ""}`);
    }
  }
  if (trace.rngDraws.length > 0) {
    lines.push(
      `  rng draws: ${trace.rngDraws.map((draw) => `${draw.label}=${draw.draws}`).join(", ")}`,
    );
  }
  return lines.join("\n");
}

export function section(title: string): string {
  return `\n=== ${title} ===`;
}
