/**
 * OpenLife Core Contract - Knowledge graph primitives (§23-§28).
 *
 * Core knows only generic epistemic/engineering shapes. Concrete concepts such
 * as electricity, atoms, mana or souls remain owned by world/content modules.
 */

export type KnowledgeNodeKind =
  | "phenomenon"
  | "observation"
  | "theory"
  | "evidence"
  | "knowledge"
  | "capability"
  | "process";

export interface KnowledgeDefinition {
  /** Namespaced id owned by the registering module. */
  id: string;
  owner: string;
  kind: KnowledgeNodeKind;
  description?: string;
  /**
   * Other registered knowledge nodes this definition semantically depends on.
   * The runtime stores the graph shape; modules decide discovery rules.
   */
  dependsOn?: string[];
  tags?: string[];
}
