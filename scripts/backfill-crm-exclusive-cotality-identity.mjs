// Backfill Cotality agent identity onto CRM-owned Mallan exclusive listings.
//
//   node scripts/backfill-crm-exclusive-cotality-identity.mjs            # DRY RUN (default — no writes)
//   node scripts/backfill-crm-exclusive-cotality-identity.mjs --apply    # WRITE (Maya-approved step only)
//
// Idempotent + safe to rerun. Fills ONLY blank Cotality identity fields on
// CRM-owned rows (listing_id prefix SL-/RL- OR agent_id != null) from the
// owning Agent record:
//   - ListAgentMlsId   <- Agent.trestle_mls_id   (the REBNY/Trestle MLS member id)
//   - ListAgentFullName<- Agent.full_name
//   - ListAgentEmail   <- Agent.email
//   - ListOfficeName   <- "Mallan Real Estate Inc."  (canonical — never the REBNY "MAllan" typo)
//
// Per Maya's 2026-05-28 decision: ListOfficeMlsId / ListOfficeKey are LEFT
// BLANK until verified from a trusted canonical source (REBNY/Cotality/RealPlus).
// Non-blank existing values are NEVER overwritten (no --force in this version).
//
// Schema-free: writes only listing.agent_info (JSON) + the promoted
// list_agent_full_name / list_office_name columns. No migration.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const CANONICAL_OFFICE_NAME = 'Mallan Real Estate Inc.';

// Load DATABASE_URL from .env.local (no dotenv dependency).
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
} catch (e) {
  console.error('Could not read .env.local:', e.message);
  process.exit(1);
}

const prisma = new PrismaClient();
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

try {
  console.log(`\n[backfill] mode = ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`);

  const rows = await prisma.listing.findMany({
    where: {
      OR: [
        { listing_id: { startsWith: 'SL-' } },
        { listing_id: { startsWith: 'RL-' } },
        { agent_id: { not: null } },
      ],
    },
    select: { listing_id: true, agent_id: true, agent_info: true, list_agent_full_name: true, list_office_name: true },
  });

  let touched = 0;
  for (const row of rows) {
    if (!row.agent_id) { console.log(`[skip] ${row.listing_id}: no agent_id (cannot resolve owning agent)`); continue; }
    const agent = await prisma.agent.findUnique({
      where: { id: row.agent_id },
      select: { trestle_mls_id: true, full_name: true, email: true },
    });
    if (!agent) { console.log(`[skip] ${row.listing_id}: agent ${row.agent_id} not found`); continue; }

    const ai = (row.agent_info && typeof row.agent_info === 'object') ? { ...row.agent_info } : {};
    const before = JSON.stringify({ ListAgentMlsId: ai.ListAgentMlsId, ListAgentFullName: ai.ListAgentFullName, ListAgentEmail: ai.ListAgentEmail, ListOfficeName: ai.ListOfficeName });
    const changes = {};

    if (blank(ai.ListAgentMlsId) && !blank(agent.trestle_mls_id)) changes.ListAgentMlsId = agent.trestle_mls_id;
    if (blank(ai.ListAgentFullName) && !blank(agent.full_name)) changes.ListAgentFullName = agent.full_name;
    if (blank(ai.ListAgentEmail) && !blank(agent.email)) changes.ListAgentEmail = agent.email;
    if (blank(ai.ListOfficeName)) changes.ListOfficeName = CANONICAL_OFFICE_NAME;
    // ListOfficeMlsId / ListOfficeKey intentionally left untouched (unverified).

    const colChanges = {};
    if (blank(row.list_agent_full_name) && !blank(agent.full_name)) colChanges.list_agent_full_name = agent.full_name;
    if (blank(row.list_office_name)) colChanges.list_office_name = CANONICAL_OFFICE_NAME;

    if (Object.keys(changes).length === 0 && Object.keys(colChanges).length === 0) continue;
    touched++;
    console.log(`[fill] ${row.listing_id}`);
    console.log(`       before agent_info: ${before}`);
    console.log(`       fill  agent_info: ${JSON.stringify(changes)}`);
    if (Object.keys(colChanges).length) console.log(`       fill  columns:    ${JSON.stringify(colChanges)}`);

    if (APPLY) {
      await prisma.listing.update({
        where: { listing_id: row.listing_id },
        data: { agent_info: { ...ai, ...changes }, ...colChanges },
      });
      console.log(`       -> written`);
    }
  }

  console.log(`\n[backfill] ${touched} row(s) ${APPLY ? 'updated' : 'would be updated'} of ${rows.length} CRM-owned candidate(s).`);
  if (!APPLY && touched > 0) console.log('[backfill] Re-run with --apply (Maya-approved) to write.\n');
} catch (e) {
  console.error('[backfill] ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
