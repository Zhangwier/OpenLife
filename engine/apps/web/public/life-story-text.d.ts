/** Types for life-story-text.js (the text life's words), for tests written in TypeScript. */
type State = Record<string, any>;
export interface Choice { id: string; payload: Record<string, unknown>; label: string; enabled?: boolean; reason?: string; hint?: string; cost?: string; next?: string; step?: Choice | null; [key: string]: unknown }
export interface ChoiceGroups {
  routes: { title: string; text: string; options: Choice[] }[];
  talk: { who: string; npc?: string; text: string; remark: string; later?: number; options: Choice[] }[];
  matters: { text: string; why: string; options: Choice[]; deadline?: number | null }[];
  here: Choice[]; go: Choice[]; time: Choice[]; blocked: Choice[];
}
export function hashStr(text: string): number;
export function dayName(day: number): string;
export function daypart(state: State): "morning" | "noon" | "afternoon" | "dusk" | "night";
export function dateLine(state: State): string;
export const dayKey: (state: State) => string;
export const seasonKey: (state: State) => string;
export const placeKey: (state: State) => string;
export function dayHeading(state: State): string;
export function sceneText(state: State): string;
export function chapterTitle(state: State): string;
export function costOf(action: Record<string, any>): string;
export function choiceGroups(state: State): ChoiceGroups;
export function searchIntent(state: State, query: string): Choice[];
export function newsSince(before: State, after: State): string[];
export function needsPlayer(before: State, after: State): string;
export function daysLeftInSeason(state: State): number;
export const nextSeason: (state: State) => string;
export function seasonFocuses(state: State): Choice[];
export function upcomingThisSeason(state: State): { text: string; inDays: number; why: string }[];
export function keyMatters(state: State): { kind: string; text: string }[];
export function seasonChanges(before: State, after: State): string[];
