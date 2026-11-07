/**
 * 交情怎么涨、涨了有什么用: for one villager, the ways that warm the bond
 * (gifts they love, where to find them, words not yet said today, friends
 * whose good word travels, rivals who notice whose side you take) and
 * everything a higher tier unlocks (heart-to-heart talks, favours, quests,
 * festival and event options, their own story beats), each marked reached
 * or not. Pure reads of the packs and the journal.
 */
import type { WorldView } from "@openlife/contracts";
import { RIVER_TERRACE_PACK, bondOf, heartsOf, residentId, socialOf } from "@openlife/module-settlement-locations";
import { BONDS_PACK, edgesOf, npcLabel, placeOfRoutineSpot, tierIndex, tierOfHearts } from "./bonds.ts";
import { resourceLabel, type Journal } from "./journal.ts";
import { STORY_PACK, saidFlag, type Requirements } from "./spec.ts";

const PLACE = (id: string) => RIVER_TERRACE_PACK.places.find((p) => p.id === id)?.name ?? id;

export interface Unlock { tier: string; tierName: string; kind: "心里话" | "帮忙" | "差事" | "节日" | "活动" | "交情事"; what: string; reached: boolean; done: boolean }

/** The tier a requirement asks of this villager, if it asks one. */
function tierAsked(r: Requirements | undefined, npc: string, speaker?: string): string | undefined {
  if (!r) return undefined;
  if (r.tierWith?.[npc]) return r.tierWith[npc];
  if (speaker === npc && r.minTier) return r.minTier;
  const hearts = r.hearts?.[npc] ?? (speaker === npc ? r.minHearts : undefined);
  if (hearts !== undefined) return tierOfHearts(hearts).id;
  return undefined;
}

export function warmthOf(world: WorldView, me: string, j: Journal, npc: string) {
  const hearts = heartsOf(bondOf(socialOf(world, residentId(npc)), me));
  const now = tierIndex(tierOfHearts(hearts).id);
  const person = RIVER_TERRACE_PACK.people?.[npc];
  const ways: string[] = [];
  if (person?.loves.length) ways.push(`送${person.loves.map(resourceLabel).join("、")}最打动人${person.likes.length ? `，${person.likes.map(resourceLabel).join("、")}也喜欢` : ""}${person.dislikes.length ? `；别送${person.dislikes.map(resourceLabel).join("、")}` : ""}`);
  const r = BONDS_PACK.routines[npc];
  if (r) ways.push(`常在：${(["晨", "午", "暮", "雨"] as const).filter((k) => r[k]).map((k) => `${k === "雨" ? "雨天" : k}${PLACE(placeOfRoutineSpot(r[k]!))}`).join("，")}——在那儿一起干活、偶遇都会更熟`);
  if (STORY_PACK.dialogues[npc]) ways.push(j.bonds.chatDay[npc] === world.tick ? "今天已经说过贴心话了，明天再聊还会更近" : `今天还没和${npcLabel(npc)}好好聊过：对话里的好话一天能暖一次交情`);
  for (const e of edgesOf(npc, j.bonds.reconciled)) {
    if (e.type === "rival") ways.push(`和${npcLabel(e.other)}${e.label}：吵架时帮${npcLabel(e.other)}说话，${npcLabel(npc)}会记仇；劝和两边都加信任`);
    else ways.push(`和${npcLabel(e.other)}是${e.label}：对${npcLabel(e.other)}好，${npcLabel(npc)}也看在眼里`);
  }

  const unlocks: Unlock[] = [];
  const push = (tier: string | undefined, kind: Unlock["kind"], what: string, done = false) => {
    if (!tier || tierIndex(tier) < 1) return;
    unlocks.push({ tier, tierName: BONDS_PACK.tiers[tierIndex(tier)]!.name, kind, what, reached: now >= tierIndex(tier), done });
  };
  const tree = STORY_PACK.dialogues[npc];
  for (const [nid, n] of Object.entries(tree?.nodes ?? {})) for (const o of n.options) {
    push(tierAsked(o.requires, npc, npc), "心里话", o.label, Boolean(o.once && j.flags.includes(saidFlag(npc, nid, o.id))));
  }
  for (const s of BONDS_PACK.services.filter((x) => x.npc === npc)) push(s.minTier, "帮忙", s.label);
  for (const q of STORY_PACK.quests) push(tierAsked(q.requires, npc, q.giver), "差事", `「${q.title}」`, j.quests[q.id]?.status === "done");
  for (const rite of STORY_PACK.festivalRites) push(tierAsked(rite.requires, npc), "节日", rite.label);
  for (const e of STORY_PACK.limitedEvents) for (const o of e.offers) push(tierAsked(o.requires, npc), "活动", `${e.name}：${o.label ?? o.id}`);
  for (const t of BONDS_PACK.tierEvents.filter((x) => x.npc === npc)) {
    push(t.tier, "交情事", now >= tierIndex(t.tier) ? t.text : "（到了这一步才知道）", (j.bonds.tierSeen[npc] ?? 0) >= tierIndex(t.tier));
  }
  unlocks.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier));
  return { ways, unlocks, next: unlocks.find((u) => !u.reached) ?? null };
}
