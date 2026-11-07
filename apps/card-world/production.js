// CardWorld production rules build a plan without touching live cards or the DOM.
import { SEEDS, droughtDays, harvestYield, soilAfterHarvest } from "./ecology-chain.js";

export function planProduction({ kind, source, season, cost = 0, credit = 0, cards = [], use = [], output = [], woodSubstitute = false }) {
  const planting = kind === "sow";
  if (planting) {
    if (season !== "春" || !["field", "field2"].includes(source?.key) || source.sown !== false) return null;
    use = SEEDS.includes(use[0]) ? [use[0]] : ["grain"];
  }
  if (kind === "harvest") {
    if (season !== "秋" || !["field", "field2"].includes(source?.key) || source.sown === false
      || !Number.isInteger(source.stock) || source.stock < 1) return null;
    const crop = source.crop ?? "grain";
    return { inputs: [], stock: { stock: 0, sown: false, soil: soilAfterHarvest(source), cropped: true, lastCrop: crop, crop: undefined },
      output: Array(harvestYield(source)).fill(crop) };
  }
  if (!Number.isInteger(cost) || cost < 0 || !Number.isInteger(credit) || credit < 0) return null;
  if ((cost || credit) && (!Number.isFinite(source?.stock) || source.stock < cost)) return null;
  const available = [...cards];
  const inputs = [];
  for (const key of use) {
    const index = available.findIndex((card) => card.key === key || (woodSubstitute && key === "wood" && card.key === "log"));
    if (index === -1) return null;
    inputs.push(...available.splice(index, 1));
  }
  const stock = planting ? { stock: 0, sown: true, crop: use[0] } : cost || credit ? { stock: source.stock - cost + credit } : {};
  return { inputs, stock, output };
}

export function cropWeather(field, { day, season, rain, rainGrowth, dryDays }) {
  if (field.sown === false || (season !== "春" && season !== "夏")) return null;
  const stock = field.stock ?? 0;
  if (rain && rainGrowth && stock < 3) return { stock: stock + 1, cause: "rain" };
  if (!rain && season === "夏" && dryDays >= droughtDays(field) && field.tendDay !== day - 1 && stock > 0) {
    return { stock: stock - 1, cause: "drought" };
  }
  return null;
}

const EVENT_LIMIT = 256;

export function productionHistory(saved) {
  const events = Array.isArray(saved?.events) ? saved.events.slice(-EVENT_LIMIT) : [];
  return { events, seq: Math.max(events.at(-1)?.seq ?? 0, Number.isSafeInteger(saved?.seq) ? saved.seq : 0) };
}

export function recordProduction(history, event) {
  history.events.push({ ...event, seq: ++history.seq });
  if (history.events.length > EVENT_LIMIT) history.events.shift();
}
