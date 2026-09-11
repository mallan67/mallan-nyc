I have everything I need. Here is the report.

---

# VALIDATOR AUDIT — UCBA checklist + display-compliance suite
**Repo:** `C:/Users/MayaAllan/Desktop/mallan-nyc` · read-only · 2026-09-09
**Contract read:** `data/cotality-property-fields.live.json` (pulled 2026-09-05, 757 Property fields) · `data/cotality-enums.live.json` (pulled 2026-09-08) · `lib/cotality/generated/contract.ts`

**Current output:** `npm run ucba:audit` → 46/46 PASS, 0 REGRESSIONS, exit 0. All six `audit:display-compliance` scripts → exit 0, zero findings.

---

## HEADLINE

**No validator I own imports the Cotality contract. Zero of eight.** The only two matches for "cotality" in all eight files are `scripts/audit-pii-masking.ts:63` (a *function name* `cotalityRecordToPublicDTO` inside a regex) and `compliance/rules/ucba-audit-checklist.json:1129` (the *string* `"live-contract|liveEnumMembers"` used as a grep pattern). Neither reads the contract.

Every field name and status value in this suite is a hand-typed string literal. **13 of them disagree with the live contract today.** The rule engine underneath is already wired (`lib/compliance/rls-enforcement.ts:221` imports `liveEnumMembers`) — the validators are the layer that never got connected.

**And all eight are source-text scanners.** Not one renders a component, calls a function, or probes a URL. This is the exact 2026-05-20 FARE Act failure mode, institutionalised: seven UCBA rules currently pass on comments, tombstone attributes, and a doc-comment that says the field does not exist.

---

## 1. `scripts/ucba-compliance-audit.js` + `compliance/rules/ucba-audit-checklist.json`

**1. WHAT IT CHECKS.** Loads 46 rules (all v2 format) from the JSON checklist; for each rule and each `required_surface`, concatenates the declared evidence files and runs a case-insensitive regex over the blob. Pattern found → surface PASS.

**2. AUTHORITY TODAY: NONE.** No import of `lib/cotality/*`. `scripts/ucba-compliance-audit.js:29-30` imports only `fs` and `path`. Every field name, enum member and status word is a literal inside `compliance/rules/ucba-audit-checklist.json`.

**3. HARDCODED LISTS.** All 46 rules × 1-5 surfaces are hardcoded regex strings. Classification of the provider-shaped names:

| Name | Checklist line(s) | Class |
|---|---|---|
| `BuyerAgencyCompensation` | 593, 1149, 1168, 1398, 1413 | FIELD — must come from Cotality |
| `SubAgencyCompensation` | 1149, 1168, 1413 | FIELD |
| `IDXEntireListingDisplayYN` | 1514, 1521, 1522 | FIELD |
| `InternetEntireListingDisplayYN` | 1514, 1521, 1544, 1546 | FIELD |
| `ParticipantOnly` / `ParticipantOnlyYN` | 185, 1295, 1318-1320, 1502-1504 | FIELD/ENUM |
| `OwnerOptOut` | 439, 441, 482-483, 1277-1279, 1460-1462 | ENUM (Permission member) |
| `NumberOfShares` | 1675, 1690, 1693 | FIELD |
| `TaxMonthlyAmount` | 1698, 1706, 1721, 1724 | FIELD |
| `SyndicateYN` / `SyndicateTo` | 1556, 1561, 1562, 1576 | FIELD |
| `Sold`, `Rented` | 136, 151, 610 | ENUM (status) |
| `Cancelled` (two L) | 65, 71 | ENUM (status) |
| `ComingSoon`, `Closed`, `Active`, `Incomplete`, `StandardStatus` | 184, 663, 884, 1617, 1654 … | ENUM/FIELD — all correct |
| `ClosePrice`, `CloseDate`, `ActivationDate`, `ListingAgreement`, `PrivateRemarks`, `ShowingInstructions` | 624, 663, 984-985, 369-370, 1367 | FIELD — all live ✓ |
| `auction_yn`, `auction_type`, `owner_opt_out`, `participant_only`, `idx_display_yn`, `first_active_date` | 685-712, 441, 1318, 1544, 984 | Mallan DB columns — correctly NOT from Cotality |
| `AU-001/002/003`, `R1`, `DG-002`, 14-day max, 30-day DOM reset, 90-day protected period, 24h close | 685-712, 553, 831-861, 264 | RULE/OBLIGATION — correctly in the rule files |
| `ProtectedPeriod`, `STATUS_INITIAL`, `checkDistributionGates` | 256, 384, 1462 | Internal symbols — neither |

**4. DRIFT ALREADY PRESENT — 11 items.**

