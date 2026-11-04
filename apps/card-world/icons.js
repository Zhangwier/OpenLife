// Flat icons for the card mockup (64×64). Simple shapes, one dark outline colour, earthy palette.
const O = "#3a2c20";
const s = (d) => `<svg viewBox="0 0 64 64" aria-hidden="true">${d}</svg>`;
const st = `stroke="${O}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;

export const ICONS = {
  you: s(`<circle cx="32" cy="20" r="10" fill="#f0c9a0" ${st}/><path d="M14 56c2-14 9-20 18-20s16 6 18 20Z" fill="#6f8fb0" ${st}/><path d="M23 14c3-6 15-7 19 1-6-2-12-2-19-1Z" fill="#4a3426" ${st}/>`),
  aunt: s(`<circle cx="32" cy="21" r="10" fill="#efc59c" ${st}/><path d="M14 56c2-14 9-20 18-20s16 6 18 20Z" fill="#b5664a" ${st}/><path d="M22 18c0-9 20-10 20 0-4-4-16-4-20 0Z" fill="#5a4030" ${st}/><circle cx="32" cy="9" r="5" fill="#5a4030" ${st}/>`),
  yu: s(`<circle cx="32" cy="20" r="10" fill="#e8b98e" ${st}/><path d="M14 56c2-14 9-20 18-20s16 6 18 20Z" fill="#7c9a5c" ${st}/><path d="M21 16h22v-3H21Z" fill="#c9a24a" ${st}/>`),
  pit: s(`<ellipse cx="32" cy="40" rx="24" ry="12" fill="#8a5a3a" ${st}/><ellipse cx="32" cy="38" rx="16" ry="7" fill="#5e3a24"/><path d="M44 18l6 18" ${st} fill="none"/><path d="M41 15h12" ${st}/>`),
  clay: s(`<path d="M12 46c0-12 10-20 20-20s20 8 20 20Z" fill="#b8754a" ${st}/><path d="M22 34c4-3 9-4 12-3" stroke="#d9a07a" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  reeds: s(`${[14, 22, 30, 38, 46].map((x, i) => `<path d="M${x} 56c0-14 ${i % 2 ? 3 : -3}-26 0-40" ${st} fill="none"/><ellipse cx="${x}" cy="${16 + (i % 2) * 3}" rx="3" ry="7" fill="#8a6a3e" ${st}/>`).join("")}`),
  reed: s(`<path d="M16 48L46 14" stroke="#c9a96a" stroke-width="8" stroke-linecap="round"/><path d="M20 50L50 16" stroke="#a88a52" stroke-width="5" stroke-linecap="round"/><path d="M14 36l20 14" ${st}/>`),
  rope: s(`<ellipse cx="32" cy="40" rx="20" ry="9" fill="none" stroke="#a88a52" stroke-width="6"/><ellipse cx="32" cy="32" rx="15" ry="7" fill="none" stroke="#c9a96a" stroke-width="6"/><ellipse cx="32" cy="25" rx="10" ry="5" fill="none" stroke="#a88a52" stroke-width="5"/>`),
  rack: s(`<path d="M12 56V14M52 56V14M10 22h44M10 38h44" ${st} fill="none"/><ellipse cx="22" cy="18" rx="5" ry="4" fill="#d8c2a0" ${st}/><ellipse cx="38" cy="18" rx="5" ry="4" fill="#d8c2a0" ${st}/><ellipse cx="30" cy="34" rx="5" ry="4" fill="#d8c2a0" ${st}/>`),
  greenware: s(`<path d="M22 14h20l-2 6c8 4 10 14 6 24-3 8-23 8-26 0-4-10-2-20 6-24Z" fill="#dcc8a6" ${st} stroke-dasharray="4 3"/>`),
  jar: s(`<path d="M22 12h20l-2 7c9 4 11 15 7 25-3 9-26 9-29 0-4-10-2-21 7-25Z" fill="#b5653e" ${st}/><path d="M22 30c6 3 14 3 20 0" stroke="#e0a07a" stroke-width="3" fill="none"/>`),
  crackedJar: s(`<path d="M22 12h20l-2 7c9 4 11 15 7 25-3 9-26 9-29 0-4-10-2-21 7-25Z" fill="#a98a70" ${st}/><path d="M34 18l-4 9 5 6-4 9 3 6" stroke="${O}" stroke-width="2.5" fill="none"/>`),
  grain: s(`${[22, 30, 38].map((x) => `<path d="M${x} 56V26" ${st}/><ellipse cx="${x}" cy="20" rx="4" ry="9" fill="#e0c050" ${st}/>`).join("")}<path d="M16 46h32" stroke="#a8843a" stroke-width="5" stroke-linecap="round"/>`),
  fish: s(`<path d="M8 32c10-12 28-12 38 0-10 12-28 12-38 0Z" fill="#9fb4b0" ${st}/><path d="M46 32l10-8v16Z" fill="#7f9894" ${st}/><circle cx="18" cy="30" r="2" fill="${O}"/>`),
  kiln: s(`<path d="M10 54C10 30 20 14 32 14s22 16 22 40Z" fill="#b0704a" ${st}/><path d="M24 54V42c0-6 16-6 16 0v12Z" fill="#3a2418" ${st}/><path d="M28 50c1-4 3-6 4-9 2 3 3 5 4 9Z" fill="#f0a24a"/>`),
  fire: s(`${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="${32 + Math.cos(i) * 16}" cy="${48 + Math.sin(i) * 5}" rx="6" ry="4" fill="#8d897c" ${st}/>`).join("")}<path d="M22 46c0-12 10-14 10-28 6 8 12 14 10 28Z" fill="#f0a24a" ${st}/><path d="M28 46c0-6 4-8 4-14 3 5 6 8 5 14Z" fill="#ffd27a"/>`),
  river: s(`<path d="M4 24c10-6 18 6 28 0s18-6 28 0M4 38c10-6 18 6 28 0s18-6 28 0M4 52c10-6 18 6 28 0s18-6 28 0" stroke="#4f7a78" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  road: s(`<path d="M24 60L30 8h4l6 52Z" fill="#a8845a" ${st}/><path d="M32 14v6M32 28v6M32 42v6" stroke="#f0e0c0" stroke-width="3"/><path d="M44 16h12v8H44Z" fill="#c9a96a" ${st}/><path d="M50 24v14" ${st}/>`),
  water: s(`<path d="M32 8C24 22 16 30 16 40a16 16 0 0 0 32 0c0-10-8-18-16-32Z" fill="#8fb7c8" ${st}/>`),
  dog: s(`<path d="M12 40c0-8 8-12 18-12h12l8-6v14c0 8-6 12-14 12H18c-4 0-6-4-6-8Z" fill="#a8784a" ${st}/><path d="M16 48v8M24 50v6M40 48v8M48 46v8" ${st}/><circle cx="44" cy="30" r="2" fill="${O}"/>`),
  rabbit: s(`<ellipse cx="34" cy="44" rx="16" ry="11" fill="#d8c8b0" ${st}/><circle cx="22" cy="32" r="8" fill="#e0d2ba" ${st}/><path d="M18 26c-5-10-3-17 1-17s6 9 4 17M26 25c-2-10 0-17 4-17s3 10 1 17" fill="#e0d2ba" ${st}/><circle cx="19" cy="31" r="1.6" fill="${O}"/><path d="M12 42c-4 0-6 3-6 6M50 38c4 2 5 5 5 8" ${st}/><circle cx="50" cy="48" r="4" fill="#f2ead8" ${st}/>`),
};

