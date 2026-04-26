# Runtime Effect Tests — Runbook

> **Phase 3 of the validator-truth framework** (`memory/VALIDATOR-FRAMEWORK-2026-04-26.md`).
>
> These tests prove that high-risk routes actually produce the side effects
> they claim. The previous static validator suite couldn't tell a real
> insert from a graceful no-op.

## Currently shipped (12 tests, 3 suites — all PASS)

| Suite | What it proves |
|---|---|
| `inquiry-effect.test.ts` | `createInquiry()` calls `prisma.inquiry.create` with the right shape (source, hashed IP per NY SHIELD Act, consent timestamp). Also proves the helper falls back gracefully (returns null, never throws) when the Inquiry table is missing — so lead capture keeps working during a migration window. |
| `prospect-import-parse.test.ts` | The exceljs-based parser handles csv, xlsx, blank rows, numeric coercion, whitespace headers, and header-only inputs. Closes the #45-class gap (library migration with no real-input proof). |
| `auth-ethics-gate.test.ts` | UCBA Art. III §6: the gate throws `EthicsTrainingExpiredError(reason="missing")` for NULL expiry, throws `reason="expired"` for past expiry, doesn't throw for future expiry. Closes the C4 silent-degradation risk. |

Run all: `npm run test:runtime`

## Remaining test gaps (queue for incremental fill-in)

The infrastructure is in place — adding any of these is now a 30-min job
each, not a multi-day setup.

### Inquiry route handlers — full matrix
The 8 lead-capture endpoints all wire `createInquiry` with a different
`source` enum. Tests should mock `createInquiry` and assert it was called
with the right value. Body shapes per route:

| Route | Source enum | Required body fields |
|---|---|---|
| `app/api/inquiries/route.ts` | `inquiry` | `name`, `email`, `phone`, `message`, `agreeToTerms`, `listingId` |
| `app/api/contact/route.ts` | `contact_form` | `name`, `email`, `message` |
| `app/api/cma/route.ts` | `cma_request` | `firstName`, `lastName`, `email`, `phone`, `propertyAddress` |
| `app/api/sign-up/route.ts` | `sign_up` | `email`, `password`, `firstName`, `lastName`, `phone`, `agreeToTerms` |
| `app/api/guides/download/route.ts` | `guide_download` | `email`, `firstName`, `guide_slug` |
| `app/api/search-alerts/route.ts` | `search_alert` | `email`, `criteria` |
| `app/api/open-houses/rsvp/route.ts` | `open_house_rsvp` | `open_house_id`, `name`, `email`, `phone` |
| `app/api/portal/listings/[id]/react/route.ts` | `favorite` (only when `action='liked'`) | `action`, listing path param |

Mocks to apply for each route test: `@/lib/prisma`, `@/lib/inquiries/create`,
`@/lib/auth/readonly-guard`, `@/lib/middleware/rate-limiter`,
`@/lib/email/sendgrid`, `@/lib/email/templates`, `@/lib/sanitize`.
The pattern is in `inquiry-effect.test.ts` (the helper test) — replicate
for each route with the correct body shape.

### Offer transmission — UCBA Art. II §18
Target: `app/api/crm/offers/[id]/transmit/route.ts`

Cases:
1. **Stamps `transmitted_to_seller_at`** on first call — assert the
   `prisma.offer.update` call payload includes `transmitted_to_seller_at`
   set to a Date.
2. **Idempotent re-submit** — second call returns the same timestamp,
   does NOT overwrite (assert update was NOT called the second time, OR
   the value didn't change).
3. **UCBA precondition** — when payload has `competing_offers_disclosed=true`
   but `disclosure_authorized_by_seller=false`, returns 400 with
   `code: "UCBA_II_DISCLOSURE_NOT_AUTHORIZED"`. NO `prisma.offer.update`
   call should fire.
4. **AuditEvent written** on success — assert `prisma.auditEvent.create`
   was called with `event_type='update'`, `entity_type='offer'`.

### Auth login full flow
Target: `app/api/auth/login/route.ts`

Cases:
1. Valid agent + valid password → returns `mfa_required: true` (broker)
   OR sets session cookie (non-broker agent).
2. Valid agent + invalid password → 401 with "Invalid email or password".
3. Inactive agent → 403 with "Account is inactive or suspended".
4. Agent with expired ethics training → 403 with `code: "ETHICS_TRAINING_EXPIRED"`.
5. Valid lead + valid password → sets session cookie with `userType: "lead"`.

### Import route — preview + import + duplicates
Target: `app/api/crm/sales/prospects/import/route.ts`

Cases:
1. Preview mode (`?mode=preview`) returns `headers` and a sample of `rows`
   without writing to DB.
2. Import mode (`?mode=import`) calls `prisma.prospectLead.createMany` (or
   equivalent) with the parsed rows.
3. Duplicate handling — rows with email that already exists are skipped
   (assert createMany payload doesn't include them).
4. File too large (>50MB) → 413 with size error.
5. Malformed workbook (random bytes) → 400 with parse error.

## Why we mock everything

These are **side-effect** tests, not integration tests. The goal is to
prove the *contract* between layers — that route X calls helper Y with
arg Z, regardless of whether Y actually wrote to a real DB. Integration
tests against a real DB would need:

- A test Postgres (or SQLite) instance
- A way to run `prisma migrate deploy` against it
- Test isolation (transactions or per-test reset)

That's a separate Phase (queue it for later). The mocked tests here
already catch the silent-failure class — if the route stops calling
`createInquiry`, this suite breaks even though the route still returns
200 to the user.

## Adding a new test

1. Copy the closest existing test in `tests/runtime/`.
2. Update the mocks at the top to cover the route's imports (run the
   test once with the failing imports — jest will tell you what's missing).
3. Build the request with `makeRequest({ url, body })` from `helpers.ts`.
4. Mock the side-effect target (e.g. `createInquiry`, `prisma.offer.update`)
   and assert the call args.

Run the test: `npx jest --config tests/runtime/jest.config.js tests/runtime/<your>.test.ts`
