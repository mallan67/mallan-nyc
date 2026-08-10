/**
 * raw_data keep-field set (PR 10 — Neon shedding).
 *
 * Trestle's IDX Plus feed exposes ~1,457 Property fields per row, but the
 * subset actually populated on a given listing is ~50-60. Even at that
 * lower density, raw_data averaged ~9.3 KB / row across 19K+ Trestle rows
 * (~180 MB on the listings table) before this module shipped — the
 * dominant chunk of Neon free-tier storage. After the 2026-04-28
 * production backfill ran with this keep set (110 fields), the listings
 * table dropped from 270 MB to 173 MB and total DB went from 293 MB to
 * 196 MB (58.6% → 39.2% of cap). See PR #75 for verification numbers.
 *
 * This module is the single source of truth for which raw_data fields
 * MUST be preserved. Every key on this list is either:
 *   1. Read by a server-side consumer (public DTO, compliance audit,
 *      retention archive, buildings route, CRM PUT merge, status route),
 *   2. Required for REBNY RLS / UCBA 2026 compliance reference,
 *   3. Used by edit-mode form hydration for CRM-created listings, OR
 *   4. Needed for downstream sync identity / change detection.
 *
 * ANY field NOT on this list is safe to drop from raw_data on Trestle
 * imports. The public DTO and compliance code already handle missing
 * fields gracefully (null/undefined fallbacks to top-level columns).
 *
 * Adding a new consumer that reads from raw_data?
 *   → Add the field here in the right section, with a comment naming
 *     the consumer file.
 *
 * Want to drop a field?
 *   → Verify NO consumer reads it (grep `raw_data.X` and `rawData.X`
 *     and `raw.X` across the repo), then remove the line.
 *
 * @module lib/compliance/raw-data-keep-fields
 */

/**
 * Fields preserved on Trestle-imported listings' raw_data.
 *
 * Mallan-CRM-created listings (POST /api/crm/listings) write the agent's
 * form payload into raw_data unchanged — this list does NOT apply to
 * those. Identification: agent_id IS NOT NULL → mallan-created.
 * Trestle-imported rows have agent_id linkage via ListAgentMlsId mapping
 * in lib/idx/sync.ts; their raw_data IS slimmed by this list.
 *
 * Sourced from a complete grep of `raw_data.X`, `rawData.X`, `raw.X`,
 * and `existingRaw.X` across `lib/`, `app/api/`, and the public CRM
 * forms (verified 2026-04-27).
 */
