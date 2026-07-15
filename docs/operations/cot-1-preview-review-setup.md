# COT-1 preview review setup — operator runbook (HELD actions)

The `/crm/system-status` code is deployed, but two **held infrastructure steps** are
required before Maya can sign in and review it. These are Vercel env + Neon changes
(CLAUDE.md §A.7) — an agent must not flip them autonomously; they are done by Maya
in the Vercel/Neon dashboards (or by an agent only with explicit Maya approval).
**Never print or commit any connection string or password.**

## Root cause
`/api/auth/login` 500s in Preview with `Environment variable not found: DATABASE_URL`
→ the Preview environment has no application database configured. The login UI now
shows an honest message ("The sign-in service is unavailable. Your credentials were
not rejected.") instead of blaming the user's internet — but login still cannot
succeed until Preview has a working app DB.

## Part 1 — Preview application database (makes login work)
1. Create/confirm a dedicated **Neon preview/development branch** (NOT `main`/production).
2. In Vercel → Project → Settings → Environment Variables, set for the **Preview**
   scope only:
   - `DATABASE_URL` = the preview branch **pooled** connection string (`-pooler` host).
   - `DATABASE_URL_UNPOOLED` = the preview branch direct string (Prisma `directUrl`).
   - all auth/session vars `/api/auth/login` needs (e.g. `SESSION_SECRET`, MFA/email
     vars) — copy the non-production values.
   - **Never** point Preview `DATABASE_URL` at the production branch.
3. Seed a **Maya broker account** on the preview branch compatible with the existing
   login (same email; a broker `Agent` row + password hash via the project's seed
   path). This is a write to the PREVIEW DB only.
4. Redeploy the branch; confirm `POST /api/auth/login` returns 200 and redirects.

## Part 2 — Production monitoring (read-only) — populates live values
The status page reads production run/cursor state via `MONITORING_DATABASE_URL`
(separate from the app DB). Until it is set, the page correctly shows
**"Production monitoring unavailable."**

1. On the **canonical production Neon** DB, create a least-privilege read-only role
   (owner runs this; SELECT on ONLY the two status tables — no PII, no writes):
   ```sql
   CREATE ROLE mallan_status_ro WITH LOGIN PASSWORD '<STRONG_SECRET>';
   GRANT CONNECT ON DATABASE neondb TO mallan_status_ro;
   GRANT USAGE ON SCHEMA public TO mallan_status_ro;
   GRANT SELECT ON TABLE public.sync_state, public.media_sync_state TO mallan_status_ro;
   -- Verify least privilege:
   --   SET ROLE mallan_status_ro; SELECT * FROM sync_state;               -- allowed
   --   INSERT INTO sync_state(resource) VALUES ('x');                      -- must be DENIED
   --   SELECT * FROM leads;                                               -- must be DENIED (no grant)
   ```
2. Set `MONITORING_DATABASE_URL` (Preview scope; optionally Production) = the **pooled**
   connection string for `mallan_status_ro`. It is used ONLY by
   `/api/crm/system-status`; never by application routes; never sent to the client.
3. Redeploy; the page's "Monitoring data source" flips to "Production — read only"
   and shows real last-run + cursor lag.

## Part 3 — Verification (per Maya's checklist)
1. Sign in via the deployment-specific URL → success, redirect to `/crm/system-status`.
2. Page shows **Application environment: Preview**.
3. Production monitoring values labeled **Production — read only**.
4. Property target / configured / last run / cursor lag display.
5. Media target / configured / last run / cursor lag display.
6. App-DB and Monitoring-DB pooling shown as booleans (no secrets).
7. Vercel runtime logs show no 500s on `/api/auth/login` or `/api/crm/system-status`.
8. Record the immutable deployment URL.

## Scope
No schedule change, no COT-2/COT-3, no merge until Maya can sign in and review the
page successfully.
