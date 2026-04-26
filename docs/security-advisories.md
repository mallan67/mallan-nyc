# Security Advisories — Triage Log

Living document. Updated whenever `npm audit` flags a new vulnerability that doesn't auto-fix, or when a previously documented one is resolved.

**Process:** every PR that touches dependencies should run `npm audit` and update this file if anything new appears or old advisories close.

---

## Triage outcome — 2026-04-25 (PR 13 of master refactor)

| Metric | Before | After |
|---|---|---|
| Critical | 2 | **0** |
| High | 7 | 1 |
| Moderate | 11 | 2 |
| **Total** | **20** | **3** |

`npm audit fix` (no `--force`) cleared 17 of 20 advisories via transitive dependency updates. Only `package-lock.json` changed; no direct dep version bumps.

---

## Open advisories (3 remaining as of 2026-04-25)

### 1. `xlsx` — high severity, **NO FIX AVAILABLE**

**Advisories:**
- [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) — Prototype Pollution in SheetJS
- [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) — ReDoS

**Direct dep?** YES (`xlsx@^0.18.5` in `package.json`)

**Why no fix?** SheetJS moved their fixes to a paid commercial version (`@sheetjs/cf-xlsx` from sheetjs.com). The open-source `xlsx` package on npm is unmaintained.

**Attack surface in this codebase:**
- `app/api/crm/sales/prospects/import/route.ts` — runtime API route. Agents/brokers upload spreadsheets; uploaded data flows through xlsx parsing.
- `scripts/rebuild-past-deals.js`, `scripts/validate-field-mapping.js`, `scripts/test-full-mapping.js`, `scripts/fix-wrong-matches.js`, `scripts/validate-deals.js` — admin-only ops scripts. Not exposed to user input.

**Risk classification:** Medium-Real.
- The API route is auth-gated (broker/agent role required) — not anonymous internet attackers.
- Authenticated brokers/agents are trusted, but a compromised agent account could exploit this for prototype pollution → potential RCE.
- ReDoS would impact a single Vercel function, recoverable.

**Mitigation plan:**
- **Scheduled as separate PR (PR 13b — `chore/migrate-xlsx-to-exceljs`).** Migrate the import route + scripts to `exceljs` (maintained, MIT, similar API).
- Until then: route-level safeguards already in place — auth gate, file size limit, SHIELD-Act audit logging.

**Decision:** Accept residual risk pending PR 13b; ensure no new code paths add xlsx parsing on untrusted input.

---

### 2. `postcss` (transitive via `next`) — moderate severity

**Advisory:** [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) — XSS via Unescaped `</style>` in CSS Stringify Output

**Direct dep?** NO (transitive via `next@^16.1.6`)

**Why no auto-fix?** `npm audit fix` would resolve this only via `--force`, which downgrades Next.js to 9.3.3 — a 7-major-version downgrade. Unacceptable.

**Attack surface in this codebase:** PostCSS only processes our own CSS files at build time (Tailwind, our component styles). It does not process attacker-controlled input. The advisory requires attacker-controlled CSS to fire.

**Risk classification:** Low-Theoretical.
- We do not accept or render attacker-controlled CSS.
- PostCSS runs in our build pipeline (Vercel + local dev), not at user-facing runtime.

**Mitigation plan:** Wait for Next.js to bump their internal postcss. Re-check on every Next.js minor/major upgrade.

**Decision:** Accept residual risk. Track on every Next.js upgrade.

---

### 3. `next` — moderate severity

**Advisory:** Same chain as advisory #2 — `next` depends on the vulnerable `postcss` version.

**Direct dep?** YES (`next@^16.1.6`)

**Why no auto-fix?** Same reason — `npm audit fix --force` would downgrade to Next.js 9.

**Risk classification:** Low-Theoretical, same as #2.

**Decision:** Accept residual risk. Closes when Next.js bumps internal postcss.

---

## Resolved (since 2026-04-25)

The following advisories were resolved by the `npm audit fix` run on 2026-04-25:

| Package | Severity | Resolution |
|---|---|---|
| `handlebars` | **critical** | transitive bump |
| `protobufjs` | **critical** | transitive bump |
| `@prisma/config` | high | transitive bump |
| `defu` | high | transitive bump |
| `effect` | high | transitive bump |
| `picomatch` | high | transitive bump |
| `prisma` (CVE chain) | high | transitive bump (NOTE: this is from the prisma 6→7 work scheduled separately as PR 12) |
| `@aws-sdk/xml-builder` | moderate | transitive bump |
| `@sentry/webpack-plugin` | moderate | transitive bump |
| `axios` | moderate | transitive bump (SSRF + Cloud Metadata Exfiltration) |
| `brace-expansion` | moderate | transitive bump (ReDoS) |
| `dompurify` | moderate | transitive bump |
| `fast-xml-parser` | moderate | transitive bump |
| `follow-redirects` | moderate | transitive bump |
| `nodemailer` | moderate | transitive bump |
| `protocol-buffers-schema` | moderate | transitive bump |
| `uuid` | moderate | transitive bump (buffer bounds) |

---

## Process going forward

1. **Per-PR check.** Any PR touching deps runs `npm audit` and updates this doc.
2. **Monthly sweep.** First of each month, run `npm audit fix` to capture new transitive bumps.
3. **Quarterly review.** Re-evaluate accepted risks (especially `xlsx` — confirm PR 13b ships, escalate if not).
4. **CI surfacing.** `pr-check` workflow logs `npm audit` summary as informational; does NOT block PRs (advisories are decision points, not test failures).

## Cross-references

- `package.json` — direct dep declarations
- `package-lock.json` — full resolved tree
- `memory/REFACTOR-2026-04-25.md` — master refactor plan (PR 13 = this; PR 12 = Prisma 7 upgrade; PR 13b = xlsx → exceljs migration if scheduled)
