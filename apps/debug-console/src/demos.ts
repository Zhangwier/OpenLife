/**
 * Debug console - scripted demonstrations.
 *
 * `modern` runs one full modern-world life plus a generation switch, proving
 * the MVP criteria. `magic` runs a completely different ontology through the
 * same kernel.
 *
 * Both demos drive the DebugConsole rather than a Simulation directly, so the
 * console's journal captures every command and can replay it for the
 * determinism check.
 */

import type { CommandIntent, OpenLifeModule } from "@openlife/contracts";
import { Simulation } from "@openlife/simulation";
import { DebugConsole } from "./console.ts";
import { section } from "./format.ts";

const TICKS_PER_YEAR = 12;

export function runModernDemo(
  seed: number,
  modules: OpenLifeModule[],
  out: (line: string) => void,
): void {
  const console_ = new DebugConsole({ seed, modules, out });
  const simulation = console_.simulation;

  out(section("1. WORLD SETUP"));
  console_.run("modern.initialize_world");

  out(section("2. CHARACTER CREATED"));
  console_.run(
    "modern.create_character givenName=Ada familyName=Stone cityId=modern:city:north startingCash=20000",
  );
  const ada = activeCharacterId(simulation);
  out(`  active character: ${ada}`);

  out(section("3. CONSTRAINT REJECTION (a child cannot enrol in higher education)"));
  console_.run(`education.enroll_school actor=${ada}`);

  out(section("4. AGE SIX -> ENROL"));
  console_.advance(6 * TICKS_PER_YEAR);
  out(`  tick=${simulation.tick}`);
  console_.run(`education.enroll_school actor=${ada}`);

  out(section("5. FOUR-YEAR PROGRAMME COMPLETES (scheduled task)"));
  console_.advance(4 * TICKS_PER_YEAR);
  out(`  tick=${simulation.tick}`);
  const level = simulation.worldView().getComponent(ada, "education.level");
  out(`  education level: ${JSON.stringify(level)}`);

  out(section("6. AGE SIXTEEN -> GET A JOB"));
  console_.advance(10 * TICKS_PER_YEAR);
  out(`  tick=${simulation.tick}`);
  console_.run(
    `career.get_job actor=${ada} occupation=engineer companyName="Northport Works"`,
  );

  out(section("7. MARRIAGE AND FIRST CHILD"));
  console_.advance(2 * TICKS_PER_YEAR);
  out(`  tick=${simulation.tick}`);
  console_.run(`family.make_friend actor=${ada} targetName=Bea`);
  console_.run(`family.marry actor=${ada} spouseName=Cy`);
  console_.run(`family.have_child actor=${ada} givenName=Dan`);

  out(section("8. SECOND CHILD"));
  console_.advance(3 * TICKS_PER_YEAR);
  out(`  tick=${simulation.tick}`);
  console_.run(`family.have_child actor=${ada} givenName=Eve`);

  out(section("9. START A BUSINESS"));
  console_.run(`career.start_business actor=${ada} name="Stone Atelier" capital=50000`);

  out(section("10. LIVE OUT ADA'S LIFE"));
  advanceUntilDead(console_, simulation, ada, 110);
  out(`  tick=${simulation.tick}, Ada archived (died): ${isArchived(simulation, ada)}`);
  out(
    `  Ada's wealth at death: ${JSON.stringify(
      simulation.worldView().getEntity(ada)?.components["modern.wealth"],
    )}`,
  );

  out(section("11. SWITCH TO GENERATION 2"));
  console_.run("modern.switch_generation");
  const gen2 = activeCharacterId(simulation);
  out(`  active character: ${gen2}`);
  out(
    `  generation: ${
      simulation.worldView().getComponent("modern:world", "modern.world_state")?.generation
    }`,
  );

  out(section("12. GENERATION 2 LIVES"));
  if (!ensureMarriedWithChild(console_, simulation, gen2, "Rin", "Fen")) {
    out(`  ${gen2} did not survive long enough to have a child; demo stops here`);
    return;
  }
  out(`  ${gen2} married and had a child at tick ${simulation.tick}`);

  out(section("13. SWITCH TO GENERATION 3"));
  advanceUntilDead(console_, simulation, gen2, 110);
  out(`  tick=${simulation.tick}, generation 2 archived: ${isArchived(simulation, gen2)}`);
  console_.run("modern.switch_generation");
  const gen3 = activeCharacterId(simulation);
  out(`  active character: ${gen3}`);
  out(
    `  generation: ${
      simulation.worldView().getComponent("modern:world", "modern.world_state")?.generation
    }`,
  );

  out(section("14. WHAT THE FIRST GENERATION LEFT BEHIND"));
  out(
    `  historical records still visible to generation 3: ${
      simulation.history.listRecords({ minSignificance: 0.45 }).length
    }`,
  );
  printLegacy(console_);

  out(section("15. SAVE -> LOAD"));
  const before = simulation.fingerprint();
  const json = simulation.saveToJson({ label: "demo" });
  const loaded = Simulation.loadFromJson(json, modules);
  out(`  load ok: ${loaded.result.ok}`);
  if (loaded.simulation) {
    out(`  fingerprint identical: ${before === loaded.simulation.fingerprint()}`);
    out(
      `  organisations after load: ${
        loaded.simulation.worldView().listEntities({
          kind: "modern.organization",
          includeArchived: true,
        }).length
      }`,
    );
    out(
      `  events after load: ${loaded.simulation.kernel.internals.eventLog.length} (before: ${simulation.kernel.internals.eventLog.length})`,
    );
  }

  out(section("16. DETERMINISM (same seed, same commands)"));
  const replayed = console_.replay();
  out(`  same seed replay identical: ${simulation.fingerprint() === replayed.fingerprint()}`);
  const otherSeed = console_.replay(seed + 1);
  out(`  different seed differs: ${simulation.fingerprint() !== otherSeed.fingerprint()}`);
}

