/**
 * MALLAN-AUTHORED LISTINGS AS A CANONICAL SEARCH SOURCE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * `app/api/idx/search/route.ts` reads Cotality and nothing else — it contains no
 * prisma reference at all. It SUPPRESSES Mallan-office return-copies from the
 * provider feed, but never ADDS the canonical Mallan record, so a Mallan-authored
 * listing cannot appear in authenticated Search under any criterion.
 *
 * The Master Plan requires Backend Agent Search to include Mallan-authored
 * inventory, and `FIELD_REGISTRY.open_house` has always declared
 * `authorityByListingKind: { mallanLocal: 'mallan_crm', … }`. Only the provider
 * half was built.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A SOURCE, NOT AN OPEN-HOUSE PATCH
 *
 * The tempting shortcut is to read local rows only when `openHouse` is set.
 * That produces a listing that is absent from a normal search and present the
 * moment a filter is clicked — a second truth about what Mallan sells. Mallan
 * inventory is a SOURCE of the universe; Open House is one constraint over it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAME CRITERIA, OR NO SEARCH
 *
 * A local row may not skip a criterion because it came from Mallan storage.
 * Silently dropping the criterion is the invisible failure: the local half
 * widens while the provider half stays narrow, so one search applies two
 * different rules and looks entirely normal.
 *
 * So a criterion this source cannot express EXCLUDES the Mallan half and says
 * so by name. Refusing the whole search was the first design and was wrong: it
 * would regress provider searches that work today and are perfectly
 * answerable, turning a completed form into an error about inventory the
 * broker was not asking about.
 *
 * `buildPublicListingDbSearch` is deliberately NOT reused: it carries
 * public-audience restrictions, and agent Search has full lifecycle
 * intelligence. Importing those gates would quietly narrow what a broker sees.
 * The LOW-LEVEL canonical contracts are reused instead — bath semantics from
 * `bath-contract`, ownership from the shared Mallan-local rule.
 */
import { minBathsPrisma, maxBathsPrisma } from '@/lib/search/canonical/bath-contract';

/**
 * A criterion the broker asked for that Mallan-local inventory cannot answer.
 *
 * Thrown, never swallowed. The caller turns it into a refusal that NAMES the
 * criterion, so the broker learns which one rather than receiving a quietly
 * different result set.
 */
export class UnsupportedLocalCriterionError extends Error {
  readonly criterion: string;
  constructor(criterion: string) {
    super(
      `"${criterion}" cannot be applied to Mallan-authored listings. Applying ` +
        `it to the provider half only would answer one search with two sets of ` +
        `rules, so Mallan-authored inventory is EXCLUDED from this result and ` +
        `the response says so by name.`,
    );
    this.name = 'UnsupportedLocalCriterionError';
    this.criterion = criterion;
  }
}

/**
 * Criteria with a PROVEN column mapping on `Listing`.
 *
 * An ALLOWLIST, not a denylist. A criterion newly added to the executor is
 * unsupported here until someone maps it, which fails loud instead of leaking
 * an unfiltered local row into a filtered result set.
 */
export const MALLAN_LOCAL_SUPPORTED_CRITERIA: ReadonlySet<string> = new Set([
  'minPrice', 'maxPrice',
  'minBeds', 'maxBeds', 'beds',
  'minBaths', 'maxBaths',
  'minSqft', 'maxSqft',
  'type', 'status', 'borough', 'neighborhood', 'propertySubType',
  'listingId',
  // MAPPED 2026-09-02 after a column-by-column coverage diff. Each of these
  // has a real column on `Listing`, so refusing them would have excluded
  // Mallan inventory from ordinary searches that Mallan can actually answer.
  'address',            // Listing.address
  'zip',                // Listing.postal_code
  'contractDateFrom', 'contractDateTo',   // Listing.listing_contract_date
  'dateFrom', 'dateTo', 'dateType',       // contract date OR modification_timestamp
  'ownership',          // Listing.property_sub_type
  // PROVIDER-DOMAIN, handled without refusing: a Mallan-authored listing has
  // no ListingKey, so it simply cannot match. Contributing nothing is the
  // correct answer; refusing the whole search would be wrong.
  'listingKey',
]);

/**
 * Request-shaping parameters that are NOT criteria.
 *
 * These arrive on essentially every request. Treating them as unmapped criteria
 * would refuse every mixed search — the refusal has to be about narrowing
 * intent, not about transport.
 */
const NON_CRITERION_PARAMS: ReadonlySet<string> = new Set([
  'page', 'limit', 'skip', 'sort', 'exactCount', 'continuation', 'view', 'tab',
  // Open House is applied as a CORPUS constraint by the caller, from the
  // membership contract — not as a column predicate here.
  'openHouse', 'openHouseDateFrom', 'openHouseDateTo',
]);

/** The Prisma `where` shape this builder produces. */
export interface MallanLocalWhere {
  [key: string]: unknown;
  list_price?: { gte?: number; lte?: number };
  bedrooms_total?: { gte?: number; lte?: number };
  living_area?: { gte?: number; lte?: number };
  listing_type?: string;
}

const num = (v: string | null): number | undefined => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The `where` for Mallan-authored candidates under the broker's active criteria.
 *
 * PURE — every criterion and every refusal is provable without a database, which
 * is also why none of this needs a Production probe.
 */
