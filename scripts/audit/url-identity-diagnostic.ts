// scripts/audit/url-identity-diagnostic.ts
//
// READ-ONLY URL-identity diagnostic LOGIC (DESIGN v1, approved for
// implementation only 2026-07-20). Entry point: url-identity-diagnostic.cli.ts.
//
// PURPOSE — characterize why run 88518 rewrote all changed rows on a
// media_url_original mismatch. Compares, per sampled MediaKey:
//   S  = previously stored MediaURL from the deployed (UNSCOPED) Media-query
//        pipeline (read read-only from Neon)
//   D1 = deployed-filter-EQUIVALENT UNSCOPED response (ResourceRecordKey only)
//   P1 = Property-scoped response (ResourceName eq 'Property' AND RRK)
//   P2 = Property-scoped response after a declared interval (rotation probe)
//
// This module is PURE + injectable. It performs NO I/O itself: Neon and
// Cotality are injected read-only readers. It NEVER writes, NEVER triggers a
// cron, NEVER moves a cursor, NEVER touches R2. Output is aggregate +
// categorical only — no raw URL / pathname / query / MediaKey / ListingKey /
// listing id / reusable hash ever leaves this module.
//
// Reuses the already-merged #525 request-accounting + cap primitives so no new
// credential-handling code is introduced.

import {
  makeAccountant, attemptWithAccounting, CapStopError,
  type RequestAccountant,
} from './media-coverage-audit';

// ─── Approved finalized parameters (DESIGN v1) ──────────────────────────────

export const DIAG_PARAMS = {
  NEON_SAMPLE: 30,
  MAX_LISTINGS: 5,
  ROWS_PER_LISTING: 6,
  TOP: 100,
  MAX_PAGES: 2, // per listing/scope/fetch — a 3rd page marks that unit incomplete
  DATA_ATTEMPT_CAP: 60, // 5 listings × 3 rounds (D1,P1,P2) × 2 pages × 2 attempts
  AUTH_ACQUISITIONS_MAX: 1,
  RETRIES: 1, // retryable failures only (timeout / network / HTTP 5xx) — never 4xx
  CONCURRENCY: 1, // sequential
  INTERVAL_MS: 15 * 60 * 1000,
} as const;

// Run-88518 write window (audit created_at − duration_ms .. audit created_at),
// arithmetic exact: 02:02:04.334Z − 24.336s = 02:01:39.998Z.
export const RUN_88518_WINDOW = {
  startIso: '2026-07-21T02:01:39.998Z',
  endIso: '2026-07-21T02:02:04.334Z',
  maxBufferMs: 2000, // max 2s each side if the primary window is short; reported
} as const;

// ─── Injected read-only reader shapes ───────────────────────────────────────

/** A stored listing_media row, retrieved read-only for IN-MEMORY classification
 *  only. media_url_original is compared/classified then discarded — it is NEVER
 *  emitted in the report. */
export interface StoredMediaRow {
  listingId: string;          // in-memory only
  mediaKey: string;           // in-memory only (join key)
  resourceRecordKey: string;  // = ListingKey (in-memory only)
  mediaUrlOriginal: string;   // S — in-memory only
  mediaCategory: string | null;
  mediaType: string;          // internal MediaCategory-derived type
  order: number;
  status: string;
  updatedAtMs: number;
}

/** READ-ONLY Neon reader — the ONLY database capability the logic can reach.
 *  The concrete impl runs inside `BEGIN; SET TRANSACTION READ ONLY; … ROLLBACK`. */
export interface DiagnosticNeonReader {
  /** Candidate active feed rows within the (possibly widened) run window. */
  sampleCandidates(startIso: string, endIso: string): Promise<StoredMediaRow[]>;
  /** True if the reader had to widen the primary window to reach the sample. */
  windowWidened(): boolean;
}

export type MediaScope = 'unscoped' | 'property';

/** One raw Cotality Media row (the 14 selected fields, verbatim). */
export interface RawMediaRow {
  MediaKey: string | null;
  ResourceName: string | null;
  ResourceRecordKey: string | null;
  ResourceRecordID: string | null;
  MediaURL: string | null;
  MediaCategory: string | null;
  MediaClassification: string | null;
  MediaType: string | null;
  MediaStatus: string | null;
  Permission: string | null;
  Order: number | string | null;
  PreferredPhotoYN: boolean | string | null;
  ModificationTimestamp: string | null;
  MediaModificationTimestamp: string | null;
}

