// OpenLife · card world mockup v4: a generated valley under fog, flowing time, villagers who live their own days.
import { iconFor } from "./icons.js";
import { loadArt, deco as DECO } from "./art.js";
import { generateValley, walkable, reachAlong, findPath, G } from "./mapgen.js";
import { paintTerrain, paintTide } from "./terrain.js";
import { LAND, SITES, LAYOUT, PEOPLE, START } from "./valley.js";

const $ = (id) => document.getElementById(id);
const CARD_W = 112, CARD_H = 148, PEEK = 30;
// Two card sizes for now: s = everything you carry, work at, or sleep in; m = the one house you can go inside.
// A future sailing ship gets its own size, not a per-card size.
const TIERS = { s: [112, 148], m: [168, 222], l: [224, 290] };
const SIZE = { taoHouse: "m", bighouse: "l", barn: "m" };
const REVEAL = 640, SIGHT = 9999, REACH = 260, HUNT = 360;
const MOVE_RANGE = 560;                // how far you can go in one drag, fed and rested
const PX_PER_MIN = 20;                 // walking speed: px per game minute
const MIN_PER_SEC = 15;                // at 1×, one game day ≈ 96 s; dusk and dawn take a few seconds each
const SEASONS = ["春", "夏", "秋", "冬"], DAYS_PER_SEASON = 4;

const seed = Number(new URLSearchParams(location.search).get("seed")) || LAND.seed;
const MAP = generateValley(seed, LAND.w, LAND.h, SITES);
const WW = MAP.W, WH = MAP.H;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
const DEFS = {
  you:        { name: "你 · 启禾", type: "you", icon: "you", text: "十六岁，刚搬进陶家庭院帮工。" },
  aunt:       { name: "陶婶", type: "person", icon: "aunt", text: "操持家事。白天去湖边捞鱼，送去公灶。" },
  yu:         { name: "阿予", type: "person", icon: "yu", text: "种地的年轻人。收了粟就背去公仓。" },
  zao:        { name: "阿灶", type: "person", icon: "cook", text: "管公灶。从公仓取粟，煮给全村吃。" },
  zhi:        { name: "阿埴", type: "person", icon: "digger", text: "挖土的。把黏土一份份背去共用陶窑。" },
  dog:        { name: "阿黄", type: "animal", icon: "dog", text: "院子里的狗，在家附近转悠。" },
  rabbit:     { name: "野兔", type: "animal", icon: "rabbit", text: "一只野兔。你靠近它就蹦开；走近了、带着石斧或燧石刀才打得着。" },
  taoHouse:   { name: "陶家主屋", type: "house", icon: "house", text: "全村人晚上都睡在这儿。走进去就到屋里。", room: "tao" },
  stove:      { name: "公用灶台", type: "structure", icon: "stove", text: "全村吃饭的地方。走过来就吃，吃到饱为止（一份熟食顶小半个饱）。", stockLabel: "熟食" },
  granary:    { name: "公仓", type: "structure", icon: "granary", text: "村里的存粮。本身只能存 10 份粟，每放进一只陶罐多存 5 份；存不下的粟就糟蹋了。阿予收了粟背来，阿灶从这里取。", stockLabel: "粟" },
  kiln:       { name: "共用陶窑", type: "structure", icon: "kiln", text: "阿埴背来的黏土堆在这儿。带一捆柴来，就用窑上的两份黏土烧一个陶罐（自己带两份黏土也行）。空罐拿到公灶能装三份熟食。", stockLabel: "黏土" },
  field:      { name: "旱地·西块", type: "source", icon: "field", text: "阿予照看的田。照看几天才熟；带石锄来能帮着锄。", stockLabel: "长势" },
  field2:     { name: "旱地·东块", type: "source", icon: "field", text: "同一片田的另一头，阿予两边轮着照看。", stockLabel: "长势" },
  lake:       { name: "湖边", type: "source", icon: "river", text: "走过来：捞鱼。", stock: 30 },
  pit:        { name: "黏土坑", type: "source", icon: "pit", text: "河湾的黏土。走过来：挖一份。", stock: 14 },
  reeds:      { name: "芦苇荡", type: "source", icon: "reeds", text: "走过来：割芦苇（带燧石刀一次两捆）。", stock: 12 },
  chestnut:   { name: "栗子树", type: "source", icon: "chestnut", text: "走过来：伐木（带石斧一次两根木头）。木头要劈开才是柴。", stock: 8, stockLabel: "木头" },
  scree:      { name: "乱石滩", type: "source", icon: "scree", text: "山上滚下来的石头。走过来：捡一块趁手的石块。", stock: 20 },
  flintVein:  { name: "燧石", type: "source", icon: "flint", text: "乱石堆里夹着的燧石。燧石硬，要带一块石块当锤子才敲得下来。", stock: 8 },
  hemp:       { name: "葛麻丛", type: "source", icon: "hemp", text: "走过来：割葛麻剥纤维（带燧石刀一次两份）。", stock: 10 },
  berries:    { name: "野果丛", type: "source", icon: "berries", text: "春夏秋有果子，每天长一些；冬天只剩枝子。", stock: 0 },
  clay:       { name: "黏土", type: "material", icon: "clay", text: "一份湿黏土。" },
  reed:       { name: "芦苇", type: "material", icon: "reed", text: "一捆芦苇。补船用得上。" },
  stone:      { name: "石块", type: "material", icon: "stone", text: "一块趁手的石头。" },
  flint:      { name: "燧石", type: "material", icon: "flint", text: "又硬又利。" },
  fiber:      { name: "葛麻", type: "material", icon: "fiber", text: "剥好的纤维，两份能搓一根绳。" },
  rope:       { name: "麻绳", type: "material", icon: "rope", text: "一根结实的绳子。" },
  wood:       { name: "柴", type: "material", icon: "wood", text: "一捆劈好的柴。能填火、烧窑、凿船。" },
  log:        { name: "木头", type: "material", icon: "log", text: "一根木头。带石斧到火塘边劈成柴。" },
  jar:        { name: "陶罐", type: "item", icon: "jar", text: "空罐。放进公仓能多存 5 份粟；拿到公灶能装三份熟食带着走。" },
  jarFull:    { name: "满罐熟食", type: "food", icon: "jar", text: "装了三份熟食，走到哪儿都能吃。", food: 45 },
  axe:        { name: "石斧", type: "tool", icon: "axe", text: "砍树、劈柴、凿船。会用坏。", uses: 30 },
  knife:      { name: "燧石刀", type: "tool", icon: "knife", text: "割芦苇、葛麻、剥兔皮。会用坏。", uses: 24 },
  hoe:        { name: "石锄", type: "tool", icon: "hoe", text: "到旱地锄一遍，长势 +1。会用坏。", uses: 20 },
  meat:       { name: "兔肉", type: "food", icon: "meat", text: "一块兔肉。", food: 24 },
  hide:       { name: "兔皮", type: "material", icon: "hide", text: "一张兔皮，以后能做东西。" },
  deer:       { name: "鹿", type: "animal", icon: "deer", text: "林子边上的鹿，很机警，离老远就跑。要带石矛才打得着（石矛能投远些）。" },
  boar:       { name: "野猪", type: "animal", icon: "boar", text: "东坡密林里的野猪。空手靠近它会冲过来撞人；拿着火把它不敢靠近；带石矛能打它，打不中它会撞回来。" },
  peach:      { name: "桃树", type: "source", icon: "peachTree", text: "果园里的桃树。春天开花，夏天结桃，每天熟几个；秋天少，冬天没有。", stock: 0, stockLabel: "桃" },
  jujube:     { name: "枣树", type: "source", icon: "jujubeTree", text: "果园里的枣树。秋天结枣，每天熟几个。", stock: 0, stockLabel: "枣" },
  peachFruit: { name: "桃", type: "food", icon: "peach", text: "一个熟桃。", food: 14 },
  jujubeFruit:{ name: "枣", type: "food", icon: "jujube", text: "一把红枣。", food: 10 },
  tiger:      { name: "老虎", type: "animal", icon: "tiger", text: "丛林里的老虎。饿了就去扑鹿；你没拿火把走近它，它会扑人。火把能把它逼退；石矛能打它，可只有一半把握。" },
  jungleFood: { name: "丛林深处", type: "source", icon: "jungle", text: "树密得透不进光，地上长着蘑菇。这是老虎的地盘，村里人不往这儿来。", stock: 6 },
  mushroom:   { name: "蘑菇", type: "food", icon: "mushroom", text: "丛林里采的蘑菇。", food: 16 },
  pelt:       { name: "虎皮", type: "material", icon: "pelt", text: "一张虎皮。打到老虎的人，村里会记很久。" },
  duck:       { name: "野鸭", type: "animal", icon: "duck", text: "在湖面上游来游去，在芦苇里做窝。" },
  nest:       { name: "鸭窝", type: "source", icon: "nest", text: "芦苇里的鸭窝。春夏每天下两个蛋，秋天一个，冬天没有。", stock: 2 },
  egg:        { name: "鸭蛋", type: "food", icon: "egg", text: "一个鸭蛋。", food: 10 },
  spear:      { name: "石矛", type: "tool", icon: "spear", text: "打鹿、打野猪要用它，能投得远些；野猪见了它不敢冲。会用坏。", uses: 15 },
  farm:       { name: "开荒", type: "source", icon: "field", text: "开出一块新田。" },
  shallows:   { name: "湖西浅滩", type: "source", icon: "clams", text: "水浅，底下有河蚌。退潮的时候一次能摸到两只。", stock: 16 },
  clam:       { name: "河蚌", type: "food", icon: "clam", text: "一只河蚌，生吃也行。", food: 14 },
  hammer:     { name: "石锤", type: "tool", icon: "hammer", text: "带着它走到自己盖的房子上，就把它拆了，拿回一半材料；拆还没盖好的地基，材料全拿回来。", uses: 20 },
  plot:       { name: "地基", type: "structure", icon: "plot", text: "盖房子的地方。把材料带上来或者拖上来，齐了以后站在上面一段段地盖。" },
  bighouse:   { name: "大房子", type: "house", icon: "bighouse", text: "你们自己盖的大房子：屋里有火塘和铺位。" },
  barn:       { name: "仓库", type: "structure", icon: "barn", text: "放东西的地方。背着东西走上来，就都放进去；点开能一样样取出来。" },
  torch:      { name: "火把", type: "tool", icon: "torch", text: "天黑后拿着它，自己身边亮一大圈，走路不受黑影响。烧一夜就完。", burn: 480 },
  roastFish:  { name: "烤鱼", type: "food", icon: "roastFish", text: "烤得焦香，比生鱼顶饱得多。", food: 34 },
  roastMeat:  { name: "烤兔肉", type: "food", icon: "roastMeat", text: "油汪汪的，一块能顶大半天。", food: 44 },
  basket:     { name: "背篓", type: "tool", icon: "basket", text: "背着它，一次能带 10 样东西（不背只能带 4 样）。" },
  sandals:    { name: "草鞋", type: "tool", icon: "sandals", text: "穿着走得远：一次能走的距离多四分之一。走久了会磨坏。", uses: 40 },
  net:        { name: "渔网", type: "tool", icon: "net", text: "带到湖边，一网两条鱼，还快。会用坏。", uses: 20 },
  grain:      { name: "粟", type: "food", icon: "grain", text: "一份粟，生嚼也能顶一顶。", food: 12 },
  fish:       { name: "鱼", type: "food", icon: "fish", text: "一条鲜鱼。", food: 18 },
  berry:      { name: "野果", type: "food", icon: "berry", text: "酸甜的野果。", food: 10 },
  door:       { name: "门", type: "exit", icon: "door", text: "从这里出去。" },
  bed:        { name: "铺位", type: "structure", icon: "bed", text: "晚上走过来就睡到天亮；白天能歇一会儿。" },
  fire:       { name: "火塘", type: "structure", icon: "fire", text: "屋里的火。" },
};
const CARRY = new Set(["material", "food", "item", "tool"]);
const SERVING = 45;                    // one helping at the stove

