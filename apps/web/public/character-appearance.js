/**
 * 立体小玩偶风人物（配合 2.5D 场景插画）：大头短身，渐变体积光（左上受光），柔和接地阴影。
 * 外观由稳定的 actor ID 决定（同一个人每次都一样，不同人尽量不同）。
 * 分组 fig-upper / fig-head / fig-eyes 供 stage.css 做呼吸、转头、眨眼。viewBox 116×178 不变，脚底在 y≈166。
 */
const skins = ["#f6d7b8", "#efc9a3", "#f9dfc6", "#e5b78f", "#f2cfae", "#dcab83"];
const fabrics = ["#c9925e", "#7d9bb5", "#8fb07a", "#c97b64", "#e0c48a", "#6fa3a0", "#b08cb0"];
const hairTones = ["#4a3326", "#3b2a20", "#5a3d2b", "#2e231d", "#6b4a33"];
const sashes = ["#b5523d", "#4f6f86", "#7a6236", "#c27a3c"];

// 头型（中心 58,58）：rx, ry
const heads = [[27, 26], [28, 25], [26, 27], [28, 26.5], [26.5, 25.5]];
// 发型（以头顶 y≈31 为准）
const CAP = '<path d="M31.5 57c-2-17 10-27 26.5-27S86.5 40 84.5 57c-6-9-14-13-26.5-13S37.5 48 31.5 57Z" fill="url(#HID)"/>';
const hairs = [
  { back: '', front: CAP + '<circle cx="58" cy="27" r="9" fill="url(#HID)"/><path d="M50 31h16" stroke="SASH" stroke-width="3" stroke-linecap="round"/>' },
  { back: '<circle cx="83" cy="48" r="8.5" fill="url(#HID)"/>', front: CAP },
  { back: '<path d="M31 58c-2-16 10-28 27-28s29 12 27 28l3 34c-4 3-8 3-10 0l-1-30H39l-1 30c-2 3-6 3-10 0Z" fill="url(#HID)"/>',
    front: CAP + '<path d="M33 47c16-6 34-6 50 0" stroke="SASH" stroke-width="3" fill="none" stroke-linecap="round"/>' },
  { back: '', front: '<path d="M31 60c-3-19 9-30 27-30s30 11 27 30c-2-6-5-10-9-12-5 3-12 4-19 2-6 2-12 5-16 10h-10Z" fill="url(#HID)"/>' },
  { back: '', front: '<circle cx="36" cy="34" r="8" fill="url(#HID)"/><circle cx="80" cy="34" r="8" fill="url(#HID)"/>' + CAP },
  { back: '', front: CAP.replace("url(#HID)", "#d8d2c8") + '<circle cx="58" cy="27" r="8.5" fill="#cfc8bd"/><path d="M58 19v-6" stroke="#8a6a3a" stroke-width="3" stroke-linecap="round"/><path d="M40 44c10-5 26-6 36-1" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/>' },
];
// 眼：圆亮眼、小豆眼、弯笑眼、垂眼、细长眼
const eyes = [
  '<ellipse cx="48" cy="61" rx="3.6" ry="4.6" fill="#2b211c"/><ellipse cx="68" cy="61" rx="3.6" ry="4.6" fill="#2b211c"/><circle cx="49.3" cy="59.2" r="1.4" fill="#fff"/><circle cx="69.3" cy="59.2" r="1.4" fill="#fff"/>',
  '<circle cx="48" cy="61" r="2.8" fill="#2b211c"/><circle cx="68" cy="61" r="2.8" fill="#2b211c"/><circle cx="49" cy="60" r=".9" fill="#fff"/><circle cx="69" cy="60" r=".9" fill="#fff"/>',
  '<path d="M44 62q4-5 8 0M64 62q4-5 8 0" stroke="#2b211c" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  '<ellipse cx="48" cy="62" rx="3.2" ry="3.8" fill="#2b211c"/><ellipse cx="68" cy="62" rx="3.2" ry="3.8" fill="#2b211c"/><path d="M44 57.5l7 1.5M72 57.5l-7 1.5" stroke="#2b211c" stroke-width="1.6" stroke-linecap="round"/><circle cx="49" cy="61" r="1" fill="#fff"/><circle cx="69" cy="61" r="1" fill="#fff"/>',
  '<path d="M44 61.5h8M64 61.5h8" stroke="#2b211c" stroke-width="2.6" stroke-linecap="round"/>',
];
const mouths = [
  '<path d="M55 70q3 3 6 0" stroke="#8a4a3c" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  '<path d="M55.5 70.5h5" stroke="#8a4a3c" stroke-width="1.6" stroke-linecap="round"/>',
  '<ellipse cx="58" cy="71" rx="2.6" ry="2" fill="#a2524a"/>',
  '<path d="M54 69.5q4 4.5 8 0Z" fill="#a2524a"/>',
  '<path d="M54.5 70q1.8 1.6 3.5 0 1.7 1.6 3.5 0" stroke="#8a4a3c" stroke-width="1.5" fill="none" stroke-linecap="round"/>',
];
// 袍身：直身、宽身、收腰、长袍
const bodies = [
  "M40 92c4-6 10-9 18-9s14 3 18 9l5 46c-7 4-15 5-23 5s-16-1-23-5Z",
  "M37 93c5-7 12-10 21-10s16 3 21 10l6 45c-8 5-17 6-27 6s-19-1-27-6Z",
  "M41 92c4-6 9-9 17-9s13 3 17 9l2 20-1 3 5 24c-7 4-15 5-23 5s-16-1-23-5l5-24-1-3Z",
  "M40 92c4-6 10-9 18-9s14 3 18 9l7 70c-8 4-16 5-25 5s-17-1-25-5Z",
];
// 手臂：垂手、捧在身前、一手叉腰、挥手
const arms = [
  { l: "M42 96q-8 14-8 28", r: "M74 96q8 14 8 28", lh: [34, 126], rh: [82, 126] },
  { l: "M42 96q-6 16 8 22", r: "M74 96q6 16-8 22", lh: [51, 119], rh: [65, 119] },
  { l: "M42 96q-8 14-8 28", r: "M74 96q12 8 4 20", lh: [34, 126], rh: [77, 117] },
  { l: "M42 96q-8 14-8 28", r: "M74 96q12-6 14-20", lh: [34, 126], rh: [88, 75] },
];

