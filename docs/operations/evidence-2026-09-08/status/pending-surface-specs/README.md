# Pending surface specs — the four status surfaces not yet corrected (2026-09-08, evening)

These four test files are SPECIFICATIONS for the surfaces the status correction has not reached yet. They were
written first (test-first) and are parked here with a `.pending` extension so they are outside the TypeScript
program and the jest run — the core is green and committed; these are not.

Restore one verbatim (`mv <name>.test.ts.pending ../../../../../tests/runtime/<name>.test.ts`) when its surface is
implemented, then make it pass.

| Spec | Surface it specifies | What it needs first |
|---|---|---|
| `crm-status-options-route.test.ts.pending` | `GET /api/crm/status-options?type=sale\|rental` — the per-transaction workflow choices (word, label, canonical token, canonical label, requiredFacts) the CRM UIs build their status panels from | `app/api/crm/status-options/route.ts` does not exist yet |
| `manage-listings-status-presentation.test.ts.pending` | manage-listings renders `status_presentation` (token + transaction label), builds its panels from the endpoint per transaction, sends `{ status, facts }`, and carries no `MlsStatus` | the endpoint above + `public/crm/js/manage/manage-listings.js` rewrite |
| `portal-status-label.test.ts.pending` | the portal DTOs carry `status_label` per transaction (Closed → Sold / Rented, legacy normalized, unknown → unavailable) | `lib/compliance/dto.ts` + the portal pages |
| `cma-status-tokens.test.ts.pending` | every CMA / comp path stores the exact Cotality token with a per-transaction label and real close facts, and never mixes sale with rental | `lib/cma/engine.ts`, `lib/comps/**`, the prospect comps route, the pitch packets |

The Search surface (four modes + executor + browser Comparables tool) has no spec file here: its agent died before
writing one. Its requirements are recorded in `../STATUS-PROVIDER-TOKENS.md` and the discovery findings.
