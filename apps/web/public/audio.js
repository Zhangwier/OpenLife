// OpenLife 声音：全部由 Web Audio 实时合成，没有音频文件。
// 模式：music（舒缓音乐 + 当地环境声）、noise（柔和白噪音 + 很轻的环境声）、off。
// 浏览器要求先有用户手势才能出声，所以只有玩家点了声音按钮才会创建 AudioContext。
const KEY = "openlife-audio";
const SEASON_SCALE = {          // 五声音阶，按季节换调式（MIDI 音高）
  春: [62, 64, 66, 69, 71],     // D 宫
  夏: [60, 62, 64, 67, 69],     // C 宫
  秋: [57, 60, 62, 64, 67],     // A 羽
  冬: [52, 55, 57, 59, 62],     // E 羽
};
const PLACE_AMBIENCE = {
  "place:river": "water", "place:ford": "water", "place:reedbed": "reeds",
  "place:hearth-yard": "fire", "place:kiln": "fire", "place:field": "wind",
  "place:claypits": "wind", "place:yard": "yard",
  "place:longhouse": "fire", "place:weaving-shed": "yard", "place:shrine": "water", "place:market": "yard",
  "place:chestnut-wood": "wind", "place:stone-beach": "water",
};
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

let settings = load();
let ctx = null, master = null, musicBus = null, ambBus = null, noiseBus = null, reverb = null;
let scene = { placeId: "place:yard", season: "春", daypart: "day" };
let ambGen = 0, musicGen = 0;
let timers = [], ambNodes = [], noiseNodes = [], padVoices = [];
const listeners = new Set();

function load() {
  try { return { mode: "music", volume: 0.6, ...JSON.parse(localStorage.getItem(KEY) || "{}"), on: false }; }
  catch { return { mode: "music", volume: 0.6, on: false }; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ mode: settings.mode, volume: settings.volume })); } catch { /* ignore */ }
  listeners.forEach(fn => fn(audioState()));
}
export function audioState() { return { ...settings, playing: Boolean(ctx && settings.on && settings.mode !== "off") }; }
export function onAudioChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const bufCache = new Map();
function noiseBuffer(kind = "pink", seconds = 4) {
  const key = kind + seconds;
  if (!bufCache.has(key)) bufCache.set(key, makeNoise(kind, seconds));
  return bufCache.get(key);
}
function makeNoise(kind, seconds) {
  const len = Math.ceil(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (kind === "white") d[i] = w * 0.5;
      else {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
  }
  return buf;
}
function impulse(seconds = 3.2, decay = 2.6) {
  const len = Math.ceil(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
function loopNoise(kind, dest) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(kind); src.loop = true;
  src.connect(dest); src.start(); return src;
}
function lfo(rate, depth, target, offset = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target);
  if (offset) target.value = offset; o.start(); return o;
}
function later(fn, ms) { const t = setTimeout(() => { timers = timers.filter(x => x !== t); fn(); }, ms); timers.push(t); }

function ensureContext() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
  master.connect(comp); comp.connect(ctx.destination);
  reverb = ctx.createConvolver(); reverb.buffer = impulse();
  const wet = ctx.createGain(); wet.gain.value = 0.45; reverb.connect(wet); wet.connect(master);
  musicBus = ctx.createGain(); musicBus.connect(master); musicBus.connect(reverb);
  ambBus = ctx.createGain(); ambBus.connect(master);
  noiseBus = ctx.createGain(); noiseBus.connect(master);
}

