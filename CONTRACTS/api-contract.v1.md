# API Contract v1 — mallan-nyc <-> search-modular

> **Version:** 1.0.0
> **Date:** 2026-03-01
> **Owner:** mallan-nyc (source of truth for all API definitions)
> **Consumer:** production CRM HTML files (public/crm/)

Any endpoint change in mallan-nyc that affects CRM file consumers MUST:
1. Bump this contract version
2. Update this file in BOTH repos
3. Trigger a sync update in search-modular

---

## Base URL

| Environment | URL |
|-------------|-----|
| Production  | `https://mallan.nyc/api` |
| Preview     | `https://<branch>.mallan-nyc.vercel.app/api` |
| Local Dev   | `http://localhost:3000/api` |

---

## Authentication

| Mechanism | Details |
|-----------|---------|
| Type | Session cookie (`session_token`) |
| Cookie flags | `httpOnly`, `secure` (prod), `sameSite: lax`, `path: /` |
| Session storage | Server-side (Prisma `Session` model) |
| Token format | `crypto.randomUUID()` |
| Expiry | 24 hours |

CRM files use `MallanAPI.init()` which reads the session cookie automatically.
No tokens, API keys, or credentials should appear in HTML/JS source.

---

## Endpoints Used by CRM Files

### Auth

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| POST | `/api/auth/login` | CRM | Agent/broker login |
| POST | `/api/auth/logout` | CRM | Destroy session |
| GET  | `/api/auth/me` | CRM, viewers | Get current user from session |
| POST | `/api/auth/invite` | CRM | Generate client portal invite |
| GET  | `/api/auth/invite/[token]` | Portal | Validate invite token |
| POST | `/api/auth/invite/[token]` | Portal | Client accepts invite |
| POST | `/api/auth/change-password` | CRM | Authenticated password change |
| POST | `/api/auth/agent/register` | CRM (broker) | Create new agent account |

### Listings (CRM + Viewers)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/crm/listings` | CRM, search | List agent's listings |
| POST | `/api/crm/listings` | Forms (REDESIGN) | Create new listing |
| GET  | `/api/crm/listings/[id]` | Viewers (WITH-TOOLS) | Load single listing for display |
| PATCH | `/api/crm/listings/[id]` | Forms (REDESIGN) | Update listing fields |
| DELETE | `/api/crm/listings/[id]` | CRM | Soft delete (status=Withdrawn) |
| PATCH | `/api/crm/listings/[id]/status` | CRM | Status state machine transition |
| POST | `/api/crm/listings/[id]/validate` | Forms | Dry-run compliance validation |
| POST | `/api/crm/listings/[id]/photos` | Forms | Upload photo metadata |

### Agents (CRM — Broker Only)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/crm/agents` | CRM | List all agents |
| POST | `/api/crm/agents` | CRM (broker) | Create agent |
| PATCH | `/api/crm/agents/[id]` | CRM (broker) | Update agent |
| DELETE | `/api/crm/agents/[id]` | CRM (broker) | Soft deactivate |

### Clients (CRM)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/crm/clients` | CRM | List agent's clients |
| POST | `/api/crm/clients` | CRM | Create client |
| GET  | `/api/crm/clients/[id]` | CRM | Full profile + preferences + actions |
| PATCH | `/api/crm/clients/[id]` | CRM | Update client fields |
| POST | `/api/crm/clients/[id]/invite` | CRM | Generate portal invite |
| PUT  | `/api/crm/clients/[id]/preferences` | CRM | Upsert search preferences |
| POST | `/api/crm/clients/[id]/actions` | CRM | Record listing reaction |

### Deals (CRM + Deal Forms)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/crm/deals` | CRM | List deals |
| POST | `/api/crm/deals` | Deal forms | Create commission request |
| GET  | `/api/crm/deals/[id]` | Deal forms | View deal details |
| PATCH | `/api/crm/deals/[id]` | Deal forms | Update deal |
| PATCH | `/api/crm/deals/[id]/status` | CRM (broker) | Approve/reject/close |

### Showings (CRM)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/crm/showings` | CRM | List agent's showings |
| PATCH | `/api/crm/showings/[id]` | CRM | Confirm/cancel/reschedule |

### Email (CRM — Sprint 7)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| POST | `/api/crm/email` | CRM | Send email (template or custom) |
| POST | `/api/crm/email/bulk` | CRM (broker) | Bulk listing alert (50/hr limit) |

### Saved Searches (CRM — Sprint 7)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/crm/saved-searches` | CRM, search | List saved searches |
| POST | `/api/crm/saved-searches` | CRM, search | Create saved search |
| GET  | `/api/crm/saved-searches/[id]` | CRM | Get search details |
| PATCH | `/api/crm/saved-searches/[id]` | CRM | Update criteria |
| DELETE | `/api/crm/saved-searches/[id]` | CRM | Delete saved search |
| POST | `/api/crm/saved-searches/[id]/execute` | CRM, search | Run search, return matches |

