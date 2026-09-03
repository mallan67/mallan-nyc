/**
 * A CRITERION'S NOTES MUST BE ABOUT THAT CRITERION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CORRUPTION THIS EXISTS FOR
 *
 * On 2026-09-02 the Open House notes were written into `price_per_sqft`. The
 * $/Sqft record ended up carrying paragraphs about open-house pagination,
 * ListingKey reconciliation and Mallan-local showings, while `open_house` kept
 * its stale "BLOCKED — applies AFTER pagination" text describing a condition
 * that had already been fixed.
 *
 * The mechanism was a scripted edit anchored on
 *
 *     s.index("notes: 'BLOCKED 2026-08-29 (Maya).")
 *
 * FOUR entries carry that phrase. `index` returns the FIRST, and
 * `price_per_sqft` sorts earlier in the file than `open_house`. Nothing caught
 * it: the file still compiled, every type was satisfied, the criterion count was
 * unchanged, and the generated vocabulary was identical. A registry is the
 * Search mapping AUTHORITY, so prose landing in the wrong record is not a
 * documentation slip — it is the authority asserting something false about a
 * field, in the one place other code is told to trust.
 *
 * These checks are deliberately about MEANING rather than shape, because every
 * shape-level check passed while the file was wrong.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIELD_REGISTRY, type FieldSpec } from '../canonical/field-registry';

/** Entries that actually carry prose worth checking. */
const WITH_NOTES = FIELD_REGISTRY.filter((f) => typeof f.notes === 'string' && f.notes.length > 0);

/**
 * Provider constructs that belong to exactly ONE criterion.
 *
 * Keyed by the token as it appears in prose, valued by the criterion that owns
 * it. A note naming someone else's exclusive construct is describing the wrong
 * field — which is precisely what happened.
 */
const EXCLUSIVE_PROVIDER_CONSTRUCTS: ReadonlyArray<readonly [string, string]> = [
  ['OpenHouseDate', 'open_house'],
  ['OpenHouseStatus', 'open_house'],
  ['PricePerArea', 'price_per_sqft'],
  ['BathroomsHalf', 'bathrooms'],
];

describe('a note describes the criterion it is attached to', () => {
  it.each(EXCLUSIVE_PROVIDER_CONSTRUCTS)(
    '"%s" appears only in %s',
    (token, owner) => {
      const trespassers = WITH_NOTES
        .filter((f) => f.canonicalKey !== owner && (f.notes as string).includes(token))
        .map((f) => `${f.canonicalKey} mentions "${token}", which belongs to ${owner}`);
      expect(trespassers).toEqual([]);
    },
  );

  it('no two criteria share the same notes verbatim', () => {
    // A copy that landed in the wrong place usually leaves the same text in two
    // records, or replaces one wholesale. Either way the prose stops being
    // unique to a field.
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const f of WITH_NOTES) {
      const notes = f.notes as string;
      const prior = seen.get(notes);
      if (prior) duplicates.push(`${prior} and ${f.canonicalKey} carry identical notes`);
      else seen.set(notes, f.canonicalKey);
    }
    expect(duplicates).toEqual([]);
  });

  it('a note that declares itself UNBLOCKED belongs to an executable criterion', () => {
    // The corrupted `price_per_sqft` said "UNBLOCKED … membership is now settled
    // before count and page cut" while remaining filterable:'unsupported' with
    // no executionStrategy. A record may not announce a capability its own
    // fields deny.
    const contradictions = WITH_NOTES
      .filter((f) => /\bUNBLOCKED\b/.test(f.notes as string))
      .filter((f) => !f.executionStrategy || f.filterable === 'unsupported')
      .map((f) => `${f.canonicalKey}: notes say UNBLOCKED but filterable=${f.filterable} strategy=${f.executionStrategy ?? 'none'}`);
    expect(contradictions).toEqual([]);
  });

  it('a note that declares itself BLOCKED is not simultaneously verified', () => {
    // The mirror failure: `open_house` kept "BLOCKED … applies AFTER pagination"
    // while carrying filterable:'yes' and a provider_filter strategy. Whichever
    // half is true, they cannot both be.
    const contradictions = WITH_NOTES
      .filter((f) => /^BLOCKED\b/.test((f.notes as string).trim()))
      .filter((f) => f.filterable === 'yes')
      .map((f) => `${f.canonicalKey}: notes say BLOCKED but filterable=yes`);
    expect(contradictions).toEqual([]);
  });
});