export interface MediaFetchResult {
  rows: RawMediaRow[];
  complete: boolean;
  /** Set when complete=false: pagination cap / invalid nextLink / dup key / HTTP / cap. */
  incompleteReason?: string;
}

/** READ-ONLY Cotality reader. `fetchMedia` follows @odata.nextLink up to
 *  MAX_PAGES; a required 3rd page → incomplete (never exceed the page cap). */
export interface DiagnosticCotalityReader {
  fetchMedia(listingKey: string, scope: MediaScope, acct: RequestAccountant): Promise<MediaFetchResult>;
}

// ─── Deterministic sample stratification ────────────────────────────────────

/**
 * Deterministic stratified sample: pick up to MAX_LISTINGS distinct
 * resource_record_key values (sorted), then up to ROWS_PER_LISTING media_key
 * rows per key (sorted). Never a global LIMIT that could collapse to one
 * listing. Excludes crm: rows and rows missing the join/compare fields.
 */
export function stratifySample(
  candidates: StoredMediaRow[],
  maxListings = DIAG_PARAMS.MAX_LISTINGS,
  rowsPerListing = DIAG_PARAMS.ROWS_PER_LISTING,
): StoredMediaRow[] {
  const eligible = candidates.filter(
    (r) => r.status === 'active' && r.resourceRecordKey && r.mediaUrlOriginal && !r.mediaKey.startsWith('crm:'),
  );
  const byKey = new Map<string, StoredMediaRow[]>();
  for (const r of eligible) {
    const arr = byKey.get(r.resourceRecordKey) ?? [];
    arr.push(r);
    byKey.set(r.resourceRecordKey, arr);
  }
  const keys = [...byKey.keys()].sort().slice(0, maxListings);
  const out: StoredMediaRow[] = [];
  for (const k of keys) {
    const rows = (byKey.get(k) ?? []).slice().sort((a, b) => a.mediaKey.localeCompare(b.mediaKey)).slice(0, rowsPerListing);
    out.push(...rows);
  }
  return out.slice(0, DIAG_PARAMS.NEON_SAMPLE);
}

// ─── Production-eligibility (the actual deployed mapper gate) ────────────────

/** The rows the CURRENT deployed mapper would ingest: MediaKey present,
 *  MediaStatus !== 'Deleted', Permission absent or exactly 'Public', MediaURL
 *  present. (Mirrors upsertListingMedia's pre-map filter.) */
export function isProductionEligible(row: RawMediaRow): boolean {
  if (!row.MediaKey) return false;
  if (row.MediaStatus === 'Deleted') return false;
  if (row.Permission != null && String(row.Permission) !== 'Public') return false;
  if (!row.MediaURL) return false;
  return true;
}

// ─── URL identity + redaction-safe classification ───────────────────────────

/** Normalized identity for comparison ONLY: lowercased origin + pathname,
 *  query/fragment dropped. Total & non-throwing (malformed → trimmed raw). */
export function normalizeIdentity(url: string | null | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    return u.origin.toLowerCase() + u.pathname;
  } catch {
    return raw;
  }
}

export type HostFamily = 'cotality' | 'corelogic' | 'other';
export type PathFamily = 'photo' | 'document' | 'floorplan' | 'video' | 'virtual_tour' | 'other';

export function hostFamily(hostname: string): HostFamily {
  const h = hostname.toLowerCase();
  if (h === 'cotality.com' || h.endsWith('.cotality.com')) return 'cotality';
  if (h === 'corelogic.com' || h.endsWith('.corelogic.com')) return 'corelogic';
  return 'other';
}

export function pathFamily(pathname: string): PathFamily {
  const p = pathname.toLowerCase();
  if (p.includes('floorplan') || p.includes('floor_plan') || p.includes('floor-plan')) return 'floorplan';
  if (p.includes('virtualtour') || p.includes('virtual_tour') || p.includes('virtual-tour')) return 'virtual_tour';
  if (p.includes('video')) return 'video';
  if (p.includes('document') || p.includes('/doc') || p.includes('disclosure')) return 'document';
  if (p.includes('photo') || p.includes('image') || /\.(jpe?g|png|gif|webp|bmp|tiff?)$/.test(p)) return 'photo';
  return 'other';
}

/** Redaction-safe classification of ONE URL — the ONLY per-URL info that may
 *  ever leave this module. No full pathname, query value, or reusable hash. */
export interface UrlClass {
  scheme: string;
  hostFamily: HostFamily;
  pathFamily: PathFamily;
  pathSegmentCount: number;
  fileExtensionOrNone: string; // extension token or 'none'
  hasQuery: boolean;
  malformed: boolean;
}

