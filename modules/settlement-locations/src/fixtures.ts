/**
 * Furniture you can use: the things that stand in a room (a fire pit, a
 * spinning bench, an altar stone, a stall) and what sitting down at them does.
 *
 * The uses are data (`data/<pack>-fixtures.json`): which prototype, what it
 * costs (time, an item you hold), what it gives, who has to be there, and how
 * the people around you take it. A use only works on an object standing in
 * the very room you are in, so rooms matter. Split out of module.ts; it gets
 * the activity budget injected so it stays outside module.ts's import cycle.
 */
import { existsSync, readFileSync } from "node:fs";
import { withOverlay } from "./overlay.ts";
import type { Effect, JsonValue, WorldView } from "@openlife/contracts";
import { DAYS_PER_MONTH } from "@openlife/life-contracts";
import { occupiedPlaceId, occupiedSpaceId } from "@openlife/module-world-space";
import { ObjectComponents, ObjectKinds, ObjectRelations, prototypeOf } from "@openlife/module-world-objects";
import { RIVER_TERRACE_PACK, type SettlementPack } from "./content.ts";
import { refuse, type Registration } from "./rules.ts";
import { withBond } from "./social.ts";
import { SettlementCommands, SettlementComponents, SettlementRejection, residentId } from "./vocabulary.ts";
import { RESIDENTS, saveSocial, socialOf } from "./world-reads.ts";

export interface FixtureUse {
  id: string;
  /** Works on any object of this prototype standing in the room you are in. */
  prototypeId: string;
  label: string;
  hint: string;
  /** What happens, shown and logged ({name} = a villager there with you, when `with` names one). */
  line: string;
  /** Activity spent (0-3). */
  activity: number;
  /** Days before you can do it again (1 = once a day). */
  cooldownDays: number;
  /** One item of this resource you own and hold is used up. */
  needs?: string;
  /** What you walk away with (in hand). */
  gives?: { prototypeId: string; name: string; count?: number };
  /** Only when this villager is in the same place. */
  with?: string;
  /** How everyone in the same place takes it (familiarity / trust). */
  bond?: { familiarity?: number; trust?: number };
  seasons?: string[];
}

export interface FixtureBook { id: string; packId: string; formatVersion: number; note?: string; uses: FixtureUse[] }

export function validateFixtureBook(book: FixtureBook, pack: SettlementPack): string[] {
  const problems: string[] = [];
  if (book.formatVersion !== 1) problems.push(`fixture format ${book.formatVersion} is not 1`);
  if (book.packId !== pack.id) problems.push(`fixture book is for ${book.packId}, not ${pack.id}`);
  const protos = new Map(pack.prototypes.map((p) => [p.id, p]));
  const keys = new Set(pack.residents.map((r) => r.key));
  const seen = new Set<string>();
  for (const u of book.uses ?? []) {
    if (!u.id?.startsWith("fixture:")) problems.push(`use ${u.id}: id must start with fixture:`);
    if (seen.has(u.id)) problems.push(`duplicate fixture use ${u.id}`);
    seen.add(u.id);
    const p = protos.get(u.prototypeId);
    if (!p) problems.push(`use ${u.id}: unknown prototype ${u.prototypeId}`);
    else if (p.capabilities.includes("carryable")) problems.push(`use ${u.id}: ${p.name} is carried, not furniture`);
    if (!(Number.isInteger(u.activity) && u.activity >= 0 && u.activity <= 3)) problems.push(`use ${u.id}: activity must be 0-3`);
    if (!(Number.isInteger(u.cooldownDays) && u.cooldownDays >= 1)) problems.push(`use ${u.id}: cooldownDays must be at least 1`);
    if (u.needs && !pack.resourceLabels[u.needs]) problems.push(`use ${u.id}: unknown resource ${u.needs}`);
    if (u.gives && !protos.has(u.gives.prototypeId)) problems.push(`use ${u.id}: unknown gift ${u.gives.prototypeId}`);
    if (u.gives && !(u.gives.count === undefined || (u.gives.count >= 1 && u.gives.count <= 3))) problems.push(`use ${u.id}: gift count must be 1-3`);
    if (u.with && !keys.has(u.with)) problems.push(`use ${u.id}: unknown villager ${u.with}`);
    if (u.seasons && !u.seasons.every((s) => ["春", "夏", "秋", "冬"].includes(s))) problems.push(`use ${u.id}: unknown season`);
    if (!u.label || !u.line) problems.push(`use ${u.id}: label and line are required`);
    if (!u.gives && !u.bond && !u.needs) problems.push(`use ${u.id}: must give something, cost something or warm someone`);
  }
  return problems;
}

