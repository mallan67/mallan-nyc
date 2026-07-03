# SELLER-002 — `listing_events` migration plan (DRAFT — Maya approval required to APPLY)

> **Registry:** `docs/PLATFORM-ISSUE-REGISTRY.md` SELLER-002 · **Directed by:** Maya 2026-07-03
> **Status:** Migration **STAGED, NOT APPLIED**. Per the SELLER-002 registry row: *"Migration plan
> APPROVED TO DRAFT — migration must NOT run until Maya reviews it."* Nothing in this PR, in CI,
> or in the Vercel build runs it. Schema migrations are Maya-held (CLAUDE.md §C).
> **SQL:** `prisma/migrations-staged/20260703000000_add_listing_events/migration.sql`
> **Rollback:** `prisma/migrations-staged/20260703000000_add_listing_events/ROLLBACK.sql`

---

## 1. What the table is

`listing_events` — anonymous first-party public engagement events for the seller intelligence
track (SELLER-001 Phase 2). One row per event; 11 allowlisted `event_type` values
(`lib/tracking/listing-events.ts`): `listing_view` · `photo_gallery_open` · `floorplan_click` ·
`virtual_tour_click` · `video_click` · `contact_click` · `showing_request_click` · `share_click` ·
`save_click` · `email_click` · `external_link_click`.

Privacy by construction (Maya spec + NY SHIELD hygiene):
- `visitor_id` / `session_id` are opaque client-minted UUIDs (localStorage/sessionStorage) —
  **not** fingerprints, **not** PII;
- **no IP column exists** (raw IP is used transiently for rate limiting only);
- `referrer` stores **host only** (never path/query);
- `metadata` is PII-stripped server-side before write (`sanitizeEventMetadata`);
- `lead_id` / `user_id` / `agent_id` are for FUTURE server-side self-identified linkage only —
  the public beacon **ignores** client-supplied identity claims, and owner-facing reports must
  never render them (SELLER-001 truth rule 2: aggregate patterns only).

## 2. Schema-staging approach chosen (and why)

**Chosen: Prisma model INCLUDED in `prisma/schema.prisma` now + SQL staged OUTSIDE
`prisma/migrations/`** (in `prisma/migrations-staged/`). Reasons, verified against this repo:

1. **CI stays green:** `.github/workflows/pr-check.yml` runs `npx prisma validate` →
   `npx prisma generate` → `npx prisma db push` against a **fresh ephemeral CI Postgres** —
   `db push` CREATES `listing_events` in CI, so Jest/type-check/build all see a real table.
   No CI step diffs the schema against production.
2. **Runtime is safe pre-migration:** `prisma generate` never touches the DB; a PrismaClient
   model without a backing table fails **only at query time**. The ONLY query path
   (`app/api/track/listing-event/route.ts`) is fail-closed behind `LISTING_EVENTS_ENABLED`
   (absent → 204 no-op, zero DB calls), and even a premature flag-on just logs and returns 204.
3. **`prisma/migrations/` is excluded deliberately:** anything there is picked up by the next
   `prisma migrate deploy` — which would violate the "Maya applies manually, on her decision"
   hold. `migrations-staged/` is inert to every Prisma command.
