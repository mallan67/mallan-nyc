# Design Spec — `agent_info` legacy-JSON normalization (pilot slice)

**Date:** 2026-06-18 · **Status:** DESIGN / SPEC ONLY — no code, no schema change, no DB write, no
production migration, no JSON strip, no Neon downgrade, no archive flag · **Owner:** Maya Allan

**Purpose:** Normalize `Listing.agent_info` (legacy JSON) onto typed columns as the **pilot slice** of
the P2-MONEY Step 5 / Free-tier migration. `agent_info` is the lowest-risk *complete* template: 2
typed columns already exist and `eligibility.ts:300-301` already **dual-reads** office name (typed
`list_office_name` first, JSON `ListOfficeName` fallback), it has the fewest readers (~20), and it still touches **render · portal PII masking · syndication · archive · writers**,
so the pattern it establishes transfers directly to the harder columns (`compliance`/`features`/
`address`/`media`).

**Inputs / authorities:**
- Sequencing source: `memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md` (the canonical 4-phase A–D pattern),
  **refreshed** against the newer audit below where it is stale/incomplete.
- Dependency truth: `docs/audits/legacy-json-dependency-audit-2026-06-18.md` §2.5 (the #409 audit).
- Migration discipline: `NEON.md` §4/§5 (nullable columns, never NOT-NULL-DEFAULT, manual prod
  migration *before* code merge, reader-swap pattern).
- Compliance: REBNY/UCBA PII masking + syndication gates (`.claude/skills/rebny-compliance/SKILL.md`).

---

## 1. Reconciliation — schema comment vs. #409 (important)

The live schema (`prisma/schema.prisma:58-71`) documents a **partial** migration: only
`list_agent_full_name` and `list_office_name` were promoted ("the two display-relevant keys"), with
the comment *"Readers continue to use the `agent_info` JSON column until Phase B."* The #409 audit
shows readers actually consume **8** keys, so **6 more need typed homes before the JSON can be
stripped.**

**This spec explicitly extends the existing partial migration from 2 typed homes to 8.** It does not
treat agent_info as un-started, nor as done — it completes what `schema.prisma:58-69` began.

---

## 2. Column set — 8 typed homes (2 exist, 6 net-new)

| Key (canonical PascalCase) | Typed column | Status | Sensitivity |
|---|---|---|---|
| `ListAgentFullName` | `list_agent_full_name` | ✅ exists | public-safe (name) |
| `ListOfficeName` | `list_office_name` | ✅ exists (`eligibility.ts:300` already reads the typed column, JSON fallback at `:301`) | public-safe (office) |
| `ListAgentEmail` | `list_agent_email` | ➕ net-new | **PRIVATE / INTERNAL** |
| `ListAgentDirectPhone` | `list_agent_direct_phone` | ➕ net-new | **PRIVATE / INTERNAL** |
| `ListOfficeMlsId` | `list_office_mls_id` | ➕ net-new | syndication gate |
| `ListAgentMlsId` | `list_agent_mls_id` | ➕ net-new | syndication gate |
| `CoListOfficeMlsId` | `co_list_office_mls_id` | ➕ net-new | syndication gate |
| `CoListAgentMlsId` | `co_list_agent_mls_id` | ➕ net-new | syndication gate |

All 6 net-new columns are `String?` (nullable, **no NOT-NULL DEFAULT**, NEON.md §4). The migration that
adds them is the only DDL; it runs manually on prod **before** any code merge (NEON.md §5).

**Dual write-shape:** most writers use PascalCase keys; `app/api/idx/ensure-listing/route.ts:88-93`
writes a lowercase shape `{name,email,phone,company}`. Both shapes map to the same eight concepts and
are reconciled in exactly one place — the resolver (§3) and the backfill (Phase A).

---

## 3. Architecture — centralized resolver (Option 1, approved)

A single pure function is the seam for the whole migration:

```ts
// lib/listings/agent-info-resolver.ts (new)
interface ResolvedAgentInfo {
  fullName: string | null;          // public-safe
  officeName: string | null;        // public-safe
  agentEmail: string | null;        // PRIVATE
  agentDirectPhone: string | null;  // PRIVATE
  officeMlsId: string | null;       // syndication
  agentMlsId: string | null;        // syndication
  coListOfficeMlsId: string | null; // syndication
  coListAgentMlsId: string | null;  // syndication
}
function resolveListingAgentInfo(listing): ResolvedAgentInfo
```

- **Typed-first, JSON-fallback:** each field reads its typed column first, then the `agent_info` JSON
  (handling both PascalCase and the `ensure-listing` lowercase shape). This is the dual-read state for
  Phases A–C; in Phase C the JSON stops being written; the fallback simply stops finding anything new.
- **Every reader migrates to call the resolver** instead of poking `agent_info.*` directly. Flipping
  typed-first → typed-only after Phase D is a one-file change; the dual-read is tested once; and **this
  resolver is the reusable template** for the harder columns.
- The resolver returns a typed object; it does **not** decide exposure — masking/exposure stays in the
  existing compliance DTO layer (§4). The resolver just *sources* values; the DTO *gates* them.

---

## 4. PII boundary — explicit, fail-closed, preserved (compliance-critical)

Promoting `list_agent_email` / `list_agent_direct_phone` to typed columns **must not** change their
exposure. They are **internal/private listing-attribution fields** and are **never public DTO fields by
default.** The migration preserves the existing REBNY/UCBA boundary exactly:

| Surface | `agentEmail` / `agentDirectPhone` | `fullName` / `officeName` | MLS IDs |
|---|---|---|---|
| **Public site** (cards, search, detail, open-houses, agent page, sitemap) | **NEVER** — except the existing **Mallan-exclusive contact card** logic (`assigned-agent.ts`, gated on `isMallanExclusive`), which is the only public place agent direct PII legitimately renders | office/name attribution only (office defaults to `'REBNY RLS'` when absent) | **NEVER** displayed |
| **Buyer/tenant portal** | **MASKED — fail-closed** (`sanitizeForPortal` collapses to `{company}` only) | company/office only | not exposed |
| **CRM / authenticated / internal** | allowed | allowed | allowed (operational) |
| **Syndication** | not casually exposed | per partner rules | used for **eligibility gates only** (`eligibility.ts:130-133`), not casual display |

**Non-negotiable invariants (carried onto the typed columns):**
1. The public DTO (`lib/idx/db-to-public-dto.ts`) and portal mask (`lib/compliance/dto.ts:270-282`)
   continue to expose office/name only; agent email/phone are read by the resolver but **emitted only**
   on the exclusive-contact-card path (`assigned-agent.ts`), gated exactly as today.
2. `sanitizeForPortal` stays fail-closed (`{company}` only). The PII-mask regression tests
   (`lib/compliance/__tests__/portal-dto.test.ts`, `lib/idx/__tests__/c1-classification.test.ts`) must
   pass unchanged across every reader swap.
3. The typed columns having `list_agent_email`/`list_agent_direct_phone` populated does NOT make them
   render — exposure is still decided by the DTO/mask layer, which is unchanged.

---

## 5. Phase plan (2026-04-28 Phases A–D, refreshed)

Each phase is one or more PRs; each is a recoverable checkpoint.

### Phase A — Add columns + dual-write + backfill
- Manual prod migration adds the 6 nullable columns (NEON.md §5, **before** code merge).
- Extend the agent_info **builder** (`lib/idx/trestle-mapper.ts:1087`) and **every writer** to
  **dual-write** typed columns + JSON. Runtime writers: `lib/idx/sync.ts` (×4), `feed-reconcile:381`,
  `reset-sync:137,169`, `ensure-listing:88-93` (lowercase shape), CRM POST (`crm/listings/route.ts:418-425`)
  + PATCH (`[id]/route.ts:386-417`), `lib/listings/exclusive-agent-assignment.ts`,
  `lib/compliance/normalizer.ts`.
- **Ops / import writers (do NOT omit — #409 §2.5; Codex #410).** These tools also write `agent_info`
  (and some already mirror only the 2 existing typed columns), so they must be extended to dual-write
  the 6 net-new columns **or explicitly retired** — otherwise they leave the new typed columns
  unpopulated and break once the JSON is dropped (Phase D): `scripts/backfill-crm-exclusive-cotality-identity.mjs`
  (writes `ListAgentMlsId`/`ListAgentFullName`/`ListAgentEmail`/`ListOfficeName`),
  `scripts/ops/set-exclusive-listing-agent.mjs` + `scripts/ops/repair-exclusive-agent-assignment.mjs`
  (write `ListAgentFullName`/`ListOfficeName`/`ListAgentEmail`/`ListAgentDirectPhone`; already mirror
  the two existing typed columns `list_agent_full_name`/`list_office_name`).
- **`scripts/import-closed-from-trestle.ts:307-313` — currently writes the `agent_info` JSON ONLY**
  (no typed columns), mapping just `ListAgentFullName`, `ListAgentMlsId`, `ListAgentStateLicense`,
  `ListOfficeName`, `ListOfficeMlsId`. It does **NOT** map `ListAgentEmail` or `ListAgentDirectPhone`
  (those are absent from its write — verified). Before Phase C/D it must either be **extended to
  dual-write all eight typed homes where the source row provides the value**, or **explicitly
  retired**. Mapping when extended:
  - `list_agent_full_name` ← `ListAgentFullName` (source present)
  - `list_office_name` ← `ListOfficeName` (source present)
  - `list_agent_email` ← `ListAgentEmail` — **source IS available**: the import already selects it in
    `SELECT_FIELDS` (line 57) and only omits it from the *write*. **Map it when the source value is
    present — do NOT skip it** (otherwise closed imports silently lose agent email once `agent_info`
    is dropped).
  - `list_agent_direct_phone` ← `ListAgentDirectPhone` — **source IS available** (selected at line 57,
    omitted from the current write). Map when present — do NOT skip.
  - `list_office_mls_id` ← `ListOfficeMlsId` (source present)
  - `list_agent_mls_id` ← `ListAgentMlsId` (source present)
  - `co_list_office_mls_id` ← `CoListOfficeMlsId` — only if source exists; **this import does NOT
    select `CoList*`**, so it is genuinely absent here (leave null).
  - `co_list_agent_mls_id` ← `CoListAgentMlsId` — same: not selected by this import, leave null.
- The Phase A audit checklist must enumerate **runtime + ops + import** writers; the Phase C "stop the
  JSON write" gate is not satisfied until all of them are accounted for (extended or retired).
- Backfill existing rows JSON→columns, reconciling both key-shapes.
- **Gate to exit A:** backfill coverage SQL = 0 unpopulated for displayable rows
  (`SELECT count(*) FROM listings WHERE list_office_mls_id IS NULL AND agent_info ? 'ListOfficeMlsId'`,
  per key); ≥1 sync cycle observed dual-writing; `ucba:audit` 0 regressions.

### Phase B — Migrate readers to the resolver
- Add `resolveListingAgentInfo` (typed-first / JSON-fallback). Repoint every reader to it, grouped by
  surface (likely 2 PRs: public+portal+archive, then syndication+CRM): public DTO
  (`db-to-public-dto.ts:414,529-530`); **direct detail-page office attribution**
  (`app/listing/[...slug]/page.tsx:510` reads `dbListing.agent_info` directly; `:614` does
  `agentInfo.ListOfficeName || agentInfo.company || 'Mallan Real Estate Inc.'` — the **public,
  third-party IDX detail-page** brokerage attribution, separate from the exclusive card); exclusive
  card (`assigned-agent.ts:69-72`); open-houses office attribution (`open-houses:370-371`);
  `similar:203`; **portal PII mask** (`compliance/dto.ts:270-282`); **syndication MLS-ID gate**
  (`eligibility.ts:130-133`); archiver (`data-retention:261-262`); CRM grid/forms (`data-loader.js`,
  the 4 form HTML files).
- **Also swap the Prisma `select`/`include` payloads, not just property reads.** Several routes still
  `select: { agent_info: true }` to feed the DTO/portal sanitizers — `app/api/listings/route.ts:360,1231`,
  `app/api/agents/[slug]/listings/route.ts:227`, `app/api/portal/favorites/route.ts:53`,
  `app/api/open-houses/route.ts:293`, `app/api/crm/listings/route.ts:82`,
  `app/api/cron/data-retention/route.ts:211`. After the resolver swap these must select the **typed
  columns** instead. A `select`/`include` referencing `agent_info` AFTER Phase D drops the column is a
  **runtime Prisma error** — so this is a Phase D pre-requisite, not optional.
- **Gate to exit B:** per-reader test proving `resolver(typed) == legacy(JSON)` shape; PII-mask +
  syndication-fail-closed regression tests green; **the direct detail-page office-attribution reader
  (`page.tsx:510,614`) gets its own test + a live public-detail-page probe** (it drives third-party
  listing brokerage attribution — NY DOS §175.25); `rls:validate`/`ucba:audit`/`idx:validate` clean;
  live route probes. **The grep gate covers BOTH (a) direct property reads (`.agent_info`) AND
  (b) Prisma `select`/`include` of `agent_info` AND (c) API response shapes — all must be gone /
  swapped to typed columns** before Phase D (grep proof for each).

### Phase C — Stop writing the JSON
- Remove `agent_info` from every writer payload (typed columns only).
- **Gate to exit C:** ≥24h prod sync clean (`ops:health` last-run), no 500s on agent-info routes,
  resolver returns identical values from typed-only (JSON now stale-but-present).

### Phase D — Drop the column (irreversible, gated)
- Manual prod `ALTER TABLE "listings" DROP COLUMN "agent_info"` + storage reclaim via **online
  copy/rewrite + GC past PITR** (per current NEON.md — **never `VACUUM FULL`** on Neon); schema PR
  merges only after the migration is applied.
- Flip the resolver from typed-first/JSON-fallback to **typed-only** (one-file change).
- **Gate to exit D:** measured Neon billed-bytes before/after; **Maya's explicit approval.** This is the
  only point of no return.

---

## 6. Tests & proof required before each phase

- **A:** migration is nullable-only (no NOT-NULL DEFAULT); dual-write unit test (each writer emits both
  typed + JSON); backfill-coverage SQL = 0 unpopulated.
- **B (per reader):** equality test `resolver(typed) == legacy(JSON)`; **PII-mask regression**
  (`portal-dto.test.ts`, `c1-classification.test.ts`) green — office-only on public, agent PII only on
  exclusive card/CRM; **syndication fail-closed test** (empty MLS-IDs → blocked, invariant I.5); live
  URL probe per surface (proof-first §F — not source-grep for render claims).
- **C:** writer-omits-JSON test; 24h prod observation logged.
- **D:** measured-bytes proof (before/after billed size); rollback rehearsal documented.

---

## 7. Rollback / kill-switch (corrected — no instant env flip)

**Phases A–C are reversible because the JSON remains present and the resolver is dual-read.** The
rollback strategy before Phase D is:
- The `agent_info` JSON is still written (A–B) / still present (C) — no data is lost until Phase D.
- The resolver stays **dual-read** (typed-first, JSON-fallback).
- If a typed column proves wrong in prod, **revert or redeploy** the offending PR; the resolver's JSON
  fallback restores prior behavior. (A code revert/redeploy is the rollback — fast, but it *is* a
  deploy.)

**No instant env-flag flip is claimed.** On Vercel, a normal environment-variable change does **not**
affect the running deployment until a new Production deployment (we confirmed this with the archive
flag — see `docs/operations/archive-flag-runbook-2026-06-17.md` §0/§5). Therefore:
- An "instant runtime kill-switch" is proposed **only** if implemented with a **runtime-readable config
  source** (e.g. a DB config row or Vercel Edge Config) that the resolver reads per request — and that
  mechanism would have to be explicitly specced and tested. It is **out of scope for the pilot** unless
  Maya wants it; the default rollback is JSON-fallback + revert/redeploy.

**Phase D is the only irreversible step** — gated on measured proof + Maya approval; everything before
D is recoverable.

---

## 8. Compliance preservation (must hold across all phases)

- **PII masking** (§4) — office/name on public, agent PII only on the gated exclusive card + CRM,
  portal fail-closed. Regression tests pin this.
- **Syndication MLS-ID gates** — `eligibility.ts` reads the four MLS-ID values for the canonical-ID
  fail-closed gate (invariant I.5). Migrating them to typed columns must keep the gate fail-closed
  (empty → block). Syndication is HELD (CLAUDE.md §C) but the code is live.
- **Archive fields** — `data-retention/route.ts:261-262` writes `list_agent_full_name`/`list_office_name`
  into `listings_archive`; after Phase B it reads them via the resolver (typed columns), preserving the
  archive record (CORRECTED 2026-08-20: this line read “the 6-year NY-DOS archive record” — 19 NYCRR 175.23 is three years, and it enumerates Article 12-A transaction records — it does not reach a mirrored third-party MLS row, or any photo bytes. Evidence: `.cache/closure3/r2-final/legal/19-NYCRR-175.23-VERBATIM.md`. Operative schedule: `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §14 Fail-closed row.).

---

## 9. How this becomes the template for the harder columns

The reusable artifacts produced here apply directly to `compliance`/`features`/`address`/`media`:
1. **Resolver pattern** — a pure typed-first/JSON-fallback function per column, the single migration seam.
2. **4-phase PR cadence + gates** (A add+dual-write+backfill · B migrate readers · C stop write · D drop).
3. **Backfill-coverage SQL check** — `count(*) WHERE <typed> IS NULL AND <json> ? '<key>'` = 0.
4. **Dual-read equality test harness** — `resolver(typed) == legacy(JSON)`.
5. **Rollback doctrine** — JSON-fallback + revert/redeploy; instant kill-switch only via runtime config.
6. **Compliance-preservation checklist** — PII/syndication/archive invariants pinned by regression tests.

Each harder column will need its own Phase-A column-design (e.g. `address` ~11 net-new columns + raw-SQL
filter rewrites; `compliance` syndication sub-objects with no other home) — but the *process* is this one.

---

## 10. Out of scope (explicit)

No code, no schema change, no DB write, no production migration, no JSON strip, no Neon downgrade, no
archive flag, no cleanup. This document is the design only. Implementation is a separate, phased,
Maya-gated effort (the writing-plans step produces the per-phase implementation plan).

---

*References: `docs/audits/legacy-json-dependency-audit-2026-06-18.md` §2.5 · `memory/PLAN-LEGACY-JSON-DROP-2026-04-28.md`
(Phases A–D + §4 agent_info specifics) · `NEON.md` §4/§5 · `prisma/schema.prisma:58-71` ·
`.claude/skills/rebny-compliance/SKILL.md` (PII masking, syndication gates).*
