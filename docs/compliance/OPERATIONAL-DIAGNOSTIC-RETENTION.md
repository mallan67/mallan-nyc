# Operational Diagnostic Retention — Approved 2026-08-02

## Decision

Maya Allan approved the Neon CPU/storage remediation and the bounded retention rule below.

The following two `AuditEvent.action` values are classified as **write-only operational diagnostics**, not business, consumer, transaction, access, consent, unsubscribe, brokerage, legal, or regulatory audit evidence:

- `idx_sync_listing_upsert_failure`
- `idx_sync_syncstate_failure`

They may be retained for **30 days** and then deleted in bounded, resumable batches.

## What this does not change

All other `AuditEvent` rows keep the existing two-year retention rule unless a longer-lived canonical record owns the requirement. In particular, this decision does not shorten retention for:

- Cotality access or source-use evidence;
- listing-display, status, gate, attribution, or broker-decision evidence;
- lead consent, email suppression, or unsubscribe evidence;
- CRM mutations, offers, deals, commissions, documents, or transaction records;
- authentication, security, admin, payment, or user-facing events;
- `idx_sync_cron`, `media_sync_cron`, `one_cycle_started`, or `one_cycle_run` records.

`email_unsubscribed` remains permanently exempt from the general AuditEvent purge.

## Safety contract

Deletion is allowed only when every condition below holds:

1. `action` is in the exact two-item allowlist above; no wildcard or prefix matching.
2. `created_at` is older than 30 days.
3. Actions and cutoff are bound SQL parameters.
4. Rows are deleted oldest-first in independently committed batches.
5. Each batch is bounded and uses `FOR UPDATE SKIP LOCKED`.
6. A single invocation has a hard row ceiling and reports rows/bytes actually removed.
7. `DIAGNOSTIC_RETENTION_ENABLED=false` remains an emergency kill switch.
8. `DIAGNOSTIC_DRY_RUN=true` measures the identical population without deleting.

## Measured initial population

The production measurement reconciled during the 2026-08-02 Neon review found **46,103** allowlisted rows older than 30 days. That count is evidence for the initial backlog only; the cleanup predicate, not this number, controls deletion.

## Authority boundary

This is a narrow approved exception to Mallan's general AuditEvent two-year retention floor. It applies only to the exact allowlist above. Any additional action requires a new explicit policy decision and test update.
