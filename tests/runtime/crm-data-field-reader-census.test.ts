/// <reference types="jest" />
/**
 * THE `data-field` READER GRAPH, FROZEN BY PURPOSE.
 *
 * `data-field` is NOT a Search-criterion attribute. It is an attribute name that
 * several unrelated subsystems happen to share:
 *
 *   - the generic Search checkbox/select scanner
 *   - dedicated Search readers for MlsStatus, CommonInterest, PropertySubType,
 *     each of which already owns its own canonical contract
 *   - Saved Search restore
 *   - the dead/unverified-control disabling guard
 *   - compliance diagnostics (prohibited-field detection, MlsStatus checks)
 *   - grid-layouts.js, where `data-field` is a RESULT-COLUMN ID and has nothing
 *     to do with Search criteria at all
 *
 * Re-keying all 425 occurrences to a canonical criterion name would therefore
 * have broken grid configuration, compliance diagnostics and the disable guard
 * while "canonicalising Search". The migration is additive
 * (`data-criterion` alongside `data-field`) precisely because of this graph.
 *
 * This test does NOT freeze an occurrence count — counts churn for innocent
 * reasons. It freezes the thing that matters: EVERY reader has a known owner
 * and purpose, and a Search migration cannot silently reach into a non-Search
 * namespace.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const CRM_JS = join(REPO, 'public/crm/js');

type Purpose =
  | 'SEARCH_GENERIC_CRITERION_READER'
  | 'SEARCH_DEDICATED_READER'
  | 'SAVED_SEARCH_RESTORE'
  | 'DEAD_CONTROL_GUARD'
  | 'COMPLIANCE_READER'
  | 'GRID_LAYOUT_NON_SEARCH';

/** Every file permitted to read `data-field`, and why. */
const READER_PURPOSE: Readonly<Record<string, { purpose: Purpose; note: string }>> = Object.freeze({
  'search/search-engine.js': {
    purpose: 'SEARCH_GENERIC_CRITERION_READER',
    note:
      'Generic checked-input and select[data-field] scanners, PLUS dedicated ' +
      'readers for MlsStatus / CommonInterest / PropertySubType. The dedicated ' +
      'three must keep their own identity — they must not fall through to the ' +
      'generic engine because a lookup order changed.',
  },
  'search/saved-searches.js': {
    purpose: 'SAVED_SEARCH_RESTORE',
    note: 'Locates controls when restoring a stored record.',
  },
  'search/cotality-criteria-boundary.js': {
    purpose: 'SEARCH_DEDICATED_READER',
    note: 'Disables data-sub-status controls that are not live StandardStatus members.',
  },
  'init/init-disable-dead-controls.js': {
    purpose: 'DEAD_CONTROL_GUARD',
    note:
      'Disables controls with no verified contract. Depends on data-field, ' +
      'data-value, data-not and data-sub-status together; re-keying any of them ' +
      'would silently re-enable an unverified control.',
  },
  'compliance/compliance-gates-and-output.js': {
    purpose: 'COMPLIANCE_READER',
    note:
      'Prohibited-field detection and MlsStatus diagnostics. Reads data-field ' +
      'as a COMPLIANCE surface, not as a Search criterion.',
  },
  'render/grid-layouts.js': {
    purpose: 'GRID_LAYOUT_NON_SEARCH',
    note:
      'NEGATIVE CONTROL. Here data-field carries a RESULT-COLUMN ID, a wholly ' +
      'different namespace. It must never receive a Search data-criterion.',
  },
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

function readersOfDataField(): string[] {
  return walk(CRM_JS)
    .filter((f) => readFileSync(f, 'utf8').includes('data-field'))
    .map((f) => f.replace(/\\/g, '/').split('public/crm/js/')[1])
    .sort();
}

describe('every data-field reader has a declared purpose', () => {
  it('no reader exists without an owner', () => {
    // Fails BY FILE. A new subsystem reading data-field must declare what it
    // means by it before the Search migration can be reasoned about.
    const undeclared = readersOfDataField().filter((f) => !(f in READER_PURPOSE));
    expect(undeclared).toEqual([]);
  });

  it('no declared reader has silently disappeared', () => {
    const actual = new Set(readersOfDataField());
    const stale = Object.keys(READER_PURPOSE).filter((f) => !actual.has(f));
    expect(stale).toEqual([]);
  });

  it('every declared purpose carries a reason', () => {
    for (const [file, entry] of Object.entries(READER_PURPOSE)) {
      expect(entry.note.length).toBeGreaterThan(20);
      expect(file).toBeTruthy();
    }
  });
});

describe('the non-Search namespace stays out of Search canonicalisation', () => {
  const gridSrc = readFileSync(join(CRM_JS, 'render/grid-layouts.js'), 'utf8');

  it('grid-layouts never emits a Search data-criterion', () => {
    // The whole reason the migration is additive rather than a rename.
    expect(gridSrc).not.toMatch(/data-criterion/);
  });

  it('grid-layouts data-field is a column id, not a provider field', () => {
    expect(gridSrc).toMatch(/data-field="' \+ field\.id/);
  });
});

describe('dedicated Search contracts keep their own identity', () => {
  const engine = readFileSync(join(CRM_JS, 'search/search-engine.js'), 'utf8');

  it.each(['MlsStatus', 'CommonInterest', 'PropertySubType'])(
    '%s still has a dedicated reader',
    (field) => {
      expect(engine).toContain(`data-field="${field}"`);
    },
  );

  it('the generic scanner still skips the dedicated three', () => {
    // If these fell through to the generic engine they would be canonicalised
    // twice, by two different contracts.
    const handled = engine.match(/_handledFields[^;]*;/s)?.[0] ?? '';
    for (const field of ['MlsStatus', 'CommonInterest', 'PropertySubType']) {
      expect(handled).toContain(field);
    }
  });
});