function loadFixtures(url: URL, pack: SettlementPack): FixtureBook {
  if (!existsSync(url)) return { id: "none", packId: pack.id, formatVersion: 1, uses: [] };
  const book = withOverlay(url, JSON.parse(readFileSync(url, "utf8")) as FixtureBook);
  const problems = validateFixtureBook(book, pack);
  if (problems.length) throw new Error(`fixture book ${url.pathname} is invalid:\n  ${problems.join("\n  ")}`);
  return book;
}

export const RIVER_TERRACE_FIXTURES: FixtureBook =
  loadFixtures(new URL("../data/river-terrace-fixtures.json", import.meta.url), RIVER_TERRACE_PACK);

type Activity = (world: WorldView, actorId: string) => { used: number; remaining: number };
/** Same calendar as module.ts's seasonOf (months 3-5 spring ... 12-2 winter). */
function seasonAt(tick: number): string {
  const month = (Math.floor(tick / DAYS_PER_MONTH) % 12) + 1;
  return month >= 3 && month <= 5 ? "春" : month >= 6 && month <= 8 ? "夏" : month >= 9 && month <= 11 ? "秋" : "冬";
}
const live = (world: WorldView, id: string) => { const e = world.getEntity(id); return Boolean(e && e.archivedAt === undefined); };

/** The furniture standing in the room you are in. */
function objectsHere(world: WorldView, actorId: string): string[] {
  const space = occupiedSpaceId(world, actorId);
  if (!space) return [];
  return world.listRelations({ type: ObjectRelations.containedIn, to: space }).map((r) => r.from).filter((id) => live(world, id)).sort();
}
function heldOwned(world: WorldView, actorId: string, resourceId: string): string[] {
  return world.listRelations({ type: ObjectRelations.heldBy, to: actorId }).map((r) => r.from)
    .filter((id) => live(world, id) && prototypeOf(world, id).resourceId === resourceId &&
      world.listRelations({ type: ObjectRelations.ownedBy, from: id })[0]?.to === actorId).sort();
}
function lastUsed(world: WorldView, actorId: string, useId: string): number {
  const raw = world.getComponent(actorId, SettlementComponents.holding)?.fixtureUsed;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? Number((raw as Record<string, JsonValue>)[useId] ?? -9999) : -9999;
}
const nameOf = (key: string) => RIVER_TERRACE_PACK.residents.find((r) => r.key === key)?.name ?? key;
const label = (r: string) => RIVER_TERRACE_PACK.resourceLabels[r] ?? r;

export function fixtureBlocker(world: WorldView, actorId: string, objectId: string, use: FixtureUse, activity: Activity): string {
  if (!objectsHere(world, actorId).includes(objectId) || prototypeOf(world, objectId).prototypeId !== use.prototypeId) return "要站在它所在的屋里";
  const since = world.tick - lastUsed(world, actorId, use.id);
  if (since < use.cooldownDays) return use.cooldownDays === 1 ? "今天已经做过了" : `过 ${use.cooldownDays - since} 天再来`;
  if (use.seasons && !use.seasons.includes(seasonAt(world.tick))) return `要等${use.seasons.join("、")}天`;
  if (use.with && occupiedPlaceId(world, residentId(use.with)) !== occupiedPlaceId(world, actorId)) return `${nameOf(use.with)}不在这儿`;
  if (use.needs && heldOwned(world, actorId, use.needs).length === 0) return `手里没有自己的${label(use.needs)}`;
  if (activity(world, actorId).remaining < use.activity) return `今天只剩 ${activity(world, actorId).remaining} 格活动时间`;
  return "";
}

/** One action per use of each piece of furniture in the room. */
export function fixtureActions(world: WorldView, actorId: string, activity: Activity) {
  const out: Array<{ id: string; label: string; hint: string; days: number; enabled: boolean; reason: string; payload: Record<string, JsonValue>; activityCost?: number }> = [];
  for (const objectId of objectsHere(world, actorId)) {
    const proto = prototypeOf(world, objectId).prototypeId;
    for (const use of RIVER_TERRACE_FIXTURES.uses.filter((u) => u.prototypeId === proto)) {
      const reason = fixtureBlocker(world, actorId, objectId, use, activity);
      out.push({ id: SettlementCommands.useFixture, label: use.label, hint: use.hint, days: 0, enabled: !reason, reason,
        payload: { objectId, useId: use.id }, ...(use.activity ? { activityCost: use.activity } : {}) });
    }
  }
  return out;
}

