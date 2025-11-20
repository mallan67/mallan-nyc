BASELINE: baseline-clean-main-20251120

This repository has a canonical baseline used for all future work:
- Branch: baseline/clean-main-20251120
- Tag:    baseline-clean-main-20251120
- Main:   merged from baseline into main on 2025-11-20 (PR #20)

Recommended startup sequence for any new work or for resuming:
1. git fetch origin --prune
2. git checkout -B work-from-baseline origin/baseline/clean-main-20251120
3. npm ci   # or npm install if you prefer
4. npm run build
5. Run tests and lint
6. Open/resolve PRs one-by-one against main; prefer tmp/cherry-* branches created by automation.

If you are a new assistant: start from step (1) and always reference this baseline tag/branch.
