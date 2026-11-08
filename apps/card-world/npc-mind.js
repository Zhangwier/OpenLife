// What a villager makes of the village: a handful of lawful projects, each scored by how much the village
// needs it and carrying the reason they would give. Pure; app.js turns the chosen project into ordinary work.
import { chooseNpcIntent, shortagePressure } from "./npc-goals.js";
import { BARE_HILLS, SOIL_MAX } from "./ecology-chain.js";

/** One field feeds about two people; never fewer than two fields, never more than six. */
export const fieldsWanted = (people) => Math.max(2, Math.min(6, Math.ceil(people / 2)));

/** How short of food the village is, 0–1: grain counts three meals, a cooked serving one; three days' meals per head is comfortable. */
export const foodPressure = ({ grain = 0, cooked = 0, people = 1 }) => shortagePressure(grain * 3 + cooked, Math.max(1, people) * 9) / 100;

/** What there is to do in the fields this season, best first. */
export function farmerProject({ season, people, fields = [], grain = 0, cooked = 0, beans = 0, ash = 0, hoe = false, farmPlot = false, seed = 0, year = 0, dry = false, jar = false, build = false, crowded = false, fireFuel = 6, tending = true, logs = 6 }) {
  const hunger = foodPressure({ grain, cooked, people });
  const want = fieldsWanted(people) + (hunger > 0.5 ? 1 : 0);              // short of food: one field more than the headcount says
  const land = Math.max(0, want - fields.length) / want;
  const bare = fields.filter((f) => f.sown === false && !f.fallow);
  const tired = (f) => (f.soil ?? 3) <= 1;
  const ripe = fields.find((f) => f.sown !== false && (f.stock ?? 0) >= 1);
  const growing = fields.filter((f) => f.sown !== false && (f.stock ?? 0) < 3).sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0))[0];
  const poorest = fields.filter((f) => (f.soil ?? 3) < 3 && f.manured !== year && f.sown === false).sort((a, b) => (a.soil ?? 3) - (b.soil ?? 3))[0];
  const beanField = bare.filter((f) => (f.soil ?? 3) <= 2).sort((a, b) => (a.soil ?? 3) - (b.soil ?? 3))[0];
  const restField = bare.find((f) => tired(f));
  const spring = season === "春", off = season === "冬" || spring;
  return chooseNpcIntent([
    { id: "harvest", field: ripe?.id, possible: season === "秋" && Boolean(ripe), utility: 10, because: "庄稼熟了，赶在入冬前收回来" },
    { id: "sow-bean", field: beanField?.id, possible: spring && Boolean(beanField) && beans > 0, utility: 9.2,
      because: "这块地薄了，种一季豆养养地" },
    { id: "fallow", field: restField?.id, possible: spring && Boolean(restField) && !beans && hunger < 0.5 && bare.length > 0 && fields.length > 1, utility: 9.1,
      because: "这块地种乏了，口粮还够，今年让它歇着" },
    { id: "sow", field: bare[0]?.id, possible: spring && bare.length > 0 && (grain > 0 || seed > 0), utility: 9, because: "开春了，地得赶紧种上" },
    { id: "water", field: growing?.id ?? fields.find((f) => f.sown !== false && !f.watered)?.id, possible: season === "夏" && dry && jar && fields.some((f) => f.sown !== false && !f.watered), utility: 7.8,
      because: "好几天没下雨了，挑水浇浇地" },
    { id: "work-plot", possible: Boolean(farmPlot) && (farmPlot === "clear" || (season !== "冬" && hoe)), utility: 7,
      because: farmPlot === "clear" ? "荒地还没清完，接着拔草捡石头" : "荒地清出来了，接着翻" },
    { id: "build", possible: build && (season !== "秋" || crowded), utility: crowded ? 7.5 : off ? 6.5 : 5,
      because: crowded ? "有人没铺位睡，新屋得赶紧盖起来" : "地基上的料齐了，去盖" },
    { id: "manure", field: poorest?.id, possible: Boolean(poorest) && ash > 0 && season !== "夏", utility: 6 + (3 - (poorest?.soil ?? 3)),
      because: "收完了，往薄地里撒些草木灰" },
    { id: "open-land", possible: off && !farmPlot && land > 0 && fields.length < 6, utility: Math.min(7.4, 5 + land * 3 + hunger * 2),
      because: `${hunger > 0.5 ? "粮不够吃" : `${people} 口人只有 ${fields.length} 块地`}，趁${spring ? "开春" : "冬闲"}再开一块` },
    { id: "tend", field: growing?.id, possible: (spring || season === "夏") && Boolean(growing), utility: 4 + (3 - (growing?.stock ?? 3)),
      because: "苗还弱，锄锄草" },
    firewood({ season, fireFuel, tending }),
    { id: "winter-wood", possible: season === "秋" && !ripe && logs < 6, utility: 5.2, because: `冬天林子冻住就砍不着了，家里才 ${logs} 根柴，趁早多备些` },
    { id: "help-fish", possible: hunger > 0.3, utility: 2 + hunger * 3, because: "家里吃的不宽裕，去湖边捞点鱼" },
    { id: "rest", possible: true, utility: 2.5, because: season === "冬" ? "冬天地里没活，烤烤火" : "地里的活干完了，歇一歇" },
  ]);
}

const PILE_GOAL = { log: [6, 6, 10, 8], stone: [6, 6, 6, 6], reed: [6, 8, 8, 4] };
const SEASON_INDEX = { 春: 0, 夏: 1, 秋: 2, 冬: 3 };
const WORD = { log: "柴", stone: "石头", reed: "芦苇" };

