/// <reference types="jest" />
/**
 * A listing the Cotality sync stored as "Canceled" (one L) is a terminal listing like any other (#449).
 *
 * Found 2026-10-08 (an adversarial audit, then read from the code): `listings.status` holds Cotality's StandardStatus VERBATIM for a synced row (lib/idx/trestle-mapper.ts
 * `status: raw.StandardStatus`; the live Cotality list spells it "Canceled"), and the CRM's own writers fold it to "Cancelled" (normalizeStandardStatus). Every exact-case
 * `status IN (...)` and `Set.has(status)` over the stored column named only "Cancelled", so for a synced cancelled listing the retention cron's T+30d media step, the T+180d archive,
 * the DOM-reset cron (UCBA Art. I Sec. 11), the archive predicate the monitor mirrors, and the storage monitor all skipped it, and the issue (#449) had been left open as "latent, blast radius 0"
 * because nothing had been cancelled yet.
 *
 * This holds every list that has to agree to ONE source (lib/compliance/terminal-status.ts), and runs the two crons and the DOM rule with a "Canceled" row.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeRequest } from './helpers';
import {
  CANCELLED_STATUS_SPELLINGS,
  DOM_RESET_STATUS_SPELLINGS,
  TERMINAL_STATUS_SPELLINGS,
  isCancelledStatus,
} from '@/lib/compliance/terminal-status';
import { TERMINAL_STATUSES } from '@/lib/idx/trestle-mapper';
import { ARCHIVE_TERMINAL_STATUSES } from '@/lib/retention/archive-terminals';
import { shouldResetDom, DOM_RESET_DAYS } from '@/lib/compliance/dom-tracker';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';
import { evaluateMallanSyndicationEligibility, type ListingForEligibility } from '@/lib/syndication/eligibility';

const root = (...p: string[]) => resolve(__dirname, '../..', ...p);
const read = (rel: string) => readFileSync(root(rel), 'utf8');
const sorted = (list: readonly string[]) => [...list].sort();
/** the quoted strings of the first `[...]` after `marker` */
const literalAfter = (src: string, marker: RegExp): string[] => {
  const m = marker.exec(src);
  if (!m) throw new Error(`no ${marker} in the source`);
  const open = src.indexOf('[', m.index);
  const close = src.indexOf(']', open);
  return [...src.slice(open + 1, close).matchAll(/["']([A-Za-z]+)["']/g)].map((x) => x[1]);
};

// ── the retention cron and DOM-reset cron run with a prisma that records every query ────────────────────────────────────────────────────────────────
type Where = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const queries: Array<{ where?: Where; take?: number }> = [];
let staleRows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
let domRows: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
const updateMany = jest.fn(async (_args?: unknown) => ({ count: 0 }));
const auditCreateMany = jest.fn(async (_args?: unknown) => ({}));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    mfaSession: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    auditEvent: { deleteMany: jest.fn(async () => ({ count: 0 })), createMany: (a: unknown) => auditCreateMany(a), create: jest.fn(async () => ({})) },
    listing: {
      findMany: jest.fn(async (args: { where?: Where; take?: number }) => {
        queries.push(args);
        // the T+24h step is the one that asks for rows still displayed; the DOM-reset cron asks for days_on_market > 0
        if (args?.where?.idx_display_yn === true) return staleRows;
        if (args?.where?.days_on_market) return domRows;
        return [];
      }),
      updateMany: (a: unknown) => updateMany(a),
      update: jest.fn(async () => ({})),
    },
    listingsArchive: { upsert: jest.fn(async () => ({})) },
    syncError: { create: jest.fn(async () => ({})) },
    lead: { updateMany: jest.fn(async () => ({ count: 0 })) },
    notification: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    geocodeCache: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (arg: unknown) => (Array.isArray(arg) ? [] : null)),
  },
}));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: jest.fn(async () => undefined) }));

