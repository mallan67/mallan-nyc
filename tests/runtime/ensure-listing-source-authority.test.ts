/// <reference types="jest" />
/**
 * SOURCE AUTHORITY — an external Trestle stub must never wear Mallan provenance.
 *
 * THE DEFECT (pre-existing, found in review round 4).
 * `app/api/idx/ensure-listing` states in its own header that it creates an
 * EXTERNAL IDX/Trestle listing, and then wrote `rls_eligible: false` with the
 * comment "External IDX listing, not our exclusive".
 *
 * That is inverted. The canonical contract
 * (lib/listings/mallan-source-identity.ts) is:
 *
 *   "Mallan-authored local rows are `false`; feed rows are true/null."
 *
 * and `isMallanExclusiveListing()` is literally
 * `SL-/RL- prefix OR rls_eligible === false`, described in that module as
 * governing DATA/MEDIA AUTHORITY.
 *
 * So the stub was classified MALLAN-AUTHORED. Confirmed blast radius, each read
 * from the consuming code rather than assumed:
 *
 *   lib/idx/media-sync.ts:2115        decideMirrorAdmissionScope returns
 *                                     "all_active" — the most permissive R2
 *                                     mirror admission — instead of the
 *                                     display-gated scope.
 *   lib/media/listing-media-resolver  media ownership / legacy-fallback policy
 *                                     takes the Mallan branch.
 *   app/listing/[...slug]/page.tsx    isMallanExclusive: true in the public DTO
 *                                     (attribution).
 *   exclusive-agent-assignment        the row becomes eligible for exclusive
 *                                     agent assignment.
 *   listing_search_projection         is_exclusive set from the same helper.
 *
 * These are behavioural tests against the real canonical helpers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isMallanExclusiveListing } from '@/lib/listings/exclusive-agent-assignment';
import { isMallanLocalListing } from '@/lib/listings/mallan-source-identity';
import { mapTrestleToPrisma } from '@/lib/idx/trestle-mapper';
import { decideMirrorAdmissionScope } from '@/lib/idx/media-sync';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The row shape ensure-listing creates for an external Trestle listing. */
const externalStub = {
  listing_id: 'RLS20099999',
  rls_eligible: true, // the corrected value
  agent_id: null,
};

/** A genuine Mallan-authored local listing, for contrast. */
const mallanLocal = {
  listing_id: 'SL-000123',
  rls_eligible: false,
  agent_id: 7,
};

describe('an external ensure-listing stub is NOT Mallan-authored', () => {
  it('is not classified Mallan exclusive', () => {
    expect(isMallanExclusiveListing(externalStub)).toBe(false);
  });

  it('is not classified a Mallan local row by the source-identity module', () => {
    expect(isMallanLocalListing(externalStub)).toBe(false);
  });

  it('still classifies a genuine SL-/RL- row as Mallan — the fix does not over-reach', () => {
    expect(isMallanExclusiveListing(mallanLocal)).toBe(true);
    expect(isMallanLocalListing(mallanLocal)).toBe(true);
  });

  it('rls_eligible=false alone still means Mallan — the contract is unchanged', () => {
    // The repair is to ensure-listing's WRITE, not to the classifier. The
    // classifier's meaning must stay exactly as the charter defines it.
    expect(isMallanExclusiveListing({ listing_id: 'RLS20088888', rls_eligible: false })).toBe(true);
  });
});

describe('ensure-listing writes the correct source identity', () => {
  it('does not write rls_eligible: false for an external Trestle row', () => {
    const src = read('app/api/idx/ensure-listing/route.ts');
    expect(src).not.toMatch(/rls_eligible:\s*false/);
    expect(src).toMatch(/rls_eligible:\s*true/);
  });

  it('keeps its FAIL-CLOSED display coercion rather than adopting feed semantics', () => {
    // Deliberately NOT switched to computeGateColumns(). That helper applies
    // the IDX Plus pre-filter rule (`!== false`, so null = displayable), which
    // is correct for rows that arrived FROM the REBNY feed. This route's input
    // is an untrusted client POST body, and a previous fix specifically
    // replaced `!== false` with affirmPermission() here because the looser rule
    // let missing/null fields become displayable. Adopting computeGateColumns
    // would re-open exactly that hole.
    const src = read('app/api/idx/ensure-listing/route.ts');
    expect(src).toContain('affirmPermission(body.internet_display_yn)');
    expect(src).toContain('affirmPermission(body.address_display_yn)');
  });
});

