/// <reference types="jest" />
/**
 * A4 — THE NINE MANDATORY NEGATIVE CASES, THROUGH THE REAL ROUTES.
 *
 * A workflow that only proves the happy path proves nothing about the gates.
 * Each block below is one of the nine refusals the directive requires, driven
 * through the actual route handlers against the same in-memory store the
 * positive workflow uses — so "nothing was written" is checked against the
 * store, not against a mock that was never going to write anything anyway.
 *
 *   1. no owner                      → cannot progress to publication
 *   2. null market status            → cannot appear publicly
 *   3. discriminatory content        → cannot publish
 *   4. Agent                         → cannot do Broker-only work
 *   5. another Agent                 → cannot hijack the owner/client relation
 *   6. Cotality external row         → stays read-only
 *   7. Mallan return-copy            → does not compete with the local Listing
 *   8. a failed save                 → cannot look like it persisted
 *   9. provider sync                 → cannot erase Mallan owner/publication/history
 *
 * OPERATIONAL HOLD: branch-local proof. The `listings.status` migration is not
 * applied to Production (NEON.md 3–5 AM ET window; no DATABASE_URL here), and
 * nothing below is labelled Production or Preview proof.
 */
import { makeRequest, readJson } from './helpers';
import { createInMemoryPrisma } from './support/in-memory-prisma';

const AGENT_ID = BigInt(3);
const BROKER_ID = BigInt(1);
const OTHER_AGENT_ID = BigInt(4);
const OWNER_ID = BigInt(31);
const OTHER_OWNER_ID = BigInt(32);

type Session = { userId: bigint; userType: 'agent' | 'lead'; role: string; sessionId: string };

const AGENT: Session = { userId: AGENT_ID, userType: 'agent', role: 'AGENT', sessionId: 'a' };
const BROKER: Session = { userId: BROKER_ID, userType: 'agent', role: 'BROKER', sessionId: 'b' };
const OTHER_AGENT: Session = { userId: OTHER_AGENT_ID, userType: 'agent', role: 'AGENT', sessionId: 'o' };

let session: Session = AGENT;

const { prisma, store } = createInMemoryPrisma();

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prisma }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAuth: jest.fn(async () => session),
  requireAgentOrBroker: jest.fn(async () => session),
  requireBroker: jest.fn(async () => session),
  requirePortalRole: jest.fn(async () => session),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  listingCacheTag: (id: string) => `listing:${id}`,
  buildingAndManifestInvalidationTags: () => [],
  safeRevalidateTags: () => undefined,
  SEARCH_CACHE_TAG: 'search',
}));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));
jest.mock('@/lib/notifications/engine', () => ({
  __esModule: true,
  createNotification: jest.fn(async () => undefined),
}));

