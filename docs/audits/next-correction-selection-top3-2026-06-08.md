# Next-Correction Selection — Top 3 (2026-06-08)

Analysis only. No code, no PR. One correction at a time under the #372 governance process.
Two competing priorities: **A. public compliance exposure (CC1/CC2)** vs **B. visible business
damage (media pipeline)**. Both are real; the choice should be deliberate. (Live "is it
populated/used?" items are flagged **runtime-confirm** — I can't see production data.)

## Option 1 — CC1: Coming Soon badge on the detail DB path
- **Exact defect:** the detail page's inline `fetchFromDB` DTO (`app/listing/[...slug]/page.tsx:653-657`) never sets `_displayCompliance.comingSoon/comingSoonDate`, so the badge gate (`:1321`) never fires on the **DB-first (primary) path**. Trestle-direct path sets it; DB path doesn't.
- **Public/user impact:** a Coming Soon listing detail renders with **no "No Showings/Open House" notice** on the main path.
- **Compliance/legal:** REBNY **UCBA Art. I §16(C)** — mandatory badge. Direct rule violation.
- **Business risk:** REBNY exposure; narrow (detail page only; cards already show it).
- **Blast radius:** **small** — 1 file (route the inline DTO through `dbListingToPublicDTO`'s existing `isComingSoonStatus` block) + 1 test.
- **Schema/migration:** **No.** · **DB write:** **No** (read-path DTO).
- **Live proof needed:** **Yes** — a Coming Soon detail render. **runtime-confirm a ComingSoon listing exists** (last DB read ≈ 2).
- **Test strategy:** failing test: DB-path DTO must set `comingSoon` for a ComingSoon listing → fix → green; + live preview capture.
- **Dependencies:** coupled with CC2 (same `page.tsx` render).
- **Why next:** P0 legal, lowest-risk, contained, no schema/DB; re-proves the process on a compliance surface.
- **Why wait:** doesn't touch the visible media damage; live proof depends on a ComingSoon listing existing.

## Option 2 — CC2: FARE Act `listingType` single-point-of-failure
- **Exact defect:** the entire FARE block is gated on `isRental` (`page.tsx:1725`) from `listingType==='rent'` (`:946`); a rental mis-typed as sale renders **zero** FARE disclosure. SplitCard omits the `FareActFeeBadge`.
- **Public/user impact:** a rental shown with **no FARE fee disclosure**.
- **Compliance/legal:** NYC **LL 119/2024**; DCWP up to **$2,000/violation** — highest per-violation $ here.
- **Business risk:** legal exposure on every affected rental view.
- **Blast radius:** **medium** — `page.tsx` (harden `listingType` derivation) + `SearchListingCard.tsx` (SplitCard) + tests; touches derivation logic (riskier).
- **Schema/migration:** **No.** · **DB write:** **No.**
- **Live proof needed:** **Yes, and hardest** — a live (ideally **mis-typed**) **rental** render (the actual risk; the 2026-05-20 A4 finding).
- **Test strategy:** `listingType` derivation edge cases (mis-typed rental must not drop FARE) + SplitCard badge test + live rental probe.
- **Dependencies:** CC1 (same detail render).
- **Why next:** highest legal $ exposure; same P0 tier.
- **Why wait:** larger/riskier than CC1; hardest §F proof. Best **right after CC1**, reusing the pattern.

## Option 3 — Media pipeline root-cause repair (idx-sync stomp / media-sync cursor / listing_media source of truth)
- **Exact defect (cluster):** (RC2) `lib/idx/sync.ts` writes `media: mapped.media` **unconditionally** on the incremental upsert (`:310`) while incremental sync does **not** fetch media (`useExpandMedia=false`, `:176`) → it **overwrites good media with empty** on every incremental run (media disappears). (RC1) `media-sync` cursor freeze starves new media. (M1) media has **3+ competing writers** + `listings.media` JSON vs `listing_media` table — no single source of truth.
- **Public/user impact:** **the visible site damage you keep hitting** — blank/photoless cards, missing 3D/video/floorplan, floorplan-as-hero (M3, `mapping.ts:335`), duplicates. **#1 product pain.**
- **Compliance/legal:** REBNY media-display rules (lower hard-legal line than CC1/CC2, but real).
- **Business risk:** **highest** — listing quality is the core product.
- **Blast radius:** **large + COUPLED.** As bundled (stomp + cursor + source-of-truth) it is a **multi-correction program, NOT one correction.** The source-of-truth (M1) part needs **schema** (drop JSON cols / denorm) and is **HELD**. The stomp/cursor are `lib/idx/**` write-path (the exact surface where the prior silent-drift wreckage happened).
- **Schema/migration:** **stomp (RC2): No** · cursor (RC1): No · source-of-truth (M1): **Yes (HELD)** · backfill (M4): **Yes-ish (HELD)**.
- **DB write:** the sync writes to the prod DB **at runtime**; but the **stomp FIX is unit-provable** (the upsert merge decision) with **no fix-time DB write**.
- **Live proof needed:** unit test proves the merge logic; **production restoration is NOT immediate** — already-lost media needs the **HELD backfill (M4)**, and full visible recovery needs the cursor fix too. So one correction here **stops the bleeding**, it does not by itself restore the missing photos.
- **Test strategy (for the contained entry = RC2 stomp):** unit test on the upsert — empty incoming media + existing media → update must **not clear** media; non-empty incoming → updates.
- **Dependencies:** RC2 ↔ RC1 ↔ M3 ↔ M4 are coupled; doing the rebuild safely also wants **Phase 1 measurement** + **Phase 2 loud-failures observability** first (plan ordering invariant — so the fix is verifiable, not blind).
- **Why next:** it is the actual business disaster and should not keep being postponed.
- **Why wait (be honest):** it is **not a single contained correction**; the contained entry (RC2 stomp) **stops future loss but does not restore** the missing media (that's the HELD backfill); it's write-path on the wreckage surface; and verifying production impact wants observability first.

## Recommendation — pick by goal (both defensible)
- **If the priority is closing legal exposure with a clean, low-risk, fast correction → CC1.**
- **If the priority is the visible site damage (your stated, repeated pain) → start the media
  program now, correction #1 = the idx-sync media-stomp fix (RC2).** It is the true root cause of
  media disappearing, is **contained + unit-provable + no schema/no fix-time DB write**, and stops
  the ongoing bleeding. **Set expectations:** RC2 alone stops *future* loss; visibly restoring the
  missing photos/3D/floorplans then needs the cursor fix (RC1) + the **HELD backfill (M4)** as the
  next corrections in the program — and pairing RC2 with the loud-failures observability (Phase 2)
  is strongly advised so its production impact is verifiable rather than blind.

**My single pick, weighing your stated priority:** **Option 3 — media, entry = RC2 idx-sync
media-stomp fix.** Rationale: it attacks the #1 business damage at the root, is provable by a unit
test (safe to land), and is the correct first domino of the media program. CC1 remains the right
choice only if you want legal-exposure-first this round; CC2 is best sequenced after CC1.

**No implementation performed. Awaiting your explicit approval of the single next correction.**