// What you do when you arrive at something (with what you carry). min = game minutes. Most specific first.
// Recipes with an id are know-how: you have to have learned them (or work them out, slowly and not always).
// who: the villagers who know it and can teach you. Recipes without an id are things anyone can do.
const RECIPES = [
  { id: "jar", who: ["zhi"], needs: ["kiln", "clay", "clay", "wood"], make: ["jar"], min: 360, use: ["clay", "clay", "wood"], mark: "第一只陶罐" },
  { id: "jar", who: ["zhi"], needs: ["kiln", "wood"], make: ["jar"], min: 360, use: ["wood"], kilnClay: 2, mark: "第一只陶罐" },
  { id: "basket", who: ["yu"], needs: ["fire", "reed", "reed", "reed", "rope"], make: ["basket"], min: 180, use: ["reed", "reed", "reed", "rope"], mark: "第一只背篓" },
  { id: "net", who: ["aunt"], needs: ["fire", "fiber", "fiber", "rope"], make: ["net"], min: 180, use: ["fiber", "fiber", "rope"], mark: "第一张渔网" },
  { id: "sandals", who: ["aunt"], needs: ["fire", "reed", "reed", "fiber"], make: ["sandals"], min: 120, use: ["reed", "reed", "fiber"], mark: "第一双草鞋" },
  { id: "hoe", who: ["yu"], needs: ["fire", "stone", "log", "fiber"], make: ["hoe"], min: 120, use: ["stone", "log", "fiber"], mark: "第一把石锄" },
  { id: "roast", who: ["aunt", "zao"], needs: ["fire", "fish", "wood"], make: ["roastFish"], min: 40, use: ["fish", "wood"] },
  { id: "roast", who: ["aunt", "zao"], needs: ["fire", "meat", "wood"], make: ["roastMeat"], min: 50, use: ["meat", "wood"] },
  { id: "torch", who: ["zao"], needs: ["fire", "wood", "fiber"], make: ["torch"], min: 30, use: ["wood", "fiber"] },
  { id: "hammer", who: ["zhi"], needs: ["fire", "stone", "stone", "log"], make: ["hammer"], min: 90, use: ["stone", "stone", "log"], mark: "第一把石锤" },
  { id: "axe", who: ["yu", "zhi"], needs: ["fire", "stone", "log"], make: ["axe"], min: 120, use: ["stone", "log"], mark: "第一把石斧" },
  { id: "spear", who: ["zhi"], needs: ["fire", "flint", "log", "fiber"], make: ["spear"], min: 150, use: ["flint", "log", "fiber"], mark: "第一支石矛" },
  { id: "knife", who: ["zhi"], needs: ["fire", "flint", "log"], make: ["knife"], min: 150, use: ["flint", "log"], mark: "第一把燧石刀" },
  { id: "rope", who: ["aunt", "yu"], needs: ["fire", "fiber", "fiber"], make: ["rope"], min: 90, use: ["fiber", "fiber"] },
  { needs: ["fire", "log", "axe"], make: ["wood", "wood"], min: 90, use: ["log"] },
  { needs: ["lake", "net"], make: ["fish", "fish"], min: 90, take: true },
  { needs: ["fire", "wood"], make: [], min: 20, use: ["wood"], fuel: true },
  { needs: ["chestnut", "axe"], make: ["log", "log"], min: 120, take: true },
  { needs: ["reeds", "knife"], make: ["reed", "reed"], min: 60, take: true },
  { needs: ["hemp", "knife"], make: ["fiber", "fiber"], min: 60, take: true },
  { needs: ["flintVein", "stone"], make: ["flint"], min: 180, take: true },
  { needs: ["pit"], make: ["clay"], min: 90, take: true },
  { needs: ["reeds"], make: ["reed"], min: 60, take: true },
  { needs: ["lake"], make: ["fish"], min: 120, take: true },
  { needs: ["chestnut"], make: ["log"], min: 180, take: true },
  { needs: ["scree"], make: ["stone"], min: 45, take: true },
  { needs: ["hemp"], make: ["fiber"], min: 90, take: true },
  { needs: ["berries"], make: ["berry", "berry"], min: 40, take: true },
  { needs: ["field", "grain"], when: (t) => t.sown === false, make: [], min: 60, use: ["grain"], sow: true },
  { needs: ["field2", "grain"], when: (t) => t.sown === false, make: [], min: 60, use: ["grain"], sow: true },
  { needs: ["field"], when: (t) => t.stock >= 3 && t.sown !== false, make: ["grain", "grain", "grain"], min: 120, harvest: true },
  { needs: ["field2"], when: (t) => t.stock >= 3 && t.sown !== false, make: ["grain", "grain", "grain"], min: 120, harvest: true },
  { needs: ["field", "hoe"], when: (t) => t.sown !== false, make: [], min: 60, tend: 2 },
  { needs: ["field2", "hoe"], when: (t) => t.sown !== false, make: [], min: 60, tend: 2 },
  { needs: ["field"], when: (t) => t.sown !== false, make: [], min: 150, tend: 1 },
  { needs: ["field2"], when: (t) => t.sown !== false, make: [], min: 150, tend: 1 },
  { needs: ["nest"], make: ["egg"], min: 20, take: true },
  { needs: ["jungleFood"], make: ["mushroom"], min: 60, take: true },
  { needs: ["peach"], make: ["peachFruit"], min: 20, take: true },
  { needs: ["jujube"], make: ["jujubeFruit", "jujubeFruit"], min: 30, take: true },
  { needs: ["shallows"], make: ["clam"], min: 60, take: true },
  { needs: ["granary", "jar"], make: [], min: 15, use: ["jar"], jarIn: true },
  { needs: ["stove", "jar"], make: [], min: 15, fill: true, mark: "第一次装满一罐" },
  { needs: ["stove", "wood"], make: [], min: 20, use: ["wood"], fuel: true },
  { needs: ["stove"], make: [], min: 30, eat: true },
  { needs: ["bed"], make: [], min: 0, sleep: true },
];
const TALK = {
  aunt: ["“吃过了没有？”", "“开春雨多，罐子得修。”", "“湖里的鱼冬天不爱动。”"],
  yu: ["“地里的苗冒头了。”", "“等收了，分你一筐。”"],
  zao: ["“公仓的粟不多了。”", "“来吃一口，刚出锅的。”"],
  zhi: ["“窑上缺土，我多背两趟。”", "“烧窑得有柴，你砍柴就给窑上送点。”"],
  dog: ["（阿黄摇了摇尾巴）"],
  rabbit: ["（它竖起耳朵，随时要跑）"],
};
const HINT = {
  field: "田空着：带 1 份粟来播种", field2: "田空着：带 1 份粟来播种", granary: "公仓的粮由阿灶取用", kiln: "两份黏土加一捆柴：烧一个空陶罐",
  fire: "在火塘边打石器、搓绳子；带着空陶罐去公灶能装熟食", flintVein: "空手敲不下来，带一块石块当锤子",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let uid = 0;
const boards = { world: [], tao: [] };   // stacks per board
let board = "world";
const stacks = () => boards[board];
const clock = { min: 6 * 60, speed: 1, fast: 0 };
const me = { food: 70, rest: 90, trust: { aunt: 0, yu: 0, zao: 0, zhi: 0 }, talkedDay: {}, giftDay: {}, recent: [], auto: true, lastInput: 6 * 60 };
// Who you can direct besides yourself: anyone who trusts you enough (熟识 3), and your dog from the start.
// Each has a mode — auto (lives their own day), work (you pick the job, they do it on their own), manual (you drag them like yourself).
const TRUST_TO_JOIN = 3, IDLE_MIN = 1440;
// Know-how fades: each day you don't use a recipe, it slips a little (gone in about a week); using it brings it back.
me.known = { axe: { mem: 0.7, day: 1 } };
me.askedDay = {};
const FORGET_PER_DAY = 0.15, LEARNED_MEM = 0.8, FIGURE_CHANCE = 0.6;
// Buildings: lay a foundation first, bring the materials, then put in the work. A big house takes a lot, and long.
const BUILDS = {
  bighouse: { tier: "l", needs: { log: 10, stone: 6, reed: 8, rope: 3, clay: 4 }, work: 1440, who: ["zhi", "yu"] },
  barn: { tier: "m", needs: { log: 6, reed: 6, stone: 3 }, work: 480, who: ["yu"] },
  farm: { tier: "s", needs: {}, work: 360, who: ["yu"], tool: "hoe", grass: true },
};
const buildNeeds = (kind) => Object.entries(BUILDS[kind].needs).flatMap(([k, n]) => Array(n).fill(k));
const CRAFTS = [...new Map(RECIPES.filter((r) => r.id).map((r) => [r.id, r])).values(),
  ...Object.entries(BUILDS).map(([id, b]) => ({ id, who: b.who, build: true, needs: ["plot", ...buildNeeds(id)], make: [id] }))];   // one entry per know-how
const craftName = (id) => DEFS[CRAFTS.find((r) => r.id === id).make[0]].name;
const granaryCap = (g) => 10 + 5 * (g.jars ?? 0);
/** Carry: 4 things in your arms, 10 with a basket on your back (tools don't count). */
const loose = (st) => st.cards.filter((c, j) => j > 0 && DEFS[c.key].type !== "tool");
const capOf = (st) => (st.cards.some((c) => c.key === "basket") ? 10 : 4);
const party = { open: false };
const DEPOT = { granary: "grain", kiln: "clay", stove: "fish" };      // what each store takes in
const weather = { now: "晴" };
const discs = [];                        // explored circles
const eco = [];                          // things that grow: young trees, berry bushes, reeds
const cardsLayer = $("cards"), worldEl = $("world"), roomWorld = $("roomWorld"), table = $("table");
const layerOf = (b) => (b === "world" ? cardsLayer : roomWorld);

function newCard(key, stock, size) {
  const d = DEFS[key];
  const tier = size ?? SIZE[key] ?? "s";
  const [w, h] = TIERS[tier];
  const el = document.createElement("div");
  el.className = `card t-${d.type} size-${tier}`;
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  const hasStock = stock !== undefined || d.stock !== undefined;
  el.innerHTML = `<div class="card-head"><span>${d.name}</span>${hasStock ? `<em class="stock"></em>` : ""}</div><div class="card-art">${iconFor(d.icon)}</div><div class="intent"></div>`;
  const card = { id: ++uid, key, el, stock: stock ?? d.stock, w, h, uses: d.uses };
  el.dataset.card = card.id;
  refreshStock(card);
  return card;
}
function newStack(cards, x, y, b = board) {
  const st = { id: ++uid, x, y, cards, job: null, walk: null, board: b, w: Math.max(...cards.map((c) => c.w)), h: Math.max(...cards.map((c) => c.h)) };
  boards[b].push(st);
  for (const c of cards) layerOf(b).append(c.el);
  return st;
}
const allStacks = () => Object.values(boards).flat();
const stackOf = (card) => allStacks().find((s) => s.cards.includes(card));
const cardById = (id) => allStacks().flatMap((s) => s.cards).find((c) => c.id === Number(id));
const find = (key, b = "world") => boards[b].find((s) => s.cards[0].key === key) ?? allStacks().find((s) => s.cards[0].key === key);
const youStack = () => allStacks().find((s) => s.cards[0].key === "you");
function removeStack(st) { const a = boards[st.board]; const i = a.indexOf(st); if (i >= 0) a.splice(i, 1); st.bar?.remove(); st.bar = null; }
function refreshStock(c) {
  const em = c.el.querySelector(".stock");
  if (!em) return;
  em.textContent = c.key === "granary" ? `${c.stock}/${granaryCap(c)}` : c.sown === false ? "空" : c.stock ?? "";
  c.el.classList.toggle("empty", DEFS[c.key].type === "source" && c.key !== "field" && c.key !== "field2" && c.stock <= 0);
}
const center = (st) => ({ x: st.x + st.w / 2, y: st.y + (st.cards.length - 1) * PEEK + st.h / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const season = () => SEASONS[Math.floor((day() - 1) / DAYS_PER_SEASON) % 4];
const day = () => Math.floor((clock.min - 6 * 60) / 1440) + 1;
/** A handful of plants that actually grow: a young grove by the chestnuts, berry bushes, reeds. */
function seedEco() {
  const put = (kind, site, n, sx, sy, min, max) => {
    for (let i = 0; i < n; i++) for (let k = 0; k < 10; k++) {
      const x = site.x + (Math.random() - 0.5) * sx, y = site.y + (Math.random() - 0.5) * sy;
      if (!walkable(MAP, x, y)) continue;
      eco.push({ kind, x, y, size: min + Math.random() * (max - min), cap: 1.05 + Math.random() * 0.25, v: Math.random() });
      break;
    }
  };
  put("tree", MAP.sites.wood, 6, 560, 440, 0.4, 0.62);
  put("berry", MAP.sites.berries, 3, 300, 220, 0.55, 0.72);
  put("reeds", MAP.sites.reeds, 4, 320, 220, 0.65, 0.85);
}
function growEco() {
  const winter = season() === "冬";
  for (const e of eco) {
    if (!winter) e.size = Math.min(e.cap, e.size + 0.15);     // growth stops in winter and never passes the cap
    if (e.kind === "berry") e.bare = winter;
    if (e.kind === "reeds") e.dry = winter;
  }
  const berry = find("berries")?.cards[0];
  if (berry) berry.el.querySelector(".card-art").innerHTML = iconFor(winter ? "barebush" : "berries");
}
function rollWeather() {
  const s = season(), r = Math.random();
  weather.now = s === "冬" ? (r < 0.45 ? "雪" : "晴") : r < (s === "春" ? 0.34 : s === "夏" ? 0.18 : 0.27) ? "雨" : "晴";
  $("weather").textContent = weather.now;
  table.dataset.weather = weather.now;
  $("weatherLayer").className = `weather${weather.now === "雨" ? " rain" : weather.now === "雪" ? " snow" : ""}`;
}
/** Repaint the ground for the season: blossom, deep green, red and gold, then snow. */
function paintSeason() {
  growEco();
  table.dataset.season = season();
  const R = { home: 520, field: 560, kiln: 300, lakeside: 250, reeds: 240, clay: 240, scree: 130, wood: 190, orchard: 140, jungle: 150 };
  const clearings = Object.values(MAP.sites).map((s) => ({ x: s.x, y: s.y, r: R[s.key] ?? 220 }));
  paintTerrain($("ground"), MAP, { DECO, keepClear: [...boards.world.map(center), ...clearings], season: season(), eco });
  tide.level = null; updateTide();
}
/** Two tides a day: the lake swells over its beach and drains back, showing wet sand. */
const tide = { level: null };
const tideNow = () => Math.sin((clock.min / (12.4 * 60)) * Math.PI * 2);
function updateTide() {
  const lv = tideNow();
  if (tide.level !== null && Math.abs(lv - tide.level) < 0.05) return;
  tide.level = lv; paintTide($("tide"), MAP, lv, season());
}

// ---------------------------------------------------------------------------
// Build: cards go where the generator put each place
// ---------------------------------------------------------------------------
/** A card centre near (x, y) that stands on dry ground (boats: on the nearest water). */
function settle(x, y, boat = false, w = CARD_W, h = CARD_H) {
  const dry = (px, py) => [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42], [0, 0]].every(([kx, ky]) => walkable(MAP, px + kx * w, py + ky * h));
  const wet = (px, py) => !walkable(MAP, px, py) && MAP.cls[MAP.idx(px, py)] !== G.ROCK && MAP.cls[MAP.idx(px, py)] !== G.SNOW;
  const ok = (px, py) => (boat ? wet(px, py) : dry(px, py));
  for (let r = 0; r < 900; r += 20) for (let a = 0; a < 16; a++) { const px = x + Math.cos(a * 0.39) * r, py = y + Math.sin(a * 0.39) * r; if (ok(px, py)) return { x: px, y: py }; }
  return { x, y };
}
const at = ([site, dx, dy]) => { const s = MAP.sites[site]; return { x: s.x + dx, y: s.y + dy }; };
function placeCard(key, p, stock) {
  const c = newCard(key, stock);
  const q = settle(p.x, p.y, DEFS[key].type === "boat", c.w, c.h);
  return newStack([c], q.x - c.w / 2, q.y - c.h / 2, "world");
}
function build() {
  for (const [site, list] of Object.entries(LAYOUT)) for (const [k, dx, dy, stock] of list) placeCard(k, at([site, dx, dy]), stock);
  for (const [k, n] of Object.entries(PEOPLE)) {
    const order = Object.keys(PEOPLE).indexOf(k);
    const st = placeCard(k, at(n.at));
    st.npc = { key: k, order, home: n.home, job: n.job, hunger: 2 + Math.random() * 2, wait: 0, inside: false,
      wake: 5.6 + order * 0.15, sleep: 20 + order * 0.12, outAt: 0 };
  }
  const dog = placeCard("dog", at(START.dog));
  dog.pet = { home: center(dog) };
  dog.ctl = { mode: "auto", job: "carry" };
  for (const [kind, sp] of Object.entries(SPECIES)) for (let i = 0; i < sp.n; i++) spawnAnimal(kind);
  placeCard("you", at(START.you));
  for (const [k, x, y] of ROOMS.tao) newStack([newCard(k)], x, y, "tao");
  const fire = find("fire")?.cards[0]; if (fire) fire.fuel = 2;
  const stoveCard = find("stove")?.cards[0]; if (stoveCard) stoveCard.fuel = 3;
  seedEco();
  rollWeather();
  const berry = find("berries")?.cards[0];
  if (berry && season() !== "冬") { berry.stock = 4; refreshStock(berry); }
  explore(center(youStack()));
  paintSeason();
}
const ROOMS = { tao: [["door", 470, 520], ["bed", 180, 140], ["fire", 470, 250], ["grain", 760, 150], ["grain", 800, 175]] };

const SPECIES = {
  rabbit: { n: 1, roam: 600, fear: 300, speed: 1.8, home: () => quietSpot() },
  deer: { n: 3, roam: 650, fear: 380, speed: 2.2, home: () => nearSite(["jungle"], 480) },
  tiger: { n: 1, roam: 520, fear: 0, speed: 1.1, predator: true, home: () => nearSite(["jungle"], 220) },
  boar: { n: 1, roam: 420, fear: 0, speed: 1.4, aggro: true, home: () => nearSite(["jungle"], 420) },
  duck: { n: 3, roam: 420, fear: 220, speed: 0.6, water: true, home: () => lakeSpot() },
};
const HUNT_BY = { rabbit: ["axe", "knife", "spear"], deer: ["spear"], boar: ["spear"], tiger: ["spear"] };
const LOOT = { rabbit: ["meat", "hide"], deer: ["meat", "meat", "hide"], boar: ["meat", "meat", "meat", "hide"], tiger: ["meat", "meat", "pelt"] };
const inJungle = (p) => MAP.jungle[MAP.idx(p.x, p.y)] === 1;
const inLake = (p) => p.x > 0 && p.y > 0 && p.x < MAP.W && p.y < MAP.H && MAP.water[MAP.idx(p.x, p.y)] === 1;
function nearSite(keys, r) {
  const s = MAP.sites[pick(keys)];
  for (let k = 0; k < 40; k++) { const a = Math.random() * 6.28, p = { x: s.x + Math.cos(a) * r * (0.7 + Math.random() * 0.6), y: s.y + Math.sin(a) * r * (0.7 + Math.random() * 0.6) }; if (walkable(MAP, p.x, p.y)) return p; }
  return { x: s.x, y: s.y + 200 };
}
function lakeSpot() {
  const r = MAP.sites.reeds; let best = null, bd = 1e9;
  for (let i = 0; i < MAP.cls.length; i += 2) if (MAP.water[i] === 1) { const p = { x: MAP.X(i), y: MAP.Y(i) }, d = Math.abs(dist(p, r) - 260) + Math.random() * 200; if (d < bd) { bd = d; best = p; } }
  return best ?? { x: MAP.lake.x, y: MAP.lake.y };
}
function spawnAnimal(kind) {
  const sp = SPECIES[kind], p = sp.home(), c = newCard(kind);
  const st = newStack([c], p.x - c.w / 2, p.y - c.h / 2, "world");
  st.critter = { kind, ...sp, home: p };
  return st;
}
/** Somewhere quiet for the rabbit: open meadow, well away from the house, the places and the paths people walk. */
function quietSpot() {
  const home = MAP.sites.home; let best = null, bs = -1;
  for (let i = 0; i < MAP.cls.length; i += 3) {
    if (MAP.cls[i] !== G.MEADOW || MAP.road[i]) continue;
    const p = { x: MAP.X(i), y: MAP.Y(i) }, dh = dist(p, home);
    if (dh < 650 || dh > 1300) continue;
    const s = Math.min(...boards.world.map((st) => dist(p, center(st))), ...Object.values(MAP.sites).map((q) => dist(p, q)));
    if (s > bs) { bs = s; best = p; }
  }
  return best ?? at(["home", -300, 280]);
}

// ---------------------------------------------------------------------------
// Fog of war: dark until you have been near; villagers out of sight are only where you last saw them
// ---------------------------------------------------------------------------
function explore(p) {
  if (discs.some((d) => dist(d, p) < 140)) return;
  discs.push({ x: p.x, y: p.y });
  paintFog();
}
const known = (p) => discs.some((d) => dist(d, p) < REVEAL - 60);
function paintFog() {
  const c = $("fog"), K = 0.15;
  c.width = WW * K; c.height = WH * K;
  const g = c.getContext("2d");
  g.scale(K, K);
  g.fillStyle = "rgba(42,33,25,1)"; g.fillRect(0, 0, WW, WH);
  g.globalCompositeOperation = "destination-out";
  for (const d of discs) {
    const grad = g.createRadialGradient(d.x, d.y, REVEAL * 0.55, d.x, d.y, REVEAL);
    grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(d.x, d.y, REVEAL, 0, Math.PI * 2); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  // The rim of the world fades into the same mist, so walking up to the edge never shows a hard border.
  const E = 300;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [[0, 0, E, 0, 0, 0, E, WH], [WW, 0, WW - E, 0, WW - E, 0, E, WH], [0, 0, 0, E, 0, 0, WW, E], [0, WH, 0, WH - E, 0, WH - E, WW, E]]) {
    const edge = g.createLinearGradient(x0, y0, x1, y1);
    edge.addColorStop(0, "rgba(42,33,25,1)"); edge.addColorStop(0.35, "rgba(42,33,25,.75)"); edge.addColorStop(1, "rgba(42,33,25,0)");
    g.fillStyle = edge; g.fillRect(rx, ry, rw, rh);
  }
}

// ---------------------------------------------------------------------------
// Camera: drag empty ground to look around, wheel or buttons to zoom, ◎ to come back
// ---------------------------------------------------------------------------
const cam = { x: 0, y: 0, z: 1, follow: true };
function applyCam() {
  const r = table.getBoundingClientRect();
  cam.z = Math.max(Math.max(r.width / 2600, r.height / 1700, 0.45), Math.min(1.6, cam.z));
  const hw = r.width / 2 / cam.z, hh = r.height / 2 / cam.z;
  // The edge of the world can come to the middle of the screen, so you can always be at the centre; beyond it is mist.
  void hw; void hh;
  cam.x = Math.max(0, Math.min(WW, cam.x));
  cam.y = Math.max(0, Math.min(WH, cam.y));
  worldEl.style.transform = `translate(${r.width / 2 - cam.x * cam.z}px, ${r.height / 2 - cam.y * cam.z}px) scale(${cam.z})`;
}
const toWorld = (cx, cy) => {
  const r = (board === "world" ? worldEl : roomWorld).getBoundingClientRect();
  const k = board === "world" ? cam.z : roomK;
  return { x: (cx - r.left) / k, y: (cy - r.top) / k };
};
$("zoomIn").onclick = () => { cam.z *= 1.25; applyCam(); };
$("zoomOut").onclick = () => { cam.z /= 1.25; applyCam(); };
$("findMe").onclick = () => { cam.follow = true; };
table.addEventListener("wheel", (e) => {
  if (board !== "world") return;
  e.preventDefault();
  const before = toWorld(e.clientX, e.clientY);
  cam.z *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
  applyCam();
  const after = toWorld(e.clientX, e.clientY);
  cam.x += before.x - after.x; cam.y += before.y - after.y; cam.follow = false;
  applyCam();
}, { passive: false });
let roomK = 1;
function fitRoom() {
  const r = table.getBoundingClientRect();
  roomK = Math.min(r.width / 1060, r.height / 700);
  roomWorld.style.transform = `translate(${(r.width - 1060 * roomK) / 2}px, ${(r.height - 700 * roomK) / 2}px) scale(${roomK})`;
}

// ---------------------------------------------------------------------------
// Body: hunger and strength change how far you get and how fast you work
// ---------------------------------------------------------------------------
const hungry = () => me.food < 25, starving = () => me.food <= 0, tired = () => me.rest < 25, spent = () => me.rest <= 0;
const youAt = () => { const y = youStack(); return y ? center(y) : null; };
/** p: where you set off from. In the dark you can't see where you put your feet — unless a fire lights the way. */
const groping = (p = youAt()) => board === "world" && darkness() > 0.5 && !(p && litAt(p));
function moveRange(p = youAt()) {
  let k = starving() ? 0.4 : hungry() ? 0.7 : 1;
  k *= spent() ? 0.5 : tired() ? 0.8 : 1;
  if (groping(p)) k *= 0.5;
  if (youStack()?.cards.some((c) => c.key === "sandals")) k *= 1.25;
  return MOVE_RANGE * k;
}
const workPace = () => (hungry() ? 1.4 : 1) * (tired() ? 1.4 : 1);
function bodyState() {
  const s = [];
  if (starving()) s.push("饿得发慌：走不远，干不了活");
  else if (hungry()) s.push("饿了：走不远，干活慢");
  if (spent()) s.push("累垮了：得睡一觉");
  else if (tired()) s.push("累了：干活慢");
  if (groping()) s.push("天黑看不清路：走不远");
  return s;
}
function eat(food, where) {
  me.food = Math.min(100, me.food + food);
  float(me.food >= 100 ? "吃饱了" : `饱 +${Math.round(food)}`, where, board);
}

// ---------------------------------------------------------------------------
// Input: drag "you" directly; drag nearby things; drag empty ground to pan; tap to look
// ---------------------------------------------------------------------------
let drag = null, selected = false;
table.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".detail")) return;
  hideDetail();
  me.lastInput = clock.min;
  try { table.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in checks */ }
  const el = e.target.closest(".card");
  if (!el || el.classList.contains("hidden")) { drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false }; return; }
  const card = cardById(el.dataset.card), st = stackOf(card);
  const i = st.cards.indexOf(card);
  const kind = card.key === "you" ? "move" : i === 0 && st.ctl?.mode === "manual" ? "steer" : CARRY.has(DEFS[card.key].type) && !st.npc ? "item" : "none";
  const p = toWorld(e.clientX, e.clientY);
  drag = { kind, card, st, i, sx: e.clientX, sy: e.clientY, ox: p.x - st.x, oy: p.y - st.y - i * PEEK, moved: false };
});
table.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
  drag.moved = true;
  if (drag.kind === "pan") {
    if (board !== "world") return;
    cam.follow = false;
    cam.x = drag.cx - (e.clientX - drag.sx) / cam.z; cam.y = drag.cy - (e.clientY - drag.sy) / cam.z;
    applyCam(); return;
  }
  const p = toWorld(e.clientX, e.clientY);
  if (drag.kind === "move") { moveYou(p); return; }
  if (drag.kind === "steer") { steerMove(p); return; }
  if (drag.kind === "item") {
    if (!drag.lift) {
      const taken = drag.st.cards.splice(drag.i);
      if (!drag.st.cards.length) removeStack(drag.st);
      drag.lift = newStack(taken, drag.st.x, drag.st.y + drag.i * PEEK, drag.st.board);
      drag.lift.lifted = true;
    }
    drag.lift.x = p.x - drag.ox; drag.lift.y = p.y - drag.oy;
    drag.target = targetAt({ x: p.x, y: p.y - drag.oy + PEEK }, drag.lift);
    markTarget(drag.target);
  }
});
table.addEventListener("pointerup", (e) => {
  const d = drag; drag = null;
  $("aim").classList.remove("on"); markTarget(null);
  if (!d) return;
  if (!d.moved) {
    if (d.kind === "pan") { if (placing) return placeFoundation(toWorld(e.clientX, e.clientY)); if (selected) { walkTo(youStack(), toWorld(e.clientX, e.clientY)); select(false); } return; }
    return tap(d.card);
  }
  if (d.kind === "move") { if (d.from) dropYou(d); return; }
  if (d.kind === "steer") { if (d.from) steerDrop(d); return; }
  if (d.kind === "item" && d.lift) {
    d.lift.lifted = false;
    const you = youStack(), there = center(d.lift);
    const wasOnYou = d.st === you, near = (p) => board !== "world" || dist(p, center(you)) < moveRange() * 1.5;
    if (!near(there) || (!wasOnYou && !near(center(d.st)))) {
      toast("够不着，先走过去");
      if (boards[d.st.board].includes(d.st)) { d.st.cards.push(...d.lift.cards); removeStack(d.lift); }
      else { d.lift.x = d.st.x; d.lift.y = d.st.y; }
      carryChanged();
      return;
    }
    if (d.target?.npc && d.lift.cards.every((c) => DEFS[c.key].type === "food")) { giveFood(d.target, d.lift); carryChanged(); return; }
    if (d.target?.cards[0].key === "plot") { handIn(d.target, d.lift); carryChanged(); return; }
    const place = d.target?.cards[0].key, tools = d.lift.cards.filter((c) => DEFS[c.key].type === "tool");
    if (place && DEFS[place].type === "source" && tools.length) {
      const fits = tools.filter((c) => TOOL_AT[place]?.includes(c.key) && !toolAt(d.target, c.key));
      const back = d.lift.cards.filter((c) => !fits.includes(c));
      if (fits.length) { d.target.cards.push(...fits); float(`${fits.map((c) => DEFS[c.key].name).join("、")}放在这儿了：来这儿干活不用再带`, center(d.target), "world"); }
      else toast(TOOL_AT[place] ? `这儿已经放着${DEFS[TOOL_AT[place][0]].name}了` : `${DEFS[tools[0].key].name}在这儿用不上`);
      if (back.length) youStack().cards.push(...back);
      removeStack(d.lift); carryChanged(); return;
    }
    if (d.target?.cards[0].key === "barn") { const b = d.target.cards[0]; b.items.push(...d.lift.cards.map((c) => c.key)); d.lift.cards.forEach((c) => c.el.remove()); removeStack(d.lift); float(`放进${b.name ?? "仓库"}`, center(d.target), "world"); carryChanged(); return; }
    if (d.target && !d.target.npc) { d.target.cards.push(...d.lift.cards); removeStack(d.lift); if (d.target === you) overflow(you); }
    carryChanged();
  }
});
function targetAt(p, self) {
  let best = null, bd = Infinity;
  for (const o of stacks()) {
    if (o === self || o.lifted || o.cards[0].el.classList.contains("hidden")) continue;
    const top = o.y + (o.cards.length - 1) * PEEK;
    const d = Math.hypot(o.x + o.w / 2 - p.x, top + o.h / 2 - p.y);
    const limit = Math.max(110, Math.min(o.w, o.h) * 0.55);
    if (d < limit && d < bd) { best = o; bd = d; }
  }
  return best;
}
function markTarget(st) {
  document.querySelectorAll(".drop-ok").forEach((n) => n.classList.remove("drop-ok"));
  if (st) st.cards[st.cards.length - 1].el.classList.add("drop-ok");
}
const blockedBy = (p) => { const c = MAP.cls[MAP.idx(p.x, p.y)]; return c === G.ROCK || c === G.SNOW ? "山太陡，上不去" : "水太深，过不去"; };
/** Dragging "you": the card follows the finger, but only as far as one stretch of walking, and not into water or up cliffs. */
function moveYou(p) {
  const you = drag.st;
  if (!drag.from) { cancelJob(you); you.walk = null; you.travel = null; you.lifted = true; drag.from = { x: you.x, y: you.y }; select(false); }
  let x = p.x - drag.ox, y = p.y - drag.oy;
  if (board === "world") {
    const range = moveRange({ x: drag.from.x + CARD_W / 2, y: drag.from.y + CARD_H / 2 }), dx = x - drag.from.x, dy = y - drag.from.y, d = Math.hypot(dx, dy);
    drag.edge = d > range;
    if (drag.edge) { x = drag.from.x + (dx / d) * range; y = drag.from.y + (dy / d) * range; }
    const a = { x: drag.from.x + CARD_W / 2, y: drag.from.y + CARD_H / 2 }, want = { x: x + CARD_W / 2, y: y + CARD_H / 2 };
    const got = reachAlong(MAP, a, want);
    drag.blocked = got.blocked ? blockedBy({ x: got.x + (want.x - a.x) * 0.05, y: got.y + (want.y - a.y) * 0.05 }) : "";
    x = got.x - CARD_W / 2; y = got.y - CARD_H / 2;
  }
  you.x = x; you.y = y;
  drag.target = targetAt({ x: x + CARD_W / 2, y: y + CARD_H / 2 - 20 }, you);
  markTarget(drag.target);
  if (board !== "world") return;
  const a = { x: drag.from.x + CARD_W / 2, y: drag.from.y + CARD_H / 2 }, b = center(you);
  const line = $("aimLine"), ring = $("aimRange");
  line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
  ring.setAttribute("cx", a.x); ring.setAttribute("cy", a.y); ring.setAttribute("r", moveRange(a));
  $("aim").classList.add("on"); $("aim").classList.toggle("edge", drag.edge || Boolean(drag.blocked));
}
/** Let go: you are there; the walk takes its time before you start on whatever is there. */
function dropYou(d) {
  const you = d.st; you.lifted = false;
  const t = d.target;
  if (d.blocked && !t) toast(d.blocked);
  if (t) Object.assign(you, standOn(you, t));
  if (board !== "world") { if (t) arrive(you, t); return; }
  const mins = Math.round(dist(d.from, you) / PX_PER_MIN);
  me.rest = Math.max(0, me.rest - mins * 0.04);
  if (mins >= 3) wearTool(you, "sandals");
  cam.follow = true;
  if (mins < 3) { if (t) arrive(you, t); return; }
  you.travel = { target: t, until: clock.min + mins };
}
function tap(card) {
  const st = stackOf(card);
  if (card.key === "you") { select(!selected); return; }
  if (selected) { walkTo(youStack(), center(st), st); select(false); return; }
  showDetail(card);
}
function select(on) { selected = on; youStack()?.cards[0].el.classList.toggle("sel", on); }