> **D-1 · `BuyerAgencyCompensation` is a phantom, and it is hiding a real leak.** ⚠️ **HIGHEST VALUE**
> `BuyerAgencyCompensation` / `BuyerAgencyCompensationType` **do not exist** on the live Property resource. The live names are `BuyerBrokerageCompensation` / `BuyerBrokerageCompensationType` (`lib/cotality/generated/contract.ts:4443-4444`, both **`rlsField: true`** — REBNY's own system references them).
> Three UCBA rules — **C9** (`:593`), **G1** (`:1168`), **H11** (`:1413`) — assert that the retired name is *present* in `lib/compliance/dto.ts`. It is: `lib/compliance/dto.ts:85-86` inside `REMOVED_FIELDS`, applied by exact-key `delete result[field]` at `:179`, `:536`, `:548`.
> So the DTO deletes two keys that can never arrive, while **`BuyerBrokerageCompensation`, `BuyerBrokerageCompensationType`, `CompensationComments`, `TransactionBrokerCompensation`, `TransactionBrokerCompensationType` and `LeaseRenewalCompensation` — all live, all declared — are never stripped**, from the DTO or from the `raw_data` deep-clean at `:545-552`.
> `BuyerBrokerageCompensation` appears **nowhere** in `lib/`, `app/`, `scripts/` or `compliance/` outside the generated contract. UCBA Art. IV §2 ("No Compensation on RLS") and H11 ("No Compensation Displayed") are green over a six-field hole. **The validator is what makes the hole invisible: it asserts the drift instead of detecting it.**

> **D-2 · `Sold` / `Rented` are not live StandardStatus members.** `compliance/rules/ucba-audit-checklist.json:151` — rule **A3** ("DOM Resets on Close") executes surface pattern `"Sold|Rented|onClose|terminal"`. Live members are exactly Active, ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn. Neither `Sold` nor `Rented` is one. It passes anyway — see V-1 below. Also latent at `:136` (v1) and in prose at `:610`.

> **D-3 · Two-L `Cancelled`.** `:65` ("DOM resets to zero after 30 consecutive days in Withdrawn or **Cancelled** status") and `:71`. The live member is one-L `Canceled`. The implementation is already correct — `lib/compliance/dom-tracker.ts:88` has `DOM_RESET_ELIGIBLE_STATUSES = new Set(["Withdrawn", "Canceled"])` — so the *checklist* is the stale artifact, and nothing reconciles the two.

> **D-4 · `NumberOfShares` is a phantom.** Zero live Property fields match `/Share/i`. Rule **EXHA-49** is titled "NumberOfShares (Co-op) [Exhibit A] — mandatory field" (`:1667`, `:1690`, `:1693`). See V-2 — it passes on the tombstone.

> **D-5 · `TaxMonthlyAmount` is a phantom.** Live tax fields are `TaxAnnualAmount`, `TaxAssessedValue`, `TaxBlock`, … — no monthly variant. Rule **EXHA-52** (`:1698`, `:1706`, `:1721`, `:1724`). See V-2.

> **D-6 · `OwnerOptOut` is not a live Permission member.** Live `Property.Permission` = AgentOnly, ComingSoon, CompSold, DownPaymentResourceNo, DownPaymentResourceYes, FirmOnly, History, IDX, MemberInactive, OfficeInactive, OfficeOnly, OfficeSuspended, Officeidxoptout, PhotoOptedOut, Private, Public, SyndicateOptOut, VOW. REBNY lists only 3 of these (`rls_listed` = IDX, Private, SyndicateOptOut). `OwnerOptOut` is in none of them. Rules **C3** (`:441`), **C4** (`:482`), **H3** (`:1277`), **GATE-1** (`:1460`) all assert the name.
> Downstream evidence this is not merely cosmetic: `public/crm/SALE-FORM-REDESIGN.html:431-432` renders `value="OwnerOptOut"` with the visible label `(Permissions=OwnerOptOut)` — advertising a Permission member the provider does not publish; and `lib/compliance/rls-enforcement.ts:412` does `perm === "OwnerOptOut"` where `perm` falls back to `payload.Permission` (`:409`), a comparison that can never be true for a provider row. (The `_mallanPermission` path is legitimate Mallan persistence; the provider-field fallback and the form label are not.)

> **D-7 · `ParticipantOnly` / `ParticipantOnlyYN` are phantoms.** Not a live field, not a live Permission member. Executed at `:185` (A4/gate), `:1318-1320` (H4), `:1502-1504` (GATE-2); latent at `:1295`.

> **D-8 · `IDXEntireListingDisplayYN` is a phantom** — `:1514` (requirement), `:1521` (v1 pattern), `:1522`. The checklist *documents* the drift at `:1522` ("Internal code uses IDXEntireListingDisplayYN; Trestle field is InternetEntireListingDisplayYN") and then accepts both alternatives rather than failing the wrong one. `lib/cotality/contract.ts:14` names this exact string as the canonical example of a phantom.

> **D-9 · `SyndicateYN` is a phantom** — `:1556` ("UCBA: SyndicateYN"), `:1561`, `:1562`. Live field is `SyndicateTo`, an enum with 28 members. Same self-documented-then-accepted pattern.

> **D-10 · `DOM_SUPPRESSING_PERMISSIONS` is a constant the repo deliberately deleted.** Executed at `:185` (A4/gate). It exists nowhere in `lib/` or `app/` — only in `lib/compliance/__tests__/dom-canonical-permission.test.ts:156`, which asserts `expect(domTrackerSource).not.toContain("DOM_SUPPRESSING_PERMISSIONS")`. **The UCBA audit greps for a symbol a Jest test forbids.**

> **D-11 · `REQUIRED_COTALITY_FIELDS` is pointed at the wrong file.** Rule **F12** (`:1128`) runs `"validate|REQUIRED_COTALITY_FIELDS"` against `lib/compliance/rls-enforcement.ts`. The constant is defined at `lib/idx/trestle-mapper.ts:1336`. F12 passes only because the alternative `validate` matched the section-divider comment `// ── 2. Validate mandatory fields ───` at `rls-enforcement.ts:254`.

**5. CAN IT BE WIRED TO COTALITY? — Partly.** Concretely:
- Add a **pre-flight name gate**: before evaluating, extract every PascalCase token from every `surface_patterns` value and `verifyPattern`, and fail the run if a token is neither `isLiveCotalityField(t)` nor a member returned by `liveEnumMembers(f)` nor on an explicit `mallan_internal` allowlist in `_meta`. That is ~40 lines and catches D-1, D-2, D-4, D-5, D-7, D-8, D-9 mechanically, forever.
- Add a `provider_fields: []` / `provider_enum_members: {}` block per rule, resolved through `lib/cotality/live-contract.ts` at load time.
- Move `Sold`/`Rented`/`Cancelled` prose to the live tokens (`Closed`, `Canceled`).
- **What would break:** the run is a plain Node CJS script; `live-contract.ts` is TS with `@/` path aliases, so this needs `tsx` (the six display audits already run under `npx tsx`) or a small JSON reader over the two `.live.json` pulls directly — the latter has no toolchain cost. The gate will **immediately red** on D-1/D-4/D-5/D-7/D-8/D-9, which is the point; land it with those six rules corrected in the same PR.

**6. VACUOUS / SOURCE-TEXT CHECKS — this is the bulk of the finding.**

**Structural defects in the runner:**
- `scripts/ucba-compliance-audit.js:171-174` — a surface passes if **any one** declared evidence file exists. A rule naming three files is satisfied by one.
- `:158-169` — all evidence files are **concatenated into one blob** before matching. A pattern can match in file A while the obligation belongs to file B, and the rule still passes.
- `:176-179` — a required surface with **no pattern** auto-PASSes on file presence alone. (None today; latent.)
- `:112` — `new RegExp(p, 'i')`. Everything is **case-insensitive**, so a wrong-case enum member (`comingsoon`, `canceled` vs `Canceled`) is undetectable by construction.
- `:410-419` — a rule with `verdict: "FAIL"` whose pattern is *found* becomes `POSSIBLY_FIXED` and increments `summary.pass`. (Dead today — 0 v1 rules; latent.)
- `:593-596` — `blockingFailures` filter body is `return true` with a comment claiming it filters expected failures. Dead code.
- `_meta.v2_required_surfaces` declares 15 surface names; rules actually use six that are **not in the enum** (`route`, `ui`, `data`, `content_restrictions`, `middleware`, `robots`). Nothing validates it — the `_meta` block is decorative.

**Evidence paths that do not exist on disk (5 across 4 rules):**
- `app/listing/[id]/page.tsx` — cited by **D7** (`:898`), **F6** (`:1075`), **H1** (`:1215`), **H7** (`:1333`). The real route is `app/listing/[...slug]/page.tsx`.
- `app/components/PropertySearch.tsx` — cited by **H1** (`:1217`). Deleted.

> ⚠️ **This is the 2026-05-20 incident, unfixed.** Four rules covering IDX attribution (F6, H1) and the Coming Soon badge (D7, H7) declare the **listing detail page** as evidence, point at a stale path, and pass off `app/components/SearchListingCard.tsx` alone. **No UCBA rule checks the listing detail page.** That is the exact surface where the FARE Act disclosure source-grepped green and did not render.

**Rules that pass on comments or negation markers:**

| Rule | Passes on | Evidence |
|---|---|---|
| **A3** DOM Resets on Close | three **doc-comment** lines only (`dom-tracker.ts:9, 26, 45`) — prose about "a Sold / Rented row". No code. | V-1 |
| **A5** No DOM Circumvention | comment lines `:47, :34, :43` only |  |
| **C12** Closing Price Within 24hrs | one **comment**, `app/api/crm/listings/[id]/status/route.ts:104` |  |
| **C15** backend_route | one **comment** (`route.ts:4`), matched twice by two alternatives |  |
| **D1** Coming Soon Sales Only | header comment `:17` + comment `:448` |  |
| **F12** Data Accuracy | the word `validate` in a section-divider comment | D-11 |
| **H4 / GATE-2** Participant Only (mapper) | `lib/idx/trestle-mapper.ts:132` — a comment reading **`// - IDX*/VOW*/IDXParticipationYN/ParticipantOnlyYN do NOT exist as separate`**. The rule passes because the substring `ParticipantOnly` occurs inside a comment stating the field does not exist. | ⚠️ |
| **C13 / GATE-6** Closed Removed 24hrs (mapper) | pattern `CloseDate\|isClosedPast24Hours` vs `lib/idx/trestle-mapper.ts`. **`isClosedPast24Hours` occurs zero times in that file** — it is defined at `lib/compliance/gates.ts:220` and called at `:323`. The surface passes purely on `CloseDate` appearing in two `$select` lists (`:104`, `:443`). The file that actually implements the 24-hour obligation is cited by **no UCBA rule at all**. | ⚠️ |
| **A6 / A8** ui | `public/crm/js/dashboard/workspace.js:5420` — a UI label array `['Fair Housing', …, 'Protected Periods', …]` |  |
| **C7** content_restrictions | `"id": "R1"` — and also matches `"id": "R10"` (no word boundary) |  |

> **V-1 · A3.** Executes `"Sold|Rented|onClose|terminal"` against `lib/compliance/dom-tracker.ts`. Two of four alternatives are retired status words; the passing matches are all prose in the file header. The rule verifies nothing about DOM freezing on close.

> **V-2 · EXHA-49 / EXHA-52 pass on tombstones — the audit reports "mandatory field present" for fields the codebase has declared removed.** ⚠️
> - EXHA-49 matches at `public/crm/SALE-FORM-REDESIGN.html:1141` → `<input id="saleUnitShares" … data-mallan-ignore="true" data-removed-field="NumberOfShares">`, at `:7619` → `data._mallanNumberOfShares = …`, and at `:9397` → `{ mallan: '_mallanNumberOfShares', legacyFallback: 'NumberOfShares', … }`.
> - EXHA-52 matches at `:693` → `data-mallan-ignore="true" data-removed-field="TaxMonthlyAmount"`, `:7620`, `:9398` → `legacyFallback: 'TaxMonthlyAmount'`.
> Every match is a marker saying *this Cotality field does not exist*. **EXHA-49's own `verifyDescription` at `:1676` reads "Check field exists WITHOUT data-mallan-ignore AND is mapped in payload builder to NumberOfShares."** The v2 pattern (`:1690`) implements none of that — it greps the bare name. The audit passes on precisely the condition its own description says must fail.

---

## 2. `scripts/audit-closed-listing-24h.ts`

**1. WHAT IT CHECKS.** Three things: `isClosedPast24Hours` + `hoursSince > 24` exist in `lib/compliance/gates.ts`; every `app/api/**/route.ts` that looks like it returns listings calls a display gate; and a cron drives idx-sync at ≤30-minute frequency.

**2. AUTHORITY TODAY: NONE.** No Cotality import.

**3. HARDCODED LISTS.**
- `:79-85` `RETURNS_LISTINGS` — `ListPrice`, `listPrice`, `list_price`, `BedroomsTotal`, `bedroomsTotal`, `bedrooms_total`, **`MlsStatus`**, `mlsStatus`, `StandardStatus`, `standardStatus`, `ListingKey`, `mls_id`, `mlsId`. **FIELD claim** — must resolve through Cotality (the PascalCase half; the snake_case half is Mallan DB naming).
- `:24-28` `GATE_FUNCTIONS` — `filterDisplayableDbListings`, `checkDistributionGates`, `evaluateDisplayGate`. Internal symbols — neither.
- `:41`, `:49` — `isClosedPast24Hours`, `hoursSince > 24`. Internal symbols.
- `:106-109` carve-outs; `:157` `/^\*\/(\d+)\s/` with N ≤ 30. **RULE/OBLIGATION** (the 24h bound is UCBA Art. I §6) — correctly not from Cotality.

**4. DRIFT.** `MlsStatus` at `:82` is live but **`filterable: false` — provider-suppressed** (`lib/cotality/generated/contract.ts:4868`) and unmeasurable for population. It is used only as a "does this file look like a listing route" heuristic, so this is not itself a violation — but it is a hardcoded provider name that no one checks, and it seeds the belief that `MlsStatus` is a usable signal. No retired status words in this file.

**5. CAN IT BE WIRED? — Partly.** Replace `RETURNS_LISTINGS`'s PascalCase half with a check against `LIVE_PROPERTY_FIELDS`, and drop or comment `MlsStatus` as suppressed. The snake_case half must stay (Mallan DB). What would break: nothing — the heuristic gets stricter, coverage stays the same.

**6. VACUOUS / SOURCE-TEXT.**
- **The whole script is a source scan.** It never calls `isClosedPast24Hours`, never issues a request, never checks a rendered page.
- `:41` and `:49` are `/isClosedPast24Hours/.test()` and `/hoursSince\s*>\s*24/.test()` over the file text. A commented-out function or a string in a doc block satisfies both.
- **Coverage is 10 of 69 route files.** The `hits >= 2` threshold at `:87-92` silently excludes routes. Confirmed miss: **`app/api/agents/[slug]/past-deals/route.ts`** — its own docblock at `:28` says `Public endpoint (no auth required)`, it has `export async function GET` at `:30`, it orders by `close_date` at `:58` and returns `closeDate` at `:70`. **A public endpoint serving closed transactions, invisible to the closed-listing audit** because it scores 1 of the 2 required tokens.
- `:116-121` — a route with no detected `GET` increments `gatedCount`, i.e. **"unverifiable" is reported as "OK"**. Of the 10 scanned, 8 hit a real gate and 2 (`app/api/idx/search/route.ts`, `app/api/media/batch/route.ts`) passed via the `authGated` carve-out. `idx/search` genuinely calls `requireAgentOrBroker` at `:32` — legitimate — but the carve-out is a whole-file substring test at `:108-109`, so any file merely *mentioning* one of those five identifiers is exempted, including a conditional agent-only branch in an otherwise public route.
- **The cron check matches the wrong job by substring.** `:143` `crons.find((c) => /one-cycle/.test(c.path))`. `vercel.json` contains **no `idx-sync` cron and no `/api/cron/one-cycle` cron** — the only match is `/api/cron/one-cycle-preflight` at `*/10 * * * *`. Today that is benign: preflight does delegate (`app/api/cron/one-cycle-preflight/route.ts:96` → `await import('@/app/api/cron/one-cycle/route')`). But the audit verifies a **name**, not the delegation. Rename or re-scope the preflight and the check stays green while §2.05 freshness dies.
- `:157` — the schedule regex only accepts `*/N` in the minute field. `0,15,30,45 * * * *` (compliant, every 15 min) **fails**; `*/10 * * * 1` (every 10 min, Mondays only) **passes**. Neither is a frequency check.

---

## 3. `scripts/audit-pii-masking.ts`

**1. WHAT IT CHECKS.** Greps `app/api/**/route.ts` and `app/**/*.{ts,tsx}` for 20 REBNY HID-tier field names; a hit is a leak unless the file also contains an auth marker or a sanitizer marker.

**2. AUTHORITY TODAY: NONE.** `:63` mentions `cotalityRecordToPublicDTO` — a function name in a regex, not an import.

**3. HARDCODED LISTS.**
- `:29-49` `HID_FIELDS` — 20 entries in PascalCase + camelCase pairs: `PrivateRemarks`, `ShowingInstructions`, `ShowingContactName/Phone/PhoneExt/Type`, `ShowingRequirements`, `LockBoxType/Location/SerialNumber`, `ListAgentDirectPhone/Email/URL`, `CoListAgentDirectPhone/Email/URL`, `ListOfficePhone/URL/Email`. **FIELD claims** — must come from Cotality. *All 20 PascalCase names verify LIVE.* This is the cleanest list in the suite.
- `:52-59` `AUTH_GATES`, `:62-68` `SANITIZE_MARKERS` — internal symbols, neither.

**4. DRIFT.** None in the names themselves. The defect is **omission**: the list is a hand-picked 20 out of a much larger confidential surface. Live and unlisted: `ShowingConsiderations`, `ShowingServiceName`, `ShowingAdvanceNotice`, `ShowingDays`, `ShowingStartTime`, `ShowingEndTime`, `OwnerName`, `OwnerName2`, `OwnerPhone`, and the six live compensation fields from **D-1**. Nothing regenerates this list when the feed moves.

**5. CAN IT BE WIRED? — Partly.** The HID *tier* is a REBNY obligation (correctly a rule, not a feed fact), but the *names* in it must resolve. Assert each entry through `isLiveCotalityField()` and fail on a phantom; keep the tier membership in `lib/compliance/rebny-ucba-rules.ts` and read the names from there. What would break: nothing today (all 20 resolve); the gate then catches the next rename the way `BuyerAgencyCompensation` was missed.

**6. VACUOUS — this audit is effectively inert.** ⚠️
Its own output: `API routes scanned: 290 · Gated by auth (OK): 2 · Sanitized via DTO (OK): 0 · LEAK: 0 · Components scanned: 200 · Public render of HID: 0`.
`:145` `if (hits.length === 0) continue;` — a route is only ever *evaluated* if its source text literally contains a HID field name. Repo-wide, **only two files in all of `app/api` do**: `app/api/crm/listings/route.ts` and `app/api/crm/listings/[id]/route.ts` — both CRM, both auth-gated, and both inside a directory the audit's own comment (`:15-16`) implies it is scanning for *public* leaks.
Consequences:
- **Zero public routes were evaluated.** The `SANITIZE_MARKERS` branch (`:151-154`) has never executed — the counter is 0.
- The stated strategy at `:14-17` ("verify EITHER it goes through the canonical public projection … OR it is explicitly authenticated") is **never run against a public route.**
- The realistic leak shapes are all invisible: `select: { ... }` with a spread, `return NextResponse.json(listing)` on a raw Prisma row, `raw_data` passthrough, `SELECT *`. None of these name a HID field, so none are scanned.
- `:174` skips any path matching `/[Aa]gent[Vv]iew|[Bb]roker[Vv]iew|[Cc]rm/` — a filename-based exemption with no auth verification.
- `:178` requires the hit line to match `/\{.*\}/` or `/value\s*=/` — a HID field rendered across a line break, or via a mapped variable, is missed.

---

## 4. `scripts/audit-coming-soon-badge.ts`

**1. WHAT IT CHECKS.** For each `app/**/*.tsx` that looks like a listing renderer, requires both a Coming Soon *detection* token and a *badge text* token to appear somewhere in the file.

**2. AUTHORITY TODAY: NONE.**

**3. HARDCODED LISTS.**
- `:36-45` `CS_DETECTION` — includes `/['"]ComingSoon['"]/` (`:39`) and `/standardStatus\s*===\s*['"]ComingSoon['"]/` (`:41`). **ENUM claim — a StandardStatus member.** `ComingSoon` is a live member ✓.
- `:26-33` `BADGE_PHRASES` — `Coming Soon. No Showings or Open House` is a **RULE/OBLIGATION** (UCBA Art. I §16(C) required wording), correctly hardcoded. `<ComingSoonBadge` / `ComingSoonBadge` are internal symbols.
- `:48-52` `LISTING_DATA_TOKENS` — `ListPrice`, `mlsId`, `ListingKey`, `.bedroomsTotal`, `.bathroomsFull`. FIELD claims; all live.
- `:54-62` `RENDER_PATTERNS` — UI configuration.

**4. DRIFT.** No retired words. **But the badge rule names a date the audit never resolves:** UCBA Art. I §16(C) requires *"…until [Start Showing Date]"*. The live field is **`StartShowingDate`** (confirmed live). It appears nowhere in this audit, and nothing checks the rendered date comes from it rather than from `ActivationDate`, `OnMarketDate` or a Mallan column. The obligation is checked; the field backing it is not.

**5. CAN IT BE WIRED? — Yes.** Resolve `ComingSoon` through `isLiveEnumMember('StandardStatus', 'ComingSoon')`, resolve `StartShowingDate` through `isLiveCotalityField`, and require the badge's date expression to trace to it. Nothing breaks — both names are live today.

**6. VACUOUS / SOURCE-TEXT.**
- **`BADGE_PHRASES[2..3]` and `CS_DETECTION[6..7]` are the identical two regexes** (`<ComingSoonBadge\b`, `\bComingSoonBadge\b`, at `:31-32` and `:43-44`). So the single token `ComingSoonBadge` satisfies *both* `hasBadgeText()` and `detectsComingSoon()` simultaneously. **The `MISSING_BADGE` (`:123`) and `INCORRECT_BADGE_TEXT` (`:131`) branches are unreachable for any file that passes via the component name.** The audit's whole design — cross-checking detection against text — collapses to one grep.
- Measured: **6 of the 11 audited files pass on the component name alone**, with no literal UCBA phrase in the file — `ActiveListingsTabs.tsx`, `building/page.tsx`, `buildings/[slug]/page.tsx`, `FeaturedListings.tsx`, `ListingSidePanel.tsx`, `SimilarListings.tsx`. (Their usages are real — e.g. `FeaturedListings.tsx:7` imports and `:285` renders `<ComingSoonBadge`. But a stale import, a commented-out JSX block, or a dead conditional would score identically.)
- Nothing verifies the badge is **conditionally rendered on the ComingSoon branch**. Nothing verifies it renders at all.
- `:88-92` `dataHits >= 2 && renderHits >= 2` — same arbitrary threshold as the attribution audit; the same six files fall just below it (below).

---

## 5. `scripts/audit-public-attribution.ts`

**1. WHAT IT CHECKS.** For each `app/**/*.tsx` scoring ≥2 listing-data tokens and ≥2 render patterns: requires "Courtesy of" (or a REBNY marker) somewhere in the file, and that the Tailwind text class within 4 lines above it is ≥ the file's median body-text size.

**2. AUTHORITY TODAY: NONE.**

**3. HARDCODED LISTS.**
- `:80-85` `LISTING_DATA_TOKENS` — `listPrice`/`ListPrice`/`list_price`, `mlsId`/`mls_id`, `ListingKey`, `listOfficeName`/`ListOfficeName`, `.bedroomsTotal`, `.bathroomsFull`, `BedroomsTotal`, `BathroomsFull`. **FIELD claims.** All PascalCase entries verify LIVE (`ListPrice`, `ListingKey`, `ListOfficeName`, `BedroomsTotal`, `BathroomsFull`).
- `:163-167` `hasAttribution` — `Courtesy of`, `data-rebny-attribution`, `Based on information from the REBNY`. **RULE/OBLIGATION** (UCBA Art. III §2(C)) — correctly hardcoded.
- `:29-35` `TEXT_SIZE_PX`, `:122` `BODY_TEXT_CAP_PX = 18`, `:92-106` `rendersListingCardUI` — **UI configuration**.

**4. DRIFT.** None. This is the only audit in the suite with a clean field list. Worth noting for contrast: the attribution obligation is about the *listing broker*, and the live fields backing it (`ListOfficeName`, `ListAgentFullName` — both live) are named but never resolved.

**5. CAN IT BE WIRED? — Yes, cheaply.** Assert the PascalCase half of `LISTING_DATA_TOKENS` through `isLiveCotalityField`. Nothing breaks.

**6. VACUOUS / SOURCE-TEXT.**
- `:190` — `if (median !== null && attribFont !== null && attribFont < median)`. **A null `attribFont` falls through to `okFiles`** — the font requirement silently does not apply. Today all 11 files resolve a font (14/14, 13/13, 13/13, 13/13, 13/12, 14/13.5, 14/14, 14/13.5, 13/12, 13/12.5, 13/13), so the branch is not currently firing — but it is a silent-pass path, and `:148` only walks 4 lines up, so a class on a wrapper `<div>` five lines above yields null.
- `hasAttribution()` is **whole-file**: a `Courtesy of` string in a comment, a dead branch, or an unused constant satisfies it. Nothing ties the attribution to the render path of the card it must accompany. *(Spot-checked — the 11 current matches are real render sites: `SearchMap.tsx:371`, `SimilarListings.tsx:110`, `BuildingUnits.tsx:320`, `building/page.tsx:463,554`. No live false positive; the structural hole stands.)*
- **Six files sit just below the `dataHits>=2 && renderHits>=2` threshold (`:113`, `:105`) and are never audited**: `app/search/page.tsx` (data=1, render=2 — **and `hasCourtesy=false`**), `app/agents/[name]/PastDealsSection.tsx` (data=1, render=2), `CompareProperties.tsx`, `FavoriteButton.tsx`, `MarketSnapshot.tsx`, `PriceHistory.tsx`. `app/search/page.tsx` imports `GridCard, ListCard, SplitCard` from `SearchListingCard` at `:12` and is the primary IDX search surface — it carries the disclaimer block (`:1196`, `:1211`, `:1235`) but no per-listing "Courtesy of", and the audit has no opinion because it scored one token short.
- `:65` skips `portal/` entirely; `scripts/audit-statistical-disclaimer.ts:51` does not. The suite is inconsistent about whether portal surfaces are IDX surfaces.

---

## 6. `scripts/audit-statistical-disclaimer.ts`

**1. WHAT IT CHECKS.** Any `app/**/*.tsx` matching ≥2 aggregate-stat tokens must carry the REBNY statistical disclaimer including "for the period" (UCBA Art. VIII §4).

**2. AUTHORITY TODAY: NONE.**

**3. HARDCODED LISTS.**
- `:23-32` `STATS_TOKENS` — `avgPrice`, `medianPrice`, `avg_price`, `median_price`, `avgListPrice`, `medianListPrice`, `averageDom`, `avgDom`, `averageDaysOnMarket`, `/\baverage[A-Z]/`, `/\bmedian[A-Z]/`, `totalListings`, `closedCount`, `priceTrend`, `marketTrend`, `/\btrend[A-Z]/`, `MarketStats|MarketModule|MarketSnapshot|MarketReport`. **All internal/derived names — neither FIELD nor RULE.** (The underlying provider inputs `ListPrice`, `ClosePrice`, `DaysOnMarket`, `CloseDate` are all live but never named here.)
- `:34-35` disclaimer text — **RULE/OBLIGATION**, correctly hardcoded.
- `:36` `DISCLAIMER_VIA_COMPONENT` — UI configuration.

**4. DRIFT.** No provider names to drift. **The gap is that the aggregate is never traced to a provider field** — nothing checks that a "median sale price" derives from `ClosePrice`/`ListPrice` rather than a stale column, and nothing checks the "for the period" dates come from `CloseDate`. J.5 end-to-end tracing is entirely absent.

**5. CAN it be wired? — No, not meaningfully.** The obligation and the token vocabulary are both Mallan-internal. Correct as-is. The useful change is the opposite direction: require each stats module to declare which live fields feed it, and validate *those* through the contract.

**6. VACUOUS / SOURCE-TEXT.**
- `:36` `DISCLAIMER_VIA_COMPONENT` — **the branch has never fired.** All 5 passing files pass on `period=true`; `viaComponent=false` on every one. Dead allowlist.
- The allowlist is also **circular**: it exempts a page that renders `<AnswerBox`, yet **`app/components/neighborhoods/AnswerBox.tsx` renders `formatPrice(neighborhood.marketStats.medianSalePrice)` at `:80` and contains zero REBNY/disclaimer text** (grep count 0). It is rendered by `app/manhattan/[neighborhood]/page.tsx:9` and `BoroughDetailPage.tsx:64`. It escapes the audit because it scores **1** of the required 2 `STATS_TOKENS`. A component that carries no disclaimer is on the list of components that excuse others from carrying one.
- **10 further pages score exactly 1 token and are never audited**, all with `period=false, generic=false`: `app/market/page.tsx`, `app/manhattan/[neighborhood]/page.tsx`, `BoroughDetailPage.tsx`, `NeighborhoodHubGrid.tsx`, `AdjacentNeighborhoods.tsx`, `AnswerBox.tsx`, `app/building/page.tsx`, `app/buildings/[slug]/page.tsx`, `SearchMap.tsx`, `app/listing/[...slug]/page.tsx`.
- Source text only — never checks the disclaimer *renders*, or that the period dates are populated rather than `undefined`.

---

## 7. `scripts/audit-fair-housing-text.ts`

**1. WHAT IT CHECKS.** Loads 116 prohibited terms from `data/compliance/prohibited-terms.json` and regex-scans public-facing files for them.

**2. AUTHORITY TODAY: NONE — and correctly so.** Fair Housing terms are a legal obligation (FHA / NY HRL / NYC HRL Title 8 / Fair Chance), not a feed fact. This is the one validator whose *authority model* is right. It is also, correctly, the only one that externalises its list to a JSON rule file rather than hardcoding it.

**3. HARDCODED LISTS.**
- `:58` `SCAN_GLOBS = ['app', 'content', 'public/copy']` — **UI/scope configuration**.
- `:59` `EXTS = ['.tsx', '.ts', '.md', '.mdx']` — configuration.
- `:70` skips `crm`, `admin`, `api` — configuration.
- No field or enum names anywhere. Clean.

**4. DRIFT.** None of the Cotality kind. **But the scan scope is broken:**
> ⚠️ **Two of the three `SCAN_GLOBS` do not exist on disk.** `content/` and `public/copy/` are absent (`ls` confirms). Only `app/` is scanned — 217 files. The file's own header at `:4-5` claims it "Scans every hardcoded string in app/ (TSX/TS), **data/**, content/, and any neighborhood/market/blog text". **`data/` is not in `SCAN_GLOBS` at all**, and `.json` is not in `EXTS`, so it could not be scanned even if it were.
> This matters: `data/manhattan-neighborhoods.json` (and the Brooklyn/Queens/Bronx/Staten Island siblings) carry public marketing prose — `"summary": "The Upper East Side is Manhattan's most refined residential neighborh…"`, `"tagline"`, `"fullName"` — and are consumed at `app/api/listings/suggest/route.ts:14-18` and rendered on the public neighborhood pages. `data/resources/buyers-guide.json`, `sellers-guide.json`, `investors-guide.json` are the same shape. **None of this public-facing copy is Fair-Housing-scanned.** Neighborhood descriptions are the single highest-risk Fair Housing surface a brokerage site has (steering, "family-friendly", "safe", proximity-to-worship language) — and it is exactly the corpus the scanner misses.

**5. CAN IT BE WIRED? — No, and it should not be.** Correctly rule-sourced. The fix is scope, not authority: add `data/`, `lib/listings/return-copy-canonical.ts`, and `.json` to `EXTS` with a value-only walk (keys are not prose). What would break: the JSON walk will surface new hits — expect a first-run red, which is the finding, not a regression.

**6. VACUOUS / SOURCE-TEXT.**
- **The `✓ No Fair Housing violations found` result is scoped to `app/**` only.** The headline number `Files scanned: 217` reads as full coverage and is not.
- `:106` — lines with no quote, no JSX tag, no leading `#*-`, and no `[A-Z][a-z]+ [a-z]` bigram are skipped. Concatenated or templated copy assembled across lines can slip through.
- `:52` — `(^|[^A-Za-z])term(?![A-Za-z])`. Non-greedy on the trailing side only; a term followed by a hyphen or inside a compound is matched, a term preceded by a digit is matched. Minor.
- `:124` filters only its own filename. A second file that legitimately lists the terms (a test fixture, a docs page) would produce permanent false positives.
- Source text only — it cannot see server-composed strings, CMS content, or `raw_data` remarks arriving from the feed. **The highest-volume Fair Housing risk on an IDX site is the provider's own `PublicRemarks`, and no audit in this suite scans a single row of live data.**

---

## PRIORITISED

| # | Finding | Where |
|---|---|---|
| **1** | `BuyerAgencyCompensation` phantom masks **6 unstripped live compensation fields**, incl. `BuyerBrokerageCompensation` (`rlsField: true`). C9/G1/H11 assert the drift. | checklist `:593, :1168, :1413` · `lib/compliance/dto.ts:85-88, :179, :536, :548` |
| **2** | 4 rules cite `app/listing/[id]/page.tsx` — **does not exist**. Real path `[...slug]`. Passes off one sibling file. **No UCBA rule checks the listing detail page** — the 2026-05-20 FARE surface. | checklist `:898, :1075, :1215, :1333` · runner `:171-174` |
| **3** | **C13/GATE-6** (Closed within 24h) passes on `CloseDate` in a `$select` list. `isClosedPast24Hours` is not in the cited file; `lib/compliance/gates.ts` is cited by no rule. | checklist `:663, :1654` · `gates.ts:220` |
| **4** | **`audit-pii-masking` is inert** — 2 of 290 routes evaluated, both CRM; sanitizer branch never executed; zero public routes assessed. | `audit-pii-masking.ts:145, :151-154` |
| **5** | **EXHA-49/52 pass on `data-removed-field` / `legacyFallback` tombstones** for phantom fields — contradicting their own `verifyDescription`. | checklist `:1676, :1690, :1721` · `SALE-FORM-REDESIGN.html:1141, :693, :9397-9398` |
| **6** | **Fair Housing never scans `data/*-neighborhoods.json`** or the guides; 2 of 3 `SCAN_GLOBS` don't exist; header claims `data/` coverage. | `audit-fair-housing-text.ts:4-5, :58-59` |
| **7** | **`AnswerBox.tsx` renders `medianSalePrice` with no disclaimer**, is on the audit's own exemption allowlist, and scores 1 token so is never audited. | `AnswerBox.tsx:80` · `audit-statistical-disclaimer.ts:36, :61-65` |
| **8** | **Coming-soon cross-check collapses** — `ComingSoonBadge` satisfies both sides; 2 of 3 failure branches unreachable; 6 of 11 files pass on the identifier alone. | `audit-coming-soon-badge.ts:31-32, :43-44, :123, :131` |
| **9** | `H4/GATE-2` pass on a comment reading **"ParticipantOnlyYN do NOT exist"**; `A4` greps `DOM_SUPPRESSING_PERMISSIONS`, a symbol a Jest test forbids. | checklist `:185, :1318, :1502` · `trestle-mapper.ts:132` · `dom-canonical-permission.test.ts:156` |
| **10** | **Public closed-deals endpoint invisible** to the 24h audit (1 token short of the threshold). | `app/api/agents/[slug]/past-deals/route.ts:28, :30, :58` |
| **11** | Retired status words executing: `Sold`/`Rented` (A3), two-L `Cancelled` (prose). | checklist `:151, :136, :65, :71, :610` |
| **12** | Phantom Permission member `OwnerOptOut` asserted by 4 rules; surfaced to users as `(Permissions=OwnerOptOut)`. | checklist `:441, :482, :1277, :1460` · `SALE-FORM-REDESIGN.html:431-432` · `rls-enforcement.ts:409-412` |
| **13** | Cron freshness check matches `one-cycle-preflight` by substring; schedule regex accepts `*/10 * * * 1` and rejects `0,15,30,45 * * * *`. | `audit-closed-listing-24h.ts:143, :157` · `vercel.json` |
| **14** | Runner defects: any-one-file-exists; blob concatenation; case-insensitive (wrong-case enums undetectable); `POSSIBLY_FIXED`→pass; dead `blockingFailures`; `_meta` surface enum decorative (6 unlisted names in use). | `ucba-compliance-audit.js:112, :158-179, :410-419, :593-596` |
| **15** | Phantoms `IDXEntireListingDisplayYN` / `SyndicateYN` — self-documented at `:1522`/`:1562` then accepted as valid alternatives. | checklist `:1514-1522, :1556-1562` |

**Single highest-leverage change:** a pre-flight name gate in `scripts/ucba-compliance-audit.js` that resolves every PascalCase token in every pattern through `isLiveCotalityField` / `liveEnumMembers`, with an explicit `mallan_internal` allowlist in `_meta`. ~40 lines, no new dependency (read the two `.live.json` pulls directly to stay CJS). It converts findings 1, 5, 9, 11, 12 and 15 from invisible to blocking, and it fails closed on the next provider rename instead of ratifying it.