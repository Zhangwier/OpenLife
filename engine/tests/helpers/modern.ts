/**
 * Shared test helpers for the modern world.
 */

import type { CommandIntent, OpenLifeModule } from "@openlife/contracts";
import { careerModule } from "@openlife/module-career";
import { educationModule } from "@openlife/module-education";
import { familyModule } from "@openlife/module-family";
import { modernWorldModule } from "@openlife/module-modern-world";
import { Simulation } from "@openlife/simulation";

export const MODERN_MODULES: OpenLifeModule[] = [
  modernWorldModule,
  educationModule,
  careerModule,
  familyModule,
];

export const TICKS_PER_YEAR = 12;

export function modernSimulation(seed = 4242): Simulation {
  return new Simulation({ worldSeed: seed, modules: MODERN_MODULES });
}

export function activeCharacterId(simulation: Simulation): string {
  return String(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId ??
      "",
  );
}

export function generation(simulation: Simulation): number {
  return Number(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.generation ?? 0,
  );
}

export function ageOf(simulation: Simulation, entityId: string): number {
  const entity = simulation.worldView().getEntity(entityId);
  if (!entity) return 0;
  const bornAt = Number(entity.components["modern.identity"]?.bornAt ?? entity.createdAt);
  return Math.floor((simulation.tick - bornAt) / TICKS_PER_YEAR);
}

export function isArchived(simulation: Simulation, entityId: string): boolean {
  return simulation.worldView().getEntity(entityId)?.archivedAt !== undefined;
}

export function cashOf(simulation: Simulation, entityId: string): number {
  const wealth = simulation.worldView().getComponent(entityId, "modern.wealth");
  return Number(wealth?.cash ?? 0);
}

export function mustDispatch(simulation: Simulation, intent: CommandIntent): void {
  const result = simulation.dispatch(intent);
  if (!result.ok) {
    throw new Error(
      `command ${intent.type} failed: ${result.errors.map((error) => `${error.code} ${error.message}`).join("; ")}`,
    );
  }
}

/** Advances in one-year steps until `entityId` dies. */
export function advanceUntilDead(
  simulation: Simulation,
  entityId: string,
  maxYears = 130,
): boolean {
  for (let year = 0; year < maxYears; year += 1) {
    if (isArchived(simulation, entityId)) return true;
    simulation.advanceBy(TICKS_PER_YEAR);
  }
  return isArchived(simulation, entityId);
}

/** Advances until the character is at least `years` old. */
export function advanceToAge(
  simulation: Simulation,
  entityId: string,
  years: number,
  maxYears = 130,
): boolean {
  for (let year = 0; year < maxYears; year += 1) {
    if (isArchived(simulation, entityId)) return false;
    if (ageOf(simulation, entityId) >= years) return true;
    simulation.advanceBy(TICKS_PER_YEAR);
  }
  return ageOf(simulation, entityId) >= years;
}

export interface LifeOptions {
  seed?: number;
  givenName?: string;
  familyName?: string;
  startingCash?: number;
  /** Fixed lifespan in years, so tests do not depend on the mortality draw. */
  lifespan?: number;
}

/**
 * Boots a world and creates one adult-capable character. Returns the
 * simulation and the character id.
 */
export function bootWorld(
  options: LifeOptions = {},
): { simulation: Simulation; characterId: string } {
  const simulation = modernSimulation(options.seed ?? 4242);
  mustDispatch(simulation, { type: "modern.initialize_world" });
  mustDispatch(simulation, {
    type: "modern.create_character",
    payload: {
      givenName: options.givenName ?? "Ada",
      familyName: options.familyName ?? "Stone",
      cityId: "modern:city:north",
      startingCash: options.startingCash ?? 20_000,
      ...(options.lifespan !== undefined ? { lifespan: options.lifespan } : {}),
    },
  });
  return { simulation, characterId: activeCharacterId(simulation) };
}

/**
 * A complete, deterministic life script used by the determinism tests.
 *
 * Lifespans are pinned so the script reaches the same milestones, and each
 * step is skipped once the character dies (mortality includes accidents, so a
 * scripted life must tolerate an early death rather than crash).
 */
export function runStandardLife(
  seed: number,
  options: { lifespan?: number; childLifespan?: number; startingCash?: number } = {},
): { simulation: Simulation; characterId: string } {
  const { simulation, characterId } = bootWorld({
    seed,
    startingCash: options.startingCash ?? 20_000,
    lifespan: options.lifespan ?? 85,
  });
  const steps: CommandIntent[] = [
    { type: "family.make_friend", actorId: characterId, payload: { targetName: "Bea" } },
    { type: "family.marry", actorId: characterId, payload: { spouseName: "Cy" } },
    {
      type: "family.have_child",
      actorId: characterId,
      payload: { givenName: "Dan", lifespan: options.childLifespan ?? 85 },
    },
    {
      type: "career.get_job",
      actorId: characterId,
      payload: { occupation: "engineer", companyName: "Northport Works" },
    },
    {
      type: "career.start_business",
      actorId: characterId,
      payload: { name: "Stone Atelier", capital: 5_000 },
    },
  ];
  if (!advanceToAge(simulation, characterId, 22)) {
    simulation.syncHistory();
    return { simulation, characterId };
  }
  for (const step of steps) {
    if (isArchived(simulation, characterId)) break;
    simulation.dispatch(step);
  }
  simulation.advanceBy(60 * TICKS_PER_YEAR);
  simulation.syncHistory();
  return { simulation, characterId };
}
