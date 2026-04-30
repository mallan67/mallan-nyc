# Active verification layer

Wires phone, email, and address values from `ContactRecord` through real provider APIs and produces a `VerificationMap` that `aggregateContacts()` consumes — promoting low-confidence cross-source matches to high-confidence verified records.

## Required Vercel env vars

| Verifier | Env vars | Cost per call |
|---|---|---|
| **Twilio Lookup v2** (phone + carrier) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | ~$0.005 |
| **NeverBounce** (email — Tier 2, optional) | `NEVERBOUNCE_API_KEY` | ~$0.005 |
| **DNS MX check** (email — Tier 1, fallback) | (none — uses Node `dns` module) | free |
| **USPS Addresses v3** | `USPS_CLIENT_ID`, `USPS_CLIENT_SECRET` | free w/ USPS dev account |

If any env var is missing, the orchestrator returns `skipped=true` for that field — never throws — so you see the gap in the audit log and the calling code degrades to "unverified" rather than crashing.

The Twilio creds are the same ones already in use for SMS MFA (`lib/auth/mfa.ts`).

## Calling the orchestrator

```ts
import { aggregateContacts } from "@/lib/scanner/contact/aggregator";
import { runVerifications } from "@/lib/scanner/contact/verify/orchestrator";

const record = aggregateContacts(sourceRows);
const out = await runVerifications(record, { max_per_call: 10 });
const upgraded = aggregateContacts(sourceRows, out.verifications);
// upgraded.phones[0].confidence may be "high" now
// out.audit contains per-call detail for compliance audit trail
```

## API endpoint

`POST /api/crm/scanner/verify` — runs the orchestrator on a single prospect, returns the audit + an upgraded ContactRecord. Auth: agent or broker. Logs an `AuditEvent` for cost tracking.

Body:
```json
{
  "source_rows": [...SourceContactRow],
  "max_per_call": 10,
  "skip_phone": false,
  "skip_email": false,
  "skip_address": false
}
```

## Budget guards

| Guard | Default | Why |
|---|---|---|
| `max_per_call` | 10 | Hard cap on lookups per orchestrator invocation. ~5 cents max per call. |
| `skip_phone` / `skip_email` / `skip_address` | false | Selective shut-off when a vendor's down or you only want to validate one kind |
| Twilio not configured | returns `skipped=true` | Soft fail, no crash |

## Confidence ladder (after verification)

A field that came in single-source (`low`) gets promoted to `high` when actively verified by Twilio / NeverBounce / USPS. Cross-source agreement still works without verification — 2 sources → `medium`, 3+ → `high`.

## Audit trail

Every verification call produces an entry in `out.audit[]`:
- `kind` (phone/email/address)
- `value` and `normalized` (so you can correlate)
- `provider` (twilio_lookup / neverbounce / dns_mx / usps_v3)
- `verified` (true/false)
- `method` (the VerificationMethod used in the resulting field's confidence calc)
- `detail` (provider response excerpt — useful for debugging failures)
- `at` (ISO timestamp)

The API endpoint also logs an `AuditEvent` with a per-kind breakdown of calls made, for cost tracking.
