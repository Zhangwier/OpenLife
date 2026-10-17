# Workspace 目录

<!-- 由 scripts/gen-module-catalog.ts 生成，请勿手改；修改后运行 `npm run catalog`。 -->

分层规则（由 `tests/unit/workspace-structure.test.ts` 强制）：`packages/` 是不含世界观的引擎核心，
`modules/` 只能依赖 `packages/` 与其他模块，`apps/` 位于最上层；依赖图必须无环，
源码中 import 的每个 `@openlife/*` 包都必须在自己的 package.json 中声明。

## packages/ · 引擎核心

| 目录 | 包名 | 依赖（workspace） |
| --- | --- | --- |
| `packages/autonomy-runtime` | `@openlife/autonomy-runtime` | contracts, kernel |
| `packages/contracts` | `@openlife/contracts` | — |
| `packages/history-runtime` | `@openlife/history-runtime` | contracts, kernel, world-model |
| `packages/kernel` | `@openlife/kernel` | contracts, rule-engine, world-model |
| `packages/life-contracts` | `@openlife/life-contracts` | — |
| `packages/module-runtime` | `@openlife/module-runtime` | contracts, kernel, rule-engine, world-model |
| `packages/query` | `@openlife/query` | contracts, history-runtime, rule-engine, world-model |
| `packages/rule-engine` | `@openlife/rule-engine` | contracts |
| `packages/save-system` | `@openlife/save-system` | contracts, history-runtime, kernel, world-model |
| `packages/simulation` | `@openlife/simulation` | autonomy-runtime, contracts, history-runtime, kernel, module-runtime, query, rule-engine, save-system, world-model |
| `packages/world-model` | `@openlife/world-model` | contracts |

## modules/ · 57 个模块包

### system（3）

| 目录 | 名称 | 模块 id（导出） | provides | requires | 依赖（workspace） |
| --- | --- | --- | --- | --- | --- |
| `modules/civilization` | 文明层 | `civilization` (`civilizationModule`) | `world.polities` | — | contracts, life-contracts, module-polity, module-tech | 可关 |
| `modules/office` | 职位与公事 | `office` (`officeModule`) | `polity.office` | `life.settlement` | contracts, life-contracts, module-polity, module-settlement-locations, module-world-objects | 可关 |
| `modules/settlement-build` | 盖房子 | `settlement-build` (`settlementBuildModule`) | `settlement.housing` | `life.settlement` | contracts, life-contracts, module-settlement-locations, module-world-space | 可关 |

### content（2）

| 目录 | 名称 | 模块 id（导出） | provides | requires | 依赖（workspace） |
| --- | --- | --- | --- | --- | --- |
| `modules/narrative-voice` | 河岸台地叙事与言语 | `narrative-voice` (`default`) | `narrative-voice.say`, `narrative-voice.narrate` | — | contracts, life-contracts | 可关 |
| `modules/narrative-voice` | 河岸台地叙事与言语 | `narrative-voice` (`narrativeVoiceModule`) | `narrative-voice.say`, `narrative-voice.narrate` | — | contracts, life-contracts | 可关 |

### World Pack · 世界观（4）

| 目录 | 名称 | 模块 id（导出） | provides | requires | 依赖（workspace） |
| --- | --- | --- | --- | --- | --- |
| `modules/magic-test-world` | 魔法测试世界 | `magic-test-world` (`magicTestWorldModule`) | `magic.mana_network`, `time.cycle`, `life.population` | — | contracts | 可关 |
| `modules/modern-world` | 人物与人生基础 | `modern-world` (`modernWorldModule`) | `life.population`, `time.calendar`, `economy.currency` | — | contracts, life-contracts | core |
| `modules/robot-test-world` | 机器人测试世界 | `robot-test-world` (`robotTestWorldModule`) | `robot.population`, `robot.energy_network`, `time.machine_cycle` | — | contracts | 可关 |
| `modules/world-clock` | 世界时钟 | `world-clock` (`worldClockModule`) | `time.life-scale`, `time.scale` | `time.calendar` | contracts, life-contracts, module-practice-runtime | core |