export const RAW_DATA_KEEP_FIELDS: readonly string[] = [
  // ── Identifiers (sync identity + change detection) ─────────────────
  // Used by lib/idx/sync.ts to detect edits + by reset-sync route.
  'ListingKey',
  'ListingId',
  'SourceSystemKey',
  'ModificationTimestamp',
  'OriginatingSystemName',
  'OriginatingSystemKey',

  // ── Status / lifecycle ─────────────────────────────────────────────
  // db-to-public-dto.ts reads StandardStatus + ActivationDate. The cron
  // archive step also reads StandardStatus.
  'StandardStatus',
  'MlsStatus',
  'ActivationDate',
  'OnMarketDate',
  'OffMarketDate',
  'CloseDate',
  'ListingContractDate',
  'ExpirationDate',

  // ── Pricing (sale + rental) ────────────────────────────────────────
  // db-to-public-dto.ts pulls these for the public listing detail page,
  // and the retention cron carries them into listings_archive.
  'ListPrice',
  'OriginalListPrice',
  'PreviousListPrice',
  'ClosePrice',
  'LeaseAmount',
  'LeaseAmountFrequency',
  'AvailabilityDate',

  // ── DOM (UCBA Art. I §11 — agent-facing display) ───────────────────
  'DaysOnMarket',
  'CumulativeDaysOnMarket',

  // ── Address (display + suppression decisions) ──────────────────────
  // CRM forms hydrate from these in edit mode; public DTO falls back to
  // them when the address column is sparse.
  'UnparsedAddress',
  'StreetNumber',
  'StreetName',
  'StreetSuffix',
  'StreetDirPrefix',
  'UnitNumber',
  'City',
  'PostalCity',
  'PostalCode',
  'CityRegion',
  'CountyOrParish',
  'StateOrProvince',
  'SubdivisionName',
  'BuildingName',
  'MLSAreaMajor',

  // ── Property classification ────────────────────────────────────────
  'PropertyType',
  'PropertySubType',
  'CommonInterest',
  'StructureType',

  // ── Property facts (form populate + DTO fallback) ──────────────────
  'BedroomsTotal',
  'BathroomsFull',
  'BathroomsHalf',
  'BathroomsTotalDecimal',
  'LivingArea',
  'LivingAreaUnits',
  'YearBuilt',
  'StoriesTotal',
  'NumberOfUnitsTotal',
  'RoomsTotal',
  'NewDevelopmentYN',
  'PropertyCondition',

  // ── Compensation / agreement (UCBA + REBNY display) ────────────────
  'ListingAgreement',
  'CoBrokeAgreement',
  'Concessions',
  'ConcessionsAmount',

  // ── Distribution / permission (gate decisions) ─────────────────────
  // Even though these are mirrored as top-level boolean columns, the
  // public DTO's fail-closed gate helpers in lib/compliance/gates.ts
  // accept either source. Keeping them in raw_data lets the gate logic
  // re-derive on a row that was synced before the columns existed.
  'Permission',
  'Permissions',
  'InternetEntireListingDisplayYN',
  'InternetAddressDisplayYN',
  'InternetAutomatedValuationDisplayYN',
  'InternetConsumerCommentYN',
  'OwnerOptOut',
  'ParticipantOnly',
  'SyndicateTo',

  // ── Display content (REBNY display + Fair Housing scan) ────────────
  // PublicRemarks is read by the compliance audit route and is the
  // listing description users see. Required for archive too.
  'PublicRemarks',
  'PrivateRemarks',
  'ShowingInstructions',

  // ── Agent / office (REBNY attribution + archive) ───────────────────
  // The retention cron carries these into listings_archive. Compliance
  // attribution requires display.
  'ListAgentMlsId',
  'ListAgentKey',
  'ListAgentFullName',
  'ListAgentEmail',
  'ListAgentDirectPhone',
  'ListOfficeName',
  'ListOfficeKey',
  'ListOfficeMlsId',
  'CoListAgentFullName',
  'CoListOfficeName',

  // ── Media metadata (compliance audit photo count + virtual tour) ───
  // The compliance audit route does `raw.Media ?? raw.photos ?? []` to
  // count photos. Virtual tour URLs are surfaced on the public DTO.
  // NOTE: the heavy per-photo Media array (URLs, dimensions, captions
  // for every image) is what dominates raw_data. PR #48 normalized that
  // into ListingMedia + ListingMedia.preferred_photo_yn etc., so the
  // audit can pivot to ListingMedia in a follow-up. For now we keep
  // raw.Media to stay reader-compatible.
  'Media',
  // 'PhotosChangeTimestamp' REMOVED 2026-08-07 (commit 7B-2B).
  //
  // It sat in this group but was NOT one of the consumers the comment above
  // names — those are `raw.Media` (audit photo count) and the VirtualTour URL
  // fields (public DTO). Adjacency in a keep list is not evidence of a consumer,
  // and it should not have been read as one.
  //
  // Its only real consumer was the SQL eligibility predicate in the legacy,
  // unreachable `backfillEmptyMedia()`. PCT freshness is owned by the canonical
  // chain instead: Property.PhotosChangeTimestamp -> incremental source trigger
  // -> complete media reconciliation -> media_sync_state.last_photos_change.
  //
  // Historical rows still physically contain the key. NO cleanup backfill is
  // authorised; `rawDataMateriallyEqual` canonicalizes the deprecated key away
  // on BOTH sides so a legacy row and a canonical slim row compare EQUAL — that
  // is what prevents a one-time whole-table rewrite storm on first deploy.
  'PhotosCount',
  'VirtualTourURLBranded',
  'VirtualTourURLUnbranded',

  // ── Sale/rental specifics (form populate; agents re-edit) ──────────
  'AssociationFee',
  'AssociationFeeFrequency',
  'TaxAnnualAmount',
  'TaxMonthlyAmount',
  'FlipTax',
  'FurnishedYN',
  'PetsAllowed',
  'Furnished',
  'AdditionalFeeYN',
  'AdditionalFee',
  'AdditionalFeeDescription',
  'AdditionalFeeFrequency',
  'OngoingFees',
  'MoveInCosts',
  // MoveInCostsAmount + MoveInCostsComments restored 2026-06-04: the live Cotality
  // $metadata exposes both as Property fields (MoveInCostsAmount = Edm.Decimal(14,2),
  // MoveInCostsComments = Edm.String(1024)). #340 removed them based on a stale
  // snapshot; the snapshot is refreshed in this same PR. MoveInCostsAmountTotal
  // stays OUT — it is still absent from live $metadata.
  'MoveInCostsAmount',
  'MoveInCostsComments',
  'FeeFrequency',
  // FirstShowingDate removed 2026-06-04: phantom on live Trestle. The activation
  // timestamp is ActivationDate (already kept above), which is the live field.

  // ── Features (form populate) ───────────────────────────────────────
  'Heating',
  'Cooling',
  'Appliances',
  'InteriorFeatures',
  'ExteriorFeatures',
  'LaundryFeatures',
  'ParkingFeatures',
  'Flooring',
] as const;

