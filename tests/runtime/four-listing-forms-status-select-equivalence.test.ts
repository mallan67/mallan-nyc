/// <reference types="jest" />
/**
 * The four standalone listing forms' status selects vs. the ONE server mapping.
 *
 *   public/crm/SALE-FORM-REDESIGN.html      #saleStatus
 *   public/crm/SALE-FORM-WITH-TOOLS.html    #saleStatus
 *   public/crm/RENTAL-FORM-REDESIGN.html    #rentalStatus
 *   public/crm/RENTAL-FORM-WITH-TOOLS.html  #rentalStatus
 *
 * Every other CRM status surface already builds itself from GET /api/crm/status-options
 * (manage-listings, the dashboard panels, the sales / rentals CRM panels). These four pages were the
 * last status UIs carrying their own hand-typed vocabulary, and it had already drifted from
 * lib/crm/status-mapping.ts: "Cancelled" displayed with two Ls where the server label is "Canceled",
 * two sale workflow words mislabelled, the rental words Leased / LeasedThruUs missing outright, and
 * ActiveUnderContract offered by neither transaction.
 *
 * WHAT THIS PROVES — and how. Nothing here greps HTML source text. Each page is booted in a real DOM
 * (jsdom, `runScripts: 'dangerously'`, its own js/core/api-client.js really loaded), and every
 * assertion reads `document.getElementById('saleStatus'|'rentalStatus').options` — the options an
 * agent actually sees — and compares them to the JSON body the REAL route handler
 * `app/api/crm/status-options/route.ts` returns for that page's transaction.
 *
 * Three modes, because the page has to be right in all three:
 *
 *   1. SERVER-SOURCED (the fix): the page fetches its own transaction's options at load and rebuilds
 *      the select from them. Proven not by "a request was made" but by feeding the page a MUTATED
 *      payload (an invented workflow word, a changed label) and finding the mutation rendered — a
 *      page that ignored the endpoint could not show it.
 *   2. OFFLINE FALLBACK: with the endpoint failing, the select is never emptied (it is `required` —
 *      an empty one would block every save) and the markup it falls back to is itself equivalent to
 *      the server mapping.
 *   3. EQUIVALENCE (the ratchet): in both modes the complete rendered option set — values, labels,
 *      and this transaction's vocabulary with no leakage from the other — matches the server.
 *
 * WHAT IT DOES NOT PROVE (CLAUDE.md §J.8): it proves the four pages agree with the COMMITTED server
 * mapping in lib/crm/status-mapping.ts. It proves nothing about which StandardStatus members are live
 * on Cotality — that authority is lib/cotality/generated/contract.ts plus a live probe.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeRequest } from './helpers';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' }),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: async () => undefined,
}));

const ROOT = resolve(__dirname, '../..');

type WorkflowRow = { word: string; label: string; canonical: string; canonicalLabel: string; requiredFacts: string[] };
type CanonicalRow = { token: string; label: string; facts: string[] };
type Body = { transaction: string; formKey: string; workflow: WorkflowRow[]; canonical: CanonicalRow[]; factLabels: Record<string, string> };

/** The REAL route handler's body for a transaction — the authority every assertion below compares to. */
async function statusOptions(type: 'sale' | 'rental'): Promise<Body> {
  const { GET } = await import('@/app/api/crm/status-options/route');
  const res = await GET(makeRequest({ method: 'GET', url: `http://localhost/api/crm/status-options?type=${type}` }));
  expect(res.status).toBe(200);
  return JSON.parse(await res.text()) as Body;
}

// ── The page in a real DOM ────────────────────────────────────────────────────────────────────────
class LocalOnly extends jsdom.ResourceLoader {
  fetch(url: string) {
    const m = url.match(/^http:\/\/localhost\/crm\/(.+)$/);
    if (!m) return null; // CDN (Tailwind, fonts, icons) — irrelevant to the option set
    try { return Promise.resolve(readFileSync(resolve(ROOT, 'public/crm', m[1].split('?')[0]))); } catch { return null; }
  }
}

const AUTH_ME = { authenticated: true, principalType: 'agent', role: 'broker', portalRole: 'broker', user: { id: '7', name: 'Maya Allan' } };