// ---------------------------------------------------------------------------
// Walking and doing
// ---------------------------------------------------------------------------
/** You, by tapping: one stretch at a time, straight, stopping at water or cliffs. */
function walkTo(st, p, target = null) {
  if (!st) return;
  cancelJob(st);
  const from = center(st), d = dist(from, p), range = moveRange(from);
  if (st.board === "world") {
    if (d > range) { if (target) return toast("太远了，一次走不到那儿"); p = { x: from.x + (p.x - from.x) / d * range, y: from.y + (p.y - from.y) / d * range }; }
    const got = reachAlong(MAP, from, p);
    if (got.blocked) { toast(blockedBy(p)); target = null; p = got; }
  }
  st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, target };
  cam.follow = true;
}
/** Where a stack ends up on a card: you stack squarely on it (its title still showing); villagers stand a little to the side. */
const SLOTS = [[0, 0], [34, 20], [-34, 20], [0, 40]];             // up to four villagers on one card, all still on it
function standOn(st, t) {
  const top = t.y + (t.cards.length - 1) * PEEK, x = t.x + (t.w - CARD_W) / 2, y = top + t.h - CARD_H + PEEK;
  if (st.cards[0].key === "you" || !st.npc) return { x, y };
  let slot = st.parkedAt === t ? st.slot : -1;
  if (slot < 0) {
    const used = new Set(boards[t.board].filter((s) => s !== st && s.parkedAt === t).map((s) => s.slot));
    slot = [0, 1, 2, 3].find((i) => !used.has(i)) ?? 3;
  }
  const [dx, dy] = SLOTS[slot];
  return { x: x + dx, y: y + PEEK + dy, slot };
}
const pathCache = new Map();
/** Villagers walk the roads: a path of waypoints round water and cliffs. */
function route(st, target) {
  const goal = standOn(st, target), a = center(st), b = { x: goal.x + CARD_W / 2, y: goal.y + CARD_H / 2 };
  const key = `${MAP.idx(a.x, a.y)}>${MAP.idx(b.x, b.y)}`;
  let path;
  const wary = Boolean(st.npc);                                     // villagers know where the tiger lives
  const ck = `${key}${wary ? "|w" : ""}`;
  path = pathCache.get(ck);
  if (path === undefined) { path = findPath(MAP, a, b, { wary }); pathCache.set(ck, path); }
  return path ? path.slice(0, -1) : null;
}
/** Returns true on arrival. */
function stepWalk(st, minutes, speed = 1) {
  const w = st.walk;
  let step = PX_PER_MIN * minutes * speed;
  for (let guard = 0; guard < 8 && step > 0; guard++) {
    let tx, ty, last = true;
    if (w.path && w.k < w.path.length) { tx = w.path[w.k].x - CARD_W / 2; ty = w.path[w.k].y - CARD_H / 2; last = false; }
    else if (w.target) {
      if (!boards[st.board].includes(w.target)) { st.walk = null; return false; }
      ({ x: tx, y: ty } = standOn(st, w.target));
    } else { tx = w.x; ty = w.y; }
    const dx = tx - st.x, dy = ty - st.y, d = Math.hypot(dx, dy);
    if (d <= step + 1) { st.x = tx; st.y = ty; step -= d; if (last) return true; w.k++; continue; }
    st.x += (dx / d) * step; st.y += (dy / d) * step;
    return false;
  }
  return false;
}

