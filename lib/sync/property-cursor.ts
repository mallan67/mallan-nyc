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
 * Advance the cursor to the last SAFELY-resumable processed position.
 *
 * Two rules, both required for skip-safety:
 *  1. Contiguity — walk in order and stop at the first non-ok record; never
 *     advance past an unprocessed record.
 *  2. Tie-block safety (live finding 2026-07-21) — the server does NOT order a
 *     tied-`ModificationTimestamp` block by the tiebreak key, so a `key gt`
 *     resume inside such a block would SKIP rows. Therefore the cursor must
 *     never land INSIDE a timestamp group that is not fully processed: if the
 *     contiguous-ok prefix ends in a timestamp `tsL` that also appears AFTER the
 *     prefix (i.e. that group is split), back off to the last processed record
 *     whose timestamp is strictly less than `tsL`.
 *
 * Returns null when nothing can be safely advanced (first record failed, empty
 * run, or the whole ok-prefix is one incomplete tie block) — the caller then
 * preserves the prior cursor. The caller must independently guarantee the run
 * fully drained each timestamp it advances past (follow `@odata.nextLink` to
 * exhaustion; an incomplete drain must not mark trailing records ok).
 */
export function advancePropertyCursor(
  processed: ProcessedRecord[],
): { ts: string; key: string } | null {
  // Rule 1: last contiguously-ok index.
  let lastOk = -1;
  for (let i = 0; i < processed.length; i++) {
    if (!processed[i].ok) break;
    lastOk = i;
  }
  if (lastOk < 0) return null;

  // Rule 2: is the tie group at the boundary timestamp split across the prefix?
  const tsL = processed[lastOk].ts;
  const tieSplit = processed.some((r, i) => i > lastOk && r.ts === tsL);
  if (!tieSplit) return { ts: processed[lastOk].ts, key: processed[lastOk].key };

  // Back off to the last processed record with a strictly-earlier timestamp.
  for (let i = lastOk; i >= 0; i--) {
    if (processed[i].ts !== tsL) return { ts: processed[i].ts, key: processed[i].key };
  }
  return null;
}
