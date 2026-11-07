/**
 * 河岸的天时与动物：把 world-hazard / fauna-bonds 的状态翻成玩家看得懂的一句话和几个动作。
 * 只读投影与组件，所有改变都通过 Command 进入世界。
 */
import type { Simulation } from "@openlife/simulation";
import { HazardComponents, type HazardState, type HazardStage } from "@openlife/module-world-hazard";
import { FaunaKinds, FaunaComponents, FaunaTuning, type FaunaAnimal } from "@openlife/module-fauna-bonds";
import { RIVER_PLACE, NatureSpecies } from "@openlife/module-settlement-nature";

const FLOOD_LINES: Partial<Record<HazardStage, string>> = {
  omen: "河水浑黄，一天比一天涨。老人说，这是要发大水的样子。",
  active: "大水漫上了河滩！河边、渡口、芦苇滩和黏土坑这几天都去不了。",
  aftermath: "大水退了，河滩上留下一层淤泥和冲来的树枝。",
};
const DROUGHT_LINES: Partial<Record<HazardStage, string>> = {
  omen: "好些天没下雨了，地上开始裂缝。",
  active: "大旱：河水退得见了底，地里的苗都蔫了。",
  aftermath: "总算下了雨，旱情缓了过来。",
};
const EARTHWORK_DAYS = 3;

/** Each half of the nature view is a plugin: either may be switched off (docs/PLUGINS.md). */
const has = (sim: Simulation, moduleId: string) => sim.modules.get(moduleId)?.state === "active";

/** Put the river watch and the two local animals into a settlement world. Idempotent. */
export function ensureNature(sim: Simulation): void {
  const world = sim.worldView();
  if (!world.getEntity(RIVER_PLACE)) return;
  if (has(sim, "world-hazard")) {
    // The scheduler dedupes on the watch key, so repeating this is harmless.
    sim.dispatch({ type: "world-hazard.watch_location", targetId: RIVER_PLACE, payload: { everyTicks: 1 }, source: "system" });
  }
  if (has(sim, "fauna-bonds") && has(sim, "settlement-nature") && world.listEntities({ kind: FaunaKinds.animal }).length === 0) {
    sim.dispatch({ type: "fauna-bonds.materialize", targetId: "place:yard", payload: { speciesId: NatureSpecies.dog, name: "阿黄" }, source: "system" });
    sim.dispatch({ type: "fauna-bonds.materialize", targetId: "place:reedbed", payload: { speciesId: NatureSpecies.wolf, name: "灰脊" }, source: "system" });
  }
}

