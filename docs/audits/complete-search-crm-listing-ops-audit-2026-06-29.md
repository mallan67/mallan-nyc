# Complete Search + CRM + Listing Operations Audit — 2026-06-29

> **Whole-system, READ-ONLY audit.** No code/schema/migration/production change. Method: 14 deep auditors in **isolated git worktrees** read every relevant route/helper/model/UI file **line-by-line** (not grep snippets, not stale docs); several ran live read-only Vercel-log probes. Every finding cites `file:line` and is tagged CONFIRMED / PARTIAL / BROKEN / MISSING / SECURITY RISK / NEEDS LIVE PROBE, separated by user type (public / agent / broker / owner-seller-landlord / buyer-tenant).
>
> **Branch-state caveat:** PR #458 (owner-portal authorization) is **not merged**. Where it matters, findings state **production (`main`) now** vs **after #458**. `NEEDS LIVE PROBE` marks render-layer / live-feed claims that source-reading cannot prove (the 2026-05-20 FARE render gap is the canonical reason).
>
> Coverage: public search · agent/CRM search engine · search projection (PR-5B) · saved searches/alerts · CRM listing management · open-house admin · owner/buyer/tenant portals · full IDOR sweep of 40 portal routes · IDX/Trestle pipeline + 21 crons · compliance engine (gates/DTO/Fair-Housing/validators) · leads/deals/agent-auth/notifications · public UI/design · CRM UI/JS/design · system-health/defects.

---

## 1. Executive verdict (blunt)

