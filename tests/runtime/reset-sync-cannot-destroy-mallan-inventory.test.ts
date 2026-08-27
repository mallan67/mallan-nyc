/// <reference types="jest" />
/**
 * A COTALITY RE-SYNC MUST NOT DELETE MALLAN-AUTHORED INVENTORY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `POST /api/crm/listings/reset-sync` step 1 was an unfiltered wipe:
 *
 *     prisma.clientListingAction.deleteMany({})
 *     prisma.showing.deleteMany({})
 *     prisma.comment.deleteMany({})
 *     prisma.priceHistory.deleteMany({})
 *     prisma.marketingActivity.deleteMany({})
 *     prisma.protectedPeriod.deleteMany({})
 *     prisma.listing.deleteMany({})          // ← every row
 *
 * followed by a repopulate that pulls from Cotality ONLY.
 *
 * So every Mallan-authored `SL-`/`RL-` listing was destroyed and never came
 * back: the listing, its `owner_client_id` link, its media, its comments, its
 * showings, its price history, its protected period. Cotality cannot restore
 * them, because Cotality never had them — Mallan authored them.
 *
 * The route is broker-only, behind READONLY_MODE and IDX_ENABLED, and its own
 * header calls it "ONE-TIME USE". None of that makes the blast radius correct.
 * One broker action removed the brokerage's entire exclusive inventory.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS BLOCKS THE PUBLICATION WORK
 *
 * The next piece of work puts durable Mallan publication/review state inside
 * `Listing.compliance`. Section 3 of the directive requires proving that
 * namespace survives every lane. Seven lanes preserve it — the Cotality sync
 * omits the column, CRM PATCH now merges it, the status route never writes it,
 * reconciliation writes it only on CREATE, no portal route writes Listing at
 * all, and the public DTO never reads it.
 *
 * This lane deleted the whole row. A namespace cannot be "preserved" on a record
 * that no longer exists, so this had to be closed before that state could be
 * trusted anywhere.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED
 *
 * The wipe is scoped to PROVIDER-SOURCED rows — the only rows a Cotality
 * re-sync can actually rebuild. Mallan-authored rows are identified the same way
 * the rest of the repo identifies them (`SL-`/`RL-` prefix, or
 * `rls_eligible = false`), and their dependents are scoped to the same set
 * rather than truncated globally.
 *
 * This is a NARROWING of a destructive operation. It deletes strictly less than
 * before and nothing that was previously kept is now removed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE = resolve(__dirname, '../../app/api/crm/listings/reset-sync/route.ts');
const src = readFileSync(ROUTE, 'utf8');

/** Source with comment lines stripped — prose about a wipe is not a wipe. */
const code = src
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('no unscoped truncation survives in the re-sync route', () => {
  it.each([
    'listing',
    'clientListingAction',
    'showing',
    'comment',
    'priceHistory',
    'marketingActivity',
    'protectedPeriod',
  ])('prisma.%s.deleteMany is not called with an empty filter', (model) => {
    // `deleteMany({})` is a table truncation. Every one of these has a
    // `listing_id` relation and must be scoped to the rows actually being
    // rebuilt.
    const empty = new RegExp(`prisma\\.${model}\\.deleteMany\\(\\s*\\{\\s*\\}\\s*\\)`);
    expect(code).not.toMatch(empty);
  });
});

describe('the wipe is scoped to provider-sourced rows', () => {
  it('excludes Mallan-authored listings by the canonical signals', () => {
    // The same signals the rest of the repo uses for "Mallan authored this":
    // the SL-/RL- listing_id prefix, or rls_eligible === false.
    expect(code).toMatch(/SL-/);
    expect(code).toMatch(/RL-/);
    expect(code).toMatch(/rls_eligible/);
  });

  it('dependents are deleted by listing_id, not globally', () => {
    // Preserving the listing while truncating its comments and showings would
    // still be the same data loss wearing a smaller number.
    expect(code).toMatch(/listing_id:\s*\{\s*in:/);
  });

  it('the route still explains that Cotality cannot rebuild local rows', () => {
    // The reasoning has to survive in the source, or the next person removes
    // the scope as an optimisation.
    expect(src).toMatch(/Cotality never had them|cannot restore|Mallan authored/i);
  });
});
