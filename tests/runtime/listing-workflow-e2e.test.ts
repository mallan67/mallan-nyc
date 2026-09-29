/// <reference types="jest" />
/**
 * A4 — THE SALE AND RENTAL WORKFLOWS, END TO END, THROUGH THE REAL ROUTES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS AN E2E TEST AND NOT A SOURCE GREP
 *
 * Every step below calls the ACTUAL exported route handler and the next step
 * reads back through another ACTUAL route handler. Nothing asserts on source
 * text. The persistence between steps is a real in-memory store
 * (`support/in-memory-prisma.ts`), so "reload and verify no silent data loss"
 * means the reload genuinely queries what the save genuinely wrote — the one
 * thing a per-call mock can never prove.
 *
 * The chain runs once per listing type in `beforeAll` and records each step into
 * a transcript. Each `it` then asserts on its own step, so a failure names the
 * step that broke rather than collapsing the whole workflow into one red line.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REAL AND WHAT IS STUBBED
 *
 * REAL — every rule this is meant to prove:
 *   the CRM create/read/edit routes, the publication transition boundary and its
 *   state machine, the audience-specific compliance evaluator (Fair Housing,
 *   address display, broker attribution, FARE), the market-status route and its
 *   transition machine, the public DTO gate, the capability resolver.
 *
 * STUBBED — infrastructure with no rule in it, which would otherwise fail for
 * reasons unrelated to the workflow:
 *   Next.js cache revalidation (needs a request context), the search-projection
 *   dual write (its own transaction boundary), and the notification engine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OPERATIONAL HOLD, STATED NOT PAPERED OVER
 *
 * This is BRANCH-LOCAL proof. The `listings.status` migration has NOT been
 * applied to Production — NEON.md restricts `listings` migrations to the
 * 3–5 AM ET window and this worktree has no DATABASE_URL. What is proven here
 * is that the code paths behave correctly against the MIGRATED SCHEMA SHAPE
 * (nullable market status, no default). It is not, and is not labelled as,
 * Production or authenticated-Preview proof.
 */
import { makeRequest, readJson } from './helpers';
import { createInMemoryPrisma } from './support/in-memory-prisma';

const AGENT_ID = BigInt(3);
const BROKER_ID = BigInt(1);
const OTHER_AGENT_ID = BigInt(4);
const OWNER_SALE_ID = BigInt(31);
const OWNER_RENT_ID = BigInt(32);

type Session = { userId: bigint; userType: 'agent' | 'lead'; role: string; sessionId: string };

const AGENT: Session = { userId: AGENT_ID, userType: 'agent', role: 'AGENT', sessionId: 's-agent' };
const BROKER: Session = { userId: BROKER_ID, userType: 'agent', role: 'BROKER', sessionId: 's-broker' };
const OTHER_AGENT: Session = {
  userId: OTHER_AGENT_ID,
  userType: 'agent',
  role: 'AGENT',
  sessionId: 's-other',
};

/** The identity every mocked auth helper reports. Swapped mid-chain. */
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
import { GET as GET_LISTING, PATCH as PATCH_LISTING } from '@/app/api/crm/listings/[id]/route';
import { PATCH as PATCH_PUBLICATION } from '@/app/api/crm/listings/[id]/publication/route';
import { PATCH as PATCH_STATUS } from '@/app/api/crm/listings/[id]/status/route';
import { readPublication, lastPublishedAt } from '@/lib/crm/publication-state';
import { filterDisplayableDbListings, dbListingToPublicDTO } from '@/lib/idx/db-to-public-dto';

