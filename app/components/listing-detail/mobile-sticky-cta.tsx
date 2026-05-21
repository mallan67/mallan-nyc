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
}: MobileStickyCtaProps): React.JSX.Element {
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
      // `z-40` = above page content, below the cookie banner if present.
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
