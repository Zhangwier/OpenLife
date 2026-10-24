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

  /* 色板（A2）：底色一律低饱和橄榄绿 / 苔绿 / 泥褐 / 灰黄，HSL 饱和度 13%–34%，
     高饱和只留给秋叶、小花、窗光这些点缀。每个季节 8 阶：0–1 是土里的暗部（块面，不是描边），
     4–7 是草面受光。lip 是路缘新草的高光（比草地亮、偏黄，A6 用）。
     hue 落在 76°–110°，把"发闷的灰"换成有呼吸的橄榄绿；冬天刻意留低饱和（S≈15）压成灰绿。 */
  const SEASONS = {
    // 亮部刻意压向泥褐/灰黄，不走向荧光鲜绿；hue 落在 60°–95°，S≈12–28%
    春: {
      grass: ['#232b1c', '#2e3823', '#3a452b', '#455232', '#515f3b', '#5c6b45', '#68774f', '#738359'],
      lip: '#9aa765', stem: '#46542c', haze: '#a3a87f',
      flower: 1.0, snow: 0, leaf: '#566238', accent: '#d8c04a',
    },
    夏: {
      grass: ['#1d2718', '#27351f', '#324327', '#3c5030', '#475e38', '#516a40', '#5c7749', '#668351'],
      lip: '#8f9c5c', stem: '#3c4a26', haze: '#97a074',
      flower: 0.5, snow: 0, leaf: '#4d5936', accent: '#d8c04a',
    },
    秋: {
      grass: ['#282a1b', '#333623', '#3f422c', '#4a4e34', '#565a3d', '#616545', '#6d704e', '#787c57'],
      lip: '#a09f60', stem: '#4c462a', haze: '#ada37f',
      flower: 0.3, snow: 0, leaf: '#66603c', accent: '#c8862e',
    },
    冬: {
      grass: ['#232a20', '#2d3527', '#37402f', '#414b37', '#4a5540', '#546048', '#5d6a50', '#677458'],
      lip: '#7f8f63', stem: '#383e30', haze: '#b5baae',
      flower: 0.05, snow: 1, leaf: '#4a523e', accent: '#d8c04a',
    },
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

  /* 树站位分三团：左上、右上、前景。同团的树互相挨着，树冠会咬合成一条树线，
     而不是一圈彼此分开的圆球。r 是单个树冠半径（直径 110–140px @640×360）。 */
  const TREE_SLOTS = [
    { x: 18, y: 168, h: 152, r: 64 },   // 左上团，由外向内递减
    { x: 88, y: 152, h: 126, r: 54 },
    { x: 154, y: 134, h: 104, r: 44 },
    { x: 470, y: 160, h: 136, r: 60 },  // 右上团
    { x: 542, y: 182, h: 110, r: 48 },
    { x: 610, y: 200, h: 120, r: 52 },
    { x: 34, y: 370, h: 134, r: 60 },   // 前景：压住左下角
    { x: 408, y: 360, h: 108, r: 48 },  // 前景：压下沿中右，避开人物站位
  ];
  /* 取树顺序左右交替：布局只要 4 棵时两边也各有一团，不会只剩半边。 */
  const TREE_PICK = [0, 3, 1, 4, 6, 7, 5, 2];

  function planTrees(n) {
    const count = clamp(n | 0, 0, TREE_PICK.length);
    return TREE_PICK.slice(0, count).map((slot) => {
      const t = TREE_SLOTS[slot];
      return {
        x: t.x, y: t.y, h: t.h, r: t.r,
        cy: t.y - Math.round(t.h * 0.62),
        seed: 8100 + slot * 97,
      };
    });
  }

  /* ================= 5. 地形 ================= */

  /* A7 三段纵深：远景（画面上部）带雾、明度抬高、饱和度压低；中景（中部）最亮，是视线焦点；
     前景（下缘与左右边缘）压暗，让画面被"压住"。地形层先算好这张明暗场，
     建筑与树随后按同一套数值走，避免各画各的。 */
  function depthField(x, y) {
    const ny = y / H, nx = x / W;
    const far = clamp((0.42 - ny) / 0.42, 0, 1);                 // 远景权重 0 底部 → 1 顶部
    const fore = clamp((ny - 0.64) / 0.36, 0, 1);                // 前景权重
    const edge = clamp((Math.abs(nx - 0.5) - 0.36) / 0.14, 0, 1); // 左右边缘
    const mid = Math.max(0, 1 - far * 0.95 - fore * 1.15) * (1 - edge * 0.5);
    return { far: far, fore: fore, edge: edge, mid: mid };
  }

  /* A6 路缘不规则的"啃豁口"场：多层噪声叠加，再叠一块块小凹陷，
     让土路边不是一圈平滑弧线，而是被草啃过的碎片边缘。 */
  function pathRadius(x, y) {
    const wob = (vnoise(x, y, 27, 131) - 0.5) * 7.0 + (vnoise(x, y, 9, 132) - 0.5) * 4.2
      + (vnoise(x, y, 4, 133) - 0.5) * 2.0;
    const bite = vnoise(x, y, 13, 134);
    const chew = bite > 0.63 ? (bite - 0.63) * 26 : 0;
    return 15 + wob - chew;
  }

  const P_DIRT = [hex('#503e2b'), hex('#604b34'), hex('#71583d'), hex('#816546'), hex('#957550')];
  const P_SOIL = [hex('#33281a'), hex('#3f3223'), hex('#4b3d2b')];
  const P_WATER = [hex('#2b403e'), hex('#374e4a'), hex('#435a55'), hex('#506660')];
  const P_WATER_GLINT = hex('#8fa29a');
  const P_SAND = hex('#6a5942');

  /* 草地底色值：地形与草叶共用一套，草叶才不会在亮地上撒"黑毛"。
     中景最亮、远景抬明度、前景压暗都在这里一次算完（A7）。 */
  function grassT(x, y, df) {
    const low = vnoise(x, y, 150, 5) * 0.42 + vnoise(x, y, 52, 11) * 0.33
      + vnoise(x, y, 16, 23) * 0.18 + vnoise(x, y, 5, 29) * 0.07;
    const d = df ?? depthField(x, y);
    return clamp(low * 0.86 + 0.10 + d.mid * 0.16 - d.far * 0.10 - d.fore * 0.12, 0, 1);
  }

  function buildTerrain() {
    const img = TER.g.createImageData(W, H), d = img.data;
    mask = new Uint8Array(W * H);
    const G = season.grass.map(hex);
    const LIP = hex(season.lip);
    const HAZE = hex(season.haze);
    const snow = season.snow;

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const df = depthField(x, y);
      const t = grassT(x, y, df);
      let col = ramp(G, t);
      let mk = 0;

      if (layout.garden && x >= GARDEN.x && x < GARDEN.x + GARDEN.w && y >= GARDEN.y && y < GARDEN.y + GARDEN.h) {
        const ft = ((y - GARDEN.y) % 9) / 9;
        col = ft < 0.5 ? P_SOIL[0] : P_SOIL[1];
        col = mixc(col, P_SOIL[2], (vnoise(x, y, 5, 71) - 0.5) * 0.5 + 0.25);
        mk = 3;
      }

      const dp = Math.min(distToPoly(x, y, PATH), distToPoly(x, y, SPUR));
      const rad = pathRadius(x, y);
      const pw = 1 - clamp((dp - rad) / 3.2, 0, 1);   // 2–3px 硬边收口，不是一团糊
      if (pw > 0.002) {
        const dt = vnoise(x, y, 9, 41) * 0.55 + vnoise(x, y, 26, 42) * 0.45;
        let dc = ramp(P_DIRT, dt * 1.15 - 0.05);
        // 路肩压深成宽 ≥3px 的暗块（A1：靠块面区分，不勾线）
        if (pw < 0.80) dc = mixc(dc, P_DIRT[0], (0.80 - pw) * 0.75);
        col = mixc(col, dc, pw * 0.97);
        if (pw > 0.55) mk = 1;
      }
      // A6：紧贴路缘 2–3px 浅黄绿草边高光——比草地亮、偏黄，用噪声切成断续草芽，
      // 外侧再散几个单像素芽点，读成"草被踩秃后又冒出的新草"。
      if (dp > rad - 1.2 && dp < rad + 3.6) {
        const band = clamp((dp - (rad - 1.2)) / 4.8, 0, 1);
        const lit = (1 - band * 0.75) * (0.55 + vnoise(x, y, 6, 136) * 0.8);
        const dash = vnoise(x, y, 3, 137);
        if (dash > 0.26) col = mixc(col, LIP, clamp(lit * (snow ? 0.30 : 0.90), 0, 0.94));
        mk = pw > 0.55 ? 1 : 0;
      }

      if (layout.water) {
        // 水岸：先铺一圈土黄湿沙，再压水下暗块；水面色阶整体偏青灰绿（低饱和），
        // 靠"岸上亮沙 vs 水下暗面"的明暗差读深度，不勾线。
        const pd = Math.hypot(x - POND.x, (y - POND.y) * 1.06)
          + (vnoise(x, y, 28, 53) - 0.5) * 26 + (vnoise(x, y, 9, 54) - 0.5) * 12;
        const shore = 1 - clamp((pd - POND.r) / 15, 0, 1);
        if (shore > 0.002) {
          col = mixc(col, P_SAND, shore * 0.58);
          const wf = 1 - clamp((pd - (POND.r - 10)) / 9, 0, 1);
          if (wf > 0.002) {
            const wt = vnoise(x, y, 11, 61) * 0.7 + vnoise(x, y, 4, 62) * 0.3;
            col = mixc(col, ramp(P_WATER, wt), wf);
            // 水面细波纹：2px 横向亮条，稀疏，读成反光而不是噪点
            if (wf > 0.55 && vnoise(x, y, 9, 63) > 0.70 && (y & 3) === 0) {
              col = mixc(col, P_WATER_GLINT, 0.45 * wf);
            }
            if (wf > 0.5) mk = 2;
          }
        }
        // 岸线草边：一圈浅黄绿，把水与草地分开（同 A6 的路缘语言）
        if (pd > POND.r - 1 && pd < POND.r + 4) {
          const band = clamp((pd - (POND.r - 1)) / 5, 0, 1);
          const lit = (1 - band) * (0.5 + vnoise(x, y, 6, 138) * 0.8);
          if (vnoise(x, y, 3, 139) > 0.28) col = mixc(col, LIP, clamp(lit * 0.70, 0, 0.8));
        }
      }

      // 远景去饱和、提亮（雾）；前景压暗并偏冷；左右边缘轻微压暗
      if (df.far > 0.01) col = mixc(col, HAZE, df.far * 0.30);
      const lum = 1 + df.mid * 0.10 - df.fore * 0.20 - df.edge * 0.12;
      const gr = (h2(x, y, 3) - 0.5) * 0.10;
      d[i] = clamp(col[0] * lum * (1 + gr), 0, 255);
      d[i + 1] = clamp(col[1] * lum * (1 + gr), 0, 255);
      d[i + 2] = clamp(col[2] * lum * (1 + gr), 0, 255);
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
    const LIP = hex(season.lip);
    const STEM = hex(season.stem);
    const snow = season.snow;
    const near = (x, y, v) => Math.round(clamp(grassT(x, y) * (G.length - 1) + v, 0, G.length - 1));

    /* 草面块面：宽 ≥ 2px 的低对比色块，负责"草地不是均匀噪点" */
    for (let i = 0; i < 1100; i++) {
      const x = Math.floor(h2(i, 1, 301) * W), y = Math.floor(h2(i, 2, 301) * H);
      if (mask[y * W + x] !== 0) continue;
      const r = h2(i, 3, 301);
      const w = 3 + Math.floor(h2(i, 4, 301) * 5), hh = 2 + Math.floor(h2(i, 5, 301) * 3);
      g.fillStyle = ca(G[near(x, y, r < 0.5 ? -1.2 : -0.4)], 0.30);
      g.fillRect(x, y, w, hh);
      g.fillRect(x + 1, y - 1, Math.max(1, w - 2), hh + 1);
    }

    /* 草叶：每根都相对"脚下那一格的草地明度"取色（下方压 1 阶、受光尖端抬 1–2 阶），
       所以亮地上不会冒出黑毛，暗地上也不会浮白点。
       A9：草叶成片成簇（噪声门槛偏高），不是均匀撒满——草地主体是平整色块，草叶只是点缀。 */
    for (let i = 0; i < 6000; i++) {
      const x = Math.floor(h2(i, 1, 401) * W), y = Math.floor(h2(i, 2, 401) * H);
      if (mask[y * W + x] !== 0) continue;
      const dens = vnoise(x, y, 62, 411) * 0.62 + vnoise(x, y, 18, 412) * 0.38;
      if (h2(i, 3, 401) > dens * dens * dens * 1.7) continue;
      const r = h2(i, 4, 401);
      const hh = 2 + Math.floor(h2(i, 5, 401) * 4);
      const lean = r > 0.68 ? 1 : 0;
      const base = grassT(x, y) * (G.length - 1);          // 脚下草地所在阶
      const dark = Math.round(clamp(base - 1.1, 0, G.length - 1));
      const midc2 = Math.round(clamp(base - 0.2, 0, G.length - 1));
      const tip = Math.round(clamp(base + (r > 0.80 ? 1.8 : 1.1), 0, G.length - 1));
      g.fillStyle = cs(G[dark]);
      g.fillRect(x, y - 1, 1, 2);
      g.fillStyle = cs(G[midc2]);
      g.fillRect(x, y - hh, 1, hh - 1);
      g.fillStyle = cs(G[tip]);
      g.fillRect(x + lean, y - hh, 1, 2);
    }

    /* A6：路缘草芽。沿噪声在路肩撒断续的浅黄绿短草，把"草啃土路"的边做实 */
    for (let i = 0; i < 9000; i++) {
      const x = Math.floor(h2(i, 1, 611) * W), y = Math.floor(h2(i, 2, 611) * H);
      const dp = Math.min(distToPoly(x, y, PATH), distToPoly(x, y, SPUR));
      const rad = pathRadius(x, y);
      if (dp < rad || dp > rad + 6) continue;
      if (h2(i, 3, 611) > 0.55) continue;
      const hh = 1 + Math.floor(h2(i, 4, 611) * 3);
      g.fillStyle = cs(LIP);
      g.fillRect(x, y - hh, 1, hh);
      if (h2(i, 5, 611) > 0.62) g.fillStyle = cs(mixc(LIP, G[7], 0.45)), g.fillRect(x + 1, y - hh + 1, 1, hh - 1);
    }

    const flowerN = Math.round(620 * season.flower);
    for (let i = 0; i < flowerN; i++) {
      const x = Math.floor(h2(i, 1, 321) * W), y = Math.floor(h2(i, 2, 321) * H);
      if (mask[y * W + x] !== 0) continue;
      if (vnoise(x, y, 74, 331) < 0.62) continue;
      const r = h2(i, 3, 321);
      // 绝大多数是灰白小花，少数是 A2 里的黄点缀（单屏 <1.5%）
      g.fillStyle = cs(r < 0.90 ? [216, 216, 200] : hex(season.accent));
      g.fillRect(x, y, 1, 1);
      if (r < 0.55) { g.fillRect(x + 1, y, 1, 1); g.fillRect(x, y - 1, 1, 1); }
      if (r < 0.24) { g.fillRect(x + 1, y - 1, 1, 1); g.fillRect(x + 2, y, 1, 1); }
      g.fillStyle = cs(STEM); g.fillRect(x, y + 1, 1, 1);
    }

    /* 土路颗粒：暗点 + 亮点成对，形成"车辙碎石"而不是脏点 */
    const PEB_D = hex('#453828'), PEB_L = hex('#b6a584'), PEB_M = hex('#7a6a50');
    for (let i = 0; i < 2400; i++) {
      const x = Math.floor(h2(i, 5, 221) * W), y = Math.floor(h2(i, 6, 221) * H);
      if (mask[y * W + x] !== 1) continue;
      const r = h2(i, 7, 221);
      if (r < 0.42) { g.fillStyle = cs(PEB_D); g.fillRect(x, y, 1, 1); if (r < 0.12) g.fillRect(x + 1, y, 2, 1); }
      else if (r < 0.72) { g.fillStyle = cs(PEB_M); g.fillRect(x, y, 2, 1); }
      else { g.fillStyle = ca(PEB_L, 0.55); g.fillRect(x, y, 1, 1); }
    }

    for (let i = 0; i < 520; i++) {
      const x = Math.floor(h2(i, 8, 231) * W), y = Math.floor(h2(i, 9, 231) * H);
      if (!layout.water) break;
      if (mask[y * W + x] !== 2 && mask[y * W + x] !== 0) continue;
      const pd = Math.hypot(x - POND.x, (y - POND.y) * 1.06);
      if (pd > POND.r + 18 || pd < POND.r - 16) continue;
      g.fillStyle = cs(mixc(G[1], [0, 0, 0], 0.22));
      const hh = 4 + Math.floor(h2(i, 10, 231) * 6);
      g.fillRect(x, y - hh, 1, hh);
      g.fillStyle = cs(LIP); g.fillRect(x, y - hh, 1, 1);
    }

    if (layout.garden) {
      for (let gy = GARDEN.y + 5; gy < GARDEN.y + GARDEN.h - 3; gy += 9) {
        for (let gx = GARDEN.x + 6; gx < GARDEN.x + GARDEN.w - 4; gx += 8) {
          const r = h2(gx, gy, 241);
          g.fillStyle = cs(mixc(hex('#54632c'), hex('#78894a'), r));
          g.fillRect(gx, gy - 2, 1, 3); g.fillRect(gx + 1, gy - 3, 1, 2);
          g.fillStyle = cs(hex('#8b9c58')); g.fillRect(gx, gy - 3, 1, 1);
        }
      }
    }

    if (snow) {
      for (let i = 0; i < 1300; i++) {
        const x = Math.floor(h2(i, 1, 501) * W), y = Math.floor(h2(i, 2, 501) * H);
        if (mask[y * W + x] !== 0) continue;
        const n = vnoise(x, y, 30, 502);
        if (n < 0.64) continue;
        g.fillStyle = ca([226, 230, 228], 0.24 + n * 0.26);
        g.fillRect(x, y, 1, 1);
        if (n > 0.82) g.fillRect(x + 1, y, 1, 1);
      }
    }
  }

  /* ================= 7. 建筑 ================= */

  /* A1：建筑不用深色 1px 收边。收形全靠三块面——
     ① 朝光的墙（亮）② 背光的墙/柱（暗，宽 ≥3px 且带噪）③ 屋檐投下的影（宽 3px 的块）。
     深色只在"块面里最暗的一块"出现，并且宽度够，视觉上读成体积而不是描边。 */
  const WALL_LIT = hex('#8d8265');
  const WALL_MID = hex('#7a7054');
  const WALL_DARK = hex('#5c5340');
  const BEAM_C = hex('#4c4231');
  const BEAM_DARK = hex('#3b3326');
  const ROOF_HI = hex('#5c332a');
  const ROOF_MID = hex('#4a2822');
  const ROOF_LOW = hex('#3a1f1a');
  const WINDOW_LIT = hex('#d9ae63');

  /* 带噪的暗块：给暗部一点颗粒，避免读成一条直线 */
  function blockNoise(g, x, y, w, h, base, amp, seed) {
    g.fillStyle = cs(base);
    g.fillRect(x, y, w, h);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx += 2) {
        const n = h2(xx, yy, seed) - 0.5;
        if (Math.abs(n) < amp) continue;
        g.fillStyle = cs(mixc(base, n > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(n) * 0.5));
        g.fillRect(xx, yy, 2, 1);
      }
    }
  }

  /* 建筑按 w/h 的比例算内部尺寸：改 HOUSE 的宽高，门窗梁柱会跟着缩放，
     不用再逐行改数字。人物 24px 高时，门高 29、房高 82，约 4.2 个身高。 */
  function drawHouse(g) {
    const { x, y, w, h } = HOUSE;
    const roofH = Math.round(h * 0.32);
    const beam = Math.max(3, Math.round(w * 0.038));
    const baseH = Math.round(h * 0.12);
    const wallTop = y + Math.round(h * 0.10);
    const midY = Math.round(y + h * 0.52);

    // 投影：靠"地面上的一团暗块"把房子压在地上，不用勾边。
    // 影子按像素噪声啃边（不是硬矩形），落在右下方向，读出朝向。
    for (let yy = y + Math.round(h * 0.55); yy < y + h + 8; yy++) {
      const k = clamp((yy - (y + h * 0.55)) / (h * 0.55), 0, 1);
      const wNow = w * (0.92 + k * 0.16);
      const x0 = Math.round(x + Math.round(w * 0.10) + w * 0.02 + k * w * 0.05);
      for (let xx = x0; xx < x0 + wNow; xx += 2) {
        const n = vnoise(xx, yy, 7, 1251);
        if (n < 0.30 + k * 0.16) continue;
        g.fillStyle = `rgba(0,0,0,${(0.20 * (1 - k * 0.55)).toFixed(3)})`;
        g.fillRect(xx, yy, 2, 1);
      }
    }
    // 贴脚的一圈接触影：宽 4px 的暗块，是"最暗的一块"，不是描边
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(x - 5, y + h - 2, w + 10, 4);

    // 墙体：左 2/3 朝光（亮），右侧一条 ≥6px 的背光块（暗）——体积从这里读出来
    const shadeW = Math.max(6, Math.round(w * 0.16));
    g.fillStyle = cs(WALL_LIT);
    g.fillRect(x, wallTop, w, h - (wallTop - y));
    g.fillStyle = cs(WALL_MID);
    g.fillRect(x, wallTop, Math.round(w * 0.34), h - (wallTop - y));
    blockNoise(g, x + w - shadeW, wallTop, shadeW, h - (wallTop - y), WALL_DARK, 0.20, 1201);

    // 木板横纹：4px 的暗带（块面，不是线），带噪
    g.fillStyle = 'rgba(58,50,38,0.20)';
    for (let yy = wallTop + 9; yy < y + h - baseH; yy += 8) {
      for (let xx = x + 4; xx < x + w - 4; xx += 9) {
        g.fillRect(xx + (((yy / 8) | 0) % 2 ? 4 : 0), yy, 5, 4);
      }
    }

    // 梁柱：4px 宽的木色块，右侧再压 2px 暗面（不是 1px 描边）
    const cols = Math.max(3, Math.round(w / 34));
    for (let i = 0; i <= cols; i++) {
      const bx = x + Math.round((i * (w - beam)) / cols);
      g.fillStyle = cs(BEAM_C);
      g.fillRect(bx, wallTop, beam, h - (wallTop - y));
      g.fillStyle = cs(BEAM_DARK);
      g.fillRect(bx + beam - 2, wallTop, 2, h - (wallTop - y));
    }
    g.fillStyle = cs(BEAM_C);
    g.fillRect(x, wallTop, w, beam);
    g.fillRect(x + 2, midY, w - 4, 3);
    g.fillRect(x + 2, y + h - baseH - 3, w - 4, 3);
    for (let i = 0; i < cols - 1; i++) {
      const bx = x + Math.round((i * (w - beam)) / cols) + beam;
      g.beginPath();
      g.moveTo(bx, y + h - baseH - 3);
      g.lineTo(bx + Math.round((w - beam) / cols) - beam, midY);
      g.lineWidth = 3; g.strokeStyle = cs(BEAM_C); g.stroke();
    }

    // 石基：两阶明暗，靠块面区分
    for (let yy = y + h - baseH; yy < y + h; yy += 4) {
      for (let xx = x; xx < x + w; xx += 9) {
        g.fillStyle = cs(((yy / 4) | 0) % 2 ? hex('#5a5245') : hex('#4f483b'));
        g.fillRect(xx + (((yy / 4) | 0) % 2 ? 4 : 0), yy, 8, 4);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(x, y + h - baseH, w, 3);

    // 屋顶：三阶红棕块 + 横向瓦垄（4px 间距的暗块）
    const rx0 = x - Math.round(w * 0.08), rx1 = x + w + Math.round(w * 0.08);
    const ry0 = y - roofH, ry1 = y + Math.round(h * 0.14);
    for (let yy = ry0; yy < ry1; yy++) {
      const k = (yy - ry0) / (ry1 - ry0);
      const half = lerp((rx1 - rx0) * 0.30, (rx1 - rx0) * 0.5, k * k * 0.85 + k * 0.15);
      g.fillStyle = cs(mixc(ROOF_MID, ROOF_LOW, k * 0.85));
      g.fillRect(Math.round((rx0 + rx1) / 2 - half), yy, Math.round(half * 2), 1);
    }
    g.fillStyle = cs(ROOF_HI);
    for (let yy = ry0; yy < ry0 + Math.round(roofH * 0.34); yy++) {
      const k = (yy - ry0) / (ry1 - ry0);
      const half = lerp((rx1 - rx0) * 0.30, (rx1 - rx0) * 0.5, k * k * 0.85 + k * 0.15);
      g.fillRect(Math.round((rx0 + rx1) / 2 - half), yy, Math.round(half * 2), 1);
    }
    for (let yv = ry0 + 4; yv < ry1; yv += 5) {
      const k = (yv - ry0) / (ry1 - ry0);
      const half = lerp((rx1 - rx0) * 0.30, (rx1 - rx0) * 0.5, k * k * 0.85 + k * 0.15);
      g.fillStyle = 'rgba(30,17,13,0.40)';
      g.fillRect(Math.round((rx0 + rx1) / 2 - half), yv, Math.round(half * 2), 2);
    }
    // 檐下投影：3px 暗块压在墙上，屋顶和墙的分界靠它，不靠描边
    g.fillStyle = 'rgba(28,20,14,0.30)';
    g.fillRect(x - 1, ry1 - 1, w + 2, 4);
    // 屋脊高光
    g.fillStyle = cs(mixc(ROOF_HI, [255, 240, 220], 0.22));
    g.fillRect(Math.round((rx0 + rx1) / 2 - (rx1 - rx0) * 0.30), ry0, Math.round((rx1 - rx0) * 0.60), 2);

    // 烟囱：亮面 + 3px 暗面
    const chW = Math.round(w * 0.09);
    const chX = x + w - Math.round(w * 0.22);
    g.fillStyle = cs(hex('#6b5344'));
    g.fillRect(chX, ry0 - 10, chW, 18);
    g.fillStyle = cs(hex('#4a382e'));
    g.fillRect(chX + chW - 3, ry0 - 10, 3, 18);
    g.fillStyle = cs(hex('#7d6354'));
    g.fillRect(chX, ry0 - 10, chW, 2);

    // 窗：暖黄窗光（A2 点缀）+ 上沿 3px 暗块当窗楣，右侧 2px 暗面当窗框
    const winW = Math.round(w * 0.19), winH = Math.round(h * 0.28);
    const winY = y + Math.round(h * 0.30);
    for (const wx of [x + Math.round(w * 0.10), x + w - Math.round(w * 0.10) - winW]) {
      g.fillStyle = cs(WALL_DARK);
      g.fillRect(wx - 2, winY - 3, winW + 4, 4);
      g.fillRect(wx - 2, winY, 2, winH);
      g.fillRect(wx + winW, winY, 2, winH);
      g.fillStyle = cs(WINDOW_LIT);
      g.fillRect(wx, winY, winW, winH);
      g.fillStyle = cs(mixc(WINDOW_LIT, [255, 246, 220], 0.45));
      g.fillRect(wx + 1, winY + 1, winW - 2, Math.max(2, Math.round(winH * 0.22)));
      g.fillStyle = cs(mixc(WINDOW_LIT, [120, 86, 44], 0.42));
      g.fillRect(wx, winY + winH - 3, winW, 3);
      // 窗棂：3px 木色，不是 2px 深线
      g.fillStyle = cs(hex('#6a5334'));
      g.fillRect(wx + (winW >> 1) - 1, winY, 3, winH);
      g.fillRect(wx, winY + (winH >> 1) - 1, winW, 3);
      // 窗光外溢：下方 3px 暖色晕
      g.fillStyle = 'rgba(217,174,99,0.18)';
      g.fillRect(wx - 4, winY + winH + 2, winW + 8, 3);
    }

    // 门：门洞用宽 3px 的暗块收边，门扇两阶木色
    const doorW = Math.round(w * 0.13), doorH = Math.round(h * 0.40);
    const dx = x + Math.round((w - doorW) / 2), dy = y + h - doorH;
    g.fillStyle = cs(WALL_DARK);
    g.fillRect(dx - 3, dy - 3, doorW + 6, 3);
    g.fillRect(dx - 3, dy, 3, doorH);
    g.fillRect(dx + doorW, dy, 3, doorH);
    g.fillStyle = cs(hex('#6b4a30'));
    g.fillRect(dx, dy, doorW, doorH);
    g.fillStyle = cs(hex('#543823'));
    g.fillRect(dx + doorW - 3, dy, 3, doorH);
    g.fillStyle = 'rgba(40,26,16,0.45)';
    for (let xx = dx + 5; xx < dx + doorW - 4; xx += 5) g.fillRect(xx, dy + 1, 1, doorH - 2);
    g.fillStyle = cs(WINDOW_LIT);
    g.fillRect(dx + doorW - 5, dy + (doorH >> 1), 2, 2);
  }

  function drawHut(g) {
    const x = 268, y = 138, w = 104, h = 58;
    const roofH = Math.round(h * 0.34);
    g.fillStyle = 'rgba(0,0,0,0.19)';
    g.fillRect(x + 8, y + 20, w + 2, h - 8);
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(x + 2, y + h - 3, w + 6, 5);

    // 墙体：亮面 + 右侧 ≥8px 背光块
    g.fillStyle = cs(hex('#7d7358'));
    g.fillRect(x, y + 8, w, h - 8);
    g.fillStyle = cs(hex('#6a6149'));
    g.fillRect(x, y + 8, Math.round(w * 0.36), h - 8);
    blockNoise(g, x + w - 10, y + 8, 10, h - 8, hex('#544b3a'), 0.18, 1301);

    // 立柱：4px 木块 + 2px 暗侧
    for (let xx = x; xx < x + w - 4; xx += 26) {
      g.fillStyle = cs(BEAM_C);
      g.fillRect(xx, y + 8, 4, h - 8);
      g.fillStyle = cs(BEAM_DARK);
      g.fillRect(xx + 2, y + 8, 2, h - 8);
    }
    g.fillStyle = cs(BEAM_C);
    g.fillRect(x, y + 8, w, 4);

    // 屋檐：4 阶茅草色块，底部 3px 檐影
    for (let yy = y - roofH; yy < y + 12; yy++) {
      const k = (yy - (y - roofH)) / (roofH + 12);
      const half = lerp(w * 0.30, w * 0.56, k);
      g.fillStyle = cs(mixc(hex('#4d3a24'), hex('#372719'), k * 0.9));
      g.fillRect(Math.round(x + w / 2 - half), yy, Math.round(half * 2), 1);
    }
    for (let yy = y - roofH + 3; yy < y + 8; yy += 5) {
      const k = (yy - (y - roofH)) / (roofH + 12);
      const half = lerp(w * 0.30, w * 0.56, k);
      g.fillStyle = 'rgba(30,20,12,0.34)';
      g.fillRect(Math.round(x + w / 2 - half), yy, Math.round(half * 2), 2);
    }
    g.fillStyle = 'rgba(28,20,14,0.28)';
    g.fillRect(x, y + 8, w, 3);

    const doorW = 18, doorH = 28;
    const dhx = Math.round(x + w / 2 - doorW / 2);
    g.fillStyle = cs(WALL_DARK);
    g.fillRect(dhx - 3, y + h - doorH - 3, doorW + 6, 3);
    g.fillRect(dhx - 3, y + h - doorH, 3, doorH);
    g.fillRect(dhx + doorW, y + h - doorH, 3, doorH);
    g.fillStyle = cs(hex('#6b4a30'));
    g.fillRect(dhx, y + h - doorH, doorW, doorH);
    g.fillStyle = cs(hex('#543823'));
    g.fillRect(dhx + doorW - 3, y + h - doorH, 3, doorH);

    // 小窗：暖黄窗光 + 3px 窗楣
    g.fillStyle = cs(WALL_DARK);
    g.fillRect(x + 13, y + 21, 18, 4);
    g.fillStyle = cs(WINDOW_LIT);
    g.fillRect(x + 14, y + 24, 16, 11);
    g.fillStyle = cs(mixc(WINDOW_LIT, [255, 246, 220], 0.4));
    g.fillRect(x + 15, y + 25, 14, 4);
    g.fillStyle = cs(hex('#6a5334'));
    g.fillRect(x + 21, y + 24, 2, 11);
  }

  function drawWell(g) {
    const { x, y } = WELL, r = 16;
    g.fillStyle = 'rgba(0,0,0,0.17)';
    for (let i = 0; i < 6; i++) { const w = (r * 2 + 8) * (1 - i / 7); g.fillRect(x - w / 2 + 6, y + r * 0.44 + i * 2, w, 2); }

    // 井圈：石块靠明暗分块区分，外缘不再勾深线
    for (let yy = -11; yy <= 11; yy++) {
      for (let xx = -r - 1; xx <= r + 1; xx++) {
        const d = Math.hypot(xx, yy * 1.55);
        if (d > r + 1) continue;
        if (d > r - 7 && d <= r + 1) {
          const sh = 0.28 + 0.72 * (xx + r) / (2 * r);
          let c = mixc(hex('#4d4639'), hex('#8b8474'), sh);
          const nz = vnoise(x + xx, y + yy, 3, 1401);
          if ((Math.floor((xx + r) / 5) + Math.floor((yy + 12) / 5)) % 2) c = mixc(c, hex('#3a352c'), 0.22 + nz * 0.10);
          g.fillStyle = cs(c); g.fillRect(x + xx, y + yy, 1, 1);
        } else {
          g.fillStyle = cs(mixc(hex('#232c2a'), hex('#2e3936'), (xx + r) / (2 * r)));
          g.fillRect(x + xx, y + yy, 1, 1);
        }
      }
    }
    // 井口内侧的 2px 暗环：宽度够，读成深度而不是描边
    for (let yy = -7; yy <= 7; yy++) {
      const hw = Math.round((r - 7) * Math.sqrt(Math.max(0, 1 - (yy * yy) / 60)));
      g.fillStyle = cs(hex('#2b3634')); g.fillRect(x - hw, y + yy, hw * 2, 1);
    }

    const top = y - 18;
    g.fillStyle = cs(hex('#5e4a32'));
    g.fillRect(x - r + 3, top + 6, 4, 15); g.fillRect(x + r - 8, top + 6, 4, 15);
    g.fillStyle = cs(hex('#43321f'));
    g.fillRect(x - r + 5, top + 6, 2, 15); g.fillRect(x + r - 6, top + 6, 2, 15);
    for (let i = 0; i < 7; i++) {
      const w = (r * 2 + 4) * (1 - Math.abs(i - 3) / 4.6);
      g.fillStyle = cs(mixc(hex('#4a2822'), hex('#6b3a2c'), i / 7));
      g.fillRect(Math.round(x - w / 2), top + i, Math.round(w), 1);
    }
    g.fillStyle = 'rgba(24,14,10,0.35)';
    g.fillRect(Math.round(x - (r - 2)), top + 5, Math.round((r - 2) * 2), 2);
    g.fillStyle = cs(hex('#3a2a1c')); g.fillRect(x - 1, top + 9, 2, 6);
    g.fillStyle = cs(hex('#7a5a38')); g.fillRect(x - 4, top + 13, 8, 5);
    g.fillStyle = cs(hex('#8d6a42')); g.fillRect(x - 4, top + 13, 8, 2);
  }

  function drawLonghouse(g) {
    const x = 206, y = 122, w = 228, h = 68;
    const roofH = Math.round(h * 0.40);
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.fillRect(x + 12, y + 22, w + 2, h - 8);
    g.fillStyle = 'rgba(0,0,0,0.26)';
    g.fillRect(x + 4, y + h - 3, w + 8, 5);

    g.fillStyle = cs(hex('#837755'));
    g.fillRect(x, y + 10, w, h - 10);
    g.fillStyle = cs(hex('#6f6448'));
    g.fillRect(x, y + 10, Math.round(w * 0.28), h - 10);
    blockNoise(g, x + w - 14, y + 10, 14, h - 10, hex('#564c39'), 0.18, 1501);

    for (let xx = x; xx < x + w - 5; xx += 24) {
      g.fillStyle = cs(BEAM_C);
      g.fillRect(xx, y + 10, 5, h - 10);
      g.fillStyle = cs(BEAM_DARK);
      g.fillRect(xx + 3, y + 10, 2, h - 10);
    }
    g.fillStyle = cs(BEAM_C);
    g.fillRect(x, y + 10, w, 5);

    for (let yy = y - roofH; yy < y + 12; yy++) {
      const k = (yy - (y - roofH)) / (roofH + 12);
      const half = lerp(w * 0.34, w * 0.55, k);
      g.fillStyle = cs(mixc(hex('#4a2822'), hex('#33191a'), k * 0.9));
      g.fillRect(Math.round(x + w / 2 - half), yy, Math.round(half * 2), 1);
    }
    for (let yv = y - roofH + 4; yv < y + 10; yv += 5) {
      const k = (yv - (y - roofH)) / (roofH + 12);
      const half = lerp(w * 0.34, w * 0.55, k);
      g.fillStyle = 'rgba(28,15,14,0.42)';
      g.fillRect(Math.round(x + w / 2 - half), yv, Math.round(half * 2), 2);
    }
    g.fillStyle = 'rgba(26,17,14,0.30)';
    g.fillRect(x, y + 10, w, 3);

    for (const dx of [x + w / 2 - 56, x + w / 2 + 34]) {
      g.fillStyle = cs(hex('#453423'));
      g.fillRect(dx, y + h - 30, 22, 30);
      g.fillStyle = cs(hex('#33261a'));
      g.fillRect(dx + 19, y + h - 30, 3, 30);
      g.fillStyle = 'rgba(24,16,10,0.28)';
      g.fillRect(dx, y + h - 30, 22, 3);
    }
    g.fillStyle = cs(WINDOW_LIT);
    g.fillRect(x + w / 2 - 14, y + 33, 28, 18);
    g.fillStyle = cs(mixc(WINDOW_LIT, [255, 246, 220], 0.42));
    g.fillRect(x + w / 2 - 13, y + 34, 26, 5);
    g.fillStyle = cs(hex('#6a5334'));
    g.fillRect(x + w / 2 - 1, y + 33, 3, 18);
  }


  /* A1：器物同样去掉 1px 黑描边。每个物件都是"亮面 + 暗面 ≥2px"两块，
     投影用地面上的一小团暗块表示落地，不用外圈勾线。 */
  const PROP_SPRITES = {
    jar: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 4, y + 1, 11, 2);
      g.fillStyle = cs(hex('#8a6a4a')); g.fillRect(x - 3, y - 8, 8, 9);
      g.fillStyle = cs(hex('#a5825c')); g.fillRect(x - 3, y - 8, 3, 9);
      g.fillStyle = cs(hex('#6b4d32')); g.fillRect(x + 1, y - 8, 4, 9);
      g.fillStyle = cs(hex('#7d5a3a')); g.fillRect(x - 2, y - 11, 6, 3);
    },
    basket: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - 5, y + 1, 13, 2);
      g.fillStyle = cs(hex('#96794c')); g.fillRect(x - 5, y - 8, 12, 9);
      g.fillStyle = cs(hex('#b0905e')); g.fillRect(x - 5, y - 8, 12, 3);
      g.fillStyle = cs(hex('#6c5432')); g.fillRect(x + 3, y - 8, 4, 9);
      g.fillStyle = 'rgba(70,54,32,0.45)';
      for (let i = -4; i < 6; i += 3) g.fillRect(x + i, y - 5, 1, 6);
    },
    bag: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 4, y + 1, 10, 2);
      g.fillStyle = cs(hex('#8a7d5c')); g.fillRect(x - 4, y - 8, 9, 9);
      g.fillStyle = cs(hex('#a2956f')); g.fillRect(x - 4, y - 8, 3, 9);
      g.fillStyle = cs(hex('#655a42')); g.fillRect(x + 2, y - 8, 3, 9);
      g.fillStyle = cs(hex('#5a5040')); g.fillRect(x - 1, y - 11, 3, 3);
    },
    bundle: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 4, y + 1, 9, 2);
      g.fillStyle = cs(hex('#97874f')); g.fillRect(x - 4, y - 7, 8, 8);
      g.fillStyle = cs(hex('#b3a467')); g.fillRect(x - 4, y - 7, 8, 3);
      g.fillStyle = cs(hex('#6f6236')); g.fillRect(x + 2, y - 7, 2, 8);
      g.fillStyle = cs(hex('#6a5c34')); g.fillRect(x - 1, y - 7, 1, 8);
    },
    crate: (g, x, y) => {
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 5, y + 1, 11, 2);
      g.fillStyle = cs(hex('#7b6040')); g.fillRect(x - 5, y - 9, 11, 10);
      g.fillStyle = cs(hex('#95774f')); g.fillRect(x - 5, y - 9, 11, 3);
      g.fillStyle = cs(hex('#5c4529')); g.fillRect(x + 3, y - 9, 3, 10);
      g.fillStyle = 'rgba(60,45,28,0.40)'; g.fillRect(x - 5, y - 4, 11, 2);
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

  /* 篱笆与路牌：木色两阶（亮/暗各 ≥2px），靠块面分开，不勾深线。 */
  function drawGardenFence(g) {
    const { x, y, w, h } = GARDEN;
    const rail = (x1, y1, x2, y2) => {
      const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
      for (const off of [3, 9]) {
        for (let d = 0; d <= len; d++) {
          const t = d / len;
          const px = Math.round(lerp(x1, x2, t)), py = Math.round(lerp(y1, y2, t)) + off;
          g.fillStyle = cs(hex('#7a5f3c')); g.fillRect(px, py, 1, 2);
          g.fillStyle = cs(hex('#5a4429')); g.fillRect(px, py + 2, 1, 1);
        }
      }
      const n = Math.max(1, Math.round(len / 15));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = Math.round(lerp(x1, x2, t)), py = Math.round(lerp(y1, y2, t));
        g.fillStyle = cs(hex('#6b5334')); g.fillRect(px - 1, py - 2, 3, 14);
        g.fillStyle = cs(hex('#8a6c46')); g.fillRect(px - 1, py - 2, 2, 14);
        g.fillStyle = cs(hex('#4e3b24')); g.fillRect(px + 1, py - 2, 2, 14);
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
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x - 2, y - 1, 5, 2);
      g.fillStyle = cs(hex('#6b5334')); g.fillRect(x, y - 21, 3, 21);
      g.fillStyle = cs(hex('#4e3b24')); g.fillRect(x + 1, y - 21, 2, 21);
      g.fillStyle = cs(hex('#7d6242')); g.fillRect(x - 9, y - 25, 20, 9);
      g.fillStyle = cs(hex('#96794f')); g.fillRect(x - 9, y - 25, 20, 3);
      g.fillStyle = cs(hex('#584226')); g.fillRect(x - 9, y - 18, 20, 2);
    }
  }

  /* ================= 9. 树 ================= */

  /* 树冠 = 一团一团互相咬合的"叶团体积"，不是一棵棵圆球。
     每棵树 = 中心大团 + 7 个环绕团，叠成一个 metaball 场；同团相邻树之间再补一个
     过渡叶团，让两棵树的轮廓咬合成一条起伏的树线。明暗靠块面分层：
     最外圈永远是中间调，用 Bayer 4×4 抖动把边缘抖进背景，不再有一圈深色描边。 */

  const TREE_BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const TREE_ISO = 0.36;   // metaball 等值线：场强超过它的位置是实心叶团
  const TREE_FADE = 0.52;  // 场强低于 ISO×FADE 就完全让位给背景（抖动带的外沿）
  const TREE_HILITE = hex('#e8d98a');  // A2 透光 / 落叶亮点
  const TREE_ACCENT = hex('#c8862e');  // A2 点缀橙

  /** 叶团场：整片树冠共用一套叶团，重叠处自然连成一块。 */
  function treeCanopyLobes() {
    const lobes = [];
    for (const t of TREES) {
      const s = t.seed;
      lobes.push({ x: t.x, y: t.cy, r: t.r * 0.78, host: t });
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39996 + (h2(s, i, 701) - 0.5) * 0.95;
        const d = t.r * (0.26 + 0.30 * h2(s, i, 703));
        const r = t.r * (0.34 + 0.19 * h2(s, i, 707));
        lobes.push({
          x: t.x + Math.cos(a) * d,
          y: t.cy + Math.sin(a) * d * 0.86,
          r,
          host: t,
        });
      }
    }
    // 相邻树之间补过渡团：两团叶子的边缘不会各留一道弧线，而是直接咬合
    for (let i = 0; i < TREES.length; i++) for (let j = i + 1; j < TREES.length; j++) {
      const a = TREES[i], b = TREES[j];
      const dist = Math.hypot(b.x - a.x, b.cy - a.cy);
      if (dist > (a.r + b.r) * 0.98) continue;
      const u = 0.5 + (h2(a.seed, b.seed, 709) - 0.5) * 0.18;
      const r = Math.min(a.r, b.r) * 0.44;
      lobes.push({
        x: lerp(a.x, b.x, u),
        y: lerp(a.cy, b.cy, u) + (h2(a.seed, b.seed, 711) - 0.5) * r * 0.6,
        r,
        host: a.r >= b.r ? a : b,
      });
    }
    return lobes;
  }

  /** 叶团色阶：从 season.leaf 派生，最深只压到 38% 黑——不再有描边级死黑。 */
  function treeCanopyShades(leaf) {
    return [
      mixc(leaf, [0, 0, 0], 0.38), mixc(leaf, [0, 0, 0], 0.21), leaf,
      mixc(leaf, [255, 255, 255], 0.13), mixc(leaf, [255, 255, 255], 0.26),
    ];
  }

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
    if (!TREES.length) return;

    const lobes = treeCanopyLobes();
    const shades = treeCanopyShades(hex(season.leaf));

    /* A9 像素粒度：场可以连续，但着色按 PIX×PIX 网格量化。
       每一格在格中心采样一次场与光照，量化成色档后整格填同一个色——
       同一色档内部是大片相同的像素格，靠色块拼体积，不是逐像素渐变。 */
    const PIX = 2;

    // 只扫树冠并集的包围盒：全场一次算完，重叠处自然是一个整体
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    for (const L of lobes) {
      bx0 = Math.min(bx0, L.x - L.r); by0 = Math.min(by0, L.y - L.r);
      bx1 = Math.max(bx1, L.x + L.r); by1 = Math.max(by1, L.y + L.r);
    }
    bx0 = Math.max(0, Math.floor(bx0) - PIX); by0 = Math.max(0, Math.floor(by0) - PIX);
    bx1 = Math.min(W - 1, Math.ceil(bx1) + PIX); by1 = Math.min(H - 1, Math.ceil(by1) + PIX);
    // 对齐到网格，整格覆盖，边缘不留半格
    bx0 -= bx0 % PIX; by0 -= by0 % PIX;

    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const img = c.createImageData(bw, bh), d = img.data;
    // 叶团外圈要跟"它盖住的那块地"对得上，读一次地形就够了
    const ground = TER.g.getImageData(bx0, by0, bw, bh).data;
    const shadeL = shades.map((s) => 0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2]);

    // 先按网格算每格的颜色（或留空），再统一整格填色
    const gw = Math.ceil(bw / PIX), gh = Math.ceil(bh / PIX);
    const cell = new Int16Array(gw * gh).fill(-2); // -2 空，-1 抖动留空，>=0 色档
    const CELL_HILITE = 100, CELL_ACCENT = 101;

    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = bx0 + gx * PIX + (PIX >> 1), y = by0 + gy * PIX + (PIX >> 1); // 格中心
      let field = 0, host = null, hostW = 0;
      for (let li = 0; li < lobes.length; li++) {
        const L = lobes[li];
        const dx = x - L.x, dy = y - L.y;
        if (dx > L.r || dx < -L.r || dy > L.r || dy < -L.r) continue;
        const q = 1 - (dx * dx + dy * dy) / (L.r * L.r);
        if (q <= 0) continue;
        const w = q * q;
        field += w;
        if (w > hostW) { hostW = w; host = L.host; }
      }
      if (!host) continue;

      // A4 边缘：等值线内外一条抖动带，以"格"为单位抖动，收边呈像素颗粒
      const solid = field / TREE_ISO;
      if (solid < TREE_FADE) continue;
      const band = clamp((solid - TREE_FADE) / (1 - TREE_FADE), 0, 1);
      const bayer = (TREE_BAYER4[(gy & 3) * 4 + (gx & 3)] + 0.5) / 16;
      if (band < 1 && bayer > band) continue;

      const dx = x - host.x, dy = y - host.cy;
      const clump = vnoise(x, y, 7, 17);
      const fine = vnoise(x, y, 3.4, 29);
      // A9 色阶断层：连续 lit 先量化成 5 档，档边界用 Bayer 抖动过渡
      const litRaw = clamp(0.46 + (-dx * 0.44 - dy * 0.80) / (host.r * 1.15)
        + (clump - 0.5) * 0.52 + (fine - 0.5) * 0.20, 0, 1);
      const quant = litRaw * 5;
      let idx = Math.floor(quant);
      // 档间抖动：小数部分与 Bayer 阈值比，过了就进上一档 → 颗粒状过渡
      if (quant - idx > bayer && idx < 4) idx++;
      idx = clamp(idx, 0, 4);

      let out = idx;
      if (band < 0.985) {
        // A1 最外圈：取"叶色 + 脚下地面"之间最近的一档，明度差不比内部层次大，
        // 于是没有一圈比背景暗/亮出一个量级的勾边，收形交给抖动带。
        const gi = ((y - by0) * bw + (x - bx0)) * 4;
        const gl = 0.299 * ground[gi] + 0.587 * ground[gi + 1] + 0.114 * ground[gi + 2];
        const target = gl * 0.45 + shadeL[2] * 0.55;
        let pick = 1;
        if (Math.abs(shadeL[2] - target) < Math.abs(shadeL[pick] - target)) pick = 2;
        if (Math.abs(shadeL[3] - target) < Math.abs(shadeL[pick] - target)) pick = 3;
        out = (litRaw > 0.82 && h2(gx, gy, 5301) < 0.30) ? 3 : pick;
      } else {
        // A5 透光点：以"格"为单位撒，朝光面密、背光面几乎不撒。
        // litRaw 走平方让亮点集中到最亮的一小片，密度压到稀疏（参考图每棵树只有几粒透光）。
        const hk = h2(gx, gy, 5201);
        const dens = 0.0015 + litRaw * litRaw * 0.012;
        if (hk < dens) out = CELL_HILITE;
        else if (hk < dens + 0.0012 && litRaw > 0.55) out = CELL_ACCENT;
      }
      cell[gy * gw + gx] = out;
    }

    // 把每格填成纯色（2×2 同色像素），透光点收敛成单像素更通透
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const v = cell[gy * gw + gx];
      if (v < 0) continue;
      const x0 = gx * PIX, y0 = gy * PIX;
      if (v === CELL_HILITE || v === CELL_ACCENT) {
        const col = v === CELL_HILITE ? TREE_HILITE : TREE_ACCENT;
        const i = (y0 * bw + x0) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
        continue;
      }
      const col = shades[v];
      for (let py = 0; py < PIX; py++) for (let px = 0; px < PIX; px++) {
        const xx = x0 + px, yy = y0 + py;
        if (xx >= bw || yy >= bh) continue;
        const i = (yy * bw + xx) * 4;
        d[i] = col[0] | 0; d[i + 1] = col[1] | 0; d[i + 2] = col[2] | 0; d[i + 3] = 255;
      }
    }
    c.putImageData(img, bx0, by0);
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

  /* 场景种子：只由 (placeId, season, sky) 决定，保证同组合逐像素一致。
     所有"随机"分布都走 h2(x, y, seed)，不再有 Math.random()。 */
  let sceneSeed = 7;
  function sceneSeedOf(placeId, seasonName, skyName) {
    let n = 2166136261;
    const key = `${placeId}|${seasonName}|${skyName}`;
    for (let i = 0; i < key.length; i++) n = Math.imul(n ^ key.charCodeAt(i), 16777619);
    return (n >>> 0) % 100000;
  }

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

  /* 颗粒噪声：确定性（h2）——同一 seed 每帧一致，不再用 Math.random()。 */
  const GRAIN = document.createElement('canvas');
  GRAIN.width = 160; GRAIN.height = 90;
  (() => {
    const g = GRAIN.getContext('2d');
    const im = g.createImageData(160, 90);
    for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      const v = Math.round((h2(x, y, 771) * 0.6 + h2(x, y, 773) * 0.4) * 255);
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  })();

  /* 雨滴/雪花：空间分布用 h2 定死（同 seed 下每帧位置一致，只有 y 随时间推进）。 */
  const drops = [];
  for (let i = 0; i < 170; i++) {
    drops.push({
      x: h2(i, 1, 811) * W,
      y: h2(i, 2, 812) * H,
      s: 150 + h2(i, 3, 813) * 170,
      l: 7 + h2(i, 4, 814) * 9,
    });
  }
  const flakes = [];
  for (let i = 0; i < 130; i++) {
    flakes.push({
      x: h2(i, 1, 821) * W,
      y: h2(i, 2, 822) * H,
      s: 8 + h2(i, 3, 823) * 20,
      a: 1 + h2(i, 4, 824) * 3,
      p: h2(i, 5, 825) * 6.28,
    });
  }

  /* ================= 11b. 氛围粒子（A8） =================
     三件东西：小圆环（半透明描边，缓慢漂移 + 缩放）、光点/孢子（1–2px 呼吸明暗）、
     晴天尘光（细亮尘粒在受光斜带里上浮）。空间分布全部来自 sceneSeed，
     动画相位用 t，所以同 (placeId, season, sky) 下画面逐像素一致。 */

  const RING_PTS = new Map();
  function pixelRing(r) {
    const key = r | 0;
    const hit = RING_PTS.get(key);
    if (hit) return hit;
    const pts = [];
    const steps = Math.max(10, Math.round(key * 8));
    for (let s = 0; s < steps; s++) {
      const a = (s / steps) * Math.PI * 2;
      const px = Math.round(Math.cos(a) * key), py = Math.round(Math.sin(a) * key * 0.86);
      let dup = false;
      for (const p of pts) if (p[0] === px && p[1] === py) { dup = true; break; }
      if (!dup) pts.push([px, py]);
    }
    RING_PTS.set(key, pts);
    return pts;
  }

  const particles = [];
  function buildParticles() {
    particles.length = 0;
    const sd = sceneSeed;
    const wet = sky === 'rain';
    const snowy = sky === 'snow';
    // A8：同屏 12–40 粒；雨雪天只留极少量，晴天最多（含尘光）
    const ringN = wet || snowy ? 0 : 3 + Math.floor(h2(sd, 1, 901) * 4);      // 3–6
    const sporeN = wet ? 0 : snowy ? 4 : 8 + Math.floor(h2(sd, 2, 901) * 8);   // 4 / 8–15
    const dustN = sky === 'clear' ? 9 + Math.floor(h2(sd, 3, 901) * 7) : 0;   // 9–15
    const fogN = sky === 'fog' ? 3 : 0;
    for (let i = 0; i < ringN; i++) {
      particles.push({
        kind: 0,
        x: 40 + h2(i, 11, sd) * (W - 80),
        y: 24 + h2(i, 12, sd) * (H * 0.62),
        r: 5 + Math.floor(h2(i, 13, sd) * 6),
        ph: h2(i, 14, sd) * 6.283,
        sp: 0.12 + h2(i, 15, sd) * 0.10,
        amp: 3 + h2(i, 16, sd) * 5,
        a: 0.48 + h2(i, 17, sd) * 0.22,
      });
    }
    for (let i = 0; i < sporeN; i++) {
      particles.push({
        kind: 1,
        x: 20 + h2(i, 21, sd) * (W - 40),
        y: 18 + h2(i, 22, sd) * (H * 0.74),
        ph: h2(i, 23, sd) * 6.283,
        sp: 0.5 + h2(i, 24, sd) * 0.9,
        amp: 4 + h2(i, 25, sd) * 7,
        big: h2(i, 26, sd) > 0.82,
        warm: h2(i, 27, sd) > 0.55,
      });
    }
    for (let i = 0; i < dustN; i++) {
      particles.push({
        kind: 2,
        x: 60 + h2(i, 31, sd) * 380,
        y: 40 + h2(i, 32, sd) * 250,
        ph: h2(i, 33, sd) * 6.283,
        sp: 0.20 + h2(i, 34, sd) * 0.35,
        amp: 2 + h2(i, 35, sd) * 4,
      });
    }
    for (let i = 0; i < fogN; i++) {
      particles.push({
        kind: 0,
        x: 60 + h2(i, 41, sd) * (W - 120),
        y: 40 + h2(i, 42, sd) * (H * 0.5),
        r: 5 + Math.floor(h2(i, 43, sd) * 4),
        ph: h2(i, 44, sd) * 6.283,
        sp: 0.07,
        amp: 8,
        a: 0.07,
      });
    }
  }

  function drawParticles(t) {
    if (!particles.length) return;
    const warmAir = sky === 'clear' || sky === 'fog';
    for (const p of particles) {
      if (p.kind === 0) {
        // 小圆环：缓慢横向漂移 + 尺寸呼吸，半透明描边
        const x = Math.round(p.x + Math.sin(t * p.sp + p.ph) * p.amp);
        const y = Math.round(p.y + Math.cos(t * p.sp * 0.7 + p.ph) * p.amp * 0.4);
        const grow = 0.75 + 0.35 * (0.5 + 0.5 * Math.sin(t * p.sp * 1.7 + p.ph));
        const r = Math.max(2, Math.round(p.r * grow));
        const a = p.a * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * p.sp + p.ph * 1.3)));
        vctx.fillStyle = warmAir ? `rgba(232,217,138,${a.toFixed(3)})` : `rgba(214,222,224,${a.toFixed(3)})`;
        for (const pt of pixelRing(r)) vctx.fillRect(x + pt[0], y + pt[1], 1, 1);
      } else if (p.kind === 1) {
        // 光点/孢子：位置缓慢漂移，明暗呼吸
        const x = Math.round(p.x + Math.sin(t * p.sp * 0.5 + p.ph) * p.amp);
        const y = Math.round(p.y + Math.sin(t * p.sp * 0.33 + p.ph * 1.7) * p.amp * 0.8 - (t * 1.6) % (H * 0.5)) ;
        const yy = ((y % H) + H) % H;
        const breathe = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(t * (0.7 + p.sp) + p.ph));
        const a = (0.34 + breathe * 0.46) * (yy < H * 0.86 ? 1 : 0.4);
        vctx.fillStyle = p.warm
          ? `rgba(232,217,138,${a.toFixed(3)})`
          : `rgba(226,230,214,${a.toFixed(3)})`;
        if (p.big) { vctx.fillRect(x, yy, 2, 2); vctx.fillRect(x - 1, yy + 1, 1, 1); vctx.fillRect(x + 2, yy + 1, 1, 1); }
        else vctx.fillRect(x, yy, 1, 1);
      } else {
        // 晴天尘光：极细亮尘在受光斜带里缓慢上浮
        const x = Math.round(p.x + Math.sin(t * p.sp * 0.4 + p.ph) * p.amp);
        const y = Math.round(((p.y - (t * 4 + p.ph * 3) % 220) % H + H) % H);
        const a = 0.10 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.6 + p.ph));
        vctx.fillStyle = `rgba(255,238,190,${a.toFixed(3)})`;
        vctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /* 晴天受光斜带：粒子有"光可落"的地方，尘光才读得出来（很淡） */
  function drawSunShaft() {
    if (sky !== 'clear') return;
    vctx.globalCompositeOperation = 'lighter';
    const g = vctx.createLinearGradient(120, -40, 470, 340);
    g.addColorStop(0, 'rgba(255,226,168,0.075)');
    g.addColorStop(0.55, 'rgba(255,222,160,0.035)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    vctx.fillStyle = g;
    vctx.beginPath();
    vctx.moveTo(96, 0); vctx.lineTo(250, 0); vctx.lineTo(470, H); vctx.lineTo(300, H);
    vctx.closePath(); vctx.fill();
    vctx.globalCompositeOperation = 'source-over';
  }

  /* A7 前景压暗：底部与左右边缘压暗，让前景元素"压住画面"。
     这里是软边渐变（是层次，不是描边），并且只作为三段的最后一段。 */
  function foregroundShade() {
    const bot = vctx.createLinearGradient(0, H * 0.66, 0, H);
    bot.addColorStop(0, 'rgba(18,22,14,0)');
    bot.addColorStop(1, 'rgba(18,22,14,0.26)');
    vctx.fillStyle = bot; vctx.fillRect(0, H * 0.66, W, H * 0.34);
    const left = vctx.createLinearGradient(0, 0, W * 0.17, 0);
    left.addColorStop(0, 'rgba(18,22,14,0.20)');
    left.addColorStop(1, 'rgba(18,22,14,0)');
    vctx.fillStyle = left; vctx.fillRect(0, 0, W * 0.17, H);
    const right = vctx.createLinearGradient(W, 0, W * 0.83, 0);
    right.addColorStop(0, 'rgba(18,22,14,0.20)');
    right.addColorStop(1, 'rgba(18,22,14,0)');
    vctx.fillStyle = right; vctx.fillRect(W * 0.83, 0, W * 0.17, H);
  }

  /* 中景提亮：视线焦点抬一档明度（很淡，地形层已经做了大部分） */
  function midLift() {
    vctx.globalCompositeOperation = 'lighter';
    const g = vctx.createRadialGradient(W * 0.5, H * 0.56, 60, W * 0.5, H * 0.56, 300);
    g.addColorStop(0, 'rgba(255,240,200,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    vctx.fillStyle = g; vctx.fillRect(0, 0, W, H);
    vctx.globalCompositeOperation = 'source-over';
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

    // A7 三段：中景提亮 → 前景/边缘压暗 → 暗角只作辅助
    midLift();
    drawSunShaft();
    drawParticles(t);
    foregroundShade();

    vctx.globalAlpha = 0.045;
    vctx.globalCompositeOperation = 'overlay';
    vctx.drawImage(GRAIN, 0, 0, W, H);
    vctx.globalAlpha = 1;
    vctx.globalCompositeOperation = 'source-over';

    const vg = vctx.createRadialGradient(W / 2, H * 0.44, 170, W / 2, H * 0.44, 470);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.24)');
    vctx.fillStyle = vg; vctx.fillRect(0, 0, W, H);
  }

  /* ================= 12. 组装 ================= */

  function rebuild(vmNext) {
    const prevPlace = vm?.place?.id, prevSeason = vm?.clock?.season, prevSky = vm?.weather?.sky;
    vm = vmNext;
    layout = layoutFor(vm.place.id);
    season = SEASONS[vm.clock.season] ?? SEASONS.春;
    sky = skyOf(vm.weather);
    TREES = planTrees(layout.trees);
    sceneSeed = sceneSeedOf(vm.place.id, vm.clock.season, sky);
    // 大气粒子只依赖 (place, season, sky)，这三样没变就不用重建
    const sameAir = prevPlace === vm.place.id && prevSeason === vm.clock.season && prevSky === vm.weather.sky;
    if (!sameAir || !particles.length) buildParticles();
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

  /* 美术调试钩子：`pixel-scene.html?art=place:yard,秋,晴` 锁定一个确定性场景，
     不再读 /api/state，便于出可对照的改前/改后渲染基线（dev-art-shot.mjs 用）。
     仅在带这个参数时生效，正常打开页面不受影响。 */
  function artOverrideFromQuery() {
    const raw = new URLSearchParams(location.search).get('art');
    if (!raw) return null;
    const [place = 'place:yard', seasonName = '秋', skyName = '晴'] = raw.split(',');
    return toSceneVM({
      settlement: {
        placeId: place, placeName: '河岸台地', season: seasonName, weather: { sky: skyName },
        neighbours: [
          { id: 'a', name: '陶婶', acquaintance: 'known', atWork: true, contact: '相识' },
          { id: 'b', name: '猎户', acquaintance: 'stranger', atWork: false, contact: '陌生' },
          { id: 'c', name: '磨坊主', acquaintance: 'known', atWork: false, contact: '相识' },
        ],
        objects: [
          { id: 'o1', name: '陶罐', prototypeId: 'prototype:jar', visible: true, quantity: 1 },
          { id: 'o2', name: '谷物篮', prototypeId: 'prototype:grain-basket', visible: true, quantity: 1 },
        ],
        exits: [
          { placeId: 'place:river', name: '河边', costDays: 1 },
          { placeId: 'place:field', name: '田里', costDays: 1 },
        ],
        dailyActivity: { used: 3, capacity: 8 },
      },
      clock: { day: 100, dayOfMonth: 8, monthOfYear: 4, season: seasonName, eraYear: -2053 },
      character: { id: 'modern:e1', name: '启禾', age: 16 },
    });
  }

  const artLock = artOverrideFromQuery();
  document.getElementById('btnRefresh').addEventListener('click', refresh);
  if (artLock) {
    rebuild(artLock);
    paintHud();
    document.getElementById('banner').hidden = true;
  } else {
    refresh();
  }
  requestAnimationFrame(frame);
})();
