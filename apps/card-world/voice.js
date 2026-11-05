// What the villagers say and think, each in their own manner. Adapted from the old engine's corpus
// (archives/openlife-engine-20261102/modules/narrative-voice/data/voice.neolithic.json and
//  village-stories/data/river-terrace.stories.json), with the riverside words swapped for this world's.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// How a line opens and closes, by temperament. Empty strings: most lines are said plainly.
const OPEN = {
  nagging: ["我跟你说过多少回了，", "成天操心这操心那，", "趁着还没忙起来，听我念叨一句，", "一大家子的嚼用都得盘算，", "", "", ""],
  huashao: ["嗯，", "看这天色，", "活还在手上，", "记着，", "", "", "", ""],
};
const TAIL = {
  nagging: ["可别等要用的时候又抓瞎。", "门口的草帘得拢严实了，才不受凉。", "听人劝，吃饱粟米饭。", "", "", ""],
  huashao: ["先去忙了。", "心里有数就行。", "不多说了。", "", "", "", ""],
};
const GESTURE = {
  nagging: ["一边拍打着麻衣上的草屑", "一边麻利地收拾着苇席", "掀开锅盖看了一眼", "数了数瓮里的粟"],
  huashao: ["默默往火塘里添了一根柴", "低头紧了紧脚上的草鞋", "蹲下来捏了一把土", "抬头望了望天"],
};

const WEATHER = {
  晴: ["风不冷不燥，湖边的芦苇轻轻摇", "日头暖融融地照着屋顶，地上干爽好走", "湖面平平的，连水鸟都贴着浅滩慢慢飞"],
  热: ["日头晒得地皮发烫，粟穗都晒脆了", "热风里全是干草和热土的味儿", "连树荫底下吹来的风都是热的"],
  雨: ["湖上腾起一层潮气，芦苇荡里闷得人冒汗", "泥地踩上去软绵绵的，满是水草泡开的味儿", "冷雨一阵一阵的，柴垛都返潮了"],
  雪: ["白霜封住了草甸，湖边结了一圈薄冰碴", "冷得哈气成霜，都缩在火塘边煨着", "雪落在芦苇荡上，天地间白茫茫一片"],
};
const TIME = {
  dawn: ["天边刚泛起鱼肚白，屋顶上飘起一缕青烟", "晨雾还罩着湖面，草叶尖上挂满了露水"],
  morning: ["日头渐渐升高，院子里晾着粟穗", "晨风吹散了雾，林子那边传来砍木头的声音"],
  noon: ["日头悬在头顶，火塘边烘着热腾腾的粟饼", "正午的影子缩在脚底下，忙了半天的人都歇歇脚"],
  afternoon: ["日头慢慢西斜，湖风带着水腥味吹过来", "午后背着筐的人一个个往回走"],
  dusk: ["暮色四合，晚霞把湖面染成了红陶的颜色", "日头落进远山后头，林子里的鸟都回窝了"],
  night: ["夜深了，屋里火塘透出一点暖光", "夜里只剩湖水拍岸的哗哗声"],
};
const THOUGHT = {
  happy: ["看着公仓里堆得扎实的粟，心里比喝了热汤还熨帖", "手里的活顺顺当当，看什么都顺眼", "平平安安，火塘里的火旺，比啥都强"],
  low: ["心里头沉甸甸的，像压了一块粗石板", "叹了口气，只盼这阵子快点过去", "闷得只想蹲在湖边看水发呆"],
  hungry: ["肚子里空落落地直叫唤，满脑子都是稠乎乎的粟米粥", "饿得手脚发软，哪怕有块烤根茎垫垫也好", "闻见灶上飘来的谷香，就挪不开步子"],
  idle: ["望着湖面发了会儿呆", "想起去年冬天那场大雪", "琢磨着明年再开一块地", "听着林子那边的鸟叫出神", "数着天上的云", "想起小时候在湖边摸蚌"],
};