### Portal (Client-facing)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| GET  | `/api/portal/me` | Portal pages | Client's own profile |
| GET  | `/api/portal/listings` | Portal pages | Listings shared with client |
| POST | `/api/portal/listings/[id]/react` | Portal pages | Toggle reaction (like/dislike/discuss) |
| GET  | `/api/portal/showings` | Portal pages | Client's upcoming showings |
| POST | `/api/portal/showings` | Portal pages | Request a showing |
| GET  | `/api/portal/offers` | Portal (seller/landlord) | Incoming offers |

### IDX/Trestle (Sprint 7)

| Method | Path | Used By | Purpose |
|--------|------|---------|---------|
| POST | `/api/idx/sync` | CRM (broker) | Manual sync trigger |
| GET  | `/api/idx/status` | CRM | IDX pipeline status |

---

## Response Shapes

### GET /api/auth/me

```json
{
  "id": "uuid",
  "email": "agent@mallan.nyc",
  "name": "Agent Name",
  "role": "broker | agent",
  "license_number": "string",
  "phone": "string",
  "status": "active | inactive",
  "brokerage_id": "uuid"
}
```

### GET /api/crm/listings/[id]

```json
{
  "id": "uuid",
  "listing_key": "SL-1001",
  "type": "sale | rental",
  "status": "Draft | Active | Pending | UnderContract | Sold | Leased | Withdrawn | Expired",
  "address": { "street": "", "unit": "", "city": "", "state": "NY", "zip": "" },
  "price": 0,
  "bedrooms": 0,
  "bathrooms": 0,
  "sqft": 0,
  "property_type": "string",
  "description": "string",
  "photos": [{ "url": "", "caption": "", "sort_order": 0 }],
  "agent": { "id": "", "name": "", "email": "", "phone": "" },
  "distribution": {
    "idx_display": true,
    "syndicate": true,
    "owner_opt_out": false,
    "participant_only": false,
    "coming_soon_date": null
  },
  "rls_fields": { "...448 mapped fields..." },
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Masking rule:** When the requesting user's role is `buyer` or `tenant`, the `agent` object is stripped entirely from the response. The API never sends agent name/email/phone to buyer/tenant portals.

### GET /api/portal/me

```json
{
  "id": "uuid",
  "name": "Client Name",
  "email": "client@example.com",
  "role": "buyer | tenant | seller | landlord",
  "agent_id": "uuid",
  "preferences": {
    "property_types": [],
    "neighborhoods": [],
    "min_price": null,
    "max_price": null,
    "min_beds": null,
    "max_beds": null,
    "must_haves": []
  }
}
```

### GET /api/portal/listings

```json
{
  "listings": [
    {
      "id": "uuid",
      "listing_key": "SL-1001",
      "type": "sale",
      "status": "Active",
      "address": { "...masked if InternetAddressDisplayYN=false..." },
      "price": 0,
      "bedrooms": 0,
      "bathrooms": 0,
      "sqft": 0,
      "photos": [],
      "my_reaction": "liked | disliked | discuss | null",
      "shared_at": "ISO8601"
    }
  ],
  "total": 0
}
```

**No `agent` field in portal listing responses.**

### POST /api/crm/saved-searches

Request:
```json
{
  "name": "UES 2BR+",
  "criteria": {
    "type": "sale | rental",
    "neighborhoods": [],
    "min_price": null,
    "max_price": null,
    "min_beds": null,
    "max_beds": null,
    "property_types": [],
    "keywords": ""
  },
  "client_id": "uuid | null"
}
```

Response:
```json
{
  "id": "uuid",
  "name": "UES 2BR+",
  "criteria": { "..." },
  "last_run": null,
  "result_count": 0,
  "created_at": "ISO8601"
}
```

### POST /api/crm/email

Request:
```json
{
  "to": "recipient@example.com",
  "template": "portal_invite | listing_alert | showing_confirm | deal_status | null",
  "subject": "string (required if no template)",
  "body": "string (required if no template)",
  "listing_id": "uuid | null",
  "client_id": "uuid | null"
}
```

Response:
```json
{
  "success": true,
  "message_id": "sendgrid-id"
}
```

---

## Masking Rules (REBNY Compliant)

| Role | Agent Info | Listing Data | Distribution Gates |
|------|-----------|-------------|-------------------|
| Broker | Full access | Full access | Can edit |
| Agent | Own listings only | Full access (own) | Can edit (own) |
| Buyer | **STRIPPED** (no name/email/phone) | Filtered by sharing | Read-only display |
| Tenant | **STRIPPED** (no name/email/phone) | Filtered by sharing | Read-only display |
| Seller | Own listing agent visible | Own listing only | Read-only display |
| Landlord | Own listing agent visible | Own listing only | Read-only display |

**Implementation:** API-layer stripping (agent fields never reach browser for buyer/tenant). Viewer JS has a secondary CSS guard as defense-in-depth.

---

## Versioning Policy

- Contract version follows semver: `MAJOR.MINOR.PATCH`
- **MAJOR** bump: breaking change to response shape or auth mechanism
- **MINOR** bump: new endpoint added
- **PATCH** bump: field added to existing response (backward-compatible)
- Both repos must have identical contract versions
- mallan-nyc is the owner; search-modular is the consumer
