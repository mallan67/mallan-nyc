# High-Intent Lead Capture Strategy for Mallan Real Estate Inc.

**Prepared:** March 9, 2026
**For:** Maya Allan, Principal Broker — Mallan Real Estate Inc.
**Site:** mallan.nyc (Next.js on Vercel, REBNY RLS/Trestle IDX data)

---

## Executive Summary

This report provides a concrete, compliance-first strategy for capturing buyers and sellers who are ready to transact within 90 days. Every recommendation is filtered through three questions: (1) Does it attract serious prospects? (2) Can a boutique brokerage implement it? (3) Does it comply with REBNY, TCPA, Fair Housing, and NY DOS rules?

The core thesis: **Stop optimizing for volume. Optimize for signal.** A boutique brokerage wins by offering depth, expertise, and responsiveness that large firms cannot match at scale.

---

## 1. BEHAVIORAL SIGNALS — Identifying Serious Prospects

### What High-Intent Buyers Do on Your Site

| Behavior | Signal Strength | Why It Matters |
|----------|----------------|----------------|
| Views same listing 3+ times across different sessions | **Very High** | Repeat visits to specific properties indicate genuine purchase consideration |
| Uses mortgage/closing cost calculator with real numbers | **Very High** | Financial modeling = actively planning a purchase |
| Views floor plans or virtual tours | **High** | Looking beyond photos = evaluating livability, not just browsing |
| Compares 2-3 properties side by side | **High** | Narrowing down = decision-making phase |
| Searches within a tight price band ($50K range) | **High** | Knows their budget = has done financial homework |
| Saves 3+ favorites in one neighborhood | **High** | Geographic commitment = has picked where they want to live |
| Views listing detail page for 3+ minutes | **Medium-High** | Reading descriptions, checking details, not just scrolling photos |
| Visits neighborhood pages after viewing listings | **Medium-High** | Researching the area = serious about location |
| Returns to site within 48 hours of first visit | **Medium** | Active search behavior vs. casual browsing |
| Views agent profile page | **Medium** | Evaluating who to work with = close to reaching out |
| Clicks "Schedule a Showing" or "Request Info" but does not submit | **Medium** | Intent without commitment — needs a nudge, not a gate |
| Browses listings during business hours (9am-6pm weekdays) | **Low-Medium** | Could be at-work browsing, but correlates with active searchers |
| Views only one listing and bounces | **Low** | Likely came from an ad or social link — casual interest |

### What High-Intent Sellers Do on Your Site

| Behavior | Signal Strength | Why It Matters |
|----------|----------------|----------------|
| Uses "What's Your Home Worth?" tool and enters real address | **Very High** | Actively considering selling |
| Views comparable sales data / market reports | **Very High** | Researching pricing = timing a sale |
| Visits agent profile + past deals page | **High** | Evaluating who to hire |
| Views "How to Sell" or seller guide content | **High** | Educating themselves = early-stage seller |
| Searches for their own address or building | **Medium-High** | Checking what their neighbors sold for |
| Views closing cost / net proceeds content | **Medium** | Planning finances around a sale |

### Implementation: Event Tracking

Track these events via lightweight client-side analytics (no MLS data exposure — purely behavioral signals on your own site):

```
// Key events to track (store in Postgres, NOT third-party analytics)
page_view (url, duration, scroll_depth)
listing_view (listing_id, view_count, time_on_page)
listing_save (listing_id)
calculator_use (calculator_type, inputs_provided: boolean)
search_performed (filters_used, result_count)
comparison_started (listing_ids[])
floor_plan_viewed (listing_id)
virtual_tour_opened (listing_id)
form_started_but_abandoned (form_type, fields_completed)
return_visit (session_count, days_since_last)
cta_clicked (cta_type, page)
```

**Privacy note:** Track behavioral patterns, not PII, until the user voluntarily provides contact info. No fingerprinting, no cross-site tracking. Comply with NY SHIELD Act data security requirements.

---

## 2. CONTENT & TOOLS THAT ATTRACT SERIOUS BUYERS

### Tier 1 — High-Impact, Build Now

**A. NYC Closing Cost Calculator (Enhanced)**
You already have a calculator. Upgrade it to be THE definitive NYC closing cost tool:
- **Buyer side:** Mansion tax (8 brackets from $1M-$25M+), mortgage recording tax (1.8%/$500K+ or 1.925%), title insurance, attorney fees, building fees (co-op vs. condo differences)
- **Condo vs. co-op toggle** that changes all calculations automatically
- **Sponsor unit detection** (no title insurance needed, transfer tax often paid by sponsor)
- **Show total all-in cost** (purchase price + closing costs + reserves)
- **Lead capture:** Show the summary for free. Gate the downloadable PDF breakdown behind email. Frame it as: "Email me my personalized closing cost estimate."

