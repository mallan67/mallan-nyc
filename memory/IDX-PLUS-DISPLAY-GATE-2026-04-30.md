# Retired record — IDX Plus display-gate incident report

This file was a dated working record from 2026-04-30. It is retired: it is not current instruction and
it is not an authority for any implementation, hold or provider fact.

- Current authority: `MALLAN-PLATFORM-MASTER-PLAN.md`. Current state, holds and stop point:
  `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`.
- Full historical text: Git history on `main` (frozen at `3656a423`), for example
  `git show 3656a42333f2be5e837015e0165387ea96fe99b6:memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`.
- The display-gate behavior it established is implemented in `lib/compliance/gates.ts`
  (`GateOptions.idxPlusPreFiltered`) and the writer gate computation, pinned by
  `lib/compliance/__tests__/compliance-gates.test.ts`, and documented in
  `docs/architecture/COTALITY-COMPLETE-REFERENCE.md` §8 (Distribution Gates). Read those, not this record, and
  re-verify against live Cotality before relying on them.
- This path remains as a temporary dependency of frozen public search: `lib/search/suggest-classify.ts` cites it,
  and that citation is removed when public search is converted to the live Cotality API. Other files may also cite
  it: the compliance index (`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`), `README.md`, the Rule 4 failure
  message in `scripts/ci/repo-hygiene.mjs`, code comments and documents. Delete this file only in the same change
  that removes or re-points the last citation (`git grep -F IDX-PLUS-DISPLAY-GATE-2026-04-30` must then find none).