export function appearanceFor(id, role = "") {
  let seed = 2166136261;
  for (const ch of String(id)) { seed ^= ch.codePointAt(0); seed = Math.imul(seed, 16777619) >>> 0; }
  const pick = (shift, count) => Math.floor((seed >>> shift) % count);
  const roleColour = /灶|炊|cook/.test(role) ? "#c97b64" :
    /苇|编|水/.test(role) ? "#8fb07a" : /田|农/.test(role) ? "#e0c48a" :
    /陶|土/.test(role) ? "#b9805f" : null;
  const elder = /elder|长者|老/.test(String(id) + role);
  return {
    id: String(id), head: pick(1, 5), eyes: pick(4, 5), mouth: pick(7, 5),
    hair: elder ? 5 : pick(10, 5), body: pick(13, 4), arms: pick(16, 4),
    skin: skins[pick(19, skins.length)], fabric: roleColour || fabrics[pick(21, fabrics.length)],
    hairColor: hairTones[pick(24, hairTones.length)], pattern: pick(26, 4),
    sash: sashes[pick(28, sashes.length)],
    isCook: /灶|炊|cook/.test(role), elder, seed,
  };
}

/** Mix a hex colour toward white (t>0) or black (t<0). */
function shade(hex, t) {
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255];
  const to = t > 0 ? 255 : 0, k = Math.abs(t);
  return "#" + c.map(v => Math.round(v + (to - v) * k).toString(16).padStart(2, "0")).join("");
}

