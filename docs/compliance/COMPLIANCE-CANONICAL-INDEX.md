# Compliance Canonical Index — mallan.nyc

> **Read this FIRST** when a task touches public listings, IDX, RLS, Trestle/Cotality, syndication, CRM lead routing, seller/landlord intake, advertising, listing display, broker attribution, audit-event creation, lead consent capture, or retention windows.
>
> **Authority order.** Per-area rows below are the authoritative pointers. The canonical files cited are the source of truth. The skill at `.claude/skills/rebny-compliance/SKILL.md` is the leaner mirror that auto-loads at session start; when the two disagree, the canonical file wins.

| | |
|---|---|
| **Index created** | 2026-05-20 |
| **Supersedes** | The compliance content previously living inline in `CLAUDE.md`. |
| **Maintenance contract** | Every time a rule changes (REBNY publishes new UCBA revision, NY DOS updates §175, NYC LL changes FARE Act, etc.), the canonical file for that area gets updated and this index's "last verified" date is bumped in the row. New compliance areas get a new row, not a free-text paragraph. |
| **Fail-closed default** | If a row says "stop and report" and you cannot find the canonical file or it is silent on the question you have, **STOP**. Do not guess REBNY/RLS/IDX Plus/Trestle/Cotality requirements from memory. The 2026-04-30 incident (7,594-row corruption from guessed `affirmPermission` semantics on REBNY-pre-filtered nulls) is in `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` as the canonical example. |
| **Authority for compliance baseline** | `npm run compliance-check` must report 93/93 BLOCKER+STRICT; `npm run ucba:audit` must report 46 PASS / 0 FAIL / **0 REGRESSIONS** (any non-zero regression is a hard stop); `npm run idx:validate` must report 0 critical. |

---

## How to read each row

- **Canonical file** — the source-of-truth code or document. The text of the rule lives here.
- **Backup / reference** — secondary file(s) that mirror, summarize, or contextualize the rule. Useful for context but NOT authoritative.
- **Validator / test** — automated check that catches regressions. Run before commit.
- **When Claude must read it** — the trigger that requires loading the canonical file before making a change.
- **Fail-closed instruction** — what to do if the canonical file is missing, silent, or you have any uncertainty.

---

## 0. Field authority order (which source wins for field / display truth)

When sources disagree about whether a field exists, what it is named, or whether it may be displayed, resolve in this order:

1. **UCBA 2026 governs compliance.** REBNY co-brokerage rules set the outer bound for what may be collected, displayed, and syndicated.
2. **IDX Plus / the live Cotality feed / the refreshed CSVs define displayable field truth.** The live `api.cotality.com/trestle` feed and the CSVs regenerated from it (`data/rebny-rls-property-fields.csv`, `data/rebny-rls-property-lookup.csv`) are the field-name / field-existence authority. Static markdown field snapshots are not.
3. **REBNY / RLS compliance rules override generic vendor or default assumptions** where they apply (e.g., display-gate null-handling is REBNY-specific, not a generic vendor default).
4. **Cotality/Trestle exposes the live RESO-shaped OData model;** use the live `$metadata` (snapshot at `artifacts/metadata.xml`) to fill field / model gaps. RESO is the shape of the model — not an external authority, version, or certification.
5. **Internal-only fields must not affect public display or compliance** — they are excluded from the display / syndication path.
6. **Unknown or unverified display eligibility fails closed to non-display.** If you cannot prove a field is displayable, do not display it.

---

## 1. REBNY UCBA 2026 (Universal Co-Brokerage Agreement)

| | |
|---|---|
| **Canonical** | `data/UCBA-2026-Requirements.md` (extracted from the 56-page UCBA 2026 PDF) |
| **Backup** | `.claude/skills/rebny-compliance/SKILL.md` §3; `compliance/rules/ucba-audit-checklist.json` (machine-readable checklist of all 145 rules) |
| **Validator** | `npm run ucba:audit` (runs `scripts/ucba-compliance-audit.js`) — current baseline: 46 PASS / 0 FAIL / 0 REGRESSIONS |
| **When to read** | Any work touching listings, listing-agent / agent state, commission calculation, protected-period, expiration, status transitions, broker-approval gates, leads, deals |
| **Fail-closed** | If a UCBA rule is unclear, STOP. Penalty schedule is $500 / $2K / $10K / 30-day RLS suspension; one quarterly >5% rejection rate = $10,000 fine; 3 quarterly fines in a year = 30-day suspension. |