// What each of them talks about. {you} is replaced with how they address you.
const LINES = {
  aunt: {
    greet: ["“吃过了没有？”", "“年轻人嘴上说吃过，肚子可不答应。”", "“瓮底的粟要翻一翻，不然开春就生虫。”", "“灶上的柴得架空，火才旺。”", "“来了？锅里还有，饿了自己盛。”"],
    cook: ["“粟要先泡一夜，煮出来才软和。”", "“盐等快熟了再放。”", "“全家的饭都从这口锅里出来。”"],
    fish: ["“湖里的鱼冬天不爱动。”", "“退潮的时候鱼好捞。”", "“捞两条回去，晚上添个菜。”"],
    lowFood: ["“公仓快见底了，阿三，地里可得上心。”", "“省着点吃，开春前还有好些日子。”"],
    full: ["“锅满着呢，歇口气。”", "“灶上够吃两天了。”"],
    sleep: ["“不早了，都睡吧。”", "“火塘压上灰，明早好引火。”"],
    wake: ["“起来了起来了，太阳晒屁股了。”", "“先把灶点上。”"],
    tiger: ["“老虎！快回院子里！”"],
    season: { 春: "“开春了，地该翻了。”", 夏: "“天热了，饭别剩，搁不住。”", 秋: "“秋收了，公仓得腾地方。”", 冬: "“入冬了，柴火得备足。”" },
  },
  san: {
    greet: ["“今年墒情不错。”", "“捏一把土，攥成团、一碰就散，就是正好。”", "“锄头我给你留一把。”", "“嗯。”", "“来看地？”"],
    sow: ["“开春了，该下种了。”", "“土松了，下种正好。”"],
    tend: ["“草跟着苗一块儿疯长，得锄。”", "“地里的苗冒头了。”", "“这垄长得齐。”"],
    harvest: ["“穗子沉甸甸的，该收了。”", "“等收了，分你一筐。”", "“今年收成还行。”"],
    rest: ["“地歇了，人也歇歇。”", "“冬天就是磨工具的时候。”"],
    sleep: ["“睡了。”", "“明天早点下地。”"],
    wake: ["“天亮了，下地。”", "“嗯，起了。”"],
    tiger: ["“老虎……快走。”"],
    season: { 春: "“开春了，该下种了。”", 夏: "“草长得比苗快。”", 秋: "“穗子黄了。”", 冬: "“地冻上了。”" },
  },
  gu: {
    greet: ["“站远点，别踩着网。”", "“看水色就知道鱼在哪一层。”", "“嗯。”", "“鱼认得人，你信不信？”"],
    fish: ["“鱼在苇根底下，得慢慢来。”", "“这一网有分量。”"],
    sleep: ["“睡了，明早看水。”"], wake: ["“看看今早的水色。”"], tiger: ["“老虎！往湖边跑！”"],
    season: { 春: "“开春鱼上来了。”", 夏: "“晒鱼干的好天。”", 秋: "“鱼肥了。”", 冬: "“冬天补网。”" },
  },
  wei: {
    greet: ["“又来割苇子？省着点割。”", "“……嗯。”", "“老苇割了，新芽留着。”"],
    cut: ["“只割老的。”", "“根留着，明年还长。”"],
    sleep: ["“睡了。”"], wake: ["“去滩上看看。”"], tiger: ["“老虎……快走。”"],
    season: { 春: "“新苇冒头了，别踩。”", 夏: "“苇子长得快。”", 秋: "“能割了，留根。”", 冬: "“又稀了。”" },
  },
  li: {
    greet: ["“什么事？”", "“石头有纹，顺着纹走。”", "（手里的石锤没停）"],
    pick: ["“这面石壁纹路顺。”", "“好石头。”"],
    sleep: ["“睡。”"], wake: ["“上山。”"], tiger: ["“老虎！”"],
    season: { 春: "“雪化了，好石头露出来了。”", 夏: "“天热，石头脆。”", 秋: "“秋收要刀，活多。”", 冬: "“手僵。”" },
  },
};
// Two of them near each other with nothing pressing: a few words back and forth. [speaker, line] — a = 陶婶, b = 阿三.
const CHATS = [
  { pair: ["aunt", "san"], when: () => true, lines: [["a", "“阿三，地里怎么样？”"], ["b", "“还行，苗齐。”"]] },
  { pair: ["aunt", "san"], when: () => true, lines: [["a", "“又空着肚子下地？”"], ["b", "“不饿。”"], ["a", "“不饿也得吃！”"]] },
  { pair: ["aunt", "san"], when: () => true, lines: [["b", "“婶，灶上还有粥吗？”"], ["a", "“给你留着呢。”"]] },
  { pair: ["aunt", "san"], when: (c) => c.weather === "雨", lines: [["a", "“这雨下得，柴都潮了。”"], ["b", "“地里正缺水。”"]] },
  { pair: ["aunt", "san"], when: (c) => c.weather === "晴", lines: [["b", "“这几天晴，好干活。”"], ["a", "“晴也别晒着，晌午歇歇。”"]] },
  { pair: ["aunt", "san"], when: (c) => c.season === "冬", lines: [["a", "“公仓的粟够吃到开春吗？”"], ["b", "“省着点，够。”"]] },
  { pair: ["aunt", "san"], when: (c) => c.season === "秋", lines: [["a", "“收了多少？”"], ["b", "“两块地，十来份。”"], ["a", "“够了够了。”"]] },
  { pair: ["aunt", "san"], when: (c) => c.season === "春", lines: [["b", "“婶，种子还留着吧？”"], ["a", "“留着呢，一块地一份，谁也别动。”"]] },
  { pair: ["aunt", "san"], when: () => true, lines: [["a", "“林子那边别去深了，有老虎。”"], ["b", "“知道。”"]] },
  { pair: ["aunt", "san"], when: () => true, lines: [["b", "“山里那条矿道，石头好挖。”"], ["a", "“挖石头得有石锤，别拿手抠。”"]] },
  // anyone with anyone
  { when: (c) => c.weather === "雨", lines: [["a", "“又下了。”"], ["b", "“下吧，地里正要水。”"]] },
  { when: (c) => c.weather === "晴", lines: [["a", "“今天天好。”"], ["b", "“嗯，干活的天。”"]] },
  { when: (c) => c.season === "冬", lines: [["a", "“这冬天长着呢。”"], ["b", "“熬过去就开春了。”"]] },
  { when: () => true, lines: [["a", "“吃了没？”"], ["b", "“吃了。你呢？”"], ["a", "“也吃了。”"]] },
  { when: () => true, lines: [["a", "“林子深处别去，有老虎。”"], ["b", "“晓得。”"]] },
  // the two who quarrel over the bank
  { pair: ["wei", "li"], when: () => true, lines: [["a", "“你在山脚一敲石头，芦苇荡的鸟全飞了。”"], ["b", "“鸟飞了还回来，石头不敲不出刃。”"]] },
  { pair: ["wei", "li"], when: () => true, lines: [["b", "“阿苇又在念叨我了吧。”"], ["a", "“你自己心里有数。”"]] },
];

