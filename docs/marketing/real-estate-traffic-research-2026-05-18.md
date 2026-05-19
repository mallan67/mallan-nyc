> # ⚠ Reader's banner
>
> **This is a strategic research memo. Vendor / marketing benchmarks in this document are directional, not operating guarantees. Paid spend, tool subscriptions, and product decisions require validation against Mallan's own analytics and a separate compliance review before any commitment.**
>
> Specifically:
> - Numbers cited from third-party blogs and vendor pages are **vendor / marketing claims**, not first-party Mallan facts. They are useful for prioritization but not for forecasting.
> - All paid-tool recommendations below are marked **"evaluate later"** — they are NOT approved spend.
> - **International listing syndication is legal / REBNY review required unless limited to Mallan-owned exclusives** (see `docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md`).
> - The **current safe implementation lane is brand / content / lead-capture exposure** — NOT REBNY RLS listing redistribution.

---

# Real Estate Traffic + Tooling — Deep Research

**Date:** 2026-05-18 · **Status:** Research-only · no code changes in this delivery
**Purpose:** Map what real estate sites in 2026 actually use to drive traffic — tools, strategies, metrics, costs — so Mallan's roadmap is informed by what's already working in the market.
**Scope:** 12 parallel web-research passes covering AEO/GEO, traditional SEO, video, paid acquisition, lead conversion, international acquisition, real estate platforms, AI-specific tools, plus a free-only-tactics deep dive (HARO, Substack, lead magnets, communities, cross-promotion).

