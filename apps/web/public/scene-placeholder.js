/**
 * 场景底图的占位插画。
 *
 * 为什么有这个东西：`settlement.js` 引用了 9 张 /art/scene-*.webp，但仓库里
 * 一张都没有（`git log --diff-filter=D` 也查不到被删记录，说明从来没提交过）。
 * 结果是"画面模式"打开后只有一个空色块，用户会判定这个功能坏了。
 *
 * 这里按 docs/design/DESIGN.md 的分层要求（远景天空/远山、中景房屋/河、
 * 近景窑/柴堆）用 SVG 画一套**占位**，每个地点一套构图、按时辰与季节调色，
 * 与 storyboard 的取景一致。真插画到位后，把 SCENE_PLACEHOLDER 里的 usePlaceholder
 * 关掉即可，调用方无需改动。
 *
 * 只做"够用且不难看"的衬托：低饱和、大色块、不画细节——文字才是主角。
 */

/** 地点 → 构图。每个地点只描述"有什么"，配色由时辰统一决定。 */
const LAYOUTS = {
  "place:yard": { mountains: 2, hut: true, kiln: false, river: false, reeds: false, field: false, pots: 3, woodpile: true },
  "place:hearth-yard": { mountains: 2, hut: true, kiln: true, river: false, reeds: false, field: false, pots: 2, woodpile: true },
  "place:hearth": { mountains: 1, hut: true, kiln: true, river: false, reeds: false, field: false, pots: 2, woodpile: false },
  "place:reedbed": { mountains: 1, hut: false, kiln: false, river: true, reeds: true, field: false, pots: 0, woodpile: false },
  "place:field": { mountains: 2, hut: false, kiln: false, river: false, reeds: false, field: true, pots: 1, woodpile: false },
  "place:river": { mountains: 2, hut: false, kiln: false, river: true, reeds: true, field: false, pots: 0, woodpile: false },
  "place:ford": { mountains: 2, hut: false, kiln: false, river: true, reeds: false, field: false, pots: 0, woodpile: false },
  "place:kiln": { mountains: 1, hut: false, kiln: true, river: false, reeds: false, field: false, pots: 3, woodpile: true },
  "place:claypits": { mountains: 1, hut: false, kiln: false, river: false, reeds: false, field: false, pots: 1, woodpile: false, clay: true },
};

/**
 * 时辰配色：只改天空、地、光的色相与明度，不改构图——
 * 这样同一地点的不同时辰可以交叉淡入，与 DESIGN.md §6「场景转场 600ms」一致。
 */
const TIMES = {
  dawn:  { skyTop: "#c9c6bb", skyBottom: "#e6d3b6", hillFar: "#8d9a8c", hillNear: "#6d7d70", ground: "#7c7358", light: "#f3d9a8", lightOpacity: 0.16 },
  day:   { skyTop: "#b9c9c6", skyBottom: "#dfd9c2", hillFar: "#8fa196", hillNear: "#728578", ground: "#8a8060", light: "#f6e6bd", lightOpacity: 0.10 },
  dusk:  { skyTop: "#9b9f96", skyBottom: "#d9b48c", hillFar: "#7f8b7d", hillNear: "#63705f", ground: "#75694f", light: "#f0bd7f", lightOpacity: 0.22 },
  night: { skyTop: "#39474a", skyBottom: "#4d5754", hillFar: "#3f4d47", hillNear: "#33403a", ground: "#3a3b30", light: "#9fc0b4", lightOpacity: 0.14 },
};

/** 季节只影响地面与草木的绿度。 */
const SEASONS = {
  春: { tint: "#7d9160", tintStrength: 0.22 },
  夏: { tint: "#6f8a56", tintStrength: 0.30 },
  秋: { tint: "#a08a4e", tintStrength: 0.34 },
  冬: { tint: "#c9cfc6", tintStrength: 0.42 },
};