export function renderFigure(id, role = "") {
  const a = appearanceFor(id, role);
  const [rx, ry] = heads[a.head], arm = arms[a.arms], body = bodies[a.body];
  const bd = ((a.seed >>> 3) % 40) / 10, kd = ((a.seed >>> 9) % 60) / 10, hd = ((a.seed >>> 15) % 50) / 10;
  const long = a.body === 3;
  const S = a.skin, C = a.fabric, H = a.hairColor;
  const Sd = shade(S, -.16), Cd = shade(C, -.34), Hd = shade(H, -.35);
  const sub = (s, hair = H) => s.replaceAll("url(#HID)", hair).replaceAll("SASH", a.sash);
  // 体积：先画一层偏右下的暗色，再盖上本色，边缘留出一圈背光。
  const vol = s => '<g transform="translate(1.6 1.4)">' + sub(s, Hd) + '</g>' + sub(s);
  const legs = long ? "" :
    '<rect x="47" y="136" width="9" height="24" rx="4.5" fill="' + shade(a.fabric, -.45) + '"/><rect x="60" y="136" width="9" height="24" rx="4.5" fill="' + shade(a.fabric, -.38) + '"/>';
  const feet = '<ellipse cx="50" cy="162" rx="8" ry="4.6" fill="#6b4c36"/><ellipse cx="66" cy="162" rx="8" ry="4.6" fill="#5e4230"/>' +
    '<ellipse cx="48" cy="160.5" rx="4" ry="1.6" fill="#fff" opacity=".18"/>';
  const sleeve = d => '<path d="' + d + '" stroke="' + C + '" stroke-width="12" fill="none" stroke-linecap="round"/>';
  const hand = ([x, y]) => '<circle cx="' + (x + 1) + '" cy="' + (y + 1) + '" r="5" fill="' + Sd + '"/><circle cx="' + x + '" cy="' + y + '" r="4.6" fill="' + S + '"/>';
  const apron = a.isCook ? '<path d="M46 112h24l3 26q-15 4-30 0Z" fill="#f3ead8"/><path d="M46 112h24" stroke="#d9cbb0" stroke-width="2"/>' : "";
  const trim = ['', '<path d="M38 136q20 6 40 0" stroke="' + shade(a.fabric, .45) + '" stroke-width="3" fill="none" opacity=".8"/>',
    '<path d="M44 100l14 18 14-18" stroke="' + shade(a.fabric, .5) + '" stroke-width="2.4" fill="none" stroke-linejoin="round" opacity=".8"/>',
    '<path d="M37 128q21 7 42 0" stroke="' + a.sash + '" stroke-width="3" fill="none" stroke-dasharray="4 3" opacity=".7"/>'][a.pattern];
  return '<svg class="painted-person toy-person" viewBox="0 0 116 178" aria-hidden="true" role="presentation"' +
    ' data-head="' + a.head + '" data-eyes="' + a.eyes + '" data-mouth="' + a.mouth + '" data-body="' + a.body + '"' +
    ' style="--skin:' + a.skin + ';--fabric:' + a.fabric + ';--bd:-' + bd + 's;--kd:-' + kd + 's;--hd:-' + hd + 's">' +
    '<ellipse class="fig-shadow" cx="58" cy="166" rx="27" ry="6" fill="#2b2418" opacity=".28"/>' +
    legs + feet +
    '<g class="fig-upper">' +
    sleeve(arm.l) +
    '<path d="' + body + '" fill="' + Cd + '" transform="translate(2 1.5)"/><path d="' + body + '" fill="' + C + '"/>' +
    '<path d="M46 98c-3 12-3 26 0 38" stroke="#fff" stroke-opacity=".22" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    trim + apron +
    '<path d="M50 87l8 13 8-13" fill="' + shade(a.fabric, -.2) + '"/>' +
    '<path d="M40 112q18 5 36 0v6q-18 5-36 0Z" fill="' + a.sash + '"/><path d="M40 112q18 5 36 0" stroke="#fff" stroke-opacity=".25" stroke-width="1.5" fill="none"/>' +
    sleeve(arm.r) + hand(arm.lh) + hand(arm.rh) +
    '<g class="fig-head">' +
    vol(hairs[a.hair].back) +
    '<ellipse cx="' + (58 - rx + 1) + '" cy="62" rx="3.4" ry="5" fill="' + S + '"/><ellipse cx="' + (58 + rx - 1) + '" cy="62" rx="3.4" ry="5" fill="' + Sd + '"/>' +
    '<ellipse cx="59.6" cy="59.4" rx="' + rx + '" ry="' + ry + '" fill="' + Sd + '"/>' +
    '<ellipse cx="58" cy="58" rx="' + (rx - .8) + '" ry="' + (ry - .8) + '" fill="' + S + '"/>' +
    '<ellipse cx="51" cy="52" rx="' + (rx * .55) + '" ry="' + (ry * .5) + '" fill="' + shade(S, .5) + '" opacity=".35"/>' +
    vol(hairs[a.hair].front) +
    '<ellipse cx="42.5" cy="68" rx="5" ry="3" fill="#f08f7f" opacity=".42"/><ellipse cx="73.5" cy="68" rx="5" ry="3" fill="#f08f7f" opacity=".42"/>' +
    '<g class="fig-eyes">' + eyes[a.eyes] + '</g>' +
    mouths[a.mouth] +
    (a.elder ? '<path d="M50 76q8 9 16 0" stroke="#e4dfd6" stroke-width="3" fill="none" stroke-linecap="round"/>' : "") +
    '<ellipse cx="47" cy="44" rx="9" ry="4" fill="#fff" opacity=".16" transform="rotate(-20 47 44)"/>' +
    '</g></g></svg>';
}
