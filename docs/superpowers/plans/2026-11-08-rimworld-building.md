# 像环世界那样盖房子 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用“隐形 80px 格子 + 一段段墙/门 + 封闭成屋 + 上顶”替代地基牌盖房；玩家和村民都能规划、施工、扩建；院子和仓房并入新系统。

**Architecture:** 规则写成纯模块（`walls.js` 格子/墙段/成屋/寻路矩形，`expansion.js` 村民扩建决策与选址），画面（`walls-paint.js`）和规划手势（`walls-ui.js`）各自独立成模块并带回调接口；`app.js` 只由主会话一人修改，负责把它们接进存档、寻路、施工、村民派活、取暖躲雨铺位。

**Tech Stack:** 原生 ES modules、Canvas 2D / DOM、`node --test`；不加依赖。

**Spec:** `docs/superpowers/specs/2026-11-08-rimworld-building-design.md`

## Global Constraints

- 只有主会话改 `apps/card-world/app.js`、`index.html`、`style.css`；委派任务只建/改自己任务列出的文件。
- 不提交 git（用户没要求）。完成后 `npm test` 全过（在 `D:\MG\program\OpenLife` 下）。
- `app.js` 是 CRLF 行尾；新文件用 LF。代码注释英文、简短，风格同现有文件；界面文字简体中文。
- 建筑格子 `GRID = 80`，与寻路格 `CELL = 40`（`mapgen.js`）对齐：格线在 `x = i*80`、`y = j*80`。
- 墙厚 `WALL_T = 14`，压在格线上居中。一扇门 = 一段墙长（80px）。
- 一间屋最多 `MAX_ROOM = 80` 格；超过算“外面”。
- 用料起点：墙一段 `{ reed: 1, clay: 1 }` 工时 60；门一段 `{ log: 1, rope: 1 }` 工时 60；屋顶 `{ reed: ceil(cells/2), rope: ceil(cells/4) }` 工时 `cells*20`。冬天墙和屋顶停工，门不停。
- 房间名：灶 → `灶房`；铺位 → `卧房`（只一人睡时 `X的屋`）；粮囤或材料堆 → `仓房`；饭桌 → `堂屋`；空 → `空屋`；原院子固定叫 `院子`，原仓房固定叫 `仓房`。
- 老存档必须能读；用户存档 `openlife.cardworld.20261101` 读前先备份到 `.backup-before-walls`。
- 界面在约 500px 宽的 codeg 内置浏览器里要能用。

## Review Focus

1. 读老存档：院子、仓房贴格时整体平移（≤40px），里面的牌和人一起挪，没人落在墙上或墙外 → Task 5 测 `fromCompound` 的平移量，Task 11 实跑用户存档副本。
2. 没留门的屋：玩家围了一圈没开门，或墙立起来时有人在里面 → 规划时提示“这间屋没留门”；墙立好时把被关在无门屋里的人和牌挪到门外最近的空地 → Task 1 测 `doorlessRooms`，Task 7 实现挪人。
3. 窄屏拖动：规划模式下按住拖不能变成平移地图，工具栏 500px 内一行放得下 → Task 4 测手势状态机；Task 6 截图检查。
4. 墙线压着牌：铺位、灶、粮囤等固定的牌不能被墙压，散放的东西和人在墙立起时让开 → Task 6 的校验、Task 7 的让开。
5. 寻路性能和正确性：墙多了以后 `crossesWall` 要遍历的矩形变多 → Task 1 测共线合并；每次墙变动清 `pathCache`，1000 条随机进出路径 0 条穿墙（沿用 v25 的实测法）→ Task 11。

---

## 文件

