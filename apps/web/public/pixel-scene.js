/**
 * OpenLife 像素视图 —— 只读渲染层。
 *
 * 数据契约：本文件唯一的数据来源是 GET /api/state 里的 `settlement` 视图。
 * 它已经是"当前地点该被看见什么"的投影（地名、在场的人、物件、出口、天气），
 * 所以这一层不碰内核、不发命令、不推导世界规则——只负责把它画出来。
 *
 * 唯一需要本层自己"发明"的东西是**空间**：模拟里没有坐标，
 * `placeId → 布局` 这张表属于内容层（见 LAYOUTS），不属于内核。
 */
(() => {
  'use strict';

  const W = 640, H = 360;

  /* ================= 0. 数据 → SceneVM ================= */

  async function fetchState() {
    const res = await fetch('/api/state', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /** 把 state 收敛成渲染层唯一认识的形状。任何 UI 细节都在这里决定。 */
  function toSceneVM(state) {
    const st = state.settlement ?? {};
    const clock = state.clock ?? {};
    const ch = state.character ?? {};
    const weather = st.weather ?? {};
    const placeId = String(st.placeId ?? 'place:yard');
    const neighbours = (st.neighbours ?? [])
      .filter((n) => !n.placeId || n.placeId === placeId)
      .slice(0, 6);
    const objects = (st.objects ?? []).filter((o) => o.visible !== false).slice(0, 12);
    const exits = (st.exits ?? []).slice(0, 8);
    const animals = (st.nature?.animals ?? []).slice(0, 2);
    const activity = st.dailyActivity ?? {};
    const usedRatio = activity.capacity ? Math.min(1, (activity.used ?? 0) / activity.capacity) : 0.25;
    return {
      place: {
        id: placeId,
        name: String(st.placeName ?? '河岸台地'),
        space: String(st.spaceName ?? ''),
        note: String(st.note ?? ''),
      },
      clock: {
        day: Number(clock.day ?? st.day ?? 0),
        dayOfMonth: Number(clock.dayOfMonth ?? 1),
        monthOfYear: Number(clock.monthOfYear ?? 1),
        season: String(st.season ?? clock.season ?? '春'),
        year: Number(clock.eraYear ?? 0),
      },
      weather: {
        sky: String(weather.sky ?? '晴'),
        note: String(weather.note ?? ''),
      },
      player: {
        id: String(ch.id ?? ''),
        name: String(ch.name ?? '我'),
        age: Number(ch.age ?? 0),
        alive: ch.alive !== false,
      },
      people: neighbours.map((n) => ({
        id: String(n.id),
        name: String(n.acquaintance && n.acquaintance !== 'stranger' ? (n.realName || n.name) : n.name),
        known: n.acquaintance !== 'stranger',
        atWork: Boolean(n.atWork),
        contact: String(n.contact ?? '陌生'),
      })),
      props: objects.map((o) => ({
        id: String(o.id),
        name: String(o.name ?? '物件'),
        proto: String(o.prototypeId ?? ''),
        qty: Number(o.quantity ?? 0),
      })),
      exits: exits.map((e) => ({
        id: String(e.placeId),
        name: String(e.name ?? ''),
        days: Number(e.costDays ?? 1),
        purpose: String(e.purpose ?? ''),
      })),
      animals: animals.map((a) => ({ id: String(a.id), name: String(a.name ?? ''), kind: String(a.kind ?? '') })),
      light: 0.22 + usedRatio * 0.55, // 以"今天用掉多少活动"推断光照，不是真实钟点
    };
  }

  /* ================= 1. 布局表（内容层，不属于内核） ================= */

  const LAYOUTS = {
    'place:yard': { build: 'house', water: false, garden: true, trees: 7 },
    'place:hearth-yard': { build: 'hearth', water: false, garden: false, trees: 4 },
    'place:longhouse': { build: 'long', water: false, garden: true, trees: 5 },
    'place:river': { build: 'none', water: true, garden: false, trees: 5 },
    'place:fishing-lodge': { build: 'hut', water: true, garden: false, trees: 4 },
    'place:weaving-shed': { build: 'hut', water: false, garden: true, trees: 4 },
    'place:herb-hut': { build: 'hut', water: false, garden: true, trees: 6 },
  };
  const FALLBACK_LAYOUT = { build: 'hut', water: false, garden: false, trees: 5 };

  function layoutFor(placeId) {
    return LAYOUTS[placeId] ?? FALLBACK_LAYOUT;
  }

  /* ================= 2. 季节 / 天气 → 参数 ================= */

  const SEASONS = {
    春: { grass: ['#1d2a14', '#27361b', '#334622', '#3f5429', '#4d6331', '#5f7640'], flower: 1.0, snow: 0, leaf: '#5f7640' },
    夏: { grass: ['#17240f', '#203018', '#2b3d1e', '#364a26', '#43582d', '#536b38'], flower: 0.5, snow: 0, leaf: '#536b38' },
    秋: { grass: ['#2a2412', '#38301a', '#463c22', '#54482b', '#635434', '#75643f'], flower: 0.3, snow: 0, leaf: '#75643f' },
    冬: { grass: ['#20241c', '#2a2f24', '#353b2c', '#404734', '#4c543d', '#5b6448'], flower: 0.05, snow: 1, leaf: '#4c543d' },
  };

  function skyOf(weather) {
    const s = String(weather?.sky ?? '晴');
    if (s.includes('雪')) return 'snow';
    if (s.includes('雨')) return 'rain';
    if (s.includes('雾')) return 'fog';
    return 'clear';
  }

  /* ================= 3. 工具 ================= */

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function h2(x, y, s) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 362437);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, sc, seed) {
    const fx = x / sc, fy = y / sc, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = h2(x0, y0, seed), b = h2(x0 + 1, y0, seed), c = h2(x0, y0 + 1, seed), d = h2(x0 + 1, y0 + 1, seed);
    const t = a + (b - a) * sx, bt = c + (d - c) * sx;
    return t + (bt - t) * sy;
  }
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const cs = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const ca = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  function ramp(p, t) {
    t = clamp(t, 0, 1) * (p.length - 1);
    const i = Math.floor(t), f = t - i;
    return i >= p.length - 1 ? p[p.length - 1] : mixc(p[i], p[i + 1], f);
  }
  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }
  function distToPoly(x, y, pts) {
    let m = 1e9;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < m) m = d;
    }
    return m;
  }

  /* ================= 4. 画布 ================= */

  const view = document.getElementById('view');
  const vctx = view.getContext('2d');
  vctx.imageSmoothingEnabled = false;
  const layer = () => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c, g };
  };
  const TER = layer(), DET = layer(), PRP = layer(), CAN = layer();

  /* 尺度基准：人物 24px 高（约 1.5 格），门高 28，房高 82 → 房子约 4.2 个身高。
     所有建筑都按 w/h 的比例算内部尺寸，改 HOUSE 不用再改画法。 */
  const PATH = [[-30, 318], [90, 308], [200, 298], [320, 292], [440, 286], [560, 280], [680, 274]];
  const SPUR = [[296, 290], [298, 244], [300, 192]];
  const HOUSE = { x: 232, y: 104, w: 132, h: 82 };
  const WELL = { x: 448, y: 208 };
  const GARDEN = { x: 54, y: 188, w: 78, h: 60 };
  const POND = { x: 552, y: 312, r: 62 };
  const YARD = { x: 200, y: 196, w: 220, h: 74 };

  let TREES = [];
  let mask = new Uint8Array(W * H);
  let vm = null;
  let layout = FALLBACK_LAYOUT;
  let season = SEASONS.春;
  let sky = 'clear';

  function planTrees(n) {
    const fixed = [
      { x: 26, y: 172, h: 132 }, { x: 196, y: 124, h: 102 }, { x: 438, y: 152, h: 114 },
      { x: 610, y: 202, h: 128 }, { x: 88, y: 344, h: 112 }, { x: 382, y: 352, h: 98 },
      { x: 602, y: 346, h: 106 },
    ];
    return fixed.slice(0, clamp(n, 0, fixed.length)).map((t) => ({
      x: t.x, y: t.y, h: t.h,
      r: Math.round(t.h * 0.42),
      cy: t.y - Math.round(t.h * 0.62),
    }));
  }

  /* ================= 5. 地形 ================= */

  function buildTerrain() {
    const img = TER.g.createImageData(W, H), d = img.data;
    mask = new Uint8Array(W * H);
    const G = season.grass.map(hex);
    const DIRT = [hex('#6a5540'), hex('#7a6549'), hex('#8a7457'), hex('#9a8365'), hex('#a89372')];
    const SOIL = [hex('#33281a'), hex('#3f3223'), hex('#4b3d2b')];
    const WATER = [hex('#2b403e'), hex('#374e4a'), hex('#435a55'), hex('#506660')];
    const SAND = hex('#6a5942');

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let t = clamp(0.5 + (vnoise(x, y, 150, 5) - 0.5) * 1.2 + (vnoise(x, y, 52, 11) - 0.5) * 0.85
        + (vnoise(x, y, 16, 23) - 0.5) * 0.55 + (vnoise(x, y, 5, 29) - 0.5) * 0.22, 0, 1);
      let col = ramp(G, t);
      let mk = 0;

      if (layout.garden && x >= GARDEN.x && x < GARDEN.x + GARDEN.w && y >= GARDEN.y && y < GARDEN.y + GARDEN.h) {
        const ft = ((y - GARDEN.y) % 9) / 9;
        col = ft < 0.5 ? SOIL[0] : SOIL[1];
        col = mixc(col, SOIL[2], (vnoise(x, y, 5, 71) - 0.5) * 0.5 + 0.25);
        mk = 3;
      }

      const dp = Math.min(distToPoly(x, y, PATH), distToPoly(x, y, SPUR)) + (vnoise(x, y, 24, 31) - 0.5) * 9;
      const pw = 1 - clamp((dp - 15) / 8, 0, 1);
      if (pw > 0.002) {
        const dt = vnoise(x, y, 9, 41) * 0.55 + vnoise(x, y, 26, 42) * 0.45;
        let dc = ramp(DIRT, dt * 1.15 - 0.05);
        if (pw < 0.55) dc = mixc(dc, DIRT[0], (0.55 - pw) * 1.35);
        col = mixc(col, dc, pw * 0.97);
        if (pw > 0.55) mk = 1;
      }

      if (layout.water) {
        const pd = Math.hypot(x - POND.x, (y - POND.y) * 1.06) + (vnoise(x, y, 28, 53) - 0.5) * 24;
        const shore = 1 - clamp((pd - POND.r) / 17, 0, 1);
        if (shore > 0.002) {
          col = mixc(col, SAND, shore * 0.6);
          const wf = 1 - clamp((pd - (POND.r - 10)) / 9, 0, 1);
          if (wf > 0.002) {
            col = mixc(col, ramp(WATER, vnoise(x, y, 11, 61)), wf);
            if (wf > 0.5) mk = 2;
          }
        }
      }

      const gr = (h2(x, y, 3) - 0.5) * 0.10;
      d[i] = clamp(col[0] * (1 + gr), 0, 255);
      d[i + 1] = clamp(col[1] * (1 + gr), 0, 255);
      d[i + 2] = clamp(col[2] * (1 + gr), 0, 255);
      d[i + 3] = 255;
      mask[y * W + x] = mk;
    }
    TER.g.putImageData(img, 0, 0);
  }

  /* ================= 6. 细节 ================= */

  function buildDetail() {
    const g = DET.g;
    g.clearRect(0, 0, W, H);
    const G = season.grass.map(hex);
    const snow = season.snow;

    for (let i = 0; i < 1100; i++) {
      const x = Math.floor(h2(i, 1, 301) * W), y = Math.floor(h2(i, 2, 301) * H);
      if (mask[y * W + x] !== 0) continue;
      const r = h2(i, 3, 301);
      const w = 3 + Math.floor(h2(i, 4, 301) * 5), hh = 2 + Math.floor(h2(i, 5, 301) * 3);
      g.fillStyle = ca(r < 0.5 ? G[0] : G[1], 0.26);
      g.fillRect(x, y, w, hh);
      g.fillRect(x + 1, y - 1, Math.max(1, w - 2), hh + 1);
    }

    for (let i = 0; i < 15000; i++) {
      const x = Math.floor(h2(i, 1, 401) * W), y = Math.floor(h2(i, 2, 401) * H);
      if (mask[y * W + x] !== 0) continue;
      const dens = vnoise(x, y, 62, 411) * 0.55 + vnoise(x, y, 18, 412) * 0.45;
      if (h2(i, 3, 401) > dens * dens * 1.75) continue;
      const r = h2(i, 4, 401);
      const hh = 2 + Math.floor(h2(i, 5, 401) * 4);
      const lean = r > 0.68 ? 1 : 0;
      g.fillStyle = cs(G[0]);
      g.fillRect(x, y - 1, 1, 2);
      g.fillStyle = cs(r < 0.34 ? G[0] : r < 0.72 ? G[1] : G[2]);
      g.fillRect(x, y - hh, 1, hh - 1);
      g.fillStyle = cs(r < 0.40 ? G[2] : r < 0.82 ? G[4] : G[5]);
      g.fillRect(x + lean, y - hh, 1, 2);
      if (r > 0.86) { g.fillStyle = cs(G[5]); g.fillRect(x + lean, y - hh, 1, 1); }
    }

    const flowerN = Math.round(620 * season.flower);
    for (let i = 0; i < flowerN; i++) {
      const x = Math.floor(h2(i, 1, 321) * W), y = Math.floor(h2(i, 2, 321) * H);
      if (mask[y * W + x] !== 0) continue;
      if (vnoise(x, y, 74, 331) < 0.62) continue;
      const r = h2(i, 3, 321);
      g.fillStyle = cs(r < 0.72 ? [216, 216, 200] : [196, 198, 174]);
      g.fillRect(x, y, 1, 1);
      if (r < 0.55) { g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); }
      if (r < 0.24) { g.fillRect(x + 1, y - 1, 1, 1); g.fillRect(x + 2, y, 1, 1); }
      g.fillStyle = cs(G[0]); g.fillRect(x, y + 1, 1, 1);
    }

    for (let i = 0; i < 1800; i++) {
      const x = Math.floor(h2(i, 5, 221) * W), y = Math.floor(h2(i, 6, 221) * H);
      if (mask[y * W + x] !== 1) continue;
      const r = h2(i, 7, 221);
      g.fillStyle = cs(r < 0.45 ? hex('#3f3527') : r < 0.8 ? hex('#b3a180') : hex('#6a5a44'));
      g.fillRect(x, y, 1, 1);
    }

    for (let i = 0; i < 520; i++) {
      const x = Math.floor(h2(i, 8, 231) * W), y = Math.floor(h2(i, 9, 231) * H);
      if (!layout.water) break;
      if (mask[y * W + x] !== 2 && mask[y * W + x] !== 0) continue;
      const pd = Math.hypot(x - POND.x, (y - POND.y) * 1.06);
      if (pd > POND.r + 18 || pd < POND.r - 16) continue;
      g.fillStyle = cs(mixc(G[0], [0, 0, 0], 0.18));
      const hh = 4 + Math.floor(h2(i, 10, 231) * 6);
      g.fillRect(x, y - hh, 1, hh);
      g.fillStyle = cs(G[4]); g.fillRect(x, y - hh, 1, 1);
    }

    if (layout.garden) {
      for (let gy = GARDEN.y + 5; gy < GARDEN.y + GARDEN.h - 3; gy += 9) {
        for (let gx = GARDEN.x + 6; gx < GARDEN.x + GARDEN.w - 4; gx += 8) {
          const r = h2(gx, gy, 241);
          g.fillStyle = cs(mixc(hex('#5a6b32'), hex('#7d8f4c'), r));
          g.fillRect(gx, gy - 2, 1, 3); g.fillRect(gx + 1, gy - 3, 1, 2);
          g.fillStyle = cs(hex('#8a9c56')); g.fillRect(gx, gy - 3, 1, 1);
        }
      }
    }

    if (snow) {
      for (let i = 0; i < 1300; i++) {
        const x = Math.floor(h2(i, 1, 501) * W), y = Math.floor(h2(i, 2, 501) * H);
        if (mask[y * W + x] !== 0) continue;
        const n = vnoise(x, y, 30, 502);
        if (n < 0.64) continue;
        g.fillStyle = ca([224, 228, 228], 0.28 + n * 0.3);
        g.fillRect(x, y, 1, 1);
        if (n > 0.82) g.fillRect(x + 1, y, 1, 1);
      }
    }
  }

  /* ================= 7. 建筑 ================= */

  /* 建筑按 w/h 的比例算内部尺寸：改 HOUSE 的宽高，门窗梁柱会跟着缩放，
     不用再逐行改数字。人物 24px 高时，门高 29、房高 82，约 4.2 个身高。 */
  function drawHouse(g) {
    const { x, y, w, h } = HOUSE;
    const roofH = Math.round(h * 0.32);
    const beam = Math.max(3, Math.round(w * 0.036));
    const baseH = Math.round(h * 0.12);
    const wallTop = y + Math.round(h * 0.10);
    const midY = Math.round(y + h * 0.52);

    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.fillRect(x + Math.round(w * 0.07), y + Math.round(h * 0.16), w + 3, h - 8);
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(x - 5, y + h - 2, w + 10, 5);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(x - 8, y + h + 3, w + 16, 4);
    g.fillStyle = 'rgba(0,0,0,0.09)';
    g.fillRect(x + Math.round(w * 0.12), y + Math.round(h * 0.24), w + 10, h - 4);

    g.fillStyle = cs(hex('#3e352e'));
    g.fillRect(x - 2, wallTop, w + 4, h - (wallTop - y));
    g.fillStyle = cs(hex('#6f6650'));
    g.fillRect(x, wallTop + 3, w, h - (wallTop - y) - 3);

    g.fillStyle = 'rgba(58,50,38,0.16)';
    for (let yy = wallTop + 10; yy < y + h - baseH; yy += 7) {
      for (let xx = x + 4; xx < x + w - 4; xx += 9) {
        g.fillRect(xx + (((yy / 7) | 0) % 2 ? 4 : 0), yy, 5, 3);
      }
    }

    g.fillStyle = cs(hex('#463c2f'));
    g.fillRect(x, wallTop, w, beam);
    const cols = Math.max(3, Math.round(w / 34));
    for (let i = 0; i <= cols; i++) {
      const bx = x + Math.round((i * (w - beam)) / cols);
      g.fillRect(bx, wallTop, beam, h - (wallTop - y));
    }
    g.fillRect(x + 2, midY, w - 4, 2);
    g.fillRect(x + 2, y + h - baseH - 2, w - 4, 2);
    for (let i = 0; i < cols - 1; i++) {
      const bx = x + Math.round((i * (w - beam)) / cols) + beam;
      g.beginPath();
      g.moveTo(bx, y + h - baseH - 2);
      g.lineTo(bx + Math.round((w - beam) / cols) - beam, midY);
      g.lineWidth = 2; g.strokeStyle = cs(hex('#463c2f')); g.stroke();
    }

    for (let yy = y + h - baseH; yy < y + h; yy += 4) {
      for (let xx = x; xx < x + w; xx += 9) {
        g.fillStyle = cs(hex('#4c4539'));
        g.fillRect(xx + (((yy / 4) | 0) % 2 ? 4 : 0), yy, 8, 3);
      }
    }

    const rx0 = x - Math.round(w * 0.08), rx1 = x + w + Math.round(w * 0.08);
    const ry0 = y - roofH, ry1 = y + Math.round(h * 0.14);
    for (let yy = ry0; yy < ry1; yy++) {
      const k = (yy - ry0) / (ry1 - ry0);
      const half = lerp((rx1 - rx0) * 0.30, (rx1 - rx0) * 0.5, k * k * 0.85 + k * 0.15);
      g.fillStyle = cs(mixc(hex('#331b16'), hex('#43261f'), k));
      g.fillRect((rx0 + rx1) / 2 - half, yy, half * 2, 1);
    }
    for (let yy = ry0 + 3; yy < ry1; yy += 5) {
      const k = (yy - ry0) / (ry1 - ry0);
      const half = lerp((rx1 - rx0) * 0.30, (rx1 - rx0) * 0.5, k * k * 0.85 + k * 0.15);
      g.fillStyle = 'rgba(28,16,12,0.45)';
      g.fillRect((rx0 + rx1) / 2 - half, yy, half * 2, 1);
    }

    const chW = Math.round(w * 0.09);
    g.fillStyle = cs(hex('#3a2c22'));
    g.fillRect(x + w - Math.round(w * 0.22), ry0 - 10, chW, 18);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x + w - Math.round(w * 0.22), ry0 - 10, chW, 3);

    const winW = Math.round(w * 0.19), winH = Math.round(h * 0.28);
    const winY = y + Math.round(h * 0.30);
    for (const wx of [x + Math.round(w * 0.10), x + w - Math.round(w * 0.10) - winW]) {
      g.fillStyle = cs(hex('#3e352e'));
      g.fillRect(wx - 2, winY - 2, winW + 4, winH + 4);
      g.fillStyle = cs(hex('#c9a468'));
      g.fillRect(wx, winY, winW, winH);
      g.fillStyle = 'rgba(70,50,30,0.40)';
      g.fillRect(wx, winY, winW, Math.max(2, Math.round(winH * 0.18)));
      g.fillStyle = cs(hex('#3e352e'));
      g.fillRect(wx + (winW >> 1), winY, 2, winH);
      g.fillRect(wx, winY + (winH >> 1), winW, 2);
    }

    const doorW = Math.round(w * 0.13), doorH = Math.round(h * 0.40);
    const dx = x + Math.round((w - doorW) / 2), dy = y + h - doorH;
    g.fillStyle = cs(hex('#3e352e'));
    g.fillRect(dx - 2, dy - 2, doorW + 4, doorH + 2);
    g.fillStyle = cs(hex('#5f4029'));
    g.fillRect(dx, dy, doorW, doorH);
    g.fillStyle = 'rgba(40,26,16,0.5)';
    for (let xx = dx + 4; xx < dx + doorW - 2; xx += 5) g.fillRect(xx, dy, 1, doorH);
    g.fillStyle = cs(hex('#c9a468'));
    g.fillRect(dx + doorW - 4, dy + (doorH >> 1), 2, 2);
  }

  function drawHut(g) {
    const x = 268, y = 138, w = 104, h = 58;
    const roofH = Math.round(h * 0.34);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x + 8, y + 14, w + 2, h - 6);
    g.fillStyle = cs(hex('#5e5646'));
    g.fillRect(x, y + 8, w, h - 8);
    g.fillStyle = cs(hex('#463c2f'));
    for (let xx = x; xx < x + w; xx += 26) g.fillRect(xx, y + 8, 4, h - 8);
    g.fillRect(x, y + 8, w, 4);
    for (let yy = y - roofH; yy < y + 10; yy++) {
      const k = (yy - (y - roofH)) / (roofH + 10);
      const half = lerp(w * 0.30, w * 0.56, k);
      g.fillStyle = cs(mixc(hex('#331b16'), hex('#43261f'), k));
      g.fillRect(x + w / 2 - half, yy, half * 2, 1);
    }
    const doorW = 18, doorH = 28;
    g.fillStyle = cs(hex('#3e352e'));
    g.fillRect(x + w / 2 - doorW / 2 - 2, y + h - doorH - 2, doorW + 4, doorH + 2);
    g.fillStyle = cs(hex('#5f4029'));
    g.fillRect(x + w / 2 - doorW / 2, y + h - doorH, doorW, doorH);
    g.fillStyle = cs(hex('#c9a468'));
    g.fillRect(x + 14, y + 22, 16, 13);
    g.fillStyle = cs(hex('#3e352e'));
    g.fillRect(x + 14, y + 22, 16, 2);
  }

  function drawWell(g) {
    const { x, y } = WELL, r = 16;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 6; i++) { const w = (r * 2 + 8) * (1 - i / 7); g.fillRect(x - w / 2 + 6, y + r * 0.42 + i * 2, w, 2); }
    for (let yy = -10; yy <= 10; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        const d = Math.hypot(xx, yy * 1.55);
        if (d > r || d < r - 7) continue;
        const sh = 0.3 + 0.7 * (xx + r) / (2 * r);
        let c = mixc(hex('#4c4539'), hex('#7a7466'), sh);
        if ((Math.floor((xx + r) / 5) + Math.floor((yy + 10) / 5)) % 2) c = mixc(c, hex('#33302a'), 0.25);
        g.fillStyle = cs(c); g.fillRect(x + xx, y + yy, 1, 1);
      }
    }
    for (let yy = -6; yy <= 6; yy++) {
      const hw = Math.round((r - 8) * Math.sqrt(Math.max(0, 1 - (yy * yy) / 40)));
      g.fillStyle = cs(hex('#26302e')); g.fillRect(x - hw, y + yy, hw * 2, 1);
    }
    const top = y - 18;
    g.fillStyle = cs(hex('#4a3826'));
    g.fillRect(x - r + 4, top + 6, 3, 14); g.fillRect(x + r - 7, top + 6, 3, 14);
    for (let i = 0; i < 6; i++) {
      const w = (r * 2 + 2) * (1 - Math.abs(i - 2.5) / 4);
      g.fillStyle = cs(i % 2 ? hex('#331b16') : hex('#43261f'));
      g.fillRect(Math.round(x - w / 2), top + i, w, 1);
    }
    g.fillStyle = cs(hex('#2f2418')); g.fillRect(x - 1, top + 8, 2, 6);
    g.fillStyle = cs(hex('#6b4f30')); g.fillRect(x - 4, top + 13, 8, 5);
  }

  function drawLonghouse(g) {
    const x = 206, y = 122, w = 228, h = 68;
    const roofH = Math.round(h * 0.40);
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.fillRect(x + 10, y + 16, w + 2, h - 8);
    g.fillStyle = cs(hex('#6b5e48'));
    g.fillRect(x, y + 10, w, h - 10);
    g.fillStyle = cs(hex('#463c2f'));
    for (let xx = x; xx < x + w; xx += 24) g.fillRect(xx, y + 10, 5, h - 10);
    g.fillRect(x, y + 10, w, 5);
    for (let yy = y - roofH; yy < y + 12; yy++) {
      const k = (yy - (y - roofH)) / (roofH + 12);
      const half = lerp(w * 0.34, w * 0.55, k);
      g.fillStyle = cs(mixc(hex('#38201a'), hex('#4a2c22'), k));
      g.fillRect(x + w / 2 - half, yy, half * 2, 1);
    }
    g.fillStyle = cs(hex('#3e352e'));
    for (const dx of [x + w / 2 - 56, x + w / 2 + 34]) g.fillRect(dx, y + h - 30, 22, 30);
    g.fillStyle = cs(hex('#c9a468'));
    g.fillRect(x + w / 2 - 13, y + 34, 26, 16);
  }


  const PROP_SPRITES = {
    jar: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 4, y + 1, 11, 2);
      g.fillStyle = cs(hex('#7a5a40')); g.fillRect(x - 3, y - 8, 8, 9);
      g.fillStyle = cs(hex('#9a7250')); g.fillRect(x - 3, y - 8, 3, 9);
      g.fillStyle = cs(hex('#5a4028')); g.fillRect(x - 2, y - 10, 6, 2);
    },
    basket: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 5, y + 1, 13, 2);
      g.fillStyle = cs(hex('#8a6f44')); g.fillRect(x - 5, y - 7, 12, 8);
      g.fillStyle = cs(hex('#a98a58')); g.fillRect(x - 5, y - 7, 12, 2);
      g.fillStyle = cs(hex('#5f4a2c'));
      for (let i = -4; i < 7; i += 3) g.fillRect(x + i, y - 6, 1, 6);
    },
    bag: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 4, y + 1, 10, 2);
      g.fillStyle = cs(hex('#7d7050')); g.fillRect(x - 4, y - 8, 9, 9);
      g.fillStyle = cs(hex('#968a66')); g.fillRect(x - 4, y - 8, 3, 9);
      g.fillStyle = cs(hex('#4e4430')); g.fillRect(x - 1, y - 11, 3, 3);
    },
    bundle: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 4, y + 1, 9, 2);
      g.fillStyle = cs(hex('#8a7a4a')); g.fillRect(x - 4, y - 6, 8, 7);
      g.fillStyle = cs(hex('#a89a62')); g.fillRect(x - 4, y - 6, 8, 2);
      g.fillStyle = cs(hex('#5f5230')); g.fillRect(x - 1, y - 6, 1, 7);
    },
    crate: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 5, y + 1, 11, 2);
      g.fillStyle = cs(hex('#6a5236')); g.fillRect(x - 5, y - 8, 11, 9);
      g.fillStyle = cs(hex('#856a48')); g.fillRect(x - 5, y - 8, 11, 2);
      g.fillStyle = cs(hex('#4a3824')); g.fillRect(x - 5, y - 4, 11, 1);
    },
  };
  const PROP_BY_PROTO = {
    'prototype:bowl': 'jar', 'prototype:jar': 'jar', 'prototype:carrying-bag': 'bag',
    'prototype:grain-basket': 'basket', 'prototype:fiber-bundle': 'bundle',
    'prototype:hide-cloak': 'bundle', 'prototype:mat': 'bundle',
  };

  function drawProps(g) {
    const list = vm?.props ?? [];
    const doorX = HOUSE.x + HOUSE.w / 2;
    list.forEach((p, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      const cx = doorX + side * (34 + (k % 3) * 17) + (h2(i, 1, 77) - 0.5) * 6;
      const cy = HOUSE.y + HOUSE.h + 12 + Math.floor(k / 3) * 13 + (h2(i, 2, 77) - 0.5) * 4;
      const kind = PROP_BY_PROTO[p.proto] ?? 'crate';
      (PROP_SPRITES[kind] ?? PROP_SPRITES.crate)(g, cx, cy);
    });
  }

  function drawGardenFence(g) {
    const { x, y, w, h } = GARDEN;
    const rail = (x1, y1, x2, y2) => {
      const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
      for (const off of [3, 8]) {
        g.fillStyle = cs(hex('#4a3826'));
        for (let d = 0; d <= len; d++) {
          const t = d / len;
          g.fillRect(Math.round(lerp(x1, x2, t)), Math.round(lerp(y1, y2, t)) + off, 1, 2);
        }
      }
      const n = Math.max(1, Math.round(len / 15));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = Math.round(lerp(x1, x2, t)), py = Math.round(lerp(y1, y2, t));
        g.fillStyle = cs(hex('#43321f')); g.fillRect(px - 1, py - 2, 3, 13);
        g.fillStyle = cs(hex('#5a4530')); g.fillRect(px - 1, py - 2, 1, 13);
      }
    };
    rail(x - 7, y - 6, x - 7, y + h + 6);
    rail(x + w + 7, y - 6, x + w + 7, y + h + 6);
    rail(x - 7, y + h + 6, x + w + 7, y + h + 6);
  }

  function drawSigns(g) {
    const exits = vm?.exits ?? [];
    const n = Math.min(exits.length, 4);
    for (let i = 0; i < n; i++) {
      const x = 388 + i * 62, y = 338;
      g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(x - 1, y - 1, 4, 2);
      g.fillStyle = cs(hex('#4a3826')); g.fillRect(x, y - 20, 3, 20);
      g.fillStyle = cs(hex('#6a5238')); g.fillRect(x - 8, y - 24, 19, 8);
      g.fillStyle = cs(hex('#3e2c1a')); g.fillRect(x - 8, y - 24, 19, 1);
      g.fillStyle = 'rgba(40,30,20,0.55)';
      g.fillRect(x - 5, y - 21, 11, 1);
    }
  }

  /* ================= 9. 树 ================= */

  const LOBES = [
    { x: -0.30, y: -0.06, s: 0.64 }, { x: 0.30, y: -0.14, s: 0.56 }, { x: 0.04, y: 0.30, s: 0.52 },
    { x: -0.12, y: -0.44, s: 0.46 }, { x: 0.18, y: 0.46, s: 0.40 }, { x: -0.44, y: 0.26, s: 0.38 },
    { x: 0.42, y: 0.28, s: 0.34 },
  ];

  function buildTrees() {
    const g = PRP.g;
    for (const t of TREES) {
      for (let i = 0; i < 20; i++) {
        const w = t.r * 2.0 * (1 - i / 21);
        g.fillStyle = `rgba(0,0,0,${0.26 - i * 0.011})`;
        g.fillRect(t.x - w / 2 + 12, t.y - 4 + i * 2, w, 2);
      }
      const tw = Math.max(7, Math.round(t.h * 0.09));
      const trunkH = Math.round(t.h * 0.56);
      for (let k = 0; k < trunkH; k++) {
        const w = Math.round(tw * (1 - (k / trunkH) * 0.45));
        g.fillStyle = cs(hex('#3a2c20'));
        g.fillRect(t.x - (w >> 1), t.y - k, w, 1);
        g.fillStyle = cs(hex('#4e3a28'));
        g.fillRect(t.x - (w >> 1), t.y - k, 2, 1);
        g.fillStyle = cs(hex('#291e15'));
        g.fillRect(t.x + (w >> 1) - 2, t.y - k, 2, 1);
      }
      g.strokeStyle = cs(hex('#3a2c20'));
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(t.x, t.y - trunkH * 0.70);
      g.lineTo(t.x - t.r * 0.52, t.y - trunkH * 0.70 - t.r * 0.36);
      g.stroke();
      g.beginPath();
      g.moveTo(t.x + 1, t.y - trunkH * 0.84);
      g.lineTo(t.x + t.r * 0.46, t.y - trunkH * 0.84 - t.r * 0.30);
      g.stroke();
    }

    const c = CAN.g;
    c.clearRect(0, 0, W, H);
    const leaf = hex(season.leaf);
    const shades = [
      mixc(leaf, [0, 0, 0], 0.86), mixc(leaf, [0, 0, 0], 0.72), mixc(leaf, [0, 0, 0], 0.56),
      mixc(leaf, [0, 0, 0], 0.38), mixc(leaf, [0, 0, 0], 0.18), mixc(leaf, [255, 255, 255], 0.12),
    ];
    for (const t of TREES) {
      const r = t.r, cx = t.x, cy = t.cy;
      for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
        let depth = 0;
        for (const L of LOBES) {
          const rr = L.s * r, dd = Math.hypot(dx - L.x * r, dy - L.y * r);
          if (dd < rr) depth = Math.max(depth, 1 - dd / rr);
        }
        if (depth <= 0) continue;
        const nz = vnoise(cx + dx * 2.0, cy + dy * 2.0, 9, 9);
        if (depth < 0.12 && nz < 0.50) continue;
        const clump = vnoise(cx + dx * 0.9, cy + dy * 0.9, 7, 17);
        const fine = vnoise(cx + dx * 3.2, cy + dy * 3.2, 4, 29);
        if (fine < 0.17 && depth < 0.72) continue;
        let lit = 0.38 + (dx * -0.42 + dy * -0.95) / r * 0.80 + (clump - 0.5) * 0.42 + (fine - 0.5) * 0.30 + depth * 0.14;
        lit = clamp((lit - 0.5) * 1.45 + 0.5, 0, 1);
        let idx = Math.min(5, Math.floor(lit * 6));
        if (depth < 0.13) idx = 0;
        c.fillStyle = cs(shades[idx]);
        c.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
  }

  /* ================= 10. 角色 ================= */

  const SKIN = hex('#d9a982');
  const SKIN_D = hex('#b07f5e');
  const HAIRS = [hex('#7a3b22'), hex('#3a2a1e'), hex('#8a5a2a'), hex('#2e2620'), hex('#6b4a2a')];
  const SHIRTS = [hex('#d8cfb8'), hex('#a34a38'), hex('#3d5c78'), hex('#7a6a3e'), hex('#5c4a6a'), hex('#4a6a52')];
  const VESTS = [hex('#3d5236'), hex('#4a3a2a'), hex('#2e3a48'), hex('#5a4a3a'), hex('#3a4a44')];
  const PANTS = [hex('#3a4438'), hex('#4a4238'), hex('#333a44'), hex('#443a30')];

  /* 外观按 id 定死：同一个人每次都长一样，不随刷新变。
     玩家用参考图那套：米白衬衫 + 墨绿背心 + 赤褐长发。 */
  function lookFor(id, isPlayer) {
    if (isPlayer) {
      return { hair: hex('#7a3b22'), shirt: hex('#e2dac6'), vest: hex('#3d5236'), pants: hex('#3a4438') };
    }
    let n = 0;
    const key = String(id ?? '');
    for (let i = 0; i < key.length; i++) n = (Math.imul(n, 31) + key.charCodeAt(i)) | 0;
    n = Math.abs(n);
    return {
      hair: HAIRS[n % HAIRS.length],
      shirt: SHIRTS[(n >> 3) % SHIRTS.length],
      vest: VESTS[(n >> 6) % VESTS.length],
      pants: PANTS[(n >> 9) % PANTS.length],
    };
  }

  /* 29px 高：头 7、颈 2、躯干 10、腿 9、靴 3。
     四肢分开画，手臂垂在身侧，长发过肩——不是"彩色胶囊"。 */
  function drawPerson(g, x, y, look, phase, work) {
    x = Math.round(x); y = Math.round(y);
    const bob = work ? Math.round(Math.sin(phase * 1.8) * 1.2) : Math.round(Math.sin(phase * 0.9) * 0.6);
    const step = Math.sin(phase) > 0 ? 1 : 0;
    const sh = look.shirt, ve = look.vest, pa = look.pants, ha = look.hair;

    g.fillStyle = 'rgba(0,0,0,0.24)';
    g.fillRect(x - 5, y - 2, 11, 3);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.fillRect(x - 6, y + 1, 13, 2);

    g.fillStyle = cs(hex('#241c14'));
    g.fillRect(x - 4, y - 3 + (step ? 0 : 1), 3, 3);
    g.fillRect(x + 1, y - 3 + (step ? 1 : 0), 3, 3);

    g.fillStyle = cs(pa);
    g.fillRect(x - 4, y - 12, 3, 9);
    g.fillRect(x + 1, y - 12, 3, 9);
    g.fillStyle = cs(mixc(pa, [0, 0, 0], 0.32));
    g.fillRect(x - 4, y - 12, 1, 9);
    g.fillRect(x + 1, y - 12, 1, 9);

    g.fillStyle = cs(sh);
    g.fillRect(x - 4, y - 21 + bob, 9, 10);
    g.fillStyle = cs(mixc(sh, [0, 0, 0], 0.16));
    g.fillRect(x + 3, y - 21 + bob, 2, 10);
    g.fillStyle = cs(mixc(sh, [255, 255, 255], 0.14));
    g.fillRect(x - 4, y - 21 + bob, 1, 10);

    g.fillStyle = cs(ve);
    g.fillRect(x - 3, y - 19 + bob, 7, 8);
    g.fillRect(x - 4, y - 19 + bob, 1, 6);
    g.fillRect(x + 4, y - 19 + bob, 1, 6);
    g.fillStyle = cs(mixc(ve, [255, 255, 255], 0.10));
    g.fillRect(x - 3, y - 19 + bob, 7, 1);
    g.fillStyle = cs(sh);
    g.fillRect(x - 1, y - 19 + bob, 2, 8);

    g.fillStyle = cs(hex('#4a3a28'));
    g.fillRect(x - 4, y - 12 + bob, 9, 1);

    g.fillStyle = cs(sh);
    g.fillRect(x - 6, y - 20 + bob, 2, 7);
    g.fillRect(x + 4, y - 20 + bob, 2, 7);
    g.fillStyle = cs(mixc(sh, [0, 0, 0], 0.22));
    g.fillRect(x - 6, y - 20 + bob, 1, 7);
    g.fillRect(x + 5, y - 20 + bob, 1, 7);
    g.fillStyle = cs(SKIN);
    g.fillRect(x - 6, y - 13 + bob, 2, 2);
    g.fillRect(x + 4, y - 13 + bob, 2, 2);

    g.fillStyle = cs(SKIN_D);
    g.fillRect(x - 1, y - 22 + bob, 3, 2);

    g.fillStyle = cs(SKIN);
    g.fillRect(x - 3, y - 28 + bob, 7, 7);
    g.fillStyle = cs(SKIN_D);
    g.fillRect(x - 3, y - 22 + bob, 7, 1);
    g.fillRect(x - 3, y - 26 + bob, 1, 3);
    g.fillStyle = cs(hex('#2a2018'));
    g.fillRect(x - 2, y - 25 + bob, 1, 1);
    g.fillRect(x + 2, y - 25 + bob, 1, 1);

    g.fillStyle = cs(ha);
    g.fillRect(x - 3, y - 29 + bob, 7, 4);
    g.fillRect(x - 4, y - 27 + bob, 1, 8);
    g.fillRect(x + 4, y - 27 + bob, 1, 8);
    g.fillRect(x - 4, y - 21 + bob, 2, 2);
    g.fillRect(x + 3, y - 21 + bob, 2, 2);
    g.fillStyle = cs(mixc(ha, [255, 255, 255], 0.24));
    g.fillRect(x - 2, y - 29 + bob, 3, 1);
    g.fillRect(x - 4, y - 27 + bob, 1, 3);
  }

  function drawDog(g, x, y, phase) {
    x = Math.round(x); y = Math.round(y);
    const bob = Math.round(Math.sin(phase * 2) * 0.6);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 6, y - 1, 13, 2);
    g.fillStyle = cs(hex('#8a6a3e'));
    g.fillRect(x - 5, y - 7 + bob, 11, 5);
    g.fillRect(x + 5, y - 10 + bob, 5, 5);
    g.fillStyle = cs(hex('#a8844e'));
    g.fillRect(x - 5, y - 7 + bob, 11, 2);
    g.fillStyle = cs(hex('#5f4a28'));
    g.fillRect(x - 4, y - 2, 2, 2); g.fillRect(x + 2, y - 2, 2, 2);
    g.fillRect(x + 9, y - 10 + bob, 2, 2);
  }

  function drawActors(g, t) {
    const people = vm?.people ?? [];
    const list = [];
    const n = Math.max(1, people.length);
    people.forEach((p, i) => {
      const spread = 30;
      const x = 300 + (i - (n - 1) / 2) * spread;
      const y = 246 + ((i % 2) ? 10 : 0);
      list.push({ x, y, look: lookFor(p.id, false), phase: t * 0.9 + i * 1.7, work: p.atWork, dog: false });
    });
    list.push({ x: 306, y: 272, look: lookFor(vm?.player?.id, true), phase: t * 1.2, work: false, dog: false });
    if ((vm?.animals ?? []).length) {
      list.push({ x: 266, y: 278, phase: t * 2.2, dog: true });
    }
    list.sort((a, b) => a.y - b.y);
    for (const a of list) {
      if (a.dog) drawDog(g, a.x, a.y, a.phase);
      else drawPerson(g, a.x, a.y, a.look, a.phase, a.work);
    }
  }

  /* ================= 11. 大气 ================= */

  const FOG = document.createElement('canvas');
  FOG.width = 320; FOG.height = 180;
  (() => {
    const g = FOG.getContext('2d');
    const im = g.createImageData(320, 180);
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
      const v = vnoise(x, y, 34, 91) * 0.6 + vnoise(x, y, 12, 93) * 0.4;
      const a = clamp((v - 0.42) * 2.8, 0, 1) * (0.25 + 0.75 * (1 - y / 180));
      const i = (y * 320 + x) * 4;
      im.data[i] = 226; im.data[i + 1] = 230; im.data[i + 2] = 222;
      im.data[i + 3] = a * 255;
    }
    g.putImageData(im, 0, 0);
  })();

  const GRAIN = document.createElement('canvas');
  GRAIN.width = 160; GRAIN.height = 90;
  (() => {
    const g = GRAIN.getContext('2d');
    const im = g.createImageData(160, 90);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.random() * 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  })();

  const drops = [];
  for (let i = 0; i < 170; i++) {
    drops.push({ x: Math.random() * W, y: Math.random() * H, s: 150 + Math.random() * 170, l: 7 + Math.random() * 9 });
  }
  const flakes = [];
  for (let i = 0; i < 130; i++) {
    flakes.push({ x: Math.random() * W, y: Math.random() * H, s: 8 + Math.random() * 20, a: 1 + Math.random() * 3, p: Math.random() * 6.28 });
  }

  function atmosphere(t) {
    const light = vm?.light ?? 0.35;
    const warm = clamp(1 - light * 1.15, 0, 1);
    if (sky === 'fog' || light < 0.45) {
      vctx.globalCompositeOperation = 'multiply';
      vctx.globalAlpha = clamp((0.42 - light) * 0.9, 0, 0.32);
      vctx.fillStyle = '#8a6a52';
      vctx.fillRect(0, 0, W, H);
      vctx.globalAlpha = 1;
      vctx.globalCompositeOperation = 'source-over';
    }
    if (light < 0.6) {
      vctx.globalCompositeOperation = 'lighter';
      const g = vctx.createRadialGradient(150, -40, 20, 150, -40, 620);
      g.addColorStop(0, `rgba(255,214,150,${0.10 + warm * 0.12})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      vctx.fillStyle = g; vctx.fillRect(0, 0, W, H);
      vctx.globalCompositeOperation = 'source-over';
    }

    const fogAmt = sky === 'fog' ? 0.42 : (season.snow ? 0.16 : 0.06);
    vctx.globalAlpha = fogAmt;
    const ox = (t * 9) % 640;
    vctx.drawImage(FOG, ox - 640, 0, 640, 360);
    vctx.drawImage(FOG, ox, 0, 640, 360);
    vctx.globalAlpha = 1;

    if (sky === 'rain') {
      vctx.strokeStyle = 'rgba(200,216,232,0.40)';
      vctx.lineWidth = 1;
      vctx.beginPath();
      for (const d of drops) {
        const y = ((d.y + t * d.s) % (H + 40)) - 20;
        vctx.moveTo(d.x, y); vctx.lineTo(d.x - 3, y + d.l);
      }
      vctx.stroke();
      vctx.fillStyle = 'rgba(80,100,120,0.10)'; vctx.fillRect(0, 0, W, H);
    }
    if (sky === 'snow') {
      vctx.fillStyle = 'rgba(236,240,244,0.62)';
      for (const f of flakes) {
        const y = ((f.y + t * f.s) % (H + 20)) - 10;
        const x = f.x + Math.sin(t * 0.7 + f.p) * f.a * 4;
        vctx.fillRect(x, y, 2, 2);
      }
    }

    vctx.globalAlpha = 0.045;
    vctx.globalCompositeOperation = 'overlay';
    vctx.drawImage(GRAIN, 0, 0, W, H);
    vctx.globalAlpha = 1;
    vctx.globalCompositeOperation = 'source-over';

    const vg = vctx.createRadialGradient(W / 2, H * 0.44, 150, W / 2, H * 0.44, 470);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    vctx.fillStyle = vg; vctx.fillRect(0, 0, W, H);
  }

  /* ================= 12. 组装 ================= */

  function rebuild(vmNext) {
    const prevPlace = vm?.place?.id, prevSeason = vm?.clock?.season;
    vm = vmNext;
    layout = layoutFor(vm.place.id);
    season = SEASONS[vm.clock.season] ?? SEASONS.春;
    sky = skyOf(vm.weather);
    TREES = planTrees(layout.trees);
    const sameScene = prevPlace === vm.place.id && prevSeason === vm.clock.season;
    if (sameScene) return false;
    buildTerrain();
    buildDetail();
    PRP.g.clearRect(0, 0, W, H);
    if (layout.build === 'house') { drawHouse(PRP.g); drawWell(PRP.g); }
    else if (layout.build === 'long') drawLonghouse(PRP.g);
    else if (layout.build === 'hut' || layout.build === 'hearth') drawHut(PRP.g);
    if (layout.garden) drawGardenFence(PRP.g);
    buildTrees();
    return true;
  }

  let lastT = 0;
  function frame(now) {
    const t = now / 1000;
    if (vm) {
      vctx.clearRect(0, 0, W, H);
      vctx.drawImage(TER.c, 0, 0);
      vctx.drawImage(DET.c, 0, 0);
      vctx.drawImage(PRP.c, 0, 0);
      drawProps(vctx);
      drawSigns(vctx);
      drawActors(vctx, t);
      vctx.drawImage(CAN.c, 0, 0);
      atmosphere(t);
    }
    requestAnimationFrame(frame);
  }

  /* ================= 13. HUD ================= */

  function paintHud() {
    const c = vm.clock;
    document.getElementById('hudPlace').textContent = vm.place.name;
    document.getElementById('hudMeta').textContent =
      `${c.year}年 ${c.monthOfYear}月${c.dayOfMonth}日 · ${c.season} · ${vm.weather.sky} · 第${c.day}天`;
    const people = vm.people;
    document.getElementById('hudPeople').innerHTML = people.length
      ? `<div class="row"><b>在场</b><span class="tag">${people.length} 人</span></div>` +
        people.map((p) => `<div class="row"><span>${p.name}</span><span class="tag">${p.atWork ? '在干活' : '在此'}</span></div>`).join('')
      : `<div class="row"><b>在场</b><span class="tag">只有你</span></div>`;
    const exits = vm.exits;
    document.getElementById('hudExits').innerHTML = exits.length
      ? `<div class="row"><span class="n">可以去的方向</span></div>` +
        exits.slice(0, 4).map((e) => `<div class="row"><span class="n">${e.name}</span><span class="c">${e.days} 天</span></div>`).join('')
      : `<div class="row"><span class="c">附近没有可去的地方</span></div>`;
  }

  async function refresh() {
    const banner = document.getElementById('banner');
    try {
      const state = await fetchState();
      const next = toSceneVM(state);
      const changed = rebuild(next);
      paintHud();
      banner.hidden = true;
      if (changed) console.log('[pixel-scene] 场景已重建', next.place.id, next.clock.season);
    } catch (err) {
      banner.hidden = false;
      banner.textContent = '读不到 /api/state（' + err.message + '）：请用 npm run web 打开本页';
      if (!vm) {
        const demo = {
          settlement: {
            placeId: 'place:yard', placeName: '河岸台地（离线示例）', spaceName: '主屋寝处',
            season: '冬', day: 5760, weather: { sky: '雪' },
            neighbours: [{ id: 'a', name: '陶婶', acquaintance: 'known', atWork: true, contact: '相识' }],
            objects: [{ id: 'o1', name: '陶罐', prototypeId: 'prototype:jar', visible: true }],
            exits: [{ placeId: 'place:river', name: '河边取水点', costDays: 1 }],
            dailyActivity: { used: 2, capacity: 8 },
          },
          clock: { day: 5760, dayOfMonth: 1, monthOfYear: 1, season: '冬', eraYear: -2053 },
          character: { id: 'modern:e1', name: '启 禾', age: 16 },
        };
        rebuild(toSceneVM(demo));
        paintHud();
      }
    }
  }

  document.getElementById('btnRefresh').addEventListener('click', refresh);
  refresh();
  requestAnimationFrame(frame);
})();
