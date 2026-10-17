/**
 * OpenLife 模块入口：narrative-voice
 * 注册防重复记忆组件，并通过 provideCapability 提供 narrative-voice.say 与 narrative-voice.narrate
 */

import { readFileSync } from "node:fs";
import { expand } from "./grammar.ts";
import { selectAndExpandVoice } from "./select.ts";
import type {
  DeterministicRngLike,
  GrammarData,
  NarrativeFacts,
  RngInput
} from "./grammar.ts";
import type {
  SelectVoiceInput,
  SelectVoiceResult,
  WorldViewLike
} from "./select.ts";

export const VOICE_MODULE_ID = "narrative-voice";
export const VOICE_MEMORY_COMPONENT_ID = "narrative-voice.memory";
export const VOICE_DEFAULT_ENTITY_ID = "narrative-voice.state";

export interface VoiceMemoryState {
  recentLines: string[];
}

export interface OpenLifeEffect {
  type: string;
  entityId: string;
  componentId: string;
  value: VoiceMemoryState;
}

export interface VoiceCapabilityRequest extends SelectVoiceInput {
  rng?: RngInput;
  memoryEntityId?: string;
}

export interface VoiceCapabilityResponse extends SelectVoiceResult {
  effects: OpenLifeEffect[];
}

export interface ModuleRegisterContext {
  rng?: DeterministicRngLike;
  registerComponent: (
    idOrDef:
      | string
      | {
          id: string;
          description?: string;
          defaultValue?: () => VoiceMemoryState;
        },
    maybeDef?: unknown
  ) => void;
  provideCapability: (name: string, handler: (...args: unknown[]) => unknown) => void;
  registerCommand?: (name: string, handler: (...args: unknown[]) => unknown) => void;
  registerReactionRule?: (rule: unknown) => void;
  registerResolutionRule?: (rule: unknown) => void;
  registerAgent?: (agent: unknown) => void;
  registerProjection?: (projection: unknown) => void;
}

export interface OpenLifeModule {
  manifest: {
    id: string;
    version: string;
    engineRange: string;
    type: string;
    name: string;
    description: string;
    provides: string[];
  };
  register: (ctx: ModuleRegisterContext) => void;
  activate?: (ctx: unknown) => void;
}

let cachedNeolithicGrammar: GrammarData | null = null;

export function loadNeolithicGrammar(): GrammarData {
  if (!cachedNeolithicGrammar) {
    const jsonUrl = new URL("../data/voice.neolithic.json", import.meta.url);
    const raw = readFileSync(jsonUrl, "utf8");
    cachedNeolithicGrammar = JSON.parse(raw) as GrammarData;
  }
  return cachedNeolithicGrammar;
}

function resolveMemoryFromWorld(
  world: WorldViewLike | undefined,
  memoryEntityId: string,
  fallbackRecent?: readonly string[]
): readonly string[] {
  if (fallbackRecent) {
    return fallbackRecent;
  }
  const comp = world?.getComponent?.<VoiceMemoryState>(
    memoryEntityId,
    VOICE_MEMORY_COMPONENT_ID
  );
  if (comp && Array.isArray(comp.recentLines)) {
    return comp.recentLines;
  }
  return [];
}

function invokeVoiceCapability(
  kind: "say" | "narrate",
  regCtx: ModuleRegisterContext,
  arg1: unknown,
  arg2?: unknown
): VoiceCapabilityResponse {
  const grammar = loadNeolithicGrammar();

  // 兼容 (request) 或 (world, request) 两种调用签名
  let request: VoiceCapabilityRequest;
  if (
    arg1 &&
    typeof arg1 === "object" &&
    ("getComponent" in arg1 || "getEntity" in arg1) &&
    arg2 &&
    typeof arg2 === "object"
  ) {
    request = {
      ...(arg2 as VoiceCapabilityRequest),
      world: arg1 as WorldViewLike
    };
  } else {
    request = (arg1 as VoiceCapabilityRequest) ?? {};
  }

  const rng = request.rng ?? regCtx.rng;
  if (!rng) {
    throw new Error(
      `INV-007 violation: ${VOICE_MODULE_ID}.${kind} requires a deterministic rng.`
    );
  }

  const memoryEntityId =
    request.memoryEntityId ?? request.residentId ?? request.resident?.key ?? VOICE_DEFAULT_ENTITY_ID;
  const currentRecent = resolveMemoryFromWorld(
    request.world,
    memoryEntityId,
    request.recentLines
  );

  const result = selectAndExpandVoice(
    kind,
    {
      ...request,
      recentLines: currentRecent
    },
    grammar,
    rng
  );

  const effect: OpenLifeEffect = {
    type: "setComponent",
    entityId: memoryEntityId,
    componentId: VOICE_MEMORY_COMPONENT_ID,
    value: {
      recentLines: result.nextRecentLines
    }
  };

  return {
    ...result,
    effects: [effect]
  };
}

export const narrativeVoiceModule: OpenLifeModule = {
  manifest: {
    id: VOICE_MODULE_ID,
    version: "0.1.0",
    engineRange: "^0.1.0",
    type: "content",
    name: "河岸台地叙事与言语模块",
    description:
      "基于确定性 Tracery 文法展开与多条件加权选句的新石器时代村民台词与故事旁白生成模块",
    provides: ["narrative-voice.say", "narrative-voice.narrate"]
  },

  register(ctx: ModuleRegisterContext): void {
    // 1. 注册插件自有防重复记忆组件（随存档持久化）
    ctx.registerComponent({
      id: VOICE_MEMORY_COMPONENT_ID,
      description: "记录村民或叙事器最近使用过的 25 条句子，确保跨存档防重复与确定性重放",
      defaultValue: (): VoiceMemoryState => ({ recentLines: [] })
    });

    // 2. 提供村民说话能力 narrative-voice.say
    ctx.provideCapability("narrative-voice.say", (arg1: unknown, arg2?: unknown) =>
      invokeVoiceCapability("say", ctx, arg1, arg2)
    );

    // 3. 提供故事与场景旁白能力 narrative-voice.narrate
    ctx.provideCapability("narrative-voice.narrate", (arg1: unknown, arg2?: unknown) =>
      invokeVoiceCapability("narrate", ctx, arg1, arg2)
    );
  }
};

export { expand, selectAndExpandVoice };
export type {
  DeterministicRngLike,
  GrammarData,
  NarrativeFacts,
  SelectVoiceInput,
  SelectVoiceResult,
  WorldViewLike
};
export default narrativeVoiceModule;