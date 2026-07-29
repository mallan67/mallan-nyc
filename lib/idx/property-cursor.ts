/**
 * Phase 1A — two-stream composite keyset cursor for the Property incremental fetch.
 *
 * WHY TWO STREAMS
 * ---------------
 * The incremental filter joins two clocks with `or`:
 *   (ModificationTimestamp gt since or PhotosChangeTimestamp gt since)
 * The live probe (docs/idx/cotality-keyset-cursor-probe-2026-07-29.md) showed that
 * ordering that query by either clock yields rows whose OTHER clock predates
 * `since`, so no single scalar cursor over it is safe. With the scheduled 500-row
 * cap and the previous `ModificationTimestamp desc` default, PCT-only records
 * (old MT, new PCT) sorted thousands of rows past the cap and were never fetched.
 *
 * Each clock therefore gets its own single-clock query, ascending, with its own
 * cursor. Ascending + contiguous advancement means a truncated tail is simply
 * picked up next cycle: no record can be skipped.
 *
 * WHY A COMPOSITE (timestamp, ListingKey) KEY
 * -------------------------------------------
 * A timestamp-only cursor is unsafe even per stream. The probe found
 * ModificationTimestamp 2026-05-15T11:12:44.223 shared by 1,203 listings — 4.8x
 * the 250-row page budget. A cursor advancing past that timestamp after one page
 * would permanently skip 953 listings. The ListingKey tie-breaker is mandatory.
 *
 * WHY BOOTSTRAP IS A SEPARATE MODE
 * --------------------------------
 * The probe also proved `ListingKey eq ''` returns the FULL population, i.e.
 * Cotality does not evaluate empty-string comparison as a predicate. A bootstrap
 * cursor must therefore never emit `ListingKey gt ''`. Bootstrap is modelled as a
 * distinct mode that emits a bare `gt` on a PINNED epoch, and a stream switches to
 * keyset mode only once a real record has settled.
 */

export type PropertyStreamField = "ModificationTimestamp" | "PhotosChangeTimestamp";

export type PropertyKeysetCursor =
  | { mode: "bootstrap"; timestamp: string }
  | { mode: "keyset"; timestamp: string; listingKey: string };

export interface PropertyCursorState {
  basis: string;
  mt: PropertyKeysetCursor;
  pct: PropertyKeysetCursor;
}

/**
 * PINNED bootstrap epoch — never `Date.now() - 30 days`, which would create a
 * moving lower bound that never drains. 1 ms before 2026-06-29T00:00:00Z; the
 * probe confirmed `gt` at this instant returns exactly the same 12,876 records as
 * `ge 2026-06-29T00:00:00Z`, so the boundary is inclusive of that day without
 * relying on an equality/tie clause.
 */
export const PROPERTY_CURSOR_BOOTSTRAP_EPOCH = "2026-06-28T23:59:59.999Z";

/** Both streams still draining the approved bounded historical window. */
export const CURSOR_BASIS_BOOTSTRAP = "mt_pct_keyset_bootstrap_v1";
/** Both streams at the live edge. */
export const CURSOR_BASIS_LIVE = "mt_pct_keyset_v1";

const RECOGNISED_BASES: ReadonlySet<string> = new Set([CURSOR_BASIS_BOOTSTRAP, CURSOR_BASIS_LIVE]);

