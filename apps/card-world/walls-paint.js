// Wall and floor painting on the canvas, plus DOM roof elements for enclosed rooms.
import { segRect, parseSeg, GRID, WALL_T, SEG_COST } from "./walls.js";

/** Seeded deterministic PRNG for stable, flicker-free wood and mud textures. */
function rng(seed) {
  let s = Math.abs(Math.sin(seed) * 10000) % 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Draws walls, doors, blueprints and construction progress onto the world canvas.
 * @param {CanvasRenderingContext2D} g World-coordinate canvas context.
 * @param {Array<object>} segs Seg records: { k, kind, look, state, need, work }.
 * @param {object} options
 * @param {boolean} [options.winter=false] Whether winter snow overlays apply.
 * @param {string[]} [options.preview=[]] Segment keys currently being dragged/previewed.
 */
export function drawWalls(g, segs, { winter = false, preview = [] } = {}) {
  if (!g) return;
  g.save();
  g.lineCap = "round";

  const segList = Array.isArray(segs) ? segs : Object.values(segs || {});

  // 1. Draw segment elements
  for (const seg of segList) {
    const { k, kind = "wall", look = "mud", state = "plan", work = 0 } = seg;
    const { dir, i, j } = parseSeg(k);
    const rect = segRect(k, WALL_T);

    const x1 = i * GRID;
    const y1 = j * GRID;
    const x2 = dir === "h" ? (i + 1) * GRID : i * GRID;
    const y2 = dir === "h" ? j * GRID : (j + 1) * GRID;

    const maxWork = (SEG_COST && SEG_COST[kind]?.work) || 60;
    const progress = Math.min(1, Math.max(0, work / maxWork));

    if (look === "fence") {
      paintFenceSeg(g, { x1, y1, x2, y2, rect, dir, kind, state, progress, winter, k, i, j });
    } else {
      paintMudSeg(g, { x1, y1, x2, y2, rect, dir, kind, state, progress, winter, k, i, j, standing: state === "plan" && seg.need?.wattle === 0 });
    }
  }

  // 2. Bright dashed outline for preview keys (dragged in planner)
  if (Array.isArray(preview) && preview.length > 0) {
    g.save();
    g.setLineDash([6, 3]);
    g.strokeStyle = "#ffe24a";
    g.lineWidth = 2.5;
    g.fillStyle = "rgba(255, 230, 80, 0.24)";
    for (const pk of preview) {
      const pr = segRect(pk, WALL_T);
      g.fillRect(pr.x, pr.y, pr.w, pr.h);
      g.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    }
    g.restore();
  }

  g.restore();
}

/** Paint a wooden fence segment (matching paintFence from terrain.js). */
function paintFenceSeg(g, { x1, y1, x2, y2, rect, dir, kind, state, progress, winter, i, j }) {
  const t = WALL_T;
  const wood = winter ? "#8a7860" : "#6e5232";
  const cap = winter ? "rgba(240,242,238,.75)" : null;
  const postColor = winter ? "#6a5a46" : "#4a3420";

  if (state === "plan") {
    // Blueprint fence
    g.save();
    g.setLineDash([5, 4]);
    g.strokeStyle = "rgba(140, 110, 70, 0.55)";
    g.lineWidth = 2;
    g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    if (progress > 0) {
      const fillH = rect.h * progress;
      g.fillStyle = wood;
      g.globalAlpha = 0.4 + 0.6 * progress;
      g.fillRect(rect.x, rect.y + rect.h - fillH, rect.w, fillH);
    }
    g.restore();
    return;
  }

  // Built fence
  if (kind === "door") {
    paintDoor(g, { x1, y1, x2, y2, dir, state: "built", progress: 1, winter, isFence: true });
    return;
  }

  // Shadow rail
  g.strokeStyle = "rgba(30,20,10,.22)";
  g.lineWidth = t + 8;
  g.beginPath();
  g.moveTo(x1, y1 + 3);
  g.lineTo(x2, y2 + 3);
  g.stroke();

  // Main wood rail
  g.strokeStyle = wood;
  g.lineWidth = t;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();

  // Winter snow cap
  if (cap) {
    g.strokeStyle = cap;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x1, y1 - 4);
    g.lineTo(x2, y2 - 4);
    g.stroke();
  }

  // Wooden posts at segment endpoints
  g.fillStyle = postColor;
  g.beginPath();
  g.arc(x1, y1, 8, 0, 7);
  g.arc(x2, y2, 8, 0, 7);
  g.fill();

  if (winter) {
    g.fillStyle = "rgba(240,242,238,.8)";
    g.beginPath();
    g.arc(x1, y1 - 3, 5, 0, 7);
    g.arc(x2, y2 - 3, 5, 0, 7);
    g.fill();
  }
}

