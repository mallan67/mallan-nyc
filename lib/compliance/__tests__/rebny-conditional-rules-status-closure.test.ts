/// <reference types="jest" />
/**
 * REBNY CONDITIONAL-RULE STATUS CLOSURE — `lib/compliance/rebny-field-tables.ts`
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE (proven by execution, 2026-08-20) ──────
 *
 * `REBNY_FIELD_TABLES.conditionalRules` is consumed by
 * `assertRlsCompliantPayload` (`lib/compliance/rls-enforcement.ts` §8), which
 * evaluates each rule's `appliesWhen` with `conditionMatches` — literally
 * `expected.includes(actual)` against the CALLER-SUPPLIED payload. Every
 * `MlsStatus` list in this table is therefore a LIVE, EXACT-CASE predicate over
 * an untrusted client string, not a vocabulary declaration.
 *
 * Rule `CANCELLED-001` ("Cancelled requires CancellationDate", BLOCKER) listed
 * only the PROVIDER spelling `Canceled`. The Mallan CRM's canonical cancel value
 * is `Cancelled` (double L — `lib/crm/status-mapping.ts` `CANONICAL_STATUSES`),
 * and `public/crm/SALE-FORM-REDESIGN.html` emits exactly that:
 *
 *     CRM_TO_RESO_STATUS = { …, 'Cancelled': 'Cancelled', … }   (line 8584)
 *     data.MlsStatus = getResoMlsStatus(data.saleStatus)          (line 7429)
 *
 * so the payload POSTed to `/api/crm/listings` carries `MlsStatus:'Cancelled'`.
 * Measured against the pre-fix tree, with `OffMarketDate` present (the sale form
 * does collect that one) and no `CancellationDate`:
 *
 *     'Canceled'  => [{ code:'CF-CANCELLED-001', field:'CancellationDate' }]
 *     'Cancelled' => []                       <-- BLOCKER NEVER RAISED
 *
 * i.e. the one spelling that actually reaches the gate is the one it ignores.
 *
 * ── SCOPE OF THE AUDIT ────────────────────────────────────────────────────
 * `CANCELLED-001` was not fixed alone. The whole exported table is audited
 * MECHANICALLY below — every array and every object-key set reachable from
 * `REBNY_FIELD_TABLES`, at runtime, by value — so a non-closed status literal
 * anywhere in the file fails here regardless of how it is formatted or which
 * section it hides in. Hand-reading 1,419 lines is what missed this rule the
 * first time; the machine does not get bored 24 lines above a fixed one.
 */
import {
  ALL_MODELLED_STATUSES,
  STATUS_SPELLING_CLASSES,
  withStatusSpellings,
} from '@/lib/compliance/listing-status-vocabulary';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';

type Rule = {
  code: string;
  description: string;
  appliesWhen: Record<string, unknown>;
  requireFields: readonly string[];
};

const RULES = REBNY_FIELD_TABLES.conditionalRules as ReadonlyArray<Rule>;

