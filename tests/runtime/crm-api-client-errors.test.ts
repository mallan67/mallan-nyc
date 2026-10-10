/// <reference types="jest" />
/**
 * The CRM API client (public/crm/js/core/api-client.js) hands a caller what the server said.
 *
 * _fetch chained `.then(reject(new Error(data.error))).catch(reject(new Error('Request failed: ' + status)))`: the catch also caught the rejection of the then, so the server's words NEVER reached a
 * caller. Every page that shows an error showed "Request failed: 422", whatever the server answered ("Listing failed compliance validation", "Monthly price must be above 0", ...).
 * The error now carries the server's words, the HTTP status and the answer's body: a caller can tell a refusal (4xx: the server did not do what was asked) from a failure after which nothing is known
 * (5xx: the listing create route answers 500 when the listing was committed and the answer could not be built; a request that got no answer at all has no status).
 * These tests run the real client file with a fetch that answers as told.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
/* eslint-disable @typescript-eslint/no-explicit-any */

const SOURCE = readFileSync(resolve(__dirname, '../../public/crm/js/core/api-client.js'), 'utf8');

// What the server answers: a status and a JSON body, or a body that is not JSON (text)
type Answer = { status: number; body?: unknown; text?: string };

function client(answer: Answer | (() => Promise<never>)) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://crm.example/' });
  const w = dom.window as any;
  const events: string[] = [];
  const requests: { url: string; method: string }[] = [];
  w.addEventListener('mallan:auth:unauthorized', () => events.push('unauthorized'));
  w.console.warn = () => undefined;
  w.fetch = typeof answer === 'function'
    ? answer
    : async (url: string, init: { method: string }) => {
        requests.push({ url, method: init.method });
        return {
          ok: answer.status >= 200 && answer.status < 300,
          status: answer.status,
          json: async () => { if (answer.text !== undefined) throw new SyntaxError('Unexpected token < in JSON'); return answer.body; },
        };
      };
  w.eval(SOURCE);
  return { api: w.MallanAPI, events, requests, close: () => dom.window.close() };
}

/** The error a call rejects with. */
async function failure(call: (api: any) => Promise<unknown>, answer: Answer | (() => Promise<never>)): Promise<any> {
  const c = client(answer);
  let failed = false;
  let error: any;
  try {
    await call(c.api);
  } catch (err) {
    failed = true;
    error = err;
  } finally { c.close(); }
  if (!failed) throw new Error('the call did not fail');
  return Object.assign(error, { _events: c.events });
}
const update = (api: any) => api.listings.update('9', { ListPrice: 1 });

describe('MallanAPI: what a failed request tells its caller', () => {
  it('says the server\'s own words, and carries the status and the answer\'s body', async () => {
    const body = { error: 'Listing failed compliance validation', validation: { errors: ['PublicRemarks holds wording the server refuses'] } };
    const err = await failure(update, { status: 422, body });
    expect(err.name).toBe('Error');                                                        // (an Error of the page's window, not of this process)
    expect(err.message).toBe('Listing failed compliance validation');
    expect(err.status).toBe(422);
    expect(err.details).toEqual(body);
  });

  it.each([
    ['create', (api: any) => api.listings.create({}), 'POST', '/api/crm/listings'],
    ['update', update, 'PATCH', '/api/crm/listings/9'],
    ['updateStatus', (api: any) => api.listings.updateStatus('9', 'Active'), 'PATCH', '/api/crm/listings/9/status'],
    ['get', (api: any) => api.listings.get('9'), 'GET', '/api/crm/listings/9'],
  ] as const)('does so for %s (%s %s)', async (_name, call, method, url) => {
    const c = client({ status: 409, body: { error: 'That listing is locked' } });
    try {
      await expect(call(c.api)).rejects.toMatchObject({ message: 'That listing is locked', status: 409 });
      expect(c.requests).toEqual([{ url, method }]);
    } finally { c.close(); }
  });

  it.each([
    ['says the status when the server\'s answer holds no words', { status: 500, body: {} }, 'Request failed: 500', {}],
    ['says the status when the answer is not JSON at all (a gateway page)', { status: 502, text: '<html>Bad gateway</html>' }, 'Request failed: 502', null],
    ['says the status when the error is not text', { status: 400, body: { error: { code: 7 } } }, 'Request failed: 400', { error: { code: 7 } }],
    ['says the status when the error is empty', { status: 409, body: { error: '' } }, 'Request failed: 409', { error: '' }],
    ['says the status when the answer is JSON null', { status: 503, body: null }, 'Request failed: 503', null],
  ] as const)('%s', async (_name, answer, message, details) => {
    const err = await failure(update, answer as Answer);
    expect(err.message).toBe(message);
    expect(err.status).toBe(answer.status);
    expect(err.details).toEqual(details);
  });

  it('keeps the words of a refused session and of a refused access, with their status; a refused session tells the page', async () => {
    const unauthorized = await failure(update, { status: 401, body: { error: 'Session expired' } });
    expect(unauthorized.message).toBe('Unauthorized');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized._events).toEqual(['unauthorized']);
    expect(unauthorized.details).toBeUndefined();
    const denied = await failure(update, { status: 403, body: { error: 'Not your listing' } });
    expect(denied.message).toBe('Access denied');
    expect(denied.status).toBe(403);
    expect(denied._events).toEqual([]);
    expect(denied.details).toBeUndefined();
  });

  it('passes a failure that has no answer on as it is, with no status (the network is down: nothing is known)', async () => {
    const down = new TypeError('Failed to fetch');
    const err = await failure(update, () => Promise.reject(down));
    expect(err).toBe(down);
    expect(err.status).toBeUndefined();
  });

  it('returns the body of an answer that is fine', async () => {
    const c = client({ status: 200, body: { id: '9', status: 'Draft' } });
    try {
      await expect(update(c.api)).resolves.toEqual({ id: '9', status: 'Draft' });
    } finally { c.close(); }
  });
});
