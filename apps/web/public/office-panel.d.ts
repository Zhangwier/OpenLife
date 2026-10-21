/**
 * Types for office-panel.js (plain browser JS, also imported by tests).
 *
 * The panel is whatever the `office.panel` / `office.registry` projections
 * return, so it is described structurally and leaves unknown fields alone:
 * adding a field to the projection must not require touching this file.
 */
export interface OfficeOption {
  id: string;
  label: string;
  available: boolean;
  /** Why the option is unavailable. Shown, never swallowed (DESIGN.md §9). */
  why?: string;
}

export interface OfficePanelState {
  holding?: { officeId?: string; label: string } | null;
  standing?: number;
  matter?: { id?: string; title: string; options: OfficeOption[] } | null;
  race?: {
    officeId?: string; label: string; candidates: number; leaningToMe: number; closesInDays: number;
  } | null;
  pledges?: Array<{ to: string; what: string }> | null;
  [key: string]: unknown;
}

export interface OfficeRegistryState {
  missingFacilities?: Array<{ tag?: string; name: string; why: string }> | null;
  [key: string]: unknown;
}

export function degree(ratio: number): string;
export function daysLeft(days: number): string;
export function renderOffice(panel: OfficePanelState | null, registry: OfficeRegistryState | null): string;
export function installOffice(
  root: HTMLElement | null,
  opts: {
    getState: () => { panel: OfficePanelState | null; registry: OfficeRegistryState | null };
    send: (action: string, payload?: Record<string, unknown>) => void;
  },
): void;