| 文件 | 负责 | 谁做 |
| --- | --- | --- |
| `apps/card-world/walls.js`（新） | 格子换算、墙段键、拖线/框转墙段、寻路矩形合并、泛洪成屋、无门屋、屋顶矩形、屋名、旧院子转换、用料 | Codex |
| `tests/walls.test.mjs`（新） | 上面的测试 | Codex |
| `apps/card-world/expansion.js`（新） | 村民要不要扩建、扩成什么、贴哪面墙 | DSH Plain |
| `tests/expansion.test.mjs`（新） | 上面的测试 | DSH Plain |
| `apps/card-world/walls-paint.js`（新） | 在 canvas 上画墙/蓝图/门/新屋地板；生成屋顶元素 | Antigravity |
| `apps/card-world/walls.css`（新） | 屋顶、房间名、规划工具栏、网格的样式 | Antigravity（屋顶/名字）+ CodeBuddy（工具栏） |
| `apps/card-world/walls-ui.js`（新） | 规划模式：工具栏 DOM、按下/拖动/松开的状态机、预览回调 | CodeBuddy |
| `tests/walls-ui.test.mjs`（新） | 手势状态机测试（不碰 DOM 的部分） | CodeBuddy |
| `apps/card-world/app.js`、`index.html`、`style.css` | 集成 | 主会话 |
| `apps/card-world/DESIGN.md`、`README.md`、`ROADMAP.md` | 文档 | 主会话 |

执行顺序：Task 1 先做（其他模块都依赖它的接口）；Task 1 完成后 Task 2/3/4 并行委派，同时主会话做 Task 5；然后 Task 6–11 主会话按序做。

---

### Task 1: `walls.js` 规则核心（Codex）

**Files:** Create `apps/card-world/walls.js`, `tests/walls.test.mjs`

**Interfaces — Produces:**
```js
export const GRID = 80, WALL_T = 14, MAX_ROOM = 80;
export const SEG_COST = { wall: { needs: { reed: 1, clay: 1 }, work: 60 }, door: { needs: { log: 1, rope: 1 }, work: 60 } };
export function roofCost(cells: number): { needs: { reed: number, rope: number }, work: number }
// Segment keys: "h:i:j" = edge (i*G, j*G)→((i+1)*G, j*G); "v:i:j" = edge (i*G, j*G)→(i*G, (j+1)*G)
export function segKey(dir: "h"|"v", i: number, j: number): string
export function parseSeg(k: string): { dir: "h"|"v", i: number, j: number }
export function segRect(k: string, t = WALL_T): { x, y, w, h }      // the wall's own rectangle, centred on the grid line
export function segMid(k: string): { x, y }
export const cellOf = (p: {x,y}) => [i, j]                           // floor(x/G), floor(y/G)
export function snapLine(a: {x,y}, b: {x,y}): string[]               // a→b snapped: start at a's nearest grid vertex, run along the axis with the larger |delta| to b's projection; [] if shorter than half a cell
export function boxSegs(a: {x,y}, b: {x,y}): string[]                // perimeter of the box between the two nearest grid vertices; at least 1×1 cell
// Seg record used everywhere: { k, kind: "wall"|"door", look: "mud"|"fence", state: "plan"|"built", need: {}, work: number, plan: string, by?: string }
export function newSeg(k, { kind = "wall", look = "mud", plan, by }): Seg   // need = copy of SEG_COST[kind].needs, work 0, state "plan"
export function blockRects(segs: Seg[]): {x,y,w,h}[]                 // built walls only (doors are gaps); collinear touching runs merged into one rect
export function findRooms(segs: Seg[], maxCells = MAX_ROOM): Room[]
// Room = { id: "i,j" of its lexicographically smallest cell, cells: [i,j][], rects: {x,y,w,h}[] (row runs), box: {x,y,w,h}, doors: string[] (built door keys on its border) }
export function doorlessRooms(segs: Seg[]): Room[]                    // rooms with no door — counting planned doors and planned walls as if built
export const roomAt = (rooms: Room[], p: {x,y}) => Room | null
export function buildingOf(rooms: Room[], room: Room): Room[]         // rooms joined to this one through doors (including itself)
export function roomName(keys: string[], { sleeper } = {}): string    // keys = card keys inside; see Global Constraints
export function fromCompound(c: {x,y,w,h,gate:{x,w}}, look: "fence"|"mud"): { rect: {x,y,w,h}, dx: number, dy: number, segs: Seg[] }   // snap to grid (round each edge), all built; the bottom seg nearest the gate centre becomes the door
export function needsOf(segs: Seg[]): Record<string, number>          // what plan-state segs still want, summed
export function addSegWork(seg: Seg, minutes: number): "working" | "built"   // only when need is all 0; sets state "built" at SEG_COST[kind].work
```

