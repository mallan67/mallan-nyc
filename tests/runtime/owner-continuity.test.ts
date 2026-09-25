/// <reference types="jest" />
/**
 * CANONICAL OWNER CONTINUITY.
 *
 * The invariant:
 *
 *   Seller/Landlord -> Lead -> Listing.owner_client_id -> the same canonical
 *   Listing -> CRM -> Seller/Landlord Portal -> post-deal history
 *
 * There were two truths for it. `crm/convert` (promote_to_listing) wrote
 * `owner_client_id: lead.id`; `POST /api/crm/listings` created a Listing and
 * never mentioned the column at all — `owner_client_id` appeared ZERO times in
 * that file.
 *
 * That is not a cosmetic gap. The owner portal resolves a listing THROUGH this
 * column and fails closed when it is null, so a directly-created listing was
 * permanently invisible to the very seller or landlord it belongs to. Adding
 * richer portal screens would not have fixed it — the privacy check was
 * correctly refusing an ownerless row.
 *
 * No second ownership field is introduced. This is the same column convert
 * already writes, authorised with the same helper (assertLeadAccess): an agent
 * may name only a lead they manage, a broker has brokerage scope.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(REPO, p), 'utf8');

const listingsRoute = read('app/api/crm/listings/route.ts');
const convertRoute = read('app/api/crm/convert/route.ts');
const statusRoute = read('app/api/crm/listings/[id]/status/route.ts');

const code = (src: string) =>
  src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

describe('both listing creators now establish the owner link', () => {
  it('promote_to_listing still writes it', () => {
    // The path that was already correct must not regress.
    expect(code(convertRoute)).toMatch(/owner_client_id:\s*lead\.id/);
  });

  it('the direct CRM create writes it too', () => {
    // It previously contained the column zero times.
    expect(code(listingsRoute)).toMatch(/owner_client_id:\s*ownerClientId/);
  });

  it('the owner is resolved at POST function scope, not inside a conditional', () => {
    // A first attempt landed the resolution inside `if (rlsEligible)`, which
    // would have skipped owner capture entirely for non-RLS listings — the
    // exclusives that most need it.
    const decl = code(listingsRoute).indexOf('let ownerClientId');
    const rlsGate = code(listingsRoute).indexOf('if (rlsEligible)');
    expect(decl).toBeGreaterThan(-1);
    expect(decl).toBeLessThan(rlsGate);
  });
});

describe('owner assignment is authorised, not merely accepted', () => {
  it('uses the SAME canonical access helper convert uses', () => {
    // An agent may name only a lead they manage; a broker has brokerage scope.
    // Reusing assertLeadAccess avoids a second authorisation opinion.
    expect(code(listingsRoute)).toMatch(/assertLeadAccess\(auth, parsed\)/);
    expect(code(convertRoute)).toMatch(/assertLeadAccess\(/);
  });

  it('returns the access failure rather than swallowing it', () => {
    expect(code(listingsRoute)).toMatch(/if \(ownerAccess\) return ownerAccess/);
  });

  it('a malformed owner id is refused, not coerced', () => {
    // BigInt("abc") throws; silently treating that as "no owner" would create
    // an ownerless listing from what was plainly an attempt to set one.
    expect(code(listingsRoute)).toMatch(/owner_client_id must be a client id/);
    expect(code(listingsRoute)).toMatch(/status: 422/);
  });

  it('no second ownership field is introduced anywhere', () => {
    // The instruction is explicit: one canonical column, no shadow owner.
    for (const src of [listingsRoute, convertRoute, statusRoute]) {
      expect(code(src)).not.toMatch(/\bseller_id\b/);
      expect(code(src)).not.toMatch(/\blandlord_id\b/);
      expect(code(src)).not.toMatch(/ownerShadow|owner_json/);
    }
  });
});

describe('an ownerless draft cannot go live', () => {
  it('activation is refused when the owner is unresolved', () => {
    expect(code(statusRoute)).toMatch(/OWNER_REQUIRED_BEFORE_PUBLICATION/);
    expect(code(statusRoute)).toMatch(
      /isGoingLive && listing\.mls_id === null && listing\.owner_client_id === null/,
    );
  });

  it('the refusal is 409, not 403', () => {
    // The caller HAS the authority; the record is not ready. A 403 would tell
    // the CRM to report a permissions problem instead of prompting for the
    // owner.
    const block = statusRoute.slice(statusRoute.indexOf('OWNER_REQUIRED_BEFORE_PUBLICATION'));
    expect(block.slice(0, 400)).toMatch(/status: 409/);
  });

  it('it gates Active and ComingSoon — the two ways a listing goes live', () => {
    expect(code(statusRoute)).toMatch(
      /newStatus === "Active" \|\| newStatus === "ComingSoon"/,
    );
  });

  it('provider-sourced listings are NOT gated', () => {
    // A Cotality row has no Mallan owner client by design. Gating it would
    // block routine status work on inventory Mallan does not own.
    expect(code(statusRoute)).toMatch(/listing\.mls_id === null/);
  });

  it('terminal broker approval is unchanged', () => {
    // The new guard must not displace the existing Sold/Rented rule.
    expect(code(statusRoute)).toMatch(/Sold\/Rented status requires broker approval/);
  });
});

describe('the owner link stays owner-private', () => {
  it('the portal resolves a listing THROUGH owner_client_id', () => {
    const offers = read('app/api/portal/offers/route.ts');
    expect(code(offers)).toMatch(/owner_client_id:\s*auth\.userId/);
  });

  it('the public listings route never exposes it as an identity', () => {
    // It is selected for internal decisions, but a public DTO must not carry a
    // client id. Confirm every public emission is stringified from a scoped
    // query rather than an unbounded passthrough of the raw column.
    const publicRoute = read('app/api/listings/route.ts');
    expect(code(publicRoute)).toMatch(/owner_client_id: l\.owner_client_id != null/);
  });
});
