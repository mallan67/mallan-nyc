# Cloudflare R2 — Setup Runbook

Single-source-of-truth provisioning guide for the R2 bucket that backs mallan-nyc media (Trestle photo cache, future floor-plan + Matterport mirror, signed-URL gating in the master refactor plan).

**This is the gate that PRs 3 and 4 of the master refactor (`memory/REFACTOR-2026-04-25.md`) check before they merge.** No PR depending on R2 lands until `npm run ops:r2-health` returns exit 0 in production.

---

## 0. Reality check — what's already in place

Before reading further, note: the R2 client wrapper and the Trestle→R2 cache flow already exist in this repo. `lib/images/r2.ts` and `lib/images/cache-listing-photos.ts` are in production. This runbook is about confirming the bucket + credentials + verification path so the *next* round of media work (PRs 3 and 4) starts green.

If `npm run ops:r2-health` already returns exit 0 against your environment, the rest of this doc is reference material.

---

## 1. Cloudflare account

You need a Cloudflare account with R2 enabled. Free tier is sufficient for current scale (10 GB storage / 1M Class A ops / 10M Class B ops included).

If you already have an account: log in to https://dash.cloudflare.com and confirm R2 appears in the left nav.

If not: https://dash.cloudflare.com/sign-up → enable R2 (requires payment method on file even for free-tier; no charges below limits).

---

## 2. Bucket

Create one bucket — exact name matters because it appears in env vars and CI logs.

1. Cloudflare dashboard → R2 → "Create bucket"
2. **Name:** `mallan-nyc-media`
3. **Location hint:** Eastern North America (matches Vercel `iad1` deploys)
4. **Default storage class:** Standard
5. Create

Confirm the bucket appears under R2 → Overview.

---

## 3. Public access (R2.dev URL)

R2 buckets are private by default. The cache flow needs publicly readable URLs (no Bearer auth) so client browsers can load `<img>` tags.

1. Bucket settings → Public access → "Allow access via R2.dev"
2. Cloudflare assigns a `pub-<hash>.r2.dev` hostname. Copy this — it goes into `R2_PUBLIC_URL`.
3. (Optional later) Bind a custom domain like `media.mallan.nyc` via Cloudflare DNS. Until then, `pub-<hash>.r2.dev` is fine.

⚠️ **Do not enable "Allow access via Public URL" for the entire bucket without a custom domain.** It works, but the auto-generated R2.dev URL has rate-limit caveats. The plan at PR 3 is custom domain.

---

## 4. API token (scoped)

Create a token scoped only to this one bucket. Never use a global account-key.

1. Cloudflare dashboard → R2 → "Manage R2 API Tokens"
2. "Create API token"
3. **Token name:** `mallan-nyc-media-rw`
4. **Permissions:** Object Read & Write
5. **Specify bucket:** select `mallan-nyc-media` (do NOT use "Apply to all buckets")
6. **TTL:** Custom (3 years from now). Calendar reminder set: rotate ~6 months before expiry.
7. Create
8. **Copy the displayed values immediately** — Cloudflare shows them only once:
   - `Access Key ID`
   - `Secret Access Key`
   - `Account ID` (also visible in dashboard URL)

If you lose the secret, you must delete the token and create a new one.

---

## 5. Local environment (`.env.local`)

Add to `.env.local` at the repo root:

```bash
# Cloudflare R2 — media storage backing
R2_ACCOUNT_ID=<your account id>
R2_ACCESS_KEY_ID=<from token creation step>
R2_SECRET_ACCESS_KEY=<from token creation step>
R2_BUCKET_NAME=mallan-nyc-media
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

⚠️ `.env.local` is gitignored by design. Never commit it. Never paste these values into a PR description, commit message, or any file that lands in git.

For pasting into `.env.example` (template only, no real values), add the keys with placeholder values:

```bash
# Cloudflare R2 — media storage. Get keys via dashboard → R2 → Manage API Tokens.
# https://dash.cloudflare.com/?to=/:account/r2/overview
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=mallan-nyc-media
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

---

## 6. Vercel environment

The same five env vars need to be set on the Vercel project for production + preview deploys.

### Via Vercel CLI (preferred — atomic + scriptable)

```bash
# Install if missing: npm i -g vercel
vercel link  # select mallan/mallan-nyc

# Production
vercel env add R2_ACCOUNT_ID production
vercel env add R2_ACCESS_KEY_ID production
vercel env add R2_SECRET_ACCESS_KEY production
vercel env add R2_BUCKET_NAME production
vercel env add R2_PUBLIC_URL production

# Preview (so PR previews work)
vercel env add R2_ACCOUNT_ID preview
vercel env add R2_ACCESS_KEY_ID preview
vercel env add R2_SECRET_ACCESS_KEY preview
vercel env add R2_BUCKET_NAME preview
vercel env add R2_PUBLIC_URL preview
```

