/**
 * scripts/fetch-entity-ndjson.js
 * Fetches records from a Trestle entity and writes NDJSON to artifacts/
 * Usage: node scripts/fetch-entity-ndjson.js --entity=Property --top=500 [--expand=CustomProperty,Media] --out=artifacts/trestle-Property.ndjson
 */
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const API = 'https://api.cotality.com/trestle';

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

async function getToken() {
  const r = await fetch(`${API}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.IDX_CLIENT_ID,
      client_secret: process.env.IDX_CLIENT_SECRET,
      scope: 'api'
    })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Token error: ' + JSON.stringify(j));
  return j.access_token;
}

(async () => {
  const args = parseArgs();
  const entity = args.entity;
  const top = parseInt(args.top || '500');
  const expand = args.expand || '';
  const out = args.out || `artifacts/trestle-${entity}.ndjson`;

  if (!entity) { console.error('--entity required'); process.exit(2); }

  const token = await getToken();
  console.log('TOKEN_OK');

  fs.mkdirSync('artifacts', { recursive: true });
  const ws = fs.createWriteStream(out);

  let url = `${API}/odata/${entity}?$top=${Math.min(top, 200)}`;
  if (expand) url += `&$expand=${expand}`;
  // For Property, filter to Active to get real data
  if (entity === 'Property') url += `&$filter=StandardStatus eq 'Active'`;

  let fetched = 0;
  let page = 0;

  while (url && fetched < top) {
    page++;
    console.log(`  page ${page}, fetched ${fetched}/${top}...`);
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!r.ok) {
      const err = await r.text();
      console.error(`  ERROR ${r.status}: ${err.substring(0, 300)}`);
      break;
    }
    const j = await r.json();
    const records = j.value || [];
    for (const rec of records) {
      ws.write(JSON.stringify(rec) + '\n');
      fetched++;
      if (fetched >= top) break;
    }
    url = j['@odata.nextLink'] || null;
    if (url && fetched >= top) break;
  }

  ws.end();
  console.log(`  DONE: ${fetched} records -> ${out}`);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
