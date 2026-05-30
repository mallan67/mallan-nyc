# International Search Exposure Plan — 2026-05-18

> **Status:** Plan + checklist. The two landing pages (`/buy/international` + `/sell/international`), the `llms.txt` update, the `sitemap.ts` additions, and the `robots.ts` carve-out ship together with this doc.
> **What this plan does NOT include:** listing-data syndication to any non-REBNY portal, multi-language page versions, currency switching, paid placements, vendor contracts. All deferred and itemized below.
> **Owner:** Maya. Most items below are **manual tasks Maya completes outside the repo** (account claims, profile fills, agency relationships).

---

## Hard rule on REBNY data

Every item in this plan is brand / content / lead-capture only. **No item in this plan exposes RLS listing data, IDX feed records, or any per-row MLS field to a non-authorized surface.** Listing-data syndication remains gated by:

1. REBNY UCBA 2026 Art. I §5 (Owner Opt-Out, Participant Only, Simultaneous Distribution)
2. The IDX Plus license terms with Cotality/Trestle (read-only display on mallan.nyc)
3. REBNY's pre-licensed-provider list for VOW, LMP, IDX, Direct Network Portal (3 / 8 / 30 / 3 vendors respectively)

If a portal, syndication partner, AI feed, or third-party listing site asks for the RLS data: **stop and route to legal + rlssupport@rebny.com before any commitment.**

---

## 1. Webmaster Tools registration (manual · Maya)

One-time account claims. All free. Estimated time: 30 minutes per service.

| Service | URL | Why | Verification method |
|---|---|---|---|
| Google Search Console | https://search.google.com/search-console | Search Console is the source of truth for Google. Sitemap submission + Core Web Vitals + crawl errors. | DNS TXT record or HTML file upload |
| Bing Webmaster Tools | https://www.bing.com/webmasters | Bing powers Yahoo + DuckDuckGo + ChatGPT search (the Bing index is the AI-search corpus surface). | DNS TXT or import from Search Console |
| Yandex Webmaster | https://webmaster.yandex.com | Russian + Eastern European audience. Yandex still dominates RU search. | DNS TXT or HTML file |
| Baidu Webmaster | https://ziyuan.baidu.com | Chinese mainland audience. NYC luxury inbound from PRC investors is significant. Requires a Chinese phone number for full features. | DNS TXT or HTML file |
| Naver Webmaster | https://searchadvisor.naver.com | Korean audience. Smaller than the others but historically meaningful for NYC luxury. | DNS TXT or HTML file |
| DuckDuckGo | (Reads Bing index) | No separate registration — Bing claim covers it. | Indirect, via Bing |
| Brave Search | https://search.brave.com | Reads its own crawler + Bing fallback. Webmaster Tools not yet a separate product. | Indirect |

**Sitemap to submit at each service:** `https://mallan.nyc/sitemap.xml`

**Post-claim verification (each service):**
1. Sitemap submitted and accepted
2. No critical crawl errors
3. Mobile-friendly check passes
4. HTTPS certificate detected

---

## 2. Maps + Local presence (manual · Maya)

Local search is the #1 NYC real-estate discovery channel.

| Service | URL | Notes |
|---|---|---|
| **Google Business Profile** | https://www.google.com/business | Office address (400 E 90th Street, Suite 17C), category "Real estate agency", hours, photos, services (Buyer / Seller / Rental representation), languages (English, Hebrew), website link to mallan.nyc, phone (646-258-4460). REBNY license #10991205323 in the description. Encourage every closed client to leave a review. |
| **Apple Maps Connect** | https://mapsconnect.apple.com | Apple's index — distinct from Google. ~25% of mobile search share. |
| **Bing Places** | https://www.bingplaces.com | Powers Bing + DuckDuckGo + AI search local panels. |
| **Yelp for Business** | https://biz.yelp.com | Lower priority for NYC real estate but still surfaces in some searches. |
| Per-agent Google Business Profiles | as above | If individual agents want a separate profile, they can add one. Brokerage name + brokerage license # must appear per NY DOS §175.25. |