/** Paint a mud / rammed-earth wall segment. */
function paintMudSeg(g, { x1, y1, x2, y2, rect, dir, kind, state, progress, winter, i, j, standing }) {
  if (kind === "door") {
    paintDoor(g, { x1, y1, x2, y2, dir, state, progress, winter, isFence: false });
    return;
  }

  const baseColor = winter ? "#a28c74" : "#ba9264";
  const darkEdge = winter ? "#5a4838" : "#68482a";

  if (standing) paintWattle(g, { x1, y1, x2, y2, dir });   // the reed panel is up, waiting for its mud
  if (state === "plan") {
    // Translucent dashed outline
    g.save();
    g.setLineDash([5, 4]);
    g.strokeStyle = "rgba(92, 64, 32, 0.85)";
    g.lineWidth = 2.5;
    g.fillStyle = "rgba(230, 205, 150, 0.35)";
    if (!standing) { g.fillRect(rect.x, rect.y, rect.w, rect.h); g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1); }

    // Under way: solid from the bottom up in proportion to work
    if (progress > 0) {
      const fillH = rect.h * progress;
      const fillY = rect.y + rect.h - fillH;

      g.save();
      g.beginPath();
      g.rect(rect.x, fillY, rect.w, fillH);
      g.clip();

      g.fillStyle = baseColor;
      g.globalAlpha = 0.45 + 0.55 * progress;
      g.fillRect(rect.x, rect.y, rect.w, rect.h);

      // Working edge
      g.strokeStyle = "rgba(100, 70, 35, 0.65)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(rect.x, fillY);
      g.lineTo(rect.x + rect.w, fillY);
      g.stroke();
      g.restore();
    }
    g.restore();
    return;
  }

  // Built mud wall: ground shadow + body + texture + darker top edge + snow cap
  // 1. Soft contact shadow on ground
  g.fillStyle = "rgba(30, 20, 10, 0.22)";
  g.fillRect(rect.x, rect.y + 3, rect.w, rect.h);

  // 2. Mud wall body
  g.fillStyle = baseColor;
  g.fillRect(rect.x, rect.y, rect.w, rect.h);

  // 3. Wattle-and-daub texture flecks (deterministic)
  const R = rng(i * 1009 + j * 733 + (dir === "h" ? 19 : 53));
  g.save();
  for (let step = 0; step < 5; step++) {
    const rx = rect.x + 4 + R() * (rect.w - 8);
    const ry = rect.y + 2 + R() * (rect.h - 4);
    g.fillStyle = R() < 0.5 ? "rgba(80, 50, 20, 0.22)" : "rgba(255, 245, 220, 0.2)";
    if (dir === "h") {
      g.fillRect(rx, ry, 6 + R() * 8, 1.5);
    } else {
      g.fillRect(rx, ry, 1.5, 6 + R() * 8);
    }
  }
  g.restore();

  // 4. Darker top edge (rammed-earth crest)
  g.fillStyle = darkEdge;
  if (dir === "h") {
    g.fillRect(rect.x, rect.y, rect.w, 3);
  } else {
    g.fillRect(rect.x, rect.y, rect.w, 3);
    g.fillRect(rect.x, rect.y, 2, rect.h);
  }

  // 5. Fine boundary stroke
  g.strokeStyle = "rgba(70, 48, 25, 0.4)";
  g.lineWidth = 1;
  g.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

  // 6. Winter snow cap along the top edge
  if (winter) {
    g.strokeStyle = "rgba(240, 242, 238, 0.85)";
    g.lineWidth = 3.5;
    g.beginPath();
    if (dir === "h") {
      g.moveTo(rect.x, rect.y - 1);
      g.lineTo(rect.x + rect.w, rect.y - 1);
    } else {
      g.moveTo(rect.x, rect.y - 1);
      g.lineTo(rect.x + rect.w, rect.y - 1);
      g.moveTo(rect.x - 1, rect.y);
      g.lineTo(rect.x - 1, rect.y + rect.h * 0.4);
    }
    g.stroke();
  }
}