4. Precedent note: the S1 compliance plan (`docs/superpowers/plans/2026-06-24-s1-compliance-migration-PR-plan.md`)
   avoided schema change entirely; the earlier `email_opt_out` incident (NEON.md §3 Trap #4)
   reverted schema-dependent code that had **ungated** readers. SELLER-002 differs from both:
   it needs a new table, and its single reader is flag-gated no-op by default — the failure
   mode that burned 2026-04-19 (code depending on an unapplied migration) cannot occur here.

## 3. Exact SQL

See `prisma/migrations-staged/20260703000000_add_listing_events/migration.sql` (CREATE TABLE +
2 FKs + 3 indexes) and `ROLLBACK.sql` (`DROP TABLE IF EXISTS "listing_events";`).

NEON.md compliance notes:
- **New empty table** → no contention; plain `CREATE INDEX` is the sanctioned pattern
  (NEON.md §4 good patterns); `CONCURRENTLY` not required (that rule targets tables >10K rows).
- **FKs declare explicit ON DELETE** (`CASCADE` for listing, `SET NULL` for lead) — NEON.md
  forbidden-pattern rule satisfied.
- **No build-time DDL:** nothing added to `vercel.json` buildCommand; the build still does
  `prisma generate` only (NEON.md §1).
- **Window:** apply in the **3–5 AM ET window** (NEON.md §4 — the FK takes a brief
  `SHARE ROW EXCLUSIVE` lock on `listings` for validation; off-hours keeps that invisible).
- **Canonical host only:** `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` / branch
  `main`. NEVER `morning-bread` / `royal-dawn` (AGENT STOP box, NEON.md).
- **Migration-history hygiene (Trap #2):** prod has known drift from historical `db push`.
  Two clean apply paths are given in §6; both end with `_prisma_migrations` consistent or the
  change explicitly recorded as an out-of-band DDL in this doc.

## 4. Size / growth estimate

Assumptions stated explicitly (no live-traffic measurement exists yet for these events — that
is the point of the feature):

- **Bytes/row:** heap tuple ≈ 24 B header + ~180–260 B data (two 36-char UUIDs, short text
  enums, mostly-NULL utm/geo/metadata) ≈ **~250 B/row heap**; PK + 3 indexes add ≈ **~150–200
  B/row** → **~400–450 B/row all-in**.
- **Rows/day:** the public site currently serves a single brokerage's traffic. At an assumed
  1,000 listing-page sessions/day × ~4 events/session (view + a gallery/tab/CTA mix) =
  **~4,000 rows/day ≈ 120K rows/month ≈ ~50 MB/month all-in** at the high end of the byte
  estimate. A 10× traffic assumption (campaign bursts, 40K events/day) → ~500 MB/month —
  still far under the 10 GB Launch cap but **worth a monthly `ops:health` glance**.
- **Context vs OPS-010A/DB-growth watch:** unlike listings churn, `listing_events` is
  append-only with no JSON bloat (metadata is capped at 10 scalar keys / 200 chars) and no
  update churn → no dead-tuple pressure. Retention: SELLER-001 spec proposes aggregate-then-
  prune after 12 months (SHIELD alignment) — decided at a later phase; a simple
  `DELETE FROM listing_events WHERE created_at < now() - interval '12 months'` bounded batch
  is sufficient when Maya approves it.
- **Rate ceiling:** the capture route is limited to 120 events/min/IP, silently drops
  oversized payloads (>4 KB), and only accepts the 11 enum values — a hostile client cannot
  inflate the table faster than ~172K rows/day/IP even at the theoretical maximum.

## 5. Rollback

1. Unset (or set ≠ `"true"`) `LISTING_EVENTS_ENABLED` — capture instantly reverts to 204 no-op.
2. `ROLLBACK.sql` → `DROP TABLE IF EXISTS "listing_events";` — nothing references the table;
   the Prisma model can stay in schema (harmless — reader is flag-gated) or be reverted with
   the code PR.

## 6. Apply checklist (Maya — manual, NOT in any pipeline)

1. `npm run ops:health` → confirm headroom (storage <70% of 10 GB; compute <240 CU-hr).
2. Window: 3–5 AM ET. Target: canonical `DATABASE_URL` (cold-waterfall). Verify host in the
   connection string BEFORE running anything.
3. Apply — either path:
   - **Path A (migration history, preferred):** move the folder
     `prisma/migrations-staged/20260703000000_add_listing_events/` →
     `prisma/migrations/20260703000000_add_listing_events/` (keep `migration.sql` name;
     ROLLBACK.sql is ignored by Prisma), then
     `DATABASE_URL=<prod> npx prisma migrate deploy` and
     `DATABASE_URL=<prod> npx prisma migrate status` → expect "up to date".
     If `migrate deploy` balks at pre-existing drift (Trap #2), fall back to Path B.
   - **Path B (direct SQL + resolve):** run `migration.sql` via psql/Neon SQL editor, verify
     (step 4), then record it:
     `npx prisma migrate resolve --applied 20260703000000_add_listing_events` (after moving
     the folder as in Path A) — or note the apply date here as an out-of-band DDL record.
4. Verify: `SELECT count(*) FROM listing_events;` → 0; `\d listing_events` shows 3 indexes +
   2 FKs.
5. Set `LISTING_EVENTS_ENABLED=true` on Vercel Production (Maya-held env change), redeploy.
6. Prove capture end-to-end: open a listing page in a fresh browser session → within a minute
   `SELECT event_type, source, device_type, city FROM listing_events ORDER BY id DESC LIMIT 5;`
   shows the `listing_view` row (and gallery/CTA events after clicking). Confirm the row has
   NO name/email/IP anywhere.
7. If anything is off: unset the flag (instant no-op), investigate, `ROLLBACK.sql` if needed.

## 7. Out of scope here (later SELLER-002+ steps)

- `lib/seller-report` aggregation of these events — PR #472 (SELLER-001 Phase 1) had not
  merged to `main` when this branch was cut (`32884e22` not an ancestor of `origin/main`
  at branch time); wiring `listing_events` into `build-report.ts` happens AFTER both merge
  (TODO recorded in PR body).
- Campaign links (`listing_campaign_links`), external presence tables, `/l/[slug]` redirects,
  owner portal/report surfaces — separate Maya-held designs (SELLER-001 spec §3).
- The `owner_report_view` / `investor_calc_interaction` event types from the SELLER-001 spec
  are NOT in the public allowlist by design (internal/report events, added at their own phase).