/** You (and what you carry) arrive at something: talk, go in or out, board a boat, or work with it. */
function arrive(st, target) {
  const top = target.cards[0], def = DEFS[top.key];
  if (st.unloading) { st.unloading = false; if (unload(st, target)) return; }
  const hammer = st.cards.some((c) => c.key === "hammer");
  if (hammer && (top.built || (top.key === "plot" && !loose(st).length && Object.values(top.need).some((v) => v > 0)))) return startDismantle(st, target);
  if (top.key === "plot") return workPlot(st, target);
  if (top.key === "barn" && loose(st).length) return storeIn(target, st);
  const room = top.room ?? def.room;
  if (room) return enterRoom(room, st);
  if (top.key === "door") return leaveRoom(st);
  const kit = target.cards.slice(1).filter((c) => DEFS[c.key].type === "tool").map((c) => c.key);   // tools left here
  const carried = [...st.cards.slice(1).map((c) => c.key), ...kit];
  const has = (k, n) => carried.filter((c) => c === k).length >= n;
  let r = RECIPES.find((x) => x.needs[0] === top.key && (!x.when || x.when(top)) && x.needs.slice(1).every((k) => has(k, x.needs.filter((a) => a === k).length)));
  if ((def.type === "person" || def.type === "animal") && !r) return talk(target, st);
  if (!r) return toast(HINT[top.key] ?? "这里没什么可做的");
  if (r.take && top.stock <= 0) return toast(top.key === "berries" && season() === "冬" ? "冬天没有果子" : "这里已经取空了");
  if (r.eat) {
    if (me.food >= 95) return toast("还饱着呢");
    if (top.stock <= 0) return toast("锅里空了，等阿灶煮");
  }
  if (r.sleep) {
    if (hour() >= 19 || hour() < 6) return sleepTillDawn();
    if (me.rest >= 90) return toast("不累，歇不着");
    st.job = { r: { ...r, nap: true, make: [] }, target, left: 120, total: 120 };
    return;
  }
  if (r.kilnClay && top.stock < r.kilnClay) return toast("窑上的黏土不够两份——等阿埴背来，或自己带两份");
  if (!r.eat && starving()) return toast("饿得干不动了，先去吃点东西");
  if (!r.eat && spent()) return toast("没力气了，回屋睡一觉");
  if (r.fill) {
    if (top.stock >= 3) {
      st.job = { r, target, left: r.min, total: r.min };
      if (target.npc) target.npc.wait = r.min + 10;
      return;
    }
    // Not enough cooked food to fill it: eat here instead of standing around with an empty jar.
    const alt = RECIPES.find((x) => x.needs[0] === top.key && x.eat);
    if (!alt) return toast("锅里不够三份");
    if (me.food >= 95) return toast("还饱着呢");
    r = alt;
  }
  const servings = r.eat ? Math.min(top.stock, Math.ceil((100 - me.food) / SERVING)) : 0;
  const ebb = top.key === "lake" && tide.level < -0.3 ? 0.7 : 1;      // low water: the fish are easier to reach
  const figuring = st.cards[0].key === "you" && r.id && !me.known[r.id];      // never learned, or forgotten: work it out
  if (r.take && st.cards[0].key === "you" && loose(st).length >= capOf(st)) return toast("背不下了，先放下点东西");
  const min = (r.eat ? r.min * servings : r.min * workPace() * ebb) * (figuring ? 2 : 1);
  st.job = { r, target, left: min, total: min, servings, figuring };
  if (figuring) float("没做过，琢磨着来……", center(st), st.board);
  if (target.npc) target.npc.wait = min + 10;
  if (!r.eat && !r.nap && st.cards[0].key === "you") remember(target.cards[0].key);
}
function gainTrust(st) {
  const k = st.cards[0].key;
  me.trust[k] = (me.trust[k] ?? 0) + 1;
  if (me.trust[k] >= TRUST_TO_JOIN && !st.ctl) {
    st.ctl = { mode: "auto", job: st.npc.job };
    banner("✦", `${DEFS[k].name}愿意听你安排了`);
    renderParty();
  }
}
/** Hand a villager something to eat: they eat it, and think a little better of you (once a day). */
function giveFood(target, lift) {
  const k = target.cards[0].key;
  lift.cards.forEach((c) => { c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); });
  removeStack(lift);
  target.npc.hunger = 0;
  say(target, "“给我的？那我不客气了。”");
  if (k in me.trust && me.giftDay[k] !== day()) { me.giftDay[k] = day(); gainTrust(target); }
}
function talk(target, st) {
  const k = target.cards[0].key;
  say(target, pick(TALK[k] ?? ["……"]));
  if (target.npc) { target.npc.wait = 40; face(target, st); }
  if (k in me.trust && me.talkedDay[k] !== day()) { me.talkedDay[k] = day(); gainTrust(target); }
}
function finish(st) {
  const { r, target, servings, figuring } = st.job; st.job = null; st.bar?.remove(); st.bar = null;
  const t = target.cards[0];
  if (r.dismantle) return finishDismantle(st, target, r);
  if (r.build) return finishBuildWork(st, target, figuring);
  if (figuring) {
    if (Math.random() > FIGURE_CHANCE) { float("没琢磨出来，东西还在", center(st), st.board); me.rest = Math.max(0, me.rest - r.min * 0.1); return carryChanged(); }
    me.known[r.id] = { mem: 1, day: day() };
    banner("✦", `自己琢磨出来了：${craftName(r.id)}`);
  }
  for (const k of r.use ?? []) { const i = st.cards.findIndex((c, j) => j > 0 && c.key === k); if (i > 0) { const [c] = st.cards.splice(i, 1); c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); } }
  if (r.take) { t.stock -= 1; refreshStock(t); }
  if (r.kilnClay) { t.stock -= r.kilnClay; refreshStock(t); }
  if (r.eat) { t.stock -= servings; refreshStock(t); eat(SERVING * servings, center(st)); }
  if (r.nap) { me.rest = Math.min(100, me.rest + 40); float("歇过来一些", center(st), st.board); }
  if (r.fill) {
    const i = st.cards.findIndex((c, j) => j > 0 && c.key === "jar");
    if (i > 0) {
      const old = st.cards[i]; old.el.remove();
      const c = newCard("jarFull"); c.charges = 3;
      st.cards.splice(i, 1, c); layerOf(st.board).append(c.el); c.el.classList.add("pop");
      float("装满一罐", center(st), st.board);
    }
    t.stock = Math.max(0, t.stock - 3); refreshStock(t);
  }
  if (r.harvest) { t.stock = 0; t.sown = false; refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor("field"); }
  if (r.sow) { t.sown = true; t.stock = 0; refreshStock(t); float("种下了", center(target), target.board); }
  if (r.jarIn) { t.jars = (t.jars ?? 0) + 1; refreshStock(t); float(`公仓能存 ${granaryCap(t)} 份了`, center(target), "world"); }
  if (r.take && t.key === "shallows" && tide.level < -0.3) { const c = newCard("clam"); layerOf(st.board).append(c.el); st.cards.push(c); float("退潮，多摸到一只", center(st), st.board); }
  if (r.tend) { t.stock = Math.min(3, (t.stock ?? 0) + r.tend); if (r.tend > 1) float("石锄：长势 +2", center(target), target.board); refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor(t.stock >= 3 ? "fieldRipe" : "field"); float("锄了一遍", center(target), target.board); }
  if (r.fuel) { t.fuel = Math.min(6, (t.fuel ?? 0) + 1); float("火更旺了", center(target), target.board); }
  if (r.say) say(target, r.say);
  for (const k of r.make) { const c = newCard(k); layerOf(st.board).append(c.el); st.cards.push(c); c.el.classList.add("pop"); float(`+1 ${DEFS[k].name}`, center(st), st.board); }
  if (r.mark && !marks.has(r.mark)) { marks.add(r.mark); banner("✦", r.mark); }
  if (r.id && st.cards[0].key === "you") {
    if (!st.job?.figuring && me.known[r.id]) me.known[r.id] = { mem: 1, day: day() };
  }
  overflow(st);
  if (!r.eat && !r.nap) me.rest = Math.max(0, me.rest - r.min * 0.1);
  for (const k of (r.needs ?? []).filter((k) => k === "axe" || k === "knife" || k === "hoe" || k === "net")) wearTool(st, k) || wearTool(target, k);
  if (r.harvest) overflow(st);
  // Standing on a tree or bush: keep at it until it is picked clean, you are too hungry/tired, or you walk away.
  if (st.cards[0].key === "you" && r.take && t.stock > 0 && loose(st).length >= capOf(st)) toast("背满了");
  else if (st.cards[0].key === "you" && r.take && t.stock > 0 && me.food > 20 && me.rest > 15) {
    setTimeout(() => {
      if (st.job || st.walk || st.lifted || !boards[st.board]?.includes(target)) return;
      arrive(st, target);
    }, 650);
  } else if (st.cards[0].key === "you" && r.take && t.stock > 0) {
    if (me.food <= 20) toast("饿得干不动了");
    else if (me.rest <= 15) toast("累了，先歇会儿");
  }
  carryChanged();
}
const marks = new Set();
/** Too much to carry: what doesn't fit is put down on the ground beside you. */
function overflow(st) {
  if (st.cards[0].key !== "you") return;
  const extra = loose(st).slice(capOf(st));
  if (!extra.length) return;
  st.cards = st.cards.filter((c) => !extra.includes(c));
  newStack(extra, st.x + CARD_W + 24, st.y + 10, st.board);
  toast(st.cards.some((c) => c.key === "basket") ? "背篓满了，多的放在地上" : "手上拿不下，多的放在地上（背篓能多装）");
}
/** Ask a villager to show you something they know that you don't (or have nearly forgotten). Once a day each. */
function teach(npc) {
  const k = npc.cards[0].key;
  if (me.askedDay[k] === day()) return say(npc, "“今天教过你了，明天再来。”");
  if ((me.trust[k] ?? 0) < 1) return say(npc, "“你是谁家的？先说说话吧。”");
  const theirs = CRAFTS.filter((r) => r.who.includes(k));
  const pickOne = theirs.find((r) => !me.known[r.id]) ?? theirs.filter((r) => me.known[r.id].mem < 0.6).sort((a, b) => me.known[a.id].mem - me.known[b.id].mem)[0];
  if (!pickOne) return say(npc, "“我会的你都会了。”");
  me.askedDay[k] = day();
  me.known[pickOne.id] = { mem: LEARNED_MEM, day: day() };
  const parts = pickOne.build ? Object.entries(BUILDS[pickOne.id].needs).map(([k, n]) => `${DEFS[k].name}${n}`).join("、") : pickOne.needs.slice(1).map((n) => DEFS[n].name).join("、");
  say(npc, pickOne.build ? `“盖${craftName(pickOne.id)}？先找块平地打地基，再备齐${parts}。”` : `“${craftName(pickOne.id)}？去${DEFS[pickOne.needs[0]].name}，带上${parts}。”`);
  banner("✦", `${DEFS[k].name}教会你：${craftName(pickOne.id)}`);
  renderCrafts();
}
function wearTool(st, key) {
  const i = st.cards.findIndex((c, j) => j > 0 && c.key === key);
  if (i < 0) return false;
  const tool = st.cards[i];
  tool.uses = (tool.uses ?? DEFS[key].uses) - 1;
  if (tool.uses > 0) return true;
  st.cards.splice(i, 1); tool.el.classList.add("gone"); setTimeout(() => tool.el.remove(), 300);
  float(`${DEFS[key].name}坏了`, center(st), st.board);
  return true;
}
/** Hunt the rabbit: needs a tool and to be close. Bare hands only scare it off. */
/** How far you can strike from: a spear can be thrown. */
const huntRange = (you) => (you?.cards.some((c) => c.key === "spear") ? 520 : HUNT);
function attackRabbit(card) {
  const rabbit = stackOf(card), you = youStack(), kind = card.key;
  if (!rabbit || !you || rabbit.board !== board) return;
  const a = center(you), b = center(rabbit);
  if (dist(a, b) > huntRange(you)) return toast("太远了，再靠近点");
  const tools = you.cards.slice(1).filter((c) => HUNT_BY[kind].includes(c.key));
  if (kind === "boar" && tools.length && Math.random() < 0.3) { wearTool(you, tools[0].key); toast("没扎中！野猪冲过来了"); return charge(rabbit, you); }
  if (kind === "tiger" && tools.length && Math.random() < 0.5) { wearTool(you, tools[0].key); toast("没扎中！老虎扑了过来"); return pounce(rabbit, you); }
  if (kind === "tiger" && !tools.length) { toast("空手惹老虎？它扑过来了"); return pounce(rabbit, you); }
  if (!tools.length) {
    if (kind === "boar") { toast("空手惹它？它冲过来了"); return charge(rabbit, you); }
    toast(kind === "rabbit" ? "空手抓不住，它跑了" : "得带石矛才打得着，它跑了");
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const p = { x: b.x + (dx / d) * 280, y: b.y + (dy / d) * 280 };
    if (!reachAlong(MAP, b, p).blocked) rabbit.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
    return;
  }
  rabbit.cards.forEach((c) => { c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); });
  removeStack(rabbit);
  for (const k of LOOT[kind]) { const c = newCard(k); you.cards.push(c); layerOf(you.board).append(c.el); c.el.classList.add("pop"); }
  wearTool(you, tools[0].key);
  overflow(you);
  float(`打到一${kind === "boar" ? "头" : "只"}${DEFS[kind].name}`, center(you), you.board);
  const mk = `第一次打到${DEFS[kind].name}`;
  if (!marks.has(mk)) { marks.add(mk); banner("✦", mk); }
  carryChanged();
}
/** The tiger: it keeps to the jungle. Hungry, it stalks the nearest deer and runs it down; fed, it lies up for half a day.
 *  You near it without a torch, it springs; a torch drives it back. */
