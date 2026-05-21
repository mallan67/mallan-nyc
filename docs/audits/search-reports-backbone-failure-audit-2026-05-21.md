# Search + Reports Backbone Failure Audit — 2026-05-21

**Status:** REPORT-ONLY · No code patches · No schema changes · No migrations · No env/Neon/cron/workflow/agent/skill changes · No external-inventory or sponsor implementation · No PR 5B activity · No `/api/listings` reader change · No `ListingSearchProjection` migration · No admin bypass.

**Author:** Claude Code (Opus 4.7) under Maya direction.

**Sources synthesized:** 4 parallel read-only research threads against main HEAD `1190c88e` (PR #173 audit doc merged):
- Agent CRM search lane (live-probe + source-read of `/api/idx/search`, `/api/crm/listings`, `lib/search/crm-idx-*.ts`, `public/crm/js/search/**`, `public/crm/js/render/**`)
- Reports / sends lane (CMA · listing send · saved-search alert · pitch packet · hook email · market report · comps · buyer/tenant deal forms · showings)
- Portal display lane (40 `app/api/portal/**` routes inventoried; DTO sanitization; per-Lead ownership filter matrix)
- Compliance enforcement lane (12 regulatory regimes × 16 surfaces — REBNY UCBA, IDX Plus, Fair Housing, FARE Act, TCPA, CAN-SPAM, NY SHIELD, NY DOS §175.25, §175.28, UCBA §17, ethics gate, per-agent privacy)

**Prior canonical baseline:** `docs/audits/crm-agent-search-architecture-audit-2026-05-21.md` (PR #173, merged 2026-05-21).

---

## 0. TL;DR — what is actually broken right now

mallan.nyc's CRM has a **fully built agent-search UI behind login** (`public/crm/index-built.html`, 37,436 lines) that the prior audit missed because it lives in a **separate app shell** from the modern `dashboard.html`. The dashboard tile "Property Search" opens it in a **new browser window** via `window.open('/crm/search')`. So the prior audit's "no agent-search UI today" finding is **half-wrong** — agent search exists, just architecturally bifurcated.

However, the audit found **15 BLOCKER-class and 12 STRICT defects** across send / portal / search surfaces. The most material are:

| Rank | Defect | Severity | Impact |
|---|---|---|---|
| 1 | `crm-idx-mapper.ts:208` hardcodes `listingType: "Exclusive"` on EVERY mapped IDX row | **BLOCKER** | NY DOS §175.25 misrepresentation — every IDX row mislabeled "Exclusive"; sale/rent distinction lost downstream |
| 2 | `listing-sends/route.ts:211` reads `personalNote` and inserts into email body WITHOUT Fair Housing scan | **BLOCKER** | HUD up to $65K · NYC CHR up to $250K+ · REBNY $250→$500 + termination per send |
| 3 | `listing-sends` route never checks `Lead.consent_captured_at IS NOT NULL` on recipient; relies on sendgrid boundary `last_unsubscribe_at` only | **BLOCKER** | TCPA 47 CFR 64.1200(f)(8) per-message violation when sending to manually-imported lead with no positive consent |
| 4 | `/api/portal/seller/fomo` + `/seller/demand` scope = `listing.agent.leads.some.id = lead.id` (any seller sharing an agent with another seller reads the OTHER seller's listing metrics) | **BLOCKER** | REBNY Art. III §2 cross-client confidentiality breach |
| 5 | `/api/portal/marketing`, `/api/portal/comparables`, `/api/portal/price-history` accept `listingId` with NO ownership check; `marketing` leaks `agent.full_name` | **BLOCKER** (3 routes) | Cross-listing PII leak |
| 6 | `workspace.js:2206` "Find & Send" passes `{ q: q }` but `api-client.js:556-596` does NOT serialize `q` | **BLOCKER** | UI appears to search but silently returns unfiltered top page → agent sends wrong matches to clients |
| 7 | `/api/portal/buyer/saved` returns `Listing.address` + media WITHOUT `sanitizeListingForPortal` and WITHOUT `internet_address_display_yn` check | HIGH | Address-suppressed listings leak full address to favoriting lead |
| 8 | CMA "send to client" workflow is missing — status enum includes `"sent"` but no email path, no `/api/portal/cma-reports` route | **BLOCKER** | Agent PATCHes status to "sent", gets green checkmark, client never receives — silent legal exposure |
| 9 | Market report has no GET, no persistence, no email — only an inline render with an `auditEvent` audit row | HIGH | Recomputed every UI render; no historical record; no send mechanism |
| 10 | `panels.js:9019` IDX-matches dashboard tile uses `params.neighborhoods` (plural) but api-client only checks `neighborhood` (singular) | STRICT | Smart-match preview silently ignores neighborhood preferences |
| 11 | Doorman amenity filter dropped client-side at `crm-idx-filter.ts:252-259` because `AssociationAmenities` not OData-filterable | STRICT | Doorman filter only narrows already-fetched 200-row page; Trestle inventory beyond 200 invisible to doorman filter |
| 12 | `cma.notes` + `pitch_data.notes` + `pitch-packet.notes` agent-supplied free text NOT scanned for Fair Housing | STRICT | Same exposure class as listing-sends personal note (above) |
| 13 | `crm/saved-searches` GET hardcodes `where: { agent_id: auth.userId }` always (no broker bypass — inconsistent with CMA pattern) | STRICT | Broker cannot oversee agent saved searches (audit-trail gap) |
| 14 | Per-request ethics gate (UCBA Art. III §6) still login-only — confirmed unchanged from backend gap audit Finding 9.1 | STRICT | Carried from prior audit |
| 15 | `search-alerts` cron does not pre-filter by `consent_captured_at` — relies on sendgrid boundary `last_unsubscribe_at` only | STRICT | Same TCPA gap as #3 but in cron-driven daily alerts |

---

## 1. What is broken (inventory)

### 1.1 Agent CRM search

| # | Item | File:line | Status |
|---|---|---|---|
| S-1 | `listingType: "Exclusive"` hardcode on every IDX row | `lib/search/crm-idx-mapper.ts:208` | **BROKEN** |
| S-2 | "Find & Send" free-text search drops `q` param silently | `public/crm/js/dashboard/workspace.js:2206` + `public/crm/js/core/api-client.js:556-596` | **BROKEN** |
| S-3 | Dashboard tile uses `params.neighborhoods` (plural); api-client only handles `neighborhood` | `public/crm/js/dashboard/panels.js:9019` | **BROKEN** (silent) |
| S-4 | Doorman amenity not OData-filterable (`AssociationAmenities` not in whitelist) | `lib/search/crm-idx-filter.ts:239-277` | **STUB** (works only on already-fetched 200 rows) |
| S-5 | `/api/idx/search` response missing `_compliance` envelope (only top-level `attribution`) | `app/api/idx/search/route.ts:328` | **STUB** (asymmetric with `/api/listings`) |
| S-6 | Modern `dashboard.html` has no embedded search UI — only popup-window bridge | `public/crm/dashboard.html` + `public/crm/js/dashboard/panels.js:9059-9215` | architectural — opens `/crm/search` via `window.open` |
| S-7 | `dashboard.html` `#globalSearch` topbar input has no event handler attached | `public/crm/dashboard.html:81` | **DEAD UI** |

### 1.2 Reports / sends

| # | Item | File:line | Status |
|---|---|---|---|
| R-1 | **`ListingSend` Prisma model does NOT exist** (master plan PR 8 NOT STARTED) | `prisma/schema.prisma` (no `model ListingSend`) | **STUB** |
| R-2 | Listing-send history reconstructed from `AuditEvent` (no per-send stable id surviving audit pruning) | `app/api/crm/communications/route.ts:59-64` | **STUB** |
| R-3 | `/api/crm/listing-sends` has POST only — no GET endpoint | `app/api/crm/listing-sends/route.ts` | **STUB** |
| R-4 | **CMA send-to-client workflow missing** — status accepts `"sent"` but no email transport, no portal route | `app/api/crm/cma/route.ts` + `app/api/crm/cma/[id]/route.ts` | **BROKEN** — silent legal exposure |
| R-5 | Market report has no GET, no `MarketReport` model, no email send, no portal exposure | `app/api/crm/market-report/route.ts` (POST only) | **STUB** |
| R-6 | No `/api/portal/cma-reports` route | (absent) | **MISSING** |
| R-7 | No `/api/portal/saved-searches` route | (absent) | **MISSING** (agent-only feature today) |
| R-8 | No "Reports" tab at CRM top-level | (UI gap) | **MISSING** |
| R-9 | No "CMA Send" UI button — only PATCH status | (UI gap) | **BROKEN — UX trap** |

### 1.3 Portal display

| # | Item | File:line | Status |
|---|---|---|---|
| P-1 | `/api/portal/seller/fomo` cross-client leak | `app/api/portal/seller/fomo/route.ts:43-48` (`agent.leads.some.id`) | **BROKEN** (CRITICAL) |
| P-2 | `/api/portal/seller/demand` cross-client leak | `app/api/portal/seller/demand/route.ts:38-43` | **BROKEN** (CRITICAL) |
| P-3 | `/api/portal/marketing` accepts `listingId` without ownership check; leaks `agent.full_name` | `app/api/portal/marketing/route.ts:14-22` | **BROKEN** (CRITICAL) |
| P-4 | `/api/portal/comparables` accepts `listingId` without ownership check | `app/api/portal/comparables/route.ts:18-24` | **BROKEN** (CRITICAL) |
| P-5 | `/api/portal/price-history` accepts `listingId` without ownership check | `app/api/portal/price-history/route.ts:13-21` | **BROKEN** (CRITICAL) |
| P-6 | `/api/portal/buyer/saved` returns raw `Listing.address` + media without sanitizer | `app/api/portal/buyer/saved/route.ts` | **BROKEN** (HIGH) |
| P-7 | `/api/portal/open-houses` returns `listing.address` without address-display gate | `app/api/portal/open-houses/route.ts` | **BROKEN** (MEDIUM) |
| P-8 | No dedicated "Sent to me" tab (folded into `/api/portal/listings`) | `app/portal/buyer/page.tsx` | **STUB** (works via ClientListingAction filter — but UX is invisible) |
| P-9 | Portal does NOT render REBNY attribution or Fair Housing copy in listing cards (email-only) | (UI gap — defensible, but worth flagging) | **DESIGN GAP** |
| P-10 | Portal documents endpoint fails-loud 501 (SCHEMA-GAP-001) | `app/api/portal/documents/route.ts` | **STUB** (correct fail-loud pattern) |

### 1.4 Compliance / consent / logging

| # | Item | File:line | Status |
|---|---|---|---|
| C-1 | `listing-sends.note` body bypasses Fair Housing scanner | `app/api/crm/listing-sends/route.ts:211` | **BROKEN** (CRITICAL) |
| C-2 | `listing-sends` does not check `Lead.consent_captured_at IS NOT NULL` (positive TCPA consent) | `app/api/crm/listing-sends/route.ts` | **BROKEN** (CRITICAL) |
| C-3 | `search-alerts` cron does not pre-filter by `consent_captured_at` (same positive-consent gap) | `app/api/cron/search-alerts/route.ts:32-41` | **BROKEN** (HIGH) |
| C-4 | `cma.notes` agent free-text not Fair-Housing-scanned | `app/api/crm/cma/route.ts` + `[id]/route.ts` | **BROKEN** (HIGH) |
| C-5 | Pitch-packet + hook-email use bespoke HTML, drifted from `lib/email/templates.ts` canonical `FOOTER` | `app/api/crm/sales/prospects/[id]/send-packet/route.ts:437-456` · `hook-email/route.ts:123-187` | **STRICT** (drift risk) |
| C-6 | `/api/search-alerts` (public POST) does not scan `criteria.neighborhood` or auto-built `name` | `app/api/search-alerts/route.ts:76-78, 176-198` | **STRICT** |
| C-7 | `/api/idx/search` returns `attribution` at top level not `_compliance.attribution`; no `_compliance.disclaimer` | `app/api/idx/search/route.ts:328` | **STRICT** |
| C-8 | Per-request ethics-training gate gap (login-only) | `lib/auth/session.ts:108-120` | **STRICT** (carried from prior audit 9.1) |
| C-9 | `pitch-packet` GET surfaces raw Trestle records without `checkDistributionGates` (residual; IDX Plus pre-filters at provider level) | `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts:42-61` | **STRICT** |
| C-10 | `/api/crm/cma` POST has no REBNY attribution in persisted `CmaReport` or response | `app/api/crm/cma/route.ts` | **STRICT** |
| C-11 | `/api/crm/saved-searches` GET hardcodes `where: { agent_id: auth.userId }` (no broker bypass) | `app/api/crm/saved-searches/route.ts:75` | **STRICT** (inconsistent with CMA `auth.role !== "BROKER"` pattern) |

---

## 2. Exact file/route causing each break

(Full citations embedded in §1 status tables above. Key references collected here for quick navigation.)

```
SEARCH:
  lib/search/crm-idx-mapper.ts:208       — listingType: "Exclusive" hardcode
  public/crm/js/dashboard/workspace.js:2206  — { q: q } silent drop
  public/crm/js/core/api-client.js:556-596   — param serializer (no q, only singular neighborhood)
  public/crm/js/dashboard/panels.js:9019     — params.neighborhoods (plural) mismatch
  lib/search/crm-idx-filter.ts:239-277       — checkbox whitelist (AssociationAmenities excluded)
  app/api/idx/search/route.ts:328            — no _compliance envelope

SENDS / REPORTS:
  app/api/crm/listing-sends/route.ts:211     — personalNote → email body, no FH scan
  app/api/crm/listing-sends/route.ts         — POST only, no positive-consent check
  app/api/cron/search-alerts/route.ts:32-41  — no consent_captured_at pre-filter
  app/api/crm/cma/route.ts + [id]/route.ts   — no email send, no portal route, no FH scan on notes
  app/api/crm/market-report/route.ts         — POST only, no model, no email, no portal
  app/api/crm/sales/prospects/[id]/send-packet/route.ts:437-456  — bespoke HTML drifted
  app/api/crm/sales/prospects/[id]/hook-email/route.ts:123-187   — same
  app/api/crm/sales/prospects/[id]/pitch-packet/route.ts:42-61   — raw Trestle, no gate
  app/api/crm/saved-searches/route.ts:75     — no broker bypass

PORTAL:
  app/api/portal/seller/fomo/route.ts:43-48      — agent.leads.some.id cross-leak
  app/api/portal/seller/demand/route.ts:38-43    — same pattern
  app/api/portal/marketing/route.ts:14-22        — no ownership check; leaks agent.full_name
  app/api/portal/comparables/route.ts:18-24      — no ownership check
  app/api/portal/price-history/route.ts:13-21    — no ownership check
  app/api/portal/buyer/saved/route.ts            — no sanitizer, no address gate
  app/api/portal/open-houses/route.ts            — no address gate

POSITIVE FINDINGS (intact):
  lib/compliance/dto.ts:261-288              — sanitizeForPortal (Hotfix 3) intact
  lib/email/sendgrid.ts:130-155, 200-204     — last_unsubscribe_at gate + List-Unsubscribe headers
  lib/email/sendgrid.ts:217, 159, 223, 137   — email:send / send_dev / send_error / send_suppressed_unsubscribed audit rows
  app/api/cron/search-alerts/route.ts:60-78  — alert-gate defense-in-depth
  app/api/cron/search-alerts/route.ts:187-227 — fail-loud SMTP-misconfigured bail-out in prod
  app/api/crm/listing-sends/route.ts:105-114 — REBNY distribution-gate check pre-send
  app/api/crm/listing-sends/route.ts:51-75   — idempotency-key header check
```

---

## 3. User-visible failure mode (per break)

| # | What the agent or client experiences |
|---|---|
| S-1 | Agent search results: every IDX listing labeled "Exclusive" in the UI (even non-Mallan rows). Downstream consumers reading `listingType` see no sale/rent distinction. |
| S-2 | Agent types in "Find & Send" search box → results panel shows the unfiltered top 200 listings regardless of query. Sends wrong matches to clients. |
| S-3 | Agent sets neighborhood preference on a client → dashboard "IDX matches" tile shows ALL neighborhoods (preference silently ignored). |
| S-4 | Agent checks "Doorman" filter → results don't narrow as expected because the filter only re-narrows the 200 rows already fetched, not the full Trestle inventory. |
| S-6 | Agent clicks "Property Search" tile → a NEW browser window opens with the legacy search shell. Agent returns via browser back button. Workflow context is split between two tabs/windows. |
| S-7 | Agent types in the topbar `#globalSearch` input → nothing happens (no handler). |
| R-4 | Agent creates CMA → PATCHes status to `"sent"` → CRM shows green "sent" status → **client never receives the CMA** because no email transport exists. Agent believes the deliverable was made. |
| R-5 | Agent generates market report → views inline → leaves the tab → report is gone. No persistence, no history, no client share. |
| C-1 | Agent writes "Great for young families!" as personal note on a listing send → email goes through to client with the steering language → Fair Housing violation per send. |
| C-2 | Agent imports a CSV of contacts (no TCPA-recorded consent) → sends listings to those contacts → TCPA per-message violation. |
| C-3 | Daily search-alert cron fires → sends listings to leads who never positively consented → same TCPA exposure. |
| P-1, P-2 | Two sellers sharing the same agent → seller A logs into portal → can read seller B's listing FOMO metrics, demand scores, view counts. |
| P-3, P-4, P-5 | Authenticated buyer/seller knows or guesses a listing ID → can query marketing activity (with listing-agent's full name), comparables, price history of any listing. |
| P-6 | Buyer favorites an address-suppressed listing → portal "Saved" tab renders the full address. |
| R-8 | Agent looks for a "Reports" tab in CRM → no such tab exists. CMA list reachable only via deep API call. |

---

## 4. Compliance risk per break (regulatory citation)

| # | Regulation | Penalty exposure |
|---|---|---|
| C-1 | Fair Housing 42 USC §3601-3619 + NYSHRL Art. 15 + NYCHRL Title 8 §8-107 | HUD $16K-$65K · NYC CHR up to $250K+ · REBNY $250→$500 + termination |
| C-2, C-3 | TCPA 47 CFR 64.1200(f)(8) "prior express written consent" | $500-$1,500 per message (negligent/willful) |
| C-4 | Fair Housing (same as C-1) on CMA notes free-text | Same |
| S-1 | NY DOS 19 NYCRR §175.25 misrepresentation of listing status | Per-listing fines; DOS license review |
| P-1, P-2, P-3, P-4, P-5 | REBNY UCBA Art. III §1 + §2 (unauthorized listing-info disclosure / promotional restriction) + NY SHIELD Act §899-bb (reasonable safeguards) | Per-row REBNY damages $250→$500 + termination; SHIELD breach-notice obligations |
| P-6 | UCBA Art. I §5(A) (owner opt-out display); REBNY confidentiality | REBNY damages + RLS suspension |
| R-4 | Inferred — agent-client breach of fiduciary duty (failure to deliver promised work product); NY RPL §443 + DOS §175.7 | License review; civil liability per client matter |
| C-5 | NY DOS §175.25 (template-drift risk; brokerage attribution must be reasonable-prominence) | License review |
| C-6 | Fair Housing same as C-1 (search-alert name field is user-controlled and gets surfaced into emails) | Same |
| C-8 | UCBA Art. III §6 (mandatory ethics — 90-day suspension if lapsed) | Auto-suspension required; UCBA penalty |
| C-9 | UCBA Art. III §2(C) (REBNY attribution required in reasonably-prominent location on all RLS-derived displays) | UCBA per-display fines |
| C-10 | Same as C-9 for CMA delivery | Same |
| S-5 | UCBA Art. III §2(C) (CMA delivery — attribution must travel with the data) | Same |
| C-11 | Internal audit/oversight defect; not a direct regulatory citation but undermines broker fiduciary supervision of UCBA Art. III §6 | Indirect |

---

## 5. Minimal PR sequence to fix

(Each PR requires Maya approval per CLAUDE.md §A.7 + §C. All are read-from-`Listing`-table compatible — no PR 5B dependency. No external/sponsor inventory in scope.)

### Lane A — Compliance-Critical (BLOCKER class — must ship before any new send-feature work)

| # | PR | Files touched | Risk |
|---|---|---|---|
| **A-1** | **Fair-Housing scan on `listing-sends.note` body** | `app/api/crm/listing-sends/route.ts:211` add `scanTextForFairHousing(personalNote, "personalNote")` → return 422 on violation. Add runtime test. | LOW (small targeted insert) |
| **A-2** | **TCPA positive-consent check on `listing-sends`** | `app/api/crm/listing-sends/route.ts` add `Lead.consent_captured_at !== null` per recipient before send → return 422 on missing. Also `cron/search-alerts/route.ts:32-41` add filter `consent_captured_at: { not: null }` to the SavedSearch.Lead join. Tests for both. | LOW |
| **A-3** | **Portal cross-client scope fix** — 5 routes | `app/api/portal/seller/fomo/route.ts`, `seller/demand/route.ts`, `marketing/route.ts`, `comparables/route.ts`, `price-history/route.ts` — replace `agent.leads.some.id` and naked `listingId` lookups with `where: { id: listingId, owner_client_id: auth.userId }`. Add per-route source-pin tests asserting 403 for cross-listing access. | MEDIUM (5 files but pattern is identical) |
| **A-4** | **`buyer/saved` sanitizer fix** | `app/api/portal/buyer/saved/route.ts` route results through `sanitizeListingForPortal`; also apply to `open-houses/route.ts`. | LOW |
| **A-5** | **CMA send-to-client workflow** — either ship the email transport OR remove the "sent" status from CMA enum + UI | If shipping: add `POST /api/crm/cma/[id]/send` with email template + audit + REBNY attribution + Fair-Housing scan on `notes`. If removing: PATCH route rejects `status: "sent"` until transport ships. Maya decides. | MEDIUM (depends on path) |

### Lane B — Search Backbone (BLOCKER class for "best-in-class agent search" — but no compliance bleed)

| # | PR | Files touched | Risk |
|---|---|---|---|
| **B-1** | **Fix `crm-idx-mapper.ts:208` `listingType: "Exclusive"` hardcode** | `lib/search/crm-idx-mapper.ts:208` derive `listingType` from `PropertyType` (`ResidentialLease` → `"rent"`, else `"sale"`). Add tests asserting sale ≠ rent. Audit all downstream consumers reading `listing.listingType === "Exclusive"` first (must grep). | MEDIUM (audit blast radius first) |
| **B-2** | **Fix `workspace.js` "Find & Send" silent drop of `q`** | Either (a) extend `MallanAPI.idx.search` to serialize `q`, OR (b) change workspace callsite to use `{ address: q, keyword: q }`. Pick a name (recommend `address` since that matches the public search alias). Test. | LOW |
| **B-3** | **Fix `panels.js:9019` `neighborhoods` plural mismatch** | Decide canonical name (recommend `neighborhood` singular accepting comma-separated), update either the api-client serializer or the panels.js caller. Test. | LOW |
| **B-4** | **Doorman / AssociationAmenities filter** | Either (a) widen the OData whitelist + Trestle string-contains query (Trestle behavior verification required first), OR (b) accept current behavior + add UI label "filter applies to first 200 results". Maya decides. | MEDIUM (Trestle behavior depends on string-contains being supported) |
| **B-5** | **`/api/idx/search` `_compliance` envelope** | Wrap response in same `_compliance` envelope as `/api/listings` (attribution + disclaimer). Source-pin test. | LOW |

### Lane C — Reports / Sends Infrastructure (HIGH — enables agent-search backbone)

| # | PR | Files touched | Risk |
|---|---|---|---|
| **C-1** | **`ListingSend` Prisma model** (master plan PR 8) | Add `model ListingSend` with stable id, `agent_id`, `lead_id`, listing FK (nullable for future T2/T3), `tier`, `caption`, `cover_note`, send timestamps. Migrate existing `ClientListingAction.action='sent'` rows into the new model (backfill script). Add `GET /api/crm/listing-sends` for history. **Schema PR — requires Maya approval per CLAUDE.md §A.7.** | HIGH (schema) |
| **C-2** | **CMA send transport + portal route** | See Lane A-5 above (compliance-critical first). | MEDIUM |
| **C-3** | **`MarketReport` persistence + history** | Add `model MarketReport` (`agent_id`, `lead_id`, `criteria` JSON, `narrative_text`, `prompt_hash`, `created_at`). GET `/api/crm/market-report/[id]`. UI history panel. **Schema PR — requires Maya approval.** | MEDIUM (schema) |

### Lane D — Search UX Unification (architectural — biggest "what is missing")

| # | PR | Files touched | Risk |
|---|---|---|---|
| **D-1** | **Embedded agent-search in `dashboard.html`** OR **Iframe-mount `index-built.html`** | Decision: do we (a) port the legacy search shell into the modern dashboard (~6 weeks effort), or (b) embed `index-built.html` as an iframe inside a dashboard panel (1-2 weeks)? Maya call. | HIGH (largest scope) |
| **D-2** | **Remove decorative `#globalSearch` in `dashboard.html`** | Either wire it to the search engine OR remove it (don't leave dead UI). Quick fix. | LOW |
| **D-3** | **Top-level "Reports" tab** | New tab in dashboard layout linking to CMA list, market-report history, listing-send history (depends on C-1, C-3). | LOW once C-1 + C-3 ship |
| **D-4** | **Per-broker bypass on `/api/crm/saved-searches` GET** | `app/api/crm/saved-searches/route.ts:75` add `if (auth.role !== "BROKER") where.agent_id = auth.userId`. Test. | LOW |

### Lane E — Compliance Hygiene (STRICT — drift prevention)

| # | PR | Files touched | Risk |
|---|---|---|---|
| **E-1** | **Consolidate email-template footer** | Move pitch-packet + hook-email + send-packet bespoke HTML to use `wrapEmail()` from `lib/email/templates.ts`. Eliminates drift risk. | MEDIUM |
| **E-2** | **Public `/api/search-alerts` Fair-Housing scan** | Add `scanTextForFairHousing` to `criteria.neighborhood` + auto-built `name` per `app/api/search-alerts/route.ts:76-78, 176-198`. | LOW |
| **E-3** | **`pitch-packet` GET `checkDistributionGates`** | Add gate check to raw Trestle results at `pitch-packet/route.ts:42-61`. | LOW (residual risk — IDX Plus pre-filters; defense-in-depth) |
| **E-4** | **Per-request ethics-gate middleware** | Move ethics check from `lib/auth/session.ts:108-120` into `requireAgentOrBroker()`. Cache 5-min. (Same fix as prior audit's PR-CRM-5.) | LOW |

### Suggested interleave order

1. **A-1 + A-2 + A-3 + A-4** — all 4 are surgical, BLOCKER-class compliance fixes. Land first.
2. **A-5** OR remove CMA "sent" status — Maya choice.
3. **B-1 + B-2 + B-3 + B-5** — search bugs, low-risk, ship in parallel with A.
4. **D-2 + D-4 + E-2 + E-3 + E-4** — small hygiene; ship anywhere.
5. **B-4** (doorman filter) — needs Trestle behavior verification first.
6. **E-1** (email template consolidation) — medium scope, low risk; ship after B series.
7. **C-1** (`ListingSend` model) — schema PR; requires Maya approval. After approval, ship + backfill from `ClientListingAction.action='sent'`.
8. **C-3** (`MarketReport` model) — same pattern as C-1.
9. **D-3** ("Reports" top-level tab) — depends on C-1 + C-3.
10. **D-1** (search UX unification) — biggest scope; Maya decision (port vs iframe).

---

## 6. What MUST be fixed before StreetEasy / Schedule A inventory

Per the prior architecture audit (PR #173), the T2/T3 tiered inventory is held pending Maya approval AND requires architectural prerequisites. From THIS audit, the following must additionally be true before T2/T3 ships:

| Prerequisite | Why |
|---|---|
| **A-1 + A-2 + A-3 + A-4 all merged** | T2/T3 introduces new send + reveal-gate + share surfaces that inherit the same Fair Housing + TCPA + ownership-scope patterns. Shipping T2/T3 on top of broken T1 patterns would multiply the exposure. |
| **A-5 resolved** (CMA send transport shipped OR enum tightened) | T2/T3 specs assume a working send primitive. CMA's silent "sent" status is the canonical failure mode that must not propagate. |
| **B-1 fixed (`listingType` hardcode)** | T2 (external) + T3 (sponsor) introduce new `listingType` values. The mapper must distinguish "sale" / "rent" before adding "external-sale" / "external-rent" / "sponsor-sale" / "sponsor-rent". |
| **C-1 (`ListingSend` model)** | T2/T3 client-share rows (`external_inventory_client_shares`, `sponsor_listing_client_shares`) inherit from the canonical send primitive per the parked specs. Without `ListingSend`, the shares fall back to `ClientListingAction` and lose the per-tier type field. |
| **Reverse architectural pin** (from prior audit §K #1) | `lib/external-listings/**` + `lib/sponsor/**` must be CI-blocked from importing `lib/search/listing-search-projection.ts`. (This is in the prior audit's §Q.1 test pin — must be added when T2/T3 schema lands.) |
| **Per-request ethics-gate middleware** (E-4) | T2/T3 owner-PII reveal-gate triggers substantive contact. An agent with lapsed ethics training must NOT be able to trigger reveal-gate. |
| **Audit chain for portal reads** | Currently `app/api/portal/listings` writes `AuditEvent` on WRITE only. T2/T3 reveal-gate requires audit on READ for owner-PII access (parked spec §H.6). |

---

## 7. What must wait

- **PR 5B reader swap** (Held — last Class-C item per prior audits)
- **T2 external-inventory implementation** (Held per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`)
- **T3 sponsor inventory implementation** (Held)
- **Phase B-F of post-reconciliation audit** (rate limits, observability, ethics gate, page-size cap) — independent lanes, can run in parallel but not pre-conditioning the search/reports work
- **PR #62** (SMS password reset — 22 days old, awaiting Maya pre-merge migration runbook)
- **`/exclusives` public page** (Held behind Mallan exclusive launch metrics per syndication plan)
- **Geo / PostGIS adoption** (deferred — needs schema + Neon extension)
- **`CommissionConfirmation` generalized model** (Held pending Maya NAR-post-settlement decision)

---

## 8. No implementation started — confirmation

This audit is REPORT-ONLY. Nothing was implemented, patched, migrated, or merged outside this docs-only deliverable.

- ❌ No code patch
- ❌ No schema change
- ❌ No migration
- ❌ No env / Neon / cron config change
- ❌ No workflow / agent / skill / Sentinel change
- ❌ No external-inventory implementation start
- ❌ No sponsor / Schedule A inventory implementation start
- ❌ No PR 5B activity
- ❌ No `/api/listings` reader change
- ❌ No `ListingSearchProjection` migration
- ❌ No admin bypass
- ❌ No force push
- ❌ No `--no-verify`

PR 5B hold verified post-audit: `git ls-remote origin 'refs/heads/refactor/05*' '*listing-search-projection*' '*reader-swap*' '*phase-[b-f]*'` → empty.

---

## Hard holds reaffirmed (one more time, with feeling)

1. PR 5B held
2. No `/api/listings` reader change
3. No `ListingSearchProjection` migration
4. No StreetEasy scrape / external-inventory implementation start
5. No Schedule A / sponsor inventory implementation start
6. No schema / migration change without Maya approval per CLAUDE.md §A.7
7. No env / Neon / cron config change
8. No workflow / `.github/**` change
9. No `.claude/**` (Sentinel / agents / skills / hooks) change
10. No admin bypass · No force push · No `--no-verify`
11. No new work in any lane until Maya approves the proposed PR sequence per §5 above

**DO NOT MERGE — awaiting Maya review.** This is a docs-only PR. Normal merge only when approved.
