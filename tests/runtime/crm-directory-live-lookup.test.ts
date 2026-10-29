/// <reference types="jest" />
/**
 * CRM live Member / Office directory (agent pickers + Agent Search).
 *
 * Live evidence (2026-10-06, api.cotality.com/trestle/odata through Mallan's own credential):
 *   Member `contains(MemberFullName,..)`, `startswith`, `OfficeMlsId eq`, `contains(OfficeName,..)`, `MemberStatus eq 'Active'` and
 *   `$orderby MemberFullName` are all accepted; Member `OfficeMlsId eq '7041'` -> 3 Active agents; `contains(OfficeName,'Compass')` ->
 *   1,867 Active. Office: Compass is 1 record, Corcoran Group is 13 records rolling up to main office 334, so a firm is NOT one record.
 * The directory is read-only, behind agent/broker auth, and selects identity fields only.
 */

jest.mock('@/lib/idx/auth', () => ({
  getAccessToken: jest.fn(async () => 'token-1'),
  invalidateToken: jest.fn(),
  hasCredentials: jest.fn(() => true),
}));
jest.mock('@/lib/auth', () => ({
  requireAgentOrBroker: jest.fn(),
  isAuthError: (value: unknown) => value instanceof Response,
}));

import { NextRequest } from 'next/server';
import { requireAgentOrBroker } from '@/lib/auth';
import { invalidateToken, hasCredentials } from '@/lib/idx/auth';
import {
  DIRECTORY_MEMBER_SELECT,
  DIRECTORY_OFFICE_SELECT,
  DirectoryUpstreamError,
  buildMemberFilter,
  buildOfficeFilter,
  clearDirectoryCache,
  parseMemberQuery,
  parseOfficeQuery,
  searchMembers,
  searchOffices,
} from '@/lib/idx/directory';
import { GET as getMembers } from '@/app/api/crm/directory/members/route';
import { GET as getOffices } from '@/app/api/crm/directory/offices/route';

const q = (obj: Record<string, string>) => new URLSearchParams(obj);

function unwrap<T>(r: { ok: true; query: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`expected a valid query, got: ${r.error}`);
  return r.query;
}

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const memberRow = {
  MemberKey: '25272030', MemberMlsId: '39361', MemberFullName: 'Maya Allan', MemberStatus: 'Active',
  OfficeKey: '5671398', OfficeMlsId: '7041', OfficeName: 'MAllan Real Estate Inc',
};

let fetchMock: jest.Mock;
beforeEach(() => {
  clearDirectoryCache();
  fetchMock = jest.fn();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  (invalidateToken as jest.Mock).mockClear();
  (hasCredentials as jest.Mock).mockReturnValue(true);
  (requireAgentOrBroker as jest.Mock).mockReset();
  process.env.IDX_ENABLED = 'true';
  process.env.TRESTLE_API_URL = 'https://api.cotality.com/trestle';
});

describe('query parsing', () => {
  it('needs at least one criterion', () => {
    expect(parseMemberQuery(q({}))).toEqual({ ok: false, error: 'Provide name, firm, mlsId or officeMlsId' });
    expect(parseOfficeQuery(q({}))).toEqual({ ok: false, error: 'Provide name or mlsId' });
  });

  it('rejects one-character text and non-digit MLS IDs instead of passing them through', () => {
    expect(parseMemberQuery(q({ name: 'a' })).ok).toBe(false);
    expect(parseMemberQuery(q({ firm: 'x' })).ok).toBe(false);
    expect(parseMemberQuery(q({ mlsId: "39361' or 1 eq 1" })).ok).toBe(false);
    expect(parseMemberQuery(q({ officeMlsId: 'abc' })).ok).toBe(false);
    expect(parseMemberQuery(q({ mlsId: '1,2,3,4,5,6' })).ok).toBe(false);
    expect(parseOfficeQuery(q({ mlsId: '12ab' })).ok).toBe(false);
  });

  it('accepts name, firm, ids, includeInactive and clamps the limit', () => {
    expect(unwrap(parseMemberQuery(q({ name: 'maya allan', firm: 'compass', mlsId: '39361,42201', officeMlsId: '7041', includeInactive: '1', limit: '999' })))).toEqual({
      nameWords: ['maya', 'allan'], firmWords: ['compass'], mlsIds: ['39361', '42201'], officeMlsIds: ['7041'], includeInactive: true, limit: 25,
    });
    const defaults = unwrap(parseMemberQuery(q({ name: 'maya' })));
    expect(defaults.limit).toBe(15);
    expect(defaults.includeInactive).toBe(false);
    expect(unwrap(parseMemberQuery(q({ name: 'maya', limit: '0' }))).limit).toBe(15);
    expect(unwrap(parseMemberQuery(q({ name: 'maya', limit: '3' }))).limit).toBe(3);
  });

  it('caps words at four and text at sixty characters', () => {
    expect(unwrap(parseMemberQuery(q({ name: 'a1 b2 c3 d4 e5 f6' }))).nameWords).toEqual(['a1', 'b2', 'c3', 'd4']);
    expect(unwrap(parseMemberQuery(q({ name: 'x'.repeat(200) }))).nameWords[0].length).toBe(60);
  });
});