import { POST as CREATE_LISTING } from '@/app/api/crm/listings/route';
import { PATCH as PATCH_LISTING } from '@/app/api/crm/listings/[id]/route';
import { PATCH as PATCH_PUBLICATION } from '@/app/api/crm/listings/[id]/publication/route';
import { PATCH as PATCH_STATUS } from '@/app/api/crm/listings/[id]/status/route';
import { filterDisplayableDbListings } from '@/lib/idx/db-to-public-dto';
import { computeGateColumns } from '@/lib/idx/trestle-mapper';
import { complianceUpdatePatch } from '@/lib/idx/sync';
import { listingCapabilities } from '@/lib/auth/listing-capabilities';
import { isMallanLocalListing } from '@/lib/listings/mallan-source-identity';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function capture(res: Response) {
  let body: Record<string, unknown> = {};
  try {
    body = (await readJson<Record<string, unknown>>(res)) ?? {};
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

function row(listingId: string): Record<string, unknown> | undefined {
  return store.rows('listing').find((r) => r.listing_id === listingId);
}

function seed() {
  store.reset();
  store.seed('lead', [
    { id: OWNER_ID, agent_id: AGENT_ID, first_name: 'Dana', last_name: 'Seller' },
    { id: OTHER_OWNER_ID, agent_id: OTHER_AGENT_ID, first_name: 'Sam', last_name: 'Other' },
  ]);
}

/** Create a Mallan-authored sale listing through the real route. */
async function createListing(extra: Record<string, unknown> = {}): Promise<string> {
  const res = await CREATE_LISTING(
    makeRequest({
      method: 'POST',
      body: {
        listing_type: 'sale',
        rls_eligible: false,
        ListPrice: 1200000,
        StreetNumber: '400',
        StreetName: 'East 90th Street',
        City: 'New York',
        StateOrProvince: 'NY',
        PostalCode: '10128',
        PublicRemarks: 'Bright two-bedroom with a renovated kitchen.',
        ...extra,
      },
    }),
  );
  const body = await readJson<{ listing_id?: string }>(res);
  return String(body.listing_id ?? '');
}

beforeEach(() => {
  seed();
  session = AGENT;
});

describe('1. an ownerless listing cannot progress to publication', () => {
  it('submitting it is refused, and the state does not move', async () => {
    const id = await createListing(); // no owner_client_id
    expect(row(id)?.owner_client_id ?? null).toBeNull();

    const res = await capture(
      await PATCH_PUBLICATION(makeRequest({ method: 'PATCH', body: { to: 'SUBMITTED' } }), params(id)),
    );

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OWNER_REQUIRED');
    // Nothing was written: the compliance column still has no publication state
    // beyond the initial DRAFT.
    const compliance = row(id)?.compliance as Record<string, unknown>;
    const pub = compliance?.mallan_publication as Record<string, unknown> | undefined;
    expect(pub?.state ?? 'DRAFT').toBe('DRAFT');
  });

  it('and it cannot be put on the market either', async () => {
    const id = await createListing();
    const res = await capture(
      await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Active' } }), params(id)),
    );
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OWNER_REQUIRED_BEFORE_PUBLICATION');
    expect(row(id)?.status ?? null).toBeNull();
  });
});

describe('2. a listing with no market status cannot appear publicly', () => {
  it('the public gate drops it, whatever its publication state says', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    const listing = row(id) as Record<string, unknown>;
    expect(listing.status ?? null).toBeNull();

    expect(filterDisplayableDbListings([listing as never])).toHaveLength(0);

    // Even with every display permission open and the publication workflow
    // complete, the MARKET question is unanswered — so it stays out.
    const permissive = {
      ...listing,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      participant_only: false,
      owner_opt_out: false,
      compliance: {
        mallan_publication: { state: 'PUBLISHED_PUBLIC', visibility: 'PUBLIC_WEB', history: [] },
      },
    };
    expect(filterDisplayableDbListings([permissive as never])).toHaveLength(0);
  });

  it('and it is not marked IDX-displayable at creation', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    expect(row(id)).toBeDefined();
    expect(row(id)?.idx_display_yn).toBe(false);
  });

  it('the gate helper refuses it even when every OTHER permission is open', () => {
    // The create above is website-only, so `rls_eligible` alone would explain
    // the false. This asks the helper the route uses with RLS eligibility ON and
    // display permissions open, leaving the missing market status as the only
    // reason it can fail — which is the branch under test.
    expect(
      computeGateColumns({
        status: null,
        rls_eligible: true,
        internetEntireListingDisplayYN: true,
        internetAddressDisplayYN: true,
        participantOnly: false,
        ownerOptOut: false,
      }).idx_display_yn,
    ).toBe(false);
    // Same inputs, a real market status: displayable. So the null is doing the work.
    expect(
      computeGateColumns({
        status: 'Active',
        rls_eligible: true,
        internetEntireListingDisplayYN: true,
        internetAddressDisplayYN: true,
        participantOnly: false,
        ownerOptOut: false,
      }).idx_display_yn,
    ).toBe(true);
  });
});

describe('3. discriminatory content cannot publish', () => {
  it('the refusal names every violated statute', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });

    session = AGENT;
    await PATCH_PUBLICATION(makeRequest({ method: 'PATCH', body: { to: 'SUBMITTED' } }), params(id));
    await PATCH_PUBLICATION(
      makeRequest({ method: 'PATCH', body: { to: 'REVIEW_IN_PROGRESS' } }),
      params(id),
    );
    await PATCH_PUBLICATION(
      makeRequest({ method: 'PATCH', body: { to: 'COMPLIANCE_CHECK' } }),
      params(id),
    );
    session = BROKER;
    await PATCH_PUBLICATION(makeRequest({ method: 'PATCH', body: { to: 'APPROVED' } }), params(id));

    // The copy turns discriminatory AFTER approval — the exact case a
    // publish-time gate exists for.
    session = AGENT;
    await PATCH_LISTING(
      makeRequest({
        method: 'PATCH',
        body: { PublicRemarks: 'Perfect for a Christian family. No Section 8. Adults only.' },
      }),
      params(id),
    );

    session = BROKER;
    const res = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'PUBLISHED_PUBLIC', visibility: 'PUBLIC_WEB' } }),
        params(id),
      ),
    );

    expect(res.status).toBe(409);
    const compliance = res.body.compliance as {
      passed: boolean;
      failures: Array<{ code: string; message: string }>;
    };
    expect(compliance.passed).toBe(false);
    const messages = compliance.failures.map((f) => f.message).join(' | ');
    expect(messages).toMatch(/Religion/i);
    expect(messages).toMatch(/Source of Income/i);
    expect(messages).toMatch(/familial status/i);

    // And it did not publish.
    const pub = (row(id)?.compliance as Record<string, unknown>)
      .mallan_publication as Record<string, unknown>;
    expect(pub.state).toBe('APPROVED');
    expect(pub.visibility).toBe('INTERNAL_ONLY');
  });
});

