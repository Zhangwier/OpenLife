/**
 * Minimal, strict YAML subset reader for Map Packs.
 *
 * Scope is deliberately small: block mappings, block sequences, plain and
 * quoted scalars, `- key: value` sequence entries, comments and blank lines.
 * Anchors, aliases, tags, flow collections, multi-document streams and folded
 * scalars are rejected with a located error instead of being half-supported.
 *
 * The point is *predictable* parsing: a pack author must never wonder whether
 * `0.1.0` became a string, a date or a float. Only three scalars are typed:
 * `true`, `false` and anything matching a JSON number literal. Everything else
 * stays a string.
 */

export interface YamlLocation {
  file: string;
  line: number;
  column: number;
}

export class YamlError extends Error {
  readonly location: YamlLocation;

  constructor(message: string, location: YamlLocation) {
    super(`${message} (${location.file}:${location.line}:${location.column})`);
    this.name = "YamlError";
    this.location = location;
  }
}

export type YamlValue = string | number | boolean | YamlValue[] | YamlObject;
export interface YamlObject {
  [key: string]: YamlValue;
}

export function parseYamlDocument(text: string, file = "<yaml>"): YamlValue {
  const lines = tokenize(text, file);
  if (lines.length === 0) return {};
  const [value, next] = parseNode(lines, 0, lines[0]!.indent, file);
  if (next !== lines.length) {
    const extra = lines[next]!;
    throw new YamlError("unexpected content after the document root", locationOf(extra, file));
  }
  return value;
}

interface Line {
  indent: number;
  content: string;
  number: number;
}

function tokenize(text: string, file: string): Line[] {
  const out: Line[] = [];
  const rawLines = text.split(/\r?\n/);
  for (let index = 0; index < rawLines.length; index += 1) {
    const number = index + 1;
    const raw = rawLines[index] as string;
    const withoutComment = stripComment(raw, number, file);
    if (withoutComment.trim().length === 0) continue;
    if (withoutComment.includes("\t")) {
      throw new YamlError("tabs are not allowed for indentation; use spaces", {
        file,
        line: number,
        column: withoutComment.indexOf("\t") + 1,
      });
    }
    const indent = withoutComment.length - withoutComment.trimStart().length;
    out.push({ indent, content: withoutComment.trim(), number });
  }
  return out;
}

function stripComment(raw: string, line: number, file: string): string {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index] as string;
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || raw[index - 1] === " ")) {
      return raw.slice(0, index);
    }
  }
  if (quote) {
    throw new YamlError(`unterminated ${quote} quote`, { file, line, column: raw.length + 1 });
  }
  return raw;
}

function parseNode(lines: Line[], start: number, indent: number, file: string): [YamlValue, number] {
  const line = lines[start] as Line;
  if (line.content.startsWith("- ") || line.content === "-") {
    return parseSequence(lines, start, indent, file);
  }
  return parseMapping(lines, start, indent, file);
}

function parseSequence(lines: Line[], start: number, indent: number, file: string): [YamlValue[], number] {
  const items: YamlValue[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index] as Line;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new YamlError("unexpected indentation inside a sequence", locationOf(line, file));
    }
    if (!line.content.startsWith("- ") && line.content !== "-") break;

    const inline = line.content === "-" ? "" : line.content.slice(2).trim();
    if (inline.length === 0) {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) {
        items.push(null as unknown as YamlValue);
        index += 1;
        continue;
      }
      const [value, consumed] = parseNode(lines, index + 1, next.indent, file);
      items.push(value);
      index = consumed;
      continue;
    }

    if (isMappingEntry(inline)) {
      const synthetic = { indent: indent + 2, content: inline, number: line.number };
      const head = [...lines.slice(0, index), synthetic, ...lines.slice(index + 1)];
      const [value, consumed] = parseMapping(head, index, indent + 2, file);
      items.push(value);
      index = consumed;
      continue;
    }

    items.push(parseScalar(inline, line, file));
    index += 1;
  }
  return [items, index];
}

function parseMapping(lines: Line[], start: number, indent: number, file: string): [YamlObject, number] {
  const out: YamlObject = {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index] as Line;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new YamlError("unexpected indentation inside a mapping", locationOf(line, file));
    }
    if (line.content.startsWith("- ") || line.content === "-") break;

    const separator = findKeySeparator(line.content);
    if (separator === -1) {
      throw new YamlError(`expected "key: value", found ${JSON.stringify(line.content)}`, locationOf(line, file));
    }
    const rawKey = line.content.slice(0, separator).trim();
    if (rawKey.length === 0) {
      throw new YamlError("empty mapping key", locationOf(line, file));
    }
    const key = rawKey.startsWith('"') || rawKey.startsWith("'")
      ? String(parseScalar(stripQuotes(rawKey), line, file))
      : rawKey;
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new YamlError(`duplicate key ${JSON.stringify(key)}`, locationOf(line, file));
    }

    const inline = line.content.slice(separator + 1).trim();
    if (inline.length === 0) {
      const next = lines[index + 1];
      if (!next || next.indent <= indent) {
        out[key] = {};
        index += 1;
        continue;
      }
      const [value, consumed] = parseNode(lines, index + 1, next.indent, file);
      out[key] = value;
      index = consumed;
      continue;
    }

    out[key] = parseScalar(inline, line, file);
    index += 1;
  }
  return [out, index];
}

/** Finds the `:` that separates a key from its value, ignoring quoted text. */
function findKeySeparator(content: string): number {
  let quote: '"' | "'" | undefined;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] as string;
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ":") {
      const next = content[index + 1];
      if (next === undefined || next === " ") return index;
    }
  }
  return -1;
}

function isMappingEntry(inline: string): boolean {
  return findKeySeparator(inline) !== -1;
}

function parseScalar(text: string, line: Line, file: string): YamlValue {
  if (text.startsWith("[") || text.startsWith("{")) {
    throw new YamlError(
      "flow collections ([...] / {...}) are not part of the Map Pack YAML subset; use block style",
      locationOf(line, file),
    );
  }
  if (text.startsWith("&") || text.startsWith("*")) {
    throw new YamlError(
      "YAML anchors and aliases are not supported; repeat the value explicitly",
      locationOf(line, file),
    );
  }
  if (text.startsWith("!")) {
    throw new YamlError("YAML tags are not supported", locationOf(line, file));
  }
  if (text === "|" || text === ">" || text.startsWith("|") || text.startsWith(">")) {
    throw new YamlError("block scalars are not supported; use a single-line quoted string", locationOf(line, file));
  }
  if (text.startsWith('"') || text.startsWith("'")) {
    const quote = text[0] as string;
    if (!text.endsWith(quote) || text.length < 2) {
      throw new YamlError("unterminated quoted scalar", locationOf(line, file));
    }
    return stripQuotes(text);
  }
  if (text === "null" || text === "~") return null as unknown as YamlValue;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) return Number(text);
  return text;
}

function stripQuotes(text: string): string {
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
    (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function locationOf(line: Line, file: string): YamlLocation {
  return { file, line: line.number, column: line.indent + 1 };
}
