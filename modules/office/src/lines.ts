/**
 * 给玩家看的话。
 *
 * 规则只决定"发生了什么"，这里决定"它听起来像什么"。分开的好处是内容作者
 * 可以改文字而不碰规则，也可以照同一份格式写自己的内容包。
 *
 * 写作要求（需求书第 3 节）：
 *  - 口吻贴合时代：石器村落说"推""举手""站队"，不说"选举""投票"。
 *  - 不出现数字和"好感度"之类的词。
 *  - 拒绝和反感要写出这个人自己的理由（地、粮、旧怨、亲疏）。
 *  - 许诺被违背时，被骗的人要当面说出你当初许过的话。
 */
import { readFileSync } from "node:fs";

export interface OfficeLines {
  canvass: {
    visit: { warm: string[]; cool: string[]; annoyed: string[] };
    gift: { warm: string[]; cool: string[]; bought: string[]; annoyed: string[] };
    promise: { warm: string[]; doubtful: string[] };
    speech: { crowd: string[]; few: string[] };
    "ask-ally": { helped: string[]; refused: string[] };
    smear: { stuck: string[]; backfired: string[] };
  };
  reply: {
    for: string[]; leaning: string[]; undecided: string[];
    against: string[]; grudge: string[]; kin: string[];
  };
  election: {
    acclaim: string[]; "vote-open": string[]; won: string[];
    lost: string[]; again: string[]; inherited: string[]; appointed: string[];
  };
  decision: Record<string, Record<string, string[]>>;
  consequence: {
    "pledge-kept": string[]; "pledge-broken": string[];
    neglected: string[]; unrest: string[]; recalled: string[]; ousted: string[];
  };
}

