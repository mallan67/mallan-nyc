/// <reference types="jest" />
/**
 * The Commingling Prevention gate (Test 8) must compare ONE listing population against ITSELF.
 *
 * Proven defect (P0-C3B, adjudicated 2026-09-15). The gate drew the two sides of its inequality from two
 * DIFFERENT DOM populations:
 *
 *     total   = document.querySelectorAll('[data-listing-id]').length
 *     labeled = document.querySelectorAll('[data-source="COTALITY-API"], [data-source="MALLAN-LOCAL"]').length
 *     PASS if total === 0, else PASS if labeled >= total
 *
 * Because 'labeled' counted ANY element carrying data-source — not only listing rows — any non-listing
 * element with that attribute bought exactly one unlabelled real listing a free pass. #detailPanel
 * (public/crm/html/search-form-and-results.html) is such an element: a layout shell carrying
 * data-source="COTALITY-API" with no data-listing-id.
 *
 * A 2x2 factorial probe isolated the cause. Maximum unlabelled listings absorbed before the gate FAILs:
 *
 *     six fabricated cards YES / #detailPanel YES -> 1
 *     six fabricated cards NO  / #detailPanel YES -> 1
 *     six fabricated cards YES / #detailPanel NO  -> 0
 *     six fabricated cards NO  / #detailPanel NO  -> 0
 *
 * The slack was a function of #detailPanel ALONE. The six fabricated listing cards contributed exactly
 * zero, because the one card that carried the queried attributes carried BOTH and so incremented each
 * side equally.
 *
 * THE FIX IS STRUCTURAL, NOT COSMETIC. Removing data-source from #detailPanel alone would close today's
 * slack while leaving the gate able to reacquire the same defect the moment any other non-listing element
 * gains a source attribute. So the gate now derives 'labeled' from the SAME node set as 'total' — the
 * numerator is a subset of the denominator by construction, and no shell element can ever add slack again.
 *
 * Deliberately NOT changed: the gate does not filter by visibility. Its siblings C6/W3/AL3 do, but adding
 * an offsetParent filter here would make the gate untestable in jsdom (which has no layout engine, so
 * offsetParent is null for every element) and could mask a genuinely rendered unlabelled row. The
 * visibility question is recorded for a separate ruling.
 *
 * BEHAVIOURAL: the real shipped artifact is booted and the real gate is invoked. The truth table below is
 * the negative proof the owner required.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const ARTIFACT = resolve(ROOT, 'public/crm/index-built.html');

jest.setTimeout(300_000);

type Row = { id?: string; source?: string | null };
type Verdict = { status: string; detail: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let win: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dom: any;

beforeAll(async () => {
  const html = readFileSync(ARTIFACT, 'utf8');
  const vc = new jsdom.VirtualConsole();
  vc.on('jsdomError', () => undefined);
  vc.on('error', () => undefined);
  vc.on('warn', () => undefined);
  dom = new jsdom.JSDOM(html, {
    url: 'https://mallan.nyc/crm/search',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  win = dom.window;
  win.fetch = () => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null), text: () => Promise.resolve('') });
  win.alert = () => undefined;
  win.confirm = () => false;
  win.scrollTo = () => undefined;
  await new Promise((r) => setTimeout(r, 1500));
  const host = win.document.createElement('div');
  host.id = '__t8_scratch';
  win.document.body.appendChild(host);
});

afterAll(() => { if (dom) dom.window.close(); });

/** Replace the scratch listing rows. A row with no source is an unlabelled listing. */
function setRows(rows: Row[]): void {
  const host = win.document.getElementById('__t8_scratch');
  host.innerHTML = '';
  rows.forEach((r, i) => {
    const el = win.document.createElement('div');
    el.className = 'listing-card';
    if (r.id !== undefined) el.setAttribute('data-listing-id', r.id);
    else el.setAttribute('data-listing-id', 'L' + i);
    if (r.source) el.setAttribute('data-source', r.source);
    host.appendChild(el);
  });
}

/** Append a NON-listing element carrying data-source (the #detailPanel shape). */
function addShellWithSource(id: string): void {
  const el = win.document.createElement('div');
  el.id = id;
  el.setAttribute('data-source', 'COTALITY-API');   // no data-listing-id — it is not a listing
  win.document.getElementById('__t8_scratch').appendChild(el);
}

function runTest8(): Verdict {
  const report = win.REBNYComplianceDoctor({ context: 'factorial-test' });
  const row = (report.results || []).find((r: { test: number }) => r.test === 8);
  if (!row) throw new Error('Test 8 not present in the compliance report');
  return { status: row.status, detail: row.detail };
}

describe('the shipped page contributes no listing rows of its own', () => {
  it('static markup carries zero [data-listing-id] and zero non-listing data-source', () => {
    setRows([]);
    const doc = win.document;
    expect({
      listings: doc.querySelectorAll('[data-listing-id]').length,
      anySource: doc.querySelectorAll('[data-source]').length,
      why: 'a shell element carrying data-source is what created the slack',
    }).toEqual({ listings: 0, anySource: 0, why: expect.any(String) });
  });
});