describe('filters are built only from live Member / Office fields', () => {
  it('Member: active only by default; every word must appear; ids are exact', () => {
    expect(buildMemberFilter(unwrap(parseMemberQuery(q({ name: 'claudia milkowski', firm: 'mallan', officeMlsId: '7041' }))))).toBe(
      `MemberStatus eq 'Active' and OfficeMlsId eq '7041' and contains(MemberFullName,'claudia') and contains(MemberFullName,'milkowski') and contains(OfficeName,'mallan')`,
    );
    expect(buildMemberFilter(unwrap(parseMemberQuery(q({ mlsId: '39361,42201', includeInactive: 'true' }))))).toBe(
      `(MemberMlsId eq '39361' or MemberMlsId eq '42201')`,
    );
  });

  it('Office: active only by default', () => {
    expect(buildOfficeFilter(unwrap(parseOfficeQuery(q({ name: 'corcoran group' }))))).toBe(
      `OfficeStatus eq 'Active' and contains(OfficeName,'corcoran') and contains(OfficeName,'group')`,
    );
    expect(buildOfficeFilter(unwrap(parseOfficeQuery(q({ mlsId: '7041', includeInactive: '1' }))))).toBe(`OfficeMlsId eq '7041'`);
  });

  it("escapes quotes: O'Brien cannot break out of the literal", () => {
    expect(buildMemberFilter(unwrap(parseMemberQuery(q({ name: "O'Brien" }))))).toContain(`contains(MemberFullName,'O''Brien')`);
  });

  it('selects identity fields only: no email, phone, fax, address, license or URL', () => {
    const all = [...DIRECTORY_MEMBER_SELECT, ...DIRECTORY_OFFICE_SELECT];
    expect(all.filter((f) => /Email|Phone|Fax|Address|License|URL|Pager|VoiceMail|NationalAssociationId/i.test(f))).toEqual([]);
    expect([...DIRECTORY_MEMBER_SELECT]).toEqual(['MemberKey', 'MemberMlsId', 'MemberFullName', 'MemberStatus', 'OfficeKey', 'OfficeMlsId', 'OfficeName']);
    expect([...DIRECTORY_OFFICE_SELECT]).toEqual(['OfficeKey', 'OfficeMlsId', 'OfficeName', 'OfficeStatus', 'MainOfficeKey', 'MainOfficeMlsId']);
  });
});

