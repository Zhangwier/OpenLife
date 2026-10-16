/**
 * The codex: read-only content the web client shows as a reference book -
 * every object prototype with its properties, the recipe book (with whether
 * the active character could make each one right now), the residents with
 * their portraits, the world-setting text and the background music list.
 *
 * Nothing here changes world state; crafting itself goes through
 * /api/action with `settlement-locations.craft` like every other action.
 */
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Simulation } from "@openlife/simulation";
import { RIVER_TERRACE_PACK, RIVER_TERRACE_RECIPES, craftOptions } from "@openlife/module-settlement-locations";

const PUBLIC = fileURLToPath(new URL("../public/", import.meta.url));
const LORE = JSON.parse(readFileSync(
  fileURLToPath(new URL("../../../modules/settlement-locations/data/river-terrace-lore.json", import.meta.url)), "utf8",
)) as { sections: { id: string; title: string; paragraphs: string[] }[] };

/** Background tracks shipped in public/audio, with where each one fits. */
export const MUSIC_TRACKS = [
  { id: "river-morning", title: "河岸晨光", mood: "宫调式 · 慢板", fits: "庭院、河边、旱地的白天", src: "/audio/river-morning.ogg" },
  { id: "hearth-evening", title: "灶火黄昏", mood: "羽调式 · 低回", fits: "公用灶台与夜晚", src: "/audio/hearth-evening.ogg" },
  { id: "kiln-fire", title: "窑火", mood: "徵调式 · 陶鼓", fits: "陶窑与劳作", src: "/audio/kiln-fire.ogg" },
] as const;

const CAPABILITY_LABELS: Record<string, string> = {
  carryable: "可携带", container: "容器", "liquid-holder": "可盛水", storage: "可储存", edible: "可食用",
  workable: "可加工", burnable: "可燃", fixture: "固定设施", "sleep-on": "可睡卧", tool: "工具",
  wearable: "可穿戴", warm: "保暖", instrument: "乐器",
};

export function codex(simulation: Simulation, actorId: string) {
  const names = new Map(RIVER_TERRACE_PACK.prototypes.map((p) => [p.id, p.name]));
  const places = new Map(RIVER_TERRACE_PACK.places.map((p) => [p.id, p]));
  const options = actorId && simulation.worldView().hasEntity(actorId)
    ? new Map(craftOptions(simulation.worldView(), actorId).map((o) => [o.recipeId, o]))
    : new Map();
  return {
    items: RIVER_TERRACE_PACK.prototypes.map((p) => ({
      id: p.id, name: p.name, material: p.material, unit: p.unit, mass: p.mass, capacity: p.capacity,
      durability: p.durability, category: RIVER_TERRACE_PACK.resourceLabels[p.resourceId] ?? "",
      capabilities: p.capabilities.map((c) => CAPABILITY_LABELS[c] ?? c),
      madeBy: RIVER_TERRACE_RECIPES.recipes.filter((r) => r.outputs.some((o) => o.prototypeId === p.id)).map((r) => r.name),
    })),
    recipes: RIVER_TERRACE_RECIPES.recipes.map((r) => {
      const place = places.get(r.placeId);
      const option = options.get(r.id);
      return {
        id: r.id, name: r.name, skill: r.skill, description: r.description,
        where: `${place?.name ?? r.placeId} · ${place?.spaces.find((s) => s.id === r.spaceId)?.name ?? r.spaceId}`,
        placeId: r.placeId,
        inputs: r.inputs.map((i) => ({ name: names.get(i.prototypeId) ?? i.prototypeId, count: i.count })),
        tools: r.tools.map((t) => names.get(t) ?? t),
        outputs: r.outputs.map((o) => ({ name: names.get(o.prototypeId) ?? o.prototypeId, count: o.count })),
        ready: Boolean(option?.ready), reason: option?.reason ?? "进入聚落后才能制作。",
      };
    }),
    residents: RIVER_TERRACE_PACK.residents.map((r) => {
      const portrait = `/art/portraits/${r.key}.jpg`;
      return {
        key: r.key, name: r.name, age: r.age, role: r.role, trait: r.trait, wish: r.wish, household: r.household,
        portrait: existsSync(`${PUBLIC}art/portraits/${r.key}.jpg`) ? portrait : "",
      };
    }),
    lore: LORE.sections,
    music: MUSIC_TRACKS,
  };
}
