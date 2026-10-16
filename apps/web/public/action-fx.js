// 行动动画：一次行动成功后，在场景上播一段与行动相符的短动画，
// 再把新得到的物品从场景中间"飞"进行囊。纯展示，不读写游戏状态。
import { objectKind, resourceKind, propSvg } from "./scene-props.js";

const RECIPE_FX = {
  "recipe:net-fish": "fish",
  "recipe:roast-fish": "cook",
  "recipe:fire-jar": "kiln", "recipe:fire-bowl": "kiln",
  "recipe:shape-greenware": "clay",
  "recipe:mend-roof": "build",
  "recipe:digging-stick": "carve",
};
const COMMAND_FX = {
  "settlement-locations.cook": "cook",
  "settlement-locations.eat": "eat",
  "settlement-locations.drink": "drink",
  "settlement-locations.rest": "rest",
  "settlement-locations.sow": "sow",
  "settlement-locations.tend": "tend",
  "settlement-locations.harvest": "harvest",
  "settlement-locations.exchange": "trade",
  "settlement-locations.weave_bag": "weave", "settlement-locations.weave_mat": "weave",
  "settlement-locations.prepare_fiber": "weave", "settlement-locations.weave_wrap": "weave",
};

/** Which animation an action earns. */
export function fxKindFor(action, payload = {}, before = {}) {
  if (action === "settlement-locations.craft") return RECIPE_FX[payload.recipeId] || "weave";
  if (action === "settlement-locations.draw") return payload.resourceId === "resource:water" ? "drink-draw" : "gather";
  if (action === "settlement-locations.tend" && before.spaceId === "space:kiln-mouth") return "kiln";
  return COMMAND_FX[action] || "";
}

/** Objects newly in the actor's hands after the action. */
export function gainedObjects(before = {}, after = {}) {
  const had = new Set((before.objects || []).filter(o => o.placement === "在手中").map(o => o.id));
  return (after.objects || []).filter(o => o.placement === "在手中" && !had.has(o.id));
}

const r = (a, b) => a + Math.random() * (b - a);
const parts = {
  fish: () => `<svg class="afx-svg" viewBox="0 0 400 300"><path class="afx-net" d="M70 230 Q200 20 330 210"/>
    <g class="afx-leap">${'<path d="M0 0q16-14 34 0l10-8-2 10 4 10-12-6q-18 12-34-6z" fill="#9fb0ac" stroke="#2f2a26" stroke-width="2"/>'}</g>
    ${[0, 1, 2].map(i => `<ellipse class="afx-ring" cx="${250 + i * 8}" cy="232" rx="30" ry="8" style="--d:${.55 + i * .18}s"/>`).join("")}</svg>`,
  cook: () => flames(5) + steam(4),
  kiln: () => flames(8, true) + sparks(14) + smoke(5),
  clay: () => `<div class="afx-spin">${propSvg("greenware")}</div>`,
  build: () => `<div class="afx-hammer"></div>` + dust(10) + `<div class="afx-thatch"></div>`,
  carve: () => chips(12),
  weave: () => `<svg class="afx-svg" viewBox="0 0 400 300">${[0, 1, 2, 3, 4].map(i =>
      `<path class="afx-strand" d="M${120 + i * 40} 70 Q${200} 150 ${280 - i * 40} 230" style="--d:${i * .12}s"/>`).join("")}</svg>`,
  eat: () => steam(3) + `<div class="afx-badge">饱了一些</div>`,
  drink: () => drops(8),
  "drink-draw": () => drops(10),
  gather: () => leaves(12),
  rest: () => `<div class="afx-night"></div><div class="afx-zzz"><i>z</i><i>z</i><i>Z</i></div>`,
  sow: () => seeds(10),
  tend: () => leaves(8),
  harvest: () => `<svg class="afx-svg" viewBox="0 0 400 300">${Array.from({ length: 9 }, (_, i) =>
      `<path class="afx-stalk" d="M${110 + i * 22} 250q-8-50 2-90" style="--d:${i * .05}s"/>`).join("")}</svg>`,
  trade: () => `<div class="afx-swap afx-swap--a"></div><div class="afx-swap afx-swap--b"></div>`,
};
function flames(n, big) {
  return `<div class="afx-flames${big ? " afx-flames--big" : ""}">${Array.from({ length: n }, (_, i) =>
    `<i style="left:${r(30, 70)}%;--d:${(i * .07).toFixed(2)}s;--s:${r(.7, 1.3).toFixed(2)}"></i>`).join("")}</div>`;
}
const scatter = (cls, n, fn) => Array.from({ length: n }, (_, i) => `<i class="${cls}" style="${fn(i)}"></i>`).join("");
const sparks = n => scatter("afx-spark", n, i => `left:${r(40, 60)}%;--dx:${r(-90, 90).toFixed(0)}px;--dy:${r(-160, -60).toFixed(0)}px;--d:${r(0, .4).toFixed(2)}s`);
const smoke = n => scatter("afx-smoke", n, i => `left:${r(42, 58)}%;--dx:${r(-40, 60).toFixed(0)}px;--d:${(i * .2).toFixed(2)}s`);
const steam = n => scatter("afx-steam", n, i => `left:${45 + i * 4}%;--d:${(i * .25).toFixed(2)}s`);
const dust = n => scatter("afx-dust", n, i => `left:${r(35, 65)}%;--dx:${r(-70, 70).toFixed(0)}px;--d:${r(0, .5).toFixed(2)}s`);
const chips = n => scatter("afx-chip", n, i => `left:${r(44, 56)}%;--dx:${r(-80, 80).toFixed(0)}px;--dy:${r(-90, -30).toFixed(0)}px;--d:${r(0, .6).toFixed(2)}s`);
const drops = n => scatter("afx-drop", n, i => `left:${r(40, 60)}%;--dx:${r(-50, 50).toFixed(0)}px;--d:${r(0, .4).toFixed(2)}s`);
const leaves = n => scatter("afx-leaf", n, i => `left:${r(30, 70)}%;--dx:${r(-60, 60).toFixed(0)}px;--d:${r(0, .5).toFixed(2)}s`);
const seeds = n => scatter("afx-seed", n, i => `left:${30 + i * 4}%;--d:${(i * .06).toFixed(2)}s`);

/** Play the action's animation and fly what was gained into the bag. */
export function playActionFx({ action, payload, before, after }) {
  if (typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const theater = document.getElementById("sceneTheater");
  if (!theater) return;
  const kind = fxKindFor(action, payload, before);
  const gained = gainedObjects(before, after).slice(0, 3);
  if (!kind && !gained.length) return;
  const layer = document.createElement("div");
  layer.className = "action-fx";
  layer.dataset.fx = kind;
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = (parts[kind]?.() || "") + gained.map((o, i) =>
    `<div class="afx-gain" style="--d:${(0.9 + i * 0.25).toFixed(2)}s">${propSvg(objectKind(o), .6)}<b>+ ${esc(o.name)}</b></div>`).join("");
  // A drawn resource with nothing new in hand (e.g. water poured into a jar) still shows what it was.
  if (!gained.length && action === "settlement-locations.draw" && payload.resourceId) {
    layer.insertAdjacentHTML("beforeend", `<div class="afx-gain" style="--d:.6s">${propSvg(resourceKind(payload.resourceId), .6)}</div>`);
  }
  theater.querySelector(".action-fx")?.remove();
  theater.appendChild(layer);
  setTimeout(() => layer.remove(), 2800);
}
function esc(v) { return String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