**Why it works:** Buyers who run real numbers with real prices are 3-5x more likely to transact within 90 days. Generic Zillow calculators do not handle NYC's unique tax structure correctly.

**B. Pre-Approval Guidance Page**
Not a pre-approval tool (you are not a lender) — but a detailed guide:
- "What NYC lenders look for" (DTI ratios, reserve requirements, co-op-specific standards)
- Recommended lender partners (2-3 trusted mortgage brokers you work with)
- Explain WHY pre-approval matters for NYC specifically (co-op boards, competitive offers)
- **Lead capture:** "Get our pre-approval checklist + lender introductions" — requires name, email, phone, and one qualifying question: "When are you looking to purchase?"

**C. Building Financial Health Reports**
For co-op buyers, this is the most underserved content online:
- Explain what a co-op financial statement reveals (reserves, underlying mortgage, maintenance trajectory)
- Red flags to look for (special assessments, declining reserves, high flip tax)
- **This positions Mallan as an expert** that large firms' websites simply do not offer
- **Lead capture:** "Request a building financial review" — high-intent, low-volume, very qualified

**D. Neighborhood Market Snapshots**
You already have 59 neighborhoods. Add quarterly data:
- Median price / price per sq ft (from Trestle closed sales you already sync)
- Days on market
- Inventory levels
- Price trends (QoQ and YoY)
- **Lead capture:** "Get monthly market updates for [neighborhood]" — email only, automatic segmentation by area of interest

### Tier 2 — Medium Impact, Build Next

**E. Board Package Preparation Guide**
Co-op buyers dread the board package. Create the definitive guide:
- Document checklist (tax returns, bank statements, reference letters, personal statement)
- Common mistakes that cause rejection
- Timeline expectations (co-op: 90 days from offer to close; condo: 60 days)
- **Lead capture:** Downloadable PDF checklist gated behind email

**F. Transit Commute Comparison Tool**
You already have transit data (49 stations). Extend it:
- "Compare commute times from these 3 listings to your office"
- Input: office address. Output: commute time from each saved/compared listing
- **Why it captures serious buyers:** Only people actively choosing between properties use this

**G. Comparable Sales Viewer**
Show recent closed sales near a listing (you have this data from Trestle):
- 3-5 comps within 0.25 miles, similar size/type
- Price per square foot comparison
- Days on market
- **Gate:** Show 2 comps free, full comp report requires registration

---

## 3. CONTENT & TOOLS THAT ATTRACT SERIOUS SELLERS

### Tier 1 — High-Impact, Build Now

**A. Enhanced Home Valuation Tool**
Your current "What's Your Home Worth?" widget is a start. Upgrade to:
- **Step 1 (no gate):** Enter address, get an instant AVM range (use public data — NOT MLS)
- **Step 2 (light gate):** "Get a refined estimate with building-specific data" — capture email
- **Step 3 (full gate):** "Schedule a free in-person CMA with comparable sales analysis" — capture phone + timeline

The key insight: automated valuations are a LEAD MAGNET, not a replacement for your expertise. The value you provide is the human CMA that accounts for things AVMs miss (renovation quality, floor height, exposure, building amenities).

**B. Net Proceeds Calculator**
Sellers want to know: "How much will I actually pocket?" Build a calculator that accounts for:
- Broker commission (clearly state it is negotiable per UCBA 2026)
- NYC transfer tax (1% / 1.425%) + NYS transfer tax (0.4% / 0.65%)
- Co-op flip tax (input field — typically 1-3% of sale price)
- Capital gains estimate (holding period, basis, primary residence exclusion)
- Mortgage payoff
- Attorney fees, move-out fees, building requirements
- **Output:** A clear net proceeds number
- **Lead capture:** Show the calculation live (no gate). Gate the "Personalized Net Proceeds Report" PDF behind email + phone + "When are you considering selling?"

**C. "How Long Will It Take to Sell?" Data**
Use your closed sales data to show:
- Average days on market by neighborhood, property type, and price range
- Seasonal trends (spring vs. winter)
- Pricing strategy impact (priced right vs. 5% over market)
- **Lead capture:** "Get a custom market timing analysis for your property"

### Tier 2 — Medium Impact, Build Next

