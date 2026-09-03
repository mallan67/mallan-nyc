import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  UnsupportedSearchCriterionError,
  buildCrmIdxODataFilter,
} from '@/lib/search/crm-idx-filter';

const REPO = join(__dirname, '..', '..');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINANCING CHAIN IS EXECUTED HERE, NOT SCANNED.
 *
 * The transport invariant census reads source and compares name sets. It found
 * the missing hop once widened — but a census cannot prove a request actually
 * carries a parameter, and "does it reach the server?" is the whole question.
 *
 * Financing failed at a DIFFERENT hop each time it was inspected: the serializer
 * produced it and `buildIdxSearchParams` never read it; then that was fixed and
 * `api-client` never forwarded it; then that was fixed and the server had no
 * refusal. Each fix looked complete in isolation. So this runs the real browser
 * serializer and the real request builder with a stubbed `fetch`, reads the URL
 * that would have gone out, and then hands those same parameters to the real
 * server-side filter builder.
 *
 * WHY A REFUSAL IS THE CORRECT ANSWER TODAY. The value is real and densely
 * populated — 6,803 of 8,010 Active records — but it lives inside
 * `CustomProperty.CustomFields`, an Edm.String that `$filter` cannot reach into.
 * Execution must run Mallan-side over the COMPLETE candidate universe before
 * count and pagination, which is Section 6. Until then, accepting the parameter
 * and returning HTTP 200 would hand the broker a WIDER result set than they
 * asked for with nothing saying so. Forwarding is what makes the refusal
 * reachable instead of the filter silently disappearing.
 */

/** Mount the real browser serializer and request builder with a captured fetch. */
function browser() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { JSDOM, VirtualConsole } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://mallan.test/crm/',
    virtualConsole: new VirtualConsole(),
  });
  const win = dom.window as any;

  const requests: string[] = [];
  win.fetch = (url: string) => {
    requests.push(String(url));
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ listings: [], total: 0 }),
    });
  };
  win.showToast = () => {};
  win.LOGGED_IN_AGENT = { id: 1 };

  for (const rel of [
    'public/crm/js/core/api-client.js',
    'public/crm/js/search/search-engine.js',
  ]) {
    const script = win.document.createElement('script');
    script.textContent = readFileSync(join(REPO, rel), 'utf8');
    win.document.body.appendChild(script);
  }
  return { win, requests };
}

/** Run criteria through the REAL serializer and the REAL request builder. */
async function requestFor(criteria: Record<string, unknown>) {
  const { win, requests } = browser();
  if (typeof win.buildIdxSearchParams !== 'function') {
    throw new Error('buildIdxSearchParams did not load — the harness proves nothing');
  }
  const params = win.buildIdxSearchParams({ searchTab: 'sale', ...criteria });
  await win.MallanAPI.idx.search(params);
  // search-engine.js fetches its neighbourhood alias map on load, so the first
  // captured request is not the search. Select the one under test rather than
  // whichever happened to fire first.
  const url = requests.find((u) => u.includes('/api/idx/search')) ?? '';
  return { params, url };
}

describe('financing reaches the request', () => {
  it('issues a request at all — guard the guard', async () => {
    // A harness that silently made no request would pass every "not present"
    // assertion below without exercising anything.
    const { url } = await requestFor({ priceMin: 500000 });
    expect(url).toContain('/api/idx/search');
    expect(url).toContain('minPrice=500000');
  });

  it('carries a MIN-only financing bound', async () => {
    const { params, url } = await requestFor({ financingMin: 80 });
    expect(params.financingMin).toBe(80);
    expect(url).toContain('financingMin=80');
  });

  it('carries a MAX-only financing bound', async () => {
    // The bound that used to vanish: the canonical serializer emitted it and
    // nothing downstream read it, so the search silently ran without it.
    const { params, url } = await requestFor({ financingMax: 90 });
    expect(params.financingMax).toBe(90);
    expect(url).toContain('financingMax=90');
  });

  it('carries BOTH bounds together', async () => {
    const { url } = await requestFor({ financingMin: 75, financingMax: 90 });
    expect(url).toContain('financingMin=75');
    expect(url).toContain('financingMax=90');
  });

  it('adds NEITHER when the broker supplied neither', async () => {
    const { url } = await requestFor({ priceMin: 500000 });
    expect(url).not.toContain('financingMin');
    expect(url).not.toContain('financingMax');
  });

  it('does not drop a legitimate ZERO bound as though it were absent', async () => {
    // Truthiness here would treat 0 as "not supplied". 0 is a real bound, and
    // the server is entitled to refuse it by name like any other value.
    const { url } = await requestFor({ financingMin: 0 });
    expect(url).toContain('financingMin=0');
  });
});

describe('the server refuses what the request carries', () => {
  const serverSees = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

  it('refuses a MIN-only request end to end', async () => {
    const { url } = await requestFor({ financingMin: 80 });
    expect(() => buildCrmIdxODataFilter(serverSees(url))).toThrow(
      UnsupportedSearchCriterionError,
    );
  });

  it('refuses a MAX-only request end to end', async () => {
    const { url } = await requestFor({ financingMax: 90 });
    expect(() => buildCrmIdxODataFilter(serverSees(url))).toThrow(
      UnsupportedSearchCriterionError,
    );
  });

  it('names the criterion and the values the broker actually sent', async () => {
    const { url } = await requestFor({ financingMin: 75, financingMax: 90 });
    try {
      buildCrmIdxODataFilter(serverSees(url));
      throw new Error('expected a refusal');
    } catch (e) {
      const err = e as InstanceType<typeof UnsupportedSearchCriterionError>;
      expect(err.criterion).toBe('financing');
      expect(err.unsupportedValues).toEqual(['75', '90']);
    }
  });

  it('does NOT refuse an ordinary search that carries no financing', async () => {
    // A refusal on absence would block every search that never mentioned it.
    const { url } = await requestFor({ priceMin: 500000 });
    expect(() => buildCrmIdxODataFilter(serverSees(url))).not.toThrow();
  });

  it('refuses rather than silently widening — the whole point', async () => {
    // If the server accepted and ignored it, this filter would return HTTP 200
    // with MORE listings than the broker asked for and nothing on the page
    // saying the constraint had been dropped.
    const { url } = await requestFor({ financingMin: 80 });
    let refused = false;
    try {
      buildCrmIdxODataFilter(serverSees(url));
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
  });
});