**Local-search Schema.org data:** Already added to both new international pages as `RealEstateAgent` JSON-LD. The brokerage's home page should also have `Organization` + `LocalBusiness` schema — verify or add as a follow-up (out of scope this PR).

---

## 3. AI search optimization (technical → in this PR · manual → see below)

### Technical (shipped in this PR)

- ✓ `public/llms.txt` augmented with International section + new URLs
- ✓ `app/robots.ts` now allows `/buy/international` and `/sell/international` for AI training bots (GPTBot, ClaudeBot, Applebot-Extended, Amazonbot, YouBot) by adding them to BRAND_ALLOW with a more-specific path than the parent `/buy` Disallow
- ✓ JSON-LD `FAQPage` + `RealEstateAgent` schema embedded in both new pages
- ✓ Sitemap surfaces the two new URLs

### Manual (Maya, after deploy)

| Surface | Action | Why |
|---|---|---|
| ChatGPT custom GPT directory | Submit "Mallan Real Estate NYC" as a public custom GPT once GPT-store policy allows real-estate listings (currently restricted) | Direct user access in ChatGPT |
| Perplexity Spaces | Create a public Mallan Real Estate Space with the brand pages and FAQs | Perplexity user-base growth |
| Google AI Overviews | No claim mechanism — Google selects from indexed pages. Ensuring sitemap + structured data is the lever. | Already covered |
| Bing AI Chat citations | Source from Bing index — claiming Bing Webmaster Tools is the mechanism | Already covered in §1 |

### What NOT to do for AI search

- Do NOT submit individual listing URLs to AI agents — REBNY UCBA Art. III §2(C) + IDX Plus license terms restrict this
- Do NOT publish a feed of listings as JSON/XML on a publicly indexable path
- Do NOT include listing data in `llms-full.txt` even if you build one — keep AI corpus at the neighborhood/brand level only

---

## 4. International SEO roadmap (multi-phase)

### Phase 1 — Now (this PR)
- ✓ Two English landing pages (`/buy/international`, `/sell/international`)
- ✓ International-buyer + international-seller FAQs marked up as `FAQPage` schema
- ✓ International section in `llms.txt`
- ✓ Sitemap + robots updates

### Phase 2 — Quarter 2026 Q3
- `hreflang` declarations once translated content exists. Empty hreflang on English-only pages produces no benefit and risks downgrades — don't add until alternate-language versions are real.
- Currency display: add an optional currency toggle (USD/EUR/GBP/JPY/CNY/AUD/HKD/SGD) to the contact form on the international pages. Pull rates from a free FX feed (e.g. exchangerate.host). Display-only, no business logic.
- `Place` + `Country` JSON-LD on each international page enumerating target service areas

### Phase 3 — Quarter 2026 Q4 / 2027 Q1
- **Translated pages** for the highest-intent inbound markets, in priority order:
  1. **Spanish (es-US + es-ES + es-MX)** — single largest non-English NYC inbound segment
  2. **Mandarin Chinese (zh-Hans for mainland, zh-Hant for HK / TW)** — significant luxury inbound
  3. **Russian (ru-RU)** — historical Brighton Beach / Brighton Heights / Manhattan luxury inbound
  4. **Portuguese (pt-BR + pt-PT)** — strong Brazilian NYC buyer cohort
  5. **French (fr-FR)** — European luxury inbound
  6. **Korean (ko-KR)** — Murray Hill / FiDi / Long Island City cohort
  7. **Arabic (ar)** — Gulf inbound for luxury Manhattan
- Each translated page gets its own `hreflang` declaration and indexed canonical
- Maintainability requirement: structure copy in JSON files keyed by locale to avoid hand-translating in JSX

### Phase 4 — Long-term
- Localized URL paths (e.g. `/es/comprar/internacional`) if SEO data warrants
- Geo-IP-aware landing page that pre-selects language and currency based on visitor IP, with manual override
- Locale-aware WhatsApp Business and WeChat Business contact buttons