## 2. REBNY RLS (Listing Service rules + Distribution Gates)

| | |
|---|---|
| **Canonical** | `.claude/skills/rebny-compliance/SKILL.md` §2 (the 6 distribution gates); `lib/idx/trestle-mapper.ts` (the writer-side implementation — `TERMINAL_STATUSES`, `normalizeStandardStatus`, `computeGateColumns` post-PR-#165) |
| **Backup** | `data/UCBA-2026-Requirements.md`; `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` (the canonical incident report). ⚠ `data/RLS-FIELD-REGISTRY.md` is **HISTORICAL (2026-03-20), NOT field authority** — live Cotality only |
| **Validator** | `npm run rls:validate` (10-section validator: fields, renames, gates, masking, coverage); `npm run compliance-check` |
| **When to read** | Any IDX / listing-display / feed / projection / search-result change |
| **Fail-closed** | The 6 gates (Owner Opt-Out, Participant Only, Internet Entire Display, Address Display, Terminal Status §2.05, Coming Soon badge) are non-negotiable. If a field is null and you don't know whether it's REBNY-pre-filtered or per-row opt-out, STOP — wrong assumption corrupted 7,594 rows in 2026-04-30. |

## 3. IDX Plus (REBNY-released field subset, ~902 fields)

| | |
|---|---|
| **Canonical** | `data/rebny-rls-property-fields.csv` (all 902 fields across 7 REBNY-specified resources: Property 527, CustomProperty 106, Member 72, Office 66, Media 46, PropertyUnitTypes 46, OpenHouse 39) |
| **Backup** | `data/rebny-rls-property-lookup.csv` (2,066 picklist values — **snapshot**, prove regeneration date); `.claude/skills/rebny-compliance/SKILL.md` §2; `artifacts/metadata.xml` (**captured snapshot; over-declares the licence** — refresh and diff, never read as truth). ⚠ `data/RLS-FIELD-REGISTRY.md` is **HISTORICAL, NOT field authority** |
| **Validator** | `npm run idx:validate` (32-section validator) — current baseline 1278 pass / 0 critical |
| **When to read** | Any Trestle OData $select, $expand, or $filter change; any new field on Listing model or projection; mapper change |
| **Fail-closed** | IDX Plus does NOT include `IDXEntireListingDisplayYN`, `ParticipantOnlyYN`, `VOW*` gate fields, `SyndicateYN`, `FirstShowingDate`, `MoveInCostsAmountTotal`, `PossessionDate`, `YearRenovated`. If you see those in code, they are phantom fields — verify against the CSV before referencing. **`Latitude`/`Longitude` are NOT phantom** — they exist in Trestle `$metadata` but are **always null on IDX Plus**, so they are not usable for map/transit filtering (do not build Lat/Lng filters; geocoordinates come from the separate geocode backfill). |

## 4. Trestle / Cotality Web API (the runtime feed serving REBNY IDX Plus)

| | |
|---|---|
| **Canonical** | `lib/idx/auth.ts` (OAuth2 client_credentials, token cache, 8s timeout); `lib/idx/fetch.ts` (OData fetch + pagination + AbortController + retry); `lib/idx/trestle-mapper.ts` (the mapper); `.claude/skills/rebny-compliance/SKILL.md` Trestle Media API Rules §4 |
| **Backup** | `artifacts/metadata.xml` (**captured snapshot, not live**); `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` (three-layer model: REBNY policy / Cotality serving / RESO certification). ⚠ `data/RLS-FIELD-REGISTRY.md` is **HISTORICAL, NOT field authority** |
| **Validator** | `tests/runtime/idx-suggest-select-fields.test.ts`, `tests/runtime/idx-fetch-expand-media.test.ts`, `tests/runtime/idx-sync-max-records.test.ts`, `tests/runtime/idx-sync-cursor-modification-timestamp.test.ts`, `tests/runtime/idx-sync-diagnostic-audit-events.test.ts`, `lib/idx/__tests__/*` |
| **When to read** | New OData query, new endpoint, new $expand, new $select field, new Media query, new $filter; auth/token changes; rate-limit/throttle work |
| **Fail-closed** | API base = `https://api.cotality.com/trestle`. Old hosts `api-trestle.corelogic.com` + `api-prod.corelogic.com` deprecated hard 2026-03-31 (media proxy allowlists all 3 during transition). Media `Media/All` endpoint deprecated — query `/odata/Media` with `$filter=ResourceRecordKey eq '...'` (see §8 below). HTTP 400 on `InternetEntireListingDisplayYN` / `InternetAddressDisplayYN` `$filter` is the canonical signal of REBNY provider-level pre-filter. |

## 5. Listing status / terminal statuses (§2.05 cleanup)

| | |
|---|---|
| **Canonical** | `lib/idx/trestle-mapper.ts` — `TERMINAL_STATUSES` (set, ~line 610), `normalizeStandardStatus()` (~line 687), and `computeGateColumns()` (~line 846), which is the single source of truth for the gate columns. All three are on `main`. |
| **Backup** | `app/api/cron/data-retention/route.ts:79` (cron predicate — must agree with mapper terminal set); `docs/idx/post-reconciliation-tightening-audit-2026-05-20.md` §2 |
| **Validator** | `lib/idx/__tests__/compute-gate-columns.test.ts`; `lib/compliance/__tests__/c2-terminal-idx-display.test.ts`; `tests/runtime/h1-dual-write-tier1.test.ts`; `tests/runtime/projection-dual-write-tier2.test.ts`; `tests/runtime/listing-writer-projection-coverage.test.ts`. |
| **When to read** | Any code path that writes `listings.status` or `listing_search_projection.status` or `idx_display_yn`; any new cron that mutates listing rows |
| **Fail-closed** | Always normalize the input status BEFORE applying TERMINAL_STATUSES.has(). Always update the projection in the same logical operation (or via `dualWriteProjectionForListingId`). Never bump `modification_timestamp` on a terminal row without flipping idx_display_yn to false (that's the H1 ping-pong incident shape). |

## 6. Owner opt-out (REBNY Gate 1)

| | |
|---|---|
| **Canonical** | `lib/compliance/gates.ts:isOwnerOptOut` |
| **Backup** | `.claude/skills/rebny-compliance/SKILL.md` §2; `lib/idx/trestle-mapper.ts` (mapper-side derivation from `Permission` enum + legacy `MlsStatus="OwnerOptOut"`) |
| **Validator** | `lib/compliance/__tests__/compliance-gates.test.ts` (writer-side coercion tests) |
| **When to read** | New Trestle gate field; any DTO sanitizer touching listing data |
| **Fail-closed** | UCBA Art. I §5(A): signed Owner Opt-Out form within 48hrs of listing. NO public dissemination at any time. Use `affirmPermission()` semantics for the `owner_opt_out` cached boolean. |

## 7. Internet display fields (5 boolean columns)

| | |
|---|---|
| **Canonical** | `lib/idx/trestle-mapper.ts` — the centralized `computeGateColumns()` helper (~line 846) is the single source of truth for `idx_display_yn`, `internet_entire_listing_display_yn`, `internet_address_display_yn`, `internet_automated_valuation_display_yn`, `internet_consumer_comment_yn` (on `main`). Semantics: `internetEntireListing = raw.InternetEntireListingDisplayYN !== false`, `affirmPermission(...)` on AVM/ConsumerComment, `!TERMINAL_STATUSES.has(...)` guard. |
| **Backup** | `lib/compliance/gates.ts` (`coerceStrictBool`, `affirmPermission`, `evaluateDisplayGate` — reader-side helpers); `.claude/skills/rebny-compliance/SKILL.md` §2.1 (fail-OPEN vs fail-CLOSED semantics) |
| **Validator** | `lib/idx/__tests__/compute-gate-columns.test.ts`; `lib/compliance/__tests__/compliance-gates.test.ts`; `scripts/ci-compliance-check.js` regression guards (lines 471-507). |
| **When to read** | Any code path that writes any of the 5 columns; any new reader path that consumes them |
| **Fail-closed** | `InternetEntireListingDisplayYN` + `InternetAddressDisplayYN` are REBNY-pre-filtered (null = displayable). `InternetAutomatedValuationDisplayYN` + `InternetConsumerCommentYN` are per-row opt-out (fail-closed). The asymmetry is documented at `lib/idx/trestle-mapper.ts:780-832` and locked by tests. Wrapping the first two in `affirmPermission()` collapses every REBNY-feed row to false — that was the 2026-04-30 incident shape. |

## 8. Media / photo / floorplan / video (Trestle Media API rules)

| | |
|---|---|
| **Canonical** | `.claude/skills/rebny-compliance/SKILL.md` Trestle Media API Rules (vendor-confirmed 2026-04-07); `lib/idx/sync.ts` (batch media sections); `lib/idx/fetch.ts:fetchListingMedia` |
| **Backup** | `lib/idx/card-fields.ts` (PhotosChangeTimestamp in $select); `app/api/media/batch/route.ts`; `app/api/media/proxy/route.ts`; `scripts/import-closed-from-trestle.ts` |
| **Validator** | `tests/runtime/idx-fetch-expand-media.test.ts`; `tests/runtime/listing-media-table-read.test.ts` |
| **When to read** | Any Media OData query; any new fetch-listing-media call; R2 cache / proxy / fallback work; new media-related API route |
| **Fail-closed** | **ALWAYS use `ResourceRecordKey` (or `ResourceRecordKeyNumeric`), NEVER `ResourceRecordID`** — the latter MAY DUPLICATE across MLOs and serve wrong photos. `Media/All` endpoint is DEPRECATED — query `/odata/Media` with `$filter=ResourceRecordKey eq '...'`. Property→Media mapping: `Property.ListingKey = Media.ResourceRecordKey` (DB column `mls_id` stores `ListingKey`). Two-tier timestamp sync: `Property.PhotosChangeTimestamp` (high-level trigger) → `Media.ModificationTimestamp` (per-row). |

## 9. Broker attribution (NY DOS §175.25 + REBNY RLS courtesy)

| | |
|---|---|
| **Canonical** | `app/components/Footer.tsx:25-29,104,215` (license + brokerage + phone + address — every public page); `app/components/IDXDisclaimer.tsx`; `app/layout.tsx` JSON-LD identifier `10991205323`; `lib/compliance/dto.ts` (`sanitizeForPublic` strips listing-agent PII) |
| **Backup** | `.claude/skills/rebny-compliance/SKILL.md` §6 (NY DOS); `data/UCBA-2026-Requirements.md` (REBNY courtesy rules); `app/listing/[...slug]/page.tsx` (per-listing "Listing Courtesy of Mallan Real Estate Inc." block) |
| **Validator** | `npm run compliance-check` (NY DOS section); `npm run rls:validate` |
| **When to read** | Any new public surface that displays a listing, agent, or brokerage name; any new email/SMS template; any new lead-capture form |
| **Fail-closed** | Brokerage name + office address OR phone + license type (Salesperson/Broker) on every advertisement. NY DOS §175.25. Agent name NEVER appears without brokerage name. REBNY courtesy line on every IDX-displayed listing. Buyer/tenant portals MUST mask listing-agent PII (company only). |

## 10. Fair Housing (Federal + NY State + NYC + NYC Fair Chance Housing Act)

| | |
|---|---|
| **Canonical** | `lib/compliance/rls-enforcement.ts:90-143` (`FAIR_HOUSING_HARD_BLOCKS` — 13 hardcoded regex patterns blocking write); `public/crm/js/compliance/fair-housing.js` (client-side scanner, 46+ patterns) |
| **Backup** | `.claude/skills/rebny-compliance/SKILL.md` §4 (20+ protected classes, full statute references); `app/fair-housing/page.tsx` (public statute references for Federal + NYS + NYC + source-of-income) |
| **Validator** | `npm run compliance-check` (Fair Housing section); `scripts/ci-compliance-check.js` regression guards |
| **When to read** | Any new free-text agent input surface; any new public copy (listing description, blog post, landing page, email template); any new search filter |
| **Fail-closed** | NO filtering by protected class. Geographic neighborhood filters OK. School-district filters OK only if pure geography. Income-based filters NOT permitted in public search. Criminal-history filters NEVER permitted (NYC Fair Chance Housing Act, LL 24/2023). Penalties: HUD $16K–$65K; NYC CHR up to $250K+; REBNY $250 first / $500 second + RLS termination. |

## 11. NY DOS Advertising Law (19 NYCRR Part 175)

| | |
|---|---|
| **Canonical** | `.claude/skills/rebny-compliance/SKILL.md` §6 (full §175.25 + §175.28 + §175.12); `app/components/Footer.tsx`; `app/components/AntiDiscriminationNotice.tsx`; lead-capture endpoints |
| **Backup** | `data/UCBA-2026-Requirements.md`; `app/contact/page.tsx`, `app/components/InquiryForm.tsx`, etc. (per-form notice placement) |
| **Validator** | `npm run compliance-check` (NY DOS sections — anti-discrimination notice, brokerage attribution, license display, misleading-claims scanner) |
| **When to read** | Any new advertising surface (public-facing text mentioning agent/brokerage/listing); any new lead-capture form; any new email template |
| **Fail-closed** | §175.25: brokerage name + license type + office address/phone on every ad. §175.28: anti-discrimination notice at first substantive contact (every public lead-capture form). §175.12: disclosure of personal interest BEFORE any offer. No misleading/false/deceptive claims. |

## 12. FARE Act (NYC LL 119/2024, effective 2025-06-11)

| | |
|---|---|
| **Canonical** | `app/listing/[...slug]/page.tsx` (rental FARE disclosure block); `lib/idx/trestle-mapper.ts` fields. Canonical FARE public-display fields are the **live Property** fields `MoveInCosts`, `MoveInCostsAmount`, `MoveInCostsComments`, `OngoingFees`, `TenantPays`, `TenantPaysDescription`; `AdditionalFee*` / `FeeFrequency` are **legacy CustomProperty fallback**. |
| **Backup** | `.claude/skills/rebny-compliance/SKILL.md` §5; `data/UCBA-2026-Requirements.md`; `data/RLS-Syndication-Research.md` (Standard Active / Non-Syndicated rental category) |
| **Validator** | `npm run compliance-check` (FARE Act section grep). **GAP NOTE 2026-05-20:** the source-grep validator passes, but the live-page rendering on production rentals was verified MISSING in `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` A4 — a rendering-conditional bug, not a missing file. New PR required. |
| **When to read** | Any rental listing display path; any new rental-fee CRM form; any rental syndication work |
| **Fail-closed** | Tenant cannot be required to pay broker fee unless tenant specifically engaged the broker. If landlord does NOT pay → `InternetEntireListingDisplayYN = False` → excluded from IDX/VOW/syndication. DCWP penalties: §20-699.21 $1,000–$1,800; §20-699.22 up to $2,000 per violation. Litigation status: REBNY 2nd Circuit appeal pending (filed July 2025); law in force and enforceable. |

## 13. TCPA / CTIA (consent capture for SMS + telemarketing)

| | |
|---|---|
| **Canonical** | `lib/inquiries/create.ts`; every public lead-capture endpoint records `consent_captured_at`: `app/api/contact/route.ts`, `app/api/inquiries/route.ts`, `app/api/sign-up/route.ts`, `app/api/open-houses/rsvp/route.ts`, `app/api/cma/route.ts`, `app/api/guides/download/route.ts`, `app/api/identity/capture/route.ts`, `app/api/search-alerts/route.ts` |
| **Backup** | `app/api/crm/email/route.ts:66-68` (actively blocks send without consent); `app/api/crm/sales/prospects/[id]/outreach/route.ts:128` (422 without consent) |
| **Validator** | `tests/runtime/contact-form-consent.test.ts` (23 tests covering intent + consent + honeypot) |
| **When to read** | Any new public lead-capture endpoint; any new SMS provider integration (Twilio); any new email-marketing send path |
| **Fail-closed** | Affirmative consent required (47 CFR 64.1200(f)(8)). No autoresponders without prior express consent. Honeypot field on every form. `consent_captured_at` must be in the same upsert as the Lead row. SMS-ready when Twilio env vars added (no autosend until consent verified). |

## 14. NY SHIELD Act / privacy / data security

| | |
|---|---|
| **Canonical** | The data-retention schedule in the **Fail-closed** row below; `.claude/skills/rebny-compliance/SKILL.md` §1; `app/api/cron/data-retention/route.ts` (enforcement) |
| **Backup** | `.claude/skills/rebny-compliance/SKILL.md` §1; `prisma/schema.prisma` (model timestamps that gate retention) |
| **Validator** | `npm run ops:health:json` (verifies `latest_data_retention_run` is fresh + `archive_backlog=0` + `listings_missing_status_changed=0`) |
| **When to read** | Any new PII column; any new lead/portal storage; any new audit-event action; any new export endpoint; any third-party integration handling user data |
| **Fail-closed** | NY SHIELD §899-bb. Encrypted-at-rest (Neon TDE). Retention schedule: Listing data + agreements 6 years; transaction records + commissions 6 years; audit event logs 2 years (see §15 for the ONE narrow operational-diagnostic exception); Trestle/IDX access logs 12 months; lead PII inactive 3 years then archive; session tokens 24 hours auto-expire; closed listing display removed within 24 hours (REBNY §2.05). |

## 15. Audit log retention + AuditEvent contract

| | |
|---|---|
| **Canonical** | `prisma/schema.prisma` `AuditEvent` model (`action`, `entity_type`, `entity_id`, `user_type`, `user_id`, `changes` JSONB, `created_at`); `app/api/cron/data-retention/route.ts` (2-year purge) + **`docs/compliance/OPERATIONAL-DIAGNOSTIC-RETENTION.md` (the 30-day operational-diagnostic exception — see the Fail-closed row)** |
| **Backup** | `lib/auth/middleware.ts:182` (`export async function logAuditEvent(...)` — the canonical write helper; only location in the repo); pattern enforced in every CRM mutation, status PATCH, listing-create, deal-create, commission-update, projection-reconcile |
| **Validator** | `npm run ops:health:json` (`latest_data_retention_run.audit_events_purged_over_2yr` should be 0 unless a backlog exists; sync errors stay 0). The operational-diagnostic exception reports separately as `audit_events_diagnostics_purged` / `_bytes` / `_stopped` — a non-zero value there is EXPECTED and is NOT a 2-year-window breach. |
| **When to read** | Any new mutation that needs an audit trail (broker decisions, payment approvals, status changes, lead conversions, sends, document uploads, manual cron triggers, ANY admin override) |
| **Fail-closed** | REBNY RLS access logs MUST be retained 12 months. NY DOS transaction records MUST be retained 6 years. Both wider than the AuditEvent 2-year window — for transaction-relevant rows, use a separate Prisma model with extended retention (CommissionPayment, Deal, ProtectedPeriod, ListingMedia) rather than relying on AuditEvent alone.<br><br>**OPERATIONAL-DIAGNOSTIC EXCEPTION (Maya, 2026-08-02 — the ONLY carve-out from the 2-year window).** Exactly TWO actions may be deleted after **30 days**:<br>&nbsp;&nbsp;• `idx_sync_listing_upsert_failure`<br>&nbsp;&nbsp;• `idx_sync_syncstate_failure`<br>Both are **write-only sync diagnostics**: the sole writer is `lib/idx/sync.ts` and no production code reads them back, so they are **not audit evidence** and are not held to the REBNY RLS 2-year floor. The allowlist is `SYNC_DIAGNOSTIC_DEDUPE_ACTIONS` (`lib/idx/diagnostic-recorder.ts`), re-exported as `SYSTEM_DIAGNOSTIC_RETENTION_ACTIONS`; **any action not in that list stays on the 2-year window.** Gated by `DIAGNOSTIC_RETENTION_ENABLED`, bounded to 2,000 rows/transaction and canary-capped (unset `RETENTION_DIAGNOSTIC_MAX_ROWS` ⇒ 100 rows/run). Widening the allowlist requires amending THIS row first. Full policy: `docs/compliance/OPERATIONAL-DIAGNOSTIC-RETENTION.md`. |

## 16. CRM / lead routing compliance

| | |
|---|---|
| **Canonical** | `app/api/contact/route.ts`, `app/api/inquiries/route.ts`, `app/api/sign-up/route.ts`, `app/api/open-houses/rsvp/route.ts`, `app/api/cma/route.ts`, `app/api/guides/download/route.ts`, `app/api/identity/capture/route.ts`, `app/api/search-alerts/route.ts` (8 lead-capture endpoints); `prisma/schema.prisma` Lead + Inquiry models |
| **Backup** | `docs/backend-crm-current-gap-audit-2026-05-18.md` (current gap inventory + 10 Class-A items); `lib/notifications/engine.ts` (per-agent notification — partial wiring) |
| **Validator** | `tests/runtime/contact-form-consent.test.ts`; `tests/runtime/agent-inquiry.test.ts`; `tests/runtime/inquiry-effect.test.ts` |
| **When to read** | Any new lead form; any new agent-assignment routing change; any new email/SMS send path; any new portal access; any new role/permission gate |
| **Fail-closed** | Every public lead-capture POST: `consent_captured_at` recorded; honeypot in place; rate-limited; AuditEvent written; Lead row upserted by email with role-merge (don't erase prior roles). Per-listing inquiry SHOULD notify the listing's owning agent (gap B2 in `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md`). |

## 17. Seller / landlord intake compliance

| | |
|---|---|
| **Canonical** | `public/crm/SALE-FORM-REDESIGN.html` + `public/crm/RENTAL-FORM-REDESIGN.html` (CRM internal — actual RLS submission is via RealPlus/LMP, not mallan.nyc); `lib/compliance/rls-enforcement.ts:assertRlsCompliantPayload` (write-time fail-closed gate) |
| **Backup** | `lib/compliance/rebny-validator.ts` (10-section validator); `data/rebny-rls-property-fields.csv` (902 IDX Plus fields); `data/rebny-rls-property-lookup.csv` (2,066 picklist values) |
| **Validator** | `npm run rls:validate`; `npm run crm:test` (172/172 smoke); CRM POST returns HTTP 422 on `!passed` (see `app/api/crm/listings/route.ts:191-207`) |
| **When to read** | Any field added/removed/renamed on the sale or rental form; any picklist value change; any new mandatory-field rule; any new content-restriction scanner pattern |
| **Fail-closed** | All 6 distribution gates evaluated at CRM-write time. Fair Housing scanner runs on all free-text fields. Sale form has 18 commercial sub-types + 5 ownership types with "mallan.nyc only" warning banner for commercial. Rental form must include all FARE Act fee fields. Currently 1 warning: rental form missing `ComingSoon` enum value in `MlsStatus` picklist (`docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` C1). |

## 18. Mallan exclusives / syndication eligibility

| | |
|---|---|
| **Canonical** | `lib/syndication/eligibility.ts` (`evaluateMallanSyndicationEligibility` — pure function, fail-closed); `lib/syndication/mallan-identity.ts` (`MALLAN_OFFICE_MLS_IDS`, `MALLAN_BROKERAGE_LICENSE`, `loadMallanAgentMlsIds()`); `docs/architecture/MALLAN-EXCLUSIVES-SYNDICATION-PLAN-2026-05-18.md` (8 invariants I.1–I.8) |
| **Backup** | `scripts/audit-mallan-listing-side-ids.ts` (read-only / dry-run only); `app/api/crm/syndication/refresh/route.ts` (broker-only audit-log stub; no real export) |
| **Validator** | `tests/runtime/syndication-eligibility.test.ts` (40 tests); `tests/runtime/syndication-no-idx-imports.test.ts` (source-regex pin — `lib/syndication/**` cannot import `lib/idx/**`, `lib/search/**`, `app/api/listings`, `app/api/idx/**`, or reference `ListingSearchProjection`) |
| **When to read** | Any new syndication path; any new partner integration; any change to `MALLAN_OFFICE_MLS_IDS` or agent identity loading; any new eligibility gate; any change to the 8 invariants |
| **Fail-closed** | Layer 1.PRE empty-config-guard runs FIRST. When `MALLAN_OFFICE_MLS_IDS=[]` AND `agentMlsIds=[]`, EVERY row blocked unconditionally with reason `identity_config_empty_blocks_all_rows`. Manual-control verification flag (I.6) CANNOT bypass empty-config guard (locked by case #17 in test file + PR #163). No `/api/exports/*` route may exist without explicit Maya approval + a fresh canonical-files audit. |

---

## Maintenance protocol

1. **Add a new compliance area** — append a numbered row to this file; do NOT inline the rule text in CLAUDE.md. The row MUST have all 5 cells filled (canonical, backup, validator, when, fail-closed).
2. **Update an existing area** — edit the row's canonical file (or the row itself if file paths change). Bump the "last verified" date in the row's last cell if you're changing the rule rather than the file location.
3. **Deprecate a rule** — DO NOT delete the row. Move the area to a §deprecated section at the bottom with the deprecation date and a pointer to the replacement.
4. **Conflict between two rows** — STOP and report. Compliance rules cannot silently conflict — surface to Maya for resolution before any code change.

## Cross-references

- `CLAUDE.md` — lean command center (this index is its §H pointer for compliance)
- `.claude/skills/rebny-compliance/SKILL.md` — the auto-loaded skill mirror
- `NEON.md` — DB-side rules (separate index)
- `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` — file/folder canonical-source rules (separate index)
- `docs/audits/exclusive-launch-readiness-audit-2026-05-20.md` — most recent comprehensive audit (includes A4 FARE rendering gap)
- `docs/idx/post-reconciliation-tightening-audit-2026-05-20.md` — most recent IDX-side audit
- `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` — canonical incident report (the 2026-04-30 7,594-row corruption)
- `memory/REFACTOR-2026-04-25.md` — 10-PR master plan
