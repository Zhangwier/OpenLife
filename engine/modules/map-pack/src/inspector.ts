/**
 * Map Pack Inspector.
 *
 * Renders the load + validation result as the operator-facing report. The
 * single question it answers is: *may this pack safely enter the World?*
 *
 * Nothing here mutates anything; the inspector runs the loader in dry-run mode
 * unless it is explicitly handed a live registration result.
 */

import { loadMapPack } from "./loader.ts";
import type { MapPackIssue, MapPackLoadResult, MapPackValidation } from "./schema.ts";

export interface InspectOptions {
  /** Optional result of `registerMapPack`, printed as a second section. */
  registration?: { ok: boolean; commands: { type: string; ok: boolean; error?: string }[] };
}

export function inspectMapPack(packPath: string, options: InspectOptions = {}): string {
  const loaded = loadMapPack(packPath, { dryRun: true });
  return formatInspection(loaded, options);
}

export function formatInspection(loaded: MapPackLoadResult, options: InspectOptions = {}): string {
  const lines: string[] = [];
  const push = (line = ""): void => {
    lines.push(line);
  };

  push("OpenLife Map Pack Inspector");
  push();

  if (!loaded.manifest) {
    push("Pack:");
    push("  (manifest could not be read)");
    push(`  directory: ${loaded.directory}`);
  } else {
    push("Pack:");
    push(`  ${loaded.manifest.name}`);
    push(`  id: ${loaded.manifest.id}`);
    push(`  version: ${loaded.manifest.version}`);
    push(`  schema: ${loaded.manifest.schemaVersion}`);
    push(`  type: ${loaded.manifest.type}`);
  }
  push();

  const { counts } = loaded.validation;
  push("Contents:");
  push(`  Regions:    ${counts.regions}`);
  push(`  Locations:  ${counts.locations}`);
  push(`  Edges:      ${counts.edges}`);
  push(`  Boundary Anchors: ${counts.boundaryAnchors}`);
  push();

  push("Validation:");
  push(`  ${loaded.validation.ok ? "PASS" : "FAIL"}`);
  push();

  push("Checks:");
  for (const check of loaded.validation.checks) {
    push(`  ${check.ok ? "OK  " : "FAIL"}  ${check.label}`);
  }

  if (loaded.validation.issues.length > 0) {
    push();
    push(`Issues (${loaded.validation.issues.length}):`);
    for (const issue of loaded.validation.issues) {
      push(`  ${formatIssue(issue)}`);
    }
  }

  if (options.registration) {
    const { registration } = options;
    const failed = registration.commands.filter((command) => !command.ok);
    push();
    push("Registration:");
    push(`  ${registration.ok ? "PASS" : "FAIL"}  ${registration.commands.length} command(s), ${failed.length} failed`);
    for (const command of failed) {
      push(`  FAIL  ${command.type}: ${command.error ?? "unknown error"}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatIssue(issue: MapPackIssue): string {
  const where = issue.index !== undefined ? `${issue.file}[${issue.index}]` : issue.file;
  const who = issue.objectId ? ` "${issue.objectId}"` : "";
  const field = issue.field ? ` .${issue.field}` : "";
  return `${issue.code} ${where}${who}${field} - ${issue.message}`;
}

export function summarizeValidation(validation: MapPackValidation): string {
  if (validation.ok) {
    const { counts } = validation;
    return `PASS (${counts.regions} regions, ${counts.locations} locations, ${counts.edges} edges, ${counts.boundaryAnchors} boundary anchors)`;
  }
  const codes = [...new Set(validation.issues.map((issue) => issue.code))].sort();
  return `FAIL (${validation.issues.length} issue(s): ${codes.join(", ")})`;
}