- [ ] **Step 1: 写失败的测试** `tests/walls.test.mjs`，至少这些（数值照写）：
```js
test("keys and rects sit on the 80px grid", () => {
  assert.deepEqual(segRect("h:2:3"), { x: 160, y: 233, w: 80, h: 14 });
  assert.deepEqual(segRect("v:2:3"), { x: 153, y: 240, w: 14, h: 80 });
  assert.deepEqual(parseSeg(segKey("v", -1, 4)), { dir: "v", i: -1, j: 4 });
});
test("a drag snaps to one straight line", () => {
  assert.deepEqual(snapLine({ x: 85, y: 160 }, { x: 330, y: 190 }), ["h:1:2", "h:2:2", "h:3:2"]);
  assert.deepEqual(snapLine({ x: 85, y: 160 }, { x: 100, y: 170 }), []);
});
test("a box is its four sides", () => assert.equal(boxSegs({ x: 0, y: 0 }, { x: 240, y: 160 }).length, 10));
test("walls merge into few blocking rects; doors are gaps", () => {
  const segs = boxSegs({ x: 0, y: 0 }, { x: 240, y: 160 }).map((k) => ({ ...newSeg(k, { plan: "p" }), state: "built" }));
  assert.equal(blockRects(segs).length, 4);
  segs.find((s) => s.k === "h:1:2").kind = "door";
  assert.equal(blockRects(segs).length, 5);           // the south wall is split by the door
});
test("four walls make a room; an open side doesn't; a huge ring is outdoors", () => {
  const built = (ks) => ks.map((k) => ({ ...newSeg(k, { plan: "p" }), state: "built" }));
  const ring = built(boxSegs({ x: 0, y: 0 }, { x: 240, y: 160 }));
  const [room] = findRooms(ring);
  assert.equal(room.cells.length, 6); assert.equal(room.id, "0,0");
  assert.equal(findRooms(ring.slice(1)).length, 0);
  assert.equal(findRooms(built(boxSegs({ x: 0, y: 0 }, { x: 800, y: 720 }))).length, 0);   // 90 cells > MAX_ROOM
});
test("a door between two rooms joins them into one building", () => {
  // two 2×2 rooms side by side sharing v:2:0 and v:2:1; v:2:0 is a door
});
test("a ring with no door is flagged, planned doors count", () => { /* doorlessRooms */ });
test("rooms are named by what's in them", () => {
  assert.equal(roomName(["bed", "stove"]), "灶房");
  assert.equal(roomName(["bed"], { sleeper: "阿三" }), "阿三的屋");
  assert.equal(roomName(["bed", "bed"]), "卧房");
  assert.equal(roomName(["granary"]), "仓房");
  assert.equal(roomName(["table"]), "堂屋");
  assert.equal(roomName([]), "空屋");
});
test("the old yard snaps onto the grid and keeps its gate as one door", () => {
  const out = fromCompound({ x: 1013, y: 2050, w: 560, h: 640, gate: { x: 1233, w: 120 } }, "fence");
  assert.deepEqual(out.rect, { x: 1040, y: 2080, w: 560, h: 640 }); assert.equal(out.dx, 27); assert.equal(out.dy, 30);
  assert.equal(out.segs.filter((s) => s.kind === "door").length, 1);
  assert.equal(out.segs.length, 2 * (7 + 8));
  assert.equal(findRooms(out.segs).length, 1);
});
test("roof cost and seg work", () => {
  assert.deepEqual(roofCost(9), { needs: { reed: 5, rope: 3 }, work: 180 });
  const s = newSeg("h:0:0", { plan: "p" }); assert.equal(addSegWork(s, 60), "working");   // still wants reed and clay
  s.need = { reed: 0, clay: 0 }; assert.equal(addSegWork(s, 59), "working"); assert.equal(addSegWork(s, 1), "built");
});
```
（`fromCompound` 规则：`x' = round(x/G)*G`，宽高也取整到 G 的倍数；`dx = x' - x`。）

