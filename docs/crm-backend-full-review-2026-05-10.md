# CRM Backend Full Review (May 10, 2026)

## What is actually broken right now (hard facts)

### 1) Production build currently fails in this environment
- **Command run:** `npm run -s build`
- **Result:** failed with exit code 1.
- **Direct failure:** Next.js cannot fetch Google Fonts (`Inter`, `Urbanist`) used by `app/layout.tsx`.
- **Impact:** a fresh build/deploy can fail if runtime/build environment cannot reach Google Fonts.
- **Evidence source:** command output from local verification run on 2026-05-10.

### 2) No failing core static checks from the runs executed
- **Command run:** `npm run -s type-check` → passed.
- **Command run:** `npm run -s lint` → passed.
- **Command run:** `npm run -s crm:test` → passed (39/39).
- **Impact:** there is no immediate TypeScript/lint/test red flag in the tested paths; the highest-confidence hard failure observed is the build/font dependency above.

---

## High-confidence backend risks that are NOT test failures yet (but need work next)

These are not currently failing CI checks in the commands above, but they are clear implementation risks visible in code and should be treated as next engineering work.

### A) Auth anti-abuse controls are incomplete
- `/api/auth/login` performs credential checks but has no visible route-level IP/account throttle in-handler.
- `/api/auth/forgot-password` comments mention rate limiting but no explicit limiter is present in the handler.
- `/api/auth/mfa/verify` limits attempts per MFA session, but no broader IP/account velocity control is evident.
- **Why this matters:** brute-force and reset abuse risk remains materially higher than top-tier backend expectations.

### B) Dev-login path can create a real broker session when toggle is enabled
- `/api/auth/dev-login` issues a real session token if `ALLOW_DEV_LOGIN === "true"` and not production mode.
- **Why this matters:** if environment controls drift, this is a high-impact auth exposure.

### C) Search cache is process-local memory
- `/api/idx/search` uses an in-memory `Map` cache.
- **Why this matters:** on multi-instance deployments, cache behavior is inconsistent across instances and not durable/scalable.

### D) Client profile endpoint is oversized and high PII surface
- `/api/crm/clients/[id]` returns a very broad payload (financial + legal + behavioral + activity + preferences) in one response.
- **Why this matters:** increases accidental overexposure risk and makes permission hardening harder.

### E) Validation approach is mostly manual in major handlers
- Large, manual field-by-field parsing/update logic in client PATCH route.
- **Why this matters:** drift, inconsistencies, and missed edge-case validation become more likely as schema grows.

---

## What to work on next (ordered)

### P0 — fix immediately
1. **Stabilize builds:** remove runtime dependency on Google Fonts fetch during build (self-host fonts or bundle locally).
2. **Add route-level rate limiting + lockouts:** login, forgot-password, MFA verify.
3. **Add environment hard-fails:** forbid `ALLOW_DEV_LOGIN=true` in any production deploy target.

### P1 — high impact hardening
4. **Replace in-memory search cache:** Redis/Upstash with explicit TTL and shared cache keys.
5. **Schema-first validation:** add Zod/contract validators on auth/search/client mutation routes.
6. **Split client response DTOs:** summary/financial/compliance/activity with explicit scope checks.

### P2 — maturity upgrades
7. **Field-level authorization matrix** for sensitive lead fields.
8. **Session management APIs** (list/revoke active sessions).
9. **SLO + telemetry contract** for auth/search/CRM mutation paths.

---

## Validation commands executed for this review pass
- `npm run -s type-check` (pass)
- `npm run -s lint` (pass)
- `npm run -s crm:test` (pass; 39/39)
- `npm run -s build` (**fail**; Google Fonts fetch for Inter/Urbanist)