**D. Case Studies / Recently Sold Highlights**
Show real results (you already have past deals in your DB):
- "We sold this Upper East Side 2BR in 14 days for 3% over ask"
- Before/after staging photos (if available)
- Strategy narrative (pricing, marketing, negotiation)
- **This is your proof of competence** — boutique firms win on results, not brand recognition

**E. Seller's Preparation Checklist**
- Pre-listing inspection recommendations
- Staging tips (NYC-specific: declutter in a 600 sq ft apartment)
- Disclosure requirements (NYC Property Condition Disclosure or $500 credit)
- **Lead capture:** Downloadable PDF, email-gated

**F. Broker Fee Transparency Page**
Post-UCBA 2026, commission transparency is required. Turn this into an advantage:
- Explain the new commission structure clearly
- Show what is included in your service (professional photos, floor plans, marketing, open houses)
- Compare what boutique service provides vs. discount brokerages
- **This filters OUT price-shoppers and filters IN quality-seeking sellers**

---

## 4. CAPTURE MECHANISMS THAT FILTER FOR QUALITY

### Progressive Profiling Strategy

**Do NOT ask for everything upfront.** Capture information incrementally as the user demonstrates intent:

| Stage | User Action | What to Capture | What NOT to Ask |
|-------|-------------|-----------------|-----------------|
| **Stage 0 — Anonymous** | Browsing, searching | Nothing — track behavior only | Anything |
| **Stage 1 — Interested** | Saves 3rd listing, uses calculator, views market report | Email only | Phone, timeline, budget |
| **Stage 2 — Engaged** | Downloads guide, requests valuation, signs up for alerts | Email + first name | Phone, pre-approval status |
| **Stage 3 — Active** | Schedules showing, requests CMA, uses net proceeds calculator | Name + email + phone + "When are you looking to buy/sell?" | Income, financing details |
| **Stage 4 — Qualified** | Responds to agent outreach, books appointment | Pre-approval status, budget range, neighborhoods, timeline, currently working with another agent? | Nothing invasive — this is a conversation now |

### Qualification Questions That Feel Like Personalization

Frame qualifying questions as "help us tailor your experience":

- **"When are you looking to move?"** (replaces "What's your timeline?")
  - Options: "As soon as possible" / "Within 3 months" / "3-6 months" / "Just exploring"
  - This is your single most important qualifier. "ASAP" and "within 3 months" = hot leads.

- **"Are you buying or renting?"** (on search pages — you already have this)

- **"Have you been pre-approved for a mortgage?"** (only ask after showing/CMA request)
  - Frame as: "This helps us identify properties in your range and strengthens your offer."

- **"Are you currently working with a real estate agent?"** (ask at Stage 3-4)
  - If yes: "Great! Feel free to have your agent contact us for showing arrangements."
  - This is both ethical (avoids poaching) and practical (avoids wasted time with represented buyers).
  - **REBNY/UCBA compliance:** You must respect existing agency relationships.

- **"What type of property are you looking for?"** (co-op, condo, townhouse)
  - Co-op signals higher friction (board approval) but often more price-conscious buyers
  - Condo/townhouse signals potentially higher budget or international buyer

### What NOT to Ask (Ever, On a Web Form)

- Income or net worth (invasive, possibly discriminatory, Fair Housing risk)
- Race, religion, national origin, familial status, disability (Fair Housing violation)
- Employer name (feels like an interrogation)
- Social security number (obviously)
- "How did you hear about us?" (low-value question that adds friction — track UTM parameters instead)

### Form Design Principles

- Maximum 3-4 fields per form (name, email, +1 qualifier)
- Always include a phone number field but mark it OPTIONAL
- Pre-fill where possible (if they searched "Upper East Side condos $1-2M", auto-populate those details)
- Submit button text should be specific: "Get My Closing Cost Estimate" not "Submit"
- Always show value before asking for info: "Here are 3 comps for your building. Enter your email for the full report."

---

## 5. NYC-SPECIFIC TACTICS

### Co-op vs. Condo Buyer Segmentation

| Signal | Co-op Buyer | Condo Buyer |
|--------|------------|-------------|
| Price sensitivity | Higher (co-ops are 20-30% cheaper per sq ft) | Lower |
| Financial documentation comfort | Must be comfortable with board scrutiny | Less invasive process |
| Down payment readiness | 20%+ required (many boards want 25-30%) | 10-20% typical |
| Timeline expectations | 90+ days to close | 60 days to close |
| International buyer likelihood | Low (co-op boards often reject) | High |
| Investor likelihood | Low (most co-ops prohibit subletting) | High (condo = investment friendly) |

