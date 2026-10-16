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
import { RIVER_TERRACE_PACK } from "@openlife/module-settlement-locations";

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
  const resourceNames: Record<string, string> = RIVER_TERRACE_PACK.resourceLabels ?? {};
  const recipes = RIVER_TERRACE_PACK.recipes ?? [];
  return {
    items: RIVER_TERRACE_PACK.prototypes.map((p) => ({
      id: p.id, name: p.name, material: p.material, unit: p.unit, mass: p.mass, capacity: p.capacity,
      durability: p.durability, category: resourceNames[p.resourceId] ?? "",
      capabilities: p.capabilities.map((c) => CAPABILITY_LABELS[c] ?? c),
      madeBy: recipes.filter((r) => r.output?.prototypeId === p.id).map((r) => r.label),
    })),
    recipes: recipes.map((r) => {
      return {
        id: r.id, name: r.label, skill: "", description: r.hint ?? "",
        where: r.spaceId,
        placeId: "",
        inputs: (r.inputs ?? []).map((i) => ({ name: resourceNames[i.resourceId] ?? i.resourceId, count: i.count })),
        tools: r.tool ? [names.get(r.tool) ?? r.tool] : [],
        outputs: r.output ? [{ name: r.output.name ?? names.get(r.output.prototypeId) ?? r.output.prototypeId, count: 1 }] : [],
        ready: false, reason: "进入聚落后才能制作。",
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
