/**
 * Content overlays (2026-10-19 deep round): a data file `<name>.json` may have a
 * sibling `<name>.deep.json` that only ADDS content. Merge rule: objects merge
 * key by key, arrays are appended, and a scalar only fills a key the base lacks.
 * Keeping each content round in its own file keeps patches from colliding.
 */
import { existsSync, readFileSync } from "node:fs";

export function mergeOverlay<T>(base: T, overlay: unknown): T {
  if (Array.isArray(base) && Array.isArray(overlay)) return [...base, ...overlay] as T;
  if (base && overlay && typeof base === "object" && typeof overlay === "object" && !Array.isArray(base) && !Array.isArray(overlay)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      out[key] = key in out ? mergeOverlay(out[key], value) : value;
    }
    return out as T;
  }
  return base === undefined ? (overlay as T) : base;
}

/** The `.deep.json` sibling of a data file url. */
export function overlayUrl(url: URL): URL {
  return new URL(url.href.replace(/\.json$/, ".deep.json"));
}

/** Applies the `.deep.json` sibling of `url` to `value` when it exists. */
export function withOverlay<T>(url: URL, value: T): T {
  const deep = overlayUrl(url);
  return existsSync(deep) ? mergeOverlay(value, JSON.parse(readFileSync(deep, "utf8"))) : value;
}
