// Everything you hear, made on the spot with Web Audio — no sound files. Music: a plucked string (by day) or a soft
// flute (by night) wandering the season's pentatonic mode. Ambience: wind, rain, the lake, birds by day, crickets at
// night. Effects: short synthesized knocks, splashes, plucks and a gong. The game tells it what's going on (setScene)
// and what just happened (sfx); it starts on the first click, as browsers require.
import { SEASON_MUSIC, degreeToMidi, dropletSamples, dropsPerSecond, makePhrase, midiToFreq, pluckSamples } from "./music-theory.js";

const SETTINGS_KEY = "openlife-audio";
const DEFAULTS = { master: 0.8, music: 0.55, ambience: 0.4, sfx: 0.6, muted: false };
export const settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; } catch { return { ...DEFAULTS }; }
})();

let ctx = null, bus = null, noise = null, amb = null, drone = null, meter = null, drops = [];
const scene = { season: "春", night: 0, rain: 0, snow: 0, lake: 0, indoor: false, title: false };
const plucks = new Map();
const music = { next: 0, phraseEnd: 0 };
const lastSfx = {};

/** Start (or wake) the sound. Call from a click or key press. */
export function startAudio() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const master = ctx.createGain(), comp = ctx.createDynamicsCompressor(), verb = ctx.createConvolver(), verbOut = ctx.createGain();
  comp.threshold.value = -18; comp.ratio.value = 3;
  comp.connect(master).connect(ctx.destination);
  meter = ctx.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
  verb.buffer = impulse(2.6); verbOut.gain.value = 0.32; verb.connect(verbOut).connect(comp);
  bus = { master, verb, music: ctx.createGain(), ambience: ctx.createGain(), sfx: ctx.createGain() };
  for (const k of ["music", "ambience", "sfx"]) bus[k].connect(comp);
  noise = noiseBuffer(3);
  amb = {
    wind: loopNoise("lowpass", 360, 0.8, 0), gust: loopNoise("bandpass", 900, 0.6, 0.7),
    rain: loopNoise("lowpass", 1100, 0.5, 1.3), patter: loopNoise("bandpass", 3200, 0.8, 1.9),
    water: loopNoise("lowpass", 620, 0.7, 2.4),
  };
  drone = droneVoice();
  drops = Array.from({ length: 12 }, () => { const d = dropletSamples(ctx.sampleRate, Math.random), b = ctx.createBuffer(1, d.length, ctx.sampleRate); b.copyToChannel(d, 0); return b; });
  applyVolumes();
  setInterval(tick, 100);
}
export const audioRunning = () => Boolean(ctx && ctx.state === "running");
/** How loud the output is right now (RMS, 0–1): for checks, and anything that wants to pulse with the sound. */
export function audioLevel() {
  if (!meter) return 0;
  const d = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(d);
  return Math.sqrt(d.reduce((n, x) => n + x * x, 0) / d.length);
}

export function setVolume(key, value) {
  settings[key] = value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyVolumes();
}
function applyVolumes() {
  if (!ctx) return;
  const now = ctx.currentTime;
  bus.master.gain.setTargetAtTime(settings.muted ? 0 : settings.master, now, 0.1);
  for (const k of ["music", "ambience", "sfx"]) bus[k].gain.setTargetAtTime(settings[k], now, 0.1);
}

/** What the world is like right now: season, how dark (0–1), rain and snow (0–1), how near the lake (0–1), indoors. */
export function setScene(s) { Object.assign(scene, s); }

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function noiseBuffer(seconds) {
  const b = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  return b;
}
function impulse(seconds) {
  const b = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3; }
  return b;
}
function loopNoise(type, freq, q, offset) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; src.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = 0;
  src.connect(f).connect(g).connect(bus.ambience); src.start(0, offset);
  return { g, f };
}
const env = (g, t, peak, attack, release) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release); };
const pan = (x) => { const p = ctx.createStereoPanner(); p.pan.value = x; return p; };

