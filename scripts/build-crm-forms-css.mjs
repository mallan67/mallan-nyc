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
