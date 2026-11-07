/**
 * Types for the phase 2/3 outlook panel (`outlook-ux.js`), which is a plain
 * browser module with no build step. Only the exports the tests and `app.js`
 * reach for are declared; everything is `unknown`-ish on purpose, because the
 * panel reads whatever the server's projections happen to contain.
 */
export function stageLine(life: unknown): string;
export function calendarBlock(calendar: unknown): string;
export function goalBlock(goals: unknown): string;
export function moodBlock(director: unknown): string;
export function secretBlock(secrets: unknown): string;
export function wantBlock(wants: unknown): string;
export function travelBlock(travel: unknown): string;
export function renderOutlookToday(outlook: unknown): string;
export function renderOutlookLife(outlook: unknown): string;
export function paintOutlook(state: unknown): void;
export function installOutlook(): void;