function tigerTick(st, minutes, you) {
  const c = st.critter, here = center(st), yc = you && you.board === "world" ? center(you) : null;
  const torch = you?.cards.some((x) => x.key === "torch");
  c.hunger = (c.hunger ?? 5) + minutes / 300;
  if (st.walk?.pounce) { if (stepWalk(st, minutes, 2.8)) { st.walk = null; maul(st, you); } return; }
  if (yc && dist(here, yc) < 260 && !torch && clock.min > (c.calm ?? 0)) return pounce(st, you);
  if (yc && torch && dist(here, yc) < 360) {                      // fire: it slinks off into the trees
    if (!st.walk || st.walk.prey) { const a = Math.atan2(here.y - yc.y, here.x - yc.x); const p = { x: here.x + Math.cos(a) * 300, y: here.y + Math.sin(a) * 300 }; if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; }
  }
  if ((c.lying ?? 0) > clock.min) { if (st.walk && stepWalk(st, minutes, c.speed)) st.walk = null; return; }
  if (st.walk?.prey) {
    const prey = st.walk.target;
    if (!boards.world.includes(prey) || clock.min > st.walk.until || (!inJungle(here) && dist(here, c.home) > c.roam + 400)) st.walk = null;   // lost it
    else if (stepWalk(st, minutes, 2.5)) { st.walk = null; kill(st, prey); }
    return;
  }
  if (c.hunger > 6) {
    const deer = boards.world.filter((s) => s.critter?.kind === "deer" && dist(center(s), here) < 950).sort((a, b) => dist(center(a), here) - dist(center(b), here))[0];
    if (deer) { st.walk = { target: deer, prey: true, until: clock.min + 240 }; return; }
  }
  if (!st.walk && Math.random() < minutes / 90) {
    for (let k = 0; k < 10; k++) {
      const p = { x: c.home.x + (Math.random() - 0.5) * c.roam * 2, y: c.home.y + (Math.random() - 0.5) * c.roam * 1.6 };
      if (inJungle(p) && !reachAlong(MAP, here, p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
    }
  }
  if (st.walk && stepWalk(st, minutes, c.speed)) st.walk = null;
}
function kill(tiger, prey) {
  prey.cards.forEach((c) => { c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); });
  removeStack(prey);
  tiger.critter.hunger = 0; tiger.critter.lying = clock.min + 600;
  float("老虎扑倒了一头鹿", center(tiger), "world");
}
function pounce(tiger, you) {
  if (!you || you.board !== "world") return;
  tiger.walk = { target: you, pounce: true };
  float("老虎扑过来了！", center(tiger), "world");
}
function maul(tiger, you) {
  if (!you) return;
  me.rest = Math.max(0, me.rest - 45); me.food = Math.max(0, me.food - 10);
  const a = Math.atan2(center(you).y - center(tiger).y, center(you).x - center(tiger).x), p = { x: center(you).x + Math.cos(a) * 240, y: center(you).y + Math.sin(a) * 240 };
  const got = reachAlong(MAP, center(you), p); you.x = got.x - CARD_W / 2; you.y = got.y - CARD_H / 2;
  cancelJob(you);
  toast("被老虎扑倒了！力 -45，赶紧离开丛林");
  tiger.critter.calm = clock.min + 240;
  tiger.x -= Math.cos(a) * 160; tiger.y -= Math.sin(a) * 160;
}
/** The boar: it roots about its patch of wood; come close without a torch or a spear and it charges. */
function boarTick(st, minutes, you) {
  const c = st.critter, here = center(st), yc = you && you.board === "world" ? center(you) : null;
  const armed = you?.cards.some((x) => x.key === "spear"), torch = you?.cards.some((x) => x.key === "torch");
  if (st.walk?.charge) { if (stepWalk(st, minutes, 2.6)) { st.walk = null; gore(st, you); } return; }
  if (yc && dist(here, yc) < 240 && !armed && !torch && clock.min > (c.calm ?? 0)) return charge(st, you);
  if (yc && torch && dist(here, yc) < 320 && !st.walk) {         // fire: it backs off
    const a = Math.atan2(here.y - yc.y, here.x - yc.x), p = { x: here.x + Math.cos(a) * 260, y: here.y + Math.sin(a) * 260 };
    if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  }
  if (!st.walk && Math.random() < minutes / 100) {
    const p = { x: c.home.x + (Math.random() - 0.5) * c.roam, y: c.home.y + (Math.random() - 0.5) * c.roam * 0.7 };
    if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  }
  if (st.walk && stepWalk(st, minutes, c.speed)) st.walk = null;
}
function charge(boar, you) {
  if (!you || you.board !== "world") return;
  boar.walk = { target: you, charge: true };
  float("野猪冲过来了！", center(boar), "world");
}
function gore(boar, you) {
  if (!you) return;
  me.rest = Math.max(0, me.rest - 25);
  const a = Math.atan2(center(you).y - center(boar).y, center(you).x - center(boar).x), p = { x: center(you).x + Math.cos(a) * 170, y: center(you).y + Math.sin(a) * 170 };
  const got = reachAlong(MAP, center(you), p); you.x = got.x - CARD_W / 2; you.y = got.y - CARD_H / 2;
  cancelJob(you);
  toast("被野猪撞了一下，力 -25");
  boar.critter.calm = clock.min + 180;                           // it goes back to rooting for a while
  boar.x -= Math.cos(a) * 120; boar.y -= Math.sin(a) * 120;
}
function cancelJob(st) { if (st.job) { st.job = null; st.bar?.remove(); st.bar = null; } }
function face(a, b) { a.facing = b.x < a.x ? -1 : 1; }

// ---------------------------------------------------------------------------
// Houses: only going indoors changes the scene
// ---------------------------------------------------------------------------
function enterRoom(room, st) {
  const party = st.cards; removeStack(st);
  fade(() => {
    board = room;
    $("room").hidden = false; table.classList.add("inside");
    newStack(party, 700, 380, room);
    fitRoom();
  });
}
function leaveRoom(st) {
  const party = st.cards; removeStack(st);
  const house = boards.world.find((s) => (s.cards[0].room ?? DEFS[s.cards[0].key].room) === board);
  fade(() => {
    board = "world";
    $("room").hidden = true; table.classList.remove("inside");
    newStack(party, house.x + 30, house.y + CARD_H + 30, "world");
    cam.follow = true;
  });
}
function fade(fn) { table.classList.add("fade"); setTimeout(fn, 280); setTimeout(() => table.classList.remove("fade"), 700); }
function sleepTillDawn() {
  banner("夜", "睡下了，一觉到天亮");
  clock.fast = Math.ceil((clock.min - 6 * 60 + 1) / 1440) * 1440 + 6 * 60;
  me.rest = 100;
}

// ---------------------------------------------------------------------------
// Villagers: a home, a job, hunger. They choose what to do from where they are and what the village has.
// ---------------------------------------------------------------------------
const hour = () => (clock.min / 60) % 24;
const EVENING = () => hour() >= 18 && hour() < 20;
function brain(st, minutes) {
  const n = st.npc;
  n.hunger = Math.min(10, n.hunger + minutes / (n.inside ? 480 : 220));       // asleep, you hardly get hungry
  n.eatAt ??= 5.5 + Math.random() * 2;                                      // some eat more often than others
  const asleep = hour() >= n.sleep || hour() < n.wake;
  if (asleep) {
    if (n.inside) return;
    if (st.walk) return;
    if (st.goal === n.home) return goInside(st);
    cancelJob(st); dropCarry(st); go(st, n.home, "sleep");
    return;
  }
  const tiger = boards.world.find((s) => s.critter?.predator);
  if (!n.inside && tiger && dist(center(tiger), center(st)) < 560 && st.task !== "hide") {
    cancelJob(st); dropCarry(st); say(st, "“有老虎！快跑！”"); n.wait = 0;
    return go(st, n.home, "hide");
  }
  if (n.wait > 0) { n.wait -= minutes; return; }
  if (n.inside) {
    // Not all at once: each gets up and comes out a beat after the others.
    if (!n.outAt) n.outAt = performance.now() + 200 + n.order * 380 + Math.random() * 260;
    if (performance.now() < n.outAt) return;
    n.outAt = 0;
    return comeOut(st);
  }
  if (st.walk || st.job) {
    // Midday: down tools and eat, even if a job is half done. Evening: knock off.
    if (!st.walk && hour() >= 12 && hour() < 13.5 && !n.lunched) {
      n.lunched = true;
      if (n.hunger >= 3.5 && find("stove").cards[0].stock > 0) { cancelJob(st); return go(st, "stove", "eat"); }   // full people (or an empty pot) — keep working
    }
    if (!st.walk && EVENING()) {
      cancelJob(st); dropCarry(st);
      return go(st, n.home, "evening");
    }
    return;
  }
  if (hour() < 11) n.lunched = false;
  // After six they stop working: home, a bite, the fire, then bed.
  if (EVENING()) {
    if (st.goal !== n.home) { cancelJob(st); dropCarry(st); go(st, n.home, "evening"); }
    return;
  }
  // Midday, everyone down tools and eats together.
  const food = find("stove").cards[0].stock > 0, justUp = hour() < n.wake + 1.5;   // nobody heads for the pot the moment they wake
  if (hour() >= 12 && hour() < 13.5 && !n.lunched) { n.lunched = true; if (n.hunger >= 3.5 && food) return go(st, "stove", "eat"); }
  if (n.hunger >= (justUp ? 8 : n.eatAt) && food) return go(st, "stove", "eat");
  if (n.hunger >= 8) return go(st, "stove", "wait");
  if (!st.plans?.length) { const id = WANT[n.key]?.(st); if (id) st.plans = [{ r: recipeFor(id) }]; }
  if (st.plans?.length) return planStep(st);
  switch (st.ctl?.mode === "work" && st.ctl.job ? st.ctl.job : n.job) {     // the job you gave them, if you did
    case "farm": {
      if (st.carry) return go(st, "granary", "drop");
      const fields = boards.world.filter((s) => s.cards[0].key === "field" || s.cards[0].key === "field2");
      const ripe = fields.find((f) => f.cards[0].stock >= 3 && f.cards[0].sown !== false);
      if (ripe) return go(st, ripe.cards[0].key, "harvest", null, ripe);
      const bare = fields.find((f) => f.cards[0].sown === false);
      if (bare && holds(st, "grain")) return go(st, bare.cards[0].key, "sow", null, bare);
      if (bare && find("granary").cards[0].stock > 0) return go(st, "granary", "seed");
      const low = fields.filter((f) => f.cards[0].sown !== false).sort((x, y) => (x.cards[0].stock ?? 0) - (y.cards[0].stock ?? 0))[0];
      return low ? go(st, low.cards[0].key, "tend", null, low) : go(st, "granary", "watch");
    }
    case "clay": return st.carry ? go(st, "kiln", "drop") : go(st, "pit", "dig");
    case "cook": {
      const g = find("granary").cards[0], s = find("stove").cards[0];
      if (st.carry) return go(st, "stove", "cook");
      if (s.stock >= 6 || g.stock <= 0) return go(st, "stove", "watch");
      return go(st, "granary", "fetch");
    }
    case "fish": return st.carry ? go(st, "stove", "give") : go(st, "lake", "fish");
    case "wood": return st.carry ? go(st, "taoHouse", "store") : go(st, "chestnut", "chop");
    case "stone": return st.carry ? go(st, "taoHouse", "store") : go(st, "scree", "pick");
    case "build": { const p = boards.world.find((s) => s.cards[0].key === "plot" && Object.values(s.cards[0].need).every((v) => v <= 0)); return p ? go(st, "plot", "build") : go(st, "chestnut", "chop"); }
  }
}
function go(st, key, task, want, stack) {
  st.want = want;
  if (stack) {                                                   // a particular one (this field, not just any field)
    const path = route(st, stack);
    if (path === null) { st.goal = ""; st.task = ""; st.npc.wait = 60; return; }
    st.goalStack = stack; st.parkedAt = null; st.walk = { target: stack, path, k: 0 }; st.task = task; st.goal = key; intent(st, DEFS[key].icon);
    return;
  }
  // a source with something left in it, if there are several (two groves of chestnuts)
  const ok = (s) => s.cards[0].key === key && (s.cards[0].stock === undefined || s.cards[0].stock > 0) && !inJungle(center(s));
  const target = boards.world.find(ok) ?? boards.world.find((s) => s.cards[0].key === key && !inJungle(center(s))) ?? find(key);
  st.goalStack = target; st.parkedAt = null;
  const path = route(st, target);
  if (path === null) { st.goal = ""; st.task = ""; st.npc.wait = 60; return; }   // no way round the water: wait and retry
  st.walk = { target, path, k: 0 };
  st.task = task; st.goal = key; intent(st, DEFS[key].icon);
}
const JOBS = { eat: 30, wait: 60, tend: 180, harvest: 150, dig: 90, drop: 15, fetch: 20, cook: 120, watch: 90, fish: 120, give: 15, evening: 100, chop: 150, pick: 60, store: 15, gather: 90, fetchHome: 15, jarIn: 15, build: 240, sow: 60, seed: 15, hide: 90 };
function npcArrive(st) {
  if (st.task === "sleep") return goInside(st);
  if (!st.task) return;                 // just stepping out of the door
  const t = st.goalStack; if (t) { st.slot = standOn(st, t).slot; st.parkedAt = t; }
  let min = JOBS[st.task] ?? 30;
  if (st.task === "craft") min = st.plans.at(-1).r.min;
  if ((st.task === "chop" || (st.task === "gather" && st.want === "log")) && hasTool(st, t, "axe")) min *= 0.6;   // an axe makes short work of it
  if (st.task === "fish" && hasTool(st, t, "net")) min *= 0.75;
  st.job = { npcTask: st.task, left: min, total: min };
}
function npcDone(st) {
  const target = st.goalStack ?? find(st.goal), t = target.cards[0], task = st.task;
  st.goal = ""; st.lastTask = task; intent(st, "");
  if (task === "eat" && t.stock > 0) { t.stock--; refreshStock(t); st.npc.hunger = 0; }
  if (task === "tend" && t.sown !== false) { const hoe = hasTool(st, target, "hoe"); t.stock = Math.min(3, (t.stock ?? 0) + (hoe ? 2 : 1)); if (hoe) wearAny(st, target, "hoe"); refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor(t.stock >= 3 ? "fieldRipe" : "field"); }
  if (task === "seed" && t.stock > 0) { t.stock--; refreshStock(t); addCard(st, "grain"); }
  if (task === "sow") { const i = st.cards.findIndex((c, j) => j > 0 && c.key === "grain"); if (i > 0) { st.cards[i].el.remove(); st.cards.splice(i, 1); t.sown = true; t.stock = 0; refreshStock(t); } }
  if (task === "harvest") { t.stock = 0; t.sown = false; refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor("field"); carry(st, "grain", 3); }
  if (task === "dig" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "clay", 1); }
  if (task === "fetch" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "grain", 1); }
  if (task === "fish") { const net = hasTool(st, target, "net"); carry(st, "fish", net ? 2 : 1, net ? 2 : 1); if (net) wearAny(st, target, "net"); }
  if (task === "chop" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "log", 1); if (hasTool(st, target, "axe")) wearAny(st, target, "axe"); }
  if (task === "gather" && t.stock > 0) { t.stock--; refreshStock(t); addCard(st, st.want === "wood" ? "log" : st.want); if (st.want === "log" && hasTool(st, target, "axe")) wearAny(st, target, "axe"); }
  if (task === "fetchHome") { const pile = boards.tao.find((s) => s.store), c = pile?.cards.find((x) => x.key === st.want || (st.want === "wood" && x.key === "log")); if (c) { pile.cards = pile.cards.filter((x) => x !== c); if (!pile.cards.length) removeStack(pile); cardsLayer.append(c.el); st.cards.push(c); } }
  if (task === "craft") craftDone(st, target);
  if (task === "jarIn") { const i = st.cards.findIndex((c, j) => j > 0 && c.key === "jar"); if (i > 0) { st.cards[i].el.remove(); st.cards.splice(i, 1); t.jars = (t.jars ?? 0) + 1; refreshStock(t); float(`公仓多了只陶罐，能存 ${granaryCap(t)} 份`, center(target), "world"); } st.plans = []; }
  if (task === "build") { const c = target.cards[0]; if (c.key === "plot" && (!BUILDS[c.build].tool || holds(st, BUILDS[c.build].tool))) { c.work += 240; refreshPlot(c); if (c.work >= BUILDS[c.build].work) completeBuild(target); } }
  if (task === "pick" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "stone", 1); }
  if (task === "store") storeCarry(st);
  if (task === "drop" || task === "give") dropCarry(st, t);
  if (task === "cook") { dropCarry(st); t.stock = (t.stock ?? 0) + 3; refreshStock(t); float("+3 熟食", center(target), "world"); }
  // Not every waking hour is work: after a task they often stand and rest a while.
  if (task === "evening") st.npc.wait = 80;
  else if (task !== "eat" && st.npc.hunger < 9 && Math.random() < 0.4) st.npc.wait = 40 + Math.random() * 90;
}
function carry(st, key, n = 1, cards = 1) {
  for (let i = 0; i < cards; i++) { const c = newCard(key); layerOf(st.board).append(c.el); c.el.classList.add("pop"); st.cards.push(c); }
  st.carry = { key, n };
}
/** Put down what they were carrying for work — tools and things for their own making stay in hand. */
function dropCarry(st, into = null) {
  if (!st.carry) return;
  if (into && DEPOT[into.key] && DEPOT[into.key] !== st.carry.key) { float("这儿不收这个", center(st), st.board); return; }
  const load = st.cards.filter((c, j) => j > 0 && c.key === st.carry.key);
  st.cards = st.cards.filter((c) => !load.includes(c));
  load.forEach((c) => { c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); });
  if (into && into.stock !== undefined) {
    let add = st.carry.n;
    if (into.key === "granary") { const room = Math.max(0, granaryCap(into) - into.stock); if (add > room) float(`公仓满了，${add - room} 份粟放不下，糟蹋了`, center(stackOf(into)), "world"); add = Math.min(add, room); }
    into.stock += add; refreshStock(into); if (add) float(`+${add} ${DEFS[into.key].stockLabel ?? DEFS[st.carry.key].name}`, center(stackOf(into)), "world");
  }
  st.carry = null;
}
/** Things carried home go on a pile inside the house, where you can pick them up. */
function storeHome(cards) {
  if (!cards.length) return;
  cards.forEach((c) => { c.el.classList.remove("gone", "pop"); roomWorld.append(c.el); });
  const pile = boards.tao.find((s) => s.store);
  if (pile) pile.cards.push(...cards); else newStack(cards, 900, 330, "tao").store = true;
}
function storeCarry(st) {
  const load = st.cards.filter((c, j) => j > 0 && c.key === st.carry?.key);
  st.cards = st.cards.filter((c) => !load.includes(c));
  storeHome(load); st.carry = null;
  float("放回家了", center(st), st.board);
}
function goInside(st) {
  cancelJob(st); st.walk = null; st.task = ""; st.goal = ""; intent(st, "");
  st.npc.inside = true; st.npc.outAt = 0;
  find(st.npc.home, "world")?.cards[0].el.classList.add("occupied");
  const room = DEFS[st.npc.home].room;
  if (room) { removeStack(st); st.board = room; boards[room].push(st); st.x = 40 + st.npc.order * 125; st.y = 360; st.cards.forEach((c) => { roomWorld.append(c.el); c.el.classList.add("sleeping"); }); }
  else { st.indoors = true; st.cards.forEach((c) => c.el.classList.add("sleeping")); }
}
function comeOut(st) {
  st.npc.inside = false; st.indoors = false;
  find(st.npc.home, "world")?.cards[0].el.classList.remove("occupied");
  const home = find(st.npc.home, "world");
  if (st.board !== "world") { removeStack(st); st.board = "world"; boards.world.push(st); st.cards.forEach((c) => cardsLayer.append(c.el)); }
  st.x = home.x + 10 + st.npc.order * 40; st.y = home.y + home.h + 16;
  // Step away from the door instead of standing in a stack, and fade in.
  st.walk = { x: st.x + (Math.random() - 0.5) * 90, y: st.y + 46 + Math.random() * 40 };
  st.task = "";
  st.cards.forEach((c) => {
    c.el.classList.remove("sleeping"); c.el.classList.add("appear");
    setTimeout(() => c.el.classList.remove("appear"), 900);
  });
}
function intent(st, icon) {
  const el = st.cards[0].el.querySelector(".intent");
  if (!el || st.intentIcon === icon) return;
  st.intentIcon = icon;
  el.innerHTML = icon ? iconFor(icon) : "";
  el.classList.toggle("on", Boolean(icon));
}

