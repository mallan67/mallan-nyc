/**
 * ONE DATE AUTHORITY — PROVEN FROM A BROWSER THAT IS NOT IN NEW YORK.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * Two implementations answered "this weekend":
 *
 *   server   lib/search/open-house-window.ts        America/New_York
 *   browser  setOpenHouseDatePreset()               the USER'S clock, getDay()
 *
 * and the browser's answer won, because it sent the computed bounds as
 * `openHouseDateFrom` / `openHouseDateTo`. The server received a preset search
 * as a CUSTOM range, so its own resolver never ran.
 *
 * On a laptop set to New York the two agree by luck. On a machine in London, in
 * Los Angeles, or on any CI runner in UTC, they do not — and the disagreement
 * is invisible, because a wrong window still returns listings.
 *
 * A NYC brokerage searches NYC days. Where the broker's laptop happens to be
 * is not a business input.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THESE TESTS PIN
 *
 * The browser sends a TOKEN and no dates. The server resolves the token. There
 * is therefore exactly one implementation of "this weekend" that can execute,
 * and these tests fail if a second one reappears.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveOpenHouseWindow } from '../../lib/search/open-house-window';

const ROOT = resolve(__dirname, '../../');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('a preset travels as a token, and the dates stay home', () => {
  const src = read('public/crm/js/search/search-engine.js');

  it('sends `openHouse` when a preset is active', () => {
    expect(src).toMatch(/params\.openHouse = _ohPreset/);
  });

  it('sends the explicit bounds ONLY when no preset is active', () => {
    // The else-branch is the whole point: bounds alongside a token would be a
    // second opinion the server would have to arbitrate between.
    const block = src.slice(src.indexOf('var _ohPreset'));
    const scoped = block.slice(0, block.indexOf('_transitBounds'));
    expect(scoped).toMatch(/if \(_ohPreset\) \{[\s\S]*?\} else \{[\s\S]*?openHouseDateFrom/);
  });

  it('the token is forwarded on the wire, not dropped in transport', () => {
    const client = read('public/crm/js/core/api-client.js');
    expect(client).toMatch(/params\.openHouse\b/);
    expect(client).toMatch(/'openHouse=' \+ encodeURIComponent\(params\.openHouse\)/);
  });
});

describe('the criterion is actually COLLECTED — it never was before', () => {
  const src = read('public/crm/js/search/search-engine.js');

  it('an open_house adapter exists, so the pickers are read at all', () => {
    // Nothing wrote criteria.openHouseDateFrom anywhere in the codebase. The
    // controls were disabled, so no test noticed the criterion had no
    // collector. Enabling the buttons without this adapter would have shipped a
    // control that visibly does something and searches nothing.
    expect(src).toMatch(/open_house: \{ kind: 'dateRange'/);
    expect(src).toMatch(/drp: \{ sale: 'saleOpenHouse', rent: 'rentalOpenHouse' \}/);
  });

  it('the canonical criterion is bridged to the keys the serializer reads', () => {
    expect(src).toMatch(/open_house:\s*\{ min: 'openHouseDateFrom', max: 'openHouseDateTo', preset: 'openHousePreset' \}/);
  });
});

describe('the token vocabulary has exactly one definition', () => {
  const helpers = read('public/crm/js/search/form-ui-helpers.js');

  it('legacy button labels normalise to the canonical tokens in ONE table', () => {
    expect(helpers).toMatch(/CANONICAL_OH_PRESET/);
    expect(helpers).toMatch(/'7days': 'next7'/);
    expect(helpers).toMatch(/'30days': 'next30'/);
  });

  it('every token the browser can emit is one the server accepts', () => {
    const table = helpers.slice(helpers.indexOf('CANONICAL_OH_PRESET'));
    const tokens = new Set(
      [...table.slice(0, table.indexOf('};')).matchAll(/:\s*'([a-z0-9]+)'/g)].map((m) => m[1]),
    );
    expect(tokens.size).toBeGreaterThan(0);
    for (const t of tokens) {
      // Throws OpenHouseWindowError on an unknown preset, which is exactly the
      // failure this asserts cannot happen.
      expect(() => resolveOpenHouseWindow({ preset: t as never, now: new Date('2026-09-07T16:00:00Z') }))
        .not.toThrow();
    }
  });

  it('choosing dates by hand clears the token', () => {
    // A stale token would keep overriding a range the broker explicitly set.
    const picker = read('public/crm/js/search/date-range-picker.js');
    expect(picker).toMatch(/removeAttribute\('data-oh-preset'\)/);
    expect(helpers).toMatch(/removeAttribute\('data-oh-preset'\)/);
  });
});

describe('the NYC day is the same day whatever the browser thinks', () => {
  // The server resolver is timezone-explicit, so the SAME instant resolves to
  // the SAME New York window no matter what TZ the process is running in.
  // These run the resolver under hostile timezones to prove it.
  const HOSTILE = ['UTC', 'Europe/London', 'America/Los_Angeles', 'Asia/Tokyo'];
  const INSTANT = new Date('2026-09-05T01:30:00Z'); // 21:30 Friday in New York

  it.each(HOSTILE)('TZ=%s still resolves the New York day', (tz) => {
    const prev = process.env.TZ;
    try {
      process.env.TZ = tz;
      const w = resolveOpenHouseWindow({ preset: 'today', now: INSTANT });
      // 01:30 UTC Saturday is still FRIDAY in New York. A browser in Tokyo
      // would have called this Saturday and hidden Friday's open houses.
      expect(w).toEqual({ from: '2026-09-04', to: '2026-09-04' });
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });

  it.each(HOSTILE)('TZ=%s resolves the same WEEKEND', (tz) => {
    const prev = process.env.TZ;
    try {
      process.env.TZ = tz;
      // Friday evening New York -> the weekend that starts tomorrow.
      expect(resolveOpenHouseWindow({ preset: 'weekend', now: INSTANT }))
        .toEqual({ from: '2026-09-05', to: '2026-09-06' });
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});

describe('the executed window is reported back, so UI and server can be compared', () => {
  it('the search response carries the window that actually ran', () => {
    const route = read('app/api/idx/search/route.ts');
    expect(route).toMatch(/openHouseWindow: executedOpenHouseWindow/);
    expect(route).toMatch(/executedOpenHouseWindow = \{ from: window\.from, to: window\.to/);
  });
});