export function registerFixtures(ctx: Registration, activity: Activity): void {
  const useOf = (id: unknown) => RIVER_TERRACE_FIXTURES.uses.find((u) => u.id === String(id ?? ""));
  ctx.registerConstraintRule({
    id: `${SettlementCommands.useFixture}.allowed`,
    commandType: SettlementCommands.useFixture,
    evaluate: (c) => {
      const actorId = c.command.actorId ?? "";
      if (!c.world.hasEntity(actorId)) return refuse(SettlementRejection.NoSuchResident, "需要一位正在生活的人。");
      const use = useOf(c.command.payload.useId);
      if (!use) return refuse(SettlementRejection.Empty, "没有这样的用法。");
      const blocker = fixtureBlocker(c.world, actorId, String(c.command.payload.objectId ?? ""), use, activity);
      if (!blocker) return { ok: true };
      return refuse(blocker.startsWith("要站") ? SettlementRejection.WrongPlace : blocker.startsWith("今天只剩") ? SettlementRejection.Exhausted : SettlementRejection.Empty,
        `${use.label}：${blocker}。`);
    },
  });
  ctx.registerResolutionRule({
    id: `${SettlementCommands.useFixture}.resolve`,
    commandType: SettlementCommands.useFixture,
    resolve: (c) => {
      const me = c.command.actorId as string, tick = c.world.tick;
      const use = useOf(c.command.payload.useId)!;
      const objectId = String(c.command.payload.objectId);
      const effects: Effect[] = [];
      const holding = c.world.getComponent(me, SettlementComponents.holding);
      const used = holding?.fixtureUsed && typeof holding.fixtureUsed === "object" && !Array.isArray(holding.fixtureUsed) ? holding.fixtureUsed as Record<string, JsonValue> : {};
      const before = activity(c.world, me);
      effects.push({ kind: "modifyComponent", entityId: me, component: SettlementComponents.holding,
        patch: { fixtureUsed: { ...used, [use.id]: tick }, ...(use.activity ? { activityDay: tick, activityUsed: before.used + use.activity } : {}) },
        reason: `used ${use.id}` });
      const spent = use.needs ? heldOwned(c.world, me, use.needs).slice(0, 1) : [];
      for (const id of spent) effects.push({ kind: "removeRelation", type: ObjectRelations.heldBy, from: id, to: me, reason: `used up: ${use.label}`, announce: false },
        { kind: "archiveEntity", entityId: id, reason: `used up: ${use.label}`, announce: false });
      const made: string[] = [];
      for (let i = 0; i < (use.gives ? use.gives.count ?? 1 : 0); i++) {
        const id = `settlement-locations:fixture:${use.id.slice(8)}:${me.split(":").pop()}:${tick}${i ? `:${i}` : ""}`;
        made.push(id);
        effects.push({ kind: "spawnEntity", localId: `fixture-${i}`, id, entityKind: ObjectKinds.item, announce: false,
          components: { [ObjectComponents.object]: { prototypeId: use.gives!.prototypeId, name: use.gives!.name, condition: "made", quantity: 1,
            durability: 20, madeAt: tick, provenance: { fixtureUse: use.id, objectId, at: tick }, visibleFromOutside: true } as unknown as Record<string, never> } },
        { kind: "addRelation", type: ObjectRelations.instanceOf, from: id, to: use.gives!.prototypeId, announce: false },
        { kind: "addRelation", type: ObjectRelations.ownedBy, from: id, to: me, announce: false },
        { kind: "addRelation", type: ObjectRelations.heldBy, from: id, to: me, announce: false });
      }
      if (use.bond) {
        const place = occupiedPlaceId(c.world, me);
        for (const r of RESIDENTS) {
          const rid = residentId(r.key);
          if (rid === me || occupiedPlaceId(c.world, rid) !== place || !live(c.world, rid)) continue;
          effects.push(saveSocial(rid, withBond(socialOf(c.world, rid), me, use.bond, tick), `saw you: ${use.label}`));
        }
      }
      effects.push({ kind: "emitEvent", eventType: "settlement-locations.fixture_used", actorId: me, targetId: objectId,
        data: { useId: use.id, prototypeId: use.prototypeId, line: use.with ? use.line.replaceAll("{name}", nameOf(use.with)) : use.line,
          spent, made, placeId: occupiedPlaceId(c.world, me) }, historicalSignificance: 0.01 });
      return effects;
    },
  });
}