- [ ] **Step 2:** `npm test` → walls 测试 FAIL（模块不存在）。
- [ ] **Step 3:** 实现 `walls.js`。泛洪：只从与“已立好”墙/门相邻的格子出发；格子 (i,j) 向四邻走，走 (i,j)→(i+1,j) 要过的边是 `v:i+1:j`，走 (i,j)→(i,j+1) 要过的边是 `h:i:j+1`；该边有已立好的墙或门就不能过；访问数超过 `maxCells` 判为外面并记住这些格子，避免重复泛洪。
- [ ] **Step 4:** `npm test` 全过（包括 `syntax.test.mjs`）。

### Task 2: `expansion.js` 村民扩建（DSH Plain，Task 1 之后）

**Files:** Create `apps/card-world/expansion.js`, `tests/expansion.test.mjs`

**Interfaces — Consumes:** Task 1 的 `parseSeg/segKey/findRooms/newSeg/GRID`。**Produces:**
```js
// Why the village would build on, if it would. Pure.
export function extensionNeed({ adults, beds, freeBedSpots, couplesWithoutRoom, heapKinds, heapCap, season, planning }):
  null | { kind: "bedroom" | "couple" | "store", w: number, h: number, because: string }
// bedroom: adults > beds && freeBedSpots === 0 → 3×3, because "屋里摆不下铺位了，接一间屋"
// couple: couplesWithoutRoom > 0 → 3×3, because "成了家，该有自己的一间"
// store: heapKinds > heapCap → 4×3, because "材料堆不下了，接一间仓房"
// null when planning (a plan already open), or season is "秋" or "冬"
export function extensionSite({ segs, rooms, w, h, free, home }):
  null | { cells: [i,j][], segs: string[] /* new wall keys, not already built */, door: string /* a shared, already-built wall key to become a door */ }
// free(i, j) => boolean: the app says whether a cell is open ground (no fixed card, walkable, not road, not before the gate)
// Try every outer wall run of every room: place the w×h box (and its h×w turn) against it so they share ≥ 2 segs;
// all its cells free and outside every room. Score = new segs count + distance from box centre to home / GRID / 4; lowest wins.
// The door is the shared seg nearest the middle of the shared run.
```
- [ ] **Step 1:** 测试：`extensionNeed` 四种情况（含秋冬和 planning 返回 null）；`extensionSite` 用 `fromCompound` 造一个 3×3 屋，`free` 全真 → 返回的盒子贴着它、共用 3 段、`segs.length === 9`、`door` 在共用的段里；某一侧 `free` 为假 → 换到别的一侧；四周都不空 → `null`。
- [ ] **Step 2:** 跑测试 FAIL。 **Step 3:** 实现。 **Step 4:** `npm test` 全过。

### Task 3: `walls-paint.js` + 屋顶/房名样式（Antigravity，Task 1 之后）

**Files:** Create `apps/card-world/walls-paint.js`；`apps/card-world/walls.css` 里屋顶和房名部分。

