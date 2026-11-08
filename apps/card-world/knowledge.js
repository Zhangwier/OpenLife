// What the village comes to know, and what it thinks of because of it. Adapted from the old engine's tech data
// (archives/openlife-engine-20261102/modules/tech/data: needs, phenomena, theories, inventions).
// The chain: trouble keeps coming back (a need grows) and the same thing keeps being seen (a phenomenon) → someone
// sums it up (a theory — wrong ones come quicker) → a right theory plus a pressing need → someone thinks of something.
// Wrong theories don't help, but they become customs and stay. The player never sees a "truth" value.

export const NEEDS = {
  "preserve-food": "吃的放不住",
  "more-grain": "粮不够吃",
  "flood": "怕涨水",
  "know-season": "拿不准农时",
  "cold": "冬天冻病",
  "rabbits": "兔子啃苗",
  "tired-soil": "地种乏了",
  "clutter": "东西没处放",
};
export const PHENOMENA = {
  "food-spoils": "吃的放久了会坏",
  "river-rise": "春天湖水会涨",
  "seasons-turn": "日影长短一年一轮",
  "cold-sick": "冬夜在外头会冻病",
  "rabbits-eat-crop": "野兔夜里钻进田里啃苗",
  "soil-tires": "一块地连着种，收成一年比一年少",
};
/** needs: how many sightings before someone sums it up (wrong ones need fewer). custom: what a wrong one turns into. */
export const THEORIES = [
  { id: "bad-luck-rots", label: "沾了晦气", explains: "food-spoils", claim: "“东西坏，是沾了晦气。得挂符驱邪。”", needs: 2, custom: { id: "charms", name: "挂符", text: "公仓和灶边挂上了驱邪的符" } },
  { id: "dry-heat-keeps", label: "湿热则腐", explains: "food-spoils", claim: "“东西坏是因为又湿又热。干了、熏了，就放得住。”", needs: 5, true: true },
  { id: "lake-god", label: "湖神发怒", explains: "river-rise", claim: "“湖水漫上来，是湖神发怒了。开春得给湖神送条鱼。”", needs: 1, custom: { id: "lake-offering", name: "祭湖", text: "开春要给湖神送一条鱼" } },
  { id: "water-marks", label: "水候", explains: "river-rise", claim: "“春雨连下两天，湖就要涨。在湖边刻木记着水，就能早知道。”", needs: 3, true: true },
  { id: "shadow-year", label: "日影一年一轮", explains: "seasons-turn", claim: "“日影一天比一天长，长到头又短回来，一年一轮。立根竿子量影子，就知道哪天换季。”", needs: 4, true: true },
  { id: "cold-evil", label: "撞了邪", explains: "cold-sick", claim: "“夜里病倒，是撞了邪。”", needs: 1, custom: { id: "exorcism", name: "驱邪", text: "有人病了要在火边念几句驱邪的话" } },
  { id: "cool-keeps", label: "地下凉则久", explains: "food-spoils", claim: "“地底下凉。东西放深一点，就放得久。”", needs: 4, true: true },
  { id: "field-spirit", label: "田神要供", explains: "rabbits-eat-crop", claim: "“兔子来啃苗，是田神嫌咱们没上供。”", needs: 1, custom: { id: "field-offering", name: "供田神", text: "开春往田头撒一把粟" } },
  { id: "rabbits-fear-people", label: "兔子怕人", explains: "rabbits-eat-crop", claim: "“兔子怕人。田边立个像人的东西，它就不敢来。”", needs: 2, true: true },
  { id: "fence-keeps-out", label: "围住才挡得住", explains: "rabbits-eat-crop", claim: "“兔子是从地边钻进来的。拿木头把地围上，它就进不去。”", needs: 4, true: true },
  { id: "soil-god", label: "地神不高兴", explains: "soil-tires", claim: "“收成一年不如一年，是地神不高兴了。”", needs: 1, custom: { id: "soil-offering", name: "祭地", text: "秋收后在田头摆一碗新粟" } },
  { id: "soil-tired", label: "地也会累", explains: "soil-tires", claim: "“地跟人一样，干多了会累。烂草、灶灰沤成肥喂给它，就缓过来了。”", needs: 2, true: true },
  { id: "cold-fire", label: "寒气入骨", explains: "cold-sick", claim: "“冬夜寒气入骨，离了火就要病。”", needs: 2, true: true },
];
/** What can be thought of. principle: the theory it rests on; need: which need, and how strong, before anyone thinks of it. */
export const INVENTIONS = [
  { id: "smoking", name: "烟熏", principle: "dry-heat-keeps", need: ["preserve-food", 3], idea: "“鱼肉吊在火塘上熏干了，就放得住。”" },
  { id: "flood-marks", name: "刻木记水", principle: "water-marks", need: ["flood", 1], idea: "“在湖边立根木头刻上道道，水涨一道就看得见，明天漫不漫岸心里有数。”" },
  { id: "scarecrow", name: "稻草人", principle: "rabbits-fear-people", need: ["rabbits", 2], idea: "“拿芦苇扎个草人，插在田里，兔子远远看着就当是人。”" },
  { id: "fence", name: "篱笆", principle: "fence-keeps-out", need: ["rabbits", 4], idea: "“砍些木桩，拿绳子编成篱笆，把地围起来。”" },
  { id: "compost", name: "堆肥坑", principle: "soil-tired", need: ["tired-soil", 1], idea: "“挖个坑，把烂菜叶、坏了的吃食倒进去，沤上几天就是肥。”" },
  { id: "chest", name: "木柜", principle: null, need: ["clutter", 3], idea: "“家里的东西摊了一地。钉个木柜，放得住的都收进去。”" },
  { id: "calendar-stick", name: "立竿测影", principle: "shadow-year", need: ["know-season", 1], idea: "“在田边立根竿子，量影子长短，就知道还有几天换季。”" },
];
/** Whose work brings them up against what. Only they mull it over: a fisher doesn't puzzle out tired soil, a farmer
 *  doesn't think up a way to keep fish. Phenomena and needs alike. */
const ANYONE = ["cook", "farm", "fish", "reed", "wood", "stone", "build"];
export const MINDFUL = {
  "food-spoils": ["cook", "fish"], "preserve-food": ["cook", "fish"],
  "river-rise": ["fish", "reed"], "flood": ["fish", "reed"],
  "seasons-turn": ["farm"], "know-season": ["farm"],
  "rabbits-eat-crop": ["farm"], "rabbits": ["farm"],
  "soil-tires": ["farm"], "tired-soil": ["farm"],
  "more-grain": ["farm", "cook"],
  "cold-sick": ANYONE, "cold": ANYONE,
  "clutter": ["cook", "build", "wood", "stone"],
};
export const mindful = (topic, job) => (MINDFUL[topic] ?? ANYONE).includes(job);
