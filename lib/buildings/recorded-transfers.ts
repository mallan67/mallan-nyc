/**
 * Canonical recorded-transfer consumption (Maya 2026-07-23 correction round).
 *
 * `recordedTransfers` is the CANONICAL contract for NYC ACRIS recorded
 * transfers on public building surfaces. `saleHistory` is a DEPRECATED
 * compatibility alias only — no new consumer may read it directly; during the
 * compatibility period this helper is the single place the fallback lives.
 */

export interface RecordedTransferView {
  id: string;
  documentId?: string;
  bbl?: string;
  /** Recorded document amount — NOT a verified unit-level sale price.
   *  `null` when the row carries no amount: missing stays missing and is
   *  NEVER rendered as $0. */
  amount: number | null;
  recordedDate: string | null;
  unit: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  /** Preserved verbatim; 'unknown' when the row carries no source — a row
   *  without proven provenance is NEVER silently labeled as ACRIS. */
  source: string;
  retrievedAt?: string;
}

interface TransferLikeRow {
  id: string;
  documentId?: string;
  bbl?: string;
  amount?: number | null;
  recordedDate?: string | null;
  /** deprecated alias fields */
  closePrice?: number;
  closeDate?: string | null;
  unit?: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  source?: string;
  retrievedAt?: string;
}

/**
 * Resolve the canonical transfer rows from a building-data payload.
 * Prefers `recordedTransfers`; falls back to the DEPRECATED `saleHistory`
 * alias for older cached/compat responses, normalizing its legacy field
 * names (`closePrice`/`closeDate`) onto the canonical view.
 */
export function toRecordedTransfers(payload: {
  recordedTransfers?: TransferLikeRow[] | null;
  /** @deprecated compatibility alias — do not consume directly */
  saleHistory?: TransferLikeRow[] | null;
}): RecordedTransferView[] {
  const rows = payload.recordedTransfers ?? payload.saleHistory ?? [];
  return rows.map((r) => ({
    id: r.id,
    documentId: r.documentId,
    bbl: r.bbl,
    // NO fabrication (Maya 2026-07-23): a missing amount stays null — it
    // must never render as a recorded amount of $0.
    amount: r.amount ?? r.closePrice ?? null,
    recordedDate: r.recordedDate ?? r.closeDate ?? null,
    unit: r.unit ?? '',
    beds: r.beds ?? null,
    baths: r.baths ?? null,
    sqft: r.sqft ?? null,
    // NO fabrication: an unproven source is 'unknown', never silently ACRIS.
    source: r.source ?? 'unknown',
    retrievedAt: r.retrievedAt,
  }));
}
