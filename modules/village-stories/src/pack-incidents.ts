/**
 * Where choice events come from.
 *
 * Two sources feed the player the same way:
 *   1. the base story pack's `incidents` (authored in river-terrace.stories.json)
 *   2. content packs' `incidents.json` (format v2, docs/PLUGINS.md §3.2.1)
 *
 * They have different shapes on purpose: the base pack's incidents are quest
 * tools with `requires`/`reward`, while a pack incident is a storyteller event
 * with preconditions, weather ties and free-form `choices`. Rather than force
 * one into the other, this file converts a pack incident into the shape the
 * journal already knows, so the existing resolve path runs unchanged.
 *
 * The conversion happens once at load; a world without content packs gets an
 * empty list and behaves exactly as before.
 */
import type { StoryEventSpec, StoryChoiceSpec } from "@openlife/module-settlement-locations";
import type { IncidentChoice, IncidentSpec } from "./spec.ts";

/** Pack incidents the journal should offer, already converted. */
let PACK_INCIDENTS: IncidentSpec[] = [];
/** The raw specs, kept so costs/effects can be read back on resolve. */
const RAW = new Map<string, StoryEventSpec>();

/**
 * Install the incidents a content pack contributed.
 *
 * Called once by the module at registration, after content packs are merged.
 * Idempotent: calling twice with the same list changes nothing.
 */
export function installPackIncidents(specs: readonly StoryEventSpec[]): void {
  RAW.clear();
  const converted: IncidentSpec[] = [];
  for (const spec of specs) {
    if (!spec.choices?.length) continue;           // a plain story, not a choice
    RAW.set(spec.id, spec);
    converted.push(toIncident(spec));
  }
  PACK_INCIDENTS = converted;
}

/** Everything the player can be offered, base pack first so its ids stay stable. */
export function allIncidents(base: readonly IncidentSpec[]): IncidentSpec[] {
  return PACK_INCIDENTS.length ? [...base, ...PACK_INCIDENTS] : [...base];
}

/** The original pack spec behind a converted incident, if it came from one. */
export function packIncidentSource(id: string): StoryEventSpec | undefined {
  return RAW.get(id);
}

/** The chosen pack choice, so its richer effects can be applied. */
export function packChoice(incidentId: string, choiceId: string): StoryChoiceSpec | undefined {
  return RAW.get(incidentId)?.choices?.find((c) => c.id === choiceId);
}

/**
 * Convert one pack incident into the journal's incident shape.
 *
 * `rewards` carries what the journal can already apply by itself (items, bonds,
 * flags). Anything richer -- costs, reputation, yields, follow-ups -- stays in
 * RAW and is applied by the module after resolution, because the journal has no
 * vocabulary for it and should not grow one just for this.
 */
function toIncident(spec: StoryEventSpec): IncidentSpec {
  const choices: IncidentChoice[] = (spec.choices ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    line: c.line ?? "",
    // A conversion artifact: the journal reads `line` as the aftermath text.
    setFlags: c.flags,
  }));
  return {
    id: spec.id,
    title: titleOf(spec),
    text: spec.text,
    seasons: spec.seasons,
    choices,
  };
}

/**
 * The headline for a pack incident.
 *
 * Pack incidents carry no title field (the plan's format writes `text` only), so
 * the first sentence does the job -- capped so a long paragraph cannot blow up
 * the panel.
 */
function titleOf(spec: StoryEventSpec): string {
  const first = spec.text.split(/[。！？!?]/)[0]?.trim() ?? spec.text;
  return first.length > 24 ? `${first.slice(0, 24)}…` : first;
}
