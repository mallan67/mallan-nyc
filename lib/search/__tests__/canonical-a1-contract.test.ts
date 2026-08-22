/// <reference types="jest" />
/**
 * canonical-a1-contract.test.ts — A1 pure canonical dimensions.
 *
 * Proves: enum exhaustiveness; unknown values fail loud/typed; the exact
 * audience×scope matrix; supplemental private-by-default + fail-closed source
 * permission; authority/platform/access are separate axes; evidence classes are
 * distinct (only VALUATION_EVIDENCE drives value); ContractDecision narrows; and
 * NO runtime reader imports the canonical package (A1 wires nothing).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  // provenance
  SOURCE_AUTHORITIES,
  OBSERVATION_PLATFORMS,
  SOURCE_ACCESS_METHODS,
  isSourceAuthority,
  isObservationPlatform,
  isSourceAccessMethod,
  ACCESS_METHODS_BY_AUTHORITY,
  isAccessMethodAllowedForAuthority,
  // inventory scope
  INVENTORY_SCOPES,
  isInventoryScope,
  isPrivateInventoryScope,
  evaluateInventoryScopeAccess,
  // record status
  VERIFICATION_STATUSES,
  SUPPLEMENTAL_LIFECYCLE_STATUSES,
  isSuppressedLifecycle,
  // evidence
  EVIDENCE_CLASSIFICATIONS,
  mayDriveValuation,
  // identity
  IDENTITY_RESOLUTION_STATUSES,
  isCanonicalEntityReference,
  // permissions
  evaluateSourcePermission,
  type SourcePermissionCapabilities,
  type SourceLicenseState,
  // attribution envelope
  isAttributionEnvelope,
  attributionEnvelopeCourtesy,
  type AttributionEnvelope,
  // contract decision
  contractOk,
  contractFail,
  isContractOk,
  isContractFailure,
  assertKnownEnumValue,
  assertKnownCriterion,
  type ContractDecision,
} from '../canonical';
import type { Audience } from '../visibility-contract';

const AUDIENCES: readonly Audience[] = ['public', 'client', 'agent', 'internal_report'];

describe('A1 · enum exhaustiveness + guards', () => {
  const cases: Array<[string, readonly string[], string[], (v: unknown) => boolean]> = [
    // `mallan_derived` added 2026-08-20: Mallan COMPUTES the fact from verified
    // inputs (geocoding, transit, canonical address normalisation).
    // Distinct from `mallan_crm`, which is Mallan-owned BUSINESS data. Needed
    // because Cotality BuildingKey/BuildingKeyNumeric are populated 0/8,056 and
    // GET /Building is 403, so building identity and coordinates must be
    // Mallan-derived — and must never be attributed to the provider.
    ['SourceAuthority', SOURCE_AUTHORITIES, ['cotality', 'acris', 'nyc_dob', 'mallan_crm', 'mallan_derived', 'supplemental'], isSourceAuthority],
    ['ObservationPlatform', OBSERVATION_PLATFORMS, ['streeteasy', 'zillow', 'direct_broker_feed', 'property_manager_feed', 'owner_submitted', 'manual_agent_research', 'none'], isObservationPlatform],
    ['SourceAccessMethod', SOURCE_ACCESS_METHODS, ['licensed_api', 'licensed_feed', 'direct_partner', 'public_api', 'public_dataset', 'internal_system', 'manual_agent_research'], isSourceAccessMethod],
    ['InventoryScope', INVENTORY_SCOPES, ['public_inventory', 'client_inventory', 'agent_complete_inventory', 'cotality_only', 'mallan_exclusive', 'supplemental_only', 'missing_from_cotality', 'verification_required', 'source_conflicts'], isInventoryScope],
    ['VerificationStatus', VERIFICATION_STATUSES, ['verified', 'verification_required', 'stale', 'conflicted'], undefined as unknown as (v: unknown) => boolean],
    ['SupplementalLifecycleStatus', SUPPLEMENTAL_LIFECYCLE_STATUSES, ['active', 'removed_at_source', 'superseded_by_rebny', 'license_blocked'], undefined as unknown as (v: unknown) => boolean],
    ['EvidenceClassification', EVIDENCE_CLASSIFICATIONS, ['VALUATION_EVIDENCE', 'ACTIVE_COMPETITION', 'SUPPLEMENTAL_MARKET_OBSERVATION', 'PROPERTY_FACT', 'UNVERIFIED_LEAD'], undefined as unknown as (v: unknown) => boolean],
    ['IdentityResolutionStatus', IDENTITY_RESOLUTION_STATUSES, ['resolved', 'partial', 'ambiguous', 'unresolved'], undefined as unknown as (v: unknown) => boolean],
  ];

  it.each(cases)('%s: members are exactly the approved set', (_name, members, expected) => {
    expect([...members].sort()).toEqual([...expected].sort());
    expect(new Set(members).size).toBe(members.length); // no duplicates
  });

  it('guards accept every member and reject unknowns', () => {
    for (const v of SOURCE_AUTHORITIES) expect(isSourceAuthority(v)).toBe(true);
    for (const v of OBSERVATION_PLATFORMS) expect(isObservationPlatform(v)).toBe(true);
    for (const v of SOURCE_ACCESS_METHODS) expect(isSourceAccessMethod(v)).toBe(true);
    for (const v of INVENTORY_SCOPES) expect(isInventoryScope(v)).toBe(true);
    for (const bogus of ['', 'BOGUS', 'mls', 42, null, undefined, {}]) {
      expect(isSourceAuthority(bogus)).toBe(false);
      expect(isObservationPlatform(bogus)).toBe(false);
      expect(isSourceAccessMethod(bogus)).toBe(false);
      expect(isInventoryScope(bogus)).toBe(false);
    }
  });
});

describe('A1 · unknown values fail loud (typed)', () => {
  it('assertKnownEnumValue → INVALID_VALUE on unknown, ok on member', () => {
    const bad = assertKnownEnumValue('nope', SOURCE_AUTHORITIES, 'source_authority');
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.code).toBe('INVALID_VALUE');
      expect(bad.criterion).toBe('source_authority');
    }
    expect(assertKnownEnumValue('acris', SOURCE_AUTHORITIES, 'source_authority').ok).toBe(true);
  });

  it('assertKnownCriterion → UNKNOWN_CRITERION on unknown key', () => {
    const bad = assertKnownCriterion('totallyBogus', ['price_min', 'beds_min']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('UNKNOWN_CRITERION');
    expect(assertKnownCriterion('price_min', ['price_min', 'beds_min']).ok).toBe(true);
  });

  it('evaluateInventoryScopeAccess rejects unknown audience/scope with INVALID_VALUE', () => {
    const a = evaluateInventoryScopeAccess('robot', 'public_inventory');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.code).toBe('INVALID_VALUE');
    const s = evaluateInventoryScopeAccess('agent', 'made_up_scope');
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.code).toBe('INVALID_VALUE');
  });
});

describe('A1 · required audience × scope matrix (fail-closed)', () => {
  // true = Allow, false = Deny. "broker" ≡ agent/internal_report.
  const EXPECT: Record<string, Record<Audience, boolean>> = {
    public_inventory: { public: true, client: true, agent: true, internal_report: true },
    cotality_only: { public: true, client: true, agent: true, internal_report: true },
    mallan_exclusive: { public: true, client: true, agent: true, internal_report: true },
    client_inventory: { public: false, client: true, agent: true, internal_report: true },
    agent_complete_inventory: { public: false, client: false, agent: true, internal_report: true },
    supplemental_only: { public: false, client: false, agent: true, internal_report: true },
    missing_from_cotality: { public: false, client: false, agent: true, internal_report: true },
    verification_required: { public: false, client: false, agent: true, internal_report: true },
    source_conflicts: { public: false, client: false, agent: true, internal_report: true },
  };

  it('every scope covered by the expectation table', () => {
    expect(Object.keys(EXPECT).sort()).toEqual([...INVENTORY_SCOPES].sort());
  });

  for (const scope of INVENTORY_SCOPES) {
    for (const audience of AUDIENCES) {
      const allow = EXPECT[scope][audience];
      it(`${audience} × ${scope} → ${allow ? 'Allow' : 'Deny'}`, () => {
        const d = evaluateInventoryScopeAccess(audience, scope);
        expect(d.ok).toBe(allow);
        if (!d.ok) expect(d.code).toBe('UNAUTHORIZED_SCOPE');
      });
    }
  }

  it('public and client fail closed on every agent/broker-private scope', () => {
    for (const scope of INVENTORY_SCOPES.filter(isPrivateInventoryScope)) {
      expect(evaluateInventoryScopeAccess('public', scope).ok).toBe(false);
      expect(evaluateInventoryScopeAccess('client', scope).ok).toBe(false);
      expect(evaluateInventoryScopeAccess('agent', scope).ok).toBe(true);
    }
  });
});

describe('A1 · supplemental private-by-default + fail-closed source permission', () => {
  it('supplemental scopes are private; public/client denied', () => {
    expect(isPrivateInventoryScope('supplemental_only')).toBe(true);
    expect(evaluateInventoryScopeAccess('public', 'supplemental_only').ok).toBe(false);
    expect(evaluateInventoryScopeAccess('client', 'supplemental_only').ok).toBe(false);
  });

  const CAPS_ALL: SourcePermissionCapabilities = {
    mayStoreIdentifiers: true, mayStoreListingFields: true, mayStorePhotos: true,
    mayStoreDescriptions: true, mayDisplayInternally: true, mayDisplayToClients: true,
    mayUseInReports: true, mayUseForComps: true, mayExport: true,
    attributionRequired: true, linkBackRequired: true, maximumRetentionHours: 720,
  };

  it('no profile → UNLICENSED_SOURCE (fail-closed)', () => {
    for (const p of [null, undefined]) {
      const d = evaluateSourcePermission(p, 'display_internally');
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.code).toBe('UNLICENSED_SOURCE');
    }
  });

  it('unapproved profile → UNLICENSED_SOURCE even with full capabilities', () => {
    const profile: SourceLicenseState = { approved: false, capabilities: CAPS_ALL };
    const d = evaluateSourcePermission(profile, 'use_for_comps');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe('UNLICENSED_SOURCE');
  });

  it('approved profile grants only the capabilities it holds', () => {
    const approved: SourceLicenseState = { approved: true, capabilities: CAPS_ALL };
    expect(evaluateSourcePermission(approved, 'display_internally').ok).toBe(true);

    const noExport: SourceLicenseState = {
      approved: true,
      capabilities: { ...CAPS_ALL, mayExport: false },
    };
    const d = evaluateSourcePermission(noExport, 'export');
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.code).toBe('UNLICENSED_SOURCE');
  });
});

describe('A1 · authority / platform / access are separate axes', () => {
  it('the three vocabularies are distinct dimensions', () => {
    // A platform value is not an authority; an authority is not a platform.
    expect(isSourceAuthority('streeteasy')).toBe(false);
    expect(isObservationPlatform('cotality')).toBe(false);
    // access-method mapping is per-authority and complete
    expect(isAccessMethodAllowedForAuthority('cotality', 'licensed_api')).toBe(true);
    expect(isAccessMethodAllowedForAuthority('cotality', 'public_api')).toBe(false);
    expect(ACCESS_METHODS_BY_AUTHORITY.acris).toContain('public_api');
    expect(ACCESS_METHODS_BY_AUTHORITY.mallan_crm).toContain('internal_system');
  });

  it('AttributionEnvelope carries the three facets separately; StreetEasy is never the brokerage', () => {
    const env: AttributionEnvelope = {
      factualAuthority: 'supplemental',
      observationPlatform: 'streeteasy',
      accessMethod: 'licensed_feed',
      observedAt: '2026-07-10T00:00:00Z',
      audienceObligations: ['broker_agent_only', 'attribution_required'],
    };
    expect(isAttributionEnvelope(env)).toBe(true);
    expect(env.listingBrokerage).toBeUndefined(); // platform ≠ brokerage
    // no courtesy line for a non-Cotality authority
    expect(attributionEnvelopeCourtesy(env)).toBeNull();
    // courtesy only for cotality, from a stated brokerage
    const rls: AttributionEnvelope = {
      factualAuthority: 'cotality',
      observationPlatform: 'none',
      accessMethod: 'licensed_api',
      observedAt: '2026-07-10T00:00:00Z',
      listingBrokerage: 'Mallan Real Estate Inc.',
      audienceObligations: [],
    };
    expect(attributionEnvelopeCourtesy(rls)).toBe('Listing Courtesy of Mallan Real Estate Inc.');
    expect(isAttributionEnvelope({ factualAuthority: 'streeteasy' })).toBe(false);
  });
});

describe('A1 · evidence classes distinct; only VALUATION_EVIDENCE drives value', () => {
  it('exactly five distinct classes', () => {
    expect(new Set(EVIDENCE_CLASSIFICATIONS).size).toBe(5);
  });
  it('only VALUATION_EVIDENCE may drive a valuation', () => {
    for (const c of EVIDENCE_CLASSIFICATIONS) {
      expect(mayDriveValuation(c)).toBe(c === 'VALUATION_EVIDENCE');
    }
  });
});

describe('A1 · lifecycle suppression + identity reference', () => {
  it('only active lifecycle is not suppressed', () => {
    for (const s of SUPPLEMENTAL_LIFECYCLE_STATUSES) {
      expect(isSuppressedLifecycle(s)).toBe(s !== 'active');
    }
  });
  it('CanonicalEntityReference requires listingId + sourceRecordId', () => {
    expect(isCanonicalEntityReference({ listingId: 'RLS1', sourceRecordId: 'src1' })).toBe(true);
    expect(isCanonicalEntityReference({ listingId: 'RLS1', sourceRecordId: 'src1', propertyId: 'p1' })).toBe(true);
    expect(isCanonicalEntityReference({ listingId: 'RLS1' })).toBe(false);
    expect(isCanonicalEntityReference({ sourceRecordId: 'src1' })).toBe(false);
    expect(isCanonicalEntityReference({ listingId: 'RLS1', sourceRecordId: 'src1', unitId: 5 })).toBe(false);
  });
});

describe('A1 · ContractDecision discriminated-union narrowing', () => {
  it('success carries no error fields; failure carries code + message', () => {
    const ok = contractOk();
    expect(ok.ok).toBe(true);
    expect(isContractOk(ok)).toBe(true);

    const decision: ContractDecision = evaluateInventoryScopeAccess('public', 'source_conflicts');
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      // TS narrows here — .code and .message are available with no optional noise
      const code: string = decision.code;
      const message: string = decision.message;
      expect(code).toBe('UNAUTHORIZED_SCOPE');
      expect(typeof message).toBe('string');
      expect(isContractFailure(decision)).toBe(true);
    } else {
      throw new Error('expected a failure decision');
    }

    const custom = contractFail('INVALID_VALUE', 'bad', 'x');
    expect(custom.ok).toBe(false);
    if (!custom.ok) expect(custom.criterion).toBe('x');
  });
});

/**
 * WIRING GUARD — was "nothing imports the canonical package".
 *
 * The blanket prohibition recorded the A1 phase, where the canonical package
 * was a skeleton nothing consumed. That premise is superseded: the projection
 * PRODUCER now derives `amenity_keys` and the feature flags through the one
 * canonical matcher, which is the whole point of having a shared read model —
 * public Search, Saved Search and CMA must answer the same question the same
 * way, and they cannot if each re-implements the matching rules.
 *
 * The guard is NARROWED rather than deleted, so unreviewed wiring still trips
 * it. Adding a file here is a deliberate act that has to be justified in review.
 */