/* ---------- 舒缓音乐：长音铺底 + 稀疏的笛声 ---------- */
function startMusic() {
  stopMusic(); const gen = musicGen;
  const wantMusic = () => ctx && settings.on && settings.mode === "music" && gen === musicGen;
  const playChord = () => {
    if (!wantMusic()) return;
    const scale = SEASON_SCALE[scene.season] || SEASON_SCALE.春;
    const night = scene.daypart === "night" || scene.daypart === "dusk";
    const root = scale[Math.floor(Math.random() * 3)] - 12;
    const notes = [root - 12, root, root + 7, scale[(Math.floor(Math.random() * 5))]];
    const now = ctx.currentTime, dur = 11;
    notes.forEach((m, i) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = "sine"; o2.type = "triangle"; o.frequency.value = hz(m); o2.frequency.value = hz(m) * 1.003;
      f.type = "lowpass"; f.frequency.value = night ? 700 : 1100;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime((i === 0 ? 0.05 : 0.032), now + 3.5);
      g.gain.setValueAtTime((i === 0 ? 0.05 : 0.032), now + dur - 3);
      g.gain.linearRampToValueAtTime(0, now + dur + 1.5);
      o.connect(f); o2.connect(f); f.connect(g); g.connect(musicBus);
      o.start(now); o2.start(now); o.stop(now + dur + 2); o2.stop(now + dur + 2);
      padVoices.push(o, o2);
    });
    later(playChord, (dur - 2.5) * 1000);
  };
  const playNote = () => {
    if (!wantMusic()) return;
    const scale = SEASON_SCALE[scene.season] || SEASON_SCALE.春;
    const k = Math.floor(Math.random() * scale.length), up = Math.random() < 0.3 ? 12 : 0;
    flute(hz(scale[k] + up), 1.6 + Math.random() * 1.8, scene.daypart === "night" ? 0.035 : 0.05);
    // 偶尔接一个相邻音，像随口吹出的短句
    if (Math.random() < 0.45) later(() => wantMusic() && flute(hz(scale[(k + (Math.random() < .5 ? 1 : 4)) % 5] + up), 1.4, 0.035), 700 + Math.random() * 500);
    const sparse = scene.daypart === "night" ? 1.6 : 1;
    later(playNote, (2600 + Math.random() * 4200) * sparse);
  };
  playChord(); later(playNote, 2500);
}
function flute(freq, dur, peak) {
  const now = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
  o.type = "sine"; o.frequency.value = freq;
  vib.frequency.value = 5; vg.gain.value = freq * 0.004; vib.connect(vg); vg.connect(o.frequency);
  g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(peak, now + 0.18);
  g.gain.exponentialRampToValueAtTime(peak * 0.6, now + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  // 气声
  const br = ctx.createBufferSource(); br.buffer = noiseBuffer("white", 1); br.loop = true;
  const bf = ctx.createBiquadFilter(); bf.type = "bandpass"; bf.frequency.value = freq * 2; bf.Q.value = 6;
  const bg = ctx.createGain(); bg.gain.setValueAtTime(0, now); bg.gain.linearRampToValueAtTime(peak * 0.25, now + 0.08);
  bg.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.7);
  o.connect(g); br.connect(bf); bf.connect(bg); bg.connect(musicBus); g.connect(musicBus);
  o.start(now); vib.start(now); br.start(now); o.stop(now + dur + .1); vib.stop(now + dur + .1); br.stop(now + dur);
}
function stopMusic() { musicGen++; padVoices.forEach(v => { try { v.stop(); } catch { /* done */ } }); padVoices = []; }

/* ---------- 环境声：随地点和昼夜变化 ---------- */
function startAmbience() {
  stopAmbience(); const gen = ambGen;
  const alive = () => ctx && settings.on && settings.mode !== "off" && gen === ambGen;
  const kind = PLACE_AMBIENCE[scene.placeId] || "yard";
  const night = scene.daypart === "night";
  const bed = ctx.createBiquadFilter(), g = ctx.createGain();
  g.gain.value = 0; g.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
  bed.connect(g); g.connect(ambBus); ambNodes.push(g);
  if (kind === "water" || kind === "reeds") {
    bed.type = "bandpass"; bed.Q.value = 0.7;
    ambNodes.push(lfo(0.13, 260, bed.frequency, kind === "water" ? 900 : 1500));
    const n = loopNoise("pink", bed); ambNodes.push(n);
    const lv = ctx.createGain(); lv.gain.value = kind === "water" ? 0.5 : 0.22; bed.disconnect(); bed.connect(lv); lv.connect(g);
    ambNodes.push(lfo(0.07, 0.12, lv.gain, lv.gain.value));
  } else if (kind === "fire") {
    bed.type = "lowpass"; bed.frequency.value = 260; const n = loopNoise("brown", bed); ambNodes.push(n);
    const lv = ctx.createGain(); lv.gain.value = 0.35; bed.disconnect(); bed.connect(lv); lv.connect(g);
    const crackle = () => {
      if (!alive()) return;
      const now = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), cg = ctx.createGain();
      s.buffer = noiseBuffer("white", 0.05); f.type = "highpass"; f.frequency.value = 1800 + Math.random() * 2500;
      cg.gain.setValueAtTime(0.05 + Math.random() * 0.1, now); cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.04 + Math.random() * 0.05);
      s.connect(f); f.connect(cg); cg.connect(g); s.start(now);
      later(crackle, 60 + Math.random() * (Math.random() < 0.2 ? 900 : 260));
    };
    crackle();
  } else {
    bed.type = "lowpass"; ambNodes.push(lfo(0.05, 220, bed.frequency, kind === "yard" ? 380 : 520));
    const n = loopNoise("pink", bed); ambNodes.push(n);
    const lv = ctx.createGain(); lv.gain.value = kind === "yard" ? 0.18 : 0.3; bed.disconnect(); bed.connect(lv); lv.connect(g);
    ambNodes.push(lfo(0.09, 0.12, lv.gain, lv.gain.value));
  }
  // 雨声：高通的粉噪音作雨幕，再随机落下清脆的水滴；雪天只有很轻的风声。
  if (scene.sky === "雨") {
    const rf = ctx.createBiquadFilter(), rg = ctx.createGain();
    rf.type = "highpass"; rf.frequency.value = 900; rg.gain.value = 0.55;
    const rn = loopNoise("pink", rf); rf.connect(rg); rg.connect(g); ambNodes.push(rn, rg);
    ambNodes.push(lfo(0.08, 0.12, rg.gain, 0.55));
    const drip = () => {
      if (!alive()) return;
      const now = ctx.currentTime, o = ctx.createOscillator(), dg = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(1400 + Math.random() * 1600, now);
      o.frequency.exponentialRampToValueAtTime(500 + Math.random() * 300, now + 0.05);
      dg.gain.setValueAtTime(0.03 + Math.random() * 0.03, now); dg.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      o.connect(dg); dg.connect(g); o.start(now); o.stop(now + 0.08);
      later(drip, 40 + Math.random() * 220);
    };
    drip();
  } else if (scene.sky === "雪") {
    const wf = ctx.createBiquadFilter(), wg = ctx.createGain();
    wf.type = "bandpass"; wf.Q.value = 0.5; wg.gain.value = 0.25;
    const wn = loopNoise("pink", wf); wf.connect(wg); wg.connect(g); ambNodes.push(wn, wg);
    ambNodes.push(lfo(0.05, 300, wf.frequency, 500), lfo(0.03, 0.15, wg.gain, 0.25));
  }
  // 白天鸟鸣，夜里虫鸣（下雨下雪时鸟不叫）
  const critter = () => {
    if (!alive()) return;
    if (!night && (scene.sky === "雨" || scene.sky === "雪")) { later(critter, 4000); return; }
    if (night) cricket(g); else if (kind !== "fire") bird(g);
    later(critter, night ? 900 + Math.random() * 1800 : 3500 + Math.random() * 7000);
  };
  later(critter, 1500);
}
function bird(dest) {
  const now = ctx.currentTime, base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const t = now + i * (0.11 + Math.random() * 0.05), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * .3), t + 0.07);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(dest); g.connect(reverb); o.start(t); o.stop(t + 0.1);
  }
}
function cricket(dest) {
  const now = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const t = now + i * 0.06, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = 4300 + Math.random() * 200;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.05);
  }
}
function stopAmbience() {
  ambGen++;
  ambNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch { /* done */ } }); ambNodes = [];
}