export function classifyUrl(url: string | null | undefined): UrlClass {
  const raw = (url ?? '').trim();
  const none: UrlClass = { scheme: 'none', hostFamily: 'other', pathFamily: 'other', pathSegmentCount: 0, fileExtensionOrNone: 'none', hasQuery: false, malformed: true };
  if (!raw) return none;
  try {
    const u = new URL(raw);
    const segs = u.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1] ?? '';
    const dot = last.lastIndexOf('.');
    const ext = dot > 0 && dot < last.length - 1 ? last.slice(dot + 1).toLowerCase() : 'none';
    return {
      scheme: u.protocol.replace(':', ''),
      hostFamily: hostFamily(u.hostname),
      pathFamily: pathFamily(u.pathname),
      pathSegmentCount: segs.length,
      fileExtensionOrNone: /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'none',
      hasQuery: u.search.length > 0,
      malformed: false,
    };
  } catch {
    return none;
  }
}

export interface UrlComparison { exactEqual: boolean; identityEqual: boolean; }
export function compareUrls(a: string | null | undefined, b: string | null | undefined): UrlComparison {
  return { exactEqual: (a ?? '') === (b ?? ''), identityEqual: normalizeIdentity(a) === normalizeIdentity(b) };
}

/** Categorical transition between two URLs (redaction-safe). */
export interface UrlTransition {
  hostFrom: HostFamily;
  hostTo: HostFamily;
  hostChanged: boolean;
  pathFamilyChanged: boolean;
  pathnameChangedSameHost: boolean;
}
export function classifyTransition(from: string | null | undefined, to: string | null | undefined): UrlTransition {
  const cf = classifyUrl(from);
  const ct = classifyUrl(to);
  const idFrom = normalizeIdentity(from);
  const idTo = normalizeIdentity(to);
  const hostChanged = cf.hostFamily !== ct.hostFamily;
  return {
    hostFrom: cf.hostFamily,
    hostTo: ct.hostFamily,
    hostChanged,
    pathFamilyChanged: cf.pathFamily !== ct.pathFamily,
    pathnameChangedSameHost: !hostChanged && idFrom !== idTo,
  };
}

// ─── Strict Media nextLink validation (DESIGN v1 §6) ────────────────────────

/** Reject (never normalize) any nextLink that is not EXACTLY a Media OData link
 *  on the approved origin. The bearer token is attached only after this passes. */
export function validateMediaNextLink(nextLink: string, base: string): { url: string } | { error: string } {
  let allowed: URL;
  let cand: URL;
  try { allowed = new URL(base); } catch { return { error: 'base invalid' }; }
  try { cand = new URL(nextLink, base); } catch { return { error: 'nextLink not a URL' }; }
  if (cand.protocol !== 'https:') return { error: 'nextLink not https' };
  if (cand.username || cand.password) return { error: 'nextLink embeds credentials' };
  if (cand.hash) return { error: 'nextLink has a fragment' };
  if (cand.origin !== 'https://api.cotality.com' || allowed.origin !== 'https://api.cotality.com') return { error: 'nextLink origin not approved' };
  if (cand.pathname !== '/trestle/odata/Media') return { error: 'nextLink path not /trestle/odata/Media' };
  return { url: cand.toString() };
}

/** Build the Media query params for a scope (deterministic tie-breaker on
 *  MediaKey so the diagnostic set is stable — this INTENTIONALLY differs from
 *  the deployed 'Order asc' only). */
