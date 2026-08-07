// Tests for POST /api/crm/listing-campaigns.
// Prisma, auth, sendEmail, the DTO, and the compliance helpers are mocked; the
// real investor template + real recipient-list helpers run so we prove the end-
// to-end shape (gate → FH → render → recipients → per-recipient audit).

const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockLeadFindMany = jest.fn<Promise<{ email: string }[]>, [unknown]>().mockResolvedValue([]);
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
const mockSendEmail = jest.fn();
const mockFhScan = jest.fn<{ field: string; severity: string }[], [unknown]>(() => []);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findUnique: (a: unknown) => mockFindUnique(a) },
    lead: { findMany: (a: unknown) => mockLeadFindMany(a) },
    auditEvent: { create: (a: unknown) => mockAuditCreate(a) },
    agent: { findUnique: async () => ({ first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc', phone: '646-258-4460', title: 'Licensed Real Estate Broker', role: 'BROKER' }) },
  },
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ userId: 1, userType: 'broker' }),
  isAuthError: () => false,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: (...a: unknown[]) => mockSendEmail(...a) }));
jest.mock('@/lib/compliance/rls-enforcement', () => ({
  __esModule: true,
  scanRecordForFairHousing: (a: unknown) => mockFhScan(a),
}));
jest.mock('@/lib/compliance/gates', () => ({ __esModule: true, affirmPermission: (v: unknown) => v === true }));
jest.mock('@/lib/idx/trestle-mapper', () => ({
  __esModule: true,
  TERMINAL_STATUSES: new Set(['Closed', 'Cancelled', 'Expired', 'Withdrawn']),
  normalizeStandardStatus: (s: unknown) => String(s),
}));
jest.mock('@/lib/idx/db-to-public-dto', () => ({
  __esModule: true,
  dbListingToPublicDTO: () => ({
    mlsId: 'SL-0004',
    url: '/listing/333-east-46th-street',
    listPrice: 765000,
    bedroomsTotal: 1,
    bathroomsFull: 1,
    livingArea: 860,
    propertyType: 'Condop',
    address: {
      streetNumber: '333',
      streetName: 'East 46th Street',
      unitNumber: '2G',
      neighborhood: 'Turtle Bay',
      city: 'New York',
    },
    // Photo-first from the shared resolver; a FloorPlan is present but must NEVER
    // become the hero or an additional photo.
    media: [
      { url: 'https://cdn/photo1.jpg', mediaType: 'Photo' },
      { url: 'https://cdn/floor.jpg', mediaType: 'FloorPlan' },
      { url: 'https://cdn/photo2.jpg', mediaType: 'Photo' },
    ],
  }),
}));

import { NextRequest } from 'next/server';
import { escapeHtml } from '@/lib/sanitize';
import { POST } from '../route';

/**
 * FIXTURE REALISM CORRECTION (2026-08-07).
 *
 * `rls_eligible` was `true` for SL-0004. That does not match the listing this
 * fixture represents, and it made these tests pass for the WRONG REASON: the
 * route used to exempt any `SL-`/`RL-` prefix from the IDX redistribution gates,
 * so an RLS-eligible row with `idx_display_yn: false` was sent anyway.
 *
 * SL-0004 is a WEBSITE-ONLY exclusive — non-RLS inventory — per four
 * independent sources in this repository:
 *
 *   docs/architecture/SELLER-001-SPEC-2026-07-03.md:21
 *     "SL-0004 (website-only exclusive; Trestle copy of same unit: RLS20093870)"
 *   docs/audits/corrections/P1C6-feed-reconcile-eligible-orphans.md:242
 *     "SL-0004 and other non-RLS exclusives correctly excluded — they are never
 *      in the Cotality Active [feed]"
 *   docs/audits/corrections/P1C6-feed-reconcile-eligible-orphans.md:200
 *     "SL-0004 (a Mallan exclusive, correctly never in the Trestle [feed])"
 *   app/listing/[...slug]/page.tsx:456
 *     "Mallan's own website-only exclusives like SL-0004"
 *
 * With `rls_eligible: false` these tests now pass for the RIGHT reason —
 * SL-0004 is distributable because it is NOT RLS redistribution inventory, not
 * because its id happens to start with "SL-". The prefix carries no permission.
 *
 * The third-party case below overrides `listing_id` to `RLS20093870` (the
 * Trestle copy of the SAME unit) and sets `rls_eligible: true`, so it is
 * correctly gated.
 */
const baseRow = {
  id: 10, listing_id: 'SL-0004', status: 'Active',
  owner_opt_out: false, participant_only: false,
  idx_display_yn: false, internet_entire_listing_display_yn: null,
  agent_id: 5, owner_client_id: null, rls_eligible: false,
};

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://mallan.nyc/api/crm/listing-campaigns', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue({ ...baseRow });
  mockLeadFindMany.mockReset().mockResolvedValue([]);
  mockAuditCreate.mockClear();
  mockFhScan.mockReset().mockReturnValue([]);
  mockSendEmail.mockReset().mockImplementation(async (_to, _s, _h, _u, opts) =>
    opts?.dryRun ? { success: true, _dryRun: true } : { success: true },
  );
  delete process.env.CAMPAIGN_LIVE_SEND_ENABLED;
});

