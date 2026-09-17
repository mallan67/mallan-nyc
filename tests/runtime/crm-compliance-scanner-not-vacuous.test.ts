/// <reference types="jest" />
export {};
/**
 * THE BROWSER COMPLIANCE SCANNERS MUST ACTUALLY SEE THE BADGES THE RENDERERS EMIT.
 *
 * Two scanners in public/crm/js/compliance/compliance-gates-and-output.js inspect the rendered page for status
 * badges: Test 3 "Status Accuracy" and W2 "Enum Integrity". Both select
 * `[data-reso-field="MlsStatus"]`.
 *
 * Every status badge in the CRM now emits `data-reso-field="StandardStatus"` — `MlsStatus` is provider-suppressed
 * on this feed (null on every row) and is not filterable, so the field map was repointed and the last `MlsStatus`
 * node was removed when the renderers were migrated to the shared status authority.
 *
 * The consequence is the worst kind of green: both scanners now match ZERO elements, iterate nothing, find no
 * violations and report PASS. A validator that checks nothing and passes is more dangerous than no validator,
 * because it is counted as coverage. This suite fails when a scanner's own selector cannot see a badge that the
 * real renderer really produced.
 *
 * It is behavioural, not a source grep: the selector strings are read out of the shipped scanner and then
 * EXECUTED against a DOM built by the shipped renderer. The assertion is on how many nodes each selector matched.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const COMPLIANCE = read('public/crm/js/compliance/compliance-gates-and-output.js');
const FIELD_MAP = read('public/crm/js/core/reso-field-map.js');

/** Every status-badge selector the shipped scanners use. */
function scannerStatusSelectors(): string[] {
  const out: string[] = [];
  const re = /querySelectorAll\((['"])(\[data-reso-field=(?:\\?["'])(?:MlsStatus|StandardStatus)(?:\\?["'])\][^'"]*)\1\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(COMPLIANCE)) !== null) out.push(m[2]);
  return out;
}

/** Render a real status badge through the shipped `resoData` helper and its real field map. */
function renderedBadgeDom(token: string) {
  const dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only' });
  const { window } = dom;
  // the real RESO_FIELD_MAP object and the real resoData() from the shipped file
  const mapSrc = FIELD_MAP.slice(FIELD_MAP.indexOf('var RESO_FIELD_MAP'), FIELD_MAP.indexOf('function resoData'));
  const fnStart = FIELD_MAP.indexOf('function resoData');
  let depth = 0, end = -1;
  for (let i = FIELD_MAP.indexOf('{', fnStart); i < FIELD_MAP.length; i++) {
    if (FIELD_MAP[i] === '{') depth++;
    else if (FIELD_MAP[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  window.eval(mapSrc + FIELD_MAP.slice(fnStart, end));
  const attrs = (window as unknown as { resoData: (f: string, v: string) => string }).resoData('status', token);
  window.document.getElementById('root')!.innerHTML = `<span class="badge"${attrs}>${token}</span>`;
  return window.document;
}

describe('the status badge the renderers emit is the one the scanners look for', () => {
  it('the shipped resoData maps "status" to the live StandardStatus field, not the suppressed MlsStatus', () => {
    const doc = renderedBadgeDom('Active');
    expect(doc.querySelectorAll('[data-reso-field="StandardStatus"]').length).toBe(1);
    expect(doc.querySelectorAll('[data-reso-field="MlsStatus"]').length).toBe(0);
  });

  it('every compliance scanner selector matches a real rendered badge (none may scan zero and pass)', () => {
    const selectors = scannerStatusSelectors();
    expect(selectors.length).toBeGreaterThan(0); // the scanners must still exist
    const doc = renderedBadgeDom('Active');
    const vacuous = selectors.filter((sel) => doc.querySelectorAll(sel.replace(/\\/g, '')).length === 0);
    expect({ vacuousSelectors: vacuous }).toEqual({ vacuousSelectors: [] });
  });

  it('no scanner selector still targets the suppressed MlsStatus field', () => {
    expect(scannerStatusSelectors().filter((s) => s.includes('MlsStatus'))).toEqual([]);
  });
});

describe('the scanners accept exactly the live status vocabulary', () => {
  /**
   * The scanners carry their own hardcoded `validStatuses` / `VS` arrays. Those still hold the retired uppercase
   * invention (ACTIVE, COMING_SOON, ACTIVE_UNDER_CONTRACT ...). A badge now renders the exact live token, so a
   * list that omits the live spellings would flag every correct badge, and one that keeps the retired words would
   * accept text no renderer can produce.
   */
  const LIVE = ['Active', 'ActiveUnderContract', 'Canceled', 'Closed', 'ComingSoon', 'Delete', 'Expired', 'Hold', 'Incomplete', 'Pending', 'Withdrawn'];

  it('each scanner vocabulary contains every live member', () => {
    const arrays = [...COMPLIANCE.matchAll(/var (?:validStatuses|VS) = (\[[^\]]*\])/g)].map((m) => m[1]);
    expect(arrays.length).toBeGreaterThan(0);
    const missing: Record<string, string[]> = {};
    arrays.forEach((raw, i) => {
      const gone = LIVE.filter((t) => !new RegExp(`['"]${t}['"]`).test(raw));
      if (gone.length) missing[`vocabulary#${i}`] = gone;
    });
    expect(missing).toEqual({});
  });

  it('the retired uppercase invention is gone from every scanner vocabulary', () => {
    // A two-L `Cancelled` IS allowed here and must stay: these arrays are the ACCEPTED-INPUT vocabulary, and a
    // cached or legacy-stored row can still carry that spelling. What must not survive is the uppercase
    // vocabulary the CRM invented (ACTIVE / COMING_SOON / ACTIVE_UNDER_CONTRACT ...). No renderer can produce it
    // any more, so accepting it would let a real regression pass the scanner unnoticed.
    const arrays = [...COMPLIANCE.matchAll(/var (?:validStatuses|VS) = (\[[^\]]*\])/g)].map((m) => m[1]);
    expect(arrays.length).toBeGreaterThan(0);
    const retired = /'(?:ACTIVE|PENDING|CLOSED|COMING_SOON|COMINGSOON|WITHDRAWN|EXPIRED|CANCELED|HOLD|INCOMPLETE|ACTIVE_UNDER_CONTRACT)'/;
    expect(arrays.filter((a) => retired.test(a))).toEqual([]);
  });
});