import { GET as retentionGET } from '@/app/api/cron/data-retention/route';
import { GET as domResetGET } from '@/app/api/cron/dom-reset/route';

const cron = (path: string) => makeRequest({ method: 'GET', url: `http://localhost/api/cron/${path}`, headers: { authorization: 'Bearer test-secret' } });

beforeEach(() => {
  jest.clearAllMocks();
  queries.length = 0;
  staleRows = [];
  domRows = [];
  process.env.CRON_SECRET = 'test-secret';
  process.env.ARCHIVE_ENABLED = 'true';
  delete process.env.ARCHIVE_T180_BACKLOG_ENABLED;
  delete process.env.ARCHIVE_BACKLOG_DRAIN_ENABLED;
});
afterAll(() => { delete process.env.ARCHIVE_ENABLED; });

describe('the one list of stored terminal spellings', () => {
  it('is what Cotality sends: its StandardStatus list spells the cancelled status with one L and has no double-L spelling', () => {
    const live = JSON.parse(readFileSync(root('data/cotality-enums.live.json'), 'utf8')).enums.StandardStatus as string[];
    expect(live).toContain('Canceled');
    expect(live).not.toContain('Cancelled');
    // every status of the live list that ends a listing's life is stored under a spelling the list has
    for (const status of ['Canceled', 'Closed', 'Expired', 'Withdrawn']) expect(TERMINAL_STATUS_SPELLINGS).toContain(status);
  });

  it('is the mapper\'s canonical terminal set plus Cotality\'s single-L spelling, and nothing else', () => {
    expect(sorted(TERMINAL_STATUS_SPELLINGS)).toEqual(sorted([...TERMINAL_STATUSES, 'Canceled']));
    expect(CANCELLED_STATUS_SPELLINGS).toEqual(['Cancelled', 'Canceled']);
    expect(DOM_RESET_STATUS_SPELLINGS).toEqual(['Withdrawn', 'Cancelled', 'Canceled']);
    expect(new Set(TERMINAL_STATUS_SPELLINGS).size).toBe(TERMINAL_STATUS_SPELLINGS.length);
  });

  it.each([['Cancelled', true], ['Canceled', true], ['cancelled', false], ['CANCELED', false], [' Canceled', false], ['Withdrawn', false], ['', false], [null, false], [undefined, false], [5, false]] as const)(
    'isCancelledStatus(%j) is %s (the stored column is exact-case)', (status, expected) => { expect(isCancelledStatus(status)).toBe(expected); });

  it('every list that names the terminal statuses names the same ones, in the same order: the cron route, the archive core, the monitor\'s predicate, the eligibility set', () => {
    const expected = [...TERMINAL_STATUS_SPELLINGS];
    expect(literalAfter(read('app/api/cron/data-retention/route.ts'), /const\s+TERMINAL_STATUSES\s*=/)).toEqual(expected);
    expect([...ARCHIVE_TERMINAL_STATUSES]).toEqual(expected);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    expect(require('../../scripts/archive-backlog-predicate').ARCHIVE_TERMINAL_STATUSES).toEqual(expected);
    expect(literalAfter(read('lib/syndication/eligibility.ts'), /const\s+TERMINAL_STATUSES:\s*ReadonlySet<string>\s*=/)).toEqual(expected);
  });

  it('no list of the terminal statuses is left inline in the monitors and operator files without the single-L spelling', () => {
    const ops = read('scripts/ops-health.js');
    expect(ops).toMatch(/const \{ buildArchiveBacklogWhere, ARCHIVE_TERMINAL_STATUSES \} = require\('\.\/archive-backlog-predicate'\)/);
    expect(ops.match(/status: \{ in: ARCHIVE_TERMINAL_STATUSES \}/g)).toHaveLength(3);
    expect(ops).not.toMatch(/'Expired', 'Cancelled'\]/);
    for (const file of ['scripts/phase1-run.js', 'scripts/phase1-verify.sql', 'scripts/phase1-ROLLBACK.md']) {
      expect(read(file)).toContain(`status IN ('Closed','Sold','Leased','Rented','Withdrawn','Expired','Cancelled','Canceled')`);
    }
    // the storage monitor takes the mapper's set and adds the other spelling of Cancelled
    const storage = read('scripts/storage-health-monitor.ts');
    expect(storage).toMatch(/import \{ TERMINAL_STATUSES \} from '@\/lib\/idx\/trestle-mapper'/);
    expect(storage).toMatch(/const terminalList = \[\.\.\.TERMINAL_STATUSES, \.\.\.CANCELLED_STATUS_SPELLINGS\.filter\(\(s\) => !TERMINAL_STATUSES\.has\(s\)\)\];/);
  });
});

