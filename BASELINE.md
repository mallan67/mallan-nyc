# BASELINE for mallan-nyc

This repository has a canonical baseline used for all future work:

- Branch: `baseline/clean-main-20251120`
- Tag:    `baseline-clean-main-20251120`
- Baseline merged into `main` on 2025-11-20 (PR #20)
- Baseline commit: bdbb1cb (Cleanup: remove placeholder lockfile backups)
- Baseline file from session: /mnt/data/01.txt

Recommended startup sequence for any new work or for resuming:
1. git fetch origin --prune
2. git checkout -B work-from-baseline origin/baseline/clean-main-20251120
3. npm ci   # or npm install if you prefer
4. npm run build
5. Run tests and lint
6. Open/resolve PRs one-by-one against main; prefer tmp/cherry-* branches created by automation.

Helper scripts in repo:
- interactive-resolve-fixed.ps1
- manage-branches-auto.ps1
- manage-branches-interactive.ps1
- fix-conflicts-and-prs.ps1
- process-remaining-prs.ps1

Policy for new assistants:
- Always start from origin/baseline/clean-main-20251120 (or tag baseline-clean-main-20251120).
- Do not recommend changes that don’t explicitly start from the baseline.