const W = 1600;
const H = 900;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 稳定的字符串散列，保证同一地点每次画得一样。 */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mountains(rand, palette, count) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const baseY = 300 + i * 70;
    const peak = baseY - 150 - rand() * 90;
    // 山体必须横跨整个画幅：左边界取负值、右边界超出 1600，
    // 否则连到画面边缘会留下一条直边，看起来像贴图没铺满。
    const left = -260 - rand() * 120;
    const right = W + 260 + rand() * 160;
    const apex = left + (right - left) * (0.28 + rand() * 0.4);
    const color = i === 0 ? palette.hillFar : palette.hillNear;
    out += `<path d="M${left.toFixed(0)} ${baseY} L${apex.toFixed(0)} ${peak.toFixed(0)} L${right.toFixed(0)} ${baseY} Z" fill="${color}" opacity="${0.9 - i * 0.12}"/>`;
  }
  return out;
}

function hut(palette) {
  return `
    <g opacity=".95">
      <path d="M980 560 L1120 460 L1260 560 Z" fill="#6b5a44"/>
      <path d="M1000 560 L1000 700 L1240 700 L1240 560 Z" fill="#8a7457"/>
      <path d="M1098 620 L1098 700 L1148 700 L1148 620 Z" fill="#3f3a30"/>
      <path d="M980 560 L1120 460 L1260 560" fill="none" stroke="#57492f" stroke-width="10"/>
    </g>`;
}

function kiln() {
  return `
    <g opacity=".95">
      <path d="M300 720 L300 620 A90 90 0 0 1 480 620 L480 720 Z" fill="#7d6350"/>
      <path d="M352 720 L352 672 A38 38 0 0 1 428 672 L428 720 Z" fill="#3a3029"/>
      <circle cx="390" cy="676" r="16" fill="#e9a75a" opacity=".85"/>
      <rect x="286" y="716" width="208" height="14" rx="6" fill="#5d4a3a"/>
    </g>`;
}

function river(palette) {
  return `
    <g opacity=".9">
      <path d="M0 640 Q400 600 800 650 T1600 620 L1600 900 L0 900 Z" fill="#5f7d7c"/>
      <path d="M0 690 Q420 650 800 700 T1600 670" fill="none" stroke="#8fb0aa" stroke-width="6" opacity=".55"/>
      <path d="M0 750 Q420 710 800 760 T1600 730" fill="none" stroke="#8fb0aa" stroke-width="4" opacity=".35"/>
    </g>`;
}

function reeds(rand) {
  let out = `<g opacity=".8" stroke="#5f6b45" stroke-width="5" stroke-linecap="round">`;
  for (let i = 0; i < 26; i++) {
    const x = 60 + rand() * 1500;
    const y = 700 + rand() * 150;
    const h = 60 + rand() * 90;
    out += `<path d="M${x} ${y} C${x + 6} ${y - h * 0.6}, ${x - 6} ${y - h * 0.8}, ${x} ${y - h}"/>`;
  }
  return out + `</g>`;
}

function field(rand) {
  let out = `<g opacity=".85">`;
  for (let i = 0; i < 7; i++) {
    const y = 660 + i * 26;
    out += `<path d="M0 ${y} Q800 ${y - 18} 1600 ${y}" fill="none" stroke="#8f8a52" stroke-width="${9 - i}" opacity="${0.55 - i * 0.05}"/>`;
  }
  for (let i = 0; i < 40; i++) {
    const x = rand() * W, y = 660 + rand() * 200;
    out += `<path d="M${x} ${y} l-5 -22 M${x} ${y} l0 -26 M${x} ${y} l5 -22" stroke="#a89a5c" stroke-width="2" opacity=".7"/>`;
  }
  return out + `</g>`;
}

function pots(rand, count) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = 620 + i * 120 + rand() * 30;
    const y = 745 + rand() * 20;
    const r = 26 + rand() * 12;
    out += `<g opacity=".95"><path d="M${x - r} ${y} a${r} ${r * 0.9} 0 0 0 ${r * 2} 0 Z" fill="#a8754f"/>
      <ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.32}" fill="#8a5c3c"/></g>`;
  }
  return out;
}