/** The two WITH-TOOLS viewers replace the whole page when opened without a listing id, and fail closed when
 *  that listing cannot be loaded — so they are booted with `?id=` and answered with a real-shaped row. */
const viewerListing = (type: 'sale' | 'rental') => ({
  id: '901',
  listing_id: type === 'sale' ? 'SL-0901' : 'RL-0901',
  listing_type: type === 'sale' ? 'sale' : 'rent',
  status: 'Active',
  address: '400 East 90th Street', unit_number: '17C', city: 'New York', state: 'NY', zip_code: '10128',
  price: type === 'sale' ? 1250000 : 4500, bedrooms: 2, bathrooms: 1,
  raw_data: {}, photos: [], media: [],
  form_status: { value: 'Active', label: 'Active', providerStatus: null },
});

const respond = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data),
  headers: new Map([['content-type', 'application/json']]),
});

type Load = {
  /** the transaction of the page being booted */
  type: 'sale' | 'rental';
  /** every path the page fetched, in order */
  requests: string[];
  /** how the status-options endpoint answers */
  mode: 'real' | 'fail';
  /** mutate the real payload before it reaches the page */
  transform?: (body: Body) => Body;
  /** query string the page is opened with (the WITH-TOOLS viewers need `?id=`) */
  query?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPage(file: string, load: Load): Promise<any> {
  const html = readFileSync(resolve(ROOT, 'public/crm', file), 'utf8');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(html, {
    url: `http://localhost/crm/${file}${load.query ?? ''}`,
    runScripts: 'dangerously',
    resources: new LocalOnly(),
    pretendToBeVisual: true,
    virtualConsole,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeParse(window: any) {
      window.fetch = async (input: unknown, init?: { method?: string; body?: string }) => {
        const url = String(typeof input === 'string' ? input : (input as { url?: string })?.url ?? '');
        const path = url.replace(/^https?:\/\/[^/]+/, '');
        load.requests.push(path);
        if (path.startsWith('/api/auth/me')) return respond(200, AUTH_ME);
        if (path.startsWith('/api/crm/status-options')) {
          if (load.mode === 'fail') return respond(503, { error: 'status options unavailable' });
          const body = await statusOptions(/type=sale/.test(path) ? 'sale' : 'rental');
          return respond(200, load.transform ? load.transform(body) : body);
        }
        if (/^\/api\/crm\/listings\/[^/]+$/.test(path.split('?')[0])) return respond(200, viewerListing(load.type));
        return respond(200, {});
      };
      window.scrollTo = () => {};
      window.alert = () => {};
      window.confirm = () => true;
      window.HTMLElement.prototype.scrollIntoView = function () {};
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    },
  });
  await new Promise<void>((done) => {
    if (dom.window.document.readyState === 'complete') return done();
    const fallback = setTimeout(done, 8000);
    dom.window.addEventListener('load', () => { clearTimeout(fallback); done(); });
  });
  return dom;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 25));
/** Wait for the page's own status-options work to settle (it publishes the outcome on window). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function settled(dom: any): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (dom.window.__mallanStatusOptions && dom.window.__mallanStatusOptions.settled) break;
    await tick();
  }
  await tick();
}

/**
 * The options an agent can actually choose. The group separators (`<option disabled>── … ──</option>`) are
 * presentation, not vocabulary, so they are dropped. A `hidden` option IS a real value the select can hold
 * (a saved canonical token arriving from the server), so it is kept.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderedOptions(dom: any, formKey: string): { value: string; label: string; hidden: boolean }[] {
  const el = dom.window.document.getElementById(formKey);
  expect(el).toBeTruthy();
  return Array.prototype.filter.call(el.options, (o: HTMLOptionElement) => !o.disabled)
    .map((o: HTMLOptionElement) => ({ value: o.value, label: (o.textContent ?? '').trim(), hidden: o.hasAttribute('hidden') }));
}

const PAGES: { file: string; formKey: string; type: 'sale' | 'rental'; query?: string }[] = [
  { file: 'SALE-FORM-REDESIGN.html', formKey: 'saleStatus', type: 'sale' },
  { file: 'SALE-FORM-WITH-TOOLS.html', formKey: 'saleStatus', type: 'sale', query: '?id=SL-0901' },
  { file: 'RENTAL-FORM-REDESIGN.html', formKey: 'rentalStatus', type: 'rental' },
  { file: 'RENTAL-FORM-WITH-TOOLS.html', formKey: 'rentalStatus', type: 'rental', query: '?id=RL-0901' },
];

/**
 * The one equivalence assertion, applied to a rendered select. It is the ratchet: the page's complete
 * vocabulary IS this transaction's server mapping — every workflow word, every canonical token, each with
 * the server's own label, nothing invented, and nothing from the other transaction.
 */