Each `add` prompts for the value interactively — paste from your `.env.local`.

### Via Vercel dashboard (alternative)

https://vercel.com/mallan/mallan-nyc/settings/environment-variables — add each variable, scope to Production + Preview.

### Verify

```bash
vercel env ls           # all 5 R2_* should appear under both Production and Preview
vercel env pull         # downloads to .env.local for sanity check (overwrites)
```

---

## 7. Local verification

Once `.env.local` has all five vars:

```bash
npm run ops:r2-health
```

Expected output:

```
[r2-health] env vars present — running smoke test...
{
  "state": "ok",
  "config": { ... all "set" ... },
  "smoke": {
    "test_key": "health-checks/r2-smoke-<ts>-<rand>.bin",
    "upload_ms": <100ms typical>,
    "head_ms": <50ms typical>,
    "delete_ms": <100ms typical>,
    "public_url": "https://pub-<hash>.r2.dev/health-checks/...",
    "head_after_delete": "gone"
  }
}

[r2-health: OK] upload=<n>ms · head=<n>ms · delete=<n>ms
```

Exit code 0 = all green.

### Common failure modes

| Output starts with | Meaning | Fix |
|---|---|---|
| `[r2-health: MISCONFIGURED]` | One or more env vars missing | Re-check `.env.local`; ensure no trailing whitespace |
| `[r2-health: SMOKE FAILED]` with `Access Denied` | Token scoped to wrong bucket, or wrong permission | Recreate token with R/W on the correct bucket |
| `[r2-health: SMOKE FAILED]` with `NoSuchBucket` | `R2_BUCKET_NAME` doesn't match an existing bucket | Check spelling; create the bucket if missing |
| `[r2-health: SMOKE FAILED]` with `SignatureDoesNotMatch` | Wrong access key OR clock skew | Regenerate key; check system clock |
| `[r2-health: SMOKE FAILED]` with `head_after_delete: still_present` | Token has Object Write but not Object Delete | Re-issue token with Object Read & Write (full) |

---

## 8. Production verification

After Vercel env vars are set and the next preview deploy ships:

```bash
# Trigger a fresh preview build (any small commit + push to a PR)
# Then in the preview deploy, hit:

curl -s "https://<preview-url>/api/health" | jq .

# OR run the health script against prod env locally:
vercel env pull .env.production --environment production
node --env-file=.env.production --import tsx scripts/ops-r2-health.ts
```

Either path should report `state: ok`.

---

## 9. Maintenance

- **Token rotation:** every ~24 months. Calendar reminder when token is created (Step 4).
- **Bucket size:** monitor via Cloudflare dashboard → R2 → bucket → Metrics. Free tier ceiling 10 GB.
- **Egress:** R2 has zero egress cost — that's the whole point. No bandwidth alarms needed.
- **Object count:** monitor via Cloudflare dashboard. Class A operations (PUT/DELETE/COPY) are limited; Class B (GET/HEAD) are virtually unlimited.

If usage trends toward the free tier ceiling, upgrade R2 plan via Cloudflare dashboard. No code changes needed.

---

## 10. What this enables in the master refactor

Once R2 health is green and the env vars are in Vercel:

- **PR 3** (`refactor/03-media-sync-service`) — background sync that downloads changed Trestle media and stores in R2 keyed by `ResourceRecordKey` (per Trestle 2026-04-07 vendor guidance). Uses the existing `uploadToR2()` from `lib/images/r2.ts`.
- **PR 4** (`refactor/04-media-batch-rewrite`) — replace `/api/media/batch`'s live Trestle fetches with R2/Neon reads. Uses the existing `getR2PublicUrl()` and `keyFromUrl()`.

Both PRs declare `npm run ops:r2-health` exit 0 in their Production Verification Note as a merge gate.

---

## Cross-references

- `lib/images/r2.ts` — S3 client wrapper (already in repo)
- `lib/images/cache-listing-photos.ts` — Trestle→R2 caching during ISR (already in repo)
- `scripts/ops-r2-health.ts` — health check script (this PR)
- `memory/REFACTOR-2026-04-25.md` — master plan, PRs 3 & 4
- Cloudflare R2 docs: https://developers.cloudflare.com/r2/
- AWS SDK for R2 (S3 compat): https://developers.cloudflare.com/r2/api/s3/api/
