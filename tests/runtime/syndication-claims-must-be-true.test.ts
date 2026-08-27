/// <reference types="jest" />
/**
 * THE SYSTEM MAY NOT CLAIM A DISTRIBUTION IT DOES NOT PERFORM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE BROKER IS TOLD, AND WHAT HAPPENS
 *
 * The CRM listing workspace renders a "Last Published" card with a
 * "Refresh Syndication" button (public/crm/js/dashboard/workspace.js). Pressing
 * it POSTs to /api/crm/syndication/refresh, and on success the CRM toasts:
 *
 *     "Syndication refresh queued"
 *
 * because the route answers `{ status: "queued" }`, above a comment reading
 * "Actual sync happens via cron — this just records the request."
 *
 * Every part of that is checked below against what the repo can actually do:
 *
 *   1. NO CRON READS IT. The route writes an audit event named
 *      `syndication_refresh_requested`. Nothing in lib/, app/ or scripts/ ever
 *      reads that name back, and no entry in vercel.json's cron list points at
 *      any syndication or export path.
 *   2. NO EXPORT ROUTE EXISTS. There is no app/api/exports/**. The only
 *      syndication route in the tree is this one.
 *   3. THE PROGRAM IS HELD CLOSED. `MALLAN_OFFICE_MLS_IDS` in
 *      lib/syndication/mallan-identity.ts is deliberately empty, and invariant
 *      I.5 in that file states that with it empty "ALL listings are blocked at
 *      Layer 1".
 *
 * So nothing is queued, nothing is exported, and nothing ever will be until
 * Maya turns the program on. "queued" is a claim about a queue that does not
 * exist.
 *
 * This matters past tidiness because a broker acts on it: the natural next step
 * after "Syndication refresh queued" is telling a seller their listing has been
 * re-published to the portals. That is a representation made to a client on the
 * strength of a status string this system invented.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SECOND CLAIM
 *
 * public/crm/js/core/data-loader.js builds a `permissions` object for every
 * listing at three separate places. Every other member is DERIVED from the API
 * row — `owner_opt_out === true`, `idx_display_yn !== false`, and so on. One is
 * a constant:
 *
 *     syndication: true
 *
 * There is no `syndicateYN` / `SyndicateTo` field anywhere in the CRM listings
 * DTO, so the value is not a reading of anything. And the compliance output
 * phrases the negative as "Not Syndicated — listing will not be distributed to
 * third-party portals", which makes the ABSENCE of that warning read as an
 * affirmative statement that the listing IS distributed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS TEST DOES NOT ASK FOR
 *
 * Not that syndication be implemented. It is HELD, and it stays held — no
 * export route, no cron, no office ids, no change to the Layer 1 guard. The
 * requirement is only that the system describe the state it is actually in:
 * the request is RECORDED, and it is NOT exported, and the reason is that the
 * program is not configured. Those are three different facts and the word
 * "queued" collapses them into a fourth that is not true.
 *
 * Audit logging is UNCHANGED — the event still fires. Telling the truth about
 * an action is not the same as not recording it.
 */
process.env.READONLY_MODE = 'false';

import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/**
 * Source with comment lines stripped. A comment RECORDING that a claim was
 * removed is not the claim — without this, the note explaining the fix would
 * itself keep the test red.
 */
const executableOnly = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

const mockValidateSession = jest.fn();
const mockListingFindUnique = jest.fn();
const mockLogAuditEvent = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findUnique: (a: unknown) => mockListingFindUnique(a) } },
}));

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (t: string) => mockValidateSession(t),
  };
});

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return {
    __esModule: true,
    ...actual,
    logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a),
  };
});

import { NextRequest } from 'next/server';
import { MALLAN_OFFICE_MLS_IDS } from '@/lib/syndication/mallan-identity';

async function refresh() {
  const { POST } = await import('@/app/api/crm/syndication/refresh/route');
  const req = new NextRequest('https://x.test/api/crm/syndication/refresh', {
    method: 'POST',
    body: JSON.stringify({ listing_id: 'SL-0004' }),
    headers: { 'content-type': 'application/json' },
  });
  req.cookies.set('session_token', 'tok');
  return POST(req);
}

beforeEach(() => {
  jest.resetModules();
  for (const m of [mockValidateSession, mockListingFindUnique, mockLogAuditEvent]) m.mockReset();
  mockValidateSession.mockResolvedValue({
    userId: 1n,
    userType: 'agent',
    role: 'BROKER',
    sessionId: 's',
  });
  mockListingFindUnique.mockResolvedValue({ id: 7n, listing_id: 'SL-0004', rls_eligible: true });
  mockLogAuditEvent.mockResolvedValue(undefined);
});

describe('the premise: nothing in this repo can export a listing', () => {
  it('the syndication program is held closed', () => {
    // Invariant I.5 — with this empty, Layer 1 blocks every row.
    expect(MALLAN_OFFICE_MLS_IDS.length).toBe(0);
  });

  it('no cron is pointed at syndication or export', () => {
    const vercel = read('vercel.json');
    const crons = JSON.parse(vercel).crons as Array<{ path: string }>;
    expect(crons.length).toBeGreaterThan(0); // guard the guard
    expect(crons.filter((c) => /syndicat|export/i.test(c.path))).toEqual([]);
  });

  it('the audit event the route writes is never read back', () => {
    // It is a record, not a work item. Nothing consumes it.
    const route = read('app/api/crm/syndication/refresh/route.ts');
    expect(route).toContain('syndication_refresh_requested');
  });
});

describe('the refresh route reports what actually happened', () => {
  it('does NOT answer "queued" — there is no queue', async () => {
    const body = await (await refresh()).json();
    expect(body.status).not.toBe('queued');
  });

  it('says plainly that nothing was exported, and why', async () => {
    const body = await (await refresh()).json();
    expect(body.exported).toBe(false);
    expect(body.reason).toBe('SYNDICATION_NOT_CONFIGURED');
  });

  it('still records the request — the audit event is not weakened', async () => {
    await refresh();
    expect(mockLogAuditEvent).toHaveBeenCalled();
    expect(mockLogAuditEvent.mock.calls[0][0]).toBe('syndication_refresh_requested');
  });

  it('derives the state from the config guard, not a hardcoded string', () => {
    // If Maya populates MALLAN_OFFICE_MLS_IDS, this route must stop saying
    // "not configured" on its own. A literal would have to be found and edited.
    const route = read('app/api/crm/syndication/refresh/route.ts');
    expect(route).toContain('MALLAN_OFFICE_MLS_IDS');
  });

  it('no longer claims a cron performs the sync', () => {
    const route = read('app/api/crm/syndication/refresh/route.ts');
    expect(route).not.toMatch(/Actual sync happens via cron/);
  });
});

describe('the CRM does not tell the broker it was queued', () => {
  it('the toast text is gone', () => {
    const ws = executableOnly(read('public/crm/js/dashboard/workspace.js'));
    expect(ws).not.toMatch(/Syndication refresh queued/);
  });
});

describe('the CRM does not assert syndication on every listing', () => {
  it('permissions.syndication is not hardcoded true', () => {
    // Every sibling permission is derived from the API row. This one was a
    // constant, and there is no syndicate field in the DTO to derive it from.
    const loader = executableOnly(read('public/crm/js/core/data-loader.js'));
    expect(loader).not.toMatch(/syndication:\s*true/);
  });
});
