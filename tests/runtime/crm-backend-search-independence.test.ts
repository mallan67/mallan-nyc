/// <reference types="jest" />
/**
 * BACKEND AGENT SEARCH BOOTS WITH THE CRM ENTIRELY UNAVAILABLE.
 *
 * ── WHY THIS FILE EXISTS, AND WHY ITS ABSENCE WAS A DEFECT ──────────────────────────────────────
 *
 * `public/crm/html/nav.html`, `tests/runtime/crm-single-entry-point.test.ts` and
 * `tests/runtime/crm-one-application.test.ts` all cited "crm-backend-search-independence.test.ts"
 * as the proof of this invariant. **That file did not exist.** I wrote those citations after
 * proving independence with a one-off live probe — serving the app with `js/dashboard/**` and
 * `dashboard.html` returning 410 GONE — and never committed a test.
 *
 * A comment claiming coverage that does not exist is the exact failure this convergence keeps
 * finding in other people's work: it reads as proof and proves nothing. This file makes the claim
 * true.
 *
 * ── THE INVARIANT (Master Plan §5.1, CLAUDE.md §A.0, AGENTS.md §1.0) ────────────────────────────
 *
 * Backend Agent Search / Listings may CONSUME CRM APIs and data. It must never REQUIRE
 * `dashboard.html` or the CRM router to boot, render or execute. The dependency runs
 * CRM → Backend Search, never the reverse. Search has to survive the CRM being unavailable.
 *
 * ── HOW THIS PROVES IT ─────────────────────────────────────────────────────────────────────────
 *
 * `index-built.html` inlines all of its JavaScript into one document. So booting it with EVERY
 * external resource denied — no network, no file access, every fetch and every XHR rejected — is a
 * faithful simulation of "the CRM is gone". If it reaches a working state under those conditions,
 * it needed nothing from the CRM.
 *
 * This drives the SHIPPED artifact. It does not grep source text for reassuring strings.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const CRM_ASSET = /dashboard\.html|\/js\/dashboard\//i;

describe('Backend Agent Search does not depend on the CRM shell', () => {
  jest.setTimeout(300_000);

  /**
   * Boot the shipped bundle with every external resource denied, recording what it tried to load.
   *
   * The bundle is 2.6 MB and JSDOM parses it asynchronously, so every assertion below waits for the
   * window `load` event first. An earlier draft asserted synchronously and reported `CrmCalc` as
   * undefined — the script had simply not been reached yet. That would have been a false failure,
   * and the mirror-image false PASS is what this whole convergence keeps finding.
   */
  const booted = (() => {
    const html = read('public/crm/index-built.html');
    const requested: string[] = [];
    const pageErrors: string[] = [];

    const virtualConsole = new jsdom.VirtualConsole();
    virtualConsole.on('jsdomError', (e: Error) => pageErrors.push(String(e && e.message)));

    // Deny EVERYTHING external. If the bundle needs a CRM file it will ask, we will record it, and
    // it will not get it.
    class DenyAll extends jsdom.ResourceLoader {
      fetch(url: string) {
        requested.push(url);
        return Promise.reject(new Error(`410 GONE (denied by test): ${url}`));
      }
    }

    const dom = new jsdom.JSDOM(html, {
      url: 'https://mallan.nyc/crm/search',
      runScripts: 'dangerously',
      resources: new DenyAll(),
      pretendToBeVisual: true,
      virtualConsole,
    });

    const win: any = dom.window;
    // Network is unavailable too — the CRM's APIs included.
    win.fetch = (u: string) => {
      requested.push(String(u));
      return Promise.reject(new Error('network down'));
    };
    win.scrollTo = () => undefined;

    const ready = new Promise<void>((resolve) => {
      if (win.document.readyState === 'complete') { resolve(); return; }
      win.addEventListener('load', () => resolve());
      // JSDOM will not fire `load` if a denied subresource stalls the load event; cap the wait and
      // let the assertions speak for whatever state the page reached.
      setTimeout(() => resolve(), 60_000);
    });

    return { dom, win, requested, pageErrors, html, ready };
  })();

  beforeAll(async () => { await booted.ready; });

  afterAll(() => { try { booted.dom.window.close(); } catch { /* nothing to clean up */ } });

  it('the shipped bundle loads no CRM asset — not by <script src>, not by <link>', () => {
    const doc = booted.win.document;
    const external = [
      ...Array.from(doc.querySelectorAll('script[src]')).map((s: any) => s.getAttribute('src')),
      ...Array.from(doc.querySelectorAll('link[href]')).map((l: any) => l.getAttribute('href')),
    ].filter(Boolean) as string[];
    expect({
      crmAssets: external.filter((u) => CRM_ASSET.test(u)),
      why: 'Backend Search must not load the CRM shell or any of js/dashboard/**. Consuming a CRM API is allowed; requiring a CRM FILE is not.',
    }).toEqual({ crmAssets: [], why: expect.any(String) });
  });

  it('it asked for no CRM file while booting, even though every request would have been refused', () => {
    expect(booted.requested.filter((u) => CRM_ASSET.test(u))).toEqual([]);
  });

  it('no CRM module is INLINED into the bundle — the way a dependency would actually arrive', () => {
    // This is the assertion that matters most, and the first draft of this suite did not have it.
    //
    // I proved that by mutation: adding `<script src="js/dashboard/router.js">` to index.html and
    // rebuilding. The two assertions above BOTH still passed — because build.js does not leave a
    // `<script src>` for anything under js/**, it INLINES the file. So a CRM dependency would never
    // show up as an external script or a network request. It would arrive silently, as CRM code
    // pasted into the Search bundle.
    //
    // build.js stamps each inlined module with a marker line, so the artifact says what went into
    // it. That marker is the honest place to look.
    const inlinedCrmModules = booted.html
      .split(/\r?\n/)
      .filter((l) => /^\/\/\s*═+\s*js\/dashboard\//.test(l.trim()))
      .map((l) => l.trim());
    expect({
      inlinedCrmModules,
      why: 'public/crm/build.js inlines every js/** file it is pointed at. A CRM module inlined into the Search bundle is a hard dependency on the CRM, wearing no visible <script src> and making no request.',
    }).toEqual({ inlinedCrmModules: [], why: expect.any(String) });
  });

  it('the CRM router global never appears — Search runs on its own router', () => {
    // Router is dashboard.html's global (js/dashboard/router.js). CrmRouting is Search's own.
    expect(booted.win.Router).toBeUndefined();
    expect(typeof booted.win.CrmRouting).toBe('object');
    expect(typeof booted.win.CrmRouting.install).toBe('function');
  });

  it('the search application actually came up with the CRM unavailable', () => {
    const doc = booted.win.document;
    // The four sections the professional application ships. If these are present and the search
    // engine's own globals are defined, it booted — with no network and no CRM.
    for (const id of ['section-main', 'section-manage']) {
      expect({ id, present: !!doc.getElementById(id) }).toEqual({ id, present: true });
    }
    expect(typeof booted.win.CrmCalc).toBe('object');
    expect(typeof booted.win.MallanStatus).toBe('object');
  });

  it('nothing threw while booting without the CRM', () => {
    // A page that "loads" but throws on the way up has not proven independence.
    // This test denies EVERY external resource, so the vendor CDNs the page uses for styling and
    // email (Tailwind, Font Awesome, Google Fonts, EmailJS) necessarily fail to load. That is the
    // test doing its job, not a CRM dependency — and none of them is a CRM asset, which the earlier
    // assertions already establish. What must be empty is everything else.
    const EXPECTED_DENIALS = /410 GONE \(denied by test\)|network down|Not implemented|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/i;
    const realErrors = booted.pageErrors.filter((m) => !EXPECTED_DENIALS.test(m));
    expect({ realErrors }).toEqual({ realErrors: [] });
  });

  it('the CRM may still LAUNCH Search, and Search may launch the CRM — by route, never by file', () => {
    // The boundary is about dependency, not about links. A launch link is ordinary navigation.
    const nav = read('public/crm/html/nav.html');
    const targets = Array.from(nav.matchAll(/href\s*=\s*"([^"]*)"/g)).map((m) => m[1]);
    expect(targets).toContain('/crm');
    expect(targets.filter((t) => /dashboard\.html/.test(t))).toEqual([]);
  });
});
