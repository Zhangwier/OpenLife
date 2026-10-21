/**
 * narrative-voice 单元测试 (使用 node:test)
 * 覆盖：
 * 1. 同种子确定性重放结果一字不差 (INV-007)
 * 2. 人写台词优先 (people.json / village-stories / office.lines.json) 与防重复耗尽后文法兜底
 * 3. 防重复池通过组件与 Effect 跨存档持久化生效
 * 4. 生成文字绝无阿拉伯数字、百分号与现代/跨时代违禁词，且满足句数与字数约束
 * 5. 模块内所有文件均不超过 1200 行上限
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  VOICE_MEMORY_COMPONENT_ID,
  expand,
  loadNeolithicGrammar,
  narrativeVoiceModule
} from "../../modules/narrative-voice/src/module.ts";
import type {
  DeterministicRngLike,
  VoiceCapabilityRequest,
  VoiceCapabilityResponse,
  WorldViewLike
} from "../../modules/narrative-voice/src/module.ts";

/**
 * 确定性线性同余/Mulberry32 伪随机数生成器（仅用于测试模拟内核 ctx.rng）
 */
function createSeededRng(seed: number): DeterministicRngLike {
  let state = seed >>> 0;
  return {
    nextFloat(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}

/**
 * 构造可模拟存档/读档与 Effect 应用的内存 WorldView
 */
function createMockWorld(initialComponents: Record<string, Record<string, unknown>> = {}) {
  const store: Record<string, Record<string, unknown>> = JSON.parse(
    JSON.stringify(initialComponents)
  );

  const world: WorldViewLike & {
    applyEffects: (effects: Array<{ type: string; entityId: string; componentId: string; value: unknown }>) => void;
    serialize: () => string;
  } = {
    getComponent<T = unknown>(entityId: string, componentId: string): T | undefined {
      return store[entityId]?.[componentId] as T | undefined;
    },
    seasonAt(tick = 0): "春" | "夏" | "秋" | "冬" {
      const seasons: Array<"春" | "夏" | "秋" | "冬"> = ["春", "夏", "秋", "冬"];
      return seasons[Math.abs(Math.floor(tick)) % 4] ?? "春";
    },
    applyEffects(effects) {
      for (const ef of effects) {
        if (ef.type === "setComponent") {
          if (!store[ef.entityId]) store[ef.entityId] = {};
          store[ef.entityId]![ef.componentId] = JSON.parse(JSON.stringify(ef.value));
        }
      }
    },
    serialize(): string {
      return JSON.stringify(store);
    }
  };

  return world;
}

function setupModuleHarness(seed = 20261017) {
  const registeredComponents: string[] = [];
  const capabilities = new Map<string, (req: VoiceCapabilityRequest) => VoiceCapabilityResponse>();
  const rng = createSeededRng(seed);

  narrativeVoiceModule.register({
    rng,
    registerComponent(idOrDef) {
      const id = typeof idOrDef === "string" ? idOrDef : idOrDef.id;
      registeredComponents.push(id);
    },
    provideCapability(name, handler) {
      capabilities.set(name, handler as (req: VoiceCapabilityRequest) => VoiceCapabilityResponse);
    }
  });

  const say = capabilities.get("narrative-voice.say");
  const narrate = capabilities.get("narrative-voice.narrate");
  assert.ok(say, "narrative-voice.say capability should be provided");
  assert.ok(narrate, "narrative-voice.narrate capability should be provided");

  return { registeredComponents, say, narrate, rng };
}

describe("modules/narrative-voice", () => {
  it("1. 同种子确定性重放结果一字不差 (INV-007)", () => {
    const runSimulation = (seed: number): string[] => {
      const { say, narrate } = setupModuleHarness(seed);
      const world = createMockWorld({
        "world": {
          "world-weather.region-state": {
            seasonPhase: 0.3,
            temperatureAnomalyC: -2.4,
            humidityAnomaly: 0.32
          },
          "world-clock.clock": { dayPhase: "清晨" }
        },
        "res-ashu": {
          "settlement-locations.resident": {
            key: "res-ashu",
            name: "阿黍",
            age: 48,
            role: "烧陶的",
            trait: "心细手稳，爱观察泥坯成色",
            workPlace: "北坡陶窑",
            homeSpace: "东侧半地穴居所",
            hunger: 20
          },
          "heredity": {
            dexterity: 88,
            perception: 79,
            memory: 84
          }
        }
      });

      const outputs: string[] = [];
      for (let step = 0; step < 8; step++) {
        const sRes = say({ world, residentId: "res-ashu", tick: step });
        world.applyEffects(sRes.effects);
        outputs.push(sRes.text);

        const nRes = narrate({ world, residentId: "res-ashu", tick: step });
        world.applyEffects(nRes.effects);
        outputs.push(nRes.text);
      }
      return outputs;
    };

    const firstReplay = runSimulation(987654321);
    const secondReplay = runSimulation(987654321);
    assert.deepEqual(firstReplay, secondReplay, "相同种子与相同操作序列生成的文字必须一字不差");

    const differentSeedReplay = runSimulation(123456789);
    assert.notDeepEqual(firstReplay, differentSeedReplay, "不同种子应产生不同的随机抽样序列");
  });

  it("2. 人写台词优先，且当人写台词进入防重复池后自动使用文法生成兜底", () => {
    const { say } = setupModuleHarness(42);
    const world = createMockWorld({
      "res-ahuo": {
        "settlement-locations.resident": {
          key: "res-ahuo",
          name: "阿火",
          age: 31,
          role: "看火的",
          trait: "话少踏实",
          workPlace: "大火塘",
          hunger: 10
        }
      }
    });

    const authoredPerson = {
      loves: ["红陶罐"],
      giftLines: {
        love: ["这只{item}烧得真周正，{name}正缺个盛粟米的罐子。"]
      },
      seasons: {
        春: ["春风一吹，火塘边的干柴也没那么容易返潮了。"]
      },
      happy: ["火苗旺实，心头就敞亮。"]
    };

    // 第一次调用：命中赠礼人写台词并替换占位符 {name}、{item}
    const giftCall = say({
      world,
      residentId: "res-ahuo",
      item: "红陶罐",
      authoredPerson,
      tick: 0
    });
    world.applyEffects(giftCall.effects);
    assert.equal(giftCall.source, "authored");
    assert.equal(giftCall.text, "这只红陶罐烧得真周正，阿火正缺个盛粟米的罐子。");

    // 第二次调用（无赠礼，春季）：命中 seasons.春 人写台词
    const seasonCall = say({
      world,
      residentId: "res-ahuo",
      authoredPerson,
      tick: 0
    });
    world.applyEffects(seasonCall.effects);
    assert.equal(seasonCall.source, "authored");
    assert.equal(seasonCall.text, "春风一吹，火塘边的干柴也没那么容易返潮了。");

    // 第三次调用：seasons.春 已在防重复池，命中 happy 人写台词
    const happyCall = say({
      world,
      residentId: "res-ahuo",
      authoredPerson,
      tick: 0
    });
    world.applyEffects(happyCall.effects);
    assert.equal(happyCall.source, "authored");
    assert.equal(happyCall.text, "火苗旺实，心头就敞亮。");

    // 第四次调用：所有人写台词均已在最近 25 条防重复池中，自动回退到文法生成 (procedural)
    const fallbackCall = say({
      world,
      residentId: "res-ahuo",
      authoredPerson,
      tick: 0
    });
    world.applyEffects(fallbackCall.effects);
    assert.equal(fallbackCall.source, "procedural");
    assert.ok(fallbackCall.text.length >= 10);
  });

  it("3. 防重复池通过注册组件与 Effect 跨存档持久化生效", () => {
    const { registeredComponents, say } = setupModuleHarness(777);
    assert.ok(
      registeredComponents.includes(VOICE_MEMORY_COMPONENT_ID),
      "必须注册 narrative-voice.memory 组件"
    );

    const worldBeforeSave = createMockWorld({
      "res-awu": {
        "settlement-locations.resident": {
          key: "res-awu",
          name: "阿苇",
          age: 22,
          role: "采苇子的",
          trait: "急性子，手脚麻利",
          workPlace: "河湾芦苇荡",
          hunger: 80
        }
      }
    });

    const first = say({ world: worldBeforeSave, residentId: "res-awu", tick: 1 });
    worldBeforeSave.applyEffects(first.effects);

    // 模拟存档序列化并恢复到新世界的读档过程
    const savedSnapshotJson = worldBeforeSave.serialize();
    const restoredStore = JSON.parse(savedSnapshotJson) as Record<string, Record<string, unknown>>;
    const worldAfterLoad = createMockWorld(restoredStore);

    const memoryAfterLoad = worldAfterLoad.getComponent?.<{ recentLines: string[] }>(
      "res-awu",
      VOICE_MEMORY_COMPONENT_ID
    );
    assert.ok(memoryAfterLoad, "读档后世界组件中应保留防重复记忆");
    assert.deepEqual(memoryAfterLoad.recentLines, [first.text]);

    // 即使使用完全相同的种子调用，因读档后的组件中已记录 first.text，生成结果绝不与上一句重复
    const harnessAfterLoad = setupModuleHarness(777);
    const second = harnessAfterLoad.say({
      world: worldAfterLoad,
      residentId: "res-awu",
      tick: 1
    });
    assert.notEqual(second.text, first.text, "跨存档恢复后不应重复存档前刚说过的句子");
  });

  it("4. 生成文字绝无数字、百分号和现代违禁词，且符合新石器时代风貌与长度规范", () => {
    const grammar = loadNeolithicGrammar();
    const { say, narrate } = setupModuleHarness(13579);
    const forbidden = grammar.forbiddenWords ?? [];

    const roles = ["看火的", "烧陶的", "守渡口的", "采苇子的", "种粟的", "巫医", "头人"];
    const traits = [
      "心细手巧，爱瞅泥坯纹路",
      "性子急，脚下生风",
      "话少沉闷，干活实在",
      "热心爱唠叨，总惦记窖穴存粮",
      "老成稳重，记性极好",
      "爽利痛快，嗓门洪亮"
    ];

    const world = createMockWorld({});

    for (let i = 0; i < 40; i++) {
      const residentId = `res-${i % 5}`;
      world.applyEffects([
        {
          type: "setComponent",
          entityId: "world",
          componentId: "world-weather.region-state",
          value: {
            seasonPhase: (i % 10) / 10,
            temperatureAnomalyC: (i % 7) - 3,
            humidityAnomaly: ((i % 5) - 2) * 0.15
          }
        },
        {
          type: "setComponent",
          entityId: residentId,
          componentId: "settlement-locations.resident",
          value: {
            key: residentId,
            name: "阿石",
            age: 18 + (i % 40),
            role: roles[i % roles.length],
            trait: traits[i % traits.length],
            workPlace: "河岸晒泥场",
            homeSpace: "半地穴草顶屋",
            hunger: i % 3 === 0 ? 75 : 15
          }
        },
        {
          type: "setComponent",
          entityId: residentId,
          componentId: "heredity",
          value: {
            strength: (i * 17) % 100,
            dexterity: (i * 23) % 100,
            perception: (i * 31) % 100,
            "cold-tolerance": (i * 13) % 100,
            memory: (i * 29) % 100
          }
        }
      ]);

      const sOut = say({
        world,
        residentId,
        targetId: "res-partner",
        targetName: "阿木",
        authoredPerson: {
          ties: {
            "res-partner": {
              relation: i % 4 === 0 ? "老伴" : i % 4 === 1 ? "师徒" : "同棚",
              hearts: 8
            }
          }
        },
        tick: i
      });
      world.applyEffects(sOut.effects);

      const nOut = narrate({
        world,
        residentId,
        targetId: "res-partner",
        targetName: "阿木",
        tick: i
      });
      world.applyEffects(nOut.effects);

      for (const text of [sOut.text, nOut.text]) {
        assert.equal(/[0-9%％]/u.test(text), false, `生成文本不得包含数字或百分号: ${text}`);
        for (const word of forbidden) {
          assert.equal(
            text.includes(word),
            false,
            `生成文本不得包含跨时代或现代违禁词 "${word}": ${text}`
          );
        }
        assert.ok(text.length <= 100, `生成文本长度应不超过 100 字 (当前 ${text.length}): ${text}`);
        const sentenceCount = text
          .split(/(?<=[。！？])/u)
          .map((s) => s.trim())
          .filter(Boolean).length;
        assert.ok(
          sentenceCount >= 1 && sentenceCount <= 4,
          `生成文本句数应在合理范围 (当前 ${sentenceCount} 句): ${text}`
        );
      }
    }

    // 验证 expand 直接处理含违禁词与数字的自定义模板时也能被清洗干净
    const dirtyExpanded = expand(
      grammar,
      "在100%的街巷屋檐下上班喝咖啡，{name}拿起了铁块。",
      { name: "阿石", style: "tongkuai" },
      createSeededRng(1)
    );
    assert.equal(/[0-9%％]/u.test(dirtyExpanded), false);
    assert.equal(dirtyExpanded.includes("屋檐"), false);
    assert.equal(dirtyExpanded.includes("上班"), false);
    assert.equal(dirtyExpanded.includes("咖啡"), false);
  });

  it("5. 单文件行数严格小于 1200 行上限", () => {
    const files = [
      new URL("../../modules/narrative-voice/src/module.ts", import.meta.url),
      new URL("../../modules/narrative-voice/src/grammar.ts", import.meta.url),
      new URL("../../modules/narrative-voice/src/select.ts", import.meta.url),
      new URL("../../modules/narrative-voice/data/voice.neolithic.json", import.meta.url),
      new URL("./narrative-voice.test.ts", import.meta.url)
    ];

    for (const fileUrl of files) {
      const content = readFileSync(fileUrl, "utf8");
      const lineCount = content.split("\n").length;
      assert.ok(
        lineCount < 1200,
        `文件 ${fileUrl.pathname} 行数 (${lineCount}) 超过了 1200 行上限`
      );
    }
  });
});