export function runMagicDemo(
  seed: number,
  modules: OpenLifeModule[],
  out: (line: string) => void,
): void {
  const console_ = new DebugConsole({ seed, modules, out });
  const simulation = console_.simulation;

  out(section("1. WEAVE THE WORLD"));
  console_.run("magic.initialize_world");

  out(section("2. FIRST SOUL"));
  console_.run("magic.create_soul name=Nyx realmId=magic:realm:umbra");
  const nyx = magicActiveSoul(simulation);
  out(`  active soul: ${nyx}`);

  out(section("3. MEDITATE (mana through the modifier pipeline)"));
  console_.run(`magic.meditate actor=${nyx} effort=2`);

  out(section("4. BOND"));
  console_.run(`magic.bond actor=${nyx} targetName=Vela`);

  out(section("5. CYCLES PASS (ley lines replenish on the scheduler)"));
  console_.advance(12);
  out(`  tick=${simulation.tick}`);
  out(
    `  ley flux: ${JSON.stringify(
      simulation
        .worldView()
        .listEntities({ kind: "magic.ley_line" })
        .map((ley) => ({ id: ley.id, flux: ley.components["magic.ley_line"]?.flux })),
    )}`,
  );

  out(section("6. ASCEND AND REINCARNATE"));
  console_.run(`magic.ascend actor=${nyx}`);
  console_.run("magic.reincarnate");
  out(`  active soul: ${magicActiveSoul(simulation)}`);

  out(section("7. HISTORY AND CAUSALITY"));
  for (const record of simulation.history.listRecords({ minSignificance: 0.3 })) {
    out(`  t=${record.at} sig=${record.significance.toFixed(2)} ${record.type}`);
  }

  out(section("8. SAVE -> LOAD"));
  const before = simulation.fingerprint();
  const loaded = Simulation.loadFromJson(simulation.saveToJson(), modules);
  out(`  load ok: ${loaded.result.ok}`);
  if (loaded.simulation) {
    out(`  fingerprint identical: ${before === loaded.simulation.fingerprint()}`);
  }

  out(section("9. DETERMINISM"));
  const replayed = console_.replay();
  out(`  same seed replay identical: ${simulation.fingerprint() === replayed.fingerprint()}`);
}

function printLegacy(console_: DebugConsole): void {
  const simulation = console_.simulation;
  for (const record of simulation.history.listRecords({ minSignificance: 0.45 })) {
    const archived = record.subjectArchived ? " [entity gone, history kept]" : "";
    console_.print(`  t=${record.at} ${record.type}${archived}`);
  }
  const organizations = simulation
    .worldView()
    .listEntities({ kind: "modern.organization", includeArchived: true });
  console_.print(`  organisations: ${organizations.length}`);
  for (const organization of organizations) {
    const component = organization.components["modern.organization"] ?? {};
    console_.print(
      `    ${organization.id} name=${component.name} foundedAt=${component.foundedAt} ` +
        `dissolved=${organization.archivedAt !== undefined}`,
    );
  }
}

function activeCharacterId(simulation: Simulation): string {
  return String(
    simulation.worldView().getComponent("modern:world", "modern.world_state")?.activeCharacterId ??
      "",
  );
}

function isArchived(simulation: Simulation, entityId: string): boolean {
  return simulation.worldView().getEntity(entityId)?.archivedAt !== undefined;
}

/**
 * Marries the active character and gives them a child, advancing time as
 * needed. Returns false when the character dies before reproducing, which can
 * legitimately happen because mortality includes accidents.
 */
function ensureMarriedWithChild(
  console_: DebugConsole,
  simulation: Simulation,
  characterId: string,
  spouseName: string,
  childName: string,
): boolean {
  // Marriage requires adulthood.
  for (let year = 0; year < 25; year += 1) {
    if (isArchived(simulation, characterId)) return false;
    if (ageOf(simulation, characterId) >= 18) break;
    console_.advance(TICKS_PER_YEAR);
  }
  if (isArchived(simulation, characterId)) return false;
  console_.run(`family.marry actor=${characterId} spouseName=${spouseName}`);
  console_.run(`family.have_child actor=${characterId} givenName=${childName}`);
  return !isArchived(simulation, characterId);
}

function ageOf(simulation: Simulation, entityId: string): number {
  const entity = simulation.worldView().getEntity(entityId);
  if (!entity) return 0;
  const bornAt = Number(entity.components["modern.identity"]?.bornAt ?? entity.createdAt);
  return Math.floor((simulation.tick - bornAt) / TICKS_PER_YEAR);
}

/**
 * Advances until `entityId` dies, in bounded chunks.
 *
 * A world tick is one month, so advancing one year at a time is cheap and
 * always stops promptly after the character dies. The bound guards against a
 * character who somehow never dies.
 */
function advanceUntilDead(
  console_: DebugConsole,
  simulation: Simulation,
  entityId: string,
  maxYears: number,
): void {
  for (let year = 0; year < maxYears; year += 1) {
    if (isArchived(simulation, entityId)) return;
    console_.advance(TICKS_PER_YEAR);
  }
}

function magicActiveSoul(simulation: Simulation): string {
  return String(
    simulation.worldView().getComponent("magic:world", "magic.world_state")?.activeSoulId ?? "",
  );
}

export type { CommandIntent };