describe('4. an Agent cannot do Broker-only work', () => {
  async function toComplianceCheck(): Promise<string> {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    session = AGENT;
    await PATCH_PUBLICATION(makeRequest({ method: 'PATCH', body: { to: 'SUBMITTED' } }), params(id));
    await PATCH_PUBLICATION(
      makeRequest({ method: 'PATCH', body: { to: 'REVIEW_IN_PROGRESS' } }),
      params(id),
    );
    await PATCH_PUBLICATION(
      makeRequest({ method: 'PATCH', body: { to: 'COMPLIANCE_CHECK' } }),
      params(id),
    );
    return id;
  }

  it('cannot approve', async () => {
    const id = await toComplianceCheck();
    const res = await capture(
      await PATCH_PUBLICATION(makeRequest({ method: 'PATCH', body: { to: 'APPROVED' } }), params(id)),
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACTOR_NOT_PERMITTED');
  });

  it('cannot publish publicly', async () => {
    const id = await toComplianceCheck();
    session = BROKER;
    await PATCH_PUBLICATION(makeRequest({ method: 'PATCH', body: { to: 'APPROVED' } }), params(id));
    session = AGENT;
    const res = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'PUBLISHED_PUBLIC', visibility: 'PUBLIC_WEB' } }),
        params(id),
      ),
    );
    expect(res.status).toBe(403);
    const pub = (row(id)?.compliance as Record<string, unknown>)
      .mallan_publication as Record<string, unknown>;
    expect(pub.state).toBe('APPROVED');
  });

  it('cannot mark a sale Sold — that is broker approval too', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    session = AGENT;
    await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Active' } }), params(id));
    await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Pending' } }), params(id));
    const res = await capture(
      await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Sold' } }), params(id)),
    );
    expect(res.status).toBe(403);
    expect(row(id)?.status).toBe('Pending');
  });
});

describe('5. another Agent cannot hijack the owner/client relation', () => {
  it('cannot assign a client they do not manage', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    session = AGENT;
    const res = await capture(
      await PATCH_LISTING(
        makeRequest({ method: 'PATCH', body: { owner_client_id: OTHER_OWNER_ID.toString() } }),
        params(id),
      ),
    );
    expect(res.status).toBe(403);
    // The owner did not change.
    expect(String(row(id)?.owner_client_id)).toBe(OWNER_ID.toString());
  });

  it('cannot manage a listing assigned to a different agent at all', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    session = OTHER_AGENT;
    const res = await capture(
      await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Active' } }), params(id)),
    );
    expect(res.status).toBe(403);
    expect(row(id)?.status ?? null).toBeNull();
  });
});

describe('6. a Cotality-sourced row stays read-only', () => {
  const PROVIDER_ID = 'RLS12345678';

  function seedProviderRow(extra: Record<string, unknown> = {}) {
    store.seed('listing', [
      {
        id: BigInt(900),
        listing_id: PROVIDER_ID,
        // A provider identifier is what makes this row Cotality-owned.
        mls_id: PROVIDER_ID,
        listing_type: 'sale',
        status: 'Active',
        rls_eligible: true,
        agent_id: AGENT_ID, // association, NOT ownership
        owner_client_id: null,
        list_price: 2000000,
        address: {},
        raw_data: {},
        features: {},
        media: [],
        compliance: {},
        days_on_market: 10,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        idx_display_yn: true,
        last_synced_from_trestle: new Date(),
        ...extra,
      },
    ]);
  }

  it('its market status cannot be changed from the CRM', async () => {
    seedProviderRow();
    session = BROKER; // even a broker
    const res = await capture(
      await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Pending' } }), params(PROVIDER_ID)),
    );
    expect(res.status).toBe(403);
    expect(row(PROVIDER_ID)?.status).toBe('Active');
  });

  it('and the capability resolver refuses local management regardless of agent_id', () => {
    seedProviderRow();
    const listing = row(PROVIDER_ID) as Record<string, unknown>;
    const caps = listingCapabilities(BROKER, listing as never);
    expect(caps.mayManageMallanLocalListing).toBe(false);
    // `agent_id` records who worked the deal. It is not ownership, and the
    // association it does support stays available.
    expect(caps.mayViewHistory).toBe(true);
  });
});

