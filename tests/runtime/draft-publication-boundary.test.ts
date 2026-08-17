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
 * So a Mallan pre-publication workspace row is absent from search but servable
 * as a public page. That is a publication/compliance defect, and it is
 * PRE-EXISTING — not introduced by this branch.
 *
 * WHY IT IS NOT "FIXED" HERE
 *
 * The obvious repair — gate listing detail on ACTIVE_DISPLAY_STATUSES — is
 * wrong. That set deliberately excludes `Pending`, and production carries
 * ~6.2k Pending rows with idx_display_yn true that the detail page is intended
 * to serve. Applying it would 404 all of them. The correct fix needs a
 * publication rule that separates "Mallan pre-publication workspace state" from
 * "non-active but still publicly servable", which is a display-gate decision on
 * a compliance surface and belongs to Maya, not to this branch.
 *
 * These tests pin the CURRENT behaviour so the contradiction cannot drift
 * silently, and so the eventual fix has a failing test to flip.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isActiveDisplayStatus } from '@/lib/compliance/status';

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

describe('KNOWN GAP — escalated, deliberately not repaired on this branch', () => {
  it('public listing detail still filters on idx_display_yn without a status check', () => {
    // Pinning the defect. When Maya authorizes the publication rule, this
    // assertion is the one to flip.
    const page = read('app/listing/[...slug]/page.tsx');
    expect(page).toContain('idx_display_yn: true');
    expect(page).not.toContain('ACTIVE_DISPLAY_VALUES');
    expect(page).not.toContain('isActiveDisplayStatus');
  });
});
