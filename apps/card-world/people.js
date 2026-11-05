// Who the villagers are: what they like, fear and remember, what they ask of you, what they tell you once they trust you.
// Adapted from the old engine's people and bonds data (archives/openlife-engine-20261102/modules/settlement-locations/
// data/river-terrace.people.json, village-stories/data/river-terrace.bonds.json, village-wants/data/fears.json).
// {name} is the speaker, {item} the thing given. Days of the year run 1–16 (four days to a season).

/** How close you are, by "hearts" (familiarity and trust together, less any grudge). */
export const TIERS = [
  { name: "陌生", min: -99 }, { name: "相识", min: 1 }, { name: "朋友", min: 3 }, { name: "知己", min: 6 }, { name: "挚友", min: 9 },
];
export const tierOf = (h) => [...TIERS].reverse().find((t) => h >= t.min);

const SEASON_DAY = (d) => `${["春", "夏", "秋", "冬"][Math.floor((d - 1) / 4)]}天第${["一", "二", "三", "四"][(d - 1) % 4]}天`;
export const dayName = SEASON_DAY;

export const PEOPLE_DATA = {
  aunt: {
    he: "她",
    loves: ["grain", "basket", "jarFull"], likes: ["fish", "reed", "berry", "egg", "rope", "roastFish"], dislikes: ["clay", "stone"],
    birthday: 6,
    fear: { id: "hunger", name: "怕挨饿", tell: "“我年轻时候闹过一回饥荒，一冬天就吃草根。从那以后看见瓮底就心慌。”" },
    likesTell: "“粟最踏实。手里攥着一把粟，夜里才睡得着。”",
    gift: {
      love: "{name}把{item}抱进怀里，眼角都笑出了褶子：“你这孩子，怎么知道我正愁这个。”",
      like: "“好，好，正用得上。”",
      plain: "“给我的？那我收下了。”",
      dislike: "{name}拍了拍你的手：“这东西家里多的是，你留着。心意我收下了。”",
      again: "“又是这个呀……够了够了，留着你自己用。”",
      birthday: "{name}愣了一下，眼圈红了：“你还记得今天……都多少年没人记得了。”",
    },
    seasons: {
      春: ["{name}在院里晒被褥：“开春了，屋里的潮气得赶出去。”"],
      夏: ["{name}扇着蒲扇：“夏天东西坏得快，熟食别隔夜。”"],
      秋: ["{name}数着筐里的粟：“秋天收多少，冬天就过得多宽。”"],
      冬: ["{name}把你往火边推：“冬天别在外头久待，手冻坏了干不了活。”"],
    },
    happy: ["{name}一边干活一边哼着支老调子。", "“今天灶上的火好，粥熬得稠。”"],
    low: ["{name}叹了口气：“瓮里的粟又浅了一截。”", "{name}半天没说话，一下一下拨着灶灰。"],
    news: [
      (c) => (c.granary <= 6 ? "“公仓见底了，我夜里都睡不踏实。”" : null),
      (c) => (c.season === "冬" ? "“冬天柴火最要紧，断了火，一屋子人都得冻着。”" : null),
      (c) => (c.season === "秋" ? "“等新粟下来，我想给大伙蒸一锅粟饭。”" : null),
      () => "“灶上的事有我，你忙你的去。”",
    ],
    heart: {
      2: { text: "{name}把你拉到一边，从瓮底摸出一小把炒过的粟塞给你：“别声张，他们说我惯着你。”", give: ["grain"] },
      5: { text: "{name}说起老家：“我娘家那边也有条河，比这湖宽。发大水那年，我抱着一个陶罐漂了半天。”她低头看着手里的罐子，“所以我看见罐子就舍不得扔。”" },
      8: { text: "{name}塞给你一张新编的小席子：“天冷了，垫着睡。往后冷了累了，就回这院子来，跟自家人一样。”", rest: 40 },
    },
    ties: { san: "{name}压低声音：“阿三那孩子，爹走得早，话少，心实。我拿他当自家孩子看。”" },
    // What she may ask of you. give: what to bring; to: where it goes once handed over. deed: something to do instead.
    asks: [
      { id: "wood", give: { wood: 2 }, to: "stove", when: (c) => c.stoveFuel <= 2, text: "“灶上的柴快烧完了，明天天黑前能背两捆柴来吗？”", why: "灶上的柴快烧完了", thanks: "“火旺了，今晚的粥稠。”", kept: "你按约背来两捆柴", broken: "答应的柴没送来" },
      { id: "fish", give: { fish: 2 }, to: "stove", when: (c) => c.season !== "冬", text: "“你去湖边捞两条鱼来，晚上添个菜。”", why: "想给晚饭添个菜", thanks: "“这鱼肥！晚上给你留一碗。”", kept: "你捞来两条鱼添了菜", broken: "说好的鱼没捞来" },
      { id: "reed", give: { reed: 3 }, to: "pile", when: (c) => c.season === "秋" || c.season === "冬", text: "“天要冷了，我想编张苇席，帮我割三捆芦苇？”", why: "想编一张过冬的苇席", thanks: "“够了够了，这席子能编得厚实。”", kept: "你割来三捆芦苇编席", broken: "答应的芦苇没割来" },
      { id: "berry", give: { berry: 3 }, to: "pile", when: (c) => c.season === "夏" || c.season === "秋", text: "“林子边上的野果该熟了，摘一把来，给阿三解解馋。”", why: "想给阿三解解馋", thanks: "“酸甜酸甜的，阿三准高兴。”", kept: "你摘来一把野果", broken: "说好的野果没摘来" },
    ],
  },
  san: {
    he: "他",
    loves: ["hoe", "rope", "roastMeat", "axe"], likes: ["grain", "wood", "fiber", "meat", "log"], dislikes: ["clay", "berry"],
    birthday: 11,
    fear: { id: "scorned", name: "怕被人看不起", tell: "“我嘴笨……别人笑的时候，总觉得是在笑我。”" },
    likesTell: "“有把好锄头，比啥都强。”",
    gift: {
      love: "{name}接过{item}，翻来覆去看了好几遍，半天才憋出一句：“……好东西。”",
      like: "“嗯，用得上。”",
      plain: "{name}点点头，收下了。",
      dislike: "{name}挠挠头：“这个我用不上……不过谢谢你想着我。”",
      again: "“上回给过了。”",
      birthday: "{name}耳朵一下红了：“你怎么知道……我自己都快忘了。”",
    },
    seasons: {
      春: ["{name}蹲在地头：“下种就看这几天，晚一天秋后就少一把。”"],
      夏: ["{name}直起腰：“草长得比粟还快，一天不锄就输给它。”"],
      秋: ["{name}难得笑了：“你看这穗子，沉得都弯了腰。”"],
      冬: ["{name}看着光秃秃的地：“冬天地歇着，人也该歇歇，可我闲不住。”"],
    },
    happy: ["{name}干完活还不肯走，蹲在地头比划着明年要多开的一垄。"],
    low: ["{name}闷着头锄地，锄得比平时重。", "{name}一句话也没说。"],
    news: [
      (c) => (!c.hoe ? "“锄头还没着落，地里的草光靠手拔，拔不过来。”" : null),
      (c) => (c.season === "春" ? "“种子留得够，就看老天给不给雨。”" : null),
      (c) => (c.season === "冬" ? "“开春想再开一块地，就在西边那片草地。”" : null),
      () => "“地里还行。”",
    ],
    heart: {
      2: { text: "{name}领你看他开的第一垄地：“爹走那年我十四，就从这一垄开始。”" },
      5: { text: "{name}说：“有时候想，就这么种一辈子地，也挺好。可又想去山那边看看。”他看了看远处的高原。" },
      8: { text: "{name}把一小袋种子交给你：“我挑了三年才留下的好种。你要是哪天有了自己的地，就种这个。”", give: ["grain", "grain"] },
    },
    ties: { aunt: "{name}说：“婶子嘴上唠叨，心比谁都软。我小时候饿肚子，是她一口一口喂大的。”" },
    asks: [
      { id: "stone", give: { stone: 2 }, to: "hand", when: (c) => !c.hoe, text: "“锄头刃口崩了，能帮我从矿道捡两块石头来吗？明天天黑前就行。”", why: "想打一把新锄头", thanks: "“这石头好，刃口能磨得快。”", kept: "你捡来两块石头给他打锄头", broken: "答应的石头没捡来" },
      { id: "fiber", give: { fiber: 2 }, to: "hand", when: () => true, text: "“搓绳子的葛麻不够了，割两份来？”", why: "要搓绳子", thanks: "“够搓一根了。”", kept: "你割来两份葛麻", broken: "说好的葛麻没割来" },
      { id: "tend", deed: "tend", when: (c) => c.season === "春" || c.season === "夏", text: "“地里草疯了，你得空帮我锄一遍？哪块都行。”", why: "地里草疯了", thanks: "“锄得干净。下回我也帮你。”", kept: "你帮他锄了一遍地", broken: "说好帮着锄地，没来" },
      { id: "log", give: { log: 2 }, to: "pile", when: (c) => c.season === "冬" || c.season === "秋", text: "“想趁冬闲劈点柴，帮我扛两根木头回院子？”", why: "想趁冬闲劈柴", thanks: "“好木头，劈出来耐烧。”", kept: "你扛来两根木头", broken: "答应的木头没扛来" },
    ],
  },
};