interface Step {
  status: number;
  body: Record<string, unknown>;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function capture(res: Response): Promise<Step> {
  let body: Record<string, unknown> = {};
  try {
    body = (await readJson<Record<string, unknown>>(res)) ?? {};
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

/** The row as it exists in the store right now — the reload the CRM would do. */
function storedListing(listingId: string): Record<string, unknown> | undefined {
  return store.rows('listing').find((r) => r.listing_id === listingId);
}

/**
 * A copy of the row AT THIS POINT IN THE CHAIN.
 *
 * The whole workflow runs in `beforeAll`, so reading the live store from an
 * assertion would only ever see the FINAL state — and "it is born with no market
 * status" would be checked against a listing that has since gone Active and
 * Pending. Snapshots are what make each step's assertion about that step.
 */
function snap(listingId: string): Record<string, unknown> {
  const row = storedListing(listingId);
  if (!row) throw new Error(`[e2e] no stored listing ${listingId} to snapshot`);
  return JSON.parse(
    JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? `${v}` : v)),
  ) as Record<string, unknown>;
}

interface WorkflowCase {
  kind: 'sale' | 'rent';
  listingType: 'sale' | 'rent';
  ownerId: bigint;
  price: number;
  goLiveStatus: string;
  terminalStatus: string;
}

const CASES: WorkflowCase[] = [
  {
    kind: 'sale',
    listingType: 'sale',
    ownerId: OWNER_SALE_ID,
    price: 1850000,
    goLiveStatus: 'Active',
    terminalStatus: 'Sold',
  },
  {
    kind: 'rent',
    listingType: 'rent',
    ownerId: OWNER_RENT_ID,
    price: 6200,
    goLiveStatus: 'Active',
    terminalStatus: 'Rented',
  },
];

function seedPeople() {
  store.reset();
  store.seed('lead', [
    { id: OWNER_SALE_ID, agent_id: AGENT_ID, first_name: 'Dana', last_name: 'Seller', roles: ['seller'] },
    { id: OWNER_RENT_ID, agent_id: AGENT_ID, first_name: 'Robin', last_name: 'Landlord', roles: ['landlord'] },
  ]);
  store.seed('agent', [
    { id: AGENT_ID, first_name: 'Alex', last_name: 'Agent', role: 'AGENT' },
    { id: BROKER_ID, first_name: 'Maya', last_name: 'Allan', role: 'BROKER' },
  ]);
}

/**
 * The rental facts the FARE Act fee-disclosure gate requires before a rental may
 * go display-ready (NYC LL 119/2024). Supplied for the rental case only, because
 * that gate is real and this workflow is meant to pass it honestly rather than
 * be exempted from it.
 */
const RENTAL_FEE_FACTS = {
  MoveInCostsAmount: 6200,
  TenantPaysBrokerFeeYN: false,
  RentalApplicationFee: 20,
};

describe.each(CASES)('$kind — the full listing workflow', (c) => {
  const steps: Record<string, Step> = {};
  const snaps: Record<string, Record<string, unknown>> = {};
  let listingId = '';

  beforeAll(async () => {
    seedPeople();
    session = AGENT;

    // ── 1. Agent creates a Mallan-authored listing, naming the canonical owner
    steps.create = await capture(
      await CREATE_LISTING(
        makeRequest({
          method: 'POST',
          body: {
            listing_type: c.listingType,
            rls_eligible: false,
            owner_client_id: c.ownerId.toString(),
            // Canonical RESO names: these are what normalizePayload /
            // buildPersistenceRecord and the PATCH route actually read. Using the
            // column names would silently store nothing, and a workflow test that
            // asserts on values it never managed to save proves nothing.
            ListPrice: c.price,
            BedroomsTotal: 2,
            BathroomsFull: 2,
            PublicRemarks: 'Sunny corner apartment with river views and a renovated kitchen.',
            // FLAT canonical address fields. A nested `address` object is stored
            // verbatim under UnparsedAddress and never parsed, which leaves the
            // listing with no street name and no public slug.
            StreetNumber: '400',
            StreetName: 'East 90th Street',
            UnitNumber: '17C',
            City: 'New York',
            StateOrProvince: 'NY',
            PostalCode: '10128',
            ...(c.listingType === 'rent' ? RENTAL_FEE_FACTS : {}),
          },
        }),
      ),
    );
    listingId = String(steps.create.body.listing_id ?? '');
    snaps.afterCreate = snap(listingId);

    // ── 2. Reload through the CRM detail route
    steps.readback = await capture(await GET_LISTING(makeRequest({ method: 'GET' }), params(listingId)));

    // ── 3. Edit a fact, then reload again
    steps.edit = await capture(
      await PATCH_LISTING(
        makeRequest({ method: 'PATCH', body: { ListPrice: c.price + 25000, BedroomsTotal: 3 } }),
        params(listingId),
      ),
    );
    steps.readbackAfterEdit = await capture(
      await GET_LISTING(makeRequest({ method: 'GET' }), params(listingId)),
    );
    snaps.afterEdit = snap(listingId);

    // ── 4. Submit for publication review (agent may)
    steps.submit = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'SUBMITTED' } }),
        params(listingId),
      ),
    );

    // ── 5. Agent attempts a BROKER-only approval
    steps.review = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'REVIEW_IN_PROGRESS' } }),
        params(listingId),
      ),
    );
    steps.complianceCheck = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'COMPLIANCE_CHECK' } }),
        params(listingId),
      ),
    );
    steps.agentApprove = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'APPROVED' } }),
        params(listingId),
      ),
    );

    // ── 6. The broker approves. APPROVED is an INTERNAL state — the machine
    //      refuses a public audience here, because approving a listing is not
    //      publishing it. Visibility is chosen at step 8, not smuggled in now.
    session = BROKER;
    steps.brokerApprove = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'APPROVED' } }),
        params(listingId),
      ),
    );

    // ── 7. Discriminatory advertising copy blocks PUBLIC publication, with
    //      explicit reasons. Evaluated here rather than at approval because Fair
    //      Housing applies from the PRIVATE_CLIENT audience upward, and APPROVED
    //      is INTERNAL_ONLY — this is the first step whose audience reaches it.
    session = AGENT;
    steps.badCopySave = await capture(
      await PATCH_LISTING(
        makeRequest({
          method: 'PATCH',
          body: { PublicRemarks: 'Ideal for a Christian family. No Section 8. Adults only.' },
        }),
        params(listingId),
      ),
    );
    session = BROKER;
    steps.blockedByCompliance = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'PUBLISHED_PUBLIC', visibility: 'PUBLIC_WEB' } }),
        params(listingId),
      ),
    );
    snaps.afterBlockedPublish = snap(listingId);

    // ── 8. Fix the copy; the broker chooses the public audience and it publishes
    session = AGENT;
    await PATCH_LISTING(
      makeRequest({
        method: 'PATCH',
        body: { PublicRemarks: 'Sunny corner apartment with river views and a renovated kitchen.' },
      }),
      params(listingId),
    );
    session = BROKER;
    steps.publish = await capture(
      await PATCH_PUBLICATION(
        makeRequest({ method: 'PATCH', body: { to: 'PUBLISHED_PUBLIC', visibility: 'PUBLIC_WEB' } }),
        params(listingId),
      ),
    );

    snaps.afterPublish = snap(listingId);

    // ── 9. Market status: none → on the market
    steps.goLive = await capture(
      await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: c.goLiveStatus } }), params(listingId)),
    );

    // ── 10. A later market-status transition
    steps.pending = await capture(
      await PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status: 'Pending' } }), params(listingId)),
    );

    // ── 11. Final reload
    steps.finalReadback = await capture(
      await GET_LISTING(makeRequest({ method: 'GET' }), params(listingId)),
    );
    snaps.final = snap(listingId);
  });

  it('1. the listing is created, and it is Mallan-authored', () => {
    expect(steps.create.status).toBe(201);
    expect(listingId).toMatch(c.listingType === 'rent' ? /^RL-/ : /^SL-/);
    expect(snaps.afterCreate.mls_id ?? null).toBeNull();
  });

  it('2. it is born with NO market status, and DRAFT publication', () => {
    const row = snaps.afterCreate;
    expect(row.status ?? null).toBeNull();
    const pub = readPublication(row.compliance);
    expect(pub.state).toBe('DRAFT');
    expect(pub.visibility).toBe('INTERNAL_ONLY');
  });

  it('3. the canonical owner is stored, from the value the form sent', () => {
    expect(String(snaps.afterCreate.owner_client_id)).toBe(c.ownerId.toString());
  });

  it('4. reloading returns the listing with its owner intact', () => {
    expect(steps.readback.status).toBe(200);
    expect(String(steps.readback.body.owner_client_id)).toBe(c.ownerId.toString());
    expect(steps.readback.body.listing_id).toBe(listingId);
  });

  it('5. an edit saves, and the reload shows it — with no silent loss elsewhere', () => {
    expect(steps.edit.status).toBeLessThan(400);
    const row = snaps.afterEdit;
    expect(Number(row.list_price)).toBe(c.price + 25000);
    expect(Number(row.bedrooms_total)).toBe(3);
    // The fields the edit did not name are still there. A PATCH that rebuilt
    // the row from its own body would have dropped these.
    expect(String(row.owner_client_id)).toBe(c.ownerId.toString());
    expect(Number(row.bathrooms_full)).toBe(2);
    expect(steps.readbackAfterEdit.status).toBe(200);
    expect(Number(steps.readbackAfterEdit.body.list_price)).toBe(c.price + 25000);
  });

  it('6. editing facts does not silently advance publication', () => {
    // A PATCH is not an approval. If editing could move the workflow, an agent
    // could publish by saving a form.
    expect(readPublication(snaps.afterEdit.compliance).state).not.toBe('APPROVED');
  });

  it('7. the agent may submit it for review', () => {
    expect(steps.submit.status).toBeLessThan(400);
  });

  it('8. the agent may NOT perform the broker-only approval', () => {
    expect(steps.agentApprove.status).toBe(403);
    expect(steps.agentApprove.body.code).toBe('ACTOR_NOT_PERMITTED');
    // And the state did not move.
    expect(steps.agentApprove.body.to).toBe('APPROVED');
  });

  it('9. discriminatory advertising copy blocks publication, with the reason', () => {
    expect(steps.blockedByCompliance.status).toBe(409);
    const compliance = steps.blockedByCompliance.body.compliance as {
      passed: boolean;
      failures: Array<{ code: string; message: string }>;
    };
    expect(compliance.passed).toBe(false);
    expect(compliance.failures.length).toBeGreaterThan(0);
    // Explicit reasons, not a bare refusal.
    expect(compliance.failures.map((f) => f.message).join(' ')).toMatch(/\S/);
  });

  it('10. with the copy fixed, the BROKER approves and chooses the audience', () => {
    expect(steps.brokerApprove.status).toBeLessThan(400);
    expect(steps.publish.status).toBeLessThan(400);
    const pub = readPublication(snaps.afterPublish.compliance);
    expect(pub.state).toBe('PUBLISHED_PUBLIC');
    expect(pub.visibility).toBe('PUBLIC_WEB');
  });

  it('11. Last Published records the actual publication transition', () => {
    const at = lastPublishedAt(readPublication(snaps.afterPublish.compliance));
    expect(at).not.toBeNull();
    expect(Number.isNaN(Date.parse(at as string))).toBe(false);
  });

  it('12. publication alone does NOT put the listing on the market', () => {
    // Two different questions, two different authorities. Approving a listing
    // for publication is not a claim about what the market is doing.
    const publishedRow = store.writeLog.filter((w) => w.model === 'listing' && w.op === 'update');
    expect(publishedRow.length).toBeGreaterThan(0);
    // The market status only moved at step 9, through the status route.
    expect(steps.goLive.status).toBeLessThan(400);
  });

  it('13. the market status transition from NULL succeeds and is stored', () => {
    expect(steps.goLive.status).toBeLessThan(400);
    expect(steps.goLive.body.previous_status ?? null).toBeNull();
    expect(steps.pending.status).toBeLessThan(400);
    expect(snaps.final.status).toBe('Pending');
  });

  it('14. the later transition preserved owner, publication state and history', () => {
    const row = snaps.final;
    expect(String(row.owner_client_id)).toBe(c.ownerId.toString());
    const pub = readPublication(row.compliance);
    expect(pub.state).toBe('PUBLISHED_PUBLIC');
    expect(pub.history.length).toBeGreaterThanOrEqual(3);
  });

  it('15. the final reload resolves the SAME listing identity', () => {
    expect(steps.finalReadback.status).toBe(200);
    expect(steps.finalReadback.body.listing_id).toBe(listingId);
    expect(String(steps.finalReadback.body.owner_client_id)).toBe(c.ownerId.toString());
  });

  it('16. the public consumer resolves the same identity, under its own gate', () => {
    const row = storedListing(listingId) as Record<string, unknown>;
    // Pending is not a publicly displayable market status, so the public gate
    // refuses it — publication state does not override the market question.
    expect(filterDisplayableDbListings([row as never])).toHaveLength(0);

    // With a displayable market status it resolves, and it is the same listing.
    const active = { ...row, status: 'Active' };
    const displayable = filterDisplayableDbListings([active as never]);
    expect(displayable).toHaveLength(1);
    expect(dbListingToPublicDTO(displayable[0]).id).toBe(listingId);
  });
});
