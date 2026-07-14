// Tests for /api/crm/listing-campaigns (GET profile + POST compose/send).
// Prisma, auth, sendEmail, the DTO, and the compliance helpers are mocked; the
// real investor template + economics + confirmation helpers run so we prove the
// end-to-end shape (gate → FH → render → confirmation → recipients → audit).

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
    // NOTE: title is deliberately the NON-compliant CRM display value to prove the
    // email derives a DOS-compliant licensed title regardless.
    agent: {
      findUnique: async () => ({
        first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc', phone: '646-258-4460',
        title: 'Principal Broker', role: 'BROKER', license_no: '10311201806', license_type: 'broker', photo: null,
      }),
    },
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
    address: { streetNumber: '333', streetName: 'East 46th Street', unitNumber: '2G', neighborhood: 'Turtle Bay', city: 'New York' },
    media: [
      { url: 'https://cdn/photo1.jpg', mediaType: 'Photo' },
      { url: 'https://cdn/floor.jpg', mediaType: 'FloorPlan' },
      { url: 'https://cdn/photo2.jpg', mediaType: 'Photo' },
    ],
  }),
}));

import { NextRequest } from 'next/server';
import { escapeHtml } from '@/lib/sanitize';
import { economicsFingerprint } from '@/lib/email/campaign-confirmation';
import { POST, GET } from '../route';

const baseRow = {
  id: 10, listing_id: 'SL-0004', status: 'Active',
  owner_opt_out: false, participant_only: false,
  idx_display_yn: false, internet_entire_listing_display_yn: null,
  agent_id: 5, owner_client_id: null, rls_eligible: true,
};

function post(body: Record<string, unknown>): NextRequest {
  return new NextRequest('https://mallan.nyc/api/crm/listing-campaigns', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  });
}

// Attach a VALID confirmation bound to the economics in `body` (the way the UI
// does after the agent ticks the box against a fresh preview).
function confirmed(body: Record<string, unknown>): Record<string, unknown> {
  const fp = economicsFingerprint(String(body.listing_id || ''), {
    currentRent: (body.currentRent as string) ?? null,
    scheduledRent: (body.scheduledRent as string) ?? null,
    scheduledRentEffective: (body.scheduledRentEffective as string) ?? null,
    maintenance: (body.maintenance as string) ?? null,
    leaseExpiration: (body.leaseExpiration as string) ?? null,
  });
  return { ...body, confirmation: { confirmed: true, fingerprint: fp, confirmedAt: '2026-07-14T12:00:00.000Z', sourceRef: 'Lease p.3' } };
}

beforeEach(() => {
  mockFindUnique.mockReset().mockResolvedValue({ ...baseRow });
  mockLeadFindMany.mockReset().mockResolvedValue([]);
  mockAuditCreate.mockClear();
  mockFhScan.mockReset().mockReturnValue([]);
  mockSendEmail.mockReset().mockImplementation(async (_to, _s, _h, _u, opts) =>
    opts?.dryRun ? { success: true, _dryRun: true } : { success: true });
  delete process.env.CAMPAIGN_LIVE_SEND_ENABLED;
});

describe('GET — profile hydration (replaces the browser JS map)', () => {
  it('returns the SL-0004 investor profile', async () => {
    const req = new NextRequest('https://mallan.nyc/api/crm/listing-campaigns?listing_id=SL-0004');
    const json = await (await GET(req)).json();
    expect(json.profile.campaignType).toBe('investor');
    expect(json.profile.scheduledRent).toBe('$4,305/mo');
    expect(json.profile.scheduledRentEffective).toBe('2026-08-15');
    expect(json.profile.currentRent).toBe('');            // must be verified, not prefilled with the scheduled amount
    expect(json.profile.leaseExpiration).toBe('August 14, 2027');
  });
  it('returns a safe economics-free default for an unknown listing', async () => {
    const req = new NextRequest('https://mallan.nyc/api/crm/listing-campaigns?listing_id=SL-9999');
    const json = await (await GET(req)).json();
    expect(json.profile.campaignType).toBe('buyer');
    expect(json.profile.scheduledRent).toBeUndefined();
  });
});

