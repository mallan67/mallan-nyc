# Auth & API Security — Sprint 9

> **Brokerage:** Mallan Real Estate Inc. | **License:** #10991205323
> **Date:** 2026-03-01 | **Sprint:** 9 — Wire Mockups to Live Backend
> **Topology:** GitHub Pages (mockups) + Vercel (API)

---

## 1. Cross-Origin Authentication

### Problem
GitHub Pages (`https://mallan67.github.io`) and the API (`https://mallan.nyc`) are different origins. HttpOnly cookies with `SameSite=Lax` will not be sent cross-origin. `SameSite=None` is being phased out by browsers.

### Solution: Dual Auth
Both Bearer token (cross-origin) and cookie (same-origin) are supported simultaneously.

| Method | Storage | Transport | Use Case |
|--------|---------|-----------|----------|
| **Bearer token** | `localStorage` (`mallan_session_token`) | `Authorization: Bearer <token>` header | Cross-origin (GitHub Pages → mallan.nyc) |
| **httpOnly cookie** | Browser cookie jar (`session_token`) | Automatic with `credentials: 'include'` | Same-origin (future: when mockups move to mallan.nyc) |

### Auth Flow
1. User submits email + password to `POST /api/auth/login`
2. Server validates credentials, creates DB-backed session (`crypto.randomUUID()`)
3. Response includes both:
   - `token` field in JSON body (for Bearer auth)
   - `Set-Cookie: session_token=<token>; HttpOnly; Secure; SameSite=Lax` (for cookie auth)
4. `api-client.js` stores token in `localStorage`
5. All subsequent requests send `Authorization: Bearer <token>` header
6. Backend checks Bearer header first, then cookie (in both edge middleware and route handlers)

### Token Lifecycle
- **Duration:** 24 hours
- **Auto-rotate:** If within 1 hour of expiry, session is silently extended
- **Logout:** Token deleted from localStorage + session destroyed server-side
- **401 response:** Token cleared from localStorage, `mallan:auth:unauthorized` event dispatched

---

## 2. CORS Policy

### Allowed Origins
```
https://mallan67.github.io    — GitHub Pages (production mockups)
http://localhost:3000          — Next.js dev server
http://localhost:5500          — Live Server (VS Code extension)
http://127.0.0.1:5500         — Live Server (IP variant)
```

### Headers Set
```
Access-Control-Allow-Origin: <matched origin>
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 86400
```

### Preflight
- `OPTIONS` requests to `/api/*` from allowed origins return `204 No Content` with CORS headers
- Non-API routes do not get CORS headers (no cross-origin access to pages)

---

## 3. Edge Middleware Security Stack

The Next.js edge middleware (`middleware.ts`) runs on ALL matched routes in this order:

| Step | Check | Action |
|------|-------|--------|
| 0 | CORS preflight (OPTIONS) | Return 204 with CORS headers |
| 1 | Empty User-Agent | Block (403) — likely bot |
| 2 | Known bad bots (30+ patterns) | Block (403) |
| 3 | Rate limiting | 30 req/min API, 120 req/min pages (429) |
| 4 | IDX sync rate limit | 1 per 5 min per IP (429) |
| 5 | `/api/crm/*` protection | Require cookie OR Bearer (401) |
| 6 | `/api/portal/*` protection | Require cookie OR Bearer (401) |
| 7 | `/admin` protection | Require session OR pc_auth (redirect to login) |
| 8 | Security headers | CORS on API responses, noindex on admin/CRM |

### Important: Edge vs Route Handler Auth
- **Edge middleware** does a fast **presence check** (cookie exists? Bearer header present?)
- **Route handlers** do full **DB validation** via `requireAuth()` / `requireRole()`
- This two-layer approach prevents unnecessary DB calls for clearly unauthenticated requests

---

## 4. Route Handler Auth (`lib/auth/middleware.ts`)

### `getSessionToken(req)`
Extracts session token from request. Checks in order:
1. `Authorization: Bearer <token>` header (cross-origin)
2. `session_token` cookie (same-origin)

### `requireAuth(req)`
Validates the token against the database. Returns `SessionUser` or `401 NextResponse`.

### `requireRole(req, ...roles)`
Calls `requireAuth()` then checks role. Returns `SessionUser` or `401/403`.

### `requireBroker(req)` / `requireAgentOrBroker(req)`
Convenience wrappers.

---

## 5. Session Storage

Sessions are stored in PostgreSQL (Prisma `Session` model):

| Field | Type | Purpose |
|-------|------|---------|
| `id` | String | Primary key |
| `token` | String (unique) | Session token (UUID v4) |
| `user_type` | String | `"agent"` or `"lead"` |
| `user_id` | BigInt | FK to Agent or Lead table |
| `role` | String | `"BROKER"`, `"AGENT"`, `"buyer"`, etc. |
| `expires_at` | DateTime | 24hr from creation, auto-extended |
| `ip_address` | String? | Client IP at login |
| `user_agent` | String? | Browser UA at login |
| `created_at` | DateTime | Login timestamp |

---

## 6. Frontend Auth Gates

All mockup files check authentication on load and redirect to `login.html` if not authenticated:

| File | Gate Location |
|------|--------------|
| `MALLAN-NYC-CRM-FINAL2.html` | `MallanAPI.init()` → if `!authenticated` → redirect |
| `index-built.html` (search) | `agent-context.js` → `MallanAPI.init()` → redirect |
| `SALE-FORM-WITH-TOOLS.html` | `initLoggedInAgent()` → redirect |
| `RENTAL-FORM-WITH-TOOLS.html` | `initLoggedInAgent()` → redirect |

All files also listen for `mallan:auth:unauthorized` event (dispatched on 401) → redirect to login.

### Login Page (`login.html`)
- Calls `MallanAPI.configure({ baseUrl: 'https://mallan.nyc' })` for cross-origin
- On submit: `MallanAPI.auth.login()` → token stored → redirect to CRM
- On load: if `MallanAPI.hasToken` → `MallanAPI.init()` → auto-redirect if still valid
- `?redirect=` parameter preserves original destination
- `?portal=buyer|tenant|seller|landlord` sets portal type for client login
- `noindex, nofollow` meta tag

---

## 7. Mock Data Policy

| Environment | Mock Data | Behavior |
|-------------|-----------|----------|
| **Production** (GitHub Pages, any non-localhost) | **Disabled** | `mockListings = []`, `VIEWER_MOCK_LISTINGS = {}`, `CLIENT_DATA = {}`. API failure shows error state. |
| **Development** (`localhost` + `?mock=true`) | **Enabled** | Hardcoded mock data loaded for offline development |
| **Development** (`localhost` without `?mock=true`) | **Disabled** | Same as production — uses API |

---

## 8. Compliance Impact

### REBNY RLS Compliance
- All auth changes are **INTERNAL-ONLY** (no impact on RLS field binding, display rules, or distribution gates)
- RLS Validator v2: **0 UNKNOWN**, **10/10 sections PASS** after Sprint 9 changes
- Bearer tokens are **never** included in listing data or API responses (only in auth response)

### NY SHIELD Act
- Session tokens: cryptographic UUIDs (not predictable)
- Stored server-side in PostgreSQL (not in JWT — no client-side decoding)
- Auto-expire after 24 hours
- All mutations audit-logged

### Data Access Logging
- Login events: IP + User-Agent recorded on session creation
- `last_login` timestamp updated on Agent table
- All CRM/portal mutations logged to `AuditEvent` table with user context
