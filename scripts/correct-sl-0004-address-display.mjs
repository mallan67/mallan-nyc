// Data correction: restore PUBLIC address display for SL-0004 (Maya's first
// exclusive). Maya confirmed 2026-05-29 the address should be public.
//
//   node scripts/correct-sl-0004-address-display.mjs           # DRY RUN (no writes)
//   node scripts/correct-sl-0004-address-display.mjs --apply   # WRITE (Maya-approved step only)
//
// Idempotent + read-only by default. Flips ONLY blank/false → true for the
// address-display flag on SL-0004; never touches any other row or field.
// Shows before/after + the resulting canonical URL.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const TARGET = 'SL-0004';

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
} catch (e) { console.error('Could not read .env.local:', e.message); process.exit(1); }

const prisma = new PrismaClient();
const slugify = (s) => String(s || '').toLowerCase().replace(/\bapt\.?\b/g, 'apt').replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

try {
  console.log(`\n[correct-sl-0004] mode = ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);
  const row = await prisma.listing.findUnique({
    where: { listing_id: TARGET },
    select: { listing_id: true, status: true, rls_eligible: true, idx_display_yn: true, internet_address_display_yn: true, internet_entire_listing_display_yn: true, agent_id: true, raw_data: true, address: true },
  });
  if (!row) { console.log(`${TARGET} not found — nothing to do.`); process.exit(0); }

  const raw = (row.raw_data && typeof row.raw_data === 'object') ? row.raw_data : {};
  const addr = (row.address && typeof row.address === 'object') ? row.address : {};

  console.log('=== BEFORE ===');
  console.log(JSON.stringify({
    listing_id: row.listing_id, status: row.status, rls_eligible: row.rls_eligible,
    idx_display_yn: row.idx_display_yn,
    internet_address_display_yn: row.internet_address_display_yn,
    'raw_data.InternetAddressDisplayYN': raw.InternetAddressDisplayYN,
    agent_id: row.agent_id ? row.agent_id.toString() : null,
  }, null, 2));

  // Resulting canonical URL preview (address form when address-display is true).
  const addressSlug = slugify([addr.StreetNumber, addr.StreetDirPrefix, addr.StreetName, addr.StreetSuffix, addr.UnitNumber ? 'apt ' + addr.UnitNumber : '', addr.City, addr.StateOrProvince || 'NY', addr.PostalCode].filter(Boolean).join(' '));
  console.log('\nResulting canonical URL when address is public:');
  console.log(`  /listing/${addressSlug}/${TARGET.toLowerCase()}`);

  // Decide changes — ONLY flip blank/false → true. Never true → false.
  const colNeedsFix = row.internet_address_display_yn !== true;
  const rawNeedsFix = Object.prototype.hasOwnProperty.call(raw, 'InternetAddressDisplayYN') && raw.InternetAddressDisplayYN !== true;

  console.log('\n=== PLANNED CHANGES (only blank/false → true) ===');
  console.log(`  internet_address_display_yn: ${row.internet_address_display_yn} → ${colNeedsFix ? 'true' : '(unchanged)'}`);
  if (Object.prototype.hasOwnProperty.call(raw, 'InternetAddressDisplayYN'))
    console.log(`  raw_data.InternetAddressDisplayYN: ${raw.InternetAddressDisplayYN} → ${rawNeedsFix ? 'true' : '(unchanged)'}`);
  else
    console.log('  raw_data.InternetAddressDisplayYN: (key absent — not added)');

  if (!colNeedsFix && !rawNeedsFix) {
    console.log('\n[correct-sl-0004] Nothing to change — already public. (idempotent no-op)');
    process.exit(0);
  }

  if (APPLY) {
    const data = {};
    if (colNeedsFix) data.internet_address_display_yn = true;
    if (rawNeedsFix) data.raw_data = { ...raw, InternetAddressDisplayYN: true };
    await prisma.listing.update({ where: { listing_id: TARGET }, data });
    const after = await prisma.listing.findUnique({ where: { listing_id: TARGET }, select: { internet_address_display_yn: true, raw_data: true } });
    const afterRaw = (after.raw_data && typeof after.raw_data === 'object') ? after.raw_data : {};
    console.log('\n=== AFTER (written) ===');
    console.log(JSON.stringify({ internet_address_display_yn: after.internet_address_display_yn, 'raw_data.InternetAddressDisplayYN': afterRaw.InternetAddressDisplayYN }, null, 2));
  } else {
    console.log('\n[correct-sl-0004] DRY RUN — re-run with --apply (Maya-approved) to write.');
  }
} catch (e) {
  console.error('[correct-sl-0004] ERROR:', e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
