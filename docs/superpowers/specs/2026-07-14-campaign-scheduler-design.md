# Design spec — Durable Queued Campaign Scheduler + DB-backed Lease Economics (Slice 2)

**Status:** DESIGN-ONLY — awaiting Maya approval. No migration, no cron, no schema
change has been created. This document exists so the schema + worker are reviewed
BEFORE anything touches Neon.

**Author:** Claude · **Date:** 2026-07-14 · **Depends on:** Slice 1 (`feat/create-eblast-correctness-2026-07-14`)

**Approval gates this touches (all HELD per CLAUDE.md §A.7 / §C):** schema migration,
cron config. Both require explicit Maya approval before implementation begins.

---

## 1. Why

Today `POST /api/crm/listing-campaigns` (live mode, fail-closed) sends to every
deliverable recipient **inside one HTTP request**, pausing `CAMPAIGN_THROTTLE_MS`
between each. That is not a campaign scheduler:

- No scheduled start; a send begins the instant the request lands.
- No batch size / interval / daily sending window.
- No pause / resume / cancel.
- No durable per-recipient status — a crash mid-loop loses the position and can
  re-send on retry (no idempotency).
- Recipients are uploaded per send; there is no persisted audience.

Slice 1 made the **content** correct and honest and left live sending disabled.
Slice 2 makes **delivery** correct: durable, scheduled, batched, idempotent,
and operator-controllable — the precondition Maya set for enabling live send.

Slice 2 also gives the SL-0004 lease economics a permanent, DB-backed home,
retiring the interim server module `lib/email/listing-campaign-profiles.ts`.

---

## 2. Scope

**In scope**
1. Durable campaign queue: `CampaignRecipient` rows with per-recipient status.
2. Schedule + batching fields (start time, NY timezone, batch size, interval,
   daily window) on the campaign record.
3. An idempotent cron worker that claims and sends the next due batch.
4. Pause / resume / cancel + progress surfaced in the CRM.
5. DB-backed listing/lease economics (permanent home for the profile), modeled
   temporally (current in-place rent + scheduled step-up with effective date).

**Out of scope (separate slices)**
- Audience Source integration (#5: 1031 Buyer Scanner, CRM Investors, Matching
  Buyers, REBNY Agents). File upload remains the interim audience source. The
  scanner (`lib/scanner/acris-1031-buyer-filter.ts`) is not merged; its audience
  wiring is its own slice and blocks on that work.
- Open/click tracking dashboard (the "Eblast History" pixel + click models).

---

## 3. Data model (proposed — NOT applied)

### 3.1 Extend the existing `Campaign` model

The `Campaign` model already exists (marketing planner). Add scheduling columns
(additive, nullable — no backfill needed):

```prisma
model Campaign {
  // ... existing fields ...
  listing_id            String?   @map("listing_id")          // the eblasted listing
  campaign_kind         String?   @map("campaign_kind")       // "investor" | "buyer" | "agent"
  scheduled_start_at    DateTime? @map("scheduled_start_at")  // first batch not before this (UTC)
  send_timezone         String    @default("America/New_York") @map("send_timezone")
  batch_size            Int?      @map("batch_size")          // recipients per batch (e.g. 20)
  batch_interval_min    Int?      @map("batch_interval_min")  // minutes between batches (e.g. 10)
  daily_window_start    Int?      @map("daily_window_start")  // minutes-from-midnight, NY (e.g. 9*60)
  daily_window_end      Int?      @map("daily_window_end")    // minutes-from-midnight, NY (e.g. 18*60)
  queue_state           String    @default("draft") @map("queue_state") // draft|scheduled|sending|paused|completed|cancelled
  last_batch_at         DateTime? @map("last_batch_at")
  economics_fingerprint String?   @map("economics_fingerprint") // Slice-1 confirmation binding, frozen at schedule time
  content_html          String?   @map("content_html") @db.Text // rendered, frozen at schedule time
  subject_line          String?   @map("subject_line")
}
```

### 3.2 New `CampaignRecipient` model (the durable queue)

```prisma
model CampaignRecipient {
  id           BigInt    @id @default(autoincrement())
  campaign_id  BigInt    @map("campaign_id")
  campaign     Campaign  @relation(fields: [campaign_id], references: [id], onDelete: Cascade)
  email        String
  name         String?
  status       String    @default("queued") // queued|sent|failed|suppressed|cancelled
  batch_no     Int?      @map("batch_no")
  claimed_at   DateTime? @map("claimed_at")  // idempotent-claim marker
  sent_at      DateTime? @map("sent_at")
  fail_reason  String?   @map("fail_reason")
  attempts     Int       @default(0)
  created_at   DateTime  @default(now()) @map("created_at")

  @@unique([campaign_id, email])            // dedupe within a campaign
  @@index([campaign_id, status])
  @@map("campaign_recipients")
}
```

