// scripts/audit/media-coverage-audit.ts
//
// READ-ONLY media-coverage audit LOGIC for the 2026-07-16 remediation packet.
// Pure, injectable, testable — the tsx entry point is media-coverage-audit.cli.ts.
//
//   • Canonical display eligibility (isListingDisplayable), canonical Mallan-ownership
//     (via the classifier), active/legacy USABLE photos counted with the PRODUCTION
//     media classifier — no simplified expressions.
//   • Tri-state Cotality: confirmed count / unknown-error. A skipped probe or a
//     provider error is UNKNOWN — NEVER coerced to 0/D. An incomplete Cotality audit
//     is flagged (`incomplete`) so the CLI can exit nonzero.
//
// ZERO writes. There is NO --apply.

import { isListingDisplayable } from '@/lib/search/listing-access-decision';
import { resolveListingMediaFromRows, getPhotoGallery, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import {
  classifyMediaCoverage, emptyTally,
  type ListingCoverageInput, type CotalityProbe, type MediaCoverageBucket,
} from '@/lib/media/media-coverage-bucket';

/** The SELECT the audit issues (read-only). Active rows carry the full resolver
 *  shape so we count photos with the production classifier; `_count` is the
 *  all-status existence signal; `media` is the legacy JSON. */
export interface AuditListingRow {
  listing_id: string;
  rls_eligible: boolean | null;
  status: unknown;
  idx_display_yn: unknown;
  internet_entire_listing_display_yn: unknown;
  owner_opt_out: unknown;
  participant_only: unknown;
  media: unknown;
  _count: { listing_media: number };
  listing_media: ListingMediaTableRow[]; // WHERE status='active'
}

/** Full inventory record emitted per listing. */
export interface InventoryRow {
  listingId: string;
  displayable: boolean;
  ownership: 'mallan-owned' | 'third-party';
  activeUsablePhotoCount: number;
  allStatusRowCount: number;
  legacyUsablePhotoCount: number;
  cotality: CotalityProbe;
  bucket: MediaCoverageBucket;
}

/** PURE: build the classifier input + inventory record from one DB row + probe.
 *  Uses the CANONICAL display gate and the PRODUCTION media classifier. */
export function buildInventoryRow(row: AuditListingRow, cotality: CotalityProbe): InventoryRow {
  const displayable = isListingDisplayable({
    idx_display_yn: row.idx_display_yn,
    internet_entire_listing_display_yn: row.internet_entire_listing_display_yn,
    status: row.status,
    owner_opt_out: row.owner_opt_out,
    participant_only: row.participant_only,
  });
  const activeUsablePhotoCount = resolveListingMediaFromRows(row.listing_media || [])
    .filter((m) => m.class === 'photo').length;
  const legacyUsablePhotoCount = getPhotoGallery(Array.isArray(row.media) ? row.media : [])
    .filter((m) => m.class === 'photo').length;

  const input: ListingCoverageInput = {
    listingId: row.listing_id,
    rlsEligible: row.rls_eligible,
    displayable,
    activeUsablePhotoCount,
    allStatusRowCount: row._count?.listing_media ?? 0,
    legacyUsablePhotoCount,
    cotality,
  };
  return {
    listingId: row.listing_id,
    displayable,
    ownership: (input.listingId.startsWith('SL-') || input.listingId.startsWith('RL-') || input.rlsEligible === false) ? 'mallan-owned' : 'third-party',
    activeUsablePhotoCount,
    allStatusRowCount: input.allStatusRowCount,
    legacyUsablePhotoCount,
    cotality,
    bucket: classifyMediaCoverage(input),
  };
}

export interface AuditDeps {
  fetchListings: () => Promise<AuditListingRow[]>;
  /** LIVE read-only Cotality probe. Present ⇒ --with-cotality. Absent ⇒ probes are
   *  skipped and DB-empty listings become UNKNOWN (never B/D). */
  probeCotality?: (listingId: string) => Promise<CotalityProbe>;
}

export interface AuditResult {
  inventory: InventoryRow[];
  tally: Record<MediaCoverageBucket, number>;
  cotalityFailures: number;
  incomplete: boolean; // true ⇒ --with-cotality requested but ≥1 probe was UNKNOWN
}

/** Orchestrates the read-only audit over injected deps (mockable in tests). */
export async function runAudit(deps: AuditDeps): Promise<AuditResult> {
  const rows = await deps.fetchListings();
  const inventory: InventoryRow[] = [];
  const tally = emptyTally();
  let cotalityFailures = 0;

  for (const row of rows) {
    const provisional = buildInventoryRow(row, { status: 'unknown', reason: 'probe skipped' });
    const dbEmpty = provisional.displayable
      && provisional.activeUsablePhotoCount === 0
      && provisional.legacyUsablePhotoCount === 0;

    let record = provisional;
    if (deps.probeCotality && dbEmpty) {
      const cotality = await deps.probeCotality(row.listing_id);
      if (cotality.status === 'unknown') cotalityFailures += 1;
      record = buildInventoryRow(row, cotality);
    }
    inventory.push(record);
    tally[record.bucket] += 1;
  }

  const incomplete = Boolean(deps.probeCotality) && cotalityFailures > 0;
  return { inventory, tally, cotalityFailures, incomplete };
}