// ---------------------------------------------------------------------------
// Time and the frame loop
// ---------------------------------------------------------------------------
let last = performance.now(), lastDay = 1, lastSeason = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  let minutes = dt * MIN_PER_SEC * clock.speed;
  if (clock.fast) { minutes = Math.max(minutes, 25); if (clock.min + minutes >= clock.fast) { minutes = clock.fast - clock.min; clock.fast = 0; } }
  try { if (minutes > 0) tick(minutes); render(); } catch (err) { console.error(err); }
  requestAnimationFrame(frame);
}
function tick(minutes) {
  clock.min += minutes;
  updateTide();
  burnTorch(minutes);
  autoYou();
  const you = youStack();
  me.food = Math.max(0, me.food - minutes * (you?.job && !you.job.r.nap ? 0.04 : 0.02));
  for (const st of [...allStacks()]) {
    if (st.lifted) continue;
    if (st.npc) {
      if (st.ctl?.mode !== "manual") brain(st, minutes);
      if (st.walk && stepWalk(st, minutes)) { const w = st.walk; st.walk = null; if (w.manual) manualArrive(st, w.target); else npcArrive(st); }
    } else if (st.pet && st.ctl?.mode !== "auto") {
      if (st.ctl.mode === "work" && !st.walk) dogWork(st);
      if (st.walk && stepWalk(st, minutes, 1.3)) { const w = st.walk; st.walk = null; if (!w.follow) dogArrive(st, w.target); }
    } else if (st.pet) {
      if (!st.walk && Math.random() < minutes / 120) {
        const you = youStack();
        for (let k = 0; k < 6; k++) {
          const p = { x: st.pet.home.x + (Math.random() - 0.5) * 360, y: st.pet.home.y + (Math.random() - 0.5) * 220 };
          if (you && dist(p, center(you)) < 230) continue;         // never sit on your card
          if (allStacks().some((s) => s !== st && dist(p, center(s)) < 130)) continue;
          if (!reachAlong(MAP, center(st), p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
        }
      }
      if (st.walk && stepWalk(st, minutes, 0.6)) st.walk = null;
    } else if (st.critter?.water) {
      // ducks paddle about the lake, keeping off the shore and away from whoever comes close
      const here = center(st), yc = you && you.board === "world" ? center(you) : null;
      const scared = yc && dist(here, yc) < st.critter.fear;
      if (!st.walk && (scared || Math.random() < minutes / 80)) {
        for (let k = 0; k < 12; k++) {
          const a = scared && k < 6 ? Math.atan2(here.y - yc.y, here.x - yc.x) + (Math.random() - 0.5) : Math.random() * 6.28, r = 120 + Math.random() * 200;
          const p = { x: here.x + Math.cos(a) * r, y: here.y + Math.sin(a) * r };
          if (dist(p, st.critter.home) > st.critter.roam) continue;
          if ([0.25, 0.5, 0.75, 1].every((t) => inLake({ x: here.x + (p.x - here.x) * t, y: here.y + (p.y - here.y) * t }))) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
        }
      }
      if (st.walk && stepWalk(st, minutes, scared ? 1.4 : st.critter.speed)) st.walk = null;
    } else if (st.critter?.predator) {
      tigerTick(st, minutes, you);
    } else if (st.critter?.aggro) {
      boarTick(st, minutes, you);
    } else if (st.critter) {
      const here = center(st);
      const living = (s) => s !== st && s.board === "world" && !s.indoors && (s.npc || s.pet || s.cards[0].key === "you" || s.critter?.predator);
      const near = boards.world.filter(living).map(center).sort((a, b) => dist(a, here) - dist(b, here))[0];
      const scared = near && dist(here, near) < st.critter.fear;
      const still = darkness() > 0.6;                                  // at night it keeps still in the grass
      if (!st.walk && (scared || (!still && Math.random() < minutes / 90))) {
        for (let k = 0; k < 10; k++) {
          let p;
          if (scared && k < 5) {                                      // bolt away from whoever came close
            const a = Math.atan2(here.y - near.y, here.x - near.x) + (Math.random() - 0.5) * 0.9;
            p = { x: here.x + Math.cos(a) * 320, y: here.y + Math.sin(a) * 320 };
          } else p = { x: st.critter.home.x + (Math.random() - 0.5) * 520, y: st.critter.home.y + (Math.random() - 0.5) * 380 };
          if (p.x < 70 || p.y < 70 || p.x > MAP.W - 70 || p.y > MAP.H - 70) continue;
          if (boards.world.some((s) => s !== st && dist(p, center(s)) < (living(s) ? 320 : 220))) continue;   // keeps clear of people and places
          if (!scared && dist(p, st.critter.home) > st.critter.roam) continue;
          if (!reachAlong(MAP, here, p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
        }
      }
      if (st.walk && stepWalk(st, minutes, scared ? st.critter.speed : 0.8)) st.walk = null;
    } else if (st.walk) {
      if (stepWalk(st, minutes)) { const t = st.walk.target; st.walk = null; if (t && st.cards[0].key === "you") arrive(st, t); }
    }
    if (st.job) {
      st.job.left -= minutes;
      if (st.job.left <= 0) {
        if (st.npc) { st.job = null; st.bar?.remove(); st.bar = null; npcDone(st); } else finish(st);
      }
    }
  }
  if (you?.travel && clock.min >= you.travel.until) { const t = you.travel.target; you.travel = null; if (t && boards[you.board].includes(t)) arrive(you, t); }
  if (you && board === "world") explore(center(you));
  if (you && board === "world" && inJungle(center(you)) && me.jungleDay !== day()) { me.jungleDay = day(); toast("进丛林了：这是老虎的地盘，带上火把"); }
  if (day() !== lastDay) {
    lastDay = day();
    for (const [id, k] of Object.entries(me.known)) {
      if (k.day === day() - 1) continue;                       // used yesterday: still fresh
      k.mem -= FORGET_PER_DAY;
      if (k.mem <= 0) { delete me.known[id]; toast(`好久没做${craftName(id)}，忘了怎么做`); }
    }
    renderCrafts();
    rollWeather();
    const fire = find("fire")?.cards[0]; if (fire) fire.fuel = Math.max(0, (fire.fuel ?? 0) - 1);
    const stove = find("stove")?.cards[0]; if (stove) stove.fuel = Math.max(0, (stove.fuel ?? 0) - 1);
    for (const t of boards.world.filter((s) => s.cards[0].key === "peach" || s.cards[0].key === "jujube")) {
      const c = t.cards[0], add = c.key === "peach" ? { 春: 0, 夏: 3, 秋: 1, 冬: 0 }[season()] : { 春: 0, 夏: 0, 秋: 3, 冬: 0 }[season()];
      c.stock = season() === "冬" ? 0 : Math.min(8, c.stock + add); refreshStock(c);
    }
    const shrooms = find("jungleFood")?.cards[0];
    if (shrooms) { shrooms.stock = Math.min(8, shrooms.stock + (season() === "冬" ? 0 : 2)); refreshStock(shrooms); }
    const nest = find("nest")?.cards[0];
    if (nest) { nest.stock = Math.min(4, nest.stock + ({ 春: 2, 夏: 2, 秋: 1, 冬: 0 }[season()])); refreshStock(nest); }
    for (const [kind, sp] of Object.entries(SPECIES)) if (boards.world.filter((s) => s.critter?.kind === kind).length < sp.n && Math.random() < 0.35) spawnAnimal(kind);
    const berries = find("berries")?.cards[0];
    if (berries) { berries.stock = season() === "冬" ? 0 : Math.min(8, berries.stock + (weather.now === "雨" ? 4 : 3)); refreshStock(berries); }
    const s = SEASONS.indexOf(season());
    if (s !== lastSeason) { lastSeason = s; paintSeason(); banner(SEASONS[s], `${SEASONS[s]}天来了`); }
  }
}

/** How dark it is: 0 by day, near black at midnight; dusk and dawn each take a few hours. */
const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function darkness() {
  const h = hour(), D = 0.96;
  if (h >= 6.5 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20.5) return D * ease((h - 17.5) / 3);
  if (h >= 4 && h < 6.5) return D * (1 - ease((h - 4) / 2.5));
  return D;
}
/** What gives light on the board you are on: a burning stove or hearth, a lived-in house at night. */
function lights() {
  const out = [];
  if (board === "world") {
    const s = find("stove"); if (s && s.cards[0].fuel > 0) out.push({ ...center(s), r: 480, a: 1 });
    for (const h of boards.world) if (DEFS[h.cards[0].key].type === "house" && allStacks().some((n) => n.npc?.inside && n.npc.home === h.cards[0].key)) out.push({ ...center(h), r: 240, a: 0.8 });
  } else {
    const f = find("fire", board); if (f && f.board === board && f.cards[0].fuel > 0) out.push({ ...center(f), r: 640, a: 1 });
  }
  const you = youStack();
  if (you && you.board === board && you.cards.some((c) => c.key === "torch")) out.push({ ...center(you), r: 340, a: 1 });   // a torch in your hand
  for (const n of boards[board]) if (n.npc && !n.indoors && holds(n, "torch")) out.push({ ...center(n), r: 260, a: 0.9 });
  return out;
}
const litAt = (p) => lights().some((l) => dist(l, p) < l.r * 0.7);
/** Darkness is painted over everything, and light cuts it away — the ground under a fire is simply visible. */
const darkCv = $("dark"), darkG = darkCv.getContext("2d");
function drawDark() {
  const d = darkness(), r = table.getBoundingClientRect(), K = 0.5;
  const w = Math.ceil(r.width * K), h = Math.ceil(r.height * K);
  if (darkCv.width !== w || darkCv.height !== h) { darkCv.width = w; darkCv.height = h; }
  darkG.globalCompositeOperation = "source-over";
  darkG.clearRect(0, 0, w, h);
  if (d <= 0.005) return;
  darkG.fillStyle = `rgba(5,7,16,${d})`; darkG.fillRect(0, 0, w, h);
  const toScreen = board === "world"
    ? (p) => ({ x: (r.width / 2 + (p.x - cam.x) * cam.z) * K, y: (r.height / 2 + (p.y - cam.y) * cam.z) * K, k: cam.z * K })
    : (p) => ({ x: ((r.width - 1060 * roomK) / 2 + p.x * roomK) * K, y: ((r.height - 700 * roomK) / 2 + p.y * roomK) * K, k: roomK * K });
  const you = youStack();
  const all = [...lights(), ...(you && you.board === board ? [{ ...center(you), r: 150, a: 0.5 }] : [])];
  darkG.globalCompositeOperation = "destination-out";
  for (const l of all) {
    const s = toScreen(l), R = l.r * s.k, g = darkG.createRadialGradient(s.x, s.y, R * 0.1, s.x, s.y, R);
    g.addColorStop(0, `rgba(0,0,0,${l.a})`); g.addColorStop(0.5, `rgba(0,0,0,${l.a * 0.8})`); g.addColorStop(1, "rgba(0,0,0,0)");
    darkG.fillStyle = g; darkG.beginPath(); darkG.arc(s.x, s.y, R, 0, Math.PI * 2); darkG.fill();
  }
  darkG.globalCompositeOperation = "source-over";
  for (const l of all) if (l.a >= 1) {                           // firelight is warm where it falls
    const s = toScreen(l), R = l.r * s.k * 0.8, g = darkG.createRadialGradient(s.x, s.y, 0, s.x, s.y, R);
    g.addColorStop(0, `rgba(255,170,80,${0.13 * d})`); g.addColorStop(1, "rgba(255,170,80,0)");
    darkG.fillStyle = g; darkG.beginPath(); darkG.arc(s.x, s.y, R, 0, Math.PI * 2); darkG.fill();
  }
}

function render() {
  const you = youStack();
  if (board === "world" && cam.follow && you && !you.lifted) { const c = center(you); cam.x += (c.x - cam.x) * 0.12; cam.y += (c.y - cam.y) * 0.12; applyCam(); }
  const sight = board === "world" && you ? center(you) : null;
  for (const [b, list] of Object.entries(boards)) {
    const live = b === board;
    for (const st of list) {
      const c = center(st);
      const inFog = b === "world" && !known(c) && st.cards[0].key !== "you";
      const unseen = Boolean(b === "world" && (st.npc || st.pet) && sight && dist(c, sight) > SIGHT);
      if ((st.npc || st.pet) && !unseen) st.seen = { x: st.x, y: st.y };
      const x = unseen && st.seen ? st.seen.x : st.x, y = unseen && st.seen ? st.seen.y : st.y;
      const ghostFog = unseen && st.seen && !known({ x: st.seen.x + CARD_W / 2, y: st.seen.y + CARD_H / 2 });
      st.cards.forEach((card, i) => {
        const el = card.el;
        el.classList.toggle("hidden", !live || inFog && !unseen || ghostFog || !st.seen && unseen || Boolean(st.indoors));
        el.classList.toggle("ghost", unseen);
        el.classList.toggle("lifted", Boolean(st.lifted));
        el.classList.toggle("walking", Boolean(st.walk) && !unseen);
        el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y + i * PEEK)}px)${st.lifted ? " rotate(-2deg) scale(1.05)" : ""}`;
        el.style.zIndex = st.lifted ? 9000 + i : Math.round(y) + i + 10;
      });
      if (st.job && !unseen && live && !inFog) {
        if (!st.bar) { st.bar = document.createElement("div"); st.bar.className = "bar"; st.bar.innerHTML = "<i></i>"; layerOf(b).append(st.bar); }
        st.bar.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 18)}px)`;
        st.bar.style.zIndex = Math.round(y) + 60;
        st.bar.firstElementChild.style.width = `${Math.min(100, (1 - st.job.left / st.job.total) * 100)}%`;
      } else if (st.bar) { st.bar.remove(); st.bar = null; }
    }
  }
  const h = hour(), m = Math.floor(clock.min % 60);
  $("time").textContent = `${String(Math.floor(h)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  $("day").textContent = `第 ${day()} 天`;
  $("season").textContent = season();
  drawDark();
  $("sun").className = darkness() < 0.5 ? "sun" : "moon";
  $("barFood").firstElementChild.style.width = `${me.food}%`;
  $("barFood").classList.toggle("low", hungry());
  $("barRest").firstElementChild.style.width = `${me.rest}%`;
  $("barRest").classList.toggle("low", tired());
  const state = bodyState().join(" · ");
  $("me").classList.toggle("low", Boolean(state));
  $("meFace").title = state || "点一下：接着做刚才那件事";
}
function carryChanged() {
  const you = youStack();
  $("meCarry").innerHTML = (you?.cards.slice(1) ?? []).map((c) => `<span title="${DEFS[c.key].name}">${iconFor(DEFS[c.key].icon)}</span>`).join("");
  renderRecent();
}
/** The last two kinds of work you did, as two buttons by your face. */
function remember(key) {
  me.recent = [{ key }, ...me.recent.filter((r) => r.key !== key)].slice(0, 2);
  renderRecent();
}
function renderRecent() {
  const box = $("meRecent");
  if (!box) return;
  box.innerHTML = me.recent.map((r, i) => `<button data-recent="${i}" title="接着去${DEFS[r.key].name}" aria-label="接着去${DEFS[r.key].name}">${iconFor(DEFS[r.key].icon)}</button>`).join("");
}
/** Send yourself off to do it again: the path is walked on its own. */
function repeatRecent(i = 0) {
  const rec = me.recent[i];
  if (!rec) return toast("先干一次活，这里会记住");
  const target = find(rec.key);
  if (!target) return toast("那儿不在了");
  const you = youStack();
  if (!you) return;
  if (you.job) return toast("先把手上的活干完");
  if (starving()) return toast("饿得走不动，先吃点东西");
  if (spent()) return toast("累垮了，先歇一会儿");
  cancelJob(you);
  const goal = standOn(you, target);
  const path = findPath(MAP, center(you), { x: goal.x + CARD_W / 2, y: goal.y + CARD_H / 2 });
  if (!path) return toast("走不过去，得绕路");
  you.walk = { path, k: 0, target };
  you.travel = null; cam.follow = true;
  toast(`去${DEFS[rec.key].name}`);
}

// ---------------------------------------------------------------------------
// You, left alone: after a while without your hand on anything, you find something to do — eat if hungry,
// go to bed when it is dark or you are spent, otherwise the last work you did (or wood, if none).
// ---------------------------------------------------------------------------
/** A torch burns only while it is dark; one lasts about a night. */
function burnTorch(minutes) {
  if (darkness() >= 0.3) for (const n of allStacks()) {           // the villagers' torches burn down too
    const t = n.npc && n.cards.find((c) => c.key === "torch");
    if (!t) continue;
    t.burn = (t.burn ?? DEFS.torch.burn) - minutes;
    if (t.burn <= 0) { n.cards = n.cards.filter((c) => c !== t); t.el.remove(); }
  }
  const you = youStack(), torch = you?.cards.find((c) => c.key === "torch");
  if (!torch || darkness() < 0.3) return;
  torch.burn = (torch.burn ?? DEFS.torch.burn) - minutes;
  if (torch.burn > 0) return;
  you.cards = you.cards.filter((c) => c !== torch); torch.el.classList.add("gone"); setTimeout(() => torch.el.remove(), 300);
  float("火把烧完了", center(you), you.board); carryChanged();
}
function autoYou() {
  const you = youStack();
  if (!me.auto || !you || you.job || you.walk || you.travel || you.lifted || drag) return;
  if (clock.min - me.lastInput < IDLE_MIN) return;
  me.lastInput = clock.min;                                    // one decision, then wait again
  const tiredOrDark = darkness() > 0.6 || me.rest < 20;
  if (board !== "world") {
    const t = tiredOrDark ? find("bed", board) : find("door", board);
    if (t) { you.walk = { target: t }; float(tiredOrDark ? "去睡觉" : "出门", center(you), board); }
    return;
  }
  const go = (key, label) => {
    const t = boards.world.find((s) => s.cards[0].key === key && (s.cards[0].stock === undefined || s.cards[0].stock > 0)) ?? find(key);
    const path = t && route(you, t);
    if (!path) return false;
    you.walk = { target: t, path, k: 0 }; cam.follow = true; float(label, center(you), "world");
    return true;
  };
  if (tiredOrDark) return void go("taoHouse", "回家歇着");
  if (me.food < 40 && find("stove")?.cards[0].stock > 0) return void go("stove", "去吃饭");
  if (loose(you).length >= capOf(you)) { you.unloading = true; return void go(unloadDest(you), "背满了，先去卸货"); }
  if (me.recent[0] && go(me.recent[0].key, `接着去${DEFS[me.recent[0].key].name}`)) return;
  go("chestnut", "去砍点木头");
}
function renderAutoMe() { const b = $("autoMe"); b.classList.toggle("on", me.auto); b.title = me.auto ? "闲着会自己找事做（点一下关掉）" : "闲着不动（点一下打开：自己找事做）"; }

// ---------------------------------------------------------------------------
// The people (and the dog) you can direct
// ---------------------------------------------------------------------------
const JOB_CHOICES = {
  npc: [["farm", "field", "种田"], ["wood", "chestnut", "砍树，木头背回家"], ["fish", "river", "捕鱼，送去公灶"], ["clay", "pit", "挖黏土，送去陶窑"], ["stone", "scree", "捡石头，背回家"], ["cook", "stove", "做饭"], ["build", "plot", "盖房子：去材料齐了的地基上干活"]],
  dog: [["carry", "granary", "搬运：你背的东西一多，它就来接走送回家"]],
};
const MODES = [["auto", "⟳", "自己安排"], ["work", "⚒", "派活：选一样活，它自己去干"], ["manual", "✋", "我来指挥：直接拖动这张牌"]];
const members = () => allStacks().filter((s) => s.ctl);
function renderParty() {
  const list = members(), tog = $("partyToggle");
  tog.hidden = !list.length;
  tog.classList.toggle("open", party.open);
  tog.innerHTML = list.slice(0, 3).map((s) => `<span>${iconFor(DEFS[s.cards[0].key].icon)}</span>`).join("") + (list.length > 3 ? `<i>+</i>` : "");
  const box = $("party");
  box.hidden = !party.open || !list.length;
  if (box.hidden) return;
  box.innerHTML = list.map((s) => {
    const k = s.cards[0].key, c = s.ctl, jobs = s.pet ? JOB_CHOICES.dog : JOB_CHOICES.npc;
    return `<div class="pm" data-id="${s.id}"><button class="pm-face" data-focus="1" title="${DEFS[k].name}：点一下看它在哪">${iconFor(DEFS[k].icon)}</button>`
      + `<div class="pm-modes">${MODES.map(([m, g, t]) => `<button data-mode="${m}" class="${c.mode === m ? "on" : ""}" title="${t}">${g}</button>`).join("")}</div>`
      + (c.mode === "work" ? `<div class="pm-jobs">${jobs.map(([j, icon, t]) => `<button data-job="${j}" class="${c.job === j ? "on" : ""}" title="${t}">${iconFor(icon)}</button>`).join("")}</div>` : "")
      + `</div>`;
  }).join("");
}
function setMode(st, mode) {
  st.ctl.mode = mode;
  if (mode === "work" && !st.ctl.job) st.ctl.job = st.pet ? "carry" : st.npc.job;
  if (mode === "manual" && st.npc?.inside) comeOut(st);
  cancelJob(st); st.walk = null; st.goal = ""; st.task = ""; intent(st, "");
  if (mode === "manual") toast(`拖动${DEFS[st.cards[0].key].name}的牌，放到要干活的地方`);
}
/** Dragging one of yours: the card follows the finger; let go and they walk there and get on with it. */
function steerMove(p) {
  const st = drag.st;
  if (!drag.from) { cancelJob(st); st.walk = null; st.lifted = true; drag.from = { x: st.x, y: st.y }; }
  st.x = p.x - drag.ox; st.y = p.y - drag.oy;
  drag.target = targetAt({ x: st.x + CARD_W / 2, y: st.y + CARD_H / 2 - 20 }, st);
  markTarget(drag.target);
  if (board !== "world") return;
  const a = { x: drag.from.x + CARD_W / 2, y: drag.from.y + CARD_H / 2 }, b = center(st), line = $("aimLine");
  line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
  $("aimRange").setAttribute("r", 0);
  $("aim").classList.add("on");
}
function steerDrop(d) {
  const st = d.st, there = center(st);
  st.x = d.from.x; st.y = d.from.y; st.lifted = false;
  const t = d.target && d.target !== st ? d.target : null;
  if (!t && !walkable(MAP, there.x, there.y)) return toast("那儿走不过去");
  const path = t ? route(st, t) : findPath(MAP, center(st), there);
  if (!path) return toast("走不过去，得绕路");
  st.goal = ""; st.task = ""; st.parkedAt = null;
  st.walk = t ? { target: t, path, k: 0, manual: true } : { path: path.slice(0, -1), k: 0, x: there.x - CARD_W / 2, y: there.y - CARD_H / 2, manual: true };
  intent(st, t ? DEFS[t.cards[0].key].icon : "");
}
/** A villager you steered got there: do whatever that place is for. */
const TASK_AT = { field: (t) => (t.stock >= 3 ? "harvest" : "tend"), field2: (t) => (t.stock >= 3 ? "harvest" : "tend"), chestnut: () => "chop", lake: () => "fish",
  pit: () => "dig", scree: () => "pick", granary: () => "drop", kiln: () => "drop", stove: (t, st) => (st.carry ? "give" : "eat"), taoHouse: () => "store" };
function manualArrive(st, t) {
  intent(st, "");
  if (!t) return;
  if (st.pet) return dogArrive(st, t);
  const k = t.cards[0].key, task = TASK_AT[k]?.(t.cards[0], st);
  if (!task) return say(st, "“在这儿干什么呢？”");
  const gathering = ["harvest", "chop", "fish", "dig", "pick"].includes(task);
  if (gathering && st.carry) return say(st, "“手上拿不下了，先放回去。”");
  if (task === "store" && !st.carry) return;
  st.task = task; st.goal = k; st.goalStack = t;
  npcArrive(st);
}
/** The dog as a carrier: when you have a load, it trots over, takes it and runs it home; otherwise it keeps near you. */
function dogWork(st) {
  const you = youStack();
  const loose = (s) => s.cards.filter((c, j) => j > 0 && DEFS[c.key].type !== "tool");
  if (st.cards.length > 1) return dogGo(st, find("taoHouse"));
  if (!you || you.board !== "world") return;
  if (loose(you).length >= 3) return dogGo(st, you);
  if (dist(center(st), center(you)) > 380) {
    const c = center(you), p = { x: c.x + 150, y: c.y + 60 };
    const path = findPath(MAP, center(st), p);
    if (path) st.walk = { path: path.slice(0, -1), k: 0, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, follow: true };
  }
}
function dogGo(st, t) {
  const path = route(st, t);
  if (path) st.walk = { target: t, path, k: 0 };
}
function dogArrive(st, t) {
  if (!t) return;
  const k = t.cards[0].key;
  if (k === "you") {
    const take = t.cards.filter((c, j) => j > 0 && DEFS[c.key].type !== "tool").slice(0, 4);
    if (!take.length) return;
    t.cards = t.cards.filter((c) => !take.includes(c)); st.cards.push(...take);
    float(`阿黄叼走 ${take.length} 样`, center(st), st.board); carryChanged();
  } else if (k === "taoHouse") {
    if (st.cards.length > 1) { storeHome(st.cards.splice(1)); float("送回家了", center(st), st.board); }
  } else if (DEPOT[k]) {
    const room = k === "granary" ? Math.max(0, granaryCap(t.cards[0]) - t.cards[0].stock) : Infinity;
    const fits = st.cards.filter((c, j) => j > 0 && c.key === DEPOT[k]).slice(0, room);
    if (!fits.length) return float(room === 0 ? "公仓满了" : "这儿不收这个", center(st), st.board);
    st.cards = st.cards.filter((c) => !fits.includes(c)); fits.forEach((c) => c.el.remove());
    t.cards[0].stock = (t.cards[0].stock ?? 0) + fits.length; refreshStock(t.cards[0]);
    float(`+${fits.length} ${DEFS[k].stockLabel ?? DEFS[DEPOT[k]].name}`, center(t), "world");
  }
}

// ---------------------------------------------------------------------------
// Villagers make what their work needs, and then use it: 陶婶 a net, 阿予 a hoe, 阿埴 jars for the granary (and an axe),
// 阿灶 a torch from the stove fire before dark. Missing materials they fetch from home or go and gather; tools wear out and get made again.
// ---------------------------------------------------------------------------
const holds = (st, k) => st.cards.some((c) => c.key === k);
/** Which tool goes where: leave it there and whoever works the place uses it. */
const TOOL_AT = { chestnut: ["axe"], reeds: ["knife"], hemp: ["knife"], lake: ["net"], field: ["hoe"], field2: ["hoe"] };
const toolAt = (place, k) => Boolean(place?.cards.some((c, j) => j > 0 && c.key === k));
const hasTool = (st, place, k) => holds(st, k) || toolAt(place, k);
/** Wear the tool someone is using: their own if they carry one, else the one left at the place. */
function wearAny(st, place, k) { if (holds(st, k)) return st.npc ? wearNpc(st, k) : wearTool(st, k); if (toolAt(place, k)) wearTool(place, k); }
const WANT = {
  aunt: (st) => (holds(st, "net") || toolAt(find("lake"), "net") ? null : "net"),
  yu: (st) => (holds(st, "hoe") || boards.world.some((s) => (s.cards[0].key === "field" || s.cards[0].key === "field2") && toolAt(s, "hoe")) ? null : "hoe"),
  zhi: (st) => { const k = find("kiln")?.cards[0], g = find("granary")?.cards[0]; return k?.stock >= 2 && (g?.jars ?? 0) < 6 ? "jar" : holds(st, "axe") || boards.world.some((s) => s.cards[0].key === "chestnut" && toolAt(s, "axe")) ? null : "axe"; },
  zao: (st) => (hour() >= 15.5 && hour() < 17.5 && !holds(st, "torch") && find("stove")?.cards[0].fuel >= 2 ? "torch" : null),
};
const SOURCE = { log: "chestnut", wood: "chestnut", stone: "scree", fiber: "hemp", reed: "reeds", clay: "pit", fish: "lake" };
const NPC_STATION = { fire: "taoHouse", kiln: "kiln", stove: "stove" };
const TORCH_FROM_STOVE = { id: "torch", needs: ["stove"], make: ["torch"], min: 20, fuelCost: 1 };
function recipeFor(id) {
  if (id === "jar") return RECIPES.find((r) => r.id === "jar" && r.kilnClay);
  if (id === "torch") return TORCH_FROM_STOVE;                       // a brand lit at the stove
  return RECIPES.find((r) => r.id === id);
}
function addCard(st, key) { const c = newCard(key); layerOf(st.board).append(c.el); c.el.classList.add("pop"); st.cards.push(c); return c; }
function wearNpc(st, key) {
  const t = st.cards.find((c) => c.key === key); if (!t) return;
  t.uses = (t.uses ?? DEFS[key].uses ?? 20) - 1;
  if (t.uses > 0) return;
  st.cards = st.cards.filter((c) => c !== t); t.el.remove();
  float(`${DEFS[st.cards[0].key].name}的${DEFS[key].name}用坏了`, center(st), st.board);
}
/** Which inputs a villager still lacks (a log will do where firewood is wanted). */
function missingFor(st, r) {
  const pool = st.cards.slice(1).map((c) => c.key), out = [];
  for (const k of r.needs.slice(1)) { const i = pool.findIndex((x) => x === k || (k === "wood" && x === "log")); if (i >= 0) pool.splice(i, 1); else out.push(k); }
  return out;
}
const pileHas = (k) => boards.tao.find((s) => s.store)?.cards.some((c) => c.key === k || (k === "wood" && c.key === "log"));
function planStep(st) {
  const plan = st.plans.at(-1);
  if (plan.deliver) return go(st, "granary", "jarIn");
  const r = plan.r, miss = missingFor(st, r);
  if (miss.length) {
    const k = miss[0];
    if (pileHas(k)) return go(st, "taoHouse", "fetchHome", k);
    if (SOURCE[k]) {
      const src = boards.world.find((s) => s.cards[0].key === SOURCE[k] && s.cards[0].stock > 0 && !inJungle(center(s)));
      if (!src) { st.plans = []; st.npc.wait = 120; return; }           // nothing left to gather: give up for now
      return go(st, SOURCE[k], "gather", k === "wood" ? "log" : k);
    }
    const sub = RECIPES.find((x) => x.id && x.make[0] === k && x.who?.includes(st.npc.key));
    if (sub && st.plans.length < 3) { st.plans.push({ r: sub }); return planStep(st); }
    st.plans = []; return;
  }
  go(st, NPC_STATION[r.needs[0]], "craft");
}
function craftDone(st, target) {
  const r = st.plans.at(-1)?.r; if (!r) return;
  const pool = [...missingFor({ cards: [st.cards[0]] }, r)];          // everything it needs, then take each from hand
  for (const k of pool) { const i = st.cards.findIndex((c, j) => j > 0 && (c.key === k || (k === "wood" && c.key === "log"))); if (i > 0) { st.cards[i].el.remove(); st.cards.splice(i, 1); } }
  const t = target.cards[0];
  if (r.kilnClay) { t.stock -= r.kilnClay; refreshStock(t); }
  if (r.fuelCost) t.fuel = Math.max(0, (t.fuel ?? 0) - r.fuelCost);
  const made = addCard(st, r.make[0]);
  st.plans.pop();
  float(`${DEFS[st.cards[0].key].name}做好了${made.key === "jar" ? "一只" : ""}${DEFS[made.key].name}`, center(st), st.board);
  if (made.key === "jar" && !st.plans.length) st.plans = [{ deliver: true }];
}

// ---------------------------------------------------------------------------
// You, unloading: produce to where it belongs, everything else home (or into a barn you built).
// ---------------------------------------------------------------------------
function unloadDest(st) {
  const n = {}; for (const c of loose(st)) n[c.key] = (n[c.key] ?? 0) + 1;
  for (const [depot, k] of Object.entries(DEPOT)) if ((n[k] ?? 0) >= 2) return depot;
  return find("barn") ? "barn" : "taoHouse";
}
function unload(st, target) {
  const k = target.cards[0].key, items = loose(st);
  if (k === "barn") { storeIn(target, st); return true; }
  if (k === "taoHouse") { st.cards = st.cards.filter((c) => !items.includes(c)); storeHome(items); float(`${items.length} 样放回家了`, center(st), st.board); carryChanged(); return true; }
  if (DEPOT[k]) {
    const t = target.cards[0], fits = items.filter((c) => c.key === DEPOT[k]);
    const room = k === "granary" ? Math.max(0, granaryCap(t) - t.stock) : Infinity, put = fits.slice(0, room);
    st.cards = st.cards.filter((c) => !put.includes(c)); put.forEach((c) => c.el.remove());
    t.stock = (t.stock ?? 0) + put.length; refreshStock(t); float(`+${put.length} ${DEFS[k].stockLabel ?? DEFS[DEPOT[k]].name}`, center(target), "world");
    carryChanged(); return true;
  }
  return false;
}
function storeIn(target, st) {
  const b = target.cards[0], items = loose(st);
  st.cards = st.cards.filter((c) => !items.includes(c)); items.forEach((c) => c.el.remove());
  b.items.push(...items.map((c) => c.key));
  float(`放进${b.name ?? "仓库"} ${items.length} 样`, center(target), "world"); carryChanged();
}
function takeFromBarn(st, key) {
  const you = youStack(), b = st?.cards[0];
  if (!b || !you) return;
  if (dist(center(you), center(st)) > moveRange() * 1.5) return toast("离得太远，走近点");
  if (loose(you).length >= capOf(you)) return toast("背不下了");
  const i = b.items.indexOf(key); if (i < 0) return;
  b.items.splice(i, 1); addCard(you, key); carryChanged(); showDetail(b);
}

// ---------------------------------------------------------------------------
// Building: pick a spot for the foundation, bring materials, put in the work, give it a name. A hammer takes it down.
// ---------------------------------------------------------------------------
let placing = null, naming = null;
function startPlacing(kind) {
  placing = kind; $("crafts").hidden = true; table.classList.add("placing");
  toast(kind === "farm" ? "点一块草地开荒（再点 ✎ 取消）" : `点一块空地，放${DEFS[kind].name}的地基（再点 ✎ 取消）`);
}
function placeFoundation(p) {
  const kind = placing, b = BUILDS[kind], [w, h] = TIERS[b.tier];
  if (board !== "world") return toast("得在外面打地基");
  const corners = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0]];
  if (!corners.every(([kx, ky]) => walkable(MAP, p.x + kx * w, p.y + ky * h) && MAP.cls[MAP.idx(p.x + kx * w, p.y + ky * h)] !== G.FORD)) return toast("这儿不平，换块地");
  if (!known(p)) return toast("还没去过那儿");
  if (b.grass && !corners.every(([kx, ky]) => MAP.cls[MAP.idx(p.x + kx * w, p.y + ky * h)] === G.MEADOW)) return toast("开荒得找一块草地");
  if (boards.world.some((s) => Math.abs(center(s).x - p.x) < (s.w + w) / 2 + 20 && Math.abs(center(s).y - p.y) < (s.h + h) / 2 + 20)) return toast("太挤了，离别的东西远一点");
  const c = newCard("plot", undefined, b.tier);
  c.build = kind; c.need = { ...b.needs }; c.work = 0; c.name = kind === "farm" ? "荒地" : `${DEFS[kind].name}·地基`;
  c.el.querySelector(".card-head span").textContent = c.name;
  newStack([c], p.x - w / 2, p.y - h / 2, "world");
  refreshPlot(c);
  placing = null; table.classList.remove("placing");
  toast("地基打好了：把材料带上去，齐了就站上去盖");
}
/** A foundation shows what it still needs, then how far the building has got. */
function refreshPlot(c) {
  const b = BUILDS[c.build], left = Object.entries(c.need).filter(([, n]) => n > 0);
  c.el.querySelector(".card-art").innerHTML = `<div class="plot-art">${iconFor(DEFS[c.build].icon)}</div>`
    + (left.length ? `<div class="plot-need">${left.map(([k, n]) => `<span title="${DEFS[k].name}">${iconFor(DEFS[k].icon)}<b>${n}</b></span>`).join("")}</div>`
      : `<i class="plot-bar"><u style="width:${Math.min(100, Math.round((c.work / b.work) * 100))}%"></u></i>`);
}
function handIn(target, lift) {
  const c = target.cards[0], took = lift.cards.filter((x) => (c.need[x.key] ?? 0) > 0 && c.need[x.key]-- > 0);
  const rest = lift.cards.filter((x) => !took.includes(x));
  took.forEach((x) => x.el.remove());
  if (rest.length) { const you = youStack(); you.cards.push(...rest); }
  removeStack(lift);
  if (took.length) float(`交了 ${took.length} 样`, center(target), "world"); else toast("这些地基用不上");
  refreshPlot(c);
}
function workPlot(st, target) {
  const c = target.cards[0], b = BUILDS[c.build];
  const took = loose(st).filter((x) => (c.need[x.key] ?? 0) > 0 && c.need[x.key]-- > 0);
  if (took.length) { st.cards = st.cards.filter((x) => !took.includes(x)); took.forEach((x) => x.el.remove()); float(`交了 ${took.length} 样材料`, center(target), "world"); refreshPlot(c); carryChanged(); }
  const left = Object.entries(c.need).filter(([, n]) => n > 0);
  if (left.length) { if (!took.length) toast(`还缺：${left.map(([k, n]) => `${DEFS[k].name}${n}`).join("、")}`); return; }
  if (starving()) return toast("饿得干不动了，先去吃点东西");
  if (spent()) return toast("没力气了，回屋睡一觉");
  if (b.tool && !st.cards.some((x) => x.key === b.tool)) return toast(`得带着${DEFS[b.tool].name}才能干`);
  const figuring = st.cards[0].key === "you" && !me.known[c.build];
  const chunk = Math.min(240, b.work - c.work), min = chunk * workPace() * (figuring ? 2 : 1);
  st.job = { r: { build: true, min: chunk, make: [] }, target, left: min, total: min, chunk, figuring };
  if (figuring) float("没盖过，边琢磨边盖……", center(st), st.board);
}
function finishBuildWork(st, target, figuring) {
  const c = target.cards[0], { chunk } = { chunk: Math.min(240, BUILDS[c.build].work - c.work) };
  c.work += chunk; refreshPlot(c);
  me.rest = Math.max(0, me.rest - chunk * 0.1);
  if (figuring) me.known[c.build] = { mem: 1, day: day() };
  else if (me.known[c.build]) me.known[c.build] = { mem: 1, day: day() };
  if (c.work >= BUILDS[c.build].work) return completeBuild(target);
  if (me.food > 20 && me.rest > 15) setTimeout(() => { if (!st.job && !st.walk && !st.lifted && boards.world.includes(target)) arrive(st, target); }, 650);
  carryChanged();
}
function completeBuild(target) {
  const c = target.cards[0], kind = c.build;
  if (kind === "farm") return completeField(target);
  const nc = newCard(kind); nc.built = { kind, spent: { ...BUILDS[kind].needs } };
  if (kind === "bighouse") {
    nc.room = `room${nc.id}`; boards[nc.room] = [];
    for (const [k, x, y] of ROOMS.tao) if (k !== "grain") newStack([newCard(k)], x, y, nc.room);
    const fire = boards[nc.room].find((s) => s.cards[0].key === "fire"); if (fire) fire.cards[0].fuel = 2;
  }
  if (kind === "barn") nc.items = [];
  c.el.remove(); cardsLayer.append(nc.el);
  target.cards = [nc]; target.w = nc.w; target.h = nc.h;
  me.known[kind] = { mem: 1, day: day() };
  banner("✦", `${DEFS[kind].name}盖好了`);
  naming = nc; $("nameInput").value = DEFS[kind].name; $("namer").hidden = false; $("nameInput").focus();
}
/** Broken ground becomes a field: empty until you sow it, its furrows painted on the land. */
function completeField(target) {
  const c = target.cards[0], nc = newCard("field", 0);
  nc.sown = false; nc.name = "新开的田"; nc.el.querySelector(".card-head span").textContent = nc.name; refreshStock(nc);
  c.el.remove(); cardsLayer.append(nc.el);
  target.cards = [nc]; target.w = nc.w; target.h = nc.h;
  const p = center(target);
  (MAP.extraFields ??= []).push({ patch: "field", x: p.x, y: p.y + 10, w: 230, h: 190 });
  me.known.farm = { mem: 1, day: day() };
  paintSeason();
  banner("✦", "开出一块新田");
  naming = nc; $("nameInput").value = nc.name; $("namer").hidden = false; $("nameInput").focus();
}
function startDismantle(st, target) {
  const c = target.cards[0], b = BUILDS[c.built?.kind ?? c.build];
  if (c.room && board === c.room) return;
  const min = (c.key === "plot" ? 60 : Math.max(120, b.work / 3)) * workPace();
  st.job = { r: { dismantle: true, needs: ["x", "hammer"], make: [], min }, target, left: min, total: min };
  float(c.key === "plot" ? "把地基拆了……" : "拆……", center(st), st.board);
}
function finishDismantle(st, target, r) {
  const c = target.cards[0];
  // a foundation gives back everything handed in; a finished building half of what went into it
  const back = c.key === "plot" ? Object.entries(BUILDS[c.build].needs).map(([k, n]) => [k, n - c.need[k]]) : Object.entries(c.built.spent).map(([k, n]) => [k, Math.floor(n / 2)]);
  const cards = back.flatMap(([k, n]) => Array.from({ length: n }, () => newCard(k))).concat((c.items ?? []).map((k) => newCard(k)));
  if (cards.length) { cards.forEach((x) => cardsLayer.append(x.el)); newStack(cards, target.x + 20, target.y + 20, "world"); }
  c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); removeStack(target);
  wearTool(st, "hammer");
  me.rest = Math.max(0, me.rest - r.min * 0.1);
  float(`拆了，拿回 ${cards.length} 样`, center(st), st.board); carryChanged();
}

// ---------------------------------------------------------------------------
// Little things
// ---------------------------------------------------------------------------
const DOING = { eat: "吃饭", wait: "等饭", tend: "照看田", harvest: "收粟", dig: "挖黏土", drop: "放东西", fetch: "取粟", cook: "煮饭", watch: "守着灶", fish: "在湖边捞鱼", give: "送鱼去灶上", sleep: "回家", evening: "在门口歇着", chop: "砍树", pick: "捡石头", store: "把东西送回家", sow: "播种", seed: "去公仓拿种子", hide: "躲老虎", gather: "去采材料", fetchHome: "回家拿材料", craft: "做东西", jarIn: "把陶罐放进公仓", build: "盖房子" };
function showDetail(card) {
  const d = { ...DEFS[card.key], ...(card.name ? { name: card.name } : {}) }, st = stackOf(card), box = $("detail");
  const ghost = card.el.classList.contains("ghost");
  const doing = st.npc ? (ghost ? "不在你眼前，这是你最后见到的地方" : st.npc.inside ? "在屋里歇着" : st.job ? `正在${DOING[st.job.npcTask] ?? "忙"}` : st.walk ? `要去${DEFS[st.goal]?.name ?? "别处"}${DOING[st.task] ? `（${DOING[st.task]}）` : ""}` : "") : "";
  const mine = st === youStack() && d.type === "food";
  const trust = card.key in me.trust ? `<p class="doing">熟识：${me.trust[card.key]}/3</p>` : "";
  const inside = d.type === "house" ? allStacks().filter((s) => s.npc?.inside && s.npc.home === card.key).map((s) => DEFS[s.npc.key].name) : [];
  const pile = d.type === "house" ? boards.tao.find((s) => s.store)?.cards ?? [] : [];
  const stored = Object.entries(pile.reduce((n, c) => ({ ...n, [DEFS[c.key].name]: (n[DEFS[c.key].name] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`);
  const canHunt = card.key in HUNT_BY && st.board === board && youStack() && dist(center(youStack()), center(st)) < huntRange(youStack());
  const making = st.plans?.length ? `<p class="doing">在做：${DEFS[st.plans[0].r.make?.[0]]?.name ?? "把陶罐送去公仓"}</p>` : "";
  const granary = card.key === "granary" ? `<p class="doing">能存 ${granaryCap(card)} 份（陶罐 ${card.jars ?? 0} 只）</p>` : "";
  const counts = (keys) => Object.entries(keys.reduce((n, k) => ({ ...n, [k]: (n[k] ?? 0) + 1 }), {}));
  const barn = card.key === "barn" ? `<div class="barn-items">${counts(card.items).map(([k, n]) => `<button data-take="${k}" data-from="${st.id}" title="拿一份${DEFS[k].name}">${iconFor(DEFS[k].icon)}<b>${n}</b></button>`).join("") || `<p class="doing">空的</p>`}</div>` : "";
  const plotInfo = card.key === "plot" ? `<p class="doing">${Object.values(card.need).some((v) => v > 0) ? "还缺材料（见牌面）" : `材料齐了，盖了 ${Math.round((card.work / BUILDS[card.build].work) * 100)}%`}</p>` : "";
  const built = card.built ? `<p class="doing">带着石锤走上来就能拆</p>` : "";
  const left = st.cards.slice(1).filter((c) => DEFS[c.key].type === "tool" && DEFS[card.key].type === "source");
  const toolsHere = TOOL_AT[card.key] ? `<p class="doing">${left.length ? `这儿放着：${left.map((c) => `${DEFS[c.key].name}（还能用 ${c.uses ?? DEFS[c.key].uses} 次）`).join("、")}` : `可以把${TOOL_AT[card.key].map((k) => DEFS[k].name).join("或")}放在这儿，来干活就不用带`}</p>` : "";
  const here = CRAFTS.filter((r) => r.needs[0] === card.key);
  const station = here.length ? `<div class="crafts">${here.filter((r) => me.known[r.id]).map(craftRow).join("")}${here.some((r) => !me.known[r.id]) ? `<p class="doing">还有 ${here.filter((r) => !me.known[r.id]).length} 样你不会：问问村民，或带齐东西来琢磨</p>` : ""}</div>` : "";
  const theirs = st.npc ? CRAFTS.filter((r) => r.who.includes(card.key)) : [];
  const skills = theirs.length ? `<p class="doing">会做：</p><div class="skill-icons">${theirs.map((r) => `<span class="${me.known[r.id] ? "" : "new"}" title="${craftName(r.id)}${me.known[r.id] ? "" : "（你还不会）"}">${iconFor(DEFS[r.make[0]].icon)}</span>`).join("")}</div>`
    + (st.board === board && dist(center(youStack()), center(st)) < 600 ? `<button class="act" data-teach="${st.id}">请教</button>` : `<p class="doing">走近了才能请教</p>`) : "";
  box.innerHTML = `<div class="detail-head t-${d.type}">${iconFor(d.icon)}<b>${d.name}</b></div><p>${d.text}</p>${doing ? `<p class="doing">${doing}</p>` : ""}${card.stock !== undefined ? `<p class="doing">${d.stockLabel ?? "还剩"}：${card.stock}</p>` : ""}${card.fuel !== undefined ? `<p class="doing">火：${card.fuel}/6</p>` : ""}${card.key === "lake" ? `<p class="doing">${tide.level > 0.3 ? "涨潮，水漫上了沙滩" : tide.level < -0.3 ? "退潮，露出一圈湿沙，鱼好捞" : "平潮"}</p>` : ""}${card.uses !== undefined ? `<p class="doing">还能用 ${card.uses} 次</p>` : ""}${card.charges ? `<p class="doing">还剩 ${card.charges} 份</p>` : ""}${inside.length ? `<p class="doing">屋里：${inside.join("、")}</p>` : ""}${stored.length ? `<p class="doing">家里存着：${stored.join("、")}</p>` : ""}${st.ctl ? `<p class="doing">听你安排（${{ auto: "自己安排", work: "按你派的活", manual: "你来指挥" }[st.ctl.mode]}）</p>` : ""}${trust}${mine ? `<button class="act" data-eat="${card.id}">吃掉（饱 +${d.food}）</button>` : ""}${canHunt ? `<button class="act" data-hunt="${card.id}">打它</button>` : ""}${making}${granary}${plotInfo}${barn}${built}${toolsHere}${station}${skills}`;
  box.hidden = false;
  const r = card.el.getBoundingClientRect();
  box.style.left = `${Math.min(window.innerWidth - 270, r.right + 8)}px`;
  box.style.top = `${Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, r.top))}px`;
}
$("detail").addEventListener("click", (e) => {
  const b = e.target.closest("[data-eat]");
  if (b) {
    const card = cardById(b.dataset.eat), you = youStack(), i = you.cards.indexOf(card);
    if (i <= 0) return;
    if (me.food >= 98) { toast("还饱着呢"); return; }
    if (card.key === "jarFull" && card.charges > 1) {
      card.charges -= 1; eat(DEFS.jarFull.food, center(you)); carryChanged(); hideDetail();
      return;
    }
    you.cards.splice(i, 1); card.el.classList.add("gone"); setTimeout(() => card.el.remove(), 300);
    eat(DEFS[card.key].food, center(you));
    carryChanged(); hideDetail();
    return;
  }
  const take = e.target.closest("[data-take]");
  if (take) { takeFromBarn(allStacks().find((s) => s.id === Number(take.dataset.from)), take.dataset.take); return; }
  const ask = e.target.closest("[data-teach]");
  if (ask) { const npc = allStacks().find((s) => s.id === Number(ask.dataset.teach)); hideDetail(); if (npc) teach(npc); return; }
  const hunt = e.target.closest("[data-hunt]");
  if (hunt) { attackRabbit(cardById(hunt.dataset.hunt)); hideDetail(); return; }
});
function hideDetail() { $("detail").hidden = true; }
/** One line of know-how: where, what goes in, what comes out, and how well you still remember it. */
function craftRow(r) {
  const k = me.known[r.id], mem = k ? k.mem : 0;
  const ins = r.build
    ? Object.entries(BUILDS[r.id].needs).map(([n, c]) => `<span title="${DEFS[n].name} ${c}">${iconFor(DEFS[n].icon)}<sub>${c}</sub></span>`).join("")
    : r.needs.slice(1).map((n) => `<span title="${DEFS[n].name}">${iconFor(DEFS[n].icon)}</span>`).join("");
  return `<div class="craft" title="${craftName(r.id)}"><span class="at" title="在${DEFS[r.needs[0]].name}">${iconFor(DEFS[r.needs[0]].icon)}</span><span class="ins">${ins}</span><b>→</b>`
    + `<span title="${craftName(r.id)}">${iconFor(DEFS[r.make[0]].icon)}</span><i class="mem${mem < 0.35 ? " fading" : ""}" title="${mem < 0.35 ? "快忘了" : "记得"}"><u style="width:${Math.round(mem * 100)}%"></u></i></div>`;
}
/** Your book of know-how: everything you can make, and how fresh it is. */
function renderCrafts() {
  const box = $("crafts");
  if (!box || box.hidden) return;
  const mine = CRAFTS.filter((r) => me.known[r.id]);
  const builds = Object.keys(BUILDS).map((id) => `<div class="build-row">${craftRow(CRAFTS.find((r) => r.id === id))}<button class="act" data-place="${id}">${id === "farm" ? "选块草地开荒" : "选地方打地基"}</button></div>`).join("");
  box.innerHTML = `<b>你会的手艺</b>${mine.filter((r) => !r.build).map(craftRow).join("") || `<p>还什么都不会。</p>`}<b class="sub">盖房子</b>${builds}<p class="doing">没学会的还有 ${CRAFTS.length - mine.length} 样：点开村民按「请教」，或者带齐东西到地方自己琢磨（慢，还不一定成）。不用的手艺一周左右就忘。</p>`;
}
function say(st, text) {
  if (!st) return;
  const b = document.createElement("div");
  b.className = "speech"; b.textContent = text;
  b.style.transform = `translate(${st.x - 40}px, ${st.y - 64}px)`;
  layerOf(st.board).append(b);
  setTimeout(() => b.classList.add("out"), 2600); setTimeout(() => b.remove(), 3100);
}
function float(text, p, b = board) {
  const f = document.createElement("div");
  f.className = "float"; f.textContent = text; f.style.left = `${p.x}px`; f.style.top = `${p.y - 60}px`;
  layerOf(b).append(f);
  setTimeout(() => f.remove(), 1300);
}
let toastT = 0;
function toast(t) { const el = $("toast"); el.textContent = t; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2400); }
function banner(big, small) { const b = $("banner"); b.innerHTML = `<b>${big}</b><span>${small}</span>`; b.hidden = false; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), 1800); }

