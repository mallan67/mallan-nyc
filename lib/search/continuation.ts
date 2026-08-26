import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * SEQUENTIAL CONTINUATION FOR THE FINAL SEARCH UNIVERSE.
 *
 * The read budget bounds how much ONE request may read. It must not bound how
 * much inventory is searchable — the authorized provider population is already
 * around 591,000 rows for `Permission eq 'IDX'`, and historical/CMA workflows
 * make deep traversal a real requirement rather than a theoretical one.
 *
 * So "Next" carries a continuation: a POSITION IN THE ORDER to resume after,
 * instead of re-walking from the start and hitting the same ceiling forever.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TOKEN IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * It is a POSITION, not an authority. It says "resume after this point in the
 * ordering, having already emitted S survivors". It carries no criteria, no
 * permissions and no rows. Every request re-applies the whole chain from the
 * request's own parameters: the canonical criteria, the Mallan return-copy
 * suppression, the distribution gates, provider-row dedupe. A token cannot
 * widen a search, skip a gate, or reach a listing the caller could not
 * otherwise reach.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CLAIM OF MINE THAT WAS WRONG, corrected here rather than quietly dropped.
 *
 * I wrote that the token "has no authority worth forging" and therefore needed
 * no secret. That was too comfortable. It grants no access to unauthorized
 * listings — but it DOES control which authorized rows a broker is told belong
 * to the next page, and silently changing or skipping a brokerage result
 * sequence is itself an integrity problem. An unsigned payload whose position
 * was edited to another structurally valid value and re-encoded was accepted,
 * which is exactly what a buggy or hostile caller produces.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SO: SEALED, OR NOT OFFERED AT ALL.
 *
 * Tokens are HMAC-sealed with SEARCH_CONTINUATION_SECRET. If that secret is not
 * configured, continuation is not offered — `isContinuationAvailable()` returns
 * false, no token is minted, and pagination falls back to the bounded rescan.
 * The tamperable surface simply does not exist unsigned.
 *
 * ⚠ PROTECTED BOUNDARY: adding SEARCH_CONTINUATION_SECRET is an env change and
 * therefore needs explicit authorization. It is RECORDED here as a requirement
 * rather than quietly assumed. Until it is set, deep sequential traversal runs
 * on the bounded rescan alone.
 *
 * WHY NOT REUSE AN EXISTING SECRET. The repo has exactly three HMAC
 * authorities — lib/auth/reset-token.ts, lib/email/unsubscribe-token.ts and
 * lib/tracking/listing-token.ts — and every one is business-specific. Sealing a
 * search cursor with the unsubscribe secret would tie two unrelated systems'
 * key rotation together and widen the blast radius of either one leaking. A
 * dedicated key is the correct answer, not a convenient one.
 *
 * It is ALSO fingerprint-validated, because the failure that actually happens is
 * mundane: a token from a different search, sort or page size silently
 * producing a page of the wrong universe. That is refused by name.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A BOUNDED TAIL IS ENOUGH FOR CROSS-BOUNDARY DEDUPE.
 *
 * Provider twins share a ListingKey, and every canonical sort ends with
 * `ListingKey asc`. A total order on ListingKey means two rows sharing one are
 * necessarily ADJACENT in the result sequence. A duplicate can therefore only
 * straddle a continuation boundary within a short tail of it — carrying the last
 * few keys closes the case exactly, rather than approximating it, and avoids an
 * unbounded set of every key ever seen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISM ACROSS COLD INSTANCES. Nothing is stored anywhere. The token holds
 * the entire resume state, so a cold serverless instance with no memory of the
 * previous request resumes from the identical POSITION — which an in-memory
 * cursor could not promise, and which is why one is not used.
 *
 * That is cold-start determinism and nothing more. It is NOT snapshot
 * isolation: the provider offers none (EntitySets only, no $delta, no
 * deltatoken, nextLink is a plain $skip), so a feed that moves between requests
 * moves the sequence with it. An earlier version of this comment promised an
 * "identical sequence", which overclaimed exactly that difference.
 */

/** How many trailing provider-row keys travel with the token. */
const BOUNDARY_TAIL = 8;

