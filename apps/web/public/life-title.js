/**
 * Title screen backdrop: the game's own pixel world, alive behind the menu.
 *
 * A fixed courtyard (art/map/title-scene.json, laid out by the same rules as
 * every playable scene) drawn by the life-map renderer, with a slow camera
 * drift and a few villagers going about their way. Pure decoration: it reads
 * no save and dispatches nothing. Off when the player turned the map off.
 */
import { MapRenderer, loadArt } from "/life-map-render.js";
import { CELL } from "/life-map-art.js";
import { mapEnabled } from "/life-map.js";
import { playMode } from "/play-mode.js";

const SEASONS = ["冬", "冬", "春", "春", "春", "夏", "夏", "夏", "秋", "秋", "秋", "冬"];
// Strollers: a loop of cells along the paths, a look, and a pace (cells/s).
const WALKERS = [
  { look: "adult:f:title-a", loop: [[5, 13], [30, 13]], pace: 1.4 },
  { look: "elder:m:title-b", loop: [[8, 12], [8, 9], [8, 12], [17, 12]], pace: 0.9 },
  { look: "child:m:title-c", loop: [[20, 15], [12, 15], [12, 17], [24, 17]], pace: 2.0 },
  { look: "youth:f:title-d", loop: [[26, 9], [26, 12], [31, 12], [31, 9]], pace: 1.2 },
];

async function start() {
  // The story mode keeps the parchment title but draws no picture behind it.
  if (playMode() === "story") { document.documentElement.classList.add("game-skin"); document.body.classList.add("lm-title", "lm-title-plain"); return; }
  if (!mapEnabled()) return;
  document.documentElement.classList.add("game-skin");
  document.body.classList.add("lm-title");
  const host = document.querySelector(".home-landscape");
  if (!host) return;
  const canvas = document.createElement("canvas");
  canvas.className = "title-canvas";
  host.prepend(canvas);
  const [art, layout] = await Promise.all([loadArt(), fetch("/art/map/title-scene.json").then((r) => r.json())]);
  const renderer = new MapRenderer(canvas);
  const season = SEASONS[new Date().getMonth()];
  renderer.setScene(layout, art, { season, snow: season === "冬", rain: false, tint: [255, 214, 150, 0.06] });
  const walkers = WALKERS.map((w, i) => ({ ...w, key: `title:${i}`, seg: 0, x: w.loop[0][0], y: w.loop[0][1], dist: 0, facing: "down" }));
  let last = performance.now();
  const frame = (now) => {
    const home = document.body.dataset.screen === "home" && !document.hidden;
    if (home) {
      const dt = Math.min(0.1, (now - last) / 1000);
      for (const w of walkers) {
        const [tx, ty] = w.loop[(w.seg + 1) % w.loop.length];
        const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy), step = w.pace * dt;
        if (d <= step) { w.x = tx; w.y = ty; w.seg = (w.seg + 1) % w.loop.length; }
        else { w.x += (dx / d) * step; w.y += (dy / d) * step; }
        w.dist += step;
        w.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      }
      const rect = canvas.getBoundingClientRect(), dpr = Math.max(1, devicePixelRatio || 1);
      const bw = Math.max(1, Math.round(rect.width * dpr)), bh = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
      const mw = layout.width * CELL, mh = layout.height * CELL;
      const k = Math.max(1, Math.ceil(Math.max(bw / mw, bh / mh)));
      const w = Math.ceil(bw / k), h = Math.ceil(bh / k);
      const drift = (Math.sin(now / 14000) + 1) / 2;
      const cam = { x: Math.round(Math.max(0, mw - w) * drift), y: Math.round(Math.max(0, mh - h) * 0.55), w, h, k };
      const actors = walkers.map((w) => ({ key: w.key, id: w.key, type: "person", look: w.look, fx: w.x * CELL + 8, fy: w.y * CELL + 15, facing: w.facing, walking: true, dist: w.dist * CELL }));
      actors.push({ key: "title:dog", type: "animal", look: "狗", fx: (10 + Math.sin(now / 2600) * 3) * CELL, fy: 16 * CELL + 15 });
      renderer.draw(cam, actors, now, null);
    }
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
