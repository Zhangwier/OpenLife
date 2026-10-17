/**
 * One year of a village at chronicle resolution (LOD: individuals, but no
 * daily life): harvest, spoilage, hunger, sickness, deaths, marriages,
 * births, newcomers and neighbours. It produces a plan; the driver turns the
 * plan into commands for heredity, tech, polity and the era ladder.
 *
 * Every number here is a placeholder tuned so a village of 20-40 people is
 * plausible over centuries; it is not the settlement-locations daily sim.
 */
import type { DeterministicRngLike } from "@openlife/contracts";

export interface ChroniclePerson {
  name: string; sex: "f" | "m"; born: number; alive: boolean;
  motherId: string; fatherId: string; spouseId: string; diedAt: number; cause: string;
}
export interface Neighbour { name: string; pop: number }
export interface YearPlan {
  year: number;
  harvest: number; consumption: number; surplus: number; spoiled: number; hungerShare: number;
  flood: boolean; drought: boolean; illness: boolean; forewarned: boolean;
  births: Array<{ id: string; motherId: string; fatherId: string }>;
  migrants: string[];
  deaths: Array<{ id: string; cause: string }>;
  marriages: Array<[string, string]>;
  hungerChildren: Array<{ id: string; days: number }>;
  needs: Array<{ needId: string; reporterId: string; amount: number }>;
  phenomena: Array<{ id: string; observers: string[] }>;
  lessons: Array<{ teacher: string; learner: string }>;
  loans: Array<{ creditor: string; debtor: string; amount: number }>;
  exposures: string[];
  materials: string[];
  busy: string[];
  adults: Array<{ id: string; age: number }>;
  newContact: string;
  /** A daughter village founded by people who left this year. */
  daughter?: { name: string; pop: number };
}

export interface YearWorld {
  tick: number;
  year: number;
  people: Map<string, ChroniclePerson>;
  stores: number;
  contacts: number;
  neighbours: Neighbour[];
  ceiling: (id: string, trait: string) => number;
  kinship: (a: string, b: string) => number;
  productivity: (key: string) => number;
  capabilities: Set<string>;
  forewarned: (phen: string) => boolean;
  institutions: Set<string>;
  specialists: number;
  head: string | null;
  knows: (id: string) => string[];
  outsiderKnowledge: string[];
  newId: () => string;
  newName: (sex: "f" | "m") => string;
  neighbourName: () => string;
}

export const YEAR = 360;
const ageOf = (p: ChroniclePerson, tick: number) => Math.floor((tick - p.born) / YEAR);

function baseMortality(age: number): number {
  if (age < 5) return 0.08;
  if (age < 15) return 0.015;
  if (age < 45) return 0.01;
  if (age < 60) return 0.025;
  return 0.06 + (age - 60) * 0.012;
}

export interface YearResult { plan: YearPlan; people: Map<string, ChroniclePerson>; stores: number; contacts: number; neighbours: Neighbour[] }