describe('gate — Mallan CRM exclusive is NOT blocked by idx_display_yn', () => {
  it('preview succeeds for SL-0004 and heroes a PHOTO not the floor plan', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.html).toContain('333 East 46th Street');
    expect(json.html).toContain('765,000');
    expect(json.html.indexOf('cdn/photo1.jpg')).toBeLessThan(json.html.indexOf('cdn/floor.jpg'));
    expect(json.html).toContain('Floor Plan');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('renders computed metrics from a verified current rent + maintenance', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor', currentRent: '$4,305/mo', maintenance: '$1,748.65/mo' }));
    const json = await res.json();
    expect(json.html).toContain('4.0%');    // cap rate on the current in-place rent
    expect(json.html).toContain('860 SF');
    expect(json.metrics.capRatePct).toBeCloseTo(4.01, 1);  // preview returns metrics for the summary panel
  });
});

describe('agent identity — DOS-compliant licensed title + license number', () => {
  it('shows the LICENSED title even when the CRM record says "Principal Broker"', async () => {
    const json = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview' }))).json();
    expect(json.html).toContain('Licensed Real Estate Broker');
    expect(json.html).not.toContain('Principal Broker');
    expect(json.html).toContain('License #10311201806');
    expect(json.html).toContain('Maya Allan');
  });
});

describe('campaign type — non-investor inherits NO 1031/economics', () => {
  it('a buyer campaign omits the 1031 label, cap rate, rent, and calculator links', async () => {
    const json = await (await POST(post({
      listing_id: 'SL-0004', mode: 'preview', campaignType: 'buyer',
      headline: 'Sun-Filled Turtle Bay One-Bedroom', campaignLabel: 'New to Market',
      // even if economics are (wrongly) supplied, the buyer template must not show them
      currentRent: '$4,305/mo', maintenance: '$1,748.65/mo',
    }))).json();
    expect(json.html).toContain('New to Market');
    expect(json.html).toContain('Sun-Filled Turtle Bay One-Bedroom');
    expect(json.html).not.toContain('1031 Replacement');   // no 1031 label/wording
    expect(json.html).not.toContain('like-kind');           // no 1031 disclaimer
    expect(json.html).not.toContain('Cap Rate');
    expect(json.html).not.toContain('investor-calculator');
    expect(json.html).not.toContain('Current in-place rent');
    expect(json.html).not.toContain('$4,305');              // supplied economics not shown for buyer
  });
});

describe('campaign label + headline are editable and rendered', () => {
  it('renders the campaign label in place of the old hard-coded "1031 Replacement Property"', async () => {
    const json = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor', campaignLabel: 'Potential 1031 Replacement Opportunity' }))).json();
    expect(json.html).toContain('Potential 1031 Replacement Opportunity');
    expect(json.html).not.toContain('1031 Replacement Property');
  });
  it('changing the headline changes the rendered output', async () => {
    const a = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor', headline: 'Headline Alpha' }))).json();
    const b = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor', headline: 'Headline Beta' }))).json();
    expect(a.html).toContain('Headline Alpha');
    expect(b.html).toContain('Headline Beta');
    expect(a.html).not.toContain('Headline Beta');
  });
});

describe('temporal rent — a scheduled step-up is never labeled "current"', () => {
  it('shows $4,305 under a dated "scheduled" label, not as current, before 8/15/2026', async () => {
    const json = await (await POST(post({
      listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor',
      scheduledRent: '$4,305/mo', scheduledRentEffective: '2026-08-15',
      maintenance: '$1,748.65/mo', leaseExpiration: 'August 14, 2027',
    }))).json();
    expect(json.html).toContain('Scheduled rent effective August 15, 2026');
    expect(json.html).toContain('$4,305/mo');
    // The current-rent line must NOT carry the scheduled amount.
    expect(json.html).not.toMatch(/Current in-place rent[\s\S]{0,80}\$4,305/);
    // Cap-rate basis is disclosed as scheduled, not current.
    expect(json.html).toContain('scheduled rent effective August 15, 2026');
  });
});

