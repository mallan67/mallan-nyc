#!/usr/bin/env node
// Agent/engine CLI over the single live Cotality client.
// Outputs JSON only on stdout. Diagnostics/errors go to stderr.
// No snapshots, CSVs, legacy dictionaries, or docs are consulted.

import { createCotalityClient } from './live-client.mjs';

const [command, ...argv] = process.argv.slice(2);
const client = createCotalityClient();

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  if (!Number.isFinite(value)) throw new Error(`Invalid --${name}`);
  return value;
}

function boolArg(name, fallback = false) {
  const raw = arg(name, null);
  if (raw === null) return argv.includes(`--${name}`) ? true : fallback;
  return raw === 'true' || raw === '1';
}

function requireArg(name) {
  const value = arg(name);
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function selectFields(raw) {
  if (!raw) return null;
  const fields = raw.split(',').map((x) => x.trim()).filter(Boolean);
  for (const field of fields) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error(`Invalid field: ${field}`);
  }
  return fields;
}

function output(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

async function main() {
  if (!command || command === 'help') {
    output({
      commands: {
        census: 'Current $metadata resource/field/enum/relationship counts and resources',
        resource: '--resource=Property [--type=all|string|numeric|boolean|date|enum]',
        field: '--field=ListPrice [--resource=Property]',
        picklist: '--field=StandardStatus [--resource=Property]',
        lookup: '[--field=PropertySubType] [--resource=Property] [--lookup=PropertySubType] [--max=5000]',
        query: '--resource=Property [--select=A,B] [--filter=...] [--orderby=...] [--expand=...] [--top=50] [--skip=0] [--count=true]',
        page: 'same as query plus [--max=5000] and follows @odata.nextLink',
        probeField: '--resource=Property --field=ListPrice',
        probeRelationship: '--resource=Property --relationship=Media',
        dataSystem: 'Read /odata/DataSystem live',
        service: 'Read /odata/ service document live',
      },
    });
    return;
  }

  if (command === 'census') {
    const { parsed } = await client.metadata();
    output({
      source: 'LIVE_COTALITY',
      base: client.base,
      resourceCount: parsed.resourceCount,
      fieldCount: parsed.fieldCount,
      enumCount: parsed.enumCount,
      navigationCount: parsed.navigationCount,
      resources: Object.values(parsed.resources).map((resource) => ({
        resource: resource.name,
        fields: Object.keys(resource.fields).length,
        relationships: Object.values(resource.navigation),
      })),
      entitySets: parsed.entitySets,
    });
    return;
  }

  if (command === 'resource') {
    const resourceName = requireArg('resource');
    const type = arg('type', 'all');
    const { parsed } = await client.metadata();
    const resource = Object.values(parsed.resources).find((r) => r.name.toLowerCase() === resourceName.toLowerCase());
    if (!resource) throw new Error(`Resource not declared live: ${resourceName}`);
    const accepts = (field) => {
      if (type === 'all') return true;
      const raw = field.rawType || '';
      if (type === 'enum') return Boolean(field.enumName);
      if (type === 'string') return raw === 'Edm.String';
      if (type === 'boolean') return raw === 'Edm.Boolean';
      if (type === 'date') return raw === 'Edm.Date' || raw === 'Edm.DateTimeOffset';
      if (type === 'numeric') return ['Edm.Int32', 'Edm.Int64', 'Edm.Decimal', 'Edm.Double', 'Edm.Single'].includes(raw);
      throw new Error(`Unknown resource type filter: ${type}`);
    };
    output({
      source: 'LIVE_COTALITY',
      resource: resource.name,
      fields: Object.values(resource.fields).filter(accepts),
      relationships: Object.values(resource.navigation),
    });
    return;
  }

  if (command === 'field' || command === 'picklist') {
    const fieldName = requireArg('field');
    const resourceName = arg('resource');
    const { parsed } = await client.metadata();
    const matches = [];
    for (const resource of Object.values(parsed.resources)) {
      if (resourceName && resource.name.toLowerCase() !== resourceName.toLowerCase()) continue;
      const field = Object.values(resource.fields).find((f) => f.name.toLowerCase() === fieldName.toLowerCase());
      if (!field) continue;
      matches.push({
        resource: resource.name,
        ...field,
        picklist: field.enumName ? (parsed.enums[field.enumName] || []) : null,
      });
    }
    if (!matches.length) throw new Error(`Field not declared live: ${fieldName}${resourceName ? ` on ${resourceName}` : ''}`);
    if (command === 'picklist' && !matches.some((m) => m.enumName)) throw new Error(`${fieldName} is not an enum/picklist field.`);
    output({ source: 'LIVE_COTALITY', matches });
    return;
  }

  if (command === 'lookup') {
    const fieldName = arg('field');
    const resourceName = arg('resource');
    const lookupName = arg('lookup');
    const maxRows = intArg('max', 5000);
    const filters = [];
    const q = (s) => String(s).replace(/'/g, "''");
    if (fieldName) filters.push(`FieldName eq '${q(fieldName)}'`);
    if (resourceName) filters.push(`ResourceName eq '${q(resourceName)}'`);
    if (lookupName) filters.push(`LookupName eq '${q(lookupName)}'`);
    const result = await client.page('Lookup', {
      '$select': 'ResourceName,FieldName,LookupName,LookupValue,StandardLookupValue,LegacyODataValue,OdataOverride,Definition,SystemReferences,ModificationTimestamp',
      '$filter': filters.length ? filters.join(' and ') : undefined,
      '$orderby': 'ResourceName,FieldName,LookupName,LookupValue',
      '$top': 1000,
    }, { maxRows });
    output({ source: 'LIVE_COTALITY', ...result });
    return;
  }

  if (command === 'query' || command === 'page') {
    const resource = requireArg('resource');
    const fields = selectFields(arg('select'));
    const query = {
      '$select': fields?.join(','),
      '$filter': arg('filter'),
      '$orderby': arg('orderby'),
      '$expand': arg('expand'),
      '$top': intArg('top', 50),
      '$skip': intArg('skip', 0),
      '$count': boolArg('count') ? 'true' : undefined,
    };
    if (command === 'query') {
      const result = await client.query(resource, query);
      output({ source: 'LIVE_COTALITY', resource, result });
    } else {
      const result = await client.page(resource, query, { maxRows: intArg('max', 5000) });
      output({ source: 'LIVE_COTALITY', ...result });
    }
    return;
  }

  if (command === 'probeField') {
    const resourceName = requireArg('resource');
    const fieldName = requireArg('field');
    const { parsed } = await client.metadata();
    const resource = parsed.resources[resourceName];
    const field = resource?.fields[fieldName];
    if (!resource || !field) throw new Error(`${resourceName}.${fieldName} is not declared in live $metadata`);
    output({
      source: 'LIVE_COTALITY',
      evidence: await client.probeField(resourceName, fieldName, {
        ...field,
        __enumMembers: field.enumName ? (parsed.enums[field.enumName] || []).map((member) => member.name) : [],
      }),
    });
    return;
  }

  if (command === 'probeRelationship') {
    const resourceName = requireArg('resource');
    const relationship = requireArg('relationship');
    const { parsed } = await client.metadata();
    const declared = parsed.resources[resourceName]?.navigation?.[relationship];
    if (!declared) throw new Error(`${resourceName}.${relationship} is not a declared live relationship`);
    output({ source: 'LIVE_COTALITY', declared, evidence: await client.probeRelationship(resourceName, relationship) });
    return;
  }

  if (command === 'dataSystem') {
    output({ source: 'LIVE_COTALITY', ...(await client.dataSystem()) });
    return;
  }

  if (command === 'service') {
    output({ source: 'LIVE_COTALITY', result: await client.serviceDocument() });
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  const body = {
    source: 'LIVE_COTALITY',
    state: 'UNVERIFIED',
    httpStatus: error?.status ?? null,
    error: error?.body || error?.message || String(error),
  };
  process.stderr.write(JSON.stringify(body, null, 2) + '\n');
  process.exit(2);
});
