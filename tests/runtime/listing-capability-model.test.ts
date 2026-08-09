/**
 * LISTING CAPABILITY MODEL — replaces `agent_id`-as-ownership.
 *
 * CHARTER Section 1A: `syncAgentHistory` stamps `Listing.agent_id` on matches
 * against BOTH `ListAgentMlsId` AND `BuyerAgentMlsId`. So `agent_id` on a synced
 * row means "this Mallan agent appears in this listing's history" — it does NOT
 * mean "this Mallan agent owns/manages this listing".
 *
 * The pre-existing gate at 13 sites was:
 *
 *     auth.role !== "BROKER" && listing.agent_id !== auth.userId  ->  403
 *
 * which grants FULL CRM WRITE AUTHORITY to (a) any broker on ANY row including
 * third-party IDX inventory, and (b) any agent who merely appeared as the BUYER
 * agent on a third-party row. Both mutate Cotality-source-owned data.
 *
 * These tests pin the distinct capabilities. They must NOT collapse into one
 * generic `ownsListing`: "may view the history" and "may mutate source fields"
 * are different questions with different correct answers on the same row.
 */

import {
  classifyListingSource,
  listingCapabilities,
  type CapabilityListing,
} from '@/lib/auth/listing-capabilities';

const BROKER = { userId: 1n, role: 'BROKER' };
const ASSIGNED_AGENT = { userId: 42n, role: 'AGENT' };
const OTHER_AGENT = { userId: 99n, role: 'AGENT' };

/** Mallan-authored local listing, assigned to agent 42. */
const LOCAL: CapabilityListing = {
  listing_id: 'SL-0004',
  rls_eligible: false,
  list_office_mls_id: null,
  agent_id: 42n,
  last_synced_from_trestle: null,
};

/** Mallan's own listing returned through Cotality. Agent 42 is in its history. */
const RETURN_COPY: CapabilityListing = {
  listing_id: 'RLS20093870',
  rls_eligible: true,
  list_office_mls_id: '7041',
  agent_id: 42n,
  last_synced_from_trestle: new Date('2026-08-01T00:00:00Z'),
};

/** Third-party listing where agent 42 was the BUYER agent (history only). */
const THIRD_PARTY: CapabilityListing = {
  listing_id: 'RLS20105333',
  rls_eligible: true,
  list_office_mls_id: '9999',
  agent_id: 42n,
  last_synced_from_trestle: new Date('2026-08-01T00:00:00Z'),
};

describe('source classification', () => {
  it('separates the three concepts', () => {
    expect(classifyListingSource(LOCAL)).toBe('mallan-local');
    expect(classifyListingSource(RETURN_COPY)).toBe('mallan-rls-return-copy');
    expect(classifyListingSource(THIRD_PARTY)).toBe('third-party-rls');
  });

  it('a local row is local even when an office id is somehow present', () => {
    expect(classifyListingSource({ ...LOCAL, list_office_mls_id: '7041' })).toBe('mallan-local');
  });
});

describe('LOCAL Mallan SL/RL — management preserved', () => {
  it('the assigned local agent keeps the full local workflow', () => {
    const c = listingCapabilities(ASSIGNED_AGENT, LOCAL);
    expect(c.mayManageMallanLocalListing).toBe(true);
    expect(c.mayManageMallanPublicOpenHouse).toBe(true);
    expect(c.mayViewSellerReport).toBe(true);
    expect(c.mayManageLocalMedia).toBe(true);
    expect(c.mayUploadNewLocalMedia).toBe(true);
    expect(c.mayViewHistory).toBe(true);
  });

  it('broker administration is preserved on local rows', () => {
    const c = listingCapabilities(BROKER, LOCAL);
    expect(c.mayManageMallanLocalListing).toBe(true);
    expect(c.mayManageLocalMedia).toBe(true);
    expect(c.mayUploadNewLocalMedia).toBe(true);
    expect(c.mayViewSellerReport).toBe(true);
  });

  it('broker administers an UNASSIGNED local row', () => {
    const c = listingCapabilities(BROKER, { ...LOCAL, agent_id: null });
    expect(c.mayManageMallanLocalListing).toBe(true);
  });

  it('an unrelated agent may NOT manage another agent local listing', () => {
    const c = listingCapabilities(OTHER_AGENT, LOCAL);
    expect(c.mayManageMallanLocalListing).toBe(false);
    expect(c.mayViewSellerReport).toBe(false);
  });

  it('a local public open house NEVER requires a prior RLS/Cotality open house', () => {
    // No Cotality OpenHouse record exists for a local row by construction.
    const c = listingCapabilities(ASSIGNED_AGENT, LOCAL);
    expect(c.mayManageMallanPublicOpenHouse).toBe(true);
  });
});