describe('data-retention cron: a synced cancelled listing is handled like any other terminal one', () => {
  const wheres = () => queries.map((q) => q.where as Where);
  const statusIn = (where: Where) => where.status.in as string[];

  it('T+24h (REBNY RLS 2.05, unconditional): asks for both spellings, and takes a "Canceled" row that is still displayed off IDX', async () => {
    staleRows = [{ id: 9n, listing_id: 'RLS9', status: 'Canceled', status_changed_at: new Date('2026-09-01T00:00:00Z'), address: {} }];
    await retentionGET(cron('data-retention'));
    const t24 = wheres().find((w) => w.idx_display_yn === true)!;
    expect(statusIn(t24)).toEqual([...TERMINAL_STATUS_SPELLINGS]);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: [9n] } }, data: { idx_display_yn: false } });
    expect(auditCreateMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ action: 'idx_display_yn_disabled', entity_id: '9', changes: expect.objectContaining({ status: 'Canceled' }) })] });
  });

  it('T+24h runs with the archive family OFF, and still asks for both spellings (it is display compliance, not archiving)', async () => {
    process.env.ARCHIVE_ENABLED = 'false';
    await retentionGET(cron('data-retention'));
    const t24 = wheres().find((w) => w.idx_display_yn === true)!;
    expect(statusIn(t24)).toEqual([...TERMINAL_STATUS_SPELLINGS]);
    expect(queries.filter((q) => q.take)).toEqual([]);                        // no T+30d, no T+180d with the family off
  });

  it('T+30d media step and T+180d archive (archive family ON): both ask for both spellings, with the clock the flag selects', async () => {
    await retentionGET(cron('data-retention'));
    const t30 = queries.find((q) => q.take === 1000)!.where!;
    const t180 = queries.find((q) => q.take === 500)!.where!;
    expect(statusIn(t30)).toEqual([...TERMINAL_STATUS_SPELLINGS]);
    expect(statusIn(t180)).toEqual([...TERMINAL_STATUS_SPELLINGS]);
    expect(t180.sync_status).toEqual({ not: 'archived' });
    expect(t180.status_changed_at).toBeDefined();
    process.env.ARCHIVE_T180_BACKLOG_ENABLED = 'true';
    queries.length = 0;
    await retentionGET(cron('data-retention'));
    expect(statusIn(queries.find((q) => q.take === 500)!.where!)).toEqual([...TERMINAL_STATUS_SPELLINGS]);
  });
});