describe('output escaping — no HTML injection via agent-composed fields', () => {
  it('escapes a <script> payload in the intro', async () => {
    const json = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', intro: '<script>alert(1)</script>' }))).json();
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
    mockFindUnique.mockResolvedValue({ ...baseRow, listing_id: 'RLS20093870' });
    const res = await POST(post({ listing_id: 'RLS20093870', mode: 'preview' }));
    expect(res.status).toBe(422);
    expect((await res.json()).gate_blocks).toContain('idx_display_yn');
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

describe('economics confirmation gate — no send/schedule without it', () => {
  const recips = [{ email: 'a@x.com', name: 'A' }];
  it('blocks dry-run for an investor listing without a confirmation (428)', async () => {
    const res = await POST(post({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips, maintenance: '$1,748.65/mo' }));
    expect(res.status).toBe(428);
    expect((await res.json()).confirmation_error).toBe('confirmation_required');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it('rejects a stale confirmation when a figure changed after confirming (428)', async () => {
    // fingerprint computed against the OLD maintenance, then maintenance edited
    const stale = confirmed({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips, maintenance: '$1,748.65/mo' });
    (stale as { maintenance: string }).maintenance = '$1,800.00/mo';
    const res = await POST(post(stale));
    expect(res.status).toBe(428);
    expect((await res.json()).confirmation_error).toBe('confirmation_stale');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it('does NOT gate a buyer/agent campaign behind the economics confirmation', async () => {
    // Economics may linger from a type switch, but a buyer send must not be blocked.
    const res = await POST(post({
      listing_id: 'SL-0004', mode: 'dry_run', campaignType: 'buyer',
      recipients: recips, headline: 'New to Market',
    }));
    expect(res.status).toBe(200);
    const actions = mockAuditCreate.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).not.toContain('email:economics_confirmed');
  });
  it('proceeds with a valid confirmation and audits who/when/what', async () => {
    const res = await POST(post(confirmed({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips, maintenance: '$1,748.65/mo', scheduledRent: '$4,305/mo', scheduledRentEffective: '2026-08-15', leaseExpiration: 'August 14, 2027' })));
    expect(res.status).toBe(200);
    const actions = mockAuditCreate.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).toContain('email:economics_confirmed');
    const confRow = mockAuditCreate.mock.calls
      .map((c) => (c[0] as { data: { action: string; changes: Record<string, unknown> } }).data)
      .find((d) => d.action === 'email:economics_confirmed');
    expect(confRow!.changes.confirmed_by).toBe('1');
    expect(confRow!.changes.confirmed_at).toBe('2026-07-14T12:00:00.000Z');
    expect((confRow!.changes.values_confirmed as Record<string, unknown>).scheduledRent).toBe('$4,305/mo');
    expect((confRow!.changes.effective_dates as Record<string, unknown>).scheduledRentEffective).toBe('2026-08-15');
  });
});

describe('recipient counts + dry-run send (with confirmation)', () => {
  const recips = [
    { email: 'a@x.com', name: 'A' }, { email: 'b@x.com', name: 'B' },
    { email: 'A@X.com', name: 'dup' }, { email: 'not-an-email', name: 'bad' },
  ];
  it('dry-run delivers nothing, counts correctly, and writes grouped audit rows', async () => {
    const res = await POST(post(confirmed({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips, maintenance: '$1,748.65/mo' })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.counts).toMatchObject({ received: 4, valid: 2, duplicate: 1, invalid: 1, suppressed: 0, deliverable: 2 });
    expect(json.result).toEqual({ sent: 0, failed: 0, skipped: 2 });
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail.mock.calls[0][4]).toMatchObject({ dryRun: true });
    // started + economics_confirmed + 2 recipients + completed = 5
    const actions = mockAuditCreate.mock.calls.map((c) => (c[0] as { data: { action: string } }).data.action);
    expect(actions).toEqual(['email:campaign_started', 'email:economics_confirmed', 'email:skipped', 'email:skipped', 'email:campaign_completed']);
  });
  it('excludes suppressed recipients from the deliverable count', async () => {
    mockLeadFindMany.mockResolvedValue([{ email: 'b@x.com' }]);
    const res = await POST(post(confirmed({ listing_id: 'SL-0004', mode: 'dry_run', recipients: recips, maintenance: '$1,748.65/mo' })));
    const json = await res.json();
    expect(json.counts).toMatchObject({ suppressed: 1, deliverable: 1 });
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('live send is fail-closed', () => {
  const recips = [{ email: 'a@x.com', name: 'A' }, { email: 'b@x.com', name: 'B' }];
  it('refuses live mode unless CAMPAIGN_LIVE_SEND_ENABLED is set', async () => {
    const res = await POST(post(confirmed({ listing_id: 'SL-0004', mode: 'live', confirmedCount: 2, recipients: recips, maintenance: '$1,748.65/mo' })));
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
  it('rejects a confirmedCount mismatch even when enabled', async () => {
    process.env.CAMPAIGN_LIVE_SEND_ENABLED = 'true';
    const res = await POST(post(confirmed({ listing_id: 'SL-0004', mode: 'live', confirmedCount: 99, recipients: recips, maintenance: '$1,748.65/mo' })));
    expect(res.status).toBe(409);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe('Codex #505 fixes — authenticated sender + no hard-coded defaults', () => {
  it('derives sender identity from the authenticated agent, ignoring spoofable body fields', async () => {
    const json = await (await POST(post({
      listing_id: 'SL-0004', mode: 'preview',
      agentName: 'Spoofed Person', agentEmail: 'spoof@evil.com', agentPhone: '000-000-0000',
    }))).json();
    expect(json.html).toContain('Maya Allan');
    expect(json.html).toContain('maya@mallan.nyc');
    expect(json.html).not.toContain('Spoofed Person');
    expect(json.html).not.toContain('spoof@evil.com');
  });
  it('a blank compose injects NO hard-coded 333 E 46th facts', async () => {
    const json = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', campaignType: 'investor' }))).json();
    expect(json.html).not.toContain('August 14, 2027');
    expect(json.html).not.toContain('roof deck');
    expect(json.html).not.toContain('Low closing costs');
    expect(json.html).not.toContain('no board interview');
  });
});

describe('SL-0004 approved #2G copy renders end-to-end (temporal economics)', () => {
  const profile = {
    campaignType: 'investor',
    campaignLabel: 'Potential 1031 Replacement Opportunity',
    headline: 'Tenant-Occupied Manhattan Investment Opportunity',
    intro: 'Condo rules with co-op economics — lease from day one, no board interview.',
    benefitBullets: ['Leased — tenant in place, and open to renewing', 'Low closing costs — about $5,000 less than a comparable condo'],
    purchaseStructure: 'Condop ownership with no board interview. The sale is subject to the building’s Right of First Refusal and issuance of the applicable waiver.',
    locationBlurb: 'Full-service building — 24-hour doorman, live-in superintendent, laundry, and a roof deck\nHeart of Midtown East — steps to the United Nations, transportation, and shopping',
    maintenance: '$1,748.65/mo', scheduledRent: '$4,305/mo', scheduledRentEffective: '2026-08-15', leaseExpiration: 'August 14, 2027',
  };
  const facts = ['Potential 1031 Replacement Opportunity', 'Tenant-Occupied Manhattan Investment Opportunity',
    'August 14, 2027', 'Right of First Refusal', 'no board interview', 'roof deck', 'Low closing costs', '$1,748.65', '$4,305', 'United Nations'];

  it('preview contains every approved fact', async () => {
    const json = await (await POST(post({ listing_id: 'SL-0004', mode: 'preview', ...profile }))).json();
    facts.forEach((f) => expect(json.html).toContain(f));
  });
  it('dry-run renders the same approved content and delivers nothing', async () => {
    const res = await POST(post(confirmed({ listing_id: 'SL-0004', mode: 'dry_run', ...profile, recipients: [{ email: 'a@x.com', name: 'A' }] })));
    const json = await res.json();
    expect(json.result).toEqual({ sent: 0, failed: 0, skipped: 1 });
    const htmlSent = mockSendEmail.mock.calls[0][2] as string;
    facts.forEach((f) => expect(htmlSent).toContain(f));
  });
});
