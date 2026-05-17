# Mobile Search Card Overflow Audit — Report Only

> **⚠ ROOT CAUSE CORRECTED 2026-05-17T08:30Z (post PR #151).** This audit's original F1 hypothesis — that GridCard's outer `<Link>` was defaulting to `display: inline` and growing to max-content — was **wrong about the mechanism**. The actual fix on production proved the root cause is in the CSS Grid template, not the anchor's display value. See the "POST-PR-#151 ROOT CAUSE CORRECTION" section at the end of this file for the corrected diagnosis, the deployed fix, and the production proof. The pre-correction body below is preserved as the investigative trail.

**Status:** Read-only. **No code patched. No tests added. No commits. No deploys.**
**Run at:** 2026-05-17T03:30Z
**Trigger:** Playwright after-proof spec on PR #145 reported `cardW=583` on a 390×844 viewport at `/search?tab=rent-residential&sort=price-desc` — a card wider than the viewport. Same measurement reproduces on **production main**, so it predates PR #145 and is NOT a regression introduced by the conditional-crossOrigin patch. Maya separately tracked this as the pre-existing mobile overflow follow-up.
**Author:** Claude Code (under Maya direction, Lane B Priority 3).

---

## A. Observable

Playwright spec `tests/e2e/search-card-after-proof.spec.ts` line 296-298, executed against:
- **PR #145 preview deploy** (`mallan-nyc-git-fix-card-hero-white-border-detect-ef6c25-mallan.vercel.app`)
- **Production** (`mallan.nyc`)

Both produced an identical failure:

```text
URL:        /search?tab=rent-residential&sort=price-desc
Viewport:   390 × 844 (Chromium mobile)
Selector:   .glass-card  (first visible card)
Expected:   getBoundingClientRect().width  ≤ 400  (per assertion)
Received:   583
```

Card box is ≈193 px wider than the viewport. Test fails. **Production fails too** — confirms the overflow is pre-existing and reproducible across deploys; not a regression from PR #145.

This is the same class of bug Maya's PR #142 (PR-FE.1, merged 2026-05-15) fixed for the SPLIT-VIEW grid. PR #142 changed `grid grid-cols-2` → `grid grid-cols-1 lg:grid-cols-2` on `app/search/page.tsx:1066` (loaded grid) and `:1113` (skeleton grid). Those two grids are now mobile-safe. **The current overflow is in a different code path** — the post-hydration `'all-listings'` view, not the split view.

---

## B. Why mobile lands on `all-listings`, not `split`

`app/search/page.tsx:296-312`:

```tsx
const [viewMode, setViewMode] = useState<ViewMode>(() => {
  const allowed: ViewMode[] = ['split', 'all-listings', 'all-map', 'grid', 'list'];
  return viewParam && allowed.includes(viewParam) ? viewParam : 'split';
});
const { value: isMobileViewport, hydrated: viewportHydrated } = useClientOnly({
  read: () => window.innerWidth < 1024,
  serverFallback: false,
});
useEffect(() => {
  if (!viewportHydrated) return;
  if (viewParam) return;
  if (viewMode !== 'split') return;
  if (isMobileViewport) setViewMode('all-listings');
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [viewportHydrated, isMobileViewport, viewParam]);
```

Sequence:
1. SSR: `viewMode = 'split'` (no `view` URL param → default `'split'`).
2. Hydration: `useClientOnly` flips `isMobileViewport = true` (since `window.innerWidth = 390 < 1024`).
3. useEffect fires: `viewMode` flips from `'split'` → `'all-listings'`.
4. Render: lines 1151–1170 render the `all-listings` view.

PR #142's fix touched the SPLIT view at lines 1066 + 1113. The `all-listings` view at line 1153 was not part of that PR's scope.

---

## C. The likely culprit — `all-listings` view grid + the GridCard's intrinsic sizing

`app/search/page.tsx:1153`:

```tsx
<div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6">
  {sortedListings.map((listing) => (
    <div key={listing.id} ref={...}>
      <GridCard listing={listing} ... />
    </div>
  ))}
</div>
```

`grid md:grid-cols-2 gap-6` collapses to 1 implicit column on mobile (no `grid-cols-1` set → CSS Grid defaults to a single implicit column when no track template exists). That LOOKS correct. The grid item's wrapper div should stretch to the grid track width (≈358 px at 390 viewport minus the parent's `p-4` = 32 px).