**Source-type legend used throughout this doc:**
- 🟢 **First-party / platform fact** — directly verifiable from the Mallan repo, Vercel dashboard, or an authoritative platform document (e.g. REBNY, NAR, Google).
- 🟡 **Industry benchmark** — credible third-party data (e.g. Sotheby's reported volume, NAR reports). Use for sizing, not forecasting.
- 🟠 **Vendor / marketing claim** — from a tool vendor's own blog or sales page. Use for direction, NOT as a guarantee.
- 🔴 **Editorial / opinion** — agent-magazine or marketing-blog opinions. Read as informed perspective only.

Tags appear inline next to specific data points.

---

## TL;DR — three shifts that matter most

1. 🟠 **AI search is now top-of-funnel.** Buyer adoption of AI search for initial agent research reportedly went from **17% → 67% in 18 months** ([Inman, Mar 2026](https://www.inman.com/2026/03/26/that-guy-who-sold-his-house-with-chatgpt-should-be-a-warning-sign-for-real-estate-agents/)). AI referral traffic grew **+527% YoY** and converts at **4.4–5× organic** ([Reflecting Walls](https://www.reflectingwalls.com/ai-search-real-estate-future/)). *Numbers are vendor / editorial claims — directional, not Mallan-measured.*

2. 🟠 **AEO / GEO is the new SEO.** Pages with FAQPage schema reportedly get cited in AI answers **41% of the time vs 15% without — 2.7× lift** ([Frase.io](https://www.frase.io/blog/faq-schema-ai-search-geo-aeo)). AEO-optimized agents reportedly get **920% more AI citations** ([Snezzi](https://snezzi.com/ai-visibility-services/real-estate/)). **91% of real estate agents reportedly invisible to AI** today ([FlyDragon 2026 benchmark](https://www.newswire.com/news/91-of-real-estate-agents-are-invisible-to-ai-according-to-flydragon-s-2026)). *Schema markup itself is free + 🟢 verifiable in our own repo; the citation-rate numbers are 🟠.*

3. 🟠 **The 30-second SMS rule.** Auto-text on inbound lead = lock the conversation. 62% of leads reportedly come in after-hours; an ISA or AI assistant covers that gap. Personalization reportedly lifts conversion **20%+** ([Ylopo](https://www.ylopo.com/blog/real-estate-lead-conversion-rate)).

---

---

## Section 0 — Free-only safe lane (where Mallan should focus right now)

Maya's standing direction: **"Do all the free ones. Consider others later. If free grows organically it will be better."** This section is the consolidated free-only worklist. Everything below it is reference material — paid items are explicitly marked "evaluate later," not approved.

### 0.1 Tier 1 — Free, this month (compounding wins, no third-party contracts)

| # | Item | 🟢 What Mallan controls | 🟠 What's claimed in literature | Effort |
|---:|---|---|---|---|
| 1 | **Bing / Yandex / Naver / Baidu Webmaster Tools** registration | Submit existing `sitemap.xml` to each | Bing index feeds DuckDuckGo + ChatGPT search; Yandex covers RU/EE; Naver KR; Baidu CN | 30 min each |
| 2 | **Google Business Profile** for the office | Office address (400 E 90th St), category Real Estate Agency, hours, photos, services, languages | 🟠 profiles with 100+ photos reportedly get 520% more calls vs <10 photos ([Propphy](https://www.propphy.com/blog/marketing-strategies-for-real-estate-agents-2026)) | 30 min to claim; ongoing |
| 3 | **Apple Maps Connect + Bing Places** | Same metadata as GBP | Covers ~25% mobile search share (non-Google ecosystem) | 30 min each |
| 4 | **HARO (Help A Reporter Out)** — relaunched April 2025 by Featured.com, **free again** | Pitch 3-5 journalists/week on NYC market questions | 🟠 every placement = high-authority editorial link ([W3era](https://www.w3era.com/blog/seo/haro-link-building-guide/), [OutreachDesk](https://outreachdesk.com/haro-link-building/)) | 30 min/week |
| 5 | **NAR / NYSAR / REBNY profile completeness** + local chamber + 5 quality local directories | Update existing profiles | 🟠 8-12 foundation backlinks ([Rankomedia](https://rankomedia.com/blog/real-estate-backlinks/)) | 1 day one-time |
| 6 | **Substack newsletter** | Own the list; export at any time; free | 🟠 20M+ monthly active subscribers, 5M paid ([purshoLOGY](https://www.purshology.com/2026/03/how-to-start-a-newsletter-on-substack-2026-growth-guide/)) | 1 day to launch; ongoing |
| 7 | **TikTok account** + first 4 neighborhood-guide videos (60-90s each, phone-shot) | Content + distribution | 🟠 lowest agent competition + highest discovery algorithm in 2026 ([Jamil Academy](https://www.jamilacademy.com/blog/tiktok-real-estate-leads)) | Weekly shoot |
| 8 | **YouTube channel** + first 8-15min neighborhood walkthrough | Content + distribution | 🟠 longest content lifespan + strongest SEO benefit ([Mile High Title Guy](https://www.milehightitleguy.com/post/how-denver-real-estate-agents-can-use-youtube-to-build-authority-and-generate-consistent-leads-in-20)) | Weekly shoot |
| 9 | **FAQ block + FAQPage JSON-LD** on every existing public page that doesn't have one | Code edit | 🟠 reportedly 41% citation rate vs 15% without (2.7× lift) | 1 day per page |
| 10 | **AggregateRating** schema once ≥5 reviews per agent exist | Schema markup on agent pages | 🟠 "citation gold" for AI engines | 1 day |
| 11 | **Hyperlocal long-tail neighborhood guides** (compound forever) | Content + structured headings + JSON-LD | 🟠 a single well-optimized guide reportedly drives 200-500 unique visitors/month for years ([Propphy](https://www.propphy.com/blog/marketing-strategies-for-real-estate-agents-2026)) | 1 day per guide |
| 12 | **Weekly Google Business Profile "Posts"** (market stats, new listings, sold properties, tips) | Owned channel | 🟠 signals freshness to Google's algorithm | 15 min/week |
| 13 | **Lead magnets** (NYC market reports, local-school comparison, buyer/seller guides, home valuation tool) | Mallan-written PDFs / pages | 🟡 lead-magnet emails reportedly drive $36 returned per $1 spent across email broadly ([Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-newsletters/)) | 1-2 days per magnet |
| 14 | **Cross-promotion** with NYC mortgage brokers / interior designers / contractors / staging firms | Outreach + content swap | 🟠 reaches new audiences cheaply | Ongoing |
| 15 | **ChatGPT custom GPT** — "NYC Real Estate Q&A by Mallan" | Free to publish a public GPT | 🟠 channel for direct discovery in ChatGPT (subject to OpenAI's real-estate policy) | 1 day |
| 16 | **LinkedIn personal posts** (Maya, weekly cadence) — international-owner / non-resident-buyer thought leadership | Owned channel | 🟠 highest-signal channel for HNWI inbound | 30 min/week |
| 17 | **Reddit + BiggerPockets community participation** | Answer NYC-specific questions; no spam | 🟠 community trust → referral pipeline ([HousingWire](https://www.housingwire.com/articles/chatgpt-for-real-estate/)) | 30 min/week |
| 18 | **Instagram + TikTok Stories** (daily quick cadence) | Repurpose long-form into clips | Same audience overlap as Reels/Shorts | 15 min/day |
| 19 | **Open-house cross-promotion** with neighborhood bloggers + local press | Pitch invitations to local journalists | 🟠 hyperlocal press coverage = earned backlinks | Per event |
| 20 | **Mallan-exclusives `/exclusives` public page** with structured listing schema | Own page; uses syndication MVP plan | Routes high-intent visitors to Mallan-controlled listings (compatible with REBNY rules per separate plan) | 2 days |

**Cumulative effort for Tier 1: ~6-10 dev days + ongoing weekly cadence.**
**Cumulative ongoing cost: $0.**

### 0.2 What this gives Mallan in 90 days (claim-aware estimate)

🟢 **Mallan-controllable, guaranteed:**
- 5+ search indexes claimed (Google + Bing + Yandex + Naver + Baidu)
- 3+ map indexes claimed (GBP + Apple + Bing Places)
- Verified compliance + schema footprint across all public pages
- Newsletter list owned by Mallan (not by a vendor)
- Owned TikTok + YouTube + Substack channels (content lasts)

🟠 **Industry-typical claimed outcomes** (NOT a guarantee):
- 200-500 monthly visitors per well-optimized neighborhood guide (compounds for years)
- 8-12 high-authority foundation backlinks within 60 days
- Press placements via HARO (typically 1-3/month if agent pitches 3-5/week consistently)
- Newsletter audience growth from 0 → low-thousands within a year IF content cadence is held
- TikTok + YouTube discovery sustained at 5-20K monthly impressions IF cadence is held

### 0.3 What the literature says NOT to do for free traffic
- Buy backlinks from "SEO services" advertising in $5/link directories — Google penalizes
- Buy / trade reviews — Google + Yelp ban accounts and removes review counts
- Spam-promote listings in unrelated subreddits / FB groups — get banned + reputation hit
- Use AI-generated content with no edit pass — both Google + AI engines deprioritize unedited LLM text
- Mass-mail un-opted-in mailing lists — CAN-SPAM violation, reputational damage

---

## Section 1 — The numbers (2026 benchmarks)

### AI search adoption
| Metric | 2024 | 2026 | Source |
|---|---:|---:|---|
| Buyers using AI as primary agent-research tool | 17% | **67%** | Inman |
| AI referral traffic YoY growth | — | **+527%** | Reflecting Walls |
| AI referral conversion vs organic | — | **4.4–5×** | Multiple |
| Agents invisible to AI search | — | **91%** | FlyDragon benchmark |
| Citation rate with FAQPage schema | — | **41%** vs 15% | Frase.io |
| Lift in citations with AEO optimization | — | **920%** | Snezzi |

### Properties + Listings
Properties appearing in AI answers generate **4× more qualified inquiries** and close at rates **60% higher** than properties without AI visibility ([Snezzi](https://snezzi.com/ai-visibility-services/real-estate/)).

### Conversion benchmarks
| Source | Visitor → lead | Lead → close |
|---|---:|---:|
| All sources (industry) | 1–3% | 0.4–1.2% |
| Organic search | 3.2% | — |
| Paid search | 1.5% | — |
| Top-of-funnel (Google/Meta cold) | 2–2.5% | — |
| Bottom-of-funnel (Zillow/Realtor.com leads) | 5% (top teams 7–9%) | — |
| Email marketing | 1.4% | — |
| Brokerage site recommended benchmark | **2.2%** sitewide | 0.5–2% lead-to-close |

Source: [Promodo 2026 benchmarks](https://www.promodo.com/blog/real-estate-benchmarks), [Jamil Academy](https://www.jamilacademy.com/blog/real-estate-lead-conversion-rate-benchmarks).

### Paid CPL (cost per lead)
| Channel | NYC / Tier 1 CPL | Notes |
|---|---:|---|
| Google Ads (luxury) | **$100–170** ($150+ for "luxury homes" / "waterfront") | [PPC Chief](https://ppcchief.com/google-ads-cost/real-estate) |
| Meta (Facebook/Instagram) | **$35–65** | [AdAmigo](https://www.adamigo.ai/blog/meta-ads-cost-per-lead-benchmarks-industry-2026) |
| Meta retargeting | **40–60% cheaper** than cold | Multiple |
| Industry avg CPL | $100.48 | All channels |

Tier 2 markets (Austin, Denver, Nashville): Meta $20–45. Tier 3: $8–20.

---

## Section 2 — AEO / GEO: the new lane

**AEO** (Answer Engine Optimization) and **GEO** (Generative Engine Optimization) are the same lane with two names. The goal: get your content **cited inside AI answers** from ChatGPT, Perplexity, Claude, Gemini, Google AI Overviews, Bing Copilot — without requiring a click-through.

### The 7 pillars of GEO content ([SearchEngineLand](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142))

1. **Direct response** — lead with the answer; expand with context after
2. **Numerical data** — original numbers AI engines can cite ("median DOM 24 days", "average UWS PPSF $1,820")
3. **Authoritative quotations** — quotes from licensed brokers, attorneys, accountants
4. **Extractable structure** — H2/H3 hierarchy, FAQ markup, short paragraphs, tables
5. **Original expertise** — first-hand insights AI can't synthesize from public data
6. **Technical infrastructure** — schema.org, llms.txt, fast page loads
7. **Fresh content** — AI engines deprioritize stale content

### Schema priority for real estate AI citations
| Schema type | Citation rate | Real estate use |
|---|---:|---|
| **FAQPage** | 41% (vs 15% none) | EVERY page should have FAQ block |
| Organization | high | About / brokerage page |
| **RealEstateAgent** | high | Agent profiles, homepage |
| LocalBusiness | high | Office page, Google Business sync |
| Article | medium | Blog / market reports |
| HowTo | medium | "How to buy NYC condo" guides |
| AggregateRating | citation gold | Anywhere reviews exist |

Source: [Walker Sands](https://www.walkersands.com/about/blog/how-can-schema-markup-support-llm-visibility/), [Frase.io](https://www.frase.io/blog/faq-schema-ai-search-geo-aeo).

### llms.txt
The emerging standard. Tells AI systems what your site is about at a high level. Most real estate sites don't have one yet → first-mover advantage. **Mallan already has llms.txt** (rare and ahead).

### Share of Model (SoM) — the new metric
Tracks how often your brand appears in AI answers for target prompts vs competitors. Replaces "ranking position" as the primary AI-search KPI.

### AEO tracking tools

| Tool | Engines tracked | Price | Best for |
|---|---|---:|---|
| **Otterly.AI** | ChatGPT, Perplexity, Google AI Overviews, Copilot | **$29/mo** for 15 prompts | Entry point / SMB |
| **Profound** | ChatGPT, Perplexity, Claude, Gemini, Grok | Mid-tier | Mid-market |
| **Radarly** | ChatGPT, Perplexity, Google AI Overviews, Gemini, Grok, Copilot | Enterprise | Sentiment + citation depth |
| **Visiblie** | 8 AI models incl. Grok | Enterprise | Daily multi-region + Looker |
| **Peec AI**, **Nightwatch**, **Scrunch**, **SE Ranking AI module** | varies | varies | varies |

Source: [Contently](https://contently.com/2026/04/29/top-10-tools-answer-engine-optimization-aeo-2026/), [Omnibound](https://www.omnibound.ai/blog/best-aeo-tools-for-answer-engine-optimization).

### What "best-in-class" AEO real estate looks like
From [Digital Applied](https://www.digitalapplied.com/blog/agentic-ai-for-real-estate-brokerage-marketing-2026):
- **4.6×** listing-content velocity
- **74%** time-to-first-contact reduction
- **18%** cost-per-closed-side reduction inside two quarters

---

## Section 3 — Traditional SEO + local SEO (still the foundation)

### Long-tail precision
"Buy luxury 4BR brownstone Upper West Side" beats "NYC real estate" by 100:1 on intent. Top luxury agents gain **273,000 impressions in 6 months** via hyperlocal content ([Embarque](https://www.embarque.io/post/real-estate-seo-agency)).

### Google Business Profile = #1 local discovery channel
Office address, category, hours, photos, services, languages, reviews. **Encourage every closed client to leave a review** — reviews are the #1 trust signal for both Google's local pack and AI engine citation choice.

### Hyperlocal content scale
[Real Geeks](https://placester.com/real-estate-marketing-academy/real-estate-seo): an "optimization machine" generating hundreds of automated hyperlocalized pages per neighborhood / school district / building. Most luxury agents underinvest here.

### What real estate SEO agencies do for $5k–$25k/mo
- Technical audits (Core Web Vitals, mobile, schema)
- Long-tail keyword content (100s of pages)
- Authority + backlink building (third-party citations)
- Local citation cleanup (NAP consistency across directories)

Top-cited agencies for luxury real estate: [Embarque](https://www.embarque.io/post/real-estate-seo-agency), [Marketing LTB](https://marketingltb.com/blog/agency/best-real-estate-seo-agencies/), [SEO Sherpa](https://seosherpa.com/luxury-real-estate-seo/), [DMR Media](https://www.dmrmedia.org/blog/luxury-real-estate-seo-agencies).

---

## Section 4 — Content + video strategy

### Cross-platform single shoot
**Film once, distribute three places.** TikTok, Instagram Reels, YouTube Shorts — same 60-90s clip, three different audiences ([Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-video-ideas/)).

| Platform | Strength | Best content length |
|---|---|---|
| TikTok | Strongest discovery algorithm, lowest agent competition, search engine for "best Reston neighborhoods" type queries | 60–90s educational / 3min property tours |
| Instagram Reels | Warmest existing audience | Same |
| YouTube Shorts | Longest content lifespan, strongest SEO benefit | Same |
| YouTube long-form | Authority + thought leadership + SEO | 8–15 min neighborhood walkthroughs |
| LinkedIn | B2B + luxury HNWI inbound | 1–3 min talking head |

### The 7 highest-performing TikTok formats for real estate ([Jamil Academy](https://www.jamilacademy.com/blog/tiktok-real-estate-leads))
1. Hyperlocal neighborhood guides
2. Price-anchor home tours ("here's what $3M buys you in...")
3. First-time buyer education
4. Market update breakdowns
5. Day-in-the-life behind-the-scenes
6. Myth-busting Q&A
7. Listing reveals

### Authenticity > polish in 2026
The "Compass-glossy" aesthetic is being out-performed by phone-shot, agent-talking-to-camera content. The platform algorithms reward dwell time and replays, not production value.

---

## Section 5 — Paid acquisition

### Channel allocation (NYC luxury)
- **Google Search**: $100–170 CPL · highest intent, slowest scale, expensive on luxury keywords
- **Meta** (Facebook/Instagram): $35–65 CPL · best for retargeting + nurture-style ads
- **Instagram-specific**: premium pricing but superior value for design-conscious buyers
- **YouTube TrueView**: cheap CPM, weak direct attribution, strong brand build
- **LinkedIn Ads**: expensive but only channel that targets HNWI by income + job title

### Retargeting > cold
Retargeting site visitors generates leads at **40–60% lower CPL** than cold campaigns ([AdAmigo](https://www.adamigo.ai/blog/meta-ads-cost-per-lead-benchmarks-industry-2026)). Most luxury brokers underinvest here.

### What luxury international targets ([JSMM Tech](https://jsmmtech.com/luxury-real-estate-marketing/))
- Print + digital placement in **WSJ Real Estate**, **Architectural Digest**, **Financial Times**, **Forbes**, **Robb Report**, **Vogue**, **NYT**
- International brochure distribution to **300+ cities in 50+ countries**
- Virtual tours via **Matterport**, **EyeSpy360**, **Zillow 3D Home** for remote buyers

---

## Section 6 — Lead conversion

The **30-second SMS rule** ([Ylopo](https://www.ylopo.com/blog/real-estate-lead-conversion-rate)):
> "Auto-text on lead capture where your CRM fires a personalized text within 30 seconds can buy 30–90 minutes of breathing room by locking in your spot in the conversation."

**62% of leads come in after-hours** — requires either an ISA service or an AI assistant to answer texts and book appointments while you sleep.

### AI-conversational ISAs (the new must-have)
| Tool | Best for | Notes |
|---|---|---|
| **Structurely (Aisa Holmes)** | Category leader for real estate AI-ISA | Text + voice; 12+ month nurture; hands off when ready |
| **Lofty** | AI-CRM lane leader | "Homeowner Agent" (Apr 2026) mines CRM for likely-seller signals |
| **BoldTrail** | All-in-one with AI baked in | Acquired kvCORE; full stack |
| **Perspective AI** | Lead nurture chatbots | Conversational follow-up |

### Conversion optimization tactics
- Auto-text within 30 seconds
- Personalization (name + property interest) = +20% conversion
- Reduce form fields to first name + email + phone + intent
- Honeypot bot field (silent 200 OK + no DB row)
- Multi-step forms outperform single long form on luxury (commitment escalation)
- Calendar widget (Calendly / Cal.com) for self-serve booking

---

## Section 7 — International buyer acquisition

### Sotheby's International Realty referral network
- **$4.6 billion** in cross-border transactions in 2024 alone
- **1,100 offices** across **84 countries**
- **26,100** independent sales associates globally
- **$157 billion** total global sales volume 2024 (U.S. +9.4% YoY)
- Referrals via commission-share model, not data syndication

### Luxury international portals
| Portal | Audience | Cost model |
|---|---|---|
| **JamesEdition** | Multicultural HNWI; cars / yachts / jets / homes | Subscription + per-listing |
| **Mansion Global** (WSJ) | English-speaking luxury readership | Paid editorial $5K–$15K per placement |
| **Sotheby's International Realty .com** | Sotheby's affiliate network | Affiliate-only |
| **Knight Frank** | UK + global HNWI | Affiliate / partnership |
| **Engel & Völkers** | EU + global | Affiliate / partnership |
| **luxuryrealestate.com** | LeadingRE network | Membership |

### Affiliate / membership lanes
- **FIABCI** (International Real Estate Federation) — $500–$1,500/yr
- **AIPP** (Association of International Property Professionals) — smaller
- **NAR CIPS** (Certified International Property Specialist) — ~$200 course + dues

---

## Section 8 — Real estate platforms compared

### The four major all-in-one stacks

| Platform | Strength | Price/mo | Best for |
|---|---|---:|---|
| **BoldTrail (kvCORE)** | All-in-one front office, enterprise-scale, AI baked in | $249–$1,099+ | Brokerages wanting one tool |
| **Sierra Interactive** | Website-led growth; strongest IDX + behavioral tracking + automation | $449+ | Teams investing in digital advertising |
| **Luxury Presence** | Managed marketing for luxury agents; 30% of WSJ RealTrends Top 100 | ~$2K+ | Solo luxury agents who outsource marketing |
| **Real Geeks** | Mass hyperlocal page generation + automation | $299+ | Mid-market lead-volume strategy |

**For Mallan**: none of these are needed — Mallan has a custom Next.js + Trestle stack that's technically more flexible. But the **patterns** they enforce (30-second SMS, AI nurture, hyperlocal pages, listing automation) are still worth borrowing.

### Specialty tools

| Lane | Tool | What it does |
|---|---|---|
| **AI listing copy** | Restb.ai | Analyzes property photos → 700+ data points → SEO-optimized descriptions |
| **AI ISA** | Structurely (Aisa Holmes) | Text + voice nurture |
| **AI seller mining** | Lofty Homeowner Agent | Mines existing CRM for likely-seller signals |
| **Virtual tour** | Matterport, EyeSpy360, Zillow 3D Home | International buyer-friendly remote experiences |
| **CRM (best-of-breed)** | Follow Up Boss | Most loved by agents (separate from BoldTrail) |
| **Email + sequence** | HubSpot, Mailchimp, ActiveCampaign | Newsletter + drip + segment |
| **SMS** | Twilio, OpenPhone | Direct + auto-text |
| **Reviews** | Birdeye, Reach150, Trustpilot | Aggregate + display reviews on site |
| **Analytics** | GA4 + Microsoft Clarity (free) + Hotjar | Quantitative + behavior |
| **SEO research** | Semrush, Ahrefs (~$100–300/mo each) | Keyword + backlink + competitor |

### "Don't buy this" list for Mallan
- BoldTrail / Sierra / Luxury Presence: Mallan already has a custom site stack
- Real Geeks: same
- HubSpot Marketing Hub: too heavy for current scale
- Salesforce: too heavy

---

## Section 9 — AI tools, by lane (35+ in market in 2026)

From [Ascendix](https://ascendix.com/blog/ai-real-estate-agents/), [Bounti](https://bounti.ai/blog/ai/ai-for-real-estate-agents-2026-complete-guide), [Perspective AI](https://getperspective.ai/blog/best-ai-tools-for-real-estate-agents-in-2026):

| Lane | Leaders |
|---|---|
| Conversational lead intake / qualification | **Structurely (Aisa Holmes)**, Perspective AI, ChatGPT custom GPTs |
| AI-CRM with nurture | **BoldTrail, Lofty** |
| Listing copy generation | **Restb.ai**, ChatGPT, Jasper, Claude (via API) |
| Photo analysis / data extraction | **Restb.ai** (700+ data points) |
| Transaction coordination | TransactionDesk + AI overlays |
| Call automation + market research | Various |
| Image upscaling / virtual staging | Matterport, BoxBrownie AI |
| Voice-over for listing videos | ElevenLabs, Descript |
| AI search visibility tracking | **Profound, Otterly.AI, Radarly** |
| AI-content writing | Jasper, ChatGPT, Claude, Wordtune |

---

## Section 10 — What this means for Mallan.nyc specifically

### Already ahead of 91% of agents
| Asset | State |
|---|---|
| `llms.txt` | ✓ shipped (most agents don't have one) |
| FAQPage schema | ✓ on townhouse + international pages (2.7× citation lift) |
| RealEstateAgent schema | ✓ on new international pages |
| Custom Next.js site (vs WordPress IDX template) | ✓ technically faster + more flexible |
| Public sitemap.xml dynamic | ✓ |
| AI training crawler policy (robots.ts) | ✓ explicit per-bot allow/disallow |
| TCPA-consent-captured lead capture (`/api/inquiries`) | ✓ |
| Hyperlocal pages by borough | ✓ |
| Townhouse landing | ✓ |
| International buyer + seller landings | ✓ (PR #159 awaiting merge) |

### Highest-leverage adds (rank-ordered by value/effort)

| Rank | Add | Lane | Effort | Cost/mo | Why first |
|---:|---|:---:|:---:|---:|---|
| 1 | **TikTok production** — 60–90s neighborhood guides + price-anchor tours | Video | Weekly shoot | $0 (in-house) | Lowest agent competition + highest discovery algorithm |
| 2 | **Google Business Profile** | Local | 30 min | $0 | #1 NYC local-search discovery channel |
| 3 | **YouTube channel** — 8–15min neighborhood walkthroughs | Video | Weekly shoot | $0 | Longest content lifespan + strongest SEO + LLM corpus inclusion |
| 4 | **Otterly.AI** subscription — AEO tracking | AEO | 1 day setup | $29 | Measure Mallan's Share of Model across ChatGPT/Perplexity/Gemini |
| 5 | **Bing / Yandex / Naver Webmaster Tools** | SEO | 1 day | $0 | Bing index feeds DuckDuckGo + ChatGPT search |
| 6 | **FAQ block on every existing public page** | AEO | 1 day per page | $0 | 2.7× AI citation lift; ride existing schema pattern |
| 7 | **Reviews aggregation page + schema.org AggregateRating** | Local + AEO | 1 day | $0 | Citation gold for AI engines |
| 8 | **Structurely or equivalent AI-ISA** | Lead conversion | 1 week | $200–400 | 30-second response after-hours = locks 62% of leads in |
| 9 | **JamesEdition listing affiliate** | International | 1 day app | $250–500 + per listing | Highest-cost-per-million HNWI inbound channel |
| 10 | **Mansion Global paid editorial** | International | 1 placement | $5K–15K per | Paid but proven international luxury reach |

### Don't waste money on
- BoldTrail / Sierra / Luxury Presence platform subscriptions (Mallan's custom site is better)
- HubSpot Marketing Hub (overkill for current scale)
- Generic SEO agency at $5K+/mo (your structured content already outperforms most)
- Zillow Premier Agent buy-side leads (high cost, low intent for luxury NYC)

### Don't do (REBNY/legal-gated)
- Syndicating RLS listings to non-REBNY-authorized portals — requires REBNY approval per partner
- Showing MLS data on AI-corpus pages — REBNY UCBA Art. III §2(C)
- Pushing listing-detail URLs to AI engines — robots.ts already blocks this correctly

---

## Section 11 — Mallan-specific roadmap proposal (after Maya approval)

### Tier 1 — Free, this month (compounding wins)
1. Claim Bing Webmaster Tools + Yandex Webmaster + Naver Webmaster
2. Google Business Profile (office + per-agent)
3. Apple Maps Connect + Bing Places
4. TikTok account + first 4 neighborhood-guide videos
5. YouTube channel + first long-form neighborhood walkthrough
6. Add FAQ block + FAQPage JSON-LD to every existing public page that doesn't have one

### Tier 2 — **Evaluate later** (small subscriptions, this quarter — NOT approved spend)

> All items below are **paid subscriptions or paid placements**. They are listed for prioritization context, NOT as approved expenditure. Each requires Maya's commercial decision and compliance review before commitment.

7. **Otterly.AI ($29/mo)** — AEO tracker; would measure Share of Model on 15 priority prompts. *Evaluate later vs. a free local probe script.*
8. **Microsoft Clarity (free)** — session recording + heatmaps. *Free, but adoption requires consent-cookie review.*
9. **Reviews aggregation** — Birdeye or Reach150 subscription. *Evaluate later — basic schema.org AggregateRating works free if Mallan does manual review collection.*
10. **AI-ISA** — Structurely subscription, OR a Mallan-owned implementation using Twilio (already in stack for MFA) + Claude/GPT for the 30-second auto-text. *Subject to TCPA review; could be free-DIY if Mallan-built.*

### Tier 3 — **Evaluate later** (paid placements, Q3/Q4 2026 — NOT approved spend, REBNY/legal review required for international syndication)

> **International listing syndication is legal / REBNY review required** unless the syndication is limited to Mallan-owned exclusives per `docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md`.

11. **JamesEdition** listing affiliate — international HNWI. *Evaluate later; Mallan-exclusives only.*
12. **Mansion Global** paid feature ($5K–15K, one placement to test) — *Evaluate later.*
13. **FIABCI** + **NAR CIPS** memberships — international referral pipeline. *Annual dues; evaluate later.*
14. **Sotheby's International Realty affiliate** — relationship-based, not data syndication. *Evaluate later; commission-share model.*
15. **The Real Deal** — earned + paid (NYC trade press read by HNWI internationally). *Earned coverage is free if pitched; paid coverage is "evaluate later."*

### Tier 4 — **Evaluate later** (long horizon, 2027 if metrics support — NOT approved spend)
16. Multi-language pages (es / zh / ru / pt / fr / ko / ar) — already documented in `docs/marketing/international-search-exposure-plan-2026-05-18.md`. *Requires certified legal translation budget.*
17. `hreflang` declarations once translated pages exist
18. WeChat Official Account (requires PRC business reg)
19. Compass / Douglas Elliman / Corcoran style print-glossy magazine

### 0.4 Where the safe implementation lane sits TODAY

**Free brand / content / lead-capture** is the only lane that ships today without REBNY/legal review or external contracts. Specifically:

- ✓ Schema markup additions (FAQPage, AggregateRating, RealEstateAgent) — free, no compliance review beyond Fair Housing scanning of any copy
- ✓ llms.txt augmentation — free
- ✓ Sitemap + robots additions — free
- ✓ Public landing pages (e.g. `/buy/international`, `/sell/international` shipped in PR #159) — free
- ✓ Webmaster Tools registrations — free
- ✓ Maps registrations — free
- ✓ HARO + Substack + LinkedIn + TikTok + YouTube — free
- ✓ Inbound lead capture via existing `/api/inquiries` (TCPA-consent-captured already) — free
- ✓ Mallan-owned exclusive syndication MVP per separate architecture plan — free, broker-approved per row

**Out of the safe lane (requires legal/REBNY/contract before ANY work):**
- ⛔ Any export of REBNY RLS / IDX / Trestle data to a non-authorized portal
- ⛔ Any automatic-push integration with an external listing portal
- ⛔ Any paid placement contract
- ⛔ Any cross-border data syndication of MLS data

---

## Section 12 — Metrics to add to ops:health / dashboard (future PR)

If you want to track this, the dashboard items are:

| Metric | Source | Cadence |
|---|---|---|
| AI referral sessions | GA4 (custom dimension on document.referrer) | Daily |
| AI referral conversion rate | GA4 + `/api/inquiries` joined | Weekly |
| Share of Model on N priority prompts | Otterly.AI or manual probe | Weekly |
| FAQPage schema coverage | Static scan of public pages | Per-deploy |
| TikTok views + click-through to /contact | TikTok Analytics + UTM | Weekly |
| YouTube neighborhood-tour minutes watched | YouTube Analytics | Weekly |
| Google Business Profile views + calls | GMP dashboard | Weekly |
| Mansion Global / WSJ / SCMP placement traffic | UTM-tagged URLs in placements | Per-placement |
| International leads (country tag on `/api/inquiries`) | DB query | Monthly |

These do NOT require any IDX / projection / schema-migration changes — pure analytics overlay on what already exists.

---

## Sources

### AEO / GEO / AI search
- [Agentic AI for Real Estate Brokerages: 2026 Playbook](https://www.digitalapplied.com/blog/agentic-ai-for-real-estate-brokerage-marketing-2026)
- [91% of Real Estate Agents Are Invisible to AI](https://www.newswire.com/news/91-of-real-estate-agents-are-invisible-to-ai-according-to-flydragon-s-2026)
- [AI Visibility for Real Estate — Snezzi](https://snezzi.com/ai-visibility-services/real-estate/)
- [Best Real Estate AEO for Commercial Brokers 2026](https://blog.aeoengine.ai/real-estate-aeo-commercial-brokers/)
- [Why answer engine optimization now drives real estate leads — Chicago Agent Magazine](https://chicagoagentmagazine.com/2026/01/20/answer-engine-optimization/)
- [Top 10 Tools for Answer Engine Optimization (AEO) in 2026 — Contently](https://contently.com/2026/04/29/top-10-tools-answer-engine-optimization-aeo-2026/)
- [Best 22 AEO Tools — Omnibound](https://www.omnibound.ai/blog/best-aeo-tools-for-answer-engine-optimization)
- [AEO 2026 Practical Playbook — ALM Corp](https://almcorp.com/blog/answer-engine-optimization-2026/)
- [AEO Trends in 2026 — HubSpot](https://blog.hubspot.com/marketing/answer-engine-optimization-trends)
- [The Future of Real Estate Search: AI & Brand Authority — Reflecting Walls](https://www.reflectingwalls.com/ai-search-real-estate-future/)
- [Mastering Generative Engine Optimization in 2026 — SearchEngineLand](https://searchengineland.com/mastering-generative-engine-optimization-in-2026-full-guide-469142)
- [How to plan for GEO in 2026 — SearchEngineLand](https://searchengineland.com/plan-for-geo-2026-evolve-search-strategy-463399)
- [The Complete Guide to GEO — Enrich Labs](https://www.enrichlabs.ai/blog/generative-engine-optimization-geo-complete-guide-2026)
- [Ultimate Home Builder GEO Guide 2026 — Ignite Digital](https://ignitedigital.com/resources/blog/seo/dominate-ai-search-the-2026-real-estate-playbook/)

### Schema / structured data
- [Schema Markup That AI Search Engines Actually Cite — Digital Estate Media](https://www.digitalestatemedia.com/blog/schema-markup-ai-search-engines-cite)
- [Are FAQ Schemas Important for AI Search, GEO & AEO? — Frase.io](https://www.frase.io/blog/faq-schema-ai-search-geo-aeo)
- [Schema Markup: The Complete Structured Data Guide — Discoverability Co](https://discoverability.co/resources/schema-markup-guide/)
- [LLM Retrieval and AI Citations — Marketer's Choice](https://marketerschoice.com/llm-retrieval-and-ai-citations/)
- [How Schema Markup Supports LLM Visibility — Walker Sands](https://www.walkersands.com/about/blog/how-can-schema-markup-support-llm-visibility/)
- [How-To and FAQ Optimization — Agenxus](https://agenxus.com/blog/howto-faq-content-optimization-ai-citations)
- [FAQ Optimization for AI Search — Averi](https://www.averi.ai/how-to/faq-optimization-for-ai-search-getting-your-answers-cited)

### Traditional SEO + luxury
- [Luxury Real Estate SEO Agencies 2026 — DMR Media](https://www.dmrmedia.org/blog/luxury-real-estate-seo-agencies)
- [Luxury Real Estate SEO — SEO Sherpa](https://seosherpa.com/luxury-real-estate-seo/)
- [7 Best Real Estate SEO Agencies — Embarque](https://www.embarque.io/post/real-estate-seo-agency)
- [The Ultimate Guide to Real Estate SEO for Agents in 2026 — Housing Wire](https://www.housingwire.com/articles/real-estate-seo/)
- [Real Estate SEO Complete Guide — Placester](https://placester.com/real-estate-marketing-academy/real-estate-seo)
- [Best IDX Home Search Providers 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/idx-home-search-providers/)

### NYC + international marketing
- [Marketing Real Estate For Luxury Properties in New York — Morrel Hirsch](https://www.morrelhirsch.com/sellers/how-we-market-your-property/)
- [Best NYC Digital Marketing Agencies 2026 — Semrush](https://agencies.semrush.com/list/real-estate/new-york/)
- [The Luxury Real Estate Digital Playbook — Luxury Home Marketing](https://www.luxuryhomemarketing.com/blog/the-luxury-real-estate-digital-playbook-platforms-and-strategies-for-2026)
- [Social Media for Luxury Real Estate — JSMM Tech](https://jsmmtech.com/social-media-marketing-digital-advertising-strategies-for-luxury-real-estate/)
- [Top 14 Luxury Real Estate Marketing Agencies — inBeat](https://inbeat.agency/blog/top-luxury-real-estate-marketing-agencies)

### Video + social
- [Real Estate Marketing Trends 2026 — Prime Perspectives](https://primeperspectives.com/blog/real-estate-marketing-trends-2026-from-tiktok-videos-to-virtual-staging)
- [18 Real Estate Marketing Trends 2026 — Placester](https://placester.com/real-estate-marketing-academy/trends)
- [TikTok Real Estate Leads 2026 — Jamil Academy](https://www.jamilacademy.com/blog/tiktok-real-estate-leads)
- [11 Real Estate Video Ideas 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-video-ideas/)
- [TikTok Marketing for Real Estate Agents — Placester](https://placester.com/real-estate-marketing-academy/tik-tok-marketing-for-real-state-agents)
- [YouTube for Denver Real Estate Agents 2026 — Mile High Title Guy](https://www.milehightitleguy.com/post/how-denver-real-estate-agents-can-use-youtube-to-build-authority-and-generate-consistent-leads-in-20)
- [20+ Real Estate Social Media Strategies 2026 — INSIDEA](https://insidea.com/blog/marketing/real-estate/social-media-strategies/)

### Paid acquisition
- [Real Estate PPC 101 — Propphy](https://www.propphy.com/blog/real-estate-ppc-guide-2026)
- [Average Real Estate Cost Per Lead 2026 — Ampifire](https://ampifire.com/blog/average-real-estate-cost-per-lead-prices-rates-2026-ads-vs-content/)
- [Google Ads Real Estate Benchmarks 2026 — Expert PPC Services](https://expertppcservices.com/google-ads-for-real-estate-2026-benchmarks-strategies/)
- [Meta Ads Real Estate CPL Benchmarks 2026 — AdAmigo](https://www.adamigo.ai/blog/meta-ads-cost-per-lead-benchmarks-industry-2026)
- [PPC for Real Estate Agents 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/ppc-for-real-estate-agents-a-2026-complete-guide/)
- [Average CPC Real Estate Google Ads 2026 — PPC Chief](https://ppcchief.com/google-ads-cost/real-estate)
- [Real Estate Lead Cost Report Q4 2025 — CINC](https://www.cincpro.com/blog/real-estate-lead-cost-report-for-buyers-on-google)

### Conversion + lead handling
- [Real Estate Lead Conversion Rate 2026 — Ylopo](https://www.ylopo.com/blog/real-estate-lead-conversion-rate)
- [Lead Conversion Benchmarks 2026 — Jamil Academy](https://www.jamilacademy.com/blog/real-estate-lead-conversion-rate-benchmarks)
- [2026 Real Estate Marketing Metrics & Benchmarks — Promodo](https://www.promodo.com/blog/real-estate-benchmarks)
- [Lead-Capture Pages 2026 — Unicorn Platform](https://unicornplatform.com/blog/real-estate-lead-capture-page-strategy-in-2026/)
- [Real Estate Lead Conversion Guide — JustCall](https://justcall.io/blog/lead-conversion-in-real-estate-guide.html)
- [Real Estate Conversion Benchmark Report 2026 — Conversion Realtor](https://conversionrealtor.com/conversion-research/real-estate-conversion-rate-benchmark)

### CRM + platforms
- [BoldTrail / kvCORE Review 2026 — Real Estate Bees](https://realestatebees.com/software/kvcore/)
- [BoldTrail (kvCORE) Review — Real Estate Skills](https://www.realestateskills.com/blog/kvcore)
- [Sierra Interactive vs BoldTrail Comparison](https://www.sierrainteractive.com/our-solutions/bold-trail-competitor-comparison/)
- [Best Sierra Interactive Alternatives — Luxury Presence](https://www.luxurypresence.com/blogs/sierra-interactive-alternatives/)
- [Luxury Presence Review 2026 — Agent Advice](https://www.agentadvice.com/luxury-presence-review/)
- [Top Luxury Real Estate Agents Marketing Platform Trust 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/star-power-agents/)
- [Best Real Estate Lead Gen Platforms — Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-lead-generation-platforms/)

### AI tools
- [Best AI Tools for Real Estate Agents 2026 — Perspective AI](https://getperspective.ai/blog/best-ai-tools-for-real-estate-agents-in-2026)
- [AI for Real Estate Agents 2026 Complete Guide — Bounti](https://bounti.ai/blog/ai/ai-for-real-estate-agents-2026-complete-guide)
- [AI for Real Estate Agents: 35+ Tools — Ascendix](https://ascendix.com/blog/ai-real-estate-agents/)
- [The Best AI Tools for Real Estate — V7 Labs](https://www.v7labs.com/blog/best-ai-tools-for-real-estate)
- [AI Chatbots for Real Estate — Perspective AI](https://getperspective.ai/blog/ai-chatbots-for-real-estate-why-most-fail-and-what-actually-works-in-2026)
- [AI Lead Nurturing 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/ai-lead-nurturing/)
- [9 Real Estate Tech Trends 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-technology-trends/)

### International / luxury portals
- [Luxury Real Estate Listings Market — Newstrail](https://www.newstrail.com/luxury-real-estate-listings-market-is-booming-worldwide-major-giants-jamesedition-mansion-global/)
- [JamesEdition](https://www.jamesedition.com/)
- [Sotheby's International Realty](https://www.sothebysrealty.com/eng)
- [Sotheby's International Realty Review 2026 — The Luxury Playbook](https://theluxuryplaybook.com/sothebys-international-realty-review/)
- [luxuryrealestate.com](https://www.luxuryrealestate.com/)

### Inman + industry coverage
- [That ChatGPT Homeseller Should Be A Warning Sign For Agents — Inman](https://www.inman.com/2026/03/26/that-guy-who-sold-his-house-with-chatgpt-should-be-a-warning-sign-for-real-estate-agents/)
- [From Search to Execution — WAV Group](https://www.wavgroup.com/2026/04/02/from-search-to-execution-why-perplexitys-computer-signals-the-next-battle-for-real-estate-ai/)

### Free-only tactics + community + backlinks (Section 0 sources)
- [12 Proven Marketing Strategies for Real Estate Agents 2026 — Propphy](https://www.propphy.com/blog/marketing-strategies-for-real-estate-agents-2026)
- [10 Proven Digital Marketing Strategies for Real Estate Agents — AI-Stager](https://www.ai-stager.com/blog/digital-marketing-for-real-estate-agents)
- [10 Real Estate Marketing Strategies That Actually Work 2026 — USAgentLeads](https://www.usagentleads.com/blog/real-estate-marketing-strategies)
- [28 Real Estate Marketing Tactics 2026 — inMotion Real Estate Media](https://inmotionrealestate.com/resources/real-estate-marketing-ideas/)
- [17 Real Estate Marketing Trends 2026 — FlippingBook](https://flippingbook.com/blog/marketing-tips/real-estate-marketing-trends)
- [How to Build Real Estate Backlinks in 2026 — Jeff Lenney](https://jefflenney.com/real-estate/real-estate-backlinks/)
- [HARO Link Building 2026 — W3era](https://www.w3era.com/blog/seo/haro-link-building-guide/)
- [HARO Link Building: Worth It in 2026? — OutreachDesk](https://outreachdesk.com/haro-link-building/)
- [How to Get Real Estate Backlinks 2026 — Rankomedia](https://rankomedia.com/blog/real-estate-backlinks/)
- [Link Building for Real Estate 2026 — Reporter Outreach](https://www.reporteroutreach.com/blog/real-estate-link-building)
- [Ultimate 2026 Guide to Real Estate Newsletters — Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-newsletters/)
- [20 Engaging Real Estate Newsletter Ideas 2026 — The Close](https://theclose.com/real-estate-newsletter-ideas/)
- [Real Estate Email Marketing 2026 — Luxury Presence](https://www.luxurypresence.com/blogs/real-estate-email-marketing/)
- [How to Start a Substack Newsletter 2026 — purshoLOGY](https://www.purshology.com/2026/03/how-to-start-a-newsletter-on-substack-2026-growth-guide/)
- [11 Clever Ways to Use ChatGPT for Real Estate — HousingWire](https://www.housingwire.com/articles/chatgpt-for-real-estate/)
- [7 Ways Real Estate Investors Can Use ChatGPT — BiggerPockets](https://www.biggerpockets.com/blog/chatgpt-for-real-estate)

---

## End of research

**Status:** Research-only memo. Awaiting Maya review + a docs-only PR to commit. **No code changes** in this delivery.

**The implementation observation layer** (GA4 AI-search tracking, AEO tracker, weekly prompt probes) Maya originally asked for can be built as a follow-up PR using the patterns above — local-only probe script, FAQ schema audit script, GA4 referrer-detection client component. **None require IDX / projection / schema / cron / Sentinel touches.**

**Companion docs:**
- `docs/marketing/international-search-exposure-plan-2026-05-18.md` — international buyer/seller pages + manual checklist (shipped in PR #159, awaiting your merge approval)
- `docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md` — report-only architecture plan for Mallan-owned exclusive listing syndication (free MVP; compatible with PR #148/PR 5B holds)