/** Paint a door: frame posts and a half-open wooden plank door leaf. */
function paintDoor(g, { x1, y1, x2, y2, dir, state, progress, winter, isFence }) {
  const isPlan = state === "plan";
  const frameColor = winter ? "#7a6652" : "#5a3f22";
  const plankColor = winter ? "#8a7860" : "#7c5630";
  const borderDark = "#422814";

  // Frame posts at both ends of the opening
  const postW = 10;
  const postD = 14;

  let p1x, p1y, p2x, p2y;
  if (dir === "h") {
    p1x = x1; p1y = y1 - 7;
    p2x = x2 - postW; p2y = y2 - 7;
  } else {
    p1x = x1 - 7; p1y = y1;
    p2x = x2 - 7; p2y = y2 - postW;
  }

  g.save();

  if (isPlan) {
    g.setLineDash([4, 3]);
    g.strokeStyle = "rgba(92, 64, 32, 0.85)";
    g.lineWidth = 2.5;

    // Dashed frame posts
    if (dir === "h") {
      g.strokeRect(p1x, p1y, postW, postD);
      g.strokeRect(p2x, p2y, postW, postD);
    } else {
      g.strokeRect(p1x, p1y, postD, postW);
      g.strokeRect(p2x, p2y, postD, postW);
    }

    // Dashed threshold
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();

    // Dashed half-open door leaf
    const hx = dir === "h" ? x1 + 6 : x1;
    const hy = dir === "h" ? y1 : y1 + 6;
    const angle = Math.PI / 4;
    const doorLen = 46;

    g.save();
    g.translate(hx, hy);
    if (dir === "h") {
      g.rotate(angle);
    } else {
      g.rotate(angle + Math.PI / 2);
    }
    g.strokeRect(0, -3, doorLen, 6);
    if (progress > 0) {
      g.fillStyle = plankColor;
      g.globalAlpha = 0.4 + 0.6 * progress;
      g.fillRect(0, -3, doorLen, 6);
    }
    g.restore();

    g.restore();
    return;
  }

  // Built door
  // 1. Threshold line on the floor
  g.strokeStyle = "rgba(80, 55, 30, 0.45)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();

  // 2. Door frame posts
  g.fillStyle = frameColor;
  g.strokeStyle = borderDark;
  g.lineWidth = 1.5;

  if (dir === "h") {
    g.fillRect(p1x, p1y, postW, postD);
    g.strokeRect(p1x, p1y, postW, postD);
    g.fillRect(p2x, p2y, postW, postD);
    g.strokeRect(p2x, p2y, postW, postD);
  } else {
    g.fillRect(p1x, p1y, postD, postW);
    g.strokeRect(p1x, p1y, postD, postW);
    g.fillRect(p2x, p2y, postD, postW);
    g.strokeRect(p2x, p2y, postD, postW);
  }

  // 3. Swing clearance arc
  const hx = dir === "h" ? x1 + 8 : x1;
  const hy = dir === "h" ? y1 : y1 + 8;
  const doorLen = 48;
  const angle = Math.PI / 4;

  g.save();
  g.setLineDash([3, 3]);
  g.strokeStyle = "rgba(90, 65, 35, 0.28)";
  g.lineWidth = 1.5;
  g.beginPath();
  if (dir === "h") {
    g.arc(hx, hy, doorLen, 0, angle);
  } else {
    g.arc(hx, hy, doorLen, Math.PI / 2, Math.PI / 2 + angle);
  }
  g.stroke();
  g.restore();

  // 4. Half-open plank door leaf
  g.save();
  g.translate(hx, hy);
  if (dir === "h") {
    g.rotate(angle);
  } else {
    g.rotate(angle + Math.PI / 2);
  }

  // Shadow
  g.fillStyle = "rgba(30, 20, 10, 0.22)";
  g.fillRect(2, 2, doorLen - 2, 6);

  // Wood plank
  g.fillStyle = plankColor;
  g.fillRect(0, -3, doorLen, 6);
  g.strokeStyle = borderDark;
  g.lineWidth = 1.5;
  g.strokeRect(0, -3, doorLen, 6);

  // Door handle
  g.fillStyle = "#c8a452";
  g.beginPath();
  g.arc(doorLen - 10, 0, 2, 0, 7);
  g.fill();

  g.restore();

  // 5. Winter snow on door frame
  if (winter) {
    g.fillStyle = "rgba(240, 242, 238, 0.85)";
    if (dir === "h") {
      g.fillRect(p1x - 1, p1y - 2, postW + 2, 3);
      g.fillRect(p2x - 1, p2y - 2, postW + 2, 3);
    } else {
      g.fillRect(p1x - 1, p1y - 2, postD + 2, 3);
      g.fillRect(p2x - 1, p2y - 2, postD + 2, 3);
    }
  }

  g.restore();
}

