REPORT / EXPORT / DELIVERY WORKFLOW — done. D9, D13, D14, D15 fixed; D10, D11, D12 need other owners.

## Test counts (rule 2)

`tests/runtime/crm-report-outputs.test.ts` — written first, run against unchanged code:

| Run | Result |
|---|---|
| Before any fix | **13 failed / 2 passed** (15 total) |
| After the fixes | **15 passed / 15** |
| `npx tsc --noEmit` | **0 errors** |

The 2 that passed at baseline are deliberate: the premise check (`app/reports/view` does not exist) and the **positive control** (with EmailJS configured, a real send still happens and is audited `email_sent · method:emailjs`) — so the D15 fix is proven not to be an over-correction that just breaks email.

Every assertion drives the shipped code: `public/crm/js/output/reports.js` evaluated verbatim in a JSDOM built from the shipped `reports.html` + `report-preview.html`, plus the shipped `status-presentation.js` and `reso-field-map.js`. Assertions are on results — the bytes of the downloaded file, the rendered DOM, the audit entries, the clipboard, the HTML handed to the print tab. One test clicks the real `button[onclick="generateReport()"]`. No test greps source text for a behaviour claim.

## The two "reports success for something that did not happen" defects

**D15 Email — chose FAIL LOUDLY** (making it real was not available: `POST /api/crm/email` requires DB `client_ids[]` with `consent_captured_at`, and the modal accepts a free-typed address — inventing that mapping is exactly the CLAUDE.md §E guess I must not make).
- `sendEmailDirect()` no longer has a "simulate with a 1.2s delay" branch. `storeAndShowResult(outcome, error)` takes an explicit outcome; `'delivered'` is reachable **only** after `sendViaEmailJS` resolves. Unconfigured → red state, `status:'failed'`, `method:'not_configured'`, audit **`email_send_failed`** (not `email_sent`), and the wording deliberately avoids the words *sent* and *delivered*: **"Email not configured — nothing was emailed"**.
- `generateReport()`'s email case now checks `isEmailConfigured()` **before `closeReportsModal()`** and returns with the error rendered in the still-open modal — that ordering was the whole harm (the old green check got the last word after the modal was gone).

**D14 Shareable Link — chose FAIL LOUDLY + DISABLE** (making it real needs `app/reports/view/page.tsx`, which I do not own, and it is a new public IDX advertising surface).
- `generateShareableLink()` copies nothing, builds no base64, renders the refusal, audits `report_shareable_link_unavailable`, returns `{ok:false}`. The `share` case in `generateReport()` `return`s — no `report_generate` success audit, modal stays open.
- New `applyOutputAvailability()`, called from `openReportsModal()`, sets `disabled` + `aria-disabled` + an "Unavailable" sub-label on the tile, so the dead output cannot be chosen at all; a preset `'share'` falls back to `'email'`.

## PDF decision (D9): renamed, no PDF output added

**There is no viable in-ownership PDF path.** `pdf-lib`, `@react-pdf/renderer` and `exceljs` are installed but are Node packages: the CRM is classic `<script>` files inlined by `build.js` with no bundler or module loader. A server route (`app/api/crm/reports/pdf/route.ts`) and the output tile (`reports.html`) are both files I do not own — and a `pdf` case with no tile would be unreachable dead code, the very defect class I was sent to remove. So:
- The printable page's toolbar button is now **"Print / Save as PDF"** with the line *"To save a PDF, press Print and choose **Save as PDF** as the destination."* (`printReportViaIframe`, my file). The print CSS already emits `@page{size:letter portrait}`, so this is not a euphemism.
- The print toast now says the same thing instead of `"Print dialog opening..."`.
- **`switch (output)` no longer has `case 'email': default:`.** An unimplemented output (e.g. `'pdf'`) was **silently emailed**; it is now refused with `report_output_unavailable` and the modal stays open. That was a live defect, not a hypothetical.

## D13 Excel — a real workbook

`exportReportExcel()` produced `<html xmlns:o=…>` saved as `.xls`. It now emits a real OOXML `.xlsx` (`PK\x03\x04`, correct MIME, `.xlsx` name), written by a ~150-line SpreadsheetML + store-only-ZIP writer (CRC32, fixed DOS timestamp so output is byte-deterministic) added to `reports.js`.

