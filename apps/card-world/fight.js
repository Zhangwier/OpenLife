// Fight or run: what someone does when a boar, a bear, a tiger or a raider comes at them. Who they are (nerve), how
// strong (age, how worn out), what's in their hand, how badly hurt already, and whether others stand with them.
// Pure; app.js does the moving and the blows.

/** How dangerous each is to stand up to. */
export const THREAT = { wolf: 0.7, boar: 0.55, bear: 0.85, tiger: 1.1, coastRaider: 0.6 };

/** What you hit with: how far it reaches, how hard, and how much braver it makes you. */
export const WEAPONS = {
  spear: { reach: 210, damage: 2, edge: 0.45, verb: "挺矛刺了过去" },
  axe: { reach: 150, damage: 2, edge: 0.3, verb: "抡起斧子砍了过去" },
  hammer: { reach: 140, damage: 2, edge: 0.25, verb: "抡起石锤砸了过去" },
  knife: { reach: 120, damage: 1, edge: 0.15, verb: "拿刀捅了过去" },
  fist: { reach: 120, damage: 1, edge: 0, verb: "抡起拳头打了过去" },
};
export const bestWeapon = (has) => ["spear", "axe", "hammer", "knife"].find(has) ?? "fist";

/** How strong at an age: a child next to nothing, a grown man most, an old one less. */
export const strengthAt = (age) => (age < 12 ? 0.05 : age < 16 ? 0.4 : age < 50 ? 0.85 : age < 62 ? 0.6 : 0.35);

/** "fight", "flee", or "ward" (hold it off with fire — every beast fears a torch). courage, strength, hurt: 0..1. */
export function stance({ courage, strength, weapon = "fist", torch = false, threat, hurt = 0, allies = 0 }) {
  if (torch && threat >= 0.5 && threat < 1) return "ward";
  if (torch && threat >= 1) return hurt > 0.6 ? "flee" : "ward";
  const will = courage * 0.55 + strength * 0.45 + (WEAPONS[weapon]?.edge ?? 0) + allies * 0.15 - hurt * 0.9;
  return will >= threat ? "fight" : "flee";
}