export function chronicleYear(rng: DeterministicRngLike, w: YearWorld): YearResult {
  const people = new Map([...w.people].map(([id, p]) => [id, { ...p }]));
  const living = () => [...people].filter(([, p]) => p.alive).map(([id]) => id).sort();
  const age = (id: string) => ageOf(people.get(id)!, w.tick);
  const adults = living().filter((id) => age(id) >= 15);
  const pick = (ids: string[]) => ids.length ? ids[rng.nextInt(0, ids.length)]! : "";
  const plan: YearPlan = {
    year: w.year, harvest: 0, consumption: 0, surplus: 0, spoiled: 0, hungerShare: 0, flood: false, drought: false, illness: false, forewarned: false,
    births: [], migrants: [], deaths: [], marriages: [], hungerChildren: [], needs: [], phenomena: [], lessons: [], loans: [], exposures: [],
    materials: [], busy: [], adults: [], newContact: "",
  };
  const need = (needId: string, amount: number) => { const r = pick(adults); if (r) plan.needs.push({ needId, reporterId: r, amount: Math.round(amount * 100) / 100 }); };
  const saw = (id: string, who: string[] = adults) => plan.phenomena.push({ id, observers: who });

  // Harvest: workers, land limits, climate, technique.
  const workers = adults.filter((id) => age(id) <= 60);
  plan.flood = rng.chance(0.2);
  plan.drought = !plan.flood && rng.chance(0.12);
  plan.forewarned = plan.flood && w.forewarned("phen:river-rise");
  const landCap = 22 * Math.sqrt(w.productivity("harvest"));
  const effective = workers.length <= landCap ? workers.length : landCap + (workers.length - landCap) * 0.3;
  let climate = 1;
  if (plan.flood) climate *= 1 - 0.35 * w.productivity("floodDamage") * (plan.forewarned ? 0.5 : 1);
  if (plan.drought) climate *= 0.55;
  const tired = w.capabilities.has("cap:fallow") ? 1 : Math.max(0.8, 1 - w.year * 0.002);
  plan.harvest = Math.round(effective * 1.45 * climate * tired * w.productivity("harvest") * (1 + 0.04 * w.specialists) * 100) / 100;
  plan.consumption = living().reduce((s, id) => s + (age(id) < 12 ? 0.6 : 1), 0);
  plan.spoiled = Math.round(w.stores * Math.min(0.9, 0.45 * w.productivity("spoilage")) * 100) / 100;
  let stores = w.stores - plan.spoiled + plan.harvest - plan.consumption;
  plan.surplus = Math.round(stores * 100) / 100;
  if (stores < 0) { plan.hungerShare = Math.min(1, -stores / Math.max(1, plan.consumption)); stores = 0; }
  stores = Math.round(stores * 100) / 100;
  if (plan.hungerShare > 0.15) plan.busy = [...adults];

  // Sickness and death.
  plan.illness = rng.chance(0.3);
  for (const id of living()) {
    const cons = w.ceiling(id, "trait:constitution");
    const frailty = 1.6 - cons / 100;
    let p = baseMortality(age(id)) * frailty;
    if (plan.illness) p += 0.025 * w.productivity("illness") * frailty;
    if (plan.hungerShare > 0) p += 0.2 * plan.hungerShare * frailty * (age(id) < 5 || age(id) > 60 ? 1.5 : 1);
    if (rng.chance(Math.min(0.95, p))) {
      const cause = plan.hungerShare > 0.2 && rng.chance(0.6) ? "hunger" : plan.illness && rng.chance(0.5) ? "sickness" : "age";
      const person = people.get(id)!;
      person.alive = false; person.diedAt = w.tick; person.cause = cause;
      plan.deaths.push({ id, cause });
      if (person.spouseId && people.get(person.spouseId)) people.get(person.spouseId)!.spouseId = "";
    }
  }
  for (const id of living()) if (age(id) < 7 && plan.hungerShare > 0) plan.hungerChildren.push({ id, days: Math.round(plan.hungerShare * 360) });

  // Marriage: no parents or siblings ever; cousins too once near-kin marriage is a rule.
  const limit = w.institutions.has("institution:exogamy") ? 0.0625 : 0.25;
  const single = (sex: "f" | "m") => living().filter((id) => { const p = people.get(id)!; return p.sex === sex && !p.spouseId && age(id) >= 17 && age(id) <= 40; });
  for (const f of single("f")) {
    const options = single("m").filter((m) => !people.get(m)!.spouseId && w.kinship(f, m) < limit);
    if (!options.length || !rng.chance(0.5)) continue;
    const m = pick(options);
    people.get(f)!.spouseId = m; people.get(m)!.spouseId = f;
    plan.marriages.push([f, m]);
  }
  for (const f of living()) {
    const p = people.get(f)!;
    if (p.sex !== "f" || !p.spouseId || age(f) < 18 || age(f) > 42) continue;
    if (!rng.chance(0.24 * (plan.hungerShare > 0.1 ? 0.5 : 1))) continue;
    const id = w.newId();
    const sex = rng.chance(0.5) ? "f" : "m";
    people.set(id, { name: w.newName(sex), sex, born: w.tick, alive: true, motherId: f, fatherId: p.spouseId, spouseId: "", diedAt: 0, cause: "" });
    plan.births.push({ id, motherId: f, fatherId: p.spouseId });
  }

  // Newcomers bring new blood and what they saw elsewhere.
  if (rng.chance(stores > plan.consumption * 0.3 ? 0.2 : 0.05)) {
    const id = w.newId();
    const sex = rng.chance(0.5) ? "f" : "m";
    people.set(id, { name: w.newName(sex), sex, born: w.tick - (18 + rng.nextInt(0, 12)) * YEAR, alive: true, motherId: "", fatherId: "", spouseId: "", diedAt: 0, cause: "" });
    plan.migrants.push(id);
    if (w.outsiderKnowledge.length && rng.chance(0.5)) plan.exposures.push(pick(w.outsiderKnowledge));
  }

  // Too many mouths for the land: a band of young people leaves and founds a village of its own.
  const crowd = living();
  if (crowd.length > landCap * 1.5 && rng.chance(0.35)) {
    const young = crowd.filter((id) => age(id) >= 16 && age(id) <= 30 && !plan.deaths.some((d) => d.id === id));
    const leaving = young.slice(0, Math.min(young.length, Math.max(6, Math.floor(crowd.length * 0.25))));
    for (const id of leaving) {
      const p = people.get(id)!;
      p.alive = false; p.diedAt = w.tick; p.cause = "left";
      plan.deaths.push({ id, cause: "left" });
      if (p.spouseId && people.get(p.spouseId)?.alive && !leaving.includes(p.spouseId)) people.get(p.spouseId)!.spouseId = "";
    }
    if (leaving.length) plan.daughter = { name: w.neighbourName(), pop: leaving.length };
  }

  // Neighbours (LOD cohort layer): they grow toward what their land and technique can feed.
  let contacts = w.contacts;
  const neighbours = w.neighbours.map((n) => ({ ...n }));
  if (plan.daughter) { neighbours.push({ ...plan.daughter }); contacts += 1; }
  const reach = 2 + (w.capabilities.has("cap:wheel") ? 2 : 0) + (w.capabilities.has("cap:draft-animals") ? 1 : 0)
    + (w.capabilities.has("cap:writing") ? 2 : 0) + (w.capabilities.has("cap:iron") ? 1 : 0);
  if (living().length >= 15 && contacts < reach && rng.chance(0.025)) {
    const name = w.neighbourName();
    neighbours.push({ name, pop: 30 + rng.nextInt(0, 60) });
    contacts += 1;
    plan.newContact = name;
  }
  const capacity = 80 * w.productivity("harvest") ** 2 * (w.capabilities.has("cap:writing") ? 4 : 1) * (w.capabilities.has("cap:iron") ? 4 : 1)
    * (w.capabilities.has("cap:workshop") ? 3 : 1) * (w.capabilities.has("cap:steam") ? 6 : 1) * (1 + contacts * 0.5);
  for (const n of neighbours) n.pop = Math.max(10, Math.round(n.pop + n.pop * 0.015 * (1 - n.pop / capacity) * (plan.drought ? -1 : 1)));

  // Materials depend on who you trade with.
  plan.materials = ["resource:timber", "resource:stone", "resource:clay", "resource:rope"];
  if (contacts >= 1) plan.materials.push("resource:salt");
  if (contacts >= 2) plan.materials.push("resource:copper-ore");
  if (contacts >= 3) plan.materials.push("resource:ox");
  if (contacts >= 4) plan.materials.push("resource:tin");
  if (contacts >= 5) plan.materials.push("resource:iron-ore");
  if (contacts >= 6 && w.capabilities.has("cap:iron")) plan.materials.push("resource:coal");

  // What held people back this year, and what they saw.
  need("need:lift-water", Math.max(0, 0.15 * workers.length / w.productivity("water") - 0.5));
  need("need:grind-grain", 0.6);
  need("need:carry-loads", 0.5 / w.productivity("carry"));
  if (plan.spoiled > plan.consumption * 0.15) need("need:preserve-food", 2 * plan.spoiled / Math.max(1, plan.consumption));
  if (plan.flood) need("need:protect-from-flood", plan.forewarned ? 1 : 3);
  if (plan.hungerShare > 0 || living().length > landCap) need("need:more-grain", 2 + 4 * plan.hungerShare);
  if (plan.drought) need("need:know-season", 2);
  if (plan.illness) need("need:cure-sickness", 1 + plan.deaths.filter((d) => d.cause === "sickness").length);
  if (w.capabilities.has("cap:pottery") && w.productivity("pottery") < 1.3) need("need:better-pots", 1);
  if (rng.chance(0.5)) need("need:move-heavy", 1.2 / w.productivity("build"));
  if (w.capabilities.has("cap:high-fire")) need("need:sharper-blade", 1.2);
  if (w.institutions.has("institution:lending") || living().length > 35) need("need:keep-records", 1.5);
  if (w.capabilities.has("cap:workshop")) need("need:more-power", 2);

  saw("phen:river-rise");
  saw("phen:seasons-turn");
  if (plan.drought) saw("phen:dry-spell");
  if (plan.spoiled > 0.5) saw("phen:food-spoils");
  if (w.capabilities.has("cap:pottery") && !w.capabilities.has("cap:high-fire")) saw("phen:pot-cracks");
  if (rng.chance(0.6)) saw("phen:heavy-things");
  if (plan.illness) saw("phen:sickness-water");
  if (w.year > 8) saw("phen:land-tires");
  if (rng.chance(0.4)) saw("phen:wound-festers");
  if (plan.births.length) saw("phen:child-resembles");
  if (plan.materials.includes("resource:copper-ore") && w.capabilities.has("cap:high-fire")) saw("phen:metal-in-stone");
  if (w.capabilities.has("cap:wheel")) saw("phen:water-pushes");
  if (w.capabilities.has("cap:iron")) saw("phen:lid-rattles");

  // Parents teach a child of 10+ one thing they know each year.
  for (const id of living()) {
    const p = people.get(id)!;
    if (age(id) < 10 || age(id) > 25) continue;
    for (const parent of [p.motherId, p.fatherId]) {
      if (parent && people.get(parent)?.alive && w.knows(parent).some((x) => !w.knows(id).includes(x))) plan.lessons.push({ teacher: parent, learner: id });
    }
  }

  // In a hungry year the better-off lend to the hungry, once lending is a thing.
  if (w.institutions.has("institution:lending") && plan.hungerShare > 0) {
    const lender = w.head ?? pick(adults);
    const borrowers = adults.filter((id) => id !== lender);
    for (let i = 0; i < Math.min(3, borrowers.length); i++) plan.loans.push({ creditor: lender, debtor: pick(borrowers), amount: 1 });
  }

  plan.adults = living().filter((id) => age(id) >= 15).map((id) => ({ id, age: age(id) }));
  return { plan, people, stores, contacts, neighbours };
}
