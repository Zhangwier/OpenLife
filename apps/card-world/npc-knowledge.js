// Individual beliefs and knowledge provenance, adapted from archived epistemic-state.
// World truth belongs to the simulation; this ledger records only what a person thinks.
import { npcTemperament, stableUnit, relationOf } from "./npc-social.js";
export const NPC_KNOWLEDGE_VERSION = 1;
const valid = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id) && !["__proto__", "constructor", "prototype"].includes(id);
const bounded = (v) => Math.max(0, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0));
export const makeNpcKnowledge = () => ({ version: NPC_KNOWLEDGE_VERSION, holders: Object.create(null) });
export const knowledgeOf = (ledger, holder, theoryId) => ledger?.holders?.[holder]?.[theoryId] ?? null;
export function acquireTheory(ledger, holder, theoryId, { day, source = "observation", awareness = "examined", stance = "accepts", confidence = 0.5, evidenceIds = [] } = {}) {
  if (!valid(holder) || !valid(theoryId) || !Number.isFinite(day)) return false;
  if (!["heard", "examined"].includes(awareness) || !["undecided", "accepts", "rejects"].includes(stance)) return false;
  const by = (ledger.holders[holder] ??= Object.create(null));
  if (by[theoryId]) return false;
  by[theoryId] = {
    day, source: String(source).slice(0, 100), awareness, stance,
    confidence: bounded(confidence),
    evidenceIds: Array.isArray(evidenceIds) ? evidenceIds.filter(valid).slice(0, 12) : [],
  };
  return true;
}
export function transmitTheory(ledger, source, target, theoryId, { day, trusted = false } = {}) {
  if (!valid(source) || !valid(target) || source === target || !knowledgeOf(ledger, source, theoryId)) return false;
  // Hearing a claim is not the same as validating it. No field reveals truth.
  return acquireTheory(ledger, target, theoryId, {
    day, source: "person:" + source, awareness: "heard",
    stance: trusted ? "accepts" : "undecided", confidence: trusted ? 0.55 : 0.25,
    evidenceIds: [],
  });
}
export function chooseTheoryToShare(ledger, social, a, b, day, slot, seed = 0) {
  if (!valid(a) || !valid(b) || a === b) return null;
  const possibilities = [];
  for (const [from, to] of [[a, b], [b, a]]) for (const theoryId of Object.keys(ledger.holders[from] ?? {})) {
    if (!knowledgeOf(ledger, to, theoryId)) possibilities.push({ from, to, theoryId });
  }
  if (!possibilities.length) return null;
  possibilities.sort((x, y) => (x.theoryId + x.from).localeCompare(y.theoryId + y.from));
  const i = Math.floor(stableUnit(seed, day, slot, a, b, "topic") * possibilities.length);
  const candidate = possibilities[i];
  const speaker = npcTemperament(candidate.from);
  const bond = relationOf(social, candidate.from, candidate.to);
  const chance = Math.max(0.08, Math.min(0.75, 0.2 + speaker.sociability * 0.32 + bond.trust * 0.025 - bond.tension * 0.045));
  return stableUnit(seed, day, slot, a, b, "share") < chance ? candidate : null;
}
export function restoreNpcKnowledge(ledger, raw) {
  ledger.version = NPC_KNOWLEDGE_VERSION;
  ledger.holders = Object.create(null);
  if (!raw || raw.version !== NPC_KNOWLEDGE_VERSION || !raw.holders || typeof raw.holders !== "object") return;
  for (const [holder, known] of Object.entries(raw.holders)) {
    if (!valid(holder) || !known || typeof known !== "object") continue;
    for (const [theoryId, entry] of Object.entries(known)) {
      if (!valid(theoryId) || !entry || typeof entry !== "object") continue;
      acquireTheory(ledger, holder, theoryId, {
        day: Number.isFinite(entry.day) ? entry.day : 1,
        source: entry.source, awareness: ["heard", "examined"].includes(entry.awareness) ? entry.awareness : "heard",
        stance: ["undecided", "accepts", "rejects"].includes(entry.stance) ? entry.stance : "undecided",
        confidence: entry.confidence, evidenceIds: entry.evidenceIds,
      });
    }
  }
}