describe('A1 · only authorised readers import the canonical package', () => {
  it('no UNAUTHORISED file under app/, lib/ (excluding canonical) or public/ imports it', () => {
    const repoRoot = path.resolve(__dirname, '../../../');
    const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '__tests__', 'tests', 'coverage']);
    const CANONICAL_DIR = path.join(repoRoot, 'lib', 'search', 'canonical').replace(/\\/g, '/');
    const files: string[] = [];

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (SKIP_DIRS.has(ent.name)) continue;
          if (full.replace(/\\/g, '/') === CANONICAL_DIR) continue; // the package itself
          walk(full);
        } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) {
          files.push(full);
        }
      }
    };

    for (const root of ['app', 'lib', 'public']) walk(path.join(repoRoot, root));

    const reAbsolute = /['"][^'"]*search\/canonical(\/[^'"]*)?['"]/;
    const reRelative = /['"](\.\.?\/)+canonical(\/[^'"]*)?['"]/;
    const offenders: string[] = [];
    for (const f of files) {
      // PRECISION FIX 2026-08-22. This used to test the WHOLE FILE at once.
      // `[^'"]*` crosses newlines, so any file containing a quote anywhere and
      // the words "search/canonical" anywhere else — a prose comment, for
      // instance — matched. public/crm/js/search/search-engine.js tripped it
      // purely for naming the module in a comment while importing nothing.
      //
      // That is not a harmless false positive: it creates pressure to add
      // non-importing files to the AUTHORISED list, which would hollow out the
      // guard. Scanning per line, skipping comments, catches every real import
      // (a `from '…'` clause is always on one line) without the false ones.
      const codeLines = fs
        .readFileSync(f, 'utf8')
        .split(String.fromCharCode(10))
        .filter((l: string) => {
          const t = l.trim();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        });
      if (codeLines.some((l: string) => reAbsolute.test(l) || reRelative.test(l))) {
        offenders.push(f.replace(/\\/g, '/').replace(repoRoot.replace(/\\/g, '/') + '/', ''));
      }
    }

    // Authorised consumers. The projection producer is the single derivation
    // point for amenity keys and feature flags; everything downstream reads the
    // DERIVED columns rather than re-deriving from provider payloads.
    const AUTHORISED = new Set([
      // Single derivation point for amenity_keys / feature_flags.
      'lib/search/listing-search-projection.ts',
      // Canonical criteria -> projection where-builder; reads the ownership
      // flag names so the reader cannot invent a second spelling of them.
      'lib/search/criteria-to-prisma.ts',
      // Instance-level authority resolver — reads the registry's declared
      // resolution model; introduces no second provenance system.
      'lib/search/canonical/resolve-factual-authority.ts',
      // Trestle fallback renders the SAME canonical bath contract to OData, so
      // the two execution paths cannot answer the same question differently.
      'lib/search/public-listing-trestle.ts',
      // Authenticated CRM OData builder — renders the SAME canonical
      // property-sub-type contract the projection renders to Prisma. It used to
      // emit `contains(PropertySubType,…)`, which the live provider answers with
      // HTTP 400, while the projection had no sub-type predicate at all: two
      // paths, two different answers, one of them not an answer. Reading the
      // canonical module is what collapses them back to one.
      'lib/search/crm-idx-filter.ts',
      // DB path renders the same canonical bath contract to Prisma.
      'lib/search/public-listing-db.ts',
      // Trestle fallback matches collection amenities Mallan-side through the
      // SAME matcher, replacing a route-local second engine.
      'app/api/listings/route.ts',
      // Imports ONLY the UnknownPropertySubTypeError type, to tell a rejected
      // criterion (400, client-fixable) apart from an upstream failure (502).
      // Without the canonical error class the route would have to string-match
      // its own message — a second, drifting definition of the same condition.
      'app/api/idx/search/route.ts',
      // Reads the canonical SALE/RENTAL UNIVERSE, for the same reason
      // crm-idx-filter.ts reads the sub-type contract: the filter renders that
      // universe to OData while the mapper classifies the rows that come back.
      // Until 2026-08-22 the mapper used its own rule — a substring test,
      // `propertyType.toLowerCase().includes('lease')` — so the two paths could
      // and did disagree about what a listing IS. That test called
      // `DisasterReliefRental` a sale and `CommercialLease` a residential
      // rental, and made SALE the leftover of RENTAL so every unpopulated
      // provider member would silently become sale inventory. Reading the
      // canonical module is what collapses the two back to one answer.
      'lib/search/crm-idx-mapper.ts',
      // The IDX fetch layer renders the SAME sale/rental universe to OData at
      // four sites (full, incremental, keyset and backfill traversals). Until
      // 2026-08-22 every one of them emitted `PropertyType ne 'ResidentialLease'`
      // for sale while the canonical contract rendered a positive predicate —
      // two paths, two definitions of what a sale IS. Reading the canonical
      // module is what keeps the four traversals and the CRM filter identical.
      'lib/idx/fetch.ts',
      // The market route renders the SAME status universe to OData that Search
      // does. Its Cotality fallback previously filtered on MlsStatus — which the
      // provider suppresses, so it returned HTTP 400 every run — and asked for
      // Active only while the DB branch of that same route defines active as
      // Active + ComingSoon + ActiveUnderContract. Reading the canonical status
      // contract is what stops one endpoint answering two different questions.
      'lib/market/query-contract.ts',
      // The legacy saved-search migration boundary. It exists precisely so that
      // backward compatibility does NOT live inside the canonical contract: it
      // reads the member vocabulary in order to convert an old persisted
      // spelling into an exact member ONCE, on the way in. Reading the canonical
      // module is what stops it becoming a second, drifting status vocabulary.
      'lib/search/legacy-status-migration.ts',
      // Inbound API boundary. `listing_status` arrives in a caller's payload and
      // may carry a legacy spelling, so it migrates to the exact member and then
      // labels from the shared presentation helper. It reads the canonical module
      // rather than keeping its own label table - which is precisely what let a
      // legacy COMING_SOON reformat into "Coming soon" in a client-facing email.
      'app/api/crm/agent-inquiry/route.ts',
    ]);
    expect(offenders.filter((f) => !AUTHORISED.has(f))).toEqual([]);
  }, 60000);
});
