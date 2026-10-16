// OpenLife line icons. One stroke style (24 grid, 1.8 stroke, round caps), colour = currentColor.
// Presentation only: maps place ids and action ids to a pictogram. Unknown ids get a neutral dot.
const P = {
  house: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.6 3-5.6 3.6-9 2.4 1.4 3.4 3.4 3.4 5.4 1-.7 1.6-1.9 1.8-3.2 2.2 1.8 4.2 4.2 4.2 6.8 0 3.4-2.6 6-6.5 6Z"/><path d="M12 21c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.6-2.6 2.7-4.2 1.1 1.6 2.7 2.6 2.7 4.2 0 1.5-1.1 2.6-2.7 2.6Z"/>',
  waves: '<path d="M3 9c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/><path d="M3 14c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/><path d="M3 19c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 2.6-6.5 7-6.5 0 4.2-2.8 6.5-7 6.5Z"/><path d="M12 14.5C12 11 9.8 9 6 9c0 3.6 2.3 5.5 6 5.5Z"/><path d="M5 21h14"/>',
  kiln: '<path d="M4 20.5V13a8 8 0 0 1 16 0v7.5Z"/><path d="M9 20.5v-4.5a3 3 0 0 1 6 0v4.5"/><path d="M2.5 20.5h19"/>',
  clay: '<path d="M3 18.5c2-4.5 5-7 9-7s7 2.5 9 7Z"/><path d="M14 4.5 10.5 12"/><path d="M12.5 3.5l3 1.5"/>',
  reeds: '<path d="M7 21V9"/><path d="M12 21V5"/><path d="M17 21v-9"/><path d="M7 9c0-2 .8-3.5 2-4.5"/><path d="M12 5c0-1 .6-1.8 1.5-2.3"/><path d="M17 12c0-1.6.7-2.8 2-3.6"/><path d="M4 21h16"/>',
  bridge: '<path d="M2.5 13.5c3-3.2 6-4.8 9.5-4.8s6.5 1.6 9.5 4.8"/><path d="M2.5 13.5h19"/><path d="M6 13.5v-2.6M10 13.5V9.1M14 13.5V9.1M18 13.5v-2.6"/><path d="M3 18c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0"/>',
  bed: '<path d="M3 18.5V7"/><path d="M3 14h18v4.5"/><path d="M21 14v-2.5a2.5 2.5 0 0 0-2.5-2.5H11v5"/><circle cx="7" cy="11" r="1.8"/>',
  granary: '<path d="M5 9.5 12 4l7 5.5"/><path d="M6.5 9v11h11V9"/><path d="M9.5 13h5M9.5 16.5h5"/>',
  rack: '<path d="M4 4v16.5M20 4v16.5"/><path d="M4 8.5h16M4 14h16"/><path d="M7.5 8.5v-2h3v2M13.5 14v-2h3v2"/>',
  door: '<path d="M6 21V4h12v17"/><path d="M3.5 21h17"/><circle cx="14.5" cy="13" r=".9"/>',
  walk: '<circle cx="13.5" cy="4.5" r="1.8"/><path d="m10 21 2-6 2.5 2.5V21"/><path d="m8 12 2.5-4.5 3.5 1 2.5 3.5"/><path d="m12 15-1.5-6"/>',
  hammer: '<path d="m14 6 4 4"/><path d="m11.5 8.5 6-6 4 4-6 6Z"/><path d="m13 11-9.5 9.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  talk: '<path d="M4 5.5h16v10H9.5L5 19.5v-4H4Z"/><path d="M8 10.5h8"/>',
  hands: '<path d="M3 13.5 7 10l4 1.5 3.5-2 6.5 4.5"/><path d="M7 10 9.5 7.5H13"/><path d="M11 11.5 14 15c.6.7 1.6.8 2.3.2"/><path d="M3 13.5 7.5 18H11"/>',
  swap: '<path d="M4 8h14l-3.5-3.5"/><path d="M20 16H6l3.5 3.5"/>',
  pot: '<path d="M4 10h16"/><path d="M5.5 10a6.5 6.5 0 0 0 13 0"/><path d="M8 20h8"/><path d="M12 16.5V20"/><path d="M9 6.5c0-1 1-1.2 1-2.2M13 6.5c0-1 1-1.2 1-2.2"/>',
  bowl: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z"/><path d="M9 20h6"/><path d="M14.5 8 19 3.5"/>',
  cup: '<path d="M6 4h12l-1.5 15.5a1.5 1.5 0 0 1-1.5 1.3H9a1.5 1.5 0 0 1-1.5-1.3Z"/><path d="M6.5 9.5h11"/>',
  bucket: '<path d="M5 8h14l-1.6 11a1.6 1.6 0 0 1-1.6 1.4H8.2a1.6 1.6 0 0 1-1.6-1.4Z"/><path d="M5 8a7 7 0 0 1 14 0"/><path d="M8 13c1.3-.8 2.7-.8 4 0s2.7.8 4 0"/>',
  basket: '<path d="M3.5 10h17l-2 9.5h-13Z"/><path d="M8 10 11 4M16 10 13 4"/><path d="M7.5 14h9"/>',
  seed: '<path d="M12 20.5c-4 0-6.5-3-6.5-7 0-4.5 3.5-8 6.5-10 3 2 6.5 5.5 6.5 10 0 4-2.5 7-6.5 7Z"/><path d="M12 20.5v-10"/>',
  sickle: '<path d="M14 3.5a8 8 0 0 1 2.5 13l-4.5 1.5"/><path d="M14 3.5a6 6 0 0 0-1.5 10.5"/><path d="m12 18-5.5 3"/>',
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10Z"/>',
  sunset: '<path d="M4 18h16"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6v3M5.5 9.5l2 2M18.5 9.5l-2 2"/><path d="M8 21h8"/>',
  weave: '<path d="M4 4h16v16H4Z"/><path d="M4 9.5c5.3 0 10.7 0 16 0M4 14.5h16"/><path d="M9.5 4v16M14.5 4v16"/>',
  thread: '<circle cx="12" cy="10" r="5.5"/><path d="M8 7.5c2.5 1 5.5 1 8 0M7 11c3 1.2 7 1.2 10 0"/><path d="M12 15.5c0 2 1 3.5 4 5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M11 10V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4.5a1.4 1.4 0 0 1 2.3-1.5L8 14"/>',
  place: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  moonTheme: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10Z"/>',
  soundOn: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundOff: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  rain: '<path d="M7 15a4.5 4.5 0 0 1 .5-9 5.5 5.5 0 0 1 10.3 1.5A3.8 3.8 0 0 1 17.5 15Z"/><path d="m8.5 18-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

const PLACE = {
  "place:yard": "house", "place:hearth-yard": "flame", "place:river": "waves", "place:field": "sprout",
  "place:kiln": "kiln", "place:claypits": "clay", "place:reedbed": "reeds", "place:ford": "bridge",
};
// Spaces inside a place, matched by the words of their name.
const SPACE_WORDS = [[/寝|卧|床/, "bed"], [/粮|仓/, "granary"], [/架|晾/, "rack"]];

const ACTION = [
  [/\.arrive$|move_within$/, "walk"],
  [/\.talk$/, "talk"], [/hearth\.help$/, "hands"], [/\.barter\./, "swap"],
  [/\.cook$/, "pot"], [/\.eat$/, "bowl"], [/\.drink$/, "cup"], [/\.draw$/, "bucket"],
  [/\.gather|\.take$|objects\.take/, "basket"], [/\.place$/, "hand"],
  [/\.sow$/, "seed"], [/\.harvest$/, "sickle"], [/\.rest$/, "moon"], [/end_day$/, "sunset"],
  [/weave_/, "weave"], [/prepare_fiber$/, "thread"], [/\.tend$/, "flame"], [/\.craft$/, "hands"], [/\.exchange$/, "swap"],
];

export function icon(name, extraClass = "") {
  const body = P[name] || P.dot;
  return `<svg class="ol-icon ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
export function placeIconName(placeId, label = "") {
  if (PLACE[placeId]) return PLACE[placeId];
  for (const [re, name] of SPACE_WORDS) if (re.test(label)) return name;
  return placeId ? "door" : "place";
}
export function actionIconName(action) {
  const id = action?.id || "";
  if (id === "settlement-locations.arrive") return placeIconName(action.payload?.placeId, action.label);
  if (id === "world-space.move_within") {
    for (const [re, name] of SPACE_WORDS) if (re.test(action.label || "")) return name;
    return "door";
  }
  for (const [re, name] of ACTION) if (re.test(id)) return name;
  return "dot";
}
