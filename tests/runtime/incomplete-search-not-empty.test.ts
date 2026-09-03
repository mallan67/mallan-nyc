/// <reference types="jest" />
/**
 * "WE STOPPED LOOKING" IS NOT "THERE IS NOTHING THERE".
 *
 * The engine can stop for two completely different reasons. The provider ran
 * out of rows — that is an answer. Or Mallan's read budget ran out first — that
 * is not an answer at all, it is an unfinished sentence.
 *
 * Both used to arrive at the browser as `listings.length === 0`, and the client
 * turned both into:
 *
 *     No listings found
 *     (authoritative)
 *
 * The worst shape is concrete: a provider universe of 100,000 rows where the
 * first 60,000 happen to be gated. A bounded traversal reads its budget, finds
 * no survivor, and the broker is told the inventory does not exist — while tens
 * of thousands of unread rows contain the listings they were looking for.
 *
 * That is the false-universe defect in its most damaging form, because a broker
 * who believes inventory does not exist stops searching.
 *
 * THE DISTINCTION MUST CUT BOTH WAYS. A genuinely empty universe is still a
 * real answer and must stay authoritative — a valid status with zero live rows
 * is not a failure, and refusing to report it would just break real zero
 * results.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const engine = readFileSync(resolve(REPO, 'public/crm/js/search/search-engine.js'), 'utf8');
const built = readFileSync(resolve(REPO, 'public/crm/index-built.html'), 'utf8');

const zeroResultBlock = (src: string) => {
  const start = src.indexOf('A BOUNDED TRAVERSAL THAT FOUND NOTHING');
  expect(start).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('var serverListings = result.listings;', start));
};

describe('an unresolved zero is not an empty universe', () => {
  it('branches on the provider disposition, not just on row count', () => {
    expect(zeroResultBlock(engine)).toMatch(/BUDGET_EXHAUSTED_UNRESOLVED/);
  });

  it('does not mark the set authoritative', () => {
    // Every downstream broker action — Compare, Reports, client send, saved
    // counts — is gated on authoritative. An unproven empty set must close
    // them, not open them.
    const block = zeroResultBlock(engine);
    const unresolved = block.slice(0, block.indexOf('if (_zeroRows) {'));
    expect(unresolved).toMatch(/_setResultProvenance\('incomplete'\)/);
    expect(unresolved).not.toMatch(/_setResultProvenance\('authoritative'\)/);
  });

  it('does not tell the broker there are no listings', () => {
    const block = zeroResultBlock(engine);
    const unresolved = block.slice(0, block.indexOf('if (_zeroRows) {'));
    expect(unresolved).not.toMatch(/No listings found/);
    expect(unresolved).toMatch(/Search incomplete/);
  });

  it('keeps the door open to keep looking', () => {
    // hasMore must stay true: the question is unresolved, so another page is
    // exactly the right next action.
    const block = zeroResultBlock(engine);
    const unresolved = block.slice(0, block.indexOf('if (_zeroRows) {'));
    expect(unresolved).toMatch(/serverHasMore = true/);
    expect(unresolved).toMatch(/serverTotalPages = null/);
  });
});

describe('a proven empty universe is still an answer', () => {
  it('an exhausted provider keeps the authoritative empty result', () => {
    // The distinction has to cut both ways or it just breaks real zero results.
    const block = zeroResultBlock(engine);
    const proven = block.slice(block.indexOf('if (_zeroRows) {'));
    expect(proven).toMatch(/_setResultProvenance\('authoritative'\)/);
    expect(proven).toMatch(/No listings found/);
  });
});

describe('the incomplete state closes downstream broker actions', () => {
  it('it is not authoritative', () => {
    const fn = engine.slice(
      engine.indexOf('function hasAuthoritativeSearchResults()'),
      engine.indexOf('function requireAuthoritativeSearchResults('),
    );
    // Only the exact marker passes, so a new state cannot accidentally qualify.
    expect(fn).toMatch(/resultProvenance === 'authoritative'/);
  });

  it('it counts as stale, like preview and failure', () => {
    // Reports over "all results" and Compare must refuse on this condition;
    // treating an unproven empty set as the answer is the whole defect.
    const fn = engine.slice(
      engine.indexOf('function searchResultsAreStale()'),
      engine.indexOf('window.searchResultsAreStale'),
    );
    expect(fn).toMatch(/provenance === 'incomplete'/);
  });
});

describe('the served artifact carries the same behaviour', () => {
  it('the built shell distinguishes the two zeroes', () => {
    expect(built).toMatch(/BUDGET_EXHAUSTED_UNRESOLVED/);
    expect(built).toMatch(/Search incomplete/);
  });
});