**Implementation:** Track search filters. If a user exclusively filters for condos, they may be an international buyer or investor. If co-ops only, likely a primary residence buyer with strong financials.

### Sponsor Unit Opportunity Page
Create a dedicated "Sponsor Units Available" section:
- Sponsor sales = no board approval, often negotiable pricing, tax abatements
- This attracts: first-time buyers, international buyers, investors, anyone who wants to avoid board interviews
- **Lead capture:** "Get notified when new sponsor units hit the market" — email gate

### International Buyer Landing Page
Capture high-net-worth international buyers:
- Address FIRPTA withholding (15% of gross sale price for foreign sellers — relevant for their exit strategy)
- Explain EB-5 visa program connection to real estate investment
- NYC pied-a-terre tax considerations
- Recommended international tax attorneys and accountants
- Currency and wire transfer guidance
- **Lead capture:** "Schedule a consultation for international purchasers" — captures country of origin (for language/timezone matching), timeline, budget range, purchase purpose (primary residence, investment, pied-a-terre)
- **Compliance:** Do NOT filter or discriminate based on national origin (Fair Housing). This page helps serve international buyers better, not screen them out.

### 1031 Exchange Timing for Sellers
Create a "1031 Exchange Guide for NYC Property Owners":
- 45-day identification window, 180-day closing deadline
- Why NYC sellers often exchange INTO out-of-state properties (and vice versa)
- How FIRPTA intersects with 1031 exchanges for foreign-held properties
- Recommended qualified intermediaries
- **Lead capture:** "Get our 1031 Exchange timeline checklist" — these are investors with assets ready to move

### Rent-Stabilized Building Analysis for Investors
- Explain rent stabilization impact on building valuation
- Cap rate analysis for stabilized vs. free-market buildings
- Recent regulatory changes and their market impact
- **Lead capture:** This content self-selects for experienced investors — high-quality leads

### Corporate Relocation Buyers
- Create a "Relocating to NYC" guide
- Partner with relocation companies (Cartus, BGRS, SIRVA)
- Content: neighborhood comparisons for families, school district info, commute analysis
- **Lead capture:** "Get a personalized NYC neighborhood guide based on your office location" — captures office address, family size, budget, timeline
- These buyers typically have employer backing and purchase within 60-90 days

---

## 6. WHAT SERIOUS BUYERS AND SELLERS LOOK AT

### Buyer Research Timeline (NYC-Specific)

| Phase | Duration | Behavior | Your Opportunity |
|-------|----------|----------|-----------------|
| **Dreaming** | 6-12 months before | Casually browsing StreetEasy, Zillow | Not your target — let them come to you organically |
| **Planning** | 3-6 months before | Getting pre-approved, narrowing neighborhoods, attending open houses | Capture via content (guides, calculators, market reports) |
| **Searching** | 1-3 months before | Active daily searches, viewing 14-21 properties, comparing options | Capture via search tools, saved search alerts, showing requests |
| **Deciding** | 0-4 weeks before | Repeat visits to 2-3 properties, running financials, checking comps | Capture via comparison tools, CMA requests, agent consultations |
| **Transacting** | Offer to close (60-90 days) | Working with agent, board packages, inspections | Retain via excellent service |

**Key insight:** Your highest-value capture window is the "Searching" and "Deciding" phases. Buyers in these phases view 14-21 properties before making a decision (per NYC industry data). A buyer who has viewed 10+ listings on your site and returns repeatedly is in this window.

### What Pages Serious Buyers Visit Most

1. **Listing detail pages** (with time spent > 2 minutes)
2. **Floor plans and virtual tours** (not just photos)
3. **Building/neighborhood information**
4. **Financial calculators** (mortgage, closing costs)
5. **Comparable sales / market data**
6. **Agent profile and past deals**

### What Triggers a Buyer to Reach Out

1. **They found a specific property they want to see** — highest-intent signal
2. **They have a question the website cannot answer** — building financials, co-op policies, negotiation leverage
3. **They want validation of their own research** — "Am I overpaying?"
4. **They feel a time pressure** — lease ending, relocation deadline, interest rate changes
5. **They trust the agent** — past deal track record, neighborhood expertise, professional presentation

### What Makes Them Choose One Agent Over Another

1. **Demonstrated expertise in their target neighborhood** (not generic "I cover all of NYC")
2. **Responsiveness** — first agent to respond gets the client 78% of the time
3. **Track record** — recent comparable sales, not just years in business
4. **Professionalism of materials** — quality of website, listing presentations, market reports
5. **Personal connection** — boutique advantage: "I will personally handle your transaction"

