/// <reference types="jest" />
/**
 * The CRM pages call the application that serves them.
 *
 * public/crm/js/core/agent-context.js and the two Tools viewers used to point the API client at https://mallan.nyc whenever the page's own
 * origin did not contain "mallan.nyc" (a leftover from serving the CRM from GitHub Pages). On localhost or a Vercel preview that sent every
 * call to production: a browser blocked it (CORS), or, worse, a signed-in session would have talked to the production database.
 * The base is now the page's own origin; another origin is an explicit choice (window.MALLAN_API_BASE).
 */
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM, VirtualConsole } = require('jsdom');

jest.setTimeout(60000);
const ROOT = resolve(__dirname, '../..');
const SHELL = readFileSync(resolve(ROOT, 'public/crm/index-built.html'), 'utf8');
/* eslint-disable @typescript-eslint/no-explicit-any */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiCallsFrom(pageUrl: string, base?: string): Promise<string[]> {
  const calls: string[] = [];
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(SHELL, {
    url: pageUrl, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(w: any) {
      if (base) w.MALLAN_API_BASE = base;
      w.tailwind = { config: {} }; w.alert = () => undefined; w.confirm = () => true; w.scrollTo = () => undefined; w.print = () => undefined;
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      w.fetch = async (url: string) => {
        calls.push(String(url));
        const body = String(url).includes('/api/auth/me') ? { authenticated: true, role: 'agent', user: { id: 'AG-9', name: 'Test Agent' } } : {};
        return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
      };
    },
  });
  await sleep(2000);
  dom.window.close();
  return calls.filter((c) => c.includes('/api/'));
}

describe('the CRM search page calls the application that serves it', () => {
  it.each([
    ['localhost', 'http://localhost:3000/crm/search'],
    ['127.0.0.1', 'http://127.0.0.1:3200/crm/search'],
    ['a Vercel preview', 'https://mallan-nyc-git-feature-mallan.vercel.app/crm/search'],
    ['production', 'https://mallan.nyc/crm/search'],
  ])('on %s every API call stays on the page\'s own origin', async (_name, url) => {
    const calls = await apiCallsFrom(url);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      const resolved = new URL(c, url);
      expect({ call: c, sameOrigin: resolved.origin === new URL(url).origin }).toEqual({ call: c, sameOrigin: true });
    }
  });

  it('another origin is used only when the page asks for it explicitly', async () => {
    const calls = await apiCallsFrom('http://127.0.0.1:3200/crm/search', 'https://staging.example.test');
    expect(calls.some((c) => c.startsWith('https://staging.example.test/api/'))).toBe(true);
  });
});

describe('no CRM page or script points the API at production by hostname', () => {
  const files = [
    'public/crm/index.html', 'public/crm/dashboard.html', 'public/crm/SALE-FORM-WITH-TOOLS.html', 'public/crm/RENTAL-FORM-WITH-TOOLS.html',
    ...readdirSync(resolve(ROOT, 'public/crm/js/core')).map((f) => `public/crm/js/core/${f}`),
  ];
  it.each(files)('%s', (rel) => {
    const src = readFileSync(resolve(ROOT, rel), 'utf8');
    expect(src).not.toMatch(/baseUrl:\s*'https:\/\/mallan\.nyc'/);
    expect(src).not.toMatch(/indexOf\('mallan\.nyc'\)\s*===\s*-1/);
  });
});
