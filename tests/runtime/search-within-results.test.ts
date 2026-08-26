/// <reference types="jest" />
/**
 * SEARCH WITHIN RESULTS IS A NEW SEARCH, NOT A LOCAL NARROWING.
 *
 * "Refine" has to mean:
 *
 *     ORIGINAL CANONICAL CRITERIA
 *   + REFINEMENT CRITERIA
 *   -> server
 *   -> a NEW final universe
 *
 * and never "filter the rows currently on screen". The distinction is not
 * academic: once pagination is real, the rows on screen are ONE PAGE, so a local
 * refine would search twenty listings and present the result as a refined
 * search of 4,622.
 *
 * THIS PATH WAS ALREADY FIXED, AND THIS FILE EXISTS TO KEEP IT FIXED. The
 * implementation records Bug A10, reported 2026-05-04: refining a Queens search
 * to 1 bed returned results from every borough. Two compounding causes, both
 * worth remembering because both are the shape this workstream keeps finding —
 *
 *   1. `filterListings` never enforced criteria.borough at all, so even a
 *      correctly preserved borough was ignored by local filtering;
 *   2. the global `listings` array accumulates server results across every
 *      search in a session, so rows from earlier, unrelated searches leaked
 *      into the "refined" output.
 *
 * A local refine could therefore return listings that matched NEITHER the
 * original criteria nor the refinement.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

const applyBlock = (src: string) => {
  const start = src.indexOf('function applyRefinedSearch()');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('buildRefineFilterPills(c)', start));
};

const code = (block: string) =>
  block
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

describe('refine re-asks the server', () => {
  it('issues the refined criteria through the server-authoritative path', () => {
    expect(code(applyBlock(engine))).toMatch(/_serverSearch\(c,/);
  });

  it('never filters the loaded rows instead', () => {
    // The Bug A10 shape. Once pagination is real this would also mean
    // "refining" a single page and calling it a refined search.
    expect(code(applyBlock(engine))).not.toMatch(/filterListings\(/);
    expect(code(applyBlock(engine))).not.toMatch(/filteredListings\s*=\s*filterListings/);
  });

  it('starts the new universe at page 1', () => {
    // A refinement produces a different universe, so a page number carried over
    // from the previous one means nothing.
    expect(code(applyBlock(engine))).toMatch(/currentPage = 1/);
  });
});

describe('refinement is MERGED onto the original criteria', () => {
  it('starts from activeSearchCriteria rather than a fresh object', () => {
    // "Search within results" that dropped the original criteria would be a
    // brand new search wearing the wrong name — a Queens search refined to
    // 1 bed must stay in Queens.
    expect(applyBlock(engine)).toMatch(/var c = \(typeof activeSearchCriteria !== 'undefined'/);
  });

  it('an emptied refine control REMOVES its criterion rather than leaving it stale', () => {
    // Clearing a refine field has to widen the search back, not silently keep
    // the previous bound.
    const block = applyBlock(engine);
    expect(block).toMatch(/else delete c\.priceMin/);
    expect(block).toMatch(/else delete c\.bedsMin/);
    expect(block).toMatch(/else delete c\.statuses/);
  });

  it('the refined criteria become the active criteria', () => {
    // So the next page request, save, or re-sort asks the refined question.
    expect(code(applyBlock(engine))).toMatch(/activeSearchCriteria = c;/);
  });

  it('the main form is kept in step with the refinement', () => {
    // Otherwise "Full Search" would reopen showing the pre-refine question.
    expect(code(applyBlock(engine))).toMatch(/syncRefineToMainForm\(c\)/);
  });
});

describe('the refine status list has no duplicated member', () => {
  it('ActiveUnderContract is pushed once', () => {
    const block = applyBlock(engine);
    const pushes = block.match(/statuses\.push\('ActiveUnderContract'\)/g) || [];
    expect(pushes).toHaveLength(1);
  });
});

describe('the served artifact carries the same behaviour', () => {
  it('the built shell refines through the server', () => {
    expect(code(applyBlock(built))).toMatch(/_serverSearch\(c,/);
    expect(code(applyBlock(built))).not.toMatch(/filterListings\(/);
  });
});