function woodpile() {
  return `<g opacity=".9" fill="#6f5a3f">
    <rect x="1290" y="726" width="150" height="16" rx="8"/><rect x="1300" y="706" width="130" height="16" rx="8"/>
    <rect x="1310" y="686" width="110" height="16" rx="8"/></g>`;
}

function claypits(rand) {
  let out = `<g opacity=".85" fill="#9a7a5c">`;
  for (let i = 0; i < 4; i++) {
    const cx = 400 + i * 260 + rand() * 60, cy = 760 + rand() * 40;
    out += `<ellipse cx="${cx}" cy="${cy}" rx="${90 + rand() * 40}" ry="${26 + rand() * 14}"/>`;
  }
  return out + `</g>`;
}

/**
 * 画一个地点的场景底图（SVG 字符串）。
 *
 * @param placeId 地点 id，决定构图；未知地点退回院子
 * @param daypart dawn | day | dusk | night，决定配色
 * @param season  春/夏/秋/冬，决定地面色偏
 */
export function scenePlaceholder(placeId, daypart = "day", season = "秋") {
  const layout = LAYOUTS[placeId] ?? LAYOUTS["place:yard"];
  const palette = TIMES[daypart] ?? TIMES.day;
  const seasonTint = SEASONS[season] ?? SEASONS.秋;
  const rand = mulberry32(hash(String(placeId)));

  const ground = `<rect x="0" y="540" width="${W}" height="${H - 540}" fill="${palette.ground}"/>
    <rect x="0" y="540" width="${W}" height="${H - 540}" fill="${seasonTint.tint}" opacity="${seasonTint.tintStrength * 0.5}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${palette.skyTop}"/>
        <stop offset="1" stop-color="${palette.skyBottom}"/>
      </linearGradient>
      <radialGradient id="sunGlow" cx="0.72" cy="0.24" r="0.5">
        <stop offset="0" stop-color="${palette.light}" stop-opacity=".55"/>
        <stop offset="1" stop-color="${palette.light}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <rect width="${W}" height="${H}" fill="url(#sunGlow)"/>
    ${daypart === "night" ? `<circle cx="1150" cy="180" r="52" fill="#e8e6cf" opacity=".8"/>` : `<circle cx="1150" cy="200" r="74" fill="${palette.light}" opacity=".75"/>`}
    ${mountains(rand, palette, layout.mountains)}
    ${layout.river ? river(palette) : ground}
    ${layout.field ? field(rand) : ""}
    ${layout.hut ? hut(palette) : ""}
    ${layout.kiln ? kiln() : ""}
    ${layout.clay ? claypits(rand) : ""}
    ${layout.reeds ? reeds(rand) : ""}
    ${layout.pots ? pots(rand, layout.pots) : ""}
    ${layout.woodpile ? woodpile() : ""}
    <!-- 底部留白给人物头像牌与操作条（DESIGN.md §5.2：画面下方 35% 给站位点） -->
    <rect x="0" y="760" width="${W}" height="${H - 760}" fill="${palette.ground}" opacity=".55"/>
  </svg>`;
}

/** 这张 SVG 的 data URI，可直接塞进 <img src>。 */
export function scenePlaceholderUrl(placeId, daypart, season) {
  const svg = scenePlaceholder(placeId, daypart, season);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 真插画到位了没有。
 *
 * 部署时如果 `art/scene-<place>.webp` 存在，就用真图；否则用占位。
 * 调用方（settlement.js）只问这一个函数，不需要知道素材在哪。
 */
export async function resolveSceneArt(realUrl, placeId, daypart, season) {
  if (realUrl) {
    const ok = await new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => resolve(probe.naturalWidth > 0);
      probe.onerror = () => resolve(false);
      probe.src = realUrl;
    });
    if (ok) return realUrl;
  }
  return scenePlaceholderUrl(placeId, daypart, season);
}
