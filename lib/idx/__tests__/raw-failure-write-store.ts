/**
 * TEST-ONLY helper (PR #584). NOT imported by production code — it lives under
 * `__tests__/` and is deliberately not named `*.test.ts`, so Jest's
 * `testMatch: ['**\/*.test.ts']` does not collect it as a suite.
 *
 * WHY THIS EXISTS
 * ---------------
 * `emitFailure` in `lib/idx/media-sync.ts` used to commit a failed attempt with
 * TWO Prisma calls: a unique-key `listingMedia.update` for the cooldown/status
 * and a separate guarded `listingMedia.updateMany` for the counter. Suites
 * therefore asserted on the Prisma OBJECTS those calls generated.
 *
 * That bookkeeping is now ONE parameterized `UPDATE ... RETURNING`, because the
 * split form had two proven defects (partial commit; tombstone decided from a
 * stale snapshot). There is no Prisma object left to inspect — so these suites
 * assert the STORED ROW instead, which is strictly stronger: it proves the
 * outcome rather than the intent.
 *
 * This store executes the statement so those assertions have a row to read. It
 * TOKENIZES, PARSES and EVALUATES the SQL against the stored rows — the result
 * is DERIVED from the statement the implementation actually emitted, never
 * asserted from a table of expected transitions. Wrong SQL therefore produces a
 * wrong stored row and fails the caller's assertions.
 *
 * It is fail-closed: any syntax it does not model THROWS rather than being
 * silently treated as "matched", so no construct can quietly make a test
 * vacuous. It deliberately does NOT match on SQL formatting — statements are
 * parsed, so whitespace and layout are irrelevant.
 *
 * THIS IS AN EMULATOR, NOT PostgreSQL. It is a deterministic regression
 * harness. The decisive proof of real database behaviour is
 * `media-sync-r2-postgres-concurrency.test.ts` (Layer 2), which runs against a
 * real PostgreSQL fork of production and is not affected by this file.
 */

/** The `listing_media` columns the failure path can read or write. */
export interface RawRowState {
  media_key: string;
  status: string;
  r2_attempts: number | null;
  r2_last_attempt_at: Date | null;
  r2_key: string | null;
  media_url_cached: string | null;
}

/**
 * One executed failure statement, recorded as the COMMITTED OUTCOME rather
 * than as a requested Prisma payload.
 */
export interface FailureWrite {
  media_key: string;
  /** False when the eligibility guard matched no row (e.g. already mirrored). */
  matched: boolean;
  /** The stored row BEFORE the statement. */
  before: RawRowState;
  /** The stored row AFTER the statement (=== `before` when unmatched). */
  after: RawRowState;
  /** Bound parameter values, in order — proof that values are DATA, not SQL. */
  params: unknown[];
}

type SqlValue = string | number | boolean | Date | null;

const SQL_KEYWORDS = new Set([
  "UPDATE", "SET", "WHERE", "RETURNING", "CASE", "WHEN", "THEN", "ELSE", "END",
  "AND", "OR", "NOT", "IS", "NULL", "DISTINCT", "FROM", "TRUE", "FALSE",
]);

type Token =
  | { kind: "kw"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "num"; value: number }
  | { kind: "str"; value: string }
  | { kind: "param"; index: number }
  | { kind: "op"; value: string };

/** Rebuild statement text, marking each interpolation slot as a parameter. */
function renderSql(strings: TemplateStringsArray | readonly string[]): string {
  let out = strings[0] ?? "";
  for (let i = 1; i < strings.length; i++) out += `$__P${i - 1}__${strings[i]}`;
  return out;
}

function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  const ops = ["::", ">=", "<=", "<>", "!=", "=", "<", ">", "+", "-", "(", ")", ","];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "'") {
      let j = i + 1;
      let out = "";
      for (;;) {
        if (j >= sql.length) throw new Error("Unterminated SQL string literal");
        if (sql[j] === "'" && sql[j + 1] === "'") { out += "'"; j += 2; continue; }
        if (sql[j] === "'") break;
        out += sql[j];
        j++;
      }
      tokens.push({ kind: "str", value: out });
      i = j + 1;
      continue;
    }
    const param = /^\$__P(\d+)__/.exec(sql.slice(i));
    if (param) {
      tokens.push({ kind: "param", index: Number(param[1]) });
      i += param[0].length;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const m = /^[0-9]+/.exec(sql.slice(i))!;
      tokens.push({ kind: "num", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i))!;
      const upper = m[0].toUpperCase();
      tokens.push(
        SQL_KEYWORDS.has(upper) ? { kind: "kw", value: upper } : { kind: "ident", value: m[0] },
      );
      i += m[0].length;
      continue;
    }
    const op = ops.find((o) => sql.startsWith(o, i));
    if (!op) throw new Error(`Unmodelled SQL character: ${JSON.stringify(ch)}`);
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

