// OpenLife · card world mockup v4: a generated valley under fog, flowing time, villagers who live their own days.
import { iconFor } from "./icons.js";
import { loadArt, deco as DECO } from "./art.js";
import { generateWorld, walkable, reachAlong, findPath, woodDepth, terrainBlock, G } from "./mapgen.js";
import { paintTerrain, paintTide, paintCover, paintCrop, paintResourcePatch, prewarmBase } from "./terrain.js";
import { LAND, SITES, LAYOUT, PEOPLE, START, WOOD_LAYOUT, LAKE_LAYOUT, FARM_FIELDS, FIELD_SIZE, PLATEAU_LAYOUT } from "./valley.js";
import * as VOICE from "./voice.js";
import { PEOPLE_DATA, TIERS as BONDS, tierOf, dayName } from "./people.js";
import { LADDER, condDone, rungDone, POP_CAP, NEWCOMERS, FESTIVALS } from "./village.js";
import { NEEDS, THEORIES, INVENTIONS } from "./knowledge.js";
import { makeNpcSocial, recordNpcChat, recordNpcCooperation, willNpcChat, restoreNpcSocial, relationOf, npcTemperament } from "./npc-social.js";
import { advanceClock, createWorldRandom, dayAt } from "./world-clock.js";
import { cropWeather, planProduction, productionHistory, recordProduction } from "./production.js";
import { chooseVillageAid, planNpcFood } from "./npc-goals.js";
import { makeNpcKnowledge, acquireTheory, transmitTheory, chooseTheoryToShare, restoreNpcKnowledge, knowledgeOf } from "./npc-knowledge.js";
import { oldRoomFurnishing, oldYardFurnishing, pickDropTarget, ROOM_ENTRY, ROOM_FURNITURE, yardFurnishing } from "./board-layout.js";
import { planVillageExchange, TRADE_WORTH } from "./village-exchange.js";
import { coastRaidRoute, raidLoot } from "./coast-raid.js";
import { naturalSource, nextSourcePulse, sourceCapacity, sourceNextStock, sourcePlant, sourceStage, sourceWait } from "./resource-ecology.js";
import { bundleLayout, playerStride, walkEffort } from "./board-play.js";
import { harm, pickEvent } from "./storyteller.js";
import { HABITS, alongShore, catchUp, duckPlan, fileSlot, flockSlot, isActive, leaderOf, spellLength } from "./animal-ways.js";
import { audioLevel, audioRunning, setScene, settings as soundSettings, setVolume, sfx, startAudio } from "./audio.js";
import { FIRST_STEPS, guideStep, ladderGoal } from "./guide.js";
import { BREAK_AT, moodPace, moodStep, moodTarget, moodlets, worst } from "./npc-mood.js";
import { cookProject, farmerProject, fisherProject, gathererProject, pickGrove } from "./npc-mind.js";
import { BUILD_STAGES, LEAD, addWork, buildSession, delivered, helpSession, raiseSkill, stageOf, stagesOf, totalNeeds, totalWork } from "./building.js";
import { fieldGuard, BARE_HILLS, PROWL_PREY, SOIL_MAX, SOIL_WORDS, TIGER_PROWL, fellingNext, floodAfter, rabbitCap, rabbitRaid, soilAtWinter, soilOf } from "./ecology-chain.js";

const $ = (id) => document.getElementById(id);
const CARD_W = 112, CARD_H = 148, PEEK = 30;
// Two card sizes for now: s = everything you carry, work at, or sleep in; m = the one house you can go inside.
// A future sailing ship gets its own size, not a per-card size.
const TIERS = { s: [112, 148], m: [168, 222], l: [224, 290] };
const SIZE = { taoHouse: "m", bighouse: "l", barn: "m" };
const REVEAL = 640, SIGHT = 9999, REACH = 260;
const MOVE_RANGE = 560;                // how far you can go in one drag, fed and rested
const PX_PER_MIN = 20;                 // walking speed: px per game minute
const MIN_PER_SEC = 8;                 // at 1×, one game day = 180 s (3 minutes); dusk and dawn take several seconds each
const SEASONS = ["春", "夏", "秋", "冬"], DAYS_PER_SEASON = 4;

const params = new URLSearchParams(location.search);
const freshStart = params.has("new");                // remembered before readSave drops ?new
const seed = Number(params.get("seed")) || LAND.seed;
let worldRandom = createWorldRandom(seed);
const randomWorld = () => worldRandom.next("world");
const randomVoice = () => worldRandom.next("voice");
const randomWild = () => worldRandom.next("wildlife");
const firstDay = Math.max(1, Math.floor(Number(params.get("day")) || 1));   // preview a season: ?day=13 starts in winter
const MAP = generateWorld(seed, LAND.tiles, SITES);
const WW = MAP.W, WH = MAP.H;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
const DEFS = {
  you:        { name: "你 · 启禾", type: "you", icon: "you", text: "十六岁，刚搬进陶家庭院帮工。" },
  aunt:       { name: "陶婶", type: "person", icon: "aunt", text: "掌管公灶的长辈。嘴上爱念叨，心里热乎。" },
  gu:         { name: "阿罟", type: "person", icon: "boatman", text: "打了半辈子鱼的老把式，看水色就知道鱼在哪一层。打了鱼送去公灶。" },
  wei:        { name: "阿苇", type: "person", icon: "cook", text: "割芦苇、编席子的。话少，总担心芦苇荡一年比一年稀，只割老苇。" },
  li:         { name: "阿砺", type: "person", icon: "digger", text: "打制石器的匠人。去矿道挖石头背回家，会做斧、刀、锤、矛。" },
  hut:        { name: "窝棚", type: "structure", icon: "hut", text: "芦苇和木头搭的窝棚，能睡两个人。" },
  granaryPit: { name: "粮窖", type: "structure", icon: "granary", text: "挖在地里的窖，底下铺石头、上头盖木头，粟不受潮。公仓因此多存 10 份。" },
  calendarStick: { name: "测影竿", type: "structure", icon: "wood", text: "立在田边量日影的竿子。有了它，就知道还有几天换季（看左上角的季节）。" },
  floodMark:  { name: "记水木", type: "tool", icon: "log", text: "刻着道道的木桩。放在湖边，春雨一下就看得出水涨了几道，漫岸前一天先报信。" },
  smokedFish: { name: "熏鱼", type: "food", icon: "roastFish", text: "在火塘上熏干的鱼，放十来天不坏。", food: 22 },
  smokedMeat: { name: "熏肉", type: "food", icon: "roastMeat", text: "熏干的肉，放十来天不坏。", food: 30 },
  san:        { name: "阿三", type: "person", icon: "yu", text: "种地的。话少，手上的活从不含糊：春天下种，春夏锄草，秋天收了粟背去公仓。" },
  dog:        { name: "阿黄", type: "animal", icon: "dog", text: "院子里的狗，在家附近转悠。" },
  rabbit:     { name: "野兔", type: "animal", icon: "rabbit", text: "耳朵在草尖上转了转。" },
  taoHouse:   { name: "陶家主屋", type: "house", icon: "house", text: "全村人晚上都睡在这儿。南边有道门，走进院子才看得见铺位和火塘。" },
  stove:      { name: "公用灶台", type: "structure", icon: "stove", text: "一口大锅架在火上，旁边搁着几只陶碗。", stockLabel: "熟食" },
  granary:    { name: "公仓", type: "structure", icon: "granary", text: "架高的粮囤里有干粟的香气。", stockLabel: "粟" },
  field:      { name: "旱地·一", type: "source", icon: "field", text: "垄沟之间，细土晒得发白。", stockLabel: "长势" },
  field2:     { name: "旱地·二", type: "source", icon: "field", text: "与旁边那块地隔着一道田埂。", stockLabel: "长势" },
  lake:       { name: "湖边", type: "source", icon: "river", text: "岸边水波很轻，偶尔能看见鱼影。", stock: 7 },
  pit:        { name: "黏土坑", type: "source", icon: "pit", text: "湿润的黏土露在水痕下方。", stock: 6 },
  reeds:      { name: "芦苇荡", type: "source", icon: "reeds", text: "苇杆密密地立着，水面上传来窸窣声。", stock: 5 },
  chestnut:   { name: "栗子树", type: "source", icon: "chestnut", text: "枝叶低垂，树皮上留着旧斧痕。", stock: 4, stockLabel: "木头" },
  pineGrove:  { name: "深林松树", type: "source", icon: "pineGrove", text: "粗糙的树皮上挂着松脂，深绿的针叶簇在枝头。", stock: 4, stockLabel: "木头" },
  scree:      { name: "林间石堆", type: "source", icon: "scree", text: "林地里有一小片碎石。", stock: 6 },
  flintVein:  { name: "燧石", type: "source", icon: "flint", text: "灰白的石壁里夹着一条黑亮的石脉。", stock: 5 },
  mineFace:   { name: "矿道石壁", type: "source", icon: "scree", text: "石壁尽头，断面上还留着凿痕。", stock: 7, stockLabel: "石块" },
  cliffFoot:  { name: "崖脚", type: "source", icon: "scree", text: "仰头只见一整面陡壁，风从崖顶压下来。" },
  cliffTop:   { name: "崖顶", type: "source", icon: "scree", text: "崖边的石头被风磨得发亮。" },
  climbRope:  { name: "攀绳", type: "tool", icon: "rope", text: "麻股粗实，末端拴着一截横木。", uses: 1 },
  herbs:      { name: "药草坡", type: "source", icon: "hemp", text: "石缝间有一簇叶子，揉碎了带点清苦味。", stock: 4 },
  herb:       { name: "药草", type: "food", icon: "fiber", text: "一把药草。病了吃下去，很快就好。", food: 2 },
  copperRock: { name: "绿石头", type: "source", icon: "stone", text: "裸露的石面上染着一点青绿。", stock: 3 },
  malachite:  { name: "孔雀石", type: "material", icon: "stone", text: "绿得发亮的石头。" },
  lookout:    { name: "远眺石", type: "source", icon: "scree", text: "高原边上一块大石头，站上去能望见很远。" },
  goat:       { name: "野山羊", type: "animal", icon: "deer", text: "一只山羊沿着碎石坡站着，耳朵转向你。" },
  trader:     { name: "阿贾", type: "person", icon: "boatman", text: "从东南边的村子划筏子过湖来换东西的人。下午就回去。" },
  blackReef:  { name: "黑礁岛", type: "structure", icon: "hut", text: "礁石后立着矮棚，浅湾里系着一艘挂黑帆的船。" },
  coastRaider: { name: "黑帆劫掠者", type: "animal", icon: "boat", text: "衣摆沾着海盐，船头放着几个空粮袋。" },
  salt:       { name: "盐", type: "material", icon: "stone", text: "一块粗盐，东南边换来的。人人都稀罕。" },
  cloth:      { name: "布衣", type: "tool", icon: "fiber", text: "一件麻布衣裳。带在身上，冬夜冻得慢一半。" },
  hemp:       { name: "葛麻丛", type: "source", icon: "hemp", text: "细长的葛麻顺着坡长了一片。", stock: 6 },
  berries:    { name: "野果丛", type: "source", icon: "berries", text: "低矮灌木顺着林边铺开。", stock: 0 },
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
  meat:       { name: "鲜肉", type: "food", icon: "meat", text: "一块新猎来的肉。", food: 24 },
  hide:       { name: "兔皮", type: "material", icon: "hide", text: "一张兔皮，以后能做东西。" },
  deer:       { name: "鹿", type: "animal", icon: "deer", text: "鹿抬起头，耳朵朝林子外转。" },
  boar:       { name: "野猪", type: "animal", icon: "boar", text: "野猪低着头在树根下拱土。" },
  peach:      { name: "桃树", type: "source", icon: "peachTree", text: "果园里的桃树。春天开花，夏天结桃，每天熟几个；秋天少，冬天没有。", stock: 0, stockLabel: "桃" },
  jujube:     { name: "枣树", type: "source", icon: "jujubeTree", text: "果园里的枣树。秋天结枣，每天熟几个。", stock: 0, stockLabel: "枣" },
  peachFruit: { name: "桃", type: "food", icon: "peach", text: "一个熟桃。", food: 14 },
  jujubeFruit:{ name: "枣", type: "food", icon: "jujube", text: "一把红枣。", food: 10 },
  tiger:      { name: "老虎", type: "animal", icon: "tiger", text: "斑纹隐在树影里，林子忽然没了声息。" },
  mushroom:   { name: "蘑菇", type: "food", icon: "mushroom", text: "丛林里采的蘑菇。", food: 16 },
  pelt:       { name: "虎皮", type: "material", icon: "pelt", text: "一张虎皮。打到老虎的人，村里会记很久。" },
  duck:       { name: "野鸭", type: "animal", icon: "duck", text: "在湖面上游来游去，在芦苇里做窝。" },
  nest:       { name: "鸭窝", type: "source", icon: "nest", text: "芦苇深处垫着一圈干草。", stock: 2 },
  egg:        { name: "鸭蛋", type: "food", icon: "egg", text: "一个鸭蛋。", food: 10 },
  spear:      { name: "石矛", type: "tool", icon: "spear", text: "削尖的石刃牢牢绑在长杆上。", uses: 15 },
  farm:       { name: "开荒", type: "source", icon: "field", text: "开出一块新田。" },
  shallows:   { name: "湖东浅滩", type: "source", icon: "clams", text: "泥沙下露出几道浅浅的蚌壳边。", stock: 6 },
  clam:       { name: "河蚌", type: "food", icon: "clam", text: "一只河蚌，生吃也行。", food: 14 },
  hammer:     { name: "石锤", type: "tool", icon: "hammer", text: "一块沉重的石头扎在短柄上。", uses: 20 },
  plot:       { name: "地基", type: "structure", icon: "plot", text: "盖房子的地方。把材料带上来或者拖上来，齐了以后站在上面一段段地盖。" },
  bighouse:   { name: "大房子", type: "house", icon: "bighouse", text: "你们自己盖的大房子：屋里有火塘和铺位。" },
  barn:       { name: "仓库", type: "structure", icon: "barn", text: "放东西的地方。背着东西走上来，就都放进去；点开能一样样取出来。" },
  torch:      { name: "火把", type: "tool", icon: "torch", text: "天黑后拿着它，自己身边亮一大圈，走路不受黑影响。烧一夜就完。", burn: 480 },
  roastFish:  { name: "烤鱼", type: "food", icon: "roastFish", text: "烤得焦香，比生鱼顶饱得多。", food: 34 },
  roastMeat:  { name: "烤肉", type: "food", icon: "roastMeat", text: "油汪汪的，一块能顶大半天。", food: 44 },
  basket:     { name: "背篓", type: "tool", icon: "basket", text: "背着它，一次能带 10 样东西（不背只能带 4 样）。" },
  sandals:    { name: "草鞋", type: "tool", icon: "sandals", text: "穿着走得远：一次能走的距离多四分之一。走久了会磨坏。", uses: 40 },
  net:        { name: "渔网", type: "tool", icon: "net", text: "带到湖边，一网两条鱼，还快。会用坏。", uses: 20 },
  grain:      { name: "粟", type: "food", icon: "grain", text: "一份粟，生嚼也能顶一顶。", food: 12 },
  chest:      { name: "木箱", type: "structure", icon: "chest", text: "钉起来的木箱，能收 12 样材料。院里的木箱会自动收拾杂物堆上的材料。" },
  compost:    { name: "堆肥坑", type: "structure", icon: "compost", text: "烂菜叶、坏了的吃食、割下的草都倒进来，沤几天就成了肥。" },
  cellar:     { name: "地窖", type: "structure", icon: "cellar", text: "院边挖的窖。院里杂物堆上的吃食放得久一倍。" },
  scarecrow:  { name: "稻草人", type: "tool", icon: "scarecrow", text: "芦苇扎的草人。立在田里，兔子来得少。" },
  fence:      { name: "篱笆", type: "tool", icon: "fence", text: "木桩和绳子编的篱笆。围在田边，兔子几乎进不来。" },
  muck:       { name: "沤肥", type: "material", icon: "muck", text: "堆肥坑里沤好的肥。撒进地里地力 +2，一块地一年撒一回。" },
  ash:        { name: "草木灰", type: "material", icon: "ash", text: "火塘里掏出来的灰。撒进地里能养地：地力 +1，一块地一年撒一回。" },
  bean:       { name: "豆", type: "food", icon: "bean", text: "一把豆子。能煮着吃，也能当种：种过豆的地会肥起来，豆也比粟耐旱。", food: 10 },
  fish:       { name: "鱼", type: "food", icon: "fish", text: "一条鲜鱼。", food: 18 },
  berry:      { name: "野果", type: "food", icon: "berry", text: "酸甜的野果。", food: 10 },
  door:       { name: "门", type: "exit", icon: "door", text: "从这里出去。" },
  bed:        { name: "铺位", type: "structure", icon: "bed", text: "铺着晒过的草席。" },
  fire:       { name: "火塘", type: "structure", icon: "fire", text: "屋里的火。" },
};
const CARRY = new Set(["material", "food", "item", "tool"]);
const SERVING = 45;                    // one helping at the stove

// What you do when you arrive at something (with what you carry). min = game minutes. Most specific first.
// Recipes with an id are know-how: you have to have learned them (or work them out, slowly and not always).
// who: the villagers who know it and can teach you. Recipes without an id are things anyone can do.
const RECIPES = [
  { id: "basket", who: ["san", "wei"], needs: ["fire", "reed", "reed", "reed", "rope"], make: ["basket"], min: 180, use: ["reed", "reed", "reed", "rope"], mark: "第一只背篓" },
  { id: "net", who: ["aunt", "gu"], needs: ["fire", "fiber", "fiber", "rope"], make: ["net"], min: 180, use: ["fiber", "fiber", "rope"], mark: "第一张渔网" },
  { id: "sandals", who: ["aunt", "wei"], needs: ["fire", "reed", "reed", "fiber"], make: ["sandals"], min: 120, use: ["reed", "reed", "fiber"], mark: "第一双草鞋" },
  { id: "bed", who: ["aunt", "san", "gu", "wei", "li"], needs: ["fire", "reed", "reed", "reed", "fiber"], make: ["bed"], min: 90, use: ["reed", "reed", "reed", "fiber"], mark: "第一张自己扎的铺位" },
  { id: "scarecrow", inv: "scarecrow", who: [], needs: ["fire", "reed", "reed", "reed", "log"], make: ["scarecrow"], min: 90, use: ["reed", "reed", "reed", "log"], mark: "第一个稻草人" },
  { id: "fence", inv: "fence", who: [], needs: ["fire", "log", "log", "log", "rope"], make: ["fence"], min: 150, use: ["log", "log", "log", "rope"], mark: "第一道篱笆" },
  { id: "hoe", who: ["san"], needs: ["fire", "stone", "log", "fiber"], make: ["hoe"], min: 120, use: ["stone", "log", "fiber"], mark: "第一把石锄" },
  // smoking takes two at a time (one fish and a bundle of wood is just a roast)
  { id: "smoke", inv: "smoking", who: [], needs: ["fire", "fish", "fish", "wood"], make: ["smokedFish", "smokedFish"], min: 120, use: ["fish", "fish", "wood"], mark: "第一回熏鱼" },
  { id: "smoke", inv: "smoking", who: [], needs: ["fire", "meat", "meat", "wood"], make: ["smokedMeat", "smokedMeat"], min: 140, use: ["meat", "meat", "wood"] },
  { id: "roast", who: ["aunt"], needs: ["fire", "fish", "wood"], make: ["roastFish"], min: 40, use: ["fish", "wood"] },
  { id: "roast", who: ["aunt"], needs: ["fire", "meat", "wood"], make: ["roastMeat"], min: 50, use: ["meat", "wood"] },
  { id: "torch", who: ["aunt"], needs: ["fire", "wood", "fiber"], make: ["torch"], min: 30, use: ["wood", "fiber"] },
  { id: "hammer", who: ["san", "li"], needs: ["fire", "stone", "stone", "log"], make: ["hammer"], min: 90, use: ["stone", "stone", "log"], mark: "第一把石锤" },
  { id: "axe", who: ["san", "li"], needs: ["fire", "stone", "log"], make: ["axe"], min: 120, use: ["stone", "log"], mark: "第一把石斧" },
  { id: "spear", who: ["san", "li"], needs: ["fire", "flint", "log", "fiber"], make: ["spear"], min: 150, use: ["flint", "log", "fiber"], mark: "第一支石矛" },
  { id: "knife", who: ["san", "li"], needs: ["fire", "flint", "log"], make: ["knife"], min: 150, use: ["flint", "log"], mark: "第一把燧石刀" },
  { id: "floodMark", inv: "flood-marks", who: [], needs: ["fire", "log"], make: ["floodMark"], min: 60, use: ["log"] },
  { id: "climbRope", who: ["li", "san"], needs: ["fire", "rope", "rope", "log"], make: ["climbRope"], min: 90, use: ["rope", "rope", "log"], mark: "第一根攀绳" },
  { id: "rope", who: ["aunt", "san", "gu", "wei"], needs: ["fire", "fiber", "fiber"], make: ["rope"], min: 90, use: ["fiber", "fiber"] },
  { needs: ["fire", "log", "axe"], make: ["wood", "wood"], min: 90, use: ["log"] },
  { needs: ["lake", "net"], make: ["fish", "fish"], min: 90, take: true },
  { needs: ["fire", "wood"], make: [], min: 20, use: ["wood"], fuel: true },
  { needs: ["fire", "log"], make: [], min: 20, use: ["log"], fuel: 2 },
  { needs: ["chestnut", "axe"], make: ["log", "log"], min: 120, take: true },
  { needs: ["reeds", "knife"], make: ["reed", "reed"], min: 60, take: true },
  { needs: ["hemp", "knife"], make: ["fiber", "fiber"], min: 60, take: true },
  { needs: ["flintVein", "stone"], make: ["flint"], min: 180, take: true },
  { needs: ["pit"], make: ["clay"], min: 90, take: true },
  { needs: ["reeds"], make: ["reed"], min: 60, take: true },
  { needs: ["lake"], make: ["fish"], min: 120, take: true },
  { needs: ["chestnut"], make: ["log"], min: 180, take: true },
  { needs: ["scree"], make: ["stone"], min: 45, take: true },
  { needs: ["herbs"], make: ["herb"], min: 40, take: true },
  { needs: ["copperRock", "hammer"], make: ["malachite"], min: 90, take: true },
  { needs: ["copperRock"], make: ["malachite"], min: 180, take: true },
  { needs: ["mineFace", "hammer"], make: ["stone", "stone"], min: 60, take: true },
  { needs: ["mineFace"], make: ["stone"], min: 90, take: true },
  { needs: ["hemp"], make: ["fiber"], min: 90, take: true },
  { needs: ["berries"], make: ["berry", "berry"], min: 40, take: true },
  { needs: ["field", "muck"], when: (t) => soilOf(t) < SOIL_MAX && t.manured !== yearNo(), make: [], min: 40, use: ["muck"], manure: 2 },
  { needs: ["field2", "muck"], when: (t) => soilOf(t) < SOIL_MAX && t.manured !== yearNo(), make: [], min: 40, use: ["muck"], manure: 2 },
  { needs: ["field", "ash"], when: (t) => soilOf(t) < SOIL_MAX && t.manured !== yearNo(), make: [], min: 30, use: ["ash"], manure: 1 },
  { needs: ["field2", "ash"], when: (t) => soilOf(t) < SOIL_MAX && t.manured !== yearNo(), make: [], min: 30, use: ["ash"], manure: 1 },
  { needs: ["field", "bean"], when: (t) => t.sown === false && season() === "春", make: [], min: 60, use: ["bean"], sow: true },
  { needs: ["field2", "bean"], when: (t) => t.sown === false && season() === "春", make: [], min: 60, use: ["bean"], sow: true },
  { needs: ["field", "grain"], when: (t) => t.sown === false && season() === "春", make: [], min: 60, use: ["grain"], sow: true },
  { needs: ["field2", "grain"], when: (t) => t.sown === false && season() === "春", make: [], min: 60, use: ["grain"], sow: true },
  // the yield follows how well it grew: two grain for every step of growth (a full field, six; a dry year, less)
  { needs: ["field"], when: (t) => t.stock >= 1 && t.sown !== false && season() === "秋", make: [], min: 120, harvest: true },
  { needs: ["field2"], when: (t) => t.stock >= 1 && t.sown !== false && season() === "秋", make: [], min: 120, harvest: true },
  // a dry summer: carry water up from the lake in a jar; a watered field doesn't wilt tomorrow
  { needs: ["field", "jar"], when: (t) => t.sown !== false && season() === "夏" && nature.dryDays >= 2 && t.tendDay !== day(), make: [], min: 40, water: true },
  { needs: ["field2", "jar"], when: (t) => t.sown !== false && season() === "夏" && nature.dryDays >= 2 && t.tendDay !== day(), make: [], min: 40, water: true },
  { needs: ["field", "hoe"], when: (t) => t.sown !== false && (season() === "春" || season() === "夏"), make: [], min: 60, tend: 2 },
  { needs: ["field2", "hoe"], when: (t) => t.sown !== false && (season() === "春" || season() === "夏"), make: [], min: 60, tend: 2 },
  { needs: ["field"], when: (t) => t.sown !== false && (season() === "春" || season() === "夏"), make: [], min: 150, tend: 1 },
  { needs: ["field2"], when: (t) => t.sown !== false && (season() === "春" || season() === "夏"), make: [], min: 150, tend: 1 },
  { needs: ["nest"], make: ["egg"], min: 20, take: true },
  { needs: ["peach"], make: ["peachFruit"], min: 20, take: true },
  { needs: ["jujube"], make: ["jujubeFruit", "jujubeFruit"], min: 30, take: true },
  { needs: ["shallows"], make: ["clam"], min: 60, take: true },
  { needs: ["granary", "jar"], make: [], min: 15, use: ["jar"], jarIn: true },
  { needs: ["stove", "jar"], make: [], min: 15, fill: true, mark: "第一次装满一罐" },
  { needs: ["stove", "wood"], make: [], min: 20, use: ["wood"], fuel: true },
  { needs: ["stove", "log"], make: [], min: 20, use: ["log"], fuel: 2 },
  { needs: ["stove"], make: [], min: 8, eat: true },
  { needs: ["bed"], make: [], min: 0, sleep: true },
  { needs: ["hut"], make: [], min: 0, sleep: true },
  { needs: ["pineGrove", "axe"], make: ["log", "log"], min: 120, take: true },
  { needs: ["pineGrove"], make: ["log"], min: 180, take: true },
];
const TALK = {                                              // people's lines come from voice.js; these are the animals
  dog: ["（阿黄摇了摇尾巴）"],
  rabbit: ["（它竖起耳朵，随时要跑）"],
};
const HINT = {
  field: "田里还没什么可收的", field2: "田里还没什么可收的", granary: "粮囤里有干粟的香气",
  cliffFoot: "岩壁光秃秃的，够不到能攀的地方",
  fire: "火星在灰里明明灭灭", flintVein: "用手掰不动石缝里的燧石",
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let uid = 0;
const boards = { world: [], tao: [] };   // stacks per board
let board = "world";
const stacks = () => boards[board];
const clock = { min: 6 * 60 + (firstDay - 1) * 1440, speed: 1, fast: 0 };
const me = { food: 70, rest: 90, recent: [], auto: false };
// NPC-to-NPC relationships, distinct from each NPC's opinion of the player.
// Only witnessed, completed actions update this state; saved with the world.
const npcSocial = makeNpcSocial();
let production = productionHistory();
// Each NPC knows claims individually. Lore still describes village milestones.
const npcKnowledge = makeNpcKnowledge();
// Stable *person* identity, not a reusable character archetype: a later newcomer
// called 阿罟 must not inherit the previous 阿罟's friendships or beliefs.
const npcIdentity = (st) => st?.npc ? (st.npc.identity ??= `${st.npc.key}_${Math.round((st.npc.born ?? 0) * 1000)}`) : "";
const personId = (key) => { const st = npcs().find((q) => q.npc.key === key); return st ? npcIdentity(st) : key; };
// Who you can direct besides yourself: anyone who trusts you enough (熟识 3), and your dog from the start.
// Each has a mode — auto (lives their own day), work (you pick the job, they do it on their own), manual (you drag them like yourself).
// Know-how fades: each day you don't use a recipe, it slips a little (gone in about a week); using it brings it back.
me.known = { axe: { mem: 0.7, day: 1 }, bed: { mem: 1, day: 1 } };
me.askedDay = {};
const FORGET_PER_DAY = 0.15, LEARNED_MEM = 0.8, FIGURE_CHANCE = 0.6;
// Buildings: lay a foundation, then step by step — footings, walls, roof (building.js) — each step its own materials
// and work. Only someone who knows how can lead the work; the rest fetch and carry, and pick it up by lending a hand.
const BUILDS = {
  bighouse: { tier: "l", who: ["san"] },
  barn: { tier: "m", who: ["san"] },
  farm: { tier: "s", who: ["san"], grass: true },
  hut: { tier: "s", who: ["san", "li"] },
  granaryPit: { tier: "s", who: [], inv: "granary-pit" },
  calendarStick: { tier: "s", who: [], inv: "calendar-stick" },
  chest: { tier: "s", who: [], inv: "chest", yard: true },
  compost: { tier: "s", who: [], inv: "compost" },
  cellar: { tier: "s", who: [], inv: "cellar" },
};
for (const [k, b] of Object.entries(BUILDS)) Object.assign(b, { needs: totalNeeds(BUILD_STAGES[k]), work: totalWork(BUILD_STAGES[k]) });
const buildNeeds = (kind) => Object.entries(BUILDS[kind].needs).flatMap(([k, n]) => Array(n).fill(k));
const CRAFTS = [...new Map(RECIPES.filter((r) => r.id).map((r) => [r.id, r])).values(),
  ...Object.entries(BUILDS).map(([id, b]) => ({ id, who: b.who, inv: b.inv, build: true, needs: ["plot", ...buildNeeds(id)], make: [id] }))];   // one entry per know-how
const craftName = (id) => DEFS[CRAFTS.find((r) => r.id === id).make[0]].name;
const granaryCap = (g) => 20 + 5 * (g.jars ?? 0) + 10 * boards.world.filter((s) => s.cards[0].key === "granaryPit").length;
/** Carry: 4 things in your arms, 10 with a basket on your back (tools don't count). */
const loose = (st) => st.cards.filter((c, j) => j > 0 && DEFS[c.key].type !== "tool");
const capOf = (st) => (st.cards.some((c) => c.key === "basket") ? 10 : 4);
const party = { open: false };
const DEPOT = { granary: "grain", stove: "fish" };                   // what each store takes in
const weather = { now: "晴", strength: 0, events: [], hold: 0 };          // events: weather set for a time of day [{ at, kind }]
const discs = [];                        // explored circles
const eco = [];                          // things that grow: young trees, berry bushes, reeds
const cardsLayer = $("cards"), worldEl = $("world"), roomWorld = $("roomWorld"), table = $("table");
const layerOf = (b) => (b === "world" ? cardsLayer : roomWorld);

function newCard(key, stock, size, id = ++uid) {
  const d = DEFS[key];
  const tier = size ?? SIZE[key] ?? "s";
  const [w, h] = TIERS[tier];
  const el = document.createElement("div");
  el.className = `card t-${d.type} size-${tier}`;
  el.style.width = `${w}px`; el.style.height = `${h}px`;
  const hasStock = stock !== undefined || d.stock !== undefined;
  el.innerHTML = `<div class="card-head"><span>${d.name}</span>${hasStock ? `<em class="stock"></em>` : ""}</div><div class="card-art">${iconFor(d.icon)}</div><div class="intent"></div>`;
  const card = { id, key, el, stock: stock ?? d.stock, w, h, uses: d.uses };
  if (KEEPS[key]) card.made = day();                    // food remembers when it was got: it goes off
  el.dataset.card = card.id;
  refreshStock(card);
  return card;
}
function newStack(cards, x, y, b = board, id = ++uid) {
  const st = { id, x, y, cards, job: null, walk: null, board: b, w: Math.max(...cards.map((c) => c.w)), h: Math.max(...cards.map((c) => c.h)) };
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
  const field = c.key === "field" || c.key === "field2";
  if (field) {                                                   // a field shows what's growing, and how good the ground is
    if (!c.el.querySelector(".stock")) c.el.querySelector(".card-head").insertAdjacentHTML("beforeend", `<em class="stock"></em>`);
    const soil = c.soil ?? 3, dots = c.el.querySelector(".soil") ?? c.el.appendChild(Object.assign(document.createElement("i"), { className: "soil" }));
    dots.textContent = "●".repeat(soil) + "○".repeat(4 - soil); dots.title = `地力 ${soil}/4`;
  }
  const em = c.el.querySelector(".stock");
  if (!em) return;
  em.textContent = c.key === "granary" ? `${c.stock}/${granaryCap(c)}` : c.sown === false ? (c.fallow ? "歇" : "空") : field ? `${c.crop === "bean" ? "豆" : "粟"} ${c.stock ?? 0}` : c.stock ?? "";
  c.el.classList.toggle("empty", DEFS[c.key].type === "source" && c.key !== "field" && c.key !== "field2" && c.stock <= 0);
}
const bundleable = (card) => (["material", "food"].includes(DEFS[card.key].type) && card.charges === undefined) || card.key === "bed";
function cardGroups(st) {
  const cards = st.cards, cache = st.groups;
  if (cache?.cards === cards && cache.length === cards.length && cache.last === cards.at(-1)) return cache.value;
  const value = bundleLayout(cards, bundleable);
  for (const group of value) {
    group.card.el.classList.remove("bundled");
    const head = group.card.el.querySelector(".card-head");
    const count = group.end - group.start;
    if (count > 1) head.dataset.count = count; else delete head.dataset.count;
    for (let i = group.start + 1; i < group.end; i++) cards[i].el.classList.add("bundled");
  }
  st.groups = { cards, length: cards.length, last: cards.at(-1), value };
  return value;
}
/** How far apart a stack's groups sit. The yard's pile squeezes its column so it never runs out past the yard wall. */
function peekOf(st) {
  if (!st.store || st.board !== "world" || !MAP.house) return PEEK;
  const n = cardGroups(st).length, room = MAP.house.y + MAP.house.h - 10 - st.y - st.h;
  return n > 1 ? Math.max(12, Math.min(PEEK, room / (n - 1))) : PEEK;
}
const center = (st) => ({ x: st.x + st.w / 2, y: st.y + Math.max(0, cardGroups(st).length - 1) * peekOf(st) + st.h / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = (a) => a[Math.floor(randomWorld() * a.length)];
const pickLine = (a) => a[Math.floor(randomVoice() * a.length)];
const season = () => SEASONS[Math.floor((day() - 1) / DAYS_PER_SEASON) % 4];
const day = () => dayAt(clock.min);
// ---------------------------------------------------------------------------
// Weather you can see: rain and snow on one screen-sized canvas. They come on and die away gradually,
// showers vary in strength through the day, and the sky darkens under them.
// ---------------------------------------------------------------------------
const sky = { kind: "", next: "", level: 0, target: 0, cv: null, ctx: null, w: 0, h: 0, t: 0, flakes: [], drops: [], splashes: [], sprite: null, flash: 0, nextFlash: 0 };
const SNOW_LAYERS = [
  { n: 84, r: 0.9, vy: 22, sway: 6, alpha: .55, rate: .9 },
  { n: 54, r: 1.7, vy: 40, sway: 12, alpha: .72, rate: .62 },
  { n: 22, r: 3.3, vy: 74, sway: 22, alpha: .45, rate: .4 },
];
// Rain at three depths: far drops are short, thin, faint and slow; near ones long, bright, fast, and they splash.
const RAIN_LAYERS = [
  { n: 150, len: 9, vy: 620, lw: 0.9, alpha: .26 },
  { n: 110, len: 16, vy: 900, lw: 1.2, alpha: .38 },
  { n: 46, len: 26, vy: 1250, lw: 1.7, alpha: .5, splash: true },
];
function snowFlake() {
  const s = document.createElement("canvas"); s.width = s.height = 32;
  const g = s.getContext("2d"), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.35, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return s;
}
function skySetup() {
  sky.cv = $("snowfall"); sky.ctx = sky.cv.getContext("2d"); sky.sprite ??= snowFlake();
  const w = innerWidth, h = innerHeight, dpr = Math.min(1.5, window.devicePixelRatio || 1);
  sky.cv.width = Math.round(w * dpr); sky.cv.height = Math.round(h * dpr);
  sky.cv.style.width = `${w}px`; sky.cv.style.height = `${h}px`;
  sky.w = w; sky.h = h; sky.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const area = Math.max(.55, (w * h) / (1280 * 800));   // fewer on a small window
  sky.flakes = [];
  for (const L of SNOW_LAYERS) for (let k = 0; k < Math.round(L.n * area); k++)
    sky.flakes.push({ ...L, x: Math.random() * w, y: Math.random() * h, ph: Math.random() * 6.28, v: L.vy * (.8 + Math.random() * .4), r: L.r * (.7 + Math.random() * .6), k: Math.random() });
  sky.drops = RAIN_LAYERS.map((L) => Array.from({ length: Math.round(L.n * area) }, () => newDrop(L, true)));
  sky.splashes = [];
}
/** A raindrop somewhere above (or, at the start, anywhere on) the screen; near drops know where they will land. */
function newDrop(L, anywhere = false) {
  const y = anywhere ? Math.random() * sky.h : -L.len - Math.random() * sky.h * 0.4;
  return { L, x: Math.random() * (sky.w + 450) - 400, y, v: L.vy * (.85 + Math.random() * .3), k: Math.random(), land: L.splash ? sky.h * (.25 + Math.random() * .8) : sky.h + 40 };
}
/** What the weather is now: rain or snow fade in (or the other fades out first), and how hard it comes down. */
function skySet(kind, strength = weather.strength) {
  if (!sky.cv) skySetup();
  if (kind && sky.kind && sky.kind !== kind && sky.level > 0.02) { sky.next = kind; sky.nextTarget = strength; sky.target = 0; return; }
  if (kind) sky.kind = kind;
  sky.next = ""; sky.target = strength;
  if (kind) $("snowfall").hidden = false;
}
/** Through the day a shower comes and goes: now and then it gets heavier or eases off. */
function skyDrift(minutes) {
  if (!weather.strength || worldRandom.next("weather-strength") > minutes / 150) return;
  weather.strength = Math.max(0.25, Math.min(1, weather.strength + (worldRandom.next("weather-strength") - 0.5) * 0.6));
  if (sky.next) sky.nextTarget = weather.strength;
  else sky.target = weather.strength;
}
function skyDraw(dt) {
  const ctx = sky.ctx; if (!ctx) return;
  sky.t += dt;
  const under = board !== "world" || inMine(youAt());                 // indoors or under the mountain: no weather
  sky.level += ((under ? 0 : sky.target) - sky.level) * Math.min(1, dt * (under ? 4 : 0.5));
  if (sky.next && sky.level < 0.02) { sky.kind = sky.next; sky.target = sky.nextTarget; sky.next = ""; }
  const tint = $("weatherLayer");
  ctx.clearRect(0, 0, sky.w, sky.h);
  if (sky.level < 0.004 && sky.target === 0) { $("snowfall").hidden = true; tint.style.opacity = 0; if (!sky.next) sky.kind = ""; return; }
  const dim = 1 - darkness() * 0.55, lv = sky.level;
  if (sky.kind === "雨") {
    tint.style.background = "rgb(28,40,58)"; tint.style.opacity = 0.2 * lv;   // an overcast sky
    const gust = 0.82 + 0.18 * Math.sin(sky.t * 0.55) * Math.sin(sky.t * 0.21 + 1);
    const wind = 140 + 90 * Math.sin(sky.t * 0.18);                    // px/s sideways: the rain leans with it
    ctx.lineCap = "round";
    for (const list of sky.drops) {
      const L = list[0]?.L; if (!L) continue;
      const vx = wind * (0.55 + 0.45 * (L.vy / 1250));
      ctx.strokeStyle = `rgba(206,222,240,${L.alpha * dim * (0.6 + 0.4 * lv)})`; ctx.lineWidth = L.lw;
      ctx.beginPath();
      for (const d of list) {
        d.y += d.v * dt; d.x += vx * dt;
        if (d.y > d.land || d.x > sky.w + 120) {
          if (L.splash && d.k < lv * gust && sky.splashes.length < 140) sky.splashes.push({ x: d.x, y: d.land, t: 0, r: 4 + Math.random() * 5 });
          Object.assign(d, newDrop(L)); continue;
        }
        if (d.k > lv * gust) continue;                                  // a lighter shower: only some of the drops fall
        const s = L.len / Math.hypot(vx, d.v);
        ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - vx * s, d.y - d.v * s);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(220,232,246,${0.5 * dim})`; ctx.lineWidth = 1;   // splashes: a ring that opens and fades
    for (let i = sky.splashes.length - 1; i >= 0; i--) {
      const p = sky.splashes[i]; p.t += dt;
      if (p.t > 0.32) { sky.splashes.splice(i, 1); continue; }
      const k = p.t / 0.32;
      ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (0.4 + k * 1.6), p.r * (0.15 + k * 0.5), 0, 0, 7); ctx.stroke();
      if (k < 0.5) { ctx.beginPath(); ctx.moveTo(p.x - 2, p.y - 2); ctx.lineTo(p.x - 4, p.y - 6 * (1 - k)); ctx.moveTo(p.x + 2, p.y - 2); ctx.lineTo(p.x + 4, p.y - 6 * (1 - k)); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // Summer storms: now and then a far flash lights the clouds.
    if (season() === "夏" && lv > 0.75 && sky.t > sky.nextFlash) { sky.flash = 1; sky.nextFlash = sky.t + 25 + Math.random() * 50; }
    if (sky.flash > 0) { ctx.fillStyle = `rgba(235,240,255,${sky.flash * 0.22})`; ctx.fillRect(0, 0, sky.w, sky.h); sky.flash = Math.max(0, sky.flash - dt * (sky.flash > 0.6 ? 6 : 2.2)); }
  } else if (sky.kind === "雪") {
    tint.style.background = "rgb(226,232,238)"; tint.style.opacity = 0.1 * lv;   // a white, muffled sky
    const wind = 13 + Math.sin(sky.t * 0.16) * 9;                     // a slow gust, not a gale
    for (const f of sky.flakes) {
      f.y += f.v * dt;
      f.x += (wind + Math.sin(sky.t * f.rate + f.ph) * f.sway) * dt;
      if (f.y > sky.h + 8) { f.y = -8; f.x = Math.random() * sky.w; }
      if (f.x > sky.w + 10) f.x -= sky.w + 20; else if (f.x < -10) f.x += sky.w + 20;
      if (f.k > lv) continue;
      const s = f.r * 7;
      ctx.globalAlpha = f.alpha * dim;
      ctx.drawImage(sky.sprite, f.x - s / 2, f.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

function rollWeather() {
  if (clock.min < weather.hold) return;                                // a spell of weather already set (the first winter night's snow)
  const s = season(), r = worldRandom.next("weather");
  setWeather(s === "冬" ? (r < 0.45 ? "雪" : "晴") : r < (s === "春" ? 0.34 : s === "夏" ? 0.18 : 0.27) ? "雨" : "晴");
}
function setWeather(kind, strength) {
  weather.now = kind;
  const base = kind === "雨" ? 0.45 : kind === "雪" ? 0.55 : 0;
  weather.strength = strength ?? (base ? base + worldRandom.next("weather-strength") * (1 - base) : 0);
  $("weather").textContent = kind;
  table.dataset.weather = kind;
  skySet(kind === "晴" ? "" : kind);
  paintNaturalSources();
}
// ---------------------------------------------------------------------------
// The look of the land turns slowly. When a season starts, its look is laid over the old one, transparent, and comes
// through as the days pass: leaves turn over about two days, a thaw takes a day and a half (faster in rain), and winter
// comes with the snow — the first night of winter it snows till morning, and the land whitens as it falls.
// ---------------------------------------------------------------------------
const look = { from: null, to: null, p: 1, top: null };
function terrainOpts(s) {
  const R = { home: 520, stove: 260, hemp: 300 };
  const clearings = [...Object.values(MAP.sites).map((q) => ({ x: q.x, y: q.y, r: R[q.key] ?? 220 })), ...(MAP.extraFields ?? []).map((f) => ({ x: f.x, y: f.y, r: Math.max(f.w, f.h) * 0.6 }))];
  // Only things that stay put keep the ground clear: people and animals move, and two looks painted at different
  // times must put every tree in the same place or the turning season shows double.
  const fixed = boards.world.filter((q) => !q.npc && !q.critter && !q.pet && q.cards[0].key !== "you" && !CARRY.has(DEFS[q.cards[0].key].type));
  return { DECO, keepClear: [...fixed.map(center), ...clearings], season: s, eco: eco.filter((e) => e.kind !== "berry"), house: MAP.house };
}
const shownSeason = () => (look.p >= 0.5 ? look.to : look.from);
/** Repaint the ground as it looks now (both looks while one season is turning into the next), e.g. after a new field. */
function paintSeason() {
  look.to ??= season();
  paintTerrain($("ground"), MAP, terrainOpts(look.p < 1 ? look.from : look.to));
  if (look.p < 1 && look.top) paintTerrain(look.top, MAP, terrainOpts(look.to));
  if (MAP.tunnel?.el) paintCover(MAP.tunnel.el, MAP, MAP.tunnel, shownSeason());
  lookChanged(true);
  groundChanged();
  setTimeout(() => prewarmBase(MAP, SEASONS[(SEASONS.indexOf(look.to) + 1) % 4]), 5000);   // next season's ground, a slice at a time
}
/** A new season begins: paint its look on a transparent layer over the ground; turnTick brings it through. */
function turnSeason(to) {
  if (look.top) finishTurn();
  look.from = look.to ?? season(); look.to = to; look.p = 0;
  const c = document.createElement("canvas"); c.className = "ground"; c.style.opacity = "0";
  $("ground").after(c); look.top = c;
  paintTerrain(c, MAP, terrainOpts(to));
  setTimeout(() => prewarmBase(MAP, SEASONS[(SEASONS.indexOf(to) + 1) % 4]), 5000);
  lookChanged();
}
function turnTick(minutes) {
  if (look.p >= 1 || !look.top) return;
  const rate = look.to === "冬" ? (weather.now === "雪" ? 1 / 700 : 1 / 8000)       // snow lies as it falls: a night of it turns the land white
    : look.from === "冬" ? (weather.now === "雨" ? 2 : 1) / (1.5 * 1440)            // the thaw
    : 1 / (2 * 1440);                                                              // leaves turning, grass greening
  look.p = Math.min(1, look.p + minutes * rate);
  look.top.style.opacity = look.p.toFixed(3);
  lookChanged();
  if (look.p >= 1) finishTurn();
}
/** The new look has come all the way through: it becomes the ground. */
function finishTurn() {
  const old = $("ground"); old.removeAttribute("id"); old.remove();
  look.top.id = "ground"; look.top.style.opacity = ""; look.top = null; look.p = 1; look.from = null;
  if (MAP.tunnel?.el) paintCover(MAP.tunnel.el, MAP, MAP.tunnel, look.to);
  lookChanged();
}
/** What follows the look: snow on the roof, and the lake freezing (once winter has mostly set in) or opening (halfway through the thaw). */
function lookChanged(force = false) {
  table.dataset.season = shownSeason();
  const frozen = look.p >= 1 ? look.to === "冬" : look.to === "冬" ? look.p >= 0.75 : look.from === "冬" && look.p < 0.5;
  if (frozen === MAP.frozen && !force) return;
  if (frozen !== MAP.frozen) pathCache.clear();
  MAP.frozen = frozen;                                                  // the lake bears weight once the cold sets in
  tide.painted = null; updateTide();
}
/** A field's crop changed (sown, weeded, cut, or rotted): redraw the crop layers — cheap, the ground stays as it is. */
function groundChanged() {
  const winter = season() === "冬";
  for (const f of MAP.extraFields ?? []) {
    if (!f.card) continue;
    if (!f.cv) { f.cv = document.createElement("canvas"); f.cv.className = "crop"; Object.assign(f.cv.style, { left: `${f.x - f.w / 2}px`, top: `${f.y - f.h / 2}px`, width: `${f.w}px`, height: `${f.h}px` }); cardsLayer.prepend(f.cv); }
    f.cv.hidden = winter || f.card.sown === false;
    if (!f.cv.hidden) paintCrop(f.cv, f, season(), f.card.stock ?? 0);
  }
}
/** Two tides a day: the lake swells over its beach and drains back, showing wet sand. */
const tide = { level: 0, painted: null };
const tideNow = () => Math.sin((clock.min / (12.4 * 60)) * Math.PI * 2);
function updateTide() {
  const cv = $("tide");
  if (MAP.frozen || !MAP.water?.includes(1)) {
    tide.level = 0; tide.painted = null; cv.hidden = true;
    return;
  }
  cv.hidden = false;
  tide.level = tideNow() + (nature.flood ? 1.4 : 0);
  if (tide.painted !== null && Math.abs(tide.level - tide.painted) < 0.05) return;
  tide.painted = tide.level;
  paintTide(cv, MAP, tide.painted, season());
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
  const c = newCard(key, stock); if (key === "field" || key === "field2") { c.sown = false; c.stock = 0; refreshStock(c); }
  const q = settle(p.x, p.y, DEFS[key].type === "boat", c.w, c.h);
  const st = newStack([c], q.x - c.w / 2, q.y - c.h / 2, "world");
  st.home = { x: q.x, y: q.y };          // where it grew: a picked-clean node comes back here
  return st;
}
function naturalConditions(st) {
  const home = st.home ?? center(st), forest = MAP.tiles.forest;
  return { season: season(), weather: weather.now, drought: nature.drought, flood: nature.flood,
    day: day(), winterDay: (day() - 1) % DAYS_PER_SEASON + 1, readyDay: st.cards[0].regrowDay,
    frostProne: Boolean(forest && home.x < forest.x + forest.w * 0.42) };
}
function paintNaturalNode(st, conditions = naturalConditions(st)) {
  const card = st.cards[0], key = card.key;
  const stage = sourceStage(key, card.stock, conditions);
  card.el.dataset.sourceStage = stage;
  const icon = key === "pineGrove" && stage === "snowgreen" ? "pineSnow" :
    key === "chestnut" && conditions.season === "冬" ? "winterTree" :
    key === "chestnut" && conditions.season === "秋" ? "autumnChestnut" : DEFS[key].icon;
  if (card.el.dataset.sourceIcon !== icon) {
    card.el.dataset.sourceIcon = icon;
    card.el.querySelector(".card-art").innerHTML = iconFor(icon);
  }
  const plant = sourcePlant(key);
  if (!plant) return;
  const at = st.home ?? center(st);
  const stamp = `${card.stock}:${stage}:${conditions.season}:${conditions.drought}:${at.x}:${at.y}`;
  if (!st.sourcePatch) {
    const canvas = document.createElement("canvas");
    canvas.className = "resource-patch";
    canvas.width = 150; canvas.height = 120;
    canvas.dataset.resource = key;
    cardsLayer.prepend(canvas);
    st.sourcePatch = { canvas, stamp: "" };
  }
  const patch = st.sourcePatch;
  if (patch.stamp === stamp) return;
  patch.stamp = stamp;
  patch.canvas.dataset.stage = stage;
  patch.canvas.style.left = `${at.x - 150}px`;
  patch.canvas.style.top = `${at.y - 120}px`;
  paintResourcePatch(patch.canvas, plant, card.stock, stage, conditions);
}
function paintNaturalSources() {
  for (const st of boards.world) if (naturalSource(st.cards[0].key)) paintNaturalNode(st);
}
/** Hide a depleted source without losing its location, cooldown or anything left on top. */
function deplete(card, announce = true) {
  if (!naturalSource(card?.key)) return;
  const st = stackOf(card);
  if (!st || st.board !== "world") return;
  const conditions = naturalConditions(st);
  paintNaturalNode(st, conditions);
  if (card.stock > 0) return;
  const first = card.regrowDay === undefined;
  if (first) card.regrowDay = day() + (sourceCapacity(card.key, conditions) ? sourceWait(card.key) : 0);
  if (!first && st.cards.length === 1) return;
  const at = center(st), left = st.cards.splice(1);
  for (const n of allStacks()) {
    if (n.parkedAt === st) n.parkedAt = null;
    if (n.walk?.target === st) n.walk = null;
    if (n.travel?.target === st) n.travel = null;
    if (n.repeat?.target === st) n.repeat = null;
    if (n.goalStack === st) {
      if (n.npc) finishFoodStep(n, n.task, false);
      n.goalStack = null; n.job = null; n.bar?.remove(); n.bar = null; n.goal = ""; n.task = "";
    }
  }
  const you = youStack(); if (you?.job?.target === st) cancelJob(you);
  if (left.length) newStack(left, at.x - left[0].w / 2, at.y + 20, "world");
  if (announce && first && board === "world" && known(at)) float(`${DEFS[card.key].name}采光了`, at, "world");
}
function settleNaturalSources(pulse = false) {
  for (const st of [...boards.world]) {
    const card = st.cards[0];
    if (!naturalSource(card.key)) continue;
    if (!Number.isFinite(card.nextStockAt)) card.nextStockAt = nextSourcePulse(clock.min, card.id);
    if (pulse && clock.min < card.nextStockAt) continue;
    const conditions = naturalConditions(st), before = card.stock;
    if (pulse) {
      card.nextStockAt = nextSourcePulse(clock.min, card.id);
      if (card.key === "nest") conditions.nesting = livingDucks().some((duck) => duck.critter.sex === "female" && duckAge(duck) >= 3);
      card.stock = sourceNextStock(card.key, before, conditions);
    } else card.stock = Math.min(before, sourceCapacity(card.key, conditions));
    if (card.stock > 0) delete card.regrowDay;
    if (card.stock !== before) refreshStock(card);
    deplete(card, false);
    if (pulse && !before && card.stock > 0 && board === "world" && known(center(st))) {
      const animation = [{ opacity: 0 }, { opacity: 1 }];
      card.el.animate(animation, { duration: 800, easing: "ease-out" });
      st.sourcePatch?.canvas.animate(animation, { duration: 1100, easing: "ease-out" });
    }
  }
}
function ensureDeepPines() {
  if (boards.world.some((st) => st.cards[0].key === "pineGrove")) return;
  const tile = MAP.tiles.deep;
  for (const [fx, fy] of [[0.32, 0.36], [0.62, 0.72]]) placeCard("pineGrove", { x: tile.x + tile.w * fx, y: tile.y + tile.h * fy });
}
function restoreDepletedSites(pending) {
  for (const { key, x, y, due } of pending) {
    if (!naturalSource(key) || ![x, y, due].every(Number.isFinite)) continue;
    if (boards.world.some((st) => st.cards[0].key === key && dist(st.home ?? center(st), { x, y }) < 1)) continue;
    const st = placeCard(key, { x, y }, 0);
    st.cards[0].regrowDay = Math.ceil((due - 360) / 1440) + 1;
  }
}
function build() {
  for (const [site, list] of Object.entries(LAYOUT)) for (const [k, dx, dy, stock] of list) placeCard(k, at([site, dx, dy]), stock);
  const T = MAP.tiles, inTile = (t, fx, fy) => ({ x: t.x + t.w * fx, y: t.y + t.h * fy });
  if (T.farm) for (const [k, fx, fy] of FARM_FIELDS) {                 // the farm tile: fields already broken, furrows on the ground
    const p = inTile(T.farm, fx, fy);
    const st = placeCard(k, p);
    (MAP.extraFields ??= []).push({ patch: "field", x: p.x, y: p.y, ...FIELD_SIZE, card: st.cards[0] });   // furrows always; the crop once it is sown
  }
  if (T.forest) for (const [k, fx, fy] of WOOD_LAYOUT) placeCard(k, inTile(T.forest, fx, fy));
  if (T.lake) for (const [k, fx, fy] of LAKE_LAYOUT) placeCard(k, inTile(T.lake, fx, fy));
  if (T.plateau) for (const [k, fx, fy] of PLATEAU_LAYOUT) placeCard(k, inTile(T.plateau, fx, fy));
  if (MAP.tunnel) for (const [k, x, y] of MAP.tunnel.faces) placeCard(k, { x, y });
  for (const [k, n] of Object.entries(PEOPLE)) {
    const order = Object.keys(PEOPLE).indexOf(k);
    const st = placeCard(k, at(n.at));
    st.npc = { key: k, order, home: n.home, job: n.job, hunger: 1 + randomWorld() * 3, wait: 0, inside: false, kit: [], born: bornFor(PEOPLE_DATA[k]?.age ?? 25),
      wake: 5.6 + order * 0.2, sleep: 20.2 + order * 0.25, outAt: 0, nextChat: clock.min + 120 };
  }
  const dog = placeCard("dog", at(START.dog));
  dog.pet = { home: center(dog) };
  dog.ctl = { mode: "auto", job: "carry" };
  for (const [kind, sp] of Object.entries(SPECIES)) for (let i = 0; i < sp.n; i++) spawnAnimal(kind);
  placeCard("you", at(START.you));
  me.name = "启禾"; me.gen = 1; me.born = bornFor(16); me.family = { spouse: null, kids: [] };
  setupMainHouse();
  setupMine();
  setupBlackReef();
  const fire = find("fire")?.cards[0]; if (fire) fire.fuel = 2;
  const stoveCard = find("stove")?.cards[0]; if (stoveCard) stoveCard.fuel = 3;
  ensureDeepPines();
  rollWeather();
  const berry = find("berries")?.cards[0];
  if (berry && season() !== "冬") { berry.stock = 4; refreshStock(berry); }
  settleNaturalSources();
  explore(center(youStack()));
  paintSeason();
  festivalMorning();                                     // a festival on the very first day is announced too
}
/** The main house is a walled yard on the map: outside you see the roof; through the south gate you see the layout.
 *  furnish: put the bed, the hearth and the first grain in (a restored game brings its own). */
function setupMainHouse(furnish = true) {
  const house = find("taoHouse");
  if (!house) return;
  const s = MAP.sites.home, yd = s.yard;                // the yard's size lives with the site (valley.js), so places keep off its walls
  const c = { x: s.x + yd.x, y: s.y + yd.y, w: yd.w, h: yd.h, gate: { x: s.x - 60, w: 120 } };
  c.roof = { x: c.x + 8, y: c.y + 8, w: c.w - 16, h: c.h - 16 };
  house.compound = c;
  MAP.house = c;
  const t = 14;
  MAP.blocks = [
    { x: c.x, y: c.y, w: c.w, h: t },
    { x: c.x, y: c.y, w: t, h: c.h },
    { x: c.x + c.w - t, y: c.y, w: t, h: c.h },
    { x: c.x, y: c.y + c.h - t, w: c.gate.x - c.x, h: t },
    { x: c.gate.x + c.gate.w, y: c.y + c.h - t, w: c.x + c.w - (c.gate.x + c.gate.w), h: t },
  ];
  if (furnish) {
    for (const [key, count] of [["bed", 2], ["fire", 1], ["grain", 2]]) {
      const { x, y } = yardFurnishing(key, c);
      newStack(Array.from({ length: count }, () => newCard(key)), x, y, "world");
    }
  }
  house.cards[0].el.classList.add("no-card");        // the yard is the house; no label card standing in it
  const roof = document.createElement("div");
  roof.className = "roof";
  roof.style.left = `${c.roof.x}px`; roof.style.top = `${c.roof.y}px`;
  roof.style.width = `${c.roof.w}px`; roof.style.height = `${c.roof.h}px`;
  cardsLayer.append(roof);
  c.roofEl = roof;
}
/** The tunnel into the mountain: from outside you see the mountainside over it; walk in and it lifts. */
function setupMine() {
  const t = MAP.tunnel; if (!t) return;
  const cv = document.createElement("canvas");
  cv.className = "cover";
  cv.style.left = `${t.x}px`; cv.style.top = `${t.y}px`; cv.style.width = `${t.w}px`; cv.style.height = `${t.h}px`;
  cardsLayer.append(cv);
  t.el = cv;
}
const inMine = (p) => Boolean(MAP.tunnel && p && MAP.cave[MAP.idx(p.x, p.y)] === 1 && p.x > MAP.tunnel.x + 30);
const SPECIES = {
  rabbit: { n: 2, roam: 600, fear: 300, speed: 1.8, home: () => quietSpot() },
  deer: { n: 3, fear: 380, speed: 2.2, home: () => woodSpot(0.8) },
  tiger: { n: 1, roam: 520, fear: 0, speed: 1.1, predator: true, home: () => deepSpot() },
  boar: { n: 1, fear: 0, speed: 1.4, aggro: true, home: () => woodSpot(0.8) },
  duck: { n: 3, roam: 420, fear: 220, speed: 0.6, water: true, home: () => lakeSpot() },
  goat: { n: 2, fear: 420, speed: 2.2, home: () => plateauSpot() },
};
const WILD_HP = { rabbit: 1, duck: 2, deer: 3, goat: 3, boar: 5, tiger: 8, coastRaider: 5 };
const LOOT = { rabbit: ["meat", "hide"], duck: ["meat"], deer: ["meat", "meat", "hide"], boar: ["meat", "meat", "meat", "hide"], goat: ["meat", "meat", "hide"], tiger: ["meat", "pelt"] };
const inJungle = (p) => MAP.jungle[MAP.idx(p.x, p.y)] === 1;
const inLake = (p) => p.x > 0 && p.y > 0 && p.x < MAP.W && p.y < MAP.H && MAP.water[MAP.idx(p.x, p.y)] === 1;
function nearSite(keys, r) {
  const s = MAP.sites[pick(keys)];
  for (let k = 0; k < 40; k++) { const a = randomWorld() * 6.28, p = { x: s.x + Math.cos(a) * r * (0.7 + randomWorld() * 0.6), y: s.y + Math.sin(a) * r * (0.7 + randomWorld() * 0.6) }; if (walkable(MAP, p.x, p.y)) return p; }
  return { x: s.x, y: s.y + 200 };
}
/** A spot in the thick of the woods: deer and boar live where the canopy closes over, several trees in
 *  from the edge, near the woods they belong to. No fence — it is the ground that decides how far in. */
function woodSpot(min = 0.8) {
  let best = null, bs = -Infinity;
  for (let k = 0; k < 700; k++) {
    const i = Math.floor(randomWorld() * MAP.cls.length);
    if (MAP.cls[i] !== G.FOREST || MAP.road[i] || MAP.jungle[i]) continue;
    const p = { x: MAP.X(i), y: MAP.Y(i) }, thick = woodDepth(MAP, p.x, p.y);
    if (MAP.zoneAt(p.x, p.y) !== "forest") continue;                    // the forest, not the deep wood behind it (that is the tiger's)
    if (thick < min) continue;
    // no jungle site any more: deep cover alone decides where they live
    if (boards.world.some((st) => dist(p, center(st)) < 260)) continue;
    const near = dist(p, MAP.sites.home);
    const s = thick * 3 - near / 2200 + randomWorld() * 0.4;
    if (s > bs) { bs = s; best = p; }
  }
  const f = MAP.tiles.forest;
  return best ?? { x: f.x + f.w / 2, y: f.y + f.h / 2 };
}
/** The tiger's lair: far into the deep wood, where the canopy never opens. */
function deepSpot() {
  let best = null, bs = -Infinity;
  for (let k = 0; k < 900; k++) {
    const i = Math.floor(randomWorld() * MAP.cls.length);
    if (!MAP.jungle[i] || MAP.cls[i] !== G.FOREST) continue;
    const p = { x: MAP.X(i), y: MAP.Y(i) }, s = woodDepth(MAP, p.x, p.y) * 2 + dist(p, MAP.sites.home) / 4000 + randomWorld() * 0.3;
    if (s > bs) { bs = s; best = p; }
  }
  const d = MAP.tiles.deep;
  return best ?? { x: d.x + d.w * 0.4, y: d.y + d.h * 0.4 };
}
/** Wild goats keep to the plateau's open ground. */
function plateauSpot() {
  const t = MAP.tiles.plateau;
  for (let k = 0; k < 200; k++) { const p = { x: t.x + t.w * (0.2 + randomWorld() * 0.6), y: t.y + t.h * (0.2 + randomWorld() * 0.55) }; if (walkable(MAP, p.x, p.y) && MAP.zoneAt(p.x, p.y) === "plateau") return p; }
  return { x: t.x + t.w / 2, y: t.y + t.h / 2 };
}
/** Ducks live on the lake tile: pick a water cell near its middle. */
function lakeSpot() {
  const lt = MAP.tiles.lake; let best = null, bd = 1e9;
  for (let i = 0; i < MAP.cls.length; i += 2) if (MAP.water[i] === 1) {
    const p = { x: MAP.X(i), y: MAP.Y(i) }, d = Math.abs(p.y - (lt.y + lt.h * 0.6)) + randomWorld() * 180;
    if (d < bd) { bd = d; best = p; }
  }
  return best ?? { x: lt.x + lt.w / 2, y: lt.y + lt.h * 0.63 };
}
function spawnAnimal(kind, near = null) {
  const sp = SPECIES[kind], home = near ?? sp.home(), c = newCard(kind);
  const free = (p) => !boards.world.some((st) => st.critter && dist(p, center(st)) < 170);
  let p = home;
  if (!free(p)) {
    for (let k = 0; k < 30; k++) {
      const a = k * 2.4, r = 170 + k * 12;
      const q = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r };
      if (free(q) && (sp.water && inLake(home) ? inLake(q) : walkable(MAP, q.x, q.y) && MAP.zoneAt(q.x, q.y) === MAP.zoneAt(home.x, home.y))) { p = q; break; }
    }
  }
  const st = newStack([c], p.x - c.w / 2, p.y - c.h / 2, "world");
  const sex = livingDucks().length % 2 ? "male" : "female";
  st.critter = { kind, ...sp, home: p };
  if (kind === "duck") {
    Object.assign(st.critter, { sex: near ? (randomWild() < 0.5 ? "female" : "male") : sex, bornDay: day() - (near ? 0 : 4) });
    labelDuck(st);
  }
  return st;
}

const livingDucks = () => boards.world.filter((st) => st.critter?.kind === "duck");
const duckAge = (st) => day() - st.critter.bornDay;
function labelDuck(st) {
  const card = st.cards[0], name = duckAge(st) < 3 ? "小野鸭" : DEFS.duck.name;
  if (card.name === name) return;
  card.name = name;
  card.el.querySelector(".card-head span").textContent = name;
}
const lakeLine = (a, b) => {
  const n = Math.max(1, Math.ceil(dist(a, b) / 25));
  for (let i = 1; i <= n; i++) if (!inLake({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n })) return false;
  return true;
};
let duckLandings;
function duckShore() {
  if (duckLandings) return duckLandings;
  duckLandings = [];
  const lake = MAP.lake;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, at = (r) => ({ x: lake.x + Math.cos(a) * r, y: lake.y + Math.sin(a) * r });
    for (let r = 50; r < 1250; r += 20) {
      if (inLake(at(r))) continue;
      const wet = at(r - 20), dry = at(r + 35);
      if (inLake(wet) && !inLake(dry) && walkable(MAP, dry.x, dry.y)) duckLandings.push({ wet, dry });
      break;
    }
  }
  return duckLandings;
}
/** Ducks (see animal-ways.js duckPlan): the leader picks what the flock is doing — dabbling slowly along the margins,
 *  crossing open water, walking up the bank to graze and preen, loafing, roosting — and the rest keep with it
 *  (followGroup). A fright sends them out onto open water. */
function duckTick(st, minutes, you) {
  const bird = st.critter, here = center(st), swimming = inLake(here);
  const player = you?.board === "world" ? center(you) : null;
  const scared = player && dist(player, here) < bird.fear;
  const waterOpen = !MAP.frozen && season() !== "冬";
  const lead = groupLeader("duck"), leading = !lead || lead === st;
  if (st.walk && !waterOpen && !swimming && st.walk.duckCross === "water") st.walk = null;
  if (scared && !st.walk?.evading) return duckFlee(st, player, waterOpen);
  if (st.walk && stepWalk(st, minutes, st.walk.pace ?? (swimming ? 0.6 : 0.45))) { st.walk = null; if (leading) duckArrive(st); }
  if (st.walk || clock.min < (bird.nextMove ?? 0)) return;
  if (!leading) {                                                   // following, but on the wrong side of the water's edge
    const wantsWater = waterOpen && inLake(center(lead));
    if (swimming !== wantsWater) duckCrossEdge(st, swimming);
    bird.nextMove = clock.min + 4;
    return;
  }
  // the leader: carry on with what the flock is doing, or take up something new
  const doing = bird.doing;
  if (!doing || clock.min >= doing.until || (!waterOpen && ["dabble", "cross", "roost"].includes(doing.act))) {
    let act = waterOpen ? duckPlan(hour(), randomWild) : "graze";
    if (doing?.act === "graze") act = "preen";                       // after grazing, a stand on the bank to preen
    else if (doing?.act === "preen" && waterOpen) act = "dabble";   // then back in
    bird.doing = { act, until: clock.min + spellLength(act === "graze" && !waterOpen ? "loaf" : act, randomWild), dir: doing?.dir ?? (randomWild() < 0.5 ? 1 : -1),
      ashore: act === "loaf" && randomWild() < 0.3 };                // some loaf on the bank, most out on the water
  }
  duckDo(st, bird.doing, swimming);
}
/** One step of what the flock is doing. */
function duckDo(st, doing, swimming) {
  const bird = st.critter, here = center(st), shore = duckShore();
  const wantsWater = ["dabble", "cross", "roost", "loaf"].includes(doing.act) && !(doing.act === "loaf" && doing.ashore);
  if (swimming !== wantsWater && !(doing.act === "preen" && !swimming)) { duckCrossEdge(st, swimming, doing.act === "graze"); return; }
  const walk = (p, pace, path = []) => { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, path, k: 0, pace }; };
  if (doing.act === "dabble") {                                     // slowly on along the margin, heads down; seldom still
    const i = nearestShore(here), out = (k) => offshore(shore[k].wet, 70);
    for (const dir of [doing.dir, -doing.dir]) {
      const k = alongShore(i, dir, shore.length), p = out(k);
      if (inLake(p) && lakeLine(here, p)) { doing.dir = dir; walk(p, 0.3); bird.nextMove = clock.min; return; }
    }
    doing.until = clock.min;                                        // a dead end of the bank: do something else
    return;
  }
  if (doing.act === "cross") {                                      // across open water to another stretch of shore
    const i = nearestShore(here), n = shore.length;
    for (let tries = 0; tries < 10; tries++) {
      const k = (i + Math.round(n / 3 + randomWild() * n / 3)) % n, p = offshore(shore[k].wet, 90);
      if (inLake(p) && lakeLine(here, p)) { walk(p, 0.75); doing.until = clock.min + 999; doing.crossing = true; return; }
    }
    doing.until = clock.min;
    return;
  }
  if (doing.act === "graze") {                                      // up on the bank, a few steps at a time, pecking between
    doing.patch ??= here;
    for (let k = 0; k < 8; k++) {
      const a = randomWild() * 6.28, p = { x: doing.patch.x + Math.cos(a) * (40 + randomWild() * 110), y: doing.patch.y + Math.sin(a) * (40 + randomWild() * 110) };
      if (!inLake(p) && walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked) { walk(p, 0.25); break; }
    }
    bird.nextMove = clock.min + 3 + randomWild() * 4;
    return;
  }
  // preen, loaf, roost: mostly still; on the water they drift a little
  if (swimming && randomWild() < 0.5) {
    const a = randomWild() * 6.28, p = { x: here.x + Math.cos(a) * 25, y: here.y + Math.sin(a) * 25 };
    if (inLake(p) && lakeLine(here, p) && roomy(st, p)) walk(p, 0.1);
  }
  bird.nextMove = clock.min + (doing.act === "roost" ? 20 : 8) + randomWild() * 8;
}
/** Arriving: a crossing ends in dabbling along the new stretch of shore. */
function duckArrive(st) {
  const d = st.critter.doing;
  if (d?.crossing) { d.crossing = false; d.act = "dabble"; d.until = clock.min + spellLength("dabble", randomWild); }
}
/** In or out of the water by the nearest landing. */
function duckCrossEdge(st, swimming, graze = false) {
  const here = center(st), set = (p, path, duckCross) => { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, path, k: 0, duckCross, pace: 0.5 }; };
  const near = duckShore().slice().sort((a, b) => dist(here, a.dry) - dist(here, b.dry)), k = st.id % 3;   // not all by the same landing
  for (const { wet, dry } of [...near.slice(k), ...near.slice(0, k)]) {
    if (swimming && lakeLine(here, wet)) { set(dry, [wet], "land"); if (graze && st.critter.doing) st.critter.doing.patch = dry; return; }
    if (!swimming) { const path = findPath(MAP, here, dry); if (path) { set(offshore(wet, 60), [...path, wet], "water"); return; } }   // walk to the bank, then in
  }
  st.critter.nextMove = clock.min + 30;
}
/** A fright: out onto open water, away from you — the rest go with it (followGroup reads the alarm). */
function duckFlee(st, from, waterOpen) {
  const here = center(st), bird = st.critter;
  bird.alarm = { at: clock.min, from };
  if (!inLake(here)) { if (waterOpen) { duckCrossEdge(st, false); if (st.walk) { st.walk.pace = 1.4; st.walk.evading = true; } } return; }
  const angle = Math.atan2(here.y - from.y, here.x - from.x);
  for (let i = 0; i < 12; i++) {
    const a = angle + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.4, p = { x: here.x + Math.cos(a) * 260, y: here.y + Math.sin(a) * 260 };
    if (inLake(p) && lakeLine(here, p)) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, path: [], k: 0, pace: 1.6, evading: true }; break; }
  }
  if (bird.doing) bird.doing.until = clock.min + 30;                // after a fright, a while before they settle to anything
}
const nearestShore = (p) => { const sh = duckShore(); let best = 0; sh.forEach((x, k) => { if (dist(p, x.wet) < dist(p, sh[best].wet)) best = k; }); return best; };
/** A point a little out from the bank, towards the middle of the lake. */
const offshore = (wet, by) => { const c = MAP.lake, d = dist(wet, c) || 1; return { x: wet.x + ((c.x - wet.x) / d) * by, y: wet.y + ((c.y - wet.y) / d) * by }; };
/** Somewhere quiet for a rabbit: a glade or the thin edge of the forest, away from the paths and whatever people go to. */
function quietSpot() {
  let best = null, bs = -Infinity;
  for (let k = 0; k < 600; k++) {
    const i = Math.floor(randomWorld() * MAP.cls.length);
    if ((MAP.cls[i] !== G.MEADOW && MAP.cls[i] !== G.FOREST) || MAP.road[i] || MAP.jungle[i]) continue;
    const p = { x: MAP.X(i), y: MAP.Y(i) };
    if (MAP.zoneAt(p.x, p.y) !== "forest" || woodDepth(MAP, p.x, p.y) > 0.5) continue;
    const s = Math.min(...boards.world.map((st) => dist(p, center(st)))) / 600 + randomWorld() * 0.4;
    if (s > bs) { bs = s; best = p; }
  }
  const f = MAP.tiles.forest;
  return best ?? { x: f.x + f.w * 0.7, y: f.y + f.h * 0.7 };
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
  if (p && MAP.zoneAt(p.x, p.y) === "plateau") k *= 0.5;
  if (isSick()) k *= 0.8;
  if (myAge() >= 60) k *= 0.85;
  if (weather.now === "雪" && board === "world") k *= 0.85;      // snow underfoot
  if (youStack()?.cards.some((c) => c.key === "sandals")) k *= 1.25;
  return MOVE_RANGE * k;
}
const workPace = () => (hungry() ? 1.4 : 1) * (tired() ? 1.4 : 1) * (isSick() ? 1.5 : 1) * (myAge() >= 60 ? 1.2 : 1) * (weather.now === "雨" && !inYard(youAt() ?? { x: 0, y: 0 }) ? 1.1 : 1);
function bodyState() {
  const s = [];
  if (starving()) s.push("饿得发慌：走不远，干不了活");
  else if (hungry()) s.push("饿了：走不远，干活慢");
  if (spent()) s.push("累垮了：得睡一觉");
  else if (tired()) s.push("累了：干活慢");
  if (groping()) s.push("天黑看不清路：走不远");
  if (isSick()) s.push("病了：干活慢、走不远");
  if (myAge() >= 60) s.push("上了年纪：走得慢、干活慢");
  else if ((me.cold ?? 0) > 60) s.push("冷得发抖：找个火边暖和暖和");
  return s;
}
function eat(food, where) {
  sfx("eat");
  if (me.guide) (me.guide.flags ??= {}).ate = true;
  me.food = Math.min(100, me.food + food);
  float(me.food >= 100 ? "吃饱了" : `饱 +${Math.round(food)}`, where, board);
}

// ---------------------------------------------------------------------------
// Input: drag "you" directly; drag nearby things; drag empty ground to pan; tap to look
// ---------------------------------------------------------------------------
let drag = null, selected = false;
table.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary || e.button !== 0 || e.target.closest(".detail")) return;
  hideDetail();
  try { table.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in checks */ }
  const el = e.target.closest(".card");
  if (!el || el.classList.contains("hidden")) { drag = { kind: "pan", sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false }; return; }
  const card = cardById(el.dataset.card), st = stackOf(card);
  const groups = cardGroups(st), slot = groups.findIndex((group) => group.card === card);
  if (slot < 0) return;
  const { start: i, end } = groups[slot];
  const kind = card.key === "you" ? "move" : i === 0 && st.ctl?.mode === "manual" ? "steer" : CARRY.has(DEFS[card.key].type) && !st.npc ? "item" : "none";
  const p = toWorld(e.clientX, e.clientY);
  drag = { kind, card, st, i, end, slot, sx: e.clientX, sy: e.clientY, ox: p.x - st.x, oy: p.y - st.y - slot * peekOf(st), moved: false };
});
table.addEventListener("pointermove", (e) => {
  if (!e.isPrimary || !drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
  drag.moved = true;
  if (drag.kind === "pan") {
    if (board !== "world") return;
    cam.follow = false;
    cam.x = drag.cx - (e.clientX - drag.sx) / cam.z; cam.y = drag.cy - (e.clientY - drag.sy) / cam.z;
    applyCam(); return;
  }
  const p = toWorld(e.clientX, e.clientY);
  if (drag.kind === "move") { if (!drag.from) sfx("pick"); moveYou(p); return; }
  if (drag.kind === "steer") { steerMove(p); return; }
  if (drag.kind === "item") {
    if (!drag.lift) {
      sfx("pick");
      const taken = drag.st.cards.splice(drag.i, drag.end - drag.i);
      if (!drag.st.cards.length) removeStack(drag.st);
      drag.lift = newStack(taken, drag.st.x, drag.st.y + drag.slot * peekOf(drag.st), drag.st.board);
      drag.lift.lifted = true;
    }
    drag.lift.x = p.x - drag.ox; drag.lift.y = p.y - drag.oy;
    drag.target = targetAt(p, drag.lift);
    markTarget(drag.target);
  }
});
table.addEventListener("pointerup", (e) => {
  if (!e.isPrimary) return;
  const d = drag; drag = null;
  $("aim").classList.remove("on"); markTarget(null);
  if (!d) return;
  if (d.moved && (d.kind === "move" || d.lift)) sfx("drop");
  if (!d.moved) {
    if (d.kind === "pan") {
      const point = toWorld(e.clientX, e.clientY);
      if (placing) return placeFoundation(point);
      walkTo(youStack(), point);
      select(false);
      return;
    }
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
      if (boards[d.st.board].includes(d.st)) { d.st.cards.splice(d.i, 0, ...d.lift.cards); removeStack(d.lift); }
      else { d.lift.x = d.st.x; d.lift.y = d.st.y; }
      carryChanged();
      return;
    }
    if (d.target?.npc && PD(d.target)) { const cards = d.lift.cards; removeStack(d.lift); const rest = giveTo(d.target, cards); if (rest.length) youStack().cards.push(...rest); carryChanged(); return; }
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
    if (d.target?.cards[0].key === "compost") { const c = d.target.cards[0], ok = d.lift.cards.filter((x) => COMPOSTABLE.has(x.key)); if (ok.length) { c.heap = Math.min(12, (c.heap ?? 0) + ok.length); ok.forEach((x) => x.el.remove()); const rest = d.lift.cards.filter((x) => !ok.includes(x)); removeStack(d.lift); if (rest.length) youStack().cards.push(...rest); float(`倒进堆肥坑 ${ok.length} 样`, center(d.target), "world"); carryChanged(); return; } }
    if (d.target?.cards[0].key === "chest" && d.target.cards[0].items.length + d.lift.cards.length > CHEST_CAP) { toast("木箱装不下了"); youStack().cards.push(...d.lift.cards); removeStack(d.lift); carryChanged(); return; }
    if (d.target?.cards[0].key === "barn" || d.target?.cards[0].key === "chest") { const b = d.target.cards[0]; b.items.push(...d.lift.cards.map((c) => c.key)); d.lift.cards.forEach((c) => c.el.remove()); removeStack(d.lift); float(`放进${b.name ?? "仓库"}`, center(d.target), "world"); carryChanged(); return; }
    if (d.target && !d.target.npc) { d.target.cards.push(...d.lift.cards); removeStack(d.lift); if (d.target === you) overflow(you); }
    carryChanged();
  }
});
table.addEventListener("pointercancel", (e) => {
  if (!e.isPrimary || !drag) return;
  const d = drag; drag = null;
  $("aim").classList.remove("on"); markTarget(null);
  if (d.lift) {
    if (!boards[d.st.board].includes(d.st)) boards[d.st.board].push(d.st);
    d.st.cards.splice(d.i, 0, ...d.lift.cards);
    removeStack(d.lift);
  } else if (d.from) {
    Object.assign(d.st, d.from);
    d.st.lifted = false;
  }
});
function targetAt(p, self) {
  const candidates = [];
  for (const o of stacks()) {
    if (o === self || o.lifted || o.indoors) continue;
    for (const [offset, { card }] of cardGroups(o).entries()) {
      if (card.el.matches(".hidden, .ghost, .no-card, .hidden-kit, .gone")) continue;
      candidates.push({ stack: o, x: o.x, y: o.y + offset * peekOf(o), w: card.w, h: card.h, z: Math.round(o.y) + offset });
    }
  }
  return pickDropTarget(p, candidates, board === "world" ? cam.z : roomK)?.stack ?? null;
}
function markTarget(st) {
  document.querySelectorAll(".drop-ok").forEach((n) => n.classList.remove("drop-ok"));
  if (st) cardGroups(st).at(-1).card.el.classList.add("drop-ok");
}
const blockedBy = (reason) => ({ wall: "墙挡住了去路", cliff: "岩壁太陡，上不去", water: "前面是深水", edge: "走不到那边" }[reason] ?? "这里没有路");
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
    drag.blocked = got.blocked ? blockedBy(got.reason) : "";
    x = got.x - CARD_W / 2; y = got.y - CARD_H / 2;
  }
  you.x = x; you.y = y;
  drag.target = targetAt({ x: x + CARD_W / 2, y: y + CARD_H / 2 }, you);
  markTarget(drag.target);
  if (board !== "world") return;
  const a = { x: drag.from.x + CARD_W / 2, y: drag.from.y + CARD_H / 2 }, b = center(you);
  const line = $("aimLine"), ring = $("aimRange");
  line.setAttribute("x1", a.x); line.setAttribute("y1", a.y); line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
  ring.setAttribute("cx", a.x); ring.setAttribute("cy", a.y); ring.setAttribute("r", moveRange(a));
  $("aim").classList.add("on"); $("aim").classList.toggle("edge", drag.edge || Boolean(drag.blocked));
}
/** Let go of the preview and walk to the indicated spot. */
function dropYou(d) {
  const you = d.st; you.lifted = false;
  let t = d.target;
  if (t && board === "world") {
    const spot = standOn(you, t);
    const got = reachAlong(MAP, { x: you.x + CARD_W / 2, y: you.y + CARD_H / 2 }, { x: spot.x + CARD_W / 2, y: spot.y + CARD_H / 2 });
    if (got.blocked) { t = null; d.blocked = blockedBy(got.reason); }
  }
  if (d.blocked && !t) toast(d.blocked);
  if (t) Object.assign(you, standOn(you, t));
  if (board !== "world") { if (t) arrive(you, t); return; }
  // The card stays where you put it; the walk is paid in time and breath, not replayed step by step.
  const d0 = dist(d.from, you), stride = playerStride(moveRange(center(you)), MOVE_RANGE);
  me.rest = Math.max(0, me.rest - walkEffort(d0, MAP.zoneAt(center(you).x, center(you).y) === "plateau"));
  if (holds(you, "sandals")) {
    me.sandalDistance = (me.sandalDistance ?? 0) + d0;
    if (me.sandalDistance >= 700) { me.sandalDistance -= 700; wearTool(you, "sandals"); }
  }
  cam.follow = true;
  const mins = Math.round(d0 / stride);
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
/** A tap plans the full route. Dragging remains a short, direct move. */
function walkTo(st, p, target = null, intent = null, automatic = false) {
  if (!st) return;
  const from = { x: st.x + CARD_W / 2, y: st.y + CARD_H / 2 };
  const goal = target ? standOn(st, target) : { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  const end = { x: goal.x + CARD_W / 2, y: goal.y + CARD_H / 2 };
  if (st.board !== "world") {
    end.x = clampN(end.x, CARD_W / 2, 1060 - CARD_W / 2);
    end.y = clampN(end.y, CARD_H / 2, 700 - CARD_H / 2);
  }
  const path = st.board === "world" ? findPath(MAP, from, end) : [end];
  if (!path?.length) { if (!automatic) toast(blockedBy(terrainBlock(MAP, end.x, end.y))); return false; }
  queuePlayerWalk(st, end, path.slice(0, -1), target, intent, automatic);
  return true;
}
function queuePlayerWalk(st, end, path, target, intent = null, automatic = false) {
  cancelJob(st);
  st.unloading = false;
  st.travel = null;
  st.walk = { x: end.x - CARD_W / 2, y: end.y - CARD_H / 2, path, k: 0, target, plotted: true, intent, automatic };
  if (!automatic) cam.follow = true;                 // you sent them: the view goes along. On their own: the view stays where you're looking
}
/** Where a stack ends up on a card: you stack squarely on it (its title still showing); villagers stand a little to the side. */
const SLOTS = [[0, 0], [34, 20], [-34, 20], [0, 40]];             // up to four villagers on one card, all still on it
function standOn(st, t) {
  const top = t.y + (cardGroups(t).length - 1) * peekOf(t), x = t.x + (t.w - CARD_W) / 2, y = top + t.h - CARD_H + PEEK;
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
  const key = `${a.x},${a.y}>${b.x},${b.y}`;
  let path;
  const wary = Boolean(st.npc);                                     // villagers know where the tiger lives
  const ck = `${key}${wary ? "|w" : ""}`;
  path = pathCache.get(ck);
  if (path === undefined) {
    path = findPath(MAP, a, b, { wary });
    if (pathCache.size >= 512) pathCache.delete(pathCache.keys().next().value);
    pathCache.set(ck, path);
  }
  return path ? path.slice(0, -1) : null;
}
/** Returns true on arrival. */
function stepWalk(st, minutes, speed = 1) {
  const w = st.walk;
  let step = PX_PER_MIN * minutes * speed;
  for (let guard = 0; guard < 8 && step > 0; guard++) {
    let tx, ty, last = true;
    if (w.path && w.k < w.path.length) { tx = w.path[w.k].x - CARD_W / 2; ty = w.path[w.k].y - CARD_H / 2; last = false; }
    else if (w.target && !w.plotted) {
      if (!boards[st.board].includes(w.target)) { st.walk = null; return false; }
      ({ x: tx, y: ty } = standOn(st, w.target));
    } else { tx = w.x; ty = w.y; }
    const dx = tx - st.x, dy = ty - st.y, d = Math.hypot(dx, dy);
    const stride = d <= step + 1 ? d : step;
    const next = stride >= d ? { x: tx, y: ty } : { x: st.x + (dx / d) * stride, y: st.y + (dy / d) * stride };
    if (w.plotted && st.board === "world") {
      const got = reachAlong(MAP, { x: st.x + CARD_W / 2, y: st.y + CARD_H / 2 }, { x: next.x + CARD_W / 2, y: next.y + CARD_H / 2 });
      if (got.blocked) { st.walk = null; toast(blockedBy(got.reason)); return false; }
      me.rest = Math.max(0, me.rest - walkEffort(stride, MAP.zoneAt(got.x, got.y) === "plateau"));
      if (holds(st, "sandals")) {
        me.sandalDistance = (me.sandalDistance ?? 0) + stride;
        if (me.sandalDistance >= 700) { me.sandalDistance -= 700; wearTool(st, "sandals"); }
      }
    }
    Object.assign(st, next);
    if (stride >= d) { step -= d; if (last) return true; w.k++; continue; }
    return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Animals in groups (animal-ways.js): a flock follows its oldest; ducklings go in a line behind their mother; one
// takes fright and the lot of them go.
// ---------------------------------------------------------------------------
/** Which way an animal is heading: towards where it's walking, else the way it last went. */
function headingOf(st) {
  const w = st.walk, c = st.critter, here = center(st);
  if (w) {
    const t = w.path && w.k < w.path.length ? w.path[w.k] : w.target ? center(w.target) : { x: w.x + CARD_W / 2, y: w.y + CARD_H / 2 };
    if (dist(t, here) > 60) {                                        // going somewhere, not just drifting: the group turns with it —
      const want = Math.atan2(t.y - here.y, t.x - here.x);          // gradually, so the others swing round rather than cut across
      if (c.heading === undefined) c.heading = want;
      else {
        const turn = Math.max(0, clock.min - (c.headingAt ?? clock.min)) * 0.06, d = Math.atan2(Math.sin(want - c.heading), Math.cos(want - c.heading));
        c.heading += Math.max(-turn, Math.min(turn, d));
      }
      c.headingAt = clock.min;
    }
  }
  return c.heading ?? 0;
}
const groupMembers = (kind) => boards.world.filter((q) => q.critter?.kind === kind && !q.lifted);
function groupLeader(kind) {
  const all = groupMembers(kind), grown = kind === "duck" ? all.filter((q) => duckAge(q) >= 3) : all;
  return leaderOf((grown.length ? grown : all).map((q) => ({ id: q.id, born: q.critter.bornDay ?? 0, q })))?.q ?? null;
}
/** A duckling's mother: the one it hatched to, or failing her the nearest grown duck. */
function motherOf(st) {
  const here = center(st), grown = livingDucks().filter((q) => duckAge(q) >= 3);
  return grown.find((q) => q.id === st.critter.mother) ?? grown.filter((q) => q.critter.sex === "female").sort((a, b) => dist(here, center(a)) - dist(here, center(b)))[0]
    ?? grown.sort((a, b) => dist(here, center(a)) - dist(here, center(b)))[0] ?? null;
}
/** Where this one should be: ducklings in a line behind their mother; the rest fanned out behind the leader. */
function groupPlace(st, lead) {
  const kind = st.critter.kind, sp = HABITS[kind].spacing;
  if (kind === "duck" && duckAge(st) < 3) {
    const mum = motherOf(st);
    if (!mum) return null;
    const brood = livingDucks().filter((q) => duckAge(q) < 3 && motherOf(q) === mum).sort((a, b) => a.id - b.id);
    const front = brood[brood.indexOf(st) - 1] ?? mum;
    return { front, at: fileSlot(center(front), headingOf(front), sp * 0.9) };          // close behind, each card still showing
  }
  const others = groupMembers(kind).filter((q) => q !== lead && !(kind === "duck" && duckAge(q) < 3)).sort((a, b) => a.id - b.id);
  return { front: lead, at: flockSlot(center(lead), headingOf(lead), others.indexOf(st) + 1, sp) };
}
/** Room enough to see each card: no closer to another of the group than this (a card is 112 × 148; the title strip
 *  of one behind may be covered, not more). */
const roomy = (st, p) => groupMembers(st.critter.kind).every((q) => q === st || Math.abs(center(q).x - p.x) > 96 || Math.abs(center(q).y - p.y) > 100);
/** Its place in the group, or the nearest free spot round the one in front at the same distance, or further out. */
function roomFor(st, at, front, spacing, fits) {
  if (fits(at) && roomy(st, at)) return at;
  const f = center(front), base = Math.atan2(at.y - f.y, at.x - f.x), r = Math.max(spacing * 0.9, dist(at, f));
  for (const reach of [1, 1.5, 2]) for (let k = 1; k <= 14; k++) {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.42, p = { x: f.x + Math.cos(a) * r * reach, y: f.y + Math.sin(a) * r * reach };
    if (fits(p) && roomy(st, p)) return p;
  }
  return null;
}
/** Returns true when this animal is a follower and has been moved; the leader (and loners) return false. */
function followGroup(st, minutes, you) {
  const c = st.critter, habit = HABITS[c.kind];
  if (habit?.group !== "flock") return false;
  const lead = groupLeader(c.kind);
  if (!lead || lead === st) return false;
  const here = center(st), duck = c.kind === "duck";
  if (duck && inLake(here) !== inLake(center(lead))) return false;        // getting in or out of the water: its own way, after the others
  const place = groupPlace(st, lead);
  if (!place) return false;
  const fits = (p) => (duck ? (inLake(here) ? inLake(p) && lakeLine(here, p) : !inLake(p) && walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked)
    : walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked);
  const at = roomFor(st, place.at, place.front, habit.spacing, fits) ?? here;            // nowhere free: stay put rather than pile on
  // one that sees you first startles the leader, and so the whole group
  const player = you?.board === "world" ? center(you) : null;
  if (player && dist(player, here) < (c.fear || 250) && clock.min - (lead.critter.alarm?.at ?? -99) > 5) { lead.critter.alarm = { at: clock.min, from: player }; lead.critter.nextMove = 0; }
  const gap = dist(here, at);
  if (dist(here, center(lead)) > 900) { if (!st.walk) critterGo(st, center(lead)); }   // lost the others: make for the leader
  else if (gap > 30 || (st.walk && gap > 8)) st.walk = { x: at.x - CARD_W / 2, y: at.y - CARD_H / 2 };   // settle near its place; don't fidget
  else { st.walk = null; return true; }
  const fleeing = lead.walk?.evading || clock.min - (lead.critter.alarm?.at ?? -99) < 8;
  const own = duck ? (inLake(here) ? 0.8 : 0.65) : 0.75, theirs = lead.walk?.pace ?? own;   // keep the leader's pace, faster only to catch up
  const pace = (gap > habit.spacing * 1.5 ? own : Math.min(own, theirs * 1.15)) * catchUp(gap, habit.spacing) * (fleeing ? 2 : 1);
  if (st.walk && stepWalk(st, minutes, pace)) st.walk = null;          // no way back to the others just now: it waits
  return true;
}

/** A critter heading for a spot: straight if the way is clear, round water and cliffs if not. */
function critterGo(st, p) {
  const here = center(st);
  if (!walkable(MAP, p.x, p.y)) return false;
  if (!reachAlong(MAP, here, p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; return true; }
  const path = findPath(MAP, here, p);
  if (!path?.length) return false;
  st.walk = { path: path.slice(0, -1), k: 0, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  return true;
}

/** You (and what you carry) arrive at something: talk, go in or out, board a boat, or work with it. */
function arrive(st, target, intent = null) {
  const top = target.cards[0], def = DEFS[top.key];
  if (st.unloading) { st.unloading = false; if (unload(st, target)) return; }
  const hammer = st.cards.some((c) => c.key === "hammer");
  if (hammer && (top.built || (top.key === "plot" && !loose(st).length && Object.values(top.need).some((v) => v > 0)))) return startDismantle(st, target);
  if (top.key === "plot") return workPlot(st, target);
  if ((top.key === "barn" || top.key === "chest") && loose(st).length) return storeIn(target, st);
  if (top.key === "compost" && loose(st).some((c) => COMPOSTABLE.has(c.key))) return compostIn(target, st);
  const room = top.room ?? def.room;
  if (room) return enterRoom(room, st);
  if (top.key === "taoHouse") { float("从南边的门进屋", center(st), st.board); return; }
  if (top.key === "door") return leaveRoom(st);
  if (st.cards[0].key === "you" && (top.key === "cliffFoot" || top.key === "cliffTop")) return climb(st, top.key);
  if (st.cards[0].key === "you" && top.key === "lookout") return lookOut();
  const kit = target.cards.slice(1).filter((c) => DEFS[c.key].type === "tool").map((c) => c.key);   // tools left here
  const carried = [...st.cards.slice(1).map((c) => c.key), ...kit];
  const has = (k, n) => carried.filter((c) => c === k).length >= n;
  const can = RECIPES.filter((x) => x.needs[0] === top.key && invented(x) && (!x.when || x.when(top)) && x.needs.slice(1).every((k) => has(k, x.needs.filter((a) => a === k).length)));
  let r = (st.cards[0].key === "you" ? can.find((x) => !x.id || me.known[x.id]) : null) ?? can[0];   // what you know how to do comes first
  if (intent === "meal") r = can.find((recipe) => recipe.eat);
  if ((def.type === "person" || def.type === "animal") && !r) return talk(target, st);
  if (!r) return toast(HINT[top.key] ?? "这里没什么可做的");
  if (flooded(top.key)) return toast("水漫上来了，过两天水退了再来");
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
  const min = (r.eat ? r.min + (servings - 1) * 4 : r.min * (r.take ? 0.65 : 1) * workPace() * ebb) * (figuring ? 2 : 1);
  st.job = { r, target, left: min, total: min, servings, figuring };
  if (figuring) float("没做过，琢磨着来……", center(st), st.board);
  if (target.npc) target.npc.wait = min + 10;
  if (!r.eat && !r.nap && st.cards[0].key === "you") remember(target.cards[0].key);
}
// ---------------------------------------------------------------------------
// People: how well they know you and how far they trust you (never shown as numbers), what they remember of you,
// what they ask of you and whether you kept your word, what they like, and what they tell you as you grow closer.
// ---------------------------------------------------------------------------
const PD = (st) => PEOPLE_DATA[st?.npc?.key];
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
/** Their side of things with you, created the first time it is needed (older saves too). */
function soc(n) {
  n.bond ??= { fam: 0, trust: 0, owe: 0, grudge: 0 }; n.mem ??= []; n.known ??= { loves: [], dislikes: [] }; n.heartSeen ??= [];
  n.mood ??= 6; n.gifts ??= {}; n.req ??= null;
  return n;
}
const hearts = (n) => { const b = soc(n).bond; return b.fam * 0.6 + b.trust * 0.5 - b.grudge * 0.8; };
const nameOf = (st) => DEFS[st.cards[0].key].name;
const fillIn = (t, st, item = "") => t.replaceAll("{name}", nameOf(st)).replaceAll("{item}", item);
/** Something they will remember about you (a few at a time; the oldest fade). good: true, false or undefined. */
function memo(st, text, good) { const n = soc(st.npc); n.mem.unshift({ day: day(), text, good }); n.mem.length = Math.min(n.mem.length, 10); }
function bondUp(st, d) {
  const n = soc(st.npc), before = tierOf(hearts(n)).name;
  for (const [k, v] of Object.entries(d)) n.bond[k] = clampN(n.bond[k] + v, k === "owe" ? -6 : 0, 12);
  const after = tierOf(hearts(n));
  if (after.name !== before && hearts(n) > 0 && BONDS.indexOf(after) > BONDS.findIndex((t) => t.name === before)) banner("✦", `${nameOf(st)}和你成了${after.name === "相识" ? "熟人" : after.name}`);
  if (hearts(n) >= 3 && !st.ctl) { st.ctl = { mode: "auto", job: st.npc.job }; banner("✦", `${nameOf(st)}愿意听你安排了`); renderParty(); }
}
const moodWord = (n) => (n.mood < 3.5 ? "闷闷不乐" : n.mood > 7.5 ? "看着挺高兴" : "");
const doyNow = () => ((day() - 1) % (DAYS_PER_SEASON * 4)) + 1;

/** You walk up to them (or tap 聊聊): the most pressing thing first — a confidence they've been keeping, a request,
 *  a favour they owe you, something they remember — else whatever is on their mind today. Talking warms them once a day. */
function talk(target, st) {
  if (!awake(target)) return;
  const k = target.cards[0].key;
  if (!target.npc) { say(target, pickLine(TALK[k] ?? ["……"])); return; }
  if (target.npc.visitor) return say(target, pickLine(TRADER_LINES));
  if (!PD(target)) { target.npc.wait = Math.max(target.npc.wait, 20); return target.npc.retired ? say(target, pickLine(["“这院子，当年是一根根木头立起来的。”", "“好好干，别学我年轻时候那样莽。”", "“天凉了，多穿点。”"])) : kidTalk(target); }
  const n = soc(target.npc), P = PD(target), h = hearts(n);
  if (me.guide) (me.guide.flags ??= {}).talked = true;
  target.npc.wait = Math.max(target.npc.wait, 30); face(target, st); endMuse(target);
  if (n.talkDay !== day()) { n.talkDay = day(); bondUp(target, { fam: n.bond.grudge >= 2 ? 0.15 : 0.45 }); if (n.mood < 4) n.mood += 0.5; }
  n.chatDay = day();
  const ev = Object.entries(P.heart).find(([th]) => h >= Number(th) && !n.heartSeen.includes(Number(th)));
  if (ev) {
    const [th, e] = ev; n.heartSeen.push(Number(th));
    say(target, fillIn(e.text, target));
    for (const g of e.give ?? []) addCard(youStack(), g);
    if (e.rest) me.rest = Math.min(100, me.rest + e.rest);
    memo(target, "跟你说了心里话"); carryChanged();
    return;
  }
  if (n.req?.state === "asked") return say(target, n.req.text);
  if (n.bond.owe >= 2) return repay(target);
  const m = n.mem.find((x) => x.day >= day() - 2 && x.good !== undefined && !x.said);
  if (m && (m.good === false || randomWorld() < 0.7)) { m.said = true;      // a broken promise always comes up
    return say(target, m.good ? `“${m.text.replace(/^你/, "前两天你")}，我记着呢。”` : `“……${m.text.replace(/^你/, "")}。”`); }
  if (n.bond.grudge >= 2 && randomWorld() < 0.6) return say(target, pickLine(["“嗯。”", "“忙着呢。”", "（看了你一眼，没接话）"]));
  const tie = Object.values(P.ties ?? {})[0];
  const pool = [VOICE.line(k, "greet"), fillIn(pickLine(P.seasons[season()]), target), ...(h >= 2 && tie ? [fillIn(tie, target)] : []),
    ...(n.mood < 3.5 ? [fillIn(pickLine(P.low), target)] : n.mood > 7.5 ? [fillIn(pickLine(P.happy), target)] : [])];
  if (doyNow() === P.birthday && h >= 2 && n.birthdayTold !== day()) { n.birthdayTold = day(); return say(target, "“今天……是我生日。”"); }
  say(target, pickLine(pool));
}
/** Asking how things are: their news — and, as they trust you more, the things you would not know otherwise. */
function askNews(target) {
  if (!awake(target)) return;
  const n = soc(target.npc), P = PD(target), h = hearts(n);
  if (n.newsDay === day()) return say(target, "“刚不是问过了？没啥新鲜的。”");
  n.newsDay = day();
  const low = worst(n.moodlets ?? []);
  if (low && n.mood < 4 && h >= 1) { bondUp(target, { fam: 0.15 }); return say(target, `“唉……${low.text}。”`); }
  if (village.pirateWarning && !village.sawPirateIsland) {
    discoverBlackReef();
    return say(target, "“那船挂黑帆，住在东南外海黑礁后头。我年轻时见过他们靠岸。”");
  }
  if (!me.ropeHung && me.sawCliff && !me.heardCliff && ["san", "li"].includes(n.key)) {
    me.heardCliff = true;
    return say(target, "“崖壁没处落脚。早些年有人把绳子搭在上头，倒真爬过去了。”");
  }
  const ctx = newsCtx(target);
  let line = P.news.map((f) => f(ctx)).find(Boolean);
  if (!n.known.loves.length && h >= 0.5) { line = P.likesTell; n.known.loves.push(P.loves[0]); }
  else if (!n.known.fear && h >= 1.5) { line = P.fear.tell; n.known.fear = P.fear.name; }
  else if (!n.known.birthday && h >= 2.5) { line = `“我是${dayName(P.birthday)}生的。小时候那天能多吃一口粟。”`; n.known.birthday = P.birthday; }
  bondUp(target, { fam: 0.15 });
  say(target, line);
}
const newsCtx = (st) => ({ season: season(), reeds: find("reeds")?.cards[0].stock ?? 0, granary: find("granary")?.cards[0].stock ?? 0, stoveFuel: find("stove")?.cards[0].fuel ?? 0,
  hoe: kitHas(st, "hoe") || boards.world.some((s) => isField(s) && toolAt(s, "hoe")) });
/** They pay back a favour: something from the stove or the field, or a bit of know-how. */
function repay(st) {
  const n = soc(st.npc), you = youStack();
  n.bond.owe -= 2;
  if (st.npc.key === "aunt") { addCard(you, find("stove")?.cards[0].stock >= 3 ? "jarFull" : "roastFish"); say(st, "“上回你帮了我，这个拿着，路上吃。”"); }
  else {
    const r = CRAFTS.find((x) => x.who.includes(st.npc.key) && !me.known[x.id]);
    if (r) { me.known[r.id] = { mem: LEARNED_MEM, day: day() }; say(st, `“上回你帮我，我也没啥给的……教你${craftName(r.id)}吧。”`); renderCrafts(); }
    else { addCard(you, "grain"); addCard(you, "grain"); say(st, "“上回你帮我。两把粟，拿着。”"); }
  }
  overflow(you); carryChanged();
}

/** Now and then, near you and with time on their hands, they ask you for something. */
function considerAsking(st, minutes) {
  if (!PD(st)) return;
  const n = soc(st.npc), you = youStack();
  if (n.req || n.inside || st.job || n.askDay === day() || !you || you.board !== "world") return;
  if (hour() < 8 || hour() > 17 || dist(center(st), center(you)) > 600 || randomWorld() > minutes / 90) return;
  const ctx = newsCtx(st), choices = PD(st).asks.filter((a) => a.when(ctx) && a.id !== n.lastAsk);
  if (!choices.length) return;
  const a = pick(choices);
  n.askDay = day(); n.lastAsk = a.id;
  n.req = { id: a.id, state: "asked", at: clock.min, text: a.text, need: { ...(a.give ?? {}) } };
  say(st, a.text);
}
const askOf = (st) => PD(st).asks.find((a) => a.id === soc(st.npc).req?.id);
function acceptReq(st) {
  const n = soc(st.npc); if (n.req?.state !== "asked") return;
  n.req.state = "accepted"; n.req.until = day() * 1440 + 360 + 14 * 60;      // tomorrow, by nightfall (20:00)
  bondUp(st, { trust: 0.2 });
  say(st, pickLine(["“那就说定了。”", "“好，我等着。”"]));
  renderPromises();
}
function declineReq(st) {
  const n = soc(st.npc); if (!n.req) return;
  const accepted = n.req.state === "accepted";
  n.req = null;
  if (accepted) return breakReq(st, true);
  bondUp(st, { fam: -0.1 });
  if (PD(st).fear.id === "scorned") { n.mood -= 1.5; say(st, "“……哦。”"); } else say(st, "“那我再想想办法。”");
}
/** You hand them things: what they asked for counts towards it; anything else is a gift. */
function giveTo(target, cards) {
  if (!awake(target)) return cards;
  const n = soc(target.npc), a = n.req && askOf(target);
  if (a?.give && n.req) {
    const took = [];
    for (const c of cards) if ((n.req.need[c.key] ?? 0) > 0) { n.req.need[c.key]--; took.push(c); }
    if (took.length) {
      if (n.req.state === "asked") { n.req.state = "accepted"; n.req.until = day() * 1440 + 1200; }
      handOver(target, took, a.to);
      const rest = cards.filter((c) => !took.includes(c));
      if (Object.values(n.req.need).every((v) => v <= 0)) keepReq(target); else { say(target, `“还差${Object.entries(n.req.need).filter(([, v]) => v > 0).map(([k, v]) => `${DEFS[k].name}${v}`).join("、")}。”`); renderPromises(); }
      return rest;
    }
  }
  gift(target, cards);
  return [];
}
/** Where things you bring end up: on the stove's fire or in its pot, on the pile in the yard, or in their own hands. */
function handOver(st, cards, to) {
  const stove = find("stove")?.cards[0];
  for (const c of cards) {
    if (to === "stove" && stove && c.key === "wood") { stove.fuel = Math.min(6, (stove.fuel ?? 0) + 1); c.el.remove(); }
    else if (to === "stove" && stove && DEFS[c.key].type === "food") { stove.stock += 1; refreshStock(stove); c.el.remove(); }
    else if (to === "hand") { st.cards.push(c); cardsLayer.append(c.el); }
    else storeHome([c]);
  }
}
function keepReq(st) {
  const n = soc(st.npc), a = askOf(st);
  n.req = null; n.mood = Math.min(10, n.mood + 1);
  bondUp(st, { trust: 1.2, fam: 0.8, owe: 1 });
  memo(st, a.kept, true);
  say(st, a.thanks);
  me.promisesKept = (me.promisesKept ?? 0) + 1;
  if ([1, 5, 10, 20].includes(me.promisesKept)) chronicle(me.promisesKept === 1 ? `你头一回替人办成了事：${a.kept.replace(/^你/, "")}。` : `你答应别人的事，已经办成了 ${me.promisesKept} 件。`);
  renderPromises();
}
function breakReq(st, said = false) {
  const n = soc(st.npc), a = askOf(st) ?? PD(st).asks.find((x) => x.id === n.lastAsk);
  n.req = null; n.mood = Math.max(0, n.mood - 1);
  bondUp(st, { trust: said ? -0.8 : -1.5, grudge: said ? 0.4 : 1 });
  memo(st, a.broken, false);
  if (said) say(st, "“……那算了。”"); else toast(`答应${nameOf(st)}的事没办成，${PD(st).he}记下了`);
  renderPromises();
}
/** A gift: what they think of it depends on what it is, whether you gave the same the other day, and what day it is. */
function gift(target, cards) {
  if (!cards.length) return;
  const n = soc(target.npc), P = PD(target), key = cards[0].key, item = DEFS[key].name;
  const kind = P.loves.includes(key) ? "love" : P.likes.includes(key) ? "like" : P.dislikes.includes(key) ? "dislike" : "plain";
  const again = (n.gifts[key] ?? -9) >= day() - 2, bday = doyNow() === P.birthday && n.bdayGift !== day();
  let k = again ? 0.3 : 1; if (bday) { k *= 2; n.bdayGift = day(); }
  const gain = { love: { fam: 1.2, trust: 0.3 }, like: { fam: 0.7 }, plain: { fam: 0.3 }, dislike: { fam: -0.2 } }[kind];
  bondUp(target, Object.fromEntries(Object.entries(gain).map(([x, v]) => [x, v * k])));
  n.mood = clampN(n.mood + { love: 1.5, like: 0.6, plain: 0.2, dislike: -0.3 }[kind] * k, 0, 10);
  n.gifts[key] = day();
  if (kind === "love" && !n.known.loves.includes(key)) n.known.loves.push(key);
  if (kind === "dislike" && !n.known.dislikes.includes(key)) n.known.dislikes.push(key);
  say(target, fillIn(bday ? P.gift.birthday : again ? P.gift.again : P.gift[kind], target, item));
  if (kind !== "dislike" && !again) memo(target, `你送了${item}`, true);
  // what becomes of it: a hungry person eats, tools go into their hands, the rest onto the pile at home
  const food = cards.filter((c) => DEFS[c.key].type === "food");
  if (food.length && target.npc.hunger >= 3) { target.npc.hunger = 0; food.forEach((c) => c.el.remove()); cards = cards.filter((c) => !food.includes(c)); }
  const tools = cards.filter((c) => DEFS[c.key].type === "tool");
  tools.forEach((c) => { target.cards.push(c); cardsLayer.append(c.el); });
  storeHome(cards.filter((c) => !tools.includes(c)));
}
/** Once a day, coming close to someone awake and about: a nod, a word — how warm depends on how well you know each other. */
function encounter(st) {
  if (!PD(st)) { st.npc.metDay = day(); return; }
  const n = soc(st.npc), h = hearts(n);
  n.metDay = day();
  bondUp(st, { fam: 0.15 });
  if (n.req?.state === "accepted" && clock.min > n.req.until - 360) return say(st, "“答应我的事，别忘了。”");
  if (isSick()) return say(st, "“你脸色不好，回去在火边歇着吧。”");
  say(st, h < 1 ? "（打量了你一眼，点点头）" : h < 3 ? VOICE.line(st.npc.key, "greet") : fillIn(pickLine(PD(st).seasons[season()]), st));
}
/** Every so often: requests that lapse or fall due, chance meetings, and how their spirits drift. */
function peopleTick(minutes) {
  const you = youStack();
  if (Math.floor(clock.min / 30) !== Math.floor((clock.min - minutes) / 30)) renderPromises();   // the "by nightfall" turns red as it nears
  for (const st of boards.world.filter((s) => s.npc)) {
    const n = soc(st.npc);
    if (n.req?.state === "asked" && clock.min - n.req.at > 180) n.req = null;            // nobody answered: they sort it out themselves
    if (n.req?.state === "accepted" && clock.min > n.req.until) breakReq(st);
    if (n.req?.state === "accepted" && n.req.id === "tend" && me.tendedFor === day()) { me.tendedFor = 0; keepReq(st); }
    considerAsking(st, minutes);
    if (PD(st)) feel(st, minutes);
    if (you && you.board === "world" && !n.inside && n.metDay !== day() && !st.walk && dist(center(st), center(you)) < 260 && hour() >= 7 && hour() < 20) encounter(st);
  }
}
/** What someone feels just now (npc-mood.js), from what is actually going on around them. */
function feelings(st) {
  const n = st.npc, d = day(), fire = find("fire")?.cards[0], recent = (x, days) => x && d - x.day <= days;
  return {
    hungry: n.hunger >= (n.eatAt ?? 6), starving: n.hunger >= 9.5, ateHot: n.ateHot === d,
    cold: season() === "冬" && (fire?.fuel ?? 0) <= 0,
    worked: n.workDay === d ? n.workMin ?? 0 : 0, chatted: n.chatDay === d,
    lowGrain: (find("granary")?.cards[0].stock ?? 0) < headcount() * 2,
    goodHarvest: d - (village.goodHarvest ?? -99) <= DAYS_PER_SEASON,
    newBuilding: recent(village.lastBuilt, 3) ? village.lastBuilt.name : null,
    mourning: recent(village.lastDeath, 3) ? village.lastDeath.name : null,
    festival: d - (village.lastFestival ?? -99) <= 1,
    friend: hearts(soc(n)) >= 2, grudge: soc(n).bond.grudge >= 2,
    wet: weather.now === "雨" && weather.strength > 0.5 && !n.inside && !inYard(center(st)),
    sick: clock.min < (n.sickUntil ?? 0),
    floor: day() - (n.floorNight ?? -9) <= 1,
  };
}
/** Mood drifts towards what they feel; very low, and they put their work down for half a day. */
function feel(st, minutes) {
  const n = soc(st.npc), list = moodlets(feelings(st));
  n.moodlets = list;
  n.mood = clampN(moodStep(n.mood, moodTarget(list), minutes), 0, 10);
  if (n.breakUntil && clock.min >= n.breakUntil) { n.breakUntil = 0; n.mood = Math.min(10, n.mood + 1.5); }   // a bad half-day gets it off their chest
  if (n.mood < BREAK_AT && !n.breakUntil && n.lastBreak !== day() && awake(st) && !n.inside && !n.arriving) {
    const why = worst(list)?.text ?? "心里憋屈";
    n.breakUntil = clock.min + 300; n.lastBreak = day();
    cancelJob(st); endMuse(st); st.plans = [];
    chronicle(`${nameOf(st)}撂下手里的活，在火塘边闷坐了半天（${why}）。`);
    if (heard(st, 700)) say(st, `“不干了……${why}。”`);
    go(st, "fire", "watch");
  }
}
/** At dawn: fears pull their spirits down. (Mood itself follows what they feel — see feel.) */
function peopleDay() {
  for (const st of boards.world.filter((s) => s.npc && PD(s))) {
    const n = soc(st.npc);
    if ((find("granary")?.cards[0].stock ?? 0) < 4 && st === boards.world.find((q) => q.npc)) needUp("more-grain");
    if (PD(st).fear.id === "hunger" && (find("granary")?.cards[0].stock ?? 0) < 4) { n.mood -= 2; talks.push({ at: clock.min + 90, st, text: VOICE.line(st.npc.key, "lowFood") ?? "“瓮快见底了……”" }); }
    if (n.hunger >= 9.5 && !n.arriving) { village.starved++; chronicle(`${nameOf(st)}挨了一整天的饿。`); }
    n.mood = clampN(n.mood, 0, 10);
    for (const m of n.mem) if (m.day < day() - 8) m.good = undefined;                       // old things are kept, but no longer brought up
  }
}
/** Your promises, by the face: who, what is still missing, and by when. */
function renderPromises() {
  const box = $("mePromises"); if (!box) return;
  const open = boards.world.filter((s) => s.npc && soc(s.npc).req?.state === "accepted");
  box.innerHTML = open.map((s) => {
    const r = s.npc.req, left = Object.entries(r.need).filter(([, v]) => v > 0).map(([k, v]) => `${DEFS[k].name}×${v}`).join(" ") || "帮着锄一遍地";
    const soon = r.until - clock.min < 300, when = day() * 1440 + 360 + 840 === r.until ? "明天天黑前" : "今天天黑前";
    return `<span class="promise${soon ? " soon" : ""}" title="答应${nameOf(s)}的事">${iconFor(DEFS[s.cards[0].key].icon)}<b>${left}</b><i>${when}</i></span>`;
  }).join("");
}
/** Recheck costs against the live board, then apply inputs, source and output together. */
function commitProduction(st, target, request, { load = false, packed = false, clearLoad = false, details } = {}) {
  if (!boards[st.board]?.includes(st) || !boards[target?.board]?.includes(target) || st.board !== target.board || target.lifted) return null;
  if (load && st.carry) return null;
  const source = target.cards[0];
  const plan = planProduction({ source, cards: st.cards.slice(1), season: season(), ...request });
  if (!plan) return null;
  const made = (packed ? plan.output.slice(0, 1) : plan.output).map((key) => newCard(key));
  const stockBefore = source.stock;
  Object.assign(source, plan.stock);
  st.cards = st.cards.filter((card) => !plan.inputs.includes(card)).concat(made);
  if (clearLoad) st.carry = null;
  if (load) st.carry = { key: plan.output[0], n: plan.output.length, ids: made.map((card) => card.id), packed };
  recordProduction(production, {
    kind: request.kind, minute: clock.min, actor: st.npc ? npcIdentity(st) : st.cards[0].key,
    source: source.key, sourceId: source.id, spent: plan.inputs.map((c) => c.key), output: [...plan.output],
    ...(plan.stock.stock !== undefined ? { stockBefore, stockAfter: source.stock } : {}),
    ...details,
  });
  plan.inputs.forEach((card) => card.el.remove());
  made.forEach((card) => { layerOf(st.board).append(card.el); card.el.classList.add("pop"); });
  if (plan.stock.stock !== undefined) refreshStock(source);
  return { made, stockBefore };
}

const WORK_SOUND = { chestnut: "chop", pineGrove: "chop", lake: "splash", shallows: "splash", pit: "dig", scree: "dig", mineFace: "dig", copperRock: "dig", flintVein: "dig", field: "dig", field2: "dig" };
function finishHarvest(st, target) {
  const result = commitProduction(st, target, { kind: "harvest" }, { load: Boolean(st.npc), packed: Boolean(st.npc) });
  if (!result) return false;
  const f = target.cards[0], crop = DEFS[f.lastCrop ?? "grain"].name;
  if (result.stockBefore >= 3) village.goodHarvest = day();
  if (!st.npc) float(`${result.stockBefore >= 3 ? "好收成" : "长得不好，收得少"}：${crop} ×${result.made.length}`, center(target), target.board);
  if (soilOf(f) <= 1 && f.lastCrop !== "bean") { observe("soil-tires"); needUp("tired-soil"); }
  if (soilOf(f) <= 1 && f.lastCrop !== "bean") omen(`“${DEFS[f.key].name}连着种粟，地种乏了。明年种一季豆，或者让它歇一年。”`);
  target.cards[0].el.querySelector(".card-art").innerHTML = iconFor("field");
  groundChanged();
  firstHarvest();
  return true;
}

function finish(st) {
  const { r, target, servings, figuring, automatic } = st.job; st.job = null; st.bar?.remove(); st.bar = null;
  const t = target.cards[0];
  if (r.dismantle) return finishDismantle(st, target, r);
  if (r.build) return finishBuildWork(st, target, figuring);
  const pool = [...st.cards.slice(1), ...target.cards.slice(1).filter((c) => DEFS[c.key].type === "tool")];
  const needs = planProduction({ use: r.needs.slice(1), cards: pool });
  if (!boards[st.board]?.includes(target) || target.lifted || flooded(t.key) || !needs || (r.when && !r.when(t))) {
    return toast("条件变了，这次没做成");
  }
  if (figuring) {
    if (randomWorld() > FIGURE_CHANCE) { float("没琢磨出来，东西还在", center(st), st.board); me.rest = Math.max(0, me.rest - r.min * 0.1); return carryChanged(); }
    me.known[r.id] = { mem: 1, day: day() };
    banner("✦", `自己琢磨出来了：${craftName(r.id)}`);
  }
  const cost = r.take ? 1 : r.kilnClay ?? (r.eat ? servings : r.fill ? 3 : 0);
  const output = r.fill ? ["jarFull"] : [...r.make];
  if (r.take && t.key === "shallows" && tide.level < -0.3) output.push("clam");
  const use = r.fill ? ["jar"] : r.use;
  let result;
  if (r.harvest) {
    if (!finishHarvest(st, target)) return toast("田里已经没粟可收了");
  } else if (cost || output.length || use?.length) {
    result = commitProduction(st, target, { kind: r.eat ? "eat" : r.sow ? "sow" : r.take ? "gather" : "craft", cost, use, output });
    if (!result) return toast("东西不够了，这次没做成");
    if (r.take) markCut(t);
    for (const c of result.made) if (c.key === "bed") layBed(st, c);
  }
  if (st.cards[0].key === "you" && !r.eat) sfx(r.harvest ? "gain" : WORK_SOUND[t.key] ?? (r.take ? "pick" : r.build ? "drop" : "gain"));
  if (r.eat) eat(SERVING * servings, center(st));
  if (r.nap) { me.rest = Math.min(100, me.rest + 40); float("歇过来一些", center(st), st.board); }
  if (r.fill) { result.made[0].charges = 3; float("装满一罐", center(st), st.board); }
  if (r.sow) { float("种下了", center(target), target.board); groundChanged(); }
  if (r.jarIn) { t.jars = (t.jars ?? 0) + 1; refreshStock(t); float(`公仓能存 ${granaryCap(t)} 份了`, center(target), "world"); }
  if (output.length > r.make.length && r.take && t.key === "shallows") float("退潮，多摸到一只", center(st), st.board);
  if (r.tend) { t.tendDay = day(); t.stock = Math.min(3, (t.stock ?? 0) + r.tend); if (r.tend > 1) float("石锄：长势 +2", center(target), target.board); refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor(t.stock >= 3 ? "fieldRipe" : "field"); float("锄了一遍", center(target), target.board); }
  if (r.tend) { groundChanged(); if (st.cards[0].key === "you") me.tendedFor = day(); }
  if (r.manure) { t.soil = Math.min(SOIL_MAX, soilOf(t) + r.manure); t.manured = yearNo(); refreshStock(t); float(`撒了草木灰，地力 ${t.soil}`, center(target), target.board); }
  if (r.water) { t.tendDay = day(); float("挑水浇了一遍", center(target), target.board); }
  if (r.fuel) { t.fuel = Math.min(6, (t.fuel ?? 0) + (r.fuel === 2 ? 2 : 1)); float("火更旺了", center(target), target.board); }
  if (r.say) say(target, r.say);
  for (const k of r.make) float(`+1 ${DEFS[k].name}`, center(st), st.board);
  if (r.mark && !marks.has(r.mark)) { marks.add(r.mark); banner("✦", r.mark); }
  if (r.id && st.cards[0].key === "you") {
    if (!st.job?.figuring && me.known[r.id]) me.known[r.id] = { mem: 1, day: day() };
  }
  overflow(st);
  if (!r.eat && !r.nap) me.rest = Math.max(0, me.rest - r.min * 0.1);
  for (const k of (r.needs ?? []).filter((k) => k === "axe" || k === "knife" || k === "hoe" || k === "net")) wearTool(st, k) || wearTool(target, k);
  // Standing on a tree or bush: keep at it until it is picked clean, you are too hungry/tired, or you walk away.
  if (st.cards[0].key === "you" && r.take && t.stock > 0 && loose(st).length >= capOf(st)) toast("背满了");
  else if (st.cards[0].key === "you" && r.take && t.stock > 0 && me.food > 20 && me.rest > 15) {
    st.repeat = { target, at: clock.min + 5, automatic };
  } else if (st.cards[0].key === "you" && r.take && t.stock > 0) {
    if (me.food <= 20) toast("饿得干不动了");
    else if (me.rest <= 15) toast("累了，先歇会儿");
  }
  deplete(t);
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
  if (!awake(npc)) return;
  const k = npc.cards[0].key;
  if (me.askedDay[k] === day()) return say(npc, "“今天教过你了，明天再来。”");
  if (hearts(soc(npc.npc)) < 1) return say(npc, "“你是谁家的？先说说话吧。”");
  const theirs = CRAFTS.filter((r) => r.who.includes(k));
  const pickOne = [...theirs].sort((a, b) => (b.inv ? 1 : 0) - (a.inv ? 1 : 0)).find((r) => !me.known[r.id])   // something they have just thought of first ?? theirs.filter((r) => me.known[r.id].mem < 0.6).sort((a, b) => me.known[a.id].mem - me.known[b.id].mem)[0];
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
function combatOptions(you, target) {
  const kind = target.cards[0].key;
  if (!Object.hasOwn(WILD_HP, kind) || target.raid?.retreat || (kind === "coastRaider" && !target.raid?.landed)) return [];
  const tools = you.cards.slice(1);
  const melee = ["spear", "axe", "hammer", "knife"].find((key) => tools.some((card) => card.key === key));
  const options = [{ id: "punch", label: "挥拳", range: 145, cost: 4, damage: 1 }];
  if (melee) options.push({ id: "swing", label: `用${DEFS[melee].name}近击`, tool: melee, range: 205, cost: 7, damage: 2 });
  if (holds(you, "spear")) options.push({ id: "throw", label: "投石矛", tool: "spear", range: 520, cost: 10, damage: 3 });
  if (holds(you, "torch") && ["boar", "tiger"].includes(kind)) options.push({ id: "ward", label: "举火把驱赶", range: 345, cost: 2, damage: 0 });
  return options;
}
function combatBlock(target) {
  const you = youStack(), card = target.cards[0];
  if (!you || target.board !== you.board || card.el.matches(".ghost, .hidden")) return "";
  const options = combatOptions(you, target);
  return options.map(({ id, label, range }) => `<button class="act" data-hunt="${card.id}" data-strike="${id}" ${dist(center(you), center(target)) > range ? "disabled" : ""}>${label}</button>`).join("");
}
function removeWildAnimal(target) {
  for (const card of target.cards) {
    card.el.classList.add("gone");
    setTimeout(() => card.el.remove(), 300);
  }
  target.bubble?.el.remove();
  removeStack(target);
}
function attackRabbit(card, action = null) {
  const target = stackOf(card), you = youStack();
  if (!target || !you || target.board !== you.board || target.cards[0].el.matches(".hidden, .ghost")) return;
  const options = combatOptions(you, target), a = center(you), b = center(target);
  const strike = action ? options.find((move) => move.id === action) : options.filter((move) => dist(a, b) <= move.range).at(-1);
  if (!strike || dist(a, b) > strike.range) return toast("太远了，再靠近点");
  if (clock.min < (me.attackReadyAt ?? 0)) return toast("先稳住脚步");
  if (me.rest < strike.cost || starving()) return toast("没力气出手");
  const obstacle = you.board === "world" && reachAlong(MAP, a, b).reason;
  if (obstacle && !(obstacle === "water" && card.key === "duck" && strike.id === "throw")) return toast(blockedBy(obstacle));
  me.attackReadyAt = clock.min + 8;
  me.rest -= strike.cost;
  cancelJob(you); you.walk = null; you.travel = null;
  if (strike.tool) wearTool(you, strike.tool);
  const state = target.critter ?? target.raid;
  if (strike.id === "ward") {
    state.calm = clock.min + 150;
    target.walk = null;
    const d = dist(a, b) || 1;
    critterGo(target, { x: b.x + (b.x - a.x) / d * 260, y: b.y + (b.y - a.y) / d * 260 });
    float("它畏火退开了", b, target.board);
    return;
  }
  state.hp = Math.max(0, (state.hp ?? WILD_HP[card.key]) - strike.damage);
  if (state.hp > 0) {
    float("击中了", b, target.board);
    if (target.critter?.kind === "duck") {
      target.walk = null; state.nextMove = 0;
    } else if (target.critter?.aggro && !holds(you, "spear") && !holds(you, "torch")) charge(target, you);
    else if (target.critter && !target.critter.predator) {
      const d = dist(a, b) || 1;
      critterGo(target, { x: b.x + (b.x - a.x) / d * 210, y: b.y + (b.y - a.y) / d * 210 });
    }
    carryChanged();
    return;
  }
  if (target.raid) {
    target.raid.retreat = true; target.raid.index--;
    chronicle("你击退了靠岸的黑帆劫掠者。");
    toast("劫掠者退回岸边去了");
    carryChanged();
    return;
  }
  removeWildAnimal(target);
  for (const key of LOOT[card.key]) addCard(you, key);
  overflow(you);
  float(`打到了${card.name ?? DEFS[card.key].name}`, b, you.board);
  const first = `第一次打到${DEFS[card.key].name}`;
  if (!marks.has(first)) { marks.add(first); banner("✦", first); }
  if (!boards.world.some((st) => st.critter?.kind === card.key)) chronicle(`这一带暂时见不到${DEFS[card.key].name}了。`);
  carryChanged();
}
/** The tiger: it keeps to the jungle. Hungry, it stalks the nearest deer and runs it down; fed, it lies up for half a day.
 *  You near it without a torch, it springs; a torch drives it back. */
function tigerTick(st, minutes, you) {
  const c = st.critter, here = center(st), yc = you && you.board === "world" ? center(you) : null;
  const torch = you?.cards.some((x) => x.key === "torch");
  c.hunger = (c.hunger ?? 5) + minutes / 300;
  if (st.walk?.pounce) {
    if (!yc || torch || reachAlong(MAP, here, yc).blocked) { st.walk = null; return; }
    if (stepWalk(st, minutes, 2.8)) { st.walk = null; maul(st, you); } return;
  }
  if (yc && dist(here, yc) < 260 && !torch && clock.min > (c.calm ?? 0) && !reachAlong(MAP, here, yc).blocked) return pounce(st, you);
  if (yc && torch && dist(here, yc) < 360) {                      // fire: it slinks off into the trees
    if (!st.walk || st.walk.prey) { const a = Math.atan2(here.y - yc.y, here.x - yc.x); const p = { x: here.x + Math.cos(a) * 300, y: here.y + Math.sin(a) * 300 }; if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; }
  }
  if ((c.lying ?? 0) > clock.min) { if (st.walk && stepWalk(st, minutes, c.speed)) st.walk = null; return; }
  if (!isActive("tiger", hour()) && c.hunger < 9 && !st.walk?.prey && inJungle(here)) { c.lying = clock.min + 60 + randomWild() * 60; return; }   // by day it lies up in the deep wood
  if (st.walk?.prey) {
    const prey = st.walk.target;
    if (!boards.world.includes(prey) || clock.min > st.walk.until || (!st.walk.prowl && !inJungle(here) && dist(here, c.home) > c.roam + 400) || (prey.pet && inYard(center(prey))) || reachAlong(MAP, here, center(prey)).blocked) st.walk = null;
    else if (stepWalk(st, minutes, 2.5)) { st.walk = null; kill(st, prey); }
    return;
  }
  if (!st.walk && !inJungle(here) && clock.min > (c.backAt ?? 0) && !critterGo(st, c.home)) c.backAt = clock.min + 120;   // back to its own ground
  if (c.hunger > 6) {
    const deer = boards.world.filter((s) => s.critter?.kind === "deer" && dist(center(s), here) < 950 && !reachAlong(MAP, here, center(s)).blocked).sort((a, b) => dist(center(a), here) - dist(center(b), here))[0];
    if (deer) { st.walk = { target: deer, prey: true, until: clock.min + 240 }; return; }
    if (c.hunger > TIGER_PROWL) {
      const prey = boards.world.filter((s) => PROWL_PREY.includes(s.critter?.kind ?? (s.pet ? "dog" : "")) && !(s.pet && inYard(center(s))) && dist(center(s), here) < 2000 && !reachAlong(MAP, here, center(s)).blocked)
        .sort((a, b) => dist(center(a), here) - dist(center(b), here))[0];
      if (prey) {
        st.walk = { target: prey, prey: true, prowl: true, until: clock.min + 480 };
        if (!c.prowling) {
          c.prowling = true;
          if (day() - (nature.prowlNoted ?? -99) >= DAYS_PER_SEASON * 4) {        // news once a year, not every time it's hungry
            nature.prowlNoted = day();
            const none = !boards.world.some((s) => s.critter?.kind === "deer");
            chronicle(none ? "林子里的鹿打光了，老虎饿得出了林子。" : "老虎在深林里撵不着鹿，饿得出了林子。");
            omen(none ? "“林子里没鹿了，老虎饿急了，会往外跑。夜里别一个人出去。”" : "“老虎出林子了，夜里别一个人出去。”");
          }
        }
        return;
      }
    }
  }
  if (!st.walk && randomWorld() < minutes / 90) {
    for (let k = 0; k < 10; k++) {
      const p = { x: c.home.x + (randomWorld() - 0.5) * c.roam * 2, y: c.home.y + (randomWorld() - 0.5) * c.roam * 1.6 };
      if (inJungle(p) && !reachAlong(MAP, here, p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
    }
  }
  if (st.walk && stepWalk(st, minutes, c.speed)) st.walk = null;
}
function kill(tiger, prey) {
  const name = prey.pet ? DEFS.dog.name : DEFS[prey.critter?.kind]?.name ?? "猎物";
  removeWildAnimal(prey);
  tiger.critter.hunger = 0; tiger.critter.lying = clock.min + 600; tiger.critter.prowling = false;
  float(prey.pet ? "老虎叼走了阿黄！" : `老虎扑倒了${name}`, center(tiger), "world");
  if (prey.pet) { chronicle("阿黄跑出院子，被老虎叼走了。"); carryChanged(); renderParty(); }
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
  you.walk = null; you.travel = null;
  toast("被老虎扑倒了！力 -45，赶紧离开丛林"); chronicle("你在林子深处被老虎扑倒了，捡回一条命。");
  tiger.critter.calm = clock.min + 240;
  const back = reachAlong(MAP, center(tiger), { x: center(tiger).x - Math.cos(a) * 160, y: center(tiger).y - Math.sin(a) * 160 });
  tiger.x = back.x - CARD_W / 2; tiger.y = back.y - CARD_H / 2;
}
/** The boar: it roots about its patch of wood; come close without a torch or a spear and it charges. */
function boarTick(st, minutes, you) {
  const c = st.critter, here = center(st), yc = you && you.board === "world" ? center(you) : null;
  const armed = you?.cards.some((x) => x.key === "spear"), torch = you?.cards.some((x) => x.key === "torch");
  if (st.walk?.charge) {
    if (!yc || torch || armed || reachAlong(MAP, here, yc).blocked) { st.walk = null; return; }
    if (stepWalk(st, minutes, 2.6)) { st.walk = null; gore(st, you); } return;
  }
  if (yc && dist(here, yc) < 240 && !armed && !torch && clock.min > (c.calm ?? 0) && !reachAlong(MAP, here, yc).blocked) return charge(st, you);
  if (yc && torch && dist(here, yc) < 320 && !st.walk) {         // fire: it backs off
    const a = Math.atan2(here.y - yc.y, here.x - yc.x), p = { x: here.x + Math.cos(a) * 260, y: here.y + Math.sin(a) * 260 };
    if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  }
  woodlandTick(st, minutes);
}
function woodlandTick(st, minutes) {
  const animal = st.critter, here = center(st), rooting = animal.kind === "boar";
  const herd = boards.world.filter((other) => other !== st && other.critter && !other.critter.water && other.critter.kind !== animal.kind);   // others, not its own kind
  const alarm = clock.min - (animal.alarm?.at ?? -99) < 8 ? { center: animal.alarm.from } : null;              // one of the herd saw something
  const threat = rooting ? null : alarm ? { alarm: true } : boards.world.find((other) => {
    if (other === st || other.indoors || other.npc?.inside) return false;
    const boar = other.critter?.aggro;
    if (!boar && !(other.npc || other.pet || other.critter?.predator || other.cards[0].key === "you")) return false;
    return dist(here, center(other)) < (boar ? 185 : animal.fear);
  });
  const nearby = herd.find((other) => dist(here, center(other)) < 150);
  const away = threat ?? nearby;
  if (away && st.walk && !st.walk.evading && clock.min >= (animal.nextMove ?? 0)) st.walk = null;
  const up = isActive(animal.kind, hour());
  if (!st.walk && clock.min >= (animal.nextMove ?? 0)) {
    animal.nextMove = clock.min + (away ? 5 : !up ? 90 + randomWild() * 60 : rooting ? 20 : 28) + randomWild() * 10;
    if (!away && !up && (animal.kind === "rabbit" || woodDepth(MAP, here.x, here.y) >= 0.55)) return;   // lying up (a rabbit in its form, the rest deep in cover): it doesn't stir
    const awayFrom = away && (away.alarm ? alarm.center : center(away));
    const angle = awayFrom ? Math.atan2(here.y - awayFrom.y, here.x - awayFrom.x) : randomWild() * 6.28;
    const habitat = animal.kind === "goat" ? "plateau" : MAP.zoneAt(animal.home.x, animal.home.y);
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = angle + k * 2.4, r = (k < 8 ? 155 + randomWild() * 150 : 85 + randomWild() * 90) * (up || away ? 1 : 0.6);
      const p = { x: here.x + Math.cos(a) * r, y: here.y + Math.sin(a) * r };
      if (!walkable(MAP, p.x, p.y) || reachAlong(MAP, here, p).blocked) continue;
      if (awayFrom && dist(p, awayFrom) < dist(here, awayFrom) + 25) continue;
      const crowded = herd.some((other) => dist(p, center(other)) < 150);
      const depth = woodDepth(MAP, p.x, p.y), edge = 1 - Math.min(1, Math.abs(depth - 0.3) * 2.5);   // the wood's edge, where the grass is
      const time = !up ? depth * 1.6 : animal.kind === "deer" || animal.kind === "rabbit" ? edge * 1.4 : 0;  // up: graze the edge; else lie up deep in
      const score = time + (MAP.zoneAt(p.x, p.y) === habitat ? 1.1 : 0) + depth * (rooting ? 2.3 : 1) -
        dist(p, animal.home) / 740 - (crowded ? 2 : 0) + (awayFrom ? dist(p, awayFrom) / 410 : 0) + randomWild() * 0.4;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (best) {
      critterGo(st, best);
      if (st.walk) st.walk.evading = Boolean(away);
    } else if (!away && dist(here, animal.home) > 125) critterGo(st, animal.home);
  }
  if (st.walk && stepWalk(st, minutes, away ? animal.speed : rooting ? 0.9 : 0.75)) st.walk = null;
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
  you.walk = null; you.travel = null;
  toast("被野猪撞了一下，力 -25");
  boar.critter.calm = clock.min + 180;                           // it goes back to rooting for a while
  const back = reachAlong(MAP, center(boar), { x: center(boar).x - Math.cos(a) * 120, y: center(boar).y - Math.sin(a) * 120 });
  boar.x = back.x - CARD_W / 2; boar.y = back.y - CARD_H / 2;
}
function cancelJob(st) { st.repeat = null; if (st.job) { st.job = null; st.bar?.remove(); st.bar = null; } }
function face(a, b) { a.facing = b.x < a.x ? -1 : 1; }

// ---------------------------------------------------------------------------
// Houses: only going indoors changes the scene
// ---------------------------------------------------------------------------
function enterRoom(room, st) {
  const party = st.cards; removeStack(st);
  fade(() => {
    board = room;
    $("room").hidden = false; table.classList.add("inside");
    newStack(party, ROOM_ENTRY.x, ROOM_ENTRY.y, room);
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
  if (isSick() && inYard(youAt())) me.sickUntil -= 720;                 // a night by the fire does you good
}

// ---------------------------------------------------------------------------
// Villagers: a home, a job, hunger. They choose what to do from where they are and what the village has.
// ---------------------------------------------------------------------------
const hour = () => (clock.min / 60) % 24;
const EVENING = () => hour() >= 18 && hour() < 20;
const isField = (s) => s.cards[0].key === "field" || s.cards[0].key === "field2";
/** Inside the yard walls (the house)? */
const inYard = (p) => { const c = MAP.house; return Boolean(c && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h); };
const awake = (st) => Boolean(st && !st.indoors && !st.npc?.inside);
/** Where you'd hear them: lines from far off don't fill your screen. Asleep in the yard, you hear them only from inside it. */
function heard(st, r = 1300) {
  const y = youStack(); if (!y || y.board !== st.board) return false;
  if (inYard(center(st)) !== inYard(center(y))) return dist(center(st), center(y)) < 420;
  return dist(center(st), center(y)) < r;
}
const RESTFUL = new Set(["eat", "wait", "watch", "evening", "sleep", "shelter", "feast", "play", "hide", "arrive", "forage"]);   // not work
const WINDING = new Set(["evening", "drop", "give", "hide", "eat", "wait", "feast", "arrive"]);   // jobs that belong to the end of the day
const talks = [];                           // lines waiting to be said, in game minutes: a chat goes back and forth
const moodOf = (n) => (n.hunger >= n.eatAt || (n.mood ?? 6) < 3.5 ? "low" : (n.mood ?? 6) > 7.5 ? "happy" : "idle");
/** Stand still a while, thinking. Sometimes you catch what they're thinking. */
function muse(st, min) {
  const n = st.npc;
  n.wait = min; st.musing = true; st.task = ""; intent(st, "");
  st.cards[0].el.classList.add("musing");
  if (heard(st, 450) && randomVoice() < 0.3) say(st, VOICE.thought(n.key, { hour: hour(), weather: weather.now, hungry: n.hunger >= n.eatAt, mood: moodOf(n) }));
}
/** Two of them free and close together: a few words back and forth. */
function startChat(a, b) {
  if (!awake(a) || !awake(b)) return;
  const [x, y] = a.npc.key === "aunt" ? [a, b] : [b, a];
  const lines = VOICE.chat(x.npc.key, y.npc.key, {
    weather: weather.now, season: season(),
    cooked: find("stove")?.cards[0].stock ?? 0,
    grain: find("granary")?.cards[0].stock ?? 0,
    sownFields: boards.world.filter((s) => isField(s) && s.cards[0].sown !== false).length,
    bareFields: boards.world.filter((s) => isField(s) && s.cards[0].sown === false).length,
  }, randomVoice);
  // An actual meeting changes their directed social memories, not just dialogue flavor.
  recordNpcChat(npcSocial, npcIdentity(x), npcIdentity(y), day());
  const who = { [x.npc.key]: x, [y.npc.key]: y };
  // A real conversation may carry an individual belief; no global omniscience.
  const share = chooseTheoryToShare(npcKnowledge, npcSocial, npcIdentity(x), npcIdentity(y), day(), Math.floor(clock.min / 90), seed);
  const belief = share && THEORIES.find((t) => t.id === share.theoryId && lore.theories[t.id]);
  if (share && belief) {
    const trust = relationOf(npcSocial, share.from, share.to).trust;
    if (transmitTheory(npcKnowledge, share.from, share.to, share.theoryId, { day: day(), trusted: trust >= 2 })) {
      const speaker = [x, y].find((q) => npcIdentity(q) === share.from);
      if (speaker) lines.push([speaker.npc.key, belief.claim]);
    }
  }
  lines.forEach(([k, t], i) => {
    const st = who[k];
    if (st) talks.push({ at: clock.min + 2 + i * 7, st, partnerId: (st === a ? b : a).id, text: t });
  });
  for (const s of [a, b]) if ((s.npc.mood ?? 6) < 4 && s.npc.chatDay !== day()) s.npc.mood += 0.6;   // talking it over helps a little
  for (const s of [a, b]) {
    s.npc.chatDay = day();
    s.npc.wait = 12 + lines.length * 7; s.npc.nextChat = clock.min + 540 + randomWorld() * 600;
    s.task = ""; intent(s, ""); s.cards[0].el.classList.add("musing");
  }
  face(a, b); face(b, a);
}
/** Not every waking hour is work: a breather mid-morning and mid-afternoon, and a word with whoever is near. */
function idleTurn(st) {
  const n = st.npc, h = hour();
  const other = boards.world.find((o) => o !== st && o.npc && awake(o) && !o.walk && !o.job && (o.npc.wait ?? 0) <= 0 && o.ctl?.mode !== "manual" && dist(center(o), center(st)) < 320);
  if (other && clock.min > (n.nextChat ?? 0) && clock.min > (other.npc.nextChat ?? 0) &&
    willNpcChat(npcSocial, npcIdentity(st), npcIdentity(other), { seed, day: day(), slot: Math.floor(clock.min / 90) })) {
    startChat(st, other); return true;
  }
  if (weather.now === "雨" && weather.strength > 0.75 && !inYard(center(st)) && randomWorld() < 0.3) { go(st, "fire", "shelter"); return true; }   // a downpour: under cover for a while
  const slot = h >= 10 && h < 10.6 ? "am" : h >= 15 && h < 15.6 ? "pm" : null;
  if (slot && n.breakAt !== `${day()}${slot}`) { n.breakAt = `${day()}${slot}`; muse(st, 30 + randomWorld() * 40); return true; }
  return false;
}
// A small real goal-arbitration slice adapted from the archived NPC brain.
// It proposes one lawful existing CardWorld task; the task itself still consumes
// time, makes the NPC travel and changes inventory through ordinary work.
function aidVillage(st) {
  if (st.ctl?.mode === "work") return false;
  const n = st.npc, lake = find("lake"), fish = observedFood(n, "lake");
  const choice = chooseVillageAid({
    grain: observedFood(n, "granary"), cooked: observedFood(n, "stove"), fish,
    canTravel: fish > 0 && lake && Boolean(route(st, lake)),
    generosity: npcTemperament(npcIdentity(st)).generosity, previous: n.lastGoal?.id,
  });
  n.lastGoal = { id: choice.id, because: choice.because, day: day() };
  if (choice.id !== "help-by-fishing") return false;
  go(st, "lake", "fish", null, lake);
  return Boolean(st.walk);
}
const FOOD_SITE = { eat: "stove", forage: "berries", fetch: "granary", fish: "lake", cook: "stove", give: "stove" };
const seedReserve = () => boards.world.filter((st) => isField(st) && st.cards[0].sown === false).length;

function finishFoodStep(st, task, success) {
  const n = st.npc, plan = n.foodPlan;
  if (plan?.steps[plan.index] !== task) return;
  if (!success) {
    n.foodBlocked = { id: plan.id, until: clock.min + 180 };
    n.lastFoodPlan = { id: plan.id, failedAt: task, minute: clock.min };
    n.foodPlan = null;
    n.wait = 10;
  } else if (++plan.index === plan.steps.length) {
    n.lastFoodPlan = { id: plan.id, completed: true, minute: clock.min };
    n.foodPlan = null;
  }
}

function observedFood(npc, key) {
  const observation = npc.foodSeen?.[key];
  return observation && clock.min - observation.minute <= 1440 ? observation.stock : 0;
}

function seekFood(st) {
  const n = st.npc;
  if (st.carry && carriedLoad(st).n === 0) st.carry = null;
  const sites = Object.fromEntries(["stove", "berries", "granary", "lake"].map((key) => [key, find(key)]));
  const here = center(st);
  const seen = (n.foodSeen ??= {});
  for (const [key, target] of Object.entries(sites)) {
    if (target && dist(here, center(target)) <= 950) seen[key] = { stock: target.cards[0].stock ?? 0, minute: clock.min };
  }
  const stock = (key) => observedFood(n, key);
  if (!n.foodPlan) {
    const justUp = hour() < n.wake + 1.5;
    if (n.hunger < n.eatAt || (justUp && n.hunger < 8 && stock("stove") > 0)) return false;
    const travel = {};
    for (const [key, target] of Object.entries(sites)) {
      if (target && (key === "stove" || stock(key) > 0)) {
        const path = route(st, target);
        if (path) travel[key] = (dist(here, center(target)) + path.length * 20) / PX_PER_MIN;
      }
    }
    const load = carriedLoad(st);
    const chosen = planNpcFood({
      hunger: n.hunger, cooked: stock("stove"), berries: stock("berries"),
      granary: stock("granary"), fish: stock("lake"), reserve: seedReserve(),
      carry: load.n > 0 ? st.carry.key : null, route: travel,
      blocked: n.foodBlocked?.until > clock.min ? n.foodBlocked.id : null,
      previous: n.lastFoodPlan?.completed ? n.lastFoodPlan.id : null,
    });
    if (!chosen) return false;
    n.foodPlan = { id: chosen.id, steps: chosen.steps, index: 0 };
    n.lastGoal = { id: chosen.id, because: chosen.because, day: day() };
  }
  const task = n.foodPlan.steps[n.foodPlan.index], key = FOOD_SITE[task], target = sites[key];
  if (target) go(st, key, task, null, target);
  if (!st.walk) finishFoodStep(st, task, false);
  return true;
}

function brain(st, minutes) {
  const n = st.npc;
  if (n.visitor) { if (n.wait > 0) n.wait -= minutes; else visitorBrain(st); return; }
  n.hunger = Math.min(10, n.hunger + minutes / (n.inside ? 900 : 600));       // a good meal lasts them about three days
  n.eatAt ??= 5.6 + randomWorld() * 1.2;
  const asleep = hour() >= n.sleep || hour() < n.wake;
  if (asleep) {
    if (n.inside) return;
    if (st.task === "sleep" && st.walk) return;
    cancelJob(st); endMuse(st);
    const b = littleOne(st) ? beds().find((x) => x.cards[0].key === "bed") : bedPlan().get(st);   // their own bed, or a hut
    if (b) return go(st, b.cards[0].key, "sleep", null, b);
    n.floorNight = day();                                                 // no bed: a mat on the floor by the fire
    const fire = find("fire"); return fire ? go(st, "fire", "sleep", null, fire) : goInside(st);
  }
  const tiger = boards.world.find((s) => s.critter?.predator);
  if (!n.inside && tiger && dist(center(tiger), center(st)) < 560 && st.task !== "hide") {
    cancelJob(st); endMuse(st); say(st, VOICE.line(n.key, "tiger")); n.wait = 0;
    return go(st, n.home, "hide");
  }
  if (n.wait > 0) { n.wait -= minutes; if (n.wait <= 0) endMuse(st); return; }
  if (n.inside) {
    // Not all at once: each gets up a beat after the others (game minutes, so ▶▶▶ and skipping the night don't cost them the morning).
    if (!n.outAt) n.outAt = clock.min + 3 + n.order * 8 + randomWorld() * 6;
    if (clock.min < n.outAt) return;
    n.outAt = 0;
    return comeOut(st);
  }
  if (n.arriving) { if (!st.walk && !st.job) go(st, "stove", "arrive"); return; }   // a newcomer makes for the stove first
  if ((n.breakUntil ?? 0) > clock.min) { if (!st.walk && !st.job && !seekFood(st)) muse(st, 60); return; }   // sulking, but not too proud to eat
  if (st.walk || st.job) {
    if (!st.walk && EVENING() && !WINDING.has(st.job?.npcTask)) { cancelJob(st); return headHome(st); }   // knock off at six
    return;
  }
  // After six they stop working: what they carry goes where it belongs, then the fire, then bed.
  if (EVENING()) return headHome(st);
  if (st.ctl?.mode !== "work") {
    if (seekFood(st)) return;
  } else {
    const food = find("stove").cards[0].stock > 0, justUp = hour() < n.wake + 1.5;
    if (n.hunger >= (justUp ? 8 : n.eatAt) && food) return go(st, "stove", "eat");
    const berries = find("berries");
    if (!food && n.hunger >= n.eatAt && berries?.cards[0].stock > 0) return go(st, "berries", "forage", null, berries);
  }
  // Finish carrying food to its destination before making a new tool plan.
  if (n.job === "farm" && st.carry?.key === "fish") return go(st, "stove", "give");
  if (n.job === "farm" && st.carry?.key === "grain") return go(st, "granary", "drop");
  if (n.hunger >= 8) return go(st, "stove", "wait");
  if (st.ctl?.mode !== "work" && idleTurn(st)) return;
  // Sowing and harvest wait for no one: a farmer's half-made tool waits instead (the plan is kept, not dropped).
  const fieldwork = (n.job === "farm" && !(st.ctl?.mode === "work" && st.ctl.job && st.ctl.job !== "farm") && fieldsCall(st)) || urgentJob(st);
  if (!fieldwork && !st.plans?.length && clock.min > (n.planBlocked ?? 0)) { const id = WANT[n.key]?.(st); if (id) st.plans = [{ r: recipeFor(id) }]; }
  if (!fieldwork && st.plans?.length) {
    const r = st.plans[0].r;
    think(st, r ? { id: `make-${r.id}`, because: `手边没有${DEFS[r.make[0]].name}，自己做一个` } : { id: "jar-in", because: "做好的陶罐送去公仓" });
    return planStep(st);
  }
  switch (st.ctl?.mode === "work" && st.ctl.job ? st.ctl.job : n.job) {     // the job you gave them, if you did
    case "farm": {
      // A farmer may voluntarily help supply fish when crops need no attention.
      // Deliver to the right place rather than sending fish to a grain store.
      if (st.carry?.key === "fish") return go(st, "stove", "give");
      if (st.carry?.key === "bean") return go(st, "taoHouse", "store");
      if (st.carry?.key === "grain") return go(st, "granary", "drop");
      if (st.carry?.key === "log" && lowFire()) return go(st, lowFire().cards[0].key, "stoke", null, lowFire());
      if (st.carry) { const p = plotNeeding(st.carry.key); return p ? go(st, "plot", "supply", null, p) : go(st, "taoHouse", "store"); }
      return farmerTurn(st);
    }
    case "cook": return cookTurn(st);
    case "fish": return fishTurn(st);
    case "play": {                                                        // children (and the old) potter about near home
      const c = MAP.house, small = npcAge(n) < 4 || n.retired;
      const anchor = small ? { x: c.x + c.w / 2, y: c.y + c.h / 2 } : { x: c.gate.x + c.gate.w / 2, y: c.y + c.h + 220 };
      for (let k = 0; k < 8; k++) {
        const p = { x: anchor.x + (randomWorld() - 0.5) * (small ? 360 : 700), y: anchor.y + (randomWorld() - 0.5) * (small ? 400 : 360) };
        if (!walkable(MAP, p.x, p.y)) continue;
        const path = findPath(MAP, center(st), p);
        if (path) { st.walk = { path: path.slice(0, -1), k: 0, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; st.task = "play"; return; }
      }
      return muse(st, 30);
    }
    case "help": return st.carry ? go(st, "taoHouse", "store") : go(st, "hemp", "help");   // a half-grown child cuts hemp and brings it home
    case "reed": return gatherTurn(st, "reed");
    case "wood": return gatherTurn(st, "log");
    case "stone": return gatherTurn(st, "stone");
    case "build": return builderTurn(st);
  }
}
// ---------------------------------------------------------------------------
// Minds: the farmer and the gatherers weigh what the village is short of (npc-mind.js) and say why.
// ---------------------------------------------------------------------------
const yearNo = () => Math.floor((day() - 1) / (DAYS_PER_SEASON * 4));
const homePile = () => allStacks().find((s) => s.store);
const yardChests = () => boards.world.filter((s) => s.cards[0].key === "chest" && inYard(center(s)));
const pileCount = (k) => (homePile()?.cards.filter((c) => c.key === k).length ?? 0) + yardChests().reduce((n, s) => n + s.cards[0].items.filter((x) => x === k || (k === "wood" && x === "log")).length, 0);
const hoeReach = (st) => kitHas(st, "hoe") || boards.world.some((s) => isField(s) && toolAt(s, "hoe"));
const headcount = () => npcs().length + 1;
function think(st, choice) {
  const n = st.npc;
  if (!choice) return;
  const fresh = n.mind?.id !== choice.id;
  n.mind = { id: choice.id, because: choice.because, day: day() };
  if (fresh && choice.id !== "rest" && heard(st, 520) && randomVoice() < 0.3) say(st, `“${choice.because}。”`);   // said aloud, if you're close by
}
/** Something that can't wait for a half-made tool: the stove going out, the pot empty, the hearth cold, a foundation short. */
function urgentJob(st) {
  const job = st.ctl?.mode === "work" && st.ctl.job ? st.ctl.job : st.npc.job, stove = find("stove")?.cards[0], fire = find("fire")?.cards[0];
  if (job === "cook") return (stove?.fuel ?? 6) <= 1 || (stove?.stock ?? 6) < 2;
  if (job === "fish") return (stove?.stock ?? 6) < 2;
  const m = { wood: "log", stone: "stone", reed: "reed" }[job];
  return Boolean(m && ((fire?.fuel ?? 6) <= 1 || plotNeeding(m)));
}
/** Asked what they're about: a friend tells you; someone who hardly knows you brushes it off. */
function tellPlan(st) {
  const m = st.npc.mind, h = hearts(soc(st.npc));
  if (h < 0.5) return say(st, pickLine(["“忙呗。”", "“干活呗。”", "“问这个干啥？”"]));
  if (!m || m.day < day() - 1) return say(st, "“还没想好，走一步看一步。”");
  say(st, `“${m.because}。”`);
}
// ---- Building, by those who know how ----
/** How well a villager knows how to put this up: 1 for an old hand, a little for whoever just thought of it. */
function npcSkill(st, kind) {
  const n = st.npc, b = BUILDS[kind];
  if (n.skill?.[kind] !== undefined) return n.skill[kind];
  if (!b.who.includes(n.key)) return 0;
  return b.inv && lore.inventions[b.inv]?.by === n.key ? 0.4 : 1;
}
/** A foundation this villager can work on today: lead it if they know how, or lend a hand where someone has been leading. */
function readyPlot(st, lead) {
  return boards.world.find((s) => {
    const c = s.cards[0];
    if (c.key !== "plot" || Object.values(c.need).some((v) => v > 0) || stepBlocked(c, st)) return false;
    if (st.npc.cantBuild?.id === s.id && st.npc.cantBuild.day === day()) return false;
    return lead ? npcSkill(st, c.build) >= LEAD : c.ledDay === day();
  }) ?? null;
}
function npcBuild(st, target) {
  const c = target.cards[0], kind = c.build, g = stageOf(c), n = st.npc;
  if (Object.values(c.need).some((v) => v > 0)) return;
  const blocked = stepBlocked(c, st);
  if (blocked) { if (heard(st, 600)) say(st, `“${blocked}。”`); return; }
  const skill = npcSkill(st, kind);
  let res = buildSession(skill, randomWorld);
  if (res.unable) {
    if (c.ledDay !== day()) { n.cantBuild = { id: target.id, day: day() }; if (heard(st, 600)) say(st, "“这个我不会弄，等会的人来了，我给打下手。”"); return; }
    res = { ...helpSession(), failed: false };
  } else c.ledDay = day();
  const after = raiseSkill(skill, res.gain);
  (n.skill ??= {})[kind] = after;
  if (skill < LEAD && after >= LEAD && !BUILDS[kind].who.includes(n.key)) {
    BUILDS[kind].who.push(n.key);
    float(`${nameOf(st)}学会了${craftName(kind)}`, center(target), "world"); chronicle(`${nameOf(st)}跟着干了几回，学会了${craftName(kind)}。`);
  }
  if (res.failed) float(`${nameOf(st)}：${g.name}没弄好，拆了重来`, center(target), "world");
  progressPlot(target, res.minutes, st);
}
/** The "build" job: lead or help where a step is ready, else fetch what a step is short of. */
function builderTurn(st) {
  if (st.carry) { const p = plotNeeding(st.carry.key); return p ? go(st, "plot", "supply", null, p) : go(st, "taoHouse", "store"); }
  const ready = readyPlot(st, true) ?? readyPlot(st, false);
  if (ready) { think(st, { id: "build", because: npcSkill(st, ready.cards[0].build) >= LEAD ? "地基上的料齐了，去盖" : "那边在盖，过去搭把手" }); return go(st, "plot", "build", null, ready); }
  for (const p of boards.world.filter((q) => q.cards[0].key === "plot")) {
    for (const [k, v] of Object.entries(p.cards[0].need)) if (v > 0 && GATHER[k]) { think(st, { id: `supply-${k}`, because: `${stageOf(p.cards[0]).name}还缺${DEFS[k].name}，去弄` }); if (supplyFor(st, k, p)) return; }
  }
  think(st, { id: "rest", because: "没有能盖的，歇会儿" });
  return muse(st, 60 + randomWorld() * 60);
}
/** Bring one material to a foundation: what's in hand, else from home, else go and get it. */
function supplyFor(st, k, plot) {
  if (st.carry?.key === k || st.cards.some((c, j) => j > 0 && c.key === k)) { go(st, "plot", "supply", null, plot); return true; }
  if (pileCount(k)) { fetchFromHome(st, k, plot.cards[0].need[k]); return true; }
  if (GATHER[k]) { gatherAt(st, k, true); return true; }
  return false;
}
// ---- Ideas: whoever thought of something tries it out themselves ----
const GUARDS = ["scarecrow", "fence"], STASH = ["smokedFish", "smokedMeat"];
function ideaFor(st) {
  const key = st.npc.key, mine = (id) => lore.inventions[id]?.by === key;
  const started = boards.world.find((s) => s.cards[0].key === "plot" && s.cards[0].by === key);     // one thing at a time: finish what was begun
  if (started) return stepBlocked(started.cards[0], st) ? null : { kind: started.cards[0].build, plot: started };
  for (const [kind, b] of Object.entries(BUILDS)) {
    if (!b.inv || !mine(b.inv)) continue;
    const plot = boards.world.find((s) => s.cards[0].key === "plot" && s.cards[0].build === kind);
    if (plot) return stepBlocked(plot.cards[0], st) ? null : { kind, plot };
    if (!find(kind) && !(BUILD_STAGES[kind][0].thaw && season() === "冬")) return { kind };   // nothing to dig in frozen ground
  }
  for (const id of GUARDS) {
    if (!mine(id) || st.plans?.length || clock.min < (st.npc.planBlocked ?? 0)) continue;
    const bare = boards.world.filter(isField).some((s) => !GUARDS.some((g) => toolAt(s, g)));
    const carried = npcs().some((q) => q.cards.some((c) => GUARDS.includes(c.key)));
    if (bare && !carried) return { craft: id };
  }
  return null;
}
/** Beds: someone sleeping on the floor ties themselves one when nothing's more pressing; while the village is short of
 *  beds, others lend a hand — but no more of them at it than there are beds wanting. */
function bedChore(st, choice) {
  if (st.plans?.length || clock.min < (st.npc.planBlocked ?? 0) || littleOne(st)) return false;
  const plan = bedPlan(), mine = plan.get(st), short = [...plan.values()].filter((b) => b === null).length;
  const busy = npcs().filter((q) => q.plans?.some((p) => p.r?.id === "bed")).length;
  const urgency = mine === null ? 6.8 : short > busy ? 4.8 : 0;
  if (!urgency || (choice?.score ?? 0) >= urgency) return false;
  think(st, { id: "make-bed", because: mine === null ? "夜里没地方睡，得给自己扎个铺位" : "村里铺位不够，帮着扎一个" });
  st.plans = [{ r: recipeFor("bed") }];
  planStep(st);
  return true;
}
/** Only when nothing more pressing is on: an idea is tried out between the real work. */
function tryIdeaIfFree(st, choice) {
  if ((choice?.score ?? 0) >= 6) return false;
  const idea = ideaFor(st);
  if (!idea) return false;
  const name = DEFS[idea.kind ?? idea.craft].name;
  if (idea.craft) { think(st, { id: `idea-${idea.craft}`, because: `扎个${name}立到田里试试` }); st.plans = [{ r: recipeFor(idea.craft) }]; planStep(st); return true; }
  let plot = idea.plot;
  if (!plot) {
    const p = spotFor(idea.kind);
    if (!p) return false;
    plot = layFoundation(idea.kind, p); plot.cards[0].by = st.npc.key;
    float(`${nameOf(st)}想试着弄个${name}`, p, "world"); chronicle(`${nameOf(st)}动手试着弄${name}。`);
  }
  think(st, { id: `idea-${idea.kind}`, because: `想试着弄个${name}` });
  const c = plot.cards[0], need = Object.entries(c.need).find(([, v]) => v > 0)?.[0];
  if (!need) { if (stepBlocked(c, st)) return false; go(st, "plot", "build", null, plot); return true; }
  return supplyFor(st, need, plot);
}
/** Somewhere for a new building: the chest has its own corner of the yard; a compost pit goes by the fields, the rest
 *  just outside the yard — never on the wall, never in the yard's aisle. */
function spotFor(kind) {
  const b = BUILDS[kind], yard = MAP.house, field = boards.world.find(isField), [w, h] = TIERS[b.tier];
  if (b.yard && yard) {
    const f = yardFurnishing(kind, yard), p = { x: f.x + w / 2, y: f.y + h / 2 };
    return boards.world.some((s) => !s.npc && !s.pet && !s.critter && Math.abs(s.x - f.x) < w && Math.abs(s.y - f.y) < h) ? null : p;
  }
  const anchor = kind === "compost" && field ? center(field) : yard ? { x: yard.x + yard.w + 170, y: yard.y + yard.h - 120 } : MAP.sites.home;
  for (let ring = 0; ring <= 5; ring++) for (let k = 0; k < (ring ? 12 : 1); k++) {
    const a = (k / 12) * Math.PI * 2, p = { x: anchor.x + Math.cos(a) * 170 * ring, y: anchor.y + Math.sin(a) * 150 * ring };
    if (!inJungle(p) && !foundationProblem(kind, p) && !rectHitsYard(p.x - w / 2, p.y - h / 2, w, h) && !beforeGate(p.x - w / 2, p.y - h / 2, w, h)) return p;
  }
  return null;
}
/** Old saves: anything built (or begun) astride the yard wall, or a foundation in the gateway, is moved — a chest to its corner, the rest outside. */
function settleMisplaced() {
  for (const st of boards.world) {
    const c = st.cards[0], kind = c.key === "plot" ? c.build : c.key;
    if (!BUILDS[kind] || kind === "farm") continue;
    const astride = rectHitsYard(st.x, st.y, st.w, st.h) && !rectInYard(st.x, st.y, st.w, st.h);
    if (!astride && !(c.key === "plot" && beforeGate(st.x, st.y, st.w, st.h))) continue;
    const p = spotFor(kind);
    if (p) { st.x = p.x - st.w / 2; st.y = p.y - st.h / 2; }
  }
}
/** Holding a scarecrow or fence: it goes on a field that has neither. */
function placeGuard(st) {
  const item = st.cards.find((c, j) => j > 0 && GUARDS.includes(c.key));
  if (!item) return false;
  const f = boards.world.filter(isField).find((s) => !GUARDS.some((g) => toolAt(s, g)));
  if (!f) return false;
  go(st, f.cards[0].key, "place", item.key, f);
  return true;
}
const stashFood = (st) => (st.cards.some((c, j) => j > 0 && STASH.includes(c.key)) ? (go(st, "taoHouse", "stash"), true) : false);
// ---- The cook and the fisher ----
function cookTurn(st) {
  const g = find("granary").cards[0], s = find("stove").cards[0];
  if (st.carry?.key === "log") return go(st, "stove", "stoke");
  if (st.carry?.key === "grain" && (s.fuel ?? 0) <= 0) {          // grain in hand and the stove out
    if (fuelIn(st)) return go(st, "stove", "stoke");
    if (pileCount("wood") + pileCount("log")) return fetchFromHome(st, "wood", 2);
    return go(st, "granary", "drop");                               // put it back, and go for wood
  }
  if (st.carry) return go(st, "stove", st.carry.key === "fish" ? "give" : "cook");
  if (stashFood(st)) return;
  const choice = cookProject({
    season: season(), stove: s.stock ?? 0, stoveFuel: s.fuel ?? 0, grain: g.stock ?? 0, reserve: seedReserve(), lake: find("lake")?.cards[0].stock ?? 0,
    wood: pileCount("wood") + pileCount("log") + (fuelIn(st) ? 1 : 0), smoking: Boolean(lore.inventions.smoking), smoked: pileCount("smokedFish"), people: headcount(),
  });
  think(st, choice);
  if (placeGuard(st) || bedChore(st, choice) || tryIdeaIfFree(st, choice)) return;
  switch (choice?.id) {
    case "fuel-stove": return fuelIn(st) ? go(st, "stove", "stoke") : pileCount("wood") ? fetchFromHome(st, "wood", 2) : gatherAt(st, "log", true);
    case "cook": return go(st, "granary", "fetch");
    case "fish": return go(st, "lake", "fish");
    case "smoke": if (!st.plans?.length) st.plans = [{ r: recipeFor("smoke") }]; return planStep(st);
  }
  return randomWorld() < 0.5 ? go(st, "granary", "tidy") : muse(st, 40 + randomWorld() * 50);
}
function fishTurn(st) {
  if (st.carry?.key === "fish") return go(st, "stove", "give");
  if (st.carry?.key === "grain") return go(st, "granary", "drop");
  if (st.carry?.key === "log" && lowFire()) return go(st, lowFire().cards[0].key, "stoke", null, lowFire());
  if (st.carry) return go(st, "taoHouse", "store");
  if (stashFood(st)) return;
  const ripe = boards.world.filter((q) => isField(q) && q.cards[0].sown !== false && (q.cards[0].stock ?? 0) >= 1);
  const choice = fisherProject({
    season: season(), lake: find("lake")?.cards[0].stock ?? 0, stove: find("stove")?.cards[0].stock ?? 0, grain: find("granary")?.cards[0].stock ?? 0,
    people: headcount(), ripe: ripe.length, smoking: Boolean(lore.inventions.smoking), smoked: pileCount("smokedFish"),
    fireFuel: find("fire")?.cards[0].fuel ?? 6, stoveFuel: find("stove")?.cards[0].fuel ?? 6,
  });
  think(st, choice);
  if (placeGuard(st) || bedChore(st, choice) || tryIdeaIfFree(st, choice)) return;
  switch (choice?.id) {
    case "fish": return go(st, "lake", "fish");
    case "help-harvest": return go(st, ripe[0].cards[0].key, "harvest", null, ripe[0]);
    case "firewood": if (firewoodRun(st)) return; break;
    case "smoke": if (!st.plans?.length) st.plans = [{ r: recipeFor("smoke") }]; return planStep(st);
  }
  return season() === "冬" ? go(st, "fire", "watch") : muse(st, 60 + randomWorld() * 60);
}
function fetchFromHome(st, k, n = 1) { go(st, "taoHouse", "fetchHome", k); st.wantN = Math.max(1, Math.min(4, n)); }
/** Somewhere to break new ground: open meadow right beside the fields already there. */
function farmSpot() {
  const home = MAP.sites.home, fields = boards.world.filter(isField).map(center);
  const anchors = fields.length ? fields : [home];
  let best = null, bd = Infinity;
  for (const a of anchors) for (let ring = 1; ring <= 3; ring++) for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2, p = { x: a.x + Math.cos(ang) * 260 * ring, y: a.y + Math.sin(ang) * 230 * ring };
    if (inJungle(p) || foundationProblem("farm", p)) continue;
    const d = ring * 400 + dist(p, home) / 10;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function farmerTurn(st) {
  const n = st.npc, fieldStacks = boards.world.filter(isField), plot = boards.world.find((s) => s.cards[0].key === "plot" && s.cards[0].build === "farm");
  const choice = farmerProject({
    season: season(), people: headcount(), year: yearNo(),
    fields: fieldStacks.map((s) => { const c = s.cards[0]; return { id: c.id, soil: soilOf(c), sown: c.sown, stock: c.stock, fallow: c.fallow, manured: c.manured, watered: c.tendDay === day() }; }),
    grain: find("granary")?.cards[0].stock ?? 0, cooked: find("stove")?.cards[0].stock ?? 0,
    beans: pileCount("bean") + (holds(st, "bean") ? 1 : 0),
    ash: pileCount("ash") + pileCount("muck") + (holds(st, "ash") || holds(st, "muck") ? 1 : 0),
    hoe: hoeReach(st), farmPlot: plot ? (plot.cards[0].stage ? "till" : "clear") : false, seed: holds(st, "grain") ? 1 : 0,
    dry: nature.dryDays >= 2, jar: holds(st, "jar") || pileCount("jar") > 0, build: Boolean(readyPlot(st, true)),
    fireFuel: find("fire")?.cards[0].fuel ?? 6, stoveFuel: find("stove")?.cards[0].fuel ?? 6, logs: pileCount("log") + pileCount("wood"),
  });
  if ((n.landBlocked ?? -1) === day() && choice?.id === "open-land") choice.id = "rest";
  think(st, choice);
  if (placeGuard(st) || bedChore(st, choice) || tryIdeaIfFree(st, choice)) return;
  const field = fieldStacks.find((s) => s.cards[0].id === choice?.field), key = field?.cards[0].key;
  switch (choice?.id) {
    case "harvest": return go(st, key, "harvest", null, field);
    case "sow-bean": return holds(st, "bean") ? go(st, key, "sow", "bean", field) : fetchFromHome(st, "bean");
    case "fallow": field.cards[0].fallow = true; refreshStock(field.cards[0]); float(`${nameOf(st)}：这块地今年歇着`, center(field), "world"); return muse(st, 20);
    case "sow": return holds(st, "grain") ? go(st, key, "sow", "grain", field) : go(st, "granary", "seed");
    case "work-plot": return go(st, "plot", "build", null, plot);
    case "manure": return holds(st, "ash") || holds(st, "muck") ? go(st, key, "manure", null, field) : fetchFromHome(st, pileCount("muck") ? "muck" : "ash");
    case "water": return holds(st, "jar") ? go(st, key, "water", null, field) : fetchFromHome(st, "jar");
    case "build": return go(st, "plot", "build", null, readyPlot(st, true));
    case "open-land": {
      const p = farmSpot();
      if (!p) { n.landBlocked = day(); return muse(st, 30); }
      const lot = layFoundation("farm", p);
      float(`${nameOf(st)}在这儿开荒`, p, "world");
      return go(st, "plot", "build", null, lot);
    }
    case "tend": return go(st, key, "tend", null, field);
    case "firewood": if (firewoodRun(st)) return; break;
    case "winter-wood": if (st.carry) return go(st, "taoHouse", "store"); gatherAt(st, "log"); return;
    case "help-fish": if (aidVillage(st)) return; break;
  }
  return season() === "冬" ? go(st, "fire", "watch") : muse(st, 60 + randomWorld() * 60);
}
const GATHER = { log: { task: "chop" }, stone: { task: "pick", src: "mineFace" }, reed: { task: "cut", src: "reeds" }, clay: { task: "dig", src: "pit" } };
const groves = () => boards.world.filter((s) => ["chestnut", "pineGrove"].includes(s.cards[0].key) && !inJungle(center(s)));
/** Go and get one more load: the fullest grove (never felling the last tree), the mine, the reed bed while there's old reed. */
function gatherAt(st, m, urgent = false) {
  if (m === "log") {
    const g = pickGrove(groves().map((s) => ({ stock: s.cards[0].stock, s })), urgent)?.s;
    if (!g) { think(st, { id: "no-trees", because: "近处的林子都砍得差不多了，等它长长" }); return muse(st, 90); }
    return go(st, g.cards[0].key, "chop", null, g);
  }
  if (m === "reed" && !(find("reeds")?.cards[0].stock > 2)) return muse(st, 60 + randomWorld() * 60);   // leave the young reed
  return go(st, GATHER[m].src, GATHER[m].task);
}
function plotNeeding(m) {
  return boards.world.filter((s) => s.cards[0].key === "plot" && (s.cards[0].need?.[m] ?? 0) > 0).sort((a, b) => dist(center(a), MAP.sites.home) - dist(center(b), MAP.sites.home))[0];
}
const fuelIn = (st) => (st.plans?.length ? null : st.cards.find((c, j) => j > 0 && (c.key === "wood" || c.key === "log")));   // what a plan needs isn't firewood
function gatherTurn(st, m) {
  const plot = plotNeeding(m), fire = find("fire")?.cards[0], stumps = groves().filter((s) => s.cards[0].cutBare && (s.cards[0].stock ?? 0) <= 0);
  const choice = gathererProject({
    material: m, season: season(), pile: pileCount(m), plotNeed: plot?.cards[0].need[m] ?? 0, fireFuel: fire?.fuel ?? 6,
    wood: pileCount("wood") + pileCount("log") + (fuelIn(st) ? 1 : 0), felled: nature.felled ?? 0, stumps: stumps.length,
    people: headcount(), grain: find("granary")?.cards[0].stock ?? 0, cooked: find("stove")?.cards[0].stock ?? 0,
    build: Boolean(readyPlot(st, true)), help: Boolean(readyPlot(st, false)),
  });
  think(st, choice);
  if (placeGuard(st) || bedChore(st, choice) || tryIdeaIfFree(st, choice)) return;
  const has = st.carry?.key === m || st.cards.some((c, j) => j > 0 && c.key === m);
  switch (choice?.id) {
    case "supply-plot":
      if (has) return go(st, "plot", "supply", null, plot);
      if (pileCount(m)) return fetchFromHome(st, m, plot.cards[0].need[m]);
      return gatherAt(st, m, true);
    case "feed-fire":
      if (fuelIn(st) || st.carry?.key === "log") return go(st, "fire", "stoke");
      if (pileCount("wood") + pileCount("log")) return fetchFromHome(st, "wood", 2);
      return gatherAt(st, "log", true);
    case "replant": return go(st, stumps[0].cards[0].key, "plant", null, stumps[0]);
    case "build": return go(st, "plot", "build", null, readyPlot(st, true));
    case "help-build": return go(st, "plot", "build", null, readyPlot(st, false));
    case "stockpile": return st.carry ? go(st, "taoHouse", "store") : gatherAt(st, m);
    case "help-fish": if (st.carry) return go(st, "taoHouse", "store"); if (aidVillage(st)) return; break;
  }
  if (st.carry) return go(st, "taoHouse", "store");
  return muse(st, 60 + randomWorld() * 60);
}
/** Hand what they carry (or fetched from home) in at a foundation; anything over goes on carrying, for home. */
function supplyPlot(st, target) {
  const c = target.cards[0];
  let given = 0;
  if (st.carry) {
    const { cards, n } = carriedLoad(st), key = st.carry.key, k = Math.min(n, c.need[key] ?? 0);
    c.need[key] = (c.need[key] ?? 0) - k; given += k;
    st.cards = st.cards.filter((x) => !cards.includes(x)); cards.forEach((x) => x.el.remove()); st.carry = null;
    if (n - k > 0) carry(st, key, n - k, 1);
  }
  for (const x of st.cards.slice(1)) if (DEFS[x.key].type !== "tool" && (c.need[x.key] ?? 0) > 0) { c.need[x.key]--; given++; x.el.remove(); st.cards = st.cards.filter((y) => y !== x); }
  refreshPlot(c);
  if (given) float(`${nameOf(st)}送来 ${given} 份材料`, center(target), "world");
}
/** Put wood on a fire till it's full: a log split up burns two days, a bundle of firewood one. What's left is carried on. */
function stoke(st, target) {
  const t = target.cards[0], before = t.fuel ?? 0;
  if (st.carry?.key === "log") {
    const { cards, n } = carriedLoad(st);
    let used = 0;
    while (used < n && (t.fuel ?? 0) < 6) { t.fuel = Math.min(6, (t.fuel ?? 0) + 2); used++; }
    st.cards = st.cards.filter((x) => !cards.includes(x)); cards.forEach((x) => x.el.remove()); st.carry = null;
    if (n - used > 0) carry(st, "log", n - used, 1);
  }
  for (let x = fuelIn(st); x && (t.fuel ?? 0) < 6; x = fuelIn(st)) { st.cards = st.cards.filter((y) => y !== x); x.el.remove(); t.fuel = Math.min(6, (t.fuel ?? 0) + (x.key === "log" ? 2 : 1)); }
  if ((t.fuel ?? 0) > before) float(`${nameOf(st)}添了柴，火旺起来了`, center(target), "world");
}
/** The hearth or the stove, whichever is lower, if it's about out. */
function lowFire() {
  const f = [find("fire"), find("stove")].filter(Boolean).sort((a, b) => (a.cards[0].fuel ?? 0) - (b.cards[0].fuel ?? 0))[0];
  return f && (f.cards[0].fuel ?? 0) <= 1 ? f : null;
}
/** A turn at the firewood: wood in hand onto the fire, else from home, else from the woods. */
function firewoodRun(st) {
  const f = lowFire();
  if (!f) return false;
  if (fuelIn(st) || st.carry?.key === "log") { go(st, f.cards[0].key, "stoke", null, f); return true; }
  if (pileCount("wood") + pileCount("log")) { fetchFromHome(st, "wood", 2); return true; }
  gatherAt(st, "log");
  return true;
}
/** Evening: deliver what they are carrying, then go and sit by the fire in the yard. */
function headHome(st) {
  endMuse(st);
  if (st.carry?.key === "grain") return go(st, "granary", "drop");
  if (st.carry?.key === "fish") return go(st, "stove", "give");
  if ((st.carry?.key === "log" || fuelIn(st)) && (find("fire")?.cards[0].fuel ?? 6) <= 2 && !plotNeeding("log")) return go(st, "fire", "stoke");   // home with wood and the hearth low: on it goes
  const f = festivalToday();
  if (f && !village.festDone[festKey(f)]) return go(st, "stove", "feast");   // a festival: everyone gathers at the stove
  return go(st, "fire", "evening");
}
function endMuse(st) { if (st.musing) { st.musing = false; st.cards[0].el.classList.remove("musing"); } }
function go(st, key, task, want, stack) {
  st.want = want; endMuse(st);
  if (stack) {                                                   // a particular one (this field, not just any field)
    if (!boards.world.includes(stack)) { st.goal = ""; st.task = ""; st.npc.wait = 60; return; }
    const path = route(st, stack);
    if (path === null) { st.goal = ""; st.task = ""; st.npc.wait = 60; return; }
    st.goalStack = stack; st.parkedAt = null; st.walk = { target: stack, path, k: 0 }; st.task = task; st.goal = key; intent(st, DEFS[key].icon);
    return;
  }
  // a source with something left in it, if there are several (two groves of chestnuts)
  const ok = (s) => s.cards[0].key === key && (s.cards[0].stock === undefined || s.cards[0].stock > 0) && !inJungle(center(s)) && !flooded(key);
  const near = (a, b) => dist(center(a), center(st)) - dist(center(b), center(st));
  const target = boards.world.filter(ok).sort(near)[0] ??
    (flooded(key) || naturalSource(key) ? null : boards.world.find((s) => s.cards[0].key === key && !inJungle(center(s))) ?? find(key));
  if (!target) { st.goal = ""; st.task = ""; st.goalStack = null; st.npc.wait = 120; return; }   // nothing left to go to
  st.goalStack = target; st.parkedAt = null;
  const path = route(st, target);
  if (path === null) { st.goal = ""; st.task = ""; st.npc.wait = 60; return; }   // no way round the water: wait and retry
  st.walk = { target, path, k: 0 };
  st.task = task; st.goal = key; intent(st, DEFS[key].icon);
}
const JOBS = { eat: 30, wait: 60, tend: 180, harvest: 150, dig: 90, drop: 15, fetch: 20, cook: 120, watch: 90, fish: 120, give: 15, evening: 100, chop: 150, pick: 60, store: 15, gather: 90, fetchHome: 15, jarIn: 15, build: 240, sow: 60, seed: 15, hide: 90, forage: 40, tidy: 60, cut: 90, arrive: 20, feast: 120, shelter: 90, play: 40, help: 80, trade: 300, supply: 15, stoke: 10, plant: 120, manure: 40, water: 40, place: 20, stash: 10 };
// What they say as they set to a task (now and then, not every time).
const TOPIC = { sow: "sow", tend: "tend", harvest: "harvest", cook: "cook", fetch: "cook", fish: "fish", cut: "cut", pick: "pick" };
function npcArrive(st) {
  if (st.task === "sleep") { const t = st.goalStack; if (t) { st.slot = standOn(st, t).slot; st.parkedAt = t; } return goInside(st); }   // keep their own place on the bed
  if (!st.task) return;                 // just stepping out of the door
  const t = st.goalStack;
  if (t && !boards.world.includes(t)) { finishFoodStep(st, st.task, false); st.goal = ""; st.task = ""; st.goalStack = null; st.npc.wait = 60; return; }
  if (t) { st.slot = standOn(st, t).slot; st.parkedAt = t; }
  let min = JOBS[st.task] ?? 30;
  if (st.task === "craft") min = st.plans.at(-1).r.min;
  if ((st.task === "chop" || (st.task === "gather" && st.want === "log")) && hasTool(st, t, "axe")) min *= 0.6;   // an axe makes short work of it
  if (st.task === "fish" && hasTool(st, t, "net")) min *= 0.75;
  if (st.task === "pick" && hasTool(st, t, "hammer")) min *= 0.6;
  if (!RESTFUL.has(st.task)) {
    min *= moodPace(st.npc.mood ?? 6) * (clock.min < (st.npc.sickUntil ?? 0) ? 1.5 : 1);
    if (st.npc.workDay !== day()) { st.npc.workDay = day(); st.npc.workMin = 0; }
    st.npc.workMin += min;
  }
  st.job = { npcTask: st.task, left: min, total: min };
  const n = st.npc, topic = TOPIC[st.task];
  if (topic && randomVoice() < 0.3 && heard(st)) say(st, VOICE.line(n.key, topic));
  if (st.task === "fetch" && find("granary").cards[0].stock <= 4 && n.grumbled !== day() && heard(st)) { n.grumbled = day(); say(st, VOICE.line(n.key, "lowFood")); }
}
function npcDone(st) {
  const target = st.goalStack ?? find(st.goal), task = st.task;
  if (!target?.cards?.length || !boards[target.board]?.includes(target)) {
    finishFoodStep(st, task, false);
    st.goal = ""; st.task = ""; st.goalStack = null; st.job = null;
    return;
  }
  const t = target.cards[0];
  st.goal = ""; st.lastTask = task; intent(st, "");
  let foodSuccess = false;
  if (task === "eat" || task === "forage") {
    foodSuccess = Boolean(commitProduction(st, target, { kind: task, cost: 1 }));
    if (foodSuccess) {
      st.npc.hunger = task === "eat" ? 0 : Math.max(0, st.npc.hunger - 5);
      if (task === "eat" && (t.fuel ?? 0) > 0) st.npc.ateHot = day();
      if (task === "forage") float("摘了把野果垫肚子", center(target), "world");
    }
  }
  if (task === "tend" && t.sown !== false) { t.tendDay = day(); const hoe = hasTool(st, target, "hoe"); t.stock = Math.min(3, (t.stock ?? 0) + (hoe ? 2 : 1)); if (hoe) wearAny(st, target, "hoe"); refreshStock(t); groundChanged(); t.el.querySelector(".card-art").innerHTML = iconFor(t.stock >= 3 ? "fieldRipe" : "field"); }
  if (task === "seed") commitProduction(st, target, { kind: "fetch-seed", cost: 1, output: ["grain"] });
  if (task === "sow" && commitProduction(st, target, { kind: "sow", use: [st.want === "bean" && holds(st, "bean") ? "bean" : "grain"] })) groundChanged();
  if (task === "harvest" && !finishHarvest(st, target)) return;
  if (task === "dig" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "clay", 1); }
  if (task === "fetch" && t.stock > seedReserve()) {
    foodSuccess = Boolean(commitProduction(st, target, { kind: "fetch-grain", cost: 1, output: ["grain"] }, { load: true }));
  }
  if (task === "fish") {
    const net = hasTool(st, target, "net");
    foodSuccess = Boolean(commitProduction(st, target, { kind: "gather", cost: 1, output: net ? ["fish", "fish"] : ["fish"] }, { load: true }));
    if (foodSuccess && net) wearAny(st, target, "net");
  }
  if (task === "chop" && t.stock > 0) {                         // a load of two, three with an axe — never the last tree if it can be helped
    const axe = hasTool(st, target, "axe"), n = Math.max(1, Math.min(t.stock - 1, axe ? 3 : 2));
    t.stock -= n; markCut(t); refreshStock(t); carry(st, "log", n, 1); if (axe) wearAny(st, target, "axe");
  }
  if (task === "gather" && t.stock > 0) { t.stock--; markCut(t); refreshStock(t); addCard(st, st.want === "wood" ? "log" : st.want); if (st.want === "log" && hasTool(st, target, "axe")) wearAny(st, target, "axe"); }
  if (task === "fetchHome") for (let k = 0; k < (st.wantN ?? 1); k++) {
    const pile = allStacks().find((s) => s.store), c = pile?.cards.find((x) => x.key === st.want || (st.want === "wood" && x.key === "log"));
    if (c) { pile.cards = pile.cards.filter((x) => x !== c); if (!pile.cards.length) removeStack(pile); cardsLayer.append(c.el); st.cards.push(c); continue; }
    const box = yardChests().find((s) => s.cards[0].items.some((x) => x === st.want || (st.want === "wood" && x === "log")));
    if (!box) break;
    const items = box.cards[0].items, i = items.findIndex((x) => x === st.want || (st.want === "wood" && x === "log"));
    addCard(st, items.splice(i, 1)[0]);
  }
  if (task === "fetchHome") st.wantN = 1;
  if (task === "craft") craftDone(st, target);
  if (task === "jarIn") { const i = st.cards.findIndex((c, j) => j > 0 && c.key === "jar"); if (i > 0) { st.cards[i].el.remove(); st.cards.splice(i, 1); t.jars = (t.jars ?? 0) + 1; refreshStock(t); float(`公仓多了只陶罐，能存 ${granaryCap(t)} 份`, center(target), "world"); } st.plans = []; }
  if (task === "build" && t.key === "plot") npcBuild(st, target);
  if (task === "water" && isField(target) && holds(st, "jar")) { t.tendDay = day(); float(`${nameOf(st)}挑水浇了地`, center(target), "world"); }
  if (task === "place") {
    const c = st.cards.find((x, j) => j > 0 && x.key === st.want);
    if (c && isField(target) && !GUARDS.some((g) => toolAt(target, g))) { st.cards = st.cards.filter((y) => y !== c); target.cards.push(c); float(`${nameOf(st)}在田里立了${DEFS[c.key].name}`, center(target), "world"); }
  }
  if (task === "stash") { const items = st.cards.filter((c, j) => j > 0 && STASH.includes(c.key)); st.cards = st.cards.filter((c) => !items.includes(c)); storeHome(items); }
  if (task === "supply" && t.key === "plot") supplyPlot(st, target);
  if (task === "stoke") stoke(st, target);
  if (task === "plant" && (t.stock ?? 0) <= 0) {
    t.stock = 1; t.readyDay = day(); refreshStock(t); nature.felled = Math.max(0, (nature.felled ?? 0) - 2);
    float(`${nameOf(st)}补种了几棵小树`, center(target), "world");
    if (!nature.replanted) { nature.replanted = true; chronicle(`${nameOf(st)}在砍秃的林子里补种了树苗。`); }
  }
  if (task === "manure" && isField(target)) {
    const i = st.cards.findIndex((c, j) => j > 0 && c.key === "ash");
    const m = st.cards.findIndex((c, j) => j > 0 && c.key === "muck"), at = m > 0 ? m : i;
    if (at > 0 && t.manured !== yearNo()) { st.cards[at].el.remove(); st.cards.splice(at, 1); t.soil = Math.min(SOIL_MAX, soilOf(t) + (m > 0 ? 2 : 1)); t.manured = yearNo(); refreshStock(t); float(`${m > 0 ? "上了沤肥" : "撒了草木灰"}，地力 ${t.soil}`, center(target), "world"); }
  }
  if (task === "pick" && t.stock > 0) { t.stock--; refreshStock(t); const two = hasTool(st, target, "hammer"); carry(st, "stone", two ? 2 : 1, two ? 2 : 1); if (two) wearAny(st, target, "hammer"); }
  if (task === "store") storeCarry(st);
  if (task === "drop" || task === "give") foodSuccess = dropCarry(st, target);
  if (task === "arrive") welcome(st);
  if (task === "help" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "fiber", 1); }
  if (task === "cut" && t.stock > 0) { t.stock--; refreshStock(t); const two = hasTool(st, target, "knife"); carry(st, "reed", two ? 2 : 1, two ? 2 : 1); if (two) wearAny(st, target, "knife"); }
  if (task === "cook") {
    const { cards, n } = carriedLoad(st);
    if (st.carry?.key === "grain" && n > 0 && (t.fuel ?? 0) <= 0) float("灶里没火，煮不了", center(target), "world");
    else if (st.carry?.key === "grain" && n > 0) {
      foodSuccess = Boolean(commitProduction(st, target, { kind: "cook", cards, use: cards.map((c) => c.key), credit: n * 3 }, {
        clearLoad: true, details: { consumedUnits: n, addedUnits: n * 3, resource: "cooked-food" },
      }));
      if (foodSuccess) {
        float(`+${n * 3} 熟食`, center(target), "world");
        if (t.stock >= 6 && randomVoice() < 0.4 && heard(st)) say(st, VOICE.line(st.npc.key, "full"));
      }
    }
  }
  finishFoodStep(st, task, foodSuccess);
  // Only a physically completed shared task earns mutual trust; no background fake events.
  if (["tend", "harvest", "build"].includes(task) || (foodSuccess && ["cook", "fish"].includes(task))) {
    const partner = boards.world.find((q) => q !== st && q.npc && q.goalStack === target && q.job?.npcTask === task);
    if (partner) recordNpcCooperation(npcSocial, npcIdentity(st), npcIdentity(partner), day(), task);
  }
  deplete(t);
  // Not every waking hour is work: after a task they often stand a while, thinking about this and that.
  if (task === "evening") st.npc.wait = 60;
  else if (task !== "eat" && task !== "hide" && randomWorld() < 0.35) muse(st, 20 + randomWorld() * 50);
}
function carry(st, key, n = 1, cards = 1) {
  const made = Array.from({ length: cards }, () => addCard(st, key));
  st.carry = { key, n, ids: made.map((card) => card.id), packed: cards < n };
}

function carriedLoad(st) {
  const load = st.carry;
  if (!load || !Number.isInteger(load.n) || load.n < 1) return { cards: [], n: 0 };
  const held = st.cards.slice(1).filter((card) => card.key === load.key);
  // Older v1 saves used one representative card for an entire harvested grain load.
  const packed = load.packed ?? (!load.ids && load.key === "grain");
  const cards = load.ids ? held.filter((card) => load.ids.includes(card.id)) : held.slice(-(packed ? 1 : load.n));
  return { cards, n: packed && cards.length ? load.n : cards.length };
}

/** Deliver just this work load. Full granaries account for any spoiled surplus. */
function dropCarry(st, target) {
  const into = target.cards[0], { cards, n } = carriedLoad(st);
  if (!n) { st.carry = null; return false; }
  if (DEPOT[into.key] !== st.carry.key) { float("这儿不收这个", center(st), st.board); return false; }
  const add = into.key === "granary" ? Math.min(n, Math.max(0, granaryCap(into) - into.stock)) : n;
  const result = commitProduction(st, target, { kind: "deposit", cards, use: cards.map((c) => c.key), credit: add }, {
    clearLoad: true, details: { resource: st.carry.key, consumedUnits: n, addedUnits: add, discardedUnits: n - add },
  });
  if (!result) return false;
  if (n > add) float(`公仓满了，${n - add} 份粟放不下，糟蹋了`, center(target), "world");
  if (add) float(`+${add} ${DEFS[into.key].stockLabel}`, center(target), "world");
  return true;
}
/** The pile keeps like with like: one bundle per kind, in a fixed order. */
function sortPile(pile) {
  const order = Object.keys(DEFS);
  pile.cards.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
/** Things carried home go on a pile inside the yard, where you (and they) can pick them up. */
function storeHome(cards) {
  if (!cards.length) return;
  const house = find("taoHouse"), c = house?.compound;
  if (c) {
    cards.forEach((card) => { card.el.classList.remove("gone", "pop"); cardsLayer.append(card.el); });
    cards = cards.filter((card) => {                                  // materials go into a chest in the yard, if there's room
      if (DEFS[card.key].type !== "material") return true;
      const box = yardChests().find((s) => s.cards[0].items.length < CHEST_CAP);
      if (!box) return true;
      box.cards[0].items.push(card.key); card.el.remove(); return false;
    });
    if (!cards.length) return;
    const pile0 = allStacks().find((s) => s.store);
    const { x, y } = yardFurnishing("store", c);
    if (pile0) { pile0.cards.push(...cards); sortPile(pile0); } else newStack(cards, x, y, "world").store = true;
    return;
  }
  cards.forEach((card) => { card.el.classList.remove("gone", "pop"); roomWorld.append(card.el); });
  const pile = boards.tao.find((s) => s.store);
  if (pile) pile.cards.push(...cards); else newStack(cards, 900, 330, "tao").store = true;
}
function storeCarry(st) {
  const { cards, n } = carriedLoad(st);
  st.cards = st.cards.filter((c) => !cards.includes(c));
  const extra = Array.from({ length: n - cards.length }, () => newCard(st.carry.key));
  storeHome([...cards, ...extra]); st.carry = null;
  float("放回家了", center(st), st.board);
}
/** Before lying down: things in hand go on the pile in the yard, tools are hung up (they take them again in the morning). */
function stash(st) {
  const things = st.cards.slice(1).filter((c) => DEFS[c.key].type !== "tool"), tools = st.cards.slice(1).filter((c) => DEFS[c.key].type === "tool");
  const load = carriedLoad(st);
  const extra = Array.from({ length: load.n - load.cards.length }, () => newCard(st.carry.key));
  st.cards = [st.cards[0]]; st.carry = null;
  storeHome([...things, ...extra]);
  st.npc.kit = [...(st.npc.kit ?? []), ...tools];
  tools.forEach((c) => c.el.classList.add("hidden-kit"));
}
/** Lie down on a bed in the yard (or go into a house that is a room of its own). */
function goInside(st) {
  cancelJob(st); st.walk = null; st.task = ""; st.goal = ""; intent(st, ""); endMuse(st);
  stash(st);
  st.npc.inside = true; st.npc.outAt = 0; st.npc.wait = 0;
  st.bubble?.el.remove(); st.bubble = null;
  for (let i = talks.length - 1; i >= 0; i--) if (talks[i].st === st || talks[i].partnerId === st.id) talks.splice(i, 1);
  const home = find(st.npc.home, "world"); home?.cards[0].el.classList.add("occupied");
  const room = DEFS[st.npc.home].room;
  if (room) { removeStack(st); st.board = room; boards[room].push(st); st.x = 40 + st.npc.order * 125; st.y = 360; st.cards.forEach((c) => { roomWorld.append(c.el); c.el.classList.add("sleeping"); }); return; }
  st.cards.forEach((card) => card.el.classList.add("sleeping"));
}
/** Morning: get up off the bed, take up the tools, and walk out through the gate. */
function comeOut(st) {
  st.npc.inside = false; st.indoors = false;
  find(st.npc.home, "world")?.cards[0].el.classList.remove("occupied");
  const home = find(st.npc.home, "world"), c = home?.compound;
  if (st.board !== "world") { removeStack(st); st.board = "world"; boards.world.push(st); st.cards.forEach((x) => cardsLayer.append(x.el)); st.x = home.x + 10 + st.npc.order * 40; st.y = home.y + home.h + 16; }
  const kit = st.npc.kit ?? []; st.npc.kit = [];
  kit.forEach((t) => t.el.classList.remove("hidden-kit")); st.cards.push(...kit);
  st.cards.forEach((x) => x.el.classList.remove("sleeping"));
  st.task = ""; st.parkedAt = null;
  if (!inYard(center(st))) {                                             // slept in a hut: just step off it
    const out = { x: center(st).x + (randomWorld() - 0.5) * 120, y: center(st).y + 150 };
    if (!reachAlong(MAP, center(st), out).blocked) st.walk = { x: out.x - CARD_W / 2, y: out.y - CARD_H / 2 };
  } else if (c) {
    const out = { x: c.gate.x + c.gate.w / 2 + (randomWorld() - 0.5) * 80 + (st.npc.order - 0.5) * 90, y: c.y + c.h + 70 + randomWorld() * 50 };
    const path = findPath(MAP, center(st), out);
    if (path) st.walk = { path: path.slice(0, -1), k: 0, x: out.x - CARD_W / 2, y: out.y - CARD_H / 2 };
  }
  if (randomVoice() < 0.35 && heard(st)) say(st, randomVoice() < 0.5 ? VOICE.line(st.npc.key, "wake") : `（${DEFS[st.npc.key].name}${VOICE.gesture(st.npc.key)}）`);
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
let last = performance.now(), pendingMinutes = 0, lastDay = firstDay, lastSeason = SEASONS.indexOf(season());
const advanceTo = (target) => advanceClock(clock, target, tick);
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  try {
    if (clock.fast) {
      advanceTo(Math.min(clock.min + 26, clock.fast));
      if (clock.min >= clock.fast) clock.fast = 0;
    } else if (clock.speed) {
      const target = clock.min + pendingMinutes + dt * MIN_PER_SEC * clock.speed;
      advanceTo(target);
      pendingMinutes = target - clock.min;
    }
    render(now);
  } catch (err) { console.error(err); }
  if (sky.kind) skyDraw(dt);
  requestAnimationFrame(frame);
}
function tick(minutes, previousMinute) {
  updateTide();
  turnTick(minutes);
  while (weather.events.length && weather.events[0].at <= clock.min) { const e = weather.events.shift(); if (e.kind === "roll") { weather.hold = 0; rollWeather(); } else setWeather(e.kind, e.strength); }
  skyDrift(minutes);
  coldTick(minutes);
  burnTorch(minutes);
  autoYou();
  const you = youStack();
  if (you && !you.job && !you.walk && !you.travel && !you.lifted && !drag && me.food > 10) {
    me.rest = Math.min(100, me.rest + minutes * (inYard(center(you)) || board !== "world" ? 0.04 : 0.012));
  }
  me.food = Math.max(0, me.food - minutes * (you?.job && !you.job.r.nap ? 0.03 : 0.016));   // a full belly lasts you about three days
  talks.sort((a, b) => a.at - b.at);
  peopleTick(minutes);
  if (Math.floor(clock.min / 60) !== Math.floor(previousMinute / 60)) { climbLadder(); considerArrival(); considerTrader(); }   // hourly
  coastRaidTick(minutes, you);
  festivalTick();
  while (talks.length && talks[0].at <= clock.min) {
    const t = talks.shift(), partner = t.partnerId === undefined || awake(boards[t.st.board]?.find((st) => st.id === t.partnerId));
    if (boards.world.includes(t.st) && awake(t.st) && partner && heard(t.st)) say(t.st, t.text);
  }
  for (const st of [...allStacks()]) {
    if (st.lifted) continue;
    if (st.npc) {
      if (st.ctl?.mode !== "manual") brain(st, minutes);
      if (st.walk && stepWalk(st, minutes)) { const w = st.walk; st.walk = null; if (w.manual) manualArrive(st, w.target); else npcArrive(st); }
    } else if (st.pet && st.ctl?.mode !== "auto") {
      if (st.ctl.mode === "work" && !st.walk) dogWork(st);
      if (st.walk && stepWalk(st, minutes, 1.3)) { const w = st.walk; st.walk = null; if (!w.follow) dogArrive(st, w.target); }
    } else if (st.pet) {
      if (!st.walk && randomWorld() < minutes / 120) {
        const you = youStack();
        for (let k = 0; k < 6; k++) {
          const p = { x: st.pet.home.x + (randomWorld() - 0.5) * 360, y: st.pet.home.y + (randomWorld() - 0.5) * 220 };
          if (you && dist(p, center(you)) < 230) continue;         // never sit on your card
          if (allStacks().some((s) => s !== st && dist(p, center(s)) < 130)) continue;
          if (!reachAlong(MAP, center(st), p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
        }
      }
      if (st.walk && stepWalk(st, minutes, 0.6)) st.walk = null;
    } else if (st.critter && followGroup(st, minutes, you)) {
      // keeps its place in the flock or the line
    } else if (st.critter?.kind === "duck") {
      duckTick(st, minutes, you);
    } else if (st.critter?.predator) {
      tigerTick(st, minutes, you);
    } else if (st.critter?.aggro) {
      boarTick(st, minutes, you);
    } else if (st.critter) {
      woodlandTick(st, minutes);
    } else if (st.walk) {
      const pace = st.cards[0].key === "you" ? playerStride(moveRange(center(st)), MOVE_RANGE) / PX_PER_MIN : 1;
      if (stepWalk(st, minutes, pace)) {
        const { target, intent, automatic } = st.walk; st.walk = null;
        if (target && st.cards[0].key === "you" && boards[st.board].includes(target) && dist(st, standOn(st, target)) < 130) {
          arrive(st, target, intent);
          if (st.job) st.job.automatic = automatic;
          else if (automatic && youStack() === st && !clock.fast) me.autoRetryAt = clock.min + 20;
        }
      }
    }
    if (st.job) {
      st.job.left -= minutes;
      if (st.job.left <= 0) {
        if (st.npc) { st.job = null; st.bar?.remove(); st.bar = null; npcDone(st); } else finish(st);
      }
    }
  }
  if (you?.repeat && clock.min >= you.repeat.at) {
    const { target, automatic } = you.repeat;
    you.repeat = null;
    if (!you.job && !you.walk && !you.lifted && boards[you.board]?.includes(target)) {
      arrive(you, target);
      if (you.job) you.job.automatic = automatic;
    }
  }
  if (you?.travel && clock.min >= you.travel.until) { const t = you.travel.target; you.travel = null; if (t && boards[you.board].includes(t)) arrive(you, t); }
  if (you && board === "world") explore(center(you));
  if (you && board === "world" && inJungle(center(you)) && me.jungleDay !== day()) { me.jungleDay = day(); toast("林子一下静了，泥里有很大的爪印"); }
  if (day() !== lastDay) {
    lastDay = day();
    for (const [id, k] of Object.entries(me.known)) {
      if (k.day === day() - 1) continue;                       // used yesterday: still fresh
      k.mem -= FORGET_PER_DAY;
      if (k.mem <= 0) { delete me.known[id]; toast(`好久没做${craftName(id)}，忘了怎么做`); }
    }
    renderCrafts();
    rollWeather();
    peopleDay();
    festivalMorning();
    natureDay();
    storyDay();
    settleNaturalSources();
    lifeDay();
    const fire = find("fire")?.cards[0];
    if (fire && (fire.fuel ?? 0) > 0 && pileCount("ash") < 6) storeHome([newCard("ash")]);   // a day's burning leaves a scoop of ash
    const burn = day() <= (nature.coldSnapUntil ?? 0) ? 2 : 1;   // a cold snap eats two days' wood
    if (fire) fire.fuel = Math.max(0, (fire.fuel ?? 0) - burn);
    const stove = find("stove")?.cards[0]; if (stove) stove.fuel = Math.max(0, (stove.fuel ?? 0) - burn);
    const s = SEASONS.indexOf(season());
    if (s !== lastSeason) {
      lastSeason = s; turnSeason(SEASONS[s]); banner(SEASONS[s], `${SEASONS[s]}天来了`); observe("seasons-turn");
      if (SEASONS[s] === "春" && day() > 1) { village.winters++; chronicle(village.winters === 1 ? "熬过了头一个冬天。" : `又熬过一个冬天，这是第 ${village.winters} 个。`); }
      if (SEASONS[s] === "冬") {                                       // the first night of winter: snow from dusk till the next morning
        const d0 = (day() - 1) * 1440 + 360;
        if (weather.now === "雪") setWeather("晴");                      // a cold, clear first day; the snow comes with the dark
        weather.hold = d0 + 1440 + 210;
        weather.events.push({ at: d0 + 630, kind: "雪", strength: 1 }, { at: weather.hold, kind: "roll" });
      }
      boards.world.filter((q) => q.npc).forEach((q, i) => talks.push({ at: clock.min + 420 + i * 15, st: q, text: VOICE.seasonLine(q.npc.key, SEASONS[s]) }));
      if (SEASONS[s] === "冬") for (const f of boards.world.filter(isField)) {
        const t = f.cards[0], rested = !t.cropped && soilOf(t) < SOIL_MAX;
        t.soil = soilAtWinter(t); t.cropped = false; t.fallow = false; refreshStock(t);
        if (rested) float("地歇了一年，肥了些", center(f), "world");
      }
      if (SEASONS[s] === "冬") for (const f of boards.world.filter((q) => (q.cards[0].key === "field" || q.cards[0].key === "field2") && q.cards[0].sown !== false)) {
        const t = f.cards[0]; t.sown = false; t.stock = 0; refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor("field");
        float("没收的粟烂在地里了", center(f), "world"); groundChanged(); needUp("know-season");     // missed the autumn: the field goes back to bare
      }
    }
  }
  settleNaturalSources(true);
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
  const d = Math.max(darkness(), board === "world" && inMine(youAt()) ? 0.55 : 0), r = table.getBoundingClientRect(), K = 0.5;   // the tunnel is dim at noon
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

// The simulation advances in whole minutes. Share one interpolated position
// between the person, their carried cards and their speech for every frame.
function speakerPosition(st, x, y, now, hidden) {
  if (hidden || st.lifted) { st.speakerPose = null; return { x, y }; }
  const pose = st.speakerPose;
  if (!pose || pose.board !== st.board || Math.hypot(x - pose.x, y - pose.y) > 250) {
    st.speakerPose = { x, y, fromX: x, fromY: y, start: now, duration: 1, board: st.board };
    return { x, y };
  }
  const t = Math.min(1, Math.max(0, (now - pose.start) / pose.duration));
  const shown = { x: pose.fromX + (pose.x - pose.fromX) * t, y: pose.fromY + (pose.y - pose.fromY) * t };
  if (pose.x !== x || pose.y !== y) {
    st.speakerPose = { x, y, fromX: shown.x, fromY: shown.y, start: now, duration: 120 / (clock.speed || 1), board: st.board };
  }
  return shown;
}

function render(now = performance.now()) {
  const you = youStack();
  const pin = $("routePin"), plotted = board === "world" && you?.walk?.plotted;
  pin.hidden = !plotted;
  if (plotted) { pin.style.left = `${you.walk.x + CARD_W / 2}px`; pin.style.top = `${you.walk.y + CARD_H / 2}px`; }
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
      const base = st.cards[0], exhausted = naturalSource(base.key) && base.stock <= 0;
      const hidden = !live || (inFog && !unseen) || ghostFog || (!st.seen && unseen) || Boolean(st.indoors) || exhausted;
      const speaker = Boolean(st.npc || st.pet);
      const position = speaker ? speakerPosition(st, x, y, now, hidden) : { x, y };
      const left = Math.round(position.x), top = Math.round(position.y), peek = peekOf(st);
      cardGroups(st).forEach(({ card }, i) => {
        const el = card.el;
        el.classList.toggle("hidden", hidden);
        el.classList.toggle("ghost", unseen);
        el.classList.toggle("lifted", Boolean(st.lifted));
        el.classList.toggle("walking", Boolean(st.walk) && !unseen);
        el.classList.toggle("speaker-motion", speaker);
        el.classList.toggle("glum", Boolean(st.npc && (st.npc.mood ?? 6) < 3));
        el.style.transform = `translate(${left}px, ${top + i * peek}px)${st.lifted ? " rotate(-2deg) scale(1.05)" : ""}`;
        el.style.zIndex = st.lifted ? 9000 + i : top + i + 10;
      });
      if (st.bubble) {
        const bb = st.bubble, gone = now > bb.until;
        if (gone && !bb.out) { bb.out = true; bb.el.classList.add("out"); setTimeout(() => bb.el.remove(), 350); }
        if (gone && now > bb.until + 400) st.bubble = null;
        else {
          bb.el.style.transform = `translate(${left + st.cards[0].w / 2}px, ${top - 10}px) translate(-50%, -100%)`;
          bb.el.hidden = hidden || Boolean(st.lifted) || !awake(st);
        }
      }
      if (st.job && !unseen && live && !inFog) {
        if (!st.bar) { st.bar = document.createElement("div"); st.bar.className = "bar"; st.bar.innerHTML = "<i></i>"; layerOf(b).append(st.bar); }
        st.bar.style.transform = `translate(${left}px, ${top - 18}px)`;
        st.bar.style.zIndex = top + 60;
        st.bar.firstElementChild.style.width = `${Math.min(100, (1 - st.job.left / st.job.total) * 100)}%`;
      } else if (st.bar) { st.bar.remove(); st.bar = null; }
    }
  }
  if (MAP.tunnel?.el) MAP.tunnel.el.classList.toggle("open", board === "world" && inMine(you ? center(you) : null));
  const hc = find("taoHouse")?.compound;
  if (hc?.roofEl) {
    const p = you ? center(you) : null;
    const inside = Boolean(p && board === "world" && p.x > hc.x && p.x < hc.x + hc.w && p.y > hc.y && p.y < hc.y + hc.h);
    hc.roofEl.classList.toggle("open", inside);
  }
  const h = hour(), m = Math.floor(clock.min % 60);
  $("time").textContent = `${String(Math.floor(h)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  $("day").textContent = `第 ${day()} 天`;
  $("dayline").style.setProperty("--t", (clock.min % 1440 / 1440).toFixed(4));
  const stick = boards.world.some((q) => q.cards[0].key === "calendarStick"), left = DAYS_PER_SEASON - ((day() - 1) % DAYS_PER_SEASON);
  $("season").innerHTML = stick ? `${season()}<small>${left}天后入${SEASONS[(SEASONS.indexOf(season()) + 1) % 4]}</small>` : season();
  drawDark();
  $("sun").className = darkness() < 0.5 ? "sun" : "moon";
  $("barFood").firstElementChild.style.width = `${me.food}%`;
  $("barFood").classList.toggle("low", hungry());
  $("barRest").firstElementChild.style.width = `${me.rest}%`;
  $("barRest").classList.toggle("low", tired());
  const state = bodyState().join(" · ");
  $("me").classList.toggle("low", Boolean(state));
  $("meFace").title = state || "点一下：接着做刚才那件事";
  const nm = `${me.name ?? "启禾"} · ${myAge()}岁`; if ($("meName").textContent !== nm) $("meName").textContent = nm;
}
function carryChanged() {
  const you = youStack();
  $("meCarry").innerHTML = bundleLayout(you?.cards.slice(1) ?? [], bundleable).map(({ card, start, end }) =>
    `<span title="${DEFS[card.key].name}${end - start > 1 ? ` ×${end - start}` : ""}">${iconFor(DEFS[card.key].icon)}${end - start > 1 ? `<small>×${end - start}</small>` : ""}</span>`).join("");
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
  const target = boards[board].find((st) => st.cards[0].key === rec.key && (!naturalSource(rec.key) || st.cards[0].stock > 0));
  if (!target) return toast("那儿不在了");
  const you = youStack();
  if (!you) return;
  if (you.job) return toast("先把手上的活干完");
  if (starving()) return toast("饿得走不动，先吃点东西");
  if (spent()) return toast("累垮了，先歇一会儿");
  if (walkTo(you, center(target), target)) toast(`去${DEFS[rec.key].name}`);
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
function autoYou(force = false) {
  const you = youStack();
  if (!me.auto || !you || clock.fast || you.job || you.walk || you.travel || you.repeat || you.lifted || drag) return;
  if (!force && clock.min < (me.autoRetryAt ?? 0)) return;
  me.autoRetryAt = clock.min + 20;
  const tiredOrDark = me.rest < 22 || (hour() >= 20 || hour() < 5) && me.rest < 85;
  const go = (key, label, intent = null) => {
    if (flooded(key)) return false;
    const candidates = boards[board].filter((s) => s.cards[0].key === key && (!naturalSource(key) || s.cards[0].stock > 0))
      .sort((a, b) => dist(center(a), center(you)) - dist(center(b), center(you)));
    for (const t of candidates) if (walkTo(you, center(t), t, intent, true)) {
      me.autoRetryAt = clock.min;
      float(label, center(you), board);
      return true;
    }
    return false;
  };
  if (me.food < 38) {
    const food = you.cards.find((card) => DEFS[card.key].type === "food" && card.key !== "herb");
    if (food && eatCarried(food)) return;
    if (board === "world" && find("stove")?.cards[0].stock > 0 && go("stove", "去吃饭", "meal")) return;
  }
  if (tiredOrDark && go("bed", "回家歇着")) return;
  if (board !== "world") return void go("door", "出门");
  if (loose(you).length >= capOf(you)) {
    if (go(unloadDest(you), "背满了，先去卸货")) you.unloading = true;
    return;
  }
  if (starving()) return;
  if (me.recent[0] && go(me.recent[0].key, `接着去${DEFS[me.recent[0].key].name}`)) return;
  if (!go("chestnut", "去砍点木头")) go("hemp", "去割点葛麻");
}
function renderAutoMe() {
  const b = $("autoMe");
  b.classList.toggle("on", me.auto); b.setAttribute("aria-pressed", String(me.auto));
  b.title = me.auto ? "停止自动行动" : "立即自动行动";
}

// ---------------------------------------------------------------------------
// The people (and the dog) you can direct
// ---------------------------------------------------------------------------
const JOB_CHOICES = {
  npc: [["farm", "field", "种田"], ["wood", "chestnut", "砍树，木头背回家"], ["fish", "river", "捕鱼，送去公灶"], ["stone", "scree", "去矿道挖石头，背回家"], ["cook", "stove", "做饭"], ["build", "plot", "盖房子：去材料齐了的地基上干活"]],
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
  drag.target = targetAt({ x: st.x + CARD_W / 2, y: st.y + CARD_H / 2 }, st);
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
const FIELD_TASK = (t) => { const s = season(); if (s === "冬") return null; if (s === "秋") return t.stock >= 1 ? "harvest" : null; if (s === "春" && t.sown === false) return "sow"; return t.sown !== false ? "tend" : null; };
const TASK_AT = { field: FIELD_TASK, field2: FIELD_TASK, chestnut: () => "chop", pineGrove: () => "chop", lake: () => "fish",
  pit: () => "dig", scree: () => "pick", mineFace: () => "pick", granary: () => "drop", stove: (t, st) => (st.carry ? "give" : "eat"), taoHouse: () => "store" };
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
    depositCards(st, t, fits);
  }
}

// ---------------------------------------------------------------------------
// Villagers make what their work needs, and then use it: 陶婶 a net, 阿予 a hoe, 阿埴 jars for the granary (and an axe),
// 阿灶 a torch from the stove fire before dark. Missing materials they fetch from home or go and gather; tools wear out and get made again.
// ---------------------------------------------------------------------------
const holds = (st, k) => st.cards.some((c) => c.key === k);
/** Which tool goes where: leave it there and whoever works the place uses it. */
const TOOL_AT = { chestnut: ["axe"], pineGrove: ["axe"], reeds: ["knife"], hemp: ["knife"], lake: ["net", "floodMark"], field: ["hoe", "scarecrow", "fence"], field2: ["hoe", "scarecrow", "fence"], mineFace: ["hammer"] };
const toolAt = (place, k) => Boolean(place?.cards.some((c, j) => j > 0 && c.key === k));
const hasTool = (st, place, k) => holds(st, k) || toolAt(place, k);
/** Wear the tool someone is using: their own if they carry one, else the one left at the place. */
function wearAny(st, place, k) { if (holds(st, k)) return st.npc ? wearNpc(st, k) : wearTool(st, k); if (toolAt(place, k)) wearTool(place, k); }
/** Does the season call this farmer to the fields right now — sowing in spring, weeding till the crop is up, harvest in autumn? */
function fieldsCall(st) {
  const fields = boards.world.filter((s) => s.cards[0].key === "field" || s.cards[0].key === "field2").map((s) => s.cards[0]);
  const growing = fields.some((f) => f.sown !== false && (f.stock ?? 0) < 3);
  if (season() === "春") return growing || (fields.some((f) => f.sown === false) && (holds(st, "grain") || find("granary").cards[0].stock > 0));
  if (season() === "夏") return growing;
  if (season() === "秋") return fields.some((f) => f.sown !== false && f.stock >= 1);
  return false;
}
const kitHas = (st, k) => holds(st, k) || (st.npc?.kit ?? []).some((c) => c.key === k);
const WANT = {
  aunt: (st) => (kitHas(st, "net") || toolAt(find("lake"), "net") ? null : "net"),
  gu: (st) => (kitHas(st, "net") || toolAt(find("lake"), "net") ? null : "net"),
  wei: (st) => (kitHas(st, "knife") || toolAt(find("reeds"), "knife") ? null : "knife"),
  li: (st) => (kitHas(st, "hammer") || toolAt(find("mineFace"), "hammer") ? (kitHas(st, "axe") || toolAt(find("chestnut"), "axe") ? null : "axe") : "hammer"),
  san: (st) => (kitHas(st, "hoe") || boards.world.some((s) => isField(s) && toolAt(s, "hoe")) ? null : "hoe"),
};
const SOURCE = { log: "chestnut", wood: "chestnut", stone: "mineFace", flint: "flintVein", fiber: "hemp", reed: "reeds", clay: "pit", fish: "lake" };
/** A plan that can't go on (nothing left to gather, nobody knows how): set it aside for half a day or so and get on with the work. */
const shelve = (st) => { st.plans = []; st.npc.planBlocked = clock.min + 600 + randomWorld() * 600; };
const NPC_STATION = { fire: "fire", stove: "stove" };
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
const pileHas = (k) => allStacks().find((s) => s.store)?.cards.some((c) => c.key === k || (k === "wood" && c.key === "log"));
function planStep(st) {
  const plan = st.plans.at(-1);
  if (plan.deliver) return go(st, "granary", "jarIn");
  const r = plan.r, miss = missingFor(st, r);
  if (miss.length) {
    const k = miss[0];
    if (pileHas(k)) return go(st, "taoHouse", "fetchHome", k);
    if (SOURCE[k]) {
      // The nearest one that isn't in the tiger's beat: whoever ran from it won't walk straight back there.
      const tiger = boards.world.find((s) => s.critter?.predator), me = center(st);
      const src = boards.world.filter((s) => s.cards[0].key === SOURCE[k] && s.cards[0].stock > 0 && !inJungle(center(s))
        && !(tiger && dist(center(tiger), center(s)) < 760)).sort((a, b) => dist(center(a), me) - dist(center(b), me))[0];
      if (!src) return shelve(st);                                        // nothing left to gather (or the tiger sits on it): later
      return go(st, SOURCE[k], "gather", k === "wood" ? "log" : k, src);
    }
    const sub = RECIPES.find((x) => x.id && x.make[0] === k && x.who?.includes(st.npc.key));
    if (sub && st.plans.length < 3) { st.plans.push({ r: sub }); return planStep(st); }
    return shelve(st);
  }
  go(st, NPC_STATION[r.needs[0]], "craft");
}
function craftDone(st, target) {
  const r = st.plans.at(-1)?.r; if (!r) return;
  const t = target.cards[0];
  if (t.key !== (NPC_STATION[r.needs[0]] ?? r.needs[0]) || (r.fuelCost && (t.fuel ?? 0) < r.fuelCost)) return shelve(st);
  const result = commitProduction(st, target, {
    kind: "craft", cost: r.kilnClay, use: r.needs.slice(1), output: r.make, woodSubstitute: true,
  });
  if (!result) return shelve(st);
  if (r.fuelCost) t.fuel -= r.fuelCost;
  const [made] = result.made;
  st.plans.pop();
  if (made.key === "bed") return layBed(st, made);
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
function depositCards(st, target, cards) {
  const into = target.cards[0];
  if (commitProduction(st, target, { kind: "deposit", cards, use: cards.map((c) => c.key), credit: cards.length }, {
    details: { resource: DEPOT[into.key], consumedUnits: cards.length, addedUnits: cards.length, discardedUnits: 0 },
  })) float(`+${cards.length} ${DEFS[into.key].stockLabel}`, center(target), target.board);
}

function unload(st, target) {
  const k = target.cards[0].key, items = loose(st);
  if (k === "barn") { storeIn(target, st); return true; }
  if (k === "taoHouse") { st.cards = st.cards.filter((c) => !items.includes(c)); storeHome(items); float(`${items.length} 样放回家了`, center(st), st.board); carryChanged(); return true; }
  if (DEPOT[k]) {
    const t = target.cards[0], fits = items.filter((c) => c.key === DEPOT[k]);
    const room = k === "granary" ? Math.max(0, granaryCap(t) - t.stock) : Infinity, put = fits.slice(0, room);
    if (put.length) depositCards(st, target, put);
    carryChanged(); return true;
  }
  return false;
}
const OPEN_PILE = 20, CHEST_CAP = 12, COMPOSTABLE = new Set(["reed", "fiber", "berry", "fish", "meat", "herb", "peachFruit", "jujubeFruit", "mushroom", "hide"]);
function compostIn(target, st) {
  const c = target.cards[0], items = loose(st).filter((x) => COMPOSTABLE.has(x.key));
  st.cards = st.cards.filter((x) => !items.includes(x)); items.forEach((x) => x.el.remove());
  c.heap = Math.min(12, (c.heap ?? 0) + items.length);
  float(`倒进堆肥坑 ${items.length} 样`, center(target), "world"); carryChanged();
}
function storeIn(target, st) {
  const b = target.cards[0], room = b.key === "chest" ? CHEST_CAP - b.items.length : Infinity, items = loose(st).slice(0, Math.max(0, room));
  if (!items.length) return toast(`${b.name ?? DEFS[b.key].name}装满了`);
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
/** Why a foundation can't go here, or null if it can. */
function foundationProblem(kind, p) {
  const b = BUILDS[kind], [w, h] = TIERS[b.tier];
  const corners = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0]];
  if (!corners.every(([kx, ky]) => walkable(MAP, p.x + kx * w, p.y + ky * h) && MAP.cls[MAP.idx(p.x + kx * w, p.y + ky * h)] !== G.FORD)) return "这儿不平，换块地";
  if (b.grass && !corners.every(([kx, ky]) => MAP.cls[MAP.idx(p.x + kx * w, p.y + ky * h)] === G.MEADOW)) return "开荒得找一块草地";
  if (rectHitsYard(p.x - w / 2, p.y - h / 2, w, h) && !rectInYard(p.x - w / 2, p.y - h / 2, w, h)) return "压着院墙了，挪一挪";
  if (boards.world.some((s) => Math.abs(center(s).x - p.x) < (s.w + w) / 2 + 20 && Math.abs(center(s).y - p.y) < (s.h + h) / 2 + 20)) return "太挤了，离别的东西远一点";
  return null;
}
/** The ground in front of the yard gate stays clear: it's the way in. */
const beforeGate = (x, y, w, h) => { const c = MAP.house, g = c?.gate; return Boolean(g && x < g.x + g.w + 60 && x + w > g.x - 60 && y < c.y + c.h + 280 && y + h > c.y + c.h); };
const rectHitsYard = (x, y, w, h) => { const c = MAP.house; return Boolean(c && x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y); };
const rectInYard = (x, y, w, h) => { const c = MAP.house; return Boolean(c && x >= c.x + 8 && x + w <= c.x + c.w - 8 && y >= c.y + 8 && y + h <= c.y + c.h - 8); };
const plotName = (c) => (c.build === "farm" ? (c.stage ? "清好的荒地" : "荒地") : `${DEFS[c.build].name}·${stageOf(c).name}`);
function layFoundation(kind, p) {
  const b = BUILDS[kind], [w, h] = TIERS[b.tier];
  const c = newCard("plot", undefined, b.tier);
  c.build = kind; c.stage = 0; c.need = { ...BUILD_STAGES[kind][0].needs }; c.work = 0; c.name = plotName(c);
  c.el.querySelector(".card-head span").textContent = c.name;
  const st = newStack([c], p.x - w / 2, p.y - h / 2, "world");
  refreshPlot(c);
  return st;
}
function placeFoundation(p) {
  const kind = placing;
  if (board !== "world") return toast("得在外面打地基");
  if (!known(p)) return toast("还没去过那儿");
  const problem = foundationProblem(kind, p);
  if (problem) return toast(problem);
  layFoundation(kind, p);
  placing = null; table.classList.remove("placing");
  toast(kind === "farm" ? "荒地划好了：先清理，再带着锄头翻地（冬天地冻，翻不动）" : "地基划好了：一步步来，每一步把材料带上去，齐了就站上去干");
}
/** A foundation shows which step it is on, what that step still needs, then how far the step has got. */
function refreshPlot(c) {
  const stages = stagesOf(c), g = stageOf(c), at = c.stage ?? 0, left = Object.entries(c.need).filter(([, n]) => n > 0);
  c.el.querySelector(".card-art").innerHTML = `<div class="plot-art" style="opacity:${(0.25 + (0.55 * at) / stages.length).toFixed(2)}">${iconFor(DEFS[c.build].icon)}</div>`
    + (stages.length > 1 ? `<b class="plot-step">${at + 1}/${stages.length} ${g.name}</b>` : "")
    + (left.length ? `<div class="plot-need">${left.map(([k, n]) => `<span title="${DEFS[k].name}">${iconFor(DEFS[k].icon)}<b>${n}</b></span>`).join("")}</div>`
      : `<i class="plot-bar"><u style="width:${Math.min(100, Math.round((c.work / g.work) * 100))}%"></u></i>`);
}
/** Work went into a foundation: the step may be done (then the next step's materials are wanted), or the whole thing. */
function progressPlot(target, minutes, by = null) {
  const c = target.cards[0], was = stageOf(c), out = addWork(c, minutes);
  if (out === "stage") {
    if (c.build === "farm") { float("杂草拔了，石头捡出来了", center(target), "world"); if (!by) addCard(youStack(), "stone"); }
    else float(`${was.name}好了，接下来${stageOf(c).name}`, center(target), "world");
    c.name = plotName(c); c.el.querySelector(".card-head span").textContent = c.name;
  }
  if (out === "done") { completeBuild(target, by); return out; }
  refreshPlot(c);
  return out;
}
/** The foundation's card, opened: which step, what's missing, what's next, who can lead it. */
function plotBlock(c) {
  const stages = stagesOf(c), g = stageOf(c), at = c.stage ?? 0, left = Object.entries(c.need).filter(([, n]) => n > 0);
  const who = [...(me.known[c.build] ? ["你"] : []), ...BUILDS[c.build].who.map((k) => DEFS[k]?.name).filter(Boolean)];
  return `<p class="doing">第 ${at + 1}/${stages.length} 步：${g.name}${left.length ? `，还缺 ${left.map(([k, n]) => `${DEFS[k].name}×${n}`).join("、")}` : `，做了 ${Math.round((c.work / g.work) * 100)}%`}${g.thaw && season() === "冬" ? " · 地冻着，开春才能干" : ""}</p>`
    + `<p class="doing">后面：${stages.slice(at + 1).map((x) => x.name).join(" → ") || "这是最后一步"}</p><p class="doing">会领着干的：${who.join("、") || "还没人会"}</p>`;
}
/** Why this step can't go on today, if it can't. */
function stepBlocked(c, st) {
  const g = stageOf(c);
  if (g.thaw && season() === "冬") return "地冻着，挖不动，开春再说";
  if (g.tool && !(holds(st, g.tool) || (st.npc && g.tool === "hoe" && hoeReach(st)))) return `得带着${DEFS[g.tool].name}才能干`;
  return "";
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
  const c = target.cards[0], g = stageOf(c);
  const took = loose(st).filter((x) => (c.need[x.key] ?? 0) > 0 && c.need[x.key]-- > 0);
  if (took.length) { st.cards = st.cards.filter((x) => !took.includes(x)); took.forEach((x) => x.el.remove()); float(`交了 ${took.length} 样材料`, center(target), "world"); refreshPlot(c); carryChanged(); }
  const left = Object.entries(c.need).filter(([, n]) => n > 0);
  if (left.length) { if (!took.length) toast(`${g.name}还缺：${left.map(([k, n]) => `${DEFS[k].name}${n}`).join("、")}`); return; }
  if (starving()) return toast("饿得干不动了，先去吃点东西");
  if (spent()) return toast("没力气了，回屋睡一觉");
  const blocked = stepBlocked(c, st);
  if (blocked) return toast(blocked);
  const figuring = st.cards[0].key === "you" && !me.known[c.build];
  const chunk = Math.min(240, g.work - c.work), min = chunk * workPace() * (figuring ? 2 : 1);
  st.job = { r: { build: true, min: chunk, make: [] }, target, left: min, total: min, chunk, figuring };
  if (figuring) float("没盖过，边琢磨边盖……", center(st), st.board);
}
function finishBuildWork(st, target, figuring) {
  const c = target.cards[0], chunk = Math.min(240, stageOf(c).work - c.work);
  me.rest = Math.max(0, me.rest - chunk * 0.1);
  if (figuring) me.known[c.build] = { mem: 1, day: day() };
  else if (me.known[c.build]) me.known[c.build] = { mem: 1, day: day() };
  c.ledDay = day();
  if (progressPlot(target, chunk) === "done") return;
  if (me.food > 20 && me.rest > 15) st.repeat = { target, at: clock.min + 5 };
  carryChanged();
}
function completeBuild(target, by = null) {
  const c = target.cards[0], kind = c.build;
  if (kind === "farm") return completeField(target, by);
  const nc = newCard(kind); nc.built = { kind, spent: { ...BUILDS[kind].needs } };
  if (kind === "bighouse") {
    nc.room = `room${nc.id}`; boards[nc.room] = [];
    for (const [k, x, y] of ROOM_FURNITURE) newStack([newCard(k)], x, y, nc.room);
    const fire = boards[nc.room].find((s) => s.cards[0].key === "fire"); if (fire) fire.cards[0].fuel = 2;
  }
  if (kind === "barn" || kind === "chest") nc.items = [];
  if (kind === "compost") nc.heap = 0;
  c.el.remove(); cardsLayer.append(nc.el);
  target.cards = [nc]; target.w = nc.w; target.h = nc.h;
  if (kind === "granaryPit") { const g = find("granary")?.cards[0]; if (g) refreshStock(g); }
  village.lastBuilt = { day: day(), name: `一个${DEFS[kind].name}` };
  if (by && heard(by, 900)) sfx("build");
  if (by) { float(`${nameOf(by)}把${DEFS[kind].name}弄好了`, center(target), "world"); chronicle(`${nameOf(by)}弄好了一个${DEFS[kind].name}。`); return; }
  me.known[kind] = { mem: 1, day: day() };
  banner("✦", `${DEFS[kind].name}盖好了`); chronicle(`盖起了一座${DEFS[kind].name}。`);
  naming = nc; $("nameInput").value = DEFS[kind].name; $("namer").hidden = false; $("nameInput").focus();
}
/** Broken ground becomes a field: empty until you sow it, its furrows painted on the land. */
function completeField(target, by = null) {
  const c = target.cards[0], nc = newCard("field", 0);
  nc.sown = false; nc.soil = 2; nc.name = "新开的田";                  // raw ground: thin till it has been fed nc.el.querySelector(".card-head span").textContent = nc.name; refreshStock(nc);
  c.el.remove(); cardsLayer.append(nc.el);
  target.cards = [nc]; target.w = nc.w; target.h = nc.h;
  const p = center(target);
  (MAP.extraFields ??= []).push({ patch: "field", x: p.x, y: p.y + 10, w: 230, h: 190, card: nc });   // painted by paintSeason below
  paintSeason();
  village.lastBuilt = { day: day(), name: "一块新田" };
  if (by && heard(by, 900)) sfx("build");
  if (by) { float(`${nameOf(by)}开出了一块新田`, p, "world"); chronicle(`${nameOf(by)}开出了一块新田。`); return; }
  me.known.farm = { mem: 1, day: day() };
  banner("✦", "开出一块新田"); chronicle("开出了一块新田。");
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
  const back = c.key === "plot" ? Object.entries(delivered(c)) : Object.entries(c.built.spent).map(([k, n]) => [k, Math.floor(n / 2)]);
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
const DOING = { eat: "吃饭", wait: "等饭", tend: "锄地", harvest: "收粟", dig: "挖黏土", drop: "放东西", fetch: "取粟", cook: "煮饭", watch: "在火塘边歇着", fish: "在湖边捞鱼", give: "送鱼去灶上", sleep: "回去睡觉", evening: "在火塘边坐着", chop: "砍树", pick: "挖石头", store: "把东西送回家", sow: "播种", seed: "去公仓拿种子", hide: "躲老虎", gather: "去采材料", fetchHome: "回家拿材料", craft: "做东西", jarIn: "把陶罐放进公仓", build: "盖房子", forage: "摘野果", tidy: "翻公仓里的粟", shelter: "在火塘边避雨", cut: "割芦苇", feast: "过节", arrive: "刚来，往灶边走", supply: "往地基上送材料", stoke: "给火塘添柴", plant: "补种小树", manure: "往地里上肥", water: "挑水浇地", place: "往田里立东西", stash: "把东西收回家" };
function showDetail(card) {
  const d = { ...DEFS[card.key], ...(card.name ? { name: card.name } : {}) }, st = stackOf(card), box = $("detail");
  if (me.ropeHung && (card.key === "cliffFoot" || card.key === "cliffTop")) d.text = "一根攀绳从崖沿垂下来，绳结磨得发白。";
  if (card.key === "pineGrove" && card.el.dataset.sourceStage === "snowgreen") d.text = "枝头落了雪，下面的针叶仍是深绿色。";
  const ghost = card.el.classList.contains("ghost");
  const doing = st.npc ? (ghost ? "不在你眼前，这是你最后见到的地方" : st.npc.inside ? "在铺位上睡着" : st.musing ? "站着出神，想着心事" : st.job ? `正在${DOING[st.job.npcTask] ?? "忙"}` : st.walk ? `要去${DEFS[st.goal]?.name ?? "别处"}${DOING[st.task] ? `（${DOING[st.task]}）` : ""}` : "") : "";
  const mine = st === youStack() && d.type === "food";
  const trust = !awake(st) ? "" : st.npc?.visitor ? tradeBlock(st) : st.npc && PD(st) ? socialBlock(st) : st.npc ? `<p class="doing">${st.npc.retired ? "上一代当家的" : family().kids.includes(st.npc.key) ? "你家的孩子" : (family().siblings ?? []).includes(st.npc.key) ? "你的兄弟姐妹" : "村里的人"} · ${looksAge(npcAge(st.npc))}</p>` : "";
  const inside = d.type === "house" ? allStacks().filter((s) => s.npc?.inside && s.npc.home === card.key).map((s) => DEFS[s.npc.key].name) : [];
  const pile = d.type === "house" ? boards.tao.find((s) => s.store)?.cards ?? [] : [];
  const stored = Object.entries(pile.reduce((n, c) => ({ ...n, [DEFS[c.key].name]: (n[DEFS[c.key].name] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`);
  const combat = card === st.cards[0] ? combatBlock(st) : "";
  const making = st.plans?.length ? `<p class="doing">在做：${DEFS[st.plans[0].r.make?.[0]]?.name ?? "把陶罐送去公仓"}</p>` : "";
  const soil = isField(st) ? `<p class="doing">地力：${SOIL_WORDS[soilOf(card)]}（${soilOf(card)}/${SOIL_MAX}）${card.sown !== false ? ` · 种着${DEFS[card.crop ?? "grain"].name}` : card.fallow ? " · 今年歇着" : card.lastCrop ? ` · 上一季种的${DEFS[card.lastCrop].name}` : ""}</p>` : "";
  const granary = card.key === "granary" ? `<p class="doing">能存 ${granaryCap(card)} 份（陶罐 ${card.jars ?? 0} 只）</p>` : "";
  const counts = (keys) => Object.entries(keys.reduce((n, k) => ({ ...n, [k]: (n[k] ?? 0) + 1 }), {}));
  const heap = card.key === "compost" ? `<p class="doing">沤着 ${card.heap ?? 0} 份（每 3 份沤成一份肥，送回院里）</p>` : "";
  const barn = card.key === "barn" || card.key === "chest" ? `<div class="barn-items">${counts(card.items).map(([k, n]) => `<button data-take="${k}" data-from="${st.id}" title="拿一份${DEFS[k].name}">${iconFor(DEFS[k].icon)}<b>${n}</b></button>`).join("") || `<p class="doing">空的</p>`}</div>` : "";
  const plotInfo = card.key === "plot" ? plotBlock(card) : "";
  const left = st.cards.slice(1).filter((c) => DEFS[c.key].type === "tool" && DEFS[card.key].type === "source");
  const toolsHere = left.length ? `<p class="doing">这儿放着：${left.map((c) => DEFS[c.key].name).join("、")}</p>` : "";
  const here = CRAFTS.filter((r) => r.needs[0] === card.key && invented(r));
  const station = here.some((r) => me.known[r.id]) ? `<div class="crafts">${here.filter((r) => me.known[r.id]).map(craftRow).join("")}</div>` : "";
  const theirs = st.npc && awake(st) ? CRAFTS.filter((r) => r.who.includes(card.key)) : [];
  const skills = theirs.length ? `<p class="doing">会做：</p><div class="skill-icons">${theirs.map((r) => `<span class="${me.known[r.id] ? "" : "new"}" title="${craftName(r.id)}${me.known[r.id] ? "" : "（你还不会）"}">${iconFor(DEFS[r.make[0]].icon)}</span>`).join("")}</div>`
    + (st.board === board && dist(center(youStack()), center(st)) < 600 ? `<button class="act" data-teach="${st.id}">请教</button>` : `<p class="doing">走近了才能请教</p>`) : "";
  const meal = card.key === "stove" && card.stock > 0 ? `<button class="act" data-meal="${st.id}">到灶边吃饭</button>` : "";
  const group = cardGroups(st).find((part) => part.card === card);
  const bundle = !st.npc && group && group.end - group.start > 1 ?
    `<button class="act" data-single="${card.id}">${st === youStack() ? "放下 1 份" : "拿起 1 份"}</button>` : "";
  box.innerHTML = `<div class="detail-head t-${d.type}">${iconFor(d.icon)}<b>${d.name}</b></div><p>${d.text}</p>${doing ? `<p class="doing">${doing}</p>` : ""}${card.stock !== undefined ? `<p class="doing">${d.stockLabel ?? "还剩"}：${card.stock}</p>` : ""}${card.fuel !== undefined ? `<p class="doing">火：${card.fuel}/6</p>` : ""}${card.key === "lake" ? `<p class="doing">${tide.level > 0.3 ? "涨潮，水漫上了沙滩" : tide.level < -0.3 ? "退潮，露出一圈湿沙，鱼好捞" : "平潮"}</p>` : ""}${card.uses !== undefined ? `<p class="doing">还能用 ${card.uses} 次</p>` : ""}${card.charges ? `<p class="doing">还剩 ${card.charges} 份</p>` : ""}${inside.length ? `<p class="doing">屋里：${inside.join("、")}</p>` : ""}${stored.length ? `<p class="doing">家里存着：${stored.join("、")}</p>` : ""}${st.ctl ? `<p class="doing">听你安排（${{ auto: "自己安排", work: "按你派的活", manual: "你来指挥" }[st.ctl.mode]}）</p>` : ""}${trust}${meal}${bundle}${mine ? `<button class="act" data-eat="${card.id}">吃掉（饱 +${d.food}）</button>` : ""}${combat}${making}${soil}${heap}${granary}${plotInfo}${barn}${toolsHere}${station}${skills}`;
  box.hidden = false;
  const r = card.el.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, r.right + 8))}px`;
  box.style.top = `${Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, r.top))}px`;
}
$("detail").addEventListener("click", (e) => {
  const meal = e.target.closest("[data-meal]");
  if (meal) {
    const stove = boards[board].find((st) => st.id === Number(meal.dataset.meal));
    if (stove) { hideDetail(); walkTo(youStack(), center(stove), stove, "meal"); }
    return;
  }
  const single = e.target.closest("[data-single]");
  if (single) { const card = cardById(single.dataset.single); if (card) splitOne(card); return; }
  const b = e.target.closest("[data-eat]");
  if (b) { const card = cardById(b.dataset.eat); if (card) eatCarried(card); return; }
  const take = e.target.closest("[data-take]");
  if (take) { takeFromBarn(allStacks().find((s) => s.id === Number(take.dataset.from)), take.dataset.take); return; }
  const ask = e.target.closest("[data-teach]");
  if (ask) { const npc = allStacks().find((s) => s.id === Number(ask.dataset.teach)); hideDetail(); if (npc) teach(npc); return; }
  const hunt = e.target.closest("[data-hunt]");
  if (hunt) { const card = cardById(hunt.dataset.hunt); if (card) attackRabbit(card, hunt.dataset.strike); hideDetail(); return; }
});
function eatCarried(card) {
  const you = youStack(), i = you?.cards.indexOf(card);
  if (!(i > 0) || DEFS[card.key].type !== "food") return false;
  if (me.food >= 98 && !(card.key === "herb" && isSick())) { toast("还饱着呢"); return false; }
  if (card.key === "jarFull" && card.charges > 1) card.charges--;
  else { you.cards.splice(i, 1); card.el.classList.add("gone"); setTimeout(() => card.el.remove(), 300); }
  if (card.key === "herb" && isSick()) { me.sickUntil = 0; toast("药草嚼下去，身上松快多了"); }
  eat(DEFS[card.key].food, center(you)); carryChanged(); hideDetail();
  return true;
}
function splitOne(card) {
  const st = stackOf(card), you = youStack();
  if (!st || !you || st.npc || st.board !== you.board || !bundleable(card)) return;
  const part = cardGroups(st).find((group) => group.card === card);
  if (!part || part.end - part.start < 2) return;
  if (dist(center(st), center(you)) > moveRange()) return toast("再走近一点");
  if (st !== you && loose(you).length >= capOf(you)) return toast("背不下了");
  st.cards.splice(part.start, 1);
  if (st === you) {
    const p = board === "world" ? settle(st.x + CARD_W + 85, st.y + CARD_H / 2) : { x: st.x + CARD_W + 70, y: st.y + CARD_H / 2 };
    newStack([card], p.x - CARD_W / 2, p.y - CARD_H / 2, board);
  } else you.cards.push(card);
  carryChanged(); hideDetail();
}
function hideDetail() { $("detail").hidden = true; }
/** What you can tell about someone from knowing them: never their numbers — how close you are, what they remember, what you've learned. */
function socialBlock(st) {
  const n = soc(st.npc), P = PD(st), you = youStack(), near = st.board === board && you && dist(center(you), center(st)) < 600;
  const mood = moodWord(n), mems = n.mem.slice(0, 2).map((m) => `<li>${m.text}${m.day === day() ? "（今天）" : `（第 ${m.day} 天）`}</li>`).join("");
  const K = n.known, facts = [K.fear, K.loves.length && `爱：${K.loves.map((k) => DEFS[k].name).join("、")}`, K.dislikes.length && `不爱要：${K.dislikes.map((k) => DEFS[k].name).join("、")}`, K.birthday && `生日：${dayName(K.birthday)}`].filter(Boolean);
  const btn = (act, label, ghost) => `<button class="act${ghost ? " ghost" : ""}" data-social="${act}" data-id="${st.id}">${label}</button>`;
  let req = "";
  if (n.req?.state === "asked") req = `<div class="req"><p>托你：${askOf(st).why}</p>${near ? btn("accept", "答应") + btn("decline", "这回不行", true) : ""}</div>`;
  else if (n.req?.state === "accepted") {
    const left = Object.entries(n.req.need).filter(([, v]) => v > 0), can = left.some(([k]) => loose(you).some((c) => c.key === k));
    req = `<div class="req"><p>答应了${P.he}：${askOf(st).why}${left.length ? `，还差 ${left.map(([k, v]) => `${DEFS[k].name}×${v}`).join("、")}` : ""}</p>${near ? (can ? btn("deliver", `交给${P.he}`) : "") + btn("decline", "说办不成了", true) : ""}</div>`;
  }
  const kin = family().spouse === st.npc.key ? "你的另一半" : family().parent === st.npc.key ? "你家里的长辈" : "";
  const famBtns = near ? (canCourt(st) ? btn("court", "求亲") : "") + (family().spouse === st.npc.key && canHaveChild() ? btn("child", "想要个孩子") : "") : "";
  return `<p class="doing">${kin ? `${kin} · ` : ""}关系：${tierOf(hearts(n)).name}${mood ? ` · ${mood}` : ""} · 看着${looksAge(npcAge(st.npc))}</p>${famBtns ? `<div class="social-acts">${famBtns}</div>` : ""}${mems ? `<p class="doing">${P.he}记得：</p><ul class="mems">${mems}</ul>` : ""}`
    + `${facts.length ? `<p class="doing">你知道的：${facts.join(" · ")}</p>` : ""}${req}`
    + (near ? `<div class="social-acts">${btn("talk", "聊聊")}${btn("news", "问问近况")}${btn("plan", "在忙啥")}</div>${villageExchangeBlock(st)}` : `<p class="doing">走近了才能说话</p>`);
}

const VILLAGER_WANTS = { cook: ["wood", "grain"], farm: ["wood"], fish: ["rope", "wood"], reed: ["rope", "fiber"] };
const tradeCards = (st) => st.cards.slice(1).filter((card) => Object.hasOwn(TRADE_WORTH, card.key));
function villagerTradeCards(st) {
  const load = carriedLoad(st);
  const reserved = load.n > load.cards.length ? load.cards : [];
  return tradeCards(st).filter((card) => !reserved.includes(card) && !((st.task === "seed" || st.task === "sow") && card.key === "grain"));
}
function canExchangeWith(st, you) {
  return Boolean(you && PD(st) && st.board === you.board && boards[st.board].includes(st) && !st.npc.inside &&
    !st.indoors && !st.cards[0].el.matches(".hidden, .ghost") && dist(center(you), center(st)) < 600);
}
function villageExchangeBlock(st) {
  const you = youStack();
  if (!canExchangeWith(st, you)) return "";
  const their = villagerTradeCards(st), yours = tradeCards(you);
  if (!their.length || !yours.length) return "";
  const names = (list) => list.map((card) => `<option value="${card.id}">${DEFS[card.key].name}</option>`).join("");
  const owed = st.npc.tradeCredit?.generation === me.gen ? st.npc.tradeCredit.owed : 0;
  const offers = yours.map((card) => `<label><input type="checkbox" name="give" value="${card.id}">${DEFS[card.key].name}</label>`).join("");
  return `<details class="village-exchange"><summary>换东西</summary><form data-village-exchange="${st.id}">
    <label>想换 <select name="take">${names(their)}</select></label>
    <fieldset><legend>你愿意给</legend>${offers}</fieldset>
    <label><input type="checkbox" name="credit">不够可以欠人情${owed ? `（已欠 ${owed}）` : ""}</label>
    <button type="submit" class="act">提出交换</button><p class="doing" role="status"></p>
  </form></details>`;
}

function exchangeWithVillager(st, giveIds, askId, credit) {
  const you = youStack();
  if (!canExchangeWith(st, you)) return "对方已走远，走近了再换。";
  const held = villagerTradeCards(st), n = st.npc, familiarity = hearts(n);
  const owed = n.tradeCredit?.generation === me.gen ? n.tradeCredit.owed : 0;
  const plan = planVillageExchange({
    give: tradeCards(you), hold: held, giveIds, askId, credit, owed,
    name: nameOf(st), hunger: n.hunger, wants: VILLAGER_WANTS[n.job] ?? [],
    closeness: familiarity >= 1 ? "相识" : familiarity > 0 ? "见过" : "陌生",
    label: (key) => DEFS[key].name,
  });
  if (!plan) return giveIds.length ? "东西已不在手里，重新选一次。" : "先选你愿意给的牌。";
  if (!plan.accept) return plan.reason;
  const { cards: jobCards } = carriedLoad(st);
  you.cards = [...you.cards.filter((card) => !plan.give.includes(card)), plan.take];
  st.cards = [...st.cards.filter((card) => card !== plan.take), ...plan.give];
  if (jobCards.includes(plan.take)) {
    const left = jobCards.filter((card) => card !== plan.take);
    st.carry = left.length ? { ...st.carry, n: left.length, ids: left.map((card) => card.id) } : null;
  }
  n.tradeCredit = { generation: me.gen, owed: Math.round((owed + plan.onCredit - plan.repaid) * 10) / 10 };
  recordProduction(production, { kind: "village-barter", minute: clock.min, actor: "you",
    source: st.cards[0].key, sourceId: st.cards[0].id, spent: plan.give.map((card) => card.key), output: [plan.take.key] });
  say(st, plan.reason);
  overflow(you);
  carryChanged();
  saveGame();
  hideDetail();
  toast(`换到${DEFS[plan.take.key].name}。${plan.reason}`);
  return "";
}

$("detail").addEventListener("submit", (event) => {
  const form = event.target.closest("[data-village-exchange]");
  if (!form) return;
  event.preventDefault();
  const st = allStacks().find((stack) => stack.id === Number(form.dataset.villageExchange));
  const data = new FormData(form);
  form.querySelector('[role="status"]').textContent = exchangeWithVillager(st, data.getAll("give").map(Number), Number(data.get("take")), data.has("credit"));
});
$("detail").addEventListener("click", (e) => {
  const tb = e.target.closest("[data-trade]");
  if (tb) { const st = allStacks().find((q) => q.id === Number(tb.dataset.id)); if (st) { trade(st, Number(tb.dataset.trade)); showDetail(st.cards[0]); } return; }
  const b = e.target.closest("[data-social]"); if (!b) return;
  const st = allStacks().find((s) => s.id === Number(b.dataset.id)); if (!st?.npc || !awake(st)) return;
  const act = b.dataset.social, you = youStack();
  if (act === "trade") return;
  if (act === "talk") talk(st, you);
  if (act === "news") askNews(st);
  if (act === "plan") tellPlan(st);
  if (act === "court") court(st);
  if (act === "child") wantChild(st);
  if (act === "accept") acceptReq(st);
  if (act === "decline") declineReq(st);
  if (act === "deliver") {
    const need = { ...soc(st.npc).req.need }, cards = loose(you).filter((c) => (need[c.key] ?? 0) > 0 && need[c.key]-- > 0);
    you.cards = you.cards.filter((c) => !cards.includes(c));
    const rest = giveTo(st, cards); you.cards.push(...rest); carryChanged();
  }
  showDetail(st.cards[0]);
});
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
  const builds = Object.keys(BUILDS).filter((id) => invented(BUILDS[id])).map((id) => `<div class="build-row">${craftRow(CRAFTS.find((r) => r.id === id))}<button class="act" data-place="${id}">${id === "farm" ? "选块草地开荒" : "选地方打地基"}</button></div>`).join("");
  box.innerHTML = `<b>你会的手艺</b>${mine.filter((r) => !r.build).map(craftRow).join("") || `<p>还什么都不会。</p>`}<b class="sub">盖房子</b>${builds}<p class="doing">没学会的还有 ${CRAFTS.filter(invented).length - mine.length} 样：点开村民按「请教」，或者带齐东西到地方自己琢磨（慢，还不一定成）。不用的手艺一周左右就忘。</p>`;
}
/** Someone says something (or thinks it): a bubble over their card that follows them, and fades after a few seconds. */
function say(st, text, kind = "say") {
  if (!awake(st) || !text) return;
  st.bubble?.el.remove();
  const el = document.createElement("div");
  el.className = `bubble${kind === "think" ? " think" : ""}`; el.textContent = text;
  el.hidden = true;
  layerOf(st.board).append(el);
  st.bubble = { el, until: performance.now() + Math.min(7500, 2400 + text.length * 120) };   // long lines stay up longer
}
function float(text, p, b = board) {
  const f = document.createElement("div");
  f.className = "float"; f.textContent = text; f.style.left = `${p.x}px`; f.style.top = `${p.y - 60}px`;
  layerOf(b).append(f);
  setTimeout(() => f.remove(), 1300);
}
let toastT = 0;
const messages = [];                                  // what's been said in toasts, newest last — for the 记 panel
function toast(t) { sfx("toast"); messages.push({ at: clock.min, text: t }); if (messages.length > 80) messages.shift(); if (!$("logBook").hidden) renderLog(); const el = $("toast"); el.textContent = t; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2400); }
function banner(big, small) { sfx("banner"); const b = $("banner"); b.innerHTML = `<b>${big}</b><span>${small}</span>`; b.hidden = false; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), 1800); }

$("speed").addEventListener("click", (e) => { const b = e.target.closest("[data-speed]"); if (b) setSpeed(Number(b.dataset.speed)); });
function setSpeed(s) { clock.speed = s; document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", Number(b.dataset.speed) === s)); table.classList.toggle("paused", s === 0); }
let lastSpeed = 1;
document.addEventListener("keydown", (e) => { if (e.code === "Space" && !e.target.closest?.("button, input, select, textarea, summary")) { e.preventDefault(); if (clock.speed) { lastSpeed = clock.speed; setSpeed(0); } else setSpeed(lastSpeed); } });
$("help").onclick = () => { $("helpbox").hidden = false; };
$("craftBook").onclick = () => { if (placing) { placing = null; table.classList.remove("placing"); toast("不打地基了"); return; } const b = $("crafts"); b.hidden = !b.hidden; $("villageBook").hidden = true; $("logBook").hidden = true; renderCrafts(); if (me.guide) (me.guide.flags ??= {}).openedBook = true; };
$("crafts").addEventListener("click", (e) => { const b = e.target.closest("[data-place]"); if (b) startPlacing(b.dataset.place); });
$("nameOk").onclick = () => { if (naming?.kidKey) { nameKid(naming.kidKey, naming.card, $("nameInput").value.trim()); $("namer").hidden = true; naming = null; return; } const c = naming; if (!c) return; c.name = $("nameInput").value.trim() || DEFS[c.key].name; c.el.querySelector(".card-head span").textContent = c.name; $("namer").hidden = true; naming = null; toast(`就叫「${c.name}」`); };
$("helpClose").onclick = () => { $("helpbox").hidden = true; };
$("help").addEventListener("click", () => { $("difficulty").value = me.difficulty ?? "寻常"; });
$("difficulty").onchange = (e) => { me.difficulty = e.target.value; toast(`难度：${me.difficulty}`); };
$("villageBook").addEventListener("click", (e) => { if (e.target.closest("[data-passon]") && confirm("退下来养老，让孩子当家？往后你就是他了。")) { passOn(false); renderVillage(); } });
$("villageBtn").onclick = () => { const b = $("villageBook"); b.hidden = !b.hidden; $("crafts").hidden = true; $("logBook").hidden = true; renderVillage(); if (me.guide) (me.guide.flags ??= {}).openedVillage = true; };
$("soundBtn").onclick = () => { const b = $("soundBook"); b.hidden = !b.hidden; $("crafts").hidden = true; $("villageBook").hidden = true; $("logBook").hidden = true; renderSound(); };
/** Volumes: kept in this browser, not in the save. */
function renderSound() {
  const row = (k, label) => `<label class="vol"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${soundSettings[k]}" data-vol="${k}"></label>`;
  $("soundBook").innerHTML = `<b>声音</b>${row("master", "总音量")}${row("music", "音乐")}${row("ambience", "环境声")}${row("sfx", "音效")}`
    + `<label class="vol mute"><input type="checkbox" data-mute ${soundSettings.muted ? "checked" : ""}> 静音</label>`
    + `<p class="doing">音乐是按季节的五声调式现编的：白天拨弦，夜里吹箫。环境声跟着天气、昼夜和你离湖的远近变。</p>`;
  $("soundBtn").textContent = soundSettings.muted ? "♪̸" : "♪";
}
$("soundBook").addEventListener("input", (e) => {
  const v = e.target.closest("[data-vol]"); if (v) setVolume(v.dataset.vol, Number(v.value));
  const m = e.target.closest("[data-mute]"); if (m) { setVolume("muted", m.checked); $("soundBtn").textContent = m.checked ? "♪̸" : "♪"; }
});
$("logBtn").onclick = () => { const b = $("logBook"); b.hidden = !b.hidden; $("crafts").hidden = true; $("villageBook").hidden = true; renderLog(); };
/** The 记 panel: what was said in toasts and what went into the village history since you sat down, newest first. */
function renderLog() {
  const when = (m) => { const d = dayAt(m), h = Math.floor((m % 1440) / 60), mm = Math.floor(m % 60); return `第 ${d} 天 ${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; };
  const recent = messages.slice(-40).reverse().map((x) => `<li class="${x.big ? "big" : ""}">${x.text}<i>${when(x.at)}</i></li>`).join("");
  $("logBook").innerHTML = `<b>最近的事</b><p class="doing">粗体的是记进村史的大事；完整的村史在「村」里。</p><ul>${recent || "<li>这次进来以后还没什么事。</li>"}</ul>`;
}
$("lifeNew").onclick = () => { if (confirm("从头开始一段新的人生？现在的存档会被清掉。")) location.search = "?new=1"; };
$("lifeExport").onclick = () => {
  saveGame();
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([localStorage.getItem(SAVE_KEY) ?? "{}"], { type: "application/json" }));
  a.download = `openlife-第${day()}天.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("lifeImport").onclick = () => $("lifeFile").click();
/** Starting a new life keeps the one before; this swaps them back (the current one becomes the kept one). */
$("lifeBack").onclick = () => {
  const prev = localStorage.getItem(PREVIOUS_KEY);
  if (!prev) return toast("没有上一段人生可找回");
  let info = "";
  try { const d = JSON.parse(prev); info = `（第 ${dayAt(d.min)} 天，${d.me?.name ?? "启禾"}）`; } catch { /* still offer it */ }
  if (!confirm(`换回上一段人生${info}？现在这一段会留作“上一段”，还能再换回来。`)) return;
  saveGame();
  const now = localStorage.getItem(SAVE_KEY);
  localStorage.setItem(SAVE_KEY, prev);
  if (now) localStorage.setItem(PREVIOUS_KEY, now); else localStorage.removeItem(PREVIOUS_KEY);
  saveWriteBlocked = true;                                          // don't let this page write over what was just put back
  location.reload();
};
$("help").addEventListener("click", () => { $("lifeBack").hidden = !localStorage.getItem(PREVIOUS_KEY); });
$("lifeFile").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!validSave(d)) throw new Error("存档版本或内容无效");
    sessionStorage.setItem(importKey(d.seed), JSON.stringify(d));
    saveGame();
    importingSave = true;
    const url = new URL(location.pathname, location.origin);
    if (d.seed !== LAND.seed) url.searchParams.set("seed", d.seed);
    location.replace(url);
  }
  catch (err) { toast(`读不了这个存档：${err.message}`); }
};
$("meFace").addEventListener("click", () => repeatRecent(0));
$("meRecent").addEventListener("click", (e) => { const b = e.target.closest("[data-recent]"); if (b) repeatRecent(Number(b.dataset.recent)); });
$("autoMe").addEventListener("click", () => {
  me.auto = !me.auto;
  const you = youStack();
  if (me.auto) autoYou(true);
  else if (you) {
    if (you.walk?.automatic) { you.walk = null; you.unloading = false; }
    if (you.job?.automatic) cancelJob(you);
    if (you.repeat?.automatic) you.repeat = null;
  }
  renderAutoMe();
});
$("partyToggle").addEventListener("click", () => { party.open = !party.open; renderParty(); });
$("party").addEventListener("click", (e) => {
  const row = e.target.closest("[data-id]"); if (!row) return;
  const st = allStacks().find((s) => s.id === Number(row.dataset.id)); if (!st?.ctl) return;
  const focus = e.target.closest("[data-focus]"), mode = e.target.closest("[data-mode]"), job = e.target.closest("[data-job]");
  if (focus && st.board === "world") { cam.follow = false; const c = center(st); cam.x = c.x; cam.y = c.y; applyCam(); }
  if (mode) setMode(st, mode.dataset.mode);
  if (job) { st.ctl.job = job.dataset.job; cancelJob(st); st.walk = null; st.goal = ""; intent(st, ""); }
  renderParty();
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// The village: a ladder to climb, newcomers once it has a footing, beds for them, the days it keeps, and its history.
// ---------------------------------------------------------------------------
const village = { firstHarvest: false, winters: 0, starved: 0, rung: 0, chronicle: [], nextArrival: 0, festDone: {} };
const yearOf = () => Math.floor((day() - 1) / (DAYS_PER_SEASON * 4)) + 1;
/** Something worth remembering about the village: it goes in the history (村史). */
function chronicle(text) {
  village.chronicle.push({ day: day(), season: season(), year: yearOf(), text });
  messages.push({ at: clock.min, text, big: true }); if (messages.length > 80) messages.shift();
  if (village.chronicle.length > 300) village.chronicle.splice(0, village.chronicle.length - 300);
  renderVillage();
}
const npcs = () => boards.world.filter((s) => s.npc && !s.npc.visitor).concat(Object.entries(boards).filter(([b]) => b !== "world").flatMap(([, l]) => l.filter((s) => s.npc)));
/** Where people sleep: the bed in the yard takes four, each hut two. A bed is remembered by where it stands. */
const beds = () => boards.world.filter((s) => s.cards[0].key === "bed" || s.cards[0].key === "hut");
/** A hut sleeps two; in the yard, one bed (one card in the pile of beds) sleeps one. */
const capOfBed = (b) => (b.cards[0].key === "hut" ? 2 : b.cards.filter((c) => c.key === "bed").length);
const littleOne = (s) => s.npc.kid && npcAge(s.npc) < 8;                  // small children sleep by their parents
/** Who sleeps where tonight: their own place first (a hut they were given), then any bed with room; null for the floor. */
function bedPlan() {
  const left = new Map(beds().map((b) => [b, capOfBed(b)])), plan = new Map();
  const sleepers = npcs().filter((s) => !littleOne(s) && !s.npc.visitor).sort((a, b) => (a.npc.order ?? 0) - (b.npc.order ?? 0));
  for (const s of sleepers) {
    const own = s.npc.bed && [...left.keys()].find((b) => b.cards[0].key === "hut" && dist(center(b), s.npc.bed) < 60 && left.get(b) > 0);
    if (own) { plan.set(s, own); left.set(own, left.get(own) - 1); }
  }
  for (const s of sleepers) if (!plan.has(s)) {
    const b = [...left].find(([, n]) => n > 0)?.[0] ?? null;
    plan.set(s, b); if (b) left.set(b, left.get(b) - 1);
  }
  return plan;
}
const sleepersAt = (b) => [...bedPlan().values()].filter((x) => x === b).length;
const freeBed = () => beds().find((b) => sleepersAt(b) < capOfBed(b));
/** A new bed goes on the yard's pile of beds (or starts one). */
function layBed(st, card) {
  st.cards = st.cards.filter((c) => c !== card);
  let pile = boards.world.find((b) => b.cards[0].key === "bed");
  if (pile) pile.cards.push(card);
  else { const { x, y } = yardFurnishing("bed", MAP.house); pile = newStack([card], x, y, "world"); }
  cardsLayer.append(card.el);
  float(st.npc ? `${nameOf(st)}扎好了一张铺位` : "铺好了一张铺位", center(pile), "world");
  carryChanged();
}
/** The snapshot the ladder reads. */
function villageNow() {
  const people = npcs().filter((s) => !s.npc.arriving);
  return {
    firstHarvest: village.firstHarvest, winters: village.winters, starved: village.starved,
    allKnown: people.filter(PD).every((s) => hearts(soc(s.npc)) >= 1), generations: me.gen ?? 1,
    threeGen: Boolean(family().parent && npcs().some((q) => q.npc.key === family().parent) && family().kids.length),
    people: people.length + 1, beds: beds().reduce((n, b) => n + capOfBed(b), 0) + 1,
    granary: find("granary")?.cards[0].stock ?? 0, fields: boards.world.filter(isField).length, traded: village.traded ?? 0,
  };
}
/** Climb as far as the conditions now allow; each rung is announced and written into the history. */
function climbLadder() {
  const v = villageNow();
  while (village.rung < LADDER.length && rungDone(LADDER[village.rung], v)) {
    const r = LADDER[village.rung++];
    banner("✦", `村子：${r.name}`);
    chronicle(`村子${r.name}了。${r.unlock.startsWith("（") ? "" : `往后${r.unlock}。`}`);
  }
}
function firstHarvest() { if (village.firstHarvest) return; village.firstHarvest = true; chronicle("头一季的粟收下来了。"); }
/** Now and then, once the village has a footing, someone comes to stay — if there's a bed and food to share. */
function considerArrival() {
  if (clock.min < village.nextArrival || hour() < 9 || hour() > 16) return;
  if (npcs().length + 1 >= POP_CAP || (find("granary")?.cards[0].stock ?? 0) < 5) return;
  const who = NEWCOMERS.find((c) => c.rung <= village.rung && !npcs().some((s) => s.npc.key === c.key));
  const bed = who && freeBed();
  if (!who || !bed) return;
  const t = MAP.tiles[who.from[0]], p = settle(t.x + t.w * who.from[1], t.y + t.h * who.from[2]);
  const order = npcs().length;
  const st = placeCard(who.key, p);
  st.npc = { key: who.key, order, home: "taoHouse", job: who.job, hunger: 3, wait: 0, inside: false, kit: [], arriving: true, born: bornFor(PEOPLE_DATA[who.key]?.age ?? 25),
    wake: 5.6 + order * 0.2, sleep: 20.2 + (order % 4) * 0.25, outAt: 0, nextChat: clock.min + 240, bed: center(bed) };
  village.nextArrival = clock.min + 1.5 * 1440;
  explore(p);
  toast(`有人${who.how}，正往灶边走`);
}
/** The newcomer reaches the stove and says who they are. */
function welcome(st) {
  const who = NEWCOMERS.find((c) => c.key === st.npc.key);
  st.npc.arriving = false;
  say(st, who.intro);
  banner("✦", `${who.name}来投奔了`);
  chronicle(`${who.name}${who.how}，在村里住下了。`);
}
/** The day's festival, if today is one. */
const festivalToday = () => FESTIVALS.find((f) => f.season === season() && f.day === ((day() - 1) % DAYS_PER_SEASON) + 1);
const festKey = (f) => `${f.id}-${yearOf()}`;
/** At dusk on a festival day everyone gathers at the stove; if you are there too, you are part of it. */
function festivalTick() {
  const f = festivalToday(); if (!f || village.festDone[festKey(f)] || hour() < 18.6 || hour() >= 20) return;
  const stove = find("stove"), g = find("granary")?.cards[0], s = stove?.cards[0], you = youStack();
  if (!stove) return;
  village.festDone[festKey(f)] = true;
  if ((f.cost.granary ?? 0) > (g?.stock ?? 0) || (f.cost.fuel ?? 0) > (s?.fuel ?? 0)) { chronicle(`今年${f.name}没办成：${f.cost.granary ? "公仓里拿不出粟" : "灶上没柴"}。`); return; }
  if (f.cost.granary) { g.stock -= f.cost.granary; refreshStock(g); }
  if (f.cost.fuel) s.fuel -= f.cost.fuel;
  if (f.feast) { s.stock += f.feast; refreshStock(s); }
  const there = npcs().filter((q) => !q.npc.inside && dist(center(q), center(stove)) < 500);
  const youThere = you && you.board === "world" && dist(center(you), center(stove)) < 500;
  for (const q of there) { soc(q.npc).mood = Math.min(10, soc(q.npc).mood + 1.5); if (youThere) bondUp(q, { fam: 0.5 }); }
  village.lastFestival = day();
  sfx("drum");
  if (youThere) { banner("✦", f.name); say(stove, f.line); me.food = Math.min(100, me.food + (f.feast ? 30 : 0)); }
  chronicle(youThere ? `${f.name}：${f.line.replace(/“.*?”/g, "").replace(/。$/, "")}。` : `大家过了${f.name}，你不在。`);
}
/** In the morning of a festival someone reminds everyone. */
function festivalMorning() {
  const f = festivalToday(); if (!f) return;
  const aunt = npcs().find((q) => q.npc.key === "aunt") ?? npcs()[0];
  if (aunt) talks.push({ at: clock.min + 150, st: aunt, text: `“今天${f.name}，天黑都到公灶边来。”` });
}
/** The village book: the ladder (where you are, what is left), who lives here, and the history. */
function renderVillage() {
  const box = $("villageBook"); if (!box || box.hidden) return;
  const v = villageNow();
  const ladder = LADDER.map((r, i) => {
    const done = i < village.rung, cur = i === village.rung;
    const conds = cur ? `<ul>${r.conds.map((c) => `<li class="${condDone(c, v) ? "ok" : ""}">${c.text}${c.value ? `：${Math.min(c.value(v), c.need)}/${c.need}` : ""}</li>`).join("")}</ul><p class="doing">达成后：${r.unlock}</p>` : "";
    return `<div class="rung${done ? " done" : cur ? " cur" : ""}"><b>${done ? "✓ " : ""}${r.name}</b>${conds}</div>`;
  }).join("");
  const folks = npcs().filter((s) => !s.npc.arriving).map((s) => `<span title="${DEFS[s.npc.key].name}">${iconFor(DEFS[s.npc.key].icon)}<b>${DEFS[s.npc.key].name}</b><i>${tierOf(hearts(soc(s.npc))).name}</i></span>`).join("");
  const hist = [...village.chronicle].reverse().map((c) => `<li><i>第 ${c.year} 年 ${c.season} · 第 ${c.day} 天</i>${c.text}</li>`).join("") || "<li>还没有什么可记的。</li>";
  const ideas = THEORIES.filter((t) => lore.theories[t.id]).map((t) => `<li><b>${t.label}</b>${t.claim}<i>${DEFS[lore.theories[t.id].by]?.name ?? ""}琢磨出来的</i></li>`).join("");
  const customs = THEORIES.filter((t) => t.custom && lore.customs.includes(t.custom.id)).map((t) => `<li><b>${t.custom.name}</b>${t.custom.text}</li>`).join("");
  const made = INVENTIONS.filter((i) => lore.inventions[i.id]).map((i) => { const by = lore.inventions[i.id].by; return `<li><b>${i.name}</b>${DEFS[by]?.name ?? ""}想到的，可以找${PEOPLE_DATA[by]?.he ?? "他"}请教</li>`; }).join("");
  const needs = Object.entries(lore.needs).filter(([, n]) => n >= 1).map(([k]) => NEEDS[k]).filter(Boolean);
  const f = family(), kids = f.kids.map((k) => npcs().find((q) => q.npc.key === k)).filter(Boolean);
  const home = `<b class="sub">你家（第 ${me.gen ?? 1} 代）</b><p class="doing">${me.name ?? "启禾"}，${myAge()} 岁${f.spouse ? ` · 另一半：${DEFS[f.spouse]?.name}` : ""}${kids.length ? ` · 孩子：${kids.map((q) => `${nameOf(q)}（${npcAge(q.npc)} 岁）`).join("、")}` : ""}${me.expecting ? " · 家里要添人了" : ""}</p>`
    + (heirs().length ? `<button class="act" data-passon="1">退下来，把家交给${nameOf(heirs()[0])}</button>` : "");
  box.innerHTML = `<b>村子</b><div class="ladder">${ladder}</div>${home}<b class="sub">村里的人（${v.people} 人，能住 ${v.beds} 人）</b><div class="folks">${folks}</div>`
    + (needs.length ? `<b class="sub">大伙发愁的</b><p class="doing">${needs.join("、")}</p>` : "")
    + (ideas ? `<b class="sub">琢磨出的道理</b><ul class="lore">${ideas}</ul>` : "") + (customs ? `<b class="sub">规矩</b><ul class="lore">${customs}</ul>` : "")
    + (made ? `<b class="sub">想到的新东西</b><ul class="lore">${made}</ul>` : "") + `<b class="sub">村史</b><ul class="history">${hist}</ul>`;
}

// ---------------------------------------------------------------------------
// Weather with consequences: rain grows the crop, a dry spell in summer withers it, spring rains raise the lake over
// its banks. Food goes off (sooner in the heat). Animals breed in spring and summer and can be hunted out.
// A winter night out in the open, away from any fire, can make you ill.
// ---------------------------------------------------------------------------
const nature = { dryDays: 0, wetDays: 0, flood: false, drought: false };
/** Things that spoil, and how many days they keep (summer halves it). Grain keeps. */
const KEEPS = { herb: 6, fish: 2, meat: 2, berry: 2, clam: 2, egg: 4, peachFruit: 2, jujubeFruit: 4, mushroom: 3, roastFish: 3, roastMeat: 3, jarFull: 4, smokedFish: 12, smokedMeat: 12 };
const SHORE = ["reeds", "nest", "pit"];
const flooded = (key) => nature.flood && SHORE.includes(key);
const GROVE_KEYS = new Set(["chestnut", "pineGrove"]);
/** A grove someone has just taken the last wood from. */
const markCut = (t) => { if (GROVE_KEYS.has(t.key) && (t.stock ?? 0) <= 0) t.cutBare = true; };
function natureDay() {
  const s = season(), rain = weather.now === "雨";
  nature.wetDays = rain ? nature.wetDays + 1 : 0;
  nature.dryDays = !rain && weather.now !== "雪" && (s === "春" || s === "夏") ? nature.dryDays + 1 : 0;
  const fields = boards.world.filter((q) => isField(q) && q.cards[0].sown !== false).map((q) => q.cards[0]);
  // A dry spell changes the same field stock later read by the harvest command.
  const was = nature.drought;
  nature.drought = s === "夏" && nature.dryDays >= 3;
  if (nature.drought && !was) { needUp("more-grain"); needUp("know-season"); chronicle("连着几天没下雨，地皮都晒裂了。"); omen("“地皮都晒裂了……再不下雨，苗要蔫。”"); }
  for (const f of fields) {
    const rainGrowth = rain && (s === "春" || s === "夏") && randomWorld() < 0.5;
    const change = cropWeather(f, { day: day(), season: s, rain, rainGrowth, dryDays: nature.dryDays });
    if (!change) continue;
    const before = f.stock ?? 0;
    f.stock = change.stock;
    recordProduction(production, { kind: "crop-weather", minute: clock.min, source: f.key, sourceId: f.id,
      cause: change.cause, stockBefore: before, stockAfter: f.stock });
    refreshStock(f);
    if (change.cause === "drought") float("旱，苗蔫了", center(stackOf(f)), "world");
  }
  if (!nature.drought && was) chronicle("总算下了雨，旱过去了。");
  // spring rains raise the lake over its banks: the marsh and the clay pit are under water until a dry day
  for (const q of boards.world) if (GROVE_KEYS.has(q.cards[0].key) && (q.cards[0].stock ?? 0) >= 2) q.cards[0].cutBare = false;   // grown back
  const stumps = boards.world.filter((q) => GROVE_KEYS.has(q.cards[0].key) && q.cards[0].cutBare && (q.cards[0].stock ?? 0) <= 0).length;   // cut bare by people, not by frost
  const wasBare = (nature.felled ?? 0) >= BARE_HILLS;
  nature.felled = fellingNext(nature.felled, stumps);
  if (!wasBare && nature.felled >= BARE_HILLS) { chronicle("林子砍秃了好几片。"); omen("“树砍得太狠了。没了树根抓着，一下雨，山水下来得急。”"); }
  const wasFlood = nature.flood;
  nature.flood = s === "春" && nature.wetDays >= floodAfter(nature.felled);
  if (nature.flood !== wasFlood) {
    for (const st of boards.world.filter((q) => SHORE.includes(q.cards[0].key))) st.cards[0].el.classList.toggle("flooded", nature.flood);
    tide.painted = null; updateTide();
    if (nature.flood) { observe("river-rise"); needUp("flood"); chronicle("春雨下个不停，湖水漫上了岸，芦苇荡和黏土坑都泡在水里。"); omen("“湖水涨上来了，岸边别去。”"); }
    else chronicle("水退了，岸边又露出来了。");
  }
  if (nature.flood && nature.felled >= BARE_HILLS) for (const f of fields.filter((c) => (c.stock ?? 0) > 0)) {
    f.stock -= 1; refreshStock(f); float("山水冲了田", center(stackOf(f)), "world");
    if (!nature.washNoted) { nature.washNoted = true; chronicle("光秃秃的山坡挡不住水，春汛冲进了田里。"); }
  }
  // rabbits come out of the long grass at night and nibble the young crop; a dog about the yard keeps most of them off
  const rabbits = boards.world.filter((q) => q.critter?.kind === "rabbit").length;
  const guarded = boards.world.some((q) => q.pet);
  const guardOf = (c) => fieldGuard(stackOf(c).cards.slice(1).map((x) => x.key));
  const bitten = rabbitRaid({ rabbits, guarded, season: s }, fields.map((c) => ({ c, sown: c.sown, stock: c.stock, guard: guardOf(c) })), randomWorld).map((w) => w.c);
  for (const f of bitten) {
    f.stock -= 1; refreshStock(f); float("野兔啃了苗", center(stackOf(f)), "world"); observe("rabbits-eat-crop"); needUp("rabbits");
    if (!nature.rabbitNoted) { nature.rabbitNoted = true; chronicle("夜里野兔钻进田里，啃了一垄苗。"); omen("“兔子又来啃苗了。野果、庄稼越多，兔子越多。有狗看着会好些。”"); }
  }
  // a flood mark at the lake: after the first day of spring rain it shows the water creeping up
  if (s === "春" && rain && nature.wetDays === 1 && toolAt(find("lake"), "floodMark")) { omen("“记水木上水又涨了一道，再下一天就要漫岸了。”"); toast("记水木：湖水涨了一道，明天再下雨就要漫岸"); }
  const pit = find("compost")?.cards[0];
  if (pit) {                                                   // kitchen scraps every day; three loads make one of muck
    pit.heap = Math.min(12, (pit.heap ?? 0) + 1);                // a full pit takes no more
    while (pit.heap >= 3 && pileCount("muck") < 6) { pit.heap -= 3; storeHome([newCard("muck")]); }
  }
  if ((homePile()?.cards.length ?? 0) > 16) needUp("clutter");
  const heapUp = homePile();
  if (heapUp && rain && inYard(center(heapUp))) {             // out in the rain: past twenty of a kind, half the extra rots
    const n = {}, gone = [];
    for (const c of heapUp.cards) n[c.key] = (n[c.key] ?? 0) + 1;
    for (const [k, v] of Object.entries(n)) if (v > OPEN_PILE && DEFS[k].type !== "tool") {
      let drop = Math.ceil((v - OPEN_PILE) / 2);
      heapUp.cards = heapUp.cards.filter((c) => (c.key === k && drop-- > 0 ? (gone.push(c), false) : true));
    }
    if (gone.length) {
      gone.forEach((c) => c.el.remove());
      const rot = find("compost")?.cards[0];
      if (rot) rot.heap = Math.min(12, (rot.heap ?? 0) + gone.length);
      toast(`院里露天堆得太多，淋雨沤坏了 ${gone.length} 份${rot ? "，倒进了堆肥坑" : ""}`);
      if (!nature.pileRotNoted) { nature.pileRotNoted = true; chronicle("院里露天堆的东西太多，一场雨沤坏了不少。得有个能遮雨的地方放。"); }
      needUp("clutter", 2);
    }
  }
  spoil();
  breed();
  groundChanged();
  thinkTick();
}
// ---------------------------------------------------------------------------
// The storyteller (storyteller.js): now and then something nobody planned. Bad news sends word a day ahead.
// ---------------------------------------------------------------------------
function storyDay() {
  const st = (village.story ??= { lastEvent: 0, pending: null }), diff = me.difficulty ?? "寻常";
  if (st.pending) {
    if (st.pending.day <= day()) { const id = st.pending.id; st.pending = null; happen(id); }
    return;
  }
  const folk = npcs().filter((q) => PD(q));
  const ev = pickEvent({
    day: day(), lastEvent: st.lastEvent, difficulty: diff, season: season(), grain: find("granary")?.cards[0].stock ?? 0, people: headcount(),
    mood: folk.length ? folk.reduce((n, q) => n + (q.npc.mood ?? 6), 0) / folk.length : 6, dry: nature.dryDays >= 2,
    flammable: ["reed", "fiber", "log", "wood"].reduce((n, k) => n + (homePile()?.cards.filter((c) => c.key === k).length ?? 0), 0),
  }, randomWorld);
  if (!ev) return;
  st.lastEvent = day();
  if (ev.omen) { st.pending = { id: ev.id, day: day() + 1 }; omen(ev.omen); toast(`村里有人念叨：${ev.omen}`); sfx("omen"); return; }   // word gets round
  happen(ev.id);
}
/** Carry an event out, and write it down. */
function happen(id) {
  const diff = me.difficulty ?? "寻常", ev = { id }, folk = npcs().filter((q) => PD(q) && !q.npc.arriving);
  const say1 = (t) => { chronicle(t); toast(t); };
  if (id === "fish-run") { const l = find("lake")?.cards[0]; if (l) { l.stock = (l.stock ?? 0) + 5; refreshStock(l); } say1("湖里起了鱼汛，捞一网是一网。"); }
  if (id === "bumper") { for (const k of ["berries", "peach", "jujube"]) for (const q of boards.world.filter((x) => x.cards[0].key === k)) { q.cards[0].stock = (q.cards[0].stock ?? 0) + 4; refreshStock(q.cards[0]); } say1("今年野果结得格外多，枝子都压弯了。"); }
  if (id === "traveller") {
    const pool = ["bean", "bean", "rope", "flint", "herb", "herb", "fiber"], gifts = [0, 1, 2].map(() => pool[Math.floor(randomWorld() * pool.length)]);
    storeHome(gifts.map((k) => newCard(k)));
    say1(`一个过路的老人歇了歇脚，走前留下${[...new Set(gifts)].map((k) => DEFS[k].name).join("、")}，放在院里了。`);
  }
  if (id === "rats") {
    const g = find("granary")?.cards[0];
    if (g?.stock) {
      const pit = boards.world.some((q) => q.cards[0].key === "granaryPit"), lost = Math.max(1, Math.ceil(g.stock * harm(diff, 0.25) * (pit ? 0.5 : 1)));
      g.stock -= lost; refreshStock(g); needUp("preserve-food");
      say1(`公仓闹了耗子，${lost} 份粟被祸害了${pit ? "（粮窖里存的没事）" : ""}。`);
    }
  }
  if (id === "fever" && folk.length) {
    const q = folk[Math.floor(randomWorld() * folk.length)], n = q.npc;
    n.sickUntil = clock.min + 2 * 1440 * harm(diff, 1);
    if (pileCount("herb")) { const pile = homePile(), h = pile?.cards.find((c) => c.key === "herb"); if (h) { pile.cards = pile.cards.filter((c) => c !== h); h.el.remove(); n.sickUntil = clock.min + 720; } say1(`${nameOf(q)}发了烧，喝了院里存的药草，躺半天就好。`); }
    else say1(`${nameOf(q)}发了烧，躺倒了，这两天干活没力气。家里要是存着药草就好了。`);
  }
  if (id === "cold-snap") { nature.coldSnapUntil = day() + 1; if (season() === "冬") setWeather("雪", 0.85); say1("寒潮来了，这两天火塘和灶一天要烧两天的柴。"); }
  if (id === "fire") {
    const pile = homePile();
    if (pile) {
      const burnt = pile.cards.filter((c) => ["reed", "fiber", "log", "wood"].includes(c.key) && randomWorld() < harm(diff, 0.3));
      pile.cards = pile.cards.filter((c) => !burnt.includes(c)); burnt.forEach((c) => c.el.remove());
      say1(burnt.length ? `院里起了火，堆着的柴草烧掉了 ${burnt.length} 份。` : "院里窜起一股火苗，好在扑得快。");
    }
  }
  if (id === "quarrel" && folk.length >= 2) {
    const [a, b] = folk.slice().sort((x, y) => (x.npc.mood ?? 6) - (y.npc.mood ?? 6));
    for (const q of [a, b]) { q.npc.mood = Math.max(0, (q.npc.mood ?? 6) - 1.5); q.npc.nextChat = clock.min + 1440; }
    say1(`${nameOf(a)}和${nameOf(b)}为一点小事吵了起来，一天没说话。`);
  }
  return ev;
}
/** Someone remarks on the signs, a little after dawn. */
function omen(text) { const who = npcs().find((q) => !q.npc.arriving); if (who) talks.push({ at: clock.min + 120, st: who, text }); }
/** Food left lying about (or carried) goes off; the pot on the stove turns in summer heat. */
function spoil() {
  const hot = season() === "夏", lost = [];
  for (const st of allStacks()) {
    if (st.npc || st.critter) continue;
    const cool = st.store && find("cellar") ? 2 : 1;             // the cellar keeps the yard's food twice as long
    const keep = st.cards.filter((c) => !(KEEPS[c.key] && c.made !== undefined && day() - c.made > (hot ? Math.ceil((KEEPS[c.key] * cool) / 2) : KEEPS[c.key] * cool)));
    if (keep.length === st.cards.length) continue;
    st.cards.filter((c) => !keep.includes(c)).forEach((c) => { lost.push(DEFS[c.key].name); c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); });
    if (!keep.length) removeStack(st); else st.cards = keep;
  }
  const stove = find("stove")?.cards[0];
  if (hot && stove?.stock > 2) { stove.stock -= 1; refreshStock(stove); lost.push("一份熟食"); }
  const rot = find("compost")?.cards[0];
  if (rot && lost.length) rot.heap = Math.min(12, (rot.heap ?? 0) + lost.length);
  if (lost.length) { toast(`放坏了：${[...new Set(lost)].join("、")}${rot ? "，倒进了堆肥坑" : ""}`); carryChanged(); observe("food-spoils", lost.length); needUp("preserve-food"); }
}
/** Animals have young in spring and summer — if any are left to have them; now and then one wanders in from the deep wood. */
function breed() {
  const warm = season() === "春" || season() === "夏";
  settleDucks(warm);
  for (const [kind, sp] of Object.entries(SPECIES)) {
    if (kind === "duck") continue;
    const alive = boards.world.filter((q) => q.critter?.kind === kind).length;
    const cap = kind === "rabbit" ? rabbitCap(forage()) : sp.n;
    if (alive > cap && randomWorld() < 0.5) { removeWildAnimal(boards.world.find((q) => q.critter?.kind === kind)); continue; }   // not enough to eat: it moves on
    if (alive >= cap) continue;
    if (alive > 0 && warm && randomWorld() < (kind === "rabbit" ? 0.7 : 0.4)) spawnAnimal(kind);
    else if (alive === 0 && randomWorld() < (kind === "tiger" ? 0.15 : 0.06)) { spawnAnimal(kind); if (kind !== "tiger") chronicle(`林子里又见着${DEFS[kind].name}了。`); }
  }
}
/** What a rabbit can eat: berries on the bushes and the crop standing in the fields. */
const forage = () => boards.world.reduce((n, q) => n + (q.cards[0].key === "berries" || (isField(q) && q.cards[0].sown !== false) ? q.cards[0].stock ?? 0 : 0), 0);
function settleDucks(warm) {
  for (const duck of livingDucks()) {
    if (duckAge(duck) >= 18 + duck.cards[0].id % 8) {
      const at = center(duck);
      removeWildAnimal(duck);
      if (known(at)) float("一只老野鸭不再动了", at, "world");
    } else labelDuck(duck);
  }
  const birds = livingDucks();
  if (!birds.length) {
    nature.duckBrood = null;
    nature.duckReturnAt ??= day() + 4;
    if (warm && day() >= nature.duckReturnAt) { spawnAnimal("duck"); spawnAnimal("duck"); delete nature.duckReturnAt; }
    return;
  }
  delete nature.duckReturnAt;
  if (nature.duckBrood) {
    const parent = birds.find((duck) => duck.id === nature.duckBrood.parentId);
    if (!parent || !warm) nature.duckBrood = null;
    else if (day() >= nature.duckBrood.due) {
      if (birds.length < 6) {
        const nest = find("nest"), at = nest ? center(nest) : center(parent);
        const shore = duckShore().slice().sort((a, b) => dist(at, a.dry) - dist(at, b.dry))[0];
        const young = spawnAnimal("duck", shore?.dry ?? center(parent));
        young.critter.mother = parent.id;
        if (known(center(young))) float("小野鸭出壳了", center(young), "world");
      }
      nature.duckBrood = null;
    }
    return;
  }
  const mother = birds.find((duck) => duckAge(duck) >= 3 && duck.critter.sex === "female");
  const mate = birds.some((duck) => duckAge(duck) >= 3 && duck.critter.sex === "male");
  const nest = find("nest");
  if (warm && !nature.flood && birds.length < 6 && mother && mate && nest?.cards[0].stock > 0 &&
      commitProduction(mother, nest, { kind: "duck-brood", cost: 1 })) {
    nature.duckBrood = { parentId: mother.id, due: day() + 2 };
    deplete(nest.cards[0], false);
  }
}
/** A winter night outside, away from fire and without a torch, chills you through; too long and you fall ill. */
function coldTick(minutes) {
  const you = youStack();
  if (!you || you.board !== "world" || season() !== "冬" || darkness() < 0.6) { me.cold = Math.max(0, (me.cold ?? 0) - minutes); return; }
  const p = center(you), warm = inYard(p) || litAt(p) || you.cards.some((c) => c.key === "torch");
  me.cold = Math.max(0, (me.cold ?? 0) + (warm ? -minutes : you.cards.some((c) => c.key === "cloth") ? minutes / 2 : minutes));
  if (me.cold > 150 && !isSick()) {
    me.sickUntil = clock.min + 1.5 * 1440; me.cold = 0; observe("cold-sick"); needUp("cold");
    toast("冻着了：浑身发冷，干活慢、走不远，歇一天半才好"); chronicle("你在冬夜里冻病了。");
  }
}
const isSick = () => clock.min < (me.sickUntil ?? 0);

// ---------------------------------------------------------------------------
// What the village comes to know (knowledge.js): troubles that keep coming back grow into needs, things seen again
// and again get summed up into theories — wrong ones first — and a right theory plus a pressing need makes someone
// think of something new, which they can then teach. Wrong theories become customs.
// ---------------------------------------------------------------------------
const lore = { needs: {}, seen: {}, theories: {}, inventions: {}, customs: [] };
const observe = (ph, n = 1) => { lore.seen[ph] = (lore.seen[ph] ?? 0) + n; };
const needUp = (id, n = 1) => { lore.needs[id] = (lore.needs[id] ?? 0) + n; };
const invented = (x) => !x?.inv || Boolean(lore.inventions[x.inv]);
/** Someone now knows how: they can make it and teach it. */
function unlockInvention(id, key) {
  lore.inventions[id] ??= { by: key, day: day() };
  for (const r of RECIPES) if (r.inv === id && !r.who.includes(key)) r.who.push(key);
  for (const b of Object.values(BUILDS)) if (b.inv === id && !b.who.includes(key)) b.who.push(key);
  renderCrafts();
}
/** A custom from a wrong theory: some of them become a day the village keeps. */
function adoptCustom(c) {
  if (!lore.customs.includes(c.id)) lore.customs.push(c.id);
  if (c.id === "lake-offering" && !FESTIVALS.some((f) => f.id === "lake-offering"))
    FESTIVALS.push({ id: "lake-offering", season: "春", day: 2, name: "祭湖", line: "大家把一条最肥的鱼放回湖里，求湖神今年别漫岸。", cost: {} });
}
/** Once a day: maybe someone sums up what they have seen, or thinks of something. One new idea a day at most. */
function thinkTick() {
  const folk = npcs().filter((q) => !q.npc.arriving);
  if (!folk.length) return;
  for (const t of THEORIES) {
    if (lore.theories[t.id] || (lore.seen[t.explains] ?? 0) < t.needs || randomWorld() > 0.5) continue;
    const who = pick(folk);
    lore.theories[t.id] = { by: who.npc.key, day: day() };
    // The old lore aggregates sightings for the village, not per-person witnesses.
    // Do not invent a personal sighting: this NPC inferred a claim from shared observations.
    acquireTheory(npcKnowledge, npcIdentity(who), t.id, { day: day(), source: "inferred-from-community-observations", awareness: "examined", confidence: 0.75 });
    talks.push({ at: clock.min + 60 + randomWorld() * 240, st: who, text: t.claim });
    chronicle(`${nameOf(who)}琢磨出一个说法：${t.label}。`);
    if (t.custom) { adoptCustom(t.custom); chronicle(`村里有了个规矩：${t.custom.name}——${t.custom.text}。`); }
    return;
  }
  for (const inv of INVENTIONS) {
    if (lore.inventions[inv.id] || (inv.principle && !lore.theories[inv.principle]) || (lore.needs[inv.need[0]] ?? 0) < inv.need[1]) continue;
    const who = folk.find((q) => q.npc.key === lore.theories[inv.principle]?.by) ?? pick(folk);
    unlockInvention(inv.id, who.npc.key);
    talks.push({ at: clock.min + 90, st: who, text: inv.idea });
    banner("✦", `${nameOf(who)}想到了：${inv.name}`);
    chronicle(`${nameOf(who)}想到了${inv.name}，可以找${PD(who)?.he ?? "他"}请教。`);
    return;
  }
}

// ---------------------------------------------------------------------------
// A life: everyone grows older (three years for every year of the game, so a life fits in an evening or two of play),
// marries, has children, dies. When you die your grown child carries on: your things, the start of your crafts, and
// half the goodwill the village had for you. No grown child: a young stranger takes up the life instead.
// ---------------------------------------------------------------------------
const AGE_PER_YEAR = 3, DAYS_PER_YEAR = DAYS_PER_SEASON * 4;
const ageOf = (born) => Math.floor(((day() - born) * AGE_PER_YEAR) / DAYS_PER_YEAR);
const bornFor = (age) => day() - (age * DAYS_PER_YEAR) / AGE_PER_YEAR;
const myAge = () => ageOf(me.born ?? bornFor(16));
const npcAge = (n) => ageOf(n.born ?? bornFor(PEOPLE_DATA[n.key]?.age ?? 25));
/** How old someone looks: you can tell roughly, not to the year. */
const looksAge = (a) => (a < 4 ? "还抱在怀里" : a < 8 ? "满地跑的年纪" : a < 13 ? "半大孩子" : a < 18 ? "十几岁" : a < 25 ? "二十来岁" : a < 60 ? `${["三", "四", "五"][Math.floor(a / 10) - 3]}十${a % 10 < 4 ? "出头" : "来岁"}` : "上了年纪");
const isKid = (st) => Boolean(st?.npc?.kid) && npcAge(st.npc) < 16;
const family = () => (me.family ??= { spouse: null, kids: [] });
const kidName = (k) => me.defs?.[k]?.name ?? DEFS[k]?.name ?? "孩子";
/** Cards made up during play (children, a parent retired) need their entry back after loading. */
function defineCard(key, def) { (me.defs ??= {})[key] = def; DEFS[key] = { type: "person", ...def }; }
const KID_LINES = { baby: ["（咿咿呀呀地冲你笑）", "（抓着你的手指不放）"], small: ["“你看！我抓到一只蚂蚱！”", "“陪我玩一会儿嘛。”", "“我也要去湖边！”"], youth: ["“我能帮着干活了。”", "“阿三说我锄地锄得直。”", "“等我长大了，也要去山那边看看。”"] };
function kidTalk(st) {
  const a = npcAge(st.npc);
  say(st, pickLine(KID_LINES[a < 4 ? "baby" : a < 12 ? "small" : "youth"]));
}
/** Can you ask this person to marry you? Both grown, neither married, close, and not too far apart in years. */
function canCourt(st) {
  const n = st.npc, f = family();
  if (!n || n.kid || n.spouse || f.spouse || !PD(st)) return false;
  return myAge() >= 18 && npcAge(n) >= 18 && Math.abs(npcAge(n) - myAge()) <= 15 && hearts(soc(n)) >= 6;
}
function court(st) {
  const n = soc(st.npc), h = hearts(n), P = PD(st);
  if (h >= 8 || randomWorld() < (h - 5) / 3) {
    family().spouse = st.npc.key; st.npc.spouse = "you";
    bondUp(st, { trust: 1 });
    say(st, P.court?.accept ?? `${nameOf(st)}低头想了一会儿，点了点头：“好。”`);
    banner("✦", `你和${nameOf(st)}成了家`); chronicle(`你和${nameOf(st)}成了一家人。`);
    memo(st, "跟你成了家");
  } else { say(st, P.court?.notYet ?? `“……再等等吧。”`); n.courtDay = day(); }
}
const canHaveChild = () => { const f = family(); return Boolean(f.spouse) && !me.expecting && f.kids.length < 4 && myAge() < 48 && npcs().some((q) => q.npc.key === f.spouse); };
function wantChild(st) {
  me.expecting = day() + DAYS_PER_SEASON;                                 // about a season
  say(st, pickLine(["“……嗯。”", "“好。”", "（脸一下红了）"]));
  chronicle("家里要添人了。");
}
function birth() {
  me.expecting = 0;
  const f = family(), n = f.kids.length + (me.kidCount ?? 0) + 1;
  const key = `kid${me.gen ?? 1}_${n}`;
  defineCard(key, { name: `孩子`, icon: "yu", text: "你家的孩子。小时候在院子附近玩，十二岁起帮着干点活，十六岁成人。" });
  const bed = beds().find((b) => b.cards[0].key === "bed") ?? beds()[0];
  const st = placeCard(key, center(bed));
  st.npc = { key, order: npcs().length, home: "taoHouse", job: "play", hunger: 1, wait: 0, inside: false, kit: [], kid: true, born: day(), wake: 6.5, sleep: 19.5, outAt: 0, nextChat: clock.min + 600 };
  f.kids.push(key); me.kidCount = (me.kidCount ?? 0) + 1;
  banner("✦", "孩子出生了");
  naming = { kidKey: key, card: st.cards[0] }; $("nameInput").value = ""; $("namer").hidden = false; $("nameInput").focus();
}
/** The name you give the child (or the stranger who takes up your life). */
function nameKid(key, card, name) {
  name = name || "小禾";
  defineCard(key, { ...me.defs[key], name });
  card.el.querySelector(".card-head span").textContent = name;
  chronicle(`${name}出生了。`);
}
/** Someone dies of old age: the village mourns, and the work they did is taken up by someone else. */
function npcDies(st) {
  const name = nameOf(st), age = npcAge(st.npc), f = family();
  st.cards.forEach((c) => { c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 400); });
  st.bubble?.el.remove();
  removeStack(st);
  for (const q of npcs()) { const n = soc(q.npc); n.mood = Math.max(0, n.mood - 2); }
  village.lastDeath = { day: day(), name };
  if (f.spouse === st.npc.key) { f.spouse = null; chronicle(`你的另一半${name}走了，享年 ${age} 岁。`); }
  else chronicle(`${name}走了，享年 ${age} 岁。`);
  f.kids = f.kids.filter((k) => k !== st.npc.key);
  banner("……", `${name}走了`);
  coverJobs();
}
/** The stove and the fields must have someone: if nobody does the work any more, the most likely person takes it up. */
function coverJobs() {
  const grown = npcs().filter((q) => !isKid(q) && !q.npc.arriving && !q.npc.retired);
  for (const job of ["cook", "farm"]) {
    if (grown.some((q) => q.npc.job === job)) continue;
    const who = grown.find((q) => q.npc.job === (job === "cook" ? "fish" : "reed")) ?? grown.find((q) => q.npc.job !== "cook" && q.npc.job !== "farm");
    if (who) { who.npc.job = job; chronicle(`往后${job === "cook" ? "灶上" : "地里"}的活，由${nameOf(who)}接过去了。`); }
  }
}
/** Once a day: children grow into helpers and then grown-ups, the old may die, a baby may be due, and so may you. */
function lifeDay() {
  for (const st of npcs()) {
    const n = st.npc, a = npcAge(n);
    if (n.kid) {
      if (a >= 12 && n.job === "play") { n.job = "help"; chronicle(`${nameOf(st)}能帮着干活了。`); }
      if (a >= 16 && n.job === "help") { n.job = "farm"; n.kid = false; n.grown = true; chronicle(`${nameOf(st)}长大成人了。`); banner("✦", `${nameOf(st)}长大成人了`); }
    }
    if (a >= 64 && randomWorld() < 0.03 + (a - 64) * 0.012) npcDies(st);
  }
  if (me.expecting && day() >= me.expecting) birth();
  const a = myAge();
  if (a === 50 && me.toldAge !== 50) { me.toldAge = 50; toast("你五十了：力气不比从前"); }
  if (a >= 60 && randomWorld() < 0.025 + (a - 60) * 0.01) passOn(true);
}
const heirs = () => family().kids.map((k) => npcs().find((q) => q.npc.key === k)).filter((q) => q && npcAge(q.npc) >= 16);
/** The life passes to your grown child (or, with none, to a young stranger who comes to stay).
 *  died: false when you step down yourself — then you stay on in the yard, an old person among the others. */
function passOn(died, heirSt = heirs()[0]) {
  const you = youStack(), old = me.name ?? "启禾", oldAge = myAge(), f = family();
  if (!died) {                                                           // stepping down: you stay, as one of the village
    const key = `elder${me.gen ?? 1}`;
    defineCard(key, { name: old, icon: "you", text: "上一代当家的，退下来在院里养老。" });
    const st = placeCard(key, center(you));
    st.npc = { key, order: npcs().length, home: "taoHouse", job: "play", retired: true, hunger: 2, wait: 0, inside: false, kit: [], born: me.born, wake: 6, sleep: 19.5, outAt: 0, nextChat: clock.min + 300 };
  }
  // the goodwill the village had for you passes on, halved; what they remember is that this is your child
  for (const q of npcs()) {
    if (!q.npc.bond) continue;
    const n = soc(q.npc);
    for (const k of ["fam", "trust", "grudge"]) n.bond[k] *= 0.5;
    n.bond.owe = 0; n.req = null; n.known = { loves: [], dislikes: [] }; n.heartSeen = n.heartSeen.filter((h) => h <= 2);
    n.mem = [{ day: day(), text: heirSt ? `${old}家的孩子` : "新来的" }];
  }
  for (const k of Object.keys(me.known)) me.known[k].mem = Math.min(me.known[k].mem, 0.6);   // the start of each craft, from watching
  let name;
  if (heirSt) {
    name = nameOf(heirSt);
    me.born = heirSt.npc.born; me.gen = (me.gen ?? 1) + 1;
    f.kids = f.kids.filter((k) => k !== heirSt.npc.key);
    you.x = heirSt.x; you.y = heirSt.y;
    heirSt.cards.forEach((c) => c.el.remove()); removeStack(heirSt);
    me.family = { spouse: null, kids: [], parent: f.spouse, siblings: f.kids };
  } else {
    name = pick(["阿禾", "阿穗", "阿田", "阿岩"]);
    me.born = bornFor(18); me.family = { spouse: null, kids: [] };
  }
  me.name = name; me.food = 80; me.rest = 90; me.sickUntil = 0;
  const c = you.cards[0]; c.name = `你 · ${name}`; c.el.querySelector(".card-head span").textContent = c.name;
  chronicle(died ? `${old}走了，享年 ${oldAge} 岁。${heirSt ? `家交给了${name}。` : `没有留下能当家的后人；村里来了个外乡的年轻人${name}，接着过日子。`}` : `${old}退下来养老，家交给了${name}。`);
  banner(died ? "……" : "✦", died ? `${old}走了。往后是${name}的日子` : `${name}当家了`);
  coverJobs(); renderPromises(); renderParty(); carryChanged();
}

// ---------------------------------------------------------------------------
// Further off: up the plateau's cliff with a climbing rope (once you've been up, the rope stays and anyone can use it),
// the lookout that shows smoke far away, and the trader who comes from there now and then to swap things.
// ---------------------------------------------------------------------------
/** At the cliff: up with a rope (or the one you left hanging), and down again from the top. */
function climb(st, from) {
  const you = st, top = find("cliffTop"), foot = find("cliffFoot");
  if (!top || !foot) return;
  if (from === "cliffFoot") {
    me.sawCliff = true;
    if (!me.ropeHung && !holds(you, "climbRope")) return toast(HINT.cliffFoot);
    if (!me.ropeHung) { wearTool(you, "climbRope"); me.ropeHung = true; chronicle("你头一回拿攀绳爬上了高原，绳子就留在了崖上。"); banner("✦", "爬上了高原"); }
    me.rest = Math.max(0, me.rest - 15);
    Object.assign(you, standOn(you, top)); explore(center(top));
    toast("爬上来了：高原上一步比一步费力气");
  } else {
    Object.assign(you, standOn(you, foot)); explore(center(foot));
    toast("顺着绳子下来了");
  }
  cam.follow = true; carryChanged();
}
/** The lookout: the first time, you see smoke far to the south-east — there are people there, and they will come. */
function lookOut() {
  if (!village.sawPirateIsland) {
    discoverBlackReef();
    chronicle("站在远眺石上，望见东南外海的黑礁岛，岛边有一面黑帆。");
  }
  if (village.sawSmoke) return toast("东南边的炊烟还在，筏子从湖那头来");
  village.sawSmoke = true; village.nextTrader = clock.min + 1440;
  banner("✦", "望见远处的炊烟");
  chronicle("你在高原的远眺石上，望见东南边远远有几缕炊烟——那边还有人家。");
}

function setupBlackReef() {
  if (find("blackReef")) return;
  const tile = MAP.tiles.blackReef;
  placeCard("blackReef", { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 });
}
function discoverBlackReef() {
  const island = find("blackReef");
  if (island) explore(center(island));
  village.sawPirateIsland = true;
}
function coastRaidTick(minutes, you) {
  let party = boards.world.find((st) => st.raid);
  const granary = find("granary");
  if (!granary) return;
  if (!party) {
    if (day() < 7 || (!village.sawPirateIsland && village.rung < 1)) return;
    if (!village.pirateWarning) {
      village.pirateWarning = day(); village.nextRaidDay = day() + 1;
      chronicle("湖口有人看见黑帆，说那伙人正在沿岸打听哪里有粮。");
      toast("湖口有人看见黑帆，说他们在沿岸打听粮仓");
      return;
    }
    if (day() < (village.nextRaidDay ?? day()) || hour() < 7 || hour() >= 12) return;
    village.nextRaidDay = day() + 5;
    const route = coastRaidRoute(MAP, center(granary));
    if (!route) return;
    const start = route.points[0], card = newCard("coastRaider");
    party = newStack([card], start.x - CARD_W / 2, start.y - CARD_H / 2, "world");
    party.raid = { ...route, index: 1, retreat: false, landed: false };
  }
  const raid = party.raid, here = center(party);
  const armed = you?.board === "world" && holds(you, "spear") && dist(center(you), here) < 240;
  if (!raid.retreat && raid.landed && armed && !reachAlong(MAP, here, center(you)).blocked) {
    wearTool(you, "spear");
    chronicle("你举矛守住粮仓，黑帆的人退回了船边。");
    toast("你举起石矛，来人转身往岸边退");
    raid.retreat = true; raid.index--;
  }
  const p = raid.points[raid.index];
  if (!p) return;
  const length = dist(here, p), stride = (raid.landed ? 15 : 21) * minutes;
  const t = length <= stride ? 1 : stride / length;
  party.x += (p.x - here.x) * t; party.y += (p.y - here.y) * t;
  if (t < 1) return;
  if (raid.index === raid.landing) {
    raid.landed = !raid.retreat;
    party.cards[0].el.querySelector(".card-art").innerHTML = iconFor(raid.landed ? "boatman" : "boat");
    if (!raid.retreat) toast("黑帆船靠了岸，有人朝粮仓来了");
  }
  if (raid.retreat && raid.index === 0) {
    party.cards[0].el.remove(); removeStack(party);
    return;
  }
  if (raid.index === raid.points.length - 1) {
    const loss = raidLoot(granary.cards[0].stock, seedReserve());
    const took = loss && commitProduction(party, granary, { kind: "coast-raid", cost: loss }, { details: { resource: "grain", removed: loss } });
    const outcome = took ? `黑帆的人抢走公仓 ${loss} 份粟，退回了岸边。` : "黑帆的人在公仓没抢到可带走的粟，退回了岸边。";
    chronicle(outcome); toast(outcome);
    raid.retreat = true;
  }
  raid.index += raid.retreat ? -1 : 1;
}
/** What the trader will take, and what for. */
const TRADES = [
  { give: { smokedFish: 2 }, get: "jar" }, { give: { hide: 1 }, get: "jar" }, { give: { grain: 3 }, get: "salt" },
  { give: { rope: 2 }, get: "salt" }, { give: { hide: 2 }, get: "cloth" }, { give: { malachite: 1 }, get: "cloth" },
  { give: { malachite: 2 }, get: "net" },
];
const TRADER_LINES = ["“东南边过来的。你们这儿有熏鱼吗？”", "“筏子划了大半天，先让我喘口气。”", "“那块绿石头，我们那边有人稀罕。”", "“盐是好东西，鱼抹了盐放得住。”"];
/** Every few days, once you know there are people out there, the trader comes over the lake and waits by the stove till afternoon. */
function considerTrader() {
  if (!(village.sawSmoke || village.rung >= 3) || clock.min < (village.nextTrader ?? Infinity) || hour() < 9 || hour() > 11) return;
  if (boards.world.some((q) => q.npc?.visitor)) return;
  village.nextTrader = clock.min + (3 + randomWorld() * 2) * 1440;
  const t = MAP.tiles.lake, p = settle(t.x + t.w * 0.95, t.y + t.h * 0.35);
  const st = placeCard("trader", p);
  st.npc = { key: "trader", order: 9, visitor: true, home: "taoHouse", job: "trade", hunger: 0, wait: 0, inside: false, kit: [], from: p, wake: 0, sleep: 24, outAt: 0 };
  explore(p);
  toast("湖那头划来一只筏子：有人来换东西了");
}
/** The trader's day: to the stove, wait there, and in the afternoon back to the raft. */
function visitorBrain(st) {
  const n = st.npc;
  if (st.walk || st.job) return;
  if (n.leaving) { st.cards.forEach((c) => c.el.remove()); st.bubble?.el.remove(); removeStack(st); return; }
  if (hour() >= 16) {
    n.leaving = true; say(st, "“天不早了，我得趁亮划回去。下回再来。”");
    const path = findPath(MAP, center(st), n.from);
    st.walk = path ? { path: path.slice(0, -1), k: 0, x: n.from.x - CARD_W / 2, y: n.from.y - CARD_H / 2 } : null;
    if (!path) n.leaving = true;
    return;
  }
  if (st.goal !== "stove" && !n.atStove) { go(st, "stove", "trade"); n.atStove = true; return; }
  n.wait = 90; if (randomVoice() < 0.3 && heard(st)) say(st, pickLine(TRADER_LINES));
}
function tradeBlock(st) {
  const you = youStack(), near = you && dist(center(you), center(st)) < 600;
  const has = (k, n) => loose(you).filter((c) => c.key === k).length >= n;
  return `<p class="doing">${near ? "带着东西走近了，就能换：" : "走近了才能换东西"}</p><div class="trades">${TRADES.map((t, i) => {
    const ok = near && Object.entries(t.give).every(([k, n]) => has(k, n));
    return `<button class="act${ok ? "" : " ghost"}" data-trade="${i}" data-id="${st.id}" ${ok ? "" : "disabled"}>${Object.entries(t.give).map(([k, n]) => `${DEFS[k].name}×${n}`).join("、")} → ${DEFS[t.get].name}</button>`;
  }).join("")}</div>`;
}
function trade(st, i) {
  const t = TRADES[i], you = youStack();
  if (!t || !you || !st?.npc?.visitor || dist(center(you), center(st)) >= 600) return;
  const use = Object.entries(t.give).flatMap(([key, count]) => Array(count).fill(key));
  if (!commitProduction(you, st, { kind: "trade", use, output: [t.get] })) return toast("带的东西不够，没换成");
  village.traded = (village.traded ?? 0) + 1;
  if (village.traded === 1) chronicle(`头一回跟东南边来的阿贾换了东西：换到一件${DEFS[t.get].name}。`);
  say(st, pickLine(["“成，换了。”", "“这买卖公道。”", "“下回多备点熏鱼。”"]));
  overflow(you); carryChanged();
}

// ---------------------------------------------------------------------------
// Saving: the land comes back from its seed; everything on it — cards, people, the clock, the weather, the season's
// look, what you have explored and know — is written to the browser every little while and read back on opening.
// ?new=1 starts a fresh life (and drops the old save); ?day=N is a preview and never touches the save.
// ---------------------------------------------------------------------------
const SAVE_KEY = `openlife.cardworld.${seed}`, SAVE_VERSION = 1;
const preview = params.has("day");
let importingSave = false, saveWriteBlocked = false;
const PREVIOUS_KEY = `openlife.cardworld.${seed}.previous`;
const importKey = (key) => `openlife.cardworld.${key}.import`;
const importErrorKey = "openlife.cardworld.import-error";
const savedId = (id) => Number.isSafeInteger(id) && id > 0 ? id : undefined;
function validSave(data) {
  return data?.v === SAVE_VERSION && Number.isFinite(data.seed) && Number.isFinite(data.min) &&
    data.me && data.weather && data.look && ["world", "tao"].every((b) => Array.isArray(data.boards?.[b])) &&
    Object.values(data.boards).every((list) => Array.isArray(list) && list.every((st) => st.cards?.length &&
      st.cards.every((card) => Object.hasOwn(DEFS, card.key) || Object.hasOwn(data.me.defs ?? {}, card.key)))) &&
    Object.values(data.boards).some((list) => list.some((st) => st.cards[0].key === "you")) &&
    [data.respawns, data.eco, data.discs, data.fields].every(Array.isArray);
}
const CARD_SKIP = new Set(["el", "w", "h"]);
function cardOut(c) {
  const o = {};
  for (const [k, v] of Object.entries(c)) if (!CARD_SKIP.has(k)) o[k] = v;
  o.tier = Object.keys(TIERS).find((t) => TIERS[t][0] === c.w) ?? "s";
  return o;
}
function cardIn(o, ids) {
  const c = newCard(o.key, o.stock, o.tier, savedId(o.id));
  for (const [k, v] of Object.entries(o)) if (k !== "id" && k !== "tier") c[k] = v;
  ids.set(o.id, c);
  if (c.name) c.el.querySelector(".card-head span").textContent = c.name;
  if (c.key === "plot") refreshPlot(c);
  if (c.key === "field" || c.key === "field2") c.el.querySelector(".card-art").innerHTML = iconFor(c.stock >= 3 && c.sown !== false ? "fieldRipe" : "field");
  refreshStock(c);
  return c;
}
const recipeRef = (r) => (r === TORCH_FROM_STOVE ? "torch" : RECIPES.indexOf(r));
const recipeOf = (i) => (i === "torch" ? TORCH_FROM_STOVE : RECIPES[i]);
const STACK_STATE = ["home", "store", "pet", "ctl", "carry", "task", "goal", "want", "slot", "indoors", "facing", "lastTask", "unloading", "musing", "raid"];
const STACK_LINKS = ["goalStack", "parkedAt"];
const STACK_ACTIONS = ["walk", "travel", "repeat"];
function actionOut(action) {
  const { target, ...state } = action;
  return { ...state, target: target?.id };
}
function actionIn(action, stacksById) {
  if (!action) return null;
  const target = stacksById.get(action.target);
  if (action.target !== undefined && !target) return null;
  return { ...action, target };
}
function stackOut(st) {
  const o = { id: st.id, x: st.x, y: st.y, cards: st.cards.map(cardOut) };
  for (const k of STACK_STATE) if (st[k] !== undefined) o[k] = st[k];
  for (const k of STACK_LINKS) if (st[k]) o[k] = st[k].id;
  for (const k of STACK_ACTIONS) if (st[k]) o[k] = actionOut(st[k]);
  if (st.job) {
    const { r, ...job } = st.job;
    const ref = recipeRef(r);
    o.job = { ...actionOut(job), r: ref === -1 ? r : ref };
  }
  if (st.npc) o.npc = { ...st.npc, kit: (st.npc.kit ?? []).map(cardOut) };
  if (st.critter) {
    const { kind, home, hunger, lying, calm, backAt, nextMove, hp, bornDay, sex } = st.critter;
    o.critter = { kind, home, hunger, lying, calm, backAt, nextMove, hp, bornDay, sex };
  }
  if (st.plans?.length) o.plans = st.plans.map((p) => (p.deliver ? { deliver: true } : { r: recipeRef(p.r) }));
  return o;
}
function saveGame() {
  if (preview || importingSave || saveWriteBlocked || drag || !youStack()) return;                 // mid-drag a stack is split in two
  try {
    const data = {
      v: SAVE_VERSION, seed, uid, at: Date.now(), min: clock.min, fast: clock.fast,
      rng: worldRandom.snapshot(), me: { ...me, marks: [...marks] },
      talks: talks.map(({ st, ...line }) => ({ ...line, stackId: st.id })),
      boards: Object.fromEntries(Object.entries(boards).map(([b, list]) => [b, list.filter((s) => !s.lifted).map(stackOut)])),
      respawns: [], eco, discs, weather,
      look: { from: look.from, to: look.to, p: look.p }, village, nature, lore, npcSocial, npcKnowledge, production,
      fields: (MAP.extraFields ?? []).map(({ cv, card, ...f }) => ({ ...f, card: card?.id })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (err) { console.warn("没存上", err); }
}
function readSave() {
  if (preview) return null;
  if (params.has("new")) {                                    // a fresh start once — then drop ?new so a refresh keeps the new life
    const old = localStorage.getItem(SAVE_KEY);
    if (old) localStorage.setItem(PREVIOUS_KEY, old);                 // the life before is kept, in case it was a slip
    localStorage.removeItem(SAVE_KEY); params.delete("new");
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    return null;
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === null) return null;
    const d = JSON.parse(raw);
    if (validSave(d) && d.seed === seed) return d;
  } catch { /* Keep the original slot available for export or replacement. */ }
  saveWriteBlocked = true;
  return null;
}
/** Put the saved world back on the regenerated land. */
function restore(d) {
  const ids = new Map(), stacksById = new Map(), loadedStacks = [];
  for (const list of Object.values(d.boards)) for (const stack of list) {
    if (savedId(stack.id)) uid = Math.max(uid, stack.id);
    for (const card of [...stack.cards, ...(stack.npc?.kit ?? [])]) {
      if (Number.isSafeInteger(card.id)) uid = Math.max(uid, card.id);
    }
  }
  if (Number.isSafeInteger(d.uid)) uid = Math.max(uid, d.uid);
  clock.min = d.min;
  clock.fast = Number.isFinite(d.fast) && d.fast > d.min ? d.fast : 0;
  worldRandom = createWorldRandom(seed, d.rng);
  production = productionHistory(d.production);
  const { marks: mk = [], ...m } = d.me; Object.assign(me, m); mk.forEach((x) => marks.add(x));
  for (const [k, def] of Object.entries(me.defs ?? {})) DEFS[k] = { type: "person", ...def };
  for (const [b, list] of Object.entries(d.boards)) {
    boards[b] ??= [];
    for (const o of list) {
      const st = newStack(o.cards.map((c) => cardIn(c, ids)), o.x, o.y, b, savedId(o.id));
      loadedStacks.push([st, o]);
      stacksById.set(st.id, st);
      for (const k of STACK_STATE) if (o[k] !== undefined) st[k] = o[k];
      if (st.raid?.landed) st.cards[0].el.querySelector(".card-art").innerHTML = iconFor("boatman");
      if (o.npc) {
        st.npc = { ...o.npc, kit: (o.npc.kit ?? []).map((c) => cardIn(c, ids)) };
        st.npc.kit.forEach((c) => { c.el.classList.add("hidden-kit"); cardsLayer.append(c.el); });
        if (st.npc.inside) st.cards.forEach((c) => c.el.classList.add("sleeping"));
      }
      if (o.critter) st.critter = { ...SPECIES[o.critter.kind], ...o.critter };
      if (o.plans) st.plans = o.plans.map((p) => (p.deliver ? { deliver: true } : { r: recipeOf(p.r) }));
    }
  }
  for (const [st, o] of loadedStacks) {
    for (const k of STACK_LINKS) st[k] = stacksById.get(o[k]) ?? null;
    for (const k of STACK_ACTIONS) st[k] = actionIn(o[k], stacksById);
    if (o.job) {
      const job = actionIn(o.job, stacksById);
      const r = typeof o.job.r === "object" ? o.job.r : recipeOf(o.job.r);
      if (job && (st.npc || (r && job.target))) st.job = { ...job, r };
    }
  }
  for (const { stackId, ...line } of d.talks ?? []) {
    const st = stacksById.get(stackId);
    if (st) talks.push({ ...line, st });
  }
  board = youStack().board;
  $("room").hidden = board === "world";
  table.classList.toggle("inside", board !== "world");
  eco.push(...d.eco); discs.push(...d.discs);
  restoreDepletedSites(d.respawns);
  MAP.extraFields = d.fields.map((f) => ({ ...f, card: ids.get(f.card) }));
  Object.assign(weather, d.weather);
  if (d.village) Object.assign(village, d.village);
  if (d.nature) Object.assign(nature, d.nature);
  livingDucks().forEach((duck, i) => {
    duck.critter.bornDay ??= day() - 4;
    duck.critter.sex ??= i % 2 ? "male" : "female";
    labelDuck(duck);
  });
  restoreNpcSocial(npcSocial, d.npcSocial); // Older v1 saves have no NPC social graph.
  restoreNpcKnowledge(npcKnowledge, d.npcKnowledge); // Additive, backward-compatible.
  // Recover only named discoverers from older saves, NOT knowledge for every NPC.
  for (const [id, event] of Object.entries(d.lore?.theories ?? {})) {
    const author = npcs().find((q) => q.npc.key === event.by);
    const authorId = author ? npcIdentity(author) : `legacy_${event.by}_${event.day ?? 0}`;
    if (!knowledgeOf(npcKnowledge, authorId, id))
      acquireTheory(npcKnowledge, authorId, id, { day: event.day ?? 1, source: "legacy-discoverer", confidence: 0.65 });
  }
  if (d.lore) { Object.assign(lore, d.lore); for (const [id, v] of Object.entries(lore.inventions)) unlockInvention(id, v.by); for (const t of THEORIES) if (t.custom && lore.customs.includes(t.custom.id)) adoptCustom(t.custom); }
  for (const st of boards.world.filter((q) => SHORE.includes(q.cards[0].key))) st.cards[0].el.classList.toggle("flooded", nature.flood);
  for (const q of allStacks()) {
    const c = q.cards[0];
    if (c.key === "plot" && c.stage === undefined) {           // a foundation from before building went in steps: one step, as it was
      c.stage = 0;
      c.stages = [{ name: "盖", needs: c.build === "hut" ? { log: 4, reed: 4, rope: 1 } : { ...BUILDS[c.build].needs }, work: BUILDS[c.build].work, ...(c.build === "farm" ? { tool: "hoe" } : {}) }];
    }
    if (c.key === "chest") c.items ??= [];
  }
  for (const q of npcs()) for (const [kind, v] of Object.entries(q.npc.skill ?? {})) if (v >= LEAD && BUILDS[kind] && !BUILDS[kind].who.includes(q.npc.key)) BUILDS[kind].who.push(q.npc.key);
  setupMainHouse(false);
  settleMisplaced();
  const heap0 = homePile(); if (heap0) sortPile(heap0);
  // Move only the old stock layout. A player's rearranged piles keep their positions.
  if (MAP.house) for (const st of boards.world) {
    const key = oldYardFurnishing(st, MAP.house);
    if (key) Object.assign(st, yardFurnishing(key, MAP.house));
  }
  for (const [room, list] of Object.entries(boards)) if (room !== "world") {
    for (const st of list) Object.assign(st, oldRoomFurnishing(st));
  }
  setupMine();
  setupBlackReef();
  ensureDeepPines();
  look.from = d.look.from; look.to = d.look.to; look.p = d.look.p;
  if (look.p < 1) { const c = document.createElement("canvas"); c.className = "ground"; c.style.opacity = String(look.p); $("ground").after(c); look.top = c; }
  lastDay = day(); lastSeason = SEASONS.indexOf(season());
  setWeather(weather.now, d.weather.strength ?? (weather.now === "雨" || weather.now === "雪" ? 0.7 : 0));
  settleNaturalSources();
  paintFog();
  paintSeason();
  const g = find("granary")?.cards[0]; if (g) refreshStock(g);           // its capacity counts the pits, which are back now too
  toast(`接着上回：${season()}，第 ${day()} 天`);
  me.known.bed ??= { mem: 1, day: day() };
  if (!me.bedRuleNoted && [...bedPlan().values()].includes(null)) {      // older saves: the shared bedding counted as four
    me.bedRuleNoted = true;
    setTimeout(() => toast("铺位现在一人一张。没铺位的人先打地铺，他们会自己扎；你也能在火塘边用 3 捆芦苇加 1 份葛麻扎一张"), 2600);
  }
}
// ---------------------------------------------------------------------------
/** The bar under the clock: the next first step while you're learning, then the village's nearest goal. */
function updateGoal() {
  const g = me.guide, you = youStack(), bar = $("goal");
  if (!bar || !you) return;
  if (g && !g.done) {
    const f = (g.flags ??= {});
    g.start ??= center(you);
    if (!f.walked && dist(center(you), g.start) > 150) f.walked = true;
    if (!f.carrying && loose(you).length) f.carrying = true;
  }
  const step = guideStep(g);
  document.querySelectorAll(".card.hint").forEach((el) => el.classList.remove("hint"));
  let text, head, ladder = false;
  if (step) {
    const i = FIRST_STEPS.indexOf(step);
    head = `第 ${i + 1}/${FIRST_STEPS.length} 步`; text = step.text;
    if (step.hint) find(step.hint)?.cards[0].el.classList.add("hint");
  } else {
    if (g && !g.done) { g.done = true; toast("头几步都会了。往后看村子的下一步"); }
    const goal = ladderGoal(village.rung, villageNow());
    head = goal.name; text = `${goal.text}${goal.progress ? `（${goal.progress}）` : ""}`; ladder = true;
  }
  if (bar.dataset.text !== text) { if (bar.dataset.text) { bar.classList.remove("flash"); void bar.offsetWidth; bar.classList.add("flash"); } bar.dataset.text = text; }
  $("goalHead").textContent = head; $("goalText").textContent = text;
  bar.classList.toggle("ladder", ladder); bar.hidden = false;
}
$("goalSkip").onclick = () => { if (me.guide) me.guide.done = true; updateGoal(); };
/** The way in: continue, or a new life. The world waits behind it. */
function showTitle() {
  const t = $("title"), was = clock.speed || 1;
  setSpeed(0);
  $("titleNote").textContent = hadSave ? `接着上回：第 ${day()} 天 · ${season()} · ${me.name ?? "启禾"} ${myAge()} 岁` : "一片河谷，一间院子，一个刚成年的人。";
  $("titleGo").textContent = hadSave ? "继续" : "开始";
  t.hidden = false;
  const go = () => { t.hidden = true; setSpeed(was); };
  $("titleGo").onclick = go;
  $("titleHelp").onclick = () => { $("helpbox").hidden = false; };
  $("titleNew").onclick = () => { if (!hadSave || confirm("从头开始一段新的人生？现在的存档会被清掉。")) location.search = "?new=1"; };
  $("titleGo").focus();
}
function initializeView() {
  me.guide ??= hadSave ? { done: true } : { flags: {} };          // old saves already know their way about
  if (!me.beanSeeded) { me.beanSeeded = true; storeHome([newCard("bean"), newCard("bean"), newCard("bean")]); }
  $("meFace").innerHTML = iconFor("you");
  carryChanged(); renderParty(); renderAutoMe(); renderPromises();
  const r = table.getBoundingClientRect(), c = center(youStack());
  cam.z = Math.min(1.05, Math.max(0.7, r.height / 800));
  cam.x = c.x; cam.y = c.y - 30;
  applyCam(); fitRoom(); render();
}

let hadSave = false;
function loadWorld() {
  const pending = preview ? null : sessionStorage.getItem(importKey(seed));
  if (pending !== null) {
    sessionStorage.removeItem(importKey(seed));
    try {
      const data = JSON.parse(pending);
      if (!validSave(data) || data.seed !== seed) throw new Error("存档版本或内容无效");
      restore(data);
      initializeView();
      localStorage.setItem(SAVE_KEY, pending);
      return true;
    } catch {
      sessionStorage.setItem(importErrorKey, "读不了这个存档，原档已保留");
      location.reload();
      return false;
    }
  }
  const saved = readSave();
  hadSave = Boolean(saved);
  if (saved) restore(saved); else build();
  initializeView();
  const importError = sessionStorage.getItem(importErrorKey);
  if (importError) {
    sessionStorage.removeItem(importErrorKey);
    toast(importError);
  } else if (saveWriteBlocked) toast("原存档无法识别，已保留以便导出");
  return true;
}

const artFound = await loadArt();
worldEl.style.width = `${WW}px`; worldEl.style.height = `${WH}px`;
if (loadWorld()) {
  setInterval(saveGame, 15000);
  setInterval(updateGoal, 700); updateGoal();
  setInterval(() => {
    const you = youStack(), lake = find("lake");
    setScene({
      season: season(), night: darkness(), rain: weather.now === "雨" ? weather.strength ?? 0.6 : 0, snow: weather.now === "雪" ? weather.strength ?? 0.6 : 0,
      lake: you && lake && board === "world" ? Math.max(0, 1 - dist(center(you), center(lake)) / 1000) : 0,
      indoor: board !== "world", title: !$("title").hidden,
    });
  }, 1000);
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, startAudio, { capture: true });
  if (!preview && !freshStart) showTitle();                    // just chose a new life: straight in
  addEventListener("pagehide", saveGame);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveGame(); });
  window.addEventListener("resize", () => { applyCam(); fitRoom(); if (sky.cv) skySetup(); });
  requestAnimationFrame(frame);
  window.__mock = { audioLevel, audioRunning, sfx, advanceTo, npcSocial, npcKnowledge, npcIdentity, npcBelief: (a, id) => knowledgeOf(npcKnowledge, personId(a), id), npcRelation: (a, b) => relationOf(npcSocial, personId(a), personId(b)), climbCliff: climb, climbLadder, lookOut, considerTrader, trade, TRADES, passOn, birth, court, canCourt, lifeDay, npcDies, myAge, npcAge, family, heirs, lore, observe, needUp, thinkTick, unlockInvention, nature, natureDay, isSick, coldTick, village, climb: climbLadder, considerArrival, villageNow, festivalTick, npcs, saveGame, look, weather, skySet, sky, say, startChat, inJungle, SPECIES, spawnAnimal, attackRabbit, BUILDS, startPlacing, placeFoundation, completeBuild, refreshPlot, newStack, WANT, planStep, holds, teach, renderCrafts, setMode, members, soc, hearts, giveTo, talk, askNews, acceptReq, declineReq, party, renderParty, tide, darkness, lights, litAt, boards, clock, cam, me, MAP, youStack, walkTo, find, center, discs, setSpeed, artFound, moveRange, arrive, walkable: (x, y) => walkable(MAP, x, y), explore, paintFog, paintSeason, newCard, eco, attackRabbit, showDetail, findPath: (a, b) => findPath(MAP, a, b) };
}
