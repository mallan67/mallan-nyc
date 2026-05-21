'use client';

/**
 * A2 (PR-A2-mobile-cta, 2026-05-21) — Mobile above-fold contact CTA.
 *
 * Class-A launch-blocker fix per
 *   docs/audits/exclusive-launch-readiness-audit-2026-05-20.md A2.
 *
 * Problem (pre-fix, ddd1d74a):
 *   On mobile (390 px) the listing detail page renders Breadcrumb → Gallery
 *   (aspect-[4/3] ≈ 292 px) → Mobile sticky-top price/CTA bar (positioned
 *   AFTER the gallery in document flow, so it scrolls in below the fold).
 *   The agent-contact sidebar is `hidden lg:block` (A1 layout) so it never
 *   appears on mobile. Net result: a paid-social visitor arriving at the
 *   new exclusive sees a photo, scrolls past more photos, and never sees a
 *   contact button without scrolling past the entire above-the-fold zone.
 *   Frontend-auditor measured 0 button matches in the top 844 px DOM scan.
 *   Existing top-bar buttons use `py-2.5 text-sm` → ~34 px tall, below the
 *   WCAG 2.5.5 44×44 touch target floor.
 *
 * Fix:
 *   Render a `fixed bottom-0 left-0 right-0` CTA bar on `<md`. It is in
 *   viewport from page load (no scroll needed) and the touch target is
 *   `min-h-12` (= 48 px) plus generous tap padding. The bar hides on
 *   `md:hidden` so the desktop sidebar (and tablet/laptop layout) is
 *   byte-identical to pre-fix.
 *
 * COOKIE-CONSENT STACKING FIX (Codex review pinned at ed3d6b56, 2026-05-21):
 *   The global `<CookieConsent />` (app/components/CookieConsent.tsx:113,
 *   mounted in app/layout.tsx) renders a `fixed bottom-0 z-50` overlay on
 *   first visit when no consent is stored. The A2 CTA uses `z-40`, so on
 *   a first-time mobile visitor the consent banner sits ON TOP of the CTA
 *   and the "above-fold contact action" is not actually accessible until
 *   the banner is dismissed — defeating the whole point of A2.
 *
 *   Decision: Option A (chosen of A/B/C in the agent brief).
 *     - A (chosen):    Hide the CTA while consent banner is pending; render
 *                      it once consent is granted or denied. Smallest test
 *                      surface, no z-index race, no visual competition for
 *                      the same screen-bottom strip.
 *     - B (rejected):  Bump z-index to z-[60]. Simpler, but CTA and consent
 *                      banner visually compete for the same bottom region
 *                      until the banner is dismissed.
 *     - C (rejected):  Shift CTA upward (e.g. bottom-[88px]) while banner
 *                      visible. Best UX in theory but adds a magic offset
 *                      and a second responsive variant for tests to cover.
 *
 *   Why A is fine UX: a first-time visitor must interact with the cookie
 *   banner before any meaningful site interaction anyway (it's a modal-ish
 *   bottom dialog). Once they pick "Essential Only" or "Accept All", the
 *   CTA flips into view in the same screen region the banner just vacated
 *   — total below-fold visit time is bounded by the consent-dismiss tap.
 *
 *   Implementation: this component is now a client component (`'use client'`
 *   directive on line 1) so it can consume `useConsentStatus()` from
 *   `app/components/CookieConsent.tsx`. The hook returns `hasConsent` =
 *   `true` when a consent record exists in localStorage (granted OR denied),
 *   `false` otherwise. We render nothing until `hasConsent === true`.
 *
 *   Import is READ-ONLY — we do NOT modify CookieConsent.tsx.
 *
 * LISTING-TYPE → INTENT MAPPING (Maya correction, 2026-05-21):
 *   - listingType === 'sale' → intent=buyer
 *   - listingType === 'rent' → intent=tenant
 *
 *   Both 'buyer' and 'tenant' are verified members of the A3 closed
 *   INTENT_ALLOWLIST in `lib/leads/intent.ts` (lines 44–53):
 *     general, buyer, seller, exclusive-seller, townhouse-seller,
 *     international-seller, landlord, tenant
 *   classifyIntent() routes 'buyer' → roles=['buyer'] and 'tenant'
 *   → roles=['tenant'], so the contact form tags the lead correctly for
 *   downstream queue assignment. NEVER hardcode 'buyer' for rentals —
 *   that misroutes every rental inquiry to the buyer queue and was the
 *   bug Maya caught in the prior agent's draft (intent=buyer for all
 *   listings regardless of type).
 *
 * Compliance posture (run via rebny-compliance skill):
 *   - The CTA is a `<a href="/contact?intent=<value>&listing=<slug>">` —
 *     NOT a form submission. The TCPA affirmative-consent gate lives on
 *     the `/contact` form itself (consent checkbox + DB-recorded
 *     consent_captured_at). The CTA is a navigation link only — no PII
 *     collected, no consent claim made, no autoresponder triggered.
 *   - intent values are the 8 closed values in
 *     `lib/leads/intent.ts:INTENT_ALLOWLIST` (A3). Both 'buyer' (sale)
 *     and 'tenant' (rent) are explicit members; the runtime test asserts
 *     both literals are present in the allowlist (defense in depth in
 *     case a future PR drops 'tenant').
 *   - `listing=<slug>` is a separate query param so it cannot collide
 *     with A3's intent contract. The contact form does not yet consume
 *     it (out of scope — A3 is merged); it is reserved for a follow-up
 *     PR that prefills the inquiry message.
 *   - Copy: "Contact agent" — concise, neutral, no protected-class
 *     language (Fair Housing Federal + NYS + NYC), no agent name
 *     (NY DOS §175.25 would require brokerage co-attribution if a
 *     specific salesperson were named; we sidestep this by naming the
 *     role, not the person — the brokerage attribution already lives
 *     in the page footer per RPL §441 / 19 NYCRR §175.25).
 *   - No protected-class flattery in the secondary "Call" CTA label.
 *
 * Data-testid markers (used by tests/e2e/listing-detail-mobile-cta.spec.ts
 * and tests/runtime/listing-detail-mobile-cta.test.ts):
 *   - data-testid="mobile-sticky-cta"            on the wrapper
 *   - data-testid="mobile-sticky-cta-contact"    on the Contact agent link
 *   - data-testid="mobile-sticky-cta-call"       on the Call link
 */