/** For whoever cuts wood, digs stone or cuts reed: where the next load does the most good. */
export function gathererProject({ material, season, pile = 0, plotNeed = 0, fireFuel = 6, tending = true, wood = 0, felled = 0, stumps = 0, people = 1, grain = 0, cooked = 0, build = false, help = false }) {
  const goal = PILE_GOAL[material][SEASON_INDEX[season]], short = Math.max(0, goal - pile) / goal;
  const hunger = foodPressure({ grain, cooked, people });
  return chooseNpcIntent([
    { id: "supply-plot", possible: plotNeed > 0, utility: 7 + Math.min(3, plotNeed) / 2, because: `地基还缺 ${plotNeed} 份${WORD[material]}，先送过去` },
    { id: "feed-fire", possible: tending && fireFuel <= 1 && (wood > 0 || material === "log"), utility: 6.5 + (1 - fireFuel), because: "火塘快灭了，添把柴" },
    { id: "replant", possible: material === "log" && stumps > 0 && felled >= BARE_HILLS * 0.6 && season !== "冬", utility: 5.5,
      because: "林子砍秃了一片，补种些小树，不然山水下来得急" },
    { id: "build", possible: build, utility: 6, because: "地基上的料齐了，去盖" },
    { id: "help-build", possible: help && !build, utility: 4.5, because: "那边在盖房子，过去搭把手，也学学怎么盖" },
    { id: "stockpile", possible: short > 0, utility: 4 + short * 3,
      because: season === "秋" && material === "log" ? `冬天要烧柴，家里才 ${pile} 捆，得多备些` : `家里的${WORD[material]}只剩 ${pile} 份，再备点` },
    { id: "help-fish", possible: hunger > 0.3, utility: 2.5 + hunger * 3, because: "吃的不宽裕，先去湖边帮着捞鱼" },
    { id: "rest", possible: true, utility: 3, because: `家里的${WORD[material]}够用了，不急着再弄` },
  ]);
}

/** The cook: a full pot, a lit stove, something put by for winter. */
export function cookProject({ season, stove = 0, stoveFuel = 6, grain = 0, reserve = 0, lake = 0, wood = 0, smoking = false, smoked = 0, people = 1, cooked = 0 }) {
  const hunger = foodPressure({ grain, cooked: stove, people });
  return chooseNpcIntent([
    { id: "fuel-stove", possible: stoveFuel <= 1, utility: (stove < 4 ? 7.6 : 5.5) + (1 - stoveFuel), because: wood > 0 ? "灶里快没火了，先添柴" : "灶里快没火了，家里也没柴，去拾一捆" },
    { id: "cook", possible: stove < 4 && grain > reserve && stoveFuel > 0, utility: 7 + (4 - stove) / 2, because: grain - reserve <= 3 ? "粟不多了，省着煮" : "锅里快空了，煮一锅" },
    { id: "fish", possible: stove < 6 && lake > 0 && season !== "冬", utility: 5 + (6 - stove) / 3 + hunger, because: "粮要留种，去湖边弄点鱼来下锅" },
    { id: "smoke", possible: smoking && (season === "秋" || season === "夏") && lake >= 4 && smoked < people * 2, utility: 5.5,
      because: "趁湖里鱼多，熏些鱼干，冬天好吃" },
    { id: "rest", possible: true, utility: 3, because: "锅里还有，收拾收拾" },
  ]);
}

/** The fisher: fish while the lake can spare them, rest it when it can't, and lend a hand at harvest. */
export function fisherProject({ season, lake = 0, stove = 0, grain = 0, people = 1, ripe = 0, smoking = false, smoked = 0, fireFuel = 6, tending = true }) {
  const hunger = foodPressure({ grain, cooked: stove, people });
  const thin = lake <= 2;
  return chooseNpcIntent([
    { id: "fish", possible: lake > 0 && season !== "冬" && (!thin || hunger > 0.6), utility: 6 + hunger * 3, because: thin ? "湖里鱼少了，可家里等着吃，还得捞" : "湖里鱼还多，捞几条送灶上" },
    { id: "rest-lake", possible: thin && hunger <= 0.6 && season !== "冬", utility: 5, because: "湖里鱼少了，让它缓几天，别捞绝了" },
    firewood({ season, fireFuel, tending }),
    { id: "help-harvest", possible: season === "秋" && ripe >= 2, utility: 6.5, because: "地里熟得多，一个人收不过来，去帮着收" },
    { id: "smoke", possible: smoking && season === "秋" && lake >= 5 && smoked < people * 2, utility: 5.5, because: "鱼多，熏一些留着过冬" },
    { id: "rest", possible: true, utility: 3, because: season === "冬" ? "湖上冻了，歇着补补网" : "灶上不缺鱼，歇一歇" },
  ]);
}

/** Where to fell: the grove with the most standing wood, leaving at least one so it grows back. */
export const pickGrove = (groves) =>
  groves.filter((g) => (g.stock ?? 0) >= 2).sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))[0] ?? null;

/** Anyone with nothing pressing sees to the hearth when it's about out — keener in winter. The stove is the cook's;
 *  `tending` is false while someone else is already on it, or in the working day when there's wood at home for tonight. */
const firewood = ({ season, fireFuel = 6, tending = true }) => ({
  id: "firewood", possible: tending && fireFuel <= 1, utility: season === "冬" ? 6 : 4.6, because: "火塘快灭了，拾些柴回来",
});

export const soilAfterManure = (soil) => Math.min(SOIL_MAX, (soil ?? 3) + 1);
