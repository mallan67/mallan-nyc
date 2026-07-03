# rotate-db-keys — host-guard patch (REPORT ONLY — NOT APPLIED) — 2026-06-02

> **Status: PROPOSED DIFF ONLY. Not applied.** `.github/workflows/**` is HELD (CLAUDE.md §A.7).
> Do not run `rotate-db-keys` until this guard is merged. This patch makes the workflow
> **fail-closed** if it ever resolves any host other than the canonical production endpoint
> `ep-cold-waterfall-adno3ao2`, and pins the compute endpoint so resolution is deterministic.

## Why
The Jun-1 rotation wrote a **royal-dawn** connection string into production because the workflow:
- selects the branch via `select(.primary==true) | head -n1` (no pin; `NEON_BRANCH_ID` is unset),
- requests `connection_uri` with **no `endpoint_id`**, and
- writes whatever host comes back to GH secrets + Vercel prod env + redeploys **with no validation**.

Canonical good host (confirmed by Maya 2026-06-02):
`ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech` (pooled) /
`ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech` (direct). Endpoint id: `ep-cold-waterfall-adno3ao2`.

## Patch (3 changes)

### Change 1 — add expected-host + endpoint-id env (after line 25, in the job `env:` block)
```diff
       DATABASE_NAME: ${{ secrets.NEON_DATABASE_NAME || vars.NEON_DATABASE_NAME || 'neondb' }}
+      # Production RW compute endpoint on morning-bread-68708332. Not a secret.
+      # Used to (a) pin connection_uri resolution and (b) fail-closed if the API
+      # ever returns a different host (e.g. the stale ep-royal-dawn-ad6eh8t2).
+      NEON_ENDPOINT_ID: ${{ vars.NEON_ENDPOINT_ID || 'ep-cold-waterfall-adno3ao2' }}
+      EXPECTED_DB_ENDPOINT: ${{ vars.EXPECTED_DB_ENDPOINT || 'ep-cold-waterfall-adno3ao2' }}
```

### Change 2 — pin the endpoint in the connection_uri call (lines 288–300)
```diff
           get_connection_uri() {
             local pooled="$1"
             local out="$2"
-            local encoded_database encoded_role encoded_branch status
+            local encoded_database encoded_role encoded_branch encoded_endpoint status endpoint_q

             encoded_database=$(jq -rn --arg v "$DATABASE_NAME" '$v|@uri')
             encoded_role=$(jq -rn --arg v "$ROLE" '$v|@uri')
             encoded_branch=$(jq -rn --arg v "$BRANCH_ID" '$v|@uri')
+            # Pin the compute endpoint when configured so resolution is deterministic
+            # regardless of which branch is flagged primary.
+            endpoint_q=""
+            if [ -n "${NEON_ENDPOINT_ID:-}" ]; then
+              encoded_endpoint=$(jq -rn --arg v "$NEON_ENDPOINT_ID" '$v|@uri')
+              endpoint_q="&endpoint_id=$encoded_endpoint"
+            fi

-            status=$(request_json GET "$neon_api/projects/$PROJECT_ID/connection_uri?branch_id=$encoded_branch&database_name=$encoded_database&role_name=$encoded_role&pooled=$pooled" "" "$out")
+            status=$(request_json GET "$neon_api/projects/$PROJECT_ID/connection_uri?branch_id=$encoded_branch&database_name=$encoded_database&role_name=$encoded_role&pooled=$pooled$endpoint_q" "" "$out")
             require_status "$status" "$out" "Retrieve Neon connection URI"
             jq -r '.uri // .connection_uri // empty' "$out"
           }
```

### Change 3 — fail-closed host assertion BEFORE writing anything (insert after line 311, before line 313 `gh secret set`)
```diff
           echo "::add-mask::$pooled_uri"
           echo "::add-mask::$direct_uri"
+
+          # ---- FAIL-CLOSED HOST GUARD (2026-06-02) -------------------------------
+          # Refuse to publish credentials unless BOTH resolved URIs point at the
+          # canonical production endpoint. This is the guard whose absence let the
+          # Jun-1 rotation ship ep-royal-dawn-ad6eh8t2 to production.
+          assert_expected_host() {
+            local uri="$1" label="$2" h
+            # host = bytes between '@' and the next ':' '/' or '?'  (no user:pass)
+            h=$(printf '%s' "$uri" | sed -E 's#^[a-z]+://[^@]+@([^:/?]+).*#\1#')
+            case "$h" in
+              "${EXPECTED_DB_ENDPOINT}".*|"${EXPECTED_DB_ENDPOINT}"-pooler.*) : ;;  # OK
+              *)
+                echo "::error::Rotation ABORTED: $label resolved host '$h' != expected '${EXPECTED_DB_ENDPOINT}'. Refusing to write production credentials or redeploy."
+                echo "$(date -u) Rotation aborted: $label resolved unexpected host $h (expected ${EXPECTED_DB_ENDPOINT})." >> rotation-history.log
+                exit 1 ;;
+            esac
+          }
+          assert_expected_host "$pooled_uri" "pooled_uri"
+          assert_expected_host "$direct_uri" "direct_uri"
+          # -----------------------------------------------------------------------

           printf '%s' "$pooled_uri" | gh secret set DATABASE_URL --repo "$REPO" --app actions
```

## Optional hardening (follow-ups, not required for the guard)
- **Post-redeploy probe + auto-rollback:** after the redeploy (line 389), poll
  `https://mallan.nyc/api/agents/maya-allan/listings`; if it 500s, re-upsert the previous env and
  alert. (Requires capturing the prior env value first.)
- **Pin the branch too:** set repo **variable** `NEON_BRANCH_ID` = cold-waterfall's branch id so the
  `select(.primary==true)` path is never used. (Get the id from Console / BLOCK 3 of the query pack.)
- **Fix Neon `primary` designation:** if Console shows the stale branch is flagged `primary`, that is
  the deeper misconfig — correct it so "primary" and "production" agree.

## Test plan before re-enabling rotation (after merge, Maya-approved)
1. `workflow_dispatch` a **dry-run fork** or a staging run that stops after `assert_expected_host`
   (e.g. temporarily replace the `gh secret set`/`upsert_vercel_env`/redeploy block with `echo`),
   confirming the guard passes for cold-waterfall and would abort for royal-dawn.
2. Only then allow a real rotation.

*Report only. No file edited. Author: Claude (Opus 4.8), 2026-06-02.*