**Interfaces — Consumes:** Task 1 的 `segRect/parseSeg/GRID/WALL_T`。**Produces:**
```js
export function drawWalls(g: CanvasRenderingContext2D, segs: Seg[], { winter = false, preview = [] as string[] } = {}): void
// built mud wall: rammed-earth colour with a darker top edge and a little texture; look "fence": the same wooden rail + posts as terrain.js paintFence;
// plan: translucent dashed outline; under way (state "plan", work > 0): solid from the bottom up in proportion to work / SEG_COST[kind].work;
// door: a frame and a half-open plank door; preview keys: bright dashed outline (what the planner is dragging)
export function drawFloor(g, cells: [i,j][], { winter = false } = {}): void   // the same boards as the yard floor in terrain.js
export function roofEl(room: Room, { label = "", open = false } = {}): HTMLElement
// absolutely positioned at room.box, class "roof built-roof", one child per room.rects piece so an L-shape reads as one roof; a .room-name label in the middle
```
- [ ] **Step 1:** app 还没接上，所以建一个临时演示页 `apps/card-world/walls-demo.html`（Task 10 删掉），引 `walls.js`、`walls-paint.js`、`walls.css`，摆一组示例：一间 L 形屋、一排蓝图、一段在盖的、一扇门、冬天/非冬天、栅栏样式。通过 `http://127.0.0.1:4173/walls-demo.html` 打开（`server.mjs` 已在跑）。
- [ ] **Step 2:** 截图检查：窄窗口 500px 下墙、门、屋顶、名字清楚，和现有院子栅栏风格一致。
- [ ] **Step 3:** `npm test` 全过（syntax 测试会检查新 js）。

### Task 4: `walls-ui.js` 规划模式（CodeBuddy，Task 1 之后）

**Files:** Create `apps/card-world/walls-ui.js`, `tests/walls-ui.test.mjs`；`walls.css` 里工具栏部分。

**Interfaces — Consumes:** Task 1 的 `snapLine/boxSegs`。**Produces:**
```js
export const TOOLS = ["line", "box", "door", "remove"];   // 画墙 / 围一间 / 开门 / 取消·拆
export function plannerState(): { tool: "line", start: null, preview: [] }
export function plannerDown(s, p: {x,y}): s
export function plannerMove(s, p): s                       // preview = snapLine or boxSegs from start to p
export function plannerUp(s, p, moved: boolean): { s, action: null | { type: "add", keys: string[] } | { type: "tap", tool: "door"|"remove", at: {x,y} } }
// line/box: moved → add preview keys; not moved → null.  door/remove: not moved → tap at p; moved → null
export function mountToolbar(root: HTMLElement, { onTool(tool), onDone(), onCancel() }): { el: HTMLElement, setTool(tool), setNeeds(text), remove() }
// bottom bar, one row: 画墙 围一间 开门 取消·拆 | 完成 ✕ ; a small line above it shows needs text ("要芦苇 12、黏土 12…") ; fits 480px wide
```
- [ ] **Step 1:** 测试纯状态机：line 工具按下→拖→松开得到 `snapLine` 的结果；box 得 `boxSegs`；door 不拖时得 tap；拖动距离为 0 时 line 不产出。
- [ ] **Step 2:** FAIL。 **Step 3:** 实现（`mountToolbar` 只用 DOM，不依赖 app）。 **Step 4:** `npm test` 全过。

### Task 5: 院子和仓房换成墙段（主会话，可与 2–4 并行）

**Files:** Modify `app.js`（`wallsOf`/`setupMainHouse`/`setupBarn`/`roofOver`/渲染循环里掀顶/`paint` 时的 `house` 参数/`saveGame`/`restore`/`build`），`index.html`（引 `walls.css`），`terrain.js`（`paintFence` 不再画院墙，只画院内地板）。

**Interfaces — Produces（后面任务用）:** app 内 `const works = { segs: Seg[], rooms: Room[], roofs: Map<roomId, {need, work, done}> }` 存在 `village.build`；`function wallsChanged()`：重算 `MAP.blocks = blockRects(segs)`、`works.rooms = findRooms(segs)`、`pathCache.clear()`、重画墙层、更新屋顶元素。`const inRoom = (p) => Boolean(roofedRoomAt(p))`。

- [ ] **Step 1:** 新档：`setupMainHouse` 用 `fromCompound(c, "fence")`，平移院子里的东西 `dx/dy`，`MAP.house` 设为贴格后的矩形，`gate` 由门段推出；仓房同理（`look: "mud"`），两间屋顶 `done: true`。
- [ ] **Step 2:** 老档：`village.build` 不存在时走 Step 1 的转换（同样平移已有的牌和人）；存在时直接用。
- [ ] **Step 3:** 墙画在新的 canvas 层（地形之上、牌之下），屋顶改用 `roofEl`；掀顶按 `buildingOf(roomAt(你))`。
- [ ] **Step 4:** 验证：`npm test` 全过；预览 `?day=1&seed=7` 截图院子和仓房和改前一样；村民 2 天正常进出（`advanceTo`）；备份后读用户存档，人和牌没落在墙上。

