/// <reference types="jest" />
/**
 * My Listings must never claim an external distribution that Mallan did not perform.
 *
 * Proven defect (Slice 2 census, 2026-09-15), at public/crm/js/manage/manage-listings.js:
 *
 *   - `_mapApiListingToManage` set `media.rlsUploaded: true` as a BOOLEAN LITERAL, reading no API field at
 *     all — unlike its two siblings on the same object, which genuinely read `api.idx_display_yn`,
 *     `api.owner_opt_out` and `api.participant_only`. Every listing the grid rendered therefore asserted
 *     "Uploaded to REBNY RLS via Trestle", including Cotality-feed rows Mallan never uploaded;
 *   - `cardDistributeToggle` / `cardDistributeSync` / `cardDistributePush` reported success —
 *     "Listing uploaded to REBNY RLS", "Synced … to RLS", "Updates pushed to: REBNY RLS, IDX, mallan.nyc" —
 *     through pure in-memory mutation plus a toast. None of the three performs a network call. There is no
 *     fetch, no MallanAPI call and no await anywhere in them.
 *
 * This is a different and worse class of defect than a wrong number on a screen: it is a false claim about an
 * EXTERNAL system's state. An agent who trusts the badge does not file a listing that was never filed, which
 * is UCBA Art. I §5 simultaneous-distribution exposure arriving through a UI that says the work is done.
 *
 * The correction is fail-closed, not a replacement writer. `public/crm/js/core/api-client.js` exposes no
 * upload / sync / push method, and syndication exports are HELD (CLAUDE.md §C) with no `/api/exports/*` route.
 * Unknown external distribution state must stay unknown. `manageWithdrawListing` (manage-listings.js) is the
 * model this follows: it refuses rather than mutating when no writer is available, under its own comment
 * "A refusal is a refusal. Never report a withdrawal the server did not make."
 *
 * SCOPE. Owner authorization "SLICE 2 MUTATION BATCH 1" covers `rlsUploaded` and the Upload / Sync / Push
 * actions only. The IDX and Web toggles on the same panel are ALSO local-only writers with unconditional
 * success toasts (`cardDistributeToggle` feeds 'idx' and 'web'); they are deliberately left as they are and
 * are reported for a separate ruling. Their READ path is legitimate and is pinned below so that fixing the
 * RLS literal cannot silently damage it.
 *
 * BEHAVIOURAL, not source-grep, for every rendered claim: the real module runs in jsdom against the real
 * partials. Two source/artifact pins are kept deliberately, because the requirement is that no such code path
 * SURVIVES — a behavioural test can only prove the paths it happens to exercise.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeRequest } from './helpers';
import { statusPresentation, STATUS_FACT_FIELDS } from '@/lib/crm/status-mapping';

const requireAgentOrBrokerMock = jest.fn(async () => ({ userId: 7n, role: 'BROKER', userType: 'agent' }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (...a: unknown[]) => requireAgentOrBrokerMock(...a as []),
  isAuthError: (v: unknown) => v instanceof Response,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const MANAGE_SRC = readFileSync(resolve(ROOT, 'public/crm/js/manage/manage-listings.js'), 'utf8');
const OH_SRC = readFileSync(resolve(ROOT, 'public/crm/js/manage/open-houses.js'), 'utf8');
const MANAGE_HTML = readFileSync(resolve(ROOT, 'public/crm/html/manage-listings.html'), 'utf8');
const MODAL_HTML = readFileSync(resolve(ROOT, 'public/crm/html/modals/status-change.html'), 'utf8');
const BUILT = readFileSync(resolve(ROOT, 'public/crm/index-built.html'), 'utf8');

type Rec = Record<string, unknown>;

/** The list DTO's projection of a stored row (mirrors app/api/crm/listings/route.ts). */
function project(row: Rec): Rec {
  const raw = (row.raw_data as Rec) ?? {};
  const facts: Rec = {};
  for (const f of STATUS_FACT_FIELDS) if (raw[f] !== undefined && raw[f] !== null && raw[f] !== '') facts[f] = raw[f];
  const { raw_data: _omit, ...rest } = row;
  void _omit;
  return { ...rest, status_presentation: statusPresentation(row as Parameters<typeof statusPresentation>[0]), status_facts: facts };
}

