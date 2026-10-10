/// <reference types="jest" />
/**
 * Whose listing it is, on the public surfaces: from the SOURCE fields (the CRM's SL-/RL- listing id, rls_eligible), never from agent_id / owner_client_id.
 *
 * Found 2026-10-09 by the second review Maya pasted (the "Brutal Contrary Review"), confirmed in the code: syncAgentHistory (lib/idx/sync.ts) stamps agent_id onto Cotality rows where a Mallan agent
 * was the BUYER side as well as the list side, so a column that says "who is associated with this row" was read as "this is Mallan's own listing" in four public places:
 *   1. classifyDbListing (lib/idx/db-to-public-dto.ts) decided the DTO's _source, its disclaimer and its attribution line: another firm's listing said "Exclusive listing by Mallan Real Estate Inc."
 *      and lost the REBNY data sentence (UCBA Art. III Sec. 2(C), NY DOS 19 NYCRR Sec. 175.25);
 *   2. computeDbEnvelopeSource (app/api/listings/route.ts) labelled the whole response from it;
 *   3. sort=exclusives (lib/search/public-listing-db.ts) filtered on `agent_id != null`;
 *   4. fetchExclusiveListings (the same route) returned every displayable RLS row of the table under the label "Exclusive listings by Mallan Real Estate Inc.".
 * The emails, the media authority, the search projection and exclusive=mallan already used the source fields (lib/listings/mallan-source-identity.ts); these four now do.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/sentry-report', () => ({ __esModule: true, reportApiError: jest.fn() }));

import { computeDbEnvelopeSource } from '@/app/api/listings/route';
import { classifyDbListing } from '@/lib/idx/db-to-public-dto';
import { buildPublicListingDbSearch, mallanAuthoredWhere } from '@/lib/search/public-listing-db';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** the file's code without its comments (// and block comments), so a comment may talk about agent_id */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const fnBody = (src: string, header: string) => {
  const at = src.indexOf(header);
  expect(at).toBeGreaterThan(-1);
  const next = src.indexOf('\nasync function ', at + header.length);
  const nextExport = src.indexOf('\nexport ', at + header.length);
  const end = [next, nextExport].filter((i) => i > -1).sort((a, b) => a - b)[0] ?? src.length;
  return src.slice(at, end);
};

const third = (extra: Record<string, unknown> = {}) => ({ listing_id: 'RLS20059088', rls_eligible: true, ...extra });
const mallan = (extra: Record<string, unknown> = {}) => ({ listing_id: 'SL-0004', rls_eligible: true, ...extra });

describe('computeDbEnvelopeSource labels a response by the listings in it', () => {
  it('no listing at all is db+exclusive (the label the short-circuits already use)', () => {
    expect(computeDbEnvelopeSource([])).toBe('db+exclusive');
  });

  it('third-party rows are db+idx even when the sync stamped an agent_id / owner_client_id on them', () => {
    expect(computeDbEnvelopeSource([third(), third({ agent_id: '42', owner_client_id: '7' })] as never)).toBe('db+idx');
  });

  it('Mallan-authored rows (an SL-/RL- id, or website-only) are db+exclusive with or without an agent_id', () => {
    expect(computeDbEnvelopeSource([mallan(), mallan({ listing_id: 'RL-0001', agent_id: '42' }), third({ listing_id: 'RLS9', rls_eligible: false })])).toBe('db+exclusive');
  });

  it('one of each is db+mixed, in either order', () => {
    expect(computeDbEnvelopeSource([mallan(), third()])).toBe('db+mixed');
    expect(computeDbEnvelopeSource([third(), mallan()])).toBe('db+mixed');
  });

  it('agrees with classifyDbListing row by row', () => {
    for (const row of [third(), mallan(), third({ rls_eligible: false }), third({ agent_id: '42' })]) {
      const thirdParty = classifyDbListing(row as never) === 'third-party-idx';
      expect(computeDbEnvelopeSource([row] as never)).toBe(thirdParty ? 'db+idx' : 'db+exclusive');
    }
  });
});

