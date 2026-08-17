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
 * HOW IT IS RESOLVED — and why not with either obvious fix
 *
 * (a) Gating detail on ACTIVE_DISPLAY_STATUSES would be wrong: that set
 *     excludes `Pending`, of which the LIVE Cotality feed carries 6,103 rows
 *     (read-only probe, 2026-08-17). It would 404 all of them.
 *
 * (b) Gating on "is a recognised canonical status" — the rule this branch
 *     shipped at 3632fdb4 — is ALSO wrong, in the other direction. Recognition
 *     is not eligibility: it admitted all seven terminal statuses, including
 *     `Closed`, whose live population is 576,810.
 *
 * The resolved rule is source-class aware and lives in ONE place,
 * `decidePublicDetailAccess`, called from the SHARED resolver:
 *
 *   VOCABULARY (both classes) — `isCanonicalStatus`. Kills Draft/Incomplete.
 *   RLS-BACKED               — `isListingDisplayable`, which already owns
 *                              terminality AND the UCBA Art. I §6 24-hour
 *                              "marked closed" window.
 *   WEBSITE-ONLY             — `isMallanPublicationEligibleStatus`, mirroring
 *                              the shipped `buildPublishContract` contract
 *                              (`exclusiveEligible = !isTerminal`), because no
 *                              REBNY gate governs those rows.
 *
 * Behavioural proof of all of the above lives in
 * `publication-eligibility-shared-resolver.test.ts`, which imports the real
 * route module and calls `generateMetadata`. This file keeps only the
 * STRUCTURAL assertions about the CRM writers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isActiveDisplayStatus,
  isCanonicalStatus,
  isMallanPublicationEligibleStatus,
} from '@/lib/compliance/status';

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

describe('CLOSED — public detail enforces publication eligibility', () => {
  it('the VOCABULARY gate rejects the pre-publication and unmodelled statuses', () => {
    // `Draft` and `Incomplete` are CRM lifecycle values (the mapper's
    // CRM_LIFECYCLE_STATUSES) absent from the canonical `Status` vocabulary.
    // `Delete` is a REAL live Cotality StandardStatus this repo does not model
    // (verified live 2026-08-17) — it must fail closed too, not be "fixed" by
    // being added to INPUT_TO_CANONICAL without a visibility decision.
    expect(isCanonicalStatus('Draft')).toBe(false);
    expect(isCanonicalStatus('Incomplete')).toBe(false);
    expect(isCanonicalStatus('Delete')).toBe(false);

    // Canonical values pass the VOCABULARY gate. Passing it is NOT permission
    // to publish — the source-class contract runs next.
    for (const s of ['Active', 'ComingSoon', 'ActiveUnderContract', 'Pending', 'Closed']) {
      expect(isCanonicalStatus(s)).toBe(true);
    }
  });

  it('the MALLAN contract ends public eligibility at terminal', () => {
    // Mirrors lib/crm/listing-publish-contract.ts (`exclusiveEligible =
    // !isTerminal`). This closes the website-only hole: those rows carry
    // idx_display_yn=false by construction, so no REBNY gate can decide them
    // and "recognised status" was the only test left standing.
    for (const s of ['Closed', 'Sold', 'Rented', 'Leased', 'Withdrawn', 'Cancelled', 'Expired']) {
      expect(isMallanPublicationEligibleStatus(s)).toBe(false);
    }
    for (const s of ['Active', 'ComingSoon', 'ActiveUnderContract', 'Pending', 'Hold']) {
      expect(isMallanPublicationEligibleStatus(s)).toBe(true);
    }
  });

  it('Pending is publication-eligible at detail but still absent from search', () => {
    // The distinction that makes reusing the search set the wrong fix.
    expect(isMallanPublicationEligibleStatus('Pending')).toBe(true);
    expect(isActiveDisplayStatus('Pending')).toBe(false);
  });

  it('the detail route no longer re-decides publication in the page component', () => {
    const page = read('app/listing/[...slug]/page.tsx');
    // ONE decision, in the shared resolver, before any DTO is built or cached.
    expect(page).toContain('decidePublicDetailAccess(dbListing)');
    // The page-local status re-check is GONE — that split is what leaked a
    // Draft's address, price and OpenGraph card through generateMetadata.
    expect(page).not.toContain('isPubliclyRetrievableStatus(listing.status)');
    // And it must not have adopted the search-status set, which would 404 Pending.
    expect(page).not.toContain('isActiveDisplayStatus(');
  });

  it('unknown / garbage statuses fail closed', () => {
    for (const s of ['', null, undefined, 'NotAStatus']) {
      expect(isCanonicalStatus(s)).toBe(false);
      expect(isMallanPublicationEligibleStatus(s)).toBe(false);
    }
  });
});