/** Rules whose `appliesWhen` keys on a status value at all. */
const STATUS_KEYED_RULES = RULES.filter((r) =>
  Object.entries(r.appliesWhen).some(([, v]) =>
    (Array.isArray(v) ? v : [v]).some((x) => typeof x === 'string' && ALL_MODELLED_STATUSES.has(x)),
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
// 1. DIRECT — the named defect, at the public entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The exact shape `public/crm/SALE-FORM-REDESIGN.html` submits when an agent
 * cancels a sale listing: `OffMarketDate` filled (the form shows and requires
 * that field for Cancelled), `CancellationDate` absent (the form has no such
 * input at all — grep: zero hits in `public/crm/**`).
 */
function cancelPayload(spelling: string, extra: Record<string, unknown> = {}) {
  return { MlsStatus: spelling, OffMarketDate: '2026-08-01', ListPrice: 1_000_000, ...extra };
}

function codesFor(payload: Record<string, unknown>): string[] {
  return assertRlsCompliantPayload(payload, { listingType: 'sale' })
    .blockers.map((b) => b.code)
    .sort();
}

describe('CF-CANCELLED-001 fires for every spelling of the cancel class', () => {
  const CANCEL_CLASS = STATUS_SPELLING_CLASSES.find((c) => c.members.includes('Canceled'));

  it('the cancel spelling class is declared (guards the rest of this file)', () => {
    expect(CANCEL_CLASS?.members).toEqual(expect.arrayContaining(['Canceled', 'Cancelled']));
  });

  for (const spelling of ['Canceled', 'Cancelled']) {
    it(`'${spelling}' + no CancellationDate => CF-CANCELLED-001 BLOCKER`, () => {
      const blockers = assertRlsCompliantPayload(cancelPayload(spelling), {
        listingType: 'sale',
      }).blockers.filter((b) => b.code === 'CF-CANCELLED-001');

      expect({ spelling, blockers: blockers.map((b) => ({ code: b.code, field: b.field, severity: b.severity })) }).toEqual({
        spelling,
        blockers: [{ code: 'CF-CANCELLED-001', field: 'CancellationDate', severity: 'BLOCKER' }],
      });
    });
  }

  it('both spellings produce the IDENTICAL blocker-code set (no other rule diverges)', () => {
    expect(codesFor(cancelPayload('Cancelled'))).toEqual(codesFor(cancelPayload('Canceled')));
  });

  // ── NEGATIVE CONTROLS: the rule must not become a blanket blocker ──
  for (const spelling of ['Canceled', 'Cancelled']) {
    it(`'${spelling}' WITH CancellationDate => CF-CANCELLED-001 not raised`, () => {
      const codes = codesFor(cancelPayload(spelling, { CancellationDate: '2026-08-01' }));
      expect({ spelling, raised: codes.includes('CF-CANCELLED-001') }).toEqual({ spelling, raised: false });
    });
  }

  it('a NON-cancel status never raises CF-CANCELLED-001', () => {
    for (const s of ['Active', 'ComingSoon', 'Pending', 'Closed', 'Withdrawn', 'Expired', 'Hold', 'Incomplete', 'Sold']) {
      const codes = codesFor({ MlsStatus: s, OffMarketDate: '2026-08-01', ListPrice: 1_000_000 });
      expect({ status: s, raised: codes.includes('CF-CANCELLED-001') }).toEqual({ status: s, raised: false });
    }
  });

  it('the fix did not silence the neighbouring OFFMARKET-001 blocker', () => {
    // Same class of rule, 24 lines below CANCELLED-001 in the source, fixed in
    // the previous pass. Drop OffMarketDate and it must still fire for BOTH
    // spellings — a regression here would mean the shared vocabulary broke it.
    for (const spelling of ['Canceled', 'Cancelled']) {
      const codes = codesFor({ MlsStatus: spelling, CancellationDate: '2026-08-01', ListPrice: 1_000_000 });
      expect({ spelling, raised: codes.includes('CF-OFFMARKET-001') }).toEqual({ spelling, raised: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. GENERIC — every status-keyed rule, both spellings, same verdict
// ═══════════════════════════════════════════════════════════════════════════

describe('every status-keyed conditional rule treats a spelling class identically', () => {
  it('the audit actually examined the whole rule table', () => {
    // Pins the denominator so a rule cannot be deleted (or the table silently
    // shrink) without this test noticing. 50 rules today; STATUS_KEYED_RULES is
    // the subset whose appliesWhen mentions a status value.
    expect({ total: RULES.length, statusKeyed: STATUS_KEYED_RULES.length }).toEqual({
      total: 50,
      statusKeyed: 7,
    });
  });

  for (const cls of STATUS_SPELLING_CLASSES) {
    const [first, ...rest] = cls.members;
    for (const other of rest) {
      it(`the fired-rule set is identical for '${first}' and '${other}'`, () => {
        // Empty payload except the status: every rule that APPLIES then reports
        // all of its required fields as missing, so the blocker-code set is a
        // direct readout of "which rules matched this status".
        const fired = (s: string) =>
          assertRlsCompliantPayload({ MlsStatus: s }, { listingType: 'sale' })
            .blockers.filter((b) => b.code.startsWith('CF-'))
            .map((b) => `${b.code}:${b.field}`)
            .sort();
        expect({ status: other, fired: fired(other) }).toEqual({ status: other, fired: fired(first) });
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. STRUCTURAL — mechanical audit of the WHOLE exported table, by value
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Paths in `REBNY_FIELD_TABLES` that are legitimately NOT spelling-closed,
 * each with the authority that makes it so. A vocabulary declaration must list
 * exactly what its authority declares — adding a sibling spelling to one would
 * be a FALSE AUTHORITY CLAIM, which is worse than the gap this file closes.
 */
const EXEMPT_PATHS: Array<{ path: string; reason: string }> = [
  {
    path: 'enumValues.MlsStatus',
    reason:
      'Picklist vocabulary transcribed from data/rebny-rls-property-lookup.csv. Provider-side ' +
      'spellings only by definition; also UNVERIFIABLE (live MlsStatus cannot be filtered or ' +
      'ordered — HTTP 400 — so no probe can confirm or refute it). Not a predicate.',
  },
  {
    path: 'enumValues.StandardStatus',
    reason:
      'The LIVE provider enumeration (11 members, each HTTP 200 on the 2026-08-19 probe). ' +
      "'Cancelled' is HTTP 400 at api.cotality.com; listing it here would assert a provider " +
      'fact that is false.',
  },
];

interface StatusGroup {
  path: string;
  kind: 'array' | 'object-keys';
  values: string[];
}

/** Every array of strings and every object-key set reachable from the table. */
function collectGroups(node: unknown, path: string, out: StatusGroup[]): StatusGroup[] {
  if (Array.isArray(node)) {
    const strings = node.filter((v): v is string => typeof v === 'string');
    if (strings.length > 0) out.push({ path, kind: 'array', values: strings });
    node.forEach((v, i) => collectGroups(v, `${path}[${i}]`, out));
    return out;
  }
  if (node !== null && typeof node === 'object') {
    const keys = Object.keys(node as Record<string, unknown>);
    if (keys.length > 0) out.push({ path, kind: 'object-keys', values: keys });
    for (const k of keys) collectGroups((node as Record<string, unknown>)[k], path ? `${path}.${k}` : k, out);
  }
  return out;
}

function statusViolations() {
  const groups = collectGroups(REBNY_FIELD_TABLES, '', []);
  const violations: Array<{ path: string; kind: string; has: string; missing: string; values: string }> = [];
  for (const g of groups) {
    if (EXEMPT_PATHS.some((e) => g.path === e.path)) continue;
    const present = new Set(g.values.filter((v) => ALL_MODELLED_STATUSES.has(v)));
    if (present.size === 0) continue;
    for (const cls of STATUS_SPELLING_CLASSES) {
      const hit = cls.members.filter((m) => present.has(m));
      if (hit.length === 0 || hit.length === cls.members.length) continue;
      violations.push({
        path: g.path,
        kind: g.kind,
        has: hit.join('+'),
        missing: cls.members.filter((m) => !present.has(m)).join('+'),
        values: g.values.join(','),
      });
    }
  }
  return { groups, violations };
}

describe('every status list in REBNY_FIELD_TABLES is spelling-closed', () => {
  it('the walker actually traverses the table (sanity check on this test)', () => {
    const { groups } = statusViolations();
    expect(groups.length).toBeGreaterThan(100);
    // It must reach the deepest thing it is meant to police: a rule's status list.
    expect(groups.some((g) => g.path.endsWith('.appliesWhen.MlsStatus'))).toBe(true);
  });

  it('no non-exempt status list omits a sibling spelling', () => {
    const { violations } = statusViolations();
    if (violations.length > 0) {
      throw new Error(
        `${violations.length} status list(s) in REBNY_FIELD_TABLES mention one spelling of a class ` +
          `without its siblings:\n` +
          violations
            .map((v) => `  ${v.path} (${v.kind})\n     has=${v.has}  MISSING=${v.missing}\n     [${v.values}]`)
            .join('\n') +
          `\n\nBuild the list with withStatusSpellings([...]) from ` +
          `lib/compliance/listing-status-vocabulary.ts. If it is a VOCABULARY DECLARATION ` +
          `rather than a predicate, add its path to EXEMPT_PATHS in this file with the ` +
          `authority that makes it exempt.`,
      );
    }
    expect(violations).toEqual([]);
  });

  it('the walker CAN see a non-closed list (negative control — not vacuously green)', () => {
    // Same walker, fed the pre-fix shape of CANCELLED-001.
    const mutant = { conditionalRules: [{ code: 'X', appliesWhen: { MlsStatus: ['Canceled'] } }] };
    const groups = collectGroups(mutant, '', []);
    const found = groups.filter((g) => {
      const present = new Set(g.values.filter((v) => ALL_MODELLED_STATUSES.has(v)));
      return STATUS_SPELLING_CLASSES.some((c) => {
        const hit = c.members.filter((m) => present.has(m));
        return hit.length > 0 && hit.length < c.members.length;
      });
    });
    expect(found.map((g) => g.path)).toEqual(['conditionalRules[0].appliesWhen.MlsStatus']);
  });

  it('every EXEMPT_PATHS entry names a real path and states an authority', () => {
    const { groups } = statusViolations();
    for (const e of EXEMPT_PATHS) {
      expect({ path: e.path, exists: groups.some((g) => g.path === e.path) }).toEqual({ path: e.path, exists: true });
      expect(e.reason.length).toBeGreaterThan(60);
    }
  });

  it('withStatusSpellings is what closes CANCELLED-001 (not a hand-typed second literal)', () => {
    const rule = RULES.find((r) => r.code === 'CANCELLED-001');
    expect(rule?.appliesWhen.MlsStatus).toEqual(withStatusSpellings(['Canceled']));
  });
});
