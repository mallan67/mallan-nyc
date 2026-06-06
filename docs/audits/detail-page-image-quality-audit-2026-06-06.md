# Detail-Page Image Quality Audit (report-only) — 2026-06-06

> **Mode: REPORT ONLY.** No code edits, no DB mutation, no env/deploy, no
> migrations, no R2/backfill changes. Separate from #364 backfill preview, #362
> dedupe, and Coming Soon. Sample: `/listing/467-central-park-apt-7g-new-york-city-ny-10025/rls20095827`.

## TL;DR

The detail hero is pixelated because **the image the app resolved for the sampled
listing is small (575×530)**, not because of a code mis-selection or proxy
compression. The hero is the **proxied Cotality original `MediaURL`** displayed at
~1027px → **1.79× upscale**. The media proxy does **not** resize; the resolver
correctly picks the full-size field; the hero is a plain `<img>` (no Next/Image
downscaling). **For the sampled IDX listing, the card and detail hero currently
resolve to the same `MediaURL` (575×530).** We have **not** yet proven whether
Cotality publishes alternate image sizes, `ImageSizeDescription` variants, URL
modifiers, or entitlement-dependent media alternatives — that requires a live
Trestle Media probe (§4). **CRM exclusives (SL-/RL-) are unaffected** — they carry
R2 `-hero.webp` (1600px) and render sharp.

