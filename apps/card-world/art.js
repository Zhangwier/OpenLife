// Real art, when someone has drawn it: art/icons/<key>.png, art/ground/<name>.png, art/deco/<name>.png.
// Whatever is missing keeps the built-in vector stand-ins (see art/ART_BRIEF.md).
import { ICONS } from "./icons.js";

export const ICON_KEYS = ["you", "aunt", "yu", "cook", "digger", "dog", "house", "hut", "rack", "crackedJar", "jar", "greenware", "stove", "granary", "kiln",
  "field", "fieldRipe", "pit", "reeds", "river", "chestnut", "clay", "reed", "grain", "fish", "wood", "cooked", "door", "bed", "fire",
  "boatman", "anvil", "scree", "stone", "flint", "hemp", "fiber", "rope", "berries", "berry", "axe", "knife", "dock", "boat", "canoe",
  "torch", "roastFish", "roastMeat", "basket", "sandals", "net",
  "clams", "clam", "hammer", "plot", "bighouse", "barn",
  "deer", "boar", "duck", "nest", "egg", "spear",
  "tiger", "jungle", "mushroom", "pelt",
  "peachTree", "jujubeTree", "peach", "jujube"];
export const GROUND_KEYS = ["grass", "dirt", "water", "field"];
export const DECO_KEYS = ["tree1", "tree2", "bush", "rock", "grass_tuft", "flowers", "reeds_small"];

export const ground = {};   // name -> HTMLImageElement
export const deco = {};     // name -> HTMLImageElement

const load = (src) => new Promise((ok) => {
  const img = new Image();
  img.onload = () => ok(img.naturalWidth ? img : null);
  img.onerror = () => ok(null);
  img.src = src;
});

/** Look for drawn art; resolves when every file has been found or found missing. */
export async function loadArt() {
  const jobs = [
    ...ICON_KEYS.map(async (k) => { const img = await load(`art/icons/${k}.png`); if (img) ICONS[k] = `<img class="art" src="${img.src}" alt="" draggable="false">`; return img; }),
    ...GROUND_KEYS.map(async (k) => (ground[k] = await load(`art/ground/${k}.png`))),
    ...DECO_KEYS.map(async (k) => (deco[k] = await load(`art/deco/${k}.png`))),
  ];
  const found = (await Promise.all(jobs)).filter(Boolean).length;
  for (const o of [ground, deco]) for (const k of Object.keys(o)) if (!o[k]) delete o[k];
  return found;
}
