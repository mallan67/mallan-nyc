/// <reference types="jest" />
/**
 * PUBLICATION ELIGIBILITY — the Draft contradiction, pinned.
 *
 * `app/api/crm/convert` creates a Mallan listing with status `Draft` while
 * setting `idx_display_yn` from `!TERMINAL_STATUSES.has(...)` — which is TRUE
 * for Draft, because Draft is not terminal — plus both internet-display gates.
 *
 * Two public consumers then disagree about that row:
 *
 *   SEARCH / MARKET  filter on ACTIVE_DISPLAY_STATUSES
 *                    {Active, ActiveUnderContract, ComingSoon}
 *                    -> a Draft is correctly ABSENT.
 *
 *   LISTING DETAIL   filters on idx_display_yn WITHOUT any status check
 *                    -> a Draft is REACHABLE at its public URL.
 *
 * So a Mallan pre-publication workspace row was absent from search but servable
 * as a public page. The defect was PRE-EXISTING, not introduced by this branch.
 *
 * HOW IT IS RESOLVED — and why not with the obvious fix
 *
 * Gating detail on ACTIVE_DISPLAY_STATUSES would be wrong: that set excludes
 * `Pending`, and production carries thousands of Pending rows the detail page
 * intentionally serves. It would 404 all of them.
 *
 * The rule is instead derived from authority already in the repo:
 *
 *   MALLAN-PLATFORM-MASTER-PLAN §4.1 separates SOURCE from
 *   AUTHORITY/VISIBILITY; §4.2 says a listing created inside Mallan "remains
 *   Mallan's canonical editable listing"; §5.1 scopes public inventory to
 *   ELIGIBLE listings. Creation is not publication.
 *
 * and from the canonical status vocabulary: `Draft` is NOT a member of `Status`
 * at all, so `normalizeStatus` already fails closed to null for it — while
 * `normalizeStandardStatus` passes it through and TERMINAL_STATUSES does not
 * contain it, which is exactly how it acquired `idx_display_yn: true`.
 *
 * So public-detail eligibility is "the status is a recognised canonical
 * status", expressed once as `isPubliclyRetrievableStatus` and consumed by the
 * detail route. Draft closes; every canonical status is untouched.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isActiveDisplayStatus, isPubliclyRetrievableStatus } from '@/lib/compliance/status';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('Draft is not a public status', () => {
  it('Draft is excluded from the canonical active-display set', () => {
    expect(isActiveDisplayStatus('Draft')).toBe(false);
    // The statuses that ARE public collection members.
    expect(isActiveDisplayStatus('Active')).toBe(true);
    expect(isActiveDisplayStatus('ComingSoon')).toBe(true);
    expect(isActiveDisplayStatus('ActiveUnderContract')).toBe(true);
  });

  it('Pending is NOT an active-display status, yet detail intentionally serves it', () => {
    // This is the reason the naive fix is wrong, asserted rather than asserted
    // in prose: gating detail on this set would remove Pending listings too.
    expect(isActiveDisplayStatus('Pending')).toBe(false);
  });
});

describe('crm/convert must not invalidate public caches for a Draft', () => {
  it('creates Draft and emits NO public cache invalidation', () => {
    const src = read('app/api/crm/convert/route.ts');

    // It really does create a Draft.
    expect(src).toContain('normalizeStandardStatus("Draft")');

    // And it must NOT expire public collections, because a Draft cannot be a
    // member of them. An earlier revision of this branch DID invalidate here,
    // reasoning from `!TERMINAL_STATUSES` rather than from public membership;
    // that was wrong and caused pure cache churn.
    expect(src).not.toContain('safeRevalidateTags');
    expect(src).not.toContain('SEARCH_CACHE_TAG');
  });
});

describe('ensure-listing invalidates only on real public membership', () => {
  it('gates invalidation on isActiveDisplayStatus, not on non-terminality', () => {
    const src = read('app/api/idx/ensure-listing/route.ts');

    // The gate is the canonical helper, so it cannot drift from the predicates
    // the public readers actually use.
    expect(src).toContain('isActiveDisplayStatus(canonicalStatus)');
    expect(src).toContain('safeRevalidateTags');

    // The invalidation must sit INSIDE that guard, not run unconditionally.
    const guardIdx = src.indexOf('isActiveDisplayStatus(canonicalStatus)');
    const revalidateIdx = src.indexOf('safeRevalidateTags(');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(revalidateIdx).toBeGreaterThan(guardIdx);
  });
});

describe('CLOSED — public detail now enforces publication eligibility', () => {
  it('Draft is not publicly retrievable; Pending and canonical statuses still are', () => {
    // The canonical rule, derived from the master plan rather than invented:
    // a Mallan-created listing is canonical-and-private until it is
    // publication-eligible, and `Draft` is not in the canonical Status
    // vocabulary at all.
    expect(isPubliclyRetrievableStatus('Draft')).toBe(false);

    // Everything canonical is unchanged — this is the narrowness proof.
    for (const s of ['Active', 'ComingSoon', 'ActiveUnderContract', 'Pending', 'Closed', 'Withdrawn']) {
      expect(isPubliclyRetrievableStatus(s)).toBe(true);
    }
  });

  it('Pending is retrievable at detail but still absent from search', () => {
    // The exact distinction that made reusing the search set the wrong fix.
    expect(isPubliclyRetrievableStatus('Pending')).toBe(true);
    expect(isActiveDisplayStatus('Pending')).toBe(false);
  });

  it('the detail route calls the canonical helper and 404s a non-public status', () => {
    const page = read('app/listing/[...slug]/page.tsx');
    expect(page).toContain('isPubliclyRetrievableStatus(listing.status)');
    expect(page).toContain('notFound();');
    // It must NOT have adopted the search-status set, which would 404 Pending.
    // Checked as a CALL, not a bare substring — the page's comment names the
    // helper precisely to explain why it is not used.
    expect(page).not.toContain('isActiveDisplayStatus(');
  });

  it('unknown / garbage statuses fail closed', () => {
    expect(isPubliclyRetrievableStatus('')).toBe(false);
    expect(isPubliclyRetrievableStatus(null)).toBe(false);
    expect(isPubliclyRetrievableStatus(undefined)).toBe(false);
    expect(isPubliclyRetrievableStatus('NotAStatus')).toBe(false);
  });
});
