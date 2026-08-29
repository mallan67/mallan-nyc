import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CANONICAL_FILTER_KEYS,
  CRITERION_VALUE_SHAPE,
  CRITERION_VALUE_BASES,
} from '../canonical/filter-keys.generated';
import { toCanonicalFilterKey } from '../canonical/filter-keys';

const EXECUTOR = resolve(__dirname, '../crm-idx-filter.ts');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DECLARED VALUE SHAPE MUST MATCH WHAT THE EXECUTOR ACTUALLY DOES.
 *
 * The value contract is only worth having if it describes the running system. On
 * 2026-08-28 it did not: three criteria were declared `type: 'string'` while the
 * executor comma-split each of them and handed an ARRAY to the clause builder —
 * `borough`, `neighborhood` and `listing_id_canonical`.
 *
 * A single-text shape for a criterion whose entire purpose is a disjunction is
 * not a cosmetic mismatch. A validator built on it would accept a lone string,
 * and the multi-select would be narrowed to its first value or refused outright,
 * depending on which layer noticed first.
 *
 * These guards parse the executor rather than trusting a hand-kept list, so the
 * agreement is checked against behaviour and not against another declaration.
 */
describe('declared value shape vs. executor behaviour', () => {
  const source = readFileSync(EXECUTOR, 'utf8');

  /** Wire params the executor reads and then splits on commas. */
  const multiValueParams = (): string[] => {
    const lines = source.split('\n');
    const found = new Set<string>();
    lines.forEach((line, i) => {
      const read = /params\.get\("([A-Za-z]+)"\)/.exec(line);
      if (!read) return;
      // The split may be on the read line or in the block that consumes it, so a
      // window is needed — but it MUST stop at the next criterion's read.
      //
      // A naive fixed-size window reported `gridFilter` as multi-value because it
      // bled past that criterion's one-line refusal into the `listingId` block
      // below it. That is the same off-by-one-block defect that made an earlier
      // census in this workstream pair every criterion with the NEXT guard's
      // assignment: every row plausible, every row wrong.
      const rest = lines.slice(i + 1);
      const nextRead = rest.findIndex((l) => /params\.get\("[A-Za-z]+"\)/.test(l));
      const end = nextRead === -1 ? rest.length : nextRead;
      const window = [line, ...rest.slice(0, end)].join('\n');
      if (/\.split\(","\)/.test(window)) found.add(read[1]);
    });
    return [...found];
  };

  it('finds the executor multi-value reads at all — guard the guard', () => {
    // If the parse silently found nothing, every assertion below would vacuously
    // pass and this file would be decoration. An earlier census in this
    // workstream did exactly that and reported confident, wrong results.
    const params = multiValueParams();
    expect(params.length).toBeGreaterThanOrEqual(4);
    expect(params).toEqual(expect.arrayContaining(['neighborhood', 'borough', 'listingId']));
  });

  it('every comma-split criterion is declared as a SET, never as text', () => {
    const wrong: string[] = [];
    for (const param of multiValueParams()) {
      const key = toCanonicalFilterKey(param);
      if (!key) continue;
      const shape = CRITERION_VALUE_SHAPE[key];
      if (shape !== 'enum_set' && shape !== 'text_set') {
        wrong.push(`${param} -> ${key} declared '${shape}'`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('the shape map is total', () => {
  it('covers every canonical criterion', () => {
    // `satisfies` already enforces this at compile time. Asserting it at runtime
    // too catches the case where the generated file is stale on disk while the
    // types still describe a newer registry.
    const missing = CANONICAL_FILTER_KEYS.filter((k) => !(k in CRITERION_VALUE_SHAPE));
    expect(missing).toEqual([]);
  });

  it('declares a basis vocabulary for exactly the composite criteria', () => {
    // A basis range whose vocabulary is empty would accept any basis, which is
    // the silent-default collapse the closed set exists to prevent.
    const composites = CANONICAL_FILTER_KEYS.filter(
      (k) => CRITERION_VALUE_SHAPE[k] === 'basis_range_date',
    );
    expect(composites).toEqual(['activity_date']);
    for (const key of composites) {
      expect(CRITERION_VALUE_BASES[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('gives no basis vocabulary to a criterion that is not a composite', () => {
    const stray = Object.keys(CRITERION_VALUE_BASES).filter(
      (k) => CRITERION_VALUE_SHAPE[k as keyof typeof CRITERION_VALUE_SHAPE] !== 'basis_range_date',
    );
    expect(stray).toEqual([]);
  });
});