**On "use the installed exceljs":** exceljs cannot execute in this page (no bundler; I do not own `index.html` to add a CDN tag, and injecting a ~1 MB bundle on click would fail offline and silently). So exceljs is used as the **oracle instead of the producer** — the test loads the produced bytes with `new ExcelJS.Workbook().xlsx.load(...)` and reads back headers, a numeric price (`12500000` as a `number`, not a string), and the status cells. A workbook exceljs itself parses is stronger evidence than a magic number. Say the word if you want the CDN route instead; it needs `index.html`.

Also: numbers export as numbers, header row styled, freeze pane, and both CSV and XLSX now carry the RLS attribution + Equal Housing footer (same wording as the emailed report). CSV and Excel share one `getExportFields()` so their Customer-version narrowing can never drift.

## Status presentation (my files consume the shared helper)

`reports.js` had three hand-kept status vocabularies. All now go through `MallanStatus`:
- `statusColor` / `statusBadge` → `MallanStatus.colors` / `.label` / `.isComingSoon` (UCBA showing-restriction text kept).
- `sBadge` (listing sheet) — was `(s || 'Active').toUpperCase()` with `'SOLD'`/`'IN CONTRACT'`/`'COMING_SOON'` — now the same authority, and no longer fabricates `Active`.
- **Two** off-market photo sets (`OFF_MARKET_STATUSES`, `offMkt`) → `MallanStatus.isOffMarket`. **Both were missing `Delete`, so a Delete row published its entire photo set in violation of the REBNY Feb-2025 primary-photo-only rule.**
- Open House hero badge printed `(ohFirst.status||'ACTIVE')` → `MallanStatus.label`.
- `getFieldValue(l,'status')` → `MallanStatus.label(listing)`, so CSV, Excel and every custom column read **Sold / Rented**, and an unresolvable status reads **"Status unavailable"**, never `Active`.

## Verification

`compliance-check` 95 passed / 0 failed (BLOCKER+STRICT) · `ucba:audit` 0 REGRESSIONS · `idx:validate` 0 critical · `crm:test` 37/37 · `tsc --noEmit` 0.

I also **proved I did not break the existing source-grep self-checks** that read my functions' `.toString()` (`compliance-gates-and-output.js` AL1/AL2/AL5/NV4, `offline-test-framework.js` TP-28/TP-33) — all seven token conditions still hold after the rewrite; verified by executing the same predicates against the brace-matched function sources.

`rls:validate` reports 8 ERRORS, all in `SALE-FORM-REDESIGN.html` / `RENTAL-FORM-REDESIGN.html` (`MinLeaseMonths`, `LeaseType`, `BuyerAgentRLSParticipantYN`, `PetsAllowedComments`, `FurnishedListPrice`, `ElevatorsTotal`, `NewDevelopmentYN`) — another agent's surface, not mine.

Full `tests/runtime` suite: 5575 passed / 40 failed in 7 suites — `crm-build-drift` (expected; you rebuild), `guardrails-prohibited-terms` (blocked by a stray `public/crm/RENTAL-FORM-REDESIGN.html.bak`), and 5 form/validator suites. **None references reports.js, report-package.js, or any function I touched** (verified by grep). `crm-sticky-nav-destinations` passes in isolation (19/19).

**What each green check proves and does not:** `compliance-check`/`ucba`/`idx`/`rls` are static rule scans — they prove the written rules pass, not that any field is live on Cotality. My 15 tests prove the shipped browser functions behave as described in JSDOM; they do **not** prove production rendering (no preview URL was available to me).

