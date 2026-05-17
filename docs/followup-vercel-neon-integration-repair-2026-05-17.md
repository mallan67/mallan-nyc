# Follow-up: Vercel ↔ Neon integration repair

**Status:** OPEN · Tracking · Report-only spec until Maya approves work
**Filed:** 2026-05-17T00:36Z
**Author:** Claude Code (under Maya direction)

---

## Why this exists

Per Maya's correction on 2026-05-17: Neon Console shows **8 / 5000 branches** on the production project — well below the cap. Yet the Vercel "Neon branching" check has been **repeatedly failing on every fresh push** to `feat/adaptive-white-border-crop` (PR #149) and requiring Maya to manually click **Skip** each time.

| Push | SHA | Skip required | Real branch count when checked |
|------|-----|--------------:|-------------------------------:|
| 1 | `dee36576` | yes | 8 / 5000 |
| 2 | `3797ce8c` | yes | 8 / 5000 |
| 3 | `aeea758c` | (not observed) | 8 / 5000 |
| 4 | `915a734a` | yes (deployment `BAgcasV52`) | 8 / 5000 |

**This is not a quota failure.** The Vercel↔Neon integration is failing to provision a preview branch for some other reason — most likely one of:

| Class | Hypothesis |
|-------|-----------|
| **Integration binding** | The Vercel integration is bound to a different Neon project than the one Maya is reading branch counts from (e.g. the live project is `neon-green-school` but the integration is pointed at a stale or unrelated project) |
| **Auth / token** | The Neon API token used by the integration has expired, was rotated, or has lost the `branches:write` scope |
| **Stale Skip state** | Vercel's Skip click is per-SHA — a fresh push triggers a fresh check that doesn't inherit the prior Skip |
| **Automatic cleanup setting** | An aggressive auto-cleanup rule deletes the just-provisioned branch before the build can attach (race condition) |
| **Vercel webhook desync** | Vercel reports "limit exceeded" cached from the old free-tier check, even after the Neon side is paid + uncapped |
| **Region / endpoint mismatch** | Integration provisioning targets a region/endpoint that no longer exists on the Neon side |

## Approved investigation steps (Maya's spec)

Order is intentional — least invasive first.

| # | Step | Action | Risk | Reversible |
|---|------|--------|------|-----------:|
| 1 | **Confirm integration binding** | Vercel UI → mallan-nyc project → Settings → Integrations → Neon → Configure. Read the bound Neon project ID/slug. Compare against the Neon project that shows 8 / 5000 (likely `neon-green-school`). | Read-only | n/a |
| 2 | **Verify integration auth** | Neon Console → API Keys → check the key the Vercel integration uses. Confirm it's still valid + has `branches:write` scope. Check Neon Console → Activity log for recent failed API calls from the integration. | Read-only | n/a |
| 3 | **Check automatic-cleanup setting** | Vercel UI → Neon integration config → "automatic branch deletion on deploy" or similar toggle. If enabled aggressively (delete on every deploy), it may be racing the provisioner. | Read-only | n/a |
| 4 | **Unlink + relink (ONLY after Maya approval)** | Vercel UI → Settings → Integrations → Neon → Remove → re-add via Vercel marketplace → reconfigure to point at the correct Neon project. | **High** — temporarily breaks `DATABASE_URL` plumbing if not done in maintenance window. Requires re-verifying production env var sync afterward. | Yes (re-link) |
| 5 | **Contact Neon + Vercel support** | If steps 1–4 don't resolve, open support tickets with both vendors. Include: branch counts, failed check timestamps, deployment IDs (`dpl_BAgcasV52`, etc.), Vercel integration ID (`store_K9l79ICRUTMsiRh2` per NEON.md §11.316). | None | n/a |

## Hard holds during investigation

- ❌ Step 4 (unlink/relink) only after Maya signs off in writing
- ❌ No changes to production `DATABASE_URL` or any other env var
- ❌ No code patches
- ❌ No migrations / cron triggers / R2 / CRM / Sentinel work
- ❌ No interaction with PR #147 / #148 / 5B / reconciliation

## Workaround in the interim

Per-PR Skip click. This is the active flow while PR #149 + future feature work proceeds. Each new push to a PR branch triggers a fresh failed check → Maya Skips it.

## Symptoms to verify investigation resolved this

1. Push any test commit to a feature branch
2. Wait for Vercel to start the preview build
3. **Expected (post-fix):** the Neon-branching check passes WITHOUT a Skip click
4. Neon Console branch count goes 8 → 9 (a new preview branch was provisioned) for the duration of the deploy
5. After cron-prune retention window (24 h default) the count returns to baseline

