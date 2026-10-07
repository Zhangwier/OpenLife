import { test } from "node:test";
import assert from "node:assert/strict";
import { modernWorldModule } from "@openlife/module-modern-world";
import { historicalMemoryModule } from "@openlife/module-historical-memory";
import {
  historicalAnchorsModule,
  HistoricalAnchorComponents,
} from "@openlife/module-historical-anchors";
import { intellectualHistoryModule } from "@openlife/module-intellectual-history";
import { tickOfYear } from "@openlife/life-contracts";
import { Simulation } from "@openlife/simulation";

function must(sim: Simulation, intent: Parameters<Simulation["dispatch"]>[0]) {
  const result = sim.dispatch(intent);
  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("; "));
}

function setup(seed = 9501) {
  const sim = new Simulation({
    worldSeed: seed,
    modules: [
      modernWorldModule,
      historicalMemoryModule,
      intellectualHistoryModule,
      historicalAnchorsModule,
    ],
  });
  must(sim, { type: "modern.initialize_world" });
  must(sim, {
    type: "modern.create_character",
    payload: { givenName: "玩家", familyName: "氏", lifespan: 5000 },
  });
  return sim;
}

test("Confucius enters as a normal character at 551 BCE without receiving automatic fame", () => {
  const sim = setup();
  const confuciusId = "historical:person:confucius";

  sim.advanceTo(tickOfYear(-551));
  assert.equal(sim.worldView().getEntity(confuciusId), undefined);

  sim.advanceTo(tickOfYear(-550));
  const confucius = sim.worldView().getEntity(confuciusId);
  assert.ok(confucius);
  assert.equal(confucius.kind, "modern.character");
  assert.equal(confucius.components["modern.identity"]?.givenName, "丘");
  assert.equal(confucius.components[HistoricalAnchorComponents.identity]?.anchorId, "confucius");
  assert.equal(
    sim.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId,
    "modern:e1",
    "historical anchors must not steal player control",
  );

  const footprint = sim.project({
    id: "historical-memory.subject_footprint",
    params: { subjectId: confuciusId },
  });
  assert.equal(footprint.data?.state, "forgotten", "an anchor is not the same thing as fame");
});

test("historical people can use the same thought and memory systems as everyone else", () => {
  const sim = setup(9502);
  sim.advanceTo(tickOfYear(-550));
  const confuciusId = "historical:person:confucius";

  must(sim, {
    type: "intellectual-history.propose_idea",
    actorId: confuciusId,
    payload: {
      title: "礼与责任的讨论",
      thesis: "人与共同体的秩序需要通过长期实践与相互责任维系。",
      principles: ["修身", "责任", "礼的实践"],
      medium: "bamboo",
      markCreator: true,
    },
  });

  const footprint = sim.project({
    id: "historical-memory.subject_footprint",
    params: { subjectId: confuciusId },
  });
  assert.notEqual(footprint.data?.state, "forgotten");
  assert.equal(
    sim.worldView().listEntities({ kind: "intellectual-history.idea" }).length,
    1,
  );
  assert.equal(
    sim.worldView().listEntities({ kind: "historical-memory.work" }).length,
    1,
  );
});

test("approximate anchors preserve uncertainty instead of inventing precision", () => {
  const sim = setup(9503);
  sim.advanceTo(tickOfYear(-469));

  const publicAnchors = sim.project({ id: "historical-anchors.public", params: {} });
  const people = publicAnchors.data?.people as { anchorId: string; datePrecision: string; confidence: string }[];
  const mozi = people.find((person) => person.anchorId === "mozi");
  assert.ok(mozi);
  assert.equal(mozi.datePrecision, "approximate");
  assert.equal(mozi.confidence, "medium");
});
