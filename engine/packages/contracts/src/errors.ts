/**
 * OpenLife Core Contract - Error codes.
 *
 * Error codes are part of the stable contract: UI, AI adapters and modules
 * switch on codes, never on message text.
 */

export const ErrorCode = {
  ValidationFailed: "E_VALIDATION_FAILED",
  ConstraintRejected: "E_CONSTRAINT_REJECTED",
  UnknownCommand: "E_UNKNOWN_COMMAND",
  UnknownComponent: "E_UNKNOWN_COMPONENT",
  UnknownRelation: "E_UNKNOWN_RELATION",
  UnknownEntity: "E_UNKNOWN_ENTITY",
  UnknownProjection: "E_UNKNOWN_PROJECTION",
  UnknownRule: "E_UNKNOWN_RULE",
  DuplicateRegistration: "E_DUPLICATE_REGISTRATION",
  NamespaceViolation: "E_NAMESPACE_VIOLATION",
  CapabilityMissing: "E_CAPABILITY_MISSING",
  ModuleConflict: "E_MODULE_CONFLICT",
  ModuleNotFound: "E_MODULE_NOT_FOUND",
  ModuleOrphaned: "E_MODULE_ORPHANED",
  PermissionDenied: "E_PERMISSION_DENIED",
  EventStorm: "E_EVENT_STORM",
  CycleDetected: "E_CYCLE_DETECTED",
  TransactionAborted: "E_TRANSACTION_ABORTED",
  SaveIncompatible: "E_SAVE_INCOMPATIBLE",
  MigrationFailed: "E_MIGRATION_FAILED",
  DeterminismViolation: "E_DETERMINISM_VIOLATION",
  Internal: "E_INTERNAL",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface OpenLifeError {
  code: ErrorCodeValue;
  message: string;
  /** Machine readable extras, e.g. `{ commandType, constraintId }`. */
  details?: Record<string, unknown>;
}

export class OpenLifeErrorException extends Error {
  readonly code: ErrorCodeValue;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCodeValue, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "OpenLifeError";
    this.code = code;
    this.details = details;
  }

  toError(): OpenLifeError {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function fail(
  code: ErrorCodeValue,
  message: string,
  details: Record<string, unknown> = {},
): never {
  throw new OpenLifeErrorException(code, message, details);
}

export function isOpenLifeError(value: unknown): value is OpenLifeErrorException {
  return value instanceof OpenLifeErrorException;
}
