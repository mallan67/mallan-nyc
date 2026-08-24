// Live Cotality contract client.
//
// PURPOSE
// -------
// One read-only acquisition path for provider truth. Every caller sees the same
// authentication, pagination, retry, HTTP classification, and live-only rules.
// There is deliberately NO snapshot/CSV/document fallback. If Cotality cannot be
// read, the answer is UNVERIFIED.
//
// This module does not contain Mallan business mappings. It reads the raw provider
// contract and data so mapping code can be verified against evidence rather than
// guesses.

const DEFAULT_BASE = 'https://api.cotality.com/trestle';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_MAX_PAGES = 20_000;

export const PROBE_STATE = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  PROVIDER_REJECTED: 'PROVIDER_REJECTED',
  UNVERIFIED: 'UNVERIFIED',
});

export class CotalityHttpError extends Error {
  constructor(message, { status = null, body = '', url = '', retryable = false } = {}) {
    super(message);
    this.name = 'CotalityHttpError';
    this.status = status;
    this.body = body;
    this.url = url;
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boundedRetryAfter(response) {
  const raw = response.headers.get('retry-after');
  if (!raw) return 1_000;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(250, Math.min(seconds * 1_000, 30_000));
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(250, Math.min(at - Date.now(), 30_000));
  return 1_000;
}

function safeErrorBody(text) {
  // Provider error text can be useful evidence, but never let a huge response or
  // accidental credential echo become an artifact.
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[REDACTED]')
    .slice(0, 2_000);
}

function assertResource(resource) {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(resource)) {
    throw new Error(`Invalid Cotality resource name: ${resource}`);
  }
}

function attrs(tag) {
  const out = {};
  for (const m of String(tag).matchAll(/([A-Za-z][A-Za-z0-9:]*)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

export function parseMetadataXml(xml) {
  const enums = {};
  for (const m of String(xml).matchAll(/<EnumType\s+Name="([^"]+)"[^>]*>([\s\S]*?)<\/EnumType>/g)) {
    enums[m[1]] = [...m[2].matchAll(/<Member\s+([^>]*?)\/?\s*>/g)].map((member) => {
      const a = attrs(member[1]);
      return { name: a.Name, value: a.Value == null ? null : Number(a.Value) };
    });
  }

  const resources = {};
  for (const m of String(xml).matchAll(/<EntityType\s+([^>]*?)>([\s\S]*?)<\/EntityType>/g)) {
    const entityAttrs = attrs(m[1]);
    if (!entityAttrs.Name) continue;
    const body = m[2];
    const fields = {};
    for (const p of body.matchAll(/<Property\s+([^>]*?)\/?\s*>/g)) {
      const a = attrs(p[1]);
      if (!a.Name) continue;
      const rawType = a.Type || null;
      const enumMatch = rawType?.match(/\.Enums\.(?:Multi\.)?([^.]*)$/);
      fields[a.Name] = {
        name: a.Name,
        rawType,
        nullable: a.Nullable !== 'false',
        maxLength: a.MaxLength == null ? null : Number(a.MaxLength),
        precision: a.Precision == null ? null : Number(a.Precision),
        scale: a.Scale == null ? null : Number(a.Scale),
        enumName: enumMatch?.[1] || null,
        multiEnum: Boolean(rawType && rawType.includes('.Enums.Multi.')),
      };
    }
    const navigation = {};
    for (const n of body.matchAll(/<NavigationProperty\s+([^>]*?)\/?\s*>/g)) {
      const a = attrs(n[1]);
      if (!a.Name) continue;
      const rawType = a.Type || '';
      navigation[a.Name] = {
        name: a.Name,
        rawType,
        collection: rawType.startsWith('Collection('),
        target: rawType.replace(/^Collection\(/, '').replace(/\)$/, '').split('.').pop() || rawType,
      };
    }
    resources[entityAttrs.Name] = { name: entityAttrs.Name, fields, navigation };
  }

  const entitySets = {};
  for (const container of String(xml).matchAll(/<EntityContainer\s+[^>]*>([\s\S]*?)<\/EntityContainer>/g)) {
    for (const s of container[1].matchAll(/<EntitySet\s+([^>]*?)(?:\/>|>)/g)) {
      const a = attrs(s[1]);
      if (a.Name) entitySets[a.Name] = a.EntityType || null;
    }
  }

  return {
    resources,
    enums,
    entitySets,
    resourceCount: Object.keys(resources).length,
    enumCount: Object.keys(enums).length,
    fieldCount: Object.values(resources).reduce((sum, resource) => sum + Object.keys(resource.fields).length, 0),
    navigationCount: Object.values(resources).reduce((sum, resource) => sum + Object.keys(resource.navigation).length, 0),
  };
}

export function classifyProbeError(error) {
  if (error instanceof CotalityHttpError && [400, 403, 404, 405, 422].includes(Number(error.status))) {
    return PROBE_STATE.PROVIDER_REJECTED;
  }
  return PROBE_STATE.UNVERIFIED;
}

export function createCotalityClient(options = {}) {
  const base = String(options.baseUrl || process.env.TRESTLE_API_URL || DEFAULT_BASE).replace(/\/$/, '');
  const clientId = options.clientId || process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY || '';
  const clientSecret = options.clientSecret || process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET || '';
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const retries = Number(options.retries ?? DEFAULT_RETRIES);

  let tokenCache = null;

  function ensureCredentials() {
    if (!clientId || !clientSecret) {
      throw new Error('UNVERIFIED: IDX_CLIENT_ID/IDX_CLIENT_SECRET are required for live Cotality verification.');
    }
  }

  async function getAccessToken({ force = false } = {}) {
    ensureCredentials();
    if (!force && tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.value;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${base}/oidc/connect/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'api',
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new CotalityHttpError(`Cotality authentication unreachable: ${error?.message || error}`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = safeErrorBody(await response.text().catch(() => ''));
      throw new CotalityHttpError(`Cotality authentication failed (${response.status})`, {
        status: response.status,
        body,
        url: `${base}/oidc/connect/token`,
      });
    }

    const json = await response.json();
    if (!json.access_token) throw new CotalityHttpError('Cotality authentication returned no access token.');
    const expiresIn = Number(json.expires_in || 3600);
    tokenCache = {
      value: json.access_token,
      expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1_000,
    };
    return tokenCache.value;
  }

  function normalizeUrl(pathOrUrl) {
    const raw = String(pathOrUrl);
    const url = raw.startsWith('http://') || raw.startsWith('https://') ? new URL(raw) : new URL(raw.replace(/^\//, ''), `${base}/`);
    const allowed = new URL(base);
    if (url.origin !== allowed.origin || !url.pathname.startsWith(allowed.pathname.replace(/\/$/, ''))) {
      throw new Error(`Refusing non-Cotality URL: ${url.toString()}`);
    }
    return url.toString();
  }

  async function request(pathOrUrl, { accept = 'application/json', retryCount = retries } = {}) {
    let url = normalizeUrl(pathOrUrl);
    let refreshed401 = false;
    let attempt = 0;

    while (true) {
      const token = await getAccessToken({ force: refreshed401 });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(url, {
          headers: { authorization: `Bearer ${token}`, accept },
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        if (attempt < retryCount) {
          attempt += 1;
          await sleep(Math.min(500 * 2 ** attempt, 5_000));
          continue;
        }
        throw new CotalityHttpError(`Cotality request unreachable: ${error?.message || error}`, { url, retryable: true });
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401 && !refreshed401) {
        tokenCache = null;
        refreshed401 = true;
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < retryCount) {
        attempt += 1;
        await sleep(response.status === 429 ? boundedRetryAfter(response) : Math.min(500 * 2 ** attempt, 5_000));
        continue;
      }
      if (!response.ok) {
        const body = safeErrorBody(await response.text().catch(() => ''));
        throw new CotalityHttpError(`Cotality request failed (${response.status})`, {
          status: response.status,
          body,
          url,
          retryable: response.status === 429 || response.status >= 500,
        });
      }
      return response;
    }
  }

  async function getJson(pathOrUrl) {
    const response = await request(pathOrUrl, { accept: 'application/json' });
    return response.json();
  }

  async function getText(pathOrUrl, accept = 'application/xml') {
    const response = await request(pathOrUrl, { accept });
    return response.text();
  }

  function buildODataUrl(resource, query = {}) {
    assertResource(resource);
    const url = new URL(`${base}/odata/${resource}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async function query(resource, queryParams = {}) {
    return getJson(buildODataUrl(resource, queryParams));
  }

  async function page(resource, queryParams = {}, pageOptions = {}) {
    const maxRows = pageOptions.maxRows == null ? Infinity : Number(pageOptions.maxRows);
    const maxPages = pageOptions.maxPages == null ? DEFAULT_MAX_PAGES : Number(pageOptions.maxPages);
    let next = buildODataUrl(resource, queryParams);
    const rows = [];
    let pages = 0;
    let odataCount = null;
    let truncated = false;

    while (next) {
      if (pages >= maxPages) {
        truncated = true;
        break;
      }
      pages += 1;
      const json = await getJson(next);
      const batch = Array.isArray(json.value) ? json.value : [];
      if (odataCount == null && json['@odata.count'] != null) odataCount = Number(json['@odata.count']);
      for (const row of batch) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        rows.push(row);
      }
      if (truncated) break;
      const candidate = json['@odata.nextLink'];
      next = candidate ? normalizeUrl(candidate) : null;
      if (batch.length === 0 && next) {
        throw new Error(`UNVERIFIED: ${resource} returned an empty page with @odata.nextLink; refusing to claim complete pagination.`);
      }
    }

    return {
      resource,
      rows,
      pages,
      odataCount,
      complete: !truncated && next == null,
      nextLink: next,
    };
  }

  async function serviceDocument() {
    return getJson(`${base}/odata/`);
  }

  async function metadata() {
    const xml = await getText(`${base}/odata/$metadata`, 'application/xml');
    return { xml, parsed: parseMetadataXml(xml) };
  }

  async function dataSystem() {
    return page('DataSystem', { '$top': 1000 }, { maxRows: Infinity });
  }

  async function fieldCatalog() {
    return page('Field', { '$top': 1000 }, { maxRows: Infinity });
  }

  async function lookupCatalog() {
    return page('Lookup', { '$top': 1000 }, { maxRows: Infinity });
  }

  async function modelCatalog() {
    return page('Model', { '$top': 1000 }, { maxRows: Infinity });
  }

  async function enumerationCatalog() {
    return page('Enumeration', { '$top': 1000 }, { maxRows: Infinity });
  }

  async function probe(resource, queryParams, label = 'query') {
    try {
      const json = await query(resource, queryParams);
      return {
        label,
        state: PROBE_STATE.SUPPORTED,
        httpStatus: 200,
        count: json['@odata.count'] == null ? null : Number(json['@odata.count']),
        rowCount: Array.isArray(json.value) ? json.value.length : null,
        sample: Array.isArray(json.value) && json.value.length ? json.value[0] : null,
      };
    } catch (error) {
      return {
        label,
        state: classifyProbeError(error),
        httpStatus: error instanceof CotalityHttpError ? error.status : null,
        error: error instanceof CotalityHttpError ? error.body || error.message : String(error?.message || error),
      };
    }
  }

  async function probeField(resource, field, fieldInfo = null) {
    assertResource(resource);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error(`Invalid Cotality field name: ${field}`);

    const evidence = {
      resource,
      field,
      declared: Boolean(fieldInfo),
      select: await probe(resource, { '$select': field, '$top': 1 }, 'select'),
      filterNonNull: await probe(resource, { '$select': field, '$count': 'true', '$top': 0, '$filter': `${field} ne null` }, 'filter_non_null'),
      sort: await probe(resource, { '$select': field, '$top': 1, '$orderby': field }, 'orderby'),
      operator: null,
    };

    const rawType = fieldInfo?.rawType || '';
    const enumName = fieldInfo?.enumName || null;
    const enumMembers = enumName ? (fieldInfo.__enumMembers || []) : [];
    let filter = null;
    if (fieldInfo?.multiEnum && enumMembers[0]) filter = `${field} has ${enumMembers[0]}`;
    else if (enumName && enumMembers[0]) filter = `${field} eq '${String(enumMembers[0]).replace(/'/g, "''")}'`;
    else if (rawType === 'Edm.Boolean') filter = `${field} eq true`;
    else if (['Edm.Int32', 'Edm.Int64', 'Edm.Decimal', 'Edm.Double', 'Edm.Single'].includes(rawType)) filter = `${field} ge 0`;
    else if (rawType === 'Edm.Date') filter = `${field} ge 1900-01-01`;
    else if (rawType === 'Edm.DateTimeOffset') filter = `${field} ge 1900-01-01T00:00:00Z`;
    else if (rawType === 'Edm.String') filter = `startswith(${field},'')`;
    if (filter) evidence.operator = await probe(resource, { '$select': field, '$count': 'true', '$top': 0, '$filter': filter }, 'type_operator');
    return evidence;
  }

  async function probeRelationship(resource, relationship) {
    assertResource(resource);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(relationship)) throw new Error(`Invalid Cotality relationship: ${relationship}`);
    const result = await probe(resource, { '$top': 1, '$expand': `${relationship}($top=1)` }, `expand:${relationship}`);
    if (result.state === PROBE_STATE.SUPPORTED && result.sample) {
      const payload = result.sample[relationship];
      result.relationshipPayloadPresent = Array.isArray(payload) ? payload.length > 0 : payload != null;
    }
    return result;
  }

  return {
    base,
    getAccessToken,
    request,
    getJson,
    getText,
    query,
    page,
    serviceDocument,
    metadata,
    dataSystem,
    fieldCatalog,
    lookupCatalog,
    modelCatalog,
    enumerationCatalog,
    probe,
    probeField,
    probeRelationship,
  };
}

export async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(Number(limit) || 1, items.length || 1)) }, run));
  return out;
}