describe('gate — Mallan CRM exclusive is NOT blocked by idx_display_yn', () => {
  it('preview succeeds for SL-0004 despite idx_display_yn=false, and heroes a PHOTO not the floor plan', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.html).toContain('333 East 46th Street');
    expect(json.html).toContain('765,000');
    expect(json.html).toContain('cdn/photo1.jpg'); // hero photo present
    // The FloorPlan may appear in its OWN section but never as the hero: the hero
    // photo must come before the floor plan in the document.
    expect(json.html.indexOf('cdn/photo1.jpg')).toBeLessThan(json.html.indexOf('cdn/floor.jpg'));
    expect(json.html).toContain('Floor Plan');
    expect(mockSendEmail).not.toHaveBeenCalled();  // preview never delivers
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('renders computed investment metrics (cap rate, NOI, price/SF) from rent + maintenance', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview', currentRent: '$4,305/mo', maintenance: '$1,748.65/mo' }));
    const json = await res.json();
    // price 765000, rent 4,305/mo, maint 1,748.65/mo, 860 SF → light figures row shows:
    expect(json.html).toContain('4.0%');    // est. cap rate (NOI/price)
    expect(json.html).toContain('860 SF');  // interior square footage (SL-0004 actual)
  });
});

describe('output escaping — no HTML injection via agent-composed fields', () => {
  it('escapes a <script> payload in the intro instead of rendering it raw', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview', intro: '<script>alert(1)</script>' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.html).not.toContain('<script>alert(1)</script>');
    expect(json.html).toContain(escapeHtml('<script>alert(1)</script>'));
  });
});

describe('gate — hard blockers still fail closed', () => {
  it('blocks when owner_opt_out is true', async () => {
    mockFindUnique.mockResolvedValue({ ...baseRow, owner_opt_out: true });
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview' }));
    expect(res.status).toBe(422);
    expect((await res.json()).gate_blocks).toContain('owner_opt_out');
  });

  it('blocks a terminal status', async () => {
    mockFindUnique.mockResolvedValue({ ...baseRow, status: 'Closed' });
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview' }));
    expect(res.status).toBe(422);
    expect((await res.json()).gate_blocks.join(',')).toContain('terminal_status');
  });

  it('blocks a THIRD-PARTY IDX listing when idx_display_yn is not affirmed', async () => {
    // RLS20093870 is the Trestle copy of the SAME physical unit as SL-0004, and
    // it IS RLS inventory — so it must carry rls_eligible: true here.
    mockFindUnique.mockResolvedValue({
      ...baseRow,
      listing_id: 'RLS20093870',
      rls_eligible: true,
    });
    const res = await POST(post({ listing_id: 'RLS20093870', mode: 'preview' }));
    expect(res.status).toBe(422);
    expect((await res.json()).gate_blocks).toContain('idx_display_yn');
  });

  /**
   * THE DEFECT THIS ROUTE USED TO HAVE.
   *
   * An `SL-`/`RL-` prefix previously exempted a listing from BOTH IDX
   * redistribution gates. An RLS-ELIGIBLE Mallan exclusive with
   * `idx_display_yn: false` was therefore distributable. A prefix is
   * provenance, not permission — the RLS gates must bind whenever the row is
   * RLS-backed, whatever its id looks like.
   */
  it('blocks an RLS-ELIGIBLE SL- exclusive when idx_display_yn is not affirmed', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRow,
      listing_id: 'SL-0007',
      rls_eligible: true,        // RLS-backed despite the SL- prefix
      idx_display_yn: false,
    });
    const res = await POST(post({ listing_id: 'SL-0007', mode: 'preview' }));
    expect(res.status).toBe(422);
    expect((await res.json()).gate_blocks).toContain('idx_display_yn');
  });

  it('blocks an RLS-ELIGIBLE RL- exclusive when internet_entire_listing_display_yn is not affirmed', async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRow,
      listing_id: 'RL-0007',
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: null,   // fail-closed
    });
    const res = await POST(post({ listing_id: 'RL-0007', mode: 'preview' }));
    expect(res.status).toBe(422);
    expect((await res.json()).gate_blocks).toContain(
      'internet_entire_listing_display_yn',
    );
  });
});

