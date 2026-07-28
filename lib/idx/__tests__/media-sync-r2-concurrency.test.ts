/**
 * PR #584 — LAYER 1: stateful proofs of the four `r2_attempts` failure-path defects.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `media-sync-r2.test.ts`
 * -----------------------------------------------------------
 * The assertions already in `media-sync-r2.test.ts` inspect the Prisma object
 * that `emitFailure` GENERATES (`usedLiteralAssignment`, `tombstoned`, WHERE-clause
 * `toMatchObject`). That proves intent, not behaviour. Its `makeSimulatedRow`
 * helper models ONLY the counter `updateMany`; it never applies the preceding
 * `listingMedia.update`, and it holds no `status` / `r2_key` / `media_url_cached`.
 * Three of the four defects below are therefore structurally invisible to it —
 * they live in the interaction BETWEEN the two writes, or in the row fields that
 * helper does not model.
 *
 * The store here is different in kind: it holds the WHOLE row, and it applies
 * every operation the code issues, in the order issued, evaluating each WHERE
 * against the value stored RIGHT NOW. Assertions are made on the resulting
 * STORED ROW, never on the shape of a generated Prisma object.
 *
 * ACKNOWLEDGED LIMIT OF LAYER 1 — READ BEFORE TRUSTING A PASS
 * -----------------------------------------------------------
 * This is still a JavaScript simulation written by the same author as the
 * implementation, so it can faithfully reproduce a wrong assumption about what
 * PostgreSQL does. A pass here is necessary, NOT sufficient. The decisive proof
 * is Layer 2 (`media-sync-r2-postgres-concurrency.test.ts`): the stored row in a
 * real PostgreSQL database after controlled concurrent transactions.
 *
 * Note also that if the corrected implementation moves to a raw parameterized
 * `UPDATE`, this store's Prisma-operation model will need EXTENDING to interpret
 * that statement. Extending the store is mock infrastructure. Relaxing, removing,
 * narrowing or skipping any assertion below is not, and is precisely what the
 * commit-ordering guardrail exists to catch.
 *
 * EXPECTED RESULT ON HEAD 2a8eef8d81: ALL FOUR TESTS FAIL.
 * A test in this file that passes against that head is not exposing its defect
 * and must be strengthened before any implementation work begins.
 *
 * NO live R2, Trestle, or database access. Layer 1 is pure simulation.
 */

import type { MirrorMediaToR2Deps, MirrorMediaToR2Row } from "../media-sync";

// ─── Mock Prisma ──────────────────────────────────────────────────────────

const mockListingMediaUpdate = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaUpdateMany = jest.fn<Promise<unknown>, [unknown]>();
const mockQueryRaw = jest.fn<Promise<unknown>, [TemplateStringsArray, unknown[]]>();

jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    listingMedia: {
      update: (args: unknown) => mockListingMediaUpdate(args),
      updateMany: (args: unknown) => mockListingMediaUpdateMany(args),
    },
    // MOCK INFRASTRUCTURE (harness extension): the corrected implementation
    // commits failure bookkeeping as ONE parameterized statement. Prisma
    // exposes that as a tagged template, so the mock receives the static
    // string fragments and the interpolated values SEPARATELY — which is
    // itself the proof that no value is ever concatenated into SQL text.
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) =>
      mockQueryRaw(strings, values),
  },
}));

// Imported AFTER the prisma mock is wired up.
import { mirrorMediaToR2 } from "../media-sync";

beforeEach(() => {
  mockListingMediaUpdate.mockReset();
  mockListingMediaUpdateMany.mockReset();
  mockQueryRaw.mockReset();
});

// ─── Stateful single-row store ────────────────────────────────────────────

const MEDIA_KEY = "MK-CONCURRENCY-1";
const LISTING_ID = "RLS20012345";

/** The `listing_media` columns this failure path can read or write. */
interface RowState {
  media_key: string;
  status: string;
  r2_attempts: number | null;
  r2_last_attempt_at: Date | null;
  r2_key: string | null;
  media_url_cached: string | null;
}

/**
 * Evaluate one Prisma field predicate against the CURRENTLY stored value.
 * Deliberately throws on anything it does not model, so a future predicate
 * cannot be silently treated as "matched" (which would make a test vacuous).
 */
