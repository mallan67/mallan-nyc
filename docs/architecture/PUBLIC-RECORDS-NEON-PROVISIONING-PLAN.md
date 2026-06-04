# Public Records Neon Free-Project Provisioning Plan

**Status:** DOCUMENTATION ONLY — defines HOW the provisioning will happen if/when approved · Does NOT provision anything · No app code, schema, scanners, or API routes touched
**Date authored:** 2026-05-14
**Authoring authority:** Maya Allan, Principal Broker, Mallan Real Estate Inc.
**Binding governance:** `docs/architecture/PUBLIC-RECORDS-DB-CHARTER.md` (merged 2026-05-14 as `e0bed3b5`, PR #121)
**Companion design:** `mallan-marketing-plans/2026-05-14-public-records-intelligence-design.md`
**Operational discipline reference:** `NEON.md`
**Source-of-truth charter:** `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md`

This plan is the next document deliverable per charter Article 1.19, step 3. It defines the architectural decisions and the human-executed checklist for provisioning the separate Neon project. It does not authorize the provisioning itself — that requires Maya's explicit go-ahead after she reviews this plan.

---

## 1. Account structure — existing Neon account, separate free project

The public-records Neon project is provisioned **under Maya's existing Neon account** (the same account that hosts the mallan-nyc primary project). It is NOT a new Neon account, NOT a new organization, and NOT a separate Neon billing relationship.

The separation required by charter Article 1.9 is at the **Neon project level**, not the account level. This is sufficient because:
- Each Neon project gets its own physical Postgres cluster with its own storage, compute, branches, and access credentials.
- Free-tier limits (500 MB storage, 100 CU-hr/month compute, 10 branches per project) are enforced per-project, not per-account.
- The free tier allows up to 10 projects per account. Current count: 1 (mallan-nyc). New count after provisioning: 2.

Picking a separate account would add billing/SSO/admin complexity for no isolation gain. Picking a different provider (Supabase, CockroachDB Serverless, self-host) is explicitly prohibited by charter Article 9.3 without a charter amendment.

---

## 2. Project naming convention

**Suggested Neon project name:** `mallan-public-records`

Rationale:
- Hyphen-case matches the existing `mallan-nyc` project naming.
- Includes the firm prefix so the Neon console clearly shows both projects belong to the same brokerage.
- Distinct enough from `mallan-nyc` that a typo cannot easily route to the wrong project.

Alternative considered and rejected: `mallan-pr` (too cryptic, "pr" could mean PR/PullRequest in mixed contexts).

---

## 3. Database naming convention

**Within the project, the default database name:** `mallan_public_records`

Rationale:
- Snake_case for Postgres identifier compatibility (some tooling fights hyphens in DB names).
- Mirrors the project name verbatim with the convention swap, so it's unambiguous which project a connection string targets.

Schema-level structure inside the database: all tables use the `public_records_*` prefix per charter Article 2. No separate Postgres schemas (everything in `public` schema) — the prefix is the namespace.

---

## 4. Environment variable names

Distinct, prefixed env vars to make confusion with mallan-nyc's `DATABASE_URL` mechanically impossible:

| Env var | Purpose | Used by | Permission |
|---|---|---|---|
| `PUBLIC_RECORDS_DATABASE_URL` | Full read-write connection string. Used for scanner writes and admin operations. | mallan-marketing repo only | Write |
| `PUBLIC_RECORDS_DATABASE_URL_READONLY` | Read-only connection string. Used by mallan-nyc CRM read-path. | mallan-nyc only (Vercel production env) | Read |
| `PUBLIC_RECORDS_NEON_API_KEY` | Neon API key scoped to the public-records project only. Used for branch management + ops-health queries. | mallan-nyc Vercel env (for branch-prune cron) | Project-scoped admin |
| `PUBLIC_RECORDS_NEON_PROJECT_ID` | Public-records project ID. | mallan-nyc Vercel env | Read-only metadata |

**Naming rule:** every env var related to the public-records DB starts with `PUBLIC_RECORDS_`. Any code that touches an env var prefixed `PUBLIC_RECORDS_` must route to the public-records DB; any code that touches `DATABASE_URL` (without that prefix) must route to the mallan-nyc primary DB. The prefix is the wall.

**Forbidden:** `NEXT_PUBLIC_PUBLIC_RECORDS_*` — any env var prefixed `NEXT_PUBLIC_` is exposed to the browser. The public-records connection strings and API keys must NEVER appear in a `NEXT_PUBLIC_*` variable. Charter Article 1.5 / 4.1.

---

## 5. Read/write role separation

Three Postgres roles, created inside the public-records database via SQL (the role-creation SQL itself is part of the schema plan, not this provisioning plan):

| Role | Owner | Privileges | Used by |
|---|---|---|---|
| `pr_writer` | Provisioning admin | INSERT, UPDATE, DELETE, SELECT on `public_records_*` tables. NO CREATE, NO ALTER, NO DROP. NO GRANT. | mallan-marketing scanner — the Phase B Python pipeline that writes Schedule A / ACRIS / DOB / etc. data |
| `pr_reader` | Provisioning admin | SELECT only on `public_records_*` tables. NO writes of any kind. | mallan-nyc CRM read-path — server-side Next.js API routes under `/api/crm/buildings/*`, `/api/crm/units/*`, `/api/crm/sponsors/*` |
| `pr_admin` | Provisioning admin | Full ownership. Used only for migrations and human-operator maintenance. | Maya (or operator) running migrations from a local terminal. NEVER deployed to any environment. Credentials stored in a password manager, not in a `.env` file. |

This three-role split enforces least-privilege at the database layer, not just the application layer. If the scanner is compromised, it cannot drop tables or alter schema. If the CRM is compromised, it cannot write anything to the public-records database.

---

## 6. Scanner writer role owned by mallan-marketing

The `PUBLIC_RECORDS_DATABASE_URL` (writer credential) lives **only** in the mallan-marketing repo's environment — typically a `.env` file on Maya's local machine where the Phase B Python scanner runs, OR a GitHub Actions secret if the scanner ever moves to cloud cron (currently not the plan; Phase B is locally-triggered).

The writer credential:
- Never appears in mallan-nyc's environment
- Never appears in Vercel env vars
- Never appears in any committed file
- Never appears in any deployment artifact

If mallan-marketing ever runs in CI (GitHub Actions), the writer credential is stored as a repository secret on the mallan-marketing repo and is referenced as `${{ secrets.PUBLIC_RECORDS_DATABASE_URL }}`. Never inlined.

---

## 7. CRM read-only role owned by mallan-nyc

The `PUBLIC_RECORDS_DATABASE_URL_READONLY` lives **only** in mallan-nyc's environment — specifically in Vercel's production env (`vercel env add PUBLIC_RECORDS_DATABASE_URL_READONLY production`).

The reader credential:
- Never appears in mallan-marketing's environment
- Never appears in any client-side code, JSX, JS bundle, or HTML
- Never appears in any API response body, even to authenticated agents
- Never appears in error messages logged to client browsers (server-side error logging only)

mallan-nyc imports this connection string in a server-only module (e.g., `lib/public-records/db.ts` in a future PR — not part of this plan). Next.js's `"server-only"` directive enforces server-side import-time, preventing accidental client-bundle inclusion.

---

## 8. No public app access to connection string

This is a hard rule, restated for clarity:

| Surface | May see connection string? |
|---|---|
| Mallan agents (authenticated, via CRM) | ❌ Never. Agents see query *results*, never connection details. |
| Mallan admins (authenticated, via CRM) | ❌ Never via the app. Only via Neon console with separate credentials. |
| Anonymous visitors to mallan.nyc | ❌ Never |
| Authenticated portal clients (buyer/tenant/seller/landlord) | ❌ Never |
| External developers / contractors | ❌ Never unless explicitly granted Neon console access by Maya for a specific task |
| Build artifacts / Vercel logs | ❌ Connection string masked in logs (Vercel auto-masks env vars in logs by default; verify) |
| Error messages | ❌ Wrap DB errors in user-safe abstractions; never include raw connection error text in any response |

---

## 9. No client-side exposure

Reinforcing Article 4 and Articles 1.5 / 1.6 / 1.7 of the charter at the operational level:

- No public-records data is ever serialized into a Next.js page's HTML/JSON props for an unauthenticated visitor.
- No public-records data is ever returned from `/api/listings/*`, `/api/featured-config/*`, `/api/neighborhoods/*`, or any other public mallan.nyc API route.
- No public-records data is ever returned from any portal API (`/api/portal/buyer/*`, `/api/portal/seller/*`, `/api/portal/tenant/*`, `/api/portal/landlord/*`).
- No public-records data is ever included in OpenGraph metadata, JSON-LD structured data, sitemaps, or robots.txt.
- API routes that DO return public-records data (`/api/crm/buildings/*`, `/api/crm/units/*`, `/api/crm/sponsors/*`) are gated by `requireAgentAuth()` or equivalent middleware that returns 401/403 to any non-Mallan-agent session.

A CI unit test will verify these rules before the read-path code lands (per charter Article 4.2). This plan documents the rules; the test implementation is part of the CRM read-path plan (Article 1.19, step 6).

---

## 10. Branch-cap discipline

Neon's free tier caps at **10 branches per project**. The Vercel-Neon preview-branching integration normally creates a fresh branch per PR preview deploy. For the mallan-nyc primary project, this collision was solved by `lib/neon/branches.ts` + the daily `neon-branch-prune` cron (see NEON.md §11).

**For the public-records project, the Vercel-Neon preview-branching integration must be DISABLED.** Reasoning:

- The public-records project is read-only from mallan-nyc's perspective. PR previews of mallan-nyc don't need a writable branch of the public-records DB — they can read from the same prod branch as production.
- Disabling preview branching eliminates the 10-branch ceiling concern entirely.
- The mallan-marketing scanner (the only writer) runs locally and doesn't need preview branches either.

**Manual control point:** when provisioning, in Vercel → Project → Integrations → Neon → Configure, the public-records project's preview-branching toggle must be set to **disabled**.

Should preview branching ever be re-enabled (e.g., for a future schema-test workflow), the existing `lib/neon/branches.ts` helpers + a public-records-scoped variant of the `neon-branch-prune` cron must be added BEFORE re-enabling. Document the decision in this file at that time.

---

## 11. Backup / export strategy

| Layer | Frequency | Retention | Destination |
|---|---|---|---|
| Neon native PITR (point-in-time recovery) | Continuous (free-tier default) | 7 days | Neon-managed |
| Weekly `pg_dump` of structured data | Sundays 04:00 UTC (after Neon's natural quiet window) | 8 weeks rolling on R2; quarterly snapshots retained 1 year | Cloudflare R2 bucket `mallan-public-records-backups` (separate from data bucket — see §14) |
| Quarterly schema-only dump | First Sunday of each quarter | Permanent until charter retirement | Same R2 backups bucket, distinct key prefix |

Rationale: public-records data is reconstructible from the original government sources (NY AG, NYC Open Data, NY DOS, etc.) via the scanner pipeline. Backup is therefore primarily for *recovery speed* — restoring from R2 takes minutes; re-running scanners against AG + NYC Open Data + ACRIS takes days. Belt-and-suspenders, not single point of failure.

PII consideration: public-records data is by definition public. The backup posture does not need to satisfy NY SHIELD Act standards for private information (no private info should be in this DB). Standard R2 encryption-at-rest is sufficient.

---

## 12. Storage budget for V1

Per charter Article 9.3 and design doc §3.5, V1 geography (Manhattan core + 6 Brooklyn priority neighborhoods) is projected to use approximately **220 MB** in Neon at year 1.

Breakdown:

| Table family | Estimated rows | Estimated bytes |
|---|---|---|
| `public_records_buildings` | ~500–1,200 | ~5 MB |
| `public_records_units` (Schedule A) | ~30,000–80,000 | ~40 MB |
| `public_records_ownership` (ACRIS) | ~150,000–300,000 | ~80 MB |
| `public_records_certificates_of_occupancy` | ~5,000–15,000 | ~5 MB |
| `public_records_violations` | ~50,000–150,000 | ~30 MB |
| `public_records_abatements` | ~10,000–30,000 | ~10 MB |
| `public_records_sales_offices` | ~500–1,500 | ~1 MB |
| `public_records_action_logs` | sparse, grows over time | ~1 MB year 1 |
| Postgres overhead + indexes | n/a | ~25 MB |
| Action-log audit trail | sparse | ~1 MB year 1 |
| **TOTAL year-1 estimate** | | **~220 MB** |

Headroom against the 500 MB free-tier cap: **~56%**.

Budget review trigger: charter Article 9.6 + the alert thresholds in §15 below.

---

## 13. Structured data only in Neon

Neon's public-records database stores **only structured, queryable, post-extraction data**. Specifically:

| Allowed in Neon | NOT allowed in Neon |
|---|---|
| Schedule A unit rows (price, sqft, beds, % CI) extracted from AG offering plans | Raw offering plan PDFs |
| ACRIS deed metadata (date, price, parties, BBL, document ID) | Raw ACRIS PDF images |
| Building, unit, sponsor, agent metadata | Sponsor floor-plan images |
| References (URLs, object keys) pointing to raw artifacts in R2 | OCR intermediate text (raw extraction output before structuring) |
| Audit log entries | Raw HTTP response bodies from scanned sources |
| Status enums, BBL identifiers, timestamps | LLM prompt-response transcripts |
| Cross-source join keys (BBL, plan_id, sponsor_entity) | Any binary artifact > 1 KB |

**The rule, restated as one sentence:** if a value would not appear in a SQL `SELECT *` result as a human-readable column, it doesn't belong in Neon — it belongs in R2 with a reference stored in Neon.

This rule is the principal lever keeping Neon under the 500 MB free-tier cap. A single offering plan PDF can be 20–80 MB. Even 10 PDFs in Neon would consume more storage than the entire structured year-1 dataset estimated in §12. Storing them in R2 instead reduces Neon's footprint by orders of magnitude.

---

## 14. Raw PDFs / OCR / LLM outputs stored outside Neon — Cloudflare R2

Cloudflare R2 is the chosen home for raw artifacts. mallan-nyc already uses R2 for Trestle listing media (see `CLAUDE.md` mention of "Trestle photos cached to Cloudflare R2"), so there is no new vendor relationship to set up.

### Bucket layout

| Bucket | Purpose | Public access | Lifecycle |
|---|---|---|---|
| `mallan-public-records` | Raw artifacts (PDFs, OCR text, LLM intermediate outputs) | ❌ Private | Permanent for source PDFs; 30-day for OCR/LLM intermediates |
| `mallan-public-records-backups` | Weekly `pg_dump` exports + quarterly snapshots | ❌ Private | Per §11 retention |

Both buckets are **separate from the existing R2 bucket used for Trestle media**. Charter Article 1.10 (no commingling) extends to object storage by analogy.

### Object key conventions

| Artifact | Key pattern |
|---|---|
| Offering plan PDF | `offering-plans/{ag_plan_id}/plan.pdf` |
| Amendment PDF | `offering-plans/{ag_plan_id}/amendment-{n}.pdf` |
| OCR intermediate text | `ocr-intermediate/{ag_plan_id}/{filename}.txt` (purgeable after 30 days) |
| LLM extraction transcript | `llm-transcripts/{ag_plan_id}/{run_id}.json` (purgeable after 30 days) |
| Weekly DB dump | `backups/weekly/{YYYY}/{MM}/{YYYY-MM-DD}-public-records.sql.gz` |
| Quarterly schema dump | `backups/quarterly-schema/{YYYY-QN}-public-records-schema.sql` |

### Access keys

R2 access keys for `mallan-public-records` are managed separately from mallan-nyc's existing R2 keys:

| Key | Used by | Permissions |
|---|---|---|
| `PUBLIC_RECORDS_R2_WRITER_ACCESS_KEY` + `_SECRET_KEY` | mallan-marketing scanner | Read/write on `mallan-public-records` |
| `PUBLIC_RECORDS_R2_READER_ACCESS_KEY` + `_SECRET_KEY` | mallan-nyc CRM (for serving PDFs to agents on-demand, via signed URLs) | Read-only on `mallan-public-records` |
| `PUBLIC_RECORDS_R2_BACKUP_KEY` | Backup job (wherever it runs) | Write-only on `mallan-public-records-backups` |

PDFs are served to agents via signed URLs (15-minute expiry) generated server-side by mallan-nyc API routes. Direct R2 URLs are never exposed.

---

## 15. Storage alert thresholds

The Neon free-tier 500 MB cap is the hard ceiling. Soft alerts trigger graduated responses:

| Threshold | Absolute | Trigger | Required response |
|---|---|---|---|
| **60%** | 300 MB | Warning | Review what's growing. Check whether ACRIS, violations, or amendments are accruing faster than projected. Light-touch optimization (drop low-value columns, archive old action logs). No charter amendment required. |
| **75%** | 375 MB | Pruning plan required | Operator must produce a written pruning plan within 14 days. Plan must specify: which tables/rows to prune, projected MB recovered, impact on agent queries, rollback plan. |
| **80%** | 400 MB | Charter amendment + expansion freeze | No new neighborhoods added to V1 scope until storage drops below 70%. Charter Article 9.6 amendment required to ratify either (a) the pruning plan execution, or (b) an upgrade to Neon Launch tier. Maya signs off. |
| **90%** | 450 MB | Critical — escalation | Operator pauses scanner writes. Maya decides between (a) emergency prune, (b) Launch upgrade now, or (c) move to a different free provider via charter amendment. |
| **100%** | 500 MB | Cap hit | Scanner writes fail; CRM reads continue (Neon allows reads at storage cap; only writes block). 24-hour SLA to either upgrade or prune. |

These thresholds are queried by the ops-health script (§17) and surfaced as warnings + critical exits.

---

## 16. Compute alert thresholds

Free-tier compute budget: **100 CU-hours per month** (post-2025 reset; old 191.9 hr/mo figures in older NEON.md commentary are stale per the 2026-05-14 conversation).

For a CRM-only workload with intermittent reads (no `db-keepalive` cron expected, since the workload is genuinely intermittent and tolerates 5-minute auto-suspend), expected burn is ~10–30 CU-hr/month at year 1.

| Threshold | Absolute | Trigger | Required response |
|---|---|---|---|
| **60%** | 60 CU-hr | Warning | Review what's burning. Check for: agents querying in tight loops, scanner re-runs that should have been incremental, accidental connection-leak patterns. |
| **80%** | 80 CU-hr | Investigation | Run query-log analysis. Identify top 10 queries by compute time. Optimize OR throttle agent query rate. |
| **95%** | 95 CU-hr | Quota emergency | Pause non-essential scanner runs. CRM reads continue. Maya decides between mid-month Launch upgrade ($5/mo + usage) or accepting end-of-month quota lockout. |

Reset date: Neon free-tier compute resets at the start of the calendar month. The ops-health script tracks days remaining in the current quota window.

---

## 17. Ops-health script requirement

A new script must be added (in a future PR, not this one): `scripts/ops-health-public-records.js`.

Specification:

- Queries the public-records Neon project's storage and compute usage via the Neon API (`PUBLIC_RECORDS_NEON_API_KEY` env var).
- Reports: current storage (bytes + %), current compute hours (used + remaining), days until monthly reset, branch count (should be 1 — the production branch), data-as-of staleness (newest `data_as_of` timestamp across `public_records_*` tables).
- Exit codes: 0 = healthy; 1 = warning (any threshold from §15 or §16 hit at the lower tier); 2 = critical (75%+ storage or 80%+ compute, or scanner has not run successfully in 7+ days).
- Human and JSON output modes (mirroring `scripts/ops-health.js` pattern).
- Runs locally on Maya's machine. May also run in a daily Vercel cron (`/api/cron/ops-health-public-records`) that emails Maya on warnings/critical.
- The script implementation is part of a future PR (not this provisioning plan).

The script does NOT exist yet. This plan defines its contract; the next PR creates it.

---

## 18. AuditEvent requirement

Restated from charter Article 6 for operational clarity:

Every read from the public-records database performed via a CRM API route MUST write an `AuditEvent` row to the **mallan-nyc Prisma database** (NOT the public-records database). This is a deliberate cross-DB write: the audit trail lives in mallan-nyc because that's where authentication state and Agent records live.

Required `AuditEvent` fields per query:

```
event_type        = 'public_records_query'
agent_id          = <Mallan agent ID from session>
route             = <API route path>
query_params      = <sanitized — no raw client identifiers, no PII>
result_count      = <integer>
data_sources_queried = <array of source identifiers from charter Article 1.18>
timestamp         = <ISO 8601 UTC>
```

Retention: 2 years (per CLAUDE.md NY SHIELD + REBNY retention policy).

The provisioning plan does NOT create this enforcement — the CRM read-path implementation (Article 1.19, step 6) does. This section restates the rule so the provisioning plan acknowledges the cross-DB audit pattern is part of the architecture.

---

## 19. Manual provisioning checklist

The provisioning itself is a one-time human operation, executed manually by Maya (or a delegated operator) after this plan is approved AND after the schema plan is also approved. The checklist below is what the human runs through.

**Pre-flight:**
- [ ] PR for this provisioning plan has merged
- [ ] PR for the schema plan has merged (separately produced)
- [ ] Maya has explicitly authorized provisioning to begin
- [ ] Operator has access to: Neon console, Cloudflare R2 dashboard, Vercel dashboard for mallan-nyc, mallan-marketing repo secrets

**Step 1 — Provision Neon project:**
- [ ] Log into Neon console (`https://console.neon.tech`)
- [ ] Click "Create new project"
- [ ] Project name: `mallan-public-records`
- [ ] Region: same as mallan-nyc (typically `AWS US East 1 / N. Virginia`) for lowest cross-DB read-time latency
- [ ] Postgres version: latest stable supported by Neon (16+ as of 2026)
- [ ] Database name: `mallan_public_records`
- [ ] Plan: Free
- [ ] Confirm creation → record `Project ID` and `Connection details`

**Step 2 — Disable Vercel preview branching for this project:**
- [ ] In Vercel → mallan-nyc project → Integrations → Neon → Configure
- [ ] For the new `mallan-public-records` project, **disable** preview branching
- [ ] Confirm: only the `mallan-nyc` project has preview branching enabled

**Step 3 — Create roles (via Neon SQL Editor or psql, NOT via app):**
- [ ] Connect as default admin user
- [ ] (Role-creation SQL will come from the schema plan; this plan just lists the intent.)

**Step 4 — Generate and store connection strings:**
- [ ] Generate writer connection string → store in mallan-marketing `.env` as `PUBLIC_RECORDS_DATABASE_URL`
- [ ] Generate reader connection string → store in Vercel mallan-nyc production env as `PUBLIC_RECORDS_DATABASE_URL_READONLY`
- [ ] Generate Neon API key scoped to this project only → store in Vercel mallan-nyc production env as `PUBLIC_RECORDS_NEON_API_KEY`
- [ ] Store `PUBLIC_RECORDS_NEON_PROJECT_ID` in Vercel mallan-nyc production env

**Step 5 — Provision R2:**
- [ ] In Cloudflare R2 console, create bucket `mallan-public-records` (private, no public access)
- [ ] Create bucket `mallan-public-records-backups` (private)
- [ ] Generate three R2 token sets per §14 — writer (mallan-marketing), reader (mallan-nyc), backup (wherever)
- [ ] Add R2 env vars to corresponding environments

**Step 6 — Verify isolation:**
- [ ] From a fresh shell, source mallan-nyc's env, run a query against `DATABASE_URL` → must hit mallan-nyc primary
- [ ] From the same shell, source mallan-marketing's env, run a query against `PUBLIC_RECORDS_DATABASE_URL` → must hit public-records project
- [ ] Confirm the two queries hit different physical Postgres instances (different host strings, different SSL endpoint identifiers)

**Step 7 — Confirm zero schema (no tables created yet):**
- [ ] Run `\dt` (or `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`) against the new project
- [ ] Expected result: 0 user tables
- [ ] No `public_records_*` tables exist yet — those come from the schema plan PR, not this provisioning step

**Step 8 — First ops-health run (after script PR ships):**
- [ ] Run `npm run ops:health:public-records` (or equivalent)
- [ ] Expected: 0 MB storage used, 0 CU-hr consumed, 1 branch, no data-as-of (no data ingested yet)
- [ ] All thresholds green

**Step 9 — Document the provisioning:**
- [ ] Append a row to `docs/architecture/PUBLIC-RECORDS-NEON-PROVISIONING-LOG.md` (a new file created at provisioning time): date, operator, project ID (or last 4 chars for security), R2 bucket names, env vars set, link to Neon console
- [ ] Maya signs off in the log

---

## 20. This plan does not provision or implement anything

This document defines the architectural decisions, the role split, the env-var conventions, the alert thresholds, and the manual checklist. **It does not provision the Neon project, does not create the R2 buckets, does not add env vars, does not create roles, does not create tables.** Those happen at the operator's keyboard, after this plan is approved AND after the schema plan is also approved.

Per charter Article 1.20: merging this plan does not authorize provisioning. Each implementation step requires its own approval.

**Implementation sequence reminder (from charter Article 1.19):**
1. ✅ Charter — merged 2026-05-14 as `e0bed3b5` (PR #121)
2. ⏳ Attorney / compliance review (optional, recommended)
3. ⏳ **Neon provisioning plan — this document**
4. ⏳ Scanner plan
5. ⏳ Schema plan
6. ⏳ CRM read-path plan
7. ⏳ Maya-only beta
8. ⏳ Limited internal rollout

---

## Appendix A — Cross-references

| Topic | Path |
|---|---|
| Binding governance charter | `docs/architecture/PUBLIC-RECORDS-DB-CHARTER.md` (merged) |
| Source-of-truth charter (architecture) | `docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md` |
| Companion design doc | `mallan-marketing-plans/2026-05-14-public-records-intelligence-design.md` |
| Neon operational discipline (primary project) | `NEON.md` |
| Existing branch-prune pattern (reuse model) | `lib/neon/branches.ts` + `scripts/neon-prune-branches.ts` + `app/api/cron/neon-branch-prune/route.ts` |
| Existing ops-health pattern (reuse model) | `scripts/ops-health.js` |
| External-inventory hold (NOT released by this plan) | `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` |
| REBNY compliance rulebook | `CLAUDE.md` (root) + `compliance/README.md` (entry point to `compliance/` directory: `UCBA-2026.md`, `IDX-VOW-DISPLAY-RULES.md`, `NYC-NYS-REQUIREMENTS.md`, `RLS-VALIDATOR-V2.md`, `THIRD-PARTY-AND-FEED-GOVERNANCE.md`, `FIELD-AUTHORITY.md`) + `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` + `data/UCBA-2026-Requirements.md` |

---

End of provisioning plan.