const style = (who) => (who === "aunt" ? "nagging" : "huashao");   // the newcomers are quiet types too
/** A line on a topic, sometimes dressed in their usual opening and closing words. */
export function line(who, topic) {
  const L = LINES[who]; if (!L) return null;
  const set = L[topic]; if (!set) return null;
  const core = typeof set === "string" ? set : pick(set);
  if (topic === "greet" || topic === "tiger" || Math.random() < 0.6) return core;
  const s = style(who), open = pick(OPEN[s]), tail = pick(TAIL[s]);
  return open || tail ? `“${open}${core.replace(/^“|”$/g, "")}${tail}”` : core;
}
export function seasonLine(who, season) { return LINES[who]?.season?.[season] ?? null; }
/** What they think while they stand still: the hour or the weather, then whatever is on their mind. */
export function thought(who, { hour, weather, hungry, mood }) {
  const t = hour < 7 ? "dawn" : hour < 11 ? "morning" : hour < 13.5 ? "noon" : hour < 17 ? "afternoon" : hour < 20 ? "dusk" : "night";
  const scene = Math.random() < 0.5 ? pick(TIME[t]) : pick(WEATHER[weather] ?? WEATHER.晴);
  const mind = hungry ? pick(THOUGHT.hungry) : pick(THOUGHT[mood] ?? THOUGHT.idle);
  return Math.random() < 0.5 ? `${scene}。${mind}。` : `${mind}。`;
}
export function gesture(who) { return pick(GESTURE[style(who)]); }
/** A short exchange for two people who happen to be together. Returns [[who, line], …] with a/b filled in. */
export function chat(a, b, ctx) {
  const pair = CHATS.filter((c) => c.pair && c.pair.includes(a) && c.pair.includes(b) && c.when(ctx));
  const ok = pair.length && Math.random() < 0.75 ? pair : CHATS.filter((c) => !c.pair && c.when(ctx));
  if (pair.length && ok === pair && pair[0].pair[0] !== a) [a, b] = [b, a];          // "a" is whoever comes first in the pair
  const c = pick(ok);
  return c.lines.map(([k, t]) => [k === "a" ? a : b, t]);
}