Inside the grid item, `<GridCard>` returns:

```tsx
<Link href={...} className="glass-card rounded-3xl overflow-hidden ...">
  <div className="relative overflow-hidden">
    <IDXImage src={...} alt={...} aspect="card" autoCropWhiteBorder />
    {/* badges, photo count */}
  </div>
  <div className="p-4 sm:p-5">
    {/* price, beds, address, attribution, FareActFeeBadge, co-listed badge */}
  </div>
</Link>
```

The `<Link>` (rendered as `<a>`) has class `glass-card rounded-3xl overflow-hidden ...`. **`.glass-card` (defined in `app/globals.css:91`) sets background + backdrop-filter but does NOT set `display`.** Tailwind's preflight resets `<a>` to inherit display — without an explicit `block` or `flex` class, the `<a>` is `display: inline` by default.

An inline element is sized by its content's max-content, not by its block-level parent. The parent grid-item wrapper div (358 px wide) doesn't constrain the inline child's width — it just gives it a place to lay out.

### What pushes the intrinsic width to 583 px

Candidates inside `<GridCard>` that can produce a wide intrinsic width:

| # | Candidate | Why it could be 583 px |
|---|-----------|------------------------|
| C1 | `<IDXImage>` wrapper (`aspect-[4/3]` container) | Aspect-ratio containers without explicit width derive width from their content's intrinsic size. If the wrapper falls back to the natural width of the `<img>` (1920 px or 1089 px depending on source), the entire `<Link>` stretches to match. The `aspect-[4/3]` and `relative overflow-hidden` don't constrain this on an inline parent. **Most likely root cause.** |
| C2 | REBNY attribution paragraph `<p>RLS · Listing Courtesy of {office}</p>` | Some office names are long (e.g. "Compass Greater NY, LLC"). On an inline `<a>` without enforced wrapping, a non-breaking sequence could push content width. Less likely — most lines do wrap, and the parent `<div className="p-4 sm:p-5">` is block-level inside the `<a>`. |
| C3 | Co-listed badge from PR-FE.2 `<span className="inline-block ...">` | An inline-block badge can prevent its parent line from wrapping. The badge text "Additional listing source: {brokerage}" with a long brokerage can be 200+ px wide. Plausible secondary contributor. |
| C4 | `<FareActFeeBadge>` | Single-line badge component. Likely short — secondary contributor at most. |
| C5 | Address truncation working at C/W but not at C/W of the wider line | `<p className="text-[15px] text-brand-dark truncate mt-1.5">` exists in ListCard but NOT in GridCard. GridCard's address `<p>` is NOT truncated. A long unit number combined with a long street name could push the line wider than the parent's clip. |

The 583 px measurement is in the **inline-content shrink-to-fit** territory: it's not coming from a fixed `min-width` (none of the cards has `min-w-` classes), so it must be coming from content intrinsic width forcing the `<a>` to grow.

**Most-likely root cause:** **the `<Link>` element in `GridCard` is missing a `block` class.** Without it, the `<a>` is inline and stretches to its max-content. With `block`, the `<a>` would shrink to its grid-item parent's width (358 px) and overflow would be clipped (or wrap content) per the `overflow-hidden` already on the className.

### Quick sanity proof (read-only — not run by me)

A 5-line `evaluate()` in a Playwright session would settle it:

```js
await page.evaluate(() => {
  const card = document.querySelector('.glass-card');
  const cs = getComputedStyle(card);
  return {
    tagName: card.tagName,                    // expect "A"
    display: cs.display,                       // expect "inline" → the bug
    parentDisplay: getComputedStyle(card.parentElement).display, // expect "block" (grid item)
    parentWidth: card.parentElement.getBoundingClientRect().width, // expect ≈358
    cardWidth: card.getBoundingClientRect().width,                  // 583 observed
  };
});
```

If `display === "inline"` and `parentWidth ≈ 358` while `cardWidth === 583`, **C1 + missing `block` class is confirmed.**

---

## D. Why this is mobile-only (and survives the PR-FE.1 fix)

| Fact | Mobile (390 px) | Desktop (≥ 1024 px) |
|------|----------------|---------------------|
| `viewMode` post-hydration flip | `'split'` → `'all-listings'` (per §B) | stays `'split'` |
| Active grid container | `app/search/page.tsx:1153` `max-w-6xl mx-auto grid md:grid-cols-2 gap-6` (1-col on mobile) | `app/search/page.tsx:1113` `p-2 grid grid-cols-1 lg:grid-cols-2 gap-2` (2-col on desktop) |
| Card variant rendered | `GridCard` | `SplitCard` |
| `<Link>` display | inline (no `block` class) — overflows | inline — but 2-col grid track is only ≈350 px so it visually matches anyway, and the desktop test never asserts overflow |

On desktop the same bug class exists but is invisible because (a) the split-view uses `SplitCard` with the same shape, and (b) the desktop column widths happen to land near the card's "natural" inline content width by coincidence. The mobile assertion is the only one that catches it.

---

## E. Fix candidates (NOT applied — requires your approval per Priority 3 rules)

| # | Patch | Surface | Risk | Verification |
|---|-------|---------|------|--------------|
| F1 | Add `block` to GridCard's Link className (`className="block glass-card rounded-3xl ..."`) | `app/components/SearchListingCard.tsx:100` | **Lowest.** `block` makes the `<a>` take the grid item's width and inherit normal block-flow sizing. No other surfaces change. | Re-run `tests/e2e/search-card-after-proof.spec.ts:279` mobile test. Expect cardW ≈ 358. |
| F2 | Same as F1 but on all three cards (`GridCard`, `ListCard`, `SplitCard`) | `app/components/SearchListingCard.tsx:100, 212, 346` | Slightly broader. `ListCard` and `SplitCard` may already work because they use `flex` (which is also block-level). But adding `block` defensively doesn't hurt. | Same test + desktop spec. |
| F3 | Wrap the card in a block-level container inside `app/search/page.tsx:1155` | `app/search/page.tsx:1155` | Lowest blast radius (one file, one line, no shared component touched). But works around the bug rather than fixing it at the card level. | Same mobile test. |
| F4 | Add `block` only on the inner image wrapper (`<div className="relative overflow-hidden">` → `block`) | `app/components/SearchListingCard.tsx:106` | Lowest precision — addresses the IDXImage intrinsic-width contribution specifically. May not fully fix because the inline `<a>` still inherits intrinsic from text content. | Mobile test. |

**Recommended:** **F1** — minimal one-class addition, the right architectural fix (the card SHOULD be block-level), zero surface other than the GridCard's Link className.