describe('MALLAN RLS RETURN-COPY — source-owned, no CRM mutation', () => {
  const forBroker = () => listingCapabilities(BROKER, RETURN_COPY);
  const forAgent = () => listingCapabilities(ASSIGNED_AGENT, RETURN_COPY);

  it('stays internally VISIBLE for reconciliation/audit', () => {
    expect(forBroker().mayViewHistory).toBe(true);
    expect(forAgent().mayViewHistory).toBe(true);
  });

  it('denies listing/status/property mutation — even to the broker', () => {
    expect(forBroker().mayManageMallanLocalListing).toBe(false);
    expect(forAgent().mayManageMallanLocalListing).toBe(false);
  });

  it('denies NEW Mallan media uploads — those belong on the local twin', () => {
    expect(forBroker().mayUploadNewLocalMedia).toBe(false);
    expect(forAgent().mayUploadNewLocalMedia).toBe(false);
  });

  /**
   * Media ownership follows the KEY NAMESPACE, not the row. Genuine historical
   * Mallan uploads do sit on RLS rows; making management local-only would leave
   * them permanently undeletable. The feed photos on this same row are
   * protected per-ITEM by `isCrmMediaKey()` at each write route — proven by the
   * media-authority tests — not by this listing-level flag.
   */
  it('still permits managing EXISTING crm: media that sits on this row', () => {
    expect(forBroker().mayManageLocalMedia).toBe(true);
    expect(forAgent().mayManageLocalMedia).toBe(true);
  });

  it('denies public open-house management on the returned twin', () => {
    // The LOCAL twin is where the public open house lives.
    expect(forBroker().mayManageMallanPublicOpenHouse).toBe(false);
  });

  it('denies seller-report authority on the returned twin', () => {
    expect(forBroker().mayViewSellerReport).toBe(false);
  });
});

describe('THIRD-PARTY RLS — association is not ownership', () => {
  const c = () => listingCapabilities(ASSIGNED_AGENT, THIRD_PARTY);

  it('agent_id grants history visibility ONLY', () => {
    expect(c().mayViewHistory).toBe(true);
  });

  it('agent_id alone grants NO seller-report authority', () => {
    expect(c().mayViewSellerReport).toBe(false);
  });

  it('agent_id alone grants NO listing/status mutation and NO new uploads', () => {
    expect(c().mayManageMallanLocalListing).toBe(false);
    expect(c().mayUploadNewLocalMedia).toBe(false);
  });

  it('BROKER role alone grants NO mutation of third-party source data', () => {
    // The old gate let any BROKER write to every row in the table.
    const b = listingCapabilities(BROKER, THIRD_PARTY);
    expect(b.mayManageMallanLocalListing).toBe(false);
    expect(b.mayUploadNewLocalMedia).toBe(false);
    expect(b.mayViewSellerReport).toBe(false);
  });
});

describe('source-derived field editing is never granted', () => {
  it.each([
    ['local', LOCAL],
    ['return-copy', RETURN_COPY],
    ['third-party', THIRD_PARTY],
  ])('%s: mayEditSourceDerivedThirdPartyField is false', (_label, row) => {
    expect(listingCapabilities(BROKER, row).mayEditSourceDerivedThirdPartyField).toBe(false);
    expect(listingCapabilities(ASSIGNED_AGENT, row).mayEditSourceDerivedThirdPartyField).toBe(false);
  });
});

