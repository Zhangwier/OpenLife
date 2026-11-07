/** A real first action prompts a choice the next day; all consequences use the story journal. */
import type { Outcome } from "./journal.ts";
export const ACTION_INCIDENTS = new Set(["food", "textile", "housing", "travel"].map(id => `life-route-${id}`));

export function queueLifeRoute(out: Outcome, event: string, data: Record<string, unknown>): void {
  const recipe = String(data.recipeId ?? data.useId ?? ""), resource = String(data.resourceId ?? "");
  const place = String(data.placeId ?? "");
  let route = "";
  if (/sown|harvested|cooked/.test(event) || /grain|cooked/.test(resource) || /grind|cake|roast|fish/.test(recipe)) route = "food";
  else if (/woven|fiber|wrap/.test(event) || /weave|spin|cloth|rope/.test(recipe)) route = "textile";
  else if (event.startsWith("settlement-build.") || /roof/.test(recipe) || event.endsWith("roof_mended")) route = "housing";
  else if (event.startsWith("travel.") || (event.endsWith("arrived") && /ford|market/.test(place))) route = "travel";
  if (!route || out.j.flags.includes(`life-route:${route}:started`)) return;
  out.flag(`life-route:${route}:started`);
  let due = out.tick + 1;
  while (out.j.scheduled[String(due)]) due += 1;
  out.j = { ...out.j, scheduled: { ...out.j.scheduled, [String(due)]: `life-route-${route}` } };
}