function fieldMatches(stored: unknown, predicate: unknown): boolean {
  if (predicate === null) return stored === null;
  if (typeof predicate === "object" && predicate !== undefined) {
    const p = predicate as Record<string, unknown>;
    if ("lt" in p) return typeof stored === "number" && stored < (p.lt as number);
    if ("lte" in p) return typeof stored === "number" && stored <= (p.lte as number);
    if ("gt" in p) return typeof stored === "number" && stored > (p.gt as number);
    if ("gte" in p) return typeof stored === "number" && stored >= (p.gte as number);
    if ("equals" in p) return stored === p.equals;
    if ("not" in p) return stored !== p.not;
    throw new Error(`Unmodelled Prisma predicate: ${JSON.stringify(predicate)}`);
  }
  return stored === predicate;
}

/** AND across fields, with `OR` supported as an array of sub-wheres. */
function whereMatches(state: RowState, where: Record<string, unknown>): boolean {
  for (const [field, predicate] of Object.entries(where ?? {})) {
    if (field === "OR") {
      const branches = predicate as Record<string, unknown>[];
      if (!branches.some((b) => whereMatches(state, b))) return false;
      continue;
    }
    if (field === "AND") {
      const branches = predicate as Record<string, unknown>[];
      if (!branches.every((b) => whereMatches(state, b))) return false;
      continue;
    }
    if (!(field in state)) {
      throw new Error(`Unmodelled column in WHERE: ${field}`);
    }
    if (!fieldMatches((state as unknown as Record<string, unknown>)[field], predicate)) {
      return false;
    }
  }
  return true;
}

/** Apply a Prisma `data` payload, honouring `{ increment }`. */
function applyData(state: RowState, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data ?? {})) {
    if (!(field in state)) {
      throw new Error(`Unmodelled column in data: ${field}`);
    }
    const target = state as unknown as Record<string, unknown>;
    if (value !== null && typeof value === "object" && "increment" in (value as object)) {
      const inc = (value as { increment: number }).increment;
      target[field] = ((target[field] as number | null) ?? 0) + inc;
      continue;
    }
    target[field] = value;
  }
}

// ─── Minimal parameterized-SQL emulator (MOCK INFRASTRUCTURE) ─────────────
//
// The corrected implementation commits failure bookkeeping as ONE parameterized
// `UPDATE ... RETURNING`. To keep this layer a real regression harness rather
// than a rubber stamp, the statement is TOKENIZED, PARSED and EVALUATED against
// the stored row — the outcome is derived from the SQL the implementation
// actually emitted, not asserted from a table of expected transitions. Wrong
// SQL therefore produces a wrong stored row and fails the assertions below.
//
// It is deliberately fail-closed: any syntax it does not model THROWS, exactly
// like `fieldMatches` does for an unmodelled Prisma predicate, so no construct
// can be silently treated as "matched" and make a test vacuous.
//
// THIS IS AN EMULATOR, NOT PostgreSQL. It encodes this author's understanding
// of the semantics and is NOT independent proof of what the database does.
// That proof is Layer 2 and only Layer 2.

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