describe('the sort=exclusives query is the Mallan-authored predicate, not agent_id', () => {
  it('sort=exclusives carries mallanAuthoredWhere() and no agent_id filter', () => {
    const { where } = buildPublicListingDbSearch(new URLSearchParams('type=sale&sort=exclusives'));
    expect(where.agent_id).toBeUndefined();
    expect(where.AND).toEqual([mallanAuthoredWhere()]);
  });
});

describe('/api/listings', () => {
  const route = code('app/api/listings/route.ts');

  it('does not select agent_id or owner_client_id for the DTO, and does not hand them to it', () => {
    expect(route).not.toMatch(/\bagent_id\s*:\s*true/);
    expect(route).not.toMatch(/\bowner_client_id\s*:\s*true/);
    expect(route).not.toMatch(/\.agent_id\b/);
    expect(route).not.toMatch(/\.owner_client_id\b/);
  });

  it('fetchExclusiveListings ANDs the Mallan-authored predicate after every other filter has been set (the neighborhood branch assigns where.AND)', () => {
    const body = fnBody(route, 'async function fetchExclusiveListings');
    expect(body).toContain('where: { AND: [where, mallanAuthoredWhere()] }');
    expect(body.indexOf('mallanAuthoredWhere()')).toBeGreaterThan(body.lastIndexOf('where.AND ='));
    expect(body).toContain("rls_eligible: false");                       // the website-only branch of its display gate is still there
  });

  it('imports the predicate from the one module that owns it', () => {
    expect(route).toMatch(/mallanAuthoredWhere,?\s*\}\s*from '@\/lib\/search\/public-listing-db'/);
  });
});

describe('no public code decides "ours" from agent_id', () => {
  it.each(['lib/idx/db-to-public-dto.ts', 'lib/search/public-listing-db.ts', 'app/api/listings/route.ts', 'app/api/agents/[slug]/listings/route.ts', 'app/api/crm/listing-campaigns/route.ts'])(
    '%s does not read agent_id / owner_client_id as an ownership test', (file) => {
      const src = code(file);
      expect(src).not.toMatch(/\.agent_id\s*(!=|!==|==|===)\s*null/);
      expect(src).not.toMatch(/\.owner_client_id\s*(!=|!==|==|===)\s*null/);
      expect(src).not.toMatch(/\bagent_id\s*:\s*\{\s*not\s*:\s*null/);
      expect(src).not.toMatch(/\bowner_client_id\s*:\s*\{\s*not\s*:\s*null/);
    });

  it('the classifier reads the canonical helper', () => {
    expect(code('lib/idx/db-to-public-dto.ts')).toMatch(/isMallanLocalListing\(listing\)/);
    expect(code('lib/idx/db-to-public-dto.ts')).toContain("from '@/lib/listings/mallan-source-identity'");
  });
});

describe('sort=exclusives is short-circuited like exclusive=mallan: no Trestle fallback lists other brokers\' rows under the exclusives label', () => {
  // The DB query narrows sort=exclusives to the Mallan-authored predicate and the route's own comment says "DB-only, skip Trestle", but nothing skipped it: a request with no Mallan-authored match fell
  // through to the Trestle fetch and was labelled idx+exclusive (found by the code review of 2026-10-09).
  const route = code('app/api/listings/route.ts');

  it('the route reads sort=exclusives as an exclusives-only request', () => {
    expect(route).toMatch(/const isMallanExclusiveOnly = searchParams\.get\('exclusive'\) === 'mallan' \|\| sortParam === 'exclusives';/);
  });

  it('both the zero-row answer and the DB-error answer of an exclusives-only request are empty responses, not a Trestle fetch', () => {
    expect(route.match(/if \(isMallanExclusiveOnly\) \{/g)).toHaveLength(2);
  });
});
