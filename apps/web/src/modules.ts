/**
 * Every module the web game knows about, in install order. Which of them are
 * actually installed is decided by module-plan.ts from apps/web/openlife.modules.json
 * and OPENLIFE_DISABLE_MODULES (docs/PLUGINS.md §2).
 *
 * `core` marks what the web opening itself calls (founding the village, the
 * pottery slice, the story director, family lines). Everything else is a
 * plugin: switch it off and the game must still start, play and save
 * (tests/unit/web-module-plan.test.ts enforces that).
 */
import { fileURLToPath } from "node:url";
import { modernWorldModule } from "@openlife/module-modern-world";
import { familyModule } from "@openlife/module-family";
import { modernScienceModule } from "@openlife/module-modern-science";
import { earlyCivilizationModule } from "@openlife/module-early-civilization";
import { historicalMemoryModule } from "@openlife/module-historical-memory";
import { intellectualHistoryModule } from "@openlife/module-intellectual-history";
import { historicalEraModule } from "@openlife/module-historical-era";
import { historicalAnchorsModule } from "@openlife/module-historical-anchors";
import { practiceRuntimeModule } from "@openlife/module-practice-runtime";
import { craftPotteryModule } from "@openlife/module-craft-pottery";
import { settlementLifeModule } from "@openlife/module-settlement-life";
import { worldClockModule } from "@openlife/module-world-clock";
import { worldSpaceModule } from "@openlife/module-world-space";
import { worldObjectsModule } from "@openlife/module-world-objects";
import { settlementLocationsModule } from "@openlife/module-settlement-locations";
import { villageStoriesModule } from "@openlife/module-village-stories";
import { settlementNatureModule } from "@openlife/module-settlement-nature";
import { worldHazardModule } from "@openlife/module-world-hazard";
import { faunaBondsModule } from "@openlife/module-fauna-bonds";
import { socialConflictModule } from "@openlife/module-social-conflict";
import { settlementBuildModule } from "@openlife/module-settlement-build";
import { officeModule } from "@openlife/module-office";
import { narrativeVoiceModule } from "@openlife/module-narrative-voice";
import { civilizationModule } from "@openlife/module-civilization";
import { worldDepositsModule } from "@openlife/module-world-deposits";
import { cultureModule } from "@openlife/module-culture";
import { economyModule } from "@openlife/module-economy";
import { travelModule } from "@openlife/module-travel";
// 秘密需要认知层（cognition.epistemic-state）：epistemic-state 因此在 web 里也装上了。
// 它不是 core：关掉它，village-secrets 会按 docs/PLUGINS.md §2 的规则跟着关掉。
import { epistemicStateModule } from "@openlife/module-epistemic-state";
import { villageSecretsModule } from "@openlife/module-village-secrets";
import { villageWantsModule } from "@openlife/module-village-wants";
import { lifeStagesModule } from "@openlife/module-life-stages";
import { storyDirectorModule } from "@openlife/module-story-director";
import { settlementGoalsModule } from "@openlife/module-settlement-goals";
// 历史实验室：科技、遗传、时代三段。apps/web/src/history-bridge.ts 每天/每季都在叫
// 它们（startHistory / historyDay / historySeason），但很长一段时间这份清单里没有
// 它们 —— bridge 里 `installedOf(sim)` 直接 early return，网页世界永远没有
// `tech:village` / `era:ladder`，`historyEra()` 恒为 null，一个发明也攒不出来。
// 桥接的单元测试自己把模块传进 Simulation，所以一直是绿的：测的是函数，不是这份清单。
import { techModule } from "@openlife/module-tech";
import { heredityModule } from "@openlife/module-heredity";
import { polityModule } from "@openlife/module-polity";
import { eraLadderModule } from "@openlife/module-era-ladder";
import { resolveModules, type ModuleEntry } from "./module-plan.ts";

export const WEB_MODULE_ENTRIES: ModuleEntry[] = [
  { module: modernWorldModule, core: true },
  { module: worldClockModule, core: true },
  { module: worldSpaceModule, core: true },
  { module: worldObjectsModule, core: true },
  { module: settlementLocationsModule, core: true },
  { module: villageStoriesModule, core: true },
  { module: settlementNatureModule },
  { module: worldHazardModule },
  { module: faunaBondsModule },
  { module: socialConflictModule },
  { module: settlementBuildModule },
  { module: officeModule },
  { module: narrativeVoiceModule },
  { module: civilizationModule },
  { module: worldDepositsModule },
  { module: cultureModule },
  { module: economyModule },
  { module: travelModule },
  // 认知层与心事：秘密要靠它记「谁知道了什么」。不是 core。
  { module: epistemicStateModule },
  { module: villageSecretsModule },
  { module: villageWantsModule },
  { module: lifeStagesModule },
  // 叙事者与成长目标：都只读世界、只写自己的状态，关掉就回到原来的固定概率抽取
  // 与"没有阶梯"的旧样子（docs/plans/EXPANSION_PLAN_2026-10.md §5）。
  { module: storyDirectorModule },
  { module: settlementGoalsModule },
  // 历史实验室：加进来才让 bridge 真的跑起来。heredity 先于 tech（tech 的
  // `optional: ["life.heredity"]` 拿天赋当发明的乘数），polity 先于 era-ladder
  // （时代条件里要读 surplusYears 与制度清单）。都不是 core：关掉就把历史实验室
  // 关回「只是背景资料」，村子照常过日子。
  { module: heredityModule },
  { module: techModule },
  { module: polityModule },
  { module: eraLadderModule },
  { module: familyModule, core: true },
  { module: modernScienceModule },
  { module: earlyCivilizationModule },
  { module: historicalMemoryModule },
  { module: intellectualHistoryModule },
  { module: historicalEraModule },
  { module: historicalAnchorsModule },
  { module: practiceRuntimeModule, core: true },
  { module: craftPotteryModule, core: true },
  { module: settlementLifeModule, core: true },
];

export const MODULES_CONFIG_PATH = fileURLToPath(new URL("../openlife.modules.json", import.meta.url));

/** The modules this process installs; throws on a bad configuration. */
export function webModules(env: Record<string, string | undefined> = process.env) {
  return resolveModules(WEB_MODULE_ENTRIES, MODULES_CONFIG_PATH, env);
}