describe('Fair Housing scan', () => {
  it('returns 422 when a violation is found, before any send', async () => {
    mockFhScan.mockReturnValue([{ field: 'intro', severity: 'hard' }]);
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview', intro: 'perfect for families' }));
    expect(res.status).toBe(422);
    expect((await res.json()).fair_housing_violations[0].field).toBe('intro');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('recipient counts + dry-run send', () => {
  const recips = [
    { email: 'a@x.com', name: 'A' },
    { email: 'b@x.com', name: 'B' },
    { email: 'A@X.com', name: 'dup' }, // duplicate (case-insensitive)
    { email: 'not-an-email', name: 'bad' },
  ];

  it('dry-run delivers nothing, counts correctly, and writes grouped audit rows', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.counts).toMatchObject({ received: 4, valid: 2, duplicate: 1, invalid: 1, suppressed: 0, deliverable: 2 });
    expect(json.result).toEqual({ sent: 0, failed: 0, skipped: 2 }); // dry-run → skipped
    expect(json.campaign_id).toBeTruthy();
    // sendEmail called per deliverable, always with dryRun:true (no real delivery)
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail.mock.calls[0][4]).toMatchObject({ dryRun: true });
    // audit: campaign_started + 2 per-recipient + campaign_completed = 4, all tagged campaign_id
    expect(mockAuditCreate).toHaveBeenCalledTimes(4);
    const actions = mockAuditCreate.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).toEqual(['email:campaign_started', 'email:skipped', 'email:skipped', 'email:campaign_completed']);
  });

  it('excludes suppressed (unsubscribed) recipients from the deliverable count', async () => {
    mockLeadFindMany.mockResolvedValue([{ email: 'b@x.com' }]);
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips }));
    const json = await res.json();
    expect(json.counts).toMatchObject({ suppressed: 1, deliverable: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('live send is fail-closed', () => {
  it('refuses live mode unless CAMPAIGN_LIVE_SEND_ENABLED is set', async () => {
    const res = await POST(post({
      listing_id: 'SL-0004', mode: 'live', confirmedCount: 2,
      recipients: [{ email: 'a@x.com', name: 'A' }, { email: 'b@x.com', name: 'B' }],
    }));
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('rejects a confirmedCount mismatch even when enabled', async () => {
    process.env.CAMPAIGN_LIVE_SEND_ENABLED = 'true';
    const res = await POST(post({
      listing_id: 'SL-0004', mode: 'live', confirmedCount: 99,
      recipients: [{ email: 'a@x.com', name: 'A' }, { email: 'b@x.com', name: 'B' }],
    }));
    expect(res.status).toBe(409);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('Codex #505 fixes — authenticated sender + no hard-coded defaults', () => {
  it('derives sender identity from the authenticated agent, ignoring spoofable body fields', async () => {
    const res = await POST(post({
      listing_id: 'SL-0004', mode: 'preview',
      agentName: 'Spoofed Person', agentEmail: 'spoof@evil.com', agentPhone: '000-000-0000',
    }));
    const json = await res.json();
    expect(json.html).toContain('Maya Allan');       // from the mocked authenticated agent
    expect(json.html).toContain('maya@mallan.nyc');
    expect(json.html).not.toContain('Spoofed Person');
    expect(json.html).not.toContain('spoof@evil.com');
  });

  it('a blank compose injects NO hard-coded 333 E 46th facts (no false facts on other listings)', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview' })); // no copy fields supplied
    const json = await res.json();
    expect(json.html).not.toContain('August 14, 2027');   // was a baked-in default lease date
    expect(json.html).not.toContain('roof deck');          // was a baked-in default amenity
    expect(json.html).not.toContain('Low closing costs');  // was a baked-in default bullet
    expect(json.html).not.toContain('no board interview'); // was a baked-in default hook
  });
});

describe('SL-0004 listing profile — approved #2G copy renders end-to-end', () => {
  const profile = {
    intro: 'Condo rules with co-op economics — lease from day one, no board interview.',
    benefitBullets: [
      'Leased — tenant in place paying $4,305/month through August 14, 2027 (4% cap), and open to renewing',
      'Low closing costs — all-cash closing runs about $7,000 for this condop vs about $12,000 for a comparable condo (roughly $5,000 less)',
    ],
    purchaseStructure: 'Condop ownership with no board interview. The sale is subject to the building’s Right of First Refusal and issuance of the applicable waiver.',
    locationBlurb: 'Full-service building — 24-hour doorman, live-in superintendent, laundry, and a roof deck\nHeart of Midtown East — steps to the United Nations, transportation, and shopping',
    maintenance: '$1,748.65/mo', currentRent: '$4,305/mo', leaseExpiration: 'August 14, 2027',
  };
  const facts = ['August 14, 2027', 'Right of First Refusal', 'no board interview', 'roof deck',
    'Low closing costs', '$1,748.65', '$4,305', 'United Nations'];

  it('preview contains every approved fact', async () => {
    const json = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', ...profile }))).json();
    facts.forEach((f) => expect(json.html).toContain(f));
  });

  it('dry-run renders the same approved content (and delivers nothing)', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'dry_run', ...profile, recipients: [{ email: 'a@x.com', name: 'A' }] }));
    const json = await res.json();
    expect(json.result).toEqual({ sent: 0, failed: 0, skipped: 1 });
    // the html passed to sendEmail carries the approved facts
    const htmlSent = mockSendEmail.mock.calls[0][2] as string;
    facts.forEach((f) => expect(htmlSent).toContain(f));
  });
});
