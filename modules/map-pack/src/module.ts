/**
 * Map Pack module - the registration surface for authored world maps.
 *
 * Step 1 scope: this module owns *no* geography truth of its own. It depends on
 * `world-geography` for the spatial model and only adds the loader / inspector
 * pair plus one projection. That is deliberate: a Map Pack is data, and the
 * loader is a tool, not a second spatial system.
 *
 * The module is `optional` on nothing and `requires` world geography, so the
 * module runtime refuses to install it into a world that cannot hold a map.
 */

import type { OpenLifeModule } from "@openlife/contracts";
import { GeographyKinds } from "@openlife/module-world-geography";

const OWNER = "map-pack";

export const MapPackProjections = {
  summary: "map-pack.summary",
} as const;

export const mapPackModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Map Pack Loader",
    description: "Loads authored Map Packs (manifest + regions/locations/edges/anchors) into the world geography model.",
    requires: ["world.geography"],
    provides: ["world.map-packs"],
    capabilities: ["projection.register"],
  },

  register(ctx) {
    ctx.registerProjection({
      id: MapPackProjections.summary,
      description: "Summarize the geography currently registered by loaded map packs, grouped by pack namespace.",
      build: ({ world }) => {
        const regionEntities = world.listEntities({ kind: GeographyKinds.region });
        const locationEntities = world.listEntities({ kind: GeographyKinds.location });
        const anchorEntities = world.listEntities({ kind: GeographyKinds.boundaryAnchor });
        const adjacency = world.listRelations({ type: GeographyRelations.adjacentTo });

        // Entity ids are `<packId>:<kind>:<localId>`; the first segment is the pack.
        const packs = new Map<string, { regions: number; locations: number; boundaryAnchors: number }>();
        const bump = (id: string, field: "regions" | "locations" | "boundaryAnchors"): void => {
          const packId = id.split(":")[0] ?? "unknown";
          const entry = packs.get(packId) ?? { regions: 0, locations: 0, boundaryAnchors: 0 };
          entry[field] += 1;
          packs.set(packId, entry);
        };
        for (const entity of regionEntities) bump(entity.id, "regions");
        for (const entity of locationEntities) bump(entity.id, "locations");
        for (const entity of anchorEntities) bump(entity.id, "boundaryAnchors");

        return {
          packs: [...packs.entries()]
            .map(([packId, counts]) => ({ packId, ...counts }))
            .sort((a, b) => a.packId.localeCompare(b.packId)),
          totals: {
            regions: regionEntities.length,
            locations: locationEntities.length,
            // Stored adjacency is symmetric, so each authored edge is two rows.
            edges: adjacency.length / 2,
            boundaryAnchors: anchorEntities.length,
          },
        };
      },
    });
  },
};
