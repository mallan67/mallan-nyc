# Data Lifecycle & Retention Policy

> Mallan Real Estate Inc. — License #10991205323
> Effective: March 10, 2026
> Regulatory basis: NY SHIELD Act (GBL 899-aa), REBNY RLS Rules, UCBA 2026, TCPA, CAN-SPAM, IRS 26 USC 6001

> **SUPERSEDED IN PART (2026-09-10).** This file records the retention policy as approved on 2026-03-10 and is kept for that history. It is **no longer the operative source** for audit-event or media retention. Where this file and `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §14/§15 disagree, **the index wins**. Specifically:
>
> - **Audit events ARE auto-deleted.** The rows below saying they are "never auto-deleted" describe an earlier design. `app/api/cron/data-retention/route.ts:84` hard-deletes `AuditEvent` rows older than 2 years and reports `audit_events_purged_over_2yr`.
> - **Two `AuditEvent` actions are purged at 30 days**, not 2 years — `idx_sync_listing_upsert_failure` and `idx_sync_syncstate_failure`, per `docs/compliance/OPERATIONAL-DIAGNOSTIC-RETENTION.md` (approved 2026-08-02). The allowlist is exact; nothing else moves.
> - **Deleted `listing_media` payload is compacted at 30 days** per `docs/compliance/MEDIA-TOMBSTONE-RETENTION.md` (approved 2026-08-02).
> - **Closed listing data and transaction/commission records: use 6 years** (COMPLIANCE-CANONICAL-INDEX §14), not the 7 years stated below.
> - The eighth consent-capture endpoint is `/api/identity/capture`, not `/api/favorites/sync` (that route does not exist in the repo).
>
> Do not edit the schedule below to "fix" it — amend the canonical index row instead, then leave this file as the March 2026 record.

---

## 1. Retention Schedule

| Data Category | Retention Period | Regulatory Basis | Storage Tier |
|---------------|-----------------|------------------|--------------|
| Listing data (active) | Duration of listing + 3 years | UCBA Art. III Sec. 2 | Hot (DB) |
| Listing data (closed) | 7 years from closing | NY DOS 19 NYCRR 175.23 | Hot → Warm (1yr) |
| Transaction records & commissions | 7 years | IRS 26 USC 6001, NY DOS | Hot (DB) |
| Financial ledger entries | 7 years (immutable) | IRS, NY DOS | Hot (DB, never deleted) |
| Listing agreements | 6 years | NY DOS record retention | Document Vault |
| Audit event logs | 2 years | REBNY RLS compliance | Hot → Cold (90d) |
| Trestle/IDX access logs | 12 months | REBNY RLS data license | Hot (DB) |
| Owner Opt-Out evidence | 3 years | REBNY Gate 1 | Hot (DB) |
| Fair Housing scan logs | 5 years | Penalty defense | Hot → Warm (1yr) |
| TCPA consent records | 5 years | TCPA statute of limitations | Hot (DB) |
| CAN-SPAM opt-in records | 3 years | CAN-SPAM Act | Hot (DB) |
| Lead PII (inactive) | 3 years then purge | NY SHIELD Act | Hot → Archive |
| Session tokens | 24 hours | Security policy | Hot (DB, auto-expire) |
| Portal invite tokens | 72 hours | Security policy | Hot (DB, auto-expire) |
| Read notifications | 90 days | Operational | Hot (DB, auto-purge) |
| Geocode cache | 1 year | Operational | Hot (DB, auto-purge) |

---

## 2. Automated Enforcement

### Cron Job: `/api/cron/data-retention` (Weekly, Sunday 3:00 AM UTC)

| Action | Policy |
|--------|--------|
| Purge expired sessions | Delete where `expires_at` < 24h ago |
| Remove closed listings from IDX | Set `idx_display_yn = false` where status is Closed/Sold/Leased/Rented and `status_changed_at` > 24h ago (REBNY RLS Sec. 2.05) |
| Clear expired portal tokens | Null out `portal_token` where `portal_token_expires_at` > 72h ago |
| Purge read notifications | Delete where `read = true` and `created_at` > 90 days ago |
| Purge stale geocode cache | Delete where `created_at` > 1 year ago |
| Report old audit logs | Count audit events > 2 years old (manual review, never auto-deleted) |

### Other Cron Jobs

| Job | Schedule | Retention Action |
|-----|----------|-----------------|
| `dom-reset` | Daily 6 AM | Reset DOM for listings in Withdrawn/Cancelled >= 30 days |
| `idx-sync` | Every 4 hours | Sync listing data from Trestle (updates, not deletes) |

---

## 3. Deletion Policy

### Hard Deletes (Immediate)
- Expired sessions (24h TTL)
- Expired portal tokens (72h TTL)
- Read notifications (90d TTL)
- Stale geocode cache (1yr TTL)

### Never Deleted
- Financial ledger entries (immutable, hash-chained)
- Audit event logs (counted for review, never auto-deleted)
- TCPA consent records (retained 5 years minimum)
- Listing data (retained per schedule, then manual archive)

### Manual Review Required
- Lead PII deletion requests (right to deletion)
- Audit log archival (after 2-year hot retention)
- Closed listing data archival (after 7 years)

---

## 4. PII Handling

### Collection Points (8 endpoints, all record `consent_captured_at`)
1. `/api/inquiries` — listing inquiry
2. `/api/contact` — contact form (validates consent timestamp within 5min)
3. `/api/sign-up` — account creation
4. `/api/cma` — CMA request
5. `/api/guides/download` — guide download
6. `/api/favorites/sync` — favorites sync
7. `/api/search-alerts` — search alert signup
8. `/api/open-houses/rsvp` — open house RSVP

### PII Fields Stored
- Name, email, phone, address (on Lead model)
- `consent_captured_at` timestamp (TCPA/CAN-SPAM)
- Portal credentials (`password_hash`, never plaintext)

### PII Not Stored
- IP addresses (redacted in Trestle logger)
- Payment card data (not collected)
- SSN/government IDs (not collected)

---

## 5. Incident Response

Per `compliance/AUDIT-LOGGING-AND-EVIDENCE.md`:
- **Breach notification:** Within 60 days (NY SHIELD Act)
- **REBNY notification:** Within 48 hours of discovery
- **Evidence preservation:** 12 months minimum for incident data
- **Log retention during investigation:** Suspended deletion until resolution
