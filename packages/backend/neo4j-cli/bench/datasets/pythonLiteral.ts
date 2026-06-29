/**
 * Minimal Python-literal parser (an `ast.literal_eval` subset), dependency-free.
 *
 * The Hugging Face datasets-server `/rows` API serialises some BEAM columns
 * (notably `probing_questions`) as the dataset author's stored Python `repr`
 * string — a dict/list structure that uses single OR double quoted strings
 * (Python switches quote style to avoid escaping an embedded apostrophe, e.g.
 * `"I'm"` stays double-quoted), plus `True`/`False`/`None` and numbers.
 *
 * Neither `JSON.parse` nor a naive `replace(/'/g, '"')` can handle this: the
 * latter corrupts every apostrophe inside double-quoted strings. So we parse the
 * literal directly with a small recursive-descent parser.
 *
 * Supported: dict `{}`, list `[]`, tuple `()` (→ array), single/double quoted
 * strings with backslash escapes (`\\ \' \" \n \t \r \b \f \/ \uXXXX`),
 * signed int/float numbers (incl. exponent), and the bare words
 * `True`/`False`/`None`.
 */

export type PyValue =
  | string
  | number
  | boolean
  | null
  | PyValue[]
  | { [key: string]: PyValue };

const WORD_CHAR = /[A-Za-z0-9_.+\-eE]/;

class PythonLiteralParser {
  private pos = 0;

  constructor(private readonly src: string) {}

  parse(): PyValue {
    this.skipWs();
    const value = this.parseValue();
    this.skipWs();
    if (this.pos < this.src.length) {
      throw new Error(
        `unexpected trailing input at ${String(this.pos)}: ${this.src.slice(this.pos, this.pos + 20)}`,
      );
    }
    return value;
  }

  private parseValue(): PyValue {
    this.skipWs();
    const ch = this.src[this.pos];
    if (ch === undefined) throw new Error("unexpected end of input");
    if (ch === "{") return this.parseDict();
    if (ch === "[") return this.parseList("]");
    if (ch === "(") return this.parseList(")");
    if (ch === "'" || ch === '"') return this.parseString(ch);
    return this.parseWord();
  }

  private parseDict(): { [key: string]: PyValue } {
    this.pos += 1; // "{"
    const out: { [key: string]: PyValue } = {};
    this.skipWs();
    if (this.src[this.pos] === "}") {
      this.pos += 1;
      return out;
    }
    for (;;) {
      this.skipWs();
      const keyChar = this.src[this.pos];
      if (keyChar !== "'" && keyChar !== '"') {
        throw new Error(`expected string key at ${String(this.pos)}`);
      }
      const key = this.parseString(keyChar);
      this.skipWs();
      this.expect(":");
      out[key] = this.parseValue();
      this.skipWs();
      const sep = this.src[this.pos];
      if (sep === ",") {
        this.pos += 1;
        this.skipWs();
        if (this.src[this.pos] === "}") {
          this.pos += 1;
          return out;
        }
        continue;
      }
      if (sep === "}") {
        this.pos += 1;
        return out;
      }
      throw new Error(`expected ',' or '}' at ${String(this.pos)}`);
    }
  }

  private parseList(close: string): PyValue[] {
    this.pos += 1; // "[" or "("
    const out: PyValue[] = [];
    this.skipWs();
    if (this.src[this.pos] === close) {
      this.pos += 1;
      return out;
    }
    for (;;) {
      out.push(this.parseValue());
      this.skipWs();
      const sep = this.src[this.pos];
      if (sep === ",") {
        this.pos += 1;
        this.skipWs();
        if (this.src[this.pos] === close) {
          this.pos += 1;
          return out;
        }
        continue;
      }
      if (sep === close) {
        this.pos += 1;
        return out;
      }
      throw new Error(`expected ',' or '${close}' at ${String(this.pos)}`);
    }
  }

  private parseString(quote: string): string {
    this.pos += 1; // opening quote
    let out = "";
    for (;;) {
      const ch = this.src[this.pos];
      if (ch === undefined) throw new Error("unterminated string");
      if (ch === "\\") {
        const next = this.src[this.pos + 1];
        if (next === undefined) throw new Error("dangling escape");
        out += this.decodeEscape(next);
        this.pos += next === "u" ? 6 : 2;
        continue;
      }
      if (ch === quote) {
        this.pos += 1;
        return out;
      }
      out += ch;
      this.pos += 1;
    }
  }

  private decodeEscape(next: string): string {
    switch (next) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "\\":
        return "\\";
      case "'":
        return "'";
      case '"':
        return '"';
      case "/":
        return "/";
      case "u": {
        const hex = this.src.slice(this.pos + 2, this.pos + 6);
        const code = Number.parseInt(hex, 16);
        return Number.isNaN(code) ? next : String.fromCharCode(code);
      }
      default:
        return next;
    }
  }

  private parseWord(): PyValue {
    const start = this.pos;
    while (
      this.pos < this.src.length &&
      WORD_CHAR.test(this.src[this.pos] ?? "")
    ) {
      this.pos += 1;
    }
    const word = this.src.slice(start, this.pos);
    if (word === "True") return true;
    if (word === "False") return false;
    if (word === "None") return null;
    const num = Number(word);
    if (word.length > 0 && !Number.isNaN(num)) return num;
    throw new Error(`unexpected token "${word}" at ${String(start)}`);
  }

  private skipWs(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos] ?? "")) {
      this.pos += 1;
    }
  }

  private expect(ch: string): void {
    if (this.src[this.pos] !== ch) {
      throw new Error(
        `expected '${ch}' at ${String(this.pos)}, got '${this.src[this.pos] ?? "EOF"}'`,
      );
    }
    this.pos += 1;
  }
}

export function parsePythonLiteral(src: string): PyValue {
  return new PythonLiteralParser(src).parse();
}