/** Rebuild the statement text, marking each interpolation slot as a parameter. */
function renderSql(strings: TemplateStringsArray): string {
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

function evalSql(node: SqlNode, state: RowState, params: unknown[]): SqlValue {
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
      const distinct = l === null || r === null ? l !== r : l !== r;
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
      // SQL short-circuit: FALSE AND x is FALSE, TRUE OR x is TRUE.
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

/**
 * One `listing_media` row with PostgreSQL-like statement semantics:
 * every WHERE is evaluated against the value stored at the moment the
 * statement runs, and only a matched row is written.
 */
function makeRowStore(
  initial: Partial<RowState> = {},
  /**
   * MOCK INFRASTRUCTURE. `blockAttemptsChange` is the JS analogue of the
   * `pr584_block_attempts_change` BEFORE UPDATE trigger Layer 2 installs on a
   * real database: any statement whose write would change `r2_attempts` raises
   * BEFORE any part of that statement is applied.
   *
   * It is deliberately path-agnostic, so ONE mechanism exercises BOTH shapes:
   *   - split implementation: write #1 sets only the cooldown (and possibly the
   *     status), leaves `r2_attempts` alone, and therefore COMMITS; the separate
   *     counter statement is then refused — reproducing the partial commit;
   *   - atomic implementation: the single statement carries the counter with the
   *     cooldown, so it is refused as a whole and nothing is written.
   */
  options: { blockAttemptsChange?: boolean } = {},
) {
  const state: RowState = {
    media_key: MEDIA_KEY,
    status: "active",
    r2_attempts: null,
    r2_last_attempt_at: null,
    r2_key: null,
    media_url_cached: null,
    ...initial,
  };

  /** Ordered log of the statements the implementation issued. */
  const ops: Array<{ op: "update" | "updateMany" | "queryRaw"; matched: boolean }> = [];

  /** The trigger analogue — see `options.blockAttemptsChange`. */
  const guardAttempts = (next: number | null): void => {
    if (!options.blockAttemptsChange) return;
    if (next === state.r2_attempts) return;
    throw new Error("PR584_TEST_TRIGGER: r2_attempts change blocked by the counter statement guard");
  };

  /** What `r2_attempts` would become under a Prisma `data` payload. */
  const prospectiveFromData = (data: Record<string, unknown>): number | null => {
    if (!("r2_attempts" in (data ?? {}))) return state.r2_attempts;
    const v = data.r2_attempts;
    if (v !== null && typeof v === "object" && "increment" in (v as object)) {
      return (state.r2_attempts ?? 0) + (v as { increment: number }).increment;
    }
    return v as number | null;
  };

  const update = async (args: unknown) => {
    const { where, data } = args as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    const matched = whereMatches(state, where);
    ops.push({ op: "update", matched });
    if (!matched) {
      // Prisma raises P2025 when `update` matches no row.
      const err = new Error("No record was found for an update.") as Error & { code?: string };
      err.code = "P2025";
      throw err;
    }
    guardAttempts(prospectiveFromData(data));
    applyData(state, data);
    return { ...state };
  };

  const updateMany = async (args: unknown) => {
    const { where, data } = args as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    const matched = whereMatches(state, where);
    ops.push({ op: "updateMany", matched });
    if (!matched) return { count: 0 };
    guardAttempts(prospectiveFromData(data));
    applyData(state, data);
    return { count: 1 };
  };

  /**
   * Execute one parameterized `UPDATE ... RETURNING` against the stored row.
   * Every SET expression is evaluated against the row as it stands BEFORE the
   * statement writes (PostgreSQL semantics), so a self-referencing counter
   * advance reads its own pre-update value exactly once.
   */
  const queryRaw = async (strings: TemplateStringsArray, values: unknown[]) => {
    const stmt = parseUpdate(tokenizeSql(renderSql(strings)));
    if (stmt.table !== "listing_media") {
      throw new Error(`Unmodelled table in raw statement: ${stmt.table}`);
    }
    const matched = evalSql(stmt.where, state, values) === true;
    ops.push({ op: "queryRaw", matched });
    if (!matched) return [];

    // Compute EVERY new value from the pre-update row before applying any.
    const next: Record<string, SqlValue> = {};
    for (const { col, expr } of stmt.sets) {
      if (!(col in state)) throw new Error(`Unmodelled column in SET: ${col}`);
      next[col] = evalSql(expr, state, values);
    }
    guardAttempts(
      "r2_attempts" in next ? (next.r2_attempts as number | null) : state.r2_attempts,
    );
    Object.assign(state, next);

    const row: Record<string, SqlValue> = {};
    for (const col of stmt.returning) {
      if (!(col in state)) throw new Error(`Unmodelled column in RETURNING: ${col}`);
      row[col] = (state as unknown as Record<string, SqlValue>)[col]!;
    }
    return [row];
  };

  return { state, ops, update, updateMany, queryRaw };
}

function wire(store: ReturnType<typeof makeRowStore>): void {
  mockListingMediaUpdate.mockImplementation(store.update);
  mockListingMediaUpdateMany.mockImplementation(store.updateMany);
  mockQueryRaw.mockImplementation(store.queryRaw);
}

// ─── Row snapshots + dependency stubs ─────────────────────────────────────

/**
 * A batch-selection snapshot. This is the value a worker read BEFORE any of
 * the writes below happened — the staleness is the point, not an oversight.
 */
function makeRow(overrides: Partial<MirrorMediaToR2Row> = {}): MirrorMediaToR2Row {
  return {
    listing_id: LISTING_ID,
    media_key: MEDIA_KEY,
    media_type: "Photo",
    order: 1,
    media_url_original: "https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/100/1/abc",
    r2_key: null,
    media_url_cached: null,
    ...overrides,
  };
}

/**
 * LIVE-OBSERVED Cotality media responses.
 *
 * Captured 2026-07-28 by direct authenticated GET against
 * `TRESTLE_API_URL` media URLs sampled from `listing_media` (100 requests,
 * 25 each across: r2_attempts > 9 · 1..7 · exactly 8 · already-mirrored).
 * These fixtures are the real bodies and content types the feed returned —
 * they are not invented status codes.
 *
 *   HTTP 404 application/json  34/100  — two distinct message bodies, below
 *   HTTP 200 application/pdf    9/100  — a PDF served where an image was expected
 *   HTTP 200 text/html          8/100  — an app-shell / video landing page
 *   timeout (no response)      13/100  — all in the r2_attempts > 9 population
 *   HTTP 200 image/jpeg        36/100  — healthy media
 *
 * NOT OBSERVED in that probe: HTTP 410 (0/100) and any 5xx (0/100). The
 * implementation treats 410 as tombstone-eligible by RFC semantics; that is a
 * DEFENSIVE contract, not a live-proven one, and is labelled as such wherever
 * it is exercised below. No test in this file claims live proof for 410.
 */
const LIVE_404_MEDIA_GONE =
  '{"code":"404","message":"ERROR - External media was not downloaded.","target":null,"details":null,"innerError":null,"instanceAnnotations":[],"typeAnnotation":null}';
const LIVE_404_NO_RECORD =
  '{"code":"404","message":"Media record not found!","target":null,"details":null,"innerError":null,"instanceAnnotations":[],"typeAnnotation":null}';

function makeFetchResponse(status: number, contentType?: string, body?: string): Response {
  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  return new Response(body ? new TextEncoder().encode(body) : new Uint8Array(0), { status, headers });
}

function makeDeps(response: Response): MirrorMediaToR2Deps {
  return {
    existsInR2: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(false),
    uploadToR2: jest
      .fn<Promise<string>, [string, Buffer, string]>()
      .mockImplementation(async (key) => `https://r2.example.com/${key}`),
    getR2PublicUrl: jest.fn<string, [string]>().mockImplementation((key) => `https://r2.example.com/${key}`),
    getAccessToken: jest.fn<Promise<string>, []>().mockResolvedValue("test-token"),
    fetchFn: jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockImplementation(async () => response.clone()),
  };
}

/**
 * LIVE-OBSERVED permanent failure (34/100 on 2026-07-28): HTTP 404 with the
 * Trestle JSON error body. Tombstone-eligible.
 */
const permanentDeps = (body: string = LIVE_404_MEDIA_GONE) =>
  makeDeps(makeFetchResponse(404, "application/json; charset=utf-8", body));

/**
 * LIVE-OBSERVED non-tombstoning failure (17/100 on 2026-07-28): the fetch
 * SUCCEEDS but returns a non-image payload, so the row still records a failed
 * attempt and must never be tombstoned. Used wherever a test needs "a failure
 * that is not proven-permanent" — deliberately in place of an invented 5xx,
 * which the probe never observed.
 */
const nonImageDeps = () => makeDeps(makeFetchResponse(200, "application/pdf", "%PDF-1.6"));

// ──────────────────────────────────────────────────────────────────────────
// DEFECT 1 — failure bookkeeping is split across two writes
// ──────────────────────────────────────────────────────────────────────────

describe("DEFECT 1 — cooldown/status and counter must not partially commit", () => {
  it("a failed counter statement must leave the cooldown unwritten", async () => {
    // FAULT INJECTION (mock infrastructure): refuse any write that would change
    // `r2_attempts` — the JS analogue of the BEFORE UPDATE trigger Layer 2
    // installs on a real database. ONE mechanism, deliberately path-agnostic,
    // so it indicts a split implementation and exonerates an atomic one:
    //   - split: write #1 carries only the cooldown (and possibly the status),
    //     does not touch the counter, and therefore COMMITS; the separate
    //     counter statement is then refused — the partial commit this test
    //     exists to catch, exactly as a dropped connection or killed process
    //     would produce between two independent statements;
    //   - atomic: the counter travels WITH the cooldown in one statement, so
    //     the refusal aborts the whole statement and nothing is written.
    const store = makeRowStore({ r2_attempts: 2 }, { blockAttemptsChange: true });
    wire(store);

    await expect(mirrorMediaToR2(makeRow({ r2_attempts: 2 }), nonImageDeps())).rejects.toThrow(
      /counter statement/,
    );

    // The cooldown, the status and the counter are ONE logical fact about ONE
    // failed attempt. If the counter did not advance, nothing may have been
    // written: the row must be exactly as it was found.
    expect(store.state.r2_last_attempt_at).toBeNull();
    expect(store.state.r2_attempts).toBe(2);
    expect(store.state.status).toBe("active");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DEFECT 2 — tombstoning decided from a stale snapshot count
// ──────────────────────────────────────────────────────────────────────────

describe("DEFECT 2 — the tombstone must follow the advanced count, not the snapshot", () => {
  it("two overlapping permanent 404s from 1 serialize to 3 and tombstone on the third", async () => {
    const store = makeRowStore({ r2_attempts: 1 });
    wire(store);

    // DETERMINISTIC BARRIER: both workers selected this row at r2_attempts = 1
    // before either had written. Issuing their statements in sequence, each
    // still carrying that same stale snapshot, reproduces the overlap exactly
    // without depending on scheduling luck.
    const staleSnapshot = () => makeRow({ r2_attempts: 1 });
    await mirrorMediaToR2(staleSnapshot(), permanentDeps());
    await mirrorMediaToR2(staleSnapshot(), permanentDeps());

    // The counter is atomic, so it reaches 3 on either implementation.
    expect(store.state.r2_attempts).toBe(3);
    // The statement that PRODUCED 3 is the third permanent failure, so it must
    // apply the documented tombstone. Deciding from the snapshot makes both
    // workers compute 2, and the row survives its third permanent failure.
    expect(store.state.status).toBe("deleted");
  });

  it("a third NON-permanent failure still does not tombstone", async () => {
    const store = makeRowStore({ r2_attempts: 2 });
    wire(store);

    // Live-observed signature: HTTP 200 with a non-image payload. The attempt
    // failed, so the counter advances — but nothing proved the binary is gone,
    // so the row must stay active.
    await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), nonImageDeps());

    expect(store.state.r2_attempts).toBe(3);
    expect(store.state.status).toBe("active");
  });

  it("both live 404 body variants are treated as permanent", async () => {
    // The probe returned TWO distinct 404 messages — "ERROR - External media
    // was not downloaded." and "Media record not found!". The tombstone rule
    // keys on the HTTP status, not the message, so both must behave alike.
    for (const body of [LIVE_404_MEDIA_GONE, LIVE_404_NO_RECORD]) {
      const store = makeRowStore({ r2_attempts: 2 });
      wire(store);

      await mirrorMediaToR2(makeRow({ r2_attempts: 2 }), permanentDeps(body));

      expect(store.state.r2_attempts).toBe(3);
      expect(store.state.status).toBe("deleted");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DEFECT 3 — a stale failure overwrites a committed success
// ──────────────────────────────────────────────────────────────────────────

describe("DEFECT 3 — a committed success must win over an in-flight stale failure", () => {
  it("the stale failure statement must match zero rows and change nothing", async () => {
    const store = makeRowStore({ r2_attempts: 2 });
    wire(store);

    // The failure worker read the row while it was still unmirrored.
    const staleSnapshot = makeRow({ r2_attempts: 2, r2_key: null, media_url_cached: null });

    // DETERMINISTIC BARRIER: the success commits FIRST, in full — r2_key and
    // media_url_cached written, counter reset, cooldown cleared.
    store.state.r2_key = `listings/${LISTING_ID}/Photo/${MEDIA_KEY}.jpg`;
    store.state.media_url_cached = `https://r2.example.com/listings/${LISTING_ID}/Photo/${MEDIA_KEY}.jpg`;
    store.state.r2_attempts = 0;
    store.state.r2_last_attempt_at = null;
    const committed: RowState = { ...store.state };

    // Only now is the stale failure released.
    await mirrorMediaToR2(staleSnapshot, permanentDeps());

    // Individually asserted so a failure names the column that was clobbered.
    expect(store.state.status).toBe("active");
    expect(store.state.r2_key).toBe(committed.r2_key);
    expect(store.state.media_url_cached).toBe(committed.media_url_cached);
    expect(store.state.r2_attempts).toBe(0);
    expect(store.state.r2_last_attempt_at).toBeNull();
    // And as a whole row, so no unlisted column drifts either.
    expect(store.state).toEqual(committed);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// DEFECT 4 — NULL undercount
// ──────────────────────────────────────────────────────────────────────────

describe("DEFECT 4 — two failures from NULL must store 2", () => {
  it("does not lose the second failure to a still-NULL guard", async () => {
    const store = makeRowStore({ r2_attempts: null });
    wire(store);

    // Same deterministic barrier: both workers snapshotted r2_attempts = NULL.
    const staleSnapshot = () => makeRow({ r2_attempts: null });
    await mirrorMediaToR2(staleSnapshot(), nonImageDeps());
    await mirrorMediaToR2(staleSnapshot(), nonImageDeps());

    // Two real failures happened, so the stored count is 2. A guard of
    // `WHERE r2_attempts IS NULL` matches zero rows on the second statement
    // and silently discards that failure, storing 1.
    expect(store.state.r2_attempts).toBe(2);
  });
});