function assertEquivalent(
  rendered: { value: string; label: string }[],
  body: Body,
  otherBody: Body,
  transaction: 'sale' | 'rental',
) {
  const byValue = new Map(rendered.map((o) => [o.value, o.label]));
  const values = rendered.map((o) => o.value);
  const words = new Map(body.workflow.map((w) => [w.word, w.label]));
  const tokens = new Map(body.canonical.map((c) => [c.token, c.label]));

  // 1. every workflow word this transaction has is offered (the rental Leased / LeasedThruUs gap)
  expect({ missingWorkflowWords: body.workflow.map((w) => w.word).filter((w) => !byValue.has(w)) })
    .toEqual({ missingWorkflowWords: [] });

  // 2. every canonical (stored) token is representable — otherwise a saved listing whose workflow word
  //    disagrees with its stored status lands on a select with no such option (the ActiveUnderContract gap)
  expect({ missingCanonicalTokens: body.canonical.map((c) => c.token).filter((t) => !byValue.has(t)) })
    .toEqual({ missingCanonicalTokens: [] });

  // 3. every label is the SERVER's label — a workflow word's display label, or a canonical token's
  //    transaction label when the value is only a token (the two-L "Cancelled" defect)
  const wrongLabels = rendered
    .map((o) => {
      const expected = words.has(o.value) ? words.get(o.value)! : tokens.get(o.value);
      return expected !== undefined && expected !== o.label ? { value: o.value, rendered: o.label, server: expected } : null;
    })
    .filter(Boolean);
  expect({ wrongLabels }).toEqual({ wrongLabels: [] });

  // 4. nothing invented: every offered value is a workflow word or a canonical token of THIS transaction
  expect({ valuesTheServerMappingDoesNotHave: values.filter((v) => v !== '' && !words.has(v) && !tokens.has(v)) })
    .toEqual({ valuesTheServerMappingDoesNotHave: [] });

  // 5. no duplicates — one row per value, so `select.value = word` is unambiguous
  expect({ duplicateValues: values.filter((v, i) => values.indexOf(v) !== i) }).toEqual({ duplicateValues: [] });

  // 6. no cross-transaction leakage: a sale is never offered a rental word and vice versa
  const otherOnly = new Set(
    [...otherBody.workflow.map((w) => w.word), ...otherBody.canonical.map((c) => c.token)]
      .filter((v) => !words.has(v) && !tokens.has(v)),
  );
  expect({ leakedFromTheOtherTransaction: values.filter((v) => otherOnly.has(v)) })
    .toEqual({ leakedFromTheOtherTransaction: [] });

  // 7. rental: ComingSoon is prohibited (REBNY RLS §2.05(d) / UCBA Art. I §16) and the rental mapping has
  //    none — pinned here as a RENDERED fact, not an HTML comment
  if (transaction === 'rental') {
    expect(values).not.toContain('ComingSoon');
    expect(values).not.toContain('Coming Soon');
  }
}

