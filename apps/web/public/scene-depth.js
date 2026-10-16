// 2.5D 场景：把人物和物件"站"在插画的地面上。
// 锚点用插画自身坐标（0–1，图宽高 ART_W×ART_H），按 object-fit: cover 换算到场景盒子里，
// 所以手机竖屏裁掉两边时，人物仍落在同一块地上。越靠画面上方（越远）越小、越靠后。纯展示。
export const ART_W = 1376, ART_H = 768;

// 每个地点的可站立地面：avatar 玩家脚下；actors 村民脚下；objects 物件底部；yields 资源（水面、田里、坑里）。
export const GROUND = {
  "place:yard":       { avatar: [.36, .82], actors: [[.55, .62], [.68, .72], [.46, .74], [.30, .64]], objects: [[.43, .66], [.58, .84], [.25, .76]], yields: [[.52, .56]], horizon: .45 },
  "place:hearth-yard":{ avatar: [.33, .82], actors: [[.63, .72], [.40, .64], [.72, .86], [.53, .84]], objects: [[.45, .78], [.31, .70], [.61, .58]], yields: [[.66, .62]], horizon: .45 },
  "place:river":      { avatar: [.30, .82], actors: [[.58, .66], [.73, .74], [.45, .86], [.84, .64]], objects: [[.47, .72], [.63, .86], [.24, .68]], yields: [[.42, .55]], horizon: .5 },
  "place:field":      { avatar: [.30, .86], actors: [[.58, .76], [.72, .82], [.46, .90], [.78, .70]], objects: [[.50, .80], [.64, .92], [.37, .74]], yields: [[.40, .52]], horizon: .5 },
  "place:kiln":       { avatar: [.30, .84], actors: [[.58, .70], [.72, .78], [.45, .88], [.68, .62]], objects: [[.48, .74], [.62, .86], [.35, .68]], yields: [[.55, .62]], horizon: .5 },
  "place:claypits":   { avatar: [.30, .86], actors: [[.57, .74], [.71, .82], [.45, .90], [.80, .68]], objects: [[.48, .80], [.62, .90], [.36, .72]], yields: [[.40, .54]], horizon: .5 },
  "place:reedbed":    { avatar: [.30, .84], actors: [[.56, .70], [.70, .78], [.44, .88], [.80, .66]], objects: [[.48, .76], [.62, .86], [.36, .68]], yields: [[.24, .56], [.72, .62]], horizon: .5 },
  "place:ford":       { avatar: [.33, .86], actors: [[.58, .72], [.72, .80], [.47, .90], [.82, .70]], objects: [[.50, .78], [.64, .88], [.40, .70]], yields: [[.63, .52]], horizon: .5 },
};
const FALLBACK = GROUND["place:yard"];

/** Depth scale for a foot position v (0 top … 1 bottom of the painting). */
export function depthScale(v, horizon = .5) {
  return Math.max(.55, Math.min(1.15, .62 + (v - horizon) * 1.25));
}

/** Map a painting coordinate to a percentage of a box of size w×h under object-fit: cover (centered). */
export function coverPoint([u, v], w, h) {
  const k = Math.max(w / ART_W, h / ART_H);
  const ox = (w - ART_W * k) / 2, oy = (h - ART_H * k) / 2;
  return [((ox + u * ART_W * k) / w) * 100, ((oy + v * ART_H * k) / h) * 100];
}

/** Where the n-th thing of a kind stands in a place: painting coordinate. */
export function groundSpot(placeId, kind, index = 0) {
  const g = GROUND[placeId] || FALLBACK;
  if (kind === "avatar") return g.avatar;
  const list = g[kind] || g.objects;
  return list[index % list.length];
}

/** Place every figure and prop in the theater on the painted ground. */
export function layoutDepth(theater, placeId) {
  if (!theater) return;
  const w = theater.clientWidth, h = theater.clientHeight;
  if (!w || !h) return;
  const g = GROUND[placeId] || FALLBACK;
  theater.dataset.depth = "on";
  const put = (el, spot) => {
    const [x, y] = coverPoint(spot, w, h);
    const s = depthScale(spot[1], g.horizon);
    el.style.setProperty("--gx", x.toFixed(2) + "%");
    el.style.setProperty("--gy", y.toFixed(2) + "%");
    el.style.setProperty("--ds", s.toFixed(3));
    el.style.setProperty("--dz", String(10 + Math.round(spot[1] * 100)));
    // A little haze on what stands far away (tilt-shift feel).
    el.style.setProperty("--haze", spot[1] < g.horizon + .14 ? "1" : "0");
  };
  theater.querySelectorAll(".painted-avatar").forEach(el => put(el, g.avatar));
  theater.querySelectorAll(".painted-actor").forEach((el, i) => put(el, g.actors[i % g.actors.length]));
  let o = 0, y = 0;
  theater.querySelectorAll(".scene-prop").forEach(el => {
    if (el.classList.contains("scene-prop--source")) put(el, g.yields[y++ % g.yields.length]);
    else put(el, g.objects[o++ % g.objects.length]);
  });
}

/** Gentle parallax: the painting and the foreground bushes drift apart as the pointer moves. */
export function installParallax(theater) {
  if (!theater || theater.dataset.parallax) return;
  theater.dataset.parallax = "on";
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => layoutDepth(theater, theater.dataset.placeId)).observe(theater);
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  let raf = 0;
  theater.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const r = theater.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      theater.style.setProperty("--px", dx.toFixed(3));
      theater.style.setProperty("--py", dy.toFixed(3));
    });
  });
  theater.addEventListener("pointerleave", () => { theater.style.setProperty("--px", "0"); theater.style.setProperty("--py", "0"); });
}