describe('a provider-filtered criterion carries STRUCTURED evidence, not prose', () => {
  /**
   * FOUR criteria promoted on 2026-08-31 carry no structured evidence.
   *
   * They are `provider_filter` + `filterable: 'yes'` — the combination that is
   * supposed to mean VERIFIED AGAINST LIVE COTALITY — but none of them appears
   * in artifacts/section5f-executor-operator-probe-2026-08-31.json, which is
   * the artifact the promotion cites. I checked; the file does not mention
   * structure_type, pets, furnished, new_development, StructureType,
   * PetsAllowed, Furnished or NewConstructionYN.
   *
   * They are NAMED here rather than fixed, because the only two ways to make
   * this list empty are to re-probe them live or to point them at an artifact
   * that does not cover them. The second is the exact false authority this
   * registry exists to prevent, so the debt is declared instead of paid with
   * a fabricated citation.
   *
   * A NEW criterion cannot join this list quietly — adding one is a deliberate
   * edit here, and the test fails by name until someone makes it.
   */
  const EVIDENCE_DEBT_2026_08_31 = new Set([
    'structure_type', 'pets', 'furnished', 'new_development',
  ]);

  it('every provider_filter criterion marked filterable:yes has liveEvidence', () => {
    // Prose containing the words "verified live" is not evidence — a note can
    // say anything. `liveEvidence` is a typed field with a probe date and a
    // named source, which is what a later reader can actually go and check.
    const unevidenced = FIELD_REGISTRY
      .filter((f: FieldSpec) => f.executionStrategy === 'provider_filter' && f.filterable === 'yes')
      .filter((f: FieldSpec) => !f.liveEvidence?.probedAt || !f.liveEvidence?.source)
      .map((f: FieldSpec) => f.canonicalKey)
      .filter((k) => !EVIDENCE_DEBT_2026_08_31.has(k));
    expect(unevidenced).toEqual([]);
  });

  it('the evidence source names a retained artifact or a dated document', () => {
    const vague = FIELD_REGISTRY
      .filter((f: FieldSpec) => f.liveEvidence)
      .filter((f: FieldSpec) => {
        const src = f.liveEvidence?.source ?? '';
        // Either it points at a file a reader can open, or it quotes the exact
        // live expression and its result. "verified live" alone is neither.
        return !/artifacts\/|docs\/|lib\/|\.json|\.md|\.ts|->|eq '/.test(src);
      })
      .map((f: FieldSpec) => `${f.canonicalKey}: "${f.liveEvidence?.source}"`);
    expect(vague).toEqual([]);
  });
});

describe('open_house specifically, after the 2026-09-02 repair', () => {
  const oh = FIELD_REGISTRY.find((f) => f.canonicalKey === 'open_house') as FieldSpec;

  it('its notes describe the CURRENT implementation, not the fixed-and-gone one', () => {
    expect(oh.notes).toMatch(/UNBLOCKED/);
    expect(oh.notes).not.toMatch(/applies it AFTER pagination/);
  });

  it('it still states the half that is NOT implemented', () => {
    // The Mallan-local branch is declared by authorityByListingKind and not
    // built. A registry that quietly dropped that would read as complete.
    expect(oh.notes).toMatch(/mallanLocal/);
    expect(oh.notes).toMatch(/NOT implemented/);
  });

  it('price_per_sqft is back to being about price per square foot', () => {
    const pps = FIELD_REGISTRY.find((f) => f.canonicalKey === 'price_per_sqft') as FieldSpec;
    expect(pps.notes).toMatch(/PricePerArea/);
    expect(pps.notes).not.toMatch(/OpenHouse|corpusFilter|showings/);
  });
});

/**
 * READINESS MUST BE SOURCE-AWARE.
 *
 * `open_house` declares TWO authorities:
 *
 *     authorityByListingKind: { mallanLocal: 'mallan_crm', providerListing: 'cotality' }
 *
 * and for a long time carried `filterable: 'yes'` while only the cotality
 * branch executed. Both statements were individually defensible and together
 * they were misleading: a later handoff reads "Open House = YES" and never
 * learns that half the declared authority was missing.
 *
 * The fix is not a footnote in the notes. A criterion that names a
 * Mallan-CRM authority must have a Mallan-CRM implementation the executor
 * actually calls, and that is checked here against the real route source.
 */
describe('a declared authority branch has an implementation', () => {
  const route = readFileSync(
    resolve(__dirname, '../../../app/api/idx/search/route.ts'),
    'utf8',
  );

  const dualAuthority = FIELD_REGISTRY.filter(
    (f) => f.authorityByListingKind?.mallanLocal === 'mallan_crm',
  );

  it('at least one criterion declares a Mallan-CRM authority', () => {
    // If this ever becomes zero the checks below would pass vacuously.
    expect(dualAuthority.length).toBeGreaterThan(0);
  });

  it('the authenticated Search route reads Mallan storage at all', () => {
    // The whole gap in one assertion: the route had ZERO prisma references,
    // so no criterion declaring a Mallan-CRM authority could possibly honour
    // it, whatever the registry said.
    expect(route).toMatch(/from "@\/lib\/prisma"/);
  });

  it('open_house resolves its Mallan half through the canonical contract', () => {
    // Not a second prisma.showing.findMany() inlined in the route: the
    // membership rule lives in one place and the route consumes it.
    expect(route).toMatch(/brokerSearchOpenHouseWhere/);
    expect(route).toMatch(/localOpenHouseMembershipFrom/);
  });

  it('Mallan rows reach the universe as a SOURCE, not an open-house patch', () => {
    // `readMallanLocalCandidates` is called unconditionally; only the Open
    // House MEMBERSHIP is conditional. Reading local rows only when
    // `openHouse` is set would make a listing appear the moment a filter is
    // clicked and vanish when it is cleared.
    const call = route.indexOf('readMallanLocalCandidates({');
    expect(call).toBeGreaterThan(-1);
    const openHouseGuard = route.indexOf('if (executedOpenHouseWindow) {');
    // The candidate read sits AFTER the open-house block closes, not inside it.
    expect(call).toBeGreaterThan(openHouseGuard);
    const between = route.slice(openHouseGuard, call);
    expect(between).toContain('}');
  });

  it('a Mallan row is mapped by the Mallan mapper, never the provider one', () => {
    expect(route).toMatch(/isMallanLocalRow\(record\)/);
    expect(route).toMatch(/mapMallanLocalToCrmListing/);
  });

  it('a mixed response cannot mint a provider continuation', () => {
    // The engine refuses to RESUME one; this is the route refusing to CREATE
    // one. Without both, the first mixed page hands out a token whose keyset
    // cannot describe half the rows it covers.
    expect(route).toMatch(/localRows\.length > 0 \|\|/);
    expect(route).toMatch(/continuationUnavailableReason/);
  });

  it('a mixed response does not claim to be sourced from cotality alone', () => {
    expect(route).toMatch(/cotality\+mallan_local/);
  });
});