describe('7. a Mallan return-copy does not compete with the canonical local Listing', () => {
  it('a row carrying Mallan list-side identity but a provider id is NOT Mallan-local', () => {
    // The return-copy is the Cotality feed handing Mallan back its own listing.
    // It carries Mallan's ListOfficeMlsId, so an identity check that looked only
    // at the office would classify it as Mallan-owned data — and it would then
    // compete with the canonical local row for the same property.
    const returnCopy = {
      listing_id: 'RLS999',
      mls_id: 'RLS999',
      rls_eligible: true,
      list_office_mls_id: 'MALLAN',
      list_agent_mls_id: '10311201806',
    };
    expect(isMallanLocalListing(returnCopy as never)).toBe(false);

    const local = { listing_id: 'SL-0001', mls_id: null, rls_eligible: false };
    expect(isMallanLocalListing(local as never)).toBe(true);
  });

  it('and only the local row can be administered as a Mallan listing', () => {
    const returnCopy = {
      id: BigInt(901),
      listing_id: 'RLS999',
      mls_id: 'RLS999',
      rls_eligible: true,
      agent_id: AGENT_ID,
      last_synced_from_trestle: new Date(),
    };
    expect(listingCapabilities(BROKER, returnCopy as never).mayManageMallanLocalListing).toBe(false);
  });
});

describe('8. a failed save cannot look like it persisted', () => {
  it('a refused edit returns a non-2xx AND changes nothing', async () => {
    const id = await createListing({ owner_client_id: OWNER_ID.toString() });
    const before = JSON.stringify(row(id), (_k, v) => (typeof v === 'bigint' ? `${v}` : v));

    session = AGENT;
    const res = await capture(
      await PATCH_LISTING(
        makeRequest({ method: 'PATCH', body: { owner_client_id: OTHER_OWNER_ID.toString() } }),
        params(id),
      ),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    // The response carries an error the UI can show — not an empty 200.
    expect(typeof res.body.error).toBe('string');
    const after = JSON.stringify(row(id), (_k, v) => (typeof v === 'bigint' ? `${v}` : v));
    expect(after).toBe(before);
  });

  it('the CRM save path checks the response before telling the agent it saved', () => {
    // The API contract above is only half of it: a client that ignores the
    // status would still show "Saved". `MallanAPI` throws on a non-ok response,
    // which is what makes the UI unable to pretend.
    const apiClient = read('public/crm/js/core/api-client.js');
    expect(apiClient).toMatch(/if \(!res\.ok\)/);
    // A rejected promise, not a resolved one with an error body — a resolved
    // promise is what lets a `.then(showSaved)` run on a failure.
    expect(apiClient).toMatch(/return res\.json\(\)\.then\(function \(data\) \{[\s\S]{0,200}Promise\.reject/);
    // …carrying the SERVER's reason, so the agent sees why rather than a
    // generic failure.
    expect(apiClient).toMatch(/data\.error \|\| 'Request failed: '/);
  });
});

describe('9. provider sync cannot erase Mallan owner, publication or history', () => {
  it('the Cotality UPDATE lane omits `compliance` entirely', () => {
    // PRESERVE BY OMISSION. Writing `compliance: mapped.compliance` would
    // replace the whole JSON column — taking the publication namespace, its
    // history, and the validation record with it. An empty patch is the only
    // shape that cannot do that.
    expect(complianceUpdatePatch()).toEqual({});
    expect(Object.keys(complianceUpdatePatch())).toHaveLength(0);
  });

  it('and it never writes the canonical owner column', () => {
    // `owner_client_id` is a Mallan fact. Cotality has no opinion about it, so
    // no sync payload may contain it — a null from the provider would otherwise
    // unassign the seller.
    const src = read('lib/idx/sync.ts');
    const code = src
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    expect(code).not.toMatch(/owner_client_id\s*:/);
  });

  it('the sync UPDATE uses the omission helper at every call site', () => {
    // Guard the guard: if a future writer stopped calling it, the assertion
    // above would still pass while the column was being replaced.
    const src = read('lib/idx/sync.ts');
    const uses = src.match(/\.\.\.complianceUpdatePatch\(\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});