### System Pack · 通用系统（43）

| 目录 | 名称 | 模块 id（导出） | provides | requires | 依赖（workspace） |
| --- | --- | --- | --- | --- | --- |
| `modules/basic-autonomy` | 人物自主行为 | `basic-autonomy` (`basicAutonomyModule`) | `autonomy.basic` | `time.calendar`, `life.population`, `education.provider`, `career.provider`, `family.relationship_provider`, `family.heir_provider` | contracts, life-contracts | 可关 |
| `modules/career` | 职业原型 | `career` (`careerModule`) | `career.provider` | `time.calendar` | contracts, life-contracts | 可关 |
| `modules/economy` | 经济 | `economy` (`economyModule`) | `economy.cycle` | `time.calendar`, `life.population`, `economy.currency` | contracts, life-contracts | 可关 |
| `modules/education` | 教育原型 | `education` (`educationModule`) | `education.provider` | `time.calendar` | contracts, life-contracts | 可关 |
| `modules/epistemic-state` | 人物认知 | `epistemic-state` (`epistemicStateModule`) | `cognition.epistemic-state` | — | contracts | 可关 |
| `modules/era-ladder` | 时代识别 | `era-ladder` (`eraLadderModule`) | `era.current` | — | contracts | 可关 |
| `modules/family` | 家庭与关系 | `family` (`familyModule`) | `family.relationship_provider`, `family.heir_provider` | `time.calendar`, `life.population` | contracts, life-contracts | core |
| `modules/fate` | 天命 | `fate` (`fateModule`) | `fate.perturbation` | — | contracts | 可关 |
| `modules/fauna-bonds` | 与动物相处 | `fauna-bonds` (`faunaBondsModule`) | `fauna.individuals` | `world.species` | contracts, module-world-species | 可关 |
| `modules/heredity` | 禀赋 | `heredity` (`heredityModule`) | `life.heredity` | — | contracts | 可关 |
| `modules/historical-era` | 时代环境 | `historical-era` (`historicalEraModule`) | `history.era-context` | `time.calendar` | contracts, life-contracts | 可关 |
| `modules/historical-memory` | 历史留存 | `historical-memory` (`historicalMemoryModule`) | `history.material-evidence`, `history.public-memory` | — | contracts | 可关 |
| `modules/intellectual-history` | 思想与学派 | `intellectual-history` (`intellectualHistoryModule`) | `culture.intellectual-tradition` | — | contracts | 可关 |
| `modules/knowledge-transmission` | 知识传授 | `knowledge-transmission` (`knowledgeTransmissionModule`) | `knowledge.transmission-practice` | `practice.runtime`, `cognition.epistemic-state` | contracts, module-epistemic-state, module-practice-runtime | 可关 |
| `modules/life-stages` | 人生阶段 | `life-stages` (`lifeStagesModule`) | `life.stages` | `life.settlement` | contracts, life-contracts, module-settlement-locations, module-world-space | 可关 |
| `modules/map-pack` | 地图包 | `map-pack` (`mapPackModule`) | `world.map-packs` | `world.geography` | contracts, module-world-geography, simulation | 可关 |
| `modules/modern-science` | 文明认知 | `modern-science` (`modernScienceModule`) | `knowledge.modern-science` | `life.population` | contracts, life-contracts | 可关 |
| `modules/polity` | 政治 | `polity` (`polityModule`) | `polity.institutions`, `polity.authority` | — | contracts | 可关 |
| `modules/polity-bondage` | 债役 | `polity-bondage` (`polityBondageModule`) | `polity.labor` | `polity.institutions` | contracts | 可关 |
| `modules/practice-autonomy` | 自主参与活动 | `practice-autonomy` (`practiceAutonomyModule`) | `practice.autonomy` | `practice.runtime` | contracts, module-practice-runtime | 可关 |
| `modules/practice-runtime` | 持续活动 | `practice-runtime` (`practiceRuntimeModule`) | `practice.runtime` | — | contracts | core |
| `modules/science-research` | 研究活动 | `science-research` (`scienceResearchModule`) | `science.research-practice` | `practice.runtime` | contracts, module-practice-runtime | 可关 |
| `modules/settlement-goals` | 村落成长目标 | `settlement-goals` (`settlementGoalsModule`) | `settlement.goals` | — | contracts, life-contracts, module-settlement-locations | 可关 |
| `modules/social-conflict` | 乡邻纠纷 | `social-conflict` (`socialConflictModule`) | `social.conflict` | — | contracts | 可关 |
| `modules/story-director` | 叙事者 | `story-director` (`storyDirectorModule`) | `story.director` | — | contracts | 可关 |
| `modules/tech` | 科技 | `tech` (`techModule`) | `tech.invention`, `tech.learning`, `tech.need-ledger` | — | contracts | 可关 |
| `modules/village-chronicle` | 村史 | `village-chronicle` (`villageChronicleModule`) | `chronicle.village` | — | contracts, module-era-ladder, module-fate, module-heredity, module-polity, module-polity-bondage, module-tech, simulation | 可关 |
| `modules/village-secrets` | 村里的事 | `village-secrets` (`villageSecretsModule`) | `settlement.secrets` | `cognition.epistemic-state` | contracts, module-settlement-locations, module-world-space | 可关 |
| `modules/village-wants` | 愿望与恐惧 | `village-wants` (`villageWantsModule`) | `life.wants` | `life.settlement` | contracts, module-settlement-locations, module-world-space | 可关 |
| `modules/world-climate` | 气候 | `world-climate` (`worldClimateModule`) | `world.climate-profile` | `world.geography`, `world.geosphere-profile` | contracts, module-world-geography, module-world-geosphere | 可关 |
| `modules/world-ecology` | 生态 | `world-ecology` (`worldEcologyModule`) | `world.ecology-state` | `world.geography`, `world.climate-profile`, `world.hydrology-state` | contracts, module-world-climate, module-world-geography, module-world-hydrology | 可关 |
| `modules/world-geography` | 地理与连通 | `boundary-handshake` (`boundaryHandshakeModule`) | `world.boundary-handshake` | `world.geography` | contracts | 可关 |
| `modules/world-geography` | 地理与连通 | `world-geography` (`worldGeographyModule`) | `world.geography` | — | contracts | 可关 |
| `modules/world-geosphere` | 地形与地质 | `world-geosphere` (`worldGeosphereModule`) | `world.geosphere-profile` | `world.geography` | contracts, module-world-geography | 可关 |
| `modules/world-grazing` | 放牧环境 | `world-grazing` (`worldGrazingModule`) | `world.grazing-pressure` | `world.geography`, `world.vegetation`, `world.species` | contracts, module-world-geography, module-world-species, module-world-vegetation | 可关 |
| `modules/world-hazard` | 水旱与治水 | `world-hazard` (`worldHazardModule`) | `world.hazard-state` | `world.hydrology-state` | contracts, module-world-hydrology | 可关 |
| `modules/world-hydrology` | 水文 | `world-hydrology` (`worldHydrologyModule`) | `world.hydrology-state` | `world.geography`, `world.geosphere-profile`, `world.weather-current` | contracts, module-world-geography, module-world-geosphere, module-world-weather | 可关 |
| `modules/world-objects` | 物品与容器 | `world-objects` (`worldObjectsModule`) | `world.objects` | `world.space` | contracts, module-world-space | core |
| `modules/world-space` | 建筑与空间 | `world-space` (`worldSpaceModule`) | `world.space` | `time.calendar` | contracts, module-practice-runtime | core |
| `modules/world-species` | 物种 | `world-species` (`worldSpeciesModule`) | `world.species` | `world.geography`, `world.climate-profile`, `world.hydrology-state`, `world.ecology-state`, `world.vegetation` | contracts, module-world-climate, module-world-ecology, module-world-geography, module-world-hydrology, module-world-vegetation | 可关 |
| `modules/world-time` | 世界时间 | `world-time` (`worldTimeModule`) | `world.time-resolution` | `world.geography`, `world.weather-current`, `world.hydrology-state`, `world.ecology-state`, `world.vegetation`, `world.species`, `world.grazing-pressure` | contracts, module-world-ecology, module-world-geography, module-world-hydrology, module-world-species, module-world-vegetation | 可关 |
| `modules/world-vegetation` | 植被 | `world-vegetation` (`worldVegetationModule`) | `world.vegetation` | `world.geography`, `world.climate-profile`, `world.hydrology-state`, `world.ecology-state` | contracts, module-world-climate, module-world-ecology, module-world-geography, module-world-hydrology | 可关 |
| `modules/world-weather` | 天气 | `world-weather` (`worldWeatherModule`) | `world.weather-current` | `world.geography`, `world.climate-profile` | contracts, module-world-climate, module-world-geography | 可关 |

