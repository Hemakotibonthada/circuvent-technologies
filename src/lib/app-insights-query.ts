/**
 * A Kusto-subset query language over the telemetry buffer.
 *
 * Azure's Logs blade is the feature that makes Application Insights more than
 * a set of charts: every other blade is a question somebody anticipated, and
 * the query editor is the one that answers the question nobody did. The panel
 * had a text box that substring-matched a path, which answers exactly one.
 *
 * This is a real parser rather than a pattern match on the query string.
 * A regex-driven "language" accepts `where status >= 500 order by` and then
 * does something arbitrary with it; a parser rejects it at the character it
 * went wrong, which is the difference between a tool and a trap.
 *
 * Deliberately *not* implemented: joins, `let` bindings, user-defined
 * functions, `mv-expand`, and anything else that would need a query planner.
 * Everything here runs as a pipeline of array transforms over one buffer that
 * already fits in memory. Growing beyond that is a storage change, not a
 * syntax change, and pretending otherwise in the grammar would promise
 * something the engine cannot keep.
 *
 * Pure: it takes events and a query, and returns rows or an error. No I/O.
 */

import { percentile, type EventKind, type TelemetryEvent } from "./app-insights";

/* ------------------------------------------------------------------ *
 * Schema                                                              *
 * ------------------------------------------------------------------ */

/** The tables a query can start from, and the events each selects. */
export const TABLES: Record<string, { label: string; kinds: EventKind[] | "all" }> = {
  requests: { label: "Server requests", kinds: ["request"] },
  pageViews: { label: "Page views", kinds: ["pageview"] },
  dependencies: { label: "Outbound dependency calls", kinds: ["dependency"] },
  exceptions: { label: "Exceptions", kinds: ["exception"] },
  customEvents: { label: "Custom events", kinds: ["event"] },
  telemetry: { label: "Everything, unioned", kinds: "all" },
};

export type ColumnType = "string" | "number" | "bool" | "datetime";

/** Every column a query may name, and what it is. */
export const COLUMNS: Record<string, ColumnType> = {
  id: "string",
  kind: "string",
  at: "datetime",
  path: "string",
  session: "string",
  durationMs: "number",
  status: "number",
  method: "string",
  target: "string",
  ok: "bool",
  errorType: "string",
  errorMessage: "string",
  source: "string",
  userAgentClass: "string",
};

export type CellValue = string | number | boolean | null;
export type Row = Record<string, CellValue>;

export interface QueryResult {
  columns: { name: string; type: ColumnType }[];
  rows: Row[];
  /** Rows before `take` trimmed the result, so the UI can say "of 4,812". */
  totalRows: number;
  /** Events the source table matched, before any `where`. */
  scanned: number;
  tookMs: number;
}

/**
 * A parse or evaluation failure.
 *
 * Carries the offset so the editor can point at the character rather than
 * saying the query is invalid and leaving the reader to find out where.
 */
export class QueryError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
    this.name = "QueryError";
  }
}

/* ------------------------------------------------------------------ *
 * Tokeniser                                                           *
 * ------------------------------------------------------------------ */

type TokType = "ident" | "number" | "string" | "punct" | "eof";

interface Token {
  type: TokType;
  value: string;
  start: number;
}

const PUNCT = ["==", "!=", "<=", ">=", "|", "(", ")", ",", "<", ">", "=", "*"];

/** Timespan literals: 90s, 30m, 24h, 7d. Kusto's own spelling. */
const TIMESPAN = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;

function tokenise(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Comments: `// to end of line`, as Kusto spells them.
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let value = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) {
          i++;
          value += src[i] === "n" ? "\n" : src[i] === "t" ? "\t" : src[i];
        } else {
          value += src[i];
        }
        i++;
      }
      if (i >= src.length) throw new QueryError("Unterminated string literal.", start);
      i++; // closing quote
      out.push({ type: "string", value, start });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      // A trailing unit makes it a timespan, which the parser reads as a number
      // of milliseconds. `1h` is one token, not `1` followed by `h`.
      while (i < src.length && /[a-z]/.test(src[i])) i++;
      out.push({ type: "number", value: src.slice(start, i), start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
      out.push({ type: "ident", value: src.slice(start, i), start });
      continue;
    }
    const punct = PUNCT.find((p) => src.startsWith(p, i));
    if (punct) {
      out.push({ type: "punct", value: punct, start: i });
      i += punct.length;
      continue;
    }
    throw new QueryError(`Unexpected character ${JSON.stringify(c)}.`, i);
  }
  out.push({ type: "eof", value: "", start: src.length });
  return out;
}

