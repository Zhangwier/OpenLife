import assert from "node:assert/strict";
import test from "node:test";
import { MODES, SEASON_MUSIC, degreeToMidi, makePhrase, midiToFreq, pluckSamples } from "../apps/card-world/music-theory.js";

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("every season plays in a pentatonic mode, and degrees climb the scale an octave every five", () => {
  for (const m of Object.values(SEASON_MUSIC)) assert.equal(MODES[m.mode].length, 5);
  assert.equal(degreeToMidi("宫", 62, 0), 62);
  assert.equal(degreeToMidi("宫", 62, 5), 74);
  assert.equal(degreeToMidi("羽", 57, 1), 60);
  assert.equal(Math.round(midiToFreq(69)), 440);
});

test("a phrase stays in range, keeps time, and comes home at the end", () => {
  for (let s = 1; s < 40; s++) {
    const notes = makePhrase(rng(s), { beats: 8, density: 0.7 });
    assert.ok(notes.every((n) => n.degree >= 0 && n.degree <= 9));
    assert.ok(notes.every((n, i) => i === 0 || n.beat >= notes[i - 1].beat));
    assert.ok([0, 5].includes(notes.at(-1).degree));
    assert.ok(notes.at(-1).beat + notes.at(-1).dur <= 10);
  }
});

test("a plucked string rings and then dies away, without a click at the end", () => {
  const d = pluckSamples(220, 44100, 2, rng(7));
  const rms = (a, b) => Math.sqrt(d.slice(a, b).reduce((n, x) => n + x * x, 0) / (b - a));
  assert.ok(rms(0, 4410) > 0.05);
  assert.ok(rms(0, 4410) > rms(70000, 80000) * 3);
  assert.equal(d.at(-1), 0);
});

test("rain is drops: each one a tick that dies in milliseconds, more of them the harder it rains", async () => {
  const { dropletSamples, dropsPerSecond } = await import("../apps/card-world/music-theory.js");
  const d = dropletSamples(44100, rng(3));
  const peak = (a, b) => Math.max(...Array.from(d.slice(a, b), Math.abs));
  assert.ok(peak(0, 100) > 0.05);
  assert.ok(peak(0, 100) > peak(1000, d.length) * 20);
  assert.equal(dropsPerSecond(0), 0);
  assert.ok(dropsPerSecond(0.3) < 20 && dropsPerSecond(1) > 80);
});
