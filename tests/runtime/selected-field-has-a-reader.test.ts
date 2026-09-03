/// <reference types="jest" />
/**
 * FETCHED_BUT_DISCARDED — every field asked for must be read by something.
 *
 * `SEARCH_SELECT_FIELDS` is what Mallan asks Cotality for on every authenticated
 * search. A field in that list that nothing reads is not free: it is bandwidth,
 * it is a field a future reader will assume is already handled, and — the part
 * that actually bites — it is indistinguishable from a field whose reader was
 * deleted or renamed. "We fetch it" quietly becomes "we support it".
 *
 * THE RESULT OF THE AUDIT IS A NEGATIVE ONE, and worth stating plainly: all 102
 * selected fields have a real code reader today. Nothing is being fetched and
 * thrown away. This file exists to keep that true, because the invariant is
 * cheap to hold and expensive to rediscover.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT "READ" MEANS HERE, and what it deliberately does not.
 *
 * A reader is one of the modules that turns a provider row into something
 * Mallan uses: the CRM mapper, the OData filter builder, the display gates, the
 * attribution/mapping layer, the checkbox registry, the sort contract.
 *
 * It does NOT mean "rendered in the Agent grid", and conflating the two would
 * produce exactly the wrong conclusion. Tenant-fee facts — MoveInCosts,
 * TenantPays, OngoingFees — legitimately bypass the grid while remaining
 * required for tenant-facing output and FARE Act disclosure. Calling them
 * discarded because a column does not show them would delete fields the law
 * requires.
 *
 * Comments are stripped before matching, so a field cannot be "read" by being
 * described in prose — the failure mode this codebase has hit twice.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const read = (p: string) => {
  try {
    return readFileSync(resolve(REPO, p), 'utf8');
  } catch {
    return '';
  }
};

/** Modules that turn a provider row into something Mallan uses. */
const READER_MODULES: Readonly<Record<string, string>> = Object.freeze({
  'lib/search/crm-idx-mapper.ts': 'provider row -> CRM listing shape',
  'lib/search/crm-idx-filter.ts': 'criteria -> OData clauses',
  'lib/compliance/gates.ts': 'distribution / display gate decisions',
  'lib/idx/trestle-mapper.ts': 'provider row -> canonical listing + gate wrapper',
  'lib/idx/mapping.ts': 'attribution and provider mapping',
  'lib/search/canonical/checkbox-criteria.ts': 'checkbox criterion registry',
  'lib/search/canonical/sort-contract.ts': 'canonical sort keys',
});

/** Source with comments removed — prose must never count as a reader. */
function codeOnly(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

function selectedFields(): string[] {
  const route = read('app/api/idx/search/route.ts');
  const start = route.indexOf('SEARCH_SELECT_FIELDS = [');
  expect(start).toBeGreaterThan(-1);
  const block = codeOnly(route.slice(start, route.indexOf('];', start)));
  return [...new Set([...block.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((m) => m[1]))];
}

const READERS = Object.keys(READER_MODULES).map((p) => codeOnly(read(p)));

/** Where a field is actually referenced, as a quoted key or property access. */
function readersOf(field: string): number {
  return READERS.filter(
    (src) =>
      src.includes(`"${field}"`) || src.includes(`'${field}'`) || src.includes(`.${field}`),
  ).length;
}

describe('nothing is fetched from Cotality and then discarded', () => {
  it('the select list is non-trivial — otherwise this guard proves nothing', () => {
    expect(selectedFields().length).toBeGreaterThan(50);
  });

  it('every selected field has at least one code reader', () => {
    // Fails BY FIELD NAME. Adding a field to the select list without a reader,
    // or deleting the last reader of one, fails here.
    const orphans = selectedFields().filter((f) => readersOf(f) === 0);
    expect(orphans).toEqual([]);
  });

  it('every declared reader module exists and is non-empty', () => {
    for (const [path, purpose] of Object.entries(READER_MODULES)) {
      expect(read(path).length).toBeGreaterThan(100);
      expect(purpose.length).toBeGreaterThan(10);
    }
  });
});

describe('the gate inputs are among the fields actually selected', () => {
  it.each(['Permission', 'InternetEntireListingDisplayYN', 'MlsStatus', 'CloseDate', 'StandardStatus'])(
    '%s is selected',
    (field) => {
      // A gate whose input is not fetched reads undefined and approves the row,
      // which is output indistinguishable from a gate that checked.
      expect(selectedFields()).toContain(field);
    },
  );
});

describe('grid invisibility is not evidence of discard', () => {
  it.each(['MoveInCosts', 'MoveInCostsAmount', 'TenantPays', 'OngoingFees'])(
    '%s is selected and read even though no Agent grid column shows it',
    (field) => {
      // These are tenant-facing and FARE Act relevant. Treating "not in the
      // grid" as "unused" would delete fields the law requires Mallan to carry.
      expect(selectedFields()).toContain(field);
      expect(readersOf(field)).toBeGreaterThan(0);
    },
  );
});
