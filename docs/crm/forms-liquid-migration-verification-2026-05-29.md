# CRM Forms → Liquid / Tailwind v4 — Playwright Verification Evidence

Branch: `feat/crm-forms-liquid-tailwind-v4` · Date: 2026-05-29
Method: static-serve `public/crm` + Playwright (Chromium), auth gate stubbed so the form renders.
Verifier (untracked): `scripts/__pw-verify-forms.mjs`.

## SALE-FORM-REDESIGN.html — PASS

| Check | Result |
|---|---|
| Redirected to login | **no** (rendered) |
| `cdn.tailwindcss.com` console warning | **NONE** ✅ (the Vercel production warning is gone) |
| `css/forms.css` linked + in `document.styleSheets` | **yes / yes** |
| `.form-card` computed | `border-radius: 18px`, float-shadow present, font Inter ✅ |
| `.sub-tab-pill.active` background | `rgb(10,10,10)` dark (NOT blue) ✅ |
| body font | Inter ✅ |
| Console errors | none |
| Regression `npm run crm:test` | 39/39 PASS (baseline 39/39) |
| Structural drift | head only (7+/15−); zero `data-rls`/`onclick`/`id`/`name` hooks touched |

Screenshots: `__pw-shots/SALE-FORM-REDESIGN-fold.png`, `__pw-shots/SALE-FORM-REDESIGN-full.png`.

## RENTAL-FORM-REDESIGN.html — PASS (commit ac971586)
Before: blue active pill `rgb(37,99,235)`, flat cards, Manrope. After: no CDN warning, `forms.css` applied, `.form-card` 18px+float-shadow, active pill `rgb(10,10,10)`, Inter. Head-only diff (7+/15−), no hooks touched, crm:test 39/39. (Pre-existing JS error `companyKey is not defined` — unrelated to CSS.) Screenshots: `__pw-shots/RENTAL-FORM-REDESIGN-{BEFORE-,}fold.png`.

## BUYER-DEAL-FORM.html + TENANT-DEAL-FORM.html — PASS (commit a9f36ed0)
Both: no CDN warning, `forms.css` applied, `.form-card` 18px, active pill `rgb(10,10,10)`, head-only diff (7+/15−), no hooks touched, crm:test 39/39. Screenshots: `__pw-shots/BUYER-DEAL-FORM-fold.png`, `__pw-shots/TENANT-DEAL-FORM-fold.png`.

## Remaining (different/larger structure — inspect before migrating)
dashboard.html · SALE-FORM-WITH-TOOLS.html · RENTAL-FORM-WITH-TOOLS.html · dev.html — _pending Maya's go to continue._