/* ------------------------------------------------------------------ *
 * Expression AST                                                      *
 * ------------------------------------------------------------------ */

type Expr =
  | { t: "col"; name: string; at: number }
  | { t: "lit"; value: CellValue; at: number }
  | { t: "now"; at: number }
  | { t: "ago"; ms: number; at: number }
  | { t: "not"; e: Expr; at: number }
  | { t: "bin"; op: string; l: Expr; r: Expr; at: number }
  | { t: "in"; l: Expr; values: Expr[]; negated: boolean; at: number }
  | { t: "call"; name: string; args: Expr[]; at: number };

interface Aggregation {
  /** Output column name — the alias if given, otherwise a Kusto-ish default. */
  alias: string;
  fn: string;
  args: Expr[];
  at: number;
}

type Stage =
  | { t: "where"; e: Expr }
  | { t: "summarize"; aggs: Aggregation[]; by: string[]; at: number }
  | { t: "project"; cols: string[]; at: number }
  | { t: "extend"; alias: string; e: Expr; at: number }
  | { t: "order"; keys: { col: string; desc: boolean; at: number }[] }
  | { t: "take"; n: number }
  | { t: "distinct"; cols: string[]; at: number }
  | { t: "count" }
  | { t: "top"; n: number; col: string; desc: boolean; at: number };

interface Query {
  table: string;
  tableAt: number;
  stages: Stage[];
}

/* ------------------------------------------------------------------ *
 * Parser                                                              *
 * ------------------------------------------------------------------ */

const AGG_FUNCS = new Set(["count", "dcount", "sum", "avg", "min", "max", "percentile", "countif", "any"]);
const SCALAR_FUNCS = new Set(["isempty", "isnotempty", "strlen", "tolower", "toupper", "bin", "floor"]);

class Parser {
  private pos = 0;

  constructor(private readonly toks: Token[]) {}

  private peek(): Token {
    return this.toks[this.pos];
  }

  private next(): Token {
    return this.toks[this.pos++];
  }

  private isPunct(v: string): boolean {
    const t = this.peek();
    return t.type === "punct" && t.value === v;
  }

  /** Keyword match is case-insensitive, as Kusto's operators are. */
  private isKeyword(v: string): boolean {
    const t = this.peek();
    return t.type === "ident" && t.value.toLowerCase() === v;
  }