---

## 5. Languages roadmap (translator coordination · Maya)

Translation production is the rate-limiter for Phase 3. Suggested approach:

- One pass per language by a **certified legal translator** familiar with US real-estate terminology (FIRPTA, condo/co-op, fee simple, FAR, etc.)
- Estimated cost: $0.18–$0.30 per word for legal-grade translation. Each international page is ~1,500 words. Two pages × seven languages × $0.25 × 1,500 ≈ $5,250 total.
- Native-speaker review pass for cultural appropriateness (terms that translate literally but offend or confuse). Add ~$500 per language.
- Do NOT use machine translation for legal/financial content. The FIRPTA disclaimers in particular must be accurate in every language or they become a liability.

---

## 6. Social / discovery presence (manual · Maya)

These are content channels, not feeds. None expose RLS listing data — they expose Mallan's brand, expertise, and team.

| Channel | Strategy |
|---|---|
| **LinkedIn Company Page** | Already exists per `llms.txt`. Maintain: weekly post cadence — market notes, neighborhood spotlights, regulatory updates (FARE Act, NY DOS rule changes), agent introductions. |
| **LinkedIn Personal (Maya)** | Thought-leadership posts on the international-owner / non-resident-buyer beat. Highest signal channel for HNWI inbound. |
| **Instagram** | Already exists. Property tours, neighborhood reels, behind-the-scenes. NO MLS data in captions — neighborhood-level only unless a listing is owner-permitted for social display. |
| **TikTok** | Already exists. Same content rules as Instagram. |
| **Pinterest** | Niche but high-intent for real estate. Property boards (with owner permission), neighborhood guides. |
| **YouTube** | Long-form neighborhood walkthroughs, market reports, talking-head explanations of FIRPTA / FARE / NYC purchase mechanics. International-buyer playlist. |
| **WeChat Official Account** | For PRC outbound HNWI. Requires PRC business registration to claim a verified account — material commitment. |
| **WhatsApp Business** | Direct messaging endpoint for international clients. Set up a public WhatsApp Business profile linked from the new international pages. |

---

## 7. International luxury referral networks (manual · Maya)

Relationship-based. Not data syndication.

