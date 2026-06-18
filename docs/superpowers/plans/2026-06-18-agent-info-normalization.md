# agent_info Legacy-JSON Normalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `Listing.agent_info` (legacy JSON) onto 8 typed columns and drop the JSON, as the pilot/template for the harder columns (`compliance`/`features`/`address`/`media`).

**Architecture:** Phased reader-swap (NEON.md §4/§5): **A** add 6 nullable columns + dual-write every writer + backfill → **B** introduce one `resolveListingAgentInfo` resolver (typed-first/JSON-fallback) and repoint every reader (property reads + Prisma `select`s) → **C** stop writing the JSON → **D** (gated, irreversible) drop the column + reclaim. Each phase is one or more PRs; the JSON stays present and the resolver dual-reads until Phase D, so A–C are revert/redeploy-reversible.

**Tech Stack:** Next.js 16 App Router · Prisma + Neon Postgres · Jest (`tests/runtime/jest.config.js`) · manual prod migrations (NEON.md §5).

**Source spec:** `docs/superpowers/specs/2026-06-18-agent-info-normalization-design.md` (#410, `8b73167a`).
**Dependency map:** `docs/audits/legacy-json-dependency-audit-2026-06-18.md` §2.5.

> ⚠️ **GATING:** Each phase needs Maya's explicit go before execution. Phase A's prod migration runs
> **before** its code merges (NEON.md §5). Phase D is irreversible and needs measured-bytes proof +
> Maya approval. Run the §G compliance chain before every commit that touches a compliance surface.

---

## File Structure (decomposition)

| File | Phase | Responsibility |
|---|---|---|
| `prisma/schema.prisma` (Listing model) | A, D | +6 nullable columns (A); −`agent_info` (D) |
| `prisma/migrations/<ts>_add_agent_info_typed_columns/migration.sql` | A | additive nullable DDL (manual prod-first) |
| `lib/idx/trestle-mapper.ts` (~1087 builder) | A | source of typed values from Trestle row |
| `lib/idx/sync.ts` · `feed-reconcile` · `reset-sync` · `ensure-listing` · CRM POST/PATCH · `exclusive-agent-assignment.ts` · `normalizer.ts` | A | dual-write typed + JSON |
| `scripts/import-closed-from-trestle.ts` · `scripts/ops/set-exclusive-listing-agent.mjs` · `scripts/ops/repair-exclusive-agent-assignment.mjs` · `scripts/backfill-crm-exclusive-cotality-identity.mjs` | A | ops/import writers: extend to typed or retire |
| `scripts/backfill-agent-info-typed-columns.ts` (new) | A | one-time JSON→columns backfill (both key-shapes) |
| `lib/listings/agent-info-resolver.ts` (new) | B | `resolveListingAgentInfo` — typed-first/JSON-fallback, the migration seam + template |
| All readers (see Phase B task list) | B | call the resolver; swap Prisma `agent_info:true` selects to typed columns |
| `tests/runtime/agent-info-resolver.test.ts` (new) + per-reader tests | B | resolver dual-read equality + PII/syndication regression |

---

## PHASE A — Add columns + dual-write + backfill

> One PR. **The migration is applied to prod manually BEFORE this PR merges** (NEON.md §5). Columns are
> nullable; dual-write is additive (JSON still written); fully reversible by reverting the PR.

### Task A1: Additive nullable migration (manual prod-first)

**Files:**
- Create: `prisma/migrations/<timestamp>_add_agent_info_typed_columns/migration.sql`
- Modify: `prisma/schema.prisma` (Listing model, after `list_office_name` at ~line 71)

- [ ] **Step 1: Write the migration SQL** (nullable, NO `NOT NULL DEFAULT` — NEON.md §4)

```sql
-- migration.sql
ALTER TABLE "listings" ADD COLUMN "list_agent_email"       TEXT;
ALTER TABLE "listings" ADD COLUMN "list_agent_direct_phone" TEXT;
ALTER TABLE "listings" ADD COLUMN "list_office_mls_id"     TEXT;
ALTER TABLE "listings" ADD COLUMN "list_agent_mls_id"      TEXT;
ALTER TABLE "listings" ADD COLUMN "co_list_office_mls_id"  TEXT;
ALTER TABLE "listings" ADD COLUMN "co_list_agent_mls_id"   TEXT;
```

- [ ] **Step 2: Add the columns to `schema.prisma`** (match the existing `list_*` block, ~line 71)

```prisma
  list_agent_full_name   String? @map("list_agent_full_name")
  list_office_name       String? @map("list_office_name")
  list_agent_email       String? @map("list_agent_email")          // PRIVATE
  list_agent_direct_phone String? @map("list_agent_direct_phone")  // PRIVATE
  list_office_mls_id     String? @map("list_office_mls_id")
  list_agent_mls_id      String? @map("list_agent_mls_id")
  co_list_office_mls_id  String? @map("co_list_office_mls_id")
  co_list_agent_mls_id   String? @map("co_list_agent_mls_id")
```

- [ ] **Step 3: GATE — apply to prod manually first** (operator; NEON.md §5). Run the migration on
  `hidden-mountain`/`cold-waterfall` prod, confirm `\d listings` shows the 6 columns, THEN merge code.
  Expected: 6 new nullable columns present in prod before the PR merges.

- [ ] **Step 4: Run `npx prisma generate`; type-check**

Run: `npm run type-check`
Expected: 0 errors (the new optional fields are additive).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(agent_info): add 6 nullable typed columns (Phase A migration, applied to prod first)"
```

### Task A2: Dual-write the typed values from the Trestle builder

**Files:**
- Modify: `lib/idx/trestle-mapper.ts` (the `agent_info` builder ~1087)
- Test: `lib/compliance/__tests__/agent-info-dual-write.test.ts` (create)

- [ ] **Step 1: Write the failing test** — the mapper output carries typed values alongside the JSON

```ts
import { mapTrestleToPrisma } from "@/lib/idx/trestle-mapper";
test("mapper emits typed agent columns alongside agent_info JSON", () => {
  const out = mapTrestleToPrisma({
    ListingId: "RLS1", StandardStatus: "Active",
    ListAgentFullName: "Jane Doe", ListOfficeName: "Acme Realty",
    ListAgentEmail: "jane@acme.com", ListAgentDirectPhone: "212-555-0100",
    ListOfficeMlsId: "OFF1", ListAgentMlsId: "AG1",
    CoListOfficeMlsId: "OFF2", CoListAgentMlsId: "AG2",
  } as any);
  expect(out.list_agent_full_name).toBe("Jane Doe");
  expect(out.list_office_name).toBe("Acme Realty");
  expect(out.list_agent_email).toBe("jane@acme.com");
  expect(out.list_agent_direct_phone).toBe("212-555-0100");
  expect(out.list_office_mls_id).toBe("OFF1");
  expect(out.list_agent_mls_id).toBe("AG1");
  expect(out.co_list_office_mls_id).toBe("OFF2");
  expect(out.co_list_agent_mls_id).toBe("AG2");
  // JSON still emitted (dual-write)
  expect((out.agent_info as any).ListAgentFullName).toBe("Jane Doe");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config lib/compliance/jest.config.js agent-info-dual-write`
Expected: FAIL — typed fields `undefined`.

- [ ] **Step 3: Implement** — in `trestle-mapper.ts`, where `agent_info` is assembled (~1087) and the
  Prisma object returned (~1169), add the 8 typed fields from the same raw values:

```ts
// alongside the existing agent_info builder
const ai = pick(raw, [/* existing keys */]);
// typed columns (canonical PascalCase source)
const typedAgent = {
  list_agent_full_name: str(raw.ListAgentFullName) || null,
  list_office_name: str(raw.ListOfficeName) || null,
  list_agent_email: str(raw.ListAgentEmail) || null,
  list_agent_direct_phone: str(raw.ListAgentDirectPhone) || null,
  list_office_mls_id: str(raw.ListOfficeMlsId) || null,
  list_agent_mls_id: str(raw.ListAgentMlsId) || null,
  co_list_office_mls_id: str(raw.CoListOfficeMlsId) || null,
  co_list_agent_mls_id: str(raw.CoListAgentMlsId) || null,
};
return { /* …existing fields…, */ agent_info: ai, ...typedAgent };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config lib/compliance/jest.config.js agent-info-dual-write`
Expected: PASS.

- [ ] **Step 5: Compliance chain + commit**

```bash
npm run type-check && npm run ucba:audit && npm run idx:validate
git add lib/idx/trestle-mapper.ts lib/compliance/__tests__/agent-info-dual-write.test.ts
git commit -m "feat(agent_info): dual-write typed columns from Trestle mapper (Phase A)"
```

### Task A3: Confirm sync/feed-reconcile/reset-sync persist the typed columns

**Files:** Modify (only if they don't already pass `...mapped`): `lib/idx/sync.ts` (`:300,334,1137,1165`), `app/api/cron/feed-reconcile/route.ts:381`, `app/api/crm/listings/reset-sync/route.ts:137,169`.

- [ ] **Step 1:** Verify each upsert spreads the full mapper output. If they already `data: { ...mapped }`, the typed columns flow automatically — add a test asserting `prisma.listing.update` receives `list_office_mls_id`. If they cherry-pick fields, add the 8 typed columns to the payload explicitly.
- [ ] **Step 2:** Run `npx jest --config tests/runtime/jest.config.js` for the sync/reset-sync tests; Expected PASS.
- [ ] **Step 3: Commit** `git commit -m "feat(agent_info): ensure sync/feed-reconcile/reset-sync persist typed columns (Phase A)"`

### Task A4: Dual-write the CRM + exclusive + ensure-listing writers (incl. lowercase shape)

**Files:** Modify `app/api/idx/ensure-listing/route.ts:88-93` (lowercase `{name,email,phone,company}`), `app/api/crm/listings/route.ts:418-425` (POST), `app/api/crm/listings/[id]/route.ts:386-417` (PATCH), `lib/listings/exclusive-agent-assignment.ts:152-168`, `lib/compliance/normalizer.ts`.

- [ ] **Step 1: Failing test** — `ensure-listing` lowercase shape maps to typed columns

```ts
test("ensure-listing maps lowercase agent shape to typed columns", async () => {
  // POST body: { agent_name, agent_email, agent_phone, company }
  // assert the persisted record has list_agent_full_name/list_agent_email/list_agent_direct_phone/list_office_name
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** — in each writer, set the typed columns from whatever shape it has:
  `list_agent_full_name: body.agent_name || ai.ListAgentFullName || null`, etc. The PATCH/exclusive
  writers preserve the existing merge semantics; just add the typed columns to the `update`/`create` data.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Compliance chain + commit** `git commit -m "feat(agent_info): dual-write typed columns from CRM/exclusive/ensure-listing writers (Phase A)"`

### Task A5: Extend (or retire) the ops/import writers

**Files:** `scripts/import-closed-from-trestle.ts:307-313`, `scripts/ops/set-exclusive-listing-agent.mjs`, `scripts/ops/repair-exclusive-agent-assignment.mjs`, `scripts/backfill-crm-exclusive-cotality-identity.mjs`.

- [ ] **Step 1:** For `import-closed-from-trestle.ts`, add the typed columns to the create payload,
  mapping the **already-selected** source values (`SELECT_FIELDS:57` includes `ListAgentEmail`,
  `ListAgentDirectPhone`):

```ts
list_agent_full_name: String(r.ListAgentFullName || "") || null,
list_office_name: String(r.ListOfficeName || "") || null,
list_agent_email: r.ListAgentEmail ? String(r.ListAgentEmail) : null,        // source-available, map it
list_agent_direct_phone: r.ListAgentDirectPhone ? String(r.ListAgentDirectPhone) : null,
list_office_mls_id: r.ListOfficeMlsId ? String(r.ListOfficeMlsId) : null,
list_agent_mls_id: r.ListAgentMlsId ? String(r.ListAgentMlsId) : null,
co_list_office_mls_id: null,  // CoList* NOT selected by this import
co_list_agent_mls_id: null,
```

- [ ] **Step 2:** For the three `scripts/ops/*` + `backfill-crm-exclusive-cotality-identity.mjs`,
  extend each `update`/`set` to also write the typed columns they already source (they write
  ListAgentFullName/ListOfficeName/ListAgentEmail/ListAgentDirectPhone). Where a script is purely a
  one-off no longer needed, mark it retired with a header comment + remove from any cron/runbook.
- [ ] **Step 3: Commit** `git commit -m "feat(agent_info): extend ops/import writers to dual-write typed columns (Phase A)"`

### Task A6: One-time backfill (JSON→columns, both key-shapes)

**Files:** Create `scripts/backfill-agent-info-typed-columns.ts` (operator-run; read-mostly + targeted UPDATE).

- [ ] **Step 1: Write the backfill** — for rows where a typed column is NULL but the JSON has the key,
  copy it, reconciling PascalCase and the `ensure-listing` lowercase shape:

```ts
// pseudocode shape — operator runs with --execute; default dry-run
// UPDATE listings SET list_office_mls_id = agent_info->>'ListOfficeMlsId'
//   WHERE list_office_mls_id IS NULL AND agent_info ? 'ListOfficeMlsId';
// …repeat per key; for the lowercase shape, COALESCE(agent_info->>'ListAgentFullName', agent_info->>'name'), etc.
```

- [ ] **Step 2: Dry-run** on prod (read-only counts), capture per-key unpopulated counts.
- [ ] **Step 3: GATE — Maya approves the `--execute` run.** Operator runs it.
- [ ] **Step 4: Verify coverage = 0 unpopulated** for displayable rows, per key:

Run (operator): `SELECT count(*) FROM listings WHERE list_office_mls_id IS NULL AND agent_info ? 'ListOfficeMlsId';`
Expected: `0` (repeat per key).

- [ ] **Step 5: Commit the script** `git commit -m "feat(agent_info): one-time JSON→typed-column backfill script (Phase A)"`

### Phase A exit gate
- [ ] Backfill coverage SQL = 0 unpopulated (per key) on displayable rows.
- [ ] ≥1 sync cycle observed dual-writing (typed + JSON).
- [ ] `npm run ucba:audit` 0 regressions; `npm run idx:validate` 0 critical; `npm run type-check` 0.
- [ ] **Maya sign-off to proceed to Phase B.**

---

## PHASE B — Resolver + repoint every reader

> 1–2 PRs (group by surface: public+portal+archive, then syndication+CRM). The resolver is the seam.

### Task B1: The `resolveListingAgentInfo` resolver (typed-first/JSON-fallback)

**Files:** Create `lib/listings/agent-info-resolver.ts`; Test `tests/runtime/agent-info-resolver.test.ts`.

- [ ] **Step 1: Failing test** — typed wins; JSON fallback (both shapes); never reads `updated_at`-style noise

```ts
import { resolveListingAgentInfo } from "@/lib/listings/agent-info-resolver";
test("typed columns win", () => {
  const r = resolveListingAgentInfo({
    list_office_name: "Typed Office", list_office_mls_id: "T1",
    agent_info: { ListOfficeName: "Json Office", ListOfficeMlsId: "J1" },
  } as any);
  expect(r.officeName).toBe("Typed Office");
  expect(r.officeMlsId).toBe("T1");
});
test("JSON fallback when typed null — PascalCase and lowercase", () => {
  expect(resolveListingAgentInfo({ agent_info: { ListAgentFullName: "Jane" } } as any).fullName).toBe("Jane");
  expect(resolveListingAgentInfo({ agent_info: { name: "Bob" } } as any).fullName).toBe("Bob");
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the pure resolver returning the `ResolvedAgentInfo` shape from the spec §3,
  reading each typed column first then `agent_info` (PascalCase, then lowercase `{name,email,phone,company}`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(agent_info): add resolveListingAgentInfo resolver (Phase B seam)"`

### Task B2..Bn: Repoint each reader to the resolver (one task per reader; pattern below)

For **each** reader: (1) write/adjust a test asserting the rendered/returned value equals the legacy
JSON-derived value; (2) replace the direct `agent_info.*` read with `resolveListingAgentInfo(listing).<field>`;
(3) where the route uses a Prisma `select: { agent_info: true }`, **also** swap it to select the 8 typed
columns; (4) run the surface's tests + a live probe. Readers (each its own task + checkbox):

- [ ] **B2 — public DTO** `lib/idx/db-to-public-dto.ts:414,529-530` (+ select at `app/api/listings/route.ts:360,1231`). Gate: card/detail office attribution unchanged; live probe.
- [ ] **B3 — direct detail page** `app/listing/[...slug]/page.tsx:510,614` (`listOfficeName` public third-party attribution). Gate: **own test + live public-detail-page probe** (NY DOS §175.25).
- [ ] **B4 — exclusive contact card** `lib/listings/assigned-agent.ts:69-72` (agent name/email/phone — PII, gated on `isMallanExclusive`). Gate: exclusive card renders agent PII only when exclusive; IDX rows show none.
- [ ] **B5 — open-houses office attribution** `app/api/open-houses/route.ts:370-371` (+ select `:293`). Gate: office-only on public OH.
- [ ] **B6 — similar listings** `app/api/listings/similar/route.ts:203`.
- [ ] **B7 — portal PII mask** `lib/compliance/dto.ts:270-282` (+ select `app/api/portal/favorites/route.ts:53`). Gate: `sanitizeForPortal` still emits `{company}` only — **`portal-dto.test.ts` + `c1-classification.test.ts` green**.
- [ ] **B8 — syndication MLS-ID gate** `lib/syndication/eligibility.ts:130-133` (and consolidate the office-name dual-read at `:300-301`). Gate: **fail-closed test** — empty MLS-IDs → blocked (invariant I.5).
- [ ] **B9 — archiver** `app/api/cron/data-retention/route.ts:261-262` (+ select `:211`). Gate: `listings_archive` rows still carry `list_agent_full_name`/`list_office_name`.
- [ ] **B10 — CRM grid + forms** `public/crm/js/core/data-loader.js:220,254-257` + the 4 form HTML (`SALE-FORM-*`, `RENTAL-FORM-*`), + select `app/api/crm/listings/route.ts:82`. Gate: `crm:test` 172/172.

### Phase B exit gate
- [ ] Per-reader equality test green; PII-mask + syndication-fail-closed regression green.
- [ ] **Grep proof — ALL gone/swapped:** (a) `grep -rn "\.agent_info" app lib public/crm` (direct reads), (b) `grep -rn "agent_info: true" app lib` (Prisma selects), (c) API response shapes. None remain except the resolver + writers.
- [ ] `rls:validate` / `ucba:audit` / `idx:validate` / `crm:test` clean; live probes per surface.
- [ ] **Maya sign-off to proceed to Phase C.**

---

## PHASE C — Stop writing the JSON

> One PR. Removes `agent_info` from every writer payload (typed columns only). JSON now stale-but-present.

- [ ] **C1:** Failing test — the Trestle mapper/sync update payload **omits** `agent_info`.
- [ ] **C2:** Run → FAIL.
- [ ] **C3:** Remove `agent_info` from every writer found in Phase A (runtime + ops/import); typed columns remain.
- [ ] **C4:** Run → PASS; `type-check`/`ucba:audit`/`idx:validate` clean.
- [ ] **C5: Commit** `git commit -m "feat(agent_info): stop writing agent_info JSON — typed columns only (Phase C)"`
- [ ] **Phase C exit gate:** ≥24h prod sync clean (`ops:health` last-run, no 500s on agent-info routes); resolver returns identical values from typed-only (since JSON no longer updated). **Maya sign-off for Phase D.**

---

## PHASE D — Drop the column (gated, irreversible)

> One PR. **Point of no return** — requires measured-bytes proof + Maya approval. Reclaim via online
> copy/rewrite + GC past PITR (**never `VACUUM FULL`** on Neon — current NEON.md).

- [ ] **D1:** Measure prod billed/synthetic bytes BEFORE.
- [ ] **D2: GATE — Maya explicit approval to drop.**
- [ ] **D3:** Operator manual prod migration: `ALTER TABLE "listings" DROP COLUMN "agent_info";` then online reclaim per NEON.md.
- [ ] **D4:** Remove `agent_info` from `prisma/schema.prisma`; flip the resolver to **typed-only** (drop the JSON-fallback branch). Code merges only AFTER the prod migration is applied.
- [ ] **D5:** Measure bytes AFTER; record before/after in `compliance/UPDATES.md`.
- [ ] **D6: Commit** `git commit -m "feat(agent_info): drop agent_info JSON column + reclaim (Phase D)"`

---

## How this becomes the template (for `compliance`/`features`/`address`/`media`)

Reusable artifacts produced here: (1) the **resolver pattern** (`lib/listings/agent-info-resolver.ts` →
copy per column), (2) the **A–D PR cadence + gates**, (3) the **backfill-coverage SQL check**, (4) the
**dual-read equality test harness**, (5) the **grep gate** (property reads + Prisma selects + response
shapes), (6) the **compliance-preservation checklist**. Each harder column re-runs Phase A's
column-design for its own fields (e.g. `address` ~11 columns + raw-SQL filter rewrites) but follows this
exact process.

---

## Self-Review (against the spec)

- **Spec coverage:** §2 column set → A1; §3 resolver → B1; §4 PII boundary → B4/B7 gates; §5 Phases A–D →
  Phase A–D tasks; §5 ops/import writers → A5; §6 tests/proof → per-task gates; §7 rollback → "JSON
  present + resolver dual-read + revert/redeploy; Phase D only irreversible" (stated in Architecture +
  Phase D); §8 compliance preservation → B7/B8/B9 gates; §9 template → final section. ✅ all mapped.
- **Placeholder scan:** code/commands present per task; the per-reader tasks (B2–B10) share an explicit
  stated pattern with concrete file:line targets and per-surface gates (not "similar to Task N").
- **Type consistency:** `resolveListingAgentInfo` returns the spec §3 `ResolvedAgentInfo` shape; field
  names (`officeName`/`officeMlsId`/`agentEmail`/…) used consistently in B1 + B2–B10.

---

*Plan/spec only. No implementation code, no schema change, no DB write, no production migration, no JSON
strip, no Neon downgrade, no archive flag. Each phase is separately Maya-gated; Phase A's prod migration
runs before its code merges; Phase D is irreversible.*