/* ---------- 白噪音：柔和的粉红噪声，像远处的雨 ---------- */
function startNoise() {
  stopNoise();
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400;
  const g = ctx.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 2);
  const n1 = loopNoise("pink", f), n2 = loopNoise("brown", f);
  f.connect(g); g.connect(noiseBus);
  noiseNodes.push(n1, n2, lfo(0.04, 0.06, g.gain, 0.55), g);
}
function stopNoise() { noiseNodes.forEach(n => { try { n.stop ? n.stop() : n.disconnect(); } catch { /* done */ } }); noiseNodes = []; }

function clearTimers() { timers.forEach(clearTimeout); timers = []; }
function applyMode() {
  if (!ctx) return;
  clearTimers(); stopMusic(); stopAmbience(); stopNoise();
  const target = settings.on && settings.mode !== "off" ? settings.volume * 0.9 : 0;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.4);
  if (!target) return;
  if (settings.mode === "music") { ambBus.gain.value = 0.7; startAmbience(); startMusic(); }
  else if (settings.mode === "noise") { ambBus.gain.value = 0.25; startNoise(); startAmbience(); }
}

/** 玩家手势里调用：开或关 */
export async function toggleSound() {
  ensureContext(); if (!ctx) return audioState();
  if (ctx.state === "suspended") await ctx.resume();
  settings.on = !settings.on || settings.mode === "off";
  if (settings.mode === "off") settings.mode = "music";
  applyMode(); save(); return audioState();
}
export async function setSoundMode(mode) {
  settings.mode = mode; ensureContext();
  if (ctx?.state === "suspended") await ctx.resume();
  settings.on = mode !== "off"; applyMode(); save();
}
export function setVolume(v) {
  settings.volume = Math.max(0, Math.min(1, Number(v)));
  if (ctx && settings.on && settings.mode !== "off") master.gain.setTargetAtTime(settings.volume * 0.9, ctx.currentTime, 0.15);
  save();
}
/** 场景变化（地点 / 季节 / 时段）时调用，变化了才重排环境声 */
export function setAudioScene(next) {
  const changed = next.placeId !== scene.placeId || next.season !== scene.season || next.daypart !== scene.daypart || next.sky !== scene.sky;
  scene = { ...scene, ...next };
  if (changed && ctx && settings.on && settings.mode !== "off") {
    stopAmbience(); if (settings.mode === "music" || settings.mode === "noise") startAmbience();
  }
}
document.addEventListener("visibilitychange", () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (settings.on) ctx.resume();
});