/** Bumped if the shape changes, so an old token is refused rather than misread. */
const CONTINUATION_VERSION = 2;

export interface SearchContinuation {
  readonly v: number;
  /**
   * KEYSET BOUNDARY — the position in the ORDER to resume after.
   *
   * v2 replaced `providerOffset` as the resume authority rather than adding
   * keyset beside it: two production pagination truths is one too many, and the
   * offset one was proven unstable under a live feed (a withdrawal ahead of the
   * boundary skips a row, an insertion repeats one).
   *
   * `sortValue` is the RAW Cotality value from the boundary record — never a
   * mapped or formatted one. It is written straight back into an OData filter,
   * and a value that has been through a renderer is a different value.
   */
  readonly sortKey: string;
  readonly phase: string;
  readonly sortValue: string | number | null;
  readonly lastListingKey: string;
  /** Final-universe rows already emitted before this page. */
  readonly survivorsConsumed: number;
  /** Trailing provider-row keys, for dedupe across the boundary. */
  readonly tail: readonly string[];
  /** Hash of the canonical criteria + sort + page size this token belongs to. */
  readonly fp: string;
}

export class InvalidContinuationError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(
      `Invalid search continuation: ${reason}. ` +
        "Mallan will not resume a traversal against a different question — " +
        "start the search again.",
    );
    this.name = "InvalidContinuationError";
    this.reason = reason;
  }
}

/**
 * Identity of the QUESTION a continuation belongs to.
 *
 * The emitted OData filter and the resolved sort clause together determine the
 * result sequence, so hashing them is exactly the right granularity: any change
 * a broker makes to their search changes one of the two, and the old position
 * stops meaning anything.
 */
