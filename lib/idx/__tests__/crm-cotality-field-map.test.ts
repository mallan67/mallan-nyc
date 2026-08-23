/// <reference types="jest" />
/**
 * THE CRM MAY ONLY NAME PROVIDER FIELDS THAT EXIST.
 *
 * The CRM tags rendered elements with the provider field they correspond to, and
 * compliance gates then find those elements by field identity. That only works
 * if the names are real. The map this replaced was maintained by hand against a
 * dated CSV, and on 2026-08-23 three of its targets did not exist on the live
 * Cotality Property resource at all, while two named the wrong field:
 *
 *   IDXEntireListingDisplayYN          does not exist - a manufactured IDX gate
 *   ComingSoonTimestamp                does not exist
 *   SourceSystemModificationTimestamp  does not exist
 *   status -> MlsStatus                wrong field (see below)
 *   wid  -> "ListingKey renamed"       false claim; both fields exist separately
 *
 * A hand-maintained table cannot be checked, so the map is now checked against a
 * GENERATED contract - data/cotality-contract/crm-field-contract.json, produced
 * by scripts/cotality/build-crm-field-contract.mjs from $metadata. Adding a field
 * the provider does not declare fails here rather than shipping.
 *
 * This is a static contract test. It proves the CRM cannot NAME a field that does
 * not exist. It does not prove any gate's runtime behaviour - the CRM smoke suite
 * and the compliance gate tests cover that.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..');
const MAP = process.env.CRM_FIELD_MAP_UNDER_TEST || 'public/crm/js/core/cotality-field-map.js';
const CONTRACT = 'data/cotality-contract/crm-field-contract.json';

type Contract = {
  /** keyed by RESOURCE-QUALIFIED identity, e.g. "Property.StandardStatus" */
  fields: Record<string, { kind: string; type?: string; enumType?: string; nullable: boolean }>;
  /** bare CRM field name -> the one qualified identity it resolves to */
  resolution: Record<string, string>;
  rejected: Record<string, string>;
};

const contract: Contract = JSON.parse(fs.readFileSync(path.join(REPO, CONTRACT), 'utf8'));
const mapSource = fs.readFileSync(path.join(REPO, MAP), 'utf8');

/** crmKey -> provider field name(s). A '+' target is a computed pseudo-field. */
function mapEntries(): Array<[string, string[]]> {
  const out: Array<[string, string[]]> = [];
  const rx = /^\s+([A-Za-z0-9_]+):\s*'([^']+)'/gm;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(mapSource)) !== null) {
    out.push([m[1], m[2].split('+').map((s) => s.trim())]);
  }
  return out;
}
const entries = mapEntries();
const byKey = new Map(entries.map(([k, v]) => [k, v]));

describe('the contract itself is real', () => {
  it('carries the fields the CRM depends on', () => {
    // Guards against an emptied or truncated contract silently passing everything.
    expect(Object.keys(contract.fields).length).toBeGreaterThan(50);
    for (const f of ['StandardStatus', 'ListingId', 'PropertyType', 'InternetEntireListingDisplayYN']) {
      // Resolved, never bare: Media denormalises several of these, so the bare
      // name is not an identity.
      expect(contract.resolution[f]).toBe('Property.' + f);
      expect(contract.fields[contract.resolution[f]]).toBeDefined();
    }
    // Nothing the generator rejected may remain in the shipped contract.
    expect(contract.rejected).toEqual({});
  });

  it('does not persist the provider namespace', () => {
    // Cotality expresses enum types as a namespace path. That path is the
    // provider's implementation detail; Mallan consumes the enum type name only.
    // Persisting the path would carry an obsolete abstraction into Mallan's
    // architecture merely because the provider's schema exposes one.
    expect(fs.readFileSync(path.join(REPO, CONTRACT), 'utf8')).not.toContain('DataStandard');
  });
});

describe('every field the CRM names exists on the live Property resource', () => {
  it('found entries to check', () => {
    expect(entries.length).toBeGreaterThan(50);
  });

  it('no target is absent from the contract', () => {
    const missing: string[] = [];
    for (const [key, targets] of entries) {
      for (const t of targets) {
        const qualified = contract.resolution[t];
        if (!qualified || !contract.fields[qualified]) missing.push(`${key} -> ${t}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it.each([
    'IDXEntireListingDisplayYN',
    'ComingSoonTimestamp',
    'SourceSystemModificationTimestamp',
  ])('does not name %s, which the live API rejects', (dead) => {
    // A literal check, deliberately. An earlier version built this as a RegExp
    // from a template literal, where the backslash escape collapsed and the
    // pattern silently matched nothing - it passed against the very map that
    // contained all three names. A vacuous assertion is worse than none.
    const named = entries.some(([, targets]) => targets.includes(dead));
    expect(named).toBe(false);
  });
});

describe('the two conflated fields are kept apart', () => {
  it('status resolves to StandardStatus, never MlsStatus', () => {
    // StandardStatus (11 values) and MlsStatus (25 values) are separate Property
    // enums. The same label carries different integer codes in each - Canceled is
    // 2 vs 4, Closed 3 vs 6, Pending 9 vs 16, Withdrawn 10 vs 24 - so substituting
    // one for the other corrupts the value even when the string matches. Cotality
    // additionally suppresses MlsStatus for filtering and ordering.
    expect(byKey.get('status')).toEqual(['StandardStatus']);
  });

  it('identity does not rest on a nullable field', () => {
    // wid genuinely means the upstream system's own id, so SourceSystemKey is the
    // right target - the old map's error was claiming ListingKey had been
    // "renamed" to it. Both exist independently: ListingKey is String(20) NOT
    // NULL, SourceSystemKey String(255) NULLABLE. Identity therefore comes from
    // lid, not wid.
    expect(byKey.get('wid')).toEqual(['SourceSystemKey']);
    expect(contract.fields['Property.SourceSystemKey'].nullable).toBe(true);
    expect(byKey.get('lid')).toEqual(['ListingId']);

    // RECORDED HONESTLY: both CRM identity fields are nullable on the live
    // resource. ListingKey - String(20) NOT NULL, the only non-nullable identity
    // Cotality exposes - is deliberately NOT in this contract because the CRM
    // never names it; the backend carries it (lib/idx/mapping.ts maps it to
    // mlsId). So the CRM must not treat either of its identifiers as guaranteed
    // present, and neither is a substitute for the backend's key.
    expect(contract.fields['Property.ListingId'].nullable).toBe(true);
    expect(contract.fields['Property.ListingKey']).toBeUndefined();
  });

  it('the real internet display gate is mapped', () => {
    // Cotality exposes one display gate, not an IDX-specific one. Mallan's IDX
    // opt-out is a Mallan/REBNY compliance concept enforced downstream; it is not
    // a provider field and no longer claims to be.
    expect(byKey.get('internetDisplayYN')).toEqual(['InternetEntireListingDisplayYN']);
    expect(byKey.has('idxDisplayYN')).toBe(false);
  });
});
