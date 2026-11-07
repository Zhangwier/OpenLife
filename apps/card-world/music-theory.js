// The sound of the valley, as numbers: pentatonic modes, a phrase-maker that wanders the scale and comes home,
// and a plucked string worked out sample by sample (Karplus–Strong). Pure; audio.js plays it.

/** The five pentatonic modes, as semitones above their tonic. */
export const MODES = {
  宫: [0, 2, 4, 7, 9],
  商: [0, 2, 5, 7, 10],
  角: [0, 3, 5, 8, 10],
  徵: [0, 2, 5, 7, 9],
  羽: [0, 3, 5, 7, 10],
};

/** Each season its own mode, home note (MIDI), pace (beats a minute) and how busy the line is. */
export const SEASON_MUSIC = {
  春: { mode: "宫", tonic: 62, tempo: 84, density: 0.72 },
  夏: { mode: "徵", tonic: 65, tempo: 92, density: 0.78 },
  秋: { mode: "羽", tonic: 57, tempo: 72, density: 0.62 },
  冬: { mode: "商", tonic: 52, tempo: 60, density: 0.45 },
};

export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);

/** Scale degree (0, 1, 2 … across octaves) to MIDI note. */
export function degreeToMidi(mode, tonic, degree) {
  const steps = MODES[mode], o = Math.floor(degree / steps.length), i = ((degree % steps.length) + steps.length) % steps.length;
  return tonic + o * 12 + steps[i];
}

/** A phrase of `beats` beats: notes { beat, dur, degree }. It walks by small steps, rests now and then, and ends
 *  on a home note (degree 0 or 5) held a little longer. */
export function makePhrase(random, { beats = 8, density = 0.7, low = 0, high = 9, start = 5 } = {}) {
  const notes = [];
  let beat = 0, degree = start;
  while (beat < beats - 2) {
    const dur = random() < 0.25 ? 0.5 : random() < 0.8 ? 1 : 2;
    if (random() < density) {
      const step = [-2, -1, -1, 1, 1, 2][Math.floor(random() * 6)];
      degree = Math.max(low, Math.min(high, degree + step));
      notes.push({ beat, dur, degree });
    }
    beat += dur;
  }
  const home = Math.abs(degree - 5) < Math.abs(degree) ? 5 : 0;
  notes.push({ beat: Math.max(beat, beats - 2), dur: 2, degree: home });
  return notes;
}

/** A plucked string, sample by sample: a burst of noise run round a loop one period long, losing a little each pass. */
export function pluckSamples(freq, sampleRate, seconds, random, { damping = 0.996, bright = 0.5 } = {}) {
  const n = Math.max(2, Math.round(sampleRate / freq)), loop = new Float32Array(n), out = new Float32Array(Math.round(sampleRate * seconds));
  let prev = 0;
  for (let i = 0; i < n; i++) { const w = random() * 2 - 1; prev = prev + (w - prev) * bright; loop[i] = prev; }   // softer noise: a softer pluck
  for (let i = 0, j = 0; i < out.length; i++, j = (j + 1) % n) {
    const k = (j + 1) % n;
    out[i] = loop[j];
    loop[j] = (loop[j] + loop[k]) * 0.5 * damping;
  }
  const fade = Math.min(out.length, Math.round(sampleRate * 0.05));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;                // no click at the end
  return out;
}

/** One raindrop: a tick of noise that dies in a few milliseconds — the grain that makes rain sound like rain. */
export function dropletSamples(sampleRate, random, ms = 30) {
  const out = new Float32Array(Math.round((sampleRate * ms) / 1000)), k = 1 / (sampleRate * 0.004);   // dies away in ~4 ms
  let prev = 0;
  for (let i = 0; i < out.length; i++) { const w = random() * 2 - 1; prev += (w - prev) * 0.6; out[i] = prev * Math.exp(-i * k); }
  return out;
}

/** How many drops land in a slice of time: rain 0–1 → drops per second, a few at a drizzle, a crowd in a downpour. */
export const dropsPerSecond = (rain) => (rain <= 0 ? 0 : 6 + 90 * rain * rain);
