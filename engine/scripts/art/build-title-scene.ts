/**
 * Bakes the title-screen backdrop: one fixed courtyard laid out by the same
 * rules as every playable scene, so the title shows the game's own world.
 *   node scripts/art/build-title-scene.ts
 */
import { writeFileSync } from "node:fs";
import { buildLayout } from "../../modules/world-space/src/local-map.ts";

const layout = buildLayout({
  placeId: "place:title", placeType: "yard", spaceId: "space:title", spaceType: "work",
  siblings: [{ id: "space:a", name: "主屋", spaceType: "sleep" }, { id: "space:b", name: "储粮", spaceType: "storage" }],
});
const out = { note: "Title-screen backdrop: a fixed courtyard from modules/world-space/src/local-map.ts (regenerate with scripts/art/build-title-scene.ts).", ...layout };
writeFileSync(new URL("../../apps/web/public/art/map/title-scene.json", import.meta.url), JSON.stringify(out));
console.log(`title scene ${layout.width}x${layout.height}, ${layout.props.length} props`);
