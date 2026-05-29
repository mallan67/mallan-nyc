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

## Remaining forms (pending Maya's pilot approval)
RENTAL-FORM-REDESIGN · BUYER-DEAL-FORM · TENANT-DEAL-FORM · SALE-FORM-WITH-TOOLS · RENTAL-FORM-WITH-TOOLS · dashboard · dev — _to be migrated + verified after pilot sign-off._
