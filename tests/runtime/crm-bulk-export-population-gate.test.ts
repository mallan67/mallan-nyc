/// <reference types="jest" />
/**
 * The bulk-export compliance gate must measure the REAL export population, and must not assert a number
 * nobody can source.
 *
 * OWNERSHIP ADJUDICATED 2026-09-15 (P0-C3C). Classification: B — STALE TEST NAME / WRONG CANONICAL OWNER.
 *
 * The gate was "Bulk Export Restriction": it required selectAllResults() to exist and asserted
 * document.querySelectorAll('.listing-checkbox').length <= 25. Both halves were unsound, and had been for
 * months:
 *
 *   GUARD HALF — selectAllResults() once carried the real enforcement: a 25-listing selection cap with a
 *   "REBNY Compliance Notice … Export in batches using filtered searches for more" confirm dialog. That
 *   enforcement was DELETED on 2026-03-22 in 2183dd4d, whose subject —
 *   "fix(crm): wire delivery stubs, compute real averages, fix filter count" — never mentions removing a
 *   compliance cap. The function survives as a two-line delegator with zero invokers, so the typeof guard
 *   stayed permanently true while proving nothing. The gate watched a control get deleted and reported PASS.
 *
 *   COUNT HALF — no renderer has EVER emitted .listing-checkbox in this repository's history. Its only
 *   population was fabricated static mockup cards (removed 2026-09-15). The five real renderers emit
 *   anonymous checkboxes bound to toggleListingSelection(); selection truth lives in
 *   searchResultsState.selectedListings, and the export population in searchResultsState.filteredListings
 *   via reports.js getReportListings().
 *
 * THE NUMBER IS DELIBERATELY NOT RE-ASSERTED. Neither 25 nor reports.js's MAX_EXPORT_ROWS = 250 is
 * traceable to any authority:
 *   - data/UCBA-2026-Requirements.md carries no record-count ceiling; its only export mention (:467) is an
 *     audit-LOGGING duty, "Exports (if any), who initiated, snapshots";
 *   - compliance/THIRD-PARTY-AND-FEED-GOVERNANCE.md:223 lists "Bulk export of MLS data" as PROHIBITED
 *     (rule F1), with no threshold;
 *   - UCBA Art. VIII Sec. 4 permits reproduction only "for individual personal reference".
 * A numeric cap asserts "export up to N is permitted", which is the wrong SHAPE for a rule that prohibits
 * the activity outright. Retargeting the gate at 250 would have re-laundered an invented threshold as
 * compliance. Per CLAUDE.md §E an absent requirement is a fail-closed escalation to Maya, not a guess.
 *
 * WHAT THE GATE NOW ASSERTS is sourced and has a reachable FAIL branch: nothing that may NEVER be
 * distributed is sitting in the population an export would draw from — Owner Opt-Out (UCBA Art. I Sec.
 * 4(A)) and Participant Only (RLS Permissions=Private), the same two gates this file already enforces for
 * display.
 *
 * KNOWN GAP, ESCALATED NOT FIXED — outside the P0-C3 authorization, recorded so it cannot be lost:
 * reports.js getReportListings():2641 screens ONLY on idxDisplayYN and internetDisplayYN. It does not check
 * ownerOptOut or participantOnly. Those appear exactly once in reports.js, at :2215, inside the email path.
 * So CSV (:2339), xlsx (:2517), print (:3175) and preview (:482) do not re-filter them.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');
const GATES = readFileSync(resolve(ROOT, 'public/crm/js/compliance/compliance-gates-and-output.js'), 'utf8');

jest.setTimeout(300_000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let win: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dom: any;

beforeAll(async () => {
  const html = readFileSync(resolve(ROOT, 'public/crm/index-built.html'), 'utf8');
  const vc = new jsdom.VirtualConsole();
  vc.on('jsdomError', () => undefined);
  vc.on('error', () => undefined);
  vc.on('warn', () => undefined);
  dom = new jsdom.JSDOM(html, {
    url: 'https://mallan.nyc/crm/search',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    // The page reads LOGGED_IN_AGENT while initialising searchResultsState; without it that script block
    // aborts and the state global never exists. This is a harness requirement, not a product behaviour.
    beforeParse(w: Window & Record<string, unknown>) {
      w.LOGGED_IN_AGENT = { id: 'agent-1', name: 'Maya Allan' };
      w.fetch = (() => Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) })) as unknown as typeof fetch;
      w.alert = () => undefined;
      w.scrollTo = () => undefined;
    },
  });
  win = dom.window;
  await new Promise((r) => setTimeout(r, 2000));
});

afterAll(() => { if (dom) dom.window.close(); });

type Perm = { ownerOptOut?: boolean; participantOnly?: boolean };

function setPool(rows: Array<{ id: number; permissions?: Perm }>): void {
  win.searchResultsState.filteredListings = rows;
}

function runGate(): { name: string; status: string; detail: string } {
  const report = win.REBNYComplianceDoctor({ context: 'bulk-export-population-test' });
  const row = (report.results || []).find((r: { test: number }) => r.test === 10);
  if (!row) throw new Error('gate 10 not present in the compliance report');
  return { name: row.name, status: row.status, detail: row.detail };
}

describe('the gate measures the real export population', () => {
  it('the export-population state global is reachable', () => {
    expect({ type: typeof win.searchResultsState, why: 'the gate cannot measure a population it cannot see' })
      .toEqual({ type: 'object', why: expect.any(String) });
  });

  it('an empty population passes honestly', () => {
    setPool([]);
    const v = runGate();
    expect(v.name).toBe('Bulk Export Population');
    expect(v.status).toBe('PASS');
    expect(v.detail).toMatch(/No listings in the export population/);
  });

  it('a clean population passes and reports the count it actually measured', () => {
    setPool([{ id: 1, permissions: {} }, { id: 2, permissions: { ownerOptOut: false } }]);
    const v = runGate();
    expect(v.status).toBe('PASS');
    expect(v.detail).toMatch(/2 listings in the export population/);
  });

  it('an OWNER OPT-OUT listing in the export population FAILS — UCBA Art. I Sec. 4(A)', () => {
    setPool([{ id: 1, permissions: {} }, { id: 2, permissions: { ownerOptOut: true } }]);
    const v = runGate();
    expect({ status: v.status, why: 'owner opt-out means no dissemination in any context, ever' })
      .toEqual({ status: 'FAIL', why: expect.any(String) });
    expect(v.detail).toMatch(/1\/2/);
    expect(v.detail).toMatch(/owner opt-out/);
  });

  it('a PARTICIPANT-ONLY listing in the export population FAILS — RLS Permissions=Private', () => {
    setPool([{ id: 1, permissions: { participantOnly: true } }]);
    const v = runGate();
    expect(v.status).toBe('FAIL');
    expect(v.detail).toMatch(/participant only/);
  });

  it('the FAIL branch is reachable — which the previous gate could never be', () => {
    setPool([{ id: 1, permissions: { ownerOptOut: true } }]);
    expect(runGate().status).toBe('FAIL');
    setPool([{ id: 1, permissions: {} }]);
    expect(runGate().status).toBe('PASS');
  });
});

describe('the gate no longer asserts unsourced or unreachable things', () => {
  // Comment-stripped: the replacement documents the removed defect, and a naive pin would flag its own
  // explanation. Split on /\r?\n/ — this file is CRLF in a Windows working tree, and splitting on '\n'
  // alone leaves a trailing '\r' that stops `.*$` from matching, silently disabling the stripper.
  const gateBody = (() => {
    const start = GATES.indexOf('function test10_BulkExportPopulation');
    expect(start).toBeGreaterThan(-1);
    return GATES.slice(start, start + 2400)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  })();

  it('does not count .listing-checkbox, which no renderer emits', () => {
    expect(gateBody).not.toContain('listing-checkbox');
  });

  it('does not re-assert an unsourced numeric ceiling', () => {
    expect(gateBody).not.toMatch(/BULK_LIMIT/);
    expect(gateBody).not.toMatch(/\b25\b/);
    expect(gateBody).not.toMatch(/\b250\b/);
  });

  it('does not depend on the retired selectAllResults() shim', () => {
    expect(gateBody).not.toContain('selectAllResults');
  });

  it('reads the export population from application state', () => {
    expect(gateBody).toContain('searchResultsState');
    expect(gateBody).toMatch(/ownerOptOut/);
    expect(gateBody).toMatch(/participantOnly/);
  });
});

describe('the display-side gates this one mirrors remain enforced', () => {
  it('Owner Opt-Out and Participant Only still block display', () => {
    // These are the sourced rules the export-population gate now mirrors. If they ever weaken, the
    // export gate is mirroring nothing.
    expect(GATES).toContain('Gate 1: Owner Opt-Out');
    expect(GATES).toMatch(/perm\.ownerOptOut === true/);
    expect(GATES).toContain('Gate 2: Participant Only');
    expect(GATES).toMatch(/perm\.participantOnly === true/);
  });
});