describe('live lookups', () => {
  it('GETs Cotality Member with $filter/$select/$orderby/$top/$count and maps identity fields only', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ '@odata.count': 1, value: [{ ...memberRow, MemberEmail: 'must-not-leak@example.com' }, { MemberFullName: 'No Id' }] }),
    );
    const result = await searchMembers(unwrap(parseMemberQuery(q({ officeMlsId: '7041', limit: '5' }))));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.cotality\.com\/trestle\/odata\/Member\?/);
    const params = new URL(String(url)).searchParams;
    expect(params.get('$filter')).toBe(`MemberStatus eq 'Active' and OfficeMlsId eq '7041'`);
    expect(params.get('$select')).toBe(DIRECTORY_MEMBER_SELECT.join(','));
    expect(params.get('$orderby')).toBe('MemberFullName asc');
    expect(params.get('$top')).toBe('5');
    expect(params.get('$count')).toBe('true');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(result.total).toBe(1);
    expect(result.rows).toEqual([
      { key: '25272030', mlsId: '39361', fullName: 'Maya Allan', status: 'Active', officeKey: '5671398', officeMlsId: '7041', officeName: 'MAllan Real Estate Inc' },
    ]);
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  it('GETs Cotality Office and returns the main-office link without inferring a firm', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({
        '@odata.count': 2,
        value: [
          { OfficeKey: '5658936', OfficeMlsId: '334', OfficeName: 'Corcoran Group', OfficeStatus: 'Active', MainOfficeKey: '5658936', MainOfficeMlsId: '334' },
          { OfficeKey: '5700001', OfficeMlsId: '40076', OfficeName: 'Corcoran Group', OfficeStatus: 'Active', MainOfficeKey: '5658936', MainOfficeMlsId: '334' },
        ],
      }),
    );
    const result = await searchOffices(unwrap(parseOfficeQuery(q({ name: 'corcoran' }))));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/odata\/Office\?/);
    expect(result.rows.map((o) => [o.mlsId, o.mainOfficeMlsId])).toEqual([['334', '334'], ['40076', '334']]);
    expect(Object.keys(result.rows[0]).sort()).toEqual(['key', 'mainOfficeKey', 'mainOfficeMlsId', 'mlsId', 'name', 'status']);
  });

  it('refreshes the token once on 401 and retries', async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({}, 401)).mockImplementationOnce(async () => jsonResponse({ value: [memberRow] }));
    const result = await searchMembers(unwrap(parseMemberQuery(q({ mlsId: '39361' }))));
    expect(invalidateToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBeNull();
  });

  it('surfaces upstream failures with status and Retry-After; never swallows them', async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({}, 429, { 'retry-after': '7' }));
    await expect(searchMembers(unwrap(parseMemberQuery(q({ mlsId: '1' }))))).rejects.toMatchObject({ name: 'DirectoryUpstreamError', status: 429, retryAfterSeconds: 7 });
    fetchMock.mockImplementationOnce(async () => jsonResponse({}, 500));
    await expect(searchOffices(unwrap(parseOfficeQuery(q({ mlsId: '1' }))))).rejects.toBeInstanceOf(DirectoryUpstreamError);
  });

  it('caches identical lookups so typeahead does not re-hit Cotality', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ value: [memberRow] }));
    const query = unwrap(parseMemberQuery(q({ name: 'maya' })));
    await searchMembers(query);
    await searchMembers(query);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await searchMembers(unwrap(parseMemberQuery(q({ name: 'maya', includeInactive: '1' }))));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('routes: agent/broker only, read-only, identity fields only', () => {
  const asAgent = () => (requireAgentOrBroker as jest.Mock).mockResolvedValue({ user: { id: 'a1', role: 'agent' } });
  const members = (qs: string) => getMembers(new NextRequest(`http://localhost/api/crm/directory/members${qs}`));
  const offices = (qs: string) => getOffices(new NextRequest(`http://localhost/api/crm/directory/offices${qs}`));

  it('returns the auth error and never calls Cotality when not signed in', async () => {
    (requireAgentOrBroker as jest.Mock).mockImplementation(async () => new Response('{"error":"Unauthorized"}', { status: 401 }));
    expect((await members('?name=maya')).status).toBe(401);
    expect((await offices('?name=compass')).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('503 when Cotality is not enabled or credentials are missing', async () => {
    asAgent();
    (hasCredentials as jest.Mock).mockReturnValue(false);
    const res = await members('?name=maya');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: 'IDX_UNAVAILABLE' });
    process.env.IDX_ENABLED = 'false';
    (hasCredentials as jest.Mock).mockReturnValue(true);
    expect((await offices('?name=compass')).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 on missing criteria or malformed ids', async () => {
    asAgent();
    expect((await members('')).status).toBe(400);
    expect((await members("?mlsId=1'%20or%201%20eq%201")).status).toBe(400);
    expect((await offices('?name=c')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('200 with live members, no-store caching and the source tag', async () => {
    asAgent();
    fetchMock.mockImplementationOnce(async () => jsonResponse({ '@odata.count': 1, value: [memberRow] }));
    const res = await members('?name=maya&firm=mallan');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.json();
    expect(body.source).toBe('cotality-live');
    expect(body.total).toBe(1);
    expect(body.members[0]).toMatchObject({ mlsId: '39361', fullName: 'Maya Allan', officeMlsId: '7041' });
  });

  it('200 with live offices', async () => {
    asAgent();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ '@odata.count': 1, value: [{ OfficeKey: '5658932', OfficeMlsId: '7222', OfficeName: 'Compass', OfficeStatus: 'Active', MainOfficeKey: '5658932', MainOfficeMlsId: '7222' }] }),
    );
    const res = await offices('?name=compass');
    expect(res.status).toBe(200);
    expect((await res.json()).offices[0]).toMatchObject({ mlsId: '7222', name: 'Compass' });
  });

  describe.each([
    ['members', members, '?name=maya'],
    ['offices', offices, '?name=compass'],
  ] as const)('%s: upstream failures', (_label, call, qs) => {
    it('passes a 429 and its Retry-After through', async () => {
      asAgent();
      fetchMock.mockImplementationOnce(async () => jsonResponse({}, 429, { 'retry-after': '9' }));
      const limited = await call(qs);
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBe('9');
      expect(await limited.json()).toMatchObject({ code: 'DIRECTORY_RATE_LIMITED' });
    });

    it('turns any other upstream failure into a generic 502 with no provider detail', async () => {
      asAgent();
      const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      fetchMock.mockImplementationOnce(async () => jsonResponse({ secret: 'provider-detail' }, 503));
      const failed = await call(qs);
      logged.mockRestore();
      expect(failed.status).toBe(502);
      const text = JSON.stringify(await failed.json());
      expect(text).toContain('DIRECTORY_UPSTREAM');
      expect(text).not.toContain('provider-detail');
      expect(text).not.toContain('503');
    });

    it('is no-store on every outcome', async () => {
      asAgent();
      fetchMock.mockImplementationOnce(async () => jsonResponse({ value: [] }));
      expect((await call(qs)).headers.get('cache-control')).toBe('private, no-store');
      expect((await call('')).headers.get('cache-control')).toBe('private, no-store');
    });
  });
});