describe('SHOWINGS — private client showings survive', () => {
  it('an agent may schedule a private client showing on a THIRD-PARTY listing', () => {
    // A buyer-side agent must keep working on inventory Mallan does not list.
    expect(listingCapabilities(ASSIGNED_AGENT, THIRD_PARTY).mayScheduleClientShowing).toBe(true);
    expect(listingCapabilities(OTHER_AGENT, THIRD_PARTY).mayScheduleClientShowing).toBe(true);
  });

  it('a private showing does NOT imply public open-house authority', () => {
    const c = listingCapabilities(OTHER_AGENT, THIRD_PARTY);
    expect(c.mayScheduleClientShowing).toBe(true);
    expect(c.mayManageMallanPublicOpenHouse).toBe(false);
  });

  it('showings work on the return-copy and on local rows too', () => {
    expect(listingCapabilities(OTHER_AGENT, RETURN_COPY).mayScheduleClientShowing).toBe(true);
    expect(listingCapabilities(OTHER_AGENT, LOCAL).mayScheduleClientShowing).toBe(true);
  });
});

describe('CURSOR SAFETY — CRM writes must not poison the Trestle watermark', () => {
  /**
   * `getLastSyncTimestamp()` (lib/idx/sync.ts) returns
   *   MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL
   * and feeds it to the OData filter `ModificationTimestamp gt SINCE`.
   *
   * PR-S.7 already excluded CRM-ONLY rows from that MAX. It did NOT stop a CRM
   * write to a SYNCED row: such a row passes the `last_synced_from_trestle IS
   * NOT NULL` filter, so `modification_timestamp: new Date()` makes the cursor
   * local-NOW and the next incremental sync skips every genuine upstream change.
   */
  it('a synced row is flagged as cursor-bearing', () => {
    expect(listingCapabilities(BROKER, THIRD_PARTY).isTrestleCursorBearing).toBe(true);
    expect(listingCapabilities(BROKER, RETURN_COPY).isTrestleCursorBearing).toBe(true);
  });

  it('a CRM-only local row is NOT cursor-bearing', () => {
    expect(listingCapabilities(BROKER, LOCAL).isTrestleCursorBearing).toBe(false);
  });

  it('every capability that could bump the watermark is denied on synced rows', () => {
    for (const actor of [BROKER, ASSIGNED_AGENT]) {
      for (const row of [RETURN_COPY, THIRD_PARTY]) {
        const c = listingCapabilities(actor, row);
        expect(c.isTrestleCursorBearing).toBe(true);
        expect(c.mayManageMallanLocalListing).toBe(false);
        expect(c.mayUploadNewLocalMedia).toBe(false);
      }
    }
  });

  /**
   * `mayManageLocalMedia` IS allowed on a synced row (historical `crm:` media),
   * so the watermark protection for that path cannot come from the capability —
   * it comes from `crmListingTouchData()`, which returns null for any row with
   * a non-null `last_synced_from_trestle`. Pinned here so the two halves of the
   * cursor defense stay visibly connected.
   */
  it('media management on a synced row relies on crmListingTouchData, not the capability', () => {
    const c = listingCapabilities(BROKER, RETURN_COPY);
    expect(c.mayManageLocalMedia).toBe(true);
    expect(c.isTrestleCursorBearing).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { crmListingTouchData } = require('@/lib/media/crm-media');
    expect(crmListingTouchData(RETURN_COPY.last_synced_from_trestle)).toBeNull();
    expect(crmListingTouchData(null)).not.toBeNull();
    expect(crmListingTouchData(undefined)).toBeNull();
  });
});

describe('fail-closed defaults', () => {
  it('an unknown role gets nothing but showing scheduling is still role-gated', () => {
    const c = listingCapabilities({ userId: 7n, role: 'GUEST' }, LOCAL);
    expect(c.mayManageMallanLocalListing).toBe(false);
    expect(c.mayViewSellerReport).toBe(false);
    expect(c.mayScheduleClientShowing).toBe(false);
  });

  it('role casing is normalized so a broker is recognized consistently', () => {
    // Three of the 13 sites already used `.toUpperCase()` and the rest did not.
    expect(listingCapabilities({ userId: 1n, role: 'broker' }, LOCAL).mayManageMallanLocalListing).toBe(true);
  });

  it('a null agent_id never matches a null actor association', () => {
    const c = listingCapabilities(ASSIGNED_AGENT, { ...LOCAL, agent_id: null });
    expect(c.mayManageMallanLocalListing).toBe(false);
  });

  it('numeric and bigint agent_id compare correctly', () => {
    const c = listingCapabilities(ASSIGNED_AGENT, { ...LOCAL, agent_id: 42 as unknown as bigint });
    expect(c.mayManageMallanLocalListing).toBe(true);
  });
});
