/// <reference types="jest" />
/**
 * PR-CRM.3 (2026-05-24) — Explicit consent capture on portal RSVP +
 * favorites/react routes.
 *
 * Closes the gap surfaced by the 2026-05-24 CRM Backbone Audit §6
 * (TCPA/CAN-SPAM gap on RSVP + favorites). Both routes silently
 * accepted submissions without verifying the user explicitly
 * consented to be contacted. The fix gates both POSTs on
 * `body.consent === true` (return 422 if missing/false) and
 * refreshes `Lead.consent_captured_at` on success.
 *
 * Note on file path: Maya's spec referenced
 * `app/api/portal/favorites/route.ts` as the favorites POST, but
 * that file only exposes GET. The actual favorites WRITE path is
 * `app/api/portal/listings/[id]/react/route.ts` (action: "liked").
 * This test covers BOTH routes — the spec intent ("gate the
 * favorites write") is satisfied at the actual write path.
 *
 * Behavioral assertions:
 *   RSVP:
 *     1. Missing consent      → 422 + no audit_event written
 *     2. consent: false       → 422
 *     3. consent: true        → 200 + audit_event written + Lead.consent_captured_at refreshed
 *     4. Missing open_house_id (with consent: true) → 400 (existing behavior preserved)
 *
 *   Favorites (react):
 *     5. Missing consent      → 422 + no ClientListingAction written
 *     6. consent: false       → 422
 *     7. consent: true + action: "liked" → 200 + Lead.consent_captured_at refreshed
 *     8. Invalid action (with consent: true) → 400 (existing behavior preserved)
 *
 * Strategy: mock prisma + auth + supporting libs, invoke each route
 * handler directly with a mock NextRequest. Same pattern as
 * tests/runtime/inquiry-effect.test.ts and crm-listing-send-fair-housing.test.ts.
 */

import { buildPrismaMock, makeRequest, readJson } from './helpers';

// ── Seeded jest.fn mocks shared across both route describes ────────────
const leadFindUnique = jest.fn(async () => ({ portal_role: 'buyer' }));
const leadUpdate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 99n,
  ...args.data,
}));
const auditEventCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 100n,
  created_at: new Date(),
  ...args.data,
}));
const listingFindUnique = jest.fn(async () => ({
  id: 7n,
  listing_id: 'LIST-001',
  status: 'Active',
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
}));
const clientListingActionFindUnique = jest.fn(async () => null); // no existing reaction
const clientListingActionCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
  id: 200n,
  ...args.data,
}));
const clientListingActionDelete = jest.fn(async () => ({ id: 200n }));

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findUnique: leadFindUnique, update: leadUpdate },
  auditEvent: { create: auditEventCreate },
  listing: { findUnique: listingFindUnique },
  clientListingAction: {
    findUnique: clientListingActionFindUnique,
    create: clientListingActionCreate,
    delete: clientListingActionDelete,
  },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// ── Auth mocks: requireAuth (RSVP) + requirePortalRole (react) ─────────
const requireAuthMock = jest.fn(async () => ({
  userId: 99n,
  userType: 'lead',
  role: 'BUYER',
}));
const requirePortalRoleMock = jest.fn(async () => ({
  userId: 99n,
  userType: 'lead',
  role: 'BUYER',
}));
const logAuditEventMock = jest.fn(async () => undefined);
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAuth: requireAuthMock,
  requirePortalRole: requirePortalRoleMock,
  isAuthError: () => false,
  logAuditEvent: logAuditEventMock,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

// ── React-route-specific support mocks ─────────────────────────────────
const createInquiryMock = jest.fn(async () => 999n);
jest.mock('@/lib/inquiries/create', () => ({
  __esModule: true,
  createInquiry: createInquiryMock,
}));
jest.mock('@/lib/search/listing-access-decision', () => ({
  __esModule: true,
  isListingDisplayable: () => true,
  buildSearchDisplayWhere: () => ({}),
}));
jest.mock('@/lib/portal/events', () => ({
  __esModule: true,
  recordPortalEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/utils/safe-bigint', () => ({
  __esModule: true,
  safeBigInt: (s: string) => {
    try {
      return BigInt(s);
    } catch {
      return null;
    }
  },
}));

