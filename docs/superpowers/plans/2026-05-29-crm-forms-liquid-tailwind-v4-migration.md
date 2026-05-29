# CRM Forms → Liquid Design System + Tailwind v4 (kill the CDN) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tailwind **Play CDN** (`cdn.tailwindcss.com`) on every standalone CRM form with a **compiled, static Tailwind v4 stylesheet** that bakes in the existing **Liquid design system** — removing the Vercel/console production warning *and* bringing the forms up to the gold/glass look the rest of mallan.nyc already uses.

**Architecture:** One committed Tailwind v4 source file (`public/crm/css/forms-source.css`) is compiled by a committed Node script (`scripts/build-crm-forms-css.mjs`, using the already-installed `@tailwindcss/postcss` — no new deps, no CLI) into a single static `public/crm/css/forms.css`. Each form drops the CDN `<script>` + inline `tailwind.config`, adds the Inter/Urbanist fonts, and links `forms.css`. The source file scans the form HTML (`@source`) so only the utilities the forms actually use are emitted, includes a **v3→v4 compatibility shim** (default border color, etc.) so the swap is visually safe, and adds a **Liquid component layer** that retones the forms' own classes (`.form-card`, `.field-input`, `.sub-tab-pill`, `.sidebar-tab`, `.radio-card`, `.company-dropdown`, media modal) from blue/flat → gold/glass/float-shadow.

**Tech Stack:** Tailwind v4.1.18 (`@tailwindcss/postcss`), PostCSS 8, Node ESM, Playwright (real-browser verification), `npm run crm:test` (172-smoke regression guard), Inter + Urbanist (Google Fonts).

---

## Hard constraints (apply to EVERY task)