describe('the four listing forms build their status select from the server mapping', () => {
  jest.setTimeout(300_000);

  let sale: Body;
  let rental: Body;
  beforeAll(async () => {
    sale = await statusOptions('sale');
    rental = await statusOptions('rental');
  });

  describe.each(PAGES)('$file (#$formKey, $type)', ({ file, formKey, type, query }) => {
    it('asks the server for ITS OWN transaction at load, and renders exactly that mapping', async () => {
      const load: Load = { type, query, requests: [], mode: 'real' };
      const dom = await loadPage(file, load);
      await settled(dom);

      // it asked — for its own transaction, never a shared list
      const asked = load.requests.filter((r) => r.startsWith('/api/crm/status-options'));
      expect(asked.length).toBeGreaterThan(0);
      for (const r of asked) expect(r).toContain(`type=${type}`);

      assertEquivalent(renderedOptions(dom, formKey), type === 'sale' ? sale : rental, type === 'sale' ? rental : sale, type);
      dom.window.close();
    });

    it('every label the agent reads is the SERVER label — nothing invented, and "Canceled" carries ONE L', async () => {
      const load: Load = { type, query, requests: [], mode: 'real' };
      const dom = await loadPage(file, load);
      await settled(dom);

      const body = type === 'sale' ? sale : rental;
      const words = new Map(body.workflow.map((w) => [w.word, w.label]));
      const tokens = new Map(body.canonical.map((c) => [c.token, c.label]));
      const rendered = renderedOptions(dom, formKey);

      // this assertion alone — so the label defect is visible even when the option set is also wrong
      const wrongLabels = rendered
        .map((o) => {
          const expected = words.has(o.value) ? words.get(o.value)! : tokens.get(o.value);
          return expected !== undefined && expected !== o.label ? { value: o.value, rendered: o.label, server: expected } : null;
        })
        .filter(Boolean);
      expect({ wrongLabels }).toEqual({ wrongLabels: [] });

      // the provider spells it with one L; the two-L spelling is the stored WORD, never a label
      expect(rendered.map((o) => o.label).join('|')).not.toMatch(/Cancelled/);
      expect(rendered.find((o) => o.value === 'Cancelled')?.label).toBe('Canceled');
      dom.window.close();
    });

    it('renders what the server sent — a mutated payload reaches the DOM (a page ignoring the endpoint cannot)', async () => {
      const load: Load = {
        type,
        query,
        requests: [],
        mode: 'real',
        transform: (b) => ({
          ...b,
          workflow: [
            ...b.workflow.map((w) => (w.word === 'Cancelled' ? { ...w, label: 'CANCELED-PROBE' } : w)),
            { word: 'ProbeWord', label: 'Probe Word', canonical: 'Active', canonicalLabel: 'Active', requiredFacts: [] },
          ],
        }),
      };
      const dom = await loadPage(file, load);
      await settled(dom);

      const byValue = new Map(renderedOptions(dom, formKey).map((o) => [o.value, o.label]));
      expect(byValue.get('ProbeWord')).toBe('Probe Word');
      expect(byValue.get('Cancelled')).toBe('CANCELED-PROBE');
      dom.window.close();
    });

    it('fails closed when the endpoint is down: the required select is never emptied, and its fallback markup is itself equivalent', async () => {
      const load: Load = { type, query, requests: [], mode: 'fail' };
      const dom = await loadPage(file, load);
      await settled(dom);

      const rendered = renderedOptions(dom, formKey);
      // an empty `required` select would block every save on this page
      expect(rendered.length).toBeGreaterThan(0);
      expect(rendered.map((o) => o.value)).toContain('Active');

      assertEquivalent(rendered, type === 'sale' ? sale : rental, type === 'sale' ? rental : sale, type);
      dom.window.close();
    });
  });

  describe.each(PAGES.filter((p) => p.type === 'rental'))('$file — the rental ComingSoon hard block survives the rebuild', ({ file, formKey, type, query }) => {
    it('re-arms on the rebuilt select: a payload that offers ComingSoon is refused, and an injected choice is reverted', async () => {
      const load: Load = {
        type,
        query,
        requests: [],
        mode: 'real',
        // a drifted / hostile payload that offers the prohibited state
        transform: (b) => ({
          ...b,
          workflow: [...b.workflow, { word: 'ComingSoon', label: 'Coming Soon', canonical: 'Active', canonicalLabel: 'Active', requiredFacts: [] }],
        }),
      };
      const dom = await loadPage(file, load);
      await settled(dom);

      const win = dom.window;
      const select = win.document.getElementById(formKey);
      expect(select).toBeTruthy();
      // the payload's ComingSoon row is never rendered
      expect(Array.prototype.map.call(select.options, (o: HTMLOptionElement) => o.value)).not.toContain('ComingSoon');

      // and even a devtools-injected option is reverted on change
      const injected = win.document.createElement('option');
      injected.value = 'ComingSoon';
      injected.textContent = 'Coming Soon';
      select.appendChild(injected);
      select.value = 'ComingSoon';
      select.dispatchEvent(new win.Event('change', { bubbles: true }));
      expect(select.value).not.toBe('ComingSoon');
      dom.window.close();
    });
  });
});
