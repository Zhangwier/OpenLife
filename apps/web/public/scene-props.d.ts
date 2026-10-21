/** Types for scene-props.js (plain browser JS, also imported by tests). */
export interface SceneObject { prototypeId?: string; name?: string; capacity?: number; contentsCount?: number; quantity?: number; [key: string]: unknown }
export function objectKind(obj: SceneObject): string;
export function resourceKind(id: string): string;
export function fillRatio(obj: SceneObject): number;
export function propSvg(kind: string, level?: number): string;
export function slotFor(place: string, kind: string, index: number): [number, number];
