/// <reference types="jest" />
/**
 * Boots each standalone CRM form in jsdom (the repo's own jsdom dependency) with a stubbed MallanAPI and requires
 * that page initialization finishes without an uncaught exception.
 *
 * Why: a syntax error or a ReferenceError inside the DOMContentLoaded handler silently aborts the rest of page
 * init, and source-text tests cannot see that. Rental Redesign edit mode never even requested the listing because
 * initLoggedInAgent() threw on its first line (it read companyKey / companyName / agentId, which were never
 * declared), and the Buyer / Tenant auth gates did not parse at all.
 *
 * The Sale and Rental Tools viewers boot in crm-tools-viewer-boot.test.ts (they need the real api-client and a routed fetch).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

type Booted = { errors: string[]; apiCalls: string[]; close: () => void };

function boot(form: string, search: string): Promise<Booted> {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
  const errors: string[] = [];
  const apiCalls: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e: { message?: string; detail?: { message?: string } }) => {
    errors.push(String(e.detail?.message ?? e.message));
  });
  const dom = new JSDOM(html, {
    url: `https://mallan.nyc/crm/${form}.html${search}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeParse(window: any) {
      window.tailwind = { config: {} }; // the CDN script is not loaded in jsdom; pages only assign tailwind.config
      window.alert = () => undefined;
      window.confirm = () => true;
      window.scrollTo = () => undefined;
      window.print = () => undefined;
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      const context = { authenticated: true, role: 'agent', portalRole: 'agent' };
      window.MallanAPI = {
        onReady: (cb: () => void) => setTimeout(cb, 5),
        getContext: () => context,
        init: () => Promise.resolve({ authenticated: true, user: { id: 'AG-9', name: 'Sender Agent', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' } }),
        listings: {
          get: (id: string) => {
            apiCalls.push(`listings.get:${id}`);
            return new Promise((r) => setTimeout(() => r({ listing_id: id, status: 'Active', raw_data: {} }), 40));
          },
          update: async () => ({}),
          updateStatus: async () => ({}),
        },
        idx: { search: async () => ({ results: [] }) },
      };
    },
  });
  return new Promise((r) => setTimeout(() => r({ errors, apiCalls, close: () => dom.window.close() }), 1200));
}

describe.each([
  ['SALE-FORM-REDESIGN', true],
  ['RENTAL-FORM-REDESIGN', true],
  ['BUYER-DEAL-FORM', false],
  ['TENANT-DEAL-FORM', false],
] as const)('%s boots in jsdom', (form, hasEditMode) => {
  it('initializes a new listing without an uncaught error', async () => {
    const b = await boot(form, '');
    try {
      expect([...new Set(b.errors)]).toEqual([]);
    } finally {
      b.close();
    }
  }, 30000);

  if (hasEditMode) {
    it('edit mode initializes without an uncaught error and requests the listing', async () => {
      const b = await boot(form, '?id=L1');
      try {
        expect([...new Set(b.errors)]).toEqual([]);
        expect(b.apiCalls).toContain('listings.get:L1');
      } finally {
        b.close();
      }
    }, 30000);
  }
});
