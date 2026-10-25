export const SHARED_LIMIT: string;
export function uniqueLimit(text: unknown): string;
export function totals(packs: { regions: number; locations: number; edges: number }[]): { regions: number; locations: number; edges: number };
export function summaryMarkup(packs: { label: string; regions: number; locations: number; edges: number }[]): string;
export function enhance(screen: Element | null): void;
