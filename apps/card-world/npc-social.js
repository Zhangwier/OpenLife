// OpenLife CardWorld: first legacy cognition bridge.
// Derived from the archived autonomy/mind.ts and social-memory principles.
// Only a completed encounter/cooperation may change social state: suggestions never do.
import { PEOPLE_DATA } from "./people.js";

export const NPC_SOCIAL_VERSION = 1;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const limits = { familiarity: [0, 10], trust: [-6, 10], tension: [0, 10] };

export function stableUnit(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(":")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

// Personality is stable across reloads. Personality is hidden from player UI.
// The old mind model used five dimensions and three attributes; we start with
// the dimensions that actually affect CardWorld conversations, then expand.
export function npcTemperament(key) {
  const p = {
    diligence: 0.3 + stableUnit(key, "dil") * 0.6,
    sociability: 0.2 + stableUnit(key, "soc") * 0.7,
    generosity: 0.25 + stableUnit(key, "gen") * 0.6,
    caution: 0.2 + stableUnit(key, "cau") * 0.65,
    curiosity: 0.2 + stableUnit(key, "cur") * 0.7,
  };
  const archetype = key.split("_")[0];
  if (PEOPLE_DATA[archetype]?.fear?.id === "hunger") p.caution = Math.max(p.caution, 0.7);
  return p;
}

export const makeNpcSocial = () => ({ version: NPC_SOCIAL_VERSION, edges: Object.create(null) });
const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const keyOf = (a, b) => a + "|" + b;
const blank = () => ({ familiarity: 0, trust: 0, tension: 0, lastTalk: 0, lastHelp: "", memories: [] });

export function relationOf(graph, a, b) {
  if (!validId(a) || !validId(b) || a === b) return blank();
  return graph?.edges?.[keyOf(a, b)] ?? blank();
}
function ensure(graph, a, b) {
  const id = keyOf(a, b);
  return (graph.edges[id] ??= blank());
}
function change(edge, field, by) {
  edge[field] = clamp((Number(edge[field]) || 0) + by, ...limits[field]);
}
function memorize(edge, day, type, other, note) {
  // Bound ordinary interpersonal memory without removing important world history.
  edge.memories.unshift({ day, type, other, note });
  edge.memories.length = Math.min(edge.memories.length, 6);
}
export function recordNpcChat(graph, a, b, day) {
  if (!validId(a) || !validId(b) || a === b || !Number.isFinite(day)) return false;
  // One meaningful relationship update per pair per game day; no idle-loop farming.
  const x = ensure(graph, a, b), y = ensure(graph, b, a);
  if (x.lastTalk === day && y.lastTalk === day) return false;
  for (const [self, other, edge] of [[a, b, x], [b, a, y]]) {
    const p = npcTemperament(self);
    change(edge, "familiarity", 0.1 + p.sociability * 0.18);
    change(edge, "trust", 0.04 + p.generosity * 0.06);
    change(edge, "tension", -0.05);
    edge.lastTalk = day;
    memorize(edge, day, "conversation", other, "在一起交谈");
  }
  return true;
}
export function recordNpcCooperation(graph, a, b, day, task) {
  if (!validId(a) || !validId(b) || a === b || !Number.isFinite(day) || !validId(task)) return false;
  const x = ensure(graph, a, b), y = ensure(graph, b, a);
  const marker = day + ":" + task;
  if (x.lastHelp === marker && y.lastHelp === marker) return false;
  for (const [edge, other] of [[x, b], [y, a]]) {
    change(edge, "familiarity", 0.18);
    change(edge, "trust", 0.35);
    change(edge, "tension", -0.12);
    edge.lastHelp = marker;
    memorize(edge, day, "cooperation", other, "一起完成" + task);
  }
  return true;
}

export function willNpcChat(graph, a, b, { seed = 0, day = 1, slot = 0 } = {}) {
  if (!validId(a) || !validId(b) || a === b) return false;
  const pa = npcTemperament(a), pb = npcTemperament(b);
  const x = relationOf(graph, a, b), y = relationOf(graph, b, a);
  const bond = (x.familiarity + y.familiarity) / 20;
  const trust = (x.trust + y.trust) / 20;
  const tension = (x.tension + y.tension) / 20;
  const chance = clamp(0.11 + 0.36 * (pa.sociability + pb.sociability) / 2 +
    0.18 * bond + 0.12 * trust - 0.48 * tension, 0.04, 0.88);
  const pair = [a, b].sort();
  return stableUnit(seed, day, slot, ...pair, "chat") < chance;
}

export function restoreNpcSocial(graph, raw) {
  // Treat imported saves as untrusted. Never merge an older life into this life.
  graph.version = NPC_SOCIAL_VERSION;
  graph.edges = Object.create(null);
  if (!raw || raw.version !== NPC_SOCIAL_VERSION || !raw.edges || typeof raw.edges !== "object") return;
  for (const [id, e] of Object.entries(raw.edges)) {
    const ids = id.split("|");
    if (ids.length !== 2 || !ids.every(validId) || ids[0] === ids[1] || !e || typeof e !== "object") continue;
    graph.edges[id] = {
      familiarity: clamp(Number.isFinite(Number(e.familiarity)) ? Number(e.familiarity) : 0, 0, 10),
      trust: clamp(Number.isFinite(Number(e.trust)) ? Number(e.trust) : 0, -6, 10),
      tension: clamp(Number.isFinite(Number(e.tension)) ? Number(e.tension) : 0, 0, 10),
      lastTalk: Number.isFinite(e.lastTalk) ? e.lastTalk : 0,
      lastHelp: typeof e.lastHelp === "string" ? e.lastHelp : "",
      memories: Array.isArray(e.memories) ? e.memories.filter(m =>
        m && Number.isFinite(m.day) && validId(m.type) && validId(m.other) &&
        typeof m.note === "string").slice(0, 6).map(m => ({
          day: m.day, type: m.type, other: m.other, note: m.note.slice(0, 150)
        })) : [],
    };
  }
}