### Content Pack · 具体内容（7）

| 目录 | 名称 | 模块 id（导出） | provides | requires | 依赖（workspace） |
| --- | --- | --- | --- | --- | --- |
| `modules/craft-pottery` | 制陶手艺 | `craft-pottery` (`craftPotteryModule`) | `craft.pottery-practice` | `practice.runtime` | contracts, module-practice-runtime, module-world-objects, module-world-space | core |
| `modules/early-civilization` | 早期聚落生活 | `early-civilization` (`earlyCivilizationModule`) | `era.early-civilization`, `learning.oral-tradition`, `work.settlement-role` | `time.calendar`, `life.population` | contracts, life-contracts | 可关 |
| `modules/historical-anchors` | 历史人物 | `historical-anchors` (`historicalAnchorsModule`) | `history.person-anchors` | `time.calendar`, `life.population` | contracts, life-contracts | 可关 |
| `modules/settlement-life` | 聚落生活活动 | `settlement-life` (`settlementLifeModule`) | `life.settlement-playable` | `life.population`, `family.relationship_provider`, `practice.runtime`, `craft.pottery-practice` | contracts, life-contracts, module-craft-pottery, module-practice-runtime | core |
| `modules/settlement-locations` | 河岸聚落 | `settlement-locations` (`settlementLocationsModule`) | `life.settlement` | `world.space`, `world.objects`, `time.life-scale` | contracts, life-contracts, module-world-objects, module-world-space | core |
| `modules/settlement-nature` | 河岸天时 | `settlement-nature` (`settlementNatureModule`) | `world.hydrology-state`, `world.species` | `life.settlement` | contracts, module-settlement-locations, module-world-hazard, module-world-hydrology, module-world-species | 可关 |
| `modules/village-stories` | 村中故事 | `village-stories` (`villageStoriesModule`) | `settlement.stories` | `life.settlement` | contracts, life-contracts, module-settlement-locations, module-world-objects, module-world-space | core |

## apps/ · 应用

| 目录 | 包名 | 依赖（workspace） |
| --- | --- | --- |
| `apps/debug-console` | `@openlife/debug-console` | contracts, module-career, module-education, module-family, module-magic-test-world, module-map-pack, module-modern-world, module-runtime, module-world-geography, rule-engine, simulation |
| `apps/web` | `@openlife/web` | autonomy-runtime, contracts, life-contracts, module-civilization, module-craft-pottery, module-early-civilization, module-epistemic-state, module-era-ladder, module-family, module-fate, module-fauna-bonds, module-heredity, module-historical-anchors, module-historical-era, module-historical-memory, module-intellectual-history, module-life-stages, module-map-pack, module-modern-science, module-modern-world, module-narrative-voice, module-office, module-polity, module-polity-bondage, module-practice-runtime, module-settlement-build, module-settlement-goals, module-settlement-life, module-settlement-locations, module-settlement-nature, module-social-conflict, module-story-director, module-tech, module-village-chronicle, module-village-secrets, module-village-stories, module-village-wants, module-world-clock, module-world-hazard, module-world-objects, module-world-space, simulation, world-model |
