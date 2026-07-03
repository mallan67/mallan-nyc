# Step 4 gate — authenticated CRM render check (procedure for Maya)

> **Report-only procedure. Claude cannot run this (no broker session).** Maya executes while logged in; Claude resumes with the final read-only pre-DROP report only AFTER this PASSES.
> Purpose: confirm the sale + rental viewers render listing agent/company from the TYPED columns (Phase D removed `agent_info` from the Prisma client). This is the last open pre-DROP gate besides the final read-only report.
> Date: 2026-06-23 · Board #415.

## What we're verifying
After #429, `GET /api/crm/listings/[id]` no longer returns a top-level `agent_info`. The viewers must show agent/company from `list_agent_full_name` / `list_office_name`. If they render blank, the typed-first fix regressed; if they render populated AND the payload has no `agent_info`, the fix is confirmed live under auth.

## Steps (do for BOTH a sale and a rental listing)

1. Log in to the CRM as broker/agent at `https://mallan.nyc/crm` (your normal login).
2. Open **DevTools → Network** (F12), keep it open, tick "Preserve log".
3. **Sale:** go to the sales listings list and click **View** on an active listing (this opens `/crm/sale-view?id=…` → `SALE-FORM-WITH-TOOLS.html`). 
   - Prefer a listing you know has a listing agent + brokerage (a Mallan exclusive e.g. an SL-… listing, or any active sale).
4. **Rental:** repeat with **View** on an active rental (`/crm/rental-view?id=…` → `RENTAL-FORM-WITH-TOOLS.html`).

## PASS criteria (all must hold, each viewer)
- **A. Rendered:** the "Listing Agent" field and the courtesy **Company** are **populated** (not blank).
- **B. Source = typed:** in Network, click the `GET /api/crm/listings/<id>` request → Response/Preview:
  - `list_agent_full_name` and `list_office_name` are present and **non-empty**, and
  - they **match** what's rendered on the page.
- **C. No legacy JSON:** the same response has **no top-level `agent_info`** key (confirms the Phase D client removal is live).
- **D. Clean:** no red Console errors; the `GET /api/crm/listings/<id>` is **200** (not 500).

## FAIL signals (any one = stop, report, do NOT proceed to DROP)
- Agent or Company renders **blank** while the payload shows a non-empty `list_office_name`/`list_agent_full_name` → typed-first render regressed.
- The payload still contains a top-level `agent_info` → the schema/client removal is NOT actually live on this deploy.
- `GET /api/crm/listings/<id>` returns **500**, or a Console error references `agent_info`.

## Notes
- A third-party IDX listing shows the listing brokerage (e.g. "Compass"); a Mallan exclusive shows "Mallan Real Estate Inc." + the Mallan agent. Either is a PASS for this check as long as the value is populated from the typed fields per criterion B.
- Co-list fields are not part of this check (they were the stale-JSON exception; live feed has them null).

## After this check
- **PASS** → tell Claude "render check passed"; Claude runs the **final read-only pre-DROP report** (re-run precheck + refined stale-JSON live-probe; require real_gap_rows=0 AND unverifiable_gap_rows=0; confirm column exists + sizes). Still no DROP.
- **FAIL** → Claude investigates the regression (report-only) before anything else.

## Hard stop (unchanged)
No SQL write · no DB write · no backfill · no producer change · no gate code change · no migration · no DROP · no reclaim · no snapshot · no downgrade. This check is read-only browsing; it is NOT DROP approval.