export function natureView(sim: Simulation, actorId: string, placeId: string | undefined): Record<string, unknown> | null {
  const world = sim.worldView();
  if (!world.getEntity(RIVER_PLACE)) return null;
  const hazard = world.getComponent(RIVER_PLACE, HazardComponents.state) as unknown as HazardState | undefined;
  const lines: string[] = [];
  if (hazard) {
    const f = FLOOD_LINES[hazard.flood.stage];
    const d = DROUGHT_LINES[hazard.drought.stage];
    if (f) lines.push(f);
    if (d) lines.push(d);
  }
  if (!has(sim, "world-hazard") && !has(sim, "fauna-bonds")) return null;
  const earthworks = world.listRelations({ type: "world-hazard.protects", to: RIVER_PLACE }).length;
  const actions: Record<string, unknown>[] = [];
  if (has(sim, "world-hazard") && placeId === RIVER_PLACE && earthworks < 3) {
    actions.push({ id: "nature.build_earthwork", label: earthworks ? "把河堤再加高一段" : "在河边垒一段土堤", hint: `花 ${EARTHWORK_DAYS} 天挑土夯实，以后涨水时河滩没那么容易被淹。`, payload: {} });
  }

  const animals = world.listEntities({ kind: FaunaKinds.animal }).map((entity) => {
    const a = entity.components[FaunaComponents.animal] as unknown as FaunaAnimal;
    return { id: entity.id, a };
  }).filter(({ a }) => a.locationId === placeId || a.keeperId === actorId);

  const seen = animals.map(({ id, a }) => {
    const bond = a.bonds[actorId] ?? { trust: 0, grudge: 0 };
    const isWolf = a.speciesId === NatureSpecies.wolf;
    const attitude = sim.project({ id: "fauna-bonds.animal", params: { animalId: id, personId: actorId } }).data?.attitude as string | undefined;
    let line: string;
    if (a.keeperId === actorId) line = `${a.name}摇着尾巴跟在你身边。`;
    else if (attitude === "hostile") line = `${a.name}远远盯着你，龇着牙——它记得你。`;
    else if (attitude === "fearful") line = `${a.name}一见你就往后缩。`;
    else if (attitude === "friendly") line = isWolf ? `${a.name}在苇丛边徘徊，没有躲开你。` : `${a.name}凑过来嗅你的手。`;
    else line = isWolf ? `芦苇丛里有一头狼，${a.name}，正打量着你。` : `${a.name}在院子边上警惕地看着你。`;
    const fedToday = bond.lastFedAt === world.tick;
    if (a.keeperId !== actorId) {
      actions.push({ id: "nature.feed", label: `喂${a.name}一点吃的`, hint: isWolf ? "狼不会被驯服，但它可能记住你的好。" : "每天喂一次，慢慢它会信你。", payload: { animalId: id }, enabled: !fedToday, reason: fedToday ? "今天已经喂过了" : "" });
      if (!isWolf && a.stage === "habituated") {
        const ready = bond.trust >= FaunaTuning.tameAt;
        actions.push({ id: "nature.tame", label: `试着收养${a.name}`, hint: "成功的话，它会跟着你。", payload: { animalId: id }, enabled: ready, reason: ready ? "" : "它还不够信你，再喂几天" });
      }
      if (isWolf) actions.push({ id: "nature.drive_off", label: `扔石头赶走${a.name}`, hint: "它会记仇。", payload: { animalId: id } });
    }
    return { id, name: a.name, kind: isWolf ? "狼" : "狗", stage: a.stage, line };
  });

  return { lines, earthworks, animals: seen, actions };
}

/**
 * Adds the nature view (weather hazards, animals) beside the settlement one.
 *
 * Lives here, not in the settlement projection, so that module stays free of
 * nature and hazard vocabulary; and not in server.ts, which is already over its
 * size ceiling.
 */
export function withNature(
  sim: Simulation,
  view: Record<string, unknown> | null,
  actorId: string,
): Record<string, unknown> | null {
  if (!view) return view;
  try {
    return { ...view, nature: natureView(sim, actorId, view.placeId as string | undefined) };
  } catch {
    // A world without the nature module still plays; the extra view is optional.
    return view;
  }
}

export function runNatureAction(sim: Simulation, actorId: string, action: string, payload: Record<string, unknown>) {
  const animalId = String(payload.animalId ?? "");
  const nameOf = () => (sim.worldView().getComponent(animalId, FaunaComponents.animal) as unknown as FaunaAnimal | undefined)?.name ?? "它";
  const say = (result: ReturnType<Simulation["dispatch"]>, message: string) => ({ ...result, message: result.ok ? message : undefined });
  switch (action) {
    case "nature.feed":
      return say(sim.dispatch({ type: "fauna-bonds.feed", actorId, targetId: animalId, source: "player" }), `你分了${nameOf()}一口吃的。`);
    case "nature.tame": {
      const result = sim.dispatch({ type: "fauna-bonds.tame", actorId, targetId: animalId, source: "player" });
      const tame = (sim.worldView().getComponent(animalId, FaunaComponents.animal) as unknown as FaunaAnimal | undefined)?.keeperId === actorId;
      return say(result, tame ? `${nameOf()}认了你，从此跟着你走。` : `${nameOf()}往后一跳，还没准备好跟你走。`);
    }
    case "nature.drive_off":
      return say(sim.dispatch({ type: "fauna-bonds.harm", actorId, targetId: animalId, source: "player" }), `石头砸中了${nameOf()}，它夹着尾巴逃进了苇丛。`);
    case "nature.build_earthwork": {
      const result = sim.dispatch({ type: "world-hazard.build_earthwork", actorId, targetId: RIVER_PLACE, payload: { name: "河边土堤" }, source: "player" });
      if (result.ok) sim.advanceBy(EARTHWORK_DAYS);
      return say(result, `你挑土夯了 ${EARTHWORK_DAYS} 天，河边多了一段土堤。`);
    }
    default:
      return { ok: false, errors: [{ code: "E_NATURE_ACTION", message: "未知的动作" }] };
  }
}