| Network | Action |
|---|---|
| **FIABCI** (Int'l Real Estate Federation) | Membership ≈ $500–$1,500/yr. Access to ~70-country referral pool. |
| **AIPP** (Assoc. of Int'l Property Professionals) | UK/EU outbound. Smaller. |
| **NAR Global Alliances** | Already a NAR member. Activate the international-realtor designation (CIPS) — ~$200 course + dues. |
| **Knight Frank / Christie's / Sotheby's Int'l Realty** | Referral relationships, commission-share model. Sotheby's Int'l Realty referrals require their introduction. |
| **Mansion Global** (WSJ) | Paid editorial / sponsored posts. ~$5K–$15K per placement. |
| **The Real Deal** | Paid editorial + earned coverage. Local but international audience. |
| **South China Morning Post property section** | Paid placement for HK / mainland inbound. |
| **Robb Report** | Luxury lifestyle adjacency. Paid placement. |

---

## 8. Compliance guardrails (apply to every public surface)

Every page, every translation, every external profile must comply with:

1. **Fair Housing Act + NY State Human Rights Law + NYC Human Rights Law (Title 8)** — no protected-class targeting. The two new pages have been written without any steering language. Any future translated version must be reviewed by the FH scanner (`public/crm/js/compliance/fair-housing.js` + `lib/compliance/rls-enforcement.ts` server-side patterns).
2. **NY DOS §175.25 advertising** — brokerage name (Mallan Real Estate Inc.) + office address or phone on every advertisement. The new pages include both in the compliance footer.
3. **NYC Fair Chance Housing Act (LL 24/2023)** — no criminal-history inquiry or display.
4. **TCPA / CAN-SPAM** — all leads route to existing `/contact` form which already records `consent_captured_at`. No new lead-capture endpoint is introduced.
5. **REBNY UCBA 2026** — no RLS data on either page. No "Off-Market" language. No agent compensation displayed.
6. **FARE Act (NYC LL 119/2024)** — N/A on these pages (no rental listings). When the pages eventually surface rental listings via the existing `/api/listings` path, FARE disclosures apply automatically through the existing DTO sanitizer.
7. **NY SHIELD Act** — any new lead-capture endpoint would require the audit-event + retention treatment. None introduced in this PR.

---

## 9. What is NOT shipped in this PR

| Item | Why deferred |
|---|---|
| Multi-language pages (Spanish / Mandarin / Russian / Portuguese / etc.) | Requires certified legal translation; Phase 3 |
| Currency toggle | Phase 2; requires FX-feed integration |
| `hreflang` declarations | Requires translated pages to exist; Phase 2 |
| Paid placements (Mansion Global, WSJ, SCMP) | Requires Maya's commercial decision |
| FIABCI / AIPP memberships | Requires Maya's annual-dues decision |
| Per-agent Google Business Profiles | Each agent claims their own |
| WeChat Official Account | Requires PRC business registration |
| Geo-IP language/currency landing page logic | Phase 4 |
| llms-full.txt with rich corpus | Wait until translated pages exist to avoid being a "thin English-only" signal |
| International listing syndication | **REBNY/legal approval gate — explicit hold** |

---

## 10. Quick post-deploy verification checklist (Maya)

After this PR ships:

1. Visit `https://mallan.nyc/buy/international` in an incognito tab — confirm page loads, hero image renders, FAQ + CTA work
2. Visit `https://mallan.nyc/sell/international` — same
3. Visit `https://mallan.nyc/sitemap.xml` — confirm the two new URLs appear in the static pages section
4. Visit `https://mallan.nyc/robots.txt` — confirm `Allow: /buy/international` and `Allow: /sell/international` lines appear in the AI-training-bot sections
5. Visit `https://mallan.nyc/llms.txt` — confirm International section + URLs are present
6. Test the contact CTAs — both pages link to `/contact?intent=international-buyer` and `/contact?intent=international-seller` respectively
7. Submit `/sitemap.xml` to Google Search Console + Bing Webmaster Tools to expedite indexing of the two new URLs

---

## 11. Forbidden-path self-check (developer · this PR)

This PR must not touch any of the following:

| Surface | Touched? |
|---|---|
| `lib/idx/**` | ❌ no |
| `lib/search/**` (projection) | ❌ no |
| `lib/compliance/**` | ❌ no |
| `prisma/**` | ❌ no |
| `prisma/migrations/**` | ❌ no |
| `app/api/idx/**` | ❌ no |
| `app/api/cron/**` | ❌ no |
| `vercel.json` | ❌ no |
| `.env*` | ❌ no |
| `.github/workflows/**` | ❌ no |
| `.claude/agents/**` | ❌ no |
| `.claude/skills/**` | ❌ no |
| `lib/neon/**` | ❌ no |
| `public/crm/**` | ❌ no |
| Sentinel / bot configs | ❌ no |
| Anything coupled to PR #148 or PR 5B | ❌ no |

---

## 12. Open questions for Maya

These are decisions only Maya can make:

1. **Currency toggle:** when does Phase 2 begin? FX feed pick (free vs paid).
2. **Translation budget:** $5K–$8K for the seven-language pass — when, and which two languages first?
3. **FIABCI / NAR CIPS:** worth the annual dues for the international referral channel?
4. **WhatsApp Business:** does Maya want the office line or a separate number?
5. **Off-market international listings:** any current Mallan owners abroad who would tolerate a whisper-marketing process? (Their permission is needed, and a separate listing-agreement amendment.)

---

**End of plan.** No code touches IDX/projection/cron/schema/env/Neon/Sentinel. Public surfaces only.
