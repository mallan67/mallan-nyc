import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CANONICAL_FILTER_KEYS,
  CRITERION_VALUE_SHAPE,
  CRITERION_VALUE_BASES,
  CRITERION_VOCABULARY_OWNER,
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

describe('the fact type and the input shape are independent', () => {
  const registry = readFileSync(
    resolve(__dirname, '../canonical/field-registry.ts'),
    'utf8',
  );

  const entry = (key: string) =>
    registry.split('\n').find((l) => l.includes(`canonicalKey: '${key}'`)) ?? '';

  it('does not rewrite a scalar fact as a list to describe a multi-select', () => {
    // `listing_id_canonical` was briefly `type: 'array'` because the Search box
    // accepts several IDs. One listing has exactly ONE canonical identifier — a
    // scalar, dual-domain reference — so that made the registry lie about the
    // domain in order to describe a control. Same for borough and neighborhood,
    // which are one value per listing however many a broker may select.
    expect(entry('listing_id_canonical')).toMatch(/[^A-Za-z]type: 'string'/);
    expect(entry('borough')).toMatch(/[^A-Za-z]type: 'string'/);
    expect(entry('neighborhood')).toMatch(/[^A-Za-z]type: 'string'/);
  });

  it('still lets those scalars accept a multi-value SEARCH input', () => {
    // The point of separating the two: a multi-select over a scalar fact is
    // ordinary, and the shape says so without the type having to lie.
    expect(CRITERION_VALUE_SHAPE.listing_id_canonical).toBe('text_set');
    expect(CRITERION_VALUE_SHAPE.borough).toBe('enum_set');
    expect(CRITERION_VALUE_SHAPE.neighborhood).toBe('text_set');
  });

  it('is not derivable from type — proven by a shape that no type implies', () => {
    // If a later change reintroduced derivation, these three scalar `string`
    // facts would collapse back to a single `text` shape and this fails.
    const scalarsWithSetShapes = ['listing_id_canonical', 'borough', 'neighborhood'].filter(
      (k) => /[^A-Za-z]type: 'string'/.test(entry(k)),
    );
    expect(scalarsWithSetShapes.length).toBe(3);
    for (const key of scalarsWithSetShapes) {
      const shape = CRITERION_VALUE_SHAPE[key as keyof typeof CRITERION_VALUE_SHAPE];
      expect(['enum_set', 'text_set']).toContain(shape);
    }
  });
});

describe('closed vocabularies have exactly one owner', () => {
  it('every vocabulary-bearing shape names an owner, and nothing else does', () => {
    // `enum_set` claims membership is CHECKED, which is only true if a module
    // owns the members. Without an owner each workflow contract would supply its
    // own `allowed` array — four private lists, four new translation tables.
    //
    // `feature_map` needs one for the same reason and more strongly: its owner
    // holds EIGHTEEN separate families, each with its own Cotality field, kind,
    // allowed members and unresolved members.
    const OWNED_SHAPES = ['enum_set', 'feature_map'];
    const owned = CANONICAL_FILTER_KEYS.filter((k) =>
      OWNED_SHAPES.includes(CRITERION_VALUE_SHAPE[k]),
    );
    expect(owned.length).toBeGreaterThan(0);
    for (const key of owned) {
      expect(CRITERION_VOCABULARY_OWNER[key]).toBeTruthy();
    }
    const strays = Object.keys(CRITERION_VOCABULARY_OWNER).filter(
      (k) =>
        !OWNED_SHAPES.includes(CRITERION_VALUE_SHAPE[k as keyof typeof CRITERION_VALUE_SHAPE]),
    );
    expect(strays).toEqual([]);
  });

  it('every named owner is a real canonical module', () => {
    // A vocabulary owner that does not exist is worse than none: it reads as
    // resolved while nothing can consume it.
    for (const owner of Object.values(CRITERION_VOCABULARY_OWNER)) {
      expect(existsSync(resolve(__dirname, `../canonical/${owner}.ts`))).toBe(true);
    }
  });

  it('neighborhood is OPEN, because no closed vocabulary is proven for it', () => {
    // `neighborhoodOData` deliberately passes an unrecognised name through as a
    // literal SubdivisionName. Declaring it enum_set would claim a proven
    // canonical geography vocabulary that does not exist — the 593 alias
    // equivalences date from 2026-03-19 and are still unverified against live
    // SubdivisionName.
    expect(CRITERION_VALUE_SHAPE.neighborhood).toBe('text_set');
    expect(CRITERION_VOCABULARY_OWNER.neighborhood).toBeUndefined();
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