| Question | Verdict |
|---|---|
| **Public search good enough today?** | **YES.** Reads the `listings` table + live Trestle (never the projection); distribution gates fail-closed on every public list surface. Sound. (Two caveats: a detail-page status fail-open seam, and FARE render — below.) |
| **Agent search good enough today?** | **PARTIAL.** Active sale/rent discovery is solid + auth-gated. **Agents CANNOT pull closed/sold/off-market comps** (the display gate strips terminal rows post-fetch on both engines → the CRM's Closed/Sold checkboxes are dead UI). Find-and-send free-text is broken. No match-score/per-client search. |
| **Saved search real or partial?** | **REAL.** Full pipeline (consent → store → daily cron search via projection → email → audit). Partial only in: no client-portal management UI, and a CAN-SPAM unsubscribe gap for agent-created searches. |
| **CRM listing management usable today?** | **YES — IF `READONLY_MODE="false"` in prod.** Create/edit/status/media are complete, ownership-safe, audited, compliance-gated. Gated by one env var; **no broker-approval gate on Draft→Active publish**; no team model; several CRM card actions don't persist (data-loss). |
| **Open houses manageable today?** | **STRUCTURALLY YES** (a dedicated CRM panel exists — no listing form needed). **BUT** broker-only/by-appointment OHs leak publicly as "Public"; edit/delete are optimistic fire-and-forget with **data loss**; "repeat" recurrence is dropped; card-path OH save never persists. |
| **Owner portal safe enough after #458?** | **AFTER #458: nearly** — listings/price-history/marketing/comparables/offers/showings all ownership-scoped (incl. workspace-precedence). **Two cross-client IDORs remain (`seller/fomo`, `seller/demand`).** **BEFORE #458 (prod now): NO** — price-history + marketing read any owner's data. |
| **What still blocks showing clients?** | (1) Merge #458 (closes the live prod IDOR). (2) Fix `fomo`/`demand` IDOR. (3) Fix the open-house "Public" leak + OH data-loss. (4) Close the Fair-Housing write-gate gaps. (5) Confirm `READONLY_MODE`/`IDX_ENABLED` envs. (6) Deliver the dead notification email/SMS channel. None are large; all are gated/known. |

**System-wide bottom line:** the **architecture is well-built and fail-closed** — one canonical gate writer + reader, a strict-allowlist DTO layer, real audit trail, real CAN-SPAM suppression, real deals/leads/scoring, MFA + hashed tokens, no privilege-escalation path. Residual risk concentrates in: (a) a handful of portal routes that scope by **agent-relationship instead of ownership**, (b) the **server-side Fair-Housing scanner being materially weaker than the client**, (c) **CRM UI actions that simulate success without persisting**, and (d) **resilience gaps in the IDX sync/media pipeline**. This is *finish-the-edges + harden*, not rebuild. **Type-check 0 · runtime ~2490+ green · UCBA 46/46 · RLS 0 · compliance 0 BLOCKER+STRICT.**

---

## 2. Top findings (P0/P1 — the urgent register)

| # | Sev | Finding | Locus | User type |
|---|---|---|---|---|
| 1 | **HIGH (LIVE prod)** | `price-history` + `marketing` have **no ownership check** on `main` — any seller reads any owner's price notes + marketing. **Closed by unmerged #458.** | `app/api/portal/{price-history,marketing}/route.ts` | owner |
| 2 | **HIGH** | `seller/fomo` + `seller/demand` scope by **agent-relationship** → a seller reads momentum/views/showings/demand for **every listing their agent handles**. Open on all branches. | `seller/fomo:43`, `seller/demand:38` | owner |
| 3 | **HIGH (Fair Housing)** | Server FH scanner **weaker than client** — misses Fair Chance (arrest/conviction), source-of-income (no DSS/Section 8/FHEPS), "adults only", "55+". And FH/content scan is **skipped entirely for `rls_eligible===false`** creates. Federal FHA + NYC HRL apply to ALL ads. | `lib/compliance/rls-enforcement.ts:90-110,215,591`; `crm/listings/route.ts:233` | agent/broker (write) |
| 4 | **HIGH (compliance)** | **Broker-only / by-appointment open houses display publicly as "Public"** (type lives only in `notes`; public renderers hard-code `'Public'`). | `open-houses.js:245`; `api/open-houses/route.ts:486`; `upcoming-open-houses.ts:166,225` | public |
| 5 | **HIGH** | **Projection silent-drift:** `sync.ts` does a non-transactional listing+projection dual-write and **advances the watermark over failed records** → never re-fetched → becomes a public leak after PR-5B. | `lib/idx/sync.ts:365,669` | system |
| 6 | **HIGH (data-loss)** | CRM open-house edit/delete + `cardOHSave` + `cardDistribute` **simulate success without persisting** (or fire-and-forget, no rollback) — incl. mutating the `idxDisplayYN` compliance flag locally. | `open-houses.js:258,344`; `manage-listings.js:664,785` | agent |
| 7 | **HIGH** | **Notification email/SMS channel is dead** — `engine.ts` writes `status:'pending'` rows but **no cron dispatches them**; only `in_app` works. | `lib/notifications/engine.ts:50` | agent/lead |
| 8 | **MED-HIGH (security)** | **Login rate-limit bypass:** `checkRateLimits` returns null if *any* `session_token` cookie present (unvalidated) → brute-force throttle bypassed; no per-account lockout. | `lib/middleware/rate-limiter.ts:191` | public |
| 9 | **HIGH (agent UX)** | Agents **cannot pull closed/sold/off-market comps** — the display gate strips terminal rows post-fetch on both engines; the CRM Closed/Sold checkboxes are dead UI. Find-and-send `q` is dropped (`workspace.js:2219` → `api-client.js` has no `q`). | `gates.ts:307`; `crm-idx-filter.ts:98`; `api-client.js:622` | agent |
| 10 | **HIGH (resilience)** | IDX list-fetch has **no 5xx/429 retry** (mid-pagination error discards all pages); `media-sync` **empty-200 wipes a listing's whole photo set**; `AbortError` → 500 on listing pages. | `fetch.ts:137,593`; `media-sync.ts:1471` | public/system |
| 11 | **MED** | **Impersonation untraceable** — no `impersonated_by`; broker-as-agent mutations attributed to the agent. | `crm/agents/[id]/impersonate:34` | broker |
| 12 | **MED** | **media-backfill cron unscheduled** (the lone `idx:validate` critical) → dead route + dead `backfill/migrate` fns. | `app/api/cron/media-backfill/route.ts`; `vercel.json` | system |
| 13 | **MED** | `idx:validate` + `validate-workflow-completeness` **EXIT 1 but are NOT in PR CI** → two real signals (incl. a deferred UCBA ethics-training workflow) can't block a merge. Validators are mostly **source-grep**, not behavioral. | `.github/workflows/pr-check.yml` | — |

---

## 3. Subsystem findings (status + key items, `file:line`)

### A. Public listing search — **CONFIRMED sound**
- DB-first (`app/api/listings/route.ts:326`) → live-Trestle fallback; detail Trestle-first (`[id]/route.ts:49`); reads `listings`, **not** the projection. Gates fail-closed (`SEARCH_DISPLAY_GATE`, `filterDisplayableDbListings`). Address suppression + agent-PII company-only in the DTO. No `raw_data` blob to public.
- **PARTIAL / SECURITY-seam:** `evaluateDisplayGate` returns `displayable = !terminal || closedWithin24h` (`gates.ts:326`) — a **non-terminal unknown status** (`Hold`/`TemporarilyOffMarket`, absent from `status.ts:156`) renders on the **single-listing detail page** (no positive-whitelist there). List surfaces are protected by explicit whitelists. **Fix:** gate on a positive `isActiveDisplayStatus`.
- **PARTIAL (legal):** FARE Act disclosure renders only when `listingType==='rent'` (`page.tsx:1739/960`) → a mis-mapped rental drops a required disclosure. **NEEDS LIVE PROBE.**

### B. Agent / CRM search engine — **PARTIAL**
- Engine A (live Trestle, `/api/idx/search`, `requireAgentOrBroker`) backs the CRM Search console; Engine B (projection) backs only saved-search execute/alerts (active-only, ~6-facet allow-list, 422s rich criteria).
- **BROKEN:** closed/sold/off-market comps impossible on **both** engines (`gates.ts:307`; `listing-access-decision.ts:50`) → dead status checkboxes. Find-and-send `q` dropped (`workspace.js:2219`).
- **PARTIAL over-exposure (latent, agent-gated):** Engine A mapper emits agent email/phone with **no DTO backstop** (`crm-idx-mapper.ts:227`); fail-open `permissions` object (`:255`); address suppression text-only (lat/lng still emitted, `:235`); DB list routes skip `sanitizeForCRM` (`crm/listings/route.ts:86`). No under-protection (all paths auth-gated).
- `listing-sends` solid (gates recheck + FH scan + audit) but writes the "sent" audit/portal-card **before** email suppression → overstates delivery to unsubscribed leads; no terminal-status block at send.

### C. Search projection / PR-5B — **held, correctly**
- Already a **live reader for agent saved-search + alert cron** (`core.ts:139`). #455 fixed future `is_exclusive` (`isMallanExclusiveListing`); **34 historically-wrong rows uncorrected** (latent — no reader filters on it yet).
- **Blocked by:** W4 writer gap (`import-closed-from-trestle.ts:316` hardcodes `idx_display_yn:true`), the non-transactional dual-write drift (#5), reconcile soak, `is_exclusive` backfill. `searchable_text` has **no GIN/tsvector index** → FTS/vector needs new indexes. **Do NOT swap the reader yet.**

### D. CRM listing management — **CONFIRMED (gated by `READONLY_MODE`)**
- Full lifecycle, ownership-enforced server-side, real audit trail, compliance-gated (RLS/FARE/§2.05/D9/C12). Sold/Rented → BROKER only.
- **MED:** no broker-approval gate on Draft→Active publish (`status/route.ts:111`); no team model; CRM HTML statically served (UI structure only). Public sale/rental forms are **listing-admin editors** (not public intake) — CLAUDE.md §D mislabels them.

### E. Open-house admin — **PARTIAL (capability exists, gaps real)**
- Stored as `Showing type=openhouse`; dedicated CRM panel → `/api/crm/showings` (add/edit/cancel without the listing form — the asked-for capability).
- **BROKEN (compliance):** broker-only/appointment OHs leak as "Public" (#4). **BROKEN (data-loss):** edit/delete optimistic fire-and-forget no rollback (`open-houses.js:258,344`); `cardOHSave` never calls the API (`manage-listings.js:785`). **MISSING:** appointment flag never surfaced; recurrence dropped.

### F. Owner/seller/landlord portal — **SAFE after #458; rich UX**
- After #458: listings/price-history/marketing/comparables/offers/showings all ownership-scoped (workspace-precedence honored, Codex rounds 1-4). Owner DTO shows all owned (incl. terminal/exclusive/opted-out) with a renderable string address.
- **Remaining:** `fomo`/`demand` IDOR (#2). Documents = 501 stub. UX is comprehensive (~1,840-line seller dashboard) but several minor bugs (seller "request listing" 403s, feedback GET stub).

### G. Buyer/tenant portal — **read-isolation SOLID; product surface thin**
- Every route filters server-derived `auth.userId`; Buyer A can't read Buyer B. Family sharing opt-in.
- **MED (gate bypass):** `buyer/saved`, portal `open-houses` GET, `offer-status` return raw address/media **without the DTO** → address-suppression bypass for liked listings.
- **LOW:** open-house RSVP write IDOR (forge audit rows / agent-notification spam, `open-houses/route.ts:96`). **MISSING:** portal saved searches, alerts/inbox UI, documents, profile edit; many built endpoints (favorites/viewed/messages/me) **orphaned (no UI)**.

### H. Security IDOR sweep (40 portal routes) — **FAIL until fomo/demand fixed**
- Confirmed-safe: 36/40 (self-scoped). **HIGH:** fomo/demand (#2). **MED:** showings POST leaks buyer `requester_lead_id` to seller (`showings:256`); agent **email** leaks via external-listing comments (`normalize.ts:189`); the three DTO-bypass reads (#G). Owner/agent/buyer PII otherwise masked; no `raw_data` exposure on any portal route; public gates fail-closed; Fair-Housing search clean; unsubscribe robust; audit trail present.

### I. IDX/Trestle pipeline + 21 crons — **HEALTHY core, resilience gaps**
- Live probe: all 21 crons fire, CRON_SECRET set, 0 unauthorized; idx-sync ~0.7% transient 500 (Neon pooler P1001). Pointed at canonical cold-waterfall. Compliance gates verified correct (6 gates, §2.05 no ping-pong, terminal sets agree across writer/reader/cron). Destructive crons safe (feed-reconcile abort-cap + per-ghost `$transaction`; neon-prune canonical-project fail-closed guard).
- **HIGH:** non-transactional projection dual-write + watermark-over-errors (#5); list-fetch no retry; media-sync empty-200 photo-wipe; AbortError 500 (#10). **MED/SECURITY (latent):** 12 behavioral crons fail-OPEN if `CRON_SECRET` empty (`lead-scoring:11` pattern) — pipeline/destructive crons use the hardened guard. **MED:** prospect-triggers auto-email may lack an unsubscribe link (`prospect-triggers:76`); media-sync tombstone/permanent-park bugs; feed-reconcile 25k skip ceiling. **MISSING:** media-backfill unscheduled (#12).

### J. Compliance engine — **PASS at gates/DTO; FAIL at Fair-Housing write scope**
- Gates fail-mode correct; the 2026-04-30 fail-open class **not** reintroduced (asymmetry intact). DTO tiers correct + allowlist. **Landmines (latent):** `VOW_ENRICHED_FIELDS` re-adds UCBA-Exhibit-A hidden `ExpirationDate`/`CancelledDate` (`dto.ts:130`); legacy `idx-display-gate.ts` dead-but-exported with weaker semantics.
- **FAIL (HIGH):** Fair-Housing write gaps (#3) — H1 non-RLS skip, H2 PublicRemarks-only scope, H3 weak server term set, H4 third-party remarks unscanned. **MED:** FARE enforces disclosure completeness, not the pay-party exclusion; status-transition gate only blocks away-from-Closed; 24h closed-removal only by cron.
- **Validators PARTIAL:** mostly source-grep; `idx:validate` + `workflow-completeness` EXIT 1 but **not in PR CI** (#13).

### K. Leads / deals / agent-auth / notifications — **REAL; a few security gaps**
- Deals real + persisting (state-machine, broker-only approve, ownership). Lead lifecycle complete (TCPA `=== true`, dedup, routing, scoring, conversion). CAN-SPAM genuinely enforced (`sendgrid.ts:130` suppression before send). Portal invite secure (SHA-256, 72h, single-use). Positives: bcrypt 12, MFA hashed+capped, no privilege-escalation, role hard-coded.
- **SEC (MED-HIGH→LOW):** login rate-limit bypass (#8); impersonation untraceable (#11); `verify-email` unthrottled + enumerable; email-verification not enforced; notification mark-read IDOR; reset/invite skip broker MFA.
- **FUNC (MED):** notification email/SMS channel dead (#7); two notification types bypass preference enforcement.

### L. Public UI/design — **prior criticals resolved; new a11y issues**
- Resolved in source: mobile grid blow-out, above-fold mobile CTA, FARE disclosure block, search badges, header keyboard nav, IDX compact disclaimer.
- **New:** `text-/bg-brand-gold` white-on-gold fails WCAG (~2.56:1); `IDXSearchDisclaimer` legal text `text-gray-400` fails contrast; `OpenHousesList.tsx:52` banned set-state-in-effect; `MarketStatsModule` `<dt>/<dd>` without `<dl>`; listing-detail `<h1>` is the neighborhood at 13px (poor semantics/contrast). **NEEDS LIVE PROBE** for render confirmation.

### M. CRM UI / JS — **functional but dead-code-heavy + data-loss bugs**
- **BROKEN:** `manage-listings.js:1010` status-modal onclick over-escaped (table status change dead); Manhattan-Grid Clear `ReferenceError` (`index-built.html:5162`); client-feedback buttons dead; OH edit/delete + `cardOHSave` data-loss (#6); `cardDistribute` mutates `idxDisplayYN` locally without persisting (`manage-listings.js:664`).
- **DEAD/orphaned:** transit-search, manhattan-grid, listing-steps, output/report-package, output/client-feedback, 5 compliance form modules (inlined in forms → **drift** vs source). `escapeHtml` defined twice (build-order wins). `init-disable-dead-controls.js` is a sound explicit dead-UI registry.
- **A11y (HIGH/MED):** clickable rows/cards no keyboard/role (WCAG 2.1.1/4.1.2); autocomplete no keyboard; filter modal no focus-trap; injected compliance modals missing `role=dialog`; icon-only buttons unlabeled; several `innerHTML` unescaped (latent XSS on Trestle text); unguarded `.toLocaleString()` blanks whole views on null; `results-map` silent CDN-failure.

### N. System health / defects — **green build, 1 CI-blocking defect**
- type-check 0 · lint 0 errors/11 warnings · runtime green · UCBA 46/46 · RLS 0 · compliance 0 BLOCKER+STRICT · **idx:validate EXIT 1 (1 critical = media-backfill unscheduled)**.
- **Doc drift:** CLAUDE.md §B claims idx `0 critical` + `93/93` (actual 1 + 91); `public/crm/data/validator-results.json` stale (committed `critical:0` vs actual 1; `$select` 417→373). **Parked/HELD:** `IDX_ENABLED` off, `READONLY_MODE` on, `ARCHIVE_T180` off, portal/documents 501, `/api/pages` POST 501, `/api/unsubscribe` `email_opt_out` disabled pending migration, PR-5B/external-inventory/syndication held (inert). **Inventory:** 284 route files · 23 cron dirs (22 scheduled) · 70 models · 162 test files · 37 fire-and-forget `.catch` (mostly intentional; 2 background-upsert swallows least defensible). No empty `catch{}`, no `@ts-ignore` in prod.

---

## 4. Consolidated registers

**What works (CONFIRMED):** public search + display gates · CRM listing lifecycle + audit + compliance gating · open-house admin API · saved-search/alert pipeline + CAN-SPAM suppression · deals (real, persisting) · lead lifecycle + routing + scoring · MFA/auth/session/portal-invite security · IDX sync compliance core + destructive-cron safety · DTO masking layer · Fair-Housing search filters · owner-portal authz (after #458) · buyer/tenant read isolation.

**Partial:** agent search (no comps; latent over-exposure) · projection as agent reader (subset) · owner documents (501) · client-portal saved searches (none) · FARE (completeness only; render gap) · buyer/tenant UI (orphaned endpoints) · validators (grep-based) · public UI a11y · notification engine (in_app only).

**Broken / unsafe (by severity):** see §2 (#1-#13) plus — detail-page status fail-open seam (MED); `VOW_ENRICHED_FIELDS` hidden-field re-add (LOW latent); CRM dead handlers + a11y gaps (MED); `results-map` silent failure + `toLocaleString` blanking (MED); 5 form-module drift (MED); brand-gold contrast (MED).

**Missing (by severity):** client-portal saved searches (HIGH) · owner document vault (HIGH) · open-house first-class type/appointment/recurrence (MED) · broker publish/approval workflow (MED) · team/co-listing model (MED) · buyer/tenant UI wiring (MED) · notification email/SMS dispatcher (MED) · `is_exclusive` backfill (MED) · full-text/vector search indexes (MED) · seller report digests (LOW-MED).

---

## 5. Next-level platform blueprint

A single **listing-and-relationship OS** over one canonical data + compliance core:
1. **Canonical core:** `listings` (truth) + `listing_search_projection` (eventual public reader after PR-5B) + first-class `OpenHouse`, `Document`, `SellerReport`, `Team`; one DTO/masking layer; one display gate; one audit trail on every interaction.
2. **Agent console:** Trestle + projection search **including comps/off-market**; saved searches per client; a **client-preference graph** (criteria + likes/hides) → **match score** + **"why matched"**; recommend/pin/exclude; one-click send-listings (suppression-aware); inline listing-update + open-house workflow; team permissions; broker approval/publish queue.
3. **Client portal:** saved/viewed/disliked + comments + showing request/cancel; **self-managed saved searches + alerts** (status/price/open-house-change); inbox; documents; profile; preference signals training the graph.
4. **Owner portal:** #458 + **owner report digests** (status, price history, showings + feedback, open houses, offers, marketing, views/inquiries, next actions) + document vault; read-only-by-design.
5. **Notification fabric:** a real email/SMS **dispatcher** for the notification engine; per-event preferences; RFC-8058 unsubscribe; suppression; audit on everything sent (TCPA/CAN-SPAM clean).
6. **Compliance everywhere:** REBNY RLS/IDX gates, **unified server FH scanner ≥ client** across all text fields and all listing types, UCBA advertising, NY DOS §175.25 attribution, audit retention.
7. **AI layer (later):** vector search + LLM "why this listing for this client" + auto-drafted owner reports over the projection + preference graph.

---

## 6. Recommended PR sequence

| PR | Purpose | Likely files | Tests | Gates | Risk | Migration |
|---|---|---|---|---|---|---|
| **#458 MERGE FIRST** | Owner authz: close prod price-history/marketing IDOR + owners see listings | (open) | done (20) | rls/ucba/compliance + 2× security PASS | low | none |
| **P0 — portal isolation** | fomo/demand → `owner_client_id`; drop `requester_lead_id`; DTO on buyer/saved+open-houses+offer-status; strip agent email; scope RSVP write | `portal/seller/{fomo,demand}`, `showings`, `buyer/saved`, `portal/open-houses`, `offer-status`, `external-listings/normalize` | per-route IDOR/PII | REBNY Art III §2; security-agent | low | none |
| **P0b — Fair-Housing write gate** | Run FH scan on ALL create paths incl. `rls_eligible=false`; expand server term set (Fair Chance/source-of-income/adults-only/55+); scan all text fields | `rls-enforcement.ts`, `crm/listings/route.ts`, `prohibited-terms.json` | term-by-term FH | FHA/NYC HRL/Fair Chance | low | none |
| **P0c — auth hardening** | rate-limiter cookie bypass; impersonation `impersonated_by`; verify-email throttle+enum-safe; notification mark-read scoping | `rate-limiter.ts`, `impersonate`, `verify-email`, `notifications` | brute-force/IDOR | — | low | maybe (Session col) |
| **P1 — open-house admin v2** | First-class OH type + appointment + recurrence; fix the "Public" leak + edit/delete/cardOHSave data-loss | schema, `crm/showings`, `open-houses` route/JS, `manage-listings.js` | broker-only-not-public; persistence | UCBA §16 | med | **yes** |
| **P1b — notification dispatcher** | Cron to send pending email/SMS notifications (or remove the dead channel) | new cron, `engine.ts` | dispatch+suppression | TCPA/CAN-SPAM | low | none |
| **P1c — CRM publish/approval + UI fixes** | Broker Draft→Approve→Active gate; fix dead handlers; delete dead modules; a11y; persist cardDistribute or remove | `crm/listings/status`, `public/crm/js/**` | gate + a11y | RLS | med | maybe |
| **P2 — search correctness** | Comps/closed access for agents; detail-page status whitelist; close W4; FARE render + pay-party | `idx/search`, `gates.ts`, `import-closed`, `page.tsx` | comps; status; FARE render | RLS/FARE | med | none |
| **P2b — CI/validators** | Add `idx:validate` + `workflow-completeness` to PR CI; schedule-or-delete media-backfill; refresh validator-results + CLAUDE.md §B | `.github/workflows`, `vercel.json` | n/a | — | low (cron→approval) | none |
| **P3 — client portal** | Portal saved-search CRUD + alerts UI; wire orphaned buyer endpoints | new routes, buyer/tenant pages | isolation+CRUD | data isolation | low-med | none |
| **P4 — owner reporting + documents** | Owner email digests; `Document` model + vault (replace 501) | `Document`, `portal/documents`, report cron | isolation; suppression; audit | Art III §2; TCPA | med | **yes** |
| **P5 — projection/FTS** | After PR-5B preconditions (W4 + drift=0 + is_exclusive backfill): reader swap; GIN/tsvector | projection, indexes, public reader | reader-parity soak | RLS | **high** | **yes** |
| **P6 — AI/vector (later)** | embeddings + match + auto owner reports | new infra | match-quality | FH-safe | high | yes |

---

## 7. Live-probe plan (read-only)

1. **Envs:** `READONLY_MODE`, `IDX_ENABLED`, `CRON_SECRET` (every env), `TRESTLE_API_URL` = `api.cotality.com`.
2. **price-history/marketing IDOR (prod):** SellerA → `GET /api/portal/price-history?listingId=<SellerB id>` → 200 = live vuln.
3. **fomo/demand IDOR:** SellerA (agent X) → `seller/fomo?listingId=<another agent-X client>` → 200.
4. **Open-house leak:** `POST /api/crm/showings {notes:{types:['Broker Only']}}` → `/api/open-houses` shows `'Public'`.
5. **Address-suppression bypass:** flip a liked listing `internet_address_display_yn=false` → `buyer/saved` still shows street.
6. **FARE render:** `GET /listing/<active-rental>` → FARE paragraph present.
7. **Projection drift:** Neon — `reconcile…drift` query = 0; `count(*) … WHERE is_exclusive` = 7 (not 41); `count(*) listings JOIN projection WHERE idx_display_yn <> p.idx_display_yn`.
8. **Comps:** `GET /api/idx/search?status=Closed,Sold` (agent) → expect `[]` (gate-blocked).
9. **Notification dead channel:** Neon `SELECT channel,status,count(*) FROM notifications GROUP BY 1,2` → email/sms stuck `pending`.
10. **Login throttle bypass:** `curl -H 'Cookie: session_token=junk' -X POST /api/auth/login` ×20 → no 429.
11. **Media host ratio / Trestle `$metadata`** (R2 vs proxy; Media field-truth — phantom field freezes media-sync).

---

## 8. Final recommendation

- **Merge first:** **PR #458** — closes a live production IDOR, fully tested, twice security-PASS. Highest value / lowest risk.
- **Build next (in order):** **P0 portal isolation** → **P0b Fair-Housing write gate** → **P0c auth hardening** → **P1 open-house v2 + notification dispatcher + CRM UI fixes**. These are the security/compliance/data-loss backbone and are all small-to-medium, disjoint files.
- **Do NOT touch / keep gated:** PR-5B reader swap (drift unresolved), `is_exclusive` backfill, Gate 6 drain execution, `VACUUM FULL`/reclaim/downgrade, any production data write, Vercel/env/cron changes. Never delete active-listing R2 media or the enumerated `raw_data` fields public display needs.
- **Safe to parallelize:** the audit/CRM/search work runs independently of the Gate 6 drain (no shared code). P0/P0b/P0c/P1 touch disjoint files. Owner-reporting (P4) and client-portal (P3) are independent product tracks.
- **Operational urgency:** until #458 merges, **`/api/portal/price-history` + `/api/portal/marketing` are live cross-client IDORs in production**; and a **`READONLY_MODE` that isn't `"false"` silently 403s all CRM writes** (agents can't list/edit). Confirm both first.

> **One urgent compliance line:** the server-side Fair-Housing scanner currently lets NYC Fair-Chance / source-of-income / "adults only" / "55+" language **through the write gate**, and skips Fair-Housing scanning entirely for non-RLS (commercial/website-only) listings. Treat P0b as legal-exposure priority alongside the IDORs.

---

*14 read-only auditors, isolated worktrees; no repo files modified by any auditor (the only side effect was `idx:validate` regenerating `validator-results.json` in a throwaway worktree). This document is the sole deliverable.*