/**
 * Draws wooden floor boards across room grid cells (matching the yard floor in paintFence).
 * @param {CanvasRenderingContext2D} g World-coordinate canvas context.
 * @param {Array<[number, number]>} cells Grid cell coordinates [i, j].
 * @param {object} options
 * @param {boolean} [options.winter=false]
 */
export function drawFloor(g, cells, { winter = false } = {}) {
  if (!g || !Array.isArray(cells) || cells.length === 0) return;
  g.save();
  g.lineCap = "round";

  const plankH = 34;
  const baseColor = winter ? "#a89478" : "#a27c50";

  for (const [i, j] of cells) {
    const x = i * GRID;
    const y = j * GRID;
    const w = GRID;
    const h = GRID;

    // Base plank floor fill
    g.fillStyle = baseColor;
    g.fillRect(x, y, w, h);

    // Planks laid edge to edge
    const R = rng(Math.round(x * 7 + y));
    const startY = Math.floor(y / plankH) * plankH;

    for (let py = startY; py < y + h; py += plankH) {
      const top = Math.max(y, py);
      const bottom = Math.min(y + h, py + plankH);
      const sliceH = bottom - top;
      if (sliceH <= 0) continue;

      // Board subtle tint variation
      g.fillStyle = R() < 0.5 ? "rgba(255,240,210,.07)" : "rgba(70,45,20,.07)";
      g.fillRect(x, top, w, sliceH);

      // Horizontal board seam
      if (py >= y && py <= y + h) {
        g.strokeStyle = "rgba(70,46,24,.45)";
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(x, py);
        g.lineTo(x + w, py);
        g.stroke();
      }

      // Vertical plank butt seams
      for (let px = x + 25 + R() * 40; px < x + w - 15; px += 65 + R() * 50) {
        g.strokeStyle = "rgba(70,46,24,.45)";
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(px, top);
        g.lineTo(px, bottom);
        g.stroke();
      }

      // Occasional wood knot
      if (R() < 0.45) {
        g.fillStyle = "rgba(80,52,26,.35)";
        g.beginPath();
        const knotX = x + 15 + R() * (w - 30);
        const knotY = Math.max(y + 6, Math.min(y + h - 6, py + 17));
        g.ellipse(knotX, knotY, 5, 3, 0, 0, 7);
        g.fill();
      }
    }
  }

  g.restore();
}