### Task 6: 玩家规划与施工（主会话）

**Files:** Modify `app.js`、`style.css`（必要时）。

- [ ] **Step 1:** 手艺本“盖房子”加一行“画墙盖屋”（会“立墙”或已有任何建房手艺即可，阿三初始会 `wall`），进入规划模式：`mountToolbar`；`pointerdown/move/up` 在规划模式下走 `plannerDown/Move/Up`，不平移、不走路。
- [ ] **Step 2:** `add`：逐段校验——不在 `known(p)` 的地方、不可走、水/崖、压着固定牌（铺位、灶、火塘、饭桌、粮囤、木箱等 `type: "structure"` 或建成物）、`beforeGate`；不合格的段丢掉并提示一次原因；合格段 `newSeg(k, { plan: id })` 加入；预览期间工具栏显示 `needsOf`。新的围合若在 `doorlessRooms` 里，提示“这间屋没留门”。
- [ ] **Step 3:** 每段蓝图挂一个隐形堆（卡 `wallSeg`，`no-card` 不显示），矩形 = `segRect(k, 40)`，可被 `targetAt` 选中（`targetAt` 对 `wallSeg` 不跳过 `no-card`）；这些堆不进存档（`stackOut` 跳过），读档后由 `village.build` 重建。
- [ ] **Step 4:** 把“你”拖到一段蓝图：交料（同 `workPlot` 的 `took` 逻辑，作用在 `seg.need`）；料齐、非冬天（门除外）则开工 60 分钟；完成 `addSegWork` → `"built"` → `wallsChanged()`；`st.repeat` 自动接同一规划里最近的下一段。
- [ ] **Step 5:** `door` tap：蓝图段切换 kind 并重置 need；已立好的墙改门 → 变成 `state: "plan", kind: "door"`（墙料退一半到杂物堆）。`remove` tap：蓝图删掉；已立好的 → 拆的活（要锤子，沿用 `startDismantle` 的时长算法，退一半料）。
- [ ] **Step 6:** 验证：预览里画一间 3×3 贴院东墙、开门、带料自己盖完，截图 500px 宽。

### Task 7: 村民送料、领着盖、跟着学（主会话）

**Files:** Modify `app.js`；`building.js` 加一个手艺键（不新增文件）。

- [ ] **Step 1:** 手艺 `wall`：`BUILDS.wall = { tier: "s", who: ["san"] }` 只用于 `npcSkill`/`teach`/手艺本，不出现在“打地基”按钮里；`buildSession`/`helpSession` 按段计时（一段 60 分钟，失手 30 分钟）。
- [ ] **Step 2:** 工地：每个 `plan` 是一个工地。`readyPlot`/`supplyFor`/`gathererProject` 的 `plotNeed` 也看工地：缺料最多的那种料，送到最近还缺它的蓝图段；一次背满可以连交几段（走到下一段）。
- [ ] **Step 3:** 会的人领着干，不会的在同一天有人领过的工地上搭手（`helpSession`）；冬天只做门。
- [ ] **Step 4:** 一段墙立好时：压在 `segRect(k, 40)` 上的人和散放牌挪到旁边可走处；若这一段让某间屋变成无门屋，屋里的人挪到门外。
- [ ] **Step 5:** 验证：预览里给阿三画一个规划，`advanceTo` 跑 3 天，看他背芦苇黏土、立墙、教阿谷。

### Task 8: 成屋、上顶、屋名、屋里的作用（主会话）

**Files:** Modify `app.js`、`board-layout.js`（给任意屋算铺位位置）。

