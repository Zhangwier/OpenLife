// OpenLife · card world mockup v4: a generated valley under fog, flowing time, villagers who live their own days.
import { iconFor } from "./icons.js";
import { loadArt, deco as DECO } from "./art.js";
import { fx } from "./fx.js";
import { generateWorld, walkable, reachAlong, findPath, woodDepth, terrainBlock, G, CELL } from "./mapgen.js";
import { VEG, ageSapling, cellsToThin, edgeGrass, isMature, patches } from "./vegetation.js";
import { paintTerrain, paintTide, paintCover, paintCrop, paintResourcePatch, prewarmBase } from "./terrain.js";
import { LAND, SITES, LAYOUT, PEOPLE, START, WOOD_LAYOUT, LAKE_LAYOUT, FARM_FIELDS, FIELD_SIZE, PLATEAU_LAYOUT, DEEP_LAYOUT, WEST } from "./valley.js";
import * as VOICE from "./voice.js";
import { PEOPLE_DATA, TIERS as BONDS, tierOf, dayName } from "./people.js";
import { LADDER, condDone, rungDone, POP_CAP, NEWCOMERS, FESTIVALS } from "./village.js";
import { NEEDS, THEORIES, INVENTIONS, mindful } from "./knowledge.js";
import { makeNpcSocial, recordNpcChat, recordNpcCooperation, willNpcChat, restoreNpcSocial, relationOf, npcTemperament } from "./npc-social.js";
import { advanceClock, createWorldRandom, dayAt } from "./world-clock.js";
import { cropWeather, planProduction, productionHistory, recordProduction } from "./production.js";
import { chooseVillageAid, planNpcFood } from "./npc-goals.js";
import { makeNpcKnowledge, acquireTheory, transmitTheory, chooseTheoryToShare, restoreNpcKnowledge, knowledgeOf } from "./npc-knowledge.js";
import { BARN_SIZE, BED_SLOTS, barnFurnishing, bedSlot, oldRoomFurnishing, oldYardFurnishing, pickDropTarget, ROOM_ENTRY, ROOM_FURNITURE, yardFurnishing } from "./board-layout.js";
import { planVillageExchange, TRADE_WORTH } from "./village-exchange.js";
import { coastRaidRoute, raidLoot } from "./coast-raid.js";
import { THREAT, WEAPONS, bestWeapon, stance, strengthAt } from "./fight.js";
import { afloat, nearestWater, shoreAt, touchesSea, waterRoute } from "./sailing.js";
import { naturalSource, nextSourcePulse, sourceCapacity, sourceNextStock, sourcePlant, sourceStage, sourceWait, treeYield } from "./resource-ecology.js";
import { bundleLayout, dragRange, playerStride, walkEffort } from "./board-play.js";
import { harm, pickEvent } from "./storyteller.js";
import { HUNGER, LIFE, births, diesOfAge, isYoung, starveDay, winterSurplus } from "./population.js";
import { HABITS, alongShore, catchUp, duckPlan, fileSlot, flockSlot, isActive, isAsleep, leaderOf, paceOf, spellLength, stirAfter } from "./animal-ways.js";
import { audioLevel, audioRunning, setScene, settings as soundSettings, setVolume, sfx, startAudio } from "./audio.js";
import { FIRST_STEPS, guideStep, ladderGoal, progressWord } from "./guide.js";
import { BREAK_AT, moodPace, moodStep, moodTarget, moodlets, worst } from "./npc-mood.js";
import { cookProject, farmerProject, fisherProject, gathererProject, pickGrove } from "./npc-mind.js";
import { GRID, SEG_COST, blockRects, buildingOf, doorlessRooms, edgeRun, findRooms, fromCompound, newSeg, parseSeg, roofCost, roomAt, roomName, segMid, segRect } from "./walls.js";
import { extensionNeed, extensionSite } from "./expansion.js";
import { drawFloor, drawWalls, roofEl } from "./walls-paint.js";
import { BUILD_STAGES, LEAD, addWork, buildSession, delivered, helpSession, raiseSkill, stageOf, stagesOf, stepKnown, totalNeeds, totalWork } from "./building.js";
import { fieldGuard, BARE_HILLS, PROWL_PREY, SOIL_MAX, SOIL_WORDS, TIGER_PROWL, fellingNext, floodAfter, rabbitCap, rabbitRaid, soilAtWinter, soilOf, tigerFeed, tigerHuntAt } from "./ecology-chain.js";

const $ = (id) => document.getElementById(id);
const CARD_W = 112, CARD_H = 148, PEEK = 30;
// Two card sizes for now: s = everything you carry, work at, or sleep in; m = the one house you can go inside.
// A future sailing ship gets its own size, not a per-card size.
const TIERS = { s: [112, 148], m: [168, 222], l: [224, 290] };
const SIZE = { taoHouse: "m", bighouse: "l", barn: "m" };
const REVEAL = 640, SIGHT = 9999, REACH = 260;
const MOVE_RANGE = 560;                // how far you can go in one drag, fed and rested
const PX_PER_MIN = 20;                 // walking speed: px per game minute
const MIN_PER_SEC = 4.8;               // at 1×, one game day = 300 s (5 minutes); dusk and dawn take several
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
  aunt:       { name: "陶婶", type: "person", icon: "aunt", text: "管着家里灶台的长辈。嘴上爱念叨，心里热乎。" },
  gu:         { name: "阿罟", type: "person", icon: "boatman", text: "打了半辈子鱼的老把式，看水色就知道鱼在哪一层。打了鱼送到灶上。" },
  wei:        { name: "阿苇", type: "person", icon: "cook", text: "割芦苇、编席子的。话少，总担心芦苇荡一年比一年稀，只割老苇。" },
  li:         { name: "阿砺", type: "person", icon: "digger", text: "打制石器的匠人。去矿道挖石头背回家，会做斧、刀、锤、矛。" },
  hut:        { name: "窝棚", type: "structure", icon: "hut", text: "芦苇和木头搭的窝棚，能睡两个人。" },
  granaryPit: { name: "粮窖", type: "structure", icon: "granary", text: "挖在地里的窖，底下铺石头、上头盖木头，粟不受潮。" },
  calendarStick: { name: "测影竿", type: "structure", icon: "wood", text: "立在田边的一根直竿，地上刻着两道痕。" },
  floodMark:  { name: "记水木", type: "tool", icon: "log", text: "刻着道道的木桩。放在湖边，春雨一下就看得出水涨了几道，漫岸前一天先报信。" },
  smokedFish: { name: "熏鱼", type: "food", icon: "roastFish", text: "在火塘上熏干的鱼，放好些天不坏。", food: 22 },
  saltedFish: { name: "咸鱼", type: "food", icon: "smokedFish", text: "拿盐腌过、晒干的鱼，放得住。", food: 20 },
  saltedMeat: { name: "咸肉", type: "food", icon: "smokedMeat", text: "盐腌过的肉，能放到开春。", food: 28 },
  san:        { name: "阿三", type: "person", icon: "yu", text: "种地的。话少，手上的活从不含糊：春天下种，春夏锄草，秋天收了粟背去公仓。" },
  dog:        { name: "阿黄", type: "animal", icon: "dog", text: "院子里的狗，在家附近转悠。" },
  rabbit:     { name: "野兔", type: "animal", icon: "rabbit", text: "耳朵在草尖上转了转。" },
  taoHouse:   { name: "陶家主屋", type: "house", icon: "house", text: "全村人晚上都睡在这儿。南边有道门，走进院子才看得见铺位和火塘。" },
  stove:      { name: "灶台", type: "structure", icon: "stove", text: "院角砌的土灶，架着一口大锅。", stockLabel: "锅里的熟食" },
  axeLoose:   { name: "松了的石斧", type: "item", icon: "axe", text: "斧头从柄上松脱了，头和柄都还在。拿一根麻绳重新绑紧就能用。", fixes: "axe", fix: "rope" },
  knifeLoose: { name: "松了的燧石刀", type: "item", icon: "knife", text: "刀片从木柄里松出来了。拿麻绳缠紧就能用。", fixes: "knife", fix: "rope" },
  hoeLoose:   { name: "散了的石锄", type: "item", icon: "hoe", text: "锄头和柄脱开了。拿麻绳绑紧就能用。", fixes: "hoe", fix: "rope" },
  hammerLoose:{ name: "松了的石锤", type: "item", icon: "hammer", text: "扎石头的绳子松了。重新绑一道麻绳就好。", fixes: "hammer", fix: "rope" },
  spearLoose: { name: "矛头松了的石矛", type: "item", icon: "spear", text: "矛头在杆上晃荡。拿麻绳重新绑紧。", fixes: "spear", fix: "rope" },
  netTorn:    { name: "破了的渔网", type: "item", icon: "net", text: "网扯开了一个大口子。拿葛麻补上就能接着用。", fixes: "net", fix: "fiber" },
  table:      { name: "饭桌", type: "structure", icon: "table", text: "院子当中一张矮木桌。" },
  granary:    { name: "粮囤", type: "structure", icon: "granary", text: "架高的粮囤，有干粟的香气。", stockLabel: "粟" },
  field:      { name: "旱地·一", type: "source", icon: "field", text: "垄沟之间，细土晒得发白。", stockLabel: "长势" },
  field2:     { name: "旱地·二", type: "source", icon: "field", text: "与旁边那块地隔着一道田埂。", stockLabel: "长势" },
  lake:       { name: "钓鱼点", type: "source", icon: "fish", text: "湖湾水缓，鱼在浅处游。", stock: 7, stockLabel: "鱼" },
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
  herb:       { name: "药草", type: "food", icon: "fiber", text: "一把药草，揉碎了发苦。", food: 2 },
  copperRock: { name: "绿石头", type: "source", icon: "stone", text: "裸露的石面上染着一点青绿。", stock: 3 },
  malachite:  { name: "孔雀石", type: "material", icon: "stone", text: "绿得发亮的石头。" },
  lookout:    { name: "远眺石", type: "source", icon: "scree", text: "高原边上一块大石头，站上去能望见很远。" },
  goat:       { name: "野山羊", type: "animal", icon: "deer", text: "一只山羊沿着碎石坡站着，耳朵转向你。" },
  trader:     { name: "阿贾", type: "person", icon: "boatman", text: "从东南边的村子划筏子过湖来换东西的人。下午就回去。" },
  blackReef:  { name: "黑礁岛", type: "structure", icon: "hut", text: "礁石后立着矮棚，浅湾里系着一艘挂黑帆的船。" },
  boat:       { name: "小船", type: "boat", icon: "boat", text: "一整根木头掏空做的独木舟，配一支桨。" },
  coastRaider: { name: "黑帆劫掠者", type: "animal", icon: "boatman", text: "衣摆沾着海盐，船头放着几个空粮袋。" },
  salt:       { name: "盐", type: "material", icon: "stone", text: "一块粗盐，东南边换来的。人人都稀罕。" },
  shell:      { name: "贝壳", type: "material", icon: "clam", text: "一片磨得发亮的贝壳。" },
  shellBeads: { name: "贝壳珠串", type: "material", icon: "berries", text: "磨亮的贝壳串在一起，戴在身上好看。" },
  cloth:      { name: "布衣", type: "tool", icon: "fiber", text: "一件麻布衣裳。" },
  hemp:       { name: "葛麻丛", type: "source", icon: "hemp", text: "细长的葛麻顺着坡长了一片。", stock: 6 },
  berries:    { name: "野果丛", type: "source", icon: "berries", text: "低矮灌木顺着林边铺开。", stock: 0 },
  clay:       { name: "黏土", type: "material", icon: "clay", text: "一份湿黏土。" },
  reed:       { name: "芦苇", type: "material", icon: "reed", text: "一捆芦苇。补船用得上。" },
  stone:      { name: "石块", type: "material", icon: "stone", text: "一块趁手的石头。" },
  flint:      { name: "燧石", type: "material", icon: "flint", text: "又硬又利。" },
  fiber:      { name: "葛麻", type: "material", icon: "fiber", text: "剥好的葛麻纤维。" },
  rope:       { name: "麻绳", type: "material", icon: "rope", text: "一根结实的绳子。" },
  wood:       { name: "柴", type: "material", icon: "wood", text: "一捆劈好的柴。能填火、烧窑、凿船。" },
  log:        { name: "木头", type: "material", icon: "log", text: "一根木头。带石斧到火塘边劈成柴。" },
  jar:        { name: "陶罐", type: "item", icon: "jar", text: "烧好的陶罐，空的。" },
  jarFull:    { name: "满罐熟食", type: "food", icon: "jar", text: "一罐熟食。", food: 45 },
  axe:        { name: "石斧", type: "tool", icon: "axe", text: "磨过的石头绑在木柄上。" },
  knife:      { name: "燧石刀", type: "tool", icon: "knife", text: "一片锋利的燧石，嵌在木柄里。" },
  hoe:        { name: "石锄", type: "tool", icon: "hoe", text: "扁石头绑在长柄上。" },
  meat:       { name: "鲜肉", type: "food", icon: "meat", text: "一块新猎来的肉。", food: 24 },
  hide:       { name: "兔皮", type: "material", icon: "hide", text: "一张兔皮，以后能做东西。" },
  deer:       { name: "鹿", type: "animal", icon: "deer", text: "鹿抬起头，耳朵朝林子外转。" },
  boar:       { name: "野猪", type: "animal", icon: "boar", text: "野猪低着头在树根下拱土。" },
  peach:      { name: "桃树", type: "source", icon: "peachTree", text: "果园里的桃树。春天开花，夏天结桃，每天熟几个；秋天少，冬天没有。", stock: 0, stockLabel: "桃" },
  jujube:     { name: "枣树", type: "source", icon: "jujubeTree", text: "果园里的枣树。秋天结枣，每天熟几个。", stock: 0, stockLabel: "枣" },
  peachFruit: { name: "桃", type: "food", icon: "peach", text: "一个熟桃。", food: 14 },
  jujubeFruit:{ name: "枣", type: "food", icon: "jujube", text: "一把红枣。", food: 10 },
  fox:        { name: "狐狸", type: "animal", icon: "fox", text: "一只红狐狸贴着草皮溜过去，尾巴扫了一下。黄昏和夜里出来，抓兔子、野鸭，也偷鸭蛋。" },
  pheasant:   { name: "野鸡", type: "animal", icon: "pheasant", text: "几只野鸡在落叶里刨食，一有动静就扑棱棱飞散。" },
  bear:       { name: "黑熊", type: "animal", icon: "bear", text: "深林里的黑熊。爱掏蜂窝，冬天睡在树洞里。撞上了会扑人。" },
  wolf:       { name: "狼", type: "animal", icon: "wolf", text: "灰扑扑的一群，贴着林子边缘走。夜里成群撵鹿，落了单的牲口也怕它们。" },
  tiger:      { name: "老虎", type: "animal", icon: "tiger", text: "斑纹隐在树影里，林子忽然没了声息。" },
  mushroom:   { name: "蘑菇", type: "food", icon: "mushroom", text: "丛林里采的蘑菇。", food: 16 },
  mushrooms:  { name: "蘑菇丛", type: "source", icon: "mushroom", text: "倒木底下冒出一丛蘑菇。下过雨长得快，秋天最多。", stock: 2, stockLabel: "蘑菇" },
  hive:       { name: "野蜂窝", type: "source", icon: "hive", text: "老树洞里嗡嗡作响。带着火把熏一熏再掏，不然要挨蛰。", stock: 2, stockLabel: "蜂蜜" },
  honey:      { name: "蜂蜜", type: "food", icon: "honey", text: "一块野蜂蜜，甜得发腻。放得住。", food: 20 },
  pelt:       { name: "虎皮", type: "material", icon: "pelt", text: "一张虎皮。打到老虎的人，村里会记很久。" },
  duck:       { name: "野鸭", type: "animal", icon: "duck", text: "在湖面上游来游去，在芦苇里做窝。" },
  nest:       { name: "鸭窝", type: "source", icon: "nest", text: "芦苇深处垫着一圈干草。", stock: 2 },
  egg:        { name: "鸭蛋", type: "food", icon: "egg", text: "一个鸭蛋。", food: 10 },
  spear:      { name: "石矛", type: "tool", icon: "spear", text: "削尖的石刃绑在长杆上。" },
  farm:       { name: "开荒", type: "source", icon: "field", text: "开出一块新田。" },
  shallows:   { name: "湖东浅滩", type: "source", icon: "clams", text: "泥沙下露出几道浅浅的蚌壳边。", stock: 6 },
  saltPan:    { name: "盐田", type: "source", icon: "pit", text: "礁石围出的浅池，水干了结着一层白霜。", stock: 4, stockLabel: "盐" },
  shellBank:  { name: "贝壳滩", type: "source", icon: "clams", text: "浪把碎贝壳推成一溜。", stock: 6, stockLabel: "贝壳" },
  clam:       { name: "河蚌", type: "food", icon: "clam", text: "一只河蚌，生吃也行。", food: 14 },
  hammer:     { name: "石锤", type: "tool", icon: "hammer", text: "一块沉重的石头扎在短柄上。" },
  wall:       { name: "泥墙", type: "structure", icon: "plot", text: "篱笆糊泥砌的墙。" },
  plot:       { name: "地基", type: "structure", icon: "plot", text: "盖房子的地方。把材料带上来或者拖上来，齐了以后站在上面一段段地盖。" },
  bighouse:   { name: "大房子", type: "house", icon: "bighouse", text: "你们自己盖的大房子：屋里有火塘和铺位。" },
  barn:       { name: "仓库", type: "structure", icon: "barn", text: "放东西的地方。背着东西走上来，就都放进去；点开能一样样取出来。" },
  torch:      { name: "火把", type: "tool", icon: "torch", text: "一根缠着松脂的木棍，点着了照得见路。", burn: 480 },
  roastFish:  { name: "烤鱼", type: "food", icon: "roastFish", text: "烤得焦香，比生鱼顶饱得多。", food: 34 },
  roastMeat:  { name: "烤肉", type: "food", icon: "roastMeat", text: "油汪汪的，一块能顶大半天。", food: 44 },
  cooked:     { name: "粟饭", type: "food", icon: "cooked", text: "一碗热粟饭，从灶上端下来的。", food: 45 },
  basket:     { name: "背篓", type: "tool", icon: "basket", text: "藤条编的背篓。" },
  sandals:    { name: "草鞋", type: "tool", icon: "sandals", text: "草编的鞋。", uses: 40 },
  net:        { name: "渔网", type: "tool", icon: "net", text: "麻线结的网。" },
  grain:      { name: "粟", type: "food", icon: "grain", text: "一份粟，生嚼也能顶一顶。", food: 12 },
  chest:      { name: "木柜", type: "structure", icon: "chest", text: "家里钉的木柜。" },
  compost:    { name: "堆肥坑", type: "structure", icon: "compost", text: "烂菜叶、坏了的吃食、割下的草都倒进来，沤几天就成了肥。" },
  cellar:     { name: "地窖", type: "structure", icon: "cellar", text: "院边挖的窖，里头阴凉。" },
  scarecrow:  { name: "稻草人", type: "tool", icon: "scarecrow", text: "芦苇扎的草人。立在田里，兔子来得少。" },
  fence:      { name: "篱笆", type: "tool", icon: "fence", text: "木桩和绳子编的篱笆。围在田边，兔子几乎进不来。" },
  muck:       { name: "沤肥", type: "material", icon: "muck", text: "沤好的肥，黑乎乎的。" },
  ash:        { name: "草木灰", type: "material", icon: "ash", text: "火塘里掏出来的灰。" },
  bean:       { name: "豆", type: "food", icon: "bean", text: "一把豆子。", food: 10 },
  fish:       { name: "鱼", type: "food", icon: "fish", text: "一条鲜鱼。", food: 18 },
  berry:      { name: "野果", type: "food", icon: "berry", text: "酸甜的野果。", food: 10 },
  door:       { name: "门", type: "exit", icon: "door", text: "从这里出去。" },
  bed:        { name: "铺位", type: "structure", icon: "bed", text: "铺着晒过的草席。" },
  fire:       { name: "火塘", type: "structure", icon: "fire", text: "屋里的火。" },
  workbench:  { name: "工作台", type: "structure", icon: "workbench", text: "一块厚木板搭的台子。工具、编织、盖房的料都在这上头做：把料堆上来，人站上去。" },
  wattle:     { name: "墙板", type: "material", icon: "wattle", text: "芦苇编的一片篱笆。拖到地上就立成一段墙，再糊上黏土。" },
  doorPanel:  { name: "门板", type: "material", icon: "doorPanel", text: "木头拼的门，绳子绑着。拖到一段墙上，那儿就开成门。" },
  thatch:     { name: "草苫", type: "material", icon: "thatch", text: "芦苇编的草帘，一张盖四格屋顶。拖进四面围好的屋里。" },
  stakes:     { name: "界桩", type: "material", icon: "stakes", text: "削尖的木桩，绑着绳。拖到草地上，就划出一块荒地。" },
  cellarPlan: { name: "地窖规划", type: "item", icon: "cellar", text: "" },                  // gone (v64.6): only so an older save loads
  granaryPitPlan: { name: "粮窖规划", type: "item", icon: "granary", text: "" },  compostPlan: { name: "堆肥坑规划", type: "item", icon: "compost", text: "划好线的堆肥坑。拖到田边。" },
  boatPlan:   { name: "造船规划", type: "item", icon: "boat", text: "选好的一根粗木头。拖到水边，在那儿造船。" },
};
const CARRY = new Set(["material", "food", "item", "tool"]);
const SERVING = 45;                    // one helping at the stove

// What you do when you arrive at something (with what you carry). min = game minutes. Most specific first.
// Recipes with an id are know-how: you have to have learned them (or work them out, slowly and not always).
// who: the villagers who know it and can teach you. Recipes without an id are things anyone can do.
const RECIPES = [
  { id: "basket", who: ["san", "wei"], needs: ["workbench", "reed", "reed", "reed", "rope"], make: ["basket"], min: 180, use: ["reed", "reed", "reed", "rope"], mark: "第一只背篓" },
  { id: "net", who: ["aunt", "gu"], needs: ["workbench", "fiber", "fiber", "rope"], make: ["net"], min: 180, use: ["fiber", "fiber", "rope"], mark: "第一张渔网" },
  { id: "sandals", who: ["aunt", "wei"], needs: ["workbench", "reed", "reed", "fiber"], make: ["sandals"], min: 120, use: ["reed", "reed", "fiber"], mark: "第一双草鞋" },
  { id: "bed", who: ["aunt", "san", "gu", "wei", "li"], when: () => Boolean(freeBedSlot()), needs: ["workbench", "reed", "reed", "reed", "fiber"], make: ["bed"], min: 90, use: ["reed", "reed", "reed", "fiber"], mark: "第一张自己扎的铺位" },
  { id: "scarecrow", inv: "scarecrow", who: [], needs: ["workbench", "reed", "reed", "reed", "log"], make: ["scarecrow"], min: 90, use: ["reed", "reed", "reed", "log"], mark: "第一个稻草人" },
  { id: "fence", inv: "fence", who: [], needs: ["workbench", "log", "log", "log", "rope"], make: ["fence"], min: 150, use: ["log", "log", "log", "rope"], mark: "第一道篱笆" },
  { id: "hoe", who: ["san"], needs: ["workbench", "stone", "log", "fiber"], make: ["hoe"], min: 120, use: ["stone", "log", "fiber"], mark: "第一把石锄" },
  // smoking takes two at a time (one fish and a bundle of wood is just a roast)
  { id: "smoke", inv: "smoking", who: [], needs: ["fire", "fish", "fish", "wood"], make: ["smokedFish", "smokedFish"], min: 120, use: ["fish", "fish", "wood"], mark: "第一回熏鱼" },
  { id: "smoke", inv: "smoking", who: [], needs: ["fire", "meat", "meat", "wood"], make: ["smokedMeat", "smokedMeat"], min: 140, use: ["meat", "meat", "wood"] },
  { id: "saltFish", who: [], needs: ["stove", "fish", "salt"], make: ["saltedFish"], min: 90, use: ["fish", "salt"], mark: "第一回腌鱼" },
  { id: "saltMeat", who: [], needs: ["stove", "meat", "salt"], make: ["saltedMeat"], min: 100, use: ["meat", "salt"] },
  { id: "beads", who: ["aunt", "wei"], needs: ["workbench", "shell", "shell", "fiber"], make: ["shellBeads"], min: 60, use: ["shell", "shell", "fiber"], mark: "第一串贝壳珠" },
  { id: "roast", who: ["aunt"], needs: ["fire", "fish", "wood"], make: ["roastFish"], min: 40, use: ["fish", "wood"] },
  { id: "roast", who: ["aunt"], needs: ["fire", "meat", "wood"], make: ["roastMeat"], min: 50, use: ["meat", "wood"] },
  { id: "torch", who: ["aunt"], needs: ["fire", "wood", "fiber"], make: ["torch"], min: 30, use: ["wood", "fiber"] },
  { id: "hammer", who: ["li"], needs: ["workbench", "stone", "stone", "log"], make: ["hammer"], min: 90, use: ["stone", "stone", "log"], mark: "第一把石锤" },
  { id: "axe", who: ["san", "li"], needs: ["workbench", "stone", "log"], make: ["axe"], min: 120, use: ["stone", "log"], mark: "第一把石斧" },
  { id: "spear", who: ["li"], needs: ["workbench", "flint", "log", "fiber"], make: ["spear"], min: 150, use: ["flint", "log", "fiber"], mark: "第一支石矛" },
  { id: "knife", who: ["li"], needs: ["workbench", "flint", "log"], make: ["knife"], min: 150, use: ["flint", "log"], mark: "第一把燧石刀" },
  { id: "floodMark", inv: "flood-marks", who: [], needs: ["workbench", "log"], make: ["floodMark"], min: 60, use: ["log"] },
  { id: "climbRope", who: ["li"], needs: ["workbench", "rope", "rope", "log"], make: ["climbRope"], min: 90, use: ["rope", "rope", "log"], mark: "第一根攀绳" },
  { id: "rope", who: ["aunt", "san", "gu", "wei"], needs: ["workbench", "fiber", "fiber"], make: ["rope"], min: 90, use: ["fiber", "fiber"] },
  { needs: ["workbench", "log", "axe"], make: ["wood", "wood"], min: 90, use: ["log"] },
  { needs: ["lake", "net"], make: ["fish", "fish"], min: 90, take: true },
  { needs: ["fire", "wood"], make: [], min: 20, use: ["wood"], fuel: true },
  { needs: ["fire", "log"], make: [], min: 20, use: ["log"], fuel: 2 },
  { needs: ["mushrooms"], make: ["mushroom"], min: 30, take: true },
  { needs: ["hive", "torch"], make: ["honey"], min: 40, take: true },
  { needs: ["hive"], make: ["honey"], min: 40, take: true, sting: true },
  { needs: ["chestnut", "axe"], make: ["log", "log", "log"], min: 120, take: true },
  { needs: ["reeds", "knife"], make: ["reed", "reed"], min: 60, take: true },
  { needs: ["hemp", "knife"], make: ["fiber", "fiber"], min: 60, take: true },
  { needs: ["flintVein", "stone"], make: ["flint"], min: 180, take: true },
  { needs: ["pit"], make: ["clay"], min: 90, take: true },
  { needs: ["reeds"], make: ["reed"], min: 60, take: true },
  { needs: ["lake"], make: ["fish"], min: 120, take: true },
  { needs: ["chestnut"], make: ["log", "log"], min: 180, take: true },
  { needs: ["scree"], make: ["stone"], min: 45, take: true },
  { needs: ["herbs"], make: ["herb"], min: 40, take: true },
  { needs: ["copperRock", "hammer"], make: ["malachite"], min: 90, take: true },
  { needs: ["copperRock"], make: ["malachite"], min: 180, take: true },
  { needs: ["saltPan"], make: ["salt"], min: 60, take: true },
  { needs: ["shellBank"], make: ["shell"], min: 45, take: true },
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
  { needs: ["table"], make: [], min: 8, eat: true },
  { needs: ["bed"], make: [], min: 0, sleep: true },
  { needs: ["hut"], make: [], min: 0, sleep: true },
  { needs: ["pineGrove", "axe"], make: ["log", "log", "log"], min: 120, take: true },
  { needs: ["pineGrove"], make: ["log", "log"], min: 180, take: true },
  // At the workbench (added at the end: saved plans point at recipes by their place in this list).
  { needs: ["workbench", "reed", "reed"], make: ["wattle", "wattle"], min: 40, use: ["reed", "reed"] },
  { needs: ["workbench", "log", "rope"], make: ["doorPanel"], min: 60, use: ["log", "rope"] },
  { needs: ["workbench", "reed", "reed", "reed"], make: ["thatch"], min: 40, use: ["reed", "reed", "reed"] },   // a mat of reed, plaited: no rope needed
  { needs: ["workbench", "log", "fiber"], make: ["stakes", "stakes"], min: 30, use: ["log", "fiber"] },
  { id: "chest", inv: "chest", who: [], needs: ["workbench", "log", "log", "log", "rope", "rope"], make: ["chest"], min: 180, use: ["log", "log", "log", "rope", "rope"], mark: "第一只木柜" },
  { id: "calendarStick", inv: "calendar-stick", who: [], needs: ["workbench", "log", "log", "stone"], make: ["calendarStick"], min: 60, use: ["log", "log", "stone"] },
  { inv: "compost", who: [], needs: ["workbench", "stakes", "ash"], make: ["compostPlan"], min: 15, use: ["stakes", "ash"] },
  { needs: ["workbench", "stakes", "log", "log"], make: ["boatPlan"], min: 15, use: ["stakes", "log", "log"] },
  { who: [], needs: ["workbench", "fiber", "fiber", "rope"], make: ["cloth"], min: 120, use: ["fiber", "fiber", "rope"] },
];
/** What the parts for building are made by, for whoever has to make them. */
const MADE = { wattle: RECIPES.find((r) => r.make[0] === "wattle"), doorPanel: RECIPES.find((r) => r.make[0] === "doorPanel"), thatch: RECIPES.find((r) => r.make[0] === "thatch") };
/** Plans you lay out on the ground with a card. */
const PLAN_CARD = { stakes: "farm", compostPlan: "compost", boatPlan: "boat" };
/** Things that stand on the ground but can be picked up and set down elsewhere. */
const MOVABLE = new Set(["chest", "calendarStick", "workbench", "boat"]);
/** A recipe you make by working on a pile, rather than taking from a source or tending a field. */
function craftRecipe(r) {
  return Boolean(r.make?.length) && !r.take && !r.harvest && !r.eat && !r.sleep && !r.sow && !r.tend && !r.water && !r.manure && !r.fuel && !r.fill && !r.jarIn && !r.plant && !r.dismantle;
}
const TALK = {                                              // people's lines come from voice.js; these are the animals
  dog: ["（阿黄摇了摇尾巴）"],
  rabbit: ["（它竖起耳朵，随时要跑）"],
};
const HINT = {
  field: "田里还没什么可收的", field2: "田里还没什么可收的", granary: "粮囤里有干粟的香气",
  stove: "灶是做饭的地方", table: "锅里空着", workbench: "把料堆到工作台上，再站上去做",
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
const me = { food: 70, rest: 90, recent: [], auto: false, buildHints: {} };
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
/** Houses are drawn wall by wall now; these old kinds are only finished where they were begun. */
const HOUSE_KINDS = new Set(["bighouse", "barn", "hut", "wall"]);
const BUILDS = {
  wall: { tier: "s", who: ["san"] },
  bighouse: { tier: "l", who: ["san"] },
  barn: { tier: "m", who: ["san"] },
  farm: { tier: "s", who: ["san"], grass: true },
  hut: { tier: "s", who: ["san", "li"] },
  calendarStick: { tier: "s", who: [], inv: "calendar-stick", item: true },
  chest: { tier: "s", who: [], inv: "chest", yard: true, item: true },         // made at the workbench now; old foundations still finish
  compost: { tier: "s", who: [], inv: "compost" },
  boat: { tier: "s", who: ["gu", "wei"], shore: true },                // the fisher and the reed-cutter know boats
};
for (const [k, b] of Object.entries(BUILDS)) Object.assign(b, { needs: totalNeeds(BUILD_STAGES[k]), work: totalWork(BUILD_STAGES[k]) });
const buildNeeds = (kind) => Object.entries(BUILDS[kind].needs).flatMap(([k, n]) => Array(n).fill(k));
const CRAFTS = [...new Map(RECIPES.filter((r) => r.id).map((r) => [r.id, r])).values(),
  ...Object.entries(BUILDS).map(([id, b]) => ({ id, who: b.who, inv: b.inv, build: true, needs: ["plot", ...buildNeeds(id)], make: [id] }))];   // one entry per know-how
const craftName = (id) => DEFS[CRAFTS.find((r) => r.id === id).make[0]].name;
const granaryCap = (g) => 20 + 5 * (g.jars ?? 0);
/** Carry: a villager has 4 things in their arms (10 with a basket); tools hang on them and don't count. */
const loose = (st) => st.cards.filter((c, j) => j > 0 && DEFS[c.key].type !== "tool");
const capOf = (st) => (st.cards.some((c) => c.key === "basket") ? 10 : 4);
// What you carry is in one of three places (card.at): in your hands — no mark, stacked under your card where everyone
// can see it, 4 things at most; worn — 手 the one tool you hold, 身 布衣, 脚 草鞋, 背 背篓; or put away — two pockets
// for small things, and four more places in the basket while it is on your back. A pocket or basket place keeps one
// kind of thing, three at most (a tool on its own). Gathered things come into your hands; when they're full, into a
// place that fits; what fits nowhere is put down beside you.
const HAND_MAX = 4, SLOT_MAX = 3;
const WEAR = { cloth: "body", sandals: "feet", basket: "back" };
const EQUIP = ["held", "body", "feet", "back"];
const SLOT_NAMES = { held: "手", body: "身", feet: "脚", back: "背", p0: "兜", p1: "兜", b0: "篓", b1: "篓", b2: "篓", b3: "篓" };
const SLOT_TITLES = { held: "手：拿着的工具", body: "身：穿的", feet: "脚：穿的", back: "背：背的", p0: "兜：放小东西", p1: "兜：放小东西", b0: "背篓里", b1: "背篓里", b2: "背篓里", b3: "背篓里" };
/** What goes in a pocket or at your belt: small things, and the short tools. */
const POCKETABLE = new Set(["berry", "peachFruit", "jujubeFruit", "egg", "mushroom", "herb", "honey", "grain", "bean", "clam", "flint", "fiber", "rope", "salt", "shell", "shellBeads", "malachite", "saltedFish", "saltedMeat", "cooked", "knife", "axe", "hammer", "torch", "climbRope"]);
const packSlots = (st) => ["p0", "p1", ...(st.cards.some((c) => c.at === "back") ? ["b0", "b1", "b2", "b3"] : [])];
const slotMax = (card) => (bundleable(card) ? SLOT_MAX : 1);
const inHand = (st) => st.cards.filter((c, j) => j > 0 && !c.at);
const wearable = (card, slot) => (slot === "held" ? DEFS[card.key].type === "tool" && !WEAR[card.key] : WEAR[card.key] === slot);
/** A pocket or basket place this card can go in (the one asked for, if it will do): one already holding its kind first. */
function slotFor(st, card, want) {
  const ok = (s) => {
    if (s[0] === "p" && !POCKETABLE.has(card.key)) return false;
    const there = st.cards.filter((c) => c.at === s && c !== card);
    return !there.length || (there[0].key === card.key && there.length < slotMax(card));
  };
  const slots = packSlots(st);
  if (want) return slots.includes(want) && ok(want) ? want : null;
  return slots.find((s) => st.cards.some((c) => c.at === s && c.key === card.key) && ok(s)) ?? slots.find(ok) ?? null;
}
/** Put your things in order: wear what can be worn, hold a tool, tools and what your hands can't take put away.
 *  Returns what fits nowhere. */
function stow(st) {
  const things = st.cards.slice(1);
  for (const c of things) if (EQUIP.includes(c.at) && !wearable(c, c.at)) delete c.at;
  for (const slot of EQUIP) things.filter((c) => c.at === slot).slice(1).forEach((c) => delete c.at);
  for (const c of things) if (!c.at && WEAR[c.key] && !things.some((o) => o.at === WEAR[c.key])) c.at = WEAR[c.key];
  const slots = packSlots(st);
  for (const c of things) if (c.at && !EQUIP.includes(c.at) && (!slots.includes(c.at) || (c.at[0] === "p" && !POCKETABLE.has(c.key)))) delete c.at;
  for (const slot of slots) {
    const there = things.filter((c) => c.at === slot);
    there.filter((c, i) => c.key !== there[0].key || i >= slotMax(c)).forEach((c) => delete c.at);
  }
  if (!things.some((c) => c.at === "held")) { const t = things.find((c) => !c.at && wearable(c, "held")); if (t) t.at = "held"; }
  for (const c of things) if (!c.at && DEFS[c.key].type === "tool") { const slot = slotFor(st, c); if (slot) c.at = slot; }
  let hand = things.filter((c) => !c.at);
  for (const c of [...hand].reverse()) {
    if (hand.length <= HAND_MAX) break;
    const slot = slotFor(st, c);
    if (slot) { c.at = slot; hand = hand.filter((x) => x !== c); }
  }
  const order = [...EQUIP, ...slots];                                // in hand first, then what's put away, place by place
  const next = [st.cards[0], ...hand, ...things.filter((c) => c.at).sort((a, b) => order.indexOf(a.at) - order.indexOf(b.at))];
  if (next.some((c, i) => c !== st.cards[i])) st.cards = next;
  return hand.slice(HAND_MAX);
}
/** Take this tool in hand; the one held before is put away. */
function hold(st, card) {
  if (card.at === "held" || !wearable(card, "held")) return;
  for (const c of st.cards) if (c.at === "held") delete c.at;
  card.at = "held";
}
/** No room for one more of this kind (or, not saying, of something too big for a pocket): hands full and no place
 *  put away that will take it. */
function full(st, key) {
  if (st.cards[0].key !== "you") return loose(st).length >= capOf(st);
  if (inHand(st).length < HAND_MAX) return false;
  return !slotFor(st, { key: key && DEFS[key] ? key : "wood" });
}
const party = { open: false };
const DEPOT = { granary: "grain", stove: "fish" };                   // what each store takes in
/** Meals are eaten at the table; the food is what's in the pot on the stove beside it. */
const mealFrom = (target) => (target?.cards[0].key === "table" ? find("stove") ?? target : target);
/** Cooked meals are real cards in the pot; the stove's number only mirrors how many are there. */
function mealCount() { const s = find("stove"); return s ? s.cards.filter((c) => c.key === "cooked").length : 0; }
function syncMeals(stove = find("stove")) { if (!stove) return; const n = stove.cards.filter((c) => c.key === "cooked").length, c = stove.cards[0]; if (c && c.stock !== n) { c.stock = n; refreshStock(c); } }
function addMeals(n, stove = find("stove")) { if (!stove || n <= 0) return; for (let i = 0; i < n; i++) { const c = newCard("cooked"); stove.cards.push(c); layerOf(stove.board).append(c.el); c.el.classList.add("pop"); } syncMeals(stove); }
function takeMeals(n, stove = find("stove")) { if (!stove || n <= 0) return 0; const gone = stove.cards.filter((c) => c.key === "cooked").slice(0, n); for (const c of gone) { stove.cards = stove.cards.filter((x) => x !== c); c.el.remove(); } syncMeals(stove); return gone.length; }
function migrateMeals() {
  const stove = find("stove"); if (!stove) return;
  const cards = stove.cards.filter((c) => c.key === "cooked").length, stock = stove.cards[0].stock ?? 0;
  if (stock > cards) addMeals(stock - cards, stove); else syncMeals(stove);
}
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
  if (key === "chest") card.items = [];
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
/** Whom you're playing just now: yourself, or a villager you've taken over — their legs, their hands, their pack.
 *  Asleep or gone, and it's you again. */
function actor() {
  const id = me.playing;
  if (id) { const q = boards.world.find((s) => s.id === id && s.npc && awake(s)); if (q) return q; release(); }
  return youStack();
}
const isYou = (st) => st?.cards[0].key === "you";
/** Take over a villager (or, given nobody, go back to being yourself). */
function play(st) {
  const was = me.playing && boards.world.find((s) => s.id === me.playing);
  if (was && was !== st && was.ctl) { was.ctl.mode = "auto"; was.cards[0].el.classList.remove("played"); }
  me.playing = st && !isYou(st) ? st.id : null;
  if (st && !isYou(st)) {
    stopAuto();                                                       // the protagonist's auto walk is theirs alone
    const you = youStack();
    if (you) { you.walk = null; you.travel = null; cancelJob(you); you.repeat = null; }   // and they stand still while you play someone else
    st.ctl ??= { mode: "auto" };
    st.ctl.mode = "manual"; cancelJob(st); st.walk = null; st.goal = ""; st.task = ""; intent(st, ""); endMuse(st);
    if (st.npc.inside) comeOut(st);
    st.cards[0].el.classList.add("played");
    toast(`现在是${nameOf(st)}：拖他的牌走，底下是他身上带的。点你自己的牌，换回来`);
  }
  select(false); cam.follow = true; carryChanged(); renderMe(); renderParty();
}
function release() {
  const was = me.playing && boards.world.find((s) => s.id === me.playing);
  if (was?.ctl) { was.ctl.mode = "auto"; was.cards[0].el.classList.remove("played"); }
  me.playing = null;
}
function removeStack(st) { const a = boards[st.board]; const i = a.indexOf(st); if (i >= 0) a.splice(i, 1); st.bar?.remove(); st.bar = null; }
/** How much there is, the way you'd say it at a glance — nobody counts trees or ladles. */
function amountWord(c) {
  const n = c.stock ?? 0;
  if (c.key === "granary") { const r = n / granaryCap(c); return r <= 0 ? "空" : r < 0.2 ? "见底" : r < 0.45 ? "浅" : r < 0.8 ? "半囤" : r < 1 ? "快满" : "满"; }
  if (c.key === "stove") return n <= 0 ? "空锅" : n <= 2 ? "一点" : n <= 5 ? "半锅" : "满锅";
  if (c.key === "field" || c.key === "field2") return n <= 0 ? "刚种" : n === 1 ? "苗弱" : n === 2 ? "长得好" : "长势旺";
  return n <= 0 ? "空" : n <= 1 ? "剩一点" : n <= 4 ? "有" : "多";
}
const fireWord = (f) => (f <= 0 ? "灭了" : f <= 1 ? "快灭了" : f <= 3 ? "小火" : "火旺");
const keepWord = (n) => (n <= 0 ? "今天就要放坏了" : n === 1 ? "快坏了，明天就不能吃了" : n <= 3 ? "放不了几天了" : "还新鲜");
function refreshStock(c) {
  const field = c.key === "field" || c.key === "field2", source = DEFS[c.key].type === "source";
  if (field) {                                                   // a field says only what's in it: how it grows, you see on the ground
    if (!c.el.querySelector(".stock")) c.el.querySelector(".card-head").insertAdjacentHTML("beforeend", `<em class="stock"></em>`);
    c.el.querySelector(".soil")?.remove();
  }
  const em = c.el.querySelector(".stock");
  if (!em) return;
  em.textContent = field ? (c.sown === false ? (c.fallow ? "歇" : "空") : c.crop === "bean" ? "豆" : "粟") : source || c.stock === undefined ? "" : amountWord(c);   // a tree, a thicket, a pool: no count on it
  c.el.classList.toggle("empty", DEFS[c.key].type === "source" && c.key !== "field" && c.key !== "field2" && c.stock <= 0);
}
const bundleable = (card) => ["material", "food"].includes(DEFS[card.key].type) && card.charges === undefined;
/** What can be taken off a bundle one at a time: things, not furniture (beds bundle only to show "铺位 ×3"). */
const pickable = (card) => bundleable(card) && DEFS[card.key].type !== "structure";
function cardGroups(st) {
  const cards = st.cards, cache = st.groups;
  if (cache?.cards === cards && cache.length === cards.length && cache.last === cards.at(-1)) return cache.value;
  const value = bundleLayout(cards, bundleable).flatMap((g) => splitPlaces(g, cards));
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
/** A bundle doesn't run across places: what's in your hands and what's in a pocket are counted apart. */
function splitPlaces(group, cards) {
  const out = []; let s = group.start;
  for (let i = group.start + 1; i < group.end; i++) if (cards[i].at !== cards[i - 1].at) { out.push({ card: cards[s], start: s, end: i }); s = i; }
  out.push({ card: cards[s], start: s, end: group.end });
  return out;
}
/** How far apart a stack's groups sit. The yard's pile squeezes its column so it never runs out past the yard wall. */
const isPerson = (st) => Boolean(st.npc || st.pet || st.cards[0]?.key === "you");
/** Put away out of sight: what you wear or keep in a pocket or the basket; the tools a villager has hung on them. */
const stowed = (st, card) => card !== st.cards[0] && isPerson(st) && (st.cards[0].key === "you" ? Boolean(card.at) : DEFS[card.key].type === "tool");
/** Which row down its stack a group shows in: what's put away takes none. */
function rowOf(st, slot) {
  if (!isPerson(st)) return slot;
  const groups = cardGroups(st); let row = 0;
  for (let i = 0; i < slot; i++) if (!stowed(st, groups[i].card)) row++;
  return row;
}
/** How far below a stack's top its last card is. Someone carrying things is where their own card is. */
const stackDrop = (st) => (isPerson(st) ? 0 : Math.max(0, cardGroups(st).length - 1) * peekOf(st));
function peekOf(st) {
  const walls = st.store === "barn" ? MAP.barn : st.store === "room" ? works.rooms.find((r) => r.id === st.room)?.box : MAP.house;
  if (!st.store || st.board !== "world" || !walls) return PEEK;
  const n = cardGroups(st).length, room = walls.y + walls.h - 10 - st.y - st.h;
  return n > 1 ? Math.max(12, Math.min(PEEK, room / (n - 1))) : PEEK;
}
const center = (st) => ({ x: st.x + st.w / 2, y: st.y + stackDrop(st) + st.h / 2 });
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
  const R = { home: 520, stove: 380, hemp: 300 };
  const clearings = [...Object.values(MAP.sites).map((q) => ({ x: q.x, y: q.y, r: R[q.key] ?? 220 })), ...(MAP.extraFields ?? []).map((f) => ({ x: f.x, y: f.y, r: Math.max(f.w, f.h) * 0.6 }))];
  // Only things that stay put keep the ground clear: people and animals move, and two looks painted at different
  // times must put every tree in the same place or the turning season shows double.
  const fixed = boards.world.filter((q) => !q.npc && !q.critter && !q.pet && q.cards[0].key !== "you" && !CARRY.has(DEFS[q.cards[0].key].type));
  return { DECO, keepClear: [...fixed.map(center), ...clearings], season: s, eco: eco.filter((e) => e.kind !== "berry"), house: null };   // walls and floors are drawn on their own layer (paintWalls)
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
const DEEP_PINES = [[0.32, 0.36], [0.62, 0.72], [0.18, 0.62], [0.76, 0.3]];
function ensureDeepPines() {
  const tile = MAP.tiles.deep;
  if (!tile) return;
  DEEP_PINES.forEach(([fx, fy], i) => {
    const p = (nature.layout ?? 1) >= 2 ? layoutPoint(tile, fx, fy, "pineGrove", i + 100) : { x: tile.x + tile.w * fx, y: tile.y + tile.h * fy };
    if (!boards.world.some((st) => st.cards[0].key === "pineGrove" && dist(center(st), p) < 250)) placeCard("pineGrove", p);
  });
}
/** A layout point, nudged a little by this life's salt: every new life gets its own groves; old saves keep the old spots. */
const hash01 = (n) => { const x = Math.sin(n) * 43758.5453123; return x - Math.floor(x); };
const LAKE_BANDS = { lake: [0.4, 0.6, 0.06, 0.14], pit: [0.2, 0.36, 0.07, 0.16], shallows: [0.68, 0.86, 0.07, 0.18], reeds: [0.03, 0.12, 0.35, 0.6], nest: [0.04, 0.14, 0.5, 0.7] };
/** A genuinely random point in this tile's own patch: chestnuts anywhere in the wood, pines in the deep wood, herbs on
 *  the plateau, and the lake's few shore places in their own band. Same life, same salt: same points on reload. */
function randomLayoutPoint(tile, key, index, fallback) {
  const salt = nature.layoutSalt ?? 0, band = LAKE_BANDS[key];
  for (let k = 0; k < 36; k++) {
    const u = hash01(salt + index * 131 + k * 17 + key.charCodeAt(0) * 7 + tile.x * 0.001);
    const v = hash01(salt + index * 197 + k * 23 + key.charCodeAt(1) * 11 + tile.y * 0.001);
    const fx = band ? band[0] + u * (band[1] - band[0]) : 0.12 + u * 0.76;
    const fy = band ? band[2] + v * (band[3] - band[2]) : 0.12 + v * 0.76;
    const p = { x: tile.x + tile.w * fx, y: tile.y + tile.h * fy };
    if (!walkable(MAP, p.x, p.y) || MAP.road?.[MAP.idx(p.x, p.y)]) continue;
    const i = MAP.idx(p.x, p.y), zone = countryAt(p), depth = woodDepth(MAP, p.x, p.y);
    if (key === "chestnut" && (MAP.cls[i] !== G.FOREST || depth < 0.2)) continue;
    if (key === "berries" && (MAP.cls[i] !== G.FOREST || depth > 0.7)) continue;
    if (["pineGrove", "mushrooms", "hive"].includes(key) && !String(zone).startsWith("deep")) continue;
    if (["herbs", "copperRock"].includes(key) && zone !== "plateau") continue;
    return p;
  }
  return fallback;
}
function layoutPoint(tile, fx, fy, key, index) {
  const fixed = { x: tile.x + tile.w * fx, y: tile.y + tile.h * fy };
  if (["cliffFoot", "cliffTop", "lookout"].includes(key)) return fixed;   // the way up the cliff and the lookout stay put
  if ((nature.layout ?? 1) >= 3) return randomLayoutPoint(tile, key, index, fixed);
  let x = fixed.x, y = fixed.y;
  if ((nature.layout ?? 1) >= 2) {
    const salt = nature.layoutSalt ?? 0;
    x += (hash01(salt + index * 131 + key.charCodeAt(0) * 7 + tile.x * 0.001) - 0.5) * tile.w * 0.05;
    y += (hash01(salt + index * 197 + key.charCodeAt(1) * 11 + tile.y * 0.001) - 0.5) * tile.h * 0.05;
  }
  return { x, y };
}
/** Older saves: the wood had only three stands of chestnut; fill it up to the full layout. */
function settleGroves() {
  for (const [tile, list] of Object.entries(DEEP_LAYOUT)) {
    const D = MAP.tiles[tile];
    if (D) list.forEach(([k, fx, fy], i) => { const p = layoutPoint(D, fx, fy, k, i); if (!boards.world.some((st) => st.cards[0].key === k && dist(center(st), p) < 250)) placeCard(k, p); });
  }
  const T = MAP.tiles.forest;
  if (!T) return;
  WOOD_LAYOUT.forEach(([k, fx, fy], i) => {
    const p = layoutPoint(T, fx, fy, k, i);
    if (!boards.world.some((st) => st.cards[0].key === k && dist(center(st), p) < 250)) placeCard(k, p);
  });
  ensureDeepPines();
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
  nature.layout = 3; nature.layoutSalt = ((seed * 2654435761) ^ Date.now()) >>> 0;   // a fresh arrangement of groves for this life
  for (const [site, list] of Object.entries(LAYOUT)) for (const [k, dx, dy, stock] of list) placeCard(k, at([site, dx, dy]), stock);
  const T = MAP.tiles, inTile = (t, fx, fy) => ({ x: t.x + t.w * fx, y: t.y + t.h * fy });
  if (T.farm) for (const [k, fx, fy] of FARM_FIELDS) {                 // the farm tile: fields already broken, furrows on the ground
    const p = inTile(T.farm, fx, fy);
    const st = placeCard(k, p);
    (MAP.extraFields ??= []).push({ patch: "field", x: p.x, y: p.y, ...FIELD_SIZE, card: st.cards[0] });   // furrows always; the crop once it is sown
  }
  if (T.forest) WOOD_LAYOUT.forEach(([k, fx, fy], i) => placeCard(k, layoutPoint(T.forest, fx, fy, k, i)));
  if (T.lake) LAKE_LAYOUT.forEach(([k, fx, fy], i) => placeCard(k, layoutPoint(T.lake, fx, fy, k, i)));
  if (T.plateau) PLATEAU_LAYOUT.forEach(([k, fx, fy], i) => placeCard(k, layoutPoint(T.plateau, fx, fy, k, i)));
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
  setupBarn();
  settleKitchen();
  migrateMeals();
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
 *  The yard and the granary were the first two rooms; their walls are wall segments on the 80px grid like any other
 *  (walls.js), so a room can be built on to them and a door opened through.
 *  furnish: put the bed, the hearth and the first grain in (a restored game brings its own). */
/** Where the yard and the granary stood before walls went on the grid: the site, then the granary east of the yard. */
function compoundsAsLaidOut() {
  const s = MAP.sites.home, yd = s.yard, st = MAP.sites.stove;
  const house = { x: s.x + yd.x, y: s.y + yd.y, w: yd.w, h: yd.h, gate: { x: s.x - 60, w: 120 } };
  if (!st) return { house };
  const { w, h } = BARN_SIZE, x = Math.max(st.x - 170, house.x + house.w + 60), y = st.y - 170;
  return { house, barn: { x, y, w, h, gate: { x: x + w / 2 - 50, w: 100 } } };
}
const buildState = () => (village.build ??= { v: 1, segs: [], roofed: [], jobs: {}, seq: 0 });
/** A walled compound on the grid: its snapped rectangle and its door. First time (a new game or an older save), its
 *  walls go in and — for an older save — whatever stood inside moves with the wall by the few pixels of the snap. */
function gridCompound(c, tag, shift) {
  const b = buildState(), out = fromCompound(c, "fence");
  if (!b.segs.some((s) => s.plan === tag)) {
    b.segs.push(...out.segs.map((s) => ({ ...s, plan: tag })));
    const r = out.rect;
    for (let i = r.x / GRID; i < (r.x + r.w) / GRID; i++) for (let j = r.y / GRID; j < (r.y + r.h) / GRID; j++) b.roofed.push(`${i},${j}`);
    if (shift && (out.dx || out.dy)) for (const q of boards.world) {
      const p = center(q);
      if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) { q.x += out.dx; q.y += out.dy; }
    }
  }
  const door = out.segs.find((s) => s.kind === "door");
  return { ...out.rect, gate: { x: segRect(door.k).x, w: GRID } };
}
function setupMainHouse(furnish = true) {
  const house = find("taoHouse");
  if (!house) return;
  const c = gridCompound(compoundsAsLaidOut().house, "yard", !furnish);
  house.compound = c;
  MAP.house = c;
  if (furnish) {
    for (let i = 0; i < 2; i++) { const { x, y } = bedSlot(i, c); newStack([newCard("bed")], x, y, "world"); }
    for (const [key, stock] of [["fire"], ["stove", 4], ["table"]]) {
      const { x, y } = yardFurnishing(key, c);
      newStack([newCard(key, stock)], x, y, "world");
    }
  }
  house.cards[0].el.classList.add("no-card");        // the yard is the house; no label card standing in it
  wallsChanged();
  if (!find("workbench")) { const at = benchSpot(); if (at) newStack([newCard("workbench")], at.x, at.y, "world"); }
}
/** The granary is a building of its own by the house: walls, a roof, a door on the south side; inside, the grain bin
 *  and the heap of materials, out of the rain. It stands east of the yard, with room to walk between. */
function setupBarn() {
  const bin = find("granary"), laid = compoundsAsLaidOut().barn;
  if (!bin || !laid || !MAP.house) return;
  const c = gridCompound(laid, "barn", true);
  MAP.barn = c; bin.compound = c;
  wallsChanged();
}
const inBarn = (p) => { const c = MAP.barn; return Boolean(c && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h); };
// ---- Walls and rooms (walls.js has the rules; walls-paint.js the look) ----
const works = { rooms: [], cv: null, roofs: new Map(), sites: new Map(), preview: [], season: null, labelAt: -1 };
/** Walls went up or came down: what blocks the way, which rooms there are, and how it all looks. */
function wallsChanged() {
  const b = buildState();
  MAP.blocks = blockRects(b.segs);
  works.rooms = findRooms(asBuilt(b.segs));
  pathCache.clear();
  settleRoofs();
  syncSites();
  paintWalls();
  refreshRoofs();
}
const roofedCells = () => new Set(buildState().roofed);
const isRoofed = (room, set = roofedCells()) => room.cells.every(([i, j]) => set.has(`${i},${j}`));
const roomHere = (p) => (p ? roomAt(works.rooms, p) : null);
/** Under a roof: a room with walls all round and a roof over it. */
const roofedRoomAt = (p) => { const r = roomHere(p); return r && isRoofed(r) ? r : null; };
const inRoom = (p) => Boolean(roofedRoomAt(p));
/** The floors and the walls, on one canvas just big enough for everything built or planned. */
function paintWalls() {
  const b = buildState(), keys = [...b.segs.map((s) => s.k), ...works.preview];
  works.season = shownSeason();
  if (!keys.length) { if (works.cv) works.cv.hidden = true; return; }
  const rs = keys.map((k) => segRect(k, 40));
  const x0 = Math.min(...rs.map((r) => r.x)) - 40, y0 = Math.min(...rs.map((r) => r.y)) - 40;
  const w = Math.max(...rs.map((r) => r.x + r.w)) + 40 - x0, h = Math.max(...rs.map((r) => r.y + r.h)) + 40 - y0;
  if (!works.cv) { works.cv = document.createElement("canvas"); works.cv.className = "walls-layer"; cardsLayer.prepend(works.cv); }
  const cv = works.cv;
  cv.hidden = false;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  Object.assign(cv.style, { left: `${x0}px`, top: `${y0}px`, width: `${w}px`, height: `${h}px` });
  const g = cv.getContext("2d"), winter = works.season === "冬";
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.setTransform(1, 0, 0, 1, -x0, -y0);
  drawFloor(g, works.rooms.flatMap((r) => r.cells), { winter });
  drawWalls(g, b.segs, { winter, preview: works.preview });
  const roofed = roofedCells();                                         // a room still open to the sky: its outline, and what its roof wants
  g.save(); g.setLineDash([10, 8]); g.strokeStyle = "rgba(92, 64, 32, .7)"; g.lineWidth = 3;
  g.font = "bold 20px serif"; g.textAlign = "center"; g.fillStyle = "rgba(60, 40, 20, .9)";
  for (const room of works.rooms) {
    if (isRoofed(room, roofed)) continue;
    for (const r of room.rects) g.strokeRect(r.x + 14, r.y + 14, r.w - 28, r.h - 28);
    const need = works.sites.get(roofKey(room))?.cards[0].need.thatch ?? 0, r0 = room.rects[0];
    g.fillText(need > 0 ? `还缺草苫 ${need}` : "草苫齐了，站上去苫顶", r0.x + r0.w / 2, r0.y + r0.h / 2 + 7);
  }
  g.restore();
}
/** What a room is called: the yard and the granary keep their names; any other by what's in it. */
function roomLabel(room) {
  if (MAP.house && roomAt([room], { x: MAP.house.x + 40, y: MAP.house.y + 40 })) return "院子";
  if (MAP.barn && roomAt([room], { x: MAP.barn.x + 40, y: MAP.barn.y + 40 })) return "仓房";
  const inside = boards.world.filter((q) => !q.npc && !q.critter && !q.pet && !q.lifted && !q.site && roomAt([room], center(q)));
  const bedsIn = inside.filter((q) => q.cards[0].key === "bed"), plan = bedsIn.length === 1 ? bedPlan() : null;
  const sleeper = plan && [...plan].find(([, b]) => b === bedsIn[0])?.[0];
  return roomName(inside.flatMap((q) => (q.store ? ["store"] : [q.cards[0].key])), { sleeper: sleeper ? nameOf(sleeper) : undefined });
}
/** One roof per roofed room, named for what's in it. */
function refreshRoofs() {
  const set = roofedCells(), seen = new Set();
  works.labelAt = clock.min;
  for (const room of works.rooms) {
    if (!isRoofed(room, set)) continue;
    const key = `${room.id}:${room.cells.length}`, label = roomLabel(room), hidden = label === "院子" || label === "仓房";
    seen.add(key);
    let el = works.roofs.get(key);
    if (el && el.dataset.label === label) { el.dataset.hideName = hidden ? "1" : "0"; continue; }
    const open = el?.classList.contains("open");
    el?.remove();
    el = roofEl(room, { label: hidden ? "" : label, open }); el.dataset.label = label; el.dataset.room = room.id; el.dataset.hideName = hidden ? "1" : "0";
    cardsLayer.append(el); works.roofs.set(key, el);
  }
  for (const [key, el] of works.roofs) if (!seen.has(key)) { el.remove(); works.roofs.delete(key); }
}
/** Roofs lift over the building you're in (the rooms its doors join); names keep up with what's moved about. */
function roofTick(you) {
  if (clock.min - works.labelAt >= 60) refreshRoofs();
  if (works.season !== shownSeason()) paintWalls();
  const here = you && board === "world" ? roomHere(center(you)) : null;
  const open = new Set(here ? buildingOf(works.rooms, here).map((r) => r.id) : []);
  for (const el of works.roofs.values()) el.classList.toggle("open", open.has(el.dataset.room));
}
// ---- Building with walls: each planned length of wall, door or roof is a site to bring materials to and work on ----
// A site is a hidden foundation card (key "plot", build "wall"), so carrying, handing in, leading the work and
// learning by helping all go as they do for any foundation. Its materials and progress live on the segment.
const SITE_STAGE = {
  wall: { name: "砌墙", ...SEG_COST.wall, thaw: true, cold: "冬天泥和不开，开春再砌" },
  door: { name: "装门", ...SEG_COST.door },
  demolish: { name: "拆墙", needs: {}, work: 30, tool: "hammer" },
  roof: { name: "上顶", thaw: true, cold: "冬天苫不了顶，开春再说" },
};
const SITE_NAME = { wall: "要砌的墙", door: "要装的门", demolish: "要拆的墙", roof: "要上的顶" };
/** How much of a material all the sites together still want. */
const siteNeed = (k) => [...works.sites.values()].reduce((n, q) => n + (q.cards[0].need?.[k] ?? 0), 0);
const segBy = (k) => buildState().segs.find((s) => s.k === k);
/** Seen as a room by the walls: a wall being knocked through for a door still closes the room in meanwhile. */
const asBuilt = (segs) => segs.map((s) => (s.was && s.state === "plan" ? { ...s, state: "built", kind: "door" } : s));
/** Does this segment run along the edge of cell (i, j)? */
const segTouches = (k, i, j) => { const s = parseSeg(k); return s.dir === "h" ? s.i === i && (s.j === j || s.j === j + 1) : s.j === j && (s.i === i || s.i === i + 1); };
const roofKey = (room) => `roof:${room.id}:${room.cells.length}`;
function newSite(kind, need, work, at, size) {
  const c = newCard("plot", undefined, "s");
  c.el.classList.add("no-card");
  c.build = "wall"; c.site = kind; c.stage = 0; c.need = need; c.work = work;
  c.stages = [{ ...SITE_STAGE[kind], needs: { ...SITE_STAGE[kind].needs } }];
  c.name = SITE_NAME[kind]; c.el.querySelector(".card-head span").textContent = c.name;
  const st = newStack([c], at.x, at.y, "world");
  st.w = size.w; st.h = size.h; st.site = true;
  return st;
}
function dropSite(st) { st.cards[0].el.remove(); removeStack(st); }
/** One site for every planned segment and every room still open to the sky; none for anything else. */
function syncSites() {
  const b = buildState(), want = new Map();
  for (const s of b.segs) if (s.state === "plan" || s.demolish) want.set(s.k, s);
  for (const room of works.rooms) if (!isRoofed(room)) want.set(roofKey(room), room);
  for (const [k, st] of works.sites) {
    if (want.has(k) && boards.world.includes(st)) continue;
    if (boards.world.includes(st)) dropSite(st);
    works.sites.delete(k);
    if (k.startsWith("roof:")) { refund(b.jobs[k]?.given ?? {}); delete b.jobs[k]; }
  }
  for (const [k, x] of want) {
    if (works.sites.has(k)) continue;
    if (x.cells) {                                                       // a room wanting its roof
      const roofed = roofedCells(), n = x.cells.filter(([i, j]) => !roofed.has(`${i},${j}`)).length, cost = roofCost(n);
      const job = (b.jobs[k] ??= { need: { ...cost.needs }, work: 0, given: {} });
      const r = x.rects[0], st = newSite("roof", job.need, job.work, { x: r.x + r.w / 2 - 40, y: r.y + r.h / 2 - 40 }, { w: 80, h: 80 });
      const owner = b.segs.find((s) => s.by && x.cells.some(([i, j]) => segTouches(s.k, i, j)));
      if (owner) st.cards[0].by = owner.by;
      st.cards[0].roof = k; st.cards[0].stages[0] = { ...st.cards[0].stages[0], needs: { ...cost.needs }, work: cost.work };
      works.sites.set(k, st);
      continue;
    }
    const kind = x.demolish ? "demolish" : x.kind, r = segRect(k, 40);
    const st = newSite(kind, x.demolish ? {} : x.need, x.demolish ? 0 : x.work, { x: r.x, y: r.y }, { w: r.w, h: r.h });
    st.cards[0].seg = k; if (x.by) st.cards[0].by = x.by;
    works.sites.set(k, st);
  }
}
/** Materials given back go onto the heap at home. */
function refund(given) {
  const cards = Object.entries(given).flatMap(([k, n]) => Array.from({ length: Math.max(0, n) }, () => newCard(k)));
  if (cards.length) storeHome(cards);
}
/** Progress on a site goes onto its segment (or its room's roof), and the wall shows it. */
function siteProgress(c) {
  if (c.seg) { const s = segBy(c.seg); if (s && !s.demolish) s.work = c.work; }
  if (c.roof) {
    const job = buildState().jobs[c.roof];
    if (job) { job.work = c.work; for (const [k, n] of Object.entries(c.stages[0].needs)) job.given[k] = n - (c.need[k] ?? 0); }
  }
  paintWalls();
}
/** People and loose things standing on a new wall step off it. */
function clearLine(k) {
  const r = segRect(k, 40), { dir } = parseSeg(k), mid = segMid(k);
  for (const q of boards.world) {
    if (q.site || q.lifted || !(q.npc || q.cards[0].key === "you" || q.critter || q.pet || CARRY.has(DEFS[q.cards[0].key].type))) continue;
    if (!(q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y)) continue;
    const c = center(q);
    if (dir === "h") q.y += (c.y < mid.y ? -1 : 1) * 60; else q.x += (c.x < mid.x ? -1 : 1) * 60;
  }
}
/** Anyone shut in a room with no door is let out by the south wall. */
function letOut() {
  for (const room of works.rooms.filter((r) => !r.doors.length)) {
    for (const q of boards.world) {
      if (!(q.npc || q.critter || q.pet) || q.npc?.inside || !roomAt([room], center(q))) continue;
      q.x = room.box.x + room.box.w / 2 - q.w / 2; q.y = room.box.y + room.box.h + 30; q.walk = null;
    }
  }
}
/** A site's work is done: the wall stands (or is down), the door hangs, the roof is on. */
function finishSite(target, by) {
  const c = target.cards[0], b = buildState();
  works.sites.delete(c.seg ?? c.roof); dropSite(target);
  let line = "";
  if (c.seg) {
    const s = segBy(c.seg);
    if (s?.demolish) { b.segs = b.segs.filter((x) => x !== s); if (s.kind === "door") refund({ log: 1 }); line = "墙拆了"; }
    else if (s) { s.state = "built"; s.need = {}; s.work = SEG_COST[s.kind].work; delete s.was; clearLine(s.k); line = s.kind === "door" ? "门装好了" : "这段墙立起来了"; }
  }
  if (c.roof) {
    const room = works.rooms.find((r) => roofKey(r) === c.roof);
    if (room) for (const [i, j] of room.cells) if (!b.roofed.includes(`${i},${j}`)) b.roofed.push(`${i},${j}`);
    delete b.jobs[c.roof]; line = "屋顶苫好了";
    if (room && b.storeFor && b.segs.some((s) => s.plan === b.storeFor && room.cells.some(([i, j]) => segTouches(s.k, i, j)))) {   // the store they put up: the heap that wouldn't fit goes in
      (b.storeRooms ??= []).push(room.id); delete b.storeFor;
      const barn = barnPile();
      if (barn && barn.cards.length > STORE_CAP) { const extra = barn.cards.splice(STORE_CAP, STORE_CAP); sortPile(barn); storeHome(extra); }
      village.storeFull = barn && barn.cards.length > STORE_CAP ? day() : null;   // still spilling over: another store is wanted
      chronicle("新盖的仓房上了顶，堆不下的料搬了进去。");
    }
    if (room && b.coupleFor && b.segs.some((s) => s.plan === b.coupleFor && room.cells.some(([i, j]) => segTouches(s.k, i, j)))) {
      b.coupleRoom = room.id; delete b.coupleFor;
      const spouse = npcs().find((q) => q.npc.key === family().spouse), bed = spouse && bedPlan().get(spouse), at = bed && roomBedSpot([room]);
      if (at) { bed.x = at.x; bed.y = at.y; }
    }
  }
  wallsChanged(); letOut();
  if (by && heard(by, 900)) sfx("build");
  if (c.roof) {
    village.lastBuilt = { day: day(), name: "一间新屋" };
    if (by) chronicle(`${nameOf(by)}给新屋苫好了顶。`); else { banner("✦", "新屋上好了顶"); chronicle("你给新屋苫好了顶。"); }
  }
  if (!by) { me.known.wall = { mem: 1, day: day() }; float(line, center(target), "world"); }
}
/** Roofed cells no longer in any room: the walls came down. Some of the thatch is saved. */
function settleRoofs() {
  const b = buildState(), inRooms = new Set(works.rooms.flatMap((r) => r.cells.map(([i, j]) => `${i},${j}`)));
  const lost = b.roofed.filter((k) => !inRooms.has(k));
  if (!lost.length) return;
  b.roofed = b.roofed.filter((k) => inRooms.has(k));
  refund({ reed: Math.floor(lost.length / 4) });
}

// ---- The village builds on by itself (expansion.js decides when and where) ----
/** Open ground for a new room: level, off the road and the gateway, nothing standing there. */
function freeCell(i, j) {
  const x = i * GRID, y = j * GRID, pts = [[x + 10, y + 10], [x + 70, y + 10], [x + 10, y + 70], [x + 70, y + 70], [x + 40, y + 40]];
  if (pts.some(([px, py]) => terrainBlock(MAP, px, py) || MAP.road?.[MAP.idx(px, py)] || inJungle({ x: px, y: py }))) return false;
  if (beforeGate(x, y, GRID, GRID)) return false;
  return !boards.world.some((q) => !q.npc && !q.critter && !q.pet && !q.lifted && !q.cards[0].el.classList.contains("no-card")
    && q.x < x + GRID && q.x + q.w > x && q.y < y + GRID && q.y + q.h > y);
}
const seasonKey = () => `${yearOf()}-${season()}`;
/** Once a day: does the village need another room, and is there someone who can put one up? They draw it, then build it. */
function considerExtension() {
  const b = buildState();
  if (!MAP.house || [...works.sites.values()].some((q) => q.cards[0].by)) return;      // one new room at a time, roof and all
  const people = npcs().filter((q) => !q.npc.visitor && !q.npc.arriving);
  const f = family();
  const need = extensionNeed({
    adults: people.filter((q) => !littleOne(q)).length + (village.wantsRoom ? 1 : 0), beds: beds().reduce((n, q) => n + capOfBed(q), 0), freeBedSpots: freeBedSlot() ? 1 : 0,
    couplesWithoutRoom: f.spouse && !b.coupleRoom && people.some((q) => q.npc.key === f.spouse) ? 1 : 0,
    heapKinds: storesSpilling() ? 1 : 0, heapCap: 0, season: season(), planning: false,   // a heap is at its limit
  });
  if (!need || b.declined?.[need.kind] === seasonKey()) return;
  const who = people.filter((q) => !littleOne(q) && npcSkill(q, "wall") >= LEAD).sort((a, c) => npcSkill(c, "wall") - npcSkill(a, "wall"))[0];
  if (!who) return;
  const gate = { x: MAP.house.gate.x + GRID / 2, y: MAP.house.y + MAP.house.h };
  const site = extensionSite({ segs: asBuilt(b.segs), rooms: works.rooms, w: need.w, h: need.h, free: freeCell, home: gate });
  if (!site) return;
  const id = `n${++b.seq}`, by = who.npc.key;
  for (const k of site.segs) b.segs.push(newSeg(k, { plan: id, by }));
  const door = b.segs.find((s) => s.k === site.door);
  if (door && door.kind !== "door") Object.assign(door, { state: "plan", was: door.kind, kind: "door", need: { ...SEG_COST.door.needs }, work: 0, plan: id, by });
  if (need.kind === "couple") b.coupleFor = id;
  if (need.kind === "store") b.storeFor = id;
  wallsChanged();
  const c = { x: (site.cells.reduce((n, [i]) => n + i, 0) / site.cells.length + 0.5) * GRID, y: (site.cells.reduce((n, [, j]) => n + j, 0) / site.cells.length + 0.5) * GRID };
  const h = MAP.house, dx = c.x - (h.x + h.w / 2), dy = c.y - (h.y + h.h / 2);
  const side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "东" : "西") : dy > 0 ? "南" : "北";
  think(who, { id: "extend", because: need.because });
  chronicle(`${nameOf(who)}说${need.because.replace(/，.*$/, "")}，在院子${side}边划了一间新屋。`);
  talks.push({ at: clock.min + 60, st: who, text: `“${need.because}。我在${side}边划了线，谁有空帮着和泥。”` });   // said when they're up and someone's by
}
/** A wall or roof this villager drew and hasn't finished. */
const ownSite = (st) => [...works.sites.values()].find((q) => q.cards[0].by === st.npc.key && !stepBlocked(q.cards[0], st)) ?? null;
/** Get on with your own new room: build a length that has its materials, else fetch what the next one wants. */
function siteTurn(st, anyones = false) {
  const mine = [...works.sites.values()].filter((q) => (anyones ? q.cards[0].by : q.cards[0].by === st.npc.key) && !stepBlocked(q.cards[0], st));
  if (!mine.length) return false;
  think(st, { id: "extend", because: anyones && mine[0].cards[0].by !== st.npc.key ? "屋里挤，帮着把新屋弄起来" : "接着弄那间新屋" });
  const canLead = (q) => npcSkill(st, "wall") >= LEAD || q.cards[0].ledDay === day();
  const ready = mine.find((q) => canLead(q) && !Object.values(q.cards[0].need).some((v) => v > 0));
  if (ready) { go(st, "plot", "build", null, ready); return true; }
  const site = mine.filter((q) => Object.values(q.cards[0].need).some((v) => v > 0)).sort((a, b) => dist(center(a), center(st)) - dist(center(b), center(st)))[0];
  return Boolean(site) && supplyFor(st, Object.entries(site.cards[0].need).find(([, v]) => v > 0)[0], site);
}
/** You pulled down a villager's plan: they won't bring it up again this season. */
function declineExtension(s) {
  const b = buildState(), id = s.plan;
  if (!s.by || !id) return;
  const kind = b.coupleFor === id ? "couple" : "bedroom";
  (b.declined ??= {})[kind] = seasonKey();
  for (const x of b.segs.filter((y) => y.plan === id && y.state === "plan")) {
    if (x.was) { Object.assign(x, { state: "built", kind: x.was, need: {}, work: SEG_COST[x.was].work }); delete x.was; }
  }
  b.segs = b.segs.filter((y) => !(y.plan === id && y.state === "plan"));
}

// ---- Laying parts on the ground: wall boards, door boards, thatch, stakes and plans ----
/** What's been handed in on a planned segment so far. */
const givenTo = (s) => Object.fromEntries(Object.entries(SEG_COST[s.kind].needs).map(([k, n]) => [k, n - (s.need[k] ?? 0)]));
const needsGiven = (plan) => { const out = {}; for (const s of buildState().segs) if (s.plan === plan && s.state === "plan") for (const [k, n] of Object.entries(givenTo(s))) out[k] = (out[k] ?? 0) + n; return out; };
function setPreview(keys) { works.preview = keys; paintWalls(); }
/** Why a wall can't stand along here, or null. */
function segProblem(k) {
  const r = segRect(k), { dir } = parseSeg(k);
  const pts = [0.25, 0.5, 0.75].map((t) => (dir === "h" ? { x: r.x + r.w * t, y: r.y + r.h / 2 } : { x: r.x + r.w / 2, y: r.y + r.h * t }));
  if (pts.some((p) => !known(p))) return "还没去过那儿";
  if (pts.some((p) => { const why = terrainBlock(MAP, p.x, p.y); return why && why !== "wall"; })) return "地不平";
  if (pts.some((p) => MAP.road?.[MAP.idx(p.x, p.y)])) return "这儿是走的路";
  if (beforeGate(r.x, r.y, r.w, r.h)) return "挡着院门口";
  const under = boards.world.find((q) => !q.site && !q.npc && !q.critter && !q.pet && !q.lifted && q.cards[0].key !== "you" && !CARRY.has(DEFS[q.cards[0].key].type)
    && !q.cards[0].el.classList.contains("no-card") && q.x < r.x + r.w && q.x + q.w > r.x && q.y < r.y + r.h && q.y + q.h > r.y);
  if (under) return `压着${under.cards[0].name ?? DEFS[under.cards[0].key].name}`;
  return null;
}
const oneKind = (lift) => (lift?.cards.length && lift.cards.every((c) => c.key === lift.cards[0].key) ? lift.cards[0].key : null);
/** While dragging wall boards over open ground: where they'd stand; a door board: the wall it'd go in. */
function layPreview(lift, p) {
  const key = oneKind(lift), keys = key === "wattle" ? edgeRun(p, lift.cards.length) : key === "doorPanel" ? [segAt(p)?.k].filter(Boolean) : [];
  if (keys.join() !== works.preview.join()) setPreview(keys);
}
/** Parts let go of on open ground. True if they were laid (what isn't used goes back into your hands). */
function layOnGround(lift, p) {
  const key = oneKind(lift);
  if (board !== "world" || !key) return false;
  const you = youStack(), back = (cards) => { removeStack(lift); if (cards.length) { you.cards.push(...cards); overflow(you); } };
  if (key === "wattle") {
    const b = buildState();
    let used = 0, why = null;
    for (const k of edgeRun(p, lift.cards.length)) {
      const s = b.segs.find((x) => x.k === k);
      if (s) { if (s.state === "plan" && (s.need.wattle ?? 0) > 0) { s.need.wattle--; used++; } continue; }
      const bad = segProblem(k);
      if (bad) { why ??= bad; continue; }
      const seg = newSeg(k, { plan: "you" }); seg.need.wattle = 0;
      b.segs.push(seg); used++;
    }
    lift.cards.slice(0, used).forEach((c) => c.el.remove());
    back(lift.cards.slice(used));
    if (!used) { sayHint(`lay-${why}`, why ? `这儿立不了墙：${why}` : "这儿已经有墙了"); return true; }
    wallsChanged();
    if (doorlessRooms(asBuilt(b.segs)).length) sayHint("lay-nodoor", "围起来了，还没留门：做块门板，拖到一段墙上");
    else sayHint("lay-wall", "墙板立起来了：带上黏土站上去糊泥");
    return true;
  }
  if (key === "doorPanel") {
    const s = segAt(p);
    if (!s || s.kind === "door" || s.demolish) return false;
    lift.cards[0].el.remove(); back(lift.cards.slice(1));
    if (s.state === "plan") { refund(givenTo(s)); Object.assign(s, { kind: "door", need: { doorPanel: 0 }, work: 0 }); }
    else Object.assign(s, { state: "plan", was: "wall", kind: "door", need: { doorPanel: 0 }, work: 0, plan: "you" });
    wallsChanged();
    sayHint("lay-doorpanel", "门板靠到墙上了：站上去把门装好");
    return true;
  }
  if (key === "thatch") {
    const room = roomHere(p), site = room && works.sites.get(roofKey(room));
    if (!site) return false;
    handIn(site, lift);
    return true;
  }
  const kind = PLAN_CARD[key];
  if (!kind) return false;
  const at = kind === "farm" ? snapField(p, 700) ?? p : p;
  const bad = foundationProblem(kind, at);
  if (bad) { sayHint(`lay-${bad}`, bad); back(lift.cards); return true; }
  lift.cards[0].el.remove(); back(lift.cards.slice(1));
  layFoundation(kind, at);
  toast(kind === "farm" ? "界桩打下去了：先清理，再带着锄头翻地" : "线划好了：一步步来，把料带上去，齐了站上去干");
  return true;
}
/** With a hammer, stopping on a built wall marks it to come down; its site is where you work. */
function wallToTakeDown(p) {
  const s = segAt(p);
  if (!s || s.state !== "built" || s.kind !== "wall" || s.demolish) return null;
  s.demolish = true; wallsChanged();
  return works.sites.get(s.k) ?? null;
}
/** A hammer on a planned length: the plan is taken back, and what was in it. */
function cancelSite(st, target) {
  const c = target.cards[0], s = c.seg && segBy(c.seg), b = buildState();
  works.sites.delete(c.seg); dropSite(target);
  if (s?.by) { refund(needsGiven(s.plan)); declineExtension(s); toast(`把${DEFS[s.by]?.name ?? "他"}划的线拆了，这一季不再提`); }
  else if (s) {
    refund(givenTo(s));
    if (s.was) { Object.assign(s, { state: "built", kind: s.was, need: {}, work: SEG_COST[s.was].work }); delete s.was; }
    else b.segs = b.segs.filter((x) => x !== s);
  }
  wallsChanged(); wearTool(st, "hammer");
  float("拆回来了，料放回了家里", center(st), st.board); carryChanged();
}
/** A villager made a chest or a shadow pole: it goes where such a thing goes. */
function setDown(st, card) {
  st.cards = st.cards.filter((c) => c !== card);
  const [w, h] = TIERS.s, free = card.key === "chest" ? (storeRooms().length ? null : benchSpot()) : null;   // another cupboard: wherever there's room
  const p = spotFor(card.key) ?? (free ? { x: free.x + w / 2, y: free.y + h / 2 } : center(st));
  newStack([card], p.x - w / 2, p.y - h / 2, "world");
  chronicle(`${nameOf(st)}做了一个${DEFS[card.key].name}。`);
  tell(st, `“${DEFS[card.key].name}做好了，放这儿。”`);
}
/** Somewhere in the yard for the workbench, clear of the beds' places, the way in and what stands there; else just outside the west wall. */
function benchSpot() {
  const c = MAP.house; if (!c) return null;
  const W = CARD_W, H = CARD_H;
  const taken = [...BED_SLOTS.map(([x, y]) => ({ x: c.x + x, y: c.y + y, w: W, h: H })),
    ...boards.world.filter((q) => !q.npc && !q.critter && !q.pet && !q.site && q.cards[0].key !== "taoHouse").map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h + (q.store ? 220 : 0) })),
    { x: c.gate.x - 20, y: c.y + c.h / 2, w: c.gate.w + 40, h: c.h / 2 }];
  const free = (x, y) => taken.every((r) => x + W <= r.x || x >= r.x + r.w || y + H <= r.y || y >= r.y + r.h);
  for (let y = c.y + 16; y + H <= c.y + c.h - 12; y += 20) for (let x = c.x + 16; x + W <= c.x + c.w - 12; x += 20) if (free(x, y)) return { x, y };
  for (let y = c.y + 40; y + H < c.y + c.h; y += 40) { const x = c.x - W - 60; if (walkable(MAP, x + W / 2, y + H / 2) && free(x, y)) return { x, y }; }
  return null;
}
/** The segment under a tap, if one is close. */
function segAt(p) {
  let best = null, bd = 30;
  for (const s of buildState().segs) { const m = segMid(s.k), d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = s; } }
  return best;
}
/** Older saves (and a new game's granary): the stove and a table into the yard, the bin and the materials into the
 *  granary, anything that stood where its walls now are moved out of the way. */
function settleKitchen() {
  const yard = MAP.house, barn = MAP.barn;
  if (!yard) return;
  const put = (st, p) => { if (p) { st.x = p.x; st.y = p.y; } };
  const stove = find("stove");
  if (stove && !inYard(center(stove))) put(stove, yardFurnishing("stove", yard));
  if (!find("table")) { const { x, y } = yardFurnishing("table", yard); newStack([newCard("table")], x, y, "world"); }
  if (!barn) return;
  const bin = find("granary");
  if (bin) put(bin, barnFurnishing("granary", barn));                 // the bin stands against the back wall
  const heap = homePile(), moving = [];
  for (const q of boards.world.filter((x) => x !== heap && !x.store && inYard(center(x)) && x.cards.every((c) => c.key === "grain"))) { moving.push(...q.cards); removeStack(q); }   // the yard's old sack of grain
  if (heap) { const m = heap.cards.filter((c) => barnThing(c.key)); heap.cards = heap.cards.filter((c) => !m.includes(c)); moving.push(...m); if (!heap.cards.length) removeStack(heap); }
  if (moving.length) storeHome(moving);
  for (const q of boards.world) {                                    // nothing left standing where the walls go up
    if (q === bin || q.store === "barn" || q.critter || q.npc || q.pet || q.cards[0].key === "you") continue;
    if (q.x < barn.x + barn.w && q.x + q.w > barn.x && q.y < barn.y + barn.h && q.y + q.h > barn.y) { q.x = barn.x + barn.w + 40; q.y = barn.y + 40; }
  }
}
// ---------------------------------------------------------------------------
// Boats (sailing.js): built on the shore, launched onto the nearest water. Step aboard from the bank; then a tap on the
// water rows you there, a tap on land rows you to the bank and puts you ashore. The open sea only in fair weather.
// ---------------------------------------------------------------------------
function launch(st) {
  const i = nearestWater(MAP, MAP.idx(center(st).x, center(st).y), 8);
  if (i < 0) return;
  st.x = MAP.X(i) - st.w / 2; st.y = MAP.Y(i) - st.h / 2;
  float("小船下了水", center(st), "world");
}
function boardBoat(boat) {
  const you = youStack();
  if (!you || you.board !== "world" || me.aboard) return;
  if (!afloat(MAP, MAP.idx(center(boat).x, center(boat).y))) { toast("小船搁浅了，先把它拖到水上"); return; }
  if (dist(center(you), center(boat)) > 700) {   // a boat moored a few paces out is still "at the bank"
    const at = center(boat);
    let land = null;
    for (let r = 40; r <= 900 && !land; r += 40) for (let a = 0; a < 24 && !land; a++) {
      const x = at.x + Math.cos(a / 24 * 6.283) * r, y = at.y + Math.sin(a / 24 * 6.283) * r;
      if (x > 0 && y > 0 && x < MAP.W && y < MAP.H && walkable(MAP, x, y)) land = { x, y };
    }
    me.wantBoat = land ? boat.id : null;
    if (land && walkTo(you, land)) toast("先走到船边上，到了自己上去");
    return;
  }
  me.wantBoat = null; me.hunt = null; stopAuto();
  me.aboard = boat.id; cancelJob(you); you.walk = null; you.travel = null;
  you.x = boat.x + (boat.w - CARD_W) / 2; you.y = boat.y + 30;
  toast("上了船。点水面划过去，点岸边靠岸上去");
}
/** A boat dragged over the ground: set it down where it is; on water, snap it to the nearest open water. */
function placeBoat(lift) {
  const c = lift.cards[0], at = center(lift);
  const wet = (x, y) => !walkable(MAP, x, y) && MAP.cls[MAP.idx(x, y)] !== G.ROCK && MAP.cls[MAP.idx(x, y)] !== G.SNOW;
  if (wet(at.x, at.y)) { const q = settle(at.x, at.y, true, c.w, c.h); lift.x = q.x - c.w / 2; lift.y = q.y - c.h / 2; return true; }
  float("小船搁浅了，拖到水上才能划", at, "world");
  return false;
}
function rowTo(you, p, target = null, intent = null) {
  const route = waterRoute(MAP, center(you), p, 25);                  // somewhere inland: row to the nearest bank, walk the rest
  if (!route) { toast("船过不去那儿"); return false; }
  const goal = target ? center(target) : p, toLand = !afloat(MAP, MAP.idx(goal.x, goal.y));
  if ((weather.now === "雨" || weather.now === "雪") && touchesSea(MAP, route) && !toLand) { toast("天不好，海上风浪大，等晴了再出海"); return false; }   // you can always row back to land
  cancelJob(you); you.travel = null;
  you.walk = { x: route.at(-1).x - CARD_W / 2, y: route.at(-1).y - CARD_H / 2, path: route.slice(0, -1), k: 0, target, intent, plotted: true, sail: true };
  return true;
}
/** The boat goes where you go while you're on the water; step onto land and it stays at the bank. */
function sailTick(minutes, you) {
  if (!me.aboard) return;
  const boat = boards.world.find((q) => q.id === me.aboard);
  if (!boat || !you || you.board !== "world") { me.aboard = null; return; }
  const here = center(you);
  if (afloat(MAP, MAP.idx(here.x, here.y))) {
    if (you.walk) me.rest = Math.max(0, me.rest - minutes * 0.02);   // rowing is work
    boat.x = you.x + (CARD_W - boat.w) / 2; boat.y = you.y - 30;
    if (MAP.water[MAP.idx(here.x, here.y)] === 3 && !village.sawSea) { village.sawSea = true; chronicle("你第一次划着小船出了海。"); }
  } else if (!you.walk) { me.aboard = null; toast("上了岸"); }
}
// ---------------------------------------------------------------------------
// Fighting back (fight.js). Hit by a boar or a bear, set on by a raider: you don't just stand there. Whether you stand
// and fight, hold it off with a torch, or get away depends on your nerve and strength, what's in your hand, and how
// hurt you are already — the same for the villagers, each after their own nature.
// ---------------------------------------------------------------------------
/** Nerve: who stands their ground. The young farmer and the stone-knapper will; the old cook won't. */
const COURAGE = { san: 0.7, li: 0.85, gu: 0.55, wei: 0.35, aunt: 0.25 };
const threatOf = (st) => THREAT[st.critter?.kind ?? (st.guard || st.raid ? "coastRaider" : "")] ?? 0.6;
const stateOf = (st) => st.critter ?? st.guard ?? st.raid;
/** You, set on: strike back with the best you have in reach, step in if it's out of reach; run if it's too much. */
function defendTick(you) {
  const f = me.fight;
  if (!f || !you) return;
  const foe = boards.world.find((q) => q.id === f.id);
  if (!foe || clock.min > f.until || you.board !== "world" || dist(center(foe), center(you)) > 480 || drag?.st === you || you.lifted) { me.fight = null; return; }
  const weapon = bestWeapon((k) => holds(you, k));
  const mode = stance({ courage: 0.75, strength: strengthAt(myAge()), weapon, torch: Boolean(foe.critter) && holds(you, "torch"), threat: threatOf(foe), hurt: 1 - me.rest / 100 });   // fire scares beasts, not men
  const a = center(you), b = center(foe);
  if (mode === "flee") {
    me.fight = null;
    const home = MAP.house ? { x: MAP.house.gate.x + MAP.house.gate.w / 2, y: MAP.house.y + MAP.house.h + 80 } : null, d = dist(a, b) || 1;
    const away = { x: a.x + ((a.x - b.x) / d) * 420, y: a.y + ((a.y - b.y) / d) * 420 };
    if (!walkTo(you, walkable(MAP, away.x, away.y) ? away : home ?? away, null, null, true)) return;
    toast(me.rest < 30 ? "撑不住了，先跑！" : `打不过${DEFS[foe.cards[0].key].name}，先跑！`);
    return;
  }
  if (clock.min < (me.attackReadyAt ?? 0) || you.job) return;
  const options = combatOptions(you, foe).filter((o) => (mode === "ward" ? o.id === "ward" : o.id !== "ward") && me.rest >= o.cost);
  const strike = options.filter((o) => dist(a, b) <= o.range).sort((x, y) => y.damage - x.damage)[0];
  if (strike) return attackRabbit(foe.cards[0], strike.id);
  if (!you.walk && options.length) { you.walk = { x: b.x - CARD_W / 2, y: b.y - CARD_H / 2 + 60, path: [], k: 0 }; }   // step in
}
/** A villager hit by a beast: knocked back, hurt; badly hurt, they go home and lie up. */
function hurtNpc(st, by, amount) {
  const n = st.npc;
  n.hurt = Math.min(1, (n.hurt ?? 0) + amount);
  const a = Math.atan2(center(st).y - center(by).y, center(st).x - center(by).x), p = { x: center(st).x + Math.cos(a) * 150, y: center(st).y + Math.sin(a) * 150 };
  const got = reachAlong(MAP, center(st), p); st.x = got.x - CARD_W / 2; st.y = got.y - CARD_H / 2;
  cancelJob(st); st.walk = null;
  if (by.critter) { by.critter.calm = clock.min + 10; by.critter.warned = clock.min; }
  if (known(center(st))) float(`${nameOf(st)}被${DEFS[by.cards[0].key].name}撞倒了`, center(st), "world");
  n.mood = Math.max(0, (n.mood ?? 6) - 1);
  if (n.hurt >= 0.6) { n.sickUntil = Math.max(n.sickUntil ?? 0, clock.min + 900); chronicle(`${nameOf(st)}叫${DEFS[by.cards[0].key].name}伤得不轻，回家躺着去了。`); }
  if (by.critter?.predator) { n.fight = null; scare(st, 480); fleeFrom(st, by); return; }   // nobody stands up to a tiger: they run
  if (!n.fight) n.fight = { id: by.id, mode: null, next: clock.min };   // and now they must decide
}
const FIGHT_LINES = { fight: ["“来啊！”", "“别怕，打它！”", "“看我的！”"], flee: ["“快跑！”", "“惹不起，快走！”", "“救命啊！”"], ward: ["“别过来！”（举起火把）"] };
/** Frightened of the tiger for a while; anyone near enough to see it happen is too. */
function scare(st, minutes) {
  for (const q of [st, ...npcs().filter((o) => o !== st && !o.npc.inside && dist(center(o), center(st)) < 600)]) q.npc.afraid = { until: Math.max(q.npc.afraid?.until ?? 0, clock.min + minutes) };
}
/** Still afraid, and with reason: the tiger is near them, or near home. */
function tigerAbout(st, tiger) {
  const n = st.npc;
  if (!n.afraid || clock.min > n.afraid.until || !tiger) { n.afraid = null; return false; }
  const home = MAP.house ? { x: MAP.house.x + MAP.house.w / 2, y: MAP.house.y + MAP.house.h / 2 } : center(st);
  if (dist(center(tiger), center(st)) > 1400 && dist(center(tiger), home) > 1600) { n.afraid = null; return false; }
  return true;
}
/** Running from the tiger: first straight away from it, as fast as they can, then home by a way that keeps off it. */
function fleeFrom(st, danger) {
  const here = center(st), from = center(danger), a = Math.atan2(here.y - from.y, here.x - from.x);
  cancelJob(st); endMuse(st);
  for (const turn of [0, 0.5, -0.5, 1, -1]) {
    const p = { x: here.x + Math.cos(a + turn) * 380, y: here.y + Math.sin(a + turn) * 380 };
    if (!walkable(MAP, p.x, p.y) || reachAlong(MAP, here, p).blocked) continue;
    st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, flee: true }; st.task = ""; st.goal = "";
    return;
  }
  runHome(st, danger);
}
/** Home, by a way that keeps well clear of the tiger. */
function runHome(st, danger) {
  const home = find(st.npc.home, "world");
  const path = home && findPath(MAP, center(st), center(home), danger ? { avoid: { ...center(danger), r: 520 } } : {});
  if (!path) { go(st, st.npc.home, "hide"); if (st.walk) st.walk.flee = true; return; }
  st.goalStack = home; st.goal = home.cards[0].key; st.task = "hide"; st.parkedAt = null;
  st.walk = { target: home, path: path.slice(0, -1), k: 0, flee: true };
}
/** A boar or bear has come at them (or they're already at it): stand and fight, hold it off with fire, or run. */
function fightTurn(st) {
  const n = st.npc, here = center(st);
  let foe = n.fight && boards.world.find((q) => q.id === n.fight.id);
  if (!foe) foe = boards.world.find((q) => q.critter?.aggro && !(q.critter.kind === "bear" && season() === "冬") && ((q.walk?.charge && q.walk.target === st) || (q.critter.warnedAt === st.id && clock.min - (q.critter.warned ?? -99) < 8)));
  if (!foe || dist(center(foe), here) > 600) { n.fight = null; return false; }
  if (!n.fight?.mode) {
    const allies = npcs().filter((q) => q !== st && q.npc.fight?.id === foe.id && q.npc.fight.mode === "fight").length;
    const mode = isKid(st) ? "flee" : stance({ courage: COURAGE[n.key] ?? 0.5, strength: strengthAt(npcAge(n)), weapon: bestWeapon((k) => holds(st, k)), torch: Boolean(foe.critter) && holds(st, "torch"), threat: threatOf(foe), hurt: n.hurt ?? 0, allies });
    n.fight = { id: foe.id, mode, next: clock.min };
    cancelJob(st); endMuse(st); n.wait = 0; st.plans = st.plans ?? [];
    tell(st, pickLine(FIGHT_LINES[mode]), { r: 700, reply: false });
    if (mode === "flee") { go(st, n.home, "hide"); return true; }
  }
  const m = n.fight;
  if (m.mode === "flee") { if (!st.walk && !st.job) { n.fight = null; return false; } return true; }
  if (m.mode === "ward") {
    const s = stateOf(foe); if (s) s.calm = clock.min + 120;
    const a = Math.atan2(center(foe).y - here.y, center(foe).x - here.x);
    if (foe.critter) critterGo(foe, { x: center(foe).x + Math.cos(a) * 280, y: center(foe).y + Math.sin(a) * 280 });
    if (known(here)) float(`${nameOf(st)}举着火把，把${DEFS[foe.cards[0].key].name}逼退了`, here, "world");
    n.fight = null; return true;
  }
  if ((n.hurt ?? 0) >= 0.6) { m.mode = "flee"; tell(st, "“顶不住了！”", { r: 700, reply: false }); go(st, n.home, "hide"); return true; }
  const weapon = bestWeapon((k) => holds(st, k)), w = WEAPONS[weapon], d = dist(center(foe), here);
  if (foe.walk?.evading && d > w.reach * 1.5) { n.fight = null; tell(st, "“跑了……算它命大。”"); return false; }   // it's running off: let it go
  if (d > w.reach) { st.walk = { x: center(foe).x - CARD_W / 2 + 40, y: center(foe).y - CARD_H / 2 + 40, fight: true }; return true; }
  st.walk = null;
  if (clock.min < m.next) return true;
  m.next = clock.min + 8;
  const s = stateOf(foe), kind = foe.cards[0].key;
  s.hp = Math.max(0, (s.hp ?? WILD_HP[kind]) - w.damage);
  if (weapon !== "fist") wearNpc(st, weapon);
  if (known(here)) float(`${nameOf(st)}${w.verb}`, center(foe), "world");
  if (s.hp > 0) return true;
  n.fight = null;
  if (foe.guard || foe.raid) { routRaider(foe, nameOf(st)); return true; }
  removeWildAnimal(foe);
  for (const k of LOOT[kind]) addCard(st, k);
  n.mood = Math.min(10, (n.mood ?? 6) + 1);
  chronicle(`${nameOf(st)}${weapon === "fist" ? "赤手空拳" : `拿${DEFS[weapon].name}`}打死了一头${DEFS[kind].name}。`);
  return true;
}
// ---- The mine: dug further in, a little at a time; now and then the pick opens on a vein ----
/** Picks at the face for each length of tunnel driven further in — and more the deeper it goes. */
const MINE_STEP = 150, MINE_WORK = 8;
const mineState = () => (village.mine ??= { dug: 0, work: 0, carved: [] });
/** Hollow out the rock along a passage from a to b (a capsule r wide): cave floor, walkable, under the mountain's cover. */
function carve(a, b, r = 70) {
  const x0 = Math.min(a.x, b.x) - r, x1 = Math.max(a.x, b.x) + r, y0 = Math.min(a.y, b.y) - r, y1 = Math.max(a.y, b.y) + r;
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y += CELL) for (let x = x0; x <= x1; x += CELL) {
    const i = MAP.idx(x, y), cx = MAP.X(i), cy = MAP.Y(i), t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / len2));
    if (Math.hypot(a.x + dx * t - cx, a.y + dy * t - cy) > r || MAP.zoneAt(cx, cy) !== "mountain") continue;
    MAP.cls[i] = G.CAVE; MAP.cave[i] = 1; if (MAP.elev) MAP.elev[i] = 0.5;
  }
  const t = MAP.tunnel;                                              // the cover over the workings grows with them
  if (t) {
    const nx0 = Math.min(t.x, x0 - 60), ny0 = Math.min(t.y, y0 - 60), nx1 = Math.max(t.x + t.w, x1 + 60), ny1 = Math.max(t.y + t.h, y1 + 60);
    Object.assign(t, { x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 });
    if (t.el) { Object.assign(t.el.style, { left: `${t.x}px`, top: `${t.y}px`, width: `${t.w}px`, height: `${t.h}px` }); }
  }
}
/** An older save's tunnel, and every length dug since: carved again on the regenerated mountain. */
function applyMine() {
  for (const [ax, ay, bx, by, r] of mineState().carved) carve({ x: ax, y: ay }, { x: bx, y: by }, r ?? 70);
}
/** Work at the face: enough of it and the tunnel goes a length further in, the face moving with it; sometimes it
 *  breaks into a vein — copper, or flint. Near the far side of the mountain it can go no further. */
function digDeeper(face) {
  const m = mineState();
  m.work = (m.work ?? 0) + 1;
  if (m.work < MINE_WORK + (m.dug ?? 0)) return;
  const from = center(face);
  let to = null;
  for (const turn of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9]) {
    const a = turn + (randomWorld() - 0.5) * 0.4, p = { x: from.x + Math.cos(a) * MINE_STEP, y: from.y + Math.sin(a) * MINE_STEP };
    const edge = MAP.tiles.mountain, inside = edge && p.x < edge.x + edge.w - 220 && p.y > edge.y + 180 && p.y < edge.y + edge.h - 180;
    if (inside && MAP.zoneAt(p.x, p.y) === "mountain") { to = p; break; }
  }
  if (!to) { if (known(from) && !m.end) { m.end = true; float("再往里就是山那边了，挖到头了", from, "world"); } m.work = 0; return; }
  m.work = 0; m.dug = (m.dug ?? 0) + 1;
  carve(from, to, 110); m.carved.push([Math.round(from.x), Math.round(from.y), Math.round(to.x), Math.round(to.y), 110]);
  face.x += to.x - from.x; face.y += to.y - from.y;                  // the face is where the rock is now
  const roll = randomWorld();
  const vein = roll < 0.18 ? "copperRock" : roll < 0.3 ? "flintVein" : null;
  if (vein) {                                                        // a side pocket, and the vein in it
    const side = randomWorld() < 0.5 ? 1 : -1, a = Math.atan2(to.y - from.y, to.x - from.x) + side * Math.PI / 2;
    const p = { x: to.x + Math.cos(a) * 130, y: to.y + Math.sin(a) * 130 };
    carve(to, p, 100); m.carved.push([Math.round(to.x), Math.round(to.y), Math.round(p.x), Math.round(p.y), 100]);
    placeCard(vein, p);
    chronicle(vein === "copperRock" ? `矿道又往里挖了一截，挖出一处铜矿。` : `矿道又往里挖了一截，碰上一道燧石脉。`);
    if (known(to)) float(vein === "copperRock" ? "挖出铜矿了！" : "碰上一道燧石脉", p, "world");
  } else if (known(to)) float("矿道又往里深了一截", to, "world");
  MAP._base = {}; pathCache.clear();
  paintSeason();
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
  rabbit: { n: 6, roam: 600, fear: 300, home: () => quietSpot() },
  deer: { n: 8, fear: 380, home: () => woodSpot(0.8) },
  fox: { n: 2, fear: 340, home: () => woodSpot(0.7) },
  wolf: { n: 3, fear: 280, hunger: 4, home: () => { const pack = boards.world.find((q) => q.critter?.kind === "wolf"); return pack ? center(pack) : deepSpot("wolf"); } },
  pheasant: { n: 8, fear: 260, home: () => woodSpot(0.4) },
  bear: { n: 1, fear: 0, aggro: true, home: () => deepSpot("bear") },
  tiger: { n: 1, roam: 520, fear: 0, predator: true, home: () => deepSpot("tiger") },
  boar: { n: 4, fear: 0, aggro: true, home: () => boarSpot() },
  duck: { n: 3, roam: 420, fear: 220, water: true, home: () => lakeSpot() },
  goat: { n: 5, fear: 420, home: () => plateauSpot() },
};
const WILD_HP = { rabbit: 1, duck: 2, pheasant: 1, fox: 2, wolf: 4, deer: 3, goat: 3, boar: 5, bear: 7, tiger: 8, coastRaider: 5 };
const LOOT = { rabbit: ["meat", "hide"], duck: ["meat"], pheasant: ["meat"], fox: ["hide"], wolf: ["meat", "hide"], deer: ["meat", "meat", "hide"], boar: ["meat", "meat", "meat", "hide"], goat: ["meat", "meat", "hide"], bear: ["meat", "meat", "meat", "pelt"], tiger: ["meat", "pelt"] };
const inJungle = (p) => MAP.jungle[MAP.idx(p.x, p.y)] === 1;
const inLake = (p) => p.x > 0 && p.y > 0 && p.x < MAP.W && p.y < MAP.H && MAP.water[MAP.idx(p.x, p.y)] === 1;
function nearSite(keys, r) {
  const s = MAP.sites[pick(keys)];
  for (let k = 0; k < 40; k++) { const a = randomWorld() * 6.28, p = { x: s.x + Math.cos(a) * r * (0.7 + randomWorld() * 0.6), y: s.y + Math.sin(a) * r * (0.7 + randomWorld() * 0.6) }; if (walkable(MAP, p.x, p.y)) return p; }
  return { x: s.x, y: s.y + 200 };
}
/** The forest and the deep wood behind it are one country to the animals; only people tell them apart. */
const wooded = (p) => { const z = MAP.zoneAt(p.x, p.y); return z === "forest" || Boolean(z?.startsWith("deep")); };
/** Which country a point is in, for an animal: the deep wood's tiles count as one. */
const countryAt = (p) => { const z = MAP.zoneAt(p.x, p.y); return z?.startsWith("deep") ? "deep" : z; };
const lairOf = (kind) => boards.world.find((q) => q.critter?.kind === kind)?.critter.home ?? null;
/** A spot in the thick of the woods, forest or deep wood alike: deer and boar live where the canopy closes over,
 *  several trees in from the edge — but not right by the tiger's lair. near/reach: within this far of a point (an
 *  animal moving on); otherwise the forest nearer home is likelier. No fence — the ground decides how far in. */
function woodSpot(min = 0.8, near = null, reach = Infinity, outer = 0) {
  const lair = lairOf("tiger");
  let best = null, bs = -Infinity;
  for (let k = 0; k < 900; k++) {
    const i = Math.floor(randomWorld() * MAP.cls.length);
    if (MAP.cls[i] !== G.FOREST || MAP.road[i]) continue;
    const p = { x: MAP.X(i), y: MAP.Y(i) }, thick = woodDepth(MAP, p.x, p.y);
    if (thick < min || !wooded(p) || (near && dist(p, near) > reach) || (lair && dist(p, lair) < 1200)) continue;
    if (boards.world.some((st) => dist(p, center(st)) < 260)) continue;
    const s = Math.min(thick, 0.9) - (near ? 0 : dist(p, MAP.sites.home) / 5000) + (MAP.zoneAt(p.x, p.y) === "forest" ? outer : 0) + randomWorld() * 1.2;
    if (s > bs) { bs = s; best = p; }
  }
  const f = MAP.tiles.forest;
  return best ?? { x: f.x + f.w / 2, y: f.y + f.h / 2 };
}
/** An old boar's patch: thick wood, well away from where the deer keep and from the tiger. */
function boarSpot() {
  const deer = boards.world.filter((q) => q.critter?.kind === "deer").map((q) => q.critter.home), tiger = lairOf("tiger");
  let best = null, bs = -Infinity;
  for (let k = 0; k < 10; k++) {
    const p = deepSpot("boar"), fromTiger = tiger ? Math.min(2600, dist(p, tiger)) : 2600;
    const s = Math.min(2000, ...deer.map((h) => dist(p, h))) + fromTiger * 0.8 + randomWorld() * 80;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
/** A lair in the deep wood, where the canopy never opens: the tiger's a fair way in, within a night's prowl of the
 *  forest where the deer are; the bear's further off, a long way from the tiger's (the two keep out of each other's way). */
function deepSpot(kind = "tiger") {
  const other = lairOf(kind === "bear" ? "tiger" : "bear");
  let best = null, bs = -Infinity;
  for (let k = 0; k < 900; k++) {
    const i = Math.floor(randomWorld() * MAP.cls.length);
    if (!MAP.jungle[i] || MAP.cls[i] !== G.FOREST) continue;
    const p = { x: MAP.X(i), y: MAP.Y(i) };
    if (other && dist(p, other) < 2400) continue;
    const far = dist(p, MAP.sites.home), s = woodDepth(MAP, p.x, p.y) * 2 + (kind === "bear" ? far / 4000 : -Math.abs(far - 4000) / 2000) + randomWorld() * 0.3;
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
  } else {
    const grown = LIFE[kind]?.adult ?? 4, others = boards.world.filter((q) => q !== st && q.critter?.kind === kind);
    const sexNow = others.some((q) => q.critter.sex === "female") && !others.some((q) => q.critter.sex === "male") ? "male" : others.length && !others.some((q) => q.critter.sex === "female") ? "female" : randomWild() < 0.5 ? "female" : "male";
    Object.assign(st.critter, { sex: sexNow, bornDay: near ? day() : day() - grown - Math.floor(randomWild() * grown * 2) });
  }
  return st;
}

const livingDucks = () => boards.world.filter((st) => st.critter?.kind === "duck");
const wildAge = (st) => day() - (st.critter.bornDay ?? -999);
/** A young one is called a young one: 小鹿, 小野猪… */
function labelYoung(st) {
  const k = st.critter.kind, card = st.cards[0], name = isYoung(k, wildAge(st)) ? LIFE[k]?.young ?? DEFS[k].name : DEFS[k].name;
  if (card.name === name) return;
  card.name = name; card.el.querySelector(".card-head span").textContent = name;
}
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
  if (deepSleeping(st)) { st.walk = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return; }
  if (isActive("duck", hour())) wakePose(st);
  const bird = st.critter, here = center(st), swimming = inLake(here);
  const player = you?.board === "world" ? center(you) : null;
  const scared = player && dist(player, here) < bird.fear;
  const waterOpen = !MAP.frozen && season() !== "冬";
  const lead = groupLeader("duck"), leading = !lead || lead === st;
  if (st.walk && !waterOpen && !swimming && st.walk.duckCross === "water") st.walk = null;
  if (scared && !st.walk?.evading) return duckFlee(st, player, waterOpen);
  if (st.walk && stepWalk(st, minutes, st.walk.pace ?? paceOf("duck", swimming ? "swim" : "shore"))) { st.walk = null; if (leading) duckArrive(st); }
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
      if (inLake(p) && lakeLine(here, p)) { doing.dir = dir; walk(p, paceOf("duck", "dabble")); bird.nextMove = clock.min; return; }
    }
    doing.until = clock.min;                                        // a dead end of the bank: do something else
    return;
  }
  if (doing.act === "cross") {                                      // across open water to another stretch of shore
    const i = nearestShore(here), n = shore.length;
    for (let tries = 0; tries < 10; tries++) {
      const k = (i + Math.round(n / 3 + randomWild() * n / 3)) % n, p = offshore(shore[k].wet, 90);
      if (inLake(p) && lakeLine(here, p)) { walk(p, paceOf("duck", "swim")); doing.until = clock.min + 999; doing.crossing = true; return; }
    }
    doing.until = clock.min;
    return;
  }
  if (doing.act === "graze") {                                      // up on the bank, a few steps at a time, pecking between
    doing.patch ??= here;
    for (let k = 0; k < 8; k++) {
      const a = randomWild() * 6.28, p = { x: doing.patch.x + Math.cos(a) * (40 + randomWild() * 110), y: doing.patch.y + Math.sin(a) * (40 + randomWild() * 110) };
      if (!inLake(p) && walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked) { walk(p, paceOf("duck", "graze")); break; }
    }
    bird.nextMove = clock.min + 3 + randomWild() * 4;
    return;
  }
  // preen, loaf, roost: mostly still; on the water they drift a little
  if (swimming && randomWild() < 0.5) {
    const a = randomWild() * 6.28, p = { x: here.x + Math.cos(a) * 25, y: here.y + Math.sin(a) * 25 };
    if (inLake(p) && lakeLine(here, p) && roomy(st, p)) walk(p, paceOf("duck", "drift"));
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
  const here = center(st), set = (p, path, duckCross) => { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, path, k: 0, duckCross, pace: paceOf("duck", "shore") }; };
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
  if (!inLake(here)) { if (waterOpen) { duckCrossEdge(st, false); if (st.walk) { st.walk.pace = paceOf("duck", "run"); st.walk.evading = true; } } return; }
  const angle = Math.atan2(here.y - from.y, here.x - from.x);
  for (let i = 0; i < 12; i++) {
    const a = angle + (i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 0.4, p = { x: here.x + Math.cos(a) * 260, y: here.y + Math.sin(a) * 260 };
    if (inLake(p) && lakeLine(here, p)) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, path: [], k: 0, pace: paceOf("duck", "run"), evading: true }; break; }
  }
  if (bird.doing) bird.doing.until = clock.min + 30;                // after a fright, a while before they settle to anything
}
/** Towards a point on the water by way of the bank's bends: straight if it can, else to the reachable point off the
 *  shore that's nearest the goal. */
function waterStep(here, goal) {
  if (inLake(goal) && lakeLine(here, goal)) return goal;
  let best = here, bd = dist(here, goal) - 40;
  for (const { wet } of duckShore()) { const p = offshore(wet, 90); if (inLake(p) && lakeLine(here, p) && dist(p, goal) < bd) { best = p; bd = dist(p, goal); } }
  return best;
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
/** The ☰ menu: the books, sound and help. While you're choosing where to lay a foundation it is ✕, to stop. */
$("menuBtn").onclick = () => {
  if (placing) return endPlacing("不打地基了");
  const m = $("menu"); m.hidden = !m.hidden; $("menuBtn").setAttribute("aria-expanded", String(!m.hidden));
};
$("menu").addEventListener("click", (e) => { if (e.target.closest("button") && !e.target.closest("#zoomIn, #zoomOut")) { $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); } });
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
const workPace = () => (hungry() ? 1.4 : 1) * (tired() ? 1.4 : 1) * (isSick() ? 1.5 : 1) * (myAge() >= 60 ? 1.2 : 1) * (weather.now === "雨" && !inRoom(youAt() ?? { x: 0, y: 0 }) ? 1.1 : 1);
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
  float(me.food >= 100 ? "吃饱了" : food >= 30 ? "吃了一顿" : "垫了垫肚子", where, board);
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
  const range = dragRange(groups, slot, { person: isPerson(st), allCarry: st.cards.every((c) => CARRY.has(DEFS[c.key].type)), total: st.cards.length });
  if (card.key === "you" && me.playing) play(null);                  // your own card: you again
  const mine = st === actor();
  if (card.key === "boat" && me.aboard === st.id) { toast("先靠岸下船，再把船拖走"); return; }
  const kind = mine && i === 0 ? "move" : i === 0 && st.ctl?.mode === "manual" ? "steer" : (CARRY.has(DEFS[card.key].type) || MOVABLE.has(card.key)) && (!st.npc || mine) ? "item" : "none";
  const p = toWorld(e.clientX, e.clientY);
  drag = { kind, card, st, i: range.start, end: range.end, slot: range.whole ? 0 : slot, sx: e.clientX, sy: e.clientY, ox: p.x - st.x, oy: p.y - st.y - rowOf(st, slot) * peekOf(st), moved: false };
});
/** The places in the bottom bar: drag what's in one out onto the board (or onto yourself, to take it in hand), or tap it to look. */
$("inv").addEventListener("pointerdown", (e) => {
  const sp = e.target.closest("[data-card]");
  if (!sp || !e.isPrimary || e.button !== 0) return;
  const you = actor(), card = cardById(sp.dataset.card);
  if (!you || !card?.at) return;
  const start = you.cards.findIndex((c) => c.at === card.at), end = you.cards.findLastIndex((c) => c.at === card.at) + 1;
  if (start < 0) return;
  e.preventDefault(); hideDetail();
  try { table.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in checks */ }
  drag = { kind: CARRY.has(DEFS[card.key].type) ? "item" : "none", card: you.cards[start], st: you, i: start, end, slot: 0, sx: e.clientX, sy: e.clientY, ox: CARD_W / 2, oy: CARD_H / 2, moved: false };
});
/** The place in the bottom bar under a point, if any. */
const invSlotAt = (x, y) => document.elementFromPoint(x, y)?.closest?.("#inv [data-slot]") ?? null;
/** Dropped on a place in the bottom bar: wear it, hold it or put it away there — or wherever it fits; else in your hands. */
function putAway(cards, slot) {
  const you = actor();
  for (const c of cards) {
    delete c.at;
    you.cards.push(c);
    if (EQUIP.includes(slot) && wearable(c, slot)) { for (const o of you.cards) if (o !== c && o.at === slot) delete o.at; c.at = slot; }
    else { const to = slotFor(you, c, slot) ?? slotFor(you, c); if (to) c.at = to; }
  }
}
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
  if (drag.kind === "move" && me.aboard && isYou(drag.st)) { drag.kind = "none"; toast("在船上：点水面划过去，点岸边靠岸"); return; }
  if (drag.kind === "move") { if (!drag.from) sfx("pick"); moveYou(p); return; }
  if (drag.kind === "steer") { steerMove(p); return; }
  if (drag.kind === "item") {
    if (!drag.lift) {
      sfx("pick");
      const row = rowOf(drag.st, drag.slot), taken = drag.st.cards.splice(drag.i, drag.end - drag.i);
      taken.forEach((c) => delete c.at);
      if (!drag.st.cards.length) removeStack(drag.st);
      drag.lift = newStack(taken, drag.st.x, drag.st.y + row * peekOf(drag.st), drag.st.board);
      drag.lift.lifted = true;
    }
    drag.lift.x = p.x - drag.ox; drag.lift.y = p.y - drag.oy;
    drag.target = targetAt(p, drag.lift);
    markTarget(drag.target);
    layPreview(drag.target ? null : drag.lift, p);
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
      if (me.auto) stopAuto();                                         // a manual step ends auto
      const who = actor();
      if (me.playing && who && who !== youStack()) { const you = youStack(); if (you) you.walk = null; }   // the protagonist stops when you walk someone else
      cam.follow = false;
      walkTo(who, point);
      select(false);
      return;
    }
    return tap(d.card);
  }
  if (d.kind === "move") { if (d.from) dropYou(d); return; }
  if (d.kind === "steer") { if (d.from) steerDrop(d); return; }
  if (d.kind === "item" && d.lift) {
    d.lift.lifted = false;
    if (works.preview.length) setPreview([]);
    if (d.lift.cards[0]?.key === "boat") { placeBoat(d.lift); carryChanged(); return; }
    if (!d.target && layOnGround(d.lift, toWorld(e.clientX, e.clientY))) { carryChanged(); return; }
    const you = actor(), there = center(d.lift);
    const wasOnYou = d.st === you, near = (p) => board !== "world" || dist(p, center(you)) < moveRange() * 1.5;
    const bar = invSlotAt(e.clientX, e.clientY);
    if (bar && you && (wasOnYou || near(center(d.st)))) { const cards = d.lift.cards; removeStack(d.lift); putAway(cards, bar.dataset.slot); carryChanged(); return; }
    if (!near(there) || (!wasOnYou && !near(center(d.st)))) {
      toast("够不着，先走过去");
      if (boards[d.st.board].includes(d.st)) { d.st.cards.splice(d.i, 0, ...d.lift.cards); removeStack(d.lift); }
      else { d.lift.x = d.st.x; d.lift.y = d.st.y; }
      carryChanged();
      return;
    }
    if (d.target?.npc && PD(d.target)) { const cards = d.lift.cards; removeStack(d.lift); const rest = giveTo(d.target, cards); if (rest.length) youStack().cards.push(...rest); carryChanged(); return; }
    if (MOVABLE.has(oneKind(d.lift))) { carryChanged(); return; }        // furniture is set down where you put it, not stacked on things
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
    if (d.target?.cards[0].key === "compost") { const c = d.target.cards[0], ok = d.lift.cards.filter((x) => COMPOSTABLE.has(x.key)); if (ok.length) { c.heap = Math.min(12, (c.heap ?? 0) + ok.length); ok.forEach((x) => x.el.remove()); const rest = d.lift.cards.filter((x) => !ok.includes(x)); removeStack(d.lift); if (rest.length) youStack().cards.push(...rest); carryChanged(); return; } }
    if (d.target?.cards[0].key === "chest" && d.target.cards[0].items.length + d.lift.cards.length > CHEST_CAP) { toast("木柜塞满了"); youStack().cards.push(...d.lift.cards); removeStack(d.lift); carryChanged(); return; }
    if ((d.target?.cards[0].key === "barn" || d.target?.cards[0].key === "chest") && d.lift.cards.some((c) => KEEPS[c.key])) { toast("鱼、肉、果子这些关在箱子里会捂坏，留在外面"); youStack().cards.push(...d.lift.cards); removeStack(d.lift); carryChanged(); return; }
    if (d.target?.cards[0].key === "barn" || d.target?.cards[0].key === "chest") { const b = d.target.cards[0]; b.items.push(...d.lift.cards.map((c) => c.key)); d.lift.cards.forEach((c) => c.el.remove()); removeStack(d.lift); carryChanged(); return; }
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
    if (o.site) { candidates.push({ stack: o, x: o.x, y: o.y, w: o.w, h: o.h, z: Math.round(o.y) }); continue; }
    for (const [offset, { card }] of cardGroups(o).entries()) {
      if (card.el.matches(".hidden, .ghost, .no-card, .hidden-kit, .gone, .packed")) continue;
      const row = rowOf(o, offset);
      candidates.push({ stack: o, x: o.x, y: o.y + row * peekOf(o), w: card.w, h: card.h, z: Math.round(o.y) + row });
    }
  }
  return pickDropTarget(p, candidates, board === "world" ? cam.z : roomK)?.stack ?? null;
}
function markTarget(st) {
  document.querySelectorAll(".drop-ok").forEach((n) => n.classList.remove("drop-ok"));
  if (st) cardGroups(st).findLast(({ card }) => !stowed(st, card)).card.el.classList.add("drop-ok");
}
const blockedBy = (reason) => ({ wall: "墙挡住了去路", cliff: "岩壁太陡，上不去", water: "前面是深水", edge: "走不到那边" }[reason] ?? "这里没有路");
/** Dragging "you": the card follows the finger, but only as far as one stretch of walking, and not into water or up cliffs. */
function moveYou(p) {
  const you = drag.st;
  if (!drag.from) { if (me.auto && isYou(you)) stopAuto(); cancelJob(you); you.walk = null; you.travel = null; me.hunt = null; you.lifted = true; drag.from = { x: you.x, y: you.y }; select(false); }
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
  const over = targetAt(p, you);                                     // the pointer can be over water where the card cannot stand
  drag.target = over?.cards[0].key === "boat" && me.aboard !== over.id ? over : targetAt({ x: x + CARD_W / 2, y: y + CARD_H / 2 }, you);
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
  if (d.target?.cards[0].key === "boat" && isYou(you)) return boardBoat(d.target);
  if (d.target && isYou(you) && DEFS[d.target.cards[0].key]?.type === "animal" && combatOptions(you, d.target).length) {
    Object.assign(you, standOn(you, d.target));                          // dropped on it: strike now, don't stroll over while it bolts
    return huntTarget(d.target);
  }
  let t = d.target;
  if (t && board === "world") {
    const spot = standOn(you, t);
    const got = reachAlong(MAP, { x: you.x + CARD_W / 2, y: you.y + CARD_H / 2 }, { x: spot.x + CARD_W / 2, y: spot.y + CARD_H / 2 });
    if (got.blocked) { t = null; d.blocked = blockedBy(got.reason); }
  }
  if (!t && !d.blocked && board === "world" && you.cards.some((c) => c.key === "hammer")) t = wallToTakeDown(center(you));
  if (d.blocked && !t) float(d.blocked, center(d.st), d.st.board);
  if (t) Object.assign(you, standOn(you, t));
  if (board !== "world") { if (t) arrive(you, t); return; }
  // The card stays where you put it; the walk is paid in time and breath, not replayed step by step.
  const d0 = dist(d.from, you), stride = playerStride(moveRange(center(you)), MOVE_RANGE);
  if (isYou(you)) me.rest = Math.max(0, me.rest - walkEffort(d0, MAP.zoneAt(center(you).x, center(you).y) === "plateau"));
  if (isYou(you) && holds(you, "sandals")) {
    me.sandalDistance = (me.sandalDistance ?? 0) + d0;
    if (me.sandalDistance >= 700) { me.sandalDistance -= 700; wearTool(you, "sandals"); }
  }
  const mins = Math.round(d0 / stride);
  if (mins < 3) { if (t) arrive(you, t); return; }
  you.travel = { target: t, until: clock.min + mins };
}
function tap(card) {
  const st = stackOf(card);
  if (card.key === "you") { if (me.playing) return play(null); select(!selected); return; }
  if (st === actor()) { select(!selected); return; }
  if (card.key === "boat" && !me.aboard) return afloat(MAP, MAP.idx(center(st).x, center(st).y)) ? boardBoat(st) : showDetail(card);
  if (selected) { walkTo(actor(), center(st), st); select(false); return; }
  showDetail(card);
}
function select(on) { selected = on; youStack()?.cards[0].el.classList.toggle("sel", false); actor()?.cards[0].el.classList.toggle("sel", on); }

// ---------------------------------------------------------------------------
// Walking and doing
// ---------------------------------------------------------------------------
/** A tap plans the full route. Dragging remains a short, direct move. */
function walkTo(st, p, target = null, intent = null, automatic = false) {
  if (!st) return;
  if (st.cards[0].key === "you" && me.aboard && st.board === "world") return rowTo(st, target ? center(target) : p, target, intent);
  const from = { x: st.x + CARD_W / 2, y: st.y + CARD_H / 2 };
  const goal = target ? standOn(st, target) : { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  const end = { x: goal.x + CARD_W / 2, y: goal.y + CARD_H / 2 };
  if (st.board !== "world") {
    end.x = clampN(end.x, CARD_W / 2, 1060 - CARD_W / 2);
    end.y = clampN(end.y, CARD_H / 2, 700 - CARD_H / 2);
  }
  const path = st.board === "world" ? findPath(MAP, from, end) : [end];
  if (!path?.length) { if (!automatic) float("过不去", from, st.board); return false; }
  queuePlayerWalk(st, end, path.slice(0, -1), target, intent, automatic);
  return true;
}
function queuePlayerWalk(st, end, path, target, intent = null, automatic = false) {
  cancelJob(st);
  st.unloading = false;
  st.travel = null;
  st.walk = { x: end.x - CARD_W / 2, y: end.y - CARD_H / 2, path, k: 0, target, plotted: true, intent, automatic };
  if (!automatic) cam.follow = false;                // the view stays where you're looking: ◎ finds them again
}
/** Where a stack ends up on a card: you and the first villager stack squarely on it (its title still showing); more villagers fan out to the side. */
const SLOTS = [[0, 0], [34, 20], [-34, 20], [0, 40]];             // up to four villagers on one card, all still on it
function standOn(st, t) {
  const top = t.y + stackDrop(t), x = t.x + (t.w - CARD_W) / 2, y = top + t.h - CARD_H + PEEK;
  if (st.cards[0].key === "you" || !st.npc) return { x, y };
  let slot = st.parkedAt === t ? st.slot : -1;
  if (slot < 0) {
    const used = new Set(boards[t.board].filter((s) => s !== st && s.parkedAt === t).map((s) => s.slot));
    slot = [0, 1, 2, 3].find((i) => !used.has(i)) ?? 3;
  }
  const [dx, dy] = SLOTS[slot];
  return { x: x + dx, y: y + dy, slot };
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
    if (w.plotted && !w.sail && st.board === "world") {
      const got = reachAlong(MAP, { x: st.x + CARD_W / 2, y: st.y + CARD_H / 2 }, { x: next.x + CARD_W / 2, y: next.y + CARD_H / 2 });
      if (got.blocked) { st.walk = null; return false; }
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
/** One kind's animals — one herd of them, if a herd is named (ducks have one flock; deer, pheasants and goats keep in
 *  several small herds, each with its own ground). */
const groupMembers = (kind, herd) => boards.world.filter((q) => q.critter?.kind === kind && !q.lifted && (herd === undefined || q.critter.herd === herd));
function groupLeader(kind, herd) {
  const all = groupMembers(kind, herd), grown = kind === "duck" ? all.filter((q) => duckAge(q) >= 3) : all;
  return leaderOf((grown.length ? grown : all).map((q) => ({ id: q.id, born: q.critter.bornDay ?? 0, q })))?.q ?? null;
}
/** A duckling's mother: the one it hatched to, or failing her the nearest grown duck. */
function motherOf(st) {
  const here = center(st), grown = livingDucks().filter((q) => duckAge(q) >= 3);
  return grown.find((q) => q.id === st.critter.mother) ?? grown.filter((q) => q.critter.sex === "female").sort((a, b) => dist(here, center(a)) - dist(here, center(b)))[0]
    ?? grown.sort((a, b) => dist(here, center(a)) - dist(here, center(b)))[0] ?? null;
}
/** Where this one should be: ducklings (and any young) in a line behind their mother; the rest fanned out behind the leader. */
function groupPlace(st, lead) {
  const kind = st.critter.kind, sp = HABITS[kind]?.spacing ?? 120;
  if (kind !== "duck" && st.critter.mother === lead.id) {
    const brood = boards.world.filter((q) => q.critter?.mother === lead.id && isYoung(kind, wildAge(q))).sort((a, b) => a.id - b.id);
    const front = brood[brood.indexOf(st) - 1] ?? lead;
    return { front, at: fileSlot(center(front), headingOf(front), sp * 0.9) };
  }
  if (kind === "duck" && duckAge(st) < 3) {
    const mum = motherOf(st);
    if (!mum) return null;
    const brood = livingDucks().filter((q) => duckAge(q) < 3 && motherOf(q) === mum).sort((a, b) => a.id - b.id);
    const front = brood[brood.indexOf(st) - 1] ?? mum;
    return { front, at: fileSlot(center(front), headingOf(front), sp * 0.9) };          // close behind, each card still showing
  }
  const others = groupMembers(kind, lead.critter.herd).filter((q) => q !== lead && !(kind === "duck" ? duckAge(q) < 3 : q.critter.mother && isYoung(kind, wildAge(q)))).sort((a, b) => a.id - b.id);
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
  const c = st.critter, mum = c.kind !== "duck" && c.mother && isYoung(c.kind, wildAge(st)) ? boards.world.find((q) => q.id === c.mother) : null;
  const habit = { spacing: 120, ...HABITS[c.kind] };
  if (habit.group !== "flock" && !mum) return false;
  if (deepSleeping(st)) { st.walk = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return true; }
  if (isActive(c.kind, hour())) wakePose(st);                        // a follower that has woken loses its z z
  const lead = mum ?? groupLeader(c.kind, c.herd);
  if (!lead || lead === st) return false;
  const here = center(st), duck = c.kind === "duck";
  if (duck && inLake(here) !== inLake(center(lead))) return false;        // getting in or out of the water: its own way, after the others
  const place = groupPlace(st, lead);
  if (!place) return false;
  const fits = (p) => (duck ? (inLake(here) ? inLake(p) && lakeLine(here, p) : !inLake(p) && walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked)
    : walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked);
  let at = roomFor(st, place.at, place.front, habit.spacing, fits) ?? (duck && inLake(here) ? waterStep(here, place.at) : here);   // round a bend of the bank, or stay put
  // first, never sit on top of another: if one is too close (its card over this one's), step clear of it
  const crowd = groupMembers(c.kind).filter((q) => q !== st && Math.abs(center(q).x - here.x) < 96 && Math.abs(center(q).y - here.y) < 100);
  if (crowd.length) {
    let vx = 0, vy = 0;
    for (const q of crowd) { const dx = here.x - center(q).x, dy = here.y - center(q).y, d = Math.hypot(dx, dy) || 1; vx += dx / d; vy += dy / d; }
    if (!vx && !vy) vx = st.id % 2 ? 1 : -1;
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const a = Math.atan2(vy, vx) + turn, p = { x: here.x + Math.cos(a) * 120, y: here.y + Math.sin(a) * 120 };
      if (fits(p)) { at = p; break; }
    }
  }
  // one that sees you first startles the leader, and so the whole group
  const player = you?.board === "world" ? center(you) : null;
  if (player && dist(player, here) < (c.fear || 250) && clock.min - (lead.critter.alarm?.at ?? -99) > 5) { lead.critter.alarm = { at: clock.min, from: player }; lead.critter.nextMove = 0; }
  const gap = dist(here, at);
  if (dist(here, center(lead)) > 900) {                              // lost the others: make for the leader
    if (duck && inLake(here)) { const p = waterStep(here, center(lead)); st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; }
    else if (!st.walk) critterGo(st, center(lead));
  }
  else if (gap > 30 || (st.walk && gap > 18)) st.walk = { x: at.x - CARD_W / 2, y: at.y - CARD_H / 2 };   // settle near its place, without overriding every small step
  else { idleAnimal(st, minutes, isActive(c.kind, hour()), at, 26); return true; }   // settled: graze or doze about its place
  const fleeing = lead.walk?.evading || clock.min - (lead.critter.alarm?.at ?? -99) < 8;
  const own = paceOf(c.kind, duck && inLake(here) ? "swim" : "walk"), theirs = lead.walk?.pace ?? own;   // keep the leader's pace, faster only to catch up
  const pace = Math.min(paceOf(c.kind, "run"), fleeing ? paceOf(c.kind, "run") : (gap > habit.spacing * 1.5 ? own : Math.min(own, theirs * 1.15)) * catchUp(gap, habit.spacing));   // never faster than it can run
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
function arrive(st, target, intent = null, automatic = false) {
  const top = target.cards[0], def = DEFS[top.key], deny = (key, text) => { if (!automatic) sayHint(key, text); };
  if (st.unloading) { st.unloading = false; if (unload(st, target)) return; }
  const hammer = st.cards.some((c) => c.key === "hammer");
  if (hammer && !top.roof && (top.built || (top.key === "plot" && !loose(st).length && Object.values(top.need).some((v) => v > 0)))) return startDismantle(st, target);
  if (top.key === "plot") return workPlot(st, target, automatic);
  if (top.key === "boat" && isYou(st)) return boardBoat(target);
  if (def.type === "animal" && isYou(st) && combatOptions(st, target).length) return huntTarget(target);
  if (st.cards.some((c) => c.key === "bed")) st.cards.filter((c) => c.key === "bed").forEach((c) => layBed(st, c));
  if ((top.key === "barn" || top.key === "chest") && loose(st).length) return storeIn(target, st);
  if (top.key === "compost" && loose(st).some((c) => COMPOSTABLE.has(c.key))) return compostIn(target, st);
  const room = top.room ?? def.room;
  if (room) return enterRoom(room, st);
  if (top.key === "taoHouse") { float("从南边的门进屋", center(st), st.board); return; }
  if (top.key === "door") return leaveRoom(st);
  if (st.cards[0].key === "you" && (top.key === "cliffFoot" || top.key === "cliffTop")) return climb(st, top.key);
  if (st.cards[0].key === "you" && top.key === "lookout") return lookOut();
  if (st.cards[0].key === "you" && top.key === "blackReef") return strikeShip(st);
  const pool = [...st.cards.slice(1), ...target.cards];                 // your hands and the pile itself
  const can = RECIPES.filter((x) => {
    if (!invented(x)) return false;
    const station = x.needs[0] === top.key ? top : (craftRecipe(x) ? pool.find((c) => c.key === x.needs[0]) : null);
    if (!station || (x.when && !x.when(station))) return false;
    const left = [...pool];
    for (const k of x.needs.slice(1)) { const i = left.findIndex((c) => c.key === k); if (i < 0) return false; left.splice(i, 1); }
    return true;
  }).sort((a, b) => b.needs.length - a.needs.length);
  let r = (st.cards[0].key === "you" ? can.find((x) => !x.id || me.known[x.id]) : st.npc ? can.find((x) => !x.id || x.who?.includes(st.npc.key) || npcKnows(st, x.id)) : null) ?? can[0];   // what you (or they) know how to do comes first
  if (intent === "meal") r = can.find((recipe) => recipe.eat);
  if ((def.type === "person" || def.type === "animal") && !r) return talk(target, st);
  if (!r) return deny(`arrive-${target.id}`, HINT[top.key] ?? "这里没什么可做的");
  if (flooded(top.key)) return deny(`flood-${top.key}`, "水漫上来了，过两天水退了再来");
  if (r.take && top.stock <= 0) return deny(`take-${target.id}`, top.key === "berries" && season() === "冬" ? "冬天没有果子" : "这里已经取空了");
  if (r.eat) {
    if (isYou(st) ? me.food >= 95 : (st.npc?.hunger ?? 0) < 1) return deny("eat-full", "还饱着呢");
    if (mealCount() <= 0) return deny("pot-empty", "锅里空了，等做饭的煮好");
  }
  if (r.sleep) {
    if (!isYou(st)) return deny("npc-sleep", "到了时候他自己会去睡");
    if (hour() >= 19 || hour() < 6) return sleepTillDawn();
    if (me.rest >= 90) return deny("not-tired", "不累，歇不着");
    st.job = { r: { ...r, nap: true, make: [] }, target, left: 120, total: 120 };
    return;
  }
  if (r.kilnClay && top.stock < r.kilnClay) return deny("kiln-clay", "窑上的黏土不够两份——等阿埴背来，或自己带两份");
  if (isYou(st) && !r.eat && starving()) return deny("starving", "饿得干不动了，先去吃点东西");
  if (isYou(st) && !r.eat && spent()) return deny("spent", "没力气了，回屋睡一觉");
  if (st.npc && !r.eat && (st.npc.hunger ?? 0) >= 9) return deny("npc-starving", "他饿得干不动了，先让他吃点东西");
  if (r.fill) {
    if (mealCount() >= 3) {
      st.job = { r, target, left: r.min, total: r.min };
      if (target.npc) target.npc.wait = r.min + 10;
      return;
    }
    // Not enough cooked food to fill it: eat here instead of standing around with an empty jar.
    const alt = RECIPES.find((x) => x.needs[0] === top.key && x.eat);
    if (!alt) return deny("pot-short", "锅里不够三份");
    if (isYou(st) ? me.food >= 95 : (st.npc?.hunger ?? 0) < 1) return deny("eat-full", "还饱着呢");
    r = alt;
  }
  const servings = r.eat ? Math.min(mealCount(), isYou(st) ? Math.ceil((100 - me.food) / SERVING) : Math.max(1, Math.ceil((st.npc?.hunger ?? 0) / 3))) : 0;
  const ebb = top.key === "lake" && tide.level < -0.3 ? 0.7 : 1;      // low water: the fish are easier to reach
  const figuring = st.cards[0].key === "you" && r.id && !me.known[r.id];      // never learned, or forgotten: work it out
  if (r.take && st.cards[0].key === "you" && full(st, r.make?.[0])) return deny("hands-full", "拿不下了，先放下点东西");
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
  if (hour() < 8 || hour() > 17 || dist(center(st), center(you)) > 320 || randomWorld() > minutes / 90) return;   // they ask you to your face
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
  const stoveStack = find("stove"), stove = stoveStack?.cards[0];
  for (const c of cards) {
    if (to === "stove" && stove && c.key === "wood") { stove.fuel = Math.min(6, (stove.fuel ?? 0) + 1); c.el.remove(); }
    else if (to === "stove" && stove && DEFS[c.key].type === "food") { addMeals(1, stoveStack); c.el.remove(); }
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
    if (!n.inside && clock.min > (n.chaseAt ?? 0)) {
      const raider = boards.world.find((q) => q.critter?.raid && ["deer", "boar", "rabbit", "pheasant", "goat", "fox"].includes(q.critter.kind)
        && dist(center(q), center(st)) < 650);
      if (raider) {
        n.chaseAt = clock.min + 30;
        const p = center(raider), a = Math.atan2(p.y - center(st).y, p.x - center(st).x), away = { x: p.x + Math.cos(a) * 480, y: p.y + Math.sin(a) * 480 };
        raider.critter.alarm = { at: clock.min, from: center(st) }; raider.critter.raid = null; raider.critter.feed = null; raider.critter.nextMove = 0;
        critterGo(raider, away) || critterGo(raider, { x: p.x - 420, y: p.y });
        float("“去！别啃庄稼！”", center(st), "world");
      }
    }
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
    wet: weather.now === "雨" && weather.strength > 0.5 && !n.inside && !inRoom(center(st)),
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
    tell(st, `“不干了……${why}。”`);
    go(st, "fire", "watch");
  }
}
/** At dawn: fears pull their spirits down. (Mood itself follows what they feel — see feel.) */
function peopleDay() {
  considerExtension();
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
function commitProduction(st, target, request, { load = false, packed = false, clearLoad = false, details, includeTarget = false } = {}) {
  if (!boards[st.board]?.includes(st) || !boards[target?.board]?.includes(target) || st.board !== target.board || target.lifted) return null;
  if (load && st.carry) return null;
  const source = target.cards[0];
  if (source.key === "stove") syncMeals(target);
  const plan = planProduction({ source, cards: includeTarget ? [...st.cards.slice(1), ...target.cards] : st.cards.slice(1), season: season(), ...request });
  if (!plan) return null;
  const made = (packed ? plan.output.slice(0, 1) : plan.output).map((key) => newCard(key));
  const stockBefore = source.stock;
  Object.assign(source, plan.stock);
  if (source.key === "stove" && plan.stock.stock !== undefined) {   // the pot's number is only a count of the bowls in it
    const d = source.stock - stockBefore; source.stock = stockBefore;
    if (d < 0) takeMeals(-d, target); else addMeals(d, target);
  }
  st.cards = st.cards.filter((card) => !plan.inputs.includes(card));
  if (includeTarget && target !== st) target.cards = target.cards.filter((card) => !plan.inputs.includes(card));
  (includeTarget && target !== st ? target.cards : st.cards).push(...made);
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

const WORK_SOUND = { chestnut: "chop", pineGrove: "chop", lake: "splash", shallows: "splash", pit: "dig", scree: "dig", mineFace: "dig", copperRock: "dig", flintVein: "dig", saltPan: "dig", shellBank: "splash", field: "dig", field2: "dig" };
function finishHarvest(st, target) {
  const result = commitProduction(st, target, { kind: "harvest" }, { load: Boolean(st.npc), packed: Boolean(st.npc) });
  if (!result) return false;
  const f = target.cards[0], crop = DEFS[f.lastCrop ?? "grain"].name;
  if (result.stockBefore >= 3) village.goodHarvest = day();
  if (!st.npc) float(result.stockBefore >= 3 ? "好收成" : "收得少", center(target), target.board);
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
  const crafting = craftRecipe(r);
  const pool = [...st.cards.slice(1), ...(crafting ? target.cards : target.cards.slice(1).filter((c) => DEFS[c.key].type === "tool"))];
  const needs = planProduction({ use: r.needs.slice(1), cards: pool });
  if (!boards[st.board]?.includes(target) || target.lifted || flooded(t.key) || !needs || (r.when && !r.when(t))) {
    { if (!automatic) sayHint("job-changed", "条件变了，这次没做成"); return; }
  }
  if (figuring) {
    if (randomWorld() > FIGURE_CHANCE) { float("没琢磨出来，东西还在", center(st), st.board); me.rest = Math.max(0, me.rest - r.min * 0.1); return carryChanged(); }
    me.known[r.id] = { mem: 1, day: day() };
    banner("✦", `自己琢磨出来了：${craftName(r.id)}`);
  }
  const cost = r.take ? 1 : r.kilnClay ?? (r.eat ? servings : r.fill ? 3 : 0);
  const output = r.fill ? ["jarFull"] : [...r.make];
  if (r.take && (t.key === "chestnut" || t.key === "pineGrove")) {   // a thin stand gives little; old growth gives more
    output.length = 0;
    const cap = sourceCapacity(t.key, naturalConditions(target)), axe = (r.needs ?? []).includes("axe");
    output.push(...Array.from({ length: treeYield(t.stock, cap, axe) }, () => "log"));
  }
  if (r.take && t.key === "shallows" && tide.level < -0.3) output.push("clam");
  const use = r.fill ? ["jar"] : crafting ? (r.use ?? r.needs.slice(1)) : r.use;
  let result;
  if (r.harvest) {
    if (!finishHarvest(st, target)) { if (!automatic) sayHint("field-empty", "田里已经没粟可收了"); return; }
  } else if (cost || output.length || use?.length) {
    result = commitProduction(st, r.eat ? mealFrom(target) : target, { kind: r.eat ? "eat" : r.sow ? "sow" : r.take ? "gather" : "craft", cost, use, output }, { includeTarget: crafting });
    if (!result) { if (!automatic) sayHint("job-short", "东西不够了，这次没做成"); return; }
    if (r.take) markCut(t);
    if (r.take && t.key === "mineFace") digDeeper(target);              // every load cut at the face takes the tunnel on a little
    if (r.take && t.key === "saltPan" && !marks.has("第一捧盐")) { marks.add("第一捧盐"); banner("✦", "岛上晒出的盐"); chronicle("你在黑礁岛收起了第一捧盐。"); }
    for (const c of result.made) if (c.key === "bed") layBed(st, c);
  }
  if (st.cards[0].key === "you" && !r.eat) sfx(r.harvest ? "gain" : WORK_SOUND[t.key] ?? (r.take ? "pick" : r.build ? "drop" : "gain"));
  if (r.eat) { if (isYou(st)) eat(SERVING * servings, center(st)); else { st.npc.hunger = Math.max(0, (st.npc.hunger ?? 0) - servings * 3); float("吃饱了", center(st), st.board); } }
  if (r.nap && isYou(st)) { me.rest = Math.min(100, me.rest + 40); float("歇过来一些", center(st), st.board); }
  if (r.fill) { result.made[0].charges = 3; float("装满一罐", center(st), st.board); }
  if (r.sow) { float("种下了", center(target), target.board); groundChanged(); }
  if (r.jarIn) { t.jars = (t.jars ?? 0) + 1; refreshStock(t); float("粮囤能多存些了", center(target), "world"); }
  if (output.length > r.make.length && r.take && t.key === "shallows") float("退潮，多摸到一只", center(st), st.board);
  if (r.tend) { t.tendDay = day(); t.stock = Math.min(3, (t.stock ?? 0) + r.tend); if (r.tend > 1) float("锄得透", center(target), target.board); refreshStock(t); t.el.querySelector(".card-art").innerHTML = iconFor(t.stock >= 3 ? "fieldRipe" : "field"); float("锄了一遍", center(target), target.board); }
  if (r.tend) { groundChanged(); if (st.cards[0].key === "you") me.tendedFor = day(); }
  if (r.manure) { t.soil = Math.min(SOIL_MAX, soilOf(t) + r.manure); t.manured = yearNo(); refreshStock(t); float("撒了草木灰", center(target), target.board); }
  if (r.sting && st.cards[0].key === "you") { me.rest = Math.max(0, me.rest - 15); toast("掏蜂蜜挨了好几口蛰，疼得直甩手。下回带个火把熏一熏"); }
  if (r.water) { t.tendDay = day(); float("挑水浇了一遍", center(target), target.board); }
  if (r.fuel) { t.fuel = Math.min(6, (t.fuel ?? 0) + (r.fuel === 2 ? 2 : 1)); float("火更旺了", center(target), target.board); }
  if (r.say) say(target, r.say);
  for (const k of r.make) 
  if (r.mark && !marks.has(r.mark)) { marks.add(r.mark); banner("✦", r.mark); }
  if (r.id && st.cards[0].key === "you") {
    if (!st.job?.figuring && me.known[r.id]) me.known[r.id] = { mem: 1, day: day() };
  }
  overflow(st, automatic);
  if (!r.eat && !r.nap && isYou(st)) me.rest = Math.max(0, me.rest - r.min * 0.1);
  for (const k of (r.needs ?? []).filter((k) => k === "axe" || k === "knife" || k === "hoe" || k === "net")) wearTool(st, k) || wearTool(target, k);
  // Standing on a tree or bush: keep at it until it is picked clean, you are too hungry/tired, or you walk away.
  if (st.cards[0].key === "you" && r.take && t.stock > 0 && full(st, r.make?.[0])) { if (!automatic) sayHint("hands-full", "拿不下了"); }
  else if (st.cards[0].key === "you" && r.take && t.stock > 0 && me.food > 20 && me.rest > 15) {
    st.repeat = { target, at: clock.min + 5, automatic };
  } else if (st.cards[0].key === "you" && r.take && t.stock > 0) {
    if (me.food <= 20) { if (!automatic) sayHint("too-hungry", "饿得干不动了"); }
    else if (me.rest <= 15) { if (!automatic) sayHint("too-tired", "累了，先歇会儿"); }
  }
  deplete(t);
  carryChanged();
}
const marks = new Set();
/** Too much to carry: what doesn't fit is put down on the ground beside you. */
function overflow(st, quiet = false) {
  if (st.cards[0].key !== "you") return;
  const extra = stow(st);
  if (!extra.length) return;
  st.cards = st.cards.filter((c) => !extra.includes(c));
  newStack(extra, st.x + CARD_W + 24, st.y + 10, st.board);
  if (!quiet) toast(st.cards.some((c) => c.at === "back") ? "手上、兜里、背篓里都满了，多的放在地上" : "手上拿不下，多的放在地上（背篓能多装）");
}
/** Ask a villager to show you something they know that you don't (or have nearly forgotten). Once a day each. */
/** Someone who knows the craft talks you through the step in front of you: this step's materials and tool only. */
function learnStep(plot, npc) {
  const c = plot.cards[0];
  if (npcSkill(npc, c.build) < LEAD) return say(npc, "“这个我也说不明白。”");
  noteStep(c);
  const g = stageOf(c), left = Object.entries(c.need).filter(([, n]) => n > 0), tool = g.tool ? `，带上${DEFS[g.tool].name}` : "";
  say(npc, left.length ? `“${g.name}？备齐${left.map(([k, n]) => `${DEFS[k].name}${n}`).join("、")}${tool}。”` : `“${g.name}？料齐了${tool}，站上去干。”`);
  refreshPlot(c);
  hideDetail(); showDetail(c);
}
function teach(npc) {
  if (!awake(npc)) return;
  const k = npc.cards[0].key;
  if (me.askedDay[k] === day()) return say(npc, "“今天教过你了，明天再来。”");
  if (hearts(soc(npc.npc)) < 1) return say(npc, "“你是谁家的？先说说话吧。”");
  const theirs = CRAFTS.filter((r) => r.who.includes(k));
  const pickOne = [...theirs].sort((a, b) => (b.inv ? 1 : 0) - (a.inv ? 1 : 0)).find((r) => !me.known[r.id])   // something they have just thought of first
    ?? theirs.filter((r) => me.known[r.id]?.mem < 0.6).sort((a, b) => me.known[a.id].mem - me.known[b.id].mem)[0];   // else brush up what you're forgetting
  if (!pickOne) return say(npc, "“我会的你都会了。”");
  me.askedDay[k] = day();
  me.known[pickOne.id] = { mem: LEARNED_MEM, day: day() };
  const parts = pickOne.build ? Object.entries(BUILDS[pickOne.id].needs).map(([k, n]) => `${DEFS[k].name}${n}`).join("、") : pickOne.needs.slice(1).map((n) => DEFS[n].name).join("、");
  say(npc, pickOne.build ? `“盖${craftName(pickOne.id)}？先找块平地打地基，再备齐${parts}。”` : `“${craftName(pickOne.id)}？去${DEFS[pickOne.needs[0]].name}，带上${parts}。”`);
  sfx("gain");
  renderCrafts();
}
/** Stone tools don't wear down by the stroke: now and then the lashing gives and the head comes loose (or a net tears).
 *  Head and haft are still there — bind them again with rope (mend a net with fibre). Sandals do wear out. */
const BREAKS = { axe: ["axeLoose", 0.03], knife: ["knifeLoose", 0.035], hoe: ["hoeLoose", 0.035], hammer: ["hammerLoose", 0.03], spear: ["spearLoose", 0.05], net: ["netTorn", 0.01] };
const looseOf = (key) => BREAKS[key]?.[0];
/** The tool at i in this stack comes apart: it becomes its loose self, where it was. */
function loosen(st, i) {
  const tool = st.cards[i];
  if (tool.key === "net") {                                           // a net is not mended card-for-card: what's left is a little fibre
    tool.el.classList.add("gone"); setTimeout(() => tool.el.remove(), 300); st.cards.splice(i, 1);
    const fibre = newCard("fiber");
    if (st === youStack()) { cardsLayer.append(fibre.el); st.cards.push(fibre); } else storeHome([fibre]);
    float("渔网扯破了，只剩一束麻线", center(st), st.board);
    return null;
  }
  const broken = newCard(looseOf(tool.key));
  if (tool.at) broken.at = tool.at === "held" ? undefined : tool.at;
  tool.el.replaceWith(broken.el); st.cards[i] = broken;
  float(`${DEFS[tool.key].name}${tool.key === "net" ? "扯破了" : "松脱了"}`, center(st), st.board);
  return broken;
}
/** Put it back together: the loose tool and its rope (or fibre) make the tool again. */
function mend(st, broken) {
  const d = DEFS[broken.key], i = st.cards.indexOf(broken), f = st.cards.findIndex((c, j) => j > 0 && c.key === d.fix);
  if (i < 0 || f < 0) return false;
  const fixed = newCard(d.fixes);
  st.cards[f].el.remove(); broken.el.replaceWith(fixed.el);
  st.cards[i] = fixed; st.cards.splice(f, 1);
  float(`${DEFS[d.fixes].name}${d.fixes === "net" ? "补好了" : "重新绑好了"}`, center(st), st.board);
  return true;
}
function wearTool(st, key) {
  const i = st.cards.findIndex((c, j) => j > 0 && c.key === key);
  if (i < 0) return false;
  const tool = st.cards[i];
  if (st.cards[0].key === "you") hold(st, tool);
  if (BREAKS[key]) { if (randomWorld() < BREAKS[key][1]) loosen(st, i); return true; }
  tool.uses = (tool.uses ?? DEFS[key].uses) - 1;
  if (tool.uses > 0) return true;
  st.cards.splice(i, 1); tool.el.classList.add("gone"); setTimeout(() => tool.el.remove(), 300);
  float(`${DEFS[key].name}${key === "sandals" ? "磨破了" : "用完了"}`, center(st), st.board);
  return true;
}
function combatOptions(you, target) {
  const kind = target.cards[0].key;
  if (!Object.hasOwn(WILD_HP, kind) || target.raid?.retreat || (kind === "coastRaider" && !target.raid?.landed && !target.guard)) return [];
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
  return options.map(({ id, label }) => `<button class="act" data-hunt="${card.id}" data-strike="${id}">${label}</button>`).join("");
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
  if (!strike || dist(a, b) > strike.range) return sayHint("attack-far", "太远了，再靠近点");
  if (clock.min < (me.attackReadyAt ?? 0)) return sayHint("attack-steady", "先稳住脚步");
  if (me.rest < strike.cost || starving()) return sayHint("attack-tired", "没力气出手");
  const obstacle = you.board === "world" && reachAlong(MAP, a, b).reason;
  if (obstacle && !(obstacle === "water" && card.key === "duck" && strike.id === "throw")) return float("够不着", a, you.board);
  me.attackReadyAt = clock.min + 8;
  me.rest -= strike.cost;
  cancelJob(you); you.walk = null; you.travel = null;
  if (strike.tool) wearTool(you, strike.tool);
  const state = target.critter ?? target.raid ?? target.guard;
  if (target.critter) { target.critter.awakeUntil = clock.min + 120; target.cards[0].el.classList.remove("sleeping"); }
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
  if (target.raid || target.guard) { routRaider(target, "你"); me.fight = null; carryChanged(); return; }
  removeWildAnimal(target);
  for (const key of LOOT[card.key]) addCard(you, key);
  overflow(you);
  float(`打到了${card.name ?? DEFS[card.key].name}`, b, you.board);
  const first = `第一次打到${DEFS[card.key].name}`;
  if (!marks.has(first)) { marks.add(first); banner("✦", first); }
  if (!boards.world.some((st) => st.critter?.kind === card.key)) chronicle(`这一带暂时见不到${DEFS[card.key].name}了。`);
  carryChanged();
}
/** A wild animal you've set your mind on: walk it down, strike whenever it is in reach, and keep on till it's down or gone. */
function huntTarget(target, action = null) {
  const you = youStack();
  if (!you || me.aboard || me.fight || !target || target.board !== you.board || !Object.hasOwn(WILD_HP, target.cards[0].key) || target.raid?.retreat) return false;
  me.hunt = { id: target.id, action, until: clock.min + 360 };
  return huntStep(true);
}
function huntStep(force = false) {
  const you = youStack(), h = me.hunt;
  if (!h || !you) return false;
  if (me.aboard || me.fight) { me.hunt = null; return false; }
  const target = boards.world.find((q) => q.id === h.id);
  if (!target || target.board !== you.board || clock.min > h.until || target.cards[0].el.matches(".ghost, .hidden")) { me.hunt = null; return false; }
  const options = combatOptions(you, target);
  if (!options.length) { me.hunt = null; return false; }
  const a = center(you), b = center(target), gap = dist(a, b);
  const strike = (h.action && options.find((o) => o.id === h.action)) || options.filter((o) => gap <= o.range).at(-1) || options.at(-1);
  const way = you.board === "world" ? reachAlong(MAP, a, b) : { blocked: false };
  const obstacle = way.blocked;
  const across = obstacle && way.reason === "water" && strike.id === "throw" && target.cards[0].key === "duck";   // a spear reaches a duck on the water
  if (obstacle && way.reason === "water" && !across) {
    me.hunt = null;
    sayHint("hunt-blocked", "隔着水，够不着——带根石矛，或者等它上岸");
    return false;
  }
  if (gap > strike.range || (obstacle && !across)) {
    if (force || !you.walk) {
      if (!walkTo(you, b) && (!h.blockedAt || clock.min > h.blockedAt)) { h.blockedAt = clock.min + 20; sayHint("hunt-path", "拐不过去，再找条路"); }
    }
    return true;
  }
  if (me.rest < strike.cost || starving()) { me.hunt = null; sayHint("hunt-tired", "没力气追了"); return false; }
  if (clock.min < (me.attackReadyAt ?? 0)) return true;
  attackRabbit(target.cards[0], strike.id);
  if (strike.id === "ward") me.hunt = null;
  return true;
}
/** The tiger. By day it lies up deep in the wood; from dusk, hungry, it hunts. It makes its way towards prey, then
 *  either creeps up on it low in the grass — freezing now and then — or goes round to where the prey is feeding and
 *  lies in wait. From close in it breaks cover in a rush far faster than anything it hunts, but only for a short burst:
 *  if it hasn't caught it by then it pulls up, panting, and lies down. People near it without fire it goes for the same
 *  way; once it has drawn blood it keeps after them. Fire drives it back. */
const CHARGE_MAX = 650;                     // a burst of twenty-odd paces, then it's spent
const CATCH = { deer: 0.8, goat: 0.75, boar: 0.55, rabbit: 0.7, pheasant: 0.6, fox: 0.6, duck: 0.7 };
/** How it looks: low in the grass (hard to see), in the rush, lying up. */
function pose(st, mode) { const el = st.cards[0].el; if ((el.dataset.look ?? "") !== mode) el.dataset.look = mode; }
/** Lying up: low to the ground; in the deep of its off-hours, asleep. */
/** Properly asleep, not merely resting: in its sleeping hours and not woken just now. */
function deepSleeping(st) {
  const c = st?.critter;
  if (!c) return false;
  return clock.min >= (c.awakeUntil ?? 0) && !isActive(c.kind, hour()) && isAsleep(c.kind, hour());
}
function restPose(st, asleep = false) {
  pose(st, "rest");
  st.cards[0].el.classList.toggle("sleeping", Boolean(asleep));
}
function wakePose(st) {
  if (st.cards[0].el.dataset.look === "rest") pose(st, "");
  st.cards[0].el.classList.remove("sleeping");
}
/** A still animal is never stock-still: a step, its head up, a fresh place a few paces off. */
function idleAnimal(st, minutes, up, at, radius) {
  const a = st.critter, here = center(st), asleep = !up && isAsleep(a.kind, hour());
  if (st.walk) {
    if (stepWalk(st, minutes, st.walk.pace ?? paceOf(a.kind, up ? "graze" : "creep"))) { st.walk = null; if (up) wakePose(st); else restPose(st, asleep); }
    return;
  }
  if (up) wakePose(st); else restPose(st, asleep);
  if (clock.min < (a.nextMove ?? 0)) return;
  a.nextMove = clock.min + (up ? 2 + randomWild() * 5 : stirAfter(a.kind, randomWild));
  if (!up && randomWild() < 0.35) return;                            // now and then: only a look, no step
  const heading = headingOf(st), ang = heading + (randomWild() - 0.5) * 2.4, r = up ? 18 + randomWild() * radius : 10 + randomWild() * radius;
  const p = { x: at.x + Math.cos(ang) * r, y: at.y + Math.sin(ang) * r };
  if (!walkable(MAP, p.x, p.y) || reachAlong(MAP, here, p).blocked) return;
  st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, pace: paceOf(a.kind, up ? "graze" : "creep") };
  if (!up) wakePose(st);                                             // getting up to shift: not asleep on its feet
}
function tigerTick(st, minutes, you) {
  const c = st.critter, here = center(st), yc = you && you.board === "world" ? center(you) : null;
  if (deepSleeping(st)) { st.walk = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return; }
  const torch = you?.cards.some((x) => x.key === "torch");
  c.hunger = (c.hunger ?? 5) + minutes / 700;                         // a big kill lasts it a few days; hunger brings it back out
  if (st.walk?.prey || st.walk?.pounce) st.walk = null;              // an older save's hunt: start it afresh
  if (c.hunt) return tigerHunt(st, minutes, you);
  if (isActive("tiger", hour())) st.cards[0].el.classList.remove("sleeping");
  pose(st, (c.lying ?? 0) > clock.min ? "rest" : "");
  const sense = (c.lying ?? 0) > clock.min ? (c.onKill ? 320 : 200) : isActive("tiger", hour()) ? 380 : 260;   // hunting by night it misses little; on a kill it won't share
  if (c.chase && tigerChase(st, minutes)) return;                    // it has drawn blood: it keeps after them
  const near = people(st.board).filter((q) => !withFire(q) && !sheltered(q) && dist(center(q), here) < sense && !reachAlong(MAP, here, center(q)).blocked)
    .sort((a, b) => dist(center(a), here) - dist(center(b), here))[0];
  if (near && clock.min > (c.calm ?? 0)) return pounce(st, near);
  if (yc && torch && dist(here, yc) < 360) slink(st, yc);           // fire: it slinks off into the trees
  if ((c.lying ?? 0) > clock.min) {
    if (st.walk) {                                                   // on its way to somewhere quiet first: the rest waits till it's there
      c.lying += minutes;
      if (stepWalk(st, minutes, paceOf("tiger", c.carrying ? "trot" : "walk"))) { st.walk = null; settleDown(st); }   // with a kill in its jaws, at a trot
    }
    return;
  }
  c.onKill = false;
  if (!isActive("tiger", hour()) && c.hunger < 9) { lieUp(st, 60 + randomWild() * 60); return; }   // by day it lies up in the deep wood
  if (!st.walk && c.hunger < 5 && clock.min > (c.backAt ?? 0) && dist(here, c.home) > c.roam * 3 && !critterGo(st, c.home)) c.backAt = clock.min + 240;   // only far outside its range does it drift back
  // hungry, and it's the hunting hours (or it's starving): the best prey it can get to — a deer above all
  const prowl = c.hunger > TIGER_PROWL;
  const preyAbout = boards.world.filter((q) => ["deer", "boar", "goat"].includes(q.critter?.kind) && dist(center(q), here) < 3000).length;
  const huntAt = prowl ? 4.5 : tigerHuntAt(preyAbout);
  if (c.hunger > huntAt && (isActive("tiger", hour()) || c.hunger > 9) && clock.min >= (c.nextHunt ?? 0)) {   // starving, it hunts by day too
    const reach = prowl ? 4200 : 2800, VALUE = { deer: 2.6, goat: 2.3, boar: 2.5, pheasant: 1, rabbit: 1, fox: 0.8 };
    const count = (kind) => boards.world.filter((q) => q.critter?.kind === kind).length;
    const preyFloor = { deer: 4, goat: 3, boar: 3 };
    const ranked = boards.world.filter((q) => isPrey(c, q) && dist(center(q), here) < reach && (prowl || dist(center(q), c.home) < 2800)
      && (preyFloor[q.critter?.kind] === undefined || count(q.critter.kind) > preyFloor[q.critter.kind]))
      .map((q) => ({ q, score: (VALUE[q.critter?.kind] ?? 1.5) + Math.min(1.2, count(q.critter?.kind) * 0.15) - dist(center(q), here) / 600 })).sort((a, b) => b.score - a.score).slice(0, 4);
    let prey = null;
    for (const { q } of ranked) if (wayTo(st, center(q))) { prey = q; break; }   // one it can actually get to, round cliffs and water
    c.nextHunt = clock.min + 20;
    if (prey) {
      c.hunt = { id: prey.id, mode: "approach", until: clock.min + 360 };
      st.walk = null;
      const you2 = youStack();
      if (clock.min - (c.roaredAt ?? -9999) > 1440 && you2?.board === "world" && dist(center(you2), here) < 1800) { c.roaredAt = clock.min; sfx("roar"); toast("林子深处传来一声虎啸"); }
      if (prowl && !c.prowling) {
        c.prowling = true;
        if (day() - (nature.prowlNoted ?? -99) >= DAYS_PER_SEASON * 4) {        // news once a year, not every time it's hungry
          nature.prowlNoted = day();
          const none = !boards.world.some((q) => q.critter?.kind === "deer");
          chronicle(none ? "林子里的鹿打光了，老虎饿得出了林子。" : "老虎在深林里撵不着鹿，饿得出了林子。");
          omen(none ? "“林子里没鹿了，老虎饿急了，会往外跑。夜里别一个人出去。”" : "“老虎出林子了，夜里别一个人出去。”");
        }
      }
      return;
    }
  }
  if (!st.walk && randomWorld() < minutes / 90) {
    for (let k = 0; k < 10; k++) {
      const p = { x: c.home.x + (randomWorld() - 0.5) * c.roam * 2, y: c.home.y + (randomWorld() - 0.5) * c.roam * 1.6 };
      if (inJungle(p) && !reachAlong(MAP, here, p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 }; break; }
    }
  }
  if (st.walk && stepWalk(st, minutes, paceOf("tiger", c.prowling ? "trot" : "walk"))) st.walk = null;
}
/** Lie up — but only somewhere quiet: deep in the wood with nobody near. Otherwise it goes back to its lair first. */
function lieUp(st, minutes) {
  const c = st.critter, here = center(st);
  c.lying = clock.min + minutes;
  const quiet = inJungle(here) && !people(st.board).some((q) => dist(center(q), here) < 900);
  if (quiet) { st.walk = null; settleDown(st); return; }
  const spot = quietNear(st);                                          // not a den: any deep cover away from people
  const way = spot && wayTo(st, spot);
  st.walk = way ? { path: way.length ? way : null, k: 0, x: spot.x - CARD_W / 2, y: spot.y - CARD_H / 2 } : null;
  if (st.walk) st.walk.pace = paceOf("tiger", c.carrying ? "trot" : "walk");
  else settleDown(st);                                                 // nowhere better: it lies low here, kill and all
}
/** Deep cover near where it is, well clear of people: a tiger has no den to go back to. */
function quietNear(st) {
  const c = st.critter, here = center(st), folk = people(st.board);
  let best = null, bs = -Infinity;
  for (let k = 0; k < 18; k++) {
    const a = randomWild() * 6.28, r = 140 + randomWild() * 520;
    const p = { x: here.x + Math.cos(a) * r, y: here.y + Math.sin(a) * r };
    if (!walkable(MAP, p.x, p.y) || reachAlong(MAP, here, p).blocked) continue;
    const away = folk.length ? Math.min(...folk.map((q) => dist(center(q), p))) : 2000;
    const s = woodDepth(MAP, p.x, p.y) * 2.4 + Math.min(away, 1200) / 420 - dist(p, c.home) / 1100 + randomWild() * 0.3;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
/** Where it lies up: what it carried is put down by it. */
function settleDown(st) {
  const c = st.critter, at = center(st);
  restPose(st, isAsleep("tiger", hour()));
  if (!c.carrying) return;
  const meat = Array.from({ length: c.carrying }, () => newCard("meat"));
  meat.forEach((m) => cardsLayer.append(m.el)); newStack(meat, at.x + 50, at.y + 30, "world");
  c.carrying = 0; c.onKill = true;
}
/** What it will go after: the big game while there are more than a breeding pair of them; out prowling, a hare, a
 *  pheasant, a duck ashore, even the dog will do. */
function isPrey(c, q) {
  const kind = q.critter?.kind, prowl = c.hunger > TIGER_PROWL;
  if (q.pet) return prowl && !inYard(center(q));
  if (["deer", "boar", "goat"].includes(kind)) return boards.world.filter((o) => o.critter?.kind === kind).length > 2;
  if (["pheasant", "rabbit", "fox"].includes(kind)) return prowl;
  if (kind === "duck") return prowl && !inLake(center(q));
  return false;
}
/** Fire close by: away into the trees. */
function slink(st, from) {
  const here = center(st), a = Math.atan2(here.y - from.y, here.x - from.x), p = { x: here.x + Math.cos(a) * 300, y: here.y + Math.sin(a) * 300 };
  if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
}
/** Make its way to a point at a pace: straight if it can, round the long way if not. False if it can't get there. */
function tigerMove(st, p, pace, minutes) {
  const w = st.walk;
  if (!w || !w.goal || dist(w.goal, p) > 60 || clock.min > (w.repath ?? 0)) {
    const way = wayTo(st, p);
    if (!way) return false;
    st.walk = { path: way.length ? way : null, k: 0, x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, goal: { ...p }, repath: clock.min + 8 };
  }
  if (stepWalk(st, minutes, pace)) st.walk = null;
  return true;
}
/** Where a herd is feeding, if it is: what the tiger can lie in wait beside. */
function feedingAt(prey) {
  const there = center(prey), kind = prey.critter?.kind;
  const grazer = boards.world.find((q) => q.critter?.kind === kind && q.critter.feed?.at && dist(center(q), there) < 500);
  return grazer?.critter.feed.at ?? null;
}
/** A place in cover on its side of the feeding ground, a few paces off it. */
function coverNear(feed, from) {
  const base = Math.atan2(from.y - feed.y, from.x - feed.x);
  let best = null, bs = -Infinity;
  for (let k = 0; k < 9; k++) {
    const a = base + (k - 4) * 0.35, p = { x: feed.x + Math.cos(a) * 230, y: feed.y + Math.sin(a) * 230 };
    if (!walkable(MAP, p.x, p.y)) continue;
    const s = woodDepth(MAP, p.x, p.y) - Math.abs(k - 4) * 0.08;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function burst(st, prey) {
  const c = st.critter;
  c.hunt = { ...c.hunt, id: prey.id, mode: "charge", ran: 0 };
  st.walk = null; pose(st, "charge");
  for (const q of boards.world) if (q.critter && q !== st && dist(center(q), center(st)) < 600) { q.critter.alarm = { at: clock.min, from: center(st) }; q.critter.nextMove = 0; }   // it bursts out: everything near bolts, the flock's leader too
  if (known(center(st))) float(prey.npc || prey.cards[0].key === "you" ? "老虎从草里窜了出来！" : "老虎猛地窜了出去", center(st), "world");
}
/** One step of the hunt. */
function tigerHunt(st, minutes, you) {
  const c = st.critter, h = c.hunt, here = center(st);
  const prey = boards.world.find((q) => q.id === h.id), there = prey ? center(prey) : null;
  const stop = (rest, note) => {
    c.hunt = null; st.walk = null; pose(st, rest > 0 ? "rest" : "");
    if (rest > 0) lieUp(st, rest); c.nextHunt = clock.min + (rest ? rest + 30 : 8);
    if (note && known(here)) float(note, here, "world");
  };
  /** A miss: a few breaths, then after it again — the same one, or whatever is nearer — till it has missed three times. */
  const missed = (note) => {
    h.misses = (h.misses ?? 0) + 1;
    if (note && known(center(st))) float(note, center(st), "world");
    if (h.misses >= 3 || h.person) return stop(40 + randomWild() * 30);
    const next = boards.world.filter((q) => isPrey(c, q) && dist(center(q), center(st)) < 1400).sort((a, b) => dist(center(a), center(st)) - dist(center(b), center(st)))[0];
    if (!next) return stop(30);
    Object.assign(h, { id: next.id, mode: "approach", ran: 0, pant: clock.min + 5 + randomWild() * 6 });
    st.walk = null; pose(st, "rest");
  };
  if (you?.board === "world" && withFire(you) && dist(center(you), here) < 360) { stop(0); return slink(st, center(you)); }
  if (!there || clock.min > h.until || (prey.pet && inYard(there)) || ((prey.npc || prey.cards[0].key === "you") && (withFire(prey) || sheltered(prey)))) return stop(h.mode === "charge" ? 20 : 0);
  const d = dist(here, there), clear = !reachAlong(MAP, here, there).blocked;
  if (h.mode === "charge") {
    pose(st, "charge");
    if (!clear) return stop(30, "老虎被挡住，停了下来");
    const before = { ...here };
    st.walk = { target: prey };
    const got = stepWalk(st, minutes, paceOf("tiger", "run"));
    h.ran += dist(before, center(st));
    if (got || dist(center(st), center(prey)) < 80) {
      c.hunt = null; st.walk = null; pose(st, "");
      if (prey.npc || prey.cards[0].key === "you") return maul(st, prey);
      if (randomWild() < (prey.pet ? 0.8 : CATCH[prey.critter?.kind] ?? 0.7)) return kill(st, prey);
      return missed(prey.critter?.kind === "boar" ? "野猪回身顶了老虎一下，跑了" : "老虎扑倒了又让它挣脱了");
    }
    if (h.ran > CHARGE_MAX) return missed("老虎没扑着，停下来喘了口气");
    return;
  }
  if (clock.min < (h.pant ?? 0)) { pose(st, "rest"); st.walk = null; return; }   // getting its breath back
  // a person close by, no fire: it goes for them instead
  const person = people(st.board).find((q) => !withFire(q) && !sheltered(q) && dist(center(q), here) < 300 && !reachAlong(MAP, here, center(q)).blocked);
  if (person && clock.min > (c.calm ?? 0)) return pounce(st, person);
  const you2 = youStack();
  if (h.mode !== "approach" && you2?.board === "world" && !h.hinted && dist(center(you2), here) < 450) {   // low in the grass: you might just catch it
    h.hinted = true;
    if (randomWild() < 0.5) float("草丛里好像有东西动了一下", here, "world");
  }
  if (clear && d < (h.mode === "ambush" ? 340 : 300)) return burst(st, prey);   // close enough: out of the grass at it
  if (h.mode === "ambush") {                                         // lying in wait: anything it would take that comes close
    pose(st, "crouch"); st.walk = null;
    const passer = boards.world.find((q) => q !== prey && isPrey(c, q) && dist(center(q), here) < 340 && !reachAlong(MAP, here, center(q)).blocked);
    if (passer) return burst(st, passer);
    if (clock.min > h.wait) return stop(10);                         // nothing came by: try again elsewhere
    return;
  }
  if (h.mode === "approach" && d < 900) {                            // near: creep up on it, or go round and wait where it's feeding
    const feed = feedingAt(prey), spot = feed && dist(feed, there) < 300 && randomWild() < 0.5 ? coverNear(feed, here) : null;
    if (spot) { h.mode = "toAmbush"; h.spot = spot; } else h.mode = "stalk";
  }
  if (h.mode === "toAmbush") {
    pose(st, "crouch");
    if (dist(here, h.spot) < 40) { h.mode = "ambush"; h.wait = clock.min + 90 + randomWild() * 90; st.walk = null; return; }
    if (!tigerMove(st, h.spot, paceOf("tiger", "stalk"), minutes)) h.mode = "stalk";
    return;
  }
  if (h.mode === "stalk") {
    pose(st, "crouch");
    if (clock.min < (h.frozen ?? 0)) return;                         // stock-still, belly to the ground
    if (randomWild() < minutes / 25) { h.frozen = clock.min + 3 + randomWild() * 6; st.walk = null; return; }
    if (!tigerMove(st, there, paceOf("tiger", "stalk"), minutes)) return stop(20);
    return;
  }
  pose(st, "");                                                      // still far: on its way, at a trot if it's hungry enough
  if (!tigerMove(st, there, paceOf("tiger", c.hunger > TIGER_PROWL ? "trot" : "walk"), minutes)) stop(30);
}
function kill(tiger, prey) {
  const name = prey.pet ? DEFS.dog.name : prey.cards[0].name ?? DEFS[prey.critter?.kind]?.name ?? "猎物", at = center(prey), kind = prey.critter?.kind;
  const grown = kind && !isYoung(kind, wildAge(prey));
  removeWildAnimal(prey);
  const big = { deer: 1, boar: 1, goat: 1 }[kind] ?? 0, left = big ? 1 + (randomWild() < 0.5 ? 1 : 0) : 0;
  const feed = tigerFeed(kind, grown);
  tiger.critter.hunger = Math.max(-8, tiger.critter.hunger - feed.hunger); tiger.critter.lying = clock.min + feed.rest; tiger.critter.prowling = false; tiger.critter.onKill = Boolean(left);   // it lies up by the kill and won't share it
  tiger.critter.carrying = left;                                     // it takes the carcass away to eat in peace
  lieUp(tiger, feed.rest);
  if (known(at) && tiger.walk) float(`老虎叼起${name}往林子深处去了`, at, "world");
  if (known(at) && !tiger.walk) float(prey.pet ? "老虎叼走了阿黄！" : `老虎扑倒了${name}`, at, "world");
  if (big) chronicle(`老虎在林子里扑倒了一头${name}，叼回了深林。`);
  if (prey.pet) { chronicle("阿黄跑出院子，被老虎叼走了。"); carryChanged(); renderParty(); }
}
/** People out in the open: you, and the villagers who are up and about. */
const people = (b = "world") => [youStack(), ...npcs().filter((q) => !q.npc.inside && !q.npc.visitor)].filter((q) => q && q.board === b && !q.indoors && !(q.cards[0].key === "you" && me.aboard));
const withFire = (q) => q.cards.some((c) => c.key === "torch");
/** Behind walls and under a roof: a tiger won't come in after them. */
const sheltered = (q) => Boolean(q.npc?.inside || q.indoors || inRoom(center(q)));
/** Somewhere it can get to: straight there ([]), round the long way (a path), or not at all (null). */
function wayTo(st, p) {
  const here = center(st);
  if (!reachAlong(MAP, here, p).blocked) return [];
  const path = findPath(MAP, here, p);
  return path?.length ? path.slice(0, -1) : null;
}
/** After it has drawn blood: it keeps after them — round whatever is in the way — till they get indoors, bring fire,
 *  or get well away. A second mauling and it has had its fill of fighting; it slinks off. */
function tigerChase(st, minutes) {
  const c = st.critter, v = boards.world.find((q) => q.id === c.chase.id), here = center(st);
  const vc = v && v.board === "world" ? center(v) : null;
  if (!vc || clock.min > c.chase.until || withFire(v) || sheltered(v) || dist(vc, here) > 1000) { c.chase = null; st.walk = null; return false; }
  if (clock.min > (c.calm ?? 0) && dist(vc, here) < 380 && !reachAlong(MAP, here, vc).blocked) { pounce(st, v); return true; }
  if (!st.walk?.chasing || clock.min > st.walk.repath) {
    const way = wayTo(st, vc);
    if (!way) { c.chase = null; st.walk = null; return false; }
    st.walk = { path: way, k: 0, x: vc.x - CARD_W / 2, y: vc.y - CARD_H / 2, chasing: true, repath: clock.min + 6 };
  }
  pose(st, "");
  if (stepWalk(st, minutes, paceOf("tiger", "lope"))) st.walk = null;       // a long loping run after them
  return true;
}
/** At a person: the same burst from cover as at a deer. */
function pounce(tiger, v) {
  if (!v || v.board !== "world") return;
  tiger.critter.hunt = { id: v.id, mode: "charge", ran: 0, until: clock.min + 30 };
  tiger.walk = null; pose(tiger, "charge");
  if (known(center(tiger))) float(v.npc ? `老虎扑向${nameOf(v)}！` : "老虎扑过来了！", center(tiger), "world");
}
function maul(tiger, you) {
  if (!you) return;
  const c = tiger.critter, again = c.chase?.id === you.id;
  c.chase = again ? null : { id: you.id, until: clock.min + 120 };
  if (you.npc) {
    hurtNpc(you, tiger, again ? 0.6 : 0.4);
    c.calm = clock.min + (again ? 240 : 8);
    if (again) { c.lying = clock.min + 120; chronicle(`${nameOf(you)}在林子边叫老虎扑了两回，伤得很重。`); }
    return;
  }
  me.fight = { id: tiger.id, until: clock.min + 60 }; me.hunt = null;
  me.rest = Math.max(0, me.rest - 55); me.food = Math.max(0, me.food - 10);
  const a = Math.atan2(center(you).y - center(tiger).y, center(you).x - center(tiger).x), p = { x: center(you).x + Math.cos(a) * 240, y: center(you).y + Math.sin(a) * 240 };
  const got = reachAlong(MAP, center(you), p); you.x = got.x - CARD_W / 2; you.y = got.y - CARD_H / 2;
  cancelJob(you);
  you.walk = null; you.travel = null;
  if (again) {                                                       // a second time: badly hurt; it has had enough and goes
    me.sickUntil = Math.max(me.sickUntil ?? 0, clock.min + 2 * 1440); me.rest = 0;
    toast("又被老虎扑倒了，伤得很重……它拖着步子走开了。回家躺两天"); chronicle("你被老虎扑倒了两回，捡回一条命，伤得不轻。");
    c.calm = clock.min + 300; c.lying = clock.min + 180;
  } else {
    toast("被老虎扑倒了！它还盯着你——快往屋里跑，或者点起火把"); chronicle("你被老虎扑倒了，它还跟在后头。");
    c.calm = clock.min + 8;                                          // a breath, and it comes again
  }
  const back = reachAlong(MAP, center(tiger), { x: center(tiger).x - Math.cos(a) * 160, y: center(tiger).y - Math.sin(a) * 160 });
  tiger.x = back.x - CARD_W / 2; tiger.y = back.y - CARD_H / 2;
}
/** The boar (and the bear): it roots about its patch of wood; come close without a torch or a spear and it charges —
 *  you or anyone else who strays too near. */
function boarTick(st, minutes, you) {
  const c = st.critter, here = center(st);
  if (deepSleeping(st)) { st.walk = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return; }
  if (isActive(c.kind, hour())) wakePose(st);
  if (c.kind === "bear" && season() === "冬") { st.walk = null; restPose(st, true); return; }    // asleep in its hollow till spring
  const people = [you, ...npcs().filter((q) => !q.npc.inside && !q.indoors && !q.npc.visitor)].filter((q) => q?.board === "world" && dist(center(q), here) < 520 && !(q === you && me.aboard));
  const foe = st.walk?.charge ? st.walk.target : people.filter((q) => !reachAlong(MAP, here, center(q)).blocked).sort((a, b) => dist(center(a), here) - dist(center(b), here))[0] ?? null;
  const fc = foe && boards.world.includes(foe) ? center(foe) : null;
  const armed = foe?.cards.some((x) => x.key === "spear"), torch = foe?.cards.some((x) => x.key === "torch");
  const d = fc ? dist(here, fc) : Infinity, clear = fc && !reachAlong(MAP, here, fc).blocked;
  if (st.walk?.charge) {
    if (!fc || torch || !clear || d > 420) { st.walk = null; c.calm = clock.min + 20; return; }   // it got away (or brought fire)
    if (stepWalk(st, minutes, paceOf(c.kind, "run"))) { st.walk = null; gore(st, foe); } return;
  }
  if ((c.hp ?? WILD_HP[c.kind]) <= 2 && fc && d < 520) {               // badly hurt: it runs for the thicket
    if (!st.walk?.evading) { const a = Math.atan2(here.y - fc.y, here.x - fc.x), p = { x: here.x + Math.cos(a) * 300, y: here.y + Math.sin(a) * 300 }; if (critterGo(st, p)) st.walk.evading = true; }
    if (st.walk && stepWalk(st, minutes, paceOf(c.kind, "run"))) st.walk = null;
    return;
  }
  // too close: first it stands its ground and huffs; stay (or come closer) and it charges — again and again while you stand there
  const reach = armed ? 110 : isActive(c.kind, hour()) ? 230 : 160;  // lying up by day it lets you nearer before it's startled; a spear keeps it off
  if (fc && clear && !torch && d < reach && clock.min > (c.calm ?? 0)) {
    if (!c.warned || clock.min - c.warned > 40) {
      c.warned = clock.min; c.warnedAt = foe.id; st.walk = null;
      if (known(here)) float(c.kind === "bear" ? `黑熊直起身子，冲${foe === you ? "你" : nameOf(foe)}吼了一声` : "野猪竖起鬃毛，哼哧哼哧", here, "world");
      return;
    }
    if (clock.min - c.warned >= 5 || d < reach * 0.6) return charge(st, foe);
    return;                                                          // still huffing: a moment to back away
  }
  if (fc && torch && d < 320 && !st.walk) {                          // fire: it backs off
    const a = Math.atan2(here.y - fc.y, here.x - fc.x), p = { x: here.x + Math.cos(a) * 260, y: here.y + Math.sin(a) * 260 };
    if (!reachAlong(MAP, here, p).blocked) st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2 };
  }
  woodlandTick(st, minutes);
}
/** How long a fright keeps them running (game minutes): a deer bolts a long way, a pheasant whirrs off over the trees. */
const BOLT = { deer: 25, goat: 20, rabbit: 12, pheasant: 10, fox: 15 };
function woodlandTick(st, minutes) {
  const animal = st.critter, here = center(st), rooting = animal.kind === "boar";
  if (deepSleeping(st)) { st.walk = null; animal.feed = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return; }
  const herd = boards.world.filter((other) => other !== st && other.critter && !other.critter.water && other.critter.kind !== animal.kind);
  const alarmFrom = clock.min - (animal.alarm?.at ?? -99) < (BOLT[animal.kind] ?? 8) ? animal.alarm.from : null;
  if (alarmFrom) { animal.fleeUntil = Math.max(animal.fleeUntil ?? 0, clock.min + 18 + randomWild() * 10); animal.fleeFrom = alarmFrom; }   // keep running a while
  const threat = rooting ? null : boards.world.find((other) => {
    if (other === st || other.indoors || other.npc?.inside) return false;
    const danger = (other.critter?.kind === "wolf" && animal.kind !== "wolf") || other.critter?.aggro || other.critter?.predator || other.npc || other.pet || other.cards[0].key === "you";
    if (!danger) return false;
    const low = other.critter?.hunt && other.critter.hunt.mode !== "charge" && other.critter.hunt.mode !== "approach";
    return dist(here, center(other)) < (other.critter?.aggro ? 320 : animal.fear * (low ? 0.45 : 1));
  });
  if (threat) {
    animal.fleeUntil = clock.min + 18 + randomWild() * 12; animal.fleeFrom = center(threat); animal.nextMove = 0;
  }
  const fleeing = clock.min < (animal.fleeUntil ?? 0);
  const away = fleeing ? { alarm: true, center: animal.fleeFrom ?? here } : null;
  if (away && st.walk && !st.walk.evading) st.walk = null;
  const up = isActive(animal.kind, hour());
  if (!away) {                                                       // nothing to fear: graze at its hours, lie up the rest
    if (st.walk && stepWalk(st, minutes, st.walk.pace ?? paceOf(animal.kind, "walk"))) st.walk = null;
    if (!st.walk && clock.min >= (animal.nextMove ?? 0)) grazeStep(st, minutes, up, herd);
    return;
  }
  animal.feed = null;
  if (!st.walk && clock.min >= (animal.nextMove ?? 0)) {
    animal.nextMove = clock.min + 7 + randomWild() * 10;
    const awayFrom = away.center;
    const angle = Math.atan2(here.y - awayFrom.y, here.x - awayFrom.x);
    const habitat = animal.kind === "goat" ? "plateau" : countryAt(animal.home);
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = angle + k * 2.4, r = (k < 8 ? 240 + randomWild() * 260 : 120 + randomWild() * 160) * (alarmFrom || threat ? 1.3 : 1);
      const p = { x: here.x + Math.cos(a) * r, y: here.y + Math.sin(a) * r };
      if (!walkable(MAP, p.x, p.y) || reachAlong(MAP, here, p).blocked) continue;
      if (dist(p, awayFrom) < dist(here, awayFrom) + 40) continue;
      const crowded = herd.some((other) => dist(p, center(other)) < 150);
      const depth = woodDepth(MAP, p.x, p.y), edge = 1 - Math.min(1, Math.abs(depth - 0.3) * 2.5);
      const time = !up ? depth * 1.6 : animal.kind === "deer" || animal.kind === "rabbit" ? edge * 1.4 : 0;
      const score = time + (countryAt(p) === habitat ? 1.1 : 0) + depth * (rooting ? 2.3 : 1) -
        dist(p, animal.home) / 740 - (crowded ? 2 : 0) + dist(p, awayFrom) / 410 + randomWild() * 0.4;
      if (score > bestScore) { best = p; bestScore = score; }
    }
    if (best) { critterGo(st, best); if (st.walk) st.walk.evading = true; }
  }
  if (st.walk && stepWalk(st, minutes, paceOf(animal.kind, "run"))) st.walk = null;
}
/** Grazing, the way a deer (or a hare, a goat, a boar rooting) does it: pick a patch — the wood's edge for deer and
 *  hares, open ground up on the plateau for goats, under the trees for a boar — walk there, then crop a few mouthfuls,
 *  step on a little, crop again, for the best part of an hour before moving to the next patch. Out of hours: back to a
 *  place deep in cover (a hare stays in its form) and lie still. */
/** A field worth raiding: crop standing, not fenced or scared off, and a way there. */
function fieldToRaid(st) {
  const here = center(st);
  return boards.world.filter((s) => isField(s) && s.cards[0].sown !== false && (s.cards[0].stock ?? 0) >= 1
    && !GUARDS.some((g) => toolAt(s, g))
    && dist(center(s), here) < 3200 && !reachAlong(MAP, here, center(s)).blocked)
    .sort((a, b) => dist(center(a), here) - dist(center(b), here))[0] ?? null;
}
function grazeStep(st, minutes, up, others) {
  const a = st.critter, here = center(st), habitat = a.kind === "goat" ? "plateau" : countryAt(a.home);
  const go = (p, pace) => { if (critterGo(st, p) && st.walk) st.walk.pace = pace; };
  if (!up) {
    a.feed = null;
    a.lair ??= pickSpot(st, habitat, (depth) => (a.kind === "goat" ? 0.5 : depth * 2), a.kind === "rabbit" ? 260 : 450, others) ?? here;
    if (dist(here, a.lair) > 50) { go(a.lair, paceOf(a.kind, "creep")); a.nextMove = clock.min + 5; return; }
    idleAnimal(st, minutes, false, a.lair, a.kind === "rabbit" ? 40 : 70);   // lying up, but it still stirs
    if (a.kind === "fox" && randomWild() < 0.02) a.lair = null;       // now and then a fox finds another bed
    return;
  }
  a.lair = null;
  wakePose(st);
  if (a.kind === "bear" && (!a.feed || clock.min > a.feed.until)) {        // a bear with a sweet tooth: a wild bees' nest if there's one with honey
    const hive = boards.world.filter((q) => q.cards[0].key === "hive" && q.cards[0].stock > 0 && dist(center(q), here) < 900).sort((x, y) => dist(center(x), here) - dist(center(y), here))[0];
    if (hive) a.feed = { at: center(hive), until: clock.min + 60, hive: hive.id };
  }
  if (a.feed?.hive && dist(here, a.feed.at) < 70) {
    const hive = boards.world.find((q) => q.id === a.feed.hive);
    if (hive?.cards[0].stock > 0) { hive.cards[0].stock--; refreshStock(hive.cards[0]); if (known(here)) float("黑熊掏了蜂窝", here, "world"); }
    a.feed = null;
  }
  if (a.hunger >= 8 && DIET[a.kind]) {                                 // very hungry: it's worth leaving the wood for a crop
    const field = fieldToRaid(st);
    if (field) {
      a.raid = field.id; a.feed = { at: center(field), until: clock.min + 90, field: field.id };
      const at = center(field);
      if (dist(here, at) > 110) { go(at, paceOf(a.kind, "walk")); a.nextMove = clock.min + 3; return; }
      const c = field.cards[0]; c.stock = Math.max(0, (c.stock ?? 0) - 1); refreshStock(c);
      a.hunger = Math.max(0, a.hunger - 4); a.raid = null; a.feed = null; a.nextMove = clock.min + 120;
      if (known(at)) float(`${DEFS[a.kind].name}在田里啃${DEFS[c.crop ?? "grain"].name}`, at, "world");
      return;
    }
  }
  if (DIET[a.kind] && (!a.feed || clock.min > a.feed.until)) {        // where the food is, they go
    const food = bestFood(st);
    if (food) a.feed = { at: food.at, until: clock.min + 40 + randomWild() * 40, food };
  }
  if (a.feed?.food && !a.feed.ate && dist(here, a.feed.at) <= 200) { a.feed.ate = true; eatAt(st, a.feed.food); }
  if (!a.feed || clock.min > a.feed.until) {
    const score = a.kind === "goat" ? (d) => 1 - d : a.kind === "boar" || a.kind === "fox" ? (d) => d * 1.5 : (d, p) => (1 - Math.min(1, Math.abs(d - 0.3) * 2.5)) * 1.5 + (MAP.cls[MAP.idx(p.x, p.y)] === G.MEADOW ? 0.5 : 0);
    a.feed = { at: pickSpot(st, habitat, score, 420, others) ?? here, until: clock.min + 35 + randomWild() * 45 };
  }
  if (dist(here, a.feed.at) > 200) { go(a.feed.at, paceOf(a.kind, "walk")); a.nextMove = clock.min + 3; return; }
  const heading = headingOf(st);
  for (let k = 0; k < 8; k++) {                                     // a few steps, head down, mostly the way it's facing
    const ang = heading + (randomWild() - 0.5) * 2.4, r = 20 + randomWild() * 45, p = { x: here.x + Math.cos(ang) * r, y: here.y + Math.sin(ang) * r };
    if (dist(p, a.feed.at) < 200 && walkable(MAP, p.x, p.y) && !reachAlong(MAP, here, p).blocked) { st.walk = { x: p.x - CARD_W / 2, y: p.y - CARD_H / 2, pace: paceOf(a.kind, "graze") }; break; }
  }
  a.nextMove = clock.min + 2 + randomWild() * (a.kind === "rabbit" ? 3 : 5);   // then a bite or two
}
/** What there is for the plant-eaters, as patches: young leaves, shoots and mast through the wood (most well in), grass
 *  on the open ground, grass up on the plateau — and the berry bushes. Each is eaten down by whatever feeds there and
 *  grows back by the day: grass fastest, hardly anything in winter. More mouths than the near patches can feed and
 *  they're eaten out: the animals go further for their food, into the wood. */
const DIET = { deer: ["browse", "grass", "berries"], rabbit: ["grass", "browse", "berries"], pheasant: ["grass", "browse", "berries"], boar: ["browse"], goat: ["upland", "grass"] };
const PATCHES = {
  browse: { n: 70, gap: 220, grow: { 春: 0.45, 夏: 0.4, 秋: 0.35, 冬: 0.05 } },
  grass: { n: 30, gap: 260, grow: { 春: 0.6, 夏: 0.55, 秋: 0.3, 冬: 0 } },
  upland: { n: 16, gap: 240, grow: { 春: 0.5, 夏: 0.45, 秋: 0.25, 冬: 0.05 } },
};
const homeMid = () => (MAP.house ? { x: MAP.house.x + MAP.house.w / 2, y: MAP.house.y + MAP.house.h / 2 } : MAP.sites.home);
function foodPatches() {
  const all = (nature.browse ??= []);
  for (const b of all) b.k ??= "browse";                             // an older save's patches were all browse
  const home = homeMid();
  const fits = {
    browse: (i, p) => MAP.cls[i] === G.FOREST && wooded(p) && woodDepth(MAP, p.x, p.y) >= 0.15,
    grass: (i, p) => MAP.cls[i] === G.MEADOW && !wooded(p) && countryAt(p) !== "plateau" && dist(p, home) > 500,
    upland: (i, p) => countryAt(p) === "plateau",
  };
  for (const [k, P] of Object.entries(PATCHES)) {
    let have = all.filter((b) => b.k === k).length;
    for (let t = 0; t < 8000 && have < P.n; t++) {
      const i = Math.floor(randomWild() * MAP.cls.length), p = { x: MAP.X(i), y: MAP.Y(i) };
      if (MAP.road[i] || !walkable(MAP, p.x, p.y) || !fits[k](i, p) || all.some((q) => q.k === k && dist(q, p) < P.gap)) continue;
      all.push({ k, x: Math.round(p.x), y: Math.round(p.y), f: 3 }); have++;
    }
  }
  return all;
}
function foodGrows() {
  for (const b of foodPatches()) b.f = Math.min(3, b.f + PATCHES[b.k].grow[season()]);
}
/** All the food there is for one kind, patches and bushes together. */
function foodFor(kind) {
  const diet = DIET[kind] ?? [];
  return foodPatches().reduce((n, b) => n + (diet.includes(b.k) ? b.f : 0), 0)
    + (diet.includes("berries") ? boards.world.reduce((n, q) => n + (q.cards[0].key === "berries" ? q.cards[0].stock ?? 0 : 0), 0) : 0);
}
/** Where to go and eat: plenty there, not too far, and safe — not by the village, not where people are, not by the tiger's lair. */
function bestFood(st) {
  const a = st.critter, here = center(st), diet = DIET[a.kind], home = homeMid(), lair = lairOf("tiger"), folk = people("world");
  let best = null, bs = -Infinity;
  const consider = (at, f, food) => {
    const d = dist(at, here);
    if (f < 0.5 || d > 2600) return;
    const s = Math.min(f, 3) * 0.8 - d / 700 - (dist(at, home) < 1100 ? 1.5 : 0) - (folk.some((q) => dist(center(q), at) < 500) ? 2 : 0)
      - (lair && dist(at, lair) < 900 ? 1.5 : 0) + randomWild() * 0.4;
    if (s > bs) { bs = s; best = { at: { x: at.x, y: at.y }, food }; }
  };
  for (const b of foodPatches()) if (diet.includes(b.k)) consider(b, b.f, b);
  if (diet.includes("berries")) for (const q of boards.world) if (q.cards[0].key === "berries" && (q.cards[0].stock ?? 0) > 0) consider(center(q), q.cards[0].stock, q);
  return best;
}
/** At the food: the hungry ones of the herd eat, as long as there's some left. */
function eatAt(st, food) {
  const here = center(st), eaters = boards.world.filter((o) => o.critter?.kind === st.critter.kind && dist(center(o), here) < 450 && (o.critter.hunger ?? 0) >= HUNGER.eatsAt);
  eaters.forEach((o, i) => {
    if (food.cards) {                                                // a berry bush: a sprig between two of them
      const c = food.cards[0];
      if ((c.stock ?? 0) <= 0) return;
      if (i % 2 === 0) { c.stock--; refreshStock(c); }
    } else {
      if (food.f < 0.5) return;
      food.f -= 0.5;
    }
    o.critter.hunger = Math.max(0, o.critter.hunger - HUNGER.bite);
  });
}
/** A fox's chance of a vole: better in the grass at the wood's edge, worse the more foxes share the ground. */
const voleOdds = (p) => (woodDepth(MAP, p.x, p.y) < 0.5 ? 0.6 : 0.42) * Math.min(1, 2 / Math.max(1, boards.world.filter((q) => q.critter?.kind === "fox").length));
/** The best-looking spot within reach: by what the animal is after, in its own country, near home, away from other beasts. */
function pickSpot(st, habitat, score, reach, others) {
  const a = st.critter, here = center(st);
  let best = null, bs = -Infinity;
  for (let k = 0; k < 18; k++) {
    const ang = randomWild() * 6.28, r = 80 + randomWild() * reach, p = { x: here.x + Math.cos(ang) * r, y: here.y + Math.sin(ang) * r };
    if (!walkable(MAP, p.x, p.y)) continue;
    const deepKind = a.kind === "wolf" || a.kind === "boar";
    const s = score(woodDepth(MAP, p.x, p.y), p) + (countryAt(p) === habitat ? 1 : 0) - dist(p, a.home) / 700
      - (others.some((o) => dist(p, center(o)) < (o.critter?.aggro || a.aggro ? 450 : 260)) ? 2 : 0)
      - (deepKind && countryAt(p) !== "deep" ? 5 : 0) - (deepKind && woodDepth(MAP, p.x, p.y) < 0.55 ? 4 : 0) + randomWild() * 0.3;   // its own ground, not another beast's
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
/** The fox: at dusk and through the night, when it's hungry, it mostly mouses in the grass; hungrier, it slips up on a hare, a pheasant, a duck ashore — or
 *  the ducks' nest — and gets it about half the time. The rest of the day it keeps out of the way like any shy beast. */
function foxTick(st, minutes, you) {
  const c = st.critter;
  if (deepSleeping(st)) { st.walk = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return; }
  if (isActive("fox", hour())) wakePose(st);
  c.hunger = Math.min(10, (c.hunger ?? 3) + minutes / 300);              // a fox needs a meal or two a day
  if (st.walk?.prey) {
    const prey = st.walk.target;
    if (!boards.world.includes(prey) || clock.min > st.walk.until) { st.walk = null; return; }
    if (stepWalk(st, minutes, paceOf("fox", "run"))) {
      st.walk = null;
      if (prey.cards[0].key === "nest") { if (prey.cards[0].stock > 0) { prey.cards[0].stock--; refreshStock(prey.cards[0]); c.hunger = 0; if (known(center(prey))) float("狐狸偷了个鸭蛋", center(prey), "world"); } }
      else if (randomWild() < (prey.critter?.kind === "duck" ? 0.3 : 0.5)) { if (known(center(prey))) float(`狐狸叼走了一只${prey.cards[0].name ?? DEFS[prey.critter.kind].name}`, center(prey), "world"); removeWildAnimal(prey); c.hunger = 0; }
      else { prey.critter.alarm = { at: clock.min, from: center(st) }; }
      c.nextMove = clock.min + 180;
    }
    return;
  }
  if (isActive("fox", hour()) && c.hunger > 4 && clock.min >= (c.nextMove ?? 0)) {
    // Mostly it lives on voles and mice in the grass; a hare or a pheasant is the odd bigger meal, sought when hungrier.
    if (c.hunger < 7 && randomWild() < 0.7) {
      c.nextMove = clock.min + 60;
      if (randomWild() < voleOdds(center(st))) { c.hunger = Math.max(0, c.hunger - 4); if (you?.board === "world" && dist(center(st), center(you)) < 500) float("狐狸一跃，扑住了草里的田鼠", center(st), "world"); }
      woodlandTick(st, minutes);
      return;
    }
    const here = center(st), reach = (q) => dist(center(q), here) < 800 && !reachAlong(MAP, here, center(q)).blocked;
    const rank = (q) => ({ rabbit: 0, pheasant: 1, duck: 2 }[q.critter?.kind] ?? 3);
    const prey = boards.world.filter((q) => ["rabbit", "pheasant"].includes(q.critter?.kind) || (q.critter?.kind === "duck" && !inLake(center(q))) || (q.cards[0].key === "nest" && q.cards[0].stock > 0 && season() !== "冬" && c.hunger > 6 && randomWild() < 0.3))
      .filter(reach).sort((a, b) => rank(a) - rank(b) || dist(center(a), here) - dist(center(b), here))[0];
    if (prey) { st.walk = { target: prey, prey: true, until: clock.min + 120 }; return; }
  }
  woodlandTick(st, minutes);
}
/** Wolves: a pack that lies up by day and, from dusk, runs deer and hares down together. */
function wolfTick(st, minutes, you) {
  const c = st.critter, here = center(st);
  if (deepSleeping(st)) { st.walk = null; if (!st.cards[0].el.classList.contains("sleeping")) restPose(st, true); return; }
  if (isActive("wolf", hour())) wakePose(st);
  const folk = people(st.board).find((q) => dist(center(q), here) < (withFire(q) ? 380 : 280));
  if (folk) {                                                       // people are not quarry: keep clear for a while
    c.hunt = null; c.fleeUntil = clock.min + 18 + randomWild() * 10; c.fleeFrom = center(folk);
    c.alarm = { at: clock.min, from: center(folk) };
  }
  if (clock.min < (c.fleeUntil ?? 0)) { woodlandTick(st, minutes); return; }
  if (c.hunt) return wolfHunt(st, minutes);
  if (st.cards[0].el.dataset.look === "crouch") pose(st, "");           // no hunt, no crouch
  if (!isActive("wolf", hour()) && c.hunger < 8.5) { woodlandTick(st, minutes); return; }
  if (c.hunger > 4 && clock.min >= (c.nextHunt ?? 0)) {
    const count = (kind) => boards.world.filter((q) => q.critter?.kind === kind).length;
    const floor = { deer: 5, goat: 4, rabbit: 6, pheasant: 6 };                    // never eat the last breeding few
    const prey = boards.world.filter((q) => q.critter && ["deer", "goat", "rabbit", "pheasant"].includes(q.critter.kind) && !q.lifted
      && count(q.critter.kind) > floor[q.critter.kind]
      && dist(center(q), here) < 2400 && woodDepth(MAP, center(q).x, center(q).y) > 0.5
      && !reachAlong(MAP, here, center(q)).blocked)
      .map((q) => ({ q, d: dist(center(q), here), v: { deer: 3, goat: 2.4, rabbit: 1, pheasant: 1 }[q.critter.kind] ?? 1 }))
      .sort((a, b) => (b.v - b.d / 900) - (a.v - a.d / 900))[0]?.q;
    if (prey) {
      c.hunt = { id: prey.id, until: clock.min + 360 }; c.nextHunt = clock.min + 90; st.walk = null;
      if (known(here) && randomWild() < 0.35) { sfx("howl"); float("林子深处传来一阵狼嚎", here, "world"); }
      return;
    }
  }
  woodlandTick(st, minutes);
}
function wolfHunt(st, minutes) {
  const c = st.critter, h = c.hunt, target = boards.world.find((q) => q.id === h.id);
  if (!target || !target.critter || clock.min > h.until) { c.hunt = null; c.nextHunt = clock.min + 60; return; }
  const here = center(st), there = center(target), gap = dist(here, there);
  const folk = people(st.board).find((q) => dist(center(q), here) < (withFire(q) ? 340 : 240));
  if (folk) { c.hunt = null; c.nextHunt = clock.min + 40; return; }
  const pack = boards.world.filter((q) => q.critter?.kind === "wolf" && !q.lifted && dist(center(q), here) < 520).length;
  if (gap < 120) {
    if (randomWild() < Math.min(0.8, 0.45 + pack * 0.1)) {
      const kind = target.critter.kind, name = DEFS[kind].name;
      removeWildAnimal(target);
      for (const q of boards.world.filter((q) => q.critter?.kind === "wolf" && dist(center(q), there) < 650)) q.critter.hunger = Math.max(0, (q.critter.hunger ?? 4) - 8);
      c.hunt = null; c.nextHunt = clock.min + 1800;                                 // one good kill keeps the pack for a day or two
      if (known(there)) float(`狼群咬倒了一头${name}`, there, "world");
      if (!nature.wolfKillNoted) { nature.wolfKillNoted = true; chronicle(`林子里的狼群咬倒了一头${name}，往后的鹿会少些。`); }
    } else { c.hunt = null; c.nextHunt = clock.min + 50; }
    return;
  }
  if (!st.walk || !st.walk.goal || dist(st.walk.goal, there) > 80 || clock.min > (st.walk.repath ?? 0)) {
    const way = wayTo(st, there);
    if (!way) { c.hunt = null; c.nextHunt = clock.min + 50; return; }
    st.walk = { path: way.length ? way : null, k: 0, x: there.x - CARD_W / 2, y: there.y - CARD_H / 2, goal: { ...there }, repath: clock.min + 10 };
  }
  pose(st, gap < 900 && gap > 240 ? "crouch" : "");
  const pace = gap > 900 ? "trot" : gap > 240 ? "stalk" : "run";
  if (stepWalk(st, minutes, paceOf("wolf", pace))) st.walk = null;
}
function charge(boar, foe) {
  if (!foe || foe.board !== "world") return;
  boar.walk = { target: foe, charge: true };
  float(`${DEFS[boar.critter.kind].name}冲${foe.npc ? nameOf(foe) : "你"}过来了！`, center(boar), "world");
}
function gore(boar, you) {
  if (!you) return;
  if (you.npc) return hurtNpc(you, boar, boar.critter.kind === "bear" ? 0.45 : 0.25);
  me.fight = { id: boar.id, until: clock.min + 90 }; me.hunt = null;  // you've been hit: from now on you fight back (or run)
  me.rest = Math.max(0, me.rest - 25);
  const a = Math.atan2(center(you).y - center(boar).y, center(you).x - center(boar).x), p = { x: center(you).x + Math.cos(a) * 170, y: center(you).y + Math.sin(a) * 170 };
  const got = reachAlong(MAP, center(you), p); you.x = got.x - CARD_W / 2; you.y = got.y - CARD_H / 2;
  cancelJob(you);
  you.walk = null; you.travel = null;
  if (boar.critter.kind === "bear") { me.rest = Math.max(0, me.rest - 15); toast("被黑熊拍了一掌，半边身子都麻了。它还在跟前——快走开"); }
  else toast("被野猪撞了一下，腿上火辣辣地疼。它退了几步，还盯着你——快走开");
  boar.critter.calm = clock.min + 10; boar.critter.warned = clock.min;   // a few breaths, and if you're still there it comes again
  const back = reachAlong(MAP, center(boar), { x: center(boar).x - Math.cos(a) * 120, y: center(boar).y - Math.sin(a) * 120 });
  boar.x = back.x - CARD_W / 2; boar.y = back.y - CARD_H / 2;
}
function cancelJob(st) { st.repeat = null; if (st.job) { st.job = null; st.bar?.remove(); st.bar = null; } }
function face(a, b) { a.facing = b.x < a.x ? -1 : 1; }

// ---------------------------------------------------------------------------
// Houses: only going indoors changes the scene
// ---------------------------------------------------------------------------
function enterRoom(room, st) {
  fx.clear();                                                        // no yard smoke through the roof
  const party = st.cards; removeStack(st);
  fade(() => {
    board = room;
    $("room").hidden = false; table.classList.add("inside");
    newStack(party, ROOM_ENTRY.x, ROOM_ENTRY.y, room);
    fitRoom();
  });
}
function leaveRoom(st) {
  fx.clear();                                                        // start the yard afresh
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
  if (isSick() && inRoom(youAt())) me.sickUntil -= 720;                 // a night by the fire does you good
}

// ---------------------------------------------------------------------------
// Villagers: a home, a job, hunger. They choose what to do from where they are and what the village has.
// ---------------------------------------------------------------------------
const hour = () => (clock.min / 60) % 24;
const EVENING = () => hour() >= 18;                                   // from six till bed: home, the fire, a word with the others
const isField = (s) => s.cards[0].key === "field" || s.cards[0].key === "field2";
/** Inside the yard walls (the house)? */
const inYard = (p) => { const c = MAP.house; return Boolean(c && p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h); };
const awake = (st) => Boolean(st && !st.indoors && !st.npc?.inside);
/** Where you'd hear them: lines from far off don't fill your screen. Asleep in the yard, you hear them only from inside it. */
function heard(st, r = 1300) {
  const y = youStack(); if (!y || y.board !== st.board) return false;
  if (roofedRoomAt(center(st)) !== roofedRoomAt(center(y))) return dist(center(st), center(y)) < 420;
  return dist(center(st), center(y)) < r;
}
const RESTFUL = new Set(["eat", "wait", "watch", "evening", "sleep", "shelter", "feast", "play", "hide", "arrive", "forage"]);   // not work
/** Sitting round the fire, at the table, sheltering together: when people talk. */
const SITTING = new Set(["evening", "watch", "eat", "wait", "shelter", "feast"]);
function chatWhileSitting(st) {
  if (clock.min <= (st.npc.nextChat ?? 0) || st.npc.chatting > clock.min) return;
  const other = npcs().find((o) => o !== st && awake(o) && !o.walk && SITTING.has(o.job?.npcTask) && !(o.npc.chatting > clock.min)
    && clock.min > (o.npc.nextChat ?? 0) && dist(center(o), center(st)) < 320);
  if (!other || !willNpcChat(npcSocial, npcIdentity(st), npcIdentity(other), { seed, day: day(), slot: Math.floor(clock.min / 90) })) return;
  startChat(st, other, true);
}
const WINDING = new Set(["evening", "drop", "give", "hide", "eat", "wait", "feast", "arrive"]);   // jobs that belong to the end of the day
const talks = [];                           // lines waiting to be said, in game minutes: a chat goes back and forth
const moodOf = (n) => (n.hunger >= n.eatAt || (n.mood ?? 6) < 3.5 ? "low" : (n.mood ?? 6) > 7.5 ? "happy" : "idle");
/** Stand still a while, thinking. Sometimes you catch what they're thinking. */
function muse(st, min) {
  const n = st.npc;
  n.wait = min; st.musing = true; st.task = ""; intent(st, "");
  st.cards[0].el.classList.add("musing");
}
/** Two of them free and close together: a few words back and forth. */
function startChat(a, b, sitting = false) {
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
    s.npc.chatDay = day(); s.npc.chatting = clock.min + 12 + lines.length * 7;
    s.npc.nextChat = clock.min + (sitting ? 240 : 540) + randomWorld() * 600;
    if (sitting) continue;                                               // they go on sitting; the talk is over the fire or the bowl
    s.npc.wait = 12 + lines.length * 7;
    s.task = ""; intent(s, ""); s.cards[0].el.classList.add("musing");
  }
  face(a, b); face(b, a);
}
/** Not every waking hour is work: a breather mid-morning and mid-afternoon, and a word with whoever is near. */
/** Things lying on the ground near home (dropped, left from a kill, spilled): picked up and taken in. */
function strayNear(st) {
  const home = homeMid();
  return boards.world.find((q) => !q.store && !q.site && !q.npc && !q.critter && !q.pet && !q.lifted && q !== youStack()
    && q.cards.every((c) => ["material", "food"].includes(DEFS[c.key].type)) && dist(center(q), home) < 1500
    && !npcs().some((o) => o !== st && o.goalStack === q)) ?? null;
}
function tidyTurn(st) {
  if (st.carry || st.cards.length > 1 || littleOne(st)) return false;
  const q = strayNear(st);
  if (!q) return false;
  think(st, { id: "tidy-up", because: `${DEFS[q.cards[0].key].name}扔在外头，收回去` });
  go(st, q.cards[0].key, "collect", null, q);
  return true;
}
function idleTurn(st) {
  const n = st.npc, h = hour();
  const other = boards.world.find((o) => o !== st && o.npc && awake(o) && !o.walk && !o.job && (o.npc.wait ?? 0) <= 0 && o.ctl?.mode !== "manual" && dist(center(o), center(st)) < 320);
  if (other && clock.min > (n.nextChat ?? 0) && clock.min > (other.npc.nextChat ?? 0) &&
    willNpcChat(npcSocial, npcIdentity(st), npcIdentity(other), { seed, day: day(), slot: Math.floor(clock.min / 90) })) {
    startChat(st, other); return true;
  }
  if (weather.now === "雨" && weather.strength > 0.75 && !inRoom(center(st)) && randomWorld() < 0.3) { go(st, "fire", "shelter"); return true; }   // a downpour: under cover for a while
  const slot = h >= 10 && h < 10.6 ? "am" : h >= 15 && h < 15.6 ? "pm" : null;
  if (slot && n.breakAt !== `${day()}${slot}`) { n.breakAt = `${day()}${slot}`; muse(st, 30 + randomWorld() * 40); return true; }
  if (h > 8 && h < 17 && randomWorld() < 0.12 && tidyTurn(st)) return true;   // now and then: what's lying about goes home
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
const FOOD_SITE = { eat: "table", forage: "berries", fetch: "granary", fish: "lake", cook: "stove", give: "stove" };
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
  const sites = Object.fromEntries(["stove", "table", "berries", "granary", "lake"].map((key) => [key, find(key)]));
  const here = center(st);
  const seen = (n.foodSeen ??= {});
  for (const [key, target] of Object.entries(sites)) {
    if (target && key !== "table" && dist(here, center(target)) <= 950) seen[key] = { stock: target.cards[0].stock ?? 0, minute: clock.min };
  }
  const stock = (key) => observedFood(n, key);
  if (!n.foodPlan) {
    const justUp = hour() < n.wake + 1.5;
    if (n.hunger < n.eatAt || (justUp && n.hunger < 8 && stock("stove") > 0)) return false;
    const travel = {};
    for (const [key, target] of Object.entries(sites)) {
      if (target && key !== "table" && (key === "stove" || stock(key) > 0)) {
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
  const asleep = hour() >= n.sleep + 1.2 || hour() < n.wake;          // an hour or so round the fire after dark, then bed
  if (asleep) {
    if (n.inside) return;
    if (st.task === "sleep" && st.walk) return;
    cancelJob(st); endMuse(st);
    const b = littleOne(st) ? beds().find((x) => x.cards[0].key === "bed") : bedPlan().get(st);   // their own bed, or a hut
    if (b) return go(st, b.cards[0].key, "sleep", null, b);
    n.floorNight = day();                                                 // no bed: a mat on the floor by the fire
    const fire = find("fire"); return fire ? go(st, "fire", "sleep", null, fire) : goInside(st);
  }
  if (!n.inside && fightTurn(st)) return;
  if (!n.inside && raidTurn(st)) return;
  const tiger = boards.world.find((s) => s.critter?.predator);
  if (!n.inside && tiger && dist(center(tiger), center(st)) < 560 && !st.walk?.flee) {
    cancelJob(st); endMuse(st); n.wait = 0;
    if (!n.afraid || clock.min > n.afraid.until) tell(st, VOICE.line(n.key, "tiger"), { r: 700, reply: false });
    scare(st, 360);
    return fleeFrom(st, tiger);
  }
  if (!n.inside && n.afraid && tigerAbout(st, tiger)) {               // the tiger's about: they stay in, by the fire
    if (sheltered(st)) { if (!st.walk && !st.job) go(st, "fire", "watch"); return; }
    const close = dist(center(tiger), center(st)) < 450;
    if (!st.walk?.flee || (close && st.task === "hide")) return fleeFrom(st, tiger);   // on the way home and it's close again: away first
    return;
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
    if (!st.walk && SITTING.has(st.job?.npcTask)) chatWhileSitting(st);
    return;
  }
  // After six they stop working: what they carry goes where it belongs, then the fire, then bed.
  if (EVENING()) return headHome(st);
  if (st.ctl?.mode !== "work") {
    if (seekFood(st)) return;
  } else {
    const food = find("stove").cards[0].stock > 0, justUp = hour() < n.wake + 1.5;
    if (n.hunger >= (justUp ? 8 : n.eatAt) && food) return go(st, "table", "eat");
    const berries = find("berries");
    if (!food && n.hunger >= n.eatAt && berries?.cards[0].stock > 0) return go(st, "berries", "forage", null, berries);
  }
  if (n.job !== "cook" && standInCook() === st) return standInTurn(st);
  // Finish carrying food to its destination before making a new tool plan.
  if (n.job === "farm" && st.carry?.key === "fish") return go(st, "stove", "give");
  if (n.job === "farm" && st.carry?.key === "grain") return go(st, "granary", "drop");
  if (n.hunger >= 8) return go(st, "table", "wait");
  if (st.ctl?.mode !== "work" && idleTurn(st)) return;
  if (st.plans?.length && ownSite(st)) {                               // their own new room: the boards for it come first
    const r = st.plans[0].r;
    think(st, r ? { id: `make-${r.id ?? r.make[0]}`, because: `接的那间屋还缺${DEFS[r.make[0]].name}，先做出来` } : { id: "jar-in", because: "做好的陶罐送去公仓" });
    return planStep(st);
  }
  // Sowing and harvest wait for no one: a farmer's half-made tool waits instead (the plan is kept, not dropped).
  const fieldwork = (n.job === "farm" && !(st.ctl?.mode === "work" && st.ctl.job && st.ctl.job !== "farm") && fieldsCall(st)) || urgentJob(st);
  if (!fieldwork && !st.plans?.length && mendTurn(st)) return;
  if (!fieldwork && !st.plans?.length && clock.min > (n.planBlocked ?? 0)) { const id = WANT[n.key]?.(st); if (id) st.plans = [{ r: recipeFor(id) }]; }
  if (!fieldwork && st.plans?.length) {
    const r = st.plans[0].r;
    think(st, r ? { id: `make-${r.id ?? r.make[0]}`, because: `手边没有${DEFS[r.make[0]].name}，自己做一个` } : { id: "jar-in", because: "做好的陶罐送去公仓" });
    return planStep(st);
  }
  switch (st.ctl?.mode === "work" && st.ctl.job ? st.ctl.job : n.job) {     // the job you gave them, if you did
    case "farm": {
      // A farmer may voluntarily help supply fish when crops need no attention.
      // Deliver to the right place rather than sending fish to a grain store.
      if (st.carry?.key === "fish") return go(st, "stove", "give");
      if (st.carry?.key === "bean") return go(st, storeFor(st.carry?.key), "store");
      if (st.carry?.key === "grain") return go(st, "granary", "drop");
      if (st.carry?.key === "log" && lowFire(st)) return go(st, "fire", "stoke", null, lowFire(st));
      if (st.carry) { const p = plotNeeding(st.carry.key); return p ? go(st, "plot", "supply", null, p) : go(st, storeFor(st.carry?.key), "store"); }
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
    case "help": return st.carry ? go(st, storeFor(st.carry?.key), "store") : go(st, "hemp", "help");   // a half-grown child cuts hemp and brings it home
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
/** Where things are kept: the heap in the yard (the household's: food, odds and ends), the heap inside the granary
 *  (materials, under a roof), and the cupboards in the yard. */
const homePile = () => allStacks().find((s) => s.store === true);
const barnPile = () => boards.world.find((s) => s.store === "barn");
/** A heap holds about this many things before it's spilling over. */
const STORE_CAP = 40;
/** Rooms put up as stores (a heap goes in each). */
const storeRooms = () => (buildState().storeRooms ?? []).map((id) => works.rooms.find((r) => r.id === id && isRoofed(r))).filter(Boolean);
/** Every heap of materials: the granary's, and one in each storeroom. A heap whose room was pulled down still holds its things. */
const roomHeaps = () => boards.world.filter((q) => q.store === "room");
const storePiles = () => [barnPile(), ...roomHeaps()].filter(Boolean);
/** Is any heap at its limit? That is what the village feels, not a date it once noted. */
const storesSpilling = () => storePiles().some((p) => p.cards.length >= STORE_CAP);
function storeWithRoom() {
  const piles = storePiles();
  const heap = piles.find((q) => q.cards.length < STORE_CAP);
  if (heap) return { heap, space: STORE_CAP - heap.cards.length };
  const empty = storeRooms().find((r) => !roomHeaps().some((q) => q.room === r.id));
  if (empty) return { room: empty, space: STORE_CAP };                // a store with nothing in it yet: a new heap goes down there
  if (piles.length) village.storeFull = day();                        // nowhere with room: it goes on the granary's heap anyway, and they feel it
  return piles.length ? { heap: piles[0], space: 0 } : null;
}
const cupboards = () => boards.world.filter((s) => s.cards[0].key === "chest");
const sameKind = (k) => (x) => x === k || (k === "wood" && x === "log");
const pileCount = (k) => [...storePiles(), homePile()].reduce((n, p) => n + (p?.cards.filter((c) => c.key === k).length ?? 0), 0) + cupboards().reduce((n, s) => n + s.cards[0].items.filter(sameKind(k)).length, 0);
/** What belongs in the granary rather than the house: grain and materials. */
const barnThing = (k) => k === "grain" || DEFS[k]?.type === "material";
/** Where to take something home to, or fetch it from. */
const storeFor = (k) => (k && barnThing(k) && find("granary") ? "granary" : "taoHouse");
const hoeReach = (st) => kitHas(st, "hoe") || boards.world.some((s) => isField(s) && toolAt(s, "hoe"));
const headcount = () => npcs().length + 1;
function think(st, choice) {
  const n = st.npc;
  if (!choice) return;
  const fresh = n.mind?.id !== choice.id;
  n.mind = { id: choice.id, because: choice.because, day: day() };
  if (fresh && choice.id !== "rest" && randomVoice() < 0.3) tell(st, `“${choice.because}。”`);   // told to whoever is beside them
}
/** Something that can't wait for a half-made tool: the stove going out, the pot empty, the hearth cold, a foundation short. */
function urgentJob(st) {
  const job = st.ctl?.mode === "work" && st.ctl.job ? st.ctl.job : st.npc.job, stove = find("stove")?.cards[0], fire = find("fire")?.cards[0];
  if (job === "cook") return (stove?.fuel ?? 6) <= 1 || (stove?.stock ?? 6) < 2 || spoilingSoon().length > 0
    || (st.cards.some((c, j) => j > 0 && FRESH_SERVINGS[c.key]) && !st.plans?.some((p) => p.r?.id === "smoke"));   // food in hand that won't keep
  if (job === "fish") return (stove?.stock ?? 6) < 2;
  const m = { wood: "log", stone: "stone", reed: "reed" }[job];
  return Boolean(m && (((fire?.fuel ?? 6) <= 1 && hearthCall(st)) || plotNeeding(m)));
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
  if (blocked) { tell(st, `“${blocked}。”`); return; }
  const skill = npcSkill(st, kind);
  let res = buildSession(skill, randomWorld);
  if (res.unable) {
    if (c.ledDay !== day()) { n.cantBuild = { id: target.id, day: day() }; tell(st, "“这个我不会弄，等会的人来了，我给打下手。”"); return; }
    res = { ...helpSession(), failed: false };
    res.gain *= ["farm", "wood", "stone", "build", "reed"].includes(n.job) ? 0.5 : 0.2;   // a carpenter's eye takes a while to come by
  } else c.ledDay = day();
  const after = raiseSkill(skill, res.gain);
  (n.skill ??= {})[kind] = after;
  if (skill < LEAD && after >= LEAD && !BUILDS[kind].who.includes(n.key)) {
    BUILDS[kind].who.push(n.key);
    chronicle(`${nameOf(st)}跟着干了几回，学会了${craftName(kind)}。`);
  }
  progressPlot(target, res.minutes, st);
}
/** The "build" job: lead or help where a step is ready, else fetch what a step is short of. */
function builderTurn(st) {
  if (st.carry) { const p = plotNeeding(st.carry.key); return p ? go(st, "plot", "supply", null, p) : go(st, storeFor(st.carry?.key), "store"); }
  const ready = readyPlot(st, true) ?? readyPlot(st, false);
  if (ready) { think(st, { id: "build", because: npcSkill(st, ready.cards[0].build) >= LEAD ? "地基上的料齐了，去盖" : "那边在盖，过去搭把手" }); return go(st, "plot", "build", null, ready); }
  for (const p of boards.world.filter((q) => q.cards[0].key === "plot")) {
    for (const [k, v] of Object.entries(p.cards[0].need)) if (v > 0 && (GATHER[k] || k === "rope" || MADE[k])) { think(st, { id: `supply-${k}`, because: `${stageOf(p.cards[0]).name}还缺${DEFS[k].name}，去弄` }); if (supplyFor(st, k, p)) return; }
  }
  if (siteTurn(st, true)) return;                                     // a room drawn but not yet up: lend a hand with it
  think(st, { id: "rest", because: "没有能盖的，歇会儿" });
  return muse(st, 60 + randomWorld() * 60);
}
/** Bring one material to a foundation: what's in hand, else from home, else go and get it. */
function supplyFor(st, k, plot) {
  if (k === "wood" && !pileCount("wood") && !holds(st, "wood")) k = "log";                     // no firewood split: a log will do
  if (st.carry?.key === k || st.cards.some((c, j) => j > 0 && c.key === k)) { go(st, "plot", "supply", null, plot); return true; }
  if (pileCount(k)) { fetchFromHome(st, k, plot.cards[0].site ? siteNeed(k) : plot.cards[0].need[k]); return true; }   // for a wall, an armful for several lengths
  if (GATHER[k]) { gatherAt(st, k, true); return true; }
  if (k === "rope" && !st.plans?.length && clock.min >= (st.npc.planBlocked ?? 0)) { st.plans = [{ r: recipeFor("rope") }]; planStep(st); return true; }   // twist some from hemp
  if (MADE[k] && !st.plans?.length && clock.min >= (st.npc.planBlocked ?? 0)) { st.plans = [{ r: MADE[k] }]; planStep(st); return true; }   // wall boards, a door, thatch: at the workbench
  return false;
}
// ---- Ideas: whoever thought of something tries it out themselves ----
const GUARDS = ["scarecrow", "fence"], STASH = ["smokedFish", "smokedMeat", "saltedFish", "saltedMeat", "cooked"], SPARE = new Set(["material", "food"]);
function ideaFor(st) {
  const key = st.npc.key, mine = (id) => lore.inventions[id]?.by === key;
  const started = boards.world.find((s) => s.cards[0].key === "plot" && s.cards[0].by === key);     // one thing at a time: finish what was begun
  if (started) return stepBlocked(started.cards[0], st) && !toolAtHome(started.cards[0], st) && !(stageOf(started.cards[0]).tool && recipeFor(stageOf(started.cards[0]).tool) && season() !== "冬") ? null : { kind: started.cards[0].build, plot: started };
  // one who knows boats, and none on the water yet: a dugout, to get out onto the sea
  if (BUILDS.boat.who.includes(key) && !find("boat") && season() !== "冬") {
    const hull = boards.world.find((s) => s.cards[0].key === "plot" && s.cards[0].build === "boat");   // someone's begun one: lend a hand
    if (!hull) return { kind: "boat" };
    const c = hull.cards[0];
    if (!stepBlocked(c, st) || toolAtHome(c, st) || (stageOf(c).tool && recipeFor(stageOf(c).tool))) return { kind: "boat", plot: hull };
  }
  for (const [kind, b] of Object.entries(BUILDS)) {
    if (!b.inv || !mine(b.inv)) continue;
    if (b.item) {
      const more = kind === "chest" && boards.world.filter((q) => q.cards[0].key === "chest").every((q) => (q.cards[0].items?.length ?? 0) >= CHEST_CAP);   // every cupboard full: another
      if ((!find(kind) || more) && !st.plans?.length && clock.min >= (st.npc.planBlocked ?? 0)) return { craft: kind };
      continue;
    }
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
  if (!freeBedSlot()) return siteTurn(st, true);                     // nowhere to lay one: help with the new room someone drew (considerExtension)
  think(st, { id: "make-bed", because: mine === null ? "夜里没地方睡，得给自己扎个铺位" : "村里铺位不够，帮着扎一个" });
  st.plans = [{ r: recipeFor("bed") }];
  planStep(st);
  return true;
}
/** The step wants a tool they haven't got with them, but there's one at home. */
const toolAtHome = (c, st) => { const g = stageOf(c); return Boolean(g.tool && !holds(st, g.tool) && !(g.thaw && season() === "冬") && pileHas(g.tool)); };
/** Only when nothing more pressing is on: an idea is tried out between the real work. */
function tryIdeaIfFree(st, choice) {
  const spilling = storesSpilling();
  if ((choice?.score ?? 0) >= 6 && !spilling) return false;
  const idea = ideaFor(st);
  if (!idea) return false;
  if ((choice?.score ?? 0) >= 6 && !(idea.craft === "chest" && spilling)) return false;   // only a cupboard for a spilling store outranks work
  const name = DEFS[idea.kind ?? idea.craft].name;
  if (idea.craft) { think(st, { id: `idea-${idea.craft}`, because: MOVABLE.has(idea.craft) ? `做个${name}试试` : `扎个${name}立到田里试试` }); st.plans = [{ r: recipeFor(idea.craft) }]; planStep(st); return true; }
  let plot = idea.plot;
  if (!plot) {
    const p = spotFor(idea.kind);
    if (!p) return false;
    plot = layFoundation(idea.kind, p); plot.cards[0].by = st.npc.key;
    chronicle(idea.kind === "boat" ? `${nameOf(st)}在水边打了个船底子，说要造条独木舟，划到外海去看看。` : `${nameOf(st)}动手试着弄${name}。`);
    if (idea.kind === "boat") tell(st, "“湖那头、海那边，总得有人去看看。我造条船。”");
  }
  think(st, plot.cards[0].site ? { id: "extend", because: "接着弄那间新屋" } : idea.kind === "boat" ? { id: "idea-boat", because: "想造条独木舟，划到外海去看看" } : { id: `idea-${idea.kind}`, because: `想试着弄个${name}` });
  const c = plot.cards[0], need = Object.entries(c.need).find(([, v]) => v > 0)?.[0];
  if (!need) {
    if (toolAtHome(c, st)) { fetchFromHome(st, stageOf(c).tool); return true; }   // the step wants a tool that's at home: fetch it
    const tool = stageOf(c).tool;
    if (tool && !holds(st, tool) && !st.plans?.length && recipeFor(tool) && !(stageOf(c).thaw && season() === "冬")) {   // none anywhere: make one
      think(st, { id: `make-${tool}`, because: `${stageOf(c).name}得用${DEFS[tool].name}，家里没有，先做一把` });
      st.plans = [{ r: recipeFor(tool) }]; planStep(st); return true;
    }
    if (stepBlocked(c, st)) return false;
    go(st, "plot", "build", null, plot); return true;
  }
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
  const lake = find("lake");                                          // a boat is built at the water's edge: by the lake's fishing place
  const anchor = kind === "compost" && field ? center(field) : b.shore && lake ? center(lake) : yard ? { x: yard.x + yard.w + 520, y: yard.y + 260 } : MAP.sites.home;
  for (let ring = 0; ring <= (b.shore ? 8 : 5); ring++) for (let k = 0; k < (ring ? 12 : 1); k++) {
    const a = (k / 12) * Math.PI * 2, p = { x: anchor.x + Math.cos(a) * 170 * ring, y: anchor.y + Math.sin(a) * 150 * ring };
    if (!inJungle(p) && !foundationProblem(kind, p) && !rectHitsYard(p.x - w / 2, p.y - h / 2, w, h) && !beforeGate(p.x - w / 2, p.y - h / 2, w, h)) return p;
  }
  return null;
}
/** Old saves: anything built (or begun) astride the yard wall, or a foundation in the gateway, is moved — a chest to its corner, the rest outside. */
/** Old saves sat villagers a little low on the card they were using; set them on the same footing as you. */
function settleNpcPose() {
  for (const st of boards.world) {
    if (!st.npc || st.npc.inside || st.board !== "world" || !st.parkedAt || !boards.world.includes(st.parkedAt)) continue;
    if (!Number.isInteger(st.slot) || st.slot < 0) st.slot = 0;
    const p = standOn(st, st.parkedAt);
    st.x = p.x; st.y = p.y; st.slot = p.slot;
  }
  for (const st of npcs()) refreshPersonLook(st);
  refreshPlayerLook();
}
function settleMisplaced() {
  for (const st of boards.world) {
    const c = st.cards[0], kind = c.key === "plot" ? c.build : c.key;
    if (!BUILDS[kind] || kind === "farm" || st.site) continue;
    const astride = rectHitsYard(st.x, st.y, st.w, st.h) && !rectInYard(st.x, st.y, st.w, st.h);
    if (!astride && !(beforeGate(st.x, st.y, st.w, st.h) && (c.key === "plot" || c.key === "hut"))) continue;
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
const FRESH_SERVINGS = { fish: 2, meat: 2, clam: 1, egg: 1, berry: 1, peachFruit: 1, jujubeFruit: 1, mushroom: 1, roastFish: 1, roastMeat: 1 };
/** Food on the yard's heap a day from going off. */
const spoilingSoon = () => { const heap = homePile(); return heap?.cards.filter((c) => FRESH_SERVINGS[c.key] && c.made !== undefined && daysLeft(c, heap) <= 1) ?? []; };
/** What would go off soon: in the cook's own hands, or a day from spoiling on the yard's heap. */
function useUp(st) {
  if (st.plans?.some((p) => p.r?.id === "smoke")) return false;     // the fish she's carrying are for the smoking
  const held = st.cards.filter((c, j) => j > 0 && FRESH_SERVINGS[c.key]);
  if (held.length) { think(st, { id: "use-up", because: "这些放不住了，先下锅" }); go(st, "stove", "useFresh"); return true; }
  const soon = spoilingSoon();
  if (!soon.length) return false;
  think(st, { id: "use-up", because: `院里的${DEFS[soon[0].key].name}快放坏了，拿去下锅` });
  fetchFromHome(st, soon[0].key, soon.filter((c) => c.key === soon[0].key).length);
  return true;
}
function cookTurn(st) {
  const g = find("granary").cards[0], s = find("stove").cards[0];
  if (st.carry?.key === "log") return burnOrStore(st, s);
  if (st.carry?.key === "grain" && (s.fuel ?? 0) <= 0) {          // grain in hand and the stove out
    if (fuelIn(st)) return go(st, "stove", "stoke");
    if (pileCount("wood") + pileCount("log")) return fetchFromHome(st, "wood", 2);
    return go(st, "granary", "drop");                               // put it back, and go for wood
  }
  if (st.carry) return go(st, "stove", st.carry.key === "fish" ? "give" : "cook");
  if (stashFood(st)) return;
  if (useUp(st)) return;
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
  if (st.carry?.key === "log" && lowFire(st)) return go(st, "fire", "stoke", null, lowFire(st));
  if (st.carry) return go(st, storeFor(st.carry?.key), "store");
  if (stashFood(st)) return;
  const ripe = boards.world.filter((q) => isField(q) && q.cards[0].sown !== false && (q.cards[0].stock ?? 0) >= 1);
  const choice = fisherProject({
    season: season(), lake: find("lake")?.cards[0].stock ?? 0, stove: find("stove")?.cards[0].stock ?? 0, grain: find("granary")?.cards[0].stock ?? 0,
    people: headcount(), ripe: ripe.length, smoking: Boolean(lore.inventions.smoking), smoked: pileCount("smokedFish"),
    fireFuel: find("fire")?.cards[0].fuel ?? 6, tending: hearthCall(st),
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
function fetchFromHome(st, k, n = 1) {
  const pile = storePiles().find((p) => p.cards.some((c) => sameKind(k)(c.key)));
  const key = pile?.cards.find((c) => sameKind(k)(c.key))?.key;
  if (pile && key) go(st, key, "fetchHome", k, pile); else go(st, "taoHouse", "fetchHome", k);
  st.wantN = Math.max(1, Math.min(4, n));
}
/** The farm's grid: the old fields' spacing carried on in rows and columns. Every field is FIELD_SIZE, edge to edge
 *  with a strip of grass between. */
function fieldCells() {
  const T = MAP.tiles.farm;
  if (!T) return [];
  const base = FARM_FIELDS.map(([, fx, fy]) => ({ x: T.x + T.w * fx, y: T.y + T.h * fy }));
  const dx = base.length > 1 ? Math.abs(base[1].x - base[0].x) : FIELD_SIZE.w + 160, dy = FIELD_SIZE.h + 60;
  const out = [];
  for (let c = -2; c <= base.length + 1; c++) for (let r = -3; r <= 3; r++) out.push({ x: base[0].x + c * dx, y: base[0].y + r * dy });
  return out;
}
/** Can a field go at this grid cell: on open meadow, clear of the other fields, the yard and anything standing there? */
function fieldCellFree(p, except = null) {
  const { w, h } = FIELD_SIZE;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) {
    const x = p.x - w / 2 + 20 + ((w - 40) * i) / 4, y = p.y - h / 2 + 20 + ((h - 40) * j) / 2;
    if (!walkable(MAP, x, y) || MAP.cls[MAP.idx(x, y)] !== G.MEADOW || inJungle({ x, y })) return false;
  }
  if ((MAP.extraFields ?? []).some((f) => f !== except && Math.abs(f.x - p.x) < (f.w + w) / 2 + 20 && Math.abs(f.y - p.y) < (f.h + h) / 2 + 20)) return false;
  if (rectHitsYard(p.x - w / 2, p.y - h / 2, w, h)) return false;
  return !boards.world.some((s) => s.cards[0] !== except?.card && s.cards[0].key !== "plot" && !s.npc && !s.critter && !s.pet && s.cards[0].key !== "you"
    && Math.abs(center(s).x - p.x) < w / 2 && Math.abs(center(s).y - p.y) < h / 2);
}
/** The free grid cell nearest a point (within reach), or null. */
function snapField(p, reach = 900, except = null) {
  return fieldCells().filter((c) => dist(c, p) < reach && fieldCellFree(c, except)).sort((a, b) => dist(a, p) - dist(b, p))[0] ?? null;
}
/** Somewhere to break new ground: open meadow right beside the fields already there. */
function farmSpot() {
  const broken = boards.world.filter(isField).map(center);
  const near = (c) => Math.min(...broken.map((f) => dist(f, c)), 99999);
  const cell = fieldCells().filter((c) => fieldCellFree(c)).sort((a, b) => near(a) - near(b))[0];
  if (cell) return cell;
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
    dry: nature.dryDays >= 2, jar: holds(st, "jar") || pileCount("jar") > 0, build: Boolean(readyPlot(st, true) || ownSite(st)), crowded: Boolean(ownSite(st)) && [...bedPlan().values()].includes(null),
    fireFuel: find("fire")?.cards[0].fuel ?? 6, tending: hearthCall(st), logs: pileCount("log") + pileCount("wood"),
  });
  if ((n.landBlocked ?? -1) === day() && choice?.id === "open-land") choice.id = "rest";
  think(st, choice);
  if (placeGuard(st) || bedChore(st, choice) || tryIdeaIfFree(st, choice)) return;
  if ((choice?.score ?? 0) < 6.5 && siteTurn(st)) return;              // their own new room comes before idle work
  const field = fieldStacks.find((s) => s.cards[0].id === choice?.field), key = field?.cards[0].key;
  switch (choice?.id) {
    case "harvest": return go(st, key, "harvest", null, field);
    case "sow-bean": return holds(st, "bean") ? go(st, key, "sow", "bean", field) : fetchFromHome(st, "bean");
    case "fallow": field.cards[0].fallow = true; refreshStock(field.cards[0]); return muse(st, 20);
    case "sow": return holds(st, "grain") ? go(st, key, "sow", "grain", field) : go(st, "granary", "seed");
    case "work-plot": return go(st, "plot", "build", null, plot);
    case "manure": return holds(st, "ash") || holds(st, "muck") ? go(st, key, "manure", null, field) : fetchFromHome(st, pileCount("muck") ? "muck" : "ash");
    case "water": return holds(st, "jar") ? go(st, key, "water", null, field) : fetchFromHome(st, "jar");
    case "build": { const ready = readyPlot(st, true); if (ready) return go(st, "plot", "build", null, ready); if (siteTurn(st)) return; break; }
    case "open-land": {
      const p = farmSpot();
      if (!p) { n.landBlocked = day(); return muse(st, 30); }
      const lot = layFoundation("farm", p);
      
      return go(st, "plot", "build", null, lot);
    }
    case "tend": return go(st, key, "tend", null, field);
    case "firewood": if (firewoodRun(st)) return; break;
    case "winter-wood": if (st.carry) return go(st, storeFor(st.carry?.key), "store"); gatherAt(st, "log"); return;
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
    material: m, season: season(), pile: pileCount(m), plotNeed: plot?.cards[0].need[m] ?? 0, fireFuel: fire?.fuel ?? 6, tending: hearthCall(st),
    wood: pileCount("wood") + pileCount("log") + (fuelIn(st) ? 1 : 0), felled: nature.felled ?? 0, stumps: stumps.length,
    people: headcount(), grain: find("granary")?.cards[0].stock ?? 0, cooked: find("stove")?.cards[0].stock ?? 0,
    build: Boolean(readyPlot(st, true)), help: Boolean(readyPlot(st, false)),
  });
  think(st, choice);
  if (placeGuard(st) || bedChore(st, choice) || tryIdeaIfFree(st, choice)) return;
  if ((choice?.score ?? 0) < 4 && !st.plans?.length && clock.min >= (st.npc.planBlocked ?? 0) && pileCount("rope") < 2 && pileCount("fiber") >= 2) {   // nothing pressing: a rope or two put by
    think(st, { id: "make-rope", because: "家里没绳子了，搓两根备着" }); st.plans = [{ r: recipeFor("rope") }]; return planStep(st);
  }
  const has = st.carry?.key === m || st.cards.some((c, j) => j > 0 && c.key === m);
  switch (choice?.id) {
    case "supply-plot":
      if (has) return go(st, "plot", "supply", null, plot);
      if (pileCount(m)) return fetchFromHome(st, m, plot.cards[0].need[m]);
      return gatherAt(st, m, true);
    case "feed-fire":
      claimFire(st, find("fire"));
      if (!hearthHours()) return st.carry ? go(st, storeFor(st.carry.key), "store") : gatherAt(st, "log", true);   // wood for tonight
      if (fuelIn(st) || st.carry?.key === "log") return go(st, "fire", "stoke");
      if (pileCount("wood") + pileCount("log")) return fetchFromHome(st, "wood", 2);
      return gatherAt(st, "log", true);
    case "replant": return go(st, stumps[0].cards[0].key, "plant", null, stumps[0]);
    case "build": { const ready = readyPlot(st, true); if (ready) return go(st, "plot", "build", null, ready); if (siteTurn(st)) return; break; }
    case "help-build": return go(st, "plot", "build", null, readyPlot(st, false));
    case "stockpile": return st.carry ? go(st, storeFor(st.carry?.key), "store") : gatherAt(st, m);
    case "help-fish": if (st.carry) return go(st, storeFor(st.carry?.key), "store"); if (aidVillage(st)) return; break;
  }
  if (st.carry) return go(st, storeFor(st.carry?.key), "store");
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
  for (const x of st.cards.slice(1)) {
    const k = (c.need[x.key] ?? 0) > 0 ? x.key : x.key === "log" && (c.need.wood ?? 0) > 0 ? "wood" : null;   // a log does for firewood
    if (DEFS[x.key].type !== "tool" && k) { c.need[k]--; given++; x.el.remove(); st.cards = st.cards.filter((y) => y !== x); }
  }
  refreshPlot(c);
  if (c.site && !target.alongWall) for (const q of works.sites.values()) {        // along a wall: what's left goes to the next lengths in reach
    if (q === target || dist(center(q), center(target)) > 260 || !st.cards.some((x, j) => j > 0 && (q.cards[0].need[x.key] ?? 0) > 0)) continue;
    q.alongWall = true; supplyPlot(st, q); q.alongWall = false;
  }
}
/** Put wood on a fire till it's full: a log split up burns two days, a bundle of firewood one. What's left is carried on. */
function stoke(st, target) {
  const t = target.cards[0], before = t.fuel ?? 0;
  fireRuns.delete(target.id);
  if (st.carry?.key === "log") {
    const { cards, n } = carriedLoad(st);
    let used = 0;
    while (used < n && (t.fuel ?? 0) < 6) { t.fuel = Math.min(6, (t.fuel ?? 0) + 2); used++; }
    st.cards = st.cards.filter((x) => !cards.includes(x)); cards.forEach((x) => x.el.remove()); st.carry = null;
    if (n - used > 0) carry(st, "log", n - used, 1);
  }
  for (let x = fuelIn(st); x && (t.fuel ?? 0) < 6; x = fuelIn(st)) { st.cards = st.cards.filter((y) => y !== x); x.el.remove(); t.fuel = Math.min(6, (t.fuel ?? 0) + (x.key === "log" ? 2 : 1)); }
}
/** Who has gone to see to which fire, and till when: one person walks over with wood, not the whole village. */
const fireRuns = new Map();
function claimFire(st, f) { if (f) fireRuns.set(f.id, { st, until: clock.min + 240 }); }
const fireTaken = (st, f) => { const run = f && fireRuns.get(f.id); return Boolean(run && run.st !== st && run.until > clock.min && npcs().includes(run.st)); };
/** The hearth is banked while everyone is out at work: it's fed first thing, from late afternoon, and all day in the cold. */
const hearthHours = () => hour() < 8 || hour() >= 16 || season() === "冬" || day() <= (nature.coldSnapUntil ?? 0);
/** Is the hearth this person's to see to now? Not if someone's already on it; in the working day only if there's no wood home for tonight. */
function hearthCall(st) {
  const f = find("fire");
  return Boolean(f) && !fireTaken(st, f) && (hearthHours() || pileCount("wood") + pileCount("log") === 0);
}
/** The hearth, if it's about out and it's the hour to feed it. The stove is the cook's to keep. */
function lowFire(st) {
  const f = find("fire");
  return f && (f.cards[0].fuel ?? 0) <= 1 && hearthHours() && !fireTaken(st, f) ? f : null;
}
/** The cook with wood in hand: on the stove if it's getting low, else home with it — wood for a plan isn't burned. */
function burnOrStore(st, s) {
  const wanted = st.plans?.some((p) => p.r?.needs?.some((k) => k === "log" || k === "wood"));
  if ((s.fuel ?? 0) <= 0 || ((s.fuel ?? 0) <= 2 && !wanted)) return go(st, "stove", "stoke");
  return go(st, storeFor(st.carry.key), "store");
}
/** A turn at the firewood: wood in hand onto the fire, else from home, else from the woods. */
function firewoodRun(st) {
  const f = find("fire");
  if (!f || (f.cards[0].fuel ?? 0) > 1 || !hearthCall(st)) return false;
  claimFire(st, f);
  if (!hearthHours()) { gatherAt(st, "log"); return true; }      // the day's work: wood for tonight, not on the fire now
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
  if (!st.carry && st.cards.some((c, j) => j > 0 && SPARE.has(DEFS[c.key].type) && !GUARDS.includes(c.key) && !plotNeeding(c.key))) return go(st, "taoHouse", "stashAll");   // what's in their hands goes home for the night
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
const JOBS = { collect: 10, guard: 90, eat: 30, wait: 60, tend: 180, harvest: 150, dig: 90, drop: 15, fetch: 20, cook: 120, watch: 90, fish: 120, give: 15, evening: 100, chop: 150, pick: 60, store: 15, gather: 90, fetchHome: 15, jarIn: 15, build: 240, sow: 60, seed: 15, hide: 90, forage: 40, tidy: 60, cut: 90, arrive: 20, feast: 120, shelter: 90, play: 40, help: 80, trade: 300, supply: 15, stoke: 10, plant: 120, manure: 40, water: 40, place: 20, stash: 10, useFresh: 20, stashAll: 10 };
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
  if (st.task === "build" && t?.cards[0].site) min = Math.max(20, stageOf(t.cards[0]).work - t.cards[0].work);
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
  if (topic && randomVoice() < 0.3) tell(st, VOICE.line(n.key, topic));
  if (st.task === "fetch" && find("granary").cards[0].stock <= 4 && n.grumbled !== day() && tell(st, VOICE.line(n.key, "lowFood"))) n.grumbled = day();
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
    foodSuccess = Boolean(commitProduction(st, task === "eat" ? mealFrom(target) : target, { kind: task, cost: 1 }));
    if (foodSuccess) {
      st.npc.hunger = task === "eat" ? 0 : Math.max(0, st.npc.hunger - 5);
      if (task === "eat" && (mealFrom(target).cards[0].fuel ?? 0) > 0) st.npc.ateHot = day();
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
    const axe = hasTool(st, target, "axe"), n = axe ? 3 : 2;              // one tree felled: two lengths of log, three with an axe
    t.stock -= 1; markCut(t); refreshStock(t); carry(st, "log", n, 1); if (axe) wearAny(st, target, "axe");
  }
  if (task === "gather" && t.stock > 0) { t.stock--; markCut(t); refreshStock(t); addCard(st, st.want === "wood" ? "log" : st.want); if (st.want === "log" && hasTool(st, target, "axe")) wearAny(st, target, "axe"); }
  if (task === "fetchHome") for (let k = 0; k < (st.wantN ?? 1); k++) {
    const pile = [target, ...storePiles(), homePile()].filter((p, i, a) => p && a.indexOf(p) === i).find((p) => p.cards.some((x) => sameKind(st.want)(x.key))), c = pile?.cards.find((x) => sameKind(st.want)(x.key));
    if (c) { pile.cards = pile.cards.filter((x) => x !== c); if (!pile.cards.length) removeStack(pile); cardsLayer.append(c.el); st.cards.push(c); continue; }
    const box = cupboards().find((s) => s.cards[0].items.some((x) => x === st.want || (st.want === "wood" && x === "log")));
    if (!box) break;
    const items = box.cards[0].items, i = items.findIndex((x) => x === st.want || (st.want === "wood" && x === "log"));
    addCard(st, items.splice(i, 1)[0]);
  }
  if (task === "fetchHome") st.wantN = 1;
  if (task === "craft") craftDone(st, target);
  if (task === "jarIn") { const i = st.cards.findIndex((c, j) => j > 0 && c.key === "jar"); if (i > 0) { st.cards[i].el.remove(); st.cards.splice(i, 1); t.jars = (t.jars ?? 0) + 1; refreshStock(t); } st.plans = []; }
  if (task === "build" && t.key === "plot") npcBuild(st, target);
  if (task === "water" && isField(target) && holds(st, "jar")) { t.tendDay = day(); }
  if (task === "place") {
    const c = st.cards.find((x, j) => j > 0 && x.key === st.want);
    if (c && isField(target) && !GUARDS.some((g) => toolAt(target, g))) { st.cards = st.cards.filter((y) => y !== c); target.cards.push(c); }
  }
  if (task === "useFresh" && t.key === "stove") {
    const items = st.cards.filter((c, j) => j > 0 && FRESH_SERVINGS[c.key]), add = items.reduce((n, c) => n + FRESH_SERVINGS[c.key], 0);
    st.cards = st.cards.filter((c) => !items.includes(c)); items.forEach((c) => c.el.remove());
    if (add) addMeals(add, target);
  }
  if (task === "collect" && boards.world.includes(target) && !target.store) {   // pick up what was lying there and take it home
    const took = target.cards.splice(0, Math.max(0, capOf(st) - loose(st).length));
    st.cards.push(...took); if (!target.cards.length) removeStack(target);
    if (took.length) { go(st, "taoHouse", "stashAll"); return; }
  }
  if (task === "stashAll") { const items = st.cards.filter((c, j) => j > 0 && SPARE.has(DEFS[c.key].type) && !GUARDS.includes(c.key)); st.cards = st.cards.filter((c) => !items.includes(c)); storeHome(items); }
  if (task === "stash") { const items = st.cards.filter((c, j) => j > 0 && STASH.includes(c.key)); st.cards = st.cards.filter((c) => !items.includes(c)); storeHome(items); }
  if (task === "supply" && t.key === "plot") supplyPlot(st, target);
  if (task === "stoke") stoke(st, target);
  if (task === "plant" && (t.stock ?? 0) <= 0) {
    t.stock = 1; t.readyDay = day(); refreshStock(t); nature.felled = Math.max(0, (nature.felled ?? 0) - 2);
    
    if (!nature.replanted) { nature.replanted = true; chronicle(`${nameOf(st)}在砍秃的林子里补种了树苗。`); }
  }
  if (task === "manure" && isField(target)) {
    const i = st.cards.findIndex((c, j) => j > 0 && c.key === "ash");
    const m = st.cards.findIndex((c, j) => j > 0 && c.key === "muck"), at = m > 0 ? m : i;
    if (at > 0 && t.manured !== yearNo()) { st.cards[at].el.remove(); st.cards.splice(at, 1); t.soil = Math.min(SOIL_MAX, soilOf(t) + (m > 0 ? 2 : 1)); t.manured = yearNo(); refreshStock(t); }
  }
  if (task === "pick" && t.stock > 0) { t.stock--; refreshStock(t); const two = hasTool(st, target, "hammer"); carry(st, "stone", two ? 2 : 1, two ? 2 : 1); if (two) wearAny(st, target, "hammer"); if (t.key === "mineFace") digDeeper(target); }
  if (task === "store") storeCarry(st);
  if (task === "drop" || task === "give") foodSuccess = dropCarry(st, target);
  if (task === "arrive") welcome(st);
  if (task === "help" && t.stock > 0) { t.stock--; refreshStock(t); carry(st, "fiber", 1); }
  if (task === "cut" && t.stock > 0) { t.stock--; refreshStock(t); const two = hasTool(st, target, "knife"); carry(st, "reed", two ? 2 : 1, two ? 2 : 1); if (two) wearAny(st, target, "knife"); }
  if (task === "cook") {
    const { cards, n } = carriedLoad(st);
    if (st.carry?.key === "grain" && n > 0 && (t.fuel ?? 0) <= 0) float("灶里没火，煮不了", center(target), "world");
    else if (st.carry?.key === "grain" && n > 0) {
      foodSuccess = Boolean(commitProduction(st, target, { kind: "cook", cards, use: cards.map((c) => c.key), credit: 0 }, {
        clearLoad: true, details: { consumedUnits: n, addedUnits: n * 3, resource: "cooked-food" },
      }));
      if (foodSuccess) {
        addMeals(n * 3, target);
        if (st.npc.standIn) { st.npc.standIn = 0; if (st.npc.job !== "cook") tell(st, "“饭在锅里了，饿了就上桌。”"); }
        if (t.stock >= 6 && randomVoice() < 0.4) tell(st, VOICE.line(st.npc.key, "full"));
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
  if (n > add) float("粮囤满了，多的粟放不下，糟蹋了", center(target), "world");
  return true;
}
/** The pile keeps like with like: one bundle per kind, in a fixed order. */
function sortPile(pile) {
  const order = Object.keys(DEFS);
  pile.cards.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
/** Things carried home go on a pile inside the yard, where you (and they) can pick them up. */
function storeHome(cards) {
  for (const c of cards.filter((x) => x.key === "bed")) { const at = freeBedSlot(); if (at) { newStack([c], at.x, at.y, "world"); cardsLayer.append(c.el); cards = cards.filter((x) => x !== c); } }   // a bed goes along the wall
  if (!cards.length) return;
  const house = find("taoHouse"), c = house?.compound;
  if (c) {
    cards.forEach((card) => { card.el.classList.remove("gone", "pop"); cardsLayer.append(card.el); });
    const bin = find("granary")?.cards[0], barn = MAP.barn;
    cards = cards.filter((card) => {                                  // grain into the bin while there's room
      if (card.key !== "grain" || !bin || bin.stock >= granaryCap(bin)) return true;
      bin.stock += 1; refreshStock(bin); card.el.remove(); return false;
    });
    let materials = barn ? cards.filter((card) => barnThing(card.key)) : [];
    if (materials.length) {                                           // materials (and grain the bin can't take): a heapful per heap
      cards = cards.filter((card) => !materials.includes(card));
      while (materials.length) {
        const where = storeWithRoom();
        if (where?.heap && where.space > 0) {
          const take = materials.splice(0, Math.min(where.space, materials.length));
          where.heap.cards.push(...take); sortPile(where.heap);
        } else if (where?.room) {
          const take = materials.splice(0, Math.min(STORE_CAP, materials.length)), b = where.room.box;
          const st = newStack(take, b.x + b.w / 2 - 40, b.y + b.h / 2 - 30, "world"); st.store = "room"; st.room = where.room.id;
        } else break;
      }
      if (materials.length) {                                          // nowhere to put it: it stays on the granary heap and spills
        let heap = barnPile();
        if (!heap) { const { x, y } = barnFurnishing("store", barn); heap = newStack(materials.splice(0, 1), x, y, "world"); heap.store = "barn"; }
        heap.cards.push(...materials); sortPile(heap); if (heap.cards.length > STORE_CAP) village.storeFull = day();
      }
    }
    cards = cards.filter((card) => {                                  // what keeps goes into a cupboard, if there's one with room
      if (KEEPS[card.key] || DEFS[card.key].type === "structure") return true;
      const box = cupboards().find((s) => s.cards[0].items.length < CHEST_CAP);
      if (!box) return true;
      box.cards[0].items.push(card.key); card.el.remove(); return false;
    });
    if (!cards.length) return;
    const pile0 = homePile();
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
  if (randomVoice() < 0.35) { if (randomVoice() < 0.5) tell(st, VOICE.line(st.npc.key, "wake")); else if (heard(st)) say(st, `（${DEFS[st.npc.key].name}${VOICE.gesture(st.npc.key)}）`); }   // a word to whoever's up, or just a stretch
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
    if (board === "world") { fx.scanWorld(boards.world, now);
    fx.updateAndDraw(); }
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
  defendTick(you);
  if (you && !you.job && !you.walk && !you.travel && !you.lifted && !drag && me.food > 10) {
    me.rest = Math.min(100, me.rest + minutes * (inRoom(center(you)) || board !== "world" ? 0.04 : 0.012));
  }
  me.food = Math.max(0, me.food - minutes * (you?.job && !you.job.r.nap ? 0.03 : 0.016));   // a full belly lasts you about three days
  talks.sort((a, b) => a.at - b.at);
  peopleTick(minutes);
  if (Math.floor(clock.min / 60) !== Math.floor(previousMinute / 60)) { climbLadder(); considerArrival(); considerTrader(); }   // hourly
  coastRaidTick(minutes, you);
  festivalTick();
  while (talks.length && talks[0].at <= clock.min) {
    const t = talks.shift(), partner = t.partnerId === undefined || awake(boards[t.st.board]?.find((st) => st.id === t.partnerId));
    if (!boards.world.includes(t.st) || !awake(t.st) || !partner) continue;
    if (t.partnerId !== undefined) { if (heard(t.st)) say(t.st, t.text); } else tell(t.st, t.text);
  }
  for (const st of [...allStacks()]) {
    if (st.lifted) continue;
    if (st.critter && DIET[st.critter.kind]) st.critter.hunger = Math.min(10, (st.critter.hunger ?? 3) + minutes * HUNGER.perMinute);   // the plant-eaters get hungry whatever they're doing
    if (st.critter?.kind === "wolf") st.critter.hunger = Math.min(10, (st.critter.hunger ?? 4) + minutes / 520);   // and the pack gets hungry too
    if (st.npc) {
      if (st.ctl?.mode !== "manual") brain(st, minutes);
      if (st.walk && stepWalk(st, minutes, st.walk.fight ? 1.4 : st.walk.flee ? 2 : 1)) { const w = st.walk; st.walk = null; if (w.manual) manualArrive(st, w.target); else if (w.flee && !st.task) { const t = boards.world.find((q) => q.critter?.predator); if (t && dist(center(t), center(st)) < 700) fleeFrom(st, t); else if (!sheltered(st)) runHome(st, t); } else if (!w.fight) npcArrive(st); }   // clear of the tiger: now home
    } else if (st.pet && st.ctl?.mode !== "auto") {
      if (st.ctl.mode === "work" && !st.walk) dogWork(st);
      if (st.walk && stepWalk(st, minutes, 1.3)) { const w = st.walk; st.walk = null; if (!w.follow) dogArrive(st, w.target); }
    } else if (st.pet) {
      if (!dogGuard(st) && !st.walk && randomWorld() < minutes / 120) {
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
    } else if (st.critter?.kind === "wolf") {
      wolfTick(st, minutes, you);
    } else if (st.critter?.predator) {
      tigerTick(st, minutes, you);
    } else if (st.critter?.kind === "fox") {
      foxTick(st, minutes, you);
    } else if (st.critter?.aggro) {
      boarTick(st, minutes, you);
    } else if (st.critter) {
      woodlandTick(st, minutes);
    } else if (st.walk) {
      const pace = st.cards[0].key === "you" ? playerStride(moveRange(center(st)), MOVE_RANGE) / PX_PER_MIN : 1;
      if (stepWalk(st, minutes, pace)) {
        const { target, intent, automatic } = st.walk; st.walk = null;
        if (target && st.cards[0].key === "you" && boards[st.board].includes(target) && dist(st, standOn(st, target)) < 130) {
          arrive(st, target, intent, automatic);
          if (st.job) st.job.automatic = automatic;
          else if (automatic && youStack() === st && !clock.fast) me.autoRetryAt = clock.min + 20;
        }
      }
    }
    if (st.job) {
      st.job.left -= minutes;
      if (st.job.left <= 0) {
        if (st.npc && !st.job.r) { st.job = null; st.bar?.remove(); st.bar = null; npcDone(st); } else finish(st);
      }
    }
  }
  if (me.wantBoat && !me.aboard && you && !you.walk) {
    const boat = boards.world.find((q) => q.id === me.wantBoat);
    if (boat && dist(center(you), center(boat)) <= 700) { me.wantBoat = null; boardBoat(boat); }
    else if (!boat) me.wantBoat = null;
  }
  sailTick(minutes, youStack());                                       // after the step: the boat keeps exactly to the rower
  huntStep();
  for (const who of new Set([you, actor()])) {                     // you, and whoever you're playing: what they set out to do
    if (who?.repeat && clock.min >= who.repeat.at) {
      const { target, automatic } = who.repeat;
      who.repeat = null;
      if (!who.job && !who.walk && !who.lifted && boards[who.board]?.includes(target)) {
        arrive(who, target, null, automatic);
        if (who.job) who.job.automatic = automatic;
      }
    }
    if (who?.travel && clock.min >= who.travel.until) { const t = who.travel.target; who.travel = null; if (t && boards[who.board].includes(t)) arrive(who, t); }
    if (who && board === "world") explore(center(who));
  }
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
      lastSeason = s;
      if (SEASONS[s] === "春" && day() > 1) vegetationSpring();      // before the spring ground is painted
      turnSeason(SEASONS[s]); banner(SEASONS[s], `${SEASONS[s]}天来了`); observe("seasons-turn");
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
/** The footprint a lamp belongs to: the room it stands in, or the yard/barn compound; light stops at its edge. */
function lampRect(p) {
  const room = roomHere(p);
  if (room?.box) return room.box;
  for (const c of [MAP.house, MAP.barn]) if (c && p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h) return c;
  return null;
}
/** What gives light on the board you are on: a burning stove or hearth, a lived-in house at night. */
function lights() {
  const out = [];
  if (board === "world") {
    const s = find("stove"); if (s && s.cards[0].fuel > 0) out.push({ ...center(s), r: 360, a: 0.78, rect: lampRect(center(s)) });
    for (const h of boards.world) if (DEFS[h.cards[0].key].type === "house" && allStacks().some((n) => n.npc?.inside && n.npc.home === h.cards[0].key)) {
      const box = h.compound ?? lampRect(center(h)) ?? { x: h.x, y: h.y, w: h.w, h: h.h };
      out.push({ ...center(h), r: 300, a: 0.55, rect: box });   // one ring round the house, not the whole yard
    }
  } else {
    const f = find("fire", board); if (f && f.board === board && f.cards[0].fuel > 0) out.push({ ...center(f), r: 640, a: 1 });
  }
  const you = youStack();
  if (you && you.board === board && you.cards.some((c) => c.key === "torch")) out.push({ ...center(you), r: 340, a: 1 });   // a torch in your hand
  for (const n of boards[board]) if (n.npc && !n.indoors && holds(n, "torch")) out.push({ ...center(n), r: 260, a: 0.9 });
  return out;
}
const litAt = (p) => lights().some((l) => l.rect
  ? p.x > l.rect.x - 2 && p.x < l.rect.x + l.rect.w + 2 && p.y > l.rect.y - 2 && p.y < l.rect.y + l.rect.h + 2
  : dist(l, p) < l.r * 0.7);
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
  /** A room light: a soft radial falloff inside the room, feathered over its edge, with one faint halo outside. */
  const roomLight = (l, color, alpha) => {
    const s = toScreen(l), pad = 24;
    const outer = [toScreen({ x: l.rect.x - pad, y: l.rect.y - pad }), toScreen({ x: l.rect.x + l.rect.w + pad, y: l.rect.y + l.rect.h + pad })];
    const inner = [toScreen({ x: l.rect.x, y: l.rect.y }), toScreen({ x: l.rect.x + l.rect.w, y: l.rect.y + l.rect.h })];
    const box = (a, b) => [a.x, a.y, b.x - a.x, b.y - a.y];
    const round = (a, b, r) => { darkG.beginPath(); darkG.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, r); darkG.fill(); };
    darkG.fillStyle = color(alpha * 0.1); round(outer[0], outer[1], 18);       // soft halo, one ring
    darkG.fillStyle = color(alpha * 0.24); round(toScreen({ x: l.rect.x - 8, y: l.rect.y - 8 }), toScreen({ x: l.rect.x + l.rect.w + 8, y: l.rect.y + l.rect.h + 8 }), 12);
    const g = darkG.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(inner[1].x - inner[0].x, inner[1].y - inner[0].y) * 0.72);
    g.addColorStop(0, color(alpha)); g.addColorStop(0.55, color(alpha * 0.72)); g.addColorStop(0.86, color(alpha * 0.24)); g.addColorStop(1, color(0));
    darkG.save(); darkG.beginPath(); darkG.roundRect(inner[0].x, inner[0].y, inner[1].x - inner[0].x, inner[1].y - inner[0].y, 10); darkG.clip();
    darkG.fillStyle = g; darkG.fillRect(...box(inner[0], inner[1])); darkG.restore();
  };
  darkG.globalCompositeOperation = "destination-out";
  for (const l of all) {
    if (l.rect) { roomLight(l, (a) => `rgba(0,0,0,${a})`, l.a); continue; }
    const s = toScreen(l), R = l.r * s.k, g = darkG.createRadialGradient(s.x, s.y, R * 0.1, s.x, s.y, R);
    g.addColorStop(0, `rgba(0,0,0,${l.a})`); g.addColorStop(0.5, `rgba(0,0,0,${l.a * 0.8})`); g.addColorStop(1, "rgba(0,0,0,0)");
    darkG.fillStyle = g; darkG.beginPath(); darkG.arc(s.x, s.y, R, 0, Math.PI * 2); darkG.fill();
  }
  darkG.globalCompositeOperation = "source-over";
  for (const l of all) if (l.a >= 0.5) {                         // firelight is warm where it falls
    if (l.rect) { roomLight(l, (a) => `rgba(255,170,80,${a})`, 0.15 * d); continue; }
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
  const eye = actor() ?? you;
  if (board === "world" && cam.follow && eye && !eye.lifted) { const c = center(eye); cam.x += (c.x - cam.x) * 0.12; cam.y += (c.y - cam.y) * 0.12; applyCam(); }
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
      let rows = 0;
      cardGroups(st).forEach(({ card }, i) => {
        const el = card.el, away = i > 0 && stowed(st, card), row = away ? 0 : rows++;
        el.classList.toggle("hidden", hidden);
        el.classList.toggle("ghost", unseen);
        el.classList.toggle("lifted", Boolean(st.lifted));
        el.classList.toggle("walking", Boolean(st.walk) && !unseen);
        el.classList.toggle("speaker-motion", speaker);
        el.classList.toggle("packed", away);
        el.classList.toggle("glum", Boolean(st.npc && (st.npc.mood ?? 6) < 3));
        el.style.transform = `translate(${left}px, ${top + row * peek}px)${st.lifted ? " rotate(-2deg) scale(1.05)" : ""}`;
        el.style.zIndex = st.lifted ? 9000 + row : top + row + 10;
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
  roofTick(actor() ?? you);                                                       // a roof lifts while you're under it
  const part = dayPart(hour());
  if ($("time").textContent !== part) $("time").textContent = part;
  $("dayline").style.setProperty("--t", (clock.min % 1440 / 1440).toFixed(4));
  if (Math.floor(clock.min / 10) !== shadowAt) { shadowAt = Math.floor(clock.min / 10); for (const q of boards.world) if (q.cards[0].key === "calendarStick") drawShadow(q.cards[0]); }
  drawDark();
  $("sun").className = darkness() < 0.5 ? "sun" : "moon";
  $("barFood").firstElementChild.style.width = `${me.food}%`;
  $("barFood").classList.toggle("low", hungry());
  $("barRest").firstElementChild.style.width = `${me.rest}%`;
  $("barRest").classList.toggle("low", tired());
  const state = bodyState().join(" · ");
  $("me").classList.toggle("low", Boolean(state));
  $("meFace").title = `${me.name ?? "启禾"} · ${myAge()}岁${state ? ` · ${state}` : ""}\n点一下：${me.recent[0] ? `接着去${DEFS[me.recent[0].key].name}` : "接着做刚才那件事"}`;
  renderMe();
}
/** The face in the corner and the two bars: whoever you're playing. */
function renderMe() {
  const played = me.playing ? actor() : null, key = played ? played.cards[0].key : "you";
  if ($("meFace").dataset.key !== key) { $("meFace").dataset.key = key; $("meFace").innerHTML = iconFor(DEFS[key]?.icon ?? "you"); }
  $("me").classList.toggle("playing", Boolean(played));
  if (!played) return;
  $("barFood").firstElementChild.style.width = `${Math.max(0, 100 - (played.npc.hunger ?? 0) * 10)}%`;
  $("barFood").classList.toggle("low", (played.npc.hunger ?? 0) >= 7);
  $("barRest").firstElementChild.style.width = `${Math.round(100 * (1 - (played.npc.hurt ?? 0)))}%`;
  $("meFace").title = `正在操作：${nameOf(played)}\n点一下：换回${me.name ?? "启禾"}`;
}
const npcKnows = (st, id) => Boolean(id && BUILDS[id]?.who.includes(st.npc.key));
/** What time of day it looks like: by the light, not by a clock. */
const dayPart = (h) => (h < 4.5 ? "深夜" : h < 6 ? "天快亮" : h < 9 ? "清早" : h < 11.5 ? "上午" : h < 13.5 ? "晌午" : h < 16.5 ? "下午" : h < 18.5 ? "傍晚" : h < 21 ? "天黑了" : "夜里");
// ---- The shadow pole: the sun's shadow, drawn as it falls ----
// Morning the shadow points west, at noon north and shortest, evening east. How short at noon depends on the time of
// year: the sun climbs high in summer, low in winter. Two notches on the ground mark the noon shadow at midsummer
// and midwinter. Knowing that (立竿测影) you can read where in the year you are; otherwise it's just a shadow.
let shadowAt = -1;
const yearPhase = () => ((clock.min / 1440) % (DAYS_PER_SEASON * 4)) / (DAYS_PER_SEASON * 4);   // 0 at the first of spring
const noonSun = (phase) => 55 + 23.4 * Math.cos(2 * Math.PI * (phase - 0.375));          // degrees above the horizon at noon: high at midsummer
function poleShadow(h = hour(), phase = yearPhase()) {
  if (h < 6.2 || h > 17.8 || weather.now === "雨" || weather.now === "雪") return null;
  const alt = noonSun(phase) * Math.sin(Math.PI * (h - 6) / 12), len = Math.min(46, 14 / Math.tan((Math.max(4, alt) * Math.PI) / 180));
  const a = Math.PI * (1 - (h - 6) / 12);
  return { dx: Math.cos(a) * len, dy: -Math.sin(a) * len, len };
}
const noonLen = (phase) => 14 / Math.tan((noonSun(phase) * Math.PI) / 180);
function drawShadow(card) {
  const art = card.el.querySelector(".card-art");
  if (!art) return;
  // Seen from the north side looking south, a little from above: the pole stands up, its shadow lies on the ground —
  // west to the right, east to the left, the noon shadow coming towards you (flattened, as ground is).
  const s = poleShadow(), x = 50, y = 50, k = 0.5, summer = noonLen(0.375), winter = noonLen(0.875);
  const tick = (l) => `<path d="M${x - 6} ${y + l * k}h12" stroke="#5a3f22" stroke-width="1.6"/>`;
  art.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="${y + 8}" rx="46" ry="24" fill="#cdb98e" opacity=".55"/>`
    + tick(summer) + tick(winter)
    + (s ? `<path d="M${x} ${y}L${x - s.dx} ${y - s.dy * k}" stroke="rgba(40,30,20,.5)" stroke-width="3.4" stroke-linecap="round"/>` : "")
    + `<path d="M${x} ${y}V${y - 40}" stroke="#7a5630" stroke-width="3.6" stroke-linecap="round"/><ellipse cx="${x}" cy="${y}" rx="3" ry="1.6" fill="#5a3f22"/></svg>`;
}
/** What the pole says when you look: the shadow, and — if the village has worked it out — where in the year that is. */
function readPole() {
  const s = poleShadow(), know = Boolean(lore.inventions["calendar-stick"]);
  if (!s) return darkness() > 0.5 ? "天黑了，看不见影子。" : "阴着天，地上没有影子。";
  const dir = s.dx < -s.len * 0.5 ? "朝西" : s.dx > s.len * 0.5 ? "朝东" : "朝北";
  const when = dir === "朝西" ? "日头还在东边" : dir === "朝东" ? "日头偏西了" : "快到晌午";
  let out = `影子${dir}，${s.len > 30 ? "拖得老长" : s.len > 12 ? "不长不短" : "短短的一截"}——${when}。`;
  if (!know) return out;
  const p = yearPhase(), now = noonLen(p), next = noonLen((p + 0.02) % 1), sum = noonLen(0.375), win = noonLen(0.875), r = (now - sum) / (win - sum);
  const where = r < 0.12 ? "正午的影子快缩到夏至那道刻痕上了，正是盛夏" : r > 0.88 ? "正午的影子快伸到冬至那道刻痕了，正是隆冬"
    : next < now ? `正午的影子一天比一天短，${r > 0.5 ? "冬天快过去了" : "开春有些日子了"}` : `正午的影子一天比一天长，${r < 0.5 ? "夏天要过去了" : "入秋有些日子了"}`;
  return `${out}${where}。`;
}
function carryChanged() {
  const you = actor();
  if (you) overflow(you);
  renderInv();
}
/** The bottom bar: what you wear and hold, then your pockets and the basket's places. */
function renderInv() {
  const box = $("inv"), you = actor();
  box.hidden = !you;
  if (!you) return;
  const cell = (slot) => {
    const here = you.cards.filter((c) => c.at === slot), c = here[0];
    if (!c) return `<span class="slot empty" data-slot="${slot}" title="${SLOT_TITLES[slot]}"><i>${SLOT_NAMES[slot]}</i></span>`;
    const d = DEFS[c.key], left = BREAKS[c.key] ? null : d.uses ? (c.uses ?? d.uses) / d.uses : d.burn ? (c.burn ?? d.burn) / d.burn : null;
    return `<span class="slot" data-slot="${slot}" data-card="${c.id}" title="${d.name}${here.length > 1 ? ` ×${here.length}` : ""}">${iconFor(d.icon)}`
      + `${here.length > 1 ? `<small>${here.length}</small>` : ""}${left !== null ? `<b class="wear" style="--w:${Math.round(left * 100)}%"></b>` : ""}</span>`;
  };
  box.innerHTML = `<div class="inv-equip">${EQUIP.map(cell).join("")}</div><div class="inv-pack">${packSlots(you).map(cell).join("")}</div>`;
}
/** The last two kinds of work you did: a tap on your face sends you back to the latest. */
function remember(key) {
  me.recent = [{ key }, ...me.recent.filter((r) => r.key !== key)].slice(0, 2);
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
  if (!me.auto || me.playing || me.aboard || !you || clock.fast || you.job || you.walk || you.travel || you.repeat || you.lifted || drag) return;
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
    if (board === "world" && find("stove")?.cards[0].stock > 0 && go("table", "去吃饭", "meal")) return;
  }
  if (tiredOrDark && go("bed", "回家歇着")) return;
  if (board !== "world") return void go("door", "出门");
  if (full(you)) {
    if (go(unloadDest(you), "拿不下了，先去卸货")) you.unloading = true;
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
/** Drop whatever the protagonist started on their own, without touching a villager you're playing. */
function clearAuto() {
  const you = youStack();
  if (you) {
    if (you.walk?.automatic) { you.walk = null; you.unloading = false; }
    if (you.job?.automatic) cancelJob(you);
    if (you.repeat?.automatic) you.repeat = null;
  }
  renderAutoMe();
}
function stopAuto() {
  if (!me.auto) return false;
  me.auto = false; clearAuto();
  return true;
}

// ---------------------------------------------------------------------------
// The people (and the dog) you can direct
// ---------------------------------------------------------------------------
const JOB_CHOICES = {
  npc: [["farm", "field", "种田"], ["wood", "chestnut", "砍树，木头背回家"], ["fish", "river", "捕鱼，送到灶上"], ["stone", "scree", "去矿道挖石头，背回家"], ["cook", "stove", "做饭"], ["build", "plot", "盖房子：去材料齐了的地基上干活"]],
  dog: [["carry", "granary", "搬运：你背的东西一多，它就来接走送回家"]],
};
const MODES = [["auto", "⟳", "自己安排"], ["work", "⚒", "派活：选一样活，它自己去干"], ["manual", "✋", "换成他：像你自己一样拖他走、用他身上的东西"]];
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
  if (mode === "manual" && st.npc) return play(st);                  // a villager: you take them over
  if (me.playing === st.id) release();
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
  if (!t && !walkable(MAP, there.x, there.y)) return sayHint("steer-blocked", "那儿走不过去");
  const path = t ? route(st, t) : findPath(MAP, center(st), there);
  if (!path) return sayHint("steer-detour", "走不过去，得绕路");
  st.goal = ""; st.task = ""; st.parkedAt = null;
  st.walk = t ? { target: t, path, k: 0, manual: true } : { path: path.slice(0, -1), k: 0, x: there.x - CARD_W / 2, y: there.y - CARD_H / 2, manual: true };
  intent(st, t ? DEFS[t.cards[0].key].icon : "");
}
/** A villager you steered got there: do whatever that place is for. */
const FIELD_TASK = (t) => { const s = season(); if (s === "冬") return null; if (s === "秋") return t.stock >= 1 ? "harvest" : null; if (s === "春" && t.sown === false) return "sow"; return t.sown !== false ? "tend" : null; };
const TASK_AT = { field: FIELD_TASK, field2: FIELD_TASK, chestnut: () => "chop", pineGrove: () => "chop", lake: () => "fish",
  pit: () => "dig", scree: () => "pick", mineFace: () => "pick", granary: (t, st) => (st.carry && st.carry.key !== "grain" ? "store" : "drop"), stove: (t, st) => (st.carry ? "give" : "stoke"), table: () => "eat", taoHouse: () => "store" };
function manualArrive(st, t) {
  intent(st, "");
  if (!t) return;
  if (st.pet) return dogArrive(st, t);
  const k = t.cards[0].key, task = TASK_AT[k]?.(t.cards[0], st);
  if (!task) return tell(st, "“在这儿干什么呢？”", { r: 600, reply: false }) || toast(`${nameOf(st)}在那儿没什么可干的`);
  const gathering = ["harvest", "chop", "fish", "dig", "pick"].includes(task);
  if (gathering && st.carry) return tell(st, "“手上拿不下了，先放回去。”", { r: 600, reply: false }) || toast(`${nameOf(st)}手上拿不下了`);
  if (task === "store" && !st.carry) return;
  st.task = task; st.goal = k; st.goalStack = t;
  npcArrive(st);
}
/** A duck or hare that has got into the yard: bark, run at it, see it off. */
function dogGuard(st) {
  const home = st.pet.home ?? center(st), here = center(st);
  const intruder = boards.world.filter((q) => q.critter && !q.critter.predator && !q.critter.aggro && !deepSleeping(q)
    && ["duck", "rabbit", "pheasant", "fox"].includes(q.critter.kind) && q.id !== me.hunt?.id   // don't steal the quarry you're after
    && (inYard(center(q)) || dist(center(q), home) < 200))
    .sort((a, b) => dist(center(a), here) - dist(center(b), here))[0];
  if (!intruder) { st.pet.chaseId = null; return false; }
  if (clock.min > (st.pet.barkAt ?? 0)) { st.pet.barkAt = clock.min + 25; sfx("bark"); float("汪汪！", here, "world"); }
  const at = center(intruder), gap = dist(here, at);
  if (gap > 110) {
    if (!st.walk || st.pet.chaseId !== intruder.id || clock.min > (st.pet.repath ?? 0)) {
      st.pet.chaseId = intruder.id; st.pet.repath = clock.min + 10;
      const path = findPath(MAP, here, at);
      if (path) st.walk = { path: path.slice(0, -1), k: 0, x: at.x - CARD_W / 2, y: at.y - CARD_H / 2 };
    }
    return true;
  }
  st.walk = null; st.pet.chaseId = null;
  if (clock.min > (st.pet.shoveAt ?? 0)) {                             // close enough: out it goes, away from the yard
    st.pet.shoveAt = clock.min + 20;
    const vx = at.x - home.x, vy = at.y - home.y, len = Math.hypot(vx, vy) || 1;
    const away = { x: home.x + (vx / len) * 560, y: home.y + (vy / len) * 560 };
    intruder.critter.alarm = { at: clock.min, from: here }; intruder.critter.nextMove = 0;
    if (!critterGo(intruder, away)) critterGo(intruder, { x: home.x - 520, y: home.y + 120 });
    float(`阿黄把${DEFS[intruder.critter.kind].name}撵出了院子`, at, "world");
  }
  return true;
}
/** The dog as a carrier: when you have a load, it trots over, takes it and runs it home; otherwise it keeps near you. */
function dogWork(st) {
  const you = youStack();
  const loose = (s) => s.cards.filter((c, j) => j > 0 && DEFS[c.key].type !== "tool");
  if (st.cards.length > 1) return dogGo(st, find("taoHouse"));
  if (!you || you.board !== "world") return;
  if (inHand(you).filter((c) => DEFS[c.key].type !== "tool").length >= 3) return dogGo(st, you);
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
    const take = inHand(t).filter((c) => DEFS[c.key].type !== "tool").slice(0, 4);
    if (!take.length) return;
    t.cards = t.cards.filter((c) => !take.includes(c)); st.cards.push(...take);
    carryChanged();
  } else if (k === "taoHouse") {
    if (st.cards.length > 1) { storeHome(st.cards.splice(1)); }
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
function wearAny(st, place, k) {
  if (holds(st, k)) return st.npc ? wearNpc(st, k) : wearTool(st, k);
  if (!toolAt(place, k)) return;
  wearTool(place, k);
  const broken = place.cards.find((c, j) => j > 0 && c.key === looseOf(k));
  if (broken) { place.cards = place.cards.filter((c) => c !== broken); st.cards.push(broken); }   // whoever was using it takes it home to mend
}
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
  li: (st) => (kitHas(st, "hammer") || toolAt(find("mineFace"), "hammer") ? (kitHas(st, "axe") || toolAt(find("chestnut"), "axe") ? (season() === "冬" && !kitHas(st, "spear") ? "spear" : null) : "axe") : "hammer"),
  san: (st) => (kitHas(st, "hoe") || boards.world.some((s) => isField(s) && toolAt(s, "hoe")) ? null : "hoe"),
};
// In winter everyone wants a coat once the working tools are in hand.
for (const key of Object.keys(WANT)) { const base = WANT[key]; WANT[key] = (st) => base(st) ?? (season() === "冬" && !kitHas(st, "cloth") && !holds(st, "cloth") ? "cloth" : null); }
const SOURCE = { log: "chestnut", wood: "chestnut", stone: "mineFace", flint: "flintVein", fiber: "hemp", reed: "reeds", clay: "pit", fish: "lake" };
/** A plan that can't go on (nothing left to gather, nobody knows how): set it aside for half a day or so and get on with the work. */
const shelve = (st) => { st.plans = []; st.npc.planBlocked = clock.min + 600 + randomWorld() * 600; };
const NPC_STATION = { fire: "fire", stove: "stove", workbench: "workbench" };
const TORCH_FROM_STOVE = { id: "torch", needs: ["stove"], make: ["torch"], min: 20, fuelCost: 1 };
function recipeFor(id) {
  if (id === "jar") return RECIPES.find((r) => r.id === "jar" && r.kilnClay);
  if (id === "torch") return TORCH_FROM_STOVE;                       // a brand lit at the stove
  return RECIPES.find((r) => r.id === id) ?? RECIPES.find((r) => r.make?.[0] === id);
}
function addCard(st, key) { const c = newCard(key); layerOf(st.board).append(c.el); c.el.classList.add("pop"); st.cards.push(c); return c; }
function wearNpc(st, key) {
  const t = st.cards.find((c) => c.key === key); if (!t) return;
  if (BREAKS[key]) { if (randomWorld() < BREAKS[key][1]) loosen(st, st.cards.indexOf(t)); return; }
  t.uses = (t.uses ?? DEFS[key].uses ?? 20) - 1;
  if (t.uses > 0) return;
  st.cards = st.cards.filter((c) => c !== t); t.el.remove();
  
}
/** A tool of theirs came apart: bind it again (fetching rope or fibre from home if they have none on them); one
 *  lying at home that they haven't got is fetched first. A new one is only made when there is nothing to mend it with. */
function mendTurn(st) {
  const broken = st.cards.find((c, j) => j > 0 && DEFS[c.key].fixes);
  if (broken) {
    const fix = DEFS[broken.key].fix;
    if (holds(st, fix)) { mend(st, broken); st.npc.wait = 15; think(st, { id: "mend", because: `${DEFS[DEFS[broken.key].fixes].name}松了，绑一绑接着用` }); return true; }
    if (pileHas(fix)) { think(st, { id: "mend", because: `${DEFS[DEFS[broken.key].fixes].name}松了，回去拿${DEFS[fix].name}绑上` }); fetchFromHome(st, fix, 1); return true; }
    return false;
  }
  const atHome = Object.keys(BREAKS).find((k) => !holds(st, k) && !kitHas(st, k) && pileHas(looseOf(k)) && (pileHas(DEFS[looseOf(k)].fix) || holds(st, DEFS[looseOf(k)].fix)));
  if (atHome && WANT[st.npc.key]?.(st) === atHome) { fetchFromHome(st, looseOf(atHome), 1); return true; }
  return false;
}
/** Which inputs a villager still lacks (a log will do where firewood is wanted). */
function missingFor(st, r) {
  const pool = st.cards.slice(1).map((c) => c.key), out = [];
  for (const k of r.needs.slice(1)) { const i = pool.findIndex((x) => x === k || (k === "wood" && x === "log")); if (i >= 0) pool.splice(i, 1); else out.push(k); }
  return out;
}
const pileHas = (k) => [...storePiles(), homePile()].some((p) => p?.cards.some((c) => sameKind(k)(c.key)))
  || cupboards().some((s) => s.cards[0].items.some(sameKind(k)));
function planStep(st) {
  const plan = st.plans.at(-1);
  if (plan.deliver) return go(st, "granary", "jarIn");
  const r = plan.r, miss = missingFor(st, r);
  if (miss.length) {
    const k = miss[0];
    if (pileHas(k)) return fetchFromHome(st, k);
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
  if (MOVABLE.has(made.key)) return setDown(st, made);
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
  commitProduction(st, target, { kind: "deposit", cards, use: cards.map((c) => c.key), credit: cards.length }, {
    details: { resource: DEPOT[into.key], consumedUnits: cards.length, addedUnits: cards.length, discardedUnits: 0 },
  });
}

function unload(st, target) {
  const k = target.cards[0].key, items = loose(st);
  if (k === "barn") { storeIn(target, st); return true; }
  if (k === "taoHouse") { st.cards = st.cards.filter((c) => !items.includes(c)); storeHome(items); carryChanged(); return true; }
  if (DEPOT[k]) {
    const t = target.cards[0], fits = items.filter((c) => c.key === DEPOT[k]);
    const room = k === "granary" ? Math.max(0, granaryCap(t) - t.stock) : Infinity, put = fits.slice(0, room);
    if (put.length) depositCards(st, target, put);
    carryChanged(); return true;
  }
  return false;
}
const OPEN_PILE = 20, CHEST_CAP = 24, COMPOSTABLE = new Set(["reed", "fiber", "berry", "fish", "meat", "herb", "peachFruit", "jujubeFruit", "mushroom", "hide"]);
function compostIn(target, st) {
  const c = target.cards[0], items = loose(st).filter((x) => COMPOSTABLE.has(x.key));
  st.cards = st.cards.filter((x) => !items.includes(x)); items.forEach((x) => x.el.remove());
  c.heap = Math.min(12, (c.heap ?? 0) + items.length);
  carryChanged();
}
function storeIn(target, st) {
  const b = target.cards[0], room = b.key === "chest" ? CHEST_CAP - b.items.length : Infinity, items = loose(st).filter((c) => !KEEPS[c.key]).slice(0, Math.max(0, room));
  if (loose(st).some((c) => KEEPS[c.key])) sayHint("store-wet", "鱼、肉、果子这些关在箱子里会捂坏，留在外面");
  if (!items.length) return sayHint("store-full", `${b.name ?? DEFS[b.key].name}装满了`);
  st.cards = st.cards.filter((c) => !items.includes(c)); items.forEach((c) => c.el.remove());
  b.items.push(...items.map((c) => c.key));
  carryChanged();
}
function takeFromBarn(st, key) {
  const you = youStack(), b = st?.cards[0];
  if (!b || !you) return;
  if (dist(center(you), center(st)) > moveRange() * 1.5) return sayHint(`take-far-${st.id}`, "离得太远，走近点");
  if (full(you, key)) return sayHint("hands-full", "拿不下了");
  const i = b.items.indexOf(key); if (i < 0) return;
  b.items.splice(i, 1); addCard(you, key); carryChanged(); showDetail(b);
}

// ---------------------------------------------------------------------------
// Building: pick a spot for the foundation, bring materials, put in the work, give it a name. A hammer takes it down.
// ---------------------------------------------------------------------------
let placing = null, naming = null;
function endPlacing(note) {
  placing = null; table.classList.remove("placing"); $("menuBtn").textContent = "☰";
  if (note) toast(note);
}
function startPlacing(kind) {
  placing = kind; $("crafts").hidden = true; table.classList.add("placing"); $("menuBtn").textContent = "✕"; $("menu").hidden = true;
  toast(kind === "farm" ? "点一块草地开荒（点右上角 ✕ 取消）" : `点一块空地，放${DEFS[kind].name}的地基（点右上角 ✕ 取消）`);
}
/** Why a foundation can't go here, or null if it can. */
function foundationProblem(kind, p) {
  const b = BUILDS[kind], [w, h] = TIERS[b.tier];
  const corners = [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, 0]];
  if (b.shore ? !walkable(MAP, p.x, p.y) : !corners.every(([kx, ky]) => walkable(MAP, p.x + kx * w, p.y + ky * h) && MAP.cls[MAP.idx(p.x + kx * w, p.y + ky * h)] !== G.FORD)) return "这儿不平，换块地";   // a boat is built at the water's edge
  if (b.grass && !corners.every(([kx, ky]) => MAP.cls[MAP.idx(p.x + kx * w, p.y + ky * h)] === G.MEADOW)) return "开荒得找一块草地";
  if (b.shore && !shoreAt(MAP, p, 5)) return "船得在水边造，造好了好下水";
  if (rectHits(MAP.barn, p.x - w / 2 - 20, p.y - h / 2 - 20, w + 40, h + 40)) return "挨着公仓了，挪一挪";
  if (rectHitsYard(p.x - w / 2, p.y - h / 2, w, h) && !rectInYard(p.x - w / 2, p.y - h / 2, w, h)) return "压着院墙了，挪一挪";
  if (beforeGate(p.x - w / 2, p.y - h / 2, w, h)) return "挡着院门口了，挪一挪";
  if (corners.some(([kx, ky]) => MAP.road?.[MAP.idx(p.x + kx * w, p.y + ky * h)])) return "这儿是走的路，挪一挪";
  if (boards.world.some((s) => Math.abs(center(s).x - p.x) < (s.w + w) / 2 + 20 && Math.abs(center(s).y - p.y) < (s.h + h) / 2 + 20)) return "太挤了，离别的东西远一点";
  return null;
}
/** The ground in front of the yard gate stays clear: it's the way in. */
const beforeGate = (x, y, w, h) => { const c = MAP.house, g = c?.gate; return Boolean(g && x < g.x + g.w + 240 && x + w > g.x - 240 && y < c.y + c.h + 460 && y + h > c.y + c.h - 20); };
const rectHits = (c, x, y, w, h) => Boolean(c && x < c.x + c.w && x + w > c.x && y < c.y + c.h && y + h > c.y);
const rectHitsYard = (x, y, w, h) => rectHits(MAP.house, x, y, w, h) || rectHits(MAP.barn, x, y, w, h);
const rectInYard = (x, y, w, h) => { const c = MAP.house; return Boolean(c && x >= c.x + 8 && x + w <= c.x + c.w - 8 && y >= c.y + 8 && y + h <= c.y + c.h - 8); };
const plotName = (c) => (c.build === "farm" ? (c.stage ? "清好的荒地" : "荒地") : `${DEFS[c.build].name}·${stageOf(c).name}`);
function layFoundation(kind, p) {
  if (kind === "farm") p = snapField(p, 700) ?? p;
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
  if (kind === "farm") { const cell = snapField(p, 700); if (cell) p = cell; }      // new fields line up with the old ones
  const problem = foundationProblem(kind, p);
  if (problem) return sayHint(`place-${problem}`, problem);
  layFoundation(kind, p);
  endPlacing();
  toast(kind === "farm" ? "荒地划好了：先清理，再带着锄头翻地（冬天地冻，翻不动）" : "地基划好了：一步步来，每一步把材料带上去，齐了就站上去干");
}
/** A foundation shows which step it is on, what that step still needs, then how far the step has got. */
function refreshPlot(c) {
  if (c.site) return siteProgress(c);
  const stages = stagesOf(c), g = stageOf(c), at = c.stage ?? 0, left = Object.entries(c.need).filter(([, n]) => n > 0);
  c.el.querySelector(".card-art").innerHTML = `<div class="plot-art" style="opacity:${(0.25 + (0.55 * at) / stages.length).toFixed(2)}">${iconFor(DEFS[c.build].icon)}</div>`
    + (stages.length > 1 && knowsStep(c) ? `<b class="plot-step">${g.name}</b>` : "")
    + (left.length && !knowsStep(c) ? "" : left.length ? `<div class="plot-need">${left.map(([k, n]) => `<span title="${DEFS[k].name}">${iconFor(DEFS[k].icon)}<b>${n}</b></span>`).join("")}</div>`
      : `<i class="plot-bar"><u style="width:${Math.min(100, Math.round((c.work / g.work) * 100))}%"></u></i>`);
}
/** Work went into a foundation: the step may be done (then the next step's materials are wanted), or the whole thing. */
function progressPlot(target, minutes, by = null) {
  const c = target.cards[0], was = stageOf(c), out = addWork(c, minutes);
  if (out === "stage") {
    forgetStep(c);                                                   // the next step hasn't been explained yet
    if (c.build === "farm") { float("杂草拔了，石头捡出来了", center(target), "world"); if (!by) addCard(youStack(), "stone"); }
    else float(`${was.name}好了`, center(target), "world");
    c.name = plotName(c); c.el.querySelector(".card-head span").textContent = c.name;
  }
  if (out === "done") { completeBuild(target, by); return out; }
  refreshPlot(c);
  return out;
}
/** The foundation's card, opened: which step, what's missing, what's next, who can lead it. */
function plotBlock(c) {
  if (!knowsStep(c)) { const st = stackOf(c), you = youStack(), who = st && you && board === "world" && dist(center(you), center(st)) < 600 ? builderNear(c, center(st)) : null; return `<p class="doing">${c.ledDay === day() ? "有人在这儿盖东西" : "一块划好的地基"}，看不出下一步要什么</p>` + (who ? `<button class="act" data-hintstep="${st.id}">比划着请人示范这一步</button>` : ""); }
  const stages = stagesOf(c), g = stageOf(c), at = c.stage ?? 0, left = Object.entries(c.need).filter(([, n]) => n > 0);
  const who = [...(me.known[c.build] ? ["你"] : []), ...BUILDS[c.build].who.map((k) => DEFS[k]?.name).filter(Boolean)];
  const done = c.work / g.work;
  return `<p class="doing">眼下：${g.name}${left.length ? `，还缺 ${left.map(([k, n]) => `${DEFS[k].name}×${n}`).join("、")}` : `，${done < 0.1 ? "刚起头" : done < 0.5 ? "做了一些" : done < 0.85 ? "过半了" : "快好了"}`}${g.thaw && season() === "冬" ? " · 地冻着，开春才能干" : ""}</p>`
    ;
}
/** You know how to put this up (or it's only clearing ground): then you can tell what it still needs. */
const knowsBuild = (c) => c.build === "farm" || Boolean(me.known[c.build]);
/** What a step was explained to you — or not — is decided in building.js (stepKnown); here we only pass the record. */
const knowsStep = (c) => Boolean(c.site) || stepKnown(c, me.known, me.buildHints);
/** Remember the step that was explained to you (by id: the foundation, not the craft). */
function noteStep(c) { (me.buildHints ??= {})[c.id] = { kind: c.build, stage: c.stage ?? 0, day: day() }; }
function forgetStep(c) { if (me.buildHints) delete me.buildHints[c.id]; }
/** A villager near the foundation who could lead this kind of work — the one you'd ask. */
function builderNear(c, at) {
  return npcs().filter((q) => q.board === "world" && !q.npc.inside && !q.indoors && npcSkill(q, c.build) >= LEAD && dist(center(q), at) < 600)
    .sort((a, b) => dist(center(a), at) - dist(center(b), at))[0] ?? null;
}
/** Why this step can't go on today, if it can't. */
function stepBlocked(c, st) {
  const g = stageOf(c);
  if (g.thaw && season() === "冬") return g.cold ?? "地冻着，挖不动，开春再说";
  if (g.tool && !(holds(st, g.tool) || (st.npc && g.tool === "hoe" && hoeReach(st)))) return `得带着${DEFS[g.tool].name}才能干`;
  return "";
}
function handIn(target, lift) {
  const c = target.cards[0], took = lift.cards.filter((x) => (c.need[x.key] ?? 0) > 0 && c.need[x.key]-- > 0);
  const rest = lift.cards.filter((x) => !took.includes(x));
  took.forEach((x) => x.el.remove());
  if (rest.length) { const you = youStack(); you.cards.push(...rest); }
  removeStack(lift);
  if (!took.length) sayHint(`plot-unused-${c.id}`, "这些地基用不上");
  refreshPlot(c);
}
function workPlot(st, target, automatic = false) {
  const c = target.cards[0], g = stageOf(c), deny = (key, text) => { if (!automatic) sayHint(key, text); };
  if (c.ledDay === day() && st.cards[0].key === "you" && builderNear(c, center(target))) noteStep(c);   // working beside someone who knows: this step is explained as you go
  const took = loose(st).filter((x) => (c.need[x.key] ?? 0) > 0 && c.need[x.key]-- > 0);
  if (took.length) { st.cards = st.cards.filter((x) => !took.includes(x)); took.forEach((x) => x.el.remove()); refreshPlot(c); carryChanged(); }
  const left = Object.entries(c.need).filter(([, n]) => n > 0);
  if (left.length) { if (!took.length) { const know = knowsStep(c); deny(`plot-${c.id}`, know ? `${g.name}还缺：${left.map(([k, n]) => `${DEFS[k].name}${n}`).join("、")}` : "这活儿没干过，不知道该备什么料"); } return; }
  if (isYou(st) && starving()) return deny("starving", "饿得干不动了，先去吃点东西");
  if (isYou(st) && spent()) return deny("spent", "没力气了，回屋睡一觉");
  const blocked = stepBlocked(c, st);
  if (blocked) return deny(`plot-${c.id}`, knowsStep(c) ? blocked : "这活儿眼下干不成，得找个会的人问问");
  const figuring = st.cards[0].key === "you" && !me.known[c.build];
  const chunk = Math.min(240, g.work - c.work), min = chunk * workPace() * (figuring ? 2 : 1);
  st.job = { r: { build: true, min: chunk, make: [] }, target, left: min, total: min, chunk, figuring };
  if (figuring) float("没盖过，边琢磨边盖……", center(st), st.board);
}
function finishBuildWork(st, target, figuring) {
  const c = target.cards[0], chunk = Math.min(240, stageOf(c).work - c.work);
  if (isYou(st)) {
    me.rest = Math.max(0, me.rest - chunk * 0.1);
    if (figuring) me.known[c.build] = { mem: 1, day: day() };
    else if (me.known[c.build]) me.known[c.build] = { mem: 1, day: day() };
  }
  c.ledDay = day();
  if (progressPlot(target, chunk) === "done") return;
  if (me.food > 20 && me.rest > 15) st.repeat = { target, at: clock.min + 5 };
  carryChanged();
}
function completeBuild(target, by = null) {
  const c = target.cards[0], kind = c.build;
  if (c.site) return finishSite(target, by);
  forgetStep(c);
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
  if (kind === "boat") launch(target);
  village.lastBuilt = { day: day(), name: `一个${DEFS[kind].name}` };
  if (by && heard(by, 900)) sfx("build");
  if (by) { chronicle(`${nameOf(by)}弄好了一个${DEFS[kind].name}。`); return; }
  me.known[kind] = { mem: 1, day: day() };
  banner("✦", `${DEFS[kind].name}${kind === "boat" ? "造好了" : "盖好了"}`); chronicle(kind === "boat" ? "造好了一条小船。" : `盖起了一座${DEFS[kind].name}。`);
  naming = nc; $("nameInput").value = DEFS[kind].name; $("namer").hidden = false; $("nameInput").focus();
}
/** Broken ground becomes a field: empty until you sow it, its furrows painted on the land. */
function completeField(target, by = null) {
  const c = target.cards[0], nc = newCard("field", 0);
  nc.sown = false; nc.soil = 2; nc.name = "新开的田";                  // raw ground: thin till it has been fed nc.el.querySelector(".card-head span").textContent = nc.name; refreshStock(nc);
  c.el.remove(); cardsLayer.append(nc.el);
  target.cards = [nc]; target.w = nc.w; target.h = nc.h;
  const p = center(target);
  (MAP.extraFields ??= []).push({ patch: "field", x: p.x, y: p.y, ...FIELD_SIZE, card: nc });   // the same size as the old fields; painted by paintSeason below
  for (let k = eco.length - 1; k >= 0; k--) if (Math.abs(eco[k].x - p.x) < FIELD_SIZE.w / 2 && Math.abs(eco[k].y - p.y) < FIELD_SIZE.h / 2) eco.splice(k, 1);   // the saplings go with the clearing
  paintSeason();
  village.lastBuilt = { day: day(), name: "一块新田" };
  if (by && heard(by, 900)) sfx("build");
  if (by) { chronicle(`${nameOf(by)}开出了一块新田。`); return; }
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
  if (target.cards[0].site) return cancelSite(st, target);
  forgetStep(target.cards[0]);
  const c = target.cards[0];
  // a foundation gives back everything handed in; a finished building half of what went into it
  const back = c.key === "plot" ? Object.entries(delivered(c)) : Object.entries(c.built.spent).map(([k, n]) => [k, Math.floor(n / 2)]);
  const cards = back.flatMap(([k, n]) => Array.from({ length: n }, () => newCard(k))).concat((c.items ?? []).map((k) => newCard(k)));
  if (cards.length) { cards.forEach((x) => cardsLayer.append(x.el)); newStack(cards, target.x + 20, target.y + 20, "world"); }
  c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); removeStack(target);
  wearTool(st, "hammer");
  me.rest = Math.max(0, me.rest - r.min * 0.1);
  float("拆了，料拿回来了", center(st), st.board); carryChanged();
}

// ---------------------------------------------------------------------------
// Little things
// ---------------------------------------------------------------------------
const DOING = { guard: "守着公仓", eat: "吃饭", wait: "等饭", tend: "锄地", harvest: "收粟", dig: "挖黏土", drop: "放东西", fetch: "取粟", cook: "煮饭", watch: "在火塘边歇着", fish: "在湖边捞鱼", give: "送鱼去灶上", sleep: "回去睡觉", evening: "在火塘边坐着", chop: "砍树", pick: "挖石头", store: "把东西送回家", sow: "播种", seed: "去公仓拿种子", hide: "躲老虎", gather: "去采材料", fetchHome: "回家拿材料", craft: "做东西", jarIn: "把陶罐放进公仓", build: "盖房子", forage: "摘野果", tidy: "翻公仓里的粟", shelter: "在火塘边避雨", cut: "割芦苇", feast: "过节", arrive: "刚来，往灶边走", supply: "往地基上送材料", stoke: "给火塘添柴", plant: "补种小树", manure: "往地里上肥", water: "挑水浇地", place: "往田里立东西", stash: "把东西收回家", useFresh: "把快坏的吃的下锅", stashAll: "收工，把东西放回家" };
/** What a wild animal is at, in words: asleep, lying up, or about. */
function animalDoing(st) {
  const kind = st.critter?.kind;
  if (!kind) return "";
  if (st.critter.hunt) return "在林子里撵猎物";
  if (!isActive(kind, hour())) return isAsleep(kind, hour()) ? "这个时辰在背静处睡着" : "卧在背静处，时不时动一动";
  return st.walk ? "在林子里走动" : "在林子里歇脚";
}
function showDetail(card) {
  const d = { ...DEFS[card.key], ...(card.name ? { name: card.name } : {}) }, st = stackOf(card), box = $("detail");
  const rope = Boolean(me.ropeHung && (card.key === "cliffFoot" || card.key === "cliffTop")), snowy = card.key === "pineGrove" && card.el.dataset.sourceStage === "snowgreen";

  const ghost = card.el.classList.contains("ghost");
  const doing = st.npc ? (ghost ? "不在你眼前" : st.npc.inside ? "睡着了" : st.musing ? "站着出神" : st.job ? `在${st.job.npcTask === "stoke" && st.goal === "stove" ? "往灶里添柴" : DOING[st.job.npcTask] ?? "忙"}` : st.walk ? "在赶路" : "") : "";   // what you see them doing, not where they're off to
  const mine = st === youStack() && d.type === "food";
  const fresh = KEEPS[card.key] && card.made !== undefined && daysLeft(card, st) <= 1 ? "闻着有点不对了" : "";   // you can tell when it's on the turn, not how long it'll keep
  const trust = !awake(st) ? "" : st.npc?.visitor ? tradeBlock(st) : st.npc && PD(st) ? socialBlock(st) : st.npc ? `<p class="doing">${st.npc.retired ? "上一代当家的" : family().kids.includes(st.npc.key) ? "你家的孩子" : (family().siblings ?? []).includes(st.npc.key) ? "你的兄弟姐妹" : "村里的人"} · ${looksAge(npcAge(st.npc))}</p>` : "";
  const inside = d.type === "house" ? allStacks().filter((s) => s.npc?.inside && s.npc.home === card.key).map((s) => DEFS[s.npc.key].name) : [];
  const pile = d.type === "house" ? boards.tao.find((s) => s.store)?.cards ?? [] : [];
  const stored = [...new Set(pile.map((c) => DEFS[c.key].name))];
  const combat = card === st.cards[0] ? combatBlock(st) : "";
  const soil = isField(st) ? (card.sown !== false ? `种着${DEFS[card.crop ?? "grain"].name}` : card.fallow ? "今年歇着" : card.lastCrop ? `上一季种的${DEFS[card.lastCrop].name}` : "") : "";
  const granary = card.key === "granary" && card.jars ? "囤边码着几只陶罐，多存了些" : "";
  const boatTip = card.key === "boat" && !me.aboard ? "拖住小船可以拿起来，拖到水上放下去就能划" : "";
  const counts = (keys) => Object.entries(keys.reduce((n, k) => ({ ...n, [k]: (n[k] ?? 0) + 1 }), {}));
  const heap = card.key === "compost" ? ((card.heap ?? 0) > 0 ? "坑里沤着东西，沤好了的肥会送回院里" : "坑是空的") : "";
  const barn = card.key === "barn" || card.key === "chest" ? `<div class="barn-items">${counts(card.items).map(([k, n]) => `<button data-take="${k}" data-from="${st.id}" title="拿一份${DEFS[k].name}">${iconFor(DEFS[k].icon)}<b>${n}</b></button>`).join("") || `<p class="doing">空的</p>`}</div>` : "";
  const plotInfo = card.key === "plot" ? plotBlock(card) : "";
  const sleeper = card.key === "bed" || card.key === "hut" ? [...bedPlan()].filter(([, b]) => b === st).map(([q]) => nameOf(q)) : [];
  const bedInfo = card.key === "bed" || card.key === "hut" ? (sleeper.length ? `睡这儿的：${sleeper.join("、")}` : "还空着") : "";
  const left = st.cards.slice(1).filter((c) => DEFS[c.key].type === "tool" && DEFS[card.key].type === "source");
  const toolsHere = left.length ? `这儿放着：${left.map((c) => DEFS[c.key].name).join("、")}` : "";
  const here = [...new Map(RECIPES.filter((r) => r.needs[0] === card.key && craftRecipe(r) && invented(r) && (!r.id || me.known[r.id])).map((r) => [r.id ?? r.make[0], r])).values()];
  const station = here.length ? `<div class="crafts">${here.map(craftRow).join("")}</div>` : "";
  if (card.key === "workbench" && me.guide) (me.guide.flags ??= {}).openedBook = true;
  const theirs = st.npc && awake(st) ? CRAFTS.filter((r) => r.who.includes(card.key)) : [];
  const skills = theirs.length && st.board === board && dist(center(youStack()), center(st)) < 600 ? `<button class="act" data-teach="${st.id}">在旁边看着学</button>` : "";   // what they know, you find out by asking
  const meal = card.key === "table" && (find("stove")?.cards[0].stock ?? 0) > 0 ? `<button class="act" data-meal="${st.id}">上桌吃饭</button>` : "";
  const pole = card.key === "calendarStick" ? readPole() : "";
  const pot = card.key === "table" ? `锅里：${amountWord(find("stove")?.cards[0] ?? { stock: 0, key: "stove" })}` : "";
  const grip = st === youStack() && card.at !== "held" && wearable(card, "held") ? `<button class="act" data-hold="${card.id}">拿在手上</button>` : "";
  const fixBtn = st === youStack() && d.fixes ? (holds(st, d.fix) ? `<button class="act" data-mend="${card.id}">用${DEFS[d.fix].name}${d.fixes === "net" ? "补上" : "绑好"}</button>` : `<p class="doing">身上没有${DEFS[d.fix].name}</p>`) : "";
  const group = cardGroups(st).find((part) => part.card === card);
  const bundle = !st.npc && group && group.end - group.start > 1 && pickable(card) ?
    `<button class="act" data-single="${card.id}">${st === youStack() ? "放下一份" : "拿起一份"}</button>` : "";
  const stats = [
    doing, st.critter ? animalDoing(st) : "",
    rope ? "一根攀绳从崖沿垂下来" : "",
    snowy ? "枝头落了雪，针叶还是深绿" : "",
    card.stock !== undefined && d.type !== "source" ? `${d.stockLabel ?? "还剩"}：${amountWord(card)}` : "",
    card.fuel !== undefined ? `火：${fireWord(card.fuel)}` : "",
    card.key === "lake" ? (tide.level > 0.3 ? "涨潮，水漫上了沙滩" : tide.level < -0.3 ? "退潮，露出一圈湿沙，鱼好捞" : "平潮") : "",
    card.uses !== undefined && !BREAKS[card.key] ? (card.uses / (d.uses ?? card.uses) > 0.5 ? "还新" : card.uses / (d.uses ?? card.uses) > 0.2 ? "用旧了" : "快不行了") : "",
    card.charges ? (card.charges > 1 ? "罐里还有" : "罐底还剩一口") : "",
    card.key === "salt" ? "能腌鱼腌肉，放得久" : "",
    card.key === "shell" ? "能串成珠串" : "",
    card.key === "shellBeads" ? "拿去换东西，人家稀罕" : "",
    card.key === "saltedFish" || card.key === "saltedMeat" ? "腌过，放得住" : "",
    fresh, soil, heap, granary, boatTip, bedInfo, pot, pole, toolsHere,
    inside.length ? `屋里：${inside.join("、")}` : "",
    stored.length ? `家里存着：${stored.join("、")}` : "",
    st.ctl ? `听你安排（${{ auto: "自己安排", work: "按你派的活", manual: "你来指挥" }[st.ctl.mode]}）` : "",
  ].filter(Boolean).slice(0, 2);
  box.innerHTML = `<div class="detail-head t-${d.type}">${iconFor(d.icon)}<b>${d.name}</b></div>`
    + stats.map((t) => `<p class="doing">${t}</p>`).join("")
    + `${trust}${meal}${grip}${fixBtn}${bundle}${mine ? `<button class="act" data-eat="${card.id}">吃掉</button>` : ""}${combat}${plotInfo}${barn}${station}${skills}`;
  box.hidden = false;
  const place = card.at && st.cards[0].key === "you" ? $("inv").querySelector(`[data-slot="${card.at}"]`) : null, r = (place ?? card.el).getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - box.offsetWidth - 8, place ? r.left : r.right + 8))}px`;
  box.style.top = `${Math.max(8, Math.min(window.innerHeight - box.offsetHeight - 8, place ? r.top - box.offsetHeight - 8 : r.top))}px`;
}
$("detail").addEventListener("click", (e) => {
  const meal = e.target.closest("[data-meal]");
  if (meal) {
    const stove = boards[board].find((st) => st.id === Number(meal.dataset.meal));
    if (stove) { hideDetail(); walkTo(youStack(), center(stove), stove, "meal"); }
    return;
  }
  const fix = e.target.closest("[data-mend]");
  if (fix) { const card = cardById(fix.dataset.mend), you = youStack(); if (card && you && mend(you, card)) { me.rest = Math.max(0, me.rest - 2); clock.min += 15; carryChanged(); } hideDetail(); return; }
  const grip = e.target.closest("[data-hold]");
  if (grip) { const card = cardById(grip.dataset.hold), you = youStack(); if (card && you?.cards.includes(card)) { hold(you, card); carryChanged(); } hideDetail(); return; }
  const single = e.target.closest("[data-single]");
  if (single) { const card = cardById(single.dataset.single); if (card) splitOne(card); return; }
  const b = e.target.closest("[data-eat]");
  if (b) { const card = cardById(b.dataset.eat); if (card) eatCarried(card); return; }
  const take = e.target.closest("[data-take]");
  if (take) { takeFromBarn(allStacks().find((s) => s.id === Number(take.dataset.from)), take.dataset.take); return; }
  const step = e.target.closest("[data-hintstep]");
  if (step) { const plot = allStacks().find((q) => q.id === Number(step.dataset.hintstep)); const who = plot && builderNear(plot.cards[0], center(plot)); if (plot && who) learnStep(plot, who); return; }
  const ask = e.target.closest("[data-teach]");
  if (ask) { const npc = allStacks().find((s) => s.id === Number(ask.dataset.teach)); hideDetail(); if (npc) teach(npc); return; }
  const hunt = e.target.closest("[data-hunt]");
  if (hunt) { const card = cardById(hunt.dataset.hunt); if (card) huntTarget(stackOf(card), hunt.dataset.strike); hideDetail(); return; }
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
  if (!st || !you || st.npc || st.board !== you.board || !pickable(card)) return;
  const part = cardGroups(st).find((group) => group.card === card);
  if (!part || part.end - part.start < 2) return;
  if (dist(center(st), center(you)) > moveRange()) return sayHint(`split-far-${st.id}`, "再走近一点");
  if (st !== you && full(you, card.key)) return sayHint("hands-full", "拿不下了");
  st.cards.splice(part.start, 1);
  if (st === you) {
    const p = board === "world" ? settle(st.x + CARD_W + 85, st.y + CARD_H / 2) : { x: st.x + CARD_W + 70, y: st.y + CARD_H / 2 };
    newStack([card], p.x - CARD_W / 2, p.y - CARD_H / 2, board);
  } else you.cards.push(card);
  carryChanged(); hideDetail();
}
function hideDetail() { $("detail").hidden = true; $("menu").hidden = true; $("menuBtn").setAttribute("aria-expanded", "false"); }
/** What you can tell about someone from knowing them: never their numbers — how close you are, what they remember, what you've learned. */
function socialBlock(st) {
  const n = soc(st.npc), P = PD(st), you = youStack(), near = st.board === board && you && dist(center(you), center(st)) < 600;
  const mood = moodWord(n), mems = n.mem.slice(0, 2).map((m) => `<li>${m.text}${m.day === day() ? "（今天）" : `（第 ${m.day} 天）`}</li>`).join("");
  const K = n.known, facts = [K.fear, K.loves.length && `爱：${K.loves.map((k) => DEFS[k].name).join("、")}`, K.dislikes.length && `不爱要：${K.dislikes.map((k) => DEFS[k].name).join("、")}`, K.birthday && `生日：${dayName(K.birthday)}`].filter(Boolean);
  const btn = (act, label, ghost) => `<button class="act${ghost ? " ghost" : ""}" data-social="${act}" data-id="${st.id}">${label}</button>`;
  let req = "";
  if (n.req?.state === "asked") req = `<div class="req"><p>托你：${askOf(st).why}</p>${near ? btn("accept", "点头答应") + btn("decline", "摇摇头", true) : ""}</div>`;
  else if (n.req?.state === "accepted") {
    const left = Object.entries(n.req.need).filter(([, v]) => v > 0), can = left.some(([k]) => loose(you).some((c) => c.key === k));
    req = `<div class="req"><p>答应了${P.he}：${askOf(st).why}${left.length ? `，还差 ${left.map(([k, v]) => `${DEFS[k].name}×${v}`).join("、")}` : ""}</p>${near ? (can ? btn("deliver", `交给${P.he}`) : "") + btn("decline", "摆手：办不成了", true) : ""}</div>`;
  }
  const kin = family().spouse === st.npc.key ? "你的另一半" : family().parent === st.npc.key ? "你家里的长辈" : "";
  const famBtns = near ? (canCourt(st) ? btn("court", "求亲") : "") + (family().spouse === st.npc.key && canHaveChild() ? btn("child", "想要个孩子") : "") : "";
  return `<p class="doing">${kin ? `${kin} · ` : ""}${tierOf(hearts(n)).name}${mood ? ` · ${mood}` : ""} · ${looksAge(npcAge(st.npc))}</p>${famBtns ? `<div class="social-acts">${famBtns}</div>` : ""}${"" ? `<p class="doing">${P.he}记得：</p><ul class="mems">${mems}</ul>` : ""}`
    + `${req}`
    + (near ? `<div class="social-acts">${btn("talk", "凑过去听听")}${btn("plan", "比划：在忙啥")}</div>${villageExchangeBlock(st)}` : "");
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
    <label><input type="checkbox" name="credit">不够可以欠人情${owed ? "（已经欠着人家）" : ""}</label>
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
  if (act === "talk") { if (hearts(soc(st.npc)) >= 1 && randomVoice() < 0.35) askNews(st); else talk(st, you); }   // a chat turns to the news now and then
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
  const k = me.known[r.id], mem = k ? k.mem : 0, name = r.id ? craftName(r.id) : DEFS[r.make[0]].name;
  const ins = r.build
    ? Object.entries(BUILDS[r.id].needs).map(([n, c]) => `<span title="${DEFS[n].name} ${c}">${iconFor(DEFS[n].icon)}<sub>${c}</sub></span>`).join("")
    : r.needs.slice(1).map((n) => `<span title="${DEFS[n].name}">${iconFor(DEFS[n].icon)}</span>`).join("");
  return `<div class="craft" title="${name}"><span class="at" title="在${DEFS[r.needs[0]].name}">${iconFor(DEFS[r.needs[0]].icon)}</span><span class="ins">${ins}</span><b>→</b>`
    + `<span title="${name}">${iconFor(DEFS[r.make[0]].icon)}</span><em class="craft-name">${name}</em>${r.id ? `<i class="mem${mem < 0.35 ? " fading" : ""}" title="${mem < 0.35 ? "快忘了" : "记得"}"><u style="width:${Math.round(mem * 100)}%"></u></i>` : ""}</div>`;
}
/** Your book of know-how: everything you can make, and how fresh it is. */
function renderCrafts() {
  const box = $("crafts");
  if (!box || box.hidden) return;
  const mine = CRAFTS.filter((r) => me.known[r.id]);
  const builds = Object.keys(BUILDS).filter((id) => !HOUSE_KINDS.has(id) && invented(BUILDS[id]) && (id === "farm" || me.known[id])).map((id) => `<div class="build-row">${craftRow(CRAFTS.find((r) => r.id === id))}<button class="act" data-place="${id}">${id === "farm" ? "选块草地开荒" : "选地方打地基"}</button></div>`).join("");
  box.innerHTML = `<b>你会的手艺</b>${mine.filter((r) => !r.build).map(craftRow).join("") || `<p>还什么都不会。</p>`}<b class="sub">盖房子</b>${builds || `<p class="doing">还不会盖什么。</p>`}`;
}
/** A villager speaks only to somebody: the nearest one awake within earshot — another villager, or you. Nobody there,
 *  nothing is said. A villager spoken to answers in a word or two, so it goes back and forth; you only listen (you
 *  don't speak). reply: false for a shout (a warning, a cry in a fight), which nobody stops to answer. */
const REPLIES = ["“嗯。”", "“晓得了。”", "“好。”", "“是这么回事。”", "“那你去吧。”", "“嗯，我也这么想。”", "“行。”", "（点了点头）"];
function tell(st, text, { r = 260, reply = true } = {}) {
  if (!text || !awake(st)) return false;
  const p = center(st), to = [...npcs(), youStack()].filter((q) => q && q !== st && q.board === st.board && awake(q) && !q.lifted && dist(center(q), p) < r)
    .sort((a, b) => dist(center(a), p) - dist(center(b), p))[0];
  if (!to) return false;
  if (heard(st)) say(st, text);
  if (to.npc) {
    face(st, to); face(to, st);
    if (reply && !to.npc.visitor && !littleOne(to)) talks.push({ at: clock.min + 5, st: to, partnerId: st.id, text: pickLine(REPLIES) });
  } else face(st, to);
  return true;
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
/** A few words over a spot on the board — only where you are and can see it: what happens out of sight goes unsaid. */
function float(text, p, b = board) {
  const you = youStack();
  if (b !== board || (b === "world" && (!you || dist(p, center(you)) > 900))) return;
  const f = document.createElement("div");
  f.className = "float"; f.textContent = text; f.style.left = `${p.x}px`; f.style.top = `${p.y - 60}px`;
  layerOf(b).append(f);
  setTimeout(() => f.remove(), 1300);
}
let toastT = 0;
const hintAt = new Map();
/** The same words said twice in a breath are said once: a card changing already tells you the step went on. */
const shownAt = new Map();
/** A short word when something can't be done: the same thing, for the same reason, isn't said twice in three seconds. */
function sayHint(key, text) { const now = performance.now(); if (now - (hintAt.get(key) ?? -Infinity) < 3000) return; hintAt.set(key, now); toast(text); }
const messages = [];                                  // what's been said in toasts, newest last — for the 记 panel
function toast(t) { const now = performance.now(); if (now - (shownAt.get(t) ?? -Infinity) < 3000) return; shownAt.set(t, now); sfx("toast"); messages.push({ at: clock.min, text: t }); if (messages.length > 80) messages.shift(); if (!$("logBook").hidden) renderLog(); const el = $("toast"); el.textContent = t; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2400); }
function banner(big, small) { sfx("banner"); const b = $("banner"); b.innerHTML = `<b>${big}</b><span>${small}</span>`; b.hidden = false; b.classList.remove("show"); void b.offsetWidth; b.classList.add("show"); clearTimeout(banner.t); banner.t = setTimeout(() => (b.hidden = true), 1800); }

$("speed").addEventListener("click", (e) => { const b = e.target.closest("[data-speed]"); if (b) setSpeed(Number(b.dataset.speed)); });
function setSpeed(s) {
  clock.speed = s;
  const step = s ? 1 / (MIN_PER_SEC * s) : 0.12;                       // one game minute between positions
  document.documentElement.style.setProperty("--step-time", `${Math.min(0.5, Math.max(0.04, step)).toFixed(3)}s`);
  document.querySelectorAll("[data-speed]").forEach((b) => b.classList.toggle("on", Number(b.dataset.speed) === s)); table.classList.toggle("paused", s === 0);
}
let lastSpeed = 1;
document.addEventListener("keydown", (e) => { if (e.code === "Space" && !e.target.closest?.("button, input, select, textarea, summary")) { e.preventDefault(); if (clock.speed) { lastSpeed = clock.speed; setSpeed(0); } else setSpeed(lastSpeed); } });
$("help").onclick = () => { $("helpbox").hidden = false; };
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
  $("soundIcon").textContent = soundSettings.muted ? "♪̸" : "♪";
}
$("soundBook").addEventListener("input", (e) => {
  const v = e.target.closest("[data-vol]"); if (v) setVolume(v.dataset.vol, Number(v.value));
  const m = e.target.closest("[data-mute]"); if (m) { setVolume("muted", m.checked); $("soundIcon").textContent = m.checked ? "♪̸" : "♪"; }
});
$("logBtn").onclick = () => { const b = $("logBook"); b.hidden = !b.hidden; $("crafts").hidden = true; $("villageBook").hidden = true; renderLog(); };
/** The 记 panel: what was said in toasts and what went into the village history since you sat down, newest first. */
function renderLog() {
  const when = (m) => { const ago = day() - dayAt(m); return `${ago <= 0 ? "今天" : ago === 1 ? "昨天" : ago === 2 ? "前天" : "前些日子"}${dayPart(((m % 1440) / 60))}`; };
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
$("meFace").addEventListener("click", () => (me.playing ? play(null) : repeatRecent(0)));
$("autoMe").addEventListener("click", () => {
  if (me.aboard) { stopAuto(); return toast("在船上先靠岸，再开自动"); }   // auto walks the land, not the water
  if (me.playing) return toast("先换回自己，再开自动");
  me.auto = !me.auto;
  if (me.auto) autoYou(true); else clearAuto();
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
/** The first place along the wall with no bed in it, or null when the yard's full. */
function freeBedSlot() {
  if (!MAP.house) return null;
  const taken = boards.world.filter((b) => b.cards[0].key === "bed");
  for (let i = 0; i < BED_SLOTS.length; i++) { const p = bedSlot(i, MAP.house); if (!taken.some((b) => Math.abs(b.x - p.x) < 40 && Math.abs(b.y - p.y) < 40)) return p; }
  return roomBedSpot();
}
/** A place for a bed in a room someone built: along the walls from the top-left, clear of the doors and of what's there. */
function roomBedSpot(rooms = works.rooms.filter((r) => isRoofed(r) && !["院子", "仓房"].includes(roomLabel(r)))) {
  const W = CARD_W, H = CARD_H, inset = 12;
  for (const room of rooms) {
    const own = new Set(room.cells.map(([i, j]) => `${i},${j}`)), doors = room.doors.map(segMid);
    const fits = (x, y) => [[x, y], [x + W, y], [x, y + H], [x + W, y + H], [x + W / 2, y + H / 2]].every(([px, py]) => own.has(`${Math.floor(px / GRID)},${Math.floor(py / GRID)}`));
    for (const [ci, cj] of room.cells) {
      for (const [x, y] of [[ci * GRID + inset, cj * GRID + inset], [(ci + 1) * GRID - W - inset, cj * GRID + inset]]) {
        if (!fits(x - inset + 1, y - inset + 1) || !fits(x, y)) continue;
        if (doors.some((d) => d.x > x - 40 && d.x < x + W + 40 && d.y > y - 40 && d.y < y + H + 40)) continue;
        if (boards.world.some((q) => !q.npc && !q.critter && !q.pet && !q.site && q.x < x + W && q.x + q.w > x && q.y < y + H && q.y + q.h > y)) continue;
        return { x, y };
      }
    }
  }
  return null;
}
/** A new bed goes in the next free place along the wall — its own card. No room left: it waits on the heap. */
function layBed(st, card) {
  st.cards = st.cards.filter((c) => c !== card);
  const at = freeBedSlot();
  if (!at) { cardsLayer.append(card.el); homePile()?.cards.push(card) ?? newStack([card], st.x + 40, st.y + 40, "world"); toast("屋里摆不下铺位了，得接一间屋"); carryChanged(); return; }
  const bed = newStack([card], at.x, at.y, "world");
  cardsLayer.append(card.el);
  if (!st.npc) float("铺好了", center(bed), "world");
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
    piratesDone: Boolean(village.piratesDone), salt: pileCount("salt") + (youStack()?.cards.filter((c) => c.key === "salt").length ?? 0),
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
  const bed = who && (freeBed() ?? freeBedSlot());                   // a bed for them, or room to put one down
  if (who && !bed) village.wantsRoom = true;                          // someone would come if there were room: the village builds on
  if (!who || !bed) return;
  village.wantsRoom = false;
  const t = MAP.tiles[who.from[0]], p = settle(t.x + t.w * who.from[1], t.y + t.h * who.from[2]);
  const order = npcs().length;
  const st = placeCard(who.key, p);
  st.npc = { key: who.key, order, home: "taoHouse", job: who.job, hunger: 3, wait: 0, inside: false, kit: [], arriving: true, born: bornFor(PEOPLE_DATA[who.key]?.age ?? 25),
    wake: 5.6 + order * 0.2, sleep: 20.2 + (order % 4) * 0.25, outAt: 0, nextChat: clock.min + 240, bed: bed.cards ? center(bed) : { x: bed.x + CARD_W / 2, y: bed.y + CARD_H / 2 } };
  village.nextArrival = clock.min + 1.5 * 1440;
  explore(p);
  toast(`有人${who.how}，正往灶边走`);
}
/** The newcomer reaches the stove and says who they are. */
function welcome(st) {
  const who = NEWCOMERS.find((c) => c.key === st.npc.key);
  st.npc.arriving = false;
  tell(st, who.intro, { r: 500 });
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
  if (f.feast) addMeals(f.feast, stove);
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
  if (aunt) talks.push({ at: clock.min + 150, st: aunt, text: `“今天${f.name}，天黑都到院里来。”` });
}
/** The village book: the ladder (where you are, what is left), who lives here, and the history. */
function renderVillage() {
  const box = $("villageBook"); if (!box || box.hidden) return;
  const v = villageNow();
  const ladder = LADDER.slice(0, village.rung + 1).map((r, i) => {                 // what's done and what's next; beyond that nobody knows yet
    const done = i < village.rung, cur = i === village.rung;
    const conds = cur ? `<ul>${r.conds.map((c) => `<li class="${condDone(c, v) ? "ok" : ""}">${c.text}${c.value && !condDone(c, v) ? `：${progressWord(c.value(v), c.need)}` : ""}</li>`).join("")}</ul>` : "";
    return `<div class="rung${done ? " done" : cur ? " cur" : ""}"><b>${done ? "✓ " : ""}${r.name}</b>${conds}</div>`;
  }).join("");
  const folks = npcs().filter((s) => !s.npc.arriving).map((s) => `<span title="${DEFS[s.npc.key].name}">${iconFor(DEFS[s.npc.key].icon)}<b>${DEFS[s.npc.key].name}</b><i>${tierOf(hearts(soc(s.npc))).name}</i></span>`).join("");
  const hist = [...village.chronicle].reverse().map((c) => `<li><i>第 ${c.year} 年 · ${c.season}天</i>${c.text}</li>`).join("") || "<li>还没有什么可记的。</li>";
  const ideas = THEORIES.filter((t) => lore.theories[t.id]).map((t) => `<li><b>${t.label}</b>${t.claim}<i>${DEFS[lore.theories[t.id].by]?.name ?? ""}琢磨出来的</i></li>`).join("");
  const customs = THEORIES.filter((t) => t.custom && lore.customs.includes(t.custom.id)).map((t) => `<li><b>${t.custom.name}</b>${t.custom.text}</li>`).join("");
  const made = INVENTIONS.filter((i) => lore.inventions[i.id]).map((i) => { const by = lore.inventions[i.id].by; return `<li><b>${i.name}</b>${DEFS[by]?.name ?? ""}想到的，可以找${PEOPLE_DATA[by]?.he ?? "他"}请教</li>`; }).join("");
  const needs = Object.entries(lore.needs).filter(([, n]) => n >= 1).map(([k]) => NEEDS[k]).filter(Boolean);
  const f = family(), kids = f.kids.map((k) => npcs().find((q) => q.npc.key === k)).filter(Boolean);
  const home = `<b class="sub">你家（第 ${me.gen ?? 1} 代）</b><p class="doing">${me.name ?? "启禾"}，${myAge()} 岁${f.spouse ? ` · 另一半：${DEFS[f.spouse]?.name}` : ""}${kids.length ? ` · 孩子：${kids.map((q) => `${nameOf(q)}（${npcAge(q.npc)} 岁）`).join("、")}` : ""}${me.expecting ? " · 家里要添人了" : ""}</p>`
    + (heirs().length ? `<button class="act" data-passon="1">退下来，把家交给${nameOf(heirs()[0])}</button>` : "");
  box.innerHTML = `<b>村子</b><div class="ladder">${ladder}</div>${home}<b class="sub">村里的人${v.beds < v.people ? "（铺位不够睡了）" : ""}</b><div class="folks">${folks}</div>`
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
const KEEPS = { herb: 6, fish: 2, meat: 2, berry: 2, clam: 2, egg: 4, peachFruit: 2, jujubeFruit: 4, mushroom: 3, roastFish: 3, roastMeat: 3, cooked: 2, jarFull: 4, smokedFish: 12, smokedMeat: 12, saltedFish: 20, saltedMeat: 20 };
const SHORE = ["reeds", "nest", "pit"];
const flooded = (key) => nature.flood && SHORE.includes(key);
const GROVE_KEYS = new Set(["chestnut", "pineGrove"]);
/** A grove someone has just taken the last wood from. */
const markCut = (t) => { if (GROVE_KEYS.has(t.key) && (t.stock ?? 0) <= 0) t.cutBare = true; };
function natureDay() {
  const s = season(), rain = weather.now === "雨";
  foodGrows();
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
  const veg = (village.veg ??= { changed: {}, cutDays: {}, grown: [] });
  for (const q of boards.world) if (GROVE_KEYS.has(q.cards[0].key) && (q.cards[0].stock ?? 0) <= 1 && season() !== "冬") veg.cutDays[q.cards[0].id] = (veg.cutDays[q.cards[0].id] ?? 0) + 1;
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
  if ((homePile()?.cards.length ?? 0) > 8) needUp("clutter");
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
      toast(`院里露天堆得太多，淋雨沤坏了一些${rot ? "，倒进了堆肥坑" : ""}`);
      if (!nature.pileRotNoted) { nature.pileRotNoted = true; chronicle("院里露天堆的东西太多，一场雨沤坏了不少。得有个能遮雨的地方放。"); }
      needUp("clutter", 2);
    }
  }
  spoil();
  breed();
  rangeDay();
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
  if (ev.omen) { st.pending = { id: ev.id, day: day() + 1 }; omen(ev.omen); sfx("omen"); return; }   // word gets round
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
      const lost = Math.max(1, Math.ceil(g.stock * harm(diff, 0.25)));
      g.stock -= lost; refreshStock(g); needUp("preserve-food");
      say1("公仓闹了耗子，粟被祸害了一些。");
    }
  }
  if (id === "fever" && folk.length) {
    const q = folk[Math.floor(randomWorld() * folk.length)], n = q.npc;
    n.sickUntil = clock.min + 2 * 1440 * harm(diff, 1);
    if (pileCount("herb")) { const pile = homePile(), h = pile?.cards.find((c) => c.key === "herb"); if (h) { pile.cards = pile.cards.filter((c) => c !== h); h.el.remove(); n.sickUntil = clock.min + 720; } chronicle(`${nameOf(q)}发了烧，喝了院里存的药草，躺半天就好。`); }
    else chronicle(`${nameOf(q)}发了烧，躺倒了，这两天干活没力气。家里要是存着药草就好了。`);
  }
  if (id === "cold-snap") { nature.coldSnapUntil = day() + 1; if (season() === "冬") setWeather("雪", 0.85); say1("寒潮来了，这两天火塘和灶一天要烧两天的柴。"); }
  if (id === "fire") {
    const pile = homePile();
    if (pile) {
      const burnt = pile.cards.filter((c) => ["reed", "fiber", "log", "wood"].includes(c.key) && randomWorld() < harm(diff, 0.3));
      pile.cards = pile.cards.filter((c) => !burnt.includes(c)); burnt.forEach((c) => c.el.remove());
      say1(burnt.length ? "院里起了火，堆着的柴草烧掉了一些。" : "院里窜起一股火苗，好在扑得快。");
    }
  }
  if (id === "quarrel" && folk.length >= 2) {
    const [a, b] = folk.slice().sort((x, y) => (x.npc.mood ?? 6) - (y.npc.mood ?? 6));
    for (const q of [a, b]) { q.npc.mood = Math.max(0, (q.npc.mood ?? 6) - 1.5); q.npc.nextChat = clock.min + 1440; }
    say1(`${nameOf(a)}和${nameOf(b)}为一点小事吵了起来，一天没说话。`);
  }
  return ev;
}
// ---------------------------------------------------------------------------
// The wood creeps and retreats (vegetation.js): saplings at its edge each spring, grown in four years; hard cutting
// gives its edge back to grass. Changes to the ground are kept in village.veg and laid over the generated map on load.
// ---------------------------------------------------------------------------
function setGround(i, c) {
  MAP.cls[i] = c; (village.veg ??= { changed: {}, cutDays: {}, grown: [] }).changed[i] = c;
  if (MAP.trees) MAP.trees[i] = c === G.FOREST ? 1 : 0;
}
function applyVeg() {
  const ch = village.veg?.changed;
  if (!ch) return;
  for (const [i, c] of Object.entries(ch)) { MAP.cls[i] = c; if (MAP.trees) MAP.trees[i] = c === G.FOREST ? 1 : 0; }
  MAP._fields = null; MAP._base = {};
}
function vegetationSpring() {
  const v = (village.veg ??= { changed: {}, cutDays: {}, grown: [] });
  // saplings a year older; the grown ones turn the ground under them to wood
  let matured = 0;
  for (let k = eco.length - 1; k >= 0; k--) {
    const e = eco[k];
    if (!e.sapling) continue;
    Object.assign(e, ageSapling(e));
    if (!isMature(e)) continue;
    const i = MAP.idx(e.x, e.y);
    if (MAP.cls[i] === G.MEADOW) { setGround(i, G.FOREST); v.grown.push(i); matured++; }
    eco.splice(k, 1);
  }
  // seed on the grass at the wood's edge — not on roads, fields, the yard, by anything standing there, or up on the plateau
  const busy = (i) => {
    const p = { x: MAP.X(i), y: MAP.Y(i) };
    return MAP.road[i] || inJungle(p) || MAP.zoneAt(p.x, p.y) === "plateau" || rectHitsYard(p.x - 20, p.y - 20, 40, 40)
      || (MAP.extraFields ?? []).some((f) => Math.abs(f.x - p.x) < f.w / 2 + 30 && Math.abs(f.y - p.y) < f.h / 2 + 30)
      || boards.world.some((q) => !q.critter && !q.npc && !q.pet && dist(center(q), p) < 140) || eco.some((e) => dist(e, p) < 30);
  };
  let sprouted = 0;
  for (const i of edgeGrass(MAP.cls, MAP.cols, MAP.rows, G.FOREST, G.MEADOW, (i) => !busy(i))) if (randomWorld() < VEG.sprout) {
    eco.push({ x: MAP.X(i) + (randomWorld() - 0.5) * 20, y: MAP.Y(i) + (randomWorld() - 0.5) * 20, kind: "tree", size: 0.3, v: randomWorld(), sapling: true, age: 0 });
    sprouted++;
  }
  // a stand felled hard all year: the wood at its edge gives way to grass
  let thinned = 0;
  for (const g of groves()) if ((v.cutDays[g.cards[0].id] ?? 0) >= VEG.hardCut) for (const i of cellsToThin(MAP.cls, MAP.cols, MAP.rows, G.FOREST, G.MEADOW, center(g), 320, CELL)) { setGround(i, G.MEADOW); thinned++; }
  v.cutDays = {};
  // where the young wood has grown up together, a new stand of trees to cut
  for (const patch of patches(v.grown, MAP.cols, MAP.rows)) {
    if (patch.length < VEG.newStand) continue;
    const at = { x: patch.reduce((n, i) => n + MAP.X(i), 0) / patch.length, y: patch.reduce((n, i) => n + MAP.Y(i), 0) / patch.length };
    if (boards.world.some((q) => GROVE_KEYS.has(q.cards[0].key) && dist(center(q), at) < 400)) continue;
    placeCard("chestnut", at, 3);
    v.grown = v.grown.filter((i) => !patch.includes(i));
    chronicle("林子边上那片小树长成了，成了一片新的栗子林。");
  }
  if (matured || thinned) { MAP._fields = null; MAP._base = {}; pathCache.clear(); }
  if (sprouted && !v.noted) { v.noted = true; chronicle("开春了，林子边上冒出一圈小树苗。没人砍的话，过几年就长成林子。"); }
  if (matured) chronicle(`林子边上的小树长大了，又往外长了一片（${matured} 块）。`);
  if (thinned) chronicle(`林子砍得太狠，边上有 ${thinned} 块退成了草地。`);
}
/** Someone remarks on the signs, a little after dawn. */
function omen(text) { const who = npcs().find((q) => !q.npc.arriving); if (who) talks.push({ at: clock.min + 120, st: who, text }); }
/** Food left lying about (or carried) goes off; the pot on the stove turns in summer heat. */
function spoil() {
  const lost = [];
  for (const st of allStacks()) {
    if (st.critter) continue;                                       // in the yard, on the ground, in someone's hands: it all goes off
    const keep = st.cards.filter((c) => !(KEEPS[c.key] && c.made !== undefined && daysLeft(c, st) < 0));
    if (keep.length === st.cards.length) continue;
    st.cards.filter((c) => !keep.includes(c)).forEach((c) => { lost.push(DEFS[c.key].name); c.el.classList.add("gone"); setTimeout(() => c.el.remove(), 300); });
    if (!keep.length) removeStack(st); else st.cards = keep;
  }
  syncMeals();                                                    // bowls that went off came out of the pot too
  const rot = find("compost")?.cards[0];
  if (rot && lost.length) rot.heap = Math.min(12, (rot.heap ?? 0) + lost.length);
  markFreshness();
  if (lost.length) { toast(`放坏了：${[...new Set(lost)].join("、")}${rot ? "，倒进了堆肥坑" : ""}`); carryChanged(); observe("food-spoils", lost.length); needUp("preserve-food"); }
}
/** Days a food has left before it's spoiled: summer halves it. */
function daysLeft(c, st) {
  const keep = season() === "夏" ? Math.ceil(KEEPS[c.key] / 2) : KEEPS[c.key];
  return keep - (day() - c.made);
}
/** Food a day from going off looks it. */
function markFreshness() {
  for (const st of allStacks()) for (const c of st.cards) if (KEEPS[c.key] && c.made !== undefined) c.el.classList.toggle("stale", daysLeft(c, st) <= 1);
}
/** Animals have young in spring and summer — if any are left to have them; now and then one wanders in from the deep wood. */
/** Herds of a manageable size: one that has grown too big splits, the extra grown ones (and their young, who follow
 *  their mothers) going off to ground of their own. Anyone without a herd joins the nearest one with room, or starts one. */
const HERD_MAX = { wolf: 4, deer: 4, pheasant: 4, goat: 4 };
function sortHerds() {
  for (const [kind, max] of Object.entries(HERD_MAX)) {
    const all = groupMembers(kind), size = (h) => all.filter((q) => q.critter.herd === h).length;
    for (const q of all.filter((x) => x.critter.herd === undefined)) {
      const mum = q.critter.mother && all.find((x) => x.id === q.critter.mother && x.critter.herd !== undefined);
      const near = mum ?? all.filter((x) => x.critter.herd !== undefined && size(x.critter.herd) < max && dist(center(x), center(q)) < 700).sort((a, b) => dist(center(a), center(q)) - dist(center(b), center(q)))[0];
      q.critter.herd = near ? near.critter.herd : (nature.herdSeq = (nature.herdSeq ?? 0) + 1);
    }
    for (const h of [...new Set(all.map((q) => q.critter.herd))]) {
      const herd = all.filter((q) => q.critter.herd === h), grown = herd.filter((q) => !(q.critter.mother && isYoung(kind, wildAge(q)))).sort((a, b) => a.id - b.id);
      if (herd.length <= max || grown.length < 4) continue;
      const leaving = grown.slice(Math.ceil(grown.length / 2)), id = (nature.herdSeq = (nature.herdSeq ?? 0) + 1);
      const home = kind === "goat" ? plateauSpot() : kind === "boar" ? deepSpot("boar") : woodSpot(kind === "pheasant" ? 0.4 : 0.7, leaving[0].critter.home, 2600);
      for (const q of herd.filter((x) => leaving.includes(x) || leaving.some((m) => m.id === x.critter.mother))) Object.assign(q.critter, { herd: id, home, lair: null, feed: null });
    }
  }
}
/** Starved to death — or, a tiger, gone off to find better hunting. */
function starved(q) {
  const kind = q.critter.kind, at = center(q);
  if (kind === "tiger") { chronicle("老虎好些天没打着东西，离开了这片林子。"); removeWildAnimal(q); return; }
  if (known(at)) float(`一只${DEFS[kind].name}饿死了`, at, "world");
  if (!nature[`starved-${kind}-${yearNo()}`]) { nature[`starved-${kind}-${yearNo()}`] = true; chronicle(`林子里的吃食不够，饿死了${DEFS[kind].name}。`); }
  removeWildAnimal(q);
}
function breed() {
  const warm = season() === "春" || season() === "夏";
  if (storesSpilling()) needUp("clutter");                             // the stores are spilling over: it's felt
  sortHerds();
  settleDucks(warm);
  const dayOfSeason = ((day() - 1) % DAYS_PER_SEASON) + 1;
  for (const kind of Object.keys(SPECIES)) {
    if (kind === "duck") continue;
    let herd = boards.world.filter((q) => q.critter?.kind === kind);
    for (const q of herd) {                                                            // a day's hunger: starving too long, it dies (a tiger leaves)
      if (DIET[kind] || kind === "fox" || kind === "tiger" || kind === "wolf") {
        const s = starveDay(kind, q.critter.hunger ?? 0, q.critter.starved ?? 0);
        q.critter.starved = s.days;
        if (s.dies) { starved(q); continue; }
      }
    }
    herd = herd.filter((q) => boards.world.includes(q));
    for (const q of herd) if (diesOfAge(kind, wildAge(q), randomWild)) {                // old age
      if (known(center(q))) float(`一只老${DEFS[kind].name}倒下了`, center(q), "world");
      removeWildAnimal(q);
    }
    herd = herd.filter((q) => boards.world.includes(q));
    const cap = kind === "rabbit" ? rabbitCap(forage()) : LIFE[kind]?.K ?? SPECIES[kind].n;
    let extra = season() === "冬" ? winterSurplus(kind, herd.length) : Math.max(0, herd.length - cap);   // more than the land holds: the weakest go
    for (const q of herd.slice().sort((a, b) => wildAge(a) - wildAge(b))) { if (extra-- <= 0 || randomWorld() > 0.5) continue; removeWildAnimal(q); }
    herd = herd.filter((q) => boards.world.includes(q));
    const n = births(kind, herd.map((q) => ({ sex: q.critter.sex, age: wildAge(q), fed: !(DIET[kind] || kind === "fox") || (q.critter.hunger ?? 0) < HUNGER.fedBelow })), { season: season(), dayOfSeason, cap }, randomWild);
    const mothers = herd.filter((q) => q.critter.sex === "female" && !isYoung(kind, wildAge(q)));
    for (let k = 0; k < n && mothers.length; k++) {
      const mum = mothers[k % mothers.length], young = spawnAnimal(kind, center(mum));
      young.critter.mother = mum.id; young.critter.bornDay = day(); labelYoung(young);
      if (known(center(young))) float(`${LIFE[kind].young}生下来了`, center(young), "world");
    }
    if (n && kind !== "rabbit" && !nature[`born-${kind}-${yearNo()}`]) { nature[`born-${kind}-${yearNo()}`] = true; chronicle(`开春，林子里添了 ${n} 只${LIFE[kind].young}。`); }
    for (const q of herd) labelYoung(q);
    if (kind === "rabbit" && herd.length < 3 && randomWorld() < 0.2) spawnAnimal("rabbit");   // hares are everywhere: a few always find their way in
    else if (["deer", "boar", "goat", "pheasant"].includes(kind) && herd.length < Math.max(2, Math.floor(LIFE[kind].K / 4)) && foodFor(kind) > herd.length * 3 && randomWorld() < 0.12) {   // the valley isn't shut: with food to spare, a pair comes over the hills
      const a = spawnAnimal(kind), b = spawnAnimal(kind); a.critter.sex = "female"; b.critter.sex = "male";
      if (kind === "boar") spawnAnimal(kind).critter.sex = "female";   // boar come as a small sounder
      if (!nature[`came-${kind}-${yearNo()}`]) { nature[`came-${kind}-${yearNo()}`] = true; chronicle(`有一对${DEFS[kind].name}从山那边过来了。`); }
      herd = boards.world.filter((q) => q.critter?.kind === kind);
    }
    if (!herd.length && randomWorld() < (kind === "tiger" ? 0.15 : 0.06)) {        // none left: now and then one wanders in
      spawnAnimal(kind); if (kind !== "tiger") chronicle(`林子里又见着${DEFS[kind].name}了。`);
    }
  }
}
/** What a rabbit can eat: berries on the bushes and the crop standing in the fields. */
const forage = () => boards.world.reduce((n, q) => n + (q.cards[0].key === "berries" || (isField(q) && q.cards[0].sown !== false) ? q.cards[0].stock ?? 0 : 0), 0);
function settleDucks(warm) {
  for (const duck of livingDucks()) {
    if (duckAge(duck) >= 32 + duck.cards[0].id % 16) {
      const at = center(duck);
      removeWildAnimal(duck);
      if (known(at)) float("一只老野鸭不再动了", at, "world");
    } else labelDuck(duck);
  }
  if (warm && livingDucks().length <= 2 && randomWorld() < 0.15) { spawnAnimal("duck"); spawnAnimal("duck"); chronicle("一对野鸭飞来了湖上。"); }
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
  const p = center(you), warm = inRoom(p) || litAt(p) || you.cards.some((c) => c.key === "torch");
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
    const minds = folk.filter((q) => mindful(t.explains, q.npc.job));
    if (!minds.length) continue;                                    // nobody whose work it touches: nobody thinks about it
    const who = pick(minds);
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
    const minds = folk.filter((q) => mindful(inv.need[0], q.npc.job));
    if (!minds.length) continue;
    const who = minds.find((q) => q.npc.key === lore.theories[inv.principle]?.by) ?? pick(minds);
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
const ageStage = (a) => (a < 4 ? "baby" : a < 8 ? "child" : a < 16 ? "teen" : a < 55 ? "adult" : a < 65 ? "middle" : "elder");
/** Keep a person's card in step with their age: small children get small portraits, and old age shows on everyone. */
function refreshPersonLook(st) {
  const card = st?.cards?.[0];
  if (!card || !st.npc) return;
  const stage = ageStage(npcAge(st.npc));
  card.el.dataset.age = stage;
  if (st.npc.kid || st.npc.grown) {
    const icon = stage === "baby" ? "baby" : stage === "child" ? "child" : stage === "teen" ? "teen" : stage === "elder" ? "elder" : "adult";
    if (card.icon !== icon) { card.icon = icon; card.el.querySelector(".card-art").innerHTML = iconFor(icon); }
  }
}
function refreshPlayerLook() { const you = youStack(); if (you) you.cards[0].el.dataset.age = ageStage(myAge()); }
/** How old someone looks: you can tell roughly, not to the year. */
const looksAge = (a) => (a < 4 ? "还抱在怀里" : a < 8 ? "满地跑的年纪" : a < 13 ? "半大孩子" : a < 18 ? "十几岁" : a < 25 ? "二十来岁" : a < 60 ? `${["二", "三", "四", "五"][Math.floor(a / 10) - 2]}十${a % 10 < 4 ? "出头" : "来岁"}` : "上了年纪");
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
  defineCard(key, { name: `孩子`, icon: "baby", text: "你家的孩子。小时候在院子附近玩，十二岁起帮着干点活，十六岁成人。" });
  const bed = beds().find((b) => b.cards[0].key === "bed") ?? beds()[0];
  const st = placeCard(key, center(bed));
  st.npc = { key, order: npcs().length, home: "taoHouse", job: "play", hunger: 1, wait: 0, inside: false, kit: [], kid: true, born: day(), wake: 6.5, sleep: 19.5, outAt: 0, nextChat: clock.min + 600 };
  refreshPersonLook(st);
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
/** How fit someone is to take over the cooking: one who already knows a dish or two at the stove or the hearth
 *  first, then the one who brings food in (the fisher), the old who stay about the house; the fields' only hand last. */
function cookFitness(q) {
  const k = q.npc.key, dishes = CRAFTS.filter((r) => ["stove", "fire"].includes(r.needs[0]) && r.who.includes(k)).length;
  const farmers = npcs().filter((o) => o.npc.job === "farm").length;
  return dishes * 2 + ({ fish: 2, reed: 1, help: 0.5, wood: 0.5, stone: 0.5, build: 0 }[q.npc.job] ?? 0) + (q.npc.retired ? 1.5 : 0)
    - (q.npc.job === "farm" && farmers < 2 ? 4 : 0) + (q.npc.mood ?? 5) / 20;
}
/** The stove and the fields must have someone: if nobody does the work any more, the fittest takes it up. */
function coverJobs() {
  const grown = npcs().filter((q) => !isKid(q) && !q.npc.arriving && !q.npc.visitor);
  for (const job of ["cook", "farm"]) {
    if (grown.some((q) => q.npc.job === job)) { if (job === "cook") nature.cookless = false; continue; }
    const pool = grown.filter((q) => q.npc.job !== "cook" && q.npc.job !== "farm" && (job === "cook" || !q.npc.retired));
    const who = job === "cook" ? [...grown.filter((q) => q.npc.job !== "cook")].sort((a, b) => cookFitness(b) - cookFitness(a))[0]
      : grown.find((q) => q.npc.job === "reed") ?? pool[0];
    if (!who) continue;
    if (job === "cook" && who.npc.job === "farm" && !grown.some((q) => q !== who && q.npc.job === "farm")) {   // the fields' only hand stays on the fields
      if (!nature.cookless) { nature.cookless = true; chronicle("灶上没人专管了：往后谁饿了谁自己煮，锅空着谁看见了谁顺手煮一锅。"); }
      continue;
    }
    const why = job === "cook" ? (CRAFTS.some((r) => ["stove", "fire"].includes(r.needs[0]) && r.who.includes(who.npc.key)) ? "，他本来就会做几样吃的" : who.npc.job === "fish" ? "，鱼本来就是他打的" : "") : "";
    who.npc.job = job;
    chronicle(`往后${job === "cook" ? "灶上" : "地里"}的活，由${nameOf(who)}接过去了${why}。`);
  }
}
/** The pot is empty, people are getting hungry, and the cook can't see to it — none, asleep, laid up, or far off:
 *  whoever is about and fittest puts a pot on this once. One at a time. */
function standInCook() {
  const stove = find("stove"), bin = find("granary")?.cards[0];
  if (!stove || (stove.cards[0].stock ?? 0) > 0 || !bin || bin.stock <= seedReserve()) return null;
  if (!npcs().some((q) => !q.npc.inside && q.npc.hunger >= (q.npc.eatAt ?? 6) - 1)) return null;
  const cook = npcs().find((q) => q.npc.job === "cook" && !isKid(q));
  if (cook && !cook.npc.inside && !(cook.npc.sickUntil > clock.min) && dist(center(cook), center(stove)) < 1600) return null;
  const busy = npcs().find((q) => q.npc.standIn > clock.min);
  if (busy) return busy;
  const who = npcs().filter((q) => !isKid(q) && !q.npc.inside && !q.npc.arriving && !q.npc.visitor && q.npc.job !== "cook" && dist(center(q), center(stove)) < 2400)
    .sort((a, b) => cookFitness(b) - cookFitness(a))[0];
  if (who) who.npc.standIn = clock.min + 180;
  return who ?? null;
}
/** Standing in at the stove: wood on if it's out, grain from the granary, into the pot. */
function standInTurn(st) {
  const s = find("stove").cards[0];
  think(st, { id: "stand-in", because: "锅里空了，掌勺的顾不上，我先煮一锅" });
  if (st.carry?.key === "grain") return (s.fuel ?? 0) <= 0 && fuelIn(st) ? go(st, "stove", "stoke") : go(st, "stove", "cook");
  if (st.carry?.key === "log" || st.carry?.key === "wood") return burnOrStore(st, s);
  if ((s.fuel ?? 0) <= 0 && fuelIn(st)) return go(st, "stove", "stoke");
  if ((s.fuel ?? 0) <= 0) return pileCount("wood") + pileCount("log") ? fetchFromHome(st, "wood", 1) : gatherAt(st, "log", true);
  if (st.carry) return go(st, storeFor(st.carry.key), "store");
  return go(st, "granary", "fetch");
}
/** Once a day: children grow into helpers and then grown-ups, the old may die, a baby may be due, and so may you. */
function lifeDay() {
  for (const st of npcs()) {
    const n = st.npc, a = npcAge(n);
    if (n.hurt) n.hurt = Math.max(0, n.hurt - 0.35);                   // bruises fade in a few days
    if (n.kid) {
      if (a >= 12 && n.job === "play") { n.job = "help"; chronicle(`${nameOf(st)}能帮着干活了。`); }
      if (a >= 16 && n.job === "help") { n.job = "farm"; n.kid = false; n.grown = true; chronicle(`${nameOf(st)}长大成人了。`); banner("✦", `${nameOf(st)}长大成人了`); }
    }
    refreshPersonLook(st);
    if (a >= 64 && randomWorld() < 0.03 + (a - 64) * 0.012) npcDies(st);
  }
  refreshPlayerLook();
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
  me.name = name; me.food = 80; me.rest = 90; me.sickUntil = 0; me.buildHints = {};   // a new generation hasn't been told any of it
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
  const tile = MAP.tiles.blackReef, want = { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 };
  let island = find("blackReef");
  if (!island) {
    placeCard("blackReef", want);
    island = find("blackReef");
  } else if (dist(center(island), want) > 100) {                       // older saves: the reef has moved further out to sea
    const old = center(island), dx = want.x - old.x, dy = want.y - old.y;
    island.x += dx; island.y += dy;
    for (const q of boards.world) if (["saltPan", "shellBank"].includes(q.cards[0].key) && dist(center(q), old) < 1400) { q.x += dx; q.y += dy; }
    chronicle("黑礁岛被推到了更远的外海。");
  }
  if (island) setupReefSources(island);
}
/** The island's own larder: a salt pan and a shell bank, there for whoever sails over. Placed once; a picked-clean
 *  patch comes back on its own (resource-ecology.js), so the flag keeps old saves from planting a fresh one. */
function setupReefSources(island) {
  if (village.reefSources) return;
  village.reefSources = true;
  const c = center(island);
  placeCard("saltPan", { x: c.x - 320, y: c.y + 160 });
  placeCard("shellBank", { x: c.x + 320, y: c.y + 160 });
}
function discoverBlackReef() {
  const island = find("blackReef");
  if (island) explore(center(island));
  village.sawPirateIsland = true;
}
/** A raider beaten: the ones ashore run for their boat; the island's guards flee into the reef. */
function routRaider(st, by) {
  if (st.raid) { st.raid.retreat = true; st.raid.index = Math.max(0, st.raid.index - 1); chronicle(`${by}打退了靠岸的黑帆劫掠者。`); toast("劫掠者退回岸边去了"); return; }
  removeWildAnimal(st);
  if (!boards.world.some((q) => q.guard)) { chronicle(`${by}在黑礁岛上打退了守船的人，那艘黑帆船就系在浅湾里。`); banner("✦", "守船的人跑了"); }
}
const raidAshore = () => boards.world.find((q) => q.raid?.landed && !q.raid.retreat) ?? null;
/** Raiders ashore: the brave and armed go to stand by the granary; the rest keep out of their way. */
function raidTurn(st) {
  const r = raidAshore(), n = st.npc;
  if (!r || isKid(st) || n.arriving) return false;
  const mode = stance({ courage: COURAGE[n.key] ?? 0.5, strength: strengthAt(npcAge(n)), weapon: bestWeapon((k) => holds(st, k)), threat: THREAT.coastRaider, hurt: n.hurt ?? 0, allies: 1 });
  if (mode === "fight") {
    if (st.goal === "granary" && st.walk) return true;
    if (dist(center(st), center(find("granary"))) > 200) { cancelJob(st); endMuse(st); if (n.guarding !== r.id) tell(st, "“有人来抢粮了！去公仓！”", { r: 700, reply: false }); n.guarding = r.id; go(st, "granary", "guard"); return true; }
    return false;
  }
  if (dist(center(st), center(r)) < 600 && st.task !== "hide") { cancelJob(st); go(st, n.home, "hide"); return true; }
  return false;
}
/** The island: guards by the ship until they're beaten off; they set on you if you come near. */
function reefTick(minutes, you) {
  const island = find("blackReef");
  if (!island || village.piratesDone) return;
  const near = you?.board === "world" && dist(center(you), center(island)) < 900;
  if (near && !village.reefGuarded) {
    village.reefGuarded = true;
    for (let k = 0; k < 3; k++) { const card = newCard("coastRaider"); cardsLayer.append(card.el); const p = settle(center(island).x - 160 + k * 160, center(island).y + 190); newStack([card], p.x - CARD_W / 2, p.y - CARD_H / 2, "world").guard = { hp: 5, home: p }; card.el.querySelector(".card-art").innerHTML = iconFor("boatman"); }
    toast("岛上有人朝你喊了一嗓子，三个人从棚子里钻了出来");
  }
  for (const g of boards.world.filter((q) => q.guard)) {
    if (g.cards[0].el.dataset.crew !== "1") { g.cards[0].el.querySelector(".card-art").innerHTML = iconFor("boatman"); g.cards[0].el.dataset.crew = "1"; }   // older saves: they were drawn as boats
    const s = g.guard, here = center(g), yc = near ? center(you) : null;
    if (s.hp <= 2) { routRaider(g, "你"); continue; }                   // badly hurt: off into the rocks
    if (yc && dist(here, yc) < 300 && clock.min > (s.next ?? 0)) {
      s.next = clock.min + 12;
      if (dist(here, yc) > 140) { g.walk = { x: yc.x - CARD_W / 2 + 60, y: yc.y - CARD_H / 2 }; }
      else { me.rest = Math.max(0, me.rest - 12); me.fight = { id: g.id, until: clock.min + 60 }; float("劫掠者一棍子抡过来", yc, "world"); }
    } else if (clock.min >= (s.nextMove ?? 0)) {
      s.nextMove = clock.min + 45 + randomWild() * 90;
      const night = hour() < 7 || hour() >= 19;
      const post = night ? s.home : { x: s.home.x + (randomWild() - 0.5) * 380, y: s.home.y + (randomWild() - 0.5) * 260 };
      if (dist(here, post) > 50) g.walk = { x: post.x - CARD_W / 2, y: post.y - CARD_H / 2 };
    }
    if (g.walk && stepWalk(g, minutes, 0.6)) g.walk = null;
  }
}
/** At the black ship: with the guards gone, burn it (a torch) or stave in its bottom (an axe). No more raids. */
function strikeShip(you) {
  if (village.piratesDone) return toast("黑帆船只剩几根焦木头了");
  if (boards.world.some((q) => q.guard && dist(center(q), center(you)) < 700)) return toast("船边有人守着，先把人打退");
  const how = holds(you, "torch") ? "torch" : holds(you, "axe") ? "axe" : null;
  if (!how) return toast("得带火把来烧船，或者带斧头凿穿船底");
  village.piratesDone = true;
  if (how === "axe") wearTool(you, "axe");
  const raid = boards.world.find((q) => q.raid); if (raid) removeWildAnimal(raid);
  for (const k of ["grain", "grain", "grain", "grain", "salt", "rope"]) addCard(you, k);
  overflow(you); carryChanged();
  banner("✦", how === "torch" ? "黑帆船烧起来了" : "凿穿了黑帆船的船底");
  chronicle(how === "torch" ? "你在黑礁岛点着了那艘黑帆船，从棚子里拿回了几袋粟。往后湖口再没见过黑帆。" : "你在黑礁岛凿穿了黑帆船的船底，从棚子里拿回了几袋粟。往后湖口再没见过黑帆。");
}
function coastRaidTick(minutes, you) {
  reefTick(minutes, you);
  if (village.piratesDone) return;
  const parties = boards.world.filter((st) => st.raid);
  if (parties.length > 1) for (const extra of parties.slice(1)) removeWildAnimal(extra);   // never leave three boats stranded
  let party = parties[0] ?? null;
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
    party.raid = { ...route, index: 1, retreat: false, landed: false, hp: 3, raidUntil: 0, nextClash: 0 };
    card.el.querySelector(".card-art").innerHTML = iconFor("boat");
    explore(start); explore(route.points[route.landing]);
    chronicle("远处的黑帆压着海面过来了，正沿着南岸找靠岸的地方。");
  }
  const raid = party.raid, here = center(party), last = raid.points.length - 1;
  const armed = you?.board === "world" && holds(you, "spear") && dist(center(you), here) < 260 && !reachAlong(MAP, here, center(you)).blocked;

  // At the granary: the raiders have to actually get through the people there before they carry anything off.
  if (!raid.retreat && raid.index >= last) {
    if (!raid.raidUntil) { raid.raidUntil = clock.min + 180; chronicle("黑帆的人围到公仓门口了，村里人抄起家伙。"); }
    const guards = npcs().filter((q) => q.npc.guarding === party.id && dist(center(q), here) < 360);
    if (clock.min >= (raid.nextClash ?? 0)) {
      raid.nextClash = clock.min + 35;
      const defense = (armed ? 1.4 : 0) + guards.reduce((f, q) => f + 0.35 + WEAPONS[bestWeapon((k) => holds(q, k))].edge, 0);
      if (defense >= 0.9) {
        raid.hp = (raid.hp ?? 3) - 1;
        float("公仓门口打起来了，劫掠者挨了一下", here, "world");
        if (raid.hp <= 0) { routRaider(party, armed ? "你" : "村里人"); return; }
      } else {
        const q = guards[0];
        if (q) { q.npc.hurt = Math.max(0, (q.npc.hurt ?? 0) + 0.15); q.npc.mood = Math.max(0, (q.npc.mood ?? 6) - 0.5); }
        float(q ? `${nameOf(q)}被劫掠者逼退了` : "没人拦得住，黑帆的人在翻公仓", here, "world");
      }
    }
    if (clock.min >= raid.raidUntil) {
      const loss = raidLoot(granary.cards[0].stock, seedReserve());
      const took = loss && commitProduction(party, granary, { kind: "coast-raid", cost: loss }, { details: { resource: "grain", removed: loss } });
      const outcome = took ? "黑帆的人从公仓抢走了一些粟，退回了岸边。" : "黑帆的人在公仓没抢到可带走的粟，退回了岸边。";
      chronicle(outcome); toast(outcome);
      raid.retreat = true;
    }
    return;
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
    if (!raid.retreat) { explore(center(party)); toast("黑帆船靠了岸，有人朝粮仓来了"); }
  }
  if (raid.retreat && raid.index === 0) {
    party.cards[0].el.remove(); removeStack(party);
    return;
  }
  if (raid.index === last) { if (!raid.retreat) return; }                // reached the granary: next tick the clash
  raid.index += raid.retreat ? -1 : 1;
}
/** What the trader will take, and what for. */
const TRADES = [
  { give: { smokedFish: 2 }, get: "jar" }, { give: { hide: 1 }, get: "jar" }, { give: { grain: 3 }, get: "salt" },
  { give: { rope: 2 }, get: "salt" }, { give: { hide: 2 }, get: "cloth" }, { give: { malachite: 1 }, get: "cloth" },
  { give: { malachite: 2 }, get: "net" },
  { give: { salt: 3 }, get: "cloth" },
  { give: { shellBeads: 1 }, get: "jar" },
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
/** The trader's day: to the granary, wait there, and in the afternoon back to the raft. */
function visitorBrain(st) {
  const n = st.npc;
  if (st.walk || st.job) return;
  if (n.leaving) { st.cards.forEach((c) => c.el.remove()); st.bubble?.el.remove(); removeStack(st); return; }
  if (hour() >= 16) {
    n.leaving = true; tell(st, "“天不早了，我得趁亮划回去。下回再来。”");
    const path = findPath(MAP, center(st), n.from);
    st.walk = path ? { path: path.slice(0, -1), k: 0, x: n.from.x - CARD_W / 2, y: n.from.y - CARD_H / 2 } : null;
    if (!path) n.leaving = true;
    return;
  }
  if (st.goal !== "granary" && !n.atStove) { go(st, "granary", "trade"); n.atStove = true; return; }   // waits by the granary, not in the house
  n.wait = 90; if (randomVoice() < 0.3) tell(st, pickLine(TRADER_LINES));
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
const STACK_STATE = ["home", "store", "room", "pet", "ctl", "carry", "task", "goal", "want", "slot", "indoors", "facing", "lastTask", "unloading", "musing", "raid", "guard"];
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
    const { kind, home, hunger, lying, calm, backAt, nextMove, hp, bornDay, sex, mother, heading, warned, herd, starved, carrying, awakeUntil, fleeUntil, fleeFrom } = st.critter;
    o.critter = { kind, home, hunger, lying, calm, backAt, nextMove, hp, bornDay, sex, mother, heading, warned, herd, starved, carrying, awakeUntil, fleeUntil, fleeFrom };
  }
  if (st.plans?.length) o.plans = st.plans.map((p) => (p.deliver ? { deliver: true } : { r: recipeRef(p.r) }));
  return o;
}
function saveGame() {
  if (preview || importingSave || saveWriteBlocked || drag || !youStack()) return;                 // mid-drag a stack is split in two
  try {
    const data = {
      v: SAVE_VERSION, seed, uid, mapX: WEST, mapCols: MAP.cols, at: Date.now(), min: clock.min, fast: clock.fast,
      rng: worldRandom.snapshot(), me: { ...me, marks: [...marks] },
      talks: talks.map(({ st, ...line }) => ({ ...line, stackId: st.id })),
      boards: Object.fromEntries(Object.entries(boards).map(([b, list]) => [b, list.filter((s) => !s.lifted && !s.site).map(stackOut)])),
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
/** Saves from before the old wood was widened (v58) have everything on the land WEST further west: move it all over,
 *  and the ground changes kept by cell onto the wider grid. */
function shiftSave(d) {
  const dx = WEST - (d.mapX ?? 0), was = d.mapCols ?? OLD_COLS - dx / CELL;   // OLD_COLS: the grid before the mountain was widened (v64.7)
  if (dx) {
    const move = (o) => { if (!o || typeof o !== "object") return; if (Number.isFinite(o.x) && Number.isFinite(o.y)) o.x += dx; for (const v of Object.values(o)) move(v); };
    for (const part of [d.boards.world, d.discs, d.fields, d.eco, d.respawns, d.me?.guide]) move(part);
  }
  if (dx || was !== MAP.cols) {
    const at = (i) => Math.floor(i / was) * MAP.cols + (i % was) + dx / CELL, veg = d.village?.veg;
    if (veg?.changed) veg.changed = Object.fromEntries(Object.entries(veg.changed).map(([i, c]) => [at(Number(i)), c]));
    if (Array.isArray(veg?.grown)) veg.grown = veg.grown.map(at);
  }
  d.mapX = WEST; d.mapCols = MAP.cols;
}
const OLD_COLS = 255;
/** Put the saved world back on the regenerated land. */
function restore(d) {
  shiftSave(d);
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
  applyVeg();                                                         // the wood as it has grown and been cut back, before anything is painted
  applyMine();                                                        // and the mine as far as it has been dug
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
  setupBarn();
  settleMisplaced();
  settleNpcPose();
  const heap0 = homePile(); if (heap0) sortPile(heap0);
  // Move only the old stock layout. A player's rearranged piles keep their positions.
  if (MAP.house) for (const st of boards.world) {
    const key = oldYardFurnishing(st, MAP.house), at = key && yardFurnishing(key, MAP.house);
    if (at) Object.assign(st, at);
  }
  settleKitchen();
  migrateMeals();
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
  $("titleNote").textContent = hadSave ? `接着上回：${me.name ?? "启禾"}，${looksAge(myAge())}` : "一片河谷，一间院子，一个刚成年的人。";
  $("titleGo").textContent = hadSave ? "继续" : "开始";
  t.hidden = false;
  const go = () => { t.hidden = true; setSpeed(was); };
  $("titleGo").onclick = go;
  $("titleHelp").onclick = () => { $("helpbox").hidden = false; };
  $("titleNew").onclick = () => { if (!hadSave || confirm("从头开始一段新的人生？现在的存档会被清掉。")) location.search = "?new=1"; };
  $("titleGo").focus();
}
/** Beds aren't carried about: any in your arms (or put on the yard's heap) go back on the pile of beds. */
function settleBeds() {
  if (!MAP.house) return;
  const loose = [];
  for (const b of boards.world.filter((q) => q.cards[0].key === "bed")) { loose.push(...b.cards.filter((c) => c.key === "bed")); removeStack(b); }   // older saves: all beds in one pile
  const you = youStack();
  loose.push(...(you?.cards.filter((x) => x.key === "bed") ?? [])); if (you) you.cards = you.cards.filter((x) => x.key !== "bed");
  const heap = homePile();
  if (heap) { loose.push(...heap.cards.filter((x) => x.key === "bed")); heap.cards = heap.cards.filter((x) => x.key !== "bed"); }
  for (const c of loose) {
    const at = freeBedSlot();
    if (at) { newStack([c], at.x, at.y, "world"); cardsLayer.append(c.el); }
    else (homePile()?.cards ?? []).push(c);
  }
}
/** Older saves: a boar whose home is where the deer live gets a patch of its own. */
function settleWildlife() {
  for (const q of boards.world.filter((x) => x.critter && x.critter.kind !== "duck")) {
    const grown = LIFE[q.critter.kind]?.adult ?? 4;
    q.critter.bornDay ??= day() - grown - Math.floor(randomWild() * grown * 2);
    q.critter.sex ??= randomWild() < 0.5 ? "female" : "male";
  }
  for (const kind of Object.keys(SPECIES)) {
    const herd = boards.world.filter((x) => x.critter?.kind === kind);
    if (herd.length >= 2 && herd.every((x) => x.critter.sex === herd[0].critter.sex)) herd[1].critter.sex = herd[0].critter.sex === "male" ? "female" : "male";   // a pair, not two of a kind
    if (!herd.length && ["fox", "pheasant", "bear", "wolf"].includes(kind)) for (let i = 0; i < SPECIES[kind].n; i++) spawnAnimal(kind);   // old saves get the new predator too
  }
  for (const kind of ["boar", "wolf"]) {                               // old saves: these two now keep to the deep wood
    const stray = boards.world.filter((q) => q.critter?.kind === kind && (countryAt(center(q)) !== "deep" || woodDepth(MAP, center(q).x, center(q).y) < 0.55));
    if (!stray.length) continue;
    const home = deepSpot(kind);
    stray.forEach((q, i) => {
      const p = { x: home.x + Math.cos(i * 2.4) * (80 + i * 55), y: home.y + Math.sin(i * 2.4) * (80 + i * 45) };
      q.x = p.x - CARD_W / 2; q.y = p.y - CARD_H / 2;
      Object.assign(q.critter, { home: p, lair: null, feed: null, nextMove: 0 });
    });
  }
}
/** Animals don't keep to one patch: every few days a herd (or a loner) moves on to another part of the wood — out
 *  towards the forest's edge, or far into the deep wood. Hares keep to their forms, goats to the plateau, the bear and
 *  the tiger to their lairs. */
const RANGING = { deer: 0.3, boar: 0.25, fox: 0.3, pheasant: 0.2 };
const OUTER = { deer: 0.3, pheasant: 0.5, fox: 0.2, boar: 0.05 };              // how much each likes the outer forest, with its glades and edges, over the deep wood
function rangeDay() {
  for (const [kind, chance] of Object.entries(RANGING)) {
    const flock = HABITS[kind]?.group === "flock", leads = flock ? [...new Set(groupMembers(kind).map((q) => q.critter.herd))].map((h) => groupLeader(kind, h)).filter(Boolean) : groupMembers(kind);
    for (const st of leads) {
      if (randomWild() >= chance || (st.critter.mother && isYoung(kind, wildAge(st)))) continue;
      const home = woodSpot(kind === "pheasant" ? 0.3 : 0.6, st.critter.home, 2400, OUTER[kind]);
      for (const q of flock ? groupMembers(kind, st.critter.herd) : [st]) Object.assign(q.critter, { home, lair: null, feed: null });
    }
  }
}
function settleRanges() {
  const tiger = lairOf("tiger"), bear = boards.world.find((q) => q.critter?.kind === "bear");
  if (tiger && bear && dist(tiger, bear.critter.home) < 2400) bear.critter.home = deepSpot("bear");   // older saves: the two had one den
  const deer = boards.world.filter((q) => q.critter?.kind === "deer").map((q) => q.critter.home);
  for (const b of boards.world.filter((q) => q.critter?.kind === "boar")) if (deer.some((h) => dist(h, b.critter.home) < 600)) b.critter.home = boarSpot() ?? b.critter.home;
}
/** Older saves: a field broken before the grid (smaller, anywhere) is moved onto a free cell and made full size. */
function settleFields() {
  let moved = false;
  for (const f of MAP.extraFields ?? []) {
    if (f.w === FIELD_SIZE.w && f.h === FIELD_SIZE.h) continue;
    const cell = snapField(f, 2000, f);
    if (!cell) continue;
    Object.assign(f, { x: cell.x, y: cell.y, ...FIELD_SIZE }); f.cv?.remove(); f.cv = null;
    const st = f.card && stackOf(f.card);
    if (st) { st.x = cell.x - st.w / 2; st.y = cell.y - st.h / 2; }
    moved = true;
  }
  if (moved) paintSeason();
}
/** The cellar and the granary pit were taken out of the game: what was built (or begun, or planned) is cleared, and the
 *  stone and wood that went into it go back on the heap. */
function settleGone() {
  const GONE = new Set(["cellar", "granaryPit", "cellarPlan", "granaryPitPlan"]), back = [];
  for (const st of [...allStacks()]) {
    const c = st.cards[0], kind = c.key === "plot" ? c.build : c.key;
    if (GONE.has(kind)) { if (kind === "cellar" || kind === "granaryPit") back.push("stone", "stone", "log"); st.cards.forEach((x) => x.el.remove()); removeStack(st); continue; }
    const drop = st.cards.filter((x) => GONE.has(x.key));
    if (drop.length) { drop.forEach((x) => x.el.remove()); st.cards = st.cards.filter((x) => !drop.includes(x)); if (!st.cards.length) removeStack(st); }
  }
  if (back.length) storeHome(back.map((k) => newCard(k)));
}
function settleStores() {
  const barn = MAP.barn;
  if (!barn) return;
  for (const q of [...boards.world]) {
    const p = center(q);
    if (q.store || q.site || q.npc || q.critter || !(p.x > barn.x && p.x < barn.x + barn.w && p.y > barn.y && p.y < barn.y + barn.h)) continue;
    if (!q.cards.every((c) => barnThing(c.key))) continue;
    const cards = q.cards; removeStack(q); storeHome(cards);
  }
}
function initializeView() {
  settleGone();
  settleStores();
  settleBeds(); settleWildlife(); settleRanges(); sortHerds(); settleFields(); settleGroves(); markFreshness();
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
const fxCanvas = $("fxLayer"); if (fxCanvas) { fx.init(fxCanvas); fx.resize(WW, WH); }
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
  window.__mock = { works, buildState, layOnGround, wallsChanged, considerExtension, freeBedSlot, roomBedSpot, inRoom, segProblem, wearTool, mend, vegetationSpring, eco, carryChanged, audioLevel, audioRunning, sfx, advanceTo, npcSocial, npcKnowledge, npcIdentity, npcBelief: (a, id) => knowledgeOf(npcKnowledge, personId(a), id), npcRelation: (a, b) => relationOf(npcSocial, personId(a), personId(b)), climbCliff: climb, climbLadder, lookOut, considerTrader, trade, TRADES, passOn, birth, court, canCourt, lifeDay, npcDies, myAge, npcAge, family, heirs, lore, observe, needUp, thinkTick, unlockInvention, nature, natureDay, isSick, coldTick, village, climb: climbLadder, considerArrival, villageNow, festivalTick, npcs, saveGame, look, weather, skySet, sky, say, startChat, inJungle, SPECIES, spawnAnimal, attackRabbit, BUILDS, startPlacing, placeFoundation, completeBuild, refreshPlot, newStack, WANT, planStep, holds, teach, renderCrafts, setMode, members, soc, hearts, giveTo, talk, askNews, acceptReq, declineReq, party, renderParty, tide, darkness, lights, litAt, boards, clock, cam, me, MAP, youStack, walkTo, find, center, discs, setSpeed, artFound, moveRange, arrive, walkable: (x, y) => walkable(MAP, x, y), explore, paintFog, paintSeason, newCard, eco, attackRabbit, showDetail, findPath: (a, b) => findPath(MAP, a, b) };
}