  private eatPunct(v: string): boolean {
    if (this.isPunct(v)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private eatKeyword(v: string): boolean {
    if (this.isKeyword(v)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expectPunct(v: string): Token {
    if (!this.isPunct(v)) this.fail(`Expected ${JSON.stringify(v)}.`);
    return this.next();
  }

  private fail(msg: string): never {
    throw new QueryError(msg, this.peek().start);
  }

  parse(): Query {
    const head = this.peek();
    if (head.type !== "ident") this.fail("A query starts with a table name.");
    const table = this.next().value;
    if (!(table in TABLES)) {
      this.pos--;
      this.fail(`Unknown table ${JSON.stringify(table)}. Try: ${Object.keys(TABLES).join(", ")}.`);
    }
    const stages: Stage[] = [];
    while (this.eatPunct("|")) stages.push(this.parseStage());
    if (this.peek().type !== "eof") this.fail("Expected `|` before the next operator.");
    return { table, tableAt: head.start, stages };
  }

  private parseStage(): Stage {
    const t = this.peek();
    if (t.type !== "ident") this.fail("Expected an operator after `|`.");
    const op = t.value.toLowerCase();
    switch (op) {
      case "where":
        this.next();
        return { t: "where", e: this.parseExpr() };
      case "summarize":
        return this.parseSummarize();
      case "project":
        this.next();
        return { t: "project", cols: this.parseColumnList(), at: t.start };
      case "extend":
        return this.parseExtend();
      case "sort":
      case "order":
        return this.parseOrder();
      case "take":
      case "limit": {
        this.next();
        const n = this.peek();
        if (n.type !== "number") this.fail("`take` needs a row count.");
        this.next();
        return { t: "take", n: Math.max(0, Math.floor(Number(n.value))) };
      }
      case "distinct":
        this.next();
        return { t: "distinct", cols: this.parseColumnList(), at: t.start };
      case "count":
        this.next();
        return { t: "count" };
      case "top":
        return this.parseTop();
      default:
        this.fail(
          `Unknown operator ${JSON.stringify(t.value)}. ` +
            "Supported: where, summarize, project, extend, order by, top, take, distinct, count.",
        );
    }
  }

  private parseColumnList(): string[] {
    const cols: string[] = [];
    do {
      const c = this.peek();
      if (c.type !== "ident") this.fail("Expected a column name.");
      this.next();
      cols.push(c.value);
    } while (this.eatPunct(","));
    return cols;
  }

  private parseTop(): Stage {
    const at = this.next().start; // top
    const n = this.peek();
    if (n.type !== "number") this.fail("`top` needs a row count.");
    this.next();
    if (!this.eatKeyword("by")) this.fail("`top N` must be followed by `by <column>`.");
    const c = this.peek();
    if (c.type !== "ident") this.fail("Expected a column name after `by`.");
    this.next();
    const desc = this.eatKeyword("desc") ? true : (this.eatKeyword("asc"), true);
    return { t: "top", n: Math.max(0, Math.floor(Number(n.value))), col: c.value, desc, at };
  }

  private parseOrder(): Stage {
    this.next(); // sort | order
    if (!this.eatKeyword("by")) this.fail("Expected `by` after `order`.");
    const keys: { col: string; desc: boolean; at: number }[] = [];
    do {
      const c = this.peek();
      if (c.type !== "ident") this.fail("Expected a column name.");
      this.next();
      let desc = true; // Kusto's default direction
      if (this.eatKeyword("asc")) desc = false;
      else this.eatKeyword("desc");
      keys.push({ col: c.value, desc, at: c.start });
    } while (this.eatPunct(","));
    return { t: "order", keys };
  }

  private parseExtend(): Stage {
    const at = this.next().start; // extend
    const name = this.peek();
    if (name.type !== "ident") this.fail("`extend` needs a column name.");
    this.next();
    if (!this.eatPunct("=")) this.fail("`extend` needs `name = expression`.");
    return { t: "extend", alias: name.value, e: this.parseExpr(), at };
  }

  private parseSummarize(): Stage {
    const at = this.next().start; // summarize
    const aggs: Aggregation[] = [];
    do {
      if (this.isKeyword("by")) break;
      const start = this.peek();
      let alias = "";
      // `alias = agg(...)`. Two tokens of lookahead, so a bare `count()` is
      // still read as an aggregation rather than a malformed assignment.
      if (start.type === "ident" && this.toks[this.pos + 1]?.value === "=") {
        alias = start.value;
        this.pos += 2;
      }
      const fnTok = this.peek();
      if (fnTok.type !== "ident") this.fail("Expected an aggregation such as count() or avg(durationMs).");
      const fn = fnTok.value.toLowerCase();
      if (!AGG_FUNCS.has(fn)) {
        this.fail(
          `${JSON.stringify(fnTok.value)} is not an aggregation. ` +
            `Supported: ${[...AGG_FUNCS].join(", ")}.`,
        );
      }
      this.next();
      this.expectPunct("(");
      const args: Expr[] = [];
      if (!this.isPunct(")")) {
        do {
          args.push(this.parseExpr());
        } while (this.eatPunct(","));
      }
      this.expectPunct(")");
      aggs.push({ alias: alias || defaultAggAlias(fn, args), fn, args, at: fnTok.start });
    } while (this.eatPunct(","));

    let by: string[] = [];
    if (this.eatKeyword("by")) by = this.parseColumnList();
    if (!aggs.length && !by.length) this.fail("`summarize` needs an aggregation or a `by` clause.");
    return { t: "summarize", aggs, by, at };
  }

  /* ---- expressions, lowest precedence first ---- */

  parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let l = this.parseAnd();
    while (this.isKeyword("or")) {
      const at = this.next().start;
      l = { t: "bin", op: "or", l, r: this.parseAnd(), at };
    }
    return l;
  }

  private parseAnd(): Expr {
    let l = this.parseNot();
    while (this.isKeyword("and")) {
      const at = this.next().start;
      l = { t: "bin", op: "and", l, r: this.parseNot(), at };
    }
    return l;
  }

  private parseNot(): Expr {
    if (this.isKeyword("not")) {
      const at = this.next().start;
      return { t: "not", e: this.parseNot(), at };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const l = this.parsePrimary();
    const t = this.peek();

    if (t.type === "punct" && ["==", "!=", "<", "<=", ">", ">="].includes(t.value)) {
      this.next();
      return { t: "bin", op: t.value, l, r: this.parsePrimary(), at: t.start };
    }

    if (t.type === "ident") {
      const kw = t.value.toLowerCase();
      const stringOps: Record<string, string> = {
        contains: "contains",
        startswith: "startswith",
        endswith: "endswith",
        matches: "matches",
      };
      if (kw in stringOps) {
        this.next();
        if (kw === "matches" && !this.eatKeyword("regex")) this.fail("Expected `regex` after `matches`.");
        return { t: "bin", op: stringOps[kw], l, r: this.parsePrimary(), at: t.start };
      }
      if (kw === "in" || kw === "notin") {
        this.next();
        this.expectPunct("(");
        const values: Expr[] = [];
        if (!this.isPunct(")")) {
          do {
            values.push(this.parsePrimary());
          } while (this.eatPunct(","));
        }
        this.expectPunct(")");
        return { t: "in", l, values, negated: kw === "notin", at: t.start };
      }
    }
    return l;
  }

  private parsePrimary(): Expr {
    const t = this.peek();

    if (this.eatPunct("(")) {
      const e = this.parseExpr();
      this.expectPunct(")");
      return e;
    }

    if (t.type === "string") {
      this.next();
      return { t: "lit", value: t.value, at: t.start };
    }

    if (t.type === "number") {
      this.next();
      const span = TIMESPAN.exec(t.value);
      if (span) return { t: "lit", value: timespanMs(Number(span[1]), span[2]), at: t.start };
      const n = Number(t.value);
      if (!Number.isFinite(n)) throw new QueryError(`${JSON.stringify(t.value)} is not a number.`, t.start);
      return { t: "lit", value: n, at: t.start };
    }

    if (t.type === "ident") {
      const lower = t.value.toLowerCase();
      if (lower === "true" || lower === "false") {
        this.next();
        return { t: "lit", value: lower === "true", at: t.start };
      }
      if (lower === "null") {
        this.next();
        return { t: "lit", value: null, at: t.start };
      }
      if (lower === "now" && this.toks[this.pos + 1]?.value === "(") {
        this.next();
        this.expectPunct("(");
        this.expectPunct(")");
        return { t: "now", at: t.start };
      }
      if (lower === "ago" && this.toks[this.pos + 1]?.value === "(") {
        this.next();
        this.expectPunct("(");
        const arg = this.peek();
        if (arg.type !== "number") this.fail("ago() takes a timespan such as 1h, 30m or 7d.");
        this.next();
        const span = TIMESPAN.exec(arg.value);
        if (!span) this.fail("ago() takes a timespan such as 1h, 30m or 7d.");
        this.expectPunct(")");
        return { t: "ago", ms: timespanMs(Number(span[1]), span[2]), at: t.start };
      }
      if (SCALAR_FUNCS.has(lower) && this.toks[this.pos + 1]?.value === "(") {
        this.next();
        this.expectPunct("(");
        const args: Expr[] = [];
        if (!this.isPunct(")")) {
          do {
            args.push(this.parseExpr());
          } while (this.eatPunct(","));
        }
        this.expectPunct(")");
        return { t: "call", name: lower, args, at: t.start };
      }
      this.next();
      return { t: "col", name: t.value, at: t.start };
    }

    this.fail("Expected a value, a column or `(`.");
  }
}

function timespanMs(n: number, unit: string): number {
  switch (unit) {
    case "ms":
      return n;
    case "s":
      return n * 1000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    default:
      return n * 86_400_000;
  }
}

function defaultAggAlias(fn: string, args: Expr[]): string {
  if (fn === "count") return "count_";
  const first = args[0];
  const base = first && first.t === "col" ? first.name : "value";
  if (fn === "percentile") {
    const p = args[1];
    const n = p && p.t === "lit" && typeof p.value === "number" ? p.value : 95;
    return `percentile_${base}_${n}`;
  }
  return `${fn}_${base}`;
}

/* ------------------------------------------------------------------ *
 * Evaluation                                                          *
 * ------------------------------------------------------------------ */

function toRow(e: TelemetryEvent): Row {
  return {
    id: e.id,
    kind: e.kind,
    at: e.at,
    path: e.path,
    session: e.session,
    durationMs: e.durationMs,
    status: e.status,
    method: e.method ?? null,
    target: e.target ?? null,
    ok: e.ok,
    errorType: e.errorType ?? null,
    errorMessage: e.errorMessage ?? null,
    source: e.source,
    userAgentClass: e.userAgentClass ?? null,
  };
}

/** Datetimes compare as milliseconds so `at > ago(1h)` means what it looks like. */
function numeric(v: CellValue): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const asDate = Date.parse(v);
    if (!Number.isNaN(asDate)) return asDate;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function truthy(v: CellValue): boolean {
  if (v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v.length > 0;
}

interface EvalCtx {
  nowMs: number;
  /** Columns available on the current row shape, for a helpful unknown-column error. */
  known: Set<string>;
}

function evalExpr(e: Expr, row: Row, ctx: EvalCtx): CellValue {
  switch (e.t) {
    case "lit":
      return e.value;
    case "now":
      return ctx.nowMs;
    case "ago":
      return ctx.nowMs - e.ms;
    case "col": {
      if (!(e.name in row)) {
        if (!ctx.known.has(e.name)) {
          throw new QueryError(
            `Unknown column ${JSON.stringify(e.name)}. Available: ${[...ctx.known].sort().join(", ")}.`,
            e.at,
          );
        }
        return null;
      }
      return row[e.name];
    }
    case "not":
      return !truthy(evalExpr(e.e, row, ctx));
    case "in": {
      const l = evalExpr(e.l, row, ctx);
      const hit = e.values.some((v) => looseEquals(l, evalExpr(v, row, ctx)));
      return e.negated ? !hit : hit;
    }
    case "call":
      return evalCall(e, row, ctx);
    case "bin":
      return evalBin(e, row, ctx);
  }
}

function looseEquals(a: CellValue, b: CellValue): boolean {
  if (a === null || b === null) return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  const na = numeric(a);
  const nb = numeric(b);
  if (na !== null && nb !== null) return na === nb;
  return String(a) === String(b);
}

function evalCall(e: Extract<Expr, { t: "call" }>, row: Row, ctx: EvalCtx): CellValue {
  const a = e.args.map((x) => evalExpr(x, row, ctx));
  switch (e.name) {
    case "isempty":
      return a[0] === null || a[0] === "";
    case "isnotempty":
      return !(a[0] === null || a[0] === "");
    case "strlen":
      return String(a[0] ?? "").length;
    case "tolower":
      return String(a[0] ?? "").toLowerCase();
    case "toupper":
      return String(a[0] ?? "").toUpperCase();
    case "floor": {
      const n = numeric(a[0] ?? null);
      return n === null ? null : Math.floor(n);
    }
    case "bin": {
      // bin(at, 1h) — the histogram primitive every Kusto time chart is built on.
      const n = numeric(a[0] ?? null);
      const size = numeric(a[1] ?? null);
      if (n === null || size === null || size <= 0) return null;
      const floored = Math.floor(n / size) * size;
      // A binned datetime stays a datetime, or the chart axis loses its labels.
      return typeof a[0] === "string" && Number.isNaN(Number(a[0]))
        ? new Date(floored).toISOString()
        : floored;
    }
    default:
      throw new QueryError(`Unknown function ${JSON.stringify(e.name)}.`, e.at);
  }
}

function evalBin(e: Extract<Expr, { t: "bin" }>, row: Row, ctx: EvalCtx): CellValue {
  if (e.op === "and") return truthy(evalExpr(e.l, row, ctx)) && truthy(evalExpr(e.r, row, ctx));
  if (e.op === "or") return truthy(evalExpr(e.l, row, ctx)) || truthy(evalExpr(e.r, row, ctx));

  const l = evalExpr(e.l, row, ctx);
  const r = evalExpr(e.r, row, ctx);

  switch (e.op) {
    case "==":
      return looseEquals(l, r);
    case "!=":
      return !looseEquals(l, r);
    case "contains":
      // Case-insensitive, like Kusto's `contains` (`contains_cs` is the strict one).
      return String(l ?? "").toLowerCase().includes(String(r ?? "").toLowerCase());
    case "startswith":
      return String(l ?? "").toLowerCase().startsWith(String(r ?? "").toLowerCase());
    case "endswith":
      return String(l ?? "").toLowerCase().endsWith(String(r ?? "").toLowerCase());
    case "matches": {
      let re: RegExp;
      try {
        re = new RegExp(String(r ?? ""));
      } catch {
        throw new QueryError(`${JSON.stringify(String(r ?? ""))} is not a valid regular expression.`, e.at);
      }
      return re.test(String(l ?? ""));
    }
    default: {
      const nl = numeric(l);
      const nr = numeric(r);
      if (nl === null || nr === null) return false;
      switch (e.op) {
        case "<":
          return nl < nr;
        case "<=":
          return nl <= nr;
        case ">":
          return nl > nr;
        case ">=":
          return nl >= nr;
        default:
          throw new QueryError(`Unknown operator ${JSON.stringify(e.op)}.`, e.at);
      }
    }
  }
}

function aggregate(fn: string, args: Expr[], rows: Row[], ctx: EvalCtx, at: number): CellValue {
  const values = () => rows.map((r) => evalExpr(args[0], r, ctx));
  const numbers = () =>
    values()
      .map((v) => numeric(v))
      .filter((n): n is number => n !== null);

  switch (fn) {
    case "count":
      // countif is spelled `countif(expr)`; `count(expr)` counts non-nulls, as Kusto does.
      if (!args.length) return rows.length;
      return values().filter((v) => v !== null).length;
    case "countif":
      if (!args.length) throw new QueryError("countif() needs a condition.", at);
      return rows.filter((r) => truthy(evalExpr(args[0], r, ctx))).length;
    case "dcount": {
      if (!args.length) throw new QueryError("dcount() needs a column.", at);
      return new Set(values().filter((v) => v !== null).map(String)).size;
    }
    case "sum":
      return numbers().reduce((a, b) => a + b, 0);
    case "avg": {
      const n = numbers();
      return n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 100) / 100 : 0;
    }
    case "min": {
      const n = numbers();
      return n.length ? Math.min(...n) : null;
    }
    case "max": {
      const n = numbers();
      return n.length ? Math.max(...n) : null;
    }
    case "any": {
      const v = values();
      return v.length ? v[0] : null;
    }
    case "percentile": {
      if (args.length < 2) throw new QueryError("percentile() takes a column and a percentile.", at);
      const p = evalExpr(args[1], rows[0] ?? {}, ctx);
      const pn = numeric(p);
      if (pn === null || pn < 0 || pn > 100) {
        throw new QueryError("percentile() needs a percentile between 0 and 100.", at);
      }
      // Shares app-insights.ts's nearest-rank percentile rather than defining a
      // second one: the Logs blade and the Performance blade disagreeing about
      // p95 on the same data is a bug report nobody can close.
      return percentile(numbers().sort((a, b) => a - b), pn);
    }
    default:
      throw new QueryError(`Unknown aggregation ${JSON.stringify(fn)}.`, at);
  }
}

/* ------------------------------------------------------------------ *
 * Runner                                                              *
 * ------------------------------------------------------------------ */

/** Rows a query may return. Beyond this the browser, not the query, is the problem. */
export const MAX_ROWS = 5000;

/** Parse only — used by the editor to report errors without running anything. */
export function parseQuery(text: string): Query {
  if (!text.trim()) throw new QueryError("Write a query. Start with a table name, e.g. `requests`.", 0);
  return new Parser(tokenise(text)).parse();
}

export function runQuery(
  events: TelemetryEvent[],
  text: string,
  opts: { now?: string; maxRows?: number } = {},
): QueryResult {
  const started = Date.now();
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const maxRows = Math.min(MAX_ROWS, Math.max(1, opts.maxRows ?? MAX_ROWS));
  const q = parseQuery(text);

  const spec = TABLES[q.table];
  const source =
    spec.kinds === "all" ? events : events.filter((e) => (spec.kinds as EventKind[]).includes(e.kind));
  const scanned = source.length;

  let rows: Row[] = source.map(toRow);
  let columns: { name: string; type: ColumnType }[] = Object.entries(COLUMNS).map(([name, type]) => ({
    name,
    type,
  }));
  const ctx: EvalCtx = { nowMs, known: new Set(columns.map((c) => c.name)) };
  // `take` is a limit on the result, not on the work: a `take 10` before a
  // `summarize` must still summarise ten rows, so it is applied in order.
  let explicitTake: number | null = null;

  for (const stage of q.stages) {
    switch (stage.t) {
      case "where":
        rows = rows.filter((r) => truthy(evalExpr(stage.e, r, ctx)));
        break;

      case "extend": {
        rows = rows.map((r) => ({ ...r, [stage.alias]: evalExpr(stage.e, r, ctx) }));
        if (!ctx.known.has(stage.alias)) {
          columns = [...columns, { name: stage.alias, type: inferType(rows, stage.alias) }];
          ctx.known.add(stage.alias);
        }
        break;
      }

      case "summarize": {
        for (const col of stage.by) {
          if (!ctx.known.has(col)) {
            throw new QueryError(
              `Unknown column ${JSON.stringify(col)}. Available: ${[...ctx.known].sort().join(", ")}.`,
              stage.at,
            );
          }
        }
        const groups = new Map<string, { key: Row; rows: Row[] }>();
        for (const r of rows) {
          const key: Row = {};
          for (const col of stage.by) key[col] = r[col] ?? null;
          const k = stage.by.map((c) => String(r[c] ?? "")).join("\u0000");
          const existing = groups.get(k);
          if (existing) existing.rows.push(r);
          else groups.set(k, { key, rows: [r] });
        }
        // No `by` means one group over everything — `summarize count()` alone
        // must return a single row, not zero rows on an empty table.
        const buckets = stage.by.length ? [...groups.values()] : [{ key: {} as Row, rows }];
        rows = buckets.map((g) => {
          const out: Row = { ...g.key };
          for (const a of stage.aggs) out[a.alias] = aggregate(a.fn, a.args, g.rows, ctx, a.at);
          return out;
        });
        columns = [
          ...stage.by.map((name) => ({ name, type: COLUMNS[name] ?? ("string" as ColumnType) })),
          ...stage.aggs.map((a) => ({ name: a.alias, type: inferType(rows, a.alias) })),
        ];
        ctx.known = new Set(columns.map((c) => c.name));
        break;
      }

      case "project": {
        for (const col of stage.cols) {
          if (!ctx.known.has(col)) {
            throw new QueryError(
              `Unknown column ${JSON.stringify(col)}. Available: ${[...ctx.known].sort().join(", ")}.`,
              stage.at,
            );
          }
        }
        rows = rows.map((r) => {
          const out: Row = {};
          for (const c of stage.cols) out[c] = r[c] ?? null;
          return out;
        });
        columns = stage.cols.map((name) => ({
          name,
          type: columns.find((c) => c.name === name)?.type ?? "string",
        }));
        ctx.known = new Set(stage.cols);
        break;
      }

      case "distinct": {
        for (const col of stage.cols) {
          if (!ctx.known.has(col)) {
            throw new QueryError(
              `Unknown column ${JSON.stringify(col)}. Available: ${[...ctx.known].sort().join(", ")}.`,
              stage.at,
            );
          }
        }
        const seen = new Set<string>();
        const out: Row[] = [];
        for (const r of rows) {
          const k = stage.cols.map((c) => String(r[c] ?? "")).join("\u0000");
          if (seen.has(k)) continue;
          seen.add(k);
          const picked: Row = {};
          for (const c of stage.cols) picked[c] = r[c] ?? null;
          out.push(picked);
        }
        rows = out;
        columns = stage.cols.map((name) => ({
          name,
          type: columns.find((c) => c.name === name)?.type ?? "string",
        }));
        ctx.known = new Set(stage.cols);
        break;
      }

      case "order":
        for (const k of stage.keys) {
          if (!ctx.known.has(k.col)) {
            throw new QueryError(
              `Unknown column ${JSON.stringify(k.col)}. Available: ${[...ctx.known].sort().join(", ")}.`,
              k.at,
            );
          }
        }
        rows = [...rows].sort((a, b) => {
          for (const k of stage.keys) {
            const c = compareCells(a[k.col], b[k.col]);
            if (c !== 0) return k.desc ? -c : c;
          }
          return 0;
        });
        break;

      case "top":
        if (!ctx.known.has(stage.col)) {
          throw new QueryError(
            `Unknown column ${JSON.stringify(stage.col)}. Available: ${[...ctx.known].sort().join(", ")}.`,
            stage.at,
          );
        }
        rows = [...rows]
          .sort((a, b) => {
            const c = compareCells(a[stage.col], b[stage.col]);
            return stage.desc ? -c : c;
          })
          .slice(0, stage.n);
        break;

      case "take":
        explicitTake = stage.n;
        rows = rows.slice(0, stage.n);
        break;

      case "count":
        rows = [{ Count: rows.length }];
        columns = [{ name: "Count", type: "number" }];
        ctx.known = new Set(["Count"]);
        break;
    }
  }

  const totalRows = rows.length;
  return {
    columns,
    rows: rows.slice(0, explicitTake === null ? maxRows : Math.min(explicitTake, maxRows)),
    totalRows,
    scanned,
    tookMs: Date.now() - started,
  };
}

function compareCells(a: CellValue, b: CellValue): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  const na = typeof a === "string" && Number.isNaN(Number(a)) ? null : numeric(a);
  const nb = typeof b === "string" && Number.isNaN(Number(b)) ? null : numeric(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a).localeCompare(String(b));
}

function inferType(rows: Row[], col: string): ColumnType {
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined) continue;
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "bool";
    return COLUMNS[col] ?? "string";
  }
  return "string";
}

/* ------------------------------------------------------------------ *
 * Editor support                                                      *
 * ------------------------------------------------------------------ */

/** Starting points offered in the query blade, mirroring Azure's sample queries. */
export const SAMPLE_QUERIES: { name: string; description: string; query: string }[] = [
  {
    name: "Slowest operations",
    description: "The routes with the worst p95, and how much traffic each carries.",
    query: `requests
| summarize hits = count(), p95 = percentile(durationMs, 95), failures = countif(ok == false) by path
| order by p95 desc
| take 20`,
  },
  {
    name: "Failed requests by status",
    description: "What is failing, grouped by the status code the caller saw.",
    query: `requests
| where ok == false
| summarize failures = count(), routes = dcount(path) by status
| order by failures desc`,
  },
  {
    name: "Exceptions in the last hour",
    description: "Every exception since an hour ago, newest first.",
    query: `exceptions
| where at > ago(1h)
| project at, path, errorType, errorMessage, session
| order by at desc
| take 100`,
  },
  {
    name: "Requests per hour",
    description: "Traffic over time, bucketed — the shape every time chart starts from.",
    query: `requests
| extend hour = bin(at, 1h)
| summarize hits = count(), failed = countif(ok == false) by hour
| order by hour asc`,
  },
  {
    name: "Dependency health",
    description: "Which outbound services are slow or failing.",
    query: `dependencies
| summarize calls = count(), failed = countif(ok == false), p95 = percentile(durationMs, 95) by target
| order by p95 desc`,
  },
  {
    name: "Busiest sessions",
    description: "Sessions doing the most, useful when one client is generating the load.",
    query: `telemetry
| summarize events = count(), routes = dcount(path) by session
| order by events desc
| take 25`,
  },
  {
    name: "API errors only",
    description: "Server-side failures on API routes, with the message.",
    query: `requests
| where path startswith "/api" and status >= 500
| project at, method, path, status, durationMs, errorMessage
| order by at desc`,
  },
];

/**
 * Context-free completions for the editor.
 *
 * Deliberately not context-aware: a completion list that guesses wrong is
 * worse than one that offers everything, because the reader stops trusting it
 * and has to check the schema anyway.
 */
export function completions(): { label: string; kind: "table" | "operator" | "column" | "function" }[] {
  return [
    ...Object.keys(TABLES).map((label) => ({ label, kind: "table" as const })),
    ...["where", "summarize", "project", "extend", "order by", "top", "take", "distinct", "count", "by", "asc", "desc"].map(
      (label) => ({ label, kind: "operator" as const }),
    ),
    ...Object.keys(COLUMNS).map((label) => ({ label, kind: "column" as const })),
    ...[...AGG_FUNCS, ...SCALAR_FUNCS, "ago", "now"].map((label) => ({ label, kind: "function" as const })),
  ];
}