Object.assign(ICONS, {
  house: s(`<path d="M8 30L32 10l24 20" fill="#c9a96a" ${st}/><path d="M6 32L32 8l26 24" stroke="#8a6a3e" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M14 30v24h36V30" fill="#e8d6b0" ${st}/><path d="M27 54V40h10v14Z" fill="#6b4a2f" ${st}/><path d="M40 36h6v6h-6Z" fill="#3a2c20"/>`),
  hut: s(`<path d="M8 52L32 12l24 40Z" fill="#c9a96a" ${st}/><path d="M28 52V38h8v14Z" fill="#5a3a24" ${st}/><path d="M20 30l12-14 12 14" stroke="#a88a52" stroke-width="3" fill="none"/>`),
  field: s(`<path d="M6 46l12-24h28l12 24Z" fill="#9c7a4c" ${st}/>${[0, 1, 2, 3].map((i) => `<path d="M${14 + i * 3} ${42 - i * 6}h${36 - i * 6}" stroke="#7a5a34" stroke-width="2"/>`).join("")}${[18, 28, 38, 48].map((x) => `<path d="M${x} 40v-8" stroke="#7fa84a" stroke-width="3" stroke-linecap="round"/>`).join("")}`),
  fieldRipe: s(`<path d="M6 46l12-24h28l12 24Z" fill="#9c7a4c" ${st}/>${[14, 20, 26, 32, 38, 44, 50].map((x) => `<path d="M${x} 44V24" stroke="#c9a040" stroke-width="2.5"/><ellipse cx="${x}" cy="22" rx="3" ry="6" fill="#e0c050" ${st} stroke-width="1.5"/>`).join("")}`),
  stove: s(`<path d="M8 54V28h48v26Z" fill="#a8907a" ${st}/><path d="M18 54V40c0-8 28-8 28 0v14Z" fill="#3a2418" ${st}/><path d="M26 50c2-6 4-8 6-12 3 4 5 7 6 12Z" fill="#f0a24a"/><path d="M40 28V12h8v16" fill="#8a7a6a" ${st}/>`),
  granary: s(`<path d="M14 26h36l-4 30H18Z" fill="#c9a96a" ${st}/><path d="M10 26c4-12 40-12 44 0Z" fill="#a88a52" ${st}/><path d="M18 36h28M18 46h28" stroke="#a88a52" stroke-width="2.5"/>`),
  cooked: s(`<ellipse cx="32" cy="42" rx="22" ry="9" fill="#b98f6c" ${st}/><path d="M12 40c0 10 40 10 40 0" fill="#9c7050" ${st}/><ellipse cx="32" cy="38" rx="16" ry="5" fill="#f0e0b0"/><path d="M24 26c-2-4 2-6 0-10M34 26c-2-4 2-6 0-10" stroke="#cfc6b4" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
  chestnut: s(`<path d="M32 8c14 0 22 14 22 26S44 56 32 56 10 46 10 34 18 8 32 8Z" fill="#5c7a3a" ${st}/><circle cx="24" cy="30" r="6" fill="#7a4a24" ${st}/><circle cx="38" cy="38" r="6" fill="#7a4a24" ${st}/><path d="M30 56v6" ${st}/>`),
  wood: s(`${[0, 1, 2].map((i) => `<rect x="${10 + i * 4}" y="${44 - i * 12}" width="${44 - i * 8}" height="10" rx="5" fill="${i % 2 ? "#a8784a" : "#8a5a34"}" ${st}/>`).join("")}`),
  bed: s(`<path d="M8 44V26h48v18Z" fill="#c9a96a" ${st}/><path d="M8 26h14v18H8Z" fill="#e8d6b0" ${st}/><path d="M24 30h30v10H24Z" fill="#b5664a" ${st}/><path d="M8 44v8M56 44v8" ${st}/>`),
  door: s(`<path d="M18 58V10h28v48" fill="#8a5a34" ${st}/><path d="M24 16h16v18H24ZM24 38h16v14H24Z" fill="none" stroke="#5a3a24" stroke-width="2"/><circle cx="40" cy="36" r="2.5" fill="#f0d27a"/><path d="M10 58h44" ${st}/>`),
  cook: s(`<circle cx="32" cy="20" r="10" fill="#e8b98e" ${st}/><path d="M14 56c2-14 9-20 18-20s16 6 18 20Z" fill="#c97b64" ${st}/><path d="M24 42h16v14H24Z" fill="#f3ead8" ${st}/><path d="M22 12c2-6 18-6 20 0Z" fill="#f3ead8" ${st}/>`),
  digger: s(`<circle cx="32" cy="20" r="10" fill="#d9a07a" ${st}/><path d="M14 56c2-14 9-20 18-20s16 6 18 20Z" fill="#8a6a4a" ${st}/><path d="M24 14c2-6 14-6 16 0" stroke="#3a2c20" stroke-width="5" fill="none"/>`),
});

Object.assign(ICONS, {
  anvil: s(`<path d="M8 50c2-10 10-14 24-14s22 4 24 14Z" fill="#9d968a" ${st}/><path d="M14 40c6-3 30-3 36 0" stroke="#c4baa4" stroke-width="3" fill="none"/><ellipse cx="44" cy="24" rx="9" ry="7" fill="#7e776c" ${st}/><path d="M20 30l8-8 6 4-8 8Z" fill="#3a3530" ${st}/>`),
  scree: s(`<ellipse cx="20" cy="48" rx="12" ry="8" fill="#a59a86" ${st}/><ellipse cx="42" cy="46" rx="14" ry="9" fill="#8f8577" ${st}/><ellipse cx="31" cy="32" rx="11" ry="8" fill="#b5ab98" ${st}/><ellipse cx="50" cy="30" rx="6" ry="5" fill="#a59a86" ${st}/><ellipse cx="14" cy="32" rx="5" ry="4" fill="#8f8577" ${st}/>`),
  stone: s(`<path d="M12 42c0-12 10-22 22-22 10 0 18 8 18 18 0 8-8 12-20 12S12 50 12 42Z" fill="#a59a86" ${st}/><path d="M22 32c4-4 10-5 14-3" stroke="#cfc6b4" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  flint: s(`<path d="M18 50L12 30l14-16 22 6 6 20-16 14Z" fill="#4a4a52" ${st}/><path d="M26 14l4 18 18-12M30 32l-18-2M30 32l8 22" stroke="#6e6e7a" stroke-width="2" fill="none"/><path d="M20 26l6-6" stroke="#9a9aa8" stroke-width="3" stroke-linecap="round"/>`),
  hemp: s(`${[16, 26, 36, 46].map((x, i) => `<path d="M${x} 58V${14 + i % 2 * 6}" ${st}/><path d="M${x} ${30 + i % 2 * 4}l-8-6M${x} ${24 + i % 2 * 4}l8-6M${x} ${40}l-7-5" stroke="#6d8a44" stroke-width="4" stroke-linecap="round"/>`).join("")}`),
  fiber: s(`<path d="M14 46C24 30 40 22 52 16M16 50C26 34 42 26 54 22M12 42C22 26 36 18 48 12" stroke="#d8c8a0" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M26 30l6 8" ${st}/><path d="M12 42C22 26 36 18 48 12" stroke="#b8a678" stroke-width="2" fill="none"/>`),
  berries: s(`<path d="M32 10c14 0 24 10 24 22S46 54 32 54 8 44 8 32 18 10 32 10Z" fill="#5f7e3e" ${st}/>${[[22, 26], [38, 22], [30, 38], [44, 40], [18, 42]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#c4473e" ${st} stroke-width="1.8"/>`).join("")}`),
  barebush: s(`<path d="M32 58V38M32 46L16 28M32 44l16-16M32 40L22 22M32 40l11-14" stroke="#6b4a32" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="32" cy="58" r="4" fill="#8a6a44" ${st}/>`),
  berry: s(`<path d="M34 14c8-6 16-4 20 0-6 2-12 4-20 0Z" fill="#6d8a44" ${st}/>${[[24, 34], [36, 30], [30, 44], [42, 42], [20, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7" fill="#c4473e" ${st}/>`).join("")}<path d="M34 16v12" ${st}/>`),
  axe: s(`<path d="M20 58L42 12" stroke="#8a5a34" stroke-width="7" stroke-linecap="round"/><path d="M20 58L42 12" stroke="${O}" stroke-width="2.5" fill="none" opacity=".4"/><path d="M36 16c6-8 18-6 20 2-2 8-10 12-18 10Z" fill="#8f8577" ${st}/><path d="M34 22l8 6M36 18l8 6" stroke="#d8c8a0" stroke-width="3"/>`),
  knife: s(`<path d="M12 52l10-10 6 6-10 10Z" fill="#8a5a34" ${st}/><path d="M16 50l4-4M18 54l4-4" stroke="#d8c8a0" stroke-width="2.5"/><path d="M24 40L50 12c4 6 2 16-8 26l-12 8Z" fill="#4a4a52" ${st}/><path d="M30 38l16-20" stroke="#9a9aa8" stroke-width="2.5" stroke-linecap="round"/>`),
  hoe: s(`<path d="M20 56L40 18" stroke="#8a5a34" stroke-width="6" stroke-linecap="round"/><path d="M32 26l16-6 6 12-16 6Z" fill="#9d968a" ${st}/>`),
  log: s(`<rect x="6" y="22" width="50" height="20" rx="9" fill="#8a5a34" ${st}/><ellipse cx="8" cy="32" rx="6" ry="10" fill="#c9a06a" ${st}/><ellipse cx="8" cy="32" rx="3" ry="6" fill="#a8784a"/>`),
  meat: s(`<path d="M20 44c-6-6-4-16 4-20 8-4 18 0 20 8l6 12-8 8-10-4Z" fill="#b5653e" ${st}/><path d="M50 12l4 8-8 6-6-8Z" fill="#e8d6b0" ${st}/>`),
  hide: s(`<path d="M12 20c8-8 20-10 30-4l10 8-6 22-16 8-16-10Z" fill="#c9a06a" ${st}/><path d="M22 26c6 2 12 8 14 16M38 24c-2 8 0 16 4 22" stroke="#a8784a" stroke-width="2" fill="none"/>`),
  dock: s(`<path d="M4 40c10-4 18 4 28 0s18-4 28 0v20H4Z" fill="#6f9a92"/><path d="M10 26h44v10H10Z" fill="#a8784a" ${st}/><path d="M16 36v20M30 36v20M44 36v20" ${st}/><path d="M18 26v10M26 26v10M34 26v10M42 26v10" stroke="#7a5434" stroke-width="2"/>`),
  boat: s(`<path d="M4 50c10-4 18 4 28 0s18-4 28 0" stroke="#4f7a78" stroke-width="4" fill="none"/><path d="M6 36h52l-6 10H12Z" fill="#8a5a34" ${st}/><path d="M10 36c2-4 42-4 44 0" fill="#a8784a" ${st}/><path d="M44 8L36 40" ${st}/><path d="M22 34v-8h10v8" fill="#c9a96a" ${st}/>`),
  canoe: s(`<path d="M4 52c10-4 18 4 28 0s18-4 28 0" stroke="#4f7a78" stroke-width="4" fill="none"/><path d="M4 36c14 10 42 10 56 0-6 8-14 10-28 10S10 44 4 36Z" fill="#7a5434" ${st}/><path d="M10 37c12 5 32 5 44 0" stroke="#a8784a" stroke-width="3" fill="none"/><path d="M40 12l-12 30" ${st}/><ellipse cx="42" cy="10" rx="4" ry="6" fill="#a8784a" ${st}/>`),
  boatman: s(`<circle cx="32" cy="22" r="10" fill="#d9a07a" ${st}/><path d="M14 56c2-14 9-20 18-20s16 6 18 20Z" fill="#4f7a78" ${st}/><path d="M12 16c6-8 34-8 40 0-8 3-32 3-40 0Z" fill="#c9a96a" ${st}/><path d="M24 10c4-4 12-4 16 0" fill="#c9a96a" ${st}/>`),
});

Object.assign(ICONS, {
  torch: s(`<path d="M30 60l4-30h4l-2 30Z" fill="#8a5a34" ${st}/><path d="M28 32c-4-8 2-14 6-24 4 8 10 14 6 24Z" fill="#f0a24a" ${st}/><path d="M32 30c-2-4 1-8 3-13 2 5 4 8 2 13Z" fill="#ffd27a"/><path d="M29 33h12" stroke="#d8c8a0" stroke-width="3"/>`),
  roastFish: s(`<path d="M8 50L56 18" stroke="#8a5a34" stroke-width="4" stroke-linecap="round"/><path d="M14 40c10-12 26-14 36-6-8 12-26 14-36 6Z" fill="#c98a4a" ${st}/><path d="M22 38l6-4M30 36l6-4M38 34l5-3" stroke="#7a4a24" stroke-width="2.5"/><circle cx="44" cy="34" r="2" fill="${O}"/>`),
  roastMeat: s(`<path d="M8 52L56 16" stroke="#8a5a34" stroke-width="4" stroke-linecap="round"/><path d="M18 34c4-10 18-14 26-8s4 18-8 20-22-2-18-12Z" fill="#a8542e" ${st}/><path d="M24 34c4-4 10-6 14-4" stroke="#e08a5a" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  basket: s(`<path d="M14 24h36l-5 32H19Z" fill="#c9a96a" ${st}/><path d="M16 34h32M17 44h30" stroke="#8a6a3e" stroke-width="2.5"/><path d="M24 24v32M32 24v32M40 24v32" stroke="#a88a52" stroke-width="2"/><path d="M20 24c0-12 24-12 24 0" fill="none" ${st}/>`),
  sandals: s(`<path d="M12 46c0-14 6-24 12-24s8 10 6 24c-1 8-17 8-18 0Z" fill="#c9a96a" ${st}/><path d="M34 46c0-14 6-24 12-24s8 10 6 24c-1 8-17 8-18 0Z" fill="#c9a96a" ${st}/><path d="M16 32l10 6M38 32l10 6M15 42h13M37 42h13" stroke="#8a6a3e" stroke-width="2.5"/>`),
  net: s(`<path d="M10 14h44l-8 40H18Z" fill="none" ${st}/>${[0, 1, 2, 3].map((i) => `<path d="M${12 + i * 1.5} ${24 + i * 9}h${40 - i * 3}" stroke="#a88a52" stroke-width="2.5"/>`).join("")}${[20, 28, 36, 44].map((x) => `<path d="M${x} 14l${(32 - x) / 4} 40" stroke="#a88a52" stroke-width="2.5"/>`).join("")}<circle cx="12" cy="14" r="3" fill="#8a7a6a"/><circle cx="52" cy="14" r="3" fill="#8a7a6a"/>`),
  book: s(`<path d="M10 14c8-4 16-4 22 2 6-6 14-6 22-2v38c-8-4-16-4-22 2-6-6-14-6-22-2Z" fill="#e8d6b0" ${st}/><path d="M32 16v38" ${st}/><path d="M16 24h10M16 32h10M38 24h10M38 32h10" stroke="#a88a52" stroke-width="2.5"/>`),
});

Object.assign(ICONS, {
  clams: s(`<path d="M4 44c10-4 18 4 28 0s18-4 28 0v16H4Z" fill="#7fa6a2"/>${[[18, 38], [34, 42], [48, 36]].map(([x, y]) => `<path d="M${x - 9} ${y}c0-8 18-8 18 0-3 4-15 4-18 0Z" fill="#b9a690" ${st}/><path d="M${x} ${y - 6}v6" stroke="#8a7a6a" stroke-width="1.5"/>`).join("")}`),
  clam: s(`<path d="M10 40c0-18 44-18 44 0-6 10-38 10-44 0Z" fill="#b9a690" ${st}/>${[18, 26, 32, 38, 46].map((x) => `<path d="M32 26L${x} 46" stroke="#8a7a6a" stroke-width="1.5"/>`).join("")}`),
  hammer: s(`<path d="M24 58L38 22" stroke="#8a5a34" stroke-width="7" stroke-linecap="round"/><path d="M22 12h30l-2 14H24Z" fill="#8f8577" ${st}/><path d="M30 14v10M38 14v10" stroke="#d8c8a0" stroke-width="2.5"/>`),
  plot: s(`<path d="M8 50l10-26h28l10 26Z" fill="#c9b08a" ${st} stroke-dasharray="5 4"/>${[[16, 46], [28, 46], [40, 46], [22, 34], [34, 34]].map(([x, y]) => `<rect x="${x}" y="${y}" width="9" height="6" rx="2" fill="#9d968a" ${st} stroke-width="1.5"/>`).join("")}<path d="M44 14v12M38 20h12" stroke="#5a7838" stroke-width="3" stroke-linecap="round"/>`),
  bighouse: s(`<path d="M4 32L32 8l28 24" fill="#c9a96a" ${st}/><path d="M2 34L32 6l30 28" stroke="#8a6a3e" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M8 32v24h48V32" fill="#e8d6b0" ${st}/><path d="M28 56V40h10v16Z" fill="#6b4a2f" ${st}/><path d="M14 38h8v7h-8ZM44 38h8v7h-8Z" fill="#3a2c20"/><path d="M20 20h24" stroke="#a88a52" stroke-width="2.5"/>`),
  barn: s(`<path d="M8 28h48v28H8Z" fill="#b08a5a" ${st}/><path d="M4 30L32 10l28 20" fill="#c9a96a" ${st}/><path d="M24 56V38h16v18Z" fill="#7a5434" ${st}/><path d="M24 38l16 18M40 38L24 56" stroke="#5a3a24" stroke-width="2.5"/><path d="M12 36h8M44 36h8" stroke="#8a6a3e" stroke-width="2.5"/>`),
});

Object.assign(ICONS, {
  deer: s(`<path d="M14 40c0-8 8-12 18-12h10l6-6 6 2-2 8c0 10-6 14-14 14H22c-4 0-8-2-8-6Z" fill="#b07a4a" ${st}/><path d="M18 46v12M26 48v10M38 48v10M46 46v12" ${st}/><path d="M50 22l-4-10M50 22l6-8M46 12l-4-2M56 14l4-2" stroke="#7a5434" stroke-width="3" stroke-linecap="round" fill="none"/><circle cx="52" cy="26" r="1.8" fill="${O}"/><path d="M24 34h4M30 32h4" stroke="#f0e0c0" stroke-width="3" stroke-linecap="round"/>`),
  boar: s(`<path d="M10 40c0-10 10-16 22-16h10c8 0 14 6 14 12s-4 10-10 10H18c-4 0-8-2-8-6Z" fill="#5e4636" ${st}/><path d="M16 46v10M26 46v10M40 46v10M48 46v10" ${st}/><path d="M52 38l6 2" stroke="#f0e6c8" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="32" r="2" fill="#f0e6c8"/><path d="M22 24l4-6 4 6M32 22l4-6 4 6" stroke="#3a2c20" stroke-width="2.5" fill="none"/>`),
  duck: s(`<path d="M4 50c10-4 18 4 28 0s18-4 28 0" stroke="#4f7a78" stroke-width="4" fill="none"/><path d="M14 40c0-8 8-12 18-12 6 0 10 4 10 8h6c-2 8-8 12-16 12H22c-4 0-8-4-8-8Z" fill="#8a7a5a" ${st}/><circle cx="42" cy="24" r="7" fill="#3f6a4a" ${st}/><path d="M48 24l8 2-8 2Z" fill="#e0a040" ${st} stroke-width="1.5"/><circle cx="43" cy="22" r="1.5" fill="#fff"/>`),
  nest: s(`<ellipse cx="32" cy="42" rx="24" ry="12" fill="#a88a52" ${st}/><ellipse cx="32" cy="38" rx="16" ry="7" fill="#7a5f38"/><ellipse cx="26" cy="36" rx="5" ry="6" fill="#eef0e6" ${st} stroke-width="1.5"/><ellipse cx="36" cy="36" rx="5" ry="6" fill="#e6ecd8" ${st} stroke-width="1.5"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${10 + i * 8} ${46 - (i % 2) * 4}l6-8" stroke="#c9a96a" stroke-width="2"/>`).join("")}`),
  egg: s(`<ellipse cx="32" cy="36" rx="14" ry="18" fill="#eef0e6" ${st}/><path d="M24 30c2-6 6-8 10-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>`),
  spear: s(`<path d="M14 58L46 14" stroke="#8a5a34" stroke-width="5" stroke-linecap="round"/><path d="M44 8l12 2-4 12-10 2Z" fill="#4a4a52" ${st}/><path d="M38 22l6 4M36 25l6 4" stroke="#d8c8a0" stroke-width="2.5"/>`),
});

Object.assign(ICONS, {
  tiger: s(`<path d="M8 40c0-10 10-16 22-16h12c8 0 14 6 14 12 0 8-6 12-14 12H16c-4 0-8-4-8-8Z" fill="#d88a3a" ${st}/>${[20, 28, 36].map((x) => `<path d="M${x} 26l-3 8M${x + 2} 46l2-6" stroke="#3a2c20" stroke-width="3" stroke-linecap="round"/>`).join("")}<path d="M14 46v10M24 48v8M40 48v8M50 46v10" ${st}/><circle cx="48" cy="32" r="8" fill="#e09a48" ${st}/><path d="M44 26l-2-5M52 26l2-5" ${st}/><circle cx="46" cy="31" r="1.5" fill="${O}"/><circle cx="51" cy="31" r="1.5" fill="${O}"/><path d="M8 40c-4-2-6-8-2-12" stroke="#d88a3a" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  jungle: s(`${[[16, 30, 14], [34, 24, 16], [48, 34, 13], [26, 42, 12], [42, 46, 11]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#355428" ${st}/>`).join("")}<path d="M20 40c2 6 0 12-2 16M40 44c-2 6 0 10 2 14" stroke="#7a9a4e" stroke-width="2.5" fill="none"/><circle cx="30" cy="54" r="5" fill="#c9a96a" ${st} stroke-width="1.5"/>`),
  mushroom: s(`<path d="M14 34c0-12 36-12 36 0Z" fill="#b5653e" ${st}/><circle cx="24" cy="28" r="3" fill="#f3ead8"/><circle cx="38" cy="26" r="2.5" fill="#f3ead8"/><path d="M26 34h12l-2 20h-8Z" fill="#f3ead8" ${st}/>`),
  pelt: s(`<path d="M10 20c8 4 14 2 22 2s14 2 22-2c-2 10-2 18 0 26-8-4-14-2-22-2s-14-2-22 2c2-8 2-16 0-26Z" fill="#d88a3a" ${st}/>${[18, 28, 38, 46].map((x) => `<path d="M${x} 26l-3 8M${x - 2} 36l2 6" stroke="#3a2c20" stroke-width="2.5" stroke-linecap="round"/>`).join("")}`),
});

Object.assign(ICONS, {
  peachTree: s(`<path d="M30 60h4V36h-4Z" fill="#7a5434" ${st}/><circle cx="32" cy="26" r="18" fill="#628e42" ${st}/>${[[24, 22], [38, 20], [30, 32], [42, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="#f0a08a" ${st} stroke-width="1.5"/>`).join("")}`),
  jujubeTree: s(`<path d="M30 60h4V36h-4Z" fill="#7a5434" ${st}/><ellipse cx="32" cy="26" rx="20" ry="16" fill="#5e8040" ${st}/>${[[22, 24], [32, 18], [40, 28], [28, 32], [44, 20]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="4" fill="#a8442e" ${st} stroke-width="1.3"/>`).join("")}`),
  peach: s(`<path d="M32 18c12 0 20 10 18 22-2 10-10 14-18 14s-16-4-18-14c-2-12 6-22 18-22Z" fill="#f2a88c" ${st}/><path d="M32 20c-2 8-2 20 0 32" stroke="#d07a64" stroke-width="2" fill="none"/><path d="M32 18c4-6 10-8 14-6-4 4-8 6-14 6Z" fill="#6d8a44" ${st}/>`),
  jujube: s(`${[[22, 38], [36, 32], [42, 44], [28, 48]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="7" ry="9" fill="#a8442e" ${st}/>`).join("")}<path d="M36 22l2-8" stroke="#6d8a44" stroke-width="3" stroke-linecap="round"/>`),
});

export const iconFor = (key) => ICONS[key] ?? ICONS.clay;