/** A plucked note: the string worked out once per pitch, then replayed. */
function pluck(midi, t, vel = 0.5, out = bus.music, send = 0.35) {
  let buf = plucks.get(midi);
  if (!buf) {
    const data = pluckSamples(midiToFreq(midi), ctx.sampleRate, 2.6, Math.random, { damping: 0.9965, bright: 0.45 });
    buf = ctx.createBuffer(1, data.length, ctx.sampleRate); buf.copyToChannel(data, 0); plucks.set(midi, buf);
  }
  const src = ctx.createBufferSource(), g = ctx.createGain(), p = pan((Math.random() - 0.5) * 0.5), s = ctx.createGain();
  src.buffer = buf; g.gain.value = vel; s.gain.value = send;
  src.connect(g).connect(p).connect(out); p.connect(s).connect(bus.verb);
  src.start(t);
}
/** A soft flute (the 箫): two oscillators, a slow vibrato, a breath of noise. */
function flute(midi, t, dur, vel = 0.12) {
  const f = midiToFreq(midi), a = ctx.createOscillator(), b = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
  a.type = "sine"; b.type = "triangle"; a.frequency.value = f; b.frequency.value = f; vib.frequency.value = 4.8; vg.gain.value = f * 0.006;
  vib.connect(vg); vg.connect(a.frequency); vg.connect(b.frequency);
  const bg = ctx.createGain(); bg.gain.value = 0.25;
  a.connect(g); b.connect(bg).connect(g);
  const breath = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bgain = ctx.createGain();
  breath.buffer = noise; bf.type = "bandpass"; bf.frequency.value = f * 2; bf.Q.value = 4; bgain.gain.value = 0.15;
  breath.connect(bf).connect(bgain).connect(g);
  const s = ctx.createGain(); s.gain.value = 0.5;
  g.connect(bus.music); g.connect(s).connect(bus.verb);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.18); g.gain.setValueAtTime(vel, t + Math.max(0.2, dur - 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
  for (const o of [a, b, vib]) { o.start(t); o.stop(t + dur + 0.5); }
  breath.start(t, Math.random()); breath.stop(t + dur + 0.5);
}
/** A low hum under the night: the home note and its fifth. */
function droneVoice() {
  const g = ctx.createGain(), a = ctx.createOscillator(), b = ctx.createOscillator(), lp = ctx.createBiquadFilter();
  a.type = "sine"; b.type = "sine"; lp.type = "lowpass"; lp.frequency.value = 400; g.gain.value = 0;
  a.connect(lp); b.connect(lp); lp.connect(g).connect(bus.music); a.start(); b.start();
  return { g, a, b };
}

// ---------------------------------------------------------------------------
// Every tenth of a second: the ambience follows the scene, critters call, the music finds its next phrase
// ---------------------------------------------------------------------------
function tick() {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime, inside = scene.indoor ? 0.3 : 1, winter = scene.season === "冬";
  const set = (node, v, tc = 1.2) => node.g.gain.setTargetAtTime(v, now, tc);
  const gust = 0.5 + 0.5 * Math.sin(now * 0.23) * Math.sin(now * 0.071 + 1);
  set(amb.wind, (0.03 + 0.1 * (winter ? 1 : 0.3) + 0.2 * scene.snow + 0.08 * scene.rain) * (0.5 + 0.5 * gust) * inside);   // a breath of wind, not a hiss
  set(amb.gust, (0.015 + 0.05 * scene.snow) * gust * inside);
  set(amb.rain, 0.16 * scene.rain * (scene.indoor ? 0.6 : 1));            // the far-off wash of it
  set(amb.patter, 0.025 * scene.rain * (scene.indoor ? 0.4 : 1));
  set(amb.water, 0.12 * scene.lake * (0.6 + 0.4 * Math.sin(now * 0.4)) * inside);
  amb.rain.f.frequency.setTargetAtTime(scene.indoor ? 600 : 1100, now, 0.5);
  // and the drops themselves, one by one, at random: this is what makes it 淅淅沥沥 rather than a hiss
  const rate = dropsPerSecond(scene.rain) * 0.1;
  for (let k = Math.floor(rate + Math.random()); k > 0; k--) raindrop(now + Math.random() * 0.1);
  // creatures
  const day = scene.night < 0.3, deepNight = scene.night > 0.6;
  if (day && !winter && scene.rain < 0.3 && !scene.indoor && Math.random() < 0.012) bird(now);
  if (deepNight && (scene.season === "夏" || scene.season === "秋") && scene.rain < 0.5 && Math.random() < 0.06) cricket(now);
  if (deepNight && scene.season === "春" && scene.lake > 0.3 && Math.random() < 0.03) frog(now);
  // the night hum
  const m = SEASON_MUSIC[scene.season] ?? SEASON_MUSIC.春;
  drone.a.frequency.setTargetAtTime(midiToFreq(m.tonic - 24), now, 2); drone.b.frequency.setTargetAtTime(midiToFreq(m.tonic - 17), now, 2);
  drone.g.gain.setTargetAtTime(scene.night > 0.5 || scene.title ? 0.035 : 0, now, 3);
  // music
  if (now + 0.4 >= music.phraseEnd) schedulePhrase(Math.max(now + 0.1, music.phraseEnd));
}
function schedulePhrase(t0) {
  const m = SEASON_MUSIC[scene.season] ?? SEASON_MUSIC.春, night = scene.night > 0.55;
  const tempo = m.tempo * (night ? 0.7 : 1) * (scene.title ? 0.8 : 1), beat = 60 / tempo;
  if (Math.random() < (night ? 0.45 : 0.3)) { music.phraseEnd = t0 + beat * (4 + Math.floor(Math.random() * 5)); return; }   // a rest between phrases
  const notes = makePhrase(Math.random, { beats: 8, density: m.density * (night ? 0.7 : 1), start: 5 });
  for (const n of notes) {
    const midi = degreeToMidi(m.mode, m.tonic, n.degree), t = t0 + n.beat * beat;
    if (night) flute(midi + 12, t, n.dur * beat, 0.12);
    else {
      pluck(midi, t, 0.6);
      if (n.dur >= 2 && Math.random() < 0.6) pluck(degreeToMidi(m.mode, m.tonic, n.degree - 5), t + 0.02, 0.3);   // the octave below, under a held note
    }
  }
  music.phraseEnd = t0 + 8 * beat + beat * (night ? 2 : 1);
}
/** One drop: outdoors a bright tick (now and then a little "plink" on water); indoors a dull tap on the thatch. */
function raindrop(t) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = pan(Math.random() * 1.8 - 0.9);
  src.buffer = drops[Math.floor(Math.random() * drops.length)];
  f.type = "bandpass"; f.Q.value = 1.5 + Math.random() * 4;
  f.frequency.value = scene.indoor ? 500 + Math.random() * 900 : 1800 + Math.random() * 5200;
  g.gain.value = (scene.indoor ? 0.5 : 0.18 + Math.random() * 0.35) * (0.4 + scene.rain * 0.6);
  src.connect(f).connect(g).connect(p).connect(bus.ambience);
  src.start(t);
  if (!scene.indoor && scene.lake > 0.2 && Math.random() < 0.08) {           // a drop on the lake: a tiny falling ping
    const o = ctx.createOscillator(), og = ctx.createGain(), base = 1400 + Math.random() * 1800;
    o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.04);
    o.connect(og).connect(p); env(og, t, 0.035 * scene.lake, 0.002, 0.05); o.start(t); o.stop(t + 0.07);
  }
}
function bird(t) {
  const o = ctx.createOscillator(), g = ctx.createGain(), p = pan(Math.random() * 1.6 - 0.8), base = 2200 + Math.random() * 1600, n = 1 + Math.floor(Math.random() * 3);
  o.type = "sine"; o.connect(g).connect(p).connect(bus.ambience);
  g.gain.value = 0.0001;
  for (let i = 0; i < n; i++) {
    const s = t + i * 0.14;
    o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.07);
    g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.05, s + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.1);
  }
  o.start(t); o.stop(t + n * 0.14 + 0.1);
}
function cricket(t) {
  const o = ctx.createOscillator(), am = ctx.createOscillator(), amg = ctx.createGain(), trill = ctx.createGain(), g = ctx.createGain(), p = pan(Math.random() * 1.6 - 0.8);
  o.frequency.value = 4300 + Math.random() * 500; am.frequency.value = 28; amg.gain.value = 0.5; trill.gain.value = 0.5;   // 0–1, pulsing
  am.connect(amg).connect(trill.gain); o.connect(trill).connect(g).connect(p).connect(bus.ambience);
  env(g, t, 0.018, 0.02, 0.25);
  o.start(t); am.start(t); o.stop(t + 0.3); am.stop(t + 0.3);
}
function frog(t) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter(), p = pan(Math.random() - 0.5);
  o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.18); lp.type = "lowpass"; lp.frequency.value = 700;
  o.connect(lp).connect(g).connect(p).connect(bus.ambience); env(g, t, 0.03, 0.02, 0.18);
  o.start(t); o.stop(t + 0.25);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
