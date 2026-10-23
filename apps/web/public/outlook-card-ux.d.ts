export function cn(n: number): string;
export function words(text: unknown): string;
export function splitWhen(when: unknown): { date: string; note: string };
export function calendarRows(lines: unknown): Array<{ date: string; note: string; what: string }>;
export function goalData(goals: unknown): {
  stageName: string; ladder: string[]; now: number; today: string[];
  season: Array<{ text: string; done: boolean }>; nextName: string;
};
export function ladderHtml(names: string[], now: number, label: string): string;
export function moodLine(director: unknown): { line: string; label: string };
export function renderToday(outlook: unknown): string;
export function goMeta(d: Record<string, unknown>): string;
export function stagesHtml(life: unknown): string;
export function renderLife(outlook: unknown): string;
export function paintOutlookCards(state: unknown): void;
export function installOutlookCards(): void;