function base(over: Rec): Rec {
  return {
    id: '1', listing_id: 'SL-0001', mls_id: null, listing_type: 'sale', status: 'Active', list_price: '1000000',
    bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0,
    address: { StreetNumber: '10', StreetName: 'Park', StreetSuffix: 'Ave', UnitNumber: '4B' },
    features: {}, media: [{ MediaURL: 'https://example.invalid/1.jpg' }],
    created_at: '2026-01-02T00:00:00Z', updated_at: '2026-02-03T00:00:00Z',
    status_changed_at: '2026-05-05T00:00:00Z', listing_contract_date: null,
    idx_display_yn: true, owner_opt_out: false, participant_only: false,
    sync_status: null, terminal_since: null, raw_data: {},
    ...over,
  };
}

const ROWS: Rec[] = [
  base({ id: '1', listing_id: 'SL-0001', status: 'Active' }),
  base({ id: '2', listing_id: 'SL-0002', status: 'Active' }),
];

async function optionsFor(url: string) {
  const { GET } = await import('@/app/api/crm/status-options/route');
  const res = await GET(makeRequest({ method: 'GET', url: 'http://localhost' + url }));
  if (res.status !== 200) throw new Error('status-options ' + res.status);
  return res.json();
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function boot(rows: Rec[] = ROWS): any {
  const dom = new jsdom.JSDOM(`<!doctype html><html><body>${MANAGE_HTML}${MODAL_HTML}</body></html>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.MallanAPI = {
    listings: {
      list: jest.fn(async () => ({ listings: rows.map(project) })),
      updateStatus: jest.fn(async () => ({ ok: true })),
      update: jest.fn(async () => ({})),
    },
    _fetch: jest.fn(async (url: string) => optionsFor(url)),
    showings: { list: jest.fn(async () => ({ showings: [] })), update: jest.fn(async () => ({})) },
  };
  w.showToast = jest.fn();
  w.confirm = jest.fn(() => true);
  w.prompt = jest.fn(() => null);
  w.eval(OH_SRC);
  w.eval(MANAGE_SRC);
  return w;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toastText = (w: any): string => String(w.document.getElementById('manageToastMsg').textContent || '');

describe('My Listings — the RLS upload flag is never fabricated', () => {
  it('no listing reports an RLS upload, because no API field carries that fact', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    for (const id of ['SL-0001', 'SL-0002']) {
      const rlsUploaded = w.manageFindListing(id).media.rlsUploaded;
      expect({ id, rlsUploaded, why: 'no API field carries this fact, so the state is unknown — never true' })
        .toEqual({ id, rlsUploaded: null, why: expect.any(String) });
    }
  });

  it('the card photo banner shows no "Uploaded to REBNY RLS via Trestle" badge', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const cards = w.document.getElementById('manageCardList').innerHTML;
    expect(cards).toContain('example.invalid');           // the photo banner really did render
    expect(cards).not.toContain('Uploaded to REBNY RLS via Trestle');
    expect(cards).not.toMatch(/>RLS</);
  });

  it('the distribute panel states the RLS state is not confirmed, and never "Uploaded to RLS"', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const panel = w.renderCardDistributePanel(w.manageFindListing('SL-0001'));
    expect(panel).not.toContain('Uploaded to RLS');
    expect(panel).not.toContain('Last sync:');
    expect(panel).toMatch(/not confirmed/i);
  });

  it('the two sibling distribution flags remain API-derived and undamaged', async () => {
    const w = boot([
      base({ id: '1', listing_id: 'SL-0001', idx_display_yn: true, owner_opt_out: false, participant_only: false }),
      base({ id: '2', listing_id: 'SL-0002', idx_display_yn: false }),
      base({ id: '3', listing_id: 'SL-0003', idx_display_yn: true, owner_opt_out: true }),
    ]);
    w.renderManageSection('sales'); await flush();
    expect(w.manageFindListing('SL-0001').media.idxDisplayYN).toBe(true);
    expect(w.manageFindListing('SL-0001').media.webDisplayed).toBe(true);
    expect(w.manageFindListing('SL-0002').media.idxDisplayYN).toBe(false);
    expect(w.manageFindListing('SL-0003').media.idxDisplayYN).toBe(true);
    expect(w.manageFindListing('SL-0003').media.webDisplayed).toBe(false);   // owner opt-out suppresses web
  });
});

describe('My Listings — Upload / Sync / Push cannot report work that never happened', () => {
  it('cardDistributeToggle(…,"rls",true) refuses: no mutation, and the toast says NOT sent', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const before = w.manageFindListing('SL-0001').update;

    w.cardDistributeToggle('SL-0001', 'rls', true);

    expect(w.manageFindListing('SL-0001').media.rlsUploaded).not.toBe(true);
    expect(w.manageFindListing('SL-0001').update).toBe(before);
    expect(toastText(w)).toMatch(/NOT/);
    expect(toastText(w)).not.toMatch(/uploaded to REBNY RLS$/i);
  });

  it('cardDistributeSync refuses and does not stamp an update date for work that never happened', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const before = w.manageFindListing('SL-0001').update;

    w.cardDistributeSync('SL-0001', 'rls');

    expect(w.manageFindListing('SL-0001').update).toBe(before);
    expect(toastText(w)).toMatch(/NOT/);
    expect(toastText(w)).not.toMatch(/^Synced /);
  });

  it('cardDistributePush never claims a push to REBNY RLS, IDX or mallan.nyc', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const before = w.manageFindListing('SL-0001').update;

    w.cardDistributePush('SL-0001');

    expect(w.manageFindListing('SL-0001').update).toBe(before);
    expect(toastText(w)).not.toContain('Updates pushed to');
    expect(toastText(w)).toMatch(/NOT/);
  });

  it('the Upload and Push controls render disabled, with an explanation', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const host = w.document.createElement('div');
    host.innerHTML = w.renderCardDistributePanel(w.manageFindListing('SL-0001'));

    const buttons = Array.from(host.querySelectorAll('button')) as HTMLButtonElement[];
    const labelled = (re: RegExp) => buttons.filter((b) => re.test(String(b.textContent || '')));

    const upload = labelled(/Upload/i);
    const push = labelled(/Push Updates/i);
    expect(upload.length).toBeGreaterThan(0);
    expect(push.length).toBeGreaterThan(0);
    for (const b of upload.concat(push)) {
      expect({ label: String(b.textContent).trim(), disabled: b.disabled, why: 'no connected publisher exists' })
        .toEqual({ label: String(b.textContent).trim(), disabled: true, why: expect.any(String) });
    }
    expect(host.textContent).toMatch(/no connected publisher/i);
  });

  it('the panel makes no unverified claim that photos are distributed to feeds', async () => {
    const w = boot();
    w.renderManageSection('sales'); await flush();
    const panel = w.renderCardDistributePanel(w.manageFindListing('SL-0001'));
    expect(panel).not.toMatch(/Photos sync to all enabled feeds/i);
  });
});

describe('the fabricated literal does not survive in source or in the shipped artifact', () => {
  it('manage-listings.js contains no rlsUploaded boolean literal', () => {
    expect(MANAGE_SRC).not.toMatch(/rlsUploaded\s*:\s*true/);
  });

  it('the three action handlers contain no unconditional success toast', () => {
    expect(MANAGE_SRC).not.toContain("'Listing uploaded to REBNY RLS'");
    expect(MANAGE_SRC).not.toContain("'Updates pushed to: '");
    expect(MANAGE_SRC).not.toMatch(/manageShowToast\('Synced '/);
  });

  it('index-built.html is regenerated from these sources', () => {
    // index-built.html inlines manage-listings.js verbatim; the fabricated literal appeared there too.
    expect(BUILT).not.toMatch(/rlsUploaded\s*:\s*true/);
    // The RLS badge MARKUP is deliberately retained, guarded by `media.rlsUploaded === true`, so that a real
    // publisher can light it up once one exists. What must never come back is a source that makes the guard
    // true without a verified response. That the badge cannot render today is proved behaviourally above
    // ("the card photo banner shows no ... badge"), not by asserting the string is absent from the artifact.
    expect(BUILT).toContain('media.rlsUploaded === true');
  });
});
