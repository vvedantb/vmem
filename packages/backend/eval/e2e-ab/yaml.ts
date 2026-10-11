// Restricted YAML reader for e2e-ab fixtures. Supported subset:
//   - block maps and block lists (2-space or any consistent indent)
//   - "- key: value" list items that start a map
//   - scalars: plain, "double", 'single', numbers, true/false/null
//   - inline lists of scalars: [a, b, c]
//   - block scalars: "|" (keep final newline) and "|-" (strip it)
//   - full-line and trailing " # comments"
// Not supported: anchors, tags, flow maps, nested flow lists, multi-document files.

import { z } from "zod";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

interface Line {
  indent: number;
  text: string;
}

const MAP_ENTRY = /^([A-Za-z_][\w-]*):(?:\s+(.*)|)$/;

function toLines(source: string): Line[] {
  return source.split(/\r?\n/).map((raw) => {
    const text = raw.trimEnd();
    return { indent: text.length - text.trimStart().length, text: text.trim() };
  });
}

function isSkippable(line: Line): boolean {
  return line.text === "" || line.text.startsWith("#");
}

function stripComment(value: string): string {
  const match = /\s#/.exec(value);
  return match ? value.slice(0, match.index).trimEnd() : value;
}

function parseScalar(raw: string): Json {
  const value = raw.trim();
  if (value.startsWith('"')) return z.string().parse(JSON.parse(value));
  if (value.startsWith("'")) {
    const end = value.lastIndexOf("'");
    if (end > 0) return value.slice(1, end).replace(/''/g, "'");
  }
  const plain = stripComment(value);
  if (plain === "true") return true;
  if (plain === "false") return false;
  if (plain === "null" || plain === "~" || plain === "") return null;
  if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
  return plain;
}

function parseInline(raw: string): Json {
  const value = stripComment(raw.trim());
  if (!value.startsWith("[")) return parseScalar(raw);
  if (!value.endsWith("]")) throw new Error(`Unterminated inline list: ${raw}`);
  const inner = value.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((item) => parseScalar(item));
}

class Reader {
  private index = 0;

  private readonly lines: Line[];

  constructor(lines: Line[]) {
    this.lines = lines;
  }

  private peek(): Line | null {
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line === undefined) return null;
      if (!isSkippable(line)) return line;
      this.index += 1;
    }
    return null;
  }

  parseDocument(): Json {
    const first = this.peek();
    if (first === null) return null;
    const value = this.parseBlock(first.indent);
    const extra = this.peek();
    if (extra !== null) {
      throw new Error(
        `Unexpected content at indent ${extra.indent}: ${extra.text}`,
      );
    }
    return value;
  }

  private parseBlock(indent: number): Json {
    const line = this.peek();
    if (line === null) return null;
    return line.text === "-" || line.text.startsWith("- ")
      ? this.parseList(indent)
      : this.parseMap(indent);
  }

  private parseMap(indent: number): Json {
    const result: { [key: string]: Json } = {};
    for (let line = this.peek(); line !== null; line = this.peek()) {
      if (line.indent < indent) break;
      if (line.indent > indent) {
        throw new Error(`Unexpected indent: ${line.text}`);
      }
      const match = MAP_ENTRY.exec(line.text);
      if (match === null)
        throw new Error(`Expected "key: value": ${line.text}`);
      const key = match[1] ?? "";
      const rest = stripComment(match[2] ?? "");
      this.index += 1;
      if (key in result) throw new Error(`Duplicate key: ${key}`);
      result[key] = this.parseValue(indent, rest, match[2] ?? "");
    }
    return result;
  }

  private parseValue(
    parentIndent: number,
    rest: string,
    rawRest: string,
  ): Json {
    if (rest === "|" || rest === "|-")
      return this.parseBlockScalar(parentIndent, rest === "|-");
    if (rest !== "") return parseInline(rawRest);
    const next = this.peek();
    if (next === null) return null;
    // A list may sit at the same indent as its parent key.
    const sameIndentList =
      next.indent === parentIndent &&
      (next.text === "-" || next.text.startsWith("- "));
    if (next.indent > parentIndent || sameIndentList)
      return this.parseBlock(next.indent);
    return null;
  }

  private parseBlockScalar(parentIndent: number, strip: boolean): string {
    const collected: Line[] = [];
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line === undefined) break;
      if (line.text !== "" && line.indent <= parentIndent) break;
      collected.push(line);
      this.index += 1;
    }
    while (
      collected.length > 0 &&
      collected[collected.length - 1]?.text === ""
    ) {
      collected.pop();
    }
    const first = collected.find((line) => line.text !== "");
    const base = first?.indent ?? 0;
    const body = collected
      .map((line) =>
        line.text === "" ? "" : " ".repeat(line.indent - base) + line.text,
      )
      .join("\n");
    return strip ? body : `${body}\n`;
  }

  private parseList(indent: number): Json {
    const result: Json[] = [];
    for (let line = this.peek(); line !== null; line = this.peek()) {
      if (line.indent < indent) break;
      if (
        line.indent > indent ||
        !(line.text === "-" || line.text.startsWith("- "))
      ) {
        throw new Error(`Unexpected list content: ${line.text}`);
      }
      const rest = line.text === "-" ? "" : line.text.slice(2).trimStart();
      if (rest === "") {
        this.index += 1;
        const next = this.peek();
        result.push(
          next !== null && next.indent > indent
            ? this.parseBlock(next.indent)
            : null,
        );
      } else if (MAP_ENTRY.test(rest)) {
        // Re-seat the item as a map whose keys line up after "- ".
        const offset = line.text.length - rest.length;
        this.lines[this.index] = { indent: indent + offset, text: rest };
        result.push(this.parseMap(indent + offset));
      } else {
        this.index += 1;
        result.push(parseInline(rest));
      }
    }
    return result;
  }
}

export function parseYaml(source: string): Json {
  return new Reader(toLines(source)).parseDocument();
}