- [ ] **Step 1:** `wallsChanged()` 后：新出现的屋（不是院子、仓房）在 `works.roofs` 里登记 `{ need: roofCost(cells).needs, work: 0, done: false }`；屋顶虚线显示；施工同墙（交料到屋里任何地方的“屋顶”隐形堆，放在屋中心）。屋消失（墙拆了）→ 删顶、退一半料。
- [ ] **Step 2:** 屋名：按屋里的牌 key 调 `roomName`；单人铺位传 `sleeper`；院子、仓房固定名。显示在 `roofEl` 的 label；点开屋里的牌，详情多一行“在灶房里”。
- [ ] **Step 3:** `board-layout.js` 加 `export function bedSpots(room, taken)`：沿屋的北墙内侧、再西墙内侧，按 `[x+30, y+24]` 起每隔 120 一张，不压门口 80px 范围；`freeBedSlot()` 先看院子的 `BED_SLOTS`，再看各有顶卧房/空屋。`layBed` 的“院里摆不下……得盖窝棚”改成“屋里摆不下铺位了，得接一间屋”。
- [ ] **Step 4:** `inYard` 的取暖、躲雨、累了在屋里歇得快、`heard` 的判断改用 `inRoom`（有顶屋）；`shelter` 去最近的有顶屋；院子以外有顶屋里的杂物和吃的按仓房的保鲜规则。
- [ ] **Step 5:** 建造菜单去掉 `bighouse`/`barn`/`hut` 的“打地基”按钮（已有的不动）；`bedChore` 里“院里铺位满了打窝棚”改为交给 Task 9。
- [ ] **Step 6:** 验证：盖好一间并上顶后，冬夜站在里面不挨冻；扎的新铺位进这间；屋名随摆设变化。

### Task 9: 村民自己扩建（主会话）

**Files:** Modify `app.js`。

- [ ] **Step 1:** 每天 `peopleDay` 里一次：`extensionNeed({...})`；有结果时挑会 `wall` 的村民，`extensionSite({ segs, rooms, w, h, free, home: 院门外 })`；`free(i,j)` 用 Task 6 的校验。
- [ ] **Step 2:** 生成规划（`by: 村民 key`），共用墙改门；`think`、`chronicle(“${名字}说院子挤了，在${方位}墙外划了一间新屋。”)`、近处 `say`。
- [ ] **Step 3:** 玩家用“取消·拆”删掉村民的规划 → `village.extDeclined = { kind, season: yearSeason }`，这一季同一理由不再提。
- [ ] **Step 4:** 成家的两口子：屋上顶后，把两人的铺位挪进去（`bedSpots`）。
- [ ] **Step 5:** 验证：预览里塞满铺位（`newStack` 加人）跑到春天，看阿三自己划屋、备料、盖好、上顶、扎铺位。

### Task 10: 收尾与老档（主会话）

- [ ] **Step 1:** 存档 `village.build` 加 `v: 1`；读档容错（字段缺失、键非法的段丢弃）。
- [ ] **Step 2:** 删 `walls-demo.html`；`README.md` 文件表加 `walls.js`、`expansion.js`、`walls-paint.js`、`walls-ui.js`、`walls.css`；`DESIGN.md` 新一节（v63）写规则、用料、实测；`ROADMAP.md` 勾相应项。
- [ ] **Step 3:** `npm test` 全过。

### Task 11: 实跑验收（主会话）

- [ ] **Step 1:** 预览 `?day=1&seed=7` 跑满一年（分段 `advanceTo`），记录：墙段数、屋数、扩建次数、芦苇黏土木头的库存曲线、有没有人卡住（同一位置停留 > 1 天且有活）、穿墙路径数（1000 条随机进出院子/新屋的 `findPath`，0 条穿墙）。
- [ ] **Step 2:** 用户存档：备份到 `openlife.cardworld.20261101.backup-before-walls`，读档、截图院子、快进 5 天；然后把原档还回去（先跳到预览地址再写回，防自动存档覆盖）。
- [ ] **Step 3:** 500px 宽截图：规划工具栏、蓝图、在盖的墙、上顶后的屋、屋名。
