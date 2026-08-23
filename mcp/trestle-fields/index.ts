/**
 * trestle-fields MCP Server
 *
 * Connects to the live Trestle API at api.cotality.com/trestle and exposes
 * 4 tools for looking up fields, picklists, and validating field names.
 *
 * The $metadata endpoint is fetched on first use and refreshed on a 10-min TTL
 * (env TRESTLE_METADATA_TTL_MS), aligned to the system's Cotality idx-sync cadence
 * unless Cotality specifies otherwise — so field definitions, types, and picklist
 * values track the live Cotality feed closely.
 *
 * Auth: OAuth2 client_credentials using IDX_CLIENT_ID + IDX_CLIENT_SECRET
 * (same credentials as lib/idx/auth.ts in the main project).
 *
 * COMPLIANCE: This server runs locally and never exposes credentials or
 * MLS data outside the agent session. All lookups are audit-logged.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

// ── Config ────────────────────────────────────────────────────────────────────

const TRESTLE_BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';
const METADATA_URL = `${TRESTLE_BASE}/odata/$metadata`;
// 10-min TTL, aligned to the SYSTEM's Cotality idx-sync cadence (`*/10`) unless Cotality specifies
// otherwise. This is our chosen interval, NOT a Cotality-published requirement. (Was 24h — too stale
// for a field-truth authority.) Note: Cotality's $metadata Cache-Control is max-age=10 *seconds* (a
// CDN default from the live response), which is not a metadata-refresh instruction. Env-overridable.
const CACHE_TTL_MS = Number(process.env.TRESTLE_METADATA_TTL_MS) || 10 * 60 * 1000; // 10 minutes
const CACHE_TTL_MIN = Math.round(CACHE_TTL_MS / 60000);

// Known resources on Trestle (for validation + listing)
const KNOWN_RESOURCES = [
  'Property', 'CustomProperty', 'Member', 'Office', 'Media',
  'PropertyUnitTypes', 'OpenHouse', 'PropertyRooms', 'Teams',
  'TeamMembers', 'PropertyGreenVerification', 'Building',
  // System entities
  'Field', 'Lookup', 'Model', 'DataSystem', 'Enumeration',
] as const;

type ResourceName = typeof KNOWN_RESOURCES[number];

// ── Types ─────────────────────────────────────────────────────────────────────

interface FieldInfo {
  name: string;
  resource: string;
  type: string;          // e.g. "String", "Boolean", "Decimal", "Enum", "Multi-Enum", "Date", "DateTime"
  rawType: string;       // full OData type string
  maxLength?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  enumName?: string;     // enum type name if applicable (without namespace)
  isMultiEnum: boolean;
  isEnum: boolean;
  trestleName?: string;  // from annotation if different
  standardName?: string; // RESO standard name from annotation
}

interface EnumValue {
  name: string;
  value: number;
}

interface NavInfo {
  name: string;    // navigation property name, e.g. "Media", "Building", "Rooms"
  target: string;  // target resource (without namespace), e.g. "Media"
  collection: boolean; // true if a Collection(...) ($expand returns many)
}

interface ParsedMetadata {
  fields: Map<string, FieldInfo[]>;           // fieldName (lowercase) → FieldInfo[] (one per resource)
  byResource: Map<string, FieldInfo[]>;        // resourceName → FieldInfo[]
  navigations: Map<string, NavInfo[]>;         // resourceName → subsections ($expand targets)
  enums: Map<string, EnumValue[]>;             // enumName (lowercase) → EnumValue[]
  fetchedAt: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

interface TokenCache {
  access_token: string;
  expiresAt: number;
}

let _tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (_tokenCache && Date.now() < _tokenCache.expiresAt) {
    return _tokenCache.access_token;
  }

  const clientId = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const clientSecret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      '[trestle-fields] Missing IDX_CLIENT_ID or IDX_CLIENT_SECRET. ' +
      'These must be set in the project .env file.'
    );
  }

  const tokenUrl = `${TRESTLE_BASE}/oidc/connect/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'api',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`[trestle-fields] Auth failed (${response.status}): ${text}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  // Cache with 5-minute buffer before expiry
  _tokenCache = {
    access_token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return _tokenCache.access_token;
}

// ── Metadata fetch + parse ────────────────────────────────────────────────────

let _metadataCache: ParsedMetadata | null = null;

function simplifyType(rawType: string): {
  type: string;
  isEnum: boolean;
  isMultiEnum: boolean;
  enumName?: string;
} {
  if (!rawType) return { type: 'String', isEnum: false, isMultiEnum: false };

  // Edm primitives
  if (rawType === 'Edm.String')           return { type: 'String',   isEnum: false, isMultiEnum: false };
  if (rawType === 'Edm.Boolean')          return { type: 'Boolean',  isEnum: false, isMultiEnum: false };
  if (rawType === 'Edm.Int32')            return { type: 'Int32',    isEnum: false, isMultiEnum: false };
  if (rawType === 'Edm.Int64')            return { type: 'Int64',    isEnum: false, isMultiEnum: false };
  if (rawType === 'Edm.Decimal')          return { type: 'Decimal',  isEnum: false, isMultiEnum: false };
  if (rawType === 'Edm.Date')             return { type: 'Date',     isEnum: false, isMultiEnum: false };
  if (rawType === 'Edm.DateTimeOffset')   return { type: 'DateTime', isEnum: false, isMultiEnum: false };

  // Multi-enum: Cotality.DataStandard.RESO.DD.Enums.Multi.XxxYyy
  const multiMatch = rawType.match(/Enums\.Multi\.(.+)$/);
  if (multiMatch) {
    return { type: 'Multi-Enum', isEnum: true, isMultiEnum: true, enumName: multiMatch[1] };
  }

  // Single enum: Cotality.DataStandard.RESO.DD.Enums.XxxYyy
  const enumMatch = rawType.match(/Enums\.(.+)$/);
  if (enumMatch) {
    return { type: 'Enum', isEnum: true, isMultiEnum: false, enumName: enumMatch[1] };
  }

  return { type: rawType, isEnum: false, isMultiEnum: false };
}

function parseMetadataXml(xml: string): ParsedMetadata {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
    parseAttributeValue: true,
    // 'Schema' MUST be here: the live Cotality $metadata has FIVE <Schema> namespaces
    // (RESO.DD holds EntityTypes, RESO.DD.Enums + .Enums.Multi hold EnumTypes). The prior
    // code read a single `Schema` object, so with the multi-schema doc it saw `undefined`
    // for EntityType/EnumType and parsed ZERO fields — every lookup wrongly returned "not found".
    isArray: (tagName) => ['Schema', 'Property', 'NavigationProperty', 'EnumType', 'Member', 'EntityType', 'Annotation'].includes(tagName),
  });

  const parsed = parser.parse(xml);
  const rawSchemas = parsed['edmx:Edmx']['edmx:DataServices']['Schema'];
  const schemas: any[] = Array.isArray(rawSchemas) ? rawSchemas : rawSchemas ? [rawSchemas] : [];

  const fields = new Map<string, FieldInfo[]>();
  const byResource = new Map<string, FieldInfo[]>();
  const navigations = new Map<string, NavInfo[]>();
  const enums = new Map<string, EnumValue[]>();

  // Parse EnumTypes across EVERY schema namespace.
  for (const schema of schemas) {
    const enumTypes: any[] = schema['EnumType'] || [];
    for (const enumType of enumTypes) {
      const enumName = enumType['@_Name'] as string;
      const members: any[] = enumType['Member'] || [];
      const values: EnumValue[] = members.map((m: any) => ({
        name: m['@_Name'] as string,
        value: Number(m['@_Value']),
      }));
      enums.set(enumName.toLowerCase(), values);
    }
  }

  // Parse EntityTypes across EVERY schema namespace.
  for (const schema of schemas) {
    const entityTypes: any[] = schema['EntityType'] || [];
    for (const entityType of entityTypes) {
    const resourceName = entityType['@_Name'] as string;
    const properties: any[] = entityType['Property'] || [];
    const resourceFields: FieldInfo[] = [];

    for (const prop of properties) {
      const fieldName = prop['@_Name'] as string;
      const rawType = (prop['@_Type'] as string) || 'Edm.String';
      const maxLength = prop['@_MaxLength'] ? Number(prop['@_MaxLength']) : undefined;
      const precision = prop['@_Precision'] ? Number(prop['@_Precision']) : undefined;
      const scale = prop['@_Scale'] ? Number(prop['@_Scale']) : undefined;
      const nullable = prop['@_Nullable'] !== false && prop['@_Nullable'] !== 'false';

      // Extract annotations (TrestleName, StandardName)
      let trestleName: string | undefined;
      let standardName: string | undefined;
      const annotations: any[] = prop['Annotation'] || [];
      for (const ann of annotations) {
        const term = ann['@_Term'] as string || '';
        const val = ann['@_String'] as string || '';
        if (term.endsWith('TrestleName')) trestleName = val || undefined;
        if (term.endsWith('StandardName')) standardName = val || undefined;
      }

      const { type, isEnum, isMultiEnum, enumName } = simplifyType(rawType);

      const fieldInfo: FieldInfo = {
        name: fieldName,
        resource: resourceName,
        type,
        rawType,
        maxLength,
        precision,
        scale,
        nullable,
        enumName,
        isMultiEnum,
        isEnum,
        trestleName,
        standardName,
      };

      resourceFields.push(fieldInfo);

      // Index by lowercase field name
      const key = fieldName.toLowerCase();
      if (!fields.has(key)) fields.set(key, []);
      fields.get(key)!.push(fieldInfo);
    }

    byResource.set(resourceName, resourceFields);

    // Subsections: NavigationProperty elements are the $expand targets (Media/photos+video,
    // Building, Rooms, UnitTypes, CustomProperty, OpenHouse, agents/offices…). The prior parser
    // ignored these, so a resource's subsections were invisible.
    const navProps: any[] = entityType['NavigationProperty'] || [];
    const navs: NavInfo[] = navProps.map((n: any) => {
      const rawType = String(n['@_Type'] || '');
      const collection = /^Collection\(/.test(rawType);
      const target = rawType.replace(/^Collection\(/, '').replace(/\)$/, '').split('.').pop() || rawType;
      return { name: n['@_Name'] as string, target, collection };
    });
    navigations.set(resourceName, navs);
    }
  }

  return { fields, byResource, navigations, enums, fetchedAt: Date.now() };
}

async function getMetadata(): Promise<ParsedMetadata> {
  // Return cache if still valid
  if (_metadataCache && Date.now() - _metadataCache.fetchedAt < CACHE_TTL_MS) {
    return _metadataCache;
  }

  let xml: string | null = null;

  // Try live Trestle API first
  try {
    const token = await getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let response: Response;
    try {
      response = await fetch(METADATA_URL, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/xml',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) {
      xml = await response.text();
      auditLog('metadata_fetch', { source: 'live', url: METADATA_URL });
    } else {
      auditLog('metadata_fetch_error', { status: response.status, source: 'live' });
    }
  } catch (err: any) {
    auditLog('metadata_fetch_error', { error: err.message, source: 'live' });
  }

  // NO FALLBACK. Removed 2026-08-23.
  //
  // This used to fall back to the committed artifacts/metadata.xml capture, and
  // recorded that only in a stderr audit line the CALLER NEVER SEES. A tool whose
  // answer is indistinguishable between "live" and "a stale snapshot" is not a
  // source of provider truth - and that capture is demonstrably stale: it declares
  // OwnerOptOut, which exists on no live Cotality resource.
  //
  // Three states, never collapsed: VERIFIED LIVE / PROVIDER REJECTED / UNVERIFIED.
  // An acquisition failure is UNVERIFIED and must surface as an error, because
  // UNVERIFIED silently dressed as an answer is how stale provider truth returns.
  if (!xml) {
    throw new Error(
      '[trestle-fields] UNVERIFIED: could not fetch $metadata from the live Cotality API. ' +
      'There is deliberately no snapshot fallback - a stale answer is worse than no answer. ' +
      'Check IDX_CLIENT_ID, IDX_CLIENT_SECRET, and network connectivity.'
    );
  }

  _metadataCache = parseMetadataXml(xml);
  return _metadataCache;
}

// ── Audit log ─────────────────────────────────────────────────────────────────

function auditLog(action: string, data: Record<string, unknown>): void {
  // Write to stderr (MCP stdio uses stdout for protocol, stderr for logs)
  const entry = {
    ts: new Date().toISOString(),
    service: 'trestle-fields-mcp',
    action,
    ...data,
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'trestle-fields',
  version: '1.0.0',
});

// ── Tool 1: trestle_lookup_field ──────────────────────────────────────────────

server.tool(
  'trestle_lookup_field',
  'Look up a Trestle/REBNY field by name. Returns the resource(s) it appears on, data type, max length, nullable, and enum values if it is a picklist field. Data is always current — fetched live from the Trestle $metadata endpoint.',
  {
    field_name: z.string().describe('Field name to look up, e.g. "ListPrice", "MlsStatus", "BedroomsTotal"'),
    resource: z.string().optional().describe('Optional: narrow to a specific resource, e.g. "Property", "CustomProperty"'),
  },
  async ({ field_name, resource }) => {
    auditLog('tool_call', { tool: 'trestle_lookup_field', field_name, resource });

    const meta = await getMetadata();
    const key = field_name.toLowerCase();
    let matches = meta.fields.get(key);

    if (!matches || matches.length === 0) {
      // Try fuzzy match — find fields containing the query
      const fuzzy: FieldInfo[] = [];
      meta.fields.forEach((infos, k) => {
        if (k.includes(key) || key.includes(k)) fuzzy.push(...infos);
      });

      if (fuzzy.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `Field "${field_name}" not found on Trestle.\n\nNo fuzzy matches found either.\n\nTip: field names are case-sensitive on Trestle (PascalCase). Try trestle_validate_field to check for similar names.`,
          }],
        };
      }

      const suggestions = [...new Set(fuzzy.map(f => f.name))].slice(0, 5).join(', ');
      return {
        content: [{
          type: 'text',
          text: `Field "${field_name}" not found exactly. Did you mean: ${suggestions}?\n\nUse trestle_validate_field to check spelling.`,
        }],
      };
    }

    // Filter by resource if specified
    if (resource) {
      matches = matches.filter(f => f.resource.toLowerCase() === resource.toLowerCase());
      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `Field "${field_name}" exists on Trestle but NOT on resource "${resource}".\n\nIt appears on: ${meta.fields.get(key)!.map(f => f.resource).join(', ')}`,
          }],
        };
      }
    }

    const lines: string[] = [`# ${matches[0].name}\n`];

    for (const f of matches) {
      lines.push(`## Resource: ${f.resource}`);
      lines.push(`- **Type:** ${f.type}${f.isMultiEnum ? ' (comma-separated multi-value)' : ''}`);
      if (f.maxLength) lines.push(`- **Max Length:** ${f.maxLength}`);
      if (f.precision) lines.push(`- **Precision/Scale:** ${f.precision}/${f.scale ?? 0}`);
      lines.push(`- **Nullable:** ${f.nullable}`);
      if (f.trestleName && f.trestleName !== f.name) lines.push(`- **Trestle Name:** ${f.trestleName}`);
      if (f.standardName) lines.push(`- **RESO Standard Name:** ${f.standardName}`);

      if (f.isEnum && f.enumName) {
        const enumValues = meta.enums.get(f.enumName.toLowerCase());
        if (enumValues && enumValues.length > 0) {
          lines.push(`- **Picklist Values (${enumValues.length}):** ${enumValues.map(v => v.name).join(', ')}`);
        } else {
          lines.push(`- **Enum:** ${f.enumName} (use trestle_get_picklist to see values)`);
        }
      }

      lines.push('');
    }

    const cacheAge = Math.round((Date.now() - meta.fetchedAt) / 60000);
    lines.push(`---\n*Data from Trestle $metadata — cached ${cacheAge}m ago, refreshes every ${CACHE_TTL_MIN}m*`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 2: trestle_list_fields ───────────────────────────────────────────────

server.tool(
  'trestle_list_fields',
  'List all fields available on a specific Trestle resource. Returns field names, types, and whether they are enum/picklist fields.',
  {
    // Accept ANY live Cotality resource (validated against the parsed $metadata below), rather
    // than a hardcoded enum that drifts — the live feed currently exposes 17 resources incl.
    // Media (photos/video), HistoryTransactional, Model, Enumeration. A static list silently
    // dropped sections; this keeps every section reachable, including new ones Cotality adds.
    resource: z.string().describe('Cotality resource name — e.g. Property, Media, Office, HistoryTransactional, Building. Any live resource is accepted.'),
    type_filter: z.enum(['all', 'enum', 'string', 'numeric', 'boolean', 'date']).optional()
      .describe('Optional: filter by data type'),
  },
  async ({ resource, type_filter }) => {
    auditLog('tool_call', { tool: 'trestle_list_fields', resource, type_filter });

    const meta = await getMetadata();
    // Case-insensitive resolve so "media"/"Media" both work.
    const liveResources = [...meta.byResource.keys()];
    const resolved = liveResources.find((r) => r.toLowerCase() === resource.toLowerCase());
    let fields = resolved ? meta.byResource.get(resolved) : undefined;

    if (!fields) {
      return {
        content: [{
          type: 'text',
          text: `Resource "${resource}" not found in the live Cotality $metadata.\n\nAvailable live resources (${liveResources.length}): ${liveResources.join(', ')}`,
        }],
      };
    }

    // Apply type filter
    if (type_filter && type_filter !== 'all') {
      fields = fields.filter(f => {
        switch (type_filter) {
          case 'enum':    return f.isEnum;
          case 'string':  return f.type === 'String';
          case 'numeric': return ['Decimal', 'Int32', 'Int64'].includes(f.type);
          case 'boolean': return f.type === 'Boolean';
          case 'date':    return ['Date', 'DateTime'].includes(f.type);
          default:        return true;
        }
      });
    }

    const lines: string[] = [
      `# ${resolved} Fields (${fields.length}${type_filter && type_filter !== 'all' ? ` — ${type_filter} only` : ''})\n`,
    ];

    // Group by type for readability
    const byType = new Map<string, FieldInfo[]>();
    for (const f of fields) {
      if (!byType.has(f.type)) byType.set(f.type, []);
      byType.get(f.type)!.push(f);
    }

    const typeOrder = ['String', 'Enum', 'Multi-Enum', 'Boolean', 'Decimal', 'Int32', 'Int64', 'Date', 'DateTime'];
    const sortedTypes = [...byType.keys()].sort((a, b) => {
      const ai = typeOrder.indexOf(a), bi = typeOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    for (const type of sortedTypes) {
      const group = byType.get(type)!;
      lines.push(`## ${type} (${group.length})`);
      lines.push(group.map(f => `- \`${f.name}\`${f.maxLength ? ` [${f.maxLength}]` : ''}${f.isEnum ? ` → ${f.enumName}` : ''}`).join('\n'));
      lines.push('');
    }

    // Subsections — the $expand targets (Media/photos+video, Building, Rooms, UnitTypes, etc.).
    const navs = meta.navigations.get(resolved!) || [];
    if (navs.length) {
      lines.push(`## Subsections — \`$expand\` targets (${navs.length})`);
      lines.push(navs.map(n => `- \`${n.name}\` → ${n.target}${n.collection ? ' (collection)' : ''}`).join('\n'));
      lines.push('');
    }

    const cacheAge = Math.round((Date.now() - meta.fetchedAt) / 60000);
    lines.push(`---\n*Cached ${cacheAge}m ago — refreshes every ${CACHE_TTL_MIN}m from live Cotality $metadata*`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 3: trestle_get_picklist ──────────────────────────────────────────────

server.tool(
  'trestle_get_picklist',
  'Get all valid picklist values for a Trestle enum field. Use this to find the exact accepted values before setting a field in a listing form or API call.',
  {
    field_name: z.string().describe('Field name, e.g. "MlsStatus", "PropertyType", "CommonInterest"'),
    resource: z.string().optional().describe('Optional: narrow to a specific resource if the field appears on multiple'),
  },
  async ({ field_name, resource }) => {
    auditLog('tool_call', { tool: 'trestle_get_picklist', field_name, resource });

    const meta = await getMetadata();
    const key = field_name.toLowerCase();
    let matches = meta.fields.get(key);

    if (!matches || matches.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Field "${field_name}" not found on Trestle. Check spelling with trestle_validate_field.`,
        }],
      };
    }

    if (resource) {
      matches = matches.filter(f => f.resource.toLowerCase() === resource.toLowerCase());
    }

    const enumFields = matches.filter(f => f.isEnum && f.enumName);
    if (enumFields.length === 0) {
      const types = [...new Set(matches.map(f => f.type))].join(', ');
      return {
        content: [{
          type: 'text',
          text: `"${field_name}" is not a picklist field — it is type: ${types}.\n\nOnly Enum and Multi-Enum fields have picklist values.`,
        }],
      };
    }

    const f = enumFields[0];
    const enumValues = meta.enums.get(f.enumName!.toLowerCase());

    if (!enumValues || enumValues.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `"${field_name}" is enum type "${f.enumName}" but no values found in $metadata.\n\nThis may be a lookup-table enum — use the Trestle /odata/Lookup endpoint for runtime values.`,
        }],
      };
    }

    const lines: string[] = [
      `# Picklist: ${f.name}`,
      `**Enum type:** ${f.enumName}${f.isMultiEnum ? ' *(multi-value — comma-separated)*' : ''}`,
      `**Resource:** ${f.resource}`,
      `**Total values:** ${enumValues.length}\n`,
      '| Value | Integer |',
      '|-------|---------|',
      ...enumValues.map(v => `| \`${v.name}\` | ${v.value} |`),
    ];

    const cacheAge = Math.round((Date.now() - meta.fetchedAt) / 60000);
    lines.push(`\n---\n*Cached ${cacheAge}m ago — refreshes every ${CACHE_TTL_MIN}m from live Trestle $metadata*`);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 4: trestle_validate_field ────────────────────────────────────────────

server.tool(
  'trestle_validate_field',
  'Validate whether a field name exists on Trestle and which resources it appears on. Use before adding a field to a form, API call, or mapping to confirm it is real and correctly spelled.',
  {
    field_name: z.string().describe('Field name to validate, e.g. "ListPrice"'),
  },
  async ({ field_name }) => {
    auditLog('tool_call', { tool: 'trestle_validate_field', field_name });

    const meta = await getMetadata();
    const key = field_name.toLowerCase();
    const exact = meta.fields.get(key);

    // Find similar field names (contains match)
    const similar: string[] = [];
    meta.fields.forEach((_, k) => {
      if (k !== key && (k.includes(key) || key.includes(k) || levenshtein(k, key) <= 3)) {
        similar.push(meta.fields.get(k)![0].name);
      }
    });
    const suggestions = similar.slice(0, 8);

    if (exact && exact.length > 0) {
      const resources = exact.map(f => f.resource);
      const type = exact[0].type;
      const lines = [
        `✅ **"${exact[0].name}"** EXISTS on Trestle`,
        `- **Resources:** ${resources.join(', ')}`,
        `- **Type:** ${type}`,
        exact[0].isEnum ? `- **Picklist:** Yes (${exact[0].enumName})` : '',
        exact[0].maxLength ? `- **Max Length:** ${exact[0].maxLength}` : '',
      ].filter(Boolean);

      if (suggestions.length > 0) {
        lines.push(`\n*Similar fields: ${suggestions.join(', ')}*`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // Not found
    const lines = [
      `❌ **"${field_name}"** does NOT exist on Trestle`,
      '',
      'Common reasons:',
      '- Wrong case (field names are PascalCase, e.g. `ListPrice` not `list_price`)',
      '- Field belongs to a different resource (e.g. `CustomProperty` not `Property`)',
      '- Field was renamed between RESO versions',
    ];

    if (suggestions.length > 0) {
      lines.push('', `**Did you mean?** ${suggestions.join(', ')}`);
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Levenshtein distance (for fuzzy field name matching) ──────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
  // Pre-warm the metadata cache on startup
  try {
    await getMetadata();
    process.stderr.write(JSON.stringify({
      ts: new Date().toISOString(),
      service: 'trestle-fields-mcp',
      action: 'startup',
      status: 'ready',
      fields: _metadataCache ? [..._metadataCache.fields.keys()].length : 0,
      resources: _metadataCache ? _metadataCache.byResource.size : 0,
    }) + '\n');
  } catch (err: any) {
    process.stderr.write(JSON.stringify({
      ts: new Date().toISOString(),
      service: 'trestle-fields-mcp',
      action: 'startup_warning',
      error: err.message,
      note: 'Will retry on first tool call',
    }) + '\n');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(),
    service: 'trestle-fields-mcp',
    action: 'fatal_error',
    error: err.message,
  }) + '\n');
  process.exit(1);
});
