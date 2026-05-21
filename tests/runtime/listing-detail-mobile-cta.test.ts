/// <reference types="jest" />
/**
 * A2 (PR-A2-mobile-cta, 2026-05-21) — Mobile above-fold CTA source-grep pin.
 *
 * This is the static-source companion to the live-browser proof at
 *   tests/e2e/listing-detail-mobile-cta.spec.ts.
 *
 * It locks in four structural invariants that are cheap to assert via
 * source-grep and that a future refactor could silently break:
 *   1. `app/listing/[id]/page.tsx` mounts the `<MobileStickyCta>` component
 *      and passes `listingType={listing.listingType}` (greppable marker so a
 *      "I just removed the import" or "I dropped listingType" regression
 *      red-lights immediately).
 *   2. The CTA computes its intent value FROM the `listingType` prop via the
 *      ternary `listingType === 'rent' ? 'tenant' : 'buyer'`, NOT by
 *      hardcoding a single intent for all listings (the bug Maya caught in
 *      the prior agent's draft, which used intent=buyer for every listing
 *      including rentals — misrouting every rental inquiry to the buyer
 *      queue).
 *   3. Both `'buyer'` and `'tenant'` are members of the A3 closed
 *      `INTENT_ALLOWLIST` (`lib/leads/intent.ts`). If a future PR drops
 *      either value, this test reds before the CTA ships broken (defense
 *      in depth — A3 → A2 contract pin).
 *   4. The CTA wrapper uses the `md:hidden` responsive class so desktop
 *      (≥ 768 px) is byte-identical to pre-A2 behavior — the existing
 *      desktop sidebar agent-contact card and sticky-top in-flow bar
 *      remain the canonical CTA paths on larger viewports.
 *
 * Compliance posture re-asserted:
 *   - No agent personal phone is hardcoded; the call CTA uses the Mallan
 *     brokerage line (NY DOS §175.25 attribution lives in the layout
 *     footer, not in the CTA copy itself).
 *   - The CTA `<a>` is a navigation link — it does NOT collect PII or
 *     trigger an SMS/email. The TCPA affirmative-consent gate stays on
 *     the `/contact` form (which records `consent_captured_at` per
 *     `tests/runtime/contact-form-consent.test.ts`).
 *   - The CTA copy is "Contact agent" / "Call" — concise, neutral, no
 *     protected-class flattery (Fair Housing Federal + NYS + NYC).
 *
 * Pair with the e2e spec at tests/e2e/listing-detail-mobile-cta.spec.ts
 * for the live rendering proof on the immutable Vercel preview URL.
 */

import * as fs from 'fs';
import * as path from 'path';
import { INTENT_ALLOWLIST } from '@/lib/leads/intent';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PAGE_PATH = path.join(REPO_ROOT, 'app', 'listing', '[id]', 'page.tsx');
const COMPONENT_PATH = path.join(
  REPO_ROOT,
  'app',
  'components',
  'listing-detail',
  'mobile-sticky-cta.tsx'
);