/**
 * Creates an absolute DOM element representing the thatched roof of a room.
 * @param {object} room Room object from findRooms: { id, cells, rects, box, doors }
 * @param {object} options
 * @param {string} [options.label=""] Placard name (e.g. "卧房", "灶房")
 * @param {boolean} [options.open=false] Whether the roof is lifted/open
 * @returns {HTMLElement}
 */
export function roofEl(room, { label = "", open = false } = {}) {
  const el = document.createElement("div");
  el.className = "roof built-roof" + (open ? " open" : "");
  el.style.left = `${room.box.x}px`;
  el.style.top = `${room.box.y}px`;
  el.style.width = `${room.box.w}px`;
  el.style.height = `${room.box.h}px`;

  // One child element per rectangular piece so L-shapes read seamlessly as one roof
  const rects = (room.rects && room.rects.length > 0) ? room.rects : [room.box];
  for (const r of rects) {
    const piece = document.createElement("div");
    piece.className = "roof-piece";
    piece.style.left = `${r.x - room.box.x}px`;
    piece.style.top = `${r.y - room.box.y}px`;
    piece.style.width = `${r.w}px`;

    // Detect touching neighbors to seamlessly merge pieces of rectilinear / L-shaped rooms
    const touchesBottom = rects.some(other =>
      other !== r &&
      Math.abs(other.y - (r.y + r.h)) < 2 &&
      !(other.x + other.w <= r.x || other.x >= r.x + r.w)
    );
    const touchesTop = rects.some(other =>
      other !== r &&
      Math.abs(r.y - (other.y + other.h)) < 2 &&
      !(other.x + other.w <= r.x || other.x >= r.x + r.w)
    );

    if (touchesBottom) piece.classList.add("touch-bottom");
    if (touchesTop) piece.classList.add("touch-top");

    piece.style.height = `${touchesBottom ? r.h + 2 : r.h}px`;
    el.appendChild(piece);
  }

  // Room name placard centred on the visual centroid of room cells
  if (label) {
    const nameEl = document.createElement("div");
    nameEl.className = "room-name";
    nameEl.textContent = label;

    let cx = room.box.w / 2;
    let cy = room.box.h / 2;

    if (Array.isArray(room.cells) && room.cells.length > 0) {
      const avgI = room.cells.reduce((s, c) => s + c[0], 0) / room.cells.length;
      const avgJ = room.cells.reduce((s, c) => s + c[1], 0) / room.cells.length;
      let bestDist = Infinity;
      let bestCell = room.cells[0];

      for (const c of room.cells) {
        const d = (c[0] - avgI) ** 2 + (c[1] - avgJ) ** 2;
        if (d < bestDist) {
          bestDist = d;
          bestCell = c;
        }
      }
      cx = (bestCell[0] + 0.5) * GRID - room.box.x;
      cy = (bestCell[1] + 0.5) * GRID - room.box.y;
    }

    nameEl.style.left = `${cx}px`;
    nameEl.style.top = `${cy}px`;
    el.appendChild(nameEl);
  }

  return el;
}

/** A reed panel standing on its line: stakes and woven reed, before the mud goes on. */
function paintWattle(g, { x1, y1, x2, y2, dir }) {
  g.save();
  const len = dir === "h" ? x2 - x1 : y2 - y1, at = (t, off = 0) => (dir === "h" ? [x1 + len * t, y1 + off] : [x1 + off, y1 + len * t]);
  g.strokeStyle = "#7a5a32"; g.lineWidth = 4; g.lineCap = "round";
  for (const t of [0.1, 0.37, 0.63, 0.9]) { const [a, b] = at(t, -8), [c, d] = at(t, 8); g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
  g.strokeStyle = "#c9a85e"; g.lineWidth = 3;
  for (const off of [-4, 0, 4]) {
    g.beginPath();
    for (let t = 0; t <= 1.001; t += 0.125) { const w = (Math.round(t * 8) % 2 ? 1.5 : -1.5) * (off === 0 ? -1 : 1), [x, y] = at(t, off + w); if (t === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  g.restore();
}
