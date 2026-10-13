export * from "./module.ts";
export * from "./autonomy/village-day.ts";
export { FIRST_AUTONOMOUS_RESIDENT, runFirstNpcDay, type NpcDailyResult } from "./autonomy/npc.ts";
export { SECOND_AUTONOMOUS_RESIDENT, runSecondNpcDay } from "./autonomy/npc-cook.ts";
export { runThirdNpcDay } from "./autonomy/npc-reed.ts";
export { runOtherNpcDays } from "./autonomy/npc-general.ts";
export { chooseNpcIntent, shortagePressure, type NpcIntent } from "./autonomy/npc-goals.ts";