describe('A2 — mobile above-fold CTA source-pin', () => {
  let pageSrc: string;
  let componentSrc: string;

  beforeAll(() => {
    pageSrc = fs.readFileSync(PAGE_PATH, 'utf8');
    componentSrc = fs.readFileSync(COMPONENT_PATH, 'utf8');
  });

  test('listing detail page imports MobileStickyCta from the canonical path', () => {
    // Single canonical import — no `*-v2`, `*-final`, `-new` siblings (repo
    // source-of-truth charter).
    expect(pageSrc).toMatch(
      /import\s+\{\s*MobileStickyCta\s*\}\s+from\s+['"]@\/app\/components\/listing-detail\/mobile-sticky-cta['"]/
    );
  });

  test('listing detail page renders <MobileStickyCta slug=... listingType=... />', () => {
    // The slug prop is required (used to tag the inquiry URL); listingType
    // is required so the CTA can compute the correct intent value
    // (sale → buyer, rent → tenant). The prior agent's bug was to omit
    // listingType and hardcode intent=buyer for every listing.
    expect(pageSrc).toMatch(/<MobileStickyCta\s+slug=\{\s*listing\.slug\s*\}\s+listingType=\{\s*listing\.listingType\s*\}\s*\/>/);
  });

  test('CTA wrapper uses md:hidden so desktop layout is untouched (A1 + sidebar preserved)', () => {
    // The wrapper class string MUST contain md:hidden so the entire bar
    // is suppressed at ≥ 768 px viewport. A future PR that removes
    // md:hidden would leak the CTA onto desktop and conflict with the
    // sidebar agent-contact card.
    expect(componentSrc).toMatch(/className=["'][^"']*\bmd:hidden\b/);
  });

  test('CTA uses fixed bottom positioning so it is above-the-fold from page load', () => {
    // Fixed bottom-0 means it is pinned to the visual viewport regardless of
    // scroll position — the entire point of the A2 fix is that the visitor
    // does not need to scroll past the gallery to find a contact button.
    expect(componentSrc).toMatch(/\bfixed\b/);
    expect(componentSrc).toMatch(/\bbottom-0\b/);
  });

  test('CTA buttons clear WCAG 2.5.5 44×44 touch target via min-h-12 (= 48 px)', () => {
    // We use min-h-12 (48 px) on both Call and Contact links — comfortably
    // above the 44 px floor and matches the 48 px Material/Apple guideline.
    const minH12Hits = componentSrc.match(/\bmin-h-12\b/g) ?? [];
    expect(minH12Hits.length).toBeGreaterThanOrEqual(2);
  });

  test('CTA computes intent from listingType prop (sale→buyer, rent→tenant) — NOT hardcoded', () => {
    // The intent value MUST be derived from the listingType prop. Hardcoding
    // intent=buyer for all listings (the prior agent's bug) misroutes every
    // rental inquiry to the buyer queue. We pin the exact ternary shape so a
    // future refactor that drops the conditional is caught.
    //
    // Acceptable shapes (any one matches):
    //   const intent = listingType === 'rent' ? 'tenant' : 'buyer'
    //   listingType === 'rent' ? 'tenant' : 'buyer'
    //   listingType === "rent" ? "tenant" : "buyer"
    expect(componentSrc).toMatch(
      /listingType\s*===\s*['"]rent['"]\s*\?\s*['"]tenant['"]\s*:\s*['"]buyer['"]/
    );

    // Both literals MUST appear in the source — a future PR that drops
    // either branch would fail one of these greps.
    expect(componentSrc).toMatch(/['"]buyer['"]/);
    expect(componentSrc).toMatch(/['"]tenant['"]/);
  });

  test('component declares listingType prop in its TypeScript interface', () => {
    // The prop is part of the public component contract — if a future PR
    // removes it, page.tsx will type-check fail, but we also pin it here so
    // the contract is documented at the test level.
    expect(componentSrc).toMatch(/listingType\s*:\s*['"]sale['"]\s*\|\s*['"]rent['"]/);
  });

  test('A3 INTENT_ALLOWLIST contains both buyer and tenant (defense in depth)', () => {
    // This is the contract pin between A2 (CTA producer) and A3 (intent
    // consumer). If a future PR mutates the A3 allowlist and drops either
    // value, this test reds before the CTA ships broken rentals/sales.
    expect(INTENT_ALLOWLIST.has('buyer')).toBe(true);
    expect(INTENT_ALLOWLIST.has('tenant')).toBe(true);
  });

  test('CTA contact link tag pattern uses intent + listing query params in canonical order', () => {
    // The href template literal MUST start with `?intent=` and include
    // `&listing=` — any deviation (e.g. ?source=mobile-cta or reordered
    // params) would either break A3's classifyIntent expectations or hint
    // at a regression in how the slug is passed.
    expect(componentSrc).toMatch(/`\/contact\?intent=\$\{intent\}&listing=\$\{safeSlug\}`/);
  });

  test('CTA exports MobileStickyCta as both named and default export', () => {
    // Named export is what the page uses today; default export future-proofs
    // an accidental `import MobileStickyCta from ...` style.
    expect(componentSrc).toMatch(/export\s+function\s+MobileStickyCta\b/);
    expect(componentSrc).toMatch(/export\s+default\s+MobileStickyCta/);
  });

  test('CTA tel: href is the Mallan brokerage line, not an agent personal line', () => {
    // NY DOS §175.25 — agent name cannot appear without brokerage
    // attribution. The CTA elides agent-personal contact entirely; the
    // brokerage line is the only acceptable tel: target here.
    expect(componentSrc).toContain("'646-258-4460'");
  });

  test('CTA copy contains no Fair-Housing-prohibited flattery (sanity grep)', () => {
    const PROHIBITED = [
      /perfect for (your )?family/i,
      /ideal for /i,
      /exclusive community/i,
      /quiet neighborhood/i,
      /safe (area|neighborhood)/i,
      /good neighborhood/i,
      /no section 8/i,
      /no vouchers/i,
      /walking distance to (church|synagogue|mosque|temple)/i,
    ];
    for (const re of PROHIBITED) {
      expect(componentSrc).not.toMatch(re);
    }
  });

  test('CTA does not name a specific salesperson (NY DOS §175.25 attribution)', () => {
    // The page footer (rendered by app/layout.tsx) carries the brokerage
    // attribution. The CTA must not introduce an agent personal name that
    // would require co-attribution in this tight UI strip.
    expect(componentSrc).not.toMatch(/Maya Allan/i);
  });
});