export function bootstrapCursorState(): PropertyCursorState {
  return {
    basis: CURSOR_BASIS_BOOTSTRAP,
    mt: { mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
    pct: { mode: "bootstrap", timestamp: PROPERTY_CURSOR_BOOTSTRAP_EPOCH },
  };
}

function isValidTimestamp(v: unknown): v is string {
  if (typeof v !== "string" || v.length === 0) return false;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && !Number.isNaN(t);
}

/** OData string literals escape a single quote by doubling it. */
function odataStringLiteral(v: string): string {
  return "'" + v.replace(/'/g, "''") + "'";
}

/**
 * The stream's `$filter`.
 *
 * bootstrap → `Field gt <epoch>` (no ListingKey term at all)
 * keyset    → `(Field gt ts or (Field eq ts and ListingKey gt 'key'))`
 *
 * Throws on an empty keyset key rather than emitting `ListingKey gt ''`, which
 * the probe proved Cotality does not evaluate.
 */
export function buildStreamFilter(field: PropertyStreamField, cursor: PropertyKeysetCursor): string {
  if (!isValidTimestamp(cursor.timestamp)) {
    throw new Error(`[property-cursor] refusing to build a filter from a malformed ${field} cursor timestamp`);
  }
  if (cursor.mode === "bootstrap") {
    return `${field} gt ${cursor.timestamp}`;
  }
  if (typeof cursor.listingKey !== "string" || cursor.listingKey.length === 0) {
    throw new Error(
      `[property-cursor] refusing to emit an empty-key tie clause for ${field}: ` +
        "Cotality does not evaluate empty-string comparison as a predicate",
    );
  }
  return (
    `(${field} gt ${cursor.timestamp} or ` +
    `(${field} eq ${cursor.timestamp} and ListingKey gt ${odataStringLiteral(cursor.listingKey)}))`
  );
}

/** Ascending on the stream clock, tie-broken by ListingKey — the keyset scan order. */
export function streamOrderBy(field: PropertyStreamField): string {
  return `${field} asc,ListingKey asc`;
}

function parseOneCursor(raw: unknown, basis: string): PropertyKeysetCursor | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isValidTimestamp(o.timestamp)) return null;
  const key = o.listingKey;
  if (key === undefined || key === null) {
    // A keyless cursor is legitimate ONLY while the basis says we are still
    // bootstrapping. Under the LIVE basis every stream has settled at least one
    // record, so an absent key is partially-missing state and must fail closed
    // rather than silently rescanning the whole bootstrap window.
    if (basis !== CURSOR_BASIS_BOOTSTRAP) return null;
    return { mode: "bootstrap", timestamp: o.timestamp };
  }
  // An EMPTY key is not a usable tie value — reject rather than silently
  // degrading to a bootstrap scan that would re-read the whole window.
  if (typeof key !== "string" || key.length === 0) return null;
  return { mode: "keyset", timestamp: o.timestamp, listingKey: key };
}

/**
 * Read trusted cursor state out of `SyncState.notes`. Returns null for absent,
 * legacy, or malformed state — the caller must then fail closed by bootstrapping
 * rather than inventing a cursor.
 */
export function parsePropertyCursorNotes(notes: unknown): PropertyCursorState | null {
  if (notes === null || typeof notes !== "object" || Array.isArray(notes)) return null;
  const o = notes as Record<string, unknown>;
  const basis = o.property_cursor_basis;
  if (typeof basis !== "string" || !RECOGNISED_BASES.has(basis)) return null;
  const cursors = o.property_cursors;
  if (cursors === null || typeof cursors !== "object" || Array.isArray(cursors)) return null;
  const c = cursors as Record<string, unknown>;
  const mt = parseOneCursor(c.mt, basis);
  const pct = parseOneCursor(c.pct, basis);
  if (!mt || !pct) return null;
  return { basis, mt, pct };
}

/**
 * Merge cursor state into the existing notes object WITHOUT touching unrelated
 * recognised fields (notably `manifest_warmed_shards`). Returns a new object; the
 * caller's notes are never mutated.
 */
export function mergePropertyCursorIntoNotes(
  notes: unknown,
  state: PropertyCursorState,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    notes !== null && typeof notes === "object" && !Array.isArray(notes)
      ? { ...(notes as Record<string, unknown>) }
      : {};
  const serialise = (c: PropertyKeysetCursor) =>
    c.mode === "bootstrap"
      ? { timestamp: c.timestamp }
      : { timestamp: c.timestamp, listingKey: c.listingKey };
  base.property_cursor_basis = state.basis;
  base.property_cursors = { mt: serialise(state.mt), pct: serialise(state.pct) };
  return base;
}
