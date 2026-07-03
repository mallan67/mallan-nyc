# Royal-dawn → cold-waterfall reconciliation plan (REPORT ONLY / CONDITIONAL) — 2026-06-02

> **Status: REPORT ONLY. Nothing executed.** This plan activates **only if** the query pack
> (`docs/royal-dawn-console-query-pack-2026-06-02.sql`) shows compliance/business rows written to
> royal-dawn **after 2026-06-01 06:30Z**. If those counts are all **0**, skip this entirely — go
> straight to the guarded re-point (host-guard patch + Step 6/7 of Maya's plan).
> Execution is a HELD write operation touching `leads`/`audit_events` (compliance tables) and
> requires Maya approval + the §G compliance gate.

## Decision gate (fill in from the query pack)

| Table | rows after 06:30Z (BLOCK 3b/4) | Re-derivable? | Action |
|---|---|---|---|
| `audit_events` | `____` | No (retention) | **Replay** if > 0 |
| `leads` | `____` | No (business/TCPA) | **Replay** if > 0 |
| `inquiries` | `____` | No | **Replay** if > 0 |
| `seller_leads` | `____` | No | **Replay** if > 0 |
| consent table(s) | `____` | No (TCPA/SHIELD) | **Replay** if > 0 |
| `documents` / `document_signatures` | `____` | No (legal) | **Replay** if > 0 |
| `offers` / `deals` | `____` | No (transaction) | **Replay** if > 0 |
| `sessions` / `mfa_sessions` | `____` | Partially (re-login) | Usually **skip** (ephemeral) |
| `listings` / `listing_media` / `listing_search_projection` | `____` | **Yes (Trestle)** | **Do NOT replay** — next IDX sync self-heals after cutover |

**Verdict rule:** any non-zero in a "Replay" row ⇒ reconciliation required **before** cutover.

## Method (per replayed table) — export → transform → load → verify

### Principle
Royal-dawn is an **older branch** that diverged before the schema gained `agents.trestle_mls_id`
and the CRM exclusives, then took ~26 h of production writes. Both branches descend from a common
ancestor, so **serial PKs almost certainly collide**. Therefore: **do not preserve source PKs** —
insert with fresh PKs on cold-waterfall and remap foreign keys. Preserve every other column,
especially original `created_at`/consent flags/timestamps (compliance integrity).

### Steps
1. **Export (read-only, from royal-dawn):** for each replay table, `COPY (SELECT * FROM <t> WHERE
   created_at > '2026-06-01 06:30:00+00') TO STDOUT WITH (FORMAT csv, HEADER)` via Console export or
   `pg_dump --data-only --table=<t>` against royal-dawn. Capture row counts + a content checksum
   (`md5(string_agg(...))`) per table for later verification.
2. **Stage on cold-waterfall:** load into a temp schema `recon_royaldawn.<t>` (CREATE TABLE … LIKE
   or import to scratch). No touching of live tables yet.
3. **Dedupe vs cold-waterfall:** for each table, identify a natural/business key (e.g. `leads`:
   email+created_at; `audit_events`: actor+action+created_at; `documents`: hash). Drop staged rows
   that already exist on cold-waterfall (none expected for the Jun-1→2 window, but verify).
4. **FK remap + insert:** insert staged rows into live tables letting cold-waterfall's sequences
   assign new PKs; build an old→new id map per table; rewrite child FKs (e.g. `lead_parties.lead_id`,
   `document_signatures.document_id`, `offers.deal_id`) using the map. Order inserts parent→child.
5. **Idempotency:** wrap in a transaction; make the script re-runnable (skip rows already inserted by
   a recon marker column or by the dedupe key). Follow the `scripts/phase1-run.js` pattern
   (`--verify-only` / `--dry-run` / `--execute`, pre-state capture) per NEON.md §6.
6. **Verify:**
   - cold-waterfall post-count(table) == pre-count + replayed_count (per table).
   - content checksum of replayed rows matches the export checksum (minus remapped id columns).
   - spot-check the newest 5 `leads`/`audit_events` render/appear correctly.
7. **Compliance gate (mandatory before execute):** `npm run rls:validate`, `npm run compliance-check`,
   `npm run ucba:audit`, `npm run idx:validate`, invoke `rebny-compliance` skill (CLAUDE.md §G).
   Preserve original consent state + timestamps exactly; no fabricated values.

## Stop / rollback conditions
- Dedupe finds unexpected overlap (cold-waterfall already has Jun-1→2 rows) → STOP, re-investigate
  (would mean prod was dual-writing — changes the whole picture).
- Checksum mismatch after load → roll back the transaction; do not cut over.
- Any ambiguity in consent/TCPA fields → STOP (fail-closed, CLAUDE.md §E).
- **Safety net:** Neon PITR (7-day Launch) covers the whole window on both branches; take an explicit
  branch snapshot of royal-dawn before export so the source is frozen.

## Sequencing relative to cutover
1. Run query pack → size the set.
2. If non-zero: snapshot royal-dawn → export → stage → dedupe → (approval) → load → verify.
3. **Then** apply the rotate-db-keys host-guard patch (`docs/rotate-db-keys-host-guard-patch-2026-06-02.md`).
4. **Then** guarded re-point to cold-waterfall + redeploy + the §7 verification probes.
5. Lock down (docs, mark royal-dawn stale, pin endpoint/branch).

> Note: after cutover, the IDX/media sync resumes against cold-waterfall and self-heals the
> ~26 h listings/media gap — that data is **not** part of this replay.

*Report only. No file/DB edited. Author: Claude (Opus 4.8), 2026-06-02.*
