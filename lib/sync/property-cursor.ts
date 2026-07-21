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
 * `pageChainComplete` is the AUTHORITATIVE gate and MUST come from the caller —
 * it is true only when the `@odata.nextLink` chain was drained to exhaustion for
 * this run. This helper CANNOT infer unseen rows from the local `processed`
 * array: if the chain was not exhausted, rows may exist that were never fetched,
 * so any advance risks skipping them. When `pageChainComplete` is false the
 * cursor is FROZEN (returns null → caller preserves the prior cursor).
 *
 * When the chain is complete, `processed` is the full drained set and two rules
 * apply for skip-safety:
 *  1. Contiguity — stop at the first non-ok record; never advance past an
 *     unprocessed record.
 *  2. Tie-block safety — a tied-`ModificationTimestamp` block may not be ordered
 *     by the tiebreak key at the server, so a `key gt` resume inside such a
 *     block could skip rows. If the contiguous-ok prefix ends in a timestamp
 *     `tsL` that also appears AFTER the prefix (that group is split by a non-ok
 *     record), back off to the last processed record whose timestamp is strictly
 *     less than `tsL`. (This tied-ordering behavior is live-proven for the Media
 *     endpoint; for Property it is UNVERIFIED — the back-off is a defensive
 *     fail-closed default, not a claim about the Property endpoint.)
 *
 * Returns null when nothing can be safely advanced (incomplete chain, first
 * record failed, empty run, or the whole ok-prefix is one incomplete tie block).
 */
export function advancePropertyCursor(
  processed: ProcessedRecord[],
  pageChainComplete: boolean,
): { ts: string; key: string } | null {
  // Authoritative gate: an un-drained page chain means the local array is not
  // known to be the full set — never advance, preserve the prior cursor.
  if (!pageChainComplete) return null;

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