## Files changed
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/reports.js` (+401 / −155)
- `C:/Users/MayaAllan/Desktop/mallan-nyc/tests/runtime/crm-report-outputs.test.ts` — **new**
- `C:/Users/MayaAllan/Desktop/mallan-nyc/public/crm/js/output/report-package.js` — **byte-untouched** (see below)

---

# NEEDS ANOTHER OWNER

### 1. D11 — `public/crm/js/output/report-package.js` is a BLOCKED DECISION, not a fix I can make
1,050 lines, zero callers anywhere, absent from `public/crm/index.html`, 0 markers in `index-built.html`. I own the file but **neither remedy is available to me**: wiring it needs `index.html` (not mine), and deleting it is exactly the source-of-truth-charter deletion CLAUDE.md §A.7 and the audit both reserve for Maya. An agent message is not that approval, so I fail closed and left it byte-identical. **It must be wired or deleted before launch** — per the charter it is a parallel report builder, and it still carries the retired vocabulary (`'SOLD'`, `'IN CONTRACT'`, `'COMING_SOON'`, `(s || 'Active')` at `:87-110`) plus an off-market set missing `Delete` at `:117`. I did not polish it: proving dead code with a test that no user path reaches would be theatre. `public/crm/js/output/client-feedback.js` (138 lines) is orphaned the same way.

### 2. D9 — two labels I cannot reach
- `public/crm/html/modals/report-preview.html:24` — `Print/PDF` → **`Print / Save as PDF`**. It runs `printReportFromPreview()` → a print dialog; no PDF is generated.
- `public/crm/html/modals/reports.html:181` — the output tile reads `Print` → **`Print / Save as PDF`**, to match the toast and the printable page.
- Optional, same file `:186-189`: the Shareable Link tile is now disabled at runtime by `applyOutputAvailability()`. Removing the tile outright would be cleaner than disabling it.

### 3. D10 — orphan PDF controls (`#pdfDeliveryOptions`)
`public/crm/html/modals/client-delivery.html:103-131` — "PDF Format" radios (`summary`/`detailed`) and three PDF checkboxes with **zero** JS references. Confirmed still orphaned: `grep -c clientDeliveryModal public/crm/index-built.html` = **0**, and `index.html` does not `@include` it. Delete the file (charter deletion → Maya) or wire it.
**Separate live bug in the same defect, and it hits my surface:** `public/crm/js/search/search-actions.js:58-61` `closeDeliveryModal()` sets `#reportsModal.style.display='none'` while the modal is toggled by the `hidden` class. It fires on every Escape (`:99-107`), so **one Escape press permanently poisons the reports modal** — `openReportsModal()` removes `hidden` but the inline `display:none` survives. Fix: `classList.add('hidden')`, or just delegate to `closeReportsModal()`.

### 4. D12 — the `/pdf` route returns HTML
`app/api/crm/sales/prospects/[id]/pdf/route.ts:477-483` returns `text/html`; `lib/pdf/pitch-packet-simple.ts:48` `renderSimplePitchPdf()` is a working `pdf-lib` renderer with zero importers; `public/crm/js/dashboard/panels/sales-crm/pitch-packet.js:366` labels the button "Download PDF". Either import the renderer and return `application/pdf` + `Content-Disposition: attachment`, or rename route and button. Not my files.

### 5. D14 follow-up — to re-enable Shareable Link
Ship `app/reports/view/page.tsx` (Customer-version fields only, IDX disclaimer, broker attribution, `noindex`), then delete `UNAVAILABLE_OUTPUTS.share` in `reports.js` and rebuild `generateShareableLink()` against `window.location.origin` — **not** the hardcoded `https://mallan.nyc` the old code used. It is a new public advertising surface, so §D applies.

### 6. FILE-OWNERSHIP OVERLAP — `reports.js` was already modified before I started
`public/crm/js/output/reports.js` was ` M` in the working tree at session start and already contained `statusKey()` / `status_label` / a CMA "Listed" → "Close Date" change (`:1635`, `:1653`) that no agent's file list claims. I built on that state and preserved those edits (I removed the now-redundant `statusKey`, whose only callers were the two functions I migrated). Worth confirming nobody else is still holding this file.

### 7. Housekeeping blocking CI
- `public/crm/RENTAL-FORM-REDESIGN.html.bak` is failing `scripts/ci/guardrails.mjs` ("Forbidden .bak file in active path") and therefore `tests/runtime/guardrails-prohibited-terms-single-source.test.ts`. Not mine; delete it.
- `public/crm/index-built.html` is stale — your final `npm run crm:build` picks up my `reports.js` changes.