---

## 7. LEAD SCORING MODEL

### Point System

| Category | Action | Points | Decay |
|----------|--------|--------|-------|
| **SEARCH BEHAVIOR** | | | |
| | First site visit | +5 | — |
| | Return visit (within 7 days) | +10 | — |
| | Return visit (within 48 hours) | +15 | — |
| | Search with specific filters (price, beds, neighborhood) | +5 | — |
| | Search within tight price band (< $100K range) | +10 | — |
| **LISTING ENGAGEMENT** | | | |
| | View listing detail page (> 30 sec) | +3 | — |
| | View listing detail page (> 2 min) | +8 | — |
| | View same listing 3+ times | +20 | — |
| | View floor plan | +10 | — |
| | View virtual tour | +10 | — |
| | Open photo gallery (view 5+ photos) | +5 | — |
| | Save listing to favorites | +10 | — |
| | Save 3+ listings | +15 (bonus) | — |
| | Compare properties | +20 | — |
| **FINANCIAL TOOLS** | | | |
| | Use mortgage calculator | +15 | — |
| | Use closing cost calculator | +20 | — |
| | Use net proceeds calculator (seller) | +25 | — |
| | Input real numbers (not defaults) into calculators | +10 (bonus) | — |
| **CONTENT ENGAGEMENT** | | | |
| | View neighborhood market report | +8 | — |
| | View co-op/condo guide | +5 | — |
| | Download any PDF guide | +15 | — |
| | View agent profile page | +10 | — |
| | View past deals / case studies | +10 | — |
| **FORM INTERACTIONS** | | | |
| | Submit email for alerts/newsletter | +20 | — |
| | Submit inquiry form on listing | +40 | — |
| | Request showing/appointment | +50 | — |
| | Request home valuation / CMA | +50 | — |
| | Abandon form after starting | +10 | — |
| **QUALIFICATION ANSWERS** | | | |
| | Timeline: "ASAP" or "Within 3 months" | +30 | — |
| | Timeline: "3-6 months" | +15 | — |
| | Timeline: "Just exploring" | +0 | — |
| | Pre-approved: Yes | +30 | — |
| | Working with agent: No | +10 | — |
| **DECAY** | | | |
| | No site visit in 14 days | -20 | Every 14 days |
| | No site visit in 30 days | -40 | Every 30 days |
| | Unsubscribes from emails | -50 | One-time |

### Scoring Thresholds

| Score | Classification | Action |
|-------|---------------|--------|
| **0-29** | **Cold** | Automated nurture only (monthly email). No manual outreach. |
| **30-59** | **Warm** | Add to weekly market update emails. Monitor for score increases. |
| **60-89** | **Marketing Qualified Lead (MQL)** | Send targeted content based on behavior (neighborhood-specific, buyer vs. seller). Consider personal email introduction. |
| **90-119** | **Sales Qualified Lead (SQL)** | **Personal outreach within 24 hours.** Phone call or personal email. Reference specific properties they viewed. |
| **120+** | **Hot Lead** | **Immediate outreach (within 1 hour during business hours).** This person is actively deciding. |

### Auto-Escalation Triggers (Immediate Alert, Regardless of Score)

These actions trigger an instant notification to Maya/assigned agent:

1. **Showing request submitted** — respond within 15 minutes during business hours
2. **Home valuation/CMA request submitted** — respond within 1 hour
3. **Same listing viewed 5+ times in 7 days** — this person wants to see it in person
4. **Calculator used with property price > $2M** — high-value potential transaction
5. **3+ listings saved in one session** — actively building a shortlist
6. **Return visit within 24 hours after first inquiry** — following up on their own initiative

### Cool-Down Rules

- **Maximum 1 personal outreach per week** after initial contact (unless they respond)
- **Maximum 2 automated emails per week** (market updates + one targeted)
- **If no response after 3 outreach attempts:** Drop to monthly automated only. Do NOT keep calling.
- **If lead explicitly says "not ready":** Move to monthly nurture, re-engage in 3 months
- **TCPA compliance:** Honor ALL opt-out requests within 10 business days (new 2025 rule). Universal opt-out applies across channels.

---

## 8. IMPLEMENTATION PRIORITIES

