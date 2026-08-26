/// <reference types="jest" />
/**
 * CONTROLS WHOSE VALUE NOTHING CAN DECODE.
 *
 * Some checkboxes carry a value that is not a provider value at all. It is a
 * little expression the form invented:
 *
 *   data-value="lte:1946"   Pre-War
 *   data-value="gte:1947"   Post-War
 *   data-value="lte:6"      Low-Rise
 *   data-value="eq:0"       No Financing
 *   data-value="gt:0"       Financing Available
 *   data-value="Any"        a parent stand-in for a group of children
 *   data-not="PiedATerreAllowed"   a NEGATION the scanner never reads
 *
 * Nothing decodes any of it. The generic scanner reads `data-value` verbatim
 * and hands it on as a criterion value, so `lte:1946` would travel as the
 * literal string `lte:1946`, and `data-not` never travels at all — the broker
 * ticks "No Pied-A-Terre" and sends nothing, which is not a narrower search,
 * it is no search.
 *
 * `init-disable-dead-controls.js` disables every one of them, which is the
 * right answer: a control that cannot express its own question should not be
 * clickable. But that guard is a hand-written selector list and NOTHING
 * checked it against the form. Add one more `lte:` preset tomorrow, or edit a
 * selector, and the control silently becomes live again — carrying a value no
 * layer can interpret.
 *
 * This pins the coverage in both directions, derived from source on both
 * sides so it cannot drift:
 *
 *   - every undecodable control the SERVED form ships is matched by the guard
 *   - the guard still carries a selector for each undecodable SHAPE
 *
 * NOTE ON THE BACKEND, because the guard's own comment is out of date and the
 * difference matters: the backend no longer builds `Field eq 'lte:1946'` and
 * returns a silent zero. Unregistered criteria are refused BY NAME. So these
 * controls are belt AND braces now — disabled in the UI, and refused loudly if
 * they ever reach the server anyway. Neither one alone is why they are safe.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');
const guard = readFileSync(
  resolve(REPO, 'public/crm/js/init/init-disable-dead-controls.js'),
  'utf8',
);

/** The operator prefixes the form uses to smuggle a comparison into a value. */
const OPERATOR_PREFIXES = ['lte:', 'gte:', 'gt:', 'eq:'];

/** Every `<input>` tag in the served shell. */
const inputs = built.match(/<input[^>]*>/g) || [];

/** Inputs whose value is an expression rather than a provider value. */
function undecodableInputs(): { tag: string; reason: string }[] {
  const found: { tag: string; reason: string }[] = [];
  for (const tag of inputs) {
    const value = tag.match(/data-value="([^"]*)"/)?.[1];
    if (value) {
      const op = OPERATOR_PREFIXES.find((p) => value.startsWith(p));
      if (op) found.push({ tag, reason: `operator prefix ${op}` });
      else if (value === 'Any') found.push({ tag, reason: 'Any placeholder' });
    }
    if (/data-not="/.test(tag)) found.push({ tag, reason: 'data-not negation' });
  }
  return found;
}

/** Does the guard's selector list cover this tag? */
function guardCovers(tag: string): boolean {
  const value = tag.match(/data-value="([^"]*)"/)?.[1];
  if (value) {
    for (const p of OPERATOR_PREFIXES) {
      if (value.startsWith(p) && guard.includes(`data-value^="${p}"`)) return true;
    }
    if (value === 'Any' && guard.includes('data-value="Any"')) return true;
  }
  if (/data-not="/.test(tag) && guard.includes('data-not')) return true;
  return false;
}

describe('every undecodable control is disabled', () => {
  it('the form actually still ships some — otherwise this guard is vacuous', () => {
    // A coverage test that finds nothing to cover passes for the wrong reason.
    expect(undecodableInputs().length).toBeGreaterThan(0);
  });

  it('no undecodable control escapes the disable guard', () => {
    // Fails with the offending TAG, so the specific control is identifiable.
    const escaped = undecodableInputs()
      .filter((i) => !guardCovers(i.tag))
      .map((i) => `${i.reason}: ${i.tag.slice(0, 120)}`);
    expect(escaped).toEqual([]);
  });
});

describe('the guard still covers every undecodable shape', () => {
  it.each(OPERATOR_PREFIXES)('carries a selector for %s', (prefix) => {
    // The other direction: a selector deleted from the guard must fail here
    // even if no control currently uses that prefix, because the next one to
    // ship would arrive live.
    expect(guard).toContain(`data-value^="${prefix}"`);
  });

  it('carries a selector for the Any placeholder', () => {
    expect(guard).toContain('data-value="Any"');
  });

  it('handles data-not negations', () => {
    expect(guard).toMatch(/data-not/);
  });
});

describe('the presets encode a boundary no provider defined', () => {
  it('Pre-War / Post-War split on 1946/1947, which is a Mallan claim', () => {
    // Recorded, not fixed. YearBuilt itself is FILTERABLE (459,044 at ge 1900)
    // and reachable as a numeric range through minYear/maxYear. What has no
    // provider fact behind it is the BOUNDARY: nothing in the feed says a
    // pre-war building is one built in 1946 or earlier. Re-enabling these
    // presets means adopting that year as a Mallan definition, deliberately,
    // not decoding a value the provider already understands.
    const values = inputs
      .map((t) => t.match(/data-value="([^"]*)"/)?.[1])
      .filter((v): v is string => !!v);
    expect(values).toEqual(expect.arrayContaining(['lte:1946', 'gte:1947']));
  });
});