type SqlNode =
  | { t: "col"; name: string }
  | { t: "lit"; value: SqlValue }
  | { t: "param"; index: number }
  | { t: "cast"; expr: SqlNode; to: string }
  | { t: "bin"; op: string; l: SqlNode; r: SqlNode }
  | { t: "isNull"; expr: SqlNode; negated: boolean }
  | { t: "isDistinct"; l: SqlNode; r: SqlNode; negated: boolean }
  | { t: "not"; expr: SqlNode }
  | { t: "case"; whens: Array<{ when: SqlNode; then: SqlNode }>; otherwise: SqlNode | null };

interface UpdateStatement {
  table: string;
  sets: Array<{ col: string; expr: SqlNode }>;
  where: SqlNode;
  returning: string[];
}

function parseUpdate(tokens: Token[]): UpdateStatement {
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const isKw = (v: string) => { const t = peek(); return t?.kind === "kw" && t.value === v; };
  const isOp = (v: string) => { const t = peek(); return t?.kind === "op" && t.value === v; };
  const takeKw = (v: string) => {
    if (!isKw(v)) throw new Error(`Expected SQL keyword ${v} at token ${pos}`);
    pos++;
  };
  const takeOp = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected SQL operator ${v} at token ${pos}`);
    pos++;
  };
  const takeIdent = (): string => {
    const t = peek();
    if (t?.kind !== "ident") throw new Error(`Expected identifier at token ${pos}`);
    pos++;
    return t.value;
  };

  function parsePrimary(): SqlNode {
    const t = peek();
    if (!t) throw new Error("Unexpected end of SQL");
    if (t.kind === "kw" && t.value === "CASE") {
      pos++;
      const whens: Array<{ when: SqlNode; then: SqlNode }> = [];
      while (isKw("WHEN")) {
        pos++;
        const when = parseExpr();
        takeKw("THEN");
        whens.push({ when, then: parseExpr() });
      }
      let otherwise: SqlNode | null = null;
      if (isKw("ELSE")) { pos++; otherwise = parseExpr(); }
      takeKw("END");
      if (whens.length === 0) throw new Error("CASE with no WHEN branch");
      return { t: "case", whens, otherwise };
    }
    if (t.kind === "kw" && t.value === "NULL") { pos++; return { t: "lit", value: null }; }
    if (t.kind === "kw" && (t.value === "TRUE" || t.value === "FALSE")) {
      pos++;
      return { t: "lit", value: t.value === "TRUE" };
    }
    if (t.kind === "op" && t.value === "(") {
      pos++;
      const inner = parseExpr();
      takeOp(")");
      return inner;
    }
    if (t.kind === "num") { pos++; return { t: "lit", value: t.value }; }
    if (t.kind === "str") { pos++; return { t: "lit", value: t.value }; }
    if (t.kind === "param") { pos++; return { t: "param", index: t.index }; }
    if (t.kind === "ident") { pos++; return { t: "col", name: t.value }; }
    throw new Error(`Unmodelled SQL token in expression: ${JSON.stringify(t)}`);
  }

  function parseCast(): SqlNode {
    let node = parsePrimary();
    while (isOp("::")) {
      pos++;
      node = { t: "cast", expr: node, to: takeIdent().toLowerCase() };
    }
    return node;
  }

  function parseAdditive(): SqlNode {
    let node = parseCast();
    while (isOp("+") || isOp("-")) {
      const op = (peek() as { value: string }).value;
      pos++;
      node = { t: "bin", op, l: node, r: parseCast() };
    }
    return node;
  }

  function parseComparison(): SqlNode {
    const left = parseAdditive();
    if (isKw("IS")) {
      pos++;
      const negated = isKw("NOT") ? (pos++, true) : false;
      if (isKw("NULL")) { pos++; return { t: "isNull", expr: left, negated }; }
      if (isKw("DISTINCT")) {
        pos++;
        takeKw("FROM");
        return { t: "isDistinct", l: left, r: parseAdditive(), negated };
      }
      throw new Error("Unmodelled SQL: IS <something other than NULL / DISTINCT FROM>");
    }
    for (const op of ["=", "<>", "!=", "<=", ">=", "<", ">"]) {
      if (isOp(op)) {
        pos++;
        return { t: "bin", op, l: left, r: parseAdditive() };
      }
    }
    return left;
  }

  function parseNot(): SqlNode {
    if (isKw("NOT")) { pos++; return { t: "not", expr: parseNot() }; }
    return parseComparison();
  }

  function parseAnd(): SqlNode {
    let node = parseNot();
    while (isKw("AND")) { pos++; node = { t: "bin", op: "AND", l: node, r: parseNot() }; }
    return node;
  }

  function parseExpr(): SqlNode {
    let node = parseAnd();
    while (isKw("OR")) { pos++; node = { t: "bin", op: "OR", l: node, r: parseAnd() }; }
    return node;
  }

  takeKw("UPDATE");
  const table = takeIdent();
  takeKw("SET");
  const sets: Array<{ col: string; expr: SqlNode }> = [];
  for (;;) {
    const col = takeIdent();
    takeOp("=");
    sets.push({ col, expr: parseExpr() });
    if (isOp(",")) { pos++; continue; }
    break;
  }
  takeKw("WHERE");
  const where = parseExpr();
  takeKw("RETURNING");
  const returning: string[] = [takeIdent()];
  while (isOp(",")) { pos++; returning.push(takeIdent()); }
  if (pos !== tokens.length) throw new Error(`Trailing SQL after RETURNING at token ${pos}`);
  return { table, sets, where, returning };
}

function evalSql(node: SqlNode, state: RawRowState, params: unknown[]): SqlValue {
  switch (node.t) {
    case "lit":
      return node.value;
    case "param": {
      if (node.index >= params.length) throw new Error(`SQL parameter $${node.index} not supplied`);
      return params[node.index] as SqlValue;
    }
    case "col": {
      if (!(node.name in state)) throw new Error(`Unmodelled column in SQL: ${node.name}`);
      return (state as unknown as Record<string, SqlValue>)[node.name]!;
    }
    case "cast": {
      const v = evalSql(node.expr, state, params);
      if (v === null) return null;
      if (node.to === "boolean") {
        if (typeof v === "boolean") return v;
        throw new Error(`Cannot cast ${JSON.stringify(v)} to boolean`);
      }
      throw new Error(`Unmodelled SQL cast target: ${node.to}`);
    }
    case "isNull": {
      const v = evalSql(node.expr, state, params);
      return node.negated ? v !== null : v === null;
    }
    case "isDistinct": {
      const l = evalSql(node.l, state, params);
      const r = evalSql(node.r, state, params);
      const distinct = l !== r;
      return node.negated ? !distinct : distinct;
    }
    case "not": {
      const v = evalSql(node.expr, state, params);
      return v === null ? null : !v;
    }
    case "case": {
      for (const branch of node.whens) {
        if (evalSql(branch.when, state, params) === true) return evalSql(branch.then, state, params);
      }
      return node.otherwise ? evalSql(node.otherwise, state, params) : null;
    }
    case "bin": {
      const l = evalSql(node.l, state, params);
      // SQL short-circuit: FALSE AND x is FALSE; TRUE OR x is TRUE.
      if (node.op === "AND" && l === false) return false;
      if (node.op === "OR" && l === true) return true;
      const r = evalSql(node.r, state, params);
      if (node.op === "AND") return l === null || r === null ? null : l && r;
      if (node.op === "OR") return l === null || r === null ? null : l || r;
      // Any comparison or arithmetic involving NULL yields NULL.
      if (l === null || r === null) return null;
      switch (node.op) {
        case "+": return (l as number) + (r as number);
        case "-": return (l as number) - (r as number);
        case "=": return l === r;
        case "<>":
        case "!=": return l !== r;
        case "<": return (l as number) < (r as number);
        case "<=": return (l as number) <= (r as number);
        case ">": return (l as number) > (r as number);
        case ">=": return (l as number) >= (r as number);
        default: throw new Error(`Unmodelled SQL operator: ${node.op}`);
      }
    }
  }
}

function defaultRow(mediaKey: string): RawRowState {
  return {
    media_key: mediaKey,
    status: "active",
    r2_attempts: null,
    r2_last_attempt_at: null,
    r2_key: null,
    media_url_cached: null,
  };
}

export interface RawUpdateStore {
  /** Set (or reset) a row's starting state. Returns the stored row. */
  seed(mediaKey: string, fields?: Partial<RawRowState>): RawRowState;
  /** Current stored row; auto-created with defaults if never seeded. */
  row(mediaKey: string): RawRowState;
  /** Every executed failure statement, as committed outcomes. */
  writes: FailureWrite[];
  /** Statements recorded for a single media_key. */
  writesFor(mediaKey: string): FailureWrite[];
  /** Wire as the mocked `prisma.$queryRaw`. */
  exec(strings: TemplateStringsArray, values: unknown[]): Promise<Array<Record<string, SqlValue>>>;
  /** Apply a successful-mirror `listingMedia.update` payload to the store. */
  applyPrismaUpdate(args: unknown): void;
  reset(): void;
}

/**
 * A multi-row `listing_media` store with PostgreSQL statement semantics: the
 * WHERE is evaluated against the value stored at the moment the statement runs,
 * every SET expression is evaluated against the row as it stood BEFORE the
 * write, and only matched rows are written.
 */
export function createRawUpdateStore(
  /** Supplies a starting row for a media_key first seen by a statement. */
  seedFrom: (mediaKey: string) => Partial<RawRowState> | undefined = () => undefined,
): RawUpdateStore {
  const rows = new Map<string, RawRowState>();
  const writes: FailureWrite[] = [];

  const row = (mediaKey: string): RawRowState => {
    let r = rows.get(mediaKey);
    if (!r) {
      r = { ...defaultRow(mediaKey), ...(seedFrom(mediaKey) ?? {}) };
      rows.set(mediaKey, r);
    }
    return r;
  };

  return {
    writes,
    seed(mediaKey, fields = {}) {
      const r = { ...defaultRow(mediaKey), ...fields, media_key: mediaKey };
      rows.set(mediaKey, r);
      return r;
    },
    row,
    writesFor(mediaKey) {
      return writes.filter((w) => w.media_key === mediaKey);
    },
    applyPrismaUpdate(args) {
      const { where, data } = args as {
        where: { media_key?: string };
        data: Record<string, unknown>;
      };
      if (!where?.media_key) return;
      const r = row(where.media_key);
      for (const [k, v] of Object.entries(data ?? {})) {
        if (k in r) (r as unknown as Record<string, unknown>)[k] = v;
      }
    },
    async exec(strings, values) {
      const stmt = parseUpdate(tokenizeSql(renderSql(strings)));
      if (stmt.table !== "listing_media") {
        throw new Error(`Unmodelled table in raw statement: ${stmt.table}`);
      }
      // The media key always arrives as a BOUND VALUE. Resolving the target
      // through the parameter list (never through the SQL text) is what proves
      // a SQL-shaped key cannot reach another row.
      const keyParam = values.find((v) => typeof v === "string");
      const target = row(String(keyParam));
      const before: RawRowState = { ...target };

      const matched = evalSql(stmt.where, target, values) === true;
      if (!matched) {
        writes.push({ media_key: target.media_key, matched: false, before, after: { ...before }, params: [...values] });
        return [];
      }

      // Compute EVERY new value from the pre-update row before applying any.
      const next: Record<string, SqlValue> = {};
      for (const { col, expr } of stmt.sets) {
        if (!(col in target)) throw new Error(`Unmodelled column in SET: ${col}`);
        next[col] = evalSql(expr, target, values);
      }
      Object.assign(target, next);
      writes.push({ media_key: target.media_key, matched: true, before, after: { ...target }, params: [...values] });

      const out: Record<string, SqlValue> = {};
      for (const col of stmt.returning) {
        if (!(col in target)) throw new Error(`Unmodelled column in RETURNING: ${col}`);
        out[col] = (target as unknown as Record<string, SqlValue>)[col]!;
      }
      return [out];
    },
    reset() {
      rows.clear();
      writes.length = 0;
    },
  };
}
