// Local demo of the CRM pages (npm run demo:crm). NOT the production server and NOT a replacement for it.
//   - serves public/crm exactly as it is in this checkout (the same HTML/JS the site ships);
//   - /api/idx/search runs the REAL route handler (filter builder, field filters, gates, mapper) against LIVE Cotality, read-only;
//   - listing save/load runs the REAL normalizer and persistence-record code, kept in memory (no database, nothing is written anywhere);
//   - everything else answers a minimal stub. The session is a fixed agent.
// Needs the Cotality credentials in the environment (IDX_CLIENT_ID, IDX_CLIENT_SECRET, TRESTLE_API_URL), e.g. from a git-ignored .env.local
// (`vercel env pull`) and `node --env-file=.env.local scripts/local/crm-demo-server.cjs`.
// Open the pages at http://mallan.nyc.localhost:3100/crm/... (the search app only talks to a host whose name contains mallan.nyc).
// Routes: /crm/search  /crm/sale-listing[?id=]  /crm/rental-listing[?id=]  /crm/sale-view?id=  /crm/rental-view?id=  /crm/buyer-deal  /crm/tenant-deal
const path = require('path');
const fs = require('fs');
const http = require('http');
const Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 3100);

const origLoad = Module._load;
Module._load = function (request) {
  if (request === '@/lib/auth') return { requireAgentOrBroker: async () => ({ ok: true }), isAuthError: () => false };
  if (request === '@/lib/buildings/upsert') return { upsertBuildingFromSearchResult: async () => undefined };
  return origLoad.apply(this, arguments);
};
require(path.join(ROOT, 'node_modules/tsx/dist/cjs/index.cjs'));
process.chdir(ROOT);
process.env.IDX_ENABLED = 'true';

const { GET: idxSearch } = require(path.join(ROOT, 'app/api/idx/search/route.ts'));
const { normalizePayload, buildPersistenceRecord } = require(path.join(ROOT, 'lib/compliance/normalizer.ts'));
const { typedAgentColumnsFromJson } = require(path.join(ROOT, 'lib/listings/agent-info-typed-columns.ts'));
const { NextRequest } = require(path.join(ROOT, 'node_modules/next/server.js'));

const SESSION_USER = { id: 'AG-9', mlsId: '39361', name: 'Maya Allan', phone: '212-555-0199', email: 'maya@example.test', license: 'L-123', companyKey: 'mallan', companyName: 'Mallan Real Estate Inc.' };
const MEMBER = { key: '25272030', mlsId: '39361', fullName: 'Maya Allan', status: 'Active', officeKey: '5671398', officeMlsId: '7041', officeName: 'MAllan Real Estate Inc' };

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rewrites = Object.fromEntries((vercel.rewrites || []).map((r) => [r.source, r.destination]));

const store = new Map(); // id -> stored listing (as GET returns it)
let seq = 0;

function stored(payload, type, id, listingId, status) {
  const { normalized } = normalizePayload(payload);
  const rec = buildPersistenceRecord(normalized);
  const top = { ...rec.topLevel };
  for (const k of ['list_price', 'living_area']) if (top[k] !== undefined && top[k] !== null) top[k] = String(top[k]);
  return {
    id, listing_id: listingId, listing_type: type, agent_id: String(SESSION_USER.id), ...top, status,
    ...typedAgentColumnsFromJson(rec.agentInfo), address: rec.address, features: rec.features, raw_data: rec.raw_data, agent_info: {}, media: [],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function send(res, status, body, type) {
  res.writeHead(status, { 'content-type': type || 'application/json', 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req) { return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString('utf8'))); }); }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p = url.pathname;
    if (p.startsWith('/api/')) return await api(req, res, url);
    const mapped = rewrites[p] || (p === '/' ? '/crm/search' && rewrites['/crm/search'] : null);
    let file = mapped ? path.join(ROOT, 'public', mapped) : path.join(ROOT, 'public', p);
    if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, 'forbidden', 'text/plain');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return send(res, 404, `not found: ${p}`, 'text/plain');
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) { send(res, 500, { error: String(e && e.message) }); }
});

async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  if (p === '/api/auth/me') return send(res, 200, { authenticated: true, principalType: 'agent', role: 'agent', portalRole: 'agent', user: SESSION_USER });
  if (p === '/api/idx/search') {
    const r = await idxSearch(new NextRequest(new URL(url.toString())));
    return send(res, r.status, await r.text());
  }
  if (p === '/api/crm/directory/members') return send(res, 200, { members: [MEMBER], total: 1, source: 'demo' });
  if (p === '/api/crm/directory/offices') return send(res, 200, { offices: [], total: 0, source: 'demo' });
  if (p === '/api/buildings/search') return send(res, 200, { buildings: [] });
  if (p === '/api/crm/neighborhoods/cotality') {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rls/neighborhoods.v1.json'), 'utf8'));
    return send(res, 200, { boroughs: {}, neighborhoods: j.neighborhoods });
  }
  let m;
  if (p === '/api/crm/listings' && method === 'GET') return send(res, 200, { listings: [...store.values()], total: store.size });
  if (p === '/api/crm/listings' && method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}');
    const type = body.listing_type === 'rent' || body.listing_type === 'rental' ? 'rent' : 'sale';
    const id = String(++seq);
    const listingId = (type === 'sale' ? 'SL-' : 'RL-') + String(seq).padStart(4, '0');
    store.set(id, stored(body, type, id, listingId, 'Draft'));
    return send(res, 201, { id, listing_id: listingId, status: 'Draft' });
  }
  if ((m = /^\/api\/crm\/listings\/([^/]+)$/.exec(p))) {
    const cur = store.get(m[1]);
    if (method === 'GET') return cur ? send(res, 200, cur) : send(res, 404, { error: 'not found' });
    if (method === 'PUT' || method === 'PATCH') {
      if (!cur) return send(res, 404, { error: 'not found' });
      const body = JSON.parse((await readBody(req)) || '{}');
      store.set(m[1], stored(body, cur.listing_type, cur.id, cur.listing_id, cur.status));
      return send(res, 200, { id: cur.id, listing_id: cur.listing_id, status: cur.status });
    }
  }
  if ((m = /^\/api\/crm\/listings\/([^/]+)\/status$/.exec(p)) && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    const cur = store.get(m[1]); const body = JSON.parse((await readBody(req)) || '{}');
    if (cur) { cur.status = body.status || body.newStatus || cur.status; }
    return send(res, 200, { id: m[1], status: cur ? cur.status : null });
  }
  if ((m = /^\/api\/crm\/listings\/([^/]+)\/media$/.exec(p))) return send(res, 200, { listing_id: m[1], media: [] });
  if (p.startsWith('/api/crm/showings')) return send(res, 200, { showings: [] });
  return send(res, 200, {});
}

server.listen(PORT, () => console.log(`demo ready on http://localhost:${PORT}`));