export function buildMediaQuery(listingKey: string, scope: MediaScope): URLSearchParams {
  const esc = listingKey.replace(/'/g, "''");
  const filter = scope === 'property'
    ? `ResourceName eq 'Property' and ResourceRecordKey eq '${esc}'`
    : `ResourceRecordKey eq '${esc}'`;
  const p = new URLSearchParams();
  p.set('$filter', filter);
  p.set('$select', 'MediaKey,ResourceName,ResourceRecordKey,ResourceRecordID,MediaURL,MediaCategory,MediaClassification,MediaType,MediaStatus,Permission,Order,PreferredPhotoYN,ModificationTimestamp,MediaModificationTimestamp');
  p.set('$orderby', 'Order asc,MediaKey asc');
  p.set('$top', String(DIAG_PARAMS.TOP));
  return p;
}

// ─── Outcome model ──────────────────────────────────────────────────────────

export type OutcomeCategory =
  | 'active_instability_proven'
  | 'exact_only_instability'
  | 'stored_differs_from_property_stable_window'
  | 'stable_during_window_only'
  | 'inconclusive';

export interface KeyResult {
  slot: number; // sample slot index — NOT a MediaKey
  /** Which sources yielded a usable URL for this key. */
  present: { S: boolean; D1: boolean; P1: boolean; P2: boolean };
  outcome: OutcomeCategory;
  // categorical comparisons (redaction-safe)
  s_vs_p1: UrlComparison | null;
  p1_vs_p2: UrlComparison | null;
  s_vs_d1: UrlComparison | null;
  d1_vs_p1: UrlComparison | null;
  transitionStoP1: UrlTransition | null;
}

/** Derive the per-key outcome. Stable outcomes are NEVER labeled as one-time
 *  historical drift; window stability is explicitly window-scoped. */
export function deriveKeyOutcome(present: KeyResult['present'], s_vs_p1: UrlComparison | null, p1_vs_p2: UrlComparison | null): OutcomeCategory {
  if (!present.P1 || !present.P2 || !s_vs_p1 || !p1_vs_p2) return 'inconclusive';
  if (!p1_vs_p2.identityEqual) return 'active_instability_proven';
  if (p1_vs_p2.identityEqual && !p1_vs_p2.exactEqual) return 'exact_only_instability';
  // P1 == P2 by identity from here on.
  if (!present.S) return 'inconclusive';
  if (!s_vs_p1.identityEqual) return 'stored_differs_from_property_stable_window';
  return 'stable_during_window_only';
}

// ─── Aggregate report (categorical only — no raw values) ────────────────────

export interface DiagnosticReport {
  params: typeof DIAG_PARAMS;
  window: { startIso: string; endIso: string; widened: boolean };
  auth: { auth_provider: 'existing_getAccessToken'; auth_network_attempts: 0 | 1; data_redirect_policy: 'error' };
  sample: { candidates: number; sampledRows: number; distinctListings: number };
  cotality: { dataAttempts: number; retries: number; capReached: boolean };
  // scope (B1)
  scope: {
    unscoped_has_non_property_row: boolean; // direct B1 contamination observation
    d1_raw_keyset_eq_p1_raw_keyset: boolean;
    d1_eligible_keyset_eq_p1_eligible_keyset: boolean;
  };
  outcomes: Record<OutcomeCategory, number>;
  transitions: {
    corelogic_to_cotality: number;
    cotality_to_cotality: number;
    other_to_cotality: number;
    path_family_changed: number;
    host_changed: number;
    pathname_changed_same_host: number;
  };
  // B2/B3 observations — complete Property-scoped responses only
  categoryDistribution: Record<string, number>;
  classificationDistribution: Record<string, number>;
  mediaTypeDistribution: Record<string, number>;
  internalDerivedTypeNote: string;
  incompleteUnits: Array<{ listingSlot: number; scope: MediaScope; page: number; reason: string }>;
  notes: string[];
}

/** Empty distributions helper. */
export function emptyOutcomes(): Record<OutcomeCategory, number> {
  return {
    active_instability_proven: 0,
    exact_only_instability: 0,
    stored_differs_from_property_stable_window: 0,
    stable_during_window_only: 0,
    inconclusive: 0,
  };
}

// ─── Bounded orchestration (injected readers; NO I/O of its own) ────────────

export interface DiagnosticDeps {
  neon: DiagnosticNeonReader;
  cotality: DiagnosticCotalityReader;
  /** Whether the CLI acquired a token this run (0 or 1) — reported, not used. */
  authNetworkAttempts: 0 | 1;
  /** Injected interval wait between P1 and P2 (no-op in tests). */
  waitInterval?: () => Promise<void>;
  /** Internal MediaCategory-derived type function (production parity, read-only). */
  deriveInternalType?: (category: string | null | undefined) => string;
  params?: typeof DIAG_PARAMS;
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
const keySet = (rows: RawMediaRow[]) => new Set(rows.filter((r) => r.MediaKey).map((r) => String(r.MediaKey)));
const setsEqual = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Build a MediaKey→row map; a duplicate MediaKey across pages is a hard
 *  incomplete condition (returns null). */
function indexByKey(res: MediaFetchResult): Map<string, RawMediaRow> | null {
  const m = new Map<string, RawMediaRow>();
  for (const r of res.rows) {
    if (!r.MediaKey) continue;
    const k = String(r.MediaKey);
    if (m.has(k)) return null; // duplicate MediaKey → incomplete
    m.set(k, r);
  }
  return m;
}

export async function runUrlIdentityDiagnostic(deps: DiagnosticDeps): Promise<DiagnosticReport> {
  const params = deps.params ?? DIAG_PARAMS;
  const acct = makeAccountant(params.DATA_ATTEMPT_CAP);
  const report: DiagnosticReport = {
    params,
    window: { startIso: RUN_88518_WINDOW.startIso, endIso: RUN_88518_WINDOW.endIso, widened: false },
    auth: { auth_provider: 'existing_getAccessToken', auth_network_attempts: deps.authNetworkAttempts, data_redirect_policy: 'error' },
    sample: { candidates: 0, sampledRows: 0, distinctListings: 0 },
    cotality: { dataAttempts: 0, retries: 0, capReached: false },
    scope: { unscoped_has_non_property_row: false, d1_raw_keyset_eq_p1_raw_keyset: true, d1_eligible_keyset_eq_p1_eligible_keyset: true },
    outcomes: emptyOutcomes(),
    transitions: { corelogic_to_cotality: 0, cotality_to_cotality: 0, other_to_cotality: 0, path_family_changed: 0, host_changed: 0, pathname_changed_same_host: 0 },
    categoryDistribution: {},
    classificationDistribution: {},
    mediaTypeDistribution: {},
    internalDerivedTypeNote: 'internal type = deployed classifyTrestleMediaCategory(MediaCategory); Cotality MediaType is a SEPARATE field (B3).',
    incompleteUnits: [],
    notes: [],
  };

  const candidates = await deps.neon.sampleCandidates(RUN_88518_WINDOW.startIso, RUN_88518_WINDOW.endIso);
  report.window.widened = deps.neon.windowWidened();
  report.sample.candidates = candidates.length;
  const sampled = stratifySample(candidates, params.MAX_LISTINGS, params.ROWS_PER_LISTING);
  report.sample.sampledRows = sampled.length;

  const byListing = new Map<string, StoredMediaRow[]>();
  for (const r of sampled) {
    const arr = byListing.get(r.resourceRecordKey) ?? [];
    arr.push(r);
    byListing.set(r.resourceRecordKey, arr);
  }
  const listingKeys = [...byListing.keys()];
  report.sample.distinctListings = listingKeys.length;

  const derive = deps.deriveInternalType;

  // Fetch helper that records incompletes + accounting, never throws on cap.
  const fetchUnit = async (listingKey: string, scope: MediaScope, slot: number): Promise<Map<string, RawMediaRow> | null> => {
    let res: MediaFetchResult;
    try {
      res = await deps.cotality.fetchMedia(listingKey, scope, acct);
    } catch (e) {
      if (e instanceof CapStopError) { report.cotality.capReached = true; report.incompleteUnits.push({ listingSlot: slot, scope, page: 0, reason: 'request-cap' }); return null; }
      report.incompleteUnits.push({ listingSlot: slot, scope, page: 0, reason: 'transport' });
      return null;
    }
    if (!res.complete) { report.incompleteUnits.push({ listingSlot: slot, scope, page: 0, reason: res.incompleteReason ?? 'incomplete' }); return null; }
    const idx = indexByKey(res);
    if (!idx) { report.incompleteUnits.push({ listingSlot: slot, scope, page: 0, reason: 'duplicate-media-key' }); return null; }
    return idx;
  };

  const d1By = new Map<string, Map<string, RawMediaRow> | null>();
  const p1By = new Map<string, Map<string, RawMediaRow> | null>();
  const p1Complete = new Map<string, MediaFetchResult | null>();

  // First pass — D1 (unscoped) + P1 (property).
  for (let s = 0; s < listingKeys.length; s += 1) {
    const lk = listingKeys[s];
    d1By.set(lk, await fetchUnit(lk, 'unscoped', s));
    // capture raw P1 result for keyset + distribution + scope observations
    let p1res: MediaFetchResult | null = null;
    try { p1res = await deps.cotality.fetchMedia(lk, 'property', acct); } catch (e) {
      if (e instanceof CapStopError) report.cotality.capReached = true;
      report.incompleteUnits.push({ listingSlot: s, scope: 'property', page: 0, reason: e instanceof CapStopError ? 'request-cap' : 'transport' });
    }
    if (p1res && p1res.complete) {
      const idx = indexByKey(p1res);
      if (!idx) { report.incompleteUnits.push({ listingSlot: s, scope: 'property', page: 0, reason: 'duplicate-media-key' }); p1By.set(lk, null); p1Complete.set(lk, null); }
      else { p1By.set(lk, idx); p1Complete.set(lk, p1res); }
    } else { if (p1res && !p1res.complete) report.incompleteUnits.push({ listingSlot: s, scope: 'property', page: 0, reason: p1res.incompleteReason ?? 'incomplete' }); p1By.set(lk, null); p1Complete.set(lk, null); }

    // Scope (B1) observations from D1 raw response — need raw rows; refetch view
    const d1idx = d1By.get(lk) ?? null;
    if (d1idx && p1res && p1res.complete) {
      const d1raw = [...d1idx.values()];
      if (d1raw.some((r) => r.ResourceName != null && String(r.ResourceName) !== 'Property')) report.scope.unscoped_has_non_property_row = true;
      const d1keys = keySet(d1raw); const p1keys = keySet(p1res.rows);
      if (!setsEqual(d1keys, p1keys)) report.scope.d1_raw_keyset_eq_p1_raw_keyset = false;
      const d1elig = keySet(d1raw.filter(isProductionEligible)); const p1elig = keySet(p1res.rows.filter(isProductionEligible));
      if (!setsEqual(d1elig, p1elig)) report.scope.d1_eligible_keyset_eq_p1_eligible_keyset = false;
    }

    // B2/B3 distributions — COMPLETE Property-scoped responses only.
    if (p1res && p1res.complete) {
      for (const r of p1res.rows) {
        bump(report.categoryDistribution, r.MediaCategory ? String(r.MediaCategory) : 'null');
        bump(report.classificationDistribution, r.MediaClassification ? String(r.MediaClassification) : 'null');
        bump(report.mediaTypeDistribution, r.MediaType ? String(r.MediaType) : 'null');
        if (derive) bump(report.mediaTypeDistribution, `internal:${derive(r.MediaCategory)}`);
      }
    }
  }

  if (deps.waitInterval) await deps.waitInterval();

  // Second pass — P2 (property).
  const p2By = new Map<string, Map<string, RawMediaRow> | null>();
  for (let s = 0; s < listingKeys.length; s += 1) {
    p2By.set(listingKeys[s], await fetchUnit(listingKeys[s], 'property', s));
  }

  // Per-sampled-key comparison + outcome.
  for (const row of sampled) {
    const lk = row.resourceRecordKey;
    const d1 = d1By.get(lk)?.get(row.mediaKey)?.MediaURL ?? null;
    const p1 = p1By.get(lk)?.get(row.mediaKey)?.MediaURL ?? null;
    const p2 = p2By.get(lk)?.get(row.mediaKey)?.MediaURL ?? null;
    const present = { S: !!row.mediaUrlOriginal, D1: !!d1, P1: !!p1, P2: !!p2 };
    const s_vs_p1 = present.S && present.P1 ? compareUrls(row.mediaUrlOriginal, p1) : null;
    const p1_vs_p2 = present.P1 && present.P2 ? compareUrls(p1, p2) : null;
    const outcome = deriveKeyOutcome(present, s_vs_p1, p1_vs_p2);
    report.outcomes[outcome] += 1;
    if (present.S && present.P1) {
      const t = classifyTransition(row.mediaUrlOriginal, p1);
      if (t.hostTo === 'cotality') {
        if (t.hostFrom === 'corelogic') report.transitions.corelogic_to_cotality += 1;
        else if (t.hostFrom === 'cotality') report.transitions.cotality_to_cotality += 1;
        else report.transitions.other_to_cotality += 1;
      }
      if (t.pathFamilyChanged) report.transitions.path_family_changed += 1;
      if (t.hostChanged) report.transitions.host_changed += 1;
      if (t.pathnameChangedSameHost) report.transitions.pathname_changed_same_host += 1;
    }
  }

  report.cotality.dataAttempts = acct.attempts;
  report.cotality.retries = acct.retries;
  report.notes.push('Stable outcomes are WINDOW-scoped only and do NOT prove one-time historical drift or permanent stability.');
  report.notes.push('D1 and P1 are separate requests; a D1/P1 difference is a scope-EFFECT signal, not proof scope alone caused it.');
  return report;
}

// NOTE: the concrete read-only Neon + Cotality readers + the single token live
// in the CLI. Execution against Neon or Cotality is a SEPARATE explicit
// approval — nothing in this module performs I/O.
export { makeAccountant, attemptWithAccounting, CapStopError };
export type { RequestAccountant };
