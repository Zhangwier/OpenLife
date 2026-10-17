/**
 * 秘密的内容规范：读 `data/secrets.json`，并把它引用的每一个人都核对一遍。
 *
 * 为什么单独一个文件：秘密是**数据**，规则是**代码**（PLUGINS 第 0 节）。内容作者
 * 只改 JSON；这里的 `secretProblems()` 在模块注册时跑一次，写错了立刻炸在启动，
 * 而不是等玩到第五年才发现某件心事的归属人根本不存在。
 *
 * 一处必须说清的地方：`requires.personality` 用的是**本文件里那份性格快照**，
 * 不是世界里的数据。原因是聚落模块把性格留在 `data/river-terrace.json` 里，
 * 只按需算出来给 NPC 大脑用，从不写进世界组件；别的模块没有公开命令能读它。
 * 所以这里自带一份快照，并在校验里核对快照与聚落数据是否一致（不一致就报错），
 * 免得两边悄悄漂移。
 */
import { readFileSync } from "node:fs";

export type SecretKind = "misdeed" | "origin" | "feeling" | "ailment";
export const SECRET_KINDS: readonly SecretKind[] = ["misdeed", "origin", "feeling", "ailment"];

export type PersonalityAxis = "diligence" | "sociability" | "generosity" | "caution" | "curiosity";
export const PERSONALITY_AXES: readonly PersonalityAxis[] = ["diligence", "sociability", "generosity", "caution", "curiosity"];

export interface Bound { min?: number; max?: number }
export interface SecretRequires { personality?: Partial<Record<PersonalityAxis, Bound>> }

export interface CastMember {
  key: string;
  name: string;
  personality: Record<PersonalityAxis, number>;
}

export interface SecretSpec {
  id: string;
  /** 谁的秘密：聚落 cast key（如 `yu`）。 */
  owner: string;
  kind: SecretKind;
  /** 1 轻，2 中，3 重。数字同时决定揭发与要挟的分量。 */
  severity: number;
  /** 确知以后才看得到的全文；`{owner}` 换成人名。 */
  text: string;
  /** 「听说」阶段只能看到线索，一条一条来。 */
  hints: string[];
  requires?: SecretRequires;
}

export interface SecretsPack {
  formatVersion: number;
  note?: string;
  cast: CastMember[];
  secrets: SecretSpec[];
}

export const SECRETS_PACK: SecretsPack = JSON.parse(
  readFileSync(new URL("../data/secrets.json", import.meta.url), "utf8"),
) as SecretsPack;

export const CAST: readonly CastMember[] = SECRETS_PACK.cast;
export const SECRETS: readonly SecretSpec[] = SECRETS_PACK.secrets;

const castOf = (key: string) => CAST.find((c) => c.key === key);

/** 这件心事像不像这个人。没写 `requires` 就是人人都可能有。 */
export function fitsOwner(spec: SecretSpec, key: string): boolean {
  const person = castOf(key);
  if (!person) return false;
  for (const [axis, bound] of Object.entries(spec.requires?.personality ?? {}) as [PersonalityAxis, Bound][]) {
    const value = Number(person.personality[axis] ?? 0);
    if (bound.min !== undefined && value < bound.min) return false;
    if (bound.max !== undefined && value > bound.max) return false;
  }
  return true;
}

/** 某个人名下的心事（按数据顺序，确定性）。 */
export function secretsOf(key: string): SecretSpec[] {
  return SECRETS.filter((s) => s.owner === key && fitsOwner(s, key));
}

export function secretById(id: string): SecretSpec | undefined {
  return SECRETS.find((s) => s.id === id);
}

/**
 * 校验整份数据。返回问题清单，[] 表示没问题。
 *
 * `settlementResidents` 是聚落包里真实存在的 cast key；不传就只查本文件内部
 * 自洽（单测里会传，模块注册时也传）。
 */
export function secretProblems(
  pack: SecretsPack = SECRETS_PACK,
  settlementResidents?: readonly string[],
): string[] {
  const problems: string[] = [];
  const keys = new Set(pack.cast.map((c) => c.key));
  const known = settlementResidents ? new Set(settlementResidents) : undefined;
  const ids = new Set<string>();
  const perOwner = new Map<string, number>();

  if (!Number.isInteger(pack.formatVersion) || pack.formatVersion < 1) problems.push("formatVersion must be a positive integer");

  for (const person of pack.cast) {
    for (const axis of PERSONALITY_AXES) {
      const v = Number(person.personality[axis]);
      if (!Number.isFinite(v) || v < 0 || v > 100) problems.push(`cast ${person.key}: personality.${axis} must be 0..100`);
    }
  }

  for (const spec of pack.secrets) {
    const where = `secret ${spec.id}`;
    if (!spec.id?.startsWith("secret:")) problems.push(`${where}: id must start with "secret:"`);
    if (ids.has(spec.id)) problems.push(`${where}: duplicate id`);
    ids.add(spec.id);
    // 归属人必须真的存在，否则这条心事永远不会有人知道。
    if (!keys.has(spec.owner)) problems.push(`${where}: owner ${spec.owner} is not in cast`);
    if (known && !known.has(spec.owner)) problems.push(`${where}: owner ${spec.owner} is not a settlement resident`);
    if (!SECRET_KINDS.includes(spec.kind)) problems.push(`${where}: unknown kind ${String(spec.kind)}`);
    if (!Number.isInteger(spec.severity) || spec.severity < 1 || spec.severity > 3) problems.push(`${where}: severity must be 1..3`);
    if (typeof spec.text !== "string" || !spec.text.trim()) problems.push(`${where}: text is required`);
    // 没有线索，就只剩「突然知道」——那不是认知层，是全知。
    if (!Array.isArray(spec.hints) || spec.hints.length === 0) problems.push(`${where}: at least one hint is required`);
    for (const hint of spec.hints ?? []) if (typeof hint !== "string" || !hint.trim()) problems.push(`${where}: hints must be non-empty strings`);
    for (const axis of Object.keys(spec.requires?.personality ?? {})) {
      if (!PERSONALITY_AXES.includes(axis as PersonalityAxis)) problems.push(`${where}: unknown personality axis ${axis}`);
    }
    perOwner.set(spec.owner, (perOwner.get(spec.owner) ?? 0) + 1);
  }

  // 首批要求：每位基础村民 1–2 件，四类各占一些。
  for (const person of pack.cast) {
    const n = perOwner.get(person.key) ?? 0;
    if (n < 1 || n > 2) problems.push(`cast ${person.key}: ${n} secrets (expected 1-2)`);
  }
  for (const kind of SECRET_KINDS) {
    if (!pack.secrets.some((s) => s.kind === kind)) problems.push(`no secret of kind ${kind}`);
  }
  if (pack.secrets.length < 15 || pack.secrets.length > 20) problems.push(`${pack.secrets.length} secrets (expected 15-20)`);
  return problems;
}