function tone(freq, t, peak, attack, release, type = "sine", glideTo = null) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + release);
  o.connect(g).connect(bus.sfx); env(g, t, peak, attack, release); o.start(t); o.stop(t + attack + release + 0.05);
}
function hiss(t, type, freq, q, peak, attack, release, sweepTo = null) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + release);
  src.connect(f).connect(g).connect(bus.sfx); env(g, t, peak, attack, release); src.start(t, Math.random() * 2); src.stop(t + attack + release + 0.05);
}
function gong(t, base = 98, peak = 0.22) {
  const s = ctx.createGain(); s.gain.value = 0.6; s.connect(bus.verb);
  for (const [r, a] of [[1, 1], [2.02, 0.5], [2.74, 0.35], [3.93, 0.2], [5.4, 0.12]]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(base * r * 1.01, t); o.frequency.exponentialRampToValueAtTime(base * r, t + 0.6);
    o.connect(g); g.connect(bus.sfx); g.connect(s); env(g, t, peak * a, 0.01, 3.2 / Math.sqrt(r)); o.start(t); o.stop(t + 3.5);
  }
}
const SFX = {
  pick: (t) => { tone(1200, t, 0.05, 0.004, 0.06, "triangle"); hiss(t, "highpass", 3000, 0.7, 0.03, 0.002, 0.04); },
  drop: (t) => { tone(160, t, 0.16, 0.005, 0.16, "sine", 90); hiss(t, "lowpass", 900, 0.7, 0.05, 0.003, 0.08); },
  chop: (t) => { hiss(t, "bandpass", 1600, 1.2, 0.22, 0.002, 0.07); tone(120, t, 0.18, 0.003, 0.14, "triangle", 80); },
  dig: (t) => { hiss(t, "lowpass", 700, 0.8, 0.2, 0.01, 0.16); hiss(t + 0.12, "lowpass", 500, 0.8, 0.12, 0.01, 0.12); },
  splash: (t) => { hiss(t, "bandpass", 700, 0.9, 0.18, 0.01, 0.35, 2600); hiss(t + 0.05, "highpass", 3500, 0.5, 0.05, 0.02, 0.25); },
  gain: (t) => { const m = SEASON_MUSIC[scene.season] ?? SEASON_MUSIC.春; [5, 7, 10].forEach((d, i) => pluck(degreeToMidi(m.mode, m.tonic, d), t + i * 0.09, 0.32, bus.sfx, 0.3)); },
  eat: (t) => { tone(500, t, 0.05, 0.005, 0.05, "triangle"); tone(420, t + 0.12, 0.05, 0.005, 0.05, "triangle"); },
  build: (t) => { gong(t, 131, 0.16); const m = SEASON_MUSIC[scene.season] ?? SEASON_MUSIC.春; [0, 2, 4, 5].forEach((d, i) => pluck(degreeToMidi(m.mode, m.tonic, d), t + 0.15 + i * 0.12, 0.3, bus.sfx, 0.4)); },
  banner: (t) => gong(t, 98, 0.18),
  toast: (t) => pluck(84, t, 0.12, bus.sfx, 0.2),
  blocked: (t) => { tone(110, t, 0.1, 0.005, 0.12, "square", 90); },
  omen: (t) => { tone(65, t, 0.22, 0.02, 0.6, "sine", 55); tone(65, t + 0.45, 0.16, 0.02, 0.5, "sine", 55); },
  drum: (t) => { for (const [dt, v] of [[0, 0.3], [0.32, 0.18], [0.48, 0.22], [0.8, 0.3]]) { tone(80, t + dt, v, 0.004, 0.22, "sine", 50); hiss(t + dt, "lowpass", 300, 0.7, v * 0.4, 0.003, 0.1); } },
};
/** Play an effect by name; the same one at most once every 70 ms. */
export function sfx(name) {
  if (!ctx || ctx.state !== "running" || !SFX[name]) return;
  const now = ctx.currentTime;
  if (now - (lastSfx[name] ?? -1) < 0.07) return;
  lastSfx[name] = now;
  SFX[name](now + 0.005);
}
