/**
 * Module Runtime - minimal semver range support.
 *
 * Only what a module manifest needs: exact versions and the common range
 * operators. Deliberately small, and part of the module runtime rather than the
 * kernel, because version policy is not a core simulation concept.
 */

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseVersion(value: string): ParsedVersion {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) throw new Error(`invalid semver: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] ? { prerelease: match[4] } : {}),
  };
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return 0;
}

/**
 * Supports: `*`, `1.2.3`, `=1.2.3`, `>=1.2.3`, `>1.2.3`, `<=1.2.3`, `<1.2.3`,
 * `^1.2.3`, `~1.2.3`, and space-separated conjunctions such as
 * `>=0.1.0 <1.0.0`.
 */
export function satisfies(version: string, range: string): boolean {
  const target = parseVersion(version);
  const clauses = range.trim().split(/\s+/).filter(Boolean);
  if (clauses.length === 0 || range.trim() === "*") return true;
  return clauses.every((clause) => satisfiesClause(target, clause));
}

function satisfiesClause(target: ParsedVersion, clause: string): boolean {
  if (clause === "*") return true;
  const caret = clause.startsWith("^");
  const tilde = clause.startsWith("~");
  const operatorMatch = /^(>=|<=|>|<|=)?(.*)$/.exec(caret || tilde ? clause.slice(1) : clause);
  if (!operatorMatch) return false;
  const operator = caret || tilde ? "=" : operatorMatch[1] ?? "=";
  const operand = parseVersion(operatorMatch[2] as string);

  if (caret) {
    if (compareVersions(target, operand) < 0) return false;
    if (operand.major > 0) return target.major === operand.major;
    if (operand.minor > 0) return target.major === 0 && target.minor === operand.minor;
    return target.major === 0 && target.minor === 0 && target.patch === operand.patch;
  }
  if (tilde) {
    if (compareVersions(target, operand) < 0) return false;
    return target.major === operand.major && target.minor === operand.minor;
  }
  const comparison = compareVersions(target, operand);
  switch (operator) {
    case ">=":
      return comparison >= 0;
    case ">":
      return comparison > 0;
    case "<=":
      return comparison <= 0;
    case "<":
      return comparison < 0;
    default:
      return comparison === 0;
  }
}
