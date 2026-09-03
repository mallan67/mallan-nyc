/// <reference types="jest" />
/**
 * THE MAP WAS A COUNTEREXAMPLE TO EVERYTHING ELSE.
 *
 * MAPPED_BUT_RENDERER_UNSAFE was fixed in the grid, the dashboard and the
 * report package. `results-map.js` still did all of it:
 *
 *     price: l.price || l.listPrice || 0
 *     beds:  l.beds  || l.bedroomsTotal || 0
 *     baths: l.baths || l.bathroomsFull || 0
 *     if (!p) return '$0'
 *
 * so an unknown listing drew a pin reading "$0" and a popup reading "0 bd · 0
 * ba". The middle keys were dead — nothing in this repo emits listPrice,
 * bedroomsTotal or bathroomsFull — and `||` is the wrong operator regardless,
 * because a real 0-bedroom studio is falsy.
 *
 * It also compared `status === 'ACTIVE_UNDER_CONTRACT'`, which is not a
 * StandardStatus member, so that branch never matched and every status except
 * ComingSoon rendered in one colour — Closed, Withdrawn and Expired included.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND ONE DEFECT OF MY OWN. `refreshMapPins` read `getFilteredListings(true)`,
 * which returns `searchResultsState.filteredListings` — and since pagination
 * became a real server round trip, that is ONE PAGE. So the 500-row map
 * universe I added was fetched, stored, and then ignored by the only surface it
 * exists to serve: the pins had already collapsed to the visible rows.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const REPO = resolve(__dirname, '../..');
const map = readFileSync(resolve(REPO, 'public/crm/js/render/results-map.js'), 'utf8');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

/** Execute one of the map's small formatters for real. */
function runFormatter(name: 'fmtPrice' | 'fmtCount', value: unknown): string {
  const start = map.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const CLOSE = '\n  }';
  const body = map.slice(start, map.indexOf(CLOSE, start) + CLOSE.length);
  const sandbox: Record<string, unknown> = { Number, isNaN, String, Math, V: value };
  sandbox.globalThis = sandbox;
  return runInNewContext(`${body};${name}(V);`, sandbox) as string;
}

describe('the map no longer fabricates money', () => {
  it.each([null, undefined, ''])('%p renders as unknown', (v) => {
    expect(runFormatter('fmtPrice', v)).toBe('—');
  });

  it('a real zero is still $0', () => {
    expect(runFormatter('fmtPrice', 0)).toBe('$0');
  });

  it('ordinary prices are unaffected', () => {
    expect(runFormatter('fmtPrice', 1_250_000)).toBe('$1.3M');
    expect(runFormatter('fmtPrice', 4500)).toBe('$5K');
  });
});

describe('the map no longer fabricates bed and bath counts', () => {
  it.each([null, undefined, ''])('%p renders as unknown', (v) => {
    expect(runFormatter('fmtCount', v)).toBe('—');
  });

  it('a studio really does have 0 bedrooms', () => {
    // The case `||` got wrong even for present values.
    expect(runFormatter('fmtCount', 0)).toBe('0');
  });

  it('ordinary counts pass through', () => {
    expect(runFormatter('fmtCount', 3)).toBe('3');
  });
});

describe('the fabricating expressions are gone from the source', () => {
  const code = map
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');

  it.each([
    ['price', /price: l\.price \|\| l\.listPrice \|\| 0/],
    ['beds', /beds: l\.beds \|\| l\.bedroomsTotal \|\| 0/],
    ['baths', /baths: l\.baths \|\| l\.bathroomsFull \|\| 0/],
  ])('%s is no longer zero-defaulted', (_label, pattern) => {
    expect(code).not.toMatch(pattern);
  });

  it('the popup renders counts through the formatter', () => {
    expect(code).toMatch(/fmtCount\(p\.beds\)/);
    expect(code).toMatch(/fmtCount\(p\.baths\)/);
  });
});

describe('the status token is the canonical RESO spelling', () => {
  it('the dead ACTIVE_UNDER_CONTRACT branch is gone', () => {
    const code = map
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/ACTIVE_UNDER_CONTRACT/);
    expect(code).toMatch(/status === 'ActiveUnderContract'/);
  });

  it('an unknown status keeps the mapper’s readable token', () => {
    const code = map
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    expect(code).toMatch(/status: l\.status \|\| 'UNKNOWN'/);
  });
});

describe('an approximate position is visible as approximate', () => {
  it('the approx flag reaches the marker', () => {
    // It was computed and then never passed, so a centroid-placed pin looked
    // exactly like one at a real address. Provider Latitude/Longitude are null
    // on every live row, so in practice that is most pins.
    expect(map).toMatch(/function createMarkerEl\(price, status, approx\)/);
    expect(map).toMatch(/createMarkerEl\(f\.properties\.price, f\.properties\.status, f\.properties\.approx\)/);
    expect(map).toMatch(/createMarkerEl\(p\.price, p\.status, p\.approx\)/);
  });

  it('and is shown, not merely known', () => {
    expect(map).toMatch(/borderStyle = 'dashed'/);
    expect(map).toMatch(/Approximate location/);
  });
});

describe('the pins read the MAP universe, not the current page', () => {
  it('refreshMapPins prefers mapListings', () => {
    // My own defect: the 500-row read was fetched, stored, and ignored by the
    // one surface it exists for.
    const start = map.indexOf('THE PINS READ THE MAP UNIVERSE');
    expect(start).toBeGreaterThan(-1);
    const block = map.slice(start, start + 900);
    expect(block).toMatch(/searchResultsState\.mapListings/);
    expect(block).toMatch(/getFilteredListings\(true\)/); // fallback retained
  });
});

describe('partial coverage is derived from server truth and disclosed', () => {
  it('partiality is not a comparison of two numbers', () => {
    // `count.value > listings.length` reports NOT partial whenever the two
    // happen to be equal, even when exhaustion was never proven.
    const start = engine.indexOf("PARTIAL IS DECIDED BY THE SERVER'S TRUTH");
    expect(start).toBeGreaterThan(-1);
    const block = engine.slice(start, start + 900);
    expect(block).toMatch(/isExact === false/);
    expect(block).toMatch(/PROVIDER_EXHAUSTED/);
    expect(block).not.toMatch(/count\.value > mapResult\.listings\.length/);
  });

  it('a neighbourhood count from a sample is qualified rather than stated flatly', () => {
    // "how many we loaded here" is a different claim from "how many are here".
    expect(map).toMatch(/mapIsPartial/);
    expect(map).toMatch(/_partial \? '\+' : ''/);
    expect(map).toMatch(/_partial \? ' loaded' : ''/);
  });
});

describe('the served artifact carries all of it', () => {
  it('the built shell has the corrected map', () => {
    expect(built).not.toMatch(/price: l\.price \|\| l\.listPrice \|\| 0/);
    expect(built).toMatch(/status === 'ActiveUnderContract'/);
    expect(built).toMatch(/function fmtCount\(/);
  });
});