### Priority 1 — Do This Week (High Impact, Low Effort, Zero Cost)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1a | **Add behavioral event tracking** to listing pages, calculators, favorites, and search. Store in Postgres (you already have the DB). | 1-2 days | Foundation for everything else |
| 1b | **Add timeline question** to existing inquiry form: "When are you looking to move?" as a dropdown (ASAP / Within 3 months / 3-6 months / Just exploring) | 2 hours | Instantly qualifies every inquiry |
| 1c | **Add "pre-approved?" question** to showing request form (optional checkbox) | 1 hour | Identifies most serious buyers |
| 1d | **Set up email alerts** for auto-escalation triggers (showing request, valuation request, high engagement) via your existing API | 4-6 hours | Ensures fast response to hot leads |

### Priority 2 — Build This Month (High Impact, Medium Effort)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 2a | **Enhanced NYC Closing Cost Calculator** (co-op vs. condo, mansion tax brackets, mortgage recording tax) with PDF export gated behind email | 3-4 days | Best lead magnet for serious buyers |
| 2b | **Net Proceeds Calculator for Sellers** (broker fee, transfer tax, flip tax, capital gains estimate) | 3-4 days | Best lead magnet for serious sellers |
| 2c | **Neighborhood Market Snapshots** on your 59 neighborhood pages (median price, DOM, trends from your own closed sales data) | 2-3 days | SEO + credibility + email capture for alerts |
| 2d | **Lead scoring implementation** (Postgres table, score calculation on events, threshold alerts) | 3-5 days | Prioritize follow-up, stop wasting time on cold leads |

### Priority 3 — Build Next Quarter (Medium Impact, Higher Effort)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 3a | **Enhanced Home Valuation Tool** (3-step: instant AVM, refined estimate, in-person CMA) | 1-2 weeks | Seller lead magnet — replaces generic widget |
| 3b | **Co-op Board Package Guide** (downloadable PDF, email-gated) | 2-3 days (content creation) | Positions Mallan as co-op expert |
| 3c | **Email drip sequences** (hot buyer: 8 emails over 35 days; warm: weekly market updates; seller: 6 emails over 30 days) | 1 week (content + automation) | Nurture leads that are not ready yet |
| 3d | **Comparable Sales Viewer** on listing detail pages (3-5 nearby closed sales with price/sqft comparison) | 3-5 days | Keeps serious buyers on your site instead of going to StreetEasy |
| 3e | **International Buyer Landing Page** with FIRPTA/tax guidance | 2-3 days (content) | Captures underserved high-net-worth segment |

### Priority 4 — Future Enhancements (Lower Priority or Higher Cost)

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 4a | **Commute comparison tool** (compare commute from 3 saved listings to office address) | 1-2 weeks | Nice-to-have; transit data already exists |
| 4b | **1031 Exchange Guide + landing page** | 2-3 days | Niche but high-value investor leads |
| 4c | **Sponsor Unit dedicated section** | 1-2 days | Good for first-time buyers / international |
| 4d | **Video content** (neighborhood tours, market updates) | Ongoing | Brand building; longer-term ROI |
| 4e | **Social media retargeting** (FB/IG pixel for luxury property viewers) | Setup: 1 day; ongoing ad spend | Effective but requires budget |

---

## 9. WHAT COMPETITORS DO (And What Matters for a Boutique)

### Compass
- **Private Exclusive Network:** 3-phase marketing (private to Compass agents, then "coming soon" on compass.com, then MLS). Creates FOMO and captures buyers who want early access.
- **Market data integration:** Deep neighborhood data on every listing page.
- **Agent-centric branding:** Each agent gets a personal landing page with their own branding within Compass.
- **What to learn:** Their "coming soon" strategy drives urgency. You can replicate this with your own exclusives — "Contact Maya for early access to off-market listings" (REBNY-compliant if properly structured per Private Exclusive rules).
- **What to skip:** Their technology platform costs millions. You do not need it.

### Douglas Elliman
- **AI Image Search:** Users upload photos of rooms they like, AI finds matching listings. Innovative but high-development-cost.
- **Black Label (Private Exclusives):** Similar to Compass's private network.
- **Market Reports:** Quarterly reports by neighborhood, co-authored with appraisal firms (e.g., Miller Samuel). High credibility.
- **What to learn:** Market reports are a powerful lead magnet. Partner with a local appraiser for data credibility.
- **What to skip:** AI image search is cool but expensive to build and maintain. Not worth it for a boutique.

### Corcoran
- **Corcoran Reserve:** Their private exclusive platform.
- **Neighborhood guides:** Deep content on NYC neighborhoods with local recommendations.
- **The Corcoran Report:** Long-running market data brand.
- **What to learn:** Neighborhood content drives organic SEO traffic. Your 59 neighborhood pages are a strong foundation — add market data to make them lead magnets.
- **What to skip:** Their scale of content production requires a full marketing team.

