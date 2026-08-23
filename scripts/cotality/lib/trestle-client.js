/**
 * scripts/cotality/lib/trestle-client.js
 * Shared OAuth + OData helpers for the read-only RESO toolkit.
 *
 * Wraps the IDX_CLIENT_ID / IDX_CLIENT_SECRET pair from .env.local against
 * Cotality's Trestle OData endpoint. Token TTL is ~12 minutes; we cache
 * within the process so a single invocation can fan out parallel queries
 * without re-authenticating.
 *
 * All exports are pure read paths. Nothing in this file writes to the
 * project DB or to Trestle. Safe to call during master-plan migrations.
 */
const TRESTLE_API = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpiry > now + 30_000) return cachedToken;

  const clientId = process.env.IDX_CLIENT_ID;
  const clientSecret = process.env.IDX_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET in .env.local');
  }

  const r = await fetch(`${TRESTLE_API}/oidc/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'api',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('Token: ' + JSON.stringify(j));

  cachedToken = j.access_token;
  // Trestle tokens last ~12 min; expires_in is in seconds.
  cachedTokenExpiry = now + (j.expires_in ? j.expires_in * 1000 : 12 * 60_000);
  return cachedToken;
}

/**
 * Generic OData GET. Returns parsed JSON or throws with status + body.
 * `params` is a plain object — values are encoded automatically.
 *
 * Retries automatically on 429 (Trestle rate-limit) with the
 * `Retry-After` header value, up to `options.retries` times (default 1).
 * Other errors throw immediately.
 */
async function odataGet(entity, params = {}, options = {}) {
  const token = options.token || (await getToken());
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    qs.set(key.startsWith('$') ? key : `$${key}`, String(value));
  }
  const url = `${TRESTLE_API}/odata/${entity}${qs.toString() ? '?' + qs.toString() : ''}`;

  const maxRetries = options.retries ?? 1;
  let attempt = 0;
  while (true) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    });
    if (r.ok) return r.json();

    if (r.status === 429 && attempt < maxRetries) {
      const retryAfterRaw = r.headers.get('Retry-After');
      const retryAfterSec = Number(retryAfterRaw);
      const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 60_000)
        : 5_000;
      attempt++;
      await new Promise((res) => setTimeout(res, waitMs));
      continue;
    }

    const body = await r.text().catch(() => '');
    const err = new Error(`OData ${entity} ${r.status} ${r.statusText}: ${body.slice(0, 200)}`);
    err.status = r.status;
    err.url = url;
    throw err;
  }
}

/**
 * `$count=true` with optional `$filter`. Returns null on error.
 */
async function odataCount(entity, filter, options = {}) {
  try {
    const params = { top: 0, count: 'true' };
    if (filter) params.filter = filter;
    const j = await odataGet(entity, params, options);
    return j['@odata.count'] ?? null;
  } catch (err) {
    if (options.throwOnError) throw err;
    return null;
  }
}

/**
 * Fetch a single record sorted by `field desc` — useful for reading
 * the latest ModificationTimestamp without dragging back a large page.
 * OData v4 has no min/max aggregate without `$apply`; this is the
 * canonical equivalent.
 */
async function odataLatestField(entity, field, filter, options = {}) {
  try {
    const params = {
      select: field,
      orderby: `${field} desc`,
      top: 1,
    };
    if (filter) params.filter = filter;
    const j = await odataGet(entity, params, options);
    return j.value?.[0]?.[field] ?? null;
  } catch (err) {
    if (options.throwOnError) throw err;
    return null;
  }
}

/**
 * Sample N records and return a JS array of the requested $select fields.
 * Useful for coverage and lookup discovery.
 */
async function odataSample(entity, select, filter, top = 100, options = {}) {
  const params = {
    select: select.join(','),
    top,
  };
  if (filter) params.filter = filter;
  const j = await odataGet(entity, params, options);
  return j.value || [];
}

module.exports = {
  TRESTLE_API,
  getToken,
  odataGet,
  odataCount,
  odataLatestField,
  odataSample,
};
