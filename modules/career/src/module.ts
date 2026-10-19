/**
 * Career system pack.
 *
 * Owns employment and business founding. Demonstrates three architecture
 * points:
 *   - a Modifier pipeline drives the hiring outcome (§15) and the reasons are
 *     visible in the decision trace (§16);
 *   - a salary task drives monthly income through the scheduler (§17);
 *   - a business is an organisation entity, so it can outlive its founder (§33).
 */

import type { Effect, OpenLifeModule, WorldView } from "@openlife/contracts";
import {
  ModernComponents as MW,
  ModernKinds as MWK,
  WORLD_ENTITY_ID,
} from "@openlife/life-contracts/modern";
import { ageInYearsIn, ticksPerYearIn } from "@openlife/life-contracts";
import { educationLevelOf } from "@openlife/life-contracts/education";
import {
  EconomyComponents as EC,
  type EconomyPhase,
} from "@openlife/life-contracts/economy";

const OWNER = "career";

export const CC = {
  employment: "career.employment",
  business: "career.business",
} as const;

export const CR = {
  employedBy: "career.employed_by",
  founded: "career.founded",
} as const;

const OCCUPATIONS = [
  { id: "engineer", title: "Engineer", baseSalary: 4200, educationBonus: 0.25 },
  { id: "teacher", title: "Teacher", baseSalary: 3100, educationBonus: 0.15 },
  { id: "trader", title: "Trader", baseSalary: 2600, educationBonus: 0.05 },
] as const;

export type OccupationId = (typeof OCCUPATIONS)[number]["id"];