export function buildMallanLocalWhere(params: URLSearchParams): { where: MallanLocalWhere } {
  // REFUSE FIRST. Building a partial where and discovering the gap afterwards
  // is how a half-filtered row escapes.
  for (const [key, value] of params.entries()) {
    if (!value || !value.trim()) continue;
    if (NON_CRITERION_PARAMS.has(key)) continue;
    if (!MALLAN_LOCAL_SUPPORTED_CRITERIA.has(key)) {
      throw new UnsupportedLocalCriterionError(key);
    }
  }

  const and: unknown[] = [];
  const where: MallanLocalWhere = {
    // MALLAN-AUTHORED ONLY. The same ownership rule the open-house readers use
    // (`isMallanOwnedLocalListing`), expressed as a query rather than restated:
    // an SL-/RL- identity, or explicitly off-RLS.
    OR: [
      { rls_eligible: false },
      { listing_id: { startsWith: 'SL-' } },
      { listing_id: { startsWith: 'RL-' } },
    ],
  };

  const minPrice = num(params.get('minPrice'));
  const maxPrice = num(params.get('maxPrice'));
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.list_price = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
    };
  }

  const minBeds = num(params.get('minBeds') ?? params.get('beds'));
  const maxBeds = num(params.get('maxBeds'));
  if (minBeds !== undefined || maxBeds !== undefined) {
    where.bedrooms_total = {
      ...(minBeds !== undefined ? { gte: minBeds } : {}),
      ...(maxBeds !== undefined ? { lte: maxBeds } : {}),
    };
  }

  // BATHS COME FROM THE CANONICAL CONTRACT.
  //
  // Half-baths are exactly what a naive `bathrooms_full >= n` gets wrong, and
  // the contract already encodes the alternatives. Re-deriving them here would
  // make 1.5 baths mean two different things inside one result set.
  const minBaths = num(params.get('minBaths'));
  if (minBaths !== undefined) and.push(minBathsPrisma(minBaths));
  const maxBaths = num(params.get('maxBaths'));
  if (maxBaths !== undefined) and.push(maxBathsPrisma(maxBaths));

  const minSqft = num(params.get('minSqft'));
  const maxSqft = num(params.get('maxSqft'));
  if (minSqft !== undefined || maxSqft !== undefined) {
    where.living_area = {
      ...(minSqft !== undefined ? { gte: minSqft } : {}),
      ...(maxSqft !== undefined ? { lte: maxSqft } : {}),
    };
  }

  // The workflow selector, not a provider field: Sale and Rental are two
  // universes and `listing_type` is how Mallan storage says which.
  const type = params.get('type');
  if (type) where.listing_type = type === 'rental' ? 'rent' : 'sale';

  const status = params.get('status');
  if (status) {
    const wanted = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (wanted.length) where.status = { in: wanted };
  }

  const borough = params.get('borough');
  if (borough) {
    const wanted = borough.split(',').map((s) => s.trim()).filter(Boolean);
    if (wanted.length) where.borough = { in: wanted };
  }

  // Repeated parameters, matching how the executor receives neighbourhoods.
  const neighborhoods = params.getAll('neighborhood').flatMap((v) =>
    v.split(',').map((s) => s.trim()).filter(Boolean));
  if (neighborhoods.length) where.neighborhood = { in: neighborhoods };

  const subType = params.get('propertySubType');
  if (subType) {
    const wanted = subType.split(',').map((s) => s.trim()).filter(Boolean);
    if (wanted.length) where.property_sub_type = { in: wanted };
  }

  const address = params.get('address');
  if (address && address.trim()) {
    where.address = { contains: address.trim(), mode: 'insensitive' };
  }

  const zip = params.get('zip');
  if (zip) {
    const codes = zip.split(',').map((z) => z.trim()).filter(Boolean);
    if (codes.length) where.postal_code = { in: codes };
  }

  // Ownership resolves through property_sub_type on Mallan storage. It is the
  // same fact the provider expresses through its ownership vocabulary; the
  // column is what Mallan actually has.
  const ownership = params.get('ownership');
  if (ownership) {
    const wanted = ownership.split(',').map((o) => o.trim()).filter(Boolean);
    if (wanted.length) where.property_sub_type = { in: wanted };
  }

  // CONTRACT DATE, and the activity-date basis.
  //
  // `dateType` names WHICH date the range means. Applying a range without its
  // basis would silently answer a different question than the broker asked,
  // so an unrecognised basis refuses rather than defaulting.
  const contractFrom = params.get('contractDateFrom');
  const contractTo = params.get('contractDateTo');
  if (contractFrom || contractTo) {
    where.listing_contract_date = {
      ...(contractFrom ? { gte: new Date(contractFrom) } : {}),
      ...(contractTo ? { lte: new Date(contractTo) } : {}),
    };
  }

  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');
  if (dateFrom || dateTo) {
    const basis = (params.get('dateType') || '').toLowerCase();
    const column = basis === 'updated' || basis === 'modified'
      ? 'modification_timestamp'
      : basis === 'listed' || basis === '' 
        ? 'listing_contract_date'
        : null;
    if (!column) throw new UnsupportedLocalCriterionError('dateType');
    where[column] = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  // A ListingKey can never match a Mallan-authored listing, which HAS no
  // ListingKey. An impossible predicate is the honest expression of that: the
  // local source contributes nothing to this search rather than refusing it.
  if (params.get('listingKey')) where.id = { in: [] };

  // The MALLAN identity domain. `listingId` here means `Listing.listing_id`
  // (SL-/RL-). It is never a ListingKey and is never sent to the provider.
  const listingId = params.get('listingId');
  if (listingId) {
    const ids = listingId.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) where.listing_id = { in: ids };
  }

  if (and.length) where.AND = and;
  return { where };
}
