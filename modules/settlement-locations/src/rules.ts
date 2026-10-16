import type { OpenLifeModule } from "@openlife/contracts";

/** The registration context a module's register() receives. */
export type Registration = Parameters<OpenLifeModule["register"]>[0];