➡️ The fix is **not** "use a different field" (the `url`/`thumbUrl` split already
exists and works for CRM). The lever is the **IDX source resolution**: either
fetch a larger Cotality size *if one is available* (must be verified live), or
stop upscaling a small bitmap on the display side. **Backfill (#364) does NOT fix
this** — it stores the same `MediaURL`.

---

## 1. Live proof (sample listing, rendered DOM)

Captured from the live page (Playwright, 2026-06-06):

| Element | Rendered `src` | Native px | Displayed px | Upscale |
|---|---|---|---|---|
| **Hero** | `/api/media/proxy?url=https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1173132928/1/…/zp3U4Uy…` | **575 × 530** | 1027 × 685 | **1.79×** |
| First thumb | *same URL* | 575 × 530 | 88 × 60 | 0.15× (fine) |

- Hero classification: **proxied Cotality original `MediaURL`** — `heroIsProxy=true`,
  `heroIsR2=false`, `heroIsCardVariant=false`, `heroIsHeroVariant=false`.
- The thumbnail uses the **identical** URL (no separate smaller asset exists for
  IDX media).
- Lightbox displays the same 575px image at `max-w-[95vw]` → on a 1440px screen
  ≈ 1368px → **~2.4× upscale** (the most visibly pixelated view).
- Cards on the homepage render the same proxied Cotality URLs at ~400px display —
  at/below native 575px, so **cards look fine**; only the large detail
  hero/lightbox upscale.

## 2. Media flow (exact files/lines — Class A, static)

| Step | Location | Fact |
|---|---|---|
| Detail gallery | `app/components/ListingMediaGallery.tsx:146-156` | Hero = plain `<img src={currentImage.url}>` (NOT Next/Image), `object-cover` in `aspect-[3/2]`. No optimizer in the path. |
| Thumb strip | `ListingMediaGallery.tsx:219-221` | `src = img.thumbUrl || img.url` — correctly prefers the small variant. |
| Lightbox | `ListingMediaGallery.tsx:319-322` | `src = currentImage.url`, `object-contain` at `max-w-[95vw]`. |
| Detail images built | `app/listing/[...slug]/page.tsx:1195-1198`, gallery props `:1313-1320` | `images` = `listing.media` photos; passes `{url, thumbUrl}` through. |
| Trestle-path media | `page.tsx:256-261` | `resolveListingMedia(fetchListingMedia(...), { mapUrl: proxyDetailMediaUrl })` → `url`/`thumbUrl`. |
| Resolver full-size | `lib/media/listing-media-resolver.ts:191-195 pickFullSizeUrl` | Prefers `-hero.webp`; **for Trestle/legacy (no variant) → `cached \|\| original`**. |
| Resolver thumb | `listing-media-resolver.ts:202-206 pickThumbUrl` | Prefers `-card.webp`; for Trestle/legacy → `cached \|\| original` — **identical to full-size for IDX**. |
| Trestle media fetch | `lib/idx/fetch.ts:467-531 fetchListingMedia` | `$select=MediaURL,MediaType,MediaCategory,Order,…` — **one `MediaURL` per row; no size parameter/field**. `url = String(m.MediaURL)` (`:531`). |
| Media proxy | `app/api/media/proxy/route.ts` | Adds Bearer auth, streams `response.body` **unchanged**, caches 7d. **No resize/recompress.** |
| CRM hi-res path | `lib/media/media-sync-service.ts:139 buildMediaR2Key` + R2 upload | CRM uploads emit `-hero.webp` (1600px) / `-card.webp` (800px) / `-thumb.webp` (400px) → `pickFullSizeUrl` returns the **1600px hero** for SL-/RL-. |

## 3. Why the quality is poor (proven)

1. The `MediaURL` the app resolved for this photo points to a **575×530** image.
   (Whether this is the only size Cotality publishes, or whether a larger
   variant/entitlement exists, is **not yet proven** — see §4.)
2. The detail hero/lightbox display at ~1000–1370px, **upscaling 1.8–2.4×** — the
   browser stretches a small bitmap → visible pixelation.
3. It is **NOT** any of the commonly-suspected causes:
   - **Not the proxy** — it streams bytes unchanged (no resize/compress).
   - **Not a card/original mixup** — the hero uses `url` (full-size field), the
     thumb uses `thumbUrl`; the resolver picks the original, not the card.
   - **Not Next/Image** — the hero is a plain `<img>`, no optimizer downscaling.
   - **Not card/detail field confusion** — for the sampled IDX listing, `url` and
     `thumbUrl` resolved to the **same** Cotality URL. (Whether the feed exposes a
     larger size for that same photo is unproven — §4.)
4. **CRM exclusives are sharp** (R2 `-hero.webp` 1600px). This is consistent with
   the defect being **IDX-feed-sourced** media resolution rather than the display
   code — but the IDX feed ceiling itself is **not yet proven** (§4).

## 4. OPEN question — must be verified LIVE before any fix (Class B)

**Two possible roots, and we do NOT yet know which:**
- **A.** the app is using a low-res/proxied/card-size image for the detail hero, or
- **B.** Cotality only provides a low-res image for these listings.

Per the compliance charter (do not assert live-feed truth from the repo): **whether
Cotality/Trestle exposes higher-resolution variants through `ImageSizeDescription`,
alternate Media rows, URL modifiers, or entitlement-specific access is unproven.**
For the sampled listing the app resolved only one usable `MediaURL` (575×530) — that
is a **sample-specific observation, not a proven feed ceiling.**

**A follow-up engineer MUST run a live Trestle Media probe before choosing Track A
vs Track B — do not skip it and do not implement mitigation on assumption.**

Live-verification requirements (read-only, manual — NOT done in this report):
1. Inspect live Trestle `Media` rows for several sample listings
   (`npm run trestle:probe` / a `Media` OData query by `ResourceRecordKey`).
2. Check `ImageSizeDescription`, `MediaModificationTimestamp`, `MediaObjectID`, and
   any `MediaURL` variants / size modifiers / alternate Media rows per photo.
3. Compare the **original** `MediaURL` pixel dimensions vs the proxied and any R2
   dimensions.
4. Verify whether higher-resolution assets exist (Track A) or whether the feed
   itself is low-res for these listings (Track B).

If the probe proves 575px is the IDX Plus ceiling, the source cannot be improved
and only display mitigation (Track B) remains; if it shows a larger size exists,
Track A (higher-res fetch + re-sync) is correct.

## 5. Proposed fix (conditional on §4)

**Track A — if a larger Cotality size IS available (preferred):**
- Request it in `fetchListingMedia` (`lib/idx/fetch.ts`) and the media-sync
  `$select`/URL builder (`lib/idx/media-sync.ts`), store the larger URL as
  `media_url_original`; cards keep using `thumbUrl`. Re-sync media.
- This is a **feed-fetch change** (+ a media re-sync), not a frontend change.

**Track B — if 575px is the IDX Plus ceiling (mitigation only):**
- Stop upscaling: cap the hero/lightbox display so a small native bitmap is not
  stretched beyond ~1–1.25× (e.g., constrain hero container max-width toward
  native size, or `object-contain` with a centered max-native frame). This
  reduces *visible* pixelation; it cannot add real resolution.
- Accept that IDX photos are feed-limited; CRM exclusives remain the hi-res path.

**Either track — independent of the media-coverage backfill (#364):** the backfill
stores the same `MediaURL`, so it does **not** improve resolution. Flag this so no
one expects backfill to sharpen IDX photos.

## 6. Tests

- Resolver (regression): assert the detail hero uses the **full-size** `url` and
  the thumb uses `thumbUrl`; assert `pickFullSizeUrl` returns the `-hero.webp`
  variant for CRM (already partly covered in `listing-media-resolver.test.ts`).
- Gallery (component): assert the hero `<img src>` equals `currentImage.url` (never
  `thumbUrl`) and the thumb uses `thumbUrl || url`.
- Track A only: a `fetchListingMedia` test that the larger-size URL/param is
  requested and mapped to `media_url_original`.
- A guard that the proxy is still used for `cotality.com` hosts (auth preserved,
  token never client-exposed).

## 7. Frontend-only vs media/R2/backfill

- **Not** fixable to true quality by frontend display alone — the source bitmap is
  small. Track A is a **feed-fetch + re-sync** change; Track B is frontend
  mitigation (reduces upscaling, not resolution).
- **R2** is unaffected (it mirrors whatever `media_url_original` is; a larger
  original would simply mirror larger).
- **CRM exclusives** already hi-res — no change.

## 8. Compliance

- **Attribution / courtesy unchanged** — this is media URL/size only.
- **Keep proxying IDX media** — Cotality `MediaURL` requires Bearer auth
  (`app/api/media/proxy`); the token is added server-side and must never be
  exposed to the client. Any "fetch the original" fix must stay behind the proxy.
- Do not expose private/forbidden media URLs or the access token.

## Correcting the initial hypothesis (honest note)

The starting bet was *"detail hero pulls the same field as cards, normalized to a
small card/proxy asset; detail needs a separate fullUrl while cards use
thumbUrl."* The `url` (full) vs `thumbUrl` (card) split **already exists** and
works for CRM (1600px hero vs 800px card). For the **sampled IDX** listing the two
resolved to the **same** Cotality URL — **not** because we downscaled to a card
asset, but because the app found only one usable `MediaURL` for that photo. Whether
a higher-resolution variant exists for IDX media is **unproven** (§4). So the lever
is the **IDX source resolution** (Track A *if* a larger size exists), with display
mitigation (Track B) as the fallback — *not* a field-selection change. The live
Trestle probe (§4) decides which.

> **Stop after report.** No code, no DB, no env, no R2/backfill. Next concrete
> step is the **live Trestle Media verification** in §4 to choose Track A vs B.