describe('DOM-reset cron and the DOM rule (UCBA 2026 Art. I Sec. 11): 30 days in Withdrawn or Cancelled, either spelling', () => {
  it('the cron asks for Withdrawn and both spellings of Cancelled, and resets a "Canceled" listing with the audit event naming its status', async () => {
    domRows = [{ id: 5n, listing_id: 'RLS5', days_on_market: 61, status: 'Canceled' }];
    const res = await domResetGET(cron('dom-reset'));
    const where = queries.find((q) => q.where?.days_on_market)!.where!;
    expect(where.status).toEqual({ in: ['Withdrawn', 'Cancelled', 'Canceled'] });
    expect(where.status_changed_at.lt).toBeInstanceOf(Date);
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: [5n] } }, data: { days_on_market: 0, first_active_date: null } });
    expect(auditCreateMany).toHaveBeenCalledWith({ data: [{ action: 'dom_reset', entity_type: 'listing', entity_id: '5', user_type: 'system', user_id: null, changes: { previous_dom: 61, reason: `${DOM_RESET_DAYS}+ days in Canceled` } }] });
    expect(await res.json()).toEqual({ reset: 1, listings: ['RLS5'] });
  });

  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const listing = (status: string, days: number) => ({ status, status_changed_at: daysAgo(days), first_active_date: daysAgo(200), days_on_market: 40 });

  it.each(['Withdrawn', 'Cancelled', 'Canceled'])('shouldResetDom: %s for %i days or more resets, fewer does not', (status) => {
    expect(shouldResetDom(listing(status, DOM_RESET_DAYS + 1))).toBe(true);
    expect(shouldResetDom(listing(status, DOM_RESET_DAYS))).toBe(true);
    expect(shouldResetDom(listing(status, DOM_RESET_DAYS - 2))).toBe(false);
  });

  it.each(['Closed', 'Expired', 'Active', 'canceled'])('shouldResetDom: %s never resets', (status) => {
    expect(shouldResetDom(listing(status, 90))).toBe(false);
  });

  it('shouldResetDom: a cancelled listing with no status date does not reset', () => {
    expect(shouldResetDom({ ...listing('Canceled', 90), status_changed_at: null })).toBe(false);
  });
});

describe('the RLS gate tells an agent how long a listing has been cancelled, whichever spelling it was stored under', () => {
  it.each(['Cancelled', 'Canceled', 'Withdrawn'])('previous status %s: the DOM reset warning (ST-002) is given', (previousStatus) => {
    const result = assertRlsCompliantPayload({}, { listingType: 'sale', currentStatus: 'Active', previousStatus, statusChangedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), rlsEligible: false });
    const warning = result.warnings.find((w) => w.code === 'ST-002');
    expect(warning?.message).toContain(`45 days in ${previousStatus}`);
    expect(warning?.message).toContain('DOM will reset');
  });

  it('a status that is not an off-market status gets no such warning', () => {
    const result = assertRlsCompliantPayload({}, { listingType: 'sale', currentStatus: 'Active', previousStatus: 'Pending', statusChangedAt: new Date(), rlsEligible: false });
    expect(result.warnings.find((w) => w.code === 'ST-002')).toBeUndefined();
  });
});

describe('syndication eligibility names a "Canceled" listing as terminal', () => {
  const row = (status: string): ListingForEligibility => ({
    source: 'trestle', status, list_office_name: '', idx_display_yn: true, internet_entire_listing_display_yn: true, owner_opt_out: false, participant_only: false,
    agent_info: { ListOfficeMlsId: '39361', ListOfficeName: 'Mallan Real Estate Inc.', ListAgentMlsId: 'AG-1', ListAgentFullName: 'Maya Allan' },
    compliance: {
      syndication: { approval_status: 'approved', approved_at: '2026-05-18T10:00:00Z', approved_by: '1' },
      seller_advertising_authorization: { signed_at: '2026-05-18T09:00:00Z', scope: 'mallan_owned_only' },
      media_rights: { confirmed_at: '2026-05-18T09:00:00Z', source: 'owner_release' },
    },
  });
  const config = { officeMlsIds: new Set(['39361']), agentMlsIds: new Set(['AG-1']) };

  it.each(['Cancelled', 'Canceled'])('%s: not eligible, as a terminal status', (status) => {
    const r = evaluateMallanSyndicationEligibility(row(status), config);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain(`status_terminal (${status})`);
    expect(r.reasons.some((x) => x.startsWith('status_not_distributable'))).toBe(false);
  });

  it('an Active row of the same shape is eligible (the fixture is sound)', () => {
    expect(evaluateMallanSyndicationEligibility(row('Active'), config).eligible).toBe(true);
  });
});
