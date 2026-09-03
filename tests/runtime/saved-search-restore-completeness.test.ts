/// <reference types="jest" />
/**
 * RESTORE_INCOMPLETE — the last boundary in the silent-widening family.
 *
 * Persistence is canonical now, and the server refuses to store or auto-run a
 * record whose meaning cannot be represented. None of that helps if the FORM
 * quietly loses a criterion on the way back in. A search that runs with fewer
 * criteria than were saved is broader than the one the broker saved — the same
 * defect, arriving at the last hop.
 *
 * The restore path used to do:
 *
 *     if (cb && !cb.disabled) cb.checked = true;
 *
 * so a missing control, a missing value option, or a DISABLED control was
 * silently skipped, and loadSavedSearch() ran the search anyway. A malformed
 * stored value was swallowed by a catch that explicitly said "silently skip".
 *
 * Every one of those now records a named issue and BLOCKS execution.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const saved = readFileSync(join(REPO, 'public/crm/js/search/saved-searches.js'), 'utf8');
const built = readFileSync(join(REPO, 'public/crm/index-built.html'), 'utf8');

describe('restore failures are recorded, never skipped', () => {
  it.each([
    ['no control for this criterion', /no control for this criterion/],
    ['no matching option for a value', /no matching option/],
    ['a disabled control', /control is disabled/],
    ['a non-list stored value', /stored value is not a list/],
    ['an unreadable stored value', /unreadable stored value/],
    ['no active form to restore into', /no active form to restore into/],
  ])('%s is reported', (_label, pattern) => {
    expect(saved).toMatch(pattern);
  });

  it('the old silent-skip guard is gone', () => {
    // Matched as CODE, not prose: the corrected source deliberately quotes the
    // old line inside a comment explaining what was wrong, and that must not
    // trip the guard. A test that greps its own explanation is not a test.
    const code = saved
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith(String.fromCharCode(47, 47)))
      .join(String.fromCharCode(10));
    expect(code).not.toMatch(/if \(cb && !cb\.disabled\) cb\.checked = true;/);
  });

  it('the catch no longer says "silently skip"', () => {
    expect(saved).not.toMatch(/silently skip restore/);
  });
});

describe('execution is blocked when restore is incomplete', () => {
  it('loadSavedSearch returns before performSearch when issues exist', () => {
    const block = saved.slice(saved.indexOf('var restoreIssues'), saved.indexOf('performSearch();'));
    expect(block).toMatch(/if \(restoreIssues\.length\)/);
    expect(block).toMatch(/return;/);
  });

  it('the agent is told WHICH criteria could not be restored', () => {
    expect(saved).toMatch(/could not be restored/);
    expect(saved).toMatch(/restoreIssues\.join/);
  });

  it('a missing server disposition still blocks, independently', () => {
    // Two separate gates: the server's criteria_status AND local restore
    // completeness. Either one failing must stop execution.
    expect(saved).toMatch(/status !== 'executable'/);
    const code = saved
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith(String.fromCharCode(47, 47)))
      .join(String.fromCharCode(10));
    expect(code).not.toMatch(/criteria_status \|\| 'executable'/);
  });
});

describe('restore resolves by canonical criterion first', () => {
  it('prefers data-criterion and falls back to legacy data-field', () => {
    expect(saved).toMatch(/input\[data-criterion="/);
    expect(saved).toMatch(/input\[data-field="/);
  });

  it('introduces no JavaScript provider-name map', () => {
    // The server canonical registry is the provider-name authority. A
    // `view -> View` table here would be a second one.
    expect(saved).not.toMatch(/['"]view['"]\s*:\s*['"]View['"]/);
    expect(saved).not.toMatch(/CANONICAL_BY_LEGACY/);
  });
});

describe('the served artifact carries the same contract', () => {
  it('restore-incompleteness gating is in the built shell', () => {
    expect(built).toMatch(/could not be restored/);
    expect(built).toMatch(/if \(restoreIssues\.length\)/);
  });

  it('data-criterion parity between source and artifact', () => {
    const src = readFileSync(join(REPO, 'public/crm/html/search-form-and-results.html'), 'utf8');
    const count = (s: string) => (s.match(/data-criterion="[a-z_]+"/g) || []).length;
    expect(count(built)).toBe(count(src));
    expect(count(src)).toBeGreaterThan(0);
  });
});
