// 场景氛围层：炊烟、火星、水光、飞鸟、季节飘落物、萤火与昼夜光线。纯展示，不读写游戏状态。
// 坐标与插画同一套 1200×630 viewBox，用 xMidYMid slice 与插画的 object-fit: cover 对齐。
const SPOTS = {
  hearth:   { smoke: [[600, 232]], fire: [600, 362], glow: [600, 352, 150] },
  kiln:     { smoke: [[592, 226]], fire: [549, 372], glow: [549, 362, 140] },
  yard:     { smoke: [[351, 104]] },
  field:    {},
  river:    { water: [0, 1100, 165, 300] },
  ford:     { water: [400, 1150, 150, 320] },
  reedbed:  { water: [20, 600, 205, 285] },
  claypits: { water: [0, 520, 40, 150] },
};
let rngState = 1;
const rnd = () => ((rngState = (rngState * 16807) % 2147483647) / 2147483647);
const r1 = n => Math.round(n * 10) / 10;

function smoke([x, y], i) {
  return Array.from({ length: 9 }, (_, k) =>
    `<circle class="fx-smoke" cx="${x}" cy="${y}" r="${r1(9 + rnd() * 6)}" style="--d:${r1(-k * 0.95 - i)}s;--dx:${r1(20 + rnd() * 50)}px;--dx2:${r1(-10 + rnd() * 30)}px"/>`).join("");
}
function embers([x, y]) {
  return Array.from({ length: 9 }, (_, k) =>
    `<circle class="fx-ember" cx="${r1(x + (rnd() - .5) * 60)}" cy="${y}" r="${r1(1.6 + rnd() * 2)}" style="--d:${r1(rnd() * 3)}s;--t:${r1(1.8 + rnd() * 1.6)}s;--dx:${r1((rnd() - .5) * 60)}px"/>`).join("");
}
function water([x0, x1, y0, y1]) {
  return Array.from({ length: 12 }, (_, k) => {
    const y = r1(y0 + rnd() * (y1 - y0)), x = r1(x0 + rnd() * (x1 - x0 - 80)), w = r1(30 + rnd() * 70);
    return `<path class="fx-glint" d="M${x} ${y}h${w}" style="--d:${r1(rnd() * 4)}s;--t:${r1(2.6 + rnd() * 2.5)}s"/>`;
  }).join("");
}
function birds() {
  return Array.from({ length: 3 }, (_, k) =>
    `<g class="fx-bird" style="--d:${k * 7 + r1(rnd() * 4)}s;--y:${r1(90 + rnd() * 110)}px;--t:${r1(22 + rnd() * 10)}s">` +
    `<path d="M0 0q6 -6 12 0q6 -6 12 0" /></g>`).join("");
}
function fireflies() {
  return Array.from({ length: 14 }, () =>
    `<circle class="fx-firefly" cx="${r1(80 + rnd() * 1040)}" cy="${r1(330 + rnd() * 260)}" r="2.6" style="--d:${r1(rnd() * 5)}s;--t:${r1(4 + rnd() * 4)}s;--dx:${r1((rnd() - .5) * 60)}px;--dy:${r1((rnd() - .5) * 40)}px"/>`).join("");
}
function stars() {
  return Array.from({ length: 26 }, () =>
    `<circle class="fx-star" cx="${r1(rnd() * 1200)}" cy="${r1(rnd() * 170)}" r="${r1(.8 + rnd() * 1.4)}" style="--d:${r1(rnd() * 4)}s"/>`).join("");
}
function fall(kind) {
  const n = kind === "snow" ? 34 : 12;
  return Array.from({ length: n }, () =>
    `<i class="fx-fall fx-fall--${kind}" style="left:${r1(rnd() * 100)}%;--d:${r1(-rnd() * 12)}s;--t:${r1((kind === "snow" ? 9 : 11) + rnd() * 7)}s;--s:${r1(.6 + rnd() * .8)};--dx:${r1((rnd() - .3) * 120)}px"></i>`).join("");
}