export const careerModule: OpenLifeModule = {
  manifest: {
    id: OWNER,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "system-pack",
    name: "Career",
    description: "Employment, salary and business founding.",
    requires: ["time.calendar"],
    optional: ["education.provider", "economy.cycle"],
    provides: ["career.provider"],
    expects: ["life.population"],
    capabilities: [
      "component.register",
      "relation.register",
      "command.register",
      "rule.constraint.register",
      "rule.resolution.register",
      "rule.reaction.register",
      "schedule.register",
    ],
  },

  register(ctx) {
    ctx.registerComponent({ id: CC.employment, persist: true });
    ctx.registerComponent({ id: CC.business, persist: true });
    ctx.registerRelation({ id: CR.employedBy, persist: true });
    ctx.registerRelation({ id: CR.founded, persist: true });

    ctx.registerCommand({
      type: "career.get_job",
      params: { occupation: "engineer|teacher|trader", companyName: "string" },
      description: "Apply for a job.",
    });
    ctx.registerCommand({
      type: "career.pay_salary",
      description: "Internal: monthly salary payment.",
    });
    ctx.registerCommand({
      type: "career.start_business",
      params: { name: "string", capital: "number" },
      description: "Found a business.",
    });
    ctx.registerCommand({
      type: "career.collect_profit",
      description: "Internal: monthly business profit.",
    });

    ctx.registerTask({
      type: "career.salary_tick",
      description: "Monthly salary for an employed character.",
      handler: (c) => {
        const characterId = String(c.payload.characterId ?? "");
        const entity = c.world.getEntity(characterId);
        if (!entity || entity.archivedAt !== undefined) return undefined;
        if (!entity.components[CC.employment]) return undefined;
        return {
          command: { type: "career.pay_salary", actorId: characterId, source: "system" },
        };
      },
    });

    ctx.registerTask({
      type: "career.profit_tick",
      description: "Monthly profit for a business founder.",
      handler: (c) => {
        const characterId = String(c.payload.characterId ?? "");
        const businessId = String(c.payload.businessId ?? "");
        const entity = c.world.getEntity(characterId);
        if (!entity || entity.archivedAt !== undefined) return undefined;
        const business = c.world.getEntity(businessId);
        if (!business || business.archivedAt !== undefined) return undefined;
        return {
          command: {
            type: "career.collect_profit",
            actorId: characterId,
            targetId: businessId,
            source: "system",
          },
        };
      },
    });

    // --- get_job ----------------------------------------------------------
    ctx.registerConstraintRule({
      id: "career.get_job.allowed",
      commandType: "career.get_job",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        if (!actorId) return { ok: false, code: "E_NO_ACTOR", message: "get_job requires an actor" };
        const entity = c.world.getEntity(actorId);
        if (!entity || entity.kind !== MWK.character) {
          return { ok: false, code: "E_NOT_A_CHARACTER", message: `not a character: ${actorId}` };
        }
        if (entity.archivedAt !== undefined) {
          return { ok: false, code: "E_CHARACTER_DEAD", message: "character is dead" };
        }
        const bornAt = Number(entity.components[MW.identity]?.bornAt ?? entity.createdAt);
        const age = ageInYearsIn(c.world, bornAt, c.world.tick);
        if (age < 16) {
          return {
            ok: false,
            code: "E_TOO_YOUNG_TO_WORK",
            message: `character must be at least 16 to work (age ${age})`,
            details: { age, minimum: 16 },
          };
        }
        const occupation = resolveOccupation(c.command.payload.occupation);
        if (!occupation) {
          return {
            ok: false,
            code: "E_UNKNOWN_OCCUPATION",
            message: `unknown occupation: ${String(c.command.payload.occupation)}`,
          };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "career.get_job.resolve",
      commandType: "career.get_job",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const occupation = resolveOccupation(c.command.payload.occupation) ?? OCCUPATIONS[0];
        const companyName = typeof c.command.payload.companyName === "string"
          ? c.command.payload.companyName
          : `${occupation.title} Guild`;
        const entity = c.world.getEntity(actorId);
        const level = entity ? educationLevelOf(entity.components) : "none";

        // Modifier pipeline: every contribution is recorded with its reason.
        const salary = c.resolve(`career.salary.${occupation.id}`, occupation.baseSalary, [
          {
            id: "career.salary.education",
            source: OWNER,
            target: "career.salary",
            op: "mul",
            value: 1 + educationBonus(level, occupation.educationBonus),
            reason: `education level is ${level}`,
          },
          {
            id: "career.salary.health",
            source: OWNER,
            target: "career.salary",
            op: "mul",
            value: 0.5 + 0.5 * Number(entity?.components[MW.vitals]?.health ?? 1),
            reason: "current health",
          },
        ]);

        const companyId = `career:company:${occupation.id}`;
        const effects: Effect[] = [
          {
            kind: "setComponent",
            entityId: actorId,
            component: CC.employment,
            value: {
              occupation: occupation.id,
              title: occupation.title,
              companyId,
              companyName,
              salary,
              startedAt: c.world.tick,
            },
            reason: "job accepted",
            modifiers: [],
          },
          {
            kind: "emitEvent",
            eventType: "career.job_accepted",
            actorId,
            data: { occupation: occupation.id, title: occupation.title, companyName, salary },
            historicalSignificance: 0.35,
          },
          {
            kind: "scheduleTask",
            taskType: "career.salary_tick",
            afterTicks: 1,
            payload: { characterId: actorId },
            dedupeKey: `salary:${actorId}:${c.world.tick + 1}`,
          },
        ];
        return effects;
      },
    });

    // Salary is a self-terminating chain: each payment schedules the next one,
    // so a dead or unemployed character's payroll stops on its own without the
    // kernel needing a "cancel task" primitive.
    ctx.registerReactionRule({
      id: "career.salary_paid.schedule_next",
      eventType: "career.salary_paid",
      react: (c) => {
        const actorId = c.event.actorId;
        if (!actorId) return [];
        const nextTick = c.world.tick + 1;
        return [
          {
            kind: "scheduleTask",
            taskType: "career.salary_tick",
            at: nextTick,
            payload: { characterId: actorId },
            dedupeKey: `salary:${actorId}:${nextTick}`,
          },
        ];
      },
    });

    // Employment creates the employer entity, so the employer can outlive the
    // employee and be discovered by later generations.
    ctx.registerReactionRule({
      id: "career.job_accepted.employer",
      eventType: "career.job_accepted",
      react: (c) => {
        const actorId = c.event.actorId;
        if (!actorId) return [];
        const employment = c.world.getComponent(actorId, CC.employment);
        if (!employment) return [];
        const companyId = String(employment.companyId ?? "");
        const companyName = String(employment.companyName ?? "Company");
        const effects: Effect[] = [];
        if (companyId && !c.world.hasEntity(companyId)) {
          effects.push({
            kind: "spawnEntity",
            localId: "employer",
            id: companyId,
            entityKind: MWK.organization,
            components: {
              [MW.organization]: {
                name: companyName,
                orgKind: "business",
                foundedAt: c.world.tick,
                founderId: actorId,
              },
            },
            announce: false,
          });
          effects.push({
            kind: "emitEvent",
            eventType: "career.company_founded",
            actorId: companyId,
            data: { name: companyName, companyId },
            historicalSignificance: 0.5,
          });
        }
        if (companyId) {
          effects.push({
            kind: "addRelation",
            type: CR.employedBy,
            from: actorId,
            to: companyId,
            components: { [CC.employment]: { since: c.world.tick } },
            announce: false,
          });
        }
        return effects;
      },
    });

    // --- pay_salary -------------------------------------------------------
    ctx.registerConstraintRule({
      id: "career.pay_salary.allowed",
      commandType: "career.pay_salary",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        if (!actorId) return { ok: false, code: "E_NO_ACTOR", message: "salary requires an actor" };
        const entity = c.world.getEntity(actorId);
        if (!entity) {
          return { ok: false, code: "E_UNKNOWN_ENTITY", message: `unknown character: ${actorId}` };
        }
        if (entity.archivedAt !== undefined) {
          return { ok: false, code: "E_CHARACTER_DEAD", message: "deceased characters earn nothing" };
        }
        const employment = entity.components[CC.employment] as { salary?: number } | undefined;
        if (!employment || typeof employment.salary !== "number") {
          return { ok: false, code: "E_NOT_EMPLOYED", message: "character is not employed" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "career.pay_salary.resolve",
      commandType: "career.pay_salary",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const employment = c.world.getComponent(actorId, CC.employment) as
          | { salary?: number }
          | undefined;
        const wealth = c.world.getComponent(actorId, MW.wealth) as
          | { cash?: number; debt?: number }
          | undefined;
        const baseSalary = Number(employment?.salary ?? 0);
        const phase = currentEconomyPhase(c.world);
        const salary = Math.round(baseSalary * salaryMultiplier(phase));
        return [
          {
            kind: "modifyComponent",
            entityId: actorId,
            component: MW.wealth,
            patch: { cash: Number(wealth?.cash ?? 0) + salary },
            reason: `monthly salary of ${salary}`,
          },
          {
            kind: "emitEvent",
            eventType: "career.salary_paid",
            actorId,
            data: { amount: salary, baseAmount: baseSalary, economyPhase: phase },
            historicalSignificance: 0.01,
          },
        ];
      },
    });

    // --- start_business ---------------------------------------------------
    ctx.registerConstraintRule({
      id: "career.start_business.allowed",
      commandType: "career.start_business",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        if (!actorId) return { ok: false, code: "E_NO_ACTOR", message: "start_business requires an actor" };
        const entity = c.world.getEntity(actorId);
        if (!entity || entity.kind !== MWK.character) {
          return { ok: false, code: "E_NOT_A_CHARACTER", message: `not a character: ${actorId}` };
        }
        if (entity.archivedAt !== undefined) {
          return { ok: false, code: "E_CHARACTER_DEAD", message: "character is dead" };
        }
        const capital = Number(c.command.payload.capital ?? 0);
        const wealth = entity.components[MW.wealth] as { cash?: number } | undefined;
        const cash = Number(wealth?.cash ?? 0);
        if (cash < capital) {
          return {
            ok: false,
            code: "E_INSUFFICIENT_CAPITAL",
            message: `needs ${capital} cash, has ${cash}`,
            details: { capital, cash },
          };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "career.start_business.resolve",
      commandType: "career.start_business",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const name = typeof c.command.payload.name === "string"
          ? c.command.payload.name
          : "New Venture";
        const capital = Number(c.command.payload.capital ?? 0);
        const wealth = c.world.getComponent(actorId, MW.wealth) as
          | { cash?: number; debt?: number }
          | undefined;
        const cash = Number(wealth?.cash ?? 0);
        const businessId = `career:business:${actorId}:${c.world.tick}`;
        return [
          {
            kind: "modifyComponent",
            entityId: actorId,
            component: MW.wealth,
            patch: { cash: cash - capital },
            reason: `invested ${capital} in ${name}`,
          },
          {
            kind: "spawnEntity",
            localId: "business",
            id: businessId,
            entityKind: MWK.organization,
            components: {
              [MW.organization]: {
                name,
                orgKind: "business",
                foundedAt: c.world.tick,
                founderId: actorId,
              },
              [CC.business]: { capital, monthlyProfit: Math.round(capital * 0.03), founderId: actorId },
            },
            announce: false,
          },
          {
            kind: "addRelation",
            type: CR.founded,
            from: actorId,
            to: "@business",
            announce: false,
          },
          {
            kind: "emitEvent",
            eventType: "career.business_founded",
            actorId,
            targetId: "@business",
            data: { name, capital, businessId },
            historicalSignificance: 0.7,
          },
          {
            kind: "scheduleTask",
            taskType: "career.profit_tick",
            afterTicks: 1,
            payload: { characterId: actorId, businessId },
            dedupeKey: `profit:${businessId}:${c.world.tick + 1}`,
          },
        ];
      },
    });

    ctx.registerReactionRule({
      id: "career.profit_collected.schedule_next",
      eventType: "career.profit_collected",
      react: (c) => {
        const actorId = c.event.actorId;
        const businessId = c.event.targetId;
        if (!actorId || !businessId) return [];
        const nextTick = c.world.tick + 1;
        return [
          {
            kind: "scheduleTask",
            taskType: "career.profit_tick",
            at: nextTick,
            payload: { characterId: actorId, businessId },
            dedupeKey: `profit:${businessId}:${nextTick}`,
          },
        ];
      },
    });

    ctx.registerConstraintRule({
      id: "career.collect_profit.allowed",
      commandType: "career.collect_profit",
      evaluate: (c) => {
        const actorId = c.command.actorId;
        if (!actorId) {
          return { ok: false, code: "E_NO_ACTOR", message: "profit requires an owner" };
        }
        const owner = c.world.getEntity(actorId);
        if (!owner || owner.archivedAt !== undefined) {
          return { ok: false, code: "E_CHARACTER_DEAD", message: "the owner is gone" };
        }
        const businessId = c.command.targetId;
        if (!businessId || !c.world.hasEntity(businessId)) {
          return { ok: false, code: "E_UNKNOWN_BUSINESS", message: "unknown business" };
        }
        const business = c.world.getComponent(businessId, CC.business);
        if (!business) {
          return { ok: false, code: "E_UNKNOWN_BUSINESS", message: "entity is not a business" };
        }
        return { ok: true };
      },
    });

    ctx.registerResolutionRule({
      id: "career.collect_profit.resolve",
      commandType: "career.collect_profit",
      resolve: (c) => {
        const actorId = c.command.actorId as string;
        const businessId = c.command.targetId as string;
        const business = c.world.getComponent(businessId, CC.business) as
          | { monthlyProfit?: number }
          | undefined;
        const wealth = c.world.getComponent(actorId, MW.wealth) as
          | { cash?: number; debt?: number }
          | undefined;
        const baseProfit = Number(business?.monthlyProfit ?? 0);
        const phase = currentEconomyPhase(c.world);
        const profit = Math.round(baseProfit * profitMultiplier(phase));
        return [
          {
            kind: "modifyComponent",
            entityId: actorId,
            component: MW.wealth,
            patch: { cash: Number(wealth?.cash ?? 0) + profit },
            reason: `business profit of ${profit}`,
          },
          {
            kind: "emitEvent",
            eventType: "career.profit_collected",
            actorId,
            targetId: businessId,
            data: { amount: profit, baseAmount: baseProfit, economyPhase: phase },
            historicalSignificance: 0.01,
          },
        ];
      },
    });
  },
};

function currentEconomyPhase(world: WorldView): EconomyPhase {
  const value = world.getComponent(WORLD_ENTITY_ID, EC.worldCycle)?.phase;
  return value === "expansion" || value === "slowdown" || value === "recovery"
    ? value
    : "steady";
}

function salaryMultiplier(phase: EconomyPhase): number {
  return {
    steady: 1,
    expansion: 1.08,
    slowdown: 0.9,
    recovery: 1.03,
  }[phase];
}

function profitMultiplier(phase: EconomyPhase): number {
  return {
    steady: 1,
    expansion: 1.25,
    slowdown: 0.65,
    recovery: 1.1,
  }[phase];
}

function resolveOccupation(value: unknown): (typeof OCCUPATIONS)[number] | undefined {
  if (typeof value !== "string") return undefined;
  return OCCUPATIONS.find((occupation) => occupation.id === value);
}

function educationBonus(level: string, bonus: number): number {
  switch (level) {
    case "higher":
      return bonus;
    case "secondary":
      return bonus * 0.5;
    default:
      return 0;
  }
}

export function employmentOf(
  components: Record<string, Record<string, unknown>>,
): { occupation?: string; title?: string; salary?: number; companyName?: string } | undefined {
  return components[CC.employment] as
    | { occupation?: string; title?: string; salary?: number; companyName?: string }
    | undefined;
}
