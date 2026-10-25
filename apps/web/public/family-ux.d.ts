export function summarizeFamily(nodes: { current?: boolean; alive?: boolean; generation?: number }[]): { total: number; alive: number; gens: number; text: string };
export function parseNode(el: Element): { current: boolean; alive: boolean; generation: number; name: string };
export function installFamilyUx(): void;