export function continuationFingerprint(
  filter: string,
  sortClause: string,
  pageSize?: number,
): string {
  // PAGE SIZE IS PART OF THE SEQUENCE IDENTITY. A position captured at 20 rows
  // a page does not describe the same sequence at 50, so a token minted before
  // the broker changed page size must not be honoured after.
  return createHash("sha256")
    .update(`v${CONTINUATION_VERSION}|${filter}|${sortClause}|${pageSize ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}

/** The dedicated sealing key, or null when it is not configured. */
function continuationSecret(): string | null {
  const secret = process.env.SEARCH_CONTINUATION_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

/**
 * Whether continuation may be offered at all.
 *
 * FAIL-CLOSED: without the dedicated secret there is no way to tell an honest
 * token from an edited one, so no token is minted and callers fall back to the
 * bounded rescan. Offering an unsigned position and calling it validated would
 * be exactly the kind of claim this codebase keeps removing.
 */
export function isContinuationAvailable(): boolean {
  return continuationSecret() !== null;
}

function seal(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function sealMatches(payload: string, given: string, secret: string): boolean {
  const expected = Buffer.from(seal(payload, secret), "utf8");
  const actual = Buffer.from(given, "utf8");
  // Constant-time: a length-varying or short-circuiting compare leaks the seal.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function encodeContinuation(c: SearchContinuation): string {
  const secret = continuationSecret();
  if (!secret) {
    throw new InvalidContinuationError(
      "continuation is not configured (SEARCH_CONTINUATION_SECRET is unset)",
    );
  }
  const payload = Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
  return `${payload}.${seal(payload, secret)}`;
}

/**
 * Decode and VALIDATE a continuation against the current question.
 *
 * Fails by name rather than falling back to page one: silently restarting would
 * hand a broker page 1 while the pager says page 40.
 */
export function decodeContinuation(
  token: string,
  expectedFingerprint: string,
): SearchContinuation {
  const secret = continuationSecret();
  if (!secret) {
    throw new InvalidContinuationError(
      "continuation is not configured (SEARCH_CONTINUATION_SECRET is unset)",
    );
  }

  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new InvalidContinuationError("not sealed");
  const payload = token.slice(0, dot);
  const given = token.slice(dot + 1);
  if (!sealMatches(payload, given, secret)) {
    // THE CASE THAT ACTUALLY MATTERS: a structurally valid position, edited to
    // another valid value and re-encoded. Nothing about the SHAPE is wrong, so
    // the type and range checks below all pass — only the seal catches it.
    throw new InvalidContinuationError("seal does not match — the token was altered");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new InvalidContinuationError("not decodable");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidContinuationError("not an object");
  }
  const c = parsed as Record<string, unknown>;

  if (c.v !== CONTINUATION_VERSION) throw new InvalidContinuationError("version mismatch");

  const consumed = c.survivorsConsumed;
  if (typeof c.sortKey !== "string" || c.sortKey === "") {
    throw new InvalidContinuationError("missing sort key");
  }
  if (c.phase !== "KNOWN" && c.phase !== "NULLS") {
    throw new InvalidContinuationError("unknown traversal phase");
  }
  if (typeof c.lastListingKey !== "string" || !/^[0-9]+$/.test(c.lastListingKey)) {
    // Live: a non-numeric ListingKey literal returns HTTP 500 from Cotality
    // rather than an empty result, so a malformed boundary would break the
    // provider rather than fail cleanly here.
    throw new InvalidContinuationError("boundary ListingKey is not a provider key");
  }
  if (c.phase === "KNOWN" && c.sortValue === null) {
    throw new InvalidContinuationError("a KNOWN-phase boundary needs a sort value");
  }
  if (c.phase === "NULLS" && c.sortValue !== null) {
    throw new InvalidContinuationError("a NULLS-phase boundary must not carry a sort value");
  }
  if (typeof consumed !== "number" || !Number.isInteger(consumed) || consumed < 0) {
    throw new InvalidContinuationError("survivor position is not a whole number of rows");
  }
  if (!Array.isArray(c.tail) || c.tail.some((k) => typeof k !== "string")) {
    throw new InvalidContinuationError("boundary keys are malformed");
  }
  if (typeof c.fp !== "string" || c.fp.length === 0) {
    throw new InvalidContinuationError("missing question fingerprint");
  }
  if (c.fp !== expectedFingerprint) {
    // The mundane failure this exists to catch: the criteria or the sort moved
    // and the old position now describes a different universe.
    throw new InvalidContinuationError("belongs to a different search or sort order");
  }

  return {
    v: CONTINUATION_VERSION,
    sortKey: c.sortKey,
    phase: c.phase,
    sortValue: (c.sortValue ?? null) as string | number | null,
    lastListingKey: c.lastListingKey,
    survivorsConsumed: consumed,
    tail: c.tail as string[],
    fp: c.fp,
  };
}

/** Build the continuation a caller should send to get the NEXT page. */
export function nextContinuation(args: {
  fingerprint: string;
  sortKey: string;
  phase: string;
  /** RAW provider value from the boundary record. */
  sortValue: string | number | null;
  lastListingKey: string;
  survivorsConsumed: number;
  /** Provider-row keys of the survivors on this page, in order. */
  pageRowKeys: readonly string[];
  /** The tail carried IN, so a short page still hands on a usable boundary. */
  previousTail?: readonly string[];
}): string {
  const combined = [...(args.previousTail ?? []), ...args.pageRowKeys];
  return encodeContinuation({
    v: CONTINUATION_VERSION,
    sortKey: args.sortKey,
    phase: args.phase,
    sortValue: args.sortValue,
    lastListingKey: args.lastListingKey,
    survivorsConsumed: args.survivorsConsumed,
    tail: combined.slice(-BOUNDARY_TAIL),
    fp: args.fingerprint,
  });
}

/**
 * The ONLY page a continuation describes.
 *
 * A sealed token says how many survivors were already emitted, so the page it
 * belongs to is arithmetic, not a caller's assertion. Without this a valid page-1
 * token could be sent with `page=99` and the server would return the next rows
 * and label them page 99.
 *
 * It also keeps an UNFINISHED page on itself: 20 survivors consumed at 50 to a
 * page is still page 1, so the server continues assembling page 1 rather than
 * letting the caller move on.
 */
export function expectedPageFor(survivorsConsumed: number, pageSize: number): number {
  return Math.floor(survivorsConsumed / Math.max(1, pageSize)) + 1;
}

export const CONTINUATION_BOUNDARY_TAIL = BOUNDARY_TAIL;