/** Set form for O(1) keep checks. */
export const RAW_DATA_KEEP_SET: ReadonlySet<string> = new Set(RAW_DATA_KEEP_FIELDS);

/**
 * Slim a Trestle raw_data payload to only the keep set.
 *
 * Used by:
 *   - lib/idx/sync.ts on every Trestle upsert (stops ongoing growth)
 *   - scripts/neon-shed-raw-data.ts to backfill existing rows
 *   - app/api/cron/data-retention/route.ts to slim on terminal-status archive
 *
 * Returns a NEW object — does not mutate input. Returns `null` when input
 * is null/undefined to preserve "no raw_data on this row" semantics.
 *
 * Idempotent: slimRawData(slimRawData(x)) === slimRawData(x).
 */
export function slimRawData(
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!input || typeof input !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (RAW_DATA_KEEP_SET.has(key)) {
      out[key] = input[key];
    }
  }
  return out;
}

/**
 * Diagnostic: count bytes that WOULD be dropped if `slimRawData` were
 * applied. Used by `scripts/neon-storage-audit.ts` to project savings.
 *
 * Sums match the actual on-disk delta `slimRawData` produces:
 * `keptBytes` is exactly `JSON.stringify(slimRawData(input)).length` and
 * `keptBytes + droppedBytes === JSON.stringify(input).length`. Earlier
 * implementations summed only per-value `JSON.stringify(value).length`,
 * which omitted key names, quotes, colons, and commas — that undercounted
 * total raw_data size by 50-65% on real Trestle rows and made the audit
 * project ~5x lower savings than the actual full-scan dry-run.
 */
export function projectShedSavings(
  input: Record<string, unknown> | null | undefined
): { keptBytes: number; droppedBytes: number; droppedFields: string[] } {
  if (!input || typeof input !== 'object') {
    return { keptBytes: 0, droppedBytes: 0, droppedFields: [] };
  }
  const slimmed = slimRawData(input);
  const beforeBytes = JSON.stringify(input).length;
  const keptBytes = JSON.stringify(slimmed ?? {}).length;
  const droppedBytes = beforeBytes - keptBytes;
  const droppedFields: string[] = [];
  for (const key of Object.keys(input)) {
    if (!RAW_DATA_KEEP_SET.has(key)) droppedFields.push(key);
  }
  return { keptBytes, droppedBytes, droppedFields };
}
