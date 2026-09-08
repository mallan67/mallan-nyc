// Cotality contract code generation — PURE functions (no I/O, no network).
//
//   compactFromParts(parts)        metadata + catalogue + facts -> { compact, lookups }   (ONE assembly path)
//   compactFromBundle(bundle)      evidence bundle (compile-live-contract.mjs) -> compactFromParts
//   renderContractTs(compact, lookups) -> the TypeScript source of lib/cotality/generated/contract.ts
//
// WHY (Maya, 2026-09-08): an agent's knowledge of the provider is whatever is in its context when it
// types a line, so "understanding the API" cannot be a training goal — it has to be a COMPILER fact.
// The live contract is rendered into TypeScript: every resource is an interface with the exact live
// field names and types, every published vocabulary is a string-literal union, and every field carries
// its measured facts (filterable / populated / RLS-listed) as JSDoc that the reader sees inline. A
// phantom field, a misspelling, a British spelling of an enum member, or a `$filter` on a suppressed
// field then fails `npm run type-check` for every agent, forever, without anyone having to know.
//
// Facts come ONLY from the provider: $metadata (existence, types, nullability, navigation), the Field
// catalogue (RESO-standard flag, REBNY/RLS system reference), the Lookup catalogue (published members,
// RLS-listed members, definitions) and the live probes (filterable, populated, entitlement). Nothing
// is inferred from a name. A field the provider suppresses from $filter cannot be counted through
// $filter either, so its population is recorded as null = UNMEASURABLE, never guessed.

import { createHash } from 'node:crypto';