If after step 1–4 the check still fails, the investigation needs another round.

## Cross-references

- `NEON.md` §11 — Preview-branch integration architecture (cap was 10, now 5000 per Maya's plan upgrade)
- `docs/neon-vercel-preview-branch-limit-audit-2026-05-16.md` — recommended prune cron + integration toggle options (Option C "disable preview branching" remains UNSAFE per Maya's correction; A → B/E → D path stays)
- `lib/neon/branches.ts` — the cron helper. Continues to function regardless of integration state.
- `app/api/cron/neon-branch-prune/route.ts` — daily 04:00 UTC prune. Continues to function regardless of integration state.

## Standing by

This is a tracking document — no work executed. When Maya signals to start step 1 (read-only binding check via Vercel UI), I will:

- Wait for Maya's read of the Vercel UI + Neon Console
- Receive her observation
- Help diagnose / suggest next step

If Maya wants me to investigate any step that requires API access (e.g. read Neon project metadata via API), she'll need to grant `NEON_API_KEY` to my session OR run the read herself + share output.

---

## 2026-05-17 Update — Preview branch alias rotation blocked (new sub-symptom)

**Symptom observed during PR #149 verification:**
The Vercel preview branch alias `mallan-nyc-git-feat-adaptive-white-border-crop-mallan.vercel.app` failed to rotate to the latest preview deployment after subsequent pushes. Five preview deploys landed against the same branch alias (commits `dee36576`, `3797ce8c`, `aeea758c`, `915a734a`, `f3686521`); the alias stayed pinned to the **first** one (`dpl_3VozPXSUYhFNY5uK6sz2kapK9QGv` / `dee36576`) even after every subsequent deploy reached `state: READY`.

**Proof:**
```
$ curl -s "<branch-alias>/search?…" | grep -oE 'dpl=dpl_[A-Za-z0-9]+'
dpl=dpl_3VozPXSUYhFNY5uK6sz2kapK9QGv      ← oldest preview deploy

$ curl -s "<latest-immutable>/search?…" | grep -oE 'dpl=dpl_[A-Za-z0-9]+'
dpl=dpl_29Kmkr77mh2uw1V9tRXeGn84xvhV      ← newest preview deploy

# Yet the Vercel API for BOTH `dpl_29Kmkr77` and `dpl_BAgcasV52` reports
# `"alias": ["mallan-nyc-git-feat-adaptive-white-border-crop-mallan.vercel.app"]`
```

The CI workflow checks (`pr-check`, `guardrails`, `claude-review`) all SUCCESS on every push. The Vercel `StatusContext` rolls up the integration check-runs including the failing "Neon branching: Branch limit exceeded" — and that StatusContext stays PENDING.

**Working theory (NOT yet confirmed via Vercel docs):**
Alias auto-promotion on a preview branch is gated on either (a) all integration checks passing, or (b) the failing checks being explicitly Skipped. On the first push, Maya Skipped the Neon-branching check → alias rotated. Subsequent pushes had a fresh failing Neon check on each new deployment → alias rotation never advanced → alias stayed pinned to the first deploy.

If true, this means: **the Neon-side branch-cap check failure now has a second observable cost beyond the misleading red "Checks Failed" badge — it freezes the preview branch alias at whichever deploy was most recently Skipped, hiding every later code change behind a stale URL.** The Playwright test loop against the branch alias produced consistent measurements that LOOKED like the new code never deployed, when in fact the deploys were correct but the alias served the old one.

**Production aliases are unaffected.** PR #149 merged at 2026-05-17T06:08:14Z (merge commit `9fa75a4d`). The production deploy off main rotates `mallan.nyc` correctly because there is no per-PR check gating against production alias promotion.

**Handle later when working the integration repair (Section A.1–A.5 above).** Do NOT investigate now per Maya 2026-05-17.

**Investigative angles to pursue when this comes off hold:**

1. Read Vercel docs on "alias rotation behavior for preview deployments under failing integration check-runs" — confirm or refute the gating theory above.
2. Probe `GET /v2/deployments/{deploymentId}/check-runs` against `dpl_3VozPXSUYh` to see whether its check-run carries `conclusion: skipped` while subsequent deploys' check-runs carry a different conclusion that prevents promotion.
3. Test the theory by pushing a no-op commit on a different branch + Skipping the Neon check immediately on that deploy → does the alias rotate cleanly? If yes, theory confirmed.

---

**End of follow-up spec. No code modified.**