### 3.3 New `ListingEconomics` model (permanent home for the profile)

Retires the interim `lib/email/listing-campaign-profiles.ts`. Temporal by design:

```prisma
model ListingEconomics {
  id                       BigInt    @id @default(autoincrement())
  listing_id               String    @unique @map("listing_id")
  current_rent_monthly     Decimal?  @map("current_rent_monthly") @db.Decimal(12, 2)
  current_rent_verified_at DateTime? @map("current_rent_verified_at")
  scheduled_rent_monthly   Decimal?  @map("scheduled_rent_monthly") @db.Decimal(12, 2)
  scheduled_rent_effective DateTime? @map("scheduled_rent_effective")
  maintenance_monthly      Decimal?  @map("maintenance_monthly") @db.Decimal(12, 2)
  lease_expiration         DateTime? @map("lease_expiration")
  source_reference         String?   @map("source_reference") @db.Text
  updated_by               BigInt?   @map("updated_by")
  updated_at               DateTime  @updatedAt @map("updated_at")

  @@map("listing_economics")
}
```

`resolveListingEconomics()` (Slice 1, pure) is reused unchanged — it already takes
plain fields + an `asOf` date, so the route swaps its input source from the JS
profile to this table with zero logic change.

---

## 4. The idempotent cron worker

`app/api/cron/campaign-dispatch/route.ts` (new cron — **HELD**, needs schedule
config). Runs every N minutes:

```
For each Campaign where queue_state = 'sending' AND now ≥ scheduled_start_at:
  1. Skip if outside the NY daily sending window.
  2. Skip if (now - last_batch_at) < batch_interval_min.
  3. Re-verify the economics fingerprint still matches the frozen content
     (fail-closed: if listing economics changed after scheduling, PAUSE the
     campaign and alert — never send stale figures).
  4. Claim the next `batch_size` recipients WHERE status='queued' using a
     transactional UPDATE ... RETURNING that stamps claimed_at + batch_no
     (atomic claim → no double-send across overlapping cron runs).
  5. For each claimed recipient: sendEmail() (fail-closed suppression + one-click
     unsubscribe, unchanged), then set status sent|failed|suppressed + per-row audit.
  6. Update last_batch_at. When no queued rows remain → queue_state='completed'.
```

**Idempotency:** the atomic claim (`claimed_at IS NULL` guard inside the same
UPDATE that sets it) guarantees a recipient is handed to exactly one batch even
if two cron invocations overlap. A crash after claim but before send leaves the
row claimed; a bounded re-claim (claimed_at older than a lease window AND still
status='queued') retries safely because `sendEmail` is keyed and suppression is
idempotent. `attempts` caps retries.

**Live-send flag unchanged:** the worker still refuses to deliver unless
`CAMPAIGN_LIVE_SEND_ENABLED === 'true'`. Dry-run scheduling exercises the whole
queue with delivery stubbed.

---

## 5. Control surface (CRM)

- Schedule dialog: start date + time (NY), batch size (default 20), interval
  (default 10 min), daily window (default 9am–6pm NY). Maya sets these before approving.
- Pause / Resume / Cancel buttons → `queue_state` transitions.
- Progress: queued / sent / failed / suppressed / cancelled counts + per-batch log,
  read from `CampaignRecipient` aggregates.

## 6. Tests (before enabling live send)

- Atomic claim never double-assigns a recipient across concurrent worker runs.
- Batch size + interval + daily window are all respected.
- Pause halts claiming; resume continues from the exact remaining set.
- Cancel marks remaining `queued` → `cancelled`; none send afterward.
- Economics fingerprint mismatch at dispatch → auto-pause, no send.
- A crash mid-batch does not double-send on the next run (idempotent re-claim).
- Nothing sends while `CAMPAIGN_LIVE_SEND_ENABLED` is unset.

## 7. Rollout gates (Maya-approved, in order)

1. Approve this schema (migration STAGED, not applied — NEON.md discipline).
2. Apply migration to canonical `hidden-mountain` (per NEON.md).
3. Land the worker + control surface behind the existing live-send flag (still off).
4. Idempotency + scheduler tests green.
5. Only then consider enabling live send for a single, reviewed campaign.

**Do not enable `CAMPAIGN_LIVE_SEND_ENABLED` until steps 1–4 are complete and the
audience review, schedule, and test email are all approved.**