/** Sorted-key canonical form so identical content hashes identically regardless of arrival order. */
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonical(value[k])]));
  return value;
}
export function sha256(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
/** The $metadata fingerprint — ONE formula shared by the compiler and the incremental authority. */
export function metadataSha(parsedMetadata) {
  return sha256({ entitySets: parsedMetadata.entitySets, resources: parsedMetadata.resources, enums: parsedMetadata.enums });
}

const EDM_TO_TS = {
  'Edm.String': 'string',
  'Edm.Guid': 'string',
  'Edm.Date': 'string',
  'Edm.DateTimeOffset': 'string',
  'Edm.TimeOfDay': 'string',
  'Edm.Duration': 'string',
  'Edm.Binary': 'string',
  'Edm.Int16': 'number',
  'Edm.Int32': 'number',
  'Edm.Int64': 'number',
  'Edm.Byte': 'number',
  'Edm.SByte': 'number',
  'Edm.Decimal': 'number',
  'Edm.Double': 'number',
  'Edm.Single': 'number',
  'Edm.Boolean': 'boolean',
};

/** The catalogue spells one resource with an underscore (`Custom_Property`); $metadata does not. */
export function normalizeResourceName(name) {
  return String(name || '').replace(/_/g, '');
}

function hasRls(systemReferences) {
  return String(systemReferences || '').split(',').map((s) => s.trim()).includes('RLS');
}

function modeOf(bundle) {
  return bundle?.fingerprint?.mode || bundle?.acquisition?.mode || 'schema-only';
}

/** Entitlement per resource from light/full field probes: accessible iff at least one field probe succeeded. */
export function accessFromProbes(resourceName, fieldNames, probeIndex) {
  let supported = 0;
  const rejectedHttp = new Map();
  let firstError = null;
  let probed = 0;
  for (const f of fieldNames) {
    const p = probeIndex.get(`${resourceName}.${f}`);
    if (!p?.filterNonNull) continue;
    probed += 1;
    if (p.filterNonNull.state === 'SUPPORTED') supported += 1;
    else {
      const h = p.filterNonNull.httpStatus ?? 0;
      rejectedHttp.set(h, (rejectedHttp.get(h) || 0) + 1);
      if (!firstError) firstError = String(p.filterNonNull.error || '').slice(0, 200) || null;
    }
  }
  if (probed === 0) return { state: 'unmeasured', http: null, error: null };
  if (supported > 0) return { state: 'accessible', http: 200, error: null };
  const modal = [...rejectedHttp.entries()].sort((a, b) => b[1] - a[1])[0];
  return { state: 'rejected', http: modal ? modal[0] : null, error: firstError };
}

/** Per-field measured facts from light/full probes, keyed `Resource.Field`. */
export function factsFromProbes(fieldProbes, accessByResource) {
  const facts = new Map();
  for (const p of fieldProbes) {
    const access = accessByResource[p.resource];
    let filterable = null;
    let populated = null;
    let probeHttp = null;
    if (p.filterNonNull && access?.state === 'accessible') {
      probeHttp = p.filterNonNull.httpStatus ?? null;
      if (p.filterNonNull.state === 'SUPPORTED') {
        filterable = true;
        populated = typeof p.filterNonNull.count === 'number' ? p.filterNonNull.count : null;
      } else if (p.filterNonNull.state === 'PROVIDER_REJECTED') {
        filterable = false;
        populated = null; // UNMEASURABLE through $filter — never guessed
      }
    }
    facts.set(`${p.resource}.${p.field}`, { filterable, populated, probeHttp });
  }
  return facts;
}

/** Navigation ($expand) verdicts from relationship probes, keyed `Resource.Navigation`. */
export function navFactsFromProbes(relProbes) {
  const facts = new Map();
  for (const r of relProbes) {
    facts.set(`${r.resource}.${r.relationship}`, {
      expand: r.evidence?.state ?? null,
      http: r.evidence?.httpStatus ?? null,
      payloadPresent: r.evidence?.relationshipPayloadPresent ?? null,
    });
  }
  return facts;
}

/**
 * Compact raw Lookup catalogue rows into per-(resource, field) vocabularies. Member definitions are
 * kept for resources this subscription can read; a rejected resource is recorded by NAME only
 * (Building alone carries 78k rows of city definitions). Keys use $metadata spelling.
 */
export function compactLookupRows(lookupRows, accessByResource) {
  const index = new Map();
  for (const row of lookupRows) {
    const key = `${normalizeResourceName(row.ResourceName)}.${row.FieldName}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  const lookups = {};
  for (const [key, rows] of index) {
    const dot = key.indexOf('.');
    const resourceName = key.slice(0, dot);
    const field = key.slice(dot + 1);
    const members = [...new Set(rows.map((r) => String(r.LookupValue)))].sort();
    const rls = [...new Set(rows.filter((r) => hasRls(r.SystemReferences)).map((r) => String(r.LookupValue)))].sort();
    const definitions = {};
    if (accessByResource[resourceName]?.state !== 'rejected') {
      for (const r of rows) {
        const v = String(r.LookupValue);
        const d = r.Definition == null ? '' : String(r.Definition).trim();
        if (d && d !== v && !definitions[v]) definitions[v] = d;
      }
    }
    if (!lookups[resourceName]) lookups[resourceName] = {};
    lookups[resourceName][field] = { members, rls, definitions };
  }
  return lookups;
}

/**
 * Build the compact snapshot + the lookup snapshot from PARTS. This is the one assembly path: the
 * full evidence bundle (compactFromBundle) and the incremental authority refresh both feed it.
 *   metadata         parsed $metadata (live-client parseMetadataXml)
 *   fieldRows        Field catalogue rows (complete)
 *   lookups          per-(resource, field) vocabularies (compactLookupRows output, possibly merged)
 *   fieldFacts       Map 'Resource.Field' -> { filterable, populated, probeHttp }
 *   navFacts         Map 'Resource.Navigation' -> { expand, http, payloadPresent }
 *   accessByResource { Resource: { state, http, error } }
 * Deterministic: sorted keys; no timestamps other than the fingerprint's own.
 */
export function compactFromParts({ mode, fingerprint, metadata, fieldRows, lookups: lookupsIn, fieldFacts, navFacts, accessByResource }) {
  if (!metadata?.resources) throw new Error('compactFromParts: no metadata.resources');
  const catalog = new Map();
  for (const row of fieldRows || []) catalog.set(`${normalizeResourceName(row.ResourceName)}.${row.FieldName}`, row);

  const resources = {};
  const lookups = {};
  const resourceNames = Object.keys(metadata.resources).sort();
  let fieldCount = 0;
  let navigationCount = 0;

  for (const resourceName of resourceNames) {
    const resource = metadata.resources[resourceName];
    const fieldNames = Object.keys(resource.fields).sort();
    const navNames = Object.keys(resource.navigation || {}).sort();
    const access = accessByResource[resourceName] || { state: 'unmeasured', http: null, error: null };

    const fields = {};
    for (const f of fieldNames) {
      const info = resource.fields[f];
      const cat = catalog.get(`${resourceName}.${f}`) || null;
      const lk = lookupsIn?.[resourceName]?.[f] || null;
      const fact = (access.state === 'accessible' && fieldFacts.get(`${resourceName}.${f}`)) || { filterable: null, populated: null, probeHttp: null };
      if (lk) {
        if (!lookups[resourceName]) lookups[resourceName] = {};
        lookups[resourceName][f] = {
          members: [...lk.members].sort(),
          rls: [...lk.rls].sort(),
          definitions: access.state === 'rejected' ? {} : { ...lk.definitions },
        };
      }
      fields[f] = {
        type: info.rawType,
        nullable: info.nullable !== false,
        maxLength: info.maxLength ?? null,
        precision: info.precision ?? null,
        scale: info.scale ?? null,
        enum: info.enumName ?? null,
        multi: Boolean(info.multiEnum),
        lookup: lk ? lk.members.length : null,
        filterable: fact.filterable ?? null,
        populated: fact.populated ?? null,
        probeHttp: fact.probeHttp ?? null,
        rlsField: cat ? hasRls(cat.SystemReferences) : null,
        reso: cat ? cat.RESOStandardYN === true : null,
      };
      fieldCount += 1;
    }

    const navigation = {};
    for (const n of navNames) {
      const nav = resource.navigation[n];
      const r = navFacts.get(`${resourceName}.${n}`) || null;
      navigation[n] = {
        target: nav.target,
        collection: Boolean(nav.collection),
        expand: r?.expand ?? null,
        http: r?.http ?? null,
        payloadPresent: r?.payloadPresent ?? null,
      };
      navigationCount += 1;
    }

    resources[resourceName] = {
      entityType: metadata.entitySets?.[resourceName] ?? null,
      access: { state: access.state, http: access.http ?? null, error: access.error ?? null },
      fields,
      navigation,
    };
  }

  const enumTypes = {};
  for (const name of Object.keys(metadata.enums || {}).sort()) {
    enumTypes[name] = (metadata.enums[name] || []).map((m) => String(m.name));
  }

  const fp = fingerprint || {};
  const compact = {
    format: 'mallan-cotality-contract-compact/v1',
    warning: 'GENERATED from the live Cotality API by scripts/cotality/generate-contract-types.mjs. Do NOT hand-edit. Regenerate: npm run cotality:compile:light && npm run cotality:generate',
    fingerprint: {
      evidence_sha256: fp.evidence_sha256 ?? null,
      metadata_sha256: fp.metadata_sha256 ?? metadataSha(metadata),
      catalog_sha256: fp.catalog_sha256 ?? null,
      probe_sha256: fp.probe_sha256 ?? null,
      // Path-independent identity of THIS snapshot's content (resources + vocabularies + enum types).
      content_sha256: null,
      provider_base: fp.provider_base ?? null,
      acquired_at: fp.acquired_at ?? null,
      repo_git_sha: fp.repo_git_sha ?? null,
      source: fp.source ?? 'bundle',
    },
    probe_mode: mode,
    resourceCount: resourceNames.length,
    fieldCount,
    navigationCount,
    resources,
    enumTypes,
  };
  compact.fingerprint.content_sha256 = sha256({ resources, enumTypes, lookups });
  return { compact, lookups };
}

/** Build the compact snapshot + the lookup snapshot from a compile-live-contract.mjs bundle. */
export function compactFromBundle(bundle) {
  if (!bundle?.metadata?.resources) throw new Error('compactFromBundle: bundle has no metadata.resources');
  const mode = modeOf(bundle);
  const meta = bundle.metadata;
  const fieldProbes = bundle.probes?.fields ?? [];
  const relProbes = bundle.probes?.relationships ?? [];
  const probeIndex = new Map();
  for (const p of fieldProbes) probeIndex.set(`${p.resource}.${p.field}`, p);
  const accessByResource = {};
  for (const resourceName of Object.keys(meta.resources)) {
    accessByResource[resourceName] = accessFromProbes(resourceName, Object.keys(meta.resources[resourceName].fields), probeIndex);
  }
  const lookups = compactLookupRows(bundle.catalogs?.lookup?.value?.rows ?? [], accessByResource);
  const fp = bundle.fingerprint || {};
  return compactFromParts({
    mode,
    fingerprint: {
      evidence_sha256: fp.evidence_sha256 ?? null,
      metadata_sha256: fp.metadata_sha256 ?? null,
      catalog_sha256: fp.catalog_sha256 ?? null,
      probe_sha256: fp.probe_sha256 ?? null,
      provider_base: fp.provider_base ?? bundle.acquisition?.base ?? null,
      acquired_at: fp.acquired_at ?? bundle.acquisition?.finishedAt ?? null,
      repo_git_sha: fp.repo_git_sha ?? null,
      source: 'bundle',
    },
    metadata: meta,
    fieldRows: bundle.catalogs?.field?.value?.rows ?? [],
    lookups,
    fieldFacts: factsFromProbes(fieldProbes, accessByResource),
    navFacts: navFactsFromProbes(relProbes),
    accessByResource,
  });
}

// ── TypeScript rendering ────────────────────────────────────────────────────

function tsIdent(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function literalUnion(members) {
  if (!members.length) return 'never';
  return members.map((m) => JSON.stringify(m)).join(' | ');
}

function fmtCount(n) {
  return n.toLocaleString('en-US');
}

function fieldDoc(f, lookup) {
  const parts = [];
  let t = f.type;
  if (f.maxLength != null) t += `(${f.maxLength})`;
  else if (f.precision != null) t += `(${f.precision}${f.scale != null ? `,${f.scale}` : ''})`;
  parts.push(t.replace(/^Cotality\.DataStandard\.RESO\.DD\.Enums\./, 'Enums.'));
  if (f.multi) parts.push('multi-enum (comma-joined member names)');
  if (lookup) parts.push(`Lookup ${lookup.members.length} members (REBNY-referenced ${lookup.rls.length})`);
  if (f.filterable === true) parts.push('filterable');
  else if (f.filterable === false) parts.push('NOT filterable (provider-suppressed)');
  else parts.push('filterability unmeasured');
  if (typeof f.populated === 'number') parts.push(`populated ${fmtCount(f.populated)}`);
  else if (f.filterable === false) parts.push('population unmeasurable');
  if (f.rlsField === true) parts.push('REBNY-referenced (Field.SystemReferences)');
  else if (f.rlsField === false) parts.push('no REBNY reference');
  if (f.reso === false) parts.push('non-RESO');
  return parts.join(' · ');
}

/**
 * Render lib/cotality/generated/contract.ts. Deterministic: same (compact, lookups) -> same text.
 */
export function renderContractTs(compact, lookups) {
  const out = [];
  const resourceNames = Object.keys(compact.resources).sort();
  const fp = compact.fingerprint;

  out.push('// ════════════════════════════════════════════════════════════════════════════════════════');
  out.push('// GENERATED — DO NOT EDIT.  `npm run cotality:compile:light && npm run cotality:generate`');
  out.push('//');
  out.push('// THE COTALITY (TRESTLE) CONTRACT AS TYPESCRIPT. Source: the live authenticated API only —');
  out.push('// $metadata (existence, types, navigation), Field catalogue (RESO/RLS flags), Lookup catalogue');
  out.push('// (published members), per-field live probes (filterable, populated, entitlement).');
  out.push('//');
  out.push(`// provider      ${fp.provider_base}`);
  out.push(`// acquired_at   ${fp.acquired_at}`);
  out.push(`// probe_mode    ${compact.probe_mode}`);
  out.push(`// metadata_sha  ${fp.metadata_sha256}`);
  out.push(`// evidence_sha  ${fp.evidence_sha256}`);
  out.push(`// content_sha   ${fp.content_sha256} (source: ${fp.source})`);
  out.push(`// resources     ${compact.resourceCount} · fields ${compact.fieldCount} · navigations ${compact.navigationCount}`);
  out.push('//');
  out.push('// RULES FOR EVERY READER (human or agent):');
  out.push('//   1. A field that is not on the interface DOES NOT EXIST on this subscription. Do not add it.');
  out.push('//   2. `filterable: false` means the provider rejects $filter/$orderby on it (HTTP 400). It can');
  out.push('//      still be $select-ed. `populated: null` on such a field means UNMEASURABLE, not zero.');
  out.push('//   3. `populated: 0` means declared, selectable, and EMPTY on the live feed at acquisition time.');
  out.push('//      Zero is a fact about the feed — it is never a licence to read a different field instead.');
  out.push('//   4. Enum unions are the Lookup vocabulary published for THAT resource+field (EnumType members');
  out.push('//      when the provider publishes no Lookup). Member spelling is exact (`Canceled`, not `Cancelled`).');
  out.push('//   5. Populations drift daily; membership/existence/filterability change only with a provider');
  out.push('//      Content Patch, which changes metadata_sha and must be followed by regeneration.');
  out.push('// ════════════════════════════════════════════════════════════════════════════════════════');
  out.push('');
  out.push('export const COTALITY_CONTRACT = {');
  out.push(`  provider_base: ${JSON.stringify(fp.provider_base)},`);
  out.push(`  acquired_at: ${JSON.stringify(fp.acquired_at)},`);
  out.push(`  probe_mode: ${JSON.stringify(compact.probe_mode)},`);
  out.push(`  metadata_sha256: ${JSON.stringify(fp.metadata_sha256)},`);
  out.push(`  catalog_sha256: ${JSON.stringify(fp.catalog_sha256)},`);
  out.push(`  probe_sha256: ${JSON.stringify(fp.probe_sha256)},`);
  out.push(`  evidence_sha256: ${JSON.stringify(fp.evidence_sha256)},`);
  out.push(`  content_sha256: ${JSON.stringify(fp.content_sha256)},`);
  out.push(`  source: ${JSON.stringify(fp.source)},`);
  out.push(`  resourceCount: ${compact.resourceCount},`);
  out.push(`  fieldCount: ${compact.fieldCount},`);
  out.push(`  navigationCount: ${compact.navigationCount},`);
  out.push('} as const;');
  out.push('');
  out.push("export type CotalityAccessState = 'accessible' | 'rejected' | 'unmeasured';");
  out.push('');
  out.push('/** Measured facts about one declared field. `null` = unmeasured/unmeasurable, never assumed. */');
  out.push('export interface CotalityFieldFact {');
  out.push('  /** Declared EDM / enum type from $metadata. */');
  out.push('  readonly type: string;');
  out.push('  readonly nullable: boolean;');
  out.push('  /** EnumType name when the field is enum-typed. */');
  out.push('  readonly enum: string | null;');
  out.push('  /** Multi-select enum (serialized as comma-joined member names). */');
  out.push('  readonly multi: boolean;');
  out.push('  /** Number of Lookup rows the provider publishes for this resource+field, or null. */');
  out.push('  readonly lookup: number | null;');
  out.push('  /** true = $filter accepted live; false = provider-suppressed (HTTP 400); null = unmeasured. */');
  out.push('  readonly filterable: boolean | null;');
  out.push('  /** Live `@odata.count` of rows where the field is non-null; null = unmeasurable/unmeasured. */');
  out.push('  readonly populated: number | null;');
  out.push('  /** REBNY reference: the Cotality Field catalogue SystemReferences includes RLS — a compliance / membership fact, never field availability (that is populated / filterable). null = no catalogue row. */');
  out.push('  readonly rlsField: boolean | null;');
  out.push('  /** Field catalogue RESOStandardYN; null = no catalogue row. */');
  out.push('  readonly reso: boolean | null;');
  out.push('}');
  out.push('');

  // Enum unions, deduplicated by member set.
  const unionByKey = new Map(); // key -> typeName
  const unionDecls = [];
  const enumTypeKeys = new Map(); // enumTypeName -> key
  for (const [name, members] of Object.entries(compact.enumTypes)) {
    const key = [...members].sort().join(' ');
    enumTypeKeys.set(name, key);
  }
  function unionTypeFor(resourceName, fieldName, f) {
    const lk = lookups[resourceName]?.[fieldName] || null;
    const members = lk ? lk.members : f.enum ? compact.enumTypes[f.enum] || [] : null;
    if (!members) return null;
    const key = [...members].sort().join(' ');
    if (unionByKey.has(key)) return unionByKey.get(key);
    let typeName;
    if (f.enum && enumTypeKeys.get(f.enum) === key) typeName = `CotalityEnum_${f.enum}`;
    else typeName = `CotalityLookup_${resourceName}_${fieldName}`;
    unionByKey.set(key, typeName);
    const source = f.enum && enumTypeKeys.get(f.enum) === key
      ? `$metadata EnumType ${f.enum}`
      : `Lookup catalogue for ${resourceName}.${fieldName}${f.enum ? ` (EnumType ${f.enum} declares ${(compact.enumTypes[f.enum] || []).length}; the Lookup publishes ${members.length})` : ''}`;
    unionDecls.push(`/** ${members.length} members · ${source} */\nexport type ${typeName} = ${literalUnion([...members].sort())};`);
    return typeName;
  }

  function tsType(resourceName, fieldName, f) {
    let base;
    const collection = /^Collection\((.+)\)$/.exec(f.type);
    const inner = collection ? collection[1] : f.type;
    if (f.enum) {
      const union = unionTypeFor(resourceName, fieldName, f);
      base = f.multi ? 'string' : union || 'string';
    } else {
      base = EDM_TO_TS[inner] || 'unknown';
    }
    if (collection) base = `${base}[]`;
    return f.nullable ? `${base} | null` : base;
  }

  const interfaces = [];
  for (const resourceName of resourceNames) {
    const r = compact.resources[resourceName];
    const fieldNames = Object.keys(r.fields).sort();
    const lines = [];
    const accessDoc = r.access.state === 'accessible'
      ? 'accessible'
      : r.access.state === 'rejected'
        ? `REJECTED on this subscription (HTTP ${r.access.http}${r.access.error ? `: ${r.access.error.replace(/\*\//g, '* /')}` : ''})`
        : 'entitlement unmeasured';
    lines.push(`/** ${resourceName} · ${r.entityType ?? 'no entity set'} · ${fieldNames.length} fields · ${accessDoc} */`);
    lines.push(`export interface Cotality${resourceName} {`);
    for (const fieldName of fieldNames) {
      const f = r.fields[fieldName];
      const lk = lookups[resourceName]?.[fieldName] || null;
      let doc = fieldDoc(f, lk);
      if (f.multi) {
        const union = unionTypeFor(resourceName, fieldName, f);
        if (union) doc += ` · members: ${union}`;
      } else if (!f.enum && lk) {
        doc += ` · string with Lookup (see lookups.live.json)`;
      }
      lines.push(`  /** ${doc.replace(/\*\//g, '* /')} */`);
      lines.push(`  ${tsIdent(fieldName)}: ${tsType(resourceName, fieldName, f)};`);
    }
    lines.push('}');
    // Navigation properties live on a SEPARATE interface: they are `$expand` targets, never `$select`
    // names, so `keyof Cotality<Resource>` must stay "selectable fields only". A row carries them only
    // when expanded (hence optional); the live $expand verdict is in COTALITY_NAVIGATIONS.
    lines.push('');
    lines.push(`/** ${resourceName} navigation properties (present on a row only under $expand). */`);
    lines.push(`export interface Cotality${resourceName}Navigations {`);
    for (const navName of Object.keys(r.navigation).sort()) {
      const v = r.navigation[navName];
      const target = compact.resources[v.target] ? `Cotality${v.target}` : 'unknown';
      const verdict = v.expand == null ? '$expand unmeasured' : v.expand === 'SUPPORTED' ? '$expand SUPPORTED' : `$expand ${v.expand} (HTTP ${v.http})`;
      lines.push(`  /** → ${v.target}${v.collection ? '[]' : ''} · ${verdict} */`);
      lines.push(`  ${tsIdent(navName)}?: ${v.collection ? `${target}[]` : `${target} | null`};`);
    }
    lines.push('}');
    interfaces.push(lines.join('\n'));
  }

  out.push('// ── Vocabularies (string-literal unions) ─────────────────────────────────────────────────');
  out.push('');
  out.push(unionDecls.join('\n\n'));
  out.push('');
  out.push('// ── Resources ─────────────────────────────────────────────────────────────────────────────');
  out.push('');
  out.push(interfaces.join('\n\n'));
  out.push('');
  out.push('export interface CotalityResourceMap {');
  for (const resourceName of resourceNames) out.push(`  ${resourceName}: Cotality${resourceName};`);
  out.push('}');
  out.push('');
  out.push('export interface CotalityNavigationMap {');
  for (const resourceName of resourceNames) out.push(`  ${resourceName}: Cotality${resourceName}Navigations;`);
  out.push('}');
  out.push('');
  out.push(`export const COTALITY_RESOURCES = [${resourceNames.map((n) => JSON.stringify(n)).join(', ')}] as const;`);
  out.push('export type CotalityResource = (typeof COTALITY_RESOURCES)[number];');
  out.push('');
  out.push('/** Entitlement of THIS subscription per resource, measured live (a resource is accessible iff at least one field probe succeeded). */');
  out.push('export const COTALITY_ACCESS = {');
  for (const resourceName of resourceNames) {
    const a = compact.resources[resourceName].access;
    out.push(`  ${resourceName}: { state: ${JSON.stringify(a.state)}, http: ${a.http == null ? 'null' : a.http} },`);
  }
  out.push('} as const satisfies Record<CotalityResource, { state: CotalityAccessState; http: number | null }>;');
  out.push('');
  out.push('/** Declared navigation properties with the live $expand verdict (SUPPORTED / PROVIDER_REJECTED / null = unmeasured). */');
  out.push('export const COTALITY_NAVIGATIONS = {');
  for (const resourceName of resourceNames) {
    const navs = compact.resources[resourceName].navigation;
    const names = Object.keys(navs).sort();
    if (!names.length) {
      out.push(`  ${resourceName}: {},`);
      continue;
    }
    out.push(`  ${resourceName}: {`);
    for (const n of names) {
      const v = navs[n];
      out.push(`    ${tsIdent(n)}: { target: ${JSON.stringify(v.target)}, collection: ${v.collection}, expand: ${v.expand == null ? 'null' : JSON.stringify(v.expand)}, http: ${v.http == null ? 'null' : v.http} },`);
    }
    out.push('  },');
  }
  out.push('} as const;');
  out.push('');
  out.push('/** Every declared field of every resource with its measured facts. Keys are exhaustive: `satisfies` fails the build if a field is missing. */');
  out.push('export const COTALITY_FIELD_FACTS = {');
  for (const resourceName of resourceNames) {
    const r = compact.resources[resourceName];
    out.push(`  ${resourceName}: {`);
    for (const fieldName of Object.keys(r.fields).sort()) {
      const f = r.fields[fieldName];
      out.push(
        `    ${tsIdent(fieldName)}: { type: ${JSON.stringify(f.type)}, nullable: ${f.nullable}, enum: ${f.enum ? JSON.stringify(f.enum) : 'null'}, multi: ${f.multi}, lookup: ${f.lookup == null ? 'null' : f.lookup}, filterable: ${f.filterable == null ? 'null' : f.filterable}, populated: ${f.populated == null ? 'null' : f.populated}, rlsField: ${f.rlsField == null ? 'null' : f.rlsField}, reso: ${f.reso == null ? 'null' : f.reso} },`,
      );
    }
    out.push(`  } satisfies Record<keyof Cotality${resourceName}, CotalityFieldFact>,`);
  }
  out.push('} as const;');
  out.push('');
  return out.join('\n') + '\n';
}