1. **CSS / visual only.** Do **not** add/remove/rename any `id`, `name`, `data-rls-field`, `data-rls-ignore`, `onclick`, or any attribute/class a JS handler reads. Class changes are limited to *styling* existing classes.
2. **Compliance + save/load intact.** The sale/rental form save↔load contracts (PRs #267/#268/#270) and REBNY/UCBA bindings must not regress. `npm run crm:test` must stay green; run `npm run ucba:audit` (REGRESSIONS=0) and `npm run idx:validate` before any commit that touches a form.
3. **Held surface.** `public/crm/**` is a Maya-approval surface; she is directing this work. Do **not** deploy, do **not** modify `.github/workflows/**`, do **not** commit to `main` without Maya's go. Work on a branch.
4. **Proof-first.** Every converted form is verified in a **real browser with Playwright** (renders, **zero** `cdn.tailwindcss.com` console warning, fields/tabs/media-modal interactive, gold Liquid look) before it's called done. Source-grep is not proof.
5. **Prove-on-one.** Fully convert + Playwright-verify **SALE-FORM-REDESIGN.html first**, show Maya, get the nod, *then* roll out to the other 7.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `public/crm/css/forms-source.css` | Tailwind v4 entry: `@import "tailwindcss"`, `@source` globs, `@theme` tokens, v3→v4 compat shim, Liquid component layer for form classes | Create |
| `scripts/build-crm-forms-css.mjs` | Compile `forms-source.css` → `forms.css` via `@tailwindcss/postcss` (no new deps) | Create |
| `public/crm/css/forms.css` | Compiled, committed output linked by the forms | Generate (build artifact, committed) |
| `package.json` | add `"crm:css": "node scripts/build-crm-forms-css.mjs"` | Modify (scripts only) |
| `public/crm/SALE-FORM-REDESIGN.html` | Pilot form | Modify (head: drop CDN+config, add fonts+link; inline `<style>` retone) |
| `public/crm/RENTAL-FORM-REDESIGN.html` … +6 | Remaining forms | Modify (same pattern) |
| `scripts/__pw-verify-forms.mjs` | Playwright verifier (UNTRACKED temp) | Create, do not commit |
| `docs/crm/forms-liquid-migration-verification-2026-05-29.md` | Captured Playwright evidence per form | Create |

---

## Task 0: Branch + baseline green

**Files:** none (git + checks)

- [ ] **Step 1:** Create the working branch.
```bash
git checkout -b feat/crm-forms-liquid-tailwind-v4
```
- [ ] **Step 2:** Capture baseline so regressions are attributable.
```bash
npm run crm:test
```
Expected: 172/172 PASS (record the number).
- [ ] **Step 3:** Confirm the CDN is present in the 8 targets (the thing we're removing).
```bash
grep -l "cdn.tailwindcss.com" public/crm/*.html
```
Expected: SALE-FORM-REDESIGN, RENTAL-FORM-REDESIGN, BUYER-DEAL-FORM, TENANT-DEAL-FORM, dashboard, SALE-FORM-WITH-TOOLS, RENTAL-FORM-WITH-TOOLS, dev.

---

## Task 1: Tailwind v4 source file (tokens + compat shim + Liquid component layer)

**Files:**
- Create: `public/crm/css/forms-source.css`

- [ ] **Step 1: Write the source file.** Full content:

```css
/* ─────────────────────────────────────────────────────────────────────────
   forms-source.css — Tailwind v4 SOURCE for the standalone CRM forms.
   Compiled to forms.css by `npm run crm:css` (scripts/build-crm-forms-css.mjs).
   Replaces the dev-only cdn.tailwindcss.com (Tailwind v3) on every form.
   Design language mirrors public/crm/css/liquid-theme.css + app/globals.css.
   ───────────────────────────────────────────────────────────────────────── */

@import "tailwindcss" source(none);

/* Only scan the standalone forms — keeps forms.css lean. */
@source "../SALE-FORM-REDESIGN.html";
@source "../RENTAL-FORM-REDESIGN.html";
@source "../SALE-FORM-WITH-TOOLS.html";
@source "../RENTAL-FORM-WITH-TOOLS.html";
@source "../BUYER-DEAL-FORM.html";
@source "../TENANT-DEAL-FORM.html";
@source "../dashboard.html";
@source "../dev.html";

/* ── Liquid design tokens (mirror liquid-theme.css / globals.css) ── */
@theme {
  --color-brand-gold: #C4A052;
  --color-brand-gold-deep: #B8860B;
  --color-brand-dark: #0A0A0A;
  --color-brand-slate: #3d4556;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-display: 'Urbanist', system-ui, sans-serif;
}

:root {
  --ink:#0A0A0A; --muted:#64748b; --line:#e2e8f0; --bg:#FAFBFC;
  --gold:#C4A052; --gold-deep:#B8860B; --dark:#0A0A0A;
  --liquid:cubic-bezier(0.16,1,0.3,1);
  --float-shadow:0 40px 100px rgba(0,0,0,.03),0 8px 32px rgba(0,0,0,.02);
  --float-shadow-hover:0 40px 100px rgba(0,0,0,.06),0 16px 48px rgba(0,0,0,.04);
  --float-shadow-sm:0 4px 20px rgba(0,0,0,.04),0 1px 6px rgba(0,0,0,.02);
  --gold-glow:0 0 40px rgba(184,134,11,.12),0 0 80px rgba(184,134,11,.06);
  --gold-glow-sm:0 0 20px rgba(184,134,11,.1);
}

/* ── v3 → v4 COMPATIBILITY SHIM ──
   v4 changed defaults that the forms (authored against v3 CDN) rely on:
   - default border color was gray-200, now currentColor → restore it
   - default ring was 3px blue, now 1px currentColor → restore 3px
   Without this, every bare `border`/`ring` in the forms changes appearance. */
@layer base {
  *, ::before, ::after { border-color: #e5e7eb; }
  body { font-family: var(--font-sans); font-weight: 300; color: var(--ink);
         -webkit-font-smoothing: antialiased; background:#FAFBFC; }
  ::selection { background: var(--gold-deep); color:#fff; }
}

/* ── LIQUID COMPONENT LAYER (retone the forms' own classes) ──
   Specificity-matched to the forms' inline <style>; loaded AFTER it so it wins.
   Only visual properties — never layout-critical hooks. */

/* Sidebar nav tabs: blue active → gold */
.sidebar-tab { transition: all .3s var(--liquid); border-left:3px solid transparent; }
.sidebar-tab:hover { background:rgba(196,160,82,.05); border-left-color:rgba(196,160,82,.4); }
.sidebar-tab.active { background:rgba(196,160,82,.08); border-left-color:var(--gold-deep); color:var(--gold-deep); }
.sidebar-tab .tab-dot { width:8px; height:8px; border-radius:50%; background:#d1d5db; flex-shrink:0; }
.sidebar-tab.active .tab-dot { background:var(--gold-deep); box-shadow:0 0 0 3px rgba(196,160,82,.2); }
.sidebar-tab.completed .tab-dot { background:#16a34a; }

/* Sub-tab pills: blue → dark/gold */
.sub-tab-pill { transition:all .4s var(--liquid); padding:6px 16px; border-radius:9999px;
  font-size:13px; font-weight:500; white-space:nowrap; cursor:pointer;
  background:rgba(0,0,0,.04); color:#475569; border:1px solid transparent; }
.sub-tab-pill:hover { background:rgba(196,160,82,.08); color:var(--gold-deep); }
.sub-tab-pill.active { background:var(--dark); color:#fff; border-color:var(--dark);
  box-shadow:0 4px 16px rgba(0,0,0,.12); }

/* Form cards: hard border → glass + float shadow */
.form-card { background:rgba(255,255,255,.72); backdrop-filter:blur(16px);
  -webkit-backdrop-filter:blur(16px); border:1px solid rgba(184,134,11,.06);
  border-radius:18px; padding:22px; margin-bottom:16px; box-shadow:var(--float-shadow-sm);
  transition:box-shadow .8s var(--liquid), transform .8s var(--liquid); }
.form-card:hover { box-shadow:var(--float-shadow); }
.form-card-header { font-family:var(--font-display); font-size:13px; font-weight:700;
  color:#374151; text-transform:uppercase; letter-spacing:.06em; padding-bottom:10px;
  border-bottom:1px solid rgba(0,0,0,.04); margin-bottom:14px; display:flex;
  align-items:center; gap:8px; }
.form-card-header i { color:var(--gold-deep); font-size:14px; }

/* Inputs: blue focus → gold glow */
.field-label { display:block; font-size:13px; font-weight:600; color:#4b5563; margin-bottom:4px; }
.field-input { width:100%; border:1px solid rgba(0,0,0,.08); border-radius:12px;
  padding:9px 12px; font-size:14px; font-weight:300; background:#fff;
  transition:all .3s var(--liquid); box-shadow:0 1px 3px rgba(0,0,0,.02); }
.field-input:focus { outline:none; border-color:var(--gold);
  box-shadow:0 0 0 3px rgba(196,160,82,.12),0 1px 3px rgba(0,0,0,.02); }
.field-input[readonly] { background:#f9fafb; }

/* Radio cards: blue → gold */
.radio-card { border:1px solid rgba(0,0,0,.06); border-radius:12px; padding:8px 12px;
  transition:all .3s var(--liquid); cursor:pointer; }
.radio-card:hover { border-color:rgba(196,160,82,.4); background:rgba(196,160,82,.04); }
.radio-card:has(input:checked) { border-color:var(--gold-deep); background:rgba(196,160,82,.07);
  box-shadow:var(--gold-glow-sm); }

/* Gold accent on native radios/checkboxes */
.form-card input[type="checkbox"], .form-card input[type="radio"] { accent-color:var(--gold-deep); }

/* Searchable company dropdown: blue → gold */
.company-dropdown .dd-input { border-radius:12px; border:1px solid rgba(0,0,0,.08);
  transition:all .3s var(--liquid); }
.company-dropdown .dd-input:focus { outline:none; border-color:var(--gold);
  box-shadow:0 0 0 3px rgba(196,160,82,.12); }
.company-dropdown .dd-list { border-radius:14px; border:1px solid rgba(0,0,0,.06);
  box-shadow:0 16px 48px rgba(0,0,0,.12); backdrop-filter:blur(16px); }
.company-dropdown .dd-item:hover { background:rgba(196,160,82,.06); color:var(--gold-deep); }
.company-dropdown .dd-item.selected { background:rgba(196,160,82,.1); color:var(--gold-deep); font-weight:600; }

/* Section collapse chevron */
.section-collapse .chevron { transition:transform .2s var(--liquid); }
.section-collapse.collapsed .chevron { transform:rotate(-90deg); }
.section-collapse.collapsed + .section-body { display:none; }

/* ── BLUE TAILWIND-UTILITY OVERRIDES ──
   The forms hardcode dozens of blue utilities. Retone to dark/gold so nothing
   reads "default Tailwind". (Counts from audit: bg-blue-600 ×13, text-blue-700
   ×17, border-blue-200 ×7, etc.) */
.bg-blue-600, .bg-blue-700 { background-color:var(--dark) !important; }
.bg-blue-100, .bg-blue-200 { background-color:rgba(196,160,82,.1) !important; }
.text-blue-500, .text-blue-600, .text-blue-700, .text-blue-800, .text-blue-900 { color:var(--gold-deep) !important; }
.border-blue-200, .border-blue-300, .border-blue-400, .border-blue-500 { border-color:rgba(196,160,82,.3) !important; }
.ring-blue-300 { --tw-ring-color:rgba(196,160,82,.4) !important; }
.hover\:bg-blue-700:hover { background-color:#1a1a1a !important; }
.focus\:ring-blue-300:focus, .focus\:border-blue-500:focus { border-color:var(--gold) !important; }

/* Gold primary buttons already use #B8860B — add liquid hover lift */
[class*="bg-[#B8860B]"], [class*="bg-[#9A7209]"] {
  transition:all .5s var(--liquid); box-shadow:0 4px 20px rgba(184,134,11,.2); }
[class*="bg-[#B8860B]"]:hover, [class*="bg-[#9A7209]"]:hover {
  transform:translateY(-1px); box-shadow:var(--gold-glow); }

/* Media modal: drop zones + tiles → liquid */
#saleMediaModal .border-dashed, [id$="MediaModal"] .border-dashed {
  border-color:rgba(184,134,11,.45); border-radius:16px; transition:all .5s var(--liquid); }
#saleMediaModal .border-dashed:hover, [id$="MediaModal"] .border-dashed:hover {
  border-color:var(--gold); box-shadow:var(--gold-glow-sm); }

/* Toast already dark — round it to match */
.toast-notification { border-radius:14px !important; }
```

- [ ] **Step 2:** Sanity-check the file has no stray `@apply` of undefined utilities (it uses none) and the `@source` paths are relative to the css/ dir (they are: `../FORM.html`).

---

## Task 2: Compile script + npm script

**Files:**
- Create: `scripts/build-crm-forms-css.mjs`
- Modify: `package.json` (scripts block only)

- [ ] **Step 1: Write the compile script.**
```js
// scripts/build-crm-forms-css.mjs
// Compiles public/crm/css/forms-source.css → forms.css using the already-installed
// @tailwindcss/postcss (Tailwind v4). No CLI, no new deps. Run: npm run crm:css
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = join(root, 'public/crm/css/forms-source.css');
const output = join(root, 'public/crm/css/forms.css');

const css = readFileSync(input, 'utf8');
const result = await postcss([tailwind()]).process(css, { from: input, to: output });
writeFileSync(output, result.css, 'utf8');
const kb = Math.round(Buffer.byteLength(result.css) / 1024);
console.log(`[crm:css] built public/crm/css/forms.css (${kb} KB)`);
if (kb === 0) { console.error('[crm:css] ERROR: empty output'); process.exit(1); }
```
- [ ] **Step 2: Add the npm script** to `package.json` (alongside `crm:build`):
```json
"crm:css": "node scripts/build-crm-forms-css.mjs",
```
- [ ] **Step 3: Run it.**
```bash
npm run crm:css
```
Expected: `[crm:css] built public/crm/css/forms.css (NN KB)` with NN in the ~15–40 range.
- [ ] **Step 4: Verify the utilities the forms use are present and the CDN-only ones aren't bloating it.**
```bash
grep -cE "\.bg-gray-50|\.text-blue-700|\.rounded-lg|\.backdrop-blur|\.form-card|--color-brand-gold" public/crm/css/forms.css
```
Expected: ≥5 (all the probed selectors emitted). If `text-blue-700` raw utility is absent that's fine — our override layer also defines it; confirm the override block is present:
```bash
grep -c "var(--gold-deep) !important" public/crm/css/forms.css
```
Expected: ≥1.
- [ ] **Step 5: Commit.**
```bash
git add public/crm/css/forms-source.css scripts/build-crm-forms-css.mjs public/crm/css/forms.css package.json
git commit -m "feat(crm): compiled Tailwind v4 + Liquid stylesheet for forms (replaces Play CDN)"
```

---

## Task 3: Pilot — migrate SALE-FORM-REDESIGN.html

**Files:**
- Modify: `public/crm/SALE-FORM-REDESIGN.html` (head region ~lines 8–103)

- [ ] **Step 1: Remove the Play CDN + inline config; add fonts + compiled CSS.** Replace:
```html
<script src="https://cdn.tailwindcss.com"></script>
```
…and the `<script>tailwind.config = {…}</script>` block (lines ~13–24) with:
```html
<!-- Tailwind v4 compiled + Liquid design system (replaces cdn.tailwindcss.com — no prod warning) -->
<link rel="stylesheet" href="css/forms.css">
```
Update the font link to add Urbanist + Inter (keep one `<link>`):
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Urbanist:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```
- [ ] **Step 2: Retone the inline `<style>` body font** (line ~43) from Manrope to Inter (the component classes are now overridden by forms.css, so leave the rest of the inline block — forms.css loads after and wins; only change the base font to avoid a flash):
```css
body { font-family: 'Inter', system-ui, sans-serif; }
```
- [ ] **Step 3: Do NOT touch** any element markup, `id`, `name`, `data-rls-*`, `onclick`, or JS. (Diff check in Step 6.)
- [ ] **Step 4: Rebuild CSS** (the `@source` scan picks up any class changes — none expected, but keep the artifact fresh):
```bash
npm run crm:css
```
- [ ] **Step 5: Regression guard.**
```bash
npm run crm:test
```
Expected: same count as Task 0 baseline (172/172).
- [ ] **Step 6: Confirm zero structural drift** (only head/style lines changed):
```bash
git diff --stat public/crm/SALE-FORM-REDESIGN.html
git diff public/crm/SALE-FORM-REDESIGN.html | grep -E "^\+" | grep -E "data-rls|onclick|id=|name=" || echo "no JS-hook lines added/changed — OK"
```
Expected: only head/style hunk; the grep prints "no JS-hook lines…".

---

## Task 4: Playwright-verify the pilot (the verify skill)

**Files:**
- Create (UNTRACKED): `scripts/__pw-verify-forms.mjs`
- Append evidence to: `docs/crm/forms-liquid-migration-verification-2026-05-29.md`

- [ ] **Step 1:** Start the CRM locally (or use an immutable preview if Maya provides one). For local:
```bash
npm run dev   # background; note the port (usually 3000)
```
- [ ] **Step 2: Write the Playwright verifier** (`scripts/__pw-verify-forms.mjs`): navigate to `/crm/SALE-FORM-REDESIGN.html` (logged-in session cookie required — Maya provides, or test the login redirect path), and assert:
  - the page `console` produced **no** message containing `cdn.tailwindcss.com`;
  - a `<link href*="css/forms.css">` is present and `document.styleSheets` includes it;
  - `getComputedStyle(document.querySelector('.form-card'))` shows `box-shadow` ≠ `none` and `border-radius` ≈ 18px (glass look applied);
  - a `.sub-tab-pill.active` background is dark (rgb ~10,10,10), not blue;
  - clicking a sidebar tab switches sections (interactivity intact);
  - open the Media modal → the drop zone + grid render;
  - full-page screenshot to `__pw-shots/sale-form-liquid.png`.
- [ ] **Step 3: Run it; capture output + screenshot.**
- [ ] **Step 4:** Record PASS/FAIL + screenshot path in the verification doc. Any FAIL → fix in Task 1/3, rebuild, re-verify. Do not proceed to rollout on a FAIL.

---

## Task 5: GATE — show Maya the pilot

- [ ] **Step 1:** Present the `sale-form-liquid.png` screenshot + the "no CDN warning / crm:test green / look matches site" evidence.
- [ ] **Step 2:** Get explicit approval of the look on the sale form **before** rolling out. If she wants tweaks, adjust `forms-source.css` (one file), `npm run crm:css`, re-verify, re-show.
- [ ] **Step 3:** On approval, commit the pilot:
```bash
git add public/crm/SALE-FORM-REDESIGN.html public/crm/css/forms.css
git commit -m "feat(crm): migrate sale form to compiled Tailwind v4 + Liquid (no CDN warning)"
```

---

## Task 6: Roll out to the remaining 7 forms (rental first)

For EACH of, in order — `RENTAL-FORM-REDESIGN.html`, `BUYER-DEAL-FORM.html`, `TENANT-DEAL-FORM.html`, `SALE-FORM-WITH-TOOLS.html`, `RENTAL-FORM-WITH-TOOLS.html`, `dashboard.html`, `dev.html`:

- [ ] **Step 1:** Apply the Task 3 head edit (drop CDN+config, add fonts+`<link href="css/forms.css">`, set body font Inter). NOTE: deal forms/dashboard may use different component class names — if a form uses classes not in `forms-source.css`, add a small retone block for them to the source file and rebuild (do not restyle per-file inline).
- [ ] **Step 2:** `npm run crm:css` (rescans all forms).
- [ ] **Step 3:** `npm run crm:test` — green.
- [ ] **Step 4:** Playwright-verify that form (same assertions as Task 4, adjusting selectors). Screenshot to `__pw-shots/<form>.png`. Record in the verification doc.
- [ ] **Step 5:** Commit per form: `git commit -m "feat(crm): migrate <form> to Liquid Tailwind v4"`.

---

## Task 7: Final compliance sweep + handoff

- [ ] **Step 1:** Full gate:
```bash
npm run crm:test && npm run ucba:audit && npm run idx:validate && npm run compliance-check
```
Expected: crm 172/172; UCBA REGRESSIONS=0; IDX 0 critical; compliance BLOCKER+STRICT=0.
- [ ] **Step 2:** Confirm the CDN is gone everywhere:
```bash
grep -l "cdn.tailwindcss.com" public/crm/*.html || echo "CDN fully removed from all forms"
```
- [ ] **Step 3:** Delete the untracked Playwright temp (`scripts/__pw-verify-forms.mjs`); keep screenshots referenced in the verification doc.
- [ ] **Step 4:** Note for Maya (do NOT do without approval): wire `npm run crm:css` into CI / `crm:build` so `forms.css` can't drift (`.github/workflows/**` is held). Open the PR for Maya's review; do not merge.

---

## Self-review notes
- **Spec coverage:** CDN removal (Tasks 3,6,7-step2) ✓; Liquid look (Task 1 component layer) ✓; v3→v4 safety (Task 1 compat shim) ✓; no new deps (Task 2 uses installed `@tailwindcss/postcss`) ✓; compliance/save-load intact (Hard constraints + crm:test in 3,5,6,7) ✓; Playwright proof (Tasks 4,6) ✓; prove-on-one (Task 5 gate) ✓; rental-second ordering (Task 6) ✓.
- **No placeholders:** input CSS and build script are given in full; head edits are exact.
- **Risk flagged:** deal forms/dashboard may carry extra component classes — Task 6-step1 handles by extending the single source file, not per-file inline (keeps DRY).