```diff
- className={`glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group ${
+ className={`block glass-card rounded-3xl overflow-hidden hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] transition-all duration-300 group ${
```

A defensive expansion to F2 (add `block` to all three Link className strings) is one more line per file and arguably hygienic.

---

## F. Test coverage required to prevent recurrence

- `tests/e2e/search-card-after-proof.spec.ts:279` ("mobile 390: cards render and fill viewport") — already exists, currently failing. The F1 fix should turn it green. After the fix, change the assertion message from "(item 10)" to a more permanent label so the test sticks as a regression pin.
- Mirror the assertion at the **480 px** and **600 px** breakpoints to catch tablet-portrait edge cases.
- Source-regex pin in a runtime test: assert each card variant's className includes `block ` (or starts with it) — prevents a future "clean up redundant classes" refactor from silently dropping it.

---

## G. Out of scope for this audit

- ✗ Did NOT patch any code.
- ✗ Did NOT modify any test.
- ✗ Did NOT push a branch or open a PR.
- ✗ Did NOT touch PR #147 / #145 / #148.
- ✗ No backend / schema / Neon / cron / R2 / env / migrations.
- ✗ No reconciliation. No PR 5B. No CRM / Sentinel.

If you approve F1 + F2 + the Playwright sanity proof, the implementation PR would touch only:
- `app/components/SearchListingCard.tsx` (3 className edits, 1 word `block` added each)
- (Optional) one runtime source-pin test asserting `block` presence

Standing by for go / no-go on F1 vs F2 vs hold.

---

## H. Holds in effect right now

- ✅ PR #145 watcher `bvz9ayiax` still polling — awaits your Skip on the Neon-branching check
- ✅ PR #147 post-merge soak watcher `bzge96c2j` still polling for the 03:30 UTC feed-reconcile cron tick
- ✅ PR #148 held
- ✅ PR 5B blocked
- ✅ No projection-writer changes
- ✅ Reconciliation not run
- ✅ Neon API not called (no NEON_API_KEY in my session)
- ✅ No env / migrations / cron triggers / R2 / CRM / Sentinel work

**End of original report. No code modified.**

---

## POST-PR-#151 ROOT CAUSE CORRECTION — 2026-05-17T08:30Z

### What this section is

This section was added after PR #151 shipped to production. The F1 fix recommended in §E above (add `block` to GridCard's outer `<Link>`) was applied first and **did not move the measurement** — Playwright on the resulting preview still reported `cardW = 583 px`. A direct DOM probe revealed that F1 had targeted the wrong mechanism. The actual root cause and the deployed fix are documented here.

### Proven root cause (CSS Grid auto-column, not inline `<a>`)

The all-listings grid container at `app/search/page.tsx:1153` was:

```tsx
<div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6">
```

Tailwind's `md:grid-cols-2` only emits `grid-template-columns` at the `md` breakpoint (≥ 768 px). **Below `md` there was no column template defined.** With no `grid-template-columns`, CSS Grid defaults to a single auto-sized column, which expands to the max-content of its widest grid item. Because each grid item wraps an `<IDXImage>` whose `<img>` has 1920 px intrinsic source width, the auto column expanded to roughly the photo's natural width (clamped by other constraints to ~583 px after card chrome), and the grid item div was dragged along with the column. The `<a>`'s `display` value was a downstream effect, not the upstream cause.

DOM probe at 390 px viewport against the post-F1-only preview deploy showed:

```
Grid container `max-w-6xl mx-auto grid md:grid-cols-2 gap-6`   width: 358 ✓
  └ Grid item <div> (unnamed wrapper)                          width: 583 ✗
      └ <a> (after F1: `block glass-card …`)                   width: 583 ✗
```

The grid CONTAINER was correctly 358 px (the parent track at 390 px viewport minus padding). The grid ITEMS overflowed it. F1 alone could not address this because the constraint that needed enforcing was the GRID TEMPLATE, not the anchor's display.

This is the same bug class PR #142 (PR-FE.1, merged 2026-05-15) fixed on the SPLIT-VIEW grid at `app/search/page.tsx:1113` with `grid-cols-1 lg:grid-cols-2`. The all-listings grid at line 1153 was outside PR #142's scope and inherited the bug.

### Production fix (deployed via PR #151, merge commit `6a9f61cd`)

Two files, two className edits:

**`app/search/page.tsx:1153`** (the actual fix):

```diff
- <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-6">
+ <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
```

Adding `grid-cols-1` pins the mobile track to `minmax(0, 1fr)` = 358 px at 390 px viewport. The grid item is now constrained to that track width, and the `<a>` inside it inherits the constraint normally.

**`app/components/SearchListingCard.tsx:100`** (defensive, kept from F1):

```diff
- className={`glass-card rounded-3xl overflow-hidden hover:-translate-y-1 …`}
+ className={`block glass-card rounded-3xl overflow-hidden hover:-translate-y-1 …`}
```

Kept as defense-in-depth. With `grid-cols-1` setting the track, the grid item is constrained whether or not the `<a>` is block-level — but a `block`-flagged `<a>` is the semantically correct shape for an anchor wrapping a whole card and prevents the same class of bug from re-emerging if a future grid-template refactor accidentally removes column constraint. Both edits include explanatory inline comments documenting why each class is load-bearing.

### Production proof (Playwright against `mallan.nyc` post-merge)

`tests/e2e/search-card-after-proof.spec.ts` against the production deployment `dpl_DDWia9PSGRFBLmhue7WAS3Uv7HGB` (merge SHA `6a9f61cd`):

| Surface | Before PR #151 (production main) | After PR #151 (production main) |
|---|---|---|
| Mobile 390 viewport, first `.glass-card` width | **583 px** ✗ (exceeds viewport by 193 px) | **358 px** ✓ (fits viewport; assertion `≤ 400` passes) |
| Desktop 1440, 401 WEST PH transform | `matrix(1.2, 0, 0, 1.2, 0, 0)` | `matrix(1.2, 0, 0, 1.2, 0, 0)` — unchanged ✓ |
| Desktop 1440, 401 WEST PH visible white band | T=0 / B=0 / L=3 / R=3 px (≤5 target) | T=0 / B=0 / L=3 / R=3 px — unchanged ✓ |
| Desktop 1440, 401 WEST #6 transform | `matrix(1.25929, 0, 0, 1.25929, 0, 0)` | `matrix(1.25929, …)` — unchanged ✓ |
| Desktop 1440, 15 W 68TH transform + animation | `matrix(1.04, …)` + `liquidMotion` | `matrix(1.04, …)` + `liquidMotion` — unchanged ✓ |
| Desktop 1440, 15 W 68TH white-band depth | 0 / 0 / 0 / 0 (no false positive) | 0 / 0 / 0 / 0 — unchanged ✓ |
| FeaturedListings on `/` | renders, NOT opted in to autoCropWhiteBorder | unchanged ✓ |
| Playwright total | 3 of 4 pass (mobile failing) | **4 of 4 pass** ✓ |

PR #149's adaptive crop behavior on heavily-bordered photos is fully preserved. The clean-photo false-positive guard on 15 W 68TH continues to hold.

### What this correction does NOT change

- ✗ No source code in this correction — the corrections are documentation-only.
- ✗ The shipped PR #151 fix is untouched.
- ✗ Sections §A — §H above are preserved verbatim as the diagnostic trail. Only the audit's CONCLUSION (the F1 recommendation in §E) was wrong about the mechanism.
- ✗ The shipped fix matches PR #142's `grid-cols-1 lg:grid-cols-2` pattern for the split-view grid — same correction class, different active surface.

### Lessons for future audits

1. **Test the hypothesis before recommending it as F1.** A 5-line DOM probe with `getComputedStyle(card.parentElement).width` would have shown the grid container at 358 px but the grid item at 583 px, immediately surfacing the real mechanism. The audit's "quick sanity proof" appendix at §C correctly outlined this probe but did not execute it.
2. **Inline `<a>` growing to max-content is a real CSS phenomenon, but it usually fails in the OPPOSITE direction** — when the parent is bigger than max-content, the inline `<a>` shrinks. The "inline grows past parent" case requires content that can't wrap and a parent without a width constraint. The grid container DID have a width constraint (358 px); the missing constraint was on the GRID TEMPLATE.
3. **Symptom-mirroring across cards is a strong hint about the layer.** Every card on mobile measured 583 px regardless of content. That uniformity points at a shared layout container (the grid), not at per-card content (the `<a>`).

End of correction. Audit closed.