### Serhant
- **Media-first approach:** 7 million social followers. Every luxury listing gets cinematic content.
- **Personal brand as lead magnet:** Ryan Serhant IS the brand. Content (YouTube, Instagram, TikTok) drives inbound leads.
- **What to learn:** Video content builds trust faster than any website feature. Even one professional video per month (market update, neighborhood tour, recently sold property) builds credibility.
- **What to skip:** You do not need 7 million followers. 500 engaged local followers who are actual NYC buyers/sellers are more valuable than 7 million national viewers.

### What a Boutique Can Do That They Cannot

1. **Respond personally within 15 minutes.** Large firms route leads through systems. You can text back immediately.
2. **Remember every client.** Large firms lose leads in CRM databases. You know your clients personally.
3. **Offer consistent service.** Large firms have variable agent quality. You control the experience end-to-end.
4. **Be transparent about fees.** Large firms hide behind corporate policies. You can have a direct conversation.
5. **Tailor the search.** Large firms show the same listings to everyone. You can curate 5 perfect listings instead of 500 mediocre ones.

---

## 10. REACHING CLIENTS EFFECTIVELY

### Email Sequences

**Hot Buyer Sequence (Score 90+, timeline within 3 months):**

| Day | Email | Content |
|-----|-------|---------|
| 0 | Welcome + next steps | "Thank you for your inquiry about [property/neighborhood]. Here's what to expect..." Include 3 hand-picked listings based on their search behavior. |
| 2 | Market context | "Here's what's happening in [their target neighborhood] right now." 3 data points + 2 new listings. |
| 5 | Educational value | "5 things every NYC [co-op/condo] buyer should know before making an offer." |
| 10 | Social proof | "How we helped a buyer find their perfect [neighborhood] [property type]." Case study. |
| 14 | Soft check-in | "Have you had a chance to visit any of the properties we discussed? I have a few new options..." |
| 21 | Market urgency (if real) | "3 properties in your search criteria went under contract this week. Here's what's still available." |
| 28 | Personal invitation | "I'd love to show you some properties that match what you're looking for. Here are a few times this week..." |
| 35 | Value add | "Free neighborhood walking tour — see [neighborhood] from a local's perspective." |

**Warm Buyer Sequence (Score 30-89):**
- Weekly market update email (automated, neighborhood-specific)
- Monthly: "New listings in [their saved neighborhoods]"
- Quarterly: "Market report for [their target area]"

**Seller Sequence (Valuation request or seller content engagement):**

| Day | Email | Content |
|-----|-------|---------|
| 0 | Valuation follow-up | "Here's the preliminary value range for your property at [address]. Want a detailed analysis? Let's schedule 15 minutes." |
| 3 | Market timing | "Is now a good time to sell in [their neighborhood]?" Data-driven answer. |
| 7 | Net proceeds | "What you'd actually take home: a breakdown of selling costs in NYC." Link to net proceeds calculator. |
| 14 | Process overview | "What selling your NYC [co-op/condo] looks like, step by step." |
| 21 | Social proof | "Recently sold: [similar property in their area] — here's how we did it." |
| 30 | Soft close | "Whenever you're ready, I'm here. In the meantime, here's how the market has moved this month." |

### Phone Outreach

- **When to call:** Within 1 hour for hot leads (showing requests, CMA requests). Within 24 hours for SQLs.
- **Best times:** Tuesday-Thursday, 10am-12pm or 2pm-4pm. Avoid Monday mornings and Friday afternoons.
- **Script framework (not a script to read verbatim):**
  1. Reference their specific behavior: "I noticed you've been looking at properties in [neighborhood]..."
  2. Offer value: "I actually have some insight on that building / I just showed a similar unit..."
  3. Ask ONE qualifying question: "What's your timeline looking like?"
  4. Propose next step: "Would you like me to set up a few showings this week?"
- **If voicemail:** Keep it under 20 seconds. Reference a specific property or neighborhood. Leave your cell number. Do NOT leave more than 2 voicemails.

### Text / WhatsApp

- **TCPA Compliance (critical):**
  - MUST have prior express written consent before texting for marketing purposes
  - Consent must be specific to your brokerage (not a third-party lead form)
  - Include opt-out instructions in first marketing text
  - Honor opt-outs within 10 business days (new April 2025 rule)
  - Do NOT text before 8am or after 8pm local time
  - Keep records of consent for minimum 5 years
