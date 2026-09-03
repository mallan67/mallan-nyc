#!/usr/bin/env node
// Reproducible MCP/live-reader smoke proof.
// Uses the SAME query-live entrypoint the MCP invokes; no duplicate XML parser,
// no saved metadata and no hard-coded resource/field counts.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const cli = path.resolve(root, 'scripts/cotality/query-live.mjs');

async function run(command, args = []) {
  const { stdout } = await execFileAsync(process.execPath, [cli, command, ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

try {
  const census = await run('census');
  const property = census.resources?.find((r) => r.resource === 'Property');
  if (!property || property.fields <= 0) throw new Error('live Property resource/fields unavailable');

  const status = await run('picklist', ['--resource=Property', '--field=StandardStatus']);
  const statusMatch = status.matches?.[0];
  if (!statusMatch?.picklist?.length) throw new Error('live Property.StandardStatus picklist unavailable');

  const listingKey = await run('probeField', ['--resource=Property', '--field=ListingKey']);
  if (listingKey.evidence?.select?.state !== 'SUPPORTED') throw new Error('Property.ListingKey select is not live-supported');

  console.log(JSON.stringify({
    state: 'VERIFIED_LIVE',
    resources: census.resourceCount,
    fields: census.fieldCount,
    propertyFields: property.fields,
    standardStatusMembers: statusMatch.picklist.length,
    listingKeySelect: listingKey.evidence.select.state,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    state: 'UNVERIFIED',
    error: error?.stderr || error?.message || String(error),
  }, null, 2));
  process.exit(2);
}
