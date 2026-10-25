export function groupKey(text: string): "core" | "on" | "off" | "idle" | "";
export const FILTERS: [string, string][];
export function filterLabel(key: string, n: number): string;
export function installModulesUx(): void;
