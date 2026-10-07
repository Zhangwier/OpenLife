/**
 * OpenLife Core Contract - generic Resource / Process definitions (§29).
 *
 * These definitions describe domain-neutral resource and transformation
 * vocabulary. Concrete resources (electricity, mana, fuel, food...) remain
 * module-owned and are never interpreted by Core.
 */

export interface ResourceDefinition {
  id: string;
  owner: string;
  description?: string;
  /** Optional presentation/unit hint; Core never interprets it. */
  unit?: string;
  tags?: string[];
}

export interface ProcessDefinition {
  id: string;
  owner: string;
  description?: string;
  /** Resource-id -> nominal amount. Rules own the actual simulation math. */
  consumes?: Record<string, number>;
  produces?: Record<string, number>;
  /** Other process/knowledge/capability ids required by the domain module. */
  dependsOn?: string[];
  tags?: string[];
}