$("speed").addEventListener("click", (e) => { const b = e.target.closest("[data-speed]"); if (b) setSpeed(Number(b.dataset.speed)); });
function setSpeed(s) { clock.speed = s; document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", Number(b.dataset.speed) === s)); table.classList.toggle("paused", s === 0); }
let lastSpeed = 1;
document.addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); if (clock.speed) { lastSpeed = clock.speed; setSpeed(0); } else setSpeed(lastSpeed); } });
$("help").onclick = () => { $("helpbox").hidden = false; };
$("craftBook").onclick = () => { if (placing) { placing = null; table.classList.remove("placing"); toast("不打地基了"); return; } const b = $("crafts"); b.hidden = !b.hidden; renderCrafts(); };
$("crafts").addEventListener("click", (e) => { const b = e.target.closest("[data-place]"); if (b) startPlacing(b.dataset.place); });
$("nameOk").onclick = () => { const c = naming; if (!c) return; c.name = $("nameInput").value.trim() || DEFS[c.key].name; c.el.querySelector(".card-head span").textContent = c.name; $("namer").hidden = true; naming = null; toast(`就叫「${c.name}」`); };
$("helpClose").onclick = () => { $("helpbox").hidden = true; };
$("meFace").addEventListener("click", () => repeatRecent(0));
$("meRecent").addEventListener("click", (e) => { const b = e.target.closest("[data-recent]"); if (b) repeatRecent(Number(b.dataset.recent)); });
$("autoMe").addEventListener("click", () => { me.auto = !me.auto; me.lastInput = clock.min; renderAutoMe(); toast(me.auto ? "闲着的时候会自己找事做" : "不再自己找事做"); });
$("partyToggle").addEventListener("click", () => { party.open = !party.open; me.lastInput = clock.min; renderParty(); });
$("party").addEventListener("click", (e) => {
  me.lastInput = clock.min;
  const row = e.target.closest("[data-id]"); if (!row) return;
  const st = allStacks().find((s) => s.id === Number(row.dataset.id)); if (!st?.ctl) return;
  const focus = e.target.closest("[data-focus]"), mode = e.target.closest("[data-mode]"), job = e.target.closest("[data-job]");
  if (focus && st.board === "world") { cam.follow = false; const c = center(st); cam.x = c.x; cam.y = c.y; applyCam(); }
  if (mode) setMode(st, mode.dataset.mode);
  if (job) { st.ctl.job = job.dataset.job; cancelJob(st); st.walk = null; st.goal = ""; intent(st, ""); }
  renderParty();
});

// ---------------------------------------------------------------------------
const artFound = await loadArt();
worldEl.style.width = `${WW}px`; worldEl.style.height = `${WH}px`;
build();
$("meFace").innerHTML = iconFor("you");
renderRecent(); renderParty(); renderAutoMe();
{ const r = table.getBoundingClientRect(); cam.z = Math.min(1.05, Math.max(0.7, r.height / 800)); const c = center(youStack()); cam.x = c.x; cam.y = c.y - 30; }
applyCam(); fitRoom();
window.addEventListener("resize", () => { applyCam(); fitRoom(); });
requestAnimationFrame(frame);
window.__mock = { inJungle, SPECIES, spawnAnimal, attackRabbit, BUILDS, startPlacing, placeFoundation, completeBuild, refreshPlot, newStack, WANT, planStep, holds, teach, renderCrafts, setMode, members, gainTrust, party, renderParty, tide, darkness, lights, litAt, boards, clock, cam, me, MAP, youStack, walkTo, find, center, discs, setSpeed, artFound, moveRange, arrive, walkable: (x, y) => walkable(MAP, x, y), explore, paintFog, paintSeason, newCard, eco, attackRabbit, showDetail, findPath: (a, b) => findPath(MAP, a, b) };
