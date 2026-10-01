<!-- See CLAUDE.md §J "Codex findings — classify before acting" for the full rule. -->

## Codex finding classification (if this PR acts on a Codex finding)
- [ ] Classified each finding: **A** static · **B** live-field · **C** compliance · **D** runtime · **E** artifact
- [ ] Relied on Codex as evidence for **Class A only**
- [ ] Class B/C/D verified independently — command/notice/proof: _______________

## Cotality field change (if any field added/changed)
- [ ] Live field confirmed (`npm run cotality:verify` / live Cotality `$metadata` query)
- [ ] Traced: select → map → `raw_data` → DTO (DB path) → DTO (Cotality-direct path) → render/save
- [ ] Numeric fallback zero-safe (`0` not swallowed)
- [ ] Tests added

## Generated artifact (if a generated file changed)
- [ ] Generator ran; source files unchanged unless explicitly scoped
- [ ] Generated "unknown" count is zero or explicitly accepted

## Green-checks statement
- [ ] For each passing check, stated **what it proves AND what it does not prove**