// Import AFTER mocks.
import { POST as rsvpPOST } from '@/app/api/portal/open-houses/rsvp/route';
import { POST as reactPOST } from '@/app/api/portal/listings/[id]/react/route';

function clearAllMocks() {
  leadFindUnique.mockClear();
  leadUpdate.mockClear();
  auditEventCreate.mockClear();
  listingFindUnique.mockClear();
  clientListingActionFindUnique.mockClear();
  clientListingActionCreate.mockClear();
  clientListingActionDelete.mockClear();
  requireAuthMock.mockClear();
  requirePortalRoleMock.mockClear();
  logAuditEventMock.mockClear();
  createInquiryMock.mockClear();
}

// ═══════════════════════════════════════════════════════════════════════
// RSVP route — POST /api/portal/open-houses/rsvp
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/portal/open-houses/rsvp — consent gate (PR-CRM.3)', () => {
  beforeEach(() => clearAllMocks());

  it('returns 422 when consent is missing from body (does not write audit_event)', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { open_house_id: 'oh-1', listing_id: 'LIST-001' },
    });
    const res = await rsvpPOST(req);
    expect(res.status).toBe(422);
    const json = await readJson<{ error: string; consent_required: boolean }>(res);
    expect(json.consent_required).toBe(true);
    expect(json.error).toMatch(/consent/i);
    expect(auditEventCreate).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('returns 422 when consent is explicitly false', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { open_house_id: 'oh-1', consent: false },
    });
    const res = await rsvpPOST(req);
    expect(res.status).toBe(422);
    expect(auditEventCreate).not.toHaveBeenCalled();
  });

  it('succeeds with consent: true and persists consent_captured_at on Lead', async () => {
    const req = makeRequest({
      method: 'POST',
      body: {
        open_house_id: 'oh-1',
        listing_id: 'LIST-001',
        consent: true,
      },
    });
    const res = await rsvpPOST(req);
    expect(res.status).toBe(200);
    const json = await readJson<{ success: boolean; message: string }>(res);
    expect(json.success).toBe(true);
    // audit_event captured the RSVP with consent stamp
    expect(auditEventCreate).toHaveBeenCalledTimes(1);
    const auditArgs = auditEventCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(auditArgs.data.entity_type).toBe('open_house_rsvp');
    expect((auditArgs.data.changes as Record<string, unknown>).consent_captured_at).toBeDefined();
    // Lead.consent_captured_at refreshed
    expect(leadUpdate).toHaveBeenCalledTimes(1);
    const leadUpdateArgs = leadUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(leadUpdateArgs.data.consent_captured_at).toBeInstanceOf(Date);
  });

  it('preserves existing 400 behavior when open_house_id is missing (with valid consent)', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { consent: true /* no open_house_id, no event_id */ },
    });
    const res = await rsvpPOST(req);
    expect(res.status).toBe(400);
    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/open_house_id/);
    expect(auditEventCreate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// React/favorites route — POST /api/portal/listings/[id]/react
// (the actual favorites WRITE path; action: "liked" is the favorite)
// ═══════════════════════════════════════════════════════════════════════
describe('POST /api/portal/listings/[id]/react — consent gate (PR-CRM.3)', () => {
  beforeEach(() => clearAllMocks());

  const paramsLiked = { params: Promise.resolve({ id: '7' }) };

  it('returns 422 when consent is missing (does not write ClientListingAction)', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { action: 'liked' },
    });
    const res = await reactPOST(req, paramsLiked);
    expect(res.status).toBe(422);
    const json = await readJson<{ consent_required: boolean }>(res);
    expect(json.consent_required).toBe(true);
    expect(clientListingActionCreate).not.toHaveBeenCalled();
    expect(clientListingActionFindUnique).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('returns 422 when consent is explicitly false', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { action: 'liked', consent: false },
    });
    const res = await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(422);
    expect(clientListingActionCreate).not.toHaveBeenCalled();
  });

  it('succeeds with consent: true + action: "liked" and refreshes Lead.consent_captured_at', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { action: 'liked', consent: true },
    });
    const res = await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(200);
    const json = await readJson<{ action: string; active: boolean }>(res);
    expect(json.action).toBe('liked');
    expect(json.active).toBe(true);
    expect(clientListingActionCreate).toHaveBeenCalledTimes(1);
    // Lead.update was called with consent_captured_at refresh + existing
    // engagement timestamps preserved.
    expect(leadUpdate).toHaveBeenCalledTimes(1);
    const leadArgs = leadUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(leadArgs.data.consent_captured_at).toBeInstanceOf(Date);
    expect(leadArgs.data.last_click_at).toBeInstanceOf(Date);
    expect(leadArgs.data.last_response_at).toBeInstanceOf(Date);
  });

  it('preserves existing 400 behavior when action is invalid (with valid consent)', async () => {
    const req = makeRequest({
      method: 'POST',
      body: { action: 'invalid_action', consent: true },
    });
    const res = await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(400);
    const json = await readJson<{ error: string }>(res);
    expect(json.error).toMatch(/action must be one of/);
    expect(clientListingActionCreate).not.toHaveBeenCalled();
  });

  it('toggle-off path (existing reaction → delete) also refreshes consent_captured_at', async () => {
    // Stub findUnique to return an existing reaction → triggers delete branch.
    // Cast `as never` because the original jest.fn was inferred as `() => Promise<null>`
    // and TS won't widen the resolved value on mockResolvedValueOnce without it.
    clientListingActionFindUnique.mockResolvedValueOnce({
      id: 200n,
      lead_id: 99n,
      listing_id: 7n,
      action: 'liked',
    } as never);
    const req = makeRequest({
      method: 'POST',
      body: { action: 'liked', consent: true },
    });
    const res = await reactPOST(req, { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(200);
    const json = await readJson<{ active: boolean }>(res);
    expect(json.active).toBe(false);
    expect(clientListingActionDelete).toHaveBeenCalledTimes(1);
    expect(clientListingActionCreate).not.toHaveBeenCalled();
    // Toggle-off path now also refreshes consent_captured_at
    expect(leadUpdate).toHaveBeenCalledTimes(1);
    const leadArgs = leadUpdate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(leadArgs.data.consent_captured_at).toBeInstanceOf(Date);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Source pins — belt-and-suspenders structural assertions
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.3 — in-repo callers send consent: true (Codex P1 fix)', () => {
  // Codex P1 on PR #184 commit 6165fbe5 flagged that the backend now
  // requires body.consent === true, but in-repo portal callers were
  // still posting only { action }. This describe pins that ALL known
  // in-repo callers of POST /api/portal/listings/[id]/react now include
  // consent: true in their JSON body. Discovered via grep:
  //   - app/portal/buyer/page.tsx
  //   - app/portal/tenant/page.tsx
  //   - public/crm/js/core/api-client.js  (MallanAPI.portal.react wrapper)
  //   - public/crm/index-built.html       (bundled output of the above)
  // No other in-repo callers exist (grep confirmed; portals.js uses the
  // wrapper, not raw fetch — so updating the wrapper covers it).

  const fs = require('fs');
  const path = require('path');
  const ROOT = path.resolve(__dirname, '../..');

  it('buyer portal page sends consent: true with action', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/portal/buyer/page.tsx'), 'utf8');
    expect(src).toMatch(/handleReaction[\s\S]*?fetch\(`\/api\/portal\/listings\/\$\{listingId\}\/react`[\s\S]*?body:\s*JSON\.stringify\(\{\s*action,\s*consent:\s*true\s*\}\)/);
  });

  it('tenant portal page sends consent: true with action', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/portal/tenant/page.tsx'), 'utf8');
    expect(src).toMatch(/handleReaction[\s\S]*?fetch\(`\/api\/portal\/listings\/\$\{listingId\}\/react`[\s\S]*?body:\s*JSON\.stringify\(\{\s*action,\s*consent:\s*true\s*\}\)/);
  });

  it('MallanAPI.portal.react wrapper sends consent: true', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/crm/js/core/api-client.js'), 'utf8');
    // Pin the portal.react function body specifically (not just any
    // occurrence of consent: true elsewhere in the 1000+ line file).
    const portalReactMatch = src.match(/react:\s*function\s*\(listingId,\s*action,\s*comment\)\s*\{[\s\S]*?\},/);
    expect(portalReactMatch).not.toBeNull();
    expect(portalReactMatch![0]).toMatch(/consent:\s*true/);
    expect(portalReactMatch![0]).toMatch(/\/api\/portal\/listings\//);
  });

  it('bundled CRM shell (index-built.html) contains the consent: true from api-client.js', () => {
    // Sanity check that the regenerated bundle picked up the consent
    // patch in the source file. If this fails, the CRM static shell
    // drift guard in guardrails.yml will also fail.
    const src = fs.readFileSync(path.join(ROOT, 'public/crm/index-built.html'), 'utf8');
    expect(src).toMatch(/react:\s*function\s*\(listingId,\s*action,\s*comment\)[\s\S]{0,2000}consent:\s*true/);
  });
});

describe('PR-CRM.3 — source pins (consent gate position + persistence)', () => {
  const RSVP_PATH = require('path').resolve(
    __dirname,
    '../../app/api/portal/open-houses/rsvp/route.ts',
  );
  const REACT_PATH = require('path').resolve(
    __dirname,
    '../../app/api/portal/listings/[id]/react/route.ts',
  );

  it('RSVP route: consent check returns status 422', () => {
    const src = require('fs').readFileSync(RSVP_PATH, 'utf8');
    expect(src).toMatch(/body\.consent\s*!==\s*true/);
    expect(src).toMatch(/status:\s*422/);
  });

  it('RSVP route: consent check runs BEFORE auditEvent.create', () => {
    const src = require('fs').readFileSync(RSVP_PATH, 'utf8');
    const consentIdx = src.indexOf('body.consent !== true');
    const auditIdx = src.indexOf('auditEvent.create');
    expect(consentIdx).toBeGreaterThan(0);
    expect(auditIdx).toBeGreaterThan(0);
    expect(consentIdx).toBeLessThan(auditIdx);
  });

  it('RSVP route: persists consent_captured_at on Lead row', () => {
    const src = require('fs').readFileSync(RSVP_PATH, 'utf8');
    expect(src).toMatch(/lead\.update[\s\S]*consent_captured_at:\s*new Date\(\)/);
  });

  it('React route: consent check returns status 422', () => {
    const src = require('fs').readFileSync(REACT_PATH, 'utf8');
    expect(src).toMatch(/body\.consent\s*!==\s*true/);
    expect(src).toMatch(/status:\s*422/);
  });

  it('React route: consent check runs BEFORE prisma writes', () => {
    const src = require('fs').readFileSync(REACT_PATH, 'utf8');
    const consentIdx = src.indexOf('body.consent !== true');
    const findIdx = src.indexOf('clientListingAction.findUnique');
    expect(consentIdx).toBeGreaterThan(0);
    expect(findIdx).toBeGreaterThan(0);
    expect(consentIdx).toBeLessThan(findIdx);
  });

  it('React route: persists consent_captured_at on Lead row', () => {
    const src = require('fs').readFileSync(REACT_PATH, 'utf8');
    // Both create and delete branches refresh consent_captured_at.
    const consentRefreshes = src.match(/consent_captured_at:\s*new Date\(\)/g) || [];
    expect(consentRefreshes.length).toBeGreaterThanOrEqual(2);
  });
});
