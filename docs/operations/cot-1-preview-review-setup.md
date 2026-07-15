# COT-1 preview review setup — operator runbook (HELD actions)

The `/crm/system-status` code is deployed, but preview review needs Vercel env +
Neon changes (CLAUDE.md §A.7). Done by Maya in the dashboards (or by an agent only
with explicit approval). **Never print or commit any connection string or password.**

Root cause of the 500: Preview has no `DATABASE_URL`, so `/api/auth/login`'s
`prisma.agent.findUnique` fails. The login UI now shows an honest message; login
still needs a working preview app DB + working MFA email.

## Part 1 — Preview application database (schema-only, PII-safe)
1. **Neon Console → Branches → Create branch:**
   - Name: `preview-cot1`
   - **Include: Schema-only** (copies the schema WITHOUT production rows — intended
     for confidential data). Source schema: the production branch (`main`).
   - **Do NOT** create a full production clone, and do NOT run
     `prisma db push --force-reset` — the schema is already present, so no
     destructive schema command is needed and no PII (leads/clients/inquiries) is
     ever exposed, even temporarily.
2. **Seed one broker login** on the branch (required non-default `agents` columns
   confirmed: email, first_name, last_name, password_hash, updated_at; id/created_at
   default; role/status have defaults). Use a PREVIEW-ONLY password hash (bcrypt
   cost 12) — do NOT copy production auth records:
   ```sql
   INSERT INTO agents (email, first_name, last_name, password_hash, role, status, updated_at)
   VALUES ('<maya-email>', 'Maya', 'Allan', '<preview-bcrypt-hash>', 'BROKER', 'active', now());
   ```
3. **Vercel → Settings → Environment Variables (Preview scope; branch-scoped to
   `cot-1-cotality-sync-standard` if desired). A redeploy applies them.**

   Required (these gate login):
   - `DATABASE_URL` = preview branch **pooled** string.
   - `DATABASE_URL_UNPOOLED` = preview branch **direct** string (Prisma requires both
     in the datasource config).
   - `SMTP_USER`, `SMTP_PASS` — presence of these is what makes SMTP "configured";
     without them the MFA OTP email cannot send.

   Recommended:
   - `MFA_EMAIL` — override inbox for the OTP; when absent the code goes to the seeded
     agent email.

   Optional (code defaults exist — Office 365 / port 587 / contact@mallan.nyc):
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`.

   NOT required for this password+MFA flow (do not create unused vars):
   - `SESSION_SECRET`, `NEXTAUTH_SECRET` — sessions are DB-backed random-UUID tokens;
     no session-signing secret is involved.
   - `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SITE_URL` — cookies are host-scoped and the
     post-login redirect is relative.

4. **Broker login IS MFA-enforced by role** (regardless of any `mfa_enabled` field),
   so `SMTP_USER`/`SMTP_PASS` must work or Maya gets the MFA prompt but no code.
   (Code now fail-closes to 503 if no channel delivers — no more "valid login, no code".)

> **A successful login is NOT read-only on the preview DB.** It writes `mfa_sessions`,
> `sessions`, an `audit_events` row, and updates `agents.last_login`. Those preview
> tables are only empty *before* the first login — expected, on the preview branch only.

## Part 2 — Production monitoring role (column-scoped, read-only)
Run on the **production DB** as owner. **Confirm the DB name first** — do not assume:
```sql
SELECT current_database(), current_schema();   -- use the returned name below
```
Physical tables confirmed from Prisma `@@map`: `sync_state`, `media_sync_state`. The
status route now selects ONLY these columns, so a column-scoped grant is sufficient:
```sql
CREATE ROLE mallan_status_ro
  LOGIN PASSWORD '<GENERATED_SECRET>'
  NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

REVOKE ALL ON DATABASE <VERIFIED_DB_NAME> FROM mallan_status_ro;
GRANT CONNECT ON DATABASE <VERIFIED_DB_NAME> TO mallan_status_ro;

REVOKE ALL ON SCHEMA public FROM mallan_status_ro;
GRANT USAGE ON SCHEMA public TO mallan_status_ro;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM mallan_status_ro;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM mallan_status_ro;

GRANT SELECT (resource, last_watermark, last_run_at, last_run_status)
  ON public.sync_state TO mallan_status_ro;
GRANT SELECT (resource, last_photos_change, last_run_at, last_run_status)
  ON public.media_sync_state TO mallan_status_ro;

ALTER ROLE mallan_status_ro SET default_transaction_read_only = on;
ALTER ROLE mallan_status_ro SET statement_timeout = '5s';
ALTER ROLE mallan_status_ro SET idle_in_transaction_session_timeout = '5s';
```
Positive verification (allowed):
```sql
SET ROLE mallan_status_ro;
SELECT resource, last_watermark, last_run_at, last_run_status FROM sync_state;
SELECT resource, last_photos_change, last_run_at, last_run_status FROM media_sync_state;
RESET ROLE;
```
Negative verification (must be DENIED):
```sql
SET ROLE mallan_status_ro;
SELECT * FROM leads LIMIT 1;                     -- permission denied
SELECT * FROM agents LIMIT 1;                    -- permission denied
INSERT INTO sync_state(resource) VALUES ('x');   -- permission denied
RESET ROLE;
```
Rollback:
```sql
REVOKE SELECT ON public.sync_state, public.media_sync_state FROM mallan_status_ro;
REVOKE USAGE ON SCHEMA public FROM mallan_status_ro;
REVOKE CONNECT ON DATABASE <VERIFIED_DB_NAME> FROM mallan_status_ro;
DROP ROLE mallan_status_ro;
```

## Part 3 — MONITORING_DATABASE_URL
- Preview scope only (branch-scoped if supported); read-only **pooled** string for
  `mallan_status_ro`; redeploy required; never `NEXT_PUBLIC_`; consumed only by
  `lib/cotality/monitoring-prisma.ts`. The status page only shows production values
  when a read actually SUCCEEDS (states: not_configured / unreachable / unauthorized / ok).

## Part 4 — Verification (after A–C)
1. redeploy PR #509; 2. open the immutable deployment URL; 3. Maya signs in
(password → MFA OTP); 4. redirect to `/crm/system-status`; 5. Application
environment = Preview; 6. Monitoring data source = Production — read only;
7. connection modes show pooled/direct/unknown only (no secrets); 8. Property
target/config/observed separate; 9. Media target/config/observed separate;
10. cursor lag vs run age separate badges (failed run ≠ healthy); 11. no
secrets/hosts/IDs in page source or API JSON; 12. runtime logs clean; 13. record
immutable URL + screenshots.

Not "reviewable" until all 13 pass. No schedule change, no COT-2/COT-3, no merge until then.
