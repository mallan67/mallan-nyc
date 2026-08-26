/// <reference types="jest" />
/**
 * A SERIALIZER THAT EDITS ITS INPUT.
 *
 * `buildIdxSearchParams(criteria)` reads a criteria object and returns wire
 * params. Its name says it builds params. It also did this:
 *
 *     delete criteria.checkboxFilters.SponsorUnit;
 *
 * The reason was legitimate. SponsorUnit is not a top-level OData property —
 * it lives inside CustomProperty.CustomFields — so it must not travel in the
 * generic `checkboxFilters` JSON, or the backend would try to filter a field
 * that is not there. Lifting it into its own `sponsorUnit` param is right.
 *
 * DELETING IT FROM THE CALLER'S OBJECT IS NOT. `_serverSearch` is handed the
 * module-level `activeSearchCriteria`, so the delete is permanent, and
 * everything downstream that reads that same object afterwards sees a search
 * the broker never described:
 *
 *   1. The broker ticks Sponsor Unit and runs the search.
 *   2. The serializer lifts it out and DELETES it from activeSearchCriteria.
 *   3. The broker clicks Save.
 *   4. Saved Search serialises `checkboxFilters` from that object — SponsorUnit
 *      is gone — and stores `sponsor_unit: c.sponsorUnit`, which is undefined
 *      because NOTHING ever sets `criteria.sponsorUnit`; the serializer set
 *      `params.sponsorUnit`, on a different object.
 *
 * Both carriers are empty, so the saved search silently drops the constraint
 * entirely and reloads as a BROADER search than the one that was saved. The
 * restore path in saved-searches.js that re-ticks the SponsorUnit checkbox
 * from `sponsor_unit` is dead for the same reason.
 *
 * This is the silent-widening family arriving through a side effect rather
 * than through a dropped field, which is why no transport invariant caught it:
 * every param was serialized correctly. The CRITERIA OBJECT was the casualty.
 *
 * Preserving the criterion is the whole fix. SponsorUnit is refused by the
 * route today (it needs a verified CustomProperty contract), so a saved search
 * carrying it fails closed and says so — which is the honest outcome, and the
 * opposite of quietly saving a different search.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const REPO = resolve(__dirname, '../..');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');

/** Pull the real serializer out of the engine IIFE and make it callable. */
function loadSerializer(): (criteria: any) => any {
  const start = engine.indexOf('window.buildIdxSearchParams = function');
  const end = engine.indexOf('\n        };', start);
  if (start === -1 || end === -1) throw new Error('serializer not found');
  const body = engine.slice(start, end + '\n        };'.length);
  const sandbox: Record<string, unknown> = {
    window: {} as any,
    console: { log() {}, warn() {}, error() {} },
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
  };
  sandbox.globalThis = sandbox;
  runInNewContext(body, sandbox);
  return (sandbox.window as any).buildIdxSearchParams;
}

const sponsorCriteria = () => ({
  searchTab: 'sale',
  bedsMin: 2,
  checkboxFilters: { SponsorUnit: ['true'], Cooling: ['true'] },
});

describe('the serializer leaves its input exactly as it found it', () => {
  it('does not delete SponsorUnit from the caller criteria', () => {
    // The precise defect. After this call the broker's own search object no
    // longer describes the search they ran.
    const criteria = sponsorCriteria();
    loadSerializer()(criteria);
    expect(criteria.checkboxFilters.SponsorUnit).toEqual(['true']);
  });

  it('leaves every other checkbox untouched too', () => {
    const criteria = sponsorCriteria();
    loadSerializer()(criteria);
    expect(criteria.checkboxFilters.Cooling).toEqual(['true']);
  });

  it('the criteria object is deep-equal to what went in', () => {
    // Broadest form of the guarantee: no future lift-and-strip may reintroduce
    // a mutation through some other key.
    const criteria = sponsorCriteria();
    const before = JSON.parse(JSON.stringify(criteria));
    loadSerializer()(criteria);
    expect(criteria).toEqual(before);
  });

  it('survives being serialized twice — the second call sees the same input', () => {
    // With the mutation in place, run #2 silently produced DIFFERENT params
    // from run #1 for an unchanged search.
    const build = loadSerializer();
    const criteria = sponsorCriteria();
    const first = build(criteria);
    const second = build(criteria);
    expect(second.sponsorUnit).toBe(first.sponsorUnit);
    expect(second.checkboxFilters).toBe(first.checkboxFilters);
  });
});

describe('the reason the delete existed is still honoured', () => {
  it('still lifts SponsorUnit into its own param', () => {
    const params = loadSerializer()(sponsorCriteria());
    expect(params.sponsorUnit).toBe('true');
  });

  it('still keeps SponsorUnit OUT of the checkboxFilters payload', () => {
    // This is what the delete was protecting: SponsorUnit is not a top-level
    // OData property, so the backend must never receive it in the generic
    // checkbox JSON. Copying instead of deleting keeps that true.
    const params = loadSerializer()(sponsorCriteria());
    expect(JSON.parse(params.checkboxFilters)).toEqual({ Cooling: ['true'] });
  });

  it('sends no checkboxFilters at all when SponsorUnit was the only one', () => {
    // Removing the sole key must leave an EMPTY object, which the serializer
    // already declines to send — not a `{}` payload the server must interpret.
    const params = loadSerializer()({
      searchTab: 'sale',
      checkboxFilters: { SponsorUnit: ['true'] },
    });
    expect(params.checkboxFilters).toBeUndefined();
    expect(params.sponsorUnit).toBe('true');
  });

  it('does not set sponsorUnit when the box is not ticked', () => {
    const params = loadSerializer()({
      searchTab: 'sale',
      checkboxFilters: { Cooling: ['true'] },
    });
    expect(params.sponsorUnit).toBeUndefined();
    expect(JSON.parse(params.checkboxFilters)).toEqual({ Cooling: ['true'] });
  });
});

describe('the served artifact carries the non-mutating serializer', () => {
  it('no delete of a caller criteria key survives INSIDE THE SERIALIZER', () => {
    // SCOPED TO THE SERIALIZER ON PURPOSE.
    //
    // `delete criteria.X` is not wrong everywhere. collectSearchCriteria()
    // CONSTRUCTS the criteria object and deletes keys whose parseInt came back
    // NaN — deleting from an object you just built is local cleanup, and
    // ownership is exactly what makes a delete safe or unsafe. Banning the
    // pattern file-wide would forbid the legitimate use and teach the next
    // contributor the wrong rule.
    //
    // What must never happen is a function EDITING AN OBJECT IT WAS HANDED.
    const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');
    for (const src of [engine, built]) {
      const start = src.indexOf('window.buildIdxSearchParams = function');
      expect(start).toBeGreaterThan(-1);
      const body = src.slice(start, src.indexOf('\n        };', start));
      const code = body
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(code).not.toMatch(/delete criteria\./);
    }
  });
});
