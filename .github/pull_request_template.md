<!-- See CLAUDE.md §J "Codex findings — classify before acting" for the full rule. -->

## Codex finding classification (if this PR acts on a Codex finding)
- [ ] Classified each finding: **A** static · **B** live-field · **C** compliance · **D** runtime · **E** artifact
- [ ] Relied on Codex as evidence for **Class A only**
- [ ] Class B/C/D verified independently — command/notice/proof: _______________

## Cotality field change (if any field added/changed)
- [ ] Live field confirmed (`trestle:audit-server` / `trestle:diff` / `trestle:probe` / `$metadata`)
- [ ] Traced: select → map → `raw_data` → DTO (DB path) → DTO (Trestle-direct path) → render/save
- [ ] Numeric fallback zero-safe (`0` not swallowed)
- [ ] Tests added

## Generated artifact (if a generated file changed)
- [ ] Generator ran; source files unchanged unless explicitly scoped
- [ ] Generated "unknown" count is zero or explicitly accepted
- [ ] `npm run test:rls` (canonical form-binding + RLS-reporter suites) run locally (**not in PR CI**) — result: _______________

## Green-checks statement
- [ ] For each passing check, stated **what it proves AND what it does not prove**