describe('media authority consequences of the corrected identity', () => {
  it('R2 mirror admission no longer takes the unconditional Mallan branch', () => {
    // decideMirrorAdmissionScope short-circuits to "all_active" for a
    // Mallan-exclusive row. With the corrected identity the external stub falls
    // through to the display-gated path instead, which is the whole point.
    const mediaSync = read('lib/idx/media-sync.ts');
    expect(mediaSync).toContain('if (isMallanExclusiveListing(listing)) return "all_active";');
    // …and the stub is not such a row:
    expect(isMallanExclusiveListing(externalStub)).toBe(false);
  });

});

describe('RECONCILIATION — stub then real Cotality sync, through the canonical helpers', () => {
  /**
   * REVIEW FINDING (round 5). The previous test under this name proved nothing:
   * it built a second plain object with `rls_eligible: true` and compared the
   * classifier against itself. That is green-by-construction and could not
   * detect a mapper that flips source identity.
   *
   * This exercises the REAL path instead — `mapTrestleToPrisma` (the canonical
   * Trestle mapper), `isMallanExclusiveListing`, `decideMirrorAdmissionScope`
   * (the real R2 admission decision) — with no logic copied from any of them.
   */
  const LISTING_ID = 'RLS20099999';

  /** A genuine Cotality Property record for the SAME listing the stub created. */
  const cotalityRaw: Record<string, unknown> = {
    ListingId: LISTING_ID,
    ListingKey: 'KEY20099999',
    PropertyType: 'Residential',
    PropertySubType: 'Condominium',
    ListPrice: 1250000,
    StandardStatus: 'Active',
    StreetNumber: '155',
    StreetName: 'West 68th Street',
    City: 'New York',
    StateOrProvince: 'NY',
    PostalCode: '10023',
    BedroomsTotal: 3,
    BathroomsFull: 2,
    ListAgentMlsId: 'AG777',
    ListOfficeMlsId: '9999', // a THIRD-PARTY office, not Mallan's 7041
    ModificationTimestamp: '2026-08-17T00:00:00Z',
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    Media: [],
  };

  const mapped = mapTrestleToPrisma(cotalityRaw);

  it('the real mapper keeps the same canonical Listing identity', () => {
    expect(mapped.listing_id).toBe(LISTING_ID);
    expect(mapped.listing_id).toBe(externalStub.listing_id);
  });

  it('the real mapper does NOT write source authority at all — it cannot flip it', () => {
    // STRONGER than "emits true": the canonical mapper does not include
    // `rls_eligible` in its output at all, so a Trestle upsert structurally
    // CANNOT change an existing row's source identity. Feed rows therefore take
    // the schema default, which is `Boolean @default(true)` — i.e. RLS-backed.
    //
    // This is what makes the ensure-listing correction durable: the stub's
    // `true` survives every later sync untouched. Under the old `false`, the
    // row would have stayed permanently mis-classified as Mallan-authored,
    // because nothing in the sync path would ever have corrected it.
    expect(mapped).not.toHaveProperty('rls_eligible');

    // The row as it exists after the stub + a mapped sync:
    const reconciled = { listing_id: mapped.listing_id, rls_eligible: true };
    expect(isMallanExclusiveListing(reconciled)).toBe(false);
  });

  it('R2 admission stays display-gated, never the Mallan all_active branch', () => {
    const scope = decideMirrorAdmissionScope({
      listing_id: mapped.listing_id,
      rls_eligible: true, // schema default for a feed row; mapper never sets it
      status: mapped.status,
      idx_display_yn: mapped.idx_display_yn,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
    });

    // The stub must never buy Mallan-grade mirror admission.
    expect(scope).not.toBe('all_active');
    // …and a genuinely Mallan-authored row still does.
    expect(decideMirrorAdmissionScope({
      listing_id: 'SL-000123',
      rls_eligible: false,
      status: 'Active',
      idx_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
    })).toBe('all_active');
  });

  it('the identity is stable across the stub → sync transition', () => {
    // Same canonical helper, both sides of the transition, same answer.
    const beforeSync = isMallanExclusiveListing(externalStub);
    const afterSync = isMallanExclusiveListing({
      listing_id: mapped.listing_id,
      // Mapper never writes this column, so the stub's value survives.
      rls_eligible: true,
    });
    expect(beforeSync).toBe(false);
    expect(afterSync).toBe(false);
  });
});
