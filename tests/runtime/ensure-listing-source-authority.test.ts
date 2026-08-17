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

  it('reconciles cleanly when the real Cotality row is later synced', () => {
    // The Trestle mapper writes feed rows with rls_eligible true/null. With the
    // stub already true, a later sync of the same listing_id does not FLIP the
    // source identity — so media authority cannot change underneath existing
    // rows. Under the old value the sync would have silently converted the row
    // from "Mallan-authored" to "feed", moving media authority with it.
    const afterSync = { ...externalStub, rls_eligible: true };
    expect(isMallanExclusiveListing(afterSync)).toBe(isMallanExclusiveListing(externalStub));
  });
});