- **When to text:** After initial phone/email contact is established. Text is for logistics (showing confirmations, quick questions), not marketing.
- **WhatsApp:** Particularly effective for international buyers. Same TCPA rules apply.

### Social Media Retargeting

- **Facebook/Instagram:** Create a Custom Audience pixel on mallan.nyc. Retarget users who:
  - Viewed 3+ listing detail pages (interested buyer)
  - Used a calculator (financially engaged)
  - Visited seller content (potential listing lead)
- **Ad creative:** Show the SPECIFIC properties or neighborhoods they viewed (dynamic retargeting). NOT generic "We sell homes" ads.
- **Budget:** Start at $500/month. Luxury NYC real estate CPMs are high ($15-25) but the audience is small and highly targeted.
- **Compliance:** Do NOT use MLS photos in social ads without proper attribution. Use your own photography or R2-hosted agent uploads.

### Direct Mail for Sellers

- **Target:** Homeowners in buildings where you have recently sold or listed. Use public records (ACRIS) to identify owners.
- **Format:** Oversized postcard, high-quality stock. NOT a generic "thinking of selling?" piece.
- **Content:** "We recently sold Unit [X] in your building for $[price]. Curious what your unit is worth? Scan this QR code for an instant estimate." QR code goes to your home valuation tool, pre-populated with their building.
- **Cadence:** One piece per quarter per building. Do NOT spam.
- **Cost:** ~$1-2 per piece printed and mailed. For a building of 100 units, that is $100-200 per mailing.
- **Compliance:** NY DOS requires brokerage name, license number, and address on all advertising (19 NYCRR 175.25).

### Handoff from Automated to Personal

| Trigger | Handoff Action |
|---------|---------------|
| Lead score crosses 90 | Assign to Maya, personal email within 24 hours |
| Showing request submitted | Personal call/text within 1 hour |
| Lead replies to any automated email | Stop automation, switch to personal correspondence |
| Lead asks a specific question | Personal response only — never auto-reply to a direct question |
| Lead views 5+ listings in one session | Send personal email: "I noticed you're looking at [type] in [area] — want me to curate a shortlist?" |
| Lead uses calculator with price > $2M | Personal outreach within 24 hours |

**The cardinal rule:** Once a lead shows they are a real person with real intent, STOP the automation and START the relationship. Automated emails after personal contact has begun feel impersonal and damage trust.

---

## Compliance Checklist for All Lead Capture

| Requirement | Status | Notes |
|-------------|--------|-------|
| TCPA opt-in consent on all forms | MUST IMPLEMENT | Written consent checkbox, specific to Mallan Real Estate |
| CAN-SPAM unsubscribe in all emails | MUST IMPLEMENT | One-click unsubscribe, honor within 10 days |
| Fair Housing language review | MUST IMPLEMENT | No discriminatory language in any content, ads, or guides |
| NY DOS advertising compliance | MUST IMPLEMENT | Brokerage name + license # on all marketing materials |
| REBNY RLS attribution | ALREADY DONE | Required on all IDX-displayed listings |
| REBNY commission negotiability disclosure | MUST IMPLEMENT | Required per UCBA 2026 in buyer/seller agreements |
| NY SHIELD Act data security | MUST IMPLEMENT | Encrypt PII in transit and at rest, breach notification plan |
| WCAG 2.1 AA accessibility | MUST VERIFY | All forms, calculators, and content must be accessible |
| Cookie consent | MUST IMPLEMENT | If tracking behavior via cookies, disclose in privacy policy |

---

## Summary: The Boutique Advantage

Large brokerages optimize for lead VOLUME. They buy Zillow leads, run Facebook ads at scale, and route inquiries through call centers. Most of those leads never transact.

Mallan Real Estate should optimize for lead QUALITY. Every tool, piece of content, and capture mechanism on mallan.nyc should answer: "Is this person ready to buy or sell within 90 days?"

**The three pillars:**
1. **Depth over breadth** — Be the NYC closing cost expert, the co-op board package expert, the UES market expert. Not everything to everyone.
2. **Speed over scale** — Respond to hot leads in 15 minutes, not 15 hours. This alone beats every large firm.
3. **Signal over noise** — Use behavioral scoring to know WHO to call, WHEN to call, and WHAT to say when you call.

The tools and content recommended in this report are designed to attract people who are actively doing the financial and logistical homework that precedes a real estate transaction. Anyone who uses your closing cost calculator with a real price, views the same listing four times, and downloads your board package guide is telling you they are ready. Your job is to listen to those signals and respond before your competitors do.
