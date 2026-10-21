/** Types for character-appearance.js (plain browser JS, also imported by tests). */
export interface Appearance {
  id: string; head: number; eyes: number; mouth: number; hair: number; body: number; arms: number;
  skin: string; fabric: string; hairColor: string; pattern: number; sash: string;
  isCook: boolean; elder: boolean; seed: number;
}
export function appearanceFor(id: string, role?: string): Appearance;
export function renderFigure(id: string, role?: string): string;
