#!/usr/bin/env node
// TRANSACTION-STATE CENSUS — how "in contract" / off-market / pending / closed actually manifests on this
// feed. No single "contract signed" field is assumed. Every row of the corpus is read (ordered keyset walk,
// no sampling) and the COMBINATION of StandardStatus, PurchaseContractDate, ContractStatusChangeDate,
// OffMarketDate, OffMarketTimestamp, PendingTimestamp, MajorChangeType, MajorChangeTimestamp,
// StatusChangeTimestamp (plus the surrounding dates) is counted separately for Sale and Rental
// (segment by PropertyType: *Lease → Rental, else Sale). Date relationships are measured pairwise.
// Then CustomProperty.CustomFields is walked for NYC-specific contract / in-contract terminology, by
// segment and status, so the mapping is not declared complete on Property scalars alone.
//
//   node scripts/cotality/transaction-state-census.mjs [--out=docs/operations/evidence-2026-09-08/transaction-state] [--skip-custom]

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createCotalityClient } from './live-client.mjs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const outBase = arg('out', 'docs/operations/evidence-2026-09-08/transaction-state/transaction-state-census');
const skipCustom = argv.includes('--skip-custom');
const esc = (v) => String(v).replace(/'/g, "''");

const compact = JSON.parse(readFileSync('data/cotality-contract/contract.compact.json', 'utf8'));
const P = compact.resources.Property.fields;
const STATE_FIELDS = ['StandardStatus', 'MlsStatus', 'PreviousStandardStatus', 'PropertyType', 'PropertySubType',
  'PurchaseContractDate', 'ContractStatusChangeDate', 'OffMarketDate', 'OffMarketTimestamp', 'PendingTimestamp',
  'MajorChangeType', 'MajorChangeTimestamp', 'StatusChangeTimestamp', 'CloseDate', 'ListingContractDate',
  'OnMarketDate', 'OnMarketTimestamp', 'ActivationDate', 'WithdrawnDate', 'CancellationDate', 'ExpirationDate',
  'ContingentDate', 'BackOnMarketDate', 'BackOnMarketTimestamp', 'Contingency', 'AvailabilityDate', 'ModificationTimestamp'];
for (const f of STATE_FIELDS) if (!P[f]) throw new Error(`${f} is not a declared Property field on this subscription`);
const DATE_FIELDS = STATE_FIELDS.filter((f) => /Date$|Timestamp$/.test(f) && f !== 'ModificationTimestamp');
const COMBO_FIELDS = ['PurchaseContractDate', 'ContractStatusChangeDate', 'OffMarketDate', 'OffMarketTimestamp', 'PendingTimestamp', 'MajorChangeTimestamp', 'StatusChangeTimestamp', 'CloseDate', 'ContingentDate', 'WithdrawnDate', 'BackOnMarketDate'];
const PAIRS = [['PurchaseContractDate', 'ContractStatusChangeDate'], ['PurchaseContractDate', 'PendingTimestamp'], ['PurchaseContractDate', 'OffMarketDate'], ['PurchaseContractDate', 'CloseDate'], ['ContractStatusChangeDate', 'PendingTimestamp'], ['ContractStatusChangeDate', 'StatusChangeTimestamp'], ['OffMarketDate', 'OffMarketTimestamp'], ['OffMarketDate', 'CloseDate'], ['PendingTimestamp', 'StatusChangeTimestamp'], ['MajorChangeTimestamp', 'StatusChangeTimestamp'], ['MajorChangeTimestamp', 'ModificationTimestamp'], ['OnMarketDate', 'ListingContractDate'], ['CloseDate', 'StatusChangeTimestamp']];
const TERMS = /contract|offer|accepted|deposit|signed|pending|closing|escrow|attorney|board|approv|application|rented|in.?contract|sublet|lease.?sign|move.?in|possession|available|vacan|occup/i;

const client = createCotalityClient();
const segmentOf = (pt) => (pt == null ? 'Unknown' : /Lease$/.test(String(pt)) ? 'Rental' : 'Sale');
const day = (v) => (v == null ? null : String(v).slice(0, 10));
const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const topInc = (o, k, cap = 60) => { if (k in o || Object.keys(o).length < cap) inc(o, k); else inc(o, '(other)'); };

// ── 1. Property walk ────────────────────────────────────────────────────────
const stats = { rows: 0, pages: 0, bySegment: {} };
const seg = (s) => { if (!stats.bySegment[s]) stats.bySegment[s] = { rows: 0, byStatus: {}, presence: {}, combos: {}, majorChangeByStatus: {}, contingencyByStatus: {}, pairs: {}, propertyType: {}, propertySubTypeByStatus: {}, activeWithContractDates: {}, closedWithoutContractDates: 0, mlsStatusNonNull: 0, previousStatusNonNull: 0 }; return stats.bySegment[s]; };
const keySegment = new Map(); // ListingKey -> segment (for the CustomFields walk)
let last = null;
while (true) {
  const params = { '$select': ['ListingKey', ...STATE_FIELDS].join(','), '$orderby': 'ListingKey asc', '$top': 1000 };
  if (last != null) params['$filter'] = `ListingKey gt '${esc(last)}'`;
  const json = await client.query('Property', params);
  const batch = Array.isArray(json.value) ? json.value : [];
  if (!batch.length) break;
  stats.pages += 1;
  for (const r of batch) {
    stats.rows += 1;
    const s = segmentOf(r.PropertyType);
    keySegment.set(String(r.ListingKey), s);
    const S = seg(s);
    S.rows += 1;
    const st = String(r.StandardStatus ?? 'null');
    inc(S.byStatus, st);
    topInc(S.propertyType, String(r.PropertyType ?? 'null'));
    if (!S.propertySubTypeByStatus[st]) S.propertySubTypeByStatus[st] = {};
    topInc(S.propertySubTypeByStatus[st], String(r.PropertySubType ?? 'null'), 40);
    if (r.MlsStatus != null) S.mlsStatusNonNull += 1;
    if (r.PreviousStandardStatus != null) S.previousStatusNonNull += 1;
    // presence per status
    if (!S.presence[st]) S.presence[st] = {};
    for (const f of DATE_FIELDS) if (r[f] != null) inc(S.presence[st], f);
    // combination signature: status + which of the combo dates are present + MajorChangeType
    const sig = `${st} | ${COMBO_FIELDS.filter((f) => r[f] != null).join('+') || '(no dates)'} | MCT=${r.MajorChangeType ?? 'null'}`;
    topInc(S.combos, sig, 400);
    if (!S.majorChangeByStatus[st]) S.majorChangeByStatus[st] = {};
    topInc(S.majorChangeByStatus[st], String(r.MajorChangeType ?? 'null'), 40);
    if (!S.contingencyByStatus[st]) S.contingencyByStatus[st] = {};
    topInc(S.contingencyByStatus[st], String(r.Contingency ?? 'null'), 40);
    if (st === 'Active') { for (const f of ['PurchaseContractDate', 'ContractStatusChangeDate', 'PendingTimestamp', 'OffMarketDate', 'ContingentDate']) if (r[f] != null) inc(S.activeWithContractDates, f); }
    if (st === 'Closed' && r.PurchaseContractDate == null && r.ContractStatusChangeDate == null && r.PendingTimestamp == null) S.closedWithoutContractDates += 1;
    // pairwise date relationships (day granularity) where both present
    for (const [a, b] of PAIRS) {
      const da = day(r[a]); const db = day(r[b]);
      if (da == null || db == null) continue;
      const k = `${a} vs ${b}`;
      if (!S.pairs[k]) S.pairs[k] = { both: 0, equalDay: 0, aBeforeB: 0, aAfterB: 0, byStatus: {} };
      const Pk = S.pairs[k];
      Pk.both += 1;
      const rel = da === db ? 'equalDay' : da < db ? 'aBeforeB' : 'aAfterB';
      Pk[rel] += 1;
      if (!Pk.byStatus[st]) Pk.byStatus[st] = { equalDay: 0, aBeforeB: 0, aAfterB: 0 };
      Pk.byStatus[st][rel] += 1;
    }
  }
  last = batch[batch.length - 1].ListingKey;
  if (stats.pages % 50 === 0) console.error(`[transaction-state] ${stats.rows} rows, ${stats.pages} pages, quota ${JSON.stringify(client.quota())}`);
}
console.error(`[transaction-state] Property walk done: ${stats.rows} rows; segments ${Object.entries(stats.bySegment).map(([k, v]) => `${k}=${v.rows}`).join(' ')}`);

// ── 2. CustomFields terminology walk ─────────────────────────────────────────
const custom = { rows: 0, pages: 0, withCustomFields: 0, keys: {}, termKeys: {}, termValues: {} };
if (!skipCustom) {
  let lastC = null;
  while (true) {
    const params = { '$select': 'ListingKey,StandardStatus,CustomFields', '$orderby': 'ListingKey asc', '$top': 1000 };
    if (lastC != null) params['$filter'] = `ListingKey gt '${esc(lastC)}'`;
    const json = await client.query('CustomProperty', params);
    const batch = Array.isArray(json.value) ? json.value : [];
    if (!batch.length) break;
    custom.pages += 1;
    for (const r of batch) {
      custom.rows += 1;
      const s = keySegment.get(String(r.ListingKey)) || 'Unknown';
      const st = String(r.StandardStatus ?? 'null');
      const raw = r.CustomFields;
      if (typeof raw !== 'string' || !raw) continue;
      let parsed;
      try { parsed = JSON.parse(raw); } catch { continue; }
      if (!parsed || typeof parsed !== 'object') continue;
      custom.withCustomFields += 1;
      for (const [k, v] of Object.entries(parsed)) {
        const cell = `${s}/${st}`;
        if (!custom.keys[k]) custom.keys[k] = { rows: 0, nonEmpty: 0, byCell: {} };
        custom.keys[k].rows += 1;
        const empty = v === null || v === '' || v === undefined;
        if (!empty) { custom.keys[k].nonEmpty += 1; inc(custom.keys[k].byCell, cell); }
        const termKey = TERMS.test(k);
        const termVal = !empty && typeof v === 'string' && TERMS.test(v);
        if (termKey || termVal) {
          if (!custom.termKeys[k]) custom.termKeys[k] = { matchedBy: termKey ? 'key' : 'value', nonEmpty: 0, byCell: {} };
          if (!empty) { custom.termKeys[k].nonEmpty += 1; inc(custom.termKeys[k].byCell, cell); }
          if (!empty) { if (!custom.termValues[k]) custom.termValues[k] = {}; if (!custom.termValues[k][cell]) custom.termValues[k][cell] = {}; topInc(custom.termValues[k][cell], String(v).slice(0, 80), 30); }
        }
      }
    }
    lastC = batch[batch.length - 1].ListingKey;
    if (custom.pages % 50 === 0) console.error(`[transaction-state] CustomFields ${custom.rows} rows, ${custom.pages} pages, keys ${Object.keys(custom.keys).length}, term keys ${Object.keys(custom.termKeys).length}`);
  }
}

// ── 3. Write ─────────────────────────────────────────────────────────────────
const out = { source: 'LIVE_COTALITY', method: 'ordered keyset walk of Property (all statuses) with the transaction-state fields; CustomProperty walk for CustomFields terminology', fields: STATE_FIELDS, comboFields: COMBO_FIELDS, terms: TERMS.source, started: null, finished: new Date().toISOString(), property: stats, customFields: custom, quota: client.quota() };
mkdirSync(path.dirname(outBase), { recursive: true });
writeFileSync(`${outBase}.json`, JSON.stringify(out, null, 1) + '\n');

const md = [];
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
md.push('# Transaction-state census — how in-contract / off-market / pending / closed manifest on this feed (2026-09-08)');
md.push('');
md.push(`Whole corpus: ${fmt(stats.rows)} Property rows in ${stats.pages} pages, no sampling. Segment = PropertyType ending in Lease → Rental, else Sale. Combination signature = StandardStatus | date fields present | MajorChangeType. Suppressed fields (MlsStatus, PreviousStandardStatus, CancellationDate, ExpirationDate) are selected on purpose to prove they arrive null.`);
md.push('');
for (const [s, S] of Object.entries(stats.bySegment)) {
  md.push(`## ${s} — ${fmt(S.rows)} rows · PropertyType ${Object.entries(S.propertyType).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} · MlsStatus non-null ${fmt(S.mlsStatusNonNull)} · PreviousStandardStatus non-null ${fmt(S.previousStatusNonNull)}`);
  md.push('');
  md.push('### Status × date-field presence');
  md.push('');
  md.push(`| Status | Rows | ${DATE_FIELDS.join(' | ')} |`);
  md.push(`|---|---|${DATE_FIELDS.map(() => '---').join('|')}|`);
  for (const [st, n] of Object.entries(S.byStatus).sort((a, b) => b[1] - a[1])) md.push(`| ${st} | ${fmt(n)} | ${DATE_FIELDS.map((f) => { const c = S.presence[st]?.[f] || 0; return c ? `${fmt(c)} (${Math.round((100 * c) / n)}%)` : '0'; }).join(' | ')} |`);
  md.push('');
  md.push(`Active rows carrying contract-shaped dates: ${Object.entries(S.activeWithContractDates).map(([k, v]) => `${k} ${fmt(v)}`).join(', ') || 'none'}. Closed rows with none of PurchaseContractDate / ContractStatusChangeDate / PendingTimestamp: ${fmt(S.closedWithoutContractDates)}.`);
  md.push('');
  md.push('### MajorChangeType by status');
  md.push('');
  md.push('| Status | MajorChangeType distribution |');
  md.push('|---|---|');
  for (const [st, dist] of Object.entries(S.majorChangeByStatus)) md.push(`| ${st} | ${Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')} |`);
  md.push('');
  md.push('### Contingency by status');
  md.push('');
  md.push('| Status | Contingency distribution |');
  md.push('|---|---|');
  for (const [st, dist] of Object.entries(S.contingencyByStatus)) md.push(`| ${st} | ${Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ')} |`);
  md.push('');
  md.push('### Combination signatures (top 60)');
  md.push('');
  md.push('| Rows | Status \\| dates present \\| MajorChangeType |');
  md.push('|---|---|');
  for (const [sig, n] of Object.entries(S.combos).sort((a, b) => b[1] - a[1]).slice(0, 60)) md.push(`| ${fmt(n)} | ${sig.replace(/\|/g, '\\|')} |`);
  md.push('');
  md.push('### Pairwise date relationships (day granularity, rows with both present)');
  md.push('');
  md.push('| Pair | Both | Equal day | A before B | A after B | By status |');
  md.push('|---|---|---|---|---|---|');
  for (const [k, v] of Object.entries(S.pairs)) md.push(`| ${k} | ${fmt(v.both)} | ${fmt(v.equalDay)} | ${fmt(v.aBeforeB)} | ${fmt(v.aAfterB)} | ${Object.entries(v.byStatus).map(([st, x]) => `${st}: =${fmt(x.equalDay)} <${fmt(x.aBeforeB)} >${fmt(x.aAfterB)}`).join('; ')} |`);
  md.push('');
}
if (!skipCustom) {
  md.push(`## CustomProperty.CustomFields — ${fmt(custom.rows)} rows walked, ${fmt(custom.withCustomFields)} with a parseable payload, ${Object.keys(custom.keys).length} distinct keys`);
  md.push('');
  md.push('### Keys whose name or values match contract / in-contract terminology');
  md.push('');
  md.push(`Terminology pattern: \`${TERMS.source}\`.`);
  md.push('');
  md.push('| Key | Matched by | Non-empty rows | By segment/status | Values by segment/status (top) |');
  md.push('|---|---|---|---|---|');
  for (const [k, v] of Object.entries(custom.termKeys).sort((a, b) => b[1].nonEmpty - a[1].nonEmpty)) {
    const vals = Object.entries(custom.termValues[k] || {}).map(([cell, dist]) => `${cell}: ${Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x, n]) => `${x.replace(/\|/g, '/')}=${fmt(n)}`).join(', ')}`).join('<br>');
    md.push(`| \`${k}\` | ${v.matchedBy} | ${fmt(v.nonEmpty)} | ${Object.entries(v.byCell).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${fmt(n)}`).join(' · ')} | ${vals} |`);
  }
  md.push('');
  md.push('### All keys — non-empty rows by segment/status');
  md.push('');
  md.push('| Key | Rows | Non-empty | By segment/status |');
  md.push('|---|---|---|---|');
  for (const [k, v] of Object.entries(custom.keys).sort((a, b) => b[1].nonEmpty - a[1].nonEmpty)) md.push(`| \`${k}\` | ${fmt(v.rows)} | ${fmt(v.nonEmpty)} | ${Object.entries(v.byCell).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c, n]) => `${c} ${fmt(n)}`).join(' · ')} |`);
  md.push('');
}
writeFileSync(`${outBase}.md`, md.join('\n') + '\n');
process.stdout.write(JSON.stringify({ wrote: [`${outBase}.md`, `${outBase}.json`], rows: stats.rows, segments: Object.fromEntries(Object.entries(stats.bySegment).map(([k, v]) => [k, v.byStatus])), customKeys: Object.keys(custom.keys).length, termKeys: Object.keys(custom.termKeys) }, null, 2) + '\n');