/** 内置的一套话，够开局用；内容包可以整个替换。 */
export const BASE_LINES: OfficeLines = {
  canvass: {
    visit: {
      warm: [
        "你还没进门，{name}就把手里的活放下了：“{candidate}啊，进来坐。”",
        "{name}听你说完，点了点头：“我记着了。”",
        "{name}把你送到门口：“你放心。”",
      ],
      cool: [
        "{name}一边应着一边继续忙：“知道了，我再想想。”",
        "{name}没抬头：“这话你跟别人说过没有？”",
        "{name}把手里的东西放下，看了你一眼，没接话。",
      ],
      annoyed: [
        "{name}打断你：“我家的事还忙不过来。”",
        "{name}把门掩上一半：“下回吧。”",
        "{name}笑了一下，那笑不是给你的：“你们这些人啊。”",
      ],
    },
    gift: {
      warm: [
        "{name}接过去，翻来覆去看了两遍：“这我可收下了。”",
        "{name}愣了一下，声音低了些：“你太客气。”",
        "{name}把东西收进怀里，拍了拍：“往后有事你说话。”",
      ],
      cool: [
        "{name}推了推：“这不好收。”最后到底还是留下了。",
        "{name}收下了，却放在离你远的那一边。",
        "{name}看了看东西，又看了看你：“就这些？”",
      ],
      bought: [
        "{name}把东西推回来，脸沉下去：“你当我是什么人。”",
        "{name}没接：“收了这个，往后我说什么话都轻了。”",
        "{name}站起来：“你走吧，这话别再提。”",
      ],
      annoyed: [
        "{name}连看都没看：“上回那件我还没动呢。”",
        "{name}叹了口气：“你这天天往我这儿跑，别人怎么想。”",
        "{name}把东西往外推：“别这样。”",
      ],
    },
    promise: {
      warm: [
        "你说完，{name}眼里亮了一下：“这话我记下了。”",
        "{name}重复了一遍你说的话，怕自己听错。",
        "{name}笑了：“你要真办到，我跟着你。”",
      ],
      doubtful: [
        "{name}慢吞吞地：“话是好话……可你办得到吗。”",
        "{name}没应声，过了一会儿才说：“先前也有人这么讲过。”",
        "{name}看着你：“我信你一回。”",
      ],
    },
    speech: {
      crowd: [
        "你站在议事场上说话，前排的人静下来，后头的人也往前挪了挪。",
        "你说了没几句，人群里有人应了一声，接着又有人应。",
        "场院上的人都听着。风把话吹散了，又被人重复回来。",
      ],
      few: [
        "你站在场院上说话，只有几个人停下来听。",
        "你说了几句，旁边的人各干各的活。",
        "你说话的时候，有个人回头看了一眼，又转回去了。",
      ],
    },
    "ask-ally": {
      helped: [
        "{name}想都没想：“我去跟他们说。”",
        "{name}拍了拍手上的土：“算我一个。”",
        "{name}看了你一会儿，点了头。",
      ],
      refused: [
        "{name}摇头：“这回我不能站你这边。”",
        "{name}避开你的眼睛：“你找别人吧。”",
        "{name}说：“我跟{name}家还有账没清。”",
      ],
    },
    smear: {
      stuck: [
        "话传出去了。几个人凑在一起低声说话，看见你就散了。",
        "你说的那件事，第二天在灶台边被人提起来。",
      ],
      backfired: [
        "话传回来了，比你说的还难听，而且说的人是你。",
        "有人当众问你是不是说过这话。没人替你说话。",
      ],
    },
  },
  reply: {
    for: ["“我站你。”", "“行，我举你的手。”", "“你说话，我跟着。”"],
    leaning: ["“我心里有个人了。”", "“我再看看。”", "“还没定。”"],
    undecided: ["“都还行吧。”", "“谁当不是当。”", "“到时候再说。”"],
    against: ["“这回我不站你。”", "“你不行。”", "“我心里有人了。”"],
    grudge: [
      "“上回你说的话，你忘了？”",
      "“你许过我一样事，没办。”",
      "“先前你可不是这么说的。”",
    ],
    kin: ["“自家人，我不帮你帮谁。”", "“你是我亲戚，这话不用讲。”"],
  },
  election: {
    acclaim: [
      "村里人凑在议事场，有人先喊了一声，接着一片都应了。",
      "没有人反对，事情就这么定了。",
    ],
    "vote-open": ["要选人了。这几天各家门上都不清静。"],
    won: [
      "数完了。{candidate}的票最多。往后村里的事，得你来说话。",
      "人都散了，剩下你站在场院上。从今天起，你是{office}。",
    ],
    lost: [
      "数完了。{rival}多了一票。你没说什么，转身走了。",
      "差一点。有人拍了拍你的肩，没说话。",
    ],
    again: ["这是第二回了。村里人记得上回你也站出来过。"],
    inherited: ["位子是从上辈手里接过来的。没人说什么。"],
    appointed: ["{candidate}点了你的名。就这么定了。"],
  },
  decision: {
    "matter:dispute": {
      "favor-a": ["你说是先占的那块。{name}家没再争，另一家把锄头扛走了。"],
      "favor-b": ["你按今年谁种得多来断。有人不服，但没当面说。"],
      split: ["你从中间划开。两家都不太满意，但都没再闹。"],
      boundary: ["你让人抬来界石，砸进土里。两家看了看石头，各自回去了。"],
    },
    "matter:granary": {
      open: ["仓门开了。各家拿着家什排队，没人抢。"],
      ration: ["你让人在木板上刻了各家的人口，按刻痕分。没人争。"],
      keep: ["仓门没开。有人站在门口看了很久才走。"],
    },
    "matter:labor": {
      "call-all": ["鼓响了三遍。第二天天没亮，堤上就站满了人。"],
      volunteers: ["来了七八个。活干到一半，天黑了。"],
      ignore: ["今年堤没修。有人问了一句，没人应。"],
    },
    "matter:rule": {
      enact: ["你把这条规矩当众说了一遍，让人跟着重复了一遍。"],
      drop: ["你没立这条规矩。各家还是照各家的来。"],
    },
    "matter:feast": {
      feast: ["灶上支起了大锅。孩子们围着转，大人难得都笑。"],
      save: ["今年没办。灶台边比往年冷清。"],
    },
    "matter:market": {
      "open-market": ["你定了日子。头一回赶集，来的人比想的多。"],
      "no-market": ["你说再等等。有人应了一声，也有人没说话。"],
    },
  },
  consequence: {
    "pledge-kept": [
      "{name}在众人面前提起你许过的那件事：“他办到了。”",
      "有人跟你说：“你上回讲的话，我记着呢。你没赖。”",
    ],
    "pledge-broken": [
      "{name}拦住你：“你许过我{option}。你忘了？”",
      "{name}当着人说：“他说过{option}的。你们问他。”",
    ],
    neglected: ["有人在你门口站了一会儿，没进来。"],
    unrest: ["这几天村里说话都压着声。", "有人开始不去议事场了。"],
    recalled: ["有人当众提了一句：换个人试试。"],
    ousted: ["位子空出来了。没人替你说话。"],
  },
};

/** 从一组话里挑一条，填上占位符。 */
export function pickLine(
  lines: readonly string[],
  fill: Record<string, string>,
  pick: (n: number) => number,
): string {
  if (!lines.length) return "";
  const raw = lines[pick(lines.length)] ?? lines[0]!;
  return raw.replace(/\{(\w+)\}/g, (whole, key: string) => fill[key] ?? whole);
}

/** 内容包可以整个替换这套话：读它的 office.lines.json。 */
export function loadOfficeLines(url: URL): OfficeLines {
  return JSON.parse(readFileSync(url, "utf8")) as OfficeLines;
}
