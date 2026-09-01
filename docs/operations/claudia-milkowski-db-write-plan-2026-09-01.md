# Claudia Milkowski — canonical Agent DB write plan

**Status: NOT EXECUTED. Requires explicit Maya authorisation.**
Nothing in this branch writes to any database.

## Why a DB row is still required

Agent identity is two-tier. `data/agents.json` is the static fallback and the
seed source; the Prisma `agents` table is canonical at runtime. The consumers
differ in how they degrade:

| Consumer | DB use | Without a row |
|---|---|---|
| `/agents/[name]` | DB first, JSON on **null or throw** | works (JSON) |
| `/agents` | DB first, JSON only on **throw** | **omits Claudia** |
| `/api/agents/public` | DB first, JSON only on **throw** | **omits Claudia** |
| `/api/agents/[slug]/listings` | DB only (404 if absent) | **404** |
| `app/sitemap.ts` | DB only | **no sitemap entry** |

A reachable-but-unseeded database therefore yields a working profile URL that
nothing links to. The JSON alone does not complete the work.

## Do NOT use the full Prisma seed

`prisma/seed.ts` upserts **every** agent and rewrites fields including
`password_hash` from `SEED_AGENT_PASSWORD`. Running it in production to add one
agent would mutate Maya, Leda and Julia. Claudia is present in that file only so
a **fresh** environment (local, CI, preview) seeds the complete roster.

## Use the canonical creation path

`POST /api/crm/agents` — broker-only, write-guarded, audited (`logAuditEvent`
`create`/`agent`), single-agent scoped, 409 on duplicate email, generates a
one-time temporary password, and hardcodes `role: "AGENT"`.

```jsonc
POST /api/crm/agents          // authenticated as the principal broker
{
  "first_name":   "Claudia",
  "last_name":    "Milkowski",
  "email":        "cmilkowski@mallan.nyc",
  "phone":        "(646) 418-8388",
  "license_no":   "10301200574",
  "license_type": "broker",          // NY licence designation
  "public_slug":  "claudia-milkowski",
  "title":        "Licensed Real Estate Associate Broker",
  "photo":        "/images/agents/claudia-milkowski.jpg",
  "bio":          "<the approved biography — copy verbatim from data/agents.json>",
  "specialties":  ["Co-op Board Approvals", "Negotiation",
                   "Seller Marketing Strategy", "Buyer Representation"],
  "languages":    ["English", "Spanish"],
  "featured":     false
}
```

The endpoint sets `role: "AGENT"` and `status: "active"` itself — do not attempt
to pass `role`. It returns `tempPassword` once; hand it to Claudia for her CRM
password reset.

## Deliberately omitted — do not invent

| Field | Why |
|---|---|
| `trestle_mls_id` | Her Cotality/REBNY member ID is not known. Absent, `/api/agents/[slug]/listings` falls back to `ListAgentFullName eq 'Claudia Milkowski'`, which works. `ListAgentMlsId` is the stronger identity and should be added once the value is verified against the live authenticated Cotality API — never guessed. |
| `license_expiry` | Not supplied. |
| `sale_split` / `rental_split` | Not supplied; commercial terms. |
| `role: "BROKER"` | She is not the principal broker. See below. |

## The licence/authorisation separation

`license_type: "broker"` is the NY designation she genuinely holds.
`role: "BROKER"` is the CRM **authorisation** grant that unlocks the audit log,
every agent's leads, automation, campaigns and `/admin` login. An Associate
Broker is correctly `role: "AGENT"`.

Guarded by `tests/runtime/agent-professional-title.test.ts` and
`tests/runtime/agent-profile-claudia-milkowski.test.ts`.

## Verify after the write

```
GET /agents                       → Claudia present, from DB
GET /agents/claudia-milkowski     → 200, resolves from DB
GET /api/agents/public            → contains claudia-milkowski, no phone/email
GET /sitemap.xml                  → contains /agents/claudia-milkowski
GET /api/agents/claudia-milkowski/listings → 200 (not 404)
```
Confirm exactly one row: `SELECT id, email, public_slug, role, license_type,
title FROM agents WHERE email = 'cmilkowski@mallan.nyc';`