// 雨：细长墨线斜落，地面散开水圈；雪：大小不一的雪片左右飘；阴：慢慢移动的云影。
function rain() {
  return Array.from({ length: 150 }, () =>
    `<i class="fx-drop" style="left:${r1(-10 + rnd() * 115)}%;--d:${r1(-rnd() * 2)}s;--t:${r1(.45 + rnd() * .35)}s;--h:${r1(22 + rnd() * 30)}px;--o:${r1(.4 + rnd() * .4)}"></i>`).join("");
}
function ripples(band) {
  const [y0, y1] = band;
  return Array.from({ length: 22 }, () => {
    const x = r1(40 + rnd() * 1120), y = r1(y0 + rnd() * (y1 - y0)), w = r1(10 + rnd() * 14);
    return `<ellipse class="fx-ripple" cx="${x}" cy="${y}" rx="${w}" ry="${r1(w * .3)}" style="--d:${r1(rnd() * 1.6)}s;--t:${r1(1.1 + rnd() * .8)}s"/>`;
  }).join("");
}
function snowfall(heavy) {
  return Array.from({ length: heavy ? 70 : 26 }, () => {
    const size = r1(2.5 + rnd() * (heavy ? 5 : 3));
    return `<i class="fx-flake" style="left:${r1(rnd() * 100)}%;--d:${r1(-rnd() * 10)}s;--t:${r1(6 + rnd() * 6)}s;--sz:${size}px;--sway:${r1(20 + rnd() * 50)}px;--o:${r1(.55 + rnd() * .4)}"></i>`;
  }).join("");
}
function clouds() {
  return Array.from({ length: 3 }, (_, k) =>
    `<ellipse class="fx-cloud" cx="${r1(-200 - k * 420)}" cy="${r1(80 + rnd() * 120)}" rx="${r1(260 + rnd() * 160)}" ry="${r1(50 + rnd() * 40)}" style="--d:${r1(-k * 18)}s;--t:${r1(55 + rnd() * 25)}s"/>`).join("");
}

/** daypart: dawn | day | dusk | night；season: 春 夏 秋 冬；sky: 晴 阴 雨 雪 */
export function renderSceneFx(host, { location, daypart, season, sky = "晴" }) {
  if (!host) return;
  const key = location + "|" + daypart + "|" + season + "|" + sky;
  if (host.dataset.key === key) return;
  host.dataset.key = key;
  rngState = [...key].reduce((a, c) => (a * 31 + c.codePointAt(0)) % 2147483647, 7) || 1;
  const spot = SPOTS[location] || {};
  const night = daypart === "night", dusk = daypart === "dusk";
  const parts = [];
  if (night) parts.push(stars());
  if (spot.glow) parts.push(`<circle class="fx-glow" cx="${spot.glow[0]}" cy="${spot.glow[1]}" r="${spot.glow[2]}"/>`);
  if (spot.smoke) spot.smoke.forEach((p, i) => parts.push(smoke(p, i)));
  if (spot.fire) parts.push(embers(spot.fire));
  if (spot.water) parts.push(water(spot.water));
  const wet = sky === "雨" || sky === "雪";
  if (!night && season !== "冬" && !wet) parts.push(birds());
  if ((night || dusk) && season !== "冬" && !wet) parts.push(fireflies());
  if (sky === "阴" || wet) parts.push(clouds());
  if (sky === "雨") parts.push(ripples([470, 620]));
  if (sky === "雨" && spot.water) parts.push(ripples([spot.water[2], spot.water[3]]));
  // 晴天冬日偶有零星雪粒，秋落叶、春落花只在不下雨时飘
  const fallKind = wet ? "" : season === "秋" ? "leaf" : season === "春" ? "petal" : "";
  host.innerHTML =
    `<svg class="fx-svg" viewBox="0 0 1200 630" preserveAspectRatio="xMidYMid slice" aria-hidden="true">` +
    `<defs><radialGradient id="fxGlow"><stop offset="0" stop-color="#ffb35c" stop-opacity=".55"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>` +
    `<filter id="fxBlur"><feGaussianBlur stdDeviation="6"/></filter></defs>` + parts.join("") + `</svg>` +
    (fallKind ? `<div class="fx-fall-layer">${fall(fallKind)}</div>` : "") +
    (sky === "雨" ? `<div class="fx-rain-layer">${rain()}</div>` : "") +
    (sky === "雪" ? `<div class="fx-snow-layer">${snowfall(true)}</div><div class="fx-snow-ground"></div>`
      : season === "冬" && !wet ? `<div class="fx-snow-layer">${snowfall(false)}</div>` : "");
}

/** 用今天已用掉的活动格推算时段：刚开始是清晨，用完是夜里 */
export function daypartOf(activity) {
  const cap = Number(activity?.capacity) || 8, rem = Number(activity?.remaining);
  const used = cap - (Number.isFinite(rem) ? rem : cap);
  const r = used / cap;
  if (r <= 0.12) return "dawn";
  if (r < 0.7) return "day";
  if (r < 1) return "dusk";
  return "night";
}
