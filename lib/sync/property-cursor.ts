/**
 * Oldest-first, lossless keyset cursor for the Property feed.
 *
 * THE DEFECT THIS REPLACES: the prior pipeline ordered newest-first and skipped
 * the newest ~500, so any listing beyond the window (or churned while paging)
 * could be perpetually skipped. This cursor walks the feed OLDEST-first by the
 * stable composite key (ModificationTimestamp asc, ListingKey asc) and advances
 * ONLY to the last contiguously-processed record. A partial run, a mid-batch
 * failure, or a >$top backlog therefore re-fetches the unprocessed tail on the
 * next run — it is never skipped.
 *
 * Mirrors the proven Media keyset in lib/idx/media-sync.ts (composite (ts,key),
 * forward-only). Pure string/params construction — no network, no DB.
 *
 * OData literal rules (verified against lib/idx/fetch.ts): DateTimeOffset
 * literals are written BARE (unquoted ISO-8601); string keys are single-quoted
 * with `'` doubled per OData escaping.
 */

/** Cursor position: the (ModificationTimestamp, ListingKey) of the last
 * contiguously-processed record, or nulls to start from the oldest record. */
export interface PropertyCursor {
  ts: string | null;
  key: string | null;
}

/** One record the run attempted, in feed order. `ok` = fully processed. */
export interface ProcessedRecord {
  ts: string;
  key: string;
  ok: boolean;
}

/** Escape a string literal for an OData single-quoted value. */
function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Build the Property OData query for one page, oldest-first.
 *
 * With a null cursor there is no `$filter` — the walk starts at the oldest
 * record. With a cursor the keyset predicate resumes strictly AFTER the last
 * processed record: `(MT gt ts) or (MT eq ts and ListingKey gt key)`.
 */
export function buildPropertyQuery(cursor: PropertyCursor, top: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set("$orderby", "ModificationTimestamp asc,ListingKey asc");
  params.set("$top", String(top));
  if (cursor.ts !== null && cursor.key !== null) {
    params.set(
      "$filter",
      `(ModificationTimestamp gt ${cursor.ts}) or ` +
        `(ModificationTimestamp eq ${cursor.ts} and ListingKey gt ${odataString(cursor.key)})`,
    );
  }
  return params;
}

/**
 * Advance the cursor to the last CONTIGUOUSLY-processed record.
 *
 * Walks `processed` in order and stops at the first non-ok record, returning
 * the (ts, key) of the record just before it. If the first record failed, or
 * the run processed nothing, returns null — the caller preserves the prior
 * cursor (never advance past an unprocessed record).
 */
export function advancePropertyCursor(
  processed: ProcessedRecord[],
): { ts: string; key: string } | null {
  let last: { ts: string; key: string } | null = null;
  for (const r of processed) {
    if (!r.ok) break;
    last = { ts: r.ts, key: r.key };
  }
  return last;
}