import { useConsentStatus } from '@/app/components/CookieConsent';

interface MobileStickyCtaProps {
  /** Canonical listing slug — used to tag the contact request in the URL. */
  slug: string;
  /**
   * Listing type — drives the CTA intent value.
   *   'sale' → intent=buyer
   *   'rent' → intent=tenant
   * Both map to closed-allowlist values in `lib/leads/intent.ts`.
   */
  listingType: 'sale' | 'rent';
  /** Brokerage phone number for the call-now CTA (defaults to Mallan main line). */
  phone?: string;
}

const MALLAN_BROKERAGE_PHONE = '646-258-4460';

export function MobileStickyCta({
  slug,
  listingType,
  phone = MALLAN_BROKERAGE_PHONE,
}: MobileStickyCtaProps): React.JSX.Element | null {
  // Codex #1 fix (ed3d6b56): suppress the CTA while the cookie consent
  // banner is visible. `useConsentStatus()` returns `hasConsent: false`
  // when no consent record exists in localStorage (i.e. the banner is
  // showing). We render nothing until the user dismisses the banner via
  // "Essential Only" / "Accept All" / "Save Preferences". After dismissal,
  // `useConsentStatus()` flips to `hasConsent: true` (banner removed)
  // and the CTA appears in the same bottom-of-viewport strip.
  //
  // First-paint behavior: `useClientOnly` (inside `useConsentStatus`) gates
  // on hydration, so `hasConsent` is `false` during SSR. The CTA does not
  // render until after hydration — there is no flash-of-CTA-then-banner.
  const { hasConsent } = useConsentStatus();
  if (!hasConsent) {
    return null;
  }

  // Sanitize slug for query-string safety. We never trust slug to be already
  // URL-safe (defense in depth even though Prisma slugs are already
  // [a-z0-9-]). encodeURIComponent is the right primitive here.
  const safeSlug = encodeURIComponent(slug);
  // Listing-type → intent mapping (see file header). Both literal values
  // ('buyer', 'tenant') are members of the A3 INTENT_ALLOWLIST in
  // `lib/leads/intent.ts`; the runtime test (tests/runtime/listing-detail-mobile-cta.test.ts)
  // asserts both are present in the allowlist so a future PR that drops
  // either reds before the CTA ships broken.
  const intent = listingType === 'rent' ? 'tenant' : 'buyer';
  const contactHref = `/contact?intent=${intent}&listing=${safeSlug}`;
  // tel: links accept hyphens and parens; the brokerage line is hardcoded
  // to a constant the test pins (no PII exposure / no agent personal line).
  const telHref = `tel:${phone.replace(/[^0-9+]/g, '')}`;

  return (
    <div
      data-testid="mobile-sticky-cta"
      // `md:hidden` = hide on md (768 px) and up; visible on phones only.
      // `fixed bottom-0` = always pinned to the bottom of the visual viewport,
      //   in the user's eye-line from page load (no scroll required to find).
      // `z-40` = above page content; the cookie banner (z-50) is the only
      //   higher-priority bottom overlay, and we already gate render on
      //   consent dismissal above so they never visually conflict.
      // `pb-[env(safe-area-inset-bottom,0px)]` = clears the iOS home indicator
      //   when `viewport-fit=cover` is set; harmlessly 0 px otherwise.
      // `backdrop-blur-xl bg-white/95` matches the sticky-top bar styling.
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-xl border-t border-black/10 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="flex items-stretch gap-2 px-4 py-3">
        <a
          data-testid="mobile-sticky-cta-call"
          href={telHref}
          aria-label="Call Mallan Real Estate"
          // min-h-12 (48 px) + min-w-12 (48 px) clears WCAG 2.5.5 (44×44).
          // basis-1/3 keeps Call as the secondary action visually.
          className="flex items-center justify-center min-h-12 min-w-12 basis-1/3 px-4 rounded-full border border-brand-dark/15 bg-white text-brand-dark text-[15px] font-medium hover:bg-brand-dark/5 active:bg-brand-dark/10 transition-colors"
        >
          Call
        </a>
        <a
          data-testid="mobile-sticky-cta-contact"
          href={contactHref}
          // Primary CTA — full-width remainder. min-h-12 = 48 px touch target.
          className="flex items-center justify-center min-h-12 flex-1 px-5 rounded-full bg-brand-dark text-white text-[15px] font-semibold hover:bg-brand-dark/90 active:bg-brand-dark/80 transition-colors"
        >
          Contact agent
        </a>
      </div>
    </div>
  );
}

export default MobileStickyCta;