describe('Test 8 truth table — one population compared against itself', () => {
  it('1 · zero listings → PASS via the empty-state branch', () => {
    setRows([]);
    const v = runTest8();
    expect(v.status).toBe('PASS');
    expect(v.detail).toMatch(/No listings displayed/i);
  });

  it('2 · one correctly labelled listing → PASS', () => {
    setRows([{ id: 'A', source: 'COTALITY-API' }]);
    const v = runTest8();
    expect({ status: v.status, why: 'a labelled listing is compliant' }).toEqual({ status: 'PASS', why: expect.any(String) });
    expect(v.detail).toMatch(/All 1 listings/);
  });

  it('2b · a MALLAN-LOCAL listing is equally acceptable', () => {
    setRows([{ id: 'A', source: 'MALLAN-LOCAL' }]);
    expect(runTest8().status).toBe('PASS');
  });

  it('3 · one unlabelled listing → FAIL', () => {
    setRows([{ id: 'A' }]);
    const v = runTest8();
    expect({ status: v.status, why: 'an unlabelled listing is a commingling risk' }).toEqual({ status: 'FAIL', why: expect.any(String) });
    expect(v.detail).toMatch(/1\/1/);
  });

  it('4 · one labelled + one unlabelled → FAIL', () => {
    setRows([{ id: 'A', source: 'COTALITY-API' }, { id: 'B' }]);
    const v = runTest8();
    expect(v.status).toBe('FAIL');
    expect(v.detail).toMatch(/1\/2/);
  });

  it('4b · an unrecognised source value counts as unlabelled', () => {
    setRows([{ id: 'A', source: 'REBNY-RLS' }]);
    expect(runTest8().status).toBe('FAIL');
  });

  it('5 · an arbitrary NON-LISTING element carrying data-source cannot rescue it → still FAIL', () => {
    setRows([{ id: 'A' }]);
    addShellWithSource('__t8_shell');
    const v = runTest8();
    expect({ status: v.status, why: 'a shell element is not a listing and must not add label slack' })
      .toEqual({ status: 'FAIL', why: expect.any(String) });
    expect(v.detail).toMatch(/1\/1/);
  });

  it('5b · ten non-listing shells still cannot rescue one unlabelled listing', () => {
    setRows([{ id: 'A' }]);
    for (let i = 0; i < 10; i++) addShellWithSource('__t8_shell_' + i);
    expect(runTest8().status).toBe('FAIL');
  });

  it('6 · #detailPanel with or without data-source cannot change the listing verdict', () => {
    const panel = win.document.getElementById('detailPanel');
    expect({ found: !!panel, why: 'the shell that caused the original defect must still exist' })
      .toEqual({ found: true, why: expect.any(String) });

    setRows([{ id: 'A' }]);
    const without = runTest8();
    panel.setAttribute('data-source', 'COTALITY-API');
    const withSource = runTest8();
    panel.removeAttribute('data-source');

    expect({ without: without.status, withSource: withSource.status, why: 'the shell is outside the listing population either way' })
      .toEqual({ without: 'FAIL', withSource: 'FAIL', why: expect.any(String) });
  });

  it('7 · re-introducing the six fabricated cards does not move any row of the truth table', () => {
    // One card with BOTH attributes (the RLS-78921 shape) and five with neither (the data-ref shape).
    const inject = () => {
      const host = win.document.getElementById('__t8_scratch');
      const a = win.document.createElement('div');
      a.className = 'listing-card';
      a.setAttribute('data-listing-id', 'RLS-78921');
      a.setAttribute('data-source', 'COTALITY-API');
      host.appendChild(a);
      for (let i = 0; i < 5; i++) {
        const d = win.document.createElement('div');
        d.className = 'listing-card';
        d.setAttribute('data-ref', String.fromCharCode(66 + i));
        host.appendChild(d);
      }
    };

    setRows([]); inject();
    expect(runTest8().status).toBe('PASS');              // the fabricated card is itself labelled

    setRows([{ id: 'A' }]); inject();
    expect(runTest8().status).toBe('FAIL');              // and it cannot rescue an unlabelled real row

    setRows([{ id: 'A', source: 'COTALITY-API' }]); inject();
    expect(runTest8().status).toBe('PASS');
  });
});

describe('the gate no longer draws its two sides from different populations', () => {
  it('source is read from the listing elements themselves', () => {
    const src = readFileSync(resolve(ROOT, 'public/crm/js/compliance/compliance-gates-and-output.js'), 'utf8');
    const start = src.indexOf('function test8_Commingling');
    expect(start).toBeGreaterThan(-1);
    // Strip comments first — the fix carries an explanatory comment that QUOTES the removed query, and a
    // naive source pin would flag its own documentation. Same convention as
    // crm-designation-no-fabrication.test.ts, which strips comments for exactly this reason.
    // NOTE: split on /\r?\n/, not '\n'. This file is CRLF in a Windows working tree, and splitting on
    // '\n' alone leaves a trailing '\r' on every line — which is a line terminator, so `.*$` cannot match
    // past it and the comment stripper silently does nothing. Same EOL class as the build-drift incident.
    const body = src.slice(start, start + 2600)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    // The defect was a second, independent document-wide query for the numerator.
    expect(body).not.toMatch(/querySelectorAll\(\s*['"]\[data-source=/);
    expect(body).toMatch(/getAttribute\(\s*['"]data-source['"]\s*\)/);
  });

  it('#detailPanel does not impersonate a provider record in source or in the artifact', () => {
    const partial = readFileSync(resolve(ROOT, 'public/crm/html/search-form-and-results.html'), 'utf8');
    const panelTag = partial.slice(partial.indexOf('id="detailPanel"'), partial.indexOf('id="detailPanel"') + 300);
    expect(panelTag).not.toContain('data-source');
    const built = readFileSync(ARTIFACT, 'utf8');
    const builtTag = built.slice(built.indexOf('id="detailPanel"'), built.indexOf('id="detailPanel"') + 300);
    expect(builtTag).not.toContain('data-source');
  });
